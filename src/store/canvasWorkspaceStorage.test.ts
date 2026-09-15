import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import {
  canvasWorkspaceStorageKey,
  readCanvasWorkspaceSnapshot,
  removeCanvasWorkspaceSnapshot,
  writeCanvasWorkspaceSnapshot,
} from './canvasWorkspaceStorage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('per-workspace canvas storage', () => {
  it('round-trips one workspace without reading or writing sibling canvases', () => {
    const storage = memoryStorage();
    const snapshot = {
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { kind: 'text', title: '文本', prompt: '只属于当前工作台' },
        },
      ] as FlowNode[],
      edges: [],
    };

    writeCanvasWorkspaceSnapshot(storage, 'project/current', 'views', snapshot);

    expect(
      readCanvasWorkspaceSnapshot<typeof snapshot>(storage, 'project/current', 'views'),
    ).toEqual({ status: 'found', snapshot });
    expect(readCanvasWorkspaceSnapshot(storage, 'project/current', 'video')).toEqual({
      status: 'missing',
    });
    expect([...storage.values.keys()]).toEqual([
      canvasWorkspaceStorageKey('project/current', 'views'),
    ]);
  });

  it('deduplicates repeated embedded media inside one workspace', () => {
    const storage = memoryStorage();
    const image = `data:image/png;base64,${'A'.repeat(512)}`;
    const snapshot = {
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { kind: 'image', title: '图片', imageUrl: image, output: image },
        },
      ] as FlowNode[],
      edges: [],
    };

    writeCanvasWorkspaceSnapshot(storage, 'project-media', 'views', snapshot);

    const raw = storage.values.get(canvasWorkspaceStorageKey('project-media', 'views')) ?? '';
    expect(raw.match(/data:image\/png/g)).toHaveLength(1);
    expect(readCanvasWorkspaceSnapshot<typeof snapshot>(storage, 'project-media', 'views')).toEqual(
      { status: 'found', snapshot },
    );
  });

  it('fails closed for a malformed or mismatched workspace envelope', () => {
    const storage = memoryStorage();
    storage.values.set(
      canvasWorkspaceStorageKey('expected', 'views'),
      JSON.stringify({
        version: 1,
        projectId: 'different',
        workspace: 'views',
        snapshot: {},
      }),
    );

    expect(readCanvasWorkspaceSnapshot(storage, 'expected', 'views').status).toBe('error');
  });

  it('removes only the requested workspace snapshot', () => {
    const storage = memoryStorage();
    writeCanvasWorkspaceSnapshot(storage, 'one', 'views', { value: 1 });
    writeCanvasWorkspaceSnapshot(storage, 'one', 'video', { value: 2 });

    removeCanvasWorkspaceSnapshot(storage, 'one', 'views');

    expect(readCanvasWorkspaceSnapshot(storage, 'one', 'views')).toEqual({ status: 'missing' });
    expect(readCanvasWorkspaceSnapshot(storage, 'one', 'video').status).toBe('found');
  });
});
