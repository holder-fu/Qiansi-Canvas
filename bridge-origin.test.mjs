import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBridgeOriginPolicy,
  isLoopbackCanvasOrigin,
  isSameHostLoopbackCanvasOrigin,
  isSameHostPrivateCanvasOrigin,
  withMachineCanvasOrigins,
} from './bridge-origin.mjs';

test('accepts Qiansi-Canvas from loopback hosts on development ports', () => {
  for (const origin of [
    'http://127.0.0.1:2895',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://[::1]:5173',
  ]) {
    assert.equal(isLoopbackCanvasOrigin(origin), true, origin);
  }
});

test('keeps external websites and opaque origins blocked', () => {
  const policy = createBridgeOriginPolicy();
  assert.equal(policy.allows('https://example.com', 'POST'), false);
  assert.equal(policy.allows('null', 'POST'), false);
  assert.equal(policy.allows('', 'POST'), false);
  assert.equal(policy.allows('', 'GET'), false);
});

test('loopback origins require the exact request Host or an explicit development allowlist', () => {
  const policy = createBridgeOriginPolicy('http://127.0.0.1:2895');
  assert.equal(policy.allows('http://127.0.0.1:2896', 'POST', '127.0.0.1:2896'), true);
  assert.equal(policy.allows('http://127.0.0.1:2895', 'POST', '127.0.0.1:2896'), true);
  assert.equal(policy.allows('http://127.0.0.1:5173', 'POST', '127.0.0.1:2896'), false);
  assert.equal(policy.allows('http://localhost:5173', 'POST', '127.0.0.1:2896'), false);
  assert.equal(isSameHostLoopbackCanvasOrigin('http://127.0.0.1:5173', '127.0.0.1:2896'), false);
});

test('supports an explicit private-network origin without accepting its whole subnet', () => {
  const policy = createBridgeOriginPolicy('http://192.168.1.20:5173');
  assert.equal(policy.allows('http://192.168.1.20:5173', 'POST'), true);
  assert.equal(policy.allows('http://192.168.1.21:5173', 'POST'), false);
});

test('accepts a private-network canvas only when Origin exactly matches the request Host', () => {
  const policy = createBridgeOriginPolicy();
  for (const origin of [
    'http://192.168.50.51:2895',
    'http://10.0.0.8:2895',
    'http://172.20.1.4:2895',
    'http://[fd00::51]:2895',
  ]) {
    assert.equal(policy.allows(origin, 'POST', new URL(origin).host), true, origin);
  }
});

test('rejects mismatched private hosts, ports and public or DNS-rebinding origins', () => {
  const policy = createBridgeOriginPolicy();
  assert.equal(policy.allows('http://192.168.50.51:2895', 'POST', '192.168.50.52:2895'), false);
  assert.equal(policy.allows('http://192.168.50.51:5173', 'POST', '192.168.50.51:2895'), false);
  assert.equal(policy.allows('http://203.0.113.10:2895', 'POST', '203.0.113.10:2895'), false);
  assert.equal(policy.allows('http://evil.example:2895', 'POST', 'evil.example:2895'), false);
  assert.equal(isSameHostPrivateCanvasOrigin('http://192.168.50.51:2895', 'bad host'), false);
});

test('allows only the exact local machine names added by the bridge process', () => {
  const configured = withMachineCanvasOrigins('https://canvas.example.test', 'studio-host', 2895);
  const policy = createBridgeOriginPolicy(configured);

  assert.equal(policy.allows('http://studio-host:2895', 'GET'), true);
  assert.equal(policy.allows('http://studio-host.local:2895', 'GET'), true);
  assert.equal(policy.allows('https://canvas.example.test', 'GET'), true);
  assert.equal(policy.allows('http://other-machine:2895', 'GET'), false);
  assert.equal(policy.allows('http://studio-host:2896', 'GET'), false);
});

test('does not turn malformed machine names into allowed origins', () => {
  const configured = withMachineCanvasOrigins('', 'host/path', 2895);
  assert.equal(createBridgeOriginPolicy(configured).allows('http://host:2895', 'GET'), false);
});
