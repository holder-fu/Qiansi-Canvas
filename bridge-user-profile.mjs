import { join } from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';

export const BRIDGE_USER_PROFILE_VERSION = 1;
export const MAX_BRIDGE_USER_NAME_LENGTH = 60;

export class BridgeUserProfileConflictError extends Error {
  constructor(current) {
    super('资料作者已在其它窗口更新，请刷新后重试。');
    this.name = 'BridgeUserProfileConflictError';
    this.current = current;
  }
}

export function normalizeBridgeUserName(value) {
  if (typeof value !== 'string') return '';
  return [...value.normalize('NFKC')]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, MAX_BRIDGE_USER_NAME_LENGTH);
}

function normalizeStoredProfile(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  return {
    version: BRIDGE_USER_PROFILE_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    userName: normalizeBridgeUserName(value?.userName),
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export class BridgeUserProfileStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('资料作者存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'profile.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    const stored = await readJsonIfExists(this.file, '资料作者设置');
    return normalizeStoredProfile(stored);
  }

  update({ userName, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeStoredProfile(
          await readJsonIfExists(this.file, '资料作者设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('资料作者设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeUserProfileConflictError(current);
        }
        const next = {
          version: BRIDGE_USER_PROFILE_VERSION,
          revision: current.revision + 1,
          userName: normalizeBridgeUserName(userName),
          updatedAt: this.now(),
        };
        await atomicWriteJson(this.file, next, { maxBytes: 16 * 1024 });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
