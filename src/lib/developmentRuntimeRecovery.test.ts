import { describe, expect, it, vi } from 'vitest';
import {
  attemptDevelopmentRuntimeRecovery,
  clearDevelopmentRecoveryAttempt,
  isStaleBuildAssetError,
} from './developmentRuntimeRecovery';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('development runtime recovery', () => {
  it('recognizes stale production build chunks without treating ordinary render errors as assets', () => {
    expect(
      isStaleBuildAssetError(
        new TypeError(
          'Failed to fetch dynamically imported module: http://127.0.0.1:2895/assets/AssetPanel-BmesDClR.js',
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildAssetError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('waits for Bridge, flushes the canvas and reloads once', async () => {
    const session = storage();
    const probeBridge = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const flushCanvas = vi.fn().mockResolvedValue(true);
    const reload = vi.fn();

    await expect(
      attemptDevelopmentRuntimeRecovery({
        enabled: true,
        storage: session,
        probeBridge,
        flushCanvas,
        reload,
        now: () => 10_000,
        delay: async () => {},
      }),
    ).resolves.toBe('reloading');

    expect(probeBridge).toHaveBeenCalledTimes(2);
    expect(flushCanvas).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps the recovery screen visible when Bridge does not return', async () => {
    const flushCanvas = vi.fn().mockResolvedValue(true);
    const reload = vi.fn();

    await expect(
      attemptDevelopmentRuntimeRecovery({
        enabled: true,
        storage: storage(),
        probeBridge: async () => false,
        flushCanvas,
        reload,
        delay: async () => {},
        healthAttempts: 2,
      }),
    ).resolves.toBe('bridge-unavailable');

    expect(flushCanvas).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when the current canvas cannot be flushed', async () => {
    const reload = vi.fn();

    await expect(
      attemptDevelopmentRuntimeRecovery({
        enabled: true,
        storage: storage(),
        probeBridge: async () => true,
        flushCanvas: async () => false,
        reload,
      }),
    ).resolves.toBe('save-blocked');

    expect(reload).not.toHaveBeenCalled();
  });

  it('blocks an automatic reload loop until a stable session clears the attempt', async () => {
    const session = storage();
    const common = {
      enabled: true,
      storage: session,
      probeBridge: async () => true,
      flushCanvas: async () => true,
      reload: vi.fn(),
      now: () => 20_000,
    };

    await expect(attemptDevelopmentRuntimeRecovery(common)).resolves.toBe('reloading');
    await expect(attemptDevelopmentRuntimeRecovery(common)).resolves.toBe('throttled');

    clearDevelopmentRecoveryAttempt(session);
    await expect(attemptDevelopmentRuntimeRecovery(common)).resolves.toBe('reloading');
  });
});
