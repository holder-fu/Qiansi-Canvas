import { beforeEach, describe, expect, it } from 'vitest';
import {
  addUserLibraryCategory,
  addUserLibraryModelCategory,
  deleteUserLibraryCategory,
  deleteUserLibraryModelCategory,
  loadUserLibraryCategoryManagement,
  loadUserLibraryPresets,
  renameUserLibraryCategory,
  renameUserLibraryModelCategory,
  resolveUserLibraryThumbnail,
  saveUserLibraryPreset,
} from './userLibrary';
import { writeCanvasPreferences } from '../store/canvasPreferences';

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

describe('user style library commercial usage metadata', () => {
  beforeEach(() => localStorage.clear());

  it('does not truncate a library when more than 200 records are imported', () => {
    for (let index = 0; index < 240; index += 1) {
      saveUserLibraryPreset('style', {
        id: `bulk-style-${index + 1}`,
        title: `批量风格 ${index + 1}`,
        category: '批量测试',
        prompt: `提示词 ${index + 1}`,
        tags: [],
      });
    }

    expect(loadUserLibraryPresets('style')).toHaveLength(240);
    expect(loadUserLibraryPresets('style')[0]?.title).toBe('批量风格 240');
    expect(loadUserLibraryPresets('style').at(-1)?.title).toBe('批量风格 1');
  });

  it('persists the commercial usage choice for a custom style', () => {
    const id = saveUserLibraryPreset('style', {
      title: '商业海报',
      category: '电商营销',
      prompt: '简洁的商业产品海报',
      commercial: true,
      tags: ['电商营销'],
    });

    expect(loadUserLibraryPresets('style')).toContainEqual(
      expect.objectContaining({ id, commercial: true }),
    );
  });

  it('stamps the configured user name onto a newly created library item', () => {
    writeCanvasPreferences({ userName: '  老树苗  ' });
    saveUserLibraryPreset('style', {
      title: '署名风格',
      category: '插画',
      prompt: '水墨插画',
      tags: ['插画'],
    });

    expect(loadUserLibraryPresets('style')[0]?.author).toBe('老树苗');
  });

  it('keeps the option off unless the user explicitly enables it', () => {
    saveUserLibraryPreset('style', {
      title: '未确认授权',
      category: '未分类',
      prompt: '',
      commercial: false,
      tags: ['未分类'],
    });

    expect(loadUserLibraryPresets('style')[0]?.commercial).toBe(false);
  });

  it('persists an AI model category separately from the visual style category', () => {
    saveUserLibraryPreset('style', {
      title: '模型分类风格',
      category: '摄影写真',
      model: '我的图像模型',
      prompt: '',
      tags: ['摄影写真', '我的图像模型'],
    });

    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      category: '摄影写真',
      model: '我的图像模型',
    });
  });

  it('persists thumbnail crop settings with the original style image', () => {
    saveUserLibraryPreset('style', {
      title: '保留裁剪位置',
      category: '推荐',
      prompt: '',
      originalImage: 'https://canvas.test/style-original.png',
      thumbnailCrop: { zoom: 1.4, offsetX: 86, offsetY: -32 },
      tags: ['推荐'],
    });

    expect(loadUserLibraryPresets('style')[0]?.thumbnailCrop).toEqual({
      zoom: 1.4,
      offsetX: 86,
      offsetY: -32,
    });
  });

  it('retains the original creation time when a preset is imported', () => {
    saveUserLibraryPreset('style', {
      id: 'imported-style',
      title: '导入风格',
      category: '插画',
      prompt: '完整提示词',
      tags: ['插画'],
      createdAt: 1_700_000_000_000,
    });

    expect(loadUserLibraryPresets('style')[0]?.createdAt).toBe(1_700_000_000_000);
  });

  it('retains portable card metadata that is not editable in the shared form', () => {
    saveUserLibraryPreset('style', {
      id: 'imported-card-metadata',
      title: '动态风格',
      category: '视频风格',
      author: '资料作者',
      uses: 27,
      styleMediaKind: 'video',
      prompt: '动态画面',
      tags: ['视频风格'],
    });

    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      author: '资料作者',
      uses: 27,
      styleMediaKind: 'video',
    });
  });
});

describe('user effects library video metadata', () => {
  beforeEach(() => localStorage.clear());

  it('persists stable source, poster, dimensions and bridge identity across edits', () => {
    const id = saveUserLibraryPreset('effect', {
      title: '地球缩放',
      category: '空间变换',
      prompt: '从地面快速拉远到地球全景',
      thumbnail: '/media-preview/files/earth.webp',
      videoUrl: '/asset-library/files/earth.mp4',
      previewUrl: '/media-preview/files/earth.webp',
      mediaWidth: 1080,
      mediaHeight: 1920,
      bridgeAssetId: 'effect-earth',
      durationSeconds: 8,
      tags: ['空间变换'],
    });

    const saved = loadUserLibraryPresets('effect').find((preset) => preset.id === id);
    expect(saved).toMatchObject({
      videoUrl: '/asset-library/files/earth.mp4',
      previewUrl: '/media-preview/files/earth.webp',
      mediaWidth: 1080,
      mediaHeight: 1920,
      bridgeAssetId: 'effect-earth',
      durationSeconds: 8,
    });
    if (!saved) throw new Error('Expected the effect preset to be saved');

    saveUserLibraryPreset('effect', {
      ...saved,
      title: '地球缩放（编辑）',
      videoUrl: undefined,
      previewUrl: undefined,
      bridgeAssetId: undefined,
    });
    expect(loadUserLibraryPresets('effect')[0]).toMatchObject({
      videoUrl: '/asset-library/files/earth.mp4',
      previewUrl: '/media-preview/files/earth.webp',
      bridgeAssetId: 'effect-earth',
    });
  });

  it('replaces legacy video fields when an animated WebP source is saved', () => {
    saveUserLibraryPreset('effect', {
      id: 'legacy-effect',
      title: '旧视频特效',
      category: '转场',
      prompt: '快速转场',
      videoUrl: '/asset-library/files/legacy.mp4',
      durationSeconds: 5,
      tags: ['转场'],
    });

    saveUserLibraryPreset('effect', {
      id: 'legacy-effect',
      title: '动态 WebP 特效',
      category: '转场',
      prompt: '快速转场',
      originalImage: '/asset-library/files/effect.webp',
      thumbnail: '/asset-library/files/effect.webp',
      tags: ['转场'],
    });

    const converted = loadUserLibraryPresets('effect')[0];
    expect(converted?.originalImage).toBe('/asset-library/files/effect.webp');
    expect(converted?.videoUrl).toBeUndefined();
    expect(converted?.durationSeconds).toBeUndefined();
  });
});

describe('user library thumbnail URLs', () => {
  it('rewrites legacy loopback media URLs for a LAN terminal', () => {
    expect(
      resolveUserLibraryThumbnail(
        'http://127.0.0.1:2895/asset-library/files/character_123',
        'http://192.168.1.25:2895',
      ),
    ).toBe('http://192.168.1.25:2895/asset-library/files/character_123');
  });

  it('rebases loopback media when the page is opened through localhost', () => {
    expect(
      resolveUserLibraryThumbnail(
        'http://127.0.0.1:2895/media-preview/files/style_123.webp',
        'http://localhost:2895',
      ),
    ).toBe('http://localhost:2895/media-preview/files/style_123.webp');
  });

  it('leaves inline and session URLs untouched for compatibility', () => {
    expect(resolveUserLibraryThumbnail('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc',
    );
    expect(resolveUserLibraryThumbnail('blob:http://127.0.0.1/session')).toBe(
      'blob:http://127.0.0.1/session',
    );
  });

  it('never writes session-only media into the persisted preset list', () => {
    localStorage.clear();
    expect(() =>
      saveUserLibraryPreset('style', {
        title: '未持久化裁剪',
        category: '未分类',
        prompt: '',
        thumbnail: 'data:image/webp;base64,dGh1bWI=',
        tags: ['未分类'],
      }),
    ).toThrow('已阻止写入浏览器存储');
    expect(localStorage.getItem('kitty-canvas-user-library-v1:style')).toBeNull();
  });
});

describe('user style library category management', () => {
  beforeEach(() => localStorage.clear());

  it('persists empty visual and model categories before a style uses them', () => {
    expect(addUserLibraryCategory('style', '实验画风')).toBe(true);
    expect(addUserLibraryModelCategory('style', '本地模型')).toBe(true);

    const management = loadUserLibraryCategoryManagement('style');
    expect(management.customCategories).toContain('实验画风');
    expect(management.customModels).toContain('本地模型');
  });

  it.each(['effect', 'character', 'camera'] as const)(
    'supports persistent category management for the %s library',
    (kind) => {
      expect(addUserLibraryCategory(kind, '自定义分类')).toBe(true);
      expect(loadUserLibraryCategoryManagement(kind).customCategories).toContain('自定义分类');

      saveUserLibraryPreset(kind, {
        title: `${kind} 预设`,
        category: '自定义分类',
        prompt: '',
        tags: ['自定义分类'],
      });
      expect(renameUserLibraryCategory(kind, '自定义分类', '重命名分类')).toBe(true);
      expect(loadUserLibraryPresets(kind)[0]).toMatchObject({
        category: '重命名分类',
        tags: ['重命名分类'],
      });

      expect(deleteUserLibraryCategory(kind, '重命名分类')).toBe(true);
      expect(loadUserLibraryPresets(kind)[0]).toMatchObject({
        category: '未分类',
        tags: ['未分类'],
      });
    },
  );

  it('preserves independent character-sheet images across edits', () => {
    const id = saveUserLibraryPreset('character', {
      title: '角色资料组',
      category: '现代',
      prompt: '清新少女',
      thumbnail: 'portrait.webp',
      characterReferences: {
        standing: 'standing.png',
        expressions: 'expressions.png',
        turnaround: 'turnaround.png',
      },
      tags: ['现代'],
    });

    const saved = loadUserLibraryPresets('character').find((preset) => preset.id === id);
    expect(saved?.characterReferences).toEqual({
      standing: 'standing.png',
      expressions: 'expressions.png',
      turnaround: 'turnaround.png',
    });
    if (!saved) throw new Error('Expected the character preset to be saved');

    saveUserLibraryPreset('character', {
      ...saved,
      title: '角色资料组（编辑）',
      characterReferences: undefined,
    });
    expect(loadUserLibraryPresets('character')[0]?.characterReferences).toEqual({
      standing: 'standing.png',
      expressions: 'expressions.png',
      turnaround: 'turnaround.png',
    });
  });

  it('persists normalized character demographic metadata across edits', () => {
    const id = saveUserLibraryPreset('character', {
      title: '现代女性角色',
      category: '现代',
      prompt: '人物设定',
      gender: 'female',
      age: 24,
      nationality: ' 中国 ',
      tags: ['现代'],
    });

    expect(loadUserLibraryPresets('character').find((preset) => preset.id === id)).toMatchObject({
      gender: 'female',
      age: 24,
      nationality: '中国',
    });
    const saved = loadUserLibraryPresets('character')[0];
    if (!saved) throw new Error('Expected saved character');
    saveUserLibraryPreset('character', {
      ...saved,
      title: '现代女性角色（编辑）',
      nationality: '法国',
    });
    expect(loadUserLibraryPresets('character')[0]).toMatchObject({
      gender: 'female',
      age: 24,
      nationality: '法国',
    });
  });

  it('drops the legacy independent thumbnail when a face close-up becomes the cover', () => {
    saveUserLibraryPreset('character', {
      title: '角色近景封面',
      category: '现代',
      prompt: '清新少女',
      thumbnail: '/media-preview/files/legacy-cover.webp',
      thumbnailAssetId: 'legacy-preview',
      originalImage: '/asset-library/files/legacy-cover.png',
      bridgeAssetId: 'legacy-cover',
      thumbnailCrop: { zoom: 1.4, offsetX: 12, offsetY: -8 },
      characterReferences: {
        portrait: '/asset-library/files/portrait.png',
      },
      tags: ['现代'],
    });

    expect(loadUserLibraryPresets('character')[0]).toMatchObject({
      characterReferences: { portrait: '/asset-library/files/portrait.png' },
    });
    expect(loadUserLibraryPresets('character')[0]).not.toHaveProperty('thumbnail');
    expect(loadUserLibraryPresets('character')[0]).not.toHaveProperty('thumbnailAssetId');
    expect(loadUserLibraryPresets('character')[0]).not.toHaveProperty('originalImage');
    expect(loadUserLibraryPresets('character')[0]).not.toHaveProperty('bridgeAssetId');
    expect(loadUserLibraryPresets('character')[0]).not.toHaveProperty('thumbnailCrop');
  });

  it('renames categories and migrates existing style metadata', () => {
    saveUserLibraryPreset('style', {
      title: '待迁移风格',
      category: '摄影写真',
      model: 'Midjourney V7',
      prompt: '',
      tags: ['摄影写真', 'Midjourney V7'],
    });

    expect(renameUserLibraryCategory('style', '摄影写真', '人像摄影')).toBe(true);
    expect(renameUserLibraryModelCategory('style', 'Midjourney V7', 'MJ 人像模型')).toBe(true);

    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      category: '人像摄影',
      model: 'MJ 人像模型',
      tags: ['人像摄影', 'MJ 人像模型'],
    });
    const management = loadUserLibraryCategoryManagement('style');
    expect(management.renamedCategories.get('摄影写真')).toBe('人像摄影');
    expect(management.renamedModels.get('Midjourney V7')).toBe('MJ 人像模型');
  });

  it('deletes renamed categories and moves their styles to uncategorized', () => {
    saveUserLibraryPreset('style', {
      title: '待删除分类风格',
      category: '旧画风',
      model: '旧模型',
      prompt: '',
      tags: ['旧画风', '旧模型'],
    });
    renameUserLibraryCategory('style', '旧画风', '新画风');
    renameUserLibraryModelCategory('style', '旧模型', '新模型');

    expect(deleteUserLibraryCategory('style', '新画风')).toBe(true);
    expect(deleteUserLibraryModelCategory('style', '新模型')).toBe(true);

    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      category: '未分类',
      model: '未分类',
      tags: ['未分类'],
    });
    const management = loadUserLibraryCategoryManagement('style');
    expect(management.customCategories).not.toContain('新画风');
    expect(management.customModels).not.toContain('新模型');
    expect(management.renamedCategories.has('旧画风')).toBe(false);
    expect(management.renamedModels.has('旧模型')).toBe(false);
  });
});
