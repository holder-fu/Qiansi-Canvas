export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Modes exposed by the full-screen image editor and the image-node quick bar. */
export type ImageEditorMode =
  'preview' | 'crop' | 'outpaint' | 'mask' | 'brush' | 'resize' | 'grid';

export type ImageEditorBrushTool =
  'free' | 'eraser' | 'rect' | 'ellipse' | 'label' | 'text' | 'arrow';

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  column: number;
};

export type ImageEditorBrushSizing = {
  scale: number;
  brush: { initial: number; max: number };
  arrow: { initial: number; max: number };
  label: { initial: number; max: number };
  mask: { initial: number; max: number };
};

export type ImageEditorNaturalSize = {
  width: number;
  height: number;
};

/** Reuse persisted media metadata so the editor does not wait for a second full-image decode. */
export function imageEditorKnownSize(
  width: unknown,
  height: unknown,
): ImageEditorNaturalSize | null {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** Removes the pixels covered by an opaque eraser mask while preserving canvas transparency. */
export function applyImageErasureMask(context: CanvasRenderingContext2D, mask: CanvasImageSource) {
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(mask, 0, 0);
  context.restore();
}

const BRUSH_REFERENCE_EDGE = 2048;
const MAX_BRUSH_SCALE = 8;
const LABEL_VISUAL_RADIUS = 15;
const LABEL_RADIUS_PER_SIZE = 2.2 * 0.82;

/** Brush values are source-image pixels, so larger originals need a proportionally wider range. */
export function imageEditorBrushSizing(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  renderedWidth?: number,
  renderedHeight?: number,
): ImageEditorBrushSizing {
  const safeWidth = Number.isFinite(sourceWidth) ? Math.max(0, sourceWidth ?? 0) : 0;
  const safeHeight = Number.isFinite(sourceHeight) ? Math.max(0, sourceHeight ?? 0) : 0;
  const longestEdge = Math.max(safeWidth, safeHeight);
  const scale = Math.max(
    1,
    Math.min(MAX_BRUSH_SCALE, longestEdge > 0 ? longestEdge / BRUSH_REFERENCE_EDGE : 1),
  );
  const scaled = (value: number) => Math.max(1, Math.round(value * scale));
  const safeRenderedWidth = Number.isFinite(renderedWidth) ? Math.max(0, renderedWidth ?? 0) : 0;
  const safeRenderedHeight = Number.isFinite(renderedHeight) ? Math.max(0, renderedHeight ?? 0) : 0;
  const sourcePixelsPerRenderedPixel = Math.max(
    safeRenderedWidth > 0 ? safeWidth / safeRenderedWidth : 0,
    safeRenderedHeight > 0 ? safeHeight / safeRenderedHeight : 0,
  );
  const visualLabelInitial =
    sourcePixelsPerRenderedPixel > 0
      ? Math.ceil((LABEL_VISUAL_RADIUS * sourcePixelsPerRenderedPixel) / LABEL_RADIUS_PER_SIZE)
      : 0;
  const labelInitial = Math.max(scaled(10), visualLabelInitial);

  return {
    scale,
    brush: { initial: scaled(24), max: scaled(80) },
    arrow: { initial: scaled(8), max: scaled(40) },
    label: { initial: labelInitial, max: Math.max(scaled(80), labelInitial * 4) },
    mask: { initial: scaled(42), max: scaled(160) },
  };
}

export const CROP_RATIO_PRESETS = [
  ['free', '自由', null],
  ['source', '原图', 'source'],
  ['1:1', '1:1', 1],
  ['4:3', '4:3', 4 / 3],
  ['3:4', '3:4', 3 / 4],
  ['16:9', '16:9', 16 / 9],
  ['9:16', '9:16', 9 / 16],
  ['3:2', '3:2', 3 / 2],
  ['2:3', '2:3', 2 / 3],
] as const;

export function cropRatioValue(
  preset: (typeof CROP_RATIO_PRESETS)[number][0],
  sourceWidth: number,
  sourceHeight: number,
): number | null {
  if (preset === 'free') return null;
  if (preset === 'source')
    return sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
  const match = CROP_RATIO_PRESETS.find(([key]) => key === preset);
  return typeof match?.[2] === 'number' ? match[2] : null;
}

export function fitCropRect(ratio: number | null, inset = 0.08): NormalizedRect {
  const safeInset = Math.max(0, Math.min(0.45, inset));
  const available = 1 - safeInset * 2;
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
    return { x: safeInset, y: safeInset, width: available, height: available };
  }

  let width = available;
  let height = available / ratio;
  if (height > available) {
    height = available;
    width = available * ratio;
  }
  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  };
}

export function clampCropRect(rect: NormalizedRect, minSize = 0.02): NormalizedRect {
  const width = Math.max(minSize, Math.min(1, rect.width));
  const height = Math.max(minSize, Math.min(1, rect.height));
  return {
    x: Math.max(0, Math.min(1 - width, rect.x)),
    y: Math.max(0, Math.min(1 - height, rect.y)),
    width,
    height,
  };
}

export function gridSplitRects(
  width: number,
  height: number,
  rows: number,
  columns: number,
  gap = 0,
): PixelRect[] {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const safeRows = Math.max(1, Math.min(20, Math.round(rows)));
  const safeColumns = Math.max(1, Math.min(20, Math.round(columns)));
  const maxGap = Math.max(0, Math.min(safeWidth / safeColumns - 1, safeHeight / safeRows - 1));
  const safeGap = Math.max(0, Math.min(maxGap, gap));
  const rects: PixelRect[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const left = (column * safeWidth) / safeColumns + (column > 0 ? safeGap / 2 : 0);
      const right =
        ((column + 1) * safeWidth) / safeColumns - (column < safeColumns - 1 ? safeGap / 2 : 0);
      const top = (row * safeHeight) / safeRows + (row > 0 ? safeGap / 2 : 0);
      const bottom = ((row + 1) * safeHeight) / safeRows - (row < safeRows - 1 ? safeGap / 2 : 0);
      const x = Math.round(left);
      const y = Math.round(top);
      rects.push({
        x,
        y,
        width: Math.max(1, Math.round(right) - x),
        height: Math.max(1, Math.round(bottom) - y),
        row,
        column,
      });
    }
  }
  return rects;
}

export function editedImageName(sourceName: string | undefined, suffix: string): string {
  const safeBase = (sourceName || '图片').replace(/\.[^.]+$/, '').trim() || '图片';
  return `${safeBase}_${suffix}.png`;
}
