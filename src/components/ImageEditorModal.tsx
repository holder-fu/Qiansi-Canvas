import {
  ArrowLeftRight,
  ArrowUpRight,
  Brush,
  ChevronLeft,
  ChevronRight,
  Circle,
  CornerUpRight,
  Crop,
  Download,
  Eraser,
  Eye,
  Grid3X3,
  Loader2,
  Maximize2,
  Minimize2,
  Paintbrush,
  Redo2,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NODE_H, NODE_W } from '../canvas/constants';
import {
  CROP_RATIO_PRESETS,
  applyImageErasureMask,
  clampCropRect,
  cropRatioValue,
  editedImageName,
  fitCropRect,
  gridSplitRects,
  imageEditorBrushSizing,
  imageEditorKnownSize,
  type ImageEditorBrushTool,
  type ImageEditorMode,
  type ImageEditorNaturalSize,
  type NormalizedRect,
} from '../lib/imageEditing';
import { imagePreviewPanPosition, type ImagePreviewPanStart } from '../lib/imagePreviewPan';
import {
  AI_ANNOTATION_COLOR,
  type ImageAnnotationHint,
  type ImageAnnotationKind,
  type ImageAnnotationReferenceMode,
} from '../lib/imageAnnotations';
import { imageEditorSourcePages } from '../lib/mediaPreview';
import { useAppTranslation } from '../i18n/appI18n';
import { useCanvasStore } from '../store/canvasStore';
import { NumberMarkerIcon } from './NumberMarkerIcon';

type EditorMode = ImageEditorMode;
type DrawingMode = 'mask' | 'brush';
type BrushTool = ImageEditorBrushTool;
type ArrowStyle = 'straight' | 'curved';
type CropHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

type DrawingHistory = {
  undo: ImageData[];
  redo: ImageData[];
  erasureUndo: ImageData[];
  erasureRedo: ImageData[];
  annotationUndo: ImageAnnotationHint[][];
  annotationRedo: ImageAnnotationHint[][];
};

const MODE_ITEMS: Array<{
  key: EditorMode;
  label: string;
  icon: typeof Eye;
}> = [
  { key: 'preview', label: '预览', icon: Eye },
  { key: 'crop', label: '裁剪', icon: Crop },
  { key: 'outpaint', label: '扩图', icon: Maximize2 },
  { key: 'mask', label: '遮罩', icon: Brush },
  { key: 'brush', label: '画笔', icon: Paintbrush },
  { key: 'resize', label: '缩放', icon: Minimize2 },
  { key: 'grid', label: '宫格切分', icon: Grid3X3 },
];

const MODE_COPY: Record<EditorMode, { title: string; hint: string; apply: string }> = {
  preview: { title: '预览图片', hint: '滚轮缩放，按住图片拖动浏览', apply: '' },
  crop: { title: '裁剪图片', hint: '拖动裁剪框移动，拖动边缘或角点调整大小', apply: '应用裁剪' },
  outpaint: {
    title: '扩图',
    hint: '调整画布留白，白色区域可继续交给图片模型补全',
    apply: '应用扩图',
  },
  mask: { title: '遮罩编辑', hint: '白色区域为需要编辑的遮罩', apply: '生成遮罩节点' },
  brush: {
    title: '画笔编辑',
    hint: '在原图上绘制标记，或用橡皮擦移除多余区域',
    apply: '应用画笔',
  },
  resize: { title: '缩放图片', hint: '按原图比例缩小图片尺寸', apply: '应用缩放' },
  grid: {
    title: '宫格切分',
    hint: '按行列切分图片，并在画布中生成独立图片节点',
    apply: '输出切分节点',
  },
};

const EMPTY_HISTORY = (): Record<DrawingMode, DrawingHistory> => ({
  mask: {
    undo: [],
    redo: [],
    erasureUndo: [],
    erasureRedo: [],
    annotationUndo: [],
    annotationRedo: [],
  },
  brush: {
    undo: [],
    redo: [],
    erasureUndo: [],
    erasureRedo: [],
    annotationUndo: [],
    annotationRedo: [],
  },
});

function isDrawingMode(mode: EditorMode): mode is DrawingMode {
  return mode === 'mask' || mode === 'brush';
}

function canvasDataUrl(canvas: HTMLCanvasElement, exportErrorMessage: string): string {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error(exportErrorMessage);
  }
}

function hasPaintedPixels(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) > 8) return true;
  }
  return false;
}

function sourceBaseName(name: string | undefined): string {
  return (name || '图片').replace(/\.[^.]+$/, '') || '图片';
}

export function ImageEditorModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const requestedMode = useCanvasStore((state) => state.imageEditorMode);
  const requestedBrushTool = useCanvasStore((state) => state.imageEditorBrushTool);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));

  const isOpen = openModal === 'image-editor';
  const imageSourcePages = useMemo(() => (node ? imageEditorSourcePages(node.data) : []), [node]);
  const [imageIndex, setImageIndex] = useState(0);
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const sourceUrl = imageSourcePages[imageIndex]?.[sourceAttempt];
  const sourceName = node?.data.imageFileName || node?.data.title || '图片';
  const persistedNatural = useMemo(
    () => imageEditorKnownSize(node?.data.mediaWidth, node?.data.mediaHeight),
    [node?.data.mediaHeight, node?.data.mediaWidth],
  );

  const [mode, setMode] = useState<EditorMode>('preview');
  const [natural, setNatural] = useState<ImageEditorNaturalSize | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewPanning, setPreviewPanning] = useState(false);
  const [cropPreset, setCropPreset] = useState<(typeof CROP_RATIO_PRESETS)[number][0]>('free');
  const [cropRect, setCropRect] = useState<NormalizedRect>(() => fitCropRect(null));
  const [outpaintX, setOutpaintX] = useState(25);
  const [outpaintY, setOutpaintY] = useState(25);
  const [brushSize, setBrushSize] = useState(24);
  const [labelSize, setLabelSize] = useState(10);
  const [arrowSize, setArrowSize] = useState(8);
  const [maskSize, setMaskSize] = useState(42);
  const [brushColor, setBrushColor] = useState(AI_ANNOTATION_COLOR);
  const [brushTool, setBrushTool] = useState<BrushTool>('free');
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>('straight');
  const [arrowReversed, setArrowReversed] = useState(false);
  const [brushText, setBrushText] = useState('标记');
  const [aiReferenceMode, setAiReferenceMode] = useState<ImageAnnotationReferenceMode>('annotated');
  const [resizeScale, setResizeScale] = useState(0.5);
  const [gridRows, setGridRows] = useState(3);
  const [gridColumns, setGridColumns] = useState(3);
  const [gridGap, setGridGap] = useState(0);
  const [drawingRevision, setDrawingRevision] = useState(0);
  const [hasErasedPixels, setHasErasedPixels] = useState(false);
  const [nextLabelNumber, setNextLabelNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewPanRef = useRef<(ImagePreviewPanStart & { pointerId: number }) | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const erasedPreviewRef = useRef<HTMLCanvasElement>(null);
  const erasureMaskRef = useRef<HTMLCanvasElement | null>(null);
  const outpaintPreviewRef = useRef<HTMLCanvasElement>(null);
  const cropSurfaceRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{
    handle: CropHandle;
    pointerId: number;
    startX: number;
    startY: number;
    rect: NormalizedRect;
  } | null>(null);
  const drawingDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    snapshot: ImageData;
  } | null>(null);
  const drawingBuffersRef = useRef<Partial<Record<DrawingMode, ImageData>>>({});
  const erasureBuffersRef = useRef<Partial<Record<DrawingMode, ImageData>>>({});
  const annotationBuffersRef = useRef<Partial<Record<DrawingMode, ImageAnnotationHint[]>>>({});
  const annotationHintsRef = useRef<ImageAnnotationHint[]>([]);
  const drawingHistoryRef = useRef<Record<DrawingMode, DrawingHistory>>(EMPTY_HISTORY());
  const lastDrawingModeRef = useRef<DrawingMode | null>(null);
  const labelCounterRef = useRef(1);
  const activeSourceKeyRef = useRef<string | null>(null);
  const loadedImageKeyRef = useRef<string | null>(null);
  const overlayImageKeyRef = useRef<string | null>(null);
  const initializedSessionRef = useRef<string | null>(null);

  const ensureErasureMaskCanvas = useCallback((width: number, height: number) => {
    const canvas = erasureMaskRef.current ?? document.createElement('canvas');
    erasureMaskRef.current = canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }, []);

  const renderBrushCompositePreview = useCallback(() => {
    const image = imageRef.current;
    const overlay = overlayRef.current;
    const preview = erasedPreviewRef.current;
    const erasureMask = erasureMaskRef.current;
    if (!image || !overlay || !preview || !erasureMask || !overlay.width || !overlay.height) return;
    if (preview.width !== overlay.width || preview.height !== overlay.height) {
      preview.width = overlay.width;
      preview.height = overlay.height;
    }
    const context = preview.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, preview.width, preview.height);
    context.drawImage(image, 0, 0, preview.width, preview.height);
    context.drawImage(overlay, 0, 0);
    applyImageErasureMask(context, erasureMask);
  }, []);

  const syncOverlaySize = useCallback(
    (width: number, height: number, preserveAnnotations = false) => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const existingAnnotations = preserveAnnotations ? annotationHintsRef.current : [];
      canvas.width = width;
      canvas.height = height;
      const erasureMask = ensureErasureMaskCanvas(width, height);
      erasureMask.getContext('2d')?.clearRect(0, 0, width, height);
      drawingBuffersRef.current = {};
      erasureBuffersRef.current = {};
      annotationBuffersRef.current = {};
      annotationHintsRef.current = existingAnnotations;
      drawingHistoryRef.current = EMPTY_HISTORY();
      lastDrawingModeRef.current = null;
      setHasErasedPixels(false);
      setDrawingRevision((value) => value + 1);
    },
    [ensureErasureMaskCanvas],
  );

  const resetEditor = useCallback(() => {
    setImageIndex(0);
    setSourceAttempt(0);
    setMode(requestedMode);
    setNatural(persistedNatural);
    setSourceReady(false);
    setZoom(1);
    setPreviewPanning(false);
    previewPanRef.current = null;
    setCropPreset('free');
    setCropRect(fitCropRect(null));
    setOutpaintX(25);
    setOutpaintY(25);
    setBrushSize(24);
    setLabelSize(10);
    setArrowSize(8);
    setMaskSize(42);
    setBrushColor(AI_ANNOTATION_COLOR);
    setBrushTool(requestedMode === 'brush' ? requestedBrushTool : 'free');
    setResizeScale(0.5);
    setGridRows(3);
    setGridColumns(3);
    setGridGap(0);
    setBusy(false);
    setError(null);
    drawingBuffersRef.current = {};
    annotationBuffersRef.current = {};
    annotationHintsRef.current = Array.isArray(node?.data.annotationHints)
      ? node.data.annotationHints.map((hint) => ({ ...hint }))
      : [];
    drawingHistoryRef.current = EMPTY_HISTORY();
    lastDrawingModeRef.current = null;
    labelCounterRef.current = 1;
    activeSourceKeyRef.current = null;
    loadedImageKeyRef.current = null;
    overlayImageKeyRef.current = null;
    setAiReferenceMode(node?.data.aiReferenceMode === 'original' ? 'original' : 'annotated');
    setNextLabelNumber(1);
    setDrawingRevision((value) => value + 1);
    setHasErasedPixels(false);
    erasureMaskRef.current = null;
    erasureBuffersRef.current = {};
  }, [node, persistedNatural, requestedBrushTool, requestedMode]);

  const initializeLoadedImage = useCallback(
    (image: HTMLImageElement) => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      const sourceKey = `${modalNodeId ?? ''}:${imageIndex}:${sourceAttempt}:${sourceUrl ?? ''}:${size.width}x${size.height}`;
      setNatural((current) =>
        current?.width === size.width && current.height === size.height ? current : size,
      );
      setSourceReady(true);
      setError(null);
      if (loadedImageKeyRef.current !== sourceKey) {
        loadedImageKeyRef.current = sourceKey;
        const sizing = imageEditorBrushSizing(
          size.width,
          size.height,
          image.clientWidth,
          image.clientHeight,
        );
        setBrushSize(sizing.brush.initial);
        setArrowSize(sizing.arrow.initial);
        setLabelSize(sizing.label.initial);
        setMaskSize(sizing.mask.initial);
        const nextRatio = cropRatioValue(cropPreset, size.width, size.height);
        setCropRect(fitCropRect(nextRatio));
      }
      if (overlayRef.current && overlayImageKeyRef.current !== sourceKey) {
        overlayImageKeyRef.current = sourceKey;
        syncOverlaySize(size.width, size.height, node?.data.annotationSourceUrl === sourceUrl);
      }
    },
    [
      cropPreset,
      imageIndex,
      modalNodeId,
      node?.data.annotationSourceUrl,
      sourceAttempt,
      sourceUrl,
      syncOverlaySize,
    ],
  );

  const beginPreviewPan = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = previewViewportRef.current;
      if (mode !== 'preview' || event.button !== 0 || !viewport) return;
      previewPanRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setPreviewPanning(true);
      event.preventDefault();
    },
    [mode],
  );

  const movePreviewPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = previewViewportRef.current;
    const drag = previewPanRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const position = imagePreviewPanPosition(drag, event.clientX, event.clientY);
    viewport.scrollLeft = position.left;
    viewport.scrollTop = position.top;
  }, []);

  const endPreviewPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (previewPanRef.current?.pointerId !== event.pointerId) return;
    previewPanRef.current = null;
    setPreviewPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleImageError = useCallback(() => {
    setNatural(imageIndex === 0 ? persistedNatural : null);
    setSourceReady(false);
    loadedImageKeyRef.current = null;
    overlayImageKeyRef.current = null;
    setSourceAttempt((current) => {
      if (current + 1 < (imageSourcePages[imageIndex]?.length ?? 0)) {
        setError(null);
        return current + 1;
      }
      setError(t('imageEditor.error.loadFailed', '图片加载失败，原图和持久化预览均无法读取。'));
      return current;
    });
  }, [imageIndex, imageSourcePages, persistedNatural, t]);

  const showImagePage = useCallback(
    (nextIndex: number) => {
      setNatural(nextIndex === 0 ? persistedNatural : null);
      setSourceReady(false);
      setError(null);
      setSourceAttempt(0);
      setImageIndex(nextIndex);
      loadedImageKeyRef.current = null;
      overlayImageKeyRef.current = null;
    },
    [persistedNatural],
  );

  const editorSessionKey = isOpen
    ? `${modalNodeId ?? 'missing'}:${requestedMode}:${requestedBrushTool}`
    : null;

  useEffect(() => {
    if (!editorSessionKey) {
      initializedSessionRef.current = null;
      return;
    }
    // Autosave, Bridge hydration and media persistence may replace the node
    // object while this modal is open. That must not reset a tool the user has
    // just selected. Initialize once per explicit open request instead.
    if (initializedSessionRef.current === editorSessionKey) return;
    initializedSessionRef.current = editorSessionKey;
    resetEditor();
  }, [editorSessionKey, resetEditor]);

  useEffect(() => {
    if (!editorSessionKey || imageIndex !== 0 || !persistedNatural) return;
    setNatural((current) => current ?? persistedNatural);
  }, [editorSessionKey, imageIndex, persistedNatural]);

  useEffect(() => {
    if (!editorSessionKey || !sourceUrl) {
      activeSourceKeyRef.current = null;
      return;
    }
    const sourceKey = `${editorSessionKey}:${imageIndex}:${sourceAttempt}:${sourceUrl}`;
    if (activeSourceKeyRef.current === sourceKey) return;
    activeSourceKeyRef.current = sourceKey;
    loadedImageKeyRef.current = null;
    overlayImageKeyRef.current = null;
    setNatural(imageIndex === 0 ? persistedNatural : null);
    setSourceReady(false);
  }, [editorSessionKey, imageIndex, persistedNatural, sourceAttempt, sourceUrl]);

  useEffect(() => {
    if (mode === 'outpaint') overlayImageKeyRef.current = null;
  }, [mode]);

  useEffect(() => {
    if (!editorSessionKey || !sourceUrl) return;
    const frame = window.requestAnimationFrame(() => {
      const image = imageRef.current;
      if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        initializeLoadedImage(image);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorSessionKey, initializeLoadedImage, mode, persistedNatural, sourceUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeModal();
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        isDrawingMode(mode)
      ) {
        event.preventDefault();
        if (event.shiftKey) redoDrawing();
        else undoDrawing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const saveDrawingBuffer = useCallback(
    (drawingMode: DrawingMode) => {
      const canvas = overlayRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !canvas.width || !canvas.height) return;
      drawingBuffersRef.current[drawingMode] = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
      const erasureContext = erasureMask.getContext('2d');
      if (erasureContext) {
        erasureBuffersRef.current[drawingMode] = erasureContext.getImageData(
          0,
          0,
          erasureMask.width,
          erasureMask.height,
        );
      }
      annotationBuffersRef.current[drawingMode] = annotationHintsRef.current.map((hint) => ({
        ...hint,
        start: hint.start ? { ...hint.start } : undefined,
        end: hint.end ? { ...hint.end } : undefined,
        point: hint.point ? { ...hint.point } : undefined,
      }));
    },
    [ensureErasureMaskCanvas],
  );

  const restoreDrawingBuffer = useCallback(
    (drawingMode: DrawingMode) => {
      const canvas = overlayRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const buffer = drawingBuffersRef.current[drawingMode];
      if (buffer && buffer.width === canvas.width && buffer.height === canvas.height) {
        context.putImageData(buffer, 0, 0);
      }
      const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
      const erasureContext = erasureMask.getContext('2d');
      erasureContext?.clearRect(0, 0, erasureMask.width, erasureMask.height);
      const erasureBuffer = erasureBuffersRef.current[drawingMode];
      if (
        erasureContext &&
        erasureBuffer &&
        erasureBuffer.width === erasureMask.width &&
        erasureBuffer.height === erasureMask.height
      ) {
        erasureContext.putImageData(erasureBuffer, 0, 0);
      }
      annotationHintsRef.current = (annotationBuffersRef.current[drawingMode] ?? []).map(
        (hint) => ({
          ...hint,
          start: hint.start ? { ...hint.start } : undefined,
          end: hint.end ? { ...hint.end } : undefined,
          point: hint.point ? { ...hint.point } : undefined,
        }),
      );
      setHasErasedPixels(drawingMode === 'brush' && hasPaintedPixels(erasureMask));
      setDrawingRevision((value) => value + 1);
    },
    [ensureErasureMaskCanvas],
  );

  useEffect(() => {
    if (mode === 'brush' && hasErasedPixels) renderBrushCompositePreview();
  }, [drawingRevision, hasErasedPixels, mode, renderBrushCompositePreview, sourceUrl]);

  useEffect(() => {
    const previous = lastDrawingModeRef.current;
    if (previous) saveDrawingBuffer(previous);
    if (isDrawingMode(mode)) {
      restoreDrawingBuffer(mode);
      lastDrawingModeRef.current = mode;
    } else {
      const context = overlayRef.current?.getContext('2d');
      if (context && overlayRef.current) {
        context.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
      }
      lastDrawingModeRef.current = null;
    }
  }, [mode, restoreDrawingBuffer, saveDrawingBuffer]);

  useEffect(() => {
    if (!natural || !sourceReady || mode !== 'outpaint') return;
    const canvas = outpaintPreviewRef.current;
    const image = imageRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !image || !context) return;
    const padX = Math.round((natural.width * outpaintX) / 100);
    const padY = Math.round((natural.height * outpaintY) / 100);
    canvas.width = natural.width + padX * 2;
    canvas.height = natural.height + padY * 2;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, padX, padY, natural.width, natural.height);
  }, [mode, natural, outpaintX, outpaintY, sourceReady, sourceUrl]);

  if (!isOpen || !node || !sourceUrl) return null;

  const ratio = cropRatioValue(cropPreset, natural?.width ?? 1, natural?.height ?? 1);
  const drawingHistory = isDrawingMode(mode) ? drawingHistoryRef.current[mode] : null;

  function setCropRatio(preset: (typeof CROP_RATIO_PRESETS)[number][0]) {
    setCropPreset(preset);
    setCropRect(fitCropRect(cropRatioValue(preset, natural?.width ?? 1, natural?.height ?? 1)));
  }

  function pointerPosition(event: ReactPointerEvent, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
    };
  }

  function beginCropDrag(event: ReactPointerEvent, handle: CropHandle) {
    if (!cropSurfaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPosition(event, cropSurfaceRef.current);
    cropDragRef.current = {
      handle,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      rect: cropRect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCrop(event: ReactPointerEvent) {
    const drag = cropDragRef.current;
    const surface = cropSurfaceRef.current;
    if (!drag || !surface || drag.pointerId !== event.pointerId) return;
    const point = pointerPosition(event, surface);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (drag.handle === 'move') {
      setCropRect(clampCropRect({ ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }));
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
    const anchorX = drag.handle.includes('w') ? right : left;
    const anchorY = drag.handle.includes('n') ? bottom : top;
    let width = Math.max(0.02, Math.abs(right - left));
    let height = Math.max(0.02, Math.abs(bottom - top));
    if (ratio) {
      const sourceRatio = (natural?.width ?? 1) / (natural?.height ?? 1);
      const normalizedRatio = ratio / sourceRatio;
      if (width / height > normalizedRatio) width = height * normalizedRatio;
      else height = width / normalizedRatio;
      if (drag.handle.includes('w')) left = anchorX - width;
      else right = anchorX + width;
      if (drag.handle.includes('n')) top = anchorY - height;
      else bottom = anchorY + height;
    }
    setCropRect(
      clampCropRect({
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        width: Math.abs(right - left),
        height: Math.abs(bottom - top),
      }),
    );
  }

  function endCrop(event: ReactPointerEvent) {
    if (cropDragRef.current?.pointerId === event.pointerId) cropDragRef.current = null;
  }

  function overlayPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * canvas.width) / Math.max(1, bounds.width),
      y: ((event.clientY - bounds.top) * canvas.height) / Math.max(1, bounds.height),
    };
  }

  function pushDrawingHistory(drawingMode: DrawingMode) {
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const history = drawingHistoryRef.current[drawingMode];
    history.undo.push(context.getImageData(0, 0, canvas.width, canvas.height));
    const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
    const erasureContext = erasureMask.getContext('2d');
    if (erasureContext) {
      history.erasureUndo.push(
        erasureContext.getImageData(0, 0, erasureMask.width, erasureMask.height),
      );
    }
    history.annotationUndo.push(annotationHintsRef.current.map((hint) => ({ ...hint })));
    if (history.undo.length > 30) history.undo.shift();
    if (history.erasureUndo.length > 30) history.erasureUndo.shift();
    if (history.annotationUndo.length > 30) history.annotationUndo.shift();
    history.redo = [];
    history.erasureRedo = [];
    history.annotationRedo = [];
    setDrawingRevision((value) => value + 1);
  }

  function configureBrush(context: CanvasRenderingContext2D, drawingMode: DrawingMode) {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth =
      drawingMode === 'mask' ? maskSize : brushTool === 'arrow' ? arrowSize : brushSize;
    const isEraser = drawingMode === 'brush' && brushTool === 'eraser';
    context.strokeStyle =
      drawingMode === 'mask' ? 'rgba(255,255,255,0.55)' : isEraser ? '#ffffff' : brushColor;
    context.fillStyle =
      drawingMode === 'mask' ? 'rgba(255,255,255,0.55)' : isEraser ? '#ffffff' : brushColor;
    context.globalCompositeOperation = 'source-over';
  }

  function drawShape(
    context: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) {
    configureBrush(context, 'brush');
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    if (brushTool === 'rect') context.strokeRect(x, y, width, height);
    if (brushTool === 'ellipse') {
      context.beginPath();
      context.ellipse(
        x + width / 2,
        y + height / 2,
        Math.max(1, width / 2),
        Math.max(1, height / 2),
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    if (brushTool === 'arrow') {
      drawArrow(context, startX, startY, endX, endY);
    }
  }

  function drawArrowHead(
    context: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    angle: number,
  ) {
    const size = Math.max(10, arrowSize * 2.2);
    const wing = Math.PI / 6;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - Math.cos(angle - wing) * size, tipY - Math.sin(angle - wing) * size);
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - Math.cos(angle + wing) * size, tipY - Math.sin(angle + wing) * size);
    context.stroke();
  }

  function drawArrow(
    context: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) {
    const fromX = arrowReversed ? endX : startX;
    const fromY = arrowReversed ? endY : startY;
    const toX = arrowReversed ? startX : endX;
    const toY = arrowReversed ? startY : endY;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;

    const drawArrowPass = () => {
      context.beginPath();
      if (arrowStyle === 'curved') {
        const normalX = -dy / length;
        const normalY = dx / length;
        const curve = Math.max(28, Math.min(220, length * 0.55));
        const controlX = (fromX + toX) / 2 + normalX * curve;
        const controlY = (fromY + toY) / 2 + normalY * curve;
        context.moveTo(fromX, fromY);
        context.quadraticCurveTo(controlX, controlY, toX, toY);
        context.stroke();
        drawArrowHead(context, toX, toY, Math.atan2(toY - controlY, toX - controlX));
        return;
      }

      context.moveTo(fromX, fromY);
      context.lineTo(toX, toY);
      context.stroke();
      drawArrowHead(context, toX, toY, Math.atan2(dy, dx));
    };

    context.save();
    configureBrush(context, 'brush');
    // A white halo plus the vivid guide color keeps the arrow legible over both
    // dark and bright artwork while the model still sees one consistent marker.
    context.lineWidth = arrowSize + 4;
    context.strokeStyle = 'rgba(255,255,255,0.92)';
    drawArrowPass();
    context.lineWidth = arrowSize;
    context.strokeStyle = brushColor;
    drawArrowPass();
    context.restore();
  }

  function drawLabel(context: CanvasRenderingContext2D, x: number, y: number) {
    const size = Math.max(28, labelSize * 2.2);
    const label = String(labelCounterRef.current);
    labelCounterRef.current += 1;
    setNextLabelNumber(labelCounterRef.current);
    context.save();
    context.font = `800 ${size}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const textWidth = context.measureText(label).width;
    const radius = Math.max(22, size * 0.82, textWidth / 2 + size * 0.34);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.shadowColor = 'rgba(0,0,0,0.75)';
    context.shadowBlur = 4;
    context.fillStyle = 'rgba(255,255,255,0.96)';
    context.fill();
    context.lineWidth = Math.max(3, labelSize * 0.55);
    context.strokeStyle = brushColor;
    context.stroke();
    context.fillStyle = brushColor;
    context.fillText(label, x, y);
    context.restore();
  }

  function drawTextLabel(context: CanvasRenderingContext2D, x: number, y: number) {
    const value = brushText.trim() || '标记';
    const size = Math.max(24, brushSize * 1.8);
    context.save();
    context.font = `700 ${size}px system-ui, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.lineWidth = Math.max(3, size / 10);
    context.shadowColor = 'rgba(0,0,0,0.65)';
    context.shadowBlur = 3;
    context.strokeStyle = 'rgba(255,255,255,0.95)';
    context.strokeText(value, x, y);
    context.fillStyle = brushColor;
    context.fillText(value, x, y);
    context.restore();
  }

  function annotationPoint(x: number, y: number) {
    return {
      x: Math.max(0, Math.min(1, x / Math.max(1, natural?.width ?? 1))),
      y: Math.max(0, Math.min(1, y / Math.max(1, natural?.height ?? 1))),
    };
  }

  function addAnnotation(
    kind: ImageAnnotationKind,
    options: Omit<ImageAnnotationHint, 'id' | 'kind'>,
  ) {
    annotationHintsRef.current = [
      ...annotationHintsRef.current,
      {
        id: `annotation-${Date.now()}-${annotationHintsRef.current.length + 1}`,
        kind,
        color: brushColor,
        ...options,
      },
    ];
  }

  function beginDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingMode(mode)) return;
    const canvas = event.currentTarget;
    const overlayContext = canvas.getContext('2d');
    if (!overlayContext) return;
    event.preventDefault();
    event.stopPropagation();
    const point = overlayPoint(event);
    pushDrawingHistory(mode);
    const snapshot = overlayContext.getImageData(0, 0, canvas.width, canvas.height);
    if (mode === 'brush' && brushTool === 'label') {
      const label = String(labelCounterRef.current);
      drawLabel(overlayContext, point.x, point.y);
      addAnnotation('label', { point: annotationPoint(point.x, point.y), label });
      saveDrawingBuffer(mode);
      if (hasErasedPixels) renderBrushCompositePreview();
      return;
    }
    if (mode === 'brush' && brushTool === 'text') {
      drawTextLabel(overlayContext, point.x, point.y);
      addAnnotation('text', {
        point: annotationPoint(point.x, point.y),
        label: brushText.trim() || '标记',
      });
      saveDrawingBuffer(mode);
      if (hasErasedPixels) renderBrushCompositePreview();
      return;
    }
    drawingDragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      snapshot,
    };
    canvas.setPointerCapture(event.pointerId);
    const erasing = mode === 'brush' && brushTool === 'eraser';
    const context = erasing
      ? ensureErasureMaskCanvas(canvas.width, canvas.height).getContext('2d')
      : overlayContext;
    if (!context) return;
    configureBrush(context, mode);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
    if (erasing) {
      setHasErasedPixels(true);
      renderBrushCompositePreview();
    } else if (hasErasedPixels) renderBrushCompositePreview();
  }

  function moveDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = drawingDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !isDrawingMode(mode)) return;
    const erasing = mode === 'brush' && brushTool === 'eraser';
    const context = erasing
      ? ensureErasureMaskCanvas(event.currentTarget.width, event.currentTarget.height).getContext(
          '2d',
        )
      : event.currentTarget.getContext('2d');
    if (!context) return;
    event.preventDefault();
    const point = overlayPoint(event);
    if (mode === 'brush' && brushTool !== 'free' && brushTool !== 'eraser') {
      context.putImageData(drag.snapshot, 0, 0);
      drawShape(context, drag.startX, drag.startY, point.x, point.y);
    } else {
      configureBrush(context, mode);
      context.beginPath();
      context.moveTo(drag.lastX, drag.lastY);
      context.lineTo(point.x, point.y);
      context.stroke();
      drag.lastX = point.x;
      drag.lastY = point.y;
    }
    if (erasing || hasErasedPixels) renderBrushCompositePreview();
  }

  function endDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = drawingDragRef.current;
    if (drag?.pointerId !== event.pointerId || !isDrawingMode(mode)) return;
    drawingDragRef.current = null;
    if (mode === 'brush') {
      const end = overlayPoint(event);
      const kind = brushTool as ImageAnnotationKind;
      if (['arrow', 'rect', 'ellipse', 'free'].includes(kind)) {
        addAnnotation(kind, {
          start: annotationPoint(drag.startX, drag.startY),
          end: annotationPoint(end.x, end.y),
          ...(kind === 'arrow' ? { arrowStyle, reversed: arrowReversed } : {}),
        });
      }
      const erasureMask = erasureMaskRef.current;
      setHasErasedPixels(Boolean(erasureMask && hasPaintedPixels(erasureMask)));
      renderBrushCompositePreview();
    }
    saveDrawingBuffer(mode);
    setDrawingRevision((value) => value + 1);
  }

  function undoDrawing() {
    if (!isDrawingMode(mode)) return;
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    const history = drawingHistoryRef.current[mode];
    if (!canvas || !context || history.undo.length === 0) return;
    history.redo.push(context.getImageData(0, 0, canvas.width, canvas.height));
    const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
    const erasureContext = erasureMask.getContext('2d');
    if (erasureContext) {
      history.erasureRedo.push(
        erasureContext.getImageData(0, 0, erasureMask.width, erasureMask.height),
      );
    }
    history.annotationRedo.push(annotationHintsRef.current.map((hint) => ({ ...hint })));
    const previous = history.undo.pop();
    const previousErasure = history.erasureUndo.pop();
    const previousAnnotations = history.annotationUndo.pop();
    if (previous) context.putImageData(previous, 0, 0);
    if (erasureContext) {
      erasureContext.clearRect(0, 0, erasureMask.width, erasureMask.height);
      if (previousErasure) erasureContext.putImageData(previousErasure, 0, 0);
    }
    annotationHintsRef.current = previousAnnotations
      ? previousAnnotations.map((hint) => ({ ...hint }))
      : [];
    saveDrawingBuffer(mode);
    setHasErasedPixels(mode === 'brush' && hasPaintedPixels(erasureMask));
    setDrawingRevision((value) => value + 1);
  }

  function redoDrawing() {
    if (!isDrawingMode(mode)) return;
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    const history = drawingHistoryRef.current[mode];
    if (!canvas || !context || history.redo.length === 0) return;
    history.undo.push(context.getImageData(0, 0, canvas.width, canvas.height));
    const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
    const erasureContext = erasureMask.getContext('2d');
    if (erasureContext) {
      history.erasureUndo.push(
        erasureContext.getImageData(0, 0, erasureMask.width, erasureMask.height),
      );
    }
    history.annotationUndo.push(annotationHintsRef.current.map((hint) => ({ ...hint })));
    const next = history.redo.pop();
    const nextErasure = history.erasureRedo.pop();
    const nextAnnotations = history.annotationRedo.pop();
    if (next) context.putImageData(next, 0, 0);
    if (erasureContext) {
      erasureContext.clearRect(0, 0, erasureMask.width, erasureMask.height);
      if (nextErasure) erasureContext.putImageData(nextErasure, 0, 0);
    }
    annotationHintsRef.current = nextAnnotations
      ? nextAnnotations.map((hint) => ({ ...hint }))
      : [];
    saveDrawingBuffer(mode);
    setHasErasedPixels(mode === 'brush' && hasPaintedPixels(erasureMask));
    setDrawingRevision((value) => value + 1);
  }

  function clearDrawing() {
    if (!isDrawingMode(mode)) return;
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    pushDrawingHistory(mode);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const erasureMask = ensureErasureMaskCanvas(canvas.width, canvas.height);
    erasureMask.getContext('2d')?.clearRect(0, 0, erasureMask.width, erasureMask.height);
    annotationHintsRef.current = [];
    saveDrawingBuffer(mode);
    setHasErasedPixels(false);
    setDrawingRevision((value) => value + 1);
  }

  function createCanvas(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(t('imageEditor.error.canvasUnavailable', '浏览器无法创建图片编辑画布。'));
    return { canvas, context };
  }

  function replaceCurrentImage(
    url: string,
    fileName: string,
    width: number,
    height: number,
    annotation?: {
      sourceUrl: string;
      hints: ImageAnnotationHint[];
      referenceMode: ImageAnnotationReferenceMode;
    },
  ) {
    if (!node) return;
    const store = useCanvasStore.getState();
    const references = Array.isArray(node.data.composerReferences)
      ? (node.data.composerReferences as Array<Record<string, unknown>>)
      : [];
    store.takeSnapshot();
    store.updateNodeData(node.id, {
      imageUrl: url,
      images: [url],
      output: url,
      imageFileName: fileName,
      aspectRatio: `${width}:${height}`,
      annotationSourceUrl: annotation?.sourceUrl,
      annotationHints: annotation?.hints.length ? annotation.hints : undefined,
      aiReferenceMode: annotation?.hints.length ? annotation.referenceMode : undefined,
      // Keep the original/manual inputs intact. The edited result belongs to this node's
      // output and must not be written back as a reference to itself.
      composerReferences: references,
    });
    store.propagate(node.id);
  }

  function addOutputImage(
    url: string,
    fileName: string,
    width: number,
    height: number,
    row = 0,
    column = 0,
    operation = mode,
  ) {
    if (!node) return;
    const store = useCanvasStore.getState();
    const sourceWidth = Number(node.measured?.width ?? node.width ?? NODE_W);
    const id = store.addNodeWithImage(
      'image',
      {
        x: node.position.x + sourceWidth + 100 + column * (NODE_W + 40),
        y: node.position.y + row * (NODE_H + 48),
      },
      url,
      fileName,
    );
    store.updateNodeData(id, {
      imageFileName: fileName,
      aspectRatio: `${width}:${height}`,
      editedFromNodeId: node.id,
      editOperation: operation,
      referenceOnly: true,
      ...(operation === 'mask' ? { imageRole: 'mask' } : {}),
    });
  }

  async function applyEdit() {
    if (
      !natural ||
      !sourceReady ||
      !imageRef.current ||
      !node ||
      !sourceUrl ||
      busy ||
      mode === 'preview'
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const image = imageRef.current;
      const exportErrorMessage = t(
        'imageEditor.error.crossOriginExport',
        '当前图片受跨域限制，浏览器无法导出。请先下载后重新上传到图片节点。',
      );
      if (mode === 'crop') {
        const sx = Math.round(cropRect.x * natural.width);
        const sy = Math.round(cropRect.y * natural.height);
        const width = Math.max(1, Math.round(cropRect.width * natural.width));
        const height = Math.max(1, Math.round(cropRect.height * natural.height));
        const { canvas, context } = createCanvas(width, height);
        context.drawImage(image, sx, sy, width, height, 0, 0, width, height);
        const fileName = editedImageName(sourceName, 'crop');
        replaceCurrentImage(canvasDataUrl(canvas, exportErrorMessage), fileName, width, height);
      } else if (mode === 'outpaint') {
        const padX = Math.round((natural.width * outpaintX) / 100);
        const padY = Math.round((natural.height * outpaintY) / 100);
        const { canvas, context } = createCanvas(
          natural.width + padX * 2,
          natural.height + padY * 2,
        );
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, padX, padY, natural.width, natural.height);
        const fileName = editedImageName(sourceName, 'outpaint');
        replaceCurrentImage(
          canvasDataUrl(canvas, exportErrorMessage),
          fileName,
          canvas.width,
          canvas.height,
        );
      } else if (mode === 'mask') {
        const overlay = overlayRef.current;
        if (!overlay || !hasPaintedPixels(overlay))
          throw new Error(t('imageEditor.error.drawMaskFirst', '请先在图片上绘制遮罩区域。'));
        const source = overlay.getContext('2d')?.getImageData(0, 0, overlay.width, overlay.height);
        if (!source) throw new Error(t('imageEditor.error.maskUnavailable', '无法读取遮罩画布。'));
        const { canvas, context } = createCanvas(overlay.width, overlay.height);
        const output = context.createImageData(overlay.width, overlay.height);
        for (let index = 0; index < source.data.length; index += 4) {
          const value = (source.data[index + 3] ?? 0) > 8 ? 255 : 0;
          output.data[index] = value;
          output.data[index + 1] = value;
          output.data[index + 2] = value;
          output.data[index + 3] = 255;
        }
        context.putImageData(output, 0, 0);
        const fileName = editedImageName(sourceName, 'mask');
        addOutputImage(
          canvasDataUrl(canvas, exportErrorMessage),
          fileName,
          canvas.width,
          canvas.height,
          0,
          0,
          'mask',
        );
      } else if (mode === 'brush') {
        const overlay = overlayRef.current;
        const erasureMask = erasureMaskRef.current;
        if (!overlay)
          throw new Error(t('imageEditor.error.drawContentFirst', '请先绘制内容或擦除图片区域。'));
        const hasDrawing = hasPaintedPixels(overlay);
        const hasErasure = Boolean(erasureMask && hasPaintedPixels(erasureMask));
        if (!hasDrawing && !hasErasure)
          throw new Error(t('imageEditor.error.drawContentFirst', '请先绘制内容或擦除图片区域。'));
        const { canvas, context } = createCanvas(natural.width, natural.height);
        context.drawImage(image, 0, 0, natural.width, natural.height);
        context.drawImage(overlay, 0, 0);
        if (hasErasure && erasureMask) applyImageErasureMask(context, erasureMask);
        const fileName = editedImageName(sourceName, 'paint');
        const annotationHints = annotationHintsRef.current;
        replaceCurrentImage(
          canvasDataUrl(canvas, exportErrorMessage),
          fileName,
          canvas.width,
          canvas.height,
          annotationHints.length
            ? {
                sourceUrl: node.data.annotationSourceUrl ?? sourceUrl,
                hints: annotationHints,
                referenceMode: aiReferenceMode,
              }
            : undefined,
        );
      } else if (mode === 'resize') {
        const width = Math.max(1, Math.round(natural.width * resizeScale));
        const height = Math.max(1, Math.round(natural.height * resizeScale));
        const { canvas, context } = createCanvas(width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        const fileName = editedImageName(sourceName, `resize_${Math.round(resizeScale * 100)}pct`);
        replaceCurrentImage(canvasDataUrl(canvas, exportErrorMessage), fileName, width, height);
      } else if (mode === 'grid') {
        const rects = gridSplitRects(natural.width, natural.height, gridRows, gridColumns, gridGap);
        rects.forEach((rect, index) => {
          const { canvas, context } = createCanvas(rect.width, rect.height);
          context.drawImage(
            image,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            rect.width,
            rect.height,
          );
          const order = String(index + 1).padStart(String(rects.length).length, '0');
          const fileName = `${sourceBaseName(sourceName)}_${order}_r${rect.row + 1}_c${rect.column + 1}.png`;
          addOutputImage(
            canvasDataUrl(canvas, exportErrorMessage),
            fileName,
            rect.width,
            rect.height,
            rect.row,
            rect.column,
            'grid',
          );
        });
      }
      closeModal();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('imageEditor.error.editFailed', '图片编辑失败，请重试。'),
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadCurrent() {
    const anchor = document.createElement('a');
    anchor.href = sourceUrl ?? '';
    anchor.download = sourceName;
    anchor.click();
  }

  function editorToolbar() {
    const toolClass = (active = false) =>
      `flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
        active
          ? 'border-white/20 bg-white text-black'
          : 'border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white'
      }`;
    if (mode === 'crop') {
      return (
        <>
          <span className="text-xs text-white/40">{t('imageEditor.crop.ratio', '比例')}</span>
          {CROP_RATIO_PRESETS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={toolClass(cropPreset === key)}
              onClick={() => setCropRatio(key)}
            >
              {key === 'free'
                ? t('imageEditor.crop.ratio.free', '自由')
                : key === 'source'
                  ? t('imageEditor.crop.ratio.source', '原图')
                  : label}
            </button>
          ))}
        </>
      );
    }
    if (mode === 'outpaint') {
      const width = natural ? Math.round(natural.width * (1 + (outpaintX * 2) / 100)) : 0;
      const height = natural ? Math.round(natural.height * (1 + (outpaintY * 2) / 100)) : 0;
      return (
        <>
          <label className="flex items-center gap-2 text-xs text-white/55">
            {t('imageEditor.outpaint.horizontalPadding', '左右留白')}
            <input
              type="range"
              min="0"
              max="100"
              value={outpaintX}
              onChange={(event) => setOutpaintX(Number(event.target.value))}
            />
            <span className="w-9 text-right tabular-nums">{outpaintX}%</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-white/55">
            {t('imageEditor.outpaint.verticalPadding', '上下留白')}
            <input
              type="range"
              min="0"
              max="100"
              value={outpaintY}
              onChange={(event) => setOutpaintY(Number(event.target.value))}
            />
            <span className="w-9 text-right tabular-nums">{outpaintY}%</span>
          </label>
          <span className="text-xs text-white/35">
            {width} × {height}
          </span>
        </>
      );
    }
    if (mode === 'mask' || mode === 'brush') {
      return (
        <>
          {mode === 'brush' && (
            <>
              {(
                [
                  ['free', Paintbrush, '自由画笔'],
                  ['eraser', Eraser, '橡皮擦'],
                  ['rect', Square, '矩形'],
                  ['ellipse', Circle, '椭圆'],
                  ['label', NumberMarkerIcon, '数字标记'],
                  ['text', Type, '文字'],
                  ['arrow', ArrowUpRight, '箭头'],
                ] as const
              ).map(([tool, Icon, label]) => (
                <button
                  key={tool}
                  type="button"
                  title={t(`imageEditor.brush.tool.${tool}`, label)}
                  aria-label={t(`imageEditor.brush.tool.${tool}`, label)}
                  className={toolClass(brushTool === tool)}
                  onClick={() => setBrushTool(tool)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              {brushTool === 'arrow' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title={t('imageEditor.brush.arrow.straight', '直线箭头')}
                    aria-label={t('imageEditor.brush.arrow.straight', '直线箭头')}
                    className={toolClass(arrowStyle === 'straight')}
                    onClick={() => setArrowStyle('straight')}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t('imageEditor.brush.arrow.curved', '半圆箭头')}
                    aria-label={t('imageEditor.brush.arrow.curved', '半圆箭头')}
                    className={toolClass(arrowStyle === 'curved')}
                    onClick={() => setArrowStyle('curved')}
                  >
                    <CornerUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={
                      arrowReversed
                        ? t('imageEditor.brush.arrow.directionStart', '箭头方向：起点')
                        : t('imageEditor.brush.arrow.directionEnd', '箭头方向：终点')
                    }
                    aria-label={t('imageEditor.brush.arrow.reverse', '翻转箭头方向')}
                    className={toolClass(arrowReversed)}
                    onClick={() => setArrowReversed((value) => !value)}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {brushTool === 'text' && (
                <input
                  className="h-8 w-32 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white outline-none focus:border-white/25"
                  value={brushText}
                  onChange={(event) => setBrushText(event.target.value)}
                  placeholder={t('imageEditor.brush.textPlaceholder', '输入标记文字')}
                />
              )}
              {brushTool === 'label' && (
                <span className="text-xs tabular-nums text-white/45">
                  {t('imageEditor.brush.nextLabel', '下一个 {number}', {
                    number: nextLabelNumber,
                  })}
                </span>
              )}
              {brushTool !== 'eraser' && (
                <label className="flex items-center gap-1.5 text-xs text-white/55">
                  {t('imageEditor.brush.color', '颜色')}
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(event) => setBrushColor(event.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent"
                  />
                </label>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/15 p-0.5 text-[11px] text-white/50">
                <span className="px-1">{t('imageEditor.brush.aiReference', 'AI参考')}</span>
                {(
                  [
                    ['annotated', '标注图'],
                    ['original', '原图'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-md px-2 py-1 transition-colors ${
                      aiReferenceMode === value
                        ? 'bg-white text-black'
                        : 'text-white/55 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => setAiReferenceMode(value)}
                    aria-pressed={aiReferenceMode === value}
                  >
                    {t(`imageEditor.brush.reference.${value}`, label)}
                  </button>
                ))}
              </div>
              {brushTool === 'eraser' && (
                <span className="text-[11px] text-white/45">
                  {t('imageEditor.brush.eraserHint', '拖动擦除，擦除区域将变为透明')}
                </span>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-white/55">
            {t('imageEditor.brush.size', '笔刷')}
            <input
              type="range"
              min={mode === 'mask' ? 4 : 2}
              max={activeBrushMax}
              value={
                mode === 'mask'
                  ? maskSize
                  : brushTool === 'arrow'
                    ? arrowSize
                    : brushTool === 'label'
                      ? labelSize
                      : brushSize
              }
              onChange={(event) => {
                const value = Number(event.target.value);
                if (mode === 'mask') setMaskSize(value);
                else if (brushTool === 'arrow') setArrowSize(value);
                else if (brushTool === 'label') setLabelSize(value);
                else setBrushSize(value);
              }}
            />
            <span className="w-10 text-right tabular-nums text-white/45">
              {mode === 'mask'
                ? maskSize
                : brushTool === 'arrow'
                  ? arrowSize
                  : brushTool === 'label'
                    ? labelSize
                    : brushSize}
              px
            </span>
          </label>
          <button
            type="button"
            title={t('imageEditor.brush.undo', '撤销')}
            aria-label={t('imageEditor.brush.undoDrawing', '撤销绘制')}
            className={toolClass()}
            disabled={!drawingHistory?.undo.length}
            onClick={undoDrawing}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('imageEditor.brush.redo', '恢复')}
            aria-label={t('imageEditor.brush.redoDrawing', '恢复绘制')}
            className={toolClass()}
            disabled={!drawingHistory?.redo.length}
            onClick={redoDrawing}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolClass()} onClick={clearDrawing}>
            <Eraser className="h-3.5 w-3.5" />
            {t('imageEditor.brush.clear', '清空')}
          </button>
          <span className="hidden">{drawingRevision}</span>
        </>
      );
    }
    if (mode === 'resize') {
      const width = natural ? Math.max(1, Math.round(natural.width * resizeScale)) : 0;
      const height = natural ? Math.max(1, Math.round(natural.height * resizeScale)) : 0;
      return (
        <>
          <label className="flex items-center gap-2 text-xs text-white/55">
            {t('imageEditor.resize.scale', '倍数')}
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={resizeScale}
              onChange={(event) => setResizeScale(Number(event.target.value))}
            />
          </label>
          <input
            type="number"
            min="0.05"
            max="1"
            step="0.05"
            value={resizeScale}
            onChange={(event) =>
              setResizeScale(Math.max(0.05, Math.min(1, Number(event.target.value))))
            }
            className="h-8 w-20 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white outline-none"
          />
          <span className="text-xs text-white/35">
            × · {width} × {height}
          </span>
        </>
      );
    }
    if (mode === 'grid') {
      return (
        <>
          <span className="text-xs text-white/40">{t('imageEditor.grid.presets', '预设')}</span>
          {(
            [
              [1, 2],
              [2, 1],
              [2, 2],
              [2, 3],
              [3, 2],
              [3, 3],
            ] as const
          ).map(([rows, columns]) => (
            <button
              key={`${rows}-${columns}`}
              type="button"
              className={toolClass(gridRows === rows && gridColumns === columns)}
              onClick={() => {
                setGridRows(rows);
                setGridColumns(columns);
              }}
            >
              {rows}×{columns}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-white/55">
            {t('imageEditor.grid.rows', '行')}
            <input
              type="number"
              min="1"
              max="20"
              value={gridRows}
              onChange={(event) =>
                setGridRows(Math.max(1, Math.min(20, Number(event.target.value))))
              }
              className="h-8 w-14 rounded-lg border border-white/10 bg-black/20 px-2 text-white outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-white/55">
            {t('imageEditor.grid.columns', '列')}
            <input
              type="number"
              min="1"
              max="20"
              value={gridColumns}
              onChange={(event) =>
                setGridColumns(Math.max(1, Math.min(20, Number(event.target.value))))
              }
              className="h-8 w-14 rounded-lg border border-white/10 bg-black/20 px-2 text-white outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/55">
            {t('imageEditor.grid.gap', '间隔')}
            <input
              type="range"
              min="0"
              max="240"
              value={gridGap}
              onChange={(event) => setGridGap(Number(event.target.value))}
            />
            <span className="w-10 tabular-nums">{gridGap}px</span>
          </label>
          <span className="text-xs text-white/35">
            {t('imageEditor.grid.nodeCount', '将生成 {count} 个节点', {
              count: gridRows * gridColumns,
            })}
          </span>
        </>
      );
    }
    return (
      <span className="text-xs text-white/35">
        {natural
          ? `${natural.width} × ${natural.height}`
          : t('imageEditor.status.readingSize', '正在读取图片尺寸…')}
      </span>
    );
  }

  const cropHandleClass: Record<Exclude<CropHandle, 'move'>, string> = {
    n: 'left-1/2 top-0 h-2 w-7 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
    ne: 'right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    e: 'right-0 top-1/2 h-7 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    se: 'bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
    s: 'bottom-0 left-1/2 h-2 w-7 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
    sw: 'bottom-0 left-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    w: 'left-0 top-1/2 h-7 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    nw: 'left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  };

  const imageTransform = {
    transform: `scale(${zoom})`,
    // Center-origin transforms create negative overflow above and to the left. Browsers do not
    // expose that negative region through scrollLeft/scrollTop, so preview edges become
    // unreachable at high zoom. Preview mode grows toward positive scroll coordinates instead.
    transformOrigin: mode === 'preview' ? 'top left' : 'center',
  };

  const brushSizing = imageEditorBrushSizing(
    natural?.width,
    natural?.height,
    imageRef.current?.clientWidth,
    imageRef.current?.clientHeight,
  );
  const activeBrushMax =
    mode === 'mask'
      ? brushSizing.mask.max
      : brushTool === 'arrow'
        ? brushSizing.arrow.max
        : brushTool === 'label'
          ? brushSizing.label.max
          : brushSizing.brush.max;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('imageEditor.aria.editor', '图片编辑器')}
      onMouseDown={() => !busy && closeModal()}
    >
      <div
        className="flex h-[min(92vh,920px)] w-[min(96vw,1540px)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1c] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-16 shrink-0 items-center gap-5 border-b border-white/[0.07] px-5 py-3">
          <div className="min-w-48">
            <h2 className="text-sm font-semibold text-white/90">
              {t(`imageEditor.mode.${mode}.title`, MODE_COPY[mode].title)}
            </h2>
            <p className="mt-0.5 text-[11px] text-white/35">
              {t(`imageEditor.mode.${mode}.hint`, MODE_COPY[mode].hint)}
            </p>
          </div>
          <nav
            className="mx-auto flex items-center rounded-xl border border-white/[0.08] bg-black/15 p-1"
            aria-label={t('imageEditor.aria.modes', '图片编辑模式')}
          >
            {MODE_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMode(key);
                  setError(null);
                }}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors ${mode === key ? 'bg-white text-black shadow-sm' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`imageEditor.mode.${key}.label`, label)}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={closeModal}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label={t('imageEditor.aria.close', '关闭图片编辑器')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-center gap-2 border-b border-white/[0.06] bg-black/10 px-4 py-2">
          {editorToolbar()}
        </div>

        <div
          ref={previewViewportRef}
          className="relative min-h-0 flex-1 overflow-auto bg-[#111113] p-5"
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            setZoom((value) => Math.max(0.15, Math.min(6, value * (event.deltaY > 0 ? 0.9 : 1.1))));
          }}
        >
          <div
            data-image-preview-overflow-origin={
              mode === 'preview' && zoom > 1 ? 'top-left' : 'center'
            }
            className={`flex min-h-full min-w-full ${
              mode === 'preview' && zoom > 1
                ? 'items-start justify-start'
                : 'items-center justify-center'
            }`}
          >
            {mode === 'outpaint' ? (
              <div className="relative">
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt=""
                  className="hidden"
                  onLoad={(event) => initializeLoadedImage(event.currentTarget)}
                  onError={handleImageError}
                />
                <canvas
                  ref={outpaintPreviewRef}
                  className="block max-h-[calc(92vh-210px)] max-w-[calc(96vw-56px)] shadow-2xl"
                  style={imageTransform}
                />
              </div>
            ) : (
              <div
                data-image-preview-pan-target={mode === 'preview' ? 'true' : undefined}
                ref={mode === 'crop' ? cropSurfaceRef : undefined}
                className={`relative inline-block max-h-full max-w-full shadow-2xl ${
                  mode === 'preview'
                    ? previewPanning
                      ? 'cursor-grabbing touch-none select-none'
                      : 'cursor-grab touch-none select-none'
                    : ''
                }`}
                style={imageTransform}
                title={
                  mode === 'preview'
                    ? t('imageEditor.preview.dragHint', '按住鼠标拖动图片浏览')
                    : undefined
                }
                onPointerDown={mode === 'preview' ? beginPreviewPan : undefined}
                onPointerMove={
                  mode === 'preview' ? movePreviewPan : mode === 'crop' ? moveCrop : undefined
                }
                onPointerUp={
                  mode === 'preview' ? endPreviewPan : mode === 'crop' ? endCrop : undefined
                }
                onPointerCancel={
                  mode === 'preview' ? endPreviewPan : mode === 'crop' ? endCrop : undefined
                }
              >
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt=""
                  draggable={false}
                  onLoad={(event) => initializeLoadedImage(event.currentTarget)}
                  onError={handleImageError}
                  className={`block max-h-[calc(92vh-210px)] max-w-[calc(96vw-56px)] select-none object-contain ${mode === 'resize' ? 'opacity-80' : mode === 'brush' && hasErasedPixels ? 'opacity-0' : ''}`}
                />
                <canvas
                  ref={erasedPreviewRef}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 h-full w-full ${mode === 'brush' && hasErasedPixels ? 'opacity-100' : 'opacity-0'}`}
                />
                <canvas
                  ref={overlayRef}
                  onPointerDown={beginDrawing}
                  onPointerMove={moveDrawing}
                  onPointerUp={endDrawing}
                  onPointerCancel={endDrawing}
                  className={`absolute inset-0 h-full w-full touch-none ${isDrawingMode(mode) ? 'cursor-crosshair' : 'pointer-events-none'} ${mode === 'mask' ? 'mix-blend-screen' : ''} ${mode === 'brush' && hasErasedPixels ? 'opacity-0' : ''}`}
                />
                {mode === 'crop' && natural && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0 bg-black/55"
                      style={{
                        clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${cropRect.y * 100}%,${cropRect.x * 100}% ${cropRect.y * 100}%,${cropRect.x * 100}% ${(cropRect.y + cropRect.height) * 100}%,${(cropRect.x + cropRect.width) * 100}% ${(cropRect.y + cropRect.height) * 100}%,${(cropRect.x + cropRect.width) * 100}% ${cropRect.y * 100}%,0 ${cropRect.y * 100}%)`,
                      }}
                    />
                    <div
                      className="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                      style={{
                        left: `${cropRect.x * 100}%`,
                        top: `${cropRect.y * 100}%`,
                        width: `${cropRect.width * 100}%`,
                        height: `${cropRect.height * 100}%`,
                      }}
                      onPointerDown={(event) => beginCropDrag(event, 'move')}
                    >
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-45">
                        <span className="border-b border-r border-white/70" />
                        <span className="border-b border-r border-white/70" />
                        <span className="border-b border-white/70" />
                        <span className="border-b border-r border-white/70" />
                        <span className="border-b border-r border-white/70" />
                        <span className="border-b border-white/70" />
                        <span className="border-r border-white/70" />
                        <span className="border-r border-white/70" />
                        <span />
                      </div>
                      {(Object.keys(cropHandleClass) as Array<Exclude<CropHandle, 'move'>>).map(
                        (handle) => (
                          <button
                            key={handle}
                            type="button"
                            aria-label={t('imageEditor.crop.handle', '裁剪控制点 {handle}', {
                              handle,
                            })}
                            className={`absolute rounded-sm border border-black/30 bg-white ${cropHandleClass[handle]}`}
                            onPointerDown={(event) => beginCropDrag(event, handle)}
                          />
                        ),
                      )}
                    </div>
                  </>
                )}
                {mode === 'grid' && natural && (
                  <div className="pointer-events-none absolute inset-0">
                    {Array.from({ length: gridRows - 1 }, (_, index) => (
                      <span
                        key={`r-${index}`}
                        className="absolute left-0 right-0 -translate-y-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                        style={{
                          top: `${((index + 1) / gridRows) * 100}%`,
                          height: `${Math.max(1, (gridGap / natural.height) * 100)}%`,
                        }}
                      />
                    ))}
                    {Array.from({ length: gridColumns - 1 }, (_, index) => (
                      <span
                        key={`c-${index}`}
                        className="absolute bottom-0 top-0 -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                        style={{
                          left: `${((index + 1) / gridColumns) * 100}%`,
                          width: `${Math.max(1, (gridGap / natural.width) * 100)}%`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {mode === 'resize' && natural && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-xl border border-white/15 bg-black/65 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
                      {Math.round(natural.width * resizeScale)} ×{' '}
                      {Math.round(natural.height * resizeScale)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {imageSourcePages.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  showImagePage(
                    (imageIndex - 1 + imageSourcePages.length) % imageSourcePages.length,
                  )
                }
                className="fixed left-8 top-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/65 backdrop-blur hover:bg-black/75 hover:text-white"
                aria-label={t('imageEditor.navigation.previous', '上一张图片')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => showImagePage((imageIndex + 1) % imageSourcePages.length)}
                className="fixed right-8 top-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/65 backdrop-blur hover:bg-black/75 hover:text-white"
                aria-label={t('imageEditor.navigation.next', '下一张图片')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t border-white/[0.07] px-4 py-2.5">
          <button
            type="button"
            onDoubleClick={() => setZoom(1)}
            className="text-xs font-medium tabular-nums text-white/45 hover:text-white"
            title={t('imageEditor.zoom.resetHint', '双击重置缩放')}
          >
            {Math.round(zoom * 100)}%
          </button>
          {mode === 'preview' && (
            <button
              type="button"
              onClick={downloadCurrent}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              {t('imageEditor.downloadOriginal', '下载原图')}
            </button>
          )}
          {error && <p className="ml-2 max-w-2xl text-xs text-red-300">{error}</p>}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="h-9 rounded-xl border border-white/10 px-4 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              {t('common.cancel', '取消')}
            </button>
            {mode !== 'preview' && (
              <button
                type="button"
                onClick={() => void applyEdit()}
                disabled={busy || !natural || !sourceReady}
                className="flex h-9 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black hover:bg-white/90 disabled:cursor-wait disabled:opacity-45"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t(`imageEditor.mode.${mode}.apply`, MODE_COPY[mode].apply)}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
