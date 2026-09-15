import assert from 'node:assert/strict';
import test from 'node:test';
import { localPersistedMediaPathname } from './local-persisted-media-url.mjs';

const localHosts = new Set(['127.0.0.1', 'localhost', '192.168.1.8']);

test('canonicalizes current, stale-port and development-proxy media URLs', () => {
  assert.equal(
    localPersistedMediaPathname(
      'http://127.0.0.1:2896/asset-library/files/asset_123456',
      localHosts,
    ),
    '/asset-library/files/asset_123456',
  );
  assert.equal(
    localPersistedMediaPathname(
      'http://127.0.0.1:2895/__qiansi_bridge/asset-library/files/asset_123456?preview=image&w=768',
      localHosts,
    ),
    '/asset-library/files/asset_123456',
  );
  assert.equal(
    localPersistedMediaPathname(
      'http://192.168.1.8:2895/__qiansi_bridge/output/generated-image.png',
      localHosts,
    ),
    '/output/generated-image.png',
  );
});

test('rejects external hosts, arbitrary local paths and preview names outside the contract', () => {
  assert.equal(
    localPersistedMediaPathname(
      'https://example.test/asset-library/files/asset_123456',
      localHosts,
    ),
    '',
  );
  assert.equal(localPersistedMediaPathname('http://127.0.0.1:2895/api/settings', localHosts), '');
  assert.equal(
    localPersistedMediaPathname('http://127.0.0.1:2895/media-preview/files/short.webp', localHosts),
    '',
  );
});
