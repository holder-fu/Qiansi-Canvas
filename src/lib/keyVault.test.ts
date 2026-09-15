import { beforeEach, describe, expect, it } from 'vitest';
import { revealKey, sealKey } from './keyVault';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
});

describe('key vault writes', () => {
  it('keeps the most recent rapid key update', async () => {
    await Promise.all([sealKey('provider', 'old-key'), sealKey('provider', 'new-key')]);

    await expect(revealKey('provider')).resolves.toBe('new-key');
  });

  it('queues deletion after an earlier write', async () => {
    await Promise.all([sealKey('provider', 'temporary-key'), sealKey('provider', '')]);

    await expect(revealKey('provider')).resolves.toBe('');
  });
});
