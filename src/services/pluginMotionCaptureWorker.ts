import { resolveBridgeUrl } from '../lib/bridgeUrl';

const BRIDGE_BASE_URL = import.meta.env.VITE_QIANSI_CANVAS_BRIDGE_URL || 'http://127.0.0.1:2895';

export type PluginMotionEngineId = 'gem-x' | 'rtmw3d';

export type PluginMotionCaptureRequest = {
  engineId: PluginMotionEngineId;
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  durationSeconds: number;
  width: number;
  height: number;
  sampleFps: 5 | 10 | 15;
  maxPoses: number;
  confidenceThreshold: number;
  smoothing: number;
  staticCamera: boolean;
  detectionThreshold: number;
  trackingMethod: 'iou' | 'oks';
  trackingThreshold: number;
};

export type PluginMotionCaptureJob = {
  jobId: string;
  engineId: PluginMotionEngineId;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  phase: string;
  message: string;
  progress: number;
  completedFrames: number;
  totalFrames: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  parameterCompatibility?: 'full' | 'legacy-defaults';
};

export type PluginMotionLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type PluginMotionCaptureResult = {
  schemaVersion: 1;
  engineId: PluginMotionEngineId;
  model: string;
  skeleton: 'qiansi-soma-77' | 'qiansi-coco-wholebody-133';
  jointCount: 77 | 133;
  coordinateConvention?: 'qiansi-camera-relative-y-down-v1';
  landmarkConvention?: 'qiansi-screen-normalized-v1';
  landmarkLayout?: 'qiansi-mediapipe33-hands21-v1';
  sampleFps: number;
  frames: Array<{
    timestampMs: number;
    detected: boolean;
    confidence: number;
    people: Array<{
      trackId: number;
      confidence: number;
      landmarks: PluginMotionLandmark[];
      worldLandmarks: PluginMotionLandmark[];
    }>;
  }>;
};

type RequestOptions = { bridgeBase?: string; signal?: AbortSignal };

async function responseValue(response: Response, fallback: string) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { error?: { message?: unknown } }).error?.message
        : '';
    throw new Error(typeof message === 'string' && message ? message : fallback);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fallback}返回的数据格式无效。`);
  }
  return value as Record<string, unknown>;
}

function normalizeEngineId(value: unknown): PluginMotionEngineId {
  if (value !== 'gem-x' && value !== 'rtmw3d') throw new Error('AI 动作引擎无效。');
  return value;
}

function normalizeJob(
  value: Record<string, unknown>,
  expectedEngineId?: PluginMotionEngineId,
): PluginMotionCaptureJob {
  const jobId = String(value.jobId || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) {
    throw new Error('AI 动作任务 ID 无效。');
  }
  const status = String(value.status || '');
  if (!['queued', 'running', 'done', 'error', 'cancelled'].includes(status)) {
    throw new Error('AI 动作任务状态无效。');
  }
  const number = (item: unknown, minimum: number, maximum: number) => {
    const parsed = Number(item);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error('AI 动作任务进度无效。');
    }
    return parsed;
  };
  const engineId = normalizeEngineId(value.engineId);
  if (expectedEngineId && engineId !== expectedEngineId) {
    throw new Error('AI 动作任务与请求引擎不匹配。');
  }
  return {
    jobId,
    engineId,
    status: status as PluginMotionCaptureJob['status'],
    phase: String(value.phase || '').slice(0, 80),
    message: String(value.message || '').slice(0, 500),
    progress: number(value.progress, 0, 100),
    completedFrames: Math.floor(number(value.completedFrames, 0, 1350)),
    totalFrames: Math.floor(number(value.totalFrames, 0, 1350)),
    error: value.error == null ? null : String(value.error).slice(0, 800),
    startedAt: String(value.startedAt || '').slice(0, 80),
    updatedAt: String(value.updatedAt || '').slice(0, 80),
  };
}

function bridgeBase(options: RequestOptions) {
  return options.bridgeBase ?? BRIDGE_BASE_URL;
}

function captureStartQuery(
  pluginId: string,
  request: PluginMotionCaptureRequest,
  includeEngineParameters: boolean,
) {
  const query = new URLSearchParams({
    pluginId,
    engineId: request.engineId,
    durationSeconds: String(request.durationSeconds),
    width: String(request.width),
    height: String(request.height),
    sampleFps: String(request.sampleFps),
    maxPoses: String(request.maxPoses),
    confidenceThreshold: String(request.confidenceThreshold),
    smoothing: String(request.smoothing),
  });
  if (!includeEngineParameters) return query;
  if (request.engineId === 'gem-x') {
    query.set('staticCamera', String(request.staticCamera));
  } else {
    query.set('detectionThreshold', String(request.detectionThreshold));
    query.set('trackingMethod', request.trackingMethod);
    query.set('trackingThreshold', String(request.trackingThreshold));
  }
  return query;
}

function rejectedExtendedParameter(error: unknown) {
  return (
    error instanceof Error &&
    /未知参数：(staticCamera|detectionThreshold|trackingMethod|trackingThreshold)/.test(
      error.message,
    )
  );
}

async function postCaptureStart(
  pluginId: string,
  request: PluginMotionCaptureRequest,
  options: RequestOptions,
  includeEngineParameters: boolean,
) {
  const query = captureStartQuery(pluginId, request, includeEngineParameters);
  const response = await fetch(
    resolveBridgeUrl(`/plugins/vision/capture/start?${query}`, bridgeBase(options)),
    {
      method: 'POST',
      headers: {
        'Content-Type': request.mimeType,
        'X-Qiansi-Motion-File-Name': encodeURIComponent(request.fileName),
      },
      body: request.bytes,
      signal: options.signal,
    },
  );
  return normalizeJob(await responseValue(response, 'AI 动作任务启动失败。'), request.engineId);
}

export async function startPluginMotionCapture(
  pluginId: string,
  request: PluginMotionCaptureRequest,
  options: RequestOptions = {},
) {
  try {
    return {
      ...(await postCaptureStart(pluginId, request, options, true)),
      parameterCompatibility: 'full' as const,
    };
  } catch (error) {
    if (!rejectedExtendedParameter(error)) throw error;
    return {
      ...(await postCaptureStart(pluginId, request, options, false)),
      parameterCompatibility: 'legacy-defaults' as const,
    };
  }
}

async function motionJobRequest(
  path: '/status' | '/result' | '/cancel',
  pluginId: string,
  engineId: PluginMotionEngineId,
  jobId: string,
  options: RequestOptions,
) {
  const response = await fetch(
    resolveBridgeUrl(`/plugins/vision/capture${path}`, bridgeBase(options)),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId, engineId, jobId }),
      signal: options.signal,
    },
  );
  return responseValue(response, 'AI 动作任务请求失败。');
}

export async function readPluginMotionCaptureStatus(
  pluginId: string,
  engineId: PluginMotionEngineId,
  jobId: string,
  options: RequestOptions = {},
) {
  return normalizeJob(
    await motionJobRequest('/status', pluginId, engineId, jobId, options),
    engineId,
  );
}

export async function cancelPluginMotionCapture(
  pluginId: string,
  engineId: PluginMotionEngineId,
  jobId: string,
  options: RequestOptions = {},
) {
  return normalizeJob(
    await motionJobRequest('/cancel', pluginId, engineId, jobId, options),
    engineId,
  );
}

function validateResultLandmarks(value: unknown, jointCount: number) {
  if (!Array.isArray(value) || value.length !== jointCount) {
    throw new Error(`AI 动作结果必须包含 ${jointCount} 个关节点。`);
  }
  for (const point of value) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      throw new Error('AI 动作结果包含无效关节点。');
    }
    const landmark = point as Record<string, unknown>;
    const coordinates = [landmark.x, landmark.y, landmark.z].map(Number);
    const visibility = Number(landmark.visibility);
    if (
      coordinates.some(
        (coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 100,
      ) ||
      !Number.isFinite(visibility) ||
      visibility < 0 ||
      visibility > 1
    ) {
      throw new Error('AI 动作结果包含越界关节点。');
    }
  }
}

function normalizeResult(
  value: Record<string, unknown>,
  expectedEngineId: PluginMotionEngineId,
): PluginMotionCaptureResult {
  const engineId = normalizeEngineId(value.engineId);
  if (engineId !== expectedEngineId) throw new Error('AI 动作结果与请求引擎不匹配。');
  const expected =
    engineId === 'gem-x'
      ? { jointCount: 77, skeleton: 'qiansi-soma-77', maximumPoses: 1 }
      : { jointCount: 133, skeleton: 'qiansi-coco-wholebody-133', maximumPoses: 4 };
  if (value.schemaVersion !== 1 || value.jointCount !== expected.jointCount) {
    throw new Error('AI 动作结果版本或关节点数量无效。');
  }
  if (value.skeleton !== expected.skeleton) throw new Error('AI 动作结果骨架类型无效。');
  if (
    engineId === 'rtmw3d' &&
    value.coordinateConvention !== undefined &&
    value.coordinateConvention !== 'qiansi-camera-relative-y-down-v1'
  ) {
    throw new Error('AI 动作结果坐标约定无效。');
  }
  if (
    engineId === 'rtmw3d' &&
    value.landmarkConvention !== undefined &&
    value.landmarkConvention !== 'qiansi-screen-normalized-v1'
  ) {
    throw new Error('AI 动作结果画面坐标约定无效。');
  }
  if (
    engineId === 'rtmw3d' &&
    value.landmarkLayout !== undefined &&
    value.landmarkLayout !== 'qiansi-mediapipe33-hands21-v1'
  ) {
    throw new Error('AI 动作结果关节点布局无效。');
  }
  const sampleFps = Number(value.sampleFps);
  if (!Number.isFinite(sampleFps) || sampleFps < 1 || sampleFps > 120) {
    throw new Error('AI 动作结果采样率无效。');
  }
  if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 1350) {
    throw new Error('AI 动作结果帧数无效。');
  }
  let previousTimestamp = -1;
  for (const frame of value.frames) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new Error('AI 动作结果包含无效帧。');
    }
    const item = frame as Record<string, unknown>;
    const timestampMs = Number(item.timestampMs);
    const confidence = Number(item.confidence);
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs < previousTimestamp ||
      timestampMs > 91_000 ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      !Array.isArray(item.people) ||
      item.people.length > expected.maximumPoses
    ) {
      throw new Error('AI 动作结果帧内容无效。');
    }
    previousTimestamp = timestampMs;
    const trackIds = new Set<number>();
    for (const person of item.people) {
      if (!person || typeof person !== 'object' || Array.isArray(person)) {
        throw new Error('AI 动作结果包含无效人物。');
      }
      const pose = person as Record<string, unknown>;
      const trackId = Number(pose.trackId);
      const poseConfidence = Number(pose.confidence);
      if (
        !Number.isInteger(trackId) ||
        trackId < 1 ||
        trackId > 10_000 ||
        trackIds.has(trackId) ||
        !Number.isFinite(poseConfidence) ||
        poseConfidence < 0 ||
        poseConfidence > 1
      ) {
        throw new Error('AI 动作结果人物轨迹无效。');
      }
      trackIds.add(trackId);
      validateResultLandmarks(pose.landmarks, expected.jointCount);
      validateResultLandmarks(pose.worldLandmarks, expected.jointCount);
    }
  }
  return value as unknown as PluginMotionCaptureResult;
}

export async function readPluginMotionCaptureResult(
  pluginId: string,
  engineId: PluginMotionEngineId,
  jobId: string,
  options: RequestOptions = {},
) {
  return normalizeResult(
    await motionJobRequest('/result', pluginId, engineId, jobId, options),
    engineId,
  );
}
