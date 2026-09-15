import { join } from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';

export const BRIDGE_USER_LIBRARIES_VERSION = 1;
export const USER_LIBRARY_KINDS = ['style', 'effect', 'character', 'camera'];
export const MAX_USER_LIBRARIES_BYTES = 16 * 1024 * 1024;

function normalizeLibrary(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    presets: Array.isArray(raw.presets) ? raw.presets.slice(0, 200) : [],
    deletedIds: Array.isArray(raw.deletedIds) ? raw.deletedIds.slice(0, 500) : [],
    deletedCategories: Array.isArray(raw.deletedCategories)
      ? raw.deletedCategories.slice(0, 200)
      : [],
    deletedModels: Array.isArray(raw.deletedModels) ? raw.deletedModels.slice(0, 200) : [],
    customCategories: Array.isArray(raw.customCategories) ? raw.customCategories.slice(0, 200) : [],
    customModels: Array.isArray(raw.customModels) ? raw.customModels.slice(0, 200) : [],
    renamedCategories: Array.isArray(raw.renamedCategories)
      ? raw.renamedCategories.slice(0, 200)
      : [],
    renamedModels: Array.isArray(raw.renamedModels) ? raw.renamedModels.slice(0, 200) : [],
  };
}

export function normalizeBridgeUserLibraries(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  const rawLibraries =
    value?.libraries && typeof value.libraries === 'object' ? value.libraries : {};
  const libraries = Object.fromEntries(
    USER_LIBRARY_KINDS.map((kind) => [kind, normalizeLibrary(rawLibraries[kind])]),
  );
  return {
    version: BRIDGE_USER_LIBRARIES_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    libraries,
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export class BridgeUserLibrariesConflictError extends Error {
  constructor(current) {
    super('资料库已在其它窗口更新，请刷新后重试。');
    this.name = 'BridgeUserLibrariesConflictError';
    this.current = current;
  }
}

export class BridgeUserLibrariesStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('资料库存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'user-libraries.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    return normalizeBridgeUserLibraries(await readJsonIfExists(this.file, '资料库设置'));
  }

  update({ libraries, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeBridgeUserLibraries(
          await readJsonIfExists(this.file, '资料库设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('资料库设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeUserLibrariesConflictError(current);
        }
        const next = {
          version: BRIDGE_USER_LIBRARIES_VERSION,
          revision: current.revision + 1,
          libraries: normalizeBridgeUserLibraries({ libraries }).libraries,
          updatedAt: this.now(),
        };
        await atomicWriteJson(this.file, next, { maxBytes: MAX_USER_LIBRARIES_BYTES });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
