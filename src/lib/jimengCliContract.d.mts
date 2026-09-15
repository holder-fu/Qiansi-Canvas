export const JIMENG_IMAGE_MODELS: readonly string[];
export const JIMENG_VIDEO_MODELS: readonly string[];
export const JIMENG_VIP_VIDEO_MODELS: readonly string[];
export const JIMENG_MODEL_DISPLAY_NAMES: Readonly<Record<string, string>>;

export function inspectDreaminaVipAccess(payload: unknown): boolean | undefined;
export function jimengVideoModelsForVipAccess(hasVipAccess: boolean | undefined): string[];

export type JimengCommand = {
  command: string;
  args: string[];
  expectedCount: number;
};

export function buildJimengImageCommand(input: {
  model: unknown;
  prompt: unknown;
  referencePaths?: unknown;
  aspectRatio?: unknown;
  resolution?: unknown;
  count?: unknown;
}): JimengCommand;

export function buildJimengVideoCommand(input: {
  model: unknown;
  prompt: unknown;
  referencePaths?: unknown;
  referenceAudioPaths?: unknown;
  mode?: unknown;
  aspectRatio?: unknown;
  resolution?: unknown;
  duration?: unknown;
  count?: unknown;
  fps?: unknown;
}): JimengCommand;

export function extractDreaminaSubmitId(payload: unknown): string;
export function collectDreaminaMediaItems(
  payload: unknown,
  kind: 'image' | 'video',
): Array<{ path: string; url: string }>;
export function collectDreaminaMediaSources(payload: unknown, kind: 'image' | 'video'): string[];
export function inspectDreaminaQueryResult(
  payload: unknown,
  kind: 'image' | 'video',
): { state: 'pending' | 'success' | 'error'; sources: string[]; message: string };
