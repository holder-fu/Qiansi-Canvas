import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock('../services/userLibraries', () => {
  class UserLibrariesConflictError extends Error {
    readonly libraries?: unknown;

    constructor(libraries?: unknown) {
      super('conflict');
      this.libraries = libraries;
    }
  }

  return {
    loadUserLibraries: bridge.load,
    saveUserLibraries: bridge.save,
    UserLibrariesConflictError,
  };
});

import {
  loadUserLibraryPresets,
  queueUserLibrariesSync,
  saveUserLibraryPreset,
} from './userLibrary';

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return memoryStorage.size;
    },
    clear: () => memoryStorage.clear(),
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    removeItem: (key: string) => memoryStorage.delete(key),
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
  } satisfies Storage,
});

describe('user library Bridge write queue', () => {
  beforeEach(() => {
    localStorage.clear();
    bridge.load.mockReset();
    bridge.save.mockReset();
  });

  it('serializes rapid updates and persists the latest complete prompt snapshot', async () => {
    let serverRevision = 0;
    let inFlight = 0;
    let maximumInFlight = 0;
    let latestLibraries: Record<string, unknown> = {};
    bridge.load.mockResolvedValue({
      writable: true,
      libraries: { version: 1, revision: 0, libraries: {}, updatedAt: 0 },
    });
    bridge.save.mockImplementation(
      async (libraries: Record<string, unknown>, expectedRevision: number) => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          expect(expectedRevision).toBe(serverRevision);
          serverRevision += 1;
          latestLibraries = structuredClone(libraries);
          return {
            writable: true,
            libraries: {
              version: 1,
              revision: serverRevision,
              libraries: latestLibraries,
              updatedAt: serverRevision,
            },
          };
        } finally {
          inFlight -= 1;
        }
      },
    );

    saveUserLibraryPreset('style', {
      id: 'round-trip-style',
      title: '第一次保存',
      category: '推荐',
      prompt: '旧提示词',
      tags: ['推荐'],
    });
    saveUserLibraryPreset('style', {
      id: 'round-trip-style',
      title: '导入后的完整风格',
      category: '推荐',
      prompt: '导入后必须持久化的完整提示词',
      tags: ['推荐'],
    });

    await queueUserLibrariesSync();

    expect(maximumInFlight).toBe(1);
    expect(loadUserLibraryPresets('style')[0]).toMatchObject({
      title: '导入后的完整风格',
      prompt: '导入后必须持久化的完整提示词',
    });
    expect(latestLibraries).toMatchObject({
      style: {
        presets: [
          expect.objectContaining({
            id: 'round-trip-style',
            title: '导入后的完整风格',
            prompt: '导入后必须持久化的完整提示词',
          }),
        ],
      },
    });
  });
});
