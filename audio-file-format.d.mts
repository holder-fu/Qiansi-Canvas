export interface DetectedAudioFileFormat {
  extension: string;
  mime: string;
}

export const AUDIO_ASSET_MIME_EXTENSIONS: ReadonlyMap<string, string>;
export const AUDIO_FILE_SIGNATURE_SCAN_BYTES: number;

export function audioExtensionForMime(mime: unknown): string;
export function hasWebmFileSignature(value: unknown): boolean;
export function isAudioOnlyWebmFile(value: unknown): boolean;
export function detectedAudioFileFormat(value: unknown): DetectedAudioFileFormat | null;
export function detectedAudioFileExtension(value: unknown): string;
export function resolveAudioAssetUploadFormat(
  declaredMime: unknown,
  value: unknown,
): DetectedAudioFileFormat | null;
export function generatedAudioFileExtension(
  source: unknown,
  mime: unknown,
  bytes?: unknown,
): string;
export function generatedOutputAudioMime(extension: unknown): string;
