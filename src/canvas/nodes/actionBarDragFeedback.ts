import type { DragEvent } from 'react';

export type ActionBarDropGroup = 'primary' | 'overflow';
export type ActionBarDropSide = 'before' | 'after';

export type ActionBarDropTarget = {
  group: ActionBarDropGroup;
  itemId: string | null;
  side: ActionBarDropSide;
};

export const ACTION_BAR_ACTIVE_DROP_ZONE_CLASS =
  'border-cyan-300/65 bg-cyan-300/[0.08] ring-2 ring-cyan-300/30 shadow-[0_12px_35px_rgba(34,211,238,0.16)]';

export function actionBarDropTargetFromPointer(
  group: ActionBarDropGroup,
  itemId: string | null,
  clientX: number,
  bounds: Pick<DOMRect, 'left' | 'width'>,
): ActionBarDropTarget {
  return {
    group,
    itemId,
    side: itemId && clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
  };
}

export function sameActionBarDropTarget(
  left: ActionBarDropTarget | null,
  right: ActionBarDropTarget | null,
) {
  return (
    left === right ||
    (left?.group === right?.group && left?.itemId === right?.itemId && left?.side === right?.side)
  );
}

export function resolveActionBarInsertionBeforeId<T extends string>(
  orderedIds: T[],
  sourceId: T,
  target: ActionBarDropTarget,
): T | undefined {
  if (!target.itemId) return undefined;
  if (target.itemId === sourceId) return sourceId;
  const remainingIds = orderedIds.filter((id) => id !== sourceId);
  const targetIndex = remainingIds.indexOf(target.itemId as T);
  if (targetIndex < 0) return undefined;
  if (target.side === 'before') return remainingIds[targetIndex];
  return remainingIds[targetIndex + 1];
}

export function setActionBarDragPreview(dataTransfer: DataTransfer, label: string) {
  if (typeof document === 'undefined') return;
  const preview = document.createElement('div');
  preview.setAttribute('data-action-bar-drag-preview', 'true');
  preview.textContent = `⋮⋮  ${label}`;
  Object.assign(preview.style, {
    position: 'fixed',
    left: '-10000px',
    top: '-10000px',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    minHeight: '34px',
    maxWidth: '240px',
    padding: '0 12px',
    border: '1px solid rgba(103, 232, 249, 0.72)',
    borderRadius: '10px',
    background: 'rgba(18, 36, 42, 0.97)',
    color: '#cffafe',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.55)',
  });
  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, 22, 17);
  const removePreview = () => preview.remove();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(removePreview);
  else window.setTimeout(removePreview, 0);
}

export function updateActionBarDropTarget(
  event: DragEvent<HTMLElement>,
  group: ActionBarDropGroup,
  itemId: string | null,
  setTarget: (target: ActionBarDropTarget) => void,
) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const bounds = event.currentTarget.getBoundingClientRect();
  setTarget(actionBarDropTargetFromPointer(group, itemId, event.clientX, bounds));
}
