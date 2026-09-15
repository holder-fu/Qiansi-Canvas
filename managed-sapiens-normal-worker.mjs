import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SAPIENS_NORMAL_MODEL_ID = 'sapiens2-normal-0.4b';
export const MAX_SAPIENS_NORMAL_FRAME_BYTES = 2 * 1024 * 1024;

const PROBE_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 120_000;
const FRAME_TIMEOUT_MS = 180_000;
const MAX_PROTOCOL_LINE_BYTES = 12 * 1024 * 1024;

export class ManagedSapiensNormalWorkerError extends Error {
  constructor(message, statusCode = 500, code = 'managed_sapiens_normal_worker_error') {
    super(message);
    this.name = 'ManagedSapiensNormalWorkerError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function samePath(left, right, platform = process.platform) {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function boundedMessage(value, fallback) {
  const message = value instanceof Error ? value.message : String(value || '');
  return (message.trim() || fallback).slice(-800);
}

function assertTrustedPluginRoot({ projectRoot, pluginsRoot, pluginRoot, platform }) {
  if (!projectRoot) throw new ManagedSapiensNormalWorkerError('Sapiens2 Worker 缺少项目根目录。');
  const trustedPluginsRoot = pluginsRoot
    ? resolve(pluginsRoot)
    : join(resolve(projectRoot), 'data', 'plugins');
  const canonical = join(trustedPluginsRoot, 'qiansi-motion-capture');
  if (!pluginRoot || !samePath(pluginRoot, canonical, platform)) {
    throw new ManagedSapiensNormalWorkerError(
      'Sapiens2 Worker 只能由受信任的动作捕捉插件使用。',
      403,
    );
  }
  return canonical;
}

export function resolveManagedSapiensNormalAdapter({
  projectRoot,
  pluginsRoot,
  pluginRoot,
  env = process.env,
  platform = process.platform,
} = {}) {
  const canonicalPluginRoot = assertTrustedPluginRoot({
    projectRoot,
    pluginsRoot,
    pluginRoot,
    platform,
  });
  const packagedRuntime = join(canonicalPluginRoot, 'worker-runtime', SAPIENS_NORMAL_MODEL_ID);
  const configuredRoot = String(env.QIANSI_SAPIENS2_ROOT || '').trim();
  const runtimeRoot = configuredRoot
    ? resolve(configuredRoot)
    : join(packagedRuntime, 'app', 'sapiens2');
  const sourceMarker = join(runtimeRoot, 'sapiens', 'dense', 'src', 'models', '__init__.py');
  if (!existsSync(sourceMarker)) {
    throw new ManagedSapiensNormalWorkerError(
      'Sapiens2 Normal Worker 未安装。请点击模型右侧按钮安装运行环境。',
      503,
      'runtime_missing',
    );
  }
  const configuredPython = String(env.QIANSI_SAPIENS2_PYTHON || '').trim();
  const pythonPath = configuredPython
    ? resolve(configuredPython)
    : platform === 'win32'
      ? join(packagedRuntime, '.venv', 'Scripts', 'python.exe')
      : join(packagedRuntime, '.venv', 'bin', 'python');
  const adapterPath = join(canonicalPluginRoot, 'worker', 'adapters', 'sapiens2_normal_adapter.py');
  const modelPath = join(
    canonicalPluginRoot,
    'models',
    SAPIENS_NORMAL_MODEL_ID,
    'sapiens2_0.4b_normal.safetensors',
  );
  const configPath = join(
    runtimeRoot,
    'sapiens',
    'dense',
    'configs',
    'normal',
    'metasim_render_people',
    'sapiens2_0.4b_normal_metasim_render_people-1024x768.py',
  );
  for (const [path, message, code] of [
    [pythonPath, 'Sapiens2 隔离 Python 环境不存在。', 'python_missing'],
    [adapterPath, 'Sapiens2 Normal Worker 适配器缺失。', 'adapter_missing'],
    [modelPath, 'Sapiens2 Normal 0.4B 模型尚未安装。', 'model_missing'],
    [configPath, 'Sapiens2 Normal 官方 0.4B 配置缺失。', 'config_missing'],
  ]) {
    if (!existsSync(path)) throw new ManagedSapiensNormalWorkerError(message, 503, code);
  }
  return Object.freeze({
    command: pythonPath,
    adapterPath,
    runtimeRoot,
    modelPath,
    configPath,
    cwd: join(runtimeRoot, 'sapiens', 'dense'),
    env: {
      ...env,
      PYTHONUTF8: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
}

function parseResultLine(line, prefix) {
  if (!line.startsWith(prefix)) return null;
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch {
    throw new ManagedSapiensNormalWorkerError('Sapiens2 Worker 返回了无效数据。', 502);
  }
}

export class ManagedSapiensNormalWorkerPool {
  constructor(options = {}) {
    this.options = options;
    this.spawnImpl = options.spawnImpl || spawn;
    this.resolveAdapter =
      options.resolveAdapter || (() => resolveManagedSapiensNormalAdapter(options));
    this.worker = null;
    this.startPromise = null;
    this.probeCache = null;
    this.renderTail = Promise.resolve();
    this.activeRenders = 0;
  }

  invalidateProbe() {
    this.probeCache = null;
  }

  isRendering() {
    return this.activeRenders > 0;
  }

  async probe() {
    if (this.worker?.ready) {
      return Object.freeze({
        available: true,
        availability: 'ready',
        backend: 'Sapiens2 Normal · CUDA',
        message: 'Sapiens2 Normal Worker 已连接。',
        latencyMs: 0,
      });
    }
    if (this.probeCache && Date.now() - this.probeCache.checkedAt < PROBE_TTL_MS) {
      return this.probeCache.value;
    }
    const startedAt = Date.now();
    let adapter;
    try {
      adapter = this.resolveAdapter();
      const result = await this.#runProbe(adapter);
      const value = Object.freeze({
        available: result.ready === true,
        availability: result.ready === true ? 'ready' : 'runtime-required',
        backend: String(result.backend || 'Sapiens2 Normal · CUDA').slice(0, 120),
        message: String(result.message || '').slice(0, 500),
        latencyMs: Date.now() - startedAt,
      });
      this.probeCache = { checkedAt: Date.now(), value };
      return value;
    } catch (error) {
      const value = Object.freeze({
        available: false,
        availability: 'runtime-required',
        backend: 'Sapiens2 Normal',
        message: boundedMessage(error, 'Sapiens2 Normal Worker 不可用。'),
        latencyMs: Date.now() - startedAt,
      });
      this.probeCache = { checkedAt: Date.now(), value };
      return value;
    }
  }

  #spawn(adapter, extraArgs, stdio = ['ignore', 'pipe', 'pipe']) {
    return this.spawnImpl(
      adapter.command,
      [
        '-u',
        adapter.adapterPath,
        ...extraArgs,
        '--runtime-root',
        adapter.runtimeRoot,
        '--config',
        adapter.configPath,
        '--model',
        adapter.modelPath,
      ],
      { cwd: adapter.cwd, env: adapter.env, stdio, windowsHide: true },
    );
  }

  async #runProbe(adapter) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = this.#spawn(adapter, ['--probe']);
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) rejectPromise(error);
        else resolvePromise(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new ManagedSapiensNormalWorkerError('Sapiens2 Worker 健康检查超时。', 504));
      }, PROBE_TIMEOUT_MS);
      timer.unref?.();
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout = `${stdout}${chunk}`.slice(-MAX_PROTOCOL_LINE_BYTES);
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4_000);
      });
      child.once('error', (error) => finish(error));
      child.once('exit', (code) => {
        if (code !== 0) {
          finish(
            new ManagedSapiensNormalWorkerError(
              boundedMessage(stderr, 'Sapiens2 Worker 健康检查失败。'),
              503,
            ),
          );
          return;
        }
        const line = stdout.split(/\r?\n/).find((item) => item.startsWith('QISN_READY '));
        if (!line) {
          finish(new ManagedSapiensNormalWorkerError('Sapiens2 Worker 未返回健康状态。', 502));
          return;
        }
        try {
          finish(null, parseResultLine(line, 'QISN_READY '));
        } catch (error) {
          finish(error);
        }
      });
    });
  }

  async #ensureWorker() {
    if (this.worker?.ready) return this.worker;
    if (this.startPromise) return this.startPromise;
    const adapter = this.resolveAdapter();
    this.startPromise = new Promise((resolvePromise, rejectPromise) => {
      const child = this.#spawn(adapter, ['--serve'], ['pipe', 'pipe', 'pipe']);
      const worker = {
        child,
        ready: false,
        stdout: '',
        stderr: '',
        pending: new Map(),
      };
      this.worker = worker;
      let settled = false;
      const finishStart = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        this.startPromise = null;
        if (error) rejectPromise(error);
        else resolvePromise(worker);
      };
      const rejectPending = (error) => {
        for (const pending of worker.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        worker.pending.clear();
      };
      const consumeLine = (line) => {
        if (!line) return;
        if (line.startsWith('QISN_READY ')) {
          const value = parseResultLine(line, 'QISN_READY ');
          if (value?.ready !== true) {
            finishStart(new ManagedSapiensNormalWorkerError('Sapiens2 Worker 启动状态无效。', 502));
            return;
          }
          worker.ready = true;
          finishStart(null);
          return;
        }
        const isResult = line.startsWith('QISN_RESULT ');
        const isError = line.startsWith('QISN_ERROR ');
        if (!isResult && !isError) return;
        const value = parseResultLine(line, isResult ? 'QISN_RESULT ' : 'QISN_ERROR ');
        const pending = worker.pending.get(String(value?.requestId || ''));
        if (!pending) return;
        worker.pending.delete(String(value.requestId));
        clearTimeout(pending.timer);
        if (isError) {
          pending.reject(
            new ManagedSapiensNormalWorkerError(
              String(value.message || 'Sapiens2 法线帧生成失败。').slice(0, 800),
              502,
            ),
          );
        } else pending.resolve(value);
      };
      const startTimer = setTimeout(() => {
        child.kill();
        finishStart(new ManagedSapiensNormalWorkerError('Sapiens2 模型载入超时。', 504));
      }, START_TIMEOUT_MS);
      startTimer.unref?.();
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        worker.stdout += String(chunk);
        if (Buffer.byteLength(worker.stdout) > MAX_PROTOCOL_LINE_BYTES) {
          child.kill();
          return;
        }
        const lines = worker.stdout.split(/\r?\n/);
        worker.stdout = lines.pop() || '';
        try {
          for (const line of lines) consumeLine(line.trim());
        } catch (error) {
          finishStart(error);
          rejectPending(error);
          child.kill();
        }
      });
      child.stderr.on('data', (chunk) => {
        worker.stderr = `${worker.stderr}${chunk}`.slice(-8_000);
      });
      child.once('error', (error) => {
        finishStart(error);
        rejectPending(error);
      });
      child.once('exit', (code) => {
        const error = new ManagedSapiensNormalWorkerError(
          boundedMessage(
            worker.stderr,
            code === 0 ? 'Sapiens2 Worker 已停止。' : 'Sapiens2 Worker 异常退出。',
          ),
          code === 0 ? 503 : 502,
        );
        worker.ready = false;
        if (this.worker === worker) this.worker = null;
        finishStart(error);
        rejectPending(error);
      });
    });
    return this.startPromise;
  }

  render(request) {
    const run = this.renderTail.then(() => this.#render(request));
    this.renderTail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  async #render(request) {
    if (!Buffer.isBuffer(request?.bytes) || request.bytes.length < 1) {
      throw new ManagedSapiensNormalWorkerError('Sapiens2 输入帧为空。', 400);
    }
    if (request.bytes.length > MAX_SAPIENS_NORMAL_FRAME_BYTES) {
      throw new ManagedSapiensNormalWorkerError('Sapiens2 输入帧不能超过 2 MB。', 413);
    }
    const worker = await this.#ensureWorker();
    const requestId = randomUUID();
    this.activeRenders += 1;
    try {
      const result = await new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          worker.pending.delete(requestId);
          rejectPromise(new ManagedSapiensNormalWorkerError('Sapiens2 单帧推理超时。', 504));
        }, FRAME_TIMEOUT_MS);
        timer.unref?.();
        worker.pending.set(requestId, { resolve: resolvePromise, reject: rejectPromise, timer });
        worker.child.stdin.write(
          `${JSON.stringify({
            requestId,
            imageBase64: request.bytes.toString('base64'),
            timestampMs: request.timestampMs,
          })}\n`,
          'utf8',
          (error) => {
            if (!error) return;
            const pending = worker.pending.get(requestId);
            if (!pending) return;
            worker.pending.delete(requestId);
            clearTimeout(pending.timer);
            pending.reject(error);
          },
        );
      });
      if (
        !result ||
        typeof result !== 'object' ||
        String(result.requestId || '') !== requestId ||
        !Number.isInteger(result.width) ||
        !Number.isInteger(result.height) ||
        result.width < 16 ||
        result.height < 16 ||
        typeof result.imageBase64 !== 'string'
      ) {
        throw new ManagedSapiensNormalWorkerError('Sapiens2 Worker 帧结果无效。', 502);
      }
      const bytes = Buffer.from(result.imageBase64, 'base64');
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
        throw new ManagedSapiensNormalWorkerError('Sapiens2 Worker 帧文件无效。', 502);
      }
      return Object.freeze({
        bytes,
        mimeType: 'image/webp',
        timestampMs: Number(request.timestampMs) || 0,
        width: result.width,
        height: result.height,
        inferenceMs: Math.max(0, Math.round(Number(result.inferenceMs) || 0)),
      });
    } finally {
      this.activeRenders -= 1;
    }
  }

  async stopAll() {
    const worker = this.worker;
    this.worker = null;
    this.startPromise = null;
    if (!worker?.child || worker.child.exitCode !== null) return;
    worker.child.kill();
  }
}
