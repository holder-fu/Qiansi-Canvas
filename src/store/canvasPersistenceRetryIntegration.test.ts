import { afterEach, describe, expect, it, vi } from 'vitest';
import { stringifyCanvasPersistence } from './canvasPersistenceCodec';
import { CANVAS_PERSISTENCE_RETRY_DELAYS_MS } from './canvasPersistenceRetry';
import { canvasWorkspaceStorageKey } from './canvasWorkspaceStorage';

const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
});

describe('canvas persistence automatic retry', () => {
  it('retries a transient quota failure and clears the visible error after a verified save', async () => {
    vi.useFakeTimers();
    const projectId = 'project-persistence-retry';
    const workspace = 'views';
    const workspaceKey = canvasWorkspaceStorageKey(projectId, workspace);
    const tabs = [{ id: 'tab-views', name: '图片画板', workspace }];
    const snapshot = {
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '图片 1',
            imageUrl: 'https://example.test/original.png',
          },
        },
      ],
      edges: [],
    };
    const meta = {
      workspace,
      workspaceIds: [workspace],
      tabs,
      activeTabId: 'tab-views',
    };
    const values = new Map<string, string>([
      [
        'kitty-canvas-state',
        stringifyCanvasPersistence({
          version: 6,
          activeProjectId: projectId,
          projectStates: {},
          projectMeta: { [projectId]: meta },
          workspace,
          workspaces: {},
          tabs,
          activeTabId: 'tab-views',
          projectName: '重试项目',
          projects: [{ id: projectId, name: '重试项目' }],
          genParams: {},
          activeTags: [],
          projectRevisions: {},
        }),
      ],
      [workspaceKey, stringifyCanvasPersistence({ version: 1, projectId, workspace, snapshot })],
    ]);
    let failNextCanvasWrite = true;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (
          failNextCanvasWrite &&
          (key === 'kitty-canvas-state' || key.startsWith('kitty-canvas-workspace-state:'))
        ) {
          failNextCanvasWrite = false;
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        requestAnimationFrame: vi.fn(() => 1),
        cancelAnimationFrame: vi.fn(),
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          request: vi.fn(
            async (_name: string, _options: unknown, callback: () => boolean | Promise<boolean>) =>
              callback(),
          ),
        },
      },
    });

    const { flushCanvasPersistence, useCanvasStore } = await import('./canvasStore');

    await expect(flushCanvasPersistence()).resolves.toBe(false);
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('error');
    expect(useCanvasStore.getState().persistenceStatus.message).toContain('本地保存空间不足');

    await vi.advanceTimersByTimeAsync(CANVAS_PERSISTENCE_RETRY_DELAYS_MS[0]);
    await Promise.resolve();
    expect(useCanvasStore.getState().persistenceStatus.state).toBe('saved');
    expect(useCanvasStore.getState().persistenceStatus.message).toBeUndefined();
  });
});
