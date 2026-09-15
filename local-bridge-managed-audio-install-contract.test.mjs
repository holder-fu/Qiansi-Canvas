import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');

function segment(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function route(pathname, nextPathname) {
  return segment(
    `if (request.method === 'POST' && url.pathname === '${pathname}')`,
    `if (request.method === 'POST' && url.pathname === '${nextPathname}')`,
  );
}

function allowedBodyKeys(routeSource) {
  return [...routeSource.matchAll(/key !== '([^']+)'/g)].map((match) => match[1]);
}

const routes = {
  catalog: route('/plugins/audio/install/catalog', '/plugins/audio/install/status'),
  status: route('/plugins/audio/install/status', '/plugins/audio/install/start'),
  start: route('/plugins/audio/install/start', '/plugins/audio/install/cancel'),
  cancel: route('/plugins/audio/install/cancel', '/plugins/audio/install/uninstall'),
  uninstall: segment(
    "if (request.method === 'POST' && url.pathname === '/plugins/audio/install/uninstall')",
    "url.pathname === '/plugins/audio/reference-library/list'",
  ),
};

test('Qiansi Audio exposes exactly one POST handler for each managed install route', () => {
  for (const pathname of [
    '/plugins/audio/install/catalog',
    '/plugins/audio/install/status',
    '/plugins/audio/install/start',
    '/plugins/audio/install/cancel',
    '/plugins/audio/install/uninstall',
  ]) {
    const escapedPath = pathname.replaceAll('/', '\\/');
    assert.equal(
      [...source.matchAll(new RegExp(`url\\.pathname === '${escapedPath}'`, 'g'))].length,
      1,
      `${pathname} must have one authoritative handler`,
    );
    assert.match(
      source,
      new RegExp(`request\\.method === 'POST' && url\\.pathname === '${escapedPath}'`),
    );
  }
});

test('install routes share the trusted plugin, compatibility, permission, and generator guard', () => {
  const guard = segment(
    'async function enabledPluginAudioInstaller(pluginIdValue, generatorIdValue)',
    'function pluginManagedAudioAdapters(plugin)',
  );

  assert.match(guard, /pluginId !== QIANSI_AUDIO_PLUGIN_ID/);
  assert.match(guard, /catalog\.plugins\.find\(\(item\) => item\.manifest\.id === pluginId\)/);
  assert.match(guard, /!plugin \|\| !plugin\.enabled \|\| !plugin\.compatible/);
  assert.match(guard, /plugin\.manifest\.permissions\.includes\('audio:install'\)/);
  assert.match(guard, /plugin\.manifest\.contributes\.audioGenerators\.find/);
  assert.match(guard, /item\.id === generatorId/);
  assert.match(guard, /if \(!generator\) throw new ManagedAudioInstallerError/);

  assert.match(routes.catalog, /await enabledPluginAudioInstaller\(body\.pluginId\)/);
  for (const name of ['status', 'start', 'cancel', 'uninstall']) {
    assert.match(
      routes[name],
      /await enabledPluginAudioInstaller\(\s*body\.pluginId,\s*body\.generatorId,?\s*\)/,
      `${name} must validate the requested generator against the plugin manifest`,
    );
  }
});

test('reference audio library has its own permission without requiring a generator', () => {
  const guard = segment(
    'async function enabledPluginReferenceAudioLibrary(pluginIdValue)',
    'function decodeReferenceAudioBase64(value)',
  );

  assert.match(guard, /permissions\.includes\('audio:reference-library'\)/);
  assert.match(guard, /permissions\.includes\('audio:generate'\)/);
  assert.doesNotMatch(guard, /audioGenerators/);
  assert.doesNotMatch(guard, /pluginId !== QIANSI_AUDIO_PLUGIN_ID/);
});

test('each install route rejects unknown body fields with its exact allowlist', () => {
  assert.deepEqual(allowedBodyKeys(routes.catalog), ['pluginId']);
  assert.deepEqual(allowedBodyKeys(routes.status), ['pluginId', 'generatorId']);
  assert.deepEqual(allowedBodyKeys(routes.start), ['pluginId', 'generatorId', 'licenseAcceptance']);
  assert.deepEqual(allowedBodyKeys(routes.cancel), ['pluginId', 'generatorId']);
  assert.deepEqual(allowedBodyKeys(routes.uninstall), ['pluginId', 'generatorId']);

  for (const [name, routeSource] of Object.entries(routes)) {
    assert.match(routeSource, /const unknown = Object\.keys\(body \|\| \{\}\)\.filter/);
    assert.match(routeSource, /if \(unknown\.length > 0\)/);
    assert.match(
      routeSource,
      /throw new ManagedAudioInstallerError\([\s\S]*?\b400,?\s*\)/,
      `${name} must reject, not ignore, unknown fields`,
    );
  }
});

test('background install stops the active worker through the pre-install barrier and handles rejection', () => {
  const installIndex = routes.start.indexOf('const task = installer.install(');
  const beforeInstallIndex = routes.start.indexOf('beforeInstall: async () => {', installIndex);
  const workerStopIndex = routes.start.indexOf(
    'await managedAudioWorkers.stop(',
    beforeInstallIndex,
  );
  const rejectionHandlerIndex = routes.start.indexOf('task.catch((error) => {', installIndex);
  const acceptedResponseIndex = routes.start.indexOf('send(response, 202,', installIndex);

  assert.ok(installIndex >= 0, 'start must retain the background task promise');
  assert.match(routes.start, /if \(managedAudioWorkers\.isGenerating\(\)\)/);
  assert.match(routes.start, /音频正在生成，请完成或取消后再安装模型/);
  assert.ok(beforeInstallIndex > installIndex, 'worker shutdown must be an installer barrier');
  assert.ok(
    workerStopIndex > beforeInstallIndex,
    'the barrier must stop the selected audio worker',
  );
  assert.ok(
    workerStopIndex < rejectionHandlerIndex,
    'worker shutdown must stay inside the install options passed before task handling',
  );
  assert.ok(rejectionHandlerIndex > installIndex, 'the task needs an explicit rejection handler');
  assert.ok(
    rejectionHandlerIndex < acceptedResponseIndex,
    'the rejection handler must be attached before returning the accepted response',
  );
  assert.match(routes.start, /if \(error\?\.name === 'AbortError'\) return/);
});

test('status refreshes persisted state when this Bridge no longer owns an active task', () => {
  assert.match(routes.status, /installer\.isInstalling\(generatorId\)/);
  assert.match(routes.status, /installer\.taskStatus\(generatorId\)/);
  assert.match(routes.status, /await installer\.status\(generatorId\)/);
  assert.doesNotMatch(routes.status, /live\.status === 'idle'/);
});

test('uninstall stops the worker and remains bound to the trusted manager', () => {
  assert.match(routes.uninstall, /if \(managedAudioWorkers\.isGenerating\(\)\)/);
  assert.match(routes.uninstall, /await getManagedAudioInstaller\(\)\.uninstall\(generatorId, \{/);
  assert.match(routes.uninstall, /beforeUninstall: async \(\) => \{/);
  assert.match(routes.uninstall, /await managedAudioWorkers\.stop\(/);
});

test('generation is gated during installation and shutdown settles installer tasks first', () => {
  const generationGuard = segment(
    'async function enabledPluginAudioGenerator(pluginIdValue, generatorIdValue)',
    'async function enabledPluginAudioInstaller(pluginIdValue, generatorIdValue)',
  );
  assert.match(generationGuard, /pluginId === QIANSI_AUDIO_PLUGIN_ID && managedAudioInstaller/);
  assert.match(generationGuard, /managedAudioInstaller\.taskStatus\(generatorId\)/);
  assert.match(
    generationGuard,
    /\['preparing', 'running', 'cancelling', 'removing'\]\.includes\(installStatus\.status\)/,
  );
  assert.match(generationGuard, /PluginAudioProxyError\([^;]+, 409\)/s);

  const shutdown = segment('async function shutdownBridge()', "process.once('SIGINT'");
  const installerStopIndex = shutdown.indexOf(
    'await managedAudioInstaller?.stopAll().catch(() => undefined)',
  );
  const workerStopIndex = shutdown.indexOf(
    'await managedAudioWorkers.stopAll().catch(() => undefined)',
  );
  const exitIndex = shutdown.indexOf('process.exit(0)');
  assert.ok(installerStopIndex >= 0, 'shutdown must settle/cancel installer tasks');
  assert.ok(
    installerStopIndex < workerStopIndex,
    'installer tasks must settle before audio workers',
  );
  assert.ok(workerStopIndex < exitIndex, 'both pools must stop before process exit');
});
