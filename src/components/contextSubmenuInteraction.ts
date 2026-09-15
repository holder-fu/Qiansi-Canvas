type ContextSubmenuRegion = Pick<Node, 'contains'>;

export const CONTEXT_SUBMENU_POINTER_GRACE_MS = 200;

export function shouldDismissContextSubmenu(
  target: Node | null,
  activeTrigger: ContextSubmenuRegion | null,
  submenu: ContextSubmenuRegion | null,
): boolean {
  if (!target) return true;
  return !activeTrigger?.contains(target) && !submenu?.contains(target);
}
