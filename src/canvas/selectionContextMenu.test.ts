import { describe, expect, it } from 'vitest';
import {
  selectedNodeIdAtContextTarget,
  shouldCaptureSelectionContextMenu,
} from './selectionContextMenu';

function target(matches: readonly string[], nodeId?: string) {
  return {
    closest(selectors: string) {
      if (!matches.some((selector) => selectors.split(', ').includes(selector))) return null;
      return selectors === '.react-flow__node'
        ? { getAttribute: (name: string) => (name === 'data-id' ? (nodeId ?? null) : null) }
        : {};
    },
  };
}

describe('multi-selection context-menu surface', () => {
  it('captures the React Flow pane and its multi-selection overlay', () => {
    expect(shouldCaptureSelectionContextMenu(target(['.react-flow']))).toBe(true);
  });

  it.each([
    '.react-flow__edge',
    '.react-flow__handle',
    '.react-flow__minimap',
    '.react-flow__controls',
  ])('preserves the dedicated interaction for %s', (selector) => {
    expect(shouldCaptureSelectionContextMenu(target(['.react-flow', selector]))).toBe(false);
  });

  it('ignores UI outside React Flow and non-element targets', () => {
    expect(shouldCaptureSelectionContextMenu(target([]))).toBe(false);
    expect(shouldCaptureSelectionContextMenu(null)).toBe(false);
  });

  it('captures selected-node surfaces while exposing their node id to the caller', () => {
    const selectedNode = target(['.react-flow', '.react-flow__node'], 'image-2');

    expect(shouldCaptureSelectionContextMenu(selectedNode)).toBe(true);
    expect(selectedNodeIdAtContextTarget(selectedNode)).toBe('image-2');
    expect(selectedNodeIdAtContextTarget(target(['.react-flow']))).toBeNull();
  });
});
