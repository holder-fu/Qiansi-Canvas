import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export const USER_LIBRARIES_STORAGE_VERSION = 1 as const;
export const USER_LIBRARY_KINDS = ['style', 'effect', 'character', 'camera'] as const;
export type UserLibraryKind = (typeof USER_LIBRARY_KINDS)[number];

export type UserLibrarySnapshot = {
  version: typeof USER_LIBRARIES_STORAGE_VERSION;
  revision: number;
  libraries: Record<string, unknown>;
  updatedAt: number;
};

export type UserLibrariesResponse = { libraries: UserLibrarySnapshot; writable: boolean };

export class UserLibrariesConflictError extends Error {
  readonly libraries?: UserLibrarySnapshot;

  constructor(libraries?: UserLibrarySnapshot) {
    super('资料库已在其它窗口更新，请刷新后重试。');
    this.name = 'UserLibrariesConflictError';
    this.libraries = libraries;
  }
}

function parseSnapshot(value: unknown): UserLibrarySnapshot {
  const raw = value as Partial<UserLibrarySnapshot> | null;
  const revision = Number(raw?.revision);
  const updatedAt = Number(raw?.updatedAt);
  if (
    raw?.version !== USER_LIBRARIES_STORAGE_VERSION ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    !raw.libraries ||
    typeof raw.libraries !== 'object' ||
    Array.isArray(raw.libraries)
  ) {
    throw new Error('Bridge 返回的资料库设置无效。');
  }
  return {
    version: USER_LIBRARIES_STORAGE_VERSION,
    revision,
    libraries: raw.libraries as Record<string, unknown>,
    updatedAt,
  };
}

async function requestLibraries(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<UserLibrariesResponse> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    libraries?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new UserLibrariesConflictError(
        payload.libraries ? parseSnapshot(payload.libraries) : undefined,
      );
    }
    throw new Error(payload.error?.message || `资料库请求失败（HTTP ${response.status}）。`);
  }
  return {
    libraries: parseSnapshot(payload.libraries),
    writable: payload.writable === true,
  };
}

export function loadUserLibraries(bridgeBase = BRIDGE_BASE_URL) {
  return requestLibraries('/settings/user-libraries', undefined, bridgeBase);
}

export function saveUserLibraries(
  libraries: Record<string, unknown>,
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestLibraries(
    '/settings/user-libraries',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraries, expectedRevision }),
    },
    bridgeBase,
  );
}
