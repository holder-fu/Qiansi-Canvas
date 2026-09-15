import { resolveBridgeUrl } from '../lib/bridgeUrl';
import type { PluginDepthFrameRequest, PluginDepthFrameResult } from './pluginDepthEffect';

const BRIDGE_BASE_URL = import.meta.env.VITE_QIANSI_CANVAS_BRIDGE_URL || 'http://127.0.0.1:2895';

function arrayBufferToBase64(bytes: ArrayBuffer) {
  const source = new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    binary += String.fromCharCode(...source.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** Sends one frame to the persistent, plugin-local Sapiens2 CUDA Worker. */
export async function renderPluginSapiensNormalFrame(
  pluginId: string,
  request: PluginDepthFrameRequest,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<PluginDepthFrameResult> {
  let response: Response;
  try {
    response = await fetch(resolveBridgeUrl('/plugins/vision/sapiens-normal/render', bridgeBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId,
        modelId: request.modelId,
        mimeType: request.mimeType,
        timestampMs: request.timestampMs,
        width: request.width,
        height: request.height,
        base64: arrayBufferToBase64(request.bytes),
      }),
    });
  } catch {
    throw new Error('画布后台连接已中断。请重新启动 Qiansi-Canvas 后再生成精细白模。');
  }
  const value: unknown = await response.json().catch(() => null);
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!response.ok) {
    const error = record?.error;
    const message =
      error && typeof error === 'object' && !Array.isArray(error)
        ? String((error as Record<string, unknown>).message || '')
        : '';
    throw new Error(message || 'Sapiens2 Normal Worker 推理失败。');
  }
  const width = Number(record?.width);
  const height = Number(record?.height);
  const inferenceMs = Number(record?.inferenceMs);
  if (
    record?.mimeType !== 'image/webp' ||
    typeof record.base64 !== 'string' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    !Number.isFinite(inferenceMs) ||
    inferenceMs < 0
  ) {
    throw new Error('Sapiens2 Normal Worker 返回的帧格式无效。');
  }
  return {
    bytes: base64ToArrayBuffer(record.base64),
    mimeType: 'image/webp',
    timestampMs: request.timestampMs,
    width,
    height,
    inferenceMs,
  };
}
