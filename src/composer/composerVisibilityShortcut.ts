export type ComposerVisibilityShortcutAction = 'collapse' | 'expand';

type ComposerVisibilityKeyboardEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'isComposing' | 'key' | 'metaKey' | 'repeat' | 'shiftKey'
>;

export function composerVisibilityShortcutAction(
  event: ComposerVisibilityKeyboardEvent,
): ComposerVisibilityShortcutAction | null {
  if (
    !event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    event.repeat
  ) {
    return null;
  }

  if (event.key === 'ArrowUp') return 'collapse';
  if (event.key === 'ArrowDown') return 'expand';
  return null;
}
