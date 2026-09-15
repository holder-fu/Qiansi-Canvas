import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowEdge, FlowNode } from '../canvas/nodeTypes';

const mocks = vi.hoisted(() => ({
  extractVideoReferenceFrames: vi.fn(),
  generateNodeContent: vi.fn(),
  inputModalities: ['text', 'image'] as Array<'text' | 'image'>,
}));

vi.mock('../lib/videoFrameExtraction', () => ({
  extractVideoReferenceFrames: mocks.extractVideoReferenceFrames,
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  return {
    availableProviderModels: () => [
      {
        key: 'vision-provider\0vision-model',
        providerId: 'vision-provider',
        providerName: '视觉理解模型',
        model: 'vision-model',
        displayName: 'vision-model',
        label: '视觉理解模型 · vision-model',
        recommended: false,
      },
    ],
    isProviderConnectionUsable: () => true,
    isProviderConnectionVerified: () => true,
    loadProviderConnections: () => [
      {
        id: 'vision-provider',
        name: '视觉理解模型',
        mark: 'VISION',
        protocol: 'openai',
        category: 'chat',
        baseUrl: 'https://example.test/v1',
        apiKey: 'test-key',
        models: { chat: ['vision-model'], image: [], video: [] },
        modelCapabilities: {
          'vision-model': { inputModalities: [...mocks.inputModalities] },
        },
        verifiedAt: Date.now(),
        enabled: true,
        canGenerate: true,
      },
    ],
  };
});

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: async (providers: unknown) => providers,
}));

import { useCanvasStore } from './canvasStore';

const videoNode: FlowNode = {
  id: 'reference-video',
  type: 'video',
  position: { x: 100, y: 100 },
  data: {
    kind: 'video',
    title: '参考视频',
    videoUrl: 'http://127.0.0.1:2895/assets/reference.mp4',
    videos: ['http://127.0.0.1:2895/assets/reference.mp4'],
    output: 'http://127.0.0.1:2895/assets/reference.mp4',
    referenceOnly: true,
  },
};

const textNode: FlowNode = {
  id: 'prompt-text',
  type: 'text',
  position: { x: 720, y: 100 },
  data: {
    kind: 'text',
    title: '提示词',
    prompt: '分析前置视频并反推提示词。',
    providerId: 'vision-provider',
    model: 'vision-model',
  },
};

const videoToTextEdge: FlowEdge = {
  id: 'video-to-text',
  type: 'flow',
  source: 'reference-video',
  sourceHandle: 'video',
  target: 'prompt-text',
  targetHandle: 'video-ref',
};

describe('video prompt analysis', () => {
  beforeEach(() => {
    mocks.extractVideoReferenceFrames.mockReset();
    mocks.generateNodeContent.mockReset();
    mocks.inputModalities = ['text', 'image'];
    useCanvasStore.setState({
      nodes: [videoNode, textNode],
      edges: [videoToTextEdge],
      past: [],
      future: [],
      selectedNodeId: 'prompt-text',
    });
  });

  it('samples the upstream video and sends the ordered frames to the text model', async () => {
    const frames = [
      'data:image/jpeg;base64,frame-1',
      'data:image/jpeg;base64,frame-2',
      'data:image/jpeg;base64,frame-3',
    ];
    mocks.extractVideoReferenceFrames.mockResolvedValue(frames);
    mocks.generateNodeContent.mockResolvedValue({ text: '反推后的视频提示词' });

    await useCanvasStore.getState().generateNode('prompt-text');

    expect(mocks.extractVideoReferenceFrames).toHaveBeenCalledWith(
      ['http://127.0.0.1:2895/assets/reference.mp4'],
      5,
    );
    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        referenceImages: frames,
        prompt: expect.stringContaining('按时间顺序从前置视频均匀抽取'),
        provider: expect.objectContaining({ model: 'vision-model' }),
      }),
      expect.any(Function),
    );
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'prompt-text')?.data,
    ).toMatchObject({
      generating: false,
      progress: 100,
      outputText: '反推后的视频提示词',
      output: '反推后的视频提示词',
    });
  });

  it('shows a generation error instead of leaving the previous text result visible', async () => {
    useCanvasStore.setState({
      nodes: [
        videoNode,
        {
          ...textNode,
          data: {
            ...textNode.data,
            result: '上一次结果',
            outputText: '上一次结果',
            output: '上一次结果',
          },
        },
      ],
      edges: [videoToTextEdge],
    });
    mocks.extractVideoReferenceFrames.mockResolvedValue([]);
    mocks.generateNodeContent.mockRejectedValue(new Error('当前模型无法分析图片'));

    await expect(useCanvasStore.getState().generateNode('prompt-text')).rejects.toThrow(
      '当前模型无法分析图片',
    );

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'prompt-text')?.data,
    ).toMatchObject({
      generating: false,
      progress: 0,
      generationError: '当前模型无法分析图片',
      result: '当前模型无法分析图片',
      outputText: undefined,
      output: undefined,
    });
  });

  it('rejects an explicitly text-only model before extracting or sending video frames', async () => {
    mocks.inputModalities = ['text'];

    await expect(useCanvasStore.getState().generateNode('prompt-text')).rejects.toThrow(
      '所选文本模型不支持参考图片',
    );

    expect(mocks.extractVideoReferenceFrames).not.toHaveBeenCalled();
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'prompt-text')?.data,
    ).toMatchObject({
      generating: false,
      generationError: '所选文本模型不支持参考图片，请改选支持视觉输入的模型。',
    });
  });
});
