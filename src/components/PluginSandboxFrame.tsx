import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { flushCanvasPersistence, useCanvasStore } from '../store/canvasStore';
import { useAppTranslation } from '../i18n/appI18n';
import {
  cancelPluginAudioInstall,
  cancelPluginPoseModelInstall,
  configurePluginSeedAudioApiKey,
  createPluginReferenceAudioCategory,
  generatePluginAudio,
  importPluginReferenceAudio,
  listPluginAudioGenerators,
  listPluginDepthModels,
  listPluginPoseModels,
  listPluginReferenceAudioLibrary,
  loadPluginRuntime,
  pluginAssetUrl,
  probePluginAudioGenerator,
  readPluginAudioInstallStatus,
  readPluginPoseModelInstallStatus,
  readPluginReferenceAudio,
  readPluginStyleSample,
  renamePluginReferenceAudio,
  startPluginAudioInstall,
  startPluginPoseModelInstall,
  uploadPluginStyleSample,
  uninstallPluginAudioGenerator,
  uninstallPluginPoseModel,
  type InstalledPlugin,
  type PluginAudioGenerationRequest,
  type PluginAudioGenerationResult,
  type PluginPermission,
} from '../services/pluginRegistry';
import {
  buildPluginSandboxDocument,
  parsePluginSandboxCall,
  PLUGIN_SANDBOX_MESSAGE_SOURCE,
  resolvePluginCanvasVideoUrl,
  resolvePluginAudioReferenceUrl,
  sanitizePluginAddNodeRequest,
  sanitizePluginAutoDlH3ConnectionRequest,
  sanitizePluginAudioGenerationCall,
  sanitizePluginAudioGeneratorId,
  sanitizePluginAudioHistoryLookup,
  sanitizePluginAudioInstallRequest,
  sanitizePluginReferenceAudioCategory,
  sanitizePluginReferenceAudioImport,
  sanitizePluginDocumentRequest,
  sanitizePluginStyleCoverRequest,
  sanitizePluginManagedImageRequest,
  sanitizePluginManagedVideoFrameRequest,
  sanitizePluginManagedMediaInspectRequest,
  sanitizePluginManagedMediaDownloadRequest,
  sanitizePluginHostDownloadRequest,
  sanitizePluginHostSaveFileRequest,
  sanitizePluginManagedTextRequest,
  sanitizePluginManagedVideoRequest,
  sanitizePluginMotionSourceReadRequest,
  sanitizePluginMotionSourceStoreRequest,
  sanitizePluginNodePatch,
  sanitizePluginOwnImageRequest,
  sanitizePluginOwnInputs,
  sanitizePluginProjectGraphRequest,
  sanitizePluginSeedAudioCredentialRequest,
  sanitizePluginPoseFrameRequest,
  sanitizePluginPoseCaptureRequest,
  sanitizePluginPoseCaptureJobRequest,
  sanitizePluginPoseEngineInstallRequest,
  sanitizePluginDepthFrameRequest,
  sanitizePluginDepthModelInstallRequest,
  type PluginSandboxContext,
} from '../services/pluginSandbox';
import {
  clearPluginAutoDlH3Connection,
  configurePluginAutoDlH3Connection,
  readPluginAutoDlH3ConnectionStatus,
} from '../services/pluginAutoDlH3Connection';
import {
  cancelPluginMotionCapture,
  readPluginMotionCaptureResult,
  readPluginMotionCaptureStatus,
  startPluginMotionCapture,
} from '../services/pluginMotionCaptureWorker';
import { bridgeAssetFileUrl, uploadAssetFile } from '../services/assetLibrary';
import { isCurrentBridgeUrl } from '../lib/bridgeUrl';
import {
  appendPluginAudioHistory,
  createPluginAudioHistoryEntry,
  deletePluginAudioHistory,
  findPluginAudioHistory,
  listPluginAudioHistory,
  MAX_VISIBLE_PLUGIN_AUDIO_HISTORY,
  type PluginAudioHistoryEntry,
} from '../services/pluginAudioHistory';
import {
  deletePluginPreference,
  readPluginPreference,
  writePluginPreference,
} from '../services/pluginPreferences';
import { centeredCanvasNodePosition } from '../canvas/canvasViewportRuntime';
import { AUDIO_NODE_HEIGHT, AUDIO_NODE_WIDTH } from '../lib/audioNode';
import {
  deletePluginDocument,
  readPluginDocument,
  writePluginDocument,
} from '../services/pluginDocuments';
import {
  deletePluginSharedStyleCover,
  readPluginSharedStyleCover,
  writePluginSharedStyleCover,
} from '../services/pluginStyleCovers';
import {
  listPluginManagedImageModels,
  listPluginManagedTextModels,
  listPluginManagedVideoModels,
  runPluginManagedImageModel,
  runPluginManagedTextModel,
  runPluginManagedVideoModel,
} from '../services/pluginManagedModels';
import {
  captureManagedVideoFrame,
  managedGenerationRequestId,
  managedMediaRecord,
  previewManagedMedia,
  readManagedCanvasImageCopy,
  registerManagedCanvasImage,
  registerManagedMedia,
  releaseManagedMediaRegistry,
  resolveManagedImageReferences,
  resolveManagedProjectGraphMedia,
  type PluginManagedMediaRecord,
} from '../services/pluginManagedMediaBridge';
import { applyPluginProjectGraphOnce } from '../services/pluginGraphApplication';
import { buildMediaDownloadRequest, downloadMediaFile } from '../lib/mediaDownload';
import { detectPluginPoseFrame, listPluginPoseEngines } from '../services/pluginPoseCapture';
import { clearPluginDepthSession, renderPluginDepthFrame } from '../services/pluginDepthEffect';
import { renderPluginSapiensNormalFrame } from '../services/pluginSapiensNormal';
import { imagePreviewSource, resolveMediaSourceUrl, videoPreviewSource } from '../lib/mediaPreview';
import { PluginRecentProjectImagePicker } from './PluginRecentProjectImagePicker';
import type { PluginRecentProjectImageOption } from '../services/pluginRecentProjectImages';

export const PLUGIN_NOTICE_EVENT = 'qiansi-plugin-notice';

type Props = {
  plugin: InstalledPlugin;
  view: string;
  nodeId?: string;
  title: string;
  locale?: 'zh-CN' | 'en-US';
  className?: string;
  interactive?: boolean;
  allowFullscreen?: boolean;
  onRequestClose?: () => void;
};

type PluginWritableFileStream = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

type PluginSaveFileHandle = {
  name?: string;
  createWritable(): Promise<PluginWritableFileStream>;
};

type PluginSaveFilePicker = (options: {
  suggestedName: string;
  excludeAcceptAllOption: boolean;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<PluginSaveFileHandle>;

const METHOD_PERMISSION: Record<string, PluginPermission> = {
  'canvas.updateOwnNode': 'canvas:update-own-node',
  'canvas.addNode': 'canvas:add-node',
  'canvas.createProjectGraph': 'canvas:create-project-graph',
  'canvas.readSelection': 'canvas:read-selection',
  'canvas.readSelectedImage': 'canvas:read-selection',
  'canvas.readManagedImageCopy': 'canvas:read-selection',
  'canvas.readSelectedVideo': 'canvas:read-selection',
  'canvas.readOwnInputs': 'canvas:read-own-inputs',
  'canvas.readOwnImage': 'canvas:read-own-image',
  'canvas.notify': 'canvas:notify',
  'assets.read': 'assets:read',
  'styles.readSample': 'styles:manage-samples',
  'styles.uploadSample': 'styles:manage-samples',
  'audio.checkGenerator': 'audio:generate',
  'audio.configureSeedAudioKey': 'audio:generate',
  'audio.listGenerators': 'audio:install',
  'audio.installGenerator': 'audio:install',
  'audio.installStatus': 'audio:install',
  'audio.cancelInstall': 'audio:install',
  'audio.uninstallGenerator': 'audio:install',
  'audio.generate': 'audio:generate',
  'audio.listReferenceLibrary': 'audio:reference-library',
  'audio.readReferenceLibrary': 'audio:reference-library',
  'audio.createReferenceCategory': 'audio:reference-library',
  'audio.renameReferenceLibrary': 'audio:reference-library',
  'audio.importReferenceLibrary': 'audio:reference-library',
  'audio.listHistory': 'audio:generate',
  'audio.readHistory': 'audio:generate',
  'audio.downloadHistory': 'audio:generate',
  'audio.addHistoryToCanvasAssets': 'audio:generate',
  'audio.deleteHistory': 'audio:generate',
  'audio.cancel': 'audio:generate',
  'preferences.read': 'storage:preferences',
  'preferences.write': 'storage:preferences',
  'preferences.delete': 'storage:preferences',
  'documents.read': 'storage:project-documents',
  'documents.write': 'storage:project-documents',
  'documents.delete': 'storage:project-documents',
  'styleCovers.read': 'storage:shared-style-covers',
  'styleCovers.write': 'storage:shared-style-covers',
  'styleCovers.delete': 'storage:shared-style-covers',
  'models.listText': 'models:use-text',
  'models.runText': 'models:use-text',
  'models.listImage': 'models:use-media',
  'models.listVideo': 'models:use-media',
  'models.getAutoDlH3Connection': 'models:use-media',
  'models.configureAutoDlH3Connection': 'models:use-media',
  'models.clearAutoDlH3Connection': 'models:use-media',
  'models.runImage': 'models:use-media',
  'models.runVideo': 'models:use-media',
  'models.captureVideoFrame': 'media:transform',
  'models.previewMedia': 'models:use-media',
  'models.inspectMedia': 'models:use-media',
  'models.downloadMedia': 'models:use-media',
  'vision.listPoseEngines': 'vision:pose',
  'vision.installPoseEngine': 'vision:install',
  'vision.poseEngineInstallStatus': 'vision:install',
  'vision.cancelPoseEngineInstall': 'vision:install',
  'vision.uninstallPoseEngine': 'vision:install',
  'vision.detectPose': 'vision:pose',
  'vision.startPoseCapture': 'vision:pose',
  'vision.poseCaptureStatus': 'vision:pose',
  'vision.poseCaptureResult': 'vision:pose',
  'vision.cancelPoseCapture': 'vision:pose',
  'vision.listDepthModels': 'vision:pose',
  'vision.installDepthModel': 'vision:install',
  'vision.depthModelInstallStatus': 'vision:install',
  'vision.cancelDepthModelInstall': 'vision:install',
  'vision.uninstallDepthModel': 'vision:install',
  'vision.renderDepthFrame': 'vision:pose',
  'vision.mountRigPreview': 'vision:pose',
  'vision.persistMotionSourceVideo': 'vision:pose',
  'vision.readMotionSourceVideo': 'vision:pose',
};

const MAX_REFERENCE_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_GENERATED_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_PLUGIN_INPUT_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_PLUGIN_SELECTION_VIDEO_BYTES = 256 * 1024 * 1024;
const PLUGIN_INPUT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/flac',
  'audio/x-flac',
]);
const PLUGIN_INPUT_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function safeAudioFileName(value: unknown, mimeType: string) {
  const supplied = String(value || '')
    .trim()
    .replace(/[\\/\0\r\n]/g, '_')
    .slice(0, 180);
  if (supplied && supplied !== '.' && supplied !== '..') return supplied;
  const extension =
    mimeType === 'audio/mpeg'
      ? 'mp3'
      : mimeType === 'audio/ogg'
        ? 'ogg'
        : mimeType === 'audio/webm'
          ? 'webm'
          : mimeType === 'audio/flac'
            ? 'flac'
            : 'wav';
  return `plugin-audio-${Date.now()}.${extension}`;
}

async function readBoundedAudioResponse(response: Response, maxBytes: number, label = '参考音频') {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${label}超过大小限制。`);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) throw new Error(`${label}大小无效。`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel(`${label}超过大小限制。`).catch(() => {});
        throw new Error(`${label}超过大小限制。`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 1) throw new Error(`${label}为空。`);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function publicPluginAudioHistoryEntry(entry: PluginAudioHistoryEntry) {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    mode: entry.mode,
    text: entry.text,
    control: entry.control,
    options: entry.options,
    requiresReferenceAudio: entry.requiresReferenceAudio,
    mimeType: entry.mimeType,
    fileName: entry.fileName,
    durationSeconds: entry.durationSeconds,
  };
}

async function readPluginAudioHistoryBytes(entry: PluginAudioHistoryEntry) {
  const resolvedUrl = resolvePluginAudioReferenceUrl(entry.audioUrl);
  const response = await fetch(resolvedUrl, { credentials: 'omit' });
  if (!response.ok) throw new Error(`历史音频读取失败（HTTP ${response.status}）。`);
  const mimeType = (
    String(response.headers.get('content-type') || entry.mimeType).split(';', 1)[0] ??
    entry.mimeType
  )
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mimeType)) throw new Error('历史记录指向的文件不是受支持的音频。');
  const source = await readBoundedAudioResponse(response, MAX_GENERATED_AUDIO_BYTES, '历史音频');
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  return {
    bytes: bytes.buffer,
    mimeType,
    fileName: safeAudioFileName(entry.fileName, mimeType),
    durationSeconds: entry.durationSeconds,
  };
}

function downloadPluginAudioHistory(audio: {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
}) {
  const url = URL.createObjectURL(new Blob([audio.bytes], { type: audio.mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = audio.fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function audioReferenceFromOwnInput(url: string, signal: AbortSignal) {
  const resolvedUrl = resolvePluginAudioReferenceUrl(url);
  const response = await fetch(resolvedUrl, { credentials: 'omit', signal });
  if (!response.ok) throw new Error(`参考音频读取失败（HTTP ${response.status}）。`);
  const mimeType = (
    String(response.headers.get('content-type') || 'audio/wav').split(';', 1)[0] ?? 'audio/wav'
  )
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mimeType)) throw new Error('连接的参考文件不是受支持的音频。');
  const bytes = await readBoundedAudioResponse(response, MAX_REFERENCE_AUDIO_BYTES);
  let fileName = '';
  try {
    const parsed = new URL(resolvedUrl);
    fileName = decodeURIComponent(parsed.pathname.split('/').at(-1) || '');
  } catch {
    // Blob/data URLs have no useful stable file name.
  }
  return {
    base64: bytesToBase64(bytes),
    mimeType,
    fileName: safeAudioFileName(fileName, mimeType),
  };
}

function safeInputImageFileName(value: string, mimeType: string) {
  const supplied = value
    .trim()
    .replace(/[\\/\0\r\n]/g, '_')
    .slice(0, 180);
  if (supplied && supplied !== '.' && supplied !== '..') return supplied;
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : mimeType === 'image/avif'
            ? 'avif'
            : 'jpg';
  return `canvas-input.${extension}`;
}

function selectedVideoMimeType(response: Response, source: string, storedMimeType: unknown) {
  const declared = String(response.headers.get('content-type') || '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  const stored = String(storedMimeType || '')
    .trim()
    .toLowerCase();
  for (const candidate of [declared, stored]) {
    if (candidate && PLUGIN_INPUT_VIDEO_MIME_TYPES.has(candidate)) return candidate;
  }
  const pathname = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  if (pathname.endsWith('.webm')) return 'video/webm';
  if (pathname.endsWith('.mov')) return 'video/quicktime';
  if (pathname.endsWith('.mp4') || pathname.endsWith('.m4v')) return 'video/mp4';
  throw new Error('选中的画布文件不是受支持的 MP4、WebM 或 MOV 视频。');
}

function safeSelectedVideoFileName(value: unknown, mimeType: string) {
  const extension =
    mimeType === 'video/webm' ? 'webm' : mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const supplied = String(value || '')
    .trim()
    .replace(/[\\/\0\r\n]/g, '_')
    .slice(0, 170);
  if (!supplied || supplied === '.' || supplied === '..') return `canvas-video.${extension}`;
  return /\.(?:mp4|m4v|mov|webm)$/i.test(supplied) ? supplied : `${supplied}.${extension}`;
}

async function pluginVideoFromSelection(
  node: ReturnType<typeof useCanvasStore.getState>['nodes'][number],
) {
  if (node.data.kind !== 'video') throw new Error('请先在画布中选择一个视频节点。');
  const source = videoPreviewSource(node.data);
  if (!source) throw new Error('选中的视频节点还没有可导入的视频。');
  const resolvedUrl = resolvePluginCanvasVideoUrl(source);
  const response = await fetch(resolvedUrl, { credentials: 'omit' });
  if (!response.ok) throw new Error(`画布视频读取失败（HTTP ${response.status}）。`);
  const mimeType = selectedVideoMimeType(response, source, node.data.mediaMimeType);
  const sourceBytes = await readBoundedAudioResponse(
    response,
    MAX_PLUGIN_SELECTION_VIDEO_BYTES,
    '画布视频',
  );
  const bytes = new Uint8Array(sourceBytes.byteLength);
  bytes.set(sourceBytes);
  return {
    bytes: bytes.buffer,
    mimeType,
    fileName: safeSelectedVideoFileName(node.data.title, mimeType),
    size: bytes.byteLength,
  };
}

async function pluginImageFromOwnInput(url: string) {
  const value = url.trim();
  if (
    !value ||
    (!value.startsWith('blob:') && !value.startsWith('data:image/') && !isCurrentBridgeUrl(value))
  ) {
    throw new Error('连接的图片不是受信任的画布媒体地址。');
  }
  const response = await fetch(value, { credentials: 'omit' });
  if (!response.ok) throw new Error(`输入图片读取失败（HTTP ${response.status}）。`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_PLUGIN_INPUT_IMAGE_BYTES) {
    throw new Error('插件输入图片不能超过 64 MB。');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_PLUGIN_INPUT_IMAGE_BYTES) {
    throw new Error('插件输入图片必须大于 0 字节且不能超过 64 MB。');
  }
  const mimeType = String(response.headers.get('content-type') || '').split(';', 1)[0] ?? '';
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (!PLUGIN_INPUT_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    throw new Error('连接的文件不是受支持的图片。');
  }
  let fileName = '';
  try {
    const parsed = new URL(value);
    fileName = decodeURIComponent(parsed.pathname.split('/').at(-1) || '');
  } catch {
    // Data URLs have no stable file name.
  }
  return {
    bytes,
    mimeType: normalizedMimeType,
    fileName: safeInputImageFileName(fileName, normalizedMimeType),
  };
}

function validatedGeneratedAudio(
  result: PluginAudioGenerationResult,
  declaredMaxBytes: number,
): PluginAudioGenerationResult & { fileName: string } {
  if (!(result.bytes instanceof ArrayBuffer)) throw new Error('音频生成器没有返回有效字节。');
  const maxBytes = Math.max(
    1,
    Math.min(MAX_GENERATED_AUDIO_BYTES, Number(declaredMaxBytes) || MAX_GENERATED_AUDIO_BYTES),
  );
  if (result.bytes.byteLength < 1 || result.bytes.byteLength > maxBytes) {
    throw new Error(
      `音频生成结果必须大于 0 字节且不能超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB。`,
    );
  }
  const mimeType = String(result.mimeType || '')
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw new Error('音频生成器返回了不受支持的媒体类型。');
  }
  const durationSeconds = Number(result.durationSeconds);
  return {
    ...result,
    mimeType,
    fileName: safeAudioFileName(result.fileName, mimeType),
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 86_400
      ? { durationSeconds }
      : { durationSeconds: undefined }),
  };
}

function publicNodeSnapshot(node: ReturnType<typeof useCanvasStore.getState>['nodes'][number]) {
  return {
    id: node.id,
    kind: node.data.kind,
    title: String(node.data.title || ''),
    description: String(node.data.description || ''),
    prompt: String(node.data.prompt || ''),
    outputText: String(node.data.outputText || ''),
    output: node.data.output,
  };
}

export function PluginSandboxFrame({
  plugin,
  view,
  nodeId,
  title,
  locale = 'zh-CN',
  className,
  interactive = true,
  allowFullscreen = false,
  onRequestClose,
}: Props) {
  const { t } = useAppTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const sessionIdRef = useRef(crypto.randomUUID());
  const launchModeRef = useRef<'canvas' | 'standalone'>(
    useCanvasStore.getState().workspace === 'home' ? 'standalone' : 'canvas',
  );
  // A mounted sandbox keeps its launch project even when graph creation opens another Canvas.
  const sessionProjectIdRef = useRef(useCanvasStore.getState().activeProjectId);
  const activeAudioGenerationRef = useRef<{
    requestId: string;
    controller: AbortController;
  } | null>(null);
  const generatedAudioNodeIdRef = useRef<string | null>(null);
  const ephemeralAudioHistoryRef = useRef<PluginAudioHistoryEntry | null>(null);
  const managedMediaRegistryRef = useRef(new Map<string, PluginManagedMediaRecord>());
  const poseRigSessionsRef = useRef(new Set<{ dispose: () => void }>());
  const poseRigGenerationRef = useRef(0);
  const pendingFileSaveRef = useRef<{
    destinationId: string;
    fileName: string;
    handle: PluginSaveFileHandle;
  } | null>(null);
  const [runtimeSource, setRuntimeSource] = useState<string | null>(null);
  const [error, setError] = useState<string | true | null>(null);
  const [recentProjectImagePickerOpen, setRecentProjectImagePickerOpen] = useState(false);
  const recentProjectImageResolverRef = useRef<
    | ((selection: { option: PluginRecentProjectImageOption; projectName: string } | null) => void)
    | null
  >(null);
  const nodes = useCanvasStore((state) => state.nodes);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const saveAsset = useCanvasStore((state) => state.saveAsset);
  const ownNode = nodeId ? nodes.find((node) => node.id === nodeId) : undefined;
  const permissions = plugin.manifest.permissions;
  const canRequestClose = Boolean(onRequestClose);
  const launchNodeRef = useRef<{
    nodeId?: string;
    snapshot?: ReturnType<typeof publicNodeSnapshot>;
  }>({});
  if (launchNodeRef.current.nodeId !== nodeId) {
    launchNodeRef.current = {
      nodeId,
      ...(ownNode ? { snapshot: publicNodeSnapshot(ownNode) } : {}),
    };
  }
  const launchNodeSnapshot = launchNodeRef.current.snapshot;

  const requestRecentProjectImage = useCallback(() => {
    if (recentProjectImageResolverRef.current) {
      throw new Error('已有一个最近项目图片选择窗口正在等待处理。');
    }
    setRecentProjectImagePickerOpen(true);
    return new Promise<{
      option: PluginRecentProjectImageOption;
      projectName: string;
    } | null>((resolve) => {
      recentProjectImageResolverRef.current = resolve;
    });
  }, []);

  const finishRecentProjectImage = useCallback(
    (selection: { option: PluginRecentProjectImageOption; projectName: string } | null) => {
      const resolve = recentProjectImageResolverRef.current;
      recentProjectImageResolverRef.current = null;
      setRecentProjectImagePickerOpen(false);
      resolve?.(selection);
    },
    [],
  );

  useEffect(
    () => () => {
      recentProjectImageResolverRef.current?.(null);
      recentProjectImageResolverRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const registry = managedMediaRegistryRef.current;
    releaseManagedMediaRegistry(registry);
    return () => releaseManagedMediaRegistry(registry);
  }, [plugin.manifest.id, plugin.manifest.version]);

  useEffect(
    () => () => {
      clearPluginDepthSession(sessionIdRef.current);
      pendingFileSaveRef.current = null;
    },
    [],
  );

  useEffect(() => {
    poseRigGenerationRef.current += 1;
    const generation = poseRigGenerationRef.current;
    const sessions = poseRigSessionsRef.current;
    return () => {
      if (poseRigGenerationRef.current === generation) poseRigGenerationRef.current += 1;
      for (const session of sessions) session.dispose();
      sessions.clear();
    };
  }, [plugin.manifest.id, plugin.manifest.version]);

  useEffect(() => {
    let cancelled = false;
    setRuntimeSource(null);
    setError(null);
    void loadPluginRuntime(plugin.manifest.id)
      .then((runtime) => {
        if (!cancelled) setRuntimeSource(runtime.source);
      })
      .catch((runtimeError) => {
        if (!cancelled) {
          setError(
            runtimeError instanceof Error && runtimeError.message ? runtimeError.message : true,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.manifest.id, plugin.manifest.version]);

  const context = useMemo<PluginSandboxContext>(
    () => ({
      apiVersion: plugin.manifest.runtime?.apiVersion ?? 1,
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      view,
      launchMode: launchModeRef.current,
      locale: localeRef.current,
      ...(canRequestClose ? { canRequestClose: true } : {}),
      permissions,
      assets: plugin.manifest.assets,
      ...(launchNodeSnapshot ? { node: launchNodeSnapshot } : {}),
    }),
    [
      canRequestClose,
      launchNodeSnapshot,
      permissions,
      plugin.manifest.assets,
      plugin.manifest.id,
      plugin.manifest.name,
      plugin.manifest.runtime?.apiVersion,
      view,
    ],
  );

  useEffect(
    () => () => {
      activeAudioGenerationRef.current?.controller.abort();
      activeAudioGenerationRef.current = null;
    },
    [],
  );

  const sourceDocument = useMemo(
    () =>
      runtimeSource
        ? buildPluginSandboxDocument(runtimeSource, sessionIdRef.current, context)
        : null,
    [context, runtimeSource],
  );

  const sendLocaleToSandbox = () => {
    frameRef.current?.contentWindow?.postMessage(
      {
        source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
        sessionId: sessionIdRef.current,
        type: 'host-context',
        locale: localeRef.current,
      },
      '*',
    );
  };

  useEffect(() => {
    sendLocaleToSandbox();
  }, [locale]);

  useEffect(() => {
    const respond = (
      requestId: string,
      ok: boolean,
      value?: unknown,
      responseError?: string,
      transfer: Transferable[] = [],
    ) => {
      frameRef.current?.contentWindow?.postMessage(
        {
          source: PLUGIN_SANDBOX_MESSAGE_SOURCE,
          sessionId: sessionIdRef.current,
          type: 'result',
          requestId,
          ok,
          value,
          error: responseError,
        },
        '*',
        transfer,
      );
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const call = parsePluginSandboxCall(event.data, sessionIdRef.current);
      if (!call) return;
      if (call.method === 'host.requestClose') {
        if (!onRequestClose) {
          respond(call.requestId, false, undefined, '当前插件界面不能请求关闭宿主视图。');
          return;
        }
        onRequestClose();
        respond(call.requestId, true);
        return;
      }
      if (call.method === 'host.chooseSaveFile') {
        if (plugin.manifest.id !== 'qiansi-motion-capture') {
          respond(call.requestId, false, undefined, '当前插件不能请求宿主选择保存位置。');
          return;
        }
        let request: ReturnType<typeof sanitizePluginHostSaveFileRequest>;
        try {
          request = sanitizePluginHostSaveFileRequest(call.payload);
        } catch (error) {
          respond(
            call.requestId,
            false,
            undefined,
            error instanceof Error ? error.message : '白模保存请求无效。',
          );
          return;
        }
        const picker = (
          globalThis as typeof globalThis & { showSaveFilePicker?: PluginSaveFilePicker }
        ).showSaveFilePicker;
        if (typeof picker !== 'function') {
          respond(
            call.requestId,
            false,
            undefined,
            '当前浏览器不支持系统“另存为”，请使用最新版 Chrome 或 Edge。',
          );
          return;
        }
        void picker
          .call(globalThis, {
            suggestedName: request.fileName,
            excludeAcceptAllOption: true,
            types: [{ description: '白模 WebM 视频', accept: { 'video/webm': ['.webm'] } }],
          })
          .then((handle) => {
            const destinationId = `save-${crypto.randomUUID()}`;
            const fileName = handle.name?.trim() || request.fileName;
            pendingFileSaveRef.current = { destinationId, fileName, handle };
            respond(call.requestId, true, { status: 'selected', destinationId, fileName });
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              respond(call.requestId, true, { status: 'cancelled' });
              return;
            }
            respond(
              call.requestId,
              false,
              undefined,
              error instanceof Error ? error.message : '无法打开系统“另存为”。',
            );
          });
        return;
      }
      if (call.method === 'host.downloadFile') {
        if (plugin.manifest.id !== 'qiansi-motion-capture') {
          respond(call.requestId, false, undefined, '当前插件不能请求宿主下载文件。');
          return;
        }
        void (async () => {
          let writable: PluginWritableFileStream | null = null;
          try {
            const request = sanitizePluginHostDownloadRequest(call.payload);
            if (request.destinationId) {
              const destination = pendingFileSaveRef.current;
              if (!destination || destination.destinationId !== request.destinationId) {
                throw new Error('所选白模保存位置已失效，请重新选择。');
              }
              pendingFileSaveRef.current = null;
              writable = await destination.handle.createWritable();
              await writable.write(new Blob([request.bytes], { type: request.mimeType }));
              await writable.close();
              respond(call.requestId, true, {
                status: 'saved',
                fileName: destination.fileName,
              });
              return;
            }
            const url = URL.createObjectURL(new Blob([request.bytes], { type: request.mimeType }));
            downloadMediaFile(url, request.fileName);
            globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            respond(call.requestId, true, { status: 'downloaded', fileName: request.fileName });
          } catch (error) {
            if (writable?.abort) await writable.abort().catch(() => undefined);
            respond(
              call.requestId,
              false,
              undefined,
              error instanceof Error ? error.message : '宿主无法保存插件文件。',
            );
          }
        })();
        return;
      }
      const requiredPermission = METHOD_PERMISSION[call.method];
      const hasRequiredPermission =
        requiredPermission != null &&
        (permissions.includes(requiredPermission) ||
          (requiredPermission === 'audio:reference-library' &&
            permissions.includes('audio:generate')));
      if (!requiredPermission || !hasRequiredPermission) {
        respond(
          call.requestId,
          false,
          undefined,
          `插件没有 ${requiredPermission || '未知'} 权限。`,
        );
        return;
      }
      void (async () => {
        try {
          if (
            call.method === 'models.getAutoDlH3Connection' ||
            call.method === 'models.configureAutoDlH3Connection' ||
            call.method === 'models.clearAutoDlH3Connection'
          ) {
            if (plugin.manifest.id !== 'qiansi-novel-video-studio') {
              throw new Error('当前插件不能管理 AutoDL H3 连接。');
            }
            if (call.method === 'models.configureAutoDlH3Connection') {
              const { token } = sanitizePluginAutoDlH3ConnectionRequest(call.payload);
              respond(call.requestId, true, await configurePluginAutoDlH3Connection(token));
              return;
            }
            if (call.payload != null) throw new Error('AutoDL H3 连接状态请求无效。');
            respond(
              call.requestId,
              true,
              call.method === 'models.clearAutoDlH3Connection'
                ? await clearPluginAutoDlH3Connection()
                : await readPluginAutoDlH3ConnectionStatus(),
            );
            return;
          }
          if (call.method === 'canvas.updateOwnNode') {
            if (!nodeId) throw new Error('当前插件界面没有所属节点。');
            updateNodeData(nodeId, sanitizePluginNodePatch(call.payload));
            respond(call.requestId, true, { nodeId });
            return;
          }
          if (call.method === 'vision.mountRigPreview') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持 3D 人偶预览。');
            }
            const payload =
              call.payload && typeof call.payload === 'object' && !Array.isArray(call.payload)
                ? (call.payload as Record<string, unknown>)
                : null;
            const port = payload?.port;
            const modelId = typeof payload?.modelId === 'string' ? payload.modelId : '';
            const view =
              payload?.view === 'mapping' || payload?.view === 'director' ? payload.view : null;
            if (!(port instanceof MessagePort) || !view) {
              throw new Error('3D 人偶预览请求无效。');
            }
            const generation = poseRigGenerationRef.current;
            const { createPluginPoseRigPreview } = await import('../services/pluginPoseRigPreview');
            const mountedSession: { current?: { dispose: () => void } } = {};
            const mounted = await createPluginPoseRigPreview({
              port,
              view,
              modelId,
              onDispose: () => {
                if (mountedSession.current) {
                  poseRigSessionsRef.current.delete(mountedSession.current);
                }
              },
            });
            mountedSession.current = mounted.session;
            if (generation !== poseRigGenerationRef.current) {
              mounted.session.dispose();
              return;
            }
            poseRigSessionsRef.current.add(mounted.session);
            respond(call.requestId, true, mounted.receipt);
            return;
          }
          if (call.method === 'canvas.addNode') {
            const request = sanitizePluginAddNodeRequest(call.payload);
            const createdNodeId = addNode(request.kind, request.position);
            if (Object.keys(request.data).length > 0) updateNodeData(createdNodeId, request.data);
            respond(call.requestId, true, { nodeId: createdNodeId });
            return;
          }
          if (call.method === 'canvas.createProjectGraph') {
            const request = resolveManagedProjectGraphMedia(
              sanitizePluginProjectGraphRequest(call.payload),
              managedMediaRegistryRef.current,
              plugin.manifest.id,
              sessionIdRef.current,
            );
            const sourceProjectId = sessionProjectIdRef.current;
            if (!sourceProjectId) throw new Error('当前没有可用的来源画布项目。');
            respond(
              call.requestId,
              true,
              await applyPluginProjectGraphOnce(plugin.manifest.id, sourceProjectId, request),
            );
            return;
          }
          if (call.method === 'canvas.readSelection') {
            const selected = nodes.find((node) => node.id === selectedNodeId);
            respond(call.requestId, true, selected ? publicNodeSnapshot(selected) : null);
            return;
          }
          if (call.method === 'canvas.readSelectedImage') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持读取画布图片。');
            }
            const recentProjectRequest =
              plugin.manifest.id === 'qiansi-novel-video-studio' &&
              call.payload !== null &&
              typeof call.payload === 'object' &&
              !Array.isArray(call.payload) &&
              Object.keys(call.payload).length === 1 &&
              'source' in call.payload &&
              call.payload.source === 'recent-project-first';
            if (recentProjectRequest) {
              const selection = await requestRecentProjectImage();
              if (!selection) {
                respond(call.requestId, true, { cancelled: true });
                return;
              }
              respond(
                call.requestId,
                true,
                await registerManagedCanvasImage(
                  managedMediaRegistryRef.current,
                  { pluginId: plugin.manifest.id, sessionId: sessionIdRef.current },
                  {
                    url: selection.option.url,
                    title: `${selection.projectName} · ${selection.option.title}`,
                  },
                ),
              );
              return;
            }
            if (launchModeRef.current !== 'canvas') {
              throw new Error('独立启动模式不能读取画布图片。');
            }
            if (call.payload != null) throw new Error('画布图片读取请求不能包含参数。');
            const selected = nodes.find((node) => node.id === selectedNodeId);
            if (!selected || selected.data.kind !== 'image') {
              throw new Error('请先在画布中选择一个图片节点，再打开插件使用。');
            }
            const source = imagePreviewSource(selected.data);
            if (!source) throw new Error('最近选择的图片节点还没有可用图片。');
            respond(
              call.requestId,
              true,
              await registerManagedCanvasImage(
                managedMediaRegistryRef.current,
                { pluginId: plugin.manifest.id, sessionId: sessionIdRef.current },
                {
                  url: resolveMediaSourceUrl(source),
                  title: String(selected.data.title || ''),
                },
              ),
            );
            return;
          }
          if (call.method === 'canvas.readManagedImageCopy') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持读取画布原图副本。');
            }
            const request = sanitizePluginManagedMediaInspectRequest(call.payload);
            const record = managedMediaRecord(
              managedMediaRegistryRef.current,
              request.mediaId,
              plugin.manifest.id,
              sessionIdRef.current,
            );
            respond(call.requestId, true, await readManagedCanvasImageCopy(record));
            return;
          }
          if (call.method === 'canvas.readSelectedVideo') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持读取画布视频。');
            }
            if (launchModeRef.current !== 'canvas') {
              throw new Error('独立启动模式不能读取画布视频。');
            }
            if (call.payload != null) throw new Error('画布视频读取请求不能包含参数。');
            const selected = nodes.find((node) => node.id === selectedNodeId);
            if (!selected) throw new Error('请先在画布中选择一个视频节点。');
            const video = await pluginVideoFromSelection(selected);
            respond(call.requestId, true, video, undefined, [video.bytes]);
            return;
          }
          if (call.method === 'canvas.readOwnInputs') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持读取自身输入。');
            }
            if (!nodeId || !ownNode) throw new Error('当前插件界面没有所属节点。');
            respond(call.requestId, true, sanitizePluginOwnInputs(ownNode.data.portInputs));
            return;
          }
          if (call.method === 'canvas.readOwnImage') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持读取输入图片。');
            }
            if (!nodeId || !ownNode) throw new Error('当前插件界面没有所属节点。');
            const request = sanitizePluginOwnImageRequest(call.payload);
            const inputs = sanitizePluginOwnInputs(ownNode.data.portInputs);
            const value = inputs[request.portId]?.[request.index];
            if (typeof value !== 'string' || !value.trim()) {
              throw new Error('指定端口没有可读取的输入图片。');
            }
            const image = await pluginImageFromOwnInput(value);
            respond(call.requestId, true, image, undefined, [image.bytes]);
            return;
          }
          if (
            call.method === 'preferences.read' ||
            call.method === 'preferences.write' ||
            call.method === 'preferences.delete'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持偏好存储。');
            }
            const payload =
              call.payload && typeof call.payload === 'object' && !Array.isArray(call.payload)
                ? call.payload
                : {};
            const key = 'key' in payload ? payload.key : undefined;
            if (call.method === 'preferences.read') {
              respond(call.requestId, true, readPluginPreference(plugin.manifest.id, key));
              return;
            }
            if (call.method === 'preferences.write') {
              const value = 'value' in payload ? payload.value : undefined;
              respond(call.requestId, true, writePluginPreference(plugin.manifest.id, key, value));
              return;
            }
            respond(call.requestId, true, {
              deleted: deletePluginPreference(plugin.manifest.id, key),
            });
            return;
          }
          if (
            call.method === 'documents.read' ||
            call.method === 'documents.write' ||
            call.method === 'documents.delete'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持项目文档存储。');
            }
            const request = sanitizePluginDocumentRequest(call.payload);
            const projectId = sessionProjectIdRef.current;
            if (!projectId) throw new Error('当前没有可用的画布项目。');
            if (call.method === 'documents.read') {
              respond(
                call.requestId,
                true,
                await readPluginDocument(plugin.manifest.id, projectId, request.key),
              );
              return;
            }
            if (call.method === 'documents.write') {
              if (!Object.prototype.hasOwnProperty.call(request, 'value')) {
                throw new Error('插件项目文档写入内容不能为空。');
              }
              respond(
                call.requestId,
                true,
                await writePluginDocument(
                  plugin.manifest.id,
                  projectId,
                  request.key,
                  request.value,
                  request.expectedRevision,
                ),
              );
              return;
            }
            respond(
              call.requestId,
              true,
              await deletePluginDocument(
                plugin.manifest.id,
                projectId,
                request.key,
                request.expectedRevision,
              ),
            );
            return;
          }
          if (
            call.method === 'styleCovers.read' ||
            call.method === 'styleCovers.write' ||
            call.method === 'styleCovers.delete'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持共享风格封面存储。');
            }
            const request = sanitizePluginStyleCoverRequest(call.payload);
            if (call.method === 'styleCovers.read') {
              respond(
                call.requestId,
                true,
                await readPluginSharedStyleCover(plugin.manifest.id, request.styleId),
              );
              return;
            }
            if (call.method === 'styleCovers.write') {
              if (!Object.prototype.hasOwnProperty.call(request, 'cover')) {
                throw new Error('共享风格封面写入内容不能为空。');
              }
              respond(
                call.requestId,
                true,
                await writePluginSharedStyleCover(
                  plugin.manifest.id,
                  request.styleId,
                  request.cover,
                  request.expectedRevision,
                ),
              );
              return;
            }
            respond(
              call.requestId,
              true,
              await deletePluginSharedStyleCover(
                plugin.manifest.id,
                request.styleId,
                request.expectedRevision,
              ),
            );
            return;
          }
          if (call.method === 'models.listText') {
            respond(call.requestId, true, listPluginManagedTextModels());
            return;
          }
          if (call.method === 'models.runText') {
            respond(
              call.requestId,
              true,
              await runPluginManagedTextModel(sanitizePluginManagedTextRequest(call.payload)),
            );
            return;
          }
          if (call.method === 'vision.listPoseEngines') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持姿态识别。');
            }
            if (call.payload != null) throw new Error('姿态引擎目录请求无效。');
            const models = plugin.manifest.permissions.includes('vision:install')
              ? await listPluginPoseModels(plugin.manifest.id)
              : [];
            respond(call.requestId, true, listPluginPoseEngines(models));
            return;
          }
          if (
            call.method === 'vision.installPoseEngine' ||
            call.method === 'vision.poseEngineInstallStatus' ||
            call.method === 'vision.cancelPoseEngineInstall' ||
            call.method === 'vision.uninstallPoseEngine'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持动作模型安装。');
            }
            const { engineId } = sanitizePluginPoseEngineInstallRequest(call.payload);
            const operation =
              call.method === 'vision.installPoseEngine'
                ? startPluginPoseModelInstall
                : call.method === 'vision.cancelPoseEngineInstall'
                  ? cancelPluginPoseModelInstall
                  : call.method === 'vision.uninstallPoseEngine'
                    ? uninstallPluginPoseModel
                    : readPluginPoseModelInstallStatus;
            respond(call.requestId, true, await operation(plugin.manifest.id, engineId));
            return;
          }
          if (call.method === 'vision.detectPose') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持姿态识别。');
            }
            respond(
              call.requestId,
              true,
              await detectPluginPoseFrame(sanitizePluginPoseFrameRequest(call.payload)),
            );
            return;
          }
          if (call.method === 'vision.startPoseCapture') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持 AI 动作捕捉。');
            }
            respond(
              call.requestId,
              true,
              await startPluginMotionCapture(
                plugin.manifest.id,
                sanitizePluginPoseCaptureRequest(call.payload),
              ),
            );
            return;
          }
          if (
            call.method === 'vision.poseCaptureStatus' ||
            call.method === 'vision.poseCaptureResult' ||
            call.method === 'vision.cancelPoseCapture'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持 AI 动作捕捉。');
            }
            const request = sanitizePluginPoseCaptureJobRequest(call.payload);
            const operation =
              call.method === 'vision.poseCaptureStatus'
                ? readPluginMotionCaptureStatus
                : call.method === 'vision.cancelPoseCapture'
                  ? cancelPluginMotionCapture
                  : readPluginMotionCaptureResult;
            respond(
              call.requestId,
              true,
              await operation(plugin.manifest.id, request.engineId, request.jobId),
            );
            return;
          }
          if (call.method === 'vision.listDepthModels') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持白模视频。');
            }
            if (call.payload != null) throw new Error('白模模型目录请求无效。');
            respond(
              call.requestId,
              true,
              plugin.manifest.permissions.includes('vision:install')
                ? await listPluginDepthModels(plugin.manifest.id)
                : [],
            );
            return;
          }
          if (
            call.method === 'vision.installDepthModel' ||
            call.method === 'vision.depthModelInstallStatus' ||
            call.method === 'vision.cancelDepthModelInstall' ||
            call.method === 'vision.uninstallDepthModel'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持白模模型安装。');
            }
            const { modelId } = sanitizePluginDepthModelInstallRequest(call.payload);
            const operation =
              call.method === 'vision.installDepthModel'
                ? startPluginPoseModelInstall
                : call.method === 'vision.cancelDepthModelInstall'
                  ? cancelPluginPoseModelInstall
                  : call.method === 'vision.uninstallDepthModel'
                    ? uninstallPluginPoseModel
                    : readPluginPoseModelInstallStatus;
            respond(call.requestId, true, await operation(plugin.manifest.id, modelId));
            return;
          }
          if (call.method === 'vision.renderDepthFrame') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持白模视频。');
            }
            const frameRequest = sanitizePluginDepthFrameRequest(call.payload);
            const result =
              frameRequest.modelId === 'sapiens2-normal-0.4b'
                ? await renderPluginSapiensNormalFrame(plugin.manifest.id, frameRequest)
                : await renderPluginDepthFrame(frameRequest, sessionIdRef.current);
            respond(call.requestId, true, result, undefined, [result.bytes]);
            return;
          }
          if (call.method === 'vision.persistMotionSourceVideo') {
            if (plugin.manifest.id !== 'qiansi-motion-capture') {
              throw new Error('当前插件不能保存动作源视频。');
            }
            const request = sanitizePluginMotionSourceStoreRequest(call.payload);
            const file = new File([request.bytes], request.fileName, { type: request.mimeType });
            const item = await uploadAssetFile(file, 'video', {
              project: useCanvasStore.getState().activeProjectId,
            });
            respond(call.requestId, true, {
              assetId: item.id,
              fileName: request.fileName,
              mimeType: request.mimeType,
              fileSize: request.bytes.byteLength,
            });
            return;
          }
          if (call.method === 'vision.readMotionSourceVideo') {
            if (plugin.manifest.id !== 'qiansi-motion-capture') {
              throw new Error('当前插件不能读取动作源视频。');
            }
            const { assetId } = sanitizePluginMotionSourceReadRequest(call.payload);
            const response = await fetch(bridgeAssetFileUrl(assetId));
            if (!response.ok) throw new Error(`动作源视频读取失败（HTTP ${response.status}）。`);
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength < 1 || bytes.byteLength > 256 * 1024 * 1024) {
              throw new Error('动作源视频大小无效或超过 256 MB。');
            }
            const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
            if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) {
              throw new Error('动作源视频格式无效。');
            }
            respond(call.requestId, true, { assetId, mimeType, bytes }, undefined, [bytes]);
            return;
          }
          if (call.method === 'models.listImage') {
            respond(call.requestId, true, listPluginManagedImageModels());
            return;
          }
          if (call.method === 'models.listVideo') {
            respond(call.requestId, true, listPluginManagedVideoModels());
            return;
          }
          if (call.method === 'models.runImage') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体模型。');
            }
            const request = sanitizePluginManagedImageRequest(call.payload);
            const referenceImages = resolveManagedImageReferences(
              managedMediaRegistryRef.current,
              request.referenceMediaIds ?? [],
              plugin.manifest.id,
              sessionIdRef.current,
            );
            const { referenceMediaIds: _referenceMediaIds, ...imageRequest } = request;
            const result = await runPluginManagedImageModel({
              ...imageRequest,
              requestId: managedGenerationRequestId(sessionIdRef.current, request.requestId),
              referenceImages,
            });
            respond(
              call.requestId,
              true,
              registerManagedMedia(
                managedMediaRegistryRef.current,
                { pluginId: plugin.manifest.id, sessionId: sessionIdRef.current },
                { kind: 'image', ...result },
              ),
            );
            return;
          }
          if (call.method === 'models.runVideo') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体模型。');
            }
            const request = sanitizePluginManagedVideoRequest(call.payload);
            const referenceImages = (request.referenceMediaIds ?? []).map((mediaId) => {
              const record = managedMediaRecord(
                managedMediaRegistryRef.current,
                mediaId,
                plugin.manifest.id,
                sessionIdRef.current,
              );
              if (record.kind !== 'image') {
                throw new Error('视频模型参考媒体必须是当前插件会话先前生成的图片。');
              }
              return record.url;
            });
            const { referenceMediaIds: _referenceMediaIds, ...videoRequest } = request;
            const result = await runPluginManagedVideoModel({
              ...videoRequest,
              requestId: managedGenerationRequestId(sessionIdRef.current, request.requestId),
              referenceImages,
            });
            respond(
              call.requestId,
              true,
              registerManagedMedia(
                managedMediaRegistryRef.current,
                { pluginId: plugin.manifest.id, sessionId: sessionIdRef.current },
                { kind: 'video', ...result },
              ),
            );
            return;
          }
          if (call.method === 'models.captureVideoFrame') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体转换。');
            }
            const request = sanitizePluginManagedVideoFrameRequest(call.payload);
            respond(
              call.requestId,
              true,
              await captureManagedVideoFrame(
                managedMediaRegistryRef.current,
                { pluginId: plugin.manifest.id, sessionId: sessionIdRef.current },
                request,
              ),
            );
            return;
          }
          if (call.method === 'models.downloadMedia') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体模型。');
            }
            const request = sanitizePluginManagedMediaDownloadRequest(call.payload);
            const record = managedMediaRecord(
              managedMediaRegistryRef.current,
              request.mediaId,
              plugin.manifest.id,
              sessionIdRef.current,
            );
            const extension = record.kind === 'video' ? 'mp4' : 'png';
            const requestedName = request.fileName || `${record.kind}-${record.mediaId}`;
            const download = buildMediaDownloadRequest(record.url, requestedName, extension);
            downloadMediaFile(record.url, requestedName, extension);
            respond(call.requestId, true, {
              status: 'downloaded',
              mediaId: record.mediaId,
              fileName: download.fileName,
            });
            return;
          }
          if (call.method === 'models.previewMedia') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体模型。');
            }
            const request = sanitizePluginManagedMediaInspectRequest(call.payload);
            const record = managedMediaRecord(
              managedMediaRegistryRef.current,
              request.mediaId,
              plugin.manifest.id,
              sessionIdRef.current,
            );
            respond(call.requestId, true, await previewManagedMedia(record));
            return;
          }
          if (call.method === 'models.inspectMedia') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持受管媒体模型。');
            }
            const request = sanitizePluginManagedMediaInspectRequest(call.payload);
            const record = managedMediaRecord(
              managedMediaRegistryRef.current,
              request.mediaId,
              plugin.manifest.id,
              sessionIdRef.current,
            );
            respond(call.requestId, true, {
              mediaId: record.mediaId,
              kind: record.kind,
              providerId: record.providerId,
              model: record.model,
              ...(record.kind === 'video'
                ? {
                    audioRequested: record.audioRequested === true,
                    audioTrackStatus: record.audioTrackStatus ?? 'unverified',
                  }
                : {}),
            });
            return;
          }
          if (call.method === 'audio.configureSeedAudioKey') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持 Seed Audio API Key 配置。');
            }
            if (plugin.manifest.id !== 'doubao-seed-audio') {
              throw new Error('当前插件不能配置 Seed Audio API Key。');
            }
            const generatorId = 'doubao-seed-audio-cloud';
            const generator = plugin.manifest.contributes.audioGenerators?.find(
              (item) => item.id === generatorId,
            );
            if (!generator) throw new Error('Seed Audio 生成器未在当前插件清单中声明。');
            const { apiKey } = sanitizePluginSeedAudioCredentialRequest(call.payload);
            respond(
              call.requestId,
              true,
              await configurePluginSeedAudioApiKey(plugin.manifest.id, generatorId, apiKey),
            );
            return;
          }
          if (call.method === 'audio.checkGenerator') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持音频生成能力。');
            }
            const generatorId = sanitizePluginAudioGeneratorId(
              call.payload && typeof call.payload === 'object' && 'generatorId' in call.payload
                ? call.payload.generatorId
                : '',
            );
            const generator = plugin.manifest.contributes.audioGenerators?.find(
              (item) => item.id === generatorId,
            );
            if (!generator) throw new Error('音频生成器未在当前插件清单中声明。');
            respond(
              call.requestId,
              true,
              await probePluginAudioGenerator(plugin.manifest.id, generatorId),
            );
            return;
          }
          if (
            call.method === 'audio.listGenerators' ||
            call.method === 'audio.installGenerator' ||
            call.method === 'audio.installStatus' ||
            call.method === 'audio.cancelInstall' ||
            call.method === 'audio.uninstallGenerator'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持音频模型安装。');
            }
            if (call.method === 'audio.listGenerators') {
              if (call.payload != null) throw new Error('音频模型目录请求不能包含参数。');
              respond(call.requestId, true, await listPluginAudioGenerators(plugin.manifest.id));
              return;
            }
            const installRequest = sanitizePluginAudioInstallRequest(call.payload);
            const generator = plugin.manifest.contributes.audioGenerators?.find(
              (item) => item.id === installRequest.generatorId,
            );
            if (!generator) throw new Error('音频生成器未在当前插件清单中声明。');
            if (call.method === 'audio.installGenerator') {
              respond(
                call.requestId,
                true,
                await startPluginAudioInstall(
                  plugin.manifest.id,
                  installRequest.generatorId,
                  installRequest.licenseAcceptance,
                ),
              );
              return;
            }
            if (call.method === 'audio.uninstallGenerator') {
              if (installRequest.licenseAcceptance) {
                throw new Error('删除模型时不能提交许可证确认。');
              }
              respond(
                call.requestId,
                true,
                await uninstallPluginAudioGenerator(plugin.manifest.id, installRequest.generatorId),
              );
              return;
            }
            if (installRequest.licenseAcceptance) {
              throw new Error('只有启动安装时可以提交许可证确认。');
            }
            respond(
              call.requestId,
              true,
              call.method === 'audio.cancelInstall'
                ? await cancelPluginAudioInstall(plugin.manifest.id, installRequest.generatorId)
                : await readPluginAudioInstallStatus(
                    plugin.manifest.id,
                    installRequest.generatorId,
                  ),
            );
            return;
          }
          if (
            call.method === 'audio.listReferenceLibrary' ||
            call.method === 'audio.readReferenceLibrary' ||
            call.method === 'audio.createReferenceCategory' ||
            call.method === 'audio.renameReferenceLibrary' ||
            call.method === 'audio.importReferenceLibrary'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持参考音频库。');
            }
            if (call.method === 'audio.listReferenceLibrary') {
              if (call.payload != null) throw new Error('参考音频库列表请求不能包含参数。');
              respond(
                call.requestId,
                true,
                await listPluginReferenceAudioLibrary(plugin.manifest.id),
              );
              return;
            }
            if (call.method === 'audio.importReferenceLibrary') {
              const reference = sanitizePluginReferenceAudioImport(call.payload);
              respond(
                call.requestId,
                true,
                await importPluginReferenceAudio(
                  plugin.manifest.id,
                  reference.fileName,
                  reference.mimeType,
                  reference.base64,
                ),
              );
              return;
            }
            if (call.method === 'audio.createReferenceCategory') {
              const category = sanitizePluginReferenceAudioCategory(call.payload);
              respond(
                call.requestId,
                true,
                await createPluginReferenceAudioCategory(plugin.manifest.id, category),
              );
              return;
            }
            const payload =
              call.payload && typeof call.payload === 'object' && !Array.isArray(call.payload)
                ? (call.payload as Record<string, unknown>)
                : {};
            const id = typeof payload.id === 'string' ? payload.id.trim() : '';
            if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('参考音频 ID 无效。');
            if (call.method === 'audio.readReferenceLibrary') {
              const audio = await readPluginReferenceAudio(plugin.manifest.id, id);
              respond(call.requestId, true, audio, undefined, [audio.bytes]);
              return;
            }
            const name = typeof payload.name === 'string' ? payload.name.trim() : '';
            const category = typeof payload.category === 'string' ? payload.category.trim() : '';
            const transcript = typeof payload.transcript === 'string' ? payload.transcript : '';
            if (!name || name.length > 120 || category.length > 80) {
              throw new Error('参考音频名称或分类无效。');
            }
            if (transcript.length > 16_000) throw new Error('参考音频准确转写无效。');
            respond(
              call.requestId,
              true,
              await renamePluginReferenceAudio(plugin.manifest.id, id, name, category, transcript),
            );
            return;
          }
          if (
            call.method === 'audio.listHistory' ||
            call.method === 'audio.readHistory' ||
            call.method === 'audio.downloadHistory' ||
            call.method === 'audio.addHistoryToCanvasAssets' ||
            call.method === 'audio.deleteHistory'
          ) {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持音频历史。');
            }
            const lookup = sanitizePluginAudioHistoryLookup(call.payload);
            const generator = plugin.manifest.contributes.audioGenerators?.find(
              (item) => item.id === lookup.generatorId,
            );
            if (!generator) throw new Error('音频生成器未在当前插件清单中声明。');
            const projectId = useCanvasStore.getState().activeProjectId || 'default';
            if (call.method === 'audio.listHistory') {
              const persistedHistory = listPluginAudioHistory(
                plugin.manifest.id,
                lookup.generatorId,
                projectId,
              );
              const ephemeralHistory = ephemeralAudioHistoryRef.current;
              respond(
                call.requestId,
                true,
                [
                  ...(ephemeralHistory &&
                  ephemeralHistory.pluginId === plugin.manifest.id &&
                  ephemeralHistory.generatorId === lookup.generatorId &&
                  ephemeralHistory.projectId === projectId
                    ? [ephemeralHistory]
                    : []),
                  ...persistedHistory.filter((entry) => entry.id !== ephemeralHistory?.id),
                ]
                  .slice(0, MAX_VISIBLE_PLUGIN_AUDIO_HISTORY)
                  .map(publicPluginAudioHistoryEntry),
              );
              return;
            }
            if (!lookup.historyId) throw new Error('音频历史 ID 不能为空。');
            const persistedHistoryEntry = findPluginAudioHistory(
              plugin.manifest.id,
              lookup.generatorId,
              projectId,
              lookup.historyId,
            );
            const ephemeralHistoryEntry = ephemeralAudioHistoryRef.current;
            const historyEntry =
              persistedHistoryEntry ??
              (ephemeralHistoryEntry?.pluginId === plugin.manifest.id &&
              ephemeralHistoryEntry.generatorId === lookup.generatorId &&
              ephemeralHistoryEntry.projectId === projectId &&
              ephemeralHistoryEntry.id === lookup.historyId
                ? ephemeralHistoryEntry
                : undefined);
            if (!historyEntry) throw new Error('音频历史不存在或不属于当前画布。');
            if (call.method === 'audio.deleteHistory') {
              const deleted = persistedHistoryEntry
                ? deletePluginAudioHistory(
                    plugin.manifest.id,
                    lookup.generatorId,
                    projectId,
                    lookup.historyId,
                  )
                : true;
              if (!deleted) throw new Error('音频历史删除失败。');
              if (ephemeralAudioHistoryRef.current?.id === lookup.historyId) {
                ephemeralAudioHistoryRef.current = null;
              }
              respond(call.requestId, true, { deleted: true });
              return;
            }
            if (call.method === 'audio.addHistoryToCanvasAssets') {
              await readPluginAudioHistoryBytes(historyEntry);
              const canvasAsset = useCanvasStore.getState().addAudioAsset({
                bridgeAssetId: historyEntry.assetId,
                audioUrl: historyEntry.audioUrl,
                fileName: historyEntry.fileName,
                mimeType: historyEntry.mimeType,
                durationSeconds: historyEntry.durationSeconds,
              });
              const persisted = await flushCanvasPersistence();
              const retained = useCanvasStore
                .getState()
                .assets.some((asset) => asset.id === canvasAsset.assetId);
              if (!persisted || !retained) {
                throw new Error('音频尚未保存到画布资产库，请等待画布加载完成后重试。');
              }
              respond(call.requestId, true, {
                added: canvasAsset.added,
                canvasAssetId: canvasAsset.assetId,
              });
              return;
            }
            const historyAudio = await readPluginAudioHistoryBytes(historyEntry);
            if (call.method === 'audio.downloadHistory') {
              downloadPluginAudioHistory(historyAudio);
              respond(call.requestId, true, { fileName: historyAudio.fileName });
              return;
            }
            respond(call.requestId, true, historyAudio, undefined, [historyAudio.bytes]);
            return;
          }
          if (call.method === 'audio.cancel') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持音频生成能力。');
            }
            const active = activeAudioGenerationRef.current;
            if (active) active.controller.abort();
            respond(call.requestId, true, { cancelled: Boolean(active) });
            return;
          }
          if (call.method === 'audio.generate') {
            if (plugin.manifest.runtime?.apiVersion !== 2) {
              throw new Error('当前插件运行时版本不支持音频生成能力。');
            }
            if (activeAudioGenerationRef.current) throw new Error('当前插件节点已有音频生成任务。');
            const generationCall = sanitizePluginAudioGenerationCall(call.payload);
            const generator = plugin.manifest.contributes.audioGenerators?.find(
              (item) => item.id === generationCall.generatorId,
            );
            if (!generator) throw new Error('音频生成器未在当前插件清单中声明。');
            const controller = new AbortController();
            activeAudioGenerationRef.current = { requestId: call.requestId, controller };
            try {
              let request: PluginAudioGenerationRequest = generationCall.request;
              if ('hostAdapter' in generator && request.referenceAudios?.length) {
                if (request.referenceAudios.length > 1) {
                  throw new Error('当前宿主管理音频引擎只接受一段参考音频。');
                }
                request = {
                  ...request,
                  referenceAudio: request.referenceAudios[0],
                  referenceAudios: undefined,
                };
              }
              if (
                request.mode !== 'design' &&
                !request.referenceAudio &&
                !request.referenceAudios?.length
              ) {
                if (!ownNode) throw new Error('独立工作台的声音克隆需要选择参考音频。');
                const inputs = sanitizePluginOwnInputs(ownNode.data.portInputs);
                const preferredPortIds = ['reference-audio', 'audio', 'in'];
                const connectedUrl = preferredPortIds
                  .flatMap((portId) => inputs[portId] ?? [])
                  .find(
                    (value): value is string => typeof value === 'string' && value.trim() !== '',
                  );
                if (!connectedUrl) throw new Error('声音克隆需要连接或选择一段参考音频。');
                request = {
                  ...request,
                  referenceAudio: await audioReferenceFromOwnInput(connectedUrl, controller.signal),
                };
              }
              const rawResult = await generatePluginAudio(
                plugin.manifest.id,
                generationCall.generatorId,
                request,
                {
                  signal: controller.signal,
                },
              );
              const result = validatedGeneratedAudio(rawResult, generator.maxBytes);
              const file = new File([result.bytes], result.fileName, { type: result.mimeType });
              const item = await uploadAssetFile(file, 'audio', {
                project: useCanvasStore.getState().activeProjectId,
                signal: controller.signal,
              });
              if (controller.signal.aborted) throw new DOMException('生成已取消。', 'AbortError');

              const historyResult = appendPluginAudioHistory(
                createPluginAudioHistoryEntry({
                  pluginId: plugin.manifest.id,
                  generatorId: generationCall.generatorId,
                  projectId: useCanvasStore.getState().activeProjectId || 'default',
                  request,
                  assetId: item.id,
                  audioUrl: item.url,
                  mimeType: result.mimeType,
                  fileName: result.fileName,
                  durationSeconds: result.durationSeconds,
                }),
              );
              const historyEntry = historyResult?.entry;
              ephemeralAudioHistoryRef.current = historyResult?.persisted
                ? null
                : (historyEntry ?? null);

              let audioNodeId: string | undefined;
              if (
                generator.canvasOutput === 'audio-node' ||
                plugin.manifest.contributes.nodes.length > 0
              ) {
                const canvasState = useCanvasStore.getState();
                if (canvasState.workspace === 'home') canvasState.setWorkspace('views');
                if (canvasState.workspace === 'home') {
                  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                }
                const currentAudioNode = generatedAudioNodeIdRef.current
                  ? useCanvasStore
                      .getState()
                      .nodes.find(
                        (node) =>
                          node.id === generatedAudioNodeIdRef.current && node.data.kind === 'audio',
                      )
                  : undefined;
                audioNodeId = currentAudioNode
                  ? currentAudioNode.id
                  : (() => {
                      const anchorNode = ownNode;
                      const centeredPosition = centeredCanvasNodePosition({
                        width: AUDIO_NODE_WIDTH,
                        height: AUDIO_NODE_HEIGHT,
                      });
                      return addNode(
                        'audio',
                        anchorNode
                          ? {
                              x: anchorNode.position.x + (anchorNode.measured?.width ?? 420) + 120,
                              y: anchorNode.position.y,
                            }
                          : (centeredPosition ?? { x: 120, y: -96 }),
                      );
                    })();
                generatedAudioNodeIdRef.current = audioNodeId;
                if (!nodeId && currentAudioNode) {
                  const centeredPosition = centeredCanvasNodePosition({
                    width: currentAudioNode.measured?.width ?? AUDIO_NODE_WIDTH,
                    height: currentAudioNode.measured?.height ?? AUDIO_NODE_HEIGHT,
                  });
                  if (centeredPosition) {
                    useCanvasStore.getState().setNodePosition(audioNodeId, centeredPosition);
                  }
                }
                const outputTitle = `${plugin.manifest.name} · ${generator.label}`;
                updateNodeData(audioNodeId, {
                  title: outputTitle,
                  description: '由本机插件音频生成器创建',
                  audioUrl: item.url,
                  audios: [item.url],
                  audioFileName: result.fileName,
                  output: item.url,
                  bridgeAssetId: item.id,
                  durationSeconds: result.durationSeconds,
                  generationError: undefined,
                  result: '插件音频已保存到本机素材库。',
                  pluginId: plugin.manifest.id,
                  pluginNodeId: generationCall.generatorId,
                  pluginVersion: plugin.manifest.version,
                  pluginName: plugin.manifest.name,
                });
                useCanvasStore.getState().propagate(audioNodeId);
                saveAsset(audioNodeId, 'audio');
                if (nodeId) {
                  updateNodeData(nodeId, {
                    output: item.url,
                    audioUrl: item.url,
                    audios: [item.url],
                    audioFileName: result.fileName,
                    bridgeAssetId: item.id,
                    durationSeconds: result.durationSeconds,
                    generationError: undefined,
                    result: '插件音频已生成并保存。',
                  });
                  useCanvasStore.getState().propagate(nodeId);
                }
              }
              respond(
                call.requestId,
                true,
                {
                  bytes: result.bytes,
                  mimeType: result.mimeType,
                  fileName: result.fileName,
                  durationSeconds: result.durationSeconds,
                  url: item.url,
                  assetId: item.id,
                  ...(audioNodeId ? { audioNodeId } : {}),
                  ...(historyEntry ? { history: publicPluginAudioHistoryEntry(historyEntry) } : {}),
                },
                undefined,
                [result.bytes],
              );
              return;
            } finally {
              if (activeAudioGenerationRef.current?.requestId === call.requestId) {
                activeAudioGenerationRef.current = null;
              }
            }
          }
          if (call.method === 'canvas.notify') {
            const message = String(
              call.payload && typeof call.payload === 'object' && 'message' in call.payload
                ? call.payload.message
                : '',
            )
              .trim()
              .slice(0, 180);
            if (!message) throw new Error('插件通知内容为空。');
            window.dispatchEvent(
              new CustomEvent(PLUGIN_NOTICE_EVENT, {
                detail: { pluginName: plugin.manifest.name, message },
              }),
            );
            respond(call.requestId, true);
            return;
          }
          if (call.method === 'assets.read') {
            const name = String(
              call.payload && typeof call.payload === 'object' && 'name' in call.payload
                ? call.payload.name
                : '',
            );
            if (!plugin.manifest.assets.includes(name)) throw new Error('插件素材未在清单中声明。');
            const response = await fetch(
              pluginAssetUrl(plugin.manifest.id, name, undefined, plugin.manifest.version),
            );
            if (!response.ok) throw new Error(`插件素材读取失败（HTTP ${response.status}）。`);
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 16 * 1024 * 1024)
              throw new Error('插件素材超过 16 MB 运行时限制。');
            respond(call.requestId, true, bytes, undefined, [bytes]);
            return;
          }
          if (call.method === 'styles.readSample') {
            const packId = String(
              call.payload && typeof call.payload === 'object' && 'packId' in call.payload
                ? call.payload.packId
                : '',
            ).trim();
            if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(packId)) throw new Error('风格标识格式无效。');
            const sample = await readPluginStyleSample(plugin.manifest.id, packId);
            if (!sample) {
              respond(call.requestId, true, null);
              return;
            }
            respond(call.requestId, true, sample, undefined, [sample.bytes]);
            return;
          }
          if (call.method === 'styles.uploadSample') {
            const payload = call.payload && typeof call.payload === 'object' ? call.payload : {};
            const packId = 'packId' in payload ? String(payload.packId || '').trim() : '';
            const fileName =
              'fileName' in payload ? String(payload.fileName || '').slice(0, 180) : '';
            const mimeType =
              'mimeType' in payload ? String(payload.mimeType || '').toLowerCase() : '';
            const bytes =
              'bytes' in payload && payload.bytes instanceof ArrayBuffer ? payload.bytes : null;
            if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(packId)) throw new Error('风格标识格式无效。');
            if (!fileName) throw new Error('风格样图文件名为空。');
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
              throw new Error('仅支持 PNG、JPEG 或 WebP 风格样图。');
            }
            if (!bytes || !bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
              throw new Error('风格样图不能为空且不能超过 8 MiB。');
            }
            const sample = await uploadPluginStyleSample(
              plugin.manifest.id,
              packId,
              fileName,
              mimeType,
              bytes,
            );
            if (!sample) throw new Error('风格样图上传后未返回文件。');
            respond(call.requestId, true, sample, undefined, [sample.bytes]);
            return;
          }
        } catch (callError) {
          respond(
            call.requestId,
            false,
            undefined,
            callError instanceof Error ? callError.message : '插件能力调用失败。',
          );
        }
      })();
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    addNode,
    nodeId,
    nodes,
    permissions,
    plugin.manifest.assets,
    plugin.manifest.contributes.audioGenerators,
    plugin.manifest.contributes.nodes.length,
    plugin.manifest.id,
    plugin.manifest.name,
    plugin.manifest.runtime?.apiVersion,
    plugin.manifest.version,
    ownNode,
    onRequestClose,
    requestRecentProjectImage,
    saveAsset,
    selectedNodeId,
    updateNodeData,
  ]);

  const canAutoplayAudio = plugin.manifest.contributes.audioGenerators.length > 0;
  const iframeFeaturePolicy = [
    allowFullscreen ? 'fullscreen' : '',
    canAutoplayAudio ? 'autoplay' : '',
  ]
    .filter(Boolean)
    .join('; ');

  if (error) {
    return (
      <div className="flex h-full min-h-28 items-center justify-center gap-2 rounded-lg bg-rose-500/[0.05] px-4 text-[11px] text-rose-200/70">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {error === true
            ? t('pluginHost.sandbox.runtimeLoadFailed', '插件运行时加载失败。')
            : error}
        </span>
      </div>
    );
  }
  if (!sourceDocument) {
    return (
      <div className="flex h-full min-h-28 items-center justify-center gap-2 text-[11px] text-white/35">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {t('pluginHost.sandbox.starting', '正在启动隔离插件…')}
      </div>
    );
  }
  return (
    <>
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-scripts allow-downloads"
        allow={iframeFeaturePolicy || undefined}
        allowFullScreen={allowFullscreen}
        srcDoc={sourceDocument}
        onLoad={sendLocaleToSandbox}
        className={className ?? 'block h-full w-full border-0 bg-transparent'}
        data-plugin-interactive={interactive ? 'true' : 'false'}
        tabIndex={interactive ? 0 : -1}
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      />
      {recentProjectImagePickerOpen && (
        <PluginRecentProjectImagePicker
          onCancel={() => finishRecentProjectImage(null)}
          onSelect={(option, projectName) => finishRecentProjectImage({ option, projectName })}
        />
      )}
    </>
  );
}
