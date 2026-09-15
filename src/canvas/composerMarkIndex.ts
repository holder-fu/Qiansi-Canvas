import type { FlowNode, VisualMark } from './nodeTypes';

let indexedNodes: FlowNode[] | undefined;
let indexedMarks = new Map<string, VisualMark[]>();

function sameMarks(left: VisualMark[] | undefined, right: VisualMark[]) {
  return Boolean(
    left && left.length === right.length && left.every((mark, index) => mark === right[index]),
  );
}

/** Build the source-mark index once per immutable nodes array, not once per media node. */
export function composerMarksForSource(nodes: FlowNode[], sourceNodeId: string) {
  if (nodes !== indexedNodes) {
    const next = new Map<string, VisualMark[]>();
    for (const node of nodes) {
      if (!Array.isArray(node.data.composerMarks)) continue;
      for (const mark of node.data.composerMarks) {
        const marks = next.get(mark.sourceNodeId);
        if (marks) marks.push(mark);
        else next.set(mark.sourceNodeId, [mark]);
      }
    }
    for (const [id, marks] of next) {
      const previous = indexedMarks.get(id);
      if (sameMarks(previous, marks) && previous) next.set(id, previous);
    }
    indexedNodes = nodes;
    indexedMarks = next;
  }
  return indexedMarks.get(sourceNodeId) ?? EMPTY_MARKS;
}

const EMPTY_MARKS: VisualMark[] = [];
