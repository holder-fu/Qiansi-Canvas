import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as canvasMediaFallback from '../lib/canvasMediaFallback';
import * as mediaPreview from '../lib/mediaPreview';
import {
  CanvasMediaPersistenceError,
  persistEmbeddedCanvasImage,
  CanvasMediaPersistenceSession,
  prepareCanvasAssetItemsForPersistence,
  prepareCanvasMediaValueForPersistence,
  resolveCanvasImageForAi,
  resolveCanvasMediaRuntimeUrl,
  resolveCanvasPosterForAi,
  stableCanvasMediaUrlForRuntime,
} from './canvasMediaPersistence';
import { persistImageFile } from './mediaPersistence';
import { uploadMediaPreview } from './assetLibrary';

vi.mock('../lib/canvasMediaFallback', async (importOriginal) => {
  const actual = await importOriginal<typeof canvasMediaFallback>();
  let nextRuntimeId = 0;
  class TestObjectUrlRegistry {
    private readonly stableByRuntime = new Map<string, string>();

    async acquire(value: string) {
      const reference = actual.parseCanvasMediaFallbackReferenceUrl(value);
      if (!reference) throw new Error('invalid fallback URL');
      nextRuntimeId += 1;
      const objectUrl = `blob:managed-canvas-media-${nextRuntimeId}`;
      this.stableByRuntime.set(objectUrl, value);
      return {
        ...reference,
        stableUrl: value,
        objectUrl,
        release: () => this.stableByRuntime.delete(objectUrl),
      };
    }

    stableUrlForObjectUrl(value: string) {
      return this.stableByRuntime.get(value) ?? null;
    }
  }
  return {
    ...actual,
    CanvasMediaFallbackObjectUrlRegistry: TestObjectUrlRegistry,
    loadCanvasMediaFallback: vi.fn(),
    deleteCanvasMediaFallback: vi.fn(),
    persistCanvasMediaFallback: vi.fn(),
    verifyCanvasMediaFallback: vi.fn(),
  };
});

vi.mock('../lib/mediaPreview', async (importOriginal) => {
  const actual = await importOriginal<typeof mediaPreview>();
  return {
    ...actual,
    createImagePreviewBlob: vi.fn(),
  };
});

vi.mock('./mediaPersistence', () => ({
  persistImageFile: vi.fn(),
}));

vi.mock('./assetLibrary', () => ({
  uploadMediaPreview: vi.fn(),
}));

function dataImage(value: string) {
  return `data:image/png;base64,${btoa(value)}`;
}

function bridgeItem(marker: string) {
  return {
    originalUrl: `/asset-library/files/${marker}.png`,
    previewUrl: `/media-preview/files/${marker}.webp`,
    bridgeAssetId: `asset-${marker}`,
    width: 100,
    height: 100,
  };
}

function fallbackPointer(stableId: string) {
  return {
    kind: 'canvas-media-fallback' as const,
    schemaVersion: 1 as const,
    stableId,
    byteLength: 4,
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
  };
}

function successfulBridgeRead(readback?: Blob) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/png' }),
    blob: vi.fn(async () => {
      if (readback) return readback;
      const uploadedFile = vi.mocked(persistImageFile).mock.calls.at(-1)?.[0];
      if (!uploadedFile) throw new Error('No uploaded file available for bridge readback.');
      return uploadedFile;
    }),
  };
}

describe('canvas media persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mediaPreview.createImagePreviewBlob).mockRejectedValue(
      new Error('preview unavailable'),
    );
    vi.mocked(canvasMediaFallback.verifyCanvasMediaFallback).mockImplementation(
      async (stableId) => ({ ok: true, ...fallbackPointer(stableId) }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the verified bridge original authoritative without touching IndexedDB', async () => {
    const item = bridgeItem('bridge-authoritative');
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));

    await expect(
      persistEmbeddedCanvasImage(dataImage('bridge-authoritative'), 'project-bridge'),
    ).resolves.toEqual({
      originalUrl: item.originalUrl,
      previewUrl: item.previewUrl,
      bridgeAssetId: item.bridgeAssetId,
      storage: 'bridge',
    });
    expect(fetch).toHaveBeenCalledWith(item.originalUrl, {
      method: 'GET',
      signal: undefined,
    });
    expect(canvasMediaFallback.persistCanvasMediaFallback).not.toHaveBeenCalled();
    expect(canvasMediaFallback.verifyCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('keeps the original in memory and never writes IndexedDB after Bridge readback fails', async () => {
    vi.mocked(persistImageFile).mockResolvedValue(bridgeItem('unreadable'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        body: null,
      }),
    );
    await expect(
      persistEmbeddedCanvasImage(dataImage('fallback-after-readback'), 'project-fallback'),
    ).rejects.toThrow('当前页面仍保留临时内容');
    expect(canvasMediaFallback.persistCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('reports a Bridge-only failure without attempting an IndexedDB write', async () => {
    const bridgeError = new Error('bridge write failed');
    vi.mocked(persistImageFile).mockRejectedValue(bridgeError);

    const error = await persistEmbeddedCanvasImage(
      dataImage('both-layers-fail'),
      'project-both-fail',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CanvasMediaPersistenceError);
    if (!(error instanceof CanvasMediaPersistenceError)) {
      throw new Error('Expected CanvasMediaPersistenceError.');
    }
    expect(error).toMatchObject({
      name: 'CanvasMediaPersistenceError',
      message: expect.stringContaining('刷新后会丢失'),
    });
    expect(error.cause).toBe(bridgeError);
    expect(canvasMediaFallback.persistCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('shares one project/content upload across immediate-update and autosave sessions', async () => {
    const item = bridgeItem('shared-session');
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));
    const dataUrl = dataImage('shared-across-sessions');
    const immediateUpdateSession = new CanvasMediaPersistenceSession('project-shared');
    const autosaveSession = new CanvasMediaPersistenceSession('project-shared');

    const [firstResult, secondResult] = await Promise.all([
      immediateUpdateSession.persist(dataUrl),
      autosaveSession.persist(dataUrl),
    ]);
    const laterResult = await new CanvasMediaPersistenceSession('project-shared').persist(dataUrl);

    expect(firstResult).toEqual(secondResult);
    expect(laterResult).toEqual(firstResult);
    expect(persistImageFile).toHaveBeenCalledTimes(1);
    expect(persistImageFile).toHaveBeenCalledWith(
      expect.any(File),
      'storyboard',
      'project-shared',
      undefined,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the same image content isolated between project upload scopes', async () => {
    vi.mocked(persistImageFile).mockImplementation(async (_file, _kind, projectId) =>
      bridgeItem(`scoped-${projectId}`),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));
    const dataUrl = dataImage('same-image-different-projects');

    await Promise.all([
      new CanvasMediaPersistenceSession('project-scope-a').persist(dataUrl),
      new CanvasMediaPersistenceSession('project-scope-b').persist(dataUrl),
    ]);

    expect(persistImageFile).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(persistImageFile)
        .mock.calls.map((call) => call[2])
        .sort(),
    ).toEqual(['project-scope-a', 'project-scope-b']);
  });

  it('evicts a failed shared attempt so another session can retry it', async () => {
    vi.mocked(persistImageFile)
      .mockRejectedValueOnce(new Error('bridge temporarily unavailable'))
      .mockResolvedValueOnce(bridgeItem('retry-success'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));
    const dataUrl = dataImage('retry-after-failure');

    await expect(
      new CanvasMediaPersistenceSession('project-retry').persist(dataUrl),
    ).rejects.toMatchObject({ name: 'CanvasMediaPersistenceError' });
    await expect(
      new CanvasMediaPersistenceSession('project-retry').persist(dataUrl),
    ).resolves.toMatchObject({
      bridgeAssetId: 'asset-retry-success',
      storage: 'bridge',
    });

    expect(persistImageFile).toHaveBeenCalledTimes(2);
    expect(canvasMediaFallback.persistCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('prepares AssetItem-compatible Base64 media through the verified bridge contract', async () => {
    const source = dataImage('asset-prepare-bridge');
    const item = bridgeItem('asset-prepare-bridge');
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));
    const assets = [
      {
        id: 'asset-prepare',
        title: '待迁移资产',
        kind: 'image',
        category: 'character',
        createdAt: 1,
        originalUrl: '/asset-library/files/stale.png',
        imageUrl: source,
        images: [source],
        previewUrl: '/media-preview/files/stale.webp',
        bridgeAssetId: 'stale-id',
      },
    ];
    const original = structuredClone(assets);

    const prepared = await prepareCanvasAssetItemsForPersistence(
      assets,
      'project-asset-prepare-bridge',
    );

    expect(assets).toEqual(original);
    expect(prepared.items[0]).toMatchObject({
      originalUrl: item.originalUrl,
      imageUrl: item.originalUrl,
      images: [item.originalUrl],
      previewUrl: item.previewUrl,
      bridgeAssetId: item.bridgeAssetId,
    });
    expect(persistImageFile).toHaveBeenCalledWith(
      expect.any(File),
      'storyboard',
      'project-asset-prepare-bridge',
      undefined,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('promotes legacy IndexedDB original and preview roles, then deletes only after commit', async () => {
    const originalId = 'legacy-original-role';
    const previewId = 'legacy-preview-role';
    const originalUrl = canvasMediaFallback.createCanvasMediaFallbackUrl(originalId);
    const previewUrl = canvasMediaFallback.createCanvasMediaFallbackPreviewUrl(previewId);
    const originalBlob = new Blob(['legacy-original'], { type: 'image/png' });
    const previewBlob = new Blob(['legacy-preview'], { type: 'image/webp' });
    const item = bridgeItem('promoted-original-role');
    vi.mocked(canvasMediaFallback.loadCanvasMediaFallback).mockImplementation(async (stableId) =>
      stableId === originalId ? originalBlob : stableId === previewId ? previewBlob : null,
    );
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.mocked(uploadMediaPreview).mockResolvedValue({
      id: 'preview_promoted123',
      url: '/media-preview/files/preview_promoted123.webp',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          String(url).includes('preview_promoted123')
            ? successfulBridgeRead(previewBlob)
            : successfulBridgeRead(originalBlob),
        ),
    );
    const session = new CanvasMediaPersistenceSession('project-legacy-promotion');

    const prepared = await prepareCanvasMediaValueForPersistence(
      { originalUrl, previewUrl },
      'project-legacy-promotion',
      undefined,
      session,
    );

    expect(prepared.value).toEqual({
      originalUrl: item.originalUrl,
      previewUrl: '/media-preview/files/preview_promoted123.webp',
    });
    expect([...session.pendingLegacyMediaIds()].sort()).toEqual([originalId, previewId].sort());
    expect(canvasMediaFallback.deleteCanvasMediaFallback).not.toHaveBeenCalled();

    await session.commitLegacyMigration();

    expect(canvasMediaFallback.deleteCanvasMediaFallback).toHaveBeenCalledTimes(2);
    expect(canvasMediaFallback.deleteCanvasMediaFallback).toHaveBeenCalledWith(originalId);
    expect(canvasMediaFallback.deleteCanvasMediaFallback).toHaveBeenCalledWith(previewId);
  });

  it('leaves generic catalog Base64 unchanged when bridge and IndexedDB both fail', async () => {
    const source = dataImage('catalog-two-layer-failure');
    const catalog = { entries: [{ id: 'entry', originalUrl: source, previewUrl: source }] };
    const original = structuredClone(catalog);
    vi.mocked(persistImageFile).mockRejectedValue(new Error('bridge unavailable'));
    vi.mocked(canvasMediaFallback.persistCanvasMediaFallback).mockRejectedValue(
      new Error('IndexedDB unavailable'),
    );

    await expect(
      prepareCanvasMediaValueForPersistence(catalog, 'project-catalog-two-layer-failure'),
    ).rejects.toMatchObject({ name: 'CanvasMediaPersistenceError' });
    expect(catalog).toEqual(original);
  });

  it('persists an embedded original to the verified bridge before returning it for AI', async () => {
    const item = bridgeItem('ai-data-original');
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));

    await expect(
      resolveCanvasImageForAi(dataImage('ai-data-original'), 'project-ai-data'),
    ).resolves.toBe(item.originalUrl);
    expect(persistImageFile).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(canvasMediaFallback.persistCanvasMediaFallback).not.toHaveBeenCalled();
  });

  it('promotes an IndexedDB original and its managed runtime URL to the verified bridge', async () => {
    const stableId = 'indexeddb-ai-original';
    const stableUrl = canvasMediaFallback.createCanvasMediaFallbackUrl(stableId);
    const blob = new Blob(['full-quality-original'], { type: 'image/png' });
    const item = bridgeItem('ai-promoted-original');
    vi.mocked(canvasMediaFallback.loadCanvasMediaFallback).mockResolvedValue(blob);
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));

    await expect(resolveCanvasImageForAi(stableUrl, 'project-ai-runtime')).resolves.toBe(
      item.originalUrl,
    );
    const runtimeUrl = await resolveCanvasMediaRuntimeUrl(stableUrl);
    expect(stableCanvasMediaUrlForRuntime(runtimeUrl)).toBe(stableUrl);
    await expect(resolveCanvasImageForAi(runtimeUrl, 'project-ai-runtime')).resolves.toBe(
      item.originalUrl,
    );
    expect(canvasMediaFallback.loadCanvasMediaFallback).toHaveBeenCalledTimes(2);
    expect(canvasMediaFallback.loadCanvasMediaFallback).toHaveBeenCalledWith(stableId);
    expect(persistImageFile).toHaveBeenCalledTimes(1);
  });

  it('rejects a bridge URL whose readback bytes do not match the submitted original', async () => {
    vi.mocked(persistImageFile).mockResolvedValue(bridgeItem('ai-readback-mismatch'));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          successfulBridgeRead(new Blob(['different-image'], { type: 'image/png' })),
        ),
    );

    await expect(
      resolveCanvasImageForAi(dataImage('expected-image'), 'project-ai-readback-mismatch'),
    ).rejects.toThrow('无法写入并回读本机素材库');
  });

  it('preserves preview role at runtime and rejects it as a core AI reference', async () => {
    const previewUrl =
      canvasMediaFallback.createCanvasMediaFallbackPreviewUrl('indexeddb-ai-preview');
    const runtimeUrl = await resolveCanvasMediaRuntimeUrl(previewUrl);

    expect(stableCanvasMediaUrlForRuntime(runtimeUrl)).toBe(previewUrl);
    await expect(resolveCanvasImageForAi(runtimeUrl, 'project-ai-preview')).rejects.toThrow(
      '只有 IndexedDB 缩略图',
    );
    expect(canvasMediaFallback.loadCanvasMediaFallback).not.toHaveBeenCalled();
    expect(persistImageFile).not.toHaveBeenCalled();
  });

  it('rejects ordinary previews and unmanaged Blob URLs instead of pretending they are originals', async () => {
    await expect(
      resolveCanvasImageForAi('/media-preview/files/preview_identity.webp', 'project-ai-guards'),
    ).rejects.toThrow('当前只有缩略图');
    await expect(
      resolveCanvasImageForAi('blob:unmanaged-reference', 'project-ai-guards'),
    ).rejects.toThrow('未受管的临时 Blob 地址');
    expect(persistImageFile).not.toHaveBeenCalled();
  });

  it.each([
    ['original', (id: string) => canvasMediaFallback.createCanvasMediaFallbackUrl(id)],
    ['preview', (id: string) => canvasMediaFallback.createCanvasMediaFallbackPreviewUrl(id)],
  ] as const)(
    'allows a verified IndexedDB %s and its managed runtime only in the poster resolver',
    async (role, createStableUrl) => {
      const stableId = `poster-${role}`;
      const stableUrl = createStableUrl(stableId);
      const blob = new Blob([`poster-${role}-bytes`], { type: 'image/webp' });
      const item = bridgeItem(`poster-${role}`);
      vi.mocked(canvasMediaFallback.loadCanvasMediaFallback).mockResolvedValue(blob);
      vi.mocked(persistImageFile).mockResolvedValue(item);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));

      await expect(resolveCanvasPosterForAi(stableUrl, `project-poster-${role}`)).resolves.toBe(
        item.originalUrl,
      );
      const runtimeUrl = await resolveCanvasMediaRuntimeUrl(stableUrl);
      expect(stableCanvasMediaUrlForRuntime(runtimeUrl)).toBe(stableUrl);
      await expect(resolveCanvasPosterForAi(runtimeUrl, `project-poster-${role}`)).resolves.toBe(
        item.originalUrl,
      );

      expect(canvasMediaFallback.verifyCanvasMediaFallback).toHaveBeenCalledWith(stableId);
      expect(canvasMediaFallback.loadCanvasMediaFallback).toHaveBeenCalledTimes(2);
      expect(persistImageFile).toHaveBeenCalledTimes(1);
    },
  );

  it('allows data images and ordinary HTTP previews only through the poster resolver', async () => {
    const item = bridgeItem('poster-data');
    vi.mocked(persistImageFile).mockResolvedValue(item);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulBridgeRead()));

    await expect(
      resolveCanvasPosterForAi(dataImage('poster-data'), 'project-poster-data'),
    ).resolves.toBe(item.originalUrl);
    await expect(
      resolveCanvasPosterForAi(
        'https://cdn.example.test/previews/video-poster.webp',
        'project-poster-http',
      ),
    ).resolves.toBe('https://cdn.example.test/previews/video-poster.webp');
    expect(persistImageFile).toHaveBeenCalledTimes(1);
  });

  it('rejects unmanaged poster Blobs and malformed IndexedDB pointers', async () => {
    await expect(
      resolveCanvasPosterForAi('blob:unmanaged-poster', 'project-poster-guards'),
    ).rejects.toThrow('未受管的临时 Blob 地址');
    await expect(
      resolveCanvasPosterForAi(
        'qiansi-canvas-media://indexeddb-preview/not%ZZvalid',
        'project-poster-guards',
      ),
    ).rejects.toThrow('IndexedDB 地址无效');
    expect(persistImageFile).not.toHaveBeenCalled();
  });
});
