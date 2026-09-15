import { NODE_H, NODE_W } from '../canvas/constants';

export type ContextLocalMediaKind = 'image' | 'video' | 'audio';

const LOCAL_MEDIA_IMPORT_COLUMNS = 2;
const LOCAL_MEDIA_IMPORT_COLUMN_GAP = 80;
const LOCAL_MEDIA_IMPORT_ROW_GAP = 80;

export function contextLocalMediaKind(
  file: Pick<File, 'name' | 'type'>,
): ContextLocalMediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/iu.test(file.name)) return 'image';
  if (/\.(?:m4v|mov|mp4|webm)$/iu.test(file.name)) return 'video';
  if (/\.(?:aac|flac|m4a|mp3|ogg|wav|weba)$/iu.test(file.name)) return 'audio';
  return null;
}

export function contextLocalMediaPosition(
  origin: { x: number; y: number },
  index: number,
): { x: number; y: number } {
  const safeIndex = Math.max(0, Math.floor(index));
  return {
    x:
      origin.x +
      (safeIndex % LOCAL_MEDIA_IMPORT_COLUMNS) * (NODE_W + LOCAL_MEDIA_IMPORT_COLUMN_GAP),
    y:
      origin.y +
      Math.floor(safeIndex / LOCAL_MEDIA_IMPORT_COLUMNS) * (NODE_H + LOCAL_MEDIA_IMPORT_ROW_GAP),
  };
}

export function planContextLocalMediaImports(
  files: readonly File[],
  origin: { x: number; y: number },
): Array<{
  file: File;
  kind: ContextLocalMediaKind;
  position: { x: number; y: number };
}> {
  const imports: Array<{
    file: File;
    kind: ContextLocalMediaKind;
    position: { x: number; y: number };
  }> = [];
  for (const file of files) {
    const kind = contextLocalMediaKind(file);
    if (!kind) continue;
    imports.push({
      file,
      kind,
      position: contextLocalMediaPosition(origin, imports.length),
    });
  }
  return imports;
}
