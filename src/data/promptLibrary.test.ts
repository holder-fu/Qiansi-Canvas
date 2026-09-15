import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCustomPrompt,
  addPromptCustomCategory,
  composeStylePrompt,
  deletePromptCategory,
  getPromptThumbnailUrl,
  loadPromptLibrary,
  loadCustomPrompts,
  loadPromptCustomCategories,
  loadPromptCategoryRenames,
  normalizeCustomPromptModules,
  normalizePromptModules,
  renamePromptCategory,
  refreshPromptLibrary,
  PROMPT_UNCATEGORIZED,
  resolvePromptCategory,
  saveCustomPrompts,
  sortPromptItems,
  styleModuleEntries,
  styleSupportsCategory,
  type PromptItem,
} from './promptLibrary';
import { writeCanvasPreferences } from '../store/canvasPreferences';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';

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

const prompt: PromptItem = {
  id: 'prompt-1',
  name: '测试提示词',
  enName: 'Test prompt',
  category: 'image',
  target: 'image',
  description: '',
  enDescription: '',
  prompt: '',
  tags: [],
};

describe('Prompt Library public-source seed', () => {
  it('ships an empty, portable seed without local media provenance', () => {
    const library = JSON.parse(
      readFileSync(
        new URL('../../public/prompt-library/library.opensource.json', import.meta.url),
        'utf8',
      ),
    ) as { version: number; sourceRoot: string; ignoredSeries: string[]; items: PromptItem[] };

    expect(library).toEqual({
      version: 1,
      sourceRoot: '',
      ignoredSeries: [],
      items: [],
    });
  });

  it('falls back to the public seed when the local library is not distributable', async () => {
    const seed = { version: 1, sourceRoot: '', ignoredSeries: [], items: [] };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(seed), { headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    refreshPromptLibrary();

    await expect(loadPromptLibrary()).resolves.toEqual(seed);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/prompt-library/library.json',
      '/prompt-library/library.opensource.json',
    ]);
  });

  it('loads prompt JSON from an older Bridge that reports the generic binary MIME', async () => {
    const seed = { version: 1, sourceRoot: '', ignoredSeries: [], items: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(seed), {
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    refreshPromptLibrary();

    await expect(loadPromptLibrary()).resolves.toEqual(seed);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/prompt-library/library.json');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  refreshPromptLibrary();
});

describe('getPromptThumbnailUrl', () => {
  it('keeps a cropped local data URL intact for custom prompt thumbnails', () => {
    expect(
      getPromptThumbnailUrl({ ...prompt, thumbnailFile: 'data:image/webp;base64,thumbnail' }),
    ).toBe('data:image/webp;base64,thumbnail');
  });

  it('cleans stale session thumbnails without blocking a later library save', () => {
    localStorage.clear();
    saveCustomPrompts([
      {
        ...prompt,
        id: 'custom-session-thumbnail',
        custom: true,
        thumbnailFile: 'data:image/webp;base64,dGh1bWI=',
        thumbnailUrl: 'blob:https://example.invalid/session',
        thumbnailAssetId: 'stale-preview',
      },
    ]);
    expect(loadCustomPrompts()[0]).toMatchObject({ thumbnailFile: '' });
    expect(loadCustomPrompts()[0]).not.toHaveProperty('thumbnailUrl');
    expect(loadCustomPrompts()[0]).not.toHaveProperty('thumbnailAssetId');
  });

  it('keeps built-in thumbnail filenames on the library endpoint', () => {
    expect(getPromptThumbnailUrl({ ...prompt, thumbnailFile: 'built-in.webp' })).toBe(
      '/prompt-library/thumbnails/built-in.webp',
    );
  });

  it('persists and restores a stable Bridge thumbnail after the session field is cleared', () => {
    localStorage.clear();
    const thumbnailUrl = '/api/media/previews/prompt-thumbnail.webp';
    saveCustomPrompts([
      {
        ...prompt,
        id: 'custom-persisted-thumbnail',
        custom: true,
        thumbnailFile: '',
        thumbnailUrl,
        thumbnailAssetId: 'prompt-thumbnail',
      },
    ]);

    const [restored] = loadCustomPrompts();
    expect(restored).toEqual(
      expect.objectContaining({
        thumbnailFile: '',
        thumbnailUrl,
        thumbnailAssetId: 'prompt-thumbnail',
      }),
    );
    expect(restored && getPromptThumbnailUrl(restored)).toBe(thumbnailUrl);
  });

  it('resolves relative Bridge previews against the current host after restart', () => {
    const thumbnailUrl = '/media-preview/files/prompt-preview_123456789012.webp';
    expect(getPromptThumbnailUrl({ ...prompt, thumbnailUrl })).toBe(
      resolveMediaSourceUrl(thumbnailUrl),
    );
  });
});

describe('Prompt Library custom modules', () => {
  beforeEach(() => localStorage.clear());

  it('trims module content and removes empty module values before persistence', () => {
    const modules = normalizePromptModules({
      hair: '  flowing silver hair  ',
      accessory: '   ',
    });

    expect(modules).toEqual({ hair: 'flowing silver hair' });
  });

  it('persists user-created module content and composes only the selected modules', () => {
    const created = addCustomPrompt({
      name: '角色细节',
      category: 'character',
      target: 'both',
      description: '可组合的角色细节',
      prompt: 'complete character detail prompt',
      promptModules: {
        hair: 'layered black hair',
        accessory: 'silver hairpin',
      },
      negative: '',
      color: '#10b981',
      tags: ['角色'],
      thumbnailFile: '',
    });

    expect(loadCustomPrompts()).toContainEqual(
      expect.objectContaining({
        id: created.id,
        promptModules: {
          hair: 'layered black hair',
          accessory: 'silver hairpin',
        },
      }),
    );
    expect(composeStylePrompt(created, ['accessory'])).toEqual({
      prompt: '【模块化风格 · 角色细节】\n- 配饰道具: silver hairpin',
      negative: '',
    });
    expect(composeStylePrompt(created, [])).toEqual({
      prompt: '【风格 · 角色细节】\ncomplete character detail prompt',
      negative: '',
    });
  });

  it('filters authored modules by their image/video applicability', () => {
    const modularPrompt: PromptItem = {
      ...prompt,
      target: 'both',
      promptModules: {
        render: 'soft cel shading',
        motion: 'snappy timing',
        continuity: 'preserve identity',
      },
    };

    expect(styleModuleEntries(modularPrompt, 'image').map((entry) => entry.key)).toEqual([
      'render',
      'continuity',
    ]);
    expect(styleModuleEntries(modularPrompt, 'video').map((entry) => entry.key)).toEqual([
      'render',
      'motion',
      'continuity',
    ]);
  });

  it('normalizes and composes user-authored modules with stable selection keys', () => {
    const customPromptModules = normalizeCustomPromptModules([
      {
        id: 'composition',
        name: '  构图设计  ',
        value: '  strong triangular composition  ',
      },
      { id: 'empty', name: '空模块', value: '   ' },
      { id: 'composition', name: '重复模块', value: 'ignored' },
    ]);
    const modularPrompt: PromptItem = {
      ...prompt,
      customPromptModules,
    };

    expect(customPromptModules).toEqual([
      {
        id: 'composition',
        name: '构图设计',
        value: 'strong triangular composition',
        group: 'control',
        target: 'both',
      },
    ]);
    expect(styleModuleEntries(modularPrompt).map((entry) => entry.key)).toContain(
      'custom:composition',
    );
    expect(composeStylePrompt(modularPrompt, ['custom:composition'])).toEqual({
      prompt: '【模块化风格 · 测试提示词】\n- 构图设计: strong triangular composition',
      negative: '',
    });
  });
});

describe('Prompt Library sorting', () => {
  const olderCustom = {
    ...prompt,
    id: 'custom_loyw3v28_old',
    name: '乙提示词',
    enName: 'Beta prompt',
  };
  const newerCustom = {
    ...prompt,
    id: 'custom_lz0c9qww_new',
    name: '甲提示词',
    enName: 'Alpha prompt',
  };
  const builtIn = { ...prompt, id: 'built-in', name: '丙提示词', enName: 'Gamma prompt' };

  it('preserves source order for recommended sorting', () => {
    expect(sortPromptItems([builtIn, olderCustom, newerCustom], 'recommended', 'zh-CN')).toEqual([
      builtIn,
      olderCustom,
      newerCustom,
    ]);
  });

  it('puts newly created custom prompts first for newest sorting', () => {
    expect(
      sortPromptItems([builtIn, olderCustom, newerCustom], 'recent', 'zh-CN').map(
        (item) => item.id,
      ),
    ).toEqual([newerCustom.id, olderCustom.id, builtIn.id]);
  });

  it('uses the current display language for name sorting', () => {
    expect(
      sortPromptItems([builtIn, olderCustom, newerCustom], 'name', 'en-US').map(
        (item) => item.enName,
      ),
    ).toEqual(['Alpha prompt', 'Beta prompt', 'Gamma prompt']);
  });
});

describe('Prompt Library custom categories', () => {
  beforeEach(() => localStorage.clear());

  it('persists a new category before any prompt uses it', () => {
    expect(addPromptCustomCategory('分镜构图')).toBe(true);
    expect(loadPromptCustomCategories()).toEqual(['分镜构图']);
  });

  it('rejects empty and case-insensitive duplicate category names', () => {
    expect(addPromptCustomCategory('  ')).toBe(false);
    expect(addPromptCustomCategory('Storyboard')).toBe(true);
    expect(addPromptCustomCategory('storyboard')).toBe(false);
    expect(loadPromptCustomCategories()).toEqual(['Storyboard']);
  });

  it('filters custom categories by exact category without indexing built-in module metadata', () => {
    expect(styleSupportsCategory({ ...prompt, category: '分镜构图' }, '分镜构图')).toBe(true);
    expect(styleSupportsCategory(prompt, '分镜构图')).toBe(false);
  });

  it('renames an empty custom category and keeps it available', () => {
    addPromptCustomCategory('旧分类');

    expect(renamePromptCategory('旧分类', '新分类')).toBe(true);
    expect(loadPromptCustomCategories()).toEqual(['新分类']);
  });

  it('migrates saved prompts and matching tags when a custom category is renamed', () => {
    addPromptCustomCategory('旧分类');
    saveCustomPrompts([
      {
        ...prompt,
        id: 'custom-1',
        category: '旧分类',
        tags: ['旧分类', '镜头'],
        custom: true,
      },
    ]);

    expect(renamePromptCategory('旧分类', '新分类')).toBe(true);
    expect(JSON.parse(localStorage.getItem('libtv-prompt-library-custom') || '[]')).toContainEqual(
      expect.objectContaining({ category: '新分类', tags: ['新分类', '镜头'] }),
    );
  });

  it('projects built-in category renames without rewriting the static library', () => {
    expect(renamePromptCategory('image', '动漫风格')).toBe(true);
    expect(loadPromptCategoryRenames().get('image')).toBe('动漫风格');
    expect(resolvePromptCategory('image')).toBe('动漫风格');

    expect(renamePromptCategory('动漫风格', '插画风格')).toBe(true);
    expect(loadPromptCategoryRenames().get('image')).toBe('插画风格');
    expect(resolvePromptCategory('image')).toBe('插画风格');
  });

  it('deletes a renamed built-in category into the protected fallback', () => {
    renamePromptCategory('image', '插画风格');

    expect(deletePromptCategory('插画风格')).toBe(true);
    expect(resolvePromptCategory('image')).toBe(PROMPT_UNCATEGORIZED);
    expect(deletePromptCategory(PROMPT_UNCATEGORIZED)).toBe(false);
  });

  it('deletes a custom category and migrates its saved prompts and tags', () => {
    addPromptCustomCategory('待删除');
    saveCustomPrompts([
      {
        ...prompt,
        id: 'custom-delete',
        category: '待删除',
        tags: ['待删除', '镜头'],
        custom: true,
      },
    ]);

    expect(deletePromptCategory('待删除')).toBe(true);
    expect(loadPromptCustomCategories()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('libtv-prompt-library-custom') || '[]')).toContainEqual(
      expect.objectContaining({
        category: PROMPT_UNCATEGORIZED,
        tags: ['未分类', '镜头'],
      }),
    );
  });
});

describe('Prompt Library author identity', () => {
  beforeEach(() => localStorage.clear());

  it('stamps the configured user name onto newly created prompts', () => {
    writeCanvasPreferences({ userName: '提示词作者' });
    const saved = addCustomPrompt({
      name: '作者提示词',
      category: 'image',
      target: 'image',
      description: '',
      prompt: 'cinematic portrait',
      tags: [],
    });

    expect(saved.author).toBe('提示词作者');
    expect(loadCustomPrompts()[0]?.author).toBe('提示词作者');
  });
});
