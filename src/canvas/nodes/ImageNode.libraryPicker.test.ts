import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('ImageNode library image pickers', () => {
  it('shows Style and Character Library choices directly below the local upload action', () => {
    const uploadIndex = source.indexOf("t('imageNode.upload.image', '上传图片')");
    const styleIndex = source.indexOf("t('imageNode.upload.fromStyleLibrary', '从风格库')");
    const characterIndex = source.indexOf("t('imageNode.upload.fromCharacterLibrary', '从角色库')");

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(styleIndex).toBeGreaterThan(uploadIndex);
    expect(characterIndex).toBeGreaterThan(styleIndex);
    expect(source).toContain("openLibraryImagePicker('style-library', id)");
    expect(source).toContain("openLibraryImagePicker('character-library', id)");
    expect(source).toContain('{!isVideoNode && (');
  });
});
