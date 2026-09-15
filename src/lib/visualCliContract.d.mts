export const BAILIAN_IMAGE_MODELS: string[];
export const BAILIAN_VIDEO_MODELS: string[];
export const LIGHTX2V_IMAGE_MODELS: string[];
export const LIGHTX2V_VIDEO_MODELS: string[];
export const VISUAL_CLI_MODEL_DISPLAY_NAMES: Record<string, string>;

export function bailianImageArgs(options: {
  model?: string;
  prompt: string;
  referencePaths?: string[];
  size?: string;
  count?: number;
  outputDirectory: string;
}): string[];

export function bailianVideoArgs(options: {
  model?: string;
  prompt: string;
  referencePath?: string;
  duration?: number;
  aspectRatio?: string;
  outputPath: string;
}): string[];
