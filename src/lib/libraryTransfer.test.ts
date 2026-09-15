import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { loadCustomPrompts, loadPromptCustomCategories } from '../data/promptLibrary';
import { loadUserLibraryCategoryManagement, loadUserLibraryPresets } from './userLibrary';
import {
  createLibraryTransferArchive,
  createLibraryTransferPackage,
  importLibraryTransferFile,
  importLibraryTransferPackage,
  parseLibraryTransferPackage,
} from './libraryTransfer';

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return memoryStorage.size;
    },
    clear: () => memoryStorage.clear(),
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    removeItem: (key: string) => memoryStorage.delete(key),
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
  } satisfies Storage,
});

describe('library transfer packages', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Bridge is intentionally unavailable in this unit test.');
      }),
    );
  });

  it('writes real image, video and character-reference files into a ZIP', async () => {
    const effectArchive = await createLibraryTransferArchive(
      {
        kind: 'effect',
        scope: 'selected',
        items: [
          {
            id: 'effect-one',
            title: '闪电变身',
            data: {
              id: 'effect-one',
              title: '闪电变身',
              thumbnail: '/preview/effect.webp',
              previewUrl: '/preview/effect.webp',
              videoUrl: '/assets/effect.mp4',
              tags: ['变身'],
            },
          },
        ],
      },
      {
        readMediaBlob: async (source) =>
          source.endsWith('.mp4')
            ? new Blob(['video-bytes'], { type: 'video/mp4' })
            : new Blob(['image-bytes'], { type: 'image/webp' }),
        loadLegacyEffectVideo: async () => null,
      },
    );
    const effectEntries = unzipSync(new Uint8Array(await effectArchive.blob.arrayBuffer()));
    const effectPaths = Object.keys(effectEntries);
    expect(effectArchive.fileName).toMatch(/\.zip$/u);
    expect(effectPaths).toContain('manifest.json');
    expect(effectPaths.some((path) => path.startsWith('images/'))).toBe(true);
    expect(effectPaths.some((path) => path.startsWith('videos/'))).toBe(true);
    const effectManifestBytes = effectEntries['manifest.json'];
    if (!effectManifestBytes) throw new Error('Expected manifest.json in ZIP');
    const effectManifest = JSON.parse(strFromU8(effectManifestBytes)) as {
      version: number;
      items: Array<{ thumbnail: string; previewUrl: string; videoUrl: string }>;
    };
    expect(effectManifest.version).toBe(2);
    expect(effectManifest.items[0]?.thumbnail).toMatch(/^images\//u);
    expect(effectManifest.items[0]?.previewUrl).toBe(effectManifest.items[0]?.thumbnail);
    expect(effectManifest.items[0]?.videoUrl).toMatch(/^videos\//u);

    const characterArchive = await createLibraryTransferArchive(
      {
        kind: 'character',
        scope: 'all',
        items: [
          {
            id: 'character-one',
            title: '角色一',
            data: {
              id: 'character-one',
              title: '角色一',
              thumbnail: '/assets/standing.png',
              characterReferences: { standing: '/assets/standing.png' },
              tags: [],
            },
          },
        ],
      },
      {
        readMediaBlob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
        loadLegacyEffectVideo: async () => null,
      },
    );
    const characterEntries = unzipSync(new Uint8Array(await characterArchive.blob.arrayBuffer()));
    expect(Object.keys(characterEntries).some((path) => path.startsWith('images/'))).toBe(true);
    expect(
      Object.keys(characterEntries).some((path) => path.startsWith('character-references/')),
    ).toBe(true);
  });

  it('packages current effects as WebP images without a video directory', async () => {
    const archive = await createLibraryTransferArchive(
      {
        kind: 'effect',
        scope: 'selected',
        items: [
          {
            id: 'effect-webp',
            title: '动态推镜',
            data: {
              id: 'effect-webp',
              title: '动态推镜',
              originalImage: '/assets/effect.webp',
              thumbnail: '/assets/effect.webp',
              tags: ['推镜'],
            },
          },
        ],
      },
      {
        readMediaBlob: async () => new Blob(['animated-webp'], { type: 'image/webp' }),
        loadLegacyEffectVideo: async () => null,
      },
    );
    const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
    const paths = Object.keys(entries);
    expect(paths.some((path) => path.startsWith('images/'))).toBe(true);
    expect(paths.some((path) => path.startsWith('videos/'))).toBe(false);
    const manifestBytes = entries['manifest.json'];
    if (!manifestBytes) throw new Error('Expected manifest.json in ZIP');
    const manifest = JSON.parse(strFromU8(manifestBytes)) as {
      items: Array<{ originalImage?: string }>;
    };
    expect(manifest.items[0]?.originalImage).toMatch(/^images\//u);
  });

  it('embeds every direct and character-reference media source', async () => {
    const reads: string[] = [];
    const transferPackage = await createLibraryTransferPackage(
      {
        kind: 'character',
        scope: 'selected',
        categories: ['现代', '现代'],
        items: [
          {
            id: 'character-one',
            title: '角色一',
            data: {
              id: 'character-one',
              title: '角色一',
              style: '现代',
              thumbnail: '/preview/cover.webp',
              originalImage: '/assets/source.png',
              characterReferences: {
                standing: '/assets/standing.png',
                portrait: 'data:image/png;base64,portrait',
              },
              tags: ['现代'],
            },
          },
        ],
      },
      {
        readMediaSource: async (source) => {
          reads.push(source);
          return source.startsWith('data:') ? source : `data:image/webp;base64,${source}`;
        },
        loadLegacyEffectVideo: async () => null,
        encodeBlob: async () => '',
      },
    );

    expect(transferPackage.scope).toBe('selected');
    expect(transferPackage.categories).toEqual(['现代']);
    expect(reads).toEqual([
      '/preview/cover.webp',
      '/assets/source.png',
      '/assets/standing.png',
      'data:image/png;base64,portrait',
    ]);
    expect(transferPackage.items[0]).toMatchObject({
      thumbnail: 'data:image/webp;base64,/preview/cover.webp',
      originalImage: 'data:image/webp;base64,/assets/source.png',
      characterReferences: {
        standing: 'data:image/webp;base64,/assets/standing.png',
        portrait: 'data:image/png;base64,portrait',
      },
    });
  });

  it('adds a legacy custom effect video without probing built-in templates', async () => {
    const loadedIds: string[] = [];
    const transferPackage = await createLibraryTransferPackage(
      {
        kind: 'effect',
        scope: 'all',
        items: [
          { id: 'builtin', title: '内置', data: { id: 'builtin', title: '内置' } },
          {
            id: 'custom',
            title: '自定义',
            data: { id: 'custom', title: '自定义', user: true },
          },
        ],
      },
      {
        readMediaSource: async (source) => source,
        loadLegacyEffectVideo: async (id) => {
          loadedIds.push(id);
          return new Blob(['video'], { type: 'video/mp4' });
        },
        encodeBlob: async () => 'data:video/mp4;base64,dmlkZW8=',
      },
    );

    expect(loadedIds).toEqual(['custom']);
    expect(transferPackage.items[0]?.videoUrl).toBeUndefined();
    expect(transferPackage.items[1]?.videoUrl).toMatch(/^data:video\/mp4;base64,/u);
  });

  it('round-trips complete style, effect and character prompt metadata', async () => {
    const fixtures = [
      {
        kind: 'style' as const,
        categories: ['风格分类'],
        modelCategories: ['图像模型'],
        data: {
          id: 'portable-style',
          title: '完整风格',
          author: '风格作者',
          uses: 31,
          category: '风格分类',
          model: '图像模型',
          kind: 'views',
          prompt: '必须保留的完整风格提示词',
          commercial: true,
          tags: ['风格分类', '图像模型'],
          createdAt: 1_700_000_000_001,
        },
        expected: {
          title: '完整风格',
          author: '风格作者',
          uses: 31,
          category: '风格分类',
          model: '图像模型',
          styleMediaKind: 'views',
          prompt: '必须保留的完整风格提示词',
          commercial: true,
          tags: ['风格分类', '图像模型'],
          createdAt: 1_700_000_000_001,
        },
      },
      {
        kind: 'effect' as const,
        categories: ['转场模型'],
        modelCategories: [],
        data: {
          id: 'portable-effect',
          title: '完整特效',
          author: '特效作者',
          uses: 42,
          model: '转场模型',
          prompt: '必须保留的完整特效提示词',
          commercial: false,
          tags: ['转场模型', '动态'],
          createdAt: 1_700_000_000_002,
        },
        expected: {
          title: '完整特效',
          author: '特效作者',
          uses: 42,
          category: '转场模型',
          prompt: '必须保留的完整特效提示词',
          commercial: false,
          tags: ['转场模型', '动态'],
          createdAt: 1_700_000_000_002,
        },
      },
      {
        kind: 'character' as const,
        categories: ['东方幻想'],
        modelCategories: [],
        data: {
          id: 'portable-character',
          title: '完整角色',
          author: '角色作者',
          uses: 53,
          style: '东方幻想',
          viewCount: 4,
          gender: 'female',
          age: 24,
          nationality: '中国',
          prompt: '必须保留的完整角色提示词',
          commercial: true,
          tags: ['东方幻想', '四视图'],
          createdAt: 1_700_000_000_003,
        },
        expected: {
          title: '完整角色',
          author: '角色作者',
          uses: 53,
          category: '东方幻想',
          viewCount: 4,
          gender: 'female',
          age: 24,
          nationality: '中国',
          prompt: '必须保留的完整角色提示词',
          commercial: true,
          tags: ['东方幻想', '四视图'],
          createdAt: 1_700_000_000_003,
        },
      },
    ];

    for (const fixture of fixtures) {
      const archive = await createLibraryTransferArchive(
        {
          kind: fixture.kind,
          scope: 'all',
          categories: fixture.categories,
          modelCategories: fixture.modelCategories,
          items: [
            {
              id: fixture.data.id,
              title: fixture.data.title,
              data: fixture.data,
            },
          ],
        },
        { loadLegacyEffectVideo: async () => null },
      );

      expect(archive.manifest.items[0]).toMatchObject({
        id: fixture.data.id,
        prompt: fixture.data.prompt,
        author: fixture.data.author,
        tags: fixture.data.tags,
      });
      await importLibraryTransferPackage(archive.manifest, 'test-project');
      expect(
        loadUserLibraryPresets(fixture.kind).find((item) => item.id === fixture.data.id),
      ).toMatchObject(fixture.expected);
      expect([...loadUserLibraryCategoryManagement(fixture.kind).customCategories]).toEqual(
        expect.arrayContaining(fixture.categories),
      );
    }

    expect([...loadUserLibraryCategoryManagement('style').customModels]).toContain('图像模型');
  });

  it('rejects invalid files and packages from another library', () => {
    expect(() => parseLibraryTransferPackage('{', 'style')).toThrow('有效的 JSON');
    expect(() =>
      parseLibraryTransferPackage(
        JSON.stringify({
          format: 'qiansi-library',
          version: 1,
          library: 'effect',
          items: [],
        }),
        'style',
      ),
    ).toThrow('类型不匹配');
  });

  it('keeps hundreds of library records in one transfer package', async () => {
    const archive = await createLibraryTransferArchive(
      {
        kind: 'style',
        scope: 'all',
        items: Array.from({ length: 501 }, (_, index) => ({
          id: `style-${index + 1}`,
          title: `风格 ${index + 1}`,
          data: {
            id: `style-${index + 1}`,
            title: `风格 ${index + 1}`,
            category: '测试',
            prompt: `提示词 ${index + 1}`,
            tags: [],
          },
        })),
      },
      {
        readMediaBlob: async () => new Blob(),
        loadLegacyEffectVideo: async () => null,
      },
    );
    const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
    const manifestBytes = entries['manifest.json'];
    if (!manifestBytes) throw new Error('Expected manifest.json in ZIP');
    const manifest = parseLibraryTransferPackage(strFromU8(manifestBytes), 'style');

    expect(manifest.items).toHaveLength(501);
    expect(manifest.items.at(-1)).toMatchObject({ id: 'style-501' });
  });

  it('imports complete prompt metadata and its category', async () => {
    await importLibraryTransferPackage(
      {
        format: 'qiansi-library',
        version: 1,
        library: 'prompt',
        exportedAt: '2026-08-17T00:00:00.000Z',
        scope: 'selected',
        categories: ['镜头设计'],
        modelCategories: [],
        items: [
          {
            id: 'prompt-camera-one',
            name: '环绕镜头',
            enName: 'Orbit camera',
            category: '镜头设计',
            target: 'video',
            description: '围绕主体运动',
            enDescription: 'Move around the subject',
            prompt: '稳定环绕主体',
            promptModules: { camera: '360-degree orbit', motion: 'smooth' },
            customPromptModules: [
              {
                id: 'composition',
                name: '构图设计',
                value: 'triangular composition',
              },
            ],
            negative: 'camera shake',
            color: '#345678',
            author: '原提示词作者',
            tags: ['运镜', '视频'],
          },
        ],
      },
      'test-project',
    );

    expect(loadPromptCustomCategories()).toContain('镜头设计');
    expect(loadCustomPrompts()[0]).toMatchObject({
      id: 'prompt-camera-one',
      author: '原提示词作者',
      target: 'video',
      promptModules: { camera: '360-degree orbit', motion: 'smooth' },
      customPromptModules: [
        {
          id: 'composition',
          name: '构图设计',
          value: 'triangular composition',
          group: 'control',
          target: 'both',
        },
      ],
      negative: 'camera shake',
      color: '#345678',
      tags: ['运镜', '视频'],
      custom: true,
    });
  });

  it('imports a version-two ZIP manifest while keeping legacy JSON support', async () => {
    const archive = await createLibraryTransferArchive(
      {
        kind: 'prompt',
        scope: 'selected',
        categories: ['分镜'],
        items: [
          {
            id: 'prompt-zip-one',
            title: '推镜头',
            data: {
              id: 'prompt-zip-one',
              name: '推镜头',
              enName: 'Dolly in',
              category: '分镜',
              target: 'video',
              description: '镜头向主体推进',
              enDescription: 'Move toward the subject',
              prompt: '缓慢推进镜头',
              tags: ['运镜'],
            },
          },
        ],
      },
      {
        readMediaBlob: async () => new Blob(),
        loadLegacyEffectVideo: async () => null,
      },
    );
    const zipFile = Object.assign(archive.blob, { name: archive.fileName }) as File;

    await expect(importLibraryTransferFile(zipFile, 'prompt', 'test-project')).resolves.toBe(1);
    expect(loadCustomPrompts()[0]).toMatchObject({
      id: 'prompt-zip-one',
      prompt: '缓慢推进镜头',
      target: 'video',
    });
  });
});
