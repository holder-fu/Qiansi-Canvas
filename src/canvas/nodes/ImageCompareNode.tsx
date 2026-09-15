import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { Columns2, ImageOff, X } from 'lucide-react';
import type { FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { resolveMediaSourceUrl } from '../../lib/mediaPreview';
import {
  clampImageComparisonPosition,
  imageComparisonInputUrls,
  imageComparisonKeyboardPosition,
  imageComparisonNeedsAlignedCrop,
  imageComparisonPositionFromPointer,
  imageComparisonViewportSize,
  type ImageComparisonNaturalSize,
} from '../../lib/imageComparison';
import { useAppTranslation } from '../../i18n/appI18n';
import { getNodeDisplayTitle } from '../../i18n/nodeI18n';
import { NodePorts } from './NodePorts';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { useSingleNodeControls } from './nodeSelectionState';

type ComparisonImageSlot = 'one' | 'two';

function ImageCompareNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoom = useStore((state) => state.transform[2]);
  const showControls = useSingleNodeControls(selected);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const setNodeDimensions = useCanvasStore((state) => state.setImageComparisonNodeDimensions);
  const takeSnapshot = useCanvasStore((state) => state.takeSnapshot);
  const requestDeleteNode = useCanvasStore((state) => state.requestDeleteNode);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [naturalSizes, setNaturalSizes] = useState<
    Partial<Record<ComparisonImageSlot, ImageComparisonNaturalSize>>
  >({});
  const [rawImageOne, rawImageTwo] = imageComparisonInputUrls(data);
  const imageOne = rawImageOne ? resolveMediaSourceUrl(rawImageOne) : undefined;
  const imageTwo = rawImageTwo ? resolveMediaSourceUrl(rawImageTwo) : undefined;
  const comparisonReady = Boolean(imageOne && imageTwo);
  const position = clampImageComparisonPosition(data.comparisonPosition);
  const dividerVisible = comparisonReady && (hovered || dragging);
  const alignedCrop = imageComparisonNeedsAlignedCrop(naturalSizes.one, naturalSizes.two);
  const viewportSize = imageComparisonViewportSize(naturalSizes.one, naturalSizes.two);
  const title = getNodeDisplayTitle('image-compare', String(data.title || ''), t);

  useEffect(() => {
    setFailedUrls(new Set());
    setNaturalSizes({});
  }, [imageOne, imageTwo]);

  useEffect(() => {
    setNodeDimensions(id, viewportSize.width, viewportSize.height);
  }, [id, setNodeDimensions, viewportSize.height, viewportSize.width]);

  const updatePositionFromPointer = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    updateNodeData(id, {
      comparisonPosition: imageComparisonPositionFromPointer(clientX, bounds),
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!comparisonReady || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    takeSnapshot();
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePositionFromPointer(event.clientX);
  };

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updatePositionFromPointer(event.clientX);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!comparisonReady) return;
    const next = imageComparisonKeyboardPosition(position, event.key, event.shiftKey);
    if (next === null || next === position) return;
    event.preventDefault();
    event.stopPropagation();
    takeSnapshot();
    updateNodeData(id, { comparisonPosition: next });
  };

  const markFailed = (url: string) => {
    setFailedUrls((current) => {
      if (current.has(url)) return current;
      return new Set([...current, url]);
    });
  };

  const rememberNaturalSize = (
    slot: ComparisonImageSlot,
    event: SyntheticEvent<HTMLImageElement>,
  ) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (width <= 0 || height <= 0) return;
    setNaturalSizes((current) => {
      const previous = current[slot];
      if (previous?.width === width && previous.height === height) return current;
      return { ...current, [slot]: { width, height } };
    });
  };

  const renderImage = (url: string | undefined, label: string, slot?: ComparisonImageSlot) =>
    url && !failedUrls.has(url) ? (
      <img
        src={url}
        alt={label}
        draggable={false}
        decoding="async"
        loading="eager"
        onLoad={slot ? (event) => rememberNaturalSize(slot, event) : undefined}
        onError={() => markFailed(url)}
        className="pointer-events-none h-full w-full select-none object-cover object-center"
      />
    ) : (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#242425] text-white/35">
        <ImageOff className="h-9 w-9" strokeWidth={1.4} />
        <span className="text-[12px]">{label}</span>
      </div>
    );

  return (
    <div ref={nodeRef} className="group relative h-full w-full">
      <div
        data-image-comparison-drag-handle="true"
        className="pointer-events-auto absolute -top-8 left-0 right-0 flex h-7 cursor-grab select-none items-center justify-between gap-2 text-[13px] text-white/55 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Columns2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        {showControls && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              requestDeleteNode(id);
            }}
            className="nodrag nopan pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-rose-500/15 hover:text-rose-300"
            aria-label={t('imageCompare.trash', '将图片对比节点移到回收站')}
            title={t('imageCompare.trash', '将图片对比节点移到回收站')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        data-theme-role="node-surface"
        className={`relative h-full w-full overflow-hidden rounded-xl border bg-[#18181a] transition-[border-color,box-shadow] ${
          selected
            ? SELECTED_NODE_FRAME_CLASS
            : 'border-white/20 shadow-[0_3px_14px_rgba(0,0,0,0.28)]'
        }`}
      >
        <NodePorts kind="image-compare" nodeRef={nodeRef} selected={showControls} zoom={zoom} />
        <div
          ref={stageRef}
          role="slider"
          aria-label={t('imageCompare.slider', '图片对比分隔线')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-disabled={!comparisonReady}
          tabIndex={comparisonReady ? 0 : -1}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => {
            if (!dragging) setHovered(false);
          }}
          onKeyDown={handleKeyDown}
          className="relative h-full w-full cursor-grab touch-none overflow-hidden rounded-[11px] bg-black outline-none ring-inset active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        >
          {imageTwo ? (
            <div className="absolute inset-0">
              {renderImage(imageTwo, t('imageCompare.image2', '图2'), 'two')}
            </div>
          ) : imageOne ? (
            <div className="absolute inset-0">
              {renderImage(imageOne, t('imageCompare.image1', '图1'), 'one')}
            </div>
          ) : (
            <div className="absolute inset-0 grid grid-cols-2 gap-px bg-white/10">
              {renderImage(undefined, t('imageCompare.connectImage1', '连接图1'))}
              {renderImage(undefined, t('imageCompare.connectImage2', '连接图2'))}
            </div>
          )}

          {imageOne && imageTwo && (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            >
              {renderImage(imageOne, t('imageCompare.image1', '图1'), 'one')}
            </div>
          )}

          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[11px] text-white/80 backdrop-blur-sm">
            {t('imageCompare.image1', '图1')}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[11px] text-white/80 backdrop-blur-sm">
            {t('imageCompare.image2', '图2')}
          </div>

          {alignedCrop && (
            <div
              data-image-comparison-alignment="center-crop"
              className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[11px] whitespace-nowrap text-white/65 backdrop-blur-sm"
            >
              {t('imageCompare.aspectRatioAligned', '比例不同 · 已居中裁切对齐')}
            </div>
          )}

          {comparisonReady ? (
            <div
              data-image-comparison-divider="true"
              onPointerDown={handlePointerDown}
              onPointerMove={(event) => {
                if (dragging) updatePositionFromPointer(event.clientX);
              }}
              onPointerUp={finishPointerDrag}
              onPointerCancel={finishPointerDrag}
              onLostPointerCapture={() => setDragging(false)}
              className={`nodrag nopan absolute inset-y-0 z-20 w-9 -translate-x-1/2 cursor-ew-resize touch-none transition-opacity duration-150 ${
                dividerVisible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ left: `${position}%` }}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_12px_rgba(255,255,255,0.45)]" />
            </div>
          ) : imageOne ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md border border-white/10 bg-black/65 px-3 py-2 text-center text-[12px] text-white/65 backdrop-blur-sm">
              {t('imageCompare.connectSecondHint', '再连接一张图片即可开始拖动对比')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ImageCompareNode = memo(ImageCompareNodeBase);
