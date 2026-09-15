import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const DOCUMENT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MAX_DOCUMENT_JSON_BYTES = 16 * 1024 * 1024;
const MAX_PUBLIC_DOCUMENTS = 64;
const MAX_HOST_DOCUMENTS = 512;
const HOST_KEY_PREFIX = 'qiansi-host:';
const RECORD_SCHEMA = 'qiansi-plugin-project-document/v1';
const MIGRATION_SCHEMA = 'qiansi-plugin-project-document-migration/v1';

export class PluginFileDocumentConflictError extends Error {
  constructor(currentRevision) {
    super(`插件文档已被其他页面更新（当前 v${currentRevision}）。`);
    this.name = 'PluginFileDocumentConflictError';
    this.code = 'PLUGIN_DOCUMENT_REVISION_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

function validatedIdentity(pluginId, projectId, key) {
  if (!PLUGIN_ID_RE.test(pluginId)) throw new Error('插件 ID 无效。');
  if (!PROJECT_ID_RE.test(projectId)) throw new Error('当前画布项目 ID 无效。');
  if (key !== undefined && !DOCUMENT_KEY_RE.test(key)) {
    throw new Error('插件文档键必须是 1 到 120 位字母、数字、点、下划线、冒号或连字符。');
  }
  return { pluginId, projectId, ...(key === undefined ? {} : { key }) };
}

function serializedDocument(value) {
  if (value === undefined) throw new Error('插件文档内容不能为空。');
  let json = '';
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error('插件文档必须是可序列化的 JSON 数据。');
  }
  if (!json || Buffer.byteLength(json, 'utf8') > MAX_DOCUMENT_JSON_BYTES) {
    throw new Error('单个插件文档不能超过 16 MiB。');
  }
  return json;
}

function parsedSnapshot(record) {
  let value;
  try {
    value = JSON.parse(record.json);
  } catch {
    throw new Error('插件项目文档已损坏；原文件已保留，未执行覆盖。');
  }
  return {
    key: record.key,
    value,
    revision: record.revision,
    updatedAt: record.updatedAt,
  };
}

function assertStoredRecord(record, identity) {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    record.schema !== RECORD_SCHEMA ||
    record.pluginId !== identity.pluginId ||
    record.projectId !== identity.projectId ||
    record.key !== identity.key ||
    typeof record.json !== 'string' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    !Number.isSafeInteger(record.updatedAt) ||
    record.updatedAt < 1
  ) {
    throw new Error('插件项目文档文件已损坏；原文件已保留，未执行覆盖。');
  }
  if (Buffer.byteLength(record.json, 'utf8') > MAX_DOCUMENT_JSON_BYTES) {
    throw new Error('插件项目文档文件超过 16 MiB；原文件已保留，未执行覆盖。');
  }
  return record;
}

async function readJsonFile(pathname) {
  try {
    return JSON.parse(await readFile(pathname, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new Error('插件项目文档文件已损坏；原文件已保留，未执行覆盖。');
    }
    throw error;
  }
}

async function atomicWriteJson(pathname, value) {
  const directory = resolve(pathname, '..');
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, pathname);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function acquireFileLock(pathname) {
  await mkdir(resolve(pathname, '..'), { recursive: true });
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(pathname, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: Date.now() }));
      } finally {
        await handle.close();
      }
      return async () => {
        try {
          const owner = JSON.parse(await readFile(pathname, 'utf8'));
          if (owner?.token === token) await rm(pathname, { force: true });
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const [ownerText, info] = await Promise.all([readFile(pathname, 'utf8'), stat(pathname)]);
        let owner = null;
        try {
          owner = JSON.parse(ownerText);
        } catch {
          owner = null;
        }
        if (Date.now() - info.mtimeMs > 30_000 && !processIsRunning(Number(owner?.pid))) {
          await rm(pathname, { force: true });
          continue;
        }
      } catch (inspectionError) {
        if (inspectionError?.code !== 'ENOENT') throw inspectionError;
      }
      await delay(25);
    }
  }
  throw new Error('插件项目文档正被另一进程写入，请稍后重试。');
}

export class PluginProjectDocumentFileStore {
  constructor({ pluginsRoot }) {
    this.pluginsRoot = resolve(pluginsRoot);
    this.locks = new Map();
    this.pluginDirectories = new Map();
  }

  async registerPluginDirectory(pluginId, directory) {
    validatedIdentity(pluginId, 'directory-check');
    const normalized = resolve(directory);
    const child = relative(this.pluginsRoot, normalized);
    if (!child || child.startsWith('..') || child.includes('/') || child.includes('\\')) {
      throw new Error('插件目录超出受管插件根目录。');
    }
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(normalized, 'plugin.json'), 'utf8'));
    } catch {
      throw new Error('插件目录缺少有效清单。');
    }
    if (manifest?.id !== pluginId) throw new Error('插件目录与插件 ID 不匹配。');
    this.pluginDirectories.set(pluginId, normalized);
  }

  #scopeDirectory(pluginId, projectId) {
    validatedIdentity(pluginId, projectId);
    const pluginDirectory =
      this.pluginDirectories.get(pluginId) ?? resolve(this.pluginsRoot, pluginId);
    const directory = resolve(pluginDirectory, 'project-data', projectId);
    if (!directory.startsWith(`${pluginDirectory}${sep}`)) throw new Error('插件项目目录无效。');
    return directory;
  }

  #documentPath(pluginId, projectId, key) {
    validatedIdentity(pluginId, projectId, key);
    const digest = createHash('sha256').update(key, 'utf8').digest('hex');
    return join(this.#scopeDirectory(pluginId, projectId), 'documents', `${digest}.json`);
  }

  #migrationPath(pluginId, projectId) {
    return join(this.#scopeDirectory(pluginId, projectId), 'indexeddb-v1-migrated.json');
  }

  #lockPath(pluginId, projectId) {
    return join(this.#scopeDirectory(pluginId, projectId), '.project-documents.lock');
  }

  async #withLock(identity, lockPath, operation) {
    const previous = this.locks.get(identity) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        const release = await acquireFileLock(lockPath);
        try {
          return await operation();
        } finally {
          await release();
        }
      });
    this.locks.set(identity, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(identity) === current) this.locks.delete(identity);
    }
  }

  async #readRecord(pluginId, projectId, key) {
    const identity = validatedIdentity(pluginId, projectId, key);
    const record = await readJsonFile(this.#documentPath(pluginId, projectId, key));
    return record ? assertStoredRecord(record, identity) : null;
  }

  async #documentCounts(pluginId, projectId) {
    const directory = join(this.#scopeDirectory(pluginId, projectId), 'documents');
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return { host: 0, public: 0 };
      throw error;
    }
    let host = 0;
    let publicCount = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
      const raw = await readJsonFile(join(directory, entry.name));
      if (!raw || raw.schema !== RECORD_SCHEMA || typeof raw.key !== 'string') {
        throw new Error('插件项目文档目录包含损坏文件；未执行写入。');
      }
      if (raw.key.startsWith(HOST_KEY_PREFIX)) host += 1;
      else publicCount += 1;
    }
    return { host, public: publicCount };
  }

  async read(pluginId, projectId, key) {
    const record = await this.#readRecord(pluginId, projectId, key);
    return record ? parsedSnapshot(record) : null;
  }

  async write(pluginId, projectId, key, value, expectedRevision) {
    const identity = validatedIdentity(pluginId, projectId, key);
    const json = serializedDocument(value);
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new Error('插件文档预期修订号无效。');
    }
    const lockKey = `${pluginId}\u0000${projectId}`;
    return this.#withLock(lockKey, this.#lockPath(pluginId, projectId), async () => {
      const current = await this.#readRecord(pluginId, projectId, key);
      const currentRevision = current?.revision ?? 0;
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        throw new PluginFileDocumentConflictError(currentRevision);
      }
      if (!current) {
        const counts = await this.#documentCounts(pluginId, projectId);
        const hostDocument = key.startsWith(HOST_KEY_PREFIX);
        const count = hostDocument ? counts.host : counts.public;
        const maximum = hostDocument ? MAX_HOST_DOCUMENTS : MAX_PUBLIC_DOCUMENTS;
        if (count >= maximum) {
          throw new Error(
            hostDocument
              ? `每个插件在每个画布项目中最多保存 ${MAX_HOST_DOCUMENTS} 个宿主收据。`
              : `每个插件在每个画布项目中最多保存 ${MAX_PUBLIC_DOCUMENTS} 个文档。`,
          );
        }
      }
      const record = {
        schema: RECORD_SCHEMA,
        ...identity,
        json,
        revision: currentRevision + 1,
        updatedAt: Date.now(),
      };
      await atomicWriteJson(this.#documentPath(pluginId, projectId, key), record);
      return parsedSnapshot(record);
    });
  }

  async delete(pluginId, projectId, key, expectedRevision) {
    validatedIdentity(pluginId, projectId, key);
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new Error('插件文档预期修订号无效。');
    }
    const lockKey = `${pluginId}\u0000${projectId}`;
    return this.#withLock(lockKey, this.#lockPath(pluginId, projectId), async () => {
      const current = await this.#readRecord(pluginId, projectId, key);
      if (!current) return { deleted: false };
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new PluginFileDocumentConflictError(current.revision);
      }
      await rm(this.#documentPath(pluginId, projectId, key));
      return { deleted: true };
    });
  }

  async migrationStatus(pluginId, projectId) {
    validatedIdentity(pluginId, projectId);
    const marker = await readJsonFile(this.#migrationPath(pluginId, projectId));
    return {
      completed:
        marker?.schema === MIGRATION_SCHEMA &&
        marker.pluginId === pluginId &&
        marker.projectId === projectId,
    };
  }

  async migrate(pluginId, projectId, snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('待迁移插件文档无效。');
    }
    const key = snapshot.key;
    const identity = validatedIdentity(pluginId, projectId, key);
    const json = serializedDocument(snapshot.value);
    const revision = Number(snapshot.revision);
    const updatedAt = Number(snapshot.updatedAt);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('待迁移修订号无效。');
    if (!Number.isSafeInteger(updatedAt) || updatedAt < 1) throw new Error('待迁移时间无效。');
    const lockKey = `${pluginId}\u0000${projectId}`;
    return this.#withLock(lockKey, this.#lockPath(pluginId, projectId), async () => {
      const current = await this.#readRecord(pluginId, projectId, key);
      if (current) return { migrated: false, snapshot: parsedSnapshot(current) };
      const counts = await this.#documentCounts(pluginId, projectId);
      const hostDocument = key.startsWith(HOST_KEY_PREFIX);
      const count = hostDocument ? counts.host : counts.public;
      const maximum = hostDocument ? MAX_HOST_DOCUMENTS : MAX_PUBLIC_DOCUMENTS;
      if (count >= maximum) throw new Error('插件项目文档数量超过迁移上限。');
      const record = { schema: RECORD_SCHEMA, ...identity, json, revision, updatedAt };
      await atomicWriteJson(this.#documentPath(pluginId, projectId, key), record);
      return { migrated: true, snapshot: parsedSnapshot(record) };
    });
  }

  async completeMigration(pluginId, projectId, recordCount = 0) {
    validatedIdentity(pluginId, projectId);
    if (!Number.isSafeInteger(recordCount) || recordCount < 0 || recordCount > 576) {
      throw new Error('插件项目文档迁移数量无效。');
    }
    const lockKey = `${pluginId}\u0000${projectId}`;
    return this.#withLock(lockKey, this.#lockPath(pluginId, projectId), async () => {
      await atomicWriteJson(this.#migrationPath(pluginId, projectId), {
        schema: MIGRATION_SCHEMA,
        pluginId,
        projectId,
        recordCount,
        migratedAt: Date.now(),
      });
      return { completed: true, recordCount };
    });
  }
}
