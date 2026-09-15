import type { GenParams } from '../store/canvasStore';
import type {
  AvailableProviderModel,
  ProviderModelKind,
  ProviderVideoOperation,
} from '../lib/providerRegistry';
import type { ComposerReference } from './types';
import { canonicalReferenceUrl } from './referenceResolution';
import { normalizeVideoGenerationMode } from '../lib/videoGenerationMode';
export { requestedVideoAudio } from '../lib/videoGenerationMode';

export type GenerationCapabilityIssue =
  | 'model-unavailable'
  | 'image-input-unverified'
  | 'too-many-image-references'
  | 'too-many-video-references'
  | 'too-many-audio-references'
  | 'output-count-unsupported'
  | 'video-mode-unsupported'
  | 'video-mode-input-missing'
  | 'video-operation-unsupported';

export type GenerationCapabilityRequest = {
  kind: Extract<ProviderModelKind, 'image' | 'video'>;
  references: readonly ComposerReference[];
  additionalImageReferenceUrls?: readonly string[];
  count: GenParams['count'];
  mode?: unknown;
  videoTool?: string;
};

export function findReadyGenerationModel(
  models: readonly AvailableProviderModel[],
  selection: { providerId?: unknown; model?: unknown },
): AvailableProviderModel | undefined {
  const providerId = typeof selection.providerId === 'string' ? selection.providerId.trim() : '';
  const model = typeof selection.model === 'string' ? selection.model.trim() : '';
  if (!providerId || !model) return undefined;
  return models.find(
    (candidate) => candidate.providerId === providerId && candidate.model === model,
  );
}

export function providerVideoOperation(value: unknown): ProviderVideoOperation | undefined {
  return value === 'remake' ||
    value === 'enhance' ||
    value === 'extend' ||
    value === 'remove-subtitles' ||
    value === 'visual-edit' ||
    value === 'masked-repair' ||
    value === 'character-replace'
    ? value
    : undefined;
}

function uniqueMediaCount(entries: readonly (readonly (string | undefined)[])[]): number {
  const seen = new Set<string>();
  let count = 0;

  for (const aliases of entries) {
    const canonicalAliases = aliases
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(canonicalReferenceUrl);
    if (canonicalAliases.length === 0) continue;
    if (!canonicalAliases.some((alias) => seen.has(alias))) count += 1;
    canonicalAliases.forEach((alias) => seen.add(alias));
  }

  return count;
}

function capabilityReferenceCounts(
  model: AvailableProviderModel,
  request: GenerationCapabilityRequest,
) {
  const imageEntries: Array<Array<string | undefined>> = [];
  const videoEntries: Array<Array<string | undefined>> = [];
  const audioEntries: Array<Array<string | undefined>> = [];

  for (const reference of request.references) {
    if (!reference.url) continue;
    const aliases = [reference.url, reference.previewUrl];
    if (
      request.kind === 'video' &&
      reference.type === 'video' &&
      reference.role === 'effect' &&
      model.videoReferenceInput !== true
    ) {
      // The generation path converts an unsupported effects-library video into
      // its poster/frame image, so the model gate must validate the same input.
      imageEntries.push([reference.previewUrl ?? reference.url, ...aliases]);
    } else if (reference.type === 'image') {
      imageEntries.push(aliases);
    } else if (reference.type === 'video') {
      videoEntries.push(aliases);
    } else if (reference.type === 'audio') {
      audioEntries.push(aliases);
    }
  }

  for (const url of request.additionalImageReferenceUrls ?? []) imageEntries.push([url]);

  return {
    imageReferences: uniqueMediaCount(imageEntries),
    videoReferences: uniqueMediaCount(videoEntries),
    audioReferences: uniqueMediaCount(audioEntries),
  };
}

/**
 * Validate a visual request against capabilities advertised by the exact ready model.
 * Missing limits are deliberately treated as unsupported, never as unlimited.
 */
export function generationCapabilityIssue(
  model: AvailableProviderModel | undefined,
  request: GenerationCapabilityRequest,
): GenerationCapabilityIssue | null {
  if (!model) return 'model-unavailable';

  const { imageReferences, videoReferences, audioReferences } = capabilityReferenceCounts(
    model,
    request,
  );

  if (imageReferences > 0 && !model.inputModalities?.includes('image')) {
    return 'image-input-unverified';
  }
  if (imageReferences > (model.maxReferenceImages ?? 0)) {
    return 'too-many-image-references';
  }
  if (videoReferences > (model.maxReferenceVideos ?? 0)) {
    return 'too-many-video-references';
  }
  if (audioReferences > (model.maxReferenceAudios ?? 0)) {
    return 'too-many-audio-references';
  }
  if (request.count > (model.maxOutputCount ?? 1)) {
    return 'output-count-unsupported';
  }

  if (request.kind === 'video') {
    const mode = normalizeVideoGenerationMode(request.mode);
    if (!model.videoModes?.some((supportedMode) => supportedMode === mode)) {
      return 'video-mode-unsupported';
    }
    const mediaReferenceCount = imageReferences + videoReferences + audioReferences;
    if (
      (mode === '全能参考' && mediaReferenceCount === 0) ||
      ((mode === '图生视频' || mode === '图片参考') && imageReferences === 0) ||
      (mode === '首尾帧' && imageReferences < 2) ||
      (mode === '视频换人物' && (imageReferences === 0 || videoReferences === 0))
    ) {
      return 'video-mode-input-missing';
    }
    const requestedVideoTool =
      typeof request.videoTool === 'string' ? request.videoTool.trim() : '';
    const operation = providerVideoOperation(requestedVideoTool);
    if (requestedVideoTool && !operation) return 'video-operation-unsupported';
    if (operation && !model.videoOperations?.includes(operation)) {
      return 'video-operation-unsupported';
    }
  }

  return null;
}

export const GENERATION_CAPABILITY_ISSUE_FALLBACKS: Record<GenerationCapabilityIssue, string> = {
  'model-unavailable': '请先选择一个真实可用的生成模型',
  'image-input-unverified': '当前模型未明确支持图片输入',
  'too-many-image-references': '参考图片数量超过当前模型已声明的上限',
  'too-many-video-references': '参考视频数量超过当前模型已声明的上限',
  'too-many-audio-references': '参考音频数量超过当前模型已声明的上限',
  'output-count-unsupported': '生成数量超过当前模型已声明的上限',
  'video-mode-unsupported': '当前模型未明确支持所选视频模式',
  'video-mode-input-missing': '所选视频模式缺少必需的参考素材',
  'video-operation-unsupported': '当前模型未明确支持这个视频 AI 工具',
};
