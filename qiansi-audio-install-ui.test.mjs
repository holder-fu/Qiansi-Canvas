import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pluginRoot = 'data/plugins/qiansi-audio';
const runtimePaths = [`${pluginRoot}/runtime.js`];

async function readRuntimes() {
  return Promise.all(runtimePaths.map(async (path) => [path, await readFile(path, 'utf8')]));
}

function functionSlice(source, start, end) {
  const startOffset = source.indexOf(start);
  const endOffset = source.indexOf(end, startOffset + start.length);
  assert.ok(startOffset >= 0, `missing function boundary: ${start}`);
  assert.ok(endOffset > startOffset, `missing function boundary: ${end}`);
  return source.slice(startOffset, endOffset);
}

test('one-click install is driven by the host catalog and never asks for a repository URL', async () => {
  for (const [path, runtime] of await readRuntimes()) {
    const detection = functionSlice(
      runtime,
      'async function detectAvailability()',
      'async function installSelectedModel()',
    );
    const installation = functionSlice(
      runtime,
      'async function installSelectedModel()',
      'function refreshInstallOptions(availability)',
    );

    assert.match(detection, /typeof api\.listAudioGenerators === 'function'/, path);
    assert.match(detection, /const list = await api\.listAudioGenerators\(\)/, path);
    assert.match(
      installation,
      /api\.installEngine\(generatorId, options, \(status, message, state\) =>/,
      path,
    );
    assert.doesNotMatch(runtime, /\b(?:window\.)?prompt\s*\(/, path);
    assert.doesNotMatch(runtime, /git\s+clone/i, path);
    assert.doesNotMatch(
      installation,
      /installEngine\s*\(\s*generatorId\s*,\s*(?:info\.)?repoUrl/,
      path,
    );
    assert.doesNotMatch(installation, /info\.repoUrl/, path);
  }
});

test('official runtime recipes replace the maintainer-hosted core release gate', async () => {
  const catalog = JSON.parse(await readFile(`${pluginRoot}/install/catalog.json`, 'utf8'));
  assert.equal(catalog.coreRelease, undefined);
  assert.deepEqual(
    catalog.runtimeBootstrap.artifacts.map((artifact) => artifact.sources[0]?.provider),
    ['python-org', 'pypa'],
  );
  assert.equal(catalog.engines.length, 6);
  for (const engine of catalog.engines) {
    assert.ok(engine.officialInstall, `${engine.generatorId} must declare an official recipe`);
    assert.ok(engine.officialInstall.localFiles.length > 0);
    const releaseArtifacts = engine.artifacts.filter((artifact) =>
      artifact.sources?.some((source) => source.provider === 'github-release'));
    if (engine.generatorId === 'woosh-local') {
      assert.equal(engine.layoutVersion, 2);
      assert.deepEqual(
        releaseArtifacts.map((artifact) => [artifact.id, artifact.stripComponents]),
        [
          ['woosh-dflow', 2],
          ['woosh-text-conditioner-a', 2],
          ['woosh-ae', 2],
        ],
      );
    } else {
      assert.deepEqual(releaseArtifacts, []);
    }
  }
  const qwen = catalog.engines.find((engine) => engine.generatorId === 'qwen3-tts-local');
  assert.deepEqual(qwen.officialInstall.packages, ['qwen-tts==0.1.1']);
  const woosh = catalog.engines.find((engine) => engine.generatorId === 'woosh-local');
  assert.ok(woosh);
  assert.equal(woosh.source.commit, 'f6ff658efc6d63dee9959964cd75c63415910a19');
  assert.equal(woosh.entrypoints.pythonWindows, 'runtime/app/Woosh/.venv/Scripts/python.exe');
  assert.deepEqual(
    woosh.runtimeBootstrap.artifacts.map((artifact) => [
      artifact.id,
      artifact.sources[0]?.provider,
    ]),
    [
      ['python-runtime', 'python-org'],
      ['pip-bootstrap', 'pypa'],
      ['uv-runtime', 'github-release'],
    ],
  );
  assert.deepEqual(woosh.officialInstall.uvSync, {
    project: 'runtime/app/Woosh',
    executable: 'runtime/tools/uv/uv.exe',
    python: 'runtime/python/python.exe',
    extra: 'cuda',
  });
  assert.deepEqual(woosh.officialInstall.packages, []);
  const acestep = catalog.engines.find((engine) => engine.generatorId === 'acestep-xl-local');
  assert.ok(acestep);
  assert.equal(acestep.source.commit, 'dce621408bee8c31b4fcf4811682eb9359e1bc94');
  assert.equal(
    acestep.entrypoints.pythonWindows,
    'runtime/app/ACE-Step-1.5/.venv/Scripts/python.exe',
  );
  assert.deepEqual(acestep.officialInstall.uvSync, {
    project: 'runtime/app/ACE-Step-1.5',
    executable: 'runtime/tools/uv/uv.exe',
    python: 'runtime/python/python.exe',
  });

  for (const [path, runtime] of await readRuntimes()) {
    const installation = functionSlice(
      runtime,
      'async function installSelectedModel()',
      'function refreshInstallOptions(availability)',
    );
    const refresh = functionSlice(
      runtime,
      'function refreshInstallOptions(availability)',
      'void (async () =>',
    );
    const visibility = functionSlice(
      runtime,
      'function refreshModelVisibility(availability)',
      'function refreshInstallOptions(availability)',
    );
    const unavailableGuard = installation.indexOf('if (info.installAvailable === false)');
    const installCall = installation.indexOf('api.installEngine(generatorId, options');
    assert.ok(unavailableGuard >= 0 && unavailableGuard < installCall, path);
    assert.match(installation, /info\.unavailableReason \|\| '所选模型的官方安装源暂不可用。'/, path);
    assert.match(refresh, /info && info\.installAvailable\s*\? '可安装'\s*: '官方源不可用'/, path);
    assert.doesNotMatch(refresh, /可安装 · 权重仅限非商业用途|可安装 · 需要较高显存/, path);
    assert.match(refresh, /if \(info && info\.installed\) \{\s*opt\.disabled = true;/, path);
    assert.match(refresh, /installBtn\.disabled = true/, path);
    assert.match(runtime, /id="qa-models-empty" class="qa-models-empty"/, path);
    assert.match(runtime, /class="qa-card qa-input-card qa-hidden"/, path);
    assert.match(runtime, /class="qa-side qa-hidden"/, path);
    assert.match(visibility, /cell\.hidden = !selectable/, path);
    assert.match(
      visibility,
      /setWorkbenchVisible\(Boolean\(firstSelectable\) && activeSelectable\)/,
      path,
    );
    assert.match(
      runtime,
      /Object\.keys\(generators\)\.find\(\(a\) => hasInstallableInterface\(a\)\)/,
      path,
    );
    assert.match(
      runtime,
      /!isModelSelectable\(model\)\) return;/,
      path,
    );
    assert.doesNotMatch(runtime, /setMessage\(\s*anyInstallable[\s\S]*当前没有已安装模型/, path);
  }
});

test('ChatTTS non-commercial confirmation digest is passed through the complete install chain', async () => {
  const [catalogSource, installer, standalone] = await Promise.all([
    readFile(`${pluginRoot}/install/catalog.json`, 'utf8'),
    readFile(`${pluginRoot}/install/installer.py`, 'utf8'),
    readFile(`${pluginRoot}/standalone/standalone.js`, 'utf8'),
  ]);
  const catalog = JSON.parse(catalogSource);
  const chattts = catalog.engines.find((engine) => engine.generatorId === 'chattts-local');
  assert.ok(chattts);
  assert.equal(chattts.commercialUse, false);
  const chatModel = chattts.artifacts.find((artifact) => artifact.id === 'chattts-model');
  assert.equal(chatModel.license, 'CC-BY-NC-4.0');
  assert.equal(chatModel.commercialUse, false);
  const woosh = catalog.engines.find((engine) => engine.generatorId === 'woosh-local');
  assert.ok(woosh);
  assert.equal(woosh.license, 'MIT');
  assert.equal(woosh.commercialUse, false);
  assert.deepEqual(
    woosh.artifacts
      .filter((artifact) => artifact.id !== 'woosh-source')
      .map((artifact) => [artifact.id, artifact.license, artifact.commercialUse]),
    [
      ['woosh-dflow', 'CC-BY-NC-4.0', false],
      ['woosh-text-conditioner-a', 'CC-BY-NC-4.0', false],
      ['woosh-ae', 'CC-BY-NC-4.0', false],
      ['woosh-roberta-large', 'MIT', true],
    ],
  );

  assert.match(installer, /"components": \[/);
  assert.match(installer, /computed_acceptance_sha256 = hashlib\.sha256\(/);
  assert.match(installer, /sort_keys=True/);
  assert.match(installer, /"acceptanceSha256": engine\.license\.acceptance_sha256/);
  assert.match(
    installer,
    /matches_digest = acceptance\.get\("acceptanceSha256"\) == engine\.license\.acceptance_sha256/,
  );
  assert.match(installer, /acceptance\.get\("nonCommercialUse"\) is not True/);
  assert.match(standalone, /acceptanceSha256 !== generator\.license\.acceptanceSha256/);
  assert.match(standalone, /licenseId: generator\.license\.id/);
  assert.match(standalone, /accepted: true/);
  assert.match(standalone, /nonCommercialUse: generator\.license\.commercialUse === false/);

  for (const [path, runtime] of await readRuntimes()) {
    const installation = functionSlice(
      runtime,
      'async function installSelectedModel()',
      'function refreshInstallOptions(availability)',
    );
    const confirmation = functionSlice(
      runtime,
      'function safeOfficialLicenseUrl(value)',
      "function setMessage(message, state = '')",
    );
    assert.match(installation, /license\.requiresAcceptance && license\.acceptanceSha256/, path);
    assert.match(installation, /\{ licenseAcceptance: license\.acceptanceSha256 \}/, path);
    assert.match(installation, /await confirmModelInstallation\(label, license\)/, path);
    assert.match(confirmation, /Array\.isArray\(license\.components\)/, path);
    assert.match(
      confirmation,
      /for \(const component of normalizedLicenseComponents\(license\)\)/,
      path,
    );
    assert.match(
      confirmation,
      /component\.commercialUse\s*\? '允许商业使用（仍须遵守条款）'\s*: '仅限非商业用途'/,
      path,
    );
    assert.match(confirmation, /link\.target = '_blank'/, path);
    assert.match(confirmation, /link\.rel = 'noopener noreferrer'/, path);
    assert.match(confirmation, /visibleUrl\.textContent = component\.url/, path);
    assert.match(confirmation, /parsed\.protocol !== 'https:'/i, path);
    assert.doesNotMatch(confirmation, /innerHTML\s*=/, path);
    assert.doesNotMatch(installation, /window\.confirm/, path);
  }
});

test('install copy states official programs plus ModelScope-first weights and refreshes status after success', async () => {
  const catalog = JSON.parse(await readFile(`${pluginRoot}/install/catalog.json`, 'utf8'));
  for (const engine of catalog.engines) {
    for (const artifact of engine.artifacts.filter((item) => item.kind === 'model')) {
      const providers = artifact.sources.map((source) => source.provider);
      if (engine.generatorId === 'woosh-local') {
        if (artifact.id === 'woosh-roberta-large') {
          assert.deepEqual(providers, ['huggingface']);
          assert.equal(
            artifact.sources[0].revision,
            '722cf37b1afa9454edce342e7895e588b6ff1d59',
          );
        } else {
          assert.deepEqual(providers, ['github-release']);
          assert.match(
            artifact.sources[0].url,
            /^https:\/\/github\.com\/SonyResearch\/Woosh\/releases\/download\/v1\.0\.0\//,
          );
        }
      } else if (engine.generatorId === 'chattts-local' || engine.generatorId === 'acestep-xl-local') {
        assert.deepEqual(
          providers,
          ['huggingface'],
          `${engine.generatorId} has no trusted official ModelScope mirror`,
        );
      } else if (providers.includes('huggingface')) {
        assert.deepEqual(providers.slice(0, 2), ['modelscope', 'huggingface']);
      } else {
        assert.equal(providers[0], 'modelscope');
      }
    }
  }

  for (const [path, runtime] of await readRuntimes()) {
    const completion = functionSlice(
      runtime,
      'async function finishInstallStatus(adapter, state)',
      'async function monitorRecoveredInstall(adapter, initialState)',
    );
    assert.match(
      runtime,
      /引导文件、固定源码与模型权重会按清单校验，依赖安装完成后还会执行健康检查；只有全部通过才替换现有模型。/,
      path,
    );
    assert.match(runtime, /'dependencies'/, path);
    assert.match(completion, /state\.status !== 'done' && state\.status !== 'already'/, path);
    assert.match(
      completion,
      /const next = await detectAvailability\(\);\s*const firstInstalled = refreshInstallOptions\(next\);/,
      path,
    );
    assert.match(
      completion,
      /if \(next\[adapter\]\?\.installed\) await selectModel\(adapter, false\);/,
      path,
    );
    assert.match(runtime, /完整安装后才会显示创作工作台/, path);
  }
});

test('install status survives refresh and an active task can be cancelled to a terminal state', async () => {
  const [sandbox, standalone] = await Promise.all([
    readFile('src/services/pluginSandbox.ts', 'utf8'),
    readFile(`${pluginRoot}/standalone/standalone.js`, 'utf8'),
  ]);
  assert.match(
    sandbox,
    /readEngineInstallStatus: \(generatorId\) =>\s*call\('audio\.installStatus', \{ generatorId \}\)/,
  );
  assert.match(
    standalone,
    /readEngineInstallStatus: \(generatorId\) =>\s*jsonRequest\(`\/api\/install\/\$\{encodeURIComponent\(generatorId\)\}\/progress`/,
  );

  for (const [path, runtime] of await readRuntimes()) {
    const recovery = functionSlice(
      runtime,
      'async function restoreInstallStatus()',
      'async function cancelActiveModelInstall()',
    );
    const cancellation = functionSlice(
      runtime,
      'async function cancelActiveModelInstall()',
      'async function installSelectedModel()',
    );
    assert.match(runtime, /id="qa-install-cancel"[^>]*>取消安装<\/button>/, path);
    assert.match(recovery, /typeof api\.readEngineInstallStatus !== 'function'/, path);
    assert.match(recovery, /await api\.readEngineInstallStatus\(generatorId\)/, path);
    assert.match(recovery, /void monitorRecoveredInstall\(active\.adapter, active\.state\)/, path);
    assert.match(runtime, /await restoreInstallStatus\(\)/, path);
    assert.match(cancellation, /await api\.cancelEngineInstall\(generators\[adapter\]\)/, path);
    assert.match(runtime, /if \(status === 'cancelled'\) return `\$\{label\} 安装已取消。`/, path);
    assert.match(runtime, /terminalInstallStatuses\.has\(state\.status\)/, path);
  }
});
