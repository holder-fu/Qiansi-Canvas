import test from 'node:test';
import assert from 'node:assert/strict';
import { imageApiAdapter, imageProviderRoute } from './bridge-image-routing.mjs';

test('routes local CLI image requests through their native bridge adapters', () => {
  assert.equal(imageProviderRoute('codex'), 'codex-cli');
  assert.equal(imageProviderRoute('codebuddy'), 'codebuddy-cli');
});

test('selects each official remote image adapter from the stable provider identity', () => {
  assert.equal(imageApiAdapter('img-recraft', 'openai'), 'recraft');
  assert.equal(imageApiAdapter('img-ideogram', 'openai'), 'ideogram-v4');
  assert.equal(imageApiAdapter('img-flux', 'openai'), 'bfl');
  assert.equal(imageApiAdapter('img-imagen', 'openai'), 'imagen');
  assert.equal(imageApiAdapter('img-minimax', 'openai'), 'minimax');
  assert.equal(imageApiAdapter('img-doubao', 'volcengine'), 'volcengine');
  assert.equal(imageApiAdapter('img-grok', 'xai'), 'xai');
  assert.equal(imageApiAdapter('img-gptimage', 'openai'), 'openai-gpt-image');
});

test('keeps unimplemented APIs out of the generic OpenAI adapter', () => {
  assert.equal(imageApiAdapter('img-kling', 'openai'), 'unsupported-kling');
  assert.equal(imageApiAdapter('modelscope', 'modelscope'), 'unsupported-modelscope');
});

test('keeps Jimeng and OpenAI-compatible image providers on their dedicated routes', () => {
  assert.equal(imageProviderRoute('jimeng'), 'jimeng-cli');
  assert.equal(imageProviderRoute('bailian'), 'bailian-cli');
  assert.equal(imageProviderRoute('lightx2v'), 'lightx2v-cli');
  assert.equal(imageProviderRoute('openai'), 'openai-compatible');
  assert.equal(imageProviderRoute('volcengine'), 'openai-compatible');
});
