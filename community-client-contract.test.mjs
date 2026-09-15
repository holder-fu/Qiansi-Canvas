import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCommunityConnectivity,
  normalizeCommunityServerUrl,
  probeCommunityServer,
} from './community-client-contract.mjs';

test('community server URL requires an HTTPS origin except for loopback testing', () => {
  assert.equal(normalizeCommunityServerUrl('https://admin.example.com/'), 'https://admin.example.com');
  assert.equal(normalizeCommunityServerUrl('http://127.0.0.1:3790'), 'http://127.0.0.1:3790');
  for (const value of ['http://admin.example.com', 'https://user:pass@admin.example.com', 'https://admin.example.com/api', 'javascript:alert(1)']) {
    assert.throws(() => normalizeCommunityServerUrl(value), Error, value);
  }
});

test('community connectivity rejects lookalike services and exposes only supported capabilities', () => {
  assert.throws(() => normalizeCommunityConnectivity({ service: 'other', apiVersion: 1 }), /不是兼容/);
  assert.deepEqual(normalizeCommunityConnectivity({
    service: 'holder-community', apiVersion: 1, serverVersion: '0.1.0',
    connection: { mode: 'native-service', dynamicLoopbackOrigins: true },
    authentication: { scheme: 'bearer', loginMode: 'browser-poll', providers: { google: true, wechat: false } },
    library: { kinds: ['style', 'effect', 'unsafe'], maxImageBytes: 8388608 },
  }), {
    service: 'holder-community', apiVersion: 1, serverVersion: '0.1.0',
    connection: { mode: 'native-service', dynamicLoopbackOrigins: true },
    authentication: { scheme: 'bearer', loginMode: 'browser-poll', providers: { google: true, wechat: false } },
    library: { kinds: ['style', 'effect'], maxImageBytes: 8388608 },
  });
});

test('community probe uses the fixed capability path and validates the response', async () => {
  let requested;
  const result = await probeCommunityServer('https://admin.example.com', async (url, init) => {
    requested = { url, init };
    return new Response(JSON.stringify({ data: {
      service: 'holder-community', apiVersion: 1,
      authentication: { scheme: 'bearer', loginMode: 'browser-poll', providers: {} },
      library: { kinds: ['prompt'], maxImageBytes: 100 },
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(requested.url, 'https://admin.example.com/api/client/connectivity');
  assert.equal(requested.init.redirect, 'error');
  assert.equal(result.connectivity.authentication.scheme, 'bearer');
});

test('community probe bounds chunked responses without trusting content-length', async () => {
  await assert.rejects(
    probeCommunityServer(
      'https://admin.example.com',
      async () => new Response(`{"padding":"${'x'.repeat(70 * 1024)}"}`, { status: 200 }),
    ),
    /响应过大/,
  );
});
