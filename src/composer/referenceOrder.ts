import type { ComposerReference } from './types';

export type ReferenceDropPlacement = 'before' | 'after';

/** Reorder one editable reference without splitting or crossing a locked reference bundle. */
export function reorderComposerReferences(
  references: readonly ComposerReference[],
  draggedId: string,
  targetId: string,
  placement: ReferenceDropPlacement,
): ComposerReference[] {
  const draggedIndex = references.findIndex((reference) => reference.id === draggedId);
  const targetIndex = references.findIndex((reference) => reference.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return [...references];
  if (references[draggedIndex]?.locked || references[targetIndex]?.locked) return [...references];

  const lower = Math.min(draggedIndex, targetIndex);
  const upper = Math.max(draggedIndex, targetIndex);
  if (references.slice(lower, upper + 1).some((reference) => reference.locked)) {
    return [...references];
  }

  const next = [...references];
  const [dragged] = next.splice(draggedIndex, 1);
  if (!dragged) return [...references];
  const remainingTargetIndex = next.findIndex((reference) => reference.id === targetId);
  next.splice(remainingTargetIndex + (placement === 'after' ? 1 : 0), 0, dragged);
  return next;
}
