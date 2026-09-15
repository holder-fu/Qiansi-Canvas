import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserMediaPersistenceDisabledError,
  loadDirectorModel,
  loadEffectVideo,
  loadProjectTrash,
  saveAssetVideo,
  saveDirectorModel,
  saveEffectVideo,
  saveProjectTrash,
} from './libraryMedia';

function createLegacyIndexedDbStub(
  seed: Record<string, Record<string, unknown>> = {},
  existing = true,
) {
  const stores = new Map(
    Object.entries(seed).map(([name, values]) => [
      name,
      new Map<IDBValidKey, unknown>(Object.entries(values)),
    ]),
  );
  let openCount = 0;
  let createStoreCount = 0;
  const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => {
      createStoreCount += 1;
      const store = new Map<IDBValidKey, unknown>();
      stores.set(name, store);
      return store;
    },
    transaction: (name: string) => {
      const transaction: {
        error: null;
        oncomplete?: () => void;
        onerror?: () => void;
        objectStore: () => {
          get: (key: IDBValidKey) => IDBRequest;
          count: (key: IDBValidKey) => IDBRequest;
          delete: (key: IDBValidKey) => void;
        };
      } = {
        error: null,
        objectStore: () => ({
          get: (key) => {
            const request = {} as IDBRequest;
            queueMicrotask(() => {
              Object.defineProperty(request, 'result', { value: stores.get(name)?.get(key) });
              request.onsuccess?.(new Event('success'));
            });
            return request;
          },
          count: (key) => {
            const request = {} as IDBRequest;
            queueMicrotask(() => {
              Object.defineProperty(request, 'result', {
                value: stores.get(name)?.has(key) ? 1 : 0,
              });
              request.onsuccess?.(new Event('success'));
            });
            return request;
          },
          delete: (key) => {
            stores.get(name)?.delete(key);
            queueMicrotask(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
    close: vi.fn(),
  };
  const factory = {
    open: () => {
      openCount += 1;
      const request = {
        transaction: { abort: vi.fn() },
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        Object.defineProperty(request, 'result', { value: database });
        if (!existing) {
          request.onupgradeneeded?.({} as IDBVersionChangeEvent);
          Object.defineProperty(request, 'error', { value: new DOMException('', 'AbortError') });
          request.onerror?.(new Event('error'));
          return;
        }
        request.onsuccess?.(new Event('success'));
      });
      return request;
    },
  };
  return {
    factory,
    openCount: () => openCount,
    createStoreCount: () => createStoreCount,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Bridge-only library media boundary', () => {
  it('rejects every deprecated browser persistence entry without opening IndexedDB', async () => {
    const indexedDb = createLegacyIndexedDbStub({}, false);
    vi.stubGlobal('indexedDB', indexedDb.factory);

    await expect(saveAssetVideo('asset-video', new Blob(['video']))).rejects.toBeInstanceOf(
      BrowserMediaPersistenceDisabledError,
    );
    await expect(saveEffectVideo('effect-video', new Blob(['video']))).rejects.toBeInstanceOf(
      BrowserMediaPersistenceDisabledError,
    );
    await expect(saveProjectTrash('project-a', [{ id: 'trash' }])).rejects.toBeInstanceOf(
      BrowserMediaPersistenceDisabledError,
    );
    expect(indexedDb.openCount()).toBe(0);
  });

  it('does not create or upgrade an IndexedDB database for a clean browser profile', async () => {
    const indexedDb = createLegacyIndexedDbStub({}, false);
    vi.stubGlobal('indexedDB', indexedDb.factory);

    await expect(loadEffectVideo('missing-effect')).resolves.toBeNull();
    await expect(loadProjectTrash('missing-project')).resolves.toBeNull();
    expect(indexedDb.createStoreCount()).toBe(0);
  });

  it('keeps old records readable for verified one-way migration', async () => {
    const legacyVideo = new Blob(['legacy-video'], { type: 'video/mp4' });
    const legacyTrash = [{ id: 'legacy-trash' }];
    const indexedDb = createLegacyIndexedDbStub({
      'effect-videos': { 'legacy-effect': legacyVideo },
      'project-trash': { 'project-a': legacyTrash },
    });
    vi.stubGlobal('indexedDB', indexedDb.factory);

    await expect(loadEffectVideo('legacy-effect')).resolves.toBe(legacyVideo);
    await expect(loadProjectTrash('project-a')).resolves.toEqual(legacyTrash);
  });

  it('stores a director model through Bridge and reloads by the returned stable asset id', async () => {
    const modelBlob = new Blob(['glb-model'], { type: 'model/gltf-binary' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            item: {
              id: 'asset_director123',
              url: '/asset-library/files/asset_director123',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(modelBlob, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const indexedDb = createLegacyIndexedDbStub({}, false);
    vi.stubGlobal('indexedDB', indexedDb.factory);

    const stored = await saveDirectorModel('legacy-logical-id', modelBlob, {
      project: 'project-a',
      fileName: 'actor.glb',
    });

    expect(stored.id).toBe('asset_director123');
    await expect(loadDirectorModel(stored.id)).resolves.toEqual(modelBlob);
    expect(indexedDb.openCount()).toBe(0);
  });
});
