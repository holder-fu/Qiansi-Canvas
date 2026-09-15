import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import { SHORTCUT_GROUPS } from '../components/shortcutGroups';
import {
  isSelectAllCanvasNodesShortcut,
  isTextEditingShortcutTarget,
} from './canvasEditingShortcuts';

function shortcut(overrides: Partial<Parameters<typeof isSelectAllCanvasNodesShortcut>[0]> = {}) {
  return {
    key: 'a',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...overrides,
  };
}

describe('canvas select-all shortcut', () => {
  it('accepts Ctrl+A and Command+A', () => {
    expect(isSelectAllCanvasNodesShortcut(shortcut())).toBe(true);
    expect(
      isSelectAllCanvasNodesShortcut(shortcut({ ctrlKey: false, metaKey: true, key: 'A' })),
    ).toBe(true);
  });

  it('does not claim modified, repeated, composing or plain A events', () => {
    expect(isSelectAllCanvasNodesShortcut(shortcut({ altKey: true }))).toBe(false);
    expect(isSelectAllCanvasNodesShortcut(shortcut({ shiftKey: true }))).toBe(false);
    expect(isSelectAllCanvasNodesShortcut(shortcut({ repeat: true }))).toBe(false);
    expect(isSelectAllCanvasNodesShortcut(shortcut({ isComposing: true }))).toBe(false);
    expect(isSelectAllCanvasNodesShortcut(shortcut({ ctrlKey: false }))).toBe(false);
  });

  it('preserves native text selection in editors and form controls', () => {
    expect(isTextEditingShortcutTarget({ tagName: 'input' })).toBe(true);
    expect(isTextEditingShortcutTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEditingShortcutTarget({ tagName: 'select' })).toBe(true);
    expect(isTextEditingShortcutTarget({ isContentEditable: true })).toBe(true);
    expect(isTextEditingShortcutTarget({ closest: () => ({}) })).toBe(true);
    expect(isTextEditingShortcutTarget({ tagName: 'DIV', closest: () => null })).toBe(false);
  });

  it('wires the shortcut to the canvas action and documents it in the shortcut panel', () => {
    expect(appSource).toContain('isSelectAllCanvasNodesShortcut(e)');
    expect(appSource).toContain('selectAllNodes();');
    expect(
      SHORTCUT_GROUPS.flatMap((group) => group.items).find((item) => item.id === 'selectAllNodes'),
    ).toEqual({ id: 'selectAllNodes', action: '全选画布节点', keys: ['Ctrl/⌘', 'A'] });
  });
});
