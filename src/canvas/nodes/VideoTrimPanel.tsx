import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NodeToolbar, Position, useViewport } from '@xyflow/react';
import { Check, Keyboard, Loader2, Magnet, Repeat2, X } from 'lucide-react';
import {
  moveVideoTrimRange,
  normalizeVideoTrimRange,
  snapVideoTrimRange,
  updateVideoTrimHandle,
  type VideoTrimRange,
} from '../../lib/videoTrim';
import { useAppTranslation } from '../../i18n/appI18n';

type TrimDragState =
  { kind: 'start' | 'end' } | { kind: 'range'; pointerTime: number; range: VideoTrimRange };

type VideoTrimPanelProps = {
  videoUrl: string;
  thumbnails: string[];
  thumbnailsLoading: boolean;
  thumbnailsError?: string;
  duration: number;
  initialStart?: number;
  initialEnd?: number;
  currentTime: number;
  playing: boolean;
  busy: boolean;
  progress: number;
  error?: string;
  onPreview: (time: number) => void;
  onTogglePlayback: () => void;
  onRangeChange: (range: VideoTrimRange) => void;
  onLoopPlaybackChange: (enabled: boolean) => void;
  onCancel: () => void;
  onApply: (range: VideoTrimRange) => void;
};

function formatTrimSeconds(seconds: number) {
  return `${Math.max(0, seconds).toFixed(2)} s`;
}

export function VideoTrimPanel({
  videoUrl,
  thumbnails,
  thumbnailsLoading,
  thumbnailsError,
  duration,
  initialStart,
  initialEnd,
  currentTime,
  playing,
  busy,
  progress,
  error,
  onPreview,
  onTogglePlayback,
  onRangeChange,
  onLoopPlaybackChange,
  onCancel,
  onApply,
}: VideoTrimPanelProps) {
  const viewport = useViewport();
  const { t } = useAppTranslation();
  const initialRange = useMemo(
    () => normalizeVideoTrimRange(duration, initialStart, initialEnd),
    [duration, initialEnd, initialStart],
  );
  const [range, setRange] = useState(initialRange);
  const rangeRef = useRef(initialRange);
  const [dragging, setDragging] = useState<TrimDragState | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [snapToSeconds, setSnapToSeconds] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(true);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const hasUsableDurationRef = useRef(duration > 0);
  const panelRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (duration <= 0) return;
    const next = hasUsableDurationRef.current
      ? normalizeVideoTrimRange(duration, rangeRef.current.start, rangeRef.current.end)
      : normalizeVideoTrimRange(duration, initialStart, initialEnd);
    hasUsableDurationRef.current = true;
    rangeRef.current = next;
    setRange(next);
  }, [duration, initialEnd, initialStart]);
  useEffect(() => onRangeChange(range), [onRangeChange, range]);
  useEffect(() => onLoopPlaybackChange(loopPlayback), [loopPlayback, onLoopPlaybackChange]);

  useLayoutEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const margin = 12;
      const bottomSafeArea = 72;
      const baseLeft = rect.left - panelOffset.x;
      const baseRight = rect.right - panelOffset.x;
      const baseTop = rect.top - panelOffset.y;
      const baseBottom = rect.bottom - panelOffset.y;
      let nextX = 0;
      let nextY = 0;
      if (baseLeft < margin) nextX = margin - baseLeft;
      else if (baseRight > window.innerWidth - margin) {
        nextX = window.innerWidth - margin - baseRight;
      }
      if (baseTop < margin) nextY = margin - baseTop;
      else if (baseBottom > window.innerHeight - bottomSafeArea) {
        nextY = window.innerHeight - bottomSafeArea - baseBottom;
      }
      if (Math.abs(nextX - panelOffset.x) < 0.5 && Math.abs(nextY - panelOffset.y) < 0.5) return;
      setPanelOffset({ x: nextX, y: nextY });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [panelOffset.x, panelOffset.y, viewport.x, viewport.y, viewport.zoom]);

  const normalizeEditingRange = useCallback(
    (candidate: VideoTrimRange) =>
      snapToSeconds
        ? snapVideoTrimRange(duration, candidate)
        : normalizeVideoTrimRange(duration, candidate.start, candidate.end),
    [duration, snapToSeconds],
  );

  const updateRange = useCallback(
    (candidate: VideoTrimRange, previewEdge: 'start' | 'end') => {
      const next = normalizeEditingRange(candidate);
      rangeRef.current = next;
      setRange(next);
      onPreview(previewEdge === 'start' ? next.start : next.end);
    },
    [normalizeEditingRange, onPreview],
  );

  const pointerTime = useCallback(
    (clientX: number) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) return 0;
      return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
    },
    [duration],
  );

  const updateHandle = useCallback(
    (handle: 'start' | 'end', time: number) => {
      updateRange(updateVideoTrimHandle(duration, rangeRef.current, handle, time), handle);
    },
    [duration, updateRange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const time = pointerTime(event.clientX);
      if (dragging.kind === 'range') {
        const next = moveVideoTrimRange(
          duration,
          dragging.range,
          dragging.range.start + time - dragging.pointerTime,
        );
        updateRange(next, time < dragging.pointerTime ? 'start' : 'end');
        return;
      }
      updateHandle(dragging.kind, time);
    };
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [dragging, duration, pointerTime, updateHandle, updateRange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (busy) return;

      const preciseStep = event.shiftKey ? 0.1 : 1;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (shortcutsOpen) setShortcutsOpen(false);
        else onCancel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (duration > 0) onApply(rangeRef.current);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        onTogglePlayback();
        return;
      }
      if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        updateHandle('start', currentTime);
        return;
      }
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        updateHandle('end', currentTime);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const current = rangeRef.current;
        const next = moveVideoTrimRange(duration, current, current.start + direction * preciseStep);
        updateRange(next, direction < 0 ? 'start' : 'end');
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const amount = event.ctrlKey || event.metaKey ? 5 : preciseStep;
        const expanding = event.key === 'ArrowUp';
        const current = rangeRef.current;
        const start = current.start + (expanding ? -amount / 2 : amount / 2);
        const end = current.end + (expanding ? amount / 2 : -amount / 2);
        const next = normalizeVideoTrimRange(duration, start, end);
        updateRange(next, expanding ? 'end' : 'start');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentTime,
    busy,
    duration,
    onApply,
    onCancel,
    onTogglePlayback,
    shortcutsOpen,
    updateHandle,
    updateRange,
  ]);

  const startPercent = duration > 0 ? (range.start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (range.end / duration) * 100 : 100;

  const toggleSnap = () => {
    const enabled = !snapToSeconds;
    setSnapToSeconds(enabled);
    if (!enabled) return;
    const next = snapVideoTrimRange(duration, rangeRef.current);
    rangeRef.current = next;
    setRange(next);
    onPreview(next.start);
  };

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
        className="relative flex h-[76px] w-[min(960px,calc(100vw-32px))] items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#1b1b1e]/[0.98] px-3 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{ transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)` }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={t('videoTrim.cancelEdit', '取消剪辑')}
          title={t('common.cancel', '取消')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="h-8 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setShortcutsOpen((open) => !open)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${shortcutsOpen ? 'bg-white/15 text-white' : 'bg-white/[0.08] text-white/75 hover:bg-white/15 hover:text-white'}`}
          aria-expanded={shortcutsOpen}
          aria-label={t('videoTrim.viewShortcuts', '查看剪辑快捷键')}
          title={t('videoTrim.shortcuts', '快捷键')}
        >
          <Keyboard className="h-5 w-5" />
        </button>

        <div
          ref={timelineRef}
          className="relative h-14 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[#282a2e]"
          onPointerDown={(event) => {
            if (busy || event.button !== 0 || duration <= 0) return;
            const time = pointerTime(event.clientX);
            const handle =
              Math.abs(time - range.start) <= Math.abs(time - range.end) ? 'start' : 'end';
            setDragging({ kind: handle });
            updateHandle(handle, time);
          }}
        >
          {thumbnails.length > 0 ? (
            <div
              className="pointer-events-none absolute inset-0 grid overflow-hidden bg-black opacity-95"
              style={{ gridTemplateColumns: `repeat(${thumbnails.length}, minmax(0, 1fr))` }}
            >
              {thumbnails.map((thumbnail, index) => {
                const frameTime =
                  thumbnails.length > 1 ? (duration * index) / (thumbnails.length - 1) : 0;
                return (
                  <img
                    key={`timeline-frame-${index + 1}`}
                    src={thumbnail}
                    alt={t('videoTrim.thumbnailAt', '视频 {time}', {
                      time: formatTrimSeconds(frameTime),
                    })}
                    data-timeline-time={frameTime.toFixed(3)}
                    className="h-full w-full border-r border-white/10 bg-black object-contain last:border-r-0"
                  />
                );
              })}
            </div>
          ) : (
            <video
              src={videoUrl}
              muted
              playsInline
              preload="auto"
              className="pointer-events-none absolute inset-0 h-full w-full bg-black object-contain opacity-80"
            />
          )}
          {thumbnailsLoading && thumbnails.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/60 text-[12px] text-white/75">
              {t('videoTrim.extractingThumbnails', '正在提取视频缩略图…')}
            </div>
          )}
          {!thumbnailsLoading && thumbnailsError && thumbnails.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/55 px-4 text-center text-[11px] text-amber-100/80">
              {thumbnailsError}
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, thumbnails.length)}, minmax(0, 1fr))`,
            }}
          >
            {Array.from(
              { length: Math.max(1, thumbnails.length) },
              (_, index) => `timeline-divider-${index + 1}`,
            ).map((divider) => (
              <span key={divider} className="border-r border-black/25 last:border-r-0" />
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 bg-black/55"
            style={{ left: 0, width: `${startPercent}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 bg-black/55"
            style={{ left: `${endPercent}%`, right: 0 }}
          />
          <div
            className={`absolute inset-y-0 z-[5] cursor-grab border-y-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.22)] ${dragging?.kind === 'range' ? 'cursor-grabbing' : ''}`}
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
            onPointerDown={(event) => {
              if (busy || event.button !== 0 || duration <= 0) return;
              event.preventDefault();
              event.stopPropagation();
              setDragging({
                kind: 'range',
                pointerTime: pointerTime(event.clientX),
                range: rangeRef.current,
              });
            }}
            aria-label={t('videoTrim.dragSelection', '拖动剪辑选区')}
          >
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[#303236]/95 px-3 py-1 text-[12px] font-semibold tabular-nums text-white shadow-lg">
              {formatTrimSeconds(range.end - range.start)}
            </span>
          </div>
          {(['start', 'end'] as const).map((handle) => {
            const percent = handle === 'start' ? startPercent : endPercent;
            return (
              <button
                key={handle}
                type="button"
                onPointerDown={(event) => {
                  if (busy) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragging({ kind: handle });
                }}
                className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.22)] after:absolute after:left-1/2 after:top-1/2 after:h-5 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-black/25"
                style={{ left: `clamp(6px, ${percent}%, calc(100% - 6px))` }}
                aria-label={
                  handle === 'start'
                    ? t('videoTrim.startPosition', '剪辑开始位置')
                    : t('videoTrim.endPosition', '剪辑结束位置')
                }
              />
            );
          })}
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={toggleSnap}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${snapToSeconds ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            aria-label={
              snapToSeconds
                ? t('videoTrim.disableSnap', '关闭整数秒吸附')
                : t('videoTrim.enableSnap', '开启整数秒吸附')
            }
            aria-pressed={snapToSeconds}
          >
            <Magnet className="h-5 w-5" />
            {!snapToSeconds && (
              <span className="absolute h-6 w-px -rotate-45 bg-current" aria-hidden="true" />
            )}
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
            {snapToSeconds
              ? t('videoTrim.disableSnap', '关闭整数秒吸附')
              : t('videoTrim.enableSnap', '开启整数秒吸附')}
          </span>
        </div>
        <div className="group relative">
          <button
            type="button"
            onClick={() => setLoopPlayback((enabled) => !enabled)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${loopPlayback ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            aria-label={
              loopPlayback
                ? t('videoTrim.disableLoop', '关闭选区循环播放')
                : t('videoTrim.enableLoop', '开启选区循环播放')
            }
            aria-pressed={loopPlayback}
          >
            <Repeat2 className="h-5 w-5" />
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
            {loopPlayback
              ? t('videoTrim.disableLoop', '关闭选区循环播放')
              : t('videoTrim.enableLoop', '开启选区循环播放')}
          </span>
        </div>
        <button
          type="button"
          disabled={busy || duration <= 0}
          onClick={() => onApply(range)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black shadow-[0_8px_22px_rgba(255,255,255,0.16)] transition-transform hover:scale-[1.03] disabled:cursor-wait disabled:opacity-45"
          aria-label={
            busy
              ? t('videoTrim.generating', '正在生成剪辑视频 {progress}%', { progress })
              : t('videoTrim.generate', '生成剪辑视频')
          }
          title={
            busy
              ? t('common.generatingProgress', '生成中 {progress}%', { progress })
              : t('videoTrim.generate', '生成剪辑视频')
          }
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Check className="h-6 w-6" strokeWidth={2.4} />
          )}
        </button>

        {busy && (
          <span className="absolute right-3 top-full mt-2 rounded-lg border border-white/10 bg-[#202024] px-3 py-1.5 text-xs tabular-nums text-white/75 shadow-xl">
            {t('videoTrim.generating', '正在生成剪辑视频 {progress}%', { progress })}
          </span>
        )}
        {!busy && error && (
          <span className="absolute right-3 top-full mt-2 max-w-96 rounded-lg border border-red-300/20 bg-[#2a1d20] px-3 py-2 text-xs text-red-100 shadow-xl">
            {error}
          </span>
        )}

        {shortcutsOpen && (
          <div className="absolute bottom-full left-0 mb-4 w-[560px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#2d2e31]/[0.99] px-6 py-5 text-[13px] text-white/75 shadow-[0_18px_48px_rgba(0,0,0,0.6)]">
            <div className="mb-5 flex items-center justify-between">
              <strong className="text-base font-semibold text-white">
                {t('videoTrim.shortcuts', '快捷键')}
              </strong>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                aria-label={t('videoTrim.closeShortcuts', '关闭快捷键说明')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              <ShortcutRow label={t('videoTrim.shortcut.move', '移动选区')} keys={['←', '→']} />
              <ShortcutRow
                label={t('videoTrim.shortcut.precise', '精确模式')}
                keys={[t('videoTrim.key.hold', '按住'), 'Shift']}
              />
              <ShortcutRow
                label={t('videoTrim.shortcut.resize', '扩展/收缩选区')}
                keys={['↑', '↓']}
              />
              <ShortcutRow
                label={t('videoTrim.shortcut.quickAdjust', '快速调整')}
                keys={['⌘/Ctrl', '+', '↑', '↓']}
              />
              <ShortcutRow
                label={t('videoTrim.shortcut.inOut', '设置出点入点')}
                keys={['I', 'O']}
              />
              <ShortcutRow
                label={t('videoTrim.shortcut.playPause', '播放/暂停')}
                keys={[playing ? `Space · ${t('videoTrim.key.pause', '暂停')}` : 'Space']}
              />
              <ShortcutRow label={t('videoTrim.shortcut.exit', '退出')} keys={['Esc']} />
              <ShortcutRow label={t('videoTrim.shortcut.confirm', '确认剪辑')} keys={['Enter']} />
            </div>
          </div>
        )}
      </div>
    </NodeToolbar>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {keys.map((key) =>
          key === '+' ? (
            <span key={key} className="text-white/50">
              +
            </span>
          ) : (
            <kbd
              key={key}
              className="min-w-8 rounded-lg bg-white/15 px-2 py-1 text-center font-sans font-semibold text-white/85 shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]"
            >
              {key}
            </kbd>
          ),
        )}
      </span>
    </div>
  );
}
