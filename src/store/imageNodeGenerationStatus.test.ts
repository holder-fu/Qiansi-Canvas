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
  const provider = {
    id: 'image-provider',
    name: '图片模型',
    mark: 'IMG',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: [], image: ['image-model'], video: [] },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
  return {
    availableProviderModels: () => [],
    isProviderConnectionUsable: () => true,
    loadProviderConnections: () => [provider],
  };
});

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: mocks.hydrateApiKeys,
}));

import { applySharedProjectWorkspace, useCanvasStore } from './canvasStore';

function imageNode(): FlowNode {
  return {
    id: 'target-image',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      title: '未命名图片',
      prompt: '生成一张山峰图片',
      providerId: 'image-provider',
      model: 'image-model',
    },
  };
}

describe('image node generation status', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.hydrateApiKeys.mockReset();
    mocks.hydrateApiKeys.mockImplementation(async (providers: unknown) => providers);
    mocks.generateNodeContent.mockResolvedValue({
      imageUrl: 'https://example.test/generated-image.png',
    });
    useCanvasStore.setState({
      workspace: 'views',
      nodes: [imageNode()],
      edges: [],
      past: [],
      future: [],
    });
  });

  it('marks the image node as generating while provider credentials are still loading', async () => {
    let finishHydration: (() => void) | undefined;
    mocks.hydrateApiKeys.mockImplementation(
      (providers: unknown) =>
        new Promise((resolve) => {
          finishHydration = () => resolve(providers);
        }),
    );

    const generation = useCanvasStore.getState().generateNode('target-image');
    await vi.waitFor(() => expect(mocks.hydrateApiKeys).toHaveBeenCalledOnce());

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: true,
      progress: 0,
    });
    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toEqual(
      expect.any(String),
    );

    finishHydration?.();
    await generation;

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      progress: 100,
      imageUrl: 'https://example.test/generated-image.png',
    });
  });

  it('keeps a background image request attached when a visibility save is rebased', async () => {
    let finish: ((value: { imageUrl: string }) => void) | undefined;
    mocks.generateNodeContent.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const generation = useCanvasStore.getState().generateNode('target-image');
    await vi.waitFor(() => expect(mocks.generateNodeContent).toHaveBeenCalledOnce());
    const requestId = useCanvasStore.getState().nodes[0]?.data.generationRequestId;
    const state = useCanvasStore.getState();

    expect(
      applySharedProjectWorkspace({
        version: 2,
        projectId: state.activeProjectId,
        projectName: state.projectName,
        workspaces: { views: { nodes: [imageNode()], edges: [] } },
        tabs: state.tabs,
        assets: [],
        trash: [],
        genParams: state.genParams,
        activeTags: [],
      }),
    ).toBe(true);
    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: true,
      generationRequestId: requestId,
    });

    finish?.({ imageUrl: 'https://example.test/background-result.png' });
    await generation;

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      progress: 100,
      imageUrl: 'https://example.test/background-result.png',
    });
  });

  it('shows a background image failure after a visibility save is rebased', async () => {
    let fail: ((reason: Error) => void) | undefined;
    mocks.generateNodeContent.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );

    const generation = useCanvasStore.getState().generateNode('target-image');
    await vi.waitFor(() => expect(mocks.generateNodeContent).toHaveBeenCalledOnce());
    const state = useCanvasStore.getState();
    expect(
      applySharedProjectWorkspace({
        version: 2,
        projectId: state.activeProjectId,
        projectName: state.projectName,
        workspaces: { views: { nodes: [imageNode()], edges: [] } },
        tabs: state.tabs,
        assets: [],
        trash: [],
        genParams: state.genParams,
        activeTags: [],
      }),
    ).toBe(true);

    fail?.(new Error('供应商图片生成失败'));
    await expect(generation).rejects.toThrow('供应商图片生成失败');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      progress: 0,
      generationError: '供应商图片生成失败',
    });
  });

  it('clears the visible busy state when provider preparation fails', async () => {
    mocks.hydrateApiKeys.mockRejectedValue(new Error('密钥恢复失败'));

    await expect(useCanvasStore.getState().generateNode('target-image')).rejects.toThrow(
      '密钥恢复失败',
    );

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      progress: 0,
      generationError: '密钥恢复失败',
    });
  });

  it('keeps the exact request token when transport interruption needs registry recovery', async () => {
    mocks.generateNodeContent.mockImplementation(async (request: { requestId: string }) => {
      throw Object.assign(new Error('图片生成连接中断'), {
        generationRequestInterrupted: true,
        requestId: request.requestId,
        kind: 'image',
      });
    });

    await expect(useCanvasStore.getState().generateNode('target-image')).rejects.toThrow(
      '图片生成连接中断',
    );

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationRequestId: expect.stringMatching(/^gen-/),
      progress: 0,
      generationError: expect.stringContaining('检查生成结果'),
    });
  });

  it('rejects an empty image response instead of reporting generation success', async () => {
    mocks.generateNodeContent.mockResolvedValue({});

    await expect(useCanvasStore.getState().generateNode('target-image')).rejects.toThrow(
      '图片模型没有返回可用图片',
    );

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationError: expect.stringContaining('图片模型没有返回可用图片'),
    });
  });

  it('replaces stale upload aliases after a successful regeneration', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          ...imageNode(),
          data: {
            ...imageNode().data,
            imageUrl: '/asset-library/files/old-image',
            images: ['/asset-library/files/old-image'],
            originalUrl: '/asset-library/files/old-image',
            previewUrl: '/media-preview/files/old-image.webp',
            bridgeAssetId: 'old-asset-id',
            mediaPersistenceState: 'session-only',
            mediaMimeType: 'image/png',
          },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });
    mocks.generateNodeContent.mockResolvedValue({
      imageUrl: 'https://example.test/regenerated.png',
    });

    await useCanvasStore.getState().generateNode('target-image');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      imageUrl: 'https://example.test/regenerated.png',
      images: ['https://example.test/regenerated.png'],
      originalUrl: 'https://example.test/regenerated.png',
      output: 'https://example.test/regenerated.png',
      previewUrl: undefined,
      bridgeAssetId: undefined,
      mediaPersistenceState: undefined,
      mediaMimeType: undefined,
    });
  });

  it('ignores progress and results from a request whose node token was replaced', async () => {
    let finish: ((value: { imageUrl: string }) => void) | undefined;
    let reportProgress: ((progress: number) => void) | undefined;
    mocks.generateNodeContent.mockImplementation(
      (_request, onProgress) =>
        new Promise((resolve) => {
          reportProgress = onProgress;
          finish = resolve;
        }),
    );

    const generation = useCanvasStore.getState().generateNode('target-image');
    await vi.waitFor(() => expect(mocks.generateNodeContent).toHaveBeenCalledOnce());
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'target-image'
          ? {
              ...node,
              data: {
                ...node.data,
                prompt: '更新后的请求',
                generationRequestId: 'newer-request',
                progress: 7,
              },
            }
          : node,
      ),
    }));

    reportProgress?.(88);
    finish?.({ imageUrl: 'https://example.test/stale.png' });
    await generation;

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      prompt: '更新后的请求',
      generationRequestId: 'newer-request',
      progress: 7,
    });
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBeUndefined();
  });

  it('creates independent batch siblings without semantic edges at an absolute position', async () => {
    mocks.generateNodeContent.mockResolvedValue({
      images: ['https://example.test/generated-1.png', 'https://example.test/generated-2.png'],
    });
    const target = { ...imageNode(), parentId: 'group', position: { x: 20, y: 30 } };
    useCanvasStore.setState({
      nodes: [
        {
          id: 'group',
          type: 'group',
          position: { x: 1_000, y: 500 },
          data: { kind: 'group', title: '分组' },
        },
        target,
      ],
      edges: [],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-image');

    const sibling = useCanvasStore
      .getState()
      .nodes.find((node) => node.data.generatedBatchIndex === 2);
    expect(sibling?.parentId).toBeUndefined();
    expect(sibling?.position.x).toBeGreaterThan(1_000);
    expect(sibling?.position.y).toBe(530);
    expect(useCanvasStore.getState().edges).toEqual([]);
  });
});
