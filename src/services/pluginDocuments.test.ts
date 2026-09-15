import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PluginDocumentConflictError,
  deletePluginDocument,
  readPluginDocument,
  writePluginDocument,
} from './pluginDocuments';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('plugin project document file bridge', () => {
  it('uses the Bridge file repository and skips IndexedDB after migration is complete', async () => {
    const open = vi.fn(() => {
      throw new Error('IndexedDB must not be opened after the file migration marker exists.');
    });
    vi.stubGlobal('indexedDB', { open });
    const requests: Array<{ action: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const action = new URL(String(input)).pathname.split('/').pop() || '';
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        requests.push({ action, body });
        if (action === 'status') return jsonResponse({ completed: true });
        if (action === 'read') {
          return jsonResponse({
            key: body.key,
            value: { title: '文件项目' },
            revision: 3,
            updatedAt: 1_700_000_000_000,
          });
        }
        if (action === 'delete') return jsonResponse({ deleted: true });
        return jsonResponse({ error: { message: 'unexpected' } }, 400);
      }),
    );

    await expect(
      readPluginDocument('novel-video', 'project_101', 'studio-project.v1'),
    ).resolves.toMatchObject({ revision: 3, value: { title: '文件项目' } });
    await expect(
      deletePluginDocument('novel-video', 'project_101', 'studio-project.v1', 3),
    ).resolves.toEqual({ deleted: true });
    expect(open).not.toHaveBeenCalled();
    expect(requests.map((item) => item.action)).toEqual(['status', 'read', 'delete']);
    expect(requests.at(2)?.body).toMatchObject({ expectedRevision: 3 });
  });

  it('maps Bridge CAS conflicts to the public conflict error', async () => {
    vi.stubGlobal('indexedDB', null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const action = new URL(String(input)).pathname.split('/').pop();
        if (action === 'status') return jsonResponse({ completed: true });
        return jsonResponse({ error: { message: 'revision conflict' }, currentRevision: 8 }, 409);
      }),
    );

    const failure = writePluginDocument(
      'novel-video',
      'project_102',
      'studio-project.v1',
      { title: '过期草稿' },
      7,
    );
    await expect(failure).rejects.toBeInstanceOf(PluginDocumentConflictError);
    await expect(failure).rejects.toMatchObject({ currentRevision: 8 });
  });

  it('copies the legacy IndexedDB scope before marking file migration complete', async () => {
    const requestWithResult = (result: unknown) => {
      const request = {
        result,
        error: null,
        addEventListener(event: string, listener: () => void) {
          if (event === 'success') queueMicrotask(listener);
        },
      };
      return request;
    };
    const legacyRecord = {
      id: 'legacy',
      pluginId: 'novel-video',
      projectId: 'project_103',
      pluginProjectId: 'novel-video\u0000project_103',
      key: 'studio-project.v1',
      json: JSON.stringify({ title: '旧草稿' }),
      revision: 5,
      updatedAt: 1_700_000_000_000,
    };
    const transaction = {
      error: null,
      addEventListener(event: string, listener: () => void) {
        if (event === 'complete') setTimeout(listener, 0);
      },
      objectStore() {
        return {
          indexNames: { contains: () => true },
          index: () => ({ getAll: () => requestWithResult([legacyRecord]) }),
        };
      },
    };
    const database = {
      objectStoreNames: { contains: () => true },
      transaction: () => transaction,
      close: vi.fn(),
    };
    vi.stubGlobal('indexedDB', { open: () => requestWithResult(database) });
    vi.stubGlobal('IDBKeyRange', { only: (value: unknown) => value });
    const actions: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const action = new URL(String(input)).pathname.split('/').pop() || '';
        actions.push(action);
        if (action === 'status') return jsonResponse({ completed: false });
        if (action === 'migrate') {
          const body = JSON.parse(String(init?.body || '{}'));
          expect(body.snapshot).toMatchObject({
            key: 'studio-project.v1',
            value: { title: '旧草稿' },
            revision: 5,
          });
          return jsonResponse({ migrated: true });
        }
        if (action === 'complete-migration') return jsonResponse({ completed: true });
        if (action === 'read') return jsonResponse(null);
        return jsonResponse({}, 400);
      }),
    );

    await expect(
      readPluginDocument('novel-video', 'project_103', 'studio-project.v1'),
    ).resolves.toBeNull();
    expect(actions).toEqual(['status', 'migrate', 'complete-migration', 'read']);
    expect(database.close).toHaveBeenCalledOnce();
  });
});
