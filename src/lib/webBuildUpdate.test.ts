import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEntryFromHtml, checkWebBuildUpdate, useWebBuildUpdate } from './webBuildUpdate';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  useWebBuildUpdate.setState({ available: false });
});

describe('build identity', () => {
  it('offers an update only after a successful HTML check confirms a different entry', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:2895/' } });
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ outerHTML: '<script type="module" src="/assets/index-A.js">' }],
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response('<p>Login</p>', { headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValueOnce(
        new Response('<script type="module" src="/assets/index-B.js">', {
          headers: { 'content-type': 'text/html' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await checkWebBuildUpdate();
    expect(useWebBuildUpdate.getState().available).toBe(false);
    await checkWebBuildUpdate();
    expect(useWebBuildUpdate.getState().available).toBe(false);
    await checkWebBuildUpdate();
    expect(useWebBuildUpdate.getState().available).toBe(true);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ cache: 'no-store' });
  });
  it('recognizes module entries and distinguishes changed builds even at the same version', () => {
    const base = 'http://127.0.0.1:2895/';
    const first = buildEntryFromHtml(
      '<script type="module" crossorigin src="/assets/index-A.js"></script>',
      base,
    );
    const next = buildEntryFromHtml(
      '<script src="/assets/index-B.js" type="module"></script>',
      base,
    );
    expect(first).toBe(base + 'assets/index-A.js');
    expect(next).not.toBe(first);
  });
  it('rejects login/error HTML, development entries and remote scripts', () => {
    for (const html of [
      '<p>Offline</p>',
      '<script type="module" src="/src/main.tsx">',
      '<script type="module" src="https://external.test/assets/index-A.js">',
    ]) {
      expect(buildEntryFromHtml(html, 'http://127.0.0.1:2895/')).toBeNull();
    }
  });
});
