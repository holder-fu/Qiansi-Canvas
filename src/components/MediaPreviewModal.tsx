import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Video, X } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { loadAssetVideo, loadEffectVideo } from '../lib/libraryMedia';
import {
  imagePreviewSource,
  preferredImageSource,
  resolveMediaSourceUrl,
  videoPreviewSource,
} from '../lib/mediaPreview';
import { useAppTranslation } from '../i18n/appI18n';

export function MediaPreviewModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const [storedVideoUrl, setStoredVideoUrl] = useState<string>();
  const [loading, setLoading] = useState(false);

  const isOpen = openModal === 'media-preview';
  const isVideo = node?.data.kind === 'video' || node?.data.kind === 'video-comp';
  const rawVideoUrl = node
    ? videoPreviewSource({
        videoUrl: node.data.videoUrl,
        videos: node.data.videos,
        originalUrl: node.data.originalUrl,
        videoPreviewUrl: node.data.videoPreviewUrl,
        portInputs: node.data.portInputs,
      })
    : undefined;
  const directVideoUrl = rawVideoUrl ? resolveMediaSourceUrl(rawVideoUrl) : undefined;
  // Full-screen image preview must use the durable/original source first. The
  // lightweight preview is only a renderer fallback for inherited references.
  const rawImageUrl = node
    ? preferredImageSource(node.data) || imagePreviewSource(node.data)
    : undefined;
  const imageUrl = rawImageUrl ? resolveMediaSourceUrl(rawImageUrl) : undefined;
  const previewUrl = isVideo ? directVideoUrl || storedVideoUrl : imageUrl;
  const videoPosterUrl =
    isVideo && typeof node?.data.previewUrl === 'string' && node.data.previewUrl.trim().length > 0
      ? resolveMediaSourceUrl(node.data.previewUrl)
      : undefined;
  const title = isVideo
    ? node?.data.videoFileName ||
      node?.data.title ||
      t('canvasShell.media.videoPreview', '视频预览')
    : node?.data.imageFileName ||
      node?.data.title ||
      t('canvasShell.media.imagePreview', '图片预览');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeModal, isOpen]);

  useEffect(() => {
    setStoredVideoUrl(undefined);
    if (!isOpen || !isVideo || directVideoUrl || !node) return;
    const storageId = node.data.assetVideoId;
    const effectId = node.data.effectVideoId;
    if (!storageId && !effectId) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setLoading(true);
    const loadStoredVideo = storageId
      ? loadAssetVideo(storageId)
      : effectId
        ? loadEffectVideo(effectId)
        : Promise.resolve(null);
    void loadStoredVideo
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setStoredVideoUrl(objectUrl);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [directVideoUrl, isOpen, isVideo, modalNodeId, node]);

  if (!isOpen || !node) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={closeModal}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex min-w-0 items-center gap-2 text-sm text-white/75">
          {isVideo ? (
            <Video className="h-4 w-4 shrink-0" />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </div>
        <button
          type="button"
          onClick={closeModal}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white"
          aria-label={t('canvasShell.media.closePreview', '关闭媒体预览')}
          title={t('canvasShell.common.close', '关闭')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-5"
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        ) : previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              poster={videoPosterUrl}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-xl bg-black shadow-2xl"
            />
          ) : (
            <img
              src={previewUrl}
              alt={title}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          )
        ) : (
          <p className="text-sm text-white/45">
            {t('canvasShell.media.empty', '当前节点没有可预览的媒体。')}
          </p>
        )}
      </div>
    </div>
  );
}
