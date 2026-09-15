import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BRIDGE_ACCESS_COOKIE,
  BridgeRequestGate,
  DEFAULT_BRIDGE_HOST,
  bridgeSecurityHeaders,
  createBridgeAccessToken,
  inspectDirectorModelUpload,
  inspectDeclaredMediaSignature,
  isLanCollaborationRequest,
  isLoopbackAddress,
  managedAssetIdFromSource,
  normalizeBridgeAccessToken,
  normalizePersistedLightX2VConfig,
  requestBridgeAccessToken,
} from './bridge-security.mjs';

test('defaults the bridge to loopback and recognizes mapped loopback peers', () => {
  assert.equal(DEFAULT_BRIDGE_HOST, '127.0.0.1');
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.8'), false);
});

test('creates and validates at least 256-bit LAN access tokens', () => {
  const token = createBridgeAccessToken();
  assert.ok(Buffer.from(token, 'base64url').length >= 32);
  assert.equal(normalizeBridgeAccessToken(token), token);
  assert.throws(() => normalizeBridgeAccessToken('weak-token'), /256/);
});

test('accepts bearer, explicit-header, and HttpOnly-cookie token transports', () => {
  assert.equal(
    requestBridgeAccessToken({ headers: { authorization: 'Bearer bearer-token' } }),
    'bearer-token',
  );
  assert.equal(
    requestBridgeAccessToken({ headers: { 'x-qiansi-canvas-access-token': 'header-token' } }),
    'header-token',
  );
  assert.equal(
    requestBridgeAccessToken({
      headers: { cookie: `theme=dark; ${BRIDGE_ACCESS_COOKIE}=cookie-token` },
    }),
    'cookie-token',
  );
});

test('LAN capability allowlist exposes only collaboration and managed media', () => {
  assert.equal(isLanCollaborationRequest('/health', 'GET'), true);
  assert.equal(isLanCollaborationRequest('/settings/profile', 'GET'), true);
  assert.equal(isLanCollaborationRequest('/settings/profile', 'PATCH'), false);
  assert.equal(isLanCollaborationRequest('/projects', 'GET'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1', 'PUT'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1', 'PATCH'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1', 'DELETE'), false);
  assert.equal(isLanCollaborationRequest('/projects/project_1/duplicate', 'POST'), true);
  assert.equal(isLanCollaborationRequest('/project-folders', 'POST'), true);
  assert.equal(isLanCollaborationRequest('/project-folders/folder_1', 'PATCH'), true);
  assert.equal(isLanCollaborationRequest('/project-folders/folder_1', 'DELETE'), false);
  assert.equal(isLanCollaborationRequest('/projects/project_1/workspaces/views', 'GET'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1/workspaces/audio', 'PUT'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1/trash', 'PUT'), true);
  assert.equal(isLanCollaborationRequest('/projects/project_1/workspaces/arbitrary', 'PUT'), false);
  assert.equal(isLanCollaborationRequest('/asset-library/upload', 'POST'), true);
  assert.equal(isLanCollaborationRequest('/asset-library/files/asset_123456', 'GET'), true);
  assert.equal(isLanCollaborationRequest('/asset-library/references', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/api/generate-image', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/cli/status', 'GET'), false);
  assert.equal(isLanCollaborationRequest('/api/chat', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/v1/chat/completions', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/plugins', 'GET'), false);
  assert.equal(isLanCollaborationRequest('/plugins/project-documents/read', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/plugins/project-documents/write', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/system-update/download', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/system-update/rollback', 'POST'), false);
  assert.equal(isLanCollaborationRequest('/storage-cleanup/scan', 'POST'), false);
});

test('security headers prevent sniffing, embedding, and referrer token leaks', () => {
  const html = bridgeSecurityHeaders({ mime: 'text/html; charset=utf-8' });
  assert.equal(html['X-Content-Type-Options'], 'nosniff');
  assert.equal(html['X-Frame-Options'], 'DENY');
  assert.equal(html['Referrer-Policy'], 'no-referrer');
  assert.match(html['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(
    bridgeSecurityHeaders({ mime: 'image/svg+xml', svg: true })['Content-Security-Policy'],
    /sandbox/,
  );
});

test('timeline source contract maps only current-bridge managed asset IDs', () => {
  const options = { allowedHosts: ['127.0.0.1', '192.168.1.8'], port: 2895 };
  assert.equal(
    managedAssetIdFromSource('http://192.168.1.8:2895/asset-library/files/asset_123456', options),
    'asset_123456',
  );
  assert.equal(
    managedAssetIdFromSource('/asset-library/files/asset_abcdef', options),
    'asset_abcdef',
  );
  assert.equal(
    managedAssetIdFromSource('https://cdn.example.test/asset-library/files/asset_123456', options),
    '',
  );
  assert.equal(managedAssetIdFromSource('http://127.0.0.1:8188/private', options), '');
});

test('LightX2V persisted settings keep only bounded contract keys', () => {
  const config = normalizePersistedLightX2VConfig({
    executablePath: 'C:\\Python\\python.exe',
    workingDirectory: 'C:\\LightX2V',
    unexpected: 'ignored',
  });
  assert.equal(config.executablePath, 'C:\\Python\\python.exe');
  assert.equal(config.workingDirectory, 'C:\\LightX2V');
  assert.equal(Object.hasOwn(config, 'unexpected'), false);
});

test('declared image and video types require matching file signatures and bounded dimensions', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(1920, 16);
  png.writeUInt32BE(1080, 20);
  assert.deepEqual(inspectDeclaredMediaSignature(png, 'image/png'), {
    valid: true,
    width: 1920,
    height: 1080,
  });
  assert.throws(() => inspectDeclaredMediaSignature(Buffer.from('not png'), 'image/png'), /签名/);
  const mp4 = Buffer.alloc(16);
  mp4.write('ftyp', 4, 'ascii');
  assert.equal(inspectDeclaredMediaSignature(mp4, 'video/mp4').valid, true);
});

test('director model uploads allow only signature-verified model formats', () => {
  const glb = Buffer.alloc(20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  assert.deepEqual(
    inspectDirectorModelUpload({
      declaredMime: 'model/gltf-binary',
      value: glb,
      originalName: 'character.glb',
      totalSize: glb.length,
    }),
    { extension: '.glb', kind: 'director-model', mime: 'model/gltf-binary' },
  );
  assert.equal(
    inspectDirectorModelUpload({
      declaredMime: 'application/octet-stream',
      value: Buffer.from('Kaydara FBX Binary  \u0000\u001a\u0000payload', 'binary'),
      originalName: 'character.fbx',
    }).extension,
    '.fbx',
  );
  assert.throws(
    () =>
      inspectDirectorModelUpload({
        declaredMime: 'application/octet-stream',
        value: Buffer.from('arbitrary binary'),
        originalName: 'malware.bin',
      }),
    /仅支持/,
  );
  assert.throws(
    () =>
      inspectDirectorModelUpload({
        declaredMime: 'model/gltf-binary',
        value: Buffer.from('not glb'),
        originalName: 'fake.glb',
        totalSize: 7,
      }),
    /有效/,
  );
});

test('request gate bounds high-cost concurrency and per-client request rate', () => {
  const gate = new BridgeRequestGate({ maxRequests: 2, windowMs: 1_000 });
  const first = gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-image', now: 0 });
  const second = gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-video', now: 1 });
  const third = gate.acquire({ address: '127.0.0.1', pathname: '/health', now: 2 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(third, { ok: false, reason: 'rate' });
  first.release();
  second.release();
});

test('request gate permits 3000 ordinary requests per client in the default window', () => {
  const gate = new BridgeRequestGate();
  for (let index = 0; index < 3_000; index += 1) {
    assert.equal(gate.acquire({ address: '127.0.0.1', pathname: '/health', now: index }).ok, true);
  }
  assert.deepEqual(gate.acquire({ address: '127.0.0.1', pathname: '/health', now: 3_000 }), {
    ok: false,
    reason: 'rate',
  });
});

test('request gate admits five concurrent generations and reopens a released slot', () => {
  const gate = new BridgeRequestGate({ maxRequests: 100 });
  const leases = Array.from({ length: 5 }, (_, index) =>
    gate.acquire({
      address: '127.0.0.1',
      pathname: '/api/generate-video',
      now: index,
    }),
  );
  assert.equal(
    leases.every((lease) => lease.ok),
    true,
  );
  assert.deepEqual(
    gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-video', now: 5 }),
    { ok: false, reason: 'concurrency' },
  );

  leases[0].release();
  const replacement = gate.acquire({
    address: '127.0.0.1',
    pathname: '/api/generate-image',
    now: 6,
  });
  assert.equal(replacement.ok, true);

  replacement.release();
  for (const lease of leases.slice(1)) lease.release();
});

test('request gate keeps upload and update capacity available beside five generations', () => {
  const gate = new BridgeRequestGate({ maxRequests: 100 });
  const leases = [
    ...Array.from({ length: 5 }, (_, index) =>
      gate.acquire({
        address: '127.0.0.1',
        pathname: '/api/generate-video',
        now: index,
      }),
    ),
    gate.acquire({ address: '127.0.0.1', pathname: '/asset-library/upload', now: 5 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/media-preview/upload', now: 6 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/system-update/check', now: 7 }),
  ];

  assert.equal(
    leases.every((lease) => lease.ok),
    true,
  );
  for (const lease of leases) lease.release();
});

test('request gate applies bounded runtime concurrency settings without cancelling active work', () => {
  const gate = new BridgeRequestGate();
  const configured = gate.configure({
    requestRateLimit: 1_200,
    generationConcurrency: 2,
    uploadConcurrency: 1,
    updateConcurrency: 2,
    imageBatchSize: 25,
    imageGenerationConcurrency: 4,
    videoGenerationConcurrency: 3,
  });
  assert.equal(configured.requestRateLimit, 1_200);

  const leases = [
    gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-image', now: 0 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-video', now: 1 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/asset-library/upload', now: 2 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/system-update/check', now: 3 }),
    gate.acquire({ address: '127.0.0.1', pathname: '/system-update/download', now: 4 }),
  ];
  assert.equal(
    leases.every((lease) => lease.ok),
    true,
  );
  assert.deepEqual(
    gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-image', now: 5 }),
    { ok: false, reason: 'concurrency' },
  );

  gate.configure({
    ...configured,
    generationConcurrency: 1,
    uploadConcurrency: 1,
    updateConcurrency: 1,
  });
  leases[0].release();
  assert.deepEqual(
    gate.acquire({ address: '127.0.0.1', pathname: '/api/generate-image', now: 6 }),
    { ok: false, reason: 'concurrency' },
  );
  for (const lease of leases.slice(1)) lease.release();
});

test('local bridge source no longer executes LightX2V GET parameters or remote install scripts', async () => {
  const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /lightX2VConfigFromSearch/);
  assert.doesNotMatch(source, /curl\s+-fsSL[^\n]+\|\s*bash/);
  assert.match(source, /lightX2VConfig\s*=\s*normalizePersistedLightX2VConfig/);
  assert.match(source, /request\.method === 'PUT' && url\.pathname === '\/lightx2v\/config'/);
  assert.match(source, /url\.searchParams\.get\('session'\) === '1'/);
  assert.match(source, /scope: request\.qiansiBridgeScope/);
  assert.match(source, /collaborationEnabled: LAN_MODE/);
});
