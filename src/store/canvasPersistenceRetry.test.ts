import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_PERSISTENCE_RETRY_DELAYS_MS,
  CanvasPersistenceRetryScheduler,
} from './canvasPersistenceRetry';

describe('CanvasPersistenceRetryScheduler', () => {
  it('binds the browser timer receiver instead of throwing Illegal invocation', () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const receiverSensitiveSetTimeout = vi.fn(function (
      this: typeof globalThis,
      _handler: TimerHandler,
    ) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return 1 as unknown as ReturnType<typeof globalThis.setTimeout>;
    });
    const receiverSensitiveClearTimeout = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
    });
    globalThis.setTimeout = receiverSensitiveSetTimeout as unknown as typeof globalThis.setTimeout;
    globalThis.clearTimeout = receiverSensitiveClearTimeout as typeof globalThis.clearTimeout;

    try {
      const scheduler = new CanvasPersistenceRetryScheduler(vi.fn());
      expect(scheduler.schedule('project-a')).toBe(true);
      scheduler.cancel('project-a');
      expect(receiverSensitiveSetTimeout).toHaveBeenCalledOnce();
      expect(receiverSensitiveClearTimeout).toHaveBeenCalledOnce();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('retries one project with finite backoff and never creates parallel timers', async () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const scheduler = new CanvasPersistenceRetryScheduler(retry);

    expect(scheduler.schedule('project-a')).toBe(true);
    expect(scheduler.schedule('project-a')).toBe(false);
    expect(scheduler.attemptCount('project-a')).toBe(1);

    await vi.advanceTimersByTimeAsync(CANVAS_PERSISTENCE_RETRY_DELAYS_MS[0]);
    expect(retry).toHaveBeenCalledWith('project-a');
    expect(scheduler.pending('project-a')).toBe(false);

    expect(scheduler.schedule('project-a')).toBe(true);
    await vi.advanceTimersByTimeAsync(CANVAS_PERSISTENCE_RETRY_DELAYS_MS[1]);
    expect(retry).toHaveBeenCalledTimes(2);

    expect(scheduler.schedule('project-a')).toBe(true);
    await vi.advanceTimersByTimeAsync(CANVAS_PERSISTENCE_RETRY_DELAYS_MS[2]);
    expect(retry).toHaveBeenCalledTimes(3);
    expect(scheduler.schedule('project-a')).toBe(false);
    vi.useRealTimers();
  });

  it('resets a successful project without affecting another project', () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const scheduler = new CanvasPersistenceRetryScheduler(retry);

    scheduler.schedule('project-a');
    scheduler.schedule('project-b');
    scheduler.reset('project-a');

    expect(scheduler.pending('project-a')).toBe(false);
    expect(scheduler.attemptCount('project-a')).toBe(0);
    expect(scheduler.pending('project-b')).toBe(true);
    expect(scheduler.attemptCount('project-b')).toBe(1);
    vi.useRealTimers();
  });
});
