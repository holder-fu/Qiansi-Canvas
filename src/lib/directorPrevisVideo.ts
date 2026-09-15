export const DIRECTOR_PREVIS_WIDTH = 1280;
export const DIRECTOR_PREVIS_HEIGHT = 720;
export const DIRECTOR_PREVIS_FPS = 24;

export const DIRECTOR_PREVIS_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export interface DirectorPrevisCapture {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  cameraLabel: string;
}

export interface DirectorPrevisAsset {
  originalUrl: string;
  previewUrl?: string;
  width: number;
  height: number;
  durationSeconds: number;
  bridgeAssetId: string;
  cameraLabel: string;
}

export function selectDirectorPrevisMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  return DIRECTOR_PREVIS_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? '';
}

export function directorPrevisFileExtension(mimeType: string): 'webm' {
  if (!mimeType.toLowerCase().startsWith('video/webm')) {
    throw new Error('3D 动画预演目前只支持导出 WebM 视频。');
  }
  return 'webm';
}
