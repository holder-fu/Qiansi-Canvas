import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const profileResponse = (revision: number, userName: string, writable = true) =>
  new Response(
    JSON.stringify({
      profile: { version: 1, revision, userName, updatedAt: revision ? 100 : 0 },
      writable,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('configured user profile startup sync', () => {
  it('migrates an existing browser-only author into the first host profile', async () => {
    localStorage.setItem(
      'qiansi-canvas-preferences-v1',
      JSON.stringify({ userName: '  老树苗  ' }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(profileResponse(0, ''))
      .mockResolvedValueOnce(profileResponse(1, '老树苗'));
    vi.stubGlobal('fetch', fetchMock);
    const { startConfiguredUserNameSync } = await import('./userProfileSync');
    const { readCanvasPreferences } = await import('../store/canvasPreferences');

    await startConfiguredUserNameSync();

    expect(readCanvasPreferences().userName).toBe('老树苗');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/settings/profile'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ userName: '老树苗', expectedRevision: 0 }),
      }),
    );
  });

  it('treats a revisioned empty host name as authoritative', async () => {
    localStorage.setItem('qiansi-canvas-preferences-v1', JSON.stringify({ userName: '旧名字' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(profileResponse(2, '')));
    const { startConfiguredUserNameSync } = await import('./userProfileSync');
    const { readCanvasPreferences } = await import('../store/canvasPreferences');

    await startConfiguredUserNameSync();

    expect(readCanvasPreferences().userName).toBe('');
  });

  it('keeps the browser fallback when Bridge is temporarily unavailable', async () => {
    localStorage.setItem('qiansi-canvas-preferences-v1', JSON.stringify({ userName: '离线作者' }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { startConfiguredUserNameSync } = await import('./userProfileSync');
    const { readCanvasPreferences } = await import('../store/canvasPreferences');

    await startConfiguredUserNameSync();

    expect(readCanvasPreferences().userName).toBe('离线作者');
  });
});
