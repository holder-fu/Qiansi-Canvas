import { describe, expect, it } from 'vitest';
import source from './ImageTypePresetControl.tsx?raw';

describe('ImageTypePresetControl category management', () => {
  it('places add, edit and delete actions beside the category field', () => {
    expect(source).toContain("t('imageType.category.create', '新增')");
    expect(source).toContain("t('imageType.category.rename', '编辑')");
    expect(source).toContain("t('imageType.category.delete', '删除')");
    expect(source).toContain('onClick={deleteEditorCategory}');
  });

  it('uses the persisted category catalog in the editor and grouped menu', () => {
    expect(source).toContain('useState(loadImageTypePresetCatalog)');
    expect(source).toContain('subscribeImageTypePresetCatalog');
    expect(source).toContain('{categories.map((category) => (');
    expect(source).toContain('imageTypeCategoryColumns(categories).map((column) => (');
    expect(source).toContain('saveImageTypePresetCatalog(next)');
  });

  it('imports and exports the complete prompt catalog without overwriting duplicates', () => {
    expect(source).toContain("t('imageType.transfer.import', '导入')");
    expect(source).toContain("t('imageType.transfer.export', '导出')");
    expect(source).toContain('serializeImageTypePresetCatalog(catalog)');
    expect(source).toContain('parseImageTypePresetCatalogDocument(JSON.parse(await file.text()))');
    expect(source).toContain('mergeImageTypePresetCatalog(catalog, incoming)');
    expect(source).toContain('accept="application/json,.json"');
  });

  it('moves the preset guidance into an accessible hover and focus tooltip', () => {
    expect(source).toContain("t('imageType.helpLabel', '查看生成类型说明')");
    expect(source).toContain('aria-describedby="image-type-preset-help"');
    expect(source).toContain('id="image-type-preset-help"');
    expect(source).toContain('role="tooltip"');
    expect(source).toContain('group-hover/help:visible');
    expect(source).toContain('group-focus-within/help:visible');
  });
});
