import { isDirectorNodeKind, type FlowNode } from '../canvas/nodeTypes';
import { isPlaceholderMediaUrl } from '../canvas/placeholders';
import { outputAssetType } from '../graph/nodeSpecs';
import { isDerivedImagePreviewUrl } from '../lib/aiImageReferencePolicy';
import { preferredImageReferenceUrls } from '../lib/imageAnnotations';
import {
  imagePreviewSource,
  mediaPreviewUrl,
  resolveMediaSourceUrl,
  resolvedAudioSource,
  videoPreviewSource,
} from '../lib/mediaPreview';
import type { ComposerReference } from './types';
import type { ComposerSpec } from '../graph/types';

/**
 * Keep media references in the attachment strip. Upstream text has its own context card for text
 * and image composers, so showing it here as a second attachment would duplicate the same input.
 */
export function visibleComposerReferences(
  composerType: ComposerSpec['type'],
  references: readonly ComposerReference[],
): ComposerReference[] {
  return references.filter((reference) => {
    if (composerType === 'image' && reference.type === 'video') return false;
    if ((composerType === 'image' || composerType === 'text') && reference.type === 'text') {
      return false;
    }
    return true;
  });
}

export function dedupeComposerReferences(
  references: readonly ComposerReference[],
): ComposerReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (reference.type === 'text') {
      const key = `${reference.type}:${reference.label.trim().replace(/\s+/g, ' ')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }

    // A connected reference and a manually saved reference can carry different
    // full-quality URLs while pointing at the same persisted preview. Treat
    // either URL as the media identity so the instruction box cannot show the
    // same picture twice after a node is selected.
    const mediaKeys = [reference.url, reference.previewUrl]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(canonicalReferenceUrl)
      .map((value) => `${reference.type}:${value}`);
    if (mediaKeys.length === 0) {
      const key = `${reference.type}:${reference.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
    if (mediaKeys.some((key) => seen.has(key))) return false;
    mediaKeys.forEach((key) => seen.add(key));
    return true;
  });
}

export function canonicalReferenceUrl(value: string) {
  const resolved = resolveMediaSourceUrl(value);
  try {
    const url = new URL(resolved);
    // A preview and its original bridge asset represent the same reference.
    url.searchParams.delete('preview');
    url.searchParams.delete('w');
    url.searchParams.sort();
    url.hash = '';
    return url.toString();
  } catch {
    return resolved;
  }
}

function isExpiredSessionUrl(value: string) {
  return value.startsWith('blob:');
}

/**
 * An inherited processing node can retain an expired output blob while it also
 * carries its parent's real image in preview/ref fields. Use that stable source
 * when composing a third-level (or later) image node.
 */
type ReferenceNode = Pick<FlowNode, 'id' | 'data'>;

function stableInheritedImageSource(node: ReferenceNode): string | undefined {
  return [
    node.data.originalUrl,
    node.data.imagePreviewUrl,
    ...(node.data.portInputs?.ref ?? []),
  ].find(
    (value): value is string =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !isExpiredSessionUrl(value) &&
      !isDerivedImagePreviewUrl(value) &&
      !isPlaceholderMediaUrl(value),
  );
}

function imageReferencePreviewUrl(node: ReferenceNode, url: string, index: number) {
  const persistedPreview =
    index === 0
      ? [
          node.data.previewUrl,
          node.data.imagePreviewPosterUrl,
          node.data.imagePreviewUrl,
          node.data.originalUrl,
        ].find(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0 && !isPlaceholderMediaUrl(value),
        )
      : undefined;
  return mediaPreviewUrl(persistedPreview ?? url, 'image');
}

/**
 * Composer references can recover from `originalUrl` or a typed `ref` input.
 * The canvas body intentionally renders only media owned by the current node;
 * this separate path keeps inherited references available to the instruction
 * box and AI request without presenting them as a generated result.
 */
function nodeImageReferenceUrls(node: ReferenceNode): string[] {
  const data = node.data;
  const nodeAssetType = outputAssetType(data.kind);
  const canOwnImageOutput = nodeAssetType === 'image' || nodeAssetType === 'reference';
  const rendererSource = imagePreviewSource({
    originalUrl: data.originalUrl,
    imageUrl: data.imageUrl,
    images: data.images,
    imagePreviewUrl: data.imagePreviewUrl,
    portInputs: data.portInputs,
  });
  const referenced = preferredImageReferenceUrls({
    ...data,
    output: canOwnImageOutput ? data.output : undefined,
  });
  const inheritedStableSource = stableInheritedImageSource(node);
  const rendererOriginalSource =
    rendererSource && !isDerivedImagePreviewUrl(rendererSource) ? rendererSource : undefined;
  const repaired = referenced.map((url, index) => {
    if (index !== 0) return url;
    if (isExpiredSessionUrl(url) || isDerivedImagePreviewUrl(url)) {
      return inheritedStableSource || rendererOriginalSource || url;
    }
    return url;
  });
  const candidates = repaired.length > 0 ? repaired : rendererSource ? [rendererSource] : [];
  return candidates
    .filter((url): url is string => Boolean(url) && !isPlaceholderMediaUrl(url))
    .map(resolveMediaSourceUrl)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function isCurrentNodeMediaReference(node: FlowNode, reference: ComposerReference): boolean {
  if (
    !reference.url ||
    (reference.type !== 'image' && reference.type !== 'video' && reference.type !== 'audio')
  ) {
    return false;
  }
  const currentMediaUrls = new Set(
    [
      node.data.imageUrl,
      ...(node.data.images ?? []),
      node.data.videoUrl,
      ...(node.data.videos ?? []),
      node.data.audioUrl,
      ...(node.data.audios ?? []),
      typeof node.data.output === 'string' ? node.data.output : undefined,
    ].filter((url): url is string => typeof url === 'string' && Boolean(url)),
  );
  return currentMediaUrls.has(reference.url);
}

export function nodeToReferences(node: ReferenceNode): ComposerReference[] {
  const refs: ComposerReference[] = [];
  const data = node.data;
  const label = (data.title as string | undefined) || node.id;
  const directorLabels = isDirectorNodeKind(data.kind) ? data.directorReferenceLabels : undefined;
  const nodeAssetType = outputAssetType(data.kind);
  // Video nodes can carry a poster/originalUrl for rendering. Those fields are
  // not independent image references and must not create a second thumbnail.
  const imageUrls =
    nodeAssetType === 'image' || nodeAssetType === 'reference' ? nodeImageReferenceUrls(node) : [];
  const effectTitle =
    typeof data.effectPreset === 'string' && data.effectPreset.trim()
      ? data.effectPreset.trim()
      : undefined;
  const effectPresetId =
    typeof data.effectPresetId === 'string' && data.effectPresetId.trim()
      ? data.effectPresetId.trim()
      : undefined;
  const isEffectReference = Boolean(effectTitle || effectPresetId);
  const effectPrompt =
    typeof data.effectPrompt === 'string' && data.effectPrompt.trim()
      ? data.effectPrompt.trim()
      : undefined;
  imageUrls.forEach((url, index) => {
    const previewUrl = imageReferencePreviewUrl(node, url, index);
    refs.push({
      id: `${node.id}-image-${index}`,
      type: 'image',
      url,
      ...(previewUrl && previewUrl !== url ? { previewUrl } : {}),
      label:
        effectTitle ||
        directorLabels?.[index] ||
        (imageUrls.length > 1 ? `${label} ${index + 1}` : label),
      ...(isDirectorNodeKind(data.kind) ? { locked: true } : {}),
      ...(isEffectReference ? { role: 'effect' as const } : {}),
      ...(isEffectReference && effectPresetId ? { effectPresetId } : {}),
      ...(isEffectReference && effectPrompt ? { effectPrompt } : {}),
    });
  });
  const videoUrl =
    nodeAssetType === 'video'
      ? videoPreviewSource({
          videoUrl: data.videoUrl,
          videos: data.videos,
          originalUrl: data.originalUrl,
          videoPreviewUrl: data.videoPreviewUrl,
          portInputs: data.portInputs,
        })
      : undefined;
  if (videoUrl) {
    const previewUrl =
      typeof data.previewUrl === 'string' && data.previewUrl.trim().length > 0
        ? resolveMediaSourceUrl(data.previewUrl)
        : undefined;
    refs.push({
      id: `${node.id}-video`,
      type: 'video',
      url: resolveMediaSourceUrl(videoUrl),
      ...(previewUrl ? { previewUrl } : {}),
      label: effectTitle ?? label,
      ...(isEffectReference ? { role: 'effect' as const } : {}),
      ...(isEffectReference && effectPresetId ? { effectPresetId } : {}),
      ...(isEffectReference && effectPrompt ? { effectPrompt } : {}),
    });
  }
  // Text/audio references also represent the live graph connection in the
  // composer. Unlike image/video cards, their compact icons do not require a
  // preview URL, so keep the source visible while it is still empty or before
  // its output has been generated.
  const audioUrl = nodeAssetType === 'audio' ? resolvedAudioSource(data) : undefined;
  if (audioUrl || nodeAssetType === 'audio') {
    refs.push({
      id: `${node.id}-audio`,
      type: 'audio',
      ...(audioUrl ? { url: resolveMediaSourceUrl(audioUrl) } : {}),
      label,
    });
  }
  if (nodeAssetType === 'text' || Boolean(data.outputText)) {
    refs.push({ id: `${node.id}-text`, type: 'text', label });
  }
  return refs;
}

export function connectedReferences(
  selected: FlowNode[],
  nodes: FlowNode[],
  edges: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }[],
) {
  const selectedIds = new Set(selected.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, typeof edges>();
  edges.forEach((edge) => {
    const incoming = incomingByTarget.get(edge.target);
    if (incoming) incoming.push(edge);
    else incomingByTarget.set(edge.target, [edge]);
  });

  const collectSourceLineage = (
    sourceNode: FlowNode,
    targetHandle: string | null | undefined,
    visited: ReadonlySet<string>,
  ): ComposerReference[] => {
    if (visited.has(sourceNode.id)) return [];
    const nextVisited = new Set(visited);
    nextVisited.add(sourceNode.id);
    const liveIncoming = incomingByTarget.get(sourceNode.id) ?? [];
    const nodeAssetType = outputAssetType(sourceNode.data.kind);
    const own = nodeToReferences(sourceNode);
    const ownVideos = own.filter((reference) => reference.type === 'video');
    const isFlatDirector =
      sourceNode.data.kind === 'director-2d' ||
      (sourceNode.data.kind === 'director' && sourceNode.data.directorMode === '2d');
    // The 2D director compiles its incoming scene/identity images into one ordered
    // semantic bundle. Traversing past it would expose stale, removable duplicates
    // ahead of the locked A/B references and could change prompt-to-image numbering.
    if (isFlatDirector) return own;
    // A completed video is a new media boundary. Its source images belong to
    // the generation history and must not leak into the downstream composer.
    if (nodeAssetType === 'video' && ownVideos.length > 0) return ownVideos;
    const upstream = liveIncoming.flatMap((edge) => {
      const parent = nodeById.get(edge.source);
      return parent ? collectSourceLineage(parent, edge.targetHandle, nextVisited) : [];
    });
    const hasOwnImage = Boolean(
      sourceNode.data.originalUrl ||
      sourceNode.data.imageUrl ||
      sourceNode.data.images?.some(Boolean) ||
      nodeAssetType === 'image' ||
      nodeAssetType === 'reference',
    );
    const visibleOwn = own.filter(
      (reference) => reference.type !== 'image' || hasOwnImage || liveIncoming.length === 0,
    );
    const combined = [...upstream, ...visibleOwn];
    return targetHandle === 'source-video'
      ? combined.filter((reference) => reference.type === 'video')
      : combined;
  };

  const references = edges
    .filter((edge) => selectedIds.has(edge.target))
    .flatMap((edge) => {
      const targetNode = nodeById.get(edge.target);
      const directorSourceId = targetNode?.data.composerParams?.directorSourceId;
      const isAtomicFlatDirectorTask =
        targetNode?.data.kind === 'image' &&
        typeof targetNode.data.composerParams?.directorReferenceCount === 'number' &&
        typeof directorSourceId === 'string';
      if (isAtomicFlatDirectorTask && edge.source !== directorSourceId) return [];
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode) return [];
      return collectSourceLineage(sourceNode, edge.targetHandle, new Set());
    });

  return references.filter(
    (reference, index, all) => all.findIndex((item) => item.id === reference.id) === index,
  );
}

export function manualReferences(node: FlowNode | undefined): ComposerReference[] {
  const targetNode = node;
  if (!targetNode) return [];
  const raw = targetNode.data.composerReferences;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ComposerReference => {
      if (!item || typeof item !== 'object') return false;
      const reference = item as ComposerReference;
      if (typeof reference.id !== 'string' || typeof reference.label !== 'string') return false;
      if (!['image', 'video', 'audio', 'text'].includes(reference.type)) return false;
      if (
        (reference.type === 'image' || reference.type === 'video') &&
        (typeof reference.url !== 'string' || !reference.url.trim())
      ) {
        return false;
      }
      return (
        !isPlaceholderMediaUrl(reference.url) && !isCurrentNodeMediaReference(targetNode, reference)
      );
    })
    .map((reference) => {
      const role =
        reference.role === 'effect'
          ? ('effect' as const)
          : reference.role === 'style' || reference.id.startsWith('style-preset:')
            ? ('style' as const)
            : undefined;
      const effectPresetId =
        role === 'effect' && reference.effectPresetId?.trim()
          ? reference.effectPresetId.trim()
          : undefined;
      const normalized: ComposerReference = {
        id: reference.id,
        type: reference.type,
        label: reference.label,
        ...(reference.url ? { url: reference.url } : {}),
        ...(reference.previewUrl ? { previewUrl: reference.previewUrl } : {}),
        ...(reference.locked ? { locked: true } : {}),
        ...(role ? { role } : {}),
        ...(role === 'style' && reference.stylePrompt?.trim()
          ? { stylePrompt: reference.stylePrompt.trim() }
          : {}),
        ...(effectPresetId ? { effectPresetId } : {}),
        ...(role === 'effect' && reference.effectPrompt?.trim()
          ? { effectPrompt: reference.effectPrompt.trim() }
          : {}),
      };
      if (reference.type === 'text' || !reference.url) return normalized;
      return {
        ...normalized,
        ...(reference.url ? { url: resolveMediaSourceUrl(reference.url) } : {}),
        ...(reference.previewUrl
          ? { previewUrl: resolveMediaSourceUrl(reference.previewUrl) }
          : {}),
      };
    });
}
