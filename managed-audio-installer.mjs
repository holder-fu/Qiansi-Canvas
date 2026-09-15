import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const QIANSI_AUDIO_PLUGIN_ID = 'qiansi-audio';
export const QIANSI_AUDIO_GENERATOR_IDS = Object.freeze([
  'qwen3-tts-local',
  'voxcpm2-local',
  'cosyvoice3-local',
  'chattts-local',
  'woosh-local',
  'acestep-xl-local',
]);

const GENERATOR_IDS = new Set(QIANSI_AUDIO_GENERATOR_IDS);
const ACCEPTANCE_SHA256_RE = /^[a-f0-9]{64}$/;
const OPERATION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const INSTALL_OPERATION_ID_RE = /^[a-f0-9]{32}$/;
const BOOTSTRAP_MARKER = 'QIAS_CONTROLLER_READY ';
const CONTROL_OUTPUT_LIMIT = 128 * 1024;
const PROGRESS_LINE_LIMIT = 64 * 1024;
const STDERR_LIMIT = 4 * 1024;
const CONTROL_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALLER_CONTROL_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 5_000;
const SUCCESS_INSTALL_STATUSES = new Set(['done', 'already']);
const GENERATOR_PRESENTATION = Object.freeze({
  'qwen3-tts-local': Object.freeze({ label: 'Qwen3-TTS', engine: 'qwen3tts' }),
  'voxcpm2-local': Object.freeze({ label: 'VoxCPM2', engine: 'voxcpm2' }),
  'cosyvoice3-local': Object.freeze({ label: 'CosyVoice 3', engine: 'cosyvoice3' }),
  'chattts-local': Object.freeze({ label: 'ChatTTS', engine: 'chattts' }),
  'woosh-local': Object.freeze({ label: 'Sony Woosh', engine: 'woosh' }),
  'acestep-xl-local': Object.freeze({
    label: 'ACE-Step 1.5 XL Turbo / SFT',
    engine: 'acestep-xl',
  }),
});
const LICENSE_PRESENTATION = Object.freeze({
  MIT: Object.freeze({
    url: 'https://opensource.org/license/mit',
    commercialUse: true,
    notice: '源码或模型组件采用 MIT 许可证。',
  }),
  'Apache-2.0': Object.freeze({
    url: 'https://www.apache.org/licenses/LICENSE-2.0',
    commercialUse: true,
    notice: '源码与模型按 Apache-2.0 授权。',
  }),
  'AGPL-3.0-or-later': Object.freeze({
    url: 'https://www.gnu.org/licenses/agpl-3.0.html',
    commercialUse: true,
    notice: 'ChatTTS 源码与运行组件采用 AGPL-3.0-or-later，分发与修改须遵守相应开源义务。',
  }),
  'CC-BY-NC-4.0': Object.freeze({
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    commercialUse: false,
    notice: '模型权重采用 CC-BY-NC-4.0，仅限非商业用途。',
  }),
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function catalogLicense(engine) {
  const licenseIds = [String(engine?.license || '')];
  for (const artifact of Array.isArray(engine?.artifacts) ? engine.artifacts : []) {
    if (artifact?.kind !== 'model') continue;
    const licenseId = String(artifact.license || '');
    if (!licenseIds.includes(licenseId)) licenseIds.push(licenseId);
  }
  const components = licenseIds.map((id) => {
    const presentation = LICENSE_PRESENTATION[id];
    if (!presentation) {
      throw new ManagedAudioInstallerError(`Installer catalog license is unsupported: ${id}`, 502);
    }
    return {
      id,
      name: id,
      url: presentation.url,
      commercialUse: presentation.commercialUse,
      notice: presentation.notice,
    };
  });
  const commercialUse = components.every((component) => component.commercialUse);
  if (engine?.commercialUse !== commercialUse) {
    throw new ManagedAudioInstallerError('Installer catalog license usage is inconsistent.', 502);
  }
  const id = licenseIds.join(' + ');
  const notice = components
    .map((component) => component.notice)
    .filter(Boolean)
    .join(' ');
  const requiresAcceptance = !commercialUse;
  const payload = {
    id,
    name: id,
    url: components[0].url,
    commercialUse,
    requiresAcceptance,
    notice,
    components: [...components].sort((left, right) =>
      `${left.id}\n${left.url}`.localeCompare(`${right.id}\n${right.url}`),
    ),
  };
  return Object.freeze({
    ...payload,
    acceptanceSha256: createHash('sha256').update(canonicalJson(payload)).digest('hex'),
    components: Object.freeze(payload.components.map((item) => Object.freeze(item))),
  });
}

export class ManagedAudioInstallerError extends Error {
  constructor(message, statusCode = 500, code = 'managed_audio_installer_error') {
    super(message);
    this.name = 'ManagedAudioInstallerError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function installerError(error, fallback, statusCode = 502) {
  if (error instanceof ManagedAudioInstallerError) return error;
  if (error?.name === 'AbortError') return error;
  return new ManagedAudioInstallerError(
    error instanceof Error && error.message ? error.message : fallback,
    statusCode,
  );
}

function abortError(message = 'Qiansi Audio installation was cancelled.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function assertPlainOptions(value, allowedKeys, label) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagedAudioInstallerError(`${label} options must be an object.`, 400);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new ManagedAudioInstallerError(`${label} does not accept option: ${key}.`, 400);
    }
  }
  return value;
}

function assertGeneratorId(generatorId) {
  const normalized = String(generatorId || '').trim();
  if (!GENERATOR_IDS.has(normalized)) {
    throw new ManagedAudioInstallerError(
      `Unsupported Qiansi Audio generator: ${normalized || 'empty'}.`,
      400,
    );
  }
  return normalized;
}

function sameResolvedPath(left, right, platform) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function comparablePath(value, platform) {
  const resolved = resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function pathIsInside(root, candidate, platform, allowRoot = false) {
  const normalizedRoot = comparablePath(root, platform);
  const normalizedCandidate = comparablePath(candidate, platform);
  return (
    (allowRoot && normalizedCandidate === normalizedRoot) ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

function resolvedCatalogPath(root, value, platform, allowRoot = false) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null;
  const candidate = resolve(root, value);
  return pathIsInside(root, candidate, platform, allowRoot) ? candidate : null;
}

function existingCatalogDirectory(root, value, platform, allowRoot = false) {
  const candidate = resolvedCatalogPath(root, value, platform, allowRoot);
  if (!candidate) return null;
  try {
    if (!statSync(candidate).isDirectory()) return null;
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    return pathIsInside(realRoot, realCandidate, platform, allowRoot) ? realCandidate : null;
  } catch {
    return null;
  }
}

function existingCatalogFile(root, value, platform, expectedBytes = null) {
  const candidate = resolvedCatalogPath(root, value, platform);
  if (!candidate) return null;
  try {
    const stat = statSync(candidate);
    if (!stat.isFile() || (expectedBytes !== null && stat.size !== expectedBytes)) return null;
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    return pathIsInside(realRoot, realCandidate, platform) ? realCandidate : null;
  } catch {
    return null;
  }
}

function requireFile(path, label) {
  try {
    if (existsSync(path) && statSync(path).isFile()) return;
  } catch {
    // Fall through to the bounded public error below.
  }
  throw new ManagedAudioInstallerError(`${label} is missing: ${path}`, 503);
}

function safeJsonObject(line, label) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ManagedAudioInstallerError(`${label} returned invalid JSON.`, 502);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagedAudioInstallerError(`${label} returned a non-object JSON value.`, 502);
  }
  return value;
}

function boundedMessage(value, fallback) {
  const message = typeof value === 'string' ? value.trim() : '';
  return (message || fallback).slice(0, 1_000);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, milliseconds);
    timer.unref?.();
  });
}

function taskSnapshot(state) {
  if (!state) return null;
  const progress = state.progress && typeof state.progress === 'object' ? state.progress : null;
  const optionalText = (key, maximum = 1_000) => {
    const value = typeof progress?.[key] === 'string' ? progress[key].trim() : '';
    return value ? value.slice(0, maximum) : null;
  };
  const optionalBytes = (key) => {
    const value = progress?.[key];
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  return Object.freeze({
    generatorId: state.generatorId,
    status: state.status,
    phase: optionalText('phase', 64) || state.phase,
    operationId: state.operationId || null,
    message: optionalText('message'),
    completedBytes: optionalBytes('completedBytes'),
    totalBytes: optionalBytes('totalBytes'),
    provider: optionalText('provider', 40),
    artifactId: optionalText('artifactId', 120),
    installed: typeof progress?.installed === 'boolean' ? progress.installed : null,
    error: state.error || null,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  });
}

export function resolveManagedAudioInstaller({
  projectRoot,
  pluginId,
  pluginRoot,
  env = process.env,
  platform = process.platform,
} = {}) {
  if (!projectRoot) {
    throw new ManagedAudioInstallerError('Managed audio installer requires projectRoot.', 500);
  }
  if (platform !== 'win32') {
    throw new ManagedAudioInstallerError(
      'Qiansi Audio one-click installation currently requires Windows x64.',
      503,
    );
  }
  if (pluginId !== QIANSI_AUDIO_PLUGIN_ID) {
    throw new ManagedAudioInstallerError(
      `Managed audio installation is restricted to ${QIANSI_AUDIO_PLUGIN_ID}.`,
      403,
    );
  }

  const canonicalPluginRoot = join(resolve(projectRoot), 'data', 'plugins', QIANSI_AUDIO_PLUGIN_ID);
  if (!pluginRoot || !sameResolvedPath(pluginRoot, canonicalPluginRoot, platform)) {
    throw new ManagedAudioInstallerError(
      `Qiansi Audio must use the canonical plugin directory: ${canonicalPluginRoot}`,
      403,
    );
  }

  const systemRoot = String(env.SystemRoot || env.SYSTEMROOT || '').trim();
  if (!systemRoot) {
    throw new ManagedAudioInstallerError('Windows SystemRoot is unavailable.', 503);
  }
  const powershellPath = join(
    resolve(systemRoot),
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const bootstrapPath = join(canonicalPluginRoot, 'controller', 'bootstrap.ps1');
  const controllerPythonPath = join(
    canonicalPluginRoot,
    'controller',
    'runtime',
    'python',
    'python.exe',
  );
  const installerPath = join(canonicalPluginRoot, 'install', 'installer.py');
  requireFile(powershellPath, 'Windows PowerShell');
  requireFile(bootstrapPath, 'Qiansi Audio controller bootstrap');
  requireFile(installerPath, 'Qiansi Audio fixed-catalog installer');

  return Object.freeze({
    pluginId: QIANSI_AUDIO_PLUGIN_ID,
    pluginRoot: canonicalPluginRoot,
    powershellPath,
    bootstrapPath,
    controllerPythonPath,
    installerPath,
  });
}

export class ManagedAudioInstallerManager {
  constructor(options = {}) {
    const allowed = new Set([
      'projectRoot',
      'pluginId',
      'pluginRoot',
      'env',
      'platform',
      'spawnImpl',
    ]);
    assertPlainOptions(options, allowed, 'ManagedAudioInstallerManager');
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.context = resolveManagedAudioInstaller({
      projectRoot: options.projectRoot,
      pluginId: options.pluginId,
      pluginRoot: options.pluginRoot,
      env: this.env,
      platform: this.platform,
    });
    this.spawnImpl = options.spawnImpl || spawn;
    this.active = new Map();
    this.tasks = new Map();
    this.removals = new Map();
  }

  async catalog(options = {}) {
    const normalized = assertPlainOptions(options, new Set(['signal']), 'catalog');
    if (!existsSync(this.context.controllerPythonPath)) {
      const unpublished = this.#readUnpublishedCatalogWithoutController();
      if (unpublished) return unpublished;
    }
    const pythonPath = await this.#ensureController(normalized.signal);
    return this.#loadCatalog(pythonPath, normalized.signal);
  }

  #readUnpublishedCatalogWithoutController() {
    const catalogPath = join(this.context.pluginRoot, 'install', 'catalog.json');
    let catalog;
    try {
      catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    } catch (error) {
      throw new ManagedAudioInstallerError(
        `Installer catalog cannot be read: ${error instanceof Error ? error.message : 'invalid JSON'}`,
        502,
      );
    }
    if (
      !catalog ||
      typeof catalog !== 'object' ||
      Array.isArray(catalog) ||
      catalog.schemaVersion !== 1 ||
      !catalog.coreRelease ||
      typeof catalog.coreRelease !== 'object'
    ) {
      throw new ManagedAudioInstallerError('Installer catalog is invalid.', 502);
    }
    if (catalog.coreRelease.published === true) return null;
    if (catalog.coreRelease.published !== false || !Array.isArray(catalog.engines)) {
      throw new ManagedAudioInstallerError('Installer catalog publication state is invalid.', 502);
    }
    const ids = catalog.engines.map((item) => String(item?.generatorId || ''));
    if (
      ids.length !== QIANSI_AUDIO_GENERATOR_IDS.length ||
      new Set(ids).size !== ids.length ||
      QIANSI_AUDIO_GENERATOR_IDS.some((id) => !ids.includes(id))
    ) {
      throw new ManagedAudioInstallerError(
        `Installer catalog does not contain exactly ${QIANSI_AUDIO_GENERATOR_IDS.length} trusted generators.`,
        502,
      );
    }
    const reason = 'GitHub Release 核心运行包尚未发布；当前无法一键安装所选模型。';
    const generators = QIANSI_AUDIO_GENERATOR_IDS.map((generatorId) => {
      const presentation = GENERATOR_PRESENTATION[generatorId];
      const engine = catalog.engines.find((item) => item?.generatorId === generatorId);
      const core = Array.isArray(engine?.artifacts)
        ? engine.artifacts.find((item) => item?.kind === 'core')
        : null;
      if (
        !engine ||
        engine.installDirectory !== presentation.engine ||
        !core ||
        core.published !== false
      ) {
        throw new ManagedAudioInstallerError(
          `Installer catalog has an invalid unpublished core for ${generatorId}.`,
          502,
        );
      }
      const engineRoot = join(this.context.pluginRoot, 'engines', presentation.engine);
      return Object.freeze({
        id: generatorId,
        label: presentation.label,
        engine: presentation.engine,
        repoUrl: null,
        repoSubdir: null,
        installed: this.#isUnpublishedEngineInstalled(engineRoot, engine),
        installAvailable: false,
        unavailableReason: reason,
        license: catalogLicense(engine),
      });
    });
    return Object.freeze({
      schemaVersion: 1,
      catalogVersion: String(catalog.catalogId || 'qiansi-audio-unpublished'),
      generators: Object.freeze(generators),
      unpublished: true,
    });
  }

  #isUnpublishedEngineInstalled(engineRoot, engine) {
    const pythonPath = existingCatalogFile(
      engineRoot,
      engine?.entrypoints?.pythonWindows,
      this.platform,
    );
    const workerPath = existingCatalogFile(engineRoot, engine?.entrypoints?.worker, this.platform);
    const expectedWorkerPath = String(engine?.worker?.path || '');
    const expectedWorkerSha256 = String(engine?.worker?.sha256 || '').toLowerCase();
    if (
      !pythonPath ||
      !workerPath ||
      expectedWorkerPath !== engine?.entrypoints?.worker ||
      !ACCEPTANCE_SHA256_RE.test(expectedWorkerSha256) ||
      createHash('sha256').update(readFileSync(workerPath)).digest('hex') !== expectedWorkerSha256
    ) {
      return false;
    }

    const modelArtifacts = Array.isArray(engine?.artifacts)
      ? engine.artifacts.filter((artifact) => artifact?.kind === 'model')
      : [];
    if (!modelArtifacts.length) return false;
    const installRoot = join(this.context.pluginRoot, 'install');
    for (const artifact of modelArtifacts) {
      const snapshotRoot = existingCatalogDirectory(
        engineRoot,
        artifact?.destination,
        this.platform,
        true,
      );
      const manifestPath = existingCatalogFile(installRoot, artifact?.manifest, this.platform);
      if (!snapshotRoot || !manifestPath) return false;
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        return false;
      }
      if (
        !manifest ||
        typeof manifest !== 'object' ||
        Array.isArray(manifest) ||
        manifest.schemaVersion !== 1 ||
        manifest.artifactId !== artifact.id ||
        !Array.isArray(manifest.files) ||
        !manifest.files.length
      ) {
        return false;
      }
      for (const file of manifest.files) {
        if (
          !Number.isSafeInteger(file?.bytes) ||
          file.bytes < 0 ||
          !existingCatalogFile(snapshotRoot, file?.path, this.platform, file.bytes)
        ) {
          return false;
        }
      }
    }
    return true;
  }

  async #loadCatalog(pythonPath, signal) {
    const value = await this.#runInstallerJson(pythonPath, ['catalog', '--json'], signal);
    const generators = Array.isArray(value.generators) ? value.generators : null;
    if (!generators) {
      throw new ManagedAudioInstallerError('Installer catalog omitted generators.', 502);
    }
    const ids = generators.map((item) => String(item?.id || ''));
    if (
      ids.length !== QIANSI_AUDIO_GENERATOR_IDS.length ||
      new Set(ids).size !== ids.length ||
      QIANSI_AUDIO_GENERATOR_IDS.some((id) => !ids.includes(id))
    ) {
      throw new ManagedAudioInstallerError(
        `Installer catalog does not contain exactly ${QIANSI_AUDIO_GENERATOR_IDS.length} trusted generators.`,
        502,
      );
    }
    return value;
  }

  async status(generatorId, options = {}) {
    const id = assertGeneratorId(generatorId);
    const normalized = assertPlainOptions(options, new Set(['signal']), 'status');
    if (!existsSync(this.context.controllerPythonPath)) {
      const catalog = this.#readUnpublishedCatalogWithoutController();
      if (catalog) return this.#readUnpublishedStatusWithoutController(id, catalog);
    }
    const pythonPath = await this.#ensureController(normalized.signal);
    const value = await this.#runInstallerJson(
      pythonPath,
      ['status', '--generator-id', id, '--json'],
      normalized.signal,
    );
    if (value.generatorId && value.generatorId !== id) {
      throw new ManagedAudioInstallerError('Installer status generatorId mismatch.', 502);
    }
    return value;
  }

  #readUnpublishedStatusWithoutController(generatorId, catalog) {
    const generator = catalog.generators.find((item) => item.id === generatorId);
    const statePath = join(
      this.context.pluginRoot,
      'install',
      '.installing',
      'state',
      `${generatorId}.json`,
    );
    if (existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        if (
          state &&
          typeof state === 'object' &&
          !Array.isArray(state) &&
          state.generatorId === generatorId &&
          typeof state.status === 'string'
        ) {
          return state;
        }
      } catch {
        return {
          generatorId,
          status: 'error',
          phase: 'invalid-state',
          message: '模型安装状态损坏，请在安装前修复目录。',
          installed: generator?.installed === true,
        };
      }
    }
    return {
      generatorId,
      status: 'idle',
      phase: 'unavailable',
      message: generator?.unavailableReason || '',
      installed: generator?.installed === true,
    };
  }

  taskStatus(generatorId) {
    const id = assertGeneratorId(generatorId);
    return (
      taskSnapshot(this.tasks.get(id)) ||
      Object.freeze({
        generatorId: id,
        status: 'idle',
        phase: 'idle',
        operationId: null,
        progress: null,
        error: null,
        startedAt: null,
        updatedAt: null,
      })
    );
  }

  isInstalling(generatorId) {
    const id = assertGeneratorId(generatorId);
    return this.active.has(id) || this.removals.has(id);
  }

  async uninstall(generatorId, options = {}) {
    const id = assertGeneratorId(generatorId);
    const normalized = assertPlainOptions(
      options,
      new Set(['signal', 'beforeUninstall']),
      'uninstall',
    );
    if (normalized.signal?.aborted) throw abortError('Uninstall request was aborted.');
    if (
      normalized.beforeUninstall != null &&
      typeof normalized.beforeUninstall !== 'function'
    ) {
      throw new ManagedAudioInstallerError('uninstall beforeUninstall must be a function.', 400);
    }
    if (this.active.size > 0 || this.removals.size > 0) {
      throw new ManagedAudioInstallerError('Another model operation is already active.', 409);
    }
    const state = {
      generatorId: id,
      status: 'removing',
      phase: 'preparing',
      operationId: null,
      progress: null,
      error: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      promise: null,
    };
    this.tasks.set(id, state);
    const task = (async () => {
      try {
        const pythonPath = await this.#ensureController(normalized.signal);
        if (normalized.beforeUninstall) await normalized.beforeUninstall();
        state.phase = 'removing';
        state.updatedAt = new Date().toISOString();
        const result = await this.#runInstallerJson(
          pythonPath,
          ['uninstall', '--generator-id', id, '--json'],
          normalized.signal,
        );
        if (result.generatorId !== id || result.installed !== false) {
          throw new ManagedAudioInstallerError('Installer returned an invalid uninstall result.', 502);
        }
        state.status = String(result.status || 'uninstalled');
        state.phase = String(result.phase || 'complete');
        state.progress = result;
        state.updatedAt = new Date().toISOString();
        return result;
      } catch (error) {
        const failure = installerError(error, `${id} uninstall failed.`);
        state.status = 'error';
        state.phase = 'failed';
        state.error = failure.message.slice(0, 1_000);
        state.updatedAt = new Date().toISOString();
        throw failure;
      } finally {
        this.removals.delete(id);
      }
    })();
    state.promise = task;
    this.removals.set(id, state);
    return task;
  }

  install(generatorId, options = {}) {
    const id = assertGeneratorId(generatorId);
    const normalized = assertPlainOptions(
      options,
      new Set(['signal', 'onProgress', 'licenseAcceptance', 'beforeInstall']),
      'install',
    );
    if (normalized.onProgress != null && typeof normalized.onProgress !== 'function') {
      throw new ManagedAudioInstallerError('install onProgress must be a function.', 400);
    }
    const acceptance = String(normalized.licenseAcceptance || '')
      .trim()
      .toLowerCase();
    if (acceptance && !ACCEPTANCE_SHA256_RE.test(acceptance)) {
      throw new ManagedAudioInstallerError(
        'licenseAcceptance must be the catalog SHA-256 value.',
        400,
      );
    }
    if (normalized.signal != null && typeof normalized.signal.addEventListener !== 'function') {
      throw new ManagedAudioInstallerError('install signal must be an AbortSignal.', 400);
    }
    if (normalized.beforeInstall != null && typeof normalized.beforeInstall !== 'function') {
      throw new ManagedAudioInstallerError('install beforeInstall must be a function.', 400);
    }
    if (this.removals.size > 0) {
      throw new ManagedAudioInstallerError('A model removal is already active.', 409);
    }
    if (this.active.has(id)) {
      throw new ManagedAudioInstallerError(`${id} already has an active installation task.`, 409);
    }

    const now = new Date().toISOString();
    const state = {
      generatorId: id,
      status: 'preparing',
      phase: 'bootstrap',
      operationId: randomBytes(16).toString('hex'),
      progress: null,
      error: null,
      startedAt: now,
      updatedAt: now,
      child: null,
      pythonPath: '',
      cancelRequested: false,
      cancelPromise: null,
      controller: new AbortController(),
      promise: null,
    };
    this.active.set(id, state);
    this.tasks.set(id, state);
    state.promise = this.#executeInstall(state, {
      signal: normalized.signal,
      onProgress: normalized.onProgress,
      licenseAcceptance: acceptance,
      beforeInstall: normalized.beforeInstall,
    });
    return state.promise;
  }

  async cancel(generatorId, options = {}) {
    const id = assertGeneratorId(generatorId);
    const normalized = assertPlainOptions(options, new Set(['signal']), 'cancel');
    if (normalized.signal?.aborted) throw abortError('Cancel request was aborted.');
    const state = this.active.get(id);
    if (!state) return this.taskStatus(id);
    await this.#requestCancel(state);
    await state.promise.catch(() => {});
    return this.taskStatus(id);
  }

  async stopAll() {
    const states = [...this.active.values()];
    await Promise.all(states.map((state) => this.#requestCancel(state)));
    await Promise.allSettled(states.map((state) => state.promise));
    await Promise.allSettled([...this.removals.values()].map((state) => state.promise));
  }

  async #executeInstall(state, { signal, onProgress, licenseAcceptance, beforeInstall }) {
    const externalAbort = () => {
      void this.#requestCancel(state);
    };
    if (signal?.aborted) externalAbort();
    else signal?.addEventListener('abort', externalAbort, { once: true });

    try {
      state.pythonPath = await this.#ensureController(state.controller.signal);
      if (state.cancelRequested) throw abortError();
      const catalog = await this.#loadCatalog(state.pythonPath, state.controller.signal);
      const generator = catalog.generators.find((item) => item?.id === state.generatorId);
      if (!generator) {
        throw new ManagedAudioInstallerError(
          'Installer catalog omitted the requested generator.',
          502,
        );
      }
      if (generator.installAvailable !== true) {
        throw new ManagedAudioInstallerError(
          boundedMessage(
            generator.unavailableReason,
            `${state.generatorId} installation package is unavailable.`,
          ),
          409,
        );
      }
      if (generator.license?.requiresAcceptance === true) {
        const expectedAcceptance = String(generator.license.acceptanceSha256 || '')
          .trim()
          .toLowerCase();
        if (
          !ACCEPTANCE_SHA256_RE.test(expectedAcceptance) ||
          licenseAcceptance !== expectedAcceptance
        ) {
          throw new ManagedAudioInstallerError(
            `${state.generatorId} requires the exact catalog license acceptance.`,
            412,
          );
        }
      }
      if (beforeInstall) await beforeInstall();
      if (state.cancelRequested) throw abortError();
      state.status = 'running';
      state.phase = 'install';
      state.updatedAt = new Date().toISOString();
      const args = [
        'install',
        '--generator-id',
        state.generatorId,
        '--operation-id',
        state.operationId,
        '--progress-jsonl',
      ];
      if (licenseAcceptance) args.push('--accept-license', licenseAcceptance);
      const progress = await this.#runInstallProcess(state, args, onProgress);
      state.status = String(progress.status || 'done');
      state.phase = String(progress.phase || 'complete');
      state.updatedAt = new Date().toISOString();
      return progress;
    } catch (error) {
      if (state.cancelRequested || error?.name === 'AbortError') {
        state.status = 'cancelled';
        state.phase = 'cancelled';
        state.error = null;
        state.updatedAt = new Date().toISOString();
        throw abortError();
      }
      const failure = installerError(error, `${state.generatorId} installation failed.`);
      state.status = 'error';
      state.phase = 'failed';
      state.error = failure.message.slice(0, 1_000);
      state.updatedAt = new Date().toISOString();
      throw failure;
    } finally {
      signal?.removeEventListener('abort', externalAbort);
      if (this.active.get(state.generatorId) === state) this.active.delete(state.generatorId);
      state.child = null;
    }
  }

  async #requestCancel(state) {
    if (state.cancelPromise) return state.cancelPromise;
    state.cancelRequested = true;
    state.status = 'cancelling';
    state.phase = 'cancelling';
    state.updatedAt = new Date().toISOString();
    state.cancelPromise = (async () => {
      try {
        if (state.child && INSTALL_OPERATION_ID_RE.test(state.operationId)) {
          // The operation id is generated by the trusted host before spawning Python.
          // Wait until the installer has persisted its initial state so an immediate
          // UI cancel cannot race the first JSONL progress line.
          for (let attempt = 0; attempt < 200; attempt += 1) {
            if (state.progress || state.child.exitCode !== null || state.child.killed) break;
            await delay(25);
          }
        }
        if (
          state.pythonPath &&
          state.child?.exitCode === null &&
          INSTALL_OPERATION_ID_RE.test(state.operationId)
        ) {
          await this.#runInstallerJson(
            state.pythonPath,
            ['cancel', '--operation-id', state.operationId],
            undefined,
            CANCEL_TIMEOUT_MS,
          );
        }
      } catch (error) {
        state.error = installerError(error, 'Installer cancellation request failed.').message.slice(
          0,
          1_000,
        );
      } finally {
        // Once Python has issued an operationId it owns an atomic install transaction.
        // Killing it during target/rollback renames can strand the old engine. The
        // persistent cancel flag is checked at every safe boundary; swapping and the
        // post-swap health check are allowed to finish and roll back normally.
        if (!state.child) {
          state.controller.abort();
        }
      }
    })();
    return state.cancelPromise;
  }

  async #ensureController(signal) {
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.context.bootstrapPath,
      '-EnsureOnly',
    ];
    const { stdout } = await this.#runBufferedProcess(
      this.context.powershellPath,
      args,
      signal,
      CONTROL_TIMEOUT_MS,
    );
    const markers = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(BOOTSTRAP_MARKER));
    if (markers.length !== 1) {
      throw new ManagedAudioInstallerError(
        'Controller bootstrap did not return exactly one QIAS_CONTROLLER_READY marker.',
        502,
      );
    }
    const payload = safeJsonObject(
      markers[0].slice(BOOTSTRAP_MARKER.length),
      'Controller bootstrap',
    );
    const pythonPath = typeof payload.python === 'string' ? payload.python : '';
    if (
      payload.ok !== true ||
      !pythonPath ||
      !sameResolvedPath(pythonPath, this.context.controllerPythonPath, this.platform)
    ) {
      throw new ManagedAudioInstallerError(
        'Controller bootstrap returned an untrusted Python path.',
        403,
      );
    }
    requireFile(this.context.controllerPythonPath, 'Qiansi Audio controller Python');
    return this.context.controllerPythonPath;
  }

  async #runInstallerJson(pythonPath, args, signal, timeoutMs = INSTALLER_CONTROL_TIMEOUT_MS) {
    const { stdout, code } = await this.#runBufferedProcess(
      pythonPath,
      ['-I', '-B', '-u', this.context.installerPath, ...args],
      signal,
      timeoutMs,
      true,
    );
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length !== 1 || lines[0].length > PROGRESS_LINE_LIMIT) {
      throw new ManagedAudioInstallerError(
        'Fixed-catalog installer returned an invalid control response.',
        502,
      );
    }
    const value = safeJsonObject(lines[0], 'Fixed-catalog installer');
    if (code !== 0) {
      const statusCode = Number(value.code);
      throw new ManagedAudioInstallerError(
        boundedMessage(value.message, `Fixed-catalog installer exited with code ${code}.`),
        Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 502,
      );
    }
    return value;
  }

  #runInstallProcess(state, args, onProgress) {
    return new Promise((resolvePromise, rejectPromise) => {
      let child;
      try {
        child = this.#spawn(state.pythonPath, [
          '-I',
          '-B',
          '-u',
          this.context.installerPath,
          ...args,
        ]);
      } catch (error) {
        rejectPromise(error);
        return;
      }
      state.child = child;
      let stdoutBuffer = '';
      let stderr = '';
      let settled = false;
      let lastProgress = null;

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        state.controller.signal.removeEventListener('abort', abort);
        if (error) rejectPromise(error);
        else resolvePromise(value);
      };
      const abort = () => {
        if (child.exitCode === null && !child.killed) child.kill();
        finish(abortError());
      };
      const consumeLine = (rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        if (line.length > PROGRESS_LINE_LIMIT) {
          throw new ManagedAudioInstallerError('Installer progress line exceeded its limit.', 502);
        }
        const progress = safeJsonObject(line, 'Installer progress');
        if (progress.generatorId && progress.generatorId !== state.generatorId) {
          throw new ManagedAudioInstallerError('Installer progress generatorId mismatch.', 502);
        }
        if (progress.operationId != null) {
          const operationId = String(progress.operationId);
          if (!OPERATION_ID_RE.test(operationId)) {
            throw new ManagedAudioInstallerError('Installer returned an invalid operationId.', 502);
          }
          if (operationId !== state.operationId) {
            throw new ManagedAudioInstallerError('Installer operationId mismatch.', 502);
          }
        }
        lastProgress = progress;
        state.progress = progress;
        state.phase = String(progress.phase || state.phase || 'install').slice(0, 64);
        state.updatedAt = new Date().toISOString();
        if (onProgress) {
          try {
            onProgress({ ...progress });
          } catch {
            // UI progress observers cannot interrupt the trusted installer process.
          }
        }
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        if (settled) return;
        stdoutBuffer += chunk;
        while (true) {
          const newline = stdoutBuffer.indexOf('\n');
          if (newline < 0) break;
          const line = stdoutBuffer.slice(0, newline);
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          try {
            consumeLine(line);
          } catch (error) {
            if (child.exitCode === null && !child.killed) child.kill();
            finish(error);
            return;
          }
        }
        if (stdoutBuffer.length > PROGRESS_LINE_LIMIT) {
          if (child.exitCode === null && !child.killed) child.kill();
          finish(
            new ManagedAudioInstallerError('Installer progress buffer exceeded its limit.', 502),
          );
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-STDERR_LIMIT);
      });
      child.once('error', (error) => finish(error));
      child.once('exit', (code, exitSignal) => {
        if (settled) return;
        try {
          if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
        } catch (error) {
          finish(error);
          return;
        }
        if (
          code === 0 &&
          lastProgress &&
          SUCCESS_INSTALL_STATUSES.has(String(lastProgress.status || ''))
        ) {
          finish(null, lastProgress);
          return;
        }
        if (state.cancelRequested || state.controller.signal.aborted) {
          finish(abortError());
          return;
        }
        if (code !== 0) {
          const statusCode = Number(lastProgress?.code);
          finish(
            new ManagedAudioInstallerError(
              boundedMessage(
                lastProgress?.message || stderr,
                `Installer exited with ${exitSignal || `code ${code ?? 'unknown'}`}.`,
              ),
              Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
                ? statusCode
                : 502,
            ),
          );
          return;
        }
        finish(
          new ManagedAudioInstallerError(
            'Installer exited successfully without a terminal JSONL progress record.',
            502,
          ),
        );
      });
      if (state.controller.signal.aborted) abort();
      else state.controller.signal.addEventListener('abort', abort, { once: true });
    });
  }

  #runBufferedProcess(command, args, signal, timeoutMs, allowNonZero = false) {
    return new Promise((resolvePromise, rejectPromise) => {
      let child;
      try {
        child = this.#spawn(command, args);
      } catch (error) {
        rejectPromise(error);
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (child.exitCode === null && !child.killed) child.kill();
        finish(
          new ManagedAudioInstallerError('Managed audio installer control process timed out.', 504),
        );
      }, timeoutMs);
      timer.unref?.();
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) rejectPromise(error);
        else resolvePromise(value);
      };
      const abort = () => {
        if (child.exitCode === null && !child.killed) child.kill();
        finish(abortError());
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > CONTROL_OUTPUT_LIMIT) {
          if (child.exitCode === null && !child.killed) child.kill();
          finish(new ManagedAudioInstallerError('Control process output exceeded its limit.', 502));
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-STDERR_LIMIT);
      });
      child.once('error', (error) => finish(error));
      child.once('exit', (code, exitSignal) => {
        if (settled) return;
        if (code !== 0 && !allowNonZero) {
          finish(
            new ManagedAudioInstallerError(
              boundedMessage(
                stderr,
                `Control process exited with ${exitSignal || `code ${code ?? 'unknown'}`}.`,
              ),
              502,
            ),
          );
          return;
        }
        finish(null, { stdout, stderr, code });
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }

  #spawn(command, args) {
    const childEnv = { ...this.env };
    delete childEnv.PYTHONHOME;
    delete childEnv.PYTHONPATH;
    Object.assign(childEnv, {
      PYTHONUTF8: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    });
    return this.spawnImpl(command, args, {
      cwd: this.context.pluginRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      shell: false,
    });
  }
}
