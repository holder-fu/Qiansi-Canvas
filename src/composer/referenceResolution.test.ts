import { describe, expect, it } from 'vitest';
import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import type { ComposerReference } from './types';
import { connectedReferences, visibleComposerReferences } from './referenceResolution';

const REFERENCES: ComposerReference[] = [
  { id: 'image', type: 'image', label: '参考图', url: 'blob:image' },
  { id: 'video', type: 'video', label: '旧视频边', url: 'blob:video' },
  { id: 'text', type: 'text', label: '上游文本' },
];

function node(id: string, kind: NodeKind, data: Partial<FlowNode['data']> = {}): FlowNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind, title: id, ...data },
  } as FlowNode;
}

describe('composer reference visibility contract', () => {
  it('keeps image media but does not duplicate upstream text or legacy video in an image composer', () => {
    expect(visibleComposerReferences('image', REFERENCES).map((item) => item.id)).toEqual([
      'image',
    ]);
  });

  it('uses the dedicated context card instead of a duplicate text attachment in a text composer', () => {
    expect(visibleComposerReferences('text', REFERENCES).map((item) => item.id)).toEqual([
      'image',
      'video',
    ]);
  });

  it('retains video references in a video composer', () => {
    expect(visibleComposerReferences('video', REFERENCES)).toEqual(REFERENCES);
  });

  it('shows connected text and audio sources in a video composer before media generation', () => {
    const target = node('video-target', 'video');
    const sources = [
      node('image-source', 'image', { imageUrl: 'data:image/png;base64,reference' }),
      node('text-source', 'text', { prompt: 'sadfasdf' }),
      node('audio-source', 'audio'),
    ];
    const edges = sources.map((source) => ({ source: source.id, target: target.id }));
    const references = visibleComposerReferences(
      'video',
      connectedReferences([target], [...sources, target], edges),
    );

    expect(references.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 'image-source-image-0', type: 'image' },
      { id: 'text-source-text', type: 'text' },
      { id: 'audio-source-audio', type: 'audio' },
    ]);

    expect(
      connectedReferences([target], [...sources, target], edges.slice(0, 1)).map(
        ({ id, type }) => ({ id, type }),
      ),
    ).toEqual([{ id: 'image-source-image-0', type: 'image' }]);
  });

  it('retains the durable audio URL for capability checks and request submission', () => {
    const target = node('video-target', 'video');
    const audio = node('audio-source', 'audio', {
      audioUrl: '/asset-library/files/reference-audio',
      output: '/asset-library/files/reference-audio',
    });
    const [reference] = connectedReferences(
      [target],
      [audio, target],
      [{ source: audio.id, target: target.id }],
    );

    expect(reference).toMatchObject({
      id: 'audio-source-audio',
      type: 'audio',
      url: expect.stringContaining('/asset-library/files/reference-audio'),
    });
  });

  it('keeps outputText references from non-text output kinds', () => {
    const target = node('video-target', 'video');
    const pluginText = node('plugin-text', 'plugin', { outputText: '插件文本输出' });
    const emptyOutput = node('empty-output', 'output');

    expect(
      connectedReferences(
        [target],
        [pluginText, emptyOutput, target],
        [
          { source: pluginText.id, target: target.id },
          { source: emptyOutput.id, target: target.id },
        ],
      ).map(({ id, type }) => ({ id, type })),
    ).toEqual([{ id: 'plugin-text-text', type: 'text' }]);
  });
});
