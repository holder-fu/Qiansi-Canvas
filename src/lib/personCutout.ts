import type {
  ImageSegmenter,
  ImageSegmenterResult,
  InteractiveSegmenterLegacy,
  MPMask,
} from '@mediapipe/tasks-vision';

const HIGH_QUALITY_PERSON_MODEL_PATH = '/mediapipe/models/selfie_multiclass_256x256.tflite';
const FALLBACK_PERSON_MODEL_PATH = '/mediapipe/models/selfie_segmenter.tflite';
const INTERACTIVE_PERSON_MODEL_PATH = '/mediapipe/models/magic_touch.tflite';
const VISION_WASM_PATH = '/mediapipe/wasm';
const WEAK_FOREGROUND_THRESHOLD = 0.24;
const STRONG_FOREGROUND_THRESHOLD = 0.58;
const MIN_COMPONENT_PIXELS = 6;

let highQualitySegmenterPromise: Promise<ImageSegmenter> | null = null;
let fallbackSegmenterPromise: Promise<ImageSegmenter> | null = null;
let interactiveSegmenterPromise: Promise<InteractiveSegmenterLegacy> | null = null;

interface PersonSegmentation {
  confidence: Float32Array;
  anchorConfidence?: Float32Array;
  supportConfidence?: Float32Array;
  width: number;
  height: number;
  masks: MPMask[];
}

export interface PersonAnchor {
  x: number;
  y: number;
}

export interface PersonCutoutResult {
  imageUrl: string;
  method: 'interactive' | 'multiclass';
}

interface MaskComponent {
  pixels: number[];
  strongPixels: number;
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    if (!sourceUrl.startsWith('data:') && !sourceUrl.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，无法进行本地人像抠图。'));
    image.src = sourceUrl;
  });
}

async function createPersonSegmenter(modelAssetPath: string) {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

async function getHighQualityPersonSegmenter() {
  highQualitySegmenterPromise ??= createPersonSegmenter(HIGH_QUALITY_PERSON_MODEL_PATH);
  return highQualitySegmenterPromise;
}

async function getFallbackPersonSegmenter() {
  fallbackSegmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FALLBACK_PERSON_MODEL_PATH },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
  return fallbackSegmenterPromise;
}

async function getInteractivePersonSegmenter() {
  interactiveSegmenterPromise ??= (async () => {
    const { FilesetResolver, InteractiveSegmenterLegacy } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
    return InteractiveSegmenterLegacy.createFromOptions(vision, {
      baseOptions: { modelAssetPath: INTERACTIVE_PERSON_MODEL_PATH },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
  return interactiveSegmenterPromise;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function foregroundConfidence(
  segmenter: ImageSegmenter,
  result: ImageSegmenterResult,
): PersonSegmentation {
  const masks = result.confidenceMasks ?? [];
  const firstMask = masks[0];
  if (!firstMask) throw new Error('本地人物分割没有识别到可用的人像蒙版。');

  const labels = segmenter.getLabels().map((label) => label.trim().toLowerCase());
  const backgroundIndex = labels.findIndex((label) => label === 'background');
  if (backgroundIndex >= 0 && masks[backgroundIndex]) {
    const maskValues = masks.map((mask) => mask.getAsFloat32Array());
    const background = masks[backgroundIndex].getAsFloat32Array();
    const confidence = new Float32Array(background.length);
    const anchorConfidence = new Float32Array(background.length);
    const supportConfidence = new Float32Array(background.length);
    for (let index = 0; index < background.length; index += 1) {
      confidence[index] = 1 - (background[index] ?? 1);
      for (let maskIndex = 0; maskIndex < maskValues.length; maskIndex += 1) {
        const label = labels[maskIndex] ?? '';
        const value = maskValues[maskIndex]?.[index] ?? 0;
        if (label.includes('hair') || label.includes('face')) {
          anchorConfidence[index] = Math.max(anchorConfidence[index] ?? 0, value);
        }
        if (label.includes('body') || label.includes('cloth')) {
          supportConfidence[index] = Math.max(supportConfidence[index] ?? 0, value);
        }
      }
    }
    return {
      confidence,
      anchorConfidence,
      supportConfidence,
      width: firstMask.width,
      height: firstMask.height,
      masks,
    };
  }

  return {
    confidence: new Float32Array(firstMask.getAsFloat32Array()),
    width: firstMask.width,
    height: firstMask.height,
    masks,
  };
}

function collectMaskComponents(
  confidence: Float32Array,
  width: number,
  height: number,
): MaskComponent[] {
  const expectedLength = width * height;
  const visited = new Uint8Array(expectedLength);
  const queue = new Int32Array(expectedLength);
  const components: MaskComponent[] = [];

  for (let start = 0; start < expectedLength; start += 1) {
    if (visited[start] || (confidence[start] ?? 0) < WEAK_FOREGROUND_THRESHOLD) continue;
    let queueStart = 0;
    let queueEnd = 0;
    let strongPixels = 0;
    const pixels: number[] = [];
    queue[queueEnd++] = start;
    visited[start] = 1;

    while (queueStart < queueEnd) {
      const index = queue[queueStart++] ?? 0;
      pixels.push(index);
      if ((confidence[index] ?? 0) >= STRONG_FOREGROUND_THRESHOLD) strongPixels += 1;
      const x = index % width;
      const y = Math.floor(index / width);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nextY = y + offsetY;
        if (nextY < 0 || nextY >= height) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (visited[next] || (confidence[next] ?? 0) < WEAK_FOREGROUND_THRESHOLD) continue;
          visited[next] = 1;
          queue[queueEnd++] = next;
        }
      }
    }
    components.push({ pixels, strongPixels });
  }
  return components;
}

/** Finds likely complete people and excludes disconnected clothes, hands and hairstyle samples. */
export function derivePersonAnchors(
  confidence: Float32Array,
  anchorConfidence: Float32Array,
  supportConfidence: Float32Array,
  width: number,
  height: number,
): PersonAnchor[] {
  if (
    confidence.length !== width * height ||
    anchorConfidence.length !== confidence.length ||
    supportConfidence.length !== confidence.length
  ) {
    throw new Error('人物锚点蒙版尺寸无效。');
  }

  return collectMaskComponents(confidence, width, height)
    .map((component) => {
      let anchorMaximum = 0;
      let supportPixels = 0;
      let weightedX = 0;
      let weightedY = 0;
      let weightSum = 0;
      for (const index of component.pixels) {
        const anchor = anchorConfidence[index] ?? 0;
        const support = supportConfidence[index] ?? 0;
        anchorMaximum = Math.max(anchorMaximum, anchor);
        if (support >= 0.25) supportPixels += 1;
        const weight = Math.max(0.01, support * 1.5 + (confidence[index] ?? 0));
        weightedX += (index % width) * weight;
        weightedY += Math.floor(index / width) * weight;
        weightSum += weight;
      }
      const largePortrait = component.pixels.length >= width * height * 0.012;
      const hasBodySupport = supportPixels >= Math.max(3, component.pixels.length * 0.025);
      if (anchorMaximum < 0.35 || (!hasBodySupport && !largePortrait)) return null;
      return {
        anchor: {
          x: Math.max(0, Math.min(1, (weightedX / weightSum + 0.5) / width)),
          y: Math.max(0, Math.min(1, (weightedY / weightSum + 0.5) / height)),
        },
        size: component.pixels.length,
      };
    })
    .filter((candidate): candidate is { anchor: PersonAnchor; size: number } => candidate !== null)
    .sort((left, right) => right.size - left.size)
    .slice(0, 8)
    .map((candidate) => candidate.anchor);
}

async function refinePeopleWithAnchors(
  image: HTMLImageElement,
  anchors: PersonAnchor[],
): Promise<{ confidence: Float32Array; width: number; height: number } | null> {
  if (anchors.length === 0) return null;
  const segmenter = await getInteractivePersonSegmenter();
  let combined: Float32Array | undefined;
  let maskWidth = 0;
  let maskHeight = 0;

  for (const anchor of anchors) {
    const result = segmenter.segment(image, { keypoint: anchor });
    const masks = result.confidenceMasks ?? [];
    try {
      const firstMask = masks[0];
      if (!firstMask) continue;
      const anchorX = Math.max(
        0,
        Math.min(firstMask.width - 1, Math.round(anchor.x * firstMask.width)),
      );
      const anchorY = Math.max(
        0,
        Math.min(firstMask.height - 1, Math.round(anchor.y * firstMask.height)),
      );
      const anchorIndex = anchorY * firstMask.width + anchorX;
      const candidates = masks.map((mask) => ({ mask, values: mask.getAsFloat32Array() }));
      const firstCandidate = candidates[0];
      if (!firstCandidate) continue;
      const foreground = candidates
        .slice(1)
        .reduce(
          (best, candidate) =>
            (candidate.values[anchorIndex] ?? 0) > (best.values[anchorIndex] ?? 0)
              ? candidate
              : best,
          firstCandidate,
        );
      if (!combined) {
        maskWidth = foreground.mask.width;
        maskHeight = foreground.mask.height;
        combined = new Float32Array(foreground.values);
      } else if (foreground.mask.width === maskWidth && foreground.mask.height === maskHeight) {
        for (let index = 0; index < combined.length; index += 1) {
          combined[index] = Math.max(combined[index] ?? 0, foreground.values[index] ?? 0);
        }
      }
    } finally {
      result.close();
    }
  }
  return combined ? { confidence: combined, width: maskWidth, height: maskHeight } : null;
}

function resampleConfidence(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return new Float32Array(source);
  }
  const target = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const y0 = Math.max(0, Math.min(sourceHeight - 1, Math.floor(sourceY)));
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const mixY = Math.max(0, Math.min(1, sourceY - y0));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const x0 = Math.max(0, Math.min(sourceWidth - 1, Math.floor(sourceX)));
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const mixX = Math.max(0, Math.min(1, sourceX - x0));
      const top =
        (source[y0 * sourceWidth + x0] ?? 0) * (1 - mixX) +
        (source[y0 * sourceWidth + x1] ?? 0) * mixX;
      const bottom =
        (source[y1 * sourceWidth + x0] ?? 0) * (1 - mixX) +
        (source[y1 * sourceWidth + x1] ?? 0) * mixX;
      target[y * targetWidth + x] = top * (1 - mixY) + bottom * mixY;
    }
  }
  return target;
}

/** Restores foreground regions physically attached to a person, such as clothes or held props. */
export function mergeAttachedPersonItems(
  personConfidence: Float32Array,
  personWidth: number,
  personHeight: number,
  coarseConfidence: Float32Array,
  coarseWidth: number,
  coarseHeight: number,
): Float32Array {
  if (
    personConfidence.length !== personWidth * personHeight ||
    coarseConfidence.length !== coarseWidth * coarseHeight
  ) {
    throw new Error('人物随身物品蒙版尺寸无效。');
  }
  const coarse = resampleConfidence(
    coarseConfidence,
    coarseWidth,
    coarseHeight,
    personWidth,
    personHeight,
  );
  const merged = new Float32Array(personConfidence);
  const proximity = new Uint8Array(personWidth * personHeight);
  const radius = Math.max(2, Math.round(Math.min(personWidth, personHeight) * 0.008));

  for (let index = 0; index < personConfidence.length; index += 1) {
    if ((personConfidence[index] ?? 0) < 0.42) continue;
    const x = index % personWidth;
    const y = Math.floor(index / personWidth);
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      const nextY = y + offsetY;
      if (nextY < 0 || nextY >= personHeight) continue;
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const nextX = x + offsetX;
        if (nextX < 0 || nextX >= personWidth) continue;
        proximity[nextY * personWidth + nextX] = 1;
      }
    }
  }

  const totalPixels = personWidth * personHeight;
  for (const component of collectMaskComponents(coarse, personWidth, personHeight)) {
    if (component.pixels.length < MIN_COMPONENT_PIXELS || component.strongPixels === 0) continue;
    let touchesPerson = false;
    let confidenceSum = 0;
    for (const index of component.pixels) {
      if (proximity[index]) touchesPerson = true;
      confidenceSum += coarse[index] ?? 0;
    }
    const averageConfidence = confidenceSum / component.pixels.length;
    const tooLargeAndUncertain =
      component.pixels.length > totalPixels * 0.45 && averageConfidence < 0.62;
    if (!touchesPerson || tooLargeAndUncertain) continue;
    for (const index of component.pixels) {
      merged[index] = Math.max(merged[index] ?? 0, coarse[index] ?? 0);
    }
  }
  return merged;
}

async function segmentPerson(image: HTMLImageElement) {
  try {
    const segmenter = await getHighQualityPersonSegmenter();
    return foregroundConfidence(segmenter, segmenter.segment(image));
  } catch {
    const segmenter = await getFallbackPersonSegmenter();
    return foregroundConfidence(segmenter, segmenter.segment(image));
  }
}

/** Removes low-confidence haze and isolated mask fragments while retaining soft subject edges. */
export function refinePersonAlphaMask(
  confidence: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const expectedLength = width * height;
  if (width <= 0 || height <= 0 || confidence.length !== expectedLength) {
    throw new Error('人物蒙版尺寸无效。');
  }

  const retained = new Uint8Array(expectedLength);
  for (const component of collectMaskComponents(confidence, width, height)) {
    if (component.pixels.length >= MIN_COMPONENT_PIXELS && component.strongPixels > 0) {
      for (const index of component.pixels) retained[index] = 1;
    }
  }

  const alpha = new Uint8ClampedArray(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    if (!retained[index]) continue;
    alpha[index] = Math.round(smoothstep(0.3, 0.72, confidence[index] ?? 0) * 255);
  }
  return alpha;
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement) {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('图片来源不允许本地读取像素，无法导出透明 PNG。');
  }
}

/**
 * Removes the background with the bundled on-device person segmentation model.
 * The source pixels never leave the browser and no configured AI provider is used.
 */
export async function cutoutPersonLocally(sourceUrl: string): Promise<PersonCutoutResult> {
  const image = await loadImage(sourceUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效，无法进行人像抠图。');

  const segmentation = await segmentPerson(image);

  try {
    const anchors =
      segmentation.anchorConfidence && segmentation.supportConfidence
        ? derivePersonAnchors(
            segmentation.confidence,
            segmentation.anchorConfidence,
            segmentation.supportConfidence,
            segmentation.width,
            segmentation.height,
          )
        : [];
    const interactive = await refinePeopleWithAnchors(image, anchors);
    const finalConfidence = interactive
      ? mergeAttachedPersonItems(
          interactive.confidence,
          interactive.width,
          interactive.height,
          segmentation.confidence,
          segmentation.width,
          segmentation.height,
        )
      : segmentation.confidence;
    const finalWidth = interactive?.width ?? segmentation.width;
    const finalHeight = interactive?.height ?? segmentation.height;
    const alpha = refinePersonAlphaMask(finalConfidence, finalWidth, finalHeight);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = finalWidth;
    maskCanvas.height = finalHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) throw new Error('浏览器无法创建人像蒙版画布。');

    const maskPixels = maskContext.createImageData(finalWidth, finalHeight);
    for (let index = 0; index < alpha.length; index += 1) {
      const offset = index * 4;
      maskPixels.data[offset] = 255;
      maskPixels.data[offset + 1] = 255;
      maskPixels.data[offset + 2] = 255;
      maskPixels.data[offset + 3] = alpha[index] ?? 0;
    }
    maskContext.putImageData(maskPixels, 0, 0);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('浏览器无法创建人像输出画布。');
    outputContext.drawImage(image, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(maskCanvas, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'source-over';
    return {
      imageUrl: canvasToPngDataUrl(outputCanvas),
      method: interactive ? 'interactive' : 'multiclass',
    };
  } finally {
    segmentation.masks.forEach((mask) => mask.close());
  }
}
