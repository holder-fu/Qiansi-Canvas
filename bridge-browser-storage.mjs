import { join } from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';
import {
  isManagedBrowserStorageKey,
  MANAGED_BROWSER_STORAGE_KEYS,
} from './src/lib/browserStorageContract.mjs';

export const BRIDGE_BROWSER_STORAGE_VERSION = 1;
export const MAX_BRIDGE_BROWSER_STORAGE_BYTES = 12 * 1024 * 1024;
export const MAX_BRIDGE_BROWSER_STORAGE_VALUE_LENGTH = 6 * 1024 * 1024;
const MAX_BROWSER_STORAGE_RECORDS = MANAGED_BROWSER_STORAGE_KEYS.length;

function emptyDocument() {
  return {
    version: BRIDGE_BROWSER_STORAGE_VERSION,
    revision: 0,
    records: [],
    updatedAt: 0,
  };
}

function normalizeStoredRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const key = typeof value.key === 'string' ? value.key : '';
  const storedValue = value.value;
  const updatedAt = Number(value.updatedAt);
  if (
    !isManagedBrowserStorageKey(key) ||
    (storedValue !== null && typeof storedValue !== 'string') ||
    (typeof storedValue === 'string' &&
      storedValue.length > MAX_BRIDGE_BROWSER_STORAGE_VALUE_LENGTH)
  ) {
    return;
  }
  return {
    key,
    value: storedValue,
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export function normalizeBridgeBrowserStorageDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDocument();
  const revision = Number(value.revision);
  const updatedAt = Number(value.updatedAt);
  const recordsByKey = new Map();
  for (const candidate of Array.isArray(value.records)
    ? value.records.slice(0, MAX_BROWSER_STORAGE_RECORDS)
    : []) {
    const record = normalizeStoredRecord(candidate);
    if (!record) continue;
    const current = recordsByKey.get(record.key);
    if (!current || record.updatedAt >= current.updatedAt) recordsByKey.set(record.key, record);
  }
  return {
    version: BRIDGE_BROWSER_STORAGE_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    records: [...recordsByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

function normalizeChanges(value) {
  if (!Array.isArray(value) || value.length > MAX_BROWSER_STORAGE_RECORDS) {
    throw new Error('浏览器状态变更数量无效。');
  }
  const changes = new Map();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('浏览器状态变更格式无效。');
    }
    const key = typeof candidate.key === 'string' ? candidate.key : '';
    if (!isManagedBrowserStorageKey(key)) {
      throw new Error(`“${key || 'unknown'}”不属于千丝画布受管状态。`);
    }
    if (candidate.value !== null && typeof candidate.value !== 'string') {
      throw new Error(`浏览器状态“${key}”必须是字符串或删除标记。`);
    }
    if (
      typeof candidate.value === 'string' &&
      candidate.value.length > MAX_BRIDGE_BROWSER_STORAGE_VALUE_LENGTH
    ) {
      throw new Error(`浏览器状态“${key}”超过单项大小限制。`);
    }
    changes.set(key, { key, value: candidate.value });
  }
  return [...changes.values()];
}

export class BridgeBrowserStorageConflictError extends Error {
  constructor(current) {
    super('浏览器状态已在其它窗口更新，请基于最新版本重试。');
    this.name = 'BridgeBrowserStorageConflictError';
    this.current = current;
  }
}

export class BridgeBrowserStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('浏览器状态存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'browser-storage.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    return normalizeBridgeBrowserStorageDocument(
      await readJsonIfExists(this.file, '浏览器状态设置'),
    );
  }

  update({ changes, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeBridgeBrowserStorageDocument(
          await readJsonIfExists(this.file, '浏览器状态设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('浏览器状态设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeBrowserStorageConflictError(current);
        }
        const normalizedChanges = normalizeChanges(changes);
        if (normalizedChanges.length === 0) return current;
        const changedAt = this.now();
        const records = new Map(current.records.map((record) => [record.key, record]));
        for (const change of normalizedChanges) {
          records.set(change.key, { ...change, updatedAt: changedAt });
        }
        const next = {
          version: BRIDGE_BROWSER_STORAGE_VERSION,
          revision: current.revision + 1,
          records: [...records.values()].sort((left, right) => left.key.localeCompare(right.key)),
          updatedAt: changedAt,
        };
        await atomicWriteJson(this.file, next, { maxBytes: MAX_BRIDGE_BROWSER_STORAGE_BYTES });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
