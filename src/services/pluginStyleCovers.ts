import { resolveBridgeUrl } from '../lib/bridgeUrl';

const STYLE_ID_RE = /^[a-z0-9][a-z0-9-]{1,71}$/;
const MAX_STYLE_COVER_DATA_URL_CHARS = 1_100_000;

export type PluginSharedStyleCoverSnapshot = {
  styleId: string;
  fileName: string;
  mimeType: 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  revision: number;
  updatedAt: number;
  dataUrl: string;
};

export class PluginSharedStyleCoverConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`共享风格封面已被其他页面更新（当前 v${currentRevision}）。`);
    this.name = 'PluginSharedStyleCoverConflictError';
    this.currentRevision = currentRevision;
  }
}

function styleIdValue(value: unknown) {
  const styleId = String(value || '')
    .trim()
    .toLowerCase();
  if (!STYLE_ID_RE.test(styleId)) throw new Error('风格标识无效。');
  return styleId;
}

type BridgeErrorPayload = {
  error?: { message?: string };
  currentRevision?: number;
};

async function bridgeRequest<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(resolveBridgeUrl(`/plugins/shared-style-covers/${action}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & BridgeErrorPayload;
  if (!response.ok) {
    if (response.status === 409 && Number.isSafeInteger(payload.currentRevision)) {
      throw new PluginSharedStyleCoverConflictError(Number(payload.currentRevision));
    }
    throw new Error(payload.error?.message || `共享风格封面服务失败（HTTP ${response.status}）。`);
  }
  return payload;
}

export async function readPluginSharedStyleCover(
  pluginId: string,
  styleId: string,
): Promise<PluginSharedStyleCoverSnapshot | null> {
  return bridgeRequest('read', { pluginId, styleId: styleIdValue(styleId) });
}

export async function writePluginSharedStyleCover(
  pluginId: string,
  styleId: string,
  cover: unknown,
  expectedRevision?: number,
): Promise<PluginSharedStyleCoverSnapshot> {
  const input =
    cover && typeof cover === 'object' && !Array.isArray(cover)
      ? (cover as Record<string, unknown>)
      : null;
  const dataUrl = String(input?.dataUrl || '');
  if (
    !dataUrl.startsWith('data:image/webp;base64,') ||
    dataUrl.length > MAX_STYLE_COVER_DATA_URL_CHARS
  ) {
    throw new Error('共享风格封面必须是受限大小的 WebP data URL。');
  }
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
  ) {
    throw new Error('共享风格封面预期修订号无效。');
  }
  return bridgeRequest('write', {
    pluginId,
    styleId: styleIdValue(styleId),
    cover: {
      dataUrl,
      fileName: String(input?.fileName || 'cover.webp'),
      width: input?.width,
      height: input?.height,
    },
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}

export async function deletePluginSharedStyleCover(
  pluginId: string,
  styleId: string,
  expectedRevision?: number,
): Promise<{ deleted: boolean }> {
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
  ) {
    throw new Error('共享风格封面预期修订号无效。');
  }
  return bridgeRequest('delete', {
    pluginId,
    styleId: styleIdValue(styleId),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}
