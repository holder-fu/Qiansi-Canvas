import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { extractVideoTimelineFrames } from '../lib/videoFrameExtraction';
import { resolveMediaDuration } from '../lib/mediaDuration';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';
import {
  addVideoRemakeSegment,
  getVideoRemakeDefaultSeconds,
  getVideoRemakeMinimumSeconds,
  MAX_VIDEO_REMAKE_SEGMENTS,
  normalizeVideoRemakeSegments,
  resolveVideoRemakeDragPreviewTime,
  updateIdentifiedVideoRemakeSegment,
  type IdentifiedVideoTrimRange,
  type VideoRemakeDragMode,
  type VideoTrimRange,
} from '../lib/videoTrim';
import { useAppTranslation } from '../i18n/appI18n';
import { formatVideoRemakeTimestamp } from './videoRemakePrompt';

type VideoRemakeRangeStripProps = {
  videoUrl: string;
  initialSegments?: VideoTrimRange[];
  onChange: (segments: VideoTrimRange[]) => void;
  onPreviewTimeChange?: (time: number) => void;
};

type DragState = {
  segmentId: string;
  mode: VideoRemakeDragMode;
  pointerId: number;
  snapshot: SegmentView[];
  windowOffset: number;
  initialPreviewTime: number;
};

type SegmentView = IdentifiedVideoTrimRange;

type FeedbackMessage = {
  key: string;
  fallback: string;
  params?: Record<string, string | number>;
};

let segmentSequence = 0;

function createSegmentId() {
  segmentSequence += 1;
  return `remake-segment-${segmentSequence}`;
}

function rangesEqual(left: VideoTrimRange, right: VideoTrimRange) {
  return left.start === right.start && left.end === right.end;
}

function syncSegmentViews(current: readonly SegmentView[], ranges: readonly VideoTrimRange[]) {
  const unused = [...current];
  return ranges.map((range) => {
    const matchIndex = unused.findIndex((segment) => rangesEqual(segment, range));
    if (matchIndex < 0) return { ...range, id: createSegmentId() };
    const [match] = unused.splice(matchIndex, 1);
    return match ? { ...range, id: match.id } : { ...range, id: createSegmentId() };
  });
}

function formatSeconds(seconds: number) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
}

export function VideoRemakeRangeStrip({
  videoUrl,
  initialSegments,
  onChange,
  onPreviewTimeChange,
}: VideoRemakeRangeStripProps) {
  const { t } = useAppTranslation();
  const resolvedVideoUrl = useMemo(() => resolveMediaSourceUrl(videoUrl), [videoUrl]);
  const [duration, setDuration] = useState(0);
  const [durationState, setDurationState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [frames, setFrames] = useState<string[]>([]);
  const [segments, setSegments] = useState<SegmentView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackMessage>({
    key: 'composer.remake.clickToSelect',
    fallback: '点击选择重拍片段',
  });
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const segmentsRef = useRef<SegmentView[]>([]);
  const durationRef = useRef(duration);
  const onChangeRef = useRef(onChange);
  const onPreviewTimeChangeRef = useRef(onPreviewTimeChange);

  durationRef.current = duration;
  onChangeRef.current = onChange;
  onPreviewTimeChangeRef.current = onPreviewTimeChange;

  const replaceSegments = useCallback((next: SegmentView[]) => {
    segmentsRef.current = next;
    setSegments(next);
  }, []);

  useEffect(() => {
    const video = document.createElement('video');
    let disposed = false;
    setDuration(0);
    setFrames([]);
    setDurationState('loading');
    setFeedback({
      key: 'composer.remake.readingDuration',
      fallback: '正在读取视频时长…',
    });
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = resolvedVideoUrl;
    video.load();
    void resolveMediaDuration(video).then((resolvedDuration) => {
      if (disposed) return;
      if (resolvedDuration > 0) {
        setDuration(resolvedDuration);
        setDurationState('ready');
        setFeedback({
          key: 'composer.remake.clickToSelectDuration',
          fallback: '点击选择 {duration} 重拍片段',
          params: { duration: formatSeconds(getVideoRemakeDefaultSeconds(resolvedDuration)) },
        });
        const frameCount = Math.min(30, Math.max(10, Math.ceil(resolvedDuration)));
        void extractVideoTimelineFrames(resolvedVideoUrl, frameCount, resolvedDuration)
          .then((nextFrames) => {
            if (!disposed) setFrames(nextFrames);
          })
          .catch(() => {
            if (!disposed) setFrames([]);
          });
      } else {
        setDurationState('error');
        setFeedback({
          key: 'composer.remake.durationError',
          fallback: '无法识别视频时长，请重新导入视频',
        });
      }
    });
    return () => {
      disposed = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [resolvedVideoUrl]);

  useEffect(() => {
    if (duration <= 0) return;
    if (dragRef.current) return;
    const normalized = normalizeVideoRemakeSegments(duration, initialSegments);
    replaceSegments(syncSegmentViews(segmentsRef.current, normalized));
  }, [duration, initialSegments, replaceSegments]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const currentDuration = durationRef.current;
      if (!drag || drag.pointerId !== event.pointerId || currentDuration <= 0) return;
      const bounds = timelineRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0) return;
      event.preventDefault();
      const time = ((event.clientX - bounds.left) / bounds.width) * currentDuration;
      const current = segmentsRef.current;
      const selected = current.find((segment) => segment.id === drag.segmentId);
      if (!selected) return;
      const next = updateIdentifiedVideoRemakeSegment(
        currentDuration,
        current,
        drag.segmentId,
        drag.mode,
        time,
        drag.windowOffset,
      );
      replaceSegments(next);
      const updated = next.find((segment) => segment.id === drag.segmentId);
      if (updated) {
        onPreviewTimeChangeRef.current?.(
          resolveVideoRemakeDragPreviewTime(drag.mode, time, updated),
        );
      }
    };
    const handleUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      const timeline = timelineRef.current;
      if (timeline?.hasPointerCapture(event.pointerId)) {
        timeline.releasePointerCapture(event.pointerId);
      }
      const normalizedRanges = normalizeVideoRemakeSegments(
        durationRef.current,
        segmentsRef.current,
      );
      const normalized = syncSegmentViews(segmentsRef.current, normalizedRanges);
      replaceSegments(normalized);
      setActiveId(
        normalized.some((segment) => segment.id === drag.segmentId) ? drag.segmentId : null,
      );
      onChangeRef.current(normalized.map(({ start, end }) => ({ start, end })));
    };
    const handleCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      replaceSegments(drag.snapshot);
      const timeline = timelineRef.current;
      if (timeline?.hasPointerCapture(event.pointerId)) {
        timeline.releasePointerCapture(event.pointerId);
      }
      onPreviewTimeChangeRef.current?.(drag.initialPreviewTime);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [replaceSegments]);

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, drag: Omit<DragState, 'pointerId' | 'snapshot'>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        ...drag,
        pointerId: event.pointerId,
        snapshot: segmentsRef.current,
      };
      timelineRef.current?.setPointerCapture(event.pointerId);
      onPreviewTimeChangeRef.current?.(drag.initialPreviewTime);
    },
    [],
  );

  const frameItems = useMemo(
    () =>
      (frames.length ? frames : [resolvedVideoUrl]).map((url, index) => ({
        id: `frame-${index}-${url.slice(-24)}`,
        url,
      })),
    [frames, resolvedVideoUrl],
  );
  const defaultSegmentSeconds = getVideoRemakeDefaultSeconds(duration);
  const minimumSegmentSeconds = getVideoRemakeMinimumSeconds(duration);

  const addSegmentAt = (time: number) => {
    const next = addVideoRemakeSegment(duration, segmentsRef.current, time);
    if (!next) {
      setFeedback(
        segments.length >= MAX_VIDEO_REMAKE_SEGMENTS
          ? {
              key: 'composer.remake.maximumSegments',
              fallback: '最多选择 {count} 个片段',
              params: { count: MAX_VIDEO_REMAKE_SEGMENTS },
            }
          : {
              key: 'composer.remake.overlap',
              fallback: '这个 {duration} 片段与已选片段重叠，或可用空间不足 {minimumDuration}',
              params: {
                duration: formatSeconds(defaultSegmentSeconds),
                minimumDuration: formatSeconds(minimumSegmentSeconds),
              },
            },
      );
      return;
    }
    const previousIds = new Set(segmentsRef.current.map((segment) => segment.id));
    const nextViews = syncSegmentViews(segmentsRef.current, next);
    const added = nextViews.find((segment) => !previousIds.has(segment.id));
    replaceSegments(nextViews);
    setActiveId(added?.id ?? nextViews.at(-1)?.id ?? null);
    setFeedback({
      key: 'composer.remake.selectAnother',
      fallback: '点击空白处可继续选择 {duration} 片段',
      params: { duration: formatSeconds(defaultSegmentSeconds) },
    });
    onChange(nextViews.map(({ start, end }) => ({ start, end })));
    if (added) {
      onPreviewTimeChangeRef.current?.(resolveVideoRemakeDragPreviewTime('window', time, added));
    }
  };

  const removeSegment = (segmentId: string) => {
    const next = segmentsRef.current.filter((segment) => segment.id !== segmentId);
    replaceSegments(next);
    setActiveId((current) => (current === segmentId ? null : current));
    setFeedback({
      key: 'composer.remake.removedSelectAnother',
      fallback: '已删除片段，可继续选择 {duration} 片段',
      params: { duration: formatSeconds(defaultSegmentSeconds) },
    });
    onChange(next.map(({ start, end }) => ({ start, end })));
  };

  return (
    <div className="nodrag nopan nowheel flex w-[660px] flex-col gap-1.5 rounded-xl border border-white/[0.08] bg-[#202023] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.42)]">
      <div>
        <div
          ref={timelineRef}
          className="relative h-11 min-w-0 flex-1 touch-none overflow-hidden rounded-lg border border-white/10 bg-[#111214]"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            if (duration <= 0) {
              setFeedback(
                durationState === 'loading'
                  ? {
                      key: 'composer.remake.readingDurationWait',
                      fallback: '正在读取视频时长，请稍候…',
                    }
                  : {
                      key: 'composer.remake.durationError',
                      fallback: '无法识别视频时长，请重新导入视频',
                    },
              );
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            addSegmentAt(((event.clientX - bounds.left) / bounds.width) * duration);
          }}
          aria-label={t(
            'composer.remake.timelineLabel',
            '从完整原视频按 {duration} 选择最多 {count} 个重拍片段',
            {
              duration: formatSeconds(defaultSegmentSeconds),
              count: MAX_VIDEO_REMAKE_SEGMENTS,
            },
          )}
          title={t(feedback.key, feedback.fallback, feedback.params)}
        >
          <div className="pointer-events-none absolute inset-0 flex opacity-85">
            {frameItems.map((frame) => (
              <div key={frame.id} className="h-full min-w-0 flex-1 overflow-hidden">
                {frames.length ? (
                  <img src={frame.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={frame.url} muted playsInline className="h-full w-full object-cover" />
                )}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-black/28" />
          {duration > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[1]">
              {Array.from(
                { length: Math.max(0, Math.ceil(duration / defaultSegmentSeconds) - 1) },
                (_, index) => (index + 1) * defaultSegmentSeconds,
              ).map((time) => (
                <span
                  key={`default-segment-divider-${time}`}
                  className="absolute inset-y-0 w-px bg-white/20"
                  style={{ left: `${(time / duration) * 100}%` }}
                />
              ))}
            </div>
          )}
          {segments.map((segment) => {
            const left = duration > 0 ? (segment.start / duration) * 100 : 0;
            const right = duration > 0 ? (segment.end / duration) * 100 : 0;
            const active = activeId === segment.id;
            return (
              <div
                key={segment.id}
                className={`absolute inset-y-0 cursor-grab border-y-2 bg-blue-400/10 active:cursor-grabbing ${active ? 'z-20 border-blue-300' : 'z-10 border-blue-500'}`}
                style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                onPointerDown={(event) => {
                  const bounds = timelineRef.current?.getBoundingClientRect();
                  if (!bounds) return;
                  const time = ((event.clientX - bounds.left) / bounds.width) * duration;
                  setActiveId(segment.id);
                  beginDrag(event, {
                    segmentId: segment.id,
                    mode: 'window',
                    windowOffset: time - segment.start,
                    initialPreviewTime: resolveVideoRemakeDragPreviewTime('window', time, segment),
                  });
                }}
              >
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {formatSeconds(segment.end - segment.start)}
                </span>
                {(['start', 'end'] as const).map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className={`absolute inset-y-[-2px] z-10 w-2.5 cursor-ew-resize border-y-2 transition-colors ${
                      active
                        ? 'border-white bg-white shadow-[0_0_6px_rgba(255,255,255,0.38)]'
                        : 'border-blue-300 bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.42)]'
                    } ${handle === 'start' ? '-left-1 rounded-l-md' : '-right-1 rounded-r-md'}`}
                    onPointerDown={(event) => {
                      setActiveId(segment.id);
                      beginDrag(event, {
                        segmentId: segment.id,
                        mode: handle,
                        windowOffset: 0,
                        initialPreviewTime: resolveVideoRemakeDragPreviewTime(
                          handle,
                          handle === 'start' ? segment.start : segment.end,
                          segment,
                        ),
                      });
                    }}
                    aria-label={
                      handle === 'start'
                        ? t('composer.remake.adjustStart', '调整片段开始时间')
                        : t('composer.remake.adjustEnd', '调整片段结束时间')
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-5 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {segments.length ? (
            segments.map((segment) => (
              <div
                key={`${segment.id}-token`}
                className={`flex shrink-0 items-center overflow-hidden rounded-md border text-[10px] tabular-nums transition-colors ${activeId === segment.id ? 'border-blue-300/45 bg-blue-400/15 text-blue-100' : 'border-white/10 bg-white/[0.05] text-white/60 hover:text-white/85'}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(segment.id)}
                  className="px-1.5 py-0.5"
                  aria-label={t('composer.remake.selectRange', '选择片段 {start}–{end}', {
                    start: formatVideoRemakeTimestamp(segment.start),
                    end: formatVideoRemakeTimestamp(segment.end),
                  })}
                >
                  {formatVideoRemakeTimestamp(segment.start)}–
                  {formatVideoRemakeTimestamp(segment.end)}
                </button>
                <button
                  type="button"
                  onClick={() => removeSegment(segment.id)}
                  className="border-l border-white/10 px-1 py-0.5 text-white/35 hover:bg-white/10 hover:text-white/90"
                  title={t('composer.remake.remove', '删除这个重拍片段')}
                  aria-label={t('composer.remake.removeRange', '删除片段 {start}–{end}', {
                    start: formatVideoRemakeTimestamp(segment.start),
                    end: formatVideoRemakeTimestamp(segment.end),
                  })}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <span
              className={`truncate px-1 text-[10px] ${durationState === 'error' ? 'text-amber-300/80' : 'text-white/35'}`}
            >
              {t(feedback.key, feedback.fallback, feedback.params)}
            </span>
          )}
        </div>
        <span className="shrink-0 text-right text-[11px] tabular-nums text-white/50">
          {t('composer.remake.segmentCount', '{selected}/{maximum} 个片段', {
            selected: segments.length,
            maximum: MAX_VIDEO_REMAKE_SEGMENTS,
          })}
        </span>
      </div>
    </div>
  );
}
