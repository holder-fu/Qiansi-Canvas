import { describe, expect, it } from 'vitest';
import source from './StyleLibraryModal.tsx?raw';

describe('Style Library modal', () => {
  it('offers complete style import and selected-or-all export', () => {
    expect(source).toContain('<LibraryTransferActions');
    expect(source).toContain('kind="style"');
    expect(source).toContain('items={allPresets.map');
  });

  it('reveals the centered primary apply action only over the style image', () => {
    expect(source).toContain('group/preview relative overflow-hidden');
    expect(source).toContain(
      'pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100 group-focus-within/preview:opacity-100',
    );
    expect(source).toContain('data-style-card-action="apply"');
    expect(source).toContain(
      'pointer-events-none inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full',
    );
    expect(source).toContain('group-hover/preview:pointer-events-auto');
    expect(source).toContain('group-focus-within/preview:pointer-events-auto');
    expect(source).not.toContain('mt-auto flex justify-end pt-2');
  });

  it('opens the same editor from the thumbnail and pencil action', () => {
    expect(source).toContain('const handleEdit = (preset: StyleLibraryItem) =>');
    expect(source.match(/onClick=\{\(\) => handleEdit\(preset\)\}/g)).toHaveLength(2);
    expect(source).toContain("aria-label={`${t('common.edit', '编辑')} ${preset.title}`}");
  });

  it('removes style use counting while keeping delete at the thumbnail bottom-right', () => {
    expect(source).toContain(
      'pointer-events-none absolute bottom-2 right-2 z-10 opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100 group-focus-within/preview:opacity-100',
    );
    expect(source).toContain('data-style-card-action="delete"');
    expect(source).toContain(
      'pointer-events-none flex h-6 w-6 items-center justify-center rounded-md',
    );
    expect(source).toContain('group-hover/preview:pointer-events-auto');
    expect(source).toContain('group-focus-within/preview:pointer-events-auto');
    expect(source).not.toContain("id: 'uses'");
    expect(source).not.toContain('styleUseCounts');
    expect(source).not.toContain('STYLE_USE_COUNTS_STORAGE_KEY');
    expect(source).not.toContain('recordStyleUse');
    expect(source).not.toContain("t('library.uses', '使用 {count} 次'");
  });

  it('keeps full-image preview in the top actions and delete at the image bottom-right', () => {
    expect(source).toContain("t('library.previewFullImage', '预览全图')");
    expect(source).toContain('const source = preset.originalImage ?? preset.thumbnail');
    expect(source).toContain('url: resolveMediaSourceUrl(source)');
    expect(source).toContain('data-style-card-action="preview"');
    expect(source).toContain('data-style-card-action="delete"');
    expect(source.indexOf('data-style-card-action="delete"')).toBeLessThan(
      source.indexOf('data-style-card-action="preview"'),
    );
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("if (event.key === 'Escape') setPreviewing(null)");
    expect(source).toContain('<Maximize2 className="h-3 w-3" />');
  });

  it('resolves persisted media URLs for the current Bridge host before rendering or applying', () => {
    expect(source).toContain('resolveUserLibraryThumbnail(preset.thumbnail)');
    expect(source).toContain(
      'const image = resolveUserLibraryThumbnail(preset.originalImage ?? preset.thumbnail)',
    );
    expect(source).toContain('image,');
  });

  it('uses a dedicated node-image picker path without changing normal style application', () => {
    expect(source).toContain(
      'const libraryImagePickerTargetId = useCanvasStore((s) => s.libraryImagePickerTargetId)',
    );
    expect(source).toContain('applyLibraryImageToNode({');
    expect(source).toContain("t('imageNode.libraryPicker.chooseImage', '选择图片')");
    expect(source).toContain('applyStylePreset({');
  });

  it('offers current-canvas images from the add-style thumbnail upload surface', () => {
    expect(source).toContain('useCanvasStore(selectCanvasImagePickerNodes)');
    expect(source).toContain('canvasNodeImageOptions(nodes)');
    expect(source).toContain('showPrimaryCanvasImagePicker');
    expect(source).toContain('canvasImageOptions={canvasImages}');
    expect(source).toContain('persistImageFile(mediaFile');
  });

  it('keeps placeholder templates disabled until a user adds real prompt or media content', () => {
    expect(source).toContain('disabled={preset.template}');
    expect(source).toContain('if (preset.template) return');
    expect(source).toContain('source?.template === true && !hasRealUserContent');
    expect(source).toContain('preset.prompt.trim() ||');
    expect(source).toContain("author: preset.author ?? '我的预设'");
    expect(source).toContain('{preset.user && (');
    expect(source).toContain("prompt: editingTemplate ? ''");
    expect(source).toContain('preset.thumbnail === source.thumbnail');
  });

  it('localizes built-in category names, sorting copy, and the editable prompt guidance', () => {
    expect(source).toContain('const styleCategoryLabels = useMemo');
    expect(source).toContain('categoryLabels={styleCategoryLabels}');
    expect(source).toContain("t('library.style.promptPlaceholder', '输入可复用的提示词')");
    expect(source).toContain("t('library.style.promptGuide', DEFAULT_STYLE_PROMPT_GUIDE)");
    expect(source).toContain('t(option.labelKey, option.fallback)');
    expect(source).not.toContain('promptPlaceholder="输入可复用的提示词"');
  });
});
