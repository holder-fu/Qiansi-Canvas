import { join } from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';

export const BRIDGE_TEXT_MODE_CATALOG_VERSION = 1;
export const MAX_TEXT_MODE_CATALOG_BYTES = 192 * 1024;

export function normalizeBridgeTextModeCatalog(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  return {
    version: BRIDGE_TEXT_MODE_CATALOG_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    modes: Array.isArray(value?.modes) ? value.modes.slice(0, 32) : [],
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export class BridgeTextModeCatalogConflictError extends Error {
  constructor(current) {
    super('文本处理模式已在其它窗口更新，请刷新后重试。');
    this.name = 'BridgeTextModeCatalogConflictError';
    this.current = current;
  }
}

export class BridgeTextModeCatalogStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('文本处理模式存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'text-modes.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    return normalizeBridgeTextModeCatalog(await readJsonIfExists(this.file, '文本处理模式设置'));
  }

  update({ modes, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeBridgeTextModeCatalog(
          await readJsonIfExists(this.file, '文本处理模式设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('文本处理模式设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeTextModeCatalogConflictError(current);
        }
        const next = {
          version: BRIDGE_TEXT_MODE_CATALOG_VERSION,
          revision: current.revision + 1,
          modes: Array.isArray(modes) ? modes.slice(0, 32) : [],
          updatedAt: this.now(),
        };
        await atomicWriteJson(this.file, next, { maxBytes: MAX_TEXT_MODE_CATALOG_BYTES });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
