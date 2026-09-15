export type CancelScheduledStartupTask = () => void;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: {
      timeout?: number;
    },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Run non-critical work only after the browser has had an opportunity to
 * commit the initial canvas frame. The timeout keeps startup services from
 * waiting forever in a continuously busy tab.
 */
export function scheduleAfterFirstPaint(
  task: () => void,
  timeout = 1_500,
): CancelScheduledStartupTask {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let firstFrame = 0;
  let secondFrame = 0;
  let cancelIdle: CancelScheduledStartupTask = () => {};

  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      cancelIdle = scheduleWhenIdle(task, timeout);
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
    cancelIdle();
  };
}

/** Schedule one follow-up startup stage without competing with user input. */
export function scheduleWhenIdle(task: () => void, timeout = 3_000): CancelScheduledStartupTask {
  if (typeof window === 'undefined') return () => {};

  const idleWindow = window as IdleWindow;
  let cancelled = false;
  const run = () => {
    if (!cancelled) task();
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(run, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(handle);
  };
}
