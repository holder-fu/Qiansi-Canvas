import { describe, expect, it } from 'vitest';
import {
  isDerivedImagePreviewUrl,
  mergeVideoAiImageReferences,
  requireOriginalAiImageReferences,
} from './aiImageReferencePolicy';

describe('AI image reference quality policy', () => {
  it.each([
    '/media-preview/files/preview_123456789012.webp',
    'http://127.0.0.1:2895/media-previews/preview.webp',
    '/asset-library/files/asset_123456?preview=image&w=768',
    'https://cdn.example.test/image.jpg?thumbnail=1',
    'https://cdn.example.test/thumbs/image.webp',
  ])('recognizes a renderer-only preview: %s', (url) => {
    expect(isDerivedImagePreviewUrl(url)).toBe(true);
  });

  it.each([
    '/asset-library/files/asset_123456',
    'https://cdn.example.test/original/image.jpg?w=4096',
    'data:image/png;base64,legacy-original',
  ])('keeps a possible original source: %s', (url) => {
    expect(isDerivedImagePreviewUrl(url)).toBe(false);
  });

  it('rejects the whole core-reference submission when one entry is only a preview', () => {
    expect(() =>
      requireOriginalAiImageReferences([
        '/asset-library/files/asset_original',
        '/asset-library/files/asset_preview?preview=image&w=768',
      ]),
    ).toThrow('核心参考图 2当前只有缩略图');
  });

  it.each([
    'blob:http://127.0.0.1/session-only-image',
    'qiansi-canvas-media://indexeddb/canvas-media%3Asha256%3Aidentity',
    'qiansi-canvas-media://indexeddb-preview/canvas-media%3Asha256%3Aidentity',
  ])('rejects a browser-only core reference before bridge submission: %s', (url) => {
    expect(() => requireOriginalAiImageReferences([url])).toThrow('本机桥无法');
  });

  it('allows a video poster only through the explicit fallback channel', () => {
    const poster = '/media-preview/files/preview_effectposter.webp';
    expect(() => requireOriginalAiImageReferences([poster])).toThrow('只有缩略图');
    expect(
      mergeVideoAiImageReferences(['/asset-library/files/identity_original'], [poster]),
    ).toEqual([poster, '/asset-library/files/identity_original']);
  });

  it('deduplicates implementation-only posters without collapsing duplicate core roles', () => {
    const poster = '/media-preview/files/preview_effectposter.webp';
    const sharedIdentity = '/asset-library/files/shared_identity_original';

    expect(
      mergeVideoAiImageReferences(
        ['/asset-library/files/frame_original', sharedIdentity, sharedIdentity],
        [poster, poster],
      ),
    ).toEqual([poster, '/asset-library/files/frame_original', sharedIdentity, sharedIdentity]);
  });

  it('allows an inline or HTTP video poster but rejects session and IndexedDB-only pointers', () => {
    const inlinePoster = 'data:image/webp;base64,poster';
    const httpPoster = 'https://example.test/media-preview/effect.webp';
    expect(mergeVideoAiImageReferences([], [inlinePoster, httpPoster])).toEqual([
      inlinePoster,
      httpPoster,
    ]);
    expect(() => mergeVideoAiImageReferences([], ['blob:http://127.0.0.1/poster'])).toThrow(
      '视频海报回退图仍是仅当前页面可用的 Blob',
    );
    expect(() =>
      mergeVideoAiImageReferences(
        [],
        ['qiansi-canvas-media://indexeddb-preview/canvas-media%3Asha256%3Aposter'],
      ),
    ).toThrow('视频海报回退图仍是尚未解析的 IndexedDB');
  });
});
