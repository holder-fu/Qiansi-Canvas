import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComposerReferencePatch } from '../composer/referenceSubmission';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
  videoReferenceInput: true as boolean | undefined,
  videoModes: undefined as
    Array<'文生视频' | '全能参考' | '图生视频' | '首尾帧' | '图片参考' | '视频换人物'> | undefined,
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = () => ({
    id: 'video-provider',
    name: '视频生成模型',
    mark: 'VID',
    protocol: 'openai',
    category: 'video',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: [], image: [], video: ['video-model'] },
    modelCapabilities: {
      'video-model': {
        videoReferenceInput: mocks.videoReferenceInput,
        videoModes: mocks.videoModes ? [...mocks.videoModes] : undefined,
      },
    },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  });
  return {
    availableProviderModels: () => [
      {
        key: 'video-provider\0video-model',
        providerId: 'video-provider',
        providerName: '视频生成模型',
        model: 'video-model',
        displayName: 'video-model',
        label: '视频生成模型 · video-model',
        recommended: false,
        videoReferenceInput: mocks.videoReferenceInput,
        videoModes: mocks.videoModes ? [...mocks.videoModes] : undefined,
      },
    ],
    isProviderConnectionUsable: () => true,
    isProviderConnectionVerified: () => true,
    loadProviderConnections: () => [provider()],
  };
});

vi.mock('../lib/keyVault', () => ({
  hydrateApiKeys: async (providers: unknown) => providers,
}));

import { useCanvasStore } from './canvasStore';

const ordinaryVideoUrl = 'https://example.test/ordinary-reference.mp4';
const effectVideoUrl = 'https://example.test/earth-zoom-effect.mp4';
const effectPreviewUrl = 'https://example.test/earth-zoom-effect.webp';
const userPrompt = '让角色从城市屋顶起飞。';

describe('effect video generation references', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.generateNodeContent.mockResolvedValue({
      videoUrl: 'https://example.test/generated.mp4',
    });
    mocks.videoReferenceInput = true;
    mocks.videoModes = undefined;
    useCanvasStore.setState({
      nodes: [
        {
          id: 'ordinary-video',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            title: '普通参考视频',
            videoUrl: ordinaryVideoUrl,
            output: ordinaryVideoUrl,
            referenceOnly: true,
          },
        },
        {
          id: 'effect-video',
          type: 'video',
          position: { x: 0, y: 320 },
          data: {
            kind: 'video',
            title: '素材-特效-地球缩放',
            videoUrl: effectVideoUrl,
            output: effectVideoUrl,
            previewUrl: effectPreviewUrl,
            referenceOnly: true,
            effectPresetId: 'earth-zoom',
            effectPreset: '地球缩放',
            effectPrompt: '从角色近景快速拉远，最终显露完整地球',
          },
        },
        {
          id: 'target-video',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '目标视频',
            prompt: userPrompt,
            genParams: { duration: 8, resolution: '720P', aspectRatio: '16:9' },
            providerId: 'video-provider',
            model: 'video-model',
            composerParams: { mode: '全能参考' },
          },
        },
      ],
      edges: [
        {
          id: 'ordinary-to-target',
          source: 'ordinary-video',
          target: 'target-video',
          sourceHandle: 'video',
          targetHandle: 'batch-source',
        },
        {
          id: 'effect-to-target',
          source: 'effect-video',
          target: 'target-video',
          sourceHandle: 'video',
          targetHandle: 'batch-source',
        },
      ],
      past: [],
      future: [],
    });
  });

  it('prefers the effect source and stops submitting its video and instruction after removal', async () => {
    useCanvasStore.setState((state) => ({
      // Simulate an old persisted global default; this node never opted into video audio.
      genParams: { ...state.genParams, audio: true },
    }));
    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const firstRequest = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      prompt?: string;
      audio?: boolean;
    };
    expect(firstRequest.sourceVideo).toBe(effectVideoUrl);
    expect(firstRequest.referenceImages).not.toContain(effectPreviewUrl);
    expect(firstRequest.prompt).toContain('视频特效“地球缩放”');
    expect(firstRequest.prompt).toContain('从角色近景快速拉远，最终显露完整地球');
    expect(firstRequest.audio).toBe(false);
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'target-video')?.data.prompt,
    ).toBe(userPrompt);

    const ordinaryReference = {
      id: 'ordinary-video-video',
      type: 'video' as const,
      url: ordinaryVideoUrl,
      label: '普通参考视频',
    };
    const effectReference = {
      id: 'effect-video-video',
      type: 'video' as const,
      url: effectVideoUrl,
      label: '地球缩放',
      role: 'effect' as const,
      effectPrompt: '从角色近景快速拉远，最终显露完整地球',
    };
    const removedEffect = buildComposerReferencePatch(
      [ordinaryReference, effectReference],
      [ordinaryReference],
    );
    useCanvasStore.getState().updateNodeData('target-video', removedEffect);

    mocks.generateNodeContent.mockClear();
    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const secondRequest = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      prompt?: string;
    };
    expect(secondRequest.sourceVideo).toBe(ordinaryVideoUrl);
    expect(secondRequest.prompt).toBe(userPrompt);
    expect(secondRequest.prompt).not.toContain(effectVideoUrl);
    expect(secondRequest.prompt).not.toContain('视频特效“');
    expect(secondRequest.prompt).not.toContain('从角色近景快速拉远');
  });

  it('forwards a 30-second node setting without reducing it to the former UI maximum', async () => {
    useCanvasStore.getState().updateNodeData('target-video', {
      genParams: { duration: 30, resolution: '720P', aspectRatio: '16:9' },
    });

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 30 }),
      expect.any(Function),
    );
  });

  it('submits manually attached audio and video references from the video composer', async () => {
    const manualVideo = 'https://example.test/manual-reference.mp4';
    const manualAudio = 'https://example.test/manual-reference.wav';
    useCanvasStore.setState((state) => ({
      edges: state.edges.filter(
        (edge) => edge.id !== 'ordinary-to-target' && edge.id !== 'effect-to-target',
      ),
    }));
    useCanvasStore.getState().updateNodeData('target-video', {
      composerReferences: [
        { id: 'manual-video', type: 'video', url: manualVideo, label: '参考视频' },
        { id: 'manual-audio', type: 'audio', url: manualAudio, label: '参考音频' },
      ],
    });

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceVideo: manualVideo,
        referenceAudios: [manualAudio],
      }),
      expect.any(Function),
    );
  });

  it('falls back to the persisted effect poster and prompt when the model has no video input', async () => {
    mocks.videoReferenceInput = false;
    useCanvasStore.setState((state) => ({
      edges: state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      videoPosterFallbackImages?: string[];
      prompt?: string;
    };
    expect(request.sourceVideo).toBeUndefined();
    expect(request.referenceImages).toEqual([]);
    expect(request.videoPosterFallbackImages).toEqual([effectPreviewUrl]);
    expect(request.prompt).toContain('视频特效“地球缩放”');
    expect(request.prompt).toContain('从角色近景快速拉远，最终显露完整地球');

    useCanvasStore.getState().updateNodeData(
      'target-video',
      buildComposerReferencePatch(
        [
          {
            id: 'effect-video-video',
            type: 'video',
            url: effectVideoUrl,
            previewUrl: effectPreviewUrl,
            label: '地球缩放',
            role: 'effect',
            effectPrompt: '从角色近景快速拉远，最终显露完整地球',
          },
        ],
        [],
      ),
    );
    mocks.generateNodeContent.mockClear();

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const requestAfterRemoval = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      prompt?: string;
    };
    expect(requestAfterRemoval.sourceVideo).toBeUndefined();
    expect(requestAfterRemoval.referenceImages).toEqual([]);
    expect(requestAfterRemoval.prompt).toBe(userPrompt);
  });

  it('treats a missing video-reference declaration as unverified and uses the poster fallback', async () => {
    mocks.videoReferenceInput = undefined;
    useCanvasStore.setState((state) => ({
      edges: state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      videoPosterFallbackImages?: string[];
    };
    expect(request.sourceVideo).toBeUndefined();
    expect(request.referenceImages).toEqual([]);
    expect(request.videoPosterFallbackImages).toEqual([effectPreviewUrl]);
  });

  it('prioritizes one effect poster for an image-to-video model', async () => {
    const ordinaryImageUrl = 'https://example.test/ordinary-reference.webp';
    mocks.videoReferenceInput = false;
    mocks.videoModes = ['图生视频'];
    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes.map((node) =>
          node.id === 'target-video'
            ? { ...node, data: { ...node.data, composerParams: { mode: '全能参考' } } }
            : node,
        ),
        {
          id: 'ordinary-image',
          type: 'image',
          position: { x: 0, y: 640 },
          data: {
            kind: 'image',
            title: '普通参考图',
            imageUrl: ordinaryImageUrl,
            output: ordinaryImageUrl,
            referenceOnly: true,
          },
        },
      ],
      edges: [
        ...state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
        {
          id: 'image-to-target',
          source: 'ordinary-image',
          target: 'target-video',
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
      ],
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      videoPosterFallbackImages?: string[];
      mode?: string;
    };
    expect(request.sourceVideo).toBeUndefined();
    expect(request.referenceImages).toEqual([]);
    expect(request.videoPosterFallbackImages).toEqual([effectPreviewUrl]);
    expect(request.mode).toBe('图生视频');
  });

  it('keeps a core reference separate from the explicit effect-poster fallback', async () => {
    const ordinaryImageUrl = 'https://example.test/core-character-reference.png';
    mocks.videoReferenceInput = false;
    mocks.videoModes = ['全能参考'];
    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes.map((node) =>
          node.id === 'target-video'
            ? { ...node, data: { ...node.data, composerParams: { mode: '全能参考' } } }
            : node,
        ),
        {
          id: 'core-character-image',
          type: 'image',
          position: { x: 0, y: 640 },
          data: {
            kind: 'image',
            title: '人物原图',
            originalUrl: ordinaryImageUrl,
            imageUrl: ordinaryImageUrl,
            output: ordinaryImageUrl,
            referenceOnly: true,
          },
        },
      ],
      edges: [
        ...state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
        {
          id: 'core-image-to-target',
          source: 'core-character-image',
          target: 'target-video',
          sourceHandle: 'image',
          targetHandle: 'frame',
        },
      ],
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      referenceImages?: string[];
      videoPosterFallbackImages?: string[];
    };
    expect(request.referenceImages).toEqual([ordinaryImageUrl]);
    expect(request.videoPosterFallbackImages).toEqual([effectPreviewUrl]);
  });

  it('keeps a source-video workflow on its declared text-to-video mode', async () => {
    mocks.videoReferenceInput = true;
    mocks.videoModes = ['文生视频'];
    useCanvasStore.setState((state) => ({
      edges: state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      mode?: string;
    };
    expect(request.sourceVideo).toBe(effectVideoUrl);
    expect(request.referenceImages).toEqual([]);
    expect(request.mode).toBe('文生视频');
  });

  it('does not reuse an effect asset as the original video for fragment remake', async () => {
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'target-video'
          ? {
              ...node,
              data: {
                ...node.data,
                composerParams: {
                  mode: '全能参考',
                  videoTool: 'remake',
                  sourceVideoDuration: 10,
                },
                videoRemakeSegments: [{ start: 0, end: 2 }],
              },
            }
          : node,
      ),
      edges: state.edges.filter((edge) => edge.id !== 'ordinary-to-target'),
    }));

    await expect(
      useCanvasStore.getState().generateNode('target-video', userPrompt),
    ).rejects.toThrow('“片段重拍”需要连接一条原视频。');
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('uses the character-role image for person replacement instead of the first style image', async () => {
    mocks.videoModes = ['视频换人物'];
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'target-video'
          ? {
              ...node,
              data: {
                ...node.data,
                composerParams: { mode: '视频换人物' },
                composerReferences: [
                  {
                    id: 'style-preset:ink',
                    type: 'image',
                    url: 'https://example.test/style.png',
                    label: '水墨风格',
                    role: 'style',
                  },
                  {
                    id: 'character-preset:hero:portrait',
                    type: 'image',
                    url: 'https://example.test/hero.png',
                    label: '目标人物',
                    role: 'character' as never,
                  },
                ],
              },
            }
          : node,
      ),
      edges: state.edges.filter((edge) => edge.id !== 'effect-to-target'),
    }));

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      characterReferenceImage?: string;
      referenceImages?: string[];
    };
    expect(request.sourceVideo).toBe(ordinaryVideoUrl);
    expect(request.characterReferenceImage).toBe('https://example.test/hero.png');
    expect(request.referenceImages).toEqual([]);
  });

  it('submits an animated WebP effect as an image reference with effect guidance', async () => {
    const effectWebpUrl = 'https://example.test/earth-zoom-effect.webp';
    const targetNode = useCanvasStore.getState().nodes.find((node) => node.id === 'target-video');
    if (!targetNode) throw new Error('Expected target video node');
    useCanvasStore.setState({
      nodes: [
        {
          id: 'effect-webp',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '素材-特效-地球缩放',
            originalUrl: effectWebpUrl,
            imageUrl: effectWebpUrl,
            images: [effectWebpUrl],
            output: effectWebpUrl,
            referenceOnly: true,
            effectPresetId: 'earth-zoom-webp',
            effectPreset: '地球缩放',
            effectPrompt: '从角色近景快速拉远，最终显露完整地球',
          },
        },
        targetNode,
      ],
      edges: [
        {
          id: 'effect-webp-to-target',
          source: 'effect-webp',
          sourceHandle: 'image',
          target: 'target-video',
          targetHandle: 'frame',
        },
      ],
    });

    await useCanvasStore.getState().generateNode('target-video', userPrompt);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      sourceVideo?: string;
      referenceImages?: string[];
      prompt?: string;
    };
    expect(request.sourceVideo).toBeUndefined();
    expect(request.referenceImages).toContain(effectWebpUrl);
    expect(request.prompt).toContain('视频特效“地球缩放”');
    expect(request.prompt).toContain('从角色近景快速拉远');
  });
});
