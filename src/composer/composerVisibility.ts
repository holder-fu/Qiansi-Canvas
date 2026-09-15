import { isDirectorNodeKind, NODE_KIND_META, type FlowNode } from '../canvas/nodeTypes';

export function singleSelectedNodeForComposer(nodes: readonly FlowNode[]): FlowNode | null {
  let selected: FlowNode | null = null;
  for (const node of nodes) {
    if (!node.selected) continue;
    if (selected) return null;
    selected = node;
  }
  return selected;
}

export function multiSelectedNodesForComposer(nodes: readonly FlowNode[]): FlowNode[] {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length < 2) return [];
  return selected.every(
    (node) =>
      node.type !== 'group' &&
      !isDirectorNodeKind(node.data.kind) &&
      NODE_KIND_META[node.data.kind]?.isGenerator === true,
  )
    ? selected
    : [];
}

export function canShowFloatingComposer(
  node: FlowNode,
  hasIncomingConnection: boolean,
  trimEditing = false,
) {
  const generatedText = String(
    node.data.outputText || (!node.data.generationError && node.data.result) || '',
  ).trim();
  const ownText =
    hasIncomingConnection && node.data.textContentRole !== 'source'
      ? ''
      : String(node.data.prompt || '').trim();
  const textNodeHasContent = node.data.kind === 'text' && Boolean(generatedText || ownText);
  // Older uploads predate referenceOnly. A named source image with no generation
  // model or incoming task connection must not become an in-place generation target.
  const legacyUploadedImage =
    node.data.kind === 'image' &&
    !hasIncomingConnection &&
    Boolean(node.data.imageFileName?.trim()) &&
    Boolean(node.data.originalUrl || node.data.imageUrl || node.data.images?.length) &&
    !node.data.model &&
    !node.data.generating &&
    !node.data.generationRequestId;

  return (
    !trimEditing &&
    node.type !== 'group' &&
    !isDirectorNodeKind(node.data.kind) &&
    NODE_KIND_META[node.data.kind]?.isGenerator === true &&
    node.data.referenceOnly !== true &&
    !legacyUploadedImage &&
    !node.data.capturedFromVideoId &&
    !textNodeHasContent &&
    (node.data.kind !== 'video' || hasIncomingConnection)
  );
}
