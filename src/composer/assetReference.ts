import type { AssetItem } from '../store/canvasStore';
import { isDerivedImagePreviewUrl } from '../lib/aiImageReferencePolicy';
import { resolveBridgeUrl } from '../lib/bridgeUrl';
import { resolvedAudioSource } from '../lib/mediaPreview';
import type { ComposerReference } from './types';

function bridgeAssetUrl(asset: AssetItem) {
  if (!asset.bridgeAssetId || !/^[A-Za-z0-9_-]{6,80}$/.test(asset.bridgeAssetId)) return;
  try {
    return resolveBridgeUrl(`/asset-library/files/${encodeURIComponent(asset.bridgeAssetId)}`);
  } catch {
    return;
  }
}

function bridgePreviewUrl(value: string | undefined) {
  if (!value) return;
  try {
    const resolved = resolveBridgeUrl(value);
    const pathname = new URL(resolved).pathname;
    if (
      /^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/.test(pathname) ||
      /^\/media-preview\/files\/[A-Za-z0-9_-]{12,80}\.webp$/.test(pathname)
    ) {
      return resolved;
    }
  } catch {
    return;
  }
}

export function assetToComposerReference(
  asset: AssetItem,
  resolvedVideoUrl?: string,
): ComposerReference | null {
  const type: ComposerReference['type'] =
    asset.kind === 'video' || asset.kind === 'video-comp'
      ? 'video'
      : asset.kind === 'audio'
        ? 'audio'
        : 'image';
  const persistedBridgeUrl = bridgeAssetUrl(asset);
  const persistedPreviewUrl = bridgePreviewUrl(asset.previewUrl);
  const originalImageUrl = [
    persistedBridgeUrl,
    asset.originalUrl,
    asset.imageUrl,
    ...(asset.images ?? []),
  ].find((value): value is string => Boolean(value?.trim()) && !isDerivedImagePreviewUrl(value));
  const url =
    type === 'video'
      ? resolvedVideoUrl || persistedBridgeUrl || asset.videoUrl || asset.videos?.[0]
      : type === 'audio'
        ? resolvedAudioSource(asset)
        : originalImageUrl;
  if (!url) return null;
  return {
    id: `asset-${asset.id}`,
    type,
    url,
    ...(type !== 'audio' && persistedPreviewUrl && persistedPreviewUrl !== url
      ? { previewUrl: persistedPreviewUrl }
      : {}),
    label: asset.title,
  };
}

export function appendComposerReference(
  current: unknown,
  reference: ComposerReference,
): ComposerReference[] {
  const existing = Array.isArray(current)
    ? current.filter(
        (item): item is ComposerReference =>
          Boolean(item) && typeof item === 'object' && typeof item.id === 'string',
      )
    : [];
  if (
    existing.some(
      (item) =>
        item.id === reference.id || (item.type === reference.type && item.url === reference.url),
    )
  ) {
    return existing;
  }
  return [...existing, reference];
}
