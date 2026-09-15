import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export const IMAGE_TYPE_PRESET_CATALOG_STORAGE_VERSION = 1 as const;

export type ImageTypePresetCatalogStorageData = {
  version: typeof IMAGE_TYPE_PRESET_CATALOG_STORAGE_VERSION;
  revision: number;
  categories: string[];
  presets: unknown[];
  updatedAt: number;
};

export type ImageTypePresetCatalogSnapshot = {
  catalog: ImageTypePresetCatalogStorageData;
  writable: boolean;
};

export class ImageTypePresetCatalogConflictError extends Error {
  readonly catalog?: ImageTypePresetCatalogStorageData;

  constructor(catalog?: ImageTypePresetCatalogStorageData) {
    super('图片生成类型已在其它窗口更新，请重新打开后重试。');
    this.name = 'ImageTypePresetCatalogConflictError';
    this.catalog = catalog;
  }
}

function parseCatalog(value: unknown): ImageTypePresetCatalogStorageData {
  const raw = value as Partial<ImageTypePresetCatalogStorageData> | null;
  const revision = Number(raw?.revision);
  const updatedAt = Number(raw?.updatedAt);
  if (
    raw?.version !== IMAGE_TYPE_PRESET_CATALOG_STORAGE_VERSION ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    !Array.isArray(raw.categories) ||
    !Array.isArray(raw.presets)
  ) {
    throw new Error('Bridge 返回的图片生成类型设置无效。');
  }
  return {
    version: IMAGE_TYPE_PRESET_CATALOG_STORAGE_VERSION,
    revision,
    categories: raw.categories.filter((item): item is string => typeof item === 'string'),
    presets: raw.presets,
    updatedAt,
  };
}

async function requestCatalog(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<ImageTypePresetCatalogSnapshot> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    catalog?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new ImageTypePresetCatalogConflictError(
        payload.catalog ? parseCatalog(payload.catalog) : undefined,
      );
    }
    throw new Error(
      payload.error?.message || `图片生成类型设置请求失败（HTTP ${response.status}）。`,
    );
  }
  return {
    catalog: parseCatalog(payload.catalog),
    writable: payload.writable === true,
  };
}

export function loadImageTypePresetCatalogStorage(bridgeBase = BRIDGE_BASE_URL) {
  return requestCatalog('/settings/image-type-presets', undefined, bridgeBase);
}

export function saveImageTypePresetCatalogStorage(
  data: Pick<ImageTypePresetCatalogStorageData, 'categories' | 'presets'>,
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestCatalog(
    '/settings/image-type-presets',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, expectedRevision }),
    },
    bridgeBase,
  );
}
