import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';

export const ASSET_BRIDGE_BASE = BRIDGE_BASE_URL;

export interface BridgeAssetItem {
  id: string;
  url: string;
  title?: string;
  mime?: string;
  size?: number;
}

export interface BridgeMediaPreview {
  id: string;
  url: string;
  size?: number;
}

export type BridgeAssetKind =
  | 'video'
  | 'audio'
  | 'character'
  | 'scene'
  | 'prop'
  | 'storyboard'
  | 'director-model'
  | 'director-scene'
  | 'director-reference';

const STABLE_BRIDGE_ID = /^[A-Za-z0-9_-]{6,80}$/;

export function bridgeAssetFileUrl(id: string, bridgeBase = ASSET_BRIDGE_BASE) {
  if (!STABLE_BRIDGE_ID.test(id)) throw new Error('素材 ID 无效。');
  return resolveBridgeUrl(
    `/asset-library/files/${encodeURIComponent(id)}`,
    resolveBridgeBaseUrl(bridgeBase),
  );
}

function bridgeResourceMatches(value: string, expectedPath: string, bridgeBase: string) {
  try {
    const actual = new URL(resolveBridgeUrl(value, bridgeBase));
    const expected = new URL(resolveBridgeUrl(expectedPath, bridgeBase));
    return (
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      actual.search === '' &&
      actual.hash === ''
    );
  } catch {
    return false;
  }
}

function assertStableBridgeAsset(item: BridgeAssetItem, bridgeBase: string) {
  if (
    !STABLE_BRIDGE_ID.test(item.id) ||
    !bridgeResourceMatches(
      item.url,
      `/asset-library/files/${encodeURIComponent(item.id)}`,
      bridgeBase,
    )
  ) {
    throw new Error('本机素材服务没有返回可长期读取的素材 ID 和原文件地址。');
  }
}

function assertStableBridgePreview(item: BridgeMediaPreview, bridgeBase: string) {
  if (
    !STABLE_BRIDGE_ID.test(item.id) ||
    !bridgeResourceMatches(
      item.url,
      `/media-preview/files/${encodeURIComponent(item.id)}.webp`,
      bridgeBase,
    )
  ) {
    throw new Error('本机素材服务没有返回可长期读取的独立预览地址。');
  }
}

export async function uploadMediaPreview(
  preview: Blob,
  options: { bridgeBase?: string; signal?: AbortSignal } = {},
): Promise<BridgeMediaPreview> {
  const bridgeBase = resolveBridgeBaseUrl(options.bridgeBase, ASSET_BRIDGE_BASE);
  const response = await fetch(resolveBridgeUrl('/media-preview/upload', bridgeBase), {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp' },
    body: preview,
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => ({}))) as BridgeMediaPreview & {
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message || `媒体预览保存失败（HTTP ${response.status}）。`);
  }
  const stored = { ...payload, url: resolveBridgeUrl(payload.url, bridgeBase) };
  assertStableBridgePreview(stored, bridgeBase);
  return stored;
}

/** Permanently remove a bridge-owned media file and its library record. */
export async function deleteBridgeAsset(id: string, bridgeBase = ASSET_BRIDGE_BASE) {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return;
  const response = await fetch(
    resolveBridgeUrl(
      `/asset-library/items/${encodeURIComponent(id)}`,
      resolveBridgeBaseUrl(bridgeBase),
    ),
    { method: 'DELETE' },
  );
  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message || `素材删除失败（HTTP ${response.status}）。`);
  }
}

function safeHeaderFileName(name: string) {
  const ascii = name
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[\r\n]/g, '')
    .slice(0, 180);
  return ascii || 'uploaded-media';
}

/** Persist an uploaded media file in the bridge-owned asset library. */
export async function uploadAssetFile(
  file: File,
  kind: BridgeAssetKind,
  options: { project?: string; bridgeBase?: string; signal?: AbortSignal } = {},
): Promise<BridgeAssetItem> {
  const bridgeBase = resolveBridgeBaseUrl(options.bridgeBase, ASSET_BRIDGE_BASE);
  const response = await fetch(resolveBridgeUrl('/asset-library/upload', bridgeBase), {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Qiansi-Canvas-File-Name': safeHeaderFileName(file.name),
      'X-Qiansi-Canvas-Title': safeHeaderFileName(file.name.replace(/\.[^.]+$/, '')),
      'X-Qiansi-Canvas-Kind': kind,
      'X-Qiansi-Canvas-Project': safeHeaderFileName(options.project || 'clocktower'),
    },
    body: file,
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    item?: BridgeAssetItem;
    error?: { message?: string };
  };
  if (!response.ok || !payload.item?.id || !payload.item.url) {
    throw new Error(payload.error?.message || `素材保存失败（HTTP ${response.status}）。`);
  }
  const stored = {
    ...payload.item,
    url: resolveBridgeUrl(payload.item.url, bridgeBase),
  };
  assertStableBridgeAsset(stored, bridgeBase);
  return stored;
}
