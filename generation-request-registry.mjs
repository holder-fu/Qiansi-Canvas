import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,119}$/;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 256;
const MAX_PERSISTED_RESULT_BYTES = 1024 * 1024;
const GENERATION_REQUEST_KINDS = new Set(['image', 'video', 'audio', '3d', 'text']);

export class GenerationRequestError extends Error {
  constructor(message, code = 'GENERATION_REQUEST_INVALID') {
    super(message);
    this.name = 'GenerationRequestError';
    this.code = code;
  }
}

export function normalizeGenerationRequestId(value) {
  const id = String(value || '').trim();
  if (!REQUEST_ID_RE.test(id)) {
    throw new GenerationRequestError(
      '生成请求缺少有效 requestId；仅允许 6–120 位字母、数字、下划线和连字符。',
    );
  }
  return id;
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== 'requestId' && value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return null;
}

export function generationRequestFingerprint(kind, body) {
  return createHash('sha256')
    .update(String(kind || ''))
    .update('\0')
    .update(JSON.stringify(canonicalValue(body)))
    .digest('hex');
}

function normalizedStoredEntry(value) {
  if (!value || typeof value !== 'object') return null;
  let id;
  try {
    id = normalizeGenerationRequestId(value.id);
  } catch {
    return null;
  }
  const kind = GENERATION_REQUEST_KINDS.has(value.kind) ? value.kind : '';
  const fingerprint = /^[a-f0-9]{64}$/.test(String(value.fingerprint || ''))
    ? String(value.fingerprint)
    : '';
  const status = value.status === 'complete' || value.status === 'failed' ? value.status : '';
  const completedAt = Number(value.completedAt);
  if (!kind || !fingerprint || !status || !Number.isSafeInteger(completedAt) || completedAt < 0) {
    return null;
  }
  if (status === 'complete') {
    const serialized = JSON.stringify(value.result);
    if (!serialized || Buffer.byteLength(serialized) > MAX_PERSISTED_RESULT_BYTES) return null;
    return {
      id,
      kind,
      fingerprint,
      status,
      completedAt,
      result: value.result,
      outputMissing: value.outputMissing === true,
    };
  }
  return {
    id,
    kind,
    fingerprint,
    status,
    completedAt,
    error: String(value.error || '生成请求失败。').slice(0, 800),
  };
}

function publicEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    completedAt: entry.completedAt,
    ...(entry.status === 'complete' ? { result: entry.result } : {}),
    ...(entry.status === 'complete' && entry.outputMissing ? { outputMissing: true } : {}),
    ...(entry.status === 'failed' ? { error: entry.error } : {}),
  };
}

function chatMessageSensitiveValues(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message) => {
    const content = message?.content;
    if (typeof content === 'string') return [content];
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      const values = [];
      if (typeof part?.text === 'string') values.push(part.text);
      if (typeof part?.image_url?.url === 'string') values.push(part.image_url.url);
      return values;
    });
  });
}

function safeFailureMessage(error, body) {
  let message = String(error instanceof Error ? error.message : error || '生成请求失败。');
  const sensitive = [
    body?.prompt,
    body?.apiKey,
    body?.provider?.apiKey,
    body?.provider?.token,
    body?.provider?.authorization,
    ...chatMessageSensitiveValues(body?.messages),
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const value of sensitive) message = message.split(value).join('[已隐藏]');
  return message.slice(0, 800);
}

export class GenerationRequestRegistry {
  constructor({
    filePath,
    maxEntries = DEFAULT_MAX_ENTRIES,
    ttlMs = DEFAULT_TTL_MS,
    outputExists = async () => true,
  }) {
    this.filePath = filePath;
    this.maxEntries = Math.max(1, Math.min(2_048, Number(maxEntries) || DEFAULT_MAX_ENTRIES));
    this.ttlMs = Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.outputExists = outputExists;
    this.entries = new Map();
    this.pending = new Map();
    this.admissionQueue = Promise.resolve();
    this.writeQueue = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      const values = Array.isArray(parsed?.entries) ? parsed.entries : [];
      for (const value of values) {
        const entry = normalizedStoredEntry(value);
        if (entry) this.entries.set(entry.id, entry);
      }
    } catch {
      /* First launch or a corrupt optional recovery registry starts empty. */
    }
    await this.prune();
  }

  async prune(now = Date.now()) {
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (now - entry.completedAt > this.ttlMs) {
        this.entries.delete(id);
        changed = true;
        continue;
      }
      if (entry.status === 'complete') {
        const outputMissing = !(await this.outputExists(entry.result, entry.kind).catch(
          () => false,
        ));
        if (entry.outputMissing !== outputMissing) {
          entry.outputMissing = outputMissing;
          changed = true;
        }
      }
    }
    const ordered = [...this.entries.values()].sort((a, b) => b.completedAt - a.completedAt);
    for (const entry of ordered.slice(this.maxEntries)) {
      this.entries.delete(entry.id);
      changed = true;
    }
    if (changed) await this.persist();
  }

  persist() {
    const entries = [...this.entries.values()]
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, this.maxEntries);
    const task = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
        try {
          await writeFile(
            temporaryPath,
            JSON.stringify({ version: 1, updatedAt: Date.now(), entries }, null, 2),
            'utf8',
          );
          await rename(temporaryPath, this.filePath);
        } catch (error) {
          await unlink(temporaryPath).catch(() => undefined);
          throw error;
        }
      });
    this.writeQueue = task;
    return task;
  }

  async storedEntry(id, kind, fingerprint) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.kind !== kind || entry.fingerprint !== fingerprint) {
      throw new GenerationRequestError(
        '同一 requestId 已用于不同的生成请求，已拒绝可能重复计费的调用。',
        'GENERATION_REQUEST_CONFLICT',
      );
    }
    if (entry.status === 'complete') {
      const outputMissing = !(await this.outputExists(entry.result, entry.kind).catch(() => false));
      if (entry.outputMissing !== outputMissing) {
        entry.outputMissing = outputMissing;
        await this.persist();
      }
    }
    if (entry.status === 'complete' && entry.outputMissing) {
      return entry;
    }
    if (entry.status === 'complete' && !entry.result) {
      // Defensive corrupt-entry handling retains a non-retry tombstone.
      entry.outputMissing = true;
      await this.persist();
    }
    return entry;
  }

  async run({ id: rawId, kind, body, execute }) {
    const id = normalizeGenerationRequestId(rawId);
    if (!GENERATION_REQUEST_KINDS.has(kind)) {
      throw new GenerationRequestError('生成请求类型无效。');
    }
    const fingerprint = generationRequestFingerprint(kind, body);
    await this.ready;
    let releaseAdmission;
    const previousAdmission = this.admissionQueue;
    this.admissionQueue = new Promise((resolve) => {
      releaseAdmission = resolve;
    });
    await previousAdmission;
    try {
      const inFlight = this.pending.get(id);
      if (inFlight) {
        if (inFlight.kind !== kind || inFlight.fingerprint !== fingerprint) {
          throw new GenerationRequestError(
            '同一 requestId 正在执行另一项生成请求，已拒绝重复计费。',
            'GENERATION_REQUEST_CONFLICT',
          );
        }
        return inFlight.promise;
      }
      const stored = await this.storedEntry(id, kind, fingerprint);
      if (stored?.status === 'complete' && stored.outputMissing) {
        throw new GenerationRequestError(
          '该 requestId 的生成已完成，但本机输出文件已被删除；为避免重复计费，不会再次调用 Provider。',
          'GENERATION_OUTPUT_MISSING',
        );
      }
      if (stored?.status === 'complete') return stored.result;
      if (stored?.status === 'failed') {
        throw new GenerationRequestError(stored.error, 'GENERATION_REQUEST_FAILED');
      }

      const pendingEntry = {
        kind,
        fingerprint,
        promise: null,
        progress: 0,
        phase: 'queued',
        nodeId: '',
        queueRemaining: 0,
      };
      const reportProgress = (value = {}) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const progress = Number(value.progress);
        if (Number.isFinite(progress)) {
          pendingEntry.progress = Math.max(0, Math.min(100, Math.round(progress)));
        }
        if (typeof value.phase === 'string') pendingEntry.phase = value.phase.trim().slice(0, 80);
        if (typeof value.nodeId === 'string') pendingEntry.nodeId = value.nodeId.slice(0, 160);
        const queueRemaining = Number(value.queueRemaining);
        if (Number.isSafeInteger(queueRemaining) && queueRemaining >= 0) {
          pendingEntry.queueRemaining = Math.min(1_000_000, queueRemaining);
        }
      };
      const promise = Promise.resolve()
        .then(() => execute({ reportProgress }))
        .then(async (result) => {
          const serialized = JSON.stringify(result);
          if (!serialized || Buffer.byteLength(serialized) > MAX_PERSISTED_RESULT_BYTES) {
            throw new Error('生成结果元数据超过恢复注册表大小限制。');
          }
          this.entries.set(id, {
            id,
            kind,
            fingerprint,
            status: 'complete',
            completedAt: Date.now(),
            result,
            outputMissing: false,
          });
          // Once the provider has completed, a registry I/O failure must not turn a
          // paid success into a client-visible failure (which would encourage a
          // retry and a second charge). The in-memory entry still provides
          // single-flight/recovery for this bridge process; persistence is
          // best-effort under an unavailable disk.
          await this.prune().catch(() => undefined);
          await this.persist().catch(() => undefined);
          return result;
        })
        .catch(async (error) => {
          if (!this.entries.has(id)) {
            this.entries.set(id, {
              id,
              kind,
              fingerprint,
              status: 'failed',
              completedAt: Date.now(),
              error: safeFailureMessage(error, body),
            });
            await this.prune().catch(() => undefined);
            await this.persist().catch(() => undefined);
          }
          throw error;
        })
        .finally(() => {
          this.pending.delete(id);
      });
      pendingEntry.promise = promise;
      this.pending.set(id, pendingEntry);
      return promise;
    } finally {
      releaseAdmission();
    }
  }

  async get(rawId) {
    const id = normalizeGenerationRequestId(rawId);
    await this.ready;
    const inFlight = this.pending.get(id);
    if (inFlight) {
      return {
        id,
        kind: inFlight.kind,
        status: 'pending',
        completedAt: 0,
        progress: inFlight.progress,
        phase: inFlight.phase,
        ...(inFlight.nodeId ? { nodeId: inFlight.nodeId } : {}),
        queueRemaining: inFlight.queueRemaining,
      };
    }
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.status === 'complete') {
      const outputMissing = !(await this.outputExists(entry.result, entry.kind).catch(() => false));
      if (entry.outputMissing !== outputMissing) {
        entry.outputMissing = outputMissing;
        await this.persist();
      }
    }
    if (entry.status === 'complete' && !entry.result) {
      entry.outputMissing = true;
      await this.persist();
    }
    return publicEntry(entry);
  }
}
