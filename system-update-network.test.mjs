import test from 'node:test';
import assert from 'node:assert/strict';
import { probeUpdateSourceConnectivity } from './system-update-network.mjs';

const source = {
  id: 'github',
  name: 'GitHub',
  homepageUrl: 'https://github.com/holder-fu/Qiansi-Canvas',
  manifestUrl: 'https://raw.githubusercontent.com/holder-fu/Qiansi-Canvas/main/update.json',
  enabled: true,
};

test('treats an HTTP 404 response as reachable network with an unavailable manifest', async () => {
  let tick = 100;
  const result = await probeUpdateSourceConnectivity(source, {
    fetchImpl: async () => new Response(null, { status: 404 }),
    now: () => (tick += 25),
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.networkReachable, true);
  assert.equal(result.manifestAvailable, false);
  assert.equal(result.httpStatus, 404);
  assert.match(result.message, /清单暂不可用/);
});

test('reports a successful manifest response as fully reachable', async () => {
  const result = await probeUpdateSourceConnectivity(source, {
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.manifestAvailable, true);
  assert.equal(result.httpStatus, 200);
});

test('keeps transport failures distinct from HTTP responses', async () => {
  const result = await probeUpdateSourceConnectivity(source, {
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(result.status, 'error');
  assert.equal(result.networkReachable, false);
  assert.match(result.message, /网络连接失败/);
});
