import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATION_LIMITS } from '../lib/generationLimitsContract.mjs';
import { loadGenerationLimits, saveGenerationLimits } from './generationLimits';

const snapshot = {
  limits: {
    version: 1 as const,
    revision: 2,
    ...DEFAULT_GENERATION_LIMITS,
    imageBatchSize: 30,
    updatedAt: 123,
  },
  writable: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('Bridge generation limits client', () => {
  it('loads the host-level settings without browser caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGenerationLimits('http://127.0.0.1:2895')).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:2895/settings/generation-limits', {
      cache: 'no-store',
      credentials: 'include',
    });
  });

  it('saves normalized limits with revision protection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await saveGenerationLimits(
      { ...DEFAULT_GENERATION_LIMITS, imageBatchSize: 80 },
      1,
      'http://127.0.0.1:2895',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/settings/generation-limits'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          limits: { ...DEFAULT_GENERATION_LIMITS, imageBatchSize: 50 },
          expectedRevision: 1,
        }),
      }),
    );
  });

  it('rejects malformed Bridge settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ limits: { revision: '2' }, writable: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(loadGenerationLimits()).rejects.toThrow('Bridge 返回的请求与批量生成设置无效');
  });
});
