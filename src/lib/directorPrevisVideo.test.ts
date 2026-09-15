import { describe, expect, it } from 'vitest';
import { directorPrevisFileExtension, selectDirectorPrevisMimeType } from './directorPrevisVideo';

describe('3D director previsualization video contract', () => {
  it('prefers VP9, then VP8, while keeping a plain WebM fallback', () => {
    expect(selectDirectorPrevisMimeType((type) => type.includes('vp8'))).toBe(
      'video/webm;codecs=vp8',
    );
    expect(selectDirectorPrevisMimeType((type) => type === 'video/webm')).toBe('video/webm');
    expect(selectDirectorPrevisMimeType(() => false)).toBe('');
  });

  it('uses a stable WebM extension and rejects an incompatible recording type', () => {
    expect(directorPrevisFileExtension('video/webm;codecs=vp9')).toBe('webm');
    expect(() => directorPrevisFileExtension('video/mp4')).toThrow('只支持导出 WebM');
  });
});
