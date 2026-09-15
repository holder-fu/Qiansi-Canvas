import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addImageTypeCategory,
  defaultImageTypePresetCatalog,
  defaultImageTypePresets,
  deleteImageTypeCategory,
  imageTypeCategoryColumns,
  loadImageTypePresetCatalog,
  loadImageTypePresets,
  mergeImageTypePresetCatalog,
  parseImageTypePresetCatalogDocument,
  parseImageTypePresetDocument,
  renameImageTypeCategory,
  restoreBuiltInImageTypePresets,
  saveImageTypePresetCatalog,
  saveImageTypePresets,
  serializeImageTypePresetCatalog,
  type ImageTypePreset,
} from './imageTypePresets';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('image type preset persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('starts with every executable built-in preset', () => {
    const presets = defaultImageTypePresets();
    expect(presets).toHaveLength(15);
    expect(new Set(presets.map((preset) => preset.name)).size).toBe(15);
    expect(presets.every((preset) => preset.prompt.length > 40)).toBe(true);
    expect(presets.filter((preset) => preset.category === '人物表情')).toMatchObject([
      { id: 'builtin:9宫人物表情', builtIn: true },
      { id: 'builtin:9宫格人物表情挤眼弄眉', builtIn: true },
    ]);
  });

  it('saves edits and also preserves an intentionally empty preset list', () => {
    const edited = defaultImageTypePresets()
      .slice(0, 1)
      .map((preset) => ({
        ...preset,
        description: '已编辑说明',
        prompt: '已编辑并将实际用于生成的完整提示词。',
      }));
    expect(saveImageTypePresets(edited)).toBe(true);
    expect(loadImageTypePresets()).toEqual(edited);

    expect(saveImageTypePresets([])).toBe(true);
    expect(loadImageTypePresets()).toEqual([]);
  });

  it('filters malformed and duplicate external records', () => {
    const preset = defaultImageTypePresets()[0] as ImageTypePreset;
    expect(
      parseImageTypePresetDocument({
        version: 1,
        presets: [preset, { ...preset, id: 'duplicate-name' }, { id: 'broken' }],
      }),
    ).toEqual([preset]);
    expect(parseImageTypePresetDocument({ version: 2, presets: [] })).toBeNull();
  });

  it('restores deleted built-ins without removing custom presets', () => {
    const custom: ImageTypePreset = {
      id: 'custom:test',
      name: '自定义动作分镜',
      category: '分镜叙事',
      description: '测试自定义说明',
      prompt: '测试自定义提示词，生成连续动作并保持角色一致。',
      builtIn: false,
    };
    const restored = restoreBuiltInImageTypePresets([custom]);
    expect(restored).toHaveLength(16);
    expect(restored).toContainEqual(custom);
  });

  it('migrates the legacy preset-only document into the built-in category catalog', () => {
    const preset = defaultImageTypePresets()[0] as ImageTypePreset;
    expect(parseImageTypePresetCatalogDocument({ version: 1, presets: [preset] })).toMatchObject({
      categories: ['分镜叙事', '质感调节', '人物表情', '空间与机位', '设定图'],
      presets: [preset],
    });
  });

  it('persists a newly added category even before it contains a preset', () => {
    const initial = defaultImageTypePresetCatalog();
    const next = addImageTypeCategory(initial, '动作设计');
    expect(next).not.toBeNull();
    if (!next) throw new Error('Expected the new category to be accepted.');
    expect(saveImageTypePresetCatalog(next)).toBe(true);
    expect(loadImageTypePresetCatalog().categories).toContain('动作设计');
  });

  it('renames a category and migrates every assigned preset without changing its identity', () => {
    const initial = defaultImageTypePresetCatalog();
    const renamed = renameImageTypeCategory(initial, '分镜叙事', '镜头叙事');
    expect(renamed?.categories).toContain('镜头叙事');
    expect(renamed?.categories).not.toContain('分镜叙事');
    expect(
      renamed?.presets.filter((preset) => preset.id.startsWith('builtin:')).slice(0, 4),
    ).toEqual(initial.presets.slice(0, 4).map((preset) => ({ ...preset, category: '镜头叙事' })));
  });

  it('deletes a category by moving its presets to a remaining category and keeps two columns', () => {
    const initial = defaultImageTypePresetCatalog();
    const deleted = deleteImageTypeCategory(initial, '质感调节');
    expect(deleted?.categories).not.toContain('质感调节');
    expect(deleted?.presets.filter((preset) => preset.name === '人像质感调节')).toMatchObject([
      { category: '分镜叙事' },
    ]);
    expect(imageTypeCategoryColumns(deleted?.categories ?? [])).toHaveLength(2);
    expect(
      deleteImageTypeCategory({ categories: ['唯一分类'], presets: [] }, '唯一分类'),
    ).toBeNull();
  });

  it('rejects empty or duplicate category names', () => {
    const initial = defaultImageTypePresetCatalog();
    expect(addImageTypeCategory(initial, '   ')).toBeNull();
    expect(addImageTypeCategory(initial, '分镜叙事')).toBeNull();
    expect(renameImageTypeCategory(initial, '分镜叙事', '质感调节')).toBeNull();
  });

  it('exports a portable prompt catalog and imports only non-conflicting records', () => {
    const current = defaultImageTypePresetCatalog();
    const custom: ImageTypePreset = {
      id: 'custom:imported',
      name: '导入镜头提示词',
      category: '自定义镜头',
      description: '导入后显示的用途说明',
      prompt: '导入后实际合并到图片生成请求中的完整提示词。',
      builtIn: false,
    };
    const exported = serializeImageTypePresetCatalog({
      categories: [...current.categories, '自定义镜头'],
      presets: [current.presets[0] as ImageTypePreset, custom],
    });
    const parsed = parseImageTypePresetCatalogDocument(JSON.parse(exported));
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('Expected exported prompt catalog to parse.');
    const merged = mergeImageTypePresetCatalog(current, parsed);
    expect(merged.importedCount).toBe(1);
    expect(merged.skippedCount).toBe(1);
    expect(merged.catalog.categories).toContain('自定义镜头');
    expect(merged.catalog.presets).toContainEqual(custom);
    expect(
      merged.catalog.presets.filter((preset) => preset.id === current.presets[0]?.id),
    ).toHaveLength(1);
  });
});
