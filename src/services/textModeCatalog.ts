import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';
import {
  applyTextModeCatalog,
  normalizeTextModeDefinitions,
  TEXT_MODE_CATALOG_VERSION,
  type TextModeDefinition,
} from '../lib/textModeCatalog';

export type TextModeCatalog = {
  version: typeof TEXT_MODE_CATALOG_VERSION;
  revision: number;
  modes: TextModeDefinition[];
  updatedAt: number;
};

export type TextModeCatalogSnapshot = {
  catalog: TextModeCatalog;
  writable: boolean;
};

export class TextModeCatalogConflictError extends Error {
  readonly catalog?: TextModeCatalog;

  constructor(catalog?: TextModeCatalog) {
    super('文本处理模式已在其它窗口更新，请刷新后重试。');
    this.name = 'TextModeCatalogConflictError';
    this.catalog = catalog;
  }
}

function parseCatalog(value: unknown): TextModeCatalog {
  const raw = value as Partial<TextModeCatalog> | null;
  const revision = Number(raw?.revision);
  const updatedAt = Number(raw?.updatedAt);
  if (
    raw?.version !== TEXT_MODE_CATALOG_VERSION ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    !Array.isArray(raw.modes)
  ) {
    throw new Error('Bridge 返回的文本处理模式设置无效。');
  }
  return {
    version: TEXT_MODE_CATALOG_VERSION,
    revision,
    modes: normalizeTextModeDefinitions(raw.modes),
    updatedAt,
  };
}

async function requestCatalog(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<TextModeCatalogSnapshot> {
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
      throw new TextModeCatalogConflictError(
        payload.catalog ? parseCatalog(payload.catalog) : undefined,
      );
    }
    throw new Error(payload.error?.message || `文本处理模式请求失败（HTTP ${response.status}）。`);
  }
  return {
    catalog: parseCatalog(payload.catalog),
    writable: payload.writable === true,
  };
}

export function loadTextModeCatalog(bridgeBase = BRIDGE_BASE_URL) {
  return requestCatalog('/settings/text-modes', undefined, bridgeBase);
}

export function saveTextModeCatalog(
  modes: readonly TextModeDefinition[],
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestCatalog(
    '/settings/text-modes',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modes, expectedRevision }),
    },
    bridgeBase,
  );
}

export function applyLoadedTextModeCatalog(modes: unknown) {
  return applyTextModeCatalog(modes);
}
