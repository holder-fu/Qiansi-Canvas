import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Loader2, X } from 'lucide-react';
import { clampCropRect, type NormalizedRect } from '../../lib/imageEditing';
import { useAppTranslation } from '../../i18n/appI18n';

type CropHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

type VideoCropPanelProps = {
  rect: NormalizedRect;
  sourceWidth: number;
  sourceHeight: number;
  busy: boolean;
  progress: number;
  error?: string;
  onRectChange: (rect: NormalizedRect) => void;
  onCancel: () => void;
  onGenerate: () => void;
};

const HANDLE_CLASS: Record<Exclude<CropHandle, 'move'>, string> = {
  n: 'left-1/2 top-0 h-2 w-7 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'right-0 top-1/2 h-7 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  s: 'bottom-0 left-1/2 h-2 w-7 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'bottom-0 left-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 h-7 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  nw: 'left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
};

export function VideoCropPanel({
  rect,
  sourceWidth,
  sourceHeight,
  busy,
  progress,
  error,
  onRectChange,
  onCancel,
  onGenerate,
}: VideoCropPanelProps) {
  const { t } = useAppTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{
    handle: CropHandle;
    pointerId: number;
    startX: number;
    startY: number;
    rect: NormalizedRect;
  } | null>(null);

  const point = (event: ReactPointerEvent) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    return {
      x: bounds ? (event.clientX - bounds.left) / Math.max(1, bounds.width) : 0,
      y: bounds ? (event.clientY - bounds.top) / Math.max(1, bounds.height) : 0,
    };
  };

  const beginDrag = (event: ReactPointerEvent, handle: CropHandle) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const start = point(event);
    dragRef.current = {
      handle,
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent) => {
    if (busy) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = point(event);
    const dx = current.x - drag.startX;
    const dy = current.y - drag.startY;
    if (drag.handle === 'move') {
      onRectChange(clampCropRect({ ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }));
      return;
    }
    let left = drag.rect.x;
    let top = drag.rect.y;
    let right = drag.rect.x + drag.rect.width;
    let bottom = drag.rect.y + drag.rect.height;
    if (drag.handle.includes('w')) left += dx;
    if (drag.handle.includes('e')) right += dx;
    if (drag.handle.includes('n')) top += dy;
    if (drag.handle.includes('s')) bottom += dy;
    onRectChange(
      clampCropRect({
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        width: Math.abs(right - left),
        height: Math.abs(bottom - top),
      }),
    );
  };

  const width = Math.max(1, Math.round(rect.width * sourceWidth));
  const height = Math.max(1, Math.round(rect.height * sourceHeight));
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sourceWidth <= 0 || sourceHeight <= 0) return;
    const update = () => {
      const scale = Math.min(
        container.clientWidth / sourceWidth,
        container.clientHeight / sourceHeight,
      );
      setSurfaceSize({
        width: Math.max(1, sourceWidth * scale),
        height: Math.max(1, sourceHeight * scale),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [sourceHeight, sourceWidth]);
  const mediaSurfaceStyle: CSSProperties =
    surfaceSize.width > 0 && surfaceSize.height > 0
      ? { width: surfaceSize.width, height: surfaceSize.height }
      : { width: '100%', height: '100%' };

  return (
    <>
      <div
        ref={containerRef}
        className="nodrag nopan pointer-events-none absolute inset-0 z-[45] flex items-center justify-center"
      >
        <div
          ref={surfaceRef}
          className="pointer-events-auto relative touch-none"
          style={mediaSurfaceStyle}
          onPointerMove={moveDrag}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-black/55"
            style={{
              clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${rect.y * 100}%,${rect.x * 100}% ${rect.y * 100}%,${rect.x * 100}% ${(rect.y + rect.height) * 100}%,${(rect.x + rect.width) * 100}% ${(rect.y + rect.height) * 100}%,${(rect.x + rect.width) * 100}% ${rect.y * 100}%,0 ${rect.y * 100}%)`,
            }}
          />
          <div
            className="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
            onPointerDown={(event) => beginDrag(event, 'move')}
          >
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-[#303236]/95 px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-lg">
              {width} × {height}
            </span>
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-45">
              {Array.from({ length: 9 }, (_, index) => `crop-grid-${index + 1}`).map(
                (cell, index) => (
                  <span
                    key={cell}
                    className={`${index < 6 ? 'border-b' : ''} ${index % 3 !== 2 ? 'border-r' : ''} border-white/70`}
                  />
                ),
              )}
            </div>
            {(Object.keys(HANDLE_CLASS) as Array<Exclude<CropHandle, 'move'>>).map((handle) => (
              <button
                key={handle}
                type="button"
                disabled={busy}
                aria-label={t('videoCrop.handle', '视频裁剪控制点 {handle}', { handle })}
                className={`absolute rounded-full border border-black/30 bg-white disabled:cursor-wait disabled:opacity-45 ${HANDLE_CLASS[handle]}`}
                onPointerDown={(event) => beginDrag(event, handle)}
              />
            ))}
          </div>
        </div>
      </div>
      <NodeToolbar
        isVisible
        position={Position.Bottom}
        offset={14}
        align="center"
        className="nodrag nopan pointer-events-auto z-[80]"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#1b1b1e]/[0.98] px-3 shadow-[0_16px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-35"
            aria-label={t('videoCrop.cancel', '取消视频裁剪')}
          >
            <X className="h-5 w-5" />
          </button>
          <span className="min-w-28 text-center text-sm font-semibold tabular-nums text-white/90">
            {width} × {height}
          </span>
          {busy && (
            <span className="min-w-24 text-center text-xs tabular-nums text-white/65">
              {t('common.generatingProgress', '生成中 {progress}%', { progress })}
            </span>
          )}
          {!busy && error && <span className="max-w-64 text-xs text-red-200">{error}</span>}
          <button
            type="button"
            disabled={busy || sourceWidth <= 0 || sourceHeight <= 0}
            onClick={onGenerate}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black transition-transform hover:scale-[1.03] disabled:cursor-wait disabled:opacity-45"
            aria-label={
              busy
                ? t('videoCrop.generating', '正在生成裁剪视频 {progress}%', { progress })
                : t('videoCrop.generate', '生成裁剪视频')
            }
            title={
              busy
                ? t('common.generatingProgress', '生成中 {progress}%', { progress })
                : t('videoCrop.generate', '生成裁剪视频')
            }
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
      </NodeToolbar>
    </>
  );
}
