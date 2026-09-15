import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkSystemUpdate,
  downloadSystemUpdate,
  loadSystemUpdateStatus,
  prepareSystemRollback,
  summarizeSystemUpdateConnectivity,
  testSystemUpdateNetwork,
} from './systemUpdate';

afterEach(() => vi.unstubAllGlobals());

describe('system update bridge service', () => {
  it('loads real update configuration status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              currentVersion: '0.0.0',
              sourceConfigPath: 'data/update-sources.json',
              downloadDirectory: 'data/updates',
              sources: [],
              mode: 'download-only',
            }),
            { status: 200 },
          ),
      ),
    );
    expect((await loadSystemUpdateStatus('http://127.0.0.1:2895')).mode).toBe('download-only');
  });

  it('sends the selected mirror when checking, downloading, and preparing rollback', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ sources: [], latest: null }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await checkSystemUpdate('github', 'http://127.0.0.1:2895');
    await testSystemUpdateNetwork('auto', 'http://127.0.0.1:2895');
    await downloadSystemUpdate('modelscope', 'http://127.0.0.1:2895');
    await prepareSystemRollback('github', 'http://127.0.0.1:2895');
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ sourceId: 'github' });
    expect(String(calls[1]?.[0])).toContain('/system-update/connectivity');
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ sourceId: 'auto' });
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({ sourceId: 'modelscope' });
    expect(String(calls[3]?.[0])).toContain('/system-update/rollback');
    expect(JSON.parse(String(calls[3]?.[1]?.body))).toEqual({ sourceId: 'github' });
  });

  it('surfaces bridge update errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: '更新源尚未配置。' } }), { status: 400 }),
      ),
    );
    await expect(checkSystemUpdate('github')).rejects.toThrow('更新源尚未配置');
  });

  it('summarizes configured update-source connectivity', () => {
    expect(
      summarizeSystemUpdateConnectivity({
        currentVersion: '0.0.0',
        sourceChoice: 'auto',
        latest: null,
        sources: [
          { id: 'github', name: 'GitHub', configured: true, status: 'ready' },
          { id: 'modelscope', name: 'ModelScope', configured: true, status: 'error' },
          { id: 'mirror', name: 'Mirror', configured: false, status: 'unconfigured' },
        ],
      }),
    ).toEqual({ configured: 2, reachable: 1, failed: 1 });
  });
});
