import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const MAX_PLUGIN_STYLE_SAMPLE_BYTES = 8 * 1024 * 1024;

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SAMPLE_FILE_RE = /^sample-\d{8}T\d{9,12}Z-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
const MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function matchesSignature(bytes, mimeType) {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function decodeStyleSampleBase64(value) {
  const encoded = String(value || '');
  if (!encoded || encoded.length > 11_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('风格样图不是有效的 Base64 数据。');
  }
  const bytes = Buffer.from(encoded, 'base64');
  const canonical = bytes.toString('base64').replace(/=+$/, '');
  if (canonical !== encoded.replace(/=+$/, '')) throw new Error('风格样图不是有效的 Base64 数据。');
  return bytes;
}

function isInside(root, target) {
  const child = relative(root, target);
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child);
}

async function registeredStylePack(pluginDirectory, packId) {
  if (!PACK_ID_RE.test(packId)) throw new Error('风格标识格式无效。');
  const pluginRoot = resolve(pluginDirectory);
  const catalogPath = join(pluginRoot, 'style-catalog.json');
  const catalogBytes = await readFile(catalogPath);
  if (catalogBytes.length > 1024 * 1024) throw new Error('风格目录超过 1 MiB 安全限制。');
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const registered = Array.isArray(catalog?.styles)
    && catalog.styles.some((item) => item?.pack_id === packId && item?.status === 'active');
  if (!registered) throw new Error('风格不存在或未启用。');
  const stylePackRoot = await realpath(resolve(pluginRoot, '.agents', 'style-packs'));
  const packRoot = await realpath(resolve(stylePackRoot, packId));
  if (!isInside(stylePackRoot, packRoot)) {
    throw new Error('风格样图路径越过风格库目录。');
  }
  const packMarker = await lstat(join(packRoot, 'style-pack.yaml'));
  if (!packMarker.isFile() || packMarker.isSymbolicLink()) throw new Error('对应风格包目录无效。');
  return { pluginRoot, packRoot };
}

async function styleSampleDirectory(packRoot, { create = false } = {}) {
  const directory = join(packRoot, 'assets', 'style-samples');
  if (create) await mkdir(directory, { recursive: true });
  let resolved;
  try {
    resolved = await realpath(directory);
  } catch (error) {
    if (!create && error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!isInside(packRoot, resolved)) throw new Error('风格样图路径越过对应风格包目录。');
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('风格样图目录不能使用符号链接。');
  return resolved;
}

function publicSample(packId, fileName, mimeType, bytes, details) {
  return {
    fileName,
    mimeType,
    base64: bytes.toString('base64'),
    relativePath: `.agents/style-packs/${packId}/assets/style-samples/${fileName}`,
    uploadedAt: details.mtime.toISOString(),
  };
}

export async function readLatestPluginStyleSample(pluginDirectory, packIdValue) {
  const packId = String(packIdValue || '').trim();
  const { packRoot } = await registeredStylePack(pluginDirectory, packId);
  const directory = await styleSampleDirectory(packRoot);
  if (!directory) return null;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const candidates = entries.filter((entry) => entry.isFile() && SAMPLE_FILE_RE.test(entry.name));
  if (candidates.length === 0) return null;
  const inspected = await Promise.all(candidates.map(async (entry) => ({
    name: entry.name,
    details: await stat(join(directory, entry.name)),
  })));
  inspected.sort((left, right) => right.details.mtimeMs - left.details.mtimeMs || right.name.localeCompare(left.name));
  const latest = inspected[0];
  const bytes = await readFile(join(directory, latest.name));
  if (!bytes.length || bytes.length > MAX_PLUGIN_STYLE_SAMPLE_BYTES) throw new Error('已保存的风格样图大小无效。');
  const extension = latest.name.slice(latest.name.lastIndexOf('.'));
  const mimeType = [...MIME_EXTENSIONS].find(([, value]) => value === extension)?.[0];
  if (!mimeType || !matchesSignature(bytes, mimeType)) throw new Error('已保存的风格样图格式无效。');
  return publicSample(packId, latest.name, mimeType, bytes, latest.details);
}

export async function uploadPluginStyleSample(pluginDirectory, request) {
  const packId = String(request?.packId || '').trim();
  const mimeType = String(request?.mimeType || '').trim().toLowerCase();
  const extension = MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new Error('仅支持 PNG、JPEG 或 WebP 风格样图。');
  const bytes = decodeStyleSampleBase64(request?.base64);
  if (!bytes.length || bytes.length > MAX_PLUGIN_STYLE_SAMPLE_BYTES) throw new Error('风格样图不能超过 8 MiB。');
  if (!matchesSignature(bytes, mimeType)) throw new Error('风格样图内容与声明格式不一致。');
  const { packRoot } = await registeredStylePack(pluginDirectory, packId);
  const directory = await styleSampleDirectory(packRoot, { create: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const fileName = `sample-${stamp}-${digest}${extension}`;
  const target = join(directory, fileName);
  const handle = await open(target, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return publicSample(packId, fileName, mimeType, bytes, await stat(target));
}
