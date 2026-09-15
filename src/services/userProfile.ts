import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export type UserProfile = {
  version: 1;
  revision: number;
  userName: string;
  updatedAt: number;
};

export type UserProfileSnapshot = {
  profile: UserProfile;
  writable: boolean;
};

export class UserProfileConflictError extends Error {
  readonly profile?: UserProfile;

  constructor(profile?: UserProfile) {
    super('资料作者已在其它窗口更新，请刷新后重试。');
    this.name = 'UserProfileConflictError';
    this.profile = profile;
  }
}

function parseProfile(value: unknown): UserProfile {
  const profile = value as Partial<UserProfile> | null;
  if (
    profile?.version !== 1 ||
    !Number.isSafeInteger(profile.revision) ||
    Number(profile.revision) < 0 ||
    typeof profile.userName !== 'string' ||
    profile.userName.length > 60 ||
    !Number.isSafeInteger(profile.updatedAt) ||
    Number(profile.updatedAt) < 0
  ) {
    throw new Error('Bridge 返回的资料作者设置无效。');
  }
  return profile as UserProfile;
}

async function requestUserProfile(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<UserProfileSnapshot> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    profile?: unknown;
    writable?: unknown;
    error?: { message?: string };
  };
  if (!response.ok) {
    if (response.status === 409) {
      throw new UserProfileConflictError(
        payload.profile ? parseProfile(payload.profile) : undefined,
      );
    }
    throw new Error(payload.error?.message || `资料作者请求失败（HTTP ${response.status}）。`);
  }
  return {
    profile: parseProfile(payload.profile),
    writable: payload.writable === true,
  };
}

export function loadUserProfile(bridgeBase = BRIDGE_BASE_URL) {
  return requestUserProfile('/settings/profile', undefined, bridgeBase);
}

export function saveUserProfile(
  userName: string,
  expectedRevision: number,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestUserProfile(
    '/settings/profile',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName, expectedRevision }),
    },
    bridgeBase,
  );
}
