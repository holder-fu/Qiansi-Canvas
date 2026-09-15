import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import {
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, hostname, networkInterfaces, platform } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  JIMENG_IMAGE_MODELS,
  JIMENG_MODEL_DISPLAY_NAMES,
  buildJimengImageCommand,
  buildJimengVideoCommand,
  collectDreaminaMediaItems,
  extractDreaminaSubmitId,
  inspectDreaminaVipAccess,
  inspectDreaminaQueryResult,
  jimengVideoModelsForVipAccess,
} from './src/lib/jimengCliContract.mjs';
import {
  CODEBUDDY_AUTO_MODEL,
  buildCodeBuddyTextArgs,
  getCodeBuddyInputModalities,
  mergeCodeBuddyModels,
  parseCodeBuddyActiveSessions,
  parseCodeBuddyConfiguredModel,
} from './src/lib/codebuddyCliContract.mjs';
import { inspectAntigravityModelProbe } from './src/lib/antigravityCliContract.mjs';
import {
  extractCodexImageCandidates,
  inspectCodexPrimaryProbe,
  isCodexReasoningEffort,
  parseCodexModelCatalog,
  summarizeCodexImageFailure,
} from './src/lib/codexCliContract.mjs';
import {
  arkCliSafeMessage,
  buildArkCliAuthStatusArgs,
  buildArkCliVersionArgs,
  inspectArkCliAuthStatus,
} from './src/lib/arkCliContract.mjs';
import {
  classifyProviderAddressLiteral,
  groupProviderModelPayloads,
  partitionProviderModelSettlements,
  providerModelIds,
  readLimitedProviderJson,
  safeProviderRemoteUrl,
  settleProviderModelDiscovery,
} from './src/lib/providerModelContract.mjs';
import {
  buildImageProviderRequest,
  parseImageProviderResponse,
} from './src/lib/imageProviderContract.mjs';
import {
  BAILIAN_IMAGE_MODELS,
  BAILIAN_VIDEO_MODELS,
  LIGHTX2V_IMAGE_MODELS,
  LIGHTX2V_VIDEO_MODELS,
  bailianImageArgs,
  bailianVideoArgs,
} from './src/lib/visualCliContract.mjs';
import {
  createBridgeOriginPolicy,
  isPrivateNetworkHost,
  withMachineCanvasOrigins,
} from './bridge-origin.mjs';
import { freshProviderRequest } from './provider-http-transport.mjs';
import { localPersistedMediaPathname } from './local-persisted-media-url.mjs';
import { canvasWebMime } from './canvas-web-mime.mjs';
import { imageApiAdapter, imageProviderRoute } from './bridge-image-routing.mjs';
import {
  assertActiveProvider,
  assertActiveProviderProtocol,
} from './bridge-provider-lifecycle.mjs';
import {
  buildRemoteChatPayload,
  collectCliChatInput,
  describeEmptyRemoteChatResponse,
  extractRemoteChatText,
} from './bridge-chat.mjs';
import {
  compareUpdateVersions,
  findPreviousUpdateRelease,
  mergeUpdateSourceConfigs,
  normalizeUpdateSources,
  parseUpdateManifest,
  safeUpdateUrl,
} from './system-update-contract.mjs';
import { probeUpdateSourceConnectivity } from './system-update-network.mjs';
import {
  isPluginEngineCompatible,
  normalizePluginState,
  parsePluginManifest,
} from './plugin-contract.mjs';
import { createCanvasHostVersionReader } from './canvas-host-version.mjs';
import { readLatestPluginStyleSample, uploadPluginStyleSample } from './plugin-style-samples.mjs';
import {
  generatePluginAudioThroughProxy,
  PluginAudioProxyError,
  probePluginAudioGeneratorEndpoint,
} from './plugin-audio-proxy.mjs';
import { saveSeedAudioApiKeyConfig, SeedAudioConfigError } from './plugin-seed-audio-config.mjs';
import { ManagedAudioWorkerPool } from './managed-audio-worker.mjs';
import {
  ManagedAudioInstallerError,
  ManagedAudioInstallerManager,
  QIANSI_AUDIO_PLUGIN_ID,
} from './managed-audio-installer.mjs';
import {
  ManagedMotionInstallerError,
  ManagedMotionInstallerManager,
  QIANSI_MOTION_MODEL_IDS,
  QIANSI_MOTION_PLUGIN_ID,
} from './managed-motion-installer.mjs';
import {
  ManagedMotionWorkerError,
  ManagedMotionWorkerPool,
  MAX_MANAGED_MOTION_VIDEO_BYTES,
} from './managed-motion-worker.mjs';
import {
  ManagedSapiensNormalWorkerError,
  ManagedSapiensNormalWorkerPool,
  MAX_SAPIENS_NORMAL_FRAME_BYTES,
  SAPIENS_NORMAL_MODEL_ID,
} from './managed-sapiens-normal-worker.mjs';
import {
  AUDIO_ASSET_MIME_EXTENSIONS,
  AUDIO_FILE_SIGNATURE_SCAN_BYTES,
  ffprobePacketEndSeconds,
  generatedAudioFileExtension,
  generatedOutputAudioMime,
  hasWebmFileSignature,
  resolveAudioAssetUploadFormat,
} from './audio-file-format.mjs';
import { parseGeneratedVideoAudioTrackProbe } from './generated-video-audio.mjs';
import { detectComfyMediaFormat } from './comfy-media-format.mjs';
import {
  createExtensionBackup,
  listExtensionBackups,
  restoreExtensionBackup,
} from './extension-backups.mjs';
import {
  fetchComfyOutputResponse,
  inspectLocalComfy,
  normalizeLocalComfyBaseUrl,
  queueComfyWorkflow,
  uploadComfyFile,
  uploadComfyImage,
  waitForComfyJob,
} from './comfyui-client.mjs';
import {
  createComfyWorkflowPreset,
  dedupeComfyWorkflowPresets,
  isCloudComfyConnectionId,
  isComfyConnectionId,
  isRemoteComfyConnectionId,
  inspectComfyWorkflowCompatibility,
  normalizeStoredComfyWorkflow,
  prepareComfy3dWorkflow,
  prepareComfyAudioWorkflow,
  prepareComfyImageWorkflow,
  prepareComfyVideoWorkflow,
  publicComfyWorkflow,
  refreshComfyWorkflowValidation,
  upsertComfyWorkflowPreset,
} from './bridge-comfyui.mjs';
import {
  extractComfy3dOutputs,
  extractComfyAudioOutputs,
  extractComfyVideoOutputs,
  parseComfyHistoryOutputDescriptors,
} from './comfy-workflow.mjs';
import { normalizeCommunityServerUrl, probeCommunityServer } from './community-client-contract.mjs';
import {
  BRIDGE_PAIR_QUERY,
  BridgeRequestGate,
  DEFAULT_BRIDGE_HOST,
  bridgeAccessCookie,
  bridgeSecurityHeaders,
  bridgeTokenMatches,
  createBridgeAccessToken,
  isLanCollaborationRequest,
  isLoopbackAddress,
  inspectDirectorModelUpload,
  inspectDeclaredMediaSignature,
  managedAssetIdFromSource,
  normalizeBridgeAccessToken,
  normalizePersistedLightX2VConfig,
  requestBridgeAccessToken,
} from './bridge-security.mjs';
import {
  GenerationRequestError,
  GenerationRequestRegistry,
} from './generation-request-registry.mjs';
import {
  applyStorageCleanupCandidates,
  buildStorageCleanupPlan,
  listStorageCleanupCandidates,
  STORAGE_CLEANUP_MEDIA_MIN_AGE_MS,
} from './storage-cleanup.mjs';
import {
  BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
  BridgeProjectStorage,
  atomicWriteJson,
  fsyncDirectory,
  fsyncFile,
  readJsonIfExists,
  resolveCanvasDataRoot,
} from './bridge-project-storage.mjs';
import {
  BridgeUserProfileConflictError,
  BridgeUserProfileStorage,
} from './bridge-user-profile.mjs';
import {
  BridgeGenerationLimitsConflictError,
  BridgeGenerationLimitsStorage,
} from './bridge-generation-limits.mjs';
import {
  BridgeTextModeCatalogConflictError,
  BridgeTextModeCatalogStorage,
} from './bridge-text-mode-catalog.mjs';
import {
  BridgeImageTypePresetCatalogConflictError,
  BridgeImageTypePresetCatalogStorage,
  BridgePromptLibraryConflictError,
  BridgePromptLibraryStorage,
} from './bridge-prompt-library.mjs';
import {
  BridgeBrowserStorage,
  BridgeBrowserStorageConflictError,
  MAX_BRIDGE_BROWSER_STORAGE_BYTES,
} from './bridge-browser-storage.mjs';
import {
  BridgeUserLibrariesConflictError,
  BridgeUserLibrariesStorage,
} from './bridge-user-libraries.mjs';
import {
  assertMaskedRepairProviderSupport,
  buildVideoEditPayload,
  normalizeVideoEditOperation,
  videoEditOperationLabel,
} from './src/lib/videoEditContract.mjs';
import {
  MAX_REFERENCE_AUDIO_BYTES,
  ReferenceAudioLibrary,
  ReferenceAudioLibraryError,
} from './plugin-reference-audio-library.mjs';
import {
  PluginFileDocumentConflictError,
  PluginProjectDocumentFileStore,
} from './plugin-document-storage.mjs';
import {
  PluginSharedStyleCoverConflictError,
  PluginSharedStyleCoverFileStore,
} from './plugin-style-cover-storage.mjs';

const PORT = Number(
  process.env.QIANSI_CANVAS_BRIDGE_PORT ||
    process.env.KITTY_CANVAS_BRIDGE_PORT ||
    process.env.MULIU_BRIDGE_PORT ||
    2895,
);
const HOST =
  String(
    process.env.QIANSI_CANVAS_HOST ||
      process.env.KITTY_CANVAS_HOST ||
      process.env.MULIU_BRIDGE_HOST ||
      (process.env.QIANSI_CANVAS_LAN === '1' ? '0.0.0.0' : DEFAULT_BRIDGE_HOST),
  ).trim() || DEFAULT_BRIDGE_HOST;
const MAX_BODY = 512 * 1024;
const MAX_ASSET_BODY = 18 * 1024 * 1024;
const MAX_PLUGIN_PACKAGE_BODY = 17 * 1024 * 1024;
const MAX_PLUGIN_AUDIO_BODY = 42 * 1024 * 1024;
const MAX_PLUGIN_STYLE_SAMPLE_BODY = 12 * 1024 * 1024;
const MAX_PLUGIN_RUNTIME_BYTES = 2 * 1024 * 1024;
const MAX_PLUGIN_DOCUMENT_BODY = 17 * 1024 * 1024;
const MAX_PLUGIN_STYLE_COVER_BODY = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
const MAX_MEDIA_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_PROJECT_BODY = 64 * 1024 * 1024;
const MAX_OUTPUT = 2 * 1024 * 1024;
const MAX_MEDIA_DURATION_SECONDS = 8 * 60 * 60;
const FFPROBE_PACKET_TIMEOUT_MS = 30_000;
const FFPROBE_PACKET_LINE_BYTES = 16 * 1024;
const FFPROBE_PACKET_STDERR_BYTES = 64 * 1024;
const MODEL_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const bridgeOriginPolicy = createBridgeOriginPolicy(
  withMachineCanvasOrigins(
    process.env.QIANSI_CANVAS_ALLOWED_ORIGINS || process.env.KITTY_CANVAS_ALLOWED_ORIGINS,
    hostname(),
    PORT,
  ),
);
const NETWORK_ADDRESSES = Object.values(networkInterfaces())
  .flatMap((items) => items || [])
  .filter((item) => item && (item.family === 'IPv4' || item.family === 4))
  .map((item) => item.address)
  .filter(isPrivateNetworkHost);
const LOCAL_BRIDGE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  normalizedHostname(HOST),
]);
for (const address of NETWORK_ADDRESSES) LOCAL_BRIDGE_HOSTS.add(address);

function normalizedHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

function isLoopbackHost(hostname) {
  const normalized = normalizedHostname(hostname);
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

const LAN_MODE = !isLoopbackHost(HOST);
const TRUSTED_LAN_MODE =
  LAN_MODE && String(process.env.QIANSI_CANVAS_TRUSTED_LAN || '').trim() === '1';
const BRIDGE_ACCESS_TOKEN =
  LAN_MODE && !TRUSTED_LAN_MODE
    ? normalizeBridgeAccessToken(process.env.QIANSI_CANVAS_ACCESS_TOKEN) ||
      createBridgeAccessToken()
    : '';
const PAIR_RETURN_PORT = (() => {
  const raw = String(process.env.QIANSI_CANVAS_PAIR_RETURN_PORT || '').trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('QIANSI_CANVAS_PAIR_RETURN_PORT 必须是 1–65535 之间的端口号。');
  }
  return value;
})();
const LAN_CANVAS_PORT = PAIR_RETURN_PORT || PORT;

function isLocalBridgeUrl(url) {
  return Boolean(
    url &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    LOCAL_BRIDGE_HOSTS.has(normalizedHostname(url.hostname)) &&
    Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === PORT,
  );
}

const BRIDGE_ENTRY = fileURLToPath(import.meta.url);
const PROJECT_ROOT = dirname(BRIDGE_ENTRY);
const LEGACY_DATA_ROOT = join(PROJECT_ROOT, 'data');
const DATA_ROOT = resolveCanvasDataRoot(PROJECT_ROOT);
const LAN_PAIRING_FILE = join(DATA_ROOT, 'runtime', 'lan-pairing.json');
const WEB_ROOT = join(PROJECT_ROOT, 'dist');
const APP_PACKAGE_PATH = join(PROJECT_ROOT, 'package.json');
const APP_PACKAGE = JSON.parse(await readFile(APP_PACKAGE_PATH, 'utf8'));
const APP_VERSION = String(APP_PACKAGE.version || '0.0.0');
const readCanvasHostVersion = createCanvasHostVersionReader(APP_PACKAGE_PATH, APP_VERSION);
const BRIDGE_BUILD_ID = createHash('sha256')
  .update(await readFile(BRIDGE_ENTRY))
  .digest('hex')
  .slice(0, 12);
const ASSET_LIBRARY_ROOT = join(DATA_ROOT, 'asset-library');
const ASSET_LIBRARY_FILES = join(ASSET_LIBRARY_ROOT, 'files');
const ASSET_LIBRARY_INDEX = join(ASSET_LIBRARY_ROOT, 'library.json');
const LEGACY_ASSET_LIBRARY_FILES = join(LEGACY_DATA_ROOT, 'asset-library', 'files');
const LEGACY_ASSET_LIBRARY_INDEX = join(LEGACY_DATA_ROOT, 'asset-library', 'library.json');
const MEDIA_PREVIEW_ROOT = join(ASSET_LIBRARY_ROOT, 'previews');
const LEGACY_MEDIA_PREVIEW_ROOT = join(PROJECT_ROOT, 'data', 'media-preview-cache');
const CLI_IMAGE_OUTPUT_ROOT = join(DATA_ROOT, 'cli-image-output');
const MAX_CLI_IMAGE_BYTES = 32 * 1024 * 1024;
const ASSET_KINDS = new Set([
  'character',
  'scene',
  'prop',
  'storyboard',
  'video',
  'audio',
  'director-model',
  'director-scene',
  'director-reference',
]);
const STYLE_LIBRARY_ROOT = join(DATA_ROOT, 'style-library');
const STYLE_LIBRARY_FILES = join(STYLE_LIBRARY_ROOT, 'thumbnails');
const STYLE_LIBRARY_INDEX = join(STYLE_LIBRARY_ROOT, 'library.json');
const CANVAS_THEME_LIBRARY_ROOT = join(DATA_ROOT, 'canvas-themes');
const NOTIFICATION_SOUND_ROOT = join(DATA_ROOT, 'notification-sounds');
const UPDATE_SOURCE_DEFAULT_FILE = join(PROJECT_ROOT, 'update-sources.default.json');
const UPDATE_SOURCE_FILE = join(DATA_ROOT, 'update-sources.json');
const UPDATE_DOWNLOAD_ROOT = join(DATA_ROOT, 'updates');
const MAX_UPDATE_MANIFEST_BYTES = 256 * 1024;
const MAX_UPDATE_PACKAGE_BYTES = 1024 * 1024 * 1024;
const PLUGIN_LIBRARY_ROOT = join(DATA_ROOT, 'plugins');
const PLUGIN_STATE_FILE = join(DATA_ROOT, 'plugin-state.json');
const PLUGIN_BACKUP_ROOT = join(DATA_ROOT, 'extension-backups', 'plugins');
const pluginProjectDocumentStore = new PluginProjectDocumentFileStore({
  pluginsRoot: PLUGIN_LIBRARY_ROOT,
});
const pluginSharedStyleCoverStore = new PluginSharedStyleCoverFileStore({
  pluginsRoot: PLUGIN_LIBRARY_ROOT,
});
const managedAudioWorkers = new ManagedAudioWorkerPool({ projectRoot: PROJECT_ROOT });
let managedAudioInstaller;
let managedMotionInstaller;
const managedMotionWorkers = new ManagedMotionWorkerPool({
  projectRoot: PROJECT_ROOT,
  pluginsRoot: PLUGIN_LIBRARY_ROOT,
  pluginRoot: join(PLUGIN_LIBRARY_ROOT, QIANSI_MOTION_PLUGIN_ID),
});
const managedSapiensNormalWorker = new ManagedSapiensNormalWorkerPool({
  projectRoot: PROJECT_ROOT,
  pluginsRoot: PLUGIN_LIBRARY_ROOT,
  pluginRoot: join(PLUGIN_LIBRARY_ROOT, QIANSI_MOTION_PLUGIN_ID),
});

const DEPTH_ANYTHING_MODEL_ID = 'depth-anything-v2-small';
const DENSE_VISION_MODEL_IDS = new Set([DEPTH_ANYTHING_MODEL_ID, SAPIENS_NORMAL_MODEL_ID]);
const MAX_SAPIENS_NORMAL_BODY = Math.ceil((MAX_SAPIENS_NORMAL_FRAME_BYTES * 4) / 3) + 32_768;
const DEPTH_ANYTHING_MODEL_CONFIG = Object.freeze({ model_type: 'depth_anything' });
const DEPTH_ANYTHING_PREPROCESSOR_CONFIG = Object.freeze({
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  ensure_multiple_of: 14,
  image_mean: [0.485, 0.456, 0.406],
  image_processor_type: 'DPTImageProcessor',
  image_std: [0.229, 0.224, 0.225],
  keep_aspect_ratio: true,
  resample: 3,
  rescale_factor: 1 / 255,
  size: { height: 518, width: 518 },
  size_divisor: null,
});

function getManagedAudioInstaller() {
  if (!managedAudioInstaller) {
    managedAudioInstaller = new ManagedAudioInstallerManager({
      projectRoot: PROJECT_ROOT,
      pluginId: QIANSI_AUDIO_PLUGIN_ID,
      pluginRoot: join(PLUGIN_LIBRARY_ROOT, QIANSI_AUDIO_PLUGIN_ID),
    });
  }
  return managedAudioInstaller;
}

function getManagedMotionInstaller() {
  if (!managedMotionInstaller) {
    managedMotionInstaller = new ManagedMotionInstallerManager({
      projectRoot: PROJECT_ROOT,
      pluginId: QIANSI_MOTION_PLUGIN_ID,
      pluginRoot: join(PLUGIN_LIBRARY_ROOT, QIANSI_MOTION_PLUGIN_ID),
    });
  }
  return managedMotionInstaller;
}
const projectStorage = new BridgeProjectStorage({
  dataRoot: DATA_ROOT,
  legacyProjectsRoot: join(LEGACY_DATA_ROOT, 'projects'),
  legacyArchiveRoot: join(LEGACY_DATA_ROOT, 'project-archive'),
});
const PROJECT_LIBRARY_ROOT = projectStorage.projectsRoot;
const PROJECT_LIBRARY_INDEX = join(PROJECT_LIBRARY_ROOT, 'projects.json');
const EXPORT_ROOT = join(DATA_ROOT, 'exports');
const BRIDGE_SETTINGS_FILE = join(DATA_ROOT, 'bridge-settings.json');
const userProfileStorage = new BridgeUserProfileStorage({ dataRoot: DATA_ROOT });
const generationLimitsStorage = new BridgeGenerationLimitsStorage({ dataRoot: DATA_ROOT });
const bridgeRequestGate = new BridgeRequestGate();
bridgeRequestGate.configure(await generationLimitsStorage.read());
const textModeCatalogStorage = new BridgeTextModeCatalogStorage({ dataRoot: DATA_ROOT });
const promptLibraryStorage = new BridgePromptLibraryStorage({ dataRoot: DATA_ROOT });
const imageTypePresetCatalogStorage = new BridgeImageTypePresetCatalogStorage({
  dataRoot: DATA_ROOT,
});
const userLibrariesStorage = new BridgeUserLibrariesStorage({ dataRoot: DATA_ROOT });
const browserStorage = new BridgeBrowserStorage({ dataRoot: DATA_ROOT });
const MODEL_CATALOG_FILE = join(DATA_ROOT, 'model-catalog.json');
const COMFYUI_LIBRARY_ROOT = join(DATA_ROOT, 'comfyui');
const COMFYUI_WORKFLOW_FILE = join(COMFYUI_LIBRARY_ROOT, 'workflows.json');
const DEFAULT_COMFYUI_BASE_URL =
  String(
    process.env.QIANSI_CANVAS_COMFYUI_URL ||
      process.env.KITTY_CANVAS_COMFYUI_URL ||
      'http://127.0.0.1:8188',
  ).trim() || 'http://127.0.0.1:8188';
function normalizedTrustedLocalProviderOrigin(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return '';
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    classifyProviderAddressLiteral(url.hostname) !== 'loopback' ||
    url.username ||
    url.password
  ) {
    return '';
  }
  return url.origin;
}
const trustedLocalProviderOrigins = new Set(
  [normalizedTrustedLocalProviderOrigin(DEFAULT_COMFYUI_BASE_URL)].filter(Boolean),
);
const MAX_COMFYUI_WORKFLOW_BODY = 6 * 1024 * 1024;
const MAX_COMFYUI_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_COMFYUI_AUDIO_BYTES = 256 * 1024 * 1024;
const MAX_COMFYUI_3D_BYTES = 1024 * 1024 * 1024;
const COMFYUI_VIDEO_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const PROJECT_FOLDER_ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const PROJECT_REQUEST_ID_RE = /^[A-Za-z0-9_-]{6,120}$/;
const PRIMARY_CANVAS_NAME = '画布';
const PRIMARY_CANVAS_WORKSPACE = 'views';
const PRIMARY_CANVAS_TAB = Object.freeze({
  id: 'tab-main-canvas',
  name: '画板 1',
  workspace: PRIMARY_CANVAS_WORKSPACE,
});
const animeLibraryRootFromEnvironment = String(
  process.env.QIANSI_CANVAS_ANIME_LIBRARY ||
    process.env.KITTY_CANVAS_ANIME_LIBRARY ||
    process.env.MULIU_ANIME_LIBRARY ||
    '',
).trim();
let animeLibraryRoot = animeLibraryRootFromEnvironment;
const communityServerUrlFromEnvironment = String(
  process.env.QIANSI_CANVAS_COMMUNITY_URL || process.env.KITTY_CANVAS_COMMUNITY_URL || '',
).trim();
let communityServerUrl = communityServerUrlFromEnvironment
  ? normalizeCommunityServerUrl(communityServerUrlFromEnvironment)
  : '';
let lightX2VConfig = normalizePersistedLightX2VConfig({});
const LOCAL_FFMPEG_PATH = join(
  PROJECT_ROOT,
  'tools',
  platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);
const LOCAL_FFPROBE_PATH = join(
  PROJECT_ROOT,
  'tools',
  platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe',
);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.webm', '.m4v']);
const ASSET_MIME_EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ...AUDIO_ASSET_MIME_EXTENSIONS,
]);
let assetLibraryWriteQueue = Promise.resolve();
let styleLibraryWriteQueue = Promise.resolve();
let projectLibraryWriteQueue = Promise.resolve();
let modelCatalogWriteQueue = Promise.resolve();
let comfyWorkflowWriteQueue = Promise.resolve();
const STORAGE_CLEANUP_PLAN_TTL_MS = 10 * 60 * 1000;
const storageCleanupPlans = new Map();

function storageCleanupLiveReferences(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').slice(0, 400)).filter(Boolean))].slice(
    0,
    10_000,
  );
}

function purgeExpiredStorageCleanupPlans(now = Date.now()) {
  for (const [id, plan] of storageCleanupPlans) {
    if (now - plan.createdAt > STORAGE_CLEANUP_PLAN_TTL_MS) storageCleanupPlans.delete(id);
  }
}
const projectArchiveTombstones = new Set();
let codexStatusValue = null;
let codexStatusPromise = null;
let codexStatusExpiresAt = 0;
let volcengineStatusValue = null;
let volcengineStatusPromise = null;
let volcengineStatusExpiresAt = 0;
let codebuddyStatusValue = null;
let codebuddyStatusPromise = null;
let codebuddyStatusExpiresAt = 0;
let bailianStatusValue = null;
let bailianStatusPromise = null;
let bailianStatusExpiresAt = 0;
let geminiStatusValue = null;
let geminiStatusPromise = null;
let geminiStatusExpiresAt = 0;
let jimengStatusValue = null;
let jimengStatusPromise = null;
let jimengStatusExpiresAt = 0;
let bridgeSettingsWriteQueue = Promise.resolve();
const timelineRenderJobs = new Map();
const timelineRenderProcesses = new Map();
let timelineRenderStarting = false;
const MAX_TIMELINE_RENDER_CONCURRENCY = 1;
const MAX_TIMELINE_CLIPS = 30;
const MAX_TIMELINE_DURATION_SECONDS = 10 * 60;
const MAX_TIMELINE_RENDER_TIMEOUT_MS = 20 * 60 * 1000;
const jimengLoginSession = {
  child: null,
  stdout: '',
  stderr: '',
  startedAt: 0,
  fallbackTried: false,
  exitCode: null,
};

async function loadBridgeSettings() {
  try {
    const parsed = JSON.parse(await readFile(BRIDGE_SETTINGS_FILE, 'utf8'));
    if (!animeLibraryRootFromEnvironment && typeof parsed?.animeLibraryRoot === 'string') {
      animeLibraryRoot = parsed.animeLibraryRoot.trim();
    }
    if (
      !communityServerUrlFromEnvironment &&
      typeof parsed?.communityServerUrl === 'string' &&
      parsed.communityServerUrl.trim()
    ) {
      communityServerUrl = normalizeCommunityServerUrl(parsed.communityServerUrl);
    }
    lightX2VConfig = normalizePersistedLightX2VConfig(parsed?.lightX2VConfig);
    for (const value of Array.isArray(parsed?.trustedLocalProviderOrigins)
      ? parsed.trustedLocalProviderOrigins.slice(0, 32)
      : []) {
      const origin = normalizedTrustedLocalProviderOrigin(value);
      if (origin) trustedLocalProviderOrigins.add(origin);
    }
  } catch {
    /* The first run has no settings file. */
  }
}

function saveBridgeSettings() {
  const operation = bridgeSettingsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(BRIDGE_SETTINGS_FILE), { recursive: true });
      const temporaryPath = `${BRIDGE_SETTINGS_FILE}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(
          temporaryPath,
          JSON.stringify(
            {
              version: 4,
              animeLibraryRoot,
              communityServerUrl,
              lightX2VConfig,
              trustedLocalProviderOrigins: [...trustedLocalProviderOrigins].sort(),
              updatedAt: Date.now(),
            },
            null,
            2,
          ),
          'utf8',
        );
        await rename(temporaryPath, BRIDGE_SETTINGS_FILE);
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    });
  bridgeSettingsWriteQueue = operation;
  return operation;
}

function modelCatalogText(value, maxLength) {
  return typeof value === 'string'
    ? [...value.normalize('NFKC')]
        .filter((character) => {
          const code = character.codePointAt(0) || 0;
          return (
            code >= 32 &&
            code !== 127 &&
            !(code >= 0x200b && code <= 0x200f) &&
            !(code >= 0x202a && code <= 0x202e) &&
            !(code >= 0x2066 && code <= 0x2069)
          );
        })
        .join('')
        .trim()
        .slice(0, maxLength)
    : '';
}

function modelCatalogTimestamp(value) {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= Date.now() + 5 * 60_000
    ? timestamp
    : 0;
}

function normalizeCatalogModels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const models = [];
  for (const raw of value.slice(0, 512)) {
    if (!raw || typeof raw !== 'object') continue;
    const id = modelCatalogText(raw.id, 240);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      displayName: modelCatalogText(raw.displayName, 160) || id,
      recommended: raw.recommended === true,
    });
  }
  return models;
}

function normalizeModelCatalog(value) {
  if (!value || typeof value !== 'object' || Number(value.version) !== 1) {
    return { version: 1, updatedAt: 0, providers: [] };
  }
  const seen = new Set();
  const providers = [];
  for (const raw of (Array.isArray(value.providers) ? value.providers : []).slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const providerId = modelCatalogText(raw.providerId, 80);
    const providerName = modelCatalogText(raw.providerName, 120);
    const protocol = modelCatalogText(raw.protocol, 40);
    const rawModels = raw.models && typeof raw.models === 'object' ? raw.models : {};
    const models = {
      chat: normalizeCatalogModels(rawModels.chat),
      image: normalizeCatalogModels(rawModels.image),
      video: normalizeCatalogModels(rawModels.video),
    };
    if (
      !providerId ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(providerId) ||
      !providerName ||
      !protocol ||
      seen.has(providerId) ||
      Object.values(models).every((items) => items.length === 0)
    ) {
      continue;
    }
    seen.add(providerId);
    providers.push({
      providerId,
      providerName,
      protocol,
      state: raw.state === 'ready' ? 'ready' : 'stale',
      discoveredAt: modelCatalogTimestamp(raw.discoveredAt),
      models,
    });
  }
  return {
    version: 1,
    updatedAt: modelCatalogTimestamp(value.updatedAt),
    providers,
  };
}

async function readModelCatalog() {
  try {
    return normalizeModelCatalog(JSON.parse(await readFile(MODEL_CATALOG_FILE, 'utf8')));
  } catch {
    return { version: 1, updatedAt: 0, providers: [] };
  }
}

async function writeModelCatalog(value) {
  const catalog = normalizeModelCatalog(value);
  const current = await readModelCatalog();
  if (JSON.stringify(catalog.providers) === JSON.stringify(current.providers)) return current;
  // `updatedAt` is a server-controlled monotonic revision. Client clocks may
  // be wrong or malicious, so an untrusted future timestamp can never lock
  // the catalog against later writes.
  catalog.updatedAt = Math.max(Date.now(), current.updatedAt + 1, catalog.updatedAt);
  await mkdir(dirname(MODEL_CATALOG_FILE), { recursive: true });
  const temporaryPath = `${MODEL_CATALOG_FILE}.${process.pid}.${randomUUID()}.tmp`;
  let file = null;
  try {
    file = await open(temporaryPath, 'wx');
    await file.writeFile(JSON.stringify(catalog, null, 2), 'utf8');
    await file.sync();
    await file.close();
    file = null;
    await rename(temporaryPath, MODEL_CATALOG_FILE);
    return catalog;
  } finally {
    if (file) await file.close().catch(() => null);
    await unlink(temporaryPath).catch(() => null);
  }
}

function queueModelCatalogWrite(value) {
  const operation = modelCatalogWriteQueue.catch(() => null).then(() => writeModelCatalog(value));
  modelCatalogWriteQueue = operation.catch(() => null);
  return operation;
}

async function readComfyWorkflowLibrary() {
  try {
    const parsed = JSON.parse(await readFile(COMFYUI_WORKFLOW_FILE, 'utf8'));
    const items = dedupeComfyWorkflowPresets(
      (Array.isArray(parsed?.items) ? parsed.items : [])
        .slice(0, 64)
        .map(normalizeStoredComfyWorkflow)
        .filter(Boolean),
    );
    return { version: 1, items, updatedAt: Number(parsed?.updatedAt || 0) };
  } catch {
    return { version: 1, items: [], updatedAt: 0 };
  }
}

async function writeComfyWorkflowLibrary(library) {
  const normalized = {
    version: 1,
    items: dedupeComfyWorkflowPresets(
      (Array.isArray(library?.items) ? library.items : [])
        .slice(0, 64)
        .map(normalizeStoredComfyWorkflow)
        .filter(Boolean),
    ),
    updatedAt: Date.now(),
  };
  await mkdir(COMFYUI_LIBRARY_ROOT, { recursive: true });
  const temporaryPath = `${COMFYUI_WORKFLOW_FILE}.${process.pid}.${randomUUID()}.tmp`;
  let file = null;
  try {
    file = await open(temporaryPath, 'wx');
    await file.writeFile(JSON.stringify(normalized, null, 2), 'utf8');
    await file.sync();
    await file.close();
    file = null;
    await rename(temporaryPath, COMFYUI_WORKFLOW_FILE);
    return normalized;
  } finally {
    if (file) await file.close().catch(() => null);
    await unlink(temporaryPath).catch(() => null);
  }
}

function mutateComfyWorkflowLibrary(mutator) {
  const operation = comfyWorkflowWriteQueue
    .catch(() => null)
    .then(async () => {
      const library = await readComfyWorkflowLibrary();
      const result = await mutator(library);
      await writeComfyWorkflowLibrary(library);
      return result;
    });
  comfyWorkflowWriteQueue = operation.catch(() => null);
  return operation;
}

function comfyWorkflowIdFromPath(pathname) {
  const match = /^\/api\/comfyui\/workflows\/(comfy_[A-Za-z0-9_-]{8,80})$/.exec(pathname);
  return match?.[1] || '';
}

function comfyWorkflowSummaries(library, connectionId = 'comfyui-local', objectInfo = null) {
  return library.items
    .filter((item) => (item.connectionId || 'comfyui-local') === connectionId)
    .map((item) => publicComfyWorkflow(item, inspectComfyWorkflowCompatibility(item, objectInfo)));
}

function publicComfyCapabilityStatus(status) {
  return {
    featuresAvailable: Boolean(status.features),
    objectInfoAvailable: Boolean(status.objectInfo),
    warnings: Array.isArray(status.capabilityWarnings) ? status.capabilityWarnings.slice(0, 8) : [],
  };
}

async function refreshComfyWorkflowLibrary(library, connectionId, status) {
  const hasChange = library.items.some((item) => {
    if ((item.connectionId || 'comfyui-local') !== connectionId) return false;
    return refreshComfyWorkflowValidation(item, status) !== item;
  });
  if (!hasChange) return library;
  return mutateComfyWorkflowLibrary((current) => {
    current.items = current.items.map((item) =>
      (item.connectionId || 'comfyui-local') === connectionId
        ? refreshComfyWorkflowValidation(item, status)
        : item,
    );
    return current;
  });
}

async function assertComfyWorkflowCompatible(preset, connection) {
  const status = await inspectLocalComfy(connection.baseUrl, {
    timeoutMs: 10_000,
    ...connection.options,
  });
  const compatibility = inspectComfyWorkflowCompatibility(preset, status.objectInfo);
  if (compatibility.status === 'incompatible') {
    const details = [
      compatibility.missingNodeClasses.length
        ? `缺少节点：${compatibility.missingNodeClasses.slice(0, 5).join('、')}`
        : '',
      compatibility.missingModels.length
        ? `缺少模型：${compatibility.missingModels
            .slice(0, 5)
            .map((item) => item.value)
            .join('、')}`
        : '',
      compatibility.missingInputs.length || compatibility.unknownInputs.length
        ? '节点输入名称已变化'
        : '',
      compatibility.typeMismatches.length ? '节点输入类型已变化' : '',
    ]
      .filter(Boolean)
      .join('；');
    throw new Error(
      `${preset.name} 与当前 ComfyUI 不兼容，需要重新导入或迁移。${details ? ` ${details}。` : ''}`,
    );
  }
  return compatibility;
}

function comfyConnection(body = {}) {
  const connectionId = String(body.providerId || body.connectionId || 'comfyui-local').trim();
  if (!isComfyConnectionId(connectionId)) throw new Error('ComfyUI 连接类型无效。');
  if (connectionId === 'comfyui-local') {
    return {
      connectionId,
      baseUrl: normalizeLocalComfyBaseUrl(DEFAULT_COMFYUI_BASE_URL),
      options: {},
    };
  }
  if (isCloudComfyConnectionId(connectionId)) {
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) throw new Error('Comfy Cloud 连接需要 API Key。');
    const requested = new URL(safeProviderBaseUrl(body.baseUrl || 'https://cloud.comfy.org'));
    if (requested.protocol !== 'https:' || requested.hostname !== 'cloud.comfy.org') {
      throw new Error('Comfy Cloud 只允许官方地址 https://cloud.comfy.org。');
    }
    return {
      connectionId,
      baseUrl: 'https://cloud.comfy.org/api',
      options: {
        allowRemote: true,
        cloud: true,
        apiKey,
        headers: { 'X-API-Key': apiKey },
      },
    };
  }
  const baseUrl = safeProviderBaseUrl(body.baseUrl);
  const headers = authHeaders({
    apiKey: String(body.apiKey || '').trim(),
    authType: String(body.authType || 'bearer'),
  });
  delete headers['Content-Type'];
  return { connectionId, baseUrl, options: { allowRemote: true, headers } };
}

const bridgeSettingsReady = loadBridgeSettings();

function currentLanPairingUrls() {
  if (!LAN_MODE) return [];
  const hosts =
    HOST === '0.0.0.0' || HOST === '::'
      ? [...new Set(NETWORK_ADDRESSES)].filter((value) => value && value !== '127.0.0.1')
      : [HOST];
  return hosts.map((address) => {
    const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
    const url = new URL(`http://${host}:${LAN_CANVAS_PORT}/`);
    if (!TRUSTED_LAN_MODE) url.searchParams.set(BRIDGE_PAIR_QUERY, BRIDGE_ACCESS_TOKEN);
    return url.toString();
  });
}

async function persistLanPairingAddresses(urls) {
  await atomicWriteJson(
    LAN_PAIRING_FILE,
    {
      version: 1,
      generatedAt: Date.now(),
      active: LAN_MODE,
      mode: !LAN_MODE ? 'local' : TRUSTED_LAN_MODE ? 'trusted' : 'paired',
      port: LAN_CANVAS_PORT,
      bridgePort: PORT,
      urls,
      warning: TRUSTED_LAN_MODE
        ? '可信局域网直连已启用；同一局域网内可直接打开上述地址。'
        : LAN_MODE
          ? '此文件包含当前局域网配对凭据，请勿公开分享；Bridge 重启后以新文件为准。'
          : '局域网访问当前未启用。',
    },
    { maxBytes: 64 * 1024 },
  );
}

function cors(request) {
  const origin = String(request.headers.origin || '');
  const requestHost = String(request.headers.host || '');
  return {
    ...(origin && bridgeOriginPolicy.allows(origin, request.method, requestHost)
      ? { 'Access-Control-Allow-Origin': origin }
      : {}),
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Qiansi-Canvas-Access-Token, X-Qiansi-Canvas-File-Name, X-Qiansi-Canvas-Project, X-Qiansi-Canvas-Kind, X-Qiansi-Canvas-Title, X-Qiansi-Canvas-Description, X-Qiansi-Motion-File-Name, X-Kitty-Canvas-File-Name, X-Kitty-Canvas-Project, X-Kitty-Canvas-Kind, X-Kitty-Canvas-Title, X-Kitty-Canvas-Description',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...(origin ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Expose-Headers':
      'Content-Disposition, X-Qiansi-Audio-File-Name, X-Qiansi-Audio-Duration-Seconds',
    Vary: 'Origin',
    ...bridgeSecurityHeaders(),
  };
}

function requestOriginAllowed(request) {
  const origin = String(request.headers.origin || '');
  const method = String(request.method || '').toUpperCase();
  const pathname = new URL(request.url || '/', `http://${HOST}:${PORT}`).pathname;
  const fetchSite = String(request.headers['sec-fetch-site'] || '').toLowerCase();
  const referer = String(request.headers.referer || '').trim();
  if (TRUSTED_LAN_MODE && isLanCollaborationRequest(pathname, method)) {
    if (fetchSite && fetchSite !== 'same-origin') return false;
    if (origin && !bridgeOriginPolicy.allows(origin, request.method, request.headers.host)) {
      return false;
    }
    if (referer) {
      try {
        if (
          !bridgeOriginPolicy.allows(new URL(referer).origin, request.method, request.headers.host)
        ) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  }
  if (origin) return bridgeOriginPolicy.allows(origin, request.method, request.headers.host);
  // Some iOS browsers omit Origin and Fetch Metadata even for same-origin
  // reads. Permit only a narrow, paired, originless read fallback. Mutations
  // still require a positive same-origin browser signal, and explicit source
  // signals never fall back to the cookie because cookies do not isolate ports.
  const fetchMode = String(request.headers['sec-fetch-mode'] || '').toLowerCase();
  const fetchDest = String(request.headers['sec-fetch-dest'] || '').toLowerCase();
  if (
    LAN_MODE &&
    (method === 'GET' || method === 'HEAD') &&
    !fetchSite &&
    !referer &&
    fetchMode !== 'navigate' &&
    fetchMode !== 'no-cors' &&
    !fetchDest &&
    bridgeOriginPolicy.allows(
      `http://${String(request.headers.host || '')}`,
      method,
      request.headers.host,
    ) &&
    bridgeTokenMatches(BRIDGE_ACCESS_TOKEN, requestBridgeAccessToken(request)) &&
    isLanCollaborationRequest(
      new URL(request.url || '/', `http://${HOST}:${PORT}`).pathname,
      method,
    )
  ) {
    return true;
  }
  if (!['GET', 'HEAD'].includes(method)) return false;
  // Browsers commonly omit Origin on same-origin GET/media requests. Fetch
  // Metadata is not forgeable by page script and prevents another localhost
  // port from turning the browser into a privileged bridge client.
  if (fetchSite === 'same-origin') return true;
  if (referer) {
    try {
      return bridgeOriginPolicy.allows(
        new URL(referer).origin,
        request.method,
        request.headers.host,
      );
    } catch {
      return false;
    }
  }
  return false;
}

function requestIsLoopback(request) {
  return isLoopbackAddress(request?.socket?.remoteAddress);
}

function pairingRedirectTarget(request, url) {
  const clean = new URL(url.pathname + url.search, `http://${HOST}:${PORT}`);
  clean.searchParams.delete(BRIDGE_PAIR_QUERY);
  const bridgeRelativeTarget = `${clean.pathname}${clean.search}` || '/';
  if (!PAIR_RETURN_PORT) return bridgeRelativeTarget;
  try {
    const requestOrigin = new URL(`http://${String(request.headers.host || '')}`);
    requestOrigin.port = String(PAIR_RETURN_PORT);
    requestOrigin.pathname = '/';
    requestOrigin.search = '';
    requestOrigin.hash = '';
    if (!bridgeOriginPolicy.allows(requestOrigin.origin, 'GET', request.headers.host)) {
      return bridgeRelativeTarget;
    }
    return requestOrigin.toString();
  } catch {
    return bridgeRelativeTarget;
  }
}

function handleLanPairing(request, response, url) {
  if (!LAN_MODE || request.method !== 'GET' || url.pathname !== '/') return false;
  const candidate = String(url.searchParams.get(BRIDGE_PAIR_QUERY) || '');
  if (!candidate) return false;
  if (TRUSTED_LAN_MODE) {
    response.writeHead(303, {
      Location: pairingRedirectTarget(request, url),
      'Cache-Control': 'no-store',
      ...bridgeSecurityHeaders({ mime: 'text/html' }),
    });
    response.end();
    return true;
  }
  if (!bridgeTokenMatches(BRIDGE_ACCESS_TOKEN, candidate)) {
    response.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      ...bridgeSecurityHeaders({ mime: 'text/plain' }),
    });
    response.end('配对令牌无效或已经被替换，请从宿主终端复制最新地址。');
    return true;
  }
  response.writeHead(303, {
    Location: pairingRedirectTarget(request, url),
    'Set-Cookie': bridgeAccessCookie(BRIDGE_ACCESS_TOKEN),
    'Cache-Control': 'no-store',
    ...bridgeSecurityHeaders({ mime: 'text/html' }),
  });
  response.end();
  return true;
}

function remoteLanRequestAuthorized(request, url) {
  const proxiedScope = String(request.headers['x-qiansi-canvas-proxy-scope'] || '').toLowerCase();
  if (!LAN_MODE) return { ok: true, scope: 'host' };
  if (requestIsLoopback(request) && proxiedScope !== 'collaboration') {
    return { ok: true, scope: 'host' };
  }
  if (requestIsLoopback(request) && proxiedScope === 'collaboration') {
    if (!isLanCollaborationRequest(url.pathname, request.method)) {
      return {
        ok: false,
        status: 403,
        message: '局域网终端仅允许访问画布协作与受管媒体。',
      };
    }
    return { ok: true, scope: 'collaboration' };
  }
  if (TRUSTED_LAN_MODE) {
    if (!isLanCollaborationRequest(url.pathname, request.method)) {
      return {
        ok: false,
        status: 403,
        message: '局域网终端仅允许访问画布协作与受管媒体。',
      };
    }
    return { ok: true, scope: 'collaboration' };
  }
  if (!bridgeTokenMatches(BRIDGE_ACCESS_TOKEN, requestBridgeAccessToken(request))) {
    return {
      ok: false,
      status: 401,
      message:
        '局域网终端尚未配对或访问令牌已失效。请在宿主终端打开最新的“局域网配对”地址；配对成功后会自动返回画布。',
    };
  }
  if (!isLanCollaborationRequest(url.pathname, request.method)) {
    return {
      ok: false,
      status: 403,
      message:
        '局域网终端仅允许访问项目协作与受管媒体；AI、CLI、插件、更新和宿主维护能力仅限本机。',
    };
  }
  return { ok: true, scope: 'collaboration' };
}

function acquireBridgeRequest(request, url) {
  return bridgeRequestGate.acquire({
    address: request?.socket?.remoteAddress,
    pathname: url.pathname,
  });
}

function publicBridgeUrl(request, value) {
  const source = String(value || '').trim();
  if (/^https?:\/\//i.test(source)) return source;
  const origin = String(request.headers.origin || '').trim();
  if (origin && bridgeOriginPolicy.allows(origin, request.method, request.headers.host)) {
    return new URL(source, `${new URL(origin).origin}/`).toString();
  }
  const requestHost = String(request.headers.host || '').trim();
  try {
    const candidate = new URL(`http://${requestHost}`);
    if (isLocalBridgeUrl(candidate)) return new URL(source, `${candidate.origin}/`).toString();
  } catch {
    /* fall back to loopback below */
  }
  return new URL(source, `http://127.0.0.1:${PORT}/`).toString();
}

function send(response, status, payload, request) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...cors(request),
  });
  response.end(JSON.stringify(payload));
}

function readBody(request, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(new Error('请求内容过大。'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('请求不是有效 JSON。'));
      }
    });
    request.on('error', reject);
  });
}

function readBinaryBody(request, maxBytes) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        fail(new ManagedMotionWorkerError('AI 动作视频不能超过 256 MB。', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolvePromise(Buffer.concat(chunks, size));
    });
    request.on('error', fail);
  });
}

function cleanHeaderText(request, name, fallback = '', maxLength = 180) {
  const raw = Array.isArray(request.headers[name])
    ? request.headers[name][0]
    : request.headers[name];
  if (!raw) return fallback;
  try {
    return cleanAssetText(decodeURIComponent(String(raw)), fallback, maxLength);
  } catch {
    return cleanAssetText(String(raw), fallback, maxLength);
  }
}

function cleanCompatibleHeaderText(
  request,
  currentName,
  legacyName,
  fallback = '',
  maxLength = 180,
) {
  return request.headers[currentName]
    ? cleanHeaderText(request, currentName, fallback, maxLength)
    : cleanHeaderText(request, legacyName, fallback, maxLength);
}

async function streamFileResponse(
  request,
  response,
  filePath,
  mime = 'application/octet-stream',
  fileName = '',
  cacheControl = 'private, max-age=3600',
) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error('文件不存在。');
  const size = fileStat.size;
  const range = String(request.headers.range || '');
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
    ...(fileName
      ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` }
      : {}),
    ...cors(request),
    ...bridgeSecurityHeaders({ mime, svg: mime === 'image/svg+xml' }),
  };
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(filePath).pipe(response);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
    response.end();
    return;
  }
  const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
  const start = suffixLength ? Math.max(0, size - suffixLength) : Number(match[1] || 0);
  const requestedEnd = suffixLength ? size - 1 : Number(match[2] || size - 1);
  const end = Math.min(size - 1, requestedEnd);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
    response.end();
    return;
  }
  response.writeHead(206, {
    ...headers,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`,
  });
  createReadStream(filePath, { start, end }).pipe(response);
}

const mediaPreviewJobs = new Map();

function requestedPreviewWidth(url, fallback) {
  const requested = Number(url.searchParams.get('w'));
  return Number.isFinite(requested)
    ? Math.max(256, Math.min(1280, Math.round(requested)))
    : fallback;
}

async function ensureMediaPreview(sourcePath, mime, width) {
  if (
    !existsSync(LOCAL_FFMPEG_PATH) ||
    (!mime.startsWith('image/') && !mime.startsWith('video/'))
  ) {
    return null;
  }
  const sourceStat = await stat(sourcePath);
  const cacheKey = createHash('sha256')
    .update(`${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${width}\0${mime}`)
    .digest('hex')
    .slice(0, 32);
  const previewPath = join(MEDIA_PREVIEW_ROOT, `${cacheKey}.webp`);
  if (existsSync(previewPath)) return previewPath;
  const legacyPreviewPath = join(LEGACY_MEDIA_PREVIEW_ROOT, `${cacheKey}.webp`);
  if (MEDIA_PREVIEW_ROOT !== LEGACY_MEDIA_PREVIEW_ROOT && existsSync(legacyPreviewPath)) {
    return legacyPreviewPath;
  }
  const existing = mediaPreviewJobs.get(cacheKey);
  if (existing) return existing;
  const job = (async () => {
    await mkdir(MEDIA_PREVIEW_ROOT, { recursive: true });
    const temporaryPath = `${previewPath}.${randomUUID()}.tmp.webp`;
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      ...(mime.startsWith('video/') ? ['-ss', '0'] : []),
      '-i',
      sourcePath,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-vf',
      `scale=${width}:-2:force_original_aspect_ratio=decrease`,
      '-c:v',
      'libwebp',
      '-quality',
      '76',
      '-y',
      temporaryPath,
    ];
    try {
      const result = await execute(LOCAL_FFMPEG_PATH, args, '', 120000, { maxOutput: 100000 });
      if (result.code !== 0) throw new Error(result.stderr || '预览图生成失败。');
      const created = await stat(temporaryPath);
      if (!created.isFile() || created.size === 0) throw new Error('预览图为空。');
      await fsyncFile(temporaryPath);
      await rename(temporaryPath, previewPath);
      await fsyncDirectory(MEDIA_PREVIEW_ROOT);
      return previewPath;
    } catch {
      await unlink(temporaryPath).catch(() => undefined);
      return null;
    }
  })().finally(() => mediaPreviewJobs.delete(cacheKey));
  mediaPreviewJobs.set(cacheKey, job);
  return job;
}

async function streamMediaOrPreview(request, response, url, sourcePath, mime, fileName = '') {
  const requestedDownloadName = cleanAssetText(url.searchParams.get('download'), '', 180)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[. ]+$/g, '');
  const previewMode = url.searchParams.get('preview');
  if (previewMode === 'image' || previewMode === 'poster') {
    const previewPath = await ensureMediaPreview(
      sourcePath,
      mime,
      requestedPreviewWidth(url, previewMode === 'poster' ? 960 : 768),
    );
    if (previewPath) {
      await streamFileResponse(
        request,
        response,
        previewPath,
        'image/webp',
        '',
        'private, max-age=31536000, immutable',
      );
      return;
    }
  }
  await streamFileResponse(request, response, sourcePath, mime, requestedDownloadName || fileName);
}

const NOTIFICATION_SOUND_EXTENSIONS = new Map([
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
]);

function notificationToneWav(frequency) {
  const sampleRate = 22050;
  const durationSeconds = 0.42;
  const samples = Math.floor(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time / 0.018) * Math.max(0, 1 - time / durationSeconds);
    const sample = Math.round(Math.sin(Math.PI * 2 * frequency * time) * envelope * 0.28 * 32767);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

async function ensureNotificationSoundLibrary() {
  await mkdir(NOTIFICATION_SOUND_ROOT, { recursive: true });
  const defaults = [
    ['image-complete.wav', 784],
    ['video-complete.wav', 587],
    ['audio-complete.wav', 988],
    ['text-complete.wav', 698],
  ];
  await Promise.all(
    defaults.map(async ([name, frequency]) => {
      const filePath = join(NOTIFICATION_SOUND_ROOT, name);
      if (!existsSync(filePath)) await writeFile(filePath, notificationToneWav(frequency));
    }),
  );
}

async function notificationSoundCatalog() {
  await ensureNotificationSoundLibrary();
  const entries = await readdir(NOTIFICATION_SOUND_ROOT, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.length <= 180 &&
          NOTIFICATION_SOUND_EXTENSIONS.has(extname(entry.name).toLowerCase()),
      )
      .slice(0, 100)
      .map(async (entry) => {
        const fileStat = await stat(join(NOTIFICATION_SOUND_ROOT, entry.name));
        return { name: entry.name, size: fileStat.size, modifiedAt: fileStat.mtimeMs };
      }),
  );
  items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  return { directory: NOTIFICATION_SOUND_ROOT, items };
}

async function serveCanvasWeb(request, response, url) {
  if (request.method !== 'GET') return false;
  const requestedPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  if (!requestedPath || requestedPath.includes('\\')) return false;
  const filePath = resolve(WEB_ROOT, requestedPath);
  const relativePath = relative(WEB_ROOT, filePath);
  if (
    relativePath.startsWith('..') ||
    resolve(WEB_ROOT, relativePath) !== filePath ||
    !existsSync(filePath)
  )
    return false;
  try {
    await streamFileResponse(
      request,
      response,
      filePath,
      canvasWebMime(filePath),
      '',
      requestedPath === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    );
    return true;
  } catch {
    return false;
  }
}

function findWith(command) {
  return new Promise((resolve) => {
    const finder = platform() === 'win32' ? 'where.exe' : 'which';
    const child = spawn(finder, [command], { windowsHide: true, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', () => resolve([]));
    child.on('close', (code) =>
      resolve(
        code === 0
          ? output
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      ),
    );
  });
}

function projectRuntimeCommandCandidates(command) {
  const runtimeDirectories = [dirname(process.execPath)];
  if (platform() === 'win32') {
    runtimeDirectories.push(join(PROJECT_ROOT, 'tools', 'runtime', 'node', 'windows'));
  } else if (platform() === 'darwin') {
    runtimeDirectories.push(join(PROJECT_ROOT, 'tools', 'runtime', 'node', 'macos', 'bin'));
  }
  const filename = platform() === 'win32' ? `${command}.cmd` : command;
  return Array.from(new Set(runtimeDirectories)).map((directory) => join(directory, filename));
}

async function locate(command) {
  // The one-click installer intentionally uses the Node/npm runtime bundled
  // with Qiansi-Canvas. npm therefore places global CLI shims beside that
  // runtime, which is not necessarily part of the parent process's PATH.
  const projectRuntimeCommand = projectRuntimeCommandCandidates(command).find((candidate) =>
    existsSync(candidate),
  );
  if (projectRuntimeCommand) return projectRuntimeCommand;

  if (platform() === 'win32') {
    const npmShim = process.env.APPDATA ? join(process.env.APPDATA, 'npm', `${command}.cmd`) : '';
    if (npmShim && existsSync(npmShim)) return npmShim;
    const candidates = [
      ...(await findWith(`${command}.cmd`)),
      ...(await findWith(`${command}.exe`)),
      ...(await findWith(command)),
    ];
    return (
      candidates.find((item) => /\.(?:cmd|exe|bat|com)$/i.test(item) && existsSync(item)) || ''
    );
  }
  return (await findWith(command))[0] || '';
}

async function antigravityPath() {
  const home = homedir();
  const directCandidates =
    platform() === 'win32'
      ? [
          process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : '',
          join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
          join(home, '.agy', 'bin', 'agy.exe'),
        ]
      : [join(home, '.local', 'bin', 'agy'), join(home, '.agy', 'bin', 'agy')];
  const direct = directCandidates.find((candidate) => candidate && existsSync(candidate));
  return direct || (await locate('agy'));
}

function commandSpec(commandPath, directArgs) {
  const isCommandScript = platform() === 'win32' && /\.(cmd|bat)$/i.test(commandPath);
  return isCommandScript
    ? {
        executable: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', commandPath, ...directArgs],
      }
    : { executable: commandPath, args: directArgs };
}

function execute(commandPath, directArgs, input = '', timeoutMs = 30000, options = {}) {
  const { executable, args } = commandSpec(commandPath, directArgs);
  const outputLimit = Number(options.maxOutput || MAX_OUTPUT);
  const childEnv = { ...process.env, NO_COLOR: '1', CI: '1' };
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      shell: false,
      detached: platform() !== 'win32',
      env: { ...childEnv, ...(options.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    let outputExceeded = false;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timer = setTimeout(() => {
      terminateChildProcessTree(child);
      fail(new Error('CLI 检测超时，进程树已终止。'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (outputExceeded) return;
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > outputLimit) {
        outputExceeded = true;
        terminateChildProcessTree(child);
      }
    });
    child.stderr.on('data', (chunk) => {
      if (outputExceeded) return;
      stderr += String(chunk);
      if (Buffer.byteLength(stderr) > outputLimit) {
        outputExceeded = true;
        terminateChildProcessTree(child);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (outputExceeded) return fail(new Error('CLI 输出过大，进程树已停止。'));
      settled = true;
      resolve({ code: Number(code ?? 1), stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

async function readCodexStatus() {
  const commandPath = await locate('codex');
  if (!commandPath)
    return {
      installed: false,
      runnable: false,
      running: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      imageGeneration: false,
      version: '',
      commandPath: '',
      models: [],
      message: '未找到 Codex CLI。',
    };
  try {
    const [version, login] = await Promise.all([
      execute(commandPath, ['--version']),
      execute(commandPath, ['login', 'status']),
    ]);
    const primary = inspectCodexPrimaryProbe({
      versionCode: version.code,
      loginCode: login.code,
    });
    if (!primary.shouldProbeCapabilities) {
      return {
        installed: true,
        runnable: primary.runnable,
        authenticated: false,
        ready: false,
        state: primary.runnable ? 'unauthenticated' : 'error',
        reasonCode: primary.runnable ? 'authentication_required' : 'version_failed',
        imageGeneration: false,
        version: version.stdout || version.stderr,
        commandPath,
        models: [],
        message: primary.runnable
          ? 'Codex CLI 尚未登录，请先运行 codex.cmd login。'
          : version.stderr || version.stdout || 'Codex CLI 无法运行。',
      };
    }
    const [features, modelCatalog] = await Promise.all([
      execute(commandPath, ['features', 'list'], '', 15000).catch(() => ({
        code: 1,
        stdout: '',
        stderr: '',
      })),
      execute(commandPath, ['debug', 'models'], '', 30000).catch(() => ({
        code: 1,
        stdout: '',
        stderr: '',
      })),
    ]);
    const imageGeneration =
      features.code === 0 && /^image_generation\s+\S+\s+true\s*$/m.test(features.stdout);
    const models = modelCatalog.code === 0 ? parseCodexModelCatalog(modelCatalog.stdout) : [];
    return {
      installed: true,
      runnable: primary.runnable,
      authenticated: primary.authenticated,
      ready: primary.ready,
      state: 'ready',
      reasonCode: '',
      imageGeneration,
      version: version.stdout || version.stderr,
      commandPath,
      models,
      message: login.stdout || login.stderr || 'Codex CLI 已登录。',
    };
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'probe_failed',
      imageGeneration: false,
      version: '',
      commandPath,
      models: [],
      message: error instanceof Error ? error.message : 'Codex CLI 检测失败。',
    };
  }
}

async function codexStatus(force = false) {
  const now = Date.now();
  if (!force && codexStatusValue && codexStatusExpiresAt > now) return codexStatusValue;
  if (!codexStatusPromise) {
    codexStatusPromise = readCodexStatus()
      .then((value) => {
        codexStatusValue = value;
        codexStatusExpiresAt = Date.now() + 30_000;
        return value;
      })
      .finally(() => {
        codexStatusPromise = null;
      });
  }
  return codexStatusPromise;
}

async function readVolcengineStatus() {
  const commandPath = await locate('arkcli');
  if (!commandPath) {
    return {
      installed: false,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      imageGeneration: false,
      videoGeneration: false,
      version: '',
      commandPath: '',
      models: [],
      message: '未找到山火 CLI（火山方舟官方 Ark CLI）。',
    };
  }

  // Only documented, fixed read-only arguments cross an npm .cmd shim. No
  // prompt, profile content, API key, resource name or arbitrary input is passed.
  const probeOptions = {
    env: {
      NO_COLOR: '1',
    },
  };
  try {
    const versionResult = await execute(
      commandPath,
      buildArkCliVersionArgs(),
      '',
      15_000,
      probeOptions,
    );
    const runnable = versionResult.code === 0;
    const version = versionResult.stdout;
    if (!runnable) {
      return {
        installed: true,
        runnable: false,
        authenticated: false,
        ready: false,
        state: 'error',
        reasonCode: 'version_failed',
        imageGeneration: false,
        imageEditing: false,
        videoGeneration: false,
        version,
        commandPath,
        models: [],
        message:
          arkCliSafeMessage(versionResult.stderr || versionResult.stdout) ||
          'arkcli 无法正常运行。',
      };
    }

    const authStatusResult = await execute(
      commandPath,
      buildArkCliAuthStatusArgs(),
      '',
      30_000,
      probeOptions,
    );
    const authStatus = inspectArkCliAuthStatus(authStatusResult);
    if (!authStatus.authenticated) {
      return {
        installed: true,
        runnable: true,
        authenticated: false,
        ready: false,
        state: authStatus.authenticationRequired ? 'unauthenticated' : 'error',
        reasonCode: authStatus.authenticationRequired
          ? 'authentication_required'
          : 'auth_status_failed',
        imageGeneration: false,
        imageEditing: false,
        videoGeneration: false,
        version,
        commandPath,
        models: [],
        message: authStatus.authenticationRequired
          ? '山火 CLI 已安装，但尚未登录。请运行 arkcli auth login volc-sso。'
          : arkCliSafeMessage(
              authStatus.message,
              'arkcli auth status 执行失败，请在终端运行该命令查看详情。',
            ),
      };
    }

    return {
      installed: true,
      runnable: true,
      authenticated: true,
      ready: true,
      state: 'ready',
      reasonCode: '',
      imageGeneration: false,
      imageEditing: false,
      videoGeneration: false,
      version,
      commandPath,
      models: [],
      message:
        '山火 CLI 已安装并通过火山方舟身份验证，可在终端使用 Ark CLI；画布生成适配器尚未启用。',
    };
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'probe_failed',
      imageGeneration: false,
      imageEditing: false,
      videoGeneration: false,
      version: '',
      commandPath,
      models: [],
      message: error instanceof Error ? arkCliSafeMessage(error.message) : '山火 CLI 检测失败。',
    };
  }
}

async function volcengineStatus(force = false) {
  const now = Date.now();
  if (!force && volcengineStatusValue && volcengineStatusExpiresAt > now)
    return volcengineStatusValue;
  if (!volcengineStatusPromise) {
    volcengineStatusPromise = readVolcengineStatus()
      .then((value) => {
        volcengineStatusValue = value;
        volcengineStatusExpiresAt = Date.now() + 30_000;
        return value;
      })
      .finally(() => {
        volcengineStatusPromise = null;
      });
  }
  return volcengineStatusPromise;
}

async function locateCodeBuddy() {
  return (await locate('codebuddy')) || (await locate('cbc'));
}

async function readCodeBuddyStatus() {
  const commandPath = await locateCodeBuddy();
  if (!commandPath) {
    return {
      installed: false,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      version: '',
      commandPath: '',
      models: [],
      message: '未找到 WorkBuddy CLI（codebuddy / cbc）。',
    };
  }
  try {
    const [versionResult, sessionsResult] = await Promise.all([
      execute(commandPath, ['--version'], '', 10000),
      execute(commandPath, ['ps', '--json'], '', 10000).catch(() => ({
        code: 1,
        stdout: '',
        stderr: '',
      })),
    ]);
    const version = versionResult.stdout || versionResult.stderr;
    const runnable = versionResult.code === 0;
    const activeSessions =
      runnable && sessionsResult.code === 0
        ? parseCodeBuddyActiveSessions(sessionsResult.stdout || sessionsResult.stderr)
        : [];
    const running = activeSessions.length > 0;
    if (!runnable || !running) {
      return {
        installed: true,
        runnable,
        running: false,
        authenticated: false,
        ready: false,
        state: runnable ? 'installed' : 'error',
        reasonCode: runnable ? 'software_not_running' : 'version_failed',
        version,
        commandPath,
        models: [],
        message: runnable
          ? 'WorkBuddy CLI 已安装，但当前没有运行中的 WorkBuddy 会话。请先打开 codebuddy，完成登录并保持会话运行。'
          : 'WorkBuddy CLI 已找到，但命令无法正常运行。',
      };
    }

    const [helpResult, configuredModelResult] = await Promise.all([
      execute(commandPath, ['--help'], '', 10000).catch(() => ({
        code: 1,
        stdout: '',
        stderr: '',
      })),
      execute(commandPath, ['config', 'get', 'model'], '', 10000).catch(() => ({
        code: 1,
        stdout: '',
        stderr: '',
      })),
    ]);
    const configuredModel =
      configuredModelResult.code === 0
        ? parseCodeBuddyConfiguredModel(configuredModelResult.stdout)
        : '';
    const helpOutput =
      helpResult.code === 0 ? `${helpResult.stdout || ''}\n${helpResult.stderr || ''}` : '';
    const models = mergeCodeBuddyModels(helpOutput, configuredModel).map((slug) => ({
      slug,
      displayName: slug === CODEBUDDY_AUTO_MODEL ? 'WorkBuddy 自动选择' : slug,
      // The CLI rarely reports per-model modalities, so we consult the
      // allow-list of known vision-capable models. Unknown slugs stay
      // text-only so the UI never advertises a capability the model does
      // not actually have.
      inputModalities: getCodeBuddyInputModalities(slug),
    }));
    const imageGeneration = /--text-to-image-model\s+<model>/i.test(helpOutput);
    return {
      installed: true,
      runnable,
      running: true,
      // An active process-backed session proves WorkBuddy is open. CodeBuddy
      // has no documented zero-cost account probe, so the official CLI still
      // performs the authoritative account check on the real text request.
      authenticated: true,
      ready: true,
      state: 'ready',
      reasonCode: 'active_session_auth_checked_on_call',
      imageGeneration,
      imageEditing: /--image-to-image-model\s+<model>/i.test(helpOutput),
      videoGeneration: false,
      version,
      commandPath,
      models,
      message: '已检测到运行中的 WorkBuddy 会话；账户登录将在文本调用时由官方 CLI 继续验证。',
    };
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      running: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'probe_failed',
      version: '',
      commandPath,
      models: [],
      message: error instanceof Error ? error.message : 'WorkBuddy CLI 检测失败。',
    };
  }
}

async function codebuddyStatus(force = false) {
  const now = Date.now();
  if (!force && codebuddyStatusValue && codebuddyStatusExpiresAt > now) return codebuddyStatusValue;
  if (!codebuddyStatusPromise) {
    codebuddyStatusPromise = readCodeBuddyStatus()
      .then((value) => {
        codebuddyStatusValue = value;
        codebuddyStatusExpiresAt = Date.now() + 30_000;
        return value;
      })
      .finally(() => {
        codebuddyStatusPromise = null;
      });
  }
  return codebuddyStatusPromise;
}

async function locateBailian() {
  return (await locate('bl')) || (await locate('bailian'));
}

async function readBailianStatus() {
  const commandPath = await locateBailian();
  if (!commandPath) {
    return {
      installed: false,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      imageGeneration: false,
      videoGeneration: false,
      version: '',
      commandPath: '',
      models: { image: [...BAILIAN_IMAGE_MODELS], video: [...BAILIAN_VIDEO_MODELS] },
      message: '未找到百炼 CLI（bl / bailian）。',
    };
  }
  try {
    const [versionResult, authResult] = await Promise.all([
      execute(commandPath, ['--version'], '', 15000),
      execute(commandPath, ['auth', 'status', '--output', 'json', '--no-color'], '', 30000),
    ]);
    const runnable = versionResult.code === 0;
    const authenticated = runnable && authResult.code === 0;
    const ready = runnable && authenticated;
    return {
      installed: true,
      runnable,
      authenticated,
      ready,
      state: ready ? 'ready' : runnable ? 'unauthenticated' : 'error',
      reasonCode: ready ? '' : runnable ? 'authentication_required' : 'version_failed',
      imageGeneration: ready,
      imageEditing: ready,
      videoGeneration: ready,
      version: versionResult.stdout || versionResult.stderr,
      commandPath,
      models: { image: [...BAILIAN_IMAGE_MODELS], video: [...BAILIAN_VIDEO_MODELS] },
      message: ready
        ? '百炼 CLI 已登录，图片与视频生成可用。'
        : '百炼 CLI 尚未登录，请运行 bl auth login --console。',
    };
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'probe_failed',
      imageGeneration: false,
      videoGeneration: false,
      version: '',
      commandPath,
      models: { image: [...BAILIAN_IMAGE_MODELS], video: [...BAILIAN_VIDEO_MODELS] },
      message: error instanceof Error ? error.message : '百炼 CLI 检测失败。',
    };
  }
}

async function bailianStatus(force = false) {
  const now = Date.now();
  if (!force && bailianStatusValue && bailianStatusExpiresAt > now) return bailianStatusValue;
  if (!bailianStatusPromise) {
    bailianStatusPromise = readBailianStatus()
      .then((value) => {
        bailianStatusValue = value;
        bailianStatusExpiresAt = Date.now() + 30_000;
        return value;
      })
      .finally(() => {
        bailianStatusPromise = null;
      });
  }
  return bailianStatusPromise;
}

function resolveConfiguredPath(value, workingDirectory = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return resolve(workingDirectory || PROJECT_ROOT, raw);
}

async function readLightX2VStatus() {
  const config = lightX2VConfig;
  const requestedExecutable = String(config.executablePath || 'python').trim() || 'python';
  const commandPath = /[\\/]/.test(requestedExecutable)
    ? resolveConfiguredPath(requestedExecutable)
    : await locate(requestedExecutable);
  if (!commandPath || !existsSync(commandPath)) {
    return {
      installed: false,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'python_not_found',
      imageGeneration: false,
      videoGeneration: false,
      version: '',
      commandPath: '',
      models: { image: [], video: [] },
      message: '未找到配置的 LightX2V Python 解释器。',
    };
  }
  const workingDirectory = resolveConfiguredPath(config.workingDirectory || PROJECT_ROOT);
  const cwdStat = await stat(workingDirectory).catch(() => null);
  if (!cwdStat?.isDirectory()) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'working_directory_missing',
      imageGeneration: false,
      videoGeneration: false,
      version: '',
      commandPath,
      models: { image: [], video: [] },
      message: 'LightX2V 工作目录不存在。',
    };
  }
  const probe = await execute(
    commandPath,
    [
      '-c',
      'import json, lightx2v; print(json.dumps({"version": getattr(lightx2v, "__version__", "installed")}))',
    ],
    '',
    30000,
    { cwd: workingDirectory },
  ).catch((error) => ({ code: 1, stdout: '', stderr: String(error?.message || error) }));
  const runnable = probe.code === 0;
  const imageModelPath = resolveConfiguredPath(config.imageModelPath, workingDirectory);
  const imageConfigPath = resolveConfiguredPath(config.imageConfigPath, workingDirectory);
  const videoModelPath = resolveConfiguredPath(config.videoModelPath, workingDirectory);
  const videoConfigPath = resolveConfiguredPath(config.videoConfigPath, workingDirectory);
  const imageGeneration = Boolean(
    runnable &&
    config.imageModelClass &&
    ['t2i', 'i2i'].includes(String(config.imageTask || '').toLowerCase()) &&
    (await stat(imageModelPath).catch(() => null))?.isDirectory() &&
    (await stat(imageConfigPath).catch(() => null))?.isFile(),
  );
  const videoGeneration = Boolean(
    runnable &&
    config.videoModelClass &&
    ['t2v', 'i2v'].includes(String(config.videoTask || '').toLowerCase()) &&
    (await stat(videoModelPath).catch(() => null))?.isDirectory() &&
    (await stat(videoConfigPath).catch(() => null))?.isFile(),
  );
  const ready = runnable && (imageGeneration || videoGeneration);
  let version = 'lightx2v installed';
  try {
    version = String(JSON.parse(probe.stdout)?.version || version);
  } catch {
    version = compactCliText(probe.stdout, 160) || version;
  }
  return {
    installed: true,
    runnable,
    authenticated: runnable,
    ready,
    state: ready ? 'ready' : 'error',
    reasonCode: ready ? '' : runnable ? 'model_configuration_incomplete' : 'import_failed',
    imageGeneration,
    imageEditing: imageGeneration,
    videoGeneration,
    version,
    commandPath,
    models: {
      image: imageGeneration ? [...LIGHTX2V_IMAGE_MODELS] : [],
      video: videoGeneration ? [...LIGHTX2V_VIDEO_MODELS] : [],
    },
    message: ready
      ? `LightX2V 已就绪：${imageGeneration ? '图片' : ''}${imageGeneration && videoGeneration ? '、' : ''}${videoGeneration ? '视频' : ''}生成可用。`
      : runnable
        ? 'LightX2V 已安装，但模型目录或 config_json 配置不完整。'
        : compactCliText(probe.stderr, 600) || '当前 Python 环境无法导入 lightx2v。',
    runtimeConfig: {
      ...config,
      executablePath: commandPath,
      workingDirectory,
      imageModelPath,
      imageConfigPath,
      videoModelPath,
      videoConfigPath,
    },
  };
}

async function codexImageReferencePath(value) {
  const source = String(value || '').trim();
  if (!source) return { path: '', temporary: false };
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(source);
  if (dataMatch) {
    const bytes = Buffer.from(dataMatch[2].replace(/\s/g, ''), 'base64');
    if (!bytes.length || bytes.length > 12 * 1024 * 1024)
      throw new Error('Codex CLI 参考图必须小于 12MB。');
    const extension = ASSET_MIME_EXTENSIONS.get(dataMatch[1].toLowerCase()) || '.png';
    await mkdir(CLI_IMAGE_OUTPUT_ROOT, { recursive: true });
    const path = join(
      CLI_IMAGE_OUTPUT_ROOT,
      `reference_${randomUUID().replace(/-/g, '')}${extension}`,
    );
    await writeFile(path, bytes);
    return { path, temporary: true };
  }
  let parsed;
  try {
    parsed = new URL(source, `http://${HOST}:${PORT}`);
  } catch {
    parsed = null;
  }
  const localMediaPath = parsed ? localPersistedMediaPathname(parsed, LOCAL_BRIDGE_HOSTS) : '';
  const localAssetMatch = /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(localMediaPath);
  if (localAssetMatch) {
    const library = await readAssetLibrary();
    const item = library.items.find(
      (entry) =>
        entry.id === localAssetMatch[1] && entry.fileName && entry.mime.startsWith('image/'),
    );
    if (!item) throw new Error('Codex CLI 参考图在素材库中不存在。');
    const path = managedAssetFilePath(item.fileName);
    if (!existsSync(path)) throw new Error('Codex CLI 参考图文件已丢失，请重新导入。');
    return { path, temporary: false };
  }
  const generatedOutputMatch = /^\/output\/([A-Za-z0-9_.-]+)$/.exec(localMediaPath);
  if (generatedOutputMatch) {
    const path = join(CLI_IMAGE_OUTPUT_ROOT, generatedOutputMatch[1]);
    if (!existsSync(path) || !/^\.(?:png|jpe?g|webp|gif)$/i.test(extname(path))) {
      throw new Error('Codex CLI 参考图文件不存在或格式不受支持。');
    }
    return { path, temporary: false };
  }
  throw new Error('Codex CLI 只能编辑已上传、已生成或已存入本机素材库的图片。');
}

function cliImageFileMime(path) {
  const extension = extname(path).toLowerCase();
  return extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : extension === '.webp'
      ? 'image/webp'
      : extension === '.gif'
        ? 'image/gif'
        : 'image/png';
}

async function importCodexGeneratedImage(
  candidate,
  body,
  allowedOutputRoot = CLI_IMAGE_OUTPUT_ROOT,
) {
  const cliLabel = String(body.cliLabel || 'Codex CLI').trim() || 'Codex CLI';
  const requestTag = /^[A-Za-z0-9_-]{6,80}$/.test(String(body.requestId || ''))
    ? `gen:${String(body.requestId)}`
    : '';
  const source = String(candidate || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!source) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(source)) {
    return importAssetFile({
      project: body.project,
      kind: 'storyboard',
      title: body.title || `${cliLabel} 图片`,
      fileName: `${cliLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.png`,
      data: source,
      description: body.prompt,
      tags: [cliLabel, 'AI 图片', requestTag].filter(Boolean),
    });
  }
  if (/^https?:\/\//i.test(source)) {
    const downloaded = await readRemoteAsset(source, `${cliLabel} 图片结果`);
    const mime = String(downloaded.mime || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
      throw new Error(`${cliLabel} 远程结果不是受支持的图片格式。`);
    }
    return importAssetFile({
      project: body.project,
      kind: 'storyboard',
      title: body.title || `${cliLabel} 图片`,
      fileName: `${cliLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}${ASSET_MIME_EXTENSIONS.get(mime) || '.png'}`,
      mime,
      data: downloaded.bytes.toString('base64'),
      description: body.prompt,
      tags: [cliLabel, 'AI 图片', requestTag].filter(Boolean),
    });
  }
  let path = source;
  if (source.startsWith('file://')) {
    try {
      path = decodeURIComponent(new URL(source).pathname);
    } catch {
      return null;
    }
  }
  if (platform() === 'win32' && /^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  const absolutePath = resolve(allowedOutputRoot, path);
  let verified;
  try {
    verified = await verifiedCliOutputFile(absolutePath, allowedOutputRoot);
  } catch {
    return null;
  }
  const fileStat = verified.fileStat;
  if (
    !fileStat.isFile() ||
    fileStat.size <= 0 ||
    fileStat.size > MAX_CLI_IMAGE_BYTES ||
    !/^\.(?:png|jpe?g|webp|gif)$/i.test(extname(absolutePath))
  )
    return null;
  const mime = cliImageFileMime(absolutePath);
  return importAssetFile({
    project: body.project,
    kind: 'storyboard',
    title: body.title || basename(absolutePath, extname(absolutePath)),
    fileName: basename(absolutePath),
    mime,
    data: (await readFile(absolutePath)).toString('base64'),
    description: body.prompt,
    tags: [cliLabel, 'AI 图片', requestTag].filter(Boolean),
  });
}

async function collectFreshCodexImageFiles(outputRoot, startedAt) {
  const pending = [{ directory: outputRoot, depth: 0 }];
  const files = [];
  let inspectedEntries = 0;
  while (pending.length && inspectedEntries < 512) {
    const { directory, depth } = pending.shift();
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      inspectedEntries += 1;
      if (inspectedEntries > 512) break;
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < 6) pending.push({ directory: path, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile() || !/^.+\.(?:png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
      const info = await stat(path).catch(() => null);
      if (info?.isFile() && info.mtimeMs >= startedAt - 1000) {
        files.push({ path, mtimeMs: info.mtimeMs });
      }
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((item) => item.path);
}

async function runCodexImage(body, cliProvider = 'codex') {
  const status =
    cliProvider === 'codebuddy' ? await codebuddyStatus(true) : await codexStatus(true);
  if (!status.installed)
    throw new Error(
      cliProvider === 'codebuddy'
        ? '未找到 CodeBuddy CLI，请先安装。'
        : '未找到 Codex CLI，请先安装。',
    );
  if (!status.authenticated)
    throw new Error(
      cliProvider === 'codebuddy'
        ? 'CodeBuddy CLI 尚未登录，请先在终端运行 codebuddy 完成登录。'
        : 'Codex CLI 尚未登录，请先运行 codex login。',
    );
  if (!status.imageGeneration)
    throw new Error(
      cliProvider === 'codebuddy'
        ? '当前 CodeBuddy CLI 未启用 ImageGen 图片能力，请检查 CODEBUDDY_IMAGE_GEN_ENABLED 和图片模型配置。'
        : '当前 Codex CLI 未启用图片生成能力，请升级后重新检测。',
    );
  await mkdir(CLI_IMAGE_OUTPUT_ROOT, { recursive: true });
  const requestToken = /^[A-Za-z0-9_-]{6,80}$/.test(String(body.requestId || ''))
    ? String(body.requestId)
    : 'untracked';
  const requestOutputRoot = join(
    CLI_IMAGE_OUTPUT_ROOT,
    `request_${requestToken}_${randomUUID().replace(/-/g, '')}`,
  );
  await mkdir(requestOutputRoot, { recursive: true });
  const references = [];
  const temporaryPaths = [];
  try {
    for (const value of [
      body.mediaUrl,
      ...(Array.isArray(body.referenceImages) ? body.referenceImages : []),
    ]
      .filter(Boolean)
      .slice(0, 5)) {
      const prepared = await codexImageReferencePath(value);
      if (prepared.path && !references.includes(prepared.path)) references.push(prepared.path);
      if (prepared.temporary) temporaryPaths.push(prepared.path);
    }
    const startedAt = Date.now();
    const promptParts = [
      cliProvider === 'codebuddy' ? '请使用官方 ImageGen 工具生成图片。' : '$imagegen',
      references.length
        ? '请编辑或扩展附带的参考图片；必须保持未要求修改的主体身份、构图和画风一致。'
        : '请生成一张图片。',
      String(body.prompt || '').trim(),
      `画幅：${String(body.aspectRatio || 'Auto')}；清晰度：${String(body.resolution || 'Auto')}；质量：${String(body.quality || 'high')}。`,
      `只生成一张最终图片。把最终图片保存或导出到这个任务目录（允许使用子目录）：${requestOutputRoot}。在最后回复中给出图片的本机路径。不要修改任何项目源文件。`,
    ].filter(Boolean);
    const args =
      cliProvider === 'codebuddy'
        ? [
            '--print',
            '--output-format',
            'json',
            '--permission-mode',
            'auto',
            '--allowedTools',
            'ImageGen',
            '--add-dir',
            requestOutputRoot,
            ...(String(body.imageModel || '').trim()
              ? ['--text-to-image-model', String(body.imageModel).trim()]
              : []),
          ]
        : [
            'exec',
            '--ephemeral',
            '--cd',
            requestOutputRoot,
            '--sandbox',
            'workspace-write',
            '--skip-git-repo-check',
            '--enable',
            'image_generation',
            '--json',
          ];
    if (cliProvider === 'codex') {
      for (const path of references) args.push('--image', path);
      args.push('-');
    } else if (references.length) {
      promptParts.push(`参考图片文件（请使用 ImageGen 读取）：${references.join(', ')}`);
    }
    const result = await execute(
      status.commandPath,
      args,
      promptParts.join('\n\n'),
      12 * 60 * 1000,
      {
        cwd: requestOutputRoot,
        maxOutput: 48 * 1024 * 1024,
      },
    );
    if (result.code !== 0)
      throw new Error(
        compactCliText(result.stderr || result.stdout || `Codex CLI 退出码 ${result.code}`, 2400),
      );
    const { dataUrls, paths, urls } = extractCodexImageCandidates(result.stdout);
    const newFiles = await collectFreshCodexImageFiles(requestOutputRoot, startedAt);
    let lastImportError = null;
    for (const candidate of [...dataUrls, ...newFiles, ...paths, ...urls]) {
      try {
        const item = await importCodexGeneratedImage(candidate, body, requestOutputRoot);
        if (item) return item;
      } catch (error) {
        lastImportError = error;
      }
    }
    const detail =
      lastImportError instanceof Error
        ? lastImportError.message
        : summarizeCodexImageFailure(result.stderr, result.stdout);
    throw new Error(
      `Codex CLI 已完成，但没有返回可读取的图片。${detail ? ` ${detail}` : ' 请确认 ImageGen 已生成图片，并重试。'}`,
    );
  } finally {
    await Promise.all([
      ...temporaryPaths.map((path) => unlink(path).catch(() => undefined)),
      rm(requestOutputRoot, { recursive: true, force: true }).catch(() => undefined),
    ]);
  }
}

async function readAntigravityStatus() {
  const commandPath = await antigravityPath();
  if (!commandPath) return null;
  const label = 'Antigravity CLI';
  const cliKind = 'agy';
  if (/\.(?:cmd|bat)$/i.test(commandPath)) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'unsupported_command_shim',
      cliKind,
      version: '',
      commandPath,
      message: '为避免命令注入，Antigravity CLI 只允许直接运行官方 agy.exe。',
    };
  }
  try {
    const versionResult = await execute(commandPath, ['--version'], '', 10000);
    const version = versionResult.stdout || versionResult.stderr;
    if (versionResult.code !== 0) {
      return {
        installed: true,
        runnable: false,
        authenticated: false,
        ready: false,
        state: 'error',
        reasonCode: 'version_failed',
        cliKind,
        version,
        commandPath,
        message: `${label} 已找到，但命令无法正常运行。`,
      };
    }

    const probe = await execute(commandPath, ['models'], '', 25000);
    const catalogText = compactCliText(probe.stdout || probe.stderr, 12000);
    const inspected = inspectAntigravityModelProbe({ code: probe.code, output: catalogText });
    const authenticated = inspected.authenticated;
    return {
      installed: true,
      runnable: true,
      authenticated,
      ready: authenticated,
      state: authenticated ? 'ready' : 'unauthenticated',
      reasonCode: authenticated
        ? ''
        : probe.code === 0
          ? 'empty_model_catalog'
          : 'authentication_required',
      cliKind,
      version,
      commandPath,
      message: authenticated
        ? 'Antigravity CLI 已登录并可读取模型。'
        : compactCliText(inspected.decisiveMessage || catalogText, 600) ||
          'Antigravity CLI 尚未登录，请先启动 agy 完成登录。',
    };
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'probe_failed',
      cliKind,
      version: '',
      commandPath,
      message: error instanceof Error ? error.message : `${label} 检测失败。`,
    };
  }
}

async function readGeminiStatus() {
  return (
    (await readAntigravityStatus()) || {
      installed: false,
      runnable: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      cliKind: '',
      version: '',
      commandPath: '',
      message: '未找到 Antigravity CLI（agy）。',
    }
  );
}

async function geminiStatus(force = false) {
  const now = Date.now();
  if (!force && geminiStatusValue && geminiStatusExpiresAt > now) return geminiStatusValue;
  if (!geminiStatusPromise) {
    geminiStatusPromise = readGeminiStatus()
      .then((value) => {
        geminiStatusValue = value;
        geminiStatusExpiresAt = Date.now() + 30_000;
        return value;
      })
      .finally(() => {
        geminiStatusPromise = null;
      });
  }
  return geminiStatusPromise;
}

function stripAnsi(value) {
  return String(value || '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '');
}

function compactCliText(value, limit = 24000) {
  const clean = stripAnsi(value).trim();
  return clean.length > limit ? `${clean.slice(-limit)}\n…（较早输出已省略）` : clean;
}

function parseCliPayload(value) {
  const text = compactCliText(value);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function jimengLoginText() {
  return compactCliText(
    [jimengLoginSession.stdout, jimengLoginSession.stderr].filter(Boolean).join('\n'),
  );
}

function jimengQrUrl(text) {
  const candidates =
    String(text || '').match(/(?:https?:\/\/|dreamina:\/\/|data:image\/)[^\s"'<>]+/g) || [];
  return (
    candidates.find(
      (value) =>
        value.startsWith('data:image') ||
        value.startsWith('dreamina://') ||
        /(?:\/|[?&])qr(?:code)?(?:\/|=|[?&])/i.test(value) ||
        /\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(value),
    ) || ''
  );
}

function jimengLoginField(text, field) {
  const match = String(text || '').match(new RegExp(`(?:^|\\r?\\n)${field}:\\s*(\\S+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function jimengIsRunning() {
  return Boolean(jimengLoginSession.child && jimengLoginSession.exitCode === null);
}

async function dreaminaPath() {
  const discovered = await locate('dreamina');
  if (discovered) return discovered;
  const home = homedir();
  const candidates =
    platform() === 'win32'
      ? [
          join(home, 'bin', 'dreamina.exe'),
          join(home, 'bin', 'dreamina'),
          join(home, '.local', 'bin', 'dreamina.exe'),
          join(home, '.local', 'bin', 'dreamina'),
          join(home, '.dreamina_cli', 'dreamina', 'dreamina.exe'),
        ]
      : [join(home, '.local', 'bin', 'dreamina')];
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function jimengInstallPayload() {
  const commandPath = await dreaminaPath();
  return {
    success: true,
    running: false,
    installed: Boolean(commandPath),
    commandPath,
    exitCode: null,
    startedAt: 0,
    text: commandPath
      ? ''
      : '出于安全原因，Qiansi-Canvas 不会下载并直接执行远程安装脚本。请从即梦官方文档获取安装包，核验来源后手动安装，再回到这里检测。',
    message: commandPath
      ? '已检测到即梦 CLI。'
      : '请按即梦官方文档手动安装 CLI；画布不会自动执行网络脚本。',
  };
}

async function startJimengInstall() {
  const existing = await dreaminaPath();
  if (existing) return jimengInstallPayload();
  throw new Error(
    '已禁用自动下载安装：请从即梦官方文档获取安装包，核验来源后手动安装，再点击连接检测。',
  );
}

async function runDreamina(args, timeoutMs = 30000) {
  const commandPath = await dreaminaPath();
  if (!commandPath)
    throw new Error('未找到 dreamina CLI。请先在 API 设置页安装，或把 dreamina 加入 PATH。');
  const result = await execute(commandPath, args, '', timeoutMs);
  if (result.code !== 0)
    throw new Error(
      compactCliText(result.stderr || result.stdout || `dreamina 退出码 ${result.code}`, 1800),
    );
  return { ...result, raw: parseCliPayload(result.stdout || result.stderr) };
}

function beginJimengLoginProcess(commandPath, directArgs, fallbackTried = false) {
  const { executable, args } = commandSpec(commandPath, directArgs);
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    windowsHide: true,
    shell: false,
    env: { ...process.env, NO_COLOR: '1' },
  });
  jimengLoginSession.child = child;
  jimengLoginSession.stdout = '';
  jimengLoginSession.stderr = '';
  jimengLoginSession.startedAt = Date.now();
  jimengLoginSession.fallbackTried = fallbackTried;
  jimengLoginSession.exitCode = null;
  const append = (key, chunk) => {
    const next = `${jimengLoginSession[key]}${String(chunk)}`;
    jimengLoginSession[key] = next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next;
  };
  child.stdout.on('data', (chunk) => append('stdout', chunk));
  child.stderr.on('data', (chunk) => append('stderr', chunk));
  child.on('error', (error) => {
    append('stderr', `\n${error.message}`);
    jimengLoginSession.exitCode = 1;
  });
  child.on('close', (code) => {
    jimengLoginSession.exitCode = Number(code ?? 1);
  });
  return child;
}

async function startJimengLogin() {
  const commandPath = await dreaminaPath();
  if (!commandPath) throw new Error('未找到 dreamina CLI。请先安装并把 dreamina 加入 PATH。');
  // Current official Dreamina uses OAuth Device Flow. The non-headless command
  // prints the verification URL/code and keeps polling until the user finishes,
  // so the bridge can report real completion instead of treating prompt output
  // from `--headless` as a successful login.
  if (!jimengIsRunning()) beginJimengLoginProcess(commandPath, ['login']);
  return jimengLoginPayload(false);
}

function jimengLoginPayload(loggedIn = false, raw = undefined) {
  const text = jimengLoginText();
  const verificationUri = jimengLoginField(text, 'verification_uri');
  const userCode = jimengLoginField(text, 'user_code');
  const expiresAt = jimengLoginField(text, 'expires_at');
  return {
    success: true,
    running: jimengIsRunning(),
    loggedIn,
    text,
    qrUrl: jimengQrUrl(text),
    verificationUri,
    userCode,
    expiresAt,
    startedAt: jimengLoginSession.startedAt,
    message: loggedIn
      ? '即梦 CLI 已登录。'
      : jimengIsRunning()
        ? verificationUri
          ? '请打开即梦扫码登录页面完成授权。'
          : '正在等待即梦返回登录信息…'
        : '登录流程已结束，但尚未检测到有效登录态。',
    ...(raw === undefined ? {} : { raw }),
  };
}

async function readJimengStatus() {
  const commandPath = await dreaminaPath();
  if (!commandPath)
    return {
      installed: false,
      runnable: false,
      loggedIn: false,
      authenticated: false,
      ready: false,
      state: 'unavailable',
      reasonCode: 'command_not_found',
      version: '',
      commandPath: '',
      message: '未找到 dreamina CLI。',
    };
  let version = '';
  try {
    const versionResult = await execute(commandPath, ['--version'], '', 10000);
    version = compactCliText(versionResult.stdout || versionResult.stderr, 300);
    if (versionResult.code !== 0) {
      return {
        installed: true,
        runnable: false,
        loggedIn: false,
        authenticated: false,
        ready: false,
        state: 'error',
        reasonCode: 'version_failed',
        version,
        commandPath,
        message: version || 'dreamina CLI 已找到，但命令无法正常运行。',
      };
    }
  } catch (error) {
    return {
      installed: true,
      runnable: false,
      loggedIn: false,
      authenticated: false,
      ready: false,
      state: 'error',
      reasonCode: 'version_failed',
      version: '',
      commandPath,
      message: error instanceof Error ? error.message : 'dreamina CLI 无法正常运行。',
    };
  }
  try {
    const credit = await runDreamina(['user_credit'], 30000);
    const accountPayloads = [credit.raw, credit.raw?.data, credit.raw?.result].filter(
      (value) => value && typeof value === 'object' && !Array.isArray(value),
    );
    const hasAccountPayload = accountPayloads.some((value) =>
      ['total_credit', 'credit', 'credits', 'user_id', 'uid'].some((key) =>
        Object.prototype.hasOwnProperty.call(value, key),
      ),
    );
    if (!hasAccountPayload) {
      throw new Error('dreamina user_credit 未返回可验证的账户或积分数据。');
    }
    const hasVipAccess = inspectDreaminaVipAccess(credit.raw);
    const ready = hasVipAccess === true;
    return {
      installed: true,
      runnable: true,
      loggedIn: true,
      authenticated: true,
      ready,
      state: ready ? 'ready' : 'installed',
      reasonCode: ready ? '' : hasVipAccess === false ? 'vip_required' : 'vip_status_unknown',
      version,
      commandPath,
      message: ready
        ? '即梦 CLI 已登录，VIP 权限有效。'
        : hasVipAccess === false
          ? '即梦 CLI 已登录，但当前账号不是 VIP；不会在画布中显示即梦模型。'
          : '即梦 CLI 已登录，但无法确认 VIP 权限；请更新官方 CLI 后重新检测。',
      ...(hasVipAccess === undefined ? {} : { hasVipAccess }),
      raw: credit.raw,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '即梦 CLI 检测失败。';
    const authenticationRequired =
      /(?:not\s+logged\s+in|please\s+(?:sign|log)\s+in|unauth(?:enticated|orized)|login\s+required|未登录|请.*登录|401|403)/i.test(
        message,
      );
    return {
      installed: true,
      runnable: true,
      loggedIn: false,
      authenticated: authenticationRequired ? false : undefined,
      ready: false,
      state: authenticationRequired ? 'unauthenticated' : 'error',
      reasonCode: authenticationRequired ? 'authentication_required' : 'probe_failed',
      version,
      commandPath,
      message,
    };
  }
}

function jimengModels(hasVipAccess) {
  return {
    image: hasVipAccess === true ? [...JIMENG_IMAGE_MODELS] : [],
    video: jimengVideoModelsForVipAccess(hasVipAccess),
  };
}

async function jimengStatus(force = false) {
  const now = Date.now();
  if (!force && jimengStatusValue && jimengStatusExpiresAt > now) return jimengStatusValue;
  if (!jimengStatusPromise) {
    jimengStatusPromise = readJimengStatus()
      .then((value) => {
        jimengStatusValue = { ...value, models: jimengModels(value.hasVipAccess) };
        jimengStatusExpiresAt = Date.now() + 30_000;
        return jimengStatusValue;
      })
      .finally(() => {
        jimengStatusPromise = null;
      });
  }
  return jimengStatusPromise;
}

function invalidateJimengStatus() {
  jimengStatusValue = null;
  jimengStatusExpiresAt = 0;
}

async function singleCliHealth(tool, force = false) {
  if (tool === 'arkcli' || tool === 've') {
    const arkcli = await volcengineStatus(force);
    const responseKey = tool === 've' ? 've' : 'arkcli';
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { [responseKey]: arkcli.installed },
      capabilities: {
        [responseKey]: {
          arkServices: arkcli.ready,
          textGeneration: false,
          imageGeneration: false,
          imageEditing: false,
          videoGeneration: false,
        },
      },
      sessions: { [responseKey]: arkcli },
    };
  }
  if (tool === 'codex') {
    const codex = await codexStatus(force);
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { codex: codex.installed },
      capabilities: {
        codex: {
          textGeneration: codex.ready,
          imageGeneration: Boolean(codex.ready && codex.imageGeneration),
          imageEditing: Boolean(codex.ready && codex.imageGeneration),
        },
      },
      sessions: { codex },
    };
  }
  if (tool === 'codebuddy') {
    const codebuddy = await codebuddyStatus(force);
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { codebuddy: codebuddy.installed },
      capabilities: {
        codebuddy: {
          textGeneration: codebuddy.ready,
          imageGeneration: Boolean(codebuddy.ready && codebuddy.imageGeneration),
          imageEditing: Boolean(codebuddy.ready && codebuddy.imageEditing),
          videoGeneration: false,
        },
      },
      sessions: { codebuddy },
    };
  }
  if (tool === 'gemini') {
    const gemini = await geminiStatus(force);
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { gemini: gemini.installed },
      capabilities: { gemini: { textGeneration: gemini.ready, imageGeneration: false } },
      sessions: { gemini },
    };
  }
  if (tool === 'jimeng') {
    const jimeng = await jimengStatus(force);
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { jimeng: jimeng.installed },
      capabilities: {
        jimeng: {
          accountTools: jimeng.ready,
          imageGeneration: jimeng.ready,
          imageEditing: jimeng.ready,
          videoGeneration: jimeng.ready,
        },
      },
      sessions: { jimeng },
    };
  }
  if (tool === 'bailian') {
    const bailian = await bailianStatus(force);
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { bailian: bailian.installed },
      capabilities: {
        bailian: {
          imageGeneration: bailian.ready,
          imageEditing: bailian.ready,
          videoGeneration: bailian.ready,
        },
      },
      sessions: { bailian },
    };
  }
  if (tool === 'lightx2v') {
    const lightx2v = await readLightX2VStatus();
    return {
      ok: true,
      bridge: 'qiansi-canvas-cli-bridge',
      buildId: BRIDGE_BUILD_ID,
      tools: { lightx2v: lightx2v.installed },
      capabilities: {
        lightx2v: {
          imageGeneration: lightx2v.imageGeneration,
          imageEditing: lightx2v.imageEditing,
          videoGeneration: lightx2v.videoGeneration,
        },
      },
      sessions: { lightx2v },
    };
  }
  throw new Error(
    'CLI 工具只支持 arkcli（ve 为兼容别名）、codex、codebuddy、gemini、jimeng、bailian 或 lightx2v。',
  );
}

async function runCli(provider, model, prompt, requestedReasoningEffort = '', imageUrls = []) {
  if (provider !== 'codebuddy' && !MODEL_RE.test(model)) {
    throw new Error('模型名称只允许字母、数字、点、下划线和连字符。');
  }
  if (!prompt || prompt.length > 200000) throw new Error('提示词为空或过长。');
  if (provider !== 'codex' && provider !== 'codebuddy' && provider !== 'gemini')
    throw new Error('仅支持 Codex CLI、WorkBuddy CLI 和 Antigravity CLI。');
  const availability =
    provider === 'codex'
      ? await codexStatus(true)
      : provider === 'codebuddy'
        ? await codebuddyStatus(true)
        : await geminiStatus(true);
  if (!availability.ready) throw new Error(availability.message || 'CLI 尚未真实连通。');
  const commandPath = availability.commandPath;
  const commandName =
    provider === 'codex' ? 'codex' : provider === 'codebuddy' ? 'codebuddy' : availability.cliKind;
  if (provider === 'gemini' && commandName !== 'agy' && commandName !== 'gemini') {
    throw new Error('CLI 类型未经过检测，拒绝执行。');
  }
  const antigravity = commandName === 'agy';
  if (antigravity && /\.(?:cmd|bat)$/i.test(commandPath)) {
    throw new Error(
      '为避免命令注入，Antigravity CLI 只允许直接运行 agy.exe。请把官方 agy.exe 加入 PATH。',
    );
  }
  if (antigravity && prompt.length > 20000)
    throw new Error('Antigravity CLI 单次提示词不能超过 20000 字符。');

  const reasoningEffort = String(requestedReasoningEffort || '')
    .trim()
    .toLowerCase();
  if (provider === 'codex' && reasoningEffort && !isCodexReasoningEffort(reasoningEffort)) {
    throw new Error('Codex 推理强度只支持 low、medium、high、xhigh、max 或 ultra。');
  }
  const reasoningArgs =
    provider === 'codex' && reasoningEffort
      ? ['--config', `model_reasoning_effort=\"${reasoningEffort}\"`]
      : [];

  if (provider === 'gemini' && imageUrls.length) {
    throw new Error(
      '当前 Gemini CLI 对话通道尚不支持图片分析，请选择 Codex CLI、WorkBuddy Hy3 或视觉 API 模型。',
    );
  }
  const temporaryPaths = [];
  try {
    const imagePaths = [];
    if (provider === 'codex' || provider === 'codebuddy') {
      for (const value of imageUrls.slice(0, 5)) {
        const prepared = await codexImageReferencePath(value);
        if (prepared.path && !imagePaths.includes(prepared.path)) imagePaths.push(prepared.path);
        if (prepared.temporary) temporaryPaths.push(prepared.path);
      }
    }

    const directArgs =
      provider === 'codex'
        ? model === 'default'
          ? ['exec', ...reasoningArgs, '--skip-git-repo-check']
          : ['exec', '--model', model, ...reasoningArgs, '--skip-git-repo-check']
        : provider === 'codebuddy'
          ? buildCodeBuddyTextArgs(model)
          : antigravity
            ? [
                '--print-timeout',
                '600s',
                ...(model && model !== 'auto' ? ['--model', model] : []),
                '-p',
                prompt,
              ]
            : [...(model && model !== 'auto' ? ['--model', model] : [])];
    if (provider === 'codex') {
      for (const path of imagePaths) directArgs.push('--image', path);
      directArgs.push('-');
    }
    const cliPrompt =
      provider === 'codebuddy' && imagePaths.length
        ? `${prompt}\n\n请使用官方 Read 工具读取以下参考图片后再回答，必须先看图再作答：\n${imagePaths
            .map((path) => `- ${path}`)
            .join('\n')}`
        : prompt;
    const result = await execute(
      commandPath,
      directArgs,
      antigravity ? '' : cliPrompt,
      10 * 60 * 1000,
      {},
    );
    if (result.code !== 0)
      throw new Error(result.stderr.slice(-1200) || `${commandName} CLI 退出码 ${result.code}`);
    if (
      provider === 'codebuddy' &&
      /(?:please\s+(?:sign|log)\s*in|not\s+logged\s+in|unauth(?:enticated|orized)|login\s+required|请.*登录|尚未登录)/i.test(
        `${result.stdout}\n${result.stderr}`,
      )
    ) {
      throw new Error('WorkBuddy CLI 尚未登录，请先在终端运行 codebuddy 完成登录。');
    }
    return result.stdout || result.stderr;
  } finally {
    await Promise.all(temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

function cleanAssetText(value, fallback = '', limit = 240) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || fallback).slice(0, limit);
}

function normalizeAssetTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,，、;；\n]+/);
  return [...new Set(source.map((item) => cleanAssetText(item, '', 30)).filter(Boolean))].slice(
    0,
    20,
  );
}

function assetKindFor(kind, mime = '') {
  if (String(mime).startsWith('video/')) return 'video';
  if (String(mime).startsWith('audio/')) return 'audio';
  if (String(mime).startsWith('image/') && (kind === 'video' || kind === 'audio'))
    return 'character';
  return ASSET_KINDS.has(kind) ? kind : 'character';
}

function assetColor(kind) {
  return (
    {
      character: '#6877b7',
      scene: '#438d83',
      prop: '#a4774f',
      storyboard: '#7e659d',
      video: '#4f7795',
      audio: '#9a685f',
    }[kind] || '#68717d'
  );
}

function normalizeAssetItem(item) {
  const id = /^[A-Za-z0-9_-]{6,80}$/.test(String(item?.id || ''))
    ? String(item.id)
    : `asset_${randomUUID().replace(/-/g, '')}`;
  const mime = cleanAssetText(item?.mime, 'application/octet-stream', 100).toLowerCase();
  const kind = assetKindFor(String(item?.kind || ''), mime);
  const project = /^[A-Za-z0-9_-]{1,80}$/.test(String(item?.project || ''))
    ? String(item.project)
    : 'clocktower';
  const createdAt = Number(item?.createdAt) || Date.now();
  return {
    id,
    project,
    title: cleanAssetText(item?.title, '未命名素材', 120),
    kind,
    code: cleanAssetText(item?.code, `LOCAL-${id.slice(-6).toUpperCase()}`, 40),
    color: /^#[0-9a-f]{6}$/i.test(String(item?.color || ''))
      ? String(item.color)
      : assetColor(kind),
    mime,
    size: Math.max(0, Number(item?.size) || 0),
    createdAt,
    updatedAt: Number(item?.updatedAt) || createdAt,
    description: cleanAssetText(item?.description, '', 1200),
    tags: normalizeAssetTags(item?.tags),
    originalName: cleanAssetText(item?.originalName, '', 180),
    fileName: normalizeAssetFileName(item?.fileName),
    url: /^https?:\/\//i.test(String(item?.url || '')) ? String(item.url).slice(0, 4000) : '',
  };
}

function normalizeAssetFileName(value) {
  const parts = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (!parts.length || parts.length > 3) return '';
  if (parts.some((part) => part === '.' || part === '..' || !/^[A-Za-z0-9_.-]{1,180}$/.test(part)))
    return '';
  return parts.join('/');
}

function assetStorageFileName(project, kind, id, extension) {
  const safeProject = /^[A-Za-z0-9_-]{1,80}$/.test(String(project || ''))
    ? String(project)
    : 'clocktower';
  const safeKind = ASSET_KINDS.has(String(kind || '')) ? String(kind) : 'character';
  return `${safeProject}/${safeKind}/${id}${extension}`;
}

function assetUploadFormat(requestedKind, declaredMime, bytes, originalName = '', totalSize) {
  if (requestedKind === 'director-model') {
    return inspectDirectorModelUpload({
      declaredMime,
      value: bytes,
      originalName,
      totalSize,
    });
  }
  if (!ASSET_MIME_EXTENSIONS.has(declaredMime)) {
    throw new Error('仅支持常用图片、视频和音频格式。');
  }
  let mime = declaredMime;
  let kind = assetKindFor(requestedKind, mime);
  let extension =
    ASSET_MIME_EXTENSIONS.get(mime) || extname(String(originalName || '')).toLowerCase() || '.bin';

  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    inspectDeclaredMediaSignature(bytes, mime);
  }

  if (requestedKind === 'audio') {
    const audioFormat = resolveAudioAssetUploadFormat(mime, bytes);
    if (audioFormat) {
      mime = audioFormat.mime;
      kind = 'audio';
      extension = audioFormat.extension;
    } else if (mime === 'video/webm' || hasWebmFileSignature(bytes)) {
      throw new Error('WebM 音频必须包含音频轨道且不能包含视频轨道。');
    }
  }
  return { extension, kind, mime };
}

async function probeUploadedMedia(filePath, format) {
  if (!['video', 'audio'].includes(format.kind)) return;
  if (!existsSync(LOCAL_FFPROBE_PATH)) {
    throw new Error('缺少本机 FFprobe，无法安全验证视频或音频，已拒绝导入。');
  }
  const result = await execute(
    LOCAL_FFPROBE_PATH,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height,duration',
      '-of',
      'json',
      filePath,
    ],
    '',
    15_000,
    { cwd: PROJECT_ROOT, maxOutput: 256 * 1024 },
  );
  if (result.code !== 0) throw new Error('媒体探测失败，文件可能已损坏或格式与声明不符。');
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('媒体探测没有返回有效元数据。');
  }
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const expectedType = format.kind === 'video' ? 'video' : 'audio';
  if (!streams.some((stream) => stream?.codec_type === expectedType)) {
    throw new Error(
      format.kind === 'video' ? '上传文件不包含视频轨道。' : '上传文件不包含音频轨道。',
    );
  }
  const video = streams.find((stream) => stream?.codec_type === 'video');
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  if (
    video &&
    (width < 1 || height < 1 || width > 16_384 || height > 16_384 || width * height > 134_217_728)
  ) {
    throw new Error('视频尺寸超过安全处理上限。');
  }
  const reportedDurations = [
    payload?.format?.duration,
    ...streams.map((stream) => stream?.duration),
  ]
    .map(Number)
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const duration =
    reportedDurations.length > 0
      ? Math.max(...reportedDurations)
      : await probePacketTimelineDuration(filePath);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_MEDIA_DURATION_SECONDS) {
    throw new Error('媒体时长无效或超过 8 小时上限。');
  }
}

function probePacketTimelineDuration(filePath) {
  const { executable, args } = commandSpec(LOCAL_FFPROBE_PATH, [
    '-v',
    'error',
    '-show_packets',
    '-show_entries',
    'packet=pts_time,duration_time',
    '-of',
    'csv=p=0',
    filePath,
  ]);
  return new Promise((resolveDuration, rejectDuration) => {
    const child = spawn(executable, args, {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      shell: false,
      detached: platform() !== 'win32',
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let remainder = '';
    let stderr = '';
    let maximumEnd = 0;
    let stoppedAtLimit = false;
    let settled = false;
    const finishFailure = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectDuration(error);
    };
    const consumeLine = (line) => {
      maximumEnd = Math.max(maximumEnd, ffprobePacketEndSeconds(line));
      if (maximumEnd > MAX_MEDIA_DURATION_SECONDS && !stoppedAtLimit) {
        stoppedAtLimit = true;
        terminateChildProcessTree(child);
      }
    };
    const timer = setTimeout(() => {
      terminateChildProcessTree(child);
      finishFailure(new Error('媒体包时间轴探测超时，已拒绝导入。'));
    }, FFPROBE_PACKET_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      if (settled || stoppedAtLimit) return;
      const lines = `${remainder}${String(chunk)}`.split(/\r?\n/u);
      remainder = lines.pop() || '';
      if (Buffer.byteLength(remainder) > FFPROBE_PACKET_LINE_BYTES) {
        terminateChildProcessTree(child);
        finishFailure(new Error('媒体包时间轴元数据异常，已拒绝导入。'));
        return;
      }
      for (const line of lines) {
        consumeLine(line);
        if (stoppedAtLimit) break;
      }
    });
    child.stderr.on('data', (chunk) => {
      if (settled) return;
      stderr += String(chunk);
      if (Buffer.byteLength(stderr) > FFPROBE_PACKET_STDERR_BYTES) {
        terminateChildProcessTree(child);
        finishFailure(new Error('媒体包时间轴探测输出异常，已拒绝导入。'));
      }
    });
    child.on('error', finishFailure);
    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (!stoppedAtLimit) consumeLine(remainder);
      if (!stoppedAtLimit && Number(code ?? 1) !== 0) {
        finishFailure(new Error('媒体包时间轴探测失败，文件可能已损坏。'));
        return;
      }
      settled = true;
      resolveDuration(maximumEnd);
    });
  });
}

async function readAssetSignature(filePath, size) {
  const bytes = Buffer.alloc(Math.min(size, AUDIO_FILE_SIGNATURE_SCAN_BYTES));
  const file = await open(filePath, 'r');
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function publicAssetItem(item) {
  const clean = normalizeAssetItem(item);
  return {
    ...clean,
    url: clean.fileName ? `/asset-library/files/${encodeURIComponent(clean.id)}` : clean.url,
  };
}

function managedAssetFilePath(fileName) {
  const current = join(ASSET_LIBRARY_FILES, fileName);
  if (existsSync(current) || ASSET_LIBRARY_FILES === LEGACY_ASSET_LIBRARY_FILES) return current;
  return join(LEGACY_ASSET_LIBRARY_FILES, fileName);
}

function managedPreviewFilePath(fileName) {
  const current = join(MEDIA_PREVIEW_ROOT, fileName);
  if (existsSync(current) || MEDIA_PREVIEW_ROOT === LEGACY_MEDIA_PREVIEW_ROOT) return current;
  return join(LEGACY_MEDIA_PREVIEW_ROOT, fileName);
}

async function readAssetLibrary() {
  const index =
    existsSync(ASSET_LIBRARY_INDEX) || ASSET_LIBRARY_INDEX === LEGACY_ASSET_LIBRARY_INDEX
      ? ASSET_LIBRARY_INDEX
      : LEGACY_ASSET_LIBRARY_INDEX;
  const byId = new Map();
  let updatedAt = 0;
  const parsed = await readJsonIfExists(index, '素材库索引');
  if (parsed) {
    if (!Array.isArray(parsed?.items)) {
      throw new Error(`素材库索引格式无效，已拒绝覆盖：${index}`);
    }
    for (const item of parsed.items) {
      const normalized = normalizeAssetItem(item);
      byId.set(normalized.id, normalized);
    }
    updatedAt = Math.max(updatedAt, Number(parsed?.updatedAt) || 0);
  }
  return {
    version: 1,
    items: [...byId.values()].sort((a, b) => b.createdAt - a.createdAt),
    updatedAt: updatedAt || Date.now(),
  };
}

async function saveAssetLibrary(library) {
  await mkdir(ASSET_LIBRARY_FILES, { recursive: true });
  const clean = {
    version: 1,
    items: (library.items || []).map(normalizeAssetItem),
    updatedAt: Date.now(),
  };
  await atomicWriteJson(ASSET_LIBRARY_INDEX, clean, { maxBytes: MAX_PROJECT_BODY });
  return clean;
}

function mutateAssetLibrary(mutator) {
  const task = assetLibraryWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const library = await readAssetLibrary();
      const result = await mutator(library);
      await saveAssetLibrary(library);
      return result;
    });
  assetLibraryWriteQueue = task;
  return task;
}

function decodeAssetData(value, declaredMime = '') {
  const source = String(value || '');
  const dataMatch = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(source);
  const mime = cleanAssetText(
    dataMatch?.[1] || declaredMime,
    'application/octet-stream',
    100,
  ).toLowerCase();
  const encoded = (dataMatch?.[2] || source).replace(/\s/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error('素材数据不是有效的 Base64 文件。');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('素材文件为空。');
  if (bytes.length > MAX_ASSET_BYTES) throw new Error('单个素材不能超过 12MB。');
  return { bytes, mime };
}

async function importAssetFile(body) {
  const decoded = decodeAssetData(body.data, body.mime);
  const requestedKind = String(body.kind || '').toLowerCase();
  const format = assetUploadFormat(requestedKind, decoded.mime, decoded.bytes, body.fileName);
  const { bytes } = decoded;
  const { extension, kind, mime } = format;
  const project = /^[A-Za-z0-9_-]{1,80}$/.test(String(body.project || ''))
    ? String(body.project)
    : 'clocktower';
  const id = `asset_${randomUUID().replace(/-/g, '')}`;
  const fileName = assetStorageFileName(project, kind, id, extension);
  const targetPath = join(ASSET_LIBRARY_FILES, fileName);
  const temporaryPath = join(ASSET_LIBRARY_FILES, `${id}.${randomUUID()}.upload`);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await fsyncFile(temporaryPath);
  const item = normalizeAssetItem({
    id,
    project,
    title: body.title || String(body.fileName || '').replace(/\.[^.]+$/, ''),
    kind,
    color: assetColor(kind),
    mime,
    size: bytes.length,
    description: body.description,
    tags: body.tags,
    originalName: body.fileName,
    fileName,
    createdAt: Date.now(),
  });
  try {
    await probeUploadedMedia(temporaryPath, format);
    await rename(temporaryPath, targetPath);
    await fsyncDirectory(dirname(targetPath));
    await mutateAssetLibrary((library) => {
      library.items.unshift(item);
      return item;
    });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    await unlink(targetPath).catch(() => undefined);
    throw error;
  }
  return publicAssetItem(item);
}

async function importAssetStream(request) {
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (declaredLength > MAX_ASSET_BYTES) throw new Error('单个素材不能超过 1GB。');
  const mime = cleanAssetText(
    String(request.headers['content-type'] || '').split(';')[0],
    'application/octet-stream',
    100,
  ).toLowerCase();
  const originalName = cleanCompatibleHeaderText(
    request,
    'x-qiansi-canvas-file-name',
    'x-kitty-canvas-file-name',
    '素材文件',
    180,
  );
  const project = cleanCompatibleHeaderText(
    request,
    'x-qiansi-canvas-project',
    'x-kitty-canvas-project',
    'clocktower',
    80,
  );
  const requestedKind = cleanCompatibleHeaderText(
    request,
    'x-qiansi-canvas-kind',
    'x-kitty-canvas-kind',
    '',
    40,
  ).toLowerCase();
  const id = `asset_${randomUUID().replace(/-/g, '')}`;
  const temporaryPath = join(ASSET_LIBRARY_FILES, `${id}.${randomUUID()}.upload`);
  await mkdir(ASSET_LIBRARY_FILES, { recursive: true });
  let size = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > MAX_ASSET_BYTES ? new Error('单个素材不能超过 1GB。') : null, chunk);
    },
  });
  try {
    await pipeline(request, counter, createWriteStream(temporaryPath, { flags: 'wx' }));
    if (!size) throw new Error('素材文件为空。');
    const signature = await readAssetSignature(temporaryPath, size);
    const format = assetUploadFormat(requestedKind, mime, signature, originalName, size);
    await probeUploadedMedia(temporaryPath, format);
    await fsyncFile(temporaryPath);
    const fileName = assetStorageFileName(project, format.kind, id, format.extension);
    const targetPath = join(ASSET_LIBRARY_FILES, fileName);
    await mkdir(dirname(targetPath), { recursive: true });
    await rename(temporaryPath, targetPath);
    await fsyncDirectory(dirname(targetPath));
    const item = normalizeAssetItem({
      id,
      project,
      title: cleanCompatibleHeaderText(
        request,
        'x-qiansi-canvas-title',
        'x-kitty-canvas-title',
        originalName.replace(/\.[^.]+$/, ''),
        120,
      ),
      kind: format.kind,
      color: assetColor(format.kind),
      mime: format.mime,
      size,
      description: cleanCompatibleHeaderText(
        request,
        'x-qiansi-canvas-description',
        'x-kitty-canvas-description',
        '',
        1200,
      ),
      originalName,
      fileName,
      createdAt: Date.now(),
    });
    try {
      await mutateAssetLibrary((library) => {
        library.items.unshift(item);
        return item;
      });
    } catch (error) {
      await unlink(targetPath).catch(() => undefined);
      throw error;
    }
    return publicAssetItem(item);
  } catch (error) {
    await unlink(temporaryPath).catch(() => null);
    throw error;
  }
}

function assetResponse(library) {
  return {
    version: 1,
    items: (library.items || []).map(publicAssetItem),
    updatedAt: library.updatedAt || Date.now(),
  };
}

function assetIdFromPath(pathname) {
  const match = /^\/asset-library\/items\/([A-Za-z0-9_-]{6,80})$/.exec(pathname);
  return match?.[1] || '';
}

const DEFAULT_ANIME_STYLE_PROFILE = {
  enName: 'Local Donghua Study',
  description: '从本机国漫视频中截取真实画面，用于约束角色材质、环境色彩与镜头层次。',
  enDescription:
    'A real frame sampled from the local donghua library for material, palette, and depth reference.',
  prompt:
    'high-end Chinese 3D animation, cinematic composition, coherent character design, physically readable materials, atmospheric depth, restrained color grading, production-ready continuity',
  negative:
    'low resolution, flat lighting, plastic materials, inconsistent face, distorted anatomy, extra limbs, text, subtitles, watermark, logo',
  color: '#6574a8',
  tags: ['国漫', '3D', '原片取样'],
};

const ANIME_STYLE_PROFILES = {
  仙逆: {
    enName: 'Renegade Immortal · Cold Xianxia',
    description: '冷峻苍青的修仙史诗，强调荒阔天地、孤绝人物与高反差灵力光。',
    prompt:
      'cold xianxia epic, vast desolate landscapes, cyan-gray atmosphere, solitary heroic silhouette, sharp spiritual energy highlights, weathered Chinese fantasy architecture, cinematic Chinese 3D animation, consistent character materials',
    color: '#516b78',
    tags: ['修仙', '苍青', '史诗'],
  },
  光阴之外: {
    enName: 'Beyond Time · Dark Xianxia',
    description: '暗色末世修仙质感，雾霭、青黑阴影与危险的红色点光形成压迫感。',
    prompt:
      'dark post-apocalyptic xianxia, blue-black fog, restrained crimson accents, contaminated wilderness, ominous volumetric atmosphere, hard survival mood, cinematic Chinese 3D animation, coherent costume continuity',
    color: '#45576c',
    tags: ['暗黑', '雾霭', '末世修仙'],
  },
  凡人修仙传: {
    enName: "A Record of a Mortal's Journey · Grounded Xianxia",
    description: '写实克制的修仙世界，服饰材质、自然光与古建筑细节更接近真实摄影。',
    prompt:
      'grounded realistic xianxia, natural skin and cloth materials, restrained earth palette, historically inspired Chinese architecture, motivated warm practical light, subtle atmospheric perspective, premium Chinese 3D animation, stable facial identity',
    color: '#7b674c',
    tags: ['写实', '古建', '自然光'],
  },
  剑来第2季: {
    enName: 'Sword of Coming · Poetic Ink',
    description: '诗性东方山水与水墨气韵并重，留白、青绿山色和剑意构图清晰。',
    prompt:
      'poetic Chinese fantasy, ink-wash inspired landscape, mineral green mountains, elegant negative space, calligraphic motion, restrained mist, lyrical sword intent, painterly cinematic composition, refined Chinese animation',
    color: '#52786b',
    tags: ['水墨', '山水', '剑意'],
  },
  吞噬星空: {
    enName: 'Swallowed Star · Cosmic Sci-fi',
    description: '蓝银金属与深空能量构成未来感，强调巨构、战甲表面和宇宙尺度。',
    prompt:
      'cosmic Chinese science fiction, blue-silver powered armor, deep-space megastructures, holographic interfaces, physically based metal, luminous energy trails, grand scale, cinematic 3D animation, clean silhouette continuity',
    color: '#3d6f9c',
    tags: ['科幻', '深空', '机甲'],
  },
  大主宰: {
    enName: 'The Great Ruler · Spiritual Fantasy',
    description: '通透灵力、华丽服饰与云海仙域结合，整体明亮而具有少年冒险感。',
    prompt:
      'luminous oriental fantasy, flowing spiritual energy, ornate but readable costume design, celestial cloud realms, bright blue-gold palette, youthful adventure mood, premium Chinese 3D animation, clean facial continuity',
    color: '#7087b7',
    tags: ['灵力', '云海', '少年感'],
  },
  完美世界: {
    enName: 'Perfect World · Mythic Grandeur',
    description: '金色神辉、上古遗迹与巨大生灵共同营造神话级尺度和强烈冲击力。',
    prompt:
      'mythic Chinese fantasy grandeur, ancient ruins, monumental creatures, radiant golden divine light, dramatic clouds, heroic low-angle composition, richly detailed 3D animation, epic scale, coherent character identity',
    color: '#a47847',
    tags: ['神话', '金色', '巨构'],
  },
  将夜: {
    enName: 'Ever Night · Cinematic Wuxia',
    description: '电影化武侠写实，雪夜、烛火与粗粝材质形成沉稳的冷暖对比。',
    prompt:
      'cinematic realistic wuxia, cold snowy exteriors, warm candlelit interiors, tactile cloth and leather, restrained earth tones, natural lens depth, grounded Chinese architecture, premium 3D animation, subtle film grain',
    color: '#6c6257',
    tags: ['武侠', '雪夜', '冷暖'],
  },
  择天记: {
    enName: 'Fighter of the Destiny · Jade Elegance',
    description: '清雅玉色与学院式仙侠美术，光线柔和，人物造型干净精致。',
    prompt:
      'elegant academy xianxia, jade-white and pale blue palette, soft daylight, refined youthful character design, clean ceremonial architecture, delicate fabric detail, graceful cinematic composition, polished Chinese 3D animation',
    color: '#73999b',
    tags: ['清雅', '玉色', '学院仙侠'],
  },
  搜神记: {
    enName: 'Tales of Gods · Primal Myth',
    description: '上古洪荒、青铜器与大地色为主，具有原始神话和部族史诗的厚重感。',
    prompt:
      'primal Chinese mythology, bronze ritual artifacts, earthen ochre palette, ancient tribal settlements, monumental wilderness, smoky firelight, rugged tactile surfaces, epic Chinese 3D animation',
    color: '#806249',
    tags: ['洪荒', '青铜', '部族'],
  },
  斗破苍穹: {
    enName: 'Battle Through the Heavens · Flame Combat',
    description: '高饱和火焰斗气与高速战斗构图，重视能量层次和动作可读性。',
    prompt:
      'dynamic xuanhuan combat, layered orange-gold flame energy, readable martial arts silhouette, strong anticipation and impact, sweeping fantasy terrain, cinematic Chinese 3D animation, controlled motion blur, consistent costume',
    color: '#a65d3f',
    tags: ['火焰', '斗气', '战斗'],
  },
  星辰变: {
    enName: 'Stellar Transformations · Nebula Fantasy',
    description: '深蓝星海与紫色星云包围东方奇幻人物，空间感辽阔而通透。',
    prompt:
      'celestial cultivation fantasy, deep blue star fields, violet nebula glow, crystalline energy, vast cosmic depth, elegant oriental costume, cinematic Chinese 3D animation, luminous but controlled highlights',
    color: '#5765a1',
    tags: ['星海', '星云', '宇宙修仙'],
  },
  沧元图: {
    enName: 'The Demon Hunter · Graphic Ink 3D',
    description: '强烈水墨笔触、概括色块与三维空间结合，画面节奏鲜明而富有绘画感。',
    prompt:
      'graphic ink-brush Chinese 3D animation, bold painted strokes, simplified color blocks, expressive silhouette, dynamic perspective, deep red and charcoal accents, painterly texture, stable character design',
    color: '#8c554e',
    tags: ['水墨3D', '笔触', '概括色块'],
  },
  灵笼: {
    enName: 'Ling Cage · Industrial Dystopia',
    description: '工业废土、冷灰金属与危险红光组成硬核末世科幻，材质细节密集。',
    prompt:
      'industrial dystopian science fiction, cold gray machinery, weathered metal, hazardous red warning lights, ruined megastructure, survival atmosphere, realistic Chinese 3D animation, cinematic depth, coherent gear design',
    color: '#59656b',
    tags: ['废土', '工业', '末世科幻'],
  },
  牧神记: {
    enName: 'Tales of Herding Gods · Colorful Oriental Fantasy',
    description: '瑰丽高饱和东方幻想，奇诡生灵、绚烂法术与活泼冒险气质并存。',
    prompt:
      'colorful oriental fantasy adventure, jewel-tone palette, whimsical mythical creatures, luminous magic, playful wide-angle composition, richly layered environment, premium Chinese 3D animation, coherent character proportions',
    color: '#8c668f',
    tags: ['瑰丽', '奇诡', '冒险'],
  },
  盘龙: {
    enName: 'Coiling Dragon · Western Fantasy',
    description: '中世纪石城、重甲与魔法光效形成西方奇幻质感，轮廓厚重清晰。',
    prompt:
      'western medieval fantasy in Chinese 3D animation, stone citadel, weighty armor, ancient forest, controlled magic glow, dramatic overcast sky, tactile materials, heroic readable silhouette, cinematic composition',
    color: '#6b6554',
    tags: ['西幻', '重甲', '石城'],
  },
  '神墓·年': {
    enName: 'Tomb of Fallen Gods · Dark Epic',
    description: '墓葬遗迹、黑红能量和苍凉天地构成沉重的暗黑神话史诗。',
    prompt:
      'dark mythic epic, ancient tomb ruins, charcoal and deep crimson energy, desolate sky, weathered stone, ominous backlight, monumental Chinese fantasy, cinematic 3D animation, strong silhouette continuity',
    color: '#704b50',
    tags: ['暗黑', '墓葬', '黑红'],
  },
  诛仙: {
    enName: 'Jade Dynasty · Misty Xianxia',
    description: '雾青山水、竹林与柔和剑光营造清冷诗意，人物情绪更含蓄。',
    prompt:
      'misty poetic xianxia, teal mountain haze, bamboo forests, soft sword light, restrained emotional performance, elegant flowing costume, lyrical cinematic composition, premium Chinese 3D animation, stable facial identity',
    color: '#527a7a',
    tags: ['雾青', '竹林', '诗意'],
  },
};

const STYLE_PROMPT_MODULE_KEYS = [
  'render',
  'video',
  'character',
  'face',
  'hair',
  'costume',
  'accessory',
  'environment',
  'camera',
  'motion',
  'combat',
  'lighting',
  'color',
  'continuity',
];

const ANIME_STYLE_TRAITS = {
  仙逆: {
    face: 'lean mature oval face, restrained narrow eyes, straight brows, sharp but natural jaw',
    hair: 'dark long hair gathered high with controlled loose temple locks',
    costume:
      'weathered layered cultivator robes, narrow sleeves, dark belt and restrained metal fasteners',
    camera:
      'lonely wide landscapes, compressed telephoto confrontations and decisive low-angle hero frames',
    combat:
      'cold sword intent, economical footwork, precise counterattacks and thin cyan energy arcs',
    lighting: 'hard cyan rim against charcoal atmosphere with sparse warm practicals',
  },
  光阴之外: {
    face: 'gaunt survival-worn face, guarded eyes, subtle under-eye fatigue and firm jaw',
    hair: 'uneven wind-beaten dark hair with practical tied sections',
    costume:
      'patched survival robes, protective leather layers, toxin-worn edges and functional pouches',
    camera:
      'oppressive close lenses, obstructed foregrounds and slow reveals through contaminated fog',
    combat:
      'ambush tactics, short brutal exchanges, improvised weapons and dangerous crimson contamination effects',
    lighting: 'blue-black low key light cut by hazardous crimson points and dirty fog',
  },
  凡人修仙传: {
    face: 'natural East Asian facial anatomy, modest eyes, stable cheek and jaw proportions, restrained expression',
    hair: 'historically grounded tied hair, clean hairline and realistic strand weight',
    costume:
      'practical period robes with woven cloth, believable layer order, modest ornament and use wear',
    camera: 'grounded eye-level lenses, natural depth and patient observational framing',
    combat:
      'tactical talisman and sword exchanges with clear distance, preparation, release and consequence',
    lighting: 'soft natural daylight or motivated candlelight with realistic skin response',
  },
  剑来第2季: {
    face: 'youthful angular face, clear brows and calm focused eyes rendered with painterly restraint',
    hair: 'calligraphic dark hair masses, long directional locks following sword movement',
    costume:
      'scholar-swordsman layers with broad graphic shapes, mineral-green accents and clean cloth rhythm',
    camera:
      'poetic negative space, lateral landscape tracks and sudden ink-brush perspective changes',
    combat:
      'readable sword forms shaped like calligraphy, held anticipation followed by one decisive line',
    lighting: 'mist-softened daylight, mineral-green bounce and sparse white sword highlights',
  },
  吞噬星空: {
    face: 'heroic realistic young face, strong brow ridge, precise eye reflections and stable helmet fit',
    hair: 'short engineered silhouette that remains readable under helmets and high acceleration',
    costume:
      'segmented blue-silver powered armor with believable joints, seals, wear and luminous system hierarchy',
    camera:
      'large-format cosmic scale, cockpit inserts, fast pursuit tracking and clean orbital geography',
    combat:
      'high-speed three-dimensional pursuit, readable armor thrusters, weapon recoil and layered energy impacts',
    lighting:
      'cold star key, blue-white emissive armor accents and controlled gold highlights on metal',
  },
  大主宰: {
    face: 'refined youthful face, bright confident eyes, soft jaw and clear expression shapes',
    hair: 'polished long hair with buoyant crown volume and graceful ribbon-controlled motion',
    costume:
      'ornate blue-gold spiritual robes with readable layer hierarchy, embroidery zones and light fabric',
    camera: 'buoyant crane moves, cloud-realm parallax and heroic adventure wides',
    combat:
      'flowing spiritual seals, aerial footwork, layered formations and clean blue-gold energy hierarchy',
    lighting: 'luminous high-key daylight, cloud bounce and soft golden spiritual rim',
  },
  完美世界: {
    face: 'strong youthful heroic face, wide determined eyes, pronounced brows and sculpted jaw',
    hair: 'wild but designed dark locks with clear primary spikes and wind-driven secondary strands',
    costume:
      'mythic battle garments, ancient gold armor accents, fur or leather weight and ceremonial motifs',
    camera: 'monumental low angles, extreme scale reveals and wide-lens creature confrontations',
    combat:
      'powerful grounded impacts, giant-creature scale, readable leap arcs and restrained golden divine effects',
    lighting: 'radiant golden god rays, dramatic cloud breaks and deep sculpted shadow',
  },
  将夜: {
    face: 'cinematic human proportions, weathered skin, restrained eyes and subtly asymmetrical natural features',
    hair: 'practical period hair with snow, dampness and believable loose strands',
    costume:
      'tactile wool, leather and layered winter robes with grime, stitching and functional fastening',
    camera:
      'natural lensing, slow dolly tension, shoulder-level coverage and spatially grounded sword exchanges',
    combat:
      'weighty wuxia footwork, short sword arcs, slips on snow and physical environmental interaction',
    lighting: 'cold snow ambience balanced by warm candle, fire and window practicals',
  },
  择天记: {
    face: 'clean elegant youthful face, refined almond eyes, smooth jaw and calm scholarly expression',
    hair: 'neat academy hairstyle with precise crown, side locks and restrained jade ornament',
    costume:
      'jade-white ceremonial academy robes, delicate trim, clean layering and graceful sleeves',
    camera: 'symmetrical ceremonial compositions, gentle push-ins and elegant courtyard tracking',
    combat: 'disciplined sword forms, formation geometry and light-footed defensive exchanges',
    lighting: 'soft jade daylight, pale blue ambience and delicate pearlescent highlights',
  },
  搜神记: {
    face: 'rugged primal face, broad cheekbones, sun-worn skin and strong tribal identity marks',
    hair: 'coarse braided or bound hair with bone, bronze and fiber attachments',
    costume:
      'hide, woven fiber, bronze ritual plates and earth-dyed cloth with functional tribal construction',
    camera: 'monumental wilderness tableaux, fire-circle staging and low handheld ritual proximity',
    combat:
      'heavy spear, axe and shield exchanges with planted weight, group tactics and dust interaction',
    lighting: 'smoky fire key, ochre sun, bronze glints and deep earthen shadow',
  },
  斗破苍穹: {
    face: 'sharp confident youth face, focused eyes, defined brows and stable heroic proportions',
    hair: 'energetic swept dark hair with clear spikes that trail acceleration without changing shape',
    costume:
      'dark fitted martial layers, protective bracers, flame-resistant hems and controlled gold-red accents',
    camera:
      'fast tracking with clear screen direction, orbit only at power-up beats and wide geography resets',
    combat:
      'martial anticipation, footwork, contact and recovery with layered flame energy that never hides anatomy',
    lighting: 'orange-gold flame key against cool environment fill with protected face exposure',
  },
  星辰变: {
    face: 'clean heroic face with calm eyes, defined jaw and cool nebula reflections',
    hair: 'long dark hair organized into smooth celestial arcs with low-gravity secondary motion',
    costume:
      'elegant dark-blue cultivation layers with crystalline clasps and restrained violet-silver ornament',
    camera:
      'vast cosmic establishing shots, slow orbital parallax and rapid but readable celestial travel',
    combat:
      'three-dimensional aerial exchanges, crystalline energy paths and clearly staged distance changes',
    lighting: 'deep blue star ambience, violet nebula rim and controlled crystalline highlights',
  },
  沧元图: {
    face: 'graphic angular face, bold eyebrow and eye shapes, simplified planes with stable identity',
    hair: 'large ink-brush hair masses with sharp directional tips and expressive painted breakup',
    costume:
      'graphic robe blocks, broad value separation and restrained red accents instead of micro-patterns',
    camera: 'dynamic painted perspective, diagonal staging and intentional frame-edge brush energy',
    combat:
      'silhouette-first martial poses, explosive line-of-action, ink impact shapes and clear contact frames',
    lighting: 'painted value masses, charcoal shadow and focused deep-red or pale rim accents',
  },
  灵笼: {
    face: 'realistic survival face, specific bone structure, skin wear, fatigue and precise eye moisture',
    hair: 'practical short or tied hair affected by helmet pressure, sweat and dusty environment',
    costume:
      'industrial survival suit with layered armor, seals, buckles, cables and believable equipment mounting',
    camera:
      'tense shoulder coverage, industrial depth, controlled handheld danger and scale reveals',
    combat: 'squad tactics, firearm recoil, heavy exosuit momentum and readable cover geography',
    lighting: 'cold industrial overheads, hazardous red alarms, headlamps and volumetric dust',
  },
  牧神记: {
    face: 'lively youthful face, expressive brows, playful eyes and distinctive rounded-to-angular shape rhythm',
    hair: 'animated sweeping locks with whimsical tied sections and colorful small ornaments',
    costume:
      'jewel-tone oriental adventure layers, asymmetrical but readable shapes and handcrafted fantasy accessories',
    camera:
      'playful wide-angle discovery, energetic push-throughs and layered creature-realm reveals',
    combat:
      'inventive magical problem-solving, elastic pose changes, creature interaction and colorful but separated effects',
    lighting: 'jewel-toned magical bounce, bright motivated accents and warm adventurous key light',
  },
  盘龙: {
    face: 'western-fantasy heroic proportions, strong jaw, deep-set eyes and weathered natural skin',
    hair: 'thick practical medieval hair with wind weight and helmet-aware silhouette',
    costume:
      'weighty plate and leather construction, chainmail joints, heraldic cloth and believable weapon rig',
    camera:
      'heroic medieval wides, restrained crane reveals and grounded low-angle formation coverage',
    combat:
      'heavy weapon inertia, shield timing, planted armored footwork and controlled magic support',
    lighting: 'dramatic overcast sky, warm torch practicals and cool metal reflections',
  },
  '神墓·年': {
    face: 'solemn angular face, deep-set eyes, pale weathered skin and controlled grief',
    hair: 'long dark wind-swept masses with sparse crimson rim accents',
    costume:
      'dark ancient battle robes, worn armor fragments, burial motifs and restrained crimson bindings',
    camera:
      'slow monumental approaches, extreme ruin scale and held silhouettes against desolate sky',
    combat:
      'heavy mythic strikes, deliberate pauses, large spatial consequences and restrained black-crimson energy',
    lighting: 'ominous backlight, charcoal atmosphere and narrow deep-crimson energy accents',
  },
  诛仙: {
    face: 'delicate restrained face, calm almond eyes, soft jaw and subtle emotion preserved across close-ups',
    hair: 'elegant long dark hair, clean temple locks and ribbon-guided motion in mountain wind',
    costume:
      'flowing teal-white xianxia layers, fine woven hems and minimal jade or silver ornament',
    camera: 'lyrical landscape wides, bamboo foreground parallax and slow emotional push-ins',
    combat: 'graceful sword arcs, airborne turns with clear landing logic and soft light trails',
    lighting:
      'mist-diffused teal daylight, gentle moon rim and restrained warm interior practicals',
  },
};

function buildAnimePromptModules(series, profile) {
  const trait = ANIME_STYLE_TRAITS[series] || {};
  const styleDna = cleanAssetText(profile.prompt, DEFAULT_ANIME_STYLE_PROFILE.prompt, 3800);
  return {
    render: `${styleDna}; feature-animation finish, controlled detail hierarchy, physically readable surfaces, clean silhouettes at thumbnail scale`,
    video:
      'commercial cinematic animation, stable geometry and textures between frames, intentional 24 fps timing, controlled motion blur, no temporal shimmer or model drift',
    character:
      'production character model sheet, fixed head-to-body ratio, shoulder width, limb length, posture and silhouette; age, role and temperament remain readable in every angle',
    face:
      trait.face ||
      'stable East Asian facial identity, fixed face outline, jaw, brow, eye spacing, nose bridge and lip proportions; expressions preserve bone structure',
    hair:
      trait.hair ||
      'designed primary hair mass, stable hairline and parting, readable secondary locks, physically coherent overlap motion and no random strand regeneration',
    costume:
      trait.costume ||
      'layered costume with explicit construction, seam, fastening, fabric weight, wear and color blocking; identical layer order and pattern in every shot',
    accessory:
      'hero accessories and weapons use fixed attachment points, scale, material, handedness and ornament count; each object has narrative purpose and never floats or mutates',
    environment: `${styleDna}; three-layer depth, believable scale, culturally coherent architecture, tactile terrain and props arranged to support character blocking`,
    camera:
      trait.camera ||
      'story-motivated focal length and camera height, readable foreground-midground-background staging, stable eyelines, screen direction and 180-degree axis',
    motion:
      'clear anticipation, action, contact and recovery; weight passes through hips and planted feet; cloth, hair and accessories use controlled overlapping secondary motion',
    combat:
      trait.combat ||
      'readable combat geography, tactical attack-defense beats, clean silhouette at contact, sparse impact accents and effects that reveal rather than hide choreography',
    lighting:
      trait.lighting ||
      'motivated key, shaped fill and restrained rim, stable direction and exposure, protected facial readability, volumetrics used only for depth and emphasis',
    color: `${profile.tags?.join(', ') || 'cinematic'} color script; one dominant family and one narrative accent, stable skin and costume identity colors, controlled saturation and highlight roll-off`,
    continuity:
      'lock face landmarks, hairstyle, costume layers, accessories, weapon hand, body scale, location layout, screen direction, lighting, weather and damage state across all shots',
  };
}

function animeStyleId(series) {
  return `anime_${createHash('sha256').update(String(series)).digest('hex').slice(0, 18)}`;
}

function normalizeStyleTags(value) {
  return normalizeAssetTags(value).slice(0, 8);
}

function normalizeStylePromptModules(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    STYLE_PROMPT_MODULE_KEYS.map((key) => [key, cleanAssetText(source[key], '', 4000)]).filter(
      ([, text]) => text,
    ),
  );
}

function publicStyleItem(item) {
  const id = /^[A-Za-z0-9_-]{6,80}$/.test(String(item?.id || ''))
    ? String(item.id)
    : animeStyleId(item?.source?.series || randomUUID());
  const source =
    item?.source && item.source.kind === 'anime-library'
      ? {
          kind: 'anime-library',
          series: cleanAssetText(item.source.series, '本机作品', 120),
          fileName: cleanAssetText(item.source.fileName, '', 220),
          sourcePath: cleanAssetText(item.source.sourcePath, '', 1200),
          modifiedAt: Math.max(0, Number(item.source.modifiedAt) || 0),
          capturedAt: Math.max(0, Number(item.source.capturedAt) || 0),
          frameSecond: Math.max(0, Number(item.source.frameSecond) || 0),
        }
      : undefined;
  const thumbnailFile = /^[A-Za-z0-9_.-]{6,180}$/.test(String(item?.thumbnailFile || ''))
    ? String(item.thumbnailFile)
    : '';
  return {
    id,
    name: cleanAssetText(
      item?.name,
      source?.series ? `${source.series} · 原片风格` : '本机视频风格',
      120,
    ),
    enName: cleanAssetText(item?.enName, DEFAULT_ANIME_STYLE_PROFILE.enName, 160),
    category: [
      'image',
      'video',
      'character',
      'face',
      'hair',
      'costume',
      'environment',
      'camera',
      'action',
      'light',
      'color',
    ].includes(item?.category)
      ? item.category
      : 'image',
    target: ['image', 'video', 'both'].includes(item?.target) ? item.target : 'both',
    description: cleanAssetText(item?.description, DEFAULT_ANIME_STYLE_PROFILE.description, 1200),
    enDescription: cleanAssetText(
      item?.enDescription,
      DEFAULT_ANIME_STYLE_PROFILE.enDescription,
      1200,
    ),
    prompt: cleanAssetText(item?.prompt, DEFAULT_ANIME_STYLE_PROFILE.prompt, 4000),
    promptModules: normalizeStylePromptModules(item?.promptModules),
    negative: cleanAssetText(item?.negative, DEFAULT_ANIME_STYLE_PROFILE.negative, 2400),
    color: /^#[0-9a-f]{6}$/i.test(String(item?.color || ''))
      ? String(item.color)
      : DEFAULT_ANIME_STYLE_PROFILE.color,
    tags: normalizeStyleTags(item?.tags),
    custom: true,
    source,
    thumbnailFile,
    imageUrl: thumbnailFile ? `/style-library/thumbnails/${encodeURIComponent(id)}` : '',
  };
}

async function readStyleLibrary() {
  try {
    const parsed = JSON.parse(await readFile(STYLE_LIBRARY_INDEX, 'utf8'));
    const items = Array.isArray(parsed?.items) ? parsed.items.map(publicStyleItem) : [];
    const ignoredSeries = Array.isArray(parsed?.ignoredSeries)
      ? parsed.ignoredSeries.map((item) => cleanAssetText(item, '', 120)).filter(Boolean)
      : [];
    return {
      version: 1,
      sourceRoot: animeLibraryRoot,
      items,
      ignoredSeries,
      updatedAt: Number(parsed?.updatedAt) || Date.now(),
    };
  } catch {
    return {
      version: 1,
      sourceRoot: animeLibraryRoot,
      items: [],
      ignoredSeries: [],
      updatedAt: Date.now(),
    };
  }
}

async function saveStyleLibrary(library) {
  await mkdir(STYLE_LIBRARY_FILES, { recursive: true });
  const clean = {
    version: 1,
    sourceRoot: animeLibraryRoot,
    ignoredSeries: [
      ...new Set(
        (library.ignoredSeries || []).map((item) => cleanAssetText(item, '', 120)).filter(Boolean),
      ),
    ],
    items: (library.items || []).map((item) => {
      const normalized = publicStyleItem(item);
      return { ...normalized, imageUrl: undefined };
    }),
    updatedAt: Date.now(),
  };
  await writeFile(STYLE_LIBRARY_INDEX, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

function mutateStyleLibrary(mutator) {
  const task = styleLibraryWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const library = await readStyleLibrary();
      const result = await mutator(library);
      await saveStyleLibrary(library);
      return result;
    });
  styleLibraryWriteQueue = task;
  return task;
}

async function collectVideoSources(directory, depth = 0, output = []) {
  if (depth > 4 || output.length >= 800) return output;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (output.length >= 800) break;
    if (entry.isSymbolicLink()) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await collectVideoSources(fullPath, depth + 1, output);
    else if (entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      const info = await stat(fullPath);
      output.push({
        path: fullPath,
        fileName: entry.name,
        size: info.size,
        modifiedAt: info.mtimeMs,
      });
    }
  }
  return output;
}

async function extractAnimeFrame(sourcePath, destinationPath) {
  if (!existsSync(LOCAL_FFMPEG_PATH)) throw new Error('缺少本地 ffmpeg，无法从视频截取风格封面。');
  await mkdir(STYLE_LIBRARY_FILES, { recursive: true });
  const attempts = [240, 90];
  let lastError = '';
  for (const second of attempts) {
    const result = await execute(
      LOCAL_FFMPEG_PATH,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(second),
        '-i',
        sourcePath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'crop=iw:ih*0.88:0:0,scale=960:540:force_original_aspect_ratio=increase,crop=960:540',
        '-q:v',
        '3',
        '-y',
        destinationPath,
      ],
      '',
      120000,
      { maxOutput: 200000 },
    );
    try {
      const created = await stat(destinationPath);
      if (result.code === 0 && created.size > 8000) return second;
    } catch {
      // Try the earlier fallback frame below.
    }
    lastError = result.stderr || result.stdout || `ffmpeg 退出码 ${result.code}`;
  }
  await unlink(destinationPath).catch(() => undefined);
  throw new Error(cleanAssetText(lastError, '视频无法解码。', 600));
}

async function syncAnimeStyleLibrary() {
  if (!animeLibraryRoot || !existsSync(animeLibraryRoot))
    throw new Error(`未找到本机动漫目录：${animeLibraryRoot || '未配置'}`);
  if (!existsSync(LOCAL_FFMPEG_PATH))
    throw new Error('缺少 tools/ffmpeg.exe，请先运行本地依赖安装。');
  const directories = (await readdir(animeLibraryRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const existingLibrary = await readStyleLibrary();
  const existingById = new Map(existingLibrary.items.map((item) => [item.id, item]));
  const synced = [];
  const errors = [];
  const ignoredSeries = new Set(existingLibrary.ignoredSeries || []);

  for (const directory of directories) {
    if (ignoredSeries.has(directory.name)) continue;
    try {
      const videos = await collectVideoSources(join(animeLibraryRoot, directory.name));
      const source = videos.sort((a, b) => b.modifiedAt - a.modifiedAt || b.size - a.size)[0];
      if (!source) throw new Error('目录中没有支持的视频文件。');
      const id = animeStyleId(directory.name);
      const previous = existingById.get(id);
      const thumbnailFile = `${id}.jpg`;
      const thumbnailPath = join(STYLE_LIBRARY_FILES, thumbnailFile);
      const unchanged =
        previous?.source?.sourcePath === source.path &&
        Number(previous?.source?.modifiedAt) === Number(source.modifiedAt) &&
        existsSync(thumbnailPath);
      const frameSecond = unchanged
        ? Number(previous.source.frameSecond) || 240
        : await extractAnimeFrame(source.path, thumbnailPath);
      const profile = {
        ...DEFAULT_ANIME_STYLE_PROFILE,
        ...(ANIME_STYLE_PROFILES[directory.name] || {}),
      };
      const generated = {
        id,
        name: `${directory.name} · 原片风格`,
        enName: profile.enName,
        category: 'image',
        target: 'both',
        description: profile.description,
        enDescription: profile.enDescription || DEFAULT_ANIME_STYLE_PROFILE.enDescription,
        prompt: profile.prompt,
        promptModules: buildAnimePromptModules(directory.name, profile),
        negative: profile.negative || DEFAULT_ANIME_STYLE_PROFILE.negative,
        color: profile.color,
        tags: profile.tags,
        custom: true,
        thumbnailFile,
        source: {
          kind: 'anime-library',
          series: directory.name,
          fileName: source.fileName,
          sourcePath: source.path,
          modifiedAt: source.modifiedAt,
          capturedAt: unchanged ? Number(previous.source.capturedAt) || Date.now() : Date.now(),
          frameSecond,
        },
      };
      const item = publicStyleItem(
        previous
          ? {
              ...generated,
              name: previous.name,
              enName: previous.enName,
              category: previous.category,
              target: previous.target,
              description: previous.description,
              enDescription: previous.enDescription,
              prompt: previous.prompt,
              promptModules: { ...generated.promptModules, ...(previous.promptModules || {}) },
              negative: previous.negative,
              color: previous.color,
              tags: previous.tags,
            }
          : generated,
      );
      synced.push(item);
    } catch (error) {
      errors.push({
        series: directory.name,
        message: error instanceof Error ? error.message : '风格封面提取失败。',
      });
    }
  }

  const library = {
    version: 1,
    sourceRoot: animeLibraryRoot,
    items: synced,
    ignoredSeries: [...ignoredSeries],
    updatedAt: Date.now(),
  };
  await saveStyleLibrary(library);
  return { ...library, items: synced.map(publicStyleItem), errors };
}

function styleIdFromPath(pathname) {
  const match = /^\/style-library\/items\/([A-Za-z0-9_-]{6,80})$/.exec(pathname);
  return match?.[1] || '';
}

function normalizeProjectName(value, fallback = '未命名动漫项目') {
  const clean = String(value || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (clean || fallback).slice(0, 100);
}

function normalizedManagedProjectCoverPath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return '';
    }
    const actualPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (
      !LOCAL_BRIDGE_HOSTS.has(normalizedHostname(parsed.hostname)) ||
      actualPort !== PORT ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return '';
    }
    pathname = parsed.pathname;
  }
  if (/^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/.test(pathname)) return pathname;
  if (/^\/media-preview\/files\/[A-Za-z0-9_-]{12,80}\.webp$/.test(pathname)) {
    return pathname;
  }
  return '';
}

function normalizedProjectRequestId(value) {
  const requestId = String(value || '').trim();
  if (!requestId) return '';
  if (!PROJECT_REQUEST_ID_RE.test(requestId)) {
    throw new Error('requestId 格式无效。');
  }
  return requestId;
}

function deterministicCatalogId(prefix, requestId) {
  return requestId
    ? `${prefix}_${createHash('sha256').update(requestId).digest('hex').slice(0, 24)}`
    : `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function catalogCreationRequestKey(kind, requestId, scope = '', implicitSeed = '') {
  if (!requestId && !implicitSeed) {
    throw new Error('创建项目必须提供 requestId 或 expectedCatalogRevision。');
  }
  return `${kind}_${createHash('sha256')
    .update(`${scope}\0${requestId || `implicit:${implicitSeed}`}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function managedProjectCoverReference(value) {
  const url = normalizedManagedProjectCoverPath(value);
  if (!url) return null;
  const assetId = /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/u.exec(url)?.[1];
  if (assetId) return { url, assetId };
  const previewId = /^\/media-preview\/files\/([A-Za-z0-9_-]{12,80})\.webp$/u.exec(url)?.[1];
  return previewId ? { url, assetId: previewId } : null;
}

function automaticProjectCover(workspace, manifest) {
  const workspaces = workspace?.workspaces;
  if (!workspaces || typeof workspaces !== 'object' || Array.isArray(workspaces)) return null;
  const preferredWorkspace = ['script', 'views', 'video', 'audio'].includes(
    String(manifest?.currentWorkspace || ''),
  )
    ? String(manifest.currentWorkspace)
    : 'views';
  const workspaceIds = [
    preferredWorkspace,
    'views',
    'script',
    'video',
    'audio',
    ...Object.keys(workspaces),
  ].filter((value, index, values) => values.indexOf(value) === index);
  for (const workspaceId of workspaceIds) {
    const nodes = Array.isArray(workspaces[workspaceId]?.nodes)
      ? workspaces[workspaceId].nodes
      : [];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      const data = node?.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const kind = String(data.kind || node?.type || '');
      if (kind !== 'image' && kind !== 'views') continue;
      const candidates = [
        data.previewUrl,
        data.imageUrl,
        data.originalUrl,
        ...(Array.isArray(data.images) ? [...data.images].reverse() : []),
      ];
      for (const candidate of candidates) {
        const cover = managedProjectCoverReference(candidate);
        if (cover) return cover;
      }
    }
  }
  return null;
}

function normalizeProjectMeta(item) {
  const id = PROJECT_ID_RE.test(String(item?.id || '')) ? String(item.id) : '';
  if (!id) return null;
  const name = normalizeProjectName(item?.name, id);
  const title = normalizeProjectName(item?.title, name.replace(/\s*[·|｜].*$/, ''));
  const folderId = PROJECT_FOLDER_ID_RE.test(String(item?.folderId || ''))
    ? String(item.folderId)
    : null;
  const coverUrl = normalizedManagedProjectCoverPath(item?.coverUrl);
  const coverAssetId = /^[A-Za-z0-9_-]{6,80}$/.test(String(item?.coverAssetId || ''))
    ? String(item.coverAssetId)
    : '';
  const autoCoverUrl = normalizedManagedProjectCoverPath(item?.autoCoverUrl);
  const autoCoverAssetId = /^[A-Za-z0-9_-]{6,80}$/.test(String(item?.autoCoverAssetId || ''))
    ? String(item.autoCoverAssetId)
    : '';
  const creationRequestId = PROJECT_REQUEST_ID_RE.test(String(item?.creationRequestId || ''))
    ? String(item.creationRequestId)
    : '';
  return {
    id,
    name,
    title,
    mark: String(item?.mark || title.slice(0, 1) || '漫').slice(0, 2),
    createdAt:
      Number.isSafeInteger(item?.createdAt) && item.createdAt >= 0 ? item.createdAt : Date.now(),
    updatedAt: Number.isSafeInteger(item?.updatedAt) && item.updatedAt >= 0 ? item.updatedAt : 0,
    lastSnapshotAt:
      Number.isSafeInteger(item?.lastSnapshotAt) && item.lastSnapshotAt >= 0
        ? item.lastSnapshotAt
        : 0,
    revision: Number.isSafeInteger(item?.revision) && item.revision >= 0 ? item.revision : 0,
    activeWorkspace: ['script', 'views', 'video', 'audio'].includes(
      String(item?.activeWorkspace || ''),
    )
      ? String(item.activeWorkspace)
      : undefined,
    folderId,
    ...(coverUrl ? { coverUrl } : {}),
    ...(coverAssetId ? { coverAssetId } : {}),
    ...(autoCoverUrl ? { autoCoverUrl } : {}),
    ...(autoCoverAssetId ? { autoCoverAssetId } : {}),
    ...(creationRequestId ? { creationRequestId } : {}),
  };
}

function normalizeProjectFolderMeta(item) {
  const id = PROJECT_FOLDER_ID_RE.test(String(item?.id || '')) ? String(item.id) : '';
  if (!id) return null;
  const creationRequestId = PROJECT_REQUEST_ID_RE.test(String(item?.creationRequestId || ''))
    ? String(item.creationRequestId)
    : '';
  return {
    id,
    name: normalizeProjectName(item?.name, '未命名文件夹'),
    createdAt:
      Number.isSafeInteger(item?.createdAt) && item.createdAt >= 0 ? item.createdAt : Date.now(),
    updatedAt: Number.isSafeInteger(item?.updatedAt) && item.updatedAt >= 0 ? item.updatedAt : 0,
    ...(creationRequestId ? { creationRequestId } : {}),
  };
}

function publicProjectCatalog(catalog) {
  return {
    ...catalog,
    primaryProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
    canvasProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
  };
}

const PROJECT_CATALOG_LOCK_FILE = join(PROJECT_LIBRARY_ROOT, '.projects-catalog.lock');
const PROJECT_CATALOG_REAPER_FILE = `${PROJECT_CATALOG_LOCK_FILE}.reaper`;
const PROJECT_CATALOG_LOCK_TIMEOUT_MS = 15_000;
const PROJECT_CATALOG_LOCK_STALE_MS = 5_000;

function projectCatalogLockOwner(token) {
  return JSON.stringify({ version: 1, token, pid: process.pid, createdAt: Date.now() });
}

async function createExclusiveProjectCatalogLock(file, token) {
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(projectCatalogLockOwner(token), 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(file).catch(() => undefined);
    throw error;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function readStableProjectCatalogLock(file) {
  try {
    const before = await stat(file);
    const raw = await readFile(file, 'utf8');
    const after = await stat(file);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      return null;
    }
    const owner = JSON.parse(raw);
    if (
      !owner ||
      typeof owner !== 'object' ||
      typeof owner.token !== 'string' ||
      !Number.isSafeInteger(owner.pid) ||
      !Number.isFinite(owner.createdAt)
    ) {
      return null;
    }
    return { raw, owner, stat: after };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return null;
  }
}

function projectCatalogLockOwnerIsDead(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process exists but cannot be signalled. Only ESRCH is
    // proof that a same-machine owner has exited, so live/unknown locks remain.
    return error?.code === 'ESRCH';
  }
}

async function releaseOwnedProjectCatalogLock(file, token) {
  const current = await readStableProjectCatalogLock(file);
  if (!current || current.owner.token !== token || current.owner.pid !== process.pid) return false;
  try {
    await unlink(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

async function reclaimStaleProjectCatalogLock() {
  const reaperToken = randomUUID();
  try {
    await createExclusiveProjectCatalogLock(PROJECT_CATALOG_REAPER_FILE, reaperToken);
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
  try {
    const observed = await readStableProjectCatalogLock(PROJECT_CATALOG_LOCK_FILE);
    if (!observed) return true;
    const age = Date.now() - Math.max(observed.owner.createdAt, observed.stat.mtimeMs);
    if (age < PROJECT_CATALOG_LOCK_STALE_MS || !projectCatalogLockOwnerIsDead(observed.owner.pid)) {
      return false;
    }
    const confirmed = await readStableProjectCatalogLock(PROJECT_CATALOG_LOCK_FILE);
    if (!confirmed || confirmed.raw !== observed.raw) return false;
    try {
      await unlink(PROJECT_CATALOG_LOCK_FILE);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      throw error;
    }
  } finally {
    await releaseOwnedProjectCatalogLock(PROJECT_CATALOG_REAPER_FILE, reaperToken).catch(
      () => false,
    );
  }
}

async function withProjectCatalogFileLock(action) {
  await mkdir(PROJECT_LIBRARY_ROOT, { recursive: true });
  const token = randomUUID();
  const deadline = Date.now() + PROJECT_CATALOG_LOCK_TIMEOUT_MS;
  while (true) {
    if (!existsSync(PROJECT_CATALOG_REAPER_FILE)) {
      try {
        await createExclusiveProjectCatalogLock(PROJECT_CATALOG_LOCK_FILE, token);
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    await reclaimStaleProjectCatalogLock();
    if (Date.now() >= deadline) {
      throw new Error(
        '画布目录正被另一个 Bridge 使用，等待跨进程保存锁超时；请关闭重复启动的 Bridge 后重试。',
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25 + randomInt(0, 50)));
  }
  let result;
  let actionFailed = false;
  let actionError;
  try {
    result = await action();
  } catch (error) {
    actionFailed = true;
    actionError = error;
  }
  let released = false;
  let releaseFailed = false;
  let releaseError;
  try {
    released = await releaseOwnedProjectCatalogLock(PROJECT_CATALOG_LOCK_FILE, token);
  } catch (error) {
    releaseFailed = true;
    releaseError = error;
  }
  if (actionFailed) throw actionError;
  if (releaseFailed) throw releaseError;
  if (!released) throw new Error('画布目录跨进程保存锁所有权异常，已停止继续写入。');
  return result;
}

function queueProjectCatalogOperation(action) {
  const operation = projectLibraryWriteQueue
    .catch(() => undefined)
    .then(() => withProjectCatalogFileLock(action));
  projectLibraryWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function writeProjectCatalog(catalog) {
  await mkdir(PROJECT_LIBRARY_ROOT, { recursive: true });
  const normalized = (Array.isArray(catalog?.projects) ? catalog.projects : []).map(
    normalizeProjectMeta,
  );
  if (normalized.some((item) => !item)) {
    throw new Error('画布目录包含无效记录，已拒绝覆盖。');
  }
  const folders = (Array.isArray(catalog?.folders) ? catalog.folders : []).map(
    normalizeProjectFolderMeta,
  );
  if (folders.some((item) => !item)) {
    throw new Error('画布文件夹目录包含无效记录，已拒绝覆盖。');
  }
  const folderIds = new Set(folders.map((folder) => folder.id));
  for (const project of normalized) {
    if (project.folderId && !folderIds.has(project.folderId)) project.folderId = null;
  }
  const clean = {
    version: 2,
    catalogRevision:
      (Number.isSafeInteger(catalog?.catalogRevision) && catalog.catalogRevision >= 0
        ? catalog.catalogRevision
        : 0) + 1,
    primaryProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
    projects: normalized,
    folders,
    updatedAt: Date.now(),
  };
  await atomicWriteJson(PROJECT_LIBRARY_INDEX, clean, { maxBytes: MAX_PROJECT_BODY });
  return clean;
}

async function reconcileProjectCatalogFromStorage(projects, folderIds) {
  let changed = false;
  const byId = new Map(projects.map((project) => [project.id, project]));
  const entries = await readdir(PROJECT_LIBRARY_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROJECT_ID_RE.test(entry.name)) continue;
    const id = entry.name;
    if (id !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID && (await projectStorage.isProjectArchived(id))) {
      continue;
    }
    const stored = await projectStorage.readProjectRecord(id);
    if (!stored) continue;
    const manifest = stored.manifest || {};
    const autoCover = automaticProjectCover(stored.workspace, manifest);
    const recovered = normalizeProjectMeta({
      id,
      name: manifest.projectName || stored.workspace?.projectName || id,
      title: manifest.title || manifest.projectName || stored.workspace?.projectName || id,
      mark: manifest.mark,
      createdAt: manifest.createdAt || manifest.updatedAt,
      updatedAt: manifest.updatedAt,
      revision: stored.revision,
      activeWorkspace:
        manifest.activeWorkspace || manifest.currentWorkspace || manifest.workspace || 'views',
      folderId: folderIds.has(manifest.folderId) ? manifest.folderId : null,
      coverUrl: manifest.coverUrl,
      coverAssetId: manifest.coverAssetId,
      autoCoverUrl: autoCover?.url,
      autoCoverAssetId: autoCover?.assetId,
      creationRequestId: manifest.creationRequestId,
    });
    const current = byId.get(id);
    if (!current) {
      projects.push(recovered);
      byId.set(id, recovered);
      changed = true;
      continue;
    }
    if (recovered.revision > current.revision) {
      const synchronized = { ...recovered, createdAt: current.createdAt };
      if (JSON.stringify(synchronized) !== JSON.stringify(current)) {
        Object.assign(current, synchronized);
        changed = true;
      }
    }
  }
  return changed;
}

async function loadProjectCatalogUnlocked() {
  await mkdir(PROJECT_LIBRARY_ROOT, { recursive: true });
  // A configured data root is an independent authority. Do not import the
  // repository's legacy catalog into it: those records remain readable only
  // through the explicit legacy CRUD paths and must never become product-level
  // canvas choices.
  const source = PROJECT_LIBRARY_INDEX;
  const parsed = await readJsonIfExists(source, '画布目录索引');
  if (parsed && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error(`画布目录索引格式无效，已拒绝覆盖：${source}`);
  }
  if (parsed && ![1, 2].includes(Number(parsed.version || 1))) {
    throw new Error(`画布目录索引版本无效，已拒绝覆盖：${source}`);
  }
  if (parsed && !Array.isArray(parsed.projects)) {
    throw new Error(`画布目录索引格式无效，已拒绝覆盖：${source}`);
  }
  if (parsed?.folders !== undefined && !Array.isArray(parsed.folders)) {
    throw new Error(`画布文件夹目录格式无效，已拒绝覆盖：${source}`);
  }
  if (
    parsed?.version === 2 &&
    (parsed.primaryProjectId !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID ||
      (parsed.canvasProjectId !== undefined &&
        parsed.canvasProjectId !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID))
  ) {
    throw new Error(`画布目录索引的主画布引用无效，已拒绝覆盖：${source}`);
  }

  let normalizedProjects = (parsed?.projects ?? []).map(normalizeProjectMeta);
  if (normalizedProjects.some((item) => !item)) {
    throw new Error(`画布目录索引包含无效记录，已拒绝覆盖：${source}`);
  }
  const ids = new Set();
  for (const item of normalizedProjects) {
    if (ids.has(item.id)) {
      throw new Error(`画布目录索引包含重复编号，已拒绝覆盖：${source}`);
    }
    ids.add(item.id);
  }

  const normalizedFolders = (parsed?.folders ?? []).map(normalizeProjectFolderMeta);
  if (normalizedFolders.some((item) => !item)) {
    throw new Error(`画布文件夹目录包含无效记录，已拒绝覆盖：${source}`);
  }
  const folderIds = new Set();
  for (const folder of normalizedFolders) {
    if (folderIds.has(folder.id)) {
      throw new Error(`画布文件夹目录包含重复编号，已拒绝覆盖：${source}`);
    }
    folderIds.add(folder.id);
  }
  let catalogChanged =
    !parsed ||
    parsed.version !== 2 ||
    !Number.isSafeInteger(parsed.catalogRevision) ||
    parsed.catalogRevision < 0 ||
    !Array.isArray(parsed.folders);
  if (await reconcileProjectCatalogFromStorage(normalizedProjects, folderIds)) {
    catalogChanged = true;
  }
  const activeProjects = [];
  for (const project of normalizedProjects) {
    if (
      project.id !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID &&
      (await projectStorage.isProjectArchived(project.id))
    ) {
      catalogChanged = true;
      continue;
    }
    if (project.folderId && !folderIds.has(project.folderId)) {
      project.folderId = null;
      catalogChanged = true;
    }
    activeProjects.push(project);
  }
  normalizedProjects = activeProjects;

  // Keep the historical main canvas as the durable default/compatibility
  // anchor while allowing every separately revisioned project to coexist.
  const ensured = await projectStorage.ensureProject(BRIDGE_PRIMARY_CANVAS_PROJECT_ID, {
    projectName: PRIMARY_CANVAS_NAME,
    workspaceId: PRIMARY_CANVAS_WORKSPACE,
    workspace: { nodes: [], edges: [] },
    manifestPatch: {
      projectName: PRIMARY_CANVAS_NAME,
      name: PRIMARY_CANVAS_NAME,
      title: PRIMARY_CANVAS_NAME,
      workspace: PRIMARY_CANVAS_WORKSPACE,
      currentWorkspace: PRIMARY_CANVAS_WORKSPACE,
      activeWorkspace: PRIMARY_CANVAS_WORKSPACE,
      tabs: [{ ...PRIMARY_CANVAS_TAB }],
      activeTabId: PRIMARY_CANVAS_TAB.id,
      genParams: {},
      activeTags: [],
      assets: [],
    },
  });
  const mainName = normalizeProjectName(
    ensured.manifest?.projectName || ensured.workspace?.projectName,
    PRIMARY_CANVAS_NAME,
  );
  const mainTitle = normalizeProjectName(ensured.manifest?.title, mainName);
  let primaryMeta = normalizedProjects.find((item) => item.id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID);
  const primaryWasUninitialized =
    !parsed || parsed.version !== 2 || parsed.primaryProjectId !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID;
  catalogChanged = catalogChanged || primaryWasUninitialized || source !== PROJECT_LIBRARY_INDEX;
  if (!primaryMeta) {
    primaryMeta = normalizeProjectMeta({
      id: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
      name: mainName,
      title: mainTitle,
      mark: '画',
      createdAt: ensured.savedAt || Date.now(),
      updatedAt: ensured.savedAt,
      revision: ensured.revision,
      activeWorkspace: PRIMARY_CANVAS_WORKSPACE,
    });
    normalizedProjects.push(primaryMeta);
    catalogChanged = true;
  } else {
    const synchronized = normalizeProjectMeta({
      ...primaryMeta,
      name: mainName,
      title: mainTitle,
      updatedAt: Math.max(Number(primaryMeta.updatedAt) || 0, Number(ensured.savedAt) || 0),
      revision: ensured.revision,
      activeWorkspace:
        ensured.manifest?.currentWorkspace ||
        ensured.manifest?.workspace ||
        primaryMeta.activeWorkspace ||
        PRIMARY_CANVAS_WORKSPACE,
    });
    if (JSON.stringify(synchronized) !== JSON.stringify(primaryMeta)) {
      Object.assign(primaryMeta, synchronized);
      catalogChanged = true;
    }
  }
  const catalog = {
    version: 2,
    catalogRevision:
      Number.isSafeInteger(parsed?.catalogRevision) && parsed.catalogRevision >= 0
        ? parsed.catalogRevision
        : 0,
    primaryProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
    projects: normalizedProjects,
    folders: normalizedFolders,
    updatedAt: Number(parsed?.updatedAt) || 0,
  };
  return {
    catalog: catalogChanged ? await writeProjectCatalog(catalog) : catalog,
    initialized: primaryWasUninitialized,
  };
}

function readProjectCatalog() {
  return queueProjectCatalogOperation(async () => {
    const { catalog } = await loadProjectCatalogUnlocked();
    return publicProjectCatalog(catalog);
  });
}

function resolvePrimaryCanvasCatalog() {
  return queueProjectCatalogOperation(async () => {
    const { catalog, initialized } = await loadProjectCatalogUnlocked();
    const publicCatalog = publicProjectCatalog(catalog);
    return {
      ...publicCatalog,
      project: publicCatalog.projects.find((item) => item.id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID),
      claimed: initialized,
    };
  });
}

function mutateProjectCatalogWithResult(mutator) {
  return queueProjectCatalogOperation(async () => {
    const { catalog } = await loadProjectCatalogUnlocked();
    const before = JSON.stringify(catalog);
    const result = await mutator(catalog);
    if (JSON.stringify(catalog) === before) {
      return { result, catalog: publicProjectCatalog(catalog), unchanged: true };
    }
    const savedCatalog = await writeProjectCatalog(catalog);
    return { result, catalog: publicProjectCatalog(savedCatalog), unchanged: false };
  });
}

function assertCatalogRevision(catalog, expectedCatalogRevision) {
  if (
    expectedCatalogRevision !== undefined &&
    (!Number.isSafeInteger(expectedCatalogRevision) || expectedCatalogRevision < 0)
  ) {
    throw new Error('expectedCatalogRevision 格式无效。');
  }
  if (
    Number.isSafeInteger(expectedCatalogRevision) &&
    expectedCatalogRevision !== catalog.catalogRevision
  ) {
    const error = new Error('项目目录已被其他终端更新，请刷新后重试。');
    error.code = 'PROJECT_CATALOG_CONFLICT';
    error.currentCatalogRevision = catalog.catalogRevision;
    throw error;
  }
}

function mutateProjectCatalogAfterCommit(mutator) {
  return queueProjectCatalogOperation(async () => {
    const { catalog } = await loadProjectCatalogUnlocked();
    const before = JSON.stringify(catalog);
    const result = await mutator(catalog);
    const savedCatalog =
      JSON.stringify(catalog) === before ? catalog : await writeProjectCatalog(catalog);
    return { result, catalog: publicProjectCatalog(savedCatalog) };
  }).catch((error) => {
    const committed = new Error(
      error instanceof Error
        ? `项目修订已经提交，但目录索引更新失败：${error.message}`
        : '项目修订已经提交，但目录索引更新失败。',
      { cause: error },
    );
    committed.code = 'PROJECT_CATALOG_UPDATE_FAILED';
    throw committed;
  });
}

async function projectHasArchivedCopy(projectId) {
  if (projectArchiveTombstones.has(projectId)) return true;
  return projectStorage.isProjectArchived(projectId);
}

async function validatedProjectCoverPatch(body) {
  const touchesUrl = Object.prototype.hasOwnProperty.call(body || {}, 'coverUrl');
  const touchesId = Object.prototype.hasOwnProperty.call(body || {}, 'coverAssetId');
  if (!touchesUrl && !touchesId) return {};
  if (
    (touchesUrl && (body.coverUrl === null || body.coverUrl === '')) ||
    (touchesId && (body.coverAssetId === null || body.coverAssetId === ''))
  ) {
    if (
      (!touchesUrl || body.coverUrl === null || body.coverUrl === '') &&
      (!touchesId || body.coverAssetId === null || body.coverAssetId === '')
    ) {
      return { coverUrl: '', coverAssetId: '' };
    }
    throw new Error('清除项目封面时必须同时清除 coverUrl 和 coverAssetId。');
  }

  let coverUrl = normalizedManagedProjectCoverPath(body.coverUrl);
  const coverAssetId = String(body.coverAssetId || '').trim();
  if (!coverUrl && coverAssetId) {
    if (/^asset_[A-Za-z0-9_-]{6,74}$/.test(coverAssetId)) {
      coverUrl = `/asset-library/files/${coverAssetId}`;
    } else if (/^preview_[A-Za-z0-9_-]{4,72}$/.test(coverAssetId)) {
      coverUrl = `/media-preview/files/${coverAssetId}.webp`;
    }
  }
  if (!coverUrl) {
    throw new Error('项目封面只接受当前 Bridge 管理的素材或预览地址。');
  }

  const assetMatch = /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(coverUrl);
  if (assetMatch) {
    const assetId = assetMatch[1];
    if (coverAssetId && coverAssetId !== assetId) throw new Error('项目封面素材编号不匹配。');
    const library = await readAssetLibrary();
    const item = library.items.find(
      (entry) => entry.id === assetId && entry.fileName && String(entry.mime).startsWith('image/'),
    );
    if (!item || !(await stat(managedAssetFilePath(item.fileName)).catch(() => null))?.isFile()) {
      throw new Error('项目封面素材不存在或不是受管图片。');
    }
    return { coverUrl, coverAssetId: assetId };
  }

  const previewMatch = /^\/media-preview\/files\/([A-Za-z0-9_-]{12,80})\.webp$/.exec(coverUrl);
  const previewId = previewMatch?.[1] || '';
  if (!previewId || (coverAssetId && coverAssetId !== previewId)) {
    throw new Error('项目封面预览编号不匹配。');
  }
  const previewFile = await stat(managedPreviewFilePath(`${previewId}.webp`)).catch(() => null);
  if (!previewFile?.isFile()) throw new Error('项目封面预览不存在。');
  return { coverUrl, coverAssetId: previewId };
}

async function saveProjectWorkspace(projectId, body) {
  const workspace = body?.workspace;
  const legacyWorkspace = workspace?.version === 1 && Array.isArray(workspace?.nodes);
  const collaborativeWorkspace =
    workspace?.version === 2 &&
    workspace?.workspaces &&
    typeof workspace.workspaces === 'object' &&
    !Array.isArray(workspace.workspaces);
  if (!legacyWorkspace && !collaborativeWorkspace) throw new Error('项目画布格式无效。');
  if (await projectHasArchivedCopy(projectId))
    throw new Error('项目已经归档，已拒绝过期的自动保存。 ');
  if (projectArchiveTombstones.has(projectId)) throw new Error('项目正在归档，已拒绝自动保存。 ');
  const saved = await projectStorage.saveProject(projectId, body);
  const now = saved.savedAt;
  const fallbackMeta = normalizeProjectMeta({
    id: projectId,
    name: body?.name || workspace.projectName,
    title: body?.title || workspace.projectName,
    mark: body?.mark,
    createdAt: now,
    updatedAt: now,
    revision: saved.revision,
    activeWorkspace: saved.manifest?.currentWorkspace || saved.manifest?.workspace,
  });
  const committed = await mutateProjectCatalogAfterCommit(async (catalog) => {
    let meta = catalog.projects.find((item) => item.id === projectId);
    if (!meta) {
      meta = { ...fallbackMeta };
      catalog.projects.push(meta);
    }
    meta.name = normalizeProjectName(body?.name || workspace.projectName, meta.name);
    meta.title = normalizeProjectName(body?.title || meta.title, meta.title);
    meta.mark = String(body?.mark || meta.mark || meta.title.slice(0, 1)).slice(0, 2);
    meta.updatedAt = now;
    meta.revision = saved.revision;
    meta.activeWorkspace = ['script', 'views', 'video', 'audio'].includes(
      String(saved.manifest?.currentWorkspace || saved.manifest?.workspace || ''),
    )
      ? String(saved.manifest.currentWorkspace || saved.manifest.workspace)
      : meta.activeWorkspace;
    return meta;
  });
  return {
    project: committed.result || fallbackMeta,
    ...saved,
  };
}

function projectIdFromPath(pathname) {
  const match = /^\/projects\/([A-Za-z0-9_-]{2,80})$/.exec(pathname);
  return match?.[1] || '';
}

function projectRestoreIdFromPath(pathname) {
  const match = /^\/projects\/([A-Za-z0-9_-]{2,80})\/restore-latest$/.exec(pathname);
  return match?.[1] || '';
}

function projectDuplicateIdFromPath(pathname) {
  return /^\/projects\/([A-Za-z0-9_-]{2,80})\/duplicate$/.exec(pathname)?.[1] || '';
}

function projectFolderIdFromPath(pathname) {
  return /^\/project-folders\/([A-Za-z0-9_-]{2,80})$/.exec(pathname)?.[1] || '';
}

function projectWorkspaceFromPath(pathname) {
  const match = /^\/projects\/([A-Za-z0-9_-]{2,80})\/workspaces\/(script|views|video|audio)$/.exec(
    pathname,
  );
  return match ? { projectId: match[1], workspaceId: match[2] } : null;
}

function projectTrashIdFromPath(pathname) {
  return /^\/projects\/([A-Za-z0-9_-]{2,80})\/trash$/.exec(pathname)?.[1] || '';
}

function projectWriteErrorStatus(error, fallback = 400) {
  if (error?.code === 'PROJECT_REVISION_CONFLICT') return 409;
  if (error?.code === 'PROJECT_CATALOG_CONFLICT') return 409;
  if (error?.code === 'PROJECT_ARCHIVED') return 410;
  if (error?.code === 'PROJECT_CATALOG_UPDATE_FAILED') return 503;
  return fallback;
}

const pluginDocumentDirectoryCache = new Map();

async function pluginDocumentManifest(pluginId) {
  const cachedDirectory = pluginDocumentDirectoryCache.get(pluginId);
  const candidates = [];
  if (cachedDirectory) candidates.push(cachedDirectory);
  await mkdir(PLUGIN_LIBRARY_ROOT, { recursive: true });
  const entries = await readdir(PLUGIN_LIBRARY_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(PLUGIN_LIBRARY_ROOT, entry.name);
    if (!candidates.includes(directory)) candidates.push(directory);
  }
  for (const directory of candidates.slice(0, 100)) {
    try {
      const manifest = parsePluginManifest(
        JSON.parse(await readFile(join(directory, 'plugin.json'), 'utf8')),
      );
      if (manifest.id !== pluginId) continue;
      pluginDocumentDirectoryCache.set(pluginId, directory);
      await pluginProjectDocumentStore.registerPluginDirectory(pluginId, directory);
      await pluginSharedStyleCoverStore.registerPluginDirectory(pluginId, directory);
      return manifest;
    } catch (error) {
      if (directory === cachedDirectory) pluginDocumentDirectoryCache.delete(pluginId);
      if (error?.code !== 'ENOENT') continue;
    }
  }
  throw new Error('插件不存在或尚未启用。');
}

async function assertPluginProjectDocumentAccess(pluginId) {
  const id = String(pluginId || '').trim();
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) throw new Error('插件 ID 无效。');
  const manifest = await pluginDocumentManifest(id);
  if (!isPluginEngineCompatible(manifest.engine.qiansiCanvas, await readCanvasHostVersion())) {
    throw new Error('插件不存在、目录不匹配或版本不兼容。');
  }
  const state = await readPluginState();
  if (state.enabled[id] !== true) throw new Error('插件不存在或尚未启用。');
  if (!manifest.permissions.includes('storage:project-documents')) {
    throw new Error('插件未申请项目文档存储权限。');
  }
  return id;
}

async function handlePluginProjectDocumentRequest(action, body) {
  const pluginId = await assertPluginProjectDocumentAccess(body?.pluginId);
  const projectId = String(body?.projectId || '').trim();
  if (action === 'status') {
    return pluginProjectDocumentStore.migrationStatus(pluginId, projectId);
  }
  if (action === 'migrate') {
    return pluginProjectDocumentStore.migrate(pluginId, projectId, body?.snapshot);
  }
  if (action === 'complete-migration') {
    return pluginProjectDocumentStore.completeMigration(pluginId, projectId, body?.recordCount);
  }
  const key = String(body?.key || '').trim();
  if (action === 'read') return pluginProjectDocumentStore.read(pluginId, projectId, key);
  if (action === 'write') {
    if (!Object.prototype.hasOwnProperty.call(body || {}, 'value')) {
      throw new Error('插件项目文档写入内容不能为空。');
    }
    return pluginProjectDocumentStore.write(
      pluginId,
      projectId,
      key,
      body.value,
      body.expectedRevision,
    );
  }
  if (action === 'delete') {
    return pluginProjectDocumentStore.delete(pluginId, projectId, key, body.expectedRevision);
  }
  throw new Error('插件项目文档操作无效。');
}

async function assertPluginSharedStyleCoverAccess(pluginId) {
  const id = String(pluginId || '').trim();
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) throw new Error('插件 ID 无效。');
  const manifest = await pluginDocumentManifest(id);
  if (!isPluginEngineCompatible(manifest.engine.qiansiCanvas, await readCanvasHostVersion())) {
    throw new Error('插件不存在、目录不匹配或版本不兼容。');
  }
  const state = await readPluginState();
  if (state.enabled[id] !== true) throw new Error('插件不存在或尚未启用。');
  if (!manifest.permissions.includes('storage:shared-style-covers')) {
    throw new Error('插件未申请共享风格封面存储权限。');
  }
  return id;
}

async function handlePluginSharedStyleCoverRequest(action, body) {
  const pluginId = await assertPluginSharedStyleCoverAccess(body?.pluginId);
  const styleId = String(body?.styleId || '')
    .trim()
    .toLowerCase();
  if (action === 'read') return pluginSharedStyleCoverStore.read(pluginId, styleId);
  if (action === 'write') {
    return pluginSharedStyleCoverStore.write(
      pluginId,
      styleId,
      body?.cover,
      body?.expectedRevision,
    );
  }
  if (action === 'delete') {
    return pluginSharedStyleCoverStore.delete(pluginId, styleId, body?.expectedRevision);
  }
  throw new Error('共享风格封面操作无效。');
}

async function resolveTimelineSource(value, expectedKind) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:'))
    throw new Error('时间线素材必须先保存到素材库，不能直接使用临时 data URL。');
  const assetId = managedAssetIdFromSource(raw, {
    allowedHosts: LOCAL_BRIDGE_HOSTS,
    port: PORT,
  });
  if (!assetId) throw new Error('时间线只接受当前桥素材库中的受管媒体 ID。');
  const library = await readAssetLibrary();
  const item = library.items.find(
    (entry) => entry.id === assetId && entry.fileName && entry.kind === expectedKind,
  );
  if (!item) {
    throw new Error(
      expectedKind === 'audio'
        ? '时间线音频不存在或不是受管音频素材。'
        : '时间线视频不存在或不是受管视频素材。',
    );
  }
  const filePath = managedAssetFilePath(item.fileName);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) throw new Error('时间线中的本机素材文件已经丢失。');
  return filePath;
}

function terminateChildProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (platform() === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

function cancelTimelineRender(id, message = '时间线合成已取消。') {
  const job = timelineRenderJobs.get(id);
  const runtime = timelineRenderProcesses.get(id);
  if (!job) return null;
  if (runtime) {
    clearTimeout(runtime.timer);
    terminateChildProcessTree(runtime.child);
    timelineRenderProcesses.delete(id);
    void unlink(runtime.outputPath).catch(() => undefined);
  }
  if (job.status !== 'ready') {
    job.status = 'error';
    job.progress = 0;
    job.output = message;
    job.updatedAt = Date.now();
  }
  return job;
}

async function startTimelineRender(body) {
  if (!existsSync(LOCAL_FFMPEG_PATH)) throw new Error('缺少本机 FFmpeg，请重新运行一键依赖安装。');
  if (timelineRenderStarting || timelineRenderProcesses.size >= MAX_TIMELINE_RENDER_CONCURRENCY) {
    throw new Error('已有时间线任务正在合成；为保护本机资源，请等待完成或先取消。');
  }
  timelineRenderStarting = true;
  try {
    const rawClips = Array.isArray(body?.clips) ? body.clips : [];
    if (rawClips.length > MAX_TIMELINE_CLIPS) {
      throw new Error(`时间线一次最多合成 ${MAX_TIMELINE_CLIPS} 个片段。`);
    }
    const clips = rawClips.slice(0, MAX_TIMELINE_CLIPS);
    if (!clips.length) throw new Error('时间线中没有可以合成的视频。');
    const inputs = [];
    let totalDuration = 0;
    for (const clip of clips) {
      const duration = Math.max(1, Math.min(30, Number(clip?.duration) || 5));
      inputs.push({ source: await resolveTimelineSource(clip?.source, 'video'), duration });
      totalDuration += duration;
    }
    if (totalDuration > MAX_TIMELINE_DURATION_SECONDS) {
      throw new Error('时间线总时长不能超过 10 分钟。');
    }
    const audioSource = body?.audioSource
      ? await resolveTimelineSource(body.audioSource, 'audio')
      : '';
    await mkdir(EXPORT_ROOT, { recursive: true });
    const id = `render_${randomUUID().replace(/-/g, '')}`;
    const fileName = `${id}.mp4`;
    const outputPath = join(EXPORT_ROOT, fileName);
    const now = Date.now();
    const job = {
      id,
      status: 'queued',
      progress: 5,
      output: '草稿合成任务已创建。',
      fileName,
      url: '',
      createdAt: now,
      updatedAt: now,
    };
    timelineRenderJobs.set(id, job);

    const args = ['-y'];
    inputs.forEach((input) => args.push('-t', String(input.duration), '-i', input.source));
    if (audioSource) args.push('-stream_loop', '-1', '-i', audioSource);
    const normalized = inputs
      .map(
        (_, index) =>
          `[${index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=25,setsar=1[v${index}]`,
      )
      .join(';');
    const concat = `${inputs.map((_, index) => `[v${index}]`).join('')}concat=n=${inputs.length}:v=1:a=0[outv]`;
    args.push('-filter_complex', `${normalized};${concat}`, '-map', '[outv]');
    if (audioSource)
      args.push('-map', `${inputs.length}:a:0?`, '-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    );

    const child = spawn(LOCAL_FFMPEG_PATH, args, {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      shell: false,
      detached: platform() !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    job.status = 'running';
    job.progress = 10;
    job.output = '正在使用本机 FFmpeg 合成 720p 草稿…';
    job.updatedAt = Date.now();
    const timeoutMs = Math.min(
      MAX_TIMELINE_RENDER_TIMEOUT_MS,
      Math.max(2 * 60 * 1000, Math.round(totalDuration * 3_000 + 60_000)),
    );
    const timer = setTimeout(() => {
      cancelTimelineRender(id, '时间线合成超过硬性时限，已终止本机 FFmpeg 进程。');
    }, timeoutMs);
    timer.unref();
    timelineRenderProcesses.set(id, { child, timer, outputPath });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-16000);
      const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;
      let current;
      let last;
      while ((current = match.exec(stderr))) last = current;
      if (last) {
        const rendered = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
        job.progress = Math.max(
          job.progress,
          Math.min(96, Math.round((rendered / Math.max(1, totalDuration)) * 90) + 5),
        );
        job.updatedAt = Date.now();
      }
    });
    child.on('error', (error) => {
      job.status = 'error';
      job.progress = 0;
      job.output = error.message;
      job.updatedAt = Date.now();
    });
    child.on('close', (code) => {
      const runtime = timelineRenderProcesses.get(id);
      if (runtime) clearTimeout(runtime.timer);
      timelineRenderProcesses.delete(id);
      if (code === 0 && existsSync(outputPath)) {
        job.status = 'ready';
        job.progress = 100;
        job.output = '720p MP4 草稿已合成，可下载或预览。';
        job.url = `/exports/${fileName}`;
      } else if (job.status !== 'error') {
        job.status = 'error';
        job.progress = 0;
        job.output = compactCliText(stderr || `FFmpeg 退出码 ${code}`, 1800);
      }
      if (job.status === 'error') void unlink(outputPath).catch(() => undefined);
      job.updatedAt = Date.now();
    });
    return job;
  } finally {
    timelineRenderStarting = false;
  }
}

function timelineRenderIdFromPath(pathname) {
  const match = /^\/timeline\/render\/(render_[A-Za-z0-9]+)$/.exec(pathname);
  return match?.[1] || '';
}

// ───────────────────────── AI 代理（复刻旧版节点 AI 模型调用） ─────────────────────────
// 前端把已解密的密钥与 provider 配置随请求传入。此能力只允许主机回环请求；
// 完成配对的局域网终端仅开放项目与受管媒体协作，绝不代理或接收主机密钥。
// 桥作为代理去调用上游 OpenAI 兼容 / 火山引擎 / ModelScope / xAI 等接口。
const GEN_OUTPUT_ROOT = CLI_IMAGE_OUTPUT_ROOT;
const REMOTE_ASSET_TIMEOUT_MS = 30_000;
const MAX_REMOTE_ASSET_BYTES = 32 * 1024 * 1024;
const PROVIDER_TEXT_TIMEOUT_MS = 5 * 60 * 1000;
const PROVIDER_IMAGE_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_PROVIDER_TEXT_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PROVIDER_IMAGE_RESPONSE_BYTES = 64 * 1024 * 1024;
const PROVIDER_MODEL_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_MODEL_RESPONSE_BYTES = 2 * 1024 * 1024;

function generationResultUrls(result, kind) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const collectionKey =
    kind === 'image'
      ? 'images'
      : kind === 'video'
        ? 'videos'
        : kind === '3d'
          ? 'models3d'
          : 'audios';
  const values = Array.isArray(result[collectionKey]) ? [...result[collectionKey]] : [];
  if (typeof result.url === 'string') values.push(result.url);
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function inspectGeneratedVideoAudioTrack(result) {
  const source = generationResultUrls(result, 'video')[0];
  if (!source || !existsSync(LOCAL_FFPROBE_PATH)) return 'unverified';
  let parsed;
  try {
    parsed = new URL(source, `http://${DEFAULT_BRIDGE_HOST}:${PORT}`);
  } catch {
    return 'unverified';
  }
  const localMediaPath = localPersistedMediaPathname(parsed, LOCAL_BRIDGE_HOSTS);
  const outputMatch = /^\/output\/([A-Za-z0-9_.-]+)$/.exec(localMediaPath);
  if (!outputMatch) return 'unverified';
  const filePath = join(GEN_OUTPUT_ROOT, outputMatch[1]);
  if (!existsSync(filePath)) return 'unverified';
  try {
    const probe = await execute(
      LOCAL_FFPROBE_PATH,
      ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', filePath],
      '',
      15_000,
      { cwd: PROJECT_ROOT, maxOutput: 256 * 1024 },
    );
    if (probe.code !== 0) return 'unverified';
    return parseGeneratedVideoAudioTrackProbe(probe.stdout);
  } catch {
    return 'unverified';
  }
}

async function managedGeneratedMediaExists(value) {
  let parsed;
  try {
    parsed = new URL(value, `http://${DEFAULT_BRIDGE_HOST}:${PORT}`);
  } catch {
    return false;
  }
  if (/^https?:\/\//i.test(value) && !isLocalBridgeUrl(parsed)) return false;
  const outputMatch = /^\/output\/([A-Za-z0-9_.-]+)$/.exec(parsed.pathname);
  if (outputMatch) {
    const file = await stat(join(GEN_OUTPUT_ROOT, outputMatch[1])).catch(() => null);
    return Boolean(file?.isFile() && file.size > 0);
  }
  const assetMatch = /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(parsed.pathname);
  if (!assetMatch) return false;
  const library = await readAssetLibrary();
  const item = library.items.find((entry) => entry.id === assetMatch[1] && entry.fileName);
  if (!item?.fileName) return false;
  const file = await stat(managedAssetFilePath(item.fileName)).catch(() => null);
  return Boolean(file?.isFile() && file.size > 0);
}

async function generationResultOutputsExist(result, kind) {
  if (kind === 'text') {
    return Boolean(typeof result?.text === 'string' && result.text.trim());
  }
  const urls = generationResultUrls(result, kind);
  if (!urls.length) return false;
  return (await Promise.all(urls.map(managedGeneratedMediaExists))).every(Boolean);
}

async function requireRecoverableGenerationResult(result, kind) {
  if (kind === 'text') {
    if (typeof result?.text === 'string' && result.text.trim()) return result;
    throw new Error('上游未返回可恢复的文本结果。');
  }
  if (await generationResultOutputsExist(result, kind)) return result;
  const taskId = result?.taskId || result?.id;
  if (result?.async === true || taskId) {
    throw new Error(
      `上游只返回异步任务${taskId ? `（任务 ID：${String(taskId).slice(0, 160)}）` : ''}，` +
        '当前 Provider 未配置任务恢复接口；为避免重复计费，本 requestId 不会再次提交。',
    );
  }
  throw new Error('上游未返回已保存的本机媒体文件。');
}

const generationRequestRegistry = new GenerationRequestRegistry({
  filePath: join(DATA_ROOT, 'generation-request-registry.json'),
  outputExists: generationResultOutputsExist,
});

function generationRequestHttpStatus(error) {
  if (!(error instanceof GenerationRequestError)) return 400;
  if (error.code === 'GENERATION_OUTPUT_MISSING') return 410;
  return error.code === 'GENERATION_REQUEST_CONFLICT' || error.code === 'GENERATION_REQUEST_FAILED'
    ? 409
    : 400;
}

function genOutputFile(ext) {
  return `gen-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${ext}`;
}

function b64FromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png';
  const base64 = dataUrl.slice(comma + 1);
  return { mime, buffer: Buffer.from(base64, 'base64') };
}

function safeRemoteUrl(value, label) {
  return safeProviderRemoteUrl(value, label);
}

async function fetchProviderModelPayload(target, provider) {
  const isAuthentication = target.kind === 'authentication';
  const responseLabel = isAuthentication ? 'ModelScope 鉴权响应' : '上游模型目录';
  const url = safeRemoteUrl(target.url, isAuthentication ? 'ModelScope 鉴权地址' : '模型目录地址');
  const headers = authHeaders(provider);
  const response = await freshProviderRequest({
    url,
    method: 'GET',
    headers,
    timeoutMs: PROVIDER_MODEL_TIMEOUT_MS,
    maxResponseBytes: MAX_PROVIDER_MODEL_RESPONSE_BYTES,
    label: isAuthentication ? 'ModelScope 鉴权地址' : '模型目录地址',
    ...providerTransportTrust(url),
  });
  const payload = await readLimitedProviderJson(
    response,
    MAX_PROVIDER_MODEL_RESPONSE_BYTES,
    responseLabel,
  );
  if (!response.ok) {
    const detail =
      payload?.error && typeof payload.error === 'object'
        ? String(payload.error.message || '')
        : String(payload?.error || payload?.message || '');
    throw new Error(detail || `${responseLabel}返回 HTTP ${response.status}。`);
  }
  return { kind: target.kind, payload };
}

async function bridgeProviderModels(body) {
  const protocol = assertActiveProviderProtocol(body.protocol);
  if (!['openai', 'xai', 'deepseek', 'modelscope', 'volcengine'].includes(protocol)) {
    throw new Error('当前平台不支持远程模型目录检测。');
  }
  const provider = {
    protocol,
    apiKey: String(body.apiKey || '').trim(),
    authType: ['bearer', 'api-key', 'x-key'].includes(String(body.authType || ''))
      ? String(body.authType)
      : 'bearer',
  };
  const baseUrl = safeProviderBaseUrl(body.baseUrl);
  const modelProvider = protocol === 'modelscope' ? { ...provider, authType: 'bearer' } : provider;
  const { targets, settlements } = await settleProviderModelDiscovery(
    baseUrl,
    protocol,
    provider.apiKey,
    (target) => fetchProviderModelPayload(target, modelProvider),
  );
  const { payloads, failures } = partitionProviderModelSettlements(targets, settlements);
  if (!payloads.length) {
    const details = failures.map((failure) => `${failure.kind}: ${failure.message}`).join('；');
    throw new Error(`上游模型目录全部检测失败${details ? `：${details}` : '。'}`);
  }
  const grouped = groupProviderModelPayloads(payloads);
  const discoveredCount =
    grouped.chat.length + grouped.image.length + grouped.video.length + grouped.audio.length;
  const returnedCount = payloads.reduce(
    (total, entry) => total + providerModelIds(entry.payload).length,
    0,
  );
  if (!discoveredCount) {
    throw new Error(
      returnedCount
        ? `上游返回了 ${returnedCount} 个模型，但没有可安全归类的文本、图片、视频或音频生成模型；原有手动模型未被覆盖。`
        : '上游没有返回模型；原有手动模型未被覆盖。',
    );
  }
  const ignoredCount = Math.max(0, returnedCount - discoveredCount);
  const partialMessage = failures.length
    ? `；${failures.length} 个分类目录暂不可用，已保留其余成功结果`
    : '';
  return {
    chatModels: grouped.chat,
    imageModels: grouped.image,
    videoModels: grouped.video,
    audioModels: grouped.audio,
    message: `连接成功，找到 ${grouped.chat.length} 个文本、${grouped.image.length} 个图片、${grouped.video.length} 个视频、${grouped.audio.length} 个音频模型${ignoredCount ? `，另过滤 ${ignoredCount} 个非生成模型` : ''}${partialMessage}。`,
  };
}

async function readPluginState() {
  try {
    const state = normalizePluginState(JSON.parse(await readFile(PLUGIN_STATE_FILE, 'utf8')));
    if (
      !Object.prototype.hasOwnProperty.call(state.enabled, 'qiansi-audio') &&
      (state.enabled['voxcpm2-tts'] === true || state.enabled['chattts-tts'] === true)
    ) {
      state.enabled['qiansi-audio'] = true;
    }
    return state;
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizePluginState({});
    throw new Error(`插件状态无效：${error instanceof Error ? error.message : '无法读取'}`);
  }
}

async function writePluginState(state) {
  await mkdir(dirname(PLUGIN_STATE_FILE), { recursive: true });
  const normalized = normalizePluginState(state);
  const temporaryPath = `${PLUGIN_STATE_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(normalized, null, 2), 'utf8');
    await rename(temporaryPath, PLUGIN_STATE_FILE);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return normalized;
}

const PLUGIN_PACKAGE_FILE_RE =
  /^(?:plugin\.json|[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:m?js|css|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|glb|gltf|bin|wasm|json|txt))$/i;

function decodePluginPackageFiles(value) {
  const rawFiles = Array.isArray(value?.files) ? value.files : [];
  if (rawFiles.length === 0 || rawFiles.length > 64) {
    throw new Error('插件包必须包含 1 到 64 个文件。');
  }
  const files = new Map();
  let totalBytes = 0;
  for (const item of rawFiles) {
    const name = String(item?.name || '').trim();
    if (!PLUGIN_PACKAGE_FILE_RE.test(name)) throw new Error(`插件包文件名无效：${name || '空'}。`);
    if (files.has(name)) throw new Error(`插件包文件重复：${name}。`);
    const base64 = String(item?.base64 || '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error(`${name} 不是有效的 Base64 文件。`);
    const bytes = Buffer.from(base64, 'base64');
    if (Number(item?.size) !== bytes.length) throw new Error(`${name} 的文件大小校验失败。`);
    totalBytes += bytes.length;
    if (totalBytes > 12 * 1024 * 1024) throw new Error('插件包不能超过 12 MB。');
    files.set(name, bytes);
  }
  const manifestBytes = files.get('plugin.json');
  if (!manifestBytes) throw new Error('插件包缺少 plugin.json。');
  let manifestValue;
  try {
    manifestValue = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw new Error('插件包中的 plugin.json 不是有效 JSON。');
  }
  const manifest = parsePluginManifest(manifestValue);
  const requiredFiles = new Set([
    ...(manifest.runtime ? [manifest.runtime.entry] : []),
    ...manifest.assets,
    ...manifest.contributes.locales.map((locale) => locale.file),
    ...manifest.contributes.widgets.flatMap((widget) =>
      [widget.asset, widget.centerAsset].filter(Boolean),
    ),
  ]);
  for (const name of requiredFiles) {
    if (!files.has(name)) throw new Error(`插件包缺少清单声明的文件：${name}。`);
  }
  if (manifest.runtime && files.get(manifest.runtime.entry).length > MAX_PLUGIN_RUNTIME_BYTES) {
    throw new Error('插件运行时不能超过 2 MB。');
  }
  return { manifest, files };
}

async function readPluginCatalog() {
  await mkdir(PLUGIN_LIBRARY_ROOT, { recursive: true });
  const [entries, state, backups] = await Promise.all([
    readdir(PLUGIN_LIBRARY_ROOT, { withFileTypes: true }),
    readPluginState(),
    listExtensionBackups({ backupRoot: PLUGIN_BACKUP_ROOT, kind: 'plugin' }),
  ]);
  const canvasVersion = await readCanvasHostVersion();
  const plugins = [];
  const errors = [];
  for (const entry of entries.filter((item) => item.isDirectory()).slice(0, 100)) {
    const pluginDirectory = join(PLUGIN_LIBRARY_ROOT, entry.name);
    try {
      const manifest = parsePluginManifest(
        JSON.parse(await readFile(join(pluginDirectory, 'plugin.json'), 'utf8')),
      );
      let runtimeSha256;
      if (manifest.runtime) {
        const runtimeBytes = await readFile(join(pluginDirectory, manifest.runtime.entry));
        if (runtimeBytes.length > MAX_PLUGIN_RUNTIME_BYTES)
          throw new Error('插件运行时不能超过 2 MB。');
        runtimeSha256 = createHash('sha256').update(runtimeBytes).digest('hex');
      }
      const compatible = isPluginEngineCompatible(manifest.engine.qiansiCanvas, canvasVersion);
      const stateDefined = Object.prototype.hasOwnProperty.call(state.enabled, manifest.id);
      const enabledByDefault = manifest.schemaVersion === 1 || manifest.permissions.length === 0;
      const audioGeneratorEndpoints = manifest.contributes.audioGenerators
        .filter((generator) => generator.endpoint)
        .map((generator) => ({
          id: generator.id,
          endpoint: generator.endpoint,
          healthEndpoint: generator.healthEndpoint,
        }));
      const managedAudioAdapters = manifest.contributes.audioGenerators
        .filter((generator) => generator.hostAdapter)
        .map((generator) => ({ id: generator.id, hostAdapter: generator.hostAdapter }));
      plugins.push({
        manifest,
        compatible,
        enabled:
          (stateDefined ? state.enabled[manifest.id] !== false : enabledByDefault) && compatible,
        directory: pluginDirectory,
        security: {
          sandboxed: Boolean(manifest.runtime),
          networkAccess: false,
          fileSystemAccess: false,
          secretsAccess: false,
          ...(runtimeSha256 ? { runtimeSha256 } : {}),
          ...(audioGeneratorEndpoints.length > 0 || managedAudioAdapters.length > 0
            ? {
                hostProxyAccess:
                  managedAudioAdapters.length > 0 ? 'managed-audio' : 'loopback-audio',
                ...(audioGeneratorEndpoints.length > 0 ? { audioGeneratorEndpoints } : {}),
                ...(managedAudioAdapters.length > 0 ? { managedAudioAdapters } : {}),
              }
            : {}),
        },
      });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const directoryEntries = await readdir(pluginDirectory, { withFileTypes: true }).catch(
          () => [],
        );
        const isProjectDataOnlyDirectory =
          directoryEntries.length === 1 &&
          directoryEntries[0].isDirectory() &&
          directoryEntries[0].name === 'project-data';
        if (isProjectDataOnlyDirectory) continue;
      }
      errors.push({
        directory: pluginDirectory,
        message: error instanceof Error ? error.message : '插件清单读取失败。',
      });
    }
  }
  plugins.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name, 'zh-CN'));
  return {
    directory: PLUGIN_LIBRARY_ROOT,
    backupDirectory: PLUGIN_BACKUP_ROOT,
    canvasVersion,
    bridgeVersion: APP_VERSION,
    plugins,
    backups,
    errors,
    mode: 'sandboxed-runtime',
  };
}

async function enabledPluginAudioGenerator(pluginIdValue, generatorIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  const generatorId = String(generatorIdValue || '').trim();
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new PluginAudioProxyError('插件不存在、未启用或版本不兼容。', 403);
  }
  if (!plugin.manifest.permissions.includes('audio:generate')) {
    throw new PluginAudioProxyError('插件没有 audio:generate 权限。', 403);
  }
  const generator = plugin.manifest.contributes.audioGenerators.find(
    (item) => item.id === generatorId,
  );
  if (!generator) throw new PluginAudioProxyError('插件音频生成器不存在。', 404);
  if (pluginId === QIANSI_AUDIO_PLUGIN_ID && managedAudioInstaller) {
    const installStatus = managedAudioInstaller.taskStatus(generatorId);
    if (['preparing', 'running', 'cancelling', 'removing'].includes(installStatus.status)) {
      throw new PluginAudioProxyError('该模型正在安装、校验或删除，请等待操作完成后再使用。', 409);
    }
  }
  return { ...generator, pluginId: plugin.manifest.id, pluginRoot: plugin.directory };
}

async function enabledPluginStyleSampleOwner(pluginIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new Error('插件不存在、未启用或版本不兼容。');
  }
  if (!plugin.manifest.permissions.includes('styles:manage-samples')) {
    throw new Error('插件没有 styles:manage-samples 权限。');
  }
  return plugin;
}

async function enabledPluginAudioInstaller(pluginIdValue, generatorIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  if (pluginId !== QIANSI_AUDIO_PLUGIN_ID) {
    throw new ManagedAudioInstallerError('该插件没有受信任的一键安装能力。', 403);
  }
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new ManagedAudioInstallerError('插件不存在、未启用或版本不兼容。', 403);
  }
  if (!plugin.manifest.permissions.includes('audio:install')) {
    throw new ManagedAudioInstallerError('插件没有 audio:install 权限。', 403);
  }
  const generatorId = String(generatorIdValue || '').trim();
  let generator;
  if (generatorId) {
    generator = plugin.manifest.contributes.audioGenerators.find((item) => item.id === generatorId);
    if (!generator) throw new ManagedAudioInstallerError('插件音频生成器不存在。', 404);
  }
  return { plugin, generator, generatorId };
}

async function enabledPluginMotionInstaller(pluginIdValue, engineIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  if (pluginId !== QIANSI_MOTION_PLUGIN_ID) {
    throw new ManagedMotionInstallerError('该插件没有受信任的动作模型安装能力。', 403);
  }
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new ManagedMotionInstallerError('插件不存在、未启用或版本不兼容。', 403);
  }
  if (!plugin.manifest.permissions.includes('vision:install')) {
    throw new ManagedMotionInstallerError('插件没有 vision:install 权限。', 403);
  }
  const engineId = String(engineIdValue || '').trim();
  if (engineId && !QIANSI_MOTION_MODEL_IDS.includes(engineId)) {
    throw new ManagedMotionInstallerError('动作模型不存在或不支持一键安装。', 404);
  }
  return { plugin, engineId };
}

async function enabledPluginMotionWorker(pluginIdValue, engineIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  if (pluginId !== QIANSI_MOTION_PLUGIN_ID) {
    throw new ManagedMotionWorkerError('该插件没有受信任的 AI 动作捕捉能力。', 403);
  }
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new ManagedMotionWorkerError('插件不存在、未启用或版本不兼容。', 403);
  }
  if (!plugin.manifest.permissions.includes('vision:pose')) {
    throw new ManagedMotionWorkerError('插件没有 vision:pose 权限。', 403);
  }
  const engineId = String(engineIdValue || '')
    .trim()
    .toLowerCase();
  if (engineId !== 'gem-x' && engineId !== 'rtmw3d') {
    throw new ManagedMotionWorkerError('AI 动作捕捉引擎无效。', 404);
  }
  return { plugin, engineId };
}

function motionCaptureNumber(value, label, minimum, maximum, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ManagedMotionWorkerError(`${label}无效。`, 400);
  }
  if (integer && !Number.isInteger(number)) {
    throw new ManagedMotionWorkerError(`${label}必须是整数。`, 400);
  }
  return number;
}

function motionCaptureBoolean(value, label, fallback = false) {
  if (value === null) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ManagedMotionWorkerError(`${label}无效。`, 400);
}

function parseMotionCaptureUpload(url, request) {
  const allowed = new Set([
    'pluginId',
    'engineId',
    'durationSeconds',
    'width',
    'height',
    'sampleFps',
    'maxPoses',
    'confidenceThreshold',
    'smoothing',
    'staticCamera',
    'detectionThreshold',
    'trackingMethod',
    'trackingThreshold',
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new ManagedMotionWorkerError(`AI 动作任务包含未知参数：${key}。`, 400);
    }
  }
  const mimeType = String(request.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) {
    throw new ManagedMotionWorkerError('AI 动作视频格式必须是 MP4、WebM 或 MOV。', 415);
  }
  const fileName = cleanHeaderText(request, 'x-qiansi-motion-file-name', 'motion.mp4', 260);
  if (!fileName || /[\\/\0\r\n]/.test(fileName)) {
    throw new ManagedMotionWorkerError('AI 动作视频文件名无效。', 400);
  }
  const engineId = url.searchParams.get('engineId');
  const sampleFps = motionCaptureNumber(
    url.searchParams.get('sampleFps'),
    'AI 动作采样率',
    5,
    15,
    true,
  );
  const maxPoses = motionCaptureNumber(
    url.searchParams.get('maxPoses'),
    'AI 动作人物上限',
    1,
    4,
    true,
  );
  if (![5, 10, 15].includes(sampleFps)) {
    throw new ManagedMotionWorkerError('AI 动作采样率只支持 5、10 或 15 FPS。', 400);
  }
  if (engineId === 'gem-x' && maxPoses !== 1) {
    throw new ManagedMotionWorkerError('GEM-X 单次只支持一个人物。', 400);
  }
  const trackingMethod = url.searchParams.get('trackingMethod') || 'iou';
  if (!['iou', 'oks'].includes(trackingMethod)) {
    throw new ManagedMotionWorkerError('RTMW3D 人物跟踪方式无效。', 400);
  }
  return {
    pluginId: url.searchParams.get('pluginId'),
    engineId,
    fileName,
    mimeType,
    durationSeconds: motionCaptureNumber(
      url.searchParams.get('durationSeconds'),
      'AI 动作视频时长',
      0.001,
      90,
    ),
    width: motionCaptureNumber(url.searchParams.get('width'), 'AI 动作视频宽度', 16, 16_384, true),
    height: motionCaptureNumber(
      url.searchParams.get('height'),
      'AI 动作视频高度',
      16,
      16_384,
      true,
    ),
    sampleFps,
    maxPoses,
    confidenceThreshold: motionCaptureNumber(
      url.searchParams.get('confidenceThreshold'),
      'AI 动作置信度',
      0,
      1,
    ),
    smoothing: motionCaptureNumber(url.searchParams.get('smoothing'), 'AI 动作平滑强度', 0, 0.9),
    staticCamera: motionCaptureBoolean(url.searchParams.get('staticCamera'), 'GEM-X 相机运动假设'),
    detectionThreshold: motionCaptureNumber(
      url.searchParams.get('detectionThreshold') ?? '0.3',
      'RTMW3D 人体检测阈值',
      0,
      1,
    ),
    trackingMethod,
    trackingThreshold: motionCaptureNumber(
      url.searchParams.get('trackingThreshold') ?? '0.3',
      'RTMW3D 人物跟踪阈值',
      0,
      1,
    ),
  };
}

async function enabledPluginReferenceAudioLibrary(pluginIdValue) {
  const pluginId = String(pluginIdValue || '').trim();
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || !plugin.compatible) {
    throw new ReferenceAudioLibraryError('插件不存在、未启用或版本不兼容。', 403);
  }
  const hasReferenceLibraryPermission =
    plugin.manifest.permissions.includes('audio:reference-library') ||
    plugin.manifest.permissions.includes('audio:generate');
  if (!hasReferenceLibraryPermission) {
    throw new ReferenceAudioLibraryError('插件没有 audio:reference-library 权限。', 403);
  }
  return new ReferenceAudioLibrary(join(plugin.directory, 'reference-audio-library'));
}

function decodeReferenceAudioBase64(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new ReferenceAudioLibraryError('参考音频不是有效的 Base64 数据。');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new ReferenceAudioLibraryError('参考音频不是有效的 Base64 数据。');
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new ReferenceAudioLibraryError('参考音频必须大于 0 字节且不能超过 16 MB。', 413);
  }
  return bytes;
}

function pluginManagedAudioAdapters(plugin) {
  return [
    ...new Set(
      plugin.manifest.contributes.audioGenerators
        .map((generator) => generator.hostAdapter)
        .filter(Boolean),
    ),
  ].map((adapterId) => ({
    adapterId,
    pluginId: plugin.manifest.id,
    pluginRoot: plugin.directory,
  }));
}

async function startPluginManagedAudio(plugin) {
  // Installable companion engines are intentionally lazy. This keeps the workbench available
  // when an engine was removed and prevents enabling the plugin from launching four runtimes.
  if (plugin.manifest.permissions.includes('audio:install')) return;
  for (const adapter of pluginManagedAudioAdapters(plugin)) {
    await managedAudioWorkers.start(adapter.adapterId, {
      pluginId: adapter.pluginId,
      pluginRoot: adapter.pluginRoot,
    });
  }
}

async function stopPluginManagedAudio(plugin) {
  for (const adapter of pluginManagedAudioAdapters(plugin)) {
    await managedAudioWorkers.stop(adapter.adapterId, {
      pluginId: adapter.pluginId,
      pluginRoot: adapter.pluginRoot,
    });
  }
}

async function startEnabledManagedAudioPlugins() {
  const catalog = await readPluginCatalog();
  for (const plugin of catalog.plugins.filter((item) => item.enabled && item.compatible)) {
    try {
      await startPluginManagedAudio(plugin);
    } catch (error) {
      console.error(
        `[插件] ${plugin.manifest.name} 后台服务启动失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function importPluginManifest(value) {
  const manifest = parsePluginManifest(value);
  if (
    manifest.runtime ||
    manifest.assets.length > 0 ||
    manifest.contributes.widgets.length > 0 ||
    manifest.contributes.locales.length > 0
  ) {
    throw new Error('包含运行时、素材、挂件或语言文件的插件必须安装完整插件包。');
  }
  const directory = join(PLUGIN_LIBRARY_ROOT, manifest.id);
  let previousVersion = '';
  try {
    previousVersion = parsePluginManifest(
      JSON.parse(await readFile(join(directory, 'plugin.json'), 'utf8')),
    ).version;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('现有插件清单无效，已拒绝覆盖。');
  }
  if (previousVersion) {
    await createExtensionBackup({
      sourceDirectory: directory,
      backupRoot: PLUGIN_BACKUP_ROOT,
      kind: 'plugin',
      id: manifest.id,
      version: previousVersion,
    });
  }
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, 'plugin.json');
  const temporaryPath = join(directory, `.plugin-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(manifest, null, 2), 'utf8');
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  const state = await readPluginState();
  state.enabled[manifest.id] = manifest.schemaVersion === 1 || manifest.permissions.length === 0;
  await writePluginState(state);
  return manifest;
}

async function importPluginPackage(value) {
  const { manifest, files } = decodePluginPackageFiles(value);
  const directory = join(PLUGIN_LIBRARY_ROOT, manifest.id);
  let previousVersion = '';
  try {
    previousVersion = parsePluginManifest(
      JSON.parse(await readFile(join(directory, 'plugin.json'), 'utf8')),
    ).version;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('现有插件清单无效，已拒绝覆盖。');
  }
  if (previousVersion) {
    await createExtensionBackup({
      sourceDirectory: directory,
      backupRoot: PLUGIN_BACKUP_ROOT,
      kind: 'plugin',
      id: manifest.id,
      version: previousVersion,
    });
  }
  await mkdir(directory, { recursive: true });
  const orderedFiles = [...files.entries()].sort(([left], [right]) => {
    if (left === 'plugin.json') return 1;
    if (right === 'plugin.json') return -1;
    return left.localeCompare(right);
  });
  for (const [name, bytes] of orderedFiles) {
    const target = join(directory, name);
    const temporaryPath = join(directory, `.plugin-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, target);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  const state = await readPluginState();
  state.enabled[manifest.id] = manifest.permissions.length === 0;
  await writePluginState(state);
  return manifest;
}

async function uninstallPlugin(id) {
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === id);
  if (!plugin) throw new Error('插件不存在或清单无效。');
  await createExtensionBackup({
    sourceDirectory: plugin.directory,
    backupRoot: PLUGIN_BACKUP_ROOT,
    kind: 'plugin',
    id,
    version: plugin.manifest.version,
  });
  await stopPluginManagedAudio(plugin);
  await rm(plugin.directory, { recursive: true, force: false });
  const state = await readPluginState();
  delete state.enabled[id];
  await writePluginState(state);
}

async function restorePlugin(id) {
  const catalog = await readPluginCatalog();
  const targetBackup = catalog.backups.find((item) => item.id === id);
  if (!targetBackup) throw new Error('没有可恢复的插件备份。');
  const installed = catalog.plugins.find((item) => item.manifest.id === id);
  if (installed) {
    await stopPluginManagedAudio(installed);
    await createExtensionBackup({
      sourceDirectory: installed.directory,
      backupRoot: PLUGIN_BACKUP_ROOT,
      kind: 'plugin',
      id,
      version: installed.manifest.version,
    });
    await rm(installed.directory, { recursive: true, force: false });
  }
  try {
    await restoreExtensionBackup({
      destinationRoot: PLUGIN_LIBRARY_ROOT,
      backupRoot: PLUGIN_BACKUP_ROOT,
      kind: 'plugin',
      id,
      backupId: targetBackup.backupId,
    });
    const restored = parsePluginManifest(
      JSON.parse(await readFile(join(PLUGIN_LIBRARY_ROOT, id, 'plugin.json'), 'utf8')),
    );
    if (restored.id !== id) throw new Error('恢复的插件 ID 与备份目录不一致。');
  } catch (error) {
    await rm(join(PLUGIN_LIBRARY_ROOT, id), { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
  const restoredPlugin = (await readPluginCatalog()).plugins.find(
    (item) => item.manifest.id === id,
  );
  if (!restoredPlugin) throw new Error('恢复后的插件清单无效。');
  await startPluginManagedAudio(restoredPlugin);
  const state = await readPluginState();
  state.enabled[id] = true;
  await writePluginState(state);
}

async function setPluginEnabled(id, enabled) {
  const catalog = await readPluginCatalog();
  const plugin = catalog.plugins.find((item) => item.manifest.id === id);
  if (!plugin) throw new Error('插件不存在或清单无效。');
  if (enabled && !plugin.compatible) throw new Error('插件与当前千丝无限画布版本不兼容。');
  if (enabled) await startPluginManagedAudio(plugin);
  const state = await readPluginState();
  state.enabled[id] = Boolean(enabled);
  await writePluginState(state);
  if (!enabled) await stopPluginManagedAudio(plugin);
}

async function readUpdateSourceConfig() {
  let defaults;
  try {
    defaults = JSON.parse(await readFile(UPDATE_SOURCE_DEFAULT_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`默认更新源配置无效：${error instanceof Error ? error.message : '无法读取'}`);
  }
  try {
    const override = JSON.parse(await readFile(UPDATE_SOURCE_FILE, 'utf8'));
    return mergeUpdateSourceConfigs(defaults, override);
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeUpdateSources(defaults);
    throw new Error(`本地更新源配置无效：${error instanceof Error ? error.message : '无法读取'}`);
  }
}

async function readLimitedJsonResponse(response, maxBytes, label) {
  if (!response.ok) throw new Error(`${label}请求失败（HTTP ${response.status}）。`);
  safeUpdateUrl(response.url, `${label}最终地址`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error(`${label}内容过大。`);
  if (!response.body) throw new Error(`${label}没有返回内容。`);
  const chunks = [];
  let received = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    received += chunk.length;
    if (received > maxBytes) throw new Error(`${label}内容过大。`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, received);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label}不是有效 JSON。`);
  }
}

async function fetchUpdateManifest(source) {
  if (!source.enabled || !source.manifestUrl) throw new Error('更新源尚未配置。');
  const startedAt = Date.now();
  const response = await fetch(safeUpdateUrl(source.manifestUrl, `${source.name} 清单地址`), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  const manifest = parseUpdateManifest(
    await readLimitedJsonResponse(response, MAX_UPDATE_MANIFEST_BYTES, `${source.name} 更新清单`),
  );
  return { manifest, latencyMs: Date.now() - startedAt };
}

async function inspectUpdateSource(source) {
  if (!source.enabled || !source.manifestUrl) {
    return {
      id: source.id,
      name: source.name,
      homepageUrl: source.homepageUrl,
      configured: false,
      status: 'unconfigured',
      message: '尚未配置清单地址。',
    };
  }
  try {
    const { manifest, latencyMs } = await fetchUpdateManifest(source);
    return {
      id: source.id,
      name: source.name,
      homepageUrl: source.homepageUrl,
      configured: true,
      status: 'ready',
      latencyMs,
      updateAvailable: compareUpdateVersions(manifest.version, APP_VERSION) > 0,
      manifest,
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      homepageUrl: source.homepageUrl,
      configured: true,
      status: 'error',
      message: error instanceof Error ? error.message : '更新源检查失败。',
    };
  }
}

async function checkSystemUpdates(sourceId = 'auto') {
  const config = await readUpdateSourceConfig();
  const selected =
    sourceId === 'auto'
      ? config.sources
      : config.sources.filter((source) => source.id === sourceId);
  if (sourceId !== 'auto' && selected.length === 0) throw new Error('指定的更新源不存在。');
  const sources = await Promise.all(selected.map(inspectUpdateSource));
  const ready = sources.filter((source) => source.status === 'ready' && source.manifest);
  ready.sort((left, right) => compareUpdateVersions(right.manifest.version, left.manifest.version));
  const previousCandidates = ready
    .flatMap((source) => {
      const release = findPreviousUpdateRelease(source.manifest, APP_VERSION);
      return release ? [{ sourceId: source.id, sourceName: source.name, ...release }] : [];
    })
    .sort((left, right) => compareUpdateVersions(right.version, left.version));
  return {
    currentVersion: APP_VERSION,
    sourceChoice: sourceId,
    sources,
    latest: ready[0]
      ? {
          sourceId: ready[0].id,
          sourceName: ready[0].name,
          updateAvailable: ready[0].updateAvailable,
          ...ready[0].manifest,
        }
      : null,
    previous: previousCandidates[0] ?? null,
  };
}

async function checkSystemUpdateConnectivity(sourceId = 'auto') {
  const config = await readUpdateSourceConfig();
  const selected =
    sourceId === 'auto'
      ? config.sources
      : config.sources.filter((source) => source.id === sourceId);
  if (sourceId !== 'auto' && selected.length === 0) throw new Error('指定的更新源不存在。');
  return {
    currentVersion: APP_VERSION,
    sourceChoice: sourceId,
    sources: await Promise.all(selected.map((source) => probeUpdateSourceConnectivity(source))),
    latest: null,
    previous: null,
  };
}

async function unusedUpdatePackagePath(version) {
  await mkdir(UPDATE_DOWNLOAD_ROOT, { recursive: true });
  const safeVersion = String(version).replace(/[^A-Za-z0-9._-]/g, '-');
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = join(UPDATE_DOWNLOAD_ROOT, `qiansi-canvas-${safeVersion}${suffix}.zip`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error('更新目录中同版本文件过多，请整理后重试。');
}

async function downloadVerifiedSystemPackage(source, release, kind) {
  const rollback = kind === 'rollback';
  const label = rollback ? '回退版本包' : '更新包';
  const response = await fetch(safeUpdateUrl(release.package.url, `${label}地址`), {
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${label}下载失败（HTTP ${response.status}）。`);
  }
  safeUpdateUrl(response.url, `${label}最终地址`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_UPDATE_PACKAGE_BYTES || (declared && declared !== release.package.size)) {
    throw new Error(`${label}声明大小与清单不一致。`);
  }

  const finalPath = await unusedUpdatePackagePath(release.version);
  const temporaryPath = join(UPDATE_DOWNLOAD_ROOT, `.download-${randomUUID()}.tmp`);
  const hash = createHash('sha256');
  let downloadedBytes = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_UPDATE_PACKAGE_BYTES) {
        callback(new Error('更新包超过 1 GB 限制。'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(temporaryPath));
    if (downloadedBytes !== release.package.size) {
      throw new Error(`${label}实际大小与清单不一致。`);
    }
    const actualSha256 = hash.digest('hex');
    if (actualSha256 !== release.package.sha256) throw new Error(`${label} SHA-256 校验失败。`);
    await rename(temporaryPath, finalPath);
    return {
      kind,
      sourceId: source.id,
      sourceName: source.name,
      version: release.version,
      fileName: basename(finalPath),
      path: finalPath,
      size: downloadedBytes,
      sha256: actualSha256,
      verified: true,
    };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function downloadSystemUpdate(sourceId) {
  const config = await readUpdateSourceConfig();
  const source = config.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error('更新源不存在。');
  const { manifest } = await fetchUpdateManifest(source);
  if (compareUpdateVersions(manifest.version, APP_VERSION) <= 0) {
    throw new Error('该更新源没有高于当前版本的更新。');
  }
  return downloadVerifiedSystemPackage(source, manifest, 'update');
}

async function downloadSystemRollback(sourceId) {
  const config = await readUpdateSourceConfig();
  const source = config.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error('回退版本来源不存在。');
  const { manifest } = await fetchUpdateManifest(source);
  const previous = findPreviousUpdateRelease(manifest, APP_VERSION);
  if (!previous) throw new Error('该更新源没有提供低于当前版本的完整回退包。');
  return downloadVerifiedSystemPackage(source, previous, 'rollback');
}

function safeProviderBaseUrl(value) {
  const url = safeRemoteUrl(value, 'API Base URL');
  if (
    classifyProviderAddressLiteral(url.hostname) === 'loopback' &&
    !trustedLocalProviderOrigins.has(url.origin)
  ) {
    throw new Error('本机 Provider 地址尚未加入持久受信配置；请先在 API 设置中检测并确认该连接。');
  }
  return url.toString().replace(/\/$/, '');
}

function providerTransportTrust(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value || ''));
  } catch {
    return {};
  }
  return classifyProviderAddressLiteral(url.hostname) === 'loopback' &&
    trustedLocalProviderOrigins.has(url.origin)
    ? { allowLoopback: true }
    : {};
}

async function readRemoteAsset(url, label) {
  const safeUrl = safeRemoteUrl(url, label);
  if (
    classifyProviderAddressLiteral(safeUrl.hostname) === 'loopback' &&
    !isLocalBridgeUrl(safeUrl)
  ) {
    throw new Error(`${label}不能读取任意本机服务；请先导入素材库。`);
  }
  const response = await freshProviderRequest({
    url: safeUrl,
    method: 'GET',
    timeoutMs: REMOTE_ASSET_TIMEOUT_MS,
    maxResponseBytes: MAX_REMOTE_ASSET_BYTES,
    label,
  });
  if (!response.ok) throw new Error(`${label}下载失败（HTTP ${response.status}）。`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_REMOTE_ASSET_BYTES) throw new Error(`${label}超过 32 MB 限制。`);
  if (!response.body) throw new Error(`${label}没有返回内容。`);
  const chunks = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      received += chunk.length;
      if (received > MAX_REMOTE_ASSET_BYTES) {
        await reader.cancel(`${label}超过 32 MB 限制。`).catch(() => undefined);
        throw new Error(`${label}超过 32 MB 限制。`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, received);
  return { bytes, mime: String(response.headers.get('content-type') || '') };
}

async function toBlob(src, options = {}) {
  if (src.startsWith('data:')) {
    const parsed = b64FromDataUrl(src);
    if (!parsed) throw new Error('无法解析的参考图数据。');
    if (parsed.buffer.length > MAX_REMOTE_ASSET_BYTES) throw new Error('参考图超过 32 MB 限制。');
    return new Blob([parsed.buffer], { type: parsed.mime });
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(src);
  } catch {
    parsedUrl = null;
  }
  const localMediaPath = parsedUrl
    ? localPersistedMediaPathname(parsedUrl, LOCAL_BRIDGE_HOSTS)
    : '';
  const isLocalBridge = Boolean(localMediaPath);
  if (isLocalBridge && parsedUrl) {
    const outputMatch = /^\/output\/([A-Za-z0-9_.-]+)$/.exec(localMediaPath);
    if (outputMatch) {
      const path = join(GEN_OUTPUT_ROOT, outputMatch[1]);
      if (!existsSync(path)) throw new Error('本机参考图文件不存在。');
      const bytes = await readFile(path);
      if (!bytes.length || bytes.length > MAX_REMOTE_ASSET_BYTES) {
        throw new Error('本机参考图为空或超过 32 MB 限制。');
      }
      return new Blob([bytes], { type: cliImageFileMime(path) });
    }
    const assetMatch = /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(localMediaPath);
    if (assetMatch) {
      const library = await readAssetLibrary();
      const item = library.items.find((entry) => entry.id === assetMatch[1] && entry.fileName);
      if (!item?.fileName || !String(item.mime).startsWith('image/')) {
        throw new Error('本机素材库参考图不存在。');
      }
      const bytes = await readFile(managedAssetFilePath(item.fileName));
      if (!bytes.length || bytes.length > MAX_REMOTE_ASSET_BYTES) {
        throw new Error('本机素材库参考图为空或超过 32 MB 限制。');
      }
      return new Blob([bytes], { type: item.mime });
    }
    const previewMatch = /^\/media-preview\/files\/([A-Za-z0-9_-]{12,80}\.webp)$/.exec(
      localMediaPath,
    );
    if (previewMatch) {
      const path = managedPreviewFilePath(previewMatch[1]);
      if (!existsSync(path)) throw new Error('本机媒体预览不存在。');
      const bytes = await readFile(path);
      if (!bytes.length || bytes.length > MAX_REMOTE_ASSET_BYTES) {
        throw new Error('本机媒体预览为空或超过 32 MB 限制。');
      }
      return new Blob([bytes], { type: 'image/webp' });
    }
  }
  if (options.localOnly) {
    throw new Error(
      '本地 ComfyUI 参考图只接受画布上传、生成结果或资产库图片；请先把远程图片保存到资产库。',
    );
  }
  const { bytes, mime } = await readRemoteAsset(src, '参考图');
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function generatedFileExtension(source, mime, kind, bytes) {
  const normalizedMime = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (kind === 'video') {
    if (normalizedMime === 'video/webm') return '.webm';
    if (normalizedMime === 'video/quicktime') return '.mov';
    if (normalizedMime === 'video/mp4') return '.mp4';
    try {
      const extension = extname(new URL(source).pathname).toLowerCase();
      if (['.mp4', '.webm', '.mov'].includes(extension)) return extension;
    } catch {
      /* use the safe video fallback */
    }
    return '.mp4';
  }
  if (kind === 'audio') {
    return generatedAudioFileExtension(source, normalizedMime, bytes);
  }
  if (normalizedMime === 'image/webp') return '.webp';
  if (normalizedMime === 'image/jpeg') return '.jpg';
  return '.png';
}

async function saveGeneratedImage(source, kind = 'image') {
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  let buffer;
  let mime = '';
  if (source.startsWith('data:')) {
    const parsed = b64FromDataUrl(source);
    if (!parsed) throw new Error('无法解析的生成结果。');
    buffer = parsed.buffer;
    if (buffer.length > MAX_REMOTE_ASSET_BYTES) throw new Error('生成结果超过 32 MB 限制。');
    mime = parsed.mime;
  } else {
    const remote = await readRemoteAsset(source, '生成结果');
    mime = remote.mime;
    const { bytes } = remote;
    buffer = bytes;
  }
  const ext = generatedFileExtension(source, mime, kind, buffer);
  const file = genOutputFile(ext);
  await writeFile(join(GEN_OUTPUT_ROOT, file), buffer);
  return `/output/${encodeURIComponent(file)}`;
}

function comfyUploadFileName(blob, index) {
  const extension =
    blob.type === 'video/mp4'
      ? '.mp4'
      : blob.type === 'video/webm'
        ? '.webm'
        : blob.type === 'video/quicktime'
          ? '.mov'
          : blob.type === 'audio/wav' || blob.type === 'audio/x-wav'
            ? '.wav'
            : blob.type === 'audio/mpeg'
              ? '.mp3'
              : blob.type === 'audio/ogg'
                ? '.ogg'
                : blob.type === 'audio/mp4'
                  ? '.m4a'
                  : blob.type === 'audio/flac'
                    ? '.flac'
                    : blob.type === 'image/jpeg'
                      ? '.jpg'
                      : blob.type === 'image/webp'
                        ? '.webp'
                        : blob.type === 'image/gif'
                          ? '.gif'
                          : '.png';
  return `qiansi-${Date.now().toString(36)}-${index}-${randomUUID().slice(0, 8)}${extension}`;
}

async function replayableResponseBody(body, prefixLimit = 4096) {
  const reader = body.getReader();
  const initialChunks = [];
  let inspectedBytes = 0;
  let done = false;
  while (!done && inspectedBytes < prefixLimit) {
    const next = await reader.read();
    done = next.done;
    if (!next.value?.byteLength) continue;
    const chunk = Buffer.from(next.value);
    initialChunks.push(chunk);
    inspectedBytes += chunk.length;
  }
  const prefix = Buffer.concat(initialChunks).subarray(0, prefixLimit);
  const stream = Readable.from(
    (async function* replay() {
      try {
        yield* initialChunks;
        while (!done) {
          const next = await reader.read();
          done = next.done;
          if (next.value?.byteLength) yield Buffer.from(next.value);
        }
      } finally {
        if (!done) await reader.cancel().catch(() => null);
        reader.releaseLock();
      }
    })(),
  );
  return { prefix, stream };
}

async function saveComfyVideoOutput(baseUrl, descriptor, clientOptions = {}) {
  const response = await fetchComfyOutputResponse(baseUrl, descriptor, {
    ...clientOptions,
    timeoutMs: COMFYUI_VIDEO_DOWNLOAD_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(`ComfyUI 视频下载失败（HTTP ${response.status}）。`);
  }
  if (!response.body) throw new Error('ComfyUI 视频下载结果为空。');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_COMFYUI_VIDEO_BYTES) {
    throw new Error('ComfyUI 视频超过 1 GB 限制。');
  }
  const contentType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const { prefix, stream } = await replayableResponseBody(response.body);
  const { extension } = detectComfyMediaFormat('video', {
    filename: descriptor.filename,
    mime: contentType,
    bytes: prefix,
  });

  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const fileName = genOutputFile(extension);
  const targetPath = join(GEN_OUTPUT_ROOT, fileName);
  const temporaryPath = `${targetPath}.${randomUUID()}.part`;
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_COMFYUI_VIDEO_BYTES) {
        callback(new Error('ComfyUI 视频超过 1 GB 限制。'));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(stream, counter, createWriteStream(temporaryPath, { flags: 'wx' }));
    if (!bytes) throw new Error('ComfyUI 视频下载结果为空。');
    await rename(temporaryPath, targetPath);
    return `/output/${encodeURIComponent(fileName)}`;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function saveComfyImageOutput(baseUrl, descriptor, clientOptions = {}) {
  const response = await fetchComfyOutputResponse(baseUrl, descriptor, {
    ...clientOptions,
    timeoutMs: COMFYUI_VIDEO_DOWNLOAD_TIMEOUT_MS,
  });
  if (!response.ok || !response.body) throw new Error('ComfyUI 图片下载失败。');
  const contentType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .toLowerCase();
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_REMOTE_ASSET_BYTES) throw new Error('ComfyUI 图片超过 32 MB 限制。');
  const { prefix, stream } = await replayableResponseBody(response.body);
  const { extension } = detectComfyMediaFormat('image', {
    filename: descriptor.filename,
    mime: contentType,
    bytes: prefix,
  });
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const fileName = genOutputFile(extension);
  const targetPath = join(GEN_OUTPUT_ROOT, fileName);
  const temporaryPath = `${targetPath}.${randomUUID()}.part`;
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_REMOTE_ASSET_BYTES) {
        callback(new Error('ComfyUI 图片超过 32 MB 限制。'));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(stream, counter, createWriteStream(temporaryPath, { flags: 'wx' }));
    if (!bytes) throw new Error('ComfyUI 图片下载结果为空。');
    await rename(temporaryPath, targetPath);
    return `/output/${encodeURIComponent(fileName)}`;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function comfy3dOutputExtension(descriptor, contentType, prefix) {
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString('ascii') === 'glTF') return '.glb';
  const mime = String(contentType || '').toLowerCase();
  if (mime === 'model/gltf-binary' || mime === 'application/octet-stream+gltf') return '.glb';
  if (mime === 'model/gltf+json') return '.gltf';
  const extension = extname(String(descriptor?.filename || '')).toLowerCase();
  if (['.glb', '.gltf', '.obj', '.ply', '.stl', '.fbx', '.usdz'].includes(extension)) {
    return extension;
  }
  throw new Error('ComfyUI 3D 输出格式无法确认，请输出 GLB、glTF、OBJ、PLY、STL、FBX 或 USDZ。');
}

async function saveComfyBinaryOutput(
  baseUrl,
  descriptor,
  clientOptions,
  { label, maximumBytes, extensionFor },
) {
  const response = await fetchComfyOutputResponse(baseUrl, descriptor, {
    ...clientOptions,
    timeoutMs: COMFYUI_VIDEO_DOWNLOAD_TIMEOUT_MS,
  });
  if (!response.ok) throw new Error(`ComfyUI ${label}下载失败（HTTP ${response.status}）。`);
  if (!response.body) throw new Error(`ComfyUI ${label}下载结果为空。`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maximumBytes) throw new Error(`ComfyUI ${label}超过大小限制。`);
  const contentType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const { prefix, stream } = await replayableResponseBody(response.body);
  const extension = extensionFor(descriptor, contentType, prefix);
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const fileName = genOutputFile(extension);
  const targetPath = join(GEN_OUTPUT_ROOT, fileName);
  const temporaryPath = `${targetPath}.${randomUUID()}.part`;
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maximumBytes ? new Error(`ComfyUI ${label}超过大小限制。`) : null, chunk);
    },
  });
  try {
    await pipeline(stream, counter, createWriteStream(temporaryPath, { flags: 'wx' }));
    if (!bytes) throw new Error(`ComfyUI ${label}下载结果为空。`);
    await rename(temporaryPath, targetPath);
    return `/output/${encodeURIComponent(fileName)}`;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function saveComfyAudioOutput(baseUrl, descriptor, clientOptions = {}) {
  return saveComfyBinaryOutput(baseUrl, descriptor, clientOptions, {
    label: '音频',
    maximumBytes: MAX_COMFYUI_AUDIO_BYTES,
    extensionFor: (item, mime, prefix) =>
      generatedAudioFileExtension(
        new URL(
          encodeURIComponent(String(item?.filename || 'output.mp3')),
          'https://comfy-output.invalid/',
        ).toString(),
        mime,
        prefix,
      ),
  });
}

async function saveComfy3dOutput(baseUrl, descriptor, clientOptions = {}) {
  return saveComfyBinaryOutput(baseUrl, descriptor, clientOptions, {
    label: '3D 文件',
    maximumBytes: MAX_COMFYUI_3D_BYTES,
    extensionFor: comfy3dOutputExtension,
  });
}

function reportComfyProgress(reportProgress, event) {
  if (typeof reportProgress !== 'function') return;
  const baseProgress =
    event.type === 'execution_success'
      ? 98
      : event.type === 'executed'
        ? 95
        : event.type === 'execution_start'
          ? 5
          : event.type === 'reconnected'
            ? 3
            : event.type === 'connected'
              ? 2
              : 1;
  const progress = Number.isFinite(event.progress)
    ? Math.max(5, Math.min(94, Math.round(5 + event.progress * 0.89)))
    : baseProgress;
  reportProgress({
    progress,
    phase: event.type,
    ...(typeof event.nodeId === 'string' && event.nodeId ? { nodeId: event.nodeId } : {}),
    ...(Number.isSafeInteger(event.queueRemaining) ? { queueRemaining: event.queueRemaining } : {}),
  });
}

async function bridgeGenerateComfyImage(body, provider, prompt, referenceImages, reportProgress) {
  const connection = comfyConnection(provider);
  const { baseUrl } = connection;
  const workflowId = String(provider.model || body.model || '').trim();
  const preset = (await readComfyWorkflowLibrary()).items.find(
    (item) => item.id === workflowId && item.connectionId === connection.connectionId,
  );
  if (!preset || preset.kind !== 'image')
    throw new Error('所选 ComfyUI 图片工作流不存在，请在 API 设置中重新导入。');
  await assertComfyWorkflowCompatible(preset, connection);
  if (!prompt) throw new Error('图片提示词不能为空。');
  if (referenceImages.length > 2) throw new Error('本地 ComfyUI 图片工作流最多接收两张参考图片。');
  const uploadedImages = [];
  for (let index = 0; index < referenceImages.length; index += 1) {
    const blob = await toBlob(referenceImages[index], { localOnly: true });
    if (!String(blob.type || '').startsWith('image/')) {
      throw new Error(`第 ${index + 1} 个 ComfyUI 参考素材不是图片。`);
    }
    uploadedImages.push(
      await uploadComfyImage(
        baseUrl,
        blob,
        comfyUploadFileName(blob, index + 1),
        connection.options,
      ),
    );
  }
  const prepared = prepareComfyImageWorkflow(preset, {
    prompt,
    uploadedImages,
    seed: randomInt(0, 0x7fffffff),
  });
  const clientId = `qiansi-${randomUUID()}`;
  const { promptId } = await queueComfyWorkflow(baseUrl, prepared.workflow, {
    clientId,
    ...connection.options,
  });
  const history = await waitForComfyJob(baseUrl, promptId, {
    clientId,
    ...connection.options,
    onEvent: (event) => reportComfyProgress(reportProgress, event),
  });
  const output = parseComfyHistoryOutputDescriptors(history, {
    outputNodeId: prepared.outputNodeId || undefined,
  }).find(
    (item) => item.bucket === 'images' || /\.(png|jpe?g|webp|gif|avif)$/i.test(item.filename),
  );
  if (!output)
    throw new Error('ComfyUI 工作流已完成，但没有找到图片输出。请检查 QIANSI_OUTPUT 节点。');
  const url = await saveComfyImageOutput(baseUrl, output, connection.options);
  return { images: [url], url };
}

function normalizedComfyMode(value) {
  const mode = String(value || '文生视频').trim();
  if (mode === 'first-frame') return '图生视频';
  if (mode === 'last-frame') return '图生视频';
  if (mode === 'both-frames') return '首尾帧';
  if (mode === '首尾帧视频') return '首尾帧';
  return mode;
}

async function bridgeGenerateComfyVideo(
  body,
  provider,
  prompt,
  referenceImages,
  referenceAudios,
  reportProgress,
) {
  const connection = comfyConnection(provider);
  const { baseUrl } = connection;
  const workflowId = String(provider.model || body.model || '').trim();
  const library = await readComfyWorkflowLibrary();
  const preset = library.items.find(
    (item) => item.id === workflowId && item.connectionId === connection.connectionId,
  );
  if (!preset) throw new Error('所选 ComfyUI 工作流不存在，请在 API 设置中重新导入。');
  await assertComfyWorkflowCompatible(preset, connection);
  if (!prompt) throw new Error('视频提示词不能为空。');
  if (referenceAudios.length) throw new Error('当前本地 ComfyUI 工作流尚未配置参考音频输入。');
  if (referenceImages.length > 2) throw new Error('当前本地 ComfyUI 工作流最多接收两张参考图片。');

  const requestedMode = normalizedComfyMode(body.mode);
  const mode = preset.modes.length === 1 ? preset.modes[0] : requestedMode;
  if (!preset.modes.includes(mode)) {
    throw new Error(`${preset.name} 不支持“${mode}”，请更换生成类型或工作流。`);
  }
  const isCharacterSwap = mode === '视频换人物';
  const hasSourceVideo = typeof body.sourceVideo === 'string' && body.sourceVideo.trim().length > 0;
  const expectedReferenceCount = isCharacterSwap
    ? 0
    : mode === '文生视频'
      ? 0
      : mode === '图生视频'
        ? 1
        : 2;
  if (referenceImages.length !== expectedReferenceCount) {
    throw new Error(
      `${preset.name} 的“${mode}”需要 ${expectedReferenceCount} 张参考图片，当前收到 ${referenceImages.length} 张。`,
    );
  }
  if (referenceImages.length && !preset.bindings.image && !isCharacterSwap) {
    throw new Error('这个工作流没有配置 QIANSI_IMAGE 参考图节点。');
  }
  if (referenceImages.length > 1 && !preset.bindings.endImage && !isCharacterSwap) {
    throw new Error('这个工作流没有配置第二张参考图片输入节点。');
  }
  if (isCharacterSwap && !preset.bindings.sourceVideo) {
    throw new Error('视频换人物工作流缺少 QIANSI_SOURCE_VIDEO 原视频输入。');
  }
  if (isCharacterSwap && !preset.bindings.characterImage) {
    throw new Error('视频换人物工作流缺少 QIANSI_CHARACTER_IMAGE 目标人物输入。');
  }
  if (isCharacterSwap && !body.sourceVideo) {
    throw new Error('“视频换人物”需要连接一条原视频。');
  }
  if (isCharacterSwap && !body.characterReferenceImage) {
    throw new Error('“视频换人物”需要连接一张目标人物图片。');
  }
  if (hasSourceVideo && !preset.bindings.sourceVideo) {
    throw new Error('当前 ComfyUI 工作流未配置 QIANSI_SOURCE_VIDEO，不能提交连接的参考视频。');
  }

  const uploadedImages = [];
  for (let index = 0; index < referenceImages.length; index += 1) {
    const blob = await toBlob(referenceImages[index], { localOnly: true });
    if (!String(blob.type || '').startsWith('image/')) {
      throw new Error(`第 ${index + 1} 个 ComfyUI 参考素材不是图片。`);
    }
    uploadedImages.push(
      await uploadComfyImage(
        baseUrl,
        blob,
        comfyUploadFileName(blob, index + 1),
        connection.options,
      ),
    );
  }

  let uploadedVideo;
  let uploadedCharacterImage;
  let uploadedMask;
  if (hasSourceVideo) {
    const sourceBlob = await toBlob(body.sourceVideo, { localOnly: true });
    uploadedVideo = await uploadComfyFile(
      baseUrl,
      sourceBlob,
      comfyUploadFileName(sourceBlob, 'source-video'),
      connection.options,
    );
  }
  if (isCharacterSwap) {
    const characterBlob = await toBlob(body.characterReferenceImage, { localOnly: true });
    if (!String(characterBlob.type || '').startsWith('image/')) {
      throw new Error('目标人物参考素材不是图片。');
    }
    uploadedCharacterImage = await uploadComfyImage(
      baseUrl,
      characterBlob,
      comfyUploadFileName(characterBlob, 'character-reference'),
      connection.options,
    );
    if (body.maskImage) {
      const maskBlob = await toBlob(body.maskImage, { localOnly: true });
      if (!String(maskBlob.type || '').startsWith('image/')) {
        throw new Error('人物遮罩素材不是图片。');
      }
      uploadedMask = await uploadComfyImage(
        baseUrl,
        maskBlob,
        comfyUploadFileName(maskBlob, 'character-mask'),
        connection.options,
      );
    }
  }

  const count = Number(body.count ?? 1);
  if (!Number.isSafeInteger(count) || count !== 1) {
    throw new Error('本地 ComfyUI 当前一次只生成 1 个视频，请把生成数量改为 1。');
  }
  const videos = [];
  for (let index = 0; index < count; index += 1) {
    const prepared = prepareComfyVideoWorkflow(preset, {
      prompt,
      uploadedImages,
      uploadedVideo,
      uploadedCharacterImage,
      uploadedMask,
      duration: body.duration,
      fps: body.fps,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      seed: randomInt(0, 0x7fffffff),
    });
    const clientId = `qiansi-${randomUUID()}`;
    const { promptId } = await queueComfyWorkflow(baseUrl, prepared.workflow, {
      clientId,
      ...connection.options,
    });
    const history = await waitForComfyJob(baseUrl, promptId, {
      clientId,
      ...connection.options,
      onEvent: (event) => reportComfyProgress(reportProgress, event),
    });
    const descriptors = extractComfyVideoOutputs(history, {
      outputNodeId: prepared.outputNodeId || undefined,
    });
    if (!descriptors.length) {
      throw new Error(
        'ComfyUI 工作流已完成，但没有找到 MP4、WebM、MOV、M4V 或 MKV 输出。请检查 QIANSI_OUTPUT 节点。',
      );
    }
    videos.push(await saveComfyVideoOutput(baseUrl, descriptors[0], connection.options));
  }
  return { videos, url: videos[0] };
}

async function bridgeGenerateComfyAudio(body, provider, prompt, reportProgress) {
  const connection = comfyConnection(provider);
  const workflowId = String(provider.model || body.model || '').trim();
  const preset = (await readComfyWorkflowLibrary()).items.find(
    (item) => item.id === workflowId && item.connectionId === connection.connectionId,
  );
  if (!preset || preset.kind !== 'audio') {
    throw new Error('所选 ComfyUI 音频工作流不存在，请在 API 设置中重新导入。');
  }
  await assertComfyWorkflowCompatible(preset, connection);
  if (preset.bindings.prompt && !prompt) throw new Error('音频提示词不能为空。');
  let uploadedAudio;
  if (typeof body.referenceAudio === 'string' && body.referenceAudio.trim()) {
    if (!preset.bindings.audio) throw new Error('这个工作流没有配置 QIANSI_AUDIO 音频输入节点。');
    const blob = await toBlob(body.referenceAudio, { localOnly: true });
    if (!String(blob.type || '').startsWith('audio/'))
      throw new Error('ComfyUI 参考素材不是音频。');
    uploadedAudio = await uploadComfyFile(
      connection.baseUrl,
      blob,
      comfyUploadFileName(blob, 'audio'),
      connection.options,
    );
  }
  if (preset.bindings.audio && !uploadedAudio) {
    throw new Error('这个音频工作流需要连接一条参考音频，不能继续使用导入时的占位音频。');
  }
  const prepared = prepareComfyAudioWorkflow(preset, {
    prompt,
    uploadedAudio,
    seed: randomInt(0, 0x7fffffff),
  });
  const clientId = `qiansi-${randomUUID()}`;
  const { promptId } = await queueComfyWorkflow(connection.baseUrl, prepared.workflow, {
    clientId,
    ...connection.options,
  });
  const history = await waitForComfyJob(connection.baseUrl, promptId, {
    clientId,
    ...connection.options,
    onEvent: (event) => reportComfyProgress(reportProgress, event),
  });
  const outputs = extractComfyAudioOutputs(history, {
    outputNodeId: prepared.outputNodeId || undefined,
  });
  if (!outputs.length) throw new Error('ComfyUI 工作流已完成，但没有找到音频输出。');
  const url = await saveComfyAudioOutput(connection.baseUrl, outputs[0], connection.options);
  return { audios: [url], url };
}

async function bridgeGenerateComfy3d(body, provider, prompt, referenceImages, reportProgress) {
  const connection = comfyConnection(provider);
  const workflowId = String(provider.model || body.model || '').trim();
  const preset = (await readComfyWorkflowLibrary()).items.find(
    (item) => item.id === workflowId && item.connectionId === connection.connectionId,
  );
  if (!preset || preset.kind !== '3d') {
    throw new Error('所选 ComfyUI 3D 工作流不存在，请在 API 设置中重新导入。');
  }
  await assertComfyWorkflowCompatible(preset, connection);
  if (preset.bindings.prompt && !prompt) throw new Error('3D 提示词不能为空。');
  if (referenceImages.length > 2) throw new Error('ComfyUI 3D 工作流最多接收两张参考图片。');
  if (referenceImages.length && !preset.bindings.image) {
    throw new Error('这个 3D 工作流没有配置 QIANSI_IMAGE 图片输入节点。');
  }
  if (preset.bindings.image && referenceImages.length === 0) {
    throw new Error('这个 3D 工作流需要连接参考图片，不能继续使用导入时的占位图片。');
  }
  if (referenceImages.length > 1 && !preset.bindings.endImage) {
    throw new Error('这个 3D 工作流没有配置第二张参考图片输入节点。');
  }
  const uploadedImages = [];
  for (let index = 0; index < referenceImages.length; index += 1) {
    const blob = await toBlob(referenceImages[index], { localOnly: true });
    if (!String(blob.type || '').startsWith('image/'))
      throw new Error('ComfyUI 3D 参考素材不是图片。');
    uploadedImages.push(
      await uploadComfyImage(
        connection.baseUrl,
        blob,
        comfyUploadFileName(blob, index + 1),
        connection.options,
      ),
    );
  }
  const prepared = prepareComfy3dWorkflow(preset, {
    prompt,
    uploadedImages,
    seed: randomInt(0, 0x7fffffff),
  });
  const clientId = `qiansi-${randomUUID()}`;
  const { promptId } = await queueComfyWorkflow(connection.baseUrl, prepared.workflow, {
    clientId,
    ...connection.options,
  });
  const history = await waitForComfyJob(connection.baseUrl, promptId, {
    clientId,
    ...connection.options,
    onEvent: (event) => reportComfyProgress(reportProgress, event),
  });
  const outputs = extractComfy3dOutputs(history, {
    outputNodeId: prepared.outputNodeId || undefined,
  });
  if (!outputs.length) throw new Error('ComfyUI 工作流已完成，但没有找到 3D 输出。');
  const url = await saveComfy3dOutput(connection.baseUrl, outputs[0], connection.options);
  return { models3d: [url], url };
}

const JIMENG_IMAGE_RESULT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const JIMENG_VIDEO_RESULT_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const JIMENG_AUDIO_REFERENCE_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const JIMENG_IMAGE_TIMEOUT_MS = 15 * 60 * 1000;
const JIMENG_VIDEO_TIMEOUT_MS = 45 * 60 * 1000;
const JIMENG_QUERY_INTERVAL_MS = 2500;

function waitForJimengQuery() {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, JIMENG_QUERY_INTERVAL_MS));
}

async function runDreaminaGeneration(commandPath, args, timeoutMs) {
  if (platform() === 'win32' && /\.(?:cmd|bat)$/i.test(commandPath)) {
    throw new Error('即梦生成只允许直接运行官方 dreamina.exe，拒绝命令脚本。');
  }
  const result = await execute(commandPath, args, '', timeoutMs, {
    cwd: GEN_OUTPUT_ROOT,
    maxOutput: 8 * 1024 * 1024,
  });
  if (result.code !== 0) {
    throw new Error(
      compactCliText(result.stderr || result.stdout || `dreamina 退出码 ${result.code}`, 2400),
    );
  }
  return { ...result, raw: parseCliPayload(result.stdout || result.stderr) };
}

async function jimengImageReferencePath(value) {
  try {
    return await codexImageReferencePath(value);
  } catch (localError) {
    const source = String(value || '').trim();
    if (!/^https?:\/\//i.test(source)) throw localError;
    const { bytes, mime } = await readRemoteAsset(source, '即梦参考图');
    const normalizedMime = String(mime || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const extension = ASSET_MIME_EXTENSIONS.get(normalizedMime);
    if (!extension || !JIMENG_IMAGE_RESULT_EXTENSIONS.has(extension)) {
      throw new Error('即梦参考图只支持 PNG、JPEG、WebP 或 GIF。');
    }
    await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
    const path = join(
      GEN_OUTPUT_ROOT,
      `jimeng-reference-${randomUUID().replace(/-/g, '')}${extension}`,
    );
    await writeFile(path, bytes);
    return { path, temporary: true };
  }
}

async function jimengAudioReferencePath(value) {
  const source = String(value || '').trim();
  if (!source) throw new Error('即梦参考音频不能为空。');
  const dataMatch = /^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(source);
  if (dataMatch) {
    const bytes = Buffer.from(dataMatch[2].replace(/\s/g, ''), 'base64');
    if (!bytes.length || bytes.length > MAX_REMOTE_ASSET_BYTES) {
      throw new Error('即梦参考音频为空或超过 32 MB 限制。');
    }
    const extension = ASSET_MIME_EXTENSIONS.get(dataMatch[1].toLowerCase());
    if (!extension || !JIMENG_AUDIO_REFERENCE_EXTENSIONS.has(extension)) {
      throw new Error('即梦参考音频只支持 MP3、WAV、OGG 或 M4A。');
    }
    await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
    const path = join(
      GEN_OUTPUT_ROOT,
      `jimeng-audio-${randomUUID().replace(/-/g, '')}${extension}`,
    );
    await writeFile(path, bytes);
    return { path, temporary: true };
  }

  let parsed;
  try {
    parsed = new URL(source, `http://${HOST}:${PORT}`);
  } catch {
    parsed = null;
  }
  const localBridge = Boolean(parsed && isLocalBridgeUrl(parsed));
  const assetMatch = localBridge
    ? /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(parsed.pathname)
    : null;
  if (assetMatch) {
    const library = await readAssetLibrary();
    const item = library.items.find(
      (entry) =>
        entry.id === assetMatch[1] && entry.fileName && String(entry.mime).startsWith('audio/'),
    );
    if (!item) throw new Error('即梦参考音频在素材库中不存在。');
    const path = managedAssetFilePath(item.fileName);
    if (!existsSync(path) || !JIMENG_AUDIO_REFERENCE_EXTENSIONS.has(extname(path).toLowerCase())) {
      throw new Error('即梦参考音频文件不存在或格式不受支持。');
    }
    return { path, temporary: false };
  }
  const outputMatch = localBridge ? /^\/output\/([A-Za-z0-9_.-]+)$/.exec(parsed.pathname) : null;
  if (outputMatch) {
    const path = join(GEN_OUTPUT_ROOT, outputMatch[1]);
    if (!existsSync(path) || !JIMENG_AUDIO_REFERENCE_EXTENSIONS.has(extname(path).toLowerCase())) {
      throw new Error('即梦参考音频文件不存在或格式不受支持。');
    }
    return { path, temporary: false };
  }
  if (!/^https?:\/\//i.test(source)) {
    throw new Error('即梦参考音频必须先上传、生成或保存到本机素材库。');
  }
  const { bytes, mime } = await readRemoteAsset(source, '即梦参考音频');
  const normalizedMime = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const extension = ASSET_MIME_EXTENSIONS.get(normalizedMime);
  if (!extension || !JIMENG_AUDIO_REFERENCE_EXTENSIONS.has(extension)) {
    throw new Error('即梦参考音频只支持 MP3、WAV、OGG 或 M4A。');
  }
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const path = join(GEN_OUTPUT_ROOT, `jimeng-audio-${randomUUID().replace(/-/g, '')}${extension}`);
  await writeFile(path, bytes);
  return { path, temporary: true };
}

async function prepareJimengReferences(values, kind = 'image') {
  const prepared = [];
  const temporaryPaths = [];
  try {
    for (const value of values) {
      const reference =
        kind === 'audio'
          ? await jimengAudioReferencePath(value)
          : await jimengImageReferencePath(value);
      prepared.push(reference.path);
      if (reference.temporary) temporaryPaths.push(reference.path);
    }
    return { prepared, temporaryPaths };
  } catch (error) {
    await Promise.all(temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
}

async function jimengDownloadedResults(downloadRoot, kind) {
  const supported =
    kind === 'image' ? JIMENG_IMAGE_RESULT_EXTENSIONS : JIMENG_VIDEO_RESULT_EXTENSIONS;
  const entries = await readdir(downloadRoot).catch(() => []);
  const candidates = [];
  for (const name of entries) {
    if (!supported.has(extname(name).toLowerCase())) continue;
    const path = join(downloadRoot, name);
    try {
      const fileStat = await stat(path);
      if (!fileStat.isFile() || fileStat.size <= 0) continue;
      candidates.push({ path, mtimeMs: fileStat.mtimeMs });
    } catch {
      /* file disappeared while collecting results */
    }
  }
  return candidates.sort((a, b) => a.mtimeMs - b.mtimeMs).map((item) => item.path);
}

async function verifiedCliOutputFile(source, allowedRoot) {
  const absolutePath = resolve(source);
  const rootPath = await realpath(resolve(allowedRoot));
  const outputPath = await realpath(absolutePath);
  const relativePath = relative(rootPath, outputPath);
  if (relativePath.startsWith('..') || relativePath.includes(':')) {
    throw new Error('CLI 输出解析到了任务目录之外。');
  }
  const linkStat = await lstat(absolutePath);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new Error('CLI 输出不能是符号链接、目录联接或特殊文件。');
  }
  return { absolutePath, fileStat: linkStat };
}

async function publicJimengResult(source, kind, downloadRoot) {
  let localPath = String(source || '').trim();
  if (/^file:\/\//i.test(localPath)) {
    try {
      localPath = decodeURIComponent(new URL(localPath).pathname);
    } catch {
      localPath = '';
    }
  }
  if (platform() === 'win32' && /^\/[A-Za-z]:\//.test(localPath)) localPath = localPath.slice(1);
  if (
    localPath &&
    !/^(?:[A-Za-z]:[\\/]|\/|https?:\/\/|data:)/i.test(localPath) &&
    !localPath.includes('\0')
  ) {
    localPath = resolve(downloadRoot, localPath);
  }
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(localPath)) {
    const { absolutePath, fileStat } = await verifiedCliOutputFile(localPath, downloadRoot);
    const relativePath = relative(resolve(downloadRoot), absolutePath);
    const supported =
      kind === 'image' ? JIMENG_IMAGE_RESULT_EXTENSIONS : JIMENG_VIDEO_RESULT_EXTENSIONS;
    if (
      relativePath.startsWith('..') ||
      relativePath.includes(':') ||
      !supported.has(extname(absolutePath).toLowerCase())
    ) {
      throw new Error('即梦 CLI 返回了本次任务目录之外的媒体文件，已拒绝读取。');
    }
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_ASSET_BYTES) {
      throw new Error('即梦 CLI 返回的媒体文件为空或过大。');
    }
    const targetName = genOutputFile(extname(absolutePath).toLowerCase());
    await rename(absolutePath, join(GEN_OUTPUT_ROOT, targetName));
    return `/output/${encodeURIComponent(targetName)}`;
  }
  if (/^(?:https?:\/\/|data:)/i.test(localPath)) return saveGeneratedImage(localPath, kind);
  throw new Error('即梦 CLI 返回了无法识别的媒体地址。');
}

async function saveJimengResults(queryPayload, downloadRoot, kind, expectedCount) {
  const exactItems = collectDreaminaMediaItems(queryPayload, kind);
  const urls = [];
  for (const item of exactItems) {
    if (urls.length >= expectedCount) break;
    let saved = '';
    if (item.path) {
      saved = await publicJimengResult(item.path, kind, downloadRoot).catch(() => '');
    }
    if (!saved && item.url) saved = await publicJimengResult(item.url, kind, downloadRoot);
    if (saved && !urls.includes(saved)) urls.push(saved);
  }
  if (urls.length < expectedCount) {
    const downloaded = await jimengDownloadedResults(downloadRoot, kind);
    for (const source of downloaded) {
      if (urls.length >= expectedCount) break;
      const url = await publicJimengResult(source, kind, downloadRoot);
      if (!urls.includes(url)) urls.push(url);
    }
  }
  if (urls.length < expectedCount) {
    throw new Error(
      `即梦任务成功，但预期 ${expectedCount} 个结果，只保存到 ${urls.length} 个有效媒体文件。`,
    );
  }
  return urls;
}

async function submitAndPollJimeng(command, kind) {
  const status = await jimengStatus(true);
  if (
    !status.installed ||
    status.runnable !== true ||
    status.authenticated !== true ||
    status.ready !== true
  ) {
    throw new Error(status.message || '即梦 CLI 尚未通过真实登录检测，已拒绝生成。');
  }
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const startedAt = Date.now();
  const submitted = await runDreaminaGeneration(
    status.commandPath,
    [command.command, ...command.args],
    2 * 60 * 1000,
  );
  const submitId = extractDreaminaSubmitId(submitted.raw);
  // Submission is deliberately executed exactly once. Polling failures are
  // surfaced with the submit_id so the user can recover manually without a
  // second credit-consuming submission.
  invalidateJimengStatus();
  const deadline =
    startedAt + (kind === 'image' ? JIMENG_IMAGE_TIMEOUT_MS : JIMENG_VIDEO_TIMEOUT_MS);
  const downloadRoot = join(
    GEN_OUTPUT_ROOT,
    `jimeng-task-${submitId}-${randomUUID().replace(/-/g, '')}`,
  );
  await mkdir(downloadRoot, { recursive: false });
  try {
    while (Date.now() <= deadline) {
      const queried = await runDreaminaGeneration(
        status.commandPath,
        ['query_result', `--submit_id=${submitId}`, `--download_dir=${downloadRoot}`],
        60_000,
      ).catch((error) => {
        throw new Error(
          `即梦任务 ${submitId} 查询失败；任务不会自动重新提交。${error instanceof Error ? error.message : ''}`,
        );
      });
      const observation = inspectDreaminaQueryResult(queried.raw, kind);
      if (observation.state === 'error') {
        throw new Error(`即梦任务 ${submitId} 失败：${observation.message}`);
      }
      if (observation.state === 'success') {
        return saveJimengResults(queried.raw, downloadRoot, kind, command.expectedCount);
      }
      await waitForJimengQuery();
    }
    throw new Error(
      `即梦任务 ${submitId} 查询超时；任务不会自动重新提交，可用 query_result 手动查询。`,
    );
  } finally {
    await rm(downloadRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function bridgeGenerateJimengImage(body, model, prompt, referenceImages) {
  const placeholders = referenceImages.map((_, index) => `reference-${index + 1}.png`);
  buildJimengImageCommand({
    model,
    prompt,
    referencePaths: placeholders,
    aspectRatio: body.aspectRatio,
    resolution: body.quality || undefined,
    count: body.count ?? 1,
  });
  const { prepared, temporaryPaths } = await prepareJimengReferences(referenceImages);
  try {
    const command = buildJimengImageCommand({
      model,
      prompt,
      referencePaths: prepared,
      aspectRatio: body.aspectRatio,
      resolution: body.quality || undefined,
      count: body.count ?? 1,
    });
    const images = await submitAndPollJimeng(command, 'image');
    return { images, url: images[0] };
  } finally {
    await Promise.all(temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

async function bridgeGenerateJimengVideo(body, model, prompt, referenceImages, referenceAudios) {
  const placeholders = referenceImages.map((_, index) => `reference-${index + 1}.png`);
  const audioPlaceholders = referenceAudios.map((_, index) => `reference-audio-${index + 1}.mp3`);
  buildJimengVideoCommand({
    model,
    prompt,
    referencePaths: placeholders,
    referenceAudioPaths: audioPlaceholders,
    mode: body.mode,
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    duration: body.duration,
    count: body.count ?? 1,
    fps: body.fps,
  });
  const imageReferences = await prepareJimengReferences(referenceImages);
  let audioReferences;
  try {
    audioReferences = await prepareJimengReferences(referenceAudios, 'audio');
    const command = buildJimengVideoCommand({
      model,
      prompt,
      referencePaths: imageReferences.prepared,
      referenceAudioPaths: audioReferences.prepared,
      mode: body.mode,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      duration: body.duration,
      count: body.count ?? 1,
      fps: body.fps,
    });
    const videos = await submitAndPollJimeng(command, 'video');
    return { videos, url: videos[0] };
  } finally {
    await Promise.all(
      [...imageReferences.temporaryPaths, ...(audioReferences?.temporaryPaths || [])].map((path) =>
        unlink(path).catch(() => undefined),
      ),
    );
  }
}

async function publishLocalCliOutput(source, kind, allowedRoot) {
  const { absolutePath, fileStat } = await verifiedCliOutputFile(source, allowedRoot);
  const relativePath = relative(resolve(allowedRoot), absolutePath);
  const supported =
    kind === 'image' ? JIMENG_IMAGE_RESULT_EXTENSIONS : JIMENG_VIDEO_RESULT_EXTENSIONS;
  if (
    relativePath.startsWith('..') ||
    relativePath.includes(':') ||
    !supported.has(extname(absolutePath).toLowerCase())
  ) {
    throw new Error('CLI 返回了任务目录之外或格式不受支持的文件。');
  }
  if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_ASSET_BYTES) {
    throw new Error('CLI 生成文件为空或超过大小限制。');
  }
  const targetName = genOutputFile(extname(absolutePath).toLowerCase());
  await rename(absolutePath, join(GEN_OUTPUT_ROOT, targetName));
  return `/output/${encodeURIComponent(targetName)}`;
}

async function bridgeGenerateBailianImage(body, model, prompt, referenceImages) {
  const status = await bailianStatus(true);
  if (!status.ready) throw new Error(status.message || '百炼 CLI 尚未就绪。');
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const taskRoot = join(GEN_OUTPUT_ROOT, `bailian-image-${randomUUID().replace(/-/g, '')}`);
  await mkdir(taskRoot, { recursive: false });
  const references = await prepareJimengReferences(referenceImages);
  try {
    const args = bailianImageArgs({
      model,
      prompt,
      referencePaths: references.prepared,
      size: body.size,
      count: body.count,
      outputDirectory: taskRoot,
    });
    const result = await execute(status.commandPath, args, '', 30 * 60 * 1000, {
      cwd: taskRoot,
    });
    if (result.code !== 0) {
      throw new Error(compactCliText(result.stderr || result.stdout, 2000) || '百炼图片生成失败。');
    }
    const generated = await jimengDownloadedResults(taskRoot, 'image');
    if (!generated.length) {
      throw new Error('百炼 CLI 已完成，但输出目录中没有可用图片。');
    }
    const expectedCount = Math.max(1, Math.min(6, Number(body.count || 1)));
    const images = [];
    for (const path of generated.slice(0, expectedCount)) {
      images.push(await publishLocalCliOutput(path, 'image', taskRoot));
    }
    return { images, url: images[0] };
  } finally {
    await Promise.all(references.temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
    await rm(taskRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function bridgeGenerateBailianVideo(body, model, prompt, referenceImages, referenceAudios) {
  if (referenceImages.length > 1) throw new Error('百炼普通视频生成最多支持一张参考图。');
  if (referenceAudios.length) throw new Error('百炼普通视频生成暂未接入参考音频。');
  const status = await bailianStatus(true);
  if (!status.ready) throw new Error(status.message || '百炼 CLI 尚未就绪。');
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const taskRoot = join(GEN_OUTPUT_ROOT, `bailian-video-${randomUUID().replace(/-/g, '')}`);
  await mkdir(taskRoot, { recursive: false });
  const references = await prepareJimengReferences(referenceImages);
  try {
    const outputPath = join(taskRoot, 'result.mp4');
    const args = bailianVideoArgs({
      model,
      prompt,
      referencePath: references.prepared[0],
      duration: body.duration,
      aspectRatio: body.aspectRatio,
      outputPath,
    });
    const result = await execute(status.commandPath, args, '', 60 * 60 * 1000, {
      cwd: taskRoot,
    });
    if (result.code !== 0) {
      throw new Error(compactCliText(result.stderr || result.stdout, 2000) || '百炼视频生成失败。');
    }
    if (!existsSync(outputPath)) throw new Error('百炼 CLI 已完成，但没有下载视频文件。');
    const url = await publishLocalCliOutput(outputPath, 'video', taskRoot);
    return { videos: [url], url };
  } finally {
    await Promise.all(references.temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
    await rm(taskRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function bridgeGenerateLightX2V(body, kind, prompt, referenceImages, referenceAudios) {
  if (referenceImages.length > 1) throw new Error('LightX2V 适配器目前最多接收一张参考图。');
  if (referenceAudios.length) throw new Error('LightX2V 适配器尚未接入参考音频。');
  const config = lightX2VConfig;
  const status = await readLightX2VStatus();
  if (!status.ready) throw new Error(status.message || 'LightX2V 尚未就绪。');
  if (kind === 'image' && !status.imageGeneration) throw new Error('LightX2V 图片配置未通过检测。');
  if (kind === 'video' && !status.videoGeneration) throw new Error('LightX2V 视频配置未通过检测。');
  await mkdir(GEN_OUTPUT_ROOT, { recursive: true });
  const taskRoot = join(GEN_OUTPUT_ROOT, `lightx2v-${kind}-${randomUUID().replace(/-/g, '')}`);
  await mkdir(taskRoot, { recursive: false });
  const references = await prepareJimengReferences(referenceImages);
  const runtime = status.runtimeConfig;
  try {
    const extension = kind === 'image' ? '.png' : '.mp4';
    const outputPath = join(taskRoot, `result${extension}`);
    const hasReference = Boolean(references.prepared[0]);
    const configuredTask = String(kind === 'image' ? config.imageTask : config.videoTask)
      .trim()
      .toLowerCase();
    const allowedTasks = kind === 'image' ? new Set(['t2i', 'i2i']) : new Set(['t2v', 'i2v']);
    if (!allowedTasks.has(configuredTask)) {
      throw new Error(`LightX2V ${kind === 'image' ? '图片' : '视频'}任务类型配置无效。`);
    }
    if (configuredTask.startsWith('i2') && !hasReference) {
      throw new Error(`当前 LightX2V 配置为 ${configuredTask}，必须连接一张参考图。`);
    }
    if (configuredTask.startsWith('t2') && hasReference) {
      throw new Error(
        `当前 LightX2V 配置为 ${configuredTask}，不能接收参考图；请改用对应 i2i/i2v 配置。`,
      );
    }
    const requestPayload = {
      modelPath: kind === 'image' ? runtime.imageModelPath : runtime.videoModelPath,
      modelClass: kind === 'image' ? config.imageModelClass : config.videoModelClass,
      configPath: kind === 'image' ? runtime.imageConfigPath : runtime.videoConfigPath,
      task: configuredTask,
      prompt,
      imagePath: references.prepared[0] || '',
      outputPath,
      seed: Number(body.seed || 42),
    };
    const result = await execute(
      runtime.executablePath,
      [join(PROJECT_ROOT, 'lightx2v-adapter.py')],
      JSON.stringify(requestPayload),
      60 * 60 * 1000,
      { cwd: runtime.workingDirectory, maxOutput: MAX_OUTPUT },
    );
    if (result.code !== 0) {
      throw new Error(
        compactCliText(result.stderr || result.stdout, 2400) || 'LightX2V 推理失败。',
      );
    }
    if (!existsSync(outputPath)) throw new Error('LightX2V 已完成，但没有生成有效媒体文件。');
    const url = await publishLocalCliOutput(outputPath, kind, taskRoot);
    return kind === 'image' ? { images: [url], url } : { videos: [url], url };
  } finally {
    await Promise.all(references.temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
    await rm(taskRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function imageAdapterForProvider(provider) {
  const adapter = imageApiAdapter(
    String(provider.providerId || '').trim(),
    String(provider.protocol || '').trim(),
  );
  if (adapter === 'unsupported-kling') {
    throw new Error('可灵官方签名与异步任务适配尚未完成，当前不会发送伪 OpenAI 请求。');
  }
  if (adapter === 'unsupported-modelscope') {
    throw new Error('ModelScope 图片模型需要异步任务轮询，当前版本仅保留其文本模型。');
  }
  return adapter;
}

function providerImageEndpoint(baseUrl, endpoint) {
  const base = safeProviderBaseUrl(baseUrl);
  const path = String(endpoint || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('图片接口路径必须是以单个 / 开头的相对路径。');
  }
  if (/\/v1$/i.test(base) && /^\/v1(?:\/|$)/i.test(path)) {
    return `${base.replace(/\/v1$/i, '')}${path}`;
  }
  if (/\/api\/v3$/i.test(base) && /^\/api\/v3(?:\/|$)/i.test(path)) {
    return `${base.replace(/\/api\/v3$/i, '')}${path}`;
  }
  return `${base}${path}`;
}

async function imageRequestBody(spec) {
  if (spec.bodyKind === 'json') {
    return { body: JSON.stringify(spec.body), multipart: false };
  }
  if (spec.bodyKind !== 'multipart') throw new Error('图片适配器返回了未知请求格式。');
  const form = new FormData();
  for (const [key, value] of Object.entries(spec.fields || {})) form.append(key, String(value));
  for (const [index, file] of (spec.files || []).entries()) {
    form.append(file.field, await toBlob(file.source), `ref${index}.png`);
  }
  return { body: form, multipart: true };
}

function publicHttpsImageReferences(references, providerName) {
  return references.map((value) => {
    let url;
    try {
      url = new URL(String(value || ''));
    } catch {
      throw new Error(`${providerName} 参考图必须是上游可访问的 HTTPS 图片地址。`);
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`${providerName} 参考图必须是无内嵌凭据的 HTTPS 图片地址。`);
    }
    return url.toString();
  });
}

async function inlineImageReferences(references) {
  return Promise.all(
    references.map(async (value) => {
      const blob = await toBlob(value);
      const mime = String(blob.type || 'image/png').split(';')[0];
      if (!/^image\/(?:png|jpeg|webp)$/i.test(mime)) {
        throw new Error(`参考图格式 ${mime || '未知'} 不受上游接口支持。`);
      }
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      return `data:${mime};base64,${base64}`;
    }),
  );
}

async function fetchImageProviderJson(url, provider, requestBody) {
  const headers = authHeaders(provider);
  if (requestBody.multipart) delete headers['Content-Type'];
  const response = await freshProviderRequest({
    url,
    method: 'POST',
    headers,
    body: requestBody.body,
    timeoutMs: PROVIDER_IMAGE_TIMEOUT_MS,
    maxRequestBytes: MAX_REMOTE_ASSET_BYTES,
    maxResponseBytes: MAX_PROVIDER_IMAGE_RESPONSE_BYTES,
    label: '上游图片接口地址',
    ...providerTransportTrust(url),
  });
  const json = await readLimitedProviderJson(
    response,
    MAX_PROVIDER_IMAGE_RESPONSE_BYTES,
    '上游图片接口响应',
  ).catch(() => ({}));
  if (!response.ok) {
    const detail =
      json?.error && typeof json.error === 'object'
        ? String(json.error.message || '')
        : String(json?.error || json?.message || '');
    throw new Error(detail || `上游图片接口返回 HTTP ${response.status}。`);
  }
  return json;
}

async function waitForBflImage(submitted, provider) {
  const deadline = Date.now() + 8 * 60 * 1000;
  let delayMs = 1_000;
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    const pollingUrl = safeRemoteUrl(submitted.pollingUrl, 'BFL 轮询地址');
    const response = await freshProviderRequest({
      url: pollingUrl,
      headers: authHeaders(provider),
      timeoutMs: REMOTE_ASSET_TIMEOUT_MS,
      maxResponseBytes: MAX_PROVIDER_TEXT_RESPONSE_BYTES,
      label: 'BFL 轮询地址',
      ...providerTransportTrust(pollingUrl),
    });
    const json = await readLimitedProviderJson(
      response,
      MAX_PROVIDER_TEXT_RESPONSE_BYTES,
      'BFL 任务响应',
    ).catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.error?.message || `BFL 任务查询返回 HTTP ${response.status}。`);
    }
    const polled = parseImageProviderResponse('bfl', json, { phase: 'poll' });
    if (polled.state === 'success') return polled.images;
    delayMs = Math.min(5_000, Math.round(delayMs * 1.4));
  }
  throw new Error('BFL 图片任务等待超过 8 分钟，请稍后重试。');
}

async function saveAdapterImages(sources) {
  const images = [];
  for (const source of sources) images.push(await saveGeneratedImage(source));
  if (!images.length) throw new Error('上游未返回图片。');
  return { images, url: images[0] };
}

function authHeaders(provider) {
  const headers = { 'Content-Type': 'application/json' };
  const key = String(provider.apiKey || '').trim();
  if (!key) return headers;
  if (provider.authType === 'api-key') headers['api-key'] = key;
  else if (provider.authType === 'x-key') headers['x-key'] = key;
  else headers['Authorization'] = `Bearer ${key}`;
  return headers;
}

function assertCanvasGenerationProvider(provider) {
  const protocol = assertActiveProvider(provider);
  if (protocol === 'volcengine-cli') {
    throw new Error(
      '山火 CLI（火山方舟官方 Ark CLI）已接入安装与身份诊断，但画布生成适配器尚未启用。请暂时使用火山方舟 API 服务商生成内容。',
    );
  }
  return protocol;
}

async function bridgeGenerateImage(body, execution = {}) {
  const provider = body.provider || {};
  assertCanvasGenerationProvider(provider);
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('图片提示词不能为空。');
  const model = String(provider.model || body.model || '').trim();
  if (!model) throw new Error('未指定图片模型。');
  const count = Math.max(1, Math.min(4, Math.floor(Number(body.count || 1) || 1)));
  const size = String(body.size || '1024x1024');
  const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
  if (provider.protocol === 'comfyui')
    return bridgeGenerateComfyImage(
      body,
      provider,
      prompt,
      referenceImages,
      execution.reportProgress,
    );
  const providerRoute = imageProviderRoute(provider.protocol);
  if (providerRoute === 'jimeng-cli') {
    return bridgeGenerateJimengImage(body, model, prompt, referenceImages);
  }
  if (providerRoute === 'codex-cli' || providerRoute === 'codebuddy-cli') {
    const cliProvider = providerRoute === 'codebuddy-cli' ? 'codebuddy' : 'codex';
    const cliLabel = cliProvider === 'codebuddy' ? 'WorkBuddy CLI' : 'Codex CLI';
    const item = await runCodexImage(
      {
        ...body,
        prompt,
        referenceImages,
        title:
          body.title || (referenceImages.length ? `${cliLabel} 图片修改` : `${cliLabel} 图片生成`),
      },
      cliProvider,
    );
    const outputUrl = String(item.url || '');
    return { images: [outputUrl], url: outputUrl };
  }
  if (providerRoute === 'bailian-cli') {
    return bridgeGenerateBailianImage(body, model, prompt, referenceImages);
  }
  if (providerRoute === 'lightx2v-cli') {
    return bridgeGenerateLightX2V(body, 'image', prompt, referenceImages, []);
  }
  const adapter = imageAdapterForProvider(provider);
  const adapterAspectRatio =
    adapter === 'ideogram-v3' ? String(body.aspectRatio || '').replace(':', 'x') : body.aspectRatio;
  const adapterReferences =
    adapter === 'volcengine'
      ? await inlineImageReferences(referenceImages)
      : adapter === 'xai'
        ? publicHttpsImageReferences(referenceImages, 'xAI')
        : adapter === 'minimax'
          ? publicHttpsImageReferences(referenceImages, 'MiniMax')
          : referenceImages;
  const requestedCount = count;
  const singleResultAdapter =
    adapter === 'bfl' || adapter === 'volcengine' || adapter === 'ideogram-v4';
  const requestCount = singleResultAdapter ? requestedCount : 1;
  const sources = (
    await Promise.all(
      Array.from({ length: requestCount }, async () => {
        const built = buildImageProviderRequest(adapter, {
          model,
          prompt,
          count: singleResultAdapter ? 1 : requestedCount,
          size,
          aspectRatio: adapterAspectRatio,
          renderingSpeed: body.renderingSpeed,
          endpoint: provider.endpoint,
          referenceImages: adapterReferences,
        });
        const endpoint = providerImageEndpoint(provider.baseUrl, built.request.endpoint);
        const json = await fetchImageProviderJson(
          endpoint,
          provider,
          await imageRequestBody(built.request),
        );
        if (adapter === 'bfl') {
          const submitted = parseImageProviderResponse(adapter, json, { phase: 'submit' });
          return waitForBflImage(submitted, provider);
        }
        return parseImageProviderResponse(adapter, json).images;
      }),
    )
  ).flat();
  return saveAdapterImages(sources.slice(0, requestedCount));
}

function collectGeneratedVideoUrls(payload) {
  const urls = [];
  const add = (value) => {
    if (typeof value === 'string') {
      const url = value.trim();
      if (url) urls.push(url);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    add(value.url);
    add(value.video_url);
    add(value.videoUrl);
    add(value.download_url);
    add(value.file_url);
    add(value.video);
  };
  add(payload?.video);
  add(payload?.url);
  for (const key of ['videos', 'data', 'output', 'results']) {
    const value = payload?.[key];
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }
  return [...new Set(urls)];
}

async function bridgeGenerateVideo(body, execution = {}) {
  const provider = body.provider || {};
  assertCanvasGenerationProvider(provider);
  const prompt = String(body.prompt || '').trim();
  const model = String(provider.model || body.model || '').trim();
  if (!model) throw new Error('未指定视频模型。');
  const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
  const referenceAudios = Array.isArray(body.referenceAudios) ? body.referenceAudios : [];
  const videoEditOperation = normalizeVideoEditOperation(body.videoEditOperation);
  const isSubtitleRemoval = videoEditOperation === 'remove-subtitles';
  const isVisualEdit = videoEditOperation === 'visual-edit';
  const isMaskedRepair = videoEditOperation === 'masked-repair';
  const isSourceVideoEdit = isSubtitleRemoval || isVisualEdit || isMaskedRepair;
  if (isMaskedRepair) assertMaskedRepairProviderSupport(provider);
  if (['xai', 'volcengine', 'modelscope'].includes(provider.protocol)) {
    throw new Error(
      `当前 ${provider.protocol} 视频 API 需要专用异步任务适配，不能按通用 /videos/generations 协议提交。`,
    );
  }
  const sourceVideoDuration = Number(body.sourceVideoDuration);
  const remakeMinimumDuration =
    Number.isFinite(sourceVideoDuration) && sourceVideoDuration > 0
      ? Math.min(4, Math.max(1, sourceVideoDuration / 5))
      : 1;
  const remakeSegments = Array.isArray(body.remakeSegments)
    ? body.remakeSegments
        .filter(
          (segment) =>
            segment &&
            Number.isFinite(Number(segment.start)) &&
            Number.isFinite(Number(segment.end)) &&
            Number(segment.start) >= 0 &&
            Number(segment.end) - Number(segment.start) >= remakeMinimumDuration,
        )
        .slice(0, 5)
        .map((segment) => ({ start: Number(segment.start), end: Number(segment.end) }))
    : [];
  const isFragmentRemake = remakeSegments.length > 0;
  const isVideoContinuation = body.continueVideo === true;
  const isCharacterSwap = String(body.mode || '').trim() === '视频换人物';
  const isPlainVideoReference =
    Boolean(body.sourceVideo) &&
    !isFragmentRemake &&
    !isVideoContinuation &&
    !isCharacterSwap &&
    !isSourceVideoEdit;
  if (isCharacterSwap && !body.sourceVideo) throw new Error('“视频换人物”需要连接一条原视频。');
  if (isCharacterSwap && !body.characterReferenceImage) {
    throw new Error('“视频换人物”需要连接一张目标人物图片。');
  }
  if (Array.isArray(body.remakeSegments) && !isFragmentRemake) {
    throw new Error('片段重拍至少需要一个有效片段，每段不得短于 1 秒。');
  }
  if (isFragmentRemake && !body.sourceVideo) {
    throw new Error('片段重拍需要提交原视频。');
  }
  if (isFragmentRemake && isVideoContinuation) {
    throw new Error('片段重拍与智能续写不能在同一次请求中同时执行。');
  }
  if (isVideoContinuation && !body.sourceVideo) {
    throw new Error('智能续写需要提交原视频。');
  }
  const videoEditPayload = buildVideoEditPayload({
    operation: videoEditOperation,
    sourceVideo: body.sourceVideo,
    subtitleRegion: body.subtitleRegion,
    maskImage: body.maskImage,
    rangeStart: body.maskRangeStart,
    rangeEnd: body.maskRangeEnd,
    keyframeTime: body.keyframeTime,
    tracking: body.tracking === 'provider',
  });
  const exclusiveOperations = [
    isFragmentRemake,
    isVideoContinuation,
    isCharacterSwap,
    isSourceVideoEdit,
  ].filter(Boolean).length;
  if (exclusiveOperations > 1) {
    throw new Error('片段重拍、智能续写、视频换人物和画面编辑不能在同一次请求中执行。');
  }
  if (provider.protocol === 'comfyui') {
    if (isFragmentRemake) {
      throw new Error('当前 ComfyUI 工作流尚未配置“片段重拍”的原视频区间输入。');
    }
    if (isVideoContinuation) {
      throw new Error('当前 ComfyUI 工作流尚未配置“智能续写”的原视频输入。');
    }
    if (isSourceVideoEdit) {
      throw new Error(
        `当前 ComfyUI 工作流尚未配置“${videoEditOperationLabel(videoEditOperation)}”的视频编辑输入。`,
      );
    }
    return bridgeGenerateComfyVideo(
      body,
      provider,
      prompt,
      referenceImages,
      referenceAudios,
      execution.reportProgress,
    );
  }
  if (isFragmentRemake && ['jimeng', 'bailian', 'lightx2v'].includes(provider.protocol)) {
    throw new Error(`当前 ${provider.protocol} 适配器尚未接入“片段重拍”视频编辑协议。`);
  }
  if (isCharacterSwap && ['jimeng', 'bailian', 'lightx2v'].includes(provider.protocol)) {
    throw new Error(`当前 ${provider.protocol} 适配器尚未接入“视频换人物”专用工作流。`);
  }
  if (isVideoContinuation && ['jimeng', 'bailian', 'lightx2v'].includes(provider.protocol)) {
    throw new Error(`当前 ${provider.protocol} 适配器尚未接入“智能续写”视频编辑协议。`);
  }
  if (isSourceVideoEdit && ['jimeng', 'bailian', 'lightx2v'].includes(provider.protocol)) {
    throw new Error(
      `当前 ${provider.protocol} 适配器尚未接入“${videoEditOperationLabel(videoEditOperation)}”视频编辑协议。`,
    );
  }
  if (provider.protocol === 'jimeng') {
    if (isPlainVideoReference) throw new Error('当前即梦视频适配器不支持直接提交参考视频。');
    return bridgeGenerateJimengVideo(body, model, prompt, referenceImages, referenceAudios);
  }
  if (provider.protocol === 'bailian') {
    if (isPlainVideoReference) throw new Error('当前百炼视频适配器不支持直接提交参考视频。');
    return bridgeGenerateBailianVideo(body, model, prompt, referenceImages, referenceAudios);
  }
  if (provider.protocol === 'lightx2v') {
    if (isPlainVideoReference) throw new Error('当前 LightX2V 适配器不支持直接提交参考视频。');
    return bridgeGenerateLightX2V(body, 'video', prompt, referenceImages, referenceAudios);
  }
  if (!prompt) throw new Error('视频提示词不能为空。');
  if (referenceImages.length > 1) {
    throw new Error(
      `当前 ${provider.protocol || '通用'} 视频接口只定义了单参考图协议，不能静默丢弃 ${referenceImages.length - 1} 张参考图。`,
    );
  }
  if (referenceAudios.length) {
    throw new Error(
      `当前 ${provider.protocol || '通用'} 视频接口未定义参考音频协议，不能静默丢弃 ${referenceAudios.length} 个音频参考。`,
    );
  }
  const base = safeProviderBaseUrl(provider.baseUrl);
  const endpoint =
    provider.endpoint && provider.endpoint.trim()
      ? `${base}${provider.endpoint.startsWith('/') ? '' : '/'}${provider.endpoint}`
      : /\/v1$/i.test(base)
        ? `${base}/videos/generations`
        : `${base}/v1/videos/generations`;
  const payload = {
    model,
    prompt,
    duration: Number(body.duration || 5),
    aspect_ratio: String(body.aspectRatio || '16:9'),
    resolution: String(body.resolution || '720P'),
    generate_audio: Boolean(body.audio),
    n: Math.max(1, Math.min(4, Number(body.count || 1))),
    ...(referenceImages.length === 1 ? { image: referenceImages[0] } : {}),
    ...(isPlainVideoReference ? { source_video: body.sourceVideo } : {}),
    ...(isCharacterSwap
      ? {
          source_video: body.sourceVideo,
          character_image: body.characterReferenceImage,
          ...(body.maskImage ? { mask: body.maskImage } : {}),
        }
      : {}),
    ...(isFragmentRemake
      ? {
          mode: 'segment_remake',
          source_video: body.sourceVideo,
          remake_segments: remakeSegments,
          preserve_unselected_segments: true,
        }
      : {}),
    ...(isVideoContinuation
      ? {
          mode: 'video_extend',
          source_video: body.sourceVideo,
          continue_from: 'end',
          preserve_continuity: true,
        }
      : {}),
    ...videoEditPayload,
  };
  const res = await freshProviderRequest({
    url: endpoint,
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(payload),
    timeoutMs: PROVIDER_IMAGE_TIMEOUT_MS,
    maxRequestBytes: MAX_REMOTE_ASSET_BYTES,
    maxResponseBytes: MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    label: '上游视频接口地址',
    ...providerTransportTrust(endpoint),
  });
  const json = await readLimitedProviderJson(
    res,
    MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    '上游视频接口响应',
  ).catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `上游视频接口返回 HTTP ${res.status}。`);
  // 兼容常见的单结果和批量结果结构，并保留上游返回顺序。
  const requestedCount = Math.max(1, Math.min(4, Number(body.count || 1)));
  const videoUrls = collectGeneratedVideoUrls(json).slice(0, requestedCount);
  if (!videoUrls.length) {
    // 异步任务：把 task_id 透传给前端，由前端轮询（若上游提供轮询接口）
    if (json?.task_id || json?.id) return { taskId: json.task_id || json.id, async: true };
    throw new Error('上游未返回视频地址。');
  }
  const videos = await Promise.all(videoUrls.map((url) => saveGeneratedImage(url, 'video')));
  return { videos, url: videos[0] };
}

function collectGeneratedAudioUrls(payload) {
  const urls = [];
  const add = (value) => {
    if (typeof value === 'string') {
      const url = value.trim();
      if (url) urls.push(url);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    add(value.url);
    add(value.audio_url);
    add(value.audioUrl);
    add(value.download_url);
    add(value.file_url);
    add(value.audio);
  };
  add(payload?.audio);
  add(payload?.url);
  for (const key of ['audios', 'data', 'output', 'results']) {
    const value = payload?.[key];
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }
  return [...new Set(urls)];
}

async function bridgeGenerateAudio(body, execution = {}) {
  const provider = body.provider || {};
  assertCanvasGenerationProvider(provider);
  const prompt = String(body.prompt || '').trim();
  const model = String(provider.model || body.model || '').trim();
  if (!model) throw new Error('未指定音频模型。');
  if (provider.protocol === 'comfyui') {
    return bridgeGenerateComfyAudio(body, provider, prompt, execution.reportProgress);
  }
  if (typeof body.referenceAudio === 'string' && body.referenceAudio.trim()) {
    throw new Error(
      '当前通用音频接口未声明参考音频协议；请改用带 QIANSI_AUDIO 的 ComfyUI 工作流。',
    );
  }
  if (!prompt) throw new Error('音乐描述不能为空。');
  const base = safeProviderBaseUrl(provider.baseUrl);
  const endpoint =
    provider.endpoint && provider.endpoint.trim()
      ? `${base}${provider.endpoint.startsWith('/') ? '' : '/'}${provider.endpoint}`
      : /\/v1$/i.test(base)
        ? `${base}/audio/generations`
        : `${base}/v1/audio/generations`;
  const requestedCount = Math.max(1, Math.min(4, Number(body.count || 1)));
  const res = await freshProviderRequest({
    url: endpoint,
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify({
      model,
      prompt,
      duration: Math.max(5, Math.min(300, Number(body.duration || 30))),
      mode: String(body.mode || '描述生音乐'),
      n: requestedCount,
    }),
    timeoutMs: PROVIDER_IMAGE_TIMEOUT_MS,
    maxRequestBytes: 2 * 1024 * 1024,
    maxResponseBytes: MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    label: '上游音频接口地址',
    ...providerTransportTrust(endpoint),
  });
  const json = await readLimitedProviderJson(
    res,
    MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    '上游音频接口响应',
  ).catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `上游音频接口返回 HTTP ${res.status}。`);
  const audioUrls = collectGeneratedAudioUrls(json).slice(0, requestedCount);
  if (!audioUrls.length) {
    if (json?.task_id || json?.id) return { taskId: json.task_id || json.id, async: true };
    throw new Error('上游未返回音频地址。');
  }
  const audios = await Promise.all(audioUrls.map((url) => saveGeneratedImage(url, 'audio')));
  return { audios, url: audios[0] };
}

async function bridgeGenerate3d(body, execution = {}) {
  const provider = body.provider || {};
  assertCanvasGenerationProvider(provider);
  if (provider.protocol !== 'comfyui') {
    throw new Error('3D 生成当前仅支持已导入的 ComfyUI 3D 工作流。');
  }
  const prompt = String(body.prompt || '').trim();
  const model = String(provider.model || body.model || '').trim();
  if (!model) throw new Error('未指定 3D 工作流模型。');
  const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];
  return bridgeGenerateComfy3d(body, provider, prompt, referenceImages, execution.reportProgress);
}

async function bridgeChat(body) {
  const provider = body.provider || {};
  assertCanvasGenerationProvider(provider);
  const model = String(provider.model || body.model || '').trim();
  if (!model) throw new Error('未指定对话模型。');
  const messages =
    Array.isArray(body.messages) && body.messages.length
      ? body.messages
      : [{ role: 'user', content: String(body.prompt || '') }];
  if (
    provider.protocol === 'codex' ||
    provider.protocol === 'codebuddy' ||
    provider.protocol === 'gemini-cli'
  ) {
    const cli =
      provider.protocol === 'codex'
        ? 'codex'
        : provider.protocol === 'codebuddy'
          ? 'codebuddy'
          : 'gemini';
    const rawModel = model.replace(/^(?:codex|workbuddy|antigravity|gemini):/, '');
    const cliInput = collectCliChatInput(messages);
    return {
      text: await runCli(
        cli,
        rawModel,
        cliInput.prompt,
        provider.reasoningEffort || body.reasoningEffort,
        cliInput.imageUrls,
      ),
    };
  }
  if (provider.protocol === 'jimeng' || provider.protocol === 'cli') {
    throw new Error('当前 CLI 仅提供账户或本机工具能力，不能作为文本生成模型使用。');
  }
  const base = safeProviderBaseUrl(provider.baseUrl);
  const endpoint = /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const res = await freshProviderRequest({
    url: endpoint,
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(
      buildRemoteChatPayload({
        protocol: provider.protocol,
        model,
        messages,
        temperature: body.temperature ?? 0.8,
        maxLength: body.maxLength,
        reasoningEffort: provider.reasoningEffort || body.reasoningEffort,
      }),
    ),
    timeoutMs: PROVIDER_TEXT_TIMEOUT_MS,
    maxRequestBytes: 2 * 1024 * 1024,
    maxResponseBytes: MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    label: '上游对话接口地址',
    ...providerTransportTrust(endpoint),
  });
  const json = await readLimitedProviderJson(
    res,
    MAX_PROVIDER_TEXT_RESPONSE_BYTES,
    '上游对话接口响应',
  );
  if (!res.ok) throw new Error(json?.error?.message || `上游对话接口返回 HTTP ${res.status}。`);
  const content = extractRemoteChatText(json);
  if (!content) throw new Error(describeEmptyRemoteChatResponse(json));
  return { text: content };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  if (handleLanPairing(request, response, url)) return;
  if (await serveCanvasWeb(request, response, url)) return;
  // A removed web chunk is a static 404, not a Bridge authorization failure.
  // Never fall through to API handling or serve the HTML entry for a module URL.
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...bridgeSecurityHeaders({ mime: 'text/plain' }),
    });
    response.end('Web asset not found');
    return;
  }
  if (!requestOriginAllowed(request)) {
    response.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      Vary: 'Origin',
      ...bridgeSecurityHeaders(),
    });
    response.end(JSON.stringify({ error: { message: '已拒绝非同源创作台发起的桥接请求。' } }));
    return;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors(request));
    response.end();
    return;
  }
  const authorization = remoteLanRequestAuthorized(request, url);
  if (!authorization.ok) {
    send(response, authorization.status, { error: { message: authorization.message } }, request);
    return;
  }
  request.qiansiBridgeScope = authorization.scope;
  const requestLease = acquireBridgeRequest(request, url);
  if (!requestLease.ok) {
    send(
      response,
      429,
      {
        error: {
          message:
            requestLease.reason === 'concurrency'
              ? '本机正在处理较多生成、上传或更新任务，请稍后再试。'
              : '请求过于频繁，请稍后再试。',
        },
      },
      request,
    );
    return;
  }
  try {
    await bridgeSettingsReady;
    if (request.method === 'POST' && url.pathname === '/storage-cleanup/scan') {
      try {
        const body = await readBody(request);
        const liveReferences = storageCleanupLiveReferences(body.liveReferences);
        purgeExpiredStorageCleanupPlans();
        const plan = await buildStorageCleanupPlan({ dataRoot: DATA_ROOT, liveReferences });
        const scanId = `cleanup_${randomUUID().replace(/-/g, '')}`;
        while (storageCleanupPlans.size >= 20) {
          storageCleanupPlans.delete(storageCleanupPlans.keys().next().value);
        }
        storageCleanupPlans.set(scanId, {
          createdAt: Date.now(),
          liveReferences,
          candidates: plan.candidates,
        });
        send(
          response,
          200,
          {
            scanId,
            summary: plan.summary,
            expiresInMs: STORAGE_CLEANUP_PLAN_TTL_MS,
            protectedRecentMinutes: Math.round(STORAGE_CLEANUP_MEDIA_MIN_AGE_MS / 60_000),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '垃圾文件扫描失败。' } },
          request,
        );
      }
      return;
    }
    const storageCleanupFilesMatch =
      /^\/storage-cleanup\/plans\/(cleanup_[a-f0-9]{32})\/files$/.exec(url.pathname);
    if (request.method === 'GET' && storageCleanupFilesMatch) {
      try {
        purgeExpiredStorageCleanupPlans();
        const storedPlan = storageCleanupPlans.get(storageCleanupFilesMatch[1]);
        if (!storedPlan) throw new Error('清理清单已过期，请重新扫描。');
        const page = listStorageCleanupCandidates(storedPlan.candidates, {
          scope: String(url.searchParams.get('scope') || 'all'),
          offset: Number(url.searchParams.get('offset') || 0),
          limit: Number(url.searchParams.get('limit') || 100),
        });
        send(
          response,
          200,
          {
            ...page,
            items: page.items.map((item) => ({
              ...item,
              previewUrl:
                item.kind === 'image' && item.scope === 'preview'
                  ? `/media-preview/files/${encodeURIComponent(item.name)}`
                  : item.kind === 'image' && item.scope === 'output'
                    ? `/output/${encodeURIComponent(item.name)}`
                    : '',
            })),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '文件清单读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/storage-cleanup/apply') {
      try {
        const body = await readBody(request);
        purgeExpiredStorageCleanupPlans();
        const scanId = String(body.scanId || '');
        const storedPlan = storageCleanupPlans.get(scanId);
        storageCleanupPlans.delete(scanId);
        if (!storedPlan) throw new Error('清理清单已过期，请重新扫描。');
        const liveReferences = [
          ...new Set([
            ...storedPlan.liveReferences,
            ...storageCleanupLiveReferences(body.liveReferences),
          ]),
        ];
        const freshPlan = await buildStorageCleanupPlan({
          dataRoot: DATA_ROOT,
          liveReferences,
        });
        const freshCandidates = new Map(
          freshPlan.candidates.map((candidate) => [candidate.relativePath, candidate]),
        );
        const candidates = storedPlan.candidates.filter((candidate) => {
          const fresh = freshCandidates.get(candidate.relativePath);
          return fresh && fresh.size === candidate.size && fresh.mtimeMs === candidate.mtimeMs;
        });
        const result = await applyStorageCleanupCandidates({ dataRoot: DATA_ROOT, candidates });
        send(
          response,
          200,
          {
            ...result,
            skippedFiles:
              result.skippedFiles + Math.max(0, storedPlan.candidates.length - candidates.length),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '垃圾文件清理失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/notification-sounds') {
      try {
        send(response, 200, await notificationSoundCatalog(), request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '提示音目录读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/notification-sounds/file') {
      try {
        const name = String(url.searchParams.get('name') || '');
        const extension = extname(name).toLowerCase();
        if (
          !name ||
          name.length > 180 ||
          basename(name) !== name ||
          !NOTIFICATION_SOUND_EXTENSIONS.has(extension)
        ) {
          throw new Error('提示音文件名无效。');
        }
        await streamFileResponse(
          request,
          response,
          join(NOTIFICATION_SOUND_ROOT, name),
          NOTIFICATION_SOUND_EXTENSIONS.get(extension),
          '',
          'no-store',
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '提示音文件不存在。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/trusted-local-providers') {
      send(response, 200, { origins: [...trustedLocalProviderOrigins].sort() }, request);
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/trusted-local-providers') {
      try {
        const body = await readBody(request);
        const origin = normalizedTrustedLocalProviderOrigin(body.origin);
        if (!origin) throw new Error('只允许持久信任明确的本机回环 Provider 地址。');
        trustedLocalProviderOrigins.add(origin);
        await saveBridgeSettings();
        send(response, 200, { success: true, origin }, request);
      } catch (error) {
        send(
          response,
          400,
          {
            error: { message: error instanceof Error ? error.message : '本机 Provider 授权失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/model-catalog') {
      send(response, 200, await readModelCatalog(), request);
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/model-catalog') {
      try {
        const catalog = await queueModelCatalogWrite(await readBody(request));
        send(response, 200, catalog, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '模型目录保存失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/comfyui/status') {
      const library = await readComfyWorkflowLibrary();
      try {
        const status = await inspectLocalComfy(DEFAULT_COMFYUI_BASE_URL, { timeoutMs: 5000 });
        const validatedLibrary = await refreshComfyWorkflowLibrary(
          library,
          'comfyui-local',
          status,
        );
        send(
          response,
          200,
          {
            ready: true,
            baseUrl: status.baseUrl,
            system: {
              ...status.system,
              devices: status.devices,
              comfyCapabilities: publicComfyCapabilityStatus(status),
            },
            workflows: comfyWorkflowSummaries(validatedLibrary, 'comfyui-local', status.objectInfo),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          200,
          {
            ready: false,
            baseUrl: DEFAULT_COMFYUI_BASE_URL,
            error:
              error instanceof Error
                ? `无法连接本地 ComfyUI：${error.message}`
                : '无法连接本地 ComfyUI，请确认服务已启动。',
            workflows: comfyWorkflowSummaries(library),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/comfyui/status') {
      const library = await readComfyWorkflowLibrary();
      let connection;
      try {
        const body = await readBody(request);
        connection = comfyConnection(body);
        if (!isRemoteComfyConnectionId(connection.connectionId)) {
          throw new Error('远程 ComfyUI 状态接口只接受远程连接配置。');
        }
        const status = await inspectLocalComfy(connection.baseUrl, {
          timeoutMs: 10_000,
          ...connection.options,
        });
        const validatedLibrary = await refreshComfyWorkflowLibrary(
          library,
          connection.connectionId,
          status,
        );
        send(
          response,
          200,
          {
            ready: true,
            baseUrl: status.baseUrl,
            system: {
              ...status.system,
              devices: status.devices,
              comfyCapabilities: publicComfyCapabilityStatus(status),
            },
            workflows: comfyWorkflowSummaries(
              validatedLibrary,
              connection.connectionId,
              status.objectInfo,
            ),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          200,
          {
            ready: false,
            baseUrl: connection?.baseUrl || '',
            error:
              error instanceof Error
                ? `无法连接远程 ComfyUI：${error.message}`
                : '无法连接远程 ComfyUI，请检查服务器地址与鉴权。',
            workflows: comfyWorkflowSummaries(
              library,
              connection?.connectionId || 'comfyui-remote',
            ),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/comfyui/workflows') {
      try {
        const body = await readBody(request, MAX_COMFYUI_WORKFLOW_BODY);
        const incoming = createComfyWorkflowPreset(body, {
          id: `comfy_${randomUUID().replace(/-/g, '')}`,
          connectionId: body.connectionId,
        });
        const preset = await mutateComfyWorkflowLibrary((library) => {
          const upserted = upsertComfyWorkflowPreset(library.items, incoming);
          library.items = upserted.items;
          return upserted.preset;
        });
        send(response, 201, { workflow: publicComfyWorkflow(preset) }, request);
      } catch (error) {
        send(
          response,
          422,
          {
            error: {
              message: error instanceof Error ? error.message : 'ComfyUI 工作流导入失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'DELETE' && comfyWorkflowIdFromPath(url.pathname)) {
      try {
        const id = comfyWorkflowIdFromPath(url.pathname);
        const removed = await mutateComfyWorkflowLibrary((library) => {
          const index = library.items.findIndex((item) => item.id === id);
          if (index < 0) throw new Error('ComfyUI 工作流不存在。');
          return library.items.splice(index, 1)[0];
        });
        send(response, 200, { success: true, removed: publicComfyWorkflow(removed) }, request);
      } catch (error) {
        send(
          response,
          404,
          {
            error: {
              message: error instanceof Error ? error.message : 'ComfyUI 工作流删除失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/browser-storage') {
      if (request.qiansiBridgeScope !== 'host') {
        send(response, 403, { error: { message: '浏览器状态只能由本机创作台读取。' } }, request);
        return;
      }
      try {
        send(response, 200, { storage: await browserStorage.read(), writable: true }, request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '浏览器状态读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/browser-storage') {
      if (request.qiansiBridgeScope !== 'host') {
        send(response, 403, { error: { message: '浏览器状态只能由本机创作台修改。' } }, request);
        return;
      }
      try {
        const body = await readBody(request, MAX_BRIDGE_BROWSER_STORAGE_BYTES);
        const storage = await browserStorage.update({
          changes: body?.changes,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { storage, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeBrowserStorageConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '浏览器状态保存失败。',
            },
            ...(conflict ? { storage: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/profile') {
      try {
        send(
          response,
          200,
          {
            profile: await userProfileStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '资料作者读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/generation-limits') {
      try {
        send(
          response,
          200,
          {
            limits: await generationLimitsStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          {
            error: {
              message: error instanceof Error ? error.message : '请求与批量生成设置读取失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/generation-limits') {
      try {
        if (request.qiansiBridgeScope !== 'host') {
          send(
            response,
            403,
            { error: { message: '请求与批量生成设置只能由主机修改。' } },
            request,
          );
          return;
        }
        const body = await readBody(request);
        const limits = await generationLimitsStorage.update({
          limits: body?.limits,
          expectedRevision: body?.expectedRevision,
        });
        bridgeRequestGate.configure(limits);
        send(response, 200, { limits, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeGenerationLimitsConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '请求与批量生成设置保存失败。',
            },
            ...(conflict ? { limits: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/text-modes') {
      try {
        send(
          response,
          200,
          {
            catalog: await textModeCatalogStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '文本处理模式读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/text-modes') {
      try {
        if (request.qiansiBridgeScope !== 'host') {
          send(response, 403, { error: { message: '文本处理模式只能由主机修改。' } }, request);
          return;
        }
        const body = await readBody(request);
        const catalog = await textModeCatalogStorage.update({
          modes: body?.modes,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { catalog, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeTextModeCatalogConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '文本处理模式保存失败。',
            },
            ...(conflict ? { catalog: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/prompt-library') {
      try {
        send(
          response,
          200,
          {
            library: await promptLibraryStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '提示词库读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/prompt-library') {
      try {
        if (request.qiansiBridgeScope !== 'host') {
          send(response, 403, { error: { message: '提示词库只能由主机修改。' } }, request);
          return;
        }
        const body = await readBody(request);
        const library = await promptLibraryStorage.update({
          items: body?.items,
          categories: body?.categories,
          renames: body?.renames,
          deleted: body?.deleted,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { library, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgePromptLibraryConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '提示词库保存失败。',
            },
            ...(conflict ? { library: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/image-type-presets') {
      try {
        send(
          response,
          200,
          {
            catalog: await imageTypePresetCatalogStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          {
            error: {
              message: error instanceof Error ? error.message : '图片生成类型读取失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/image-type-presets') {
      try {
        if (request.qiansiBridgeScope !== 'host') {
          send(response, 403, { error: { message: '图片生成类型只能由主机修改。' } }, request);
          return;
        }
        const body = await readBody(request);
        const catalog = await imageTypePresetCatalogStorage.update({
          categories: body?.categories,
          presets: body?.presets,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { catalog, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeImageTypePresetCatalogConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '图片生成类型保存失败。',
            },
            ...(conflict ? { catalog: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings/user-libraries') {
      try {
        send(
          response,
          200,
          {
            libraries: await userLibrariesStorage.read(),
            writable: request.qiansiBridgeScope === 'host',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '资料库读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/user-libraries') {
      try {
        if (request.qiansiBridgeScope !== 'host') {
          send(response, 403, { error: { message: '资料库只能由主机修改。' } }, request);
          return;
        }
        const body = await readBody(request);
        const libraries = await userLibrariesStorage.update({
          libraries: body?.libraries,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { libraries, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeUserLibrariesConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '资料库保存失败。',
            },
            ...(conflict ? { libraries: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings/profile') {
      try {
        const body = await readBody(request);
        const profile = await userProfileStorage.update({
          userName: body?.userName,
          expectedRevision: body?.expectedRevision,
        });
        send(response, 200, { profile, writable: true }, request);
      } catch (error) {
        const conflict = error instanceof BridgeUserProfileConflictError;
        send(
          response,
          conflict ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '资料作者保存失败。',
            },
            ...(conflict ? { profile: error.current } : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/settings') {
      send(
        response,
        200,
        {
          animeLibraryRoot,
          animeLibraryAvailable: Boolean(animeLibraryRoot && existsSync(animeLibraryRoot)),
          lockedByEnvironment: Boolean(animeLibraryRootFromEnvironment),
        },
        request,
      );
      return;
    }
    if (request.method === 'PATCH' && url.pathname === '/settings') {
      try {
        if (animeLibraryRootFromEnvironment)
          throw new Error('动漫目录已由 QIANSI_CANVAS_ANIME_LIBRARY 环境变量锁定。');
        const body = await readBody(request);
        const nextRoot = String(body.animeLibraryRoot || '').trim();
        if (!nextRoot) throw new Error('请输入动漫素材目录。');
        const info = await stat(nextRoot);
        if (!info.isDirectory()) throw new Error('所选路径不是目录。');
        animeLibraryRoot = nextRoot;
        await saveBridgeSettings();
        send(response, 200, { animeLibraryRoot, animeLibraryAvailable: true }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '动漫目录保存失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/community/status') {
      send(
        response,
        200,
        {
          configured: Boolean(communityServerUrl),
          serverUrl: communityServerUrl || null,
          managedBy: communityServerUrlFromEnvironment
            ? 'deployment'
            : communityServerUrl
              ? 'legacy'
              : 'none',
        },
        request,
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/community/connectivity') {
      try {
        if (!communityServerUrl) throw new Error('素材后台地址尚未由应用部署方配置。');
        const result = await probeCommunityServer(communityServerUrl);
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          502,
          { error: { message: error instanceof Error ? error.message : '素材后台连通检测失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && projectRestoreIdFromPath(url.pathname)) {
      try {
        const id = projectRestoreIdFromPath(url.pathname);
        const restored = await projectStorage.restoreLatest(id);
        await mutateProjectCatalogAfterCommit((catalog) => {
          const meta = catalog.projects.find((project) => project.id === id);
          if (meta) {
            meta.updatedAt = restored.workspace.updatedAt;
            meta.revision = restored.revision;
          }
        });
        send(
          response,
          200,
          {
            ...restored,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          { error: { message: error instanceof Error ? error.message : '快照恢复失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/timeline/render') {
      try {
        send(
          response,
          202,
          { job: await startTimelineRender(await readBody(request, 2 * 1024 * 1024)) },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '时间线合成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && timelineRenderIdFromPath(url.pathname)) {
      const job = timelineRenderJobs.get(timelineRenderIdFromPath(url.pathname));
      if (!job)
        send(
          response,
          404,
          { error: { message: '没有找到该合成任务，可能是本机桥接已经重启。' } },
          request,
        );
      else send(response, 200, { job }, request);
      return;
    }
    if (request.method === 'DELETE' && timelineRenderIdFromPath(url.pathname)) {
      const job = cancelTimelineRender(timelineRenderIdFromPath(url.pathname));
      if (!job) {
        send(response, 404, { error: { message: '没有找到该合成任务。' } }, request);
      } else {
        send(response, 200, { job }, request);
      }
      return;
    }
    if (request.method === 'GET' && /^\/exports\/render_[A-Za-z0-9]+\.mp4$/.test(url.pathname)) {
      try {
        const fileName = url.pathname.split('/').pop() || '';
        const filePath = join(EXPORT_ROOT, fileName);
        await streamFileResponse(request, response, filePath, 'video/mp4');
      } catch {
        send(response, 404, { error: { message: '合成文件不存在。' } }, request);
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/projects') {
      try {
        send(response, 200, await readProjectCatalog(), request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '项目目录读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/project-folders') {
      try {
        const body = await readBody(request);
        const requestId = normalizedProjectRequestId(body.requestId);
        const requestKey = requestId ? catalogCreationRequestKey('folder', requestId) : '';
        const name = normalizeProjectName(body.name, '未命名文件夹');
        const id = deterministicCatalogId('folder', requestId ? `folder:${requestId}` : '');
        const mutation = await mutateProjectCatalogWithResult((catalog) => {
          assertCatalogRevision(catalog, body.expectedCatalogRevision);
          const existing = requestId
            ? catalog.folders.find((folder) => folder.creationRequestId === requestKey)
            : catalog.folders.find((folder) => folder.id === id);
          if (existing) return existing;
          const folder = normalizeProjectFolderMeta({
            id,
            name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            creationRequestId: requestKey,
          });
          catalog.folders.push(folder);
          return folder;
        });
        send(
          response,
          mutation.unchanged ? 200 : 201,
          { folder: mutation.result, item: mutation.result, catalog: mutation.catalog },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目文件夹创建失败。' },
            ...(error?.code === 'PROJECT_CATALOG_CONFLICT'
              ? { currentCatalogRevision: error.currentCatalogRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && projectFolderIdFromPath(url.pathname)) {
      try {
        const id = projectFolderIdFromPath(url.pathname);
        const body = await readBody(request);
        const mutation = await mutateProjectCatalogWithResult((catalog) => {
          assertCatalogRevision(catalog, body.expectedCatalogRevision);
          const folder = catalog.folders.find((item) => item.id === id);
          if (!folder) throw new Error('项目文件夹不存在。');
          if (body.name === undefined) throw new Error('请输入项目文件夹名称。');
          folder.name = normalizeProjectName(body.name, folder.name);
          folder.updatedAt = Date.now();
          return folder;
        });
        send(
          response,
          200,
          { folder: mutation.result, item: mutation.result, catalog: mutation.catalog },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目文件夹保存失败。' },
            ...(error?.code === 'PROJECT_CATALOG_CONFLICT'
              ? { currentCatalogRevision: error.currentCatalogRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'DELETE' && projectFolderIdFromPath(url.pathname)) {
      try {
        const id = projectFolderIdFromPath(url.pathname);
        const body = await readBody(request);
        const mutation = await mutateProjectCatalogWithResult((catalog) => {
          assertCatalogRevision(catalog, body.expectedCatalogRevision);
          const index = catalog.folders.findIndex((item) => item.id === id);
          if (index < 0) throw new Error('项目文件夹不存在。');
          const [folder] = catalog.folders.splice(index, 1);
          for (const project of catalog.projects) {
            if (project.folderId === id) project.folderId = null;
          }
          return folder;
        });
        send(
          response,
          200,
          {
            success: true,
            removed: id,
            deletedFolderId: id,
            folder: mutation.result,
            catalog: mutation.catalog,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目文件夹删除失败。' },
            ...(error?.code === 'PROJECT_CATALOG_CONFLICT'
              ? { currentCatalogRevision: error.currentCatalogRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/projects/primary') {
      try {
        const body = await readBody(request);
        if (String(body?.candidateProjectId || '') !== BRIDGE_PRIMARY_CANVAS_PROJECT_ID) {
          throw new Error('主画布编号无效。');
        }
        const resolved = await resolvePrimaryCanvasCatalog();
        send(
          response,
          200,
          {
            primaryProjectId: resolved.primaryProjectId,
            canvasProjectId: resolved.canvasProjectId,
            project: resolved.project,
            claimed: resolved.claimed,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '主画布初始化失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && projectWorkspaceFromPath(url.pathname)) {
      try {
        const route = projectWorkspaceFromPath(url.pathname);
        if (route.projectId === BRIDGE_PRIMARY_CANVAS_PROJECT_ID) await readProjectCatalog();
        if (await projectHasArchivedCopy(route.projectId)) throw new Error('项目已归档。');
        const result = await projectStorage.readWorkspace(route.projectId, route.workspaceId);
        if (!result) throw new Error('项目不存在。');
        if (!result.workspace) {
          send(response, 404, { error: { message: '工作台尚未保存。' }, ...result }, request);
        } else {
          send(response, 200, result, request);
        }
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '工作台读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PUT' && projectWorkspaceFromPath(url.pathname)) {
      try {
        const route = projectWorkspaceFromPath(url.pathname);
        const body = await readBody(request, MAX_PROJECT_BODY);
        if (await projectHasArchivedCopy(route.projectId)) {
          throw new Error('项目已经归档，已拒绝过期的自动保存。');
        }
        const result = await projectStorage.saveWorkspace(route.projectId, route.workspaceId, body);
        await mutateProjectCatalogAfterCommit((catalog) => {
          let meta = catalog.projects.find((project) => project.id === route.projectId);
          if (!meta) {
            meta = normalizeProjectMeta({
              id: route.projectId,
              name: result.manifest.projectName || route.projectId,
              title: result.manifest.title || result.manifest.projectName || route.projectId,
              createdAt: result.updatedAt,
            });
            catalog.projects.push(meta);
          }
          meta.name = normalizeProjectName(result.manifest.projectName || meta.name, meta.name);
          meta.title = normalizeProjectName(result.manifest.title || meta.title, meta.title);
          meta.updatedAt = result.updatedAt;
          meta.revision = result.revision;
          meta.activeWorkspace = route.workspaceId;
        });
        send(
          response,
          200,
          {
            ...result,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '工作台保存失败。' },
            ...(error?.code === 'PROJECT_REVISION_CONFLICT'
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && projectTrashIdFromPath(url.pathname)) {
      try {
        const id = projectTrashIdFromPath(url.pathname);
        if (id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID) await readProjectCatalog();
        if (await projectHasArchivedCopy(id)) throw new Error('项目已归档。');
        const result = await projectStorage.readTrash(id);
        if (!result) throw new Error('项目不存在。');
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '回收站读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PUT' && projectTrashIdFromPath(url.pathname)) {
      try {
        const id = projectTrashIdFromPath(url.pathname);
        if (await projectHasArchivedCopy(id)) {
          throw new Error('项目已经归档，已拒绝过期的自动保存。');
        }
        const result = await projectStorage.saveTrash(
          id,
          await readBody(request, MAX_PROJECT_BODY),
        );
        await mutateProjectCatalogAfterCommit((catalog) => {
          const meta = catalog.projects.find((project) => project.id === id);
          if (meta) {
            meta.updatedAt = result.updatedAt;
            meta.revision = result.revision;
          }
        });
        send(
          response,
          200,
          {
            ...result,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '回收站保存失败。' },
            ...(error?.code === 'PROJECT_REVISION_CONFLICT'
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && projectDuplicateIdFromPath(url.pathname)) {
      try {
        const sourceId = projectDuplicateIdFromPath(url.pathname);
        const body = await readBody(request);
        const requestId = normalizedProjectRequestId(body.requestId);
        const requestKey = catalogCreationRequestKey(
          'duplicate',
          requestId,
          sourceId,
          body.expectedCatalogRevision === undefined
            ? ''
            : JSON.stringify([
                body.expectedCatalogRevision,
                body.name ?? null,
                body.folderId === undefined ? 'inherit' : body.folderId,
              ]),
        );
        const id = deterministicCatalogId('project', requestKey);
        const catalogBefore = await readProjectCatalog();
        const sourceMeta = catalogBefore.projects.find((project) => project.id === sourceId);
        const existing = catalogBefore.projects.find(
          (project) => project.creationRequestId === requestKey,
        );
        if (existing) {
          const stored = await projectStorage.readProjectRecord(existing.id);
          send(
            response,
            200,
            {
              project: existing,
              item: existing,
              workspace: stored?.workspace,
              manifest: stored?.manifest,
              revision: stored?.revision ?? existing.revision,
              catalog: catalogBefore,
            },
            request,
          );
          return;
        }
        assertCatalogRevision(catalogBefore, body.expectedCatalogRevision);
        if (await projectHasArchivedCopy(sourceId)) throw new Error('项目已归档。');
        const folderId =
          body.folderId === undefined
            ? sourceMeta?.folderId || null
            : body.folderId === null || body.folderId === ''
              ? null
              : PROJECT_FOLDER_ID_RE.test(String(body.folderId))
                ? String(body.folderId)
                : (() => {
                    throw new Error('项目文件夹编号无效。');
                  })();
        if (folderId && !catalogBefore.folders.some((folder) => folder.id === folderId)) {
          throw new Error('项目文件夹不存在。');
        }
        const name = normalizeProjectName(body.name, `${sourceMeta?.name || sourceId} 副本`);
        const createdAt = Date.now();
        const duplicated = await projectStorage.duplicateProject(sourceId, id, {
          projectName: name,
          manifestPatch: {
            projectName: name,
            name,
            title: name,
            folderId,
            createdAt,
            creationRequestId: requestKey,
          },
        });
        const mutation = await mutateProjectCatalogAfterCommit((catalog) => {
          const concurrentExisting = requestId
            ? catalog.projects.find((project) => project.creationRequestId === requestKey)
            : catalog.projects.find((project) => project.id === id);
          if (concurrentExisting) return concurrentExisting;
          const effectiveFolderId = catalog.folders.some((folder) => folder.id === folderId)
            ? folderId
            : null;
          const project = normalizeProjectMeta({
            id,
            name,
            title: name,
            createdAt: duplicated.savedAt,
            updatedAt: duplicated.savedAt,
            revision: duplicated.revision,
            activeWorkspace: duplicated.manifest.currentWorkspace || 'views',
            folderId: effectiveFolderId,
            coverUrl: sourceMeta?.coverUrl,
            coverAssetId: sourceMeta?.coverAssetId,
            creationRequestId: requestKey,
          });
          catalog.projects.push(project);
          return project;
        });
        send(
          response,
          duplicated.created ? 201 : 200,
          {
            project: mutation.result,
            item: mutation.result,
            workspace: duplicated.workspace,
            manifest: duplicated.manifest,
            revision: duplicated.revision,
            catalog: mutation.catalog,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          { error: { message: error instanceof Error ? error.message : '项目复制失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/projects') {
      try {
        const body = await readBody(request);
        const requestId = normalizedProjectRequestId(body.requestId);
        const requestKey = catalogCreationRequestKey(
          'create',
          requestId,
          '',
          body.expectedCatalogRevision === undefined
            ? ''
            : JSON.stringify([
                body.expectedCatalogRevision,
                body.name ?? null,
                body.folderId ?? null,
              ]),
        );
        const id = deterministicCatalogId('project', requestKey);
        const catalogBefore = await readProjectCatalog();
        const existing = catalogBefore.projects.find(
          (project) => project.creationRequestId === requestKey,
        );
        if (existing) {
          const stored = await projectStorage.readProjectRecord(existing.id);
          send(
            response,
            200,
            {
              project: existing,
              item: existing,
              workspace: stored?.workspace,
              manifest: stored?.manifest,
              revision: stored?.revision ?? existing.revision,
              catalog: catalogBefore,
            },
            request,
          );
          return;
        }
        assertCatalogRevision(catalogBefore, body.expectedCatalogRevision);
        const folderId = PROJECT_FOLDER_ID_RE.test(String(body.folderId || ''))
          ? String(body.folderId)
          : body.folderId == null || body.folderId === ''
            ? null
            : (() => {
                throw new Error('项目文件夹编号无效。');
              })();
        if (folderId && !catalogBefore.folders.some((folder) => folder.id === folderId)) {
          throw new Error('项目文件夹不存在。');
        }
        const name = normalizeProjectName(body.name, '未命名项目');
        const createdAt = Date.now();
        const created = await projectStorage.ensureProject(id, {
          projectName: name,
          workspaceId: 'views',
          workspace: { nodes: [], edges: [] },
          manifestPatch: {
            projectName: name,
            name,
            title: name,
            folderId,
            createdAt,
            creationRequestId: requestKey,
            workspace: 'views',
            currentWorkspace: 'views',
            activeWorkspace: 'views',
            tabs: [{ id: `tab-${id}-views`, name: '画板 1', workspace: 'views' }],
            activeTabId: `tab-${id}-views`,
            genParams: {},
            activeTags: [],
            assets: [],
          },
        });
        const mutation = await mutateProjectCatalogAfterCommit((catalog) => {
          const concurrentExisting = requestId
            ? catalog.projects.find((project) => project.creationRequestId === requestKey)
            : catalog.projects.find((project) => project.id === id);
          if (concurrentExisting) return concurrentExisting;
          const effectiveFolderId = catalog.folders.some((folder) => folder.id === folderId)
            ? folderId
            : null;
          const project = normalizeProjectMeta({
            id,
            name,
            title: name,
            createdAt: created.savedAt,
            updatedAt: created.savedAt,
            revision: created.revision,
            activeWorkspace: 'views',
            folderId: effectiveFolderId,
            creationRequestId: requestKey,
          });
          catalog.projects.push(project);
          return project;
        });
        send(
          response,
          created.created ? 201 : 200,
          {
            project: mutation.result,
            item: mutation.result,
            workspace: created.workspace,
            manifest: created.manifest,
            revision: created.revision,
            catalog: mutation.catalog,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          { error: { message: error instanceof Error ? error.message : '项目创建失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && projectIdFromPath(url.pathname)) {
      try {
        const id = projectIdFromPath(url.pathname);
        if (await projectHasArchivedCopy(id)) throw new Error('项目已归档。');
        const catalog = await readProjectCatalog().catch(() => ({
          projects: [],
          primaryProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
          canvasProjectId: BRIDGE_PRIMARY_CANVAS_PROJECT_ID,
        }));
        const storedProject = await projectStorage.readProjectRecord(id);
        const workspace = storedProject?.workspace ?? null;
        const project =
          catalog.projects.find((item) => item.id === id) ||
          (storedProject
            ? normalizeProjectMeta({
                id,
                name: storedProject.manifest?.projectName || workspace?.projectName || id,
                title:
                  storedProject.manifest?.title ||
                  storedProject.manifest?.projectName ||
                  workspace?.projectName ||
                  id,
                updatedAt: storedProject.manifest?.updatedAt,
                revision: storedProject.revision,
                activeWorkspace:
                  storedProject.manifest?.workspace || storedProject.manifest?.currentWorkspace,
              })
            : null);
        if (!project) throw new Error('项目不存在。');
        send(
          response,
          200,
          {
            project,
            workspace,
            revision: Number(storedProject?.revision) || Number(project.revision) || 0,
            primaryProjectId: catalog.primaryProjectId,
            canvasProjectId: catalog.canvasProjectId,
            isPrimary: id === catalog.primaryProjectId,
            manifest: storedProject?.manifest
              ? {
                  ...storedProject.manifest,
                  workspace:
                    storedProject.manifest.workspace ||
                    storedProject.manifest.currentWorkspace ||
                    project.activeWorkspace,
                  activeWorkspace:
                    storedProject.manifest.activeWorkspace ||
                    storedProject.manifest.currentWorkspace ||
                    project.activeWorkspace,
                }
              : undefined,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '项目读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PUT' && projectIdFromPath(url.pathname)) {
      try {
        const id = projectIdFromPath(url.pathname);
        send(
          response,
          200,
          await saveProjectWorkspace(id, await readBody(request, MAX_PROJECT_BODY)),
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目保存失败。' },
            ...(error?.code === 'PROJECT_REVISION_CONFLICT'
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && projectIdFromPath(url.pathname)) {
      try {
        const id = projectIdFromPath(url.pathname);
        if (await projectHasArchivedCopy(id)) throw new Error('项目已归档。');
        const body = await readBody(request);
        const metadataPatch = {
          ...(body.name !== undefined
            ? {
                name: normalizeProjectName(body.name, id),
                title: normalizeProjectName(body.name, id),
              }
            : {}),
          ...(body.folderId !== undefined
            ? {
                folderId:
                  body.folderId === null || body.folderId === ''
                    ? null
                    : PROJECT_FOLDER_ID_RE.test(String(body.folderId))
                      ? String(body.folderId)
                      : (() => {
                          throw new Error('项目文件夹编号无效。');
                        })(),
              }
            : {}),
          ...(await validatedProjectCoverPatch(body)),
        };
        if (!Object.keys(metadataPatch).length) throw new Error('没有可保存的项目字段。');
        const catalogBefore = await readProjectCatalog();
        assertCatalogRevision(catalogBefore, body.expectedCatalogRevision);
        if (
          metadataPatch.folderId &&
          !catalogBefore.folders.some((folder) => folder.id === metadataPatch.folderId)
        ) {
          throw new Error('项目文件夹不存在。');
        }
        const updated = await projectStorage.updateProjectMetadata(id, metadataPatch, {
          expectedRevision: body.expectedRevision,
        });
        const catalogUpdate = await mutateProjectCatalogAfterCommit((catalog) => {
          let project = catalog.projects.find((item) => item.id === id);
          if (!project) {
            project = normalizeProjectMeta({
              id,
              name: updated.manifest.projectName || id,
              title: updated.manifest.title || updated.manifest.projectName || id,
              createdAt: updated.updatedAt,
            });
            catalog.projects.push(project);
          }
          if (metadataPatch.name !== undefined) {
            project.name = metadataPatch.name;
            project.title = metadataPatch.title;
          }
          if (metadataPatch.folderId !== undefined) {
            project.folderId = catalog.folders.some(
              (folder) => folder.id === metadataPatch.folderId,
            )
              ? metadataPatch.folderId
              : null;
          }
          if (metadataPatch.coverUrl !== undefined) {
            if (metadataPatch.coverUrl) {
              project.coverUrl = metadataPatch.coverUrl;
              project.coverAssetId = metadataPatch.coverAssetId;
            } else {
              delete project.coverUrl;
              delete project.coverAssetId;
            }
          }
          project.updatedAt = updated.updatedAt;
          project.revision = updated.revision;
          return project;
        });
        const project =
          catalogUpdate.result ||
          normalizeProjectMeta({
            id,
            name: updated.manifest.projectName,
            title: updated.manifest.title || updated.manifest.projectName,
            folderId: updated.manifest.folderId,
            coverUrl: updated.manifest.coverUrl,
            coverAssetId: updated.manifest.coverAssetId,
            updatedAt: updated.updatedAt,
            revision: updated.revision,
          });
        send(
          response,
          200,
          {
            project,
            item: project,
            workspace: updated.workspace,
            manifest: updated.manifest,
            revision: updated.revision,
            catalog: catalogUpdate.catalog,
          },
          request,
        );
      } catch (error) {
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目保存失败。' },
            ...(error?.code === 'PROJECT_REVISION_CONFLICT'
              ? { currentRevision: error.currentRevision }
              : {}),
            ...(error?.code === 'PROJECT_CATALOG_CONFLICT'
              ? { currentCatalogRevision: error.currentCatalogRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'DELETE' && projectIdFromPath(url.pathname)) {
      const id = projectIdFromPath(url.pathname);
      try {
        if (id === BRIDGE_PRIMARY_CANVAS_PROJECT_ID) throw new Error('主画布不能归档。');
        const body = await readBody(request);
        assertCatalogRevision(await readProjectCatalog(), body.expectedCatalogRevision);
        projectArchiveTombstones.add(id);
        const archived = await projectStorage.archiveProject(id, {
          expectedRevision: body.expectedRevision,
        });
        const catalogUpdate = await mutateProjectCatalogAfterCommit((catalog) => {
          const index = catalog.projects.findIndex((item) => item.id === id);
          return index >= 0 ? catalog.projects.splice(index, 1)[0] : null;
        });
        send(
          response,
          200,
          {
            ...archived,
            removed: id,
            project: catalogUpdate.result,
            recoverable: true,
            catalog: catalogUpdate.catalog,
          },
          request,
        );
      } catch (error) {
        if (!(await projectStorage.isProjectArchived(id).catch(() => false))) {
          projectArchiveTombstones.delete(id);
        }
        send(
          response,
          projectWriteErrorStatus(error),
          {
            error: { message: error instanceof Error ? error.message : '项目归档失败。' },
            ...(error?.code === 'PROJECT_REVISION_CONFLICT'
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/style-library') {
      const library = await readStyleLibrary();
      send(
        response,
        200,
        {
          ...library,
          items: library.items.map(publicStyleItem),
          sourceAvailable: Boolean(animeLibraryRoot && existsSync(animeLibraryRoot)),
          extractorAvailable: existsSync(LOCAL_FFMPEG_PATH),
        },
        request,
      );
      return;
    }
    const pluginDocumentRoute =
      request.method === 'POST'
        ? /^\/plugins\/project-documents\/(status|migrate|complete-migration|read|write|delete)$/.exec(
            url.pathname,
          )
        : null;
    if (pluginDocumentRoute) {
      try {
        const body = await readBody(request, MAX_PLUGIN_DOCUMENT_BODY);
        send(
          response,
          200,
          await handlePluginProjectDocumentRequest(pluginDocumentRoute[1], body),
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof PluginFileDocumentConflictError ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '插件项目文档操作失败。',
            },
            ...(error instanceof PluginFileDocumentConflictError
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    const pluginStyleCoverRoute =
      request.method === 'POST'
        ? /^\/plugins\/shared-style-covers\/(read|write|delete)$/.exec(url.pathname)
        : null;
    if (pluginStyleCoverRoute) {
      try {
        const body = await readBody(request, MAX_PLUGIN_STYLE_COVER_BODY);
        send(
          response,
          200,
          await handlePluginSharedStyleCoverRequest(pluginStyleCoverRoute[1], body),
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof PluginSharedStyleCoverConflictError ? 409 : 400,
          {
            error: {
              message: error instanceof Error ? error.message : '共享风格封面操作失败。',
            },
            ...(error instanceof PluginSharedStyleCoverConflictError
              ? { currentRevision: error.currentRevision }
              : {}),
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/plugins') {
      try {
        send(response, 200, await readPluginCatalog(), request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '插件目录读取失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      /^\/plugins\/assets\/[a-z][a-z0-9-]{2,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(
        url.pathname,
      )
    ) {
      try {
        const [, , , pluginId, assetName] = url.pathname.split('/');
        const catalog = await readPluginCatalog();
        const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
        const declaredAssets = new Set([
          ...(plugin?.manifest.assets ?? []),
          ...(plugin?.manifest.contributes.locales.map((locale) => locale.file) ?? []),
          ...(plugin?.manifest.contributes.widgets.flatMap((item) =>
            [item.asset, item.centerAsset].filter(Boolean),
          ) ?? []),
        ]);
        if (!plugin || !plugin.enabled || !declaredAssets.has(assetName)) {
          throw new Error('插件素材不存在、未启用或未在清单中声明。');
        }
        const extension = extname(assetName).toLowerCase();
        const mime =
          {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.glb': 'model/gltf-binary',
            '.gltf': 'model/gltf+json',
            '.wasm': 'application/wasm',
            '.json': 'application/json',
            '.css': 'text/css',
            '.txt': 'text/plain',
          }[extension] ||
          generatedOutputAudioMime(extension) ||
          'application/octet-stream';
        await streamFileResponse(
          request,
          response,
          join(plugin.directory, assetName),
          mime,
          extension === '.svg' ? assetName : '',
          'public, max-age=3600',
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '插件图片读取失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      /^\/plugins\/runtime\/[a-z][a-z0-9-]{2,63}$/.test(url.pathname)
    ) {
      try {
        const pluginId = url.pathname.split('/').at(-1);
        const catalog = await readPluginCatalog();
        const plugin = catalog.plugins.find((item) => item.manifest.id === pluginId);
        if (!plugin || !plugin.enabled || !plugin.compatible || !plugin.manifest.runtime) {
          throw new Error('插件运行时不存在、未启用或版本不兼容。');
        }
        const runtimeBytes = await readFile(join(plugin.directory, plugin.manifest.runtime.entry));
        if (runtimeBytes.length > MAX_PLUGIN_RUNTIME_BYTES)
          throw new Error('插件运行时不能超过 2 MB。');
        send(
          response,
          200,
          {
            source: runtimeBytes.toString('utf8'),
            sha256: createHash('sha256').update(runtimeBytes).digest('hex'),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '插件运行时读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/capture/start') {
      try {
        const upload = parseMotionCaptureUpload(url, request);
        const { engineId } = await enabledPluginMotionWorker(upload.pluginId, upload.engineId);
        const bytes = await readBinaryBody(request, MAX_MANAGED_MOTION_VIDEO_BYTES);
        send(
          response,
          202,
          await managedMotionWorkers.startCapture(engineId, { ...upload, bytes }),
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionWorkerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : 'AI 动作任务启动失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'POST' &&
      [
        '/plugins/vision/capture/status',
        '/plugins/vision/capture/result',
        '/plugins/vision/capture/cancel',
      ].includes(url.pathname)
    ) {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'engineId' && key !== 'jobId',
        );
        if (unknown.length) {
          throw new ManagedMotionWorkerError(
            `AI 动作任务请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        await enabledPluginMotionWorker(body.pluginId, body.engineId);
        const result =
          url.pathname === '/plugins/vision/capture/status'
            ? managedMotionWorkers.status(body.jobId, body.engineId)
            : url.pathname === '/plugins/vision/capture/cancel'
              ? await managedMotionWorkers.cancel(body.jobId, body.engineId)
              : managedMotionWorkers.result(body.jobId, body.engineId);
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionWorkerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : 'AI 动作任务读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/models/catalog') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter((key) => key !== 'pluginId');
        if (unknown.length) {
          throw new ManagedMotionInstallerError(
            `动作模型目录包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        await enabledPluginMotionInstaller(body.pluginId);
        const catalog = await getManagedMotionInstaller().catalog();
        const models = await Promise.all(
          catalog.models.map(async (model) => {
            if (!model.installed || model.id === DEPTH_ANYTHING_MODEL_ID) return model;
            const worker =
              model.id === SAPIENS_NORMAL_MODEL_ID
                ? await managedSapiensNormalWorker.probe()
                : await managedMotionWorkers.probe(model.id);
            return {
              ...model,
              workerAvailable: worker.available,
              workerAvailability: worker.availability,
              workerBackend: worker.backend,
              workerMessage: worker.message,
            };
          }),
        );
        send(response, 200, { ...catalog, models }, request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: { message: error instanceof Error ? error.message : '动作模型目录读取失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/sapiens-normal/render') {
      try {
        const body = await readBody(request, MAX_SAPIENS_NORMAL_BODY);
        const allowed = new Set([
          'pluginId',
          'modelId',
          'mimeType',
          'timestampMs',
          'width',
          'height',
          'base64',
        ]);
        const unknown = Object.keys(body || {}).filter((key) => !allowed.has(key));
        if (unknown.length) {
          throw new ManagedSapiensNormalWorkerError(
            `Sapiens2 帧请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { plugin } = await enabledPluginMotionInstaller(body.pluginId, body.modelId);
        if (body.modelId !== SAPIENS_NORMAL_MODEL_ID) {
          throw new ManagedSapiensNormalWorkerError('Sapiens2 帧模型无效。', 400);
        }
        if (!plugin.manifest.permissions.includes('vision:pose')) {
          throw new ManagedSapiensNormalWorkerError('插件没有 vision:pose 权限。', 403);
        }
        const mimeType = String(body.mimeType || '').toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          throw new ManagedSapiensNormalWorkerError('Sapiens2 输入帧格式无效。', 400);
        }
        const timestampMs = Number(body.timestampMs);
        const width = Number(body.width);
        const height = Number(body.height);
        if (
          !Number.isFinite(timestampMs) ||
          timestampMs < 0 ||
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 16 ||
          height < 16 ||
          width > 1280 ||
          height > 1280 ||
          typeof body.base64 !== 'string'
        ) {
          throw new ManagedSapiensNormalWorkerError('Sapiens2 输入帧参数无效。', 400);
        }
        const bytes = Buffer.from(body.base64, 'base64');
        const result = await managedSapiensNormalWorker.render({ bytes, timestampMs });
        send(
          response,
          200,
          {
            mimeType: result.mimeType,
            timestampMs: result.timestampMs,
            width: result.width,
            height: result.height,
            inferenceMs: result.inferenceMs,
            base64: result.bytes.toString('base64'),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof ManagedSapiensNormalWorkerError ? error.statusCode : 500,
          {
            error: {
              message: error instanceof Error ? error.message : 'Sapiens2 法线帧生成失败。',
            },
          },
          request,
        );
      }
      return;
    }
    const depthModelFileMatch =
      request.method === 'GET'
        ? /^\/plugins\/vision\/models\/files\/depth-anything-v2-small\/(config\.json|preprocessor_config\.json|onnx\/model_quantized\.onnx)$/.exec(
            url.pathname,
          )
        : null;
    if (depthModelFileMatch) {
      try {
        const { plugin } = await enabledPluginMotionInstaller(
          QIANSI_MOTION_PLUGIN_ID,
          DEPTH_ANYTHING_MODEL_ID,
        );
        if (!plugin.manifest.permissions.includes('vision:pose')) {
          throw new ManagedMotionInstallerError('插件没有 vision:pose 权限。', 403);
        }
        const requestedFile = depthModelFileMatch[1];
        if (requestedFile === 'config.json') {
          send(response, 200, DEPTH_ANYTHING_MODEL_CONFIG, request);
        } else if (requestedFile === 'preprocessor_config.json') {
          send(response, 200, DEPTH_ANYTHING_PREPROCESSOR_CONFIG, request);
        } else {
          await streamFileResponse(
            request,
            response,
            await getManagedMotionInstaller().installedModelFile(DEPTH_ANYTHING_MODEL_ID),
            'application/octet-stream',
            '',
            'private, max-age=31536000, immutable',
          );
        }
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: {
              message: error instanceof Error ? error.message : 'Depth Anything 模型读取失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/models/status') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'engineId',
        );
        if (unknown.length) {
          throw new ManagedMotionInstallerError(
            `动作模型状态包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { engineId } = await enabledPluginMotionInstaller(body.pluginId, body.engineId);
        const installer = getManagedMotionInstaller();
        send(
          response,
          200,
          installer.isInstalling(engineId)
            ? installer.taskStatus(engineId)
            : await installer.status(engineId),
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: { message: error instanceof Error ? error.message : '动作模型状态读取失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/models/start') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'engineId',
        );
        if (unknown.length) {
          throw new ManagedMotionInstallerError(
            `动作模型安装包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { engineId } = await enabledPluginMotionInstaller(body.pluginId, body.engineId);
        const installer = getManagedMotionInstaller();
        installer
          .install(engineId)
          .then(() => {
            if (engineId === SAPIENS_NORMAL_MODEL_ID) {
              managedSapiensNormalWorker.invalidateProbe();
            } else if (!DENSE_VISION_MODEL_IDS.has(engineId)) {
              managedMotionWorkers.invalidateProbe(engineId);
            }
          })
          .catch((error) => {
            if (error?.name === 'AbortError') return;
            console.error(
              `[Qiansi Motion Capture] ${engineId} 安装失败：${error instanceof Error ? error.message : String(error)}`,
            );
          });
        send(response, 202, installer.taskStatus(engineId), request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: { message: error instanceof Error ? error.message : '动作模型安装启动失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/models/cancel') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'engineId',
        );
        if (unknown.length) {
          throw new ManagedMotionInstallerError(
            `取消动作模型安装包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { engineId } = await enabledPluginMotionInstaller(body.pluginId, body.engineId);
        send(response, 200, await getManagedMotionInstaller().cancel(engineId), request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: { message: error instanceof Error ? error.message : '动作模型安装取消失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/vision/models/uninstall') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'engineId',
        );
        if (unknown.length) {
          throw new ManagedMotionInstallerError(
            `删除动作模型包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { engineId } = await enabledPluginMotionInstaller(body.pluginId, body.engineId);
        if (
          managedMotionWorkers.isCapturing() ||
          (engineId === SAPIENS_NORMAL_MODEL_ID && managedSapiensNormalWorker.isRendering())
        ) {
          throw new ManagedMotionInstallerError('AI 动作正在捕捉，请先取消任务再删除模型。', 409);
        }
        const result = await getManagedMotionInstaller().uninstall(engineId);
        if (engineId === SAPIENS_NORMAL_MODEL_ID) {
          await managedSapiensNormalWorker.stopAll();
          managedSapiensNormalWorker.invalidateProbe();
        } else if (!DENSE_VISION_MODEL_IDS.has(engineId)) {
          managedMotionWorkers.invalidateProbe(engineId);
        }
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedMotionInstallerError ? error.statusCode : 500,
          {
            error: { message: error instanceof Error ? error.message : '动作模型删除失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/install/catalog') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter((key) => key !== 'pluginId');
        if (unknown.length > 0) {
          throw new ManagedAudioInstallerError(
            `安装目录请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        await enabledPluginAudioInstaller(body.pluginId);
        send(response, 200, await getManagedAudioInstaller().catalog(), request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedAudioInstallerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '模型安装目录读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/install/status') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'generatorId',
        );
        if (unknown.length > 0) {
          throw new ManagedAudioInstallerError(
            `安装状态请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { generatorId } = await enabledPluginAudioInstaller(body.pluginId, body.generatorId);
        const installer = getManagedAudioInstaller();
        const result = installer.isInstalling(generatorId)
          ? installer.taskStatus(generatorId)
          : await installer.status(generatorId);
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedAudioInstallerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '模型安装状态读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/install/start') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'generatorId' && key !== 'licenseAcceptance',
        );
        if (unknown.length > 0) {
          throw new ManagedAudioInstallerError(
            `安装请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { generator, generatorId, plugin } = await enabledPluginAudioInstaller(
          body.pluginId,
          body.generatorId,
        );
        const installer = getManagedAudioInstaller();
        if (managedAudioWorkers.isGenerating()) {
          throw new ManagedAudioInstallerError('音频正在生成，请完成或取消后再安装模型。', 409);
        }
        const task = installer.install(generatorId, {
          ...(body.licenseAcceptance == null ? {} : { licenseAcceptance: body.licenseAcceptance }),
          beforeInstall: async () => {
            if (!generator?.hostAdapter) return;
            await managedAudioWorkers.stop(generator.hostAdapter, {
              pluginId: plugin.manifest.id,
              pluginRoot: plugin.directory,
            });
          },
        });
        task.catch((error) => {
          if (error?.name === 'AbortError') return;
          console.error(
            `[Qiansi Audio] ${generatorId} 安装失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
        send(response, 202, installer.taskStatus(generatorId), request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedAudioInstallerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '模型安装启动失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/install/cancel') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'generatorId',
        );
        if (unknown.length > 0) {
          throw new ManagedAudioInstallerError(
            `取消安装请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { generatorId } = await enabledPluginAudioInstaller(body.pluginId, body.generatorId);
        send(response, 200, await getManagedAudioInstaller().cancel(generatorId), request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedAudioInstallerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '模型安装取消失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/install/uninstall') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => key !== 'pluginId' && key !== 'generatorId',
        );
        if (unknown.length > 0) {
          throw new ManagedAudioInstallerError(
            `模型删除请求包含未知字段：${unknown.join('、')}。`,
            400,
          );
        }
        const { generator, generatorId, plugin } = await enabledPluginAudioInstaller(
          body.pluginId,
          body.generatorId,
        );
        if (managedAudioWorkers.isGenerating()) {
          throw new ManagedAudioInstallerError('音频正在生成，请完成或取消后再删除模型。', 409);
        }
        const result = await getManagedAudioInstaller().uninstall(generatorId, {
          beforeUninstall: async () => {
            if (!generator?.hostAdapter) return;
            await managedAudioWorkers.stop(generator.hostAdapter, {
              pluginId: plugin.manifest.id,
              pluginRoot: plugin.directory,
            });
          },
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof ManagedAudioInstallerError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '本机模型删除失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/reference-library/list') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body).filter((key) => key !== 'pluginId');
        if (unknown.length > 0) {
          throw new ReferenceAudioLibraryError(
            `参考音频库列表请求包含未知字段：${unknown.join('、')}。`,
          );
        }
        const library = await enabledPluginReferenceAudioLibrary(body.pluginId);
        send(response, 200, await library.list(), request);
      } catch (error) {
        send(
          response,
          error instanceof ReferenceAudioLibraryError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '参考音频库读取失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/plugins/audio/reference-library/category/create'
    ) {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body).filter((key) => key !== 'pluginId' && key !== 'category');
        if (unknown.length > 0) {
          throw new ReferenceAudioLibraryError(
            `参考音频分类创建请求包含未知字段：${unknown.join('、')}。`,
          );
        }
        const library = await enabledPluginReferenceAudioLibrary(body.pluginId);
        send(response, 200, { category: await library.createCategory(body.category) }, request);
      } catch (error) {
        send(
          response,
          error instanceof ReferenceAudioLibraryError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '参考音频分类创建失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/reference-library/read') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body).filter((key) => !['pluginId', 'id'].includes(key));
        if (unknown.length > 0) {
          throw new ReferenceAudioLibraryError(
            `参考音频读取请求包含未知字段：${unknown.join('、')}。`,
          );
        }
        const library = await enabledPluginReferenceAudioLibrary(body.pluginId);
        const { publicEntry, target } = await library.read(body.id);
        const bytes = await readFile(target);
        if (!bytes.byteLength || bytes.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
          throw new ReferenceAudioLibraryError('参考音频大小无效。', 413);
        }
        response.writeHead(200, {
          'Content-Type': publicEntry.mimeType,
          'Content-Length': bytes.byteLength,
          'X-Qiansi-Audio-File-Name': encodeURIComponent(publicEntry.fileName),
          'Cache-Control': 'no-store',
          ...cors(request),
        });
        response.end(bytes);
      } catch (error) {
        if (!response.headersSent) {
          send(
            response,
            error instanceof ReferenceAudioLibraryError ? error.statusCode : 500,
            { error: { message: error instanceof Error ? error.message : '参考音频读取失败。' } },
            request,
          );
        } else response.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/reference-library/rename') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body).filter(
          (key) => !['pluginId', 'id', 'name', 'category', 'transcript'].includes(key),
        );
        if (unknown.length > 0) {
          throw new ReferenceAudioLibraryError(
            `参考音频修改请求包含未知字段：${unknown.join('、')}。`,
          );
        }
        const library = await enabledPluginReferenceAudioLibrary(body.pluginId);
        send(
          response,
          200,
          { entry: await library.rename(body.id, body.name, body.category, body.transcript) },
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof ReferenceAudioLibraryError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '参考音频修改失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/reference-library/import') {
      try {
        const body = await readBody(request, MAX_PLUGIN_AUDIO_BODY);
        const unknown = Object.keys(body).filter(
          (key) => !['pluginId', 'fileName', 'mimeType', 'base64'].includes(key),
        );
        if (unknown.length > 0) {
          throw new ReferenceAudioLibraryError(
            `参考音频导入请求包含未知字段：${unknown.join('、')}。`,
          );
        }
        const library = await enabledPluginReferenceAudioLibrary(body.pluginId);
        send(
          response,
          200,
          {
            entry: await library.add(
              body.fileName,
              body.mimeType,
              decodeReferenceAudioBase64(body.base64),
            ),
          },
          request,
        );
      } catch (error) {
        send(
          response,
          error instanceof ReferenceAudioLibraryError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '参考音频导入失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/configure-seed-audio-key') {
      try {
        const body = await readBody(request);
        const unknown = Object.keys(body || {}).filter(
          (key) => !['pluginId', 'generatorId', 'apiKey'].includes(key),
        );
        if (unknown.length > 0) {
          throw new SeedAudioConfigError(
            `Seed Audio API Key 配置包含未知字段：${unknown.join('、')}。`,
          );
        }
        const generator = await enabledPluginAudioGenerator(body.pluginId, body.generatorId);
        const result = await saveSeedAudioApiKeyConfig({
          pluginsRoot: PLUGIN_LIBRARY_ROOT,
          pluginRoot: generator.pluginRoot,
          pluginId: generator.pluginId,
          generatorId: generator.id,
          apiKey: body.apiKey,
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof SeedAudioConfigError || error instanceof PluginAudioProxyError
            ? error.statusCode
            : 500,
          {
            error: {
              message: error instanceof Error ? error.message : 'Seed Audio API Key 保存失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/health') {
      try {
        const body = await readBody(request);
        const generator = await enabledPluginAudioGenerator(body.pluginId, body.generatorId);
        const result = generator.hostAdapter
          ? await managedAudioWorkers.probe(generator.hostAdapter, {
              pluginId: generator.pluginId,
              pluginRoot: generator.pluginRoot,
            })
          : await probePluginAudioGeneratorEndpoint(generator);
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          error instanceof PluginAudioProxyError ? error.statusCode : 500,
          { error: { message: error instanceof Error ? error.message : '插件音频服务检查失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/audio/generate') {
      const abortController = new AbortController();
      request.once('aborted', () => abortController.abort());
      response.once('close', () => {
        if (!response.writableEnded) abortController.abort();
      });
      try {
        const body = await readBody(request, MAX_PLUGIN_AUDIO_BODY);
        const generator = await enabledPluginAudioGenerator(body.pluginId, body.generatorId);
        const result = generator.hostAdapter
          ? await managedAudioWorkers.generate(generator.hostAdapter, body.request, {
              pluginId: generator.pluginId,
              pluginRoot: generator.pluginRoot,
              signal: abortController.signal,
              timeoutMs: generator.timeoutMs,
              maxBytes: generator.maxBytes,
            })
          : await generatePluginAudioThroughProxy(generator, body.request, {
              signal: abortController.signal,
            });
        const bytes = Buffer.from(
          result.bytes.buffer,
          result.bytes.byteOffset,
          result.bytes.byteLength,
        );
        response.writeHead(200, {
          'Content-Type': result.mimeType,
          'Content-Length': bytes.byteLength,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
          'X-Qiansi-Audio-File-Name': encodeURIComponent(result.fileName),
          ...(result.durationSeconds
            ? { 'X-Qiansi-Audio-Duration-Seconds': String(result.durationSeconds) }
            : {}),
          'Cache-Control': 'no-store',
          ...cors(request),
        });
        response.end(bytes);
      } catch (error) {
        if (!response.headersSent) {
          send(
            response,
            error instanceof PluginAudioProxyError ? error.statusCode : 500,
            { error: { message: error instanceof Error ? error.message : '插件音频生成失败。' } },
            request,
          );
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/style-samples/read') {
      try {
        const body = await readBody(request);
        const plugin = await enabledPluginStyleSampleOwner(body?.pluginId);
        send(
          response,
          200,
          { sample: await readLatestPluginStyleSample(plugin.directory, body?.packId) },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '风格样图读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/style-samples/upload') {
      try {
        const body = await readBody(request, MAX_PLUGIN_STYLE_SAMPLE_BODY);
        const plugin = await enabledPluginStyleSampleOwner(body?.pluginId);
        const sample = await uploadPluginStyleSample(plugin.directory, body);
        send(response, 201, { sample }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '风格样图上传失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/import') {
      try {
        const body = await readBody(request);
        const manifest = await importPluginManifest(body.manifest ?? body);
        send(response, 201, { manifest, catalog: await readPluginCatalog() }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '插件导入失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/import-package') {
      try {
        const body = await readBody(request, MAX_PLUGIN_PACKAGE_BODY);
        const manifest = await importPluginPackage(body);
        send(response, 201, { manifest, catalog: await readPluginCatalog() }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '插件包导入失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/toggle') {
      try {
        const body = await readBody(request);
        await setPluginEnabled(String(body.id || ''), body.enabled === true);
        send(response, 200, await readPluginCatalog(), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '插件状态更新失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/uninstall') {
      try {
        const body = await readBody(request);
        await uninstallPlugin(String(body.id || ''));
        send(response, 200, await readPluginCatalog(), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '插件卸载失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/plugins/restore') {
      try {
        const body = await readBody(request);
        await restorePlugin(String(body.id || ''));
        send(response, 200, await readPluginCatalog(), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '插件恢复失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/system-update/status') {
      try {
        const config = await readUpdateSourceConfig();
        await mkdir(UPDATE_DOWNLOAD_ROOT, { recursive: true });
        send(
          response,
          200,
          {
            currentVersion: APP_VERSION,
            sourceConfigPath: UPDATE_SOURCE_FILE,
            sourceDefaultsPath: UPDATE_SOURCE_DEFAULT_FILE,
            downloadDirectory: UPDATE_DOWNLOAD_ROOT,
            sources: config.sources.map((source) => ({
              id: source.id,
              name: source.name,
              homepageUrl: source.homepageUrl,
              enabled: source.enabled,
              configured: Boolean(source.manifestUrl),
            })),
            mode: 'download-only',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '更新状态读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/system-update/check') {
      try {
        const body = await readBody(request);
        send(response, 200, await checkSystemUpdates(String(body.sourceId || 'auto')), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '更新检查失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/system-update/connectivity') {
      try {
        const body = await readBody(request);
        send(
          response,
          200,
          await checkSystemUpdateConnectivity(String(body.sourceId || 'auto')),
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '网络检测失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/system-update/download') {
      try {
        const body = await readBody(request);
        send(response, 200, await downloadSystemUpdate(String(body.sourceId || '')), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '更新包下载失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/system-update/rollback') {
      try {
        const body = await readBody(request);
        send(response, 200, await downloadSystemRollback(String(body.sourceId || '')), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '回退版本包下载失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/canvas-themes') {
      try {
        await mkdir(CANVAS_THEME_LIBRARY_ROOT, { recursive: true });
        const entries = await readdir(CANVAS_THEME_LIBRARY_ROOT, { withFileTypes: true });
        const items = await Promise.all(
          entries
            .filter(
              (entry) =>
                entry.isFile() &&
                entry.name.length <= 180 &&
                extname(entry.name).toLowerCase() === '.zip',
            )
            .slice(0, 100)
            .map(async (entry) => {
              const fileStat = await stat(join(CANVAS_THEME_LIBRARY_ROOT, entry.name));
              return { name: entry.name, size: fileStat.size, modifiedAt: fileStat.mtimeMs };
            }),
        );
        items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
        send(response, 200, { directory: CANVAS_THEME_LIBRARY_ROOT, items }, request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '风格目录读取失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/canvas-themes/file') {
      try {
        const name = String(url.searchParams.get('name') || '');
        if (
          !name ||
          name.length > 180 ||
          basename(name) !== name ||
          extname(name).toLowerCase() !== '.zip'
        ) {
          throw new Error('风格文件名无效。');
        }
        await streamFileResponse(
          request,
          response,
          join(CANVAS_THEME_LIBRARY_ROOT, name),
          'application/zip',
          name,
          'no-store',
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '风格文件不存在。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      /^\/style-library\/thumbnails\/[A-Za-z0-9_-]{6,80}$/.test(url.pathname)
    ) {
      try {
        const id = url.pathname.split('/').pop() || '';
        const library = await readStyleLibrary();
        const item = library.items.find((entry) => entry.id === id && entry.thumbnailFile);
        if (!item) throw new Error('风格封面不存在。');
        const bytes = await readFile(join(STYLE_LIBRARY_FILES, item.thumbnailFile));
        response.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': bytes.length,
          'Cache-Control': 'private, max-age=3600',
          ...cors(request),
        });
        response.end(bytes);
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '风格封面不存在。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/style-library/sync') {
      try {
        send(response, 200, await syncAnimeStyleLibrary(), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '本机动漫风格同步失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && styleIdFromPath(url.pathname)) {
      try {
        const id = styleIdFromPath(url.pathname);
        const body = await readBody(request);
        const updated = await mutateStyleLibrary((library) => {
          const index = library.items.findIndex((item) => item.id === id);
          if (index < 0) throw new Error('风格不存在。');
          const previous = library.items[index];
          const next = publicStyleItem({
            ...previous,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.enName !== undefined ? { enName: body.enName } : {}),
            ...(body.category !== undefined ? { category: body.category } : {}),
            ...(body.target !== undefined ? { target: body.target } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.enDescription !== undefined ? { enDescription: body.enDescription } : {}),
            ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
            ...(body.promptModules !== undefined ? { promptModules: body.promptModules } : {}),
            ...(body.negative !== undefined ? { negative: body.negative } : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(body.tags !== undefined ? { tags: body.tags } : {}),
            id: previous.id,
            source: previous.source,
            thumbnailFile: previous.thumbnailFile,
          });
          library.items[index] = next;
          return next;
        });
        send(response, 200, { item: publicStyleItem(updated) }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '风格保存失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'DELETE' && styleIdFromPath(url.pathname)) {
      try {
        const id = styleIdFromPath(url.pathname);
        const removed = await mutateStyleLibrary((library) => {
          const index = library.items.findIndex((item) => item.id === id);
          if (index < 0) throw new Error('风格不存在。');
          const item = library.items.splice(index, 1)[0];
          if (item.source?.series)
            library.ignoredSeries = [
              ...new Set([...(library.ignoredSeries || []), item.source.series]),
            ];
          return item;
        });
        if (removed.thumbnailFile)
          await unlink(join(STYLE_LIBRARY_FILES, removed.thumbnailFile)).catch(() => undefined);
        send(response, 200, { success: true, removed: id }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '风格删除失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/asset-library') {
      try {
        send(response, 200, assetResponse(await readAssetLibrary()), request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '素材库读取失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      /^\/media-preview\/files\/[A-Za-z0-9_-]{12,80}\.webp$/.test(url.pathname)
    ) {
      try {
        const fileName = url.pathname.split('/').pop() || '';
        await streamFileResponse(
          request,
          response,
          managedPreviewFilePath(fileName),
          'image/webp',
          '',
          'private, max-age=31536000, immutable',
        );
      } catch {
        send(response, 404, { error: { message: '媒体预览不存在。' } }, request);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/media-preview/upload') {
      const mime = cleanAssetText(
        String(request.headers['content-type'] || '').split(';')[0],
        '',
        100,
      ).toLowerCase();
      if (mime !== 'image/webp') {
        send(response, 400, { error: { message: '媒体预览必须是 WebP 图片。' } }, request);
        return;
      }
      const declaredLength = Number(request.headers['content-length'] || 0);
      if (declaredLength > MAX_MEDIA_PREVIEW_BYTES) {
        send(response, 413, { error: { message: '媒体预览不能超过 16MB。' } }, request);
        return;
      }
      const id = `preview_${randomUUID().replace(/-/g, '')}`;
      const fileName = `${id}.webp`;
      const targetPath = join(MEDIA_PREVIEW_ROOT, fileName);
      const temporaryPath = `${targetPath}.${randomUUID()}.upload`;
      let size = 0;
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          callback(
            size > MAX_MEDIA_PREVIEW_BYTES ? new Error('媒体预览不能超过 16MB。') : null,
            chunk,
          );
        },
      });
      try {
        await mkdir(MEDIA_PREVIEW_ROOT, { recursive: true });
        await pipeline(request, counter, createWriteStream(temporaryPath, { flags: 'wx' }));
        if (!size) throw new Error('媒体预览为空。');
        inspectDeclaredMediaSignature(await readAssetSignature(temporaryPath, size), 'image/webp');
        await fsyncFile(temporaryPath);
        await rename(temporaryPath, targetPath);
        await fsyncDirectory(MEDIA_PREVIEW_ROOT);
        send(response, 201, { id, url: `/media-preview/files/${fileName}`, size }, request);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '媒体预览保存失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      /^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/.test(url.pathname)
    ) {
      try {
        const id = url.pathname.split('/').pop() || '';
        const library = await readAssetLibrary();
        const item = library.items.find((entry) => entry.id === id && entry.fileName);
        if (!item) throw new Error('素材文件不存在。');
        await streamMediaOrPreview(
          request,
          response,
          url,
          managedAssetFilePath(item.fileName),
          item.mime || 'application/octet-stream',
        );
      } catch (error) {
        send(
          response,
          404,
          { error: { message: error instanceof Error ? error.message : '素材文件不存在。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/asset-library/upload') {
      try {
        send(response, 201, { item: await importAssetStream(request) }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '素材上传失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/asset-library/import') {
      try {
        send(
          response,
          201,
          { item: await importAssetFile(await readBody(request, MAX_ASSET_BODY)) },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '素材导入失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/asset-library/references') {
      try {
        const body = await readBody(request);
        if (!/^https?:\/\//i.test(String(body.url || '')))
          throw new Error('引用素材必须使用 http 或 https 地址。');
        const kind = assetKindFor(String(body.kind || ''), String(body.mime || ''));
        const item = normalizeAssetItem({
          ...body,
          id: `asset_${randomUUID().replace(/-/g, '')}`,
          kind,
          color: assetColor(kind),
          createdAt: Date.now(),
        });
        await mutateAssetLibrary((library) => {
          library.items.unshift(item);
          return item;
        });
        send(response, 201, { item: publicAssetItem(item) }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '引用素材保存失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'PATCH' && assetIdFromPath(url.pathname)) {
      try {
        const id = assetIdFromPath(url.pathname);
        const body = await readBody(request);
        const item = await mutateAssetLibrary((library) => {
          const index = library.items.findIndex((entry) => entry.id === id);
          if (index < 0) throw new Error('素材不存在。');
          const current = library.items[index];
          library.items[index] = normalizeAssetItem({
            ...current,
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.project !== undefined ? { project: body.project } : {}),
            ...(body.kind !== undefined
              ? { kind: body.kind, color: assetColor(String(body.kind)) }
              : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.tags !== undefined ? { tags: body.tags } : {}),
            updatedAt: Date.now(),
          });
          return library.items[index];
        });
        send(response, 200, { item: publicAssetItem(item) }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '素材保存失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'DELETE' && assetIdFromPath(url.pathname)) {
      try {
        const id = assetIdFromPath(url.pathname);
        const removed = await mutateAssetLibrary((library) => {
          const index = library.items.findIndex((entry) => entry.id === id);
          if (index < 0) throw new Error('素材不存在。');
          return library.items.splice(index, 1)[0];
        });
        if (removed.fileName)
          await unlink(join(ASSET_LIBRARY_FILES, removed.fileName)).catch(() => undefined);
        send(response, 200, { success: true, removed: id }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '素材删除失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'POST' &&
      (url.pathname === '/asset-library/items/move' ||
        url.pathname === '/asset-library/items/delete')
    ) {
      try {
        const body = await readBody(request);
        const ids = new Set(
          (Array.isArray(body.ids) ? body.ids : [])
            .map(String)
            .filter((id) => /^[A-Za-z0-9_-]{6,80}$/.test(id))
            .slice(0, 500),
        );
        if (!ids.size) throw new Error('请先选择素材。');
        if (url.pathname.endsWith('/delete')) {
          const removed = await mutateAssetLibrary((library) => {
            const matches = library.items.filter((item) => ids.has(item.id));
            library.items = library.items.filter((item) => !ids.has(item.id));
            return matches;
          });
          await Promise.all(
            removed
              .filter((item) => item.fileName)
              .map((item) =>
                unlink(join(ASSET_LIBRARY_FILES, item.fileName)).catch(() => undefined),
              ),
          );
          send(response, 200, { success: true, removed: removed.length }, request);
        } else {
          const project = /^[A-Za-z0-9_-]{1,80}$/.test(String(body.project || ''))
            ? String(body.project)
            : 'clocktower';
          const kind = ASSET_KINDS.has(String(body.kind || '')) ? String(body.kind) : 'character';
          const moved = await mutateAssetLibrary((library) => {
            let count = 0;
            library.items = library.items.map((item) =>
              ids.has(item.id)
                ? ((count += 1),
                  normalizeAssetItem({
                    ...item,
                    project,
                    kind,
                    color: assetColor(kind),
                    updatedAt: Date.now(),
                  }))
                : item,
            );
            return count;
          });
          send(response, 200, { success: true, moved }, request);
        }
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '批量操作失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jimeng/status') {
      try {
        send(response, 200, await jimengStatus(), request);
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '即梦状态检测失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jimeng/install/start') {
      try {
        send(response, 200, await startJimengInstall(), request);
      } catch (error) {
        send(
          response,
          400,
          {
            error: { message: error instanceof Error ? error.message : '即梦 CLI 安装启动失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jimeng/install/status') {
      try {
        send(response, 200, await jimengInstallPayload(), request);
      } catch (error) {
        send(
          response,
          500,
          {
            error: {
              message: error instanceof Error ? error.message : '即梦 CLI 安装状态读取失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jimeng/login/start') {
      try {
        send(response, 200, await startJimengLogin(), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '即梦登录启动失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jimeng/login/status') {
      try {
        if (jimengIsRunning()) {
          send(response, 200, jimengLoginPayload(false), request);
          return;
        }
        try {
          const credit = await runDreamina(['user_credit'], 20000);
          invalidateJimengStatus();
          send(response, 200, jimengLoginPayload(true, credit.raw), request);
        } catch {
          send(response, 200, jimengLoginPayload(false), request);
        }
      } catch (error) {
        send(
          response,
          500,
          { error: { message: error instanceof Error ? error.message : '即梦登录状态读取失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'GET' &&
      (url.pathname === '/jimeng/credit' || url.pathname === '/jimeng/credits')
    ) {
      try {
        const credit = await runDreamina(['user_credit'], 30000);
        send(response, 200, { success: true, raw: credit.raw }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '即梦积分查询失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jimeng/logout') {
      try {
        if (jimengIsRunning()) {
          jimengLoginSession.child.kill();
          jimengLoginSession.exitCode = 1;
        }
        const result = await runDreamina(['logout'], 30000);
        invalidateJimengStatus();
        jimengLoginSession.stdout = '';
        jimengLoginSession.stderr = '';
        send(response, 200, { success: true, raw: result.raw }, request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : '即梦退出登录失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/lightx2v/config') {
      send(response, 200, { config: lightX2VConfig }, request);
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/lightx2v/config') {
      try {
        const body = await readBody(request);
        lightX2VConfig = normalizePersistedLightX2VConfig(body?.config);
        await saveBridgeSettings();
        send(response, 200, { success: true, config: lightX2VConfig }, request);
      } catch (error) {
        send(
          response,
          400,
          {
            error: { message: error instanceof Error ? error.message : 'LightX2V 配置保存失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/cli/status') {
      try {
        const tool = String(url.searchParams.get('tool') || '')
          .trim()
          .toLowerCase();
        const force = ['1', 'true', 'yes'].includes(
          String(url.searchParams.get('force') || '').toLowerCase(),
        );
        send(response, 200, await singleCliHealth(tool, force), request);
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : 'CLI 状态检测失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      const canvasVersion = await readCanvasHostVersion();
      if (
        request.qiansiBridgeScope === 'collaboration' ||
        url.searchParams.get('session') === '1'
      ) {
        send(
          response,
          200,
          {
            ok: true,
            bridge: 'qiansi-canvas-cli-bridge',
            buildId: BRIDGE_BUILD_ID,
            version: canvasVersion,
            canvasVersion,
            bridgeVersion: APP_VERSION,
            scope: request.qiansiBridgeScope,
            collaborationEnabled: LAN_MODE,
            capabilities: { projects: true, managedMedia: true },
            tools: {},
            sessions: {},
          },
          request,
        );
        return;
      }
      const [arkcli, codex, codebuddy, gemini, jimeng, bailian] = await Promise.all([
        volcengineStatus(),
        codexStatus(),
        codebuddyStatus(),
        geminiStatus(),
        jimengStatus(),
        bailianStatus(),
      ]);
      send(
        response,
        200,
        {
          ok: true,
          bridge: 'qiansi-canvas-cli-bridge',
          buildId: BRIDGE_BUILD_ID,
          version: canvasVersion,
          canvasVersion,
          bridgeVersion: APP_VERSION,
          scope: 'host',
          collaborationEnabled: LAN_MODE,
          tools: {
            arkcli: arkcli.installed,
            codex: codex.installed,
            codebuddy: codebuddy.installed,
            gemini: gemini.installed,
            jimeng: Boolean(jimeng?.installed),
            bailian: bailian.installed,
          },
          capabilities: {
            arkcli: {
              arkServices: arkcli.ready,
              textGeneration: false,
              imageGeneration: false,
              imageEditing: false,
              videoGeneration: false,
            },
            codex: {
              textGeneration: codex.ready,
              imageGeneration: Boolean(codex.ready && codex.imageGeneration),
              imageEditing: Boolean(codex.ready && codex.imageGeneration),
            },
            codebuddy: {
              textGeneration: codebuddy.ready,
              imageGeneration: Boolean(codebuddy.ready && codebuddy.imageGeneration),
              imageEditing: Boolean(codebuddy.ready && codebuddy.imageEditing),
              videoGeneration: false,
            },
            gemini: { textGeneration: gemini.ready, imageGeneration: false },
            jimeng: {
              accountTools: Boolean(jimeng?.ready),
              imageGeneration: Boolean(jimeng?.ready),
              imageEditing: Boolean(jimeng?.ready),
              videoGeneration: Boolean(jimeng?.ready),
            },
            bailian: {
              imageGeneration: Boolean(bailian.ready),
              imageEditing: Boolean(bailian.ready),
              videoGeneration: Boolean(bailian.ready),
            },
            assetLibrary: { localFiles: true, maxFileBytes: MAX_ASSET_BYTES },
            projectLibrary: { localFiles: true, snapshots: true, root: PROJECT_LIBRARY_ROOT },
            timeline: { edl: true, manifest: true, localMp4: existsSync(LOCAL_FFMPEG_PATH) },
          },
          sessions: {
            arkcli,
            codex,
            codebuddy,
            gemini,
            bailian,
            ...(jimeng ? { jimeng } : {}),
          },
        },
        request,
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/provider/models') {
      try {
        send(response, 200, await bridgeProviderModels(await readBody(request)), request);
      } catch (error) {
        send(
          response,
          400,
          {
            error: {
              message: error instanceof Error ? error.message : '远程模型目录检测失败。',
            },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/models') {
      const [codex, codebuddy, gemini, jimeng, bailian] = await Promise.all([
        codexStatus(),
        codebuddyStatus(),
        geminiStatus(),
        jimengStatus(),
        bailianStatus(),
      ]);
      const data = [];
      if (codex.ready) {
        for (const model of codex.models || []) {
          data.push({
            id: `codex:${model.slug}`,
            object: 'model',
            kind: 'chat',
            owned_by: 'local-codex-cli',
            displayName: model.displayName,
            defaultReasoningEffort: model.defaultReasoningEffort,
            reasoningEfforts: model.reasoningEfforts,
          });
        }
        data.push({
          id: 'codex:default',
          object: 'model',
          kind: 'chat',
          owned_by: 'local-codex-cli',
          displayName: 'Codex 自动选择',
          defaultReasoningEffort: 'medium',
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        });
        if (codex.ready && codex.imageGeneration)
          data.push({
            id: 'codex:$imagegen',
            object: 'model',
            kind: 'image',
            owned_by: 'local-codex-cli-image',
            displayName: 'GPT Image',
          });
      }
      if (codebuddy.ready) {
        for (const model of codebuddy.models || []) {
          data.push({
            id: `workbuddy:${model.slug}`,
            object: 'model',
            kind: 'chat',
            owned_by: 'local-workbuddy-cli',
            displayName: model.displayName,
          });
        }
        if (codebuddy.imageGeneration)
          data.push({
            id: 'workbuddy:$imagegen',
            object: 'model',
            kind: 'image',
            owned_by: 'local-workbuddy-cli-image',
            displayName: 'CodeBuddy 图片生成',
          });
      }
      if (gemini.ready)
        data.push({
          id: 'antigravity:auto',
          object: 'model',
          kind: 'chat',
          owned_by: 'local-antigravity-cli',
          displayName: 'Antigravity 自动选择',
        });
      if (jimeng.ready) {
        for (const model of jimeng.models?.image || []) {
          data.push({
            id: `jimeng:${model}`,
            object: 'model',
            kind: 'image',
            owned_by: 'local-jimeng-cli',
            displayName: JIMENG_MODEL_DISPLAY_NAMES[model] || model,
          });
        }
        for (const model of jimeng.models?.video || []) {
          data.push({
            id: `jimeng:${model}`,
            object: 'model',
            kind: 'video',
            owned_by: 'local-jimeng-cli',
            displayName: JIMENG_MODEL_DISPLAY_NAMES[model] || model,
          });
        }
      }
      if (bailian.ready) {
        for (const model of BAILIAN_IMAGE_MODELS) {
          data.push({
            id: model,
            object: 'model',
            kind: 'image',
            owned_by: 'local-bailian-cli',
          });
        }
        for (const model of BAILIAN_VIDEO_MODELS) {
          data.push({
            id: model,
            object: 'model',
            kind: 'video',
            owned_by: 'local-bailian-cli',
          });
        }
      }
      send(response, 200, { object: 'list', data }, request);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      try {
        const body = await readBody(request);
        const rawModel = String(body.model || '');
        const match = /^(codex|workbuddy|antigravity|gemini):(.+)$/.exec(rawModel);
        if (!match)
          throw new Error('CLI 模型必须写成 codex:模型名、workbuddy:模型名或 antigravity:模型名。');
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const cliInput = collectCliChatInput(messages);
        const output = await runCli(
          match[1] === 'workbuddy' ? 'codebuddy' : match[1] === 'antigravity' ? 'gemini' : match[1],
          match[2],
          cliInput.prompt,
          body.reasoning_effort,
          cliInput.imageUrls,
        );
        send(
          response,
          200,
          {
            id: `qiansi-canvas-${Date.now()}`,
            object: 'chat.completion',
            choices: [
              { index: 0, message: { role: 'assistant', content: output }, finish_reason: 'stop' },
            ],
          },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          { error: { message: error instanceof Error ? error.message : 'CLI 调用失败。' } },
          request,
        );
      }
      return;
    }
    if (
      request.method === 'POST' &&
      (url.pathname === '/v1/images/generations' || url.pathname === '/v1/images/edits')
    ) {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const prompt = String(body.prompt || '').trim();
        if (!prompt) throw new Error('图片提示词不能为空。');
        const requestedModel = String(body.model || '').trim();
        const cliProvider = requestedModel.startsWith('workbuddy:') ? 'codebuddy' : 'codex';
        const item = await runCodexImage(
          {
            ...body,
            prompt,
            project: PROJECT_ID_RE.test(String(body.project || ''))
              ? String(body.project)
              : 'clocktower',
            title: cleanAssetText(
              body.title,
              cliProvider === 'codebuddy'
                ? url.pathname.endsWith('/edits')
                  ? 'CodeBuddy 图片修改'
                  : 'CodeBuddy 图片生成'
                : url.pathname.endsWith('/edits')
                  ? 'Codex CLI 图片修改'
                  : 'Codex CLI 图片生成',
              120,
            ),
            cliLabel: cliProvider === 'codebuddy' ? 'CodeBuddy CLI' : 'Codex CLI',
          },
          cliProvider,
        );
        send(
          response,
          200,
          {
            created: Math.floor(Date.now() / 1000),
            data: [{ url: publicBridgeUrl(request, item.url), revised_prompt: prompt }],
            item,
            provider: cliProvider === 'codebuddy' ? 'codebuddy-cli' : 'codex-cli',
          },
          request,
        );
      } catch (error) {
        send(
          response,
          400,
          {
            error: { message: error instanceof Error ? error.message : 'Codex CLI 图片处理失败。' },
          },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/generation-requests/')) {
      try {
        const requestId = decodeURIComponent(
          url.pathname.slice('/api/generation-requests/'.length),
        );
        const entry = await generationRequestRegistry.get(requestId);
        if (!entry) {
          send(response, 404, { error: { message: '未找到可恢复的生成请求。' } }, request);
        } else if (entry.status === 'complete' && entry.outputMissing === true) {
          send(
            response,
            410,
            {
              request: entry,
              error: {
                message:
                  '生成已完成，但本机输出文件已被删除；为避免重复计费，同一 requestId 不会再次提交。',
              },
            },
            request,
          );
        } else {
          send(response, 200, { request: entry }, request);
        }
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '生成请求查询失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/generate-image') {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const result = await generationRequestRegistry.run({
          id: body.requestId,
          kind: 'image',
          body,
          execute: async (execution) =>
            requireRecoverableGenerationResult(await bridgeGenerateImage(body, execution), 'image'),
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '图片生成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/generate-video') {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const result = await generationRequestRegistry.run({
          id: body.requestId,
          kind: 'video',
          body,
          execute: async (execution) => {
            const completed = await requireRecoverableGenerationResult(
              await bridgeGenerateVideo(body, execution),
              'video',
            );
            return {
              ...completed,
              audioTrackStatus: await inspectGeneratedVideoAudioTrack(completed),
            };
          },
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '视频生成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/generate-audio') {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const result = await generationRequestRegistry.run({
          id: body.requestId,
          kind: 'audio',
          body,
          execute: async (execution) =>
            requireRecoverableGenerationResult(await bridgeGenerateAudio(body, execution), 'audio'),
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '音频生成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/generate-3d') {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const result = await generationRequestRegistry.run({
          id: body.requestId,
          kind: '3d',
          body,
          execute: async (execution) =>
            requireRecoverableGenerationResult(await bridgeGenerate3d(body, execution), '3d'),
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '3D 生成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      try {
        const body = await readBody(request, MAX_ASSET_BODY);
        const result = await generationRequestRegistry.run({
          id: body.requestId,
          kind: 'text',
          body,
          execute: async () => requireRecoverableGenerationResult(await bridgeChat(body), 'text'),
        });
        send(response, 200, result, request);
      } catch (error) {
        send(
          response,
          generationRequestHttpStatus(error),
          { error: { message: error instanceof Error ? error.message : '对话生成失败。' } },
          request,
        );
      }
      return;
    }
    if (request.method === 'GET' && /^\/output\/.+/.test(url.pathname)) {
      try {
        const fileName = url.pathname.split('/').pop() || '';
        if (!/^[A-Za-z0-9_.-]+$/.test(fileName)) throw new Error('非法文件名。');
        const filePath = join(GEN_OUTPUT_ROOT, fileName);
        const extension = extname(fileName).toLowerCase();
        const mime =
          {
            '.webp': 'image/webp',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.avif': 'image/avif',
            '.mp4': 'video/mp4',
            '.m4v': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska',
            '.glb': 'model/gltf-binary',
            '.gltf': 'model/gltf+json',
            '.obj': 'model/obj',
            '.ply': 'model/ply',
            '.stl': 'model/stl',
            '.fbx': 'application/octet-stream',
            '.usdz': 'model/vnd.usdz+zip',
          }[extension] ||
          generatedOutputAudioMime(extension) ||
          'application/octet-stream';
        await streamMediaOrPreview(request, response, url, filePath, mime);
      } catch {
        send(response, 404, { error: { message: '生成文件不存在。' } }, request);
      }
      return;
    }
    send(response, 404, { error: { message: 'Not found' } }, request);
  } finally {
    // A lost client connection must not free a generation slot while its paid
    // upstream call is still running. Release when route work actually ends.
    requestLease.release();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Qiansi-Canvas CLI Bridge] 本机: http://127.0.0.1:${PORT}`);
  const pairingUrls = currentLanPairingUrls();
  if (HOST === '0.0.0.0' || HOST === '::') {
    for (const pairingUrl of pairingUrls) {
      console.log(
        `[Qiansi-Canvas CLI Bridge] ${TRUSTED_LAN_MODE ? '局域网直连' : '局域网配对'}: ${pairingUrl}`,
      );
    }
    console.log(
      `${TRUSTED_LAN_MODE ? '可信局域网模式无需配对；' : ''}局域网仅开放画布协作与受管媒体；AI、CLI、插件、更新及维护接口仍仅限本机。`,
    );
  } else if (!isLoopbackHost(HOST)) {
    console.log(
      `[Qiansi-Canvas CLI Bridge] ${TRUSTED_LAN_MODE ? '局域网直连' : '局域网配对'}: ${pairingUrls[0]}`,
    );
  }
  void persistLanPairingAddresses(pairingUrls)
    .then(() => {
      console.log(`[Qiansi-Canvas CLI Bridge] 局域网地址文件: ${LAN_PAIRING_FILE}`);
    })
    .catch((error) => {
      console.error(
        `[Qiansi-Canvas CLI Bridge] 无法写入配对地址文件：${error instanceof Error ? error.message : String(error)}`,
      );
    });
  console.log(
    '安全白名单：本机素材库与风格库、火山方舟 arkcli 固定版本/身份检测、Codex CLI 文本/图片、WorkBuddy 与 Gemini / Antigravity CLI 文本、Dreamina / 百炼图片视频、LightX2V 固定适配器',
  );
  void startEnabledManagedAudioPlugins().catch((error) => {
    console.error(
      `[插件] 宿主管理音频服务同步失败：${error instanceof Error ? error.message : String(error)}`,
    );
  });
});

let bridgeShutdownStarted = false;
async function shutdownBridge() {
  if (bridgeShutdownStarted) return;
  bridgeShutdownStarted = true;
  server.close();
  for (const id of timelineRenderProcesses.keys()) {
    cancelTimelineRender(id, '本机桥正在关闭，时间线合成已取消。');
  }
  await managedAudioInstaller?.stopAll().catch(() => undefined);
  await managedMotionInstaller?.stopAll().catch(() => undefined);
  await managedAudioWorkers.stopAll().catch(() => undefined);
  await managedMotionWorkers.stopAll().catch(() => undefined);
  await managedSapiensNormalWorker.stopAll().catch(() => undefined);
  process.exit(0);
}

process.once('SIGINT', () => void shutdownBridge());
process.once('SIGTERM', () => void shutdownBridge());
