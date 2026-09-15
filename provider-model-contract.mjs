const MODEL_ID_RE = /^[\p{L}\p{N}][\p{L}\p{N}._:/-]{0,199}$/u;

/** Build only documented model-catalog endpoints; callers validate the base URL first. */
export function providerModelTargets(baseUrl, protocol) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (protocol === 'xai') {
    const root = /\/v1$/i.test(base) ? base : `${base}/v1`;
    return {
      chat: `${root}/language-models`,
      image: `${root}/image-generation-models`,
      video: `${root}/video-generation-models`,
    };
  }
  if (protocol === 'deepseek') return { all: `${base}/models` };
  if (protocol === 'volcengine') {
    return { all: /\/api\/v3$/i.test(base) ? `${base}/models` : `${base}/api/v3/models` };
  }
  if (protocol !== 'openai' && protocol !== 'modelscope') {
    throw new Error('Unsupported provider model protocol.');
  }
  return { all: /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models` };
}

export function providerModelIds(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const items = Array.isArray(raw.data)
    ? raw.data
    : Array.isArray(raw.models)
      ? raw.models
      : Array.isArray(raw.list)
        ? raw.list
        : [];
  return Array.from(
    new Set(
      items
        .map((item) => {
          if (typeof item === 'string') return item;
          if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
          return String(item.id || item.name || item.model || '');
        })
        .map((item) => item.replace(/^models\//, '').trim())
        .filter((item) => MODEL_ID_RE.test(item)),
    ),
  ).sort();
}

const NON_GENERATION_MODEL_KEYS = [
  'embedding',
  'moderation',
  'realtime',
  'transcrib',
  'whisper',
  'speech-to-text',
  'stt',
  'asr',
  'rerank',
];

const AUDIO_MODEL_KEYS = [
  'audio',
  'music',
  'song',
  'speech',
  'tts',
  'text-to-speech',
  'seed-music',
  'seed-audio',
];

export function classifyDiscoveredProviderModel(model) {
  const value = String(model || '').toLowerCase();
  if (!value || NON_GENERATION_MODEL_KEYS.some((key) => value.includes(key))) return null;
  const videoKeys = [
    'veo',
    'sora',
    'wan2',
    'wanx',
    'seedance',
    'kling',
    'hailuo',
    'video',
    't2v-',
    'i2v-',
    's2v',
  ];
  if (videoKeys.some((key) => value.includes(key))) return 'video';
  const imageKeys = [
    'banana',
    'image',
    'dalle',
    'dall-e',
    'imagen',
    'flux',
    'stable',
    'sdxl',
    'midjourney',
    'ideogram',
    'seedream',
  ];
  if (imageKeys.some((key) => value.includes(key))) return 'image';
  if (AUDIO_MODEL_KEYS.some((key) => value.includes(key))) return 'audio';
  return 'chat';
}

export function groupProviderModelPayloads(protocol, payloads) {
  if (protocol === 'xai') {
    return {
      chatModels: providerModelIds(payloads.chat),
      imageModels: providerModelIds(payloads.image),
      videoModels: providerModelIds(payloads.video),
      audioModels: [],
    };
  }
  const grouped = { chatModels: [], imageModels: [], videoModels: [], audioModels: [] };
  for (const model of providerModelIds(payloads.all)) {
    const kind = classifyDiscoveredProviderModel(model);
    if (kind === 'chat') grouped.chatModels.push(model);
    else if (kind === 'image') grouped.imageModels.push(model);
    else if (kind === 'video') grouped.videoModels.push(model);
    else if (kind === 'audio') grouped.audioModels.push(model);
  }
  return grouped;
}
