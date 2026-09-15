export type GenerationLimitKey =
  | 'requestRateLimit'
  | 'generationConcurrency'
  | 'uploadConcurrency'
  | 'updateConcurrency'
  | 'imageBatchSize'
  | 'imageGenerationConcurrency'
  | 'videoGenerationConcurrency';

export type GenerationLimitsShape = Record<GenerationLimitKey, number>;

export const GENERATION_LIMIT_KEYS: readonly GenerationLimitKey[];
export const DEFAULT_GENERATION_LIMITS: Readonly<GenerationLimitsShape>;
export const GENERATION_LIMIT_RANGES: Readonly<
  Record<GenerationLimitKey, Readonly<{ min: number; max: number }>>
>;

export function normalizeGenerationLimit(key: GenerationLimitKey, value: unknown): number;
export function normalizeGenerationLimits(value: unknown): GenerationLimitsShape;
export function isNormalizedGenerationLimits(value: unknown): value is GenerationLimitsShape;
