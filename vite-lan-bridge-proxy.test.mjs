import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createBridgeAccessToken } from './bridge-security.mjs';
import {
  authorizeLanBridgeProxyRequest,
  isBridgeRuntimeDataRequest,
  normalizeLanBridgePairingProxyResponse,
  normalizeLanBridgeProxyRequest,
  rewriteLanBridgeProxyPath,
} from './vite-lan-bridge-proxy.mjs';

const prefix = '/__qiansi_bridge';
const accessToken = createBridgeAccessToken();

function authorize(path, options = {}) {
  return authorizeLanBridgeProxyRequest({
    url: `${prefix}${path}`,
    method: options.method || 'GET',
    headers: options.headers || {},
    remoteAddress: options.remoteAddress || '192.168.1.80',
    prefix,
    accessToken,
    trustedLan: options.trustedLan || false,
  });
}

function authorizeRaw(url, options = {}) {
  return authorizeLanBridgeProxyRequest({
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
    remoteAddress: options.remoteAddress || '192.168.1.80',
    prefix,
    accessToken,
    trustedLan: options.trustedLan || false,
  });
}

test('LAN Vite proxy permits one-click pairing before the cookie exists', () => {
  assert.deepEqual(authorize(`/?qiansi_pair=${accessToken}`), { ok: true });
  assert.equal(authorize('/?qiansi_pair=invalid').status, 401);
});

test('LAN Vite proxy requires the pairing cookie and limits remote capabilities', () => {
  assert.equal(authorize('/projects/main-canvas').status, 401);
  const headers = {
    cookie: `qiansi_canvas_access=${accessToken}`,
    host: '192.168.1.80:2895',
  };
  assert.deepEqual(authorize('/projects/main-canvas', { headers }), { ok: true });
  assert.deepEqual(authorize('/asset-library/files/asset_123456', { headers }), { ok: true });
  assert.equal(authorize('/api/generate-image', { method: 'POST', headers }).status, 403);
  assert.equal(authorize('/plugins', { headers }).status, 403);
  assert.equal(
    authorize('/projects/main-canvas/restore-latest', {
      method: 'POST',
      headers: { ...headers, origin: 'http://192.168.1.80:3000' },
    }).status,
    403,
  );
  assert.deepEqual(
    authorize('/projects/main-canvas/workspaces/views', {
      method: 'PUT',
      headers: { ...headers, origin: 'http://192.168.1.80:2895' },
    }),
    { ok: true },
  );
});

test('trusted LAN Vite proxy accepts direct canvas collaboration without a pairing cookie', () => {
  assert.deepEqual(authorize('/projects/main-canvas', { trustedLan: true }), { ok: true });
  assert.deepEqual(
    authorize('/projects/main-canvas/workspaces/views', {
      method: 'PUT',
      trustedLan: true,
    }),
    { ok: true },
  );
  assert.equal(
    authorize('/projects/main-canvas', {
      trustedLan: true,
      headers: { origin: 'http://malicious.example.test' },
    }).status,
    403,
  );
  assert.equal(
    authorize('/projects/main-canvas/workspaces/views', {
      method: 'PUT',
      trustedLan: true,
      headers: { 'sec-fetch-site': 'cross-site' },
    }).status,
    403,
  );
  assert.equal(authorize('/api/generate-image', { method: 'POST', trustedLan: true }).status, 403);
  assert.equal(authorize('/plugins', { trustedLan: true }).status, 403);
});

test('Vite runtime data guard blocks direct and /@fs access without blocking source data modules', () => {
  const projectRoot = resolve('F:/qiansi-canvas');
  const dataRoot = resolve(projectRoot, 'data');
  const customDataRoot = resolve(projectRoot, 'runtime-store');
  assert.equal(
    isBridgeRuntimeDataRequest('/data/runtime/lan-pairing.json', dataRoot, projectRoot),
    true,
  );
  assert.equal(
    isBridgeRuntimeDataRequest('/DATA/projects/main-canvas/project.json', dataRoot, projectRoot),
    true,
  );
  assert.equal(
    isBridgeRuntimeDataRequest(
      `/@fs/${dataRoot.replaceAll('\\', '/')}/runtime/lan-pairing.json`,
      dataRoot,
      projectRoot,
    ),
    true,
  );
  assert.equal(
    isBridgeRuntimeDataRequest(
      '/runtime-store/projects/main-canvas/project.json',
      customDataRoot,
      projectRoot,
    ),
    true,
  );
  assert.equal(
    isBridgeRuntimeDataRequest('/src/data/promptLibrary.ts', dataRoot, projectRoot),
    false,
  );
  assert.equal(isBridgeRuntimeDataRequest('/src/main.tsx', dataRoot, projectRoot), false);
});

test('LAN Vite proxy rejects prefix collisions and normalized traversal before proxying', () => {
  assert.equal(
    authorizeRaw('/__qiansi_bridgeapi/generate-image', { trustedLan: true }).status,
    404,
  );
  assert.equal(
    authorizeRaw('/__qiansi_bridge/../api/generate-image', { trustedLan: true }).status,
    404,
  );
  assert.equal(
    authorizeRaw('/__qiansi_bridge/%2e%2e/api/generate-image', { trustedLan: true }).status,
    404,
  );
  assert.equal(rewriteLanBridgeProxyPath('/__qiansi_bridge', prefix), '/');
  assert.equal(
    rewriteLanBridgeProxyPath('/__qiansi_bridge/projects?scope=main', prefix),
    '/projects?scope=main',
  );
  assert.throws(
    () => rewriteLanBridgeProxyPath('/__qiansi_bridgeapi/generate-image', prefix),
    /代理路径无效/u,
  );
});

test('loopback development pages retain full Bridge access through the proxy', () => {
  assert.deepEqual(
    authorize('/api/generate-image', {
      method: 'POST',
      remoteAddress: '::ffff:127.0.0.1',
    }),
    { ok: true },
  );
});

test('Vite normalizes the authorized second hop to the Bridge loopback origin', () => {
  const headers = new Map();
  normalizeLanBridgeProxyRequest(
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    'http://127.0.0.1:2896',
    '192.168.1.80',
  );
  assert.deepEqual(Object.fromEntries(headers), {
    host: '127.0.0.1:2896',
    origin: 'http://127.0.0.1:2896',
    referer: 'http://127.0.0.1:2896/',
    'sec-fetch-site': 'same-origin',
    'x-qiansi-canvas-proxy-scope': 'collaboration',
  });
});

test('Vite marks loopback proxy requests as host scope', () => {
  const headers = new Map();
  normalizeLanBridgeProxyRequest(
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    'http://127.0.0.1:2896',
    '::ffff:127.0.0.1',
  );
  assert.equal(headers.get('x-qiansi-canvas-proxy-scope'), 'host');
});

test('Vite keeps a paired browser on the public canvas origin', () => {
  const pairingResponse = {
    statusCode: 303,
    headers: { location: 'http://127.0.0.1:2895/' },
  };
  normalizeLanBridgePairingProxyResponse(
    pairingResponse,
    `/__qiansi_bridge/?qiansi_pair=${accessToken}`,
  );
  assert.equal(pairingResponse.headers.location, '/');

  const unrelatedResponse = {
    statusCode: 303,
    headers: { location: 'http://127.0.0.1:2895/other' },
  };
  normalizeLanBridgePairingProxyResponse(unrelatedResponse, '/__qiansi_bridge/other');
  assert.equal(unrelatedResponse.headers.location, 'http://127.0.0.1:2895/other');
});
