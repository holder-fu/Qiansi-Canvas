import { resolveBridgeUrl } from '../lib/bridgeUrl';
import type { DepthEstimationPipelineType } from '@huggingface/transformers';

export const PLUGIN_DEPTH_MODEL_ID = 'depth-anything-v2-small' as const;
export const PLUGIN_SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b' as const;
export const PLUGIN_DEPTH_RUNTIME_ASSET_REVISION = 'mime-v2' as const;
export type PluginDepthInferenceBackend = 'webgpu' | 'wasm';
export type PluginDepthGpuPowerPreference = 'high-performance' | 'low-power';

export type PluginDepthFrameRequest = {
  modelId: typeof PLUGIN_DEPTH_MODEL_ID | typeof PLUGIN_SAPIENS_NORMAL_MODEL_ID;
  bytes: ArrayBuffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  timestampMs: number;
  width: number;
  height: number;
  backend: PluginDepthInferenceBackend;
  inputSize: 392 | 518 | 686;
  wasmThreads: 0 | 1 | 2 | 4 | 8;
  gpuPowerPreference: PluginDepthGpuPowerPreference;
  temporalSmoothing: number;
  invert: boolean;
  blackPoint: number;
  whitePoint: number;
  gamma: number;
};

export type PluginDepthFrameResult = {
  bytes: ArrayBuffer;
  mimeType: 'image/webp';
  timestampMs: number;
  width: number;
  height: number;
  inferenceMs: number;
};

const estimatorPromises = new Map<string, Promise<DepthEstimationPipelineType>>();
const previousDepthFrames = new Map<
  string,
  { timestampMs: number; width: number; height: number; values: Float32Array }
>();
let inferenceTail = Promise.resolve();

type CreateDepthPipeline = (
  task: 'depth-estimation',
  model: string,
  options: Record<string, unknown>,
) => Promise<DepthEstimationPipelineType>;

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

type OnnxRuntimeEnvironment = {
  wasm?: {
    numThreads?: number;
    wasmPaths?: unknown;
  };
  webgpu?: {
    powerPreference?: PluginDepthGpuPowerPreference;
  };
};

type DepthPipelineWithProcessor = DepthEstimationPipelineType & {
  processor?: {
    image_processor?: {
      size?: { width: number; height: number };
    };
  };
};

/**
 * Changes the request URL after the Bridge MIME fix so browsers cannot reuse
 * the earlier year-long immutable application/octet-stream response.
 */
export function versionDepthRuntimeAssetUrl(resourceUrl: string) {
  const url = new URL(resourceUrl);
  url.searchParams.set('qiansi-depth-runtime', PLUGIN_DEPTH_RUNTIME_ASSET_REVISION);
  return url.href;
}

export function configureDepthRuntimeEnvironment(
  onnxEnvironment: OnnxRuntimeEnvironment,
  request: Pick<PluginDepthFrameRequest, 'backend' | 'wasmThreads' | 'gpuPowerPreference'>,
) {
  if (request.backend === 'wasm' && onnxEnvironment.wasm) {
    onnxEnvironment.wasm.numThreads = request.wasmThreads;
  }
  if (request.backend === 'webgpu' && onnxEnvironment.webgpu) {
    onnxEnvironment.webgpu.powerPreference = request.gpuPowerPreference;
  }
}

export function configureDepthProcessorInputSize(
  estimator: DepthEstimationPipelineType,
  inputSize: PluginDepthFrameRequest['inputSize'],
) {
  const processor = (estimator as DepthPipelineWithProcessor).processor?.image_processor;
  if (!processor) throw new Error('Depth Anything 图像预处理器不可用。');
  processor.size = { width: inputSize, height: inputSize };
}

export function smoothDepthValues(
  source: ArrayLike<number>,
  previous: ArrayLike<number> | null,
  temporalSmoothing: number,
) {
  const strength = clampUnit(temporalSmoothing);
  const values = new Float32Array(source.length);
  const canBlend = previous?.length === source.length && strength > 0;
  for (let index = 0; index < source.length; index += 1) {
    const current = Number(source[index] ?? 0);
    values[index] = canBlend
      ? current * (1 - strength) + Number(previous[index] ?? current) * strength
      : current;
  }
  return values;
}

/** Applies deterministic black/white points and gamma to one normalized grayscale depth frame. */
export function renderWhiteDepthPixels(
  source: ArrayLike<number>,
  options: Pick<PluginDepthFrameRequest, 'invert' | 'blackPoint' | 'whitePoint' | 'gamma'>,
) {
  const output = new Uint8ClampedArray(source.length * 4);
  const span = Math.max(0.01, options.whitePoint - options.blackPoint);
  const exponent = 1 / Math.max(0.1, options.gamma);
  for (let index = 0; index < source.length; index += 1) {
    const normalized = clampUnit((Number(source[index] ?? 0) / 255 - options.blackPoint) / span);
    const directed = options.invert ? 1 - normalized : normalized;
    const value = Math.round(Math.pow(directed, exponent) * 255);
    const offset = index * 4;
    output[offset] = value;
    output[offset + 1] = value;
    output[offset + 2] = value;
    output[offset + 3] = 255;
  }
  return output;
}

export function createDepthPipelineForBackend(
  createDepthPipeline: CreateDepthPipeline,
  backend: PluginDepthInferenceBackend,
) {
  return createDepthPipeline('depth-estimation', PLUGIN_DEPTH_MODEL_ID, {
    device: backend,
    dtype: 'q8',
    local_files_only: true,
  });
}

const depthEstimatorKey = (request: PluginDepthFrameRequest) =>
  request.backend === 'wasm'
    ? `wasm:${request.wasmThreads}`
    : `webgpu:${request.gpuPowerPreference}`;

async function getDepthEstimator(request: PluginDepthFrameRequest) {
  const { backend } = request;
  if (backend === 'webgpu' && (typeof navigator === 'undefined' || !('gpu' in navigator))) {
    throw new Error('当前浏览器没有可用的 WebGPU，请在右侧将推理设备切换为 CPU WASM。');
  }
  const estimatorKey = depthEstimatorKey(request);
  if (!estimatorPromises.has(estimatorKey)) {
    const promise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      const modelRoot = resolveBridgeUrl('/plugins/vision/models/files/');
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = modelRoot.endsWith('/') ? modelRoot : `${modelRoot}/`;
      env.useBrowserCache = false;
      const wasmBackend = env.backends.onnx.wasm;
      if (!wasmBackend) throw new Error('当前浏览器没有可用的 ONNX WASM 后端。');
      configureDepthRuntimeEnvironment(env.backends.onnx as OnnxRuntimeEnvironment, request);
      wasmBackend.wasmPaths = {
        mjs: versionDepthRuntimeAssetUrl(
          new URL(
            '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs',
            import.meta.url,
          ).href,
        ),
        wasm: versionDepthRuntimeAssetUrl(
          new URL(
            '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm',
            import.meta.url,
          ).href,
        ),
      };
      return createDepthPipelineForBackend(pipeline as unknown as CreateDepthPipeline, backend);
    })();
    estimatorPromises.set(estimatorKey, promise);
  }
  const pending = estimatorPromises.get(estimatorKey);
  if (!pending) throw new Error('白模推理管线初始化失败。');
  try {
    return await pending;
  } catch (error) {
    if (estimatorPromises.get(estimatorKey) === pending) estimatorPromises.delete(estimatorKey);
    if (backend === 'webgpu') {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`WebGPU 初始化失败，请在右侧将推理设备切换为 CPU WASM。${detail}`);
    }
    throw error;
  }
}

async function canvasWebp(canvas: OffscreenCanvas | HTMLCanvasElement) {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob: Blob | null) => (blob ? resolve(blob) : reject(new Error('白模帧编码失败。'))),
      'image/webp',
      0.92,
    );
  });
}

async function inferPluginDepthFrame(
  request: PluginDepthFrameRequest,
  sessionId: string,
): Promise<PluginDepthFrameResult> {
  const startedAt = performance.now();
  const estimator = await getDepthEstimator(request);
  configureDepthProcessorInputSize(estimator, request.inputSize);
  const input = new Blob([request.bytes], { type: request.mimeType });
  const rawResult = await estimator(input);
  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
  if (!result?.depth || result.depth.channels !== 1) {
    throw new Error('Depth Anything 没有返回有效的单通道深度图。');
  }
  const width = result.depth.width;
  const height = result.depth.height;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建白模帧画布。');
  const previous = previousDepthFrames.get(sessionId);
  const canContinueSequence = Boolean(
    previous &&
    previous.width === width &&
    previous.height === height &&
    request.timestampMs > previous.timestampMs,
  );
  const smoothed = smoothDepthValues(
    result.depth.data,
    canContinueSequence ? (previous?.values ?? null) : null,
    request.temporalSmoothing,
  );
  if (request.temporalSmoothing > 0) {
    previousDepthFrames.set(sessionId, {
      timestampMs: request.timestampMs,
      width,
      height,
      values: smoothed,
    });
  } else {
    previousDepthFrames.delete(sessionId);
  }
  const pixels = renderWhiteDepthPixels(smoothed, request);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvasWebp(canvas);
  return {
    bytes: await blob.arrayBuffer(),
    mimeType: 'image/webp',
    timestampMs: request.timestampMs,
    width,
    height,
    inferenceMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

export function clearPluginDepthSession(sessionId: string) {
  previousDepthFrames.delete(sessionId);
}

/** Serializes model execution because the shared ONNX session is not re-entrant. */
export function renderPluginDepthFrame(request: PluginDepthFrameRequest, sessionId = 'default') {
  const run = inferenceTail.then(() => inferPluginDepthFrame(request, sessionId));
  inferenceTail = run.then(
    () => {},
    () => {},
  );
  return run;
}
