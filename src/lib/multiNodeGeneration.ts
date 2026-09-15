import type { FlowNode } from '../canvas/nodeTypes';
import { getNodeOutputValues, resolveNodeOutputPort } from '../graph/graph';
import { getNodeSpec } from '../graph/nodeSpecs';
import { DEFAULT_GENERATION_LIMITS } from './generationLimitsContract.mjs';
import type { GenerationLimitPreferences } from '../store/canvasPreferences';

export interface MultiNodeGenerationTargets {
  imageIds: string[];
  videoIds: string[];
}

export type BatchGenerationMedia = 'image' | 'video';

type ContentGenerationMedia = BatchGenerationMedia | 'other';

export const BATCH_GENERATION_CONCURRENCY: Record<BatchGenerationMedia, number> = {
  image: DEFAULT_GENERATION_LIMITS.imageGenerationConcurrency,
  video: DEFAULT_GENERATION_LIMITS.videoGenerationConcurrency,
};

export function batchGenerationTargetIds(
  media: BatchGenerationMedia,
  nodeIds: string[],
  imageBatchSize: number,
): string[] {
  return media === 'image' ? nodeIds.slice(0, imageBatchSize) : nodeIds;
}

function batchGenerationConcurrency(
  media: BatchGenerationMedia,
  limits: GenerationLimitPreferences,
) {
  const mediaConcurrency =
    media === 'image' ? limits.imageGenerationConcurrency : limits.videoGenerationConcurrency;
  return Math.max(1, Math.min(limits.generationConcurrency, mediaConcurrency));
}

export function batchGenerationLabel(media: BatchGenerationMedia, count: number): string {
  const mediaLabel = media === 'image' ? '图片' : '视频';
  return `${count > 1 ? '批量' : ''}生成${mediaLabel}`;
}

/**
 * A node right-click keeps the whole selection only when the clicked node is
 * already part of a multi-selection. Right-clicking elsewhere remains a
 * single-node action and must not accidentally operate on a stale selection.
 */
export function resolveContextMenuNodeIds(nodes: FlowNode[], clickedNodeId: string): string[] {
  const clickedNode = nodes.find((node) => node.id === clickedNodeId);
  if (!clickedNode?.selected) return [clickedNodeId];

  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id);
  return selectedIds.length > 1 ? selectedIds : [clickedNodeId];
}

/** Classify selected generators from their declared graph contract. */
export function resolveMultiNodeGenerationTargets(
  nodes: FlowNode[],
  nodeIds: string[],
): MultiNodeGenerationTargets {
  const selectedIds = new Set(nodeIds);
  const targets: MultiNodeGenerationTargets = { imageIds: [], videoIds: [] };

  for (const node of nodes) {
    if (!selectedIds.has(node.id)) continue;
    const spec = getNodeSpec(node.data.kind);
    if (!spec.capabilities.includes('generate')) continue;
    const outputPort = resolveNodeOutputPort(node);
    if (outputPort && getNodeOutputValues(node, outputPort).length > 0) continue;

    const outputTypes = new Set(spec.outputs.map((port) => port.assetType));
    if (outputTypes.has('image')) targets.imageIds.push(node.id);
    if (outputTypes.has('video')) targets.videoIds.push(node.id);
  }

  return targets;
}

/**
 * Resolve the selected nodes that expose their normal generation action.
 * Unlike the media-only menu, this intentionally includes text and other
 * generators and allows an existing result to be regenerated.
 */
export function resolveContentGenerationTargetIds(nodes: FlowNode[], nodeIds: string[]): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const targetIds: string[] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node || !getNodeSpec(node.data.kind).capabilities.includes('generate')) continue;
    targetIds.push(nodeId);
  }

  return targetIds;
}

function contentGenerationMedia(node: FlowNode): ContentGenerationMedia {
  const outputTypes = new Set(getNodeSpec(node.data.kind).outputs.map((port) => port.assetType));
  if (outputTypes.has('video')) return 'video';
  if (outputTypes.has('image')) return 'image';
  return 'other';
}

function runnableContentGenerationTargetIds(
  nodes: FlowNode[],
  nodeIds: string[],
  limits: GenerationLimitPreferences,
): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  let imageCount = 0;

  return resolveContentGenerationTargetIds(nodes, nodeIds).filter((nodeId) => {
    const node = nodesById.get(nodeId);
    if (!node || node.data.generating === true) return false;
    if (contentGenerationMedia(node) !== 'image') return true;
    imageCount += 1;
    return imageCount <= limits.imageBatchSize;
  });
}

function contentGenerationConcurrency(
  nodes: FlowNode[],
  nodeIds: string[],
  limits: GenerationLimitPreferences,
): number {
  const targetIds = new Set(nodeIds);
  const media = new Set(
    nodes.filter((node) => targetIds.has(node.id)).map((node) => contentGenerationMedia(node)),
  );
  let concurrency = limits.generationConcurrency;
  if (media.has('image')) concurrency = Math.min(concurrency, limits.imageGenerationConcurrency);
  if (media.has('video')) concurrency = Math.min(concurrency, limits.videoGenerationConcurrency);
  return Math.max(1, concurrency);
}

async function runGenerationWorkers(
  nodeIds: string[],
  concurrency: number,
  generateNode: (nodeId: string) => Promise<void>,
): Promise<void> {
  const workerCount = Math.min(concurrency, nodeIds.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < nodeIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const nodeId = nodeIds[index];
      if (nodeId === undefined) return;
      try {
        await generateNode(nodeId);
      } catch {
        // The store records the error on that node. A failed item must not cancel
        // the rest of a batch selected by the user.
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

/** Run every selected node's normal generation action as one bounded batch. */
export async function runContentGenerationBatch(
  nodes: FlowNode[],
  nodeIds: string[],
  generateNode: (nodeId: string) => Promise<void>,
  limits: GenerationLimitPreferences = DEFAULT_GENERATION_LIMITS as GenerationLimitPreferences,
): Promise<void> {
  const runnableIds = runnableContentGenerationTargetIds(nodes, nodeIds, limits);
  await runGenerationWorkers(
    runnableIds,
    contentGenerationConcurrency(nodes, runnableIds, limits),
    generateNode,
  );
}

/** Run an independent batch with bounded concurrency and isolate per-node failures. */
export async function runNodeGenerationBatch(
  nodes: FlowNode[],
  nodeIds: string[],
  media: BatchGenerationMedia,
  generateNode: (nodeId: string) => Promise<void>,
  limits: GenerationLimitPreferences = DEFAULT_GENERATION_LIMITS as GenerationLimitPreferences,
): Promise<void> {
  const runnableIds = batchGenerationTargetIds(
    media,
    nodeIds.filter((nodeId) => nodes.find((node) => node.id === nodeId)?.data.generating !== true),
    limits.imageBatchSize,
  );
  await runGenerationWorkers(runnableIds, batchGenerationConcurrency(media, limits), generateNode);
}
