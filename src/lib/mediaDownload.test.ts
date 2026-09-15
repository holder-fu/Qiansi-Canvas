import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMediaDownloadRequest, downloadMediaFile } from './mediaDownload';

describe('media download', () => {
  const bridgeBase = 'http://127.0.0.1:2896';

  afterEach(() => vi.unstubAllGlobals());

  it('adds an attachment filename to bridge media instead of navigating to the image', () => {
    expect(
      buildMediaDownloadRequest(
        '/asset-library/files/asset_123456',
        '未命名图片',
        'png',
        bridgeBase,
      ),
    ).toEqual({
      href: 'http://127.0.0.1:2896/asset-library/files/asset_123456?download=%E6%9C%AA%E5%91%BD%E5%90%8D%E5%9B%BE%E7%89%87.png',
      fileName: '未命名图片.png',
    });
  });

  it('rebases stale bridge media and preserves existing query parameters', () => {
    const request = buildMediaDownloadRequest(
      'http://127.0.0.1:2895/output/render.webp?token=preview',
      '成图.webp',
      'png',
      bridgeBase,
    );

    expect(request.href).toBe(
      'http://127.0.0.1:2896/output/render.webp?token=preview&download=%E6%88%90%E5%9B%BE.webp',
    );
    expect(request.fileName).toBe('成图.webp');
  });

  it('sanitizes filenames and leaves external media on its own origin', () => {
    expect(
      buildMediaDownloadRequest(
        'https://cdn.example.test/image.png',
        '角色/正面:*?',
        'png',
        bridgeBase,
      ),
    ).toEqual({
      href: 'https://cdn.example.test/image.png',
      fileName: '角色-正面-.png',
    });
  });

  it('never lets a browser that ignores download replace the canvas tab', () => {
    const anchor: {
      href?: string;
      download?: string;
      target?: string;
      rel?: string;
      style: { display?: string };
      click: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    } = { style: {}, click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild },
    });

    downloadMediaFile('https://cdn.example.test/image.png', '成图.png');

    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toBe('noopener noreferrer');
    expect(anchor.download).toBe('成图.png');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
  });
});
