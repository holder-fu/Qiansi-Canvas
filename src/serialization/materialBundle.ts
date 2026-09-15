import type { FlowNode } from '../canvas/nodeTypes';
import {
  loadCanvasMediaFallback,
  parseCanvasMediaFallbackReferenceUrl,
  verifyCanvasMediaFallback,
} from '../lib/canvasMediaFallback';
import { isDerivedImagePreviewUrl } from '../lib/aiImageReferencePolicy';
import { resolveBridgeUrl } from '../lib/bridgeUrl';
import { loadAssetVideo, loadEffectVideo } from '../lib/libraryMedia';
import { createStoredZip, parseStoredZip, type StoredZipEntry } from '../lib/storedZip';

export type MaterialKind = 'image' | 'video' | 'text';

export interface MaterialExportOptions {
  image: boolean;
  video: boolean;
  text: boolean;
}

export interface ImportedMaterial {
  kind: MaterialKind;
  title: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

interface MaterialManifestEntry {
  path: string;
  kind: MaterialKind;
  title: string;
  nodeId: string;
  mime: string;
}

interface MaterialManifest {
  format: 'qiansi-canvas-material-bundle';
  version: 1;
  exportedAt: string;
  entries: MaterialManifestEntry[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
/** A bundle can carry a full storyboard, but remains bounded to protect the browser and Bridge. */
export const MAX_CANVAS_MATERIAL_BYTES = 512 * 1024 * 1024;
export const MAX_CANVAS_MATERIAL_ENTRIES = 1000;
const MAX_ZIP_ENTRIES = MAX_CANVAS_MATERIAL_ENTRIES + 2;

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export class CanvasMaterialBundleExportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CanvasMaterialBundleExportError';
  }
}

function safeName(value: string, fallback: string) {
  const printable = Array.from(value.trim(), (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('');
  return (
    printable
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 100) || fallback
  );
}

function mimeFromDataUrl(url: string) {
  return /^data:([^;,]+)/i.exec(url)?.[1]?.toLowerCase();
}

function extensionFor(mime: string, url = '') {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'text/plain': 'txt',
  };
  if (known[mime]) return known[mime];
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
  return match?.[1]?.toLowerCase() || 'bin';
}

function mediaUrl(value: unknown, kind: 'image' | 'video') {
  if (typeof value !== 'string' || !value.trim()) return '';
  const url = value.trim();
  if (kind === 'image' && url.startsWith('qiansi-canvas-media:')) return url;
  if (!/^(?:https?:|blob:|data:)/i.test(url)) return '';
  const mime = mimeFromDataUrl(url);
  if (mime && !mime.startsWith(`${kind}/`)) return '';
  return url;
}

const TRUSTED_RELATIVE_BRIDGE_ORIGINAL = /^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/u;

function isPreviewOnlyImageUrl(value: string) {
  return (
    parseCanvasMediaFallbackReferenceUrl(value)?.role === 'preview' ||
    isDerivedImagePreviewUrl(value)
  );
}

function normalizeOriginalImageUrl(value: string, strictField: boolean) {
  const url = value.trim();
  if (!url) return '';
  if (TRUSTED_RELATIVE_BRIDGE_ORIGINAL.test(url)) return resolveBridgeUrl(url);
  if (url.startsWith('qiansi-canvas-media:')) return url;
  if (/^(?:https?:|blob:|data:)/iu.test(url)) {
    const mime = mimeFromDataUrl(url);
    return mime && !mime.startsWith('image/') ? '' : url;
  }
  if (strictField) {
    throw new CanvasMaterialBundleExportError(
      `图片使用了不受信任的相对地址“${url.slice(0, 160)}”；仅允许本机素材库原图地址 /asset-library/files/<asset-id>。`,
    );
  }
  return '';
}

function nodeImageUrls(node: FlowNode) {
  const explicitOriginal =
    typeof node.data.originalUrl === 'string' ? node.data.originalUrl.trim() : '';
  const hasExplicitOriginal = Boolean(explicitOriginal && !isPreviewOnlyImageUrl(explicitOriginal));
  const candidates: Array<{ value: unknown; strict: boolean }> = [
    { value: node.data.originalUrl, strict: true },
    ...(hasExplicitOriginal ? [] : [{ value: node.data.imageUrl, strict: true }]),
    ...stringList(node.data.images).map((value) => ({ value, strict: true })),
    { value: node.data.annotationSourceUrl, strict: true },
    ...(node.data.kind !== 'video' && node.data.kind !== 'video-comp'
      ? [{ value: node.data.output, strict: false }]
      : []),
  ];
  const rendererPreview =
    typeof node.data.previewUrl === 'string' && node.data.previewUrl.trim()
      ? node.data.previewUrl.trim()
      : '';
  const rawUrls = candidates.flatMap((candidate) =>
    typeof candidate.value === 'string' && candidate.value.trim()
      ? [{ value: candidate.value.trim(), strict: candidate.strict }]
      : [],
  );
  const previewUrls = [
    ...rawUrls.filter((candidate) => isPreviewOnlyImageUrl(candidate.value)),
    ...(rendererPreview && isPreviewOnlyImageUrl(rendererPreview)
      ? [{ value: rendererPreview, strict: true }]
      : []),
  ];
  const originals = rawUrls.filter((candidate) => !isPreviewOnlyImageUrl(candidate.value));
  if (originals.length === 0 && previewUrls.length > 0) {
    throw new CanvasMaterialBundleExportError(
      '图片节点当前只有缩略图，缩略图不能替代原图导出；请先恢复或重新选择原始图片。',
    );
  }
  return new Set(
    originals
      .map((candidate) => normalizeOriginalImageUrl(candidate.value, candidate.strict))
      .filter(Boolean),
  );
}

async function readImageUrl(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const reference = parseCanvasMediaFallbackReferenceUrl(url);
  if (reference?.role === 'preview') {
    throw new CanvasMaterialBundleExportError(
      '素材包中的图片只有 IndexedDB 缩略图；缩略图不能替代原图导出，请先恢复原始图片。',
    );
  }
  if (reference?.role === 'original') {
    let verification: Awaited<ReturnType<typeof verifyCanvasMediaFallback>>;
    try {
      verification = await verifyCanvasMediaFallback(reference.stableId);
    } catch (error) {
      throw new CanvasMaterialBundleExportError(
        '无法验证 IndexedDB 中的素材原图，已停止导出以避免写入错误图片。',
        error,
      );
    }
    if (!verification.ok) {
      throw new CanvasMaterialBundleExportError(
        `IndexedDB 素材原图校验失败（${verification.reason}），已停止导出。`,
      );
    }

    let blob: Blob | null;
    try {
      blob = await loadCanvasMediaFallback(reference.stableId);
    } catch (error) {
      throw new CanvasMaterialBundleExportError(
        '无法读取 IndexedDB 中的素材原图，已停止导出。',
        error,
      );
    }
    if (!blob) {
      throw new CanvasMaterialBundleExportError(
        'IndexedDB 中的素材原图已不存在，无法创建完整素材包。',
      );
    }
    const mime = blob.type || verification.mimeType;
    if (!mime.toLowerCase().startsWith('image/')) {
      throw new CanvasMaterialBundleExportError('IndexedDB 中的素材原图不是图片，已停止导出。');
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime };
  }
  if (url.startsWith('qiansi-canvas-media:')) {
    throw new CanvasMaterialBundleExportError(
      '素材包中的 IndexedDB 图片地址无效，已停止导出以避免图片错位。',
    );
  }
  return readUrl(url);
}

async function readUrl(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = mimeFromDataUrl(url) || response.headers.get('content-type')?.split(';')[0] || '';
  return { bytes, mime };
}

function uniquePath(path: string, used: Set<string>) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const extension = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  let index = 2;
  while (used.has(`${base}-${index}${extension}`)) index += 1;
  const next = `${base}-${index}${extension}`;
  used.add(next);
  return next;
}

function nodeText(node: FlowNode) {
  const fields = [
    ['提示词', node.data.prompt],
    ['描述', node.data.description],
    ['输出文字', node.data.outputText],
    ['生成结果', node.data.result],
  ] as const;
  const seen = new Set<string>();
  const lines = [`节点：${node.data.title || node.id}`, `类型：${node.data.kind}`];
  for (const [label, value] of fields) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text || /^(?:data:|blob:|https?:\/\/)/i.test(text) || seen.has(text)) continue;
    seen.add(text);
    lines.push('', `${label}：`, text);
  }
  return lines.length > 2 ? lines.join('\n') : '';
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function createCanvasMaterialBundle(
  nodes: FlowNode[],
  options: MaterialExportOptions,
): Promise<{ blob: Blob; counts: Record<MaterialKind, number>; skipped: number }> {
  const files: StoredZipEntry[] = [];
  const manifestEntries: MaterialManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const counts: Record<MaterialKind, number> = { image: 0, video: 0, text: 0 };
  const skipped: string[] = [];

  const addBytes = (
    node: FlowNode,
    kind: MaterialKind,
    bytes: Uint8Array,
    mime: string,
    sourceName = '',
  ) => {
    if (manifestEntries.length >= MAX_CANVAS_MATERIAL_ENTRIES) {
      throw new CanvasMaterialBundleExportError(
        `素材包最多包含 ${MAX_CANVAS_MATERIAL_ENTRIES} 个素材，请分批导出。`,
      );
    }
    const title = safeName(String(node.data.title || node.id), kind);
    const extension = extensionFor(mime, sourceName);
    const path = uniquePath(`${kind}/${title}.${extension}`, usedPaths);
    files.push({ name: path, bytes });
    manifestEntries.push({ path, kind, title, nodeId: node.id, mime });
    counts[kind] += 1;
  };

  for (const [nodeIndex, node] of nodes.entries()) {
    if (nodeIndex > 0 && nodeIndex % 24 === 0) await yieldToEventLoop();
    if (options.image) {
      let imageUrls: Set<string>;
      try {
        imageUrls = nodeImageUrls(node);
      } catch (error) {
        if (error instanceof CanvasMaterialBundleExportError) {
          throw new CanvasMaterialBundleExportError(
            `无法导出图片“${node.data.title || node.id}”：${error.message}`,
            error,
          );
        }
        throw error;
      }
      for (const url of imageUrls) {
        try {
          const media = await readImageUrl(url);
          addBytes(node, 'image', media.bytes, media.mime || 'image/png', url);
        } catch (error) {
          if (error instanceof CanvasMaterialBundleExportError) {
            throw new CanvasMaterialBundleExportError(
              `无法导出图片“${node.data.title || node.id}”：${error.message}`,
              error,
            );
          }
          skipped.push(`图片：${node.data.title || node.id} · ${url.slice(0, 160)}`);
        }
      }
    }

    if (options.video) {
      let persistedVideo: Blob | null = null;
      if (typeof node.data.assetVideoId === 'string') {
        persistedVideo = await loadAssetVideo(node.data.assetVideoId).catch(() => null);
      }
      if (!persistedVideo && typeof node.data.effectVideoId === 'string') {
        persistedVideo = await loadEffectVideo(node.data.effectVideoId).catch(() => null);
      }
      if (persistedVideo) {
        addBytes(
          node,
          'video',
          new Uint8Array(await persistedVideo.arrayBuffer()),
          persistedVideo.type || 'video/mp4',
          String(node.data.videoFileName || ''),
        );
      } else {
        const videoUrls = new Set(
          [
            mediaUrl(node.data.videoUrl, 'video'),
            ...stringList(node.data.videos).map((url) => mediaUrl(url, 'video')),
            node.data.kind === 'video' || node.data.kind === 'video-comp'
              ? mediaUrl(node.data.output, 'video')
              : '',
          ].filter(Boolean),
        );
        for (const url of videoUrls) {
          try {
            const media = await readUrl(url);
            addBytes(node, 'video', media.bytes, media.mime || 'video/mp4', url);
          } catch {
            skipped.push(`视频：${node.data.title || node.id} · ${url.slice(0, 160)}`);
          }
        }
      }
    }

    if (options.text) {
      const content = nodeText(node);
      if (content) addBytes(node, 'text', encoder.encode(content), 'text/plain');
    }
  }

  if (!manifestEntries.length) throw new Error('所选节点中没有可导出的对应素材。');
  const manifest: MaterialManifest = {
    format: 'qiansi-canvas-material-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: manifestEntries,
  };
  const entries: StoredZipEntry[] = [
    { name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    ...files,
  ];
  if (skipped.length) {
    entries.push({
      name: '未能下载的素材.txt',
      bytes: encoder.encode(`以下远程素材因网络或跨域限制未写入 ZIP：\n\n${skipped.join('\n')}`),
    });
  }
  const size = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (size > MAX_CANVAS_MATERIAL_BYTES)
    throw new Error('素材总大小超过 512 MB，请分类型或分节点导出。');
  return { blob: createStoredZip(entries), counts, skipped: skipped.length };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function parseCanvasMaterialBundle(file: File): Promise<ImportedMaterial[]> {
  const entries = await parseStoredZip(file, {
    maxBytes: MAX_CANVAS_MATERIAL_BYTES,
    maxEntries: MAX_ZIP_ENTRIES,
  });
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw new Error('素材包中缺少 manifest.json。');
  const manifest = JSON.parse(decoder.decode(manifestBytes)) as unknown;
  if (
    !isRecord(manifest) ||
    manifest.format !== 'qiansi-canvas-material-bundle' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.entries)
  ) {
    throw new Error('不是受支持的 Qiansi-Canvas 素材包。');
  }
  if (manifest.entries.length > MAX_CANVAS_MATERIAL_ENTRIES) {
    throw new Error(`素材数量不能超过 ${MAX_CANVAS_MATERIAL_ENTRIES}。`);
  }

  return manifest.entries.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`素材清单第 ${index + 1} 项无效。`);
    const kind = entry.kind;
    const path = entry.path;
    if (
      (kind !== 'image' && kind !== 'video' && kind !== 'text') ||
      typeof path !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.mime !== 'string'
    ) {
      throw new Error(`素材清单第 ${index + 1} 项字段无效。`);
    }
    const bytes = entries.get(path);
    if (!bytes) throw new Error(`素材包缺少文件：${path}`);
    return {
      kind,
      title: entry.title.slice(0, 120),
      fileName: path.split('/').at(-1) || `${kind}-${index + 1}`,
      mime: entry.mime.slice(0, 120),
      bytes,
    };
  });
}
