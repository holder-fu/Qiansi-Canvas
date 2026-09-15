import type { FlowNode } from '../canvas/nodeTypes';
import { outputAssetType } from '../graph/nodeSpecs';
import { nodeToReferences } from './referenceResolution';
import type { ComposerReference } from './types';

/** Resolve the primary durable media output that can be picked from the canvas. */
export function pickableCanvasMediaReference(
  node: Pick<FlowNode, 'id' | 'data'>,
): ComposerReference | null {
  const assetType = outputAssetType(node.data.kind);
  const referenceType = assetType === 'reference' ? 'image' : assetType;
  if (referenceType !== 'image' && referenceType !== 'video' && referenceType !== 'audio') {
    return null;
  }

  return (
    nodeToReferences(node).find(
      (reference) => reference.type === referenceType && Boolean(reference.url?.trim()),
    ) ?? null
  );
}
