import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const MEDIA_MIN_AGE_MS = 15 * 60 * 1000;
const ORPHAN_ASSET_MIN_AGE_MS = 60 * 60 * 1000;
const PREVIEW_DIRECTORIES = Object.freeze(['asset-library/previews', 'media-preview-cache']);

const SCOPE_META = Object.freeze({
  preview: { directories: PREVIEW_DIRECTORIES, label: '未引用预览缓存' },
  output: { directory: 'cli-image-output', label: '未引用生成输出' },
  assetOrphan: { directory: 'asset-library/files', label: '素材索引孤儿' },
  temporary: { directory: '', label: '过期临时文件' },
});

const PREVIEW_FILE_RE = /^(?:preview_[A-Za-z0-9_-]{12,80}|[a-f0-9]{32})\.webp$/i;
const OUTPUT_FILE_RE = /^[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|ogg)$/i;
const TEMPORARY_FILE_RE = /(?:\.upload|\.tmp\.webp)$/i;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg']);

function addReferences(text, references, { includeAssetIds = true } = {}) {
  if (!text) return;
  for (const match of text.matchAll(/\/media-preview\/files\/([A-Za-z0-9_-]{12,80}\.webp)/gi)) {
    references.preview.add(match[1]);
  }
  for (const match of text.matchAll(/\/output\/([A-Za-z0-9_.-]+)/gi)) {
    references.output.add(match[1]);
  }
  for (const match of text.matchAll(/cli-image-output[\\/]([A-Za-z0-9_.-]+)/gi)) {
    references.output.add(match[1]);
  }
  if (!includeAssetIds) return;
  for (const match of text.matchAll(/\/asset-library\/files\/([A-Za-z0-9_-]{6,80})/gi)) {
    references.assets.add(match[1]);
  }
  for (const match of text.matchAll(
    /["']bridgeAssetId["']\s*:\s*["']([A-Za-z0-9_-]{6,80})["']/gi,
  )) {
    references.assets.add(match[1]);
  }
}

async function addReferencesFromFile(path, references, options) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  let tail = '';
  for await (const chunk of stream) {
    const text = tail + chunk;
    addReferences(text, references, options);
    tail = text.slice(-256);
  }
}

async function walkFiles(root, visit, path = root) {
  const entries = await readdir(path, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) await walkFiles(root, visit, entryPath);
    else if (entry.isFile()) await visit(entryPath, entry.name);
  }
}

async function collectPersistentReferences(dataRoot, liveReferences) {
  const references = { preview: new Set(), output: new Set(), assets: new Set() };
  for (const value of liveReferences) addReferences(String(value || ''), references);
  const assetIndexPath = join(dataRoot, 'asset-library', 'library.json');
  await addReferencesFromFile(assetIndexPath, references, { includeAssetIds: false }).catch(
    (error) => {
      if (error?.code !== 'ENOENT') throw error;
    },
  );
  await addReferencesFromFile(join(dataRoot, 'style-library', 'library.json'), references).catch(
    (error) => {
      if (error?.code !== 'ENOENT') throw error;
    },
  );
  for (const directory of ['settings', 'projects', 'project-archive']) {
    await walkFiles(join(dataRoot, directory), async (path, name) => {
      if (name.toLowerCase().endsWith('.json')) await addReferencesFromFile(path, references);
    });
  }
  try {
    const parsed = JSON.parse(await readFile(assetIndexPath, 'utf8'));
    if (!Array.isArray(parsed?.items)) throw new Error('素材索引格式无效。');
    for (const item of parsed.items) {
      if (!references.assets.has(String(item?.id || ''))) continue;
      const originalName = String(item?.originalName || '').trim();
      if (OUTPUT_FILE_RE.test(originalName)) references.output.add(originalName);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return references;
}

function relativeDataPath(dataRoot, path) {
  return relative(dataRoot, path).split(sep).join('/');
}

async function candidateFor(dataRoot, path, scope, now, minimumAgeMs) {
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || now - info.mtimeMs < minimumAgeMs) return null;
  return {
    relativePath: relativeDataPath(dataRoot, path),
    scope,
    size: info.size,
    mtimeMs: info.mtimeMs,
  };
}

async function indexedAssetFiles(dataRoot) {
  const indexPath = join(dataRoot, 'asset-library', 'library.json');
  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8'));
    if (!Array.isArray(parsed?.items)) throw new Error('素材索引格式无效。');
    return new Set(
      parsed.items.map((item) => String(item?.fileName || '').replace(/\\/g, '/')).filter(Boolean),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function summarize(candidates) {
  const scopes = Object.fromEntries(
    Object.entries(SCOPE_META).map(([scope, meta]) => [
      scope,
      { label: meta.label, files: 0, bytes: 0 },
    ]),
  );
  for (const candidate of candidates) {
    scopes[candidate.scope].files += 1;
    scopes[candidate.scope].bytes += candidate.size;
  }
  return {
    files: candidates.length,
    bytes: candidates.reduce((sum, candidate) => sum + candidate.size, 0),
    scopes,
  };
}

export async function buildStorageCleanupPlan({
  dataRoot,
  liveReferences = [],
  now = Date.now(),
  mediaMinimumAgeMs = MEDIA_MIN_AGE_MS,
  orphanAssetMinimumAgeMs = ORPHAN_ASSET_MIN_AGE_MS,
} = {}) {
  if (!dataRoot) throw new Error('缺少数据目录。');
  const references = await collectPersistentReferences(dataRoot, liveReferences);
  const candidates = [];

  for (const directory of PREVIEW_DIRECTORIES) {
    const previewRoot = join(dataRoot, directory);
    await walkFiles(previewRoot, async (path, name) => {
      if (relative(previewRoot, path).includes(sep)) return;
      const temporary = TEMPORARY_FILE_RE.test(name);
      if (!temporary && (!PREVIEW_FILE_RE.test(name) || references.preview.has(name))) return;
      const candidate = await candidateFor(
        dataRoot,
        path,
        temporary ? 'temporary' : 'preview',
        now,
        temporary ? ORPHAN_ASSET_MIN_AGE_MS : mediaMinimumAgeMs,
      );
      if (candidate) candidates.push(candidate);
    });
  }

  const outputRoot = join(dataRoot, SCOPE_META.output.directory);
  await walkFiles(outputRoot, async (path, name) => {
    if (relative(outputRoot, path).includes(sep)) return;
    const temporary = TEMPORARY_FILE_RE.test(name);
    if (!temporary && (!OUTPUT_FILE_RE.test(name) || references.output.has(name))) return;
    const candidate = await candidateFor(
      dataRoot,
      path,
      temporary ? 'temporary' : 'output',
      now,
      temporary ? ORPHAN_ASSET_MIN_AGE_MS : mediaMinimumAgeMs,
    );
    if (candidate) candidates.push(candidate);
  });

  const assetFiles = await indexedAssetFiles(dataRoot);
  if (assetFiles) {
    const assetRoot = join(dataRoot, SCOPE_META.assetOrphan.directory);
    await walkFiles(assetRoot, async (path) => {
      const fileName = relative(assetRoot, path).split(sep).join('/');
      if (assetFiles.has(fileName)) return;
      const temporary = TEMPORARY_FILE_RE.test(fileName);
      const candidate = await candidateFor(
        dataRoot,
        path,
        temporary ? 'temporary' : 'assetOrphan',
        now,
        orphanAssetMinimumAgeMs,
      );
      if (candidate) candidates.push(candidate);
    });
  }

  candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { candidates, summary: summarize(candidates) };
}

function isAllowedCandidatePath(candidate) {
  const scopeMeta = SCOPE_META[candidate.scope];
  const prefixes = scopeMeta?.directories ?? (scopeMeta?.directory ? [scopeMeta.directory] : []);
  if (candidate.scope === 'temporary') {
    return (
      PREVIEW_DIRECTORIES.some((prefix) => candidate.relativePath.startsWith(`${prefix}/`)) ||
      candidate.relativePath.startsWith('cli-image-output/') ||
      candidate.relativePath.startsWith('asset-library/files/')
    );
  }
  return prefixes.some((prefix) => candidate.relativePath.startsWith(`${prefix}/`));
}

export async function applyStorageCleanupCandidates({ dataRoot, candidates = [] } = {}) {
  if (!dataRoot) throw new Error('缺少数据目录。');
  const root = resolve(dataRoot);
  let deletedFiles = 0;
  let deletedBytes = 0;
  let skippedFiles = 0;
  for (const candidate of candidates) {
    if (!isAllowedCandidatePath(candidate)) {
      skippedFiles += 1;
      continue;
    }
    const path = resolve(root, ...String(candidate.relativePath).split('/'));
    const pathFromRoot = relative(root, path);
    if (!pathFromRoot || pathFromRoot.startsWith('..') || pathFromRoot.includes(':')) {
      skippedFiles += 1;
      continue;
    }
    const info = await lstat(path).catch(() => null);
    if (
      !info?.isFile() ||
      info.isSymbolicLink() ||
      info.size !== candidate.size ||
      info.mtimeMs !== candidate.mtimeMs
    ) {
      skippedFiles += 1;
      continue;
    }
    await unlink(path);
    deletedFiles += 1;
    deletedBytes += info.size;
  }
  return { deletedFiles, deletedBytes, skippedFiles };
}

function describeCandidate(candidate) {
  const separator = candidate.relativePath.lastIndexOf('/');
  const name = candidate.relativePath.slice(separator + 1);
  const folder = separator > 0 ? candidate.relativePath.slice(0, separator) : '';
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() || '';
  const kind =
    candidate.scope === 'temporary'
      ? 'temporary'
      : IMAGE_EXTENSIONS.has(extension)
        ? 'image'
        : VIDEO_EXTENSIONS.has(extension)
          ? 'video'
          : AUDIO_EXTENSIONS.has(extension)
            ? 'audio'
            : 'file';
  return {
    id: candidate.relativePath,
    name,
    folder,
    relativePath: candidate.relativePath,
    extension,
    kind,
    scope: candidate.scope,
    size: candidate.size,
  };
}

export function listStorageCleanupCandidates(
  candidates,
  { scope = 'all', offset = 0, limit = 100 } = {},
) {
  const normalizedScope = scope === 'all' || SCOPE_META[scope] ? scope : 'all';
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const pageSize = Math.max(1, Math.min(200, Math.floor(Number(limit) || 100)));
  const filtered =
    normalizedScope === 'all'
      ? candidates
      : candidates.filter((candidate) => candidate.scope === normalizedScope);
  const items = filtered.slice(start, start + pageSize).map(describeCandidate);
  return {
    items,
    total: filtered.length,
    offset: start,
    hasMore: start + items.length < filtered.length,
  };
}

export const STORAGE_CLEANUP_MEDIA_MIN_AGE_MS = MEDIA_MIN_AGE_MS;
