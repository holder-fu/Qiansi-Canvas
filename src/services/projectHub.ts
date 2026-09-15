import { bridgeResourcePathname, resolveBridgeUrl } from '../lib/bridgeUrl';

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,80}$/u;
const ASSET_ID_RE = /^[A-Za-z0-9_-]{6,80}$/u;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{6,120}$/u;
const PROJECT_NAME_FORBIDDEN_CHARACTERS = '<>:"/\\|?*';
const PROJECT_WORKSPACES = new Set(['script', 'views', 'video', 'audio']);
const PROJECT_COVER_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PROJECT_COVER_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MAX_PROJECT_COVER_BYTES = 18 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  revision?: number;
  activeWorkspace?: 'script' | 'views' | 'video' | 'audio';
  folderId?: string;
  coverAssetId?: string;
  coverUrl?: string;
  autoCoverAssetId?: string;
  autoCoverUrl?: string;
}

export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectCatalog {
  version: 2;
  catalogRevision: number;
  primaryProjectId: string;
  projects: ProjectSummary[];
  folders: ProjectFolder[];
  updatedAt?: number;
}

export interface ProjectCover {
  assetId: string;
  url: string;
}

export interface ProjectHubRequestOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface ProjectCatalogMutationOptions extends ProjectHubRequestOptions {
  expectedCatalogRevision?: number;
}

export interface CreateProjectOptions extends ProjectCatalogMutationOptions {
  folderId?: string | null;
  requestId?: string;
}

export interface DuplicateProjectOptions extends CreateProjectOptions {
  name?: string;
}

export interface ProjectMutationOptions extends ProjectCatalogMutationOptions {
  expectedRevision?: number;
}

export interface ProjectFolderMutationOptions extends ProjectCatalogMutationOptions {
  requestId?: string;
}

export type UploadProjectCoverOptions = ProjectMutationOptions;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label}格式无效。`);
  return value;
}

function projectId(value: unknown, label = '项目 ID'): string {
  if (typeof value !== 'string' || !PROJECT_ID_RE.test(value)) {
    throw new Error(`${label}无效。`);
  }
  return value;
}

function folderId(value: unknown, label = '文件夹 ID'): string {
  if (typeof value !== 'string' || !PROJECT_ID_RE.test(value)) {
    throw new Error(`${label}无效。`);
  }
  return value;
}

function requestedName(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}不能为空。`);
  const name = value.trim();
  const containsForbiddenCharacter = [...name].some(
    (character) =>
      character.charCodeAt(0) < 32 || PROJECT_NAME_FORBIDDEN_CHARACTERS.includes(character),
  );
  if (!name || name.length > 100 || containsForbiddenCharacter) {
    throw new Error(`${label}必须为 1–100 个有效字符。`);
  }
  return name;
}

function returnedName(value: unknown, label: string): string {
  const name = requestedName(value, label);
  if (name !== value) throw new Error(`${label}包含未规范化的首尾空格。`);
  return name;
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}无效。`);
  }
  return value;
}

function optionalSafeInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : safeInteger(value, label);
}

function requestId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !REQUEST_ID_RE.test(value)) {
    throw new Error('请求幂等标识无效。');
  }
  return value;
}

function optionalFolderId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return folderId(value);
}

function managedCover(value: unknown, expectedAssetId?: string): ProjectCover | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('项目封面地址无效。');
  const resolved = new URL(resolveBridgeUrl(value));
  if (resolved.search || resolved.hash) throw new Error('项目封面地址不能包含查询参数或片段。');
  const pathname = bridgeResourcePathname(value);
  if (!pathname) throw new Error('项目封面必须引用当前 Bridge 的受管图片素材。');
  const assetId =
    pathname.match(/^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/u)?.[1] ??
    pathname.match(/^\/media-preview\/files\/([A-Za-z0-9_-]{12,80})\.webp$/u)?.[1];
  if (!assetId || (expectedAssetId && assetId !== expectedAssetId)) {
    throw new Error('项目封面必须引用当前 Bridge 的受管图片素材。');
  }
  return {
    assetId,
    url: resolveBridgeUrl(pathname),
  };
}

function parseProjectSummary(value: unknown, label = '项目目录项'): ProjectSummary {
  const source = record(value, label);
  const id = projectId(source.id, `${label} ID`);
  const name = returnedName(source.name, `${label}名称`);
  const createdAt = safeInteger(source.createdAt, `${label}创建时间`);
  const updatedAt = safeInteger(source.updatedAt, `${label}更新时间`);
  const revision = optionalSafeInteger(source.revision, `${label}修订号`);
  const activeWorkspace = source.activeWorkspace;
  if (activeWorkspace !== undefined && !PROJECT_WORKSPACES.has(String(activeWorkspace))) {
    throw new Error(`${label}工作台标识无效。`);
  }
  const parsedFolderId = optionalFolderId(source.folderId);
  const coverAssetId =
    source.coverAssetId === undefined || source.coverAssetId === null || source.coverAssetId === ''
      ? undefined
      : typeof source.coverAssetId === 'string' && ASSET_ID_RE.test(source.coverAssetId)
        ? source.coverAssetId
        : (() => {
            throw new Error(`${label}封面素材 ID 无效。`);
          })();
  const cover = managedCover(source.coverUrl, coverAssetId);
  if (Boolean(coverAssetId) !== Boolean(cover)) {
    throw new Error(`${label}封面素材 ID 与地址必须同时存在。`);
  }
  const autoCoverAssetId =
    source.autoCoverAssetId === undefined ||
    source.autoCoverAssetId === null ||
    source.autoCoverAssetId === ''
      ? undefined
      : typeof source.autoCoverAssetId === 'string' && ASSET_ID_RE.test(source.autoCoverAssetId)
        ? source.autoCoverAssetId
        : (() => {
            throw new Error(`${label}自动封面素材 ID 无效。`);
          })();
  const autoCover = managedCover(source.autoCoverUrl, autoCoverAssetId);
  if (Boolean(autoCoverAssetId) !== Boolean(autoCover)) {
    throw new Error(`${label}自动封面素材 ID 与地址必须同时存在。`);
  }
  return {
    id,
    name,
    createdAt,
    updatedAt,
    ...(revision === undefined ? {} : { revision }),
    ...(activeWorkspace === undefined
      ? {}
      : { activeWorkspace: activeWorkspace as ProjectSummary['activeWorkspace'] }),
    ...(parsedFolderId ? { folderId: parsedFolderId } : {}),
    ...(cover ? { coverAssetId: cover.assetId, coverUrl: cover.url } : {}),
    ...(autoCover ? { autoCoverAssetId: autoCover.assetId, autoCoverUrl: autoCover.url } : {}),
  };
}

function parseProjectFolder(value: unknown, label = '项目文件夹'): ProjectFolder {
  const source = record(value, label);
  return {
    id: folderId(source.id, `${label} ID`),
    name: returnedName(source.name, `${label}名称`),
    createdAt: safeInteger(source.createdAt, `${label}创建时间`),
    updatedAt: safeInteger(source.updatedAt, `${label}更新时间`),
  };
}

function uniqueIds<T extends { id: string }>(items: readonly T[], label: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}包含重复 ID：${item.id}。`);
    ids.add(item.id);
  }
  return ids;
}

function parseProjectCatalog(value: unknown): ProjectCatalog {
  const source = record(value, '项目目录');
  if (source.version !== 2) throw new Error('项目目录版本无效。');
  if (!Array.isArray(source.projects) || !Array.isArray(source.folders)) {
    throw new Error('项目目录缺少项目或文件夹列表。');
  }
  const projects = source.projects.map((item, index) =>
    parseProjectSummary(item, `第 ${index + 1} 个项目`),
  );
  const folders = source.folders.map((item, index) =>
    parseProjectFolder(item, `第 ${index + 1} 个项目文件夹`),
  );
  const projectIds = uniqueIds(projects, '项目目录');
  const folderIds = uniqueIds(folders, '项目文件夹目录');
  const primaryProjectId = projectId(source.primaryProjectId, '主项目 ID');
  if (!projectIds.has(primaryProjectId)) throw new Error('主项目不在项目目录中。');
  for (const project of projects) {
    if (project.folderId && !folderIds.has(project.folderId)) {
      throw new Error(`项目 ${project.id} 引用了不存在的文件夹。`);
    }
  }
  return {
    version: 2,
    catalogRevision: safeInteger(source.catalogRevision, '项目目录修订号'),
    primaryProjectId,
    projects,
    folders,
    ...(source.updatedAt === undefined
      ? {}
      : { updatedAt: safeInteger(source.updatedAt, '项目目录更新时间') }),
  };
}

function errorMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message.trim() || fallback;
  }
  return typeof payload.message === 'string' && payload.message.trim() ? payload.message : fallback;
}

async function requestJson(
  path: string,
  init: RequestInit,
  fallback: string,
  options: ProjectHubRequestOptions,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(resolveBridgeUrl(path), {
      cache: 'no-store',
      credentials: 'include',
      signal: options.signal,
      ...init,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.trim()
        ? `本机 Bridge 不可访问：${error.message}`
        : '本机 Bridge 不可访问。',
    );
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (response.ok && !contentType.includes('application/json')) {
    throw new Error(
      contentType.includes('text/html')
        ? '当前页面只连接到了前端服务，项目 Bridge 未连接。请使用完整开发模式并打开 2895 端口。'
        : `${fallback}响应类型无效。`,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok)
    throw new Error(errorMessage(payload, `${fallback}（HTTP ${response.status}）。`));
  return record(payload, `${fallback}响应`);
}

function jsonInit(method: 'POST' | 'PATCH' | 'DELETE', body?: JsonRecord): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function embeddedCatalog(payload: JsonRecord): ProjectCatalog {
  return parseProjectCatalog(payload.catalog);
}

function mutationProject(payload: JsonRecord, expectedId?: string): ProjectSummary {
  const project = parseProjectSummary(payload.project ?? payload.item, '项目操作结果');
  if (expectedId && project.id !== expectedId) {
    throw new Error('Bridge 返回的项目 ID 与本次操作不一致。');
  }
  if (payload.projectId !== undefined && payload.projectId !== project.id) {
    throw new Error('Bridge 返回的顶层项目 ID 与项目目录项不一致。');
  }
  const topRevision = optionalSafeInteger(payload.revision, '项目操作修订号');
  if (
    topRevision !== undefined &&
    project.revision !== undefined &&
    topRevision !== project.revision
  ) {
    throw new Error('Bridge 返回的项目修订号不一致。');
  }
  if (payload.manifest !== undefined) {
    const manifest = record(payload.manifest, '项目 manifest');
    if (manifest.projectId !== undefined && manifest.projectId !== project.id) {
      throw new Error('Bridge 返回的项目 manifest 身份不一致。');
    }
    const manifestRevision = optionalSafeInteger(manifest.revision, '项目 manifest 修订号');
    if (
      topRevision !== undefined &&
      manifestRevision !== undefined &&
      topRevision !== manifestRevision
    ) {
      throw new Error('Bridge 返回的项目与 manifest 修订号不一致。');
    }
  }
  const catalog = embeddedCatalog(payload);
  const catalogProject = catalog.projects.find((item) => item.id === project.id);
  if (!catalogProject || JSON.stringify(catalogProject) !== JSON.stringify(project)) {
    throw new Error('Bridge 返回的项目与目录快照不一致。');
  }
  return project;
}

function creationBody(name: string, options: CreateProjectOptions): JsonRecord {
  const selectedFolderId = optionalFolderId(options.folderId);
  const idempotencyKey = requestId(options.requestId);
  const expectedCatalogRevision = optionalSafeInteger(
    options.expectedCatalogRevision,
    '预期项目目录修订号',
  );
  return {
    name: requestedName(name, '项目名称'),
    ...(selectedFolderId
      ? { folderId: selectedFolderId }
      : options.folderId === null
        ? { folderId: null }
        : {}),
    ...(idempotencyKey ? { requestId: idempotencyKey } : {}),
    ...(expectedCatalogRevision === undefined ? {} : { expectedCatalogRevision }),
  };
}

function mutationBody(options: ProjectMutationOptions, fields: JsonRecord): JsonRecord {
  const expectedRevision = optionalSafeInteger(options.expectedRevision, '预期项目修订号');
  const expectedCatalogRevision = optionalSafeInteger(
    options.expectedCatalogRevision,
    '预期项目目录修订号',
  );
  return {
    ...fields,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
    ...(expectedCatalogRevision === undefined ? {} : { expectedCatalogRevision }),
  };
}

export async function listProjects(
  options: ProjectHubRequestOptions = {},
): Promise<ProjectCatalog> {
  const payload = await requestJson('/projects', {}, '项目目录读取失败', options);
  return parseProjectCatalog(payload);
}

export async function createProject(
  name: string,
  options: CreateProjectOptions = {},
): Promise<ProjectSummary> {
  const payload = await requestJson(
    '/projects',
    jsonInit('POST', creationBody(name, options)),
    '项目创建失败',
    options,
  );
  return mutationProject(payload);
}

export async function renameProject(
  id: string,
  name: string,
  options: ProjectMutationOptions = {},
): Promise<ProjectSummary> {
  const expectedId = projectId(id);
  const payload = await requestJson(
    `/projects/${encodeURIComponent(expectedId)}`,
    jsonInit('PATCH', mutationBody(options, { name: requestedName(name, '项目名称') })),
    '项目重命名失败',
    options,
  );
  return mutationProject(payload, expectedId);
}

export async function duplicateProject(
  id: string,
  options: DuplicateProjectOptions = {},
): Promise<ProjectSummary> {
  const sourceId = projectId(id);
  const selectedFolderId = optionalFolderId(options.folderId);
  const idempotencyKey = requestId(options.requestId);
  const expectedCatalogRevision = optionalSafeInteger(
    options.expectedCatalogRevision,
    '预期项目目录修订号',
  );
  const payload = await requestJson(
    `/projects/${encodeURIComponent(sourceId)}/duplicate`,
    jsonInit('POST', {
      ...(options.name === undefined ? {} : { name: requestedName(options.name, '副本名称') }),
      ...(selectedFolderId
        ? { folderId: selectedFolderId }
        : options.folderId === null
          ? { folderId: null }
          : {}),
      ...(idempotencyKey ? { requestId: idempotencyKey } : {}),
      ...(expectedCatalogRevision === undefined ? {} : { expectedCatalogRevision }),
    }),
    '项目复制失败',
    options,
  );
  const duplicate = mutationProject(payload);
  if (duplicate.id === sourceId) throw new Error('Bridge 返回了来源项目本身，项目复制未完成。');
  return duplicate;
}

export async function updateProjectCover(
  id: string,
  cover: ProjectCover | null,
  options: ProjectMutationOptions = {},
): Promise<ProjectSummary> {
  const expectedId = projectId(id);
  let fields: JsonRecord;
  if (cover === null) {
    fields = { coverAssetId: null, coverUrl: null };
  } else {
    if (!ASSET_ID_RE.test(cover.assetId)) throw new Error('项目封面素材 ID 无效。');
    const parsed = managedCover(cover.url, cover.assetId);
    if (!parsed) throw new Error('项目封面地址无效。');
    fields = {
      coverAssetId: parsed.assetId,
      coverUrl: bridgeResourcePathname(parsed.url),
    };
  }
  const payload = await requestJson(
    `/projects/${encodeURIComponent(expectedId)}`,
    jsonInit('PATCH', mutationBody(options, fields)),
    '项目封面更新失败',
    options,
  );
  return mutationProject(payload, expectedId);
}

export async function moveProjectToFolder(
  id: string,
  destinationFolderId: string | null,
  options: ProjectMutationOptions = {},
): Promise<ProjectSummary> {
  const expectedId = projectId(id);
  const target = destinationFolderId === null ? null : folderId(destinationFolderId);
  const payload = await requestJson(
    `/projects/${encodeURIComponent(expectedId)}`,
    jsonInit('PATCH', mutationBody(options, { folderId: target })),
    '项目移动失败',
    options,
  );
  return mutationProject(payload, expectedId);
}

export async function archiveProject(
  id: string,
  options: ProjectMutationOptions = {},
): Promise<ProjectCatalog> {
  const expectedId = projectId(id);
  const body = mutationBody(options, {});
  const payload = await requestJson(
    `/projects/${encodeURIComponent(expectedId)}`,
    jsonInit('DELETE', Object.keys(body).length ? body : undefined),
    '项目归档失败',
    options,
  );
  if (payload.archived !== true || payload.projectId !== expectedId) {
    throw new Error('Bridge 未确认归档指定项目。');
  }
  const catalog = embeddedCatalog(payload);
  if (catalog.projects.some((project) => project.id === expectedId)) {
    throw new Error('已归档项目仍出现在项目目录中。');
  }
  return catalog;
}

export async function createProjectFolder(
  name: string,
  options: ProjectFolderMutationOptions = {},
): Promise<ProjectFolder> {
  const idempotencyKey = requestId(options.requestId);
  const expectedCatalogRevision = optionalSafeInteger(
    options.expectedCatalogRevision,
    '预期项目目录修订号',
  );
  const payload = await requestJson(
    '/project-folders',
    jsonInit('POST', {
      name: requestedName(name, '项目文件夹名称'),
      ...(idempotencyKey ? { requestId: idempotencyKey } : {}),
      ...(expectedCatalogRevision === undefined ? {} : { expectedCatalogRevision }),
    }),
    '项目文件夹创建失败',
    options,
  );
  const folder = parseProjectFolder(payload.folder ?? payload.item, '项目文件夹操作结果');
  const catalog = embeddedCatalog(payload);
  const stored = catalog.folders.find((item) => item.id === folder.id);
  if (!stored || JSON.stringify(stored) !== JSON.stringify(folder)) {
    throw new Error('Bridge 返回的文件夹与目录快照不一致。');
  }
  return folder;
}

export async function deleteProjectFolder(
  id: string,
  options: ProjectCatalogMutationOptions = {},
): Promise<ProjectCatalog> {
  const expectedId = folderId(id);
  const expectedCatalogRevision = optionalSafeInteger(
    options.expectedCatalogRevision,
    '预期项目目录修订号',
  );
  const payload = await requestJson(
    `/project-folders/${encodeURIComponent(expectedId)}`,
    jsonInit(
      'DELETE',
      expectedCatalogRevision === undefined ? undefined : { expectedCatalogRevision },
    ),
    '项目文件夹删除失败',
    options,
  );
  if (payload.deletedFolderId !== expectedId) {
    throw new Error('Bridge 未确认删除指定项目文件夹。');
  }
  const catalog = embeddedCatalog(payload);
  if (
    catalog.folders.some((folder) => folder.id === expectedId) ||
    catalog.projects.some((project) => project.folderId === expectedId)
  ) {
    throw new Error('已删除文件夹仍被项目目录引用。');
  }
  return catalog;
}

function coverMimeType(file: File) {
  const declared = file.type.trim().toLowerCase();
  if (PROJECT_COVER_MIME_TYPES.has(declared)) return declared;
  const lowerName = file.name.toLowerCase();
  const extension = Object.keys(PROJECT_COVER_MIME_BY_EXTENSION).find((candidate) =>
    lowerName.endsWith(candidate),
  );
  const inferred = extension ? PROJECT_COVER_MIME_BY_EXTENSION[extension] : undefined;
  if (!declared && inferred) return inferred;
  throw new Error('项目封面只支持 PNG、JPEG、WebP 或 GIF 图片。');
}

function safeHeaderText(value: string, fallback: string) {
  const safe = value
    .replace(/[^\x20-\x7e]/gu, '_')
    .replace(/[\r\n]/gu, '')
    .slice(0, 180);
  return safe || fallback;
}

async function uploadCoverAsset(
  id: string,
  file: File,
  options: ProjectHubRequestOptions,
): Promise<ProjectCover> {
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_PROJECT_COVER_BYTES) {
    throw new Error('项目封面必须是小于或等于 18 MB 的非空图片。');
  }
  const mime = coverMimeType(file);
  const payload = await requestJson(
    '/asset-library/upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'X-Qiansi-Canvas-File-Name': safeHeaderText(file.name, 'project-cover'),
        'X-Qiansi-Canvas-Title': safeHeaderText(
          file.name.replace(/\.[^.]+$/u, ''),
          'project-cover',
        ),
        'X-Qiansi-Canvas-Kind': 'storyboard',
        'X-Qiansi-Canvas-Project': id,
      },
      body: file,
    },
    '项目封面素材上传失败',
    options,
  );
  const item = record(payload.item, '项目封面素材');
  const assetId =
    typeof item.id === 'string' && ASSET_ID_RE.test(item.id)
      ? item.id
      : (() => {
          throw new Error('Bridge 返回的项目封面素材 ID 无效。');
        })();
  const cover = managedCover(item.url, assetId);
  if (!cover) throw new Error('Bridge 没有返回可长期读取的项目封面地址。');
  if (item.mime !== undefined && item.mime !== mime) {
    throw new Error('Bridge 返回的项目封面 MIME 与上传内容不一致。');
  }
  if (item.size !== undefined && safeInteger(item.size, '项目封面素材大小') !== file.size) {
    throw new Error('Bridge 返回的项目封面大小与上传内容不一致。');
  }
  return cover;
}

export async function uploadProjectCover(
  id: string,
  file: File,
  options: UploadProjectCoverOptions = {},
): Promise<ProjectSummary> {
  const expectedId = projectId(id);
  const cover = await uploadCoverAsset(expectedId, file, options);
  return updateProjectCover(expectedId, cover, options);
}
