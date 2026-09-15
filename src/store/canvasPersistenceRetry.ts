export const CANVAS_PERSISTENCE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

type RetryTimer = ReturnType<typeof globalThis.setTimeout>;

/**
 * Keeps automatic persistence retries finite and project-scoped. The caller
 * remains responsible for deciding whether a failure is retryable; conflicts
 * and integrity failures must never be scheduled here.
 */
export class CanvasPersistenceRetryScheduler {
  private readonly attempts = new Map<string, number>();
  private readonly timers = new Map<string, RetryTimer>();
  private readonly retry: (projectId: string) => void | Promise<void>;
  private readonly delays: readonly number[];
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly clearTimer: typeof globalThis.clearTimeout;

  constructor(
    retry: (projectId: string) => void | Promise<void>,
    delays: readonly number[] = CANVAS_PERSISTENCE_RETRY_DELAYS_MS,
    setTimer: typeof globalThis.setTimeout = globalThis.setTimeout.bind(globalThis),
    clearTimer: typeof globalThis.clearTimeout = globalThis.clearTimeout.bind(globalThis),
  ) {
    this.retry = retry;
    this.delays = delays;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  schedule(projectId: string) {
    if (!projectId || this.timers.has(projectId)) return false;
    const attempt = this.attempts.get(projectId) ?? 0;
    const delay = this.delays[attempt];
    if (delay === undefined) return false;

    this.attempts.set(projectId, attempt + 1);
    const timer = this.setTimer(() => {
      this.timers.delete(projectId);
      void this.retry(projectId);
    }, delay);
    this.timers.set(projectId, timer);
    return true;
  }

  cancel(projectId: string, resetAttempts = false) {
    const timer = this.timers.get(projectId);
    if (timer !== undefined) this.clearTimer(timer);
    this.timers.delete(projectId);
    if (resetAttempts) this.attempts.delete(projectId);
  }

  reset(projectId: string) {
    this.cancel(projectId, true);
  }

  pending(projectId: string) {
    return this.timers.has(projectId);
  }

  attemptCount(projectId: string) {
    return this.attempts.get(projectId) ?? 0;
  }
}
