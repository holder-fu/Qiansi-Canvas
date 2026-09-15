import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
  videoOperations: ['remake', 'masked-repair'],
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = {
    id: 'video-provider',
    name: '视频重拍模型',
    mark: 'VID',
    protocol: 'openai',
    category: 'video',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: [], image: [], video: ['remake-model'] },
    modelCapabilities: {
      'remake-model': { videoOperations: mocks.videoOperations },
    },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
  return {
    availableProviderModels: () => [
      {
        key: 'video-provider\0remake-model',
        providerId: 'video-provider',
        providerName: '视频重拍模型',
        model: 'remake-model',
        displayName: 'remake-model',
        label: '视频重拍模型 · remake-model',
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

describe('video remake generation isolation', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.generateNodeContent.mockResolvedValue({ videoUrl: 'https://example.test/remade.mp4' });
    mocks.videoOperations.splice(0, mocks.videoOperations.length, 'remake', 'masked-repair');
    useCanvasStore.setState({
      nodes: [
        {
          id: 'source-video',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: '原视频',
            videoUrl: 'https://example.test/source.mp4',
          },
        },
        {
          id: 'remake-video',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '片段重拍',
            prompt: '让选中片段里的角色转身看向镜头',
            genParams: { duration: 12, resolution: '1080P', aspectRatio: '16:9' },
            providerId: 'video-provider',
            model: 'remake-model',
            composerParams: {
              mode: '全能参考',
              videoTool: 'remake',
              sourceVideoDuration: 10,
            },
            videoRemakeSegments: [
              { start: 0, end: 2 },
              { start: 1, end: 3 },
              { start: 8, end: 10 },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'source-to-remake',
          source: 'source-video',
          target: 'remake-video',
          sourceHandle: 'video',
          targetHandle: 'source-video',
        },
      ],
      past: [],
      future: [],
    });
  });

  it('submits the user instruction with the source video, output parameters and valid ranges', async () => {
    await useCanvasStore.getState().generateNode('remake-video');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'video',
        sourceVideo: 'https://example.test/source.mp4',
        sourceVideoDuration: 10,
        referenceImages: [],
        remakeSegments: [
          { start: 0, end: 2 },
          { start: 8, end: 10 },
        ],
        prompt: expect.stringContaining('1. 0.000s–2.000s'),
        aspectRatio: '16:9',
        resolution: '1080P',
        duration: 12,
      }),
      expect.any(Function),
    );
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as { prompt?: string };
    expect(request.prompt).toContain('2. 8.000s–10.000s');
    expect(request.prompt).toContain('让选中片段里的角色转身看向镜头');
    expect(request.prompt).not.toContain('1.000s–3.000s');
  });

  it('submits a precise remake segment shorter than two seconds', async () => {
    useCanvasStore.getState().updateNodeData('remake-video', {
      videoRemakeSegments: [{ start: 1.2, end: 1.8 }],
    });

    await useCanvasStore.getState().generateNode('remake-video');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        remakeSegments: [{ start: 1.2, end: 1.8 }],
        prompt: expect.stringContaining('1. 1.200s–1.800s'),
      }),
      expect.any(Function),
    );
  });

  it('submits one connected video as the source video for an ordinary downstream video request', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'source-video',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: '参考视频',
            videoUrl: 'https://example.test/source.mp4',
          },
        },
        {
          id: 'next-video',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '下一段视频',
            prompt: '保持参考视频的人物和镜头节奏',
            genParams: { duration: 8, resolution: '480P', aspectRatio: '16:9' },
            providerId: 'video-provider',
            model: 'remake-model',
            composerParams: { mode: '文生视频' },
          },
        },
      ],
      edges: [
        {
          id: 'source-to-next',
          source: 'source-video',
          target: 'next-video',
          sourceHandle: 'video',
          targetHandle: 'batch-source',
        },
      ],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('next-video');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'video',
        sourceVideo: 'https://example.test/source.mp4',
        referenceImages: [],
        mode: '文生视频',
      }),
      expect.any(Function),
    );
  });

  it('submits a source-bound masked repair without widening its spatial or temporal scope', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'source-video',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: '原视频',
            videoUrl: 'https://example.test/source.mp4',
          },
        },
        {
          id: 'masked-repair-video',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '关键帧蒙版修复',
            prompt: '修复人物右手的形变',
            genParams: { duration: 10, resolution: '1080P', aspectRatio: '16:9' },
            providerId: 'video-provider',
            model: 'remake-model',
            composerParams: { mode: '全能参考', videoTool: 'masked-repair' },
            videoMaskRepair: {
              maskImage: 'data:image/png;base64,binary-mask',
              rangeStart: 1.25,
              rangeEnd: 3.75,
              keyframeTime: 2.5,
              tracking: 'provider',
            },
          },
        },
      ],
      edges: [
        {
          id: 'source-to-repair',
          source: 'source-video',
          target: 'masked-repair-video',
          sourceHandle: 'video',
          targetHandle: 'source-video',
        },
      ],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('masked-repair-video');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'video',
        sourceVideo: 'https://example.test/source.mp4',
        videoEditOperation: 'masked-repair',
        maskImage: 'data:image/png;base64,binary-mask',
        maskRangeStart: 1.25,
        maskRangeEnd: 3.75,
        keyframeTime: 2.5,
        tracking: 'provider',
        provider: expect.objectContaining({ videoOperations: ['remake', 'masked-repair'] }),
      }),
      expect.any(Function),
    );
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as { prompt?: string };
    expect(request.prompt).toContain('只能修改提供的蒙版区域');
    expect(request.prompt).toContain('1.250s–3.750s');
    expect(request.prompt).toContain('蒙版关键帧：2.500s');
    expect(request.prompt).toContain('蒙版外像素');
    expect(request.prompt).toContain('修复人物右手的形变');
  });

  it('stops masked repair before generation when the selected model lacks the real operation', async () => {
    mocks.videoOperations.splice(0, mocks.videoOperations.length, 'remake');
    useCanvasStore.setState({
      nodes: [
        {
          id: 'source-video',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: '原视频',
            videoUrl: 'https://example.test/source.mp4',
          },
        },
        {
          id: 'masked-repair-video',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '关键帧蒙版修复',
            prompt: '修复人物右手的形变',
            providerId: 'video-provider',
            model: 'remake-model',
            composerParams: { mode: '全能参考', videoTool: 'masked-repair' },
            videoMaskRepair: {
              maskImage: 'data:image/png;base64,binary-mask',
              rangeStart: 1.25,
              rangeEnd: 3.75,
              keyframeTime: 2.5,
              tracking: 'provider',
            },
          },
        },
      ],
      edges: [
        {
          id: 'source-to-repair',
          source: 'source-video',
          target: 'masked-repair-video',
          sourceHandle: 'video',
          targetHandle: 'source-video',
        },
      ],
    });

    await expect(useCanvasStore.getState().generateNode('masked-repair-video')).rejects.toThrow(
      '没有真实的时序蒙版修复协议',
    );
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });
});
