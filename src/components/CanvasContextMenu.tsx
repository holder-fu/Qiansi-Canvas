import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  ClipboardCopy,
  Trash2,
  Image as ImageIcon,
  User,
  Clapperboard,
  FileText,
  AudioLines,
  Upload,
  Plus,
  Undo2,
  Redo2,
  ClipboardPaste,
  Type,
  ChevronRight,
  History,
  ArrowLeft,
  Save,
  Maximize2,
  Palette,
  Smile,
  Zap,
  Video,
  Box,
  Mountain,
  LayoutTemplate,
  Camera,
  Pencil,
  Minimize2,
  Group,
  Ungroup,
  Puzzle,
  LayoutGrid,
  Columns2,
} from 'lucide-react';
import {
  runCanvasHistoryTransaction,
  useCanvasStore,
  ASSET_CATEGORY_LABELS,
  DEFAULT_ASSET_CATEGORY,
  type AssetCategory,
} from '../store/canvasStore';
import { WORKSPACES } from '../canvas/workspaces';
import { NODE_W, NODE_H } from '../canvas/constants';
import { isDirectorNodeKind, type DirectorNodeKind, type NodeKind } from '../canvas/nodeTypes';
import { resolveNodeOutputPort } from '../graph/graph';
import { supportsImageContextActions, supportsImageEditing } from '../lib/contextMenuCapabilities';
import {
  resolveContentGenerationTargetIds,
  runContentGenerationBatch,
} from '../lib/multiNodeGeneration';
import { useCanvasPreferences } from '../store/canvasPreferences';
import { uploadAssetFile } from '../services/assetLibrary';
import { persistImageFile, persistVideoFile } from '../services/mediaPersistence';
import {
  NODE_LIBRARY_TARGET_LABELS,
  nodeLibraryCategories,
  nodeLibraryTargets,
  saveNodeToLibrary,
  type NodeLibraryTarget,
} from '../lib/nodeLibrarySave';
import {
  CONTEXT_MENU_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CONTENT_CLASS,
  CONTEXT_MENU_ITEM_ICON_CLASS,
  CONTEXT_MENU_SECTION_TITLE_CLASS,
  CONTEXT_MENU_SURFACE_CLASS,
} from './contextMenuStyles';
import { usePluginRegistryStore } from '../store/pluginRegistryStore';
import { enabledPluginCanvasMenus, type PluginNodeContribution } from '../services/pluginRegistry';
import { usePluginUiStore } from '../store/pluginUiStore';
import { useAppTranslation } from '../i18n/appI18n';
import { shouldShowAddNodeMenuItem } from './addNodeMenu';
import { copyImageSourceToClipboard, imageClipboardSource } from '../lib/imageClipboard';
import { resolveContextMenuHotkey, type ContextMenuHotkey } from './contextMenuHotkeys';
import {
  arrangeNodesInGrid as resolveGridArrangement,
  automaticGridColumns,
  gridColumnOptions,
  gridDimensions,
} from '../canvas/gridArrangement';
import { pluginCanvasMenuDisplayLabel } from './pluginMenuLabel';
import {
  contextMenuViewportPlacement,
  contextSubmenuViewportPlacement,
} from './contextMenuPosition';
import {
  CONTEXT_SUBMENU_POINTER_GRACE_MS,
  shouldDismissContextSubmenu,
} from './contextSubmenuInteraction';
import { planContextLocalMediaImports } from './contextLocalMediaImport';
import {
  executeIndependentSelectionConnectionPlans,
  planIndependentSelectionConnections,
  resolveIndependentSelectionConnectTargetKinds,
  type IndependentSelectionConnectTargetKind,
} from '../lib/selectionConnectTargets';
import { resolveImageComparisonSources } from '../lib/imageComparison';

type MenuMode =
  | 'main'
  | 'add-node'
  | 'library'
  | 'plugins'
  | 'director-type'
  | 'director-create-type'
  | 'asset-category'
  | 'save-library-target'
  | 'save-library-category'
  | 'arrange-grid';

export interface MenuState {
  x: number;
  y: number;
  flowX?: number;
  flowY?: number;
  targetId?: string;
  /** All selected node ids when right-clicking inside a multi-selection. */
  targetIds?: string[];
  edgeId?: string;
  /** Set when a source port is released over empty canvas. */
  pendingConnection?: PendingConnection;
}

export interface PendingConnection {
  source: string;
  sourceHandle: string | null;
}

interface Props {
  menu: MenuState | null;
  onClose: () => void;
  onAddNode: (
    kind: NodeKind,
    x: number,
    y: number,
    pendingConnection?: PendingConnection,
  ) => string | void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const shift = isMac ? '⇧' : 'Shift';

interface NodeMenuItem {
  kind: NodeKind;
  label: string;
  labelKey?: string;
  icon: React.ReactNode;
  tag?: { text: string; tone: 'beta' | 'new' };
  hasSubmenu?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  plugin?: {
    id: string;
    name: string;
    version: string;
    node: PluginNodeContribution;
  };
}

const ASSET_CATEGORY_ORDER: AssetCategory[] = [
  'character',
  'scene',
  'storyboard',
  'item',
  'video',
  'audio',
];

const ASSET_CATEGORY_ICON: Record<AssetCategory, React.ReactNode> = {
  character: <User className="h-3.5 w-3.5" />,
  scene: <Mountain className="h-3.5 w-3.5" />,
  storyboard: <LayoutTemplate className="h-3.5 w-3.5" />,
  item: <Box className="h-3.5 w-3.5" />,
  video: <Clapperboard className="h-3.5 w-3.5" />,
  audio: <AudioLines className="h-3.5 w-3.5" />,
};

const NODE_LIBRARY_TARGET_ICON: Record<NodeLibraryTarget, React.ReactNode> = {
  style: <Palette className="h-3.5 w-3.5" />,
  effect: <Zap className="h-3.5 w-3.5" />,
  character: <User className="h-3.5 w-3.5" />,
  prompt: <FileText className="h-3.5 w-3.5" />,
};

const allNodeItems: NodeMenuItem[] = [
  { kind: 'text', label: '文本', labelKey: 'node.kind.text', icon: <Type className="h-4 w-4" /> },
  {
    kind: 'image',
    label: '图片',
    labelKey: 'node.kind.image',
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    kind: 'video',
    label: '视频',
    labelKey: 'node.kind.video',
    icon: <Clapperboard className="h-4 w-4" />,
  },
  {
    kind: 'audio',
    label: '音频',
    labelKey: 'node.kind.audio',
    icon: <AudioLines className="h-4 w-4" />,
  },
  {
    kind: 'script',
    label: '脚本',
    labelKey: 'node.kind.script',
    icon: <FileText className="h-4 w-4" />,
    hasSubmenu: true,
  },
  {
    kind: 'image-compare',
    label: '图片对比',
    labelKey: 'node.kind.imageCompare',
    icon: <Columns2 className="h-4 w-4" />,
  },
];

function Shortcut({ keys }: { keys: string }) {
  return <span className="ml-4 text-xs tracking-wide text-white/[0.45]">{keys}</span>;
}

function Separator() {
  return <div className="my-1 h-px bg-white/[0.08]" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className={CONTEXT_MENU_SECTION_TITLE_CLASS}>{children}</div>;
}

interface ItemProps {
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (
    event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
  ) => void;
  submenu?: boolean;
  submenuOpen?: boolean;
  disabled?: boolean;
  danger?: boolean;
  hotkey?: ContextMenuHotkey;
  shortcut?: string;
  icon?: React.ReactNode;
  title?: string;
}

function Item({
  children,
  onClick,
  onMouseEnter,
  submenu,
  submenuOpen,
  disabled,
  danger,
  hotkey,
  shortcut,
  icon,
  title,
}: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      data-context-menu-hotkey={hotkey}
      data-context-submenu-trigger={submenu ? 'true' : undefined}
      aria-keyshortcuts={hotkey?.toUpperCase()}
      aria-haspopup={submenu ? 'menu' : undefined}
      aria-expanded={submenu ? submenuOpen : undefined}
      className={[
        CONTEXT_MENU_ITEM_CLASS,
        disabled
          ? 'cursor-not-allowed text-white/[0.38]'
          : danger
            ? 'text-red-300 hover:bg-red-500/10'
            : submenuOpen
              ? 'bg-white/[0.08] text-white'
              : 'text-white/[0.92] hover:bg-white/[0.08]',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={disabled ? undefined : onMouseEnter}
      onFocus={disabled ? undefined : onMouseEnter}
    >
      <span className={CONTEXT_MENU_ITEM_CONTENT_CLASS}>
        {icon && <span className={CONTEXT_MENU_ITEM_ICON_CLASS}>{icon}</span>}
        {children}
      </span>
      {shortcut && !disabled && <Shortcut keys={shortcut} />}
      {submenu && <ChevronRight className="h-3.5 w-3.5 text-white/[0.45]" />}
    </button>
  );
}

function NodeItem({ item, onClick }: { item: NodeMenuItem; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      title={item.disabledTitle}
      className={`${CONTEXT_MENU_ITEM_CLASS} ${
        item.disabled
          ? 'cursor-not-allowed text-white/[0.38]'
          : 'text-white/[0.92] hover:bg-white/[0.08]'
      }`}
      onClick={item.disabled ? undefined : onClick}
    >
      <span className="flex items-center gap-3">
        <span className={item.disabled ? 'text-white/[0.3]' : 'text-white/[0.62]'}>
          {item.icon}
        </span>
        {item.label}
      </span>
      <span className="flex items-center gap-2">
        {item.tag && (
          <span
            className={[
              'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
              item.tag.tone === 'new'
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'bg-white/10 text-white/50',
            ].join(' ')}
          >
            {item.tag.text}
          </span>
        )}
        {item.hasSubmenu && <ChevronRight className="h-3.5 w-3.5 text-white/[0.45]" />}
      </span>
    </button>
  );
}

export function CanvasContextMenu({ menu, onClose, onAddNode }: Props) {
  const { t } = useAppTranslation();
  const workspace = useCanvasStore((s) => s.workspace);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const past = useCanvasStore((s) => s.past);
  const future = useCanvasStore((s) => s.future);
  const generateNode = useCanvasStore((s) => s.generateNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const requestDeleteNode = useCanvasStore((s) => s.requestDeleteNode);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const pasteNode = useCanvasStore((s) => s.pasteNode);
  const saveAsset = useCanvasStore((s) => s.saveAsset);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeWithImage = useCanvasStore((s) => s.addNodeWithImage);
  const createImageComparison = useCanvasStore((s) => s.createImageComparison);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const setOpenModal = useCanvasStore((s) => s.setOpenModal);
  const setImageEditorMode = useCanvasStore((s) => s.setImageEditorMode);
  const createSubjectFromNode = useCanvasStore((s) => s.createSubjectFromNode);
  const takeSnapshot = useCanvasStore((s) => s.takeSnapshot);
  const fitGroupsToChildren = useCanvasStore((s) => s.fitGroupsToChildren);
  const ungroupNode = useCanvasStore((s) => s.ungroupNode);
  const setGroupRenameTargetId = useCanvasStore((s) => s.setGroupRenameTargetId);
  const arrangeNodesInGrid = useCanvasStore((s) => s.arrangeNodesInGrid);
  const createGroupFromSelection = useCanvasStore((s) => s.createGroupFromSelection);
  const nodes = useCanvasStore((s) => s.nodes);
  const pluginCatalog = usePluginRegistryStore((state) => state.catalog);
  const pluginsLoaded = usePluginRegistryStore((state) => state.loaded);
  const pluginsLoading = usePluginRegistryStore((state) => state.loading);
  const refreshPlugins = usePluginRegistryStore((state) => state.refresh);
  const openPluginPanel = usePluginUiStore((state) => state.openPanel);

  useEffect(() => {
    if (!pluginsLoaded && !pluginsLoading) void refreshPlugins().catch(() => {});
  }, [pluginsLoaded, pluginsLoading, refreshPlugins]);

  const allowed = new Set(WORKSPACES[workspace]?.nodeKinds ?? []);
  const sourceNode = menu?.pendingConnection
    ? nodes.find((node) => node.id === menu.pendingConnection?.source)
    : undefined;
  const sourcePort = sourceNode
    ? resolveNodeOutputPort(sourceNode, menu?.pendingConnection?.sourceHandle)
    : undefined;
  const isEffectPendingConnection = Boolean(
    menu?.pendingConnection &&
    sourceNode &&
    (sourceNode.data.effectPresetId || sourceNode.data.effectPreset),
  );
  const nodeItems = allNodeItems
    .filter((item) =>
      isEffectPendingConnection
        ? allowed.has(item.kind)
        : shouldShowAddNodeMenuItem(item.kind, allowed, sourcePort?.assetType),
    )
    .map((item) => ({
      ...item,
      label: item.labelKey ? t(item.labelKey, item.label) : item.label,
      disabled: isEffectPendingConnection && item.kind !== 'video',
      disabledTitle:
        isEffectPendingConnection && item.kind !== 'video'
          ? t('context.effectVideoOnly', '特效只能连接到视频节点')
          : undefined,
    }));

  const [mode, setMode] = useState<MenuMode>('main');
  const [submenuTop, setSubmenuTop] = useState(0);
  const [submenuMaxHeightOverride, setSubmenuMaxHeightOverride] = useState<number | null>(null);
  const [saveLibraryTarget, setSaveLibraryTarget] = useState<NodeLibraryTarget | null>(null);
  const [librarySaveBusy, setLibrarySaveBusy] = useState(false);
  const [librarySaveError, setLibrarySaveError] = useState<string | null>(null);
  const [copyImageBusy, setCopyImageBusy] = useState(false);
  const [copyImageError, setCopyImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupColorRef = useRef<HTMLInputElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const submenuCloseTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const cancelSubmenuClose = () => {
    if (submenuCloseTimerRef.current === null) return;
    window.clearTimeout(submenuCloseTimerRef.current);
    submenuCloseTimerRef.current = null;
  };

  useEffect(() => {
    if (!menu) {
      setMode('main');
      setSubmenuTop(0);
      setSubmenuMaxHeightOverride(null);
      return;
    }
    setMode(menu.pendingConnection ? 'add-node' : 'main');
    setSubmenuTop(0);
    setSubmenuMaxHeightOverride(null);
    setSaveLibraryTarget(null);
    setLibrarySaveBusy(false);
    setLibrarySaveError(null);
    setCopyImageBusy(false);
    setCopyImageError(null);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!document.getElementById('canvas-context-menu')?.contains(target)) {
        onCloseRef.current();
      }
    };
    const onWheel = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      const hotkey = resolveContextMenuHotkey(e);
      if (!hotkey) return;
      const button = document
        .getElementById('canvas-context-menu')
        ?.querySelector<HTMLButtonElement>(`button[data-context-menu-hotkey="${hotkey}"]`);
      if (!button || button.disabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      button.click();
    };
    // Capture phase: fire before React Flow's pane handler for mouse, touch and
    // pen input. A bubble listener can be blocked when canvas panning stops the
    // pointer event, leaving the menu open after interacting outside it.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('wheel', onWheel);
    window.addEventListener('keydown', onKey, true);
    const focusFrame = window.requestAnimationFrame(() => {
      const initialMode = menu.pendingConnection ? 'add-node' : 'main';
      menuRootRef.current
        ?.querySelector<HTMLElement>(`[data-context-menu-panel="${initialMode}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => {
      if (submenuCloseTimerRef.current !== null) {
        window.clearTimeout(submenuCloseTimerRef.current);
        submenuCloseTimerRef.current = null;
      }
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  if (!menu) return null;

  const isNode = Boolean(menu.targetId);
  const isEdge = Boolean(menu.edgeId);
  const targetNode = nodes.find((n) => n.id === menu.targetId);
  const isEffectReference = Boolean(
    targetNode?.data.effectPresetId || targetNode?.data.effectPreset,
  );
  const effectRestrictionTitle = isEffectReference
    ? t('context.effectReferenceRestricted', '特效节点仅支持复制节点和移到回收站')
    : undefined;
  const multiTargetIds = menu.targetIds && menu.targetIds.length > 1 ? menu.targetIds : [];
  const isMultiNode = multiTargetIds.length > 1;
  const multiTargetNodes = multiTargetIds.flatMap((targetId) => {
    const node = nodes.find((candidate) => candidate.id === targetId);
    return node ? [node] : [];
  });
  const independentTargetKinds = new Set(
    resolveIndependentSelectionConnectTargetKinds(multiTargetNodes),
  );
  const canCreateImageComparison = Boolean(resolveImageComparisonSources(nodes, multiTargetIds));
  const contentGenerationTargetIds = resolveContentGenerationTargetIds(nodes, multiTargetIds);
  const hasRunnableContentGenerationTarget = contentGenerationTargetIds.some(
    (targetId) => nodes.find((node) => node.id === targetId)?.data.generating !== true,
  );
  const automaticColumns = automaticGridColumns(multiTargetIds.length);
  const automaticDimensions = gridDimensions(multiTargetIds.length, automaticColumns);
  const arrangementColumns = gridColumnOptions(multiTargetIds.length);
  const canArrangeGrid = Boolean(resolveGridArrangement(nodes, multiTargetIds, automaticColumns));
  const isDirector = Boolean(targetNode && isDirectorNodeKind(targetNode.data.kind));
  const isGroup = targetNode?.data.kind === 'group';
  const isImageLike = Boolean(
    targetNode && !isDirector && supportsImageContextActions(targetNode.data.kind),
  );
  const isVideoLike =
    targetNode && (targetNode.data.kind === 'video' || targetNode.data.kind === 'video-comp');
  const hasVideoModel = Boolean(isVideoLike && targetNode.data.providerId && targetNode.data.model);
  const hasPreviewMedia = Boolean(
    targetNode &&
    (isVideoLike
      ? targetNode.data.videoUrl ||
        targetNode.data.videos?.[0] ||
        targetNode.data.effectVideoId ||
        targetNode.data.assetVideoId
      : targetNode.data.imageUrl || targetNode.data.images?.[0]),
  );
  const hasSubjectImage = supportsImageEditing(targetNode);
  const copyImageSource = targetNode ? imageClipboardSource(targetNode.data) : undefined;
  const saveLibraryTargets = nodeLibraryTargets(targetNode);
  const saveLibraryCategories = saveLibraryTarget ? nodeLibraryCategories(saveLibraryTarget) : [];

  const handleAdd = (kind: NodeKind) => {
    if (isEffectPendingConnection && kind !== 'video') return;
    if (menu.flowX != null && menu.flowY != null) {
      onAddNode(kind, menu.flowX - NODE_W / 2, menu.flowY - NODE_H / 2, menu.pendingConnection);
    }
    onClose();
  };

  const handleAddPluginNode = (item: NodeMenuItem) => {
    if (!item.plugin || menu.flowX == null || menu.flowY == null) return;
    const nodeId = onAddNode(
      item.kind,
      menu.flowX - NODE_W / 2,
      menu.flowY - NODE_H / 2,
      menu.pendingConnection,
    );
    if (nodeId) {
      updateNodeData(nodeId, {
        title: item.plugin.node.label,
        description: item.plugin.node.description,
        pluginId: item.plugin.id,
        pluginNodeId: item.plugin.node.id,
        pluginVersion: item.plugin.version,
        pluginName: item.plugin.name,
        pluginAccent: item.plugin.node.accent,
        pluginInputType: item.plugin.node.input,
        pluginOutputType: item.plugin.node.output,
        pluginRenderer: item.plugin.node.renderer,
        pluginView: item.plugin.node.view,
      });
    }
    onClose();
  };

  const pluginCanvasMenus = enabledPluginCanvasMenus(pluginCatalog);

  const handlePluginCanvasMenu = (pluginId: string, menuId: string) => {
    const plugin = pluginCatalog?.plugins.find((item) => item.manifest.id === pluginId);
    const entry = plugin?.manifest.contributes.menus.find((item) => item.id === menuId);
    if (!plugin?.enabled || !plugin.compatible || !entry) return;
    const action = entry.action;
    if (action.type === 'open-panel') {
      openPluginPanel(plugin.manifest.id, action.panelId);
      onClose();
      return;
    }
    const node = plugin.manifest.contributes.nodes.find((item) => item.id === action.nodeId);
    if (!node || menu.flowX == null || menu.flowY == null) return;
    handleAddPluginNode({
      kind: node.hostKind ?? 'plugin',
      label: node.label,
      icon: <Puzzle className="h-4 w-4" />,
      plugin: {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        node,
      },
    });
  };

  const openDirectorStudio = (kind: 'director-studio' | 'director-studio-2d') => {
    if (!menu.targetId) return;
    const node = nodes.find((item) => item.id === menu.targetId);
    if (!node) return;
    const expectedKind = kind === 'director-studio-2d' ? 'director-2d' : 'director-3d';
    if (node.data.kind !== expectedKind) return;
    setOpenModal(kind, menu.targetId);
    onClose();
  };
  const createDirectorStudio = (kind: 'director-studio' | 'director-studio-2d') => {
    if (menu.flowX == null || menu.flowY == null) return;
    const nodeKind: DirectorNodeKind =
      kind === 'director-studio-2d' ? 'director-2d' : 'director-3d';
    const id = addNode(nodeKind, { x: menu.flowX - NODE_W / 2, y: menu.flowY - NODE_H / 2 });
    setOpenModal(kind, id);
    onClose();
  };
  const handleUpload = () => {
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!selectedFiles.length || menu.flowX == null || menu.flowY == null) return;
    const origin = { x: menu.flowX - NODE_W / 2, y: menu.flowY - NODE_H / 2 };
    const files = planContextLocalMediaImports(selectedFiles, origin);
    if (!files.length) return;
    onClose();

    for (const { file, kind, position } of files) {
      if (kind === 'video' || kind === 'audio') {
        const nodeId = addNode(kind, position);
        const sessionUrl = URL.createObjectURL(file);
        updateNodeData(nodeId, {
          title: file.name.replace(/\.[^.]+$/, ''),
          ...(kind === 'video'
            ? {
                videoUrl: sessionUrl,
                videos: [sessionUrl],
                videoFileName: file.name,
                output: sessionUrl,
              }
            : {
                audioUrl: sessionUrl,
                audios: [sessionUrl],
                audioFileName: file.name,
                output: sessionUrl,
              }),
          result: t('media.persist.saving', '正在把媒体保存到本机素材库…'),
        });
        try {
          if (kind === 'video') {
            const item = await persistVideoFile(file, activeProjectId);
            URL.revokeObjectURL(sessionUrl);
            updateNodeData(nodeId, {
              originalUrl: item.originalUrl,
              previewUrl: item.previewUrl,
              mediaWidth: item.width,
              mediaHeight: item.height,
              durationSeconds: item.durationSeconds,
              videoUrl: item.originalUrl,
              videos: [item.originalUrl],
              output: item.originalUrl,
              bridgeAssetId: item.bridgeAssetId,
              result: t('media.persist.saved', '媒体已保存到本机素材库。'),
            });
          } else {
            const item = await uploadAssetFile(file, kind, { project: activeProjectId });
            URL.revokeObjectURL(sessionUrl);
            updateNodeData(nodeId, {
              audioUrl: item.url,
              audios: [item.url],
              output: item.url,
              bridgeAssetId: item.id,
              result: t('media.persist.saved', '媒体已保存到本机素材库。'),
            });
          }
        } catch (error) {
          updateNodeData(nodeId, {
            result:
              error instanceof Error
                ? t('media.persist.sessionOnlyWithError', '媒体仅在当前会话可用：{message}', {
                    message: error.message,
                  })
                : t('media.persist.sessionOnly', '媒体仅在当前会话可用，本机素材保存失败。'),
          });
        }
        continue;
      }

      try {
        const item = await persistImageFile(file, 'character', activeProjectId);
        const id = addNodeWithImage(
          'image',
          position,
          item.originalUrl,
          file.name.replace(/\.[^.]+$/, ''),
        );
        updateNodeData(id, {
          originalUrl: item.originalUrl,
          previewUrl: item.previewUrl,
          mediaWidth: item.width,
          mediaHeight: item.height,
          bridgeAssetId: item.bridgeAssetId,
          imageFileName: file.name,
        });
      } catch {
        addNodeWithImage(
          'image',
          position,
          URL.createObjectURL(file),
          file.name.replace(/\.[^.]+$/, ''),
        );
      }
    }
  };

  const handlePaste = () => {
    if (menu.flowX != null && menu.flowY != null) {
      pasteNode({ x: menu.flowX - NODE_W / 2, y: menu.flowY - NODE_H / 2 });
    }
    onClose();
  };

  const handleSaveAsset = () => {
    if (!menu.targetId || !hasPreviewMedia) return;
    setMode('asset-category');
  };

  const handleSelectAssetCategory = (category: AssetCategory) => {
    if (!menu.targetId || !hasPreviewMedia) return;
    saveAsset(menu.targetId, category);
    onClose();
  };

  const handleSelectSaveLibraryTarget = (target: NodeLibraryTarget) => {
    setSaveLibraryTarget(target);
    setLibrarySaveError(null);
    setMode('save-library-category');
  };

  const handleSelectSaveLibraryCategory = async (category: string) => {
    if (!targetNode || !saveLibraryTarget || librarySaveBusy) return;
    setLibrarySaveBusy(true);
    setLibrarySaveError(null);
    try {
      await saveNodeToLibrary(targetNode, saveLibraryTarget, category, activeProjectId);
      onClose();
    } catch (error) {
      setLibrarySaveError(
        error instanceof Error ? error.message : t('common.saveFailedRetry', '保存失败，请重试'),
      );
      setLibrarySaveBusy(false);
    }
  };

  const handleFullscreen = () => {
    if (!menu.targetId) return;
    setOpenModal('media-preview', menu.targetId);
    onClose();
  };

  const handleEditImage = () => {
    if (!menu.targetId || !hasSubjectImage) return;
    setImageEditorMode('preview');
    setOpenModal('image-editor', menu.targetId);
    onClose();
  };

  const handleCopyImage = () => {
    if (!copyImageSource || copyImageBusy) return;
    setCopyImageBusy(true);
    setCopyImageError(null);
    void copyImageSourceToClipboard(copyImageSource)
      .then(onClose)
      .catch(() => {
        setCopyImageError(
          t('context.copyImageFailed', '复制图片失败，请检查浏览器剪贴板权限或图片来源。'),
        );
        setCopyImageBusy(false);
      });
  };

  const handleCreateSubject = () => {
    if (!menu.targetId) return;
    if (createSubjectFromNode(menu.targetId)) onClose();
  };

  const handleRegenerateVideo = () => {
    if (!menu.targetId) return;
    void generateNode(menu.targetId).catch(() => undefined);
    onClose();
  };

  const handleContentBatchGenerate = () => {
    onClose();
    void runContentGenerationBatch(
      nodes,
      contentGenerationTargetIds,
      generateNode,
      useCanvasPreferences.getState(),
    );
  };

  const handleArrangeGrid = (columns: number) => {
    if (arrangeNodesInGrid(multiTargetIds, columns)) onClose();
  };

  const handleCreateGroup = () => {
    createGroupFromSelection();
    onClose();
  };

  const handleCreateIndependentNodes = (targetKind: IndependentSelectionConnectTargetKind) => {
    const plans = planIndependentSelectionConnections(multiTargetNodes, targetKind);
    if (plans.length !== multiTargetIds.length) return;
    runCanvasHistoryTransaction(() => {
      executeIndependentSelectionConnectionPlans(plans, (plan) => {
        onAddNode(plan.targetKind, 0, 0, {
          source: plan.sourceId,
          sourceHandle: plan.sourceHandle,
        });
      });
    });
    onClose();
  };

  const handleCreateImageComparison = () => {
    if (!canCreateImageComparison) return;
    if (createImageComparison(multiTargetIds)) onClose();
  };

  const hasClipboard = useCanvasStore.getState().clipboard !== null;

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
  const menuPlacement = contextMenuViewportPlacement(
    { x: menu.x, y: menu.y },
    { width: viewportWidth, height: viewportHeight },
  );

  const openSubmenuAt = (nextMode: MenuMode, trigger: HTMLButtonElement) => {
    cancelSubmenuClose();
    const menuRootTop = menuRootRef.current?.getBoundingClientRect().top ?? menuPlacement.top;
    const placement = contextSubmenuViewportPlacement(
      trigger.getBoundingClientRect().top,
      menuRootTop,
      viewportHeight,
    );
    setSubmenuTop(placement.top);
    setSubmenuMaxHeightOverride(placement.maxHeight);
    setMode(nextMode);
  };

  const renderMenuPanel = (renderMode: MenuMode, maxHeight = menuPlacement.maxHeight) => (
    <div
      className={`${CONTEXT_MENU_SURFACE_CLASS} w-[220px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain`}
      role="menu"
      aria-label={t('context.menuAria', '画布操作菜单')}
      data-context-menu-panel={renderMode}
      tabIndex={-1}
      style={{ maxHeight }}
    >
      {renderMode === 'asset-category' ? (
        <>
          <SectionTitle>{t('context.assetCategory', '选择资产分类')}</SectionTitle>
          {ASSET_CATEGORY_ORDER.map((cat) => (
            <Item
              key={cat}
              icon={ASSET_CATEGORY_ICON[cat]}
              onClick={() => handleSelectAssetCategory(cat)}
            >
              {t(`assets.category.${cat}`, ASSET_CATEGORY_LABELS[cat])}
              {cat === DEFAULT_ASSET_CATEGORY && (
                <span className="ml-2 text-[10px] text-white/30">
                  {t('common.default', '默认')}
                </span>
              )}
            </Item>
          ))}
        </>
      ) : renderMode === 'save-library-target' ? (
        <>
          <SectionTitle>{t('context.saveTo', '另存到')}</SectionTitle>
          {saveLibraryTargets.map((target) => (
            <Item
              key={target}
              icon={NODE_LIBRARY_TARGET_ICON[target]}
              onClick={() => handleSelectSaveLibraryTarget(target)}
              submenu
              submenuOpen={saveLibraryTarget === target}
            >
              {t(`library.target.${target}`, NODE_LIBRARY_TARGET_LABELS[target])}
            </Item>
          ))}
        </>
      ) : renderMode === 'save-library-category' && saveLibraryTarget ? (
        <>
          <button
            type="button"
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] text-white/45 transition-colors hover:bg-white/[0.08]"
            onClick={() => setMode('save-library-target')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('common.back', '返回')}
          </button>
          <SectionTitle>
            {t('context.libraryCategory', '{library} · 选择分类', {
              library: t(
                `library.target.${saveLibraryTarget}`,
                NODE_LIBRARY_TARGET_LABELS[saveLibraryTarget],
              ),
            })}
          </SectionTitle>
          <div className="max-h-72 overflow-y-auto">
            {saveLibraryCategories.map((category) => (
              <Item
                key={category.value}
                icon={NODE_LIBRARY_TARGET_ICON[saveLibraryTarget]}
                disabled={librarySaveBusy}
                onClick={() => void handleSelectSaveLibraryCategory(category.value)}
              >
                {category.label}
              </Item>
            ))}
          </div>
          {librarySaveBusy && (
            <p className="px-3 py-2 text-[11px] text-white/45">
              {t('context.librarySaving', '正在保存图片、视频与文字…')}
            </p>
          )}
          {librarySaveError && (
            <p className="px-3 py-2 text-[11px] leading-relaxed text-red-300">{librarySaveError}</p>
          )}
        </>
      ) : renderMode === 'arrange-grid' && isMultiNode ? (
        <>
          <SectionTitle>{t('context.arrangeGridTitle', '网格排列')}</SectionTitle>
          <Item
            icon={<LayoutGrid className="h-3.5 w-3.5 text-emerald-300" />}
            onClick={() => handleArrangeGrid(automaticColumns)}
          >
            {t('context.arrangeGridAuto', '自动排列')}
            <span className="ml-2 text-[10px] text-white/40">
              {automaticDimensions.columns} × {automaticDimensions.rows}
            </span>
          </Item>
          <Separator />
          {arrangementColumns.map((columns) => {
            const dimensions = gridDimensions(multiTargetIds.length, columns);
            return (
              <Item
                key={columns}
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
                onClick={() => handleArrangeGrid(columns)}
              >
                {dimensions.columns} × {dimensions.rows}
                <span className="ml-2 text-[10px] text-white/35">
                  {t('context.arrangeGridColumns', '{count} 列', { count: dimensions.columns })}
                </span>
              </Item>
            );
          })}
        </>
      ) : isMultiNode ? (
        <>
          <SectionTitle>
            {t('context.selectedNodes', '已选择 {count} 个节点', {
              count: multiTargetIds.length,
            })}
          </SectionTitle>
          <Item
            icon={<Group className="h-3.5 w-3.5 text-violet-300" />}
            onClick={handleCreateGroup}
          >
            {t('context.createGroup', '创建分组')}
          </Item>
          <Item
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            disabled={!canArrangeGrid}
            title={
              canArrangeGrid
                ? undefined
                : t('context.arrangeGridUnavailable', '所选节点需要位于同一画布层级才能排列')
            }
            onClick={(event) => openSubmenuAt('arrange-grid', event.currentTarget)}
            onMouseEnter={
              canArrangeGrid
                ? (event) => openSubmenuAt('arrange-grid', event.currentTarget)
                : undefined
            }
            submenu
            submenuOpen={mode === 'arrange-grid'}
          >
            {t('context.arrangeGrid', '网格排列')}
          </Item>
          <Item
            icon={<Type className="h-3.5 w-3.5 text-sky-300" />}
            disabled={!independentTargetKinds.has('text')}
            title={
              independentTargetKinds.has('text')
                ? undefined
                : t(
                    'context.independentTextUnavailable',
                    '部分所选节点不能连接到文本节点，未执行批量创建',
                  )
            }
            onClick={() => handleCreateIndependentNodes('text')}
          >
            {t('context.independentTextNode', '独立文本节点')}
          </Item>
          <Item
            icon={<ImageIcon className="h-3.5 w-3.5 text-emerald-300" />}
            disabled={!independentTargetKinds.has('image')}
            title={
              independentTargetKinds.has('image')
                ? undefined
                : t(
                    'context.independentImageUnavailable',
                    '部分所选节点不能连接到图片节点，未执行批量创建',
                  )
            }
            onClick={() => handleCreateIndependentNodes('image')}
          >
            {t('context.independentImageNode', '独立图片节点')}
          </Item>
          {multiTargetIds.length === 2 && (
            <Item
              icon={<Columns2 className="h-3.5 w-3.5 text-cyan-300" />}
              disabled={!canCreateImageComparison}
              title={
                canCreateImageComparison
                  ? undefined
                  : t('context.imageComparisonUnavailable', '请选择两个包含真实图片的节点')
              }
              onClick={handleCreateImageComparison}
            >
              {t('context.createImageComparison', '图片对比')}
            </Item>
          )}
          <Separator />
          <Item
            icon={<Zap className="h-3.5 w-3.5 text-amber-300" />}
            onClick={handleContentBatchGenerate}
            disabled={!hasRunnableContentGenerationTarget}
            title={
              contentGenerationTargetIds.length === 0
                ? t('context.contentBatchUnavailable', '所选节点没有可执行的默认生成操作')
                : hasRunnableContentGenerationTarget
                  ? undefined
                  : t('context.contentBatchRunning', '所选内容节点正在生成中')
            }
          >
            {t('context.contentBatchGenerate', '内容批量生成')}
          </Item>
        </>
      ) : isEdge ? (
        <>
          <SectionTitle>{t('context.connectionActions', '连线操作')}</SectionTitle>
          <Item
            icon={<Trash2 className="h-3.5 w-3.5" />}
            danger
            hotkey="d"
            shortcut="D"
            onClick={() => {
              deleteEdge(menu.edgeId!);
              onClose();
            }}
          >
            {t('context.deleteConnection', '删除连线')}
          </Item>
        </>
      ) : isNode ? (
        isGroup ? (
          <>
            <SectionTitle>{t('context.groupActions', '分组操作')}</SectionTitle>
            <Item
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!menu.targetId) return;
                setGroupRenameTargetId(menu.targetId);
                onClose();
              }}
            >
              {t('context.renameGroup', '重命名分组')}
            </Item>
            <Item
              icon={<Palette className="h-3.5 w-3.5" />}
              onClick={() => groupColorRef.current?.click()}
            >
              {t('context.changeGroupColor', '修改背景颜色')}
            </Item>
            <Item
              icon={<Minimize2 className="h-3.5 w-3.5" />}
              onClick={() => {
                fitGroupsToChildren(menu.targetId);
                onClose();
              }}
            >
              {t('context.fitGroup', '收紧分组边框')}
            </Item>
            <Separator />
            <Item
              icon={<Ungroup className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!menu.targetId) return;
                ungroupNode(menu.targetId);
                onClose();
              }}
            >
              {t('context.ungroup', '拆解分组（保留节点）')}
            </Item>
            <Item
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
              hotkey="d"
              shortcut="D"
              onClick={() => {
                if (!menu.targetId) return;
                requestDeleteNode(menu.targetId);
                onClose();
              }}
            >
              {t('context.trashGroup', '将分组移到回收站')}
            </Item>
          </>
        ) : (
          <>
            <Item
              icon={<Copy className="h-3.5 w-3.5" />}
              shortcut={`${mod}D`}
              onClick={() => {
                duplicateNode(menu.targetId!);
                onClose();
              }}
            >
              {t('context.duplicateNode', '复制节点')}
            </Item>
            <Item
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={(event) => openSubmenuAt('asset-category', event.currentTarget)}
              onMouseEnter={
                hasPreviewMedia && !isEffectReference
                  ? (event) => openSubmenuAt('asset-category', event.currentTarget)
                  : undefined
              }
              disabled={isEffectReference || !hasPreviewMedia}
              submenu
              submenuOpen={mode === 'asset-category'}
              title={
                effectRestrictionTitle ??
                (!hasPreviewMedia
                  ? t('context.noSavableMedia', '当前节点没有可保存的媒体内容')
                  : undefined)
              }
            >
              {t('context.saveAsAsset', '保存为资产')}
            </Item>
            <Item
              icon={<Maximize2 className="h-3.5 w-3.5" />}
              onClick={handleFullscreen}
              disabled={isEffectReference || !hasPreviewMedia}
              title={effectRestrictionTitle}
            >
              {t('context.fullscreenPreview', '全屏预览')}
            </Item>
            {isImageLike && (
              <>
                <Item
                  icon={<ClipboardCopy className="h-3.5 w-3.5" />}
                  onClick={handleCopyImage}
                  disabled={isEffectReference || !copyImageSource || copyImageBusy}
                  hotkey="c"
                  shortcut="C"
                  title={
                    effectRestrictionTitle ??
                    (!copyImageSource
                      ? t('context.noCopyableImage', '当前节点没有可复制的图片')
                      : undefined)
                  }
                >
                  {copyImageBusy
                    ? t('context.copyingImage', '正在复制图片…')
                    : t('context.copyImage', '复制图片')}
                </Item>
                {copyImageError && (
                  <div role="status" className="px-3 py-1 text-[11px] leading-4 text-red-300">
                    {copyImageError}
                  </div>
                )}
                <Item
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={handleEditImage}
                  disabled={isEffectReference || !hasSubjectImage}
                  hotkey="e"
                  shortcut="E"
                  title={
                    effectRestrictionTitle ??
                    (!hasSubjectImage
                      ? t('context.noEditableImage', '当前节点没有可编辑的图片')
                      : undefined)
                  }
                >
                  {t('common.edit', '编辑')}
                </Item>
              </>
            )}
            {isDirector && targetNode && targetNode.data.kind !== 'director' && (
              <Item
                icon={<Camera className="h-3.5 w-3.5 text-sky-300" />}
                onClick={() =>
                  openDirectorStudio(
                    targetNode.data.kind === 'director-2d'
                      ? 'director-studio-2d'
                      : 'director-studio',
                  )
                }
              >
                {t('common.open', '打开')}
                {targetNode.data.kind === 'director-2d'
                  ? t('director.2d', '2D导演台')
                  : t('director.3d', '3D导演台')}
              </Item>
            )}
            <Separator />
            {isImageLike && (
              <>
                <Item
                  icon={<Palette className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setOpenModal('style-library', menu.targetId);
                    onClose();
                  }}
                  disabled={isEffectReference || !hasSubjectImage}
                  title={
                    effectRestrictionTitle ??
                    (!hasSubjectImage
                      ? t('context.noStyleImage', '当前节点没有可应用风格的图片')
                      : undefined)
                  }
                >
                  {t('context.applyStyle', '应用风格')}
                </Item>
                <Separator />
              </>
            )}
            {isImageLike && (
              <Item
                icon={<Smile className="h-3.5 w-3.5" />}
                onClick={handleCreateSubject}
                disabled={
                  isEffectReference || !hasSubjectImage || targetNode?.data.isSubject === true
                }
                title={effectRestrictionTitle}
              >
                {targetNode?.data.isSubject === true
                  ? t('context.subjectCreated', '已创建主体')
                  : t('context.createSubject', '创建主体')}
              </Item>
            )}
            {isVideoLike && (
              <Item
                icon={<Video className="h-3.5 w-3.5 text-cyan-300" />}
                onClick={handleRegenerateVideo}
                disabled={!hasVideoModel}
              >
                {hasVideoModel
                  ? t('context.regenerateWithModel', '{model} 重新生成', {
                      model: String(targetNode.data.model),
                    })
                  : t('context.selectVideoModel', '请先选择视频模型')}
              </Item>
            )}
            <Separator />
            <Item
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
              hotkey="d"
              shortcut="D"
              onClick={() => {
                requestDeleteNode(menu.targetId!);
                onClose();
              }}
            >
              {t('context.moveToTrash', '移到回收站')}
            </Item>
          </>
        )
      ) : renderMode === 'plugins' ? (
        <>
          <SectionTitle>{t('context.pluginActions', '插件功能')}</SectionTitle>
          <div className="max-h-72 overflow-y-auto">
            {pluginCanvasMenus.map(({ plugin, entry }) => (
              <Item
                key={`${plugin.manifest.id}:${entry.id}`}
                icon={<Puzzle className="h-3.5 w-3.5" />}
                onClick={() => handlePluginCanvasMenu(plugin.manifest.id, entry.id)}
              >
                {pluginCanvasMenuDisplayLabel(entry.label)}
              </Item>
            ))}
          </div>
        </>
      ) : renderMode === 'director-type' ? (
        <>
          <SectionTitle>{t('context.openDirector', '打开导演台')}</SectionTitle>
          <Item
            icon={<Camera className="h-3.5 w-3.5 text-sky-300" />}
            onClick={() => openDirectorStudio('director-studio-2d')}
          >
            {t('director.2d', '2D导演台')}
          </Item>
          <Item
            icon={<Camera className="h-3.5 w-3.5 text-cyan-300" />}
            onClick={() => openDirectorStudio('director-studio')}
          >
            {t('director.3d', '3D导演台')}
          </Item>
        </>
      ) : renderMode === 'director-create-type' ? (
        <>
          <SectionTitle>{t('context.createDirector', '新建导演台')}</SectionTitle>
          <Item
            icon={<Camera className="h-3.5 w-3.5 text-sky-300" />}
            onClick={() => createDirectorStudio('director-studio-2d')}
          >
            {t('director.2d', '2D导演台')}
          </Item>
          <Item
            icon={<Camera className="h-3.5 w-3.5 text-cyan-300" />}
            onClick={() => createDirectorStudio('director-studio')}
          >
            {t('director.3d', '3D导演台')}
          </Item>
        </>
      ) : renderMode === 'add-node' ? (
        <>
          <SectionTitle>{t('context.addNode', '添加节点')}</SectionTitle>
          {nodeItems.map((item) => (
            <NodeItem key={item.kind} item={item} onClick={() => handleAdd(item.kind)} />
          ))}
        </>
      ) : renderMode === 'library' ? (
        <>
          <SectionTitle>{t('context.library', '素材库')}</SectionTitle>
          <Item
            icon={<Palette className="h-3.5 w-3.5" />}
            onClick={() => {
              setOpenModal('style-library', null);
              onClose();
            }}
          >
            {t('toolbar.styleLibrary', '风格库')}
          </Item>
          <Item
            icon={<Zap className="h-3.5 w-3.5" />}
            onClick={() => {
              setOpenModal('effects-library', null);
              onClose();
            }}
          >
            {t('toolbar.effectsLibrary', '特效库')}
          </Item>
          <Item
            icon={<User className="h-3.5 w-3.5" />}
            onClick={() => {
              setOpenModal('character-library', null);
              onClose();
            }}
          >
            {t('toolbar.characterLibrary', '角色库')}
          </Item>
        </>
      ) : (
        <>
          <SectionTitle>{t('context.addNode', '添加节点')}</SectionTitle>
          <Item
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={(event) => openSubmenuAt('add-node', event.currentTarget)}
            onMouseEnter={(event) => openSubmenuAt('add-node', event.currentTarget)}
            submenu
            submenuOpen={mode === 'add-node'}
          >
            {t('context.addNode', '添加节点')}
          </Item>
          <Item
            icon={<Camera className="h-3.5 w-3.5" />}
            onClick={(event) => openSubmenuAt('director-create-type', event.currentTarget)}
            onMouseEnter={(event) => openSubmenuAt('director-create-type', event.currentTarget)}
            submenu
            submenuOpen={mode === 'director-create-type'}
          >
            {t('context.director', '导演台')}
          </Item>
          {pluginCanvasMenus.length > 0 && (
            <Item
              icon={<Puzzle className="h-3.5 w-3.5" />}
              onClick={(event) => openSubmenuAt('plugins', event.currentTarget)}
              onMouseEnter={(event) => openSubmenuAt('plugins', event.currentTarget)}
              submenu
              submenuOpen={mode === 'plugins'}
            >
              {t('context.selectPlugin', '选择插件')}
            </Item>
          )}
          <Separator />

          <SectionTitle>{t('context.addResources', '添加资源')}</SectionTitle>
          <Item icon={<Upload className="h-3.5 w-3.5" />} onClick={handleUpload}>
            {t('context.uploadLocalFile', '上传本地文件')}
          </Item>
          <Item
            icon={<Palette className="h-3.5 w-3.5" />}
            onClick={(event) => openSubmenuAt('library', event.currentTarget)}
            onMouseEnter={(event) => openSubmenuAt('library', event.currentTarget)}
            submenu
            submenuOpen={mode === 'library'}
          >
            {t('context.library', '素材库')}
          </Item>
          <Item
            icon={<History className="h-3.5 w-3.5" />}
            onClick={handlePaste}
            disabled={!hasClipboard}
          >
            {t('context.generationHistory', '从生成历史选择')}
          </Item>
          <Item
            icon={<Save className="h-3.5 w-3.5" />}
            onClick={handleSaveAsset}
            disabled
            title={t(
              'context.noCanvasAssetHint',
              '空白处没有可保存的内容，请在包含媒体的节点上右键',
            )}
          >
            {t('context.saveToAssets', '保存到我的资产')}
          </Item>
          <Separator />

          <SectionTitle>{t('common.edit', '编辑')}</SectionTitle>
          <Item
            icon={<Undo2 className="h-3.5 w-3.5" />}
            shortcut={`${mod}Z`}
            disabled={past.length === 0}
            onClick={() => {
              undo();
              onClose();
            }}
          >
            {t('header.undo', '撤销')}
          </Item>
          <Item
            icon={<Redo2 className="h-3.5 w-3.5" />}
            shortcut={`${shift}${mod}Z`}
            disabled={future.length === 0}
            onClick={() => {
              redo();
              onClose();
            }}
          >
            {t('header.redo', '重做')}
          </Item>
          <Item
            icon={<ClipboardPaste className="h-3.5 w-3.5" />}
            shortcut={`${mod}V`}
            onClick={handlePaste}
            disabled={!hasClipboard}
          >
            {t('common.paste', '粘贴')}
          </Item>
        </>
      )}
    </div>
  );

  const primaryMode = menu.pendingConnection ? 'add-node' : 'main';
  const showSubmenu = !menu.pendingConnection && mode !== 'main';
  const openSubmenuOnLeft = menuPlacement.openSubmenuOnLeft;
  const effectiveSubmenuTop = menuPlacement.openUpward
    ? 0
    : Math.min(submenuTop, Math.max(0, menuPlacement.maxHeight - 96));
  const submenuMaxHeight = menuPlacement.openUpward
    ? (submenuMaxHeightOverride ?? menuPlacement.maxHeight)
    : Math.max(0, menuPlacement.maxHeight - effectiveSubmenuTop);

  const closeSubmenu = () => {
    cancelSubmenuClose();
    if (!showSubmenu) return;
    setMode('main');
    setSubmenuTop(0);
    setSubmenuMaxHeightOverride(null);
  };

  const shouldDismissSubmenuForTarget = (target: EventTarget | null) => {
    if (!(target instanceof Node)) return true;
    const activeTrigger = menuRootRef.current?.querySelector(
      '[data-context-submenu-trigger="true"][aria-expanded="true"]',
    );
    const submenu = menuRootRef.current?.querySelector('[data-testid="canvas-context-submenu"]');
    return shouldDismissContextSubmenu(target, activeTrigger ?? null, submenu ?? null);
  };

  const scheduleSubmenuClose = () => {
    if (!showSubmenu || submenuCloseTimerRef.current !== null) return;
    submenuCloseTimerRef.current = window.setTimeout(() => {
      submenuCloseTimerRef.current = null;
      closeSubmenu();
    }, CONTEXT_SUBMENU_POINTER_GRACE_MS);
  };

  const handleSubmenuPointerOver = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!showSubmenu) return;
    if (shouldDismissSubmenuForTarget(event.target)) scheduleSubmenuClose();
    else cancelSubmenuClose();
  };

  const handleSubmenuFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!showSubmenu) return;
    if (shouldDismissSubmenuForTarget(event.target)) closeSubmenu();
    else cancelSubmenuClose();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const activeMode = showSubmenu ? mode : primaryMode;
    const panel = menuRootRef.current?.querySelector<HTMLElement>(
      `[data-context-menu-panel="${activeMode}"]`,
    );
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'),
    );
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowUp'
            ? currentIndex <= 0
              ? items.length - 1
              : currentIndex - 1
            : currentIndex < 0 || currentIndex === items.length - 1
              ? 0
              : currentIndex + 1;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={menuRootRef}
      id="canvas-context-menu"
      className="fixed z-[100]"
      style={{
        left: menuPlacement.left,
        top: menuPlacement.top,
        transform: menuPlacement.openUpward ? 'translateY(-100%)' : undefined,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerOver={handleSubmenuPointerOver}
      onPointerLeave={scheduleSubmenuClose}
      onFocusCapture={handleSubmenuFocusCapture}
      onKeyDown={handleMenuKeyDown}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*,.weba,.m4a,.mov"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
      {isGroup && (
        <input
          ref={groupColorRef}
          type="color"
          value={
            typeof targetNode?.data.groupBackgroundColor === 'string'
              ? targetNode.data.groupBackgroundColor
              : '#64748b'
          }
          className="hidden"
          aria-label={t('context.group.colorAria', '选择分组背景颜色')}
          onChange={(event) => {
            if (!menu.targetId) return;
            takeSnapshot();
            updateNodeData(menu.targetId, { groupBackgroundColor: event.target.value });
            onClose();
          }}
        />
      )}
      {renderMenuPanel(primaryMode)}
      {showSubmenu && (
        <div
          data-testid="canvas-context-submenu"
          className={`absolute ${openSubmenuOnLeft ? 'right-full mr-1' : 'left-full ml-1'}`}
          style={{ top: effectiveSubmenuTop }}
        >
          <div
            data-context-submenu-bridge="true"
            aria-hidden="true"
            className={`absolute inset-y-0 w-1 ${openSubmenuOnLeft ? '-right-1' : '-left-1'}`}
          />
          {renderMenuPanel(mode, submenuMaxHeight)}
        </div>
      )}
    </div>
  );
}
