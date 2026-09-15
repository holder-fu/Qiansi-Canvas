import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_PROVIDER_ADAPTER_KINDS,
  buildImageProviderRequest,
  imageProviderContract,
  parseImageProviderResponse,
} from './imageProviderContract.mjs';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD';

test('publishes explicit adapter kinds and immutable capability metadata', () => {
  assert.deepEqual(IMAGE_PROVIDER_ADAPTER_KINDS, [
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
  assert.equal(imageProviderContract('gpt-image').adapterKind, 'openai-gpt-image');
  assert.equal(imageProviderContract('ideogram').adapterKind, 'ideogram-v4');
  assert.deepEqual(imageProviderContract('bfl').capabilities, {
    textToImage: true,
    imageToImage: false,
    maxReferenceImages: 0,
    asynchronous: true,
    requestBodyKinds: ['json'],
    resultFormats: ['url'],
  });
  assert.equal(Object.isFrozen(imageProviderContract('bfl').capabilities), true);
});

test('builds OpenAI GPT Image generation JSON and parses strict base64 results', () => {
  const spec = buildImageProviderRequest('openai', {
    model: 'gpt-image-2',
    prompt: 'A small lighthouse',
    count: 2,
    size: '1024x1024',
  });
  assert.deepEqual(spec, {
    adapterKind: 'openai-gpt-image',
    capabilities: imageProviderContract('openai').capabilities,
    operation: 'generate',
    request: {
      method: 'POST',
      endpoint: '/v1/images/generations',
      bodyKind: 'json',
      body: {
        model: 'gpt-image-2',
        prompt: 'A small lighthouse',
        n: 2,
        size: '1024x1024',
      },
    },
  });
  assert.deepEqual(parseImageProviderResponse('openai', { data: [{ b64_json: PNG_BASE64 }] }), {
    adapterKind: 'openai-gpt-image',
    state: 'success',
    images: [`data:image/png;base64,${PNG_BASE64}`],
  });
});

test('describes OpenAI GPT Image multipart edits without constructing FormData', () => {
  const spec = buildImageProviderRequest('gpt-image', {
    model: 'gpt-image-2',
    prompt: 'Add a red scarf',
    referenceImages: ['https://assets.example.test/one.png', 'https://assets.example.test/two.png'],
  });
  assert.equal(spec.operation, 'edit');
  assert.equal(spec.request.endpoint, '/v1/images/edits');
  assert.equal(spec.request.bodyKind, 'multipart');
  assert.deepEqual(spec.request.files, [
    { field: 'image[]', source: 'https://assets.example.test/one.png' },
    { field: 'image[]', source: 'https://assets.example.test/two.png' },
  ]);
});

test('maps arbitrary canvas dimensions to orientation-safe GPT Image standard sizes', () => {
  const landscape = buildImageProviderRequest('openai', {
    model: 'gpt-image-2',
    prompt: 'Landscape',
    size: '2048x1152',
  });
  const portrait = buildImageProviderRequest('openai', {
    model: 'gpt-image-2',
    prompt: 'Portrait',
    size: '900x1600',
    referenceImages: ['https://assets.example.test/input.png'],
  });
  const square = buildImageProviderRequest('openai', {
    model: 'gpt-image-2',
    prompt: 'Square',
    size: '2048x2048',
  });

  assert.equal(landscape.request.body.size, '1536x1024');
  assert.equal(portrait.request.fields.size, '1024x1536');
  assert.equal(square.request.body.size, '1024x1024');
});

test('keeps Recraft generation and image-to-image on their official endpoints', () => {
  const generation = buildImageProviderRequest('recraft', {
    model: 'recraftv4_1',
    prompt: 'Two race cars',
    size: '16:9',
  });
  assert.deepEqual(generation.request.body, {
    model: 'recraftv4_1',
    prompt: 'Two race cars',
    n: 1,
    response_format: 'url',
    size: '16:9',
  });
  const edit = buildImageProviderRequest('recraft', {
    model: 'recraftv3',
    prompt: 'winter',
    strength: 0.2,
    referenceImages: ['https://assets.example.test/input.png'],
  });
  assert.equal(edit.request.endpoint, '/v1/images/imageToImage');
  assert.equal(edit.request.bodyKind, 'multipart');
  assert.deepEqual(edit.request.files, [
    { field: 'image', source: 'https://assets.example.test/input.png' },
  ]);
  assert.deepEqual(
    parseImageProviderResponse('recraft', {
      data: [{ url: 'https://cdn.example.test/recraft.png' }],
    }).images,
    ['https://cdn.example.test/recraft.png'],
  );
});

test('maps arbitrary canvas dimensions to the selected Recraft model size table', () => {
  const v4 = buildImageProviderRequest('recraft', {
    model: 'recraftv4_1',
    prompt: 'Wide poster',
    size: '1920x1080',
  });
  const v4Pro = buildImageProviderRequest('recraft', {
    model: 'recraftv4_1_pro',
    prompt: 'Tall poster',
    size: '1080x1920',
  });
  const v3 = buildImageProviderRequest('recraft', {
    model: 'recraftv3',
    prompt: 'Classic landscape',
    size: '1600x900',
  });
  const vector = buildImageProviderRequest('recraft', {
    model: 'recraftv4_1_vector',
    prompt: 'Vector banner',
    size: '1920x1080',
  });

  assert.equal(v4.request.body.size, '1344x768');
  assert.equal(v4Pro.request.body.size, '1536x2688');
  assert.equal(v3.request.body.size, '1820x1024');
  assert.equal(vector.request.body.size, '16:9');
});

test('builds the Ideogram v4 multipart contract without legacy v3 fields', () => {
  const spec = buildImageProviderRequest('ideogram', {
    model: 'ideogram-v4',
    prompt: 'A typography poster',
    count: 1,
    size: '2048x1152',
    aspectRatio: '16x9',
    renderingSpeed: 'QUALITY',
  });

  assert.deepEqual(spec.request, {
    method: 'POST',
    endpoint: '/v1/ideogram-v4/generate',
    bodyKind: 'multipart',
    fields: {
      text_prompt: 'A typography poster',
      resolution: '2560x1440',
      rendering_speed: 'QUALITY',
    },
    files: [],
  });
  assert.equal('prompt' in spec.request.fields, false);
  assert.equal('num_images' in spec.request.fields, false);
  assert.equal('aspect_ratio' in spec.request.fields, false);
  assert.throws(
    () =>
      buildImageProviderRequest('ideogram-v4', {
        model: 'ideogram-v4',
        prompt: 'Two posters',
        count: 2,
      }),
    /1-1/,
  );
});

test('keeps the Ideogram v3 multipart field contract as an explicit legacy adapter', () => {
  const spec = buildImageProviderRequest('ideogram-v3', {
    model: 'ideogram-v3',
    prompt: 'A typography poster',
    count: 3,
    aspectRatio: '16x9',
    renderingSpeed: 'TURBO',
  });
  assert.deepEqual(spec.request, {
    method: 'POST',
    endpoint: '/v1/ideogram-v3/generate',
    bodyKind: 'multipart',
    fields: {
      prompt: 'A typography poster',
      num_images: '3',
      aspect_ratio: '16x9',
      rendering_speed: 'TURBO',
    },
    files: [],
  });
  assert.deepEqual(
    parseImageProviderResponse('ideogram', {
      data: [{ url: 'https://ideogram.example.test/temporary.png' }],
    }).images,
    ['https://ideogram.example.test/temporary.png'],
  );
});

test('keeps Ideogram aspect_ratio and resolution mutually exclusive', () => {
  const withAspectRatio = buildImageProviderRequest('ideogram-v3', {
    model: 'ideogram-v3',
    prompt: 'A wide typography poster',
    aspectRatio: '16x9',
    size: '1792x1024',
  });
  const withResolution = buildImageProviderRequest('ideogram-v3', {
    model: 'ideogram-v3',
    prompt: 'A square typography poster',
    size: '1024x1024',
  });

  assert.equal(withAspectRatio.request.fields.aspect_ratio, '16x9');
  assert.equal('resolution' in withAspectRatio.request.fields, false);
  assert.equal(withResolution.request.fields.resolution, '1024x1024');
  assert.equal('aspect_ratio' in withResolution.request.fields, false);
});

test('models the BFL submit and returned polling URL flow', () => {
  const spec = buildImageProviderRequest('flux', {
    model: 'flux-pro-1.1',
    prompt: 'A studio portrait',
    size: '1024x768',
  });
  assert.deepEqual(spec.request, {
    method: 'POST',
    endpoint: '/v1/flux-pro-1.1',
    bodyKind: 'json',
    body: { prompt: 'A studio portrait', width: 1024, height: 768 },
  });
  assert.deepEqual(
    parseImageProviderResponse(
      'bfl',
      {
        id: 'task_123456',
        polling_url: 'https://api.bfl.ai/v1/get_result?id=task_123456',
      },
      { phase: 'submit' },
    ),
    {
      adapterKind: 'bfl',
      state: 'submitted',
      taskId: 'task_123456',
      pollingUrl: 'https://api.bfl.ai/v1/get_result?id=task_123456',
      images: [],
    },
  );
  assert.equal(
    parseImageProviderResponse(
      'bfl',
      { id: 'task_123456', status: 'Generating' },
      { phase: 'poll' },
    ).state,
    'pending',
  );
  assert.deepEqual(
    parseImageProviderResponse(
      'bfl',
      {
        id: 'task_123456',
        status: 'Ready',
        result: { sample: 'https://delivery.eu.bfl.ai/result.png' },
      },
      { phase: 'poll' },
    ).images,
    ['https://delivery.eu.bfl.ai/result.png'],
  );
});

test('treats BFL moderation statuses as terminal failures', () => {
  assert.throws(
    () =>
      parseImageProviderResponse(
        'bfl',
        { id: 'task_123456', status: 'Request Moderated' },
        { phase: 'poll' },
      ),
    /请求未通过内容审核.*已终止/,
  );
  assert.throws(
    () =>
      parseImageProviderResponse(
        'bfl',
        { id: 'task_123456', status: 'Content Moderated' },
        { phase: 'poll' },
      ),
    /生成结果未通过内容审核.*已终止/,
  );
});

test('builds Imagen predict instances and parses predictions base64', () => {
  const endpoint =
    '/v1/projects/demo/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict';
  const spec = buildImageProviderRequest('imagen', {
    model: 'imagen-3.0-generate-002',
    endpoint,
    prompt: 'A natural-light product photo',
    count: 2,
    aspectRatio: '4:3',
  });
  assert.deepEqual(spec.request.body, {
    instances: [{ prompt: 'A natural-light product photo' }],
    parameters: { sampleCount: 2, aspectRatio: '4:3' },
  });
  assert.deepEqual(
    parseImageProviderResponse('imagen', {
      predictions: [{ bytesBase64Encoded: PNG_BASE64, mimeType: 'image/png' }],
    }).images,
    [`data:image/png;base64,${PNG_BASE64}`],
  );
});

test('uses MiniMax aspect_ratio, subject_reference and data.image_base64', () => {
  const spec = buildImageProviderRequest('minimax', {
    model: 'image-01',
    prompt: 'Same character in a library',
    aspectRatio: '16:9',
    referenceImages: ['https://cdn.example.test/character.jpg'],
  });
  assert.deepEqual(spec.request.body, {
    model: 'image-01',
    prompt: 'Same character in a library',
    aspect_ratio: '16:9',
    response_format: 'base64',
    n: 1,
    subject_reference: [
      { type: 'character', image_file: 'https://cdn.example.test/character.jpg' },
    ],
  });
  assert.deepEqual(
    parseImageProviderResponse('minimax', {
      data: { image_base64: [JPEG_BASE64] },
      base_resp: { status_code: 0, status_msg: 'success' },
    }).images,
    [`data:image/jpeg;base64,${JPEG_BASE64}=`],
  );
});

test('keeps Volcengine reference images in the generations JSON body', () => {
  const spec = buildImageProviderRequest('volc', {
    model: 'doubao-seedream-4-0-250828',
    prompt: 'Keep the subject and change the background',
    size: '2K',
    referenceImages: [
      'https://assets.example.test/front.png',
      'https://assets.example.test/style.png',
    ],
  });
  assert.equal(spec.operation, 'edit');
  assert.equal(spec.request.endpoint, '/api/v3/images/generations');
  assert.deepEqual(spec.request.body.image, [
    'https://assets.example.test/front.png',
    'https://assets.example.test/style.png',
  ]);
  assert.deepEqual(
    parseImageProviderResponse('volcengine', {
      data: [{ b64_json: PNG_BASE64, size: '2048x2048' }],
    }).images,
    [`data:image/png;base64,${PNG_BASE64}`],
  );
});

test('builds xAI edits as JSON instead of multipart', () => {
  const spec = buildImageProviderRequest('xai', {
    model: 'grok-imagine-image-quality',
    prompt: 'Render this as a pencil sketch',
    referenceImages: ['https://docs.x.ai/assets/api-examples/images/style-realistic.png'],
  });
  assert.deepEqual(spec.request, {
    method: 'POST',
    endpoint: '/v1/images/edits',
    bodyKind: 'json',
    body: {
      model: 'grok-imagine-image-quality',
      prompt: 'Render this as a pencil sketch',
      image: {
        url: 'https://docs.x.ai/assets/api-examples/images/style-realistic.png',
        type: 'image_url',
      },
    },
  });
  assert.deepEqual(
    parseImageProviderResponse('xai', {
      data: [{ url: 'https://imgen.x.ai/generated.jpeg', mime_type: 'image/jpeg' }],
    }).images,
    ['https://imgen.x.ai/generated.jpeg'],
  );
});

test('rejects ambiguous, insecure and malformed media outputs', () => {
  assert.throws(
    () =>
      parseImageProviderResponse('openai', {
        data: [{ url: 'https://cdn.example.test/image.png', b64_json: PNG_BASE64 }],
      }),
    /必须且只能包含 url 或 b64_json/,
  );
  assert.throws(
    () =>
      parseImageProviderResponse('recraft', { data: [{ url: 'http://cdn.example.test/a.png' }] }),
    /HTTPS URL/,
  );
  assert.throws(
    () => parseImageProviderResponse('minimax', { data: { image_base64: ['not base64!'] } }),
    /无效的图片 Base64/,
  );
});
