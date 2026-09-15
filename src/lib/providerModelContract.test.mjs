import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDiscoveredProviderModel,
  classifyProviderAddressLiteral,
  groupProviderModelPayloads,
  partitionProviderModelSettlements,
  providerTransportErrorMessage,
  providerModelIds,
  providerModelTargets,
  readLimitedProviderJson,
  safeProviderRemoteUrl,
  settleProviderModelDiscovery,
  shouldRetryProviderModelFetch,
} from './providerModelContract.mjs';

test('blocks private and reserved address literals even over HTTPS while preserving loopback', () => {
  const blocked = [
    'https://10.0.0.1/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://192.168.1.8/v1',
    'https://198.18.0.84/v1',
    'https://198.51.100.8/v1',
    'https://[fc00::1]/v1',
    'https://[fe80::1]/v1',
    'https://[2001:db8::1]/v1',
    'https://[::ffff:10.0.0.1]/v1',
  ];
  blocked.forEach((url) =>
    assert.throws(() => safeProviderRemoteUrl(url, '模型目录地址'), /私网或保留地址/),
  );

  assert.equal(safeProviderRemoteUrl('http://127.0.0.2:8000/v1').hostname, '127.0.0.2');
  assert.equal(safeProviderRemoteUrl('http://[::1]:8000/v1').hostname, '[::1]');
  assert.equal(safeProviderRemoteUrl('http://localhost:8000/v1').hostname, 'localhost');
  assert.equal(safeProviderRemoteUrl('https://api.openai.com/v1').hostname, 'api.openai.com');
  assert.throws(() => safeProviderRemoteUrl('http://8.8.8.8/v1'), /必须使用 HTTPS/);
  assert.throws(() => safeProviderRemoteUrl('https://user:secret@example.com/v1'), /用户名或密码/);
});

test('classifies public, loopback, private, mapped, and hostname forms', () => {
  assert.equal(classifyProviderAddressLiteral('127.255.1.2'), 'loopback');
  assert.equal(classifyProviderAddressLiteral('[::1]'), 'loopback');
  assert.equal(classifyProviderAddressLiteral('[::ffff:7f00:1]'), 'loopback');
  assert.equal(classifyProviderAddressLiteral('100.64.0.1'), 'blocked');
  assert.equal(classifyProviderAddressLiteral('198.18.0.84'), 'proxy-fake');
  assert.equal(classifyProviderAddressLiteral('[64:ff9b::a00:1]'), 'blocked');
  assert.equal(classifyProviderAddressLiteral('8.8.8.8'), 'public');
  assert.equal(classifyProviderAddressLiteral('[2606:4700:4700::1111]'), 'public');
  assert.equal(classifyProviderAddressLiteral('models.example.com'), 'hostname');
});

test('reads model JSON as a bounded stream and cancels once the actual body exceeds the limit', async () => {
  const encoder = new TextEncoder();
  const parsed = await readLimitedProviderJson(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"data":'));
          controller.enqueue(encoder.encode('[{"id":"gpt-5.4"}]}'));
          controller.close();
        },
      }),
    ),
    128,
    '模型目录',
  );
  assert.deepEqual(parsed, { data: [{ id: 'gpt-5.4' }] });

  let cancelled = false;
  let reads = 0;
  const oversized = new Response(
    new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(readLimitedProviderJson(oversized, 12, '模型目录'), /模型目录超过大小限制/);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test('rejects an oversized declared body before reading it', async () => {
  const response = new Response('{"data":[]}', { headers: { 'content-length': '2097153' } });
  await assert.rejects(readLimitedProviderJson(response, 2 * 1024 * 1024, '模型目录'), /大小限制/);
});

test('partitions xAI typed endpoint settlements without discarding successful catalogs', () => {
  const targets = providerModelTargets('https://api.x.ai', 'xai');
  const chat = { kind: 'chat', payload: { models: [{ id: 'grok-4.5' }] } };
  const video = { kind: 'video', payload: { models: [{ id: 'grok-imagine-video' }] } };
  assert.deepEqual(
    partitionProviderModelSettlements(targets, [
      { status: 'fulfilled', value: chat },
      { status: 'rejected', reason: new Error('HTTP 404') },
      { status: 'fulfilled', value: video },
    ]),
    {
      payloads: [chat, video],
      failures: [{ kind: 'image', message: 'HTTP 404' }],
    },
  );
});

test('preserves nested fetch failure diagnostics and retries transport failures only', () => {
  const cause = Object.assign(new Error('connect ETIMEDOUT'), {
    code: 'ETIMEDOUT',
    syscall: 'connect',
    address: '203.0.113.8',
    port: 443,
  });
  const error = new TypeError('fetch failed', { cause });
  assert.match(providerTransportErrorMessage(error), /fetch failed.*ETIMEDOUT.*203\.0\.113\.8:443/);
  assert.equal(shouldRetryProviderModelFetch(error), true);
  assert.equal(shouldRetryProviderModelFetch(new Error('上游返回 HTTP 401')), false);
  assert.equal(shouldRetryProviderModelFetch(new SyntaxError('invalid JSON')), false);
});

test('builds official xAI typed model endpoints without duplicating v1', () => {
  assert.deepEqual(providerModelTargets('https://api.x.ai/', 'xai'), [
    { kind: 'chat', url: 'https://api.x.ai/v1/language-models' },
    { kind: 'image', url: 'https://api.x.ai/v1/image-generation-models' },
    { kind: 'video', url: 'https://api.x.ai/v1/video-generation-models' },
  ]);
  assert.equal(
    providerModelTargets('https://api.x.ai/v1', 'xai')[0].url,
    'https://api.x.ai/v1/language-models',
  );
});

test('builds DeepSeek, Volcengine, and OpenAI-compatible model endpoints', () => {
  assert.deepEqual(providerModelTargets('https://api.deepseek.com', 'deepseek'), [
    { kind: 'mixed', url: 'https://api.deepseek.com/models' },
  ]);
  assert.deepEqual(
    providerModelTargets('https://ark.cn-beijing.volces.com/api/v3/', 'volcengine'),
    [{ kind: 'mixed', url: 'https://ark.cn-beijing.volces.com/api/v3/models' }],
  );
  assert.deepEqual(providerModelTargets('https://api.openai.com/v1/', 'openai'), [
    { kind: 'mixed', url: 'https://api.openai.com/v1/models' },
  ]);
  assert.throws(
    () => providerModelTargets('https://legacy.invalid', 'runninghub'),
    /不支持远程模型目录/,
  );
});

test('authenticates ModelScope before requesting its public model catalog', async () => {
  const attemptedUrls = [];
  await assert.rejects(
    settleProviderModelDiscovery(
      'https://api-inference.modelscope.cn/v1',
      'modelscope',
      'invalid-test-key',
      async (target) => {
        attemptedUrls.push(target.url);
        if (target.kind === 'authentication') throw new Error('HTTP 401');
        return { kind: target.kind, payload: { data: [] } };
      },
    ),
    /ModelScope API Key 鉴权失败：HTTP 401/,
  );
  assert.deepEqual(attemptedUrls, ['https://modelscope.cn/openapi/v1/users/me']);
});

test('rejects an empty ModelScope key and only settles catalogs after successful authentication', async () => {
  let fetchCount = 0;
  await assert.rejects(
    settleProviderModelDiscovery(
      'https://api-inference.modelscope.cn/v1',
      'modelscope',
      '   ',
      async () => {
        fetchCount += 1;
      },
    ),
    /需要 API Key/,
  );
  assert.equal(fetchCount, 0);

  const attemptedKinds = [];
  const result = await settleProviderModelDiscovery(
    'https://api-inference.modelscope.cn/v1',
    'modelscope',
    'valid-test-key',
    async (target) => {
      attemptedKinds.push(target.kind);
      return { kind: target.kind, payload: { data: [] } };
    },
  );
  assert.deepEqual(attemptedKinds, ['authentication', 'mixed']);
  assert.deepEqual(result.targets, [
    { kind: 'mixed', url: 'https://api-inference.modelscope.cn/v1/models' },
  ]);
  assert.equal(result.settlements[0]?.status, 'fulfilled');
});

test('parses official OpenAI-style data envelopes without coercing unsafe IDs', () => {
  const tooLong = `m${'x'.repeat(200)}`;
  assert.deepEqual(
    providerModelIds({
      object: 'list',
      data: [
        { id: 'gpt-5.4', object: 'model', owned_by: 'openai' },
        { id: 'models/gemini-3.1-pro' },
        { id: 'Qwen/Qwen3-235B-A22B' },
        { id: 'gpt-5.4' },
        { id: 123 },
        { name: 'bad model with spaces' },
        { model: 'bad\nmodel' },
        { id: tooLong },
      ],
    }),
    ['gpt-5.4', 'gemini-3.1-pro', 'Qwen/Qwen3-235B-A22B'],
  );
});

test('parses the official xAI models envelope and the supported list envelope', () => {
  assert.deepEqual(
    providerModelIds({ models: [{ id: 'grok-4.5' }, { id: 'grok-imagine-image' }] }),
    ['grok-4.5', 'grok-imagine-image'],
  );
  assert.deepEqual(providerModelIds({ list: ['glm-5.0', { name: 'deepseek-v4-pro' }] }), [
    'glm-5.0',
    'deepseek-v4-pro',
  ]);
});

test('filters non-generation model families and classifies known media models', () => {
  const ignored = [
    'text-embedding-3-large',
    'omni-moderation-latest',
    'whisper-1',
    'speech-to-text-v2',
    'seed-asr-2.0',
    'bge-reranker-v2-m3',
    'gpt-realtime-1.5',
  ];
  ignored.forEach((model) => assert.equal(classifyDiscoveredProviderModel(model), null));
  assert.equal(classifyDiscoveredProviderModel('gpt-image-2'), 'image');
  assert.equal(classifyDiscoveredProviderModel('doubao-seedream-5-0'), 'image');
  assert.equal(classifyDiscoveredProviderModel('grok-imagine-video'), 'video');
  assert.equal(classifyDiscoveredProviderModel('doubao-seedance-2-0'), 'video');
  assert.equal(classifyDiscoveredProviderModel('doubao-seed-music'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('doubao-seed-tts-2.0'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('gpt-4o-audio-preview'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('gpt-4o-mini-tts'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('seed-audio-1.0'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('deepseek-v4-pro'), 'chat');
  assert.equal(classifyDiscoveredProviderModel('unclassified-foundation-v1'), null);
});

test('aggregates official xAI typed payloads without misclassifying vision-capable chat models', () => {
  const grouped = groupProviderModelPayloads([
    {
      kind: 'chat',
      payload: {
        models: [
          { id: 'grok-4.5', input_modalities: ['text', 'image'], output_modalities: ['text'] },
          { id: 'grok-4.5' },
          { id: 'future-language-model' },
        ],
      },
    },
    { kind: 'image', payload: { models: [{ id: 'grok-imagine-image' }] } },
    { kind: 'video', payload: { models: [{ id: 'grok-imagine-video' }] } },
  ]);
  assert.deepEqual(grouped, {
    chat: ['grok-4.5', 'future-language-model'],
    image: ['grok-imagine-image'],
    video: ['grok-imagine-video'],
    audio: [],
  });
});

test('classifies mixed model lists while dropping unsupported families', () => {
  const grouped = groupProviderModelPayloads([
    {
      kind: 'mixed',
      payload: {
        data: [
          { id: 'deepseek-v4-flash' },
          { id: 'gpt-image-2' },
          { id: 'sora-2' },
          { id: 'doubao-seed-music' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' },
          { id: 'unclassified-foundation-v1' },
        ],
      },
    },
  ]);
  assert.deepEqual(grouped, {
    chat: ['deepseek-v4-flash'],
    image: ['gpt-image-2'],
    video: ['sora-2'],
    audio: ['doubao-seed-music'],
  });
});
