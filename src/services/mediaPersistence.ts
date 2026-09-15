import {
  createImagePreviewBlob,
  createImagePreviewFromUrl,
  createVideoPosterBlob,
  createVideoPosterFromUrl,
  resolveMediaSourceUrl,
} from '../lib/mediaPreview';
import { deleteBridgeAsset, uploadAssetFile, uploadMediaPreview } from './assetLibrary';

let previewGenerationQueue = Promise.resolve();

export interface PersistedImageMedia {
  originalUrl: string;
  previewUrl: string;
  previewAssetId?: string;
  width: number;
  height: number;
  bridgeAssetId: string;
}

export interface PersistedVideoMedia extends PersistedImageMedia {
  durationSeconds?: number;
}

export type PreparedVideoPoster = Awaited<ReturnType<typeof createVideoPosterBlob>>;
export type VideoPosterReadyCallback = (poster: PreparedVideoPoster) => void | Promise<void>;

async function verifyBridgePreviewBlob(
  previewUrl: string,
  expectedBlob: Blob,
  signal?: AbortSignal,
) {
  const response = await fetch(previewUrl, { method: 'GET', signal });
  if (!response.ok) {
    throw new Error(`本机素材预览回读失败（HTTP ${response.status}）。`);
  }
  const readback = await response.blob();
  const [expectedBytes, actualBytes] = await Promise.all([
    expectedBlob.arrayBuffer(),
    readback.arrayBuffer(),
  ]);
  if (expectedBytes.byteLength !== actualBytes.byteLength) {
    throw new Error('本机素材预览回读大小与上传内容不一致。');
  }
  const expected = new Uint8Array(expectedBytes);
  const actual = new Uint8Array(actualBytes);
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      throw new Error('本机素材预览回读内容与上传内容不一致。');
    }
  }
}

function enqueuePreviewGeneration<T>(task: () => Promise<T>) {
  const queued = previewGenerationQueue.catch(() => {}).then(task);
  previewGenerationQueue = queued.then(
    () => {},
    () => {},
  );
  return queued;
}

export async function persistImageFile(
  file: File,
  kind: 'character' | 'scene' | 'prop' | 'storyboard',
  project: string,
  signal?: AbortSignal,
): Promise<PersistedImageMedia> {
  const preview = await enqueuePreviewGeneration(() => createImagePreviewBlob(file));
  const original = await uploadAssetFile(file, kind, { project, signal });
  let storedPreview;
  try {
    storedPreview = await uploadMediaPreview(preview.blob, { signal });
  } catch (error) {
    await deleteBridgeAsset(original.id).catch(() => undefined);
    throw error;
  }
  return {
    originalUrl: original.url,
    previewUrl: storedPreview.url,
    previewAssetId: storedPreview.id,
    width: preview.width,
    height: preview.height,
    bridgeAssetId: original.id,
  };
}

export async function persistVideoFile(
  file: File,
  project: string,
  signalOrPosterReady?: AbortSignal | VideoPosterReadyCallback,
  onPosterReady?: VideoPosterReadyCallback,
): Promise<PersistedVideoMedia> {
  let signal: AbortSignal | undefined;
  let posterReady = onPosterReady;
  if (typeof signalOrPosterReady === 'function') posterReady = signalOrPosterReady;
  else signal = signalOrPosterReady;
  const poster = await enqueuePreviewGeneration(() => createVideoPosterBlob(file));
  await posterReady?.(poster);
  const original = await uploadAssetFile(file, 'video', { project, signal });
  let storedPreview;
  try {
    storedPreview = await uploadMediaPreview(poster.blob, { signal });
  } catch (error) {
    await deleteBridgeAsset(original.id).catch(() => undefined);
    throw error;
  }
  return {
    originalUrl: original.url,
    previewUrl: storedPreview.url,
    previewAssetId: storedPreview.id,
    width: poster.width,
    height: poster.height,
    durationSeconds: poster.durationSeconds,
    bridgeAssetId: original.id,
  };
}

export async function persistImagePreviewForUrl(originalUrl: string) {
  return enqueuePreviewGeneration(async () => {
    const preview = await createImagePreviewFromUrl(resolveMediaSourceUrl(originalUrl));
    const stored = await uploadMediaPreview(preview.blob);
    return { previewUrl: stored.url, width: preview.width, height: preview.height };
  });
}

export async function persistImagePreviewDataUrl(dataUrl: string, signal?: AbortSignal) {
  const response = await fetch(dataUrl, { signal });
  if (!response.ok) throw new Error(`Unable to read image preview (${response.status})`);
  return persistImagePreviewBlob(await response.blob(), signal);
}

export async function persistImagePreviewBlob(preview: Blob, signal?: AbortSignal) {
  const stored = await uploadMediaPreview(preview, { signal });
  await verifyBridgePreviewBlob(stored.url, preview, signal);
  return { previewUrl: stored.url, previewAssetId: stored.id };
}

export async function persistVideoPosterForUrl(originalUrl: string) {
  return enqueuePreviewGeneration(async () => {
    const preview = await createVideoPosterFromUrl(resolveMediaSourceUrl(originalUrl));
    const stored = await uploadMediaPreview(preview.blob);
    return {
      previewUrl: stored.url,
      width: preview.width,
      height: preview.height,
      durationSeconds: preview.durationSeconds,
    };
  });
}
