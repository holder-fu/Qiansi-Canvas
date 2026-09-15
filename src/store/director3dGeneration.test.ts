import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = {
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
        inputModalities: ['text', 'image'],
        videoModes: ['全能参考'],
        videoReferenceInput: false,
      },
    },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
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
        inputModalities: ['text', 'image'],
        videoModes: ['全能参考'],
        videoReferenceInput: false,
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

import { createDefaultDirectorScene } from '../lib/directorConstraints';
import { useCanvasStore } from './canvasStore';

describe('3D director generation reference identity', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.generateNodeContent.mockResolvedValue({
      videoUrl: 'https://example.test/generated-director-video.mp4',
    });
  });

  it('submits equal underlying URLs as separate ordered character roles', async () => {
    const frameUrl = 'https://example.test/motion-frame.png';
    const sharedIdentityUrl = 'https://example.test/shared-identity.png';
    const constraint =
      '参考图1是动画关键帧，参考图2是人物 A，参考图3是人物 B；A/B 是两个独立语义槽。';
    useCanvasStore.setState({
      nodes: [
        {
          id: 'director-3d-source',
          type: 'director-3d',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director-3d',
            title: '3D 导演台',
            directorOutputDirty: false,
            directorConstraintPrompt: constraint,
            directorScene: {
              ...createDefaultDirectorScene(),
              stageMode: 'spatial',
              animationSampleCount: 1,
              supportingReferenceCount: 2,
            },
            images: [frameUrl, sharedIdentityUrl, sharedIdentityUrl],
            output: [frameUrl, sharedIdentityUrl, sharedIdentityUrl],
          },
        },
        {
          id: 'director-video-task',
          type: 'video',
          position: { x: 800, y: 0 },
          data: {
            kind: 'video',
            title: '3D 导演 · 最终视频',
            prompt: '两名人物同时走向镜头。',
            providerId: 'video-provider',
            model: 'video-model',
            genParams: {
              duration: 5,
              resolution: '720P',
              aspectRatio: '16:9',
              audio: false,
            },
            composerParams: {
              mode: '全能参考',
              directorSourceId: 'director-3d-source',
              directorAnimationFrameCount: 1,
              directorSupportingReferenceCount: 2,
            },
          },
        },
      ],
      edges: [
        {
          id: 'director-to-video',
          source: 'director-3d-source',
          target: 'director-video-task',
          sourceHandle: 'layout',
          targetHandle: 'frame',
        },
      ],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('director-video-task');

    expect(mocks.generateNodeContent).toHaveBeenCalledTimes(1);
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      referenceImages?: string[];
    };
    expect(request.prompt).toContain(constraint);
    expect(request.referenceImages).toEqual([frameUrl, sharedIdentityUrl, sharedIdentityUrl]);
  });
});
