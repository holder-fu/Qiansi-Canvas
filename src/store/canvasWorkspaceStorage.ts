import { parseCanvasPersistence, stringifyCanvasPersistence } from './canvasPersistenceCodec';

const CANVAS_WORKSPACE_KEY_PREFIX = 'kitty-canvas-workspace-state:';

interface PersistedCanvasWorkspace<TSnapshot> {
  version: 1;
  projectId: string;
  workspace: string;
  snapshot: TSnapshot;
}

export type CanvasWorkspaceReadResult<TSnapshot> =
  | { status: 'found'; snapshot: TSnapshot }
  | { status: 'missing' }
  | { status: 'error'; error: Error };

export function canvasWorkspaceStorageKey(projectId: string, workspace: string) {
  return `${CANVAS_WORKSPACE_KEY_PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(workspace)}`;
}

export function readCanvasWorkspaceSnapshot<TSnapshot>(
  storage: Pick<Storage, 'getItem'>,
  projectId: string,
  workspace: string,
): CanvasWorkspaceReadResult<TSnapshot> {
  try {
    const raw = storage.getItem(canvasWorkspaceStorageKey(projectId, workspace));
    if (raw === null) return { status: 'missing' };
    const parsed = parseCanvasPersistence<PersistedCanvasWorkspace<TSnapshot>>(raw);
    if (
      parsed?.version !== 1 ||
      parsed.projectId !== projectId ||
      parsed.workspace !== workspace ||
      !parsed.snapshot ||
      typeof parsed.snapshot !== 'object'
    ) {
      return { status: 'error', error: new Error('画布工作台快照格式无效。') };
    }
    return { status: 'found', snapshot: parsed.snapshot };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error : new Error('画布工作台快照读取失败。'),
    };
  }
}

export function writeCanvasWorkspaceSnapshot<TSnapshot>(
  storage: Pick<Storage, 'setItem'>,
  projectId: string,
  workspace: string,
  snapshot: TSnapshot,
) {
  const payload: PersistedCanvasWorkspace<TSnapshot> = {
    version: 1,
    projectId,
    workspace,
    snapshot,
  };
  storage.setItem(
    canvasWorkspaceStorageKey(projectId, workspace),
    stringifyCanvasPersistence(payload),
  );
}

export function removeCanvasWorkspaceSnapshot(
  storage: Pick<Storage, 'removeItem'>,
  projectId: string,
  workspace: string,
) {
  storage.removeItem(canvasWorkspaceStorageKey(projectId, workspace));
}
