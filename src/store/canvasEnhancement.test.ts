import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
  cutoutPersonLocally: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/personCutout', () => ({
  cutoutPersonLocally: mocks.cutoutPersonLocally,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = {
    id: 'image-provider',
    name: '图片编辑模型',
    mark: 'IMG',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: [], image: ['edit-model'], video: [] },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
  return {
    availableProviderModels: () => [
      {
        key: 'image-provider\0edit-model',
        providerId: 'image-provider',
        providerName: '图片编辑模型',
        model: 'edit-model',
        displayName: 'edit-model',
        label: '图片编辑模型 · edit-model',
        recommended: false,
      },
    ],
    isProviderConnectionUsable: () => true,
    isProviderConnectionVerified: () => true,
    loadProviderConnections: () => [provider],
  };
});

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: async (providers: unknown) => providers,
}));

import { useCanvasStore } from './canvasStore';

function sourceImageNode(): FlowNode {
  return {
    id: 'image-source',
    type: 'image',
    position: { x: 100, y: 100 },
    selected: true,
    data: {
      kind: 'image',
      title: '产品主图',
      imageUrl: 'data:image/png;base64,source',
      previewUrl: 'data:image/webp;base64,source-preview',
      aspectRatio: '1:1',
      genParams: { quality: '2K' },
    },
  };
}

describe('direct image enhancement', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.cutoutPersonLocally.mockReset();
    useCanvasStore.setState({
      nodes: [sourceImageNode()],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: 'image-source',
    });
  });

  it('edits the current image with the source image as a real model reference', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(64);
      return { imageUrl: 'http://127.0.0.1:2895/output/enhanced.png' };
    });

    const completed = await useCanvasStore.getState().applyEnhancement('image-source', 'panorama');
    const state = useCanvasStore.getState();

    expect(completed).toBe(true);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        count: 1,
        aspectRatio: '21:9',
        imageType: '720全景',
        provider: expect.objectContaining({ model: 'edit-model' }),
      }),
      expect.any(Function),
    );
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(0);
    expect(state.nodes[0]?.data).toMatchObject({
      imageUrl: 'http://127.0.0.1:2895/output/enhanced.png',
      images: ['http://127.0.0.1:2895/output/enhanced.png'],
      enhancementTool: 'panorama',
      generating: false,
      progress: 100,
      aspectRatio: '21:9',
    });
    expect(state.past).toHaveLength(1);
    expect(state.past[0]?.nodes[0]?.data.imageUrl).toBe('data:image/png;base64,source');

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBe('data:image/png;base64,source');
  });

  it('keeps the original image and exposes the model error when editing fails', async () => {
    mocks.generateNodeContent.mockRejectedValue(new Error('上游图片编辑失败'));

    await expect(
      useCanvasStore.getState().applyEnhancement('image-source', 'lighting'),
    ).rejects.toThrow('上游图片编辑失败');

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.data).toMatchObject({
      imageUrl: 'data:image/png;base64,source',
      generating: false,
      progress: 0,
      enhancementError: '上游图片编辑失败',
    });
  });

  it('blocks enhancement and reports when the composer-selected image model is unavailable', async () => {
    const source = sourceImageNode();
    useCanvasStore.setState({
      nodes: [
        {
          ...source,
          data: {
            ...source.data,
            providerId: 'removed-provider',
            model: 'removed-image-model',
          },
        },
      ],
    });

    const completed = await useCanvasStore
      .getState()
      .applyEnhancement('image-source', 'face-control', '视线保持正视');
    const state = useCanvasStore.getState();

    expect(completed).toBe(false);
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(state.nodes[0]?.data).toMatchObject({
      imageUrl: 'data:image/png;base64,source',
      enhancementError: '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。',
    });
    expect(state.past).toHaveLength(0);
  });

  it('creates a connected downstream image node for face-control generation', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(52);
      return { imageUrl: 'http://127.0.0.1:2895/output/face-controlled.png' };
    });

    const completed = await useCanvasStore
      .getState()
      .createFaceControlResult(
        'image-source',
        '只调整已识别框选的人脸。该人脸位于原图左侧约 20%、顶部约 10%。',
      );
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'http://127.0.0.1:2895/output/face-controlled.png',
      images: ['http://127.0.0.1:2895/output/face-controlled.png'],
      enhancementTool: 'face-control',
      generating: false,
      progress: 100,
    });
    expect(target?.position.x).toBeGreaterThan(source?.position.x ?? 0);
    expect(state.edges).toEqual([
      expect.objectContaining({ source: 'image-source', target: target?.id, type: 'flow' }),
    ]);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        prompt: expect.stringContaining('左侧约 20%'),
        provider: expect.objectContaining({ model: 'edit-model' }),
      }),
      expect.any(Function),
    );
    expect(state.selectedNodeId).toBe(target?.id);
    expect(state.past).toHaveLength(1);
  });

  it('creates a connected 21:9 scene node for panorama generation', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(48);
      return { imageUrl: 'http://127.0.0.1:2895/output/panorama-scene.png' };
    });

    const completed = await useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'panorama');
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'http://127.0.0.1:2895/output/panorama-scene.png',
      aspectRatio: '21:9',
      enhancementTool: 'panorama',
      composerParams: { imageType: '场景全景图' },
      genParams: expect.objectContaining({ quality: '4K' }),
      generating: false,
      progress: 100,
    });
    expect(target?.data.title).toContain('全景场景');
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'image-source',
        target: target?.id,
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        aspectRatio: '21:9',
        quality: '4K',
        imageType: '720全景',
        prompt: expect.stringContaining('场景图片'),
      }),
      expect.any(Function),
    );
    expect(state.selectedNodeId).toBe(target?.id);
  });

  it('creates a connected 4K result node for quality restoration without replacing the source', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(56);
      return { imageUrl: 'http://127.0.0.1:2895/output/quality-restored.png' };
    });

    const completed = await useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'quality-restore');
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'http://127.0.0.1:2895/output/quality-restored.png',
      aspectRatio: '1:1',
      enhancementTool: 'quality-restore',
      genParams: expect.objectContaining({ quality: '4K', count: 1 }),
      generating: false,
      progress: 100,
    });
    expect(target?.data.title).toContain('高清修复');
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'image-source',
        target: target?.id,
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        aspectRatio: '1:1',
        quality: '4K',
        prompt: expect.stringContaining('严格保留原图画幅比例'),
      }),
      expect.any(Function),
    );
    expect(state.selectedNodeId).toBe(target?.id);
  });

  it('creates a connected transparent portrait node without replacing the source', async () => {
    mocks.cutoutPersonLocally.mockResolvedValue({
      imageUrl: 'data:image/png;base64,local-cutout',
      method: 'interactive',
    });

    const completed = await useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'portrait-cutout');
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'data:image/png;base64,local-cutout',
      images: ['data:image/png;base64,local-cutout'],
      enhancementTool: 'portrait-cutout',
      cutoutMethod: 'interactive',
      generating: false,
      progress: 100,
    });
    expect(target?.data.title).toContain('人像抠图');
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'image-source',
        target: target?.id,
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
    expect(mocks.cutoutPersonLocally).toHaveBeenCalledWith('data:image/png;base64,source');
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(state.selectedNodeId).toBe(target?.id);
  });

  it('shows the downstream portrait node while local segmentation is still running', async () => {
    let finishCutout:
      ((result: { imageUrl: string; method: 'interactive' | 'multiclass' }) => void) | undefined;
    mocks.cutoutPersonLocally.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCutout = resolve;
        }),
    );

    const pending = useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'portrait-cutout');
    const queuedState = useCanvasStore.getState();
    const queuedTarget = queuedState.nodes.find((node) => node.id !== 'image-source');

    expect(queuedTarget?.data).toMatchObject({
      enhancementTool: 'portrait-cutout',
      prompt: '',
      generating: true,
      progress: 10,
      imagePreviewUrl: 'data:image/png;base64,source',
      imagePreviewPosterUrl: 'data:image/webp;base64,source-preview',
    });
    expect(queuedTarget?.data.providerId).toBeUndefined();
    expect(queuedTarget?.data.model).toBeUndefined();
    expect(queuedState.edges).toContainEqual(
      expect.objectContaining({ source: 'image-source', target: queuedTarget?.id }),
    );
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(finishCutout).toBeTypeOf('function'));
    finishCutout?.({
      imageUrl: 'data:image/png;base64,finished-local-cutout',
      method: 'interactive',
    });
    await expect(pending).resolves.toBe(true);
  });

  it('creates a connected smart-cutout node after identifying the main subject', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(67);
      return { imageUrl: 'http://127.0.0.1:2895/output/smart-cutout.png' };
    });

    const completed = await useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'cutout');
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'http://127.0.0.1:2895/output/smart-cutout.png',
      enhancementTool: 'cutout',
      enhancementLabel: '智能扣图',
      generating: false,
      progress: 100,
    });
    expect(target?.data.title).toContain('智能扣图');
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'image-source',
        target: target?.id,
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        aspectRatio: '1:1',
        quality: '2K',
        prompt: expect.stringContaining('视觉上最主要的主体'),
      }),
      expect.any(Function),
    );
    expect(state.selectedNodeId).toBe(target?.id);
  });

  it('creates a connected text-removal node without replacing the source', async () => {
    mocks.generateNodeContent.mockImplementation(async (_request, onProgress) => {
      onProgress?.(72);
      return { imageUrl: 'http://127.0.0.1:2895/output/text-removed.png' };
    });

    const completed = await useCanvasStore
      .getState()
      .createLinkedEnhancementResult('image-source', 'remove-text');
    const state = useCanvasStore.getState();
    const source = state.nodes.find((node) => node.id === 'image-source');
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(source?.data.imageUrl).toBe('data:image/png;base64,source');
    expect(target?.data).toMatchObject({
      kind: 'image',
      imageUrl: 'http://127.0.0.1:2895/output/text-removed.png',
      enhancementTool: 'remove-text',
      enhancementLabel: '去文字',
      generating: false,
      progress: 100,
    });
    expect(target?.data.title).toContain('去文字');
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'image-source',
        target: target?.id,
        sourceHandle: 'image',
        targetHandle: 'ref',
        type: 'flow',
      }),
    ]);
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source'],
        aspectRatio: '1:1',
        prompt: expect.stringContaining('文字、字幕、标识、签名和水印'),
      }),
      expect.any(Function),
    );
    expect(state.selectedNodeId).toBe(target?.id);
  });

  it('does not create a face-control result node when the selected model is unavailable', async () => {
    const source = sourceImageNode();
    useCanvasStore.setState({
      nodes: [
        {
          ...source,
          data: {
            ...source.data,
            providerId: 'removed-provider',
            model: 'removed-image-model',
          },
        },
      ],
    });

    const completed = await useCanvasStore
      .getState()
      .createFaceControlResult('image-source', '调整已框选人物的表情');
    const state = useCanvasStore.getState();

    expect(completed).toBe(false);
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(0);
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(state.nodes[0]?.data.enhancementError).toBe(
      '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。',
    );
  });

  it('creates a downstream pose result using the source and skeleton guide references', async () => {
    mocks.generateNodeContent.mockResolvedValue({
      images: [
        'http://127.0.0.1:2895/output/pose-a.png',
        'http://127.0.0.1:2895/output/pose-b.png',
      ],
    });
    const poseGuideUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%3Epose%3C%2Fsvg%3E';

    const completed = await useCanvasStore
      .getState()
      .createPoseControlResult('image-source', '左臂举起，身体向右倾斜', poseGuideUrl, {
        quality: '4K',
        count: 2,
      });
    const state = useCanvasStore.getState();
    const target = state.nodes.find((node) => node.id !== 'image-source');

    expect(completed).toBe(true);
    expect(state.nodes.find((node) => node.id === 'image-source')?.data.imageUrl).toBe(
      'data:image/png;base64,source',
    );
    expect(target?.data).toMatchObject({
      enhancementTool: 'pose-adjust',
      imageUrl: 'http://127.0.0.1:2895/output/pose-a.png',
      images: [
        'http://127.0.0.1:2895/output/pose-a.png',
        'http://127.0.0.1:2895/output/pose-b.png',
      ],
      generating: false,
    });
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        referenceImages: ['data:image/png;base64,source', poseGuideUrl],
        quality: '4K',
        count: 2,
        prompt: expect.stringContaining('左臂举起'),
      }),
      expect.any(Function),
    );
    expect(state.edges).toContainEqual(
      expect.objectContaining({ source: 'image-source', target: target?.id }),
    );
  });

  it('exposes the downstream pose node as generating before the provider request finishes', async () => {
    let finishGeneration: ((result: { imageUrl: string }) => void) | undefined;
    mocks.generateNodeContent.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishGeneration = resolve;
        }),
    );

    const pending = useCanvasStore
      .getState()
      .createPoseControlResult(
        'image-source',
        '保持风格与背景，只调整动作',
        'data:image/png;base64,pose-guide',
        { quality: '2K', count: 1 },
      );
    const queuedState = useCanvasStore.getState();
    const queuedTarget = queuedState.nodes.find((node) => node.id !== 'image-source');

    expect(queuedTarget?.data).toMatchObject({
      enhancementTool: 'pose-adjust',
      generating: true,
      progress: 0,
      imagePreviewUrl: 'data:image/png;base64,source',
      imagePreviewPosterUrl: 'data:image/webp;base64,source-preview',
    });
    expect(queuedState.selectedNodeId).toBe(queuedTarget?.id);
    expect(queuedState.edges).toContainEqual(
      expect.objectContaining({ source: 'image-source', target: queuedTarget?.id }),
    );

    await vi.waitFor(() => expect(finishGeneration).toBeTypeOf('function'));
    finishGeneration?.({ imageUrl: 'http://127.0.0.1:2895/output/pose-finished.png' });
    await expect(pending).resolves.toBe(true);
  });
});
