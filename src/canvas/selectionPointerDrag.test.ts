import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contextMenuViewportPlacement } from '../components/contextMenuPosition';
import { isActiveSelectionDragPointer } from './selectionPointerDrag';

const selectionOverlaySource = readFileSync(
  new URL('./SelectionOverlay.tsx', import.meta.url),
  'utf8',
);

describe('selection overlay pointer drag', () => {
  it('accepts movement and completion only from the pointer that started the drag', () => {
    expect(isActiveSelectionDragPointer(17, 17)).toBe(true);
    expect(isActiveSelectionDragPointer(17, 18)).toBe(false);
    expect(isActiveSelectionDragPointer(null, 17)).toBe(false);
  });

  it('uses pointer lifecycle events and keeps touch gestures owned by the handle', () => {
    expect(selectionOverlaySource).toContain('onPointerDown={startDrag}');
    expect(selectionOverlaySource).toContain("window.addEventListener('pointermove', onMove)");
    expect(selectionOverlaySource).toContain("window.addEventListener('pointerup', onUp)");
    expect(selectionOverlaySource).toContain("window.addEventListener('pointercancel', onCancel)");
    expect(selectionOverlaySource).toContain("touchAction: 'none'");
    expect(selectionOverlaySource).toContain('onPointerDown={(e) => e.stopPropagation()}');
    expect(selectionOverlaySource).toContain(
      "aria-label={t('selectionOverlay.dragReference', '拖拽引用选中节点到目标')}",
    );
    expect(
      selectionOverlaySource.match(
        /isActiveSelectionDragPointer\(activePointerIdRef\.current, e\.pointerId\)/g,
      ),
    ).toHaveLength(3);
    expect(selectionOverlaySource).not.toContain("window.addEventListener('mousemove'");
    expect(selectionOverlaySource).not.toContain("window.addEventListener('mouseup'");
  });

  it('retains one history transaction for each compound multi-node connection', () => {
    expect(selectionOverlaySource.match(/runCanvasHistoryTransaction\(\(\) => \{/g)).toHaveLength(
      2,
    );
  });

  it('keeps the create menu inside an extremely short viewport', () => {
    const placement = contextMenuViewportPlacement({ x: 160, y: 31 }, { width: 320, height: 32 });

    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top).toBeLessThanOrEqual(24);
    expect(placement.maxHeight).toBeGreaterThanOrEqual(0);
    expect(selectionOverlaySource).toContain('contextMenuViewportPlacement(');
    expect(selectionOverlaySource).not.toContain('window.innerHeight - 340');
  });
});
