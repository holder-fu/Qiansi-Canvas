import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import { getNodeOutputValues, resolveNodeOutputPort } from '../graph/graph';
import type { AssetType } from '../graph/types';

export const SELECTION_CONNECT_TARGET_KINDS = [
  'text',
  'image',
  'video',
  'video-comp',
  'script',
] as const satisfies readonly NodeKind[];

export type SelectionConnectTargetKind = (typeof SELECTION_CONNECT_TARGET_KINDS)[number];

export const INDEPENDENT_SELECTION_CONNECT_TARGET_KINDS = [
  'text',
  'image',
] as const satisfies readonly NodeKind[];

export type IndependentSelectionConnectTargetKind =
  (typeof INDEPENDENT_SELECTION_CONNECT_TARGET_KINDS)[number];

export type IndependentSelectionConnectionPlan = {
  sourceId: string;
  sourceHandle: string | null;
  targetKind: IndependentSelectionConnectTargetKind;
};

type SourceSummary = {
  types: AssetType[];
  units: Record<AssetType, number>;
};

const EMPTY_UNITS: Record<AssetType, number> = {
  image: 0,
  video: 0,
  audio: 0,
  text: 0,
  reference: 0,
  any: 0,
};

function summarizeSources(selected: FlowNode[]): SourceSummary {
  return selected.reduce<SourceSummary>(
    (summary, node) => {
      const port = resolveNodeOutputPort(node);
      if (!port) {
        summary.types.push('any');
        summary.units.any += 1;
        return summary;
      }
      summary.types.push(port.assetType);
      summary.units[port.assetType] += Math.max(1, getNodeOutputValues(node, port).length);
      return summary;
    },
    { types: [], units: { ...EMPTY_UNITS } },
  );
}

function everyType(types: AssetType[], supported: readonly AssetType[]) {
  return types.length > 0 && types.every((type) => supported.includes(type));
}

function targetConsumesEverySource(
  target: SelectionConnectTargetKind,
  summary: SourceSummary,
): boolean {
  const { types, units } = summary;
  const imageReferences = units.image + units.reference;

  switch (target) {
    case 'text':
      return (
        everyType(types, ['text', 'image', 'reference', 'video']) &&
        units.video <= 5 &&
        !(imageReferences > 0 && units.video > 0)
      );
    case 'image':
      // Although image nodes retain a legacy video-frame input port, image generation does not
      // currently sample that video. Do not advertise a connection that would be silently ignored.
      return everyType(types, ['text', 'image', 'reference']);
    case 'video':
      return (
        everyType(types, ['text', 'image', 'reference', 'video', 'audio']) &&
        units.video <= 1 &&
        units.audio <= 1
      );
    case 'video-comp':
      return everyType(types, ['video', 'audio']) && units.video >= 1 && units.audio <= 1;
    case 'script':
      return everyType(types, ['text']);
  }
}

/**
 * Targets shown after dragging a multi-selection to empty canvas.
 *
 * A target is exposed only when every selected source can be consumed by the real downstream
 * execution path. The upload-only audio node is intentionally absent: merely connecting a video
 * to a blank audio node does not run the existing explicit audio-extraction workflow.
 */
export function resolveSelectionConnectTargetKinds(
  selected: FlowNode[],
): SelectionConnectTargetKind[] {
  if (selected.length < 2) return [];
  const summary = summarizeSources(selected);
  return SELECTION_CONNECT_TARGET_KINDS.filter((target) =>
    targetConsumesEverySource(target, summary),
  );
}

/**
 * Targets that can be created once per selected source without dropping any source node.
 *
 * This is intentionally stricter than the shared-target flow: every source must be compatible
 * with its own new target, otherwise the whole menu command is unavailable and cannot leave a
 * partially connected batch behind.
 */
export function resolveIndependentSelectionConnectTargetKinds(
  selected: FlowNode[],
): IndependentSelectionConnectTargetKind[] {
  if (selected.length < 2) return [];
  const sourceSummaries = selected.map((node) => summarizeSources([node]));
  return INDEPENDENT_SELECTION_CONNECT_TARGET_KINDS.filter((target) =>
    sourceSummaries.every((summary) => targetConsumesEverySource(target, summary)),
  );
}

/** Build one explicit source-to-new-target command for every selected node. */
export function planIndependentSelectionConnections(
  selected: FlowNode[],
  targetKind: IndependentSelectionConnectTargetKind,
): IndependentSelectionConnectionPlan[] {
  if (!resolveIndependentSelectionConnectTargetKinds(selected).includes(targetKind)) return [];
  return selected.map((source) => ({
    sourceId: source.id,
    sourceHandle: resolveNodeOutputPort(source)?.id ?? null,
    targetKind,
  }));
}

/** Execute a previously validated all-or-nothing independent connection plan. */
export function executeIndependentSelectionConnectionPlans(
  plans: IndependentSelectionConnectionPlan[],
  createTarget: (plan: IndependentSelectionConnectionPlan) => void,
): number {
  for (const plan of plans) createTarget(plan);
  return plans.length;
}
