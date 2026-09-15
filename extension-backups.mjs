import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const EXTENSION_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const BACKUP_ID_RE = /^\d{8}T\d{6}\.\d{3}Z-[a-f0-9]{8}$/;
const MAX_BACKUP_FILES = 500;
const MAX_BACKUP_BYTES = 128 * 1024 * 1024;

function safeExtensionId(value) {
  const id = String(value || '').trim();
  if (!EXTENSION_ID_RE.test(id)) throw new Error('扩展 ID 格式无效。');
  return id;
}

function safeBackupId(value) {
  const id = String(value || '').trim();
  if (!BACKUP_ID_RE.test(id)) throw new Error('备份 ID 格式无效。');
  return id;
}

function assertInside(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${sep}`)) {
    throw new Error('扩展路径超出受管目录。');
  }
  return targetPath;
}

async function collectFiles(root, directory = root, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = assertInside(root, join(directory, entry.name));
    if (entry.isSymbolicLink()) throw new Error('扩展目录不能包含符号链接。');
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    files.push({ absolute, relative: relative(root, absolute), size: info.size });
    if (files.length > MAX_BACKUP_FILES) throw new Error('扩展文件数量超过备份上限。');
    if (files.reduce((sum, item) => sum + item.size, 0) > MAX_BACKUP_BYTES) {
      throw new Error('扩展文件总大小超过 128 MB，无法自动备份。');
    }
  }
  return files;
}

function backupId() {
  return `${new Date().toISOString().replace(/[-:]/g, '')}-${randomUUID().slice(0, 8)}`;
}

async function fileDigest(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

export async function createExtensionBackup({
  sourceDirectory,
  backupRoot,
  kind,
  id: rawId,
  version = '',
}) {
  const id = safeExtensionId(rawId);
  try {
    if (!(await stat(sourceDirectory)).isDirectory()) return null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const idRoot = assertInside(backupRoot, join(backupRoot, id));
  const idValue = backupId();
  const directory = assertInside(idRoot, join(idRoot, idValue));
  const filesDirectory = join(directory, 'files');
  await mkdir(filesDirectory, { recursive: true });
  try {
    const files = await collectFiles(sourceDirectory);
    const manifestFiles = [];
    for (const file of files) {
      const destination = assertInside(filesDirectory, join(filesDirectory, file.relative));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file.absolute, destination);
      manifestFiles.push({
        path: file.relative.replaceAll('\\', '/'),
        size: file.size,
        sha256: await fileDigest(destination),
      });
    }
    const manifest = {
      schemaVersion: 1,
      kind,
      id,
      backupId: idValue,
      version: String(version || '').slice(0, 80),
      createdAt: new Date().toISOString(),
      files: manifestFiles,
    };
    await writeFile(
      join(directory, 'restore-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
    return manifest;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function readBackupManifest(backupRoot, kind, id, idValue) {
  const directory = assertInside(backupRoot, join(backupRoot, id, idValue));
  const value = JSON.parse(await readFile(join(directory, 'restore-manifest.json'), 'utf8'));
  if (
    value?.schemaVersion !== 1 ||
    value.kind !== kind ||
    value.id !== id ||
    value.backupId !== idValue ||
    !Array.isArray(value.files)
  ) {
    throw new Error('扩展备份清单无效。');
  }
  return { directory, manifest: value };
}

export async function listExtensionBackups({ backupRoot, kind }) {
  await mkdir(backupRoot, { recursive: true });
  const summaries = [];
  for (const idEntry of await readdir(backupRoot, { withFileTypes: true })) {
    if (!idEntry.isDirectory() || !EXTENSION_ID_RE.test(idEntry.name)) continue;
    const idRoot = join(backupRoot, idEntry.name);
    for (const backupEntry of await readdir(idRoot, { withFileTypes: true })) {
      if (!backupEntry.isDirectory() || !BACKUP_ID_RE.test(backupEntry.name)) continue;
      try {
        const { manifest } = await readBackupManifest(
          backupRoot,
          kind,
          idEntry.name,
          backupEntry.name,
        );
        summaries.push({
          id: manifest.id,
          backupId: manifest.backupId,
          version: String(manifest.version || ''),
          createdAt: String(manifest.createdAt || ''),
          fileCount: manifest.files.length,
        });
      } catch {
        // Ignore damaged backup folders; restore will never use an unvalidated entry.
      }
    }
  }
  return summaries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function restoreExtensionBackup({
  destinationRoot,
  backupRoot,
  kind,
  id: rawId,
  backupId: rawBackupId,
}) {
  const id = safeExtensionId(rawId);
  const idValue = safeBackupId(rawBackupId);
  const { directory, manifest } = await readBackupManifest(backupRoot, kind, id, idValue);
  const filesDirectory = join(directory, 'files');
  const destination = assertInside(destinationRoot, join(destinationRoot, id));
  const temporary = assertInside(
    destinationRoot,
    join(destinationRoot, `.restore-${id}-${randomUUID()}`),
  );
  await mkdir(temporary, { recursive: true });
  try {
    for (const file of manifest.files) {
      const pathSegments = typeof file?.path === 'string' ? file.path.split('/') : [];
      if (
        !file ||
        typeof file.path !== 'string' ||
        pathSegments.length === 0 ||
        pathSegments.some((segment) => !segment || segment === '.' || segment === '..')
      ) {
        throw new Error('扩展备份包含无效文件路径。');
      }
      const source = assertInside(filesDirectory, join(filesDirectory, file.path));
      const digest = await fileDigest(source);
      if (digest !== file.sha256) throw new Error(`扩展备份文件校验失败：${file.path}`);
      const target = assertInside(temporary, join(temporary, file.path));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    try {
      await stat(destination);
      throw new Error('扩展仍然存在，无法直接恢复。');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rename(temporary, destination);
    return manifest;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
