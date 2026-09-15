import {
  generateImage,
  generateNodeContent,
  generateVideo,
  type GenProvider,
  type VideoAudioTrackStatus,
} from './ai';
import { hydrateApiKeys } from '../lib/keyVault';
import {
  availableProviderModels,
  isProviderConnectionUsable,
  loadProviderConnections,
  type AvailableProviderModel,
  type ProviderConnection,
} from '../lib/providerRegistry';

export type PluginManagedTextModel = {
  capabilityId: string;
  providerId: string;
  model: string;
  label: string;
  providerName: string;
  displayName: string;
  recommended: boolean;
  inputModalities?: Array<'text' | 'image'>;
};

export type PluginManagedTextRequest = {
  providerId: string;
  model: string;
  prompt: string;
  operation: string;
  temperature?: number;
  maxLength?: number;
};

export type PluginManagedMediaModel = {
  capabilityId: string;
  providerId: string;
  model: string;
  label: string;
  providerName: string;
  displayName: string;
  recommended: boolean;
  inputModalities?: Array<'text' | 'image'>;
  maxReferenceImages?: number;
  maxOutputCount?: 1 | 2 | 4;
  /** The plugin may request native video audio; actual output is reported per result. */
  videoAudioOutput?: true;
  videoModes?: Array<'文生视频' | '全能参考' | '图生视频' | '首尾帧' | '图片参考' | '视频换人物'>;
};

export type PluginManagedImageRequest = {
  providerId: string;
  model: string;
  prompt: string;
  requestId?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  /** Trusted image URLs resolved from this plugin's current-session opaque handles. */
  referenceImages?: string[];
};

export type PluginManagedVideoRequest = {
  providerId: string;
  model: string;
  prompt: string;
  requestId?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  /** Trusted URLs resolved from same-session opaque media ids by the sandbox host. */
  referenceImages?: string[];
};

function capabilityId(
  kind: 'chat' | 'image' | 'video',
  model: Pick<AvailableProviderModel, 'providerId' | 'model'>,
) {
  return `${kind}:${encodeURIComponent(model.providerId)}:${encodeURIComponent(model.model)}`;
}

export function listPluginManagedTextModels(): PluginManagedTextModel[] {
  return availableProviderModels(loadProviderConnections(), 'chat').map((item) => ({
    capabilityId: capabilityId('chat', item),
    providerId: item.providerId,
    model: item.model,
    label: item.label,
    providerName: item.providerName,
    displayName: item.displayName,
    recommended: item.recommended,
    ...(item.inputModalities ? { inputModalities: [...item.inputModalities] } : {}),
  }));
}

function publicMediaModel(
  kind: 'image' | 'video',
  item: AvailableProviderModel,
): PluginManagedMediaModel {
  return {
    capabilityId: capabilityId(kind, item),
    providerId: item.providerId,
    model: item.model,
    label: item.label,
    providerName: item.providerName,
    displayName: item.displayName,
    recommended: item.recommended,
    ...(item.inputModalities ? { inputModalities: [...item.inputModalities] } : {}),
    ...(item.maxReferenceImages === undefined
      ? {}
      : { maxReferenceImages: item.maxReferenceImages }),
    ...(item.maxOutputCount === undefined ? {} : { maxOutputCount: item.maxOutputCount }),
    ...(kind === 'video' ? { videoAudioOutput: true as const } : {}),
    ...(item.videoModes ? { videoModes: [...item.videoModes] } : {}),
  };
}

export function listPluginManagedImageModels(): PluginManagedMediaModel[] {
  return availableProviderModels(loadProviderConnections(), 'image').map((item) =>
    publicMediaModel('image', item),
  );
}

export function listPluginManagedVideoModels(): PluginManagedMediaModel[] {
  return availableProviderModels(loadProviderConnections(), 'video').map((item) =>
    publicMediaModel('video', item),
  );
}

function providerForManagedModel(connection: ProviderConnection, model: string): GenProvider {
  const capability = connection.modelCapabilities?.[model];
  return {
    providerId: connection.id,
    protocol: connection.protocol,
    baseUrl: connection.baseUrl,
    endpoint: connection.endpoint,
    authType: connection.authType,
    apiKey: connection.apiKey,
    model,
    reasoningEffort:
      connection.modelReasoningEfforts?.[model] &&
      connection.modelReasoningEfforts[model] !== 'auto'
        ? connection.modelReasoningEfforts[model]
        : undefined,
    inputModalities: capability?.inputModalities ? [...capability.inputModalities] : undefined,
    videoReferenceInput: capability?.videoReferenceInput,
    videoModes: capability?.videoModes ? [...capability.videoModes] : undefined,
    videoOperations: capability?.videoOperations ? [...capability.videoOperations] : undefined,
    cliConfig: connection.cliConfig ? { ...connection.cliConfig } : undefined,
  };
}

async function managedConnection(
  kind: 'image' | 'video',
  providerId: string,
  model: string,
): Promise<{ connection: ProviderConnection; capability: AvailableProviderModel }> {
  const connections = await hydrateApiKeys(loadProviderConnections());
  const capability = availableProviderModels(connections, kind).find(
    (item) => item.providerId === providerId && item.model === model,
  );
  const connection = connections.find((item) => item.id === providerId);
  if (!connection || !capability) {
    const label = kind === 'image' ? '图片' : '视频';
    throw new Error(`所选画布${label}模型当前不可用，请在 API 设置中配置、验证或改选模型。`);
  }
  return { connection, capability };
}

export async function runPluginManagedTextModel(
  request: PluginManagedTextRequest,
): Promise<{ text: string; capabilityId: string; providerId: string; model: string }> {
  const connections = await hydrateApiKeys(loadProviderConnections());
  const connection = connections.find((item) => item.id === request.providerId);
  if (
    !connection ||
    !connection.enabled ||
    !isProviderConnectionUsable(connection) ||
    connection.canGenerate === false ||
    connection.disabledModelKinds?.includes('chat') ||
    !connection.models.chat.includes(request.model)
  ) {
    throw new Error('所选画布文本模型当前不可用，请在 API 设置中重新验证或改选模型。');
  }
  const result = await generateNodeContent({
    type: 'text',
    provider: providerForManagedModel(connection, request.model),
    prompt: request.prompt,
    mode: request.operation,
    temperature: request.temperature,
    maxLength: request.maxLength,
  });
  const text = result.text?.trim();
  if (!text) throw new Error('画布文本模型没有返回可用内容。');
  return {
    text,
    capabilityId: capabilityId('chat', {
      providerId: request.providerId,
      model: request.model,
    }),
    providerId: request.providerId,
    model: request.model,
  };
}

export async function runPluginManagedImageModel(
  request: PluginManagedImageRequest,
): Promise<{ url: string; providerId: string; model: string }> {
  const { connection, capability } = await managedConnection(
    'image',
    request.providerId,
    request.model,
  );
  const referenceImages = request.referenceImages ?? [];
  if (referenceImages.length > 0) {
    if (!capability.maxReferenceImages || capability.inputModalities?.includes('image') !== true) {
      throw new Error('所选画布图片模型未声明参考图能力。');
    }
    const maximum = Math.min(16, capability.maxReferenceImages);
    if (referenceImages.length > maximum) {
      throw new Error(`所选画布图片模型最多接受 ${maximum} 张参考图片。`);
    }
  }
  const result = await generateImage({
    provider: providerForManagedModel(connection, request.model),
    prompt: request.prompt,
    requestId: request.requestId,
    count: 1,
    size: request.size,
    aspectRatio: request.aspectRatio,
    quality: request.quality,
    referenceImages,
  });
  const url = result.url?.trim() || result.images[0]?.trim();
  if (!url) throw new Error('画布图片模型没有返回可用媒体。');
  return { url, providerId: request.providerId, model: request.model };
}

export async function runPluginManagedVideoModel(request: PluginManagedVideoRequest): Promise<{
  url: string;
  providerId: string;
  model: string;
  audioRequested: boolean;
  audioTrackStatus: VideoAudioTrackStatus;
}> {
  const { connection, capability } = await managedConnection(
    'video',
    request.providerId,
    request.model,
  );
  const referenceImages = request.referenceImages ?? [];
  if (referenceImages.length > 0) {
    const declaredReferenceModes = new Set([
      '全能参考',
      '图生视频',
      '首尾帧',
      '图片参考',
      '视频换人物',
    ]);
    const hasDeclaredReferenceInput =
      capability.inputModalities?.includes('image') === true ||
      capability.videoModes?.some((mode) => declaredReferenceModes.has(mode)) === true;
    if (!capability.maxReferenceImages || !hasDeclaredReferenceInput) {
      throw new Error('所选画布视频模型未声明参考图能力。');
    }
    if (referenceImages.length > capability.maxReferenceImages) {
      throw new Error(`所选画布视频模型最多接受 ${capability.maxReferenceImages} 张参考图片。`);
    }
  }
  const result = await generateVideo({
    provider: providerForManagedModel(connection, request.model),
    prompt: request.prompt,
    requestId: request.requestId,
    referenceImages,
    duration: request.duration,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    audio: request.audio,
    count: 1,
  });
  const url = result.url?.trim() || result.videos[0]?.trim();
  if (!url) throw new Error('画布视频模型没有返回可用媒体。');
  return {
    url,
    providerId: request.providerId,
    model: request.model,
    audioRequested: request.audio === true,
    audioTrackStatus: result.audioTrackStatus,
  };
}
