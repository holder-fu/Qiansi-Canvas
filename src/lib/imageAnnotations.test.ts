import { describe, expect, it } from 'vitest';
import {
  imageAnnotationInstruction,
  preferredImageReferenceUrls,
  type ImageAnnotationHint,
} from './imageAnnotations';

const hints: ImageAnnotationHint[] = [
  { id: 'a', kind: 'arrow', arrowStyle: 'straight' },
  { id: 'b', kind: 'label', label: '1' },
  { id: 'c', kind: 'text', label: '修改这里' },
];

describe('image annotation AI references', () => {
  it('uses the clean source when the original reference mode is selected', () => {
    expect(
      preferredImageReferenceUrls({
        imageUrl: 'annotated.png',
        annotationSourceUrl: 'original.png',
        aiReferenceMode: 'original',
      }),
    ).toEqual(['original.png']);
  });

  it('keeps annotated output as the default reference', () => {
    expect(
      preferredImageReferenceUrls({
        imageUrl: 'annotated.png',
        annotationSourceUrl: 'original.png',
        aiReferenceMode: 'annotated',
      }),
    ).toEqual(['annotated.png']);
  });

  it('replaces a renderer-only primary thumbnail with its persisted original', () => {
    expect(
      preferredImageReferenceUrls({
        imageUrl: '/asset-library/files/identity?preview=image&w=768',
        images: ['/media-preview/files/preview_identity.webp'],
        originalUrl: '/asset-library/files/identity',
      }),
    ).toEqual(['/asset-library/files/identity']);
  });

  it('keeps a full annotated result while discarding a redundant preview alias', () => {
    expect(
      preferredImageReferenceUrls({
        imageUrl: 'data:image/png;base64,annotated-full-result',
        images: ['/media-preview/files/preview_annotated.webp'],
        originalUrl: '/asset-library/files/clean-source',
        aiReferenceMode: 'annotated',
      }),
    ).toEqual(['data:image/png;base64,annotated-full-result']);
  });

  it('replaces only the primary preview and preserves later full-quality reference order', () => {
    expect(
      preferredImageReferenceUrls({
        imageUrl: '/media-preview/files/preview_primary.webp',
        images: [
          '/media-preview/files/preview_primary.webp',
          '/asset-library/files/second_original',
        ],
        originalUrl: '/asset-library/files/first_original',
      }),
    ).toEqual(['/asset-library/files/first_original', '/asset-library/files/second_original']);
  });

  it('falls back to the persisted clean original when an original-mode source became a preview', () => {
    expect(
      preferredImageReferenceUrls({
        annotationSourceUrl: '/asset-library/files/clean-source?preview=image&w=768',
        originalUrl: '/asset-library/files/clean-source',
        aiReferenceMode: 'original',
      }),
    ).toEqual(['/asset-library/files/clean-source']);
  });

  it('retains an orphaned preview so the final AI request guard reports the missing original', () => {
    const orphanedPreviews = [
      '/media-preview/files/preview_orphaned.webp',
      '/asset-library/files/orphaned?preview=image&w=768',
    ];
    expect(
      preferredImageReferenceUrls({
        imageUrl: orphanedPreviews[0],
        images: orphanedPreviews,
      }),
    ).toEqual(orphanedPreviews);
  });

  it('explains marker semantics and counts to the downstream model', () => {
    const prompt = imageAnnotationInstruction(hints);
    expect(prompt).toContain('AI 编辑指示');
    expect(prompt).toContain('1 个箭头');
    expect(prompt).toContain('1 个数字标记');
    expect(prompt).toContain('不要保留箭头');
  });

  it('adds normalized arrow-tip coordinates for models that follow text better than pixels', () => {
    const prompt = imageAnnotationInstruction([
      { id: 'arrow', kind: 'arrow', end: { x: 0.62, y: 0.48 } },
    ]);
    expect(prompt).toContain('左侧 62%、顶部 48%');
  });
});
