import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBridgeAccessToken } from './bridge-security.mjs';
import { isPrivateNetworkHost } from './bridge-origin.mjs';

function privateLanAddress() {
  return Object.values(networkInterfaces())
    .flatMap((items) => items || [])
    .find(
      (item) =>
        item &&
        !item.internal &&
        (item.family === 'IPv4' || item.family === 4) &&
        isPrivateNetworkHost(item.address),
    )?.address;
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForBridge(origin, pageOrigin, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Bridge 提前退出：${output()}`);
    try {
      const response = await fetch(`${origin}/health?session=1`, {
        headers: { Origin: pageOrigin },
      });
      if (response.ok) return;
    } catch {
      // Startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Bridge 启动超时：${output()}`);
}

async function stopBridge(child) {
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
}

test(
  'LAN pairing sets the host cookie and returns directly to the configured canvas port',
  { timeout: 30_000 },
  async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-pairing-'));
    const bridgePort = await availablePort();
    let canvasPort = await availablePort();
    while (canvasPort === bridgePort) canvasPort = await availablePort();
    const token = createBridgeAccessToken();
    const bridgeOrigin = `http://127.0.0.1:${bridgePort}`;
    const canvasOrigin = `http://127.0.0.1:${canvasPort}`;
    let output = '';
    const child = spawn(process.execPath, ['local-bridge.mjs'], {
      cwd: new URL('.', import.meta.url),
      env: {
        ...process.env,
        QIANSI_CANVAS_DATA_DIR: dataRoot,
        QIANSI_CANVAS_HOST: '0.0.0.0',
        QIANSI_CANVAS_BRIDGE_PORT: String(bridgePort),
        QIANSI_CANVAS_ALLOWED_ORIGINS: canvasOrigin,
        QIANSI_CANVAS_ACCESS_TOKEN: token,
        QIANSI_CANVAS_TRUSTED_LAN: '0',
        QIANSI_CANVAS_PAIR_RETURN_PORT: String(canvasPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    try {
      await waitForBridge(bridgeOrigin, canvasOrigin, child, () => output);
      const missingChunk = await fetch(`${bridgeOrigin}/assets/StyleLibraryModal-removed.js`);
      assert.equal(missingChunk.status, 404);
      assert.equal(missingChunk.headers.get('cache-control'), 'no-store');
      assert.match(missingChunk.headers.get('content-type'), /text\/plain/u);
      const pairingFileDeadline = Date.now() + 5_000;
      let pairingFile;
      while (Date.now() < pairingFileDeadline) {
        try {
          pairingFile = JSON.parse(
            await readFile(join(dataRoot, 'runtime', 'lan-pairing.json'), 'utf8'),
          );
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      assert.ok(pairingFile);
      assert.ok(pairingFile.urls.length > 0);
      assert.equal(pairingFile.mode, 'paired');
      assert.equal(pairingFile.port, canvasPort);
      assert.equal(pairingFile.bridgePort, bridgePort);
      assert.ok(
        pairingFile.urls.every((value) => {
          const url = new URL(value);
          return Number(url.port) === canvasPort && url.pathname === '/';
        }),
      );
      assert.ok(pairingFile.urls.every((url) => url.endsWith(token)));

      const invalidResponse = await fetch(
        `${bridgeOrigin}/?qiansi_pair=${createBridgeAccessToken()}`,
        { redirect: 'manual' },
      );
      assert.equal(invalidResponse.status, 403);
      assert.match(String(invalidResponse.headers.get('cache-control')), /no-store/u);
      assert.equal(invalidResponse.headers.get('pragma'), 'no-cache');
      assert.match(await invalidResponse.text(), /配对令牌无效/u);

      const response = await fetch(`${bridgeOrigin}/?qiansi_pair=${token}`, {
        redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${canvasOrigin}/`);
      const pairingCookie = String(response.headers.get('set-cookie') || '').split(';', 1)[0];
      assert.match(pairingCookie, /^qiansi_canvas_access=/u);
      assert.doesNotMatch(response.headers.get('location') || '', /qiansi_pair/u);

      const iosRequest = await fetch(`${bridgeOrigin}/projects`, {
        headers: { Cookie: pairingCookie },
      });
      assert.equal(iosRequest.status, 200);

      const unpairedOriginlessRequest = await fetch(`${bridgeOrigin}/projects`);
      assert.equal(unpairedOriginlessRequest.status, 403);

      const rejectedCrossOriginRequest = await fetch(`${bridgeOrigin}/projects`, {
        headers: {
          Cookie: pairingCookie,
          Origin: 'http://malicious.example.test',
        },
      });
      assert.equal(rejectedCrossOriginRequest.status, 403);

      const rejectedOriginlessMutation = await fetch(`${bridgeOrigin}/projects/main-canvas/trash`, {
        method: 'PUT',
        headers: {
          Cookie: pairingCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, trash: [] }),
      });
      assert.equal(rejectedOriginlessMutation.status, 403);
    } finally {
      await stopBridge(child);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);

test(
  'trusted LAN accepts direct collaboration without pairing and keeps host capabilities local',
  { timeout: 30_000 },
  async (context) => {
    const lanAddress = privateLanAddress();
    if (!lanAddress) {
      context.skip('当前测试主机没有可用的私有 IPv4 地址。');
      return;
    }
    const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-trusted-lan-'));
    const bridgePort = await availablePort();
    const loopbackOrigin = `http://127.0.0.1:${bridgePort}`;
    const lanOrigin = `http://${lanAddress}:${bridgePort}`;
    let output = '';
    const child = spawn(process.execPath, ['local-bridge.mjs'], {
      cwd: new URL('.', import.meta.url),
      env: {
        ...process.env,
        QIANSI_CANVAS_DATA_DIR: dataRoot,
        QIANSI_CANVAS_HOST: '0.0.0.0',
        QIANSI_CANVAS_BRIDGE_PORT: String(bridgePort),
        QIANSI_CANVAS_TRUSTED_LAN: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    try {
      await waitForBridge(loopbackOrigin, loopbackOrigin, child, () => output);
      const pairingFileDeadline = Date.now() + 5_000;
      let accessFile;
      while (Date.now() < pairingFileDeadline) {
        try {
          accessFile = JSON.parse(
            await readFile(join(dataRoot, 'runtime', 'lan-pairing.json'), 'utf8'),
          );
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      assert.equal(accessFile?.mode, 'trusted');
      assert.equal(accessFile?.active, true);
      assert.ok(accessFile?.urls.includes(`${lanOrigin}/`));
      assert.doesNotMatch(JSON.stringify(accessFile), /qiansi_pair/u);

      const healthResponse = await fetch(`${lanOrigin}/health?session=1`);
      assert.equal(healthResponse.status, 200);
      assert.equal((await healthResponse.json()).scope, 'collaboration');

      const directWrite = await fetch(`${lanOrigin}/projects/primary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateProjectId: 'main-canvas' }),
      });
      assert.equal(directWrite.status, 200);

      const rejectedOrigin = await fetch(`${lanOrigin}/projects`, {
        headers: { Origin: 'http://malicious.example.test' },
      });
      assert.equal(rejectedOrigin.status, 403);

      const rejectedPrivilegedRoute = await fetch(`${lanOrigin}/plugins`, {
        headers: { Origin: lanOrigin },
      });
      assert.equal(rejectedPrivilegedRoute.status, 403);
    } finally {
      await stopBridge(child);
      await rm(dataRoot, { recursive: true, force: true });
    }
  },
);
