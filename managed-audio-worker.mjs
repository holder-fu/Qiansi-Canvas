import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parsePluginAudioGenerationRequest, PluginAudioProxyError } from './plugin-audio-proxy.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;

export const MANAGED_AUDIO_ADAPTER_DEFINITIONS = Object.freeze({
  voxcpm2: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'voxcpm2-local',
    label: 'VoxCPM2',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'voxcpm2', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'voxcpm2', 'runtime', 'python', 'python.exe']],
      posix: [
        ['engines', 'voxcpm2', 'runtime', 'python', 'bin', 'python3'],
        ['engines', 'voxcpm2', 'runtime', 'python', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [['service', '.venv', 'Scripts', 'python.exe']],
      posix: [['service', '.venv', 'bin', 'python']],
    }),
    cacheRelativePath: ['engines', 'voxcpm2', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-voxcpm2-',
    outputFileName: 'voxcpm2-output.wav',
    workerSha256: '277257904bb737c4dd68a406b8f27ff27dc730d7c46ec62547eac9434188abc6',
  }),
  chattts: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'chattts-local',
    label: 'ChatTTS',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'chattts', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'chattts', 'runtime', 'python', 'python.exe']],
      posix: [
        ['engines', 'chattts', 'runtime', 'python', 'bin', 'python3'],
        ['engines', 'chattts', 'runtime', 'python', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [
        ['python', 'python.exe'],
        ['service', '.venv', 'Scripts', 'python.exe'],
      ],
      posix: [
        ['python', 'bin', 'python3'],
        ['python', 'bin', 'python'],
        ['service', '.venv', 'bin', 'python'],
      ],
    }),
    cacheRelativePath: ['engines', 'chattts', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-chattts-',
    outputFileName: 'chattts-output.wav',
    workerSha256: '468879aa3f6be032ab0a36c23e22cfb34be0fa141c181e8574560232a362b7db',
  }),
  qwen3tts: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'qwen3-tts-local',
    label: 'Qwen3-TTS',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'qwen3tts', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'qwen3tts', 'runtime', 'python', 'python.exe']],
      posix: [
        ['engines', 'qwen3tts', 'runtime', 'python', 'bin', 'python3'],
        ['engines', 'qwen3tts', 'runtime', 'python', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [['service', '.venv', 'Scripts', 'python.exe']],
      posix: [['service', '.venv', 'bin', 'python']],
    }),
    cacheRelativePath: ['engines', 'qwen3tts', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-qwen3tts-',
    outputFileName: 'qwen3tts-output.wav',
    workerSha256: '42f4a26de57099c4fdd7527fc658ff3b297bc1a51aaa3c9c655c2d565a201493',
  }),
  cosyvoice3: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'cosyvoice3-local',
    label: 'CosyVoice 3',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'cosyvoice3', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'cosyvoice3', 'runtime', 'python', 'python.exe']],
      posix: [
        ['engines', 'cosyvoice3', 'runtime', 'python', 'bin', 'python3'],
        ['engines', 'cosyvoice3', 'runtime', 'python', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [['service', '.venv', 'Scripts', 'python.exe']],
      posix: [['service', '.venv', 'bin', 'python']],
    }),
    cacheRelativePath: ['engines', 'cosyvoice3', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-cosyvoice3-',
    outputFileName: 'cosyvoice3-output.wav',
    workerSha256: '47f381d0c06637b8cf473087d8843947f422ff4143329b9544a223c1af54e251',
  }),
  woosh: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'woosh-local',
    label: 'Sony Woosh',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'woosh', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'woosh', 'runtime', 'app', 'Woosh', '.venv', 'Scripts', 'python.exe']],
      posix: [
        ['engines', 'woosh', 'runtime', 'app', 'Woosh', '.venv', 'bin', 'python3'],
        ['engines', 'woosh', 'runtime', 'app', 'Woosh', '.venv', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [['service', '.venv', 'Scripts', 'python.exe']],
      posix: [['service', '.venv', 'bin', 'python']],
    }),
    cacheRelativePath: ['engines', 'woosh', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-woosh-',
    outputFileName: 'woosh-output.wav',
    workerSha256: '480783edee4793fd81a88deeca6a991183820dd411b08ba170a860695f5c4941',
  }),
  acestepXl: Object.freeze({
    pluginId: 'qiansi-audio',
    generatorId: 'acestep-xl-local',
    label: 'ACE-Step 1.5 XL Turbo / SFT',
    rootEnvironmentVariable: 'QIANSI_AUDIO_ROOT',
    fallbackRelativePath: ['data', 'plugins', 'qiansi-audio'],
    workerRelativePath: ['engines', 'acestep-xl', 'service', 'worker.py'],
    installedPythonRelativePaths: Object.freeze({
      win32: [['engines', 'acestep-xl', 'runtime', 'app', 'ACE-Step-1.5', '.venv', 'Scripts', 'python.exe']],
      posix: [
        ['engines', 'acestep-xl', 'runtime', 'app', 'ACE-Step-1.5', '.venv', 'bin', 'python3'],
        ['engines', 'acestep-xl', 'runtime', 'app', 'ACE-Step-1.5', '.venv', 'bin', 'python'],
      ],
    }),
    developmentPythonRelativePaths: Object.freeze({
      win32: [['service', '.venv', 'Scripts', 'python.exe']],
      posix: [['service', '.venv', 'bin', 'python']],
    }),
    cacheRelativePath: ['engines', 'acestep-xl', 'runtime', 'model-cache'],
    temporaryPrefix: 'qiansi-acestep-xl-',
    outputFileName: 'acestep-xl-output.wav',
    workerSha256: '8e6f841ece2c01e6ff0fb8cf9612b00b22f732052108bf89138eab3594742048',
  }),
});

const WORKER_START_TIMEOUT_MS = 20_000;
const WORKER_STOP_GRACE_MS = 1_000;
const STDERR_LIMIT = 2_000;
const INSTALL_ACTIVE_STATUSES = new Set([
  'pending',
  'downloading',
  'verifying',
  'extracting',
  'validating',
  'swapping',
  'health',
]);

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertInstallerAllowsWorker(root, definition) {
  const transactionPath = join(
    root,
    'engines',
    '.qiansi-install',
    definition.generatorId,
    'transaction.json',
  );
  if (existsSync(transactionPath)) {
    throw new PluginAudioProxyError(
      `${definition.label} 检测到未完成的安装替换，需先由安全安装器恢复后才能启动。`,
      409,
    );
  }
  const stateRoot = join(root, 'install', '.installing', 'state');
  for (const generatorId of [
    'qwen3-tts-local',
    'voxcpm2-local',
    'cosyvoice3-local',
    'chattts-local',
    'woosh-local',
    'acestep-xl-local',
  ]) {
    const statePath = join(stateRoot, `${generatorId}.json`);
    if (!existsSync(statePath)) continue;
    let state;
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      throw new PluginAudioProxyError('模型安装状态损坏，已阻止启动音频引擎。', 409);
    }
    if (INSTALL_ACTIVE_STATUSES.has(state?.status) && processIsAlive(state?.ownerPid)) {
      throw new PluginAudioProxyError('模型正在安装，完成或取消后才能启动音频引擎。', 409);
    }
  }
}

function safeTemporaryDirectory(directory) {
  const parent = resolve(tmpdir());
  const target = resolve(directory);
  const child = relative(parent, target);
  return child && !child.startsWith('..') && !child.includes(':');
}

function workerFailure(error, fallback, statusCode = 502, label = '本机音频') {
  if (error instanceof PluginAudioProxyError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new PluginAudioProxyError(`${label} 生成已取消或超时。`, 504);
  }
  return new PluginAudioProxyError(
    error instanceof Error && error.message ? error.message : fallback,
    statusCode,
  );
}

function wavSignatureMatches(bytes) {
  if (bytes.byteLength < 12) return false;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
}

function adapterDefinition(adapterId, definitions = MANAGED_AUDIO_ADAPTER_DEFINITIONS) {
  const definition = definitions?.[adapterId];
  if (!definition) {
    throw new PluginAudioProxyError(`不支持的宿主管理音频适配器：${adapterId || '空'}。`);
  }
  return definition;
}

function sameResolvedPath(left, right, platform) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function relativeCandidates(root, candidates) {
  return candidates.map((segments) => join(root, ...segments));
}

function workerSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function resolveManagedAudioAdapter(
  adapterId,
  {
    projectRoot,
    pluginId,
    pluginRoot,
    env = process.env,
    platform = process.platform,
    adapterDefinitions = MANAGED_AUDIO_ADAPTER_DEFINITIONS,
  } = {},
) {
  const definition = adapterDefinition(adapterId, adapterDefinitions);
  if (!projectRoot) throw new Error('Managed audio adapter resolution requires projectRoot.');

  const expectedPluginId = definition.pluginId;
  const suppliedPluginId = String(pluginId || '').trim();
  const installedPluginRoot = String(pluginRoot || '').trim();
  if (
    (installedPluginRoot && suppliedPluginId !== expectedPluginId) ||
    (!installedPluginRoot && suppliedPluginId && suppliedPluginId !== expectedPluginId)
  ) {
    throw new PluginAudioProxyError(
      `${definition.label} 适配器只能由 ${expectedPluginId} 插件使用。`,
      403,
    );
  }

  const canonicalPluginRoot = join(resolve(projectRoot), 'data', 'plugins', expectedPluginId);
  if (
    installedPluginRoot &&
    !sameResolvedPath(installedPluginRoot, canonicalPluginRoot, platform)
  ) {
    throw new PluginAudioProxyError(
      `${definition.label} 插件必须安装在 ${canonicalPluginRoot}。`,
      403,
    );
  }

  const configuredRoot = String(env[definition.rootEnvironmentVariable] || '').trim();
  const roots = installedPluginRoot
    ? [resolve(canonicalPluginRoot)]
    : [
        ...(configuredRoot ? [resolve(configuredRoot)] : []),
        join(resolve(projectRoot), ...definition.fallbackRelativePath),
      ];
  for (const root of new Set(roots)) {
    const workerPath = join(root, ...definition.workerRelativePath);
    const platformKey = platform === 'win32' ? 'win32' : 'posix';
    const pythonCandidates = relativeCandidates(
      root,
      installedPluginRoot
        ? definition.installedPythonRelativePaths[platformKey]
        : [
            ...definition.installedPythonRelativePaths[platformKey],
            ...definition.developmentPythonRelativePaths[platformKey],
          ],
    );
    const pythonPath = pythonCandidates.find((candidate) => existsSync(candidate));
    if (pythonPath && existsSync(workerPath)) {
      assertInstallerAllowsWorker(root, definition);
      const expectedWorkerSha256 = String(definition.workerSha256 || '').toLowerCase();
      if (!SHA256_RE.test(expectedWorkerSha256)) {
        throw new PluginAudioProxyError(
          `${definition.label} 受信任 worker 摘要尚未配置，已阻止启动。`,
          503,
        );
      }
      const actualWorkerSha256 = workerSha256(workerPath);
      if (actualWorkerSha256 !== expectedWorkerSha256) {
        throw new PluginAudioProxyError(
          `${definition.label} worker.py 完整性校验失败，已阻止启动。`,
          403,
        );
      }
      const cacheRoot = join(root, ...definition.cacheRelativePath);
      return {
        adapterId,
        pluginId: expectedPluginId,
        label: definition.label,
        root,
        command: pythonPath,
        args: ['-u', workerPath],
        cwd: root,
        temporaryPrefix: definition.temporaryPrefix,
        outputFileName: definition.outputFileName,
        workerSha256: actualWorkerSha256,
        env: {
          ...env,
          PYTHONUTF8: '1',
          PYTHONUNBUFFERED: '1',
          PYTHONNOUSERSITE: '1',
          PYTHONDONTWRITEBYTECODE: '1',
          HF_HOME: env.HF_HOME || join(cacheRoot, 'huggingface'),
          HUGGINGFACE_HUB_CACHE: env.HUGGINGFACE_HUB_CACHE || join(cacheRoot, 'huggingface', 'hub'),
          TORCH_HOME: env.TORCH_HOME || join(cacheRoot, 'torch'),
        },
      };
    }
  }
  const expectedRoot = roots[0];
  throw new PluginAudioProxyError(
    `${definition.label} 插件目录不完整。请确认 ${join(expectedRoot, ...definition.installedPythonRelativePaths[platform === 'win32' ? 'win32' : 'posix'][0])} 和 ${join(expectedRoot, ...definition.workerRelativePath)} 存在。`,
    503,
  );
}

function managedWorkerKey(adapterId, pluginRoot) {
  return `${adapterId}\u0000${pluginRoot ? resolve(pluginRoot) : ''}`;
}

export class ManagedAudioWorkerPool {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot;
    this.adapterDefinitions = options.adapterDefinitions || MANAGED_AUDIO_ADAPTER_DEFINITIONS;
    this.resolveAdapter =
      options.resolveAdapter ||
      ((adapterId, context = {}) =>
        resolveManagedAudioAdapter(adapterId, {
          projectRoot: this.projectRoot,
          pluginId: context.pluginId,
          pluginRoot: context.pluginRoot,
          env: options.env,
          platform: options.platform,
          adapterDefinitions: this.adapterDefinitions,
        }));
    this.spawnImpl = options.spawnImpl || spawn;
    this.workers = new Map();
    this.activeGeneration = null;
  }

  async start(adapterId, options = {}) {
    const key = managedWorkerKey(adapterId, options.pluginRoot);
    const existing = this.workers.get(key);
    if (existing && existing.child.exitCode === null && !existing.child.killed) return existing;

    const definition = this.resolveAdapter(adapterId, {
      pluginId: options.pluginId,
      pluginRoot: options.pluginRoot,
    });
    const label = String(definition.label || adapterId || '本机音频');
    const child = this.spawnImpl(definition.command, definition.args, {
      cwd: definition.cwd,
      env: definition.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    const state = {
      key,
      adapterId,
      pluginId: options.pluginId || definition.pluginId,
      pluginRoot: options.pluginRoot,
      definition,
      label,
      child,
      stdout: '',
      stderr: '',
      pending: new Map(),
      stopping: false,
    };
    this.workers.set(key, state);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.#consumeOutput(state, chunk));
    child.stderr.on('data', (chunk) => {
      state.stderr = `${state.stderr}${chunk}`.slice(-STDERR_LIMIT);
    });
    child.once('error', (error) => this.#workerExited(state, error));
    child.once('exit', (code, signal) => {
      this.#workerExited(
        state,
        state.stopping
          ? undefined
          : new Error(
              `${state.label} 后台进程意外退出（${signal || `code ${code ?? 'unknown'}`}）${state.stderr ? `：${state.stderr.trim()}` : ''}`,
            ),
      );
    });
    try {
      const health = await this.#request(
        state,
        'health',
        {},
        { timeoutMs: WORKER_START_TIMEOUT_MS },
      );
      if (health.ready === false) {
        throw new PluginAudioProxyError(
          String(health.message || `${label} 绿色运行包依赖不完整。`).slice(0, 500),
          503,
        );
      }
      return state;
    } catch (error) {
      this.#terminate(state);
      throw workerFailure(error, `${label} 后台进程启动失败。`, 503, label);
    }
  }

  async probe(adapterId, options = {}) {
    const startedAt = Date.now();
    try {
      const state = await this.start(adapterId, {
        pluginId: options.pluginId,
        pluginRoot: options.pluginRoot,
      });
      const result = await this.#request(state, 'health', {}, { timeoutMs: 5_000 });
      return {
        ok: result.ready !== false,
        status: result.ready === false ? 503 : 200,
        latencyMs: Math.max(0, Date.now() - startedAt),
        ...(result.message ? { message: String(result.message).slice(0, 300) } : {}),
      };
    } catch (error) {
      const label = this.#adapterLabel(adapterId);
      const failure = workerFailure(error, `${label} 后台进程不可用。`, 503, label);
      return {
        ok: false,
        status: failure.statusCode,
        latencyMs: Math.max(0, Date.now() - startedAt),
        message: failure.message,
      };
    }
  }

  async generate(adapterId, request, options = {}) {
    const normalizedRequest = parsePluginAudioGenerationRequest(request);
    const generationToken = this.#reserveGeneration(adapterId);
    let temporaryDirectory = '';
    try {
      await this.#stopOtherAdapters(adapterId);
      const state = await this.start(adapterId, {
        pluginId: options.pluginId,
        pluginRoot: options.pluginRoot,
      });
      if ([...state.pending.values()].some((item) => item.method === 'generate')) {
        throw new PluginAudioProxyError(
          `${state.label} 当前已有生成任务，请等待完成或先取消。`,
          409,
        );
      }
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), state.definition.temporaryPrefix || `qiansi-${adapterId}-`),
      );
      if (!safeTemporaryDirectory(temporaryDirectory)) {
        throw new PluginAudioProxyError(`无法创建安全的 ${state.label} 临时目录。`, 500);
      }
      const outputPath = join(temporaryDirectory, 'output.wav');
      const result = await this.#request(
        state,
        'generate',
        { request: normalizedRequest, outputPath },
        { timeoutMs: options.timeoutMs, signal: options.signal },
      );
      const metadata = await stat(outputPath);
      const maximum = Number(options.maxBytes);
      if (!metadata.isFile() || !Number.isFinite(maximum) || metadata.size > maximum) {
        throw new PluginAudioProxyError(`${state.label} 返回的音频超过插件清单限制。`, 502);
      }
      const bytes = new Uint8Array(await readFile(outputPath));
      if (!wavSignatureMatches(bytes)) {
        throw new PluginAudioProxyError(`${state.label} 返回的文件不是有效 WAV 音频。`, 502);
      }
      const durationSeconds = Number(result.durationSeconds);
      return {
        bytes,
        mimeType: 'audio/wav',
        fileName: state.definition.outputFileName || `${adapterId}-output.wav`,
        ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { durationSeconds } : {}),
      };
    } catch (error) {
      const state = this.workers.get(managedWorkerKey(adapterId, options.pluginRoot));
      if (state && (error?.name === 'AbortError' || error?.name === 'TimeoutError')) {
        this.#terminate(state);
      }
      const label = state?.label || this.#adapterLabel(adapterId);
      throw workerFailure(error, `${label} 生成失败。`, 502, label);
    } finally {
      if (temporaryDirectory && safeTemporaryDirectory(temporaryDirectory)) {
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      }
      if (this.activeGeneration?.token === generationToken) this.activeGeneration = null;
    }
  }

  async stop(adapterId, options = {}) {
    const state = this.workers.get(managedWorkerKey(adapterId, options.pluginRoot));
    if (!state) return;
    state.stopping = true;
    try {
      state.child.stdin.write(`${JSON.stringify({ id: randomUUID(), method: 'shutdown' })}\n`);
    } catch {
      // The worker may already be exiting.
    }
    const timer = setTimeout(() => this.#terminate(state), WORKER_STOP_GRACE_MS);
    timer.unref?.();
    await new Promise((resolvePromise) => {
      if (state.child.exitCode !== null || state.child.killed) {
        resolvePromise();
        return;
      }
      state.child.once('exit', resolvePromise);
      setTimeout(resolvePromise, WORKER_STOP_GRACE_MS + 250).unref?.();
    });
    clearTimeout(timer);
    this.#terminate(state);
  }

  async stopAll() {
    await Promise.all(
      [...this.workers.values()].map((state) =>
        this.stop(state.adapterId, { pluginRoot: state.pluginRoot }),
      ),
    );
  }

  isGenerating() {
    return this.activeGeneration !== null;
  }

  #adapterLabel(adapterId) {
    return String(this.adapterDefinitions?.[adapterId]?.label || adapterId || '本机音频');
  }

  #reserveGeneration(adapterId) {
    if (this.activeGeneration) {
      throw new PluginAudioProxyError(
        `${this.activeGeneration.label} 当前正在生成。为避免显存不足，同一时间只能运行一个本机音频模型。`,
        409,
      );
    }
    const token = {};
    this.activeGeneration = { token, adapterId, label: this.#adapterLabel(adapterId) };
    return token;
  }

  async #stopOtherAdapters(adapterId) {
    const otherWorkers = [...this.workers.values()].filter(
      (state) => state.adapterId !== adapterId,
    );
    await Promise.all(
      otherWorkers.map((state) =>
        this.stop(state.adapterId, {
          pluginId: state.pluginId,
          pluginRoot: state.pluginRoot,
        }),
      ),
    );
  }

  #consumeOutput(state, chunk) {
    state.stdout += chunk;
    if (state.stdout.length > 1024 * 1024) {
      this.#terminate(state, new Error(`${state.label} 后台进程返回了过长的控制消息。`));
      return;
    }
    while (true) {
      const newline = state.stdout.indexOf('\n');
      if (newline < 0) return;
      const line = state.stdout.slice(0, newline).trim();
      state.stdout = state.stdout.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.#terminate(state, new Error(`${state.label} 后台进程返回了无效控制消息。`));
        return;
      }
      const pending = state.pending.get(String(message.id || ''));
      if (!pending) continue;
      state.pending.delete(message.id);
      pending.cleanup();
      if (message.ok === true) pending.resolve(message.result || {});
      else
        pending.reject(
          new PluginAudioProxyError(
            String(message.error?.message || `${state.label} 后台进程执行失败。`).slice(0, 500),
            502,
          ),
        );
    }
  }

  #request(state, method, payload, { timeoutMs = 120_000, signal } = {}) {
    if (state.child.exitCode !== null || state.child.killed) {
      return Promise.reject(new PluginAudioProxyError(`${state.label} 后台进程没有运行。`, 503));
    }
    const id = randomUUID();
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(
        () => {
          state.pending.delete(id);
          cleanup();
          const error = new DOMException(`${state.label} request timed out.`, 'TimeoutError');
          rejectPromise(error);
          this.#terminate(state, error);
        },
        Math.max(1_000, Number(timeoutMs) || 120_000),
      );
      timeout.unref?.();
      const abort = () => {
        state.pending.delete(id);
        cleanup();
        const error = new DOMException(`${state.label} request aborted.`, 'AbortError');
        rejectPromise(error);
        this.#terminate(state, error);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      state.pending.set(id, {
        method,
        resolve: resolvePromise,
        reject: rejectPromise,
        cleanup,
      });
      try {
        state.child.stdin.write(`${JSON.stringify({ id, method, ...payload })}\n`);
      } catch (error) {
        state.pending.delete(id);
        cleanup();
        rejectPromise(error);
      }
    });
  }

  #workerExited(state, error) {
    if (this.workers.get(state.key) === state) this.workers.delete(state.key);
    for (const pending of state.pending.values()) {
      pending.cleanup();
      pending.reject(error || new PluginAudioProxyError(`${state.label} 后台进程已停止。`, 503));
    }
    state.pending.clear();
  }

  #terminate(state, error) {
    if (!state) return;
    state.stopping = true;
    this.#workerExited(state, error);
    if (state.child.exitCode === null && !state.child.killed) state.child.kill();
  }
}
