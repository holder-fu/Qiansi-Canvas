import { resolveBridgeUrl } from './bridgeUrl';

export type ComfyWorkflowSummary = {
  id: string;
  name: string;
  modes: string[];
  kind: 'image' | 'video' | 'audio' | '3d';
  /** Missing only when talking to an older canvas bridge. */
  supportsVideoReference?: boolean;
  /** The workflow exposes a replaceable audio loader binding. */
  supportsAudioReference?: boolean;
  /** The workflow exposes at least one replaceable image loader binding. */
  supportsImageReference?: boolean;
  defaultPrompt: string;
  compatibility?: ComfyWorkflowCompatibility;
  importFingerprint?: ComfyWorkflowImportFingerprint;
  lastValidation?: ComfyWorkflowLastValidation;
};

export type ComfyWorkflowImportFingerprint = {
  schemaVersion: 1;
  sourceFormat: 'api' | 'layout';
  sourceVersion: 'api' | 'legacy' | '0.4' | '1.0';
  workflowHash: string;
  nodeSignatureHash: string;
  nodePackages: Array<{ id: string; version?: string }>;
  modelDependencies: Array<{ name: string; input?: string; directory?: string; url?: string }>;
};

export type ComfyWorkflowLastValidation = {
  fingerprint: string;
  backendVersion: string;
  nodeRegistryHash: string;
  featureHash: string;
  status: 'compatible' | 'incompatible' | 'unchecked';
  checkedAt: number;
};

export type ComfyWorkflowCompatibilityIssue = {
  nodeId: string;
  classType: string;
  input: string;
  expected?: string;
  actual?: string;
  value?: string;
};

export type ComfyWorkflowCompatibility = {
  status: 'compatible' | 'incompatible' | 'unchecked';
  message: string;
  missingNodeClasses: string[];
  missingInputs: ComfyWorkflowCompatibilityIssue[];
  unknownInputs: ComfyWorkflowCompatibilityIssue[];
  typeMismatches: ComfyWorkflowCompatibilityIssue[];
  missingModels: ComfyWorkflowCompatibilityIssue[];
};

export type LocalComfyUiStatus = {
  ready: boolean;
  error?: string;
  system?: Record<string, unknown>;
  workflows: ComfyWorkflowSummary[];
};

export type ComfyUiConnectionConfig = {
  id: 'comfyui-local' | 'comfyui-remote' | string;
  baseUrl: string;
  apiKey?: string;
  authType?: 'bearer' | 'api-key' | 'x-key';
};

export type ComfyModelDependency = {
  name: string;
  input: string;
  relativePath: string;
  downloadUrl?: string;
};

export type ComfyWorkflowDependencyAnalysis = {
  nodeClasses: string[];
  models: ComfyModelDependency[];
  downloadableModels: number;
};

export type ParsedComfyWorkflowJson = {
  workflow: Record<string, unknown>;
  sourceFormat: 'api' | 'layout';
  sourceVersion: 'api' | 'legacy' | '0.4' | '1.0';
  sourceMetadata: ComfyWorkflowSourceMetadata;
};

export type ComfyWorkflowSourceMetadata = {
  nodePackages: Array<{ id: string; version?: string }>;
  models: Array<{ name: string; directory?: string; url?: string }>;
};

const MAX_WORKFLOW_JSON_LENGTH = 5 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const MODEL_DIRECTORIES: Record<string, string> = {
  ckpt_name: 'models/checkpoints',
  checkpoint_name: 'models/checkpoints',
  unet_name: 'models/diffusion_models',
  diffusion_model: 'models/diffusion_models',
  vae_name: 'models/vae',
  clip_name: 'models/text_encoders',
  clip_name1: 'models/text_encoders',
  clip_name2: 'models/text_encoders',
  clip_name3: 'models/text_encoders',
  text_encoder_name: 'models/text_encoders',
  lora_name: 'models/loras',
  control_net_name: 'models/controlnet',
  controlnet_name: 'models/controlnet',
  upscale_model: 'models/upscale_models',
  upscale_model_name: 'models/upscale_models',
  style_model_name: 'models/style_models',
  clip_vision_name: 'models/clip_vision',
  gligen_name: 'models/gligen',
  audio_encoder_name: 'models/audio_encoders',
  model_name: 'models',
};
const MODEL_FILE_RE = /\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx|engine)$/i;

function safeDownloadUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function modelName(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop()?.trim().slice(0, 240) ?? '';
}

function sourceText(value: unknown, maximum = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function comfySourceMetadata(source: Record<string, unknown>): ComfyWorkflowSourceMetadata {
  const packages = new Map<string, { id: string; version?: string }>();
  const models = new Map<string, { name: string; directory?: string; url?: string }>();
  const addPackage = (raw: unknown) => {
    const item = record(raw);
    if (!item) return;
    const id = sourceText(item.id ?? item.cnr_id ?? item.aux_id ?? item.package_id, 160);
    if (!id) return;
    const version = sourceText(item.version ?? item.ver, 80);
    packages.set(id.toLowerCase(), { id, ...(version ? { version } : {}) });
  };
  const addModel = (raw: unknown) => {
    const item = record(raw);
    if (!item) return;
    const name = sourceText(item.name ?? item.filename ?? item.file_name ?? item.path, 500);
    if (!name) return;
    const directory = sourceText(item.directory ?? item.relativePath ?? item.folder, 240);
    const url = safeDownloadUrl(item.url ?? item.download_url ?? item.downloadUrl);
    models.set(name.toLowerCase(), {
      name,
      ...(directory ? { directory } : {}),
      ...(url ? { url } : {}),
    });
  };
  for (const rawModel of Array.isArray(source.models) ? source.models.slice(0, 256) : []) {
    addModel(rawModel);
  }
  for (const rawNode of Array.isArray(source.nodes) ? source.nodes.slice(0, 2048) : []) {
    const node = record(rawNode);
    const properties = record(node?.properties);
    if (properties) {
      addPackage(properties);
      for (const rawModel of Array.isArray(properties.models)
        ? properties.models.slice(0, 64)
        : []) {
        addModel(rawModel);
      }
    }
  }
  return {
    nodePackages: [...packages.values()].sort((left, right) =>
      left.id.localeCompare(right.id, 'en'),
    ),
    models: [...models.values()].sort((left, right) => left.name.localeCompare(right.name, 'en')),
  };
}

function embeddedModelUrls(workflow: Record<string, unknown>): Map<string, string> {
  const result = new Map<string, string>();
  const stack: unknown[] = [workflow];
  let inspected = 0;
  while (stack.length && inspected < 100_000) {
    const value = stack.pop();
    inspected += 1;
    if (Array.isArray(value)) {
      stack.push(...value.slice(0, 2048));
      continue;
    }
    const item = record(value);
    if (!item) continue;
    const url = safeDownloadUrl(item.url ?? item.download_url ?? item.downloadUrl);
    const nameValue = item.name ?? item.filename ?? item.file_name ?? item.path;
    if (url && typeof nameValue === 'string') {
      const name = modelName(nameValue).toLowerCase();
      if (name && !result.has(name)) result.set(name, url);
    }
    stack.push(...Object.values(item).slice(0, 2048));
  }
  return result;
}

export function analyzeComfyWorkflowDependencies(
  workflow: Record<string, unknown>,
): ComfyWorkflowDependencyAnalysis {
  const nodeClasses = new Set<string>();
  const models = new Map<string, ComfyModelDependency>();
  const urls = embeddedModelUrls(workflow);

  for (const rawNode of Object.values(workflow)) {
    const node = record(rawNode);
    if (!node) continue;
    const classType =
      typeof node.class_type === 'string' ? node.class_type.trim().slice(0, 160) : '';
    if (!classType) continue;
    nodeClasses.add(classType);
    const inputs = record(node.inputs);
    if (!inputs) continue;
    for (const [input, rawValue] of Object.entries(inputs)) {
      if (typeof rawValue !== 'string') continue;
      const value = rawValue.trim();
      const relativePath = MODEL_DIRECTORIES[input.toLowerCase()];
      if (!value || (!relativePath && !MODEL_FILE_RE.test(value))) continue;
      const name = modelName(value);
      if (!name || /^(?:none|null|default)$/i.test(name)) continue;
      const key = `${relativePath ?? 'models'}\0${name.toLowerCase()}`;
      if (!models.has(key)) {
        models.set(key, {
          name,
          input,
          relativePath: relativePath ?? 'models',
          downloadUrl: urls.get(name.toLowerCase()),
        });
      }
    }
  }

  const sortedModels = [...models.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
  return {
    nodeClasses: [...nodeClasses].sort((left, right) => left.localeCompare(right, 'en')),
    models: sortedModels,
    downloadableModels: sortedModels.filter((model) => model.downloadUrl).length,
  };
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function createComfyDependencyPowerShell(
  workflow: Record<string, unknown>,
  analysis: ComfyWorkflowDependencyAnalysis,
): string {
  const workflowBase64 = utf8Base64(JSON.stringify(workflow));
  const downloadsBase64 = utf8Base64(
    JSON.stringify(
      analysis.models
        .filter((model) => model.downloadUrl)
        .map((model) => ({ url: model.downloadUrl, relativePath: model.relativePath })),
    ),
  );
  const unresolvedBase64 = utf8Base64(
    JSON.stringify(
      analysis.models.filter((model) => !model.downloadUrl).map((model) => model.name),
    ),
  );
  return `param([string]$Workspace = "")
$ErrorActionPreference = "Stop"
$workflowBase64 = "${workflowBase64}"
$downloadsBase64 = "${downloadsBase64}"
$unresolvedBase64 = "${unresolvedBase64}"

function Decode-Json([string]$Value) {
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
  return $text | ConvertFrom-Json
}

if (-not (Get-Command comfy -ErrorAction SilentlyContinue)) {
  throw "未找到官方 comfy CLI。请先在 ComfyUI 使用的 Python 环境运行：pip install comfy-cli"
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("qiansi-comfy-" + [Guid]::NewGuid().ToString("N"))
$workflowPath = Join-Path $tempRoot "workflow.json"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  [IO.File]::WriteAllBytes($workflowPath, [Convert]::FromBase64String($workflowBase64))
  $prefix = @()
  if ($Workspace) { $prefix += "--workspace=$Workspace" }

  Write-Host "[1/2] 使用官方 comfy CLI 解析并安装工作流节点依赖..." -ForegroundColor Cyan
  & comfy @prefix node install-deps --workflow $workflowPath --mode remote
  if ($LASTEXITCODE -ne 0) { throw "节点依赖安装失败，退出码：$LASTEXITCODE" }

  $downloads = @(Decode-Json $downloadsBase64)
  if ($downloads.Count -gt 0) {
    Write-Host "[2/2] 下载工作流中带有可信 URL 元数据的模型..." -ForegroundColor Cyan
    foreach ($item in $downloads) {
      & comfy @prefix model download --url ([string]$item.url) --relative-path ([string]$item.relativePath)
      if ($LASTEXITCODE -ne 0) { throw "模型下载失败，退出码：$LASTEXITCODE" }
    }
  } else {
    Write-Host "[2/2] JSON 中没有可验证的模型下载 URL，跳过自动模型下载。" -ForegroundColor Yellow
  }

  $unresolved = @(Decode-Json $unresolvedBase64)
  if ($unresolved.Count -gt 0) {
    Write-Host "以下模型只检测到文件名，JSON 没有下载地址，请从模型作者页面下载后放入对应目录：" -ForegroundColor Yellow
    $unresolved | ForEach-Object { Write-Host ("  - " + $_) }
  }
  Write-Host "依赖处理完成。请重启 ComfyUI，并检查启动日志是否存在 import failed 或 model not found。" -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

function workflowSummary(value: unknown): ComfyWorkflowSummary | undefined {
  const item = record(value);
  if (!item) return undefined;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!id || !name) return undefined;
  const modes = Array.isArray(item.modes)
    ? Array.from(
        new Set(
          item.modes
            .filter((mode): mode is string => typeof mode === 'string')
            .map((mode) => mode.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const defaultPrompt =
    typeof item.defaultPrompt === 'string' ? item.defaultPrompt.slice(0, 1_000_000) : '';
  const compatibility = workflowCompatibility(item.compatibility);
  const importFingerprint = workflowImportFingerprint(item.importFingerprint);
  const lastValidation = workflowLastValidation(item.lastValidation);
  return {
    id,
    name,
    modes,
    kind:
      item.kind === 'image' || item.kind === 'audio' || item.kind === '3d' ? item.kind : 'video',
    ...(typeof item.supportsVideoReference === 'boolean'
      ? { supportsVideoReference: item.supportsVideoReference }
      : {}),
    ...(typeof item.supportsAudioReference === 'boolean'
      ? { supportsAudioReference: item.supportsAudioReference }
      : {}),
    ...(typeof item.supportsImageReference === 'boolean'
      ? { supportsImageReference: item.supportsImageReference }
      : {}),
    defaultPrompt,
    ...(compatibility ? { compatibility } : {}),
    ...(importFingerprint ? { importFingerprint } : {}),
    ...(lastValidation ? { lastValidation } : {}),
  };
}

function sha256(value: unknown): string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : '';
}

function workflowImportFingerprint(value: unknown): ComfyWorkflowImportFingerprint | undefined {
  const item = record(value);
  if (!item || item.schemaVersion !== 1) return undefined;
  const sourceFormat =
    item.sourceFormat === 'layout' ? 'layout' : item.sourceFormat === 'api' ? 'api' : undefined;
  const sourceVersion =
    item.sourceVersion === 'api' ||
    item.sourceVersion === 'legacy' ||
    item.sourceVersion === '0.4' ||
    item.sourceVersion === '1.0'
      ? item.sourceVersion
      : undefined;
  const workflowHash = sha256(item.workflowHash);
  const nodeSignatureHash = sha256(item.nodeSignatureHash);
  if (!sourceFormat || !sourceVersion || !workflowHash || !nodeSignatureHash) return undefined;
  const nodePackages = Array.isArray(item.nodePackages)
    ? item.nodePackages
        .slice(0, 256)
        .map(record)
        .filter(Boolean)
        .map((entry) => ({
          id: String(entry?.id || '').slice(0, 160),
          ...(typeof entry?.version === 'string' ? { version: entry.version.slice(0, 80) } : {}),
        }))
        .filter((entry) => entry.id)
    : [];
  const modelDependencies = Array.isArray(item.modelDependencies)
    ? item.modelDependencies
        .slice(0, 512)
        .map(record)
        .filter(Boolean)
        .map((entry) => ({
          name: String(entry?.name || '').slice(0, 500),
          ...(typeof entry?.input === 'string' ? { input: entry.input.slice(0, 160) } : {}),
          ...(typeof entry?.directory === 'string'
            ? { directory: entry.directory.slice(0, 240) }
            : {}),
          ...(typeof entry?.url === 'string' ? { url: entry.url.slice(0, 2_000) } : {}),
        }))
        .filter((entry) => entry.name)
    : [];
  return {
    schemaVersion: 1,
    sourceFormat,
    sourceVersion,
    workflowHash,
    nodeSignatureHash,
    nodePackages,
    modelDependencies,
  };
}

function workflowLastValidation(value: unknown): ComfyWorkflowLastValidation | undefined {
  const item = record(value);
  if (!item) return undefined;
  const status =
    item.status === 'compatible' || item.status === 'incompatible' || item.status === 'unchecked'
      ? item.status
      : undefined;
  const fingerprint = sha256(item.fingerprint);
  if (!status || !fingerprint) return undefined;
  return {
    fingerprint,
    backendVersion:
      typeof item.backendVersion === 'string' ? item.backendVersion.slice(0, 160) : '',
    nodeRegistryHash: sha256(item.nodeRegistryHash),
    featureHash: sha256(item.featureHash),
    status,
    checkedAt:
      typeof item.checkedAt === 'number' &&
      Number.isSafeInteger(item.checkedAt) &&
      item.checkedAt >= 0
        ? item.checkedAt
        : 0,
  };
}

function workflowCompatibilityIssue(value: unknown): ComfyWorkflowCompatibilityIssue | undefined {
  const item = record(value);
  if (!item) return undefined;
  const nodeId = typeof item.nodeId === 'string' ? item.nodeId.slice(0, 160) : '';
  const classType = typeof item.classType === 'string' ? item.classType.slice(0, 160) : '';
  const input = typeof item.input === 'string' ? item.input.slice(0, 160) : '';
  if (!nodeId || !classType || !input) return undefined;
  return {
    nodeId,
    classType,
    input,
    ...(typeof item.expected === 'string' ? { expected: item.expected.slice(0, 160) } : {}),
    ...(typeof item.actual === 'string' ? { actual: item.actual.slice(0, 160) } : {}),
    ...(typeof item.value === 'string' ? { value: item.value.slice(0, 500) } : {}),
  };
}

function workflowCompatibility(value: unknown): ComfyWorkflowCompatibility | undefined {
  const item = record(value);
  if (!item) return undefined;
  const status =
    item.status === 'compatible' || item.status === 'incompatible' || item.status === 'unchecked'
      ? item.status
      : undefined;
  if (!status) return undefined;
  const issues = (raw: unknown) =>
    Array.isArray(raw) ? raw.slice(0, 64).map(workflowCompatibilityIssue).filter(Boolean) : [];
  return {
    status,
    message: typeof item.message === 'string' ? item.message.slice(0, 1000) : '',
    missingNodeClasses: Array.isArray(item.missingNodeClasses)
      ? item.missingNodeClasses
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.slice(0, 160))
          .slice(0, 64)
      : [],
    missingInputs: issues(item.missingInputs) as ComfyWorkflowCompatibilityIssue[],
    unknownInputs: issues(item.unknownInputs) as ComfyWorkflowCompatibilityIssue[],
    typeMismatches: issues(item.typeMismatches) as ComfyWorkflowCompatibilityIssue[],
    missingModels: issues(item.missingModels) as ComfyWorkflowCompatibilityIssue[],
  };
}

function workflows(value: unknown): ComfyWorkflowSummary[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ComfyWorkflowSummary[] = [];
  for (const raw of value.slice(0, 256)) {
    const workflow = workflowSummary(raw);
    if (!workflow || seen.has(workflow.id)) continue;
    seen.add(workflow.id);
    result.push(workflow);
  }
  return result;
}

function workflowNodeError(nodeId: string, node: unknown): string | undefined {
  const item = record(node);
  if (!item) {
    return `工作流中的节点「${nodeId}」格式不正确，应为 JSON 对象。请在 ComfyUI 中重新执行“工作流操作 → 导出（API）”。`;
  }
  if (typeof item.class_type !== 'string' || !item.class_type.trim()) {
    return `文件是 API 工作流结构，但节点「${nodeId}」缺少“节点类型（class_type）”，因此这份 API 导出不完整。请改选同名的普通 ComfyUI 工作流 JSON（包含 nodes / links），无限画布会自动转换；或在 ComfyUI 中修复该节点后重新导出 API。`;
  }
  if (!record(item.inputs)) {
    return `工作流中的节点「${nodeId}」缺少“输入参数（inputs）”。请在 ComfyUI 中重新执行“工作流操作 → 导出（API）”。`;
  }
  return undefined;
}

function isDisplayOnlyWorkflowPlaceholder(value: unknown): boolean {
  const node = record(value);
  if (!node || Object.hasOwn(node, 'class_type')) return false;
  const inputs = record(node.inputs);
  if (!inputs || Object.keys(inputs).length) return false;
  return Object.keys(node).every((key) => key === 'inputs' || key === '_meta');
}

function referencesWorkflowNode(value: unknown, nodeId: string): boolean {
  const node = record(value);
  const inputs = record(node?.inputs);
  if (!inputs) return false;
  return Object.values(inputs).some(
    (input) => Array.isArray(input) && String(input[0] ?? '') === nodeId,
  );
}

function removeUnreferencedDisplayOnlyPlaceholders(
  workflow: Record<string, unknown>,
): Record<string, unknown> {
  const placeholderIds = Object.entries(workflow)
    .filter(([, node]) => isDisplayOnlyWorkflowPlaceholder(node))
    .map(([nodeId]) => nodeId)
    .filter(
      (nodeId) =>
        !Object.entries(workflow).some(
          ([sourceNodeId, node]) => sourceNodeId !== nodeId && referencesWorkflowNode(node, nodeId),
        ),
    );
  if (!placeholderIds.length) return workflow;

  const sanitized = { ...workflow };
  for (const nodeId of placeholderIds) delete sanitized[nodeId];
  return sanitized;
}

function friendlyComfyWorkflowError(message: string): string {
  const classTypeMatch = /^workflow\.([^\s.]+)\.class_type must be a non-empty string$/.exec(
    message,
  );
  const classTypeNodeId = classTypeMatch?.[1];
  if (classTypeNodeId) return workflowNodeError(classTypeNodeId, {})!;
  const inputsMatch = /^workflow\.([^\s.]+)\.inputs must be a plain object$/.exec(message);
  const inputsNodeId = inputsMatch?.[1];
  if (inputsNodeId) {
    return `工作流中的节点「${inputsNodeId}」缺少有效的“输入参数（inputs）”。请在 ComfyUI 中重新执行“工作流操作 → 导出（API）”。`;
  }
  return message;
}

const UI_ONLY_WIDGET_TYPES = new Set(['IMAGEUPLOAD', 'VIDEOUPLOAD', 'AUDIOUPLOAD']);
const SEED_CONTROL_VALUES = new Set(['fixed', 'increment', 'decrement', 'randomize', 'reuse']);
type ComfyLayoutWorkflowVersion = 'legacy' | '0.4' | '1.0';

function comfyLayoutWorkflowVersion(layout: Record<string, unknown>): ComfyLayoutWorkflowVersion {
  if (layout.version === undefined || layout.version === null) return 'legacy';
  if (layout.version === 0.4) return '0.4';
  if (layout.version === 1) return '1.0';
  throw new Error(`不支持的 ComfyUI Workflow JSON 版本「${String(layout.version)}」。`);
}

function layoutNodeId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const id = String(value).trim();
  return id && id.length <= 256 ? id : '';
}

function layoutNodeTitle(node: Record<string, unknown>, classType: string): string {
  const title = typeof node.title === 'string' ? node.title.trim() : '';
  const properties = record(node.properties);
  const fallback =
    typeof properties?.['Node name for S&R'] === 'string'
      ? properties['Node name for S&R'].trim()
      : '';
  return (title || fallback || classType).slice(0, 256);
}

function isDisplayOnlyLayoutNode(node: Record<string, unknown>): boolean {
  const classType = typeof node.type === 'string' ? node.type.trim() : '';
  const outputs = Array.isArray(node.outputs) ? node.outputs : [];
  return (
    (outputs.length === 0 && /(?:label|note|markdown)/i.test(classType)) ||
    /^Fast Groups Bypasser \(rgthree\)$/i.test(classType)
  );
}

function isInactiveLayoutNode(node: Record<string, unknown>): boolean {
  return node.mode === 2 || node.mode === 4;
}

function layoutWidgetValueMatchesType(value: unknown, type: string): boolean {
  const normalizedType = type.toUpperCase();
  if (normalizedType === 'INT' || normalizedType === 'FLOAT') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (normalizedType === 'BOOLEAN') return typeof value === 'boolean';
  if (normalizedType === 'STRING' || normalizedType === 'COMBO') return typeof value === 'string';
  return value !== undefined;
}

function layoutInputType(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return 'COMBO';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function namedLayoutWidgetValue(
  values: Record<string, unknown>,
  input: Record<string, unknown>,
  inputName: string,
): { found: boolean; value?: unknown } {
  const widget = record(input.widget);
  const widgetName = typeof widget?.name === 'string' ? widget.name.trim() : '';
  const slotIndex =
    typeof input.slot_index === 'string' || typeof input.slot_index === 'number'
      ? String(input.slot_index)
      : '';
  for (const key of [widgetName, inputName, slotIndex]) {
    if (key && Object.hasOwn(values, key)) return { found: true, value: values[key] };
  }
  return { found: false };
}

function layoutSourceSlot(
  rawSlot: unknown,
  sourceNodeId: string,
  nodesById: Map<string, Record<string, unknown>>,
): number | undefined {
  if (Number.isInteger(rawSlot) && Number(rawSlot) >= 0) return Number(rawSlot);
  if (typeof rawSlot !== 'string') return undefined;
  const trimmed = rawSlot.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const outputs = Array.isArray(nodesById.get(sourceNodeId)?.outputs)
    ? (nodesById.get(sourceNodeId)?.outputs as unknown[])
    : [];
  const outputIndex = outputs.findIndex((rawOutput) => {
    const output = record(rawOutput);
    return (
      output?.name === trimmed ||
      (typeof output?.slot_index !== 'object' && String(output?.slot_index ?? '') === trimmed)
    );
  });
  if (outputIndex < 0) return undefined;
  const output = record(outputs[outputIndex]);
  return Number.isInteger(output?.slot_index) && Number(output?.slot_index) >= 0
    ? Number(output?.slot_index)
    : outputIndex;
}

function convertComfyUiLayoutWorkflow(layout: Record<string, unknown>): Record<string, unknown> {
  const version = comfyLayoutWorkflowVersion(layout);
  if (!Array.isArray(layout.nodes) || !Array.isArray(layout.links)) {
    throw new Error('普通 ComfyUI 工作流必须同时包含 nodes 和 links 画布数据。');
  }
  if (!layout.nodes.length) throw new Error('普通 ComfyUI 工作流中没有可转换的节点。');
  if (layout.nodes.length > 2048 || layout.links.length > 16_384) {
    throw new Error('普通 ComfyUI 工作流规模过大，无法安全转换。');
  }

  const nodesById = new Map<string, Record<string, unknown>>();
  for (const rawNode of layout.nodes) {
    const node = record(rawNode);
    const nodeId = layoutNodeId(node?.id);
    if (node && nodeId) nodesById.set(nodeId, node);
  }

  const virtualOutputValues = new Map<string, unknown>();
  for (const rawNode of layout.nodes) {
    const node = record(rawNode);
    const nodeId = layoutNodeId(node?.id);
    const classType = typeof node?.type === 'string' ? node.type.trim() : '';
    const widgetValues = Array.isArray(node?.widgets_values) ? node.widgets_values : [];
    if (/^Seed \(rgthree\)$/i.test(classType)) {
      const seed = widgetValues[0];
      if (!nodeId || typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0) {
        throw new Error('普通工作流中的 rgthree Seed 节点无法可靠转换。');
      }
      virtualOutputValues.set(nodeId, seed);
    }
  }

  const links = new Map<
    string,
    { sourceNodeId: string; sourceSlot: number; targetNodeId: string }
  >();
  for (const rawLink of layout.links) {
    const linkObject = record(rawLink);
    const isV1Link = version === '1.0';
    if ((isV1Link && !linkObject) || (!isV1Link && !Array.isArray(rawLink))) {
      throw new Error('普通 ComfyUI 工作流包含无法识别的连线数据。');
    }
    if (!isV1Link && (rawLink as unknown[]).length < 5) {
      throw new Error('普通 ComfyUI 工作流包含无法识别的连线数据。');
    }
    const linkId = layoutNodeId(isV1Link ? linkObject?.id : (rawLink as unknown[])[0]);
    const sourceNodeId = layoutNodeId(isV1Link ? linkObject?.origin_id : (rawLink as unknown[])[1]);
    const sourceSlot = layoutSourceSlot(
      isV1Link ? linkObject?.origin_slot : (rawLink as unknown[])[2],
      sourceNodeId,
      nodesById,
    );
    const targetNodeId = layoutNodeId(isV1Link ? linkObject?.target_id : (rawLink as unknown[])[3]);
    if (!linkId || !sourceNodeId || !targetNodeId || sourceSlot === undefined) {
      throw new Error('普通 ComfyUI 工作流包含无效的节点连线。');
    }
    links.set(linkId, { sourceNodeId, sourceSlot, targetNodeId });
  }

  const workflow: Record<string, unknown> = {};
  for (const rawNode of layout.nodes) {
    const node = record(rawNode);
    if (!node) throw new Error('普通 ComfyUI 工作流包含无效的节点对象。');
    if (isDisplayOnlyLayoutNode(node) || isInactiveLayoutNode(node)) continue;

    const nodeId = layoutNodeId(node.id);
    const classType = typeof node.type === 'string' ? node.type.trim() : '';
    if (!nodeId || !classType) throw new Error('普通 ComfyUI 工作流包含缺少 ID 或节点类型的节点。');
    if (virtualOutputValues.has(nodeId)) continue;
    if (Object.hasOwn(workflow, nodeId))
      throw new Error(`普通工作流中存在重复节点 ID「${nodeId}」。`);
    if (!Array.isArray(node.inputs)) {
      throw new Error(`普通工作流节点「${nodeId}」缺少可转换的 inputs 数据。`);
    }

    const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    const namedWidgetValues = record(node.widgets_values);
    let widgetIndex = 0;
    const inputs: Record<string, unknown> = {};
    for (const rawInput of node.inputs) {
      const input = record(rawInput);
      const inputName = typeof input?.name === 'string' ? input.name.trim() : '';
      const inputType = layoutInputType(input?.type);
      if (!input || !inputName) {
        throw new Error(`普通工作流节点「${nodeId}」包含无法识别的输入项。`);
      }

      const hasWidget = Boolean(input.widget);
      const namedWidget =
        hasWidget && namedWidgetValues
          ? namedLayoutWidgetValue(namedWidgetValues, input, inputName)
          : undefined;
      const widgetValue = hasWidget
        ? namedWidgetValues
          ? namedWidget?.value
          : widgetValues[widgetIndex++]
        : undefined;
      const linkId =
        input.link === null || input.link === undefined ? '' : layoutNodeId(input.link);
      if (linkId) {
        const link = links.get(linkId);
        if (!link || link.targetNodeId !== nodeId) {
          throw new Error(`普通工作流节点「${nodeId}」的输入「${inputName}」引用了无效连线。`);
        }
        inputs[inputName] = virtualOutputValues.has(link.sourceNodeId)
          ? virtualOutputValues.get(link.sourceNodeId)
          : [link.sourceNodeId, link.sourceSlot];
      } else if (hasWidget && !UI_ONLY_WIDGET_TYPES.has(inputType.toUpperCase())) {
        if (!layoutWidgetValueMatchesType(widgetValue, inputType)) {
          throw new Error(
            `普通工作流节点「${nodeId}」的控件「${inputName}」无法可靠转换，请改用“导出（API）”。`,
          );
        }
        inputs[inputName] = widgetValue;
      }

      if (
        hasWidget &&
        /^(?:seed|noise_seed)$/i.test(inputName) &&
        typeof widgetValues[widgetIndex] === 'string' &&
        SEED_CONTROL_VALUES.has(String(widgetValues[widgetIndex]).toLowerCase())
      ) {
        widgetIndex += 1;
      }
    }
    if (!namedWidgetValues && widgetIndex !== widgetValues.length) {
      throw new Error(
        `普通工作流节点「${nodeId}」仍有 ${widgetValues.length - widgetIndex} 个控件值无法可靠映射，请改用“导出（API）”。`,
      );
    }

    const properties = record(node.properties);
    const models = Array.isArray(properties?.models) ? properties.models.slice(0, 64) : undefined;
    workflow[nodeId] = {
      inputs,
      class_type: classType,
      _meta: {
        title: layoutNodeTitle(node, classType),
        ...(models ? { models } : {}),
      },
    };
  }
  if (!Object.keys(workflow).length) throw new Error('普通 ComfyUI 工作流中没有可执行节点。');
  return workflow;
}

async function bridgeError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = record(await response.json());
    const nested = record(body?.error);
    const message = String(nested?.message ?? body?.message ?? '').trim();
    if (message) return new Error(friendlyComfyWorkflowError(message));
  } catch {
    // The status code fallback is more useful than a JSON parsing error here.
  }
  return new Error(`${fallback}（HTTP ${response.status}）`);
}

export function parseComfyWorkflowImportJson(text: string): ParsedComfyWorkflowJson {
  const source = text.trim();
  if (!source) throw new Error('工作流 JSON 不能为空。');
  if (source.length > MAX_WORKFLOW_JSON_LENGTH) throw new Error('工作流 JSON 不能超过 5 MB。');

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('工作流 JSON 格式无效。');
  }
  const parsedRecord = record(parsed);
  if (!parsedRecord) throw new Error('工作流必须是 ComfyUI JSON 对象。');
  const sourceFormat =
    Array.isArray(parsedRecord.nodes) || Array.isArray(parsedRecord.links) ? 'layout' : 'api';
  const sourceVersion = sourceFormat === 'api' ? 'api' : comfyLayoutWorkflowVersion(parsedRecord);
  const sourceMetadata = comfySourceMetadata(parsedRecord);
  const workflow =
    sourceFormat === 'layout' ? convertComfyUiLayoutWorkflow(parsedRecord) : parsedRecord;
  const sanitizedWorkflow = removeUnreferencedDisplayOnlyPlaceholders(workflow);
  const nodes = Object.entries(sanitizedWorkflow);
  if (!nodes.length) {
    throw new Error('没有找到 API 节点，请在 ComfyUI 中导出“API Format”工作流后重试。');
  }
  for (const [nodeId, node] of nodes) {
    const error = workflowNodeError(nodeId, node);
    if (error) throw new Error(error);
  }
  return { workflow: sanitizedWorkflow, sourceFormat, sourceVersion, sourceMetadata };
}

export function parseComfyWorkflowApiJson(text: string): Record<string, unknown> {
  return parseComfyWorkflowImportJson(text).workflow;
}

export async function fetchLocalComfyUiStatus(signal?: AbortSignal): Promise<LocalComfyUiStatus> {
  return fetchComfyUiStatus({ id: 'comfyui-local', baseUrl: 'http://127.0.0.1:8188' }, signal);
}

export async function fetchComfyUiStatus(
  connection: ComfyUiConnectionConfig,
  signal?: AbortSignal,
): Promise<LocalComfyUiStatus> {
  const remote = connection.id !== 'comfyui-local';
  const response = await fetch(resolveBridgeUrl('/api/comfyui/status'), {
    method: remote ? 'POST' : 'GET',
    ...(remote
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: connection.id,
            baseUrl: connection.baseUrl,
            apiKey: connection.apiKey || '',
            authType: connection.authType || 'bearer',
          }),
        }
      : {}),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw await bridgeError(response, 'ComfyUI 状态检测失败');
  const body = record(await response.json());
  if (!body || typeof body.ready !== 'boolean') {
    throw new Error('画布桥返回了无效的 ComfyUI 状态。');
  }
  return {
    ready: body.ready,
    error: typeof body.error === 'string' ? body.error.trim().slice(0, 1000) : undefined,
    system: record(body.system),
    workflows: workflows(body.workflows),
  };
}

export async function saveLocalComfyWorkflow(
  name: string,
  workflow: Record<string, unknown>,
  connectionId = 'comfyui-local',
  source?: Pick<ParsedComfyWorkflowJson, 'sourceFormat' | 'sourceVersion' | 'sourceMetadata'>,
): Promise<ComfyWorkflowSummary> {
  const trimmedName = name.trim().slice(0, 120);
  if (!trimmedName) throw new Error('请填写工作流名称。');
  const response = await fetch(resolveBridgeUrl('/api/comfyui/workflows'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmedName, workflow, connectionId, ...source }),
  });
  if (!response.ok) throw await bridgeError(response, '保存 ComfyUI 工作流失败');
  const body = await response.json();
  const result = workflowSummary(record(body)?.workflow ?? body);
  if (!result) throw new Error('画布桥没有返回有效的工作流信息。');
  return result;
}

export async function deleteLocalComfyWorkflow(id: string): Promise<void> {
  const workflowId = id.trim();
  if (!workflowId) throw new Error('工作流 ID 不能为空。');
  const response = await fetch(
    resolveBridgeUrl(`/api/comfyui/workflows/${encodeURIComponent(workflowId)}`),
    { method: 'DELETE' },
  );
  if (!response.ok) throw await bridgeError(response, '删除 ComfyUI 工作流失败');
}
