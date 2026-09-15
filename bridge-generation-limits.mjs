import { join } from 'node:path';
import {
  DEFAULT_GENERATION_LIMITS,
  normalizeGenerationLimits,
} from './src/lib/generationLimitsContract.mjs';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';

export const BRIDGE_GENERATION_LIMITS_VERSION = 1;

export class BridgeGenerationLimitsConflictError extends Error {
  constructor(current) {
    super('请求与批量生成设置已在其它窗口更新，请刷新后重试。');
    this.name = 'BridgeGenerationLimitsConflictError';
    this.current = current;
  }
}

function normalizeStoredGenerationLimits(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  return {
    version: BRIDGE_GENERATION_LIMITS_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    ...normalizeGenerationLimits(value ?? DEFAULT_GENERATION_LIMITS),
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export class BridgeGenerationLimitsStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('请求与批量生成设置缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'generation-limits.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    const stored = await readJsonIfExists(this.file, '请求与批量生成设置');
    return normalizeStoredGenerationLimits(stored);
  }

  update({ limits, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeStoredGenerationLimits(
          await readJsonIfExists(this.file, '请求与批量生成设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('请求与批量生成设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeGenerationLimitsConflictError(current);
        }
        const next = {
          version: BRIDGE_GENERATION_LIMITS_VERSION,
          revision: current.revision + 1,
          ...normalizeGenerationLimits(limits),
          updatedAt: this.now(),
        };
        await atomicWriteJson(this.file, next, { maxBytes: 16 * 1024 });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
