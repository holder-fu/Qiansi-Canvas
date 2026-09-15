import { BRIDGE_BASE_URL, resolveBridgeBaseUrl, resolveBridgeUrl } from '../lib/bridgeUrl';
import type { AssetType } from '../graph/types';
import type { NodeKind } from '../canvas/nodeTypes';

export type PluginPermission =
  | 'canvas:add-node'
  | 'canvas:create-project-graph'
  | 'canvas:update-own-node'
  | 'canvas:read-selection'
  | 'canvas:read-own-inputs'
  | 'canvas:read-own-image'
  | 'canvas:notify'
  | 'assets:read'
  | 'styles:manage-samples'
  | 'audio:generate'
  | 'audio:reference-library'
  | 'audio:install'
  | 'storage:preferences'
  | 'storage:project-documents'
  | 'storage:shared-style-covers'
  | 'models:use-text'
  | 'models:use-media'
  | 'media:transform'
  | 'vision:pose'
  | 'vision:install';

export type PluginHostNodeKind = Extract<
  NodeKind,
  'plugin' | 'text' | 'image' | 'video' | 'audio' | 'director-2d' | 'director-3d'
>;

export type PluginNodeContribution = {
  id: string;
  label: string;
  description: string;
  accent: string;
  input: AssetType;
  output: AssetType;
  hostKind?: PluginHostNodeKind;
  renderer?: 'host' | 'sandbox';
  presentation?: 'card' | 'immersive';
  view?: string;
  width?: number;
  height?: number;
};

export type PluginWidgetContribution = {
  id: string;
  type: 'pet';
  label: string;
  description: string;
  asset: string;
  centerAsset?: string;
  position: 'bottom-right';
  width: number;
  message: string;
};

export type PluginPanelContribution = {
  id: string;
  label: string;
  description: string;
  position: 'left' | 'right' | 'bottom' | 'floating' | 'fullscreen';
  view: string;
  width: number;
  height: number;
  defaultOpen: boolean;
  hostChrome?: 'default' | 'integrated' | 'custom';
};

export type PluginMenuContribution = {
  id: string;
  label: string;
  location: 'canvas';
  action: { type: 'add-node'; nodeId: string } | { type: 'open-panel'; panelId: string };
};

export type PluginLocaleContribution = {
  locale: string;
  nativeName: string;
  file: string;
  direction: 'ltr' | 'rtl';
};

type PluginAudioGeneratorBase = {
  id: string;
  label: string;
  protocol: 'qiansi-audio-v1';
  canvasOutput?: 'audio-node';
  timeoutMs: number;
  maxBytes: number;
};

export type PluginAudioGeneratorContribution = PluginAudioGeneratorBase &
  (
    | { endpoint: string; healthEndpoint: string; hostAdapter?: never }
    | {
        hostAdapter: 'voxcpm2' | 'chattts' | 'qwen3tts' | 'cosyvoice3' | 'woosh' | 'acestepXl';
        endpoint?: never;
        healthEndpoint?: never;
      }
  );

export type PluginManifest = {
  schemaVersion: 1 | 2;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  engine: { qiansiCanvas: string };
  permissions: PluginPermission[];
  runtime?: { entry: string; apiVersion: 1 | 2 };
  assets: string[];
  contributes: {
    nodes: PluginNodeContribution[];
    widgets: PluginWidgetContribution[];
    panels: PluginPanelContribution[];
    menus: PluginMenuContribution[];
    locales?: PluginLocaleContribution[];
    audioGenerators: PluginAudioGeneratorContribution[];
  };
};

export type InstalledPlugin = {
  manifest: PluginManifest;
  compatible: boolean;
  enabled: boolean;
  directory: string;
  security: {
    sandboxed: boolean;
    networkAccess: false;
    fileSystemAccess: false;
    secretsAccess: false;
    runtimeSha256?: string;
    hostProxyAccess?: 'loopback-audio' | 'managed-audio';
    audioGeneratorEndpoints?: Array<{
      id: string;
      endpoint: string;
      healthEndpoint: string;
    }>;
    managedAudioAdapters?: Array<{
      id: string;
      hostAdapter: 'voxcpm2' | 'chattts' | 'qwen3tts' | 'cosyvoice3' | 'woosh' | 'acestepXl';
    }>;
  };
};

export type PluginBackup = {
  id: string;
  backupId: string;
  version: string;
  createdAt: string;
  fileCount: number;
};

export type PluginCatalog = {
  directory: string;
  backupDirectory: string;
  /** Current Canvas package version used for engine compatibility checks. */
  canvasVersion?: string;
  /** Canvas version captured when this Bridge process started, for diagnostics only. */
  bridgeVersion?: string;
  plugins: InstalledPlugin[];
  backups: PluginBackup[];
  errors: Array<{ directory: string; message: string }>;
  mode: 'sandboxed-runtime';
};

export type PluginPackageFile = {
  name: string;
  size: number;
  base64: string;
};

export type PluginRuntimePayload = {
  source: string;
  sha256: string;
};

export type PluginAudioGenerationMode = 'design' | 'clone' | 'hifi';

export type PluginAudioReference = {
  base64: string;
  mimeType: string;
  fileName?: string;
};

export type PluginAudioGenerationRequest = {
  mode: PluginAudioGenerationMode;
  text: string;
  control?: string;
  referenceAudio?: PluginAudioReference;
  referenceAudios?: PluginAudioReference[];
  options?: Record<string, unknown>;
};

export type PluginAudioGenerationResult = {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
};

export type PluginAudioHealthResult = {
  ok: boolean;
  status: number;
  latencyMs?: number;
  message?: string;
};

export type PluginSeedAudioKeyConfigurationResult = {
  configured: true;
  configuredAt: string;
};

export type PluginAudioInstallerLicenseComponent = {
  id: string;
  name: string;
  url: string;
  commercialUse: boolean;
  notice: string;
};

export type PluginAudioInstallerLicense = {
  id: string;
  name: string;
  url: string;
  commercialUse: boolean;
  requiresAcceptance: boolean;
  notice: string;
  acceptanceSha256: string;
  components: PluginAudioInstallerLicenseComponent[];
};

export type PluginAudioGeneratorInstallInfo = {
  id: string;
  label: string;
  engine: string;
  installed: boolean;
  installAvailable: boolean;
  unavailableReason: string;
  license: PluginAudioInstallerLicense;
};

export type PluginAudioInstallStatus = {
  generatorId: string;
  status: string;
  phase?: string;
  message?: string;
  operationId?: string | null;
  completedBytes?: number;
  totalBytes?: number;
  provider?: string;
  artifactId?: string;
  installed?: boolean;
  error?: string | null;
  updatedAt?: string | null;
};

export type PluginReferenceAudioEntry = {
  id: string;
  name: string;
  fileName: string;
  category: string;
  mimeType: string;
  size: number;
  transcript: string;
  avatarDataUrl?: string;
};

export type PluginReferenceAudioLibrary = {
  categories: string[];
  entries: PluginReferenceAudioEntry[];
};

export type PluginAudioRequestOptions = {
  bridgeBase?: string;
  signal?: AbortSignal;
};

export type PluginPoseModelInstallInfo = {
  id: 'gem-x' | 'rtmw3d';
  label: string;
  installed: boolean;
  installAvailable: boolean;
  bytes: number;
  runtimeNote: string;
  license: { id: string; name: string; url: string };
  workerAvailable?: boolean;
  workerAvailability?: 'ready' | 'runtime-required';
  workerBackend?: string;
  workerMessage?: string;
};

export type PluginDepthModelInstallInfo = Omit<PluginPoseModelInstallInfo, 'id'> & {
  id: 'depth-anything-v2-small' | 'sapiens2-normal-0.4b';
};

export type PluginVisionModelId =
  PluginPoseModelInstallInfo['id'] | PluginDepthModelInstallInfo['id'];

const PLUGIN_VISION_MODEL_IDS = new Set<PluginVisionModelId>([
  'gem-x',
  'rtmw3d',
  'depth-anything-v2-small',
  'sapiens2-normal-0.4b',
]);

function isPluginVisionModelId(value: string): value is PluginVisionModelId {
  return PLUGIN_VISION_MODEL_IDS.has(value as PluginVisionModelId);
}

export type PluginPoseModelInstallStatus = {
  engineId: PluginVisionModelId;
  status: string;
  phase?: string;
  message?: string;
  completedBytes?: number;
  totalBytes?: number;
  installed?: boolean;
  error?: string | null;
  updatedAt?: string | null;
};

const LEGACY_QIANSI_AUDIO_NODE_IDS = new Set(['voxcpm2-tts', 'chattts-tts']);

export function resolvePluginNodeIdentity(pluginId: unknown, pluginNodeId: unknown) {
  const safePluginId = typeof pluginId === 'string' ? pluginId : '';
  const safePluginNodeId = typeof pluginNodeId === 'string' ? pluginNodeId : '';
  if (LEGACY_QIANSI_AUDIO_NODE_IDS.has(safePluginId) && safePluginNodeId === 'tts-workbench') {
    return { pluginId: 'qiansi-audio', pluginNodeId: 'audio-workbench' };
  }
  return { pluginId: safePluginId, pluginNodeId: safePluginNodeId };
}

export function enabledPluginCanvasMenus(catalog: PluginCatalog | null) {
  return enabledCompatiblePlugins(catalog).flatMap((plugin) =>
    plugin.manifest.contributes.menus
      .filter((entry) => entry.location === 'canvas')
      .map((entry) => ({ plugin, entry })),
  );
}

export function enabledCompatiblePlugins(catalog: PluginCatalog | null) {
  return (catalog?.plugins ?? []).filter((plugin) => plugin.enabled && plugin.compatible);
}

async function requestPluginCatalog(
  path: string,
  init?: RequestInit,
  bridgeBase = BRIDGE_BASE_URL,
) {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), init);
  const payload = (await response.json().catch(() => ({}))) as Partial<PluginCatalog> & {
    catalog?: PluginCatalog;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message || `插件服务请求失败（HTTP ${response.status}）。`);
  const catalog = payload.catalog ?? payload;
  if (
    typeof catalog.directory !== 'string' ||
    typeof catalog.backupDirectory !== 'string' ||
    !Array.isArray(catalog.plugins) ||
    !Array.isArray(catalog.backups) ||
    !Array.isArray(catalog.errors)
  ) {
    throw new Error('插件服务返回的数据格式无效。');
  }
  return catalog as PluginCatalog;
}

function mutateInstalledPlugin(
  path: '/plugins/uninstall' | '/plugins/restore',
  id: string,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestPluginCatalog(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
    bridgeBase,
  );
}

export function loadPluginCatalog(bridgeBase = BRIDGE_BASE_URL) {
  return requestPluginCatalog('/plugins', undefined, bridgeBase);
}

export function pluginAssetUrl(
  pluginId: string,
  asset: string,
  bridgeBase = BRIDGE_BASE_URL,
  version = '',
) {
  const versionQuery = version ? `?v=${encodeURIComponent(version)}` : '';
  return resolveBridgeUrl(
    `/plugins/assets/${encodeURIComponent(pluginId)}/${encodeURIComponent(asset)}${versionQuery}`,
    resolveBridgeBaseUrl(bridgeBase),
  );
}

function pluginAudioBridgeUrl(
  path:
    | '/plugins/audio/health'
    | '/plugins/audio/generate'
    | '/plugins/audio/configure-seed-audio-key'
    | '/plugins/audio/install/catalog'
    | '/plugins/audio/install/status'
    | '/plugins/audio/install/start'
    | '/plugins/audio/install/cancel'
    | '/plugins/audio/install/uninstall'
    | '/plugins/audio/reference-library/list'
    | '/plugins/audio/reference-library/read'
    | '/plugins/audio/reference-library/category/create'
    | '/plugins/audio/reference-library/rename'
    | '/plugins/audio/reference-library/import',
  bridgeBase?: string,
) {
  return resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase ?? BRIDGE_BASE_URL));
}

async function pluginAudioJsonRequest(
  path:
    | '/plugins/audio/configure-seed-audio-key'
    | '/plugins/audio/install/catalog'
    | '/plugins/audio/install/status'
    | '/plugins/audio/install/start'
    | '/plugins/audio/install/cancel'
    | '/plugins/audio/install/uninstall'
    | '/plugins/audio/reference-library/list'
    | '/plugins/audio/reference-library/category/create'
    | '/plugins/audio/reference-library/rename'
    | '/plugins/audio/reference-library/import',
  body: Record<string, unknown>,
  options: PluginAudioRequestOptions,
  fallback: string,
) {
  const response = await fetch(pluginAudioBridgeUrl(path, options.bridgeBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) throw await pluginAudioError(response, fallback);
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fallback}返回的数据格式无效。`);
  }
  return value as Record<string, unknown>;
}

function parseReferenceAudioEntry(value: unknown, label: string): PluginReferenceAudioEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}无效。`);
  }
  const item = value as Record<string, unknown>;
  const text = (key: string, maximum: number) => {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
      throw new Error(`${label}${key}无效。`);
    }
    return value;
  };
  const id = text('id', 64).toLowerCase();
  const mimeType = text('mimeType', 80).toLowerCase();
  const size = Number(item.size);
  const transcript = item.transcript;
  const avatarDataUrl = item.avatarDataUrl;
  if (!/^[a-f0-9]{32}$/.test(id) || !mimeType.startsWith('audio/')) {
    throw new Error(`${label}格式无效。`);
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > 16 * 1024 * 1024) {
    throw new Error(`${label}大小无效。`);
  }
  if (typeof transcript !== 'string' || transcript.length > 16_000) {
    throw new Error(`${label}准确转写无效。`);
  }
  if (
    avatarDataUrl != null &&
    (typeof avatarDataUrl !== 'string' ||
      avatarDataUrl.length > 700_000 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(avatarDataUrl))
  ) {
    throw new Error(`${label}头像无效。`);
  }
  return {
    id,
    name: text('name', 120),
    fileName: text('fileName', 160),
    category: text('category', 80),
    mimeType,
    size,
    transcript,
    ...(avatarDataUrl ? { avatarDataUrl } : {}),
  };
}

function parseReferenceAudioLibrary(value: Record<string, unknown>): PluginReferenceAudioLibrary {
  if (!Array.isArray(value.categories) || !Array.isArray(value.entries)) {
    throw new Error('参考音频库返回的数据格式无效。');
  }
  if (value.categories.length > 200 || value.entries.length > 2_000) {
    throw new Error('参考音频库条目过多。');
  }
  const categories = value.categories.map((category, index) => {
    if (typeof category !== 'string' || !category.trim() || category.length > 80) {
      throw new Error(`参考音频库第 ${index + 1} 个分类无效。`);
    }
    return category;
  });
  return {
    categories,
    entries: value.entries.map((entry, index) =>
      parseReferenceAudioEntry(entry, `参考音频库第 ${index + 1} 个条目`),
    ),
  };
}

function boundedInstallerText(value: unknown, label: string, maximum = 1_000) {
  if (typeof value !== 'string') throw new Error(`${label}无效。`);
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error(`${label}无效。`);
  return text;
}

function boundedInstallerHttpsUrl(value: unknown, label: string) {
  const text = boundedInstallerText(value, label, 500);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label}无效。`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${label}无效。`);
  }
  return text;
}

function installerNotice(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length > 1_000) throw new Error(`${label}无效。`);
  return value;
}

function parsePluginAudioLicenseComponents(
  value: unknown,
  fallback: PluginAudioInstallerLicenseComponent,
) {
  if (value == null) return [fallback];
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new Error('许可证组成无效。');
  }
  const allowedKeys = new Set(['id', 'name', 'url', 'commercialUse', 'notice']);
  const identities = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`许可证组成第 ${index + 1} 项无效。`);
    }
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !allowedKeys.has(key))) {
      throw new Error(`许可证组成第 ${index + 1} 项包含未知字段。`);
    }
    if (typeof item.commercialUse !== 'boolean') {
      throw new Error(`许可证组成第 ${index + 1} 项状态无效。`);
    }
    const component = {
      id: boundedInstallerText(item.id, `许可证组成第 ${index + 1} 项 ID`, 80),
      name: boundedInstallerText(item.name, `许可证组成第 ${index + 1} 项名称`, 120),
      url: boundedInstallerHttpsUrl(item.url, `许可证组成第 ${index + 1} 项地址`),
      commercialUse: item.commercialUse,
      notice: installerNotice(item.notice, `许可证组成第 ${index + 1} 项说明`),
    };
    const identity = `${component.id}\n${component.url}`;
    if (identities.has(identity)) throw new Error('许可证组成包含重复项。');
    identities.add(identity);
    return component;
  });
}

function parsePluginAudioInstallStatus(value: Record<string, unknown>): PluginAudioInstallStatus {
  const generatorId = boundedInstallerText(value.generatorId, '模型安装状态 ID', 64);
  const status = boundedInstallerText(value.status, '模型安装状态', 32);
  if (!/^[a-z][a-z-]{0,31}$/.test(status)) throw new Error('模型安装状态无效。');
  const optionalText = (key: string, maximum = 1_000) => {
    const item = value[key];
    if (item == null || item === '') return;
    return boundedInstallerText(item, `模型安装 ${key}`, maximum);
  };
  const optionalBytes = (key: string) => {
    const item = value[key];
    if (item == null) return;
    const number = Number(item);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`模型安装 ${key} 无效。`);
    return number;
  };
  const operationId = optionalText('operationId', 128);
  const error = optionalText('error', 1_000);
  return {
    generatorId,
    status,
    ...(optionalText('phase', 64) ? { phase: optionalText('phase', 64) } : {}),
    ...(optionalText('message') ? { message: optionalText('message') } : {}),
    ...(operationId ? { operationId } : {}),
    ...(optionalBytes('completedBytes') != null
      ? { completedBytes: optionalBytes('completedBytes') }
      : {}),
    ...(optionalBytes('totalBytes') != null ? { totalBytes: optionalBytes('totalBytes') } : {}),
    ...(optionalText('provider', 40) ? { provider: optionalText('provider', 40) } : {}),
    ...(optionalText('artifactId', 120) ? { artifactId: optionalText('artifactId', 120) } : {}),
    ...(typeof value.installed === 'boolean' ? { installed: value.installed } : {}),
    ...(error ? { error } : {}),
    ...(optionalText('updatedAt', 80) ? { updatedAt: optionalText('updatedAt', 80) } : {}),
  };
}

async function pluginAudioError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return new Error(payload.error?.message || `${fallback}（HTTP ${response.status}）。`);
}

export async function probePluginAudioGenerator(
  pluginId: string,
  generatorId: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginAudioHealthResult> {
  const response = await fetch(pluginAudioBridgeUrl('/plugins/audio/health', options.bridgeBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId, generatorId }),
    signal: options.signal,
  });
  if (!response.ok) throw await pluginAudioError(response, '插件音频服务健康检查失败');
  const payload = (await response.json().catch(() => ({}))) as Partial<PluginAudioHealthResult>;
  const status = Number(payload.status);
  if (typeof payload.ok !== 'boolean' || !Number.isInteger(status)) {
    throw new Error('插件音频服务健康检查返回的数据格式无效。');
  }
  return {
    ok: payload.ok,
    status,
    ...(Number.isFinite(payload.latencyMs) ? { latencyMs: Number(payload.latencyMs) } : {}),
    ...(typeof payload.message === 'string' && payload.message ? { message: payload.message } : {}),
  };
}

export async function configurePluginSeedAudioApiKey(
  pluginId: string,
  generatorId: string,
  apiKey: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginSeedAudioKeyConfigurationResult> {
  const payload = await pluginAudioJsonRequest(
    '/plugins/audio/configure-seed-audio-key',
    { pluginId, generatorId, apiKey },
    options,
    'Seed Audio API Key 保存失败',
  );
  if (payload.configured !== true || typeof payload.configuredAt !== 'string') {
    throw new Error('Seed Audio API Key 保存结果无效。');
  }
  const configuredAt = payload.configuredAt.trim();
  if (!configuredAt || configuredAt.length > 80 || !Number.isFinite(Date.parse(configuredAt))) {
    throw new Error('Seed Audio API Key 保存时间无效。');
  }
  return { configured: true, configuredAt };
}

export async function generatePluginAudio(
  pluginId: string,
  generatorId: string,
  request: PluginAudioGenerationRequest,
  options: PluginAudioRequestOptions = {},
): Promise<PluginAudioGenerationResult> {
  const response = await fetch(
    pluginAudioBridgeUrl('/plugins/audio/generate', options.bridgeBase),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId,
        generatorId,
        request,
      }),
      signal: options.signal,
    },
  );
  if (!response.ok) throw await pluginAudioError(response, '插件音频生成失败');
  const mimeType = String(response.headers.get('content-type') || '').split(';', 1)[0] ?? '';
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (!normalizedMimeType.startsWith('audio/')) {
    throw new Error('插件音频服务未返回有效音频。');
  }
  const encodedFileName = String(response.headers.get('x-qiansi-audio-file-name') || '');
  let fileName = '';
  if (encodedFileName) {
    try {
      fileName = decodeURIComponent(encodedFileName);
    } catch {
      fileName = '';
    }
  }
  const durationSeconds = Number(response.headers.get('x-qiansi-audio-duration-seconds'));
  return {
    bytes: await response.arrayBuffer(),
    mimeType: normalizedMimeType,
    ...(fileName ? { fileName } : {}),
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { durationSeconds } : {}),
  };
}

export async function listPluginReferenceAudioLibrary(
  pluginId: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginReferenceAudioLibrary> {
  return parseReferenceAudioLibrary(
    await pluginAudioJsonRequest(
      '/plugins/audio/reference-library/list',
      { pluginId },
      options,
      '参考音频库读取失败',
    ),
  );
}

export async function createPluginReferenceAudioCategory(
  pluginId: string,
  category: string,
  options: PluginAudioRequestOptions = {},
): Promise<string> {
  const payload = await pluginAudioJsonRequest(
    '/plugins/audio/reference-library/category/create',
    { pluginId, category },
    options,
    '参考音频分类创建失败',
  );
  if (typeof payload.category !== 'string' || !payload.category.trim()) {
    throw new Error('参考音频分类创建返回的数据格式无效。');
  }
  return payload.category.trim();
}

export async function readPluginReferenceAudio(
  pluginId: string,
  id: string,
  options: PluginAudioRequestOptions = {},
) {
  const response = await fetch(
    pluginAudioBridgeUrl('/plugins/audio/reference-library/read', options.bridgeBase),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId, id }),
      signal: options.signal,
    },
  );
  if (!response.ok) throw await pluginAudioError(response, '参考音频读取失败');
  const mimeType = String(response.headers.get('content-type') || '').split(';', 1)[0] || '';
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (!normalizedMimeType.startsWith('audio/')) throw new Error('参考音频格式无效。');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 16 * 1024 * 1024) {
    throw new Error('参考音频大小无效。');
  }
  let fileName = '';
  try {
    fileName = decodeURIComponent(response.headers.get('x-qiansi-audio-file-name') || '');
  } catch {
    fileName = '';
  }
  if (!fileName || fileName.length > 160) throw new Error('参考音频文件名无效。');
  return { bytes, mimeType: normalizedMimeType, fileName };
}

export async function renamePluginReferenceAudio(
  pluginId: string,
  id: string,
  name: string,
  category: string,
  transcript: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginReferenceAudioEntry> {
  const payload = await pluginAudioJsonRequest(
    '/plugins/audio/reference-library/rename',
    { pluginId, id, name, category, transcript },
    options,
    '参考音频修改失败',
  );
  return parseReferenceAudioEntry(payload.entry, '参考音频条目');
}

export async function importPluginReferenceAudio(
  pluginId: string,
  fileName: string,
  mimeType: string,
  base64: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginReferenceAudioEntry> {
  const payload = await pluginAudioJsonRequest(
    '/plugins/audio/reference-library/import',
    { pluginId, fileName, mimeType, base64 },
    options,
    '参考音频导入失败',
  );
  return parseReferenceAudioEntry(payload.entry, '参考音频条目');
}

export async function listPluginAudioGenerators(
  pluginId: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginAudioGeneratorInstallInfo[]> {
  const payload = await pluginAudioJsonRequest(
    '/plugins/audio/install/catalog',
    { pluginId },
    options,
    '模型安装目录读取失败',
  );
  if (!Array.isArray(payload.generators)) throw new Error('模型安装目录缺少生成器列表。');
  return payload.generators.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`模型安装目录第 ${index + 1} 项无效。`);
    }
    const item = raw as Record<string, unknown>;
    const rawLicense = item.license;
    if (!rawLicense || typeof rawLicense !== 'object' || Array.isArray(rawLicense)) {
      throw new Error(`模型安装目录第 ${index + 1} 项缺少许可证。`);
    }
    const licenseValue = rawLicense as Record<string, unknown>;
    const acceptanceSha256 = boundedInstallerText(
      licenseValue.acceptanceSha256,
      '许可证摘要',
      64,
    ).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(acceptanceSha256)) throw new Error('许可证摘要无效。');
    if (
      typeof item.installed !== 'boolean' ||
      typeof item.installAvailable !== 'boolean' ||
      typeof licenseValue.commercialUse !== 'boolean' ||
      typeof licenseValue.requiresAcceptance !== 'boolean'
    ) {
      throw new Error(`模型安装目录第 ${index + 1} 项状态无效。`);
    }
    const licenseId = boundedInstallerText(licenseValue.id, '许可证 ID', 80);
    const licenseName = boundedInstallerText(licenseValue.name, '许可证名称', 120);
    const licenseUrl = boundedInstallerHttpsUrl(licenseValue.url, '许可证地址');
    const licenseNotice = installerNotice(licenseValue.notice, '许可证说明');
    const licenseComponents = parsePluginAudioLicenseComponents(licenseValue.components, {
      id: licenseId,
      name: licenseName,
      url: licenseUrl,
      commercialUse: licenseValue.commercialUse,
      notice: licenseNotice,
    });
    if (
      licenseValue.commercialUse !== licenseComponents.every((component) => component.commercialUse)
    ) {
      throw new Error('许可证商业使用状态与组成不一致。');
    }
    return {
      id: boundedInstallerText(item.id, '模型安装 ID', 64),
      label: boundedInstallerText(item.label, '模型安装名称', 80),
      engine: boundedInstallerText(item.engine, '模型安装目录名', 64),
      installed: item.installed,
      installAvailable: item.installAvailable,
      unavailableReason:
        typeof item.unavailableReason === 'string' ? item.unavailableReason.slice(0, 1_000) : '',
      license: {
        id: licenseId,
        name: licenseName,
        url: licenseUrl,
        commercialUse: licenseValue.commercialUse,
        requiresAcceptance: licenseValue.requiresAcceptance,
        notice: licenseNotice,
        acceptanceSha256,
        components: licenseComponents,
      },
    };
  });
}

export async function readPluginAudioInstallStatus(
  pluginId: string,
  generatorId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginAudioInstallStatus(
    await pluginAudioJsonRequest(
      '/plugins/audio/install/status',
      { pluginId, generatorId },
      options,
      '模型安装状态读取失败',
    ),
  );
}

export async function startPluginAudioInstall(
  pluginId: string,
  generatorId: string,
  licenseAcceptance?: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginAudioInstallStatus(
    await pluginAudioJsonRequest(
      '/plugins/audio/install/start',
      { pluginId, generatorId, ...(licenseAcceptance ? { licenseAcceptance } : {}) },
      options,
      '模型安装启动失败',
    ),
  );
}

export async function cancelPluginAudioInstall(
  pluginId: string,
  generatorId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginAudioInstallStatus(
    await pluginAudioJsonRequest(
      '/plugins/audio/install/cancel',
      { pluginId, generatorId },
      options,
      '模型安装取消失败',
    ),
  );
}

export async function uninstallPluginAudioGenerator(
  pluginId: string,
  generatorId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginAudioInstallStatus(
    await pluginAudioJsonRequest(
      '/plugins/audio/install/uninstall',
      { pluginId, generatorId },
      options,
      '本机模型删除失败',
    ),
  );
}

type PluginMotionInstallPath =
  | '/plugins/vision/models/catalog'
  | '/plugins/vision/models/status'
  | '/plugins/vision/models/start'
  | '/plugins/vision/models/cancel'
  | '/plugins/vision/models/uninstall';

async function pluginMotionInstallRequest(
  path: PluginMotionInstallPath,
  body: Record<string, unknown>,
  options: PluginAudioRequestOptions,
  fallback: string,
) {
  const response = await fetch(
    resolveBridgeUrl(path, resolveBridgeBaseUrl(options.bridgeBase ?? BRIDGE_BASE_URL)),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    },
  );
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { error?: { message?: unknown } }).error?.message
        : '';
    throw new Error(typeof message === 'string' && message ? message : fallback);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fallback}返回的数据格式无效。`);
  }
  return value as Record<string, unknown>;
}

function parsePluginPoseModelInstallStatus(
  value: Record<string, unknown>,
): PluginPoseModelInstallStatus {
  const engineId = boundedInstallerText(value.engineId, '动作模型 ID', 32);
  if (!isPluginVisionModelId(engineId)) {
    throw new Error('视觉模型 ID 无效。');
  }
  const status = boundedInstallerText(value.status, '动作模型安装状态', 32);
  const optionalText = (key: string, maximum = 1_000) => {
    const item = value[key];
    if (item == null || item === '') return undefined;
    return boundedInstallerText(item, `动作模型 ${key}`, maximum);
  };
  const optionalBytes = (key: string) => {
    const item = value[key];
    if (item == null) return undefined;
    if (!Number.isSafeInteger(item) || Number(item) < 0) throw new Error(`动作模型 ${key} 无效。`);
    return Number(item);
  };
  if (value.installed != null && typeof value.installed !== 'boolean') {
    throw new Error('动作模型安装标记无效。');
  }
  return {
    engineId,
    status,
    phase: optionalText('phase', 64),
    message: optionalText('message'),
    completedBytes: optionalBytes('completedBytes'),
    totalBytes: optionalBytes('totalBytes'),
    installed: value.installed as boolean | undefined,
    error: value.error == null ? null : optionalText('error'),
    updatedAt: value.updatedAt == null ? null : optionalText('updatedAt', 80),
  };
}

async function listPluginVisionModels(
  pluginId: string,
  options: PluginAudioRequestOptions = {},
): Promise<Array<PluginPoseModelInstallInfo | PluginDepthModelInstallInfo>> {
  const payload = await pluginMotionInstallRequest(
    '/plugins/vision/models/catalog',
    { pluginId },
    options,
    '动作模型目录读取失败。',
  );
  if (!Array.isArray(payload.models)) throw new Error('动作模型目录缺少模型列表。');
  return payload.models.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`动作模型目录第 ${index + 1} 项无效。`);
    }
    const item = raw as Record<string, unknown>;
    const id = boundedInstallerText(item.id, '动作模型 ID', 32);
    if (!isPluginVisionModelId(id)) {
      throw new Error('视觉模型目录包含未知模型。');
    }
    const license = item.license;
    if (!license || typeof license !== 'object' || Array.isArray(license)) {
      throw new Error('动作模型许可证无效。');
    }
    if (
      typeof item.installed !== 'boolean' ||
      typeof item.installAvailable !== 'boolean' ||
      !Number.isSafeInteger(item.bytes) ||
      Number(item.bytes) < 1
    ) {
      throw new Error('动作模型目录状态无效。');
    }
    const licenseValue = license as Record<string, unknown>;
    return {
      id,
      label: boundedInstallerText(item.label, '动作模型名称', 100),
      installed: item.installed,
      installAvailable: item.installAvailable,
      bytes: Number(item.bytes),
      runtimeNote: boundedInstallerText(item.runtimeNote, '动作模型运行说明', 500),
      license: {
        id: boundedInstallerText(licenseValue.id, '动作模型许可证 ID', 80),
        name: boundedInstallerText(licenseValue.name, '动作模型许可证名称', 120),
        url: boundedInstallerHttpsUrl(licenseValue.url, '动作模型许可证地址'),
      },
      ...(typeof item.workerAvailable === 'boolean'
        ? { workerAvailable: item.workerAvailable }
        : {}),
      ...(item.workerAvailability === 'ready' || item.workerAvailability === 'runtime-required'
        ? { workerAvailability: item.workerAvailability }
        : {}),
      ...(typeof item.workerBackend === 'string'
        ? { workerBackend: boundedInstallerText(item.workerBackend, '动作 Worker 后端', 120) }
        : {}),
      ...(typeof item.workerMessage === 'string'
        ? { workerMessage: boundedInstallerText(item.workerMessage, '动作 Worker 状态', 500) }
        : {}),
    } as PluginPoseModelInstallInfo | PluginDepthModelInstallInfo;
  });
}

export async function listPluginPoseModels(
  pluginId: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginPoseModelInstallInfo[]> {
  return (await listPluginVisionModels(pluginId, options)).filter(
    (model): model is PluginPoseModelInstallInfo => model.id === 'gem-x' || model.id === 'rtmw3d',
  );
}

export async function listPluginDepthModels(
  pluginId: string,
  options: PluginAudioRequestOptions = {},
): Promise<PluginDepthModelInstallInfo[]> {
  return (await listPluginVisionModels(pluginId, options)).filter(
    (model): model is PluginDepthModelInstallInfo =>
      model.id === 'depth-anything-v2-small' || model.id === 'sapiens2-normal-0.4b',
  );
}

export async function readPluginPoseModelInstallStatus(
  pluginId: string,
  engineId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginPoseModelInstallStatus(
    await pluginMotionInstallRequest(
      '/plugins/vision/models/status',
      { pluginId, engineId },
      options,
      '动作模型状态读取失败。',
    ),
  );
}

export async function startPluginPoseModelInstall(
  pluginId: string,
  engineId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginPoseModelInstallStatus(
    await pluginMotionInstallRequest(
      '/plugins/vision/models/start',
      { pluginId, engineId },
      options,
      '动作模型安装启动失败。',
    ),
  );
}

export async function cancelPluginPoseModelInstall(
  pluginId: string,
  engineId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginPoseModelInstallStatus(
    await pluginMotionInstallRequest(
      '/plugins/vision/models/cancel',
      { pluginId, engineId },
      options,
      '动作模型安装取消失败。',
    ),
  );
}

export async function uninstallPluginPoseModel(
  pluginId: string,
  engineId: string,
  options: PluginAudioRequestOptions = {},
) {
  return parsePluginPoseModelInstallStatus(
    await pluginMotionInstallRequest(
      '/plugins/vision/models/uninstall',
      { pluginId, engineId },
      options,
      '动作模型删除失败。',
    ),
  );
}

export async function importPluginManifest(file: File, bridgeBase = BRIDGE_BASE_URL) {
  if (file.size > 256 * 1024) throw new Error('插件清单不能超过 256 KB。');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await file.text());
  } catch {
    throw new Error('插件清单不是有效 JSON。');
  }
  return requestPluginCatalog(
    '/plugins/import',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest }),
    },
    bridgeBase,
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export type PluginStyleSample = {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  relativePath: string;
  uploadedAt: string;
};

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function pluginStyleSampleRequest(
  path: '/plugins/style-samples/read' | '/plugins/style-samples/upload',
  body: Record<string, unknown>,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<PluginStyleSample | null> {
  const response = await fetch(resolveBridgeUrl(path, resolveBridgeBaseUrl(bridgeBase)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    sample?: {
      fileName?: unknown;
      mimeType?: unknown;
      base64?: unknown;
      relativePath?: unknown;
      uploadedAt?: unknown;
    } | null;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message || `风格样图请求失败（HTTP ${response.status}）。`);
  if (payload.sample == null) return null;
  const sample = payload.sample;
  if (
    typeof sample.fileName !== 'string' ||
    typeof sample.mimeType !== 'string' ||
    typeof sample.base64 !== 'string' ||
    typeof sample.relativePath !== 'string' ||
    typeof sample.uploadedAt !== 'string'
  )
    throw new Error('风格样图服务返回的数据格式无效。');
  return {
    fileName: sample.fileName,
    mimeType: sample.mimeType,
    bytes: base64ToArrayBuffer(sample.base64),
    relativePath: sample.relativePath,
    uploadedAt: sample.uploadedAt,
  };
}

export function readPluginStyleSample(
  pluginId: string,
  packId: string,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return pluginStyleSampleRequest('/plugins/style-samples/read', { pluginId, packId }, bridgeBase);
}

export async function uploadPluginStyleSample(
  pluginId: string,
  packId: string,
  fileName: string,
  mimeType: string,
  bytes: ArrayBuffer,
  bridgeBase = BRIDGE_BASE_URL,
) {
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('风格样图不能超过 8 MiB。');
  return pluginStyleSampleRequest(
    '/plugins/style-samples/upload',
    { pluginId, packId, fileName, mimeType, base64: bytesToBase64(new Uint8Array(bytes)) },
    bridgeBase,
  );
}

export async function importPluginPackage(files: File[], bridgeBase = BRIDGE_BASE_URL) {
  if (files.length === 0) throw new Error('请选择插件目录中的文件。');
  if (files.length > 64) throw new Error('一个插件包最多包含 64 个文件。');
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > 12 * 1024 * 1024) throw new Error('插件包不能超过 12 MB。');
  const packageFiles: PluginPackageFile[] = [];
  for (const file of files) {
    packageFiles.push({
      name: file.name,
      size: file.size,
      base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    });
  }
  return requestPluginCatalog(
    '/plugins/import-package',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: packageFiles }),
    },
    bridgeBase,
  );
}

export async function loadPluginRuntime(
  pluginId: string,
  bridgeBase = BRIDGE_BASE_URL,
): Promise<PluginRuntimePayload> {
  const response = await fetch(
    resolveBridgeUrl(
      `/plugins/runtime/${encodeURIComponent(pluginId)}`,
      resolveBridgeBaseUrl(bridgeBase),
    ),
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<PluginRuntimePayload> & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `插件运行时加载失败（HTTP ${response.status}）。`);
  }
  if (typeof payload.source !== 'string' || typeof payload.sha256 !== 'string') {
    throw new Error('插件运行时返回的数据格式无效。');
  }
  return { source: payload.source, sha256: payload.sha256 };
}

export function setInstalledPluginEnabled(
  id: string,
  enabled: boolean,
  bridgeBase = BRIDGE_BASE_URL,
) {
  return requestPluginCatalog(
    '/plugins/toggle',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    },
    bridgeBase,
  );
}

export function uninstallInstalledPlugin(id: string, bridgeBase = BRIDGE_BASE_URL) {
  return mutateInstalledPlugin('/plugins/uninstall', id, bridgeBase);
}

export function restoreInstalledPlugin(id: string, bridgeBase = BRIDGE_BASE_URL) {
  return mutateInstalledPlugin('/plugins/restore', id, bridgeBase);
}
