import { describe, expect, it } from 'vitest';
import {
  buildComposerReferencePatch,
  excludeTextSourcesFromSubmission,
  filterExcludedComposerReferences,
  filterExcludedTextSources,
  orderComposerReferences,
  resolveSubmittedReferenceAudios,
  resolveSubmittedReferenceImages,
  resolveSubmittedReferenceVideos,
} from './referenceSubmission';

const image = (id: string, url: string) => ({ id, type: 'image' as const, url, label: id });
const video = (id: string, url: string) => ({ id, type: 'video' as const, url, label: id });
const audio = (id: string, url: string) => ({ id, type: 'audio' as const, url, label: id });

describe('composer reference submission', () => {
  it('preserves a display preview while filtering connected references', () => {
    const connected = {
      ...image('node-a-image-0', 'blob:full-quality-image'),
      previewUrl: 'http://127.0.0.1:2895/asset-library/files/source-image?preview=image',
    };

    expect(filterExcludedComposerReferences([connected], null)).toEqual([connected]);
  });

  it('records the exact submitted set and filters a removed upstream image', () => {
    const first = image('node-a-image-0', 'data:image/png;base64,a');
    const second = image('node-b-image-0', 'data:image/png;base64,b');
    const patch = buildComposerReferencePatch([first, second], [second]);

    expect(patch.composerReferences).toEqual([second]);
    expect(patch.composerReferenceSubmission.excludedReferenceIds).toEqual([first.id]);
    expect(
      filterExcludedComposerReferences([first, second], patch.composerReferenceSubmission),
    ).toEqual([second]);
    expect(
      resolveSubmittedReferenceImages(
        [first.url, second.url],
        patch.composerReferenceSubmission,
        patch.composerReferences,
      ),
    ).toEqual([second.url]);
  });

  it('uses the explicit thumbnail order for image submission and appends new upstream images', () => {
    const first = image('first', 'data:image/png;base64,first');
    const second = image('second', 'data:image/png;base64,second');
    const added = image('added', 'data:image/png;base64,added');
    const reordered = buildComposerReferencePatch([first, second], [second, first]);

    expect(
      orderComposerReferences([first, second, added], reordered.composerReferenceSubmission),
    ).toEqual([second, first, added]);

    expect(
      resolveSubmittedReferenceImages(
        [first.url, second.url, added.url],
        reordered.composerReferenceSubmission,
        reordered.composerReferences,
      ),
    ).toEqual([second.url, first.url, added.url]);
  });

  it('keeps previous exclusions until the same reference is explicitly re-added', () => {
    const first = image('node-a-image-0', 'data:image/png;base64,a');
    const removed = buildComposerReferencePatch([first], []);
    const retained = buildComposerReferencePatch([], [], removed.composerReferenceSubmission);
    expect(retained.composerReferenceSubmission.excludedReferenceIds).toEqual([first.id]);

    const reAdded = buildComposerReferencePatch([], [first], retained.composerReferenceSubmission);
    expect(reAdded.composerReferenceSubmission.excludedReferenceIds).toEqual([]);
    expect(reAdded.composerReferenceSubmission.excludedReferenceUrls).toEqual([]);
  });

  it('submits the selected connected video and honors an explicit removal', () => {
    const reference = video('node-video-video', 'https://example.test/reference.mp4');
    const selected = buildComposerReferencePatch([reference], [reference]);
    expect(
      resolveSubmittedReferenceVideos(
        [reference.url],
        selected.composerReferenceSubmission,
        selected.composerReferences,
      ),
    ).toEqual([reference.url]);

    const removed = buildComposerReferencePatch(
      [reference],
      [],
      selected.composerReferenceSubmission,
    );
    expect(
      resolveSubmittedReferenceVideos(
        [reference.url],
        removed.composerReferenceSubmission,
        removed.composerReferences,
      ),
    ).toEqual([]);
  });

  it('merges manual audio references and honors an explicit removal', () => {
    const connected = audio('connected-audio', 'https://example.test/connected.wav');
    const manual = audio('manual-audio', 'https://example.test/manual.mp3');
    const selected = buildComposerReferencePatch([connected], [connected, manual]);
    expect(
      resolveSubmittedReferenceAudios(
        [connected.url],
        selected.composerReferenceSubmission,
        selected.composerReferences,
      ),
    ).toEqual([connected.url, manual.url]);

    const removed = buildComposerReferencePatch(
      [connected, manual],
      [connected],
      selected.composerReferenceSubmission,
    );
    expect(
      resolveSubmittedReferenceAudios(
        [connected.url],
        removed.composerReferenceSubmission,
        removed.composerReferences,
      ),
    ).toEqual([connected.url]);
  });

  it('preserves effect semantics and trims effect guidance in the submitted reference', () => {
    const effectReference = {
      ...video('effect-video', 'https://example.test/effect.mp4'),
      role: 'effect' as const,
      effectPresetId: '  effect-earth-zoom  ',
      effectPrompt: '  镜头快速拉远并显露完整地球  ',
    };
    const patch = buildComposerReferencePatch([effectReference], [effectReference]);

    expect(patch.composerReferences).toEqual([
      {
        ...effectReference,
        effectPresetId: 'effect-earth-zoom',
        effectPrompt: '镜头快速拉远并显露完整地球',
      },
    ]);
    expect(patch.composerReferenceSubmission.references).toEqual(patch.composerReferences);
    expect(
      filterExcludedComposerReferences([effectReference], patch.composerReferenceSubmission),
    ).toEqual(patch.composerReferences);
  });

  it('preserves a locked director reference while excluding a removable reference', () => {
    const directorReference = {
      ...image('director-layout-image-0', 'data:image/png;base64,director-layout'),
      label: '参考图 1 · 导演构图控制图',
      locked: true,
    };
    const removableReference = image('manual-image', 'data:image/png;base64,manual');
    const patch = buildComposerReferencePatch(
      [directorReference, removableReference],
      [directorReference],
    );

    expect(patch.composerReferences).toEqual([directorReference]);
    expect(patch.composerReferenceSubmission.references).toEqual([directorReference]);
    expect(patch.composerReferenceSubmission.excludedReferenceIds).toEqual([removableReference.id]);
    expect(
      filterExcludedComposerReferences(
        [directorReference, removableReference],
        patch.composerReferenceSubmission,
      ),
    ).toEqual([directorReference]);
  });

  it('dismisses upstream text without changing media references or graph state', () => {
    const reference = image('manual-image', 'data:image/png;base64,manual');
    const selected = buildComposerReferencePatch([reference], [reference]);
    const sourcePrompt = '上游完整提示词';
    const dismissed = excludeTextSourcesFromSubmission(selected.composerReferenceSubmission, [
      sourcePrompt,
      '   ',
    ]);

    expect(dismissed.references).toEqual([reference]);
    expect(dismissed.excludedTextSources).toEqual([sourcePrompt]);
    expect(filterExcludedTextSources([sourcePrompt, '新的上游提示词'], dismissed)).toEqual([
      '新的上游提示词',
    ]);
  });

  it('preserves dismissed text when a later submit updates media references', () => {
    const sourcePrompt = '不再提交的上游提示词';
    const dismissed = excludeTextSourcesFromSubmission(undefined, [sourcePrompt]);
    const updated = buildComposerReferencePatch([], [], dismissed);

    expect(updated.composerReferenceSubmission.excludedTextSources).toEqual([sourcePrompt]);
  });
});
