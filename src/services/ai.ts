import type { NodeKind } from '../canvas/nodeTypes';
import {
  mergeVideoAiImageReferences,
  requireOriginalAiImageReference,
  requireOriginalAiImageReferences,
} from '../lib/aiImageReferencePolicy';
import { BRIDGE_BASE_URL, resolveBridgeUrl } from '../lib/bridgeUrl';
import { buildImagePrompt, resolveImageSize } from '../lib/imageGeneration';
import {
  buildTextTaskInstruction,
  buildTextTaskPrompt,
  DEFAULT_TEXT_TASK_MODE,
  normalizeTextMaxLength,
} from '../lib/textGeneration';

/**
 * AI 调用层（复刻旧版节点的 AI 模型使用）。
 * 全部走当前页面同源或显式配置的 local-bridge：前端把已解密的密钥与
 * provider 配置随请求传入，桥作为代理去调用上游 OpenAI 兼容 / 火山引擎 /
 * ModelScope / xAI 等接口。桥的 AI 路由仅允许主机回环访问；局域网终端只参与项目与媒体协作，
 * 不会把主机密钥带到明文 HTTP 网络。
 */

export interface GenProvider {
  /** Stable registry id used by the bridge to select the provider's real API contract. */
  providerId?: string;
  protocol: string;
  baseUrl: string;
  endpoint?: string;
  authType?: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  /** Used by the canvas to reject an explicitly unsupported multimodal request. */
  inputModalities?: Array<'text' | 'image'>;
  /** True only for explicit source-video reference support; false or missing requires fallback. */
  videoReferenceInput?: boolean;
  /** Workflow-advertised video modes used to select a compatible reference strategy. */
  videoModes?: Array<'文生视频' | '全能参考' | '图生视频' | '首尾帧' | '图片参考' | '视频换人物'>;
  /** Source-video operations explicitly implemented by this exact model/adapter. */
  videoOperations?: Array<
    | 'remake'
    | 'enhance'
    | 'extend'
    | 'remove-subtitles'
    | 'visual-edit'
    | 'character-replace'
    | 'masked-repair'
  >;
  cliConfig?: {
    executablePath?: string;
    workingDirectory?: string;
    imageModelPath?: string;
    imageModelClass?: string;
    imageTask?: string;
    imageConfigPath?: string;
    videoModelPath?: string;
    videoModelClass?: string;
    videoTask?: string;
    videoConfigPath?: string;
  };
}

export interface GenerateImageArgs {
  provider: GenProvider;
  prompt: string;
  /** Stable token used to recover a completed local-bridge image after a dropped response. */
  requestId?: string;
  referenceImages?: string[];
  count?: number;
  size?: string;
  imageType?: string;
  aspectRatio?: string;
  quality?: string;
  onProgress?: (p: number) => void;
}

export interface GenerateVideoArgs {
  provider: GenProvider;
  prompt: string;
  /** Stable token used by the bridge to deduplicate and recover this paid request. */
  requestId?: string;
  referenceImages?: string[];
  /**
   * Explicit video-effect poster / extracted-frame compatibility input.
   * Renderer previews are forbidden in ordinary referenceImages.
   */
  videoPosterFallbackImages?: string[];
  /** Source video used by video-edit operations such as remake and continuation. */
  sourceVideo?: string;
  /** Original source duration used to validate duration-aware remake intervals. */
  sourceVideoDuration?: number;
  /** Source-video intervals that an editing-capable model must regenerate. */
  remakeSegments?: Array<{ start: number; end: number }>;
  /** Continue from the source video's final frame instead of creating an unrelated clip. */
  continueVideo?: boolean;
  /** Explicit source-video edit operation; never degrade it into ordinary text-to-video. */
  videoEditOperation?: 'remove-subtitles' | 'visual-edit' | 'masked-repair';
  /** Spatial hint used only by subtitle-removal video editing. */
  subtitleRegion?: 'auto' | 'bottom' | 'top';
  /** Target character reference image used by the fused character-replacement mode. */
  characterReferenceImage?: string;
  /** Lossless mask image used by character replacement or masked video repair. */
  maskImage?: string;
  /** Inclusive start of the problem interval for masked video repair, in seconds. */
  maskRangeStart?: number;
  /** Inclusive end of the problem interval for masked video repair, in seconds. */
  maskRangeEnd?: number;
  /** Source-video timestamp represented by maskImage, in seconds. */
  keyframeTime?: number;
  /** Temporal mask propagation is performed only by a compatible provider. */
  tracking?: 'provider';
  referenceAudios?: string[];
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  count?: number;
  mode?: string;
  fps?: number;
  onProgress?: (p: number) => void;
}

export type VideoAudioTrackStatus = 'present' | 'absent' | 'unverified';

export interface GenerateAudioArgs {
  provider: GenProvider;
  prompt: string;
  /** Stable token used by the bridge to deduplicate and recover this paid request. */
  requestId?: string;
  duration?: number;
  count?: number;
  mode?: string;
  referenceAudio?: string;
  onProgress?: (p: number) => void;
}

export interface Generate3dArgs {
  provider: GenProvider;
  prompt: string;
  requestId?: string;
  referenceImages?: string[];
  onProgress?: (p: number) => void;
}

export interface ChatArgs {
  provider: GenProvider;
  /** Stable token used to reconnect a text request after the initiating UI changes. */
  requestId?: string;
  messages?: ChatMessage[];
  prompt?: string;
  referenceImages?: string[];
  temperature?: number;
  mode?: string;
  maxLength?: number;
  referenceImageDetail?: 'auto' | 'low' | 'high';
  reasoningEffort?: string;
  onProgress?: (p: number) => void;
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type ChatMessage = { role: string; content: string | ChatContentPart[] };

const ESTIMATED_PROGRESS_START = 8;
const ESTIMATED_PROGRESS_LIMIT = 92;
const ESTIMATED_PROGRESS_INTERVAL_MS = 1000;
const IMAGE_PROGRESS_TIME_MS = 45_000;
const VIDEO_PROGRESS_TIME_MS = 120_000;
const AUDIO_PROGRESS_TIME_MS = 90_000;
const MODEL_3D_PROGRESS_TIME_MS = 180_000;
const CHAT_PROGRESS_TIME_MS = 20_000;

/**
 * Most provider endpoints return one blocking response and expose no progress
 * events. Keep the UI moving with a bounded estimate, reserving 100% for a
 * successfully validated result.
 */
async function withEstimatedProgress<T>(
  onProgress: ((progress: number) => void) | undefined,
  task: () => Promise<T>,
  estimatedDurationMs: number,
): Promise<T> {
  let progress = ESTIMATED_PROGRESS_START;
  const startedAt = Date.now();
  onProgress?.(progress);
  const timer = onProgress
    ? setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const estimated = Math.min(
          ESTIMATED_PROGRESS_LIMIT,
          ESTIMATED_PROGRESS_START +
            Math.floor(
              (ESTIMATED_PROGRESS_LIMIT - ESTIMATED_PROGRESS_START) *
                (1 - Math.exp(-elapsed / estimatedDurationMs)),
            ),
        );
        if (estimated <= progress) return;
        progress = estimated;
        onProgress(progress);
      }, ESTIMATED_PROGRESS_INTERVAL_MS)
    : undefined;

  try {
    const result = await task();
    onProgress?.(100);
    return result;
  } finally {
    if (timer) clearInterval(timer);
  }
}

function prepareChatInput(args: ChatArgs): { messages?: ChatMessage[]; prompt?: string } {
  const taskInstruction = buildTextTaskInstruction(args.mode, args.maxLength);
  const suppliedMessages = args.messages?.length
    ? taskInstruction
      ? [{ role: 'system', content: taskInstruction }, ...args.messages]
      : [...args.messages]
    : undefined;
  const references = args.referenceImages ?? [];

  if (references.length) {
    const referencePrompt = suppliedMessages
      ? args.prompt?.trim() || '请结合以下全部参考图片完成上述任务。'
      : buildTextTaskPrompt(args.prompt ?? '', args.mode, args.maxLength);
    return {
      messages: [
        ...(suppliedMessages ?? []),
        {
          role: 'user',
          content: [
            { type: 'text', text: referencePrompt },
            ...references.map((url): ChatContentPart => ({
              type: 'image_url',
              image_url: { url, detail: args.referenceImageDetail ?? 'auto' },
            })),
          ],
        },
      ],
    };
  }

  if (suppliedMessages) return { messages: suppliedMessages };
  return { prompt: buildTextTaskPrompt(args.prompt ?? '', args.mode, args.maxLength) };
}

function responseErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined;
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveBridgeUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    if (res.ok) {
      throw new GenerationTransportInterruptedError(
        `本机画布桥的成功响应未完整传回：${error instanceof Error ? error.message : '响应体读取中断'}`,
      );
    }
    json = {};
  }
  if (!res.ok) {
    throw new Error(responseErrorMessage(json) || `请求失败（HTTP ${res.status}）`);
  }
  return json as T;
}

type BridgeAssetList = {
  items?: Array<{
    url?: unknown;
    tags?: unknown;
    mime?: unknown;
    description?: unknown;
    createdAt?: unknown;
  }>;
};

type BridgeGenerationRecovery = {
  request?: {
    id?: unknown;
    kind?: unknown;
    status?: unknown;
    result?: unknown;
    error?: unknown;
    progress?: unknown;
    phase?: unknown;
    nodeId?: unknown;
    queueRemaining?: unknown;
  };
};

export type GenerationRequestLookup =
  | { status: 'complete'; result: unknown }
  | {
      status: 'pending';
      progress?: number;
      phase?: string;
      nodeId?: string;
      queueRemaining?: number;
    }
  | { status: 'failed'; error: string }
  | { status: 'missing' };

export type GenerationRecoveryRequiredStatus = 'pending' | 'missing' | 'unreachable';
export type GenerationRequestKind = 'image' | 'video' | 'audio' | '3d' | 'text';

export class GenerationRecoveryRequiredError extends Error {
  readonly generationRequestInterrupted = true;
  readonly requestId: string;
  readonly kind: GenerationRequestKind;
  readonly status: GenerationRecoveryRequiredStatus;

  constructor(
    requestId: string,
    kind: GenerationRequestKind,
    status: GenerationRecoveryRequiredStatus,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationRecoveryRequiredError';
    this.requestId = requestId;
    this.kind = kind;
    this.status = status;
  }
}

class GenerationTransportInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationTransportInterruptedError';
  }
}

function isFetchConnectionError(error: unknown): boolean {
  return (
    error instanceof GenerationTransportInterruptedError ||
    error instanceof TypeError ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      ['AbortError', 'NetworkError', 'TimeoutError'].includes(error.name)) ||
    (error instanceof Error &&
      /failed to fetch|networkerror|load failed|fetch failed|request (?:was )?aborted|response.*(?:interrupted|terminated)/i.test(
        error.message,
      ))
  );
}

function generationRequestId(value: string | undefined): string {
  if (value && /^[A-Za-z0-9][A-Za-z0-9_-]{5,119}$/.test(value)) return value;
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `gen-${randomPart}`;
}

/**
 * Query one existing bridge request without submitting it again.
 *
 * This deliberately performs one GET so a user-initiated recovery check can
 * distinguish a still-running request from a terminal failure or a registry
 * miss. The caller owns any retry/backoff policy.
 */
export async function lookupGenerationRequestByRequestId(
  requestId: string,
  expectedKind: GenerationRequestKind,
  options: { signal?: AbortSignal } = {},
): Promise<GenerationRequestLookup> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,119}$/.test(requestId)) {
    throw new Error('生成请求编号无效，已拒绝查询。');
  }
  const response = await fetch(
    resolveBridgeUrl(`/api/generation-requests/${encodeURIComponent(requestId)}`),
    { cache: 'no-store', ...(options.signal ? { signal: options.signal } : {}) },
  );
  if (response.status === 404) return { status: 'missing' };
  const payload = (await response.json().catch(() => ({}))) as BridgeGenerationRecovery;
  if (response.status === 410) return { status: 'missing' };
  if (!response.ok) {
    throw new Error(responseErrorMessage(payload) || `生成请求查询失败（HTTP ${response.status}）`);
  }
  const entry = payload.request;
  if (!entry || entry.kind !== expectedKind) {
    throw new Error('生成请求恢复结果类型不匹配，已拒绝错误回填。');
  }
  if (entry.status === 'complete') return { status: 'complete', result: entry.result };
  if (entry.status === 'pending') {
    return {
      status: 'pending',
      ...(typeof entry.progress === 'number' && Number.isFinite(entry.progress)
        ? { progress: Math.max(0, Math.min(100, Math.round(entry.progress))) }
        : {}),
      ...(typeof entry.phase === 'string' && entry.phase.trim()
        ? { phase: entry.phase.trim().slice(0, 80) }
        : {}),
      ...(typeof entry.nodeId === 'string' && entry.nodeId
        ? { nodeId: entry.nodeId.slice(0, 160) }
        : {}),
      ...(typeof entry.queueRemaining === 'number' &&
      Number.isSafeInteger(entry.queueRemaining) &&
      entry.queueRemaining >= 0
        ? { queueRemaining: entry.queueRemaining }
        : {}),
    };
  }
  if (entry.status === 'failed') {
    return {
      status: 'failed',
      error:
        typeof entry.error === 'string' && entry.error.trim()
          ? entry.error
          : '生成请求已失败，不会使用同一 requestId 重复提交。',
    };
  }
  throw new Error('本机生成请求返回了无法识别的状态。');
}

export async function recoverGenerationResultByRequestId(
  requestId: string,
  expectedKind: GenerationRequestKind,
): Promise<unknown> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,119}$/.test(requestId)) {
    throw new GenerationRecoveryRequiredError(
      requestId,
      expectedKind,
      'missing',
      '生成请求编号无效，无法安全恢复；不会自动重新提交。',
    );
  }
  const delays = [0, 400, 1_200, 2_400];
  let sawPending = false;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    let lookup: GenerationRequestLookup;
    try {
      lookup = await lookupGenerationRequestByRequestId(requestId, expectedKind);
    } catch (error) {
      if (isFetchConnectionError(error)) continue;
      // Authorization or malformed recovery responses are not authoritative,
      // so retain the original request ID instead of enabling a paid resubmit.
      if (!(error instanceof GenerationRecoveryRequiredError)) {
        throw new GenerationRecoveryRequiredError(
          requestId,
          expectedKind,
          'unreachable',
          `无法确认原生成请求状态：${error instanceof Error ? error.message : '恢复接口不可用'}。不会自动重新提交。`,
        );
      }
      throw error;
    }
    if (lookup.status === 'missing') {
      throw new GenerationRecoveryRequiredError(
        requestId,
        expectedKind,
        'missing',
        '本机未找到可恢复输出或输出已删除；为避免重复计费，不会自动重新提交。',
      );
    }
    if (lookup.status === 'complete') return lookup.result;
    if (lookup.status === 'failed') throw new Error(lookup.error);
    sawPending = true;
  }
  throw new GenerationRecoveryRequiredError(
    requestId,
    expectedKind,
    sawPending ? 'pending' : 'unreachable',
    sawPending
      ? '原生成请求仍可能在本机后台执行；请稍后检查结果，不要重新提交。'
      : '无法连接本机恢复接口确认原生成结果；请恢复画布桥后查询，不要重新提交。',
  );
}

export async function recoverGeneratedImageByRequestId(
  requestId: string,
): Promise<string | undefined> {
  const tag = `gen:${requestId}`;
  const delays = [0, 400, 1_200, 2_400];
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(resolveBridgeUrl('/asset-library'), { cache: 'no-store' });
      if (!response.ok) continue;
      const payload = (await response.json()) as BridgeAssetList;
      const item = payload.items?.find(
        (candidate) => Array.isArray(candidate.tags) && candidate.tags.includes(tag),
      );
      if (typeof item?.url === 'string' && item.url.trim()) {
        return resolveBridgeMediaUrl(item.url);
      }
    } catch {
      // The bridge may still be restarting. The next bounded attempt can recover the saved asset.
    }
  }
  return undefined;
}

/** Find a recently saved CLI image when an older request completed but its HTTP response was lost. */
export async function recoverRecentGeneratedImage(prompt: string): Promise<string | undefined> {
  const needle = prompt.replace(/\s+/g, ' ').trim();
  if (needle.length < 12) return undefined;
  const response = await fetch(resolveBridgeUrl('/asset-library'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`本机素材库读取失败（HTTP ${response.status}）。`);
  const payload = (await response.json()) as BridgeAssetList;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const item = payload.items?.find((candidate) => {
    const description =
      typeof candidate.description === 'string'
        ? candidate.description.replace(/\s+/g, ' ').trim()
        : '';
    return (
      typeof candidate.url === 'string' &&
      typeof candidate.mime === 'string' &&
      candidate.mime.startsWith('image/') &&
      Number(candidate.createdAt) >= cutoff &&
      description.includes(needle)
    );
  });
  return typeof item?.url === 'string' && item.url.trim()
    ? resolveBridgeMediaUrl(item.url)
    : undefined;
}

function resolveBridgeMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    // HTTP(S) passes through the resolver so legacy loopback media remains usable over LAN.
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? resolveBridgeUrl(trimmed, BRIDGE_BASE_URL)
      : trimmed;
  } catch {
    return resolveBridgeUrl(trimmed, BRIDGE_BASE_URL);
  }
}

function requireCompletedImageResult(value: unknown): { images: string[]; url?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('上游未返回可用的图片结果。');
  }
  const result = value as Record<string, unknown>;
  const images = Array.isArray(result.images)
    ? result.images
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(resolveBridgeMediaUrl)
    : [];
  if (!images.length) throw new Error('上游未返回可用的图片结果。');
  return {
    images,
    ...(typeof result.url === 'string' && result.url.trim()
      ? { url: resolveBridgeMediaUrl(result.url) }
      : {}),
  };
}

function requireCompletedMediaResult(
  value: unknown,
  collectionKey: 'videos' | 'audios' | 'models3d',
  mediaLabel: '视频' | '音频' | '3D 模型',
): { items: string[]; url?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`上游未返回可用的${mediaLabel}结果。`);
  }
  const result = value as Record<string, unknown>;
  const taskId =
    typeof result.taskId === 'string' || typeof result.taskId === 'number'
      ? String(result.taskId)
      : '';
  if (result.async === true || taskId) {
    const taskHint = taskId ? `（任务 ID：${taskId}）` : '';
    throw new Error(
      `上游返回异步${mediaLabel}任务${taskHint}，但该 Provider 未配置任务查询接口，无法取得最终文件。`,
    );
  }
  const items = Array.isArray(result[collectionKey])
    ? result[collectionKey]
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(resolveBridgeMediaUrl)
    : [];
  if (!items.length) throw new Error(`上游未返回可用的${mediaLabel}结果。`);
  return {
    items,
    ...(typeof result.url === 'string' && result.url.trim()
      ? { url: resolveBridgeMediaUrl(result.url) }
      : {}),
  };
}

function requireCompletedTextResult(value: unknown): { text: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('文本模型没有返回有效内容，请重试或更换文本模型。');
  }
  const text = (value as Record<string, unknown>).text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('文本模型没有返回有效内容，请重试或更换文本模型。');
  }
  return { text };
}

export async function generateImage(
  args: GenerateImageArgs,
): Promise<{ images: string[]; url?: string }> {
  const referenceImages = requireOriginalAiImageReferences(args.referenceImages);
  const requestId = generationRequestId(args.requestId);
  return withEstimatedProgress(
    args.onProgress,
    async () => {
      let result: { images: string[]; url?: string };
      try {
        result = await postJson<{ images: string[]; url?: string }>('/api/generate-image', {
          provider: args.provider,
          prompt: args.prompt,
          requestId,
          referenceImages,
          count: args.count ?? 1,
          size: args.size ?? '1024x1024',
          imageType: args.imageType,
          aspectRatio: args.aspectRatio,
          quality: args.quality,
        });
      } catch (error) {
        if (isFetchConnectionError(error)) {
          try {
            return requireCompletedImageResult(
              await recoverGenerationResultByRequestId(requestId, 'image'),
            );
          } catch (recoveryError) {
            if (
              recoveryError instanceof GenerationRecoveryRequiredError &&
              recoveryError.status === 'missing'
            ) {
              const recoveredUrl = await recoverGeneratedImageByRequestId(requestId);
              if (recoveredUrl) return { images: [recoveredUrl], url: recoveredUrl };
            }
            throw recoveryError;
          }
        }
        throw error;
      }
      return requireCompletedImageResult(result);
    },
    IMAGE_PROGRESS_TIME_MS,
  );
}

export async function generateVideo(
  args: GenerateVideoArgs,
): Promise<{ videos: string[]; url?: string; audioTrackStatus: VideoAudioTrackStatus }> {
  const referenceImages = mergeVideoAiImageReferences(
    args.referenceImages,
    args.videoPosterFallbackImages,
  );
  const characterReferenceImage = requireOriginalAiImageReference(
    args.characterReferenceImage,
    '目标人物参考图',
  );
  const maskImage = requireOriginalAiImageReference(args.maskImage, '局部修复蒙版');
  const requestId = generationRequestId(args.requestId);
  return withEstimatedProgress(
    args.onProgress,
    async () => {
      let result: unknown;
      try {
        result = await postJson<unknown>('/api/generate-video', {
          provider: args.provider,
          prompt: args.prompt,
          requestId,
          referenceImages,
          ...(args.sourceVideo ? { sourceVideo: args.sourceVideo } : {}),
          ...(Number.isFinite(args.sourceVideoDuration)
            ? { sourceVideoDuration: args.sourceVideoDuration }
            : {}),
          ...(args.remakeSegments?.length ? { remakeSegments: args.remakeSegments } : {}),
          ...(args.continueVideo ? { continueVideo: true } : {}),
          ...(args.videoEditOperation ? { videoEditOperation: args.videoEditOperation } : {}),
          ...(args.subtitleRegion ? { subtitleRegion: args.subtitleRegion } : {}),
          ...(characterReferenceImage ? { characterReferenceImage } : {}),
          ...(maskImage ? { maskImage } : {}),
          ...(Number.isFinite(args.maskRangeStart) ? { maskRangeStart: args.maskRangeStart } : {}),
          ...(Number.isFinite(args.maskRangeEnd) ? { maskRangeEnd: args.maskRangeEnd } : {}),
          ...(Number.isFinite(args.keyframeTime) ? { keyframeTime: args.keyframeTime } : {}),
          ...(args.tracking ? { tracking: args.tracking } : {}),
          referenceAudios: args.referenceAudios ?? [],
          duration: args.duration ?? 5,
          aspectRatio: args.aspectRatio ?? '16:9',
          resolution: args.resolution ?? '720P',
          audio: args.audio ?? false,
          count: args.count ?? 1,
          mode: args.mode,
          fps: args.fps,
        });
      } catch (error) {
        if (isFetchConnectionError(error)) {
          result = await recoverGenerationResultByRequestId(requestId, 'video');
        } else {
          throw error;
        }
      }
      const completed = requireCompletedMediaResult(result, 'videos', '视频');
      const audioTrackStatus =
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        ['present', 'absent', 'unverified'].includes(
          String((result as Record<string, unknown>).audioTrackStatus || ''),
        )
          ? ((result as Record<string, unknown>).audioTrackStatus as VideoAudioTrackStatus)
          : 'unverified';
      return { videos: completed.items, url: completed.url, audioTrackStatus };
    },
    VIDEO_PROGRESS_TIME_MS,
  );
}

export async function generateAudio(
  args: GenerateAudioArgs,
): Promise<{ audios: string[]; url?: string }> {
  const requestId = generationRequestId(args.requestId);
  return withEstimatedProgress(
    args.onProgress,
    async () => {
      let result: unknown;
      try {
        result = await postJson<unknown>('/api/generate-audio', {
          provider: args.provider,
          prompt: args.prompt,
          requestId,
          duration: args.duration ?? 30,
          count: args.count ?? 1,
          mode: args.mode ?? '描述生音乐',
          referenceAudio: args.referenceAudio,
        });
      } catch (error) {
        if (isFetchConnectionError(error)) {
          result = await recoverGenerationResultByRequestId(requestId, 'audio');
        } else {
          throw error;
        }
      }
      const completed = requireCompletedMediaResult(result, 'audios', '音频');
      return { audios: completed.items, url: completed.url };
    },
    AUDIO_PROGRESS_TIME_MS,
  );
}

export async function generate3d(
  args: Generate3dArgs,
): Promise<{ models3d: string[]; url?: string }> {
  const requestId = generationRequestId(args.requestId);
  return withEstimatedProgress(
    args.onProgress,
    async () => {
      let result: unknown;
      try {
        result = await postJson<unknown>('/api/generate-3d', {
          provider: args.provider,
          prompt: args.prompt,
          requestId,
          referenceImages: requireOriginalAiImageReferences(args.referenceImages),
        });
      } catch (error) {
        if (isFetchConnectionError(error)) {
          result = await recoverGenerationResultByRequestId(requestId, '3d');
        } else {
          throw error;
        }
      }
      const completed = requireCompletedMediaResult(result, 'models3d', '3D 模型');
      return { models3d: completed.items, url: completed.url };
    },
    MODEL_3D_PROGRESS_TIME_MS,
  );
}

export async function chat(args: ChatArgs): Promise<{ text: string }> {
  const requestId = generationRequestId(args.requestId);
  const input = prepareChatInput({
    ...args,
    referenceImages: requireOriginalAiImageReferences(args.referenceImages),
  });
  const result = await withEstimatedProgress(
    args.onProgress,
    async () => {
      const body = {
        requestId,
        provider: args.provider,
        messages: input.messages,
        prompt: input.prompt,
        temperature: args.temperature ?? 0.8,
        mode: args.mode,
        maxLength: normalizeTextMaxLength(args.maxLength),
        reasoningEffort: args.reasoningEffort ?? args.provider.reasoningEffort,
      };
      let lastConnectionError: unknown;
      for (const delay of [0, 400, 1_200]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          return await postJson<{ text: string }>('/api/chat', body);
        } catch (error) {
          if (!isFetchConnectionError(error)) throw error;
          lastConnectionError = error;
        }
      }
      if (lastConnectionError) {
        return requireCompletedTextResult(
          await recoverGenerationResultByRequestId(requestId, 'text'),
        );
      }
      throw new Error('文本生成连接意外中断。');
    },
    CHAT_PROGRESS_TIME_MS,
  );
  return requireCompletedTextResult(result);
}

const IMAGE_KINDS: NodeKind[] = [
  'image',
  'generator',
  'views',
  'front-frame',
  'comfy',
  'midjourney',
  'msgen',
  'rh',
];
const VIDEO_KINDS: NodeKind[] = ['video', 'video-comp', 'director', 'director-2d', 'director-3d'];
const AUDIO_KINDS: NodeKind[] = ['audio'];
const MODEL_3D_KINDS: NodeKind[] = ['model-3d'];

export interface GenerateRequest {
  type: NodeKind;
  prompt?: string;
  requestId?: string;
  referenceImages?: string[];
  /** Explicit video-effect poster or extracted-frame fallback, never a core identity image. */
  videoPosterFallbackImages?: string[];
  sourceVideo?: string;
  sourceVideoDuration?: number;
  remakeSegments?: Array<{ start: number; end: number }>;
  continueVideo?: boolean;
  videoEditOperation?: 'remove-subtitles' | 'visual-edit' | 'masked-repair';
  subtitleRegion?: 'auto' | 'bottom' | 'top';
  characterReferenceImage?: string;
  maskImage?: string;
  maskRangeStart?: number;
  maskRangeEnd?: number;
  keyframeTime?: number;
  tracking?: 'provider';
  referenceAudios?: string[];
  referenceAudio?: string;
  count?: number;
  size?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  quality?: string;
  imageType?: string;
  imageTypePrompt?: string;
  mode?: string;
  temperature?: number;
  maxLength?: number;
  fps?: number;
  provider?: GenProvider;
  messages?: ChatMessage[];
  referenceImageDetail?: 'auto' | 'low' | 'high';
}

export interface GenerateResult {
  images?: string[];
  imageUrl?: string;
  videos?: string[];
  videoUrl?: string;
  audios?: string[];
  audioUrl?: string;
  models3d?: string[];
  model3dUrl?: string;
  text?: string;
}

/** 旧版 store.generateNode 使用的统一入口，按 kind 分派到对应生成器。 */
export async function generateNodeContent(
  req: GenerateRequest,
  onProgress?: (p: number) => void,
): Promise<GenerateResult> {
  const provider = req.provider;
  if (!provider || !provider.model) {
    throw new Error('未配置可用的 AI 模型或密钥。请在 API 设置中配置并保存密钥。');
  }
  if (VIDEO_KINDS.includes(req.type)) {
    const r = await generateVideo({
      provider,
      prompt: req.prompt ?? '',
      requestId: req.requestId,
      referenceImages: req.referenceImages,
      videoPosterFallbackImages: req.videoPosterFallbackImages,
      sourceVideo: req.sourceVideo,
      sourceVideoDuration: req.sourceVideoDuration,
      remakeSegments: req.remakeSegments,
      continueVideo: req.continueVideo,
      videoEditOperation: req.videoEditOperation,
      subtitleRegion: req.subtitleRegion,
      characterReferenceImage: req.characterReferenceImage,
      maskImage: req.maskImage,
      maskRangeStart: req.maskRangeStart,
      maskRangeEnd: req.maskRangeEnd,
      keyframeTime: req.keyframeTime,
      tracking: req.tracking,
      referenceAudios: req.referenceAudios,
      duration: req.duration,
      aspectRatio: req.aspectRatio,
      resolution: req.resolution,
      audio: req.audio,
      count: req.count,
      mode: req.mode,
      fps: req.fps,
      onProgress,
    });
    return { videos: r.videos, videoUrl: r.url };
  }
  if (IMAGE_KINDS.includes(req.type)) {
    const size = req.size ?? resolveImageSize(req.aspectRatio, req.quality);
    const r = await generateImage({
      provider,
      prompt: buildImagePrompt(req.prompt ?? '', req.imageType, req.imageTypePrompt),
      requestId: req.requestId,
      referenceImages: req.referenceImages,
      count: req.count,
      size,
      imageType: req.imageType,
      aspectRatio: req.aspectRatio,
      quality: req.quality,
      onProgress,
    });
    return { images: r.images, imageUrl: r.url };
  }
  if (AUDIO_KINDS.includes(req.type)) {
    const r = await generateAudio({
      provider,
      prompt: req.prompt ?? '',
      requestId: req.requestId,
      duration: req.duration,
      count: req.count,
      mode: req.mode,
      onProgress,
    });
    return { audios: r.audios, audioUrl: r.url };
  }
  if (MODEL_3D_KINDS.includes(req.type)) {
    const r = await generate3d({
      provider,
      prompt: req.prompt ?? '',
      requestId: req.requestId,
      referenceImages: req.referenceImages,
      onProgress,
    });
    return { models3d: r.models3d, model3dUrl: r.url };
  }
  const r = await chat({
    provider,
    messages: req.messages,
    prompt: req.prompt,
    requestId: req.requestId,
    referenceImages: req.referenceImages,
    temperature: req.temperature,
    mode: req.mode ?? DEFAULT_TEXT_TASK_MODE,
    maxLength: req.maxLength,
    referenceImageDetail: req.referenceImageDetail,
    reasoningEffort: provider.reasoningEffort,
    onProgress,
  });
  return { text: r.text };
}
