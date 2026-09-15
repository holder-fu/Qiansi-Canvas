import type { WorkspaceId } from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';
import { bridgeResourcePathname, resolveBridgeUrl } from '../lib/bridgeUrl';
import { stableJsonEqual } from '../lib/stableJson';

export type PersistedBridgeWorkspaceId = Exclude<WorkspaceId, 'home'>;

export interface BridgeProjectCatalogItem {
  id: string;
  name: string;
  revision?: number;
  updatedAt?: number;
  activeWorkspace?: PersistedBridgeWorkspaceId;
  autoCoverUrl?: string;
  autoCoverAssetId?: string;
}

export interface BridgeProjectCatalogResult {
  version: 2;
  projects: BridgeProjectCatalogItem[];
  primaryProjectId: string | null;
  updatedAt?: number;
}

export interface BridgePrimaryProjectResult {
  primaryProjectId: string;
  project: BridgeProjectCatalogItem | null;
  claimed: boolean;
}

export interface BridgeProjectManifest {
  version?: number;
  projectId?: string;
  projectName?: string;
  name?: string;
  title?: string;
  revision?: number;
  updatedAt?: number;
  workspace?: PersistedBridgeWorkspaceId;
  activeWorkspace?: PersistedBridgeWorkspaceId;
  currentWorkspace?: PersistedBridgeWorkspaceId;
  workspaceIds?: PersistedBridgeWorkspaceId[];
  tabs?: unknown[];
  activeTabId?: string;
  genParams?: Record<string, unknown>;
  activeTags?: string[];
  assets?: unknown[];
  [key: string]: unknown;
}

export interface BridgeWorkspaceReadResult<T, TProject = unknown> {
  projectId: string;
  workspaceId: PersistedBridgeWorkspaceId;
  workspace: T;
  project?: TProject;
  revision: number;
  manifest?: BridgeProjectManifest;
  rebased?: boolean;
}

export interface BridgeTrashReadResult<T, TProject = unknown> {
  projectId: string;
  trash: T;
  project?: TProject;
  revision: number;
  manifest?: BridgeProjectManifest;
  rebased?: boolean;
}

export interface BridgeProjectReadResult<T> {
  project: BridgeProjectCatalogItem | null;
  workspace: T | null;
  revision: number;
  manifest?: BridgeProjectManifest;
  rebased?: boolean;
}

interface BridgeErrorPayload {
  error?: string | { message?: string; code?: string };
  message?: string;
  currentRevision?: number;
}

function errorMessage(payload: BridgeErrorPayload, fallback: string) {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error === 'object' && payload.error.message?.trim()) {
    return payload.error.message;
  }
  return payload.message?.trim() || fallback;
}

async function readJson(response: Response): Promise<Record<string, unknown> & BridgeErrorPayload> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown> & BridgeErrorPayload;
}

function finiteRevision(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function manifestRevision(payload: Record<string, unknown>) {
  const manifest = payload.manifest as BridgeProjectManifest | undefined;
  const revision = payload.revision ?? manifest?.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('本机 Bridge 未返回有效修订号，已停止使用这次响应。');
  }
  return revision;
}

function assertBridgePayloadIdentity(
  payload: Record<string, unknown>,
  projectId: string,
  workspaceId?: PersistedBridgeWorkspaceId,
) {
  const manifest = payload.manifest as BridgeProjectManifest | undefined;
  if (payload.projectId !== undefined && payload.projectId !== projectId) {
    throw new Error('本机 Bridge 返回的项目标识不一致，已停止使用这次响应。');
  }
  if (manifest?.projectId !== undefined && manifest.projectId !== projectId) {
    throw new Error('本机 Bridge 清单的项目标识不一致，已停止使用这次响应。');
  }
  if (
    workspaceId !== undefined &&
    payload.workspaceId !== undefined &&
    payload.workspaceId !== workspaceId
  ) {
    throw new Error('本机 Bridge 返回的工作台标识不一致，已停止使用这次响应。');
  }
}

function bridgeRequest(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch) {
  return fetchImpl(resolveBridgeUrl(path), {
    cache: 'no-store',
    credentials: 'include',
    ...init,
  });
}

const BRIDGE_CANVAS_MEDIA_PATH = /^\/(?:asset-library\/files|media-preview\/files|output)\//u;

function managedBridgeCanvasMedia(value: string) {
  const pathname = bridgeResourcePathname(value);
  if (!pathname || !BRIDGE_CANVAS_MEDIA_PATH.test(pathname)) return;
  try {
    const resolved = new URL(resolveBridgeUrl(value));
    const portable = `${pathname}${resolved.search}${resolved.hash}`;
    return { portable, local: resolveBridgeUrl(portable) };
  } catch {
    return;
  }
}

/**
 * Only Bridge-owned absolute media addresses are made host-neutral. Third-party
 * URLs, asset IDs, object keys and array order are preserved exactly.
 */
export function portableBridgeCanvasValue<T>(value: T): T {
  if (typeof value === 'string') {
    return (managedBridgeCanvasMedia(value)?.portable ?? value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => portableBridgeCanvasValue(item)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, portableBridgeCanvasValue(item)]),
  ) as T;
}

export function localBridgeCanvasValue<T>(value: T): T {
  if (typeof value === 'string') {
    return (managedBridgeCanvasMedia(value)?.local ?? value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => localBridgeCanvasValue(item)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, localBridgeCanvasValue(item)]),
  ) as T;
}

const UNSAFE_BROWSER_MEDIA_URL = /^(?:blob:|data:[^,]+,|file:|filesystem:|qiansi-canvas-media:)/iu;

const OMIT_BROWSER_SESSION_MEDIA = Symbol('omit-browser-session-media');
const REFERENCE_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'text']);
const SESSION_MEDIA_FIELDS = new Set([
  'originalUrl',
  'previewUrl',
  'imageUrl',
  'imagePreviewUrl',
  'imagePreviewPosterUrl',
  'videoUrl',
  'videoPreviewUrl',
  'audioUrl',
  'model3dUrl',
  'directorPrevisUrl',
  'directorPrevisReferenceUrl',
  'directorLayoutUrl',
  'annotationSourceUrl',
  'sceneReferenceUrl',
  'sceneUrl',
  'modelUrl',
  'maskImage',
  'maskPreview',
  'thumbnail',
  'thumbnailUrl',
  'directorThumbnailUrl',
  'sourceUrl',
  'posterUrl',
  'images',
  'videos',
  'audios',
  'models3d',
]);
const SESSION_MEDIA_CONTAINER_FIELDS = new Set([
  'portInputs',
  'composerReferenceSubmission',
  'directorImages',
]);
const TEXT_CONTENT_FIELDS = new Set([
  'prompt',
  'negativePrompt',
  'description',
  'result',
  'title',
  'label',
  'name',
  'outputText',
  'textInstruction',
  'textContent',
  'generationError',
  'enhancementError',
]);
const TEXT_OUTPUT_KINDS = new Set(['text', 'script', 'llm', 'plugin']);

export const SESSION_MEDIA_PERSISTENCE_STATE = 'session-only' as const;

interface SanitizedBridgeWorkContent {
  value: unknown | typeof OMIT_BROWSER_SESSION_MEDIA;
  containsSessionMedia: boolean;
  requiresSessionMarker: boolean;
  containsUnscopedSessionMedia: boolean;
}

interface BridgeWorkContentContext {
  field?: string;
  parent?: Record<string, unknown>;
  path: readonly string[];
}

function canDescribeSessionMedia(value: Record<string, unknown>) {
  return (
    typeof value.kind === 'string' ||
    (typeof value.id === 'string' &&
      typeof value.label === 'string' &&
      typeof value.type === 'string' &&
      REFERENCE_MEDIA_TYPES.has(value.type))
  );
}

function isComposerMediaReference(value: Record<string, unknown> | undefined) {
  return Boolean(
    value &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.type === 'string' &&
    REFERENCE_MEDIA_TYPES.has(value.type),
  );
}

function isTextContentContext(context: BridgeWorkContentContext) {
  if (
    context.field &&
    (TEXT_CONTENT_FIELDS.has(context.field) ||
      /(?:prompt|description|result|title|label|name|text|message|error|instruction|content)$/iu.test(
        context.field,
      ))
  ) {
    return true;
  }
  return (
    context.field === 'output' &&
    typeof context.parent?.kind === 'string' &&
    TEXT_OUTPUT_KINDS.has(context.parent.kind)
  );
}

function isExplicitMediaContext(context: BridgeWorkContentContext) {
  if (context.field && SESSION_MEDIA_FIELDS.has(context.field)) return true;
  if (context.field === 'output' && !isTextContentContext(context)) {
    return typeof context.parent?.kind === 'string';
  }
  if (
    (context.field === 'url' || context.field === 'previewUrl') &&
    isComposerMediaReference(context.parent)
  ) {
    return true;
  }
  return context.path.some((segment) => SESSION_MEDIA_CONTAINER_FIELDS.has(segment));
}

function sanitizeBridgeWorkContent(
  value: unknown,
  context: BridgeWorkContentContext = { path: [] },
): SanitizedBridgeWorkContent {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (UNSAFE_BROWSER_MEDIA_URL.test(normalized) && !isPlaceholderMediaUrl(normalized)) {
      if (isTextContentContext(context)) {
        return {
          value,
          containsSessionMedia: false,
          requiresSessionMarker: false,
          containsUnscopedSessionMedia: false,
        };
      }
      const explicitMedia = isExplicitMediaContext(context);
      return {
        value: OMIT_BROWSER_SESSION_MEDIA,
        containsSessionMedia: true,
        requiresSessionMarker: explicitMedia,
        containsUnscopedSessionMedia: !explicitMedia,
      };
    }
    return {
      value,
      containsSessionMedia: false,
      requiresSessionMarker: false,
      containsUnscopedSessionMedia: false,
    };
  }
  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    let containsSessionMedia = false;
    let requiresSessionMarker = false;
    let containsUnscopedSessionMedia = false;
    for (const item of value) {
      const next = sanitizeBridgeWorkContent(item, context);
      containsSessionMedia ||= next.containsSessionMedia;
      requiresSessionMarker ||= next.requiresSessionMarker;
      containsUnscopedSessionMedia ||= next.containsUnscopedSessionMedia;
      if (next.value !== OMIT_BROWSER_SESSION_MEDIA) sanitized.push(next.value);
    }
    return {
      value: sanitized,
      containsSessionMedia,
      requiresSessionMarker,
      containsUnscopedSessionMedia,
    };
  }
  if (!value || typeof value !== 'object') {
    return {
      value,
      containsSessionMedia: false,
      requiresSessionMarker: false,
      containsUnscopedSessionMedia: false,
    };
  }
  const sourceRecord = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  let containsSessionMedia = false;
  let requiresSessionMarker = false;
  let containsUnscopedSessionMedia = false;
  for (const [key, item] of Object.entries(sourceRecord)) {
    const next = sanitizeBridgeWorkContent(item, {
      field: key,
      parent: sourceRecord,
      path: [...context.path, key],
    });
    containsSessionMedia ||= next.containsSessionMedia;
    requiresSessionMarker ||= next.requiresSessionMarker;
    containsUnscopedSessionMedia ||= next.containsUnscopedSessionMedia;
    if (next.value !== OMIT_BROWSER_SESSION_MEDIA) sanitized[key] = next.value;
  }
  if (
    (requiresSessionMarker || containsUnscopedSessionMedia) &&
    canDescribeSessionMedia(sourceRecord)
  ) {
    sanitized.mediaPersistenceState = SESSION_MEDIA_PERSISTENCE_STATE;
    if (sourceRecord.kind === 'audio') sanitized.audioSourceState = 'unavailable-after-restore';
    requiresSessionMarker = false;
    containsUnscopedSessionMedia = false;
  }
  return {
    value: sanitized,
    containsSessionMedia,
    requiresSessionMarker,
    containsUnscopedSessionMedia,
  };
}

export function containsBrowserSessionMedia(value: unknown): boolean {
  return sanitizeBridgeWorkContent(value).containsSessionMedia;
}

/**
 * Browser-only media remains usable by the current page, but cannot be opened
 * by the host after a refresh. Persist the surrounding graph only when every
 * removed URL is represented by an explicit `mediaPersistenceState` marker on
 * its node/asset/reference record. Unknown manifest/trash shapes fail closed
 * instead of silently losing data.
 */
export function bridgeSerializableWorkContent<T>(value: T): T {
  const sanitized = sanitizeBridgeWorkContent(value);
  if (
    sanitized.value === OMIT_BROWSER_SESSION_MEDIA ||
    sanitized.requiresSessionMarker ||
    sanitized.containsUnscopedSessionMedia
  ) {
    throw new Error(
      '画布数据包含无法归属到节点或素材的临时媒体地址；为避免静默丢失，本次 Bridge 写入已停止。',
    );
  }
  return sanitized.value as T;
}

export class BridgeCanvasUnavailableError extends Error {
  constructor(
    message = '本机 Bridge 未启动或不可访问。当前修改仅保留在临时会话中，尚未永久保存。',
  ) {
    super(message);
    this.name = 'BridgeCanvasUnavailableError';
  }
}

export class BridgeCanvasConflictError extends Error {
  readonly currentRevision: number;
  readonly kind: 'remote-revision' | 'local-read-race' | 'legacy-mismatch';

  constructor(
    currentRevision: number,
    message = '画布已被其他窗口或局域网用户更新。',
    kind: 'remote-revision' | 'local-read-race' | 'legacy-mismatch' = 'remote-revision',
  ) {
    super(message);
    this.name = 'BridgeCanvasConflictError';
    this.currentRevision = currentRevision;
    this.kind = kind;
  }
}

async function request(
  path: string,
  init: RequestInit | undefined,
  fallback: string,
  fetchImpl: typeof fetch,
) {
  let response: Response;
  try {
    response = await bridgeRequest(path, init, fetchImpl);
  } catch (error) {
    throw new BridgeCanvasUnavailableError(
      error instanceof Error && error.message.trim()
        ? `本机 Bridge 不可访问：${error.message}。当前修改仅保留在临时会话中。`
        : undefined,
    );
  }
  const payload = await readJson(response);
  if (response.status === 409) {
    throw new BridgeCanvasConflictError(
      finiteRevision(payload.currentRevision ?? payload.revision),
      errorMessage(payload, '画布修订冲突，本次保存未覆盖主机数据。'),
    );
  }
  if (!response.ok) throw new Error(errorMessage(payload, fallback));
  return payload;
}

function validBridgeProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{2,80}$/u.test(value);
}

export async function readBridgeProjectCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeProjectCatalogResult> {
  const payload = await request('/projects', undefined, '本机画布读取失败。', fetchImpl);
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const cleanProjects = projects.filter(
    (project): project is BridgeProjectCatalogItem =>
      Boolean(project) &&
      typeof project === 'object' &&
      validBridgeProjectId((project as BridgeProjectCatalogItem).id) &&
      typeof (project as BridgeProjectCatalogItem).name === 'string',
  );
  const rawPrimaryProjectId = payload.primaryProjectId ?? payload.canvasProjectId;
  if (rawPrimaryProjectId !== null && rawPrimaryProjectId !== undefined) {
    if (!validBridgeProjectId(rawPrimaryProjectId)) {
      throw new Error('本机 Bridge 返回了无效的主画布标识。');
    }
    if (!cleanProjects.some((project) => project.id === rawPrimaryProjectId)) {
      throw new Error('本机 Bridge 的主画布目录不一致，已停止自动选择。');
    }
  }
  return {
    version: 2,
    projects: cleanProjects,
    primaryProjectId: rawPrimaryProjectId ?? null,
    updatedAt: typeof payload.updatedAt === 'number' ? payload.updatedAt : undefined,
  };
}

export async function claimBridgePrimaryProject(
  candidateProjectId: string,
  name?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgePrimaryProjectResult> {
  if (!validBridgeProjectId(candidateProjectId)) throw new Error('主画布候选标识无效。');
  const payload = await request(
    '/projects/primary',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateProjectId,
        ...(name?.trim() ? { name: name.trim(), title: name.trim() } : {}),
      }),
    },
    '本机主画布认领失败。',
    fetchImpl,
  );
  const primaryProjectId = payload.primaryProjectId ?? payload.canvasProjectId;
  if (!validBridgeProjectId(primaryProjectId)) {
    throw new Error('本机 Bridge 未返回有效的主画布标识。');
  }
  if (primaryProjectId !== candidateProjectId) {
    throw new Error('本机 Bridge 返回了不同的主画布标识，已停止加载。');
  }
  const rawProject = payload.project;
  const project =
    rawProject &&
    typeof rawProject === 'object' &&
    validBridgeProjectId((rawProject as BridgeProjectCatalogItem).id) &&
    typeof (rawProject as BridgeProjectCatalogItem).name === 'string'
      ? (rawProject as BridgeProjectCatalogItem)
      : null;
  if (project && project.id !== primaryProjectId) {
    throw new Error('本机 Bridge 返回的主画布目录项不一致。');
  }
  return {
    primaryProjectId,
    project,
    claimed: payload.claimed === true,
  };
}

export async function readBridgeWorkspace<T>(
  projectId: string,
  workspaceId: PersistedBridgeWorkspaceId,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeWorkspaceReadResult<T> | null> {
  let response: Response;
  try {
    response = await bridgeRequest(
      `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}`,
      undefined,
      fetchImpl,
    );
  } catch (error) {
    throw new BridgeCanvasUnavailableError(
      error instanceof Error && error.message.trim()
        ? `本机 Bridge 不可访问：${error.message}。当前画布仅以临时会话打开。`
        : undefined,
    );
  }
  if (response.status === 404) return null;
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, '本机工作台读取失败。'));
  assertBridgePayloadIdentity(payload, projectId, workspaceId);
  if (!payload.workspace || typeof payload.workspace !== 'object') {
    throw new Error('本机 Bridge 返回了无效的工作台数据。');
  }
  return {
    projectId,
    workspaceId,
    workspace: localBridgeCanvasValue(payload.workspace as T),
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
  };
}

export async function writeBridgeWorkspace<T, TProject = unknown>(
  projectId: string,
  workspaceId: PersistedBridgeWorkspaceId,
  workspace: T,
  expectedRevision: number,
  manifestPatch?: Partial<BridgeProjectManifest>,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeWorkspaceReadResult<T, TProject>> {
  const persistedWorkspace = bridgeSerializableWorkContent(workspace);
  const persistedManifestPatch = bridgeSerializableWorkContent(manifestPatch);
  const payload = await request(
    `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: portableBridgeCanvasValue(persistedWorkspace),
        expectedRevision,
        manifestPatch: portableBridgeCanvasValue(persistedManifestPatch),
      }),
    },
    '本机工作台保存失败。',
    fetchImpl,
  );
  assertBridgePayloadIdentity(payload, projectId, workspaceId);
  if (!payload.workspace || typeof payload.workspace !== 'object') {
    throw new Error('本机 Bridge 未返回可回读的工作台，当前修改仍未确认保存。');
  }
  const returnedWorkspace = localBridgeCanvasValue(payload.workspace as T);
  if (
    payload.rebased !== true &&
    !stableJsonEqual(
      portableBridgeCanvasValue(returnedWorkspace),
      portableBridgeCanvasValue(persistedWorkspace),
    )
  ) {
    throw new BridgeCanvasConflictError(
      manifestRevision(payload),
      '本机 Bridge 回读的工作台与本次提交不一致，当前修改仍未覆盖主机数据。',
    );
  }
  return {
    projectId,
    workspaceId,
    workspace: returnedWorkspace,
    project:
      payload.project && typeof payload.project === 'object'
        ? localBridgeCanvasValue(payload.project as TProject)
        : undefined,
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
    rebased: payload.rebased === true,
  };
}

export async function readBridgeTrash<T>(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeTrashReadResult<T> | null> {
  let response: Response;
  try {
    response = await bridgeRequest(
      `/projects/${encodeURIComponent(projectId)}/trash`,
      undefined,
      fetchImpl,
    );
  } catch (error) {
    throw new BridgeCanvasUnavailableError(
      error instanceof Error && error.message.trim()
        ? `本机 Bridge 不可访问：${error.message}。回收站仅保留在临时会话中。`
        : undefined,
    );
  }
  if (response.status === 404) return null;
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, '本机回收站读取失败。'));
  assertBridgePayloadIdentity(payload, projectId);
  if (!Array.isArray(payload.trash)) {
    throw new Error('本机 Bridge 返回了无效的回收站数据。');
  }
  return {
    projectId,
    trash: localBridgeCanvasValue(payload.trash as T),
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
  };
}

export async function writeBridgeTrash<T, TProject = unknown>(
  projectId: string,
  trash: T,
  expectedRevision: number,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeTrashReadResult<T, TProject>> {
  const persistedTrash = bridgeSerializableWorkContent(trash);
  const payload = await request(
    `/projects/${encodeURIComponent(projectId)}/trash`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trash: portableBridgeCanvasValue(persistedTrash), expectedRevision }),
    },
    '本机回收站保存失败。',
    fetchImpl,
  );
  assertBridgePayloadIdentity(payload, projectId);
  if (!Array.isArray(payload.trash)) {
    throw new Error('本机 Bridge 未返回可回读的回收站，当前修改仍未确认保存。');
  }
  const returnedTrash = localBridgeCanvasValue(payload.trash as T);
  if (
    payload.rebased !== true &&
    !stableJsonEqual(
      portableBridgeCanvasValue(returnedTrash),
      portableBridgeCanvasValue(persistedTrash),
    )
  ) {
    throw new BridgeCanvasConflictError(
      manifestRevision(payload),
      '本机 Bridge 回读的回收站与本次提交不一致，当前修改仍未覆盖主机数据。',
    );
  }
  return {
    projectId,
    trash: returnedTrash,
    project:
      payload.project && typeof payload.project === 'object'
        ? localBridgeCanvasValue(payload.project as TProject)
        : undefined,
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
    rebased: payload.rebased === true,
  };
}

/**
 * The v2 project endpoint is the one-time legacy migration and project-metadata
 * transaction boundary. Only current-Bridge absolute media URLs become stable
 * relative paths. Asset identities, third-party URLs, object keys and node,
 * edge and semantic-reference array order are never normalized or sorted.
 */
export async function writeBridgeProject<T>(
  projectId: string,
  workspace: T,
  expectedRevision: number,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeProjectReadResult<T>> {
  const persistedWorkspace = bridgeSerializableWorkContent(workspace);
  const payload = await request(
    `/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: portableBridgeCanvasValue(persistedWorkspace),
        expectedRevision,
        name,
        title: name,
      }),
    },
    '本机画布保存失败。',
    fetchImpl,
  );
  assertBridgePayloadIdentity(payload, projectId);
  const returnedProject = payload.project as BridgeProjectCatalogItem | undefined;
  if (returnedProject && returnedProject.id !== projectId) {
    throw new Error('本机 Bridge 返回的项目目录项不一致，已停止使用这次响应。');
  }
  return {
    project: returnedProject ?? null,
    workspace: localBridgeCanvasValue((payload.workspace ?? persistedWorkspace) as T),
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
    rebased: payload.rebased === true,
  };
}

export async function readBridgeProject<T>(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeProjectReadResult<T> | null> {
  let response: Response;
  try {
    response = await bridgeRequest(
      `/projects/${encodeURIComponent(projectId)}`,
      undefined,
      fetchImpl,
    );
  } catch (error) {
    throw new BridgeCanvasUnavailableError(
      error instanceof Error && error.message.trim()
        ? `本机 Bridge 不可访问：${error.message}。当前画布仅以临时会话打开。`
        : undefined,
    );
  }
  if (response.status === 404) return null;
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, '本机画布读取失败。'));
  assertBridgePayloadIdentity(payload, projectId);
  const returnedProject = payload.project as BridgeProjectCatalogItem | undefined;
  if (returnedProject && returnedProject.id !== projectId) {
    throw new Error('本机 Bridge 返回的项目目录项不一致，已停止使用这次响应。');
  }
  return {
    project: returnedProject ?? null,
    workspace: payload.workspace ? localBridgeCanvasValue(payload.workspace as T) : null,
    revision: manifestRevision(payload),
    manifest: payload.manifest
      ? localBridgeCanvasValue(payload.manifest as BridgeProjectManifest)
      : undefined,
  };
}

export async function deleteBridgeProjectRecord(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
) {
  await request(
    `/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
    '本机画布归档失败。',
    fetchImpl,
  );
}
