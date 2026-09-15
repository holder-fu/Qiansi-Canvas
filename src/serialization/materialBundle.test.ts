import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import * as canvasMediaFallback from '../lib/canvasMediaFallback';
import { createCanvasMaterialBundle, parseCanvasMaterialBundle } from './materialBundle';
import { createStoredZip } from '../lib/storedZip';

vi.mock('../lib/canvasMediaFallback', async (importOriginal) => {
  const actual = await importOriginal<typeof canvasMediaFallback>();
  return {
    ...actual,
    loadCanvasMediaFallback: vi.fn(),
    verifyCanvasMediaFallback: vi.fn(),
  };
});

function fallbackPointer(stableId: string, blob: Blob) {
  return {
    kind: 'canvas-media-fallback' as const,
    schemaVersion: 1 as const,
    stableId,
    byteLength: blob.size,
    mimeType: blob.type,
    sha256: 'a'.repeat(64),
  };
}

function imageNode(imageUrl: string): FlowNode {
  return {
    id: 'indexeddb-image',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      title: 'IndexedDB 角色原图',
      imageUrl,
    },
  };
}

describe('canvas material bundle', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('exports and imports image and text node materials', async () => {
    const node: FlowNode = {
      id: 'image-1',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '角色参考',
        imageUrl: 'data:image/png;base64,AQIDBA==',
        prompt: '银色铠甲角色，正面站立',
      },
    };
    const exported = await createCanvasMaterialBundle([node], {
      image: true,
      video: false,
      text: true,
    });
    const imported = await parseCanvasMaterialBundle(
      new File([exported.blob], 'materials.zip', { type: 'application/zip' }),
    );

    expect(exported.counts).toEqual({ image: 1, video: 0, text: 1 });
    expect(imported.map((item) => item.kind)).toEqual(['image', 'text']);
    expect(Array.from(imported[0]?.bytes ?? [])).toEqual([1, 2, 3, 4]);
    expect(new TextDecoder().decode(imported[1]?.bytes)).toContain('银色铠甲角色');
  });

  it('rejects a ZIP without a material manifest', async () => {
    const file = new File(['not a zip'], 'broken.zip', { type: 'application/zip' });
    await expect(parseCanvasMaterialBundle(file)).rejects.toThrow();
  });

  it('verifies and exports the original IndexedDB Blob instead of fetching its stable URL', async () => {
    const stableId = 'material-original';
    const stableUrl = canvasMediaFallback.createCanvasMediaFallbackUrl(stableId);
    const blob = new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' });
    const pointer = fallbackPointer(stableId, blob);
    vi.mocked(canvasMediaFallback.verifyCanvasMediaFallback).mockResolvedValue({
      ok: true,
      ...pointer,
    });
    vi.mocked(canvasMediaFallback.loadCanvasMediaFallback).mockResolvedValue(blob);

    const exported = await createCanvasMaterialBundle([imageNode(stableUrl)], {
      image: true,
      video: false,
      text: false,
    });
    const imported = await parseCanvasMaterialBundle(
      new File([exported.blob], 'materials.zip', { type: 'application/zip' }),
    );

    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(Array.from(imported[0]?.bytes ?? [])).toEqual([9, 8, 7, 6]);
    expect(canvasMediaFallback.verifyCanvasMediaFallback).toHaveBeenCalledWith(stableId);
    expect(canvasMediaFallback.loadCanvasMediaFallback).toHaveBeenCalledWith(stableId);
  });

  it('rejects an IndexedDB preview instead of exporting it as the original image', async () => {
    const previewUrl =
      canvasMediaFallback.createCanvasMediaFallbackPreviewUrl('material-preview-only');

    await expect(
      createCanvasMaterialBundle([imageNode(previewUrl)], {
        image: true,
        video: false,
        text: false,
      }),
    ).rejects.toThrow('缩略图不能替代原图导出');
    expect(canvasMediaFallback.verifyCanvasMediaFallback).not.toHaveBeenCalled();
    expect(canvasMediaFallback.loadCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('fails the whole export when the IndexedDB original does not pass verification', async () => {
    const stableId = 'material-hash-mismatch';
    vi.mocked(canvasMediaFallback.verifyCanvasMediaFallback).mockResolvedValue({
      ok: false,
      stableId,
      reason: 'hash-mismatch',
    });

    await expect(
      createCanvasMaterialBundle(
        [imageNode(canvasMediaFallback.createCanvasMediaFallbackUrl(stableId))],
        { image: true, video: false, text: false },
      ),
    ).rejects.toThrow('校验失败（hash-mismatch）');
    expect(canvasMediaFallback.loadCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('fails the whole export when a verified IndexedDB original is missing', async () => {
    const stableId = 'material-missing';
    const blob = new Blob(['expected'], { type: 'image/png' });
    vi.mocked(canvasMediaFallback.verifyCanvasMediaFallback).mockResolvedValue({
      ok: true,
      ...fallbackPointer(stableId, blob),
    });
    vi.mocked(canvasMediaFallback.loadCanvasMediaFallback).mockResolvedValue(null);

    await expect(
      createCanvasMaterialBundle(
        [imageNode(canvasMediaFallback.createCanvasMediaFallbackUrl(stableId))],
        { image: true, video: false, text: false },
      ),
    ).rejects.toThrow('素材原图已不存在');
  });

  it('resolves and exports only a trusted bridge-relative original URL', async () => {
    const bytes = new Uint8Array([4, 3, 2, 1]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );
    const node = imageNode('/asset-library/files/asset_123456');
    node.data.originalUrl = '/asset-library/files/asset_123456';

    const exported = await createCanvasMaterialBundle([node], {
      image: true,
      video: false,
      text: false,
    });
    const imported = await parseCanvasMaterialBundle(
      new File([exported.blob], 'materials.zip', { type: 'application/zip' }),
    );

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:2895/asset-library/files/asset_123456');
    expect(Array.from(imported[0]?.bytes ?? [])).toEqual([4, 3, 2, 1]);

    await expect(
      createCanvasMaterialBundle([imageNode('/project-relative/image.png')], {
        image: true,
        video: false,
        text: false,
      }),
    ).rejects.toThrow('不受信任的相对地址');
  });

  it('exports originalUrl first and filters its renderer-preview aliases', async () => {
    const original = 'data:image/png;base64,CQgHBg==';
    const preview = '/media-preview/files/preview_identity123.webp';
    const node = imageNode(preview);
    node.data.originalUrl = original;
    node.data.previewUrl = preview;
    node.data.images = [preview];

    const exported = await createCanvasMaterialBundle([node], {
      image: true,
      video: false,
      text: false,
    });
    const imported = await parseCanvasMaterialBundle(
      new File([exported.blob], 'materials.zip', { type: 'application/zip' }),
    );

    expect(exported.counts.image).toBe(1);
    expect(Array.from(imported[0]?.bytes ?? [])).toEqual([9, 8, 7, 6]);
  });

  it('fails explicitly when an image node contains only a renderer preview', async () => {
    const preview = '/media-preview/files/preview_only123.webp';
    const node = imageNode(preview);
    node.data.previewUrl = preview;

    await expect(
      createCanvasMaterialBundle([node], { image: true, video: false, text: false }),
    ).rejects.toThrow('图片节点当前只有缩略图');
  });

  it('round-trips a bundle with hundreds of material entries', async () => {
    const entries = Array.from({ length: 501 }, (_, index) => ({
      path: `text/material-${index + 1}.txt`,
      kind: 'text' as const,
      title: `素材 ${index + 1}`,
      nodeId: `node-${index + 1}`,
      mime: 'text/plain',
    }));
    const manifest = {
      format: 'qiansi-canvas-material-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    const zip = createStoredZip([
      { name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
      ...entries.map((entry) => ({
        name: entry.path,
        bytes: new TextEncoder().encode(entry.title),
      })),
    ]);
    const imported = await parseCanvasMaterialBundle(
      new File([zip], 'hundreds-of-materials.zip', { type: 'application/zip' }),
    );

    expect(imported).toHaveLength(501);
    expect(imported.at(-1)).toMatchObject({ title: '素材 501', kind: 'text' });
  });
});
