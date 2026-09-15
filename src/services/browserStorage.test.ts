import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserStorage, saveBrowserStorage } from './browserStorage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser storage Bridge client', () => {
  it('loads the host snapshot without browser caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          storage: { version: 1, revision: 2, records: [], updatedAt: 10 },
          writable: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBrowserStorage('http://127.0.0.1:2895')).resolves.toMatchObject({
      storage: { revision: 2 },
      writable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/settings/browser-storage',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('sends bounded changes with the expected revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          storage: {
            version: 1,
            revision: 3,
            records: [{ key: 'qiansi-canvas-themes-v1', value: '{}', updatedAt: 11 }],
            updatedAt: 11,
          },
          writable: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await saveBrowserStorage(
      [{ key: 'qiansi-canvas-themes-v1', value: '{}' }],
      2,
      'http://127.0.0.1:2895',
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      changes: [{ key: 'qiansi-canvas-themes-v1', value: '{}' }],
      expectedRevision: 2,
    });
  });

  it('returns the current snapshot with a revision conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            storage: { version: 1, revision: 5, records: [], updatedAt: 20 },
            error: { message: 'conflict' },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(saveBrowserStorage([], 4, 'http://127.0.0.1:2895')).rejects.toMatchObject({
      name: 'BrowserStorageConflictError',
      storage: { revision: 5 },
    });
  });
});
