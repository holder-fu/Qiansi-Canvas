export const JIMENG_IMAGE_MODELS = Object.freeze([
  '5.0Pro',
  '5.0',
  '4.7',
  '4.6',
  '4.5',
  '4.1',
  '4.0',
  '3.1',
  '3.0',
]);

export const JIMENG_VIDEO_MODELS = Object.freeze([
  'seedance2.5',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
  'seedance2.0',
  'seedance2.0fast',
  'seedance2.0mini',
]);

export const JIMENG_VIP_VIDEO_MODELS = Object.freeze([
  'seedance2.5',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
]);

export const JIMENG_MODEL_DISPLAY_NAMES = Object.freeze({
  '5.0Pro': '即梦图片 5.0 Pro',
  '5.0': '即梦图片 5.0',
  4.7: '即梦图片 4.7',
  4.6: '即梦图片 4.6',
  4.5: '即梦图片 4.5',
  4.1: '即梦图片 4.1',
  '4.0': '即梦图片 4.0',
  3.1: '即梦图片 3.1',
  '3.0': '即梦图片 3.0',
  'seedance2.5': 'Seedance 2.5（VIP）',
  'seedance2.0_vip': 'Seedance 2.0 VIP',
  'seedance2.0fast_vip': 'Seedance 2.0 Fast VIP',
  'seedance2.0': 'Seedance 2.0',
  'seedance2.0fast': 'Seedance 2.0 Fast',
  'seedance2.0mini': 'Seedance 2.0 Mini',
});

const IMAGE_MODEL_SET = new Set(JIMENG_IMAGE_MODELS);
const IMAGE_TO_IMAGE_MODEL_SET = new Set(
  JIMENG_IMAGE_MODELS.filter((model) => model !== '3.0' && model !== '3.1'),
);
const VIDEO_MODEL_SET = new Set(JIMENG_VIDEO_MODELS);
const IMAGE_RATIOS = new Set(['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16']);
const VIDEO_RATIOS = new Set(['1:1', '3:4', '16:9', '4:3', '9:16', '21:9']);
const SUCCESS_STATUSES = new Set([
  'success',
  'succeeded',
  'completed',
  'complete',
  'done',
  'finished',
]);
const ERROR_STATUSES = new Set([
  'error',
  'failed',
  'fail',
  'cancelled',
  'canceled',
  'deleted',
  'rejected',
]);
const STATUS_KEYS = new Set(['gen_status', 'task_status', 'status', 'state', 'queue_status']);
const MESSAGE_KEYS = new Set([
  'message',
  'msg',
  'error',
  'error_message',
  'status_message',
  'description',
  'fail_reason',
  'guidance',
]);
const IMAGE_SOURCE_KEYS = new Set(['image_url', 'imageurl', 'images', 'large_images', 'path']);
const VIDEO_SOURCE_KEYS = new Set(['video_url', 'videourl', 'videos', 'path']);

/**
 * Read the account capability returned by the official `dreamina user_credit`
 * command. Older CLI builds may omit `vip_level`; keep that state unknown so
 * callers can fail closed instead of treating an unverified account as VIP.
 */
export function inspectDreaminaVipAccess(payload) {
  const candidates = [payload, payload?.data, payload?.result].filter(
    (value) => value && typeof value === 'object' && !Array.isArray(value),
  );
  const account = candidates.find((value) =>
    Object.prototype.hasOwnProperty.call(value, 'vip_level'),
  );
  if (!account) return;
  const value = account.vip_level;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return;
    return value > 0;
  }
  if (typeof value !== 'string') return;
  const level = value.trim().toLowerCase();
  if (!level || ['0', 'false', 'free', 'none', 'non-vip', 'non_vip', 'normal'].includes(level)) {
    return false;
  }
  if (/^[1-9]\d*$/.test(level)) return true;
  if (/^(?:s?vip)(?:[-_ ]?(?:level[-_ ]?)?[1-9]\d*)?$/.test(level)) return true;
}

export function jimengVideoModelsForVipAccess(hasVipAccess) {
  return hasVipAccess === true ? [...JIMENG_VIDEO_MODELS] : [];
}

function nonEmptyText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空。`);
  if (text.includes('\0') || text.length > maxLength)
    throw new Error(`${label}过长或包含非法字符。`);
  return text;
}

function strictInteger(value, label, minimum, maximum) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label}只支持 ${minimum}-${maximum} 的整数。`);
  }
  return number;
}

function cleanReferencePaths(value, maximum, label = '即梦参考图') {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label}必须是本机文件路径数组。`);
  if (value.length > maximum) throw new Error(`${label}最多支持 ${maximum} 个。`);
  return value.map((item) => nonEmptyText(item, `${label}路径`, 4096));
}

function normalizedRatio(value, supported) {
  const ratio = String(value ?? '').trim();
  if (!ratio || /^(?:auto|自动)$/i.test(ratio)) return '16:9';
  if (!supported.has(ratio)) throw new Error(`即梦不支持画幅比例 ${ratio}。`);
  return ratio;
}

function imageResolution(value, model) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return '2k';
  // “standard” is the canvas' legacy default rather than a Dreamina CLI
  // resolution. Map it to the lowest resolution accepted by the selected
  // model so an untouched node does not submit an invalid 1K request to 4.x/5.0.
  if (normalized === 'standard') {
    return model === '3.0' || model === '3.1' || model === '5.0Pro' ? '1k' : '2k';
  }
  if (['1k', '2k', '4k'].includes(normalized)) return normalized;
  const size = /^(\d{2,5})x(\d{2,5})$/.exec(normalized);
  if (!size) throw new Error(`即梦不支持图片清晰度 ${String(value)}。`);
  const longest = Math.max(Number(size[1]), Number(size[2]));
  if (longest <= 2016) return '1k';
  if (longest <= 3072) return '2k';
  if (longest <= 6240) return '4k';
  throw new Error(`即梦不支持图片尺寸 ${String(value)}。`);
}

function validateImageResolution(model, resolution) {
  const supported =
    model === '3.0' || model === '3.1'
      ? new Set(['1k', '2k'])
      : model === '5.0Pro'
        ? new Set(['1k', '2k', '4k'])
        : new Set(['2k', '4k']);
  if (!supported.has(resolution)) {
    throw new Error(`即梦图片模型 ${model} 不支持 ${resolution.toUpperCase()} 清晰度。`);
  }
}

function videoResolution(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'auto') return '720p';
  if (!['480p', '720p', '1080p', '4k'].includes(normalized)) {
    throw new Error(`即梦不支持视频清晰度 ${String(value)}。`);
  }
  return normalized;
}

function validateVideoResolution(model, resolution) {
  const supported =
    model === 'seedance2.5'
      ? new Set(['480p', '720p'])
      : model === 'seedance2.0_vip'
        ? new Set(['720p', '1080p', '4k'])
        : new Set(['720p']);
  if (!supported.has(resolution)) {
    throw new Error(`即梦视频模型 ${model} 不支持 ${resolution.toUpperCase()} 清晰度。`);
  }
}

function videoMode(value, referenceCount) {
  const requested = String(value ?? '')
    .trim()
    .toLowerCase();
  const aliases = new Map([
    ['文生视频', 'text2video'],
    ['text2video', 'text2video'],
    ['text-to-video', 'text2video'],
    ['图生视频', 'image2video'],
    ['image2video', 'image2video'],
    ['image-to-video', 'image2video'],
    ['first-frame', 'image2video'],
    ['首尾帧', 'frames2video'],
    ['首尾帧视频', 'frames2video'],
    ['frames2video', 'frames2video'],
    ['both-frames', 'frames2video'],
    ['全能参考', 'multimodal2video'],
    ['多模态', 'multimodal2video'],
    ['多模态视频', 'multimodal2video'],
    ['multimodal2video', 'multimodal2video'],
    ['ref2video', 'multimodal2video'],
    ['图片参考', 'multimodal2video'],
  ]);
  if (requested) {
    const resolved = aliases.get(requested);
    if (!resolved) throw new Error(`即梦不支持视频模式 ${String(value)}。`);
    return resolved;
  }
  if (referenceCount === 0) return 'text2video';
  if (referenceCount === 1) return 'image2video';
  if (referenceCount === 2) return 'frames2video';
  return 'multimodal2video';
}

export function buildJimengImageCommand(input) {
  const model = nonEmptyText(input?.model, '即梦图片模型', 40);
  if (!IMAGE_MODEL_SET.has(model)) throw new Error(`即梦不支持图片模型 ${model}。`);
  const prompt = nonEmptyText(input?.prompt, '即梦图片提示词', 12000);
  const references = cleanReferencePaths(input?.referencePaths, 10);
  if (references.length && !IMAGE_TO_IMAGE_MODEL_SET.has(model)) {
    throw new Error(`即梦图片模型 ${model} 不支持图生图。`);
  }
  const ratio = normalizedRatio(input?.aspectRatio, IMAGE_RATIOS);
  const resolution = imageResolution(input?.resolution, model);
  validateImageResolution(model, resolution);
  const count = strictInteger(input?.count ?? 1, '即梦图片数量', 1, 10);
  const command = references.length ? 'image2image' : 'text2image';
  const args = references.map((path) => `--images=${path}`);
  args.push(
    `--prompt=${prompt}`,
    `--ratio=${ratio}`,
    `--resolution_type=${resolution}`,
    `--model_version=${model}`,
    `--generate_num=${count}`,
    '--poll=0',
  );
  return { command, args, expectedCount: count };
}

export function buildJimengVideoCommand(input) {
  const model = nonEmptyText(input?.model, '即梦视频模型', 60);
  if (!VIDEO_MODEL_SET.has(model)) throw new Error(`即梦不支持视频模型 ${model}。`);
  const maximumReferences = model === 'seedance2.5' ? 30 : 9;
  const maximumAudioReferences = model === 'seedance2.5' ? 10 : 3;
  const references = cleanReferencePaths(input?.referencePaths, maximumReferences);
  const audioReferences = cleanReferencePaths(
    input?.referenceAudioPaths,
    maximumAudioReferences,
    '即梦参考音频',
  );
  strictInteger(input?.count ?? 1, '即梦视频数量', 1, 1);
  if (input?.fps !== undefined && input?.fps !== null && String(input.fps).trim()) {
    strictInteger(input.fps, '视频帧率', 1, 120);
    throw new Error('即梦官方 CLI 不支持自定义输出帧率，请清空 FPS 后再生成。');
  }
  const command = videoMode(input?.mode, references.length + audioReferences.length);
  const rawPrompt = String(input?.prompt ?? '').trim();
  const prompt =
    command === 'multimodal2video'
      ? rawPrompt
        ? nonEmptyText(rawPrompt, '即梦视频提示词', 12000)
        : ''
      : nonEmptyText(rawPrompt, '即梦视频提示词', 12000);
  if (command === 'text2video' && (references.length !== 0 || audioReferences.length !== 0)) {
    throw new Error('即梦文生视频不能携带参考图或参考音频。');
  }
  if (command === 'image2video' && (references.length !== 1 || audioReferences.length !== 0)) {
    throw new Error('即梦图生视频必须且只能提供 1 张参考图。');
  }
  if (command === 'frames2video' && (references.length !== 2 || audioReferences.length !== 0)) {
    throw new Error('即梦首尾帧视频必须且只能提供 2 张参考图。');
  }
  if (command === 'multimodal2video') {
    const totalReferences = references.length + audioReferences.length;
    const maximumTotal = model === 'seedance2.5' ? 50 : 12;
    if (totalReferences < 1) throw new Error('即梦全能参考至少需要 1 个参考素材。');
    if (totalReferences > maximumTotal) {
      throw new Error(`即梦模型 ${model} 最多支持 ${maximumTotal} 个多模态参考素材。`);
    }
    if (model !== 'seedance2.5' && references.length < 1) {
      throw new Error(`即梦模型 ${model} 的全能参考至少需要 1 张参考图，不能只提供音频。`);
    }
  }
  const duration = strictInteger(
    input?.duration ?? 5,
    '即梦视频时长',
    4,
    model === 'seedance2.5' ? 30 : 15,
  );
  const resolution = videoResolution(input?.resolution);
  validateVideoResolution(model, resolution);
  const ratio = normalizedRatio(input?.aspectRatio, VIDEO_RATIOS);
  const args = [];
  if (command === 'text2video') args.push(`--ratio=${ratio}`);
  if (command === 'image2video') args.push(`--image=${references[0]}`);
  if (command === 'frames2video') {
    args.push(`--first=${references[0]}`, `--last=${references[1]}`);
  }
  if (command === 'multimodal2video') {
    for (const path of references) args.push(`--image=${path}`);
    for (const path of audioReferences) args.push(`--audio=${path}`);
    args.push(`--ratio=${ratio}`);
  }
  if (prompt) args.push(`--prompt=${prompt}`);
  args.push(
    `--duration=${duration}`,
    `--video_resolution=${resolution}`,
    `--model_version=${model}`,
    '--poll=0',
  );
  return { command, args, expectedCount: 1 };
}

function decodedJsonString(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length > 2_000_000 || (!text.startsWith('{') && !text.startsWith('['))) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function walkPayload(value, visitor, seen = new WeakSet(), parentKey = '') {
  const decoded = decodedJsonString(value);
  if (decoded !== null) {
    walkPayload(decoded, visitor, seen, parentKey);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkPayload(item, visitor, seen, parentKey);
    return;
  }
  if (!value || typeof value !== 'object') {
    visitor(parentKey, value);
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    visitor(key.toLowerCase(), item);
    walkPayload(item, visitor, seen, key.toLowerCase());
  }
}

function validSubmitId(value) {
  const id = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{6,128}$/.test(id) ? id : '';
}

export function extractDreaminaSubmitId(payload) {
  let submitId = '';
  walkPayload(payload, (key, value) => {
    if (submitId) return;
    if (key === 'submit_id' || key === 'submitid') submitId = validSubmitId(value);
    if (key === 'submit_ids' && Array.isArray(value)) {
      submitId = value.map(validSubmitId).find(Boolean) || '';
    }
  });
  if (!submitId) throw new Error('即梦 CLI 未返回有效 submit_id，已停止且不会自动重新提交。');
  return submitId;
}

function isMediaSource(value, kind) {
  const source = String(value ?? '').trim();
  if (!source || source.length > 16000) return '';
  if (/^https?:\/\//i.test(source) || /^file:\/\//i.test(source)) return source;
  if (kind === 'image' && /^data:image\//i.test(source)) return source;
  if (kind === 'video' && /^data:video\//i.test(source)) return source;
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith('/')) return source;
  return '';
}

function taskResultPayload(value, seen = new WeakSet()) {
  const decoded = decodedJsonString(value);
  if (decoded !== null) return taskResultPayload(decoded, seen);
  if (!value || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'gen_status')) {
    return value;
  }
  const preferred = !Array.isArray(value)
    ? ['data', 'result', 'output'].map((key) => value[key]).filter(Boolean)
    : [];
  for (const item of [...preferred, ...Object.values(value)]) {
    const found = taskResultPayload(item, seen);
    if (found) return found;
  }
  return null;
}

function dreaminaResultJson(payload) {
  const task = taskResultPayload(payload);
  const raw = task?.result_json;
  return decodedJsonString(raw) ?? (raw && typeof raw === 'object' ? raw : null);
}

export function collectDreaminaMediaItems(payload, kind) {
  if (kind !== 'image' && kind !== 'video') throw new Error('即梦结果类型无效。');
  const resultJson = dreaminaResultJson(payload);
  const values = resultJson?.[kind === 'image' ? 'images' : 'videos'];
  if (!Array.isArray(values)) return [];
  const urlKey = kind === 'image' ? 'image_url' : 'video_url';
  return values
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      path: isMediaSource(item.path, kind),
      url: isMediaSource(item[urlKey], kind),
    }))
    .filter((item) => item.path || item.url);
}

export function collectDreaminaMediaSources(payload, kind) {
  const exactItems = collectDreaminaMediaItems(payload, kind);
  if (exactItems.length) {
    return [...new Set(exactItems.flatMap((item) => [item.path, item.url]).filter(Boolean))];
  }

  // Compatibility fallback for older wrappers which flattened result_json.
  // The bridge never uses this recursive list to decide task completion.
  const keys = kind === 'image' ? IMAGE_SOURCE_KEYS : VIDEO_SOURCE_KEYS;
  const sources = [];
  walkPayload(payload, (key, value) => {
    if (!keys.has(key) || (value && typeof value === 'object')) return;
    const source = isMediaSource(value, kind);
    if (source) sources.push(source);
  });
  return [...new Set(sources)];
}

export function inspectDreaminaQueryResult(payload, kind) {
  const sources = collectDreaminaMediaSources(payload, kind);
  const task = taskResultPayload(payload);
  const officialStatus = String(task?.gen_status ?? '')
    .trim()
    .toLowerCase();
  const officialMessages = task
    ? [task.fail_reason, task.guidance, task.message]
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    : [];
  if (officialStatus) {
    if (ERROR_STATUSES.has(officialStatus)) {
      return {
        state: 'error',
        sources: [],
        message: officialMessages.join('；') || `即梦任务状态为 ${officialStatus}。`,
      };
    }
    if (SUCCESS_STATUSES.has(officialStatus)) {
      return sources.length
        ? { state: 'success', sources, message: officialMessages.join('；') }
        : {
            state: 'error',
            sources: [],
            message: '即梦任务已成功，但 query_result 未返回可保存的媒体结果。',
          };
    }
    // Queueing / SubmitOk / Thinking / querying are non-terminal even if the
    // payload already happens to expose a provisional URL.
    return { state: 'pending', sources: [], message: officialMessages.join('；') };
  }

  const statuses = [];
  const messages = [];
  walkPayload(payload, (key, value) => {
    if (STATUS_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')) {
      statuses.push(String(value).trim().toLowerCase());
    }
    if (MESSAGE_KEYS.has(key) && typeof value === 'string' && value.trim()) {
      messages.push(value.trim());
    }
  });
  const failed = statuses.find((status) => ERROR_STATUSES.has(status));
  if (failed) {
    return {
      state: 'error',
      sources: [],
      message: messages[0] || `即梦任务状态为 ${failed}。`,
    };
  }
  const succeeded = statuses.find((status) => SUCCESS_STATUSES.has(status));
  if (succeeded) {
    return sources.length
      ? { state: 'success', sources, message: messages[0] || '' }
      : {
          state: 'error',
          sources: [],
          message: '即梦任务已成功，但 query_result 未返回可保存的媒体结果。',
        };
  }
  return { state: 'pending', sources: [], message: messages[0] || '' };
}
