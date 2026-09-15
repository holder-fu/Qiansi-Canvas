import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = {
    id: 'image-provider',
    name: '图片生成模型',
    mark: 'IMG',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: [], image: ['image-model'], video: [] },
    modelCapabilities: {
      'image-model': {
        inputModalities: ['text', 'image'],
      },
    },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
  return {
    availableProviderModels: () => [
      {
        key: 'image-provider\0image-model',
        providerId: 'image-provider',
        providerName: '图片生成模型',
        model: 'image-model',
        displayName: 'image-model',
        label: '图片生成模型 · image-model',
        recommended: false,
        inputModalities: ['text', 'image'],
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
import {
  createDefaultDirectorScene,
  createDefaultDirectorSubject,
} from '../lib/directorConstraints';

const layoutUrl = 'https://example.test/director-layout.png';
const sceneUrl = 'https://example.test/cafe-scene.png';
const heroUrl = 'https://example.test/hero-identity.png';
const ordinaryReferenceUrl = 'https://example.test/ordinary-reference.png';
const secondLayoutUrl = 'https://example.test/second-director-layout.png';
const secondIdentityUrl = 'https://example.test/second-director-identity.png';
const directorConstraintPrompt = [
  '2D 导演硬约束：参考图1是构图控制图，参考图2是场景，参考图3是人物 A 身份。',
  '人物 A 的脚底必须位于 x=28%、y=76%，最终图片不得出现字母、箭头或网格。',
].join('\n');
const userPromptOverride = '补充剧情：人物 A 正在把咖啡递给镜头外的人。';

describe('2D director image generation request', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.generateNodeContent.mockResolvedValue({
      imageUrl: 'https://example.test/generated-director-shot.png',
    });
    useCanvasStore.setState({
      nodes: [
        {
          id: 'scene-source',
          type: 'image',
          position: { x: -600, y: 0 },
          data: {
            kind: 'image',
            title: '咖啡店场景源图',
            imageUrl: sceneUrl,
            images: [sceneUrl],
            output: sceneUrl,
            referenceOnly: true,
          },
        },
        {
          id: 'hero-source',
          type: 'image',
          position: { x: -600, y: 320 },
          data: {
            kind: 'image',
            title: '人物 A 身份源图',
            imageUrl: heroUrl,
            images: [heroUrl],
            output: heroUrl,
            referenceOnly: true,
          },
        },
        {
          id: 'director-2d-source',
          type: 'director-2d',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director-2d',
            title: '2D 导演台',
            directorScene: {
              ...createDefaultDirectorScene(),
              stageMode: 'flat',
              sceneSourceId: 'scene-source',
              sceneUrl,
              sceneName: '咖啡店',
              subjects: [
                createDefaultDirectorSubject({
                  id: 'hero-subject',
                  sourceNodeId: 'hero-source',
                  label: '人物 A',
                  imageUrl: heroUrl,
                  x: 28,
                  y: 76,
                  scale: 120,
                  rotation: 0,
                }),
              ],
            },
            directorOutputDirty: false,
            directorConstraintPrompt,
            directorReferenceLabels: [
              '参考图 1 · 二维构图控制图',
              '参考图 2 · 咖啡店场景',
              '参考图 3 · 人物 A 身份',
            ],
            imageUrl: layoutUrl,
            images: [layoutUrl, sceneUrl, heroUrl],
            output: [layoutUrl, sceneUrl, heroUrl],
            aspectRatio: '4:5',
          },
        },
        {
          id: 'director-image-task',
          type: 'image',
          position: { x: 600, y: 0 },
          data: {
            kind: 'image',
            title: '2D 导演 · 构图图片',
            prompt: '人物 A 在咖啡店内。',
            providerId: 'image-provider',
            model: 'image-model',
            aspectRatio: '4:5',
            genParams: { aspectRatio: '4:5', resolution: '2K', count: 1 },
            composerParams: {
              directorSourceId: 'director-2d-source',
              directorReferenceCount: 3,
              requiresImageInput: true,
            },
          },
        },
      ],
      edges: [
        {
          id: 'scene-to-director',
          source: 'scene-source',
          target: 'director-2d-source',
          sourceHandle: 'image',
          targetHandle: 'references',
        },
        {
          id: 'hero-to-director',
          source: 'hero-source',
          target: 'director-2d-source',
          sourceHandle: 'image',
          targetHandle: 'references',
        },
        {
          id: 'director-to-image-task',
          source: 'director-2d-source',
          target: 'director-image-task',
          sourceHandle: 'layout',
          targetHandle: 'ref',
        },
      ],
      past: [],
      future: [],
    });
  });

  it('keeps the compiled constraints beside a user override without changing references or ratio', async () => {
    await useCanvasStore.getState().generateNode('director-image-task', userPromptOverride);

    expect(mocks.generateNodeContent).toHaveBeenCalledTimes(1);
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      referenceImages?: string[];
      aspectRatio?: string;
    };
    expect(request.prompt).toContain(userPromptOverride);
    expect(request.prompt).toContain(directorConstraintPrompt);
    expect(request.referenceImages).toEqual([layoutUrl, sceneUrl, heroUrl]);
    expect(request.aspectRatio).toBe('4:5');
  });

  it('submits only the ordered director bundle when an ordinary reference edge comes first', async () => {
    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: 'ordinary-reference',
          type: 'image',
          position: { x: 0, y: 640 },
          data: {
            kind: 'image',
            title: '普通参考图',
            imageUrl: ordinaryReferenceUrl,
            images: [ordinaryReferenceUrl],
            output: ordinaryReferenceUrl,
            referenceOnly: true,
          },
        },
      ],
      edges: [
        ...state.edges.filter((edge) => edge.id !== 'director-to-image-task'),
        {
          id: 'ordinary-to-image-task',
          source: 'ordinary-reference',
          target: 'director-image-task',
          sourceHandle: 'image',
          targetHandle: 'ref',
        },
        {
          id: 'director-to-image-task',
          source: 'director-2d-source',
          target: 'director-image-task',
          sourceHandle: 'layout',
          targetHandle: 'ref',
        },
      ],
    }));

    await useCanvasStore.getState().generateNode('director-image-task', userPromptOverride);

    expect(mocks.generateNodeContent).toHaveBeenCalledTimes(1);
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      referenceImages?: string[];
    };
    expect(request.referenceImages).toEqual([layoutUrl, sceneUrl, heroUrl]);
    expect(request.referenceImages).not.toContain(ordinaryReferenceUrl);
  });

  it('preserves distinct director slots even when two semantic references share one asset URL', async () => {
    const sharedAssetUrl = 'https://example.test/shared-scene-and-subject-bytes.png';
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === 'scene-source' || node.id === 'hero-source') {
          return {
            ...node,
            data: {
              ...node.data,
              originalUrl: sharedAssetUrl,
              imageUrl: sharedAssetUrl,
              images: [sharedAssetUrl],
              output: sharedAssetUrl,
            },
          };
        }
        if (node.id !== 'director-2d-source') return node;
        const scene = node.data.directorScene;
        return {
          ...node,
          data: {
            ...node.data,
            images: [layoutUrl, sharedAssetUrl, sharedAssetUrl],
            output: [layoutUrl, sharedAssetUrl, sharedAssetUrl],
            directorScene: scene
              ? {
                  ...scene,
                  sceneUrl: sharedAssetUrl,
                  subjects: scene.subjects.map((subject) => ({
                    ...subject,
                    imageUrl: sharedAssetUrl,
                  })),
                }
              : scene,
          },
        };
      }),
    }));

    await useCanvasStore.getState().generateNode('director-image-task', userPromptOverride);

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      referenceImages?: string[];
    };
    expect(request.referenceImages).toEqual([layoutUrl, sharedAssetUrl, sharedAssetUrl]);
  });

  it('blocks generation after the director-to-task edge is removed', async () => {
    useCanvasStore.setState((state) => ({
      edges: state.edges.filter((edge) => edge.id !== 'director-to-image-task'),
    }));

    await useCanvasStore.getState().generateNode('director-image-task', userPromptOverride);

    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'director-image-task')?.data
        .generationError,
    ).toContain('构图引用已断开');
  });

  it('blocks generation and marks the director dirty when a subject source image changes', async () => {
    const updatedHeroUrl = 'https://example.test/hero-identity-updated.png';
    useCanvasStore.getState().updateNodeData('hero-source', {
      imageUrl: updatedHeroUrl,
      images: [updatedHeroUrl],
      output: updatedHeroUrl,
    });
    useCanvasStore.getState().propagate('hero-source');

    await useCanvasStore.getState().generateNode('director-image-task', userPromptOverride);

    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'director-image-task')?.data
        .generationError,
    ).toContain('人物身份图已经更新');
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'director-2d-source')?.data
        .directorOutputDirty,
    ).toBe(true);
  });

  it('rejects an extra director connection and ignores legacy extra-director edges at request time', async () => {
    const secondConstraint = '第二个导演约束：把人物放到画面最右侧。';
    useCanvasStore.setState((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: 'second-director',
          type: 'director-2d',
          position: { x: 0, y: 800 },
          data: {
            kind: 'director-2d',
            title: '第二个 2D 导演台',
            directorOutputDirty: false,
            directorConstraintPrompt: secondConstraint,
            imageUrl: secondLayoutUrl,
            images: [secondLayoutUrl, secondIdentityUrl],
            output: [secondLayoutUrl, secondIdentityUrl],
            aspectRatio: '4:5',
          },
        },
      ],
    }));

    useCanvasStore.getState().onConnect({
      source: 'second-director',
      target: 'director-image-task',
      sourceHandle: 'layout',
      targetHandle: 'ref',
    });
    expect(
      useCanvasStore
        .getState()
        .edges.some(
          (edge) => edge.source === 'second-director' && edge.target === 'director-image-task',
        ),
    ).toBe(false);

    useCanvasStore.setState((state) => ({
      edges: [
        ...state.edges,
        {
          id: 'legacy-second-director-edge',
          source: 'second-director',
          target: 'director-image-task',
          sourceHandle: 'layout',
          targetHandle: 'ref',
        },
      ],
    }));

    await useCanvasStore.getState().generateNode('director-image-task');

    expect(mocks.generateNodeContent).toHaveBeenCalledTimes(1);
    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      referenceImages?: string[];
    };
    expect(request.prompt).toContain(directorConstraintPrompt);
    expect(request.prompt).toContain('人物 A 在咖啡店内。');
    expect(request.prompt).not.toContain(secondConstraint);
    expect(request.referenceImages).toEqual([layoutUrl, sceneUrl, heroUrl]);
    expect(request.referenceImages).not.toContain(secondLayoutUrl);
    expect(request.referenceImages).not.toContain(secondIdentityUrl);
  });
});
