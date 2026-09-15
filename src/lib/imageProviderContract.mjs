const MAX_PROMPT_LENGTH = 32_000;
const MAX_MODEL_LENGTH = 160;
const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_MEDIA_URL_LENGTH = 20_000;
const MAX_BASE64_LENGTH = 96 * 1024 * 1024;

// OpenAI's GPT Image family shares these stable standard sizes. GPT Image 2 also accepts
// constrained arbitrary dimensions, but using the common enum keeps saved canvas sizes
// compatible with both generation and edit requests across the GPT Image family.
const OPENAI_GPT_IMAGE_SIZES = Object.freeze(['1024x1024', '1536x1024', '1024x1536']);

const RECRAFT_ASPECT_RATIOS = Object.freeze([
  '1:1',
  '2:1',
  '1:2',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '6:10',
  '14:10',
  '10:14',
  '16:9',
  '9:16',
]);

const RECRAFT_V4_SIZES = Object.freeze([
  '1024x1024',
  '1536x768',
  '768x1536',
  '1280x832',
  '832x1280',
  '1216x896',
  '896x1216',
  '1152x896',
  '896x1152',
  '832x1344',
  '1280x896',
  '896x1280',
  '1344x768',
  '768x1344',
]);

const RECRAFT_V4_PRO_SIZES = Object.freeze([
  '2048x2048',
  '3072x1536',
  '1536x3072',
  '2560x1664',
  '1664x2560',
  '2432x1792',
  '1792x2432',
  '2304x1792',
  '1792x2304',
  '1664x2688',
  '2560x1792',
  '1792x2560',
  '2688x1536',
  '1536x2688',
]);

const RECRAFT_V2_V3_SIZES = Object.freeze([
  '1024x1024',
  '2048x1024',
  '1024x2048',
  '1536x1024',
  '1024x1536',
  '1365x1024',
  '1024x1365',
  '1280x1024',
  '1024x1280',
  '1024x1707',
  '1434x1024',
  '1024x1434',
  '1820x1024',
  '1024x1820',
]);

// Ideogram 4's hosted generate endpoint accepts a documented, fixed 2K
// resolution enum. Canvas presets such as 1024x576 and 2048x1152 are display
// sizes rather than API enum values, so map them to the closest supported
// resolution while preserving orientation and aspect ratio.
const IDEOGRAM_V4_SIZES = Object.freeze([
  '2048x2048',
  '1440x2880',
  '2880x1440',
  '1664x2496',
  '2496x1664',
  '1792x2240',
  '2240x1792',
  '1440x2560',
  '2560x1440',
  '1600x2560',
  '2560x1600',
  '1728x2304',
  '2304x1728',
  '1296x3168',
  '3168x1296',
  '1152x2944',
  '2944x1152',
  '1248x3328',
  '3328x1248',
  '1280x3072',
  '3072x1280',
]);

export const IMAGE_PROVIDER_ADAPTER_KINDS = Object.freeze([
  'openai-gpt-image',
  'recraft',
  'ideogram-v4',
  'ideogram-v3',
  'bfl',
  'imagen',
  'minimax',
  'volcengine',
  'xai',
]);

const ADAPTER_ALIASES = Object.freeze({
  openai: 'openai-gpt-image',
  'gpt-image': 'openai-gpt-image',
  'openai-gpt-image': 'openai-gpt-image',
  recraft: 'recraft',
  ideogram: 'ideogram-v4',
  'ideogram-v4': 'ideogram-v4',
  'ideogram-v3': 'ideogram-v3',
  bfl: 'bfl',
  flux: 'bfl',
  imagen: 'imagen',
  minimax: 'minimax',
  volc: 'volcengine',
  volcengine: 'volcengine',
  xai: 'xai',
});

function frozenCapabilities(value) {
  return Object.freeze({
    ...value,
    requestBodyKinds: Object.freeze([...value.requestBodyKinds]),
    resultFormats: Object.freeze([...value.resultFormats]),
  });
}

function frozenContract(value) {
  return Object.freeze({
    ...value,
    authHeaders: Object.freeze([...value.authHeaders]),
    capabilities: frozenCapabilities(value.capabilities),
  });
}

const CONTRACTS = Object.freeze({
  'openai-gpt-image': frozenContract({
    adapterKind: 'openai-gpt-image',
    defaultGenerationEndpoint: '/v1/images/generations',
    defaultEditEndpoint: '/v1/images/edits',
    authHeaders: ['Authorization'],
    capabilities: {
      textToImage: true,
      imageToImage: true,
      maxReferenceImages: 16,
      asynchronous: false,
      requestBodyKinds: ['json', 'multipart'],
      resultFormats: ['url', 'base64'],
    },
  }),
  recraft: frozenContract({
    adapterKind: 'recraft',
    defaultGenerationEndpoint: '/v1/images/generations',
    defaultEditEndpoint: '/v1/images/imageToImage',
    authHeaders: ['Authorization'],
    capabilities: {
      textToImage: true,
      imageToImage: true,
      maxReferenceImages: 1,
      asynchronous: false,
      requestBodyKinds: ['json', 'multipart'],
      resultFormats: ['url', 'base64'],
    },
  }),
  'ideogram-v4': frozenContract({
    adapterKind: 'ideogram-v4',
    defaultGenerationEndpoint: '/v1/ideogram-v4/generate',
    defaultEditEndpoint: '',
    authHeaders: ['Api-Key'],
    capabilities: {
      textToImage: true,
      imageToImage: false,
      maxReferenceImages: 0,
      asynchronous: false,
      requestBodyKinds: ['multipart'],
      resultFormats: ['url'],
    },
  }),
  'ideogram-v3': frozenContract({
    adapterKind: 'ideogram-v3',
    defaultGenerationEndpoint: '/v1/ideogram-v3/generate',
    defaultEditEndpoint: '',
    authHeaders: ['Api-Key'],
    capabilities: {
      textToImage: true,
      imageToImage: false,
      maxReferenceImages: 0,
      asynchronous: false,
      requestBodyKinds: ['multipart'],
      resultFormats: ['url'],
    },
  }),
  bfl: frozenContract({
    adapterKind: 'bfl',
    defaultGenerationEndpoint: '/v1/{model}',
    defaultEditEndpoint: '',
    authHeaders: ['x-key'],
    capabilities: {
      textToImage: true,
      imageToImage: false,
      maxReferenceImages: 0,
      asynchronous: true,
      requestBodyKinds: ['json'],
      resultFormats: ['url'],
    },
  }),
  imagen: frozenContract({
    adapterKind: 'imagen',
    defaultGenerationEndpoint:
      '/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predict',
    defaultEditEndpoint: '',
    authHeaders: ['Authorization', 'x-goog-api-key'],
    capabilities: {
      textToImage: true,
      imageToImage: false,
      maxReferenceImages: 0,
      asynchronous: false,
      requestBodyKinds: ['json'],
      resultFormats: ['base64'],
    },
  }),
  minimax: frozenContract({
    adapterKind: 'minimax',
    defaultGenerationEndpoint: '/v1/image_generation',
    defaultEditEndpoint: '/v1/image_generation',
    authHeaders: ['Authorization'],
    capabilities: {
      textToImage: true,
      imageToImage: true,
      maxReferenceImages: 1,
      asynchronous: false,
      requestBodyKinds: ['json'],
      resultFormats: ['base64'],
    },
  }),
  volcengine: frozenContract({
    adapterKind: 'volcengine',
    defaultGenerationEndpoint: '/api/v3/images/generations',
    defaultEditEndpoint: '/api/v3/images/generations',
    authHeaders: ['Authorization'],
    capabilities: {
      textToImage: true,
      imageToImage: true,
      maxReferenceImages: 10,
      asynchronous: false,
      requestBodyKinds: ['json'],
      resultFormats: ['url', 'base64'],
    },
  }),
  xai: frozenContract({
    adapterKind: 'xai',
    defaultGenerationEndpoint: '/v1/images/generations',
    defaultEditEndpoint: '/v1/images/edits',
    authHeaders: ['Authorization'],
    capabilities: {
      textToImage: true,
      imageToImage: true,
      maxReferenceImages: 1,
      asynchronous: false,
      requestBodyKinds: ['json'],
      resultFormats: ['url'],
    },
  }),
});

function adapterKind(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  const kind = ADAPTER_ALIASES[key];
  if (!kind) throw new Error(`不支持图片适配器 ${String(value ?? '') || '（空）'}。`);
  return kind;
}

export function imageProviderContract(value) {
  return CONTRACTS[adapterKind(value)];
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}必须是对象。`);
  }
  return value;
}

function requiredText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空。`);
  if (text.includes('\0') || text.length > maxLength)
    throw new Error(`${label}过长或包含非法字符。`);
  return text;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return '';
  return requiredText(value, label, maxLength);
}

function strictInteger(value, label, minimum, maximum) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label}只支持 ${minimum}-${maximum} 的整数。`);
  }
  return number;
}

function strictNumber(value, label, minimum, maximum) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label}必须在 ${minimum}-${maximum} 之间。`);
  }
  return number;
}

function requestInput(value, maximumCount) {
  const input = objectValue(value, '图片请求');
  return {
    input,
    model: requiredText(input.model, '图片模型', MAX_MODEL_LENGTH),
    prompt: requiredText(input.prompt, '图片提示词', MAX_PROMPT_LENGTH),
    count: strictInteger(input.count ?? 1, '图片数量', 1, maximumCount),
    size: optionalText(input.size, '图片尺寸', 80),
    aspectRatio: optionalText(input.aspectRatio, '图片比例', 20),
  };
}

function referenceImages(value, maximum) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('参考图必须是数组。');
  if (value.length > maximum) throw new Error(`当前图片适配器最多支持 ${maximum} 张参考图。`);
  return value.map((item, index) =>
    requiredText(item, `第 ${index + 1} 张参考图`, MAX_MEDIA_URL_LENGTH),
  );
}

function endpointOverride(value, fallback) {
  return optionalText(value, '图片接口路径', MAX_ENDPOINT_LENGTH) || fallback;
}

function sizeDimensions(value) {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value);
  if (!match) throw new Error('BFL 图片尺寸必须是 WIDTHxHEIGHT。');
  const width = strictInteger(match[1], 'BFL 图片宽度', 64, 16_384);
  const height = strictInteger(match[2], 'BFL 图片高度', 64, 16_384);
  return { width, height };
}

function parseDimensionPair(value, separatorPattern = 'x') {
  const match = new RegExp(`^(\\d{1,5})${separatorPattern}(\\d{1,5})$`, 'i').exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function dimensionsOrientation({ width, height }) {
  if (width === height) return 0;
  return width > height ? 1 : -1;
}

function nearestSupportedValue(dimensions, values, separatorPattern, label) {
  const candidates = values
    .map((value) => ({ value, dimensions: parseDimensionPair(value, separatorPattern) }))
    .filter((candidate) => candidate.dimensions !== null);
  const orientation = dimensionsOrientation(dimensions);
  const oriented = candidates.filter(
    (candidate) => dimensionsOrientation(candidate.dimensions) === orientation,
  );
  const available = oriented.length ? oriented : candidates;
  if (!available.length) throw new Error(`${label}没有可用尺寸。`);
  const targetRatio = dimensions.width / dimensions.height;
  return available.reduce(
    (best, candidate) => {
      const candidateRatio = candidate.dimensions.width / candidate.dimensions.height;
      const score = Math.abs(Math.log(candidateRatio / targetRatio));
      return score < best.score ? { value: candidate.value, score } : best;
    },
    { value: available[0].value, score: Number.POSITIVE_INFINITY },
  ).value;
}

function openAiImageSize(value) {
  if (!value) return '';
  if (value.toLowerCase() === 'auto') return 'auto';
  const dimensions = parseDimensionPair(value);
  if (!dimensions) throw new Error('OpenAI GPT Image 尺寸必须是 WIDTHxHEIGHT 或 auto。');
  return nearestSupportedValue(dimensions, OPENAI_GPT_IMAGE_SIZES, 'x', 'OpenAI GPT Image');
}

function recraftSizeValues(model) {
  const normalizedModel = model.toLowerCase();
  if (normalizedModel.includes('vector')) return RECRAFT_ASPECT_RATIOS;
  if (normalizedModel.startsWith('recraftv4')) {
    return normalizedModel.includes('_pro') ? RECRAFT_V4_PRO_SIZES : RECRAFT_V4_SIZES;
  }
  if (normalizedModel.startsWith('recraftv2') || normalizedModel.startsWith('recraftv3')) {
    return RECRAFT_V2_V3_SIZES;
  }
  return RECRAFT_V4_SIZES;
}

function recraftImageSize(value, model) {
  if (!value) return '';
  const supported = recraftSizeValues(model);
  if (supported.includes(value) || RECRAFT_ASPECT_RATIOS.includes(value)) return value;
  const ratioDimensions = parseDimensionPair(value, ':');
  if (ratioDimensions) {
    return nearestSupportedValue(ratioDimensions, RECRAFT_ASPECT_RATIOS, ':', 'Recraft');
  }
  const dimensions = parseDimensionPair(value);
  if (!dimensions) throw new Error('Recraft 图片尺寸必须是 WIDTHxHEIGHT 或 w:h。');
  const separatorPattern = supported === RECRAFT_ASPECT_RATIOS ? ':' : 'x';
  return nearestSupportedValue(dimensions, supported, separatorPattern, 'Recraft');
}

function buildOpenAiRequest(input) {
  const normalized = requestInput(input, 10);
  const references = referenceImages(input.referenceImages, 16);
  const size = openAiImageSize(normalized.size);
  if (!references.length) {
    return {
      operation: 'generate',
      request: {
        method: 'POST',
        endpoint: endpointOverride(
          input.endpoint,
          CONTRACTS['openai-gpt-image'].defaultGenerationEndpoint,
        ),
        bodyKind: 'json',
        body: {
          model: normalized.model,
          prompt: normalized.prompt,
          n: normalized.count,
          ...(size ? { size } : {}),
        },
      },
    };
  }
  return {
    operation: 'edit',
    request: {
      method: 'POST',
      endpoint: endpointOverride(
        input.editEndpoint,
        CONTRACTS['openai-gpt-image'].defaultEditEndpoint,
      ),
      bodyKind: 'multipart',
      fields: {
        model: normalized.model,
        prompt: normalized.prompt,
        n: String(normalized.count),
        ...(size ? { size } : {}),
      },
      files: references.map((source) => ({ field: 'image[]', source })),
    },
  };
}

function buildRecraftRequest(input) {
  const normalized = requestInput(input, 6);
  const references = referenceImages(input.referenceImages, 1);
  const size = recraftImageSize(normalized.size, normalized.model);
  if (!references.length) {
    return {
      operation: 'generate',
      request: {
        method: 'POST',
        endpoint: endpointOverride(input.endpoint, CONTRACTS.recraft.defaultGenerationEndpoint),
        bodyKind: 'json',
        body: {
          model: normalized.model,
          prompt: normalized.prompt,
          n: normalized.count,
          response_format: 'url',
          ...(size ? { size } : {}),
        },
      },
    };
  }
  return {
    operation: 'edit',
    request: {
      method: 'POST',
      endpoint: endpointOverride(input.editEndpoint, CONTRACTS.recraft.defaultEditEndpoint),
      bodyKind: 'multipart',
      fields: {
        model: normalized.model,
        prompt: normalized.prompt,
        strength: String(strictNumber(input.strength ?? 0.5, 'Recraft 相似度', 0, 1)),
        n: String(normalized.count),
        response_format: 'url',
        ...(size ? { size } : {}),
      },
      files: [{ field: 'image', source: references[0] }],
    },
  };
}

function buildIdeogramV4Request(input) {
  const normalized = requestInput(input, 1);
  referenceImages(input.referenceImages, 0);
  const renderingSpeed = optionalText(input.renderingSpeed, 'Ideogram rendering_speed', 20);
  const dimensions = normalized.size ? parseDimensionPair(normalized.size) : null;
  const resolution = dimensions
    ? nearestSupportedValue(dimensions, IDEOGRAM_V4_SIZES, 'x', 'Ideogram 4')
    : '';
  return {
    operation: 'generate',
    request: {
      method: 'POST',
      endpoint: endpointOverride(
        input.endpoint,
        CONTRACTS['ideogram-v4'].defaultGenerationEndpoint,
      ),
      bodyKind: 'multipart',
      fields: {
        text_prompt: normalized.prompt,
        ...(resolution ? { resolution } : {}),
        ...(renderingSpeed ? { rendering_speed: renderingSpeed } : {}),
      },
      files: [],
    },
  };
}

function buildIdeogramV3Request(input) {
  const normalized = requestInput(input, 8);
  referenceImages(input.referenceImages, 0);
  const renderingSpeed = optionalText(input.renderingSpeed, 'Ideogram rendering_speed', 20);
  return {
    operation: 'generate',
    request: {
      method: 'POST',
      endpoint: endpointOverride(
        input.endpoint,
        CONTRACTS['ideogram-v3'].defaultGenerationEndpoint,
      ),
      bodyKind: 'multipart',
      fields: {
        prompt: normalized.prompt,
        num_images: String(normalized.count),
        ...(normalized.aspectRatio
          ? { aspect_ratio: normalized.aspectRatio }
          : normalized.size
            ? { resolution: normalized.size }
            : {}),
        ...(renderingSpeed ? { rendering_speed: renderingSpeed } : {}),
      },
      files: [],
    },
  };
}

function buildBflRequest(input) {
  const normalized = requestInput(input, 1);
  referenceImages(input.referenceImages, 0);
  const dimensions = normalized.size
    ? sizeDimensions(normalized.size)
    : {
        width: strictInteger(input.width ?? 1024, 'BFL 图片宽度', 64, 16_384),
        height: strictInteger(input.height ?? 1024, 'BFL 图片高度', 64, 16_384),
      };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(normalized.model)) {
    throw new Error('BFL 模型名不能安全地放入接口路径。');
  }
  return {
    operation: 'generate',
    request: {
      method: 'POST',
      endpoint: endpointOverride(input.endpoint, `/v1/${normalized.model}`),
      bodyKind: 'json',
      body: { prompt: normalized.prompt, ...dimensions },
    },
  };
}

function buildImagenRequest(input) {
  const normalized = requestInput(input, 4);
  referenceImages(input.referenceImages, 0);
  const endpoint = requiredText(input.endpoint, 'Imagen predict 接口', MAX_ENDPOINT_LENGTH);
  if (!/:predict(?:\?.*)?$/.test(endpoint)) throw new Error('Imagen 接口必须以 :predict 结尾。');
  return {
    operation: 'generate',
    request: {
      method: 'POST',
      endpoint,
      bodyKind: 'json',
      body: {
        instances: [{ prompt: normalized.prompt }],
        parameters: {
          sampleCount: normalized.count,
          ...(normalized.aspectRatio ? { aspectRatio: normalized.aspectRatio } : {}),
        },
      },
    },
  };
}

function buildMinimaxRequest(input) {
  const normalized = requestInput(input, 9);
  const references = referenceImages(input.referenceImages, 1);
  const body = {
    model: normalized.model,
    prompt: normalized.prompt,
    aspect_ratio: normalized.aspectRatio || '1:1',
    response_format: 'base64',
    n: normalized.count,
  };
  if (references.length) {
    body.subject_reference = [{ type: 'character', image_file: references[0] }];
  }
  return {
    operation: references.length ? 'edit' : 'generate',
    request: {
      method: 'POST',
      endpoint: endpointOverride(input.endpoint, CONTRACTS.minimax.defaultGenerationEndpoint),
      bodyKind: 'json',
      body,
    },
  };
}

function buildVolcengineRequest(input) {
  const normalized = requestInput(input, 1);
  const references = referenceImages(input.referenceImages, 10);
  return {
    operation: references.length ? 'edit' : 'generate',
    request: {
      method: 'POST',
      endpoint: endpointOverride(input.endpoint, CONTRACTS.volcengine.defaultGenerationEndpoint),
      bodyKind: 'json',
      body: {
        model: normalized.model,
        prompt: normalized.prompt,
        ...(normalized.size ? { size: normalized.size } : {}),
        ...(references.length ? { image: references } : {}),
      },
    },
  };
}

function buildXaiRequest(input) {
  const normalized = requestInput(input, 10);
  const references = referenceImages(input.referenceImages, 1);
  if (!references.length) {
    return {
      operation: 'generate',
      request: {
        method: 'POST',
        endpoint: endpointOverride(input.endpoint, CONTRACTS.xai.defaultGenerationEndpoint),
        bodyKind: 'json',
        body: {
          model: normalized.model,
          prompt: normalized.prompt,
          response_format: 'url',
          n: normalized.count,
        },
      },
    };
  }
  return {
    operation: 'edit',
    request: {
      method: 'POST',
      endpoint: endpointOverride(input.editEndpoint, CONTRACTS.xai.defaultEditEndpoint),
      bodyKind: 'json',
      body: {
        model: normalized.model,
        prompt: normalized.prompt,
        image: { url: references[0], type: 'image_url' },
      },
    },
  };
}

const REQUEST_BUILDERS = Object.freeze({
  'openai-gpt-image': buildOpenAiRequest,
  recraft: buildRecraftRequest,
  'ideogram-v4': buildIdeogramV4Request,
  'ideogram-v3': buildIdeogramV3Request,
  bfl: buildBflRequest,
  imagen: buildImagenRequest,
  minimax: buildMinimaxRequest,
  volcengine: buildVolcengineRequest,
  xai: buildXaiRequest,
});

export function buildImageProviderRequest(value, input) {
  const kind = adapterKind(value);
  const built = REQUEST_BUILDERS[kind](objectValue(input, '图片请求'));
  return {
    adapterKind: kind,
    capabilities: CONTRACTS[kind].capabilities,
    ...built,
  };
}

function strictHttpsUrl(value, label) {
  const text = requiredText(value, label, MAX_MEDIA_URL_LENGTH);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label}不是有效 URL。`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label}必须是无内嵌凭据的 HTTPS URL。`);
  }
  return url.toString();
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function strictMimeType(value, fallback) {
  const mime = String(value ?? fallback)
    .trim()
    .toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mime))
    throw new Error(`上游返回了不支持的图片 MIME：${mime || '空'}。`);
  return mime;
}

function strictBase64DataUrl(value, mimeType) {
  const encoded = requiredText(value, '上游图片 Base64', MAX_BASE64_LENGTH);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('上游返回了无效的图片 Base64。');
  }
  const padding = (4 - (encoded.length % 4)) % 4;
  return `data:${strictMimeType(mimeType, 'image/png')};base64,${encoded}${'='.repeat(padding)}`;
}

function strictOutputItem(value, fallbackMime, allowedFormats) {
  const item = objectValue(value, '上游图片结果项');
  const url = typeof item.url === 'string' && item.url.trim() ? item.url : '';
  const base64 = typeof item.b64_json === 'string' && item.b64_json.trim() ? item.b64_json : '';
  if (Boolean(url) === Boolean(base64)) {
    throw new Error('上游图片结果项必须且只能包含 url 或 b64_json。');
  }
  if (url) {
    if (!allowedFormats.includes('url')) throw new Error('当前图片适配器不接受 URL 结果。');
    return strictHttpsUrl(url, '上游图片 URL');
  }
  if (!allowedFormats.includes('base64')) throw new Error('当前图片适配器不接受 Base64 结果。');
  return strictBase64DataUrl(base64, item.mime_type || fallbackMime);
}

function strictDataArray(payload, fallbackMime, allowedFormats) {
  const object = objectValue(payload, '上游图片响应');
  if (!Array.isArray(object.data) || !object.data.length)
    throw new Error('上游未返回 data 图片数组。');
  return object.data.map((item) => strictOutputItem(item, fallbackMime, allowedFormats));
}

function parseBflResponse(payload, phase) {
  const object = objectValue(payload, 'BFL 响应');
  if (phase === 'submit') {
    const taskId = requiredText(object.id, 'BFL 任务 ID', 128);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(taskId)) throw new Error('BFL 返回了无效任务 ID。');
    return {
      state: 'submitted',
      taskId,
      pollingUrl: strictHttpsUrl(object.polling_url, 'BFL polling_url'),
      images: [],
    };
  }
  if (phase !== 'poll') throw new Error('BFL 响应 phase 只支持 submit 或 poll。');
  const status = requiredText(object.status, 'BFL 任务状态', 80).toLowerCase();
  if (['pending', 'reasoning', 'generating'].includes(status)) {
    return { state: 'pending', taskId: String(object.id ?? '').trim(), images: [] };
  }
  if (status === 'request moderated') {
    throw new Error('BFL 图片请求未通过内容审核，任务已终止。');
  }
  if (status === 'content moderated') {
    throw new Error('BFL 生成结果未通过内容审核，任务已终止。');
  }
  if (status === 'ready') {
    const result = objectValue(object.result, 'BFL 任务结果');
    return {
      state: 'success',
      taskId: String(object.id ?? '').trim(),
      images: [strictHttpsUrl(result.sample, 'BFL result.sample')],
    };
  }
  if (status === 'error' || status === 'failed') {
    const detail = optionalText(object.error || object.message, 'BFL 错误信息', 500);
    throw new Error(detail || `BFL 图片任务状态为 ${status}。`);
  }
  throw new Error(`BFL 返回了未知任务状态 ${status}。`);
}

function parseImagenResponse(payload) {
  const object = objectValue(payload, 'Imagen 响应');
  if (!Array.isArray(object.predictions) || !object.predictions.length) {
    throw new Error('Imagen 未返回 predictions 图片数组。');
  }
  return object.predictions.map((value) => {
    const prediction = objectValue(value, 'Imagen prediction');
    return strictBase64DataUrl(
      prediction.bytesBase64Encoded,
      strictMimeType(prediction.mimeType, 'image/png'),
    );
  });
}

function parseMinimaxResponse(payload) {
  const object = objectValue(payload, 'MiniMax 响应');
  const statusCode = object.base_resp?.status_code;
  if (statusCode !== undefined && Number(statusCode) !== 0) {
    throw new Error(
      optionalText(object.base_resp?.status_msg, 'MiniMax 错误信息', 500) ||
        'MiniMax 图片任务失败。',
    );
  }
  const data = objectValue(object.data, 'MiniMax data');
  const base64Items = data.image_base64;
  if (!Array.isArray(base64Items) || !base64Items.length) {
    throw new Error('MiniMax 未返回 data.image_base64 图片数组。');
  }
  return base64Items.map((value) => strictBase64DataUrl(value, 'image/jpeg'));
}

export function parseImageProviderResponse(value, payload, options = {}) {
  const kind = adapterKind(value);
  if (kind === 'bfl') return { adapterKind: kind, ...parseBflResponse(payload, options.phase) };

  let images;
  if (kind === 'imagen') images = parseImagenResponse(payload);
  else if (kind === 'minimax') images = parseMinimaxResponse(payload);
  else {
    images = strictDataArray(
      payload,
      kind === 'xai' ? 'image/jpeg' : 'image/png',
      CONTRACTS[kind].capabilities.resultFormats,
    );
  }

  return { adapterKind: kind, state: 'success', images };
}
