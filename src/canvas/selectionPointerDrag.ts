export function isActiveSelectionDragPointer(
  activePointerId: number | null,
  eventPointerId: number,
): boolean {
  return activePointerId !== null && activePointerId === eventPointerId;
}
