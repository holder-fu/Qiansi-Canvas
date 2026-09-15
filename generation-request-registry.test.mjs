import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  GenerationRequestError,
  GenerationRequestRegistry,
  generationRequestFingerprint,
  normalizeGenerationRequestId,
} from './generation-request-registry.mjs';

async function registryFixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-generation-registry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, 'registry.json');
  const registry = new GenerationRequestRegistry({
    filePath,
    outputExists: async () => true,
    ...options,
  });
  await registry.ready;
  return { filePath, registry };
}

test('validates request IDs and canonicalizes the request fingerprint', () => {
  assert.equal(normalizeGenerationRequestId('gen-request_123'), 'gen-request_123');
  assert.throws(() => normalizeGenerationRequestId('short'), GenerationRequestError);
  assert.throws(() => normalizeGenerationRequestId('../unsafe-request'), GenerationRequestError);
  assert.equal(
    generationRequestFingerprint('image', {
      requestId: 'first-request',
      prompt: 'same prompt',
      provider: { model: 'm', apiKey: 'secret' },
    }),
    generationRequestFingerprint('image', {
      provider: { apiKey: 'secret', model: 'm' },
      prompt: 'same prompt',
      requestId: 'second-request',
    }),
  );
  assert.notEqual(
    generationRequestFingerprint('image', { prompt: 'first prompt' }),
    generationRequestFingerprint('image', { prompt: 'second prompt' }),
  );
});

test('single-flights concurrent calls with the same ID and fingerprint', async (t) => {
  const { registry } = await registryFixture(t);
  let calls = 0;
  let release;
  const providerResult = new Promise((resolve) => {
    release = resolve;
  });
  const body = { requestId: 'gen-single-flight', prompt: 'one paid request' };
  const execute = () => {
    calls += 1;
    return providerResult;
  };
  const first = registry.run({ id: body.requestId, kind: 'image', body, execute });
  const second = registry.run({ id: body.requestId, kind: 'image', body, execute });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release({ images: ['/output/generated.webp'], url: '/output/generated.webp' });
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test('exposes bounded in-flight progress without persisting private request data', async (t) => {
  const { registry } = await registryFixture(t);
  let release;
  const running = registry.run({
    id: 'gen-progress-request',
    kind: 'video',
    body: { requestId: 'gen-progress-request', prompt: 'private prompt' },
    execute: async ({ reportProgress }) => {
      reportProgress({ progress: 37, phase: 'executing', nodeId: '12', queueRemaining: 2 });
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(await registry.get('gen-progress-request'), {
    id: 'gen-progress-request',
    kind: 'video',
    status: 'pending',
    completedAt: 0,
    progress: 37,
    phase: 'executing',
    nodeId: '12',
    queueRemaining: 2,
  });
  release({ videos: ['/output/generated.mp4'] });
  await running;
});

test('single-flights and persists recoverable text results', async (t) => {
  const { filePath, registry } = await registryFixture(t);
  const body = {
    requestId: 'gen-text-result',
    prompt: 'private text prompt',
    provider: { apiKey: 'private-text-key', model: 'text-model' },
  };
  let calls = 0;
  const result = await registry.run({
    id: body.requestId,
    kind: 'text',
    body,
    execute: async () => {
      calls += 1;
      return { text: 'detached text result' };
    },
  });
  assert.deepEqual(result, { text: 'detached text result' });
  assert.equal(calls, 1);
  await registry.writeQueue;

  const persisted = await readFile(filePath, 'utf8');
  assert.doesNotMatch(persisted, /private text prompt|private-text-key/);
  const reloaded = new GenerationRequestRegistry({
    filePath,
    outputExists: async (storedResult, kind) =>
      kind === 'text' && typeof storedResult?.text === 'string' && storedResult.text.length > 0,
  });
  await reloaded.ready;
  assert.deepEqual(await reloaded.get(body.requestId), {
    id: body.requestId,
    kind: 'text',
    status: 'complete',
    completedAt: (await reloaded.get(body.requestId)).completedAt,
    result: { text: 'detached text result' },
  });
});

test('redacts structured text prompts from persisted failures', async (t) => {
  const { filePath, registry } = await registryFixture(t);
  const privatePrompt = 'an unreleased private story outline';
  const privateImage = 'data:image/png;base64,private-reference';
  const body = {
    requestId: 'gen-text-private-failure',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: privatePrompt },
          { type: 'image_url', image_url: { url: privateImage } },
        ],
      },
    ],
  };

  await assert.rejects(
    registry.run({
      id: body.requestId,
      kind: 'text',
      body,
      execute: async () => {
        throw new Error(`provider echoed ${privatePrompt} and ${privateImage}`);
      },
    }),
    /provider echoed/,
  );
  await registry.writeQueue;
  const persisted = await readFile(filePath, 'utf8');
  assert.doesNotMatch(persisted, /unreleased private story outline|private-reference/);
  assert.match(persisted, /\[已隐藏\]/);
});

test('rejects reuse of an ID for a different request while in flight', async (t) => {
  const { registry } = await registryFixture(t);
  let release;
  const first = registry.run({
    id: 'gen-conflict-request',
    kind: 'video',
    body: { requestId: 'gen-conflict-request', prompt: 'first' },
    execute: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await assert.rejects(
    registry.run({
      id: 'gen-conflict-request',
      kind: 'video',
      body: { requestId: 'gen-conflict-request', prompt: 'different' },
      execute: () => assert.fail('conflicting request must not call the provider'),
    }),
    (error) => error?.code === 'GENERATION_REQUEST_CONFLICT',
  );
  release({ videos: ['/output/generated.mp4'] });
  await first;
});

test('persists a bounded recovery result without prompt or API key', async (t) => {
  const { filePath, registry } = await registryFixture(t);
  const body = {
    requestId: 'gen-persisted-result',
    prompt: 'private prompt must never be persisted',
    provider: { apiKey: 'private-api-key', model: 'image-model' },
  };
  const expected = { images: ['/output/persisted.webp'], url: '/output/persisted.webp' };
  await registry.run({ id: body.requestId, kind: 'image', body, execute: async () => expected });
  await registry.writeQueue;
  const persisted = await readFile(filePath, 'utf8');
  assert.doesNotMatch(persisted, /private prompt must never be persisted/);
  assert.doesNotMatch(persisted, /private-api-key/);

  let calls = 0;
  const reloaded = new GenerationRequestRegistry({
    filePath,
    outputExists: async () => true,
  });
  await reloaded.ready;
  assert.deepEqual(
    await reloaded.run({
      id: body.requestId,
      kind: 'image',
      body,
      execute: async () => {
        calls += 1;
        return expected;
      },
    }),
    expected,
  );
  assert.equal(calls, 0);
  assert.deepEqual(await reloaded.get(body.requestId), {
    id: body.requestId,
    kind: 'image',
    status: 'complete',
    completedAt: (await reloaded.get(body.requestId)).completedAt,
    result: expected,
  });
});

test('preserves real provider failures and never retries a failed request ID', async (t) => {
  const { filePath, registry } = await registryFixture(t);
  const body = {
    requestId: 'gen-provider-failure',
    prompt: 'private failing prompt',
    provider: { apiKey: 'private-failing-key' },
  };
  let calls = 0;
  const execute = async () => {
    calls += 1;
    throw new Error(`provider rejected the request: ${body.prompt}; key=${body.provider.apiKey}`);
  };
  await assert.rejects(
    registry.run({ id: body.requestId, kind: 'audio', body, execute }),
    /provider rejected the request/,
  );
  await assert.rejects(
    registry.run({ id: body.requestId, kind: 'audio', body, execute }),
    (error) =>
      error?.code === 'GENERATION_REQUEST_FAILED' &&
      /provider rejected the request/.test(error.message),
  );
  assert.equal(calls, 1);
  await registry.writeQueue;
  const persisted = await readFile(filePath, 'utf8');
  assert.doesNotMatch(persisted, /private failing prompt|private-failing-key/);
});

test('persists and recovers completed 3D generation results', async (t) => {
  const { registry } = await registryFixture(t);
  const body = { requestId: 'gen-model-3d-result', prompt: 'single object' };
  const expected = { models3d: ['/output/object.glb'], url: '/output/object.glb' };
  assert.deepEqual(
    await registry.run({
      id: body.requestId,
      kind: '3d',
      body,
      execute: async () => expected,
    }),
    expected,
  );
  assert.deepEqual(await registry.get(body.requestId), {
    id: body.requestId,
    kind: '3d',
    status: 'complete',
    completedAt: (await registry.get(body.requestId)).completedAt,
    result: expected,
  });
});

test('keeps a non-retry tombstone when a completed managed output disappeared', async (t) => {
  const { filePath, registry } = await registryFixture(t);
  const body = { requestId: 'gen-missing-output', prompt: 'missing output' };
  await registry.run({
    id: body.requestId,
    kind: 'video',
    body,
    execute: async () => ({ videos: ['/output/missing.mp4'] }),
  });
  await registry.writeQueue;

  const reloaded = new GenerationRequestRegistry({
    filePath,
    outputExists: async () => false,
  });
  await reloaded.ready;
  assert.deepEqual(await reloaded.get(body.requestId), {
    id: body.requestId,
    kind: 'video',
    status: 'complete',
    completedAt: (await reloaded.get(body.requestId)).completedAt,
    result: { videos: ['/output/missing.mp4'] },
    outputMissing: true,
  });
  let calls = 0;
  await assert.rejects(
    reloaded.run({
      id: body.requestId,
      kind: 'video',
      body,
      execute: async () => {
        calls += 1;
        return { videos: ['/output/replacement.mp4'] };
      },
    }),
    (error) => error?.code === 'GENERATION_OUTPUT_MISSING',
  );
  assert.equal(calls, 0);
});
