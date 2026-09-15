import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUserProfile, saveUserProfile } from './userProfile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Bridge user profile client', () => {
  it('loads the shared profile without browser caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: { version: 1, revision: 2, userName: 'holder', updatedAt: 123 },
          writable: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadUserProfile('http://127.0.0.1:2895')).resolves.toEqual({
      profile: { version: 1, revision: 2, userName: 'holder', updatedAt: 123 },
      writable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:2895/settings/profile', {
      cache: 'no-store',
      credentials: 'include',
    });
  });

  it('saves with revision protection and exposes conflicts', async () => {
    const current = { version: 1, revision: 3, userName: 'newer', updatedAt: 456 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ profile: current, error: { message: 'conflict' } }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveUserProfile('holder', 2)).rejects.toMatchObject({
      name: 'UserProfileConflictError',
      profile: current,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/settings/profile'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ userName: 'holder', expectedRevision: 2 }),
      }),
    );
  });

  it('rejects malformed Bridge settings instead of poisoning the local cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ profile: { revision: '2' }, writable: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(loadUserProfile()).rejects.toThrow('Bridge 返回的资料作者设置无效');
  });
});
