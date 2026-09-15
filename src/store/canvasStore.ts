import { create } from 'zustand';
import { CanvasIdleAutosave, bindCanvasAutosaveActivity } from './canvasIdleAutosave';
import { reuseSnapshotReferences } from './reuseSnapshotReferences';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from '@xyflow/react';
import {
  isDirectorNodeKind,
  migrateLegacyDirectorNode,
  NODE_KIND_META,
  type FlowNode,
  type FlowEdge,
  type NodeKind,
  type Point,
  type WorkspaceId,
} from '../canvas/nodeTypes';
import { placeholderImage, KIND_DEFAULTS } from '../canvas/placeholders';
import { loadWorkspace, WORKSPACES } from '../canvas/workspaces';
import {
  generateNodeContent,
  lookupGenerationRequestByRequestId,
  type GenProvider,
} from '../services/ai';
import { renderTimeline } from '../services/timeline';
import {
  filterExcludedTextSources,
  resolveSubmittedReferenceAudios,
  resolveSubmittedReferenceImages,
  resolveSubmittedReferenceVideos,
} from '../composer/referenceSubmission';
import { manualReferences } from '../composer/referenceResolution';
import {
  availableProviderModels,
  isProviderConnectionUsable,
  loadProviderConnections,
  type ProviderModelKind,
} from '../lib/providerRegistry';
import { hydrateApiKeys } from '../lib/keyVault';
import {
  deleteAssetVideo,
  deleteProjectTrash,
  loadEffectVideo,
  loadProjectTrash,
  saveAssetVideo,
  saveProjectTrash,
} from '../lib/libraryMedia';
import {
  collectNodeInputs,
  collectUpstream,
  isValidConnection,
  resolveConnectionPorts,
  topoSort,
} from '../graph/graph';
import { getComposerSpec } from '../graph/nodeSpecs';
import {
  appendMediaOrdinal,
  collectGeneratedMediaUrls,
  generatedMediaPosition,
} from '../lib/generatedMedia';
import { extractVideoReferenceFrames } from '../lib/videoFrameExtraction';
import { playGenerationCompleteSound } from '../services/generationSound';
import { isLanCollaborationSession } from '../services/lanCollaborationSession';
import { mergeCameraPrompts, resolveCameraPromptCues } from '../lib/cameraPrompt';
import { normalizeDirectorScene } from '../lib/directorConstraints';
import { imageAnnotationInstruction, preferredImageReferenceUrls } from '../lib/imageAnnotations';
import { deleteBridgeAsset } from '../services/assetLibrary';
import {
  buildImageEnhancementPrompt,
  IMAGE_ENHANCEMENT_SPECS,
  type ImageEnhancementTool,
} from '../lib/imageEnhancement';
import { parseCanvasPersistence, stringifyCanvasPersistence } from './canvasPersistenceCodec';
import {
  canvasWorkspaceStorageKey,
  readCanvasWorkspaceSnapshot,
  removeCanvasWorkspaceSnapshot,
  writeCanvasWorkspaceSnapshot,
  type CanvasWorkspaceReadResult,
} from './canvasWorkspaceStorage';
import { matchModelFavorite, readModelFavorite } from '../lib/modelFavorites';
import type { ImageEditorBrushTool, ImageEditorMode } from '../lib/imageEditing';
import { cutoutPersonLocally } from '../lib/personCutout';
import {
  preferredAudioSource,
  preferredImageSource,
  preferredVideoSource,
  recoverPersistedAudioNode,
  recoverPersistedAudioSource,
  resolvedAudioSource,
  resolveMediaSourceUrl,
  type AudioSourceFields,
} from '../lib/mediaPreview';
import { resolveBridgeUrl } from '../lib/bridgeUrl';
import { stableJsonEqual } from '../lib/stableJson';
import { AUDIO_NODE_WIDTH } from '../lib/audioNode';
import {
  IMAGE_COMPARISON_DEFAULT_POSITION,
  IMAGE_COMPARISON_NODE_HEIGHT,
  IMAGE_COMPARISON_NODE_WIDTH,
  imageComparisonNodePosition,
  resolveImageComparisonSources,
} from '../lib/imageComparison';
import { getVideoRemakeMinimumSeconds } from '../lib/videoTrim';
import type { DirectorPrevisAsset } from '../lib/directorPrevisVideo';
import {
  readCanvasPreferences,
  useCanvasPreferences,
  writeCanvasPreferences,
} from './canvasPreferences';
import { textReferencePrompt, type TextReferencePromptPreset } from '../lib/textReferencePrompt';
import {
  buildTextWorkflowPrompt,
  DEFAULT_TEXT_TASK_MODE,
  resolveTextTaskInput,
} from '../lib/textGeneration';
import {
  buildCharacterReferenceNodes,
  type CharacterReferenceImages,
} from '../lib/characterCanvasLayout';
import { normalizeVideoGenerationMode, requestedVideoAudio } from '../lib/videoGenerationMode';
import type { VideoMaskRepairSpec } from '../lib/videoMaskRepair';
import { scheduleAfterFirstPaint } from '../lib/startupScheduling';
import {
  canvasNodeMediaDataChanged,
  collectCanvasMediaStrings,
  embeddedCanvasImageStats,
  isEmbeddedCanvasImage,
  mapCanvasMediaStrings,
  replaceExactCanvasMediaUrls,
} from '../lib/canvasMediaMigration';
import {
  isCanvasMediaFallbackUrl,
  parseCanvasMediaFallbackReferenceUrl,
} from '../lib/canvasMediaFallback';
import {
  CanvasMediaPersistenceSession,
  prepareCanvasAssetItemsForPersistence,
  prepareCanvasMediaValueForPersistence,
  prepareCanvasNodesForPersistence,
  resolveCanvasImageForAi,
  resolveCanvasMediaRuntimeUrl,
  resolveCanvasPosterForAi,
  stableCanvasMediaUrlForRuntime,
} from '../services/canvasMediaPersistence';
import {
  BridgeCanvasConflictError,
  BridgeCanvasUnavailableError,
  claimBridgePrimaryProject,
  containsBrowserSessionMedia,
  readBridgeProject,
  readBridgeProjectCatalog,
  readBridgeTrash,
  readBridgeWorkspace,
  writeBridgeProject,
  writeBridgeTrash,
  writeBridgeWorkspace,
  type BridgeProjectCatalogItem,
  type BridgeProjectManifest,
  type PersistedBridgeWorkspaceId,
} from '../services/bridgeCanvasPersistence';
import { arrangeNodesInGrid as resolveGridArrangement } from '../canvas/gridArrangement';
import {
  CanvasAssetPersistenceConflictError,
  commitPreparedCanvasAssetCatalog,
  prepareCanvasAssetCatalog,
  type PreparedCanvasAssetCatalog,
} from './canvasAssetPersistence';
import {
  commitLegacyMediaAfterStorageCas,
  equivalentLegacyBridgeValue,
  legacyCopiesMatchBridge,
  LegacyStorageChangedError,
  type LegacyStorageCasEntry,
} from './canvasLegacyMigrationGuard';
import { CanvasPersistenceRetryScheduler } from './canvasPersistenceRetry';
import { cleanupRemovedAssetAfterCommit } from './assetRemovalTransaction';

function isVideoMaskRepairSpec(value: unknown): value is VideoMaskRepairSpec {
  if (!value || typeof value !== 'object') return false;
  const spec = value as Partial<VideoMaskRepairSpec>;
  return (
    typeof spec.maskImage === 'string' &&
    spec.maskImage.trim().length > 0 &&
    Number.isFinite(spec.rangeStart) &&
    Number.isFinite(spec.rangeEnd) &&
    Number.isFinite(spec.keyframeTime) &&
    Number(spec.rangeStart) >= 0 &&
    Number(spec.rangeEnd) > Number(spec.rangeStart) &&
    Number(spec.keyframeTime) >= Number(spec.rangeStart) &&
    Number(spec.keyframeTime) <= Number(spec.rangeEnd) &&
    spec.tracking === 'provider'
  );
}

function notifyGeneratedMedia(kind: 'image' | 'video' | 'audio' | '3d') {
  const preferences = readCanvasPreferences();
  const enabled =
    kind === 'video'
      ? preferences.videoGenerationSoundEnabled
      : kind === 'audio'
        ? preferences.audioGenerationSoundEnabled
        : preferences.imageGenerationSoundEnabled;
  if (preferences.generationSoundEnabled && enabled) {
    const sound =
      kind === 'video'
        ? preferences.videoGenerationSound
        : kind === 'audio'
          ? preferences.audioGenerationSound
          : preferences.imageGenerationSound;
    void playGenerationCompleteSound(sound, preferences.generationSoundVolume);
  }
}

function notifyGeneratedText() {
  const preferences = readCanvasPreferences();
  if (preferences.generationSoundEnabled && preferences.textGenerationSoundEnabled) {
    void playGenerationCompleteSound(
      preferences.textGenerationSound,
      preferences.generationSoundVolume,
    );
  }
}

const NODE_W = 620;
const NODE_H = 350;
const HISTORY_LIMIT = 100;
const PAD = 36;
const GROUP_TOP_PAD = PAD + 28;
const ASSET_KEY = 'kitty-canvas-assets';
const LEGACY_ASSET_KEY = 'libtv-canvas-assets';
const ASSET_PROJECT_MIGRATION_KEY = 'kitty-canvas-assets-project-migrated';
const TRASH_KEY = 'kitty-canvas-trash';
const CURRENT_PROJECT_ID_KEY = 'qiansi-canvas-current-project-id';
const CANVAS_WORKSPACE_STORAGE_KEY_PREFIX = 'kitty-canvas-workspace-state:';

let canvasHistoryTransactionDepth = 0;
let canvasHistoryTransactionCaptured = false;

/** Collapse a synchronous compound canvas command into one undo checkpoint. */
export function runCanvasHistoryTransaction<T>(operation: () => T): T {
  const outermost = canvasHistoryTransactionDepth === 0;
  if (outermost) canvasHistoryTransactionCaptured = false;
  canvasHistoryTransactionDepth += 1;
  try {
    return operation();
  } finally {
    canvasHistoryTransactionDepth -= 1;
    if (outermost) canvasHistoryTransactionCaptured = false;
  }
}

/**
 * The legacy writer is retained only so the historical storage migration
 * contracts can execute under Vitest. Production builds never select it.
 */
function usesLegacyPersistenceTestAdapter() {
  return (
    import.meta.env.MODE === 'test' &&
    !(globalThis as { __QIANSI_FORCE_BRIDGE_PERSISTENCE__?: boolean })
      .__QIANSI_FORCE_BRIDGE_PERSISTENCE__
  );
}

function readRememberedProjectId() {
  try {
    const value = localStorage.getItem(CURRENT_PROJECT_ID_KEY)?.trim();
    return value && /^[A-Za-z0-9_-]{2,80}$/.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function rememberProjectId(projectId: string) {
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(projectId)) return;
  try {
    localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
  } catch {
    // Navigation remains valid for this session when storage is unavailable.
  }
}

function connectedTextPromptPreset(
  edges: FlowEdge[],
  textNodeId: string,
): TextReferencePromptPreset | undefined {
  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index];
    if (edge?.target !== textNodeId) continue;
    if (edge.targetHandle === 'video-ref') return 'video';
    if (edge.targetHandle === 'ref') return 'image';
  }
  return undefined;
}

function syncConnectedTextPrompts(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.data.kind !== 'text') return node;
    const nextPreset = connectedTextPromptPreset(edges, node.id);
    const currentPreset = node.data.connectionPromptPreset;
    const hasUserContent = Boolean(
      String(
        node.data.outputText ||
          node.data.result ||
          node.data.textInstruction ||
          node.data.prompt ||
          '',
      ).trim(),
    );

    if (!nextPreset) {
      if (!currentPreset) return node;
      const currentPresetPrompt = textReferencePrompt(currentPreset);
      changed = true;
      return {
        ...node,
        data: {
          ...node.data,
          prompt: node.data.prompt === currentPresetPrompt ? undefined : node.data.prompt,
          textInstruction:
            node.data.textInstruction === currentPresetPrompt
              ? undefined
              : node.data.textInstruction,
          textContentRole:
            node.data.textInstruction === currentPresetPrompt ||
            node.data.prompt === currentPresetPrompt
              ? undefined
              : node.data.textContentRole,
          connectionPromptPreset: undefined,
        },
      };
    }

    if (currentPreset === nextPreset) return node;
    if (!currentPreset && hasUserContent) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        prompt: undefined,
        textInstruction: textReferencePrompt(nextPreset),
        textContentRole: 'instruction' as const,
        result: undefined,
        outputText: undefined,
        output: undefined,
        connectionPromptPreset: nextPreset,
      },
    };
  });
  return changed ? nextNodes : nodes;
}

function isMaterializedPassThroughNode(node: FlowNode) {
  return node.data.kind === 'loop' || node.data.kind === 'output' || node.data.kind === 'plugin';
}

/**
 * `portInputs` / `input` and collector outputs are graph-derived caches. Keep
 * them aligned with the current edge set after disconnects, restores and
 * imports so a removed reference cannot remain visible or be submitted later.
 */
function syncMaterializedGraphInputs(
  nodes: FlowNode[],
  edges: FlowEdge[],
  rootIds?: Iterable<string>,
): FlowNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const affected = new Set<string>();
  const queue: string[] = [];
  if (rootIds) {
    for (const id of rootIds) {
      if (!nodeIds.has(id) || affected.has(id)) continue;
      affected.add(id);
      queue.push(id);
    }
  } else {
    for (const edge of edges) {
      if (nodeIds.has(edge.target)) affected.add(edge.target);
    }
    for (const node of nodes) {
      if (
        node.data.portInputs !== undefined ||
        node.data.input !== undefined ||
        (isMaterializedPassThroughNode(node) && node.data.output !== undefined)
      ) {
        affected.add(node.id);
      }
    }
    queue.push(...affected);
  }
  while (queue.length > 0) {
    const sourceId = queue.shift();
    if (!sourceId) continue;
    for (const edge of edges) {
      if (edge.source !== sourceId || !nodeIds.has(edge.target) || affected.has(edge.target)) {
        continue;
      }
      affected.add(edge.target);
      queue.push(edge.target);
    }
  }
  if (affected.size === 0) return nodes;

  const pending = new Set(affected);
  const ordered: string[] = [];
  while (pending.size > 0) {
    const next = [...pending].find((id) =>
      edges.filter((edge) => edge.target === id).every((edge) => !pending.has(edge.source)),
    );
    if (!next) {
      // Corrupt legacy snapshots may contain a cycle. Recompute each cache once
      // in stable node order and keep this recovery path finite.
      ordered.push(...nodes.filter((node) => pending.has(node.id)).map((node) => node.id));
      break;
    }
    pending.delete(next);
    ordered.push(next);
  }

  let nextNodes = nodes;
  for (const nodeId of ordered) {
    const node = nextNodes.find((item) => item.id === nodeId);
    if (!node) continue;
    const portInputs = collectNodeInputs(nextNodes, edges, nodeId);
    const values = Object.values(portInputs).flat();
    const nextData: FlowNode['data'] = {
      ...node.data,
      portInputs,
      input: values[0],
    };
    if (isMaterializedPassThroughNode(node)) {
      nextData.output = values.length === 1 ? values[0] : values;
    }
    if (node.data.kind === 'output') {
      const strings = values.filter((value): value is string => typeof value === 'string');
      const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(?:$|[?#])/i.test(url);
      const isMediaUrl = (url: string) => /^(?:https?:|data:image\/|blob:)/.test(url);
      nextData.images = strings.filter((url) => isMediaUrl(url) && !isVideoUrl(url));
      nextData.videos = strings.filter(isVideoUrl);
      nextData.outputText = strings.filter((value) => !isMediaUrl(value)).join('\n') || undefined;
    }
    nextNodes = nextNodes.map((item) => (item.id === nodeId ? { ...item, data: nextData } : item));
  }
  return nextNodes;
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const NUMBERED_NODE_TITLE_PREFIX: Partial<Record<NodeKind, string>> = {
  image: '图片',
  text: '文本',
  video: '视频',
};

const LEGACY_DEFAULT_NODE_TITLES: Partial<Record<NodeKind, readonly string[]>> = {
  image: ['角色图', '图片节点', '未命名图片'],
  text: ['提示词', '文本节点'],
  video: ['视频', '未命名视频'],
};

function nextNumberedNodeTitle(nodes: FlowNode[], kind: NodeKind): string | undefined {
  const prefix = NUMBERED_NODE_TITLE_PREFIX[kind];
  if (!prefix) return undefined;
  let sameKindCount = 0;
  let highestNumber = 0;
  const numberedTitle = new RegExp(`^${prefix}(\\d+)$`);
  for (const node of nodes) {
    if (node.data.kind !== kind) continue;
    sameKindCount += 1;
    const match = String(node.data.title ?? '')
      .trim()
      .match(numberedTitle);
    if (match) highestNumber = Math.max(highestNumber, Number(match[1]));
  }
  return `${prefix}${Math.max(sameKindCount, highestNumber) + 1}`;
}

function hasDefaultNumberedTitle(kind: NodeKind, title: unknown): boolean {
  const prefix = NUMBERED_NODE_TITLE_PREFIX[kind];
  if (!prefix) return false;
  const normalized = typeof title === 'string' ? title.trim() : '';
  return (
    !normalized ||
    (LEGACY_DEFAULT_NODE_TITLES[kind]?.includes(normalized) ?? false) ||
    new RegExp(`^${prefix}\\d+$`).test(normalized)
  );
}

function copyNodeDataWithoutLiveExecution(
  data: FlowNode['data'],
  existingNodes: FlowNode[],
): FlowNode['data'] {
  const copied: FlowNode['data'] = {
    ...data,
    ...(hasDefaultNumberedTitle(data.kind, data.title)
      ? { title: nextNumberedNodeTitle(existingNodes, data.kind) }
      : {}),
    generating: false,
    generationRequestId: undefined,
    generationError: undefined,
    portInputs: undefined,
    input: undefined,
    ...(data.kind === 'loop' || data.kind === 'plugin'
      ? { output: undefined }
      : data.kind === 'output'
        ? { output: undefined, outputText: undefined, images: undefined, videos: undefined }
        : {}),
  };
  const isFlatDirectorTask =
    data.kind === 'image' && typeof data.composerParams?.directorReferenceCount === 'number';
  if (!isFlatDirectorTask) return copied;
  const composerParams = { ...data.composerParams };
  delete composerParams.directorSourceId;
  delete composerParams.directorReferenceCount;
  delete composerParams.requiresImageInput;
  return {
    ...copied,
    composerParams,
    composerReferences: undefined,
    composerReferenceSubmission: undefined,
    portInputs: undefined,
    input: undefined,
    progress: data.imageUrl ? 100 : 0,
    result: undefined,
  };
}

function nodeRenderedSize(node: FlowNode) {
  const width = Number(node.measured?.width ?? node.style?.width ?? NODE_W);
  const height = Number(node.measured?.height ?? node.style?.height ?? NODE_H);
  return {
    width: Number.isFinite(width) && width > 0 ? width : NODE_W,
    height: Number.isFinite(height) && height > 0 ? height : NODE_H,
  };
}

function absoluteNodePosition(node: FlowNode, nodes: FlowNode[]): Point {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const visited = new Set<string>([node.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

function inheritedVideoPreview(sourceNode: FlowNode, sourceVideoUrl: string) {
  return {
    videoPreviewUrl: sourceVideoUrl,
    previewUrl: sourceNode.data.previewUrl,
    mediaWidth: sourceNode.data.mediaWidth,
    mediaHeight: sourceNode.data.mediaHeight,
    durationSeconds: sourceNode.data.durationSeconds,
  };
}

function inheritedImagePreview(sourceNode: FlowNode, sourceImageUrl: string) {
  return {
    // Retain the upstream media for the composer/request path without making
    // it the derived node's own canvas preview.
    imagePreviewUrl: sourceImageUrl,
    imagePreviewPosterUrl: sourceNode.data.previewUrl,
    mediaWidth: sourceNode.data.mediaWidth,
    mediaHeight: sourceNode.data.mediaHeight,
  };
}

function videoResolutionFromMediaSize(width: unknown, height: unknown): GenResolution | undefined {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return undefined;
  if (safeWidth <= 0 || safeHeight <= 0) return undefined;
  const longEdge = Math.max(safeWidth, safeHeight);
  if (longEdge >= 3840) return '4K';
  if (longEdge >= 2560) return '2K';
  if (longEdge >= 1920) return '1080P';
  if (longEdge >= 1280) return '720P';
  return '480P';
}

function videoAspectRatioFromMediaSize(
  width: unknown,
  height: unknown,
): GenParams['aspectRatio'] | undefined {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return undefined;
  if (safeWidth <= 0 || safeHeight <= 0) return undefined;
  const ratio = safeWidth / safeHeight;
  const candidates: Array<[GenParams['aspectRatio'], number]> = [
    ['21:9', 21 / 9],
    ['16:9', 16 / 9],
    ['3:2', 3 / 2],
    ['4:3', 4 / 3],
    ['5:4', 5 / 4],
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['3:4', 3 / 4],
    ['2:3', 2 / 3],
    ['9:16', 9 / 16],
  ];
  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate[1] - ratio) < Math.abs(closest[1] - ratio) ? candidate : closest,
  )[0];
}

function composeLibraryPrompt(preset: {
  title: string;
  category: string;
  prompt?: string;
  description?: string;
}) {
  const lines = [`名称：${preset.title.trim()}`, `分类：${preset.category.trim()}`];
  const prompt = preset.prompt?.trim();
  const description = preset.description?.trim();
  if (prompt) lines.push(`提示词：${prompt}`);
  else if (description) lines.push(`描述：${description}`);
  return lines.join('\n');
}

function styleReferenceInstruction(references: ReturnType<typeof manualReferences>) {
  const styleReferences = references.filter(
    (reference) =>
      reference.type === 'image' &&
      (reference.role === 'style' || reference.id.startsWith('style-preset:')),
  );
  if (!styleReferences.length) return '';
  const savedStyleText = styleReferences
    .flatMap((reference) =>
      reference.stylePrompt?.trim()
        ? [`“${reference.label}”：${reference.stylePrompt.trim()}`]
        : [],
    )
    .join('\n');
  return [
    '风格参考约束：标记为“风格参考”的图片仅用于借鉴整体画风、色彩、光影、材质、笔触和氛围。',
    '不得复制或继承其中的人物身份、脸部、服装、姿势、构图、场景、文字或具体物体；人物与构图只服从其他参考图和用户指令。',
    savedStyleText ? `风格文字说明：\n${savedStyleText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function annotationPromptForReferences(nodes: FlowNode[], referenceImages: string[]) {
  const referenceSet = new Set(referenceImages);
  return nodes
    .filter(
      (source) =>
        source.data.aiReferenceMode !== 'original' &&
        Array.isArray(source.data.annotationHints) &&
        source.data.annotationHints.length > 0,
    )
    .filter((source) =>
      preferredImageReferenceUrls(source.data).some((url) => referenceSet.has(url)),
    )
    .map((source) => imageAnnotationInstruction(source.data.annotationHints ?? []))
    .filter(Boolean)
    .join('\n');
}

interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
  trash?: TrashItem[];
}

function clone(nodes: FlowNode[], edges: FlowEdge[], trash?: TrashItem[]): Snapshot {
  // Shallow-clone structure only: spread creates new array/object references
  // (needed for undo/redo immutability) without copying large string payloads
  // like base64 image data — strings are immutable in JS so sharing refs is safe.
  return {
    nodes: nodes.map((n) => ({ ...n, data: { ...n.data }, position: { ...n.position } })),
    edges: edges.map((e) => ({ ...e })),
    trash: trash?.map((item) => ({
      ...item,
      nodes: item.nodes.map((node) => ({
        ...node,
        data: { ...node.data },
        position: { ...node.position },
      })),
      edges: item.edges.map((edge) => ({ ...edge })),
    })),
  };
}

// ── AI 模型解析（复刻旧版节点的 AI 调用） ──
// 从节点 data 取出 providerId + model，结合本地加密保险箱里的密钥，组装成
// 传给本地桥（local-bridge.mjs）的 provider 配置。
async function buildGenProvider(node: FlowNode): Promise<GenProvider | null> {
  const providerId = node.data.providerId;
  const model = node.data.model;
  if (!providerId || !model) return null;
  const connections = await hydrateApiKeys(loadProviderConnections());
  const p = connections.find((c) => c.id === providerId);
  const composerType = getComposerSpec(node.data.kind).type;
  const modelKind: ProviderModelKind | null =
    composerType === 'text'
      ? 'chat'
      : composerType === 'image'
        ? 'image'
        : composerType === 'video'
          ? 'video'
          : composerType === 'audio'
            ? 'audio'
            : composerType === '3d'
              ? '3d'
              : null;
  if (
    !p ||
    !modelKind ||
    !p.enabled ||
    !isProviderConnectionUsable(p) ||
    p.canGenerate === false ||
    p.disabledModelKinds?.includes(modelKind) ||
    !(p.models[modelKind] ?? []).includes(model)
  ) {
    return null;
  }
  return {
    providerId: p.id,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    endpoint: p.endpoint,
    authType: p.authType,
    apiKey: p.apiKey,
    model,
    reasoningEffort:
      p.modelReasoningEfforts?.[model] && p.modelReasoningEfforts[model] !== 'auto'
        ? p.modelReasoningEfforts[model]
        : undefined,
    inputModalities: p.modelCapabilities?.[model]?.inputModalities
      ? [...p.modelCapabilities[model].inputModalities]
      : undefined,
    videoReferenceInput: p.modelCapabilities?.[model]?.videoReferenceInput,
    videoModes: p.modelCapabilities?.[model]?.videoModes
      ? [...p.modelCapabilities[model].videoModes]
      : undefined,
    videoOperations: p.modelCapabilities?.[model]?.videoOperations
      ? [...p.modelCapabilities[model].videoOperations]
      : undefined,
    cliConfig: p.cliConfig ? { ...p.cliConfig } : undefined,
  };
}

/** 收集直接上游节点提供的 prompt 文本与参考图（复刻旧版 generatorSources）。 */
// NOTE: `collectUpstream` and `topoSort` now live in src/graph/graph.ts
// (spec-driven, behaviour-equivalent to the legacy inline versions). They are
// imported at the top of this file.

// ---- Generation parameters ----
export type GenMode = 'first-frame' | 'last-frame' | 'both-frames' | 'lighting' | 'redraw';
export type GenDuration = number;
export type GenResolution = '480P' | '720P' | '1080P' | '2K' | '4K';

export interface GenParams {
  viewCount: 3 | 4 | 6;
  aspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9';
  videoAspectRatio?: 'Auto' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  quality: 'standard' | '2K' | '4K';
  count: 1 | 2 | 4;
  mode?: GenMode;
  model?: string;
  duration?: GenDuration;
  resolution?: GenResolution;
  strength?: number; // 0-1 redraw strength / refinement
  fps?: 24 | 30 | 60;
  audio?: boolean;
  maxLength?: number;
  temperature?: number;
}

const DEFAULT_GEN_PARAMS = {
  viewCount: 3,
  aspectRatio: '16:9',
  quality: '2K',
  count: 1,
  mode: 'first-frame',
  duration: 5,
  resolution: '720P',
  audio: false,
  strength: 0.5,
} satisfies GenParams;

export type AssetCategory = 'character' | 'scene' | 'storyboard' | 'item' | 'video' | 'audio';

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  character: '人物',
  scene: '场景',
  storyboard: '分镜',
  item: '物品',
  video: '视频',
  audio: '音频',
};

export const DEFAULT_ASSET_CATEGORY: AssetCategory = 'character';

export interface AssetItem {
  id: string;
  /** Project where the asset first entered the global library. Used only for filtering. */
  sourceProjectId?: string;
  /** Canvas node that produced this asset; used to prevent duplicate subjects. */
  sourceNodeId?: string;
  title: string;
  originalUrl?: string;
  previewUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  durationSeconds?: number;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
  videos?: string[];
  videoFileName?: string;
  effectVideoId?: string;
  videoStorageId?: string;
  bridgeAssetId?: string;
  audioUrl?: string;
  audios?: string[];
  audioSourceState?: 'unavailable-after-restore';
  audioFileName?: string;
  mediaPersistenceState?: 'session-only';
  mediaMimeType?: string;
  kind: NodeKind;
  category: AssetCategory;
  createdAt: number;
}

export function assetSessionMediaUnavailable(asset: AssetItem) {
  if (
    asset.mediaPersistenceState !== 'session-only' &&
    asset.audioSourceState !== 'unavailable-after-restore'
  ) {
    return false;
  }
  if (asset.kind === 'video' || asset.kind === 'video-comp') {
    return !preferredVideoSource(asset);
  }
  if (asset.kind === 'audio') return !resolvedAudioSource(asset);
  return !preferredImageSource(asset);
}

export interface TrashItem {
  id: string;
  projectId: string;
  workspace: WorkspaceId;
  title: string;
  deletedAt: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

function inferAssetCategory(kind: NodeKind, data: Record<string, unknown>): AssetCategory {
  if (data.characterPreset) return 'character';
  if (data.stylePreset) return 'scene';
  const composerParams =
    data.composerParams && typeof data.composerParams === 'object'
      ? (data.composerParams as Record<string, unknown>)
      : undefined;
  const imageType = typeof composerParams?.imageType === 'string' ? composerParams.imageType : '';
  if (/角色|人物|肖像|三视图/.test(imageType)) return 'character';
  if (/场景|景观|建筑|背景/.test(imageType)) return 'scene';
  if (/分镜|故事板|镜头/.test(imageType)) return 'storyboard';
  switch (kind) {
    case 'views':
    case 'director':
    case 'director-2d':
    case 'director-3d':
    case 'script':
    case 'front-frame':
      return 'storyboard';
    case 'video':
    case 'video-comp':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return 'item';
  }
}

function projectAssetKey(projectId: string) {
  return `${ASSET_KEY}:${projectId}`;
}

function assetSourceProjectId(asset: AssetItem, fallbackProjectId: string) {
  return asset.sourceProjectId?.trim() || fallbackProjectId;
}

function normalizeAssetSource(asset: AssetItem, sourceProjectId: string): AssetItem {
  const normalizedSourceProjectId = assetSourceProjectId(asset, sourceProjectId);
  return asset.sourceProjectId === normalizedSourceProjectId
    ? asset
    : { ...asset, sourceProjectId: normalizedSourceProjectId };
}

function discoverAssetSourceProjectIds(
  projects: readonly { id: string }[],
  activeProjectId: string,
) {
  const ids = new Set([activeProjectId, ...projects.map((project) => project.id)]);
  for (const projectId of projectAssetStates.keys()) ids.add(projectId);
  if (typeof window === 'undefined') return ids;
  try {
    const prefix = `${ASSET_KEY}:`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && key.length > prefix.length) ids.add(key.slice(prefix.length));
    }
  } catch {
    // Known project IDs remain available when storage enumeration is blocked.
  }
  return ids;
}

/** Keep still-live session Blob assets available across project switches.
 * The localStorage copy is intentionally recovered/marked for the next browser session. */
const projectAssetStates = new Map<string, AssetItem[]>();
const unreadableProjectAssetIds = new Set<string>();
const legacyAssetSourceProjectIds = new Set<string>();
const pendingAssetPersistenceProjects = new Set<string>();

function recoverPersistedAsset(asset: AssetItem): AssetItem {
  return asset.kind === 'audio' ? recoverPersistedAudioSource(asset) : asset;
}

const SESSION_MEDIA_NODE_DATA_KEYS = [
  'originalUrl',
  'previewUrl',
  'imageUrl',
  'images',
  'imagePreviewUrl',
  'imagePreviewPosterUrl',
  'videoUrl',
  'videos',
  'videoPreviewUrl',
  'audioUrl',
  'audios',
  'output',
  'composerReferences',
  'composerReferenceSubmission',
  'portInputs',
] as const satisfies readonly (keyof FlowNode['data'])[];

const SESSION_MEDIA_ASSET_KEYS = [
  'originalUrl',
  'previewUrl',
  'imageUrl',
  'images',
  'videoUrl',
  'videos',
  'audioUrl',
  'audios',
] as const satisfies readonly (keyof AssetItem)[];

function liveSessionMediaPatch<T extends Record<string, unknown>>(
  current: T,
  keys: readonly (keyof T)[],
) {
  const patch: Partial<T> = {};
  let found = false;
  for (const key of keys) {
    const value = current[key];
    if (!containsBrowserSessionMedia(value)) continue;
    patch[key] = value;
    found = true;
  }
  return found ? patch : undefined;
}

function reconcileSharedSessionNode(node: FlowNode, current: FlowNode | undefined): FlowNode {
  if (node.data.kind === 'audio') {
    const currentSource = current ? preferredAudioSource(current.data) : undefined;
    const incomingSource = preferredAudioSource(node.data);
    if (currentSource?.startsWith('blob:') && incomingSource === currentSource) return node;
  }
  if (node.data.mediaPersistenceState !== 'session-only' || !current) {
    return recoverPersistedAudioNode(node);
  }
  const livePatch = liveSessionMediaPatch(
    current.data as Record<string, unknown>,
    SESSION_MEDIA_NODE_DATA_KEYS,
  );
  if (!livePatch) return recoverPersistedAudioNode(node);
  return {
    ...node,
    data: {
      ...node.data,
      ...livePatch,
      mediaPersistenceState: 'session-only',
      mediaMimeType: current.data.mediaMimeType ?? node.data.mediaMimeType,
      audioSourceState: undefined,
    },
  };
}

function liveAudioBlobSource(data: AudioSourceFields | undefined) {
  if (!data || data.audioSourceState === 'unavailable-after-restore') return;
  return [data.audioUrl, ...(data.audios ?? [])].find(
    (source): source is string => typeof source === 'string' && source.startsWith('blob:'),
  );
}

function hasAudioSource(data: AudioSourceFields, source: string) {
  return (
    data.audioUrl === source || data.audios?.includes(source) === true || data.output === source
  );
}

function reconcileSharedAsset(asset: AssetItem, current: AssetItem | undefined): AssetItem {
  if (asset.mediaPersistenceState === 'session-only' && current) {
    const livePatch = liveSessionMediaPatch(
      current as unknown as Record<string, unknown>,
      SESSION_MEDIA_ASSET_KEYS,
    );
    if (livePatch) {
      return {
        ...asset,
        ...livePatch,
        mediaPersistenceState: 'session-only',
        mediaMimeType: current.mediaMimeType ?? asset.mediaMimeType,
        audioSourceState: undefined,
      } as AssetItem;
    }
  }
  if (asset.kind !== 'audio') return asset;
  const liveSource = liveAudioBlobSource(current);
  if (liveSource && hasAudioSource(asset, liveSource)) {
    return {
      ...asset,
      audioUrl: current?.audioUrl,
      audios: current?.audios,
      audioSourceState: undefined,
    };
  }
  return recoverPersistedAsset(asset);
}

function recoverPersistedTrashItem(item: TrashItem): TrashItem {
  return {
    ...item,
    nodes: item.nodes.map(recoverPersistedAudioNode),
  };
}

function reconcileSharedTrashItem(item: TrashItem, current: TrashItem | undefined): TrashItem {
  const currentNodesById = new Map((current?.nodes ?? []).map((node) => [node.id, node]));
  return {
    ...item,
    nodes: item.nodes.map((node) => {
      const currentNode = currentNodesById.get(node.id);
      if (node.data.kind === 'audio') {
        const liveSource = liveAudioBlobSource(currentNode?.data);
        if (liveSource && hasAudioSource(node.data, liveSource)) {
          return {
            ...node,
            data: {
              ...node.data,
              audioUrl: currentNode?.data.audioUrl,
              audios: currentNode?.data.audios,
              output: currentNode?.data.output,
              audioSourceState: undefined,
            },
          };
        }
      }
      return reconcileSharedSessionNode(node, currentNode);
    }),
  };
}

function loadAssets(projectId: string, migrateSharedAssets = false): AssetItem[] {
  const cached = projectAssetStates.get(projectId);
  if (cached) return cached;
  let raw: string | null | undefined;
  try {
    const scopedKey = projectAssetKey(projectId);
    raw = localStorage.getItem(scopedKey);
    if (
      raw === null &&
      migrateSharedAssets &&
      localStorage.getItem(ASSET_PROJECT_MIGRATION_KEY) !== '1'
    ) {
      raw = localStorage.getItem(ASSET_KEY) ?? localStorage.getItem(LEGACY_ASSET_KEY);
      if (raw !== null) legacyAssetSourceProjectIds.add(projectId);
    }
    if (!raw) {
      unreadableProjectAssetIds.delete(projectId);
      legacyAssetSourceProjectIds.delete(projectId);
      projectAssetStates.set(projectId, []);
      return [];
    }
    const parsed = JSON.parse(raw) as Omit<AssetItem, 'category'>[];
    const assets = parsed.map((item) =>
      normalizeAssetSource(
        recoverPersistedAsset({
          ...item,
          category:
            (item as Partial<AssetItem>).category ??
            inferAssetCategory(item.kind, item as unknown as Record<string, unknown>),
        } as AssetItem),
        projectId,
      ),
    );
    if (localStorage.getItem(scopedKey) !== null) legacyAssetSourceProjectIds.delete(projectId);
    unreadableProjectAssetIds.delete(projectId);
    projectAssetStates.set(projectId, assets);
    return assets;
  } catch {
    if (typeof raw === 'string' && raw.length > 0) unreadableProjectAssetIds.add(projectId);
    projectAssetStates.set(projectId, []);
    return [];
  }
}

function loadGlobalAssets(
  projects: readonly { id: string }[],
  activeProjectId: string,
  migrateSharedAssets = false,
) {
  const byId = new Map<string, AssetItem>();
  for (const sourceProjectId of discoverAssetSourceProjectIds(projects, activeProjectId)) {
    for (const asset of loadAssets(
      sourceProjectId,
      migrateSharedAssets && sourceProjectId === activeProjectId,
    )) {
      const normalized = normalizeAssetSource(asset, sourceProjectId);
      const existing = byId.get(normalized.id);
      if (!existing || normalized.createdAt >= existing.createdAt)
        byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function scheduleAssetCatalogPersistence(projectId: string) {
  if (pendingAssetPersistenceProjects.has(projectId)) return;
  pendingAssetPersistenceProjects.add(projectId);
  globalThis.queueMicrotask(() => {
    pendingAssetPersistenceProjects.delete(projectId);
    if (!initialBridgeHydrationBlocksPersistence()) canvasAutosave.request();
  });
}

function persistableAssetItems(items: readonly AssetItem[]) {
  return items.slice(-200).map(recoverPersistedAsset);
}

function assetCatalogFingerprint(items: readonly AssetItem[]) {
  return JSON.stringify(persistableAssetItems(items));
}

function persistAssets(projectId: string, items: AssetItem[]) {
  const liveItems = items.map((item) => normalizeAssetSource(item, projectId)).slice(-200);
  projectAssetStates.set(projectId, liveItems);
  if (!usesLegacyPersistenceTestAdapter()) {
    // The Bridge project manifest / Asset Library is the sole durable catalog.
    // Keep only the live cache here and let the project save queue commit it.
    scheduleAssetCatalogPersistence(projectId);
    return;
  }
  const hasEmbeddedImages = embeddedCanvasImageStats(liveItems).occurrenceCount > 0;
  const hasManagedRuntimeImages =
    collectCanvasMediaStrings(
      liveItems,
      (value) => value.startsWith('blob:') && Boolean(stableCanvasMediaUrlForRuntime(value)),
    ).length > 0;
  if (hasEmbeddedImages || hasManagedRuntimeImages) {
    scheduleAssetCatalogPersistence(projectId);
    return;
  }
  try {
    const persistedItems = persistableAssetItems(liveItems);
    localStorage.setItem(projectAssetKey(projectId), JSON.stringify(persistedItems));
    unreadableProjectAssetIds.delete(projectId);
  } catch {
    scheduleAssetCatalogPersistence(projectId);
  }
}

function persistGlobalAssets(activeProjectId: string, items: AssetItem[]) {
  const normalized = items.map((item) => normalizeAssetSource(item, activeProjectId));
  const sourceIds = new Set([
    activeProjectId,
    ...projectAssetStates.keys(),
    ...normalized.map((item) => item.sourceProjectId as string),
  ]);
  for (const sourceProjectId of sourceIds) {
    persistAssets(
      sourceProjectId,
      normalized.filter((item) => item.sourceProjectId === sourceProjectId),
    );
  }
  return normalized;
}

function replaceGlobalAssetSource(
  assets: readonly AssetItem[],
  sourceProjectId: string,
  sourceItems: readonly AssetItem[],
) {
  const normalizedSource = sourceItems.map((asset) => normalizeAssetSource(asset, sourceProjectId));
  const sourceById = new Map(normalizedSource.map((asset) => [asset.id, asset]));
  const retainedIds = new Set<string>();
  const merged = assets.flatMap((asset) => {
    if (assetSourceProjectId(asset, sourceProjectId) !== sourceProjectId) return [asset];
    const replacement = sourceById.get(asset.id);
    if (!replacement) return [];
    retainedIds.add(asset.id);
    return [replacement];
  });
  for (const asset of normalizedSource) {
    if (!retainedIds.has(asset.id)) merged.push(asset);
  }
  return merged;
}

function projectTrashKey(projectId: string) {
  return `${TRASH_KEY}:${projectId}`;
}

const trashCache = new Map<string, TrashItem[]>();
const trashRevisions = new Map<string, number>();

function normalizeTrash(value: unknown, projectId: string): TrashItem[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is TrashItem =>
            Boolean(item) &&
            typeof item === 'object' &&
            (item as TrashItem).projectId === projectId &&
            Array.isArray((item as TrashItem).nodes) &&
            Array.isArray((item as TrashItem).edges),
        )
        .map(recoverPersistedTrashItem)
    : [];
}

function loadLegacyTrash(projectId: string): TrashItem[] {
  try {
    const raw = localStorage.getItem(projectTrashKey(projectId));
    if (!raw) return [];
    return normalizeTrash(JSON.parse(raw), projectId);
  } catch {
    return [];
  }
}

function hasLegacyTrash(projectId: string) {
  try {
    return localStorage.getItem(projectTrashKey(projectId)) !== null;
  } catch {
    return false;
  }
}

interface LegacyTrashStorageSnapshot {
  raw: string | null;
  trash: TrashItem[];
  valid: boolean;
}

function readLegacyTrashStorageSnapshot(projectId: string): LegacyTrashStorageSnapshot {
  try {
    const raw = localStorage.getItem(projectTrashKey(projectId));
    if (raw === null) return { raw, trash: [], valid: true };
    try {
      return {
        raw,
        trash: normalizeTrash(JSON.parse(raw), projectId),
        valid: true,
      };
    } catch {
      return { raw, trash: [], valid: false };
    }
  } catch {
    return { raw: null, trash: [], valid: false };
  }
}

type LegacyTrashCleanupResult = 'none' | 'removed' | 'changed' | 'different';

/**
 * Remove browser trash only when every existing copy still matches the
 * authoritative Bridge value. A malformed, changed, or divergent copy is a
 * recovery source and must remain untouched.
 */
async function removeEquivalentLegacyTrash(
  projectId: string,
  bridgeTrash: TrashItem[],
  expectedRuntimeRevision: number,
): Promise<LegacyTrashCleanupResult> {
  const local = readLegacyTrashStorageSnapshot(projectId);
  let indexedSource: unknown[] | null;
  try {
    indexedSource = await loadProjectTrash(projectId);
  } catch {
    return 'changed';
  }
  const copies: unknown[] = [];
  if (local.raw !== null) {
    if (!local.valid) return 'different';
    copies.push(local.trash);
  }
  if (indexedSource !== null) copies.push(normalizeTrash(indexedSource, projectId));
  if (copies.length === 0) return 'none';
  if (!legacyCopiesMatchBridge(bridgeTrash, copies)) return 'different';
  if ((trashRevisions.get(projectId) ?? 0) !== expectedRuntimeRevision) return 'changed';

  let currentLocalRaw: string | null;
  try {
    currentLocalRaw = localStorage.getItem(projectTrashKey(projectId));
  } catch {
    return 'changed';
  }
  if (currentLocalRaw !== local.raw) return 'changed';
  let currentIndexedSource: unknown[] | null;
  try {
    currentIndexedSource = await loadProjectTrash(projectId);
  } catch {
    return 'changed';
  }
  if (
    (indexedSource === null) !== (currentIndexedSource === null) ||
    !equivalentLegacyBridgeValue(indexedSource, currentIndexedSource) ||
    (trashRevisions.get(projectId) ?? 0) !== expectedRuntimeRevision
  ) {
    return 'changed';
  }
  await removeVerifiedLegacyTrash(projectId);
  return 'removed';
}

function loadTrash(projectId: string): TrashItem[] {
  const cached = trashCache.get(projectId);
  if (cached) return cached;
  const legacyExists = hasLegacyTrash(projectId);
  const legacy = loadLegacyTrash(projectId);
  if (legacyExists) bridgeLoadedTrashProjects.add(projectId);
  trashCache.set(projectId, legacy);
  return legacy;
}

async function hydrateTrash(projectId: string): Promise<TrashItem[]> {
  if (!usesLegacyPersistenceTestAdapter()) {
    const revision = trashRevisions.get(projectId) ?? 0;
    try {
      let stored = await readBridgeTrash<TrashItem[]>(projectId);
      if (stored && bridgeRevisionIsStale(projectId, stored.revision)) {
        stored = await readBridgeTrash<TrashItem[]>(projectId);
      }
      if (stored && bridgeRevisionIsStale(projectId, stored.revision)) {
        return loadTrash(projectId);
      }
      if ((trashRevisions.get(projectId) ?? 0) !== revision) return loadTrash(projectId);
      if (stored) {
        const trash = normalizeTrash(stored.trash, projectId);
        bridgeLoadedTrashProjects.add(projectId);
        trashCache.set(projectId, trash);
        observeBridgeRevision(projectId, stored.revision);
        const cleanup = await removeEquivalentLegacyTrash(projectId, trash, revision);
        if (cleanup === 'different') {
          publishPersistenceStatus({
            projectId,
            state: 'conflict',
            lastAttemptAt: Date.now(),
            revision: stored.revision,
            writerId: 'bridge',
            conflictCopyAvailable: false,
            message:
              'Bridge 回收站与旧浏览器回收站不同；系统已保留旧副本，需明确选择版本后才能清理。',
          });
        }
        return (trashRevisions.get(projectId) ?? 0) === revision ? trash : loadTrash(projectId);
      }

      // A missing Bridge project may still have a legacy browser trash record.
      // Read it once and only delete it after the Bridge has committed it.
      const legacy = readLegacyTrashStorageSnapshot(projectId);
      if (!legacy.valid) throw new Error('旧浏览器回收站无法读取，原记录已保留。');
      const indexedSource = await loadProjectTrash(projectId);
      const indexed = normalizeTrash(indexedSource, projectId);
      if (
        legacy.raw !== null &&
        indexedSource !== null &&
        !equivalentLegacyBridgeValue(legacy.trash, indexed)
      ) {
        throw new BridgeCanvasConflictError(
          0,
          'localStorage 与 IndexedDB 的旧回收站不同，原记录已保留。',
          'legacy-mismatch',
        );
      }
      const trash = legacy.raw !== null ? legacy.trash : indexed;
      if (!trash.length) return [];
      const mediaSession = new CanvasMediaPersistenceSession(projectId);
      const prepared = await prepareCanvasMediaValueForPersistence(
        trash,
        projectId,
        undefined,
        mediaSession,
      );
      const migrated = await writeBridgeTrash(projectId, prepared.value, 0);
      bridgeLoadedTrashProjects.add(projectId);
      observeBridgeRevision(projectId, migrated.revision);
      const verified = normalizeTrash(migrated.trash, projectId);
      trashCache.set(projectId, verified);
      try {
        await commitLegacyMediaAfterStorageCas(
          localStorage,
          [{ key: projectTrashKey(projectId), raw: legacy.raw }],
          async () => {
            const latestIndexedSource = await loadProjectTrash(projectId);
            if (
              (indexedSource === null) !== (latestIndexedSource === null) ||
              !equivalentLegacyBridgeValue(indexedSource, latestIndexedSource) ||
              (trashRevisions.get(projectId) ?? 0) !== revision
            ) {
              throw new LegacyStorageChangedError(`IndexedDB trash:${projectId}`);
            }
            await mediaSession.commitLegacyMigration();
          },
        );
        await commitLegacyMediaAfterStorageCas(
          localStorage,
          [{ key: projectTrashKey(projectId), raw: legacy.raw }],
          async () => {
            const latestIndexedSource = await loadProjectTrash(projectId);
            if (
              (indexedSource === null) !== (latestIndexedSource === null) ||
              !equivalentLegacyBridgeValue(indexedSource, latestIndexedSource) ||
              (trashRevisions.get(projectId) ?? 0) !== revision
            ) {
              throw new LegacyStorageChangedError(`runtime trash:${projectId}`);
            }
            await removeVerifiedLegacyTrash(projectId);
          },
        );
      } catch {
        // The Bridge trash is already durable. Redundant legacy media can be retried later.
      }
      return verified;
    } catch (error) {
      publishBridgePersistenceFailure(projectId, error, '回收站');
      return loadTrash(projectId);
    }
  }
  const revision = trashRevisions.get(projectId) ?? 0;
  try {
    const stored = await loadProjectTrash(projectId);
    if ((trashRevisions.get(projectId) ?? 0) !== revision) return loadTrash(projectId);
    const legacyExists = hasLegacyTrash(projectId);
    const legacy = loadLegacyTrash(projectId);
    const trash = legacyExists ? legacy : normalizeTrash(stored, projectId);
    trashCache.set(projectId, trash);
    if (legacyExists) await saveProjectTrash(projectId, trash);
    if (stored !== null || legacyExists) {
      try {
        localStorage.removeItem(projectTrashKey(projectId));
      } catch {
        /* localStorage unavailable */
      }
    }
    return trash;
  } catch {
    return loadTrash(projectId);
  }
}

async function persistTrash(projectId: string, items: TrashItem[]) {
  const trash = items.slice(0, 100);
  const persistedTrash = trash.map(recoverPersistedTrashItem);
  trashCache.set(projectId, trash);
  trashRevisions.set(projectId, (trashRevisions.get(projectId) ?? 0) + 1);
  if (!usesLegacyPersistenceTestAdapter()) {
    // Until the first Bridge read has established an authority, local edits are
    // session-only. Writing trash early could create or overwrite main-canvas
    // before the startup conflict guard has compared the host revision.
    if (initialBridgeHydrationBlocksPersistence()) return;
    bridgeLoadedTrashProjects.add(projectId);
    await enqueueBridgeTrashPersistence(projectId, persistedTrash);
    return;
  }
  let legacySaved = false;
  try {
    localStorage.setItem(projectTrashKey(projectId), JSON.stringify(persistedTrash));
    legacySaved = true;
  } catch {
    // Historical Vitest adapter only: production never enters this browser writer.
  }
  try {
    await saveProjectTrash(projectId, persistedTrash);
    localStorage.removeItem(projectTrashKey(projectId));
  } catch {
    if (!legacySaved) {
      try {
        localStorage.setItem(projectTrashKey(projectId), JSON.stringify(persistedTrash));
      } catch {
        /* Historical Vitest adapter stores are both unavailable. */
      }
    }
  }
}

async function removeProjectTrashStorage(projectId: string) {
  trashCache.delete(projectId);
  bridgeLoadedTrashProjects.delete(projectId);
  trashRevisions.set(projectId, (trashRevisions.get(projectId) ?? 0) + 1);
  if (!usesLegacyPersistenceTestAdapter()) return;
  try {
    localStorage.removeItem(projectTrashKey(projectId));
  } catch {
    /* localStorage unavailable */
  }
  try {
    await deleteProjectTrash(projectId);
  } catch {
    /* IndexedDB unavailable */
  }
}

async function removeVerifiedLegacyTrash(projectId: string) {
  if (!usesLegacyPersistenceTestAdapter()) {
    // Production intentionally leaves obsolete browser trash as a redundant,
    // read-only residual. Neither localStorage nor the historical IndexedDB
    // store offers a cross-tab CAS, so deleting here could erase a newer write
    // from a legacy tab. A future explicit cleanup can remove it under a safe
    // migration protocol; Bridge remains the only persistence authority now.
    return;
  }
  try {
    localStorage.removeItem(projectTrashKey(projectId));
  } catch {
    // The Bridge copy is already verified; a stale read-only legacy copy is safe.
  }
  try {
    await deleteProjectTrash(projectId);
  } catch {
    // IndexedDB is migration input only. Failure leaves a redundant old copy.
  }
}

// ---- Canvas auto-save (localStorage) ----
const CANVAS_KEY = 'kitty-canvas-state';
const LEGACY_CANVAS_KEY = 'libtv-canvas-state';
const CANVAS_STORAGE_VERSION = 6;
const CANVAS_WRITER_ID = genId('canvas-writer');

interface PersistedProjectRevision {
  revision: number;
  writerId: string;
  updatedAt: number;
}

export function isCanvasProjectRevisionConflict(
  expectedRevision: number,
  currentWriterId: string,
  incoming: Pick<PersistedProjectRevision, 'revision' | 'writerId'> | undefined,
  observedWriterId: string = currentWriterId,
) {
  return Boolean(
    incoming &&
    Number.isSafeInteger(incoming.revision) &&
    incoming.writerId !== currentWriterId &&
    (incoming.revision > expectedRevision ||
      (incoming.revision === expectedRevision && incoming.writerId !== observedWriterId)),
  );
}

const observedProjectRevisions = new Map<string, PersistedProjectRevision>();
const locallyEditedProjectCatalogIds = new Set<string>();
const locallyDeletedProjectIds = new Set<string>();

export interface WorkspaceSnapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ProjectCanvasSnapshot {
  workspace: WorkspaceId;
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  tabs: CanvasTab[];
  activeTabId: string;
}

interface PersistedProjectCanvasMeta {
  workspace: WorkspaceId;
  workspaceIds: WorkspaceId[];
  tabs: CanvasTab[];
  activeTabId: string;
}

export interface CanvasPersistenceConflictCopy {
  version: 1;
  projectId: string;
  detectedAt: number;
  localProject?: { id: string; name: string };
  remoteProject?: { id: string; name: string };
  localRevision?: PersistedProjectRevision;
  remoteRevision?: PersistedProjectRevision;
  localSnapshot?: ProjectCanvasSnapshot;
  remoteSnapshot?: ProjectCanvasSnapshot;
  /** Complete project-scoped payload captured from the current page. The older
   * snapshot fields remain for backward-compatible conflict exports. */
  localSharedProject?: SharedProjectWorkspace;
  remoteSharedProject?: SharedProjectWorkspace;
}

interface PersistedCanvas {
  version: number;
  activeProjectId: string;
  /** v1-v5 stored every project here; v6 reads this only as a migration fallback. */
  projectStates?: Record<string, ProjectCanvasSnapshot>;
  projectMeta?: Record<string, PersistedProjectCanvasMeta>;
  workspace: WorkspaceId;
  // Per-workspace saved state. Each workspace keeps its own edits so switching
  // between workspaces (and home) never wipes another canvas's content.
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  tabs: CanvasTab[];
  activeTabId: string;
  projectName: string;
  projects: { id: string; name: string }[];
  genParams: GenParams;
  activeTags: string[];
  projectRevisions?: Record<string, PersistedProjectRevision>;
}

export interface CanvasPersistenceStatus {
  projectId: string;
  state: 'idle' | 'saved' | 'error' | 'conflict';
  lastAttemptAt?: number;
  lastSavedAt?: number;
  message?: string;
  revision?: number;
  writerId?: string;
  conflictingWriterId?: string;
  conflictCopyAvailable?: boolean;
}

const projectPersistenceStatuses = new Map<string, CanvasPersistenceStatus>();
const projectPersistenceConflictCopies = new Map<string, CanvasPersistenceConflictCopy>();
const exportedCanvasPersistenceConflictCopies = new Map<
  string,
  { detectedAt: number; localSignature: string }
>();

export function getCanvasPersistenceConflictCopy(
  projectId: string,
): CanvasPersistenceConflictCopy | undefined {
  return projectPersistenceConflictCopies.get(projectId);
}

function currentCanvasPersistenceConflictCopy(
  projectId: string,
): CanvasPersistenceConflictCopy | undefined {
  const existing = getCanvasPersistenceConflictCopy(projectId);
  const state = useCanvasStore.getState();
  if (!existing || state.activeProjectId !== projectId) return existing;
  const localSnapshot = captureCanvasPersistenceIntent(state).projectStates.get(projectId);
  const localSharedProject = captureSharedProjectWorkspace();
  const refreshed = {
    ...existing,
    localProject: state.projects.find((project) => project.id === projectId),
    localRevision: observedProjectRevisions.get(projectId),
    localSnapshot,
    localSharedProject,
  };
  projectPersistenceConflictCopies.set(projectId, refreshed);
  return refreshed;
}

function canvasPersistenceConflictLocalSignature(copy: CanvasPersistenceConflictCopy) {
  const local = copy.localSharedProject ?? copy.localSnapshot;
  return local ? stringifyCanvasPersistence(local) : '';
}

export function exportCanvasPersistenceConflictCopy(projectId: string): string | undefined {
  const copy = currentCanvasPersistenceConflictCopy(projectId);
  if (!copy) return undefined;
  const localSignature = canvasPersistenceConflictLocalSignature(copy);
  if (!localSignature) return undefined;
  exportedCanvasPersistenceConflictCopies.set(projectId, {
    detectedAt: copy.detectedAt,
    localSignature,
  });
  return JSON.stringify(copy, null, 2);
}

function currentCanvasPersistenceConflictHasExportedBackup(projectId: string) {
  const copy = currentCanvasPersistenceConflictCopy(projectId);
  const exported = exportedCanvasPersistenceConflictCopies.get(projectId);
  return Boolean(
    copy &&
    exported &&
    exported.detectedAt === copy.detectedAt &&
    exported.localSignature === canvasPersistenceConflictLocalSignature(copy),
  );
}

function clearCanvasPersistenceConflict(projectId: string) {
  projectPersistenceConflictCopies.delete(projectId);
  exportedCanvasPersistenceConflictCopies.delete(projectId);
}

function persistenceStatusFor(projectId: string): CanvasPersistenceStatus {
  return (
    projectPersistenceStatuses.get(projectId) ?? {
      projectId,
      state: 'idle',
    }
  );
}

function publishPersistenceStatus(status: CanvasPersistenceStatus) {
  projectPersistenceStatuses.set(status.projectId, status);
  if (useCanvasStore.getState().activeProjectId === status.projectId) {
    useCanvasStore.setState({ persistenceStatus: status });
  }
}

function bridgeRevisionIsStale(projectId: string, revision: number) {
  const observed = observedProjectRevisions.get(projectId)?.revision;
  return Number.isSafeInteger(observed) && Number(observed) > revision;
}

function observeBridgeRevision(projectId: string, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0) return false;
  if (bridgeRevisionIsStale(projectId, revision)) return false;
  observedProjectRevisions.set(projectId, {
    revision,
    writerId: 'bridge',
    updatedAt: Date.now(),
  });
  return true;
}

function publishBridgePersistenceFailure(projectId: string, error: unknown, scope = '画布') {
  const attemptedAt = Date.now();
  if (error instanceof BridgeCanvasConflictError) {
    const remoteRevisionConflict = error.kind === 'remote-revision';
    const state = useCanvasStore.getState();
    const localSnapshot =
      projectId === state.activeProjectId
        ? captureCanvasPersistenceIntent(state).projectStates.get(projectId)
        : projectCanvasStates.get(projectId);
    const localSharedProject =
      projectId === state.activeProjectId ? captureSharedProjectWorkspace() : undefined;
    exportedCanvasPersistenceConflictCopies.delete(projectId);
    projectPersistenceConflictCopies.set(projectId, {
      version: 1,
      projectId,
      detectedAt: attemptedAt,
      localProject: state.projects.find((project) => project.id === projectId),
      localRevision: observedProjectRevisions.get(projectId),
      remoteRevision: {
        revision: error.currentRevision,
        writerId: remoteRevisionConflict ? 'bridge-remote' : 'bridge-local-read',
        updatedAt: attemptedAt,
      },
      localSnapshot,
      localSharedProject,
    });
    publishPersistenceStatus({
      projectId,
      state: 'conflict',
      lastAttemptAt: attemptedAt,
      revision: observedProjectRevisions.get(projectId)?.revision,
      writerId: 'bridge',
      conflictingWriterId: remoteRevisionConflict ? 'bridge-remote' : 'bridge-local-read',
      conflictCopyAvailable: Boolean(localSnapshot || localSharedProject),
      message: remoteRevisionConflict
        ? `${error.message}（主机当前修订 ${error.currentRevision}）。${scope}临时修改未覆盖主机数据；可先备份并载入主机版本。`
        : `${error.message}（读取到主机修订 ${error.currentRevision}）。${scope}当前修改仍保留在本页，且没有覆盖主机数据；可先备份并载入主机版本。`,
    });
    return;
  }
  const sessionOnly = error instanceof BridgeCanvasUnavailableError;
  publishPersistenceStatus({
    ...persistenceStatusFor(projectId),
    projectId,
    state: 'error',
    lastAttemptAt: attemptedAt,
    conflictCopyAvailable: false,
    message: sessionOnly
      ? `本机 Bridge 未启动或连接中断，${scope}当前处于临时会话模式；修改仍在页面内存中，但没有写入浏览器或磁盘，关闭或刷新页面会丢失。`
      : error instanceof Error && error.message.trim()
        ? error.message
        : `${scope}保存失败，当前修改仅保留在临时会话中。`,
  });
}

export interface SharedProjectWorkspace {
  version: 2;
  projectId: string;
  projectName: string;
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  tabs: CanvasTab[];
  assets: AssetItem[];
  trash: TrashItem[];
  genParams: GenParams;
  activeTags: string[];
  revision?: number;
  updatedAt?: number;
  workspace?: PersistedBridgeWorkspaceId;
  currentWorkspace?: PersistedBridgeWorkspaceId;
  activeWorkspace?: PersistedBridgeWorkspaceId;
  activeTabId?: string;
}

/** In-memory map of per-workspace canvas state. Survives tab/workspace switches
 * within a session, so we never have to reseed a visited canvas. */
const workspaceStates = new Map<WorkspaceId, WorkspaceSnapshot>();
const projectCanvasStates = new Map<string, ProjectCanvasSnapshot>();
const projectCanvasMeta = new Map<string, PersistedProjectCanvasMeta>();
const bridgeLoadedWorkspaces = new Set<string>();
const bridgeLoadedTrashProjects = new Set<string>();
const bridgeProjectCatalog = new Map<string, BridgeProjectCatalogItem>();
let applyingAuthoritativeBridgeSnapshot = false;

type InitialBridgeHydrationState = 'pending' | 'ready' | 'blocked';
let initialBridgeHydrationState: InitialBridgeHydrationState = usesLegacyPersistenceTestAdapter()
  ? 'ready'
  : 'pending';
let initialBridgeHydrationMutationEpoch = 0;

function initialBridgeHydrationBlocksPersistence() {
  return !usesLegacyPersistenceTestAdapter() && initialBridgeHydrationState !== 'ready';
}

function bridgeWorkspaceCacheKey(projectId: string, workspace: WorkspaceId) {
  return `${projectId}\u0000${workspace}`;
}

export function getSharedProjectLoadedScopes(projectId: string) {
  return { trash: bridgeLoadedTrashProjects.has(projectId) };
}

/**
 * LAN observation may start only after the fixed canvas has actually been
 * hydrated from the Bridge. A default `saved` status is not sufficient: the
 * store intentionally renders a temporary empty session while the first
 * Bridge read is pending.
 */
export function isBridgeCanvasAuthorityReadyForLan(projectId: string) {
  const state = useCanvasStore.getState();
  const status = state.persistenceStatus;
  if (
    state.activeProjectId !== projectId ||
    state.workspace === 'home' ||
    status.state !== 'saved' ||
    !Number.isSafeInteger(status.revision) ||
    Number(status.revision) < 0
  ) {
    return false;
  }
  // LAN unit tests inject an already-hydrated store snapshot directly instead
  // of running the asynchronous application bootstrap. Production must pass
  // the real hydration and loaded-workspace checks below.
  if (import.meta.env.MODE === 'test') return true;
  return (
    initialBridgeHydrationState === 'ready' &&
    bridgeLoadedWorkspaces.has(bridgeWorkspaceCacheKey(projectId, state.workspace))
  );
}

function normalizedWorkspaceIds(values: Iterable<string>, fallback?: WorkspaceId): WorkspaceId[] {
  const ids = new Set<WorkspaceId>();
  for (const value of values) {
    if (value !== 'home' && value in WORKSPACES) ids.add(value as WorkspaceId);
  }
  if (ids.size === 0 && fallback && fallback !== 'home') ids.add(fallback);
  return [...ids];
}

function projectMetaFromSnapshot(snapshot: ProjectCanvasSnapshot): PersistedProjectCanvasMeta {
  return {
    workspace: snapshot.workspace,
    workspaceIds: normalizedWorkspaceIds(Object.keys(snapshot.workspaces), snapshot.workspace),
    tabs: snapshot.tabs,
    activeTabId: snapshot.activeTabId,
  };
}

function projectSnapshotFromMeta(
  meta: PersistedProjectCanvasMeta,
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>,
): ProjectCanvasSnapshot {
  return {
    workspace: meta.workspace,
    workspaces,
    tabs: meta.tabs,
    activeTabId: meta.activeTabId,
  };
}

type CanvasRootWorkspaceReadResult =
  | { status: 'found'; snapshot: WorkspaceSnapshot; storageVersion: number }
  | { status: 'missing' }
  | { status: 'error'; error: Error };

function readWorkspaceFromParsedCanvasRoot(
  parsed: PersistedCanvas & { nodes?: FlowNode[]; edges?: FlowEdge[] },
  projectId: string,
  workspace: WorkspaceId,
): CanvasRootWorkspaceReadResult {
  const projectSnapshot = parsed.projectStates?.[projectId]?.workspaces?.[workspace];
  const activeWorkspaceSnapshot =
    parsed.activeProjectId === projectId ? parsed.workspaces?.[workspace] : undefined;
  if (
    projectSnapshot &&
    activeWorkspaceSnapshot &&
    stringifyCanvasPersistence(projectSnapshot) !==
      stringifyCanvasPersistence(activeWorkspaceSnapshot)
  ) {
    return {
      status: 'error',
      error: new Error(
        `项目“${projectId}”的 ${workspace} 工作台在画布根快照内存在两份不同的数据。两份数据均已原样保留，自动保存已停止；请勿清理浏览器数据，待在恢复流程中选择版本后再继续。`,
      ),
    };
  }
  const flatWorkspaceSnapshot =
    !projectSnapshot &&
    !activeWorkspaceSnapshot &&
    parsed.activeProjectId === projectId &&
    parsed.workspace === workspace &&
    Array.isArray(parsed.nodes)
      ? { nodes: parsed.nodes, edges: parsed.edges ?? [] }
      : undefined;
  const snapshot = projectSnapshot ?? activeWorkspaceSnapshot ?? flatWorkspaceSnapshot;
  return snapshot
    ? {
        status: 'found',
        snapshot,
        storageVersion: Number.isFinite(parsed.version) ? parsed.version : 1,
      }
    : { status: 'missing' };
}

function readWorkspaceFromCanvasRoot(
  projectId: string,
  workspace: WorkspaceId,
  storage: Pick<Storage, 'getItem'> = localStorage,
): CanvasRootWorkspaceReadResult {
  try {
    const raw = storage.getItem(CANVAS_KEY) ?? storage.getItem(LEGACY_CANVAS_KEY);
    if (raw === null) return { status: 'missing' };
    const parsed = parseCanvasPersistence<
      PersistedCanvas & { nodes?: FlowNode[]; edges?: FlowEdge[] }
    >(raw);
    return readWorkspaceFromParsedCanvasRoot(parsed, projectId, workspace);
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? `（${error.message}）` : '';
    return {
      status: 'error',
      error: new Error(`本地画布根快照读取失败${detail}。原始数据已保留，自动保存已停止。`),
    };
  }
}

function readProjectFromCanvasRoot(projectId: string): ProjectSnapshotLoadResult {
  try {
    const raw = localStorage.getItem(CANVAS_KEY) ?? localStorage.getItem(LEGACY_CANVAS_KEY);
    if (raw === null) return { status: 'missing' };
    const parsed = parseCanvasPersistence<PersistedCanvas>(raw);
    const snapshot = parsed.projectStates?.[projectId];
    return snapshot ? { status: 'found', snapshot } : { status: 'missing' };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error : new Error('旧项目画布读取失败。'),
    };
  }
}

function readPersistedWorkspaceSnapshot(
  projectId: string,
  workspace: WorkspaceId,
  storage: Pick<Storage, 'getItem'> = localStorage,
): CanvasWorkspaceReadResult<WorkspaceSnapshot> {
  const split = readCanvasWorkspaceSnapshot<WorkspaceSnapshot>(storage, projectId, workspace);
  const embedded = readWorkspaceFromCanvasRoot(projectId, workspace, storage);
  return reconcilePersistedWorkspaceSnapshot(projectId, workspace, split, embedded);
}

function reconcilePersistedWorkspaceSnapshot(
  projectId: string,
  workspace: WorkspaceId,
  split: CanvasWorkspaceReadResult<WorkspaceSnapshot>,
  embedded: CanvasRootWorkspaceReadResult,
): CanvasWorkspaceReadResult<WorkspaceSnapshot> {
  // v1-v5 roots remain authoritative until the v6 catalog commit succeeds.
  // A partially written split from an interrupted migration must never replace
  // the still-complete legacy root.
  if (embedded.status === 'found' && embedded.storageVersion < CANVAS_STORAGE_VERSION) {
    return { status: 'found', snapshot: embedded.snapshot };
  }
  if (embedded.status === 'error') return embedded;
  if (embedded.status === 'found' && split.status === 'found') {
    if (
      stringifyCanvasPersistence(embedded.snapshot) !== stringifyCanvasPersistence(split.snapshot)
    ) {
      return {
        status: 'error',
        error: new Error(
          `项目“${projectId}”的 ${workspace} 工作台存在两份不同的本地快照。两份数据均已保留，自动保存已停止；请勿清理浏览器数据，待在恢复流程中选择版本后再继续。`,
        ),
      };
    }
    return split;
  }
  if (split.status === 'error') return split;
  if (embedded.status === 'found') return { status: 'found', snapshot: embedded.snapshot };
  return split;
}

function readAllPersistedProjectWorkspaces(projectId: string) {
  const loaded = projectCanvasStates.get(projectId)?.workspaces ?? {};
  const meta = projectCanvasMeta.get(projectId);
  const workspaceIds = normalizedWorkspaceIds(
    [...(meta?.workspaceIds ?? []), ...Object.keys(loaded)],
    meta?.workspace,
  );
  const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = { ...loaded };
  let complete = true;
  let error: Error | undefined;
  for (const workspace of workspaceIds) {
    const result = readPersistedWorkspaceSnapshot(projectId, workspace);
    if (result.status === 'error') {
      complete = false;
      error ??= result.error;
      continue;
    }
    if (!workspaces[workspace] && result.status === 'found') {
      workspaces[workspace] = result.snapshot;
    } else if (!workspaces[workspace] && result.status === 'missing') {
      complete = false;
    }
  }
  return { workspaces, complete, error };
}

function readPersistedProjectSnapshot(
  projectId: string,
  meta: PersistedProjectCanvasMeta | undefined,
): ProjectCanvasSnapshot | undefined {
  if (!meta) return undefined;
  const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
  for (const workspace of meta.workspaceIds) {
    const result = readPersistedWorkspaceSnapshot(projectId, workspace);
    if (result.status !== 'found') return undefined;
    workspaces[workspace] = result.snapshot;
  }
  return projectSnapshotFromMeta(meta, workspaces);
}

interface MediaReferences {
  browserVideoIds: Set<string>;
  bridgeAssetIds: Set<string>;
  blobUrls: Set<string>;
  complete: boolean;
}

function collectMediaUrl(reference: MediaReferences, value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaUrl(reference, item));
    return;
  }
  if (typeof value !== 'string' || !value) return;
  if (value.startsWith('blob:')) reference.blobUrls.add(value);
  try {
    const pathname = new URL(value, 'http://qiansi.invalid').pathname;
    const match = pathname.match(/^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/);
    if (match?.[1]) reference.bridgeAssetIds.add(match[1]);
  } catch {
    /* Non-URL text cannot identify persisted media. */
  }
}

function collectNodeMediaReferences(reference: MediaReferences, node: FlowNode) {
  if (typeof node.data.assetVideoId === 'string') {
    reference.browserVideoIds.add(node.data.assetVideoId);
  }
  if (typeof node.data.bridgeAssetId === 'string') {
    reference.bridgeAssetIds.add(node.data.bridgeAssetId);
  }
  // Keep cleanup aligned with the recursive persistence contract. Nested
  // director subjects, port caches, marks, masks and frozen submissions can be
  // the final live reference to the same bridge asset.
  for (const value of collectCanvasMediaStrings(node.data, () => true)) {
    collectMediaUrl(reference, value);
  }
}

function collectAssetMediaReferences(reference: MediaReferences, asset: AssetItem) {
  if (asset.videoStorageId) reference.browserVideoIds.add(asset.videoStorageId);
  if (asset.bridgeAssetId) reference.bridgeAssetIds.add(asset.bridgeAssetId);
  for (const value of [
    asset.originalUrl,
    asset.previewUrl,
    asset.imageUrl,
    asset.videoUrl,
    asset.audioUrl,
    ...(asset.images ?? []),
    ...(asset.videos ?? []),
    ...(asset.audios ?? []),
  ]) {
    collectMediaUrl(reference, value);
  }
}

async function collectMediaReferences(state: CanvasState): Promise<MediaReferences> {
  const browserVideoIds = new Set<string>();
  const bridgeAssetIds = new Set<string>();
  const blobUrls = new Set<string>();
  const references = { browserVideoIds, bridgeAssetIds, blobUrls, complete: true };
  const visitNodes = (nodes: FlowNode[]) => {
    for (const node of nodes) collectNodeMediaReferences(references, node);
  };

  visitNodes(state.nodes);
  for (const project of state.projects) {
    const persisted = readAllPersistedProjectWorkspaces(project.id);
    if (!persisted.complete) references.complete = false;
    for (const workspace of Object.values(persisted.workspaces)) {
      if (workspace) visitNodes(workspace.nodes);
    }
  }
  for (const project of state.projects) {
    for (const item of await hydrateTrash(project.id)) visitNodes(item.nodes);
  }
  for (const asset of state.assets) collectAssetMediaReferences(references, asset);
  if (unreadableProjectAssetIds.size > 0) references.complete = false;
  return references;
}

async function cleanupTrashMedia(item: TrashItem, state: CanvasState) {
  const referenced = await collectMediaReferences(state);
  if (!referenced.complete) return;
  const browserVideoIds = new Set<string>();
  const bridgeAssetIds = new Set<string>();
  const blobUrls = new Set<string>();
  for (const node of item.nodes) {
    if (
      typeof node.data.assetVideoId === 'string' &&
      !referenced.browserVideoIds.has(node.data.assetVideoId)
    ) {
      browserVideoIds.add(node.data.assetVideoId);
    }
    if (
      typeof node.data.bridgeAssetId === 'string' &&
      !referenced.bridgeAssetIds.has(node.data.bridgeAssetId)
    ) {
      bridgeAssetIds.add(node.data.bridgeAssetId);
    }
    const mediaUrls = collectCanvasMediaStrings(node.data, () => true);
    for (const url of mediaUrls) {
      if (typeof url === 'string' && url.startsWith('blob:') && !referenced.blobUrls.has(url)) {
        blobUrls.add(url);
      }
    }
  }
  for (const url of blobUrls) URL.revokeObjectURL(url);
  await Promise.allSettled([
    ...Array.from(browserVideoIds, (id) => deleteAssetVideo(id)),
    ...Array.from(bridgeAssetIds, (id) => deleteBridgeAsset(id)),
  ]);
}

function collectWorkspaceStates(): Partial<Record<WorkspaceId, WorkspaceSnapshot>> {
  const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
  for (const [id, snapshot] of workspaceStates) workspaces[id] = snapshot;
  return workspaces;
}

function replaceWorkspaceStates(workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>) {
  workspaceStates.clear();
  for (const [id, snapshot] of Object.entries(workspaces)) {
    if (id && snapshot) {
      workspaceStates.set(id as WorkspaceId, {
        ...snapshot,
        nodes: snapshot.nodes.map(migrateLegacyDirectorNode),
      });
    }
  }
}

function createFreshProjectSnapshot(workspace: WorkspaceId = 'views'): ProjectCanvasSnapshot {
  const targetWorkspace = workspace === 'home' ? 'views' : workspace;
  const seed = loadWorkspace(targetWorkspace);
  const tabId = genId('tab');
  return {
    workspace: targetWorkspace,
    workspaces: { [targetWorkspace]: seed },
    tabs: [{ id: tabId, name: '画板 1', workspace: targetWorkspace }],
    activeTabId: tabId,
  };
}

interface SanitizeNodesOptions {
  recoverInterruptedMediaGeneration?: boolean;
  /** @deprecated Compatibility alias for canvas snapshots written before media-wide recovery. */
  recoverInterruptedImageGeneration?: boolean;
}

type RecoverableMediaKind = 'image' | 'video' | 'audio' | '3d';
type RecoverableGenerationKind = RecoverableMediaKind | 'text';

const INTERRUPTED_GENERATION_MESSAGE: Record<RecoverableGenerationKind, string> = {
  image:
    '页面刷新后正在自动检查图片生成结果；任务可能仍在后台生成，也可点击“检查生成结果”立即检查。',
  video:
    '页面刷新后正在自动检查视频生成结果；任务可能仍在后台生成，也可点击“检查生成结果”立即检查。',
  audio:
    '页面刷新后正在自动检查音频生成结果；任务可能仍在后台生成，也可点击“检查生成结果”立即检查。',
  '3d': '页面刷新后正在自动检查 3D 模型生成结果；任务可能仍在后台生成，也可点击“检查生成结果”立即检查。',
  text: '页面刷新后正在自动检查文本生成结果；任务可能仍在后台生成，也可点击“检查生成结果”立即检查。',
};

const UNRESOLVED_GENERATION_RESULT_REPLACEMENT_MESSAGE =
  '原生成请求的状态尚未确认，为避免后台结果覆盖新内容，本次替换未应用。请先检查生成结果。';

function recoverableMediaKind(node: FlowNode): RecoverableMediaKind | undefined {
  if (node.data.kind === 'model-3d') return '3d';
  return node.data.kind === 'image' || node.data.kind === 'video' || node.data.kind === 'audio'
    ? node.data.kind
    : undefined;
}

function recoverableGenerationKind(node: FlowNode): RecoverableGenerationKind | undefined {
  return node.data.kind === 'text' ? 'text' : recoverableMediaKind(node);
}

function generationMediaSource(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? resolveMediaSourceUrl(value.trim()) : null;
}

function generationMediaSources(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const source = generationMediaSource(item);
        return source ? [source] : [];
      })
    : [];
}

function generationMediaSignature(node: FlowNode): string | undefined {
  const kind = recoverableMediaKind(node);
  if (!kind) return undefined;
  if (kind === 'image') {
    return JSON.stringify({
      imageUrl: generationMediaSource(node.data.imageUrl),
      images: generationMediaSources(node.data.images),
      originalUrl: generationMediaSource(node.data.originalUrl),
    });
  }
  if (kind === 'video') {
    return JSON.stringify({
      videoUrl: generationMediaSource(node.data.videoUrl),
      videos: generationMediaSources(node.data.videos),
      originalUrl: generationMediaSource(node.data.originalUrl),
      assetVideoId: typeof node.data.assetVideoId === 'string' ? node.data.assetVideoId : null,
      effectVideoId: typeof node.data.effectVideoId === 'string' ? node.data.effectVideoId : null,
    });
  }
  if (kind === '3d') {
    return JSON.stringify({
      model3dUrl: generationMediaSource(node.data.model3dUrl),
      models3d: generationMediaSources(node.data.models3d),
    });
  }
  return JSON.stringify({
    audioUrl: generationMediaSource(node.data.audioUrl),
    audios: generationMediaSources(node.data.audios),
  });
}

function generationResultSignature(node: FlowNode): string | undefined {
  if (node.data.kind === 'text') {
    return JSON.stringify({
      outputText: typeof node.data.outputText === 'string' ? node.data.outputText : null,
      output: typeof node.data.output === 'string' ? node.data.output : null,
    });
  }
  return generationMediaSignature(node);
}

function generationTargetMediaSignature(node: FlowNode): string | undefined {
  return typeof node.data.generationTargetMediaSignature === 'string' &&
    node.data.generationTargetMediaSignature
    ? node.data.generationTargetMediaSignature
    : generationResultSignature(node);
}

/** Clear transient flags while retaining interrupted bridge-backed generation requests on restore. */
export function sanitizeNodes(nodes: FlowNode[], options: SanitizeNodesOptions = {}): FlowNode[] {
  const groupIds = new Set(nodes.filter((n) => n.data.kind === 'group').map((n) => n.id));
  return nodes.map((rawNode) => {
    const node = migrateLegacyDirectorNode(rawNode);
    const browserStoredVideo = Boolean(node.data.assetVideoId || node.data.effectVideoId);
    const volatileVideoUrl =
      browserStoredVideo &&
      typeof node.data.videoUrl === 'string' &&
      node.data.videoUrl.startsWith('blob:');
    const generationKind = recoverableGenerationKind(node);
    const canRecoverInterruptedGeneration = Boolean(
      (options.recoverInterruptedMediaGeneration || options.recoverInterruptedImageGeneration) &&
      generationKind &&
      typeof node.data.generationRequestId === 'string' &&
      node.data.generationRequestId.trim(),
    );
    const interruptedMessage = generationKind
      ? INTERRUPTED_GENERATION_MESSAGE[generationKind]
      : undefined;
    return {
      ...node,
      expandParent: node.parentId && groupIds.has(node.parentId) ? true : node.expandParent,
      data: {
        ...node.data,
        ...(volatileVideoUrl
          ? {
              originalUrl: undefined,
              videoUrl: undefined,
              videos: undefined,
              output: undefined,
            }
          : {}),
        generating: false,
        generationRequestId: canRecoverInterruptedGeneration
          ? node.data.generationRequestId
          : undefined,
        generationTargetMediaSignature: canRecoverInterruptedGeneration
          ? generationTargetMediaSignature(node)
          : undefined,
        ...(canRecoverInterruptedGeneration
          ? {
              generationError: interruptedMessage,
              result: interruptedMessage,
            }
          : {}),
        progress: 0,
      },
    };
  });
}

export function restoreTrashIntoSnapshot(
  snapshot: WorkspaceSnapshot,
  item: TrashItem,
): WorkspaceSnapshot & { restoredNodeCount: number } {
  const existingNodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const restoredNodes = sanitizeNodes(
    item.nodes
      .filter((node) => !existingNodeIds.has(node.id))
      .map((node) => ({ ...node, selected: false, dragging: false })),
  );
  if (restoredNodes.length === 0) return { ...snapshot, restoredNodeCount: 0 };

  const restoredNodeIds = new Set(restoredNodes.map((node) => node.id));
  const nodes = [...snapshot.nodes, ...restoredNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const existingEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
  const edges = [...snapshot.edges];
  for (const edge of item.edges) {
    if (
      existingEdgeIds.has(edge.id) ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      (!restoredNodeIds.has(edge.source) && !restoredNodeIds.has(edge.target))
    ) {
      continue;
    }
    const ports = resolveConnectionPorts(
      nodes,
      edge.source,
      edge.sourceHandle,
      edge.target,
      edge.targetHandle,
    );
    if (
      !ports ||
      !isValidConnection(nodes, edges, edge.source, ports.source.id, edge.target, ports.target.id)
    ) {
      continue;
    }
    edges.push({
      ...edge,
      selected: false,
      sourceHandle: ports.source.id,
      targetHandle: ports.target.id,
    });
    existingEdgeIds.add(edge.id);
  }
  return {
    nodes: syncMaterializedGraphInputs(nodes, edges),
    edges,
    restoredNodeCount: restoredNodes.length,
  };
}

function resolveProjectSnapshot(snapshot: ProjectCanvasSnapshot) {
  replaceWorkspaceStates(snapshot.workspaces);
  const workspace = snapshot.workspace;
  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];
  if (workspace !== 'home') {
    const saved = snapshot.workspaces[workspace] ?? loadWorkspace(workspace);
    workspaceStates.set(workspace, saved);
    nodes = sanitizeNodes(saved.nodes, { recoverInterruptedMediaGeneration: true });
    edges = saved.edges;
    nodes = syncMaterializedGraphInputs(syncConnectedTextPrompts(nodes, edges), edges);
  }
  const fallbackTab: CanvasTab = {
    id: genId('tab'),
    name: '画板 1',
    workspace: workspace === 'home' ? 'views' : workspace,
  };
  const tabs = snapshot.tabs.length ? snapshot.tabs : [fallbackTab];
  const activeTabId = tabs.some((tab) => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : (tabs[0]?.id ?? fallbackTab.id);
  return { workspace, nodes, edges, tabs, activeTabId };
}

type ProjectSnapshotLoadResult =
  | { status: 'found'; snapshot: ProjectCanvasSnapshot }
  | { status: 'missing' }
  | { status: 'error'; error: Error };

function loadProjectCanvasSnapshot(projectId: string): ProjectSnapshotLoadResult {
  const cached = projectCanvasStates.get(projectId);
  if (cached) return { status: 'found', snapshot: cached };
  const meta = projectCanvasMeta.get(projectId);
  if (!meta) {
    const legacy = readProjectFromCanvasRoot(projectId);
    if (legacy.status === 'found') {
      projectCanvasMeta.set(projectId, projectMetaFromSnapshot(legacy.snapshot));
      return legacy;
    }
    // A catalog-only project (for example one just announced by LAN sharing)
    // has no persisted-workspace claim yet. Storage unavailability must not
    // make that project impossible to open; only an existing meta descriptor
    // is treated as authoritative and fail-closed below.
    const fresh = createFreshProjectSnapshot('views');
    projectCanvasMeta.set(projectId, projectMetaFromSnapshot(fresh));
    return { status: 'found', snapshot: fresh };
  }
  if (meta.workspace === 'home') {
    return { status: 'found', snapshot: projectSnapshotFromMeta(meta, {}) };
  }
  const persisted = readPersistedWorkspaceSnapshot(projectId, meta.workspace);
  if (persisted.status === 'found') {
    return {
      status: 'found',
      snapshot: projectSnapshotFromMeta(meta, { [meta.workspace]: persisted.snapshot }),
    };
  }
  if (persisted.status === 'error') return persisted;
  if (meta.workspaceIds.includes(meta.workspace)) {
    return {
      status: 'error',
      error: new Error(`项目“${projectId}”的 ${meta.workspace} 工作台快照缺失。`),
    };
  }
  const seed = loadWorkspace(meta.workspace);
  return {
    status: 'found',
    snapshot: projectSnapshotFromMeta(meta, { [meta.workspace]: seed }),
  };
}

type PersistedCanvasWithLegacyWorkspace = PersistedCanvas & {
  nodes?: FlowNode[];
  edges?: FlowEdge[];
};

interface CanvasRootRecoveryPlan {
  sourceKey: typeof CANVAS_KEY | typeof LEGACY_CANVAS_KEY;
  sourceRaw: string;
  root: PersistedCanvasWithLegacyWorkspace;
}

interface CanvasAssetCatalogPersistencePlan {
  sourceFingerprint: string;
  plan: PreparedCanvasAssetCatalog<AssetItem>;
}

interface CanvasPersistenceIntent {
  state: CanvasState;
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  projectStates: Map<string, ProjectCanvasSnapshot>;
  projectMeta: Map<string, PersistedProjectCanvasMeta>;
  dirtyProjectIds: Set<string>;
  deletedProjectIds: Set<string>;
  rootRecovery?: CanvasRootRecoveryPlan;
  sourceProjectStates?: Map<string, ProjectCanvasSnapshot>;
  assetCatalogs?: Map<string, CanvasAssetCatalogPersistencePlan>;
}

function captureCanvasPersistenceIntent(state: CanvasState): CanvasPersistenceIntent {
  if (state.workspace !== 'home') {
    workspaceStates.set(state.workspace, { nodes: state.nodes, edges: state.edges });
  }
  const workspaces = collectWorkspaceStates();
  projectCanvasStates.set(state.activeProjectId, {
    workspace: state.workspace,
    workspaces,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  });
  const previousMeta = projectCanvasMeta.get(state.activeProjectId);
  projectCanvasMeta.set(state.activeProjectId, {
    workspace: state.workspace,
    workspaceIds: normalizedWorkspaceIds(
      [...(previousMeta?.workspaceIds ?? []), ...Object.keys(workspaces)],
      state.workspace,
    ),
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  });
  return {
    state,
    workspaces,
    projectStates: new Map(projectCanvasStates),
    projectMeta: new Map(projectCanvasMeta),
    dirtyProjectIds: new Set([
      state.activeProjectId,
      ...locallyEditedProjectCatalogIds,
      ...locallyDeletedProjectIds,
    ]),
    deletedProjectIds: new Set(locallyDeletedProjectIds),
  };
}

function recordCanvasPersistenceConflict(
  intent: CanvasPersistenceIntent,
  latest: PersistedCanvas | null,
  projectId: string,
  remoteRevision: PersistedProjectRevision,
  detectedAt: number,
) {
  const localProject = intent.state.projects.find((project) => project.id === projectId);
  const remoteProject = latest?.projects.find((project) => project.id === projectId);
  exportedCanvasPersistenceConflictCopies.delete(projectId);
  projectPersistenceConflictCopies.set(projectId, {
    version: 1,
    projectId,
    detectedAt,
    localProject: localProject ? { ...localProject } : undefined,
    remoteProject: remoteProject ? { ...remoteProject } : undefined,
    localRevision: observedProjectRevisions.get(projectId),
    remoteRevision,
    localSnapshot: intent.projectStates.get(projectId),
    localSharedProject:
      projectId === intent.state.activeProjectId ? captureSharedProjectWorkspace() : undefined,
    remoteSnapshot:
      latest?.projectStates?.[projectId] ??
      readPersistedProjectSnapshot(projectId, latest?.projectMeta?.[projectId]),
  });
}

function canvasRootWithoutWorkspacePayloads(value: PersistedCanvas): PersistedCanvas {
  return {
    ...value,
    projectStates: {},
    workspaces: {},
  };
}

function hasCanvasRootWorkspacePayloads(value: PersistedCanvas) {
  return (
    Object.keys(value.projectStates ?? {}).length > 0 ||
    Object.keys(value.workspaces ?? {}).length > 0
  );
}

function hasLegacyFlatCanvasWorkspace(value: PersistedCanvasWithLegacyWorkspace) {
  return Array.isArray(value.nodes);
}

function canvasRootPayloadProjectIds(value: PersistedCanvasWithLegacyWorkspace) {
  const projectIds = new Set(Object.keys(value.projectStates ?? {}));
  if (Object.keys(value.workspaces ?? {}).length > 0 || hasLegacyFlatCanvasWorkspace(value)) {
    projectIds.add(value.activeProjectId);
  }
  return projectIds;
}

function projectSnapshotFromCanvasRootPayload(
  value: PersistedCanvasWithLegacyWorkspace,
  projectId: string,
): ProjectCanvasSnapshot | undefined {
  const projectSnapshot = value.projectStates?.[projectId];
  if (projectSnapshot) return projectSnapshot;
  if (value.activeProjectId !== projectId) return undefined;
  const workspace = value.workspace === 'home' ? 'views' : (value.workspace ?? 'views');
  const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {
    ...(value.workspaces ?? {}),
  };
  if (Object.keys(workspaces).length === 0 && Array.isArray(value.nodes)) {
    workspaces[workspace] = { nodes: value.nodes, edges: value.edges ?? [] };
  }
  if (Object.keys(workspaces).length === 0) return undefined;
  return {
    workspace,
    workspaces,
    tabs: value.tabs ?? [],
    activeTabId: value.activeTabId,
  };
}

function canvasRootWithPreparedWorkspaces(
  value: PersistedCanvasWithLegacyWorkspace,
  projectStates: ReadonlyMap<string, ProjectCanvasSnapshot>,
  deletedProjectIds: ReadonlySet<string>,
): PersistedCanvasWithLegacyWorkspace {
  const projectStatesEntries = Object.entries(value.projectStates ?? {}).flatMap(
    ([projectId, snapshot]) => {
      if (deletedProjectIds.has(projectId)) return [];
      return [[projectId, projectStates.get(projectId) ?? snapshot] as const];
    },
  );
  const activeSnapshot = deletedProjectIds.has(value.activeProjectId)
    ? undefined
    : projectStates.get(value.activeProjectId);
  const root: PersistedCanvasWithLegacyWorkspace = {
    ...value,
    projectStates:
      value.projectStates === undefined ? undefined : Object.fromEntries(projectStatesEntries),
    workspace: activeSnapshot?.workspace ?? value.workspace,
    workspaces: activeSnapshot?.workspaces ?? value.workspaces ?? {},
    tabs: activeSnapshot?.tabs ?? value.tabs,
    activeTabId: activeSnapshot?.activeTabId ?? value.activeTabId,
  };
  delete root.nodes;
  delete root.edges;
  return root;
}

function hasSplitCopiesForCanvasRootPayloads(value: PersistedCanvas) {
  const entries = new Map<string, WorkspaceSnapshot>();
  const addExpectedSnapshot = (
    projectId: string,
    workspace: string,
    snapshot: WorkspaceSnapshot,
  ) => {
    const key = `${projectId}\u0000${workspace}`;
    const existing = entries.get(key);
    if (existing && stringifyCanvasPersistence(existing) !== stringifyCanvasPersistence(snapshot)) {
      return false;
    }
    entries.set(key, snapshot);
    return true;
  };
  for (const [projectId, snapshot] of Object.entries(value.projectStates ?? {})) {
    for (const [workspace, workspaceSnapshot] of Object.entries(snapshot.workspaces)) {
      if (
        workspace !== 'home' &&
        workspaceSnapshot &&
        !addExpectedSnapshot(projectId, workspace, workspaceSnapshot)
      ) {
        return false;
      }
    }
  }
  for (const [workspace, workspaceSnapshot] of Object.entries(value.workspaces ?? {})) {
    if (
      workspace !== 'home' &&
      workspaceSnapshot &&
      !addExpectedSnapshot(value.activeProjectId, workspace, workspaceSnapshot)
    ) {
      return false;
    }
  }
  return [...entries].every(([entry, expectedSnapshot]) => {
    const separator = entry.indexOf('\u0000');
    const persisted = readCanvasWorkspaceSnapshot<WorkspaceSnapshot>(
      localStorage,
      entry.slice(0, separator),
      entry.slice(separator + 1),
    );
    return (
      persisted.status === 'found' &&
      stringifyCanvasPersistence(persisted.snapshot) ===
        stringifyCanvasPersistence(expectedSnapshot)
    );
  });
}

function canvasPersistenceErrorMessage(error: unknown) {
  const errorName = error instanceof DOMException ? error.name : '';
  const errorMessage = error instanceof Error ? error.message.trim() : '';
  if (errorName === 'QuotaExceededError' || /quota|exceeded the quota/i.test(errorMessage)) {
    return '画布本地保存空间不足。当前修改仍保留在页面中，系统会优先把内嵌原图迁移到本机素材库或 IndexedDB 后重试。请保持页面打开；若仍失败，请逐个工作台分别导出工作流和全部素材后再清理，切勿直接清空浏览器数据。';
  }
  return errorMessage || '画布自动保存失败，本次修改仍只保留在当前内存中。';
}

/** Execute one already-captured write while the cross-tab persistence lock is held. */
function persistCanvasUnlocked(intent: CanvasPersistenceIntent): boolean {
  const { state } = intent;
  const attemptedAt = Date.now();
  const workspaceWriteRollbacks: Array<{ key: string; previous: string | null }> = [];
  let shrunkRootBackup: string | undefined;
  let rootCommitted = false;
  try {
    const latestRaw = localStorage.getItem(CANVAS_KEY);
    const latest = latestRaw ? parseCanvasPersistence<PersistedCanvas>(latestRaw) : null;
    const dirtyProjectIds = intent.dirtyProjectIds;
    for (const projectId of dirtyProjectIds) {
      const observedRevision = observedProjectRevisions.get(projectId);
      const expectedRevision = observedRevision?.revision ?? 0;
      const incomingRevision = latest?.projectRevisions?.[projectId];
      if (
        isCanvasProjectRevisionConflict(
          expectedRevision,
          CANVAS_WRITER_ID,
          incomingRevision,
          observedRevision?.writerId,
        )
      ) {
        const conflictingRevision = incomingRevision as PersistedProjectRevision;
        recordCanvasPersistenceConflict(
          intent,
          latest,
          projectId,
          conflictingRevision,
          attemptedAt,
        );
        const conflictStatus: CanvasPersistenceStatus = {
          projectId,
          state: 'conflict',
          lastAttemptAt: attemptedAt,
          revision: expectedRevision,
          writerId: CANVAS_WRITER_ID,
          conflictingWriterId: conflictingRevision.writerId,
          conflictCopyAvailable: true,
          message: `画布已在另一个标签页更新到修订 ${conflictingRevision.revision}。为避免覆盖，当前标签页已停止自动保存；请刷新后继续，或导出冲突副本。`,
        };
        projectPersistenceStatuses.set(projectId, conflictStatus);
        publishPersistenceStatus(
          projectId === state.activeProjectId
            ? conflictStatus
            : {
                ...conflictStatus,
                projectId: state.activeProjectId,
                message: `画布已在另一个标签页更新。为避免覆盖，本次保存已停止；请刷新后继续，或导出冲突副本。`,
              },
        );
        return false;
      }
    }

    for (const [projectId, assetCatalog] of intent.assetCatalogs ?? []) {
      const currentItems = projectAssetStates.get(projectId) ?? [];
      if (assetCatalogFingerprint(currentItems) !== assetCatalog.sourceFingerprint) {
        throw new CanvasAssetPersistenceConflictError(
          `项目“${projectId}”的素材目录在媒体迁移期间发生变化，已停止本次保存；请重试。`,
        );
      }
      const committedItems = commitPreparedCanvasAssetCatalog(localStorage, assetCatalog.plan).map(
        (asset) => normalizeAssetSource(asset, projectId),
      );
      projectAssetStates.set(projectId, committedItems);
      legacyAssetSourceProjectIds.delete(projectId);
      unreadableProjectAssetIds.delete(projectId);
      const currentState = useCanvasStore.getState();
      const currentSourceItems = currentState.assets.filter(
        (asset) => assetSourceProjectId(asset, currentState.activeProjectId) === projectId,
      );
      if (assetCatalogFingerprint(currentSourceItems) === assetCatalog.sourceFingerprint) {
        useCanvasStore.setState({
          assets: replaceGlobalAssetSource(currentState.assets, projectId, committedItems),
        });
      }
    }

    if (intent.rootRecovery) {
      if (localStorage.getItem(intent.rootRecovery.sourceKey) !== intent.rootRecovery.sourceRaw) {
        throw new Error(
          '画布根快照在媒体迁移期间发生变化。为避免覆盖较新的数据，本次保存已停止；请重试。',
        );
      }
      localStorage.setItem(
        intent.rootRecovery.sourceKey,
        stringifyCanvasPersistence(intent.rootRecovery.root),
      );
    }

    // Early v6 roots duplicated the active workspace as a compatibility
    // fallback. With several media-heavy canvases, that redundant copy can
    // consume the remaining localStorage quota before the split workspace is
    // replaced. Shrink only an already-committed v6 root before writing the
    // next workspace; v1-v5 roots remain authoritative until migration has
    // copied every workspace successfully below.
    if (
      !intent.rootRecovery &&
      latest?.version === CANVAS_STORAGE_VERSION &&
      hasCanvasRootWorkspacePayloads(latest) &&
      hasSplitCopiesForCanvasRootPayloads(latest)
    ) {
      shrunkRootBackup = latestRaw ?? undefined;
      localStorage.setItem(
        CANVAS_KEY,
        stringifyCanvasPersistence(canvasRootWithoutWorkspacePayloads(latest)),
      );
    }

    const localProjects = new Map(state.projects.map((project) => [project.id, project]));
    const projects = latest?.projects
      ? latest.projects
          .filter((project) => !intent.deletedProjectIds.has(project.id))
          .map((project) =>
            dirtyProjectIds.has(project.id) ? (localProjects.get(project.id) ?? project) : project,
          )
      : state.projects.filter((project) => !intent.deletedProjectIds.has(project.id));
    const persistedProjectIds = new Set(projects.map((project) => project.id));
    for (const projectId of dirtyProjectIds) {
      if (intent.deletedProjectIds.has(projectId) || persistedProjectIds.has(projectId)) continue;
      const project = localProjects.get(projectId);
      if (project) {
        projects.push(project);
        persistedProjectIds.add(projectId);
      }
    }

    const projectRevisions: Record<string, PersistedProjectRevision> = {
      ...latest?.projectRevisions,
    };
    for (const projectId of dirtyProjectIds) {
      if (intent.deletedProjectIds.has(projectId)) {
        delete projectRevisions[projectId];
        continue;
      }
      const previousRevision = Math.max(
        observedProjectRevisions.get(projectId)?.revision ?? 0,
        latest?.projectRevisions?.[projectId]?.revision ?? 0,
      );
      projectRevisions[projectId] = {
        revision: previousRevision + 1,
        writerId: CANVAS_WRITER_ID,
        updatedAt: attemptedAt,
      };
    }

    const nextProjectMeta: Record<string, PersistedProjectCanvasMeta> = {
      ...latest?.projectMeta,
    };
    for (const [projectId, snapshot] of Object.entries(latest?.projectStates ?? {})) {
      if (!nextProjectMeta[projectId]) {
        nextProjectMeta[projectId] = projectMetaFromSnapshot(snapshot);
      }
    }
    const deletedWorkspaceIds = new Map<string, WorkspaceId[]>();
    for (const projectId of dirtyProjectIds) {
      if (intent.deletedProjectIds.has(projectId)) {
        deletedWorkspaceIds.set(
          projectId,
          normalizedWorkspaceIds([
            ...(nextProjectMeta[projectId]?.workspaceIds ?? []),
            ...Object.keys(latest?.projectStates?.[projectId]?.workspaces ?? {}),
          ]),
        );
        delete nextProjectMeta[projectId];
        continue;
      }
      const localMeta = intent.projectMeta.get(projectId);
      const localSnapshot = intent.projectStates.get(projectId);
      if (localMeta) {
        nextProjectMeta[projectId] = {
          ...localMeta,
          workspaceIds: normalizedWorkspaceIds(
            [
              ...(nextProjectMeta[projectId]?.workspaceIds ?? []),
              ...localMeta.workspaceIds,
              ...Object.keys(localSnapshot?.workspaces ?? {}),
            ],
            localMeta.workspace,
          ),
        };
      } else if (localSnapshot) {
        nextProjectMeta[projectId] = projectMetaFromSnapshot(localSnapshot);
      }
    }

    // v1-v5 migration is commit-safe: copy every legacy workspace first. The
    // legacy root remains authoritative if any workspace write or the v6 root
    // commit fails, so an interrupted upgrade cannot discard dormant canvases.
    const workspaceWrites = new Map<string, WorkspaceSnapshot>();
    const queueWorkspaceWrite = (
      projectId: string,
      workspace: WorkspaceId,
      snapshot: WorkspaceSnapshot,
    ) => {
      if (workspace === 'home') return;
      workspaceWrites.set(`${projectId}\u0000${workspace}`, snapshot);
    };
    if (latest && latest.version !== CANVAS_STORAGE_VERSION && !intent.rootRecovery) {
      for (const [projectId, projectSnapshot] of Object.entries(latest.projectStates ?? {})) {
        if (intent.deletedProjectIds.has(projectId)) continue;
        for (const [workspace, snapshot] of Object.entries(projectSnapshot.workspaces)) {
          if (snapshot) queueWorkspaceWrite(projectId, workspace as WorkspaceId, snapshot);
        }
      }
    }
    for (const projectId of dirtyProjectIds) {
      if (intent.deletedProjectIds.has(projectId)) continue;
      const projectSnapshot = intent.projectStates.get(projectId);
      if (!projectSnapshot) continue;
      for (const [workspace, snapshot] of Object.entries(projectSnapshot.workspaces)) {
        if (snapshot) queueWorkspaceWrite(projectId, workspace as WorkspaceId, snapshot);
      }
    }

    // When a legacy root is already at the browser quota, even a tiny new split
    // key can fail because the old Base64 payload still occupies the full
    // allowance. Once media preflight has produced verified lightweight
    // snapshots, first atomically replace the single root value with an
    // equivalent legacy-version root containing those migrated snapshots. This
    // frees space without deleting the only recoverable graph: if the browser
    // closes before split/catalog commit, v1-v5 startup still treats this root as
    // authoritative. Flat v1 nodes/edges are removed only because the active
    // workspace snapshot now carries the same graph.
    if (latest && latest.version !== CANVAS_STORAGE_VERSION && !intent.rootRecovery) {
      const hadProjectStates = Object.keys(latest.projectStates ?? {}).length > 0;
      const interimProjectStates = { ...latest.projectStates };
      if (hadProjectStates) {
        for (const projectId of dirtyProjectIds) {
          if (intent.deletedProjectIds.has(projectId)) {
            delete interimProjectStates[projectId];
            continue;
          }
          const snapshot = intent.projectStates.get(projectId);
          if (snapshot) interimProjectStates[projectId] = snapshot;
        }
      }
      const interimActiveSnapshot = intent.projectStates.get(latest.activeProjectId);
      const interimRoot: PersistedCanvas = {
        ...latest,
        projectStates: hadProjectStates ? interimProjectStates : latest.projectStates,
        workspace: interimActiveSnapshot?.workspace ?? latest.workspace,
        workspaces: interimActiveSnapshot?.workspaces ?? latest.workspaces ?? {},
        tabs: interimActiveSnapshot?.tabs ?? latest.tabs,
        activeTabId: interimActiveSnapshot?.activeTabId ?? latest.activeTabId,
      };
      const legacyRecord = interimRoot as unknown as Record<string, unknown>;
      delete legacyRecord.nodes;
      delete legacyRecord.edges;
      localStorage.setItem(CANVAS_KEY, stringifyCanvasPersistence(interimRoot));
    }

    for (const [key, snapshot] of workspaceWrites) {
      const separator = key.indexOf('\u0000');
      const projectId = key.slice(0, separator);
      const workspace = key.slice(separator + 1) as WorkspaceId;
      const storageKey = canvasWorkspaceStorageKey(projectId, workspace);
      workspaceWriteRollbacks.push({
        key: storageKey,
        previous: localStorage.getItem(storageKey),
      });
      writeCanvasWorkspaceSnapshot(localStorage, projectId, workspace, snapshot);
    }

    const activeSnapshot = intent.projectStates.get(state.activeProjectId);
    const activeMeta =
      nextProjectMeta[state.activeProjectId] ??
      (activeSnapshot ? projectMetaFromSnapshot(activeSnapshot) : undefined);
    if (activeMeta) nextProjectMeta[state.activeProjectId] = activeMeta;
    const data: PersistedCanvas = {
      version: CANVAS_STORAGE_VERSION,
      activeProjectId: state.activeProjectId,
      projectStates: {},
      projectMeta: nextProjectMeta,
      workspace: state.workspace,
      workspaces: {},
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      projectName: state.projectName,
      projects,
      genParams: state.genParams,
      activeTags: Array.from(state.activeTags),
      projectRevisions,
    };
    localStorage.setItem(CANVAS_KEY, stringifyCanvasPersistence(data));
    rootCommitted = true;
    try {
      localStorage.removeItem(LEGACY_CANVAS_KEY);
    } catch {
      // The current root and every split workspace are already committed.
      // A stale legacy copy is safe to leave for a later cleanup attempt.
    }
    for (const [projectId, revision] of Object.entries(projectRevisions)) {
      observedProjectRevisions.set(projectId, revision);
    }
    for (const projectId of intent.deletedProjectIds) observedProjectRevisions.delete(projectId);
    projectCanvasMeta.clear();
    for (const [projectId, meta] of Object.entries(nextProjectMeta)) {
      projectCanvasMeta.set(projectId, meta);
    }
    for (const [projectId, preparedSnapshot] of intent.projectStates) {
      const sourceSnapshot = intent.sourceProjectStates?.get(projectId);
      const currentSnapshot = projectCanvasStates.get(projectId);
      if (!sourceSnapshot || currentSnapshot === undefined || currentSnapshot === sourceSnapshot) {
        projectCanvasStates.set(projectId, preparedSnapshot);
      }
      if (projectId !== state.activeProjectId || !sourceSnapshot) continue;
      for (const [workspace, preparedWorkspace] of Object.entries(preparedSnapshot.workspaces)) {
        const sourceWorkspace = sourceSnapshot.workspaces[workspace as WorkspaceId];
        const currentWorkspace = workspaceStates.get(workspace as WorkspaceId);
        if (
          preparedWorkspace &&
          sourceWorkspace &&
          currentWorkspace?.nodes === sourceWorkspace.nodes &&
          currentWorkspace.edges === sourceWorkspace.edges
        ) {
          workspaceStates.set(workspace as WorkspaceId, preparedWorkspace);
        }
      }
      const currentState = useCanvasStore.getState();
      const sourceActiveWorkspace = sourceSnapshot.workspaces[currentState.workspace];
      const preparedActiveWorkspace = preparedSnapshot.workspaces[currentState.workspace];
      if (
        preparedActiveWorkspace &&
        sourceActiveWorkspace &&
        currentState.activeProjectId === projectId &&
        currentState.nodes === sourceActiveWorkspace.nodes &&
        currentState.edges === sourceActiveWorkspace.edges
      ) {
        useCanvasStore.setState({
          nodes: preparedActiveWorkspace.nodes,
          edges: preparedActiveWorkspace.edges,
        });
      }
    }
    for (const [projectId, workspaceIds] of deletedWorkspaceIds) {
      for (const workspace of workspaceIds) {
        try {
          removeCanvasWorkspaceSnapshot(localStorage, projectId, workspace);
        } catch {
          // The lightweight catalog is already committed. A stale orphan is
          // harmless and can be overwritten if the same project id is reused.
        }
      }
    }
    dirtyProjectIds.forEach((projectId) => locallyEditedProjectCatalogIds.delete(projectId));
    intent.deletedProjectIds.forEach((projectId) => locallyDeletedProjectIds.delete(projectId));
    dirtyProjectIds.forEach((projectId) => clearCanvasPersistenceConflict(projectId));
    const activeRevision = projectRevisions[state.activeProjectId];
    publishPersistenceStatus({
      projectId: state.activeProjectId,
      state: 'saved',
      lastAttemptAt: attemptedAt,
      lastSavedAt: attemptedAt,
      revision: activeRevision?.revision,
      writerId: CANVAS_WRITER_ID,
    });
    return true;
  } catch (error) {
    let rollbackFailed = false;
    if (!rootCommitted) {
      for (const rollback of workspaceWriteRollbacks.reverse()) {
        try {
          if (rollback.previous === null) localStorage.removeItem(rollback.key);
          else localStorage.setItem(rollback.key, rollback.previous);
        } catch {
          rollbackFailed = true;
        }
      }
      if (shrunkRootBackup !== undefined) {
        try {
          localStorage.setItem(CANVAS_KEY, shrunkRootBackup);
        } catch {
          rollbackFailed = true;
        }
      }
    }
    /* storage full or unavailable — keep working in-memory */
    const assetConflict = error instanceof CanvasAssetPersistenceConflictError;
    const message = assetConflict
      ? `${error.message} 请刷新素材目录后再继续，系统不会自动覆盖较新的版本。`
      : canvasPersistenceErrorMessage(error);
    publishPersistenceStatus({
      ...persistenceStatusFor(state.activeProjectId),
      projectId: state.activeProjectId,
      state: assetConflict ? 'conflict' : 'error',
      lastAttemptAt: attemptedAt,
      conflictCopyAvailable: false,
      conflictingWriterId: undefined,
      message: rollbackFailed ? `${message} 本地回滚未能完整写入，请不要关闭当前页面。` : message,
    });
    return false;
  }
}

const CANVAS_PERSISTENCE_LOCK = 'qiansi-canvas-persistence-v6';
const CANVAS_PERSISTENCE_LOCK_TIMEOUT_MS = 5_000;
let canvasPersistenceQueue: Promise<void> = Promise.resolve();
let canvasStoreRuntimeDisposed = false;
const canvasPersistenceRetries = new CanvasPersistenceRetryScheduler(async (projectId) => {
  const state = useCanvasStore.getState();
  if (state.activeProjectId !== projectId) {
    canvasPersistenceRetries.reset(projectId);
    return;
  }
  if (persistenceStatusFor(projectId).state !== 'error') {
    canvasPersistenceRetries.reset(projectId);
    return;
  }
  if (!canvasAutosave.isIdle()) {
    canvasAutosave.request();
    return;
  }
  await persistCanvas(state, false, true, true);
});

function serializableCanvasMediaNodes(nodes: readonly FlowNode[]): FlowNode[] {
  return mapCanvasMediaStrings(nodes, (value) => stableCanvasMediaUrlForRuntime(value) ?? value);
}

async function prepareWorkspaceMediaForPersistence(
  snapshot: WorkspaceSnapshot,
  projectId: string,
  session: CanvasMediaPersistenceSession,
): Promise<WorkspaceSnapshot> {
  const migrated = await prepareCanvasNodesForPersistence(
    serializableCanvasMediaNodes(snapshot.nodes),
    // The caller owns the session, whose project identity also controls the
    // Bridge asset namespace. No URL or node order is changed here.
    projectId,
    undefined,
    session,
  );
  return { nodes: migrated.nodes, edges: snapshot.edges };
}

/**
 * Persist media before serializing the captured snapshot. The live Zustand
 * state is deliberately left untouched: if Bridge upload or legacy-media verification
 * fails, the page keeps the legacy Base64 and no half-migrated snapshot is
 * committed. A later edit is protected by the normal project revision lock.
 */
async function prepareCanvasPersistenceIntent(
  intent: CanvasPersistenceIntent,
): Promise<CanvasPersistenceIntent> {
  const projectStates = new Map(intent.projectStates);
  const sourceProjectStates = new Map(intent.projectStates);
  const projectMeta = new Map(intent.projectMeta);
  const dirtyProjectIds = new Set(intent.dirtyProjectIds);
  const currentRootRaw = localStorage.getItem(CANVAS_KEY);
  const legacyRootRaw = currentRootRaw === null ? localStorage.getItem(LEGACY_CANVAS_KEY) : null;
  const rootRaw = currentRootRaw ?? legacyRootRaw;
  const rootKey = currentRootRaw === null ? LEGACY_CANVAS_KEY : CANVAS_KEY;
  let root: PersistedCanvasWithLegacyWorkspace | undefined;
  if (rootRaw !== null) {
    try {
      root = parseCanvasPersistence<PersistedCanvasWithLegacyWorkspace>(rootRaw);
    } catch (error) {
      const detail = error instanceof Error && error.message.trim() ? `（${error.message}）` : '';
      throw new Error(`本地画布根快照读取失败${detail}。原始数据已保留，自动保存已停止。`);
    }
  }
  const rootProjectIds = root ? canvasRootPayloadProjectIds(root) : new Set<string>();
  rootProjectIds.forEach((projectId) => dirtyProjectIds.add(projectId));
  const projectIdsToPrepare = new Set([...dirtyProjectIds, ...rootProjectIds]);

  for (const projectId of projectIdsToPrepare) {
    if (intent.deletedProjectIds.has(projectId)) continue;
    const rootSnapshot = root ? projectSnapshotFromCanvasRootPayload(root, projectId) : undefined;
    const snapshot = projectStates.get(projectId) ?? rootSnapshot;
    if (!snapshot) continue;
    if (!sourceProjectStates.has(projectId)) sourceProjectStates.set(projectId, snapshot);
    const persisted = readAllPersistedProjectWorkspaces(projectId);
    if (!persisted.complete) {
      throw (
        persisted.error ??
        new Error(
          `项目“${projectId}”仍有无法读取的工作台；为避免只迁移部分旧媒体，本次快照未提交。`,
        )
      );
    }
    const persistedWorkspaces = { ...persisted.workspaces };
    for (const workspace of Object.keys(rootSnapshot?.workspaces ?? {})) {
      if (workspace === 'home') continue;
      const rootWorkspace = readPersistedWorkspaceSnapshot(projectId, workspace as WorkspaceId);
      if (rootWorkspace.status === 'error') throw rootWorkspace.error;
      if (rootWorkspace.status === 'found') {
        persistedWorkspaces[workspace as WorkspaceId] = rootWorkspace.snapshot;
      }
    }
    const session = new CanvasMediaPersistenceSession(projectId);
    const workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
    const completeWorkspaces = {
      ...rootSnapshot?.workspaces,
      ...persistedWorkspaces,
      ...snapshot.workspaces,
    };
    for (const [workspace, workspaceSnapshot] of Object.entries(completeWorkspaces)) {
      if (!workspaceSnapshot) continue;
      // Node-based unit tests have no browser media store. Structural
      // divergence checks still run there, while production browser writes
      // always pass through the verified bridge/IndexedDB media migration.
      workspaces[workspace as WorkspaceId] =
        typeof window === 'undefined'
          ? workspaceSnapshot
          : await prepareWorkspaceMediaForPersistence(workspaceSnapshot, projectId, session);
    }
    const preparedSnapshot = { ...snapshot, workspaces };
    projectStates.set(projectId, preparedSnapshot);
    projectMeta.set(projectId, projectMetaFromSnapshot(preparedSnapshot));
  }

  const assetCatalogs = new Map<string, CanvasAssetCatalogPersistencePlan>();
  if (typeof window !== 'undefined') {
    const assetProjectIds = new Set([
      intent.state.activeProjectId,
      ...intent.state.projects.map((project) => project.id),
      ...projectAssetStates.keys(),
    ]);
    for (const projectId of assetProjectIds) {
      const sourceItems =
        projectAssetStates.get(projectId) ??
        loadAssets(projectId, projectId === intent.state.activeProjectId);
      if (unreadableProjectAssetIds.has(projectId)) {
        throw new Error(
          `项目“${projectId}”的素材目录无法读取；为避免覆盖原始素材，本次画布保存已停止。`,
        );
      }
      const scopedAssetKey = projectAssetKey(projectId);
      const canMigrateSharedAssets =
        projectId === intent.state.activeProjectId &&
        (legacyAssetSourceProjectIds.has(projectId) ||
          localStorage.getItem(scopedAssetKey) !== null);
      const plan = await prepareCanvasAssetCatalog({
        projectId,
        items: persistableAssetItems(sourceItems),
        storage: localStorage,
        scopedKey: scopedAssetKey,
        legacyKeys: canMigrateSharedAssets ? [ASSET_KEY, LEGACY_ASSET_KEY] : [],
        migrationMarkerKey:
          projectId === intent.state.activeProjectId ? ASSET_PROJECT_MIGRATION_KEY : undefined,
      });
      if (
        plan.items.length === 0 &&
        plan.expectedScopedRaw === null &&
        plan.legacySources.length === 0
      ) {
        continue;
      }
      if (plan.serialized === plan.expectedScopedRaw && plan.legacySources.length === 0) continue;
      assetCatalogs.set(projectId, {
        sourceFingerprint: assetCatalogFingerprint(sourceItems),
        plan,
      });
    }
  }

  const activeSnapshot = projectStates.get(intent.state.activeProjectId);
  let rootRecovery: CanvasRootRecoveryPlan | undefined;
  if (
    root &&
    rootRaw &&
    (hasCanvasRootWorkspacePayloads(root) || hasLegacyFlatCanvasWorkspace(root)) &&
    (root.version !== CANVAS_STORAGE_VERSION ||
      hasLegacyFlatCanvasWorkspace(root) ||
      !hasSplitCopiesForCanvasRootPayloads(root))
  ) {
    const recoveryRoot = canvasRootWithPreparedWorkspaces(
      root,
      projectStates,
      intent.deletedProjectIds,
    );
    if (embeddedCanvasImageStats(recoveryRoot).occurrenceCount > 0) {
      throw new Error(
        '画布根快照仍含未迁移的 Base64 图片；为避免在拆分工作台时复制大图，本次保存已停止。',
      );
    }
    rootRecovery = { sourceKey: rootKey, sourceRaw: rootRaw, root: recoveryRoot };
  }
  return {
    ...intent,
    projectStates,
    projectMeta,
    dirtyProjectIds,
    workspaces: activeSnapshot?.workspaces ?? intent.workspaces,
    rootRecovery,
    sourceProjectStates,
    assetCatalogs,
  };
}

async function persistCanvasWithCrossTabLock(intent: CanvasPersistenceIntent): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    // Unit tests and SSR have one JavaScript writer. A real browser without Web
    // Locks must fail closed because localStorage cannot provide an atomic CAS.
    if (typeof window === 'undefined') return persistCanvasUnlocked(intent);
    publishPersistenceStatus({
      ...persistenceStatusFor(intent.state.activeProjectId),
      projectId: intent.state.activeProjectId,
      state: 'error',
      lastAttemptAt: Date.now(),
      message:
        '当前浏览器不支持安全的跨标签保存锁。为避免覆盖其他标签页，已停止本次保存。请关闭其他标签页后使用受支持的浏览器。',
    });
    return false;
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    CANVAS_PERSISTENCE_LOCK_TIMEOUT_MS,
  );
  try {
    return await locks.request(
      CANVAS_PERSISTENCE_LOCK,
      { mode: 'exclusive', signal: controller.signal },
      () => persistCanvasUnlocked(intent),
    );
  } catch (error) {
    publishPersistenceStatus({
      ...persistenceStatusFor(intent.state.activeProjectId),
      projectId: intent.state.activeProjectId,
      state: 'error',
      lastAttemptAt: Date.now(),
      message:
        error instanceof DOMException && error.name === 'AbortError'
          ? '等待跨标签保存锁超时。为避免覆盖其他标签页，本次修改尚未写入；请关闭其他编辑标签页后重试。'
          : error instanceof Error && error.message.trim()
            ? error.message
            : '获取跨标签保存锁失败，本次修改尚未写入。',
    });
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** Queue this tab's writes and serialize the read-check-write section across tabs. */
function persistCanvasLegacyForMigrationTests(state: CanvasState): Promise<boolean> {
  const intent = captureCanvasPersistenceIntent(state);
  const result = canvasPersistenceQueue
    .catch(() => {})
    .then(async () => {
      if (canvasStoreRuntimeDisposed) return false;
      try {
        return await persistCanvasWithCrossTabLock(await prepareCanvasPersistenceIntent(intent));
      } catch (error) {
        publishPersistenceStatus({
          ...persistenceStatusFor(intent.state.activeProjectId),
          projectId: intent.state.activeProjectId,
          state: 'error',
          lastAttemptAt: Date.now(),
          message: canvasPersistenceErrorMessage(error),
        });
        return false;
      }
    });
  const observedResult = result.then((saved) => {
    const projectId = intent.state.activeProjectId;
    const status = persistenceStatusFor(projectId);
    if (saved) canvasPersistenceRetries.reset(projectId);
    else if (typeof window !== 'undefined' && status.state === 'error') {
      canvasPersistenceRetries.schedule(projectId);
    } else if (status.state === 'conflict') {
      canvasPersistenceRetries.reset(projectId);
    }
    return saved;
  });
  canvasPersistenceQueue = observedResult.then(
    () => {},
    () => {},
  );
  return observedResult;
}

let bridgePersistenceQueue: Promise<void> = Promise.resolve();

function enqueueBridgePersistence<T>(operation: () => Promise<T>): Promise<T> {
  const result = bridgePersistenceQueue.catch(() => {}).then(operation);
  bridgePersistenceQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

function bridgeManifestPatch(state: CanvasState): Partial<BridgeProjectManifest> {
  return {
    projectId: state.activeProjectId,
    projectName: state.projectName,
    name: state.projectName,
    title: state.projectName,
    currentWorkspace: state.workspace === 'home' ? 'views' : state.workspace,
    workspace: state.workspace === 'home' ? 'views' : state.workspace,
    tabs: state.tabs.map((tab) => ({ ...tab })),
    activeTabId: state.activeTabId,
    genParams: { ...state.genParams },
    activeTags: [...state.activeTags],
    assets: state.assets
      .filter(
        (asset) => assetSourceProjectId(asset, state.activeProjectId) === state.activeProjectId,
      )
      .map((asset) => ({ ...asset, sourceProjectId: state.activeProjectId })),
  };
}

function bridgeSharedProjectPayload(
  state: CanvasState,
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>,
  assets: AssetItem[],
): SharedProjectWorkspace {
  return {
    version: 2,
    projectId: state.activeProjectId,
    projectName: state.projectName,
    workspaces: Object.fromEntries(
      Object.entries(workspaces).map(([workspace, snapshot]) => [
        workspace,
        snapshot ? persistedWorkspaceSnapshot(snapshot) : snapshot,
      ]),
    ) as Partial<Record<WorkspaceId, WorkspaceSnapshot>>,
    tabs: state.tabs.map((tab) => ({ ...tab })),
    assets,
    trash: state.trash.map((item) => ({
      ...item,
      nodes: item.nodes.map(persistedNode),
      edges: item.edges.map((edge) => ({ ...edge, selected: false })),
    })),
    genParams: { ...state.genParams },
    activeTags: [...state.activeTags],
  };
}

function sameBridgePersistenceSource(captured: CanvasState, current: CanvasState) {
  return (
    captured.activeProjectId === current.activeProjectId &&
    captured.workspace === current.workspace &&
    captured.nodes === current.nodes &&
    captured.edges === current.edges &&
    captured.projectName === current.projectName &&
    captured.tabs === current.tabs &&
    captured.activeTabId === current.activeTabId &&
    captured.assets === current.assets &&
    captured.trash === current.trash &&
    captured.genParams === current.genParams &&
    captured.activeTags === current.activeTags
  );
}

const TRANSIENT_NODE_DATA_KEYS = new Set(['generating', 'progress', 'enhancementRequestId']);

const SHARED_TRANSIENT_NODE_DATA_KEYS = new Set([
  ...TRANSIENT_NODE_DATA_KEYS,
  'generationRequestId',
  'generationTargetMediaSignature',
]);

function restoreTerminalWorkspaceUiState(
  persisted: WorkspaceSnapshot,
  currentNodes: FlowNode[],
  currentEdges: FlowEdge[],
): WorkspaceSnapshot {
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]));
  const currentEdgesById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  return {
    nodes: reuseSnapshotReferences(
      currentNodes,
      persisted.nodes.map((node) => {
        const current = currentNodesById.get(node.id);
        if (!current) return node;
        const transientData = Object.fromEntries(
          [...SHARED_TRANSIENT_NODE_DATA_KEYS].flatMap((key) =>
            Object.prototype.hasOwnProperty.call(current.data, key)
              ? [[key, current.data[key]]]
              : [],
          ),
        ) as Partial<FlowNode['data']>;
        return reuseSnapshotReferences(current, {
          ...node,
          selected: current.selected,
          dragging: current.dragging,
          measured: current.measured,
          data: { ...node.data, ...transientData },
        });
      }),
    ),
    edges: reuseSnapshotReferences(
      currentEdges,
      persisted.edges.map((edge) => {
        const current = currentEdgesById.get(edge.id);
        return current
          ? reuseSnapshotReferences(current, { ...edge, selected: current.selected })
          : edge;
      }),
    ),
  };
}

async function prepareBridgeAssets(state: CanvasState, session: CanvasMediaPersistenceSession) {
  const source = state.assets
    .filter((asset) => assetSourceProjectId(asset, state.activeProjectId) === state.activeProjectId)
    .map((asset) => ({ ...asset, sourceProjectId: state.activeProjectId }));
  if (typeof window === 'undefined') return source;
  return (
    await prepareCanvasAssetItemsForPersistence(source, state.activeProjectId, undefined, session)
  ).items.map((asset) => normalizeAssetSource(asset, state.activeProjectId));
}

async function persistCanvasToBridge(
  state: CanvasState,
  publishSavedStatus = true,
): Promise<boolean> {
  if (canvasStoreRuntimeDisposed) return false;
  const projectId = state.activeProjectId;
  const attemptedAt = Date.now();
  const sourceNodes = state.nodes;
  const sourceEdges = state.edges;
  const mediaSession = new CanvasMediaPersistenceSession(projectId);
  try {
    if (state.workspace !== 'home') {
      workspaceStates.set(state.workspace, { nodes: sourceNodes, edges: sourceEdges });
    }
    const cachedSnapshot = projectCanvasStates.get(projectId);
    const cachedWorkspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {
      ...cachedSnapshot?.workspaces,
      ...collectWorkspaceStates(),
    };
    if (state.workspace !== 'home') {
      cachedWorkspaces[state.workspace] = { nodes: sourceNodes, edges: sourceEdges };
    }

    const assets = await prepareBridgeAssets(state, mediaSession);
    let revision = observedProjectRevisions.get(projectId)?.revision ?? 0;
    let savedWorkspaces = cachedWorkspaces;
    let savedAssets = assets;
    let rebasedManifest: BridgeProjectManifest | undefined;
    let rebasedProject: SharedProjectWorkspace | undefined;
    let rebasedSourceStillCurrent = true;

    if (state.workspace === 'home') {
      const preparedWorkspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
      for (const [workspace, snapshot] of Object.entries(cachedWorkspaces)) {
        if (!snapshot || workspace === 'home') continue;
        preparedWorkspaces[workspace as WorkspaceId] = await prepareWorkspaceMediaForPersistence(
          snapshot,
          projectId,
          mediaSession,
        );
      }
      if (canvasStoreRuntimeDisposed) return false;
      const result = await writeBridgeProject(
        projectId,
        bridgeSharedProjectPayload(state, preparedWorkspaces, assets),
        revision,
        state.projectName,
      );
      revision = result.revision;
      savedWorkspaces =
        result.rebased && result.workspace?.workspaces
          ? result.workspace.workspaces
          : preparedWorkspaces;
      if (result.rebased) {
        rebasedManifest = result.manifest;
        rebasedProject = result.workspace ?? undefined;
        if (Array.isArray(result.workspace?.assets)) {
          savedAssets = result.workspace.assets.map((asset) =>
            normalizeAssetSource(asset, projectId),
          );
        }
        rebasedSourceStillCurrent = sameBridgePersistenceSource(state, useCanvasStore.getState());
      }
    } else {
      const sourceWorkspace = cachedWorkspaces[state.workspace] ?? {
        nodes: sourceNodes,
        edges: sourceEdges,
      };
      const preparedWorkspace = await prepareWorkspaceMediaForPersistence(
        sourceWorkspace,
        projectId,
        mediaSession,
      );
      const hasSessionMedia = containsBrowserSessionMedia(preparedWorkspace);
      const manifestPatch = bridgeManifestPatch({
        ...state,
        assets: replaceGlobalAssetSource(state.assets, projectId, assets),
      });
      if (canvasStoreRuntimeDisposed) return false;
      const result = await writeBridgeWorkspace(
        projectId,
        state.workspace as PersistedBridgeWorkspaceId,
        persistedWorkspaceSnapshot(preparedWorkspace),
        revision,
        manifestPatch,
      );
      revision = result.revision;
      savedWorkspaces = { ...cachedWorkspaces, [state.workspace]: result.workspace };
      if (result.rebased) {
        rebasedManifest = result.manifest;
        rebasedProject = result.project as SharedProjectWorkspace | undefined;
        if (!rebasedProject) {
          throw new Error('本机 Bridge 未返回可验证的完整合并结果，已停止推进修订。');
        }
        savedWorkspaces = rebasedProject.workspaces;
        if (Array.isArray(rebasedProject.assets)) {
          savedAssets = rebasedProject.assets.map((asset) =>
            normalizeAssetSource(asset, projectId),
          );
        }
      }

      // Replace only the exact captured runtime objects. Edits made while the
      // Bridge upload was running remain dirty and cannot receive stale URLs.
      const current = useCanvasStore.getState();
      rebasedSourceStillCurrent = sameBridgePersistenceSource(state, current);
      if (!result.rebased && !hasSessionMedia && rebasedSourceStillCurrent) {
        const runtimeWorkspace = restoreTerminalWorkspaceUiState(
          result.workspace,
          current.nodes,
          current.edges,
        );
        // This is a verified save acknowledgement, not another local edit.
        // Real edits made during the request are excluded by the source guard above.
        const runtimeAssets = reuseSnapshotReferences(
          current.assets,
          replaceGlobalAssetSource(current.assets, projectId, savedAssets),
        );
        applyingAuthoritativeBridgeSnapshot = true;
        try {
          if (
            runtimeWorkspace.nodes !== current.nodes ||
            runtimeWorkspace.edges !== current.edges ||
            runtimeAssets !== current.assets
          ) {
            useCanvasStore.setState({
              nodes: runtimeWorkspace.nodes,
              edges: runtimeWorkspace.edges,
              assets: runtimeAssets,
            });
          }
        } finally {
          applyingAuthoritativeBridgeSnapshot = false;
        }
      }
      workspaceStates.set(state.workspace, hasSessionMedia ? preparedWorkspace : result.workspace);
      bridgeLoadedWorkspaces.add(bridgeWorkspaceCacheKey(projectId, state.workspace));
    }

    let rebasedProjectApplied = false;
    if (rebasedProject && rebasedSourceStillCurrent) {
      rebasedProjectApplied = applySharedProjectWorkspace(rebasedProject, {
        recoverInterruptedGeneration: true,
      });
      if (!rebasedProjectApplied) {
        throw new Error('本机 Bridge 返回的完整合并结果无法安全应用，已停止推进修订。');
      }
      savedWorkspaces = rebasedProject.workspaces;
      savedAssets = rebasedProject.assets.map((asset) => normalizeAssetSource(asset, projectId));
    }
    if (!rebasedProject || rebasedProjectApplied) {
      observeBridgeRevision(projectId, revision);
    }
    if (rebasedManifest && rebasedSourceStillCurrent && !rebasedProjectApplied) {
      applyBridgeManifest(projectId, rebasedManifest);
    }
    const confirmedState = useCanvasStore.getState();
    const snapshotState =
      rebasedProjectApplied && confirmedState.activeProjectId === projectId
        ? confirmedState
        : state;
    const nextSnapshot: ProjectCanvasSnapshot = {
      workspace: snapshotState.workspace,
      workspaces: savedWorkspaces,
      tabs: snapshotState.tabs,
      activeTabId: snapshotState.activeTabId,
    };
    projectCanvasStates.set(projectId, nextSnapshot);
    projectCanvasMeta.set(projectId, projectMetaFromSnapshot(nextSnapshot));
    projectAssetStates.set(projectId, savedAssets);
    locallyEditedProjectCatalogIds.delete(projectId);
    locallyDeletedProjectIds.delete(projectId);
    clearCanvasPersistenceConflict(projectId);
    if (publishSavedStatus) {
      publishPersistenceStatus({
        projectId,
        state: 'saved',
        lastAttemptAt: attemptedAt,
        lastSavedAt: Date.now(),
        revision,
        writerId: 'bridge',
      });
    }
    try {
      await mediaSession.commitLegacyMigration();
    } catch (cleanupError) {
      if (publishSavedStatus) {
        publishPersistenceStatus({
          ...persistenceStatusFor(projectId),
          projectId,
          state: 'saved',
          message:
            cleanupError instanceof Error
              ? cleanupError.message
              : '项目已保存，但旧浏览器媒体尚未完全清理，可稍后安全重试。',
        });
      }
    }
    return true;
  } catch (error) {
    publishBridgePersistenceFailure(projectId, error);
    return false;
  }
}

async function enqueueBridgeTrashPersistence(projectId: string, trash: TrashItem[]) {
  if (useCanvasStore.getState().activeProjectId !== projectId) return false;
  return enqueueBridgePersistence(async () => {
    if (canvasStoreRuntimeDisposed) return false;
    const captured = useCanvasStore.getState();
    const mediaSession = new CanvasMediaPersistenceSession(projectId);
    try {
      const expectedRevision = observedProjectRevisions.get(projectId)?.revision ?? 0;
      const prepared = await prepareCanvasMediaValueForPersistence(
        trash,
        projectId,
        undefined,
        mediaSession,
      );
      if (canvasStoreRuntimeDisposed) return false;
      const result = await writeBridgeTrash(projectId, prepared.value, expectedRevision);
      const current = useCanvasStore.getState();
      const sourceStillCurrent =
        current.activeProjectId === projectId &&
        sameBridgePersistenceSource(captured, current) &&
        stableJsonEqual(current.trash.map(recoverPersistedTrashItem), trash);
      let rebasedProjectApplied = false;
      if (result.rebased) {
        const rebasedProject = result.project as SharedProjectWorkspace | undefined;
        if (!rebasedProject) {
          throw new Error('本机 Bridge 未返回可验证的完整合并结果，已停止推进回收站修订。');
        }
        if (sourceStillCurrent) {
          rebasedProjectApplied = applySharedProjectWorkspace(rebasedProject, {
            recoverInterruptedGeneration: true,
          });
          if (!rebasedProjectApplied) {
            throw new Error('本机 Bridge 返回的合并项目无法安全应用。');
          }
        }
      } else {
        observeBridgeRevision(projectId, result.revision);
      }
      if (!result.rebased && sourceStillCurrent) {
        const verified = normalizeTrash(result.trash, projectId);
        trashCache.set(projectId, verified);
        useCanvasStore.setState({ trash: verified });
      }
      await removeVerifiedLegacyTrash(projectId);
      publishPersistenceStatus({
        projectId,
        state: 'saved',
        lastAttemptAt: Date.now(),
        lastSavedAt: Date.now(),
        revision:
          result.rebased && !rebasedProjectApplied
            ? observedProjectRevisions.get(projectId)?.revision
            : result.revision,
        writerId: 'bridge',
      });
      try {
        await mediaSession.commitLegacyMigration();
      } catch (cleanupError) {
        publishPersistenceStatus({
          ...persistenceStatusFor(projectId),
          projectId,
          state: 'saved',
          message:
            cleanupError instanceof Error
              ? cleanupError.message
              : '回收站已保存，但旧浏览器媒体尚未完全清理，可稍后安全重试。',
        });
      }
      return true;
    } catch (error) {
      publishBridgePersistenceFailure(projectId, error, '回收站');
      return false;
    }
  });
}

function persistCanvas(
  state: CanvasState,
  allowInitialBridgeHydrationWrite = false,
  publishSavedStatus = true,
  idleOnly = false,
): Promise<boolean> {
  if (canvasStoreRuntimeDisposed) return Promise.resolve(false);
  if (usesLegacyPersistenceTestAdapter()) return persistCanvasLegacyForMigrationTests(state);
  if (initialBridgeHydrationBlocksPersistence() && !allowInitialBridgeHydrationWrite) {
    return Promise.resolve(false);
  }
  return enqueueBridgePersistence(async () => {
    // A user may resume interacting while this write is waiting behind another save.
    // Defer before media preparation/serialization; never abort a write already in progress.
    if (idleOnly && !canvasAutosave.isIdle()) {
      canvasAutosave.request();
      return false;
    }
    const latest = idleOnly ? useCanvasStore.getState() : state;
    if (latest.activeProjectId !== state.activeProjectId || latest.workspace !== state.workspace) {
      return false; // Project/workspace switches have their own mandatory source flush.
    }
    return persistCanvasToBridge(latest, publishSavedStatus);
  }).then((saved) => {
    const projectId = state.activeProjectId;
    const status = persistenceStatusFor(projectId);
    if (saved) canvasPersistenceRetries.reset(projectId);
    else if (status.state === 'error') canvasPersistenceRetries.schedule(projectId);
    else if (status.state === 'conflict') canvasPersistenceRetries.reset(projectId);
    return saved;
  });
}

export interface LoadedCanvas {
  activeProjectId: string;
  projectStates: Record<string, ProjectCanvasSnapshot>;
  projectMeta: Record<string, PersistedProjectCanvasMeta>;
  workspace: WorkspaceId;
  workspaces: Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  tabs: CanvasTab[];
  activeTabId: string;
  projectName: string;
  projects: { id: string; name: string }[];
  genParams: GenParams;
  activeTags: Set<string>;
  needsWorkspaceMigration: boolean;
  workspaceDivergence?: string;
}

function unreadableCanvasBootstrap(error: unknown): LoadedCanvas {
  const projectId = initialProjectId;
  const projectName = '无法读取的本地画布';
  const snapshot = createFreshProjectSnapshot('views');
  const detail = error instanceof Error && error.message.trim() ? `（${error.message}）` : '';
  return {
    activeProjectId: projectId,
    projectStates: { [projectId]: snapshot },
    projectMeta: { [projectId]: projectMetaFromSnapshot(snapshot) },
    workspace: snapshot.workspace,
    workspaces: snapshot.workspaces,
    tabs: snapshot.tabs,
    activeTabId: snapshot.activeTabId,
    projectName,
    projects: [{ id: projectId, name: projectName }],
    genParams: {
      viewCount: 3,
      aspectRatio: '16:9',
      quality: '2K',
      count: 1,
      mode: 'first-frame',
      duration: 5,
      resolution: '720P',
      audio: false,
      strength: 0.5,
    },
    activeTags: new Set<string>(),
    needsWorkspaceMigration: false,
    workspaceDivergence: `本地画布根快照无法读取${detail}。原始数据已保留，自动保存已停止；请勿清理浏览器数据，先导出或修复该快照后再继续。`,
  };
}

export function loadCanvasBootstrap(storage: Storage = localStorage): LoadedCanvas | null {
  let raw: string | null | undefined;
  try {
    const currentRaw = storage.getItem(CANVAS_KEY);
    const legacyRaw = currentRaw === null ? storage.getItem(LEGACY_CANVAS_KEY) : null;
    raw = currentRaw ?? legacyRaw;
    if (raw === null) return null;
    const parsed = parseCanvasPersistence<
      PersistedCanvas & {
        nodes?: FlowNode[];
        edges?: FlowEdge[];
        activeProjectId?: string;
        projectStates?: Record<string, ProjectCanvasSnapshot>;
      }
    >(raw);
    for (const [projectId, revision] of Object.entries(parsed.projectRevisions ?? {})) {
      if (
        projectId &&
        revision &&
        Number.isSafeInteger(revision.revision) &&
        revision.revision >= 0 &&
        typeof revision.writerId === 'string' &&
        revision.writerId
      ) {
        observedProjectRevisions.set(projectId, revision);
      }
    }
    const workspace = parsed.workspace ?? 'views';
    let workspaces = parsed.workspaces ?? {};
    // Migration: legacy single-canvas saves (v1) stored nodes/edges at the top
    // level. Fold them into the per-workspace map so old work isn't lost.
    if ((!workspaces || Object.keys(workspaces).length === 0) && parsed.nodes) {
      workspaces = { [workspace]: { nodes: parsed.nodes, edges: parsed.edges ?? [] } };
    }
    const projects = parsed.projects?.length
      ? parsed.projects
      : [{ id: initialProjectId, name: parsed.projectName || '未命名工作区' }];
    const requestedProjectId =
      parsed.activeProjectId ??
      projects.find((project) => project.name === parsed.projectName)?.id ??
      projects[0]?.id ??
      initialProjectId;
    const activeProjectId = projects.some((project) => project.id === requestedProjectId)
      ? requestedProjectId
      : (projects[0]?.id ?? initialProjectId);
    const legacyProjectStates = parsed.projectStates ?? {};
    const projectMeta: Record<string, PersistedProjectCanvasMeta> = {
      ...parsed.projectMeta,
    };
    for (const [projectId, snapshot] of Object.entries(legacyProjectStates)) {
      if (!projectMeta[projectId]) projectMeta[projectId] = projectMetaFromSnapshot(snapshot);
    }
    const readBootstrapWorkspace = (
      projectId: string,
      targetWorkspace: WorkspaceId,
    ): CanvasWorkspaceReadResult<WorkspaceSnapshot> => {
      const split = readCanvasWorkspaceSnapshot<WorkspaceSnapshot>(
        storage,
        projectId,
        targetWorkspace,
      );
      const embedded = readWorkspaceFromParsedCanvasRoot(parsed, projectId, targetWorkspace);
      return reconcilePersistedWorkspaceSnapshot(projectId, targetWorkspace, split, embedded);
    };
    let bootstrapWorkspaceRead: CanvasWorkspaceReadResult<WorkspaceSnapshot> | undefined;
    let bootstrapWorkspaceId: WorkspaceId | undefined;
    let activeProject = legacyProjectStates[activeProjectId];
    if (!activeProject) {
      const activeMeta = projectMeta[activeProjectId];
      const targetWorkspace = activeMeta?.workspace ?? workspace;
      const persistedWorkspace =
        targetWorkspace === 'home'
          ? { status: 'missing' as const }
          : readBootstrapWorkspace(activeProjectId, targetWorkspace);
      bootstrapWorkspaceRead = persistedWorkspace;
      bootstrapWorkspaceId = targetWorkspace;
      const activeWorkspace =
        persistedWorkspace.status === 'found'
          ? persistedWorkspace.snapshot
          : workspaces[targetWorkspace];
      activeProject = activeMeta
        ? projectSnapshotFromMeta(
            activeMeta,
            activeWorkspace ? { [targetWorkspace]: activeWorkspace } : {},
          )
        : {
            workspace: targetWorkspace,
            workspaces: activeWorkspace ? { [targetWorkspace]: activeWorkspace } : workspaces,
            tabs: parsed.tabs ?? [],
            activeTabId: parsed.activeTabId,
          };
    }
    const activeProjectMeta =
      projectMeta[activeProjectId] ?? projectMetaFromSnapshot(activeProject);
    projectMeta[activeProjectId] = activeProjectMeta;
    const activeWorkspaceRead =
      activeProject.workspace === 'home'
        ? ({ status: 'missing' } as const)
        : bootstrapWorkspaceRead && bootstrapWorkspaceId === activeProject.workspace
          ? bootstrapWorkspaceRead
          : readBootstrapWorkspace(activeProjectId, activeProject.workspace);
    const workspaceDivergence =
      activeWorkspaceRead.status === 'error' ? activeWorkspaceRead.error.message : undefined;
    // v6 startup retains only the active workspace in the root fallback. Old
    // roots may still contain every canvas, but only the active one enters the
    // runtime cache while the rest are migrated during idle time.
    const activeWorkspace = activeProject.workspace;
    const activeWorkspaceSnapshot =
      activeWorkspace === 'home'
        ? undefined
        : activeWorkspaceRead.status === 'found'
          ? activeWorkspaceRead.snapshot
          : activeProject.workspaces[activeWorkspace];
    const activeProjectOnly = projectSnapshotFromMeta(
      activeProjectMeta,
      activeWorkspaceSnapshot ? { [activeWorkspace]: activeWorkspaceSnapshot } : {},
    );
    const loaded: LoadedCanvas = {
      activeProjectId,
      projectStates: { [activeProjectId]: activeProjectOnly },
      projectMeta,
      workspace: activeProjectOnly.workspace ?? workspace,
      workspaces: activeProjectOnly.workspaces,
      tabs: activeProjectOnly.tabs ?? parsed.tabs ?? [],
      activeTabId: activeProjectOnly.activeTabId ?? parsed.activeTabId,
      projectName:
        projects.find((project) => project.id === activeProjectId)?.name ??
        parsed.projectName ??
        '未命名工作区',
      projects,
      genParams: parsed.genParams,
      activeTags: new Set<string>(parsed.activeTags ?? []),
      needsWorkspaceMigration: parsed.version !== CANVAS_STORAGE_VERSION,
      workspaceDivergence,
    };
    return loaded;
  } catch (error) {
    return raw === null ? null : unreadableCanvasBootstrap(error);
  }
}

// ---- Multi-canvas tabs ----
export interface CanvasTab {
  id: string;
  name: string;
  workspace: WorkspaceId;
}

export type ModalKind =
  | 'style-library'
  | 'effects-library'
  | 'character-library'
  | 'camera-library'
  | 'director-studio'
  | 'director-studio-2d'
  | 'media-preview'
  | 'panorama-viewer'
  | 'image-editor'
  | 'video-mask-repair'
  | 'color-grading'
  | 'face-control'
  | 'pose-control'
  | 'prompt-library'
  | 'help'
  | 'trash'
  | 'shortcuts'
  | 'node-params'
  | 'delete-confirm'
  | null;

type ImageLibraryModalKind = 'style-library' | 'character-library';

interface LibraryImageSelection {
  url: string;
  title: string;
  previewUrl?: string;
  bridgeAssetId?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  aspectRatio?: string;
}

export interface DeleteConfirmState {
  nodeId: string;
  nodeTitle: string;
  title?: string;
  description?: string;
  onConfirm: () => void;
}

interface CanvasState {
  workspace: WorkspaceId;
  workspaceTransition: WorkspaceId | null;
  /** One-shot zoom requested by an entry surface before the restored canvas mounts. */
  initialViewportZoom: number | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  past: Snapshot[];
  future: Snapshot[];
  selectedNodeId: string | null;
  referencePickerTargetId: string | null;
  markPickerTargetId: string | null;
  groupRenameTargetId: string | null;
  clipboard: FlowNode | null;
  assets: AssetItem[];
  trash: TrashItem[];
  activeTags: Set<string>;
  genParams: GenParams;
  searchQuery: string;
  panelOpen: 'assets' | 'search' | 'layers' | null;
  aiSkillOpen: boolean;
  snapEnabled: boolean;
  persistenceStatus: CanvasPersistenceStatus;

  // UI modals
  openModal: ModalKind;
  modalNodeId: string | null;
  libraryImagePickerTargetId: string | null;
  imageEditorMode: ImageEditorMode;
  imageEditorBrushTool: ImageEditorBrushTool;
  deleteConfirm: DeleteConfirmState | null;

  // Multi-canvas tabs
  tabs: CanvasTab[];
  activeTabId: string;

  // Project-level naming
  activeProjectId: string;
  projectName: string;
  projects: { id: string; name: string }[];

  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;

  takeSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  importWorkflow: (nodes: FlowNode[], edges: FlowEdge[]) => void;

  setWorkspace: (id: WorkspaceId) => void;
  addNode: (kind: NodeKind, position: Point) => string;
  /** Create one two-input comparison node from exactly two selected image outputs. */
  createImageComparison: (sourceNodeIds: string[]) => string | null;
  createTextStarterNode: (
    textNodeId: string,
    starter: 'text-to-video' | 'image-to-prompt' | 'video-to-prompt',
    prompt: string,
  ) => string | null;
  createVideoFromAudio: (audioNodeId: string) => string | null;
  /** Create a downstream AI-video node that uses the selected video as its remake source. */
  createVideoRemake: (videoNodeId: string) => string | null;
  /** Create a downstream video-enhancement node without modifying the source video. */
  createVideoEnhance: (videoNodeId: string) => string | null;
  /** Create a downstream continuation node that starts from the selected video's ending. */
  createVideoContinuation: (videoNodeId: string) => string | null;
  /** Create a downstream video-edit node that removes burned-in subtitle overlays. */
  createVideoSubtitleRemoval: (
    videoNodeId: string,
    region: 'auto' | 'bottom' | 'top',
  ) => string | null;
  /** Create a downstream AI video-edit node whose instruction remains editable. */
  createVideoVisualEdit: (videoNodeId: string) => string | null;
  /** Create a downstream masked repair task without modifying or generating over the source. */
  createVideoMaskRepair: (
    videoNodeId: string,
    spec: VideoMaskRepairSpec,
    prompt: string,
  ) => string | null;
  /** Create a pending audio node connected to the source video's original soundtrack. */
  createVideoAudioExtraction: (videoNodeId: string) => string | null;
  /** Create a final AI-video node from an applied 3D/2D director plan. */
  createVideoFromDirector: (
    directorNodeId: string,
    previsAsset?: DirectorPrevisAsset,
  ) => string | null;
  /** Create or refresh the downstream image task for an applied 2D director plan. */
  createImageFromDirector: (directorNodeId: string) => string | null;
  addNodeWithImage: (kind: NodeKind, position: Point, imageUrl: string, title?: string) => string;
  deleteNode: (id: string) => void;
  moveNodesToTrash: (ids: string[]) => void;
  restoreTrashItem: (id: string) => void;
  permanentlyDeleteTrashItem: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  requestDeleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  insertNodeOnEdge: (edgeId: string) => void;

  copyNode: (id: string) => void;
  pasteNode: (position: Point) => void;
  copyNodeAt: (id: string, position: Point) => string;
  setNodePosition: (id: string, position: Point) => void;
  setImageComparisonNodeDimensions: (id: string, width: number, height: number) => void;
  arrangeNodesInGrid: (nodeIds: string[], columns: number) => boolean;

  createGroupFromSelection: () => void;
  ungroupNode: (id: string) => void;
  detachOutOfBoundsChildren: () => void;
  fitGroupsToChildren: (groupId?: string) => void;

  // Workflow templates (generator menu)
  createWorkflowTemplate: (
    template: 'text2img' | 'img2img' | 'views' | 'video' | 'script',
    position: Point,
  ) => string[];

  setSelectedNodeId: (id: string | null) => void;
  selectAllNodes: () => void;
  setReferencePickerTargetId: (id: string | null) => void;
  setMarkPickerTargetId: (id: string | null) => void;
  setGroupRenameTargetId: (id: string | null) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  updateNodeGenParams: (id: string, patch: Partial<GenParams>) => void;
  generateNode: (id: string, prompt?: string) => Promise<void>;
  recoverNodeGenerationResult: (
    id: string,
    options?: NodeGenerationRecoveryOptions,
  ) => Promise<NodeGenerationRecoveryStatus>;
  runCascade: (id: string) => Promise<void>;
  applyEnhancement: (
    nodeId: string,
    tool: ImageEnhancementTool,
    prompt?: string,
  ) => Promise<boolean>;
  createLinkedEnhancementResult: (
    nodeId: string,
    tool: 'panorama' | 'quality-restore' | 'portrait-cutout' | 'cutout' | 'remove-text',
  ) => Promise<boolean>;
  createFaceControlResult: (nodeId: string, prompt: string) => Promise<boolean>;
  createPoseControlResult: (
    nodeId: string,
    prompt: string,
    poseGuideUrl: string,
    options: Pick<GenParams, 'quality' | 'count'>,
  ) => Promise<boolean>;
  propagate: (sourceId: string) => void;

  saveAsset: (nodeId: string, category?: AssetCategory) => void;
  addAudioAsset: (input: {
    bridgeAssetId: string;
    audioUrl: string;
    fileName: string;
    mimeType: string;
    durationSeconds?: number;
  }) => { assetId: string; added: boolean };
  createSubjectFromNode: (nodeId: string) => boolean;
  removeAsset: (assetId: string) => void;
  updateAssetCategory: (assetId: string, category: AssetCategory) => void;
  addAssetToCanvas: (assetId: string, position: Point) => void;

  toggleTag: (tag: string) => void;
  setGenParams: (patch: Partial<GenParams>) => void;
  setSearchQuery: (q: string) => void;
  setPanelOpen: (panel: 'assets' | 'search' | 'layers' | null) => void;
  setAiSkillOpen: (open: boolean) => void;
  toggleSnapEnabled: () => void;

  setOpenModal: (modal: ModalKind, nodeId?: string | null) => void;
  openLibraryImagePicker: (library: ImageLibraryModalKind, nodeId: string) => void;
  applyLibraryImageToNode: (selection: LibraryImageSelection) => boolean;
  setImageEditorMode: (mode: ImageEditorMode) => void;
  setImageEditorBrushTool: (tool: ImageEditorBrushTool) => void;
  closeModal: () => void;
  setDeleteConfirm: (state: DeleteConfirmState | null) => void;

  // Tabs
  addTab: (workspace: WorkspaceId, name?: string) => string;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setActiveTab: (id: string) => void;
  switchTabWorkspace: (id: WorkspaceId) => void;

  // Project naming
  setProjectName: (name: string) => void;
  createProject: (name?: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: () => void;
  switchProject: (id: string) => void;

  // Library application
  applyStylePreset: (preset: {
    id: string;
    title: string;
    category: string;
    tags: string[];
    kind?: NodeKind;
    prompt?: string;
    description?: string;
    thumbnail?: string;
    image?: string;
    position?: Point;
  }) => void;
  applyEffectPreset: (preset: {
    id: string;
    title: string;
    category: string;
    tags: string[];
    prompt?: string;
    description?: string;
    imageUrl: string;
    previewUrl?: string;
    mediaWidth?: number;
    mediaHeight?: number;
    bridgeAssetId?: string;
    position?: Point;
  }) => void;
  applyCameraPreset: (preset: {
    id: string;
    title: string;
    category: string;
    tags: string[];
    prompt: string;
  }) => void;
  applyCharacterPreset: (preset: {
    id: string;
    title: string;
    category: string;
    tags: string[];
    prompt?: string;
    description?: string;
    thumbnail?: string;
    image?: string;
    referenceImages?: CharacterReferenceImages;
    position?: Point;
  }) => void;
  applyPromptPreset: (preset: {
    id: string;
    title: string;
    prompt: string;
    tags: string[];
    moduleCount?: number;
    target?: 'image' | 'video' | 'script';
    position?: Point;
  }) => void;
}

interface GenerationScope {
  projectId: string;
  workspace: WorkspaceId;
  nodeId: string;
  requestId: string;
  targetMediaSignature?: string;
}

function createGeneratedMediaSiblingNodes(
  source: FlowNode,
  nodes: FlowNode[],
  mediaUrls: string[],
  mediaKind: 'image' | 'video',
  batchRequestId?: string,
): FlowNode[] {
  if (mediaUrls.length <= 1) return [];
  const sourceWidth = source.measured?.width ?? source.width ?? NODE_W;
  const sourceName =
    mediaKind === 'video'
      ? source.data.videoFileName || source.data.title || '未命名视频'
      : source.data.imageFileName || source.data.title || '未命名图片';
  const sourcePosition = absoluteNodePosition(source, nodes);

  const existingIds = new Set(nodes.map((node) => node.id));
  return mediaUrls.slice(1).flatMap((url, index) => {
    const ordinal = index + 2;
    const siblingName = appendMediaOrdinal(sourceName, ordinal);
    const siblingId = batchRequestId
      ? `${source.id}--generated--${batchRequestId}--${ordinal}`
      : genId('node');
    if (existingIds.has(siblingId)) return [];
    return [
      {
        id: siblingId,
        type: source.type,
        position: generatedMediaPosition(sourcePosition, sourceWidth, index + 1),
        data: {
          ...source.data,
          title: siblingName.replace(/\.[^.]+$/, ''),
          generating: false,
          generationRequestId: undefined,
          generationTargetMediaSignature: undefined,
          generationError: undefined,
          progress: 100,
          result: '',
          outputText: undefined,
          output: url,
          originalUrl: url,
          previewUrl: undefined,
          bridgeAssetId: undefined,
          mediaPersistenceState: undefined,
          mediaMimeType: undefined,
          imageUrl: mediaKind === 'video' ? undefined : url,
          images: mediaKind === 'video' ? undefined : [url],
          videoUrl: mediaKind === 'video' ? url : undefined,
          videos: mediaKind === 'video' ? [url] : undefined,
          videoEditRevision: mediaKind === 'video' ? genId('video-revision') : undefined,
          imageFileName: mediaKind === 'video' ? undefined : siblingName,
          videoFileName: mediaKind === 'video' ? siblingName : undefined,
          generatedBatchSourceId: source.id,
          generatedBatchIndex: ordinal,
          generatedBatchRequestId: batchRequestId,
        },
      },
    ];
  });
}

export type NodeGenerationRecoveryStatus =
  'recovered' | 'pending' | 'failed' | 'missing' | 'error' | 'stale' | 'unavailable';

export interface NodeGenerationRecoveryOptions {
  /**
   * Background reconciliation must not turn a transient pending, missing or
   * connection state into a persisted canvas edit. The request token remains
   * the safety lock until a terminal result is applied or the user explicitly
   * runs the manual recovery action.
   */
  automatic?: boolean;
  /** Cancels a background status lookup when its canvas scope is no longer active. */
  signal?: AbortSignal;
}

function hasActiveGenerationScope(state: CanvasState, scope: GenerationScope) {
  return (
    state.activeProjectId === scope.projectId &&
    state.workspace === scope.workspace &&
    state.nodes.some((node) => {
      if (
        node.id !== scope.nodeId ||
        node.data.generating !== true ||
        node.data.generationRequestId !== scope.requestId
      ) {
        return false;
      }
      return (
        scope.targetMediaSignature === undefined ||
        generationResultSignature(node) === scope.targetMediaSignature
      );
    })
  );
}

function bridgeGenerationRequestTokenConfirmed(scope: GenerationScope) {
  if (scope.workspace === 'home') return false;
  const persistedWorkspace = projectCanvasStates.get(scope.projectId)?.workspaces[scope.workspace];
  return Boolean(
    persistedWorkspace?.nodes.some(
      (node) =>
        node.id === scope.nodeId &&
        node.data.generationRequestId === scope.requestId &&
        (scope.targetMediaSignature === undefined ||
          (node.data.generationTargetMediaSignature === scope.targetMediaSignature &&
            generationResultSignature(node) === scope.targetMediaSignature)),
    ),
  );
}

function hasRecoverableGenerationScope(
  state: CanvasState,
  scope: GenerationScope,
  kind: RecoverableGenerationKind,
) {
  return (
    state.activeProjectId === scope.projectId &&
    state.workspace === scope.workspace &&
    state.nodes.some(
      (node) =>
        node.id === scope.nodeId &&
        recoverableGenerationKind(node) === kind &&
        node.data.generationRequestId === scope.requestId &&
        (scope.targetMediaSignature === undefined ||
          (generationTargetMediaSignature(node) === scope.targetMediaSignature &&
            generationResultSignature(node) === scope.targetMediaSignature)),
    )
  );
}

function isGenerationRequestInterruption(error: unknown): error is Error & {
  generationRequestInterrupted: true;
  requestId: string;
  kind: RecoverableGenerationKind;
} {
  return (
    error instanceof Error &&
    'generationRequestInterrupted' in error &&
    error.generationRequestInterrupted === true &&
    'requestId' in error &&
    typeof error.requestId === 'string' &&
    'kind' in error &&
    (error.kind === 'image' ||
      error.kind === 'video' ||
      error.kind === 'audio' ||
      error.kind === '3d' ||
      error.kind === 'text')
  );
}

/**
 * A Bridge/LAN rebase is allowed to replace persisted node data, but it must
 * not detach a paid or long-running generation request that is still owned by this renderer. The
 * exact request lease is restored only when the incoming node still points at
 * the same output payload, so a real remote result replacement remains
 * authoritative and late provider results cannot overwrite it.
 */
function restoreLocalGenerationLease(node: FlowNode, current: FlowNode | undefined): FlowNode {
  const kind = current ? recoverableGenerationKind(current) : undefined;
  const requestId =
    typeof current?.data.generationRequestId === 'string'
      ? current.data.generationRequestId.trim()
      : '';
  const targetMediaSignature = current ? generationTargetMediaSignature(current) : undefined;
  if (
    !current ||
    !kind ||
    recoverableGenerationKind(node) !== kind ||
    !requestId ||
    !targetMediaSignature ||
    generationResultSignature(current) !== targetMediaSignature ||
    generationResultSignature(node) !== targetMediaSignature
  ) {
    return node;
  }
  return {
    ...node,
    data: {
      ...node.data,
      generating: current.data.generating === true,
      generationRequestId: requestId,
      generationTargetMediaSignature: targetMediaSignature,
      progress: typeof current.data.progress === 'number' ? current.data.progress : 0,
      generationError: current.data.generationError,
      result: current.data.result,
    },
  };
}

function recoveredMediaUrls(result: unknown, kind: RecoverableMediaKind): string[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const record = result as Record<string, unknown>;
  const collectionKey =
    kind === 'image'
      ? 'images'
      : kind === 'video'
        ? 'videos'
        : kind === '3d'
          ? 'models3d'
          : 'audios';
  const singularKey =
    kind === 'image'
      ? 'imageUrl'
      : kind === 'video'
        ? 'videoUrl'
        : kind === '3d'
          ? 'model3dUrl'
          : 'audioUrl';
  const collection = Array.isArray(record[collectionKey])
    ? record[collectionKey].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const primary =
    typeof record.url === 'string' && record.url.trim()
      ? record.url
      : typeof record[singularKey] === 'string' && String(record[singularKey]).trim()
        ? String(record[singularKey])
        : undefined;
  return collectGeneratedMediaUrls(primary, collection).map(resolveMediaSourceUrl);
}

function recoveredTextOutput(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const text = (result as Record<string, unknown>).text;
  return typeof text === 'string' && text.trim() ? text : undefined;
}

const initialTabId = 'tab-1';
const initialProjectId = 'project-1';
const PRIMARY_CANVAS_PROJECT_ID = 'main-canvas';
const PRIMARY_CANVAS_NAME = '我的画布';

const savedCanvas = usesLegacyPersistenceTestAdapter() ? loadCanvasBootstrap() : null;
const initialPreferences = readCanvasPreferences();
const rememberedLegacyProjectId = usesLegacyPersistenceTestAdapter()
  ? readRememberedProjectId()
  : undefined;
const initialActiveProjectId = usesLegacyPersistenceTestAdapter()
  ? (rememberedLegacyProjectId ?? savedCanvas?.activeProjectId ?? initialProjectId)
  : PRIMARY_CANVAS_PROJECT_ID;
const initialProjectName = usesLegacyPersistenceTestAdapter()
  ? (savedCanvas?.projects.find((project) => project.id === initialActiveProjectId)?.name ??
    (savedCanvas?.activeProjectId === initialActiveProjectId
      ? savedCanvas.projectName
      : undefined) ??
    '未命名工作区')
  : PRIMARY_CANVAS_NAME;
if (usesLegacyPersistenceTestAdapter() && savedCanvas?.projectStates) {
  for (const [projectId, snapshot] of Object.entries(savedCanvas.projectStates)) {
    if (projectId && snapshot) projectCanvasStates.set(projectId, snapshot);
  }
}
if (usesLegacyPersistenceTestAdapter() && savedCanvas?.projectMeta) {
  for (const [projectId, meta] of Object.entries(savedCanvas.projectMeta)) {
    if (projectId && meta) projectCanvasMeta.set(projectId, meta);
  }
}
const legacyInitialProject = usesLegacyPersistenceTestAdapter()
  ? savedCanvas?.projectStates?.[initialActiveProjectId]
  : undefined;
replaceWorkspaceStates(
  legacyInitialProject?.workspaces ??
    (savedCanvas?.activeProjectId === initialActiveProjectId ? savedCanvas.workspaces : {}),
);
const activeWs: WorkspaceId =
  initialPreferences.startupTarget === 'home'
    ? 'home'
    : !usesLegacyPersistenceTestAdapter()
      ? 'views'
      : (legacyInitialProject?.workspace ?? savedCanvas?.workspace ?? 'home');
const activeSnap = activeWs === 'home' ? null : workspaceStates.get(activeWs);
const activeSeed =
  !usesLegacyPersistenceTestAdapter() && activeWs === 'views'
    ? { nodes: [], edges: [] }
    : loadWorkspace(activeWs);
const restoredEdges = activeSnap ? activeSnap.edges : activeSeed.edges;
const restoredNodes = syncMaterializedGraphInputs(
  syncConnectedTextPrompts(
    sanitizeNodes(activeSnap ? activeSnap.nodes : activeSeed.nodes, {
      recoverInterruptedMediaGeneration: true,
    }),
    restoredEdges,
  ),
  restoredEdges,
);
const initialPersistenceStatus: CanvasPersistenceStatus =
  usesLegacyPersistenceTestAdapter() && savedCanvas?.workspaceDivergence
    ? {
        projectId: initialActiveProjectId,
        state: 'conflict',
        lastAttemptAt: Date.now(),
        message: savedCanvas.workspaceDivergence,
        conflictCopyAvailable: false,
      }
    : persistenceStatusFor(initialActiveProjectId);
if (usesLegacyPersistenceTestAdapter() && savedCanvas?.workspaceDivergence) {
  projectPersistenceStatuses.set(initialActiveProjectId, initialPersistenceStatus);
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  workspace: activeWs,
  workspaceTransition: null,
  initialViewportZoom: null,
  nodes: restoredNodes,
  edges: restoredEdges,
  past: [],
  future: [],
  selectedNodeId: null,
  referencePickerTargetId: null,
  markPickerTargetId: null,
  groupRenameTargetId: null,
  clipboard: null,
  assets: usesLegacyPersistenceTestAdapter()
    ? loadGlobalAssets(
        savedCanvas?.projects ?? [{ id: initialProjectId }],
        initialActiveProjectId,
        true,
      )
    : [],
  trash: usesLegacyPersistenceTestAdapter() ? loadTrash(initialActiveProjectId) : [],
  activeTags:
    usesLegacyPersistenceTestAdapter() || savedCanvas?.activeProjectId === initialActiveProjectId
      ? (savedCanvas?.activeTags ?? new Set<string>())
      : new Set<string>(),
  genParams: {
    ...DEFAULT_GEN_PARAMS,
    ...(usesLegacyPersistenceTestAdapter() ||
    savedCanvas?.activeProjectId === initialActiveProjectId
      ? savedCanvas?.genParams
      : undefined),
  },
  searchQuery: '',
  panelOpen: null,
  aiSkillOpen: false,
  snapEnabled: initialPreferences.snapEnabled,
  persistenceStatus: initialPersistenceStatus,

  openModal: null,
  modalNodeId: null,
  libraryImagePickerTargetId: null,
  imageEditorMode: 'preview',
  imageEditorBrushTool: 'free',
  deleteConfirm: null,

  tabs: usesLegacyPersistenceTestAdapter()
    ? (legacyInitialProject?.tabs ??
      savedCanvas?.tabs ?? [{ id: initialTabId, name: '画板 1', workspace: 'views' }])
    : [{ id: initialTabId, name: '画板 1', workspace: 'views' }],
  activeTabId: usesLegacyPersistenceTestAdapter()
    ? (legacyInitialProject?.activeTabId ?? savedCanvas?.activeTabId ?? initialTabId)
    : initialTabId,

  activeProjectId: initialActiveProjectId,
  projectName: initialProjectName,
  projects: usesLegacyPersistenceTestAdapter()
    ? (savedCanvas?.projects ?? [{ id: initialActiveProjectId, name: '未命名工作区' }])
    : [
        {
          id: initialActiveProjectId,
          name: initialProjectName,
        },
      ],

  onNodesChange: (changes) => {
    const removedIds = changes
      .filter((change) => change.type === 'remove')
      .map((change) => change.id);
    if (removedIds.length) {
      if (useCanvasPreferences.getState().confirmMoveToTrash) {
        const removedNodes = get().nodes.filter((node) => removedIds.includes(node.id));
        const rootNodes = removedNodes.filter(
          (node) => !node.parentId || !removedIds.includes(node.parentId),
        );
        const nodeTitle =
          rootNodes.length === 1
            ? rootNodes[0]?.data.title || '未命名节点'
            : `${rootNodes.length}个节点`;
        set({
          deleteConfirm: {
            nodeId: removedIds[0] ?? '',
            nodeTitle,
            title: rootNodes.length > 1 ? '将所选节点移到回收站？' : '移到回收站？',
            description: '节点和相关连线会进入当前画布的回收站，可在永久删除前恢复。',
            onConfirm: () => {
              get().moveNodesToTrash(removedIds);
              set({ deleteConfirm: null });
            },
          },
        });
      } else {
        get().moveNodesToTrash(removedIds);
      }
    }
    const remainingChanges = changes.filter((change) => change.type !== 'remove');
    const nodes = applyNodeChanges(remainingChanges, get().nodes) as FlowNode[];
    set({ nodes });
    const measuredGroupedChild = changes.some(
      (change) =>
        change.type === 'dimensions' &&
        nodes.some((node) => node.id === change.id && node.parentId),
    );
    if (measuredGroupedChild) get().fitGroupsToChildren();
  },

  onEdgesChange: (changes) => {
    const previousEdges = get().edges;
    const removedEdgeIds = new Set(
      changes.filter((change) => change.type === 'remove').map((change) => change.id),
    );
    if (removedEdgeIds.size > 0) get().takeSnapshot();
    const removedTargets = previousEdges
      .filter((edge) => removedEdgeIds.has(edge.id))
      .map((edge) => edge.target);
    const edges = applyEdgeChanges(changes, previousEdges) as FlowEdge[];
    const nodes = syncConnectedTextPrompts(get().nodes, edges);
    set({
      edges,
      nodes:
        removedTargets.length > 0
          ? syncMaterializedGraphInputs(nodes, edges, removedTargets)
          : nodes,
    });
  },

  onConnect: (connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target || source === target) return;
    const nodes = get().nodes;
    const ports = resolveConnectionPorts(
      nodes,
      source,
      connection.sourceHandle,
      target,
      connection.targetHandle,
    );
    if (
      !ports ||
      !isValidConnection(
        nodes,
        get().edges,
        source,
        connection.sourceHandle,
        target,
        connection.targetHandle,
      )
    )
      return;
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    const targetDirectorSourceId = targetNode?.data.composerParams?.directorSourceId;
    const isAtomicFlatDirectorTask =
      targetNode?.data.kind === 'image' &&
      typeof targetNode.data.composerParams?.directorReferenceCount === 'number' &&
      typeof targetDirectorSourceId === 'string';
    if (
      isAtomicFlatDirectorTask &&
      ports.target.id === 'ref' &&
      source !== targetDirectorSourceId
    ) {
      return;
    }
    const isDirectorReference = Boolean(sourceNode && isDirectorNodeKind(sourceNode.data.kind));
    if (
      isDirectorReference &&
      typeof targetDirectorSourceId === 'string' &&
      targetDirectorSourceId &&
      source !== targetDirectorSourceId
    ) {
      return;
    }
    get().takeSnapshot();
    const edge: FlowEdge = {
      ...connection,
      id: genId('edge'),
      type: 'flow',
      sourceHandle: ports.source.id,
      targetHandle: ports.target.id,
    };
    const isEffectReference = Boolean(
      sourceNode && (sourceNode.data.effectPresetId || sourceNode.data.effectPreset),
    );
    const shouldConfigureReference =
      Boolean(isDirectorReference || isEffectReference) && targetNode?.data.kind === 'video';
    const nextNodes = shouldConfigureReference
      ? nodes.map((node) =>
          node.id === target
            ? {
                ...node,
                data: {
                  ...node.data,
                  composerParams: {
                    ...node.data.composerParams,
                    mode:
                      !node.data.composerParams?.mode ||
                      node.data.composerParams.mode === '文生视频'
                        ? '全能参考'
                        : node.data.composerParams.mode,
                    ...(isDirectorReference ? { directorSourceId: source } : {}),
                    ...(isEffectReference ? { effectReferenceSourceId: source } : {}),
                  },
                },
              }
            : node,
        )
      : nodes;
    const baseEdges = get().edges.filter((existingEdge) => {
      if (existingEdge.target !== target) return true;
      const existingSource = nodes.find((node) => node.id === existingEdge.source);
      if (
        isEffectReference &&
        (existingSource?.data.effectPresetId || existingSource?.data.effectPreset)
      ) {
        return false;
      }
      if (isDirectorReference && existingSource && isDirectorNodeKind(existingSource.data.kind)) {
        return false;
      }
      return true;
    });
    const edges = addEdge(edge, baseEdges);
    set({ nodes: syncConnectedTextPrompts(nextNodes, edges), edges });
    get().propagate(source);
  },

  takeSnapshot: () => {
    if (canvasHistoryTransactionDepth > 0 && canvasHistoryTransactionCaptured) return;
    const { nodes, edges, trash, past } = get();
    const snap = clone(nodes, edges, trash);
    const next = [...past, snap];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ past: next, future: [] });
    if (canvasHistoryTransactionDepth > 0) canvasHistoryTransactionCaptured = true;
  },

  undo: () => {
    const { past, future, nodes, edges, trash, activeProjectId } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    if (!prev) return;
    const current = clone(nodes, edges, trash);
    const restoredTrash = prev.trash ?? trash;
    set({
      past: past.slice(0, -1),
      future: [...future, current],
      nodes: prev.nodes,
      edges: prev.edges,
      trash: restoredTrash,
    });
    void persistTrash(activeProjectId, restoredTrash);
  },

  redo: () => {
    const { past, future, nodes, edges, trash, activeProjectId } = get();
    if (!future.length) return;
    const nextState = future[future.length - 1];
    if (!nextState) return;
    const current = clone(nodes, edges, trash);
    const restoredTrash = nextState.trash ?? trash;
    set({
      future: future.slice(0, -1),
      past: [...past, current],
      nodes: nextState.nodes,
      edges: nextState.edges,
      trash: restoredTrash,
    });
    void persistTrash(activeProjectId, restoredTrash);
  },

  importWorkflow: (nodes, edges) => {
    const current = get();
    const past = [...current.past, clone(current.nodes, current.edges, current.trash)];
    if (past.length > HISTORY_LIMIT) past.shift();
    const importedEdges = edges.map((edge) => ({ ...edge, selected: false }));
    const importedNodes = sanitizeNodes(nodes.map(recoverPersistedAudioNode)).map((node) => ({
      ...node,
      selected: false,
      dragging: false,
      data: { ...node.data },
      position: { ...node.position },
    }));
    const connectedNodes = syncConnectedTextPrompts(importedNodes, importedEdges);
    set({
      past,
      future: [],
      nodes: syncMaterializedGraphInputs(connectedNodes, importedEdges),
      edges: importedEdges,
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      clipboard: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });
  },

  setWorkspace: (id) => {
    const state = get();
    if (id === state.workspace) {
      if (!usesLegacyPersistenceTestAdapter()) bridgeWorkspaceTransitionSequence += 1;
      return;
    }
    if (state.workspace === 'home' && id !== 'home') {
      set({
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId
            ? { ...tab, name: WORKSPACES[id].title, workspace: id }
            : tab,
        ),
      });
    }
    enterWorkspace(id);
  },

  addNode: (kind, position) => {
    get().takeSnapshot();
    const id = genId('node');
    const def = KIND_DEFAULTS[kind];
    const numberedTitle = nextNumberedNodeTitle(get().nodes, kind);
    const node: FlowNode = {
      id,
      type: kind,
      position,
      data: {
        kind,
        ...def,
        ...(numberedTitle ? { title: numberedTitle } : {}),
        ...(kind === 'text' ? {} : placeholderImage(kind)),
        genParams: {
          ...get().genParams,
          ...(kind === 'video' ? { audio: false } : {}),
        },
        aspectRatio: get().genParams.aspectRatio,
      },
      ...(kind === 'group'
        ? { style: { width: 320, height: 220 }, zIndex: -1 }
        : kind === 'image-compare'
          ? {
              style: {
                width: IMAGE_COMPARISON_NODE_WIDTH,
                height: IMAGE_COMPARISON_NODE_HEIGHT,
              },
            }
          : kind === 'text'
            ? { style: { width: 350, height: 350 } }
            : {}),
    };
    set({ nodes: [...get().nodes, node] });
    return id;
  },

  createImageComparison: (sourceNodeIds) => {
    const sourceState = get();
    const sources = resolveImageComparisonSources(sourceState.nodes, sourceNodeIds);
    if (!sources) return null;
    const position = imageComparisonNodePosition(
      sourceState.nodes,
      sources.map((source) => source.nodeId),
    );
    let comparisonId: string | null = null;

    runCanvasHistoryTransaction(() => {
      comparisonId = get().addNode('image-compare', position);
      get().updateNodeData(comparisonId, {
        comparisonPosition: IMAGE_COMPARISON_DEFAULT_POSITION,
      });
      for (const source of sources) {
        get().onConnect({
          source: source.nodeId,
          sourceHandle: source.sourceHandle,
          target: comparisonId,
          targetHandle: 'images',
        });
      }
      set({
        nodes: get().nodes.map((node) => ({ ...node, selected: node.id === comparisonId })),
        selectedNodeId: comparisonId,
      });
    });

    return comparisonId;
  },

  createTextStarterNode: (textNodeId, starter, prompt) => {
    const { nodes, edges, genParams } = get();
    const textNode = nodes.find((node) => node.id === textNodeId && node.data.kind === 'text');
    if (!textNode) return null;

    const incoming = starter !== 'text-to-video';
    const kind: NodeKind = starter === 'image-to-prompt' ? 'image' : 'video';
    const title =
      starter === 'text-to-video'
        ? '文生视频'
        : starter === 'image-to-prompt'
          ? '参考图片'
          : '参考视频';
    const id = genId('node');
    const def = KIND_DEFAULTS[kind];
    const position = incoming
      ? { x: textNode.position.x - NODE_W - 120, y: textNode.position.y }
      : { x: textNode.position.x + 350 + 120, y: textNode.position.y };
    const connectionPromptPreset: TextReferencePromptPreset | undefined =
      starter === 'image-to-prompt' ? 'image' : starter === 'video-to-prompt' ? 'video' : undefined;
    const createdNode: FlowNode = {
      id,
      type: kind,
      position,
      selected: true,
      data: {
        kind,
        ...def,
        ...placeholderImage(kind),
        title,
        ...(incoming ? { referenceOnly: true } : {}),
        genParams: {
          ...genParams,
          ...(kind === 'video' ? { audio: false } : {}),
        },
        aspectRatio: genParams.aspectRatio,
      },
    };
    const nextNodes = [
      ...nodes.map((node) =>
        node.id === textNodeId
          ? {
              ...node,
              selected: false,
              data: {
                ...node.data,
                prompt: undefined,
                textInstruction: prompt,
                textContentRole: 'instruction' as const,
                result: undefined,
                outputText: undefined,
                output: undefined,
                connectionPromptPreset,
              },
            }
          : { ...node, selected: false },
      ),
      createdNode,
    ];
    const source = incoming ? id : textNodeId;
    const target = incoming ? textNodeId : id;
    const ports = resolveConnectionPorts(nextNodes, source, null, target, null);
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, source, ports.source.id, target, ports.target.id)
    ) {
      return null;
    }

    const edge: FlowEdge = {
      id: genId('edge'),
      type: 'flow',
      source,
      target,
      sourceHandle: ports.source.id,
      targetHandle: ports.target.id,
    };
    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [...edges, edge],
      selectedNodeId: id,
    });
    get().propagate(source);
    return id;
  },

  createVideoFromAudio: (audioNodeId) => {
    const { nodes, edges, genParams } = get();
    const audioNode = nodes.find((node) => node.id === audioNodeId && node.data.kind === 'audio');
    const sourceAudioUrl = audioNode ? resolvedAudioSource(audioNode.data) : undefined;
    if (!audioNode || !sourceAudioUrl) return null;
    const id = genId('node');
    const def = KIND_DEFAULTS.video;
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: absoluteNodePosition(audioNode, nodes).x + AUDIO_NODE_WIDTH + 120,
        y: absoluteNodePosition(audioNode, nodes).y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...def,
        title: '音频生视频',
        genParams: { ...genParams },
        composerParams: { mode: '全能参考' },
        aspectRatio: genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, audioNodeId, null, id, 'audio-track');
    if (!ports || !isValidConnection(nextNodes, edges, audioNodeId, null, id, 'audio-track')) {
      return null;
    }
    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: audioNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(audioNodeId);
    return id;
  },

  createVideoRemake: (videoNodeId) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const sourceAspectRatio =
      videoAspectRatioFromMediaSize(sourceNode.data.mediaWidth, sourceNode.data.mediaHeight) ??
      (typeof sourceNode.data.aspectRatio === 'string' && sourceNode.data.aspectRatio !== 'Auto'
        ? sourceNode.data.aspectRatio
        : typeof sourceParams.aspectRatio === 'string'
          ? sourceParams.aspectRatio
          : genParams.aspectRatio);
    const inheritedVideoAspectRatio =
      sourceAspectRatio === '16:9' ||
      sourceAspectRatio === '4:3' ||
      sourceAspectRatio === '1:1' ||
      sourceAspectRatio === '3:4' ||
      sourceAspectRatio === '9:16' ||
      sourceAspectRatio === '21:9'
        ? sourceAspectRatio
        : undefined;
    const sourceDuration = Number(sourceNode.data.durationSeconds);
    const sourceParamDuration = Number(sourceParams.duration);
    const inheritedDuration =
      Number.isFinite(sourceDuration) && sourceDuration > 0
        ? Math.max(1, Math.round(sourceDuration))
        : Number.isFinite(sourceParamDuration) && sourceParamDuration > 0
          ? Math.max(1, Math.round(sourceParamDuration))
          : genParams.duration;
    const inheritedResolution =
      typeof sourceParams.resolution === 'string'
        ? (sourceParams.resolution as GenResolution)
        : (videoResolutionFromMediaSize(sourceNode.data.mediaWidth, sourceNode.data.mediaHeight) ??
          genParams.resolution);
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        ...inheritedVideoPreview(sourceNode, sourceVideoUrl),
        title: `${sourceNode.data.title || '视频'} · 片段重拍`,
        description: '以连接的原视频作为参考，重新生成所需片段',
        videoRemakeSegments: [],
        prompt: '',
        genParams: {
          ...genParams,
          ...sourceParams,
          aspectRatio: sourceAspectRatio,
          videoAspectRatio: inheritedVideoAspectRatio,
          duration: inheritedDuration,
          resolution: inheritedResolution,
          count: 1,
        },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '全能参考',
          videoTool: 'remake',
          sourceVideoId: videoNodeId,
          sourceVideoDuration:
            Number.isFinite(sourceDuration) && sourceDuration > 0
              ? sourceDuration
              : inheritedDuration,
        },
        aspectRatio: sourceAspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoEnhance: (videoNodeId) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        ...inheritedVideoPreview(sourceNode, sourceVideoUrl),
        title: '高清 (1080P)',
        description: '配置参数生成高清视频',
        prompt:
          '对连接的原视频进行高清修复与放大，保留原始内容、时序、构图、运动、色彩和音频，修复模糊、压缩噪点、锯齿和边缘细节，不得重绘、新增或删除画面内容。',
        genParams: {
          ...genParams,
          ...sourceParams,
          resolution: '1080P',
          count: 1,
        },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '视频高清',
          videoTool: 'enhance',
          sourceVideoId: videoNodeId,
          enhancementModel: 'auto',
          interpolationMode: 'none',
          slowMotionRate: 1,
        },
        aspectRatio: sourceNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoContinuation: (videoNodeId) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        ...inheritedVideoPreview(sourceNode, sourceVideoUrl),
        title: `${sourceNode.data.title || '视频'} · 智能续写`,
        description: '承接原视频结尾生成下一段连续镜头',
        prompt:
          '请从连接的原视频最后一帧开始自然续写下一段镜头。保持人物身份、面貌、服装、场景、画风、构图、光线、色彩、镜头运动、动作方向、节奏和音频连续；承接原视频结尾正在发生的动作与运动趋势，不重复原片段，不跳切，不新增无关人物或物体。请在此继续补充下一段需要发生的剧情、动作或镜头要求。',
        genParams: { ...genParams, ...sourceParams, count: 1 },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '全能参考',
          videoTool: 'extend',
          sourceVideoId: videoNodeId,
        },
        aspectRatio: sourceNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoSubtitleRemoval: (videoNodeId, region) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const regionLabels = {
      auto: '自动识别整幅画面中的后期叠加字幕、弹幕与字幕条',
      bottom: '只处理画面下方 40% 区域内的后期叠加字幕与字幕条',
      top: '只处理画面上方 40% 区域内的后期叠加字幕与字幕条',
    } as const;
    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        ...inheritedVideoPreview(sourceNode, sourceVideoUrl),
        title: `${sourceNode.data.title || '视频'} · 智能去字幕`,
        description: '逐帧移除后期叠加字幕并修复被遮挡画面',
        prompt: [
          '这是原视频智能去字幕任务。',
          `${regionLabels[region]}；只移除后期烧录到画面上的字幕，不删除场景中真实存在的招牌、书本、屏幕、服装纹样、UI 或剧情需要的文字。`,
          '逐帧补绘字幕遮挡区域，保持纹理、光影、人物边缘、运动与前后帧连续，禁止用裁切、模糊条、色块或重复纹理遮盖。',
          '严格保留原视频人物、物体、场景、构图、镜头运动、帧率、时长、色彩、音频与音画同步，不新增或删除其他画面内容。',
        ].join('\n'),
        genParams: { ...genParams, ...sourceParams, count: 1 },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '全能参考',
          videoTool: 'remove-subtitles',
          subtitleRegion: region,
          sourceVideoId: videoNodeId,
        },
        aspectRatio: sourceNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoVisualEdit: (videoNodeId) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        ...inheritedVideoPreview(sourceNode, sourceVideoUrl),
        title: `${sourceNode.data.title || '视频'} · 画面编辑`,
        description: '基于原视频执行局部画面修改',
        prompt: [
          '这是原视频画面编辑任务。请在下方继续描述需要替换、移除、增加、修复或调整的画面内容，并尽量写清对象、时间范围与画面位置。',
          '除明确要求修改的内容外，严格保留原视频人物身份、动作、场景、构图、镜头运动、时长、帧率、色彩、音频和音画同步；修改区域须保持跨帧一致、边缘自然，不闪烁、不漂移。',
        ].join('\n'),
        genParams: { ...genParams, ...sourceParams, count: 1 },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '全能参考',
          videoTool: 'visual-edit',
          sourceVideoId: videoNodeId,
        },
        aspectRatio: sourceNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoMaskRepair: (videoNodeId, spec, prompt) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl || !isVideoMaskRepairSpec(spec)) return null;

    const id = genId('node');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourceParams = sourceNode.data.genParams ?? {};
    const repairPrompt = prompt.trim() || '只修复关键帧蒙版覆盖的问题区域，其他画面内容保持不变。';
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'video',
        ...KIND_DEFAULTS.video,
        // A repair draft does not own a generated video yet. Keep the source on
        // the source-video edge/reference strip without presenting it as output.
        mediaWidth: sourceNode.data.mediaWidth,
        mediaHeight: sourceNode.data.mediaHeight,
        durationSeconds: sourceNode.data.durationSeconds,
        title: `${sourceNode.data.title || '视频'} · 关键帧蒙版修复`,
        description: '仅在指定时间范围内跟踪并修复关键帧蒙版区域',
        prompt: repairPrompt,
        genParams: { ...genParams, ...sourceParams, count: 1 },
        composerParams: {
          ...sourceNode.data.composerParams,
          mode: '全能参考',
          videoTool: 'masked-repair',
          sourceVideoId: videoNodeId,
        },
        videoMaskRepair: { ...spec },
        aspectRatio: sourceNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createVideoAudioExtraction: (videoNodeId) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find(
      (node) =>
        node.id === videoNodeId && (node.data.kind === 'video' || node.data.kind === 'video-comp'),
    );
    const sourceVideoUrl = sourceNode?.data.videoUrl || sourceNode?.data.videos?.[0];
    if (!sourceNode || !sourceVideoUrl) return null;

    const id = genId('node');
    const requestId = genId('audio-extract');
    const sourceSize = nodeRenderedSize(sourceNode);
    const createdNode: FlowNode = {
      id,
      type: 'audio',
      position: {
        x: sourceNode.position.x + sourceSize.width + 120,
        y: sourceNode.position.y,
      },
      selected: true,
      data: {
        kind: 'audio',
        ...KIND_DEFAULTS.audio,
        title: `${sourceNode.data.title || '视频'} · 原声音轨`,
        description: '从连接的原视频提取完整混合音轨',
        generating: true,
        progress: 0,
        result: '正在读取原视频音轨…',
        audioExtractionRequestId: requestId,
        composerParams: {
          sourceVideoId: videoNodeId,
          audioTool: 'extract-original',
        },
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, videoNodeId, null, id, 'source-video');
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, videoNodeId, ports.source.id, id, ports.target.id)
    ) {
      return null;
    }

    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: videoNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(videoNodeId);
    return id;
  },

  createImageFromDirector: (directorNodeId) => {
    const { nodes, edges, genParams } = get();
    const directorNode = nodes.find(
      (node) =>
        node.id === directorNodeId &&
        (node.data.kind === 'director-2d' ||
          (node.data.kind === 'director' && node.data.directorMode === '2d')),
    );
    const directorImages = directorNode?.data.images?.filter(Boolean) ?? [];
    if (
      !directorNode ||
      directorNode.data.directorOutputDirty === true ||
      !directorNode.data.directorConstraintPrompt?.trim() ||
      directorImages.length === 0
    ) {
      return null;
    }

    const scene = normalizeDirectorScene(directorNode.data.directorScene);
    const compatibleChoices = availableProviderModels(loadProviderConnections(), 'image').filter(
      (choice) => !choice.inputModalities?.length || choice.inputModalities.includes('image'),
    );
    const favoriteModel = matchModelFavorite(compatibleChoices, readModelFavorite('image'));
    const recommended = compatibleChoices.find((choice) => choice.recommended);
    const automaticModel = favoriteModel ?? recommended ?? compatibleChoices[0];
    const aspectRatio = (directorNode.data.aspectRatio ??
      genParams.aspectRatio) as GenParams['aspectRatio'];
    const existingTask = nodes.find(
      (node) =>
        node.data.kind === 'image' && node.data.composerParams?.directorSourceId === directorNodeId,
    );
    if (existingTask?.data.generating === true) return null;

    const taskId = existingTask?.id ?? genId('node');
    const taskData = {
      ...(existingTask?.data ?? KIND_DEFAULTS.image),
      kind: 'image' as const,
      title: '2D 导演 · 构图图片',
      description: `依据控制图和 ${scene.subjects.length} 名人物身份参考生成最终图片`,
      prompt: scene.prompt,
      aspectRatio,
      genParams: {
        ...genParams,
        ...(existingTask?.data.genParams as Partial<GenParams> | undefined),
        aspectRatio,
      },
      composerParams: {
        ...existingTask?.data.composerParams,
        directorSourceId: directorNodeId,
        directorReferenceCount: directorImages.length,
        requiresImageInput: true,
      },
      composerReferences: undefined,
      composerReferenceSubmission: undefined,
      portInputs: undefined,
      input: undefined,
      originalUrl: undefined,
      previewUrl: undefined,
      mediaWidth: undefined,
      mediaHeight: undefined,
      bridgeAssetId: undefined,
      imageUrl: undefined,
      images: undefined,
      imagePreviewUrl: undefined,
      imagePreviewPosterUrl: undefined,
      imageFileName: undefined,
      output: undefined,
      canvasFrameWidth: undefined,
      canvasFrameHeight: undefined,
      annotationSourceUrl: undefined,
      annotationHints: undefined,
      aiReferenceMode: undefined,
      composerMarks: undefined,
      generating: false,
      generationRequestId: undefined,
      progress: 0,
      generationError: undefined,
      result: `已装载 ${directorImages.length} 张不可拆分的导演参考图。请选择支持多参考图的图片模型后提交生成。`,
      ...(!existingTask && automaticModel
        ? { providerId: automaticModel.providerId, model: automaticModel.model }
        : {}),
    } satisfies FlowNode['data'];
    const directorPosition = absoluteNodePosition(directorNode, nodes);
    const taskNode: FlowNode = existingTask
      ? { ...existingTask, selected: true, data: taskData }
      : {
          id: taskId,
          type: 'image',
          position: { x: directorPosition.x + NODE_W + 170, y: directorPosition.y },
          selected: true,
          data: taskData,
        };
    const nextNodes = existingTask
      ? nodes.map((node) =>
          node.id === taskId ? taskNode : node.selected ? { ...node, selected: false } : node,
        )
      : [...nodes.map((node) => ({ ...node, selected: false })), taskNode];
    const hasConnection = edges.some(
      (edge) => edge.source === directorNodeId && edge.target === taskId,
    );
    let nextEdges = edges;
    if (!hasConnection) {
      const ports = resolveConnectionPorts(nextNodes, directorNodeId, 'layout', taskId, 'ref');
      if (!ports || !isValidConnection(nextNodes, edges, directorNodeId, 'layout', taskId, 'ref')) {
        return null;
      }
      nextEdges = [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: directorNodeId,
          target: taskId,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ];
    }

    get().takeSnapshot();
    set({ nodes: nextNodes, edges: nextEdges, selectedNodeId: taskId });
    get().propagate(directorNodeId);
    return taskId;
  },

  createVideoFromDirector: (directorNodeId, previsAsset) => {
    const { nodes, edges, genParams } = get();
    const directorNode = nodes.find(
      (node) => node.id === directorNodeId && isDirectorNodeKind(node.data.kind),
    );
    if (
      !directorNode ||
      directorNode.data.directorOutputDirty === true ||
      !directorNode.data.directorConstraintPrompt?.trim()
    ) {
      return null;
    }

    const id = genId('node');
    const def = KIND_DEFAULTS.video;
    const directorScene = normalizeDirectorScene(directorNode.data.directorScene);
    const choices = availableProviderModels(loadProviderConnections(), 'video').filter(
      (choice) => !choice.videoModes?.length || choice.videoModes.includes('全能参考'),
    );
    const favoriteModel = matchModelFavorite(choices, readModelFavorite('video'));
    const providerIds = new Set(choices.map((choice) => choice.providerId));
    const recommended = choices.filter((choice) => choice.recommended);
    const automaticModel =
      favoriteModel ??
      (choices.length === 1
        ? choices[0]
        : providerIds.size === 1 && recommended.length === 1
          ? recommended[0]
          : undefined);
    const directorOutputCount = Array.isArray(directorNode.data.output)
      ? directorNode.data.output.filter(
          (value): value is string => typeof value === 'string' && Boolean(value),
        ).length
      : typeof directorNode.data.output === 'string' && directorNode.data.output
        ? 1
        : 0;
    const availableReferenceCount =
      directorNode.data.images?.length ||
      directorOutputCount ||
      (directorNode.data.imageUrl ? 1 : 0);
    if (!previsAsset && availableReferenceCount === 0) return null;
    const animationFrameCount = Math.max(
      1,
      Math.min(
        5,
        directorScene.stageMode === 'spatial'
          ? Math.min(
              directorScene.animationSampleCount ?? 1,
              Math.max(1, availableReferenceCount - (directorScene.supportingReferenceCount ?? 0)),
            )
          : 1,
        availableReferenceCount,
      ),
    );
    const supportingReferenceCount = Math.max(
      0,
      Math.min(4, directorScene.supportingReferenceCount ?? 0),
    );
    const taskAnimationFrameCount = previsAsset
      ? Math.max(1, Math.min(3, 5 - supportingReferenceCount))
      : animationFrameCount;
    const directorPosition = absoluteNodePosition(directorNode, nodes);
    const createdNode: FlowNode = {
      id,
      type: 'video',
      position: { x: directorPosition.x + NODE_W + 170, y: directorPosition.y },
      selected: true,
      data: {
        kind: 'video',
        ...def,
        title:
          directorScene.stageMode === 'spatial'
            ? previsAsset
              ? '3D 导演 · 视频任务'
              : '3D 导演 · 最终视频'
            : '导演台 · 最终视频',
        description:
          directorScene.stageMode === 'spatial'
            ? previsAsset
              ? `以 ${previsAsset.cameraLabel} 的可播放 3D 动画预演、角色骨骼和镜头约束作为 AI 视频参考`
              : `根据 ${animationFrameCount} 张 3D 动画关键帧、角色骨骼和镜头约束生成视频`
            : '根据导演构图与镜头约束生成视频',
        prompt: directorScene.prompt,
        genParams: { ...genParams, duration: directorScene.duration },
        composerParams: {
          mode: '全能参考',
          directorSourceId: directorNodeId,
          directorAnimationFrameCount: taskAnimationFrameCount,
          directorSupportingReferenceCount: supportingReferenceCount,
          ...(previsAsset
            ? {
                directorPrevisReferenceUrl: previsAsset.originalUrl,
                directorPrevisCameraLabel: previsAsset.cameraLabel,
              }
            : {}),
          ...(automaticModel
            ? { providerId: automaticModel.providerId, model: automaticModel.model }
            : {}),
        },
        ...(automaticModel
          ? {
              providerId: automaticModel.providerId,
              model: automaticModel.model,
              result: previsAsset
                ? `已装载 ${previsAsset.cameraLabel} 的 3D 动画预演视频，可播放检查后提交 AI。`
                : `已装载 ${animationFrameCount} 张 3D 动画关键帧，正在等待提交。`,
            }
          : {
              result: previsAsset
                ? `已装载 ${previsAsset.cameraLabel} 的 3D 动画预演视频。请选择一个可用的视频模型后提交。`
                : `已装载 ${animationFrameCount} 张 3D 动画关键帧。请选择一个可用的视频模型后提交。`,
            }),
        ...(previsAsset
          ? {
              originalUrl: previsAsset.originalUrl,
              videoUrl: previsAsset.originalUrl,
              videos: [previsAsset.originalUrl],
              videoPreviewUrl: previsAsset.originalUrl,
              previewUrl: previsAsset.previewUrl,
              mediaWidth: previsAsset.width,
              mediaHeight: previsAsset.height,
              durationSeconds: previsAsset.durationSeconds,
              bridgeAssetId: previsAsset.bridgeAssetId,
              directorPrevisUrl: previsAsset.originalUrl,
              directorPrevisCameraLabel: previsAsset.cameraLabel,
              composerReferences: [
                {
                  id: `director-previs-${directorNodeId}`,
                  type: 'video' as const,
                  url: previsAsset.originalUrl,
                  label: `3D 动画预演 · ${previsAsset.cameraLabel}`,
                },
              ],
            }
          : {}),
        aspectRatio: directorNode.data.aspectRatio ?? genParams.aspectRatio,
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), createdNode];
    const ports = resolveConnectionPorts(nextNodes, directorNodeId, null, id, null);
    if (!ports || !isValidConnection(nextNodes, edges, directorNodeId, null, id, null)) {
      return null;
    }
    get().takeSnapshot();
    set({
      nodes: nextNodes,
      edges: [
        ...edges,
        {
          id: genId('edge'),
          type: 'flow',
          source: directorNodeId,
          target: id,
          sourceHandle: ports.source.id,
          targetHandle: ports.target.id,
        },
      ],
      selectedNodeId: id,
    });
    get().propagate(directorNodeId);
    return id;
  },

  addNodeWithImage: (kind, position, imageUrl, title) => {
    get().takeSnapshot();
    const id = genId('node');
    const def = KIND_DEFAULTS[kind];
    const node: FlowNode = {
      id,
      type: 'image',
      position,
      data: {
        kind,
        ...def,
        referenceOnly: true,
        originalUrl: imageUrl,
        imageUrl,
        images: [imageUrl],
        output: imageUrl,
        composerReferences: [],
        title: title ?? nextNumberedNodeTitle(get().nodes, kind) ?? def.title,
        genParams: { ...get().genParams },
      },
    };
    set({ nodes: [...get().nodes, node] });
    return id;
  },

  moveNodesToTrash: (ids) => {
    const state = get();
    const removedIds = new Set(ids);
    for (const node of state.nodes) {
      if (node.parentId && removedIds.has(node.parentId)) removedIds.add(node.id);
    }
    const removedNodes = state.nodes.filter((node) => removedIds.has(node.id));
    if (!removedNodes.length) return;
    get().takeSnapshot();
    const removedEdges = state.edges.filter(
      (edge) => removedIds.has(edge.source) || removedIds.has(edge.target),
    );
    const rootNodes = removedNodes.filter(
      (node) => !node.parentId || !removedIds.has(node.parentId),
    );
    const title =
      rootNodes.length === 1
        ? rootNodes[0]?.data.title || '未命名节点'
        : `${rootNodes.length}个节点`;
    const item: TrashItem = {
      id: genId('trash'),
      projectId: state.activeProjectId,
      workspace: state.workspace === 'home' ? 'views' : state.workspace,
      title,
      deletedAt: Date.now(),
      nodes: clone(removedNodes, []).nodes,
      edges: clone([], removedEdges).edges,
    };
    const trash = [item, ...state.trash].slice(0, 100);
    void persistTrash(state.activeProjectId, trash);
    const edges = state.edges.filter(
      (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
    );
    const nodes = state.nodes.filter((node) => !removedIds.has(node.id));
    const removedSourceTargets = removedEdges
      .filter((edge) => removedIds.has(edge.source) && !removedIds.has(edge.target))
      .map((edge) => edge.target);
    const connectedNodes = syncConnectedTextPrompts(nodes, edges);
    set({
      nodes: syncMaterializedGraphInputs(connectedNodes, edges, removedSourceTargets),
      edges,
      trash,
      selectedNodeId:
        state.selectedNodeId && removedIds.has(state.selectedNodeId) ? null : state.selectedNodeId,
    });
  },

  deleteNode: (id) => get().moveNodesToTrash([id]),

  restoreTrashItem: (id) => {
    const state = get();
    const item = state.trash.find((entry) => entry.id === id);
    if (!item) return;
    if (item.workspace === state.workspace) {
      const restored = restoreTrashIntoSnapshot({ nodes: state.nodes, edges: state.edges }, item);
      if (restored.restoredNodeCount === 0) return;
      get().takeSnapshot();
      const trash = state.trash.filter((entry) => entry.id !== id);
      set({
        nodes: syncConnectedTextPrompts(restored.nodes, restored.edges),
        edges: restored.edges,
        trash,
      });
      void persistTrash(state.activeProjectId, trash);
      void persistCanvas(get());
      return;
    }
    let snapshot = workspaceStates.get(item.workspace);
    if (!snapshot) {
      const meta = projectCanvasMeta.get(state.activeProjectId);
      const persisted = readPersistedWorkspaceSnapshot(state.activeProjectId, item.workspace);
      if (
        persisted.status === 'error' ||
        (meta?.workspaceIds.includes(item.workspace) && persisted.status === 'missing')
      ) {
        publishPersistenceStatus({
          ...persistenceStatusFor(state.activeProjectId),
          projectId: state.activeProjectId,
          state: 'error',
          lastAttemptAt: Date.now(),
          message:
            persisted.status === 'error'
              ? persisted.error.message
              : '回收站目标工作台的快照缺失，本次恢复已取消。',
        });
        return;
      }
      snapshot = persisted.status === 'found' ? persisted.snapshot : loadWorkspace(item.workspace);
    }
    const restored = restoreTrashIntoSnapshot(snapshot, item);
    if (restored.restoredNodeCount === 0) return;
    workspaceStates.set(item.workspace, { nodes: restored.nodes, edges: restored.edges });
    const trash = state.trash.filter((entry) => entry.id !== id);
    set({ trash });
    void persistTrash(state.activeProjectId, trash);
    void persistCanvas(get());
  },

  permanentlyDeleteTrashItem: async (id) => {
    const state = get();
    const item = state.trash.find((entry) => entry.id === id);
    if (!item) return;
    const trash = state.trash.filter((entry) => entry.id !== id);
    await persistTrash(state.activeProjectId, trash);
    set({ trash });
    void persistCanvas(get());
    await cleanupTrashMedia(item, get());
  },

  emptyTrash: async () => {
    const state = get();
    const items = state.trash;
    if (!items.length) return;
    await persistTrash(state.activeProjectId, []);
    set({ trash: [] });
    void persistCanvas(get());
    for (const item of items) await cleanupTrashMedia(item, get());
  },

  requestDeleteNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    if (!useCanvasPreferences.getState().confirmMoveToTrash) {
      get().deleteNode(id);
      return;
    }
    const isGroup = node.data.kind === 'group';
    const childCount = isGroup ? get().nodes.filter((item) => item.parentId === id).length : 0;
    set({
      deleteConfirm: {
        nodeId: id,
        nodeTitle: isGroup ? `${node.data.title} · ${childCount}个节点` : node.data.title,
        title: isGroup ? '将整个分组移到回收站？' : '移到回收站？',
        description: isGroup
          ? '分组及其内部节点会一起进入回收站，并可完整恢复。如果只想移除分组边框，请使用“拆解分组”。'
          : '节点和相关连线会进入当前画布的回收站，可在永久删除前恢复。',
        onConfirm: () => {
          get().deleteNode(id);
          set({ deleteConfirm: null });
        },
      },
    });
  },

  duplicateNode: (id) => {
    const src = get().nodes.find((n) => n.id === id);
    if (!src) return;
    get().takeSnapshot();
    const copy: FlowNode = {
      ...src,
      id: genId('node'),
      position: { x: src.position.x + 40, y: src.position.y + 40 },
      data: copyNodeDataWithoutLiveExecution(src.data, get().nodes),
      selected: false,
    };
    set({ nodes: [...get().nodes, copy] });
  },

  deleteEdge: (id) => {
    const removed = get().edges.find((edge) => edge.id === id);
    if (!removed) return;
    get().takeSnapshot();
    const edges = get().edges.filter((edge) => edge.id !== id);
    const nodes = syncConnectedTextPrompts(get().nodes, edges);
    set({ edges, nodes: syncMaterializedGraphInputs(nodes, edges, [removed.target]) });
  },

  insertNodeOnEdge: (edgeId) => {
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const s = get().nodes.find((n) => n.id === edge.source);
    const t = get().nodes.find((n) => n.id === edge.target);
    if (!s || !t) return;
    get().takeSnapshot();
    const id = genId('node');
    const node: FlowNode = {
      id,
      type: 'image',
      position: { x: (s.position.x + t.position.x) / 2, y: (s.position.y + t.position.y) / 2 },
      data: {
        kind: 'image',
        ...KIND_DEFAULTS.image,
        ...placeholderImage('image'),
        genParams: { ...get().genParams },
      },
    };
    const newEdges: FlowEdge[] = [
      ...get().edges.filter((e) => e.id !== edgeId),
      { id: genId('edge'), source: edge.source, target: id, type: 'flow' },
      { id: genId('edge'), source: id, target: edge.target, type: 'flow' },
    ];
    const nodes = [...get().nodes, node];
    set({
      nodes: syncMaterializedGraphInputs(nodes, newEdges, [id, edge.target]),
      edges: newEdges,
    });
  },

  copyNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) set({ clipboard: { ...node, data: { ...node.data } } });
  },

  pasteNode: (position) => {
    const clip = get().clipboard;
    if (!clip) return;
    get().takeSnapshot();
    const id = genId('node');
    const node: FlowNode = {
      ...clip,
      id,
      position,
      data: copyNodeDataWithoutLiveExecution(clip.data, get().nodes),
      selected: false,
      parentId: undefined,
      extent: undefined,
      expandParent: undefined,
    };
    set({ nodes: [...get().nodes, node] });
  },

  copyNodeAt: (id, position) => {
    const src = get().nodes.find((n) => n.id === id);
    if (!src) return '';
    get().takeSnapshot();
    const copy: FlowNode = {
      ...src,
      id: genId('node'),
      position,
      data: copyNodeDataWithoutLiveExecution(src.data, get().nodes),
      selected: false,
      parentId: undefined,
      extent: undefined,
    };
    set({ nodes: [...get().nodes, copy] });
    return copy.id;
  },

  setNodePosition: (id, position) => {
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, position } : n)) });
  },

  setImageComparisonNodeDimensions: (id, width, height) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    let changed = false;
    let parentId: string | undefined;
    const nodes = get().nodes.map((node) => {
      if (node.id !== id || node.data.kind !== 'image-compare') return node;
      const currentWidth = Number(node.style?.width ?? node.measured?.width);
      const currentHeight = Number(node.style?.height ?? node.measured?.height);
      if (currentWidth === nextWidth && currentHeight === nextHeight) return node;
      changed = true;
      parentId = node.parentId;
      return {
        ...node,
        width: nextWidth,
        height: nextHeight,
        measured: { width: nextWidth, height: nextHeight },
        style: { ...node.style, width: nextWidth, height: nextHeight },
      };
    });
    if (!changed) return;
    set({ nodes });
    if (parentId) get().fitGroupsToChildren(parentId);
  },

  arrangeNodesInGrid: (nodeIds, columns) => {
    const arrangement = resolveGridArrangement(get().nodes, nodeIds, columns);
    if (!arrangement) return false;

    get().takeSnapshot();
    const positions = new Map(arrangement.positions.map((item) => [item.id, item.position]));
    set({
      nodes: get().nodes.map((node) => {
        const position = positions.get(node.id);
        return position ? { ...node, position } : node;
      }),
    });
    if (arrangement.parentId) get().fitGroupsToChildren(arrangement.parentId);
    return true;
  },

  createGroupFromSelection: () => {
    const { nodes } = get();
    const selected = nodes.filter((n) => n.selected && n.data.kind !== 'group' && !n.parentId);
    if (selected.length < 1) return;
    get().takeSnapshot();
    const minX = Math.min(...selected.map((n) => n.position.x));
    const minY = Math.min(...selected.map((n) => n.position.y));
    const maxX = Math.max(...selected.map((n) => n.position.x + nodeRenderedSize(n).width));
    const maxY = Math.max(...selected.map((n) => n.position.y + nodeRenderedSize(n).height));
    const groupPos = { x: minX - PAD, y: minY - GROUP_TOP_PAD };
    const width = maxX - minX + PAD * 2;
    const height = maxY - minY + PAD + GROUP_TOP_PAD;
    const groupId = genId('group');
    const groupNode: FlowNode = {
      id: groupId,
      type: 'group',
      position: groupPos,
      data: { kind: 'group', title: '分组' },
      style: { width, height },
      zIndex: -1,
    };
    const children = selected.map((n) => ({
      ...n,
      parentId: groupId,
      extent: 'parent' as const,
      expandParent: true,
      position: { x: n.position.x - groupPos.x, y: n.position.y - groupPos.y },
    }));
    const rest = nodes.filter((n) => !selected.includes(n));
    set({ nodes: [...rest, groupNode, ...children] });
  },

  ungroupNode: (id) => {
    const group = get().nodes.find((n) => n.id === id);
    if (!group) return;
    get().takeSnapshot();
    const gp = group.position;
    const nodes = get().nodes.map((n) => {
      if (n.parentId === id) {
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          expandParent: undefined,
          position: { x: gp.x + n.position.x, y: gp.y + n.position.y },
        };
      }
      return n;
    });
    set({ nodes: nodes.filter((n) => n.id !== id) });
  },

  detachOutOfBoundsChildren: () => {
    const { nodes } = get();
    const groups = nodes.filter((n) => n.data.kind === 'group');
    if (!groups.length) return;
    let changed = false;
    const next = nodes.map((n) => {
      if (!n.parentId) return n;
      const group = groups.find((g) => g.id === n.parentId);
      if (!group) return n;
      const gw = Number(group.style?.width ?? 0);
      const gh = Number(group.style?.height ?? 0);
      const { width: childWidth, height: childHeight } = nodeRenderedSize(n);
      const inside =
        n.position.x >= -2 &&
        n.position.y >= -2 &&
        n.position.x <= gw - childWidth + 2 &&
        n.position.y <= gh - childHeight + 2;
      if (!inside) {
        changed = true;
        const gp = group.position;
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          expandParent: undefined,
          position: { x: gp.x + n.position.x, y: gp.y + n.position.y },
        };
      }
      return n;
    });
    if (changed) set({ nodes: next });
  },

  fitGroupsToChildren: (groupId) => {
    const { nodes } = get();
    const groups = nodes.filter(
      (node) => node.data.kind === 'group' && (!groupId || node.id === groupId),
    );
    if (!groups.length) return;

    let next = nodes;
    for (const group of groups) {
      const children = next.filter((node) => node.parentId === group.id);
      if (!children.length) continue;

      const minX = Math.min(...children.map((node) => node.position.x));
      const minY = Math.min(...children.map((node) => node.position.y));
      const maxX = Math.max(
        ...children.map((node) => node.position.x + nodeRenderedSize(node).width),
      );
      const maxY = Math.max(
        ...children.map((node) => node.position.y + nodeRenderedSize(node).height),
      );
      const offsetX = minX - PAD;
      const offsetY = minY - GROUP_TOP_PAD;
      const width = maxX - minX + PAD * 2;
      const height = maxY - minY + PAD + GROUP_TOP_PAD;

      next = next.map((node) => {
        if (node.id === group.id) {
          return {
            ...node,
            width,
            height,
            measured: { width, height },
            position: {
              x: node.position.x + offsetX,
              y: node.position.y + offsetY,
            },
            style: { ...node.style, width, height },
          };
        }
        if (node.parentId === group.id) {
          return {
            ...node,
            expandParent: true,
            position: {
              x: node.position.x - offsetX,
              y: node.position.y - offsetY,
            },
          };
        }
        return node;
      });
    }
    set({ nodes: next });
  },

  createWorkflowTemplate: (template, position) => {
    get().takeSnapshot();
    const nodes = get().nodes;

    switch (template) {
      case 'script': {
        // Single script node
        const id = genId('node');
        const node: FlowNode = {
          id,
          type: 'script',
          position,
          data: {
            kind: 'script',
            ...KIND_DEFAULTS.script,
            ...placeholderImage('script'),
            genParams: { ...get().genParams },
            prompt: '输入故事主题开始生成分镜',
          },
        };
        set({ nodes: [...nodes, node] });
        return [id];
      }
      case 'text2img': {
        // 文本节点 → 图片节点
        const textId = genId('node');
        const imgId = genId('node');
        const textNode: FlowNode = {
          id: textId,
          type: 'text',
          position: { x: position.x - NODE_W / 2 - 200, y: position.y },
          data: {
            kind: 'text',
            ...KIND_DEFAULTS.text,
            ...placeholderImage('text'),
            genParams: { ...get().genParams },
            prompt: '生成一张精美图片',
          },
        };
        const imgNode: FlowNode = {
          id: imgId,
          type: 'image',
          position: { x: position.x + NODE_W / 2 + 40, y: position.y },
          data: {
            kind: 'image',
            ...KIND_DEFAULTS.image,
            ...placeholderImage('image'),
            genParams: { ...get().genParams },
          },
        };
        const edge: FlowEdge = { id: genId('edge'), source: textId, target: imgId, type: 'flow' };
        set({ nodes: [...nodes, textNode, imgNode], edges: [...get().edges, edge] });
        return [textId, imgId];
      }
      case 'img2img': {
        // 参考图节点 → 生成图节点
        const srcId = genId('node');
        const tgtId = genId('node');
        const srcNode: FlowNode = {
          id: srcId,
          type: 'image',
          position: { x: position.x - NODE_W / 2 - 200, y: position.y },
          data: {
            kind: 'image',
            ...KIND_DEFAULTS.image,
            ...placeholderImage('image'),
            prompt: '参考图',
            title: '参考图',
            description: '上传参考图片',
            genParams: { ...get().genParams },
          },
        };
        const tgtNode: FlowNode = {
          id: tgtId,
          type: 'image',
          position: { x: position.x + NODE_W / 2 + 40, y: position.y },
          data: {
            kind: 'image',
            ...KIND_DEFAULTS.image,
            ...placeholderImage('image'),
            genParams: { ...get().genParams },
          },
        };
        const edge: FlowEdge = { id: genId('edge'), source: srcId, target: tgtId, type: 'flow' };
        set({ nodes: [...nodes, srcNode, tgtNode], edges: [...get().edges, edge] });
        return [srcId, tgtId];
      }
      case 'views': {
        // 角色参考图节点 → 三视图节点
        const refId = genId('node');
        const viewsId = genId('node');
        const refNode: FlowNode = {
          id: refId,
          type: 'image',
          position: { x: position.x - NODE_W / 2 - 200, y: position.y },
          data: {
            kind: 'image',
            ...KIND_DEFAULTS.image,
            ...placeholderImage('image'),
            title: '角色参考图',
            description: '上传角色正面参考',
            genParams: { ...get().genParams },
          },
        };
        const viewsNode: FlowNode = {
          id: viewsId,
          type: 'views',
          position: { x: position.x + NODE_W / 2 + 40, y: position.y },
          data: {
            kind: 'views',
            ...KIND_DEFAULTS.views,
            ...placeholderImage('views'),
            title: '角色三视图',
            description: '正面、侧面、背面三视图',
            viewCount: 3,
            genParams: { ...get().genParams, viewCount: 3 },
          },
        };
        const edge: FlowEdge = { id: genId('edge'), source: refId, target: viewsId, type: 'flow' };
        set({ nodes: [...nodes, refNode, viewsNode], edges: [...get().edges, edge] });
        return [refId, viewsId];
      }
      case 'video': {
        // 首帧图节点 → 视频节点
        const frameId = genId('node');
        const vidId = genId('node');
        const frameNode: FlowNode = {
          id: frameId,
          type: 'front-frame',
          position: { x: position.x - NODE_W / 2 - 200, y: position.y },
          data: {
            kind: 'front-frame',
            ...KIND_DEFAULTS['front-frame'],
            ...placeholderImage('front-frame'),
            title: '首帧图',
            description: '视频第一帧参考',
            genParams: { ...get().genParams },
          },
        };
        const vidNode: FlowNode = {
          id: vidId,
          type: 'video',
          position: { x: position.x + NODE_W / 2 + 40, y: position.y },
          data: {
            kind: 'video',
            ...KIND_DEFAULTS.video,
            ...placeholderImage('video'),
            title: '生成视频',
            description: '由首帧延展的视频',
            genParams: { ...get().genParams, mode: 'first-frame', duration: 5 },
          },
        };
        const edge: FlowEdge = { id: genId('edge'), source: frameId, target: vidId, type: 'flow' };
        set({ nodes: [...nodes, frameNode, vidNode], edges: [...get().edges, edge] });
        return [frameId, vidId];
      }
    }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  selectAllNodes: () => {
    const state = get();
    if (state.nodes.length === 0) return;
    if (state.selectedNodeId === null && state.nodes.every((node) => node.selected)) return;
    set({
      nodes: state.nodes.map((node) => (node.selected ? node : { ...node, selected: true })),
      selectedNodeId: null,
    });
  },
  setReferencePickerTargetId: (id) =>
    set({ referencePickerTargetId: id, ...(id ? { markPickerTargetId: null } : {}) }),
  setMarkPickerTargetId: (id) =>
    set({ markPickerTargetId: id, ...(id ? { referencePickerTargetId: null } : {}) }),
  setGroupRenameTargetId: (id) => set({ groupRenameTargetId: id }),

  updateNodeData: (id, patch) => {
    const inlineImageUrl =
      typeof patch.imageUrl === 'string' && isEmbeddedCanvasImage(patch.imageUrl)
        ? patch.imageUrl
        : undefined;
    const inlineMediaScope = inlineImageUrl
      ? {
          projectId: get().activeProjectId,
          workspace: get().workspace,
          nodeId: id,
          sourceUrl: inlineImageUrl,
        }
      : undefined;
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const nextPatch = { ...patch };
        const nextImageUrl = typeof patch.imageUrl === 'string' ? patch.imageUrl : undefined;
        const nextVideoUrl = typeof patch.videoUrl === 'string' ? patch.videoUrl : undefined;
        const nodeStoresVideo = n.data.kind === 'video' || n.data.kind === 'video-comp';
        if (nextImageUrl && !nodeStoresVideo && !('originalUrl' in patch)) {
          nextPatch.originalUrl = nextImageUrl;
        }
        if (nextVideoUrl && !('originalUrl' in patch)) {
          nextPatch.originalUrl = nextVideoUrl;
        }
        const changesVideoContent =
          ('videoUrl' in patch && patch.videoUrl !== n.data.videoUrl) ||
          ('videos' in patch && patch.videos !== n.data.videos) ||
          ('effectVideoId' in patch && patch.effectVideoId !== n.data.effectVideoId) ||
          ('assetVideoId' in patch && patch.assetVideoId !== n.data.assetVideoId);
        if (changesVideoContent && !('videoEditRevision' in patch)) {
          nextPatch.videoEditRevision = genId('video-revision');
        }
        const unresolvedRequestId =
          typeof n.data.generationRequestId === 'string' ? n.data.generationRequestId.trim() : '';
        const candidate = { ...n, data: { ...n.data, ...nextPatch } };
        if (
          unresolvedRequestId &&
          generationResultSignature(candidate) !== generationResultSignature(n)
        ) {
          return {
            ...n,
            data: {
              ...n.data,
              generating: false,
              generationError: UNRESOLVED_GENERATION_RESULT_REPLACEMENT_MESSAGE,
            },
          };
        }
        return candidate;
      }),
    });
    if (inlineImageUrl && inlineMediaScope) {
      void (async () => {
        try {
          const item = await new CanvasMediaPersistenceSession(inlineMediaScope.projectId).persist(
            inlineMediaScope.sourceUrl,
          );
          const originalUrl = await resolveCanvasMediaRuntimeUrl(item.originalUrl);
          const previewUrl = item.previewUrl
            ? await resolveCanvasMediaRuntimeUrl(item.previewUrl)
            : undefined;
          const currentState = get();
          if (
            currentState.activeProjectId !== inlineMediaScope.projectId ||
            currentState.workspace !== inlineMediaScope.workspace
          ) {
            return;
          }
          const current = currentState.nodes.find((node) => node.id === inlineMediaScope.nodeId);
          if (current?.data.imageUrl !== inlineMediaScope.sourceUrl) return;
          get().updateNodeData(id, {
            originalUrl,
            previewUrl,
            bridgeAssetId: item.bridgeAssetId,
            imageUrl: originalUrl,
            images: current.data.images?.map((url) =>
              url === inlineMediaScope.sourceUrl ? originalUrl : url,
            ),
            output:
              current.data.output === inlineMediaScope.sourceUrl
                ? originalUrl
                : current.data.output,
            composerReferences: current.data.composerReferences?.map((reference) =>
              reference.url === inlineMediaScope.sourceUrl
                ? { ...reference, url: originalUrl }
                : reference,
            ),
          });
          get().propagate(id);
        } catch {
          // The inline value remains available when the local bridge is offline.
        }
      })();
    }
  },

  updateNodeGenParams: (id, patch) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const prev = (n.data.genParams as GenParams | undefined) ?? { ...get().genParams };
        return { ...n, data: { ...n.data, genParams: { ...prev, ...patch } } };
      }),
    });
  },

  propagate: (sourceId) => {
    const { nodes, edges } = get();
    if (!nodes.some((node) => node.id === sourceId)) return;
    const directTargets = edges
      .filter((edge) => edge.source === sourceId)
      .map((edge) => edge.target);
    if (directTargets.length === 0) return;
    set({ nodes: syncMaterializedGraphInputs(nodes, edges, directTargets) });
  },

  recoverNodeGenerationResult: async (id, options) => {
    const state = get();
    const node = state.nodes.find((candidate) => candidate.id === id);
    if (!node) return 'unavailable';
    const kind = recoverableGenerationKind(node);
    const requestId =
      typeof node.data.generationRequestId === 'string' ? node.data.generationRequestId.trim() : '';
    if (!kind || !requestId) return 'unavailable';
    const targetMediaSignature = generationTargetMediaSignature(node);
    if (!targetMediaSignature || generationResultSignature(node) !== targetMediaSignature) {
      return 'stale';
    }

    const scope: GenerationScope = {
      projectId: state.activeProjectId,
      workspace: state.workspace,
      nodeId: id,
      requestId,
      targetMediaSignature,
    };
    const automatic = options?.automatic === true;
    if (options?.signal?.aborted) return 'stale';
    if (automatic && !isBridgeCanvasAuthorityReadyForLan(scope.projectId)) return 'stale';
    const updateStatus = async (
      status: Exclude<NodeGenerationRecoveryStatus, 'recovered' | 'stale' | 'unavailable'>,
      message: string,
      clearRequest = false,
    ): Promise<NodeGenerationRecoveryStatus> => {
      if (!hasRecoverableGenerationScope(get(), scope, kind)) return 'stale';
      if (automatic && (status === 'pending' || status === 'missing' || status === 'error')) {
        return status;
      }
      set({
        nodes: get().nodes.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  generating: false,
                  generationRequestId: clearRequest
                    ? undefined
                    : candidate.data.generationRequestId,
                  generationTargetMediaSignature: clearRequest
                    ? undefined
                    : candidate.data.generationTargetMediaSignature,
                  progress: 0,
                  generationError: message,
                  result: message,
                },
              }
            : candidate,
        ),
      });
      await flushCanvasPersistence();
      return status;
    };

    try {
      const lookup = options?.signal
        ? await lookupGenerationRequestByRequestId(requestId, kind, { signal: options.signal })
        : await lookupGenerationRequestByRequestId(requestId, kind);
      if (options?.signal?.aborted) return 'stale';
      if (!hasRecoverableGenerationScope(get(), scope, kind)) return 'stale';
      if (automatic && !isBridgeCanvasAuthorityReadyForLan(scope.projectId)) return 'stale';
      if (lookup.status === 'pending') {
        return updateStatus(
          'pending',
          '原生成任务仍在本机后台执行，不会重复提交。请稍后再次检查生成结果。',
        );
      }
      if (lookup.status === 'failed') {
        return updateStatus(
          'failed',
          `原生成请求已明确失败：${lookup.error}。请求锁已解除，可以重新提交。`,
          true,
        );
      }
      if (lookup.status === 'missing') {
        return updateStatus(
          'missing',
          '本机生成记录已确认缺失，原请求锁已解除。请确认当前连接的是原画布桥，再决定是否重新提交。',
          true,
        );
      }

      if (kind === 'text') {
        const text = recoveredTextOutput(lookup.result);
        if (!text) {
          return updateStatus(
            'failed',
            '本机记录显示文本生成已完成，但结果中没有可用文字；已拒绝空结果回填。',
            true,
          );
        }
        set({
          nodes: get().nodes.map((candidate) =>
            candidate.id === id
              ? {
                  ...candidate,
                  data: {
                    ...candidate.data,
                    generating: false,
                    generationRequestId: undefined,
                    generationTargetMediaSignature: undefined,
                    progress: 100,
                    generationError: undefined,
                    result: text,
                    outputText: text,
                    output: text,
                  },
                }
              : candidate,
          ),
        });
        get().propagate(id);
        notifyGeneratedText();
        await flushCanvasPersistence();
        return 'recovered';
      }

      const mediaUrls = recoveredMediaUrls(lookup.result, kind);
      if (mediaUrls.length === 0) {
        return updateStatus(
          'failed',
          '本机记录显示生成已完成，但结果中没有可用媒体文件；已拒绝空结果回填。',
          true,
        );
      }
      const currentNodes = get().nodes;
      const currentSource = currentNodes.find((candidate) => candidate.id === id);
      if (!currentSource) return 'stale';
      const legacyBatchIndex =
        kind !== 'audio' &&
        kind !== '3d' &&
        typeof currentSource.data.generatedBatchSourceId === 'string' &&
        currentSource.data.generatedBatchSourceId.trim() &&
        Number.isSafeInteger(currentSource.data.generatedBatchIndex) &&
        Number(currentSource.data.generatedBatchIndex) >= 2
          ? Number(currentSource.data.generatedBatchIndex) - 1
          : undefined;
      if (legacyBatchIndex !== undefined && !mediaUrls[legacyBatchIndex]) {
        return updateStatus(
          'failed',
          `原生成批次中没有第 ${legacyBatchIndex + 1} 项结果；已解除旧请求锁，且不会用其他图片或视频替代。`,
          true,
        );
      }
      const primaryMediaUrl = mediaUrls[legacyBatchIndex ?? 0] as string;
      const output =
        (kind === 'audio' || kind === '3d') && mediaUrls.length > 1 ? mediaUrls : primaryMediaUrl;
      const recoveredNodes = currentNodes.map((candidate) => {
        if (candidate.id !== id) return candidate;
        return {
          ...candidate,
          data: {
            ...candidate.data,
            generating: false,
            generationRequestId: undefined,
            generationTargetMediaSignature: undefined,
            progress: 100,
            generationError: undefined,
            originalUrl:
              kind === 'image' || kind === 'video' ? primaryMediaUrl : candidate.data.originalUrl,
            previewUrl:
              kind === 'image' || kind === 'video' ? undefined : candidate.data.previewUrl,
            bridgeAssetId: undefined,
            mediaPersistenceState: undefined,
            mediaMimeType: undefined,
            result: `已恢复${kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '3D 模型'}生成结果。`,
            output,
            ...(kind === 'image'
              ? { imageUrl: primaryMediaUrl, images: [primaryMediaUrl] }
              : kind === 'video'
                ? {
                    videoUrl: primaryMediaUrl,
                    videos: [primaryMediaUrl],
                    videoEditRevision: genId('video-revision'),
                  }
                : kind === 'audio'
                  ? {
                      audioUrl: primaryMediaUrl,
                      audios: mediaUrls,
                      audioSourceState: undefined,
                    }
                  : { model3dUrl: primaryMediaUrl, models3d: mediaUrls }),
          },
        };
      });
      const siblingNodes =
        kind === 'audio' || kind === '3d' || legacyBatchIndex !== undefined
          ? []
          : createGeneratedMediaSiblingNodes(
              currentSource,
              currentNodes,
              mediaUrls,
              kind,
              scope.requestId,
            );
      set({
        nodes: [...recoveredNodes, ...siblingNodes],
      });
      get().propagate(id);
      await flushCanvasPersistence();
      return 'recovered';
    } catch (error) {
      if (options?.signal?.aborted) return 'stale';
      return updateStatus(
        'error',
        `检查生成结果失败：${error instanceof Error && error.message.trim() ? error.message : '无法连接本机画布桥。'}（不会自动重新提交）`,
      );
    }
  },

  generateNode: async (id, promptOverride) => {
    try {
      await hydrateActiveCanvasMedia();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : '无法读取参考图原文件，已停止生成；系统不会使用缩略图替代。';
      set({
        nodes: get().nodes.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  generating: false,
                  progress: 0,
                  generationError: message,
                  result: message,
                },
              }
            : candidate,
        ),
      });
      reportCanvasMediaHydrationError(error);
      return;
    }
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.data.generating === true) return;
    const unresolvedGenerationKind = recoverableGenerationKind(node);
    if (
      unresolvedGenerationKind &&
      typeof node.data.generationRequestId === 'string' &&
      node.data.generationRequestId.trim()
    ) {
      const message =
        '此节点仍绑定一个状态未确认的原生成请求。请先点击“检查生成结果”；在结果为进行中或恢复服务不可达时，系统不会创建新的付费请求。';
      set({
        nodes: get().nodes.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                data: {
                  ...candidate.data,
                  generating: false,
                  progress: 0,
                  generationError: message,
                  result: message,
                },
              }
            : candidate,
        ),
      });
      return;
    }
    const directorSourceId = node.data.composerParams?.directorSourceId;
    const isFlatDirectorTask =
      node.data.kind === 'image' &&
      typeof node.data.composerParams?.directorReferenceCount === 'number';
    const directorSource =
      typeof directorSourceId === 'string' && directorSourceId
        ? get().nodes.find((item) => item.id === directorSourceId)
        : undefined;
    const isAtomicDirectorTask = Boolean(
      directorSource && isDirectorNodeKind(directorSource.data.kind),
    );
    const rejectDirectorTask = (message: string, markDirectorDirty = false) => {
      set({
        nodes: get().nodes.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              data: {
                ...item.data,
                generating: false,
                progress: 0,
                generationError: message,
                result: message,
              },
            };
          }
          if (markDirectorDirty && item.id === directorSourceId) {
            return { ...item, data: { ...item.data, directorOutputDirty: true } };
          }
          return item;
        }),
      });
    };
    const liveDirectorConnections = get().edges.filter((edge) => {
      if (edge.target !== id) return false;
      const source = get().nodes.find((item) => item.id === edge.source);
      return Boolean(source && isDirectorNodeKind(source.data.kind));
    });
    if (!isFlatDirectorTask && typeof directorSourceId === 'string' && directorSourceId) {
      if (
        liveDirectorConnections.length !== 1 ||
        liveDirectorConnections[0]?.source !== directorSourceId
      ) {
        rejectDirectorTask('导演任务与唯一实时导演连线不一致，请回到导演台重新应用任务。');
        return;
      }
    } else if (!isFlatDirectorTask && liveDirectorConnections.length > 0) {
      rejectDirectorTask('导演连线缺少原子任务标识，请回到导演台重新应用任务。');
      return;
    }
    if (typeof directorSourceId === 'string' && directorSourceId) {
      if (!directorSource || directorSource.data.directorOutputDirty === true) {
        rejectDirectorTask(
          directorSource
            ? isFlatDirectorTask
              ? '2D 导演台站位已更改，请先重新应用导演台。'
              : '导演台内容已更改，请先重新应用导演台。'
            : isFlatDirectorTask
              ? '关联的 2D 导演台已不存在，无法安全复用人物站位。'
              : '关联的导演台已不存在，无法继续生成。',
        );
        return;
      }
      if (isFlatDirectorTask) {
        const hasLiveDirectorConnection = get().edges.some(
          (edge) => edge.source === directorSourceId && edge.target === id,
        );
        const compiledImages = directorSource.data.images?.filter(Boolean) ?? [];
        const compiledReferenceCount = Number(node.data.composerParams?.directorReferenceCount);
        if (
          !hasLiveDirectorConnection ||
          !directorSource.data.directorConstraintPrompt?.trim() ||
          compiledImages.length === 0 ||
          compiledImages.length !== compiledReferenceCount
        ) {
          rejectDirectorTask(
            '2D 导演图片任务与构图引用已断开，请回到导演台重新创建或应用图片节点。',
          );
          return;
        }
        const scene = normalizeDirectorScene(directorSource.data.directorScene);
        const sourceSnapshots = [
          ...(scene.sceneSourceId && scene.sceneUrl
            ? [{ sourceId: scene.sceneSourceId, imageUrl: scene.sceneUrl }]
            : []),
          ...scene.subjects.flatMap((subject) =>
            subject.sourceNodeId && subject.imageUrl
              ? [{ sourceId: subject.sourceNodeId, imageUrl: subject.imageUrl }]
              : [],
          ),
        ];
        const sourceImageChanged = sourceSnapshots.some(({ sourceId, imageUrl }) => {
          const sourceNode = get().nodes.find((item) => item.id === sourceId);
          const currentImage = sourceNode ? preferredImageReferenceUrls(sourceNode.data)[0] : '';
          return (
            !currentImage || resolveMediaSourceUrl(currentImage) !== resolveMediaSourceUrl(imageUrl)
          );
        });
        if (sourceImageChanged) {
          rejectDirectorTask(
            '场景图或人物身份图已经更新，请回到 2D 导演台重新应用当前站位。',
            true,
          );
          return;
        }
        const directorAspectRatio =
          directorSource.data.genParams?.aspectRatio ?? directorSource.data.aspectRatio;
        const taskAspectRatio = node.data.genParams?.aspectRatio ?? node.data.aspectRatio;
        if (
          typeof directorAspectRatio === 'string' &&
          typeof taskAspectRatio === 'string' &&
          directorAspectRatio !== taskAspectRatio
        ) {
          rejectDirectorTask('图片节点画幅已与 2D 导演控制图不一致，请回到导演台重新应用站位。');
          return;
        }
      } else {
        const imageBundle = directorSource.data.images?.filter(Boolean) ?? [];
        const outputBundle = Array.isArray(directorSource.data.output)
          ? directorSource.data.output.filter(
              (value): value is string => typeof value === 'string' && Boolean(value),
            )
          : typeof directorSource.data.output === 'string' && directorSource.data.output
            ? [directorSource.data.output]
            : [];
        const compiledImages = imageBundle.length
          ? imageBundle
          : outputBundle.length
            ? outputBundle
            : directorSource.data.imageUrl
              ? [directorSource.data.imageUrl]
              : [];
        const usesPrevis = Boolean(
          typeof node.data.composerParams?.directorPrevisReferenceUrl === 'string' &&
          node.data.composerParams.directorPrevisReferenceUrl.trim(),
        );
        const animationCount = Math.max(
          1,
          Math.min(5, Number(node.data.composerParams?.directorAnimationFrameCount) || 1),
        );
        const supportingCount = Math.max(
          0,
          Math.min(4, Number(node.data.composerParams?.directorSupportingReferenceCount) || 0),
        );
        const minimumDirectorImages = usesPrevis
          ? supportingCount
          : animationCount + supportingCount;
        if (
          !directorSource.data.directorConstraintPrompt?.trim() ||
          compiledImages.length < minimumDirectorImages
        ) {
          rejectDirectorTask(
            '3D 导演任务的控制图、身份参考或约束已不完整，请回到导演台重新应用任务。',
          );
          return;
        }
      }
    }
    const generationRequestId = genId('gen');
    const generationScope: GenerationScope = {
      projectId: get().activeProjectId,
      workspace: get().workspace,
      nodeId: id,
      requestId: generationRequestId,
      targetMediaSignature: generationResultSignature(node),
    };
    const meta = NODE_KIND_META[node.data.kind];
    if (!meta?.isGenerator) {
      set({
        nodes: get().nodes.map((item) =>
          item.id === id
            ? {
                ...item,
                data: {
                  ...item.data,
                  generating: false,
                  progress: 0,
                  result: '这个节点用于组织或传递数据，本身没有可执行的生成任务。',
                },
              }
            : item,
        ),
      });
      return;
    }
    get().takeSnapshot();
    const composerParams = (node.data.composerParams as Record<string, unknown> | undefined) ?? {};
    const nodeGenParams = (node.data.genParams as Partial<GenParams> | undefined) ?? {};
    const generationParams = {
      ...get().genParams,
      ...nodeGenParams,
      ...(node.data.kind === 'video'
        ? {
            audio: requestedVideoAudio(
              composerParams.videoAudioSelectionExplicit === true,
              nodeGenParams.audio,
            ),
          }
        : {}),
    };

    if (node.data.kind === 'video-comp') {
      const portInputs = collectNodeInputs(get().nodes, get().edges, id);
      const clips = (portInputs.clips ?? []).filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
      const audioSource = (portInputs['audio-track'] ?? []).find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
      set({
        nodes: get().nodes.map((item) =>
          item.id === id
            ? {
                ...item,
                data: {
                  ...item.data,
                  generating: true,
                  generationRequestId,
                  progress: 0,
                  result: clips.length ? '正在创建本机 FFmpeg 合成任务…' : '',
                  portInputs,
                },
              }
            : item,
        ),
      });
      try {
        const job = await renderTimeline({
          clips: clips.map((source) => ({
            source,
            duration: generationParams.duration ?? 5,
          })),
          audioSource,
          onProgress: (progress) =>
            hasActiveGenerationScope(get(), generationScope) &&
            set({
              nodes: get().nodes.map((item) =>
                item.id === id ? { ...item, data: { ...item.data, progress } } : item,
              ),
            }),
        });
        if (!hasActiveGenerationScope(get(), generationScope)) return;
        set({
          nodes: get().nodes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    generating: false,
                    generationRequestId: undefined,
                    progress: 100,
                    result: job.output || '视频合成完成。',
                    videoUrl: job.url,
                    videos: job.url ? [job.url] : [],
                    videoEditRevision: job.url
                      ? genId('video-revision')
                      : item.data.videoEditRevision,
                    output: job.url,
                  },
                }
              : item,
          ),
        });
        if (job.url) notifyGeneratedMedia('video');
        get().propagate(id);
      } catch (error) {
        if (!hasActiveGenerationScope(get(), generationScope)) return;
        const message = error instanceof Error ? error.message : '视频合成失败。';
        set({
          nodes: get().nodes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    generating: false,
                    generationRequestId: undefined,
                    progress: 0,
                    result: message,
                  },
                }
              : item,
          ),
        });
        throw error;
      }
      return;
    }

    if (node.data.kind === 'loop') {
      const sourceIds = [
        ...new Set(
          get()
            .edges.filter((edge) => edge.target === id)
            .map((edge) => edge.source),
        ),
      ];
      const executableSources = sourceIds.filter((sourceId) => {
        const source = get().nodes.find((item) => item.id === sourceId);
        return Boolean(
          source && source.data.kind !== 'loop' && NODE_KIND_META[source.data.kind]?.isGenerator,
        );
      });
      const iterations = generationParams.count === 4 ? 4 : generationParams.count === 2 ? 2 : 1;
      set({
        nodes: get().nodes.map((item) =>
          item.id === id
            ? {
                ...item,
                data: {
                  ...item.data,
                  generating: true,
                  generationRequestId,
                  progress: 0,
                  result: executableSources.length ? `准备重复运行 ${iterations} 次…` : '',
                },
              }
            : item,
        ),
      });
      try {
        if (!executableSources.length) {
          throw new Error('循环节点没有连接可执行的上游生成节点。');
        }
        const outputs: unknown[] = [];
        for (let iteration = 0; iteration < iterations; iteration += 1) {
          if (!hasActiveGenerationScope(get(), generationScope)) return;
          for (const sourceId of executableSources) await get().generateNode(sourceId);
          if (!hasActiveGenerationScope(get(), generationScope)) return;
          const inputs = collectNodeInputs(get().nodes, get().edges, id);
          outputs.push(...Object.values(inputs).flat());
          const progress = Math.round(((iteration + 1) / iterations) * 100);
          set({
            nodes: get().nodes.map((item) =>
              item.id === id
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      progress,
                      result: `已完成 ${iteration + 1}/${iterations} 次运行。`,
                    },
                  }
                : item,
            ),
          });
        }
        const strings = outputs.filter((value): value is string => typeof value === 'string');
        const videoPattern = /\.(?:mp4|webm|mov)(?:$|[?#])/i;
        const audioPattern = /\.(?:mp3|wav|m4a|aac|flac|ogg)(?:$|[?#])/i;
        const mediaPattern = /^(?:https?:|data:image\/|blob:)/i;
        const videos = strings.filter((value) => videoPattern.test(value));
        const audios = strings.filter((value) => audioPattern.test(value));
        const images = strings.filter(
          (value) =>
            mediaPattern.test(value) && !videoPattern.test(value) && !audioPattern.test(value),
        );
        const outputText = strings.filter((value) => !mediaPattern.test(value)).join('\n');
        set({
          nodes: get().nodes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    generating: false,
                    generationRequestId: undefined,
                    progress: 100,
                    result: `循环完成，共收集 ${outputs.length} 个结果。`,
                    output: outputs.length === 1 ? outputs[0] : outputs,
                    outputText: outputText || undefined,
                    images: images.length ? images : undefined,
                    imageUrl: images[0],
                    videos: videos.length ? videos : undefined,
                    videoUrl: videos[0],
                    videoEditRevision: videos.length
                      ? genId('video-revision')
                      : item.data.videoEditRevision,
                    audios: audios.length ? audios : undefined,
                    audioUrl: audios[0],
                  },
                }
              : item,
          ),
        });
        get().propagate(id);
      } catch (error) {
        if (!hasActiveGenerationScope(get(), generationScope)) return;
        const message = error instanceof Error ? error.message : '循环执行失败。';
        set({
          nodes: get().nodes.map((item) =>
            item.id === id
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    generating: false,
                    generationRequestId: undefined,
                    progress: 0,
                    result: message,
                  },
                }
              : item,
          ),
        });
        throw error;
      }
      return;
    }

    // 复刻旧版 generatorSources：收集直接上游的 prompt 文本与参考图
    const {
      prompt,
      directorPrompts,
      referenceImages,
      referenceVideos,
      directorReferenceImages,
      inputs,
    } = collectUpstream(get().nodes, get().edges, id);
    const requestDirectorPrompts = isFlatDirectorTask
      ? directorSource?.data.directorConstraintPrompt?.trim()
        ? [directorSource.data.directorConstraintPrompt.trim()]
        : []
      : directorPrompts;
    const requestDirectorReferenceImages = isFlatDirectorTask
      ? (directorSource?.data.images?.filter(Boolean) ?? [])
      : directorReferenceImages;
    const manualReferenceList = manualReferences(node);
    const composerMarks = Array.isArray(node.data.composerMarks) ? node.data.composerMarks : [];
    const markReferenceImages = isAtomicDirectorTask
      ? []
      : composerMarks.flatMap((mark) =>
          mark && typeof mark.sourceUrl === 'string' ? [mark.sourceUrl] : [],
        );
    const submittedReferenceImages = isAtomicDirectorTask
      ? requestDirectorReferenceImages
      : resolveSubmittedReferenceImages(
          referenceImages,
          node.data.composerReferenceSubmission,
          manualReferenceList,
        );
    const allReferenceImages = isAtomicDirectorTask
      ? [...submittedReferenceImages]
      : [...new Set([...submittedReferenceImages, ...markReferenceImages])];
    const submittedReferenceVideos = resolveSubmittedReferenceVideos(
      referenceVideos,
      node.data.composerReferenceSubmission,
      manualReferenceList,
    );
    const firstInputValue = (key: string): string | undefined =>
      (inputs[key] ?? []).find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
    const submittedVideoSet = new Set(submittedReferenceVideos);
    const submittedImageSet = new Set(allReferenceImages.map(resolveMediaSourceUrl));
    const connectedEffectNodes = get()
      .edges.filter((edge) => edge.target === id)
      .flatMap((edge) => {
        const source = get().nodes.find((item) => item.id === edge.source);
        if (!source || (!source.data.effectPresetId && !source.data.effectPreset)) return [];
        const sourceType = source.data.kind === 'video' ? 'video' : 'image';
        const sourceUrl =
          sourceType === 'video'
            ? preferredVideoSource(source.data)
            : preferredImageSource(source.data);
        if (!sourceUrl) return [];
        const resolvedUrl = resolveMediaSourceUrl(sourceUrl);
        const submitted =
          sourceType === 'video'
            ? submittedVideoSet.has(resolvedUrl)
            : submittedImageSet.has(resolvedUrl);
        return submitted ? [{ node: source, url: resolvedUrl, type: sourceType }] : [];
      });
    const connectedEffectKeys = new Set(
      connectedEffectNodes.map((effect) => `${effect.type}:${effect.url}`),
    );
    const submittedEffectReferences = manualReferenceList.filter(
      (reference) =>
        reference.role === 'effect' &&
        (reference.type === 'image' || reference.type === 'video') &&
        reference.url &&
        (reference.type === 'video'
          ? submittedVideoSet.has(reference.url)
          : submittedImageSet.has(reference.url)) &&
        !connectedEffectKeys.has(`${reference.type}:${reference.url}`),
    );
    const preferredEffectVideo =
      connectedEffectNodes.find((effect) => effect.type === 'video')?.url ??
      submittedEffectReferences.find((reference) => reference.type === 'video')?.url;
    const effectVideoUrls = new Set([
      ...connectedEffectNodes
        .filter((effect) => effect.type === 'video')
        .map((effect) => effect.url),
      ...submittedEffectReferences
        .filter((reference) => reference.type === 'video')
        .map((reference) => reference.url),
    ]);
    const nonEffectSourceVideo = submittedReferenceVideos.find((url) => !effectVideoUrls.has(url));
    const sourceVideo = preferredEffectVideo ?? nonEffectSourceVideo;
    const effectPreviewImages = [
      ...connectedEffectNodes.flatMap(({ node: source, type }) => {
        if (type !== 'video') return [];
        const preview =
          typeof source.data.previewUrl === 'string'
            ? source.data.previewUrl.trim()
            : typeof source.data.imagePreviewPosterUrl === 'string'
              ? source.data.imagePreviewPosterUrl.trim()
              : '';
        return preview ? [resolveMediaSourceUrl(preview)] : [];
      }),
      ...submittedEffectReferences.flatMap((reference) =>
        reference.type === 'video' && reference.previewUrl
          ? [resolveMediaSourceUrl(reference.previewUrl)]
          : [],
      ),
    ].filter((url, index, values) => Boolean(url) && values.indexOf(url) === index);
    const characterReferenceImage =
      firstInputValue('character-reference') ??
      node.data.composerReferences?.find(
        (reference) =>
          reference.type === 'image' &&
          Boolean(reference.url) &&
          ((reference as { role?: string }).role === 'character' ||
            reference.id.startsWith('character-preset:')),
      )?.url;
    const maskImage = firstInputValue('mask');
    const annotationInstruction = annotationPromptForReferences(get().nodes, allReferenceImages);
    const styleInstruction = styleReferenceInstruction(manualReferenceList);
    const effectInstructionEntries = [
      ...connectedEffectNodes.map(({ node: source }) => ({
        title: String(source.data.effectPreset || source.data.title || '特效参考'),
        prompt: typeof source.data.effectPrompt === 'string' ? source.data.effectPrompt.trim() : '',
      })),
      ...submittedEffectReferences.map((reference) => ({
        title: reference.label,
        prompt: reference.effectPrompt?.trim() ?? '',
      })),
    ];
    const effectInstruction = effectInstructionEntries.length
      ? effectInstructionEntries
          .map(({ title, prompt: effectPrompt }) => {
            const instruction = effectPrompt.length > 0 ? `；效果要求：${effectPrompt}` : '';
            return `视频特效“${title}”：按照特效说明复现对应的镜头运动、转场节奏和视觉效果；参考素材只用于辅助构图和质感，不要复制其中的主体身份或场景内容${instruction}。`;
          })
          .join('\n')
      : '';
    const ownPrompt = typeof node.data.prompt === 'string' ? node.data.prompt : '';
    const textTask =
      node.data.kind === 'text'
        ? resolveTextTaskInput({
            upstreamTexts: filterExcludedTextSources(
              inputs.prompt,
              node.data.composerReferenceSubmission,
            ),
            prompt: ownPrompt,
            textInstruction: node.data.textInstruction,
            promptOverride,
            contentRole: node.data.textContentRole,
          })
        : undefined;
    const submittedPromptWithDirectorConstraints =
      requestDirectorPrompts.length > 0 && (isFlatDirectorTask || promptOverride !== undefined)
        ? [
            ...new Set(
              [
                ...requestDirectorPrompts,
                promptOverride ?? ownPrompt,
                ...(inputs.prompt ?? []).filter(
                  (value): value is string => typeof value === 'string' && value.trim().length > 0,
                ),
              ]
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ].join('\n')
        : undefined;
    const basePrompt = textTask
      ? buildTextWorkflowPrompt(textTask.sourceTexts, textTask.instruction)
      : (submittedPromptWithDirectorConstraints ?? promptOverride ?? prompt ?? ownPrompt);
    const characterInstruction =
      typeof node.data.characterPrompt === 'string' ? node.data.characterPrompt.trim() : '';
    const editablePrompt = promptOverride ?? ownPrompt;
    const markConstraints = composerMarks.flatMap((mark) => {
      if (!mark || typeof mark !== 'object' || !mark.bbox) return [];
      const left = Math.round(mark.bbox.x * 100);
      const top = Math.round(mark.bbox.y * 100);
      const width = Math.round(mark.bbox.width * 100);
      const height = Math.round(mark.bbox.height * 100);
      return [
        `参考区域“${mark.label || mark.category}”（${mark.category}）：位于参考图左侧 ${left}%、顶部 ${top}%、宽 ${width}%、高 ${height}%，生成时保持该区域主体特征。`,
      ];
    });
    const videoFrameInstruction =
      node.data.kind === 'text' && referenceVideos.length > 0
        ? '以下参考图片是按时间顺序从前置视频均匀抽取的画面，请结合画面之间的变化分析镜头运动、主体动作与叙事节奏。'
        : '';
    const videoMode =
      node.data.kind === 'video'
        ? normalizeVideoGenerationMode(composerParams.mode)
        : typeof composerParams.mode === 'string'
          ? composerParams.mode
          : undefined;
    const directorPrevisReferenceUrl =
      typeof composerParams.directorPrevisReferenceUrl === 'string'
        ? composerParams.directorPrevisReferenceUrl
        : typeof node.data.directorPrevisUrl === 'string'
          ? node.data.directorPrevisUrl
          : undefined;
    const directorAnimationFrameCount = Math.max(
      1,
      Math.min(3, Number(composerParams.directorAnimationFrameCount) || 3),
    );
    const directorSupportingReferenceCount = Math.max(
      0,
      Math.min(4, Number(composerParams.directorSupportingReferenceCount) || 0),
    );
    const videoTool =
      typeof composerParams.videoTool === 'string' ? composerParams.videoTool : undefined;
    const videoMaskRepair = isVideoMaskRepairSpec(node.data.videoMaskRepair)
      ? node.data.videoMaskRepair
      : undefined;
    const subtitleRegion =
      composerParams.subtitleRegion === 'bottom' || composerParams.subtitleRegion === 'top'
        ? composerParams.subtitleRegion
        : 'auto';
    const remakeSourceDuration = Number(composerParams.sourceVideoDuration);
    const remakeMinimumDuration =
      Number.isFinite(remakeSourceDuration) && remakeSourceDuration > 0
        ? getVideoRemakeMinimumSeconds(remakeSourceDuration)
        : 1;
    const videoRemakeSegments = Array.isArray(node.data.videoRemakeSegments)
      ? node.data.videoRemakeSegments
          .filter(
            (segment): segment is { start: number; end: number } =>
              Boolean(segment) &&
              Number.isFinite(segment.start) &&
              Number.isFinite(segment.end) &&
              segment.start >= 0 &&
              segment.end - segment.start >= remakeMinimumDuration - 1e-6,
          )
          .sort((left, right) => left.start - right.start)
          .reduce<{ start: number; end: number }[]>((accepted, segment) => {
            const overlaps = accepted.some(
              (current) => current.start < segment.end && current.end > segment.start,
            );
            if (!overlaps && accepted.length < 5) accepted.push(segment);
            return accepted;
          }, [])
      : [];
    const isVideoRemake = videoTool === 'remake';
    const finalPrompt = [
      isVideoRemake ? '' : basePrompt,
      isVideoRemake || !characterInstruction ? '' : `角色身份与外观约束：${characterInstruction}`,
      videoTool === 'remake' && videoRemakeSegments.length
        ? [
            '这是原视频片段重拍任务，只重新生成下列选中时间范围；未选中的画面、声音、时长和顺序必须保持原样，并把重拍结果无缝衔接回原视频。',
            `重拍范围：${videoRemakeSegments
              .map(
                (segment, index) =>
                  `${index + 1}. ${segment.start.toFixed(3)}s–${segment.end.toFixed(3)}s`,
              )
              .join('；')}`,
          ].join('\n')
        : '',
      isVideoRemake && basePrompt.trim() ? `用户对重拍片段的修改要求：${basePrompt.trim()}` : '',
      videoTool === 'remove-subtitles'
        ? [
            '强制任务约束：这是原视频去字幕编辑，不是重新创作视频。只移除后期烧录字幕、弹幕和字幕条；保留场景中真实存在的文字、招牌、屏幕与剧情 UI。',
            '必须逐帧修复被遮挡背景，保持原时长、帧率、人物、构图、动作、镜头、色彩、音频及同步关系；不得裁切画面，不得用模糊条、色块或重复纹理遮盖。',
          ].join('\n')
        : '',
      videoTool === 'visual-edit'
        ? '强制任务约束：这是原视频画面编辑。只修改用户明确指定的内容，其余画面、人物身份、动作、镜头、时长、帧率、色彩、音频及同步关系保持不变，修改结果必须跨帧连续且无闪烁。'
        : '',
      videoTool === 'masked-repair' && videoMaskRepair
        ? [
            '强制任务约束：这是原视频关键帧蒙版局部修复，不是重新创作视频。只能修改提供的蒙版区域，并且只能在指定问题时间范围内修改。',
            `问题范围：${videoMaskRepair.rangeStart.toFixed(3)}s–${videoMaskRepair.rangeEnd.toFixed(3)}s；蒙版关键帧：${videoMaskRepair.keyframeTime.toFixed(3)}s。由兼容后端沿视频时序跟踪并传播该关键帧蒙版。`,
            '蒙版外像素、问题范围外画面、人物身份、动作、场景、构图、镜头、时长、帧率、色彩、音频及音画同步必须保持不变；修复边缘须自然，跨帧连续，无闪烁、漂移或蒙版泄漏。',
          ].join('\n')
        : '',
      isVideoRemake ? '' : annotationInstruction,
      isVideoRemake ? '' : styleInstruction,
      isVideoRemake ? '' : effectInstruction,
      isVideoRemake ? '' : videoFrameInstruction,
      directorPrevisReferenceUrl
        ? '3D 动画预演视频是本任务的运动与机位基准：严格遵循其时间连续性、根节点路径、人物朝向、肢体节奏和参考机位构图；仅提升画面真实度与细节，不得改变动作时序。'
        : '',
      ...(isVideoRemake ? [] : markConstraints),
    ]
      .filter(Boolean)
      .join('\n');
    const isVideoKind = node.data.kind === 'video' || isDirectorNodeKind(node.data.kind);
    const isAudioKind = node.data.kind === 'audio';
    const isModel3dKind = node.data.kind === 'model-3d';
    const isTextKind = node.data.kind === 'text';
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                generating: true,
                generationRequestId,
                generationTargetMediaSignature: generationScope.targetMediaSignature,
                generatedBatchSourceId: undefined,
                generatedBatchIndex: undefined,
                progress: 0,
                // Keep system-compiled reference instructions out of the user's editable prompt.
                // `finalPrompt` is request-only so removing a reference cannot resurrect its
                // instruction on a later submission.
                ...(n.data.kind === 'text'
                  ? { textInstruction: textTask?.instruction || undefined }
                  : { prompt: editablePrompt }),
                generationError: undefined,
              },
            }
          : n,
      ),
    });
    try {
      // A reload can happen before the normal autosave debounce fires. Persist the
      // request token now so every bridge-backed generation node can query its exact result.
      if (recoverableGenerationKind(node)) {
        const requestTokenSaved = await persistCanvas(get());
        const requestTokenConfirmed =
          requestTokenSaved && bridgeGenerationRequestTokenConfirmed(generationScope);
        if (!requestTokenConfirmed && typeof window !== 'undefined') {
          throw new Error(
            '无法安全保存本次生成请求编号，已在调用模型前停止生成。请先解决画布保存冲突或存储错误后重试。',
          );
        }
        if (!hasActiveGenerationScope(get(), generationScope)) return;
      }
      const provider = await buildGenProvider(node);
      const sourceVideoOperation =
        videoMode === '视频换人物' ||
        videoTool === 'enhance' ||
        videoTool === 'remake' ||
        videoTool === 'extend' ||
        videoTool === 'remove-subtitles' ||
        videoTool === 'visual-edit' ||
        videoTool === 'masked-repair';
      const modelSupportsEffectVideo = provider?.videoReferenceInput === true;
      const useEffectImageFallback =
        Boolean(provider && preferredEffectVideo) &&
        !sourceVideoOperation &&
        !modelSupportsEffectVideo;
      const supportedVideoModes = provider?.videoModes ?? [];
      let effectiveVideoMode = videoMode;
      if (node.data.kind === 'video' && preferredEffectVideo && !sourceVideoOperation) {
        const configuredModeIsSupported =
          Boolean(effectiveVideoMode) &&
          supportedVideoModes.some((mode) => mode === effectiveVideoMode);
        if (supportedVideoModes.length && !configuredModeIsSupported) {
          const imageReferenceMode = useEffectImageFallback
            ? ['图生视频', '图片参考', '全能参考'].find((candidate) =>
                supportedVideoModes.some((mode) => mode === candidate),
              )
            : undefined;
          effectiveVideoMode = imageReferenceMode ?? supportedVideoModes[0];
        } else if (
          !supportedVideoModes.length &&
          (!effectiveVideoMode || effectiveVideoMode === '文生视频')
        ) {
          effectiveVideoMode = '全能参考';
        }
      } else if (
        node.data.kind === 'video' &&
        directorReferenceImages.length > 0 &&
        (!effectiveVideoMode || effectiveVideoMode === '文生视频')
      ) {
        effectiveVideoMode = '全能参考';
      }
      const modelAllowsEffectImage =
        !provider?.inputModalities?.length || provider.inputModalities.includes('image');
      const effectModeAllowsReferenceImages =
        effectiveVideoMode !== '文生视频' && effectiveVideoMode !== '视频换人物';
      let effectFallbackImages: string[] = [];
      if (
        useEffectImageFallback &&
        modelAllowsEffectImage &&
        effectModeAllowsReferenceImages &&
        !isVideoRemake
      ) {
        effectFallbackImages = effectPreviewImages;
        if (!effectFallbackImages.length && preferredEffectVideo) {
          try {
            effectFallbackImages = await extractVideoReferenceFrames([preferredEffectVideo], 1);
          } catch {
            // Legacy effect clips without a persisted poster keep a prompt-only fallback.
          }
        }
      }
      const videoReferenceImageCandidates = isAtomicDirectorTask
        ? [...effectFallbackImages, ...allReferenceImages]
        : [...new Set([...effectFallbackImages, ...allReferenceImages])];
      let generationReferenceImages = isVideoRemake
        ? []
        : isVideoKind
          ? effectiveVideoMode === '文生视频'
            ? []
            : effectiveVideoMode === '视频换人物'
              ? []
              : effectiveVideoMode === '图生视频'
                ? videoReferenceImageCandidates.slice(0, 1)
                : effectiveVideoMode === '首尾帧'
                  ? videoReferenceImageCandidates.slice(0, 2)
                  : videoReferenceImageCandidates
          : allReferenceImages;
      if (node.data.kind === 'video' && directorPrevisReferenceUrl && !isVideoRemake) {
        try {
          const motionFrames = await extractVideoReferenceFrames(
            [directorPrevisReferenceUrl],
            directorAnimationFrameCount,
          );
          const supportingReferences = directorSupportingReferenceCount
            ? allReferenceImages.slice(-directorSupportingReferenceCount)
            : [];
          generationReferenceImages = (
            isAtomicDirectorTask
              ? [...effectFallbackImages, ...motionFrames, ...supportingReferences]
              : [...new Set([...effectFallbackImages, ...motionFrames, ...supportingReferences])]
          ).slice(0, 5);
        } catch {
          // The persisted keyframes remain a safe fallback when the browser cannot decode WebM.
        }
      }
      const generationReferenceAudios = isVideoKind
        ? resolveSubmittedReferenceAudios(
            (inputs['audio-track'] ?? []).filter(
              (value): value is string => typeof value === 'string' && value.trim().length > 0,
            ),
            node.data.composerReferenceSubmission,
            manualReferenceList,
          )
        : [];
      const imageType =
        typeof composerParams.imageType === 'string' ? composerParams.imageType : undefined;
      const imageTypePrompt =
        typeof composerParams.imageTypePrompt === 'string'
          ? composerParams.imageTypePrompt
          : undefined;
      const connectedSourceVideo = firstInputValue('source-video');
      const requestSourceVideo = sourceVideoOperation
        ? (connectedSourceVideo ?? nonEffectSourceVideo)
        : useEffectImageFallback
          ? undefined
          : sourceVideo;
      if (!provider) {
        throw new Error(
          node.data.providerId && node.data.model
            ? '所选模型当前不可用。请检查 API 设置中的连接配置，或改选一个可用模型。'
            : '请先在节点底部选择一个可用的 AI 模型。',
        );
      }
      if (
        node.data.kind === 'video' &&
        videoTool === 'masked-repair' &&
        (provider.protocol !== 'openai' || !provider.videoOperations?.includes('masked-repair'))
      ) {
        throw new Error(
          '当前所选模型没有真实的时序蒙版修复协议，已停止生成；不会退化为普通视频重生成。',
        );
      }
      if (node.data.kind === 'video' && effectiveVideoMode === '视频换人物') {
        if (!requestSourceVideo) throw new Error('“视频换人物”需要连接一条原视频。');
        if (!characterReferenceImage) throw new Error('“视频换人物”需要连接一张目标人物图片。');
      }
      if (node.data.kind === 'video' && videoTool === 'remake') {
        if (!requestSourceVideo) throw new Error('“片段重拍”需要连接一条原视频。');
        if (!videoRemakeSegments.length) throw new Error('请先在时间轴选择至少一个重拍片段。');
      }
      if (node.data.kind === 'video' && videoTool === 'extend' && !requestSourceVideo) {
        throw new Error('“智能续写”需要连接一条原视频。');
      }
      if (
        node.data.kind === 'video' &&
        (videoTool === 'remove-subtitles' || videoTool === 'visual-edit') &&
        !requestSourceVideo
      ) {
        throw new Error(
          videoTool === 'remove-subtitles'
            ? '“智能去字幕”需要连接一条原视频。'
            : '“AI 画面编辑”需要连接一条原视频。',
        );
      }
      if (node.data.kind === 'video' && videoTool === 'masked-repair') {
        if (!requestSourceVideo) throw new Error('“关键帧蒙版修复”需要连接一条原视频。');
        if (!videoMaskRepair) {
          throw new Error('关键帧蒙版修复草稿无效，请重新选择关键帧、绘制蒙版并设置问题范围。');
        }
      }
      if (
        (generationReferenceImages.length > 0 ||
          (node.data.kind === 'text' && referenceVideos.length > 0)) &&
        provider.inputModalities?.length &&
        !provider.inputModalities.includes('image')
      ) {
        throw new Error(
          node.data.kind === 'text'
            ? '所选文本模型不支持参考图片，请改选支持视觉输入的模型。'
            : '所选模型不支持参考图片，请改选支持视觉输入的模型。',
        );
      }
      if (node.data.kind === 'text' && referenceVideos.length > 0) {
        const videoFrames = await extractVideoReferenceFrames(referenceVideos, 5);
        generationReferenceImages = [...videoFrames, ...generationReferenceImages].slice(0, 5);
      }
      const effectPosterSet = new Set(effectFallbackImages);
      const videoPosterFallbackImages =
        node.data.kind === 'video'
          ? generationReferenceImages.filter((url) => effectPosterSet.has(url))
          : [];
      if (videoPosterFallbackImages.length > 0) {
        generationReferenceImages = generationReferenceImages.filter(
          (url) => !effectPosterSet.has(url),
        );
      }
      const aiReferenceImages = await Promise.all(
        generationReferenceImages.map((url) =>
          typeof window === 'undefined'
            ? Promise.resolve(url)
            : resolveCanvasImageForAi(url, generationScope.projectId),
        ),
      );
      const aiVideoPosterFallbackImages = await Promise.all(
        videoPosterFallbackImages.map((url) =>
          typeof window === 'undefined'
            ? Promise.resolve(url)
            : resolveCanvasPosterForAi(url, generationScope.projectId),
        ),
      );
      const requestedCharacterReferenceImage =
        effectiveVideoMode === '视频换人物' ? characterReferenceImage : undefined;
      const requestedMaskImage =
        videoTool === 'masked-repair'
          ? videoMaskRepair?.maskImage
          : effectiveVideoMode === '视频换人物'
            ? maskImage
            : undefined;
      const aiCharacterReferenceImage = requestedCharacterReferenceImage
        ? typeof window === 'undefined'
          ? requestedCharacterReferenceImage
          : await resolveCanvasImageForAi(
              requestedCharacterReferenceImage,
              generationScope.projectId,
            )
        : undefined;
      const aiMaskImage = requestedMaskImage
        ? typeof window === 'undefined'
          ? requestedMaskImage
          : await resolveCanvasImageForAi(requestedMaskImage, generationScope.projectId)
        : undefined;
      const result = await generateNodeContent(
        {
          type: node.data.kind,
          prompt: finalPrompt,
          requestId: generationRequestId,
          referenceImages: aiReferenceImages,
          videoPosterFallbackImages: aiVideoPosterFallbackImages,
          sourceVideo: node.data.kind === 'video' ? requestSourceVideo : undefined,
          sourceVideoDuration:
            videoTool === 'remake' && Number.isFinite(remakeSourceDuration)
              ? remakeSourceDuration
              : undefined,
          remakeSegments: videoTool === 'remake' ? videoRemakeSegments : undefined,
          continueVideo: videoTool === 'extend',
          videoEditOperation:
            videoTool === 'remove-subtitles' ||
            videoTool === 'visual-edit' ||
            videoTool === 'masked-repair'
              ? videoTool
              : undefined,
          subtitleRegion: videoTool === 'remove-subtitles' ? subtitleRegion : undefined,
          characterReferenceImage: aiCharacterReferenceImage,
          maskImage: aiMaskImage,
          maskRangeStart: videoTool === 'masked-repair' ? videoMaskRepair?.rangeStart : undefined,
          maskRangeEnd: videoTool === 'masked-repair' ? videoMaskRepair?.rangeEnd : undefined,
          keyframeTime: videoTool === 'masked-repair' ? videoMaskRepair?.keyframeTime : undefined,
          tracking: videoTool === 'masked-repair' ? videoMaskRepair?.tracking : undefined,
          referenceAudios: generationReferenceAudios,
          referenceAudio:
            isAudioKind && typeof firstInputValue('source-audio') === 'string'
              ? String(firstInputValue('source-audio'))
              : undefined,
          count: generationParams.count,
          aspectRatio:
            isVideoKind && generationParams.videoAspectRatio !== 'Auto'
              ? (generationParams.videoAspectRatio ?? generationParams.aspectRatio)
              : isVideoKind
                ? 'auto'
                : generationParams.aspectRatio,
          resolution: generationParams.resolution,
          audio: generationParams.audio,
          quality: generationParams.quality,
          duration: generationParams.duration,
          imageType,
          imageTypePrompt,
          mode: isTextKind
            ? (videoMode ?? DEFAULT_TEXT_TASK_MODE)
            : (effectiveVideoMode ?? generationParams.mode),
          temperature: isTextKind
            ? undefined
            : typeof composerParams.temperature === 'number'
              ? composerParams.temperature
              : generationParams.temperature,
          maxLength: isTextKind
            ? undefined
            : typeof composerParams.maxLength === 'number'
              ? composerParams.maxLength
              : generationParams.maxLength,
          referenceImageDetail: annotationInstruction ? 'high' : 'auto',
          fps: generationParams.fps,
          provider,
        },
        (progress) => {
          if (!hasActiveGenerationScope(get(), generationScope)) return;
          set({
            nodes: get().nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, progress } } : n,
            ),
          });
        },
      );
      if (!hasActiveGenerationScope(get(), generationScope)) return;
      const mediaUrls = collectGeneratedMediaUrls(
        isVideoKind
          ? result.videoUrl
          : isAudioKind
            ? result.audioUrl
            : isModel3dKind
              ? result.model3dUrl
              : result.imageUrl,
        isVideoKind
          ? result.videos
          : isAudioKind
            ? result.audios
            : isModel3dKind
              ? result.models3d
              : result.images,
      );
      const primaryMediaUrl = mediaUrls[0] ?? null;
      const generatedText = node.data.kind === 'text' && Boolean(result.text?.trim());
      if (!isVideoKind && !isAudioKind && !isModel3dKind && !isTextKind && !primaryMediaUrl) {
        throw new Error('图片模型没有返回可用图片，请重试或更换模型。');
      }
      if (isModel3dKind && !primaryMediaUrl) {
        throw new Error('3D 工作流没有返回可用模型文件，请重试或重新导入工作流。');
      }
      const currentNodes = get().nodes;
      const currentSource = currentNodes.find((item) => item.id === id);
      const updatedNodes = currentNodes.map((item) =>
        item.id === id
          ? {
              ...item,
              data: {
                ...item.data,
                generating: false,
                generationRequestId: undefined,
                generationTargetMediaSignature: undefined,
                progress: 100,
                generationError: undefined,
                originalUrl:
                  !isTextKind && !isAudioKind && !isModel3dKind && primaryMediaUrl
                    ? primaryMediaUrl
                    : item.data.originalUrl,
                previewUrl:
                  !isTextKind && !isAudioKind && !isModel3dKind && primaryMediaUrl
                    ? undefined
                    : item.data.previewUrl,
                bridgeAssetId: primaryMediaUrl ? undefined : item.data.bridgeAssetId,
                mediaPersistenceState: primaryMediaUrl
                  ? undefined
                  : item.data.mediaPersistenceState,
                mediaMimeType: primaryMediaUrl ? undefined : item.data.mediaMimeType,
                result: result.text ?? '',
                outputText: result.text ?? undefined,
                output:
                  result.text ??
                  (isAudioKind && mediaUrls.length > 1 ? mediaUrls : primaryMediaUrl) ??
                  null,
                imageUrl:
                  isVideoKind || isAudioKind || isModel3dKind
                    ? undefined
                    : (primaryMediaUrl ?? item.data.imageUrl),
                images:
                  isVideoKind || isAudioKind || isModel3dKind
                    ? undefined
                    : primaryMediaUrl
                      ? [primaryMediaUrl]
                      : item.data.images,
                videoUrl: isVideoKind
                  ? (primaryMediaUrl ?? item.data.videoUrl)
                  : item.data.videoUrl,
                videos: isVideoKind && primaryMediaUrl ? [primaryMediaUrl] : item.data.videos,
                videoEditRevision:
                  isVideoKind && primaryMediaUrl
                    ? genId('video-revision')
                    : item.data.videoEditRevision,
                audioUrl: isAudioKind
                  ? (primaryMediaUrl ?? item.data.audioUrl)
                  : item.data.audioUrl,
                audios: isAudioKind && mediaUrls.length ? mediaUrls : item.data.audios,
                audioSourceState:
                  isAudioKind && primaryMediaUrl ? undefined : item.data.audioSourceState,
                model3dUrl: isModel3dKind
                  ? (primaryMediaUrl ?? item.data.model3dUrl)
                  : item.data.model3dUrl,
                models3d: isModel3dKind && mediaUrls.length ? mediaUrls : item.data.models3d,
              },
            }
          : item,
      );

      let nextNodes = updatedNodes;
      const nextEdges = get().edges;
      if (currentSource && mediaUrls.length > 1 && !isAudioKind && !isModel3dKind) {
        const siblingNodes = createGeneratedMediaSiblingNodes(
          currentSource,
          currentNodes,
          mediaUrls,
          isVideoKind ? 'video' : 'image',
          generationRequestId,
        );
        nextNodes = [...updatedNodes, ...siblingNodes];
      }

      set({ nodes: nextNodes, edges: nextEdges });
      if (mediaUrls.length)
        notifyGeneratedMedia(
          isVideoKind ? 'video' : isAudioKind ? 'audio' : isModel3dKind ? '3d' : 'image',
        );
      if (generatedText) notifyGeneratedText();
      get().propagate(id);
      await flushCanvasPersistence();
    } catch (err) {
      if (!hasActiveGenerationScope(get(), generationScope)) return;
      const msg = err instanceof Error ? err.message : '生成失败，请重试';
      const interruptedGenerationKind = recoverableGenerationKind(node);
      const preserveRecoveryRequest = Boolean(
        interruptedGenerationKind &&
        isGenerationRequestInterruption(err) &&
        err.requestId === generationRequestId &&
        err.kind === interruptedGenerationKind,
      );
      const visibleMessage = preserveRecoveryRequest
        ? `${msg} 请点击“检查生成结果”，系统不会自动重新提交。`
        : msg;
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  generating: false,
                  generationRequestId: preserveRecoveryRequest ? generationRequestId : undefined,
                  generationTargetMediaSignature: preserveRecoveryRequest
                    ? n.data.generationTargetMediaSignature
                    : undefined,
                  progress: 0,
                  generationError: visibleMessage,
                  result: visibleMessage,
                  ...(n.data.kind === 'text' ? { outputText: undefined, output: undefined } : {}),
                },
              }
            : n,
        ),
      });
      if (interruptedGenerationKind) await flushCanvasPersistence();
      throw err;
    }
  },

  runCascade: async (id) => {
    const target = get().nodes.find((node) => node.id === id);
    if (target?.data.kind === 'loop') {
      await get().generateNode(id);
      return;
    }
    const order = topoSort(get().nodes, get().edges, id);
    for (const nid of order) {
      const n = get().nodes.find((x) => x.id === nid);
      if (!n) continue;
      const meta = NODE_KIND_META[n.data.kind];
      if (!meta?.isGenerator) continue;
      await get().generateNode(nid);
    }
  },

  applyEnhancement: async (nodeId, tool, prompt) => {
    const { nodes, genParams } = get();
    const sourceNode = nodes.find((node) => node.id === nodeId);
    const sourceUrl = sourceNode?.data.imageUrl || sourceNode?.data.images?.[0];
    if (!sourceNode || !sourceUrl || sourceNode.data.generating === true) return false;

    const spec = IMAGE_ENHANCEMENT_SPECS[tool];
    const choices = availableProviderModels(loadProviderConnections(), 'image');
    const requestedProviderId =
      typeof sourceNode.data.providerId === 'string' ? sourceNode.data.providerId.trim() : '';
    const requestedModel =
      typeof sourceNode.data.model === 'string' ? sourceNode.data.model.trim() : '';
    const hasRequestedModel = Boolean(requestedProviderId || requestedModel);
    const requestedChoice =
      requestedProviderId && requestedModel
        ? choices.find(
            (choice) =>
              choice.providerId === requestedProviderId && choice.model === requestedModel,
          )
        : undefined;
    if (hasRequestedModel && !requestedChoice) {
      const message = '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。';
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, enhancementError: message } }
            : node,
        ),
      });
      return false;
    }
    const selectedModel =
      requestedChoice ?? choices.find((choice) => choice.recommended) ?? choices[0];
    if (!selectedModel) {
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '请先在 API 设置中连接并验证一个支持图片编辑的模型。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const inheritedParams = (sourceNode.data.genParams as Partial<GenParams> | undefined) ?? {};
    const aspectRatio =
      spec.aspectRatio ??
      (typeof sourceNode.data.aspectRatio === 'string'
        ? sourceNode.data.aspectRatio
        : (inheritedParams.aspectRatio ?? genParams.aspectRatio));
    const generationParams: GenParams = {
      ...genParams,
      ...inheritedParams,
      aspectRatio: aspectRatio as GenParams['aspectRatio'],
      count: 1,
    };
    const providerNode: FlowNode = {
      ...sourceNode,
      data: {
        ...sourceNode.data,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
      },
    };
    const provider = await buildGenProvider(providerNode);
    if (!provider) {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '图片模型连接已失效，请在 API 设置中重新验证。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const requestId = genId('enhance');
    const enhancementPrompt = buildImageEnhancementPrompt(tool, prompt);
    get().takeSnapshot();
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                generating: true,
                progress: 0,
                enhancementTool: tool,
                enhancementLabel: spec.label,
                enhancementRequestId: requestId,
                enhancementError: undefined,
                providerId: selectedModel.providerId,
                model: selectedModel.model,
              },
            }
          : node,
      ),
    });
    try {
      const result = await generateNodeContent(
        {
          type: 'image',
          prompt: enhancementPrompt,
          requestId: genId('gen'),
          referenceImages: [sourceUrl],
          count: 1,
          aspectRatio,
          quality: generationParams.quality,
          imageType: spec.imageType,
          provider,
        },
        (progress) =>
          set({
            nodes: get().nodes.map((node) =>
              node.id === nodeId && node.data.enhancementRequestId === requestId
                ? { ...node, data: { ...node.data, progress } }
                : node,
            ),
          }),
      );
      const mediaUrls = collectGeneratedMediaUrls(result.imageUrl, result.images);
      const primaryUrl = mediaUrls[0];
      if (!primaryUrl) throw new Error(`${spec.label}没有返回可用图片。`);

      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: primaryUrl,
                  images: [primaryUrl],
                  output: primaryUrl,
                  generating: false,
                  progress: 100,
                  result: `${spec.label}完成`,
                  aspectRatio,
                  genParams: { ...generationParams },
                  lastEnhancementPrompt: enhancementPrompt,
                  enhancementRequestId: undefined,
                  enhancementError: undefined,
                },
              }
            : node,
        ),
      });
      notifyGeneratedMedia('image');
      get().propagate(nodeId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${spec.label}失败，请重试。`;
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generating: false,
                  progress: 0,
                  enhancementRequestId: undefined,
                  enhancementError: message,
                  result: message,
                },
              }
            : node,
        ),
      });
      throw error;
    }
  },

  createLinkedEnhancementResult: async (nodeId, tool) => {
    const { nodes, edges, genParams } = get();
    const sourceNode = nodes.find((node) => node.id === nodeId);
    const sourceUrl = sourceNode?.data.imageUrl || sourceNode?.data.images?.[0];
    if (!sourceNode || !sourceUrl || sourceNode.data.generating === true) return false;

    const spec = IMAGE_ENHANCEMENT_SPECS[tool];
    if (tool === 'portrait-cutout') {
      const targetId = genId('node');
      const requestId = genId('portrait-cutout-local');
      const sourceSize = nodeRenderedSize(sourceNode);
      const sourcePosition = absoluteNodePosition(sourceNode, nodes);
      const targetNode: FlowNode = {
        id: targetId,
        type: 'image',
        position: {
          x: sourcePosition.x + sourceSize.width + 120,
          y: sourcePosition.y,
        },
        selected: true,
        data: {
          kind: 'image',
          ...KIND_DEFAULTS.image,
          title: `${sourceNode.data.title || '图片'} · 人像抠图`,
          description: '由本机人物分割生成的透明背景 PNG，不调用 AI 模型',
          prompt: '',
          generating: true,
          progress: 10,
          enhancementTool: tool,
          enhancementLabel: spec.label,
          enhancementRequestId: requestId,
          aspectRatio: sourceNode.data.aspectRatio,
          genParams: sourceNode.data.genParams,
          ...inheritedImagePreview(sourceNode, sourceUrl),
        },
      };
      const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), targetNode];
      const ports = resolveConnectionPorts(nextNodes, nodeId, null, targetId, null);
      if (
        !ports ||
        !isValidConnection(nextNodes, edges, nodeId, ports.source.id, targetId, ports.target.id)
      ) {
        set({
          nodes: nodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: { ...node.data, enhancementError: '无法创建人像抠图结果节点连接。' },
                }
              : node,
          ),
        });
        return false;
      }
      const edge: FlowEdge = {
        id: genId('edge'),
        type: 'flow',
        source: nodeId,
        target: targetId,
        sourceHandle: ports.source.id,
        targetHandle: ports.target.id,
      };

      get().takeSnapshot();
      set({
        nodes: nextNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, enhancementError: undefined } }
            : node,
        ),
        edges: [...edges, edge],
        selectedNodeId: targetId,
      });

      try {
        const cutout = await cutoutPersonLocally(sourceUrl);
        const imageUrl = cutout.imageUrl;
        set({
          nodes: get().nodes.map((node) =>
            node.id === targetId && node.data.enhancementRequestId === requestId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    imageUrl,
                    images: [imageUrl],
                    output: imageUrl,
                    generating: false,
                    progress: 100,
                    result:
                      cutout.method === 'interactive' ? '本地精确人像抠图完成' : '本地人像抠图完成',
                    cutoutMethod: cutout.method,
                    enhancementRequestId: undefined,
                    enhancementError: undefined,
                  },
                }
              : node,
          ),
        });
        notifyGeneratedMedia('image');
        get().propagate(targetId);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '本地人像抠图失败，请重试。';
        set({
          nodes: get().nodes.map((node) =>
            node.id === targetId && node.data.enhancementRequestId === requestId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    generating: false,
                    progress: 0,
                    enhancementRequestId: undefined,
                    enhancementError: message,
                    result: message,
                  },
                }
              : node,
          ),
        });
        throw error;
      }
    }

    const isPanorama = tool === 'panorama';
    const isQualityRestore = tool === 'quality-restore';
    const isSmartCutout = tool === 'cutout';
    const isTextRemoval = tool === 'remove-text';
    const choices = availableProviderModels(loadProviderConnections(), 'image');
    const requestedProviderId =
      typeof sourceNode.data.providerId === 'string' ? sourceNode.data.providerId.trim() : '';
    const requestedModel =
      typeof sourceNode.data.model === 'string' ? sourceNode.data.model.trim() : '';
    const hasRequestedModel = Boolean(requestedProviderId || requestedModel);
    const requestedChoice =
      requestedProviderId && requestedModel
        ? choices.find(
            (choice) =>
              choice.providerId === requestedProviderId && choice.model === requestedModel,
          )
        : undefined;
    if (hasRequestedModel && !requestedChoice) {
      const message = '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。';
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, enhancementError: message } }
            : node,
        ),
      });
      return false;
    }

    const selectedModel =
      requestedChoice ?? choices.find((choice) => choice.recommended) ?? choices[0];
    if (!selectedModel) {
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '请先在 API 设置中连接并验证一个支持图片编辑的模型。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const inheritedParams = (sourceNode.data.genParams as Partial<GenParams> | undefined) ?? {};
    const sourceAspectRatio =
      typeof sourceNode.data.aspectRatio === 'string' &&
      ['16:9', '9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '21:9'].includes(
        sourceNode.data.aspectRatio,
      )
        ? (sourceNode.data.aspectRatio as GenParams['aspectRatio'])
        : undefined;
    const aspectRatio = (spec.aspectRatio ??
      sourceAspectRatio ??
      inheritedParams.aspectRatio ??
      genParams.aspectRatio) as GenParams['aspectRatio'];
    const generationParams: GenParams = {
      ...genParams,
      ...inheritedParams,
      aspectRatio,
      quality:
        isPanorama || isQualityRestore ? '4K' : (inheritedParams.quality ?? genParams.quality),
      count: 1,
    };
    const providerNode: FlowNode = {
      ...sourceNode,
      data: {
        ...sourceNode.data,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
      },
    };
    const provider = await buildGenProvider(providerNode);
    if (!provider) {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '图片模型连接已失效，请在 API 设置中重新验证。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const targetId = genId('node');
    const requestId = genId(tool);
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourcePosition = absoluteNodePosition(sourceNode, nodes);
    const enhancementPrompt = buildImageEnhancementPrompt(
      tool,
      isPanorama
        ? '输出必须是以环境和空间为主体的场景图片，并作为全景场景素材使用，不得输出人物设定图或角色展示图。使用 4K 超高清细节，保持远景、材质和边缘纹理清晰，避免模糊、涂抹和低分辨率伪影。'
        : isQualityRestore
          ? '输出 4K 高清修复图片，严格保留原图画幅比例、主体身份、五官、姿态、构图、色彩和所有内容；只修复模糊、压缩噪点、锯齿、边缘和自然纹理，不得重绘或新增内容。'
          : isSmartCutout
            ? '自动判断画面中视觉上最主要的主体，只保留该主体并完整保留其轮廓、孔洞、发丝、透明材质和原始纹理；彻底移除其余背景，输出带真实透明通道的 PNG 素材。不得添加棋盘格、纯色背景、文字、水印或其他物体。'
            : isTextRemoval
              ? '智能识别画面中的所有文字、字幕、标识、签名和水印并完整移除，依据邻近区域的纹理、透视、光影、结构和噪点自然修复被遮挡区域。严格保留人物、物体、构图、色彩、画幅和画风，不得误删非文字内容，不得留下模糊块、重复纹理或修补痕迹。'
              : '只保留原图中的主要人物，完整保留人物身份、五官、发型、服装、姿态和身体比例；精细处理发丝、透明材质和衣物边缘，彻底移除背景，输出带真实透明通道的 PNG 人像素材。不得添加棋盘格、纯色背景、文字、水印或其他物体。',
    );
    const targetNode: FlowNode = {
      id: targetId,
      type: 'image',
      position: {
        x: sourcePosition.x + sourceSize.width + 120,
        y: sourcePosition.y,
      },
      selected: true,
      data: {
        kind: 'image',
        ...KIND_DEFAULTS.image,
        title: `${sourceNode.data.title || '图片'} · ${
          isPanorama
            ? '全景场景'
            : isQualityRestore
              ? '高清修复'
              : isSmartCutout
                ? '智能扣图'
                : isTextRemoval
                  ? '去文字'
                  : '人像抠图'
        }`,
        description: isPanorama
          ? '依据上级参考图生成的全景场景图片'
          : isQualityRestore
            ? '依据上级参考图生成的高清修复图片'
            : isSmartCutout
              ? '智能识别上级参考图的主要主体并生成透明背景素材'
              : isTextRemoval
                ? '智能移除上级参考图中的文字和水印并修复背景'
                : '依据上级参考图生成的透明背景人像素材',
        prompt: enhancementPrompt,
        generating: true,
        progress: 0,
        enhancementTool: tool,
        enhancementLabel: spec.label,
        enhancementRequestId: requestId,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
        aspectRatio,
        ...(isPanorama
          ? {
              composerParams: {
                imageType: '场景全景图',
                imageTypePrompt: '以环境和空间为主体的 21:9 全景场景图片',
              },
            }
          : {}),
        genParams: { ...generationParams },
        ...inheritedImagePreview(sourceNode, sourceUrl),
      },
    };
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), targetNode];
    const ports = resolveConnectionPorts(nextNodes, nodeId, null, targetId, null);
    if (
      !ports ||
      !isValidConnection(nextNodes, edges, nodeId, ports.source.id, targetId, ports.target.id)
    ) {
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, enhancementError: `无法创建${spec.label}结果节点连接。` },
              }
            : node,
        ),
      });
      return false;
    }
    const edge: FlowEdge = {
      id: genId('edge'),
      type: 'flow',
      source: nodeId,
      target: targetId,
      sourceHandle: ports.source.id,
      targetHandle: ports.target.id,
    };

    get().takeSnapshot();
    set({
      nodes: nextNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                enhancementError: undefined,
                providerId: selectedModel.providerId,
                model: selectedModel.model,
              },
            }
          : node,
      ),
      edges: [...edges, edge],
      selectedNodeId: targetId,
    });

    try {
      const result = await generateNodeContent(
        {
          type: 'image',
          prompt: enhancementPrompt,
          requestId: genId('gen'),
          referenceImages: [sourceUrl],
          count: 1,
          aspectRatio,
          quality: generationParams.quality,
          imageType: spec.imageType,
          provider,
        },
        (progress) =>
          set({
            nodes: get().nodes.map((node) =>
              node.id === targetId && node.data.enhancementRequestId === requestId
                ? { ...node, data: { ...node.data, progress } }
                : node,
            ),
          }),
      );
      const mediaUrls = collectGeneratedMediaUrls(result.imageUrl, result.images);
      const primaryUrl = mediaUrls[0];
      if (!primaryUrl) throw new Error(`${spec.label}没有返回可用图片。`);

      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: primaryUrl,
                  images: [primaryUrl],
                  output: primaryUrl,
                  generating: false,
                  progress: 100,
                  result: `${spec.label}完成`,
                  lastEnhancementPrompt: enhancementPrompt,
                  enhancementRequestId: undefined,
                  enhancementError: undefined,
                },
              }
            : node,
        ),
      });
      notifyGeneratedMedia('image');
      get().propagate(targetId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${spec.label}生成失败，请重试。`;
      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generating: false,
                  progress: 0,
                  enhancementRequestId: undefined,
                  enhancementError: message,
                  result: message,
                },
              }
            : node,
        ),
      });
      throw error;
    }
  },

  createFaceControlResult: async (nodeId, prompt) => {
    const { nodes, genParams } = get();
    const sourceNode = nodes.find((node) => node.id === nodeId);
    const sourceUrl = sourceNode?.data.imageUrl || sourceNode?.data.images?.[0];
    if (!sourceNode || !sourceUrl || sourceNode.data.generating === true) return false;

    const tool = 'face-control';
    const spec = IMAGE_ENHANCEMENT_SPECS['face-control'];
    const choices = availableProviderModels(loadProviderConnections(), 'image');
    const requestedProviderId =
      typeof sourceNode.data.providerId === 'string' ? sourceNode.data.providerId.trim() : '';
    const requestedModel =
      typeof sourceNode.data.model === 'string' ? sourceNode.data.model.trim() : '';
    const hasRequestedModel = Boolean(requestedProviderId || requestedModel);
    const requestedChoice =
      requestedProviderId && requestedModel
        ? choices.find(
            (choice) =>
              choice.providerId === requestedProviderId && choice.model === requestedModel,
          )
        : undefined;
    if (hasRequestedModel && !requestedChoice) {
      const message = '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。';
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, enhancementError: message } }
            : node,
        ),
      });
      return false;
    }

    const selectedModel =
      requestedChoice ?? choices.find((choice) => choice.recommended) ?? choices[0];
    if (!selectedModel) {
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '请先在 API 设置中连接并验证一个支持图片编辑的模型。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const inheritedParams = (sourceNode.data.genParams as Partial<GenParams> | undefined) ?? {};
    const aspectRatio =
      typeof sourceNode.data.aspectRatio === 'string'
        ? sourceNode.data.aspectRatio
        : (inheritedParams.aspectRatio ?? genParams.aspectRatio);
    const generationParams: GenParams = {
      ...genParams,
      ...inheritedParams,
      aspectRatio: aspectRatio as GenParams['aspectRatio'],
      count: 1,
    };
    const providerNode: FlowNode = {
      ...sourceNode,
      data: {
        ...sourceNode.data,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
      },
    };
    const provider = await buildGenProvider(providerNode);
    if (!provider) {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '图片模型连接已失效，请在 API 设置中重新验证。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const targetId = genId('node');
    const requestId = genId(tool);
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourcePosition = absoluteNodePosition(sourceNode, nodes);
    const enhancementPrompt = buildImageEnhancementPrompt(tool, prompt);
    const targetNode: FlowNode = {
      id: targetId,
      type: 'image',
      position: {
        x: sourcePosition.x + sourceSize.width + 120,
        y: sourcePosition.y,
      },
      selected: true,
      data: {
        kind: 'image',
        ...KIND_DEFAULTS.image,
        title: `${sourceNode.data.title || '图片'} · 面部调整`,
        description: '依据上级参考图生成的面部控制结果',
        prompt: enhancementPrompt,
        generating: true,
        progress: 0,
        enhancementTool: tool,
        enhancementLabel: spec.label,
        enhancementRequestId: requestId,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
        aspectRatio,
        genParams: { ...generationParams },
        ...inheritedImagePreview(sourceNode, sourceUrl),
      },
    };
    const edge: FlowEdge = {
      id: genId('edge'),
      type: 'flow',
      source: nodeId,
      target: targetId,
    };

    get().takeSnapshot();
    set({
      nodes: [
        ...get().nodes.map((node) => ({
          ...node,
          selected: false,
          data:
            node.id === nodeId
              ? {
                  ...node.data,
                  enhancementError: undefined,
                  providerId: selectedModel.providerId,
                  model: selectedModel.model,
                }
              : node.data,
        })),
        targetNode,
      ],
      edges: [...get().edges, edge],
      selectedNodeId: targetId,
    });

    try {
      const result = await generateNodeContent(
        {
          type: 'image',
          prompt: enhancementPrompt,
          requestId: genId('gen'),
          referenceImages: [sourceUrl],
          count: 1,
          aspectRatio,
          quality: generationParams.quality,
          provider,
        },
        (progress) =>
          set({
            nodes: get().nodes.map((node) =>
              node.id === targetId && node.data.enhancementRequestId === requestId
                ? { ...node, data: { ...node.data, progress } }
                : node,
            ),
          }),
      );
      const mediaUrls = collectGeneratedMediaUrls(result.imageUrl, result.images);
      const primaryUrl = mediaUrls[0];
      if (!primaryUrl) throw new Error(`${spec.label}没有返回可用图片。`);

      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: primaryUrl,
                  images: [primaryUrl],
                  output: primaryUrl,
                  generating: false,
                  progress: 100,
                  result: `${spec.label}完成`,
                  lastEnhancementPrompt: enhancementPrompt,
                  enhancementRequestId: undefined,
                  enhancementError: undefined,
                },
              }
            : node,
        ),
      });
      notifyGeneratedMedia('image');
      get().propagate(targetId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${spec.label}失败，请重试。`;
      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generating: false,
                  progress: 0,
                  enhancementRequestId: undefined,
                  enhancementError: message,
                  result: message,
                },
              }
            : node,
        ),
      });
      throw error;
    }
  },

  createPoseControlResult: async (nodeId, prompt, poseGuideUrl, options) => {
    const { nodes, genParams } = get();
    const sourceNode = nodes.find((node) => node.id === nodeId);
    const sourceUrl = sourceNode?.data.imageUrl || sourceNode?.data.images?.[0];
    if (!sourceNode || !sourceUrl || sourceNode.data.generating === true) return false;

    const spec = IMAGE_ENHANCEMENT_SPECS['pose-adjust'];
    const choices = availableProviderModels(loadProviderConnections(), 'image');
    const requestedProviderId =
      typeof sourceNode.data.providerId === 'string' ? sourceNode.data.providerId.trim() : '';
    const requestedModel =
      typeof sourceNode.data.model === 'string' ? sourceNode.data.model.trim() : '';
    const hasRequestedModel = Boolean(requestedProviderId || requestedModel);
    const requestedChoice =
      requestedProviderId && requestedModel
        ? choices.find(
            (choice) =>
              choice.providerId === requestedProviderId && choice.model === requestedModel,
          )
        : undefined;
    if (hasRequestedModel && !requestedChoice) {
      const message = '指令框选择的图片模型当前不可用，请重新选择模型或检查 API 连接。';
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, enhancementError: message } }
            : node,
        ),
      });
      return false;
    }

    const selectedModel =
      requestedChoice ?? choices.find((choice) => choice.recommended) ?? choices[0];
    if (!selectedModel) {
      set({
        nodes: nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  enhancementError: '请先在 API 设置中连接并验证一个支持图片编辑的模型。',
                },
              }
            : node,
        ),
      });
      return false;
    }

    const inheritedParams = (sourceNode.data.genParams as Partial<GenParams> | undefined) ?? {};
    const aspectRatio =
      typeof sourceNode.data.aspectRatio === 'string'
        ? sourceNode.data.aspectRatio
        : (inheritedParams.aspectRatio ?? genParams.aspectRatio);
    const generationParams: GenParams = {
      ...genParams,
      ...inheritedParams,
      aspectRatio: aspectRatio as GenParams['aspectRatio'],
      quality: options.quality,
      count: options.count,
    };
    const providerNode: FlowNode = {
      ...sourceNode,
      data: {
        ...sourceNode.data,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
      },
    };

    const targetId = genId('node');
    const requestId = genId('pose-control');
    const sourceSize = nodeRenderedSize(sourceNode);
    const sourcePosition = absoluteNodePosition(sourceNode, nodes);
    const enhancementPrompt = buildImageEnhancementPrompt('pose-adjust', prompt);
    const targetNode: FlowNode = {
      id: targetId,
      type: 'image',
      position: {
        x: sourcePosition.x + sourceSize.width + 120,
        y: sourcePosition.y,
      },
      selected: true,
      data: {
        kind: 'image',
        ...KIND_DEFAULTS.image,
        title: `${sourceNode.data.title || '图片'} · 姿态调整`,
        description: '依据原图身份与骨架控制图生成的姿态调整结果',
        prompt: enhancementPrompt,
        generating: true,
        progress: 0,
        enhancementTool: 'pose-adjust',
        enhancementLabel: spec.label,
        enhancementRequestId: requestId,
        providerId: selectedModel.providerId,
        model: selectedModel.model,
        aspectRatio,
        genParams: { ...generationParams },
        ...inheritedImagePreview(sourceNode, sourceUrl),
      },
    };
    const edge: FlowEdge = {
      id: genId('edge'),
      type: 'flow',
      source: nodeId,
      target: targetId,
    };

    get().takeSnapshot();
    set({
      nodes: [
        ...get().nodes.map((node) => ({
          ...node,
          selected: false,
          data:
            node.id === nodeId
              ? {
                  ...node.data,
                  enhancementError: undefined,
                  providerId: selectedModel.providerId,
                  model: selectedModel.model,
                }
              : node.data,
        })),
        targetNode,
      ],
      edges: [...get().edges, edge],
      selectedNodeId: targetId,
    });

    const provider = await buildGenProvider(providerNode);
    if (!provider) {
      const message = '图片模型连接已失效，请在 API 设置中重新验证。';
      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generating: false,
                  progress: 0,
                  enhancementRequestId: undefined,
                  enhancementError: message,
                  result: message,
                },
              }
            : node,
        ),
      });
      return false;
    }

    try {
      const result = await generateNodeContent(
        {
          type: 'image',
          prompt: enhancementPrompt,
          requestId: genId('gen'),
          referenceImages: [sourceUrl, poseGuideUrl],
          count: generationParams.count,
          aspectRatio,
          quality: generationParams.quality,
          provider,
        },
        (progress) =>
          set({
            nodes: get().nodes.map((node) =>
              node.id === targetId && node.data.enhancementRequestId === requestId
                ? { ...node, data: { ...node.data, progress } }
                : node,
            ),
          }),
      );
      const mediaUrls = collectGeneratedMediaUrls(result.imageUrl, result.images);
      const primaryUrl = mediaUrls[0];
      if (!primaryUrl) throw new Error('姿态调整没有返回可用图片。');

      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: primaryUrl,
                  images: mediaUrls,
                  output: primaryUrl,
                  generating: false,
                  progress: 100,
                  result: '姿态调整完成',
                  lastEnhancementPrompt: enhancementPrompt,
                  enhancementRequestId: undefined,
                  enhancementError: undefined,
                },
              }
            : node,
        ),
      });
      notifyGeneratedMedia('image');
      get().propagate(targetId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '姿态调整失败，请重试。';
      set({
        nodes: get().nodes.map((node) =>
          node.id === targetId && node.data.enhancementRequestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generating: false,
                  progress: 0,
                  enhancementRequestId: undefined,
                  enhancementError: message,
                  result: message,
                },
              }
            : node,
        ),
      });
      throw error;
    }
  },

  saveAsset: (nodeId, category) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const isVideo = node.data.kind === 'video' || node.data.kind === 'video-comp';
    const isAudio = node.data.kind === 'audio';
    const sourceUrl = isVideo
      ? preferredVideoSource(node.data)
      : isAudio
        ? resolvedAudioSource(node.data)
        : node.data.originalUrl || node.data.imageUrl || node.data.images?.[0];
    if (!sourceUrl) return;

    const existingAsset = get().assets.find((item) => {
      const itemUrl =
        item.kind === 'video' || item.kind === 'video-comp'
          ? item.videoUrl || item.videos?.[0]
          : item.kind === 'audio'
            ? resolvedAudioSource(item)
            : item.imageUrl || item.images?.[0];
      return itemUrl === sourceUrl;
    });
    if (existingAsset) {
      if (category && existingAsset.category !== category) {
        const assets = get().assets.map((item) =>
          item.id === existingAsset.id ? { ...item, category } : item,
        );
        set({ assets: persistGlobalAssets(get().activeProjectId, assets) });
      }
      return;
    }

    const assetId = genId('asset');
    const asset: AssetItem = {
      id: assetId,
      sourceProjectId: get().activeProjectId,
      sourceNodeId: nodeId,
      title: isVideo
        ? node.data.videoFileName || node.data.title
        : isAudio
          ? node.data.audioFileName || node.data.title
          : node.data.title,
      originalUrl: node.data.originalUrl || sourceUrl,
      previewUrl: node.data.previewUrl,
      mediaWidth: node.data.mediaWidth,
      mediaHeight: node.data.mediaHeight,
      durationSeconds: node.data.durationSeconds,
      imageUrl: node.data.imageUrl,
      images: node.data.images,
      videoUrl: node.data.videoUrl,
      videos: node.data.videos,
      videoFileName: node.data.videoFileName,
      effectVideoId: node.data.effectVideoId,
      videoStorageId: isVideo
        ? node.data.assetVideoId || (node.data.bridgeAssetId ? undefined : assetId)
        : undefined,
      bridgeAssetId: node.data.bridgeAssetId,
      audioUrl: node.data.audioUrl,
      audios: node.data.audios,
      audioSourceState: node.data.audioSourceState,
      audioFileName: node.data.audioFileName,
      mediaPersistenceState: node.data.mediaPersistenceState,
      mediaMimeType: node.data.mediaMimeType,
      kind: node.data.kind,
      category:
        category ?? inferAssetCategory(node.data.kind, node.data as Record<string, unknown>),
      createdAt: Date.now(),
    };
    const assets = [...get().assets, asset];
    set({ assets: persistGlobalAssets(get().activeProjectId, assets) });
    if (
      usesLegacyPersistenceTestAdapter() &&
      isVideo &&
      !node.data.bridgeAssetId &&
      !node.data.assetVideoId
    ) {
      void (async () => {
        try {
          const blob = node.data.effectVideoId
            ? await loadEffectVideo(node.data.effectVideoId)
            : sourceUrl
              ? await fetch(sourceUrl).then((response) => response.blob())
              : null;
          if (blob) await saveAssetVideo(assetId, blob);
        } catch {
          // The asset keeps its source URL/ID when a browser blocks Blob copying.
        }
      })();
    }
  },

  addAudioAsset: (input) => {
    const existingAsset = get().assets.find(
      (item) =>
        item.kind === 'audio' &&
        ((input.bridgeAssetId && item.bridgeAssetId === input.bridgeAssetId) ||
          resolvedAudioSource(item) === input.audioUrl),
    );
    if (existingAsset) return { assetId: existingAsset.id, added: false };

    const assetId = genId('asset');
    const asset: AssetItem = {
      id: assetId,
      sourceProjectId: get().activeProjectId,
      title: input.fileName,
      originalUrl: input.audioUrl,
      durationSeconds: input.durationSeconds,
      bridgeAssetId: input.bridgeAssetId,
      audioUrl: input.audioUrl,
      audios: [input.audioUrl],
      audioFileName: input.fileName,
      mediaMimeType: input.mimeType,
      kind: 'audio',
      category: 'audio',
      createdAt: Date.now(),
    };
    set({ assets: persistGlobalAssets(get().activeProjectId, [...get().assets, asset]) });
    return { assetId, added: true };
  },

  createSubjectFromNode: (nodeId) => {
    const { nodes, assets } = get();
    const node = nodes.find((item) => item.id === nodeId);
    const imageUrl = node?.data.imageUrl || node?.data.images?.[0];
    if (!node || !imageUrl || node.data.isSubject === true) return false;

    const existingAsset = assets.find(
      (asset) => asset.sourceNodeId === nodeId && asset.category === 'character',
    );
    const nextAssets: AssetItem[] = existingAsset
      ? assets
      : [
          ...assets,
          {
            id: genId('asset'),
            sourceProjectId: get().activeProjectId,
            sourceNodeId: nodeId,
            title: node.data.title,
            imageUrl: node.data.imageUrl ?? imageUrl,
            images: node.data.images,
            kind: node.data.kind,
            category: 'character',
            createdAt: Date.now(),
          },
        ];
    const persistedAssets = persistGlobalAssets(get().activeProjectId, nextAssets);
    set({
      assets: persistedAssets,
      nodes: nodes.map((item) =>
        item.id === nodeId
          ? {
              ...item,
              data: {
                ...item.data,
                isSubject: true,
                characterPreset: item.data.characterPreset || item.data.title,
              },
            }
          : item,
      ),
    });
    return true;
  },

  removeAsset: (assetId) => {
    const state = get();
    const removed = state.assets.find((asset) => asset.id === assetId);
    if (!removed) return;
    const referencedByComposer = state.nodes.some((node) =>
      node.data.composerReferences?.some((reference) => reference.id === `asset-${assetId}`),
    );
    const assets = state.assets.filter((asset) => asset.id !== assetId);
    set({ assets: persistGlobalAssets(state.activeProjectId, assets) });
    void (async () => {
      if (referencedByComposer) return;
      await cleanupRemovedAssetAfterCommit({
        removed,
        commitCatalog: flushCanvasPersistence,
        wasRestored: () =>
          get().assets.some(
            (asset) =>
              asset.id === removed.id ||
              (removed.bridgeAssetId && asset.bridgeAssetId === removed.bridgeAssetId) ||
              (removed.videoStorageId && asset.videoStorageId === removed.videoStorageId),
          ),
        collectReferences: () => collectMediaReferences(get()),
        deleteBrowserVideo: deleteAssetVideo,
        deleteBridgeAsset,
      });
    })();
  },

  updateAssetCategory: (assetId, category) => {
    const assets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, category } : asset,
    );
    set({ assets: persistGlobalAssets(get().activeProjectId, assets) });
  },

  addAssetToCanvas: (assetId, position) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || assetSessionMediaUnavailable(asset)) return;
    const audioPlaybackUrl = asset.kind === 'audio' ? resolvedAudioSource(asset) : undefined;
    get().takeSnapshot();
    const id = genId('node');
    const node: FlowNode = {
      id,
      type: asset.kind,
      position,
      data: {
        kind: asset.kind,
        ...KIND_DEFAULTS[asset.kind],
        originalUrl: asset.originalUrl,
        previewUrl: asset.previewUrl,
        mediaWidth: asset.mediaWidth,
        mediaHeight: asset.mediaHeight,
        durationSeconds: asset.durationSeconds,
        imageUrl: asset.imageUrl ?? asset.originalUrl,
        images: asset.images,
        videoUrl: asset.videoUrl,
        videos: asset.videos,
        videoFileName: asset.videoFileName,
        effectVideoId: asset.effectVideoId,
        assetVideoId: asset.videoStorageId,
        bridgeAssetId: asset.bridgeAssetId,
        audioUrl: asset.audioUrl,
        audios: asset.audios,
        audioSourceState: asset.audioSourceState,
        audioFileName: asset.audioFileName,
        mediaPersistenceState: asset.mediaPersistenceState,
        mediaMimeType: asset.mediaMimeType,
        output:
          asset.kind === 'audio'
            ? audioPlaybackUrl
            : (asset.videoUrl ?? asset.imageUrl ?? asset.originalUrl),
        title: asset.title,
      },
    };
    set({ nodes: [...get().nodes, node] });
  },

  toggleTag: (tag) => {
    const prev = get().activeTags;
    const next = new Set(prev);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    set({ activeTags: next });
  },

  setGenParams: (patch) => set({ genParams: { ...get().genParams, ...patch } }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setPanelOpen: (panel) => set({ panelOpen: panel }),

  setAiSkillOpen: (open) => set({ aiSkillOpen: open }),

  toggleSnapEnabled: () => {
    const snapEnabled = !get().snapEnabled;
    writeCanvasPreferences({ snapEnabled });
    useCanvasPreferences.setState({ snapEnabled });
    set({ snapEnabled });
  },

  setOpenModal: (modal, nodeId = null) => {
    set({ openModal: modal, modalNodeId: nodeId, libraryImagePickerTargetId: null });
    if (modal === 'trash' && !usesLegacyPersistenceTestAdapter()) {
      hydrateProjectTrashState(get().activeProjectId);
    }
  },
  openLibraryImagePicker: (library, nodeId) => {
    const target = get().nodes.find((node) => node.id === nodeId && node.data.kind === 'image');
    if (!target) return;
    set({
      openModal: library,
      modalNodeId: null,
      libraryImagePickerTargetId: nodeId,
    });
  },
  applyLibraryImageToNode: (selection) => {
    const targetId = get().libraryImagePickerTargetId;
    const url = selection.url.trim();
    const target = targetId
      ? get().nodes.find((node) => node.id === targetId && node.data.kind === 'image')
      : undefined;
    if (!targetId || !target || !url) return false;

    const existingReferences = Array.isArray(target.data.composerReferences)
      ? target.data.composerReferences.filter((item) => Boolean(item?.id))
      : [];
    const retainedReferences = existingReferences.filter(
      (item) =>
        item.id !== `uploaded-image:${targetId}` && item.id !== `uploaded-frame:${targetId}`,
    );
    const currentGenParams =
      target.data.genParams && typeof target.data.genParams === 'object'
        ? target.data.genParams
        : {};

    get().takeSnapshot();
    get().updateNodeData(targetId, {
      originalUrl: url,
      previewUrl: selection.previewUrl,
      bridgeAssetId: selection.bridgeAssetId,
      mediaWidth: selection.mediaWidth,
      mediaHeight: selection.mediaHeight,
      mediaPersistenceState: undefined,
      mediaMimeType: undefined,
      imageUrl: url,
      images: [url],
      imageFileName: selection.title.trim() || target.data.imageFileName || target.data.title,
      output: url,
      result: undefined,
      generationError: undefined,
      composerReferences: retainedReferences,
      ...(selection.aspectRatio
        ? {
            aspectRatio: selection.aspectRatio,
            genParams: { ...currentGenParams, aspectRatio: selection.aspectRatio },
          }
        : {}),
    });
    set({ openModal: null, modalNodeId: null, libraryImagePickerTargetId: null });
    get().propagate(targetId);
    return true;
  },
  setImageEditorMode: (mode) => set({ imageEditorMode: mode }),
  setImageEditorBrushTool: (tool) => set({ imageEditorBrushTool: tool }),
  closeModal: () => set({ openModal: null, modalNodeId: null, libraryImagePickerTargetId: null }),
  setDeleteConfirm: (state) => set({ deleteConfirm: state }),

  addTab: (workspace, name) => {
    const id = genId('tab');
    const tab: CanvasTab = { id, name: name ?? `画板 ${get().tabs.length + 1}`, workspace };
    set({ tabs: [...get().tabs, tab], activeTabId: id });
    enterWorkspace(workspace);
    return id;
  },

  removeTab: (id) => {
    const removedActiveTab = get().activeTabId === id;
    const tabs = get().tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) {
      const newTab: CanvasTab = { id: genId('tab'), name: '画板 1', workspace: 'views' };
      set({ tabs: [newTab], activeTabId: newTab.id });
      enterWorkspace('views');
      return;
    }
    const nextActive = removedActiveTab ? (tabs[0]?.id ?? get().activeTabId) : get().activeTabId;
    set({ tabs, activeTabId: nextActive });
    if (removedActiveTab && tabs[0]) {
      enterWorkspace(tabs[0].workspace);
    }
  },

  renameTab: (id, name) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, name } : t)) });
  },

  setActiveTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeTabId: id });
    get().switchTabWorkspace(tab.workspace);
  },

  switchTabWorkspace: (id) => {
    if (id === get().workspace) {
      if (!usesLegacyPersistenceTestAdapter()) bridgeWorkspaceTransitionSequence += 1;
      return;
    }
    enterWorkspace(id);
  },

  setProjectName: (name) => {
    if (!usesLegacyPersistenceTestAdapter()) return;
    const currentId = get().activeProjectId;
    locallyEditedProjectCatalogIds.add(currentId);
    const nextProjects = get().projects.map((project) =>
      project.id === currentId ? { ...project, name } : project,
    );
    set({ projectName: name, projects: nextProjects });
  },

  createProject: (name) => {
    if (!usesLegacyPersistenceTestAdapter()) {
      void import('../services/projectHub')
        .then(async ({ createProject, listProjects }) => {
          const catalog = await listProjects();
          const project = await createProject(name?.trim() || '未命名项目', {
            expectedCatalogRevision: catalog.catalogRevision,
          });
          await openBridgeCanvasProject(project.id);
        })
        .catch((error) =>
          publishBridgePersistenceFailure(get().activeProjectId, error, '项目创建'),
        );
      return;
    }
    void persistCanvas(get());
    const id = genId('project');
    locallyEditedProjectCatalogIds.add(id);
    const finalName = name?.trim() || `未命名工作区 ${get().projects.length + 1}`;
    const snapshot = createFreshProjectSnapshot('views');
    projectCanvasStates.set(id, snapshot);
    projectCanvasMeta.set(id, projectMetaFromSnapshot(snapshot));
    const resolved = resolveProjectSnapshot(snapshot);
    set({
      projects: [...get().projects, { id, name: finalName }],
      activeProjectId: id,
      projectName: finalName,
      trash: [],
      ...resolved,
      past: [],
      future: [],
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });
    void persistCanvas(get());
  },

  renameProject: (id, name) => {
    if (!usesLegacyPersistenceTestAdapter()) {
      const trimmed = name.trim();
      if (!trimmed) return;
      void import('../services/projectHub')
        .then(async ({ listProjects, renameProject }) => {
          const catalog = await listProjects();
          const source = catalog.projects.find((project) => project.id === id);
          if (!source) throw new Error('目标项目已经不在项目目录中。');
          const project = await renameProject(id, trimmed, {
            expectedRevision: source.revision,
            expectedCatalogRevision: catalog.catalogRevision,
          });
          await refreshBridgeCanvasProjectCatalog();
          const current = get();
          if (current.activeProjectId !== project.id) return;
          applyingAuthoritativeBridgeSnapshot = true;
          try {
            set({ projectName: project.name });
          } finally {
            applyingAuthoritativeBridgeSnapshot = false;
          }
        })
        .catch((error) => publishBridgePersistenceFailure(id, error, '项目重命名'));
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    locallyEditedProjectCatalogIds.add(id);
    const nextProjects = get().projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
    set({
      projects: nextProjects,
      projectName: id === get().activeProjectId ? trimmed : get().projectName,
    });
  },

  deleteProject: () => {
    if (!usesLegacyPersistenceTestAdapter()) {
      const currentId = get().activeProjectId;
      if (currentId === PRIMARY_CANVAS_PROJECT_ID) return;
      void import('../services/projectHub')
        .then(async ({ archiveProject, listProjects }) => {
          if (get().workspace !== 'home' && !(await flushCanvasPersistence())) return;
          const beforeArchive = await listProjects();
          const source = beforeArchive.projects.find((project) => project.id === currentId);
          if (!source) throw new Error('当前项目已经不在项目目录中。');
          const catalog = await archiveProject(currentId, {
            expectedRevision: source.revision,
            expectedCatalogRevision: beforeArchive.catalogRevision,
          });
          const next =
            catalog.projects.find((project) => project.id === PRIMARY_CANVAS_PROJECT_ID) ??
            catalog.projects[0];
          if (next && !(await openBridgeCanvasProject(next.id, { stayOnHome: true }))) {
            throw new Error('项目已归档，但默认项目读取失败；请刷新项目列表后重试。');
          }
        })
        .catch((error) => publishBridgePersistenceFailure(currentId, error, '项目归档'));
      return;
    }
    void persistCanvas(get());
    const current = get().projects.find((project) => project.id === get().activeProjectId);
    if (!current) return;
    const remaining = get().projects.filter((project) => project.id !== current.id);
    let nextProjects = remaining;
    let nextProject = remaining[0];
    let nextSnapshot: ProjectCanvasSnapshot;
    if (nextProject) {
      const loaded = loadProjectCanvasSnapshot(nextProject.id);
      if (loaded.status !== 'found') {
        publishPersistenceStatus({
          ...persistenceStatusFor(current.id),
          projectId: current.id,
          state: 'error',
          lastAttemptAt: Date.now(),
          message:
            loaded.status === 'error'
              ? loaded.error.message
              : '下一个项目的画布目录缺失，为避免覆盖数据，本次删除已取消。',
        });
        return;
      }
      nextSnapshot = loaded.snapshot;
    } else {
      const fresh = { id: genId('project'), name: '未命名工作区' };
      nextProjects = [fresh];
      nextProject = fresh;
      nextSnapshot = createFreshProjectSnapshot('views');
      projectCanvasStates.set(fresh.id, nextSnapshot);
      projectCanvasMeta.set(fresh.id, projectMetaFromSnapshot(nextSnapshot));
    }
    locallyDeletedProjectIds.add(current.id);
    locallyEditedProjectCatalogIds.delete(current.id);
    void isLanCollaborationSession().then((enabled) => {
      if (!enabled) return;
      return fetch(resolveBridgeUrl(`/projects/${encodeURIComponent(current.id)}`), {
        method: 'DELETE',
        credentials: 'include',
      }).catch((error) => {
        console.warn('[lan-collaboration] 主机项目归档失败，本地项目仍已关闭。', error);
      });
    });
    const deletedTrash = get().trash;
    projectCanvasStates.delete(current.id);
    projectCanvasMeta.delete(current.id);
    void removeProjectTrashStorage(current.id);
    projectCanvasStates.set(nextProject.id, nextSnapshot);
    const resolved = resolveProjectSnapshot(nextSnapshot);
    set({
      projects: nextProjects,
      activeProjectId: nextProject.id,
      projectName: nextProject.name,
      trash: loadTrash(nextProject.id),
      ...resolved,
      past: [],
      future: [],
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });
    hydrateProjectTrashState(nextProject.id);
    void persistCanvas(get());
    for (const item of deletedTrash) void cleanupTrashMedia(item, get());
  },

  switchProject: (id) => {
    if (!usesLegacyPersistenceTestAdapter()) {
      void openBridgeCanvasProject(id);
      return;
    }
    const project = get().projects.find((p) => p.id === id);
    if (!project || id === get().activeProjectId) return;
    void persistCanvas(get());
    const loaded = loadProjectCanvasSnapshot(id);
    if (loaded.status !== 'found') {
      publishPersistenceStatus({
        ...persistenceStatusFor(get().activeProjectId),
        projectId: get().activeProjectId,
        state: 'error',
        lastAttemptAt: Date.now(),
        message:
          loaded.status === 'error'
            ? loaded.error.message
            : '目标项目没有可验证的画布目录，为避免覆盖数据，已留在当前项目。',
      });
      return;
    }
    const snapshot = loaded.snapshot;
    projectCanvasStates.set(id, snapshot);
    const resolved = resolveProjectSnapshot(snapshot);
    const assets = replaceGlobalAssetSource(get().assets, id, loadAssets(id));
    set({
      activeProjectId: id,
      projectName: project.name,
      assets,
      trash: loadTrash(id),
      ...resolved,
      past: [],
      future: [],
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });
    hydrateProjectTrashState(id);
    void persistCanvas(get());
  },

  applyStylePreset: (preset) => {
    const prompt = composeLibraryPrompt(preset);
    const nodeId = get().modalNodeId;
    if (nodeId) {
      const node = get().nodes.find((item) => item.id === nodeId);
      const existingReferences = Array.isArray(node?.data.composerReferences)
        ? node.data.composerReferences.filter(
            (
              item,
            ): item is {
              id: string;
              type: 'image';
              url?: string;
              label: string;
              role?: 'style';
              stylePrompt?: string;
            } =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as { id?: unknown }).id === 'string' &&
              typeof (item as { label?: unknown }).label === 'string',
          )
        : [];
      const retainedReferences = existingReferences.filter(
        (reference) => !reference.id.startsWith('style-preset:'),
      );
      const styleReference = preset.image ?? preset.thumbnail;
      const composerReferences = styleReference
        ? [
            ...retainedReferences,
            {
              id: `style-preset:${preset.id}`,
              type: 'image' as const,
              url: styleReference,
              label: preset.title,
              role: 'style' as const,
              ...(preset.prompt?.trim() ? { stylePrompt: preset.prompt.trim() } : {}),
            },
          ]
        : retainedReferences;
      get().updateNodeData(nodeId, {
        stylePreset: preset.title,
        appliedTags: preset.tags,
        composerReferences,
      });
    } else {
      const id = get().addNode(preset.kind ?? 'image', preset.position ?? { x: 120, y: -96 });
      const styleReference = preset.image ?? preset.thumbnail;
      get().updateNodeData(id, {
        stylePreset: preset.title,
        appliedTags: preset.tags,
        prompt,
        imageUrl: styleReference,
        images: styleReference ? [styleReference] : undefined,
      });
    }
    set({ openModal: null, modalNodeId: null });
  },

  applyEffectPreset: (preset) => {
    const imageUrl = preset.imageUrl.trim();
    if (!imageUrl) return;

    const state = get();
    const targetNode = state.modalNodeId
      ? state.nodes.find((node) => node.id === state.modalNodeId && node.data.kind === 'video')
      : undefined;
    const position =
      preset.position ??
      (targetNode
        ? { x: targetNode.position.x - 380, y: targetNode.position.y }
        : { x: 120, y: -96 });
    const id = genId('node');
    const effectPrompt = preset.prompt?.trim() || preset.title;
    const effectNode: FlowNode = {
      id,
      type: 'image',
      position,
      data: {
        kind: 'image',
        ...KIND_DEFAULTS.image,
        title: `素材-特效-${preset.title}`,
        description: preset.description,
        referenceOnly: true,
        effectPresetId: preset.id,
        effectPreset: preset.title,
        effectPrompt,
        appliedTags: preset.tags,
        originalUrl: imageUrl,
        imageUrl,
        images: [imageUrl],
        previewUrl: preset.previewUrl,
        mediaWidth: preset.mediaWidth,
        mediaHeight: preset.mediaHeight,
        bridgeAssetId: preset.bridgeAssetId,
        output: imageUrl,
        canvasFrameWidth: 260,
        canvasFrameHeight: 260,
        genParams: { ...state.genParams },
        aspectRatio: state.genParams.aspectRatio,
      },
    };

    state.takeSnapshot();
    let nextNodes = [...state.nodes, effectNode];
    let nextEdges = state.edges;
    if (targetNode) {
      const connectedEffectSourceIds = new Set(
        state.edges
          .filter((edge) => edge.target === targetNode.id)
          .flatMap((edge) => {
            const source = state.nodes.find((node) => node.id === edge.source);
            return source?.data.effectPresetId || source?.data.effectPreset ? [edge.source] : [];
          }),
      );
      nextEdges = nextEdges.filter(
        (edge) => edge.target !== targetNode.id || !connectedEffectSourceIds.has(edge.source),
      );
      nextNodes = nextNodes.map((node) =>
        node.id === targetNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                composerParams: {
                  ...node.data.composerParams,
                  mode:
                    !node.data.composerParams?.mode || node.data.composerParams.mode === '文生视频'
                      ? '全能参考'
                      : node.data.composerParams.mode,
                  effectReferenceSourceId: id,
                },
              },
            }
          : node,
      );
      nextEdges = addEdge(
        {
          id: genId('edge'),
          type: 'flow',
          source: id,
          sourceHandle: 'image',
          target: targetNode.id,
          targetHandle: 'frame',
        },
        nextEdges,
      );
    }
    set({
      nodes: syncConnectedTextPrompts(nextNodes, nextEdges),
      edges: nextEdges,
      selectedNodeId: id,
      openModal: null,
      modalNodeId: null,
    });
    if (targetNode) get().propagate(id);
  },

  applyCameraPreset: (preset) => {
    const targetId = get().modalNodeId ?? get().addNode('video', { x: 120, y: -96 });
    const node = get().nodes.find((item) => item.id === targetId);
    if (!node) return;
    const currentCameraPrompts = resolveCameraPromptCues(node.data.cameraPresets, {
      id:
        typeof node.data.composerParams?.cameraPresetId === 'string'
          ? node.data.composerParams.cameraPresetId
          : node.data.cameraPreset,
      title: node.data.cameraPreset,
      prompt: node.data.cameraPrompt,
    });
    const alreadySelected = currentCameraPrompts.some((camera) => camera.id === preset.id);
    const cameraPresets = alreadySelected
      ? currentCameraPrompts.filter((camera) => camera.id !== preset.id)
      : [...currentCameraPrompts, preset];
    const latestCameraPreset = cameraPresets.at(-1);
    const prompt = mergeCameraPrompts(
      typeof node.data.prompt === 'string' ? node.data.prompt : '',
      cameraPresets,
    );
    const composerParams =
      node.data.composerParams && typeof node.data.composerParams === 'object'
        ? node.data.composerParams
        : {};
    get().updateNodeData(targetId, {
      cameraPresets,
      cameraPreset: latestCameraPreset?.title,
      cameraPrompt: latestCameraPreset?.prompt,
      appliedTags: [...new Set([...(node.data.appliedTags ?? []), ...preset.tags])],
      prompt,
      composerParams: {
        ...composerParams,
        cameraPresetId: latestCameraPreset?.id,
        camera: latestCameraPreset?.title,
        cameraPrompt: latestCameraPreset?.prompt,
      },
    });
    set({ openModal: null, modalNodeId: null });
  },

  applyCharacterPreset: (preset) => {
    const prompt = composeLibraryPrompt(preset);
    const references = buildCharacterReferenceNodes({
      title: preset.title,
      referenceImages: preset.referenceImages,
      origin: preset.position ?? { x: 120, y: -96 },
    });
    if (references.length === 0) return;
    const nodeId = get().modalNodeId;
    if (nodeId) {
      const node = get().nodes.find((item) => item.id === nodeId);
      const existingReferences = Array.isArray(node?.data.composerReferences)
        ? node.data.composerReferences.filter(
            (item): item is { id: string; type: 'image'; url?: string; label: string } =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as { id?: unknown }).id === 'string' &&
              typeof (item as { label?: unknown }).label === 'string',
          )
        : [];
      const retainedReferences = existingReferences.filter(
        (reference) => !reference.id.startsWith('character-preset:'),
      );
      get().updateNodeData(nodeId, {
        characterPreset: preset.title,
        characterPrompt: prompt,
        appliedTags: [...new Set([...(node?.data.appliedTags ?? []), ...preset.tags])],
        composerReferences: [
          ...retainedReferences,
          ...references.map((reference) => ({
            id: `character-preset:${preset.id}:${reference.kind}`,
            type: 'image' as const,
            url: reference.image,
            label: reference.title,
            role: 'character',
          })),
        ],
      });
    } else {
      get().takeSnapshot();
      const genParams = get().genParams;
      const referenceNodes: FlowNode[] = references.map((reference) => ({
        id: genId('node'),
        type: 'image',
        position: reference.position,
        data: {
          kind: 'image',
          ...KIND_DEFAULTS.image,
          title: reference.title,
          description: preset.description || `${preset.title}角色资料`,
          imageFileName: reference.title,
          characterPreset: preset.title,
          characterReferenceKind: reference.kind,
          appliedTags: preset.tags,
          prompt,
          originalUrl: reference.image,
          imageUrl: reference.image,
          images: reference.image ? [reference.image] : undefined,
          output: reference.image,
          composerReferences: [],
          referenceOnly: true,
          aspectRatio: `${reference.width}:${reference.height}`,
          canvasFrameWidth: reference.width,
          canvasFrameHeight: reference.height,
          genParams: {
            ...genParams,
            aspectRatio: reference.generationAspectRatio,
          },
        },
      }));
      set({ nodes: [...get().nodes, ...referenceNodes] });
    }
    set({ openModal: null, modalNodeId: null });
  },

  applyPromptPreset: (preset) => {
    const nodeId = get().modalNodeId;
    if (nodeId) {
      const targetNode = get().nodes.find((node) => node.id === nodeId);
      get().updateNodeData(nodeId, {
        prompt: preset.prompt,
        appliedTags: preset.tags,
        promptModuleCount: preset.moduleCount ?? 0,
        result:
          targetNode?.data.providerId && targetNode.data.model
            ? '提示词已应用。请在指令框确认后点击生成。'
            : '提示词已应用。请选择一个可用模型后再提交。',
      });
    } else {
      const kind: NodeKind =
        preset.target === 'video' ? 'video' : preset.target === 'script' ? 'script' : 'image';
      const id = get().addNode(kind, preset.position ?? { x: 120, y: -96 });
      const modelKind: ProviderModelKind =
        kind === 'video' ? 'video' : kind === 'script' ? 'chat' : 'image';
      const choices = availableProviderModels(loadProviderConnections(), modelKind);
      const favoriteModel = matchModelFavorite(choices, readModelFavorite(modelKind));
      const providerIds = new Set(choices.map((choice) => choice.providerId));
      const recommended = choices.filter((choice) => choice.recommended);
      const automaticModel =
        favoriteModel ??
        (choices.length === 1
          ? choices[0]
          : providerIds.size === 1 && recommended.length === 1
            ? recommended[0]
            : undefined);
      get().updateNodeData(id, {
        prompt: preset.prompt,
        title: preset.title,
        appliedTags: preset.tags,
        promptModuleCount: preset.moduleCount ?? 0,
        ...(kind === 'image' ? { mediaInputMode: 'generation-only' as const } : {}),
        result: automaticModel
          ? '提示词已添加到画布。请在指令框确认后点击生成。'
          : '提示词已添加到画布。请选择可用模型，确认后点击生成。',
        ...(automaticModel
          ? {
              providerId: automaticModel.providerId,
              model: automaticModel.model,
              composerParams: {
                providerId: automaticModel.providerId,
                model: automaticModel.model,
              },
            }
          : {}),
      });
      set({
        nodes: get().nodes.map((node) => ({ ...node, selected: node.id === id })),
        selectedNodeId: id,
      });
    }
    set({ openModal: null, modalNodeId: null });
  },
}));

/**
 * Return the nodes belonging to the canvas that the current project would resume.
 * Home deliberately clears `state.nodes`, so resource libraries must read the
 * cached active-tab workspace instead of treating Home as an empty canvas.
 */
export function selectCanvasImagePickerNodes(state: CanvasState): FlowNode[] {
  if (state.workspace !== 'home') return state.nodes;

  const projectSnapshot = projectCanvasStates.get(state.activeProjectId);
  const activeTabWorkspace = state.tabs.find((tab) => tab.id === state.activeTabId)?.workspace;
  const fallbackWorkspace =
    projectSnapshot?.workspace && projectSnapshot.workspace !== 'home'
      ? projectSnapshot.workspace
      : undefined;
  const workspace = activeTabWorkspace ?? fallbackWorkspace;
  if (!workspace || workspace === 'home') return [];

  return (
    projectSnapshot?.workspaces[workspace]?.nodes ?? workspaceStates.get(workspace)?.nodes ?? []
  );
}

const activeCanvasMediaHydrations = new Map<string, Promise<void>>();

/**
 * Resolve serialized IndexedDB media IDs to original Blob URLs for the active
 * renderer. Exact-value replacement preserves node/reference identities and
 * director ordering. Missing originals fail loudly; previews are never used as
 * a recovery substitute.
 */
async function hydrateActiveCanvasMedia(): Promise<void> {
  while (true) {
    const captured = useCanvasStore.getState();
    if (captured.workspace === 'home') return;
    const stableUrls = collectCanvasMediaStrings(captured.nodes, isCanvasMediaFallbackUrl);
    if (stableUrls.length === 0) return;
    const scopeKey = `${captured.activeProjectId}\u0000${captured.workspace}`;
    let pending = activeCanvasMediaHydrations.get(scopeKey);
    if (!pending) {
      const projectId = captured.activeProjectId;
      const workspace = captured.workspace;
      pending = (async () => {
        const replacements = new Map(
          await Promise.all(
            stableUrls.map(async (stableUrl) => {
              try {
                return [stableUrl, await resolveCanvasMediaRuntimeUrl(stableUrl)] as const;
              } catch (error) {
                // A missing lightweight preview may safely disappear: image
                // renderers fall back to the separately verified original.
                // Missing originals remain fatal and never fall back the
                // other direction.
                if (parseCanvasMediaFallbackReferenceUrl(stableUrl)?.role === 'preview') {
                  return [stableUrl, ''] as const;
                }
                throw error;
              }
            }),
          ),
        );
        const current = useCanvasStore.getState();
        if (current.activeProjectId !== projectId || current.workspace !== workspace) return;
        const nodes = replaceExactCanvasMediaUrls(current.nodes, replacements);
        workspaceStates.set(workspace, { nodes, edges: current.edges });
        const projectSnapshot = projectCanvasStates.get(projectId);
        if (projectSnapshot) {
          projectCanvasStates.set(projectId, {
            ...projectSnapshot,
            workspaces: {
              ...projectSnapshot.workspaces,
              [workspace]: { nodes, edges: current.edges },
            },
          });
        }
        useCanvasStore.setState({ nodes });
      })().finally(() => activeCanvasMediaHydrations.delete(scopeKey));
      activeCanvasMediaHydrations.set(scopeKey, pending);
    }
    await pending;
    // Media may have been added while the current batch was loading. Re-check
    // until the active workspace contains no serialized fallback URLs.
  }
}

function reportCanvasMediaHydrationError(error: unknown) {
  const state = useCanvasStore.getState();
  publishPersistenceStatus({
    ...persistenceStatusFor(state.activeProjectId),
    projectId: state.activeProjectId,
    state: 'error',
    lastAttemptAt: Date.now(),
    message:
      error instanceof Error && error.message.trim()
        ? error.message
        : '无法恢复浏览器素材库中的画布原图；系统不会使用缩略图替代。',
  });
}

function validBridgeWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as WorkspaceSnapshot).nodes) &&
    Array.isArray((value as WorkspaceSnapshot).edges),
  );
}

function manifestWorkspace(value: unknown): WorkspaceId | undefined {
  return typeof value === 'string' && value !== 'home' && value in WORKSPACES
    ? (value as WorkspaceId)
    : undefined;
}

function applyBridgeManifest(projectId: string, manifest: BridgeProjectManifest | undefined) {
  if (!manifest) return;
  if (
    typeof manifest.revision === 'number' &&
    Number.isSafeInteger(manifest.revision) &&
    bridgeRevisionIsStale(projectId, manifest.revision)
  ) {
    return;
  }
  const state = useCanvasStore.getState();
  if (state.activeProjectId !== projectId) return;
  const projectName =
    (typeof manifest.projectName === 'string' && manifest.projectName.trim()) ||
    (typeof manifest.name === 'string' && manifest.name.trim()) ||
    (typeof manifest.title === 'string' && manifest.title.trim()) ||
    state.projectName;
  const tabs = Array.isArray(manifest.tabs)
    ? manifest.tabs.filter(
        (tab): tab is CanvasTab =>
          Boolean(tab) &&
          typeof tab === 'object' &&
          typeof (tab as CanvasTab).id === 'string' &&
          typeof (tab as CanvasTab).name === 'string' &&
          manifestWorkspace((tab as CanvasTab).workspace) !== undefined,
      )
    : state.tabs;
  const activeTabId =
    typeof manifest.activeTabId === 'string' && tabs.some((tab) => tab.id === manifest.activeTabId)
      ? manifest.activeTabId
      : (tabs[0]?.id ?? state.activeTabId);
  const incomingAssets = Array.isArray(manifest.assets)
    ? (manifest.assets as AssetItem[]).map((asset) =>
        normalizeAssetSource(
          reconcileSharedAsset(
            asset,
            state.assets.find((currentAsset) => currentAsset.id === asset.id),
          ),
          projectId,
        ),
      )
    : undefined;
  if (incomingAssets) projectAssetStates.set(projectId, incomingAssets);
  applyingAuthoritativeBridgeSnapshot = true;
  try {
    useCanvasStore.setState({
      projectName,
      projects: state.projects.some((project) => project.id === projectId)
        ? state.projects.map((project) =>
            project.id === projectId ? { ...project, name: projectName } : project,
          )
        : [...state.projects, { id: projectId, name: projectName }],
      tabs: tabs.length ? tabs : state.tabs,
      activeTabId,
      genParams:
        manifest.genParams && typeof manifest.genParams === 'object'
          ? { ...state.genParams, ...(manifest.genParams as Partial<GenParams>) }
          : state.genParams,
      activeTags: Array.isArray(manifest.activeTags)
        ? new Set(manifest.activeTags.filter((tag): tag is string => typeof tag === 'string'))
        : state.activeTags,
      assets: incomingAssets
        ? replaceGlobalAssetSource(state.assets, projectId, incomingAssets)
        : state.assets,
    });
  } finally {
    applyingAuthoritativeBridgeSnapshot = false;
  }
}

async function loadBridgeWorkspaceIntoActiveProject(
  projectId: string,
  workspace: PersistedBridgeWorkspaceId,
  publishSavedStatus = true,
) {
  const started = useCanvasStore.getState();
  const startedNodes = started.workspace === workspace ? started.nodes : undefined;
  const startedEdges = started.workspace === workspace ? started.edges : undefined;
  try {
    let loaded = await readBridgeWorkspace<WorkspaceSnapshot>(projectId, workspace);
    if (loaded && bridgeRevisionIsStale(projectId, loaded.revision)) {
      loaded = await readBridgeWorkspace<WorkspaceSnapshot>(projectId, workspace);
    }
    if (loaded && bridgeRevisionIsStale(projectId, loaded.revision)) return false;
    const state = useCanvasStore.getState();
    if (state.activeProjectId !== projectId) return false;
    if (
      state.workspace === workspace &&
      (state.nodes !== startedNodes || state.edges !== startedEdges)
    ) {
      throw new BridgeCanvasConflictError(
        loaded?.revision ?? observedProjectRevisions.get(projectId)?.revision ?? 0,
        'Bridge 读取期间当前工作台已被编辑。',
        'local-read-race',
      );
    }
    if (!loaded) {
      if (!usesLegacyPersistenceTestAdapter()) {
        return persistCanvas(state, true, publishSavedStatus);
      }
      const legacy = workspaceStates.get(workspace);
      if (legacy && (legacy.nodes.length > 0 || legacy.edges.length > 0)) {
        // A project missing on the host is migrated only after the Bridge has
        // verified the write. Until then the legacy canvas remains session-only.
        await persistCanvas(state);
      }
      return false;
    }
    if (!validBridgeWorkspaceSnapshot(loaded.workspace)) {
      throw new Error('本机 Bridge 返回了无效的工作台数据。');
    }
    const legacyMeta = savedCanvas?.projectMeta[projectId];
    if (
      legacyMeta?.workspaceIds.includes(workspace) &&
      startedNodes &&
      startedEdges &&
      !equivalentLegacyBridgeValue(
        {
          nodes: startedNodes.map(sharedNode),
          edges: startedEdges.map((edge) => ({ ...edge, selected: false })),
        },
        loaded.workspace,
      )
    ) {
      throw new BridgeCanvasConflictError(
        loaded.revision,
        '旧浏览器工作台与主机版本不同。',
        'legacy-mismatch',
      );
    }
    observeBridgeRevision(projectId, loaded.revision);
    applyBridgeManifest(projectId, loaded.manifest);
    const nodes = syncMaterializedGraphInputs(
      syncConnectedTextPrompts(
        sanitizeNodes(loaded.workspace.nodes, { recoverInterruptedMediaGeneration: true }),
        loaded.workspace.edges,
      ),
      loaded.workspace.edges,
    );
    const snapshot = { nodes, edges: loaded.workspace.edges };
    workspaceStates.set(workspace, snapshot);
    bridgeLoadedWorkspaces.add(bridgeWorkspaceCacheKey(projectId, workspace));
    const currentProject = projectCanvasStates.get(projectId);
    const currentState = useCanvasStore.getState();
    projectCanvasStates.set(projectId, {
      workspace: currentState.workspace,
      workspaces: { ...currentProject?.workspaces, [workspace]: snapshot },
      tabs: currentState.tabs,
      activeTabId: currentState.activeTabId,
    });
    if (currentState.workspace === workspace) {
      applyingAuthoritativeBridgeSnapshot = true;
      try {
        useCanvasStore.setState({ nodes, edges: loaded.workspace.edges, past: [], future: [] });
      } finally {
        applyingAuthoritativeBridgeSnapshot = false;
      }
    }
    if (publishSavedStatus) {
      publishPersistenceStatus({
        projectId,
        state: 'saved',
        lastSavedAt: Date.now(),
        revision: loaded.revision,
        writerId: 'bridge',
      });
    }
    return true;
  } catch (error) {
    publishBridgePersistenceFailure(projectId, error);
    return false;
  }
}

function blockInitialBridgeHydrationForLocalEdit(projectId: string, revision = 0) {
  initialBridgeHydrationState = 'blocked';
  if (persistenceStatusFor(projectId).state === 'conflict') return;
  publishBridgePersistenceFailure(
    projectId,
    new BridgeCanvasConflictError(
      revision,
      'Bridge 初次读取期间当前画布已经被编辑，已保留当前会话并停止自动覆盖。',
      'local-read-race',
    ),
    '画布读取',
  );
}

interface ObsoleteBrowserCanvasState {
  entries: LegacyStorageCasEntry[];
  projectIds: Set<string>;
}

function collectObsoleteCanvasProjectIds(raw: string, projectIds: Set<string>) {
  try {
    const parsed = parseCanvasPersistence<Record<string, unknown>>(raw);
    const activeProjectId = parsed.activeProjectId;
    if (typeof activeProjectId === 'string' && activeProjectId) projectIds.add(activeProjectId);
    const projects = parsed.projects;
    if (Array.isArray(projects)) {
      for (const project of projects) {
        if (!project || typeof project !== 'object') continue;
        const id = (project as { id?: unknown }).id;
        if (typeof id === 'string' && id) projectIds.add(id);
      }
    }
    for (const field of ['projectStates', 'projectMeta'] as const) {
      const value = parsed[field];
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      Object.keys(value).forEach((id) => projectIds.add(id));
    }
  } catch {
    // The obsolete root itself can still be removed. Malformed node data is
    // intentionally not used as a seed for the new single-canvas product.
  }
}

function captureObsoleteBrowserCanvasState(
  storage: Storage = localStorage,
): ObsoleteBrowserCanvasState | undefined {
  try {
    const entries = new Map<string, string>();
    const projectIds = new Set<string>();
    const capture = (key: string) => {
      const raw = storage.getItem(key);
      if (raw !== null) entries.set(key, raw);
      return raw;
    };
    // The active Bridge project is a terminal-local navigation preference,
    // not an obsolete canvas snapshot. It must survive the one-time cleanup
    // so every browser/LAN terminal can reopen its own last project.
    const currentProjectId = storage.getItem(CURRENT_PROJECT_ID_KEY)?.trim();
    if (currentProjectId) projectIds.add(currentProjectId);
    for (const key of [CANVAS_KEY, LEGACY_CANVAS_KEY]) {
      const raw = capture(key);
      if (raw) collectObsoleteCanvasProjectIds(raw, projectIds);
    }

    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => typeof key === 'string',
    );
    for (const key of keys) {
      if (key.startsWith(CANVAS_WORKSPACE_STORAGE_KEY_PREFIX)) {
        capture(key);
        const encodedProjectId = key
          .slice(CANVAS_WORKSPACE_STORAGE_KEY_PREFIX.length)
          .split(':')[0];
        if (encodedProjectId) {
          try {
            projectIds.add(decodeURIComponent(encodedProjectId));
          } catch {
            // Invalid legacy key remains covered by the exact-key cleanup.
          }
        }
      } else if (key.startsWith(`${TRASH_KEY}:`)) {
        capture(key);
        const projectId = key.slice(TRASH_KEY.length + 1);
        if (projectId) projectIds.add(projectId);
      } else if (key.startsWith(`${ASSET_KEY}:`)) {
        // Asset catalogs remain until their media has been promoted and
        // verified. Their suffix still identifies an obsolete trash record.
        const projectId = key.slice(ASSET_KEY.length + 1);
        if (projectId) projectIds.add(projectId);
      }
    }
    return {
      entries: [...entries].map(([key, raw]) => ({ key, raw })),
      projectIds,
    };
  } catch {
    return undefined;
  }
}

function sameObsoleteBrowserCanvasState(
  left: ObsoleteBrowserCanvasState,
  right: ObsoleteBrowserCanvasState,
) {
  if (
    left.entries.length !== right.entries.length ||
    left.projectIds.size !== right.projectIds.size
  ) {
    return false;
  }
  const rightEntries = new Map(right.entries.map((entry) => [entry.key, entry.raw]));
  return (
    left.entries.every((entry) => rightEntries.get(entry.key) === entry.raw) &&
    [...left.projectIds].every((projectId) => right.projectIds.has(projectId))
  );
}

function rollbackObsoleteBrowserCanvasEntries(entries: readonly LegacyStorageCasEntry[]) {
  let restored = true;
  for (const entry of [...entries].reverse()) {
    try {
      // Never overwrite a value recreated by another tab while rollback runs.
      if (localStorage.getItem(entry.key) === null && entry.raw !== null) {
        localStorage.setItem(entry.key, entry.raw);
      }
    } catch {
      restored = false;
    }
  }
  return restored;
}

/**
 * The user explicitly chose a fresh single canvas, so old browser node/edge
 * snapshots are not migration sources. They are removed only after the fixed
 * main-canvas workspace has been written/read through the Bridge. Exact-value
 * checks keep a concurrently changed legacy copy recoverable. Asset catalogs
 * and media stores are deliberately outside this cleanup boundary.
 */
async function cleanupObsoleteBrowserCanvasState() {
  if (typeof window === 'undefined') return false;
  const capturedBeforeLock = captureObsoleteBrowserCanvasState();
  if (!capturedBeforeLock) return false;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  // localStorage has no atomic compare-and-delete. Without the same exclusive
  // lock used by the legacy canvas writer, cleanup must leave every copy alone.
  if (!locks) return false;
  // Deliberately do not delete legacy IndexedDB trash here. IndexedDB has no
  // cross-tab CAS for these old records, so a still-open legacy tab could write
  // a newer value between verification and deletion. The redundant record may
  // remain until an explicit, user-approved storage cleanup can run safely.
  try {
    return await locks.request(CANVAS_PERSISTENCE_LOCK, { mode: 'exclusive' }, () => {
      if (initialBridgeHydrationMutationEpoch !== 0) return false;
      const capturedInLock = captureObsoleteBrowserCanvasState();
      if (!capturedInLock || !sameObsoleteBrowserCanvasState(capturedBeforeLock, capturedInLock)) {
        return false;
      }

      const removed: LegacyStorageCasEntry[] = [];
      try {
        for (const entry of capturedInLock.entries) {
          if (localStorage.getItem(entry.key) !== entry.raw) {
            throw new LegacyStorageChangedError(entry.key);
          }
          removed.push(entry);
          localStorage.removeItem(entry.key);
          if (localStorage.getItem(entry.key) !== null) {
            throw new LegacyStorageChangedError(entry.key);
          }
        }
        return true;
      } catch {
        rollbackObsoleteBrowserCanvasEntries(removed);
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function hydrateCurrentProjectFromBridge() {
  let projectId = PRIMARY_CANVAS_PROJECT_ID;
  let catalogRevision = 0;
  try {
    const catalog = await readBridgeProjectCatalog();
    let primaryProjectId = catalog.primaryProjectId;
    let primary = catalog.projects.find((project) => project.id === primaryProjectId);
    if (!primaryProjectId || !primary) {
      const claimed = await claimBridgePrimaryProject(
        PRIMARY_CANVAS_PROJECT_ID,
        PRIMARY_CANVAS_NAME,
      );
      primaryProjectId = claimed.primaryProjectId;
      primary =
        claimed.project ??
        ({
          id: primaryProjectId,
          name: PRIMARY_CANVAS_NAME,
        } satisfies (typeof catalog.projects)[number]);
    }
    const catalogProjects = catalog.projects.some((project) => project.id === primary.id)
      ? catalog.projects
      : [...catalog.projects, primary];
    const rememberedProjectId = readRememberedProjectId();
    const selected =
      catalogProjects.find((project) => project.id === rememberedProjectId) ?? primary;
    projectId = selected.id;
    catalogRevision = Number.isSafeInteger(selected.revision) ? (selected.revision as number) : 0;
    const workspace = selected.activeWorkspace ?? 'views';
    const startupWorkspace: WorkspaceId =
      initialPreferences.startupTarget === 'home' ? 'home' : workspace;
    if (initialBridgeHydrationMutationEpoch !== 0) {
      throw new BridgeCanvasConflictError(
        catalogRevision,
        'Bridge 初次读取前当前画布已经被编辑。',
        'local-read-race',
      );
    }
    const current = useCanvasStore.getState();
    const seed = workspace === 'views' ? { nodes: [], edges: [] } : loadWorkspace(workspace);
    if (current.activeProjectId !== projectId || current.workspace !== startupWorkspace) {
      replaceWorkspaceStates({ [workspace]: seed });
    }
    bridgeProjectCatalog.clear();
    for (const project of catalogProjects) bridgeProjectCatalog.set(project.id, project);
    applyingAuthoritativeBridgeSnapshot = true;
    try {
      useCanvasStore.setState({
        activeProjectId: projectId,
        projectName: selected.name || PRIMARY_CANVAS_NAME,
        projects: catalogProjects.map((project) => ({ id: project.id, name: project.name })),
        workspace: startupWorkspace,
        ...(current.activeProjectId !== projectId || current.workspace !== startupWorkspace
          ? {
              nodes: startupWorkspace === 'home' ? [] : seed.nodes,
              edges: startupWorkspace === 'home' ? [] : seed.edges,
              tabs: [{ id: initialTabId, name: WORKSPACES[workspace].title, workspace }],
              activeTabId: initialTabId,
              assets: [],
              trash: [],
              activeTags: new Set<string>(),
              past: [],
              future: [],
            }
          : {}),
      });
    } finally {
      applyingAuthoritativeBridgeSnapshot = false;
    }
    const authorityReady = await loadBridgeWorkspaceIntoActiveProject(projectId, workspace, false);
    if (initialBridgeHydrationMutationEpoch !== 0) {
      blockInitialBridgeHydrationForLocalEdit(
        projectId,
        observedProjectRevisions.get(projectId)?.revision ?? catalogRevision,
      );
      return;
    }
    if (authorityReady) {
      rememberProjectId(projectId);
      await cleanupObsoleteBrowserCanvasState();
    }
    if (initialBridgeHydrationMutationEpoch !== 0) {
      blockInitialBridgeHydrationForLocalEdit(
        projectId,
        observedProjectRevisions.get(projectId)?.revision ?? catalogRevision,
      );
      return;
    }
    initialBridgeHydrationState = 'ready';
    if (authorityReady) {
      publishPersistenceStatus({
        projectId,
        state: 'saved',
        lastSavedAt: Date.now(),
        revision: observedProjectRevisions.get(projectId)?.revision ?? catalogRevision,
        writerId: 'bridge',
      });
    }
  } catch (error) {
    if (initialBridgeHydrationMutationEpoch !== 0) {
      blockInitialBridgeHydrationForLocalEdit(projectId, catalogRevision);
    } else {
      initialBridgeHydrationState = 'ready';
      publishBridgePersistenceFailure(projectId, error, '画布读取');
    }
  }
}

let bridgeProjectSelectionSequence = 0;
let bridgeWorkflowProjectCreationActive = false;

function validBridgeProjectWorkspace(
  value: SharedProjectWorkspace | null,
  projectId: string,
): value is SharedProjectWorkspace {
  return Boolean(
    value &&
    value.version === 2 &&
    value.projectId === projectId &&
    value.workspaces &&
    typeof value.workspaces === 'object' &&
    !Array.isArray(value.workspaces) &&
    typeof value.projectName === 'string' &&
    Array.isArray(value.tabs) &&
    Array.isArray(value.assets) &&
    Array.isArray(value.trash) &&
    value.genParams &&
    typeof value.genParams === 'object' &&
    Array.isArray(value.activeTags),
  );
}

function bridgeProjectWorkspaceSnapshots(shared: SharedProjectWorkspace) {
  const snapshots: Partial<Record<WorkspaceId, WorkspaceSnapshot>> = {};
  for (const [workspace, value] of Object.entries(shared.workspaces)) {
    if (
      workspace === 'home' ||
      !(workspace in WORKSPACES) ||
      !validBridgeWorkspaceSnapshot(value)
    ) {
      continue;
    }
    const edges = value.edges;
    const nodes = syncMaterializedGraphInputs(
      syncConnectedTextPrompts(
        sanitizeNodes(value.nodes, { recoverInterruptedMediaGeneration: true }),
        edges,
      ),
      edges,
    );
    snapshots[workspace as WorkspaceId] = { nodes, edges };
  }
  return snapshots;
}

const persistedMediaNodeDataKeys = [
  'originalUrl',
  'previewUrl',
  'imageUrl',
  'videoUrl',
  'audioUrl',
  'bridgeAssetId',
  'output',
  'result',
  'images',
  'videos',
  'audios',
] as const;

function workspaceHasPersistedMedia(snapshot: WorkspaceSnapshot | undefined) {
  return Boolean(
    snapshot?.nodes.some((node) => {
      const data = node.data as Record<string, unknown>;
      return persistedMediaNodeDataKeys.some((key) => {
        const value = data[key];
        return typeof value === 'string'
          ? value.trim().length > 0
          : Array.isArray(value) && value.length > 0;
      });
    }),
  );
}

function workspaceContainsProjectCover(
  snapshot: WorkspaceSnapshot | undefined,
  project: BridgeProjectCatalogItem,
) {
  const coverReferences = [project.autoCoverUrl, project.autoCoverAssetId].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  if (!snapshot || coverReferences.length === 0) return false;
  return snapshot.nodes.some((node) => {
    const serialized = JSON.stringify(node.data);
    return coverReferences.some((reference) => serialized.includes(reference));
  });
}

function preferredBridgeProjectWorkspace(
  project: BridgeProjectCatalogItem,
  shared: SharedProjectWorkspace,
  manifest?: BridgeProjectManifest,
): PersistedBridgeWorkspaceId {
  const candidates = [
    project.activeWorkspace,
    manifestWorkspace(manifest?.currentWorkspace),
    manifestWorkspace(manifest?.activeWorkspace),
    manifestWorkspace(manifest?.workspace),
    manifestWorkspace(shared.currentWorkspace),
    manifestWorkspace(shared.activeWorkspace),
    manifestWorkspace(shared.workspace),
    'views' as const,
  ];
  const existingWorkspaces = Object.keys(shared.workspaces).filter(
    (workspace): workspace is PersistedBridgeWorkspaceId =>
      workspace !== 'home' && workspace in WORKSPACES,
  );
  const preferred = candidates.find((workspace): workspace is PersistedBridgeWorkspaceId =>
    Boolean(workspace && shared.workspaces[workspace]),
  );
  if (preferred && workspaceHasPersistedMedia(shared.workspaces[preferred])) return preferred;

  const coveredWorkspace = existingWorkspaces.find((workspace) =>
    workspaceContainsProjectCover(shared.workspaces[workspace], project),
  );
  if (coveredWorkspace) return coveredWorkspace;

  return (
    existingWorkspaces.find((workspace) =>
      workspaceHasPersistedMedia(shared.workspaces[workspace]),
    ) ??
    preferred ??
    existingWorkspaces[0] ??
    'views'
  );
}

function applySelectedBridgeProject(
  project: BridgeProjectCatalogItem,
  catalog: readonly BridgeProjectCatalogItem[],
  shared: SharedProjectWorkspace,
  manifest: BridgeProjectManifest | undefined,
  revision: number,
  initialViewportZoom: number | null = null,
) {
  const workspaces = bridgeProjectWorkspaceSnapshots(shared);
  const workspace = preferredBridgeProjectWorkspace(project, shared, manifest);
  const activeSnapshot = workspaces[workspace] ?? { nodes: [], edges: [] };
  if (!workspaces[workspace]) workspaces[workspace] = activeSnapshot;
  replaceWorkspaceStates(workspaces);

  const tabs = shared.tabs.filter(
    (tab): tab is CanvasTab =>
      Boolean(tab) &&
      typeof tab.id === 'string' &&
      typeof tab.name === 'string' &&
      manifestWorkspace(tab.workspace) !== undefined,
  );
  const fallbackTab: CanvasTab = {
    id: `tab-${project.id}-${workspace}`,
    name: WORKSPACES[workspace].title,
    workspace,
  };
  const resolvedTabs = tabs.length ? tabs : [fallbackTab];
  const requestedActiveTabId =
    (typeof shared.activeTabId === 'string' && shared.activeTabId) || manifest?.activeTabId;
  const activeTabId = resolvedTabs.some((tab) => tab.id === requestedActiveTabId)
    ? (requestedActiveTabId as string)
    : (resolvedTabs.find((tab) => tab.workspace === workspace)?.id ??
      resolvedTabs[0]?.id ??
      fallbackTab.id);
  const projectName = shared.projectName.trim() || project.name.trim() || '未命名项目';
  const current = useCanvasStore.getState();
  const currentAssetsById = new Map(current.assets.map((asset) => [asset.id, asset]));
  const incomingAssets = shared.assets.map((asset) => ({
    ...reconcileSharedAsset(asset, currentAssetsById.get(asset.id)),
    sourceProjectId: project.id,
  }));
  const assets = replaceGlobalAssetSource(current.assets, project.id, incomingAssets);
  const currentTrashById = new Map(current.trash.map((item) => [item.id, item]));
  const trash = shared.trash.map((item) =>
    reconcileSharedTrashItem(item, currentTrashById.get(item.id)),
  );
  const snapshot: ProjectCanvasSnapshot = {
    workspace,
    workspaces,
    tabs: resolvedTabs,
    activeTabId,
  };
  projectCanvasStates.set(project.id, snapshot);
  projectCanvasMeta.set(project.id, projectMetaFromSnapshot(snapshot));
  projectAssetStates.set(project.id, incomingAssets);
  trashCache.set(project.id, trash);
  bridgeLoadedTrashProjects.add(project.id);
  for (const loadedWorkspace of Object.keys(workspaces)) {
    bridgeLoadedWorkspaces.add(bridgeWorkspaceCacheKey(project.id, loadedWorkspace as WorkspaceId));
  }
  observeBridgeRevision(project.id, revision);
  bridgeProjectCatalog.clear();
  for (const item of catalog) bridgeProjectCatalog.set(item.id, item);

  applyingAuthoritativeBridgeSnapshot = true;
  try {
    useCanvasStore.setState({
      activeProjectId: project.id,
      initialViewportZoom,
      projectName,
      projects: catalog.map((item) => ({ id: item.id, name: item.name })),
      workspace,
      nodes: activeSnapshot.nodes,
      edges: activeSnapshot.edges,
      tabs: resolvedTabs,
      activeTabId,
      assets,
      trash,
      genParams: { ...DEFAULT_GEN_PARAMS, ...shared.genParams },
      activeTags: new Set(shared.activeTags),
      past: [],
      future: [],
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });
  } finally {
    applyingAuthoritativeBridgeSnapshot = false;
  }
  rememberProjectId(project.id);
  initialBridgeHydrationState = 'ready';
  publishPersistenceStatus({
    projectId: project.id,
    state: 'saved',
    lastSavedAt: Date.now(),
    lastAttemptAt: Date.now(),
    revision,
    writerId: 'bridge',
  });
}

/** Refresh the Bridge-authoritative project directory without changing the
 * active canvas. A missing active entry is never adopted automatically. */
export async function refreshBridgeCanvasProjectCatalog() {
  if (usesLegacyPersistenceTestAdapter()) return [] as BridgeProjectCatalogItem[];
  const catalog = await readBridgeProjectCatalog();
  const current = useCanvasStore.getState();
  const active = catalog.projects.find((project) => project.id === current.activeProjectId);
  bridgeProjectCatalog.clear();
  for (const project of catalog.projects) bridgeProjectCatalog.set(project.id, project);
  if (active) applySharedProjectCatalog(catalog.projects);
  return catalog.projects;
}

/** Open a project as one guarded Bridge transaction. The source canvas is
 * flushed first; a late read or any edit made while loading cancels the switch
 * instead of mixing two projects. */
export async function openBridgeCanvasProject(
  projectId: string,
  options: { stayOnHome?: boolean; initialZoom?: number } = {},
): Promise<boolean> {
  if (usesLegacyPersistenceTestAdapter() || !/^[A-Za-z0-9_-]{2,80}$/.test(projectId)) {
    return false;
  }
  const transition = ++bridgeProjectSelectionSequence;
  const isLatest = () => transition === bridgeProjectSelectionSequence;
  const started = useCanvasStore.getState();
  if (started.activeProjectId === projectId && started.workspace !== 'home') return true;
  if (started.workspace !== 'home') {
    workspaceStates.set(started.workspace, { nodes: started.nodes, edges: started.edges });
    if (!(await flushCanvasPersistence()) || !isLatest()) return false;
  }
  const source = useCanvasStore.getState();
  if (source.activeProjectId !== started.activeProjectId) return false;
  try {
    let catalogResult: Awaited<ReturnType<typeof readBridgeProjectCatalog>> | undefined;
    let loaded: Awaited<ReturnType<typeof readBridgeProject<SharedProjectWorkspace>>> = null;
    let project: BridgeProjectCatalogItem | undefined;
    // Project metadata is committed before its catalog entry. Read in that
    // order and require both authorities to describe the same revision; a
    // concurrent rename/create may otherwise pair old metadata with new
    // content. A bounded retry handles the short commit window.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      loaded = await readBridgeProject<SharedProjectWorkspace>(projectId);
      catalogResult = await readBridgeProjectCatalog();
      project = catalogResult.projects.find((item) => item.id === projectId);
      if (
        loaded &&
        project &&
        Number.isSafeInteger(project.revision) &&
        project.revision === loaded.revision
      ) {
        break;
      }
      loaded = null;
      project = undefined;
    }
    if (!isLatest()) return false;
    const current = useCanvasStore.getState();
    if (
      current.activeProjectId !== source.activeProjectId ||
      !sameBridgePersistenceSource(source, current)
    ) {
      return false;
    }
    if (
      !catalogResult ||
      !project ||
      !loaded ||
      !validBridgeProjectWorkspace(loaded.workspace, projectId)
    ) {
      throw new Error('目标项目不存在或项目数据无效，已留在当前项目。');
    }
    applySelectedBridgeProject(
      project,
      catalogResult.projects,
      { ...loaded.workspace, revision: loaded.revision },
      loaded.manifest,
      loaded.revision,
      options.initialZoom ?? null,
    );
    if (options.stayOnHome) {
      useCanvasStore.setState({
        workspace: 'home',
        nodes: [],
        edges: [],
        past: [],
        future: [],
        selectedNodeId: null,
        panelOpen: null,
      });
    }
    return true;
  } catch (error) {
    if (isLatest()) {
      publishBridgePersistenceFailure(started.activeProjectId, error, '项目切换');
    }
    return false;
  }
}

/**
 * Start a Home workflow as a brand-new Bridge project.
 *
 * Project creation, guarded opening, workflow seeding and the first durable
 * save are intentionally kept in one operation. Home cards must never switch
 * an existing project to another workspace because that makes the new work
 * appear under the previous project's name and can overwrite its canvas.
 */
export async function createBridgeWorkflowProject(
  workspace: Exclude<WorkspaceId, 'home'>,
  name = WORKSPACES[workspace].title,
  options: {
    requestId?: string;
    onProjectCreationAttempt?: () => void;
    onProjectCreated?: (projectId: string, projectName: string) => void;
  } = {},
): Promise<boolean> {
  if (usesLegacyPersistenceTestAdapter() || bridgeWorkflowProjectCreationActive) return false;
  bridgeWorkflowProjectCreationActive = true;
  const projectName = name.trim() || WORKSPACES[workspace].title;
  const loadingSequence = ++bridgeWorkspaceLoadingSequence;
  useCanvasStore.setState({ workspaceTransition: workspace });
  let createdProjectId: string | undefined;
  try {
    const { createProject: createProjectRecord, listProjects } =
      await import('../services/projectHub');
    const catalog = await listProjects();
    options.onProjectCreationAttempt?.();
    const project = await createProjectRecord(projectName, {
      expectedCatalogRevision: catalog.catalogRevision,
      requestId: options.requestId ?? genId('workflow'),
    });
    createdProjectId = project.id;
    options.onProjectCreated?.(project.id, project.name);
    if (!(await openBridgeCanvasProject(project.id, { stayOnHome: true }))) {
      throw new Error('新项目已经创建，但未能安全打开，请从“所有项目”中重新进入。');
    }

    const current = useCanvasStore.getState();
    if (current.activeProjectId !== project.id || current.workspace !== 'home') {
      throw new Error('新项目切换状态不一致，已停止初始化工作台。');
    }

    const seed = loadWorkspace(workspace);
    const tabId = `tab-${project.id}-${workspace}`;
    const tabs: CanvasTab[] = [{ id: tabId, name: WORKSPACES[workspace].title, workspace }];
    workspaceStates.set(workspace, seed);
    useCanvasStore.setState({
      workspace,
      nodes: seed.nodes,
      edges: seed.edges,
      tabs,
      activeTabId: tabId,
      past: [],
      future: [],
      selectedNodeId: null,
      referencePickerTargetId: null,
      markPickerTargetId: null,
      groupRenameTargetId: null,
      panelOpen: null,
      openModal: null,
      modalNodeId: null,
      deleteConfirm: null,
    });

    if (!(await flushCanvasPersistence())) {
      throw new Error('新项目已打开，但初始工作台尚未确认保存，请先不要关闭页面。');
    }
    return true;
  } catch (error) {
    publishBridgePersistenceFailure(
      createdProjectId ?? useCanvasStore.getState().activeProjectId,
      error,
      '新建工作流项目',
    );
    return false;
  } finally {
    bridgeWorkflowProjectCreationActive = false;
    if (loadingSequence === bridgeWorkspaceLoadingSequence) {
      useCanvasStore.setState({ workspaceTransition: null });
    }
  }
}

function hasPendingCanvasAssetMigration() {
  if (typeof window === 'undefined') return false;
  try {
    if (
      localStorage.getItem(ASSET_PROJECT_MIGRATION_KEY) !== '1' &&
      (localStorage.getItem(ASSET_KEY) !== null || localStorage.getItem(LEGACY_ASSET_KEY) !== null)
    ) {
      return true;
    }
    const state = useCanvasStore.getState();
    if (embeddedCanvasImageStats(state.assets).occurrenceCount > 0) return true;
    return [...discoverAssetSourceProjectIds(state.projects, state.activeProjectId)].some(
      (projectId) => {
        const raw = localStorage.getItem(projectAssetKey(projectId));
        if (!raw) return false;
        try {
          return embeddedCanvasImageStats(JSON.parse(raw)).occurrenceCount > 0;
        } catch {
          return true;
        }
      },
    );
  } catch {
    return true;
  }
}

const initialProjectHasEmbeddedImages =
  embeddedCanvasImageStats(projectCanvasStates.get(initialActiveProjectId) ?? restoredNodes)
    .occurrenceCount > 0;
const initialCanvasAssetsNeedMigration =
  usesLegacyPersistenceTestAdapter() && hasPendingCanvasAssetMigration();

const cancelCanvasStoreStartupTasks: Array<() => void> = [];

cancelCanvasStoreStartupTasks.push(
  scheduleAfterFirstPaint(() => {
    void hydrateActiveCanvasMedia().catch(reportCanvasMediaHydrationError);
  }, 250),
);

if (!usesLegacyPersistenceTestAdapter()) {
  cancelCanvasStoreStartupTasks.push(
    scheduleAfterFirstPaint(() => {
      void hydrateCurrentProjectFromBridge();
    }, 100),
  );
}

if (
  usesLegacyPersistenceTestAdapter() &&
  (savedCanvas?.needsWorkspaceMigration ||
    initialProjectHasEmbeddedImages ||
    initialCanvasAssetsNeedMigration)
) {
  cancelCanvasStoreStartupTasks.push(
    scheduleAfterFirstPaint(
      () => {
        void persistCanvas(useCanvasStore.getState());
      },
      initialProjectHasEmbeddedImages || initialCanvasAssetsNeedMigration ? 750 : 5_000,
    ),
  );
}

function hydrateProjectTrashState(projectId: string) {
  void hydrateTrash(projectId).then((trash) => {
    const state = useCanvasStore.getState();
    if (state.activeProjectId === projectId) useCanvasStore.setState({ trash });
  });
}

if (usesLegacyPersistenceTestAdapter()) hydrateProjectTrashState(initialActiveProjectId);

// ---- Workspace switching with per-workspace persistence ----
// Save the current workspace's edits into the in-memory map (and onto disk via
// persistCanvas) before leaving, then load the target workspace's own saved
// edits — or its seed on first visit. This is what keeps content intact when
// hopping between canvases and the home page.
let bridgeWorkspaceTransitionSequence = 0;
let bridgeWorkspaceLoadingSequence = 0;

async function enterBridgeWorkspace(next: WorkspaceId) {
  const transition = ++bridgeWorkspaceTransitionSequence;
  const isLatestTransition = () => transition === bridgeWorkspaceTransitionSequence;
  const before = useCanvasStore.getState();
  if (next === before.workspace) return;
  if (before.workspace !== 'home') {
    workspaceStates.set(before.workspace, { nodes: before.nodes, edges: before.edges });
    if (!(await flushCanvasPersistence()) || !isLatestTransition()) return;
  }
  let current = useCanvasStore.getState();
  if (!isLatestTransition() || current.activeProjectId !== before.activeProjectId) return;
  if (next === 'home') {
    useCanvasStore.setState({
      workspace: 'home',
      nodes: [],
      edges: [],
      past: [],
      future: [],
      selectedNodeId: null,
      panelOpen: null,
    });
    return;
  }

  // Home intentionally renders no canvas, so its cached project can become
  // stale while the project directory is open. In particular, archiving the
  // active project and then failing to load its fallback must never let the
  // "continue" action reopen the archived in-memory canvas. Confirm that the
  // project still exists in the Bridge-authoritative catalog before reusing
  // any workspace cache.
  if (before.workspace === 'home') {
    try {
      const catalog = await readBridgeProjectCatalog();
      if (!isLatestTransition()) return;
      current = useCanvasStore.getState();
      if (current.workspace !== 'home' || current.activeProjectId !== before.activeProjectId) {
        return;
      }
      const activeProject = catalog.projects.find(
        (project) => project.id === current.activeProjectId,
      );
      if (!activeProject) {
        throw new Error('当前项目已归档，请从项目中心打开另一个项目。');
      }
      bridgeProjectCatalog.clear();
      for (const project of catalog.projects) bridgeProjectCatalog.set(project.id, project);
      applySharedProjectCatalog(catalog.projects);
    } catch (error) {
      if (isLatestTransition()) {
        publishBridgePersistenceFailure(before.activeProjectId, error, '进入画布');
      }
      return;
    }
  }

  const cacheKey = bridgeWorkspaceCacheKey(current.activeProjectId, next);
  let snapshot = workspaceStates.get(next);
  if (!bridgeLoadedWorkspaces.has(cacheKey)) {
    const sourceWorkspace = current.workspace;
    const sourceNodes = current.nodes;
    const sourceEdges = current.edges;
    try {
      let loaded = await readBridgeWorkspace<WorkspaceSnapshot>(
        current.activeProjectId,
        next as PersistedBridgeWorkspaceId,
      );
      if (!isLatestTransition()) return;
      const latest = useCanvasStore.getState();
      if (latest.activeProjectId !== current.activeProjectId) return;
      if (
        latest.workspace === sourceWorkspace &&
        (latest.nodes !== sourceNodes || latest.edges !== sourceEdges)
      ) {
        workspaceStates.set(sourceWorkspace, { nodes: latest.nodes, edges: latest.edges });
        await flushCanvasPersistence();
        if (!isLatestTransition()) return;
      }
      if (loaded && bridgeRevisionIsStale(current.activeProjectId, loaded.revision)) {
        loaded = await readBridgeWorkspace<WorkspaceSnapshot>(
          current.activeProjectId,
          next as PersistedBridgeWorkspaceId,
        );
      }
      if (loaded && bridgeRevisionIsStale(current.activeProjectId, loaded.revision)) return;
      if (loaded) {
        if (!validBridgeWorkspaceSnapshot(loaded.workspace)) {
          throw new Error('本机 Bridge 返回了无效的工作台数据。');
        }
        observeBridgeRevision(current.activeProjectId, loaded.revision);
        applyBridgeManifest(current.activeProjectId, loaded.manifest);
        snapshot = {
          nodes: sanitizeNodes(loaded.workspace.nodes, {
            recoverInterruptedMediaGeneration: true,
          }),
          edges: loaded.workspace.edges,
        };
        workspaceStates.set(next, snapshot);
        bridgeLoadedWorkspaces.add(cacheKey);
      } else {
        snapshot ??= loadWorkspace(next);
        workspaceStates.set(next, snapshot);
      }
    } catch (error) {
      if (!isLatestTransition()) return;
      publishBridgePersistenceFailure(current.activeProjectId, error, `工作台 ${next}`);
      if (!snapshot) return;
    }
  }
  if (!isLatestTransition()) return;
  snapshot ??= loadWorkspace(next);
  const nodes = syncMaterializedGraphInputs(
    syncConnectedTextPrompts(
      sanitizeNodes(snapshot.nodes, { recoverInterruptedMediaGeneration: true }),
      snapshot.edges,
    ),
    snapshot.edges,
  );
  useCanvasStore.setState({
    workspace: next,
    nodes,
    edges: snapshot.edges,
    past: [],
    future: [],
    selectedNodeId: null,
    panelOpen: null,
  });
}

function enterWorkspace(next: WorkspaceId) {
  if (!usesLegacyPersistenceTestAdapter()) {
    const loadingSequence = ++bridgeWorkspaceLoadingSequence;
    useCanvasStore.setState({ workspaceTransition: next });
    void enterBridgeWorkspace(next).finally(() => {
      if (loadingSequence !== bridgeWorkspaceLoadingSequence) return;
      useCanvasStore.setState({ workspaceTransition: null });
    });
    return;
  }
  const cur = useCanvasStore.getState();
  if (next === cur.workspace) return;

  if (cur.workspace !== 'home') {
    workspaceStates.set(cur.workspace, { nodes: cur.nodes, edges: cur.edges });
  }

  let nodes: FlowNode[];
  let edges: FlowEdge[];
  if (next === 'home') {
    nodes = [];
    edges = [];
  } else {
    const saved = workspaceStates.get(next);
    if (saved) {
      nodes = saved.nodes;
      edges = saved.edges;
    } else {
      const meta = projectCanvasMeta.get(cur.activeProjectId);
      const persisted = readPersistedWorkspaceSnapshot(cur.activeProjectId, next);
      if (
        persisted.status === 'error' ||
        (meta?.workspaceIds.includes(next) && persisted.status === 'missing')
      ) {
        publishPersistenceStatus({
          ...persistenceStatusFor(cur.activeProjectId),
          projectId: cur.activeProjectId,
          state: 'error',
          lastAttemptAt: Date.now(),
          message:
            persisted.status === 'error'
              ? persisted.error.message
              : `工作台 ${next} 的已保存快照缺失。为避免覆盖数据，已留在当前画布。`,
        });
        return;
      }
      const nextSnapshot = persisted.status === 'found' ? persisted.snapshot : loadWorkspace(next);
      workspaceStates.set(next, nextSnapshot);
      nodes = nextSnapshot.nodes;
      edges = nextSnapshot.edges;
    }
  }

  const connectedNodes = syncConnectedTextPrompts(
    sanitizeNodes(nodes, { recoverInterruptedMediaGeneration: true }),
    edges,
  );
  useCanvasStore.setState({
    workspace: next,
    nodes: syncMaterializedGraphInputs(connectedNodes, edges),
    edges,
    past: [],
    future: [],
    selectedNodeId: null,
    panelOpen: null,
  });
  void persistCanvas(useCanvasStore.getState());
}

// ---- Auto-save: persist every mutation (debounced) so a refresh restores
// the last operated state. Transient UI (modals, selection, history, clipboard)
// is intentionally excluded to keep the payload small and stable. ----
//
// Performance: during high-frequency updates (node drag, position changes) the
// store fires many times per second. We skip serialization while a drag is
// active and flush once after it settles, avoiding main-thread blocking from
// JSON.stringify on potentially large base64 image data.
const canvasAutosave = new CanvasIdleAutosave(
  () => useCanvasPreferences.getState().autosaveDelay,
  () => {
    if (!canvasStoreRuntimeDisposed && !initialBridgeHydrationBlocksPersistence()) {
      void persistCanvas(useCanvasStore.getState(), false, true, true);
    }
  },
);

function changedPersistedNodeData(previous: FlowNode['data'], current: FlowNode['data']) {
  if (previous === current) return false;
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const key of keys) {
    if (TRANSIENT_NODE_DATA_KEYS.has(key)) continue;
    if (previous[key] !== current[key]) return true;
  }
  return false;
}

function changedPersistedNodes(previous: FlowNode[], current: FlowNode[]) {
  if (previous === current) return false;
  if (previous.length !== current.length) return true;
  for (let index = 0; index < current.length; index += 1) {
    const before = previous[index];
    const after = current[index];
    if (!before || !after || before.id !== after.id || before.type !== after.type) return true;
    if (
      before.position.x !== after.position.x ||
      before.position.y !== after.position.y ||
      before.parentId !== after.parentId ||
      before.width !== after.width ||
      before.height !== after.height ||
      changedPersistedNodeData(before.data, after.data)
    ) {
      return true;
    }
  }
  return false;
}

function changedPersistedEdges(previous: FlowEdge[], current: FlowEdge[]) {
  if (previous === current) return false;
  if (previous.length !== current.length) return true;
  return current.some((edge, index) => {
    const before = previous[index];
    return (
      !before ||
      before.id !== edge.id ||
      before.source !== edge.source ||
      before.target !== edge.target ||
      before.sourceHandle !== edge.sourceHandle ||
      before.targetHandle !== edge.targetHandle ||
      before.type !== edge.type ||
      before.data !== edge.data
    );
  });
}

function hasPersistedCanvasChange(previous: CanvasState, current: CanvasState) {
  return (
    changedPersistedNodes(previous.nodes, current.nodes) ||
    changedPersistedEdges(previous.edges, current.edges) ||
    previous.workspace !== current.workspace ||
    previous.activeProjectId !== current.activeProjectId ||
    previous.projectName !== current.projectName ||
    previous.projects !== current.projects ||
    previous.tabs !== current.tabs ||
    previous.activeTabId !== current.activeTabId ||
    previous.genParams !== current.genParams ||
    previous.activeTags !== current.activeTags
  );
}

function sharedNode(node: FlowNode): FlowNode {
  const data = Object.fromEntries(
    Object.entries(node.data).filter(([key]) => !SHARED_TRANSIENT_NODE_DATA_KEYS.has(key)),
  ) as FlowNode['data'];
  return {
    ...node,
    selected: false,
    dragging: false,
    measured: undefined,
    data,
  };
}

/** Project-authoritative Bridge snapshots retain the opaque request lease for reload recovery. */
function persistedNode(node: FlowNode): FlowNode {
  const data = Object.fromEntries(
    Object.entries(node.data).filter(([key]) => !TRANSIENT_NODE_DATA_KEYS.has(key)),
  ) as FlowNode['data'];
  return {
    ...node,
    selected: false,
    dragging: false,
    measured: undefined,
    data,
  };
}

function persistedWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    nodes: snapshot.nodes.map(persistedNode),
    edges: snapshot.edges.map((edge) => ({ ...edge, selected: false })),
  };
}

/** Build the project-scoped LAN payload. UI preferences and API credentials are excluded. */
export function captureSharedProjectWorkspace(): SharedProjectWorkspace {
  const state = useCanvasStore.getState();
  if (state.workspace !== 'home') {
    workspaceStates.set(state.workspace, { nodes: state.nodes, edges: state.edges });
  }
  // LAN observation follows the same on-demand boundary as Bridge hydration:
  // it compares only workspaces already present in memory and never pulls old
  // browser splits back in as a second persistence authority.
  const loadedProjectWorkspaces = projectCanvasStates.get(state.activeProjectId)?.workspaces ?? {};
  const allWorkspaces = {
    ...loadedProjectWorkspaces,
    ...collectWorkspaceStates(),
  };
  const workspaces = Object.fromEntries(
    Object.entries(allWorkspaces).map(([workspace, snapshot]) => [
      workspace,
      snapshot
        ? {
            nodes: snapshot.nodes.map(sharedNode),
            edges: snapshot.edges.map((edge) => ({ ...edge, selected: false })),
          }
        : snapshot,
    ]),
  ) as Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  return {
    version: 2,
    projectId: state.activeProjectId,
    projectName: state.projectName,
    workspaces,
    tabs: state.tabs.map((tab) => ({ ...tab })),
    assets: state.assets
      .filter(
        (asset) => assetSourceProjectId(asset, state.activeProjectId) === state.activeProjectId,
      )
      .map((asset) => ({ ...asset, sourceProjectId: state.activeProjectId })),
    trash: state.trash.map((item) => ({
      ...item,
      nodes: item.nodes.map(sharedNode),
      edges: item.edges.map((edge) => ({ ...edge, selected: false })),
    })),
    genParams: { ...state.genParams },
    activeTags: [...state.activeTags],
  };
}

interface ApplySharedProjectWorkspaceOptions {
  /** The snapshot came from the project-authoritative Bridge, not an imported/shared file. */
  recoverInterruptedGeneration?: boolean;
}

/** Apply a newer host snapshot without importing terminal-local UI preferences. */
export function applySharedProjectWorkspace(
  shared: SharedProjectWorkspace,
  options: ApplySharedProjectWorkspaceOptions = {},
): boolean {
  const state = useCanvasStore.getState();
  if (
    shared.version !== 2 ||
    shared.projectId !== state.activeProjectId ||
    !shared.workspaces ||
    !Array.isArray(shared.tabs) ||
    !Array.isArray(shared.assets) ||
    !Array.isArray(shared.trash)
  ) {
    return false;
  }
  if (
    Number.isSafeInteger(shared.revision) &&
    bridgeRevisionIsStale(state.activeProjectId, Number(shared.revision))
  ) {
    return false;
  }
  if (Number.isSafeInteger(shared.revision) && Number(shared.revision) >= 0) {
    observeBridgeRevision(state.activeProjectId, Number(shared.revision));
  }
  const workspaces = Object.fromEntries(
    Object.entries(shared.workspaces).flatMap(([workspace, snapshot]) => {
      if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return [];
      const currentNodes =
        workspace === state.workspace
          ? state.nodes
          : (workspaceStates.get(workspace as WorkspaceId)?.nodes ?? []);
      const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]));
      const reconciledNodes = snapshot.nodes.map((node) =>
        reconcileSharedSessionNode(node, currentNodesById.get(node.id)),
      );
      const nodes = sanitizeNodes(reconciledNodes, {
        recoverInterruptedMediaGeneration: options.recoverInterruptedGeneration,
      }).map((node) => restoreLocalGenerationLease(node, currentNodesById.get(node.id)));
      const connectedNodes = syncConnectedTextPrompts(nodes, snapshot.edges);
      return [
        [
          workspace,
          {
            nodes: syncMaterializedGraphInputs(connectedNodes, snapshot.edges),
            edges: snapshot.edges,
          },
        ],
      ];
    }),
  ) as Partial<Record<WorkspaceId, WorkspaceSnapshot>>;
  replaceWorkspaceStates(workspaces);
  const activeSnapshot = state.workspace === 'home' ? undefined : workspaces[state.workspace];
  const currentNodesById = new Map(state.nodes.map((node) => [node.id, node]));
  const nodes = activeSnapshot
    ? reuseSnapshotReferences(
        state.nodes,
        activeSnapshot.nodes.map((node) => {
          const current = currentNodesById.get(node.id);
          if (!current) return node;
          return reuseSnapshotReferences(current, {
            ...node,
            selected: current.selected,
            dragging: current.dragging,
            measured: current.measured,
          });
        }),
      )
    : state.nodes;
  const projectName = shared.projectName.trim() || state.projectName;
  const projects = state.projects.some((project) => project.id === state.activeProjectId)
    ? state.projects.map((project) =>
        project.id === state.activeProjectId ? { ...project, name: projectName } : project,
      )
    : [...state.projects, { id: state.activeProjectId, name: projectName }];
  const activeTabId = shared.tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : (shared.tabs[0]?.id ?? state.activeTabId);
  const snapshot: ProjectCanvasSnapshot = {
    workspace: state.workspace === 'home' ? 'views' : state.workspace,
    workspaces,
    tabs: shared.tabs,
    activeTabId,
  };
  const currentAssetsById = new Map(state.assets.map((asset) => [asset.id, asset]));
  const incomingAssets = shared.assets.map((asset) => ({
    ...reconcileSharedAsset(asset, currentAssetsById.get(asset.id)),
    sourceProjectId: state.activeProjectId,
  }));
  const mergedAssets = replaceGlobalAssetSource(
    state.assets,
    state.activeProjectId,
    incomingAssets,
  );
  const assets = usesLegacyPersistenceTestAdapter()
    ? persistGlobalAssets(state.activeProjectId, mergedAssets)
    : mergedAssets;
  if (!usesLegacyPersistenceTestAdapter()) {
    projectAssetStates.set(state.activeProjectId, incomingAssets);
  }
  const currentTrashById = new Map(state.trash.map((item) => [item.id, item]));
  const trash = shared.trash.map((item) =>
    reconcileSharedTrashItem(item, currentTrashById.get(item.id)),
  );
  projectCanvasStates.set(state.activeProjectId, snapshot);
  projectCanvasMeta.set(state.activeProjectId, projectMetaFromSnapshot(snapshot));
  if (usesLegacyPersistenceTestAdapter()) void persistTrash(state.activeProjectId, trash);
  else {
    trashCache.set(state.activeProjectId, trash);
    bridgeLoadedTrashProjects.add(state.activeProjectId);
  }
  applyingAuthoritativeBridgeSnapshot = true;
  try {
    useCanvasStore.setState({
      projectName,
      projects,
      nodes,
      edges: reuseSnapshotReferences(state.edges, activeSnapshot?.edges ?? state.edges),
      tabs: shared.tabs,
      activeTabId,
      assets,
      trash,
      genParams: shared.genParams,
      activeTags: new Set(shared.activeTags),
    });
  } finally {
    applyingAuthoritativeBridgeSnapshot = false;
  }
  if (usesLegacyPersistenceTestAdapter()) void persistCanvas(useCanvasStore.getState());
  return true;
}

interface AuthoritativeBridgeProjectApplyResult {
  applied: boolean;
  revision?: number;
  message?: string;
}

function isRecoverableBridgePersistenceConflict(status: CanvasPersistenceStatus) {
  return (
    status.state === 'conflict' &&
    (status.conflictingWriterId === 'bridge-remote' ||
      status.conflictingWriterId === 'bridge-local-read')
  );
}

/** Read and atomically apply the complete Bridge project only while the local
 * source captured by the caller is still current. This prevents a recovery
 * read from erasing edits made while the request was in flight. */
async function readAndApplyAuthoritativeBridgeProject(
  projectId: string,
  expectedSource: CanvasState,
): Promise<AuthoritativeBridgeProjectApplyResult> {
  try {
    let loaded = await readBridgeProject<SharedProjectWorkspace>(projectId);
    if (loaded && bridgeRevisionIsStale(projectId, loaded.revision)) {
      loaded = await readBridgeProject<SharedProjectWorkspace>(projectId);
    }
    if (!loaded?.workspace) {
      return { applied: false, message: '主机画布不存在或尚未完成保存。' };
    }
    if (bridgeRevisionIsStale(projectId, loaded.revision)) {
      return { applied: false, message: '读取期间主机画布再次更新，请重新执行恢复。' };
    }
    const current = useCanvasStore.getState();
    if (
      current.activeProjectId !== projectId ||
      !sameBridgePersistenceSource(expectedSource, current)
    ) {
      return {
        applied: false,
        message: '读取主机版本期间当前画布又被编辑；新修改仍已保留，请重新备份后再载入。',
      };
    }
    if (!currentCanvasPersistenceConflictHasExportedBackup(projectId)) {
      return {
        applied: false,
        message: '读取主机版本期间本地冲突副本已变化；新修改仍已保留，请重新备份后再载入。',
      };
    }
    const authoritative = {
      ...loaded.workspace,
      revision: loaded.revision,
    } satisfies SharedProjectWorkspace;
    if (
      !applySharedProjectWorkspace(authoritative, {
        recoverInterruptedGeneration: true,
      })
    ) {
      return { applied: false, message: '主机返回的完整画布无效或已过期，未覆盖当前页面。' };
    }
    applyBridgeManifest(projectId, loaded.manifest);
    Object.keys(authoritative.workspaces).forEach((workspace) => {
      if (workspace !== 'home' && workspace in WORKSPACES) {
        bridgeLoadedWorkspaces.add(bridgeWorkspaceCacheKey(projectId, workspace as WorkspaceId));
      }
    });
    bridgeLoadedTrashProjects.add(projectId);
    useCanvasStore.setState({ past: [], future: [] });
    return { applied: true, revision: loaded.revision };
  } catch (error) {
    return {
      applied: false,
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : '读取主机画布失败；当前本地修改仍保留在页面中。',
    };
  }
}

/** Replace a genuinely conflicting local canvas with the authoritative host
 * project. The caller must first export the current conflict copy; the export
 * signature is rechecked immediately before and after the Bridge read. */
export function reloadCanvasFromBridgeAfterConflict(): Promise<boolean> {
  if (canvasStoreRuntimeDisposed || usesLegacyPersistenceTestAdapter()) {
    return Promise.resolve(false);
  }
  const started = useCanvasStore.getState();
  const projectId = started.activeProjectId;
  const status = persistenceStatusFor(projectId);
  if (
    !isRecoverableBridgePersistenceConflict(status) ||
    !currentCanvasPersistenceConflictHasExportedBackup(projectId)
  ) {
    if (isRecoverableBridgePersistenceConflict(status)) {
      publishPersistenceStatus({
        ...status,
        lastAttemptAt: Date.now(),
        conflictCopyAvailable: Boolean(getCanvasPersistenceConflictCopy(projectId)),
        message: '重新载入主机版本前必须先导出当前本地冲突副本。',
      });
    }
    return Promise.resolve(false);
  }

  return enqueueBridgePersistence(async () => {
    const currentStatus = persistenceStatusFor(projectId);
    const current = useCanvasStore.getState();
    if (
      !isRecoverableBridgePersistenceConflict(currentStatus) ||
      current.activeProjectId !== projectId ||
      !sameBridgePersistenceSource(started, current) ||
      !currentCanvasPersistenceConflictHasExportedBackup(projectId)
    ) {
      publishPersistenceStatus({
        ...currentStatus,
        projectId,
        state: 'conflict',
        lastAttemptAt: Date.now(),
        conflictCopyAvailable: Boolean(getCanvasPersistenceConflictCopy(projectId)),
        message: '恢复开始前当前画布又被编辑；新修改仍已保留，请重新备份后再载入。',
      });
      return false;
    }

    const result = await readAndApplyAuthoritativeBridgeProject(projectId, started);
    if (!result.applied) {
      publishPersistenceStatus({
        ...persistenceStatusFor(projectId),
        projectId,
        state: 'conflict',
        lastAttemptAt: Date.now(),
        conflictCopyAvailable: Boolean(getCanvasPersistenceConflictCopy(projectId)),
        message: result.message,
      });
      return false;
    }

    canvasAutosave.cancel();
    initialBridgeHydrationState = 'ready';
    clearCanvasPersistenceConflict(projectId);
    canvasPersistenceRetries.reset(projectId);
    publishPersistenceStatus({
      projectId,
      state: 'saved',
      lastAttemptAt: Date.now(),
      lastSavedAt: Date.now(),
      revision: result.revision,
      writerId: 'bridge',
      conflictCopyAvailable: false,
    });
    return true;
  });
}

export function applySharedProjectCatalog(projects: Array<{ id: string; name: string }>) {
  const clean = projects.filter(
    (project) =>
      /^[A-Za-z0-9_-]{2,80}$/.test(project.id) && typeof project.name === 'string' && project.name,
  );
  if (clean.length === 0) return;
  const state = useCanvasStore.getState();
  if (!usesLegacyPersistenceTestAdapter()) {
    const active = clean.find((project) => project.id === state.activeProjectId);
    if (!active) return;
    if (
      state.projects.length === clean.length &&
      clean.every(
        (project, index) =>
          project.id === state.projects[index]?.id && project.name === state.projects[index]?.name,
      )
    ) {
      return;
    }
    applyingAuthoritativeBridgeSnapshot = true;
    try {
      useCanvasStore.setState({
        projects: clean,
        projectName: active.name,
      });
    } finally {
      applyingAuthoritativeBridgeSnapshot = false;
    }
    return;
  }
  const merged = new Map(clean.map((project) => [project.id, project]));
  const activeLocal = state.projects.find((project) => project.id === state.activeProjectId);
  if (activeLocal && !merged.has(activeLocal.id)) merged.set(activeLocal.id, activeLocal);
  const nextProjects = [...merged.values()];
  if (
    nextProjects.length === state.projects.length &&
    nextProjects.every(
      (project, index) =>
        project.id === state.projects[index]?.id && project.name === state.projects[index]?.name,
    )
  ) {
    return;
  }
  applyingAuthoritativeBridgeSnapshot = true;
  try {
    useCanvasStore.setState({ projects: nextProjects });
  } finally {
    applyingAuthoritativeBridgeSnapshot = false;
  }
}

/** Immediately persist the latest canvas state, including an in-progress
 * interaction. Used before leaving the page and by editors with local drafts. */
export function flushCanvasPersistence(): Promise<boolean> {
  canvasAutosave.cancel();
  const state = useCanvasStore.getState();
  canvasPersistenceRetries.reset(state.activeProjectId);
  return persistCanvas(state);
}

/** Mark the start/end of a high-frequency interaction (e.g. node drag). */
export function _setInteracting(active: boolean, source = 'node') {
  canvasAutosave.setActive(source, active);
}

const unsubscribeCanvasStorePersistence = useCanvasStore.subscribe((state, previousState) => {
  if (applyingAuthoritativeBridgeSnapshot) return;
  const persistedChange = hasPersistedCanvasChange(previousState, state);
  if (
    state.workspace !== 'home' &&
    canvasNodeMediaDataChanged(previousState.nodes, state.nodes) &&
    collectCanvasMediaStrings(state.nodes, isCanvasMediaFallbackUrl).length > 0
  ) {
    void hydrateActiveCanvasMedia().catch(reportCanvasMediaHydrationError);
  }
  if (persistedChange && initialBridgeHydrationBlocksPersistence()) {
    initialBridgeHydrationMutationEpoch += 1;
    canvasAutosave.cancel();
    return;
  }
  if (persistedChange) canvasAutosave.request();
});

const handleCanvasBeforeUnload = () => void flushCanvasPersistence();

const handleCanvasStorage = (event: StorageEvent) => {
  if (event.key !== CANVAS_KEY || !event.newValue) return;
  try {
    const incoming = parseCanvasPersistence<PersistedCanvas>(event.newValue);
    const localIntent = captureCanvasPersistenceIntent(useCanvasStore.getState());
    for (const [projectId, revision] of Object.entries(incoming.projectRevisions ?? {})) {
      const observedRevision = observedProjectRevisions.get(projectId);
      const observed = observedRevision?.revision ?? 0;
      if (
        !isCanvasProjectRevisionConflict(
          observed,
          CANVAS_WRITER_ID,
          revision,
          observedRevision?.writerId,
        )
      ) {
        continue;
      }
      recordCanvasPersistenceConflict(localIntent, incoming, projectId, revision, Date.now());
      publishPersistenceStatus({
        projectId,
        state: 'conflict',
        revision: observed,
        writerId: CANVAS_WRITER_ID,
        conflictingWriterId: revision.writerId,
        conflictCopyAvailable: true,
        lastAttemptAt: Date.now(),
        message: `检测到另一个标签页已把画布推进到修订 ${revision.revision}。当前标签页不会覆盖它；请刷新后继续，或导出冲突副本。`,
      });
    }
  } catch {
    // A malformed external value is never adopted and cannot authorize an overwrite.
  }
};

const handleCanvasVisibilityChange = () => {
  if (document.visibilityState === 'hidden') void flushCanvasPersistence();
};

let unbindCanvasAutosaveActivity: (() => void) | undefined;
if (typeof window !== 'undefined') {
  unbindCanvasAutosaveActivity = bindCanvasAutosaveActivity(window, canvasAutosave);
  window.addEventListener('beforeunload', handleCanvasBeforeUnload);
  if (usesLegacyPersistenceTestAdapter()) window.addEventListener('storage', handleCanvasStorage);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleCanvasVisibilityChange);
  }
}

function disposeCanvasStoreRuntime() {
  if (canvasStoreRuntimeDisposed) return;
  canvasStoreRuntimeDisposed = true;
  for (const cancel of cancelCanvasStoreStartupTasks.splice(0)) cancel();
  unsubscribeCanvasStorePersistence();
  unbindCanvasAutosaveActivity?.();
  canvasAutosave.cancel();
  const retryProjectIds = new Set([
    useCanvasStore.getState().activeProjectId,
    ...observedProjectRevisions.keys(),
    ...projectPersistenceStatuses.keys(),
  ]);
  for (const projectId of retryProjectIds) canvasPersistenceRetries.reset(projectId);
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', handleCanvasBeforeUnload);
    if (usesLegacyPersistenceTestAdapter()) {
      window.removeEventListener('storage', handleCanvasStorage);
    }
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleCanvasVisibilityChange);
  }
}

if (import.meta.hot) import.meta.hot.dispose(disposeCanvasStoreRuntime);
