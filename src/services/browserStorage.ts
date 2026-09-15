import {
  isManagedBrowserStorageKey,
  MANAGED_BROWSER_STORAGE_KEYS,
} from '../lib/browserStorageContract.mjs';
import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export type BrowserStorageChange = {
  key: string;
  value: string | null;
};

export type BrowserStorageRecord = BrowserStorageChange & {
  updatedAt: number;
};

export type BrowserStorageDocument = {
  version: 1;
  revision: number;
  records: BrowserStorageRecord[];
  updatedAt: number;
};

export type BrowserStorageSnapshot = {
  storage: BrowserStorageDocument;
  writable: boolean;
};

export class BrowserStorageConflictError extends Error {
  readonly storage?: BrowserStorageDocument;

  constructor(storage?: BrowserStorageDocument) {
    super('浏览器状态已在其它窗口更新，请基于最新版本重试。');
    this.name = 'BrowserStorageConflictError';
    this.storage = storage;
  }
}

function parseStorageDocument(value: unknown): BrowserStorageDocument {
  const document = value as Partial<BrowserStorageDocument> | null;
  if (
    document?.version !== 1 ||
    !Number.isSafeInteger(document.revision) ||
    Number(document.revision) < 0 ||
    !Array.isArray(document.records) ||
    document.records.length > MANAGED_BROWSER_STORAGE_KEYS.length ||
    !Number.isSafeInteger(document.updatedAt) ||
    Number(document.updatedAt) < 0
  ) {
    throw new Error('Bridge 返回的浏览器状态无效。');
  }
  const records: BrowserStorageRecord[] = document.records.map((candidate) => {
    const record = candidate as Partial<BrowserStorageRecord> | null;
    if (
      !record ||
      !isManagedBrowserStorageKey(record.key) ||
      (record.value !== null && typeof record.value !== 'string') ||
      !Number.isSafeInteger(record.updatedAt) ||
      Number(record.updatedAt) < 0
    ) {
      throw new Error('Bridge 返回的浏览器状态记录无效。');
    }
    return record as BrowserStorageRecord;
  });
  if (new Set(records.map((record) => record.key)).size !== records.length) {
    throw new Error('Bridge 返回了重复的浏览器状态记录。');
  }
  return { ...(document as BrowserStorageDocument), records };
}

async function requestBrowserStorage(
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<BrowserStorageSnapshot> {
  const response = await fetch(
    resolveBridgeUrl('/settings/browser-storage', resolveBridgeBaseUrl(bridgeBase)),
    {
      cache: 'no-store',
      credentials: 'include',
      ...init,
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    storage?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new BrowserStorageConflictError(
        payload.storage ? parseStorageDocument(payload.storage) : undefined,
      );
    }
    throw new Error(payload.error?.message || `浏览器状态请求失败（HTTP ${response.status}）。`);
  }
  return {
    storage: parseStorageDocument(payload.storage),
    writable: payload.writable === true,
  };
}

export function loadBrowserStorage(bridgeBase = BRIDGE_BASE_URL) {
  return requestBrowserStorage(undefined, bridgeBase);
}

export function saveBrowserStorage(
  changes: BrowserStorageChange[],
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestBrowserStorage(
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, expectedRevision }),
    },
    bridgeBase,
  );
}
