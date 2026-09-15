import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyImageSourceToClipboard, imageClipboardSource } from './imageClipboard';

class TestClipboardItem {
  readonly data: Record<string, Blob | Promise<Blob>>;

  constructor(data: Record<string, Blob | Promise<Blob>>) {
    this.data = data;
  }
}

describe('image clipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the full-quality image source and resolves bridge media', () => {
    expect(
      imageClipboardSource({
        originalUrl: '/asset-library/files/image_original',
        imageUrl: 'data:image/png;base64,preview',
      }),
    ).toContain('/asset-library/files/image_original');
  });

  it('writes PNG pixels through the system clipboard contract', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const write = vi.fn(async (items: TestClipboardItem[]) => {
      const copied = await items[0]?.data['image/png'];
      expect(copied?.type).toBe('image/png');
      expect(await copied?.text()).toBe('png');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(png, { status: 200 })),
    );
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write } });

    await copyImageSourceToClipboard('data:image/png;base64,copied');

    expect(write).toHaveBeenCalledOnce();
  });

  it('converts non-PNG images before writing them', async () => {
    const webp = new Blob(['webp'], { type: 'image/webp' });
    const png = new Blob(['converted'], { type: 'image/png' });
    const close = vi.fn();
    const drawImage = vi.fn();
    const write = vi.fn(async (items: TestClipboardItem[]) => {
      expect(await items[0]?.data['image/png']).toBe(png);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(webp, { status: 200 })),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 12, height: 8, close })),
    );
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: BlobCallback) => callback(png),
      }),
    });
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write } });

    await copyImageSourceToClipboard('blob:image-source');

    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
  });

  it('fails explicitly when image clipboard writing is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', null);
    vi.stubGlobal('navigator', {});

    await expect(copyImageSourceToClipboard('image.png')).rejects.toThrow('not supported');
  });
});
