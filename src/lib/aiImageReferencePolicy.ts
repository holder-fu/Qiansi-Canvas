/**
 * AI reference images and renderer previews deliberately use different URLs.
 * A preview is suitable for cards/canvas rendering, but it must never silently
 * replace a full-quality identity, scene, edit-source, or mask image in an AI
 * request.
 */

const PREVIEW_PATH_SEGMENT = /\/(?:media-)?previews?(?:\/|$)|\/(?:thumb|thumbnail)s?(?:\/|$)/iu;
const PREVIEW_QUERY_KEYS = ['preview', 'thumbnail', 'thumb'] as const;

export function isDerivedImagePreviewUrl(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;

  try {
    const url = new URL(trimmed, 'http://qiansi.invalid');
    if (PREVIEW_PATH_SEGMENT.test(url.pathname)) return true;
    return PREVIEW_QUERY_KEYS.some((key) => url.searchParams.has(key));
  } catch {
    const path = trimmed.split(/[?#]/u, 1)[0] ?? '';
    if (PREVIEW_PATH_SEGMENT.test(path)) return true;
    return /(?:[?&])(?:preview|thumbnail|thumb)(?:=|&|$)/iu.test(trimmed);
  }
}

function normalizedReferences(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

type BridgeUnreadableImageReference = 'session-blob' | 'indexeddb-pointer';

function bridgeUnreadableImageReference(value: string): BridgeUnreadableImageReference | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('blob:')) return 'session-blob';
  if (normalized.startsWith('qiansi-canvas-media:')) return 'indexeddb-pointer';
  return undefined;
}

function requireBridgeReadableAiImageReferences(
  values: readonly string[] | undefined,
  label: string,
): string[] {
  const references = normalizedReferences(values);
  const unreadableIndex = references.findIndex((value) => bridgeUnreadableImageReference(value));
  if (unreadableIndex < 0) return references;

  const reason = bridgeUnreadableImageReference(references[unreadableIndex] ?? '');
  const sourceLabel =
    reason === 'session-blob' ? '仅当前页面可用的 Blob 临时地址' : '尚未解析的 IndexedDB 素材标识';
  throw new Error(
    `${label}${references.length > 1 ? ` ${unreadableIndex + 1}` : ''}仍是${sourceLabel}，本机桥无法从 AI 请求中读取原图，已停止生成。请等待原图解析完成后重试。`,
  );
}

/**
 * Validate full-quality references at the final request boundary.
 *
 * Deliberately do not fall back to another URL here: without the original
 * asset identity, guessing could submit the wrong person/image. Callers must
 * resolve asset IDs to their original files before reaching this boundary.
 */
export function requireOriginalAiImageReferences(
  values: readonly string[] | undefined,
  label = '核心参考图',
): string[] {
  const references = requireBridgeReadableAiImageReferences(values, label);
  const previewIndex = references.findIndex(isDerivedImagePreviewUrl);
  if (previewIndex >= 0) {
    throw new Error(
      `${label}${references.length > 1 ? ` ${previewIndex + 1}` : ''}当前只有缩略图，已停止生成。请恢复或重新选择原始图片后再提交给 AI。`,
    );
  }
  return references;
}

export function requireOriginalAiImageReference(
  value: string | undefined,
  label: string,
): string | undefined {
  if (!value?.trim()) return undefined;
  return requireOriginalAiImageReferences([value], label)[0];
}

/**
 * Video-effect compatibility may intentionally use a persisted poster or an
 * extracted frame. It is accepted only through this explicitly named channel;
 * ordinary `referenceImages` remain full-quality core references.
 */
export function mergeVideoAiImageReferences(
  coreReferences: readonly string[] | undefined,
  posterFallbacks: readonly string[] | undefined,
): string[] {
  const originals = requireOriginalAiImageReferences(coreReferences);
  const posters = requireBridgeReadableAiImageReferences(posterFallbacks, '视频海报回退图');
  // Poster fallbacks are an implementation detail and can be collapsed, but
  // core references are semantic slots. Two director subjects may
  // intentionally use the same source image while retaining distinct A/B
  // positions and labels, so URL-based deduplication must never erase either
  // core slot at the final paid-request boundary.
  return [...new Set(posters), ...originals];
}
