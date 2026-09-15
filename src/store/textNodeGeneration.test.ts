import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowEdge, FlowNode } from '../canvas/nodeTypes';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
}));

vi.mock('../lib/providerRegistry', () => {
  const provider = {
    id: 'text-provider',
    name: '文本模型',
    mark: 'TXT',
    protocol: 'openai',
    category: 'text',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    models: { chat: ['text-model'], image: [], video: [] },
    verifiedAt: Date.now(),
    enabled: true,
    canGenerate: true,
  };
  return {
    availableProviderModels: () => [
      {
        key: 'text-provider\0text-model',
        providerId: 'text-provider',
        providerName: '文本模型',
        model: 'text-model',
        displayName: 'text-model',
        label: '文本模型 · text-model',
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
import { excludeTextSourcesFromSubmission } from '../composer/referenceSubmission';

const sourcePrompt =
  'dynamic xuanhuan combat, layered orange-gold flame energy, cinematic Chinese 3D animation';
const userInstruction = '通过上面的提示词给我一个可以生成同类风格图片的提示词。';

function sourceNode(): FlowNode {
  return {
    id: 'source-text',
    type: 'text',
    position: { x: 0, y: 0 },
    data: {
      kind: 'text' as const,
      title: '原提示词',
      prompt: sourcePrompt,
      textContentRole: 'source' as const,
      outputText: sourcePrompt,
      output: sourcePrompt,
    },
  };
}

function targetNode(data: Partial<FlowNode['data']> = {}): FlowNode {
  return {
    id: 'target-text',
    type: 'text',
    position: { x: 500, y: 0 },
    data: {
      kind: 'text' as const,
      title: '提示词',
      providerId: 'text-provider',
      model: 'text-model',
      ...data,
    },
  };
}

function secondaryNode(): FlowNode {
  return {
    id: 'secondary-text',
    type: 'text',
    position: { x: 900, y: 0 },
    data: {
      kind: 'text' as const,
      title: '其他文本',
      prompt: '其他节点内容',
      textContentRole: 'source' as const,
    },
  };
}

const connection: FlowEdge = {
  id: 'source-to-target',
  source: 'source-text',
  target: 'target-text',
  sourceHandle: 'text',
  targetHandle: 'prompt',
};

describe('text node generation workflow', () => {
  beforeEach(() => {
    mocks.generateNodeContent.mockReset();
    mocks.generateNodeContent.mockResolvedValue({ text: '同类风格新提示词' });
    useCanvasStore.setState((state) => ({
      nodes: [sourceNode(), targetNode({ textInstruction: userInstruction })],
      edges: [connection],
      past: [],
      future: [],
      genParams: { ...state.genParams, mode: 'first-frame' },
    }));
  });

  it('submits upstream content and the editable instruction as separate blocks', async () => {
    await useCanvasStore.getState().generateNode('target-text');

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      mode?: string;
      maxLength?: number;
      temperature?: number;
    };
    expect(request).toMatchObject({ mode: '自由指令' });
    expect(request.maxLength).toBeUndefined();
    expect(request.temperature).toBeUndefined();
    expect(request.prompt).toBe(
      `【输入来源】\n${sourcePrompt}\n\n【用户指令】\n${userInstruction}`,
    );
    expect(request.prompt?.split(sourcePrompt)).toHaveLength(2);
    expect(request.prompt?.split(userInstruction)).toHaveLength(2);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.nodes.find((node) => node.id === 'target-text')?.data).toMatchObject({
      textInstruction: userInstruction,
      outputText: '同类风格新提示词',
      output: '同类风格新提示词',
      generationError: undefined,
    });
  });

  it('repairs a legacy connected composer value that duplicated the upstream text', async () => {
    useCanvasStore.setState({
      nodes: [sourceNode(), targetNode({ prompt: `${sourcePrompt}\n\n${userInstruction}` })],
      edges: [connection],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-text');

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      mode?: string;
    };
    expect(request.prompt).toBe(
      `【输入来源】\n${sourcePrompt}\n\n【用户指令】\n${userInstruction}`,
    );
    expect(request.mode).toBe('自由指令');
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data
        .textInstruction,
    ).toBe(userInstruction);
  });

  it('does not submit an upstream prompt after its reference card is closed', async () => {
    useCanvasStore.setState({
      nodes: [
        sourceNode(),
        targetNode({
          textInstruction: userInstruction,
          composerReferenceSubmission: excludeTextSourcesFromSubmission(undefined, [sourcePrompt]),
        }),
      ],
      edges: [connection],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-text');

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as { prompt?: string };
    expect(request.prompt).toContain(userInstruction);
    expect(request.prompt).not.toContain(sourcePrompt);
    expect(useCanvasStore.getState().edges).toEqual([connection]);
  });

  it('lets a blank result node execute the complete request already written in its upstream node', async () => {
    const completeRequest = `${sourcePrompt}\n\n${userInstruction}`;
    useCanvasStore.setState({
      nodes: [
        {
          ...sourceNode(),
          data: {
            ...sourceNode().data,
            prompt: completeRequest,
            outputText: undefined,
            output: undefined,
          },
        },
        targetNode(),
      ],
      edges: [connection],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-text');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `【输入内容】\n${completeRequest}`,
        mode: '自由指令',
      }),
      expect.any(Function),
    );
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data.outputText,
    ).toBe('同类风格新提示词');
  });

  it('executes an existing standalone prompt as written instead of forcing continuation mode', async () => {
    const standalonePrompt = `【风格】墨锋赤影\n${sourcePrompt}\n\n${userInstruction}`;
    useCanvasStore.setState({
      nodes: [targetNode({ prompt: standalonePrompt })],
      edges: [],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-text');

    expect(mocks.generateNodeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: standalonePrompt,
        mode: '自由指令',
      }),
      expect.any(Function),
    );
  });

  it('lets a structured text mode process source material without a redundant instruction', async () => {
    useCanvasStore.setState({
      nodes: [
        targetNode({
          prompt: sourcePrompt,
          textContentRole: 'source',
          composerParams: { mode: '生成提示词', maxLength: 500, temperature: 0.2 },
        }),
      ],
      edges: [],
      past: [],
      future: [],
    });

    await useCanvasStore.getState().generateNode('target-text');

    const request = mocks.generateNodeContent.mock.calls[0]?.[0] as {
      prompt?: string;
      mode?: string;
      maxLength?: number;
      temperature?: number;
    };
    expect(request).toMatchObject({
      prompt: `【输入内容】\n${sourcePrompt}`,
      mode: '生成提示词',
    });
    expect(request.maxLength).toBeUndefined();
    expect(request.temperature).toBeUndefined();
  });

  it('returns a pending result to its original node after another node is selected and edited', async () => {
    let resolveGeneration: ((value: { text: string }) => void) | undefined;
    mocks.generateNodeContent.mockImplementationOnce(
      () =>
        new Promise<{ text: string }>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    useCanvasStore.setState({
      nodes: [
        sourceNode(),
        { ...targetNode({ textInstruction: userInstruction }), selected: true },
        secondaryNode(),
      ],
      edges: [connection],
      past: [],
      future: [],
      selectedNodeId: 'target-text',
    });

    const pendingGeneration = useCanvasStore.getState().generateNode('target-text');
    await vi.waitFor(() => {
      expect(mocks.generateNodeContent).toHaveBeenCalledTimes(1);
      expect(
        useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data.generating,
      ).toBe(true);
    });

    useCanvasStore.getState().onNodesChange([
      { id: 'target-text', type: 'select', selected: false },
      { id: 'secondary-text', type: 'select', selected: true },
    ]);
    useCanvasStore.getState().setSelectedNodeId('secondary-text');
    useCanvasStore.getState().updateNodeData('secondary-text', { prompt: '操作后的其他节点内容' });

    resolveGeneration?.({ text: '切换节点后返回的提示词' });
    await pendingGeneration;

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data,
    ).toMatchObject({
      generating: false,
      outputText: '切换节点后返回的提示词',
      output: '切换节点后返回的提示词',
      generationError: undefined,
    });
    expect(useCanvasStore.getState().selectedNodeId).toBe('secondary-text');
  });

  it('keeps the exact text request token when transport recovery is still pending', async () => {
    mocks.generateNodeContent.mockImplementationOnce(async (request: { requestId: string }) => {
      expect(
        useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data
          .generationRequestId,
      ).toBe(request.requestId);
      throw Object.assign(new Error('文本生成连接中断'), {
        generationRequestInterrupted: true,
        requestId: request.requestId,
        kind: 'text',
      });
    });

    await expect(useCanvasStore.getState().generateNode('target-text')).rejects.toThrow(
      '文本生成连接中断',
    );

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'target-text')?.data,
    ).toMatchObject({
      generating: false,
      generationRequestId: expect.stringMatching(/^gen-/),
      generationError: expect.stringContaining('检查生成结果'),
    });
  });
});
