import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertActiveProvider,
  assertActiveProviderProtocol,
} from './bridge-provider-lifecycle.mjs';

test('rejects the retired RunningHub protocol before any provider request can be sent', () => {
  assert.throws(() => assertActiveProviderProtocol('runninghub'), /接口已移除/);
  assert.throws(() => assertActiveProviderProtocol(' RUNNINGHUB '), /接口已移除/);
});

test('keeps active provider protocols available', () => {
  assert.equal(assertActiveProviderProtocol(' openai '), 'openai');
  assert.equal(assertActiveProviderProtocol('volcengine'), 'volcengine');
  assert.equal(assertActiveProviderProtocol(' VOLCENGINE-CLI '), 'volcengine-cli');
});

test('retires the old Ark CLI identity and protocol while keeping Volcengine CLI active', () => {
  assert.throws(() => assertActiveProviderProtocol('ark-cli'), /接口已移除/);
  assert.throws(() => assertActiveProviderProtocol(' ARK-CLI '), /接口已移除/);
  assert.throws(
    () => assertActiveProvider({ providerId: 'ark-cli', protocol: 'openai' }),
    /接口已移除/,
  );
  assert.throws(
    () => assertActiveProvider({ providerId: 'custom-cli', protocol: 'ark-cli' }),
    /接口已移除/,
  );
  assert.equal(
    assertActiveProvider({ providerId: 'volcengine-cli', protocol: 'volcengine-cli' }),
    'volcengine-cli',
  );
});

test('rejects the retired DALL-E provider identity without blocking GPT Image', () => {
  assert.throws(
    () => assertActiveProvider({ providerId: 'img-dalle', protocol: 'openai' }),
    /接口已移除/,
  );
  assert.throws(
    () => assertActiveProvider({ id: ' IMG-DALLE ', protocol: 'openai' }),
    /接口已移除/,
  );
  assert.equal(assertActiveProvider({ providerId: 'img-gptimage', protocol: 'openai' }), 'openai');
});

test('rejects the retired generic image provider without blocking official OpenAI image adapters', () => {
  assert.throws(
    () => assertActiveProvider({ providerId: 'img-generic', protocol: 'openai' }),
    /接口已移除/,
  );
  assert.throws(
    () => assertActiveProvider({ id: ' IMG-GENERIC ', protocol: 'openai' }),
    /接口已移除/,
  );
  assert.equal(assertActiveProvider({ providerId: 'img-flux', protocol: 'openai' }), 'openai');
});
