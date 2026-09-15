import type { FlowNode, NodeKind } from '../canvas/nodeTypes';

export function composerPromptValue(node: FlowNode): string {
  const value = node.data.kind === 'text' ? node.data.textInstruction : node.data.prompt;
  return typeof value === 'string' ? value : '';
}

export function composerPromptPatch(
  kind: NodeKind,
  prompt: string,
): Pick<FlowNode['data'], 'prompt' | 'textInstruction'> {
  const value = prompt || undefined;
  return kind === 'text' ? { textInstruction: value } : { prompt: value };
}
