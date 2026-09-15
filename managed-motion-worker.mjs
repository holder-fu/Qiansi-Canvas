import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

export const MANAGED_MOTION_ENGINE_IDS = Object.freeze(['gem-x', 'rtmw3d']);
export const MAX_MANAGED_MOTION_VIDEO_BYTES = 256 * 1024 * 1024;

const ENGINE_IDS = new Set(MANAGED_MOTION_ENGINE_IDS);
const MAX_RESULT_BYTES = 96 * 1024 * 1024;
const MAX_STDIO_BYTES = 1024 * 1024;
const MAX_CAPTURE_RUNTIME_MS = 2 * 60 * 60 * 1000;
const PROBE_TTL_MS = 15_000;
const JOB_RETENTION_MS = 10 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);
const VIDEO_MIME_EXTENSIONS = Object.freeze({
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
});

export const MANAGED_MOTION_ADAPTER_DEFINITIONS = Object.freeze({
  'gem-x': Object.freeze({
    label: 'GEM-X',
    rootEnvironmentVariable: 'QIANSI_GEMX_ROOT',
    pythonEnvironmentVariable: 'QIANSI_GEMX_PYTHON',
    packagedRoot: ['worker-runtime', 'gem-x', 'app', 'GEM-X'],
    packagedPython: {
      win32: ['worker-runtime', 'gem-x', '.venv', 'Scripts', 'python.exe'],
      posix: ['worker-runtime', 'gem-x', '.venv', 'bin', 'python'],
    },
    sourceMarker: ['scripts', 'demo', 'demo_soma.py'],
    adapter: ['worker', 'adapters', 'gem_x_adapter.py'],
    modelFile: ['models', 'gem-x', 'gem_soma.ckpt'],
    jointCount: 77,
    skeleton: 'qiansi-soma-77',
  }),
  rtmw3d: Object.freeze({
    label: 'RTMW3D',
    rootEnvironmentVariable: 'QIANSI_RTMW3D_ROOT',
    pythonEnvironmentVariable: 'QIANSI_RTMW3D_PYTHON',
    detectorEnvironmentVariable: 'QIANSI_RTMW3D_DETECTOR_CHECKPOINT',
    packagedRoot: ['worker-runtime', 'rtmw3d', 'app', 'mmpose'],
    packagedPython: {
      win32: ['worker-runtime', 'rtmw3d', '.venv', 'Scripts', 'python.exe'],
      posix: ['worker-runtime', 'rtmw3d', '.venv', 'bin', 'python'],
    },
    sourceMarker: ['projects', 'rtmpose3d', 'demo', 'body3d_img2pose_demo.py'],
    adapter: ['worker', 'adapters', 'rtmw3d_adapter.py'],
    modelFile: ['models', 'rtmw3d', 'rtmw3d-l_8xb64_cocktail14-384x288-794dbc78_20240626.pth'],
    detectorFile: [
      'worker-runtime',
      'rtmw3d',
      'models',
      'rtmdet_m_8xb32-100e_coco-obj365-person-235e8209.pth',
    ],
    jointCount: 133,
    skeleton: 'qiansi-coco-wholebody-133',
  }),
});

export class ManagedMotionWorkerError extends Error {
  constructor(message, statusCode = 500, code = 'managed_motion_worker_error') {
    super(message);
    this.name = 'ManagedMotionWorkerError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertEngineId(value) {
  const engineId = String(value || '')
    .trim()
    .toLowerCase();
  if (!ENGINE_IDS.has(engineId)) {
    throw new ManagedMotionWorkerError(`不支持的 AI 动作引擎：${engineId || '空'}。`, 400);
  }
  return engineId;
}

function samePath(left, right, platform = process.platform) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function boundedMessage(value, fallback) {
  const message = value instanceof Error ? value.message : String(value || '');
  return (message.trim() || fallback).slice(0, 800);
}

function safeTemporaryDirectory(directory) {
  const parent = resolve(tmpdir());
  const target = resolve(directory);
  const child = relative(parent, target);
  return Boolean(child && !child.startsWith('..') && !child.includes(':'));
}

function assertPluginRoot(projectRoot, pluginRoot, pluginsRoot, platform = process.platform) {
  if (!projectRoot) throw new ManagedMotionWorkerError('AI Motion Worker 缺少项目根目录。');
  const trustedPluginsRoot = pluginsRoot
    ? resolve(pluginsRoot)
    : join(resolve(projectRoot), 'data', 'plugins');
  const canonical = join(trustedPluginsRoot, 'qiansi-motion-capture');
  if (!pluginRoot || !samePath(pluginRoot, canonical, platform)) {
    throw new ManagedMotionWorkerError('AI Motion Worker 只能由受信任的动作捕捉插件使用。', 403);
  }
  return canonical;
}

function pythonCandidates(root, pluginRoot, definition, env, platform) {
  const explicit = String(env[definition.pythonEnvironmentVariable] || '').trim();
  const platformKey = platform === 'win32' ? 'win32' : 'posix';
  const conventional =
    platformKey === 'win32'
      ? [join(root, '.venv', 'Scripts', 'python.exe')]
      : [join(root, '.venv', 'bin', 'python3'), join(root, '.venv', 'bin', 'python')];
  return [
    ...(explicit ? [resolve(explicit)] : []),
    join(pluginRoot, ...definition.packagedPython[platformKey]),
    ...conventional,
  ];
}

export function resolveManagedMotionAdapter(
  engineIdValue,
  {
    projectRoot,
    pluginRoot,
    pluginsRoot,
    env = process.env,
    platform = process.platform,
    definitions = MANAGED_MOTION_ADAPTER_DEFINITIONS,
  } = {},
) {
  const engineId = assertEngineId(engineIdValue);
  const canonicalPluginRoot = assertPluginRoot(projectRoot, pluginRoot, pluginsRoot, platform);
  const definition = definitions[engineId];
  const configuredRoot = String(env[definition.rootEnvironmentVariable] || '').trim();
  const roots = [
    ...(configuredRoot ? [resolve(configuredRoot)] : []),
    join(canonicalPluginRoot, ...definition.packagedRoot),
  ];
  const runtimeRoot = roots.find((candidate) =>
    existsSync(join(candidate, ...definition.sourceMarker)),
  );
  if (!runtimeRoot) {
    throw new ManagedMotionWorkerError(
      `${definition.label} Worker 未安装。请准备官方源码运行环境，或设置 ${definition.rootEnvironmentVariable}。`,
      503,
      'runtime_missing',
    );
  }
  const pythonPath = pythonCandidates(
    runtimeRoot,
    canonicalPluginRoot,
    definition,
    env,
    platform,
  ).find((candidate) => existsSync(candidate));
  if (!pythonPath) {
    throw new ManagedMotionWorkerError(
      `${definition.label} Python 环境不存在。请完成 AI Motion Worker 运行环境安装。`,
      503,
      'python_missing',
    );
  }
  const adapterPath = join(canonicalPluginRoot, ...definition.adapter);
  const modelPath = join(canonicalPluginRoot, ...definition.modelFile);
  if (!existsSync(adapterPath)) {
    throw new ManagedMotionWorkerError(`${definition.label} Worker 适配器缺失。`, 503);
  }
  if (!existsSync(modelPath)) {
    throw new ManagedMotionWorkerError(
      `${definition.label} 模型包尚未安装。`,
      409,
      'model_missing',
    );
  }
  let detectorPath = '';
  if (definition.detectorFile) {
    detectorPath = String(env[definition.detectorEnvironmentVariable] || '').trim();
    if (!detectorPath) detectorPath = join(canonicalPluginRoot, ...definition.detectorFile);
    detectorPath = resolve(detectorPath);
    if (!existsSync(detectorPath)) {
      throw new ManagedMotionWorkerError(
        'RTMW3D 人体检测器尚未安装，Worker 无法执行多人检测。',
        503,
        'detector_missing',
      );
    }
  }
  return Object.freeze({
    engineId,
    label: definition.label,
    jointCount: definition.jointCount,
    skeleton: definition.skeleton,
    command: pythonPath,
    adapterPath,
    runtimeRoot,
    modelPath,
    detectorPath,
    cwd: runtimeRoot,
    env: {
      ...env,
      PYTHONUTF8: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
}

function finite(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ManagedMotionWorkerError(`${label}无效。`, 502, 'invalid_result');
  }
  return number;
}

function normalizeLandmarks(value, jointCount, label) {
  if (!Array.isArray(value) || value.length !== jointCount) {
    throw new ManagedMotionWorkerError(
      `${label}必须包含 ${jointCount} 个关节点。`,
      502,
      'invalid_result',
    );
  }
  return value.map((landmark, index) => {
    if (!landmark || typeof landmark !== 'object' || Array.isArray(landmark)) {
      throw new ManagedMotionWorkerError(`${label}第 ${index + 1} 个关节点无效。`, 502);
    }
    return {
      x: finite(landmark.x, -100, 100, `${label} X 坐标`),
      y: finite(landmark.y, -100, 100, `${label} Y 坐标`),
      z: finite(landmark.z, -100, 100, `${label} Z 坐标`),
      visibility: finite(landmark.visibility, 0, 1, `${label}可见度`),
    };
  });
}

export function normalizeManagedMotionCaptureResult(value, expected = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回的数据无效。', 502);
  }
  const engineId = assertEngineId(value.engineId);
  if (expected.engineId && engineId !== expected.engineId) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回了错误的引擎结果。', 502);
  }
  const definition = MANAGED_MOTION_ADAPTER_DEFINITIONS[engineId];
  const coordinateConvention = value.coordinateConvention;
  const landmarkConvention = value.landmarkConvention;
  if (
    engineId === 'rtmw3d' &&
    coordinateConvention !== undefined &&
    coordinateConvention !== 'qiansi-camera-relative-y-down-v1'
  ) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回的三维坐标约定无效。', 502);
  }
  if (
    engineId === 'rtmw3d' &&
    landmarkConvention !== undefined &&
    landmarkConvention !== 'qiansi-screen-normalized-v1'
  ) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回的画面坐标约定无效。', 502);
  }
  const jointCount = Number(value.jointCount);
  if (jointCount !== definition.jointCount) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回的关节点数量不匹配。', 502);
  }
  if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 1350) {
    throw new ManagedMotionWorkerError('AI Motion Worker 返回的帧数无效。', 502);
  }
  const maximumPoses = Number(expected.maxPoses) || (engineId === 'gem-x' ? 1 : 4);
  let previousTimestamp = -1;
  const frames = value.frames.map((frame, frameIndex) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new ManagedMotionWorkerError(`AI 动作第 ${frameIndex + 1} 帧无效。`, 502);
    }
    const timestampMs = finite(frame.timestampMs, 0, 91_000, 'AI 动作帧时间戳');
    if (timestampMs < previousTimestamp) {
      throw new ManagedMotionWorkerError('AI 动作帧时间戳没有按顺序排列。', 502);
    }
    previousTimestamp = timestampMs;
    if (!Array.isArray(frame.people) || frame.people.length > maximumPoses) {
      throw new ManagedMotionWorkerError('AI 动作帧人物数量超出请求上限。', 502);
    }
    const trackIds = new Set();
    const people = frame.people.map((person, personIndex) => {
      if (!person || typeof person !== 'object' || Array.isArray(person)) {
        throw new ManagedMotionWorkerError('AI 动作人物数据无效。', 502);
      }
      const trackId = finite(person.trackId, 1, 10_000, 'AI 动作人物轨迹 ID');
      if (!Number.isInteger(trackId) || trackIds.has(trackId)) {
        throw new ManagedMotionWorkerError('AI 动作人物轨迹 ID 无效或重复。', 502);
      }
      trackIds.add(trackId);
      return {
        trackId,
        confidence: finite(person.confidence, 0, 1, 'AI 动作人物置信度'),
        landmarks: normalizeLandmarks(
          person.landmarks,
          jointCount,
          `第 ${frameIndex + 1} 帧第 ${personIndex + 1} 人二维关节点`,
        ),
        worldLandmarks: normalizeLandmarks(
          person.worldLandmarks,
          jointCount,
          `第 ${frameIndex + 1} 帧第 ${personIndex + 1} 人三维关节点`,
        ),
      };
    });
    return {
      timestampMs,
      detected: people.length > 0,
      confidence: people.length
        ? people.reduce((sum, person) => sum + person.confidence, 0) / people.length
        : 0,
      people,
    };
  });
  return Object.freeze({
    schemaVersion: 1,
    engineId,
    model: String(value.model || definition.label).slice(0, 120),
    skeleton: definition.skeleton,
    jointCount,
    ...(engineId === 'rtmw3d' && coordinateConvention ? { coordinateConvention } : {}),
    ...(engineId === 'rtmw3d' && landmarkConvention ? { landmarkConvention } : {}),
    sampleFps: finite(value.sampleFps, 1, 120, 'AI 动作采样率'),
    frames,
  });
}

function snapshot(job) {
  return Object.freeze({
    jobId: job.jobId,
    engineId: job.engineId,
    status: job.status,
    phase: job.phase,
    message: job.message,
    progress: job.progress,
    completedFrames: job.completedFrames,
    totalFrames: job.totalFrames,
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  });
}

function videoExtension(fileName, mimeType) {
  const suffix = extname(String(fileName || '')).toLowerCase();
  if (['.mp4', '.webm', '.mov'].includes(suffix)) return suffix;
  return VIDEO_MIME_EXTENSIONS[mimeType] || '.mp4';
}

function parseProtocolLine(job, line) {
  if (line.startsWith('QIMC_PROGRESS ')) {
    let progress;
    try {
      progress = JSON.parse(line.slice('QIMC_PROGRESS '.length));
    } catch {
      return;
    }
    job.phase = String(progress.phase || job.phase).slice(0, 80);
    job.message = String(progress.message || job.message).slice(0, 500);
    job.progress = Math.max(0, Math.min(100, Number(progress.progress) || 0));
    job.completedFrames = Math.max(0, Math.floor(Number(progress.completedFrames) || 0));
    job.totalFrames = Math.max(0, Math.floor(Number(progress.totalFrames) || job.totalFrames || 0));
    job.updatedAt = new Date().toISOString();
  }
}

export class ManagedMotionWorkerPool {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot;
    this.pluginRoot = options.pluginRoot;
    this.pluginsRoot = options.pluginsRoot;
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.spawnImpl = options.spawnImpl || spawn;
    this.resolveAdapter =
      options.resolveAdapter ||
      ((engineId) =>
        resolveManagedMotionAdapter(engineId, {
          projectRoot: this.projectRoot,
          pluginRoot: this.pluginRoot,
          pluginsRoot: this.pluginsRoot,
          env: this.env,
          platform: this.platform,
        }));
    this.jobs = new Map();
    this.activeJob = null;
    this.probeCache = new Map();
  }

  async probe(engineIdValue) {
    const engineId = assertEngineId(engineIdValue);
    const cached = this.probeCache.get(engineId);
    if (cached && Date.now() - cached.checkedAt < PROBE_TTL_MS) return cached.value;
    const startedAt = Date.now();
    let adapter;
    try {
      adapter = this.resolveAdapter(engineId);
      const result = await this.#runProbe(adapter);
      const value = Object.freeze({
        available: result.ready === true,
        availability: result.ready === true ? 'ready' : 'runtime-required',
        backend: String(result.backend || adapter.label).slice(0, 120),
        message: String(result.message || '').slice(0, 500),
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      this.probeCache.set(engineId, { checkedAt: Date.now(), value });
      return value;
    } catch (error) {
      const value = Object.freeze({
        available: false,
        availability: 'runtime-required',
        backend: adapter?.label || engineId,
        message: boundedMessage(error, 'AI Motion Worker 不可用。'),
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      this.probeCache.set(engineId, { checkedAt: Date.now(), value });
      return value;
    }
  }

  invalidateProbe(engineIdValue) {
    this.probeCache.delete(assertEngineId(engineIdValue));
  }

  async #runProbe(adapter) {
    return new Promise((resolvePromise, rejectPromise) => {
      const args = [
        '-u',
        adapter.adapterPath,
        '--probe',
        '--runtime-root',
        adapter.runtimeRoot,
        '--model',
        adapter.modelPath,
        ...(adapter.detectorPath ? ['--detector', adapter.detectorPath] : []),
      ];
      const child = this.spawnImpl(adapter.command, args, {
        cwd: adapter.cwd,
        env: adapter.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) rejectPromise(error);
        else resolvePromise(value);
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(new ManagedMotionWorkerError(`${adapter.label} Worker 健康检查超时。`, 504));
      }, 30_000);
      timeout.unref?.();
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout = `${stdout}${chunk}`.slice(-MAX_STDIO_BYTES);
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4_000);
      });
      child.once('error', (error) => finish(error));
      child.once('exit', (code) => {
        if (code !== 0) {
          finish(
            new ManagedMotionWorkerError(
              boundedMessage(stderr, `${adapter.label} Worker 健康检查失败。`),
              503,
            ),
          );
          return;
        }
        const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith('QIMC_RESULT '));
        if (!line) {
          finish(new ManagedMotionWorkerError(`${adapter.label} Worker 未返回健康状态。`, 502));
          return;
        }
        try {
          finish(null, JSON.parse(line.slice('QIMC_RESULT '.length)));
        } catch {
          finish(new ManagedMotionWorkerError(`${adapter.label} Worker 健康状态无效。`, 502));
        }
      });
    });
  }

  async startCapture(engineIdValue, request) {
    const engineId = assertEngineId(engineIdValue);
    if (this.activeJob && !TERMINAL_STATUSES.has(this.activeJob.status)) {
      throw new ManagedMotionWorkerError(
        `${this.activeJob.engineId} 当前正在捕捉。为避免显存耗尽，同一时间只能运行一个 AI 动作任务。`,
        409,
      );
    }
    if (!Buffer.isBuffer(request.bytes) || request.bytes.length < 1) {
      throw new ManagedMotionWorkerError('AI 动作任务没有有效视频数据。', 400);
    }
    if (request.bytes.length > MAX_MANAGED_MOTION_VIDEO_BYTES) {
      throw new ManagedMotionWorkerError('AI 动作视频不能超过 256 MB。', 413);
    }
    const adapter = this.resolveAdapter(engineId);
    const workDirectory = await mkdtemp(join(tmpdir(), `qiansi-motion-${engineId}-`));
    if (!safeTemporaryDirectory(workDirectory)) {
      throw new ManagedMotionWorkerError('无法创建安全的 AI 动作临时目录。');
    }
    const inputPath = join(
      workDirectory,
      `input${videoExtension(request.fileName, request.mimeType)}`,
    );
    const outputPath = join(workDirectory, 'motion-result.json');
    await writeFile(inputPath, request.bytes);
    const now = new Date().toISOString();
    const job = {
      jobId: randomUUID(),
      engineId,
      adapter,
      request,
      workDirectory,
      inputPath,
      outputPath,
      status: 'queued',
      phase: 'queued',
      message: `正在启动 ${adapter.label} Worker…`,
      progress: 0,
      completedFrames: 0,
      totalFrames: Math.min(
        1350,
        Math.max(1, Math.floor(Number(request.durationSeconds) * Number(request.sampleFps)) + 1),
      ),
      error: null,
      result: null,
      child: null,
      startedAt: now,
      updatedAt: now,
      expiresAt: Date.now() + JOB_RETENTION_MS,
    };
    this.jobs.set(job.jobId, job);
    this.activeJob = job;
    void this.#runCapture(job);
    return snapshot(job);
  }

  async #runCapture(job) {
    const args = [
      '-u',
      job.adapter.adapterPath,
      '--runtime-root',
      job.adapter.runtimeRoot,
      '--model',
      job.adapter.modelPath,
      '--input',
      job.inputPath,
      '--output',
      job.outputPath,
      '--sample-fps',
      String(job.request.sampleFps),
      '--max-poses',
      String(job.request.maxPoses),
      '--confidence',
      String(job.request.confidenceThreshold),
      '--smoothing',
      String(job.request.smoothing),
      ...(job.adapter.detectorPath ? ['--detector', job.adapter.detectorPath] : []),
      ...(job.engineId === 'gem-x' && job.request.staticCamera ? ['--static-camera'] : []),
      ...(job.engineId === 'rtmw3d'
        ? [
            '--detection-threshold',
            String(job.request.detectionThreshold),
            '--tracking-method',
            String(job.request.trackingMethod),
            '--tracking-threshold',
            String(job.request.trackingThreshold),
          ]
        : []),
    ];
    job.status = 'running';
    job.phase = 'loading';
    job.message = `正在载入 ${job.adapter.label}…`;
    job.updatedAt = new Date().toISOString();
    let stderr = '';
    let stdout = '';
    try {
      const exitCode = await new Promise((resolvePromise, rejectPromise) => {
        const child = this.spawnImpl(job.adapter.command, args, {
          cwd: job.adapter.cwd,
          env: job.adapter.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        job.child = child;
        const executionTimer = setTimeout(() => {
          job.timedOut = true;
          if (child.exitCode === null && !child.killed) child.kill();
        }, MAX_CAPTURE_RUNTIME_MS);
        executionTimer.unref?.();
        const finish = (callback, value) => {
          clearTimeout(executionTimer);
          callback(value);
        };
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdout = `${stdout}${chunk}`;
          if (stdout.length > MAX_STDIO_BYTES) stdout = stdout.slice(-MAX_STDIO_BYTES);
          const lines = stdout.split(/\r?\n/);
          stdout = lines.pop() || '';
          for (const line of lines) parseProtocolLine(job, line.trim());
        });
        child.stderr.on('data', (chunk) => {
          stderr = `${stderr}${chunk}`.slice(-8_000);
        });
        child.once('error', (error) => finish(rejectPromise, error));
        child.once('exit', (code) => finish(resolvePromise, code));
      });
      if (job.status === 'cancelled') return;
      if (job.timedOut) {
        throw new ManagedMotionWorkerError(
          `${job.adapter.label} 捕捉超过两小时，任务已停止。`,
          504,
        );
      }
      if (exitCode !== 0) {
        throw new ManagedMotionWorkerError(
          boundedMessage(stderr, `${job.adapter.label} Worker 执行失败。`),
          502,
        );
      }
      const metadata = await stat(job.outputPath);
      if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_RESULT_BYTES) {
        throw new ManagedMotionWorkerError('AI Motion Worker 结果文件大小无效。', 502);
      }
      const raw = JSON.parse(await readFile(job.outputPath, 'utf8'));
      job.result = normalizeManagedMotionCaptureResult(raw, {
        engineId: job.engineId,
        maxPoses: job.request.maxPoses,
      });
      job.status = 'done';
      job.phase = 'ready';
      job.message = `${job.adapter.label} 捕捉完成。`;
      job.progress = 100;
      job.completedFrames = job.result.frames.length;
    } catch (error) {
      if (job.status !== 'cancelled') {
        job.status = 'error';
        job.phase = 'error';
        job.message = `${job.adapter.label} 捕捉失败。`;
        job.error = boundedMessage(error, job.message);
      }
    } finally {
      job.child = null;
      job.updatedAt = new Date().toISOString();
      job.expiresAt = Date.now() + JOB_RETENTION_MS;
      if (this.activeJob === job) this.activeJob = null;
      this.#prune();
    }
  }

  status(jobIdValue, expectedEngineId) {
    const job = this.#job(jobIdValue, expectedEngineId);
    return snapshot(job);
  }

  result(jobIdValue, expectedEngineId) {
    const job = this.#job(jobIdValue, expectedEngineId);
    if (job.status !== 'done' || !job.result) {
      throw new ManagedMotionWorkerError('AI 动作任务尚未完成。', 409);
    }
    return job.result;
  }

  async cancel(jobIdValue, expectedEngineId) {
    const job = this.#job(jobIdValue, expectedEngineId);
    if (TERMINAL_STATUSES.has(job.status)) return snapshot(job);
    job.status = 'cancelled';
    job.phase = 'cancelled';
    job.message = 'AI 动作捕捉已取消。';
    job.error = null;
    job.updatedAt = new Date().toISOString();
    if (job.child && job.child.exitCode === null && !job.child.killed) job.child.kill();
    if (this.activeJob === job) this.activeJob = null;
    await this.#cleanup(job);
    return snapshot(job);
  }

  async stopAll() {
    await Promise.all(
      [...this.jobs.values()].map(async (job) => {
        if (!TERMINAL_STATUSES.has(job.status)) await this.cancel(job.jobId).catch(() => undefined);
        await this.#cleanup(job);
      }),
    );
  }

  isCapturing() {
    return Boolean(this.activeJob && !TERMINAL_STATUSES.has(this.activeJob.status));
  }

  #job(jobIdValue, expectedEngineId) {
    const jobId = String(jobIdValue || '')
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) {
      throw new ManagedMotionWorkerError('AI 动作任务 ID 无效。', 400);
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new ManagedMotionWorkerError('AI 动作任务不存在或已过期。', 404);
    if (expectedEngineId != null && job.engineId !== assertEngineId(expectedEngineId)) {
      throw new ManagedMotionWorkerError('AI 动作任务与请求引擎不匹配。', 409);
    }
    return job;
  }

  async #cleanup(job) {
    if (!job.workDirectory || !safeTemporaryDirectory(job.workDirectory)) return;
    const directory = job.workDirectory;
    job.workDirectory = '';
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }

  #prune() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs) {
      if (!TERMINAL_STATUSES.has(job.status) || job.expiresAt > now) continue;
      this.jobs.delete(jobId);
      void this.#cleanup(job);
    }
  }
}
