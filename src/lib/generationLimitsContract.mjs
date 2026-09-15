export const GENERATION_LIMIT_KEYS = Object.freeze([
  'requestRateLimit',
  'generationConcurrency',
  'uploadConcurrency',
  'updateConcurrency',
  'imageBatchSize',
  'imageGenerationConcurrency',
  'videoGenerationConcurrency',
]);

export const DEFAULT_GENERATION_LIMITS = Object.freeze({
  requestRateLimit: 3_000,
  generationConcurrency: 5,
  uploadConcurrency: 2,
  updateConcurrency: 1,
  imageBatchSize: 20,
  imageGenerationConcurrency: 5,
  videoGenerationConcurrency: 5,
});

export const GENERATION_LIMIT_RANGES = Object.freeze({
  requestRateLimit: Object.freeze({ min: 600, max: 20_000 }),
  generationConcurrency: Object.freeze({ min: 1, max: 20 }),
  uploadConcurrency: Object.freeze({ min: 1, max: 4 }),
  updateConcurrency: Object.freeze({ min: 1, max: 2 }),
  imageBatchSize: Object.freeze({ min: 1, max: 50 }),
  imageGenerationConcurrency: Object.freeze({ min: 1, max: 20 }),
  videoGenerationConcurrency: Object.freeze({ min: 1, max: 5 }),
});

export function normalizeGenerationLimit(key, value) {
  const range = GENERATION_LIMIT_RANGES[key];
  const fallback = DEFAULT_GENERATION_LIMITS[key];
  if (!range || typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

export function normalizeGenerationLimits(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    GENERATION_LIMIT_KEYS.map((key) => [key, normalizeGenerationLimit(key, source[key])]),
  );
}

export function isNormalizedGenerationLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const normalized = normalizeGenerationLimits(value);
  return GENERATION_LIMIT_KEYS.every((key) => normalized[key] === value[key]);
}
