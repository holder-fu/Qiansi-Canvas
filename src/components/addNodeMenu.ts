import type { NodeKind } from '../canvas/nodeTypes';
import { getNodeSpec } from '../graph/nodeSpecs';
import { portCompatible } from '../graph/graph';
import type { AssetType } from '../graph/types';

/**
 * Audio nodes are also standalone upload/recording sources. Keep that creation
 * entry available when a dragged source cannot connect to audio; the shared
 * add-node path will create the node and safely omit the incompatible edge.
 */
export function shouldShowAddNodeMenuItem(
  kind: NodeKind,
  allowed: ReadonlySet<NodeKind>,
  sourceAssetType?: AssetType,
): boolean {
  if (!allowed.has(kind)) return false;
  if (!sourceAssetType || kind === 'audio') return true;
  return getNodeSpec(kind).inputs.some((input) => portCompatible(sourceAssetType, input.assetType));
}
