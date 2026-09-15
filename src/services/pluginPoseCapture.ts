import type { Landmark, NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';

const POSE_MODEL_PATH = '/mediapipe/models/pose_landmarker_full.task';
const VISION_WASM_PATH = '/mediapipe/wasm';
export const MAX_PLUGIN_POSES = 4;
const RECOVERY_CROP_WIDTH = 0.62;
const POSE_CORE_LANDMARKS = [11, 12, 23, 24] as const;
const POSE_BONE_LIMITS: ReadonlyArray<readonly [number, number, number]> = [
  [11, 12, 1.05],
  [23, 24, 1.05],
  [11, 23, 1.2],
  [12, 24, 1.2],
  [11, 13, 1.05],
  [13, 15, 1.05],
  [12, 14, 1.05],
  [14, 16, 1.05],
  [23, 25, 1.15],
  [25, 27, 1.15],
  [24, 26, 1.15],
  [26, 28, 1.15],
];

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

export const PLUGIN_POSE_ENGINE_IDS = ['gem-x', 'rtmw3d', 'mediapipe-full'] as const;
export type PluginPoseEngineId = (typeof PLUGIN_POSE_ENGINE_IDS)[number];

export type PluginPoseEngineDescriptor = {
  id: PluginPoseEngineId;
  label: string;
  model: string;
  mode: 'video-temporal' | 'frame';
  skeleton:
    | 'qiansi-soma-77'
    | 'qiansi-coco-wholebody-133'
    | 'soma-77'
    | 'coco-wholebody-133'
    | 'mediapipe-33';
  jointCount: 77 | 133 | 33;
  dimensions: '3d' | '2.5d';
  coordinateSpace: 'world-and-camera' | 'camera-relative' | 'normalized-and-hip-relative';
  supportsHands: boolean;
  supportsFace: boolean;
  supportsMultiplePeople: boolean;
  available: boolean;
  availability: 'ready' | 'runtime-required';
  modelInstalled: boolean;
  installAvailable: boolean;
  modelBytes?: number;
  runtimeNote?: string;
  unavailableReason?: string;
};

export type PluginPoseModelInstallInfo = {
  id: 'gem-x' | 'rtmw3d';
  installed: boolean;
  installAvailable: boolean;
  bytes: number;
  runtimeNote: string;
  workerAvailable?: boolean;
  workerAvailability?: 'ready' | 'runtime-required';
  workerBackend?: string;
  workerMessage?: string;
};

const PLUGIN_POSE_ENGINES: readonly PluginPoseEngineDescriptor[] = [
  {
    id: 'gem-x',
    label: 'AI 高质量 · GEM-X',
    model: 'NVIDIA GEM-X (SOMA)',
    mode: 'video-temporal',
    skeleton: 'qiansi-soma-77',
    jointCount: 77,
    dimensions: '3d',
    coordinateSpace: 'world-and-camera',
    supportsHands: true,
    supportsFace: true,
    supportsMultiplePeople: false,
    available: false,
    availability: 'runtime-required',
    modelInstalled: false,
    installAvailable: true,
    unavailableReason: '需要安装独立的 Qiansi AI Motion Worker 与 GEM-X 模型。',
  },
  {
    id: 'rtmw3d',
    label: 'AI 快速预览 · RTMW3D',
    model: 'OpenMMLab RTMW3D',
    mode: 'frame',
    skeleton: 'qiansi-coco-wholebody-133',
    jointCount: 133,
    dimensions: '3d',
    coordinateSpace: 'camera-relative',
    supportsHands: true,
    supportsFace: true,
    supportsMultiplePeople: true,
    available: false,
    availability: 'runtime-required',
    modelInstalled: false,
    installAvailable: true,
    unavailableReason: '需要安装独立的 Qiansi AI Motion Worker 与 RTMW3D 模型。',
  },
] as const;

/**
 * Public, immutable engine catalog. Only managed AI engines are exposed to the plugin UI.
 * The MediaPipe ID remains valid solely for historical capture documents and the bounded
 * host development API; unavailable GEM-X/RTMW3D engines are never substituted with it.
 */
export function listPluginPoseEngines(
  models: readonly PluginPoseModelInstallInfo[] = [],
): PluginPoseEngineDescriptor[] {
  return PLUGIN_POSE_ENGINES.map((engine) => {
    const model = models.find((item) => item.id === engine.id);
    if (!model) return { ...engine };
    const modelInstalled = model.installed === true;
    const available = modelInstalled && model.workerAvailable === true;
    const workerMessage = model.workerMessage?.trim();
    return {
      ...engine,
      available,
      availability: available ? 'ready' : 'runtime-required',
      modelInstalled,
      installAvailable: model.installAvailable === true,
      modelBytes: model.bytes,
      unavailableReason: modelInstalled
        ? workerMessage ||
          model.runtimeNote ||
          '模型包已安装；连接 Qiansi AI Motion Worker 后可开始捕捉。'
        : engine.unavailableReason,
      runtimeNote: available
        ? `${model.workerBackend || engine.model} · AI Motion Worker 已连接。`
        : model.runtimeNote,
    };
  });
}

export function isPluginPoseEngineId(value: unknown): value is PluginPoseEngineId {
  return typeof value === 'string' && PLUGIN_POSE_ENGINE_IDS.includes(value as PluginPoseEngineId);
}

export type PluginPoseLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type PluginPoseFrameRequest = {
  bytes: ArrayBuffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  timestampMs: number;
  width: number;
  height: number;
  maxPoses: number;
};

export type PluginPose = {
  confidence: number;
  landmarks: PluginPoseLandmark[];
  worldLandmarks: PluginPoseLandmark[];
};

export type PluginPoseFrameResult = PluginPose & {
  timestampMs: number;
  detected: boolean;
  poses: PluginPose[];
};

function finiteUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function finiteCoordinate(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function publicLandmark(landmark: NormalizedLandmark | Landmark): PluginPoseLandmark {
  return {
    x: finiteCoordinate(landmark.x),
    y: finiteCoordinate(landmark.y),
    z: finiteCoordinate(landmark.z),
    visibility: finiteUnit(landmark.visibility),
  };
}

function landmarkDistance(left: PluginPoseLandmark, right: PluginPoseLandmark) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function landmarkMidpoint(left: PluginPoseLandmark, right: PluginPoseLandmark) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function poseGeometry(pose: PluginPose) {
  const [
    leftShoulder = { x: 0, y: 0, z: 0, visibility: 0 },
    rightShoulder = { x: 0, y: 0, z: 0, visibility: 0 },
    leftHip = { x: 0, y: 0, z: 0, visibility: 0 },
    rightHip = { x: 0, y: 0, z: 0, visibility: 0 },
  ] = POSE_CORE_LANDMARKS.map(
    (index) => pose.landmarks[index] ?? { x: 0, y: 0, z: 0, visibility: 0 },
  );
  const shoulderCenter = landmarkMidpoint(leftShoulder, rightShoulder);
  const hipCenter = landmarkMidpoint(leftHip, rightHip);
  const center = {
    x: (shoulderCenter.x + hipCenter.x) / 2,
    y: (shoulderCenter.y + hipCenter.y) / 2,
  };
  const scale = Math.max(
    0.05,
    landmarkDistance(leftShoulder, rightShoulder),
    landmarkDistance(leftHip, rightHip),
    Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y),
  );
  return { center, scale };
}

/** Scores whether one 33-point result remains anatomically local to one torso. */
export function pluginPoseIntegrity(pose: PluginPose) {
  if (pose.landmarks.length !== 33 || pose.worldLandmarks.length !== 33) return 0;
  const visibleCore = POSE_CORE_LANDMARKS.filter(
    (index) => (pose.landmarks[index]?.visibility ?? 0) >= 0.25,
  );
  if (visibleCore.length < 3) return 0.35;
  const { scale } = poseGeometry(pose);
  const excesses = POSE_BONE_LIMITS.flatMap(([fromIndex, toIndex, limit]) => {
    const from = pose.landmarks[fromIndex];
    const to = pose.landmarks[toIndex];
    if (!from || !to || from.visibility < 0.25 || to.visibility < 0.25) return [];
    return [Math.max(0, landmarkDistance(from, to) / scale - limit)];
  });
  if (!excesses.length) return 0.35;
  const worst = Math.max(...excesses);
  const average = excesses.reduce((sum, excess) => sum + excess, 0) / excesses.length;
  return finiteUnit(1 - worst * 0.62 - average * 0.45);
}

function samePoseSubject(left: PluginPose, right: PluginPose) {
  const leftGeometry = poseGeometry(left);
  const rightGeometry = poseGeometry(right);
  const centerDistance = Math.hypot(
    leftGeometry.center.x - rightGeometry.center.x,
    leftGeometry.center.y - rightGeometry.center.y,
  );
  const duplicateRadius = Math.max(0.07, Math.min(leftGeometry.scale, rightGeometry.scale) * 0.45);
  return centerDistance <= duplicateRadius;
}

/** Keeps the strongest coherent candidate for each spatially distinct person. */
export function selectReliablePluginPoses(candidates: PluginPose[], maxPoses = MAX_PLUGIN_POSES) {
  const limit = Math.max(1, Math.min(MAX_PLUGIN_POSES, Math.floor(maxPoses)));
  const selected: PluginPose[] = [];
  const ranked = candidates
    .filter((pose) => pose.landmarks.length === 33 && pose.worldLandmarks.length === 33)
    .map((pose) => {
      const integrity = pluginPoseIntegrity(pose);
      return {
        pose,
        score: integrity * 0.72 + finiteUnit(pose.confidence) * 0.28,
      };
    })
    .sort((left, right) => right.score - left.score);
  for (const candidate of ranked) {
    if (selected.some((pose) => samePoseSubject(pose, candidate.pose))) continue;
    selected.push(candidate.pose);
    if (selected.length >= limit) break;
  }
  return selected.sort((left, right) => poseGeometry(left).center.x - poseGeometry(right).center.x);
}

export function shouldRecoverPluginPoseEnsemble(poses: PluginPose[], maxPoses: number) {
  if (maxPoses <= 1) return false;
  return poses.length < 2 || poses.some((pose) => pluginPoseIntegrity(pose) < 0.6);
}

function poseFrameResult(timestampMs: number, poses: PluginPose[]): PluginPoseFrameResult {
  const primary = poses.reduce<PluginPose | null>(
    (best, pose) => (!best || pose.confidence > best.confidence ? pose : best),
    null,
  );
  return {
    timestampMs,
    detected: poses.length > 0,
    confidence: primary?.confidence ?? 0,
    landmarks: primary?.landmarks ?? [],
    worldLandmarks: primary?.worldLandmarks ?? [],
    poses,
  };
}

export function normalizePluginPoseResult(
  timestampMs: number,
  landmarks?: NormalizedLandmark[],
  worldLandmarks?: Landmark[],
): PluginPoseFrameResult {
  return normalizePluginPoseResults(
    timestampMs,
    landmarks ? [landmarks] : [],
    worldLandmarks ? [worldLandmarks] : [],
    1,
  );
}

function normalizePose(
  landmarks?: NormalizedLandmark[],
  worldLandmarks?: Landmark[],
): PluginPose | null {
  const normalized = landmarks?.slice(0, 33).map(publicLandmark) ?? [];
  const world = worldLandmarks?.slice(0, 33).map(publicLandmark) ?? [];
  if (normalized.length !== 33 || world.length !== 33) return null;
  const confidence =
    normalized.length > 0
      ? normalized.reduce((total, landmark) => total + landmark.visibility, 0) / normalized.length
      : 0;
  return {
    confidence: finiteUnit(confidence),
    landmarks: normalized,
    worldLandmarks: world,
  };
}

export function normalizePluginPoseResults(
  timestampMs: number,
  landmarks: NormalizedLandmark[][] = [],
  worldLandmarks: Landmark[][] = [],
  maxPoses = MAX_PLUGIN_POSES,
): PluginPoseFrameResult {
  const poses = landmarks
    .slice(0, Math.max(1, Math.min(MAX_PLUGIN_POSES, Math.floor(maxPoses))))
    .map((pose, index) => normalizePose(pose, worldLandmarks[index]))
    .filter((pose): pose is PluginPose => pose !== null);
  return poseFrameResult(timestampMs, poses);
}

async function getPoseLandmarker() {
  poseLandmarkerPromise ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH },
      runningMode: 'IMAGE',
      numPoses: MAX_PLUGIN_POSES,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputSegmentationMasks: false,
    });
  })();
  return poseLandmarkerPromise;
}

/** Runs one bounded, local-only pose inference for a sandboxed plugin. */
export async function detectPluginPoseFrame(
  request: PluginPoseFrameRequest,
): Promise<PluginPoseFrameResult> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前浏览器不支持本地视频帧解码。');
  }
  const bitmap = await createImageBitmap(new Blob([request.bytes], { type: request.mimeType }));
  try {
    const landmarker = await getPoseLandmarker();
    const result = landmarker.detect(bitmap);
    let candidates: PluginPose[];
    try {
      candidates = normalizePluginPoseResults(
        0,
        result.landmarks,
        result.worldLandmarks,
        MAX_PLUGIN_POSES,
      ).poses;
    } finally {
      result.close();
    }
    if (shouldRecoverPluginPoseEnsemble(candidates, request.maxPoses)) {
      const cropWidth = Math.max(16, Math.round(bitmap.width * RECOVERY_CROP_WIDTH));
      const cropStarts = [0, Math.max(0, bitmap.width - cropWidth)];
      for (const cropStart of cropStarts) {
        let crop: ImageBitmap | null = null;
        try {
          crop = await createImageBitmap(bitmap, cropStart, 0, cropWidth, bitmap.height);
          const cropResult = landmarker.detect(crop);
          try {
            const localPoses = normalizePluginPoseResults(
              0,
              cropResult.landmarks,
              cropResult.worldLandmarks,
              MAX_PLUGIN_POSES,
            ).poses;
            candidates.push(
              ...localPoses.map((pose) => ({
                ...pose,
                landmarks: pose.landmarks.map((landmark) => ({
                  ...landmark,
                  x: (cropStart + landmark.x * cropWidth) / bitmap.width,
                })),
              })),
            );
          } finally {
            cropResult.close();
          }
        } catch {
          // Keep the valid full-frame candidates when this browser cannot create a recovery crop.
        } finally {
          crop?.close();
        }
      }
    }
    return poseFrameResult(
      request.timestampMs,
      selectReliablePluginPoses(candidates, request.maxPoses),
    );
  } finally {
    bitmap.close();
  }
}
