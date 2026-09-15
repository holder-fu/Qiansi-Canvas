import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDiscoveredProviderModel,
  groupProviderModelPayloads,
  providerModelIds,
  providerModelTargets,
} from './provider-model-contract.mjs';

test('builds provider-specific model catalog endpoints without changing the base host', () => {
  assert.deepEqual(providerModelTargets('https://api.x.ai/v1', 'xai'), {
    chat: 'https://api.x.ai/v1/language-models',
    image: 'https://api.x.ai/v1/image-generation-models',
    video: 'https://api.x.ai/v1/video-generation-models',
  });
  assert.deepEqual(providerModelTargets('https://api.deepseek.com', 'deepseek'), {
    all: 'https://api.deepseek.com/models',
  });
  assert.deepEqual(providerModelTargets('https://example.test/v1', 'openai'), {
    all: 'https://example.test/v1/models',
  });
  assert.throws(
    () => providerModelTargets('https://legacy.invalid', 'runninghub'),
    /Unsupported provider model protocol/,
  );
});

test('normalizes official and OpenAI-compatible model list shapes safely', () => {
  assert.deepEqual(
    providerModelIds({
      data: [
        { id: 'gpt-5.6-sol' },
        { id: 'models/gpt-image-2' },
        { id: 'bad model id' },
        { id: 'gpt-5.6-sol' },
      ],
    }),
    ['gpt-5.6-sol', 'gpt-image-2'],
  );
});

test('filters non-generation catalogs instead of exposing them as chat models', () => {
  assert.equal(classifyDiscoveredProviderModel('text-embedding-3-large'), null);
  assert.equal(classifyDiscoveredProviderModel('omni-moderation-latest'), null);
  assert.equal(classifyDiscoveredProviderModel('gpt-realtime-2'), null);
  assert.equal(classifyDiscoveredProviderModel('whisper-1'), null);
  assert.equal(classifyDiscoveredProviderModel('seed-asr-2.0'), null);
  assert.equal(classifyDiscoveredProviderModel('gpt-image-2'), 'image');
  assert.equal(classifyDiscoveredProviderModel('doubao-seed-music'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('gpt-4o-mini-tts'), 'audio');
  assert.equal(classifyDiscoveredProviderModel('deepseek-chat'), 'chat');

  assert.deepEqual(
    groupProviderModelPayloads('openai', {
      all: {
        data: [
          { id: 'deepseek-chat' },
          { id: 'gpt-image-2' },
          { id: 'doubao-seed-music' },
          { id: 'text-embedding-3-large' },
        ],
      },
    }),
    {
      chatModels: ['deepseek-chat'],
      imageModels: ['gpt-image-2'],
      videoModels: [],
      audioModels: ['doubao-seed-music'],
    },
  );
});

test('trusts xAI capability-specific catalogs instead of guessing from model names', () => {
  assert.deepEqual(
    groupProviderModelPayloads('xai', {
      chat: { data: [{ id: 'grok-4.5' }] },
      image: { data: [{ id: 'grok-imagine-image' }] },
      video: { data: [{ id: 'grok-imagine-video' }] },
    }),
    {
      chatModels: ['grok-4.5'],
      imageModels: ['grok-imagine-image'],
      videoModels: ['grok-imagine-video'],
      audioModels: [],
    },
  );
});
