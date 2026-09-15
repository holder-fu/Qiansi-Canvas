import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import { useAppTranslation } from '../i18n/appI18n';
import {
  calculateThumbnailCoverMetrics,
  calculateThumbnailCropRegion,
  type ThumbnailCropSize,
} from '../lib/thumbnailCrop';

type CropAspect = '3/4' | '4/3';

function cropImage(
  source: string,
  zoom: number,
  offsetX: number,
  offsetY: number,
  aspect: CropAspect,
  viewport: ThumbnailCropSize,
) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Unable to decode image'));
    image.onload = () => {
      const output = aspect === '3/4' ? { width: 600, height: 800 } : { width: 800, height: 600 };
      const crop = calculateThumbnailCropRegion(
        { width: image.naturalWidth, height: image.naturalHeight },
        viewport,
        zoom,
        offsetX,
        offsetY,
      );
      const canvas = document.createElement('canvas');
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Unable to create canvas'));
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        output.width,
        output.height,
      );
      resolve(canvas.toDataURL('image/webp', 0.86));
    };
    image.src = source;
  });
}

export function ThumbnailCropDialog({
  source,
  aspect = '3/4',
  onCancel,
  onComplete,
  onReplace,
}: {
  source: string;
  aspect?: CropAspect;
  onCancel: () => void;
  onComplete: (thumbnail: string) => void;
  onReplace?: () => void;
}) {
  const { t } = useAppTranslation();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadedImage, setLoadedImage] = useState<{
    source: string;
    width: number;
    height: number;
  } | null>(null);
  const imageSize = loadedImage?.source === source ? loadedImage : null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ThumbnailCropSize>(
    aspect === '3/4' ? { width: 480, height: 640 } : { width: 640, height: 480 },
  );
  const metrics = imageSize ? calculateThumbnailCoverMetrics(imageSize, viewport, zoom) : null;

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [source]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const updateViewport = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setViewport((current) =>
        Math.abs(current.width - bounds.width) < 0.5 &&
        Math.abs(current.height - bounds.height) < 0.5
          ? current
          : { width: bounds.width, height: bounds.height },
      );
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => {
    if (!metrics) return;
    setOffset((current) => {
      const x = Math.max(-metrics.maxX, Math.min(metrics.maxX, current.x));
      const y = Math.max(-metrics.maxY, Math.min(metrics.maxY, current.y));
      return x === current.x && y === current.y ? current : { x, y };
    });
  }, [metrics]);

  const apply = async () => {
    try {
      onComplete(await cropImage(source, zoom, offset.x, offset.y, aspect, viewport));
    } catch {
      // Keep the crop dialog open when the image cannot be decoded.
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[310] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1d1d20] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium text-white/90">
            {t('library.editor.cropTitle', '裁剪缩略图')}
          </h4>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
            aria-label={t('common.close', '关闭')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={viewportRef}
          className="relative mx-auto overflow-hidden rounded-xl border border-emerald-400/40 bg-black"
          style={{
            width: aspect === '3/4' ? 'min(100%, 45vh, 480px)' : 'min(100%, 80vh, 640px)',
            aspectRatio: aspect === '3/4' ? '3 / 4' : '4 / 3',
          }}
        >
          <img
            key={source}
            src={source}
            alt={t('library.editor.cropPreview', '裁剪预览')}
            onLoad={(event) =>
              setLoadedImage({
                source,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none object-cover"
            style={{
              width: metrics ? `${metrics.width}px` : '100%',
              height: metrics ? `${metrics.height}px` : '100%',
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 border-2 border-white/70" />
        </div>
        <label className="mt-3 flex items-center gap-3 text-xs text-white/60">
          <span>{t('library.editor.cropZoom', '缩放')}</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1 accent-emerald-400"
          />
          <span className="w-10 text-right tabular-nums">{zoom.toFixed(1)}×</span>
        </label>
        {(['x', 'y'] as const).map((axis) => {
          const rawMax = axis === 'x' ? (metrics?.maxX ?? 0) : (metrics?.maxY ?? 0);
          const max = Math.floor(rawMax * 10) / 10;
          return (
            <label key={axis} className="mt-2 flex items-center gap-3 text-xs text-white/60">
              <span className="w-12 shrink-0">
                {axis === 'x'
                  ? t('library.editor.cropHorizontal', '横向位置')
                  : t('library.editor.cropVertical', '纵向位置')}
              </span>
              <input
                type="range"
                min={-max}
                max={max}
                step="0.1"
                value={Math.max(-max, Math.min(max, offset[axis]))}
                disabled={!metrics || max === 0}
                onChange={(event) =>
                  setOffset((current) => ({ ...current, [axis]: Number(event.target.value) }))
                }
                className="flex-1 accent-emerald-400 disabled:opacity-35"
              />
            </label>
          );
        })}
        <div className="mt-4 flex justify-end gap-2">
          {onReplace && (
            <button
              type="button"
              onClick={onReplace}
              className="rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
            >
              {t('library.editor.replaceThumbnail', '更改图片')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('library.editor.cropReset', '居中')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
          >
            {t('library.editor.useCrop', '使用此裁剪')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
