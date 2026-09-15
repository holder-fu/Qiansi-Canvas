import { describe, expect, it } from 'vitest';
import source from './FlowCanvas.tsx?raw';
import projectionSource from './renderedNodes.ts?raw';

describe('canvas delete shortcut isolation', () => {
  it('disables React Flow deletion while any modal owns keyboard focus', () => {
    expect(source).toContain('const openModal = useCanvasStore((s) => s.openModal)');
    expect(source).toContain(
      'const deleteConfirmOpen = useCanvasStore((s) => s.deleteConfirm !== null)',
    );
    expect(source).toContain('deleteShortcutEnabled && openModal === null && !deleteConfirmOpen');
  });

  it('supports the platform modifier key for direct and rectangle multi-selection', () => {
    expect(source).toContain("multiSelectionKeyCode={['Control', 'Meta']}");
    expect(source).toContain("selectionKeyCode={['Control', 'Meta']}");
  });

  it('turns held Space into a temporary pan tool even over dense node areas', () => {
    expect(source).toContain("const temporaryPanActive = useKeyPress('Space')");
    expect(source).toContain('panActivationKeyCode="Space"');
    expect(source).toContain('nodesDraggable={!temporaryPanActive}');
    expect(source).toContain('elementsSelectable={!temporaryPanActive}');
  });

  it('accelerates ordinary and Alt-copy node drags while Shift is held', () => {
    expect(source).toContain('advanceNodeDragAcceleration(');
    expect(source).toContain('compensateViewportForAcceleratedDrag(');
    expect(source).toContain('shiftPressedRef.current');
    expect(source).toContain('ev.shiftKey');
    expect(source).toContain('draggedNodes.length ? draggedNodes : [node]');
  });
});

describe('canvas node and edge layering', () => {
  it('keeps committed edges below ordinary nodes even while nodes or edges are selected', () => {
    expect(source).toContain('const EDGE_Z_INDEX = 0');
    expect(projectionSource).toContain('const NODE_Z_INDEX = 1');
    expect(source).toContain('zIndex: EDGE_Z_INDEX');
    expect(source).toContain('zIndexMode="manual"');
    expect(source).toContain('elevateNodesOnSelect={false}');
    expect(source).toContain('elevateEdgesOnSelect={false}');
    expect(source).not.toContain('SELECTED_EDGE_Z_INDEX');
  });
});

describe('canvas entry viewport', () => {
  it('fits restored project nodes only after React Flow has measured them', () => {
    expect(source).toContain('const nodesInitialized = useNodesInitialized()');
    expect(source).toContain('const scope = `${activeProjectId}\\u0000${workspace}`');
    expect(source).toContain('if (nodes.length > 0 && !nodesInitialized) return');
    expect(source).toContain('padding: 0.3');
    expect(source).toContain('duration: 400');
    expect(source).toContain('initializedViewportScopeRef.current = scope');
    expect(source).toContain('minZoom: initialViewportZoom');
  });

  it('keeps the default zoom only for a genuinely empty project', () => {
    expect(source).toContain('if (nodes.length > 0)');
    expect(source).toContain('zoom: initialViewportZoom ?? defaultZoom');
    expect(source).not.toContain('}, [defaultZoom, workspace, setViewport]);');
  });
});
