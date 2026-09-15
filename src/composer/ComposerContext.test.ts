import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ComposerProvider, useComposer } from './ComposerContext';
import {
  buildComposerReferencePatch,
  filterExcludedComposerReferences,
  resolveSubmittedReferenceImages,
} from './referenceSubmission';
import { dedupeComposerReferences } from './referenceResolution';
import type { ComposerReference, ComposerState } from './types';
import composerSource from './AICommandComposer.tsx?raw';
import floatingSource from './FloatingAIComposer.tsx?raw';

function mountSnapshot(
  initialState: Partial<ComposerState>,
  onReferenceRemove: (state: ComposerState) => void,
) {
  let context: ReturnType<typeof useComposer> | undefined;
  function Capture() {
    context = useComposer();
    return null;
  }
  const props: ComponentProps<typeof ComposerProvider> = {
    runtime: {} as never,
    genParams: {} as never,
    initialState,
    onReferenceRemove,
    onGenParamChange: () => {},
    onSubmit: () => {},
    isGenerating: false,
    children: createElement(Capture),
  };
  renderToStaticMarkup(createElement(ComposerProvider, props));
  if (!context) throw new Error('Provider did not render');
  return context;
}

describe('reference dismissal before generation', () => {
  const first: ComposerReference = {
    id: 'upstream-image',
    type: 'image',
    label: '上游图',
    url: '/asset-library/files/first',
  };
  const second: ComposerReference = {
    id: 'local-image',
    type: 'image',
    label: '本地图',
    url: '/asset-library/files/second',
  };

  it('commits a dismissal synchronously and restores the filtered references on re-entry', () => {
    const initial = [first, second];
    const onRemove = vi.fn();
    mountSnapshot(
      { references: initial, prompt: '保留草稿', params: { mode: 'image_edit', model: 'chosen' } },
      onRemove,
    ).removeReference(first.id);
    expect(onRemove).toHaveBeenCalledTimes(1);
    const next: ComposerState = onRemove.mock.calls[0]?.[0];
    expect(next).toMatchObject({
      prompt: '保留草稿',
      params: { mode: 'image_edit', model: 'chosen' },
      references: [second],
    });
    const saved = buildComposerReferencePatch(initial, next.references);
    // Re-enter from a serialized node snapshot, without ever submitting generation.
    const restored = JSON.parse(JSON.stringify(saved)) as typeof saved;
    const reopenedReferences = dedupeComposerReferences([
      ...filterExcludedComposerReferences([first], restored.composerReferenceSubmission),
      ...restored.composerReferences,
    ]);
    const reopened = mountSnapshot({ ...next, references: reopenedReferences }, onRemove);
    expect(reopened.state.references).toEqual([second]);
    expect(
      resolveSubmittedReferenceImages(
        [first.url ?? ''],
        restored.composerReferenceSubmission,
        restored.composerReferences,
      ),
    ).toEqual([second.url]);
    reopened.removeReference(second.id);
    const empty = buildComposerReferencePatch(
      reopenedReferences,
      onRemove.mock.calls[1]?.[0].references,
      restored.composerReferenceSubmission,
    );
    expect(empty.composerReferences).toEqual([]);
    expect(filterExcludedComposerReferences(initial, empty.composerReferenceSubmission)).toEqual(
      [],
    );
  });

  it('does not persist a removal for a locked or missing reference', () => {
    const onRemove = vi.fn();
    const context = mountSnapshot({ references: [{ ...first, locked: true }] }, onRemove);
    context.removeReference(first.id);
    context.removeReference('missing');
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('commits a reordered reference state immediately', () => {
    const onReorder = vi.fn();
    let context: ReturnType<typeof useComposer> | undefined;
    function Capture() {
      context = useComposer();
      return null;
    }
    renderToStaticMarkup(
      createElement(ComposerProvider, {
        runtime: {} as never,
        genParams: {} as never,
        initialState: { references: [first, second], prompt: '顺序草稿' },
        onReferenceReorder: onReorder,
        onGenParamChange: () => {},
        onSubmit: () => {},
        isGenerating: false,
        children: createElement(Capture),
      }),
    );
    context?.reorderReference(first.id, second.id, 'after');
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '顺序草稿', references: [second, first] }),
    );
  });

  it('commits an added local media reference immediately', () => {
    const onAdd = vi.fn();
    let context: ReturnType<typeof useComposer> | undefined;
    function Capture() {
      context = useComposer();
      return null;
    }
    renderToStaticMarkup(
      createElement(ComposerProvider, {
        runtime: {} as never,
        genParams: {} as never,
        initialState: { references: [first], prompt: '视频指令' },
        onReferenceAdd: onAdd,
        onGenParamChange: () => {},
        onSubmit: () => {},
        isGenerating: false,
        children: createElement(Capture),
      }),
    );
    const audioReference: ComposerReference = {
      id: 'local-audio',
      type: 'audio',
      label: '参考音频',
      url: '/asset-library/files/audio',
    };
    const videoReference: ComposerReference = {
      id: 'local-video',
      type: 'video',
      label: '参考视频',
      url: '/asset-library/files/video',
    };
    context?.addReference(audioReference);
    context?.addReference(videoReference);
    context?.addReference(audioReference);
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '视频指令',
        references: [
          first,
          expect.objectContaining({ id: 'local-audio', type: 'audio' }),
          expect.objectContaining({ id: 'local-video', type: 'video' }),
        ],
      }),
    );
  });

  it('connects the dismissal event to the selected node and preserves current parameters', () => {
    expect(composerSource).toContain('onReferenceAdd={onReferenceAdd}');
    expect(composerSource).toContain('onReferenceRemove={onReferenceRemove}');
    expect(composerSource).toContain('onReferenceReorder={onReferenceReorder}');
    expect(floatingSource).toContain('onReferenceAdd={handleReferenceStateChange}');
    expect(floatingSource).toContain('onReferenceRemove={handleReferenceStateChange}');
    expect(floatingSource).toContain('onReferenceReorder={handleReferenceStateChange}');
    expect(floatingSource).toContain(
      'composerParams: { ...node.data.composerParams, ...state.params }',
    );
    expect(floatingSource).toContain('...composerPromptPatch(node.data.kind, state.prompt)');
  });
});
