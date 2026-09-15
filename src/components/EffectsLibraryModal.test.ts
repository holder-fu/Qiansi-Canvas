import { describe, expect, it } from 'vitest';
import source from './EffectsLibraryModal.tsx?raw';

describe('effects library animated WebP workflow', () => {
  it('offers complete effect import and selected-or-all export', () => {
    expect(source).toContain('<LibraryTransferActions');
    expect(source).toContain('kind="effect"');
    expect(source).toContain('items={allPresets.map');
  });

  it('keeps legacy video metadata visible only as a conversion prompt', () => {
    expect(source).toContain("'这是旧版视频特效，请先编辑并重新上传动态 WebP。'");
    expect(source).toContain("t('library.effects.legacyVideo', '旧视频，需转换')");
    expect(source).not.toContain('loadEffectVideo');
    expect(source).not.toContain('persistVideoFile');
  });

  it('validates and persists the original animated WebP before saving', () => {
    expect(source).toContain('onPrepareMediaForSave={async ({ value, mediaFile }) => {');
    expect(source).toContain(
      "const persisted = await persistImageFile(mediaFile, 'storyboard', activeProjectId)",
    );
    expect(source).toContain('await inspectAnimatedWebp(mediaFile)');
    expect(source).toContain('originalImage: persisted.originalUrl');
    expect(source).toContain('previewUrl: persisted.previewUrl');
    expect(source).not.toContain('saveEffectVideo');
    expect(source).not.toContain('onSaveMedia=');
  });

  it('renders native WebP cards and never treats a missing file as an applicable effect', () => {
    expect(source).toContain("type EffectLibraryTab = 'plaza' | 'favorites' | 'recent'");
    expect(source).toContain("t('library.effects.searchAuthor'");
    expect(source).toContain('<EffectWebpPreview');
    expect(source).toContain('2xl:grid-cols-8');
    expect(source).toContain("t('library.effects.webpRequired'");
    expect(source).toContain('mediaAccept="image/webp,.webp"');
    expect(source).toContain('else openEditor(preset)');
    expect(source).toContain('applyEffectPreset({');
    expect(source).not.toContain('deleteEffectVideo');
  });

  it('uses a concise upload action without repeating the upload label as a corner badge', () => {
    expect(source).toContain("t('library.effects.upload', '上传特效')");
    expect(source).toContain('showImageUploadBadge={false}');
    expect(source).toContain(
      "imageUploadLabel={t('library.effects.uploadAnimatedWebp', '上传动态 WebP')}",
    );
  });

  it('replaces maximize with a header sort menu applied after filtering', () => {
    expect(source).toContain('headerActions={');
    expect(source).toContain('data-effects-sort-trigger="true"');
    expect(source).toContain("['recommended', 'recent', 'uses', 'name']");
    expect(source).toContain('sortEffectLibraryItems(list, sort, useCounts, language)');
    expect(source).not.toContain('onToggleMaximize=');
    expect(source).not.toContain('const [maximized');
  });
});
