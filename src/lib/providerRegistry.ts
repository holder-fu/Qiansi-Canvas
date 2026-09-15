// Provider configuration is persisted without plaintext API keys. The encrypted
// vault owns secrets; this registry owns provider metadata and model selection.

import {
  JIMENG_IMAGE_MODELS,
  JIMENG_MODEL_DISPLAY_NAMES,
  JIMENG_VIDEO_MODELS,
  jimengVideoModelsForVipAccess,
} from './jimengCliContract.mjs';
import {
  BAILIAN_IMAGE_MODELS,
  BAILIAN_VIDEO_MODELS,
  VISUAL_CLI_MODEL_DISPLAY_NAMES,
} from './visualCliContract.mjs';
import { getCodeBuddyInputModalities } from './codebuddyCliContract.mjs';
import {
  BRIDGE_BASE_URL,
  BRIDGE_V1_BASE_URL,
  isCurrentBridgeUrl,
  resolveBridgeUrl,
} from './bridgeUrl';
import { fetchComfyUiStatus } from './comfyWorkflow';
export type ProviderCategory = 'text' | 'image' | 'cli';

export type ProviderProtocol =
  | 'openai'
  | 'xai'
  | 'deepseek'
  | 'modelscope'
  | 'volcengine'
  | 'volcengine-cli'
  | 'jimeng'
  | 'codex'
  | 'codebuddy'
  | 'gemini-cli'
  | 'bailian'
  | 'lightx2v'
  | 'comfyui'
  | 'cli';

export type ProviderModelKind = 'chat' | 'image' | 'video' | 'audio' | '3d';

/** `audio` is optional only so saved pre-audio configurations remain source-compatible. */
export type ProviderModels = {
  chat: string[];
  image: string[];
  video: string[];
  audio?: string[];
  /** Optional so configurations saved before ComfyUI 3D workflows remain compatible. */
  '3d'?: string[];
};

export type ProviderReasoningEffort =
  'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

export type ProviderInputModality = 'text' | 'image';

export type ProviderVideoOperation =
  | 'remake'
  | 'enhance'
  | 'extend'
  | 'remove-subtitles'
  | 'visual-edit'
  | 'masked-repair'
  | 'character-replace';

export type ProviderModelCapability = {
  displayName?: string;
  defaultReasoningEffort?: Exclude<ProviderReasoningEffort, 'auto'>;
  reasoningEfforts?: Array<Exclude<ProviderReasoningEffort, 'auto'>>;
  /** Declared model inputs. Missing means the provider did not advertise this capability. */
  inputModalities?: ProviderInputModality[];
  /** True only for explicit source-video reference support; false or missing requires fallback. */
  videoReferenceInput?: boolean;
  /** Explicitly supported video modes. Missing means unverified, not unrestricted. */
  videoModes?: Array<'文生视频' | '全能参考' | '图生视频' | '首尾帧' | '图片参考' | '视频换人物'>;
  /** Explicit limits. Missing means unverified, not unlimited. */
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  maxOutputCount?: 1 | 2 | 4;
  /** Source-video AI operations implemented by this exact adapter/model. */
  videoOperations?: ProviderVideoOperation[];
  /** Live ComfyUI preset validation; absent for non-Comfy providers and older bridges. */
  comfyCompatibility?: 'compatible' | 'incompatible' | 'unchecked';
  comfyCompatibilityMessage?: string;
  comfySourceVersion?: string;
  comfyBackendVersion?: string;
};

type ComfyWorkflowCapabilitySource = {
  kind: 'image' | 'video' | 'audio' | '3d';
  name: string;
  modes: readonly string[];
  supportsVideoReference?: boolean;
  supportsAudioReference?: boolean;
  supportsImageReference?: boolean;
  compatibility?: {
    status: 'compatible' | 'incompatible' | 'unchecked';
    message: string;
  };
  importFingerprint?: { sourceVersion: string };
  lastValidation?: { backendVersion: string };
};

/** Derive only capabilities that the imported Comfy workflow metadata proves. */
export function comfyWorkflowModelCapability(
  workflow: ComfyWorkflowCapabilitySource,
): ProviderModelCapability {
  const videoModes = workflow.modes.filter(
    (mode): mode is NonNullable<ProviderModelCapability['videoModes']>[number] =>
      mode === '文生视频' ||
      mode === '全能参考' ||
      mode === '图生视频' ||
      mode === '首尾帧' ||
      mode === '图片参考' ||
      mode === '视频换人物',
  );
  const supportsImageReference =
    workflow.supportsImageReference === true ||
    (workflow.kind === 'video' &&
      videoModes.some((mode) =>
        ['全能参考', '图生视频', '首尾帧', '图片参考', '视频换人物'].includes(mode),
      ));
  const maxReferenceImages = supportsImageReference ? (videoModes.includes('首尾帧') ? 2 : 1) : 0;
  const maxReferenceAudios =
    workflow.kind === 'audio' && workflow.supportsAudioReference === true ? 1 : 0;
  return {
    displayName: workflow.name,
    inputModalities: supportsImageReference ? ['text', 'image'] : ['text'],
    videoReferenceInput: workflow.supportsVideoReference === true,
    videoModes,
    maxReferenceImages,
    maxReferenceVideos: workflow.supportsVideoReference === true ? 1 : 0,
    maxReferenceAudios,
    maxOutputCount: 1,
    videoOperations: [],
    ...(workflow.compatibility
      ? {
          comfyCompatibility: workflow.compatibility.status,
          comfyCompatibilityMessage: workflow.compatibility.message,
        }
      : {}),
    ...(workflow.importFingerprint?.sourceVersion
      ? { comfySourceVersion: workflow.importFingerprint.sourceVersion }
      : {}),
    ...(workflow.lastValidation?.backendVersion
      ? { comfyBackendVersion: workflow.lastValidation.backendVersion }
      : {}),
  };
}

export type ImageAuthType = 'bearer' | 'api-key' | 'x-key';

const PROVIDER_PROTOCOLS = new Set<ProviderProtocol>([
  'openai',
  'xai',
  'deepseek',
  'modelscope',
  'volcengine',
  'volcengine-cli',
  'jimeng',
  'codex',
  'codebuddy',
  'gemini-cli',
  'bailian',
  'lightx2v',
  'comfyui',
  'cli',
]);

const RETIRED_PROVIDER_IDS = new Set(['runninghub', 'img-dalle', 'img-generic', 'ark-cli']);
const RETIRED_PROVIDER_PROTOCOLS = new Set(['runninghub', 'ark-cli']);

const IMAGE_AUTH_TYPES = new Set<ImageAuthType>(['bearer', 'api-key', 'x-key']);

export type ProviderConnection = {
  id: string;
  name: string;
  mark: string;
  protocol: ProviderProtocol;
  category: ProviderCategory;
  baseUrl: string;
  apiKey: string;
  models: ProviderModels;
  modelCapabilities?: Record<string, ProviderModelCapability>;
  modelReasoningEfforts?: Record<string, ProviderReasoningEffort>;
  /** Current browser-runtime verification. Never persisted for any provider. */
  verifiedAt?: number;
  /**
   * Last successful connection for the unchanged configuration. For remote
   * APIs and CLI tools this restores model availability after a page reload.
   * CLI execution is still checked by the local bridge before each task.
   */
  lastVerifiedAt?: number;
  /**
   * Local structural validation for fixed-catalog APIs that have no free
   * model-list probe. This never claims that credentials were accepted.
   */
  configValidatedAt?: number;
  /** Last non-secret CLI probe result, restored immediately while a fresh probe runs. */
  cliStatus?: ProviderCliStatusSnapshot;
  enabled: boolean;
  custom?: boolean;
  // Image-provider metadata (ported from image-models.ts)
  endpoint?: string;
  authType?: ImageAuthType;
  region?: '海外' | '国内' | '通用';
  accent?: string;
  status?: string;
  canGenerate?: boolean;
  /** Provider/model families visible for configuration but blocked from runtime until adapted. */
  disabledModelKinds?: ProviderModelKind[];
  /** Fixed means the official API does not expose a zero-cost model-list endpoint. */
  modelDiscovery?: 'remote' | 'fixed';
  bestFor?: string[];
  summary?: string;
  note?: string;
  strength?: string;
  access?: string;
  docsUrl?: string;
  /** Non-secret local runtime paths for advanced CLI adapters. */
  cliConfig?: ProviderCliConfig;
};

export const COMFYUI_LOCAL_PROVIDER_ID = 'comfyui-local';
export const COMFYUI_REMOTE_PROVIDER_ID = 'comfyui-remote';
export const COMFYUI_CLOUD_PROVIDER_ID = 'comfyui-cloud';

const REMOTE_COMFYUI_NAME_RE = /^ComfyUI\s*_s([1-9]\d*)$/i;
const REMOTE_COMFYUI_ID_RE = /^comfyui-remote-s([1-9]\d*)(?:-|$)/;

export function isRemoteComfyUiProvider(
  provider: Pick<ProviderConnection, 'id' | 'protocol'>,
): boolean {
  return provider.protocol === 'comfyui' && provider.id !== COMFYUI_LOCAL_PROVIDER_ID;
}

export function isCloudComfyUiProvider(
  provider: Pick<ProviderConnection, 'id' | 'protocol'>,
): boolean {
  return provider.protocol === 'comfyui' && provider.id === COMFYUI_CLOUD_PROVIDER_ID;
}

export function createRemoteComfyUiConnection(
  connections: readonly Pick<ProviderConnection, 'id' | 'name' | 'protocol'>[],
): ProviderConnection {
  let greatestSequence = 0;
  for (const provider of connections) {
    if (provider.protocol !== 'comfyui') continue;
    const nameSequence = Number(REMOTE_COMFYUI_NAME_RE.exec(provider.name.trim())?.[1] ?? 0);
    const idSequence = Number(REMOTE_COMFYUI_ID_RE.exec(provider.id)?.[1] ?? 0);
    greatestSequence = Math.max(greatestSequence, nameSequence, idSequence);
  }
  const sequence = greatestSequence + 1;
  const randomSuffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: `comfyui-remote-s${sequence}-${randomSuffix}`.slice(0, 80),
    name: `ComfyUI _s${sequence}`,
    mark: 'CR',
    protocol: 'comfyui',
    category: 'cli',
    region: '通用',
    baseUrl: '',
    apiKey: '',
    authType: 'bearer',
    enabled: true,
    custom: true,
    canGenerate: true,
    status: 'GPU 服务器工作流',
    summary: '通过画布桥安全连接一台独立的远程 ComfyUI GPU 服务器。',
    note: '远程地址必须使用 HTTPS；API Key 只加密保存在本机，并由画布桥随请求转发。',
    models: { chat: [], image: [], video: [], audio: [], '3d': [] },
  };
}

export type ProviderCliConfig = {
  executablePath?: string;
  workingDirectory?: string;
  imageModelPath?: string;
  imageModelClass?: string;
  imageTask?: string;
  imageConfigPath?: string;
  videoModelPath?: string;
  videoModelClass?: string;
  videoTask?: string;
  videoConfigPath?: string;
};

export type ProviderCliStatusSnapshot = {
  installed: boolean;
  runnable?: boolean;
  running?: boolean;
  cliKind?: string;
  authenticated?: boolean;
  ready?: boolean;
  state?: 'ready' | 'installed' | 'unauthenticated' | 'unavailable' | 'error';
  reasonCode?: string;
  imageGeneration?: boolean;
  imageEditing?: boolean;
  videoGeneration?: boolean;
  hasVipAccess?: boolean;
  version: string;
  commandPath: string;
  message: string;
  checkedAt: number;
};

export const CLI_RUNTIME_VERIFICATION_TTL_MS = 90_000;
type RuntimeProviderObservation = {
  verifiedAt?: number;
  rejectedAt?: number;
  protocol: ProviderProtocol;
  baseUrl: string;
  cliStatus?: ProviderCliStatusSnapshot;
  models?: ProviderModels;
  modelCapabilities?: Record<string, ProviderModelCapability>;
};
const runtimeProviderVerifications = new Map<string, RuntimeProviderObservation>();
const runtimeProviderRevisions = new Map<string, number>();

export type ProviderSetupCommand = {
  label: string;
  value: string;
};

export type ProviderSetupGuide = {
  badge: string;
  summary: string;
  requirements: string[];
  steps: string[];
  commands: ProviderSetupCommand[];
  rootInstaller?: string;
  docsUrl?: string;
  warning?: string;
};

export const PROVIDER_STORAGE_KEY = 'kitty-canvas-api-providers-v1';
export const PROVIDER_CONNECTIONS_CHANGED_EVENT = 'kitty-canvas-provider-connections-changed';
const LEGACY_PROVIDER_STORAGE_KEY = 'muliu-api-providers-v1';
const LEGACY_LOOPBACK_BRIDGE_V1_BASE_URL = 'http://127.0.0.1:2895/v1';

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  text: '文本',
  image: '图片',
  cli: 'CLI',
};

const JIMENG_MODEL_CAPABILITIES: Record<string, ProviderModelCapability> = Object.fromEntries([
  ...JIMENG_IMAGE_MODELS.map((model) => [
    model,
    {
      displayName: JIMENG_MODEL_DISPLAY_NAMES[model] ?? model,
      inputModalities: model === '3.0' || model === '3.1' ? ['text'] : ['text', 'image'],
      maxReferenceImages: model === '3.0' || model === '3.1' ? 0 : 10,
      maxReferenceVideos: 0,
      maxReferenceAudios: 0,
      maxOutputCount: 4,
    },
  ]),
  ...JIMENG_VIDEO_MODELS.map((model) => [
    model,
    {
      displayName: JIMENG_MODEL_DISPLAY_NAMES[model] ?? model,
      videoReferenceInput: false,
      inputModalities: ['text', 'image'],
      videoModes: ['文生视频', '全能参考', '图生视频', '首尾帧', '图片参考'],
      maxReferenceImages: model === 'seedance2.5' ? 30 : 9,
      maxReferenceVideos: 0,
      maxReferenceAudios: model === 'seedance2.5' ? 10 : 3,
      maxOutputCount: 1,
      videoOperations: [],
    },
  ]),
]);

function visualCliModelCapability(
  model: string,
  capability: Omit<ProviderModelCapability, 'displayName'> = {},
): ProviderModelCapability {
  return {
    displayName: VISUAL_CLI_MODEL_DISPLAY_NAMES[model] ?? model,
    ...capability,
  };
}

const PROVIDER_DEFAULTS: Array<Omit<ProviderConnection, 'apiKey'>> = [
  // ─────────────────────────── 文本 / LLM ───────────────────────────
  {
    id: 'api',
    name: 'OpenAI Compatible',
    mark: 'API',
    protocol: 'openai',
    category: 'text',
    region: '海外',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    models: {
      chat: ['gpt-4.1-mini', 'gpt-4o-mini'],
      image: ['gpt-image-2', 'gpt-image-2-2026-04-21'],
      video: [],
    },
    modelCapabilities: {
      'gpt-image-2': {
        inputModalities: ['text', 'image'],
        maxReferenceImages: 5,
        maxReferenceVideos: 0,
        maxReferenceAudios: 0,
        maxOutputCount: 4,
      },
      'gpt-image-2-2026-04-21': {
        inputModalities: ['text', 'image'],
        maxReferenceImages: 5,
        maxReferenceVideos: 0,
        maxReferenceAudios: 0,
        maxOutputCount: 4,
      },
    },
  },
  {
    id: 'xai',
    name: 'xAI · Grok',
    mark: 'X',
    protocol: 'xai',
    category: 'text',
    region: '海外',
    baseUrl: 'https://api.x.ai/v1',
    enabled: true,
    disabledModelKinds: ['video'],
    models: {
      chat: ['grok-4.5', 'grok-4.3'],
      image: ['grok-imagine-image', 'grok-imagine-image-quality'],
      video: ['grok-imagine-video'],
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    mark: 'DS',
    protocol: 'deepseek',
    category: 'text',
    region: '国内',
    baseUrl: 'https://api.deepseek.com',
    enabled: true,
    models: {
      chat: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      image: [],
      video: [],
    },
  },
  {
    id: 'modelscope',
    name: 'ModelScope',
    mark: 'MS',
    protocol: 'modelscope',
    category: 'text',
    region: '国内',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    enabled: true,
    disabledModelKinds: ['image'],
    models: {
      chat: [
        'Qwen/Qwen3-235B-A22B',
        'Qwen/Qwen3-VL-235B-A22B-Instruct',
        'MiniMax/MiniMax-M2.7:MiniMax',
      ],
      image: [
        'Tongyi-MAI/Z-Image-Turbo',
        'Qwen/Qwen-Image-2512',
        'Qwen/Qwen-Image-Edit-2511',
        'black-forest-labs/FLUX.2-klein-9B',
      ],
      video: [],
    },
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    mark: '火',
    protocol: 'volcengine',
    category: 'text',
    region: '国内',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    enabled: true,
    disabledModelKinds: ['video'],
    models: {
      chat: [],
      image: ['doubao-seedream-4-0-250828'],
      video: [
        'doubao-seedance-2-0-260128',
        'doubao-seedance-2-0-fast-260128',
        'doubao-seedance-1-5-pro-251215',
      ],
    },
  },
  // ─────────────────────────── CLI / 本地桥 ───────────────────────────
  {
    id: 'comfyui-local',
    name: 'ComfyUI 本地',
    mark: 'CU',
    protocol: 'comfyui',
    category: 'cli',
    region: '通用',
    baseUrl: 'http://127.0.0.1:8188',
    enabled: true,
    canGenerate: true,
    status: '本地工作流',
    summary: '通过画布本地桥连接 ComfyUI，并将 API Format 工作流保存为视频节点模型。',
    note: '浏览器不会直接访问 8188 端口；连接检测、工作流保存与生成任务统一由画布桥转发。',
    models: { chat: [], image: [], video: [], audio: [], '3d': [] },
  },
  {
    id: 'comfyui-remote',
    name: 'ComfyUI 远程',
    mark: 'CR',
    protocol: 'comfyui',
    category: 'cli',
    region: '通用',
    baseUrl: '',
    authType: 'bearer',
    enabled: true,
    canGenerate: true,
    status: 'GPU 服务器工作流',
    summary: '通过画布桥安全连接提供 ComfyUI API 的远程 GPU 服务器。',
    note: '远程地址必须使用 HTTPS；API Key 只加密保存在本机，并由画布桥随请求转发。',
    models: { chat: [], image: [], video: [], audio: [], '3d': [] },
  },
  {
    id: COMFYUI_CLOUD_PROVIDER_ID,
    name: 'Comfy Cloud',
    mark: 'CC',
    protocol: 'comfyui',
    category: 'cli',
    region: '海外',
    baseUrl: 'https://cloud.comfy.org',
    authType: 'x-key',
    enabled: true,
    canGenerate: true,
    status: 'Comfy Cloud API',
    summary: '通过独立 Cloud API 连接 Comfy Cloud，不改变本地或远程自建 ComfyUI。',
    note: '使用 X-API-Key 和 /api 路径；输出 302 签名下载不会携带 API Key。',
    docsUrl: 'https://docs.comfy.org/development/cloud/overview',
    models: { chat: [], image: [], video: [], audio: [], '3d': [] },
  },
  {
    id: 'jimeng',
    name: '即梦 CLI',
    mark: '梦',
    protocol: 'jimeng',
    category: 'cli',
    region: '国内',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    canGenerate: true,
    models: {
      chat: [],
      image: [...JIMENG_IMAGE_MODELS],
      video: [...JIMENG_VIDEO_MODELS],
    },
    modelCapabilities: JIMENG_MODEL_CAPABILITIES,
  },
  {
    id: 'codex',
    name: 'GPT CLI',
    mark: 'CX',
    protocol: 'codex',
    category: 'cli',
    region: '海外',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    models: {
      chat: ['codex:default'],
      image: [],
      video: [],
    },
    modelCapabilities: {
      'codex:default': {
        displayName: 'Codex 推荐模型',
        defaultReasoningEffort: 'medium',
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        inputModalities: ['text', 'image'],
      },
    },
    modelReasoningEfforts: {
      'codex:default': 'auto',
    },
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy CLI',
    mark: 'WB',
    protocol: 'codebuddy',
    category: 'cli',
    region: '国内',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    models: { chat: ['workbuddy:auto'], image: [], video: [] },
    modelCapabilities: {
      'workbuddy:auto': {
        displayName: 'WorkBuddy 自动选择',
        inputModalities: ['text'],
      },
    },
  },
  {
    id: 'gemini',
    name: 'Antigravity CLI',
    mark: 'AG',
    protocol: 'gemini-cli',
    category: 'cli',
    region: '海外',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    models: { chat: ['antigravity:auto'], image: [], video: [] },
    modelCapabilities: {
      'antigravity:auto': { displayName: 'Antigravity 自动选择', inputModalities: ['text'] },
    },
  },
  {
    id: 'bailian',
    name: '百炼 CLI',
    mark: '百',
    protocol: 'bailian',
    category: 'cli',
    region: '国内',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    canGenerate: true,
    models: {
      chat: [],
      image: [...BAILIAN_IMAGE_MODELS],
      video: [...BAILIAN_VIDEO_MODELS],
    },
    modelCapabilities: Object.fromEntries([
      ...BAILIAN_IMAGE_MODELS.map((model) => [
        model,
        visualCliModelCapability(model, {
          inputModalities: ['text', 'image'],
          maxReferenceImages: 5,
          maxReferenceVideos: 0,
          maxReferenceAudios: 0,
          maxOutputCount: 4,
        }),
      ]),
      ...BAILIAN_VIDEO_MODELS.map((model) => [
        model,
        visualCliModelCapability(model, {
          inputModalities: ['text', 'image'],
          videoReferenceInput: false,
          videoModes: ['文生视频', '图生视频'],
          maxReferenceImages: 1,
          maxReferenceVideos: 0,
          maxReferenceAudios: 0,
          maxOutputCount: 1,
          videoOperations: [],
        }),
      ]),
    ]),
  },
  {
    id: 'volcengine-cli',
    name: '山火 CLI',
    mark: '火',
    protocol: 'volcengine-cli',
    category: 'cli',
    region: '国内',
    baseUrl: BRIDGE_V1_BASE_URL,
    enabled: true,
    status: 'Ark CLI 工具',
    disabledModelKinds: ['chat', 'image', 'video', 'audio'],
    models: { chat: [], image: [], video: [] },
    modelCapabilities: {},
  },
  // ─────────────────────────── 图片 / 图像生成 ───────────────────────────
  {
    id: 'img-midjourney',
    name: 'Midjourney',
    mark: 'MJ',
    protocol: 'openai',
    category: 'image',
    baseUrl: '',
    enabled: true,
    region: '海外',
    accent: '#765ee8',
    status: '手动工作流',
    canGenerate: false,
    endpoint: '',
    authType: 'bearer',
    summary: '视觉审美与艺术质感的行业标杆，尤其擅长有明确气质的成片级视觉。',
    strength: '光影、构图、色彩与细节密度',
    bestFor: ['概念设计', '高端插画', '电影剧照', '奇幻写实'],
    access: 'Discord 社区、官方 Web 平台',
    note: 'Midjourney 暂无面向普通开发者的官方公开生图 API。本模块用于选型说明与手动工作流占位，不会冒充第三方逆向接口。',
    docsUrl: 'https://docs.midjourney.com/',
    models: { chat: [], image: ['midjourney-v6.1'], video: [] },
  },
  {
    id: 'img-recraft',
    name: 'Recraft',
    mark: 'RC',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://external.api.recraft.ai',
    enabled: true,
    region: '海外',
    accent: '#eb6552',
    status: '官方 API',
    canGenerate: true,
    modelDiscovery: 'fixed',
    endpoint: '/v1/images/generations',
    authType: 'bearer',
    summary: '面向设计生产的图像模型，兼顾栅格图、可编辑矢量图与准确的文字布局。',
    strength: '矢量输出、品牌图形与长文本排版',
    bestFor: ['SVG 矢量', 'UI 元素', '品牌 Logo', '文字海报'],
    access: 'Recraft Studio、官方 API',
    note: '默认使用当前 Recraft V4.1；V4.1 Pro 与 Vector 也可直接选择，接口与 OpenAI Images 结构相近。',
    docsUrl: 'https://www.recraft.ai/docs/api-reference/endpoints',
    models: {
      chat: [],
      image: ['recraftv4_1', 'recraftv4_1_pro', 'recraftv4_1_vector'],
      video: [],
    },
  },
  {
    id: 'img-ideogram',
    name: 'Ideogram',
    mark: 'ID',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://api.ideogram.ai',
    enabled: true,
    region: '海外',
    accent: '#3a8fc4',
    status: '官方 API',
    canGenerate: true,
    modelDiscovery: 'fixed',
    endpoint: '/v1/ideogram-v4/generate',
    authType: 'api-key',
    summary: '以字体渲染与海报排版见长，适合让文字真正成为画面构成的一部分。',
    strength: '短文本准确度、字形设计与版面构成',
    bestFor: ['广告标语', 'T 恤印花', '贺卡', '标识设计'],
    access: 'Ideogram Web、官方 API',
    note: '当前预置官方 Ideogram 4.0 同步生成端点；画布数量由桥接层拆分为独立请求。',
    docsUrl: 'https://developer.ideogram.ai/api-reference/api-reference/generate-v4',
    models: { chat: [], image: ['ideogram-v4'], video: [] },
  },
  {
    id: 'img-flux',
    name: 'FLUX',
    mark: 'FL',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://api.bfl.ai',
    enabled: true,
    region: '海外',
    accent: '#272a2d',
    status: '官方 API',
    canGenerate: true,
    modelDiscovery: 'fixed',
    endpoint: '/v1/flux-pro-1.1',
    authType: 'x-key',
    summary: '面向商业摄影的高真实感模型，复杂主体、材质和皮肤细节都具有稳定表现。',
    strength: '照片级真实、细节解构与复杂场景',
    bestFor: ['商业人像', '产品摄影', '纪实质感', '多主体场景'],
    access: 'BFL 官方 API，也可经由 Fal.ai / Replicate',
    note: 'BFL 官方接口为异步任务；提交成功后会返回任务编号或轮询地址。',
    docsUrl: 'https://docs.bfl.ai/flux_models/flux_1_1_pro',
    models: { chat: [], image: ['flux-pro-1.1'], video: [] },
  },
  {
    id: 'img-imagen',
    name: 'Imagen',
    mark: 'IM',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com',
    enabled: true,
    region: '海外',
    accent: '#438a68',
    status: '官方 API',
    canGenerate: true,
    modelDiscovery: 'fixed',
    endpoint:
      '/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models/imagen-4.0-generate-001:predict',
    authType: 'bearer',
    summary: '自然语言理解与安全合规能力突出，擅长捕捉提示词中的细微限定关系。',
    strength: '语义遵循、自然光影与商业合规',
    bestFor: ['通用素材', '自然摄影', '多主体合成', '日常插画'],
    access: 'ImageFX、Gemini、Vertex AI',
    note: '已迁移到 Imagen 4。Vertex AI 使用 OAuth Access Token；请把端点中的 PROJECT_ID 和 LOCATION 替换为实际项目配置。',
    docsUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images',
    models: { chat: [], image: ['imagen-4.0-generate-001'], video: [] },
  },
  {
    id: 'img-grok',
    name: 'Grok Imagine',
    mark: 'X',
    protocol: 'xai',
    category: 'image',
    baseUrl: 'https://api.x.ai/v1',
    enabled: true,
    region: '海外',
    accent: '#111827',
    status: '官方 API',
    canGenerate: true,
    endpoint: '/images/generations',
    authType: 'bearer',
    summary: 'xAI 的原生图片生成与编辑模型，可与 Grok 对话和 Imagine 视频共用同一套平台密钥。',
    strength: '快速出图、提示词遵循与跨图片视频工作流',
    bestFor: ['动漫概念', '角色资产', '分镜草图', '图像编辑'],
    access: 'xAI Console、Grok Imagine API',
    note: '使用官方 /v1/images/generations 接口；图片条目与文本条目共用同一套 xAI API Key，但分别保存配置。',
    docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference/images',
    models: { chat: [], image: ['grok-imagine-image'], video: [] },
  },
  {
    id: 'img-gptimage',
    name: 'GPT Image',
    mark: 'G2',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://api.openai.com',
    enabled: true,
    region: '海外',
    accent: '#16a085',
    status: '官方 API',
    canGenerate: true,
    endpoint: '/v1/images/generations',
    authType: 'bearer',
    summary: 'OpenAI 当前旗舰图片生成与编辑模型，兼顾提示词遵循、生成速度和高保真图片输入。',
    strength: '复杂指令遵循、图片生成与编辑',
    bestFor: ['商业视觉', '角色资产', '分镜概念', '图片编辑'],
    access: 'OpenAI Images API',
    note: '使用官方 gpt-image-2；绑定参考图时自动切换 /v1/images/edits 并支持多张输入。需要整季锁定版本时可填写快照 gpt-image-2-2026-04-21。',
    docsUrl: 'https://developers.openai.com/api/docs/models/gpt-image-2',
    models: { chat: [], image: ['gpt-image-2'], video: [] },
  },
  {
    id: 'img-doubao',
    name: '豆包生图',
    mark: '豆',
    protocol: 'volcengine',
    category: 'image',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    enabled: true,
    region: '国内',
    accent: '#3f6fe5',
    status: '官方 API',
    canGenerate: true,
    endpoint: '/api/v3/images/generations',
    authType: 'bearer',
    summary: '中文语义、亚洲人像与局部编辑能力贴合国内电商和营销生产流程。',
    strength: '中文理解、亚洲人像与精准局部编辑',
    bestFor: ['电商模特', '商品展示', '背景替换', '二次元风格化'],
    access: '豆包、火山方舟 API',
    note: '默认使用火山方舟 OpenAI 兼容生图接口；模型 Endpoint ID 可按控制台实际名称修改。',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    models: { chat: [], image: ['doubao-seedream-4-0-250828'], video: [] },
  },
  {
    id: 'img-kling',
    name: '可灵生图',
    mark: '可',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://api.klingai.com',
    enabled: true,
    region: '国内',
    accent: '#9a5bdb',
    status: '等待专用适配',
    canGenerate: false,
    endpoint: '/v1/images/generations',
    authType: 'bearer',
    summary: '静态图自带明确镜头感和构图纵深，便于继续转入可灵视频生产。',
    strength: '镜头构图、动态趋势与图像转视频衔接',
    bestFor: ['影视概念', '动画分镜', '高动态人像', '图生视频首帧'],
    access: '可灵平台、Kling Open API',
    note: '当前官方接口需要专用签名和异步任务轮询；在完整适配前不再把它伪装成 OpenAI Images 接口。',
    docsUrl: 'https://kling.ai/document-api/apiReference%2Fmodel%2FimageGeneration',
    models: { chat: [], image: ['kling-v1'], video: [] },
  },
  {
    id: 'img-minimax',
    name: '海螺生图',
    mark: '海',
    protocol: 'openai',
    category: 'image',
    baseUrl: 'https://api.minimaxi.com',
    enabled: true,
    region: '国内',
    accent: '#df7b35',
    status: '官方 API',
    canGenerate: true,
    modelDiscovery: 'fixed',
    endpoint: '/v1/image_generation',
    authType: 'bearer',
    summary: '以多模态融合和人物主体一致性见长，适合连续内容与 IP 资产衍生。',
    strength: '角色一致性、多图叙事与中文场景理解',
    bestFor: ['故事绘本', 'IP 衍生', '连续角色', '中文叙事图'],
    access: 'MiniMax 开放平台 API',
    note: 'Image-01 支持文生图与主体参考图；当前画布先接入文生图，参考图能力可在后续节点扩展。',
    docsUrl: 'https://platform.minimaxi.com/docs/guides/image-generation',
    models: { chat: [], image: ['image-01'], video: [] },
  },
];

const WINDOWS_CLI_INSTALLER = 'tools/launchers/安装CLI工具-Windows.bat';

const PROVIDER_SETUP_GUIDES: Record<string, ProviderSetupGuide> = {
  api: {
    badge: 'OPENAI COMPATIBLE',
    summary: '适合 OpenAI、DeepSeek、通义千问、Kimi、智谱以及其它兼容 Chat Completions 的平台。',
    requirements: [
      '平台提供的 API Key',
      'API Base URL（不要填网页登录地址）',
      '至少一个真实模型 ID',
    ],
    steps: [
      '把平台文档中的 Base URL 填入地址栏。通常以 /v1 或兼容路径结尾。',
      '粘贴 API Key；保存后会在浏览器本地加密，避免项目配置明文；同源脚本或能读取浏览器配置的人仍可访问。',
      '点击“检测连接”或“拉取模型”。如果平台不开放 /models，就手动添加模型 ID。',
      '把常用模型设为默认，然后点击“保存并启用”。',
    ],
    commands: [],
    docsUrl: 'https://platform.openai.com/docs',
  },
  xai: {
    badge: 'XAI · GROK',
    summary:
      '同一枚 xAI API Key 可接入 Grok 对话、Grok Imagine 图片和异步视频生成，并同步到画布对应节点。',
    requirements: [
      'xAI Console 创建的 API Key',
      '可用的 Grok / Imagine 模型权限',
      '可访问 api.x.ai 的网络',
    ],
    steps: [
      '在 xAI Console 创建 API Key，并保留预设 Base URL https://api.x.ai/v1。',
      '点击“检测连接”或“拉取模型”；系统会分别读取语言、图片和视频模型。',
      '分别确认对话、图片和视频分类中的默认模型。',
      '点击“保存并启用”，Grok 会同时进入 AI 对话、图像节点和视频节点。',
    ],
    commands: [],
    docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference',
  },
  deepseek: {
    badge: 'DEEPSEEK API',
    summary:
      '通过 DeepSeek 官方 OpenAI 兼容接口接入对话、推理、剧本分析和文本节点。官方 API 当前不提供图片或视频生成。',
    requirements: [
      'DeepSeek 开放平台 API Key',
      'deepseek-v4-flash 或 deepseek-v4-pro 模型权限',
      '可访问 api.deepseek.com 的网络',
    ],
    steps: [
      '在 DeepSeek 开放平台创建 API Key，并保留预设 Base URL https://api.deepseek.com。',
      '点击“检测连接”或“拉取模型”，确认账户当前可用的文本模型。',
      '把常用模型设为默认；需要更强推理时选择 deepseek-v4-pro。',
      '点击“保存并启用”，模型会进入 AI 对话、故事分析、剧本与其它文本节点。',
    ],
    commands: [],
    docsUrl: 'https://api-docs.deepseek.com/',
    warning:
      'DeepSeek 官方开放平台当前只接入文本能力；图片和视频模块不会显示伪造的 DeepSeek 生成模型。',
  },
  modelscope: {
    badge: 'MODELSCOPE API',
    summary: '通过魔搭 API-Inference 调用对话或图像模型，不需要安装本地 CLI。',
    requirements: [
      'ModelScope Access Token',
      '模型仓库中的完整模型 ID',
      '可访问 ModelScope API 的网络',
    ],
    steps: [
      '在 ModelScope 个人中心创建 Access Token。',
      '保留预设 Base URL，填入 Token 后点击“检测连接”。',
      '拉取模型或手动填写完整 ID，例如 Qwen/模型名。',
      '选择默认模型并保存启用。',
    ],
    commands: [],
    docsUrl: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
  },
  volcengine: {
    badge: 'VOLCENGINE ARK',
    summary:
      '推荐用于豆包文本、Seedream 图片和 Seedance 视频；这是即梦能力更稳定的官方 API 接入方式。',
    requirements: [
      '火山方舟 API Key',
      '已开通的模型或推理接入点',
      '控制台显示的真实模型/Endpoint ID',
    ],
    steps: [
      '在火山方舟控制台开通需要的文本、Seedream 或 Seedance 模型。',
      '创建 API Key，保留预设 Ark Base URL。',
      '拉取模型；若控制台使用 Endpoint ID，请手动填写该 ID。',
      '分别设置对话、图片、视频的默认模型并保存启用。',
    ],
    commands: [],
    docsUrl: 'https://www.volcengine.com/docs/82379',
  },
  'comfyui-local': {
    badge: 'LOCAL COMFYUI',
    summary:
      '通过 Qiansi-Canvas 本地桥访问 ComfyUI。导入 API Format 工作流后，每个工作流会作为一个视频模型出现在视频节点中。',
    requirements: [
      '本机已安装并启动 ComfyUI，默认监听 http://127.0.0.1:8188',
      '已启动 Qiansi-Canvas 本地桥（2895）',
      '从 ComfyUI 导出的 API Format 工作流 JSON',
      '若要使用依赖安装脚本，需要在 ComfyUI 的 Python 环境安装官方 comfy CLI',
    ],
    steps: [
      '先启动 ComfyUI，确认浏览器可以打开 127.0.0.1:8188。',
      '启动 Qiansi-Canvas，并在本页点击“检测连接”。',
      '在 ComfyUI 中使用“Save (API Format)”导出工作流 JSON。',
      '填写名称并导入；页面会检测节点类与模型文件，并可生成 PowerShell 依赖脚本。',
      '回到普通视频节点，在模型菜单选择“ComfyUI 本地 · 工作流名称”，连接图片并生成。',
    ],
    commands: [
      { label: 'ComfyUI 默认地址', value: 'http://127.0.0.1:8188' },
      { label: '画布桥地址', value: BRIDGE_BASE_URL },
    ],
    warning:
      '仅导入可信的 API Format 工作流，并让输出节点生成 MP4、WebM 或 MOV。依赖脚本会调用第三方节点安装流程，执行前必须检查来源；模型没有可信下载 URL 时只列清单，不会猜测来源。若自动识别有歧义，请使用 QIANSI_PROMPT、QIANSI_IMAGE、QIANSI_END_IMAGE、QIANSI_OUTPUT；需要让画布覆盖尺寸时标记 QIANSI_WIDTH、QIANSI_HEIGHT，覆盖时长与帧率时必须同时标记 QIANSI_FRAMES、QIANSI_FPS。',
  },
  'comfyui-remote': {
    badge: 'REMOTE COMFYUI',
    summary:
      '通过 Qiansi-Canvas 画布桥访问远程 GPU 服务器上的 ComfyUI API，并为该连接单独保存工作流模型。',
    requirements: [
      'GPU 服务商提供可访问的 ComfyUI HTTPS API 地址',
      '服务端支持 /system_stats、/upload/image、/prompt、/history 和 /view',
      '若服务需要鉴权，准备 Bearer Token、API Key 或 X-Key',
      '远程 ComfyUI 已安装工作流依赖的节点与模型',
    ],
    steps: [
      '填写远程 ComfyUI Base URL；不要填写网页工作流的 #片段地址。',
      '按服务商要求选择鉴权方式并填写密钥，然后点击“检测连接”。',
      '导入与远程服务器节点、模型一致的 API Format 工作流。',
      '导出无限画布节点 JSON，或直接在模型菜单选择“ComfyUI 远程 · 工作流名称”。',
    ],
    commands: [{ label: '画布桥地址', value: BRIDGE_BASE_URL }],
    warning:
      '远程地址只允许 HTTPS 公网地址；不会接受私网、保留地址、URL 内用户名/密码、查询参数或 #片段。不要把未启用鉴权的 ComfyUI 直接暴露到公网。',
  },
  'volcengine-cli': {
    badge: 'VOLCENGINE ARK CLI · arkcli',
    summary:
      '“山火 CLI”入口安装并检测火山方舟官方 Ark CLI（arkcli），可在终端中使用方舟模型与生成工具；当前尚未接入画布生成适配器。',
    requirements: [
      'Node.js 14 或更高版本（Qiansi-Canvas 随附运行时已满足）',
      '可登录的火山引擎账户',
      '可完成浏览器 SSO 登录的火山引擎环境',
      '已启动根目录 local-bridge.mjs',
    ],
    steps: [
      'Windows 或 macOS 打开 CLI 工具安装器并选择第一项；安装器直接安装官方 @volcengine/ark-cli 包，不镜像、不维护官方软件包。',
      '安装器以 arkcli --version 成功作为安装完成标准；尚未登录不会被误报成安装失败。',
      '在新终端运行 arkcli auth login volc-sso，并在浏览器完成官方登录。',
      '运行 arkcli auth status，确认当前身份状态。',
      '启动 Qiansi-Canvas 后点击“重新检测”；页面会分别显示安装、命令运行与身份认证状态，不读取或展示本地凭证配置。',
      '如需把 Ark CLI 能力安装为 Agent Skills，可在理解影响后手动运行 arkcli +connect；Qiansi-Canvas 不会自动执行该命令。',
      '当前入口不会向画布发布模型；在画布生成适配器完成前，请继续使用“火山方舟”API 服务商生成内容。',
    ],
    commands: [
      { label: '安装官方 CLI', value: 'npm.cmd install --global @volcengine/ark-cli@latest' },
      { label: '检查版本', value: 'arkcli --version' },
      { label: '浏览器登录', value: 'arkcli auth login volc-sso' },
      { label: '验证当前身份', value: 'arkcli auth status' },
      { label: '可选：连接 Agent Skills', value: 'arkcli +connect' },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://console.volcengine.com/ark/region:cn-beijing/arkcli',
    warning:
      '当前接入只执行固定的 arkcli --version 与 arkcli auth status 检测，不开放任意命令透传，也不会把令牌或认证内容返回页面；安装、登录和 +connect 都由用户明确触发。',
  },
  jimeng: {
    badge: 'DREAMINA / JIMENG CLI',
    summary:
      '通过即梦官方 Dreamina CLI 完成扫码登录，并真实提交 Seedream 图片与 Seedance 视频任务；生成前会再次核验登录态，结果通过 submit_id 持续查询并保存到本机。',
    requirements: [
      'Windows 需要 Git for Windows（官方安装器使用 Git Bash）',
      '可扫码登录的即梦 / Dreamina 账户',
      '已启动根目录 local-bridge.mjs',
    ],
    steps: [
      'Windows 运行 tools/launchers/安装CLI工具-Windows.bat，macOS 运行 tools/launchers/安装CLI工具-macOS.command，并选择 Dreamina / Jimeng；安装器只下载官方脚本，不会自动执行。',
      '检查下载脚本内容，并从即梦官方渠道核对发布者或 SHA-256；确认可信后再手动运行。',
      '安装完成后启动 Qiansi-Canvas，本地桥会同时检查 PATH 和官方默认安装目录。',
      '进入即梦 CLI 后点击“扫码登录”，使用手机 App 扫描页面显示的二维码。',
      '页面会持续读取本机 CLI 状态；只有真实登录成功后，即梦图片和视频模型才会进入节点。',
      '模型目录同时读取官方 user_credit 返回的 vip_level；只有确认当前账号为 VIP 时，即梦 CLI 的图片和视频模型才会进入画布。非会员或无法确认会员状态时，设置页仍保留安装、登录和状态操作，但画布不显示即梦模型。',
      '生成任务只提交一次，不会因查询超时自动重新提交；最终权限仍以即梦后端为准。',
    ],
    commands: [
      {
        label: '仅下载官方安装脚本（不执行）',
        value:
          'curl --fail --location --proto "=https" --output dreamina-install.sh https://jimeng.jianying.com/cli',
      },
      { label: '检测命令', value: 'where dreamina' },
      { label: '启动本地桥', value: 'node local-bridge.mjs' },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://jimeng.jianying.com/cli',
    warning:
      '项目没有可内置核验的官方固定哈希，因此绝不把远程响应直接交给 shell。下载后必须先检查并从即梦官方渠道核验；扫码、会员和积分能力仍以官方规则为准。',
  },
  codex: {
    badge: 'OPENAI CODEX CLI',
    summary:
      '使用本机 Codex 登录态执行文本任务；只有检测到可用的 GPT Image helper 时，才会显示 $imagegen 图片功能，无需把账户密码或 API Key 写入项目。',
    requirements: [
      'Node.js 22 或更高版本',
      '可使用的 ChatGPT/Codex 账户或 OpenAI API Key',
      '根目录本地桥',
    ],
    steps: [
      '运行当前系统对应的 tools/launchers/安装CLI工具-* 安装器，选择 Codex CLI。',
      '安装完成后运行 codex.cmd login，并在浏览器完成登录；PowerShell 若拦截 codex.ps1，请始终使用 codex.cmd。',
      '双击根目录的“打开Qiansi-Canvas.bat”；打开设置后会自动检测，也可以手动重新检测。',
      '点击“拉取模型”，读取当前 Codex CLI 账户真正可用的模型；可为每个模型分别设置低、中、高、极高或最大推理强度。',
      'AI 对话与文本节点会同时传入所选模型和推理强度；若本机未检测到 GPT Image helper，图片入口会保持隐藏。',
    ],
    commands: [
      { label: '安装', value: 'npm.cmd install --global @openai/codex@latest' },
      { label: '登录', value: 'codex.cmd login' },
      { label: '检查登录', value: 'codex.cmd login status' },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://learn.chatgpt.com/docs/developer-commands.md?surface=cli',
  },
  workbuddy: {
    badge: 'WORKBUDDY / CODEBUDDY CLI',
    summary:
      '通过腾讯 WorkBuddy 官方文档提供的 CodeBuddy Code CLI 执行文本任务；原生多模态 Hy3 还可读取图片。画布只启用非交互文本输出，不授予自动文件修改、命令执行或联网工具权限。',
    requirements: [
      'Node.js 18 或更高版本',
      '可用的 WorkBuddy / CodeBuddy 账户',
      '持续运行的 WorkBuddy 会话',
      '根目录本地桥',
    ],
    steps: [
      '运行当前系统对应的 tools/launchers/安装CLI工具-* 安装器，选择 WorkBuddy CLI。',
      '安装完成后在终端运行 codebuddy，并按界面提示完成登录；使用期间不要关闭该会话。',
      '双击根目录的“打开Qiansi-Canvas.bat”；保持 WorkBuddy 运行，再到设置中选择 WorkBuddy CLI 并点击“重新检测”。',
      '默认使用 workbuddy:auto；如果账户配置了明确模型，检测后也会加入模型列表。',
      '只有检测到活动 WorkBuddy 会话时，模型才会出现在 AI 助手与文本节点；Hy3 会额外出现在支持图片输入的指令框中。关闭后会自动停用。',
    ],
    commands: [
      { label: '安装', value: 'npm.cmd install --global @tencent-ai/codebuddy-code@latest' },
      { label: '启动并登录', value: 'codebuddy' },
      { label: '查看版本', value: 'codebuddy --version' },
      { label: '查看当前模型', value: 'codebuddy config get model' },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://www.workbuddy.ai/docs/cli/',
    warning:
      'CLI 登录态由 WorkBuddy 自身管理，画布不会读取或保存其账号令牌；必须保持 WorkBuddy 会话运行，真实调用仍可能要求在终端完成登录。',
  },
  bailian: {
    badge: 'ALIBABA MODEL STUDIO CLI',
    summary:
      '通过阿里云百炼官方 bl 命令生成或编辑图片，并执行文生视频、图生视频；账号凭据由官方 CLI 保存。',
    requirements: ['Node.js 22.12 或更高版本', '阿里云百炼账户或 API Key', '根目录本地桥'],
    steps: [
      '运行当前系统对应的 tools/launchers/安装CLI工具-* 安装器并选择百炼 CLI。',
      '在终端运行 bl auth login --console，或使用官方 API Key 登录方式。',
      '启动 Qiansi-Canvas，在本页点击“重新检测”。',
      '检测成功后，Qwen Image 和百炼视频自动选择会进入图片、视频节点。',
    ],
    commands: [
      { label: '安装', value: 'npm.cmd install --global bailian-cli' },
      { label: '控制台登录', value: 'bl auth login --console' },
      { label: '检查登录', value: 'bl auth status --output json' },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://help.aliyun.com/zh/model-studio/use-model-studio-cli',
    warning: '图片和视频调用会消耗百炼账户额度；画布不会读取或保存完整凭据。',
  },
  lightx2v: {
    badge: 'LIGHTX2V LOCAL GPU',
    summary:
      '通过本机 Python 环境调用 LightX2V API。适合已准备 CUDA、模型权重和官方 config_json 的高级用户。',
    requirements: [
      'Python 3.10 或更高版本及可用的 lightx2v 包',
      '满足所选模型要求的本地显卡和 CUDA 环境',
      '已下载的模型目录与对应 config_json',
    ],
    steps: [
      '按 LightX2V 官方文档创建独立 Python/Conda 环境并安装 lightx2v。',
      '在下方填写该环境的 python.exe、LightX2V 工作目录、模型目录和 config_json。',
      '图片与视频可分别配置模型类型；默认示例为 qwen_image 与 wan2.2_moe。',
      '点击“重新检测”；只有 Python 导入成功且对应配置完整时，模型才会进入节点。',
    ],
    commands: [
      { label: '安装源码包', value: 'pip install -v git+https://github.com/ModelTC/LightX2V.git' },
      {
        label: '验证 Python 包',
        value: 'python -c "import lightx2v; print(lightx2v.__version__)"',
      },
    ],
    docsUrl: 'https://github.com/ModelTC/LightX2V',
    warning:
      'LightX2V 模型之间的显存与配置差异很大；画布不会自动下载权重，也不会替用户修改官方 config_json。',
  },
  gemini: {
    badge: 'ANTIGRAVITY CLI',
    summary:
      '仅使用官方 Antigravity CLI（agy）执行文本任务；不会回退到 Gemini CLI 或把已安装命令误判为已联通。',
    requirements: ['Windows 10/11', 'Google 账户', '根目录本地桥'],
    steps: [
      '运行当前系统对应的 tools/launchers/安装CLI工具-* 安装器，优先选择 Antigravity CLI；安装器只下载官方脚本，不会自动执行。',
      '检查脚本内容并从 Google 官方渠道核对发布者或校验值，确认可信后再手动运行。',
      '首次运行 agy 会打开浏览器，按提示完成 Google 登录。',
      '启动 Qiansi-Canvas 后点击“检测 CLI”。',
      '模型使用 antigravity:auto，交由已登录的官方 agy CLI 选择账号可用模型。',
    ],
    commands: [
      { label: '运行 Antigravity', value: 'agy' },
      {
        label: '仅下载官方安装脚本（不执行）',
        value:
          'curl --fail --location --proto "=https" --output antigravity-install.cmd https://antigravity.google/cli/install.cmd',
      },
    ],
    rootInstaller: WINDOWS_CLI_INSTALLER,
    docsUrl: 'https://antigravity.google/docs/cli-getting-started',
  },
};

export function providerSetupGuide(provider: ProviderConnection): ProviderSetupGuide {
  return (
    PROVIDER_SETUP_GUIDES[provider.id] ||
    (isRemoteComfyUiProvider(provider)
      ? PROVIDER_SETUP_GUIDES[COMFYUI_REMOTE_PROVIDER_ID]
      : undefined) || {
      badge: provider.custom ? 'CUSTOM API' : provider.protocol.toUpperCase(),
      summary: `为 ${provider.name} 配置兼容 API 地址、密钥和真实模型 ID。`,
      requirements: ['服务商提供的 API Key', 'API Base URL', '真实模型 ID'],
      steps: [
        '从服务商开发者文档复制 API Base URL，不要填写控制台或网页登录地址。',
        '填写 API Key 后检测连接。',
        '自动拉取模型；若不支持 /models，请手动添加模型 ID。',
        '设置默认模型并保存启用。',
      ],
      commands: [],
    }
  );
}

export function createDefaultProviderConnections(): ProviderConnection[] {
  return PROVIDER_DEFAULTS.map((provider) => ({
    ...provider,
    apiKey: '',
    models: {
      chat: [...provider.models.chat],
      image: [...provider.models.image],
      video: [...provider.models.video],
      audio: [...(provider.models.audio ?? [])],
      '3d': [...(provider.models['3d'] ?? [])],
    },
    modelCapabilities: provider.modelCapabilities
      ? Object.fromEntries(
          Object.entries(provider.modelCapabilities).map(([model, capability]) => [
            model,
            {
              ...capability,
              reasoningEfforts: capability.reasoningEfforts
                ? [...capability.reasoningEfforts]
                : undefined,
              inputModalities: capability.inputModalities
                ? [...capability.inputModalities]
                : undefined,
              videoModes: capability.videoModes ? [...capability.videoModes] : undefined,
              videoOperations: capability.videoOperations
                ? [...capability.videoOperations]
                : undefined,
            },
          ]),
        )
      : undefined,
    modelReasoningEfforts: provider.modelReasoningEfforts
      ? { ...provider.modelReasoningEfforts }
      : undefined,
    disabledModelKinds: provider.disabledModelKinds ? [...provider.disabledModelKinds] : undefined,
    modelDiscovery: provider.modelDiscovery,
    cliConfig: provider.cliConfig ? { ...provider.cliConfig } : undefined,
    bestFor: provider.bestFor ? [...provider.bestFor] : undefined,
  }));
}

const SETTINGS_REGION_ORDER: Record<NonNullable<ProviderConnection['region']>, number> = {
  国内: 0,
  通用: 1,
  海外: 2,
};

function settingsProviderPriority(providerId: string): number {
  if (providerId === 'volcengine-cli') return -1;
  if (providerId === COMFYUI_LOCAL_PROVIDER_ID) return 10;
  if (providerId === COMFYUI_REMOTE_PROVIDER_ID) return 11;
  if (providerId.startsWith(`${COMFYUI_REMOTE_PROVIDER_ID}-`)) return 12;
  return 0;
}

/**
 * Settings-only presentation order. The provider registry order also feeds
 * model fallback selection, so it must never be mutated merely to rearrange
 * the settings directory.
 */
export function sortProvidersForSettings<T extends Pick<ProviderConnection, 'id' | 'region'>>(
  providers: readonly T[],
): T[] {
  return providers
    .map((provider, originalIndex) => ({ provider, originalIndex }))
    .sort((left, right) => {
      const leftPriority = settingsProviderPriority(left.provider.id);
      const rightPriority = settingsProviderPriority(right.provider.id);
      const leftRank = SETTINGS_REGION_ORDER[left.provider.region ?? '通用'];
      const rightRank = SETTINGS_REGION_ORDER[right.provider.region ?? '通用'];
      return (
        leftPriority - rightPriority ||
        leftRank - rightRank ||
        left.originalIndex - right.originalIndex
      );
    })
    .map(({ provider }) => provider);
}

function cliConfig(value: unknown, fallback?: ProviderCliConfig): ProviderCliConfig | undefined {
  if (!value || typeof value !== 'object') return fallback ? { ...fallback } : undefined;
  const item = value as Partial<ProviderCliConfig>;
  const next: ProviderCliConfig = { ...(fallback ?? {}) };
  for (const key of [
    'executablePath',
    'workingDirectory',
    'imageModelPath',
    'imageModelClass',
    'imageTask',
    'imageConfigPath',
    'videoModelPath',
    'videoModelClass',
    'videoTask',
    'videoConfigPath',
  ] as const) {
    if (typeof item[key] === 'string') next[key] = item[key].trim();
  }
  return next;
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseProviderModelCapabilities(
  value: unknown,
  fallback: Record<string, ProviderModelCapability> = {},
): Record<string, ProviderModelCapability> {
  const result: Record<string, ProviderModelCapability> = Object.fromEntries(
    Object.entries(fallback).map(([model, capability]) => [
      model,
      {
        ...capability,
        reasoningEfforts: capability.reasoningEfforts
          ? [...capability.reasoningEfforts]
          : undefined,
        inputModalities: capability.inputModalities ? [...capability.inputModalities] : undefined,
        videoModes: capability.videoModes ? [...capability.videoModes] : undefined,
        videoOperations: capability.videoOperations ? [...capability.videoOperations] : undefined,
      },
    ]),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;

  const reasoningEfforts = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  const inputModalities = new Set<ProviderInputModality>(['text', 'image']);
  const videoModes = new Set<NonNullable<ProviderModelCapability['videoModes']>[number]>([
    '文生视频',
    '全能参考',
    '图生视频',
    '首尾帧',
    '图片参考',
    '视频换人物',
  ]);
  const videoOperations = new Set<ProviderVideoOperation>([
    'remake',
    'enhance',
    'extend',
    'remove-subtitles',
    'visual-edit',
    'masked-repair',
    'character-replace',
  ]);
  for (const [rawModel, rawCapability] of Object.entries(value)) {
    const model = rawModel.trim();
    if (
      !model ||
      !rawCapability ||
      typeof rawCapability !== 'object' ||
      Array.isArray(rawCapability)
    ) {
      continue;
    }
    const item = rawCapability as Record<string, unknown>;
    const parsedEfforts = Array.isArray(item.reasoningEfforts)
      ? Array.from(
          new Set(
            item.reasoningEfforts.filter(
              (
                effort,
              ): effort is NonNullable<ProviderModelCapability['reasoningEfforts']>[number] =>
                typeof effort === 'string' && reasoningEfforts.has(effort),
            ),
          ),
        )
      : undefined;
    const parsedModalities = Array.isArray(item.inputModalities)
      ? Array.from(
          new Set(
            item.inputModalities.filter((modality): modality is ProviderInputModality =>
              inputModalities.has(modality as ProviderInputModality),
            ),
          ),
        )
      : undefined;
    const parsedVideoModes = Array.isArray(item.videoModes)
      ? Array.from(
          new Set(
            item.videoModes.filter(
              (mode): mode is NonNullable<ProviderModelCapability['videoModes']>[number] =>
                videoModes.has(mode as NonNullable<ProviderModelCapability['videoModes']>[number]),
            ),
          ),
        )
      : undefined;
    const parsedVideoOperations = Array.isArray(item.videoOperations)
      ? Array.from(
          new Set(
            item.videoOperations.filter(
              (operation): operation is ProviderVideoOperation =>
                typeof operation === 'string' &&
                videoOperations.has(operation as ProviderVideoOperation),
            ),
          ),
        )
      : undefined;
    const boundedInteger = (candidate: unknown, maximum: number) =>
      typeof candidate === 'number' &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0 &&
      candidate <= maximum
        ? candidate
        : undefined;
    const maxOutputCount =
      item.maxOutputCount === 1 || item.maxOutputCount === 2 || item.maxOutputCount === 4
        ? item.maxOutputCount
        : undefined;
    const defaultReasoningEffort =
      typeof item.defaultReasoningEffort === 'string' &&
      reasoningEfforts.has(item.defaultReasoningEffort)
        ? (item.defaultReasoningEffort as NonNullable<
            ProviderModelCapability['defaultReasoningEffort']
          >)
        : undefined;
    const comfyCompatibility =
      item.comfyCompatibility === 'compatible' ||
      item.comfyCompatibility === 'incompatible' ||
      item.comfyCompatibility === 'unchecked'
        ? item.comfyCompatibility
        : undefined;
    result[model] = {
      ...result[model],
      ...(str(item.displayName) ? { displayName: str(item.displayName) } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
      ...(parsedEfforts ? { reasoningEfforts: parsedEfforts } : {}),
      ...(parsedModalities ? { inputModalities: parsedModalities } : {}),
      ...(typeof item.videoReferenceInput === 'boolean'
        ? { videoReferenceInput: item.videoReferenceInput }
        : {}),
      ...(parsedVideoModes ? { videoModes: parsedVideoModes } : {}),
      ...(parsedVideoOperations ? { videoOperations: parsedVideoOperations } : {}),
      ...(boundedInteger(item.maxReferenceImages, 50) !== undefined
        ? { maxReferenceImages: boundedInteger(item.maxReferenceImages, 50) }
        : {}),
      ...(boundedInteger(item.maxReferenceVideos, 10) !== undefined
        ? { maxReferenceVideos: boundedInteger(item.maxReferenceVideos, 10) }
        : {}),
      ...(boundedInteger(item.maxReferenceAudios, 20) !== undefined
        ? { maxReferenceAudios: boundedInteger(item.maxReferenceAudios, 20) }
        : {}),
      ...(maxOutputCount ? { maxOutputCount } : {}),
      ...(comfyCompatibility ? { comfyCompatibility } : {}),
      ...(str(item.comfyCompatibilityMessage)
        ? { comfyCompatibilityMessage: str(item.comfyCompatibilityMessage)?.slice(0, 1000) }
        : {}),
      ...(str(item.comfySourceVersion)
        ? { comfySourceVersion: str(item.comfySourceVersion)?.slice(0, 20) }
        : {}),
      ...(str(item.comfyBackendVersion)
        ? { comfyBackendVersion: str(item.comfyBackendVersion)?.slice(0, 160) }
        : {}),
    };
  }
  return result;
}

function providerProtocol(value: unknown, fallback: ProviderProtocol): ProviderProtocol {
  return typeof value === 'string' && PROVIDER_PROTOCOLS.has(value as ProviderProtocol)
    ? (value as ProviderProtocol)
    : fallback;
}

function imageAuthType(value: unknown): ImageAuthType | undefined {
  return typeof value === 'string' && IMAGE_AUTH_TYPES.has(value as ImageAuthType)
    ? (value as ImageAuthType)
    : undefined;
}

function cliStatusSnapshot(
  value: unknown,
  fallbackCheckedAt?: number,
): ProviderCliStatusSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<ProviderCliStatusSnapshot>;
  if (typeof item.installed !== 'boolean') return undefined;
  const checkedAt =
    typeof item.checkedAt === 'number' && Number.isFinite(item.checkedAt)
      ? item.checkedAt
      : fallbackCheckedAt;
  if (typeof checkedAt !== 'number') return undefined;
  return {
    installed: item.installed,
    runnable: typeof item.runnable === 'boolean' ? item.runnable : undefined,
    running: typeof item.running === 'boolean' ? item.running : undefined,
    cliKind: typeof item.cliKind === 'string' ? item.cliKind.trim() : undefined,
    authenticated: typeof item.authenticated === 'boolean' ? item.authenticated : undefined,
    ready: typeof item.ready === 'boolean' ? item.ready : undefined,
    state:
      typeof item.state === 'string' &&
      ['ready', 'installed', 'unauthenticated', 'unavailable', 'error'].includes(item.state)
        ? item.state
        : undefined,
    reasonCode: typeof item.reasonCode === 'string' ? item.reasonCode.trim() : undefined,
    imageGeneration: typeof item.imageGeneration === 'boolean' ? item.imageGeneration : undefined,
    imageEditing: typeof item.imageEditing === 'boolean' ? item.imageEditing : undefined,
    videoGeneration: typeof item.videoGeneration === 'boolean' ? item.videoGeneration : undefined,
    hasVipAccess: typeof item.hasVipAccess === 'boolean' ? item.hasVipAccess : undefined,
    version: typeof item.version === 'string' ? item.version.trim() : '',
    commandPath: typeof item.commandPath === 'string' ? item.commandPath.trim() : '',
    message: typeof item.message === 'string' ? item.message.trim() : '',
    checkedAt,
  };
}

function savedTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function latestProviderObservationTimestamp(
  observation:
    | RuntimeProviderObservation
    | Pick<ProviderConnection, 'verifiedAt' | 'lastVerifiedAt' | 'cliStatus'>,
): number | undefined {
  const candidates = [
    savedTimestamp(observation.verifiedAt),
    'rejectedAt' in observation ? savedTimestamp(observation.rejectedAt) : undefined,
    'lastVerifiedAt' in observation ? savedTimestamp(observation.lastVerifiedAt) : undefined,
    savedTimestamp(observation.cliStatus?.checkedAt),
  ].filter((value): value is number => value !== undefined);
  return candidates.length ? Math.max(...candidates) : undefined;
}

function currentRuntimeProvider(provider: ProviderConnection): ProviderConnection {
  const observation = runtimeProviderVerifications.get(provider.id);
  if (
    !observation ||
    observation.protocol !== provider.protocol ||
    observation.baseUrl !== provider.baseUrl
  ) {
    runtimeProviderVerifications.delete(provider.id);
    return { ...provider, verifiedAt: undefined };
  }
  const observationTimestamp = latestProviderObservationTimestamp(observation);
  const providerTimestamp = latestProviderObservationTimestamp(provider);
  if (
    observationTimestamp !== undefined &&
    providerTimestamp !== undefined &&
    providerTimestamp > observationTimestamp
  ) {
    runtimeProviderVerifications.delete(provider.id);
    runtimeProviderRevisions.set(provider.id, runtimeProviderRevision(provider.id) + 1);
    return { ...provider, verifiedAt: undefined };
  }
  if (observation.rejectedAt) {
    return {
      ...provider,
      verifiedAt: undefined,
      lastVerifiedAt: undefined,
      ...(observation.cliStatus ? { cliStatus: { ...observation.cliStatus } } : {}),
      ...(observation.models
        ? {
            models: {
              chat: [...observation.models.chat],
              image: [...observation.models.image],
              video: [...observation.models.video],
              audio: [...(observation.models.audio ?? [])],
              '3d': [...(observation.models['3d'] ?? [])],
            },
          }
        : {}),
      ...(observation.modelCapabilities
        ? { modelCapabilities: { ...observation.modelCapabilities } }
        : {}),
    };
  }
  const { verifiedAt } = observation;
  if (!verifiedAt) return { ...provider, verifiedAt: undefined };
  const age = Date.now() - verifiedAt;
  if (!isCliProtocol(provider.protocol) || (age >= 0 && age <= CLI_RUNTIME_VERIFICATION_TTL_MS)) {
    return {
      ...provider,
      verifiedAt,
      ...(observation.cliStatus ? { cliStatus: { ...observation.cliStatus } } : {}),
      ...(observation.models
        ? {
            models: {
              chat: [...observation.models.chat],
              image: [...observation.models.image],
              video: [...observation.models.video],
              audio: [...(observation.models.audio ?? [])],
              '3d': [...(observation.models['3d'] ?? [])],
            },
          }
        : {}),
      ...(observation.modelCapabilities
        ? { modelCapabilities: { ...observation.modelCapabilities } }
        : {}),
    };
  }
  runtimeProviderVerifications.delete(provider.id);
  return { ...provider, verifiedAt: undefined };
}

function runtimeProviderRevision(providerId: string) {
  return runtimeProviderRevisions.get(providerId) ?? 0;
}

function rememberRuntimeProvider(connection: ProviderConnection) {
  const current = runtimeProviderVerifications.get(connection.id);
  if (
    current &&
    current.protocol === connection.protocol &&
    current.baseUrl === connection.baseUrl
  ) {
    const currentTimestamp = latestProviderObservationTimestamp(current);
    const connectionTimestamp = latestProviderObservationTimestamp(connection);
    if (
      currentTimestamp !== undefined &&
      connectionTimestamp !== undefined &&
      connectionTimestamp < currentTimestamp
    ) {
      return;
    }
  }
  if (!isProviderConnectionVerified(connection)) {
    const status = connection.cliStatus;
    const rejectedAt =
      isCliProtocol(connection.protocol) &&
      !connection.lastVerifiedAt &&
      status?.ready === false &&
      status.checkedAt
        ? status.checkedAt
        : undefined;
    if (rejectedAt && status) {
      const rejection: RuntimeProviderObservation = {
        rejectedAt,
        protocol: connection.protocol,
        baseUrl: connection.baseUrl,
        cliStatus: { ...status },
        models: {
          chat: [...connection.models.chat],
          image: [...connection.models.image],
          video: [...connection.models.video],
          audio: [...(connection.models.audio ?? [])],
          '3d': [...(connection.models['3d'] ?? [])],
        },
        modelCapabilities: { ...(connection.modelCapabilities ?? {}) },
      };
      if (current && JSON.stringify(current) === JSON.stringify(rejection)) return;
      runtimeProviderVerifications.set(connection.id, rejection);
    } else {
      if (!current) return;
      runtimeProviderVerifications.delete(connection.id);
    }
    runtimeProviderRevisions.set(connection.id, runtimeProviderRevision(connection.id) + 1);
    return;
  }
  const observation: RuntimeProviderObservation = {
    verifiedAt: connection.verifiedAt as number,
    protocol: connection.protocol,
    baseUrl: connection.baseUrl,
    ...(connection.cliStatus ? { cliStatus: { ...connection.cliStatus } } : {}),
    ...(isCliProtocol(connection.protocol)
      ? {
          models: {
            chat: [...connection.models.chat],
            image: [...connection.models.image],
            video: [...connection.models.video],
            audio: [...(connection.models.audio ?? [])],
            '3d': [...(connection.models['3d'] ?? [])],
          },
          modelCapabilities: { ...(connection.modelCapabilities ?? {}) },
        }
      : {}),
  };
  if (current && JSON.stringify(current) === JSON.stringify(observation)) return;
  runtimeProviderVerifications.set(connection.id, observation);
  runtimeProviderRevisions.set(connection.id, runtimeProviderRevision(connection.id) + 1);
}

function rememberRuntimeProviders(connections: ProviderConnection[]) {
  for (const connection of connections) rememberRuntimeProvider(connection);
}

/** True only for a current runtime verification and, for CLI tools, an explicit ready probe. */
export function isProviderConnectionVerified(provider: ProviderConnection): boolean {
  if (!provider.enabled || !provider.verifiedAt) return false;
  if (!isCliProtocol(provider.protocol)) return true;
  const status = provider.cliStatus;
  const age = Date.now() - provider.verifiedAt;
  return Boolean(
    age >= 0 &&
    age <= CLI_RUNTIME_VERIFICATION_TTL_MS &&
    status?.installed &&
    status.runnable === true &&
    (provider.protocol !== 'codebuddy' || status.running === true) &&
    (provider.protocol !== 'gemini-cli' || status.cliKind === 'agy') &&
    (provider.protocol !== 'jimeng' || status.hasVipAccess === true) &&
    status.authenticated === true &&
    status.ready === true &&
    status.checkedAt === provider.verifiedAt,
  );
}

/**
 * True when an unchanged CLI configuration has a complete, previously
 * successful probe snapshot. This is intentionally stricter than checking
 * `lastVerifiedAt` alone so legacy or partial status records cannot expose
 * models after a reload.
 */
export function hasDurableCliConnection(provider: ProviderConnection): boolean {
  if (!provider.enabled || !isCliProtocol(provider.protocol) || !provider.lastVerifiedAt) {
    return false;
  }
  // WorkBuddy needs a process-backed session, while Antigravity must re-run
  // `agy models`. Neither provider may expose models from a saved snapshot.
  if (provider.protocol === 'codebuddy' || provider.protocol === 'gemini-cli') return false;
  const status = provider.cliStatus;
  return Boolean(
    status?.installed &&
    status.runnable === true &&
    (provider.protocol !== 'jimeng' || status.hasVipAccess === true) &&
    status.authenticated === true &&
    status.ready === true &&
    status.checkedAt === provider.lastVerifiedAt,
  );
}

/**
 * Whether the saved connection can be used by canvas nodes.
 *
 * Remote API credentials and model lists are durable configuration. CLI
 * providers also restore their last complete ready snapshot so a reload or a
 * temporary bridge outage does not remove models from the canvas. The bridge
 * remains authoritative at execution time, while editing or resetting the
 * provider clears both verification timestamps.
 */
export function isProviderConnectionUsable(provider: ProviderConnection): boolean {
  if (!provider.enabled) return false;
  if (isCliProtocol(provider.protocol)) {
    return isProviderConnectionVerified(provider) || hasDurableCliConnection(provider);
  }
  if (provider.modelDiscovery === 'fixed') {
    return Boolean(provider.configValidatedAt || provider.verifiedAt || provider.lastVerifiedAt);
  }
  return Boolean(provider.verifiedAt || provider.lastVerifiedAt);
}

export function restoreProviderConnections(value: unknown): ProviderConnection[] {
  const defaults = createDefaultProviderConnections();
  if (!Array.isArray(value)) return defaults;
  const saved = value
    .filter((item): item is Partial<ProviderConnection> =>
      Boolean(item && typeof item === 'object'),
    )
    .filter((item) => {
      const id = String(item.id || '')
        .trim()
        .toLowerCase();
      const protocol = String(item.protocol || '')
        .trim()
        .toLowerCase();
      // Retired built-ins must be discarded before protocol normalization;
      // otherwise a legacy custom entry could silently fall back to OpenAI.
      return !RETIRED_PROVIDER_IDS.has(id) && !RETIRED_PROVIDER_PROTOCOLS.has(protocol);
    });
  const byId = new Map(saved.map((item) => [String(item.id || ''), item]));
  const restored = defaults.map((provider) => {
    const item = byId.get(provider.id);
    if (!item) return provider;

    const savedJimengHasVipAccess =
      provider.protocol === 'jimeng' &&
      Boolean(
        item.cliStatus &&
        typeof item.cliStatus === 'object' &&
        (item.cliStatus as Partial<ProviderCliStatusSnapshot>).hasVipAccess === true,
      );

    const savedImageModels = strings(item.models?.image).filter(
      (model) => provider.id !== 'api' || model !== 'gpt-image-1',
    );
    const imageModels =
      provider.protocol === 'jimeng'
        ? savedJimengHasVipAccess
          ? [...provider.models.image]
          : []
        : provider.id === 'img-imagen'
          ? Array.from(
              new Set([
                ...provider.models.image,
                ...savedImageModels.filter((model) => model !== 'imagen-3.0-generate-002'),
              ]),
            )
          : provider.id === 'img-ideogram'
            ? Array.from(
                new Set([
                  ...provider.models.image,
                  ...savedImageModels.filter((model) => model !== 'ideogram-v3'),
                ]),
              )
            : provider.id === 'img-recraft'
              ? Array.from(new Set([...provider.models.image, ...savedImageModels]))
              : provider.category === 'image'
                ? savedImageModels.length
                  ? savedImageModels
                  : provider.models.image
                : provider.protocol === 'codex'
                  ? savedImageModels.filter((model) => model === 'codex:$imagegen')
                  : provider.protocol === 'gemini-cli'
                    ? []
                    : savedImageModels.length
                      ? savedImageModels
                      : provider.models.image;
    const requiredImageModel = provider.id === 'api' ? 'gpt-image-2' : '';
    const migratedImageModels =
      requiredImageModel && !imageModels.includes(requiredImageModel)
        ? [requiredImageModel, ...imageModels]
        : imageModels;

    const savedChatModels = strings(item.models?.chat).filter(
      (model) => provider.protocol !== 'codex' || !/\$(?:imagegen)|:imagegen$/i.test(model),
    );
    const chatModels =
      provider.protocol === 'codex'
        ? Array.from(new Set([...provider.models.chat, ...savedChatModels]))
        : provider.protocol === 'gemini-cli'
          ? [...provider.models.chat]
          : savedChatModels.length
            ? savedChatModels
            : provider.models.chat;

    const modelCapabilities = parseProviderModelCapabilities(
      item.modelCapabilities,
      provider.modelCapabilities,
    );
    const savedEfforts =
      item.modelReasoningEfforts && typeof item.modelReasoningEfforts === 'object'
        ? item.modelReasoningEfforts
        : {};

    const legacyVerifiedAt = savedTimestamp(item.verifiedAt);
    const storedLastVerifiedAt = savedTimestamp(item.lastVerifiedAt);
    const savedConnectionAt = storedLastVerifiedAt ?? legacyVerifiedAt;
    const configValidatedAt =
      savedTimestamp(item.configValidatedAt) ??
      (provider.modelDiscovery === 'fixed' ? savedConnectionAt : undefined);
    const lastVerifiedAt = provider.modelDiscovery === 'fixed' ? undefined : savedConnectionAt;

    const savedBaseUrl = str(item.baseUrl);
    const restoredBaseUrl =
      isCliProtocol(provider.protocol) && savedBaseUrl === LEGACY_LOOPBACK_BRIDGE_V1_BASE_URL
        ? BRIDGE_V1_BASE_URL
        : (savedBaseUrl ?? provider.baseUrl);

    return {
      ...provider,
      name: provider.name,
      baseUrl: restoredBaseUrl,
      endpoint:
        provider.id === 'img-imagen' && /imagen-3\.0-generate-002/.test(String(item.endpoint || ''))
          ? provider.endpoint
          : provider.id === 'img-ideogram' && /ideogram-v3/.test(String(item.endpoint || ''))
            ? provider.endpoint
            : (str(item.endpoint) ?? provider.endpoint),
      authType: item.authType ?? provider.authType,
      // Built-in provider geography is canonical product metadata. Do not let
      // stale local storage silently move an official platform to another group.
      region: provider.region,
      accent: str(item.accent) ?? provider.accent,
      status: provider.status,
      canGenerate: provider.canGenerate,
      disabledModelKinds: provider.disabledModelKinds
        ? [...provider.disabledModelKinds]
        : undefined,
      modelDiscovery: provider.modelDiscovery,
      bestFor: provider.bestFor,
      note: provider.note,
      summary: provider.summary,
      enabled: item.enabled !== false,
      verifiedAt: undefined,
      lastVerifiedAt,
      configValidatedAt,
      cliStatus: cliStatusSnapshot(item.cliStatus, lastVerifiedAt ?? legacyVerifiedAt),
      cliConfig: cliConfig(item.cliConfig, provider.cliConfig),
      apiKey: '', // real key lives in the encrypted vault
      models: {
        chat: chatModels,
        image: migratedImageModels,
        video:
          provider.protocol === 'jimeng'
            ? jimengVideoModelsForVipAccess(savedJimengHasVipAccess)
            : strings(item.models?.video).length
              ? strings(item.models?.video)
              : provider.models.video,
        audio: strings(item.models?.audio).length
          ? strings(item.models?.audio)
          : (provider.models.audio ?? []),
        '3d': strings(item.models?.['3d']).length
          ? strings(item.models?.['3d'])
          : (provider.models['3d'] ?? []),
      },
      modelCapabilities,
      modelReasoningEfforts: Object.fromEntries(
        Object.entries({ ...(provider.modelReasoningEfforts || {}), ...savedEfforts }).filter(
          ([, effort]) =>
            ['auto', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(String(effort)),
        ),
      ) as Record<string, ProviderReasoningEffort>,
    };
  });
  for (const item of saved) {
    const id = String(item.id || '').trim();
    if (!id || restored.some((provider) => provider.id === id) || !item.custom) continue;
    const category = (['text', 'image', 'cli'] as const).includes(item.category as ProviderCategory)
      ? (item.category as ProviderCategory)
      : 'text';
    const protocol = providerProtocol(item.protocol, category === 'cli' ? 'cli' : 'openai');
    const legacyVerifiedAt = savedTimestamp(item.verifiedAt);
    const storedLastVerifiedAt = savedTimestamp(item.lastVerifiedAt);
    const savedConnectionAt = storedLastVerifiedAt ?? legacyVerifiedAt;
    const modelDiscovery = item.modelDiscovery === 'fixed' ? 'fixed' : 'remote';
    const configValidatedAt =
      savedTimestamp(item.configValidatedAt) ??
      (modelDiscovery === 'fixed' ? savedConnectionAt : undefined);
    const lastVerifiedAt = modelDiscovery === 'fixed' ? undefined : savedConnectionAt;
    restored.push({
      id,
      name: String(item.name || id),
      mark: String(item.mark || 'API').slice(0, 3),
      protocol,
      category,
      baseUrl: String(item.baseUrl || ''),
      apiKey: '',
      enabled: item.enabled !== false,
      verifiedAt: undefined,
      lastVerifiedAt,
      configValidatedAt,
      cliStatus: cliStatusSnapshot(item.cliStatus, lastVerifiedAt ?? legacyVerifiedAt),
      custom: true,
      region:
        item.region === '海外' || item.region === '国内' || item.region === '通用'
          ? item.region
          : '通用',
      models: {
        chat: strings(item.models?.chat),
        image: strings(item.models?.image),
        video: strings(item.models?.video),
        audio: strings(item.models?.audio),
        '3d': strings(item.models?.['3d']),
      },
      endpoint: str(item.endpoint),
      authType: imageAuthType(item.authType),
      accent: str(item.accent),
      status: str(item.status),
      canGenerate: typeof item.canGenerate === 'boolean' ? item.canGenerate : undefined,
      disabledModelKinds: Array.isArray(item.disabledModelKinds)
        ? item.disabledModelKinds.filter(
            (kind): kind is ProviderModelKind =>
              kind === 'chat' ||
              kind === 'image' ||
              kind === 'video' ||
              kind === 'audio' ||
              kind === '3d',
          )
        : undefined,
      modelDiscovery,
      bestFor: strings(item.bestFor),
      summary: str(item.summary),
      note: str(item.note),
      strength: str(item.strength),
      access: str(item.access),
      docsUrl: str(item.docsUrl),
      modelCapabilities: (() => {
        const capabilities = parseProviderModelCapabilities(item.modelCapabilities);
        return Object.keys(capabilities).length ? capabilities : undefined;
      })(),
      modelReasoningEfforts:
        item.modelReasoningEfforts && typeof item.modelReasoningEfforts === 'object'
          ? (item.modelReasoningEfforts as Record<string, ProviderReasoningEffort>)
          : undefined,
      cliConfig: cliConfig(item.cliConfig),
    });
  }
  return restored;
}

export function classifyProviderModel(model: string): ProviderModelKind {
  const value = model.toLowerCase();
  const videoKeys = [
    'veo',
    'sora',
    'wan2',
    'wanx',
    'seedance',
    'kling',
    'hailuo',
    'video',
    't2v-',
    'i2v-',
    's2v',
  ];
  if (videoKeys.some((key) => value.includes(key))) return 'video';
  const imageKeys = [
    'banana',
    'image',
    'dalle',
    'dall-e',
    'imagen',
    'flux',
    'stable',
    'sdxl',
    'midjourney',
    'ideogram',
    'z-image',
    'seedream',
    'text-to-image',
    'recraft',
  ];
  if (imageKeys.some((key) => value.includes(key))) return 'image';
  const audioKeys = [
    'audio',
    'music',
    'song',
    'speech',
    'tts',
    'text-to-speech',
    'seed-music',
    'seed-audio',
  ];
  if (audioKeys.some((key) => value.includes(key))) return 'audio';
  return 'chat';
}

export function isCliProtocol(
  protocol: unknown,
): protocol is Extract<
  ProviderProtocol,
  | 'volcengine-cli'
  | 'jimeng'
  | 'codex'
  | 'codebuddy'
  | 'gemini-cli'
  | 'bailian'
  | 'lightx2v'
  | 'comfyui'
  | 'cli'
> {
  return (
    protocol === 'volcengine-cli' ||
    protocol === 'jimeng' ||
    protocol === 'codex' ||
    protocol === 'codebuddy' ||
    protocol === 'gemini-cli' ||
    protocol === 'bailian' ||
    protocol === 'lightx2v' ||
    protocol === 'comfyui' ||
    protocol === 'cli'
  );
}

export function isManagedBridgeCliProtocol(
  protocol: unknown,
): protocol is Extract<
  ProviderProtocol,
  'volcengine-cli' | 'jimeng' | 'codex' | 'codebuddy' | 'gemini-cli' | 'bailian' | 'lightx2v'
> {
  return (
    protocol === 'volcengine-cli' ||
    protocol === 'jimeng' ||
    protocol === 'codex' ||
    protocol === 'codebuddy' ||
    protocol === 'gemini-cli' ||
    protocol === 'bailian' ||
    protocol === 'lightx2v'
  );
}

export type AvailableProviderModel = {
  key: string;
  providerId: string;
  providerName: string;
  providerMark?: string;
  providerAccent?: string;
  providerRegion?: ProviderConnection['region'];
  model: string;
  displayName: string;
  label: string;
  /** Registry-known safe default, such as Codex automatic model routing. */
  recommended: boolean;
  /** Undefined means unknown, rather than text-only. */
  inputModalities?: ProviderInputModality[];
  /** True only for explicit source-video reference support; false or missing requires fallback. */
  videoReferenceInput?: boolean;
  /** Undefined means video-mode support is unverified. */
  videoModes?: ProviderModelCapability['videoModes'];
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  maxOutputCount?: ProviderModelCapability['maxOutputCount'];
  videoOperations?: ProviderVideoOperation[];
};

function isRecommendedProviderModel(
  provider: ProviderConnection,
  kind: ProviderModelKind,
  model: string,
) {
  if (kind === 'video' && provider.protocol === 'comfyui') {
    return provider.models.video[0] === model;
  }
  if (kind !== 'chat') return false;
  if (provider.protocol === 'codex') return model === 'codex:default';
  if (provider.protocol === 'codebuddy') return model === 'workbuddy:auto';
  if (provider.protocol === 'gemini-cli') {
    return model === 'antigravity:auto' || model === 'gemini:auto';
  }
  return false;
}

function cliSupportsModelKind(provider: ProviderConnection, kind: ProviderModelKind) {
  if (!isCliProtocol(provider.protocol)) return true;
  if (provider.protocol === 'volcengine-cli') return false;
  if (provider.protocol === 'codex') return kind === 'chat' || kind === 'image';
  if (provider.protocol === 'codebuddy') return kind === 'chat' || kind === 'image';
  if (provider.protocol === 'gemini-cli') return kind === 'chat';
  if (provider.protocol === 'jimeng') return kind === 'image' || kind === 'video';
  if (provider.protocol === 'bailian' || provider.protocol === 'lightx2v')
    return kind === 'image' || kind === 'video';
  if (provider.protocol === 'comfyui')
    return kind === 'image' || kind === 'video' || kind === 'audio' || kind === '3d';
  return false;
}

/**
 * Whether the canvas has an executable request adapter for this provider kind.
 * Audio and 3D are executable only where a provider-specific adapter declares them.
 */
export function providerHasModelAdapter(
  provider: ProviderConnection,
  kind: ProviderModelKind,
): boolean {
  if (kind === 'audio' || kind === '3d') return provider.protocol === 'comfyui';
  return cliSupportsModelKind(provider, kind);
}

/**
 * Models whose unchanged connection can serve the requested node type. Remote
 * catalogs require a real probe; fixed catalogs require explicit structural
 * validation and defer credential acceptance to their first paid generation.
 */
export function availableProviderModels(
  connections: ProviderConnection[],
  kind: ProviderModelKind,
): AvailableProviderModel[] {
  const seen = new Set<string>();
  const choices: AvailableProviderModel[] = [];
  for (const provider of connections) {
    if (
      !provider.enabled ||
      !isProviderConnectionUsable(provider) ||
      provider.canGenerate === false ||
      provider.disabledModelKinds?.includes(kind) ||
      !providerHasModelAdapter(provider, kind)
    ) {
      continue;
    }
    if (provider.protocol === 'jimeng' && provider.cliStatus?.hasVipAccess !== true) continue;
    for (const rawModel of provider.models[kind] ?? []) {
      const model = rawModel.trim();
      if (!model) continue;
      const key = `${provider.id}\u0000${model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const capability = provider.modelCapabilities?.[model];
      const displayName = capability?.displayName?.trim() || model;
      choices.push({
        key,
        providerId: provider.id,
        providerName: provider.name,
        providerMark: provider.mark,
        providerAccent: provider.accent,
        providerRegion: provider.region,
        model,
        displayName,
        label: `${provider.name} · ${displayName}`,
        recommended: isRecommendedProviderModel(provider, kind, model),
        inputModalities: capability?.inputModalities ? [...capability.inputModalities] : undefined,
        videoReferenceInput: capability?.videoReferenceInput,
        videoModes: capability?.videoModes ? [...capability.videoModes] : undefined,
        maxReferenceImages: capability?.maxReferenceImages,
        maxReferenceVideos: capability?.maxReferenceVideos,
        maxReferenceAudios: capability?.maxReferenceAudios,
        maxOutputCount: capability?.maxOutputCount,
        videoOperations: capability?.videoOperations ? [...capability.videoOperations] : undefined,
      });
    }
  }
  return choices;
}

/**
 * Models backed by a connection verified in the current app runtime.
 *
 * This is intentionally stricter than `availableProviderModels`: persisted
 * connection history may keep canvas model choices stable across a reload,
 * but an interactive assistant must not advertise or execute a provider until
 * the current runtime has confirmed that it can actually serve requests.
 */
export function connectedProviderModels(
  connections: ProviderConnection[],
  kind: ProviderModelKind,
): AvailableProviderModel[] {
  const verifiedProviderIds = new Set(
    connections.filter(isProviderConnectionVerified).map((provider) => provider.id),
  );
  return availableProviderModels(connections, kind).filter((model) =>
    verifiedProviderIds.has(model.providerId),
  );
}

type LocalCliHealth = {
  tools?: Record<string, boolean>;
  capabilities?: Record<
    string,
    { imageGeneration?: boolean; imageEditing?: boolean; videoGeneration?: boolean }
  >;
  sessions?: Record<
    string,
    {
      installed?: boolean;
      runnable?: boolean;
      running?: boolean;
      cliKind?: string;
      authenticated?: boolean;
      loggedIn?: boolean;
      ready?: boolean;
      state?: ProviderCliStatusSnapshot['state'];
      reasonCode?: string;
      imageGeneration?: boolean;
      imageEditing?: boolean;
      videoGeneration?: boolean;
      hasVipAccess?: boolean;
      version?: string;
      commandPath?: string;
      message?: string;
      models?:
        | Array<{
            slug?: string;
            displayName?: string;
            defaultReasoningEffort?: string;
            reasoningEfforts?: string[];
            inputModalities?: string[];
          }>
        | { image?: string[]; video?: string[] };
    }
  >;
};

/**
 * Built-in CLI adapters always run through the Bridge that served the current
 * application page. A persisted provider URL is only historical display data:
 * using it for health checks makes a valid CLI look disconnected after the
 * user switches between localhost, 127.0.0.1, the development proxy or a LAN
 * host.
 */
function cliBridgeBase() {
  return BRIDGE_BASE_URL;
}

/** Refresh local CLI capability metadata so node model selectors work without reopening settings. */
export async function refreshLocalCliConnections(
  connections: ProviderConnection[],
  signal?: AbortSignal,
): Promise<ProviderConnection[]> {
  let next = connections;
  const comfyUiProviders = connections.filter(
    (provider) =>
      provider.enabled &&
      provider.protocol === 'comfyui' &&
      provider.id === COMFYUI_LOCAL_PROVIDER_ID &&
      provider.canGenerate !== false &&
      (provider.models.image.length > 0 ||
        provider.models.video.length > 0 ||
        Boolean(provider.lastVerifiedAt)),
  );
  const probedProviderIds = new Set(
    connections
      .filter(
        (provider) =>
          provider.enabled &&
          isCliProtocol(provider.protocol) &&
          provider.canGenerate !== false &&
          (provider.protocol !== 'comfyui' ||
            comfyUiProviders.some((item) => item.id === provider.id)),
      )
      .map((provider) => provider.id),
  );
  // A settings-page force probe may finish while this background request is
  // in flight. Only commit an observation if nobody has changed that
  // provider's runtime state since this request began.
  const startingRuntimeRevisions = new Map(
    Array.from(probedProviderIds, (providerId) => [
      providerId,
      runtimeProviderRevision(providerId),
    ]),
  );
  for (const provider of connections.filter(
    (item) =>
      item.protocol === 'lightx2v' &&
      item.enabled &&
      Boolean(
        item.cliConfig?.executablePath &&
        ((item.cliConfig.imageModelPath &&
          item.cliConfig.imageModelClass &&
          item.cliConfig.imageTask &&
          item.cliConfig.imageConfigPath) ||
          (item.cliConfig.videoModelPath &&
            item.cliConfig.videoModelClass &&
            item.cliConfig.videoTask &&
            item.cliConfig.videoConfigPath)),
      ),
  )) {
    const checkedAt = Date.now();
    try {
      const query = new URLSearchParams({ tool: 'lightx2v' });
      const bridgeBase = cliBridgeBase();
      const saved = await fetch(`${bridgeBase}/lightx2v/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: provider.cliConfig ?? {} }),
        signal,
      });
      if (!saved.ok) throw new Error('LightX2V runtime configuration save failed');
      const response = await fetch(`${bridgeBase}/cli/status?${query.toString()}`, { signal });
      if (!response.ok) throw new Error('LightX2V runtime probe failed');
      const health = (await response.json()) as LocalCliHealth;
      const session = health.sessions?.lightx2v ?? {};
      const installed = Boolean(health.tools?.lightx2v ?? session.installed);
      const ready = Boolean(
        installed &&
        session.runnable === true &&
        session.authenticated === true &&
        session.ready === true,
      );
      const cliStatus: ProviderCliStatusSnapshot = {
        installed,
        runnable: session.runnable,
        authenticated: session.authenticated,
        ready,
        state: session.state ?? (ready ? 'ready' : installed ? 'error' : 'unavailable'),
        reasonCode: String(session.reasonCode || '').trim() || undefined,
        imageGeneration: Boolean(
          health.capabilities?.lightx2v?.imageGeneration ?? session.imageGeneration,
        ),
        imageEditing: Boolean(health.capabilities?.lightx2v?.imageEditing ?? session.imageEditing),
        videoGeneration: Boolean(
          health.capabilities?.lightx2v?.videoGeneration ?? session.videoGeneration,
        ),
        version: String(session.version || '').trim(),
        commandPath: String(session.commandPath || '').trim(),
        message: String(session.message || 'LightX2V 检测完成。').trim(),
        checkedAt,
      };
      const advertised = session.models && !Array.isArray(session.models) ? session.models : {};
      next = next.map((item) =>
        item.id === provider.id
          ? {
              ...item,
              verifiedAt: ready ? checkedAt : undefined,
              lastVerifiedAt: ready ? checkedAt : undefined,
              cliStatus,
              models: {
                chat: [],
                image: cliStatus.imageGeneration ? (advertised.image ?? item.models.image) : [],
                video: cliStatus.videoGeneration ? (advertised.video ?? item.models.video) : [],
              },
            }
          : item,
      );
    } catch {
      if (signal?.aborted) return next;
      next = next.map((item) =>
        item.id === provider.id
          ? {
              ...item,
              verifiedAt: undefined,
              lastVerifiedAt: item.verifiedAt ?? item.lastVerifiedAt,
            }
          : item,
      );
    }
  }
  const hasManagedCliProvider = connections.some(
    (provider) =>
      provider.enabled &&
      provider.protocol !== 'lightx2v' &&
      isManagedBridgeCliProtocol(provider.protocol) &&
      provider.canGenerate !== false,
  );
  const bases = hasManagedCliProvider ? [cliBridgeBase()] : [];

  for (const base of bases) {
    try {
      const response = await fetch(`${base}/health?scope=models`, { signal });
      if (!response.ok) {
        next = next.map((provider) =>
          isManagedBridgeCliProtocol(provider.protocol) &&
          provider.protocol !== 'lightx2v' &&
          provider.canGenerate !== false
            ? {
                ...provider,
                verifiedAt: undefined,
                lastVerifiedAt: provider.verifiedAt ?? provider.lastVerifiedAt,
              }
            : provider,
        );
        continue;
      }
      const health = (await response.json()) as LocalCliHealth;
      const checkedAt = Date.now();
      next = next.map((provider) => {
        if (
          !isManagedBridgeCliProtocol(provider.protocol) ||
          provider.protocol === 'lightx2v' ||
          provider.canGenerate === false
        ) {
          return provider;
        }
        const toolKey =
          provider.protocol === 'volcengine-cli'
            ? 'arkcli'
            : provider.protocol === 'codex'
              ? 'codex'
              : provider.protocol === 'codebuddy'
                ? 'codebuddy'
                : provider.protocol === 'gemini-cli'
                  ? 'gemini'
                  : provider.protocol === 'jimeng'
                    ? 'jimeng'
                    : provider.protocol === 'bailian'
                      ? 'bailian'
                      : '';
        if (!toolKey) {
          return { ...provider, verifiedAt: undefined, lastVerifiedAt: undefined };
        }
        const session = health.sessions?.[toolKey] ?? {};
        const installed = Boolean(health.tools?.[toolKey] ?? session.installed);
        const authenticated = Boolean(session.authenticated ?? session.loggedIn);
        const jimengVipBlocked = provider.protocol === 'jimeng' && session.hasVipAccess !== true;
        // `installed` and legacy `authenticated` fields are not execution
        // permission. Only the current bridge's explicit ready verdict can
        // enable a CLI provider and expose its models.
        const ready =
          installed &&
          session.runnable === true &&
          (provider.protocol !== 'codebuddy' || session.running === true) &&
          (provider.protocol !== 'gemini-cli' || session.cliKind === 'agy') &&
          !jimengVipBlocked &&
          authenticated &&
          session.ready === true;
        const cliStatus: ProviderCliStatusSnapshot = {
          installed,
          runnable: typeof session.runnable === 'boolean' ? session.runnable : undefined,
          running: typeof session.running === 'boolean' ? session.running : undefined,
          cliKind: typeof session.cliKind === 'string' ? session.cliKind.trim() : undefined,
          authenticated:
            typeof session.authenticated === 'boolean'
              ? session.authenticated
              : typeof session.loggedIn === 'boolean'
                ? session.loggedIn
                : undefined,
          ready,
          state:
            session.state ??
            (ready
              ? 'ready'
              : jimengVipBlocked
                ? 'installed'
                : installed
                  ? 'unauthenticated'
                  : 'unavailable'),
          reasonCode: jimengVipBlocked
            ? session.hasVipAccess === false
              ? 'vip_required'
              : 'vip_status_unknown'
            : String(session.reasonCode || '').trim() || undefined,
          imageGeneration: Boolean(
            health.capabilities?.[toolKey]?.imageGeneration ?? session.imageGeneration,
          ),
          imageEditing: Boolean(
            health.capabilities?.[toolKey]?.imageEditing ?? session.imageEditing,
          ),
          videoGeneration: Boolean(
            health.capabilities?.[toolKey]?.videoGeneration ?? session.videoGeneration,
          ),
          hasVipAccess:
            typeof session.hasVipAccess === 'boolean' ? session.hasVipAccess : undefined,
          version: String(session.version || '').trim(),
          commandPath: String(session.commandPath || '').trim(),
          message: String(
            session.message ||
              (jimengVipBlocked
                ? session.hasVipAccess === false
                  ? '即梦 CLI 已登录，但当前账号不是 VIP；不会在画布中显示即梦模型。'
                  : '即梦 CLI 已登录，但无法确认 VIP 权限；不会在画布中显示即梦模型。'
                : installed
                  ? '已检测到本机命令。'
                  : `未找到 ${provider.name}。`),
          ).trim(),
          checkedAt,
        };
        if (provider.protocol === 'jimeng') {
          const advertisedModels =
            session.models && !Array.isArray(session.models) ? session.models : undefined;
          const supportedImages = new Set(JIMENG_IMAGE_MODELS);
          const supportedVideos = new Set(JIMENG_VIDEO_MODELS);
          const imageModels = (
            Array.isArray(advertisedModels?.image)
              ? advertisedModels.image
              : [...JIMENG_IMAGE_MODELS]
          ).filter((model) => supportedImages.has(model));
          const videoModels = (
            Array.isArray(advertisedModels?.video)
              ? advertisedModels.video
              : [...JIMENG_VIDEO_MODELS]
          ).filter((model) => supportedVideos.has(model));
          return {
            ...provider,
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus,
            models: {
              chat: [],
              image: ready && cliStatus.imageGeneration ? imageModels : [],
              video: ready && cliStatus.videoGeneration ? videoModels : [],
            },
            modelCapabilities: ready ? { ...JIMENG_MODEL_CAPABILITIES } : {},
          };
        }
        if (provider.protocol === 'volcengine-cli') {
          return {
            ...provider,
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus,
            models: { chat: [], image: [], video: [] },
            modelCapabilities: {},
          };
        }
        if (provider.protocol === 'codebuddy') {
          const sessionModels = Array.isArray(session.models) ? session.models : [];
          const chatModels = Array.from(
            new Set([
              'workbuddy:auto',
              ...sessionModels
                .map((model) => String(model.slug || '').trim())
                .filter((model) => model && model !== 'auto')
                .map((model) => `workbuddy:${model}`),
            ]),
          );
          const modelCapabilities: NonNullable<ProviderConnection['modelCapabilities']> = {
            'workbuddy:auto': {
              displayName: 'WorkBuddy 自动选择',
              // CodeBuddy auto-routing can select the native multimodal Hy3
              // when an image is attached.
              inputModalities: ['text', 'image'],
            },
          };
          for (const model of sessionModels) {
            const slug = String(model.slug || '').trim();
            if (!slug || slug === 'auto') continue;
            const advertisedModalities = Array.from(
              new Set(
                (model.inputModalities ?? []).filter(
                  (modality): modality is 'text' | 'image' =>
                    modality === 'text' || modality === 'image',
                ),
              ),
            );
            modelCapabilities[`workbuddy:${slug}`] = {
              displayName: String(model.displayName || slug),
              // The bridge normally supplies modalities, but when it does
              // not, fall back to the same allow-list of known vision
              // models so the renderer can light up image support for
              // models that the CLI silently drops from its list.
              inputModalities:
                advertisedModalities.length > 0
                  ? advertisedModalities
                  : getCodeBuddyInputModalities(slug),
            };
          }
          const imageModels = cliStatus.imageGeneration ? ['workbuddy:$imagegen'] : [];
          return {
            ...provider,
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus,
            models: { chat: ready ? chatModels : [], image: ready ? imageModels : [], video: [] },
            modelCapabilities: ready
              ? {
                  ...modelCapabilities,
                  ...(imageModels.length
                    ? {
                        'workbuddy:$imagegen': {
                          displayName: 'CodeBuddy 图片生成',
                          inputModalities: ['text', 'image'],
                          maxReferenceImages: 1,
                          maxOutputCount: 1,
                        },
                      }
                    : {}),
                }
              : {},
          };
        }
        if (provider.protocol === 'bailian') {
          const advertisedModels =
            session.models && !Array.isArray(session.models) ? session.models : undefined;
          return {
            ...provider,
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus,
            models: {
              chat: [],
              image: cliStatus.imageGeneration
                ? (advertisedModels?.image ?? provider.models.image)
                : [],
              video: cliStatus.videoGeneration
                ? (advertisedModels?.video ?? provider.models.video)
                : [],
            },
          };
        }
        if (provider.protocol !== 'codex') {
          return {
            ...provider,
            verifiedAt: ready ? checkedAt : undefined,
            lastVerifiedAt: ready ? checkedAt : undefined,
            cliStatus,
          };
        }

        const sessionModels = Array.isArray(session.models) ? session.models : [];
        const chatModels = Array.from(
          new Set([
            ...sessionModels
              .map((model) => String(model.slug || '').trim())
              .filter(Boolean)
              .map((model) => `codex:${model}`),
            'codex:default',
          ]),
        );
        const imageGeneration = ready && Boolean(health.capabilities?.codex?.imageGeneration);
        const modelCapabilities: NonNullable<ProviderConnection['modelCapabilities']> = {
          'codex:default': {
            displayName: 'Codex 推荐模型',
            defaultReasoningEffort: 'medium',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            inputModalities: ['text', 'image'],
          },
        };
        for (const model of sessionModels) {
          const slug = String(model.slug || '').trim();
          if (!slug) continue;
          const efforts = (model.reasoningEfforts ?? []).filter((effort) =>
            ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(effort),
          ) as Array<'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'>;
          const fallbackEffort = efforts[0] ?? 'medium';
          const requestedDefault = model.defaultReasoningEffort as
            'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
          const inputModalities = Array.from(
            new Set(
              (model.inputModalities ?? []).filter(
                (modality): modality is ProviderInputModality =>
                  modality === 'text' || modality === 'image',
              ),
            ),
          );
          modelCapabilities[`codex:${slug}`] = {
            displayName: String(model.displayName || slug),
            defaultReasoningEffort: efforts.includes(requestedDefault)
              ? requestedDefault
              : fallbackEffort,
            reasoningEfforts: efforts,
            inputModalities,
          };
        }
        if (imageGeneration) {
          modelCapabilities['codex:$imagegen'] = {
            displayName: 'GPT Image',
            inputModalities: ['text', 'image'],
            maxReferenceImages: 5,
            maxReferenceVideos: 0,
            maxReferenceAudios: 0,
            maxOutputCount: 1,
          };
        }
        return {
          ...provider,
          verifiedAt: ready ? checkedAt : undefined,
          lastVerifiedAt: ready ? checkedAt : undefined,
          cliStatus,
          models: {
            chat: ready ? chatModels : [],
            image: imageGeneration ? ['codex:$imagegen'] : [],
            video: [],
          },
          modelCapabilities: ready ? modelCapabilities : {},
        };
      });
    } catch {
      if (signal?.aborted) return next;
      // Preserve the historical observation, but revoke live execution until
      // the bridge can complete another authoritative probe.
      next = next.map((provider) =>
        isManagedBridgeCliProtocol(provider.protocol) &&
        provider.protocol !== 'lightx2v' &&
        provider.canGenerate !== false
          ? {
              ...provider,
              verifiedAt: undefined,
              lastVerifiedAt: provider.verifiedAt ?? provider.lastVerifiedAt,
            }
          : provider,
      );
    }
  }
  for (const comfyProvider of comfyUiProviders) {
    try {
      const comfyStatus = await fetchComfyUiStatus(comfyProvider, signal);
      const checkedAt = Date.now();
      const discoveredImageWorkflowIds = comfyStatus.workflows
        .filter((workflow) => workflow.kind === 'image')
        .map((workflow) => workflow.id);
      const discoveredVideoWorkflowIds = comfyStatus.workflows
        .filter((workflow) => workflow.kind === 'video')
        .map((workflow) => workflow.id);
      const discoveredAudioWorkflowIds = comfyStatus.workflows
        .filter((workflow) => workflow.kind === 'audio')
        .map((workflow) => workflow.id);
      const discovered3dWorkflowIds = comfyStatus.workflows
        .filter((workflow) => workflow.kind === '3d')
        .map((workflow) => workflow.id);
      const modelCapabilities = Object.fromEntries(
        comfyStatus.workflows.map((workflow) => [
          workflow.id,
          comfyWorkflowModelCapability(workflow),
        ]),
      );
      const systemVersion = String(
        comfyStatus.system?.comfyui_version ?? comfyStatus.system?.version ?? '',
      ).trim();
      next = next.map((provider) => {
        if (provider.id !== comfyProvider.id) return provider;
        const ready = comfyStatus.ready;
        const imageWorkflowIds = [
          ...provider.models.image.filter((id) => discoveredImageWorkflowIds.includes(id)),
          ...discoveredImageWorkflowIds.filter((id) => !provider.models.image.includes(id)),
        ];
        const videoWorkflowIds = [
          ...provider.models.video.filter((id) => discoveredVideoWorkflowIds.includes(id)),
          ...discoveredVideoWorkflowIds.filter((id) => !provider.models.video.includes(id)),
        ];
        const audioWorkflowIds = [
          ...(provider.models.audio ?? []).filter((id) => discoveredAudioWorkflowIds.includes(id)),
          ...discoveredAudioWorkflowIds.filter((id) => !(provider.models.audio ?? []).includes(id)),
        ];
        const model3dWorkflowIds = [
          ...(provider.models['3d'] ?? []).filter((id) => discovered3dWorkflowIds.includes(id)),
          ...discovered3dWorkflowIds.filter((id) => !(provider.models['3d'] ?? []).includes(id)),
        ];
        const workflowCount =
          imageWorkflowIds.length +
          videoWorkflowIds.length +
          audioWorkflowIds.length +
          model3dWorkflowIds.length;
        const cliStatus: ProviderCliStatusSnapshot = {
          installed: ready,
          runnable: ready,
          authenticated: ready,
          ready,
          state: ready ? 'ready' : 'unavailable',
          reasonCode: ready ? undefined : 'comfyui_unavailable',
          imageGeneration: ready && imageWorkflowIds.length > 0,
          imageEditing: false,
          videoGeneration: ready && videoWorkflowIds.length > 0,
          version: systemVersion,
          commandPath: provider.baseUrl,
          message: ready
            ? workflowCount
              ? `ComfyUI 已连接，已载入 ${workflowCount} 个图片、视频、音频或 3D 工作流。`
              : 'ComfyUI 已连接，请导入图片、视频、音频或 3D 工作流 JSON。'
            : comfyStatus.error ||
              (isRemoteComfyUiProvider(comfyProvider)
                ? '画布桥已启动，但未能连接远程 ComfyUI。'
                : '画布桥已启动，但未能连接本机 ComfyUI。'),
          checkedAt,
        };
        return {
          ...provider,
          verifiedAt: ready ? checkedAt : undefined,
          lastVerifiedAt: ready ? checkedAt : undefined,
          cliStatus,
          models: {
            chat: [],
            image: imageWorkflowIds,
            video: videoWorkflowIds,
            audio: audioWorkflowIds,
            '3d': model3dWorkflowIds,
          },
          modelCapabilities,
        };
      });
    } catch {
      if (signal?.aborted) return next;
      next = next.map((provider) =>
        provider.id === comfyProvider.id
          ? {
              ...provider,
              verifiedAt: undefined,
              lastVerifiedAt: provider.verifiedAt ?? provider.lastVerifiedAt,
            }
          : provider,
      );
    }
  }
  for (const provider of next) {
    if (!probedProviderIds.has(provider.id)) continue;
    if (runtimeProviderRevision(provider.id) !== (startingRuntimeRevisions.get(provider.id) ?? 0)) {
      continue;
    }
    rememberRuntimeProvider(provider);
  }
  return next;
}

/* ── Provider model discovery ──
 * URL helpers remain public for compatibility and contract tests. Actual
 * discovery is proxied by the local bridge so provider CORS policy cannot turn
 * a valid API key into a false failure in the settings UI. */

export function modelsUrl(baseUrl: string, protocol: ProviderProtocol) {
  const base = safeProviderBaseUrl(baseUrl);
  if (protocol === 'deepseek') return `${base}/models`;
  if (protocol === 'volcengine') {
    return /\/api\/v3$/i.test(base) ? `${base}/models` : `${base}/api/v3/models`;
  }
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function safeProviderBaseUrl(
  baseUrl: string,
  currentBridgeBaseUrl: string = BRIDGE_BASE_URL,
): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error('API Base URL 格式无效。');
  }
  if (url.username || url.password) throw new Error('API Base URL 不能包含用户名或密码。');
  const allowedHttp =
    url.protocol === 'http:' &&
    (isLoopbackHost(url.hostname) || isCurrentBridgeUrl(url.toString(), currentBridgeBaseUrl));
  if (url.protocol !== 'https:' && !allowedHttp) {
    throw new Error('API Base URL 必须使用 HTTPS；仅本机回环地址或当前画布桥允许 HTTP。');
  }
  return url.toString().replace(/\/$/, '');
}

export type FetchedModels = {
  chatModels: string[];
  imageModels: string[];
  videoModels: string[];
  audioModels: string[];
  message: string;
};

/**
 * Apply discovery without deleting administrator-entered fallbacks or leaking
 * another capability into an image-only settings entry.
 */
export function mergeDiscoveredProviderModels(
  provider: Pick<ProviderConnection, 'category' | 'models' | 'disabledModelKinds'>,
  discovered: Pick<FetchedModels, 'chatModels' | 'imageModels' | 'videoModels'> &
    Partial<Pick<FetchedModels, 'audioModels'>>,
): ProviderModels {
  const next: ProviderModels = {
    chat: [...provider.models.chat],
    image: [...provider.models.image],
    video: [...provider.models.video],
    audio: [...(provider.models.audio ?? [])],
    '3d': [...(provider.models['3d'] ?? [])],
  };
  const allowedKinds: ProviderModelKind[] =
    provider.category === 'image'
      ? ['image']
      : provider.category === 'text'
        ? ['chat', 'image', 'video', 'audio', '3d']
        : [];
  const discoveredByKind: Record<ProviderModelKind, string[]> = {
    chat: discovered.chatModels,
    image: discovered.imageModels,
    video: discovered.videoModels,
    audio: discovered.audioModels ?? [],
    '3d': [],
  };
  for (const kind of allowedKinds) {
    if (provider.disabledModelKinds?.includes(kind)) continue;
    const models = Array.from(
      new Set(discoveredByKind[kind].map((model) => model.trim()).filter(Boolean)),
    );
    if (models.length) next[kind] = models;
  }
  return next;
}

export function validateFixedProviderConfiguration(
  provider: Pick<
    ProviderConnection,
    'apiKey' | 'baseUrl' | 'endpoint' | 'models' | 'canGenerate' | 'category'
  >,
): string {
  if (provider.canGenerate === false) throw new Error('该平台当前不提供画布生成能力。');
  if (!provider.apiKey.trim()) throw new Error('请先填写 API Key。');
  if (provider.category !== 'image') throw new Error('该模型配置类型不受支持。');
  const endpoint = String(provider.endpoint || '').trim();
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('\\')) {
    throw new Error('图片接口路径必须是以单个 / 开头的相对路径。');
  }
  if (/\bPROJECT_ID\b/.test(endpoint)) {
    throw new Error('请先把 Imagen 接口路径中的 PROJECT_ID 替换为真实 Google Cloud 项目 ID。');
  }
  if (!provider.models.image.some((model) => model.trim()))
    throw new Error('请至少填写一个图片模型。');
  return '配置格式有效；该平台没有官方模型目录，API Key 将在首次图片生成时由上游验证。';
}

export function providerAuthHeaders(
  provider: Pick<ProviderConnection, 'apiKey' | 'authType'>,
): Record<string, string> {
  const apiKey = provider.apiKey.trim();
  if (!apiKey) return { Accept: 'application/json' };
  if (provider.authType === 'api-key') return { Accept: 'application/json', 'api-key': apiKey };
  if (provider.authType === 'x-key') return { Accept: 'application/json', 'x-key': apiKey };
  return { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };
}

export async function fetchProviderModels(
  provider: Pick<ProviderConnection, 'baseUrl' | 'apiKey' | 'protocol' | 'authType'>,
): Promise<FetchedModels> {
  if (isCliProtocol(provider.protocol)) {
    throw new Error(
      'CLI 模型由本地桥（项目根目录 local-bridge.mjs）提供，不经 API Key 拉取。请先双击根目录的“打开Qiansi-Canvas.bat”启动本地桥，再到 CLI 详情卡点“重新检测”读取本机可用模型。',
    );
  }
  const baseUrl = safeProviderBaseUrl(provider.baseUrl);
  const parsedBaseUrl = new URL(baseUrl);
  if (isLoopbackHost(parsedBaseUrl.hostname)) {
    const authorization = await fetch(resolveBridgeUrl('/trusted-local-providers'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: parsedBaseUrl.origin }),
    });
    if (!authorization.ok) {
      const payload = (await authorization.json().catch(() => ({}))) as Record<string, unknown>;
      const error =
        payload.error && typeof payload.error === 'object'
          ? String((payload.error as Record<string, unknown>).message || '')
          : '';
      throw new Error(error || `本机 Provider 持久授权失败（HTTP ${authorization.status}）。`);
    }
  }
  const response = await fetch(resolveBridgeUrl('/api/provider/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl,
      protocol: provider.protocol,
      authType: provider.authType,
      apiKey: provider.apiKey,
    }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const raw = await response.json();
      const object = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      detail =
        object.error && typeof object.error === 'object'
          ? String((object.error as Record<string, unknown>).message || '')
          : String(object.error || object.message || '');
    } catch {
      /* ignore */
    }
    throw new Error(detail || `模型检测桥返回 HTTP ${response.status}。`);
  }
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .filter((model): model is string => typeof model === 'string')
              .map((model) => model.trim())
              .filter(Boolean),
          ),
        )
      : [];
  const chatModels = strings(raw.chatModels);
  const imageModels = strings(raw.imageModels);
  const videoModels = strings(raw.videoModels);
  const audioModels = strings(raw.audioModels);
  const total = chatModels.length + imageModels.length + videoModels.length + audioModels.length;
  if (!total) {
    throw new Error(
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message
        : '上游没有返回可用于对话、图片、视频或音频生成的模型；原有手动模型未被覆盖。',
    );
  }
  return {
    chatModels,
    imageModels,
    videoModels,
    audioModels,
    message:
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message
        : `连接成功，找到 ${total} 个可生成模型。`,
  };
}

export function loadProviderConnections(): ProviderConnection[] {
  try {
    const raw =
      localStorage.getItem(PROVIDER_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_PROVIDER_STORAGE_KEY);
    if (localStorage.getItem(PROVIDER_STORAGE_KEY) === null && raw !== null) {
      localStorage.setItem(PROVIDER_STORAGE_KEY, raw);
    }
    const restored = raw
      ? restoreProviderConnections(JSON.parse(raw))
      : createDefaultProviderConnections();
    return restored.map(currentRuntimeProvider);
  } catch {
    return createDefaultProviderConnections();
  }
}

export function saveProviderConnections(connections: ProviderConnection[]) {
  // NEVER persist the plaintext key: strip it and let the encrypted vault
  // (keyVault.ts) own the real secret. The stored config is therefore safe to
  // inspect, copy, or export.
  rememberRuntimeProviders(connections);
  const stripped = connections.map((connection) => {
    return {
      ...connection,
      apiKey: '',
      verifiedAt: undefined,
      lastVerifiedAt: connection.verifiedAt ?? connection.lastVerifiedAt,
      configValidatedAt: connection.configValidatedAt,
    };
  });
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(stripped));
  window.dispatchEvent(new Event(PROVIDER_CONNECTIONS_CHANGED_EVENT));
}
