import { describe, expect, it } from 'vitest';
import { resolvedAudioSource } from '../lib/mediaPreview';
import { parseCanvasPersistence, stringifyCanvasPersistence } from './canvasPersistenceCodec';

describe('canvas persistence codec', () => {
  it('stores repeated inline reference media once and restores generated prompt fields', () => {
    const imageUrl = `data:image/jpeg;base64,${'A'.repeat(8_000)}`;
    const node = {
      id: 'prompt-source',
      data: {
        imageUrl,
        images: [imageUrl],
        output: imageUrl,
        composerReferences: [{ id: 'reference', type: 'image', url: imageUrl }],
        result: '雨夜霓虹街道，电影感构图。',
        outputText: '雨夜霓虹街道，电影感构图。',
      },
    };
    const canvas = {
      version: 4,
      workspaces: { views: { nodes: [node], edges: [] } },
      projectStates: {
        project: { workspace: 'views', workspaces: { views: { nodes: [node], edges: [] } } },
      },
    };

    const legacySize = JSON.stringify(canvas).length;
    const serialized = stringifyCanvasPersistence(canvas);
    const restored = parseCanvasPersistence<typeof canvas>(serialized);

    expect(serialized.match(/data:image\/jpeg/g)).toHaveLength(1);
    expect(serialized.length).toBeLessThan(legacySize / 4);
    expect(restored).toEqual(canvas);
    expect(restored.workspaces.views.nodes[0]?.data.outputText).toBe('雨夜霓虹街道，电影感构图。');
  });

  it('continues to read legacy plain-JSON saves', () => {
    const legacy = { version: 3, workspaces: { views: { nodes: [], edges: [] } } };
    expect(parseCanvasPersistence(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('recovers persisted audio Blobs from durable bridge asset ids across every workspace', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    const canvas = {
      version: 4,
      workspaces: {
        views: {
          nodes: [
            {
              id: 'audio-node',
              data: {
                kind: 'audio',
                audioUrl: expiredUrl,
                audios: [expiredUrl],
                output: expiredUrl,
                bridgeAssetId: 'asset_123456',
              },
            },
          ],
          edges: [],
        },
      },
    };

    const restored = parseCanvasPersistence<typeof canvas>(stringifyCanvasPersistence(canvas));
    const restoredNode = restored.workspaces.views.nodes[0];
    if (!restoredNode) throw new Error('Expected restored audio node.');
    const data = restoredNode.data;
    expect(data).toMatchObject({
      audioUrl: '/asset-library/files/asset_123456',
      audios: ['/asset-library/files/asset_123456'],
      output: '/asset-library/files/asset_123456',
      bridgeAssetId: 'asset_123456',
    });
    expect(resolvedAudioSource(data)).toBe(
      'http://127.0.0.1:2895/asset-library/files/asset_123456',
    );
  });

  it('keeps unrestorable audio metadata while exposing an actionable unavailable state', () => {
    const expiredUrl = 'blob:http://127.0.0.1/expired-audio';
    const legacy = {
      nodes: [
        {
          id: 'audio-node',
          data: {
            kind: 'audio',
            audioUrl: expiredUrl,
            audios: [expiredUrl],
            output: expiredUrl,
            audioFileName: 'voice.webm',
          },
        },
      ],
    };

    const restored = parseCanvasPersistence<typeof legacy>(JSON.stringify(legacy));
    const restoredNode = restored.nodes[0];
    if (!restoredNode) throw new Error('Expected restored audio node.');
    const data = restoredNode.data;
    expect(data).toMatchObject({
      audioUrl: expiredUrl,
      audios: [expiredUrl],
      output: expiredUrl,
      audioFileName: 'voice.webm',
      audioSourceState: 'unavailable-after-restore',
    });
    expect(resolvedAudioSource(data)).toBeUndefined();
  });
});
