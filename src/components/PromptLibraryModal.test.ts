import { describe, expect, it } from 'vitest';
import source from './PromptLibraryModal.tsx?raw';

describe('Prompt Library modal', () => {
  it('offers complete prompt import and selected-or-all export', () => {
    expect(source).toContain('<LibraryTransferActions');
    expect(source).toContain('kind="prompt"');
    expect(source).toContain('thumbnailUrl: getPromptThumbnailUrl(item)');
  });

  it('replaces maximize with recommended, newest and name sorting', () => {
    expect(source).toContain('data-prompt-sort-trigger="true"');
    expect(source).toContain("['recommended', 'recent', 'name']");
    expect(source).toContain('headerActions={');
    expect(source).toContain('sortPromptItems(items, sort, language)');
    expect(source).not.toContain('onToggleMaximize');
    expect(source).not.toContain('maximized={');
  });

  it('keeps the add/edit thumbnail compact without changing its 4:3 crop contract', () => {
    expect(source).toContain('data-prompt-thumbnail-upload="true"');
    expect(source).toContain('aspect-[4/3] w-full max-w-[320px]');
  });

  it('selects thumbnail images from current canvas nodes through the shared picker', () => {
    expect(source).toContain('useCanvasStore(selectCanvasImagePickerNodes)');
    expect(source).toContain('canvasNodeImageOptions(nodes)');
    expect(source).toContain('data-prompt-thumbnail-canvas-picker="true"');
    expect(source).toContain('<CanvasImagePickerDialog');
    expect(source).toContain('options={canvasImages}');
    expect(source).toContain("canvasImageOptionToFile(option, 'canvas-prompt')");
    expect(source).toContain('setThumbnailCropSource(await readImageFile(file))');
    expect(source).toContain('aspect="4/3"');
  });

  it('keeps prompt-card secondary actions outside native button nesting', () => {
    expect(source).toContain('data-prompt-card-preview-trigger="true"');
    expect(source).toContain('if (event.target !== event.currentTarget) return');
    expect(source).not.toContain(
      '<button\n                            type="button"\n                            onClick={() => openStyle(item)}',
    );
  });

  it('renders the persisted thumbnail URL after the transient upload field is cleared', () => {
    expect(source).toContain('const cardThumbnailUrl = getPromptThumbnailUrl(item)');
    expect(source).toContain(
      "const selectedThumbnailUrl = selectedStyle ? getPromptThumbnailUrl(selectedStyle) : ''",
    );
    expect(source).toContain(
      "const editingThumbnailUrl = editingCustom ? getPromptThumbnailUrl(editingCustom) : ''",
    );
    expect(source).not.toContain('{item.thumbnailFile ? (');
    expect(source).not.toContain('{selectedStyle.thumbnailFile ? (');
    expect(source).not.toContain('{editingCustom.thumbnailFile ? (');
  });

  it('waits for the Bridge metadata write before closing after a thumbnail replacement', () => {
    expect(source).toContain('await queuePromptLibrarySync()');
    expect(source).toContain(
      'const currentEditingCustom = editingCustomRef.current ?? editingCustom',
    );
    expect(source).toContain('editingCustomRef.current = next;');
    expect(source).toContain("thumbnailFile = '';");
    expect(source).toContain('thumbnailUrl = persisted.previewUrl;');
  });

  it('offers a bottom-right full-screen preview that opens the image source directly', () => {
    expect(source).toContain('library.prompt.fullscreenPreview');
    expect(source).toContain('setPromptImagePreview({ url: cardThumbnailUrl, title: item.name })');
    expect(source).toContain('className="absolute bottom-2 right-2');
    expect(source).toContain('h-full w-full rounded-xl object-contain');
  });

  it('lets users select modules and edit independent content in the add/edit form', () => {
    expect(source).toContain('data-prompt-module-editor="true"');
    expect(source).toContain('aria-pressed={active}');
    expect(source).toContain('toggleEditingModule(module.key)');
    expect(source).toContain('updateEditingModule(key, event.target.value)');
    expect(source).toContain('editingCustom.promptModules?.[key]');
  });

  it('lets users add, name, author and remove their own prompt modules', () => {
    expect(source).toContain('data-add-custom-prompt-module="true"');
    expect(source).toContain('data-custom-prompt-modules="true"');
    expect(source).toContain('addEditingCustomModule');
    expect(source).toContain('updateEditingCustomModule(');
    expect(source).toContain('removeEditingCustomModule(module.id)');
    expect(source).toContain(
      'normalizeCustomPromptModules(\n      currentEditingCustom.customPromptModules,',
    );
  });

  it('normalizes modules while retaining the complete-prompt compatibility fallback', () => {
    expect(source).toContain('normalizePromptModules(currentEditingCustom.promptModules)');
    expect(source).toContain('if (!name || !prompt) return');
    expect(source).toMatch(
      /disabled=\{\s*savingCustom \|\| !editingCustom\.name\.trim\(\) \|\| !editingCustom\.prompt\.trim\(\)\s*\}/u,
    );
  });

  it('opens custom cards in the same module-selection detail flow', () => {
    expect(source).toContain("const moduleTaskType: TaskType = isScriptMode ? 'all' : taskType");
    expect(source).toContain('onClick={() => openStyle(item)}');
    expect(source).toContain('{selectedStyle && (');
    expect(source).not.toContain('{selectedStyle && !isScriptMode && (');
  });

  it('shows and searches the saved author name on prompt cards and details', () => {
    expect(source).toContain('item.author?.toLowerCase().includes(q)');
    expect(source).toContain('{item.author && (');
    expect(source).toContain('{selectedStyle.author && (');
  });

  it('counts only modules that still exist for the current target', () => {
    expect(source).toContain('selectedEntryKeys.has(key)');
    expect(source).toContain('availableModuleKeys.has(key)');
    expect(source).toContain('moduleCount: checkedForSelected.length');
  });

  it('applies the live custom editor through the same module and negative-prompt composer', () => {
    expect(source).toContain('const customComposed = composeStylePrompt(');
    expect(source).toContain('styleModuleEntries(item, moduleTaskType)');
    expect(source).toContain('prompt: customComposed.prompt');
    expect(source).toContain('onClick={() => applyCustomItem(editingCustom)}');
    expect(source).toContain("{t('common.apply', '应用')}");
  });

  it('keeps prompt-library supporting text at a readable 12px floor', () => {
    expect(source).not.toContain('text-[10px]');
    expect(source).toContain('line-clamp-2 text-[12px] leading-relaxed text-white/40');
    expect(source).toContain('p-2.5 text-[12px] leading-relaxed text-white/60');
  });

  it('places newly added prompt tasks at the current canvas viewport center', () => {
    expect(source).toContain('const { screenToFlowPosition } = useReactFlow()');
    expect(source).toContain('x: window.innerWidth / 2');
    expect(source).toContain('y: window.innerHeight / 2');
    expect(source).toContain('position: currentCanvasNodePosition()');
  });
});
