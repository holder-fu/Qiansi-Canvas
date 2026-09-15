import { describe, expect, it, vi } from 'vitest';
import {
  collectManagedBrowserStorage,
  createBrowserStorageBridge,
  installBrowserStorageInterception,
} from './browserStorageBridge';
import type { BrowserStorageChange, BrowserStorageSnapshot } from '../services/browserStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function snapshot(
  revision: number,
  records: BrowserStorageSnapshot['storage']['records'],
): BrowserStorageSnapshot {
  return {
    storage: { version: 1, revision, records, updatedAt: revision * 10 },
    writable: true,
  };
}

describe('browser storage Bridge synchronizer', () => {
  it('migrates all existing managed local-only data and excludes legacy canvas snapshots', async () => {
    const storage = new MemoryStorage();
    storage.setItem('kitty-canvas-agent-conversations-v1', '[{"id":"chat-1"}]');
    storage.setItem('qiansi-canvas-themes-v1', '{"customThemes":[]}');
    storage.setItem('kitty-canvas-api-vault-v1', '{"sealed":true}');
    storage.setItem('kitty-canvas-state', '{"nodes":["legacy"]}');
    storage.setItem('third-party', 'leave-alone');
    const save = vi.fn(async (changes: BrowserStorageChange[], expectedRevision: number) =>
      snapshot(
        expectedRevision + 1,
        changes.map((change) => ({ ...change, updatedAt: 100 })),
      ),
    );
    const bridge = createBrowserStorageBridge({
      storage,
      load: async () => snapshot(0, []),
      save,
      schedule: (task) => task(),
    });

    await bridge.hydrate();

    expect(save).toHaveBeenCalledTimes(1);
    const migrated = save.mock.calls[0]?.[0] ?? [];
    expect(migrated.map((change) => change.key).sort()).toEqual([
      'kitty-canvas-agent-conversations-v1',
      'kitty-canvas-api-vault-v1',
      'qiansi-canvas-themes-v1',
    ]);
    expect(collectManagedBrowserStorage(storage)).not.toHaveProperty('kitty-canvas-state');
    expect(storage.getItem('third-party')).toBe('leave-alone');
  });

  it('hydrates host values and applies deletion tombstones before application modules load', async () => {
    const storage = new MemoryStorage();
    storage.setItem('qiansi-canvas-themes-v1', '{"stale":true}');
    storage.setItem('kitty-canvas-agent-model-v1', '{"model":"old"}');
    const bridge = createBrowserStorageBridge({
      storage,
      load: async () =>
        snapshot(4, [
          {
            key: 'kitty-canvas-agent-model-v1',
            value: '{"model":"restored"}',
            updatedAt: 40,
          },
          { key: 'qiansi-canvas-themes-v1', value: null, updatedAt: 40 },
        ]),
      save: vi.fn(),
    });

    await bridge.hydrate();

    expect(storage.getItem('kitty-canvas-agent-model-v1')).toBe('{"model":"restored"}');
    expect(storage.getItem('qiansi-canvas-themes-v1')).toBeNull();
  });

  it('serializes rapid changes and rebases a stale writer without dropping independent keys', async () => {
    const storage = new MemoryStorage();
    const firstSave = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('conflict'), {
        name: 'BrowserStorageConflictError',
        storage: snapshot(2, [
          { key: 'qiansi-canvas-themes-v1', value: '{"remote":true}', updatedAt: 20 },
        ]).storage,
      }),
    );
    firstSave.mockImplementationOnce(
      async (changes: BrowserStorageChange[], _expectedRevision: number) =>
        snapshot(3, [
          { key: 'qiansi-canvas-themes-v1', value: '{"remote":true}', updatedAt: 20 },
          ...changes.map((change) => ({ ...change, updatedAt: 30 })),
        ]),
    );
    const bridge = createBrowserStorageBridge({
      storage,
      load: async () => snapshot(1, []),
      save: firstSave,
    });
    await bridge.hydrate();

    bridge.recordSet('kitty-canvas-agent-conversations-v1', '[{"id":"chat"}]');
    bridge.recordSet('qiansi-plugin-preferences-v1', '{"plugins":{}}');
    await bridge.flush();

    expect(firstSave).toHaveBeenCalledTimes(2);
    expect(firstSave.mock.calls[1]?.[1]).toBe(2);
    expect(firstSave.mock.calls[1]?.[0]).toHaveLength(2);
    expect(storage.getItem('qiansi-canvas-themes-v1')).toBe('{"remote":true}');
  });

  it('captures managed Storage writes and deletions without mirroring unrelated keys', async () => {
    const storage = new MemoryStorage();
    const save = vi.fn(async (changes: BrowserStorageChange[], expectedRevision: number) =>
      snapshot(
        expectedRevision + 1,
        changes.map((change) => ({ ...change, updatedAt: 100 })),
      ),
    );
    const bridge = createBrowserStorageBridge({
      storage,
      load: async () => snapshot(0, []),
      save,
    });
    const restore = installBrowserStorageInterception(storage, bridge);
    try {
      await bridge.hydrate();
      storage.setItem('qiansi-plugin-audio-history-v1', '[{"id":"audio-1"}]');
      storage.setItem('third-party', 'local-only');
      storage.removeItem('qiansi-plugin-audio-history-v1');
      await bridge.flush();

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]?.[0]).toEqual([
        { key: 'qiansi-plugin-audio-history-v1', value: null },
      ]);
    } finally {
      restore();
    }
  });
});
