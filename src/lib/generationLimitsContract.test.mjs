import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GENERATION_LIMITS,
  isNormalizedGenerationLimits,
  normalizeGenerationLimit,
  normalizeGenerationLimits,
} from './generationLimitsContract.mjs';

test('generation limits keep the requested safe defaults', () => {
  assert.deepEqual(DEFAULT_GENERATION_LIMITS, {
    requestRateLimit: 3_000,
    generationConcurrency: 5,
    uploadConcurrency: 2,
    updateConcurrency: 1,
    imageBatchSize: 20,
    imageGenerationConcurrency: 5,
    videoGenerationConcurrency: 5,
  });
  assert.equal(isNormalizedGenerationLimits(DEFAULT_GENERATION_LIMITS), true);
});

test('generation limits clamp finite integers and reject malformed values', () => {
  assert.equal(normalizeGenerationLimit('requestRateLimit', 99_999), 20_000);
  assert.equal(normalizeGenerationLimit('generationConcurrency', -5), 1);
  assert.equal(normalizeGenerationLimit('imageBatchSize', 18.6), 19);
  assert.equal(normalizeGenerationLimit('videoGenerationConcurrency', 99), 5);
  assert.equal(normalizeGenerationLimit('uploadConcurrency', '3'), 2);
  assert.deepEqual(normalizeGenerationLimits(null), DEFAULT_GENERATION_LIMITS);
  assert.equal(
    isNormalizedGenerationLimits({ ...DEFAULT_GENERATION_LIMITS, updateConcurrency: 9 }),
    false,
  );
});
