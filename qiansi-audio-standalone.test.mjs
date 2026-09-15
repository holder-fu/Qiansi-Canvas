import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const installedRoot = 'data/plugins/qiansi-audio';
const bundledPython = `${installedRoot}/engines/voxcpm2/runtime/python/python.exe`;
const controllerPython = `${installedRoot}/controller/runtime/python/python.exe`;
const serverScript = `${installedRoot}/standalone/server.py`;
const installerScript = `${installedRoot}/install/installer.py`;
const installerTestScript = `${installedRoot}/tests/test_installer.py`;

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(
      () => reject(new Error(`standalone startup timed out: ${stderr}`)),
      15_000,
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const line = stdout.split(/\r?\n/).find((value) => value.startsWith('QIAS_READY '));
      if (!line) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(line.slice('QIAS_READY '.length)));
      } catch (error) {
        reject(error);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`standalone exited before ready (${code}): ${stderr}`));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('standalone did not stop')), 10_000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

test('installed standalone controller and fixed-catalog installer stay hardened', async () => {
  const [runtime, html, bootstrap, server, installer, catalog, launcher] = await Promise.all([
    readFile(`${installedRoot}/runtime.js`, 'utf8'),
    readFile(`${installedRoot}/standalone/index.html`, 'utf8'),
    readFile(`${installedRoot}/standalone/standalone.js`, 'utf8'),
    readFile(`${installedRoot}/standalone/server.py`, 'utf8'),
    readFile(installerScript, 'utf8'),
    readFile(`${installedRoot}/install/catalog.json`, 'utf8'),
    readFile(`${installedRoot}/启动 Qiansi Audio Studio.bat`, 'utf8'),
  ]);
  assert.ok(html.indexOf('/standalone.js') < html.indexOf('/runtime.js'));
  assert.match(bootstrap, /standalone: true/);
  assert.match(bootstrap, /downloadAudioHistory:/);
  assert.match(bootstrap, /importReferenceAudioLibrary:/);
  assert.match(bootstrap, /\/api\/reference-audio-library\/import/);
  assert.match(bootstrap, /createReferenceAudioCategory:/);
  assert.match(bootstrap, /uninstallEngine:/);
  assert.match(bootstrap, /\/api\/install\/\$\{encodeURIComponent\(generatorId\)\}\/uninstall/);
  assert.match(bootstrap, /\/api\/reference-audio-library\/category\/create/);
  assert.match(bootstrap, /JSON\.stringify\(\{ id, name, category, transcript \}\)/);
  assert.match(runtime, /id="qa-save-output"/);
  assert.match(runtime, /async function saveLatestOutput\(\)/);
  assert.match(runtime, /isStandalone \? '已保存到独立音频库' : '已保存到素材库'/);
  assert.match(server, /StudioServer\(\("127\.0\.0\.1", args\.port\), library\)/);
  assert.match(server, /parser\.add_argument\("--port", type=int, default=0\)/);
  assert.match(server, /sqlite3/);
  assert.match(server, /worker_sha256/);
  assert.match(server, /WORKER_BOOTSTRAP/);
  assert.match(server, /job\.assign\(process\)/);
  assert.match(server, /WorkerSession\(generator_id, process, job\)/);
  assert.match(server, /session\.job\.close\(\)/);
  assert.match(server, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(server, /def read_audio\(/);
  assert.match(server, /def add\(self, file_name_value: Any, mime_type_value: Any, data: bytes\)/);
  assert.match(server, /def create_category\(self, name_value: Any\)/);
  assert.match(server, /MAX_REFERENCE_AUDIO_TRANSCRIPT_LENGTH = 16_000/);
  assert.match(server, /EngineInstaller\(PACKAGE_ROOT\)/);
  assert.match(server, /def _assert_installer_allows_worker\(generator_id: str\)/);
  assert.match(server, /\/ generator_id\s*\/ "transaction\.json"/);
  assert.match(server, /_assert_installer_allows_worker\(generator_id\)/);
  assert.match(server, /self\.audio_operation_gate = threading\.Lock\(\)/);
  assert.equal(
    server.match(/self\.server\.audio_operation_gate\.acquire\(blocking=False\)/g)?.length,
    4,
    'health, generation, installation and uninstallation must share one atomic lifecycle gate',
  );
  assert.match(server, /if self\.server\.active_install\(\) is not None/);
  assert.match(server, /if self\.server\.workers\.busy\(\)/);
  assert.doesNotMatch(server, /git\W+clone/);
  assert.match(installer, /class ResumableDownloader/);
  assert.match(installer, /def _safe_zip_extract\(/);
  assert.match(installer, /ModelScope 排在 Hugging Face 之前/);
  assert.match(installer, /os\.replace\(assembly, target\)/);
  assert.match(installer, /def request_cancel\(/);
  assert.match(installer, /def uninstall\(/);
  assert.match(catalog, /"schemaVersion"\s*:\s*1/);
  assert.doesNotMatch(bootstrap, /JSON\.stringify\(\{ generatorId, repoUrl \}\)/);
  assert.match(bootstrap, /licenseAcceptance/);
  assert.match(server, /self\.cancel_active = False/);
  assert.equal(
    server.match(/self\.server\.workers\.generate\(generator_id, request\)/g)?.length,
    1,
    'one browser generation must invoke the model only once',
  );
  assert.doesNotMatch(server, /0\.0\.0\.0/);
  assert.match(launcher, /controller\\bootstrap\.ps1/);
  assert.match(launcher, /controller\\runtime\\python\\python\.exe/);
});

test('Windows cmd parses the portable launcher without starting the server', async (context) => {
  try {
    await access(controllerPython);
  } catch {
    context.skip('controller bootstrap download is intentionally not exercised by offline tests');
    return;
  }
  const launcherPath = await realpath(`${installedRoot}/启动 Qiansi Audio Studio.bat`);
  const launcherBytes = await readFile(launcherPath);
  assert.equal(launcherBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(/[\u0080-\uffff]/u.test(launcherBytes.toString('latin1')), false);
  assert.equal(launcherBytes.toString('ascii').replace(/\r\n/g, '').includes('\n'), false);

  const result = spawnSync('cmd.exe', ['/d', '/c', 'call', launcherPath], {
    encoding: 'utf8',
    env: { ...process.env, QIANSI_AUDIO_LAUNCHER_CHECK: '1' },
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /standalone self-test passed/);
  assert.match(result.stdout, /QIANSI_AUDIO_LAUNCHER_OK/);
  assert.doesNotMatch(result.stdout + result.stderr, /not recognized/i);
});

test('bundled green Python passes the standalone persistence self-test', async () => {
  const child = spawn(bundledPython, ['-I', '-B', '-X', 'utf8', serverScript, '--self-test'], {
    windowsHide: true,
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const code = await waitForExit(child);
  assert.equal(code, 0, output);
  assert.match(output, /standalone self-test passed/);
});

test('bundled green Python passes fixed-catalog installer security fixtures', async () => {
  const child = spawn(bundledPython, ['-I', '-B', '-X', 'utf8', installerTestScript], {
    windowsHide: true,
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const code = await waitForExit(child);
  assert.equal(code, 0, output);
  assert.match(output, /Ran 33 tests/);
  assert.match(output, /test_official_catalog_has_no_maintainer_core_release_gate.*ok/);
  assert.match(output, /OK/);
});

test(
  'Windows closes a hidden worker process when the standalone controller exits abruptly',
  { skip: process.platform !== 'win32' },
  async () => {
    const parentCode = [
      'import importlib.util,os,pathlib,subprocess,sys',
      `path=pathlib.Path(r'${serverScript}').resolve()`,
      "spec=importlib.util.spec_from_file_location('qiansi_standalone_job_test', path)",
      'module=importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      "victim=subprocess.Popen([sys.executable,'-I','-B','-c','import time; time.sleep(120)'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)",
      'job=module.KillOnCloseJob()',
      'job.assign(victim)',
      'print(victim.pid,flush=True)',
      'os._exit(73)',
    ].join(';');
    const parent = spawn(bundledPython, ['-I', '-B', '-X', 'utf8', '-c', parentCode], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    parent.stdout.setEncoding('utf8');
    parent.stderr.setEncoding('utf8');
    parent.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    parent.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    assert.equal(await waitForExit(parent), 73, stderr);
    const victimPid = Number.parseInt(stdout.trim(), 10);
    assert.ok(Number.isInteger(victimPid) && victimPid > 0, stdout || stderr);

    let victimAlive = true;
    try {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          process.kill(victimPid, 0);
        } catch (error) {
          if (error?.code === 'ESRCH') {
            victimAlive = false;
            break;
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      if (victimAlive) {
        try {
          process.kill(victimPid);
        } catch {
          // The Job Object may have completed between the final poll and cleanup.
        }
      }
    }
    assert.equal(victimAlive, false, `orphan worker ${victimPid} survived its controller`);
  },
);

test('standalone loopback page persists preferences and shuts down cleanly', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'qiansi-audio-live-test-'));
  const child = spawn(
    bundledPython,
    ['-I', '-B', '-X', 'utf8', serverScript, '--no-browser', '--data-root', dataRoot],
    { windowsHide: true },
  );
  try {
    const ready = await waitForReady(child);
    assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(ready.dataRoot, await realpath(dataRoot));
    const exchange = await fetch(ready.url, { redirect: 'manual' });
    assert.equal(exchange.status, 200);
    assert.equal(exchange.headers.get('set-cookie'), null);
    assert.match(await exchange.text(), /Qiansi Audio Studio/);

    const rejected = await fetch(`${ready.origin}/api/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://example.invalid',
      },
      body: JSON.stringify({ key: 'selected-model.v1', value: 'qwen3tts' }),
    });
    assert.equal(rejected.status, 403);

    const rejectedRead = await fetch(
      `${ready.origin}/api/health?generatorId=${encodeURIComponent('qwen3-tts-local')}`,
      { headers: { Origin: 'http://example.invalid', 'Sec-Fetch-Site': 'cross-site' } },
    );
    assert.equal(rejectedRead.status, 403);

    const saved = await fetch(`${ready.origin}/api/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ready.origin },
      body: JSON.stringify({ key: 'selected-model.v1', value: 'qwen3tts' }),
    });
    assert.equal(saved.status, 200);
    const restored = await fetch(
      `${ready.origin}/api/preferences?key=${encodeURIComponent('selected-model.v1')}`,
      {},
    );
    assert.deepEqual(await restored.json(), { value: 'qwen3tts' });

    const health = await fetch(
      `${ready.origin}/api/health?generatorId=${encodeURIComponent('qwen3-tts-local')}`,
      {},
    );
    assert.equal(health.status, 200);
    assert.equal(typeof (await health.json()).ok, 'boolean');

    const shutdown = await fetch(`${ready.origin}/api/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ready.origin },
      body: '{}',
    });
    assert.equal(shutdown.status, 200);
    assert.equal(await waitForExit(child), 0);
  } finally {
    if (child.exitCode === null) child.kill();
    await waitForExit(child).catch(() => {});
    await rm(dataRoot, { recursive: true, force: true });
  }
});
