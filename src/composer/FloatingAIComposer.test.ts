import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from '../components/shortcutGroups';
import type { FlowNode, NodeKind } from '../canvas/nodeTypes';
import source from './FloatingAIComposer.tsx?raw';
import { composerVisibilityShortcutAction } from './composerVisibilityShortcut';
import { canShowFloatingComposer, multiSelectedNodesForComposer } from './composerVisibility';

function shortcut(overrides: Partial<Parameters<typeof composerVisibilityShortcutAction>[0]> = {}) {
  return {
    key: 'ArrowUp',
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...overrides,
  };
}

function selectedNode(id: string, kind: NodeKind, data: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    selected: true,
    data: { kind, title: id, ...data },
  } as FlowNode;
}

describe('FloatingAIComposer generating state', () => {
  it('derives generating node ids without writing state from a selected-node effect', () => {
    expect(source).toContain('const generatingIds = useMemo(() => {');
    expect(source).toContain('if (node.data.generating) ids.add(node.id)');
    expect(source).not.toContain('setGeneratingIds');
  });
});

describe('uploaded image composer visibility', () => {
  it('hides uploaded reference sources regardless of their connections', () => {
    const source = selectedNode('upload', 'image', {
      originalUrl: '/asset-library/files/upload',
      referenceOnly: true,
    });
    expect(canShowFloatingComposer(source, false)).toBe(false);
    expect(canShowFloatingComposer(source, true)).toBe(false);
  });

  it('hides legacy filename-bearing uploads even when they have a saved prompt', () => {
    const source = selectedNode('old-upload', 'image', {
      imageFileName: 'void-priest-2k.png',
      imageUrl: '/asset-library/files/upload',
      prompt: '此前误填的提示词',
    });
    expect(canShowFloatingComposer(source, false)).toBe(false);
    expect(canShowFloatingComposer(JSON.parse(JSON.stringify(source)), false)).toBe(false);
  });

  it('retains blank image tasks and generated/connected image task composers', () => {
    expect(canShowFloatingComposer(selectedNode('empty', 'image'), false)).toBe(true);
    const generated = selectedNode('generated', 'image', {
      imageUrl: '/asset-library/files/generated',
      imageFileName: 'renamed.png',
      model: 'image-model',
    });
    expect(canShowFloatingComposer(generated, false)).toBe(true);
    expect(canShowFloatingComposer(generated, true)).toBe(true);
  });
});

describe('FloatingAIComposer video-remake preview', () => {
  it('forwards timeline scrub time to the selected video node', () => {
    expect(source).toContain(
      'const previewVideoRemakeFrame = useVideoEditingUi((state) => state.previewVideoRemakeFrame);',
    );
    expect(source).toContain('previewVideoRemakeFrame(selectedPrimaryNodeId, time);');
    expect(source).toContain('onPreviewTimeChange={handleRemakePreviewTimeChange}');
  });
});

describe('FloatingAIComposer visibility shortcuts', () => {
  it('maps Ctrl+ArrowUp and Ctrl+ArrowDown to collapse and expand', () => {
    expect(composerVisibilityShortcutAction(shortcut())).toBe('collapse');
    expect(composerVisibilityShortcutAction(shortcut({ key: 'ArrowDown' }))).toBe('expand');
  });

  it('does not claim unrelated, modified, repeated or composing key events', () => {
    expect(composerVisibilityShortcutAction(shortcut({ key: 'ArrowLeft' }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ ctrlKey: false }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ metaKey: true }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ altKey: true }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ shiftKey: true }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ repeat: true }))).toBeNull();
    expect(composerVisibilityShortcutAction(shortcut({ isComposing: true }))).toBeNull();
  });

  it('wires the shortcut to single or compatible multi-selection and documents both keys', () => {
    expect(source).toContain(
      'if (!visibilityShortcutAvailable || !editingShortcutsEnabled || openModal !== null) return;',
    );
    expect(source).toContain('multiSelected.length > 1 && viewMatchesSelection && !collapsed');
    expect(source).toContain('const action = composerVisibilityShortcutAction(event);');
    expect(source).toContain("collapsed: action === 'collapse'");

    const items = SHORTCUT_GROUPS.flatMap((group) => group.items);
    expect(items.find((item) => item.id === 'collapseComposer')).toEqual({
      id: 'collapseComposer',
      action: '收起指令框（单选 / 多选共享）',
      keys: ['Ctrl', '↑'],
    });
    expect(items.find((item) => item.id === 'expandComposer')).toEqual({
      id: 'expandComposer',
      action: '展开指令框（单选 / 多选共享）',
      keys: ['Ctrl', '↓'],
    });
  });
});

describe('FloatingAIComposer multi-selection gate', () => {
  it('accepts multiple selected generator nodes, including text that already has content', () => {
    const selected = [
      selectedNode('image', 'image'),
      selectedNode('views', 'views'),
      selectedNode('prompt', 'text', { outputText: '角色设定' }),
    ];

    expect(multiSelectedNodesForComposer(selected)).toEqual(selected);
  });

  it('fails closed when any selected item is not a generator target', () => {
    expect(
      multiSelectedNodesForComposer([
        selectedNode('image', 'image'),
        selectedNode('group', 'group'),
      ]),
    ).toEqual([]);
    expect(
      multiSelectedNodesForComposer([
        selectedNode('image', 'image'),
        selectedNode('director', 'director-2d'),
      ]),
    ).toEqual([]);
  });

  it('does not turn a single selection into the multi-selection path', () => {
    expect(multiSelectedNodesForComposer([selectedNode('image', 'image')])).toEqual([]);
  });
});
