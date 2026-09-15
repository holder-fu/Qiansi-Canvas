import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import { arrangeNodesInGrid } from '../canvas/gridArrangement';
import { WORKSPACES } from '../canvas/workspaces';
import { resolveImageComparisonSources } from '../lib/imageComparison';
import type { PluginCatalog } from '../services/pluginRegistry';
import { useCanvasStore } from '../store/canvasStore';
import { CanvasContextMenu } from './CanvasContextMenu';
import { shouldShowAddNodeMenuItem } from './addNodeMenu';
import { resolveContextMenuHotkey } from './contextMenuHotkeys';
import { CONTEXT_MENU_SURFACE_CLASS } from './contextMenuStyles';
import { pluginCanvasMenuDisplayLabel } from './pluginMenuLabel';
import canvasContextMenuSource from './CanvasContextMenu.tsx?raw';
import flowCanvasSource from '../canvas/FlowCanvas.tsx?raw';

const pluginRegistryTestState = vi.hoisted(() => ({
  catalog: null as PluginCatalog | null,
}));

vi.mock('../store/pluginRegistryStore', () => ({
  usePluginRegistryStore: (
    selector: (state: {
      catalog: PluginCatalog | null;
      loaded: boolean;
      loading: boolean;
      refresh: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      catalog: pluginRegistryTestState.catalog,
      loaded: true,
      loading: false,
      refresh: async () => {},
    }),
}));

const imageNode: FlowNode = {
  id: 'image-source',
  type: 'image',
  position: { x: 100, y: 100 },
  data: {
    kind: 'image',
    title: '已有图片',
    imageUrl: 'data:image/png;base64,source',
  },
};

const videoNode: FlowNode = {
  id: 'video-source',
  type: 'video',
  position: { x: 220, y: 100 },
  data: {
    kind: 'video',
    title: '已有视频',
    videoUrl: 'https://example.test/video.mp4',
  },
};

const emptyPluginCatalog: PluginCatalog = {
  directory: 'data/plugins',
  backupDirectory: 'data/extension-backups/plugins',
  plugins: [],
  backups: [],
  errors: [],
  mode: 'sandboxed-runtime',
};

const pluginWithCanvasMenus = {
  compatible: true,
  enabled: true,
  directory: 'data/plugins/test-studio',
  security: {
    sandboxed: true,
    networkAccess: false,
    fileSystemAccess: false,
    secretsAccess: false,
  },
  manifest: {
    schemaVersion: 2,
    id: 'test-studio',
    name: '测试插件',
    version: '1.0.0',
    author: '',
    description: '',
    engine: { qiansiCanvas: '>=0.1.0-beta.1' },
    permissions: [],
    assets: [],
    contributes: {
      nodes: [],
      widgets: [],
      panels: [],
      menus: [
        {
          id: 'open-test-studio',
          label: '打开测试工作台',
          location: 'canvas',
          action: { type: 'open-panel', panelId: 'test-panel' },
        },
      ],
      locales: [],
      audioGenerators: [],
    },
  },
} as PluginCatalog['plugins'][number];

function buttonMarkup(html: string, label: string): string {
  const labelIndex = html.indexOf(label);
  if (labelIndex < 0) return '';
  const start = html.lastIndexOf('<button', labelIndex);
  const end = html.indexOf('</button>', labelIndex);
  return start >= 0 && end >= 0 ? html.slice(start, end + '</button>'.length) : '';
}

describe('blank canvas context menu', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      workspace: 'home',
      nodes: [imageNode],
      edges: [],
      past: [],
      future: [],
      clipboard: null,
    });
    pluginRegistryTestState.catalog = emptyPluginCatalog;
  });

  it('hides the plugin submenu trigger without enabled canvas contributions', () => {
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: { x: 20, y: 20, flowX: 20, flowY: 20 },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );

    expect(buttonMarkup(html, '选择插件')).toBe('');
  });

  it('opens one flattened second-level plugin action menu below the director', () => {
    pluginRegistryTestState.catalog = {
      ...emptyPluginCatalog,
      plugins: [pluginWithCanvasMenus],
    };
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: { x: 20, y: 20, flowX: 20, flowY: 20 },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const pluginButton = buttonMarkup(html, '选择插件');

    expect(pluginButton).toContain('lucide-puzzle');
    expect(pluginButton).not.toContain('text-cyan-300');
    expect(pluginButton).toContain('lucide-chevron-right');
    expect(html).not.toContain('打开测试工作台');
    expect(html.indexOf('导演台')).toBeLessThan(html.indexOf('选择插件'));
    expect(html.indexOf('选择插件')).toBeLessThan(html.indexOf('添加资源'));
    expect(canvasContextMenuSource).toContain("| 'plugins'");
    expect(canvasContextMenuSource).toContain("renderMode === 'plugins'");
    expect(canvasContextMenuSource).toContain(
      "onClick={(event) => openSubmenuAt('plugins', event.currentTarget)}",
    );
    expect(canvasContextMenuSource).toContain(
      "onMouseEnter={(event) => openSubmenuAt('plugins', event.currentTarget)}",
    );
    expect(canvasContextMenuSource).not.toContain("| 'plugin-actions'");
    expect(canvasContextMenuSource).not.toContain("setMode('plugin-actions')");
    expect(canvasContextMenuSource).not.toContain(
      '<SectionTitle>{plugin.manifest.name}</SectionTitle>',
    );
    expect(canvasContextMenuSource).toContain('{pluginCanvasMenuDisplayLabel(entry.label)}');
    expect(canvasContextMenuSource).toContain(
      'onClick={() => handlePluginCanvasMenu(plugin.manifest.id, entry.id)}',
    );
    expect(canvasContextMenuSource).toContain('{renderMenuPanel(primaryMode)}');
    expect(canvasContextMenuSource).toContain('{renderMenuPanel(mode, submenuMaxHeight)}');
    expect(canvasContextMenuSource).toContain('data-testid="canvas-context-submenu"');
    expect(canvasContextMenuSource).toContain('contextMenuViewportPlacement');
    expect(canvasContextMenuSource).toContain('contextSubmenuViewportPlacement');
    expect(canvasContextMenuSource).toContain('style={{ top: effectiveSubmenuTop }}');
    expect(canvasContextMenuSource).not.toContain(
      'style={menuPlacement.openUpward ? { bottom: 0 }',
    );
    expect(canvasContextMenuSource).toContain('max-w-[calc(100vw-16px)]');
    expect(canvasContextMenuSource).not.toContain("t('context.directorHint'");
    expect(canvasContextMenuSource).not.toContain("t('context.workflow.textToImageHint'");
  });

  it('dismisses an open flyout after leaving its trigger, bridge, and submenu', () => {
    expect(canvasContextMenuSource).toContain('data-context-submenu-bridge="true"');
    expect(canvasContextMenuSource).toContain('const onCloseRef = useRef(onClose)');
    expect(canvasContextMenuSource).toContain('onCloseRef.current = onClose');
    expect(canvasContextMenuSource).toContain('}, [menu]);');
    expect(canvasContextMenuSource).not.toContain('}, [menu, onClose]);');
    expect(flowCanvasSource).toContain('const closeContextMenu = useCallback(() =>');
    expect(flowCanvasSource).toContain('onClose={closeContextMenu}');
    expect(canvasContextMenuSource).toContain('CONTEXT_SUBMENU_POINTER_GRACE_MS');
    expect(canvasContextMenuSource).toContain('scheduleSubmenuClose');
    expect(canvasContextMenuSource).toContain('cancelSubmenuClose');
    expect(canvasContextMenuSource).toContain('onPointerOver={handleSubmenuPointerOver}');
    expect(canvasContextMenuSource).toContain('onPointerLeave={scheduleSubmenuClose}');
    expect(canvasContextMenuSource).toContain('onFocusCapture={handleSubmenuFocusCapture}');
    expect(canvasContextMenuSource).toContain('shouldDismissContextSubmenu(');
  });

  it('removes redundant add and open verbs from plugin action labels', () => {
    expect(pluginCanvasMenuDisplayLabel('添加 3DGS 全景场景')).toBe('3DGS 全景场景');
    expect(pluginCanvasMenuDisplayLabel('打开 3DGS 全景工作台')).toBe('3DGS 全景工作台');
    expect(pluginCanvasMenuDisplayLabel('打开 Qiansi Audio Studio')).toBe('Qiansi Audio Studio');
    expect(pluginCanvasMenuDisplayLabel('Open Test Studio')).toBe('Test Studio');
    expect(pluginCanvasMenuDisplayLabel('打开方式')).toBe('打开方式');
  });

  it('keeps plugin nodes out of the add-node submenu', () => {
    expect(canvasContextMenuSource).not.toContain('const pluginNodeItems');
    expect(canvasContextMenuSource).toContain('const nodeItems = allNodeItems');
    expect(canvasContextMenuSource).toContain('onClick={() => handleAdd(item.kind)}');
  });

  it('keeps the legacy first-frame node out of the add-node submenu', () => {
    expect(canvasContextMenuSource).not.toContain("kind: 'front-frame'");
    expect(canvasContextMenuSource).not.toContain("labelKey: 'node.kind.frontFrame'");
  });

  it('removes the create-from-generator entry and its workflow submenu', () => {
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: { x: 20, y: 20, flowX: 20, flowY: 20 },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );

    expect(html).not.toContain('从生成器创建');
    expect(canvasContextMenuSource).not.toContain("| 'generator'");
    expect(canvasContextMenuSource).not.toContain("renderMode === 'generator'");
    expect(canvasContextMenuSource).not.toContain("openSubmenuAt('generator'");
    expect(canvasContextMenuSource).not.toContain('createWorkflowTemplate');
  });

  it('replaces the connected director submenu with a standalone audio-node entry', () => {
    const allowed = new Set(WORKSPACES.views.nodeKinds);

    expect(allowed.has('audio')).toBe(true);
    expect(shouldShowAddNodeMenuItem('audio', allowed, 'image')).toBe(true);
    expect(canvasContextMenuSource).toContain("kind: 'audio'");
    expect(canvasContextMenuSource).toContain("label: '音频'");
    expect(canvasContextMenuSource).not.toContain("label: '音频素材'");
    expect(canvasContextMenuSource).not.toContain("| 'director-connection-type'");
    expect(canvasContextMenuSource).not.toContain('canAddConnectedDirector');
    expect(canvasContextMenuSource).not.toContain('createConnectedDirectorStudio');
    expect(canvasContextMenuSource).toContain("renderMode === 'director-create-type'");
  });

  it('places image comparison last in the add-node submenu', () => {
    const start = canvasContextMenuSource.indexOf('const allNodeItems');
    const end = canvasContextMenuSource.indexOf('];', start);
    const nodeItemsSource = canvasContextMenuSource.slice(start, end);

    expect(nodeItemsSource.indexOf("kind: 'audio'")).toBeLessThan(
      nodeItemsSource.indexOf("kind: 'image-compare'"),
    );
    expect(nodeItemsSource.indexOf("kind: 'script'")).toBeLessThan(
      nodeItemsSource.indexOf("kind: 'image-compare'"),
    );
  });

  it('keeps save-to-assets disabled when the right-click has no content target', () => {
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: { x: 20, y: 20, flowX: 20, flowY: 20 },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const saveButton = buttonMarkup(html, '保存到我的资产');

    expect(saveButton).toContain('disabled=""');
    expect(saveButton).toContain('空白处没有可保存的内容');
  });

  it('accepts multiple local image, video, and audio files in one selection', () => {
    expect(canvasContextMenuSource).toContain('accept="image/*,video/*,audio/*,.weba,.m4a,.mov"');
    expect(canvasContextMenuSource).toContain('multiple');
    expect(canvasContextMenuSource).toContain('Array.from(e.target.files ?? [])');
    expect(canvasContextMenuSource).toContain(
      'planContextLocalMediaImports(selectedFiles, origin)',
    );
    expect(canvasContextMenuSource).toContain('for (const { file, kind, position } of files)');
    expect(canvasContextMenuSource).not.toContain('e.target.files?.[0]');
  });

  it.each([
    ['image', imageNode],
    ['video', videoNode],
  ] as const)('keeps only save as asset for %s nodes', (_kind, node) => {
    useCanvasStore.setState({ nodes: [node] });
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: { x: 20, y: 20, targetId: node.id },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );

    expect(html).toContain('保存为资产');
    expect(html).not.toContain('保存到素材库');
  });

  it('places Copy image directly above Edit for image nodes', () => {
    const copyItemIndex = canvasContextMenuSource.indexOf(
      'icon={<ClipboardCopy className="h-3.5 w-3.5" />}',
    );
    const editItemIndex = canvasContextMenuSource.indexOf(
      'icon={<Pencil className="h-3.5 w-3.5" />}',
      copyItemIndex,
    );

    expect(copyItemIndex).toBeGreaterThan(-1);
    expect(copyItemIndex).toBeLessThan(editItemIndex);
    expect(canvasContextMenuSource).toContain("t('context.copyImage', '复制图片')");
    expect(canvasContextMenuSource).toContain('onClick={handleCopyImage}');
    expect(canvasContextMenuSource).toContain('hotkey="c"');
    expect(canvasContextMenuSource).toContain('shortcut="C"');
    expect(canvasContextMenuSource).toContain('hotkey="e"');
    expect(canvasContextMenuSource).toContain('shortcut="E"');
    expect(canvasContextMenuSource).toContain('hotkey="d"');
    expect(canvasContextMenuSource).toContain('shortcut="D"');
  });

  it('keeps only duplicate and trash enabled for an effect reference node', () => {
    expect(canvasContextMenuSource).toContain(
      'targetNode?.data.effectPresetId || targetNode?.data.effectPreset',
    );
    expect(canvasContextMenuSource).toContain(
      "t('context.effectReferenceRestricted', '特效节点仅支持复制节点和移到回收站')",
    );
    expect(canvasContextMenuSource).toContain('disabled={isEffectReference || !hasPreviewMedia}');
    expect(canvasContextMenuSource).toContain(
      'disabled={isEffectReference || !copyImageSource || copyImageBusy}',
    );
    expect(canvasContextMenuSource).toContain('disabled={isEffectReference || !hasSubjectImage}');
    expect(canvasContextMenuSource).toContain(
      'isEffectReference || !hasSubjectImage || targetNode?.data.isSubject === true',
    );
    expect(canvasContextMenuSource).not.toContain(
      'disabled={isEffectReference}\n              shortcut',
    );
    expect(canvasContextMenuSource).not.toContain(
      'disabled={isEffectReference}\n              danger',
    );
  });

  it('keeps only video enabled when extending an effect connection', () => {
    expect(canvasContextMenuSource).toContain('const isEffectPendingConnection = Boolean(');
    expect(canvasContextMenuSource).toContain(
      "disabled: isEffectPendingConnection && item.kind !== 'video'",
    );
    expect(canvasContextMenuSource).toContain('特效只能连接到视频节点');
    expect(canvasContextMenuSource).toContain(
      "if (isEffectPendingConnection && kind !== 'video') return;",
    );
  });

  it.each([
    ['c', 'c'],
    ['C', 'c'],
    ['d', 'd'],
    ['D', 'd'],
    ['e', 'e'],
    ['E', 'e'],
  ] as const)('maps an unmodified %s key to its image-menu action', (key, expected) => {
    expect(
      resolveContextMenuHotkey({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        repeat: false,
      }),
    ).toBe(expected);
  });

  it.each([
    { key: 'c', ctrlKey: true },
    { key: 'c', metaKey: true },
    { key: 'e', altKey: true },
    { key: 'e', isComposing: true },
    { key: 'e', repeat: true },
    { key: 'x' },
  ] satisfies Array<
    { key: string } & Partial<
      Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'repeat'>
    >
  >)('does not claim modified, composing, repeated, or unrelated keys: $key', (override) => {
    expect(
      resolveContextMenuHotkey({
        key: override.key,
        altKey: override.altKey ?? false,
        ctrlKey: override.ctrlKey ?? false,
        metaKey: override.metaKey ?? false,
        isComposing: override.isComposing ?? false,
        repeat: override.repeat ?? false,
      }),
    ).toBeNull();
  });
});

describe('multi-selection arrangement menu', () => {
  beforeEach(() => {
    pluginRegistryTestState.catalog = emptyPluginCatalog;
    useCanvasStore.setState({
      workspace: 'home',
      nodes: [
        { ...imageNode, id: 'image-1', parentId: undefined, selected: true },
        {
          ...imageNode,
          id: 'image-2',
          parentId: undefined,
          selected: true,
          position: { x: 500, y: 100 },
        },
        {
          ...imageNode,
          id: 'image-3',
          parentId: undefined,
          selected: true,
          position: { x: 100, y: 500 },
        },
        {
          ...imageNode,
          id: 'image-4',
          parentId: undefined,
          selected: true,
          position: { x: 500, y: 500 },
        },
      ],
      edges: [],
      past: [],
      future: [],
    });
  });

  it('shows create-group above the grid-arrangement submenu for a multi-selection', () => {
    const targetIds = ['image-1', 'image-2', 'image-3', 'image-4'];
    expect(arrangeNodesInGrid(useCanvasStore.getState().nodes, targetIds, 2)).not.toBeNull();
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: {
          x: 220,
          y: 180,
          targetId: 'image-1',
          targetIds,
        },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const createGroupButton = buttonMarkup(html, '创建分组');
    const arrangeButton = buttonMarkup(html, '网格排列');

    expect(createGroupButton).toContain('lucide-group');
    expect(html.indexOf('创建分组')).toBeLessThan(html.indexOf('网格排列'));
    expect(arrangeButton).toContain('lucide-layout-grid');
    expect(arrangeButton).toContain('lucide-chevron-right');
    expect(canvasContextMenuSource).toContain("renderMode === 'arrange-grid'");
    expect(canvasContextMenuSource).toContain("openSubmenuAt('arrange-grid', event.currentTarget)");
    expect(canvasContextMenuSource).toContain('handleArrangeGrid(automaticColumns)');
  });

  it('shows independent text and image targets for every selected source', () => {
    const targetIds = ['image-1', 'image-2', 'image-3', 'image-4'];
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: {
          x: 220,
          y: 180,
          targetId: 'image-1',
          targetIds,
        },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const textButton = buttonMarkup(html, '独立文本节点');
    const imageButton = buttonMarkup(html, '独立图片节点');

    expect(textButton).toContain('lucide-type');
    expect(imageButton).toContain('lucide-image');
    expect(html.indexOf('网格排列')).toBeLessThan(html.indexOf('独立文本节点'));
    expect(html.indexOf('独立文本节点')).toBeLessThan(html.indexOf('独立图片节点'));
    expect(canvasContextMenuSource).toContain('runCanvasHistoryTransaction(() =>');
    expect(canvasContextMenuSource).toContain('planIndependentSelectionConnections(');
    expect(canvasContextMenuSource).toContain('source: plan.sourceId');
    expect(canvasContextMenuSource).toContain('sourceHandle: plan.sourceHandle');
  });

  it('offers one-click image comparison for exactly two real image nodes', () => {
    useCanvasStore.setState({
      nodes: [
        { ...imageNode, id: 'image-1', selected: true },
        {
          ...imageNode,
          id: 'image-2',
          selected: true,
          position: { x: 500, y: 100 },
          data: { ...imageNode.data, imageUrl: 'data:image/png;base64,second' },
        },
      ],
    });
    expect(
      resolveImageComparisonSources(useCanvasStore.getState().nodes, ['image-1', 'image-2']),
    ).not.toBeNull();
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: {
          x: 220,
          y: 180,
          targetId: 'image-1',
          targetIds: ['image-1', 'image-2'],
        },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const compareButton = buttonMarkup(html, '图片对比');
    expect(compareButton).toContain('lucide-columns-2');
    expect(html.indexOf('独立图片节点')).toBeLessThan(html.indexOf('图片对比'));
    expect(html.indexOf('图片对比')).toBeLessThan(html.indexOf('内容批量生成'));
  });

  it('shows one unified content batch action directly below independent image nodes', () => {
    const targetIds = ['image-1', 'image-2', 'image-3', 'image-4'];
    const html = renderToStaticMarkup(
      createElement(CanvasContextMenu, {
        menu: {
          x: 220,
          y: 180,
          targetId: 'image-1',
          targetIds,
        },
        onClose: () => {},
        onAddNode: () => {},
      }),
    );
    const batchButton = buttonMarkup(html, '内容批量生成');

    expect(batchButton).toContain('lucide-zap');
    expect(html.indexOf('独立图片节点')).toBeLessThan(html.indexOf('内容批量生成'));
    expect(html).not.toContain('没有可批量生成的图片或视频节点');
    expect(html).not.toContain('批量生成图片');
    expect(canvasContextMenuSource).toContain('resolveContentGenerationTargetIds(');
    expect(canvasContextMenuSource).toContain('runContentGenerationBatch(');
  });

  it('routes a pane right-click inside the selection frame to the selected nodes', () => {
    expect(flowCanvasSource).toContain('pointInsideSelectionBounds(flow, bounds)');
    expect(flowCanvasSource).toContain('targetIds: selectedNodes.map((node) => node.id)');
    expect(flowCanvasSource).toContain('onContextMenuCapture={onCanvasContextMenuCapture}');
    expect(flowCanvasSource).toContain('shouldCaptureSelectionContextMenu(event.target)');
  });
});

describe('context menu pointer isolation', () => {
  it('keeps overflow scrolling while hiding the native scrollbar track', () => {
    expect(CONTEXT_MENU_SURFACE_CLASS).toContain('outline-none');
    expect(CONTEXT_MENU_SURFACE_CLASS).toContain('[scrollbar-width:none]');
    expect(CONTEXT_MENU_SURFACE_CLASS).toContain('[&::-webkit-scrollbar]:hidden');
    expect(canvasContextMenuSource).toContain('overflow-y-auto overscroll-contain');
  });

  it('closes from a capture-phase pointer listener and shields the canvas below the menu', () => {
    expect(canvasContextMenuSource).toContain(
      "window.addEventListener('pointerdown', onPointerDown, true)",
    );
    expect(canvasContextMenuSource).toContain(
      "window.removeEventListener('pointerdown', onPointerDown, true)",
    );
    expect(canvasContextMenuSource).toContain('onPointerDown={(event) => event.stopPropagation()}');
    expect(canvasContextMenuSource).not.toContain(
      "window.addEventListener('mousedown', onMouseDown, true)",
    );
  });
});
