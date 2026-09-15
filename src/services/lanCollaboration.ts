import type { FlowEdge, FlowNode, WorkspaceId } from '../canvas/nodeTypes';
import { resolveBridgeUrl } from '../lib/bridgeUrl';
import { stableJsonStringify } from '../lib/stableJson';
import { isLanCollaborationSession } from './lanCollaborationSession';
import {
  bridgeSerializableWorkContent,
  localBridgeCanvasValue,
  portableBridgeCanvasValue,
} from './bridgeCanvasPersistence';
import {
  applySharedProjectWorkspace,
  applySharedProjectCatalog,
  captureSharedProjectWorkspace,
  getSharedProjectLoadedScopes,
  isBridgeCanvasAuthorityReadyForLan,
  type AssetItem,
  type CanvasTab,
  type SharedProjectWorkspace,
  type TrashItem,
  type WorkspaceSnapshot,
} from '../store/canvasStore';

const POLL_INTERVAL_MS = 1_200;

type ProjectResponse = {
  workspace: SharedProjectWorkspace | null;
  error?: { message?: string };
};

type ProjectCatalogResponse = {
  projects?: Array<{ id: string; name: string }>;
};

function stable(value: unknown) {
  return stableJsonStringify(value);
}

export function portableSharedProjectWorkspace(workspace: SharedProjectWorkspace) {
  return portableBridgeCanvasValue(
    bridgeSerializableWorkContent(workspace),
  ) as SharedProjectWorkspace;
}

export function localSharedProjectWorkspace(workspace: SharedProjectWorkspace) {
  return localBridgeCanvasValue(workspace);
}

function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
  const merged: T[] = [];
  for (const id of ids) {
    const before = baseById.get(id);
    const ours = localById.get(id);
    const theirs = remoteById.get(id);
    if (stable(ours) === stable(before)) {
      if (theirs) merged.push(theirs);
      continue;
    }
    if (stable(theirs) === stable(before)) {
      if (ours) merged.push(ours);
      continue;
    }
    // Both sides changed. Preserve the local edit, but never let an unchanged
    // local deletion erase a concurrently edited remote item.
    if (ours) merged.push(ours);
    else if (theirs && stable(theirs) !== stable(before)) merged.push(theirs);
  }
  return merged;
}

function mergeWorkspace(
  base: WorkspaceSnapshot | undefined,
  local: WorkspaceSnapshot | undefined,
  remote: WorkspaceSnapshot | undefined,
): WorkspaceSnapshot | undefined {
  if (!local) return remote;
  if (!remote) return stable(local) === stable(base) ? undefined : local;
  return {
    nodes: mergeById<FlowNode>(base?.nodes ?? [], local.nodes, remote.nodes),
    edges: mergeById<FlowEdge>(base?.edges ?? [], local.edges, remote.edges),
  };
}

export function mergeSharedProjectWorkspaces(
  base: SharedProjectWorkspace,
  local: SharedProjectWorkspace,
  remote: SharedProjectWorkspace,
): SharedProjectWorkspace {
  const workspaceIds = new Set<WorkspaceId>([
    ...(Object.keys(base.workspaces) as WorkspaceId[]),
    ...(Object.keys(local.workspaces) as WorkspaceId[]),
    ...(Object.keys(remote.workspaces) as WorkspaceId[]),
  ]);
  const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
  for (const id of workspaceIds) {
    const merged = mergeWorkspace(base.workspaces[id], local.workspaces[id], remote.workspaces[id]);
    if (merged) workspaces[id] = merged;
  }
  return {
    ...remote,
    projectName: local.projectName === base.projectName ? remote.projectName : local.projectName,
    workspaces,
    tabs: mergeById<CanvasTab>(base.tabs, local.tabs, remote.tabs),
    assets: mergeById<AssetItem>(base.assets, local.assets, remote.assets),
    trash: mergeById<TrashItem>(base.trash, local.trash, remote.trash),
    genParams:
      stable(local.genParams) === stable(base.genParams) ? remote.genParams : local.genParams,
    activeTags:
      stable(local.activeTags) === stable(base.activeTags) ? remote.activeTags : local.activeTags,
    revision: remote.revision,
  };
}

/**
 * Build a conservative merge only after an explicit conflict-resolution choice.
 * First-contact synchronization must not call this automatically because there
 * is no common ancestor from which to determine which same-id copy is newer.
 */
export function mergeInitialSharedProjectWorkspaces(
  local: SharedProjectWorkspace,
  remote: SharedProjectWorkspace,
): SharedProjectWorkspace {
  const emptyBase: SharedProjectWorkspace = {
    ...remote,
    workspaces: {},
    tabs: [],
    assets: [],
    trash: [],
    activeTags: [],
    revision: 0,
  };
  return mergeSharedProjectWorkspaces(emptyBase, local, remote);
}

function sharedContentSignature(workspace: SharedProjectWorkspace) {
  // A project document also carries Bridge-only manifest metadata such as
  // currentWorkspace, name and title. Those fields are not part of the LAN
  // collaboration contract and must not turn an otherwise identical canvas
  // into a first-contact conflict.
  const projected = bridgeSerializableWorkContent(workspace);
  return stable({
    version: projected.version,
    projectId: projected.projectId,
    projectName: projected.projectName,
    workspaces: projected.workspaces,
    tabs: projected.tabs,
    assets: projected.assets,
    trash: projected.trash,
    genParams: projected.genParams,
    activeTags: projected.activeTags,
  });
}

export interface LanCollaborationConflictCopy {
  version: 1;
  projectId: string;
  detectedAt: number;
  reason: 'initial-content-diverged' | 'remote-updated-while-local-dirty';
  local: SharedProjectWorkspace;
  remote: SharedProjectWorkspace;
}

const lanCollaborationConflictCopies = new Map<string, LanCollaborationConflictCopy>();

export function initialLanCollaborationConflict(
  local: SharedProjectWorkspace,
  remote: SharedProjectWorkspace,
): LanCollaborationConflictCopy | undefined {
  if (sharedContentSignature(local) === sharedContentSignature(remote)) return undefined;
  return {
    version: 1,
    projectId: local.projectId,
    detectedAt: Date.now(),
    reason: 'initial-content-diverged',
    local,
    remote,
  };
}

function isIdSubset<T extends { id: string }>(local: readonly T[], remote: readonly T[]) {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  return local.every((item) => stable(item) === stable(remoteById.get(item.id)));
}

/**
 * The Bridge store hydrates only the active workspace on startup, while the
 * collaboration endpoint returns the full project. Treat exact local scopes as
 * an on-demand subset instead of reporting remote-only workspaces as edits.
 */
export function initialLoadedLanScopeMatchesRemote(
  local: SharedProjectWorkspace,
  remote: SharedProjectWorkspace,
  loadedScopes: { trash: boolean } = { trash: true },
) {
  const projectedLocal = bridgeSerializableWorkContent(local);
  const projectedRemote = bridgeSerializableWorkContent(remote);
  if (
    projectedLocal.projectId !== projectedRemote.projectId ||
    projectedLocal.projectName !== projectedRemote.projectName ||
    stable(projectedLocal.genParams) !== stable(projectedRemote.genParams) ||
    stable(projectedLocal.activeTags) !== stable(projectedRemote.activeTags)
  ) {
    return false;
  }
  const localWorkspaces = Object.entries(projectedLocal.workspaces);
  const remoteWorkspaceCount = Object.keys(projectedRemote.workspaces).length;
  if (localWorkspaces.length > remoteWorkspaceCount) return false;
  const workspacesArePartial = localWorkspaces.length < remoteWorkspaceCount;
  if (
    !localWorkspaces.every(
      ([workspaceId, snapshot]) =>
        stable(snapshot) === stable(projectedRemote.workspaces[workspaceId as WorkspaceId]),
    )
  ) {
    return false;
  }
  return (
    (workspacesArePartial
      ? isIdSubset(projectedLocal.tabs, projectedRemote.tabs) &&
        isIdSubset(projectedLocal.assets, projectedRemote.assets)
      : stable(projectedLocal.tabs) === stable(projectedRemote.tabs) &&
        stable(projectedLocal.assets) === stable(projectedRemote.assets)) &&
    (!loadedScopes.trash || stable(projectedLocal.trash) === stable(projectedRemote.trash))
  );
}

export function getLanCollaborationConflictCopy(
  projectId: string,
): LanCollaborationConflictCopy | undefined {
  return lanCollaborationConflictCopies.get(projectId);
}

export function exportLanCollaborationConflictCopy(projectId: string): string | undefined {
  const copy = getLanCollaborationConflictCopy(projectId);
  return copy ? JSON.stringify(copy, null, 2) : undefined;
}

function clearLanCollaborationConflict(projectId: string) {
  if (!lanCollaborationConflictCopies.delete(projectId)) return;
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qiansi:lan-collaboration-conflict', {
        detail: { projectId, status: 'cleared' },
      }),
    );
  }
}

async function readProject(projectId: string): Promise<SharedProjectWorkspace | null> {
  const response = await fetch(resolveBridgeUrl(`/projects/${encodeURIComponent(projectId)}`), {
    cache: 'no-store',
    credentials: 'include',
  });
  if (response.status === 404) return null;
  const payload = (await response.json().catch(() => ({}))) as ProjectResponse;
  if (!response.ok) throw new Error(payload.error?.message || '共享项目读取失败。');
  return payload.workspace?.version === 2 ? localSharedProjectWorkspace(payload.workspace) : null;
}

async function readProjectCatalog() {
  const response = await fetch(resolveBridgeUrl('/projects'), {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('共享项目目录读取失败。');
  const payload = (await response.json()) as ProjectCatalogResponse;
  return payload.projects ?? [];
}

/**
 * Start project-scoped LAN collaboration. Canvas/project/assets are shared;
 * browser preferences, themes, toolbar layout and credentials never enter the payload.
 */
function startLanCollaborationPolling() {
  let stopped = false;
  let busy = false;
  let activeProjectId = '';
  let baseline: SharedProjectWorkspace | null = null;
  let baselineContentSignature = '';

  const adopt = (workspace: SharedProjectWorkspace) => {
    if (!applySharedProjectWorkspace(workspace, { recoverInterruptedGeneration: true })) {
      return false;
    }
    baseline = workspace;
    baselineContentSignature = sharedContentSignature(workspace);
    clearLanCollaborationConflict(workspace.projectId);
    return true;
  };

  const synchronize = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const local = captureSharedProjectWorkspace();
      if (local.projectId !== activeProjectId) {
        activeProjectId = local.projectId;
        baseline = null;
        baselineContentSignature = '';
      }
      // The store starts with an intentionally blank session while it reads the
      // fixed Bridge canvas. Comparing that placeholder with the host would
      // manufacture a conflict. Fail closed until a successful Bridge read (or
      // verified Bridge write) has published the authoritative revision.
      if (!baseline && !isBridgeCanvasAuthorityReadyForLan(activeProjectId)) return;
      const [remote, projects] = await Promise.all([
        readProject(activeProjectId),
        readProjectCatalog(),
      ]);
      if (!remote) {
        applySharedProjectCatalog(projects);
        // Project creation and all durable writes are owned by the canvas
        // store's single Bridge CAS queue. This observer never issues PUT.
        return;
      }
      if (!baseline) {
        // A user may edit the canvas while both Bridge reads are in flight.
        // Never let the first remote response overwrite that newer local
        // intent; leave baseline unset and compare the fresh state next tick.
        const currentAfterRead = captureSharedProjectWorkspace();
        if (sharedContentSignature(currentAfterRead) !== sharedContentSignature(local)) return;
        const initialConflict = initialLanCollaborationConflict(local, remote);
        if (
          !initialConflict ||
          initialLoadedLanScopeMatchesRemote(
            local,
            remote,
            getSharedProjectLoadedScopes(activeProjectId),
          )
        ) {
          applySharedProjectCatalog(projects);
          adopt(remote);
          return;
        }
        // The single-canvas product has one durable authority: the Bridge.
        // Once hydration is complete, a first-observation difference can only
        // be a newer in-memory edit or a newer host revision. Establish the
        // remote baseline without overwriting the local edit; the store's CAS
        // save path owns any real revision conflict. The retired browser-vs-
        // host project comparison must never surface a false "first sync"
        // conflict banner.
        applySharedProjectCatalog(projects);
        baseline = remote;
        baselineContentSignature = sharedContentSignature(remote);
        clearLanCollaborationConflict(activeProjectId);
        return;
      }
      applySharedProjectCatalog(projects);
      const remoteRevision = Number(remote.revision) || 0;
      const baselineRevision = Number(baseline.revision) || 0;
      const current = captureSharedProjectWorkspace();
      const currentContentSignature = sharedContentSignature(current);
      const remoteContentSignature = sharedContentSignature(remote);
      const localChanged = currentContentSignature !== baselineContentSignature;
      if (remoteRevision > baselineRevision) {
        if (currentContentSignature === remoteContentSignature) {
          adopt(remote);
          return;
        }
        if (!localChanged) {
          adopt(remote);
          return;
        }
        // The read-only observer cannot distinguish another terminal from this
        // page's immediately preceding autosave. Keep the newer local edit and
        // advance only the observed host baseline. canvasStore is the sole
        // writer and its expectedRevision CAS is the authoritative conflict
        // decision: a real concurrent edit will fail there with an exportable
        // persistence conflict, while this page's normal save pipeline will
        // continue without a false LAN warning.
        baseline = remote;
        baselineContentSignature = remoteContentSignature;
        clearLanCollaborationConflict(activeProjectId);
        return;
      }
      // Local changes are persisted by canvasStore. Keeping this observer
      // read-only prevents two clients in one page from racing the same
      // project-level expectedRevision.
    } catch (error) {
      console.warn('[lan-collaboration] 同步暂时不可用，将保留终端本地副本。', error);
    } finally {
      busy = false;
    }
  };

  const interval = window.setInterval(() => void synchronize(), POLL_INTERVAL_MS);
  void synchronize();

  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}

export function startLanCollaboration() {
  let stopped = false;
  let stopPolling: (() => void) | undefined;
  const controller = new AbortController();

  void isLanCollaborationSession(controller.signal).then((enabled) => {
    if (stopped || !enabled) return;
    stopPolling = startLanCollaborationPolling();
  });

  return () => {
    stopped = true;
    controller.abort();
    stopPolling?.();
  };
}
