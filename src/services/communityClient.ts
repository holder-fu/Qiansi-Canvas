import { resolveBridgeUrl } from '../lib/bridgeUrl';

export type CommunityConnectivity = {
  service: 'holder-community';
  apiVersion: number;
  serverVersion: string;
  connection: { mode: string; dynamicLoopbackOrigins: boolean };
  authentication: {
    scheme: 'bearer';
    loginMode: 'browser-poll' | 'unsupported';
    providers: { google: boolean; wechat: boolean };
  };
  library: { kinds: string[]; maxImageBytes: number };
};

export type CommunityStatus = {
  configured: boolean;
  serverUrl: string | null;
  managedBy: 'deployment' | 'legacy' | 'none';
};

type CommunityProbe = { serverUrl: string; connectivity: CommunityConnectivity };

async function bridgeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveBridgeUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload?.error?.message || `本地画布桥返回 HTTP ${response.status}。`);
  return payload as T;
}

export function loadCommunityStatus(signal?: AbortSignal) {
  return bridgeRequest<CommunityStatus>('/community/status', { signal });
}

export function probeCommunityConnection() {
  return bridgeRequest<CommunityProbe>('/community/connectivity', {
    method: 'POST',
  });
}
