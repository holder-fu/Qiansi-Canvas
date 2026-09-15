import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { targetConfiguration, verifyPortableRelease } from './portable-release-contract.mjs';

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--root') options.root = values[++index];
    else throw new Error(`Unknown option: ${values[index]}`);
  }
  if (!options.root) throw new Error('--root is required.');
  return options;
}

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

function waitForOutput(stream, pattern, timeoutMs) {
  return new Promise((resolveMatch, rejectMatch) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      rejectMatch(new Error(`Timed out waiting for launcher output ${pattern}.\n${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString('utf8');
      const match = pattern.exec(output);
      if (match) {
        cleanup();
        resolveMatch(match);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
}

async function waitForExit(child, timeoutMs = 8_000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((_, rejectExit) =>
      setTimeout(() => rejectExit(new Error('Portable launcher did not stop in time.')), timeoutMs),
    ),
  ]);
}

export async function smokePortableRelease(root) {
  const releaseRoot = resolve(root);
  const manifest = await verifyPortableRelease(releaseRoot);
  const target = targetConfiguration(manifest.target);
  const executable = join(releaseRoot, target.runtimeExecutable);
  const bridgePort = await freePort();
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-portable-smoke-data-'));
  const child = spawn(executable, [join(releaseRoot, 'qiansi-launcher.mjs')], {
    cwd: releaseRoot,
    env: {
      ...process.env,
      QIANSI_LAUNCHER_NO_BROWSER: '1',
      QIANSI_CANVAS_LAN: '0',
      QIANSI_CANVAS_HOST: '127.0.0.1',
      QIANSI_CANVAS_BRIDGE_PORT: String(bridgePort),
      QIANSI_CANVAS_DATA_DIR: dataRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  try {
    const centerMatch = await waitForOutput(
      child.stdout,
      /启动中心：(http:\/\/127\.0\.0\.1:\d+\/)/,
      15_000,
    );
    const centerUrl = centerMatch[1];
    const pageResponse = await fetch(centerUrl);
    if (!pageResponse.ok) throw new Error(`Launch center returned ${pageResponse.status}.`);
    const page = await pageResponse.text();
    const token = /const token=("[A-Za-z0-9_-]+")/.exec(page)?.[1];
    if (!token) throw new Error('Launch center page did not contain its session token.');
    const sessionToken = JSON.parse(token);
    const headers = { 'X-Qiansi-Launcher': sessionToken };
    const statusResponse = await fetch(new URL('/api/status', centerUrl), { headers });
    const status = await statusResponse.json();
    if (!statusResponse.ok || status.ready !== true) {
      throw new Error(`Portable diagnostics were not ready: ${JSON.stringify(status)}`);
    }
    const startResponse = await fetch(new URL('/api/start', centerUrl), {
      method: 'POST',
      headers,
    });
    const started = await startResponse.json();
    if (!startResponse.ok || started.ok !== true) {
      throw new Error(`Portable Bridge did not start: ${JSON.stringify(started)}`);
    }
    const canvasResponse = await fetch(started.canvasUrl);
    if (!canvasResponse.ok || !(await canvasResponse.text()).includes('<div id="root">')) {
      throw new Error('Portable canvas page did not load its application root.');
    }
    return { centerUrl, canvasUrl: started.canvasUrl, bridgePort };
  } finally {
    if (child.exitCode === null) child.kill();
    await waitForExit(child).catch(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
    await rm(dataRoot, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) {
      throw new Error(`Portable launcher exited with ${child.exitCode}: ${stderr}`);
    }
  }
}

const options = parseArguments(process.argv.slice(2));
smokePortableRelease(options.root)
  .then(({ centerUrl, canvasUrl }) => {
    console.log(`绿色启动中心冒烟通过：${centerUrl}`);
    console.log(`无限画布冒烟通过：${canvasUrl}`);
  })
  .catch((error) => {
    console.error(`绿色运行包冒烟失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
