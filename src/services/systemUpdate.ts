import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export type UpdateSourceSummary = {
  id: string;
  name: string;
  homepageUrl: string;
  enabled: boolean;
  configured: boolean;
};

export type SystemUpdateStatus = {
  currentVersion: string;
  sourceConfigPath: string;
  downloadDirectory: string;
  sources: UpdateSourceSummary[];
  mode: 'download-only';
};

export type UpdateRelease = {
  version: string;
  publishedAt: string;
  notes: string[];
  package: { url: string; sha256: string; size: number };
};

export type UpdateManifest = UpdateRelease & {
  schemaVersion: 1;
  releases?: UpdateRelease[];
};

export type CheckedUpdateSource = {
  id: string;
  name: string;
  homepageUrl?: string;
  configured: boolean;
  status: 'ready' | 'error' | 'unconfigured';
  message?: string;
  latencyMs?: number;
  updateAvailable?: boolean;
  manifest?: UpdateManifest;
  networkReachable?: boolean;
  manifestAvailable?: boolean;
  httpStatus?: number;
};

export type SystemUpdateCheck = {
  currentVersion: string;
  sourceChoice: string;
  sources: CheckedUpdateSource[];
  latest:
    (UpdateManifest & { sourceId: string; sourceName: string; updateAvailable: boolean }) | null;
  previous?: (UpdateRelease & { sourceId: string; sourceName: string }) | null;
};

export type DownloadedSystemUpdate = {
  kind?: 'update' | 'rollback';
  sourceId: string;
  sourceName: string;
  version: string;
  fileName: string;
  path: string;
  size: number;
  sha256: string;
  verified: true;
};

export type SystemUpdateConnectivity = {
  configured: number;
  reachable: number;
  failed: number;
};

export function summarizeSystemUpdateConnectivity(
  result: SystemUpdateCheck,
): SystemUpdateConnectivity {
  const configuredSources = result.sources.filter((source) => source.configured);
  return {
    configured: configuredSources.length,
    reachable: configuredSources.filter((source) => source.status === 'ready').length,
    failed: configuredSources.filter((source) => source.status === 'error').length,
  };
}

async function requestJson<T>(path: string, init?: RequestInit, bridgeBase = BRIDGE_BASE_URL) {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message || `更新服务请求失败（HTTP ${response.status}）。`);
  return payload;
}

export function loadSystemUpdateStatus(bridgeBase = BRIDGE_BASE_URL) {
  return requestJson<SystemUpdateStatus>('/system-update/status', undefined, bridgeBase);
}

export function checkSystemUpdate(sourceId = 'auto', bridgeBase = BRIDGE_BASE_URL) {
  return requestJson<SystemUpdateCheck>(
    '/system-update/check',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    },
    bridgeBase,
  );
}

export function testSystemUpdateNetwork(sourceId = 'auto', bridgeBase = BRIDGE_BASE_URL) {
  return requestJson<SystemUpdateCheck>(
    '/system-update/connectivity',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    },
    bridgeBase,
  );
}

export function downloadSystemUpdate(sourceId: string, bridgeBase = BRIDGE_BASE_URL) {
  return requestJson<DownloadedSystemUpdate>(
    '/system-update/download',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    },
    bridgeBase,
  );
}

export function prepareSystemRollback(sourceId: string, bridgeBase = BRIDGE_BASE_URL) {
  return requestJson<DownloadedSystemUpdate>(
    '/system-update/rollback',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    },
    bridgeBase,
  );
}
