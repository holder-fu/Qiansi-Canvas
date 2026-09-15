export type AssetUploadMediaKind = 'image' | 'video' | 'audio';

export interface AssetUploadFileDescriptor {
  kind: AssetUploadMediaKind;
  mime: string;
}

const MIME_DESCRIPTORS = new Map<string, AssetUploadFileDescriptor>([
  ['image/png', { kind: 'image', mime: 'image/png' }],
  ['image/jpeg', { kind: 'image', mime: 'image/jpeg' }],
  ['image/webp', { kind: 'image', mime: 'image/webp' }],
  ['image/gif', { kind: 'image', mime: 'image/gif' }],
  ['video/mp4', { kind: 'video', mime: 'video/mp4' }],
  ['video/webm', { kind: 'video', mime: 'video/webm' }],
  ['video/quicktime', { kind: 'video', mime: 'video/quicktime' }],
  ['audio/mpeg', { kind: 'audio', mime: 'audio/mpeg' }],
  ['audio/mp3', { kind: 'audio', mime: 'audio/mpeg' }],
  ['audio/wav', { kind: 'audio', mime: 'audio/wav' }],
  ['audio/x-wav', { kind: 'audio', mime: 'audio/wav' }],
  ['audio/ogg', { kind: 'audio', mime: 'audio/ogg' }],
  ['audio/mp4', { kind: 'audio', mime: 'audio/mp4' }],
  ['audio/webm', { kind: 'audio', mime: 'audio/webm' }],
  ['audio/flac', { kind: 'audio', mime: 'audio/flac' }],
  ['audio/x-flac', { kind: 'audio', mime: 'audio/flac' }],
]);

const EXTENSION_DESCRIPTORS = new Map<string, AssetUploadFileDescriptor>([
  ['.png', { kind: 'image', mime: 'image/png' }],
  ['.jpg', { kind: 'image', mime: 'image/jpeg' }],
  ['.jpeg', { kind: 'image', mime: 'image/jpeg' }],
  ['.webp', { kind: 'image', mime: 'image/webp' }],
  ['.gif', { kind: 'image', mime: 'image/gif' }],
  ['.mp4', { kind: 'video', mime: 'video/mp4' }],
  ['.webm', { kind: 'video', mime: 'video/webm' }],
  ['.mov', { kind: 'video', mime: 'video/quicktime' }],
  ['.mp3', { kind: 'audio', mime: 'audio/mpeg' }],
  ['.wav', { kind: 'audio', mime: 'audio/wav' }],
  ['.ogg', { kind: 'audio', mime: 'audio/ogg' }],
  ['.m4a', { kind: 'audio', mime: 'audio/mp4' }],
  ['.weba', { kind: 'audio', mime: 'audio/webm' }],
  ['.flac', { kind: 'audio', mime: 'audio/flac' }],
]);

const DIRECTOR_MODEL_EXTENSIONS = new Set(['.glb', '.vrm', '.fbx']);

function fileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const dot = normalized.lastIndexOf('.');
  return dot >= 0 ? normalized.slice(dot) : '';
}

export function classifyAssetUploadFile(
  file: Pick<File, 'name' | 'type'>,
): AssetUploadFileDescriptor | null {
  const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_DESCRIPTORS.get(mime) ?? EXTENSION_DESCRIPTORS.get(fileExtension(file.name)) ?? null;
}

export function isDirectorModelUploadFile(file: Pick<File, 'name'>) {
  return DIRECTOR_MODEL_EXTENSIONS.has(fileExtension(file.name));
}

export function withDetectedAssetUploadMime(file: File, descriptor: AssetUploadFileDescriptor) {
  return file.type.toLowerCase() === descriptor.mime
    ? file
    : new File([file], file.name, {
        type: descriptor.mime,
        lastModified: file.lastModified,
      });
}
