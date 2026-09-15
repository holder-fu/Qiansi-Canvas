import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteBridgeAsset, uploadAssetFile, uploadMediaPreview } from './assetLibrary';

describe('uploadAssetFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('streams media to the bridge library and returns an absolute reusable URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          item: { id: 'asset_123456', url: '/asset-library/files/asset_123456' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['video'], '角色镜头.mp4', { type: 'video/mp4' });

    const item = await uploadAssetFile(file, 'video', {
      bridgeBase: 'http://127.0.0.1:2895',
      project: '无限画布',
    });

    expect(item.url).toBe('http://127.0.0.1:2895/asset-library/files/asset_123456');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/asset-library/upload',
      expect.objectContaining({
        method: 'POST',
        body: file,
        headers: expect.objectContaining({
          'X-Qiansi-Canvas-File-Name': '____.mp4',
          'X-Qiansi-Canvas-Kind': 'video',
          'X-Qiansi-Canvas-Project': '____',
        }),
      }),
    );
  });

  it('accepts a stable original through the development Bridge proxy prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: { id: 'asset_proxy123', url: '/asset-library/files/asset_proxy123' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      uploadAssetFile(new File(['image'], 'source.png', { type: 'image/png' }), 'storyboard', {
        bridgeBase: 'http://127.0.0.1:2895/__qiansi_bridge',
      }),
    ).resolves.toMatchObject({
      id: 'asset_proxy123',
      url: 'http://127.0.0.1:2895/__qiansi_bridge/asset-library/files/asset_proxy123',
    });
  });

  it('does not hide a bridge-side upload error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: '素材磁盘已满' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      uploadAssetFile(new File(['video'], 'clip.mp4', { type: 'video/mp4' }), 'video'),
    ).rejects.toThrow('素材磁盘已满');
  });

  it('rejects an asset response that points at a preview instead of the original file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              id: 'asset_wrong123',
              url: '/media-preview/files/preview_wrong123.webp',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      uploadAssetFile(new File(['image'], 'source.png', { type: 'image/png' }), 'storyboard'),
    ).rejects.toThrow('没有返回可长期读取的素材 ID 和原文件地址');
  });

  it('rejects an external origin even when it copies the expected asset path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              id: 'asset_external123',
              url: 'https://example.test/asset-library/files/asset_external123',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      uploadAssetFile(new File(['image'], 'source.png', { type: 'image/png' }), 'storyboard', {
        bridgeBase: 'http://127.0.0.1:2895/__qiansi_bridge',
      }),
    ).rejects.toThrow('没有返回可长期读取的素材 ID 和原文件地址');
  });

  it('preserves a browser video/webm label while declaring the audio upload boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          item: {
            id: 'asset_audio123',
            url: '/asset-library/files/asset_audio123',
            mime: 'audio/webm',
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['audio-webm'], 'recording.webm', { type: 'video/webm' });

    await uploadAssetFile(file, 'audio');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/asset-library/upload'),
      expect.objectContaining({
        body: file,
        headers: expect.objectContaining({
          'Content-Type': 'video/webm',
          'X-Qiansi-Canvas-File-Name': 'recording.webm',
          'X-Qiansi-Canvas-Kind': 'audio',
        }),
      }),
    );
  });
});

describe('uploadMediaPreview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts only the dedicated immutable preview address returned by Bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'preview_123456789abc',
            url: '/media-preview/files/preview_123456789abc.webp',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      uploadMediaPreview(new Blob(['preview'], { type: 'image/webp' }), {
        bridgeBase: 'http://127.0.0.1:2895',
      }),
    ).resolves.toMatchObject({
      id: 'preview_123456789abc',
      url: 'http://127.0.0.1:2895/media-preview/files/preview_123456789abc.webp',
    });
  });

  it('accepts a stable preview through the development Bridge proxy prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'preview_proxy123456',
            url: '/media-preview/files/preview_proxy123456.webp',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      uploadMediaPreview(new Blob(['preview'], { type: 'image/webp' }), {
        bridgeBase: 'http://127.0.0.1:2895/__qiansi_bridge',
      }),
    ).resolves.toMatchObject({
      id: 'preview_proxy123456',
      url: 'http://127.0.0.1:2895/__qiansi_bridge/media-preview/files/preview_proxy123456.webp',
    });
  });
});

describe('deleteBridgeAsset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('permanently removes an uploaded file through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteBridgeAsset('asset_123456', 'http://127.0.0.1:2895');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/asset-library/items/asset_123456',
      { method: 'DELETE' },
    );
  });

  it('does not send a delete request for an unsafe asset id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await deleteBridgeAsset('../outside', 'http://127.0.0.1:2895');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
