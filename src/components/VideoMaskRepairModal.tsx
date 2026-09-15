import {
  AlertTriangle,
  Brush,
  CheckCircle2,
  Clock3,
  Crosshair,
  Eraser,
  Loader2,
  Pause,
  Play,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAppTranslation } from '../i18n/appI18n';
import { useModelCatalogStore } from '../lib/modelCatalog';
import { preferredVideoSource, resolveMediaSourceUrl } from '../lib/mediaPreview';
import { resolveMediaDuration } from '../lib/mediaDuration';
import {
  formatVideoMaskRepairTime,
  hasPaintedVideoMask,
  normalizeVideoMaskRepairRange,
  suggestVideoMaskRepairRange,
  videoMaskOverlayToBinaryRgba,
} from '../lib/videoMaskRepair';
import { persistImageFile } from '../services/mediaPersistence';
import { useCanvasStore } from '../store/canvasStore';

type PaintTool = 'brush' | 'eraser';

function maskCanvasToPngBlob(canvas: HTMLCanvasElement) {
  const sourceContext = canvas.getContext('2d');
  if (!sourceContext) return Promise.reject(new Error('浏览器无法读取关键帧蒙版。'));
  const source = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
  if (!hasPaintedVideoMask(source.data)) {
    return Promise.reject(new Error('请先在关键帧上绘制需要修复的区域。'));
  }

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) return Promise.reject(new Error('浏览器无法生成关键帧蒙版。'));
  const pixels = outputContext.createImageData(output.width, output.height);
  pixels.data.set(videoMaskOverlayToBinaryRgba(source.data));
  outputContext.putImageData(pixels, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法编码 PNG 蒙版。'))),
      'image/png',
    );
  });
}

function safeMaskFileBase(value: string) {
  return (
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim()
      .slice(0, 80) || '视频'
  );
}

export function VideoMaskRepairModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const readyVideoModels = useModelCatalogStore((catalog) => catalog.readyModels.video);
  const compatibleModelCount = readyVideoModels.filter((model) =>
    (model.videoOperations as readonly string[] | undefined)?.includes('masked-repair'),
  ).length;
  const isOpen = openModal === 'video-mask-repair';
  const sourceUrl = useMemo(() => {
    const source = node ? preferredVideoSource(node.data) : undefined;
    return source ? resolveMediaSourceUrl(source) : undefined;
  }, [node]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const metadataSignatureRef = useRef('');
  const [duration, setDuration] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [keyframeTime, setKeyframeTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paintTool, setPaintTool] = useState<PaintTool>('brush');
  const [brushSize, setBrushSize] = useState(48);
  const [hasMask, setHasMask] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearMask = useCallback(() => {
    setHasMask(false);
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setDuration(0);
    setNaturalSize({ width: 0, height: 0 });
    setCurrentTime(0);
    setRangeStart(0);
    setRangeEnd(0);
    setKeyframeTime(null);
    setPlaying(false);
    setPaintTool('brush');
    setBrushSize(48);
    setPrompt('');
    setBusy(false);
    setError(null);
    metadataSignatureRef.current = '';
    window.requestAnimationFrame(clearMask);
  }, [clearMask, isOpen, modalNodeId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, closeModal, isOpen]);

  useEffect(
    () => () => {
      videoRef.current?.pause();
    },
    [],
  );

  const syncVideoMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const resolvedDuration = await resolveMediaDuration(video).catch(() => 0);
    if (!(resolvedDuration > 0)) {
      setError(t('videoMaskRepair.error.duration', '无法读取视频时长，请重新导入视频。'));
      return;
    }
    const metadataSignature = `${sourceUrl}\u0000${video.videoWidth}x${video.videoHeight}\u0000${resolvedDuration}`;
    if (metadataSignatureRef.current === metadataSignature) return;
    metadataSignatureRef.current = metadataSignature;
    setNaturalSize({ width: video.videoWidth, height: video.videoHeight });
    setDuration(resolvedDuration);
    setRangeStart(0);
    setRangeEnd(resolvedDuration);
    const canvas = maskCanvasRef.current;
    if (canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasMask(false);
    setError(null);
  }, [sourceUrl, t]);

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || duration <= 0) return;
      const next = Math.min(duration, Math.max(0, time));
      video.pause();
      video.currentTime = next;
      setCurrentTime(next);
      setPlaying(false);
    },
    [duration],
  );

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < rangeStart || video.currentTime >= rangeEnd - 0.02) {
      video.currentTime = rangeStart;
      setCurrentTime(rangeStart);
    }
    void video
      .play()
      .catch(() => setError(t('videoMaskRepair.error.play', '浏览器无法播放当前视频。')));
  }, [duration, rangeEnd, rangeStart, t]);

  const setAnchorKeyframe = useCallback(() => {
    if (!naturalSize.width || !naturalSize.height) {
      setError(t('videoMaskRepair.error.frame', '视频画面尚未就绪，请稍后再试。'));
      return;
    }
    videoRef.current?.pause();
    setPlaying(false);
    setKeyframeTime(currentTime);
    const suggestedRange = suggestVideoMaskRepairRange(duration, currentTime);
    setRangeStart(suggestedRange.rangeStart);
    setRangeEnd(suggestedRange.rangeEnd);
    clearMask();
    setError(null);
  }, [clearMask, currentTime, duration, naturalSize.height, naturalSize.width, t]);

  const maskPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * canvas.width) / Math.max(1, bounds.width),
      y: ((event.clientY - bounds.top) * canvas.height) / Math.max(1, bounds.height),
    };
  };

  const configureMaskBrush = (context: CanvasRenderingContext2D) => {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.globalCompositeOperation = paintTool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = 'rgba(34,211,238,0.58)';
    context.fillStyle = 'rgba(34,211,238,0.58)';
  };

  const beginMaskStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (keyframeTime === null || busy || event.button !== 0) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    event.preventDefault();
    event.stopPropagation();
    videoRef.current?.pause();
    setPlaying(false);
    const point = maskPoint(event);
    configureMaskBrush(context);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
    dragRef.current = { pointerId: event.pointerId, ...point };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (paintTool === 'brush') setHasMask(true);
  };

  const moveMaskStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    event.preventDefault();
    const point = maskPoint(event);
    configureMaskBrush(context);
    context.beginPath();
    context.moveTo(drag.x, drag.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    drag.x = point.x;
    drag.y = point.y;
  };

  const endMaskStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const context = event.currentTarget.getContext('2d');
    if (context) context.globalCompositeOperation = 'source-over';
    if (context && paintTool === 'eraser') {
      setHasMask(
        hasPaintedVideoMask(
          context.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height).data,
        ),
      );
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const submitRepair = useCallback(async () => {
    if (!node || !modalNodeId || keyframeTime === null || busy) return;
    const instruction = prompt.trim();
    if (!instruction) {
      setError(t('videoMaskRepair.error.prompt', '请用一句话描述希望怎样修改涂抹区域。'));
      return;
    }
    const canvas = maskCanvasRef.current;
    if (!canvas || !hasMask) {
      setError(t('videoMaskRepair.error.mask', '请先在选定画面上涂抹需要修改的位置。'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const normalized = normalizeVideoMaskRepairRange(
        duration,
        rangeStart,
        rangeEnd,
        keyframeTime,
      );
      if (!(normalized.rangeEnd > normalized.rangeStart)) {
        throw new Error(t('videoMaskRepair.error.range', '修复时段无效。'));
      }
      const blob = await maskCanvasToPngBlob(canvas);
      const baseName = safeMaskFileBase(node.data.videoFileName || node.data.title || '视频');
      const file = new File(
        [blob],
        `${baseName}_关键帧蒙版_${normalized.keyframeTime.toFixed(2)}s.png`,
        { type: 'image/png' },
      );
      const persisted = await persistImageFile(file, 'storyboard', activeProjectId);
      const createdId = useCanvasStore.getState().createVideoMaskRepair(
        modalNodeId,
        {
          maskImage: persisted.originalUrl,
          maskPreview: persisted.previewUrl,
          rangeStart: normalized.rangeStart,
          rangeEnd: normalized.rangeEnd,
          keyframeTime: normalized.keyframeTime,
          tracking: 'provider',
        },
        instruction,
      );
      if (!createdId) {
        throw new Error(
          t('videoMaskRepair.error.create', '无法创建视频局部修复任务，请确认源视频仍在画布中。'),
        );
      }
      closeModal();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('videoMaskRepair.error.save', '修复草稿保存失败，请重试。'),
      );
    } finally {
      setBusy(false);
    }
  }, [
    activeProjectId,
    busy,
    closeModal,
    duration,
    hasMask,
    keyframeTime,
    modalNodeId,
    node,
    prompt,
    rangeEnd,
    rangeStart,
    t,
  ]);

  if (!isOpen) return null;
  if (!node || !sourceUrl) {
    return (
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1c1f] p-6 text-sm text-white/75 shadow-2xl">
          <p>{t('videoMaskRepair.error.source', '当前节点没有可读取的源视频。')}</p>
          <button
            type="button"
            onClick={closeModal}
            className="mt-5 h-10 rounded-lg bg-white px-5 text-xs font-semibold text-black"
          >
            {t('common.close', '关闭')}
          </button>
        </div>
      </div>
    );
  }

  const anchorOffset =
    keyframeTime !== null && duration > 0 ? Math.min(100, (keyframeTime / duration) * 100) : null;
  const rangeLeft = duration > 0 ? (rangeStart / duration) * 100 : 0;
  const rangeWidth = duration > 0 ? ((rangeEnd - rangeStart) / duration) * 100 : 0;
  const frameRatio = naturalSize.width > 0 ? naturalSize.width / naturalSize.height : 16 / 9;
  const isAtKeyframe = keyframeTime !== null && Math.abs(currentTime - keyframeTime) <= 0.05;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('videoMaskRepair.title', '视频局部修复')}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) closeModal();
      }}
    >
      <div className="flex h-[min(94vh,880px)] w-[min(97vw,1540px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171719] shadow-2xl">
        <header className="flex min-h-16 shrink-0 items-center gap-4 border-b border-white/[0.08] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white/95">
              {t('videoMaskRepair.title', '视频局部修复')}
            </h2>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-white/45">
              <span className="truncate">{node.data.videoFileName || node.data.title}</span>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <span className="shrink-0 text-cyan-200/75">
                {t('videoMaskRepair.guide', '按 3 步完成：选画面、涂区域、写要求')}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label={t('videoMaskRepair.close', '关闭视频局部修复')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="flex min-h-0 flex-1 flex-col bg-[#0f1012] p-4">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/35 p-3">
              <div
                className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-black shadow-2xl"
                style={{ aspectRatio: frameRatio, width: 'min(100%, 1120px)' }}
              >
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  crossOrigin="anonymous"
                  muted
                  playsInline
                  preload="auto"
                  className="absolute inset-0 h-full w-full object-contain"
                  onLoadedMetadata={() => void syncVideoMetadata()}
                  onDurationChange={() => void syncVideoMetadata()}
                  onPlaying={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={(event) => {
                    const time = event.currentTarget.currentTime;
                    if (!event.currentTarget.paused && rangeEnd > rangeStart && time >= rangeEnd) {
                      event.currentTarget.pause();
                      event.currentTarget.currentTime = rangeEnd;
                      setCurrentTime(rangeEnd);
                      return;
                    }
                    setCurrentTime(time);
                  }}
                />
                <canvas
                  ref={maskCanvasRef}
                  data-video-mask-surface="true"
                  className={`absolute inset-0 h-full w-full touch-none transition-opacity ${!isAtKeyframe || busy ? 'pointer-events-none opacity-35' : 'cursor-crosshair opacity-100'}`}
                  onPointerDown={beginMaskStroke}
                  onPointerMove={moveMaskStroke}
                  onPointerUp={endMaskStroke}
                  onPointerCancel={endMaskStroke}
                  aria-label={t('videoMaskRepair.maskSurface', '视频局部修复涂抹区域')}
                />
                {keyframeTime === null && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="rounded-lg border border-white/10 bg-black/70 px-4 py-2 text-xs text-white/75">
                      {t(
                        'videoMaskRepair.setAnchorFirst',
                        '播放或拖动时间轴，停在最能看清问题的画面',
                      )}
                    </span>
                  </div>
                )}
                {keyframeTime !== null && !isAtKeyframe && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30">
                    <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/80 p-3 text-center shadow-xl">
                      <p className="text-xs text-white/65">
                        {t('videoMaskRepair.keyframe.away', '已离开选定画面')}
                      </p>
                      <button
                        type="button"
                        onClick={() => seekTo(keyframeTime)}
                        className="mt-2 h-9 rounded-lg bg-white px-4 text-xs font-semibold text-black hover:bg-white/90"
                      >
                        {t('videoMaskRepair.keyframe.returnAction', '回到选定画面继续涂抹')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#1c1d20] p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayback}
                  disabled={duration <= 0 || busy}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black disabled:opacity-35"
                  aria-label={playing ? t('common.pause', '暂停') : t('common.play', '播放')}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <span className="w-16 shrink-0 text-xs tabular-nums text-white/70">
                  {formatVideoMaskRepairTime(currentTime)}
                </span>
                <div className="relative h-7 min-w-0 flex-1">
                  <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 rounded-full bg-cyan-400/55"
                      style={{ left: `${rangeLeft}%`, width: `${Math.max(0, rangeWidth)}%` }}
                    />
                    {anchorOffset !== null && (
                      <span
                        className="absolute -top-1 h-3 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                        style={{ left: `${anchorOffset}%` }}
                      />
                    )}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.01, duration)}
                    step={0.01}
                    value={Math.min(currentTime, Math.max(0.01, duration))}
                    onChange={(event) => seekTo(Number(event.target.value))}
                    disabled={duration <= 0 || busy}
                    className="absolute inset-0 h-7 w-full cursor-pointer opacity-70"
                    aria-label={t('videoMaskRepair.timeline', '视频时间轴')}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-white/45">
                  {formatVideoMaskRepairTime(duration)}
                </span>
              </div>
            </div>
          </section>

          <aside className="w-full shrink-0 overflow-y-auto border-t border-white/[0.08] bg-[#1b1b1e] p-4 lg:w-[380px] lg:border-l lg:border-t-0">
            <div className="space-y-3">
              <section className="rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-black">
                      1
                    </span>
                    {t('videoMaskRepair.keyframe.title', '第 1 步 · 选择问题画面')}
                  </div>
                  {keyframeTime !== null && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  {t(
                    'videoMaskRepair.keyframe.hint',
                    '播放或拖动下方时间轴，停在最能看清问题的位置。',
                  )}
                </p>
                <button
                  type="button"
                  onClick={setAnchorKeyframe}
                  disabled={duration <= 0 || busy}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-35"
                >
                  <Crosshair className="h-4 w-4" />
                  {keyframeTime === null
                    ? t('videoMaskRepair.keyframe.set', '使用当前画面')
                    : t('videoMaskRepair.keyframe.reset', '改用当前画面（重置时段和涂抹）')}
                </button>
                {keyframeTime !== null && (
                  <>
                    <p className="mt-2 text-xs leading-5 text-emerald-200/75">
                      {t(
                        'videoMaskRepair.keyframe.selected',
                        '已选 {time}，默认修复 {start}–{end}',
                        {
                          time: formatVideoMaskRepairTime(keyframeTime),
                          start: formatVideoMaskRepairTime(rangeStart),
                          end: formatVideoMaskRepairTime(rangeEnd),
                        },
                      )}
                    </p>
                    <details className="mt-2 rounded-lg border border-white/[0.08] bg-black/15">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-white/55 hover:text-white/80">
                        <Clock3 className="h-3.5 w-3.5" />
                        {t('videoMaskRepair.range.advanced', '调整修复时段（可选）')}
                      </summary>
                      <div className="border-t border-white/[0.07] p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-white/55">
                            {t('videoMaskRepair.range.start', '开始（秒）')}
                            <input
                              type="number"
                              min={0}
                              max={duration}
                              step={0.1}
                              value={Number(rangeStart.toFixed(2))}
                              onChange={(event) => setRangeStart(Number(event.target.value))}
                              className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs tabular-nums text-white outline-none focus:border-cyan-300/50"
                            />
                          </label>
                          <label className="text-xs text-white/55">
                            {t('videoMaskRepair.range.end', '结束（秒）')}
                            <input
                              type="number"
                              min={0}
                              max={duration}
                              step={0.1}
                              value={Number(rangeEnd.toFixed(2))}
                              onChange={(event) => setRangeEnd(Number(event.target.value))}
                              className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs tabular-nums text-white outline-none focus:border-cyan-300/50"
                            />
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRangeStart(currentTime)}
                            className="h-9 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/[0.06]"
                          >
                            {t('videoMaskRepair.range.useStart', '当前时间设为开始')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRangeEnd(currentTime)}
                            className="h-9 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/[0.06]"
                          >
                            {t('videoMaskRepair.range.useEnd', '当前时间设为结束')}
                          </button>
                        </div>
                      </div>
                    </details>
                  </>
                )}
              </section>

              <section
                className={`rounded-xl border border-white/[0.08] bg-black/15 p-3 ${keyframeTime === null ? 'opacity-55' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/12 text-xs font-bold text-white/85">
                      2
                    </span>
                    {t('videoMaskRepair.paint.title', '第 2 步 · 涂抹要修改的位置')}
                  </div>
                  {hasMask && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />}
                </div>
                {keyframeTime === null ? (
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    {t('videoMaskRepair.paint.waiting', '完成第 1 步后，直接在左侧画面上涂抹。')}
                  </p>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPaintTool('brush')}
                        aria-pressed={paintTool === 'brush'}
                        className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-xs ${paintTool === 'brush' ? 'bg-white text-black' : 'border border-white/10 text-white/65 hover:bg-white/[0.06]'}`}
                      >
                        <Brush className="h-4 w-4" />
                        {t('videoMaskRepair.paint.brush', '画笔')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaintTool('eraser')}
                        aria-pressed={paintTool === 'eraser'}
                        className={`flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-xs ${paintTool === 'eraser' ? 'bg-white text-black' : 'border border-white/10 text-white/65 hover:bg-white/[0.06]'}`}
                      >
                        <Eraser className="h-4 w-4" />
                        {t('videoMaskRepair.paint.eraser', '橡皮')}
                      </button>
                      <button
                        type="button"
                        onClick={clearMask}
                        disabled={!hasMask || busy}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                        aria-label={t('videoMaskRepair.paint.clear', '清空涂抹')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="mt-3 flex items-center gap-3 text-xs text-white/55">
                      {t('videoMaskRepair.paint.size', '画笔大小')}
                      <input
                        type="range"
                        min={4}
                        max={160}
                        step={2}
                        value={brushSize}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                        className="min-w-0 flex-1"
                      />
                      <span className="w-12 text-right tabular-nums text-white/70">
                        {brushSize}px
                      </span>
                    </label>
                    <p className="mt-2 text-xs leading-5 text-white/42">
                      {t(
                        'videoMaskRepair.paint.hint',
                        '青色只是选区提示，不会出现在生成的视频中。',
                      )}
                    </p>
                  </>
                )}
              </section>

              <label className="block rounded-xl border border-white/[0.08] bg-black/15 p-3 text-xs font-semibold text-white/80">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/12 text-xs font-bold text-white/85">
                      3
                    </span>
                    {t('videoMaskRepair.prompt.title', '第 3 步 · 描述修改结果')}
                  </span>
                  {prompt.trim() && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />}
                </span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder={t(
                    'videoMaskRepair.prompt.placeholder',
                    '例如：修复手部结构，人物、服装、动作和背景保持不变。',
                  )}
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
                />
              </label>

              <div
                className={`rounded-xl border p-3 ${compatibleModelCount > 0 ? 'border-emerald-300/20 bg-emerald-400/[0.07]' : 'border-amber-300/25 bg-amber-400/[0.08]'}`}
              >
                <div className="flex items-start gap-2">
                  {compatibleModelCount > 0 ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  )}
                  <div className="text-xs leading-5 text-white/65">
                    <p className="font-semibold text-white/82">
                      {compatibleModelCount > 0
                        ? t('videoMaskRepair.model.available', '可生成 · {count} 个兼容模型', {
                            count: compatibleModelCount,
                          })
                        : t('videoMaskRepair.model.unavailable', '目前只能保存草稿')}
                    </p>
                    {compatibleModelCount === 0 && (
                      <p className="mt-1 text-amber-100/75">
                        {t('videoMaskRepair.model.draftOnly', '尚未连接支持视频局部修复的模型。')}
                      </p>
                    )}
                    <details className="mt-2 border-t border-white/[0.08] pt-2">
                      <summary className="cursor-pointer text-white/45 hover:text-white/70">
                        {t('videoMaskRepair.model.details', '为什么需要兼容模型？')}
                      </summary>
                      <p className="mt-1 text-white/45">
                        {t(
                          'videoMaskRepair.model.tracking',
                          '视频中的选区跟随由支持局部修复的模型完成；画布只保存修复时段、选定画面和你的涂抹。',
                        )}
                      </p>
                    </details>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300/20 bg-red-400/[0.08] px-3 py-2 text-xs leading-5 text-red-100"
                >
                  {error}
                </div>
              )}
            </div>
          </aside>
        </div>

        <footer className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-t border-white/[0.08] px-5 py-3">
          <span className="text-xs text-white/40">
            {keyframeTime === null
              ? t('videoMaskRepair.status.noKeyframe', '第 1 步：先选择问题画面')
              : !hasMask
                ? t('videoMaskRepair.status.noMask', '第 2 步：在画面上涂抹')
                : !prompt.trim()
                  ? t('videoMaskRepair.status.noPrompt', '第 3 步：填写修复要求')
                  : t('videoMaskRepair.status.ready', '可以创建视频局部修复任务')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="h-10 rounded-lg border border-white/10 px-5 text-xs font-semibold text-white/65 hover:bg-white/[0.06] disabled:opacity-35"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={() => void submitRepair()}
              disabled={
                busy || keyframeTime === null || !hasMask || !prompt.trim() || duration <= 0
              }
              className="flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy
                ? t('videoMaskRepair.saving', '正在保存修复内容…')
                : compatibleModelCount > 0
                  ? t('videoMaskRepair.createTask', '创建修复任务')
                  : t('videoMaskRepair.saveDraft', '保存修复草稿')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
