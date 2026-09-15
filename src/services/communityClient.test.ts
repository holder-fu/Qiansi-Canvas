import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCommunityStatus, probeCommunityConnection } from './communityClient';

afterEach(() => vi.unstubAllGlobals());

describe('community client bridge service', () => {
  it('loads local bridge status without contacting the remote server in the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configured: false, serverUrl: null, managedBy: 'none' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadCommunityStatus()).resolves.toEqual({
      configured: false,
      serverUrl: null,
      managedBy: 'none',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:2895/community/status',
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('sends connection probes through the local bridge without accepting a user URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ serverUrl: 'https://admin.example.com', connectivity: {} }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await probeCommunityConnection();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:2895/community/connectivity',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('surfaces bridge validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: '只允许 HTTPS' } }), { status: 400 }),
        ),
    );
    await expect(probeCommunityConnection()).rejects.toThrow('只允许 HTTPS');
  });
});
