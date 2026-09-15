import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
  hydrateApiKeys: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../services/generationSound', () => ({
  playGenerationCompleteSound: vi.fn(),
}));

vi.mock('../lib/providerRegistry', () => {
  const providers = [
    {
      id: 'image-provider',
      name: '图片模型',
      mark: 'IMG',
      protocol: 'openai',
      category: 'image',
      baseUrl: 'https://example.test/v1',
      apiKey: 'image-key',
      models: { chat: [], image: ['image-model'], video: [] },
      verifiedAt: Date.now(),
      enabled: true,
      canGenerate: true,
    },
    {
      id: 'video-provider',
      name: '视频模型',
      mark: 'VID',
      protocol: 'openai',
      category: 'video',
      baseUrl: 'https://example.test/v1',
      apiKey: 'video-key',
      models: { chat: [], image: [], video: ['video-model'] },
      verifiedAt: Date.now(),
      enabled: true,
      canGenerate: true,
    },
  ];
  return {
    availableProviderModels: () => [],
    isProviderConnectionUsable: () => true,
    loadProviderConnections: () => providers,
  };
});

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: mocks.hydrateApiKeys,
}));

import { useCanvasStore } from './canvasStore';

type MediaKind = 'image' | 'video';

function mediaNode(kind: MediaKind, id: string, prompt: string, x: number): FlowNode {
  return {
    id,
    type: kind,
    position: { x, y: 40 },
    data: {
      kind,
      title: id,
      prompt,
      providerId: `${kind}-provider`,
      model: `${kind}-model`,
      ...(kind === 'video' ? { genParams: { audio: false } } : {}),
    },
  };
}

describe('concurrent media generation identity', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.hydrateApiKeys.mockReset();
    mocks.hydrateApiKeys.mockImplementation(async (providers: unknown) => providers);
    useCanvasStore.setState({
      activeProjectId: 'main-canvas',
      workspace: 'views',
      nodes: [],
      edges: [],
      past: [],
      future: [],
    });
  });

  it.each(['image', 'video'] as const)(
    'keeps two concurrent %s batches on their own nodes when the second request finishes first',
    async (kind) => {
      type PendingGeneration = {
        requestId: string;
        reportProgress: (progress: number) => void;
        resolve: (value: Record<string, unknown>) => void;
      };
      const pending = new Map<string, PendingGeneration>();
      mocks.generateNodeContent.mockImplementation(
        (
          request: { prompt?: string; requestId?: string },
          onProgress?: (progress: number) => void,
        ) =>
          new Promise((resolve) => {
            pending.set(String(request.prompt), {
              requestId: String(request.requestId),
              reportProgress: onProgress ?? (() => {}),
              resolve,
            });
          }),
      );

      useCanvasStore.setState({
        nodes: [
          mediaNode(kind, `${kind}-a`, `${kind} prompt a`, 0),
          mediaNode(kind, `${kind}-b`, `${kind} prompt b`, 900),
        ],
      });

      const firstGeneration = useCanvasStore.getState().generateNode(`${kind}-a`);
      const secondGeneration = useCanvasStore.getState().generateNode(`${kind}-b`);
      await vi.waitFor(() => expect(pending.size).toBe(2));

      const first = pending.get(`${kind} prompt a`);
      const second = pending.get(`${kind} prompt b`);
      expect(first?.requestId).toMatch(/^gen-/);
      expect(second?.requestId).toMatch(/^gen-/);
      expect(first?.requestId).not.toBe(second?.requestId);

      first?.reportProgress(81);
      second?.reportProgress(54);
      expect(
        useCanvasStore.getState().nodes.find((node) => node.id === `${kind}-a`)?.data.progress,
      ).toBe(81);
      expect(
        useCanvasStore.getState().nodes.find((node) => node.id === `${kind}-b`)?.data.progress,
      ).toBe(54);

      const collectionKey = kind === 'image' ? 'images' : 'videos';
      const mediaKey = kind === 'image' ? 'imageUrl' : 'videoUrl';
      second?.resolve({
        [collectionKey]: [`https://example.test/${kind}-b-1`, `https://example.test/${kind}-b-2`],
      });
      await secondGeneration;

      const afterSecond = useCanvasStore.getState().nodes;
      expect(afterSecond.find((node) => node.id === `${kind}-b`)?.data[mediaKey]).toBe(
        `https://example.test/${kind}-b-1`,
      );
      expect(
        afterSecond.find((node) => node.data.generatedBatchSourceId === `${kind}-b`)?.data[
          mediaKey
        ],
      ).toBe(`https://example.test/${kind}-b-2`);
      expect(afterSecond.find((node) => node.id === `${kind}-a`)?.data).toMatchObject({
        generating: true,
        progress: 81,
      });
      expect(afterSecond.find((node) => node.id === `${kind}-a`)?.data[mediaKey]).toBeUndefined();

      first?.resolve({
        [collectionKey]: [`https://example.test/${kind}-a-1`, `https://example.test/${kind}-a-2`],
      });
      await firstGeneration;

      const completed = useCanvasStore.getState().nodes;
      expect(completed.find((node) => node.id === `${kind}-a`)?.data[mediaKey]).toBe(
        `https://example.test/${kind}-a-1`,
      );
      expect(
        completed.find((node) => node.data.generatedBatchSourceId === `${kind}-a`)?.data[mediaKey],
      ).toBe(`https://example.test/${kind}-a-2`);
      expect(
        completed
          .filter(
            (node) =>
              node.id === `${kind}-a` ||
              node.id === `${kind}-b` ||
              node.data.generatedBatchSourceId === `${kind}-a` ||
              node.data.generatedBatchSourceId === `${kind}-b`,
          )
          .every((node) => node.data.generationRequestId === undefined),
      ).toBe(true);
    },
  );

  it('keeps a successful video on its node when the other concurrent video fails later', async () => {
    type PendingVideo = {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
    };
    const pending = new Map<string, PendingVideo>();
    mocks.generateNodeContent.mockImplementation(
      (request: { prompt?: string }) =>
        new Promise((resolve, reject) => {
          pending.set(String(request.prompt), { resolve, reject });
        }),
    );
    useCanvasStore.setState({
      nodes: [
        mediaNode('video', 'video-success', 'successful video prompt', 0),
        mediaNode('video', 'video-failure', 'failing video prompt', 900),
      ],
    });

    const successfulGeneration = useCanvasStore.getState().generateNode('video-success');
    const failingGeneration = useCanvasStore.getState().generateNode('video-failure');
    await vi.waitFor(() => expect(pending.size).toBe(2));

    pending.get('successful video prompt')?.resolve({
      videos: ['https://example.test/video-success.mp4'],
    });
    await successfulGeneration;
    pending.get('failing video prompt')?.reject(new Error('provider video failure'));
    await expect(failingGeneration).rejects.toThrow('provider video failure');

    const completed = useCanvasStore.getState().nodes;
    expect(completed.find((node) => node.id === 'video-success')?.data).toMatchObject({
      videoUrl: 'https://example.test/video-success.mp4',
      generating: false,
      generationRequestId: undefined,
    });
    expect(completed.find((node) => node.id === 'video-failure')?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      generationError: 'provider video failure',
    });
    expect(completed.find((node) => node.id === 'video-failure')?.data.videoUrl).toBeUndefined();
  });
});
