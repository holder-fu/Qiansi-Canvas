import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode, NodeKind, WorkspaceId } from '../canvas/nodeTypes';
import type { NodeGenerationRecoveryStatus } from '../store/canvasStore';
import {
  GENERATION_RECOVERY_MAX_CONCURRENCY,
  GenerationRecoveryCoordinator,
  type GenerationRecoveryCoordinatorDependencies,
  type GenerationRecoverySnapshot,
} from './generationRecoveryCoordinator';

function node(
  id: string,
  kind: NodeKind,
  generationRequestId: unknown,
  generating = false,
): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, title: id, generationRequestId, generating },
  } as FlowNode;
}

function coordinatorHarness(initialNodes: FlowNode[]) {
  let snapshot: GenerationRecoverySnapshot = {
    projectId: 'project-a',
    workspace: 'video',
    nodes: initialNodes,
  };
  let authorityReady = true;
  let visible = true;
  let online = true;
  const stateListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  const connectivityListeners = new Set<() => void>();
  const recover =
    vi.fn<(nodeId: string, signal: AbortSignal) => Promise<NodeGenerationRecoveryStatus>>();
  const dependencies: GenerationRecoveryCoordinatorDependencies = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    isAuthorityReady: () => authorityReady,
    recover,
    isVisible: () => visible,
    isOnline: () => online,
    subscribeToVisibility: (listener) => {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
    subscribeToConnectivity: (listener) => {
      connectivityListeners.add(listener);
      return () => connectivityListeners.delete(listener);
    },
    now: () => Date.now(),
    random: () => 0.5,
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  };
  return {
    coordinator: new GenerationRecoveryCoordinator(dependencies),
    recover,
    setAuthorityReady(value: boolean) {
      authorityReady = value;
      for (const listener of stateListeners) listener();
    },
    setSnapshot(projectId: string, workspace: WorkspaceId, nodes: FlowNode[]) {
      snapshot = { projectId, workspace, nodes };
      for (const listener of stateListeners) listener();
    },
    setVisible(value: boolean) {
      visible = value;
      for (const listener of visibilityListeners) listener();
    },
    setOnline(value: boolean) {
      online = value;
      for (const listener of connectivityListeners) listener();
    },
    listenerCounts: () => ({
      state: stateListeners.size,
      visibility: visibilityListeners.size,
      connectivity: connectivityListeners.size,
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GenerationRecoveryCoordinator', () => {
  it('waits for authority, filters current recoverable nodes, and caps recovery at five concurrent calls', async () => {
    vi.useFakeTimers();
    const nodes = Array.from({ length: 7 }, (_, index) =>
      node(`video-${index}`, 'video', `request-${index}`),
    );
    nodes.push(
      node('image', 'image', ' request-image '),
      node('audio', 'audio', 'request-audio'),
      node('text', 'text', 'request-text'),
      node('still-generating', 'video', 'request-live', true),
      node('empty-token', 'image', '   '),
      node('invalid-token', 'video', 'bad token'),
    );
    const harness = coordinatorHarness(nodes);
    harness.setAuthorityReady(false);
    const resolvers: Array<(status: NodeGenerationRecoveryStatus) => void> = [];
    harness.recover.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    const cleanup = harness.coordinator.start();
    expect(harness.recover).not.toHaveBeenCalled();
    harness.setAuthorityReady(true);
    expect(harness.recover).toHaveBeenCalledTimes(GENERATION_RECOVERY_MAX_CONCURRENCY);
    expect(harness.recover.mock.calls.flat()).not.toContain('empty-token');
    expect(harness.recover.mock.calls.flat()).not.toContain('invalid-token');

    resolvers.shift()?.('recovered');
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(GENERATION_RECOVERY_MAX_CONCURRENCY + 1);
    cleanup();
    expect(harness.listenerCounts()).toEqual({ state: 0, visibility: 0, connectivity: 0 });
  });

  it('tracks interrupted text requests through the same query-only recovery path', async () => {
    vi.useFakeTimers();
    const harness = coordinatorHarness([node('text', 'text', 'request-text')]);
    harness.recover.mockResolvedValue('recovered');

    const cleanup = harness.coordinator.start();
    await vi.runAllTicks();

    expect(harness.recover).toHaveBeenCalledOnce();
    expect(harness.recover).toHaveBeenCalledWith('text', expect.any(AbortSignal));
    cleanup();
  });

  it('queries an active request after tab resume without submitting generation work', async () => {
    vi.useFakeTimers();
    const harness = coordinatorHarness([
      node('active-image', 'image', 'request-active-image', true),
    ]);
    harness.setVisible(false);
    harness.recover.mockResolvedValue('pending');

    const cleanup = harness.coordinator.start();
    expect(harness.recover).not.toHaveBeenCalled();

    harness.setVisible(true);
    await vi.runAllTicks();

    expect(harness.recover).toHaveBeenCalledOnce();
    expect(harness.recover).toHaveBeenCalledWith('active-image', expect.any(AbortSignal));
    cleanup();
  });

  it('uses the pending and error backoff sequences without parallel timers', async () => {
    vi.useFakeTimers();
    const harness = coordinatorHarness([node('video', 'video', 'request')]);
    harness.recover
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('error')
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('recovered');
    const cleanup = harness.coordinator.start();
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.recover).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.recover).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(harness.recover).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.recover).toHaveBeenCalledTimes(5);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.recover).toHaveBeenCalledTimes(5);
    cleanup();
  });

  it('aborts abandoned scope lookups without starving the new project', async () => {
    vi.useFakeTimers();
    const oldNodes = Array.from({ length: GENERATION_RECOVERY_MAX_CONCURRENCY }, (_, index) =>
      node(`old-video-${index}`, 'video', `old-request-${index}`),
    );
    const harness = coordinatorHarness(oldNodes);
    const oldSignals: AbortSignal[] = [];
    harness.recover.mockImplementation((nodeId, signal) => {
      if (nodeId.startsWith('old-')) {
        oldSignals.push(signal);
        return new Promise(() => {});
      }
      return Promise.resolve('recovered');
    });
    const cleanup = harness.coordinator.start();
    expect(harness.recover).toHaveBeenCalledTimes(GENERATION_RECOVERY_MAX_CONCURRENCY);

    harness.setSnapshot('project-b', 'video', [node('new-video', 'video', 'new-request')]);
    await vi.runAllTicks();

    expect(oldSignals).toHaveLength(GENERATION_RECOVERY_MAX_CONCURRENCY);
    expect(oldSignals.every((signal) => signal.aborted)).toBe(true);
    expect(harness.recover).toHaveBeenCalledTimes(GENERATION_RECOVERY_MAX_CONCURRENCY + 1);
    expect(harness.recover).toHaveBeenLastCalledWith('new-video', expect.any(AbortSignal));
    cleanup();
  });

  it('pauses while hidden or offline and wakes pending work immediately on resume', async () => {
    vi.useFakeTimers();
    const harness = coordinatorHarness([node('video', 'video', 'request')]);
    harness.recover.mockResolvedValue('pending');
    const cleanup = harness.coordinator.start();
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(1);

    harness.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    harness.setVisible(true);
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(2);

    harness.setOnline(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.recover).toHaveBeenCalledTimes(2);
    harness.setOnline(true);
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(3);
    cleanup();
  });

  it('drops old tasks when the project, workspace, or request identity changes', async () => {
    vi.useFakeTimers();
    const harness = coordinatorHarness([node('video', 'video', 'old-request')]);
    harness.recover.mockResolvedValue('pending');
    const cleanup = harness.coordinator.start();
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(1);

    harness.setSnapshot('project-a', 'video', [node('video', 'video', 'new-request')]);
    await vi.runAllTicks();
    expect(harness.recover).toHaveBeenCalledTimes(2);
    harness.setSnapshot('project-b', 'audio', []);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.recover).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
