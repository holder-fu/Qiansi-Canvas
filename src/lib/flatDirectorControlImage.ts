import type { DirectorSceneState, DirectorSubjectPlacement } from '../canvas/nodeTypes';
import type { GenParams } from '../store/canvasStore';
import { DIRECTOR_BODY_FACING_LABELS, normalizeDirectorScene } from './directorConstraints';

const CONTROL_IMAGE_LONG_SIDE = 1200;
const BACKGROUND_IMAGE_LOAD_TIMEOUT_MS = 8_000;
const SUBJECT_COLORS = ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];

const ASPECT_RATIO_PARTS: Record<GenParams['aspectRatio'], readonly [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '3:4': [3, 4],
  '4:3': [4, 3],
  '2:3': [2, 3],
  '3:2': [3, 2],
  '4:5': [4, 5],
  '5:4': [5, 4],
  '21:9': [21, 9],
};

export interface FlatDirectorControlImageSize {
  width: number;
  height: number;
}

export interface FlatDirectorObjectCoverCrop {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

export function normalizeFlatDirectorControlAspectRatio(value: unknown): GenParams['aspectRatio'] {
  return typeof value === 'string' && Object.hasOwn(ASPECT_RATIO_PARTS, value)
    ? (value as GenParams['aspectRatio'])
    : '16:9';
}

/** Resolves every image ratio exposed by GenParams against a shared 1200 px long edge. */
export function getFlatDirectorControlImageSize(
  aspectRatio: unknown,
): FlatDirectorControlImageSize {
  const normalized = normalizeFlatDirectorControlAspectRatio(aspectRatio);
  const [ratioWidth, ratioHeight] = ASPECT_RATIO_PARTS[normalized];
  if (ratioWidth >= ratioHeight) {
    return {
      width: CONTROL_IMAGE_LONG_SIDE,
      height: Math.round((CONTROL_IMAGE_LONG_SIDE * ratioHeight) / ratioWidth),
    };
  }
  return {
    width: Math.round((CONTROL_IMAGE_LONG_SIDE * ratioWidth) / ratioHeight),
    height: CONTROL_IMAGE_LONG_SIDE,
  };
}

/** Mirrors CSS object-fit: cover by returning the centered visible source rectangle. */
export function getFlatDirectorObjectCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FlatDirectorObjectCoverCrop | null {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return null;
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sWidth = targetWidth / scale;
  const sHeight = targetHeight / scale;
  return {
    sx: (sourceWidth - sWidth) / 2,
    sy: (sourceHeight - sHeight) / 2,
    sWidth,
    sHeight,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function loadBackgroundImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    if (/^https?:\/\//i.test(url)) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const timeoutId = setTimeout(() => finish(null), BACKGROUND_IMAGE_LOAD_TIMEOUT_MS);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish(image);
  });
}

function createCanvas(size: FlatDirectorControlImageSize): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function drawCoverBackground(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: FlatDirectorControlImageSize,
) {
  const crop = getFlatDirectorObjectCoverCrop(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    size.width,
    size.height,
  );
  if (!crop) return false;
  try {
    context.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sWidth,
      crop.sHeight,
      0,
      0,
      size.width,
      size.height,
    );
    return true;
  } catch {
    return false;
  }
}

function drawNineGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.strokeStyle = 'rgba(255,255,255,.46)';
  context.lineWidth = Math.max(1.5, Math.min(width, height) / 420);
  context.setLineDash([Math.max(8, width / 110), Math.max(7, width / 150)]);
  for (const fraction of [1 / 3, 2 / 3]) {
    context.beginPath();
    context.moveTo(width * fraction, 0);
    context.lineTo(width * fraction, height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, height * fraction);
    context.lineTo(width, height * fraction);
    context.stroke();
  }
  context.restore();
}

function drawTextPlate(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  topY: number,
  width: number,
  height: number,
  fontSize: number,
  color = '#ffffff',
) {
  context.save();
  context.font = `600 ${fontSize}px sans-serif`;
  const padding = Math.max(8, fontSize * 0.65);
  const plateWidth = Math.min(width - padding * 2, context.measureText(text).width + padding * 2);
  const plateHeight = fontSize + padding;
  const x = clamp(centerX - plateWidth / 2, padding, width - plateWidth - padding);
  const y = clamp(topY, padding, height - plateHeight - padding);
  context.fillStyle = 'rgba(2,6,23,.82)';
  context.fillRect(x, y, plateWidth, plateHeight);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x + plateWidth / 2, y + plateHeight / 2, plateWidth - padding);
  context.restore();
}

function drawSceneObjects(
  context: CanvasRenderingContext2D,
  scene: DirectorSceneState,
  width: number,
  height: number,
) {
  const base = Math.min(width, height);
  scene.sceneObjects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => left.object.y - right.object.y || left.index - right.index)
    .forEach(({ object, index }) => {
      const x = (object.x / 100) * width;
      const y = (object.y / 100) * height;
      const scale = clamp(object.scale / 100, 0.35, 2.5);
      const markerWidth = base * 0.15 * scale;
      const markerHeight = base * 0.055 * scale;
      context.save();
      context.fillStyle = 'rgba(251,191,36,.28)';
      context.strokeStyle = '#fbbf24';
      context.lineWidth = Math.max(2, base / 280);
      context.fillRect(x - markerWidth / 2, y - markerHeight / 2, markerWidth, markerHeight);
      context.strokeRect(x - markerWidth / 2, y - markerHeight / 2, markerWidth, markerHeight);
      context.restore();
      drawTextPlate(
        context,
        `物${index + 1} · ${object.label}`,
        x,
        y + markerHeight / 2 + 5,
        width,
        height,
        Math.max(12, Math.round(base / 52)),
        '#fef3c7',
      );
    });
}

function drawPersonSilhouette(
  context: CanvasRenderingContext2D,
  x: number,
  footY: number,
  scalePercent: number,
  width: number,
  height: number,
  color: string,
  label: string,
  bodyAngle?: number,
) {
  const scale = clamp(scalePercent / 100, 0.3, 3);
  const figureHeight = height * 0.3 * scale;
  const headRadius = figureHeight * 0.095;
  const headY = footY - figureHeight + headRadius;
  const shoulderY = footY - figureHeight * 0.68;
  const hipY = footY - figureHeight * 0.32;
  const shoulderHalfWidth = figureHeight * 0.13;
  const hipHalfWidth = figureHeight * 0.08;
  const stroke = Math.max(3, figureHeight * 0.045);

  context.save();
  context.strokeStyle = 'rgba(2,6,23,.84)';
  context.fillStyle = color;
  context.lineWidth = stroke + Math.max(2, stroke * 0.45);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(x - hipHalfWidth, hipY);
  context.lineTo(x - figureHeight * 0.075, footY);
  context.moveTo(x + hipHalfWidth, hipY);
  context.lineTo(x + figureHeight * 0.075, footY);
  context.moveTo(x - shoulderHalfWidth, shoulderY);
  context.lineTo(x - figureHeight * 0.19, footY - figureHeight * 0.3);
  context.moveTo(x + shoulderHalfWidth, shoulderY);
  context.lineTo(x + figureHeight * 0.19, footY - figureHeight * 0.3);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = stroke;
  context.stroke();
  context.beginPath();
  context.moveTo(x - shoulderHalfWidth, shoulderY);
  context.lineTo(x + shoulderHalfWidth, shoulderY);
  context.lineTo(x + hipHalfWidth, hipY);
  context.lineTo(x - hipHalfWidth, hipY);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(2,6,23,.84)';
  context.lineWidth = Math.max(2, stroke * 0.5);
  context.stroke();
  context.beginPath();
  context.arc(x, headY, headRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  if (typeof bodyAngle === 'number') {
    const angle = ((bodyAngle - 90) * Math.PI) / 180;
    const arrowStartY = footY - figureHeight * 0.57;
    const arrowLength = figureHeight * 0.28;
    const arrowX = x + Math.cos(angle) * arrowLength;
    const arrowY = arrowStartY + Math.sin(angle) * arrowLength;
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#ffffff';
    context.lineWidth = Math.max(3, figureHeight * 0.025);
    context.beginPath();
    context.moveTo(x, arrowStartY);
    context.lineTo(arrowX, arrowY);
    context.stroke();
    context.beginPath();
    context.arc(arrowX, arrowY, Math.max(4, figureHeight * 0.035), 0, Math.PI * 2);
    context.fill();
  }

  // The saved x/y coordinate is the feet anchor, not the marker center.
  context.fillStyle = '#ffffff';
  context.strokeStyle = 'rgba(2,6,23,.9)';
  context.lineWidth = Math.max(2, stroke * 0.45);
  context.beginPath();
  context.arc(x, footY, Math.max(5, figureHeight * 0.035), 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 48));
  const belowY = footY + Math.max(8, fontSize * 0.45);
  const labelY = belowY + fontSize * 2 < height ? belowY : headY - fontSize * 2.4;
  drawTextPlate(context, label, x, labelY, width, height, fontSize);
}

function subjectLetter(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : `P${index + 1}`;
}

function drawMainSubject(
  context: CanvasRenderingContext2D,
  subject: DirectorSubjectPlacement,
  originalIndex: number,
  width: number,
  height: number,
) {
  const letter = subjectLetter(originalIndex);
  const facing = DIRECTOR_BODY_FACING_LABELS[subject.bodyFacing];
  drawPersonSilhouette(
    context,
    (subject.x / 100) * width,
    (subject.y / 100) * height,
    subject.scale,
    width,
    height,
    SUBJECT_COLORS[originalIndex % SUBJECT_COLORS.length] ?? '#38bdf8',
    `${letter} · ${subject.label || `人物 ${originalIndex + 1}`} · ${facing}`,
    subject.bodyAngle,
  );
}

function drawActors(
  context: CanvasRenderingContext2D,
  scene: DirectorSceneState,
  width: number,
  height: number,
) {
  (scene.backgroundActors ?? [])
    .map((actor, index) => ({ actor, index }))
    .sort((left, right) => left.actor.y - right.actor.y || left.index - right.index)
    .forEach(({ actor, index }) => {
      drawPersonSilhouette(
        context,
        (actor.x / 100) * width,
        (actor.y / 100) * height,
        actor.scale,
        width,
        height,
        '#94a3b8',
        `群演${index + 1} · ${actor.label}`,
      );
    });

  // Keep identity letters tied to the original subjects order while painting far-to-near by y.
  scene.subjects
    .map((subject, index) => ({ subject, index }))
    .sort((left, right) => left.subject.y - right.subject.y || left.index - right.index)
    .forEach(({ subject, index }) => drawMainSubject(context, subject, index, width, height));
}

function drawHeaderAndLegend(
  context: CanvasRenderingContext2D,
  scene: DirectorSceneState,
  width: number,
  height: number,
) {
  const base = Math.min(width, height);
  const headerFont = Math.max(15, Math.round(base / 34));
  const footerFont = Math.max(11, Math.round(base / 56));
  context.save();
  context.fillStyle = 'rgba(2,6,23,.82)';
  context.fillRect(0, 0, width, headerFont * 2.25);
  context.fillStyle = '#f8fafc';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = `700 ${headerFont}px sans-serif`;
  context.fillText(
    `2D 站位控制图 · ${scene.sceneName.trim() || '未命名场景'} · ${scene.subjects.length} 名主角`,
    headerFont,
    headerFont * 1.15,
    width - headerFont * 2,
  );
  context.fillStyle = 'rgba(2,6,23,.82)';
  context.fillRect(0, height - footerFont * 2.5, width, footerFont * 2.5);
  context.fillStyle = '#e2e8f0';
  context.font = `600 ${footerFont}px sans-serif`;
  context.fillText(
    '字母 = 人物身份顺序 · 白色脚点 = 精确站位 · 白色箭头 = 身体朝向 · 虚线 = 九宫格',
    footerFont,
    height - footerFont * 1.2,
    width - footerFont * 2,
  );
  context.restore();
}

function paintControlImage(
  scene: DirectorSceneState,
  size: FlatDirectorControlImageSize,
  background: HTMLImageElement | null,
) {
  const canvas = createCanvas(size);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, size.width, size.height);
  const backgroundDrawn = background ? drawCoverBackground(context, background, size) : false;
  if (backgroundDrawn) {
    context.fillStyle = 'rgba(2,6,23,.18)';
    context.fillRect(0, 0, size.width, size.height);
  }
  drawNineGrid(context, size.width, size.height);
  drawSceneObjects(context, scene, size.width, size.height);
  drawActors(context, scene, size.width, size.height);
  drawHeaderAndLegend(context, scene, size.width, size.height);
  return { canvas, backgroundDrawn };
}

/**
 * Renders an AI-readable placement reference. A failed or tainted scene image is retried against
 * the neutral background, so a cross-origin asset cannot make applying the director scene fail.
 */
export async function renderFlatDirectorControlImage(
  input: DirectorSceneState,
  aspectRatio: GenParams['aspectRatio'],
): Promise<string> {
  const scene = normalizeDirectorScene({ ...input, stageMode: 'flat' });
  const size = getFlatDirectorControlImageSize(aspectRatio);
  const backgroundUrl = scene.sceneUrl || scene.sceneReferenceUrl || '';
  const background = await loadBackgroundImage(backgroundUrl);
  const rendered = paintControlImage(scene, size, background);
  if (!rendered) return '';
  try {
    return rendered.canvas.toDataURL('image/png');
  } catch {
    if (!rendered.backgroundDrawn) return '';
    const fallback = paintControlImage(scene, size, null);
    if (!fallback) return '';
    try {
      return fallback.canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }
}
