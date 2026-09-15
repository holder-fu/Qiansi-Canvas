import { describe, expect, it } from 'vitest';
import {
  classifyAssetUploadFile,
  isDirectorModelUploadFile,
  withDetectedAssetUploadMime,
} from './assetUploadFile';

describe('asset upload file classification', () => {
  it('recognizes supported media from MIME types', () => {
    expect(classifyAssetUploadFile({ name: 'portrait.bin', type: 'image/png' })).toEqual({
      kind: 'image',
      mime: 'image/png',
    });
    expect(classifyAssetUploadFile({ name: 'clip.bin', type: 'video/quicktime' })).toEqual({
      kind: 'video',
      mime: 'video/quicktime',
    });
    expect(classifyAssetUploadFile({ name: 'voice.bin', type: 'audio/x-wav' })).toEqual({
      kind: 'audio',
      mime: 'audio/wav',
    });
  });

  it('repairs missing or generic browser MIME types from supported extensions', () => {
    expect(classifyAssetUploadFile({ name: 'scene.WEBP', type: '' })).toEqual({
      kind: 'image',
      mime: 'image/webp',
    });
    expect(
      classifyAssetUploadFile({ name: 'music.m4a', type: 'application/octet-stream' }),
    ).toEqual({ kind: 'audio', mime: 'audio/mp4' });
  });

  it('keeps 3D director models out of the image upload path', () => {
    for (const name of ['actor.glb', 'actor.VRM', 'actor.fbx']) {
      expect(classifyAssetUploadFile({ name, type: '' })).toBeNull();
      expect(isDirectorModelUploadFile({ name })).toBe(true);
    }
  });

  it('creates a File with the detected stable MIME while preserving identity fields', () => {
    const source = new File(['pixels'], 'portrait.png', { lastModified: 42 });
    const normalized = withDetectedAssetUploadMime(source, { kind: 'image', mime: 'image/png' });

    expect(normalized.name).toBe(source.name);
    expect(normalized.lastModified).toBe(42);
    expect(normalized.type).toBe('image/png');
    expect(normalized.size).toBe(source.size);
  });
});
