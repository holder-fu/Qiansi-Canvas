import { resolveBridgeUrl } from '../lib/bridgeUrl';

const LEGACY_DATABASE_NAME = 'qiansi-plugin-documents-v1';
const LEGACY_OBJECT_STORE_NAME = 'documents';
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const DOCUMENT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MAX_DOCUMENT_JSON_LENGTH = 16 * 1024 * 1024;

/** Reserved for host-owned receipts that sandbox calls may not read or mutate. */
export const PLUGIN_HOST_DOCUMENT_KEY_PREFIX = 'qiansi-host:';

export class PluginDocumentConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`插件文档已被其他页面更新（当前 v${currentRevision}）。`);
    this.name = 'PluginDocumentConflictError';
    this.currentRevision = currentRevision;
  }
}

type StoredPluginDocument = {
  id: string;
  pluginId: string;
  projectId: string;
  pluginProjectId: string;
  key: string;
  json: string;
  revision: number;
  updatedAt: number;
};

export type PluginDocumentSnapshot = {
  key: string;
  value: unknown;
  revision: number;
  updatedAt: number;
};

function pluginProjectIdentity(pluginId: string, projectId: string) {
  if (!PLUGIN_ID_RE.test(pluginId)) throw new Error('插件 ID 无效。');
  if (!PROJECT_ID_RE.test(projectId)) throw new Error('当前画布项目 ID 无效。');
  return `${pluginId}\u0000${projectId}`;
}

function documentIdentity(pluginId: string, projectId: string, key: string) {
  const scope = pluginProjectIdentity(pluginId, projectId);
  if (!DOCUMENT_KEY_RE.test(key)) {
    throw new Error('插件文档键必须是 1 到 120 位字母、数字、点、下划线、冒号或连字符。');
  }
  return `${scope}\u0000${key}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('插件文档数据库请求失败。')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('插件文档数据库事务已取消。')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('插件文档数据库事务失败。')),
      { once: true },
    );
  });
}

async function runTransaction<T>(
  transaction: IDBTransaction,
  operation: () => Promise<T>,
): Promise<T> {
  // Register terminal listeners before issuing requests. A small readonly
  // transaction can otherwise complete before a later listener is attached.
  const completion = transactionComplete(transaction);
  try {
    const result = await operation();
    await completion;
    return result;
  } catch (error) {
    try {
      await completion;
    } catch {
      // Preserve the operation error; the transaction failure is its consequence.
    }
    throw error;
  }
}

async function openLegacyDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  const request = indexedDB.open(LEGACY_DATABASE_NAME);
  let databaseMissing = false;
  request.addEventListener('upgradeneeded', () => {
    databaseMissing = true;
    request.transaction?.abort();
  });
  try {
    const database = await requestResult(request);
    if (!database.objectStoreNames.contains(LEGACY_OBJECT_STORE_NAME)) {
      database.close();
      return null;
    }
    return database;
  } catch (error) {
    if (databaseMissing) return null;
    throw error;
  }
}

function parsedSnapshot(record: StoredPluginDocument): PluginDocumentSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(record.json) as unknown;
  } catch {
    throw new Error('插件项目文档已损坏；原记录已保留，未执行覆盖。');
  }
  return {
    key: record.key,
    value,
    revision: record.revision,
    updatedAt: record.updatedAt,
  };
}

async function readLegacyScope(pluginId: string, projectId: string) {
  const pluginProjectId = pluginProjectIdentity(pluginId, projectId);
  const database = await openLegacyDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(LEGACY_OBJECT_STORE_NAME, 'readonly');
    return await runTransaction(transaction, async () => {
      const store = transaction.objectStore(LEGACY_OBJECT_STORE_NAME);
      if (!store.indexNames.contains('pluginProjectId')) {
        throw new Error('旧插件项目文档索引不可用，未执行迁移。');
      }
      const records = (await requestResult(
        store.index('pluginProjectId').getAll(IDBKeyRange.only(pluginProjectId)),
      )) as StoredPluginDocument[];
      return records.map(parsedSnapshot);
    });
  } finally {
    database.close();
  }
}

type BridgeErrorPayload = {
  error?: { message?: string };
  currentRevision?: number;
};

async function bridgeRequest<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(resolveBridgeUrl(`/plugins/project-documents/${action}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & BridgeErrorPayload;
  if (!response.ok) {
    if (response.status === 409 && Number.isSafeInteger(payload.currentRevision)) {
      throw new PluginDocumentConflictError(Number(payload.currentRevision));
    }
    throw new Error(payload.error?.message || `插件项目文档服务失败（HTTP ${response.status}）。`);
  }
  return payload;
}

const migrationPromises = new Map<string, Promise<void>>();

async function ensureLegacyScopeMigrated(pluginId: string, projectId: string) {
  const scope = pluginProjectIdentity(pluginId, projectId);
  const existing = migrationPromises.get(scope);
  if (existing) return existing;
  const migration = (async () => {
    const status = await bridgeRequest<{ completed: boolean }>('status', { pluginId, projectId });
    if (status.completed) return;
    const snapshots = await readLegacyScope(pluginId, projectId);
    for (const snapshot of snapshots) {
      await bridgeRequest('migrate', { pluginId, projectId, snapshot });
    }
    await bridgeRequest('complete-migration', {
      pluginId,
      projectId,
      recordCount: snapshots.length,
    });
  })();
  migrationPromises.set(scope, migration);
  try {
    await migration;
  } catch (error) {
    migrationPromises.delete(scope);
    throw error;
  }
}

export async function readPluginDocument(
  pluginId: string,
  projectId: string,
  key: string,
): Promise<PluginDocumentSnapshot | null> {
  documentIdentity(pluginId, projectId, key);
  await ensureLegacyScopeMigrated(pluginId, projectId);
  return bridgeRequest('read', { pluginId, projectId, key });
}

export async function writePluginDocument(
  pluginId: string,
  projectId: string,
  key: string,
  value: unknown,
  expectedRevision?: number,
): Promise<PluginDocumentSnapshot> {
  documentIdentity(pluginId, projectId, key);
  if (value === undefined) throw new Error('插件文档内容不能为空。');
  let json = '';
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error('插件文档必须是可序列化的 JSON 数据。');
  }
  if (!json || new TextEncoder().encode(json).byteLength > MAX_DOCUMENT_JSON_LENGTH) {
    throw new Error('单个插件文档不能超过 16 MiB。');
  }
  await ensureLegacyScopeMigrated(pluginId, projectId);
  return bridgeRequest('write', {
    pluginId,
    projectId,
    key,
    value,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}

export async function deletePluginDocument(
  pluginId: string,
  projectId: string,
  key: string,
  expectedRevision?: number,
): Promise<{ deleted: boolean }> {
  documentIdentity(pluginId, projectId, key);
  await ensureLegacyScopeMigrated(pluginId, projectId);
  return bridgeRequest('delete', {
    pluginId,
    projectId,
    key,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}
