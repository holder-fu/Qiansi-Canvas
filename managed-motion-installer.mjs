import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const QIANSI_MOTION_PLUGIN_ID = 'qiansi-motion-capture';
export const QIANSI_MOTION_MODEL_IDS = Object.freeze([
  'gem-x',
  'rtmw3d',
  'depth-anything-v2-small',
  'sapiens2-normal-0.4b',
]);

const MODEL_IDS = new Set(QIANSI_MOTION_MODEL_IDS);
const RECEIPT_FILE = 'install-receipt.json';
const RESUME_FILE = 'download-resume.json';
const TERMINAL_STATUSES = new Set(['done', 'already', 'error', 'cancelled']);
const MAX_RUNTIME_STDERR_BYTES = 8_000;
const MANAGED_RUNTIME_ENGINE_IDS = new Set(['gem-x', 'rtmw3d', 'sapiens2-normal-0.4b']);

export const QIANSI_MOTION_MODEL_CATALOG = Object.freeze({
  'gem-x': Object.freeze({
    id: 'gem-x',
    label: 'NVIDIA GEM-X (SOMA)',
    fileName: 'gem_soma.ckpt',
    url: 'https://huggingface.co/nvidia/GEM-X/resolve/5ccf5ca3746c3620aa4016114f069a5f6ae399cd/gem_soma.ckpt?download=true',
    bytes: 541_758_499,
    license: Object.freeze({
      id: 'NVIDIA-Open-Model-License',
      name: 'NVIDIA Open Model License',
      url: 'https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/',
    }),
    runtimeNote:
      'Windows 可从同一按钮继续安装隔离的 GEM-X Worker；需要 NVIDIA GPU、CUDA 12.6+ 驱动与 Git LFS。',
  }),
  rtmw3d: Object.freeze({
    id: 'rtmw3d',
    label: 'OpenMMLab RTMW3D-L',
    fileName: 'rtmw3d-l_8xb64_cocktail14-384x288-794dbc78_20240626.pth',
    url: 'https://download.openmmlab.com/mmpose/v1/wholebody_3d_keypoint/rtmw3d/rtmw3d-l_8xb64_cocktail14-384x288-794dbc78_20240626.pth',
    bytes: 230_771_611,
    license: Object.freeze({
      id: 'Apache-2.0',
      name: 'Apache License 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    }),
    runtimeNote:
      'Windows 可从同一按钮继续安装隔离的 RTMW3D Worker；完成健康检查后即可开始 133 点捕捉。',
  }),
  'depth-anything-v2-small': Object.freeze({
    id: 'depth-anything-v2-small',
    label: 'Depth Anything V2 Small · Q8',
    fileName: 'model_quantized.onnx',
    url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx?download=true',
    bytes: 27_258_801,
    license: Object.freeze({
      id: 'Apache-2.0',
      name: 'Apache License 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    }),
    runtimeNote: '浏览器本地运行的相对深度模型，用于生成二维黑白白模画面。',
  }),
  'sapiens2-normal-0.4b': Object.freeze({
    id: 'sapiens2-normal-0.4b',
    label: 'AI精细3D人物白模 · Sapiens2 Normal 0.4B',
    fileName: 'sapiens2_0.4b_normal.safetensors',
    url: 'https://huggingface.co/facebook/sapiens2-normal-0.4b/resolve/52886591372f049acd4d59ae6d0a792ae1a61ac5/sapiens2_0.4b_normal.safetensors?download=true',
    bytes: 1_813_476_476,
    license: Object.freeze({
      id: 'sapiens2-license',
      name: 'Sapiens2 License',
      url: 'https://github.com/facebookresearch/sapiens2/blob/main/LICENSE.md',
    }),
    runtimeNote:
      '官方 0.4B 人体表面法线模型；Windows 可从同一按钮继续安装隔离的 Python/PyTorch CUDA Worker。',
  }),
});

export class ManagedMotionInstallerError extends Error {
  constructor(message, statusCode = 500, code = 'managed_motion_installer_error') {
    super(message);
    this.name = 'ManagedMotionInstallerError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertModelId(value) {
  const id = String(value || '').trim();
  if (!MODEL_IDS.has(id)) {
    throw new ManagedMotionInstallerError(`不支持的动作模型：${id || '空'}。`, 400);
  }
  return id;
}

function boundedMessage(value, fallback) {
  const message = value instanceof Error ? value.message : String(value || '');
  return (message.trim() || fallback).slice(0, 1_000);
}

function boundedTailMessage(value, fallback) {
  const message = value instanceof Error ? value.message : String(value || '');
  return (message.trim() || fallback).slice(-1_000);
}

function abortError(message = '动作模型安装已取消。') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function snapshot(task) {
  return Object.freeze({
    engineId: task.engineId,
    status: task.status,
    phase: task.phase,
    message: task.message,
    completedBytes: task.completedBytes,
    totalBytes: task.totalBytes,
    installed: task.installed,
    error: task.error,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  });
}

function validateCatalog(catalog) {
  const normalized = {};
  for (const id of QIANSI_MOTION_MODEL_IDS) {
    const item = catalog?.[id];
    if (
      !item ||
      item.id !== id ||
      typeof item.label !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(item.fileName || '') ||
      !String(item.url || '').startsWith('https://') ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1
    ) {
      throw new ManagedMotionInstallerError(`动作模型固定目录项无效：${id}。`, 500);
    }
    normalized[id] = Object.freeze({ ...item });
  }
  return Object.freeze(normalized);
}

export function resolveManagedMotionInstaller({ projectRoot, pluginId, pluginRoot } = {}) {
  if (!projectRoot) throw new ManagedMotionInstallerError('动作模型安装器缺少项目根目录。', 500);
  if (pluginId !== QIANSI_MOTION_PLUGIN_ID) {
    throw new ManagedMotionInstallerError('该插件没有受信任的动作模型安装能力。', 403);
  }
  const canonicalRoot = join(resolve(projectRoot), 'data', 'plugins', QIANSI_MOTION_PLUGIN_ID);
  if (!pluginRoot || resolve(pluginRoot).toLowerCase() !== resolve(canonicalRoot).toLowerCase()) {
    throw new ManagedMotionInstallerError(`动作模型只能安装到：${canonicalRoot}`, 403);
  }
  return Object.freeze({
    pluginRoot: canonicalRoot,
    modelsRoot: join(canonicalRoot, 'models'),
    stagingRoot: join(canonicalRoot, 'models', '.installing'),
  });
}

export class ManagedMotionInstallerManager {
  constructor(options = {}) {
    this.context = resolveManagedMotionInstaller(options);
    this.catalogEntries = validateCatalog(options.catalog || QIANSI_MOTION_MODEL_CATALOG);
    this.fetchImpl = options.fetchImpl || fetch;
    this.spawnImpl = options.spawnImpl || spawn;
    this.platform = options.platform || process.platform;
    this.runtimeInstallerScripts = Object.freeze({
      'gem-x': join(this.context.pluginRoot, 'worker', 'install-gem-x-runtime.ps1'),
      rtmw3d:
        options.runtimeInstallerScript ||
        join(this.context.pluginRoot, 'worker', 'install-rtmw3d-runtime.ps1'),
      'sapiens2-normal-0.4b': join(
        this.context.pluginRoot,
        'worker',
        'install-sapiens2-normal-runtime.ps1',
      ),
      ...options.runtimeInstallerScripts,
    });
    this.active = new Map();
    this.tasks = new Map();
  }

  modelDirectory(engineId) {
    return join(this.context.modelsRoot, assertModelId(engineId));
  }

  runtimeDirectory(engineId) {
    return join(this.context.pluginRoot, 'worker-runtime', assertModelId(engineId));
  }

  resumeDirectory(engineId) {
    return join(this.context.stagingRoot, assertModelId(engineId));
  }

  resumePayloadFile(engineId) {
    const id = assertModelId(engineId);
    return join(this.resumeDirectory(id), `${this.catalogEntries[id].fileName}.part`);
  }

  async #readResume(engineId) {
    const id = assertModelId(engineId);
    const entry = this.catalogEntries[id];
    try {
      const receipt = JSON.parse(
        await readFile(join(this.resumeDirectory(id), RESUME_FILE), 'utf8'),
      );
      const payloadStat = await stat(this.resumePayloadFile(id));
      const valid = Boolean(
        receipt?.schemaVersion === 1 &&
        receipt.engineId === id &&
        receipt.fileName === entry.fileName &&
        receipt.bytes === entry.bytes &&
        receipt.source === entry.url &&
        payloadStat.isFile() &&
        payloadStat.size >= 0 &&
        payloadStat.size <= entry.bytes,
      );
      return { valid, completedBytes: valid ? payloadStat.size : 0 };
    } catch {
      return { valid: false, completedBytes: 0 };
    }
  }

  async #prepareResume(engineId) {
    const id = assertModelId(engineId);
    const existing = await this.#readResume(id);
    if (existing.valid) return existing;
    const entry = this.catalogEntries[id];
    const directory = this.resumeDirectory(id);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(this.resumePayloadFile(id), new Uint8Array(), { flag: 'wx' });
    await writeFile(
      join(directory, RESUME_FILE),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          engineId: id,
          fileName: entry.fileName,
          bytes: entry.bytes,
          source: entry.url,
        },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    return { valid: true, completedBytes: 0 };
  }

  async installedModelFile(engineId) {
    const id = assertModelId(engineId);
    if (!(await this.#readInstalled(id))) {
      throw new ManagedMotionInstallerError('模型包尚未完整安装。', 409);
    }
    return join(this.modelDirectory(id), this.catalogEntries[id].fileName);
  }

  async #readInstalled(engineId) {
    const id = assertModelId(engineId);
    const entry = this.catalogEntries[id];
    const directory = this.modelDirectory(id);
    try {
      const receipt = JSON.parse(await readFile(join(directory, RECEIPT_FILE), 'utf8'));
      const modelStat = await stat(join(directory, entry.fileName));
      return Boolean(
        receipt?.schemaVersion === 1 &&
        receipt.engineId === id &&
        receipt.fileName === entry.fileName &&
        receipt.bytes === entry.bytes &&
        modelStat.isFile() &&
        modelStat.size === entry.bytes,
      );
    } catch {
      return false;
    }
  }

  async catalog() {
    const models = [];
    for (const id of QIANSI_MOTION_MODEL_IDS) {
      const entry = this.catalogEntries[id];
      models.push(
        Object.freeze({
          id,
          label: entry.label,
          installed: await this.#readInstalled(id),
          installAvailable: true,
          bytes: entry.bytes,
          license: entry.license,
          runtimeNote: entry.runtimeNote,
        }),
      );
    }
    return Object.freeze({ schemaVersion: 1, models: Object.freeze(models) });
  }

  taskStatus(engineId) {
    const id = assertModelId(engineId);
    return snapshot(
      this.tasks.get(id) || {
        engineId: id,
        status: 'idle',
        phase: 'idle',
        message: '模型包尚未安装。',
        completedBytes: 0,
        totalBytes: this.catalogEntries[id].bytes,
        installed: false,
        error: null,
        startedAt: null,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  isInstalling(engineId) {
    return this.active.has(assertModelId(engineId));
  }

  async status(engineId) {
    const id = assertModelId(engineId);
    if (this.active.has(id) || this.tasks.has(id)) return this.taskStatus(id);
    const installed = await this.#readInstalled(id);
    const resume = installed ? { completedBytes: 0 } : await this.#readResume(id);
    const resumable = resume.completedBytes > 0;
    return snapshot({
      engineId: id,
      status: installed ? 'done' : 'idle',
      phase: installed ? 'ready' : resumable ? 'paused' : 'idle',
      message: installed
        ? '模型包已安装。'
        : resumable
          ? '检测到上次未完成的下载，可从断点继续安装。'
          : '模型包尚未安装。',
      completedBytes: installed ? this.catalogEntries[id].bytes : resume.completedBytes,
      totalBytes: this.catalogEntries[id].bytes,
      installed,
      error: null,
      startedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  install(engineId) {
    const id = assertModelId(engineId);
    if (this.active.has(id)) return this.active.get(id).promise;
    const now = new Date().toISOString();
    const task = {
      engineId: id,
      status: 'queued',
      phase: 'preparing',
      message: '正在准备模型安装…',
      completedBytes: 0,
      totalBytes: this.catalogEntries[id].bytes,
      installed: false,
      error: null,
      startedAt: now,
      updatedAt: now,
      controller: new AbortController(),
      promise: null,
    };
    task.promise = this.#runInstall(task);
    this.tasks.set(id, task);
    this.active.set(id, task);
    return task.promise;
  }

  async #runInstall(task) {
    const entry = this.catalogEntries[task.engineId];
    const finalDirectory = this.modelDirectory(task.engineId);
    const stagingDirectory = this.resumeDirectory(task.engineId);
    const stagingFile = this.resumePayloadFile(task.engineId);
    try {
      const modelAlreadyInstalled = await this.#readInstalled(task.engineId);
      if (modelAlreadyInstalled && !MANAGED_RUNTIME_ENGINE_IDS.has(task.engineId)) {
        Object.assign(task, {
          status: 'already',
          phase: 'ready',
          message: '模型包已经安装。',
          completedBytes: entry.bytes,
          installed: true,
          updatedAt: new Date().toISOString(),
        });
        return snapshot(task);
      }
      if (!modelAlreadyInstalled) {
        if (existsSync(finalDirectory)) {
          throw new ManagedMotionInstallerError(
            '检测到不完整的模型目录，请先删除模型后重试。',
            409,
          );
        }
        const resume = await this.#prepareResume(task.engineId);
        let downloaded = resume.completedBytes;
        Object.assign(task, {
          status: 'running',
          phase: 'downloading',
          message:
            downloaded > 0
              ? `正在从 ${downloaded} 字节处继续下载 ${entry.label}…`
              : `正在下载 ${entry.label}…`,
          completedBytes: downloaded,
          updatedAt: new Date().toISOString(),
        });
        if (downloaded < entry.bytes) {
          const headers = { 'User-Agent': 'Qiansi-Canvas-Motion-Installer/1.0' };
          if (downloaded > 0) headers.Range = `bytes=${downloaded}-`;
          const response = await this.fetchImpl(entry.url, {
            redirect: 'follow',
            signal: task.controller.signal,
            headers,
          });
          if (!response?.ok || !response.body) {
            throw new ManagedMotionInstallerError(
              `模型下载失败（HTTP ${response?.status || '未知'}）。`,
              502,
            );
          }
          let writeOffset = downloaded;
          if (downloaded > 0 && response.status === 206) {
            const contentRange = String(response.headers?.get?.('content-range') || '');
            const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(contentRange);
            if (
              !match ||
              Number(match[1]) !== downloaded ||
              Number(match[2]) < downloaded ||
              Number(match[3]) !== entry.bytes
            ) {
              throw new ManagedMotionInstallerError('模型断点响应范围无效。', 502);
            }
          } else if (downloaded > 0 && response.status === 200) {
            writeOffset = 0;
            downloaded = 0;
            task.completedBytes = 0;
            task.message = `下载服务器未接受断点，正在安全地重新下载 ${entry.label}…`;
          } else if (response.status !== 200) {
            throw new ManagedMotionInstallerError('模型下载没有返回完整文件或有效断点。', 502);
          }
          const declaredLength = Number(response.headers?.get?.('content-length') || 0);
          const expectedLength = entry.bytes - writeOffset;
          if (declaredLength && declaredLength !== expectedLength) {
            throw new ManagedMotionInstallerError('模型下载大小与固定目录不一致。', 502);
          }
          const meter = new Transform({
            transform(chunk, _encoding, callback) {
              downloaded += chunk.length;
              if (downloaded > entry.bytes) {
                callback(new ManagedMotionInstallerError('模型下载超出固定大小。', 502));
                return;
              }
              task.completedBytes = downloaded;
              task.updatedAt = new Date().toISOString();
              callback(null, chunk);
            },
          });
          await pipeline(
            Readable.fromWeb(response.body),
            meter,
            createWriteStream(stagingFile, { flags: writeOffset > 0 ? 'a' : 'w' }),
            { signal: task.controller.signal },
          );
        }
        Object.assign(task, {
          phase: 'verifying',
          message: '正在校验模型文件…',
          updatedAt: new Date().toISOString(),
        });
        if (downloaded !== entry.bytes) {
          throw new ManagedMotionInstallerError('模型文件大小不完整，安装已取消。', 502);
        }
        await rename(stagingFile, join(stagingDirectory, entry.fileName));
        await rm(join(stagingDirectory, RESUME_FILE), { force: true });
        await writeFile(
          join(stagingDirectory, RECEIPT_FILE),
          `${JSON.stringify(
            {
              schemaVersion: 1,
              engineId: task.engineId,
              fileName: entry.fileName,
              bytes: entry.bytes,
              source: entry.url,
              installedAt: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
          { encoding: 'utf8', flag: 'wx' },
        );
        await mkdir(this.context.modelsRoot, { recursive: true });
        await rename(stagingDirectory, finalDirectory);
      }
      if (MANAGED_RUNTIME_ENGINE_IDS.has(task.engineId)) {
        await this.#installManagedRuntime(task, entry);
      }
      Object.assign(task, {
        status: 'done',
        phase: 'ready',
        message: MANAGED_RUNTIME_ENGINE_IDS.has(task.engineId)
          ? `${
              task.engineId === 'gem-x'
                ? 'GEM-X'
                : task.engineId === 'rtmw3d'
                  ? 'RTMW3D'
                  : 'Sapiens2 Normal'
            } 模型与 Worker 运行环境安装完成。`
          : '模型包安装完成。',
        completedBytes: entry.bytes,
        installed: true,
        error: null,
        updatedAt: new Date().toISOString(),
      });
      return snapshot(task);
    } catch (error) {
      const cancelled = error?.name === 'AbortError' || task.controller.signal.aborted;
      const installed = await this.#readInstalled(task.engineId);
      Object.assign(task, {
        status: cancelled ? 'cancelled' : 'error',
        phase: cancelled ? 'cancelled' : 'error',
        message: cancelled
          ? task.completedBytes > 0
            ? '模型安装已暂停，下次可从断点继续。'
            : '动作模型安装已取消。'
          : boundedMessage(error, '动作模型安装失败。'),
        installed,
        error: cancelled ? null : boundedMessage(error, '动作模型安装失败。'),
        updatedAt: new Date().toISOString(),
      });
      if (cancelled) throw abortError();
      throw error;
    } finally {
      this.active.delete(task.engineId);
    }
  }

  async #installManagedRuntime(task, entry) {
    const runtimeLabel =
      task.engineId === 'gem-x'
        ? 'GEM-X'
        : task.engineId === 'rtmw3d'
          ? 'RTMW3D'
          : 'Sapiens2 Normal';
    if (this.platform !== 'win32') {
      throw new ManagedMotionInstallerError(
        `${runtimeLabel} 一键 Worker 安装当前支持 64 位 Windows；其他系统请按 worker/README.md 接入官方环境。`,
        501,
        'runtime_platform_unsupported',
      );
    }
    const script = this.runtimeInstallerScripts[task.engineId];
    if (!existsSync(script)) {
      throw new ManagedMotionInstallerError(`${runtimeLabel} Worker 安装脚本缺失。`, 500);
    }
    Object.assign(task, {
      status: 'running',
      phase: 'runtime-preparing',
      message: `正在准备 ${runtimeLabel} Worker 运行环境…`,
      completedBytes: 0,
      totalBytes: entry.bytes,
      installed: true,
      updatedAt: new Date().toISOString(),
    });
    await new Promise((resolvePromise, rejectPromise) => {
      const child = this.spawnImpl(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          '-PluginRoot',
          this.context.pluginRoot,
        ],
        {
          cwd: this.context.pluginRoot,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      task.child = child;
      let stdoutBuffer = '';
      let stderr = '';
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        task.controller.signal.removeEventListener('abort', abort);
        delete task.child;
        if (error) rejectPromise(error);
        else resolvePromise();
      };
      const parseLine = (line) => {
        if (!line.startsWith('QIMC_INSTALL_PROGRESS ')) return;
        try {
          const progress = JSON.parse(line.slice('QIMC_INSTALL_PROGRESS '.length));
          const percent = Math.max(0, Math.min(100, Number(progress.progress) || 0));
          task.phase = String(progress.phase || task.phase).slice(0, 80);
          task.message = String(progress.message || task.message).slice(0, 500);
          task.completedBytes = Math.floor((entry.bytes * percent) / 100);
          task.updatedAt = new Date().toISOString();
        } catch {
          // Ignore unrelated or incomplete tool output. The process exit code remains authoritative.
        }
      };
      const readStdout = (chunk) => {
        stdoutBuffer += String(chunk);
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        lines.forEach(parseLine);
      };
      const abort = () => child.kill();
      task.controller.signal.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', readStdout);
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-MAX_RUNTIME_STDERR_BYTES);
      });
      child.once('error', (error) => finish(error));
      child.once('exit', (code) => {
        if (stdoutBuffer) parseLine(stdoutBuffer);
        if (task.controller.signal.aborted) {
          finish(abortError(`${runtimeLabel} Worker 安装已取消。`));
          return;
        }
        if (code !== 0) {
          finish(
            new ManagedMotionInstallerError(
              boundedTailMessage(stderr, `${runtimeLabel} Worker 运行环境安装失败。`),
              502,
              'runtime_install_failed',
            ),
          );
          return;
        }
        finish();
      });
    });
  }

  async cancel(engineId) {
    const id = assertModelId(engineId);
    const task = this.active.get(id);
    if (!task) return this.status(id);
    task.controller.abort();
    try {
      await task.promise;
    } catch {
      // The terminal snapshot below is the public cancellation result.
    }
    return this.taskStatus(id);
  }

  async uninstall(engineId) {
    const id = assertModelId(engineId);
    if (this.active.has(id)) {
      throw new ManagedMotionInstallerError('模型正在安装，请先取消安装。', 409);
    }
    const directory = this.modelDirectory(id);
    await rm(directory, { recursive: true, force: true });
    await rm(this.resumeDirectory(id), { recursive: true, force: true });
    if (MANAGED_RUNTIME_ENGINE_IDS.has(id)) {
      await rm(this.runtimeDirectory(id), { recursive: true, force: true });
    }
    const now = new Date().toISOString();
    const task = {
      engineId: id,
      status: 'done',
      phase: 'removed',
      message: '模型包已删除。',
      completedBytes: 0,
      totalBytes: this.catalogEntries[id].bytes,
      installed: false,
      error: null,
      startedAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return snapshot(task);
  }

  async stopAll() {
    const tasks = [...this.active.values()];
    for (const task of tasks) task.controller.abort();
    await Promise.allSettled(tasks.map((task) => task.promise));
  }
}

export function isManagedMotionInstallTerminal(status) {
  return TERMINAL_STATUSES.has(String(status || ''));
}
