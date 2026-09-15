import { describe, expect, it } from 'vitest';
import source from './LibraryPresetEditor.tsx?raw';

describe('character reference editor', () => {
  it('keeps video playback controls outside an upload button', () => {
    expect(source).toContain("role={mediaType === 'video' && videoUrl ? undefined : 'button'}");
    expect(source).toContain("t('library.editor.replaceVideo', '更换视频')");
    expect(source).toContain('<video');
    expect(source).toContain('controls');
  });

  it('provides four independent real-image upload slots', () => {
    expect(source).toContain('data-character-reference-editor="true"');
    expect(source).toContain("kind: 'standing'");
    expect(source).toContain("kind: 'portrait'");
    expect(source).toContain("kind: 'expressions'");
    expect(source).toContain("kind: 'turnaround'");
    expect(source).toContain(
      'setCharacterReferences((current) => ({ ...current, [kind]: preview }))',
    );
    expect(source).toContain('removeCharacterReference(kind)');
    expect(source).toContain('src={resolveUserLibraryThumbnail(source)}');
  });

  it('selects each character reference from full-resolution images on the current canvas', () => {
    expect(source).toContain('canvasImageOptions?: CanvasNodeImageOption[]');
    expect(source).toContain('setCanvasReferencePickerKind(kind)');
    expect(source).toContain("'library.character.selectFromCanvas'");
    expect(source).toContain('canvasImageOptionToFile,');
    expect(source).toContain("canvasImageOptionToFile(option, 'canvas-reference')");
    expect(source).toContain('chooseCanvasCharacterReference(canvasReferencePickerKind, option)');
  });

  it('can select primary image media from the same current-canvas picker', () => {
    expect(source).toContain('showPrimaryCanvasImagePicker?: boolean');
    expect(source).toContain('data-primary-canvas-image-picker="true"');
    expect(source).toContain('setPrimaryCanvasImagePickerOpen(true)');
    expect(source).toContain("canvasImageOptionToFile(option, 'canvas-style')");
    expect(source).toContain('await applyPrimaryImageFile(file)');
    expect(source.match(/<CanvasImagePickerDialog/g)).toHaveLength(2);
  });

  it('keeps canvas image previews at their intrinsic aspect ratios', () => {
    expect(source).toContain('auto-rows-max grid-cols-1 items-start');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('className="block h-auto w-full bg-black/30 object-contain"');
    expect(source).not.toContain('className="h-28 w-full bg-black/30 object-contain"');
  });

  it('places a node-order menu immediately before the canvas picker close action', () => {
    const sortButton = source.indexOf('data-canvas-image-sort="true"');
    const pickerClose = source.indexOf("aria-label={t('common.close', '关闭')}", sortButton);
    expect(sortButton).toBeGreaterThan(-1);
    expect(pickerClose).toBeGreaterThan(sortButton);
    expect(source).toContain("'library.editor.canvasSortNewest'");
    expect(source).toContain("'library.editor.canvasSortOldest'");
    expect(source).toContain('sortCanvasNodeImageOptions(options, sortOrder)');
    expect(source).toContain('role="menuitemradio"');
    expect(source).toContain('aria-checked={sortOrder === item.id}');
    expect(source).toContain('setSortMenuOpen(false)');
  });

  it('edits character gender, age and nationality with the reference sheet', () => {
    expect(source).toContain('data-character-metadata-editor="true"');
    expect(source).toContain('setCharacterGender(initial?.gender');
    expect(source).toContain('setCharacterAge(initial?.age');
    expect(source).toContain('setCharacterNationality(initial?.nationality');
    expect(source).toContain('data-character-nationality-select="true"');
    expect(source).toContain('data-character-nationality-custom-input="true"');
    expect(source).toContain('value="__custom__"');
    expect(source).toContain('CHARACTER_NATIONALITIES.map');
    expect(source).not.toContain('<datalist id="character-nationality-options">');
    expect(source).toContain('gender: showCharacterReferenceEditor');
    expect(source).toContain('age: showCharacterReferenceEditor');
    expect(source).toContain('nationality: showCharacterReferenceEditor');
  });

  it('resolves every persisted editor media URL through the active Bridge', () => {
    expect(source).toContain('resolveUserLibraryThumbnail,');
    expect(source).toContain('src={resolveUserLibraryThumbnail(thumbnail)}');
    expect(source).toContain('src={resolveUserLibraryThumbnail(fullImagePreview ?? thumbnail)}');
    expect(source).toContain('src={resolveUserLibraryThumbnail(videoUrl)}');
    expect(source).toContain('setCropSource(resolveUserLibraryThumbnail(source) ?? source)');
  });

  it('persists selected media before writing the preset', () => {
    expect(source).toContain('characterReferences: showCharacterReferenceEditor');
    expect(source).toContain('await onPrepareMediaForSave({');
    expect(source.indexOf('await onPrepareMediaForSave({')).toBeLessThan(
      source.indexOf('const savedId = onSave({ ...value, ...mediaPatch })'),
    );
    expect(source).not.toContain('onSaveCharacterReferenceMedia');
  });

  it('can suppress the duplicate image-upload corner badge', () => {
    expect(source).toContain('showImageUploadBadge = true');
    expect(source).toContain('showImageUploadBadge &&');
  });

  it('can hide the independent primary-media editor when a library derives its cover', () => {
    expect(source).toContain('showPrimaryMediaEditor?: boolean');
    expect(source).toContain('showPrimaryMediaEditor = true');
    expect(source).toContain('{showPrimaryMediaEditor && (');
  });

  it('extracts a representative video poster instead of drawing the zero frame directly', () => {
    expect(source).toContain('const poster = await createVideoPosterBlob(file)');
    expect(source).toContain('thumbnail: await blobToDataUrl(poster.blob)');
    expect(source).not.toContain('context.drawImage(video, 0, 0');
  });

  it('renders translated built-in category labels without changing their stored values', () => {
    expect(source).toContain('categoryLabels?: Readonly<Record<string, string>>');
    expect(source).toContain('(categoryLabels?.[item] ?? item)');
    expect(source).toContain('categoryLabels={categoryLabels}');
    expect(source).toContain("t('library.editor.thumbnail', '缩略图')");
  });
});
