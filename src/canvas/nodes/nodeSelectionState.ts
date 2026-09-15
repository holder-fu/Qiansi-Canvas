import { createContext, useContext } from 'react';

type SelectableNode = { selected?: boolean };

export const SelectedNodeCountContext = createContext(1);

export function countSelectedNodes(nodes: readonly SelectableNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.selected) count += 1;
  }
  return count;
}

export function shouldShowSingleNodeControls(selected: boolean, selectedCount: number): boolean {
  return selected && selectedCount === 1;
}

export function useSingleNodeControls(selected: boolean): boolean {
  return shouldShowSingleNodeControls(selected, useContext(SelectedNodeCountContext));
}
