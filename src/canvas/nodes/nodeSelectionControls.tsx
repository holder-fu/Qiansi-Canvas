import type { ReactNode } from 'react';
import { SelectedNodeCountContext } from './nodeSelectionState';

export function NodeSelectionControlsProvider({
  selectedCount,
  children,
}: {
  selectedCount: number;
  children: ReactNode;
}) {
  return (
    <SelectedNodeCountContext.Provider value={selectedCount}>
      {children}
    </SelectedNodeCountContext.Provider>
  );
}
