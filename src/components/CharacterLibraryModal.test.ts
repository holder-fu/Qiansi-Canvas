import { describe, expect, it } from 'vitest';
import source from './CharacterLibraryModal.tsx?raw';

describe('character library presentation', () => {
  it('offers complete character import and selected-or-all export', () => {
    expect(source).toContain('<LibraryTransferActions');
    expect(source).toContain('kind="character"');
    expect(source).toContain('items={allPresets.map');
  });

  it('opens an all-character portrait grid with demographic filters', () => {
    expect(source).toContain("t('library.character.allCharacters', '全部角色')");
    expect(source).toContain('data-character-all-grid="true"');
    expect(source).toContain('matchesCharacterDemographics');
    expect(source).toContain('setGenderFilter');
    expect(source).toContain('setAgeFilter');
    expect(source).toContain('setNationalityFilter');
    expect(source).toContain('grid-cols-[repeat(auto-fill,260px)]');
    expect(source).toContain('aspect-[2/3] w-[260px]');
    expect(source).not.toContain('auto-rows-[minmax(260px,1fr)]');
    expect(source).toContain('setShowAllCharacters(false)');
  });

  it('uses a selected-character detail board above a horizontal character carousel', () => {
    expect(source).toContain('data-character-library-detail="true"');
    expect(source).toContain('data-character-library-gallery="true"');
    expect(source).toContain('data-character-library-carousel="true"');
    expect(source.indexOf('data-character-library-detail="true"')).toBeLessThan(
      source.indexOf('data-character-library-carousel="true"'),
    );
    expect(source).toContain('width="w-[min(96vw,1760px)]"');
  });

  it('shows the four reference treatments from the supplied design', () => {
    expect(source).toContain("t('library.character.fullBody', '全身参考')");
    expect(source).toContain("t('library.character.portrait', '面部特写')");
    expect(source).toContain("t('library.character.expressionBoard', '表情参考')");
    expect(source).toContain("t('library.character.turnaroundBoard', '人物多视图')");
    expect(source).not.toContain('CharacterMosaic');
    expect(source).toContain('activePreset.characterReferences?.standing');
    expect(source).toContain('activePreset.characterReferences?.portrait');
    expect(source).toContain('activePreset.characterReferences?.expressions');
    expect(source).toContain('activePreset.characterReferences?.turnaround');
  });

  it('supports selecting and applying any available real reference subset', () => {
    expect(source).toContain('useCanvasStore(selectCanvasImagePickerNodes)');
    expect(source).toContain('canvasNodeImageOptions(nodes)');
    expect(source).toContain('availableCharacterReferenceKinds');
    expect(source).toContain('pickCharacterReferenceImages');
    expect(source).toContain('selectedReferenceKinds.has');
    expect(source).toContain('disabled={selectedReferenceCount === 0}');
    expect(source).toContain('showCharacterReferenceEditor');
    expect(source).toContain('showPrimaryMediaEditor={false}');
    expect(source).not.toContain('showFullImagePreview');
    expect(source).not.toContain('coverSourceImage');
    expect(source).toContain('onPrepareMediaForSave');
    expect(source).toContain("persistImageFile(file, 'character', activeProjectId)");
    expect(source).not.toContain('persistImagePreviewDataUrl');
    expect(source).toContain('resolveCharacterCoverSource(');
    expect(source).not.toContain('cropThumbnail');
    expect(source).toContain("t('library.character.templateShort', '模板')");
  });

  it('switches to a single real-reference choice when filling an image node', () => {
    expect(source).toContain('const isLibraryImagePicker = Boolean(libraryImagePickerTargetId)');
    expect(source).toContain("type={single ? 'radio' : 'checkbox'}");
    expect(source).toContain('new Set(isLibraryImagePicker ? available.slice(0, 1) : available)');
    expect(source).toContain('applyLibraryImageToNode({');
    expect(source).toContain("kind === 'turnaround' ? '16:9' : '4:5'");
    expect(source).toContain("t('imageNode.libraryPicker.chooseAsNodeImage', '选择为节点图片')");
  });

  it('retains creation, editing, filtering, recents and canvas application', () => {
    expect(source).toContain('onClick={() => setEditing(null)}');
    expect(source).toContain('onClick={() => openEditor(activePreset)}');
    expect(source).toContain("t('library.character.filter', '角色筛选')");
    expect(source).toContain("t('library.character.recentlyUsed', '最近使用')");
    expect(source).toContain('onClick={() => handleApply(activePreset)}');
    expect(source).toContain('if (!isLibraryImagePicker) handleApply(preset)');
    expect(source).toContain('screenToFlowPosition');
    expect(source).toContain('characterReferenceGroupSize(referenceImages)');
    expect(source).toContain('groupSize.width / 2');
    expect(source).toContain('groupSize.height / 2');
    expect(source).toContain('preset.author?.toLocaleLowerCase().includes(normalizedQuery)');
    expect(source).toContain('{activePreset.author && (');
    expect(source).toContain('{preset.author && (');
    expect(source).toContain('preset.nationality?.toLocaleLowerCase().includes(normalizedQuery)');
  });
});
