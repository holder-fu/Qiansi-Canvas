import { strFromU8, unzip } from 'fflate';
import {
  MAX_LOCAL_CANVAS_SKILLS,
  parseLocalCanvasSkill,
  type LocalCanvasSkill,
  type LocalCanvasSkillResource,
} from './localCanvasSkills';

export interface LocalCanvasSkillPackageFile {
  path: string;
  content: string;
}

export interface LocalCanvasSkillGroup {
  id: string;
  name: string;
  skillIds: string[];
}

const MAX_PACKAGE_FILE_SIZE = 512 * 1024;
const MAX_PACKAGE_ARCHIVE_SIZE = 16 * 1024 * 1024;
const MAX_PACKAGE_EXPANDED_SIZE = 8 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES = 512;
const MAX_PACKAGE_SKILLS = 100;
const MAX_RESOURCES_PER_SKILL = 24;
const MAX_RESOURCE_CONTEXT_SIZE = 128 * 1024;
const MAX_STORED_SKILL_CONTEXT_SIZE = 1536 * 1024;
export const MAX_SCHEDULED_CANVAS_SKILLS = 6;

/** Group persisted Skills by their imported package/folder, while keeping standalone files separate. */
export function groupLocalCanvasSkills(skills: LocalCanvasSkill[]): LocalCanvasSkillGroup[] {
  const groups = new Map<string, LocalCanvasSkillGroup>();
  for (const skill of skills) {
    const id = skill.packageId ?? `local-skill-file-${skill.id}`;
    const existing = groups.get(id);
    if (existing) {
      existing.skillIds.push(skill.id);
      continue;
    }
    groups.set(id, {
      id,
      name: skill.packageName?.trim() || skill.name,
      skillIds: [skill.id],
    });
  }
  return Array.from(groups.values());
}

const TEXT_RESOURCE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.toml',
]);

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function fileExtension(path: string) {
  const fileName = path.split('/').at(-1) ?? '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

function isSkillFilePath(path: string) {
  return (path.split('/').at(-1) ?? '').toLowerCase() === 'skill.md';
}

function isTextResourcePath(path: string) {
  return TEXT_RESOURCE_EXTENSIONS.has(fileExtension(path));
}

function isExecutableResourcePath(path: string) {
  return path
    .toLowerCase()
    .split('/')
    .some((segment) => segment === 'scripts' || segment === 'bin');
}

function isArchivedSkillPath(path: string) {
  return path
    .toLowerCase()
    .split('/')
    .some((segment) =>
      ['archive', 'archived', 'archived-skills', 'archived-execution-skills'].includes(segment),
    );
}

export function normalizeLocalSkillPackagePath(rawPath: string): string {
  const source = rawPath.replaceAll('\\', '/').trim();
  if (
    !source ||
    source.includes('\0') ||
    source.startsWith('/') ||
    /^[a-z]:/iu.test(source) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(source)
  ) {
    throw new Error('Skill 包包含无效的文件路径。');
  }
  const segments: string[] = [];
  for (const segment of source.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') throw new Error('Skill 包路径不能离开包目录。');
    segments.push(segment);
  }
  if (!segments.length) throw new Error('Skill 包包含无效的文件路径。');
  return segments.join('/');
}

function resolveLocalSkillResourcePath(basePath: string, rawTarget: string) {
  const withoutSuffix = rawTarget.trim().split(/[?#]/u, 1)[0] ?? '';
  if (!withoutSuffix || /^[a-z][a-z0-9+.-]*:/iu.test(withoutSuffix)) return null;
  let decoded = withoutSuffix;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return null;
  }
  decoded = decoded.replaceAll('\\', '/');
  if (decoded.startsWith('/') || /^[a-z]:/iu.test(decoded)) return null;
  const segments = basePath.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function relativeResourceCandidates(source: string) {
  const candidates = new Set<string>();
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu)) {
    if (match[1]) candidates.add(match[1]);
  }
  for (const match of source.matchAll(/`((?:\.{0,2}\/)?(?:references|assets)\/[^`]+)`/giu)) {
    if (match[1]) candidates.add(match[1]);
  }
  return candidates;
}

function resolveSkillResources(
  skillPath: string,
  instructions: string,
  files: Map<string, string>,
): LocalCanvasSkillResource[] {
  const resources: LocalCanvasSkillResource[] = [];
  const visited = new Set<string>();
  const queue = Array.from(relativeResourceCandidates(instructions)).map((target) => ({
    basePath: skillPath,
    target,
  }));
  let totalSize = 0;

  while (queue.length && resources.length < MAX_RESOURCES_PER_SKILL) {
    const next = queue.shift();
    if (!next) break;
    const path = resolveLocalSkillResourcePath(next.basePath, next.target);
    if (
      !path ||
      visited.has(path) ||
      isSkillFilePath(path) ||
      isExecutableResourcePath(path) ||
      !isTextResourcePath(path)
    ) {
      continue;
    }
    visited.add(path);
    const content = files.get(path);
    if (content === undefined) continue;
    if (totalSize + content.length > MAX_RESOURCE_CONTEXT_SIZE) break;
    totalSize += content.length;
    resources.push({ path, content });
    relativeResourceCandidates(content).forEach((target) => queue.push({ basePath: path, target }));
  }
  return resources;
}

function commonRootSegment(paths: string[]) {
  const firstSegments = new Set(paths.map((path) => path.split('/')[0]).filter(Boolean));
  if (firstSegments.size !== 1 || paths.some((path) => !path.includes('/'))) return null;
  return Array.from(firstSegments)[0];
}

function sanitizePackageName(value: string) {
  return (
    value
      .replace(/\.zip$/iu, '')
      .trim()
      .slice(0, 100) || '本地 Skill 包'
  );
}

export function parseLocalCanvasSkillPackage(
  rawPackageName: string,
  rawFiles: LocalCanvasSkillPackageFile[],
): LocalCanvasSkill[] {
  if (!rawFiles.length) throw new Error('Skill 包为空。');
  if (rawFiles.length > MAX_PACKAGE_ENTRIES) throw new Error('Skill 包文件过多，请拆分后导入。');

  const normalizedFiles = rawFiles.map((file) => ({
    path: normalizeLocalSkillPackagePath(file.path),
    content: file.content,
  }));
  const root = commonRootSegment(normalizedFiles.map((file) => file.path));
  const files = new Map<string, string>();
  let expandedSize = 0;
  for (const file of normalizedFiles) {
    const path = root ? file.path.slice(root.length + 1) : file.path;
    if (!path || files.has(path)) throw new Error('Skill 包包含重复或无效的文件路径。');
    if (file.content.length > MAX_PACKAGE_FILE_SIZE) {
      throw new Error(`Skill 包文件过大：${path}`);
    }
    expandedSize += file.content.length;
    if (expandedSize > MAX_PACKAGE_EXPANDED_SIZE) throw new Error('Skill 包解压后超过 8 MB。');
    files.set(path, file.content);
  }

  const skillPaths = Array.from(files.keys())
    .filter((path) => isSkillFilePath(path) && !isArchivedSkillPath(path))
    .sort();
  if (!skillPaths.length) throw new Error('Skill 包中没有找到 SKILL.md。');
  if (skillPaths.length > MAX_PACKAGE_SKILLS)
    throw new Error('Skill 包中的 Skill 数量超过 100 个。');

  const packageName = sanitizePackageName(root ?? rawPackageName);
  const packageId = `local-skill-package-${stableHash(packageName.toLowerCase())}`;
  return skillPaths.map((skillPath) =>
    parseLocalCanvasSkill(skillPath, files.get(skillPath) ?? '', {
      id: `${packageId}-${stableHash(skillPath.toLowerCase())}`,
      packageId,
      packageName,
      relativePath: skillPath,
      resources: resolveSkillResources(skillPath, files.get(skillPath) ?? '', files),
    }),
  );
}

export async function parseLocalCanvasSkillFolder(files: File[]): Promise<LocalCanvasSkill[]> {
  const accepted: LocalCanvasSkillPackageFile[] = [];
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (!isSkillFilePath(path) && !isTextResourcePath(path)) continue;
    if (file.size > MAX_PACKAGE_FILE_SIZE) throw new Error(`Skill 包文件过大：${path}`);
    accepted.push({ path, content: await file.text() });
  }
  const packageName = files[0]?.webkitRelativePath.split('/')[0] || '本地 Skill 包';
  return parseLocalCanvasSkillPackage(packageName, accepted);
}

export async function parseLocalCanvasSkillArchive(
  fileName: string,
  bytes: Uint8Array,
): Promise<LocalCanvasSkill[]> {
  if (bytes.byteLength > MAX_PACKAGE_ARCHIVE_SIZE) throw new Error('Skill ZIP 不能超过 16 MB。');
  let entryCount = 0;
  let expandedSize = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(
        bytes,
        {
          filter: (entry) => {
            if (entry.name.endsWith('/')) return false;
            entryCount += 1;
            if (entryCount > MAX_PACKAGE_ENTRIES) {
              throw new Error('Skill ZIP 文件过多，请拆分后导入。');
            }
            const path = normalizeLocalSkillPackagePath(entry.name);
            if (!isSkillFilePath(path) && !isTextResourcePath(path)) return false;
            if (entry.originalSize > MAX_PACKAGE_FILE_SIZE) {
              throw new Error(`Skill 包文件过大：${path}`);
            }
            expandedSize += entry.originalSize;
            if (expandedSize > MAX_PACKAGE_EXPANDED_SIZE) {
              throw new Error('Skill 包解压后超过 8 MB。');
            }
            return true;
          },
        },
        (error, data) => {
          if (error) reject(error);
          else resolve(data);
        },
      );
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Skill ZIP 无法读取。');
  }
  return parseLocalCanvasSkillPackage(
    fileName,
    Object.entries(entries).map(([path, content]) => ({ path, content: strFromU8(content) })),
  );
}

function normalizedSearchTerms(query: string) {
  const normalized = query.toLowerCase();
  const terms = new Set(normalized.match(/[a-z0-9][a-z0-9_-]{1,}|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const segment of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      terms.add(segment.slice(index, index + 2));
    }
  }
  return Array.from(terms);
}

/** Select a bounded relevant subset while keeping explicit activation order deterministic. */
export function scheduleLocalCanvasSkills(
  skills: LocalCanvasSkill[],
  activeSkillIds: Iterable<string>,
  query: string,
  limit = MAX_SCHEDULED_CANVAS_SKILLS,
): LocalCanvasSkill[] {
  const active = new Set(activeSkillIds);
  const candidates = skills.filter((skill) => active.has(skill.id));
  if (candidates.length <= limit) return candidates;
  const terms = normalizedSearchTerms(query);
  return candidates
    .map((skill, index) => {
      const title = `${skill.name} ${skill.description}`.toLowerCase();
      const body = skill.instructions.slice(0, 4_000).toLowerCase();
      const score = terms.reduce(
        (total, term) => total + (title.includes(term) ? 8 : 0) + (body.includes(term) ? 2 : 0),
        0,
      );
      return { skill, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ skill }) => skill);
}

export function mergeLocalCanvasSkills(
  current: LocalCanvasSkill[],
  imported: LocalCanvasSkill[],
): LocalCanvasSkill[] {
  const importedIds = new Set(imported.map((skill) => skill.id));
  const merged: LocalCanvasSkill[] = [];
  let storedSize = 0;
  for (const skill of [...imported, ...current.filter((item) => !importedIds.has(item.id))]) {
    const skillSize =
      skill.instructions.length +
      (skill.resources ?? []).reduce(
        (total, resource) => total + resource.path.length + resource.content.length,
        0,
      );
    if (
      merged.length >= MAX_LOCAL_CANVAS_SKILLS ||
      storedSize + skillSize > MAX_STORED_SKILL_CONTEXT_SIZE
    ) {
      continue;
    }
    storedSize += skillSize;
    merged.push(skill);
  }
  return merged;
}
