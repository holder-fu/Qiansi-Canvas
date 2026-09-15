import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import { getNodeSpec } from '../graph/nodeSpecs';

/** Image actions are available for every node that can emit an image reference. */
export function supportsImageContextActions(kind: NodeKind): boolean {
  return getNodeSpec(kind).outputs.some(
    (output) => output.assetType === 'image' || output.assetType === 'reference',
  );
}

/** The editor additionally needs a concrete raster source, not only image output capability. */
export function supportsImageEditing(node: FlowNode | undefined): boolean {
  return Boolean(
    node &&
    supportsImageContextActions(node.data.kind) &&
    (node.data.imageUrl || node.data.images?.[0]),
  );
}
