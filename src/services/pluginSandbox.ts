import type {
  PluginAudioGenerationRequest,
  PluginHostNodeKind,
  PluginPermission,
} from './pluginRegistry';
import { isCurrentBridgeUrl, resolveBridgeUrl } from '../lib/bridgeUrl';
import { PLUGIN_HOST_DOCUMENT_KEY_PREFIX } from './pluginDocuments';

export const PLUGIN_SANDBOX_MESSAGE_SOURCE = 'qiansi-plugin-sandbox';

export type PluginSandboxContext = {
  apiVersion: 1 | 2;
  pluginId: string;
  pluginName: string;
  view: string;
  launchMode?: 'canvas' | 'standalone';
  locale?: 'zh-CN' | 'en-US';
  canRequestClose?: boolean;
  permissions: PluginPermission[];
  assets: string[];
  node?: {
    id: string;
    kind: string;
    title: string;
    description: string;
    prompt: string;
    outputText: string;
    output?: unknown;
  };
};

export type PluginSandboxCall = {
  source: typeof PLUGIN_SANDBOX_MESSAGE_SOURCE;
  sessionId: string;
  requestId: string;
  method:
    | 'canvas.updateOwnNode'
    | 'canvas.addNode'
    | 'canvas.createProjectGraph'
    | 'canvas.readSelection'
    | 'canvas.readSelectedImage'
    | 'canvas.readManagedImageCopy'
    | 'canvas.readSelectedVideo'
    | 'canvas.readOwnInputs'
    | 'canvas.readOwnImage'
    | 'canvas.notify'
    | 'assets.read'
    | 'styles.readSample'
    | 'styles.uploadSample'
    | 'audio.checkGenerator'
    | 'audio.configureSeedAudioKey'
    | 'audio.listGenerators'
    | 'audio.installGenerator'
    | 'audio.installStatus'
    | 'audio.cancelInstall'
    | 'audio.uninstallGenerator'
    | 'audio.generate'
    | 'audio.listReferenceLibrary'
    | 'audio.readReferenceLibrary'
    | 'audio.createReferenceCategory'
    | 'audio.renameReferenceLibrary'
    | 'audio.importReferenceLibrary'
    | 'audio.listHistory'
    | 'audio.readHistory'
    | 'audio.downloadHistory'
    | 'audio.addHistoryToCanvasAssets'
    | 'audio.deleteHistory'
    | 'audio.cancel'
    | 'preferences.read'
    | 'preferences.write'
    | 'preferences.delete'
    | 'documents.read'
    | 'documents.write'
    | 'documents.delete'
    | 'styleCovers.read'
    | 'styleCovers.write'
    | 'styleCovers.delete'
    | 'models.listText'
    | 'models.runText'
    | 'models.listImage'
    | 'models.listVideo'
    | 'models.getAutoDlH3Connection'
    | 'models.configureAutoDlH3Connection'
    | 'models.clearAutoDlH3Connection'
    | 'models.runImage'
    | 'models.runVideo'
    | 'models.captureVideoFrame'
    | 'models.previewMedia'
    | 'models.inspectMedia'
    | 'models.downloadMedia'
    | 'vision.listPoseEngines'
    | 'vision.installPoseEngine'
    | 'vision.poseEngineInstallStatus'
    | 'vision.cancelPoseEngineInstall'
    | 'vision.uninstallPoseEngine'
    | 'vision.detectPose'
    | 'vision.startPoseCapture'
    | 'vision.poseCaptureStatus'
    | 'vision.poseCaptureResult'
    | 'vision.cancelPoseCapture'
    | 'vision.listDepthModels'
    | 'vision.installDepthModel'
    | 'vision.depthModelInstallStatus'
    | 'vision.cancelDepthModelInstall'
    | 'vision.uninstallDepthModel'
    | 'vision.renderDepthFrame'
    | 'vision.mountRigPreview'
    | 'vision.persistMotionSourceVideo'
    | 'vision.readMotionSourceVideo'
    | 'host.chooseSaveFile'
    | 'host.downloadFile'
    | 'host.requestClose';
  payload?: unknown;
};

export type PluginAudioGenerationCall = {
  generatorId: string;
  request: PluginAudioGenerationRequest;
};

const HOST_NODE_KINDS = new Set<PluginHostNodeKind>([
  'text',
  'image',
  'video',
  'audio',
  'director-2d',
  'director-3d',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const PLUGIN_PORT_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const PLUGIN_MANAGED_MEDIA_ID_RE =
  /^media-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIO_REFERENCE_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
const AUDIO_REFERENCE_GENERATION_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_REFERENCE_GENERATION_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const POSE_FRAME_MAX_BYTES = 1_500_000;
const POSE_VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const POSE_FRAME_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POSE_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_REFERENCE_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
]);

/** Resolve a connected audio reference once, then use that exact trusted URL for host reads. */
export function resolvePluginAudioReferenceUrl(url: string) {
  const value = url.trim();
  if (value.startsWith('blob:') || value.startsWith('data:audio/')) return value;

  let resolvedUrl = '';
  try {
    resolvedUrl = resolveBridgeUrl(value);
  } catch {
    // Report all malformed and non-HTTP media references through the same host-facing error.
  }
  if (!resolvedUrl || !isCurrentBridgeUrl(resolvedUrl)) {
    throw new Error('连接的参考音频不是受信任的画布媒体地址。');
  }
  return resolvedUrl;
}

/** Resolve only a selected video already owned by the current Canvas session. */
export function resolvePluginCanvasVideoUrl(url: string) {
  const value = url.trim();
  if (value.startsWith('blob:') || value.startsWith('data:video/')) return value;

  let resolvedUrl = '';
  try {
    resolvedUrl = resolveBridgeUrl(value);
  } catch {
    // Report malformed and non-HTTP references through the same host-facing error.
  }
  if (!resolvedUrl || !isCurrentBridgeUrl(resolvedUrl)) {
    throw new Error('选中的视频不是受信任的画布媒体地址。');
  }
  return resolvedUrl;
}

function boundedText(value: unknown, label: string, maxLength: number, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new Error(`${label}必须是字符串。`);
  const text = value.trim();
  if (required && !text) throw new Error(`${label}不能为空。`);
  if (text.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符。`);
  return text;
}

function decodedBase64Bytes(value: string) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('参考音频不是有效的 Base64 数据。');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function sanitizeAudioReference(value: unknown, maximumBytes = AUDIO_REFERENCE_IMPORT_MAX_BYTES) {
  if (!isPlainObject(value)) throw new Error('参考音频参数无效。');
  if (typeof value.base64 !== 'string') throw new Error('参考音频 Base64 字段无效。');
  const base64 = value.base64;
  const byteLength = decodedBase64Bytes(base64);
  if (byteLength < 1 || byteLength > maximumBytes) {
    throw new Error(`参考音频必须大于 0 字节且不能超过 ${maximumBytes / 1024 / 1024} MB。`);
  }
  const mimeType = boundedText(value.mimeType, '参考音频类型', 80, true).toLowerCase();
  if (!AUDIO_REFERENCE_MIME_TYPES.has(mimeType)) throw new Error('参考音频类型无效。');
  const fileName = boundedText(value.fileName, '参考音频文件名', 180);
  if (fileName && (/[\\/\0\r\n]/.test(fileName) || fileName === '.' || fileName === '..')) {
    throw new Error('参考音频文件名无效。');
  }
  return {
    base64,
    mimeType,
    ...(fileName ? { fileName } : {}),
  };
}

function sanitizeAudioReferences(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error('参考音频数组必须包含 1 到 3 段音频。');
  }
  const references = value.map((reference) =>
    sanitizeAudioReference(reference, AUDIO_REFERENCE_GENERATION_MAX_BYTES),
  );
  const totalBytes = references.reduce(
    (total, reference) => total + decodedBase64Bytes(reference.base64),
    0,
  );
  if (totalBytes > AUDIO_REFERENCE_GENERATION_MAX_TOTAL_BYTES) {
    throw new Error('全部参考音频合计不能超过 30 MB。');
  }
  return references;
}

export function sanitizePluginReferenceAudioImport(value: unknown) {
  const reference = sanitizeAudioReference(value);
  if (!reference.fileName) throw new Error('参考音频文件名不能为空。');
  return {
    base64: reference.base64,
    mimeType: reference.mimeType,
    fileName: reference.fileName,
  };
}

export function sanitizePluginReferenceAudioCategory(value: unknown) {
  if (!isPlainObject(value)) throw new Error('参考音频分类参数无效。');
  const category = boundedText(value.category, '参考音频分类', 80, true);
  if (
    category === '未分类' ||
    category === '.' ||
    category === '..' ||
    /[<>:"/\\|?*\0\r\n]/.test(category)
  ) {
    throw new Error('参考音频分类无效。');
  }
  return category;
}

function boundedAudioNumber(value: unknown, key: string, minimum: number, maximum: number) {
  if (typeof value !== 'number') throw new Error(`${key} 必须是数字。`);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${key} 必须是 ${minimum} 到 ${maximum} 之间的数字。`);
  }
  return value;
}

function boundedAudioInteger(value: unknown, key: string, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${key} 必须是整数。`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${key} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function sanitizeAudioOptions(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (!isPlainObject(value)) throw new Error('音频生成选项无效。');
  const options: Record<string, unknown> = {};
  if (value.promptText != null) {
    const promptText = boundedText(value.promptText, '参考音频转写', 16_000);
    if (promptText) options.promptText = promptText;
  }
  if (value.speakerPreset != null) {
    const speakerPreset = boundedText(value.speakerPreset, '固定音色文件名', 68, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.csv$/.test(speakerPreset)) {
      throw new Error('固定音色文件名无效。');
    }
    options.speakerPreset = speakerPreset;
  }
  for (const [key, label, maximum] of [
    ['engineTask', '模型任务', 24],
    ['language', '语言', 32],
    ['speaker', '预设音色', 32],
  ] as const) {
    if (value[key] != null) {
      options[key] = boundedText(value[key], label, maximum, true);
    }
  }
  if (value.speechRate != null) {
    options.speechRate = boundedAudioNumber(value.speechRate, 'speechRate', 0.5, 2);
  }
  if (value.seedAudioPitchRate != null) {
    options.seedAudioPitchRate = boundedAudioInteger(
      value.seedAudioPitchRate,
      'Seed Audio 语调',
      -12,
      12,
    );
  }
  if (value.seedAudioSpeechRate != null) {
    options.seedAudioSpeechRate = boundedAudioInteger(
      value.seedAudioSpeechRate,
      'Seed Audio 语速',
      -50,
      100,
    );
  }
  if (value.seedAudioLoudnessRate != null) {
    options.seedAudioLoudnessRate = boundedAudioInteger(
      value.seedAudioLoudnessRate,
      'Seed Audio 音量',
      -50,
      100,
    );
  }
  if (value.durationSeconds != null) {
    options.durationSeconds = boundedAudioInteger(value.durationSeconds, 'durationSeconds', 1, 120);
  }
  if (value.audioFormat != null) {
    const audioFormat = boundedText(value.audioFormat, 'audioFormat', 8, true).toLowerCase();
    if (audioFormat !== 'mp3' && audioFormat !== 'wav' && audioFormat !== 'ogg_opus') {
      throw new Error('audioFormat 只支持 mp3、wav 或 ogg_opus。');
    }
    options.audioFormat = audioFormat;
  }
  if (value.qwenTemperature != null) {
    options.qwenTemperature = boundedAudioNumber(value.qwenTemperature, 'qwenTemperature', 0.1, 2);
  }
  if (value.qwenTopP != null) {
    options.qwenTopP = boundedAudioNumber(value.qwenTopP, 'qwenTopP', 0.1, 1);
  }
  if (value.qwenTopK != null) {
    options.qwenTopK = boundedAudioInteger(value.qwenTopK, 'qwenTopK', 1, 100);
  }
  if (value.qwenRepetitionPenalty != null) {
    options.qwenRepetitionPenalty = boundedAudioNumber(
      value.qwenRepetitionPenalty,
      'qwenRepetitionPenalty',
      1,
      2,
    );
  }
  if (value.wooshCfg != null) {
    options.wooshCfg = boundedAudioNumber(value.wooshCfg, 'wooshCfg', 0, 9);
  }
  if (value.wooshSteps != null) {
    options.wooshSteps = boundedAudioInteger(value.wooshSteps, 'wooshSteps', 4, 8);
  }
  if (value.cfgValue != null) {
    if (typeof value.cfgValue !== 'number') throw new Error('CFG 必须是数字。');
    const cfgValue = value.cfgValue;
    if (!Number.isFinite(cfgValue) || cfgValue < 0.1 || cfgValue > 10) {
      throw new Error('CFG 必须是 0.1 到 10 之间的数字。');
    }
    options.cfgValue = cfgValue;
  }
  if (value.inferenceTimesteps != null) {
    if (typeof value.inferenceTimesteps !== 'number') throw new Error('推理步数必须是整数。');
    const inferenceTimesteps = value.inferenceTimesteps;
    if (
      !Number.isInteger(inferenceTimesteps) ||
      inferenceTimesteps < 1 ||
      inferenceTimesteps > 100
    ) {
      throw new Error('推理步数必须是 1 到 100 之间的整数。');
    }
    options.inferenceTimesteps = inferenceTimesteps;
  }
  if (value.seed != null) {
    if (typeof value.seed !== 'number') throw new Error('随机种子必须是整数。');
    const seed = value.seed;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new Error('随机种子必须是 0 到 4294967295 之间的整数。');
    }
    options.seed = seed;
  }
  if (value.temperature != null) {
    options.temperature = boundedAudioNumber(value.temperature, 'temperature', 0.00001, 1);
  }
  if (value.topP != null) {
    options.topP = boundedAudioNumber(value.topP, 'topP', 0.1, 0.9);
  }
  if (value.topK != null) {
    options.topK = boundedAudioInteger(value.topK, 'topK', 1, 20);
  }
  if (value.textSeed != null) {
    options.textSeed = boundedAudioInteger(value.textSeed, 'textSeed', 0, 0xffff_ffff);
  }
  for (const [key, minimum, maximum] of [
    ['speed', 0, 9],
    ['oral', 0, 9],
    ['laugh', 0, 2],
    ['breakLevel', 0, 7],
    ['splitBatch', 0, 16],
  ] as const) {
    if (value[key] != null) {
      options[key] = boundedAudioInteger(value[key], key, minimum, maximum);
    }
  }
  for (const key of [
    'normalize',
    'denoise',
    'voiceConsent',
    'refineText',
    'homophoneReplacement',
    'xVectorOnly',
  ] as const) {
    if (value[key] != null) {
      if (typeof value[key] !== 'boolean') throw new Error(`${key} 必须是布尔值。`);
      options[key] = value[key];
    }
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function safeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 16_000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value))
    return value.slice(0, 200).map((item) => safeJsonValue(item, depth + 1));
  if (!isPlainObject(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const clean = safeJsonValue(item, depth + 1);
    if (clean !== undefined) result[key.slice(0, 120)] = clean;
  }
  return result;
}

export function sanitizePluginNodePatch(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error('插件节点更新参数无效。');
  const allowed = new Set(['title', 'description', 'prompt', 'outputText', 'output', 'genParams']);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue;
    const clean = safeJsonValue(item);
    if (clean !== undefined) result[key] = clean;
  }
  if (JSON.stringify(result).length > 64 * 1024) throw new Error('插件节点更新内容过大。');
  return result;
}

/** Expose only bounded, JSON-safe values already materialized on the plugin node's own ports. */
export function sanitizePluginOwnInputs(value: unknown): Record<string, unknown[]> {
  if (!isPlainObject(value)) return {};
  const result: Record<string, unknown[]> = {};
  for (const [key, rawValues] of Object.entries(value).slice(0, 24)) {
    if (!PLUGIN_PORT_ID_RE.test(key)) continue;
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
      .slice(0, 16)
      .map((item) => safeJsonValue(item))
      .filter((item) => item !== undefined);
    if (values.length > 0) result[key] = values;
  }
  if (JSON.stringify(result).length > 64 * 1024) {
    throw new Error('插件节点输入内容过大。');
  }
  return result;
}

export function sanitizePluginOwnImageRequest(value?: unknown): {
  portId: string;
  index: number;
} {
  const request = value == null ? {} : value;
  if (!isPlainObject(request)) throw new Error('插件输入图片请求无效。');
  const portId = String(request.portId ?? 'in').trim();
  if (!PLUGIN_PORT_ID_RE.test(portId)) throw new Error('插件输入图片端口无效。');
  const index = Number(request.index ?? 0);
  if (!Number.isInteger(index) || index < 0 || index > 15) {
    throw new Error('插件输入图片索引必须是 0 到 15 之间的整数。');
  }
  return { portId, index };
}

export function sanitizePluginAudioGeneratorId(value: unknown): string {
  const generatorId = boundedText(value, '音频生成器 ID', 64, true);
  if (!PLUGIN_ID_RE.test(generatorId)) throw new Error('音频生成器 ID 无效。');
  return generatorId;
}

export function sanitizePluginAudioInstallRequest(value: unknown): {
  generatorId: string;
  licenseAcceptance?: string;
} {
  if (!isPlainObject(value)) throw new Error('音频模型安装请求无效。');
  const unknown = Object.keys(value).filter(
    (key) => key !== 'generatorId' && key !== 'licenseAcceptance',
  );
  if (unknown.length > 0) throw new Error('音频模型安装请求包含未知字段。');
  const generatorId = sanitizePluginAudioGeneratorId(value.generatorId);
  if (value.licenseAcceptance == null || value.licenseAcceptance === '') return { generatorId };
  const licenseAcceptance = boundedText(value.licenseAcceptance, '许可证确认摘要', 64, true);
  if (!/^[a-f0-9]{64}$/i.test(licenseAcceptance)) throw new Error('许可证确认摘要无效。');
  return { generatorId, licenseAcceptance: licenseAcceptance.toLowerCase() };
}

export function sanitizePluginAudioHistoryLookup(value: unknown): {
  generatorId: string;
  historyId?: string;
} {
  if (!isPlainObject(value)) throw new Error('音频历史请求无效。');
  const generatorId = sanitizePluginAudioGeneratorId(value.generatorId);
  if (value.historyId == null) return { generatorId };
  const historyId = boundedText(value.historyId, '音频历史 ID', 128, true);
  if (!/^[A-Za-z0-9-]{8,128}$/.test(historyId)) throw new Error('音频历史 ID 无效。');
  return { generatorId, historyId };
}

export function sanitizePluginAudioGenerationCall(value: unknown): PluginAudioGenerationCall {
  if (!isPlainObject(value)) throw new Error('音频生成请求无效。');
  const generatorId = sanitizePluginAudioGeneratorId(value.generatorId);
  if (!isPlainObject(value.request)) throw new Error('音频生成参数无效。');
  const mode = String(value.request.mode || '');
  if (mode !== 'design' && mode !== 'clone' && mode !== 'hifi') {
    throw new Error('音频生成模式无效。');
  }
  const text = boundedText(value.request.text, '待合成文本', 16_000, true);
  const control = boundedText(value.request.control, '声音控制描述', 1_000);
  const referenceAudio =
    value.request.referenceAudio == null
      ? undefined
      : sanitizeAudioReference(value.request.referenceAudio, AUDIO_REFERENCE_GENERATION_MAX_BYTES);
  const referenceAudios =
    value.request.referenceAudios == null
      ? undefined
      : sanitizeAudioReferences(value.request.referenceAudios);
  if (referenceAudio && referenceAudios) {
    throw new Error('单段参考音频与多段参考音频不能同时提交。');
  }
  const options = sanitizeAudioOptions(value.request.options);
  if (mode !== 'design' && options?.speakerPreset) {
    throw new Error('固定音色只能用于音色设计模式。');
  }
  if (mode === 'hifi' && !String(options?.promptText || '').trim()) {
    throw new Error('Hi-Fi 克隆必须提供参考音频的准确转写。');
  }
  return {
    generatorId,
    request: {
      mode,
      text,
      ...(control ? { control } : {}),
      ...(referenceAudio ? { referenceAudio } : {}),
      ...(referenceAudios ? { referenceAudios } : {}),
      ...(options ? { options } : {}),
    },
  };
}

export function sanitizePluginAddNodeRequest(value: unknown): {
  kind: PluginHostNodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
} {
  if (!isPlainObject(value)) throw new Error('插件新增节点参数无效。');
  const kind = String(value.kind || '') as PluginHostNodeKind;
  if (!HOST_NODE_KINDS.has(kind)) throw new Error('插件请求的节点类型不受支持。');
  const positionValue = isPlainObject(value.position) ? value.position : {};
  const x = Math.max(-100_000, Math.min(100_000, Number(positionValue.x) || 0));
  const y = Math.max(-100_000, Math.min(100_000, Number(positionValue.y) || 0));
  return {
    kind,
    position: { x, y },
    data: sanitizePluginNodePatch(isPlainObject(value.data) ? value.data : {}),
  };
}

const PLUGIN_GRAPH_CLIENT_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const PLUGIN_GRAPH_APPLICATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;

function pluginGraphClientId(value: unknown, label: string) {
  const id = boundedText(value, label, 80, true);
  if (!PLUGIN_GRAPH_CLIENT_ID_RE.test(id)) {
    throw new Error(`${label}必须以字母开头，且只能包含字母、数字、下划线或连字符。`);
  }
  return id;
}

export function sanitizePluginProjectGraphRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('插件新画布节点图参数无效。');
  const applicationId = boundedText(value.applicationId, '建图应用 ID', 80, true);
  if (!PLUGIN_GRAPH_APPLICATION_ID_RE.test(applicationId)) {
    throw new Error('建图应用 ID 必须是 8 到 80 位字母、数字、点、下划线、冒号或连字符。');
  }
  if (value.retryFailed !== undefined && typeof value.retryFailed !== 'boolean') {
    throw new Error('建图失败重试标识必须是布尔值。');
  }
  const name = boundedText(value.name, '新画布名称', 100, true);
  if (
    [...name].some((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character))
  ) {
    throw new Error('新画布名称包含无效字符。');
  }
  if (!Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > 240) {
    throw new Error('新画布节点数量必须为 1 到 240。');
  }
  if (!Array.isArray(value.edges) || value.edges.length > 480) {
    throw new Error('新画布连线数量不能超过 480。');
  }
  const allowedKinds = new Set<PluginHostNodeKind>([
    'text',
    'image',
    'video',
    'audio',
    'director-2d',
    'director-3d',
  ]);
  const nodes = value.nodes.map((rawNode, index) => {
    if (!isPlainObject(rawNode)) throw new Error(`第 ${index + 1} 个节点参数无效。`);
    const clientId = pluginGraphClientId(rawNode.clientId, `第 ${index + 1} 个节点标识`);
    const kind = String(rawNode.kind || '') as PluginHostNodeKind;
    if (!allowedKinds.has(kind)) throw new Error(`第 ${index + 1} 个节点类型不受支持。`);
    const positionValue = isPlainObject(rawNode.position) ? rawNode.position : {};
    const x = Math.max(-100_000, Math.min(100_000, Number(positionValue.x) || 0));
    const y = Math.max(-100_000, Math.min(100_000, Number(positionValue.y) || 0));
    const rawData = isPlainObject(rawNode.data) ? rawNode.data : {};
    const isMediaNode = kind === 'image' || kind === 'video';
    const forbiddenMediaFields = [
      'url',
      'imageUrl',
      'images',
      'videoUrl',
      'videos',
      'originalUrl',
      'referenceMediaIds',
    ];
    if (forbiddenMediaFields.some((key) => Object.prototype.hasOwnProperty.call(rawData, key))) {
      throw new Error(`第 ${index + 1} 个节点不能直接提供媒体 URL 或引用列表。`);
    }
    if (isMediaNode && Object.prototype.hasOwnProperty.call(rawData, 'output')) {
      throw new Error(`第 ${index + 1} 个媒体节点不能直接提供 output。`);
    }
    if (!isMediaNode && Object.prototype.hasOwnProperty.call(rawData, 'mediaId')) {
      throw new Error(`第 ${index + 1} 个非媒体节点不能使用 mediaId。`);
    }
    const data = sanitizePluginNodePatch(rawData);
    if (Object.prototype.hasOwnProperty.call(rawData, 'shotId')) {
      const shotId = boundedText(rawData.shotId, `第 ${index + 1} 个节点分镜 ID`, 80, true);
      if (
        [...shotId].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint <= 0x1f || codePoint === 0x7f;
        })
      ) {
        throw new Error(`第 ${index + 1} 个节点分镜 ID 格式无效。`);
      }
      data.shotId = shotId;
    }
    if (Object.prototype.hasOwnProperty.call(rawData, 'role')) {
      const role = boundedText(rawData.role, `第 ${index + 1} 个节点角色`, 24, true);
      if (!['image-prompt', 'image', 'video-prompt', 'video'].includes(role)) {
        throw new Error(`第 ${index + 1} 个节点角色无效。`);
      }
      data.role = role;
    }
    if (isMediaNode && Object.prototype.hasOwnProperty.call(rawData, 'mediaId')) {
      data.mediaId = sanitizePluginManagedMediaId(rawData.mediaId);
    }
    return {
      clientId,
      kind: kind as Exclude<PluginHostNodeKind, 'plugin'>,
      position: { x, y },
      data,
    };
  });
  const edges = value.edges.map((rawEdge, index) => {
    if (!isPlainObject(rawEdge)) throw new Error(`第 ${index + 1} 条连线参数无效。`);
    return {
      clientId: pluginGraphClientId(rawEdge.clientId, `第 ${index + 1} 条连线标识`),
      source: pluginGraphClientId(rawEdge.source, `第 ${index + 1} 条连线起点`),
      target: pluginGraphClientId(rawEdge.target, `第 ${index + 1} 条连线终点`),
    };
  });
  if (
    new TextEncoder().encode(JSON.stringify({ applicationId, name, nodes, edges })).byteLength >
    4 * 1024 * 1024
  ) {
    throw new Error('新画布节点图内容不能超过 4 MiB。');
  }
  return {
    applicationId,
    name,
    nodes,
    edges,
    ...(value.retryFailed === true ? { retryFailed: true as const } : {}),
  };
}

export function sanitizePluginDocumentRequest(value: unknown): {
  key: string;
  value?: unknown;
  expectedRevision?: number;
} {
  if (!isPlainObject(value)) throw new Error('插件项目文档请求无效。');
  const key = boundedText(value.key, '插件项目文档键', 120, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(key)) {
    throw new Error('插件项目文档键格式无效。');
  }
  if (key.startsWith(PLUGIN_HOST_DOCUMENT_KEY_PREFIX)) {
    throw new Error('插件项目文档键使用了宿主保留命名空间。');
  }
  const expectedRevision = value.expectedRevision;
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0)
  ) {
    throw new Error('插件项目文档预期修订号无效。');
  }
  return {
    key,
    ...(Object.prototype.hasOwnProperty.call(value, 'value') ? { value: value.value } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision: Number(expectedRevision) }),
  };
}

export function sanitizePluginStyleCoverRequest(value: unknown): {
  styleId: string;
  cover?: unknown;
  expectedRevision?: number;
} {
  if (!isPlainObject(value)) throw new Error('共享风格封面请求无效。');
  const styleId = boundedText(value.styleId, '风格标识', 72, true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,71}$/.test(styleId)) throw new Error('风格标识格式无效。');
  const expectedRevision = value.expectedRevision;
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0)
  )
    throw new Error('共享风格封面预期修订号无效。');
  return {
    styleId,
    ...(Object.prototype.hasOwnProperty.call(value, 'cover') ? { cover: value.cover } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision: Number(expectedRevision) }),
  };
}

export function sanitizePluginManagedTextRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('插件文本模型请求无效。');
  const providerId = boundedText(value.providerId, '文本模型提供器 ID', 80, true);
  const model = boundedText(value.model, '文本模型 ID', 300, true);
  const operation = boundedText(value.operation, '文本模型操作', 64, true);
  const prompt = boundedText(value.prompt, '文本模型提示词', 400_000, true);
  const serializedPromptBytes = new TextEncoder().encode(JSON.stringify(prompt)).byteLength;
  if (serializedPromptBytes > 384 * 1024) {
    throw new Error('文本模型提示词超过 384 KiB 宿主请求限制。');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(providerId)) {
    throw new Error('文本模型提供器 ID 格式无效。');
  }
  const modelHasControlCharacters = [...model].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (modelHasControlCharacters || !/^[a-z][a-z0-9_-]{1,63}$/.test(operation)) {
    throw new Error('文本模型 ID 或操作标识格式无效。');
  }
  const temperature = value.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  ) {
    throw new Error('文本模型 temperature 必须是 0 到 2 之间的数字。');
  }
  const maxLength = value.maxLength;
  if (
    maxLength !== undefined &&
    (!Number.isInteger(maxLength) || Number(maxLength) < 256 || Number(maxLength) > 64_000)
  ) {
    throw new Error('文本模型最大输出长度必须为 256 到 64000。');
  }
  return {
    providerId,
    model,
    operation,
    prompt,
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxLength === undefined ? {} : { maxLength: Number(maxLength) }),
  };
}

const MANAGED_MEDIA_ASPECT_RATIOS = new Set([
  '16:9',
  '9:16',
  '1:1',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '21:9',
]);
const MANAGED_VIDEO_RESOLUTIONS = new Set(['480P', '720P', '1080P', '2K', '4K']);
const MANAGED_IMAGE_QUALITIES = new Set(['standard', '2K', '4K']);

function rejectUnknownManagedMediaFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(`${label}包含未知字段。`);
  }
}

function sanitizePluginManagedMediaSelection(value: Record<string, unknown>, label: string) {
  const providerId = boundedText(value.providerId, `${label}提供器 ID`, 80, true);
  const model = boundedText(value.model, `${label}模型 ID`, 300, true);
  const prompt = boundedText(value.prompt, `${label}提示词`, 100_000, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(providerId)) {
    throw new Error(`${label}提供器 ID 格式无效。`);
  }
  if (
    [...model].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error(`${label}模型 ID 格式无效。`);
  }
  if (new TextEncoder().encode(JSON.stringify(prompt)).byteLength > 96 * 1024) {
    throw new Error(`${label}提示词超过 96 KiB 宿主请求限制。`);
  }
  let requestId: string | undefined;
  if (value.requestId !== undefined) {
    requestId = boundedText(value.requestId, `${label}请求 ID`, 64, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/.test(requestId)) {
      throw new Error(`${label}请求 ID 格式无效。`);
    }
  }
  return { providerId, model, prompt, ...(requestId ? { requestId } : {}) };
}

function sanitizeManagedAspectRatio(value: unknown, label: string, allowAuto = false) {
  if (value === undefined) return;
  const aspectRatio = boundedText(value, `${label}画面比例`, 8, true);
  if (!(MANAGED_MEDIA_ASPECT_RATIOS.has(aspectRatio) || (allowAuto && aspectRatio === 'Auto'))) {
    throw new Error(`${label}画面比例无效。`);
  }
  return aspectRatio;
}

export function sanitizePluginManagedImageRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('插件图片模型请求无效。');
  rejectUnknownManagedMediaFields(
    value,
    [
      'providerId',
      'model',
      'prompt',
      'requestId',
      'size',
      'aspectRatio',
      'quality',
      'referenceMediaIds',
    ],
    '插件图片模型请求',
  );
  const base = sanitizePluginManagedMediaSelection(value, '图片模型');
  let size: string | undefined;
  if (value.size !== undefined) {
    size = boundedText(value.size, '图片模型尺寸', 16, true);
    const match = /^(\d{3,4})x(\d{3,4})$/.exec(size);
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    if (!match || width < 256 || width > 4096 || height < 256 || height > 4096) {
      throw new Error('图片模型尺寸必须是 256x256 到 4096x4096。');
    }
  }
  const aspectRatio = sanitizeManagedAspectRatio(value.aspectRatio, '图片模型');
  let quality: string | undefined;
  if (value.quality !== undefined) {
    quality = boundedText(value.quality, '图片模型画质', 16, true);
    if (!MANAGED_IMAGE_QUALITIES.has(quality)) throw new Error('图片模型画质无效。');
  }
  let referenceMediaIds: string[] | undefined;
  if (value.referenceMediaIds !== undefined) {
    if (!Array.isArray(value.referenceMediaIds) || value.referenceMediaIds.length > 16) {
      throw new Error('图片模型参考媒体不能超过 16 项。');
    }
    referenceMediaIds = value.referenceMediaIds.map(sanitizePluginManagedMediaId);
    if (new Set(referenceMediaIds).size !== referenceMediaIds.length) {
      throw new Error('图片模型参考媒体不能重复。');
    }
  }
  return {
    ...base,
    ...(size ? { size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(quality ? { quality } : {}),
    ...(referenceMediaIds ? { referenceMediaIds } : {}),
  };
}

export function sanitizePluginAutoDlH3ConnectionRequest(value: unknown): { token: string } {
  if (!isPlainObject(value)) throw new Error('AutoDL H3 连接配置无效。');
  rejectUnknownManagedMediaFields(value, ['token'], 'AutoDL H3 连接配置');
  return { token: boundedText(value.token, 'AutoDL ComfyUI Token', 4096, true) };
}

export function sanitizePluginSeedAudioCredentialRequest(value: unknown): { apiKey: string } {
  if (!isPlainObject(value)) throw new Error('Seed Audio API Key 配置无效。');
  rejectUnknownManagedMediaFields(value, ['apiKey'], 'Seed Audio API Key 配置');
  const apiKey = boundedText(value.apiKey, 'Seed Audio API Key', 4096, true);
  if (
    [...apiKey].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new Error('Seed Audio API Key 不能包含控制字符。');
  }
  return { apiKey };
}

export function sanitizePluginManagedVideoRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('插件视频模型请求无效。');
  rejectUnknownManagedMediaFields(
    value,
    [
      'providerId',
      'model',
      'prompt',
      'requestId',
      'duration',
      'aspectRatio',
      'resolution',
      'audio',
      'referenceMediaIds',
    ],
    '插件视频模型请求',
  );
  const base = sanitizePluginManagedMediaSelection(value, '视频模型');
  let duration: number | undefined;
  if (value.duration !== undefined) {
    if (
      !Number.isInteger(value.duration) ||
      Number(value.duration) < 1 ||
      Number(value.duration) > 30
    ) {
      throw new Error('视频模型时长必须是 1 到 30 秒之间的整数。');
    }
    duration = Number(value.duration);
  }
  const aspectRatio = sanitizeManagedAspectRatio(value.aspectRatio, '视频模型', true);
  let resolution: string | undefined;
  if (value.resolution !== undefined) {
    resolution = boundedText(value.resolution, '视频模型分辨率', 8, true);
    if (!MANAGED_VIDEO_RESOLUTIONS.has(resolution)) throw new Error('视频模型分辨率无效。');
  }
  if (value.audio !== undefined && typeof value.audio !== 'boolean') {
    throw new Error('视频模型音轨标识必须是布尔值。');
  }
  let referenceMediaIds: string[] | undefined;
  if (value.referenceMediaIds !== undefined) {
    if (!Array.isArray(value.referenceMediaIds) || value.referenceMediaIds.length > 16) {
      throw new Error('视频模型参考媒体不能超过 16 项。');
    }
    referenceMediaIds = value.referenceMediaIds.map(sanitizePluginManagedMediaId);
    if (new Set(referenceMediaIds).size !== referenceMediaIds.length) {
      throw new Error('视频模型参考媒体不能重复。');
    }
  }
  return {
    ...base,
    ...(duration === undefined ? {} : { duration }),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(value.audio === undefined ? {} : { audio: value.audio }),
    ...(referenceMediaIds ? { referenceMediaIds } : {}),
  };
}

export function sanitizePluginManagedMediaId(value: unknown): string {
  const mediaId = boundedText(value, '受管媒体 ID', 42, true);
  if (!PLUGIN_MANAGED_MEDIA_ID_RE.test(mediaId)) throw new Error('受管媒体 ID 无效。');
  return mediaId.toLowerCase();
}

export function sanitizePluginManagedMediaDownloadRequest(value: unknown): {
  mediaId: string;
  fileName?: string;
} {
  if (!isPlainObject(value)) throw new Error('插件媒体下载请求无效。');
  rejectUnknownManagedMediaFields(value, ['mediaId', 'fileName'], '插件媒体下载请求');
  const mediaId = sanitizePluginManagedMediaId(value.mediaId);
  if (value.fileName === undefined) return { mediaId };
  const fileName = boundedText(value.fileName, '插件媒体下载文件名', 180, true);
  if (/[\\/\0\r\n]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('插件媒体下载文件名无效。');
  }
  return { mediaId, fileName };
}

export function sanitizePluginManagedMediaInspectRequest(value: unknown): { mediaId: string } {
  if (!isPlainObject(value)) throw new Error('插件媒体检查请求无效。');
  rejectUnknownManagedMediaFields(value, ['mediaId'], '插件媒体检查请求');
  return { mediaId: sanitizePluginManagedMediaId(value.mediaId) };
}

export function sanitizePluginManagedVideoFrameRequest(value: unknown): {
  mediaId: string;
  position: 'first' | 'last';
} {
  if (!isPlainObject(value)) throw new Error('插件视频帧截取请求无效。');
  rejectUnknownManagedMediaFields(value, ['mediaId', 'position'], '插件视频帧截取请求');
  const position = value.position === undefined ? 'last' : value.position;
  if (position !== 'first' && position !== 'last') {
    throw new Error('视频帧截取位置只能是 first 或 last。');
  }
  return {
    mediaId: sanitizePluginManagedMediaId(value.mediaId),
    position,
  };
}

const PLUGIN_HOST_DOWNLOAD_MAX_BYTES = 256 * 1024 * 1024;

function sanitizePluginHostWebmDescriptor(value: unknown, allowedFields: string[]) {
  if (!isPlainObject(value)) throw new Error('插件文件保存请求无效。');
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`插件文件保存请求包含不支持的字段：${key}。`);
  }
  const mimeType = boundedText(value.mimeType, '插件保存文件类型', 32, true).toLowerCase();
  if (mimeType !== 'video/webm') throw new Error('插件保存文件类型仅支持 video/webm。');
  const fileName = boundedText(value.fileName, '插件保存文件名', 180, true);
  if (/[\\/\0\r\n]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('插件保存文件名无效。');
  }
  if (!/\.webm$/i.test(fileName)) throw new Error('插件保存文件名必须使用 .webm 扩展名。');
  return { value, mimeType: 'video/webm' as const, fileName };
}

export function sanitizePluginHostSaveFileRequest(value: unknown): {
  mimeType: 'video/webm';
  fileName: string;
} {
  const descriptor = sanitizePluginHostWebmDescriptor(value, ['mimeType', 'fileName']);
  return { mimeType: descriptor.mimeType, fileName: descriptor.fileName };
}

export function sanitizePluginHostDownloadRequest(value: unknown): {
  bytes: ArrayBuffer;
  mimeType: 'video/webm';
  fileName: string;
  destinationId?: string;
} {
  const descriptor = sanitizePluginHostWebmDescriptor(value, [
    'bytes',
    'mimeType',
    'fileName',
    'destinationId',
  ]);
  if (!(descriptor.value.bytes instanceof ArrayBuffer)) {
    throw new Error('插件下载文件没有有效字节。');
  }
  if (
    descriptor.value.bytes.byteLength < 1 ||
    descriptor.value.bytes.byteLength > PLUGIN_HOST_DOWNLOAD_MAX_BYTES
  ) {
    throw new Error('插件下载文件必须大于 0 字节且不能超过 256 MB。');
  }
  let destinationId: string | undefined;
  if (descriptor.value.destinationId !== undefined) {
    destinationId = boundedText(descriptor.value.destinationId, '插件保存位置 ID', 80, true);
    if (!/^save-[a-f0-9-]{36}$/i.test(destinationId)) {
      throw new Error('插件保存位置 ID 无效。');
    }
  }
  return {
    bytes: descriptor.value.bytes,
    mimeType: descriptor.mimeType,
    fileName: descriptor.fileName,
    ...(destinationId ? { destinationId } : {}),
  };
}

const PLUGIN_MOTION_SOURCE_MAX_BYTES = 256 * 1024 * 1024;
const PLUGIN_MOTION_SOURCE_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export function sanitizePluginMotionSourceStoreRequest(value: unknown): {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
} {
  if (!isPlainObject(value)) throw new Error('动作源视频保存请求无效。');
  const allowed = new Set(['bytes', 'mimeType', 'fileName']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`动作源视频保存请求包含不支持的字段：${key}。`);
  }
  if (!(value.bytes instanceof ArrayBuffer)) throw new Error('动作源视频没有有效字节。');
  if (value.bytes.byteLength < 1 || value.bytes.byteLength > PLUGIN_MOTION_SOURCE_MAX_BYTES) {
    throw new Error('动作源视频必须大于 0 字节且不能超过 256 MB。');
  }
  const mimeType = boundedText(value.mimeType, '动作源视频类型', 64, true).toLowerCase();
  if (!PLUGIN_MOTION_SOURCE_MIME_TYPES.has(mimeType)) {
    throw new Error('动作源视频仅支持 MP4、WebM 或 MOV。');
  }
  const fileName = boundedText(value.fileName, '动作源视频文件名', 180, true);
  if (/[\\/\0\r\n]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('动作源视频文件名无效。');
  }
  return { bytes: value.bytes, mimeType, fileName };
}

export function sanitizePluginMotionSourceReadRequest(value: unknown): { assetId: string } {
  if (!isPlainObject(value) || Object.keys(value).some((key) => key !== 'assetId')) {
    throw new Error('动作源视频读取请求无效。');
  }
  const assetId = boundedText(value.assetId, '动作源视频素材 ID', 80, true);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(assetId)) throw new Error('动作源视频素材 ID 无效。');
  return { assetId };
}

export function sanitizePluginPoseFrameRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('姿态识别帧参数无效。');
  const allowedFields = new Set([
    'bytes',
    'mimeType',
    'timestampMs',
    'width',
    'height',
    'maxPoses',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) throw new Error(`姿态识别帧包含不支持的字段：${key}。`);
  }
  if (!(value.bytes instanceof ArrayBuffer)) throw new Error('姿态识别帧没有有效字节。');
  if (value.bytes.byteLength < 1 || value.bytes.byteLength > POSE_FRAME_MAX_BYTES) {
    throw new Error('姿态识别帧必须大于 0 字节且不能超过 1.5 MB。');
  }
  const mimeType = boundedText(value.mimeType, '姿态识别帧类型', 32, true).toLowerCase();
  if (!POSE_FRAME_MIME_TYPES.has(mimeType)) throw new Error('姿态识别帧类型无效。');
  const timestampMs = Number(value.timestampMs);
  if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > 3_600_000) {
    throw new Error('姿态识别帧时间戳无效。');
  }
  const width = Number(value.width);
  const height = Number(value.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 1_280 ||
    height > 1_280
  ) {
    throw new Error('姿态识别帧尺寸无效。');
  }
  const maxPoses = value.maxPoses === undefined ? 1 : Number(value.maxPoses);
  if (!Number.isInteger(maxPoses) || maxPoses < 1 || maxPoses > 4) {
    throw new Error('姿态识别人数上限必须是 1 到 4 的整数。');
  }
  return {
    bytes: value.bytes,
    mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
    timestampMs,
    width,
    height,
    maxPoses,
  };
}

export function sanitizePluginPoseCaptureRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('AI 动作视频参数无效。');
  const allowed = new Set([
    'engineId',
    'bytes',
    'fileName',
    'mimeType',
    'durationSeconds',
    'width',
    'height',
    'sampleFps',
    'maxPoses',
    'confidenceThreshold',
    'smoothing',
    'staticCamera',
    'detectionThreshold',
    'trackingMethod',
    'trackingThreshold',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`AI 动作视频包含未知字段：${unknown.join('、')}。`);
  const engineId = String(value.engineId || '').trim();
  if (engineId !== 'gem-x' && engineId !== 'rtmw3d') throw new Error('AI 动作引擎无效。');
  if (!(value.bytes instanceof ArrayBuffer)) throw new Error('AI 动作视频没有有效字节。');
  if (value.bytes.byteLength < 1 || value.bytes.byteLength > POSE_VIDEO_MAX_BYTES) {
    throw new Error('AI 动作视频必须大于 0 字节且不能超过 256 MB。');
  }
  const fileName = boundedText(value.fileName, 'AI 动作视频文件名', 260, true);
  if (/[\\/\0\r\n]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw new Error('AI 动作视频文件名无效。');
  }
  const mimeType = boundedText(value.mimeType, 'AI 动作视频格式', 40, true).toLowerCase();
  if (!POSE_VIDEO_MIME_TYPES.has(mimeType)) throw new Error('AI 动作视频格式无效。');
  const finite = (item: unknown, label: string, minimum: number, maximum: number) => {
    const number = Number(item);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new Error(`${label}无效。`);
    }
    return number;
  };
  const width = finite(value.width, 'AI 动作视频宽度', 16, 16_384);
  const height = finite(value.height, 'AI 动作视频高度', 16, 16_384);
  const sampleFps = finite(value.sampleFps, 'AI 动作采样率', 5, 15);
  const maxPoses = finite(value.maxPoses, 'AI 动作人物上限', 1, 4);
  if (![width, height, sampleFps, maxPoses].every(Number.isInteger)) {
    throw new Error('AI 动作视频尺寸、采样率和人物上限必须是整数。');
  }
  if (![5, 10, 15].includes(sampleFps)) {
    throw new Error('AI 动作采样率只支持 5、10 或 15 FPS。');
  }
  if (engineId === 'gem-x' && maxPoses !== 1) {
    throw new Error('GEM-X 单次只支持一个人物。');
  }
  const staticCamera = value.staticCamera === undefined ? false : value.staticCamera;
  if (typeof staticCamera !== 'boolean') throw new Error('GEM-X 相机运动假设无效。');
  const trackingMethod = value.trackingMethod === undefined ? 'iou' : value.trackingMethod;
  if (trackingMethod !== 'iou' && trackingMethod !== 'oks') {
    throw new Error('RTMW3D 人物跟踪方式无效。');
  }
  return {
    engineId: engineId as 'gem-x' | 'rtmw3d',
    bytes: value.bytes,
    fileName,
    mimeType: mimeType as 'video/mp4' | 'video/webm' | 'video/quicktime',
    durationSeconds: finite(value.durationSeconds, 'AI 动作视频时长', 0.001, 90),
    width,
    height,
    sampleFps: sampleFps as 5 | 10 | 15,
    maxPoses,
    confidenceThreshold: finite(value.confidenceThreshold, 'AI 动作置信度', 0, 1),
    smoothing: finite(value.smoothing, 'AI 动作平滑强度', 0, 0.9),
    staticCamera,
    detectionThreshold: finite(value.detectionThreshold ?? 0.3, 'RTMW3D 人体检测阈值', 0, 1),
    trackingMethod: trackingMethod as 'iou' | 'oks',
    trackingThreshold: finite(value.trackingThreshold ?? 0.3, 'RTMW3D 人物跟踪阈值', 0, 1),
  };
}

export function sanitizePluginPoseCaptureJobRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('AI 动作任务参数无效。');
  const unknown = Object.keys(value).filter((key) => key !== 'engineId' && key !== 'jobId');
  if (unknown.length) throw new Error(`AI 动作任务包含未知字段：${unknown.join('、')}。`);
  const engineId = String(value.engineId || '').trim();
  if (engineId !== 'gem-x' && engineId !== 'rtmw3d') throw new Error('AI 动作引擎无效。');
  const jobId = String(value.jobId || '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) {
    throw new Error('AI 动作任务 ID 无效。');
  }
  return { engineId: engineId as 'gem-x' | 'rtmw3d', jobId };
}

export function sanitizePluginPoseEngineInstallRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('动作模型安装参数无效。');
  const unknown = Object.keys(value).filter((key) => key !== 'engineId');
  if (unknown.length) throw new Error(`动作模型安装包含未知字段：${unknown.join('、')}。`);
  const engineId = String(value.engineId || '').trim();
  if (engineId !== 'gem-x' && engineId !== 'rtmw3d') {
    throw new Error('该动作引擎不支持模型安装。');
  }
  return { engineId };
}

export function sanitizePluginDepthModelInstallRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('白模模型安装参数无效。');
  const unknown = Object.keys(value).filter((key) => key !== 'modelId');
  if (unknown.length) throw new Error(`白模模型安装包含未知字段：${unknown.join('、')}。`);
  const modelId = String(value.modelId || '').trim();
  if (modelId !== 'depth-anything-v2-small' && modelId !== 'sapiens2-normal-0.4b') {
    throw new Error('该白模模型不支持一键安装。');
  }
  return { modelId };
}

export function sanitizePluginDepthFrameRequest(value: unknown) {
  if (!isPlainObject(value)) throw new Error('白模视频帧请求无效。');
  const allowed = new Set([
    'modelId',
    'bytes',
    'mimeType',
    'timestampMs',
    'width',
    'height',
    'backend',
    'inputSize',
    'wasmThreads',
    'gpuPowerPreference',
    'temporalSmoothing',
    'invert',
    'blackPoint',
    'whitePoint',
    'gamma',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`白模视频帧请求包含未知字段：${unknown.join('、')}。`);
  const modelId = String(value.modelId || 'depth-anything-v2-small').trim();
  if (modelId !== 'depth-anything-v2-small' && modelId !== 'sapiens2-normal-0.4b') {
    throw new Error('白模视频帧模型无效。');
  }
  if (!(value.bytes instanceof ArrayBuffer) || value.bytes.byteLength > POSE_FRAME_MAX_BYTES) {
    throw new Error('白模视频帧必须是不超过 1.5 MB 的 ArrayBuffer。');
  }
  const mimeType = String(value.mimeType || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('白模视频帧格式无效。');
  }
  const timestampMs = Number(value.timestampMs);
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > 86_400_000) {
    throw new Error('白模视频帧时间戳无效。');
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 1_280 ||
    height > 1_280
  ) {
    throw new Error('白模视频帧尺寸无效。');
  }
  if (typeof value.invert !== 'boolean') throw new Error('白模远近反转参数无效。');
  const blackPoint = Number(value.blackPoint);
  const whitePoint = Number(value.whitePoint);
  const gamma = Number(value.gamma);
  if (
    !Number.isFinite(blackPoint) ||
    !Number.isFinite(whitePoint) ||
    blackPoint < 0 ||
    whitePoint > 1 ||
    whitePoint - blackPoint < 0.1
  ) {
    throw new Error('白模黑白场参数无效。');
  }
  if (!Number.isFinite(gamma) || gamma < 0.1 || gamma > 4) {
    throw new Error('白模 Gamma 参数无效。');
  }
  const backend = String(value.backend || '').toLowerCase();
  if (backend !== 'webgpu' && backend !== 'wasm') {
    throw new Error('白模推理设备必须是 WebGPU 或 CPU WASM。');
  }
  const inputSize = Number(value.inputSize ?? 518);
  if (![392, 518, 686].includes(inputSize)) {
    throw new Error('白模推理精细度必须是 392、518 或 686。');
  }
  const wasmThreads = Number(value.wasmThreads ?? 0);
  if (![0, 1, 2, 4, 8].includes(wasmThreads)) {
    throw new Error('CPU WASM 线程数必须是自动、1、2、4 或 8。');
  }
  const gpuPowerPreference = String(value.gpuPowerPreference ?? 'high-performance');
  if (gpuPowerPreference !== 'high-performance' && gpuPowerPreference !== 'low-power') {
    throw new Error('WebGPU 性能倾向无效。');
  }
  const temporalSmoothing = Number(value.temporalSmoothing ?? 0);
  if (!Number.isFinite(temporalSmoothing) || temporalSmoothing < 0 || temporalSmoothing > 0.8) {
    throw new Error('白模时序平滑参数必须在 0 到 0.8 之间。');
  }
  return {
    modelId: modelId as 'depth-anything-v2-small' | 'sapiens2-normal-0.4b',
    bytes: value.bytes,
    mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
    timestampMs,
    width,
    height,
    backend: backend as 'webgpu' | 'wasm',
    inputSize: inputSize as 392 | 518 | 686,
    wasmThreads: wasmThreads as 0 | 1 | 2 | 4 | 8,
    gpuPowerPreference: gpuPowerPreference as 'high-performance' | 'low-power',
    temporalSmoothing,
    invert: value.invert,
    blackPoint,
    whitePoint,
    gamma,
  };
}

export function parsePluginSandboxCall(
  value: unknown,
  sessionId: string,
): PluginSandboxCall | null {
  if (!isPlainObject(value)) return null;
  if (value.source !== PLUGIN_SANDBOX_MESSAGE_SOURCE || value.sessionId !== sessionId) return null;
  const method = String(value.method || '') as PluginSandboxCall['method'];
  if (
    ![
      'canvas.updateOwnNode',
      'canvas.addNode',
      'canvas.createProjectGraph',
      'canvas.readSelection',
      'canvas.readSelectedImage',
      'canvas.readManagedImageCopy',
      'canvas.readSelectedVideo',
      'canvas.readOwnInputs',
      'canvas.readOwnImage',
      'canvas.notify',
      'assets.read',
      'styles.readSample',
      'styles.uploadSample',
      'audio.checkGenerator',
      'audio.configureSeedAudioKey',
      'audio.listGenerators',
      'audio.installGenerator',
      'audio.installStatus',
      'audio.cancelInstall',
      'audio.uninstallGenerator',
      'audio.generate',
      'audio.listReferenceLibrary',
      'audio.readReferenceLibrary',
      'audio.createReferenceCategory',
      'audio.renameReferenceLibrary',
      'audio.importReferenceLibrary',
      'audio.listHistory',
      'audio.readHistory',
      'audio.downloadHistory',
      'audio.addHistoryToCanvasAssets',
      'audio.deleteHistory',
      'audio.cancel',
      'preferences.read',
      'preferences.write',
      'preferences.delete',
      'documents.read',
      'documents.write',
      'documents.delete',
      'styleCovers.read',
      'styleCovers.write',
      'styleCovers.delete',
      'models.listText',
      'models.runText',
      'models.listImage',
      'models.listVideo',
      'models.getAutoDlH3Connection',
      'models.configureAutoDlH3Connection',
      'models.clearAutoDlH3Connection',
      'models.runImage',
      'models.runVideo',
      'models.captureVideoFrame',
      'models.previewMedia',
      'models.inspectMedia',
      'models.downloadMedia',
      'vision.listPoseEngines',
      'vision.installPoseEngine',
      'vision.poseEngineInstallStatus',
      'vision.cancelPoseEngineInstall',
      'vision.uninstallPoseEngine',
      'vision.detectPose',
      'vision.startPoseCapture',
      'vision.poseCaptureStatus',
      'vision.poseCaptureResult',
      'vision.cancelPoseCapture',
      'vision.listDepthModels',
      'vision.installDepthModel',
      'vision.depthModelInstallStatus',
      'vision.cancelDepthModelInstall',
      'vision.uninstallDepthModel',
      'vision.renderDepthFrame',
      'vision.mountRigPreview',
      'vision.persistMotionSourceVideo',
      'vision.readMotionSourceVideo',
      'host.chooseSaveFile',
      'host.downloadFile',
      'host.requestClose',
    ].includes(method)
  ) {
    return null;
  }
  if (method === 'host.requestClose' && value.payload != null) return null;
  const requestId = String(value.requestId || '').slice(0, 80);
  if (!requestId) return null;
  return {
    source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
    sessionId,
    requestId,
    method,
    payload: value.payload,
  };
}

function scriptSafeJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028|\u2029/g, ' ');
}

function scriptSafeSource(source: string) {
  return source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

export function buildPluginSandboxDocument(
  runtimeSource: string,
  sessionId: string,
  context: PluginSandboxContext,
) {
  const initialLocale = context.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const bootstrap = `
    (() => {
      const source = ${scriptSafeJson(PLUGIN_SANDBOX_MESSAGE_SOURCE)};
      const sessionId = ${scriptSafeJson(sessionId)};
      const initialContext = ${scriptSafeJson(context)};
      let locale = initialContext.locale === 'en-US' ? 'en-US' : 'zh-CN';
      const context = Object.freeze({
        ...initialContext,
        get locale() { return locale; },
      });
      const pending = new Map();
      let sequence = 0;
      const call = (method, payload, transfer = []) => new Promise((resolve, reject) => {
        const requestId = String(++sequence);
        pending.set(requestId, { resolve, reject });
        parent.postMessage({ source, sessionId, requestId, method, payload }, '*', transfer);
      });
      addEventListener('message', (event) => {
        if (event.source !== parent) return;
        const message = event.data;
        if (!message || message.source !== source || message.sessionId !== sessionId) return;
        if (message.type === 'host-context') {
          if (message.locale !== 'zh-CN' && message.locale !== 'en-US') return;
          locale = message.locale;
          document.documentElement.lang = locale;
          dispatchEvent(new CustomEvent('qiansi:languagechange', {
            detail: Object.freeze({ locale }),
          }));
          return;
        }
        if (message.type !== 'result') return;
        const task = pending.get(String(message.requestId));
        if (!task) return;
        pending.delete(String(message.requestId));
        if (message.ok) task.resolve(message.value);
        else task.reject(new Error(String(message.error || '插件能力调用失败。')));
      });
      const api = {
        apiVersion: context.apiVersion,
        context,
        updateOwnNode: (patch) => call('canvas.updateOwnNode', patch),
        addNode: (request) => call('canvas.addNode', request),
        readSelection: () => call('canvas.readSelection'),
        notify: (message) => call('canvas.notify', { message }),
        readAsset: (name) => call('assets.read', { name }),
      };
      const managedPreviewUrls = new Map();
      const managedCanvasCopyUrls = new Map();
      addEventListener('pagehide', () => {
        for (const previewUrl of managedPreviewUrls.values()) URL.revokeObjectURL(previewUrl);
        managedPreviewUrls.clear();
        for (const copyUrl of managedCanvasCopyUrls.values()) URL.revokeObjectURL(copyUrl);
        managedCanvasCopyUrls.clear();
      }, { once: true });
      const previewManagedMedia = async (request) => {
        const mediaId = typeof request?.mediaId === 'string' ? request.mediaId : '';
        const cached = managedPreviewUrls.get(mediaId);
        if (cached) return { mediaId, kind: 'image', previewUrl: cached };
        const receipt = await call('models.previewMedia', request);
        if (receipt?.mediaId !== mediaId || receipt?.kind !== 'image'
          || !(receipt.preview instanceof Blob) || receipt.preview.type !== 'image/webp'
          || receipt.preview.size < 1 || receipt.preview.size > 4 * 1024 * 1024) {
          throw new Error('宿主返回的受管图片缩略图无效。');
        }
        const previewUrl = URL.createObjectURL(receipt.preview);
        managedPreviewUrls.set(mediaId, previewUrl);
        return { mediaId, kind: 'image', previewUrl };
      };
      const readManagedCanvasImageCopy = async (request) => {
        const mediaId = typeof request?.mediaId === 'string' ? request.mediaId : '';
        const cached = managedCanvasCopyUrls.get(mediaId);
        if (cached) return { mediaId, kind: 'image', imageUrl: cached };
        const receipt = await call('canvas.readManagedImageCopy', request);
        if (receipt?.mediaId !== mediaId || receipt?.kind !== 'image'
          || !(receipt.image instanceof Blob)
          || !['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
            .includes(receipt.image.type.toLowerCase())
          || receipt.image.size < 1 || receipt.image.size > 32 * 1024 * 1024) {
          throw new Error('宿主返回的画布原图副本无效。');
        }
        const imageUrl = URL.createObjectURL(receipt.image);
        managedCanvasCopyUrls.set(mediaId, imageUrl);
        return { mediaId, kind: 'image', imageUrl };
      };
      if (context.apiVersion >= 2) {
        Object.assign(api, {
          readSelectedImage: () => call('canvas.readSelectedImage'),
          readManagedCanvasImageCopy,
          readSelectedVideo: () => call('canvas.readSelectedVideo'),
          readOwnInputs: () => call('canvas.readOwnInputs'),
          readOwnImage: (request = {}) => call('canvas.readOwnImage', request),
          createProjectGraph: (request) => call('canvas.createProjectGraph', request),
          readStyleSample: (packId) => call('styles.readSample', { packId }),
          uploadStyleSample: async (packId, file) => {
            if (!(file instanceof File)) throw new Error('请选择风格样图文件。');
            return call('styles.uploadSample', {
              packId,
              fileName: file.name,
              mimeType: file.type,
              bytes: await file.arrayBuffer(),
            });
          },
          checkAudioGenerator: (generatorId) =>
            call('audio.checkGenerator', { generatorId }),
          listAudioGenerators: () => call('audio.listGenerators'),
          installEngine: async (generatorId, options = {}, onProgress) => {
            const licenseAcceptance = options && typeof options === 'object'
              ? options.licenseAcceptance
              : undefined;
            let state = await call('audio.installGenerator', {
              generatorId,
              ...(licenseAcceptance ? { licenseAcceptance } : {}),
            });
            const report = () => {
              if (typeof onProgress === 'function') {
                onProgress(state.status, state.message || state.phase || '', state);
              }
            };
            report();
            const terminal = new Set(['done', 'already', 'error', 'cancelled', 'idle']);
            for (let attempt = 0; attempt < 115200 && !terminal.has(String(state.status || '')); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 750));
              state = await call('audio.installStatus', { generatorId });
              report();
            }
            return state;
          },
          readEngineInstallStatus: (generatorId) =>
            call('audio.installStatus', { generatorId }),
          cancelEngineInstall: (generatorId) =>
            call('audio.cancelInstall', { generatorId }),
          uninstallEngine: (generatorId) =>
            call('audio.uninstallGenerator', { generatorId }),
          generateAudio: (generatorId, request) =>
            call('audio.generate', { generatorId, request }),
          listReferenceAudioLibrary: () => call('audio.listReferenceLibrary'),
          readReferenceAudioLibrary: (id) => call('audio.readReferenceLibrary', { id }),
          createReferenceAudioCategory: (category) =>
            call('audio.createReferenceCategory', { category }),
          renameReferenceAudioLibrary: (id, name, category, transcript) =>
            call('audio.renameReferenceLibrary', { id, name, category, transcript }),
          importReferenceAudioLibrary: (fileName, mimeType, base64) =>
            call('audio.importReferenceLibrary', { fileName, mimeType, base64 }),
          listAudioHistory: (generatorId) =>
            call('audio.listHistory', { generatorId }),
          readAudioHistory: (generatorId, historyId) =>
            call('audio.readHistory', { generatorId, historyId }),
          downloadAudioHistory: (generatorId, historyId) =>
            call('audio.downloadHistory', { generatorId, historyId }),
          addAudioHistoryToCanvasAssets: (generatorId, historyId) =>
            call('audio.addHistoryToCanvasAssets', { generatorId, historyId }),
          deleteAudioHistory: (generatorId, historyId) =>
            call('audio.deleteHistory', { generatorId, historyId }),
          cancelAudioGeneration: () => call('audio.cancel'),
          readPreference: (key) => call('preferences.read', { key }),
          writePreference: (key, value) => call('preferences.write', { key, value }),
          deletePreference: (key) => call('preferences.delete', { key }),
          readProjectDocument: (key) => call('documents.read', { key }),
          writeProjectDocument: (key, value, expectedRevision) =>
            call('documents.write', {
              key,
              value,
              ...(expectedRevision === undefined ? {} : { expectedRevision }),
            }),
          deleteProjectDocument: (key, expectedRevision) =>
            call('documents.delete', {
              key,
              ...(expectedRevision === undefined ? {} : { expectedRevision }),
            }),
          readSharedStyleCover: (styleId) => call('styleCovers.read', { styleId }),
          writeSharedStyleCover: (styleId, cover, expectedRevision) =>
            call('styleCovers.write', {
              styleId,
              cover,
              ...(expectedRevision === undefined ? {} : { expectedRevision }),
            }),
          deleteSharedStyleCover: (styleId, expectedRevision) =>
            call('styleCovers.delete', {
              styleId,
              ...(expectedRevision === undefined ? {} : { expectedRevision }),
            }),
          listManagedTextModels: () => call('models.listText'),
          runManagedTextModel: (request) => call('models.runText', request),
          listManagedImageModels: () => call('models.listImage'),
          listManagedVideoModels: () => call('models.listVideo'),
          runManagedImageModel: (request) => call('models.runImage', request),
          runManagedVideoModel: (request) => call('models.runVideo', request),
          captureManagedVideoFrame: (request) => call('models.captureVideoFrame', request),
          previewManagedMedia,
          inspectManagedMedia: (request) => call('models.inspectMedia', request),
          downloadManagedMedia: (request) => call('models.downloadMedia', request),
          listPoseEngines: () => call('vision.listPoseEngines'),
          installPoseEngine: async (engineId, onProgress) => {
            let state = await call('vision.installPoseEngine', { engineId });
            const report = () => {
              if (typeof onProgress === 'function') onProgress(state);
            };
            report();
            const terminal = new Set(['done', 'already', 'error', 'cancelled', 'idle']);
            for (let attempt = 0; attempt < 115200 && !terminal.has(String(state.status || '')); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 750));
              state = await call('vision.poseEngineInstallStatus', { engineId });
              report();
            }
            return state;
          },
          readPoseEngineInstallStatus: (engineId) =>
            call('vision.poseEngineInstallStatus', { engineId }),
          cancelPoseEngineInstall: (engineId) =>
            call('vision.cancelPoseEngineInstall', { engineId }),
          uninstallPoseEngine: (engineId) =>
            call('vision.uninstallPoseEngine', { engineId }),
          listDepthModels: () => call('vision.listDepthModels'),
          installDepthModel: async (modelId, onProgress) => {
            let state = await call('vision.installDepthModel', { modelId });
            const report = () => {
              if (typeof onProgress === 'function') onProgress(state);
            };
            report();
            const terminal = new Set(['done', 'already', 'error', 'cancelled']);
            for (let attempt = 0; attempt < 115200 && !terminal.has(String(state.status || '')); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 750));
              state = await call('vision.depthModelInstallStatus', { modelId });
              report();
            }
            return state;
          },
          readDepthModelInstallStatus: (modelId) =>
            call('vision.depthModelInstallStatus', { modelId }),
          cancelDepthModelInstall: (modelId) =>
            call('vision.cancelDepthModelInstall', { modelId }),
          uninstallDepthModel: (modelId) => call('vision.uninstallDepthModel', { modelId }),
          renderDepthFrame: (request) => {
            if (!request || !(request.bytes instanceof ArrayBuffer)) {
              return Promise.reject(new Error('白模识别帧没有有效字节。'));
            }
            return call('vision.renderDepthFrame', request, [request.bytes]);
          },
          persistMotionSourceVideo: (request) => {
            if (!request || !(request.bytes instanceof ArrayBuffer)) {
              return Promise.reject(new Error('动作源视频没有有效字节。'));
            }
            return call('vision.persistMotionSourceVideo', request, [request.bytes]);
          },
          readMotionSourceVideo: (assetId) =>
            call('vision.readMotionSourceVideo', { assetId }),
          detectPoseFrame: (request) => {
            if (!request || !(request.bytes instanceof ArrayBuffer)) {
              return Promise.reject(new Error('姿态识别帧没有有效字节。'));
            }
            return call('vision.detectPose', request, [request.bytes]);
          },
          startPoseVideoCapture: (request) => {
            if (!request || !(request.bytes instanceof ArrayBuffer)) {
              return Promise.reject(new Error('AI 动作视频没有有效字节。'));
            }
            return call('vision.startPoseCapture', request, [request.bytes]);
          },
          readPoseVideoCaptureStatus: (engineId, jobId) =>
            call('vision.poseCaptureStatus', { engineId, jobId }),
          readPoseVideoCaptureResult: (engineId, jobId) =>
            call('vision.poseCaptureResult', { engineId, jobId }),
          cancelPoseVideoCapture: (engineId, jobId) =>
            call('vision.cancelPoseCapture', { engineId, jobId }),
          mountPoseRigPreview: (request) => {
            if (!request || !(request.canvas instanceof HTMLCanvasElement)) {
              throw new Error('3D 人偶预览没有有效画布。');
            }
            const channel = new MessageChannel();
            const bitmapContext = request.canvas.getContext('bitmaprenderer');
            const fallbackContext = bitmapContext ? null : request.canvas.getContext('2d');
            if (!bitmapContext && !fallbackContext) {
              throw new Error('当前浏览器不支持画布 3D 人偶帧显示。');
            }
            let disposed = false;
            channel.port1.onmessage = (event) => {
              const bitmap = event.data?.bitmap;
              if (!(bitmap instanceof ImageBitmap)) return;
              if (disposed) {
                bitmap.close();
                return;
              }
              if (request.canvas.width !== bitmap.width) request.canvas.width = bitmap.width;
              if (request.canvas.height !== bitmap.height) request.canvas.height = bitmap.height;
              if (bitmapContext) {
                bitmapContext.transferFromImageBitmap(bitmap);
              } else {
                fallbackContext.clearRect(0, 0, request.canvas.width, request.canvas.height);
                fallbackContext.drawImage(bitmap, 0, 0);
                bitmap.close();
              }
              channel.port1.postMessage({ type: 'bitmap-presented' });
            };
            channel.port1.start();
            const ready = call('vision.mountRigPreview', {
              port: channel.port2,
              modelId: request.modelId,
              view: request.view,
            }, [channel.port2]).catch((error) => {
              disposed = true;
              channel.port1.onmessage = null;
              channel.port1.close();
              throw error;
            });
            return Object.freeze({
              ready,
              update: (frame) => {
                if (!disposed) channel.port1.postMessage(frame);
              },
              dispose: () => {
                if (disposed) return;
                disposed = true;
                channel.port1.postMessage({ type: 'dispose' });
                channel.port1.onmessage = null;
                channel.port1.close();
              },
            });
          },
        });
        if (context.pluginId === 'qiansi-novel-video-studio') {
          Object.assign(api, {
            pickLatestProjectImage: () =>
              call('canvas.readSelectedImage', { source: 'recent-project-first' }),
            getAutoDlH3Connection: () => call('models.getAutoDlH3Connection'),
            configureAutoDlH3Connection: (token) =>
              call('models.configureAutoDlH3Connection', { token }),
            clearAutoDlH3Connection: () => call('models.clearAutoDlH3Connection'),
          });
        }
        if (context.pluginId === 'doubao-seed-audio') {
          Object.assign(api, {
            configureSeedAudioApiKey: (apiKey) =>
              call('audio.configureSeedAudioKey', { apiKey }),
          });
        }
        if (context.pluginId === 'qiansi-motion-capture') {
          Object.assign(api, {
            chooseSaveFile: (request) => call('host.chooseSaveFile', request),
            downloadFile: (request) => {
              const bytes = request?.bytes;
              return call('host.downloadFile', request, bytes instanceof ArrayBuffer ? [bytes] : []);
            },
          });
        }
      }
      if (context.canRequestClose === true) {
        api.requestClose = () => call('host.requestClose');
        addEventListener('keydown', (event) => {
          if (event.key !== 'Escape' || event.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          void call('host.requestClose').catch(() => {});
        }, { capture: true });
      }
      window.qiansi = Object.freeze(api);
    })();
  `;
  return `<!doctype html>
<html lang="${initialLocale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      html, body, #root { width: 100%; min-height: 100%; margin: 0; }
      body { overflow: hidden; background: transparent; color: rgba(255,255,255,.88); }
      button, input, textarea, select { font: inherit; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>${bootstrap}</script>
    <script>${scriptSafeSource(runtimeSource)}</script>
  </body>
</html>`;
}
