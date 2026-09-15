import { isManagedBrowserStorageKey } from './browserStorageContract.mjs';
import {
  BrowserStorageConflictError,
  loadBrowserStorage,
  saveBrowserStorage,
  type BrowserStorageChange,
  type BrowserStorageDocument,
  type BrowserStorageSnapshot,
} from '../services/browserStorage';

type BrowserStorageBridgeOptions = {
  storage: Storage;
  load: () => Promise<BrowserStorageSnapshot>;
  save: (
    changes: BrowserStorageChange[],
    expectedRevision: number,
  ) => Promise<BrowserStorageSnapshot>;
  schedule?: (task: () => void) => void;
};

export function collectManagedBrowserStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem'>) {
  const values: Record<string, string> = {};
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !isManagedBrowserStorageKey(key)) continue;
      const value = storage.getItem(key);
      if (value !== null) values[key] = value;
    }
  } catch {
    // A blocked storage remains usable in memory; Bridge synchronization is skipped.
  }
  return values;
}

function isBrowserStorageConflict(
  error: unknown,
): error is BrowserStorageConflictError & { storage: BrowserStorageDocument } {
  return (
    (error instanceof BrowserStorageConflictError ||
      (Boolean(error) &&
        typeof error === 'object' &&
        (error as { name?: unknown }).name === 'BrowserStorageConflictError')) &&
    Boolean((error as { storage?: unknown }).storage)
  );
}

export function createBrowserStorageBridge(options: BrowserStorageBridgeOptions) {
  const { storage, load, save } = options;
  const schedule = options.schedule ?? ((task: () => void) => queueMicrotask(task));
  let activeSnapshot: BrowserStorageSnapshot | undefined;
  let pending = new Map<string, string | null>();
  let flushPromise: Promise<void> | undefined;
  let flushScheduled = false;
  let applyingHostSnapshot = false;

  function applyDocument(document: BrowserStorageDocument, excludedKeys = new Set<string>()) {
    applyingHostSnapshot = true;
    try {
      for (const record of document.records) {
        if (excludedKeys.has(record.key)) continue;
        if (record.value === null) storage.removeItem(record.key);
        else storage.setItem(record.key, record.value);
      }
    } finally {
      applyingHostSnapshot = false;
    }
  }

  async function persistBatch(changes: BrowserStorageChange[]) {
    activeSnapshot ??= await load();
    if (!activeSnapshot.writable) return activeSnapshot;
    try {
      return await save(changes, activeSnapshot.storage.revision);
    } catch (error) {
      if (!isBrowserStorageConflict(error)) throw error;
      activeSnapshot = { storage: error.storage, writable: true };
      const excluded = new Set([...changes.map((change) => change.key), ...pending.keys()]);
      applyDocument(error.storage, excluded);
      return save(changes, error.storage.revision);
    }
  }

  function scheduleFlush() {
    if (flushScheduled || flushPromise) return;
    flushScheduled = true;
    schedule(() => {
      flushScheduled = false;
      void flush();
    });
  }

  function record(key: string, value: string | null) {
    if (applyingHostSnapshot || !isManagedBrowserStorageKey(key)) return;
    pending.set(key, value);
    scheduleFlush();
  }

  async function flushLoop() {
    while (pending.size > 0) {
      const batchMap = pending;
      pending = new Map();
      const changes = [...batchMap].map(([key, value]) => ({ key, value }));
      try {
        const saved = await persistBatch(changes);
        activeSnapshot = saved;
        const excluded = new Set([...batchMap.keys(), ...pending.keys()]);
        applyDocument(saved.storage, excluded);
      } catch {
        for (const [key, value] of batchMap) {
          if (!pending.has(key)) pending.set(key, value);
        }
        break;
      }
    }
  }

  async function flush() {
    flushPromise ??= flushLoop().finally(() => {
      flushPromise = undefined;
    });
    return flushPromise;
  }

  async function hydrate() {
    const local = collectManagedBrowserStorage(storage);
    activeSnapshot = await load();
    const hostKeys = new Set(activeSnapshot.storage.records.map((record) => record.key));
    applyDocument(activeSnapshot.storage);
    const browserOnly = Object.entries(local)
      .filter(([key]) => !hostKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    if (browserOnly.length === 0 || !activeSnapshot.writable) return;
    activeSnapshot = await persistBatch(browserOnly);
  }

  return {
    hydrate,
    flush,
    recordSet: (key: string, value: string) => record(key, String(value)),
    recordRemove: (key: string) => record(key, null),
    recordClear: (keys: Iterable<string>) => {
      for (const key of keys) record(key, null);
    },
    isApplyingHostSnapshot: () => applyingHostSnapshot,
  };
}

type BrowserStorageBridge = ReturnType<typeof createBrowserStorageBridge>;

const RUNTIME_KEY = '__QIANSI_BROWSER_STORAGE_BRIDGE__';

type BrowserStorageRuntime = {
  bridge: BrowserStorageBridge;
  ready: Promise<void>;
};

export function installBrowserStorageInterception(storage: Storage, bridge: BrowserStorageBridge) {
  const prototype = Object.getPrototypeOf(storage) as Storage;
  const originalSetItem = prototype.setItem;
  const originalRemoveItem = prototype.removeItem;
  const originalClear = prototype.clear;

  prototype.setItem = function setItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === storage && !bridge.isApplyingHostSnapshot()) bridge.recordSet(key, String(value));
  };
  prototype.removeItem = function removeItem(key: string) {
    originalRemoveItem.call(this, key);
    if (this === storage && !bridge.isApplyingHostSnapshot()) bridge.recordRemove(key);
  };
  prototype.clear = function clear() {
    const keys = Object.keys(collectManagedBrowserStorage(storage));
    originalClear.call(this);
    if (this === storage && !bridge.isApplyingHostSnapshot()) bridge.recordClear(keys);
  };

  return () => {
    prototype.setItem = originalSetItem;
    prototype.removeItem = originalRemoveItem;
    prototype.clear = originalClear;
  };
}

/** Restore host state before eager modules read localStorage, then mirror every managed write. */
export function startBrowserStorageBridge(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const runtimeHost = window as typeof window & {
    [RUNTIME_KEY]?: BrowserStorageRuntime;
  };
  if (runtimeHost[RUNTIME_KEY]) return runtimeHost[RUNTIME_KEY].ready;

  const storage = window.localStorage;
  const bridge = createBrowserStorageBridge({
    storage,
    load: () => loadBrowserStorage(),
    save: (changes, expectedRevision) => saveBrowserStorage(changes, expectedRevision),
  });
  installBrowserStorageInterception(storage, bridge);
  const ready = bridge.hydrate();
  runtimeHost[RUNTIME_KEY] = { bridge, ready };

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== storage || !event.key) return;
    if (event.newValue === null) bridge.recordRemove(event.key);
    else bridge.recordSet(event.key, event.newValue);
  });
  window.addEventListener('online', () => {
    void bridge
      .hydrate()
      .then(() => bridge.flush())
      .catch(() => {});
  });
  window.addEventListener('pagehide', () => void bridge.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void bridge.flush();
  });
  return ready;
}
