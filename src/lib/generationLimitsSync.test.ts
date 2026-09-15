import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATION_LIMITS } from './generationLimitsContract.mjs';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const response = (revision: number, overrides = {}) =>
  new Response(
    JSON.stringify({
      limits: {
        version: 1,
        revision,
        ...DEFAULT_GENERATION_LIMITS,
        ...overrides,
        updatedAt: revision ? 100 : 0,
      },
      writable: true,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => vi.unstubAllGlobals());

describe('generation limits startup sync', () => {
  it('migrates an existing browser-only configuration into the first host snapshot', async () => {
    localStorage.setItem(
      'qiansi-canvas-preferences-v1',
      JSON.stringify({ imageBatchSize: 32, generationConcurrency: 7 }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(0))
      .mockResolvedValueOnce(response(1, { imageBatchSize: 32, generationConcurrency: 7 }));
    vi.stubGlobal('fetch', fetchMock);
    const { startGenerationLimitsSync } = await import('./generationLimitsSync');
    const { readGenerationLimitPreferences } = await import('../store/canvasPreferences');

    await startGenerationLimitsSync();

    expect(readGenerationLimitPreferences()).toMatchObject({
      imageBatchSize: 32,
      generationConcurrency: 7,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/settings/generation-limits'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('applies a revisioned host configuration to the browser fallback', async () => {
    localStorage.setItem('qiansi-canvas-preferences-v1', JSON.stringify({ imageBatchSize: 12 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(2, { imageBatchSize: 28 })));
    const { startGenerationLimitsSync } = await import('./generationLimitsSync');
    const { readGenerationLimitPreferences } = await import('../store/canvasPreferences');

    await startGenerationLimitsSync();

    expect(readGenerationLimitPreferences().imageBatchSize).toBe(28);
  });

  it('keeps the browser fallback while Bridge is unavailable', async () => {
    localStorage.setItem(
      'qiansi-canvas-preferences-v1',
      JSON.stringify({ videoGenerationConcurrency: 3 }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { startGenerationLimitsSync } = await import('./generationLimitsSync');
    const { readGenerationLimitPreferences } = await import('../store/canvasPreferences');

    await startGenerationLimitsSync();

    expect(readGenerationLimitPreferences().videoGenerationConcurrency).toBe(3);
  });
});
