import type { BoundingBox, FaceDetector } from '@mediapipe/tasks-vision';

export interface DetectedFaceRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

const FACE_MODEL_PATH = '/mediapipe/models/blaze_face_short_range.tflite';
const VISION_WASM_PATH = '/mediapipe/wasm';
const FACE_BOX_PADDING = 0.12;

let detectorPromise: Promise<FaceDetector> | null = null;

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function normalizeFaceBoundingBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  padding = FACE_BOX_PADDING,
): Omit<DetectedFaceRegion, 'id' | 'confidence'> | null {
  if (imageWidth <= 0 || imageHeight <= 0 || box.width <= 0 || box.height <= 0) return null;

  const x = box.originX / imageWidth;
  const y = box.originY / imageHeight;
  const width = box.width / imageWidth;
  const height = box.height / imageHeight;
  const paddedX = clampUnit(x - width * padding);
  const paddedY = clampUnit(y - height * padding);
  const right = clampUnit(x + width * (1 + padding));
  const bottom = clampUnit(y + height * (1 + padding));

  return {
    x: paddedX,
    y: paddedY,
    width: Math.max(0, right - paddedX),
    height: Math.max(0, bottom - paddedY),
  };
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，暂时无法识别人脸。'));
    image.src = sourceUrl;
  });
}

async function getFaceDetector() {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_PATH },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });
  })();
  return detectorPromise;
}

export async function detectFaceRegions(sourceUrl: string): Promise<DetectedFaceRegion[]> {
  const image = await loadImage(sourceUrl);
  const detector = await getFaceDetector();
  const result = detector.detect(image);

  return result.detections
    .map((detection, index) => {
      if (!detection.boundingBox) return null;
      const region = normalizeFaceBoundingBox(
        detection.boundingBox,
        image.naturalWidth,
        image.naturalHeight,
      );
      if (!region) return null;
      return {
        id: `face-${index + 1}`,
        ...region,
        confidence: detection.categories[0]?.score ?? 0,
      };
    })
    .filter((region): region is DetectedFaceRegion => region !== null)
    .sort((left, right) => right.confidence - left.confidence);
}
