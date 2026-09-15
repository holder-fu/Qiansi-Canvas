type SelectAllKeyboardEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'isComposing' | 'key' | 'metaKey' | 'repeat' | 'shiftKey'
>;

type ShortcutTarget = {
  closest?: (selectors: string) => unknown;
  isContentEditable?: boolean;
  tagName?: string;
};

export function isSelectAllCanvasNodesShortcut(event: SelectAllKeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.repeat &&
    event.key.toLowerCase() === 'a'
  );
}

export function isTextEditingShortcutTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as ShortcutTarget;
  const tagName = candidate.tagName?.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (candidate.isContentEditable) return true;
  return Boolean(
    candidate.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}
