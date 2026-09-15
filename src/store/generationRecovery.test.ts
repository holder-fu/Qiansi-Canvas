import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { parseCanvasPersistence } from './canvasPersistenceCodec';
import { readCanvasWorkspaceSnapshot } from './canvasWorkspaceStorage';

const mocks = vi.hoisted(() => ({
  generateNodeContent: vi.fn(),
  lookupGenerationRequestByRequestId: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  generateNodeContent: mocks.generateNodeContent,
  lookupGenerationRequestByRequestId: mocks.lookupGenerationRequestByRequestId,
}));

import { sanitizeNodes, useCanvasStore } from './canvasStore';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  } satisfies Storage,
});

function interruptedNode(kind: 'image' | 'video' | 'audio' | 'model-3d' | 'text'): FlowNode {
  return {
    id: `recover-${kind}`,
    type: kind,
    position: { x: 20, y: 30 },
    data: {
      kind,
      title: kind,
      description: `${kind} generation`,
      generating: false,
      generationRequestId: `gen-recovery-${kind}`,
      generationError: '页面刷新中断了结果回填',
      progress: 0,
    },
  };
}

function setRecoveryNode(kind: 'image' | 'video' | 'audio' | 'model-3d' | 'text') {
  useCanvasStore.setState({
    activeProjectId: 'recovery-project',
    projectName: '恢复测试',
    projects: [{ id: 'recovery-project', name: '恢复测试' }],
    workspace: 'views',
    nodes: sanitizeNodes([interruptedNode(kind)], { recoverInterruptedMediaGeneration: true }),
    edges: [],
    past: [],
    future: [],
    persistenceStatus: {
      projectId: 'recovery-project',
      state: 'saved',
      revision: 1,
    },
  });
}

describe('node generation registry recovery', () => {
  beforeEach(() => {
    storage.clear();
    mocks.generateNodeContent.mockReset();
    mocks.lookupGenerationRequestByRequestId.mockReset();
  });

  it.each([
    {
      kind: 'image' as const,
      result: { images: ['/output/recovered.png'] },
      field: 'imageUrl' as const,
      expected: 'http://127.0.0.1:2895/output/recovered.png',
    },
    {
      kind: 'video' as const,
      result: { videos: ['/output/recovered.mp4'] },
      field: 'videoUrl' as const,
      expected: 'http://127.0.0.1:2895/output/recovered.mp4',
    },
    {
      kind: 'audio' as const,
      result: { audios: ['/output/recovered.mp3'] },
      field: 'audioUrl' as const,
      expected: 'http://127.0.0.1:2895/output/recovered.mp3',
    },
    {
      kind: 'model-3d' as const,
      result: { models3d: ['/output/recovered.glb'] },
      field: 'model3dUrl' as const,
      expected: 'http://127.0.0.1:2895/output/recovered.glb',
    },
  ])('atomically restores a completed $kind request and persists it', async (fixture) => {
    setRecoveryNode(fixture.kind);
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: fixture.result,
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult(`recover-${fixture.kind}`),
    ).resolves.toBe('recovered');

    const recovered = useCanvasStore.getState().nodes[0];
    expect(recovered?.data[fixture.field]).toBe(fixture.expected);
    expect(recovered?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      generationError: undefined,
      progress: 100,
    });
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();

    const persistedRoot = parseCanvasPersistence<{
      projectStates: Record<string, unknown>;
      projectMeta: Record<string, { workspaceIds: string[] }>;
    }>(storage.get('kitty-canvas-state') ?? '');
    const persistedWorkspace = readCanvasWorkspaceSnapshot<{ nodes: FlowNode[] }>(
      localStorage,
      'recovery-project',
      'views',
    );
    expect(persistedRoot.projectStates).toEqual({});
    expect(persistedRoot.projectMeta['recovery-project']?.workspaceIds).toContain('views');
    expect(persistedWorkspace.status).toBe('found');
    if (persistedWorkspace.status !== 'found') throw new Error('Missing split workspace snapshot.');
    const persistedNode = persistedWorkspace.snapshot.nodes[0];
    expect(persistedNode?.data[fixture.field]).toBe(fixture.expected);
    expect(persistedNode?.data.generationRequestId).toBeUndefined();
  });

  it('atomically restores completed text, propagates it, and persists the exact output', async () => {
    setRecoveryNode('text');
    const text = '恢复后的高清人物图生成提示词';
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: { text },
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-text'),
    ).resolves.toBe('recovered');

    const recovered = useCanvasStore.getState().nodes[0];
    expect(recovered?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      generationTargetMediaSignature: undefined,
      generationError: undefined,
      progress: 100,
      result: text,
      outputText: text,
      output: text,
    });
    expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledWith(
      'gen-recovery-text',
      'text',
    );
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();

    const persistedWorkspace = readCanvasWorkspaceSnapshot<{ nodes: FlowNode[] }>(
      localStorage,
      'recovery-project',
      'views',
    );
    expect(persistedWorkspace.status).toBe('found');
    if (persistedWorkspace.status !== 'found') throw new Error('Missing split workspace snapshot.');
    expect(persistedWorkspace.snapshot.nodes[0]?.data).toMatchObject({
      outputText: text,
      output: text,
    });
    expect(persistedWorkspace.snapshot.nodes[0]?.data.generationRequestId).toBeUndefined();
  });

  it('can reconcile a still-active image node after the tab resumes', async () => {
    const active = interruptedNode('image');
    active.data.generating = true;
    active.data.progress = 61;
    active.data.generationError = undefined;
    useCanvasStore.setState({
      activeProjectId: 'recovery-project',
      projectName: '恢复测试',
      projects: [{ id: 'recovery-project', name: '恢复测试' }],
      workspace: 'views',
      nodes: [active],
      edges: [],
      past: [],
      future: [],
    });
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: { images: ['/output/resumed-tab.png'] },
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-image', {
        automatic: true,
      }),
    ).resolves.toBe('recovered');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generating: false,
      generationRequestId: undefined,
      progress: 100,
      imageUrl: 'http://127.0.0.1:2895/output/resumed-tab.png',
    });
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('replaces every stale image alias when a completed regeneration is recovered', async () => {
    const node = interruptedNode('image');
    node.data.imageUrl = '/asset-library/files/old-image';
    node.data.images = ['/asset-library/files/old-image'];
    node.data.originalUrl = '/asset-library/files/old-image';
    node.data.previewUrl = '/media-preview/files/old-image.webp';
    node.data.bridgeAssetId = 'old-asset-id';
    node.data.mediaPersistenceState = 'session-only';
    node.data.mediaMimeType = 'image/png';
    useCanvasStore.setState({
      activeProjectId: 'recovery-project',
      projectName: '恢复测试',
      projects: [{ id: 'recovery-project', name: '恢复测试' }],
      workspace: 'views',
      nodes: [node],
      edges: [],
      past: [],
      future: [],
    });
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: { images: ['/output/recovered-new.png'] },
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-image'),
    ).resolves.toBe('recovered');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      imageUrl: 'http://127.0.0.1:2895/output/recovered-new.png',
      images: ['http://127.0.0.1:2895/output/recovered-new.png'],
      originalUrl: 'http://127.0.0.1:2895/output/recovered-new.png',
      output: 'http://127.0.0.1:2895/output/recovered-new.png',
      previewUrl: undefined,
      bridgeAssetId: undefined,
      mediaPersistenceState: undefined,
      mediaMimeType: undefined,
      generationRequestId: undefined,
    });
  });

  it.each([
    {
      kind: 'image' as const,
      collection: 'images' as const,
      mediaField: 'imageUrl' as const,
      extension: 'png',
    },
    {
      kind: 'video' as const,
      collection: 'videos' as const,
      mediaField: 'videoUrl' as const,
      extension: 'mp4',
    },
  ])('fans out a recovered multi-$kind result without mixing sibling media', async (fixture) => {
    setRecoveryNode(fixture.kind);
    const urls = [1, 2, 3].map((ordinal) => `/output/recovered-${ordinal}.${fixture.extension}`);
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: { [fixture.collection]: urls },
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult(`recover-${fixture.kind}`),
    ).resolves.toBe('recovered');

    const nodes = useCanvasStore.getState().nodes;
    const source = nodes.find((node) => node.id === `recover-${fixture.kind}`);
    const siblings = nodes
      .filter((node) => node.data.generatedBatchSourceId === `recover-${fixture.kind}`)
      .sort(
        (left, right) =>
          Number(left.data.generatedBatchIndex) - Number(right.data.generatedBatchIndex),
      );
    const expected = urls.map((url) => `http://127.0.0.1:2895${url}`);

    expect(source?.data[fixture.mediaField]).toBe(expected[0]);
    expect(source?.data[fixture.collection]).toEqual([expected[0]]);
    expect(siblings.map((node) => node.data[fixture.mediaField])).toEqual(expected.slice(1));
    expect(siblings.map((node) => node.data.generatedBatchIndex)).toEqual([2, 3]);
    expect(siblings.map((node) => node.id)).toEqual([
      `recover-${fixture.kind}--generated--gen-recovery-${fixture.kind}--2`,
      `recover-${fixture.kind}--generated--gen-recovery-${fixture.kind}--3`,
    ]);
    expect(siblings.map((node) => node.data.generatedBatchRequestId)).toEqual([
      `gen-recovery-${fixture.kind}`,
      `gen-recovery-${fixture.kind}`,
    ]);
    expect(nodes.every((node) => node.data.generationRequestId === undefined)).toBe(true);
    expect(useCanvasStore.getState().edges).toEqual([]);

    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === `recover-${fixture.kind}`
          ? {
              ...node,
              data: {
                ...node.data,
                generationRequestId: `gen-recovery-${fixture.kind}`,
                generationTargetMediaSignature: undefined,
              },
            }
          : node,
      ),
    }));
    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult(`recover-${fixture.kind}`),
    ).resolves.toBe('recovered');
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(
      nodes.map((node) => node.id),
    );
  });

  it.each([
    {
      kind: 'image' as const,
      collection: 'images' as const,
      mediaField: 'imageUrl' as const,
      extension: 'png',
    },
    {
      kind: 'video' as const,
      collection: 'videos' as const,
      mediaField: 'videoUrl' as const,
      extension: 'mp4',
    },
  ])(
    'recovers a legacy multi-$kind sibling by its batch index without duplicating the batch',
    async (fixture) => {
      const requestId = `gen-legacy-batch-${fixture.kind}`;
      const sourceId = `legacy-batch-source-${fixture.kind}`;
      const siblingId = `legacy-batch-sibling-${fixture.kind}`;
      const relativeUrls = [1, 2, 3].map(
        (ordinal) => `/output/legacy-${fixture.kind}-${ordinal}.${fixture.extension}`,
      );
      const urls = relativeUrls.map((url) => `http://127.0.0.1:2895${url}`);
      const [firstUrl, secondUrl] = urls as [string, string, string];
      const source = interruptedNode(fixture.kind);
      source.id = sourceId;
      source.data.generationRequestId = undefined;
      source.data.generationError = undefined;
      source.data.originalUrl = firstUrl;
      source.data.output = firstUrl;
      source.data[fixture.mediaField] = firstUrl;
      source.data[fixture.collection] = [firstUrl];

      const sibling = interruptedNode(fixture.kind);
      sibling.id = siblingId;
      sibling.position = { x: 420, y: 30 };
      sibling.data.generationRequestId = requestId;
      sibling.data.generatedBatchSourceId = sourceId;
      sibling.data.generatedBatchIndex = 2;
      sibling.data.originalUrl = secondUrl;
      sibling.data.output = secondUrl;
      sibling.data[fixture.mediaField] = secondUrl;
      sibling.data[fixture.collection] = [secondUrl];

      useCanvasStore.setState({
        activeProjectId: 'recovery-project',
        projectName: '恢复测试',
        projects: [{ id: 'recovery-project', name: '恢复测试' }],
        workspace: 'views',
        nodes: [source, sibling],
        edges: [],
        past: [],
        future: [],
      });
      mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
        status: 'complete',
        result: { [fixture.collection]: relativeUrls },
      });

      await expect(useCanvasStore.getState().recoverNodeGenerationResult(siblingId)).resolves.toBe(
        'recovered',
      );

      const nodes = useCanvasStore.getState().nodes;
      const recoveredSibling = nodes.find((node) => node.id === siblingId);
      expect(nodes.map((node) => node.id)).toEqual([sourceId, siblingId]);
      expect(recoveredSibling?.data).toMatchObject({
        [fixture.mediaField]: urls[1],
        [fixture.collection]: [urls[1]],
        originalUrl: urls[1],
        output: urls[1],
        generationRequestId: undefined,
        generatedBatchSourceId: sourceId,
        generatedBatchIndex: 2,
      });
      expect(nodes.some((node) => node.data.generatedBatchSourceId === siblingId)).toBe(false);
      expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledWith(
        requestId,
        fixture.kind,
      );
    },
  );

  it('retains an interrupted request token on reload even when an older result is still visible', () => {
    const node = interruptedNode('image');
    node.data.imageUrl = 'https://example.test/older-result.png';
    node.data.originalUrl = 'https://example.test/older-result.png';

    const [restored] = sanitizeNodes([node], { recoverInterruptedMediaGeneration: true });

    expect(restored?.data).toMatchObject({
      imageUrl: 'https://example.test/older-result.png',
      generationRequestId: 'gen-recovery-image',
      generationError: expect.stringContaining('检查生成结果'),
    });
  });

  it.each([
    {
      lookup: { status: 'pending' as const },
      status: 'pending',
      message: '仍在本机后台执行',
      clearsRequest: false,
    },
    {
      lookup: { status: 'failed' as const, error: 'provider quota exhausted' },
      status: 'failed',
      message: 'provider quota exhausted',
      clearsRequest: true,
    },
    {
      lookup: { status: 'missing' as const },
      status: 'missing',
      message: '已确认缺失',
      clearsRequest: true,
    },
  ])('reports $status without resubmitting the provider request', async (fixture) => {
    setRecoveryNode('video');
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue(fixture.lookup);

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-video'),
    ).resolves.toBe(fixture.status);

    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe(
      fixture.clearsRequest ? undefined : 'gen-recovery-video',
    );
    expect(useCanvasStore.getState().nodes[0]?.data.generationError).toContain(fixture.message);
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it.each([
    {
      lookup: { status: 'pending' as const },
      status: 'pending' as const,
    },
    {
      lookup: { status: 'missing' as const },
      status: 'missing' as const,
    },
  ])(
    'leaves the node and persistence untouched for an automatic $status lookup',
    async (fixture) => {
      setRecoveryNode('video');
      const nodeBeforeLookup = useCanvasStore.getState().nodes[0];
      mocks.lookupGenerationRequestByRequestId.mockResolvedValue(fixture.lookup);

      await expect(
        useCanvasStore.getState().recoverNodeGenerationResult('recover-video', { automatic: true }),
      ).resolves.toBe(fixture.status);

      expect(useCanvasStore.getState().nodes[0]).toEqual(nodeBeforeLookup);
      expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe(
        'gen-recovery-video',
      );
      expect(storage.size).toBe(0);
      expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledTimes(1);
      expect(mocks.generateNodeContent).not.toHaveBeenCalled();
    },
  );

  it('leaves the node and persistence untouched when an automatic lookup throws', async () => {
    setRecoveryNode('audio');
    const nodeBeforeLookup = useCanvasStore.getState().nodes[0];
    mocks.lookupGenerationRequestByRequestId.mockRejectedValue(new Error('bridge offline'));

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-audio', { automatic: true }),
    ).resolves.toBe('error');

    expect(useCanvasStore.getState().nodes[0]).toEqual(nodeBeforeLookup);
    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe('gen-recovery-audio');
    expect(storage.size).toBe(0);
    expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledTimes(1);
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('clears and persists an explicitly failed request in automatic mode', async () => {
    setRecoveryNode('image');
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'failed',
      error: 'provider rejected the request',
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-image', { automatic: true }),
    ).resolves.toBe('failed');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generationRequestId: undefined,
      generationError: expect.stringContaining('provider rejected the request'),
    });
    const persistedWorkspace = readCanvasWorkspaceSnapshot<{ nodes: FlowNode[] }>(
      localStorage,
      'recovery-project',
      'views',
    );
    expect(persistedWorkspace.status).toBe('found');
    if (persistedWorkspace.status !== 'found') throw new Error('Missing split workspace snapshot.');
    expect(persistedWorkspace.snapshot.nodes[0]?.data.generationRequestId).toBeUndefined();
    expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledTimes(1);
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('automatically restores a completed result with one lookup and no resubmission', async () => {
    setRecoveryNode('video');
    mocks.lookupGenerationRequestByRequestId.mockResolvedValue({
      status: 'complete',
      result: { videos: ['/output/automatic-recovery.mp4'] },
    });

    await expect(
      useCanvasStore.getState().recoverNodeGenerationResult('recover-video', { automatic: true }),
    ).resolves.toBe('recovered');

    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      videoUrl: 'http://127.0.0.1:2895/output/automatic-recovery.mp4',
      generationRequestId: undefined,
      generationError: undefined,
      progress: 100,
    });
    expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledTimes(1);
    expect(mocks.lookupGenerationRequestByRequestId).toHaveBeenCalledWith(
      'gen-recovery-video',
      'video',
    );
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('rejects an automatic result if Bridge authority is lost while the lookup is in flight', async () => {
    setRecoveryNode('image');
    let finishLookup: ((value: unknown) => void) | undefined;
    mocks.lookupGenerationRequestByRequestId.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const recovery = useCanvasStore
      .getState()
      .recoverNodeGenerationResult('recover-image', { automatic: true });
    useCanvasStore.setState({
      persistenceStatus: {
        projectId: 'recovery-project',
        state: 'conflict',
        revision: 1,
      },
    });
    finishLookup?.({ status: 'complete', result: { images: ['/output/conflicted.png'] } });

    await expect(recovery).resolves.toBe('stale');
    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe('gen-recovery-image');
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBeUndefined();
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('does not overwrite newer media if node content changes while recovery is in flight', async () => {
    setRecoveryNode('image');
    let finishLookup: ((value: unknown) => void) | undefined;
    mocks.lookupGenerationRequestByRequestId.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const recovery = useCanvasStore
      .getState()
      .recoverNodeGenerationResult('recover-image', { automatic: true });
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'recover-image'
          ? {
              ...node,
              data: {
                ...node.data,
                imageUrl: '/output/user-selected.png',
                images: ['/output/user-selected.png'],
                originalUrl: '/output/user-selected.png',
              },
            }
          : node,
      ),
    }));
    finishLookup?.({ status: 'complete', result: { images: ['/output/late-result.png'] } });

    await expect(recovery).resolves.toBe('stale');
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBe('/output/user-selected.png');
    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe('gen-recovery-image');
    expect(mocks.generateNodeContent).not.toHaveBeenCalled();
  });

  it('blocks manual media replacement until the unresolved request is checked', () => {
    setRecoveryNode('audio');

    useCanvasStore.getState().updateNodeData('recover-audio', {
      audioUrl: '/output/user-selected.mp3',
      audios: ['/output/user-selected.mp3'],
      output: '/output/user-selected.mp3',
      generationError: undefined,
    });

    expect(useCanvasStore.getState().nodes[0]?.data.audioUrl).toBeUndefined();
    expect(useCanvasStore.getState().nodes[0]?.data.generationRequestId).toBe('gen-recovery-audio');
    expect(useCanvasStore.getState().nodes[0]?.data.generationError).toContain('请先检查生成结果');
  });

  it.each(['image', 'video', 'audio', 'text'] as const)(
    'blocks a new %s submission while an unresolved request token exists',
    async (kind) => {
      setRecoveryNode(kind);

      await useCanvasStore.getState().generateNode(`recover-${kind}`);

      expect(mocks.generateNodeContent).not.toHaveBeenCalled();
      expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
        generationRequestId: `gen-recovery-${kind}`,
        generationError: expect.stringContaining('检查生成结果'),
      });
    },
  );

  it('rejects a completed result after the four-part recovery identity becomes stale', async () => {
    setRecoveryNode('image');
    let finishLookup: ((value: unknown) => void) | undefined;
    mocks.lookupGenerationRequestByRequestId.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const recovery = useCanvasStore.getState().recoverNodeGenerationResult('recover-image');
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, generationRequestId: 'gen-newer-request' },
      })),
    }));
    finishLookup?.({ status: 'complete', result: { images: ['/output/stale.png'] } });

    await expect(recovery).resolves.toBe('stale');
    expect(useCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generationRequestId: 'gen-newer-request',
    });
    expect(useCanvasStore.getState().nodes[0]?.data.imageUrl).toBeUndefined();
  });

  it('does not write a result into a different active project', async () => {
    setRecoveryNode('video');
    let finishLookup: ((value: unknown) => void) | undefined;
    mocks.lookupGenerationRequestByRequestId.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const recovery = useCanvasStore.getState().recoverNodeGenerationResult('recover-video');
    useCanvasStore.setState({ activeProjectId: 'another-project' });
    finishLookup?.({ status: 'complete', result: { videos: ['/output/wrong-project.mp4'] } });

    await expect(recovery).resolves.toBe('stale');
    expect(useCanvasStore.getState().nodes[0]?.data.videoUrl).toBeUndefined();
  });
});
