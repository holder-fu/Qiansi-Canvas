import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  collectLauncherDiagnostics,
  runLauncherRepairAction,
  startLaunchCenter,
} from './qiansi-launcher.mjs';

const temporaryDirectories = [];
const centers = [];

afterEach(async () => {
  await Promise.all(centers.splice(0).map((center) => center.stop()));
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'qiansi-launcher-test-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"qiansi-canvas","version":"1.0.0"}\n');
  await writeFile(join(root, 'local-bridge.mjs'), 'setInterval(() => {}, 1000);\n');
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html>');
  await mkdir(join(root, 'tools', 'launchers'), { recursive: true });
  if (process.platform === 'win32' || process.platform === 'darwin') {
    const installer =
      process.platform === 'win32' ? '安装Qiansi-Canvas.bat' : '安装Qiansi-Canvas-macOS.command';
    const installerContent =
      process.platform === 'win32'
        ? '@echo off\r\nif /I not "%~1"=="--repair" exit /b 9\r\nexit /b 0\r\n'
        : '#!/bin/zsh\n[[ "$1" == "--repair" ]] || exit 9\nexit 0\n';
    await writeFile(join(root, 'tools', 'launchers', installer), installerContent);
  }
  return root;
}

test('launch diagnostics separate required core from optional creative tools', async () => {
  const root = await fixture();
  const diagnostics = await collectLauncherDiagnostics({
    installRoot: root,
    dataRoot: join(root, 'data'),
    bridgePort: await freePort(),
  });
  assert.equal(diagnostics.ready, true);
  assert.equal(
    diagnostics.manualInstallAvailable,
    process.platform === 'win32' || process.platform === 'darwin',
  );
  assert.ok(diagnostics.core.every((item) => item.required === true));
  assert.ok(diagnostics.optional.every((item) => item.required === false));
  assert.ok(diagnostics.optional.some((item) => item.id === 'ffmpeg'));
  assert.equal(
    diagnostics.optional.find((item) => item.id === 'ffmpeg')?.meta.action,
    'open-ffmpeg-download',
  );
  assert.equal(
    diagnostics.core.find((item) => item.id === 'runtime')?.meta.nodeVersion,
    process.versions.node,
  );
  const packageCheck = diagnostics.core.find((item) => item.id === 'package');
  assert.equal(packageCheck?.meta.appVersion, '1.0.0');
  assert.equal(packageCheck?.detail, '版本 1.0.0');
  assert.equal(diagnostics.core.find((item) => item.id === 'port')?.meta.bridgePort > 0, true);
  const repairableCoreIds = ['runtime', 'package', 'bridge', 'web', 'integrity'];
  assert.ok(
    diagnostics.core
      .filter((item) => repairableCoreIds.includes(item.id))
      .every((item) =>
        process.platform === 'win32' || process.platform === 'darwin'
          ? item.meta.action === 'install-app'
          : item.meta.action === '',
      ),
  );
  assert.equal(
    diagnostics.core.find((item) => item.id === 'port')?.meta.canvasUrl,
    diagnostics.canvasUrl,
  );
});

test('launch diagnostics identify port 2895 as the default infinite canvas target', async () => {
  const root = await fixture();
  const diagnostics = await collectLauncherDiagnostics({
    installRoot: root,
    dataRoot: join(root, 'data'),
  });
  assert.equal(diagnostics.bridgePort, 2895);
  assert.equal(diagnostics.canvasUrl, 'http://127.0.0.1:2895/');
});

test(
  'application repair forwards the noninteractive flag and waits for a successful exit',
  { skip: process.platform !== 'win32' && process.platform !== 'darwin' },
  async () => {
    const root = await fixture();
    assert.deepEqual(await runLauncherRepairAction('install-app', root), { completed: true });
  },
);

test('launch center exposes a visual page and protects control APIs with its session token', async () => {
  const root = await fixture();
  const bridgePort = await freePort();
  const center = await startLaunchCenter({
    installRoot: root,
    bridgePort,
    centerPort: 0,
    openBrowser: false,
  });
  centers.push(center);
  assert.equal(center.canvasUrl, `http://127.0.0.1:${bridgePort}/`);

  const page = await fetch(center.centerUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Qiansi-Canvas 启动中心/);
  assert.match(html, /打开无限画布/);
  assert.match(html, /手动安装/);
  assert.match(html, /Manual install/);
  assert.match(html, /手動インストール/);
  assert.match(html, /수동 설치/);
  assert.match(html, /Instalación manual/);
  assert.match(html, /id="manual-install"[\s\S]*id="launch"/);
  assert.match(html, /id="manual-modal"/);
  assert.match(html, /data-manual-action/);
  assert.match(html, /\/api\/manual-install\/run\?action=/);
  assert.match(html, /body\{display:flow-root;margin:0;/);
  assert.match(html, /id="language"/);
  assert.match(html, /简体中文/);
  assert.match(html, /English/);
  assert.match(html, /日本語/);
  assert.match(html, /한국어/);
  assert.match(html, /Español/);
  assert.match(html, /版本 \{appVersion\}/);
  assert.match(html, /document\.documentElement\.lang=locale/);
  assert.match(html, /id="target-url"/);
  assert.match(html, /canvasTarget/);
  assert.match(html, /location\.replace\(data\.canvasUrl\)/);
  assert.match(html, /<details class=/);
  assert.match(html, /data-repair-action/);
  assert.match(html, /data-recheck-check/);
  assert.match(html, /重新安装 \/ 修复/);
  assert.match(html, /立即重新检查/);
  assert.match(html, /安装 \/ 修复已完成，正在重新检查/);
  assert.match(html, /activeRepairAction/);
  assert.match(html, /\/api\/action\?action=/);
  assert.match(html, /解决办法/);
  assert.match(html, /功能说明/);
  assert.match(html, /安装与使用帮助/);
  assert.match(html, /为 Qiansi-Canvas 提供运行 Bridge 和本机服务所需的 Node\.js 环境/);
  assert.match(html, /普通用户无需单独安装，绿色包已内置/);
  assert.match(html, /tools\/launchers\/安装CLI工具-Windows\.bat/);
  assert.match(html, /npm install -g @openai\/codex@latest/);
  assert.match(html, /该端口也可能是已启动的 Qiansi-Canvas/);
  assert.match(html, /text\(\)\.solutions/);
  assert.match(html, /text\(\)\.descriptions/);
  assert.match(html, /text\(\)\.guides/);
  assert.doesNotMatch(html, /if\(item\.state==='ready'\)return '<article/);
  assert.doesNotMatch(html, /localStorage/);

  const unauthorized = await fetch(new URL('/api/status', center.centerUrl));
  assert.equal(unauthorized.status, 403);
  const authorized = await fetch(new URL('/api/status', center.centerUrl), {
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  assert.equal(authorized.status, 200);
  const status = await authorized.json();
  assert.equal(status.ready, true);
  assert.equal(
    status.manualInstallAvailable,
    process.platform === 'win32' || process.platform === 'darwin',
  );
  assert.equal(status.core.find((item) => item.id === 'package')?.meta.appVersion, '1.0.0');
});

test(
  'launch center runs only an available allowlisted manual installation script',
  { skip: process.platform !== 'win32' && process.platform !== 'darwin' },
  async () => {
    const root = await fixture();
    const bridgePort = await freePort();
    const actions = [];
    const center = await startLaunchCenter({
      installRoot: root,
      bridgePort,
      centerPort: 0,
      openBrowser: false,
      manualInstallRunner: async (action, installRoot) => actions.push({ action, installRoot }),
    });
    centers.push(center);

    const accepted = await fetch(
      new URL('/api/manual-install/run?action=install-app', center.centerUrl),
      {
        method: 'POST',
        headers: { 'X-Qiansi-Launcher': center.token },
      },
    );
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), {
      ok: true,
      filename:
        process.platform === 'win32' ? '安装Qiansi-Canvas.bat' : '安装Qiansi-Canvas-macOS.command',
    });
    assert.deepEqual(actions, [{ action: 'install-app', installRoot: root }]);

    const rejected = await fetch(
      new URL('/api/manual-install/run?action=qiansi-install', center.centerUrl),
      {
        method: 'POST',
        headers: { 'X-Qiansi-Launcher': center.token },
      },
    );
    assert.equal(rejected.status, 400);
    assert.equal(actions.length, 1);
  },
);

test('launch center rejects manual installation when the allowlisted script is absent', async () => {
  const root = await fixture();
  await rm(join(root, 'tools', 'launchers'), { recursive: true, force: true });
  const bridgePort = await freePort();
  let runnerCalled = false;
  const center = await startLaunchCenter({
    installRoot: root,
    bridgePort,
    centerPort: 0,
    openBrowser: false,
    manualInstallRunner: async () => {
      runnerCalled = true;
    },
  });
  centers.push(center);

  const diagnostics = await collectLauncherDiagnostics({ installRoot: root, bridgePort });
  assert.equal(diagnostics.manualInstallAvailable, false);
  const rejected = await fetch(
    new URL('/api/manual-install/run?action=install-app', center.centerUrl),
    {
      method: 'POST',
      headers: { 'X-Qiansi-Launcher': center.token },
    },
  );
  assert.equal(rejected.status, 400);
  assert.equal(runnerCalled, false);
});

test(
  'launch center reports a manual script launch failure',
  { skip: process.platform !== 'win32' && process.platform !== 'darwin' },
  async () => {
    const root = await fixture();
    const bridgePort = await freePort();
    const center = await startLaunchCenter({
      installRoot: root,
      bridgePort,
      centerPort: 0,
      openBrowser: false,
      manualInstallRunner: async () => {
        throw new Error('fixture manual launch failed');
      },
    });
    centers.push(center);

    const failed = await fetch(
      new URL('/api/manual-install/run?action=install-app', center.centerUrl),
      {
        method: 'POST',
        headers: { 'X-Qiansi-Launcher': center.token },
      },
    );
    assert.equal(failed.status, 500);
    assert.match((await failed.json()).error, /fixture manual launch failed/);
  },
);

test('launch center runs only a currently offered allowlisted repair action', async () => {
  const root = await fixture();
  const bridgePort = await freePort();
  const actions = [];
  const center = await startLaunchCenter({
    installRoot: root,
    bridgePort,
    centerPort: 0,
    openBrowser: false,
    repairActionRunner: async (action, installRoot) => actions.push({ action, installRoot }),
  });
  centers.push(center);

  const accepted = await fetch(
    new URL('/api/action?action=open-ffmpeg-download', center.centerUrl),
    {
      method: 'POST',
      headers: { 'X-Qiansi-Launcher': center.token },
    },
  );
  assert.equal(accepted.status, 202);
  assert.deepEqual(actions, [{ action: 'open-ffmpeg-download', installRoot: root }]);

  const readyRepair = await fetch(new URL('/api/action?action=install-app', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  if (process.platform === 'win32' || process.platform === 'darwin') {
    assert.equal(readyRepair.status, 202);
    assert.deepEqual(actions.at(-1), { action: 'install-app', installRoot: root });
  } else {
    assert.equal(readyRepair.status, 400);
  }

  const rejected = await fetch(new URL('/api/action?action=install-unknown', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  assert.equal(rejected.status, 400);
  assert.equal(
    actions.length,
    process.platform === 'win32' || process.platform === 'darwin' ? 2 : 1,
  );
});

test('launch center waits for application repair, rejects overlap, and returns completion', async () => {
  const root = await fixture();
  const bridgePort = await freePort();
  let finishRepair;
  let markRepairStarted;
  const repairGate = new Promise((resolveRepair) => {
    finishRepair = resolveRepair;
  });
  const repairStarted = new Promise((resolveStarted) => {
    markRepairStarted = resolveStarted;
  });
  const center = await startLaunchCenter({
    installRoot: root,
    bridgePort,
    centerPort: 0,
    openBrowser: false,
    repairActionRunner: async () => {
      markRepairStarted();
      await repairGate;
      return { completed: true };
    },
  });
  centers.push(center);

  const repairRequest = fetch(new URL('/api/action?action=install-app', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  await repairStarted;
  const overlap = await fetch(new URL('/api/action?action=install-app', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  assert.equal(overlap.status, 409);

  finishRepair();
  const completed = await repairRequest;
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { ok: true, completed: true });
});

test('launch center reports repair failure and releases the action lock', async () => {
  const root = await fixture();
  const bridgePort = await freePort();
  let attempts = 0;
  const center = await startLaunchCenter({
    installRoot: root,
    bridgePort,
    centerPort: 0,
    openBrowser: false,
    repairActionRunner: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('fixture repair failed');
      return { completed: true };
    },
  });
  centers.push(center);

  const failed = await fetch(new URL('/api/action?action=install-app', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  assert.equal(failed.status, 500);
  assert.match((await failed.json()).error, /fixture repair failed/);

  const retried = await fetch(new URL('/api/action?action=install-app', center.centerUrl), {
    method: 'POST',
    headers: { 'X-Qiansi-Launcher': center.token },
  });
  assert.equal(retried.status, 200);
  assert.equal(attempts, 2);
});
