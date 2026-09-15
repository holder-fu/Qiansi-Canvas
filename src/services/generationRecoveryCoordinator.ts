import type { FlowNode, WorkspaceId } from '../canvas/nodeTypes';
import {
  isBridgeCanvasAuthorityReadyForLan,
  useCanvasStore,
  type NodeGenerationRecoveryStatus,
} from '../store/canvasStore';

export const GENERATION_RECOVERY_PENDING_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;
export const GENERATION_RECOVERY_ERROR_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000] as const;
export const GENERATION_RECOVERY_MAX_CONCURRENCY = 5;
export const GENERATION_RECOVERY_LOOKUP_TIMEOUT_MS = 15_000;

export interface GenerationRecoverySnapshot {
  projectId: string;
  workspace: WorkspaceId;
  nodes: readonly FlowNode[];
}

export interface GenerationRecoveryCoordinatorDependencies {
  getSnapshot: () => GenerationRecoverySnapshot;
  subscribe: (listener: () => void) => () => void;
  isAuthorityReady: (projectId: string) => boolean;
  recover: (nodeId: string, signal: AbortSignal) => Promise<NodeGenerationRecoveryStatus>;
  isVisible: () => boolean;
  isOnline: () => boolean;
  subscribeToVisibility: (listener: () => void) => () => void;
  subscribeToConnectivity: (listener: () => void) => () => void;
  now: () => number;
  random: () => number;
  setTimeout: (handler: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
}

interface RecoveryTask {
  key: string;
  projectId: string;
  workspace: WorkspaceId;
  nodeId: string;
  requestId: string;
  dueAt: number;
  pendingAttempt: number;
  errorAttempt: number;
  inFlight: boolean;
  controller?: AbortController;
}

function recoveryTaskKey(
  projectId: string,
  workspace: WorkspaceId,
  nodeId: string,
  requestId: string,
) {
  return JSON.stringify([projectId, workspace, nodeId, requestId]);
}

function recoverableRequestId(node: FlowNode): string | undefined {
  if (
    node.data.kind !== 'image' &&
    node.data.kind !== 'video' &&
    node.data.kind !== 'audio' &&
    node.data.kind !== 'text'
  ) {
    return undefined;
  }
  if (typeof node.data.generationRequestId !== 'string') return undefined;
  const requestId = node.data.generationRequestId.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{5,119}$/.test(requestId) ? requestId : undefined;
}

function jitteredDelay(baseDelayMs: number, random: () => number) {
  const sample = random();
  const normalized = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
  return Math.round(baseDelayMs * (0.8 + normalized * 0.4));
}

function delayAt(delays: readonly number[], attempt: number) {
  return delays[Math.min(attempt, delays.length - 1)] as number;
}

/**
 * Coordinates reload and resumed-tab recovery independently from node
 * rendering. The Bridge request id is the durable identity; this class only
 * checks it and never submits provider work. Tracking live nodes is safe and
 * closes the gap where a frozen browser never settles its original POST.
 */
export class GenerationRecoveryCoordinator {
  private readonly dependencies: GenerationRecoveryCoordinatorDependencies;
  private readonly tasks = new Map<string, RecoveryTask>();
  private readonly cleanups: Array<() => void> = [];
  private activeScope = '';
  private timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private started = false;

  constructor(dependencies: GenerationRecoveryCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  start() {
    if (this.started) return () => this.stop();
    this.started = true;
    this.cleanups.push(
      this.dependencies.subscribe(() => this.refresh()),
      this.dependencies.subscribeToVisibility(() => this.handleEnvironmentChange()),
      this.dependencies.subscribeToConnectivity(() => this.handleEnvironmentChange()),
    );
    this.refresh();
    return () => this.stop();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.cancelTimer();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.clearTasks();
    this.activeScope = '';
  }

  /** Reconcile current authoritative nodes. Useful for lifecycle integration and tests. */
  refresh() {
    if (!this.started) return;
    const snapshot = this.dependencies.getSnapshot();
    const scope = recoveryTaskKey(snapshot.projectId, snapshot.workspace, '', '');
    if (scope !== this.activeScope) {
      this.clearTasks();
      this.activeScope = scope;
      this.cancelTimer();
    }

    if (!this.dependencies.isAuthorityReady(snapshot.projectId)) {
      this.cancelTimer();
      return;
    }

    const desired = new Map<
      string,
      Omit<RecoveryTask, 'dueAt' | 'pendingAttempt' | 'errorAttempt' | 'inFlight'>
    >();
    for (const node of snapshot.nodes) {
      const requestId = recoverableRequestId(node);
      if (!requestId) continue;
      const key = recoveryTaskKey(snapshot.projectId, snapshot.workspace, node.id, requestId);
      desired.set(key, {
        key,
        projectId: snapshot.projectId,
        workspace: snapshot.workspace,
        nodeId: node.id,
        requestId,
      });
    }

    for (const key of this.tasks.keys()) {
      if (!desired.has(key)) this.tasks.delete(key);
    }
    const now = this.dependencies.now();
    for (const [key, task] of desired) {
      if (this.tasks.has(key)) continue;
      this.tasks.set(key, {
        ...task,
        dueAt: now,
        pendingAttempt: 0,
        errorAttempt: 0,
        inFlight: false,
      });
    }
    this.pump();
  }

  private handleEnvironmentChange() {
    if (!this.started) return;
    if (this.isPaused()) {
      this.cancelTimer();
      return;
    }
    const now = this.dependencies.now();
    for (const task of this.tasks.values()) {
      if (!task.inFlight) task.dueAt = now;
    }
    this.refresh();
  }

  private isPaused() {
    return !this.dependencies.isVisible() || !this.dependencies.isOnline();
  }

  private pump() {
    if (!this.started || this.isPaused()) {
      this.cancelTimer();
      return;
    }
    this.cancelTimer();
    const now = this.dependencies.now();
    const ready = [...this.tasks.values()]
      .filter((task) => !task.inFlight && task.dueAt <= now)
      .sort((left, right) => left.dueAt - right.dueAt);

    let activeCount = this.activeTaskCount();
    while (activeCount < GENERATION_RECOVERY_MAX_CONCURRENCY && ready.length > 0) {
      const task = ready.shift() as RecoveryTask;
      if (this.tasks.get(task.key) !== task) continue;
      task.inFlight = true;
      activeCount += 1;
      void this.runTask(task);
    }
    this.scheduleNextWake();
  }

  private async runTask(task: RecoveryTask) {
    let status: NodeGenerationRecoveryStatus = 'error';
    let timedOut = false;
    const controller = new AbortController();
    task.controller = controller;
    const timeout = this.dependencies.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, GENERATION_RECOVERY_LOOKUP_TIMEOUT_MS);
    try {
      status = await this.dependencies.recover(task.nodeId, controller.signal);
    } catch {
      status = 'error';
    } finally {
      this.dependencies.clearTimeout(timeout);
      if (task.controller === controller) task.controller = undefined;
    }
    if (timedOut) status = 'error';

    if (!this.started || this.tasks.get(task.key) !== task) {
      this.pump();
      return;
    }
    task.inFlight = false;
    if (status === 'pending') {
      const baseDelay = delayAt(GENERATION_RECOVERY_PENDING_DELAYS_MS, task.pendingAttempt);
      task.pendingAttempt += 1;
      task.errorAttempt = 0;
      task.dueAt = this.dependencies.now() + jitteredDelay(baseDelay, this.dependencies.random);
    } else if (status === 'error' || status === 'missing') {
      const baseDelay = delayAt(GENERATION_RECOVERY_ERROR_DELAYS_MS, task.errorAttempt);
      task.errorAttempt += 1;
      task.pendingAttempt = 0;
      task.dueAt = this.dependencies.now() + jitteredDelay(baseDelay, this.dependencies.random);
    } else {
      this.tasks.delete(task.key);
    }
    this.pump();
  }

  private scheduleNextWake() {
    if (
      !this.started ||
      this.isPaused() ||
      this.activeTaskCount() >= GENERATION_RECOVERY_MAX_CONCURRENCY
    ) {
      return;
    }
    let earliest = Number.POSITIVE_INFINITY;
    for (const task of this.tasks.values()) {
      if (!task.inFlight) earliest = Math.min(earliest, task.dueAt);
    }
    if (!Number.isFinite(earliest)) return;
    const delay = Math.max(0, earliest - this.dependencies.now());
    this.timer = this.dependencies.setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, delay);
  }

  private cancelTimer() {
    if (this.timer === undefined) return;
    this.dependencies.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private activeTaskCount() {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.inFlight) count += 1;
    }
    return count;
  }

  private clearTasks() {
    for (const task of this.tasks.values()) task.controller?.abort();
    this.tasks.clear();
  }
}

function defaultDependencies(): GenerationRecoveryCoordinatorDependencies {
  return {
    getSnapshot: () => {
      const state = useCanvasStore.getState();
      return {
        projectId: state.activeProjectId,
        workspace: state.workspace,
        nodes: state.nodes,
      };
    },
    subscribe: (listener) => useCanvasStore.subscribe(() => listener()),
    isAuthorityReady: isBridgeCanvasAuthorityReadyForLan,
    recover: (nodeId, signal) =>
      useCanvasStore.getState().recoverNodeGenerationResult(nodeId, {
        automatic: true,
        signal,
      }),
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    subscribeToVisibility: (listener) => {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
    subscribeToConnectivity: (listener) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
      };
    },
    now: () => Date.now(),
    random: () => Math.random(),
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  };
}

export function startGenerationRecoveryCoordinator(
  overrides: Partial<GenerationRecoveryCoordinatorDependencies> = {},
) {
  const coordinator = new GenerationRecoveryCoordinator({
    ...defaultDependencies(),
    ...overrides,
  });
  return coordinator.start();
}
