import { describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { placeholderImage } from '../canvas/placeholders';
import type { AssetItem } from '../store/canvasStore';
import {
  embeddedCanvasImageStats,
  migrateCanvasAssetItemsEmbeddedImages,
  migrateCanvasMediaValueEmbeddedImages,
  migrateCanvasNodesEmbeddedImages,
} from './canvasMediaMigration';

function dataImage(marker: string) {
  return `data:image/jpeg;base64,${marker.repeat(32)}`;
}

describe('canvas media migration contract', () => {
  it('uploads one shared image once while preserving copied-node identities and field order', async () => {
    const first = dataImage('A');
    const second = dataImage('B');
    const nodes: FlowNode[] = [
      {
        id: 'character-a',
        type: 'image',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          title: '人物 A',
          originalUrl: first,
          imageUrl: first,
          images: [first, second],
          previewUrl: first,
          composerReferences: [
            { id: 'role-a', type: 'image', label: '人物 A', url: first, previewUrl: first },
            { id: 'role-b', type: 'image', label: '人物 B', url: second },
          ],
        },
      },
      {
        id: 'character-a-copy',
        type: 'image',
        position: { x: 500, y: 0 },
        data: { kind: 'image', title: '人物 A 副本', imageUrl: first, output: first },
      },
    ];
    const resolver = vi.fn(async (value: string) => ({
      originalUrl:
        value === first ? '/asset-library/files/asset-a' : '/asset-library/files/asset-b',
      previewUrl: value === first ? '/media-preview/files/preview-a.webp' : undefined,
      bridgeAssetId: value === first ? 'asset-a' : 'asset-b',
      storage: 'bridge' as const,
    }));

    const result = await migrateCanvasNodesEmbeddedImages(nodes, resolver);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ embeddedImageCount: 10, uniqueImageCount: 2 });
    expect(result.nodes.map((node) => node.id)).toEqual(['character-a', 'character-a-copy']);
    expect(result.nodes[0]?.data.images).toEqual([
      '/asset-library/files/asset-a',
      '/asset-library/files/asset-b',
    ]);
    expect(result.nodes[0]?.data.previewUrl).toBe('/media-preview/files/preview-a.webp');
    expect(result.nodes[0]?.data.composerReferences).toMatchObject([
      {
        id: 'role-a',
        url: '/asset-library/files/asset-a',
        previewUrl: '/media-preview/files/preview-a.webp',
      },
      { id: 'role-b', url: '/asset-library/files/asset-b' },
    ]);
    expect(result.nodes[1]?.data.imageUrl).toBe('/asset-library/files/asset-a');
    expect(result.nodes[1]?.data.previewUrl).toBe('/media-preview/files/preview-a.webp');
    expect(embeddedCanvasImageStats(result.nodes).occurrenceCount).toBe(0);
  });

  it('rewrites nested director media without changing A/B ordering', async () => {
    const control = dataImage('C');
    const heroA = dataImage('D');
    const heroB = dataImage('E');
    const node: FlowNode = {
      id: 'director',
      type: 'director-2d',
      position: { x: 0, y: 0 },
      data: {
        kind: 'director-2d',
        title: '2D导演台',
        directorLayoutUrl: control,
        images: [control, heroA, heroB],
        directorReferenceLabels: ['构图控制图', '人物 A', '人物 B'],
        directorScene: {
          subjects: [
            { id: 'a', imageUrl: heroA },
            { id: 'b', imageUrl: heroB },
          ],
        } as unknown as FlowNode['data']['directorScene'],
      },
    };
    const urls = new Map([
      [control, '/asset-library/files/control'],
      [heroA, '/asset-library/files/hero-a'],
      [heroB, '/asset-library/files/hero-b'],
    ]);

    const result = await migrateCanvasNodesEmbeddedImages([node], async (value) => ({
      originalUrl: urls.get(value) ?? '',
      storage: 'bridge',
    }));

    expect(result.nodes[0]?.data.images).toEqual([
      '/asset-library/files/control',
      '/asset-library/files/hero-a',
      '/asset-library/files/hero-b',
    ]);
    expect(result.nodes[0]?.data.directorReferenceLabels).toEqual([
      '构图控制图',
      '人物 A',
      '人物 B',
    ]);
    expect(result.nodes[0]?.data.directorScene).toMatchObject({
      subjects: [
        { id: 'a', imageUrl: '/asset-library/files/hero-a' },
        { id: 'b', imageUrl: '/asset-library/files/hero-b' },
      ],
    });
  });

  it('keeps inherited original-source fields full quality while preview fields use previews', async () => {
    const original = dataImage('F');
    const node: FlowNode = {
      id: 'inherited-source',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '继承原图',
        imagePreviewUrl: original,
        videoPreviewUrl: original,
        imagePreviewPosterUrl: original,
        directorThumbnailUrl: original,
      },
    };

    const result = await migrateCanvasNodesEmbeddedImages([node], async () => ({
      originalUrl: '/asset-library/files/full-quality',
      previewUrl: '/media-preview/files/lightweight.webp',
      storage: 'bridge',
    }));

    expect(result.nodes[0]?.data.imagePreviewUrl).toBe('/asset-library/files/full-quality');
    expect(result.nodes[0]?.data.videoPreviewUrl).toBe('/asset-library/files/full-quality');
    expect(result.nodes[0]?.data.imagePreviewPosterUrl).toBe(
      '/media-preview/files/lightweight.webp',
    );
    expect(result.nodes[0]?.data.directorThumbnailUrl).toBe(
      '/media-preview/files/lightweight.webp',
    );
  });

  it('does not persist built-in SVG empty-state artwork as a real media asset', async () => {
    const builtInPlaceholder = placeholderImage('generator').imageUrl;
    const resolver = vi.fn();
    const node: FlowNode = {
      id: 'empty-generator',
      type: 'generator',
      position: { x: 0, y: 0 },
      data: { kind: 'generator', title: '生图', imageUrl: builtInPlaceholder },
    };

    const result = await migrateCanvasNodesEmbeddedImages([node], resolver);

    expect(resolver).not.toHaveBeenCalled();
    expect(result.nodes[0]?.data.imageUrl).toBe(builtInPlaceholder);
    expect(result.uniqueImageCount).toBe(0);
  });

  it('atomically replaces stale image aliases and clears an old bridge id for IndexedDB media', async () => {
    const replacement = dataImage('G');
    const node: FlowNode = {
      id: 'edited-copy',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        title: '已替换人物',
        bridgeAssetId: 'old-person-asset',
        originalUrl: '/asset-library/files/old-person-asset',
        imageUrl: replacement,
        images: ['/asset-library/files/old-person-asset', '/asset-library/files/other-page'],
        previewUrl: '/media-preview/files/old-person.webp',
        output: '/asset-library/files/old-person-asset',
      },
    };

    const result = await migrateCanvasNodesEmbeddedImages([node], async () => ({
      originalUrl: 'qiansi-canvas-media://indexeddb/new-person-content',
      previewUrl: 'qiansi-canvas-media://indexeddb-preview/new-person-preview',
      storage: 'indexeddb',
    }));
    const data = result.nodes[0]?.data;

    expect(data?.bridgeAssetId).toBeUndefined();
    expect(data?.originalUrl).toBe('qiansi-canvas-media://indexeddb/new-person-content');
    expect(data?.imageUrl).toBe('qiansi-canvas-media://indexeddb/new-person-content');
    expect(data?.images).toEqual([
      'qiansi-canvas-media://indexeddb/new-person-content',
      '/asset-library/files/other-page',
    ]);
    expect(data?.previewUrl).toBe('qiansi-canvas-media://indexeddb-preview/new-person-preview');
    expect(data?.output).toBe('qiansi-canvas-media://indexeddb/new-person-content');
    expect(JSON.stringify(data)).not.toContain('old-person');
  });

  it('migrates large legacy images one at a time without changing their array order', async () => {
    const first = dataImage('H');
    const second = dataImage('I');
    const third = dataImage('J');
    let activeResolvers = 0;
    let peakResolvers = 0;
    const completionOrder: string[] = [];
    const node: FlowNode = {
      id: 'ordered-bundle',
      type: 'director-2d',
      position: { x: 0, y: 0 },
      data: {
        kind: 'director-2d',
        title: '有序构图包',
        images: [first, second, third],
        directorReferenceLabels: ['构图', '人物 A', '人物 B'],
      },
    };

    const result = await migrateCanvasNodesEmbeddedImages([node], async (value) => {
      activeResolvers += 1;
      peakResolvers = Math.max(peakResolvers, activeResolvers);
      await Promise.resolve();
      completionOrder.push(value);
      activeResolvers -= 1;
      return {
        originalUrl: `/asset-library/files/${value === first ? 'first' : value === second ? 'second' : 'third'}`,
        storage: 'bridge',
      };
    });

    expect(peakResolvers).toBe(1);
    expect(completionOrder).toEqual([first, second, third]);
    expect(result.nodes[0]?.data.images).toEqual([
      '/asset-library/files/first',
      '/asset-library/files/second',
      '/asset-library/files/third',
    ]);
    expect(result.nodes[0]?.data.directorReferenceLabels).toEqual(['构图', '人物 A', '人物 B']);
  });

  it('migrates AssetItem originals atomically and clears a stale bridge identity for IndexedDB', async () => {
    const replacement = dataImage('K');
    const secondary = dataImage('L');
    const asset: AssetItem = {
      id: 'legacy-character',
      title: '旧角色素材',
      kind: 'image',
      category: 'character',
      createdAt: 1,
      originalUrl: '/asset-library/files/stale-character.png',
      imageUrl: replacement,
      images: [replacement, secondary],
      previewUrl: '/media-preview/files/stale-character.webp',
      bridgeAssetId: 'stale-character-id',
    };
    const originalAsset = structuredClone(asset);
    const resolver = vi.fn(async (value: string) => ({
      originalUrl: `qiansi-canvas-media://indexeddb/${value === replacement ? 'primary' : 'secondary'}`,
      previewUrl:
        value === replacement
          ? 'qiansi-canvas-media://indexeddb-preview/primary-preview'
          : undefined,
      storage: 'indexeddb' as const,
    }));

    const result = await migrateCanvasAssetItemsEmbeddedImages([asset], resolver);

    expect(asset).toEqual(originalAsset);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toMatchObject({
      originalUrl: 'qiansi-canvas-media://indexeddb/primary',
      imageUrl: 'qiansi-canvas-media://indexeddb/primary',
      images: [
        'qiansi-canvas-media://indexeddb/primary',
        'qiansi-canvas-media://indexeddb/secondary',
      ],
      previewUrl: 'qiansi-canvas-media://indexeddb-preview/primary-preview',
    });
    expect(result.items[0]?.bridgeAssetId).toBeUndefined();
    expect(embeddedCanvasImageStats(result.items).occurrenceCount).toBe(0);
  });

  it('keeps a video bridge identity while migrating only its embedded poster fields', async () => {
    const poster = dataImage('M');
    const asset: AssetItem = {
      id: 'legacy-video',
      title: '旧视频素材',
      kind: 'video',
      category: 'video',
      createdAt: 2,
      originalUrl: '/asset-library/files/original-video.mp4',
      videoUrl: '/asset-library/files/original-video.mp4',
      imageUrl: poster,
      previewUrl: poster,
      bridgeAssetId: 'original-video-id',
    };

    const result = await migrateCanvasAssetItemsEmbeddedImages([asset], async () => ({
      originalUrl: '/asset-library/files/full-poster.png',
      previewUrl: '/media-preview/files/poster.webp',
      bridgeAssetId: 'poster-image-id',
      storage: 'bridge',
    }));

    expect(result.items[0]).toMatchObject({
      originalUrl: '/asset-library/files/original-video.mp4',
      videoUrl: '/asset-library/files/original-video.mp4',
      imageUrl: '/asset-library/files/full-poster.png',
      previewUrl: '/media-preview/files/poster.webp',
      bridgeAssetId: 'original-video-id',
    });
  });

  it('migrates shared raster images in generic catalog objects once and preserves nested order', async () => {
    const shared = dataImage('N');
    const second = dataImage('O');
    const catalog = {
      coverUrl: shared,
      references: [
        { id: 'a', url: shared, thumbnailUrl: shared },
        { id: 'b', url: second },
      ],
    };
    const resolver = vi.fn(async (value: string) => ({
      originalUrl: `/asset-library/files/${value === shared ? 'shared' : 'second'}.png`,
      previewUrl:
        value === shared ? '/media-preview/files/shared.webp' : '/media-preview/files/second.webp',
      storage: 'bridge' as const,
    }));

    const result = await migrateCanvasMediaValueEmbeddedImages(catalog, resolver);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(result.value.references).toEqual([
      {
        id: 'a',
        url: '/asset-library/files/shared.png',
        thumbnailUrl: '/media-preview/files/shared.webp',
      },
      { id: 'b', url: '/asset-library/files/second.png' },
    ]);
    expect(result.value.coverUrl).toBe('/asset-library/files/shared.png');
  });

  it('does not mutate a catalog when any required image persistence fails', async () => {
    const first = dataImage('P');
    const second = dataImage('Q');
    const catalog = { images: [first, second], nested: { previewUrl: first } };
    const original = structuredClone(catalog);
    const resolver = vi.fn(async (value: string) => {
      if (value === second) throw new Error('IndexedDB write failed');
      return {
        originalUrl: '/asset-library/files/first.png',
        previewUrl: '/media-preview/files/first.webp',
        storage: 'bridge' as const,
      };
    });

    await expect(migrateCanvasMediaValueEmbeddedImages(catalog, resolver)).rejects.toThrow(
      'IndexedDB write failed',
    );
    expect(catalog).toEqual(original);
  });
});
