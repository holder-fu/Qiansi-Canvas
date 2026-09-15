import type { TrashItem } from '../store/canvasStore';
import {
  imagePreviewSource,
  resolvedAudioSource,
  resolveMediaSourceUrl,
  videoPreviewSource,
} from '../lib/mediaPreview';

export type TrashMedia =
  | { type: 'image'; url: string }
  | { type: 'video'; url: string; posterUrl?: string }
  | { type: 'audio'; url: string };

export function itemMedia(item: TrashItem): TrashMedia | null {
  for (const node of item.nodes) {
    const data = node.data;
    const isVideo =
      data.kind === 'video' ||
      data.kind === 'video-comp' ||
      typeof data.videoUrl === 'string' ||
      Boolean(data.videos?.length);
    const isAudio =
      data.kind === 'audio' || typeof data.audioUrl === 'string' || Boolean(data.audios?.length);
    if (isVideo) {
      const videoUrl = videoPreviewSource({
        originalUrl: data.originalUrl,
        videoUrl: data.videoUrl,
        videos: data.videos,
        videoPreviewUrl: data.videoPreviewUrl,
        portInputs: data.portInputs,
      });
      const posterUrl = [data.previewUrl, data.videoPreviewUrl]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        ?.trim();
      if (videoUrl && !videoUrl.startsWith('blob:')) {
        return {
          type: 'video',
          url: resolveMediaSourceUrl(videoUrl),
          ...(posterUrl ? { posterUrl: resolveMediaSourceUrl(posterUrl) } : {}),
        };
      }
      if (posterUrl) return { type: 'image', url: resolveMediaSourceUrl(posterUrl) };
    }

    if (!isAudio) {
      const imageUrl = [
        data.previewUrl,
        data.imagePreviewUrl,
        data.imagePreviewPosterUrl,
        imagePreviewSource({
          originalUrl: data.originalUrl,
          imageUrl: data.imageUrl,
          images: data.images,
          imagePreviewUrl: data.imagePreviewUrl,
          portInputs: data.portInputs,
        }),
      ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (imageUrl) return { type: 'image', url: resolveMediaSourceUrl(imageUrl) };
    }

    const audioUrl = resolvedAudioSource(data);
    if (audioUrl) return { type: 'audio', url: audioUrl };
  }
  return null;
}

export function itemText(item: TrashItem) {
  for (const node of item.nodes) {
    const data = node.data;
    if (data.kind !== 'text' && data.kind !== 'script' && typeof data.outputText !== 'string') {
      continue;
    }
    const content = String(data.outputText || data.result || data.prompt || '').trim();
    if (content) return content.replace(/\s+/g, ' ').slice(0, 260);
  }
  return '';
}
