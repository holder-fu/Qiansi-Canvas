import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyStorageGarbageCleanup,
  collectBridgeMediaReferences,
  collectLiveStorageMediaReferences,
  listStorageGarbageFiles,
  scanStorageGarbage,
} from './storageCleanup';

describe('storage cleanup client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('extracts only bridge-owned media references from live and persisted state', () => {
    const values = [
      JSON.stringify({
        preview: 'http://127.0.0.1:2896/media-preview/files/preview_aaaaaaaaaaaaaaaa.webp',
        output: '/output/gen-result.mp4',
        originalUrl: '/asset-library/files/asset_canvas_image',
        bridgeAssetId: 'asset_canvas_image',
        remote: 'https://example.com/image.png',
      }),
      'duplicate /output/gen-result.mp4',
    ];
    const storage = {
      length: values.length,
      key: (index: number) => `key-${index}`,
      getItem: (key: string) => values[Number(key.split('-')[1])] ?? null,
    };

    expect(collectLiveStorageMediaReferences(storage)).toEqual([
      '/media-preview/files/preview_aaaaaaaaaaaaaaaa.webp',
      '/output/gen-result.mp4',
      '/asset-library/files/asset_canvas_image',
      '"bridgeAssetId":"asset_canvas_image"',
    ]);
    expect(
      collectBridgeMediaReferences(['C:\\app\\data\\cli-image-output\\gen-local.webp']),
    ).toEqual(['cli-image-output\\gen-local.webp']);
  });

  it('sends current references for both scanning and confirmed cleanup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            scanId: 'cleanup_123',
            summary: { files: 1, bytes: 10, scopes: {} },
            expiresInMs: 600_000,
            protectedRecentMinutes: 15,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'media-preview-cache/preview_aaaaaaaaaaaaaaaa.webp',
                name: 'preview_aaaaaaaaaaaaaaaa.webp',
                folder: 'media-preview-cache',
                relativePath: 'media-preview-cache/preview_aaaaaaaaaaaaaaaa.webp',
                extension: 'webp',
                kind: 'image',
                scope: 'preview',
                size: 10,
                previewUrl: '/media-preview/files/preview_aaaaaaaaaaaaaaaa.webp',
              },
            ],
            total: 1,
            offset: 0,
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deletedFiles: 1, deletedBytes: 10, skippedFiles: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const references = ['/output/gen-result.mp4'];

    await scanStorageGarbage(references, 'http://127.0.0.1:2895');
    const page = await listStorageGarbageFiles('cleanup_123', {
      scope: 'preview',
      bridgeBase: 'http://127.0.0.1:2895',
    });
    await applyStorageGarbageCleanup('cleanup_123', references, 'http://127.0.0.1:2895');

    expect(page.items[0]?.previewUrl).toBe(
      'http://127.0.0.1:2895/media-preview/files/preview_aaaaaaaaaaaaaaaa.webp',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:2895/storage-cleanup/scan',
      expect.objectContaining({ body: JSON.stringify({ liveReferences: references }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:2895/storage-cleanup/plans/cleanup_123/files?scope=preview&offset=0&limit=100',
      { cache: 'no-store' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:2895/storage-cleanup/apply',
      expect.objectContaining({
        body: JSON.stringify({ scanId: 'cleanup_123', liveReferences: references }),
      }),
    );
  });
});
