import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export type StorageCleanupScope = 'preview' | 'output' | 'assetOrphan' | 'temporary';

export interface StorageCleanupScopeSummary {
  label: string;
  files: number;
  bytes: number;
}

export interface StorageCleanupScan {
  scanId: string;
  summary: {
    files: number;
    bytes: number;
    scopes: Record<StorageCleanupScope, StorageCleanupScopeSummary>;
  };
  expiresInMs: number;
  protectedRecentMinutes: number;
}

export interface StorageCleanupResult {
  deletedFiles: number;
  deletedBytes: number;
  skippedFiles: number;
}

export type StorageCleanupFileKind = 'image' | 'video' | 'audio' | 'temporary' | 'file';

export interface StorageCleanupFileItem {
  id: string;
  name: string;
  folder: string;
  relativePath: string;
  extension: string;
  kind: StorageCleanupFileKind;
  scope: StorageCleanupScope;
  size: number;
  previewUrl: string;
}

export interface StorageCleanupFilePage {
  items: StorageCleanupFileItem[];
  total: number;
  offset: number;
  hasMore: boolean;
}

type ReadableStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
const BRIDGE_MEDIA_REFERENCE_PATTERNS = [
  /\/media-preview\/files\/[A-Za-z0-9_-]{12,80}\.webp/gi,
  /\/output\/[A-Za-z0-9_.-]+/gi,
  /cli-image-output[\\/][A-Za-z0-9_.-]+/gi,
  /\/asset-library\/files\/[A-Za-z0-9_-]{6,80}/gi,
  /["']bridgeAssetId["']\s*:\s*["'][A-Za-z0-9_-]{6,80}["']/gi,
];

export function collectBridgeMediaReferences(values: Iterable<string>): string[] {
  const references = new Set<string>();
  for (const value of values) {
    for (const pattern of BRIDGE_MEDIA_REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of String(value || '').matchAll(pattern)) {
        references.add(match[0]);
        if (references.size >= 10_000) return [...references];
      }
    }
  }
  return [...references];
}

/** Collect only bridge-owned media paths, keeping unrelated local settings off the request. */
export function collectLiveStorageMediaReferences(storage?: ReadableStorage): string[] {
  const source =
    storage ?? (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
  if (!source) return [];
  const values: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const key = source.key(index);
    if (!key) continue;
    const value = source.getItem(key);
    if (value) values.push(value);
  }
  return collectBridgeMediaReferences(values);
}

async function requestStorageCleanup<T>(path: string, body: unknown, bridgeBase: string) {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `存储清理请求失败（HTTP ${response.status}）。`);
  }
  return payload;
}

export function scanStorageGarbage(
  liveReferences: string[],
  bridgeBase = BRIDGE_BASE_URL,
): Promise<StorageCleanupScan> {
  return requestStorageCleanup('/storage-cleanup/scan', { liveReferences }, bridgeBase);
}

export async function listStorageGarbageFiles(
  scanId: string,
  options: {
    scope?: StorageCleanupScope | 'all';
    offset?: number;
    limit?: number;
    bridgeBase?: string;
  } = {},
): Promise<StorageCleanupFilePage> {
  const bridgeBase = resolveBridgeBaseUrl(options.bridgeBase ?? BRIDGE_BASE_URL);
  const query = new URLSearchParams({
    scope: options.scope ?? 'all',
    offset: String(Math.max(0, options.offset ?? 0)),
    limit: String(Math.max(1, Math.min(200, options.limit ?? 100))),
  });
  const response = await fetch(
    resolveBridgeUrl(
      `/storage-cleanup/plans/${encodeURIComponent(scanId)}/files?${query}`,
      bridgeBase,
    ),
    { cache: 'no-store' },
  );
  const payload = (await response.json().catch(() => ({}))) as StorageCleanupFilePage & {
    error?: { message?: string };
  };
  if (!response.ok || !Array.isArray(payload.items)) {
    throw new Error(payload.error?.message || `文件清单读取失败（HTTP ${response.status}）。`);
  }
  return {
    ...payload,
    items: payload.items.map((item) => ({
      ...item,
      previewUrl: item.previewUrl ? resolveBridgeUrl(item.previewUrl, bridgeBase) : '',
    })),
  };
}

export function applyStorageGarbageCleanup(
  scanId: string,
  liveReferences: string[],
  bridgeBase = BRIDGE_BASE_URL,
): Promise<StorageCleanupResult> {
  return requestStorageCleanup('/storage-cleanup/apply', { scanId, liveReferences }, bridgeBase);
}
