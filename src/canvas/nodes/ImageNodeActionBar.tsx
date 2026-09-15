import {
  Brush,
  ChevronDown,
  Crop,
  Download,
  Eye,
  Grid3X3,
  ArrowUpRight,
  Library,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Move,
  Paintbrush,
  Palette,
  Scissors,
  Smile,
  Sparkles,
  Type,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NodeToolbar, Position } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { ImageEditorBrushTool, ImageEditorMode } from '../../lib/imageEditing';
import type { ImageEnhancementTool } from '../../lib/imageEnhancement';
import { loadImageActionBarLayout, saveImageActionBarLayout } from '../../lib/imageActionBarLayout';
import { useAppTranslation } from '../../i18n/appI18n';
import { NumberMarkerIcon } from '../../components/NumberMarkerIcon';
import { ActionBarDragStatus, ActionBarInsertionMarker } from './ActionBarDragVisuals';
import {
  ACTION_BAR_ACTIVE_DROP_ZONE_CLASS,
  actionBarDropTargetFromPointer,
  resolveActionBarInsertionBeforeId,
  sameActionBarDropTarget,
  setActionBarDragPreview,
  updateActionBarDropTarget,
  type ActionBarDropGroup,
  type ActionBarDropTarget,
} from './actionBarDragFeedback';

type ActionToolId =
  | 'preview'
  | 'brush'
  | 'label'
  | 'arrow'
  | 'crop'
  | 'resize'
  | 'outpaint'
  | 'mask'
  | 'grid'
  | 'save'
  | 'upload'
  | 'download';

type ActionTool = {
  id: ActionToolId;
  label: string;
  icon: LucideIcon;
  mode?: ImageEditorMode;
  brushTool?: ImageEditorBrushTool;
};

type QuickMenuId = 'person' | 'panorama' | 'quality' | 'elements';
type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  mode?: ImageEditorMode;
  brushTool?: ImageEditorBrushTool;
  enhancement?: ImageEnhancementTool;
  panoramaViewer?: boolean;
};
type QuickMenu = {
  id: QuickMenuId;
  label: string;
  icon: LucideIcon;
  items: QuickAction[];
};

const ACTION_TOOLS: ActionTool[] = [
  { id: 'preview', label: '打开图片编辑器', icon: Eye, mode: 'preview' },
  { id: 'brush', label: '标注 / 画笔', icon: Paintbrush, mode: 'brush' },
  { id: 'label', label: '数字标记', icon: NumberMarkerIcon, mode: 'brush', brushTool: 'label' },
  { id: 'arrow', label: '箭头标注', icon: ArrowUpRight, mode: 'brush', brushTool: 'arrow' },
  { id: 'crop', label: '裁剪', icon: Crop, mode: 'crop' },
  { id: 'resize', label: '缩放', icon: Minimize2, mode: 'resize' },
  { id: 'outpaint', label: '扩图', icon: Maximize2, mode: 'outpaint' },
  { id: 'mask', label: '遮罩', icon: Brush, mode: 'mask' },
  { id: 'grid', label: '宫格切分', icon: Grid3X3, mode: 'grid' },
  { id: 'save', label: '保存到素材库', icon: Library },
  { id: 'upload', label: '替换图片', icon: Upload },
  { id: 'download', label: '下载图片', icon: Download },
];

const INITIAL_PRIMARY: ActionToolId[] = ['preview', 'crop', 'label', 'download'];
const INITIAL_OVERFLOW: ActionToolId[] = [
  'brush',
  'arrow',
  'resize',
  'outpaint',
  'mask',
  'grid',
  'save',
  'upload',
];
const INITIAL_QUICK_PRIMARY: QuickMenuId[] = [];
const INITIAL_QUICK_OVERFLOW: QuickMenuId[] = ['person', 'panorama', 'quality', 'elements'];
const ACTION_TOOL_DRAG_TYPE = 'application/x-qiansi-image-toolbar-item';
const QUICK_MENU_DRAG_TYPE = 'application/x-qiansi-image-quick-menu';
const LABELED_PRIMARY_TOOLS = new Set<ActionToolId>(['crop']);

const QUICK_MENUS: QuickMenu[] = [
  {
    id: 'person',
    label: '人物调节',
    icon: User,
    items: [
      { id: 'face-control', label: '面部控制', icon: Smile, enhancement: 'face-control' },
      { id: 'pose-adjust', label: '姿态调整', icon: Move, enhancement: 'pose-adjust' },
    ],
  },
  {
    id: 'panorama',
    label: '全景图',
    icon: Maximize2,
    items: [
      { id: 'generate-panorama', label: '生成全景图', icon: Sparkles, enhancement: 'panorama' },
      { id: 'enter-panorama', label: '进入全景', icon: Eye, panoramaViewer: true },
    ],
  },
  {
    id: 'quality',
    label: '图像画质',
    icon: Sparkles,
    items: [
      { id: 'quality-restore', label: '高清修复', icon: Sparkles, enhancement: 'quality-restore' },
      { id: 'color-grade', label: '电影调色', icon: Palette, enhancement: 'color-grade' },
    ],
  },
  {
    id: 'elements',
    label: '编辑元素',
    icon: Scissors,
    items: [
      { id: 'portrait-cutout', label: '人像抠图', icon: User, enhancement: 'portrait-cutout' },
      { id: 'cutout', label: '智能扣图', icon: Scissors, enhancement: 'cutout' },
      { id: 'remove-text', label: '去文字', icon: Type, enhancement: 'remove-text' },
    ],
  },
];

type ImageNodeActionBarProps = {
  onEdit: (mode: ImageEditorMode, brushTool?: ImageEditorBrushTool) => void;
  onUpload: () => void;
  onDownload: () => void;
  onSaveAsset: () => void;
  onEnhance: (tool: ImageEnhancementTool) => void;
  onEnterPanorama: () => void;
  savedToAssetLibrary: boolean;
  showUpload: boolean;
  busy: boolean;
};

export function ImageNodeActionBar({
  onEdit,
  onUpload,
  onDownload,
  onSaveAsset,
  onEnhance,
  onEnterPanorama,
  savedToAssetLibrary,
  showUpload,
  busy,
}: ImageNodeActionBarProps) {
  const { t } = useAppTranslation();
  const initialLayout = useMemo(
    () =>
      loadImageActionBarLayout(
        ACTION_TOOLS.map((tool) => tool.id),
        QUICK_MENUS.map((menu) => menu.id),
        {
          primaryIds: INITIAL_PRIMARY,
          overflowIds: INITIAL_OVERFLOW,
          quickPrimaryIds: INITIAL_QUICK_PRIMARY,
          quickOverflowIds: INITIAL_QUICK_OVERFLOW,
        },
      ),
    [],
  );
  const [primaryIds, setPrimaryIds] = useState<ActionToolId[]>(
    initialLayout.primaryIds as ActionToolId[],
  );
  const [overflowIds, setOverflowIds] = useState<ActionToolId[]>(
    initialLayout.overflowIds as ActionToolId[],
  );
  const [quickPrimaryIds, setQuickPrimaryIds] = useState<QuickMenuId[]>(
    initialLayout.quickPrimaryIds as QuickMenuId[],
  );
  const [quickOverflowIds, setQuickOverflowIds] = useState<QuickMenuId[]>(
    initialLayout.quickOverflowIds as QuickMenuId[],
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState<QuickMenuId | null>(null);
  const [draggedId, setDraggedId] = useState<ActionToolId | null>(null);
  const [draggedQuickId, setDraggedQuickId] = useState<QuickMenuId | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ActionBarDropTarget | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toolById = useMemo(() => new Map(ACTION_TOOLS.map((tool) => [tool.id, tool])), []);
  const quickMenuById = useMemo(() => new Map(QUICK_MENUS.map((menu) => [menu.id, menu])), []);

  useEffect(() => {
    saveImageActionBarLayout({ primaryIds, overflowIds, quickPrimaryIds, quickOverflowIds });
  }, [overflowIds, primaryIds, quickOverflowIds, quickPrimaryIds]);

  useEffect(() => {
    if (!moreOpen && !quickMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
        setQuickMenuOpen(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        setQuickMenuOpen(null);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen, quickMenuOpen]);

  function moveTool(id: ActionToolId, target: 'primary' | 'overflow', beforeId?: ActionToolId) {
    if (target === 'primary' && primaryIds.includes(id) && beforeId === id) return;
    if (target === 'overflow' && overflowIds.includes(id) && beforeId === id) return;

    const nextPrimary = primaryIds.filter((item) => item !== id);
    const nextOverflow = overflowIds.filter((item) => item !== id);
    const targetList = target === 'primary' ? nextPrimary : nextOverflow;
    const insertAt = beforeId ? targetList.indexOf(beforeId) : -1;
    if (insertAt >= 0) targetList.splice(insertAt, 0, id);
    else targetList.push(id);
    saveImageActionBarLayout({
      primaryIds: nextPrimary,
      overflowIds: nextOverflow,
      quickPrimaryIds,
      quickOverflowIds,
    });
    setPrimaryIds(nextPrimary);
    setOverflowIds(nextOverflow);
  }

  function moveQuickMenu(id: QuickMenuId, target: 'primary' | 'overflow', beforeId?: QuickMenuId) {
    if (target === 'primary' && quickPrimaryIds.includes(id) && beforeId === id) return;
    if (target === 'overflow' && quickOverflowIds.includes(id) && beforeId === id) return;

    const nextPrimary = quickPrimaryIds.filter((item) => item !== id);
    const nextOverflow = quickOverflowIds.filter((item) => item !== id);
    const targetList = target === 'primary' ? nextPrimary : nextOverflow;
    const insertAt = beforeId ? targetList.indexOf(beforeId) : -1;
    if (insertAt >= 0) targetList.splice(insertAt, 0, id);
    else targetList.push(id);
    saveImageActionBarLayout({
      primaryIds,
      overflowIds,
      quickPrimaryIds: nextPrimary,
      quickOverflowIds: nextOverflow,
    });
    setQuickPrimaryIds(nextPrimary);
    setQuickOverflowIds(nextOverflow);
  }

  function handleTool(id: ActionToolId) {
    const tool = toolById.get(id);
    if (!tool) return;
    if (tool.mode) {
      onEdit(tool.mode, tool.brushTool);
      setMoreOpen(false);
      return;
    }
    if (id === 'upload') onUpload();
    if (id === 'download') onDownload();
    if (id === 'save') onSaveAsset();
  }

  function handleQuickAction(action: QuickAction) {
    if (action.mode) onEdit(action.mode, action.brushTool);
    if (action.enhancement) onEnhance(action.enhancement);
    if (action.panoramaViewer) onEnterPanorama();
    setQuickMenuOpen(null);
  }

  function finishDrag() {
    setDraggedId(null);
    setDraggedQuickId(null);
    setDragLabel(null);
    setDropTarget(null);
  }

  function showDropTarget(
    event: DragEvent<HTMLElement>,
    group: ActionBarDropGroup,
    itemId: string | null,
  ) {
    updateActionBarDropTarget(event, group, itemId, (nextTarget) => {
      setDropTarget((currentTarget) =>
        sameActionBarDropTarget(currentTarget, nextTarget) ? currentTarget : nextTarget,
      );
    });
  }

  function dropDraggedItem(
    event: DragEvent<HTMLElement>,
    group: ActionBarDropGroup,
    hoveredToolId: ActionToolId | null = null,
    hoveredQuickId: QuickMenuId | null = null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const quickSourceId = (event.dataTransfer.getData(QUICK_MENU_DRAG_TYPE) ||
      draggedQuickId) as QuickMenuId;
    const hoveredId = quickSourceId ? hoveredQuickId : hoveredToolId;
    const target = actionBarDropTargetFromPointer(
      group,
      hoveredId,
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
    );
    if (quickSourceId && quickMenuById.has(quickSourceId)) {
      const orderedIds = group === 'primary' ? quickPrimaryIds : quickOverflowIds;
      moveQuickMenu(
        quickSourceId,
        group,
        resolveActionBarInsertionBeforeId(orderedIds, quickSourceId, target),
      );
      finishDrag();
      return;
    }
    const sourceId = (event.dataTransfer.getData(ACTION_TOOL_DRAG_TYPE) ||
      draggedId) as ActionToolId;
    if (sourceId && toolById.has(sourceId)) {
      const orderedIds = group === 'primary' ? primaryIds : overflowIds;
      moveTool(sourceId, group, resolveActionBarInsertionBeforeId(orderedIds, sourceId, target));
    }
    finishDrag();
  }

  function renderQuickMenu(menu: QuickMenu, group: 'primary' | 'overflow') {
    const MenuIcon = menu.icon;
    const open = quickMenuOpen === menu.id;
    const menuLabel = t(`imageAction.menu.${menu.id}`, menu.label);
    return (
      <div key={menu.id} className="relative shrink-0">
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(QUICK_MENU_DRAG_TYPE, menu.id);
            event.dataTransfer.setData('text/plain', menu.id);
            setActionBarDragPreview(event.dataTransfer, menuLabel);
            setDraggedQuickId(menu.id);
            setDraggedId(null);
            setDragLabel(menuLabel);
            setDropTarget({ group, itemId: null, side: 'after' });
            setMoreOpen(true);
            setQuickMenuOpen(null);
          }}
          onDragEnd={finishDrag}
          onDragOver={(event) => {
            event.stopPropagation();
            const isQuickDrag =
              Boolean(draggedQuickId) || event.dataTransfer.types.includes(QUICK_MENU_DRAG_TYPE);
            showDropTarget(event, group, isQuickDrag ? menu.id : null);
          }}
          onDrop={(event) => dropDraggedItem(event, group, null, menu.id)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setQuickMenuOpen((current) => (current === menu.id ? null : menu.id));
            if (group === 'primary') setMoreOpen(false);
          }}
          className={`nodrag nopan flex h-8 shrink-0 cursor-grab items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] transition-colors active:cursor-grabbing ${
            open ? 'bg-white/12 text-white' : 'text-white/78 hover:bg-white/10 hover:text-white'
          } ${draggedQuickId === menu.id ? 'opacity-40' : ''}`}
          aria-expanded={open}
          title={t('imageAction.draggable', '{label} · 可拖动调整位置', {
            label: menuLabel,
          })}
        >
          <ActionBarInsertionMarker target={dropTarget} group={group} itemId={menu.id} />
          <MenuIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">{menuLabel}</span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open && (
          <div
            className={`absolute top-full z-20 mt-1.5 min-w-36 rounded-xl border border-white/10 bg-[#202024]/[0.98] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.58)] backdrop-blur-xl ${
              menu.id === 'elements' ? 'right-0' : 'left-0'
            }`}
          >
            {menu.items.map((action) => {
              const ActionIcon = action.icon;
              const disabled = busy && Boolean(action.enhancement);
              const actionLabel = t(`imageAction.quick.${action.id}`, action.label);
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={disabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleQuickAction(action);
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] text-white/78 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-35"
                >
                  <ActionIcon className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span className="whitespace-nowrap">{actionLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderTool(id: ActionToolId, group: 'primary' | 'overflow') {
    if (id === 'upload' && !showUpload) return null;
    const tool = toolById.get(id);
    if (!tool) return null;
    const Icon = tool.icon;
    const isSaved = id === 'save' && savedToAssetLibrary;
    const toolLabel = t(`imageAction.tool.${tool.id}`, tool.label);
    const showLabel = group === 'primary' && LABELED_PRIMARY_TOOLS.has(id);
    const shortLabel = toolLabel;
    return (
      <button
        key={id}
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(ACTION_TOOL_DRAG_TYPE, id);
          event.dataTransfer.setData('text/plain', id);
          setActionBarDragPreview(event.dataTransfer, toolLabel);
          setDraggedId(id);
          setDraggedQuickId(null);
          setDragLabel(toolLabel);
          setDropTarget({ group, itemId: null, side: 'after' });
          setMoreOpen(true);
        }}
        onDragEnd={finishDrag}
        onDragOver={(event) => {
          event.stopPropagation();
          const isQuickDrag =
            Boolean(draggedQuickId) || event.dataTransfer.types.includes(QUICK_MENU_DRAG_TYPE);
          const isActionDrag =
            Boolean(draggedId) || event.dataTransfer.types.includes(ACTION_TOOL_DRAG_TYPE);
          showDropTarget(event, group, !isQuickDrag && isActionDrag ? id : null);
        }}
        onDrop={(event) => dropDraggedItem(event, group, id)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          handleTool(id);
        }}
        className={`nodrag nopan relative flex h-8 shrink-0 cursor-grab items-center justify-center gap-1.5 rounded-lg transition-colors active:cursor-grabbing ${
          showLabel ? 'px-2.5 text-[12px]' : 'w-8'
        } ${
          isSaved
            ? 'bg-emerald-300/10 text-emerald-200'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
        } ${draggedId === id ? 'opacity-40' : ''}`}
        title={t('imageAction.draggable', '{label} · 可拖动调整位置', {
          label: toolLabel,
        })}
        aria-label={toolLabel}
      >
        <ActionBarInsertionMarker target={dropTarget} group={group} itemId={id} />
        <Icon className="h-3.5 w-3.5" />
        {showLabel && <span className="whitespace-nowrap">{shortLabel}</span>}
      </button>
    );
  }

  const downloadIndex = primaryIds.indexOf('download');
  const primaryBeforeMore = downloadIndex >= 0 ? primaryIds.slice(0, downloadIndex) : primaryIds;
  const primaryAfterMore = downloadIndex >= 0 ? primaryIds.slice(downloadIndex) : [];

  return (
    <NodeToolbar
      isVisible
      position={Position.Top}
      offset={36}
      align="center"
      className="nodrag nopan pointer-events-auto z-[70]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={barRef} className="relative">
        <ActionBarDragStatus
          label={dragLabel}
          target={dropTarget}
          primaryLabel={t('toolbarDrag.dropPrimary', '松手放到常用栏')}
          overflowLabel={t('toolbarDrag.dropOverflow', '松手收纳到更多工具')}
          idleHint={t('toolbarDrag.chooseTarget', '拖到蓝色标记处')}
        />
        <div
          data-action-bar-drop-zone="primary"
          className={`flex h-11 items-center gap-1 rounded-xl border px-2 backdrop-blur-xl transition-[border-color,background-color,box-shadow] ${
            dropTarget?.group === 'primary'
              ? ACTION_BAR_ACTIVE_DROP_ZONE_CLASS
              : 'border-white/[0.1] bg-[#18181b]/95 shadow-[0_12px_35px_rgba(0,0,0,0.5)]'
          }`}
          onDragOver={(event) => showDropTarget(event, 'primary', null)}
          onDrop={(event) => dropDraggedItem(event, 'primary')}
        >
          {primaryBeforeMore.map((id) => renderTool(id, 'primary'))}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setMoreOpen((open) => !open);
              setQuickMenuOpen(null);
            }}
            className={`nodrag nopan flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              moreOpen
                ? 'border-white/20 bg-white text-black'
                : 'border-white/[0.08] bg-[#25252a] text-white/75 hover:border-white/20 hover:bg-[#303038] hover:text-white'
            }`}
            aria-label={
              moreOpen
                ? t('imageAction.collapseMore', '收起更多图片工具')
                : t('imageAction.expandMore', '展开更多图片工具')
            }
            aria-expanded={moreOpen}
            title={t('imageAction.moreTools', '更多图片工具')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {primaryAfterMore.map((id) => renderTool(id, 'primary'))}
          {quickPrimaryIds.map((id) => {
            const menu = quickMenuById.get(id);
            return menu ? renderQuickMenu(menu, 'primary') : null;
          })}
        </div>

        {moreOpen && (
          <div
            data-action-bar-drop-zone="overflow"
            className={`absolute left-1/2 top-full mt-2 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 backdrop-blur-xl transition-[border-color,background-color,box-shadow] ${
              dropTarget?.group === 'overflow'
                ? ACTION_BAR_ACTIVE_DROP_ZONE_CLASS
                : 'border-white/[0.1] bg-[#1c1c20]/[0.98] shadow-[0_14px_38px_rgba(0,0,0,0.55)]'
            }`}
            onDragOver={(event) => showDropTarget(event, 'overflow', null)}
            onDrop={(event) => dropDraggedItem(event, 'overflow')}
          >
            {overflowIds.length > 0 || quickOverflowIds.length > 0 ? (
              <>
                {overflowIds.map((id) => renderTool(id, 'overflow'))}
                {quickOverflowIds.map((id) => {
                  const menu = quickMenuById.get(id);
                  return menu ? renderQuickMenu(menu, 'overflow') : null;
                })}
              </>
            ) : (
              <span className="px-2 text-[10px] text-white/35">
                {t('imageAction.dragToolsHere', '把工具拖到这里')}
              </span>
            )}
            <div
              className="ml-1 flex h-8 min-w-7 items-center justify-center rounded-lg border border-dashed border-white/15 px-1 text-[10px] text-white/30"
              onDragOver={(event) => {
                event.stopPropagation();
                showDropTarget(event, 'overflow', null);
              }}
              onDrop={(event) => dropDraggedItem(event, 'overflow')}
              title={t('imageAction.storeToolsHere', '拖到这里收纳工具')}
            >
              ↓
            </div>
          </div>
        )}
      </div>
    </NodeToolbar>
  );
}
