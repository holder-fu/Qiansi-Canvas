import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createImagePreviewBlob,
  createImagePreviewFromUrl,
  createVideoPosterBlob,
  createVideoPosterFromUrl,
  resolveMediaSourceUrl,
} from '../lib/mediaPreview';
import { deleteBridgeAsset, uploadAssetFile, uploadMediaPreview } from './assetLibrary';
import {
  persistImageFile,
  persistImagePreviewDataUrl,
  persistImagePreviewForUrl,
  persistVideoFile,
  persistVideoPosterForUrl,
} from './mediaPersistence';

vi.mock('../lib/mediaPreview', () => ({
  createImagePreviewBlob: vi.fn(),
  createImagePreviewFromUrl: vi.fn(),
  createVideoPosterBlob: vi.fn(),
  createVideoPosterFromUrl: vi.fn(),
  resolveMediaSourceUrl: vi.fn((url: string) => url),
}));

vi.mock('./assetLibrary', () => ({
  deleteBridgeAsset: vi.fn(),
  uploadAssetFile: vi.fn(),
  uploadMediaPreview: vi.fn(),
}));

describe('media persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteBridgeAsset).mockResolvedValue(undefined);
  });

  it('commits the Bridge original before its independent preview and returns both stable roles', async () => {
    const previewBlob = new Blob(['preview'], { type: 'image/webp' });
    vi.mocked(createImagePreviewBlob).mockResolvedValue({
      blob: previewBlob,
      width: 1600,
      height: 900,
    });
    vi.mocked(uploadAssetFile).mockResolvedValue({
      id: 'asset_image123',
      url: '/asset-library/files/asset_image123',
    });
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview_image123456',
      url: '/media-preview/files/preview_image123456.webp',
    });

    await expect(
      persistImageFile(
        new File(['image'], 'source.png', { type: 'image/png' }),
        'storyboard',
        'project-a',
      ),
    ).resolves.toEqual({
      originalUrl: '/asset-library/files/asset_image123',
      previewUrl: '/media-preview/files/preview_image123456.webp',
      previewAssetId: 'preview_image123456',
      width: 1600,
      height: 900,
      bridgeAssetId: 'asset_image123',
    });
    expect(vi.mocked(uploadAssetFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(uploadMediaPreview).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not report a permanent video save when poster persistence fails', async () => {
    vi.mocked(createVideoPosterBlob).mockResolvedValue({
      blob: new Blob(['poster'], { type: 'image/webp' }),
      width: 1920,
      height: 1080,
      durationSeconds: 6,
    });
    vi.mocked(uploadAssetFile).mockResolvedValue({
      id: 'asset_video123',
      url: '/asset-library/files/asset_video123',
    });
    vi.mocked(uploadMediaPreview).mockRejectedValue(new Error('preview disk full'));

    await expect(
      persistVideoFile(new File(['video'], 'source.mp4', { type: 'video/mp4' }), 'project-a'),
    ).rejects.toThrow('preview disk full');
    expect(deleteBridgeAsset).toHaveBeenCalledWith('asset_video123');
  });

  it('publishes the locally decoded poster before Bridge original persistence completes', async () => {
    const poster = {
      blob: new Blob(['poster'], { type: 'image/webp' }),
      width: 1280,
      height: 720,
      durationSeconds: 8,
    };
    let finishOriginal: ((value: { id: string; url: string }) => void) | undefined;
    vi.mocked(createVideoPosterBlob).mockResolvedValue(poster);
    vi.mocked(uploadAssetFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOriginal = resolve;
        }),
    );
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview_video123456',
      url: '/media-preview/files/preview_video123456.webp',
    });
    const onPosterReady = vi.fn();

    const pending = persistVideoFile(
      new File(['video'], 'source.mp4', { type: 'video/mp4' }),
      'project-a',
      onPosterReady,
    );
    await vi.waitFor(() => expect(onPosterReady).toHaveBeenCalledWith(poster));
    expect(uploadAssetFile).toHaveBeenCalledOnce();

    finishOriginal?.({ id: 'asset_video123', url: '/asset-library/files/asset_video123' });
    await expect(pending).resolves.toMatchObject({
      bridgeAssetId: 'asset_video123',
      previewUrl: '/media-preview/files/preview_video123456.webp',
    });
  });

  it('persists a cropped data URL as a stable preview URL before preset storage', async () => {
    const blob = new Blob(['preview'], { type: 'image/webp' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob }),
    );
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview-1',
      url: '/media-previews/preview-1.webp',
    });

    await expect(
      persistImagePreviewDataUrl('data:image/webp;base64,cHJldmlldw=='),
    ).resolves.toEqual({
      previewUrl: '/media-previews/preview-1.webp',
      previewAssetId: 'preview-1',
    });
    expect(uploadMediaPreview).toHaveBeenCalledWith(blob, { signal: undefined });
    expect(fetch).toHaveBeenNthCalledWith(2, '/media-previews/preview-1.webp', {
      method: 'GET',
      signal: undefined,
    });
  });

  it('resolves a legacy Bridge image URL before browser preview decoding', async () => {
    const legacyUrl = 'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_image123';
    const currentUrl =
      'http://192.168.50.51:2895/__qiansi_bridge/asset-library/files/asset_image123';
    const preview = {
      blob: new Blob(['preview'], { type: 'image/webp' }),
      width: 800,
      height: 450,
    };
    vi.mocked(resolveMediaSourceUrl).mockReturnValue(currentUrl);
    vi.mocked(createImagePreviewFromUrl).mockResolvedValue(preview);
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview_image123456',
      url: '/media-preview/files/preview_image123456.webp',
    });

    await expect(persistImagePreviewForUrl(legacyUrl)).resolves.toEqual({
      previewUrl: '/media-preview/files/preview_image123456.webp',
      width: 800,
      height: 450,
    });
    expect(resolveMediaSourceUrl).toHaveBeenCalledWith(legacyUrl);
    expect(createImagePreviewFromUrl).toHaveBeenCalledWith(currentUrl);
  });

  it('resolves a legacy Bridge video URL before browser poster decoding', async () => {
    const legacyUrl = 'http://localhost:2895/__qiansi_bridge/asset-library/files/asset_video123';
    const currentUrl =
      'http://192.168.50.51:2895/__qiansi_bridge/asset-library/files/asset_video123';
    const poster = {
      blob: new Blob(['poster'], { type: 'image/webp' }),
      width: 1280,
      height: 720,
      durationSeconds: 9,
    };
    vi.mocked(resolveMediaSourceUrl).mockReturnValue(currentUrl);
    vi.mocked(createVideoPosterFromUrl).mockResolvedValue(poster);
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview_video123456',
      url: '/media-preview/files/preview_video123456.webp',
    });

    await expect(persistVideoPosterForUrl(legacyUrl)).resolves.toEqual({
      previewUrl: '/media-preview/files/preview_video123456.webp',
      width: 1280,
      height: 720,
      durationSeconds: 9,
    });
    expect(resolveMediaSourceUrl).toHaveBeenCalledWith(legacyUrl);
    expect(createVideoPosterFromUrl).toHaveBeenCalledWith(currentUrl);
  });
});
