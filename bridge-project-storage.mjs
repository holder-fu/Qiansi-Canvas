import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { link, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const BRIDGE_PROJECT_SCHEMA_VERSION = 3;
export const BRIDGE_PROJECT_WORKSPACE_IDS = Object.freeze(['script', 'views', 'video', 'audio']);
export const BRIDGE_PRIMARY_CANVAS_PROJECT_ID = 'main-canvas';

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const REVISION_ID_RE = /^[A-Za-z0-9_-]{6,120}$/;
const TRANSIENT_RENAME_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EAGAIN', 'EPERM']);
const DEFAULT_RENAME_BACKOFF_MS = Object.freeze([25, 50, 100, 200, 400, 800, 1_600]);
const PROJECT_LOCK_SCHEMA_VERSION = 1;
const DEFAULT_PROJECT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_PROJECT_LOCK_RETRY_MS = 25;
const DEFAULT_PROJECT_LOCK_STALE_MS = 2_000;
const PROJECT_LOCK_TOKEN_RE = /^[a-f0-9]{32}$/;
const PROJECT_TOMBSTONE_SCHEMA_VERSION = 1;
const MANIFEST_PATCH_FIELDS = new Set([
  'projectName',
  'tabs',
  'activeTabId',
  'genParams',
  'activeTags',
  'assets',
  'workspace',
  'currentWorkspace',
  'activeWorkspace',
  'name',
  'title',
  'coverUrl',
  'coverAssetId',
  'folderId',
  'createdAt',
  'creationRequestId',
]);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function sameJsonValue(left, right) {
  return isDeepStrictEqual(left, right);
}

function idArray(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) {
      return false;
    }
    ids.add(item.id);
  }
  return true;
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeBridgeEntry(basePresent, base, localPresent, local, remotePresent, remote) {
  const sameEntry = (leftPresent, left, rightPresent, right) =>
    leftPresent === rightPresent && (!leftPresent || sameJsonValue(left, right));

  if (sameEntry(localPresent, local, remotePresent, remote)) {
    return { ok: true, present: localPresent, value: local };
  }
  if (sameEntry(localPresent, local, basePresent, base)) {
    return { ok: true, present: remotePresent, value: remote };
  }
  if (sameEntry(remotePresent, remote, basePresent, base)) {
    return { ok: true, present: localPresent, value: local };
  }
  if (!basePresent || !localPresent || !remotePresent) return { ok: false };

  if (idArray(base) && idArray(local) && idArray(remote)) {
    return mergeBridgeIdArrays(base, local, remote);
  }
  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const value = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const merged = mergeBridgeEntry(
        own(base, key),
        base[key],
        own(local, key),
        local[key],
        own(remote, key),
        remote[key],
      );
      if (!merged.ok) return { ok: false };
      if (merged.present) value[key] = merged.value;
    }
    return { ok: true, present: true, value };
  }
  return { ok: false };
}

function mergeBridgeIdArrays(base, local, remote) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const mergedById = new Map();
  for (const id of new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()])) {
    const merged = mergeBridgeEntry(
      baseById.has(id),
      baseById.get(id),
      localById.has(id),
      localById.get(id),
      remoteById.has(id),
      remoteById.get(id),
    );
    if (!merged.ok) return { ok: false };
    if (merged.present) mergedById.set(id, merged.value);
  }

  const baseIds = base.map((item) => item.id);
  const baseSet = new Set(baseIds);
  const localIds = local.map((item) => item.id);
  const remoteIds = remote.map((item) => item.id);
  const localBaseOrder = localIds.filter((id) => baseSet.has(id));
  const remoteBaseOrder = remoteIds.filter((id) => baseSet.has(id));
  const localExpectedOrder = baseIds.filter((id) => localById.has(id));
  const remoteExpectedOrder = baseIds.filter((id) => remoteById.has(id));
  const localReordered = !sameStringArray(localBaseOrder, localExpectedOrder);
  const remoteReordered = !sameStringArray(remoteBaseOrder, remoteExpectedOrder);
  if (localReordered && remoteReordered && !sameStringArray(localBaseOrder, remoteBaseOrder)) {
    return { ok: false };
  }

  const preferredOrder = localReordered ? localIds : remoteIds;
  const otherOrder = localReordered ? remoteIds : localIds;
  const order = [];
  for (const id of [...preferredOrder, ...otherOrder, ...mergedById.keys()]) {
    if (mergedById.has(id) && !order.includes(id)) order.push(id);
  }
  return {
    ok: true,
    present: true,
    value: order.map((id) => mergedById.get(id)),
  };
}

/**
 * Merge two edits only when every changed JSON leaf has a single writer.
 * Arrays of graph/library records merge by stable `id`; scalar arrays remain
 * atomic. Any overlapping deletion, reorder or leaf edit fails closed.
 */
export function mergeBridgeJsonConflictFree(base, local, remote) {
  const merged = mergeBridgeEntry(true, base, true, local, true, remote);
  return merged.ok ? { ok: true, value: merged.value } : { ok: false };
}

function assertProjectId(projectId) {
  const id = String(projectId || '');
  if (!PROJECT_ID_RE.test(id)) throw new Error('项目编号无效。');
  return id;
}

export function assertBridgeWorkspaceId(workspaceId) {
  const id = String(workspaceId || '');
  if (!BRIDGE_PROJECT_WORKSPACE_IDS.includes(id)) throw new Error('工作台编号无效。');
  return id;
}

export function resolveCanvasDataRoot(projectRoot, environment = process.env) {
  const configured = String(environment?.QIANSI_CANVAS_DATA_DIR || '').trim();
  return resolve(configured || join(projectRoot, 'data'));
}

export async function fsyncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    // Windows and a few network filesystems do not expose directory fsync.
    // File fsync plus same-directory rename still gives the strongest portable
    // contract Node can provide there.
    if (!['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(error?.code)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function fsyncFile(file) {
  const handle = await open(file, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurableFile(file, serialized, flags = 'wx') {
  const handle = await open(file, flags, 0o600);
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : fallback;
}

async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function processIsDefinitelyDead(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM and other platform-specific failures do not prove that the owner
    // exited. Failing closed can temporarily block a save, but it cannot delete
    // a lock that still protects a live writer.
    return error?.code === 'ESRCH';
  }
}

export class BridgeFileBusyError extends Error {
  constructor(cause) {
    super(
      '本机数据目录暂时被占用或没有写入权限。Bridge 已自动重试但仍无法保存，请稍后重试，并检查安全软件、同步工具和目录权限。',
      { cause },
    );
    this.name = 'BridgeFileBusyError';
    this.code = 'BRIDGE_FILE_BUSY';
  }
}

/**
 * Windows can transiently reject a same-directory atomic rename while an
 * antivirus, indexer, or sync client has a short-lived handle open. Keep the
 * atomic contract and retry only those transient errors; never fall back to a
 * copy-overwrite that could expose a partially committed project revision.
 */
export async function renameWithTransientRetry(
  source,
  destination,
  { renameFile = rename, wait = sleep, backoffMs = DEFAULT_RENAME_BACKOFF_MS } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await renameFile(source, destination);
    } catch (error) {
      if (!TRANSIENT_RENAME_ERROR_CODES.has(error?.code)) throw error;
      if (attempt >= backoffMs.length) throw new BridgeFileBusyError(error);
      await wait(backoffMs[attempt]);
    }
  }
}

export async function atomicWriteJson(file, value, { maxBytes = Number.POSITIVE_INFINITY } = {}) {
  const serialized = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(serialized) > maxBytes) {
    throw new Error('JSON 文件超过本机 Bridge 的安全大小上限。');
  }
  const directory = dirname(file);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);
  try {
    await writeDurableFile(temporary, serialized);
    await renameWithTransientRetry(temporary, file);
    await fsyncDirectory(directory);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return value;
}

export async function readJsonIfExists(file, label = 'JSON 文件') {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}损坏，已拒绝覆盖：${file}`);
  }
}

export class ProjectRevisionConflictError extends Error {
  constructor(currentRevision) {
    super('项目已被其他终端更新，请先合并最新内容。');
    this.name = 'ProjectRevisionConflictError';
    this.code = 'PROJECT_REVISION_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

export class BridgeProjectLockTimeoutError extends Error {
  constructor() {
    super('主机画布正由另一个 Bridge 写入，等待文件锁超时，请稍后重试。');
    this.name = 'BridgeProjectLockTimeoutError';
    this.code = 'PROJECT_LOCK_TIMEOUT';
  }
}

export class ProjectArchivedError extends Error {
  constructor() {
    super('项目已经归档，已拒绝过期的写入。');
    this.name = 'ProjectArchivedError';
    this.code = 'PROJECT_ARCHIVED';
  }
}

function defaultSharedProject(projectId, projectName = projectId) {
  return {
    version: 2,
    projectId,
    projectName: String(projectName || projectId),
    workspaces: {},
    tabs: [],
    assets: [],
    trash: [],
    genParams: {},
    activeTags: [],
    revision: 0,
    updatedAt: 0,
  };
}

function normalizeLegacyProject(projectId, value) {
  if (value?.version === 2 && isRecord(value.workspaces)) {
    return {
      ...defaultSharedProject(projectId, value.projectName),
      ...value,
      version: 2,
      projectId,
      workspaces: { ...value.workspaces },
      trash: Array.isArray(value.trash) ? value.trash : [],
      revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
      updatedAt: Number(value.updatedAt) || 0,
    };
  }
  if (value?.version === 1 && Array.isArray(value.nodes)) {
    const shared = defaultSharedProject(projectId, value.projectName);
    const metadata = Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          !['version', 'projectId', 'nodes', 'edges', 'revision', 'updatedAt'].includes(key),
      ),
    );
    return {
      ...shared,
      ...metadata,
      version: 2,
      projectId,
      workspaces: {
        views: { nodes: value.nodes, edges: Array.isArray(value.edges) ? value.edges : [] },
      },
      revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
      updatedAt: Number(value.updatedAt) || 0,
    };
  }
  throw new Error('项目文件格式不受支持。');
}

function projectMetadata(shared) {
  return Object.fromEntries(
    Object.entries(shared).filter(
      ([key]) =>
        ![
          'version',
          'projectId',
          'projectName',
          'workspaces',
          'trash',
          'revision',
          'updatedAt',
        ].includes(key),
    ),
  );
}

function normalizedManifestPatch(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => MANIFEST_PATCH_FIELDS.has(key)),
  );
}

function publicManifest(manifest) {
  return {
    ...manifest.metadata,
    version: BRIDGE_PROJECT_SCHEMA_VERSION,
    projectId: manifest.projectId,
    projectName: manifest.projectName,
    revision: manifest.revision,
    updatedAt: manifest.updatedAt,
    currentRevision: manifest.currentRevision,
    currentWorkspace: manifest.currentWorkspace,
    workspaceIds: [...manifest.workspaceIds],
  };
}

function revisionName(revision) {
  return `${String(revision).padStart(12, '0')}-${randomUUID().replaceAll('-', '')}`;
}

export class BridgeProjectStorage {
  constructor({
    dataRoot,
    legacyProjectsRoot,
    legacyArchiveRoot,
    maxProjectBytes = 64 * 1024 * 1024,
    retainedRevisionCount = 20,
    projectLockTimeoutMs = DEFAULT_PROJECT_LOCK_TIMEOUT_MS,
    projectLockRetryMs = DEFAULT_PROJECT_LOCK_RETRY_MS,
    projectLockStaleMs = DEFAULT_PROJECT_LOCK_STALE_MS,
  } = {}) {
    if (!dataRoot) throw new Error('BridgeProjectStorage 需要明确的数据根目录。');
    this.dataRoot = resolve(dataRoot);
    this.projectsRoot = join(this.dataRoot, 'projects');
    this.legacyProjectsRoot = legacyProjectsRoot ? resolve(legacyProjectsRoot) : this.projectsRoot;
    this.archiveRoot = join(this.dataRoot, 'project-archive');
    this.projectTombstonesRoot = join(this.archiveRoot, '.tombstones');
    this.legacyArchiveRoot = legacyArchiveRoot ? resolve(legacyArchiveRoot) : this.archiveRoot;
    this.maxProjectBytes = maxProjectBytes;
    this.retainedRevisionCount = Math.max(2, Math.min(100, Number(retainedRevisionCount) || 20));
    this.projectLocksRoot = join(this.dataRoot, '.bridge-locks', 'projects');
    this.projectLockTimeoutMs = positiveMilliseconds(
      projectLockTimeoutMs,
      DEFAULT_PROJECT_LOCK_TIMEOUT_MS,
    );
    this.projectLockRetryMs = positiveMilliseconds(
      projectLockRetryMs,
      DEFAULT_PROJECT_LOCK_RETRY_MS,
    );
    this.projectLockStaleMs = positiveMilliseconds(
      projectLockStaleMs,
      DEFAULT_PROJECT_LOCK_STALE_MS,
    );
    this.writeQueues = new Map();
  }

  projectDirectory(projectId) {
    return join(this.projectsRoot, assertProjectId(projectId));
  }

  sourceProjectDirectory(projectId) {
    const id = assertProjectId(projectId);
    const current = this.projectDirectory(id);
    if (
      id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID ||
      existsSync(current) ||
      this.projectsRoot === this.legacyProjectsRoot
    ) {
      return current;
    }
    return join(this.legacyProjectsRoot, id);
  }

  projectTombstoneFile(projectId) {
    return join(this.projectTombstonesRoot, `${assertProjectId(projectId)}.json`);
  }

  #projectLockPaths(projectId) {
    const id = assertProjectId(projectId);
    return {
      lockFile: join(this.projectLocksRoot, `${id}.lock`),
      reclaimFile: join(this.projectLocksRoot, `${id}.reclaim`),
    };
  }

  #parseProjectLockOwner(projectId, raw) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    const id = assertProjectId(projectId);
    const pid = Number(value?.pid);
    const token = String(value?.token || '');
    const ownerFile = String(value?.ownerFile || '');
    if (
      value?.version !== PROJECT_LOCK_SCHEMA_VERSION ||
      value?.projectId !== id ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      !PROJECT_LOCK_TOKEN_RE.test(token) ||
      ownerFile !== `.${id}.${pid}.${token}.owner` ||
      !Number.isFinite(Number(value?.acquiredAt))
    ) {
      return null;
    }
    return {
      version: PROJECT_LOCK_SCHEMA_VERSION,
      projectId: id,
      pid,
      token,
      ownerFile,
      acquiredAt: Number(value.acquiredAt),
    };
  }

  async #readProjectLockOwner(projectId, lockFile) {
    try {
      return this.#parseProjectLockOwner(projectId, await readFile(lockFile, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  #isReclaimableProjectLock(owner) {
    return Boolean(
      owner &&
      Date.now() - owner.acquiredAt >= this.projectLockStaleMs &&
      processIsDefinitelyDead(owner.pid),
    );
  }

  async #removeProjectLockIfOwned(projectId, lockFile, token) {
    const current = await this.#readProjectLockOwner(projectId, lockFile);
    if (current?.token !== token) return false;
    await rm(lockFile);
    return true;
  }

  async #tryReclaimStaleProjectLock(projectId, lockFile, reclaimFile) {
    const observed = await this.#readProjectLockOwner(projectId, lockFile);
    if (!this.#isReclaimableProjectLock(observed)) return false;

    const reclaimToken = randomUUID().replaceAll('-', '');
    try {
      await writeDurableFile(
        reclaimFile,
        JSON.stringify({
          version: PROJECT_LOCK_SCHEMA_VERSION,
          projectId,
          pid: process.pid,
          token: reclaimToken,
          acquiredAt: Date.now(),
        }),
      );
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      throw error;
    }

    try {
      // Acquirers check the reclaim marker both before and after their atomic
      // link. Re-read under that marker so another contender cannot replace an
      // old lock and have its live lock removed by this recovery pass.
      const current = await this.#readProjectLockOwner(projectId, lockFile);
      if (current?.token !== observed.token || !this.#isReclaimableProjectLock(current)) {
        return false;
      }
      await rm(lockFile);
      await rm(join(this.projectLocksRoot, current.ownerFile), { force: true }).catch(() => {});
      return true;
    } finally {
      await rm(reclaimFile, { force: true }).catch(() => {});
    }
  }

  async #acquireProjectFileLock(projectId) {
    const id = assertProjectId(projectId);
    const { lockFile, reclaimFile } = this.#projectLockPaths(id);
    await mkdir(this.projectLocksRoot, { recursive: true });
    const token = randomUUID().replaceAll('-', '');
    const ownerFileName = `.${id}.${process.pid}.${token}.owner`;
    const ownerFile = join(this.projectLocksRoot, ownerFileName);
    const owner = {
      version: PROJECT_LOCK_SCHEMA_VERSION,
      projectId: id,
      pid: process.pid,
      token,
      ownerFile: ownerFileName,
      acquiredAt: Date.now(),
    };
    await writeDurableFile(ownerFile, JSON.stringify(owner));
    const deadline = Date.now() + this.projectLockTimeoutMs;
    let acquired = false;
    let ownsLock = false;

    try {
      while (true) {
        if (!(await pathExists(reclaimFile))) {
          try {
            // The owner record is durable before this exclusive hard-link is
            // created, so even a crash cannot leave an unidentifiable live lock.
            await link(ownerFile, lockFile);
            ownsLock = true;
            if (await pathExists(reclaimFile)) {
              await this.#removeProjectLockIfOwned(id, lockFile, token);
              ownsLock = false;
            } else {
              acquired = true;
              return async () => {
                try {
                  await this.#removeProjectLockIfOwned(id, lockFile, token);
                } finally {
                  await rm(ownerFile, { force: true }).catch(() => {});
                }
              };
            }
          } catch (error) {
            if (error?.code !== 'EEXIST') throw error;
          }
        }

        if (await this.#tryReclaimStaleProjectLock(id, lockFile, reclaimFile)) continue;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new BridgeProjectLockTimeoutError();
        await sleep(Math.min(this.projectLockRetryMs, remaining));
      }
    } finally {
      if (!acquired) {
        if (ownsLock) await this.#removeProjectLockIfOwned(id, lockFile, token).catch(() => {});
        await rm(ownerFile, { force: true }).catch(() => {});
      }
    }
  }

  async #withProjectLock(projectId, action, { allowArchived = false } = {}) {
    const id = assertProjectId(projectId);
    const previous = this.writeQueues.get(id) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        const release = await this.#acquireProjectFileLock(id);
        try {
          if (!allowArchived && (await this.#isProjectArchivedUnlocked(id))) {
            throw new ProjectArchivedError();
          }
          return await action();
        } finally {
          await release();
        }
      });
    this.writeQueues.set(id, operation);
    try {
      return await operation;
    } finally {
      if (this.writeQueues.get(id) === operation) this.writeQueues.delete(id);
    }
  }

  async #isProjectArchivedUnlocked(projectId) {
    const id = assertProjectId(projectId);
    if (await pathExists(this.projectTombstoneFile(id))) return true;
    const roots = [this.archiveRoot];
    if (id !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID && !roots.includes(this.legacyArchiveRoot)) {
      roots.push(this.legacyArchiveRoot);
    }
    for (const root of roots) {
      try {
        const entries = await readdir(root);
        if (entries.some((name) => name.startsWith(`${id}-`))) return true;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return false;
  }

  async isProjectArchived(projectId) {
    return this.#isProjectArchivedUnlocked(assertProjectId(projectId));
  }

  async #readDocument(projectId) {
    const id = assertProjectId(projectId);
    const files = [join(this.projectDirectory(id), 'project.json')];
    const legacyFile = join(this.legacyProjectsRoot, id, 'project.json');
    // `main-canvas` belongs exclusively to the configured data root. Falling
    // back to the application's legacy directory here could silently populate
    // a fresh deployment with another installation's nodes and edges.
    if (id !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID && !files.includes(legacyFile)) {
      files.push(legacyFile);
    }
    for (const file of files) {
      try {
        const raw = await readFile(file, 'utf8');
        const value = JSON.parse(raw);
        return { file, raw, value };
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return null;
  }

  async #readRevision(projectId, manifest, projectRoot = this.projectDirectory(projectId)) {
    this.#assertManifest(projectId, manifest);
    const revisionRoot = join(projectRoot, 'revisions', manifest.currentRevision);
    const workspaces = {};
    for (const workspaceIdValue of manifest.workspaceIds) {
      const workspaceId = assertBridgeWorkspaceId(workspaceIdValue);
      workspaces[workspaceId] = JSON.parse(
        await readFile(join(revisionRoot, 'workspaces', `${workspaceId}.json`), 'utf8'),
      );
    }
    let trash = [];
    try {
      const storedTrash = JSON.parse(await readFile(join(revisionRoot, 'trash.json'), 'utf8'));
      if (!Array.isArray(storedTrash)) throw new Error('项目回收站文件格式无效。');
      trash = storedTrash;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return {
      ...manifest.metadata,
      version: 2,
      projectId,
      projectName: String(manifest.projectName || projectId),
      workspaces,
      trash,
      revision: Number(manifest.revision) || 0,
      updatedAt: Number(manifest.updatedAt) || 0,
    };
  }

  async #readRetainedRevision(projectId, revision) {
    const id = assertProjectId(projectId);
    if (!Number.isSafeInteger(revision) || revision < 0) return null;
    if (revision === 0) {
      return {
        shared: defaultSharedProject(id),
        manifest: null,
      };
    }
    const revisionsRoot = join(this.projectDirectory(id), 'revisions');
    let entries;
    try {
      entries = await readdir(revisionsRoot);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    const prefix = `${String(revision).padStart(12, '0')}-`;
    const matches = entries.filter(
      (entry) => entry.startsWith(prefix) && REVISION_ID_RE.test(entry),
    );
    if (matches.length !== 1) return null;
    const revisionRoot = join(revisionsRoot, matches[0]);
    const manifest = await readJsonIfExists(join(revisionRoot, 'revision.json'), '项目历史修订');
    if (
      !manifest ||
      Number(manifest.revision) !== revision ||
      manifest.currentRevision !== matches[0]
    ) {
      return null;
    }
    return {
      shared: await this.#readRevision(id, manifest),
      manifest,
    };
  }

  #assertManifest(projectId, manifest) {
    if (
      manifest?.version !== BRIDGE_PROJECT_SCHEMA_VERSION ||
      manifest?.format !== 'qiansi-canvas-project' ||
      manifest?.projectId !== projectId ||
      !REVISION_ID_RE.test(String(manifest.currentRevision || '')) ||
      !Array.isArray(manifest.workspaceIds) ||
      !isRecord(manifest.metadata)
    ) {
      throw new Error('项目 manifest 格式无效。');
    }
    for (const workspaceIdValue of manifest.workspaceIds) {
      assertBridgeWorkspaceId(workspaceIdValue);
    }
  }

  async #readState(projectId) {
    const id = assertProjectId(projectId);
    const document = await this.#readDocument(id);
    if (!document) return { shared: null, manifest: null, legacyRaw: '', sourceDirectory: '' };
    if (document.value?.version === BRIDGE_PROJECT_SCHEMA_VERSION) {
      return {
        shared: await this.#readRevision(id, document.value, dirname(document.file)),
        manifest: document.value,
        legacyRaw: '',
        sourceDirectory: dirname(document.file),
      };
    }
    return {
      shared: normalizeLegacyProject(id, document.value),
      manifest: null,
      legacyRaw: document.raw,
      sourceDirectory: dirname(document.file),
    };
  }

  async readProject(projectId) {
    if (await this.isProjectArchived(projectId)) return null;
    return (await this.#readState(projectId)).shared;
  }

  async readProjectRecord(projectId) {
    const id = assertProjectId(projectId);
    if (await this.isProjectArchived(id)) return null;
    const state = await this.#readState(id);
    if (!state.shared) return null;
    return {
      workspace: state.shared,
      revision: state.shared.revision,
      manifest: state.manifest
        ? publicManifest(state.manifest)
        : {
            ...projectMetadata(state.shared),
            version: 2,
            projectId: id,
            projectName: state.shared.projectName,
            revision: state.shared.revision,
            updatedAt: state.shared.updatedAt,
            workspaceIds: Object.keys(state.shared.workspaces),
          },
    };
  }

  /**
   * Create one deterministic empty project when it does not exist, without
   * ever replacing an existing legacy or revision-backed project. The caller
   * owns the product-level identity; this method only supplies an atomic,
   * idempotent storage primitive for the Bridge's canonical canvas.
   */
  async ensureProject(
    projectId,
    {
      projectName = projectId,
      workspaceId: workspaceIdValue = 'views',
      workspace = { nodes: [], edges: [] },
      manifestPatch = {},
    } = {},
  ) {
    const id = assertProjectId(projectId);
    const workspaceId = assertBridgeWorkspaceId(workspaceIdValue);
    if (!isRecord(workspace)) throw new Error('工作台内容无效。');
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      if (state.shared) {
        return {
          workspace: state.shared,
          manifest: state.manifest
            ? publicManifest(state.manifest)
            : {
                ...projectMetadata(state.shared),
                version: 2,
                projectId: id,
                projectName: state.shared.projectName,
                revision: state.shared.revision,
                updatedAt: state.shared.updatedAt,
                workspaceIds: Object.keys(state.shared.workspaces),
              },
          revision: state.shared.revision,
          savedAt: state.shared.updatedAt,
          created: false,
        };
      }
      const patch = normalizedManifestPatch(manifestPatch);
      const shared = {
        ...defaultSharedProject(id, projectName),
        ...patch,
        version: 2,
        projectId: id,
        projectName: String(patch.projectName || projectName || id),
        workspace: workspaceId,
        currentWorkspace: workspaceId,
        activeWorkspace: workspaceId,
        workspaces: { [workspaceId]: workspace },
        trash: [],
        revision: 0,
        updatedAt: 0,
      };
      const committed = await this.#commit(id, shared, {
        expectedRevision: 0,
        currentShared: null,
        currentManifest: null,
      });
      return {
        workspace: committed.shared,
        manifest: publicManifest(committed.manifest),
        revision: committed.shared.revision,
        savedAt: committed.shared.updatedAt,
        created: true,
      };
    });
  }

  async readWorkspace(projectId, workspaceIdValue) {
    const id = assertProjectId(projectId);
    if (await this.isProjectArchived(id)) return null;
    const workspaceId = assertBridgeWorkspaceId(workspaceIdValue);
    const document = await this.#readDocument(id);
    if (!document) return null;
    if (document.value?.version === BRIDGE_PROJECT_SCHEMA_VERSION) {
      const manifest = document.value;
      this.#assertManifest(id, manifest);
      let workspace = null;
      if (manifest.workspaceIds.includes(workspaceId)) {
        workspace = JSON.parse(
          await readFile(
            join(
              dirname(document.file),
              'revisions',
              manifest.currentRevision,
              'workspaces',
              `${workspaceId}.json`,
            ),
            'utf8',
          ),
        );
      }
      return {
        projectId: id,
        workspaceId,
        workspace,
        revision: Number(manifest.revision) || 0,
        updatedAt: Number(manifest.updatedAt) || 0,
        manifest: publicManifest(manifest),
      };
    }
    const shared = normalizeLegacyProject(id, document.value);
    return {
      projectId: id,
      workspaceId,
      workspace: shared.workspaces[workspaceId] ?? null,
      revision: shared.revision,
      updatedAt: shared.updatedAt,
      manifest: {
        version: 2,
        projectId: id,
        projectName: shared.projectName,
        revision: shared.revision,
        updatedAt: shared.updatedAt,
        workspaceIds: Object.keys(shared.workspaces),
        ...projectMetadata(shared),
      },
    };
  }

  async readTrash(projectId) {
    const id = assertProjectId(projectId);
    if (await this.isProjectArchived(id)) return null;
    const document = await this.#readDocument(id);
    if (!document) return null;
    if (document.value?.version === BRIDGE_PROJECT_SCHEMA_VERSION) {
      const manifest = document.value;
      this.#assertManifest(id, manifest);
      const trashFile = join(
        dirname(document.file),
        'revisions',
        manifest.currentRevision,
        'trash.json',
      );
      let trash = [];
      try {
        trash = JSON.parse(await readFile(trashFile, 'utf8'));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (!Array.isArray(trash)) throw new Error('项目回收站文件格式无效。');
      return {
        projectId: id,
        trash,
        revision: Number(manifest.revision) || 0,
        updatedAt: Number(manifest.updatedAt) || 0,
        manifest: publicManifest(manifest),
      };
    }
    const shared = normalizeLegacyProject(id, document.value);
    return {
      projectId: id,
      trash: shared.trash,
      revision: shared.revision,
      updatedAt: shared.updatedAt,
      manifest: {
        version: 2,
        projectId: id,
        projectName: shared.projectName,
        revision: shared.revision,
        updatedAt: shared.updatedAt,
        workspaceIds: Object.keys(shared.workspaces),
        ...projectMetadata(shared),
      },
    };
  }

  async #preserveLegacy(projectId, legacyRaw) {
    if (!legacyRaw) return;
    const legacyDirectory = join(this.projectDirectory(projectId), 'legacy');
    await mkdir(legacyDirectory, { recursive: true });
    const file = join(legacyDirectory, `project-${Date.now()}-${randomUUID()}.json`);
    await writeDurableFile(file, legacyRaw);
    await fsyncDirectory(legacyDirectory);
  }

  async #commit(
    projectId,
    shared,
    { expectedRevision, legacyRaw = '', currentShared = null, currentManifest = null } = {},
  ) {
    const id = assertProjectId(projectId);
    const currentRevision = Number.isSafeInteger(shared.revision) ? shared.revision : 0;
    // Repeated autosave requests can legitimately arrive from a stale tab or a
    // second development origin. If the complete durable payload is already
    // current, return that revision instead of manufacturing a new immutable
    // revision or reporting a conflict. The CAS guard remains strict whenever
    // any workspace, manifest field, asset, or trash entry actually differs.
    if (currentManifest && currentShared && isDeepStrictEqual(shared, currentShared)) {
      return { shared: currentShared, manifest: currentManifest, unchanged: true };
    }
    if (Number.isSafeInteger(expectedRevision) && expectedRevision !== currentRevision) {
      throw new ProjectRevisionConflictError(currentRevision);
    }
    const revision = currentRevision + 1;
    const now = Date.now();
    const revisionId = revisionName(revision);
    const projectRoot = this.projectDirectory(id);
    const revisionsRoot = join(projectRoot, 'revisions');
    const temporaryRevision = join(revisionsRoot, `.tmp-${revisionId}-${randomUUID()}`);
    const finalRevision = join(revisionsRoot, revisionId);
    const workspaceDirectory = join(temporaryRevision, 'workspaces');
    const workspaceIds = Object.keys(shared.workspaces).map(assertBridgeWorkspaceId).sort();
    const serializedWorkspaces = new Map(
      workspaceIds.map((workspaceId) => [
        workspaceId,
        JSON.stringify(shared.workspaces[workspaceId], null, 2),
      ]),
    );
    const serializedTrash = JSON.stringify(
      Array.isArray(shared.trash) ? shared.trash : [],
      null,
      2,
    );
    const manifest = {
      version: BRIDGE_PROJECT_SCHEMA_VERSION,
      format: 'qiansi-canvas-project',
      projectId: id,
      projectName: String(shared.projectName || id),
      revision,
      updatedAt: now,
      currentRevision: revisionId,
      currentWorkspace: String(shared.workspace || ''),
      workspaceIds,
      metadata: projectMetadata(shared),
    };
    const serializedManifest = JSON.stringify(manifest, null, 2);
    const serializedRevisionBytes =
      [...serializedWorkspaces.values()].reduce(
        (total, serialized) => total + Buffer.byteLength(serialized),
        0,
      ) +
      Buffer.byteLength(serializedTrash) +
      Buffer.byteLength(serializedManifest);
    if (serializedRevisionBytes > this.maxProjectBytes) {
      throw new Error('项目文件过大，请先把大图片和视频保存到素材库。');
    }
    await mkdir(workspaceDirectory, { recursive: true });
    try {
      for (const workspaceId of workspaceIds) {
        await writeDurableFile(
          join(workspaceDirectory, `${workspaceId}.json`),
          serializedWorkspaces.get(workspaceId),
        );
      }
      await writeDurableFile(join(temporaryRevision, 'trash.json'), serializedTrash);
      await writeDurableFile(join(temporaryRevision, 'revision.json'), serializedManifest);
      await fsyncDirectory(workspaceDirectory);
      await fsyncDirectory(temporaryRevision);
      await renameWithTransientRetry(temporaryRevision, finalRevision);
      await fsyncDirectory(revisionsRoot);
      await this.#preserveLegacy(id, legacyRaw);
      await atomicWriteJson(join(projectRoot, 'project.json'), manifest, {
        maxBytes: this.maxProjectBytes,
      });
      void this.#pruneRevisions(id, revisionId);
      return {
        shared: { ...shared, projectId: id, revision, updatedAt: now },
        manifest,
      };
    } catch (error) {
      await rm(temporaryRevision, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async #pruneRevisions(projectId, currentRevision) {
    const revisionsRoot = join(this.projectDirectory(projectId), 'revisions');
    try {
      const revisions = (await readdir(revisionsRoot))
        .filter((name) => REVISION_ID_RE.test(name))
        .sort()
        .reverse();
      const retained = new Set([
        currentRevision,
        ...revisions
          .filter((name) => name !== currentRevision)
          .slice(0, this.retainedRevisionCount - 1),
      ]);
      for (const revision of revisions) {
        if (retained.has(revision) || revision === currentRevision) continue;
        await rm(join(revisionsRoot, revision), { recursive: true, force: true });
      }
      await fsyncDirectory(revisionsRoot);
    } catch {
      // Retention is best effort and never changes the committed current pointer.
    }
  }

  async saveProject(projectId, body) {
    const id = assertProjectId(projectId);
    if (!Number.isSafeInteger(body?.expectedRevision)) {
      throw new Error('保存项目必须提供 expectedRevision。');
    }
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      const incomingSource = body?.workspace;
      const incoming = normalizeLegacyProject(id, incomingSource);
      const base = state.shared ?? defaultSharedProject(id, incoming.projectName);
      const incomingFields = isRecord(incomingSource)
        ? Object.fromEntries(
            Object.entries(incoming).filter(
              ([key]) =>
                own(incomingSource, key) &&
                !['version', 'projectId', 'workspaces', 'trash', 'revision', 'updatedAt'].includes(
                  key,
                ),
            ),
          )
        : {};
      let merged = {
        ...base,
        ...incomingFields,
        projectId: id,
        workspaces: { ...base.workspaces, ...incoming.workspaces },
        trash: own(incomingSource, 'trash') ? incoming.trash : base.trash,
        revision: base.revision,
        updatedAt: base.updatedAt,
      };
      let rebased = false;
      if (
        body.expectedRevision !== base.revision &&
        !(state.manifest && state.shared && isDeepStrictEqual(merged, state.shared))
      ) {
        const historical = await this.#readRetainedRevision(id, body.expectedRevision);
        if (!historical) throw new ProjectRevisionConflictError(base.revision);
        const localAtExpectedRevision = {
          ...historical.shared,
          ...incomingFields,
          projectId: id,
          workspaces: { ...historical.shared.workspaces, ...incoming.workspaces },
          trash: own(incomingSource, 'trash') ? incoming.trash : historical.shared.trash,
          revision: historical.shared.revision,
          updatedAt: historical.shared.updatedAt,
        };
        const projectMerge = mergeBridgeJsonConflictFree(
          historical.shared,
          localAtExpectedRevision,
          base,
        );
        if (!projectMerge.ok) throw new ProjectRevisionConflictError(base.revision);
        merged = {
          ...projectMerge.value,
          projectId: id,
          revision: base.revision,
          updatedAt: base.updatedAt,
        };
        rebased = true;
      }
      const serialized = JSON.stringify(merged);
      if (Buffer.byteLength(serialized) > this.maxProjectBytes) {
        throw new Error('项目文件过大，请先把大图片和视频保存到素材库。');
      }
      const committed = await this.#commit(id, merged, {
        expectedRevision: rebased ? base.revision : body.expectedRevision,
        legacyRaw: state.legacyRaw,
        currentShared: state.shared,
        currentManifest: state.manifest,
      });
      return {
        workspace: committed.shared,
        manifest: publicManifest(committed.manifest),
        revision: committed.shared.revision,
        savedAt: committed.shared.updatedAt,
        rebased,
      };
    });
  }

  async saveWorkspace(projectId, workspaceIdValue, body) {
    const id = assertProjectId(projectId);
    const workspaceId = assertBridgeWorkspaceId(workspaceIdValue);
    if (!Number.isSafeInteger(body?.expectedRevision)) {
      throw new Error('保存工作台必须提供 expectedRevision。');
    }
    if (!isRecord(body?.workspace)) throw new Error('工作台内容无效。');
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      const base = state.shared ?? defaultSharedProject(id);
      let patch = normalizedManifestPatch(body.manifestPatch);
      let workspace = body.workspace;
      let rebased = false;
      let merged = {
        ...base,
        ...patch,
        projectId: id,
        workspaces: { ...base.workspaces, [workspaceId]: workspace },
        trash: base.trash,
        revision: base.revision,
        updatedAt: base.updatedAt,
      };
      if (
        body.expectedRevision !== base.revision &&
        !(state.manifest && state.shared && isDeepStrictEqual(merged, state.shared))
      ) {
        const historical = await this.#readRetainedRevision(id, body.expectedRevision);
        if (!historical) throw new ProjectRevisionConflictError(base.revision);
        const historicalWorkspace = historical.shared.workspaces[workspaceId] ?? {
          nodes: [],
          edges: [],
        };
        const currentWorkspace = base.workspaces[workspaceId] ?? { nodes: [], edges: [] };
        const workspaceMerge = mergeBridgeJsonConflictFree(
          historicalWorkspace,
          workspace,
          currentWorkspace,
        );
        if (!workspaceMerge.ok) throw new ProjectRevisionConflictError(base.revision);

        const mergedPatch = {};
        for (const [key, localValue] of Object.entries(patch)) {
          const patchMerge = mergeBridgeEntry(
            own(historical.shared, key),
            historical.shared[key],
            true,
            localValue,
            own(base, key),
            base[key],
          );
          if (!patchMerge.ok || !patchMerge.present) {
            throw new ProjectRevisionConflictError(base.revision);
          }
          mergedPatch[key] = patchMerge.value;
        }
        workspace = workspaceMerge.value;
        patch = mergedPatch;
        rebased = true;
        merged = {
          ...base,
          ...patch,
          projectId: id,
          workspaces: { ...base.workspaces, [workspaceId]: workspace },
          trash: base.trash,
          revision: base.revision,
          updatedAt: base.updatedAt,
        };
      }
      const committed = await this.#commit(id, merged, {
        expectedRevision: rebased ? base.revision : body.expectedRevision,
        legacyRaw: state.legacyRaw,
        currentShared: state.shared,
        currentManifest: state.manifest,
      });
      return {
        projectId: id,
        workspaceId,
        workspace: committed.shared.workspaces[workspaceId],
        project: rebased ? committed.shared : undefined,
        revision: committed.shared.revision,
        updatedAt: committed.shared.updatedAt,
        manifest: publicManifest(committed.manifest),
        rebased,
      };
    });
  }

  async saveTrash(projectId, body) {
    const id = assertProjectId(projectId);
    if (!Number.isSafeInteger(body?.expectedRevision)) {
      throw new Error('保存回收站必须提供 expectedRevision。');
    }
    if (!Array.isArray(body?.trash)) throw new Error('回收站内容无效。');
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      const base = state.shared ?? defaultSharedProject(id);
      let patch = normalizedManifestPatch(body.manifestPatch);
      let trash = body.trash;
      let rebased = false;
      let merged = {
        ...base,
        ...patch,
        projectId: id,
        workspaces: base.workspaces,
        trash,
        revision: base.revision,
        updatedAt: base.updatedAt,
      };
      if (
        body.expectedRevision !== base.revision &&
        !(state.manifest && state.shared && isDeepStrictEqual(merged, state.shared))
      ) {
        const historical = await this.#readRetainedRevision(id, body.expectedRevision);
        if (!historical) throw new ProjectRevisionConflictError(base.revision);
        const trashMerge = mergeBridgeJsonConflictFree(historical.shared.trash, trash, base.trash);
        if (!trashMerge.ok) throw new ProjectRevisionConflictError(base.revision);
        const mergedPatch = {};
        for (const [key, localValue] of Object.entries(patch)) {
          const patchMerge = mergeBridgeEntry(
            own(historical.shared, key),
            historical.shared[key],
            true,
            localValue,
            own(base, key),
            base[key],
          );
          if (!patchMerge.ok || !patchMerge.present) {
            throw new ProjectRevisionConflictError(base.revision);
          }
          mergedPatch[key] = patchMerge.value;
        }
        trash = trashMerge.value;
        patch = mergedPatch;
        rebased = true;
        merged = {
          ...base,
          ...patch,
          projectId: id,
          workspaces: base.workspaces,
          trash,
          revision: base.revision,
          updatedAt: base.updatedAt,
        };
      }
      const committed = await this.#commit(id, merged, {
        expectedRevision: rebased ? base.revision : body.expectedRevision,
        legacyRaw: state.legacyRaw,
        currentShared: state.shared,
        currentManifest: state.manifest,
      });
      return {
        projectId: id,
        trash: committed.shared.trash,
        project: rebased ? committed.shared : undefined,
        revision: committed.shared.revision,
        updatedAt: committed.shared.updatedAt,
        manifest: publicManifest(committed.manifest),
        rebased,
      };
    });
  }

  async updateProjectMetadata(projectId, patchValue, { expectedRevision } = {}) {
    const id = assertProjectId(projectId);
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new Error('更新项目必须提供有效的 expectedRevision。');
    }
    const source = isRecord(patchValue) ? patchValue : {};
    const patch = normalizedManifestPatch({
      ...(own(source, 'projectName') ? { projectName: source.projectName } : {}),
      ...(own(source, 'name') ? { projectName: source.name, name: source.name } : {}),
      ...(own(source, 'title') ? { title: source.title } : {}),
      ...(own(source, 'coverUrl') ? { coverUrl: source.coverUrl } : {}),
      ...(own(source, 'coverAssetId') ? { coverAssetId: source.coverAssetId } : {}),
      ...(own(source, 'folderId') ? { folderId: source.folderId } : {}),
    });
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      if (!state.shared) throw new Error('项目不存在。');
      const base = state.shared;
      if (Number.isSafeInteger(expectedRevision) && expectedRevision !== base.revision) {
        throw new ProjectRevisionConflictError(base.revision);
      }
      const projectName = own(patch, 'projectName')
        ? String(patch.projectName || id)
        : base.projectName;
      const merged = {
        ...base,
        ...patch,
        projectId: id,
        projectName,
        workspaces: base.workspaces,
        trash: base.trash,
        revision: base.revision,
        updatedAt: base.updatedAt,
      };
      const committed = await this.#commit(id, merged, {
        expectedRevision: Number.isSafeInteger(expectedRevision) ? expectedRevision : base.revision,
        legacyRaw: state.legacyRaw,
        currentShared: state.shared,
        currentManifest: state.manifest,
      });
      return {
        projectId: id,
        workspace: committed.shared,
        manifest: publicManifest(committed.manifest),
        revision: committed.shared.revision,
        updatedAt: committed.shared.updatedAt,
      };
    });
  }

  async duplicateProject(
    sourceProjectId,
    targetProjectId,
    { projectName, manifestPatch = {} } = {},
  ) {
    const sourceId = assertProjectId(sourceProjectId);
    const targetId = assertProjectId(targetProjectId);
    if (sourceId === targetId) throw new Error('复制项目必须使用新的项目编号。');
    const snapshot = await this.#withProjectLock(sourceId, async () => {
      const state = await this.#readState(sourceId);
      if (!state.shared) throw new Error('项目不存在。');
      return structuredClone(state.shared);
    });
    return this.#withProjectLock(targetId, async () => {
      const existing = await this.#readState(targetId);
      if (existing.shared) {
        return {
          workspace: existing.shared,
          manifest: existing.manifest
            ? publicManifest(existing.manifest)
            : {
                ...projectMetadata(existing.shared),
                version: 2,
                projectId: targetId,
                projectName: existing.shared.projectName,
                revision: existing.shared.revision,
                updatedAt: existing.shared.updatedAt,
                workspaceIds: Object.keys(existing.shared.workspaces),
              },
          revision: existing.shared.revision,
          savedAt: existing.shared.updatedAt,
          created: false,
        };
      }
      const patch = normalizedManifestPatch(manifestPatch);
      const clone = {
        ...snapshot,
        ...patch,
        version: 2,
        projectId: targetId,
        projectName: String(projectName || patch.projectName || `${snapshot.projectName} 副本`),
        workspaces: structuredClone(snapshot.workspaces),
        trash: structuredClone(snapshot.trash),
        revision: 0,
        updatedAt: 0,
      };
      const committed = await this.#commit(targetId, clone, {
        expectedRevision: 0,
        currentShared: null,
        currentManifest: null,
      });
      return {
        workspace: committed.shared,
        manifest: publicManifest(committed.manifest),
        revision: committed.shared.revision,
        savedAt: committed.shared.updatedAt,
        created: true,
      };
    });
  }

  async archiveProject(projectId, { expectedRevision } = {}) {
    const id = assertProjectId(projectId);
    if (id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID) throw new Error('主画布不能归档。');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('归档项目必须提供 expectedRevision。');
    }
    return this.#withProjectLock(
      id,
      async () => {
        const tombstoneFile = this.projectTombstoneFile(id);
        const existingTombstone = await readJsonIfExists(tombstoneFile, '项目归档标记');
        if (existingTombstone) {
          if (
            existingTombstone.version !== PROJECT_TOMBSTONE_SCHEMA_VERSION ||
            existingTombstone.projectId !== id ||
            !/^[A-Za-z0-9_-]{2,80}-[0-9]+-[a-f0-9]{32}$/.test(
              String(existingTombstone.archiveName || ''),
            ) ||
            !['current', 'legacy'].includes(existingTombstone.archiveRoot)
          ) {
            throw new Error('项目归档标记损坏，已拒绝继续写入。');
          }
          const destinationRoot =
            existingTombstone.archiveRoot === 'legacy' ? this.legacyArchiveRoot : this.archiveRoot;
          const source =
            existingTombstone.archiveRoot === 'legacy'
              ? join(this.legacyProjectsRoot, id)
              : this.projectDirectory(id);
          const destination = join(destinationRoot, existingTombstone.archiveName);
          const sourceExists = await pathExists(source);
          const destinationExists = await pathExists(destination);
          if (sourceExists && !destinationExists) {
            await mkdir(destinationRoot, { recursive: true });
            await renameWithTransientRetry(source, destination);
            await fsyncDirectory(dirname(source));
            await fsyncDirectory(destinationRoot);
          } else if (sourceExists && destinationExists) {
            throw new Error('项目归档目标冲突，已拒绝覆盖任何数据。');
          } else if (!destinationExists) {
            throw new Error('项目归档数据缺失，已拒绝覆盖归档标记。');
          }
          return {
            success: true,
            archived: true,
            projectId: id,
            revision: Number(existingTombstone.revision) || 0,
            archivedAt: Number(existingTombstone.archivedAt) || 0,
            archiveName: existingTombstone.archiveName,
            alreadyArchived: true,
          };
        }

        const state = await this.#readState(id);
        if (!state.shared) throw new Error('项目不存在。');
        if (state.shared.revision !== expectedRevision) {
          throw new ProjectRevisionConflictError(state.shared.revision);
        }
        const source = state.sourceDirectory || this.sourceProjectDirectory(id);
        const useLegacyArchive =
          resolve(source) === resolve(join(this.legacyProjectsRoot, id)) &&
          resolve(source) !== resolve(this.projectDirectory(id));
        const destinationRoot = useLegacyArchive ? this.legacyArchiveRoot : this.archiveRoot;
        const archivedAt = Date.now();
        const archiveName = `${id}-${archivedAt}-${randomUUID().replaceAll('-', '')}`;
        const destination = join(destinationRoot, archiveName);
        const tombstone = {
          version: PROJECT_TOMBSTONE_SCHEMA_VERSION,
          projectId: id,
          revision: state.shared.revision,
          archivedAt,
          archiveName,
          archiveRoot: useLegacyArchive ? 'legacy' : 'current',
        };
        await mkdir(destinationRoot, { recursive: true });
        await atomicWriteJson(tombstoneFile, tombstone, { maxBytes: 64 * 1024 });
        await fsyncDirectory(this.projectTombstonesRoot);
        await fsyncDirectory(this.archiveRoot);
        // The tombstone intentionally remains if the move fails. A retry
        // resumes this same target while every late writer stays rejected.
        await renameWithTransientRetry(source, destination);
        await fsyncDirectory(dirname(source));
        await fsyncDirectory(destinationRoot);
        return {
          success: true,
          archived: true,
          projectId: id,
          revision: state.shared.revision,
          archivedAt,
          archiveName,
          alreadyArchived: false,
        };
      },
      { allowArchived: true },
    );
  }

  async restoreLatest(projectId) {
    const id = assertProjectId(projectId);
    return this.#withProjectLock(id, async () => {
      const state = await this.#readState(id);
      if (!state.shared) throw new Error('项目不存在。');
      let restored;
      let source = '';
      if (state.manifest) {
        const revisionsRoot = join(state.sourceDirectory || this.projectDirectory(id), 'revisions');
        const revisions = (await readdir(revisionsRoot))
          .filter((name) => REVISION_ID_RE.test(name) && name !== state.manifest.currentRevision)
          .sort()
          .reverse();
        if (!revisions.length) throw new Error('这个项目还没有可恢复的历史修订。');
        source = revisions[0];
        const manifest = JSON.parse(
          await readFile(join(revisionsRoot, source, 'revision.json'), 'utf8'),
        );
        restored = await this.#readRevision(
          id,
          manifest,
          state.sourceDirectory || this.projectDirectory(id),
        );
      } else {
        const snapshotsDirectory = join(
          state.sourceDirectory || this.projectDirectory(id),
          'snapshots',
        );
        const snapshots = (await readdir(snapshotsDirectory))
          .filter((name) => name.endsWith('.json'))
          .sort()
          .reverse();
        if (!snapshots.length) throw new Error('这个项目还没有可恢复的周期快照。');
        source = snapshots[0];
        restored = normalizeLegacyProject(
          id,
          JSON.parse(await readFile(join(snapshotsDirectory, source), 'utf8')),
        );
      }
      restored.revision = state.shared.revision;
      restored.updatedAt = state.shared.updatedAt;
      const committed = await this.#commit(id, restored, {
        expectedRevision: state.shared.revision,
        legacyRaw: state.legacyRaw,
      });
      return {
        success: true,
        snapshot: source,
        workspace: committed.shared,
        revision: committed.shared.revision,
        manifest: publicManifest(committed.manifest),
      };
    });
  }

  async hasArchivedCopy(projectId) {
    return this.isProjectArchived(projectId);
  }

  async diskUsage(projectId) {
    const directory = this.projectDirectory(projectId);
    const info = await stat(directory).catch(() => null);
    return info?.isDirectory() ? { directory } : null;
  }
}
