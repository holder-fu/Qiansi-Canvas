import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export const PROMPT_LIBRARY_STORAGE_VERSION = 1 as const;

export type PromptLibraryUserData = {
  version: typeof PROMPT_LIBRARY_STORAGE_VERSION;
  revision: number;
  items: unknown[];
  categories: string[];
  renames: [string, string][];
  deleted: string[];
  updatedAt: number;
};

export type PromptLibrarySnapshot = { library: PromptLibraryUserData; writable: boolean };

export class PromptLibraryConflictError extends Error {
  readonly library?: PromptLibraryUserData;

  constructor(library?: PromptLibraryUserData) {
    super('提示词库已在其它窗口更新，请刷新后重试。');
    this.name = 'PromptLibraryConflictError';
    this.library = library;
  }
}

function parseLibrary(value: unknown): PromptLibraryUserData {
  const raw = value as Partial<PromptLibraryUserData> | null;
  const revision = Number(raw?.revision);
  const updatedAt = Number(raw?.updatedAt);
  if (
    raw?.version !== PROMPT_LIBRARY_STORAGE_VERSION ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    !Array.isArray(raw.items) ||
    !Array.isArray(raw.categories) ||
    !Array.isArray(raw.renames) ||
    !Array.isArray(raw.deleted)
  ) {
    throw new Error('Bridge 返回的提示词库设置无效。');
  }
  return {
    version: PROMPT_LIBRARY_STORAGE_VERSION,
    revision,
    items: raw.items,
    categories: raw.categories.filter((item): item is string => typeof item === 'string'),
    renames: raw.renames.filter(
      (item): item is [string, string] =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === 'string' &&
        typeof item[1] === 'string',
    ),
    deleted: raw.deleted.filter((item): item is string => typeof item === 'string'),
    updatedAt,
  };
}

async function requestLibrary(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<PromptLibrarySnapshot> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    library?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new PromptLibraryConflictError(
        payload.library ? parseLibrary(payload.library) : undefined,
      );
    }
    throw new Error(payload.error?.message || `提示词库请求失败（HTTP ${response.status}）。`);
  }
  return {
    library: parseLibrary(payload.library),
    writable: payload.writable === true,
  };
}

export function loadPromptLibraryStorage(bridgeBase = BRIDGE_BASE_URL) {
  return requestLibrary('/settings/prompt-library', undefined, bridgeBase);
}

export function savePromptLibraryStorage(
  data: Omit<PromptLibraryUserData, 'version' | 'revision' | 'updatedAt'>,
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestLibrary(
    '/settings/prompt-library',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, expectedRevision }),
    },
    bridgeBase,
  );
}
