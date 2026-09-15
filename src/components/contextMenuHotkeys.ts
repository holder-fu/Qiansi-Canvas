export type ContextMenuHotkey = 'c' | 'd' | 'e';

export function resolveContextMenuHotkey(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'repeat'>,
): ContextMenuHotkey | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat)
    return null;
  const key = event.key.toLowerCase();
  return key === 'c' || key === 'd' || key === 'e' ? key : null;
}
