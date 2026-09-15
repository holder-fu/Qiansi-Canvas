/* eslint-disable no-console -- This CLI reports child-process status to its terminal. */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivateNetworkHost } from './bridge-origin.mjs';
import { createBridgeAccessToken, normalizeBridgeAccessToken } from './bridge-security.mjs';

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));
const LOOPBACK_HOST = '127.0.0.1';
const LAN_REQUESTED = process.env.QIANSI_CANVAS_LAN === '1';
const HOST =
  String(
    process.env.QIANSI_CANVAS_DEV_HOST ||
      process.env.QIANSI_CANVAS_HOST ||
      (LAN_REQUESTED ? '0.0.0.0' : LOOPBACK_HOST),
  ).trim() || LOOPBACK_HOST;
const LAN_ACTIVE = LAN_REQUESTED || !['127.0.0.1', 'localhost', '::1'].includes(HOST.toLowerCase());
const TRUSTED_LAN =
  LAN_ACTIVE && String(process.env.QIANSI_CANVAS_TRUSTED_LAN || '').trim() === '1';
const WILDCARD_HOST = HOST === '0.0.0.0' || HOST === '::';
const PROBE_HOST = WILDCARD_HOST ? LOOPBACK_HOST : HOST;
const NETWORK_ADDRESSES = Object.values(networkInterfaces())
  .flatMap((items) => items || [])
  .filter((item) => item && !item.internal && (item.family === 'IPv4' || item.family === 4))
  .map((item) => item.address)
  .filter(isPrivateNetworkHost);

function urlHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function readPort(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} 必须是 1–65535 之间的端口号。`);
  }
  return value;
}

const BRIDGE_PORT = readPort('QIANSI_CANVAS_DEV_BRIDGE_PORT', 2896);
const WEB_PORT = readPort('QIANSI_CANVAS_DEV_PORT', 2895);
const DEVELOPMENT_BRIDGE_PROXY_PREFIX = '/__qiansi_bridge';
const SHOULD_OPEN = process.env.QIANSI_CANVAS_DEV_OPEN !== '0';
// Keep one pairing identity for the lifetime of the development supervisor.
// `node --watch` may restart the Bridge process, but paired LAN browsers must
// not be logged out by every source edit.
const DEVELOPMENT_ACCESS_TOKEN =
  LAN_ACTIVE && !TRUSTED_LAN
    ? normalizeBridgeAccessToken(process.env.QIANSI_CANVAS_ACCESS_TOKEN) ||
      createBridgeAccessToken()
    : '';

if (BRIDGE_PORT === WEB_PORT) {
  throw new Error('开发页面端口和桥接端口不能相同。');
}

function canConnect(port, timeoutMs = 250) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect({ host: PROBE_HOST, port });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function assertPortFree(port, label) {
  if (await canConnect(port)) {
    throw new Error(`${label}端口 ${port} 已被占用。请先关闭普通模式或其它占用该端口的程序。`);
  }
}

async function waitForPort(port, child, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`本地桥提前退出，退出码 ${child.exitCode}。`);
    }
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待本地桥端口 ${port} 超时。`);
}

let bridgeProcess;
let viteProcess;
let shuttingDown = false;

function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill();
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  stopChild(viteProcess);
  stopChild(bridgeProcess);
  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

async function main() {
  const viteEntry = join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteEntry)) {
    throw new Error('未找到 Vite。请先运行“tools/launchers/安装Qiansi-Canvas.bat”安装依赖。');
  }

  await assertPortFree(BRIDGE_PORT, '本地桥');
  await assertPortFree(WEB_PORT, '开发页面');

  console.log(`[开发模式] 本地桥: http://${LOOPBACK_HOST}:${BRIDGE_PORT}`);
  const developmentHosts = WILDCARD_HOST ? [LOOPBACK_HOST, ...NETWORK_ADDRESSES] : [HOST];
  const configuredOrigins = new Set(
    String(
      process.env.QIANSI_CANVAS_ALLOWED_ORIGINS || process.env.KITTY_CANVAS_ALLOWED_ORIGINS || '',
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const host of developmentHosts) {
    configuredOrigins.add(`http://${urlHost(host)}:${WEB_PORT}`);
  }
  bridgeProcess = spawn(process.execPath, ['--watch', 'local-bridge.mjs'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      QIANSI_CANVAS_HOST: HOST,
      QIANSI_CANVAS_BRIDGE_PORT: String(BRIDGE_PORT),
      QIANSI_CANVAS_ALLOWED_ORIGINS: [...configuredOrigins].join(','),
      QIANSI_CANVAS_ACCESS_TOKEN: DEVELOPMENT_ACCESS_TOKEN,
      QIANSI_CANVAS_TRUSTED_LAN: TRUSTED_LAN ? '1' : '0',
      QIANSI_CANVAS_PAIR_RETURN_PORT: String(WEB_PORT),
    },
    stdio: 'inherit',
  });

  await waitForPort(BRIDGE_PORT, bridgeProcess);

  const viteArgs = [viteEntry, '--host', HOST, '--port', String(WEB_PORT), '--strictPort'];
  if (SHOULD_OPEN) viteArgs.push('--open');

  console.log(`[开发模式] 本机热更新页面: http://${LOOPBACK_HOST}:${WEB_PORT}`);
  if (WILDCARD_HOST) {
    for (const address of new Set(NETWORK_ADDRESSES)) {
      console.log(`[开发模式] 局域网页面: http://${address}:${WEB_PORT}`);
      if (!TRUSTED_LAN) {
        console.log(
          `[开发模式] 局域网一键配对并进入画布: http://${address}:${WEB_PORT}/?qiansi_pair=${DEVELOPMENT_ACCESS_TOKEN}`,
        );
      }
    }
    console.log(
      TRUSTED_LAN
        ? '[开发模式] 可信局域网直连已启用，手机或其它电脑可直接打开上面的局域网页面。'
        : '[开发模式] 手机或其它电脑请打开上面的“一键配对并进入画布”地址。',
    );
  }
  console.log('[开发模式] 修改前端后自动热更新；修改本地桥代码后自动重启桥。');
  viteProcess = spawn(process.execPath, viteArgs, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      QIANSI_CANVAS_ACCESS_TOKEN: DEVELOPMENT_ACCESS_TOKEN,
      QIANSI_CANVAS_TRUSTED_LAN: TRUSTED_LAN ? '1' : '0',
      QIANSI_CANVAS_DEV_BRIDGE_PROXY: '1',
      QIANSI_CANVAS_DEV_BRIDGE_PORT: String(BRIDGE_PORT),
      VITE_QIANSI_CANVAS_BRIDGE_URL: `http://${urlHost(HOST)}:${WEB_PORT}${DEVELOPMENT_BRIDGE_PROXY_PREFIX}`,
    },
    stdio: 'inherit',
  });

  bridgeProcess.once('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[开发模式] 本地桥已停止，退出码 ${code ?? 'unknown'}。`);
    shutdown(code || 1);
  });
  viteProcess.once('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[开发模式] Vite 已停止，退出码 ${code ?? 'unknown'}。`);
    shutdown(code || 1);
  });
}

main().catch((error) => {
  console.error(`[开发模式] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
