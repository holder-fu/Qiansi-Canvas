import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  X,
  Loader2,
  Image as ImageIcon,
  Video,
  Upload,
  Camera,
  FileText,
  Palette,
  UserRound,
} from 'lucide-react';
import { NODE_KIND_META, type FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { isLegacyMediaPlaceholder, thumbUrl } from '../placeholders';
import {
  closestStandardAspectRatio,
  intrinsicAspectRatio,
  resolveMediaFrameSize,
} from '../mediaFrameSize';
import { NodePorts } from './NodePorts';
import { loadAssetVideo, loadEffectVideo } from '../../lib/libraryMedia';
import { deleteBridgeAsset, uploadAssetFile } from '../../services/assetLibrary';
import { ImageNodeActionBar } from './ImageNodeActionBar';
import { GenerationRecoveryButton } from './GenerationRecoveryButton';
import {
  VideoNodeActionBar,
  type SubtitleRemovalRegion,
  type VideoToolAction,
} from './VideoNodeActionBar';
import { resolveVideoToolAction, shouldShowVideoNodeActionBar } from './videoToolState';
import { VideoTrimPanel } from './VideoTrimPanel';
import { VideoCropPanel } from './VideoCropPanel';
import { VideoAnimatedImagePanel } from './VideoAnimatedImagePanel';
import { PanoramaGenerationPrompt } from './PanoramaGenerationPrompt';
import {
  fitCropRect,
  type ImageEditorBrushTool,
  type ImageEditorMode,
  type NormalizedRect,
} from '../../lib/imageEditing';
import type { ImageEnhancementTool } from '../../lib/imageEnhancement';
import { canManuallyUploadMedia, shouldHideMediaNodeInputs } from './imageNodeUploadPolicy';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { normalizeVideoTrimRange, type VideoTrimRange } from '../../lib/videoTrim';
import { extractVideoTimelineFrameBlobs } from '../../lib/videoFrameExtraction';
import { readMediaDuration, resolveMediaDuration } from '../../lib/mediaDuration';
import { cropVideoToBlob, trimVideoToBlob, type VideoEditResult } from '../../lib/videoCrop';
import { extractVideoAudioToBlob } from '../../lib/videoAudioExtraction';
import {
  imagePreviewSource,
  isBridgeMediaUrl,
  isDerivedBridgePreviewUrl,
  mediaPreviewUrl,
  preferredImageSource,
  preferredVideoSource,
  resolveMediaSourceUrl,
  videoPreviewSource,
} from '../../lib/mediaPreview';
import { acquireVideoDecoder, releaseVideoDecoder } from '../../lib/videoDecoderBudget';
import { acquireMediaObjectUrl, releaseMediaObjectUrl } from '../../lib/mediaObjectUrlPool';
import { composerMarksForSource } from '../composerMarkIndex';
import {
  persistImageFile,
  persistImagePreviewForUrl,
  persistVideoFile,
  persistVideoPosterForUrl,
} from '../../services/mediaPersistence';
import { useAppTranslation } from '../../i18n/appI18n';
import { getNodeDisplayTitle as getLocalizedNodeDisplayTitle } from '../../i18n/nodeI18n';
import { applyVideoPlaybackBoundary } from '../../lib/videoPlaybackBoundary';
import { formatVideoPlayerTime } from '../../lib/videoPlayerTimeline';
import { videoToAnimatedWebp, type AnimatedWebpOptions } from '../../lib/videoAnimatedWebp';
import { useVideoEditingUi } from '../../store/videoEditingUi';
import { downloadMediaFile } from '../../lib/mediaDownload';
import { useSingleNodeControls } from './nodeSelectionState';
import { shouldHydrateStoredVideoSource } from './videoPosterState';
import { shouldRenderImageNodeOriginal } from './imageNodeDisplayQuality';
import { VideoPlaybackControls } from './VideoPlaybackControls';
import { appendComposerReference } from '../../composer/assetReference';
import { pickableCanvasMediaReference } from '../../composer/canvasReferencePicker';

function getNodeDisplayTitle(
  data: FlowNode['data'],
  nodeNumber: number,
  t: ReturnType<typeof useAppTranslation>['t'],
) {
  const storedTitle = typeof data.title === 'string' ? data.title.trim() : '';
  const numberedDefaults: Partial<Record<FlowNode['data']['kind'], readonly string[]>> = {
    image: ['角色图', '图片节点', '未命名图片'],
    video: ['视频', '未命名视频'],
  };
  const translatedDefault = getLocalizedNodeDisplayTitle(data.kind, data.title, t);
  if (!numberedDefaults[data.kind]) return translatedDefault;
  if (storedTitle && !numberedDefaults[data.kind]?.includes(storedTitle)) return translatedDefault;
  const kindLabel = t(NODE_KIND_META[data.kind]?.labelKey ?? 'node.kind.image.label', '图片');
  return t('node.defaultNumberedTitle', '{kind}{number}', {
    kind: kindLabel,
    number: nodeNumber,
  });
}

function videoSourceRevision(data: FlowNode['data']) {
  if (typeof data.videoEditRevision === 'string') return data.videoEditRevision;
  return JSON.stringify([
    videoPreviewSource(data) ?? null,
    data.effectVideoId ?? null,
    data.assetVideoId ?? null,
  ]);
}

type VideoCapturePoint = 'first' | 'last' | 'current';

function waitForVideoReady(video: HTMLVideoElement, t: ReturnType<typeof useAppTranslation>['t']) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        finish(new Error(t('imageNode.error.videoLoadTimeout', '视频加载超时，暂时无法截帧。'))),
      5000,
    );
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleLoaded = () => finish();
    const handleError = () =>
      finish(new Error(t('imageNode.error.videoLoadFailed', '视频加载失败，暂时无法截帧。')));
    video.addEventListener('loadeddata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function seekVideo(
  video: HTMLVideoElement,
  time: number,
  t: ReturnType<typeof useAppTranslation>['t'],
) {
  const target = Math.max(
    0,
    Math.min(time, Number.isFinite(video.duration) ? video.duration : time),
  );
  if (Math.abs(video.currentTime - target) < 0.015) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => finish(new Error(t('imageNode.error.videoSeekTimeout', '定位视频画面超时。'))),
      5000,
    );
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleSeeked = () => finish();
    const handleError = () =>
      finish(new Error(t('imageNode.error.videoSeekFailed', '无法定位到指定视频画面。')));
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = target;
  });
}

function ImageNodeBase({ id, data, selected, dragging }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const showSingleNodeControls = useSingleNodeControls(selected);
  const isVideoNode = data.kind === 'video' || data.kind === 'video-comp';
  const isEffectAsset = Boolean(data.effectPresetId || data.effectPreset);
  const zoom = useStore((state) => state.transform[2]);
  const updateNodeInternals = useUpdateNodeInternals();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const aiSkillOpen = useCanvasStore((s) => s.aiSkillOpen);
  const setOpenModal = useCanvasStore((s) => s.setOpenModal);
  const openLibraryImagePicker = useCanvasStore((s) => s.openLibraryImagePicker);
  const setImageEditorMode = useCanvasStore((s) => s.setImageEditorMode);
  const setImageEditorBrushTool = useCanvasStore((s) => s.setImageEditorBrushTool);
  const saveAsset = useCanvasStore((s) => s.saveAsset);
  const applyEnhancement = useCanvasStore((s) => s.applyEnhancement);
  const createLinkedEnhancementResult = useCanvasStore((s) => s.createLinkedEnhancementResult);
  const assets = useCanvasStore((s) => s.assets);
  const requestDeleteNode = useCanvasStore((s) => s.requestDeleteNode);
  const hasIncomingConnection = useCanvasStore((s) => s.edges.some((edge) => edge.target === id));
  const referencePickerTargetId = useCanvasStore((s) => s.referencePickerTargetId);
  const setReferencePickerTargetId = useCanvasStore((s) => s.setReferencePickerTargetId);
  const markPickerTargetId = useCanvasStore((s) => s.markPickerTargetId);
  const setMarkPickerTargetId = useCanvasStore((s) => s.setMarkPickerTargetId);
  const recoverNodeGenerationResult = useCanvasStore((s) => s.recoverNodeGenerationResult);
  const sourceMarks = useCanvasStore((s) => composerMarksForSource(s.nodes, id));

  const fileRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const videoHoveredRef = useRef(false);
  const resumeVideoAfterDragRef = useRef(false);
  const cancelRenameRef = useRef(false);
  const videoEditBusyRef = useRef(false);
  const videoEditOperationRef = useRef(0);
  const mediaUploadOperationRef = useRef(0);
  const audioExtractionAbortRef = useRef<AbortController | null>(null);
  const animatedImageAbortRef = useRef<AbortController | null>(null);
  const animatedImageOperationRef = useRef(0);
  // Node media Blob URLs may also be held by clipboard/history/cached workspaces.
  // Keep them alive until the document closes; component-local posters are tracked separately.
  const sessionPosterUrlsRef = useRef(new Set<string>());

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [effectVideoUrl, setEffectVideoUrl] = useState<string | undefined>();
  const [mediaHovered, setMediaHovered] = useState(false);
  const [decoderGranted, setDecoderGranted] = useState(false);
  const [previewGenerationFailedSource, setPreviewGenerationFailedSource] = useState<string | null>(
    null,
  );
  const [failedVideoPosterUrl, setFailedVideoPosterUrl] = useState<string | null>(null);
  const [failedOriginalImageUrl, setFailedOriginalImageUrl] = useState<string | null>(null);
  const [sessionVideoPoster, setSessionVideoPoster] = useState<{
    sourceUrl: string;
    posterUrl: string;
  } | null>(null);
  const [referenceHover, setReferenceHover] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [extractingAudio, setExtractingAudio] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(() => Boolean(data.directorPrevisUrl));
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(() => {
    const storedDuration = Number(data.durationSeconds);
    return Number.isFinite(storedDuration) && storedDuration > 0 ? storedDuration : 0;
  });
  const [trimThumbnails, setTrimThumbnails] = useState<string[]>([]);
  const [trimThumbnailsLoading, setTrimThumbnailsLoading] = useState(false);
  const [trimThumbnailsError, setTrimThumbnailsError] = useState<string | undefined>();
  const trimThumbnailsSourceRef = useRef<string | null>(null);
  const trimThumbnailUrlsRef = useRef<string[]>([]);
  const trimThumbnailGenerationRef = useRef<{
    source: string;
    promise: Promise<Blob[]>;
  } | null>(null);
  const previewGenerationSourceRef = useRef<string | null>(null);
  const [trimOpen, setTrimOpen] = useState(false);
  const setTrimNodeOpen = useVideoEditingUi((state) => state.setTrimNodeOpen);
  const videoRemakePreviewRequest = useVideoEditingUi((state) =>
    state.videoRemakePreviewRequest?.nodeId === id ? state.videoRemakePreviewRequest : null,
  );
  const [trimPreviewRange, setTrimPreviewRange] = useState<VideoTrimRange | null>(null);
  const [trimLoopPlayback, setTrimLoopPlayback] = useState(true);
  const [videoTrimBusy, setVideoTrimBusy] = useState(false);
  const [videoTrimProgress, setVideoTrimProgress] = useState(0);
  const [videoTrimError, setVideoTrimError] = useState<string | undefined>();
  const [cropOpen, setCropOpen] = useState(false);
  const [videoNaturalSize, setVideoNaturalSize] = useState({ width: 0, height: 0 });
  const [videoCropRect, setVideoCropRect] = useState<NormalizedRect>(() => fitCropRect(null));
  const [videoCropBusy, setVideoCropBusy] = useState(false);
  const [videoCropProgress, setVideoCropProgress] = useState(0);
  const [videoCropError, setVideoCropError] = useState<string | undefined>();
  const [animatedImageOpen, setAnimatedImageOpen] = useState(false);
  const [animatedImageBusy, setAnimatedImageBusy] = useState(false);
  const [animatedImageProgress, setAnimatedImageProgress] = useState(0);
  const [animatedImageError, setAnimatedImageError] = useState<string | undefined>();
  const [linkedEnhancementPrompt, setLinkedEnhancementPrompt] = useState<
    'panorama' | 'quality-restore' | 'cutout' | 'remove-text' | null
  >(null);
  const [linkedEnhancementSubmitting, setLinkedEnhancementSubmitting] = useState(false);
  const [checkingGenerationResult, setCheckingGenerationResult] = useState(false);

  const replaceSessionVideoPoster = useCallback((sourceUrl?: string, posterBlob?: Blob) => {
    setSessionVideoPoster((current) => {
      if (current) {
        URL.revokeObjectURL(current.posterUrl);
        sessionPosterUrlsRef.current.delete(current.posterUrl);
      }
      if (!sourceUrl || !posterBlob) return null;
      const posterUrl = URL.createObjectURL(posterBlob);
      sessionPosterUrlsRef.current.add(posterUrl);
      return { sourceUrl, posterUrl };
    });
  }, []);

  const updateNodesSharingSessionVideo = useCallback(
    (sessionUrl: string, patch: Partial<FlowNode['data']>, expectedRevision?: string): string[] => {
      const store = useCanvasStore.getState();
      const targets = store.nodes.filter(
        (node) =>
          node.data.videoUrl === sessionUrl &&
          (expectedRevision === undefined || node.data.videoEditRevision === expectedRevision),
      );
      for (const target of targets) store.updateNodeData(target.id, patch);
      return targets.map((target) => target.id);
    },
    [],
  );

  useEffect(
    () => () => {
      videoEditOperationRef.current += 1;
      mediaUploadOperationRef.current += 1;
      videoEditBusyRef.current = false;
      audioExtractionAbortRef.current?.abort();
      audioExtractionAbortRef.current = null;
      animatedImageOperationRef.current += 1;
      animatedImageAbortRef.current?.abort();
      animatedImageAbortRef.current = null;
      for (const url of sessionPosterUrlsRef.current) URL.revokeObjectURL(url);
      sessionPosterUrlsRef.current.clear();
      for (const url of trimThumbnailUrlsRef.current) URL.revokeObjectURL(url);
      trimThumbnailUrlsRef.current = [];
      trimThumbnailGenerationRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!showSingleNodeControls) {
      setTrimOpen(false);
      setTrimPreviewRange(null);
      setCropOpen(false);
      setCaptureMenuOpen(false);
      setLinkedEnhancementPrompt(null);
    }
  }, [showSingleNodeControls]);

  useLayoutEffect(() => {
    setTrimNodeOpen(id, trimOpen);
    return () => setTrimNodeOpen(id, false);
  }, [id, setTrimNodeOpen, trimOpen]);

  const nodeNumber = useCanvasStore((state) => {
    let number = 0;
    for (const node of state.nodes) {
      if (node.data.kind !== data.kind) continue;
      number += 1;
      if (node.id === id) return number;
    }
    return 1;
  });
  const nodeTitle = getNodeDisplayTitle(data, nodeNumber, t);
  const sourceSignature = videoSourceRevision(data);

  const explicitVideoUrl = data.videoUrl || data.videos?.[0];
  const isPendingMaskedRepair = Boolean(
    isVideoNode &&
    data.composerParams?.videoTool === 'masked-repair' &&
    !explicitVideoUrl &&
    !data.originalUrl,
  );
  const explicitImageUrl = preferredImageSource({
    originalUrl: isLegacyMediaPlaceholder(data.originalUrl) ? undefined : data.originalUrl,
    imageUrl: isLegacyMediaPlaceholder(data.imageUrl) ? undefined : data.imageUrl,
    images: isLegacyMediaPlaceholder(data.images?.[0]) ? undefined : data.images,
  });
  const resolvedImageUrl = imagePreviewSource({
    originalUrl: isLegacyMediaPlaceholder(data.originalUrl) ? undefined : data.originalUrl,
    imageUrl: isLegacyMediaPlaceholder(data.imageUrl) ? undefined : data.imageUrl,
    images: isLegacyMediaPlaceholder(data.images?.[0]) ? undefined : data.images,
    imagePreviewUrl: data.imagePreviewUrl,
    portInputs: data.portInputs,
  });
  const directVideoUrl = isPendingMaskedRepair
    ? undefined
    : videoPreviewSource({
        videoUrl: data.videoUrl,
        videos: data.videos,
        originalUrl: data.originalUrl,
        videoPreviewUrl: data.videoPreviewUrl,
        portInputs: data.portInputs,
      });
  const rawVideoUrl =
    directVideoUrl || effectVideoUrl || (isPendingMaskedRepair ? undefined : data.videoPreviewUrl);
  // Persisted nodes can contain a bridge-relative URL or a loopback address
  // from an earlier terminal. Resolve it against the bridge serving this page
  // before handing it to the browser's media decoder.
  const resolvedVideoUrl = rawVideoUrl ? resolveMediaSourceUrl(rawVideoUrl) : undefined;
  const showingDirectorPrevis = Boolean(
    data.directorPrevisUrl &&
    (data.videoUrl || data.videoPreviewUrl || resolvedVideoUrl) === data.directorPrevisUrl,
  );

  useEffect(() => {
    if (!isVideoNode || !explicitVideoUrl || data.originalUrl === explicitVideoUrl) return;
    updateNodeData(id, {
      originalUrl: explicitVideoUrl,
      previewUrl: undefined,
      mediaWidth: undefined,
      mediaHeight: undefined,
      durationSeconds: undefined,
    });
  }, [data.originalUrl, explicitVideoUrl, id, isVideoNode, updateNodeData]);
  const primaryUrl = useMemo(() => {
    return isVideoNode ? resolvedVideoUrl || explicitImageUrl : explicitImageUrl;
  }, [explicitImageUrl, isVideoNode, resolvedVideoUrl]);
  const isReferenceImagePreview = Boolean(!isVideoNode && !explicitImageUrl && resolvedImageUrl);
  const isAnimatedImageResult = Boolean(
    !isVideoNode && data.mediaMimeType === 'image/webp' && data.animatedFromVideoId,
  );
  const storedPreviewUrl = isPendingMaskedRepair
    ? undefined
    : isReferenceImagePreview
      ? data.imagePreviewPosterUrl
      : data.previewUrl?.startsWith('data:') ||
          data.previewUrl?.startsWith('blob:') ||
          isDerivedBridgePreviewUrl(data.previewUrl, primaryUrl)
        ? undefined
        : data.previewUrl;
  const displayPreviewUrl = useMemo(() => {
    // Effect references are animated WebP originals. Never replace them with
    // the static lightweight preview used by ordinary image nodes.
    if ((isEffectAsset || isAnimatedImageResult) && primaryUrl) {
      return resolveMediaSourceUrl(primaryUrl);
    }
    if (storedPreviewUrl) return resolveMediaSourceUrl(storedPreviewUrl);
    // Upstream references belong in the composer reference strip, not in the
    // derived node's media body. Keep the body empty until it owns a result.
    if (isReferenceImagePreview) return null;
    if (isBridgeMediaUrl(primaryUrl)) return null;
    return mediaPreviewUrl(primaryUrl, isVideoNode ? 'video' : 'image');
  }, [
    isAnimatedImageResult,
    isEffectAsset,
    isReferenceImagePreview,
    isVideoNode,
    primaryUrl,
    storedPreviewUrl,
  ]);
  const resolvedOriginalImageUrl = useMemo(
    () => (!isVideoNode && primaryUrl ? resolveMediaSourceUrl(primaryUrl) : ''),
    [isVideoNode, primaryUrl],
  );
  const originalImageEligible = shouldRenderImageNodeOriginal({
    isVideoNode,
    singleSelected: showSingleNodeControls,
    zoom,
    originalUrl: resolvedOriginalImageUrl,
  });
  const useOriginalImage =
    originalImageEligible && failedOriginalImageUrl !== resolvedOriginalImageUrl;
  const displayImageUrl = useOriginalImage ? resolvedOriginalImageUrl : displayPreviewUrl;
  const sessionVideoPosterUrl =
    sessionVideoPoster && sessionVideoPoster.sourceUrl === resolvedVideoUrl
      ? sessionVideoPoster.posterUrl
      : undefined;
  const videoPosterUrl =
    sessionVideoPosterUrl ||
    displayPreviewUrl ||
    (resolvedVideoUrl && isBridgeMediaUrl(resolvedVideoUrl)
      ? mediaPreviewUrl(resolvedVideoUrl, 'video')
      : undefined);

  useEffect(() => {
    if (sessionVideoPoster && sessionVideoPoster.sourceUrl !== resolvedVideoUrl) {
      replaceSessionVideoPoster();
    }
  }, [replaceSessionVideoPoster, resolvedVideoUrl, sessionVideoPoster]);

  useEffect(() => {
    if (failedVideoPosterUrl && failedVideoPosterUrl !== videoPosterUrl) {
      setFailedVideoPosterUrl(null);
    }
  }, [failedVideoPosterUrl, videoPosterUrl]);

  useEffect(() => {
    if (!originalImageEligible && failedOriginalImageUrl) setFailedOriginalImageUrl(null);
  }, [failedOriginalImageUrl, originalImageEligible]);

  useEffect(() => {
    const isInlineImage =
      !isVideoNode &&
      Boolean(
        primaryUrl && (primaryUrl.startsWith('data:image/') || primaryUrl.startsWith('blob:')),
      );
    if (
      !primaryUrl ||
      isReferenceImagePreview ||
      (!isInlineImage &&
        storedPreviewUrl &&
        !(isVideoNode && failedVideoPosterUrl === videoPosterUrl)) ||
      (!isInlineImage && (primaryUrl.startsWith('data:') || primaryUrl.startsWith('blob:'))) ||
      previewGenerationSourceRef.current === primaryUrl
    ) {
      return;
    }
    previewGenerationSourceRef.current = primaryUrl;
    let cancelled = false;
    const task = isInlineImage
      ? fetch(primaryUrl)
          .then((response) => {
            if (!response.ok) throw new Error(`读取会话图片失败：${response.status}`);
            return response.blob();
          })
          .then((blob) =>
            persistImageFile(
              new File([blob], `canvas-image-${id}.${blob.type === 'image/png' ? 'png' : 'webp'}`, {
                type: blob.type || 'image/webp',
              }),
              'storyboard',
              '无限画布',
            ),
          )
      : isVideoNode
        ? persistVideoPosterForUrl(primaryUrl)
        : persistImagePreviewForUrl(primaryUrl);
    void task
      .then((preview) => {
        if (cancelled) return;
        const current = useCanvasStore.getState().nodes.find((node) => node.id === id);
        const sourceStillCurrent = isVideoNode
          ? Boolean(current && videoSourceRevision(current.data) === sourceSignature)
          : Boolean(current && preferredImageSource(current.data) === primaryUrl);
        if (!sourceStillCurrent) return;
        setPreviewGenerationFailedSource(null);
        setFailedVideoPosterUrl(null);
        if (
          'originalUrl' in preview &&
          'bridgeAssetId' in preview &&
          typeof preview.originalUrl === 'string' &&
          typeof preview.bridgeAssetId === 'string'
        ) {
          updateNodeData(id, {
            originalUrl: preview.originalUrl,
            imageUrl: preview.originalUrl,
            images: current?.data.images?.map((url) =>
              url === primaryUrl ? preview.originalUrl : url,
            ),
            output:
              current?.data.output === primaryUrl ? preview.originalUrl : current?.data.output,
            composerReferences: current?.data.composerReferences?.map((reference) =>
              reference.url === primaryUrl ? { ...reference, url: preview.originalUrl } : reference,
            ),
            previewUrl: preview.previewUrl,
            mediaWidth: preview.width,
            mediaHeight: preview.height,
            bridgeAssetId: preview.bridgeAssetId,
            mediaPersistenceState: undefined,
          });
          return;
        }
        updateNodeData(id, {
          previewUrl: preview.previewUrl,
          mediaWidth: preview.width,
          mediaHeight: preview.height,
          ...('durationSeconds' in preview ? { durationSeconds: preview.durationSeconds } : {}),
        });
      })
      .catch((error) => {
        if (isVideoNode) setPreviewGenerationFailedSource(primaryUrl);
        console.warn('[media-preview] 预览生成或旧素材迁移失败', error);
      });
    return () => {
      cancelled = true;
      if (previewGenerationSourceRef.current === primaryUrl) {
        previewGenerationSourceRef.current = null;
      }
    };
  }, [
    failedVideoPosterUrl,
    id,
    isReferenceImagePreview,
    isVideoNode,
    primaryUrl,
    sourceSignature,
    storedPreviewUrl,
    updateNodeData,
    videoPosterUrl,
  ]);

  const wantsVideoDecoder = Boolean(
    isVideoNode &&
    zoom >= 0.3 &&
    (resolvedVideoUrl || data.assetVideoId || data.effectVideoId) &&
    (selected ||
      mediaHovered ||
      trimOpen ||
      cropOpen ||
      previewPlaying ||
      previewGenerationFailedSource === primaryUrl),
  );

  useEffect(() => {
    if (!wantsVideoDecoder) {
      releaseVideoDecoder(id);
      setDecoderGranted(false);
      return;
    }
    const granted = acquireVideoDecoder(id, () => setDecoderGranted(false));
    setDecoderGranted(granted);
    return () => releaseVideoDecoder(id);
  }, [id, wantsVideoDecoder]);

  const hydrateStoredVideoSource = shouldHydrateStoredVideoSource({
    isVideoNode,
    hasDirectVideoUrl: Boolean(directVideoUrl),
    hasStoredVideoId: Boolean(data.effectVideoId || data.assetVideoId),
    zoom,
    decoderGranted,
    posterUrl: videoPosterUrl,
    failedPosterUrl: failedVideoPosterUrl,
  });

  useEffect(() => {
    if (!hydrateStoredVideoSource) {
      setEffectVideoUrl(undefined);
      return;
    }
    let cancelled = false;
    const storageKey = data.assetVideoId
      ? `asset:${data.assetVideoId}`
      : `effect:${data.effectVideoId}`;
    void acquireMediaObjectUrl(storageKey, async () => {
      let blob = data.assetVideoId ? await loadAssetVideo(data.assetVideoId) : null;
      if (!blob && data.effectVideoId) blob = await loadEffectVideo(data.effectVideoId);
      return blob;
    })
      .then((objectUrl) => {
        if (!objectUrl || cancelled) return;
        setEffectVideoUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setEffectVideoUrl(undefined);
      });
    return () => {
      cancelled = true;
      releaseMediaObjectUrl(storageKey);
    };
  }, [data.assetVideoId, data.effectVideoId, hydrateStoredVideoSource]);

  const hasImage = !!primaryUrl;
  const isPortraitCutoutResult = data.enhancementTool === 'portrait-cutout';
  const canUploadMedia = canManuallyUploadMedia(hasIncomingConnection, data.mediaInputMode);
  const hideInputPorts = shouldHideMediaNodeInputs(
    isVideoNode,
    hasIncomingConnection,
    data.referenceOnly === true,
  );
  const savedToAssetLibrary = Boolean(
    primaryUrl &&
    assets.some((asset) => {
      const assetUrl =
        asset.kind === 'video' || asset.kind === 'video-comp'
          ? preferredVideoSource(asset)
          : asset.originalUrl || asset.imageUrl || asset.images?.[0];
      return assetUrl === primaryUrl;
    }),
  );
  const hasStoredVideo = Boolean(isVideoNode && (data.assetVideoId || data.effectVideoId));
  const restoredSessionMediaUnavailable =
    data.mediaPersistenceState === 'session-only' && !hasImage && !hasStoredVideo;
  const isEmpty =
    (data.kind === 'image' || isVideoNode) && !hasImage && !hasStoredVideo && !data.generating;
  const processingError =
    typeof data.enhancementError === 'string'
      ? data.enhancementError
      : typeof data.generationError === 'string'
        ? data.generationError
        : undefined;
  const interruptedGenerationRequestId =
    typeof data.generationRequestId === 'string' && data.generationRequestId.trim()
      ? data.generationRequestId
      : undefined;
  const isComfyUiNode =
    typeof data.providerId === 'string' && data.providerId.startsWith('comfyui-');
  const showInlineProcessingError =
    Boolean(processingError) &&
    !isComfyUiNode &&
    // Generation failures are surfaced by the selected node's composer. Keep
    // local enhancement/upload errors on the node, but do not render the same
    // generation error a second time underneath the instruction box.
    (!(selected && typeof data.generationError === 'string') ||
      Boolean(interruptedGenerationRequestId));
  const pickableReference = useMemo(() => pickableCanvasMediaReference({ id, data }), [data, id]);
  const canPickAsReference = Boolean(
    referencePickerTargetId && referencePickerTargetId !== id && pickableReference,
  );
  const canPickAsMark = Boolean(markPickerTargetId && markPickerTargetId !== id && hasImage);
  const isScriptNode = data.kind === 'script';
  const editableNodeName = isVideoNode
    ? data.videoFileName || nodeTitle
    : isScriptNode
      ? data.title || t('imageNode.name.untitledScript', '未命名脚本')
      : data.imageFileName || nodeTitle;

  const beginRename = useCallback(() => {
    cancelRenameRef.current = false;
    setNameDraft(editableNodeName);
    setRenaming(true);
  }, [editableNodeName]);

  const commitRename = useCallback(() => {
    const nextName = nameDraft.trim();
    if (!cancelRenameRef.current && nextName) {
      updateNodeData(
        id,
        isVideoNode
          ? { videoFileName: nextName }
          : isScriptNode
            ? { title: nextName }
            : { imageFileName: nextName },
      );
    }
    cancelRenameRef.current = false;
    setRenaming(false);
  }, [id, isScriptNode, isVideoNode, nameDraft, updateNodeData]);

  const applyUploadedMediaAspectRatio = useCallback(
    (width: number, height: number, mediaType: 'image' | 'video') => {
      if (width <= 0 || height <= 0) return;
      const currentNode = useCanvasStore.getState().nodes.find((node) => node.id === id);
      if (!currentNode) return;
      const currentGenParams =
        currentNode.data.genParams && typeof currentNode.data.genParams === 'object'
          ? currentNode.data.genParams
          : {};
      const standardRatio = closestStandardAspectRatio(width, height);
      updateNodeData(id, {
        aspectRatio: intrinsicAspectRatio(width, height),
        genParams: {
          ...currentGenParams,
          aspectRatio: standardRatio,
          ...(mediaType === 'video' ? { videoAspectRatio: 'Auto' } : {}),
        },
      });
    },
    [id, updateNodeData],
  );

  // Use persisted dimensions and the lightweight preview. Full media is reserved for editors/export.
  useEffect(() => {
    if (data.mediaWidth && data.mediaHeight) {
      setImgSize({ w: data.mediaWidth, h: data.mediaHeight });
      return;
    }
    if (!displayPreviewUrl) {
      setImgSize(null);
      return;
    }
    if (resolvedVideoUrl) {
      setImgSize(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      const currentNode = useCanvasStore.getState().nodes.find((node) => node.id === id);
      const isUploadedImage = Boolean(
        currentNode?.data.imageFileName && primaryUrl?.startsWith('data:image/'),
      );
      if (isUploadedImage) {
        applyUploadedMediaAspectRatio(img.naturalWidth, img.naturalHeight, 'image');
      }
    };
    img.onerror = () => {
      if (!cancelled) setImgSize(null);
    };
    img.src = displayPreviewUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [
    applyUploadedMediaAspectRatio,
    data.mediaHeight,
    data.mediaWidth,
    displayPreviewUrl,
    id,
    primaryUrl,
    resolvedVideoUrl,
  ]);

  const handleUploadedVideoMetadata = useCallback(
    (video: HTMLVideoElement) => {
      const availableDuration = readMediaDuration(video);
      if (availableDuration > 0) setPreviewDuration(availableDuration);
      void resolveMediaDuration(video).then((duration) => {
        if (video.isConnected && duration > 0) setPreviewDuration(duration);
      });
      setVideoNaturalSize({ width: video.videoWidth, height: video.videoHeight });
      const currentNode = useCanvasStore.getState().nodes.find((node) => node.id === id);
      const hasOwnedVideo = Boolean(
        currentNode?.data.videoUrl ||
        currentNode?.data.videos?.[0] ||
        currentNode?.data.assetVideoId ||
        currentNode?.data.effectVideoId,
      );
      if (currentNode?.data.kind !== 'video' || !hasOwnedVideo) return;
      if (!currentNode.data.mediaWidth || !currentNode.data.mediaHeight) {
        updateNodeData(id, {
          mediaWidth: video.videoWidth,
          mediaHeight: video.videoHeight,
          durationSeconds: availableDuration || currentNode.data.durationSeconds,
        });
      }
      applyUploadedMediaAspectRatio(video.videoWidth, video.videoHeight, 'video');
    },
    [applyUploadedMediaAspectRatio, id, updateNodeData],
  );

  useEffect(() => {
    const source = resolvedVideoUrl ?? null;
    if (trimThumbnailsSourceRef.current === source) return;
    trimThumbnailsSourceRef.current = source;
    trimThumbnailGenerationRef.current = null;
    for (const url of trimThumbnailUrlsRef.current) URL.revokeObjectURL(url);
    trimThumbnailUrlsRef.current = [];
    setTrimThumbnails([]);
    setTrimThumbnailsLoading(false);
    setTrimThumbnailsError(undefined);
    setPreviewTime(0);
    const storedDuration = Number(data.durationSeconds);
    setPreviewDuration(Number.isFinite(storedDuration) && storedDuration > 0 ? storedDuration : 0);
  }, [data.durationSeconds, resolvedVideoUrl]);

  useEffect(() => {
    if (!trimOpen && !animatedImageOpen) {
      setTrimThumbnailsLoading(false);
      return;
    }
    if (!resolvedVideoUrl || trimThumbnails.length > 0) return;
    let subscribed = true;
    setTrimThumbnailsLoading(true);
    setTrimThumbnailsError(undefined);
    const generation =
      trimThumbnailGenerationRef.current?.source === resolvedVideoUrl
        ? trimThumbnailGenerationRef.current
        : {
            source: resolvedVideoUrl,
            promise: extractVideoTimelineFrameBlobs(resolvedVideoUrl, 12),
          };
    trimThumbnailGenerationRef.current = generation;
    void generation.promise
      .then((frames) => {
        if (!subscribed || trimThumbnailsSourceRef.current !== generation.source) return;
        const urls = frames.map((frame) => URL.createObjectURL(frame));
        trimThumbnailUrlsRef.current = urls;
        setTrimThumbnails(urls);
        if (trimThumbnailGenerationRef.current === generation) {
          trimThumbnailGenerationRef.current = null;
        }
        if (frames.length === 0) {
          setTrimThumbnailsError(t('imageNode.trim.noThumbnails', '未能从视频中提取缩略图'));
        }
      })
      .catch((error) => {
        if (trimThumbnailGenerationRef.current === generation) {
          trimThumbnailGenerationRef.current = null;
        }
        if (!subscribed) return;
        setTrimThumbnailsError(
          error instanceof Error
            ? error.message
            : t('imageNode.trim.thumbnailFailed', '视频缩略图提取失败，请重新打开剪辑面板'),
        );
      })
      .finally(() => {
        if (subscribed) setTrimThumbnailsLoading(false);
      });
    return () => {
      subscribed = false;
    };
  }, [animatedImageOpen, resolvedVideoUrl, t, trimOpen, trimThumbnails.length]);

  useEffect(() => {
    setCropOpen(false);
    setVideoCropRect(fitCropRect(null));
    setVideoCropError(undefined);
  }, [resolvedVideoUrl]);

  useEffect(() => {
    animatedImageAbortRef.current?.abort();
    animatedImageAbortRef.current = null;
    setAnimatedImageOpen(false);
    setAnimatedImageBusy(false);
    setAnimatedImageProgress(0);
    setAnimatedImageError(undefined);
  }, [resolvedVideoUrl]);

  const handleDownload = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const videoUrl = isVideoNode ? resolvedVideoUrl : undefined;
      const url = videoUrl || data.imageUrl || data.images?.[0];
      if (url)
        downloadMediaFile(
          url,
          videoUrl ? data.videoFileName || data.title : data.imageFileName || data.title,
          videoUrl ? 'mp4' : 'png',
        );
    },
    [
      data.imageFileName,
      data.imageUrl,
      data.images,
      data.title,
      data.videoFileName,
      isVideoNode,
      resolvedVideoUrl,
    ],
  );

  const handleSaveAsset = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (!primaryUrl || savedToAssetLibrary || data.generating) return;
      saveAsset(id);
    },
    [data.generating, id, primaryUrl, saveAsset, savedToAssetLibrary],
  );

  const handleRecoverGenerationResult = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      if (checkingGenerationResult || !interruptedGenerationRequestId) return;
      setCheckingGenerationResult(true);
      try {
        await recoverNodeGenerationResult(id);
      } finally {
        setCheckingGenerationResult(false);
      }
    },
    [checkingGenerationResult, id, interruptedGenerationRequestId, recoverNodeGenerationResult],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      requestDeleteNode(id);
    },
    [id, requestDeleteNode],
  );

  const handleUploadClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleEditMode = useCallback(
    (mode: ImageEditorMode, brushTool?: ImageEditorBrushTool) => {
      setImageEditorBrushTool(brushTool ?? 'free');
      setImageEditorMode(mode);
      setOpenModal('image-editor', id);
    },
    [id, setImageEditorBrushTool, setImageEditorMode, setOpenModal],
  );

  const handleEnhancement = useCallback(
    (tool: ImageEnhancementTool) => {
      if (tool === 'face-control') {
        setOpenModal('face-control', id);
        return;
      }
      if (tool === 'pose-adjust') {
        setOpenModal('pose-control', id);
        return;
      }
      if (
        tool === 'panorama' ||
        tool === 'quality-restore' ||
        tool === 'cutout' ||
        tool === 'remove-text'
      ) {
        setLinkedEnhancementPrompt(tool);
        return;
      }
      if (tool === 'color-grade') {
        setOpenModal('color-grading', id);
        return;
      }
      if (tool === 'portrait-cutout') {
        if (linkedEnhancementSubmitting) return;
        setLinkedEnhancementSubmitting(true);
        void createLinkedEnhancementResult(id, tool)
          .catch(() => {})
          .finally(() => setLinkedEnhancementSubmitting(false));
        return;
      }
      void applyEnhancement(id, tool).catch(() => {});
    },
    [
      applyEnhancement,
      createLinkedEnhancementResult,
      id,
      linkedEnhancementSubmitting,
      setOpenModal,
    ],
  );

  const handleGenerateLinkedEnhancement = useCallback(() => {
    if (linkedEnhancementSubmitting || !linkedEnhancementPrompt) return;
    setLinkedEnhancementSubmitting(true);
    void createLinkedEnhancementResult(id, linkedEnhancementPrompt)
      .then((created) => {
        if (created) setLinkedEnhancementPrompt(null);
      })
      .catch(() => {})
      .finally(() => setLinkedEnhancementSubmitting(false));
  }, [createLinkedEnhancementResult, id, linkedEnhancementPrompt, linkedEnhancementSubmitting]);

  const handleEnterPanorama = useCallback(() => {
    setOpenModal('panorama-viewer', id);
  }, [id, setOpenModal]);

  const handleVideoTool = useCallback(
    (action: VideoToolAction) => {
      if (action === 'edit') {
        setAnimatedImageOpen(false);
        setCropOpen(false);
        setVideoTrimError(undefined);
        setVideoTrimProgress(0);
        const nextOpen = !trimOpen;
        if (!nextOpen) setTrimPreviewRange(null);
        setTrimOpen(nextOpen);
        setTrimNodeOpen(id, nextOpen);
        return;
      }
      if (action === 'crop') {
        setAnimatedImageOpen(false);
        setTrimOpen(false);
        setTrimPreviewRange(null);
        setVideoCropError(undefined);
        setVideoCropProgress(0);
        setVideoCropRect(fitCropRect(null));
        setCropOpen((open) => !open);
        return;
      }
      if (action === 'animated-image') {
        setTrimOpen(false);
        setTrimPreviewRange(null);
        setCropOpen(false);
        setAnimatedImageError(undefined);
        setAnimatedImageProgress(0);
        setAnimatedImageOpen((open) => !open);
        return;
      }
      setAnimatedImageOpen(false);
      setTrimOpen(false);
      setTrimPreviewRange(null);
      setCropOpen(false);
      if (action === 'remake') {
        const createdId = useCanvasStore.getState().createVideoRemake(id);
        updateNodeData(id, {
          result: createdId
            ? t('imageNode.video.remake.created', '已创建并连接片段重拍节点')
            : t('imageNode.video.remake.unavailable', '当前视频无法创建片段重拍节点'),
        });
        return;
      }
      if (action === 'enhance') {
        const createdId = useCanvasStore.getState().createVideoEnhance(id);
        updateNodeData(id, {
          result: createdId
            ? t('imageNode.video.enhance.created', '已创建并连接视频高清节点')
            : t('imageNode.video.enhance.unavailable', '当前视频无法创建高清节点'),
        });
        return;
      }
      if (action === 'extend') {
        const createdId = useCanvasStore.getState().createVideoContinuation(id);
        updateNodeData(id, {
          result: createdId
            ? t('imageNode.video.extend.created', '已创建并连接智能续写节点')
            : t('imageNode.video.extend.unavailable', '当前视频无法创建智能续写节点'),
        });
        return;
      }
    },
    [id, setTrimNodeOpen, t, trimOpen, updateNodeData],
  );

  const handleVideoSubtitleRemoval = useCallback(
    (region: SubtitleRemovalRegion) => {
      setAnimatedImageOpen(false);
      setTrimOpen(false);
      setTrimPreviewRange(null);
      setCropOpen(false);
      const createdId = useCanvasStore.getState().createVideoSubtitleRemoval(id, region);
      updateNodeData(id, {
        result: createdId
          ? t('imageNode.video.subtitleRemoval.created', '已创建并连接智能去字幕节点')
          : t('imageNode.video.subtitleRemoval.unavailable', '当前视频无法创建智能去字幕节点'),
      });
    },
    [id, t, updateNodeData],
  );

  const handleVideoAudioExtraction = useCallback(() => {
    if (!resolvedVideoUrl || extractingAudio) return;
    setAnimatedImageOpen(false);
    setTrimOpen(false);
    setTrimPreviewRange(null);
    setCropOpen(false);
    const createdId = useCanvasStore.getState().createVideoAudioExtraction(id);
    if (!createdId) {
      updateNodeData(id, {
        result: t('imageNode.video.audio.unavailable', '当前视频无法提取音频'),
      });
      return;
    }

    const createdNode = useCanvasStore.getState().nodes.find((node) => node.id === createdId);
    const requestId = createdNode?.data.audioExtractionRequestId;
    if (typeof requestId !== 'string') return;
    const uploadProjectId = useCanvasStore.getState().activeProjectId;
    const controller = new AbortController();
    audioExtractionAbortRef.current?.abort();
    audioExtractionAbortRef.current = controller;
    setExtractingAudio(true);
    for (const video of videoElementsRef.current.values()) video.pause();
    updateNodeData(id, {
      result: t('imageNode.video.audio.nodeCreated', '已创建并连接音频提取节点'),
    });

    const updatePendingNode = (patch: Record<string, unknown>) => {
      const current = useCanvasStore.getState().nodes.find((node) => node.id === createdId);
      if (current?.data.audioExtractionRequestId !== requestId) return false;
      useCanvasStore.getState().updateNodeData(createdId, patch);
      return true;
    };

    void extractVideoAudioToBlob(resolvedVideoUrl, {
      signal: controller.signal,
      onProgress: (progress) => {
        updatePendingNode({
          progress,
          result: t('imageNode.video.audio.extracting', '正在实时提取原声音轨… {progress}%', {
            progress,
          }),
        });
      },
    })
      .then(async (result) => {
        const baseName = String(data.videoFileName || data.title || '视频').replace(/\.[^.]+$/, '');
        const audioFileName = `${baseName}_原声音轨.webm`;
        const sessionUrl = URL.createObjectURL(result.blob);
        if (
          !updatePendingNode({
            audioUrl: sessionUrl,
            audios: [sessionUrl],
            audioFileName,
            mediaMimeType: result.mimeType,
            mediaPersistenceState: undefined,
            audioSourceState: undefined,
            output: sessionUrl,
            progress: 100,
            result: t('imageNode.video.audio.saving', '原声音轨已提取，正在保存到本机素材库…'),
          })
        ) {
          return;
        }
        useCanvasStore.getState().propagate(createdId);

        try {
          const file = new File([result.blob], audioFileName, { type: result.mimeType });
          const item = await uploadAssetFile(file, 'audio', {
            project: uploadProjectId,
            signal: controller.signal,
          });
          if (
            updatePendingNode({
              audioUrl: item.url,
              audios: [item.url],
              audioFileName,
              output: item.url,
              bridgeAssetId: item.id,
              mediaPersistenceState: undefined,
              audioSourceState: undefined,
              generating: false,
              progress: 100,
              audioExtractionRequestId: undefined,
              result: t('imageNode.video.audio.complete', '原声音轨提取完成 · {duration}', {
                duration: formatVideoPlayerTime(result.duration, 'duration'),
              }),
            })
          ) {
            useCanvasStore.getState().propagate(createdId);
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
          updatePendingNode({
            generating: false,
            progress: 100,
            audioExtractionRequestId: undefined,
            mediaPersistenceState: 'session-only',
            audioSourceState: undefined,
            result: t(
              'imageNode.video.audio.sessionOnly',
              '原声音轨已提取，但仅在当前会话可用，刷新页面后会丢失；请启动本机 Bridge 后重试：{error}',
              {
                error:
                  error instanceof Error
                    ? error.message
                    : t('imageNode.video.audio.assetSaveFailed', '素材保存失败'),
              },
            ),
          });
        }
      })
      .catch((error) => {
        updatePendingNode({
          generating: false,
          progress: 0,
          audioExtractionRequestId: undefined,
          generationError:
            error instanceof Error
              ? error.message
              : t('imageNode.video.audio.failed', '提取原声音轨失败。'),
          result:
            error instanceof Error
              ? error.message
              : t('imageNode.video.audio.failed', '提取原声音轨失败。'),
        });
      })
      .finally(() => {
        if (audioExtractionAbortRef.current === controller) audioExtractionAbortRef.current = null;
        setExtractingAudio(false);
      });
  }, [data.title, data.videoFileName, extractingAudio, id, resolvedVideoUrl, t, updateNodeData]);

  const handleVideoVisualEdit = useCallback(() => {
    setAnimatedImageOpen(false);
    setTrimOpen(false);
    setTrimPreviewRange(null);
    setCropOpen(false);
    const createdId = useCanvasStore.getState().createVideoVisualEdit(id);
    updateNodeData(id, {
      result: createdId
        ? t('imageNode.video.visualEdit.created', '已创建并连接画面编辑节点')
        : t('imageNode.video.visualEdit.unavailable', '当前视频无法创建画面编辑节点'),
    });
  }, [id, t, updateNodeData]);

  const registerVideoElement = useCallback((url: string, element: HTMLVideoElement | null) => {
    if (element) videoElementsRef.current.set(url, element);
    else videoElementsRef.current.delete(url);
  }, []);

  useEffect(() => {
    if (!isVideoNode) return;

    if (dragging) {
      resumeVideoAfterDragRef.current = Array.from(videoElementsRef.current.values()).some(
        (video) => !video.paused && !video.ended,
      );
      for (const video of videoElementsRef.current.values()) video.pause();
      setCaptureMenuOpen(false);
      return;
    }

    if (!resumeVideoAfterDragRef.current) return;
    resumeVideoAfterDragRef.current = false;
    if (!videoHoveredRef.current) return;
    for (const video of videoElementsRef.current.values()) {
      void video.play().catch(() => {});
    }
  }, [dragging, isVideoNode]);

  const handleMediaMouseEnter = useCallback(() => {
    videoHoveredRef.current = true;
    setMediaHovered(true);
    if (canPickAsReference || canPickAsMark) setReferenceHover(true);
    if (dragging) return;
    for (const video of videoElementsRef.current.values()) {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }, [canPickAsMark, canPickAsReference, dragging]);

  const handleMediaMouseLeave = useCallback(() => {
    videoHoveredRef.current = false;
    setMediaHovered(false);
    setReferenceHover(false);
    setCaptureMenuOpen(false);
    for (const video of videoElementsRef.current.values()) video.pause();
  }, []);

  useEffect(() => {
    if (!decoderGranted || !mediaHovered || dragging) return;
    for (const video of videoElementsRef.current.values()) {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }, [decoderGranted, dragging, mediaHovered]);

  const primaryVideoElement = useCallback(
    () => videoElementsRef.current.values().next().value as HTMLVideoElement | undefined,
    [],
  );

  useEffect(() => {
    if (!isVideoNode || !videoRemakePreviewRequest) return;
    const frame = window.requestAnimationFrame(() => {
      let displayedTime: number | null = null;
      for (const video of videoElementsRef.current.values()) {
        const duration = readMediaDuration(video) || previewDuration;
        const lastReadableTime =
          duration > 0 ? Math.max(0, duration - Math.min(0.04, duration / 100)) : undefined;
        const target = Math.max(
          0,
          lastReadableTime === undefined
            ? videoRemakePreviewRequest.time
            : Math.min(videoRemakePreviewRequest.time, lastReadableTime),
        );
        video.pause();
        video.currentTime = target;
        displayedTime ??= target;
      }
      if (displayedTime !== null) setPreviewTime(displayedTime);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isVideoNode, previewDuration, videoRemakePreviewRequest]);

  useEffect(() => {
    if (!isVideoNode || !selected || !trimOpen || !previewPlaying) return;
    let frame = 0;
    let lastSync = 0;
    const syncTimeline = (timestamp: number) => {
      const video = primaryVideoElement();
      if (timestamp - lastSync >= 100 && video && !video.paused) {
        lastSync = timestamp;
        setPreviewTime(video.currentTime);
      }
      frame = window.requestAnimationFrame(syncTimeline);
    };
    frame = window.requestAnimationFrame(syncTimeline);
    return () => window.cancelAnimationFrame(frame);
  }, [isVideoNode, previewPlaying, primaryVideoElement, selected, trimOpen]);

  const togglePreviewPlayback = useCallback(() => {
    const video = primaryVideoElement();
    if (!video) return;
    if (video.paused) {
      const range =
        trimOpen && trimPreviewRange
          ? trimPreviewRange
          : normalizeVideoTrimRange(
              readMediaDuration(video) || previewDuration,
              data.videoTrimStart,
              data.videoTrimEnd,
            );
      if (video.currentTime < range.start || video.currentTime >= range.end) {
        video.currentTime = range.start;
        setPreviewTime(range.start);
      }
      void video.play().catch(() => {});
      return;
    }
    video.pause();
  }, [
    data.videoTrimEnd,
    data.videoTrimStart,
    previewDuration,
    primaryVideoElement,
    trimOpen,
    trimPreviewRange,
  ]);

  const togglePreviewSound = useCallback(() => {
    setPreviewMuted((muted) => {
      const nextMuted = !muted;
      for (const video of videoElementsRef.current.values()) video.muted = nextMuted;
      return nextMuted;
    });
  }, []);

  const toggleCaptureMenu = useCallback(() => {
    setCaptureError(null);
    setCaptureMenuOpen((open) => !open);
  }, []);

  const handlePreviewSeek = useCallback(
    (time: number) => {
      const video = primaryVideoElement();
      if (!video) return;
      video.currentTime = time;
      setPreviewTime(time);
    },
    [primaryVideoElement],
  );

  const replaceVideoWithEditedResult = useCallback(
    async (result: VideoEditResult, suffix: 'trim' | 'crop', label: string) => {
      const baseName = (data.videoFileName || data.title || '视频').replace(/\.[^.]+$/, '');
      const extension = result.blob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${baseName}_${suffix}.${extension}`;
      const file = new File([result.blob], fileName, {
        type: result.blob.type || (extension === 'mp4' ? 'video/mp4' : 'video/webm'),
      });
      const videoEditRevision = `${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const store = useCanvasStore.getState();
      const currentNode = store.nodes.find((node) => node.id === id);
      if (!currentNode) {
        throw new Error(
          t('imageNode.video.edit.nodeMissing', '视频节点已不存在，本次编辑已取消。'),
        );
      }
      const sourceRevision = videoSourceRevision(currentNode.data);
      const currentGenParams =
        currentNode.data.genParams && typeof currentNode.data.genParams === 'object'
          ? currentNode.data.genParams
          : {};
      const bridgeItem = await persistVideoFile(file, store.activeProjectId);
      const latest = useCanvasStore.getState().nodes.find((node) => node.id === id);
      if (!latest || videoSourceRevision(latest.data) !== sourceRevision) {
        await deleteBridgeAsset(bridgeItem.bridgeAssetId).catch(() => {});
        throw new Error(
          t('imageNode.video.edit.sourceChanged', '视频来源已变更，本次编辑结果未覆盖当前节点。'),
        );
      }

      store.takeSnapshot();
      updateNodeData(id, {
        originalUrl: bridgeItem.originalUrl,
        previewUrl: bridgeItem.previewUrl,
        mediaWidth: bridgeItem.width,
        mediaHeight: bridgeItem.height,
        durationSeconds: bridgeItem.durationSeconds ?? result.duration,
        videoUrl: bridgeItem.originalUrl,
        videos: [bridgeItem.originalUrl],
        videoFileName: fileName,
        assetVideoId: undefined,
        effectVideoId: undefined,
        bridgeAssetId: bridgeItem.bridgeAssetId,
        mediaPersistenceState: undefined,
        mediaMimeType: file.type,
        output: bridgeItem.originalUrl,
        videoEditRevision,
        aspectRatio: intrinsicAspectRatio(result.width, result.height),
        genParams: {
          ...currentGenParams,
          aspectRatio: closestStandardAspectRatio(result.width, result.height),
          videoAspectRatio: 'Auto',
        },
        videoTrimStart: undefined,
        videoTrimEnd: undefined,
        result: t(
          'imageNode.video.edit.saved',
          '{label}已生成并保存 · {width} × {height} · {duration}',
          {
            label,
            width: result.width,
            height: result.height,
            duration: formatVideoPlayerTime(result.duration, 'duration'),
          },
        ),
        generationError: undefined,
      });
      setPreviewTime(0);
      setPreviewDuration(result.duration);
      store.propagate(id);
      replaceSessionVideoPoster();
    },
    [data.title, data.videoFileName, id, replaceSessionVideoPoster, t, updateNodeData],
  );

  const handleApplyVideoTrim = useCallback(
    async (range: VideoTrimRange) => {
      if (!resolvedVideoUrl || videoEditBusyRef.current) return;
      const operationId = ++videoEditOperationRef.current;
      const sourceUrl = resolvedVideoUrl;
      const sourceRevision = videoSourceRevision(data);
      videoEditBusyRef.current = true;
      setVideoTrimBusy(true);
      setVideoTrimProgress(0);
      setVideoTrimError(undefined);
      for (const video of videoElementsRef.current.values()) video.pause();
      try {
        const result = await trimVideoToBlob(sourceUrl, range, (progress) => {
          if (videoEditOperationRef.current === operationId) setVideoTrimProgress(progress);
        });
        const latest = useCanvasStore.getState().nodes.find((node) => node.id === id);
        if (
          videoEditOperationRef.current !== operationId ||
          !latest ||
          videoSourceRevision(latest.data) !== sourceRevision
        ) {
          if (videoEditOperationRef.current === operationId) {
            setVideoTrimError(
              t('imageNode.video.trim.sourceChanged', '视频来源已变更，本次剪辑已取消。'),
            );
          }
          return;
        }
        await replaceVideoWithEditedResult(
          result,
          'trim',
          t('imageNode.video.trim.operationLabel', '剪辑视频'),
        );
        setTrimOpen(false);
        setTrimPreviewRange(null);
      } catch (error) {
        if (videoEditOperationRef.current === operationId) {
          setVideoTrimError(
            error instanceof Error
              ? error.message
              : t('imageNode.video.trim.failed', '生成剪辑视频失败。'),
          );
        }
      } finally {
        if (videoEditOperationRef.current === operationId) {
          videoEditBusyRef.current = false;
          setVideoTrimBusy(false);
        }
      }
    },
    [data, id, replaceVideoWithEditedResult, resolvedVideoUrl, t],
  );

  const handleGenerateVideoCrop = useCallback(async () => {
    if (!resolvedVideoUrl || videoEditBusyRef.current) return;
    const operationId = ++videoEditOperationRef.current;
    const sourceUrl = resolvedVideoUrl;
    const sourceRevision = videoSourceRevision(data);
    const cropRect = videoCropRect;
    videoEditBusyRef.current = true;
    setVideoCropBusy(true);
    setVideoCropProgress(0);
    setVideoCropError(undefined);
    for (const video of videoElementsRef.current.values()) video.pause();
    try {
      const result = await cropVideoToBlob(sourceUrl, cropRect, (progress) => {
        if (videoEditOperationRef.current === operationId) setVideoCropProgress(progress);
      });
      const latest = useCanvasStore.getState().nodes.find((node) => node.id === id);
      if (
        videoEditOperationRef.current !== operationId ||
        !latest ||
        videoSourceRevision(latest.data) !== sourceRevision
      ) {
        if (videoEditOperationRef.current === operationId) {
          setVideoCropError(
            t('imageNode.video.crop.sourceChanged', '视频来源已变更，本次裁剪已取消。'),
          );
        }
        return;
      }
      await replaceVideoWithEditedResult(
        result,
        'crop',
        t('imageNode.video.crop.operationLabel', '裁剪视频'),
      );
      setCropOpen(false);
    } catch (error) {
      if (videoEditOperationRef.current === operationId) {
        setVideoCropError(
          error instanceof Error
            ? error.message
            : t('imageNode.video.crop.failed', '生成裁剪视频失败。'),
        );
      }
    } finally {
      if (videoEditOperationRef.current === operationId) {
        videoEditBusyRef.current = false;
        setVideoCropBusy(false);
      }
    }
  }, [data, id, replaceVideoWithEditedResult, resolvedVideoUrl, t, videoCropRect]);

  const closeAnimatedImagePanel = useCallback(() => {
    animatedImageAbortRef.current?.abort();
    animatedImageAbortRef.current = null;
    setAnimatedImageOpen(false);
    setAnimatedImageBusy(false);
  }, []);

  const handleGenerateAnimatedImage = useCallback(
    async (
      range: VideoTrimRange,
      options: Pick<AnimatedWebpOptions, 'fps' | 'maxEdge' | 'scalePercent'>,
    ) => {
      if (!resolvedVideoUrl || animatedImageBusy) return;
      const operationId = ++animatedImageOperationRef.current;
      const sourceUrl = resolvedVideoUrl;
      const sourceRevision = videoSourceRevision(data);
      const projectId = useCanvasStore.getState().activeProjectId;
      const controller = new AbortController();
      animatedImageAbortRef.current?.abort();
      animatedImageAbortRef.current = controller;
      setAnimatedImageBusy(true);
      setAnimatedImageProgress(0);
      setAnimatedImageError(undefined);
      for (const video of videoElementsRef.current.values()) video.pause();

      try {
        const result = await videoToAnimatedWebp(sourceUrl, {
          range,
          ...options,
          videoElement: primaryVideoElement(),
          signal: controller.signal,
          onProgress: (progress) => {
            if (animatedImageOperationRef.current === operationId) {
              setAnimatedImageProgress(progress);
            }
          },
        });
        const currentStore = useCanvasStore.getState();
        const sourceNode = currentStore.nodes.find((node) => node.id === id);
        if (
          controller.signal.aborted ||
          animatedImageOperationRef.current !== operationId ||
          !sourceNode ||
          videoSourceRevision(sourceNode.data) !== sourceRevision
        ) {
          throw new DOMException('视频来源已变化，动态图生成已取消。', 'AbortError');
        }

        const baseName = String(data.videoFileName || data.title || '视频').replace(/\.[^.]+$/, '');
        const title = `${baseName} · 动态图`;
        const fileName = `${baseName}_动态图.webp`;
        const file = new File([result.blob], fileName, { type: 'image/webp' });
        let imageUrl: string;
        let previewUrl: string | undefined;
        let bridgeAssetId: string | undefined;
        let persistenceResult: string;
        try {
          const item = await persistImageFile(file, 'storyboard', projectId, controller.signal);
          imageUrl = item.originalUrl;
          previewUrl = item.previewUrl;
          bridgeAssetId = item.bridgeAssetId;
          persistenceResult = t(
            'imageNode.video.animatedImage.saved',
            '动态图已生成并保存到本机素材库。',
          );
        } catch (error) {
          if (controller.signal.aborted) throw error;
          imageUrl = URL.createObjectURL(result.blob);
          persistenceResult = t(
            'imageNode.video.animatedImage.sessionOnly',
            '动态图已生成，但仅在当前会话可用；请启动本机 Bridge 后重新生成。{reason}',
            { reason: error instanceof Error && error.message ? ` ${error.message}` : '' },
          );
        }

        const latestStore = useCanvasStore.getState();
        const latestSource = latestStore.nodes.find((node) => node.id === id);
        if (!latestSource || videoSourceRevision(latestSource.data) !== sourceRevision) {
          if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
          return;
        }
        const imageNodeId = latestStore.addNodeWithImage(
          'image',
          {
            x: latestSource.position.x + (latestSource.width ?? 620) + 100,
            y: latestSource.position.y,
          },
          imageUrl,
          title,
        );
        latestStore.updateNodeData(imageNodeId, {
          imageUrl,
          images: [imageUrl],
          imageFileName: fileName,
          originalUrl: imageUrl,
          previewUrl: previewUrl || imageUrl,
          mediaWidth: result.width,
          mediaHeight: result.height,
          durationSeconds: result.duration,
          bridgeAssetId,
          mediaPersistenceState: bridgeAssetId ? undefined : 'session-only',
          mediaMimeType: 'image/webp',
          aspectRatio: `${result.width}:${result.height}`,
          animatedFromVideoId: id,
          animatedRangeStart: range.start,
          animatedRangeEnd: range.end,
          animatedFrameRate: result.fps,
          animatedScalePercent: options.scalePercent ?? 100,
          referenceOnly: true,
          result: persistenceResult,
        });
        latestStore.onConnect({
          source: id,
          target: imageNodeId,
          sourceHandle: null,
          targetHandle: null,
        });
        latestStore.updateNodeData(id, {
          result: t(
            'imageNode.video.animatedImage.complete',
            '动态图生成完成 · {frames} 帧 · {duration}',
            {
              frames: result.frameCount,
              duration: formatVideoPlayerTime(result.duration, 'duration'),
            },
          ),
        });
        if (useCanvasStore.getState().selectedNodeId === id) {
          useCanvasStore.setState((state) => ({
            nodes: state.nodes.map((node) => ({ ...node, selected: node.id === imageNodeId })),
            selectedNodeId: imageNodeId,
          }));
        }
        setAnimatedImageOpen(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (animatedImageOperationRef.current === operationId) {
          setAnimatedImageError(
            error instanceof Error
              ? error.message
              : t('imageNode.video.animatedImage.failed', '动态图生成失败。'),
          );
        }
      } finally {
        if (animatedImageAbortRef.current === controller) animatedImageAbortRef.current = null;
        if (animatedImageOperationRef.current === operationId) setAnimatedImageBusy(false);
      }
    },
    [animatedImageBusy, data, id, primaryVideoElement, resolvedVideoUrl, t],
  );

  const handleVideoTimeUpdate = useCallback(
    (video: HTMLVideoElement) => {
      const range =
        trimOpen && trimPreviewRange
          ? trimPreviewRange
          : normalizeVideoTrimRange(
              readMediaDuration(video) || previewDuration,
              data.videoTrimStart,
              data.videoTrimEnd,
            );
      const boundaryResult = applyVideoPlaybackBoundary(
        video,
        range,
        !trimOpen || trimLoopPlayback,
      );
      if (boundaryResult === 'stopped') {
        if (trimOpen) setPreviewTime(range.end);
        return;
      }
      if (boundaryResult === 'looped') {
        if (trimOpen) setPreviewTime(range.start);
        return;
      }
      if (trimOpen) setPreviewTime(video.currentTime);
    },
    [
      data.videoTrimEnd,
      data.videoTrimStart,
      previewDuration,
      trimLoopPlayback,
      trimOpen,
      trimPreviewRange,
    ],
  );

  const handleCaptureFrame = useCallback(
    async (point: VideoCapturePoint) => {
      const video = videoElementsRef.current.values().next().value as HTMLVideoElement | undefined;
      if (!video || capturingFrame) return;
      setCaptureMenuOpen(false);
      setAnimatedImageOpen(false);
      setCaptureError(null);
      setCapturingFrame(true);
      const originalTime = video.currentTime;
      const wasPaused = video.paused;
      try {
        video.pause();
        await waitForVideoReady(video, t);
        let captureTime = video.currentTime;
        if (point === 'first') captureTime = 0;
        if (point === 'last') {
          const duration = await resolveMediaDuration(video);
          if (duration <= 0) {
            throw new Error(
              t('imageNode.capture.lastFrameTimeUnavailable', '当前视频无法读取尾帧时间。'),
            );
          }
          captureTime = Math.max(0, duration - 0.05);
        }
        if (point !== 'current') await seekVideo(video, captureTime, t);

        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) {
          throw new Error(t('imageNode.capture.frameUnavailable', '当前视频还没有可截取的画面。'));
        }
        const maxDimension = 1920;
        const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error(t('imageNode.capture.canvasUnavailable', '浏览器无法创建截帧画布。'));
        }
        context.drawImage(video, 0, 0, width, height);
        const labels: Record<VideoCapturePoint, string> = {
          first: '首帧',
          last: '尾帧',
          current: '当前帧',
        };
        const sourceName = (data.videoFileName || data.title || '视频').replace(/\.[^.]+$/, '');
        const title = `${sourceName} · ${labels[point]}`;
        const frameBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(
                    new Error(t('imageNode.capture.encodeFailed', '浏览器无法编码截帧图片。')),
                  ),
            'image/jpeg',
            0.92,
          );
        });
        const frameFile = new File([frameBlob], `${title}.jpg`, { type: 'image/jpeg' });
        let bridgeAssetId: string | undefined;
        let previewUrl: string | undefined;
        let imageUrl: string;
        let persistenceResult: string;
        try {
          const item = await persistImageFile(
            frameFile,
            'storyboard',
            useCanvasStore.getState().activeProjectId,
          );
          imageUrl = item.originalUrl;
          previewUrl = item.previewUrl;
          bridgeAssetId = item.bridgeAssetId;
          persistenceResult = t('imageNode.capture.savedToBridge', '截帧已保存到本机素材库。');
        } catch (error) {
          imageUrl = URL.createObjectURL(frameBlob);
          persistenceResult = t(
            'imageNode.capture.sessionOnlyBridgeRequired',
            '截帧仅在当前会话可用，刷新页面后会丢失；请启动本机 Bridge 后重试。{reason}',
            {
              reason: error instanceof Error && error.message ? ` ${error.message}` : '',
            },
          );
        }
        const store = useCanvasStore.getState();
        const sourceNode = store.nodes.find((node) => node.id === id);
        if (!sourceNode) {
          throw new Error(t('imageNode.capture.nodeMissing', '没有找到当前视频节点。'));
        }
        const imageNodeId = store.addNodeWithImage(
          'image',
          {
            x: sourceNode.position.x + (sourceNode.width ?? 620) + 100,
            y: sourceNode.position.y,
          },
          imageUrl,
          title,
        );
        store.updateNodeData(imageNodeId, {
          images: [imageUrl],
          imageFileName: `${title}.jpg`,
          originalUrl: imageUrl,
          previewUrl: previewUrl || imageUrl,
          mediaWidth: width,
          mediaHeight: height,
          bridgeAssetId,
          mediaPersistenceState: bridgeAssetId ? undefined : 'session-only',
          mediaMimeType: frameBlob.type,
          aspectRatio: `${width}:${height}`,
          capturedFromVideoId: id,
          capturedAt: captureTime,
          referenceOnly: true,
          result: persistenceResult,
        });
        store.onConnect({
          source: id,
          target: imageNodeId,
          sourceHandle: null,
          targetHandle: null,
        });
        useCanvasStore.setState((state) => ({
          nodes: state.nodes.map((node) => ({ ...node, selected: node.id === imageNodeId })),
          selectedNodeId: imageNodeId,
        }));
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : t('imageNode.capture.failed', '视频截帧失败。'),
        );
      } finally {
        if (point !== 'current' && Math.abs(video.currentTime - originalTime) > 0.01) {
          await seekVideo(video, originalTime, t).catch(() => {});
        }
        if (!wasPaused && videoHoveredRef.current) void video.play().catch(() => {});
        setCapturingFrame(false);
      }
    },
    [capturingFrame, data.title, data.videoFileName, id, t],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (isVideoNode && !file.type.startsWith('video/')) {
        updateNodeData(id, {
          generationError: t('imageNode.upload.videoOnly', '视频节点仅支持上传视频文件。'),
          enhancementError: undefined,
        });
        e.currentTarget.value = '';
        return;
      }

      if (isVideoNode) {
        const input = e.currentTarget;
        const operationId = ++mediaUploadOperationRef.current;
        const projectId = useCanvasStore.getState().activeProjectId;
        const sessionVideoUrl = URL.createObjectURL(file);
        updateNodeData(id, {
          originalUrl: sessionVideoUrl,
          previewUrl: undefined,
          mediaWidth: undefined,
          mediaHeight: undefined,
          durationSeconds: undefined,
          videoUrl: sessionVideoUrl,
          videos: [sessionVideoUrl],
          videoFileName: file.name,
          effectVideoId: undefined,
          assetVideoId: undefined,
          bridgeAssetId: undefined,
          mediaPersistenceState: undefined,
          mediaMimeType: file.type,
          imageUrl: undefined,
          images: undefined,
          output: sessionVideoUrl,
          result: t('imageNode.upload.videoSaving', '正在把视频保存到本机素材库…'),
        });
        useCanvasStore.getState().propagate(id);
        try {
          const bridgeItem = await persistVideoFile(file, projectId, (poster) => {
            const current = useCanvasStore.getState().nodes.find((node) => node.id === id);
            if (
              mediaUploadOperationRef.current !== operationId ||
              current?.data.videoUrl !== sessionVideoUrl
            ) {
              return;
            }
            replaceSessionVideoPoster(sessionVideoUrl, poster.blob);
            updateNodeData(id, {
              mediaWidth: poster.width,
              mediaHeight: poster.height,
              durationSeconds: poster.durationSeconds,
            });
          });
          const updatedNodeIds = updateNodesSharingSessionVideo(sessionVideoUrl, {
            originalUrl: bridgeItem.originalUrl,
            previewUrl: bridgeItem.previewUrl,
            mediaWidth: bridgeItem.width,
            mediaHeight: bridgeItem.height,
            durationSeconds: bridgeItem.durationSeconds,
            videoUrl: bridgeItem.originalUrl,
            videos: [bridgeItem.originalUrl],
            videoFileName: file.name,
            effectVideoId: undefined,
            assetVideoId: undefined,
            bridgeAssetId: bridgeItem.bridgeAssetId,
            mediaPersistenceState: undefined,
            imageUrl: undefined,
            images: undefined,
            output: bridgeItem.originalUrl,
            result: t('imageNode.upload.videoSaved', '视频已保存到本机素材库，可用于视频合成。'),
          });
          if (updatedNodeIds.length === 0) return;
          for (const nodeId of updatedNodeIds) useCanvasStore.getState().propagate(nodeId);
          replaceSessionVideoPoster();
        } catch (error) {
          if (mediaUploadOperationRef.current === operationId) {
            updateNodesSharingSessionVideo(sessionVideoUrl, {
              assetVideoId: undefined,
              bridgeAssetId: undefined,
              mediaPersistenceState: 'session-only',
              result: t(
                'imageNode.upload.videoSessionOnlyBridgeRequired',
                '视频仅在当前会话可用，刷新页面后会丢失；请启动本机 Bridge 后重新上传。{reason}',
                {
                  reason: error instanceof Error && error.message ? ` ${error.message}` : '',
                },
              ),
            });
          }
        } finally {
          input.value = '';
        }
        return;
      }

      const saveUploadedImage = (
        imageUrl: string,
        metadata: { width: number; height: number },
        bridgeAssetId?: string,
        previewUrl?: string,
      ) => {
        const currentNode = useCanvasStore.getState().nodes.find((node) => node.id === id);
        const existingReferences = Array.isArray(currentNode?.data.composerReferences)
          ? currentNode.data.composerReferences.filter((item) => Boolean(item?.id))
          : [];
        const imagePatch = {
          originalUrl: imageUrl,
          previewUrl: previewUrl || mediaPreviewUrl(imageUrl, 'image'),
          mediaWidth: metadata.width,
          mediaHeight: metadata.height,
          bridgeAssetId,
          mediaPersistenceState: bridgeAssetId ? undefined : ('session-only' as const),
          mediaMimeType: file.type,
          imageUrl,
          images: [imageUrl],
          imageFileName: file.name,
          output: imageUrl,
        };
        const retainedReferences = existingReferences.filter(
          (item) => item.id !== `uploaded-image:${id}` && item.id !== `uploaded-frame:${id}`,
        );
        if (!isVideoNode) {
          updateNodeData(id, {
            ...imagePatch,
            referenceOnly: true,
            composerReferences: retainedReferences,
          });
          useCanvasStore.getState().propagate(id);
          return;
        }

        updateNodeData(id, {
          ...imagePatch,
          videoUrl: undefined,
          videos: undefined,
          videoFileName: undefined,
          effectVideoId: undefined,
          assetVideoId: undefined,
          output: undefined,
          composerReferences: retainedReferences,
        });
        useCanvasStore.getState().propagate(id);
      };

      const operationId = ++mediaUploadOperationRef.current;
      const projectId = useCanvasStore.getState().activeProjectId;
      try {
        const item = await persistImageFile(file, 'character', projectId);
        if (mediaUploadOperationRef.current !== operationId) return;
        const metadata = { width: item.width, height: item.height };
        applyUploadedMediaAspectRatio(metadata.width, metadata.height, 'image');
        saveUploadedImage(item.originalUrl, metadata, item.bridgeAssetId, item.previewUrl);
        updateNodeData(id, {
          result: t('imageNode.upload.imageSaved', '图片已保存到本机素材库。'),
        });
      } catch (error) {
        if (mediaUploadOperationRef.current !== operationId) return;
        const sessionUrl = URL.createObjectURL(file);
        const metadata = await createImageBitmap(file).then((bitmap) => {
          const result = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
          return result;
        });
        saveUploadedImage(sessionUrl, metadata);
        updateNodeData(id, {
          result:
            error instanceof Error
              ? t('imageNode.upload.imageSessionOnlyWithError', '图片仅在当前会话可用：{error}', {
                  error: `${error.message}；刷新页面后会丢失，请启动本机 Bridge 后重新上传`,
                })
              : t(
                  'imageNode.upload.imageSessionOnlyBridgeRequired',
                  '图片仅在当前会话可用，刷新页面后会丢失；请启动本机 Bridge 后重新上传。',
                ),
        });
      }
      e.target.value = '';
    },
    [
      applyUploadedMediaAspectRatio,
      id,
      isVideoNode,
      replaceSessionVideoPoster,
      t,
      updateNodeData,
      updateNodesSharingSessionVideo,
    ],
  );

  const handleReferencePick = useCallback(
    (event: React.MouseEvent) => {
      if (!canPickAsReference || !referencePickerTargetId || !pickableReference) return;
      event.preventDefault();
      event.stopPropagation();
      const target = useCanvasStore
        .getState()
        .nodes.find((node) => node.id === referencePickerTargetId);
      if (!target) return;
      const currentReferences = target.data.composerReferences ?? [];
      const references = appendComposerReference(target.data.composerReferences, pickableReference);
      if (references.length > currentReferences.length) {
        updateNodeData(referencePickerTargetId, {
          composerReferences: references,
        });
      }
      setReferencePickerTargetId(null);
    },
    [
      canPickAsReference,
      pickableReference,
      referencePickerTargetId,
      setReferencePickerTargetId,
      updateNodeData,
    ],
  );

  const handleMarkPick = useCallback(
    (event: React.MouseEvent) => {
      if (!canPickAsMark || !markPickerTargetId || !primaryUrl) return false;
      event.preventDefault();
      event.stopPropagation();
      const target = useCanvasStore.getState().nodes.find((node) => node.id === markPickerTargetId);
      if (!target) return false;
      const marks = Array.isArray(target.data.composerMarks) ? target.data.composerMarks : [];
      updateNodeData(markPickerTargetId, {
        composerMarks: [
          ...marks,
          {
            id: `mark-${Date.now().toString(36)}`,
            sourceNodeId: id,
            sourceUrl: primaryUrl,
            label: '图片主体',
            category: '其它',
            bbox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
          },
        ],
      });
      setMarkPickerTargetId(null);
      return true;
    },
    [canPickAsMark, id, markPickerTargetId, primaryUrl, setMarkPickerTargetId, updateNodeData],
  );

  const { width: mediaWidth, height: mediaHeight } = resolveMediaFrameSize(
    data.aspectRatio,
    data.canvasFrameWidth,
    data.canvasFrameHeight,
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, mediaHeight, mediaWidth, updateNodeInternals]);

  const lowZoomMediaPreviewUrl = isVideoNode ? videoPosterUrl : displayImageUrl;

  if (zoom < 0.3) {
    return (
      <div
        ref={nodeRef}
        data-theme-role="node-surface"
        className={`relative overflow-hidden rounded-xl border bg-[#1a1a1c] transition-[border-color,box-shadow] ${
          selected ? SELECTED_NODE_FRAME_CLASS : 'border-white/[0.08]'
        }`}
        style={{ width: mediaWidth, height: mediaHeight }}
      >
        {lowZoomMediaPreviewUrl && (
          <img
            data-low-zoom-media-preview="true"
            src={lowZoomMediaPreviewUrl}
            alt={data.title}
            loading="eager"
            decoding="async"
            draggable={false}
            className={`pointer-events-none absolute inset-0 h-full w-full select-none bg-[#111113] ${
              isVideoNode || isPortraitCutoutResult ? 'object-contain' : 'object-cover'
            }`}
          />
        )}
        <NodePorts
          kind={data.kind}
          nodeRef={nodeRef}
          selected={showSingleNodeControls}
          zoom={zoom}
          hideInputs={hideInputPorts}
        />
      </div>
    );
  }

  const mediaFileName = editableNodeName;
  const isVideoEnhanceNode =
    isVideoNode &&
    typeof data.composerParams === 'object' &&
    data.composerParams !== null &&
    data.composerParams.videoTool === 'enhance';
  const configuredVideoTool = resolveVideoToolAction(data.composerParams?.videoTool);
  const showTopBar = showSingleNodeControls;
  const showActionBar =
    showSingleNodeControls && hasImage && !isVideoNode && !isScriptNode && !isEffectAsset;
  const showVideoActionBar = shouldShowVideoNodeActionBar({
    selected: showSingleNodeControls,
    isVideoNode,
    hasVideoSource: Boolean(resolvedVideoUrl),
    isEffectAsset,
  });
  return (
    <div ref={nodeRef} className="group relative flex flex-col" style={{ width: mediaWidth }}>
      <input
        ref={fileRef}
        type="file"
        accept={isVideoNode ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={handleFileChange}
      />
      {showActionBar && (
        <ImageNodeActionBar
          onEdit={handleEditMode}
          onUpload={handleUploadClick}
          onDownload={() => handleDownload()}
          onSaveAsset={() => handleSaveAsset()}
          onEnhance={handleEnhancement}
          onEnterPanorama={handleEnterPanorama}
          savedToAssetLibrary={savedToAssetLibrary}
          showUpload={canUploadMedia}
          busy={data.generating === true || linkedEnhancementSubmitting}
        />
      )}
      {showVideoActionBar && (
        <VideoNodeActionBar
          busy={
            data.generating === true ||
            capturingFrame ||
            extractingAudio ||
            videoCropBusy ||
            videoTrimBusy ||
            animatedImageBusy
          }
          activeTool={
            trimOpen
              ? 'edit'
              : cropOpen
                ? 'crop'
                : animatedImageOpen
                  ? 'animated-image'
                  : configuredVideoTool
          }
          onTool={handleVideoTool}
          onRemoveSubtitles={handleVideoSubtitleRemoval}
          onExtractAudio={handleVideoAudioExtraction}
          onVisualEdit={handleVideoVisualEdit}
          onCaptureFrame={(point) => void handleCaptureFrame(point)}
          onDownload={() => handleDownload()}
          onFullscreen={() => setOpenModal('media-preview', id)}
        />
      )}
      {showVideoActionBar && trimOpen && resolvedVideoUrl && (
        <VideoTrimPanel
          videoUrl={resolvedVideoUrl}
          thumbnails={trimThumbnails}
          thumbnailsLoading={trimThumbnailsLoading}
          thumbnailsError={trimThumbnailsError}
          duration={previewDuration}
          initialStart={data.videoTrimStart}
          initialEnd={data.videoTrimEnd}
          currentTime={previewTime}
          playing={previewPlaying}
          busy={videoTrimBusy}
          progress={videoTrimProgress}
          error={videoTrimError}
          onPreview={handlePreviewSeek}
          onTogglePlayback={togglePreviewPlayback}
          onRangeChange={setTrimPreviewRange}
          onLoopPlaybackChange={setTrimLoopPlayback}
          onCancel={() => {
            setTrimOpen(false);
            setTrimPreviewRange(null);
          }}
          onApply={handleApplyVideoTrim}
        />
      )}
      {showVideoActionBar && animatedImageOpen && resolvedVideoUrl && (
        <VideoAnimatedImagePanel
          thumbnails={trimThumbnails}
          thumbnailsLoading={trimThumbnailsLoading}
          thumbnailsError={trimThumbnailsError}
          duration={previewDuration}
          sourceWidth={videoNaturalSize.width || data.mediaWidth || 0}
          sourceHeight={videoNaturalSize.height || data.mediaHeight || 0}
          busy={animatedImageBusy}
          progress={animatedImageProgress}
          error={animatedImageError}
          onPreview={handlePreviewSeek}
          onCancel={closeAnimatedImagePanel}
          onGenerate={(range, options) => void handleGenerateAnimatedImage(range, options)}
        />
      )}
      <PanoramaGenerationPrompt
        visible={showSingleNodeControls && linkedEnhancementPrompt !== null}
        submitting={linkedEnhancementSubmitting}
        title={
          linkedEnhancementPrompt === 'quality-restore'
            ? t('imageNode.enhancement.quality.title', '高清修复')
            : linkedEnhancementPrompt === 'cutout'
              ? t('imageNode.enhancement.cutout.title', '智能扣图')
              : linkedEnhancementPrompt === 'remove-text'
                ? t('imageNode.enhancement.removeText.title', '去文字')
                : t('imageNode.enhancement.panorama.title', '生成全景图')
        }
        description={
          linkedEnhancementPrompt === 'quality-restore'
            ? t(
                'imageNode.enhancement.quality.description',
                '关联当前图片并创建一个新的高清修复图片节点',
              )
            : linkedEnhancementPrompt === 'cutout'
              ? t(
                  'imageNode.enhancement.cutout.description',
                  '智能识别主体，一键去除背景并创建新的透明图片节点',
                )
              : linkedEnhancementPrompt === 'remove-text'
                ? t(
                    'imageNode.enhancement.removeText.description',
                    '智能识别并移除图片上的文字和水印，创建新的修复图片节点',
                  )
                : undefined
        }
        anchorRef={nodeRef}
        onClose={() => setLinkedEnhancementPrompt(null)}
        onGenerate={handleGenerateLinkedEnhancement}
      />
      {/* ── Node frame ── */}
      <div
        data-theme-role="node-surface"
        onMouseEnter={handleMediaMouseEnter}
        onMouseLeave={handleMediaMouseLeave}
        onClick={(event) => {
          if (handleMarkPick(event)) return;
          handleReferencePick(event);
        }}
        className={`relative flex w-full flex-col overflow-hidden rounded-xl border bg-[#242424] transition-all ${
          canPickAsMark && referenceHover
            ? 'border-amber-200 shadow-[0_0_0_2px_rgba(251,191,36,0.3),0_0_24px_rgba(251,191,36,0.22)]'
            : canPickAsReference && referenceHover
              ? 'border-sky-300 shadow-[0_0_0_2px_rgba(96,165,250,0.32),0_0_24px_rgba(96,165,250,0.28)]'
              : selected
                ? SELECTED_NODE_FRAME_CLASS
                : 'border-white/35 shadow-[0_2px_10px_rgba(0,0,0,0.25)] hover:border-white/50'
        }`}
      >
        {/* ── Media body ──
            isolation:isolate  creates a fresh stacking context so absolutely NOTHING
            from the parent canvas (dot-grid, Background, etc.) can bleed through.
            Every visible branch has an explicit opaque background.
         */}
        <div
          data-image-rename-target="true"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginRename();
          }}
          className="relative w-full overflow-hidden bg-[#242424]"
          style={{ isolation: 'isolate', height: mediaHeight }}
        >
          {data.generating && (
            <div className="absolute inset-x-0 top-0 z-20 h-0.5 bg-white/10">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${data.progress ?? 0}%` }}
              />
            </div>
          )}

          {isVideoNode && resolvedVideoUrl && (
            <div
              className={`pointer-events-none absolute z-40 transition-opacity ${selected ? 'inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-3 pt-12 opacity-100' : 'bottom-3 right-3 opacity-0 group-hover:opacity-100'}`}
            >
              {captureMenuOpen && (
                <div
                  className={`nodrag nopan pointer-events-auto absolute w-28 rounded-xl border border-white/10 bg-[#202022] p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.55)] ${selected ? 'bottom-12 right-3' : 'bottom-11 right-0'}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {(
                    [
                      ['first', t('node.video.firstFrame', '截取首帧')],
                      ['last', t('node.video.lastFrame', '截取尾帧')],
                      ['current', t('node.video.currentFrame', '截取当前帧')],
                    ] as const
                  ).map(([point, label]) => (
                    <button
                      key={point}
                      type="button"
                      disabled={capturingFrame}
                      onClick={() => void handleCaptureFrame(point)}
                      className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {captureError && (
                <div
                  className={`pointer-events-auto absolute w-52 rounded-lg border border-red-300/20 bg-[#241c1e] px-3 py-2 text-[11px] leading-relaxed text-red-100 shadow-xl ${selected ? 'bottom-12 right-3' : 'bottom-11 right-0'}`}
                >
                  {captureError}
                </div>
              )}
              {selected ? (
                <VideoPlaybackControls
                  sourceRevision={sourceSignature}
                  duration={previewDuration}
                  playing={previewPlaying}
                  muted={previewMuted}
                  capturingFrame={capturingFrame}
                  getVideoElement={primaryVideoElement}
                  onTogglePlayback={togglePreviewPlayback}
                  onSeek={handlePreviewSeek}
                  onToggleSound={togglePreviewSound}
                  onToggleCaptureMenu={toggleCaptureMenu}
                />
              ) : (
                <button
                  type="button"
                  disabled={capturingFrame}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCaptureMenu();
                  }}
                  className="nodrag nopan pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/65 text-white/85 shadow-lg backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-black/80 hover:text-white disabled:cursor-wait disabled:opacity-60"
                  title={t('imageNode.capture.action', '截取视频画面')}
                  aria-label={t('imageNode.capture.action', '截取视频画面')}
                >
                  {capturingFrame ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          )}
          {sourceMarks.map((mark) => (
            <div
              key={mark.id}
              className="pointer-events-none absolute z-30 border border-amber-200/90 bg-amber-200/10"
              style={{
                left: `${mark.bbox.x * 100}%`,
                top: `${mark.bbox.y * 100}%`,
                width: `${mark.bbox.width * 100}%`,
                height: `${mark.bbox.height * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-0 rounded bg-[#202023] px-2 py-1 text-[11px] text-amber-100 shadow-lg">
                {mark.label} · {mark.category}
              </span>
            </div>
          ))}

          {(resolvedVideoUrl || (data.videos && data.videos.length > 1)) && decoderGranted ? (
            data.videos && data.videos.length > 1 ? (
              <div className="relative z-10 grid h-full w-full grid-cols-2 gap-0.5 bg-[#111113]">
                {data.videos.map((url) => (
                  <video
                    key={`${sourceSignature}:${resolveMediaSourceUrl(url)}`}
                    ref={(element) => registerVideoElement(resolveMediaSourceUrl(url), element)}
                    src={resolveMediaSourceUrl(url)}
                    poster={videoPosterUrl}
                    autoPlay={showingDirectorPrevis}
                    loop={!trimOpen || trimLoopPlayback}
                    playsInline
                    muted={showingDirectorPrevis || previewMuted}
                    preload={showingDirectorPrevis || !videoPosterUrl ? 'auto' : 'none'}
                    onPlay={() => setPreviewPlaying(true)}
                    onPause={() => setPreviewPlaying(false)}
                    onTimeUpdate={(event) => handleVideoTimeUpdate(event.currentTarget)}
                    onEnded={(event) => handleVideoTimeUpdate(event.currentTarget)}
                    onDurationChange={(event) => handleUploadedVideoMetadata(event.currentTarget)}
                    onLoadedMetadata={(event) => handleUploadedVideoMetadata(event.currentTarget)}
                    className="pointer-events-none h-full w-full select-none bg-black object-contain"
                  />
                ))}
              </div>
            ) : (
              <video
                key={`${sourceSignature}:${effectVideoUrl ?? ''}`}
                ref={(element) => {
                  if (resolvedVideoUrl) registerVideoElement(resolvedVideoUrl, element);
                }}
                src={resolvedVideoUrl}
                poster={videoPosterUrl}
                autoPlay={showingDirectorPrevis}
                loop={!trimOpen || trimLoopPlayback}
                playsInline
                muted={showingDirectorPrevis || previewMuted}
                preload={showingDirectorPrevis || !videoPosterUrl ? 'auto' : 'none'}
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
                onTimeUpdate={(event) => handleVideoTimeUpdate(event.currentTarget)}
                onEnded={(event) => handleVideoTimeUpdate(event.currentTarget)}
                onDurationChange={(event) => handleUploadedVideoMetadata(event.currentTarget)}
                onLoadedMetadata={(event) => handleUploadedVideoMetadata(event.currentTarget)}
                className="pointer-events-none relative z-10 h-full w-full select-none bg-black object-contain"
              />
            )
          ) : isVideoNode && videoPosterUrl ? (
            <img
              src={videoPosterUrl}
              alt={t('imageNode.preview.videoPosterAlt', '{title} 视频海报', {
                title: data.title,
              })}
              loading="eager"
              decoding="async"
              draggable={false}
              onLoad={() => {
                if (failedVideoPosterUrl === videoPosterUrl) setFailedVideoPosterUrl(null);
              }}
              onError={() => setFailedVideoPosterUrl(videoPosterUrl)}
              className="pointer-events-none relative z-10 h-full w-full select-none bg-black object-contain"
            />
          ) : isVideoNode && !isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1b1b1e] text-white/30">
              <Video className="h-14 w-14" strokeWidth={1} />
              <span className="text-[12px]">
                {t('imageNode.preview.preparingVideoPoster', '正在准备视频海报…')}
              </span>
            </div>
          ) : primaryUrl && displayImageUrl ? (
            <div
              className={`absolute inset-0 ${isPortraitCutoutResult ? '' : 'bg-[#111113]'}`}
              style={{
                isolation: 'isolate',
                ...(isPortraitCutoutResult
                  ? {
                      backgroundColor: '#202024',
                      backgroundImage:
                        'linear-gradient(45deg,#343438 25%,transparent 25%),linear-gradient(-45deg,#343438 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#343438 75%),linear-gradient(-45deg,transparent 75%,#343438 75%)',
                      backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
                      backgroundSize: '20px 20px',
                    }
                  : {}),
              }}
            >
              <img
                src={displayImageUrl || thumbUrl(primaryUrl)}
                alt={data.title}
                loading="eager"
                decoding="async"
                draggable={false}
                data-media-quality={useOriginalImage ? 'original' : 'preview'}
                onError={() => {
                  if (useOriginalImage && resolvedOriginalImageUrl) {
                    setFailedOriginalImageUrl(resolvedOriginalImageUrl);
                  }
                }}
                className={`pointer-events-none absolute inset-0 h-full w-full select-none ${
                  isPortraitCutoutResult ? 'object-contain' : 'bg-[#111113] object-cover'
                }`}
              />
            </div>
          ) : primaryUrl ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1b1b1e] text-white/30">
              <ImageIcon className="h-14 w-14" strokeWidth={1} />
              <span className="text-[12px]">
                {t('imageNode.preview.preparingImage', '正在准备图片预览…')}
              </span>
            </div>
          ) : isEmpty ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[#242424] p-5">
              {isVideoNode ? (
                <Video className="h-20 w-20 text-white/25" strokeWidth={1} />
              ) : (
                <ImageIcon className="h-20 w-20 text-white/25" strokeWidth={1} />
              )}
              {isVideoEnhanceNode && (
                <span className="text-center text-[13px] text-white/45">
                  {data.description ||
                    t('imageNode.preview.videoEnhanceHint', '配置参数生成高清视频')}
                </span>
              )}
              {restoredSessionMediaUnavailable && (
                <span className="max-w-[280px] text-center text-[12px] leading-relaxed text-amber-200/75">
                  {t(
                    'imageNode.preview.sessionMediaUnavailable',
                    '上次会话中的媒体无法在刷新后恢复，请重新上传原文件。',
                  )}
                </span>
              )}
              {canUploadMedia && (
                <div className="nodrag nopan flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                    title={
                      isVideoNode
                        ? t('node.video.upload', '上传视频文件')
                        : t('imageNode.upload.imageTitle', '上传参考图进行图生图')
                    }
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {isVideoNode
                      ? t('node.video.upload', '上传视频')
                      : t('imageNode.upload.image', '上传图片')}
                  </button>
                  {!isVideoNode && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openLibraryImagePicker('style-library', id)}
                        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/10 px-2.5 py-1.5 text-[11px] text-white/55 transition-colors hover:border-emerald-300/25 hover:bg-emerald-500/10 hover:text-emerald-100"
                        title={t('imageNode.upload.fromStyleLibraryTitle', '从风格库选择节点图片')}
                      >
                        <Palette className="h-3.5 w-3.5" />
                        {t('imageNode.upload.fromStyleLibrary', '从风格库')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openLibraryImagePicker('character-library', id)}
                        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/10 px-2.5 py-1.5 text-[11px] text-white/55 transition-colors hover:border-emerald-300/25 hover:bg-emerald-500/10 hover:text-emerald-100"
                        title={t(
                          'imageNode.upload.fromCharacterLibraryTitle',
                          '从角色库选择节点图片',
                        )}
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        {t('imageNode.upload.fromCharacterLibrary', '从角色库')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {interruptedGenerationRequestId && (
                <GenerationRecoveryButton
                  busy={checkingGenerationResult}
                  onCheck={handleRecoverGenerationResult}
                  label={t('imageNode.recovery.check', '检查生成结果')}
                  checkingLabel={t('imageNode.recovery.checking', '检查中…')}
                  className="border-transparent bg-transparent text-white/45"
                />
              )}
            </div>
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 overflow-auto bg-[#1a1a1c] px-6 py-4 text-center text-[13px] leading-relaxed text-white/40">
              {data.result ||
                data.outputText ||
                data.description ||
                t('imageNode.preview.waiting', '等待生成结果…')}
            </div>
          )}

          {showSingleNodeControls && cropOpen && resolvedVideoUrl && (
            <VideoCropPanel
              rect={videoCropRect}
              sourceWidth={videoNaturalSize.width}
              sourceHeight={videoNaturalSize.height}
              busy={videoCropBusy}
              progress={videoCropProgress}
              error={videoCropError}
              onRectChange={setVideoCropRect}
              onCancel={() => {
                setCropOpen(false);
                setVideoCropError(undefined);
              }}
              onGenerate={() => void handleGenerateVideoCrop()}
            />
          )}

          {aiSkillOpen &&
            showActionBar &&
            !canPickAsMark &&
            !canPickAsReference &&
            !data.generating && (
              <div className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center">
                <AiSkillNodeDragHandle nodeId={id} label={mediaFileName} prominent />
              </div>
            )}

          {data.generating && (
            <div
              data-image-generation-status="true"
              role="status"
              aria-live="polite"
              aria-label={t('imageNode.generatingProgress', '图片生成中 {progress}%', {
                progress: data.progress ?? 0,
              })}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[1px]"
            >
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
                <span className="text-sm text-white/70">
                  {typeof data.enhancementLabel === 'string' ? `${data.enhancementLabel} · ` : ''}
                  {t('imageNode.generating', '正在生成图片')} · {data.progress ?? 0}%
                </span>
              </div>
            </div>
          )}
          {showInlineProcessingError && !data.generating && (
            <div className="nodrag nopan absolute inset-x-3 bottom-3 z-30 flex items-start gap-2 rounded-lg border border-red-300/20 bg-[#2a1d20]/95 px-3 py-2 text-[11px] leading-relaxed text-red-100 shadow-xl backdrop-blur-sm">
              <span className="min-w-0 flex-1">{processingError}</span>
              {interruptedGenerationRequestId && (
                <GenerationRecoveryButton
                  busy={checkingGenerationResult}
                  onCheck={handleRecoverGenerationResult}
                  label={t('imageNode.recovery.check', '检查生成结果')}
                  checkingLabel={t('imageNode.recovery.checking', '检查中…')}
                  className="border-red-100/20 bg-white/10 text-red-50 hover:bg-white/15"
                />
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  updateNodeData(id, {
                    enhancementError: undefined,
                    generationError: undefined,
                  });
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-100/60 hover:bg-white/10 hover:text-red-100"
                aria-label={t('imageNode.error.dismiss', '关闭图片处理错误')}
                title={t('common.close', '关闭')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Top bar (visible only when selected) ──
          Absolutely positioned so it does NOT affect the node's measured bounding
          box. This keeps alignment guides aligned to the frame border instead of
          the metadata label above it.
      */}
      {showTopBar && (
        <div className="pointer-events-auto absolute -top-8 left-0 right-0 flex h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-white/50">
            {isVideoNode ? (
              <Video className="h-3.5 w-3.5 shrink-0" />
            ) : isScriptNode ? (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            )}
            {renaming ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') {
                    cancelRenameRef.current = true;
                    setRenaming(false);
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="nodrag nopan min-w-0 max-w-48 rounded border border-white/20 bg-[#18181a] px-1.5 py-0.5 text-[12px] text-white/85 outline-none focus:border-sky-300/60"
                aria-label={
                  isVideoNode
                    ? t('imageNode.name.video', '视频名称')
                    : isScriptNode
                      ? t('imageNode.name.script', '脚本名称')
                      : t('imageNode.name.image', '图片名称')
                }
              />
            ) : (
              <button
                type="button"
                onClick={beginRename}
                className="nodrag nopan min-w-0 truncate text-left text-white/50 hover:text-white/80"
                title={
                  isVideoNode
                    ? t('imageNode.name.renameVideo', '点击修改视频名称')
                    : isScriptNode
                      ? t('imageNode.name.renameScript', '点击修改脚本名称')
                      : t('imageNode.name.renameImage', '点击修改图片名称')
                }
              >
                {mediaFileName}
              </button>
            )}
            {imgSize && (
              <span className="ml-0.5 shrink-0 tabular-nums text-white/25">
                {imgSize.w} × {imgSize.h}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
              aria-label={t('imageNode.trash', '移到回收站')}
              title={t('imageNode.trash', '移到回收站')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <NodePorts
        kind={data.kind}
        nodeRef={nodeRef}
        selected={showSingleNodeControls}
        zoom={zoom}
        hideInputs={hideInputPorts}
        videoMode={
          data.composerParams && typeof data.composerParams === 'object'
            ? String((data.composerParams as Record<string, unknown>).mode ?? '')
            : undefined
        }
      />
    </div>
  );
}

export const ImageNode = memo(ImageNodeBase);
