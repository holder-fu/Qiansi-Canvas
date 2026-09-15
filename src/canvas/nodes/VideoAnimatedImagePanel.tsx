import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NodeToolbar, Position, useViewport } from '@xyflow/react';
import { Check, Images, Loader2, X } from 'lucide-react';
import {
  normalizeVideoTrimRange,
  updateVideoTrimHandle,
  type VideoTrimRange,
} from '../../lib/videoTrim';
import {
  resolveAnimatedWebpDimensions,
  type AnimatedWebpOptions,
} from '../../lib/videoAnimatedWebp';
import { useAppTranslation } from '../../i18n/appI18n';

type VideoAnimatedImagePanelProps = {
  thumbnails: string[];
  thumbnailsLoading: boolean;
  thumbnailsError?: string;
  duration: number;
  sourceWidth: number;
  sourceHeight: number;
  busy: boolean;
  progress: number;
  error?: string;
  onPreview: (time: number) => void;
  onCancel: () => void;
  onGenerate: (
    range: VideoTrimRange,
    options: Pick<AnimatedWebpOptions, 'fps' | 'maxEdge' | 'scalePercent'>,
  ) => void;
};

type Boundary = 'start' | 'end';

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(2)} s`;
}

export function VideoAnimatedImagePanel({
  thumbnails,
  thumbnailsLoading,
  thumbnailsError,
  duration,
  sourceWidth,
  sourceHeight,
  busy,
  progress,
  error,
  onPreview,
  onCancel,
  onGenerate,
}: VideoAnimatedImagePanelProps) {
  const viewport = useViewport();
  const { t } = useAppTranslation();
  const initialRange = useMemo(() => normalizeVideoTrimRange(duration), [duration]);
  const [range, setRange] = useState(initialRange);
  const rangeRef = useRef(initialRange);
  const [dragging, setDragging] = useState<Boundary | null>(null);
  const [fps, setFps] = useState(8);
  const [maxEdge, setMaxEdge] = useState(540);
  const [scalePercent, setScalePercent] = useState(100);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = normalizeVideoTrimRange(duration, rangeRef.current.start, rangeRef.current.end);
    rangeRef.current = next;
    setRange(next);
  }, [duration]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const margin = 12;
      const bottomSafeArea = 72;
      const baseLeft = rect.left - panelOffset.x;
      const baseRight = rect.right - panelOffset.x;
      const baseTop = rect.top - panelOffset.y;
      const baseBottom = rect.bottom - panelOffset.y;
      const nextX =
        baseLeft < margin
          ? margin - baseLeft
          : baseRight > window.innerWidth - margin
            ? window.innerWidth - margin - baseRight
            : 0;
      const nextY =
        baseTop < margin
          ? margin - baseTop
          : baseBottom > window.innerHeight - bottomSafeArea
            ? window.innerHeight - bottomSafeArea - baseBottom
            : 0;
      if (Math.abs(nextX - panelOffset.x) < 0.5 && Math.abs(nextY - panelOffset.y) < 0.5) return;
      setPanelOffset({ x: nextX, y: nextY });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panelOffset.x, panelOffset.y, viewport.x, viewport.y, viewport.zoom]);

  const pointerTime = useCallback(
    (clientX: number) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) return 0;
      return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
    },
    [duration],
  );

  const updateBoundary = useCallback(
    (boundary: Boundary, time: number) => {
      const next = updateVideoTrimHandle(duration, rangeRef.current, boundary, time);
      rangeRef.current = next;
      setRange(next);
      onPreview(boundary === 'start' ? next.start : next.end);
    },
    [duration, onPreview],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => updateBoundary(dragging, pointerTime(event.clientX));
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [dragging, pointerTime, updateBoundary]);

  const startPercent = duration > 0 ? (range.start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (range.end / duration) * 100 : 100;
  const outputSize = useMemo(
    () => resolveAnimatedWebpDimensions(sourceWidth, sourceHeight, maxEdge, scalePercent),
    [maxEdge, scalePercent, sourceHeight, sourceWidth],
  );

  return (
    <NodeToolbar
      isVisible
      position={Position.Bottom}
      offset={14}
      align="center"
      className="nodrag nopan pointer-events-auto z-[220]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        className="relative flex h-[76px] w-[min(920px,calc(100vw-32px))] items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#1b1b1e]/[0.98] px-3 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{ transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)` }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={
            busy
              ? t('videoAnimatedImage.cancelGeneration', '取消动态图生成')
              : t('videoAnimatedImage.close', '关闭转动态图工具')
          }
        >
          <X className="h-5 w-5" />
        </button>
        <div className="h-8 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/80"
          title={t('node.video.animatedImage', '转动态图')}
        >
          <Images className="h-5 w-5" />
        </div>

        <div
          ref={timelineRef}
          className="relative h-14 min-w-40 flex-1 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black"
          onPointerDown={(event) => {
            if (busy || event.button !== 0 || duration <= 0) return;
            const time = pointerTime(event.clientX);
            const boundary =
              Math.abs(time - range.start) <= Math.abs(time - range.end) ? 'start' : 'end';
            setDragging(boundary);
            updateBoundary(boundary, time);
          }}
        >
          {thumbnails.length > 0 && (
            <div
              className="pointer-events-none absolute inset-0 grid opacity-90"
              style={{ gridTemplateColumns: `repeat(${thumbnails.length}, minmax(0, 1fr))` }}
            >
              {thumbnails.map((thumbnail, index) => (
                <img
                  key={`animated-image-frame-${index + 1}`}
                  src={thumbnail}
                  alt=""
                  className="h-full w-full border-r border-white/10 object-cover last:border-r-0"
                />
              ))}
            </div>
          )}
          {thumbnailsLoading && thumbnails.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-white/65">
              {t('videoAnimatedImage.preparingTimeline', '正在准备视频画面…')}
            </div>
          )}
          {!thumbnailsLoading && thumbnailsError && thumbnails.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-amber-100/75">
              {thumbnailsError}
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-y-0 bg-black/65"
            style={{ left: 0, width: `${startPercent}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 bg-black/65"
            style={{ left: `${endPercent}%`, right: 0 }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 border-y-2 border-white"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
          >
            {!busy && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-3 py-1 text-[12px] font-semibold tabular-nums text-white">
                {formatSeconds(range.end - range.start)}
              </span>
            )}
          </div>
          {(['start', 'end'] as const).map((boundary) => (
            <button
              key={boundary}
              type="button"
              disabled={busy}
              onPointerDown={(event) => {
                if (busy) return;
                event.preventDefault();
                event.stopPropagation();
                setDragging(boundary);
              }}
              className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)] after:absolute after:left-1/2 after:top-1/2 after:h-5 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-black/25 disabled:cursor-wait"
              style={{
                left: `clamp(6px, ${boundary === 'start' ? startPercent : endPercent}%, calc(100% - 6px))`,
              }}
              aria-label={
                boundary === 'start'
                  ? t('videoAnimatedImage.startPosition', '动态图开始位置')
                  : t('videoAnimatedImage.endPosition', '动态图结束位置')
              }
            />
          ))}
          {busy && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/80">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-400/20"
                style={{ width: `${progress}%` }}
              />
              <span className="relative rounded-lg bg-black/75 px-3 py-1 text-[12px] font-semibold tabular-nums text-white">
                {t('videoAnimatedImage.generating', '正在生成动态图 {progress}%', { progress })}
              </span>
            </div>
          )}
        </div>

        <label className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white/[0.07] px-2 text-[11px] text-white/60">
          <span>FPS</span>
          <select
            value={fps}
            disabled={busy}
            onChange={(event) => setFps(Number(event.target.value))}
            className="bg-transparent text-[12px] font-semibold text-white outline-none"
            aria-label={t('videoAnimatedImage.frameRate', '动态图帧率')}
          >
            {[6, 8, 10, 12].map((value) => (
              <option key={value} value={value} className="bg-[#252529]">
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 shrink-0 items-center rounded-xl bg-white/[0.07] px-2">
          <select
            value={maxEdge}
            disabled={busy}
            onChange={(event) => setMaxEdge(Number(event.target.value))}
            className="bg-transparent text-[12px] font-semibold text-white outline-none"
            aria-label={t('videoAnimatedImage.size', '动态图尺寸')}
          >
            {[360, 540, 720].map((value) => (
              <option key={value} value={value} className="bg-[#252529]">
                {value}P
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white/[0.07] px-2 text-[11px] text-white/60"
          title={t(
            'videoAnimatedImage.scaleOutput',
            '按比例缩小，输出 {width}×{height}',
            outputSize,
          )}
        >
          <span>{t('videoAnimatedImage.scaleShort', '比例')}</span>
          <select
            value={scalePercent}
            disabled={busy}
            onChange={(event) => setScalePercent(Number(event.target.value))}
            className="bg-transparent text-[12px] font-semibold text-white outline-none"
            aria-label={t('videoAnimatedImage.scale', '按比例缩小')}
          >
            {[100, 75, 50, 25].map((value) => (
              <option key={value} value={value} className="bg-[#252529]">
                {value}%
              </option>
            ))}
          </select>
          {sourceWidth > 0 && sourceHeight > 0 && (
            <span className="whitespace-nowrap text-[10px] tabular-nums text-white/40">
              {outputSize.width}×{outputSize.height}
            </span>
          )}
        </label>
        <button
          type="button"
          disabled={busy || duration <= 0}
          onClick={() => onGenerate(range, { fps, maxEdge, scalePercent })}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black shadow-[0_8px_22px_rgba(255,255,255,0.16)] transition-transform hover:scale-[1.03] disabled:cursor-wait disabled:opacity-45"
          aria-label={
            busy
              ? t('videoAnimatedImage.generating', '正在生成动态图 {progress}%', { progress })
              : t('videoAnimatedImage.generate', '生成动态图')
          }
          title={t('videoAnimatedImage.generate', '生成动态图')}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
        </button>

        {!busy && error && (
          <span className="absolute right-3 top-full mt-2 max-w-96 rounded-lg border border-red-300/20 bg-[#2a1d20] px-3 py-2 text-xs text-red-100 shadow-xl">
            {error}
          </span>
        )}
      </div>
    </NodeToolbar>
  );
}
