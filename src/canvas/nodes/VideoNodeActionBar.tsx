import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ReactNode,
} from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import {
  Camera,
  Captions,
  Check,
  ChevronDown,
  Clock3,
  Crop,
  Download,
  FileText,
  Images,
  Maximize2,
  Music2,
  MoreHorizontal,
  PanelBottom,
  PanelTop,
  Pencil,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { useAppTranslation } from '../../i18n/appI18n';
import { loadVideoActionBarLayout, saveVideoActionBarLayout } from '../../lib/videoActionBarLayout';
import { useModelCatalogStore } from '../../lib/modelCatalog';
import { hasReadyVideoOperation } from './videoToolState';
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

export type VideoToolAction = 'edit' | 'remake' | 'crop' | 'animated-image' | 'enhance' | 'extend';
export type SubtitleRemovalRegion = 'auto' | 'bottom' | 'top';

type OpenMenu = 'subtitles' | 'audio' | 'frames' | null;
type MenuHelp = { title: string; description: string } | null;
type VideoToolbarItemId = VideoToolAction | Exclude<OpenMenu, null> | 'download' | 'fullscreen';

type VideoNodeActionBarProps = {
  busy: boolean;
  activeTool?: VideoToolAction | null;
  onTool: (action: VideoToolAction) => void;
  onRemoveSubtitles: (region: SubtitleRemovalRegion) => void;
  onExtractAudio: () => void;
  onVisualEdit: () => void;
  onCaptureFrame: (point: 'first' | 'last' | 'current') => void;
  onDownload: () => void;
  onFullscreen: () => void;
};

type Tool = {
  id: VideoToolAction;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const TOOLS: Tool[] = [
  { id: 'edit', label: '剪辑', icon: Scissors },
  { id: 'remake', label: '片段重拍', icon: RotateCcw },
  { id: 'crop', label: '裁剪', icon: Crop },
  { id: 'animated-image', label: '转动态图', icon: Images },
  { id: 'enhance', label: '高清', icon: Sparkles },
  { id: 'extend', label: '智能续写', icon: Clock3 },
];

const VIDEO_TOOLBAR_IDS: VideoToolbarItemId[] = [
  'edit',
  'remake',
  'crop',
  'animated-image',
  'enhance',
  'extend',
  'subtitles',
  'audio',
  'frames',
  'download',
  'fullscreen',
];
const DEFAULT_VIDEO_TOOLBAR_LAYOUT = {
  primaryIds: VIDEO_TOOLBAR_IDS,
  overflowIds: [] as VideoToolbarItemId[],
};
const VIDEO_TOOLBAR_DRAG_TYPE = 'application/x-qiansi-video-toolbar-item';

const SUBTITLE_OPTIONS: Array<{
  region: SubtitleRemovalRegion;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    region: 'auto',
    label: '自动识别全部字幕',
    description: '检测整幅画面的后期叠加字幕并逐帧修复',
    icon: Captions,
  },
  {
    region: 'bottom',
    label: '仅去除底部字幕',
    description: '约束模型只处理画面下方的字幕区域',
    icon: PanelBottom,
  },
  {
    region: 'top',
    label: '仅去除顶部字幕',
    description: '约束模型只处理画面上方的字幕区域',
    icon: PanelTop,
  },
];

const FRAME_OPTIONS: Array<{
  point: 'first' | 'last' | 'current';
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { point: 'first', label: '截取首帧', icon: SkipBack },
  { point: 'current', label: '截取当前帧', icon: Camera },
  { point: 'last', label: '截取尾帧', icon: SkipForward },
];

function MenuButton({
  open,
  disabled,
  label,
  icon: Icon,
  onClick,
}: {
  open: boolean;
  disabled: boolean;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-colors disabled:cursor-wait disabled:opacity-35 ${
        open ? 'bg-white/12 text-white' : 'text-white/78 hover:bg-white/10 hover:text-white'
      }`}
      title={label}
      aria-expanded={open}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function MenuHelpCard({ help }: { help: Exclude<MenuHelp, null> }) {
  const { t } = useAppTranslation();
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+8px)] top-0 z-30 w-64 rounded-lg border border-cyan-300/35 bg-[#10282b]/[0.98] px-3 py-2.5 text-left shadow-[0_14px_35px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      <div className="text-[12px] font-semibold text-cyan-100">
        {t('node.video.help.title', '功能说明：{title}', { title: help.title })}
      </div>
      <div className="mt-1 text-[12px] leading-5 text-cyan-50/85">{help.description}</div>
    </div>
  );
}

export function VideoNodeActionBar({
  busy,
  activeTool,
  onTool,
  onRemoveSubtitles,
  onExtractAudio,
  onVisualEdit,
  onCaptureFrame,
  onDownload,
  onFullscreen,
}: VideoNodeActionBarProps) {
  const { t } = useAppTranslation();
  const readyVideoModels = useModelCatalogStore((catalog) => catalog.readyModels.video);
  const supportsOperation = (operation: Parameters<typeof hasReadyVideoOperation>[1]) =>
    hasReadyVideoOperation(readyVideoModels, operation);
  const initialLayout = useMemo(
    () => loadVideoActionBarLayout(VIDEO_TOOLBAR_IDS, DEFAULT_VIDEO_TOOLBAR_LAYOUT),
    [],
  );
  const [primaryIds, setPrimaryIds] = useState<VideoToolbarItemId[]>(
    initialLayout.primaryIds as VideoToolbarItemId[],
  );
  const [overflowIds, setOverflowIds] = useState<VideoToolbarItemId[]>(
    initialLayout.overflowIds as VideoToolbarItemId[],
  );
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuHelp, setMenuHelp] = useState<MenuHelp>(null);
  const [draggedId, setDraggedId] = useState<VideoToolbarItemId | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ActionBarDropTarget | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toolById = useMemo(() => new Map(TOOLS.map((tool) => [tool.id, tool])), []);
  const fullAudioHelp = {
    title: t('node.video.audio.full.title', '提取完整原声音轨'),
    description: t(
      'node.video.audio.full.description',
      '在本机提取视频中的完整混合音轨，生成可播放并可保存的音频节点。',
    ),
  };
  const voiceSeparationHelp = {
    title: t('node.video.audio.separation.title', '人声 / 伴奏分轨'),
    description: t(
      'node.video.audio.separation.description',
      '把人声与背景音乐拆成独立音轨。当前未安装 Demucs / UVR 声源分离引擎，因此暂不可用。',
    ),
  };
  const visualEditHelp = {
    title: t('node.video.visualEdit.helpTitle', 'AI 画面编辑'),
    description: t(
      'node.video.visualEdit.helpDescription',
      '创建连接原视频的编辑节点，在新节点的指令框中描述需要修改的画面内容。',
    ),
  };

  useEffect(() => {
    saveVideoActionBarLayout({ primaryIds, overflowIds });
  }, [overflowIds, primaryIds]);

  useEffect(() => {
    if (!openMenu && !moreOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen, openMenu]);

  const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
    setMenuHelp(null);
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  function toolbarItemLabel(id: VideoToolbarItemId) {
    const tool = toolById.get(id as VideoToolAction);
    if (tool) return t(`node.video.${tool.id}`, tool.label);
    switch (id) {
      case 'subtitles':
        return t('node.video.subtitles', '智能去字幕');
      case 'audio':
        return t('node.video.audio', '音频分离');
      case 'frames':
        return supportsOperation('visual-edit')
          ? t('node.video.visualEdit', '画面编辑')
          : t('node.video.captureFrame', '截取帧');
      case 'download':
        return t('node.video.download', '下载视频');
      default:
        return t('node.video.fullscreen', '放大预览');
    }
  }

  function finishDrag() {
    setDraggedId(null);
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
    hoveredId: VideoToolbarItemId | null = null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const target = actionBarDropTargetFromPointer(
      group,
      hoveredId,
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
    );
    const sourceId = (event.dataTransfer.getData(VIDEO_TOOLBAR_DRAG_TYPE) ||
      draggedId) as VideoToolbarItemId;
    if (VIDEO_TOOLBAR_IDS.includes(sourceId)) {
      const orderedIds = group === 'primary' ? primaryIds : overflowIds;
      moveItem(sourceId, group, resolveActionBarInsertionBeforeId(orderedIds, sourceId, target));
    }
    finishDrag();
  }

  function moveItem(
    id: VideoToolbarItemId,
    target: 'primary' | 'overflow',
    beforeId?: VideoToolbarItemId,
  ) {
    if (target === 'primary' && primaryIds.includes(id) && beforeId === id) return;
    if (target === 'overflow' && overflowIds.includes(id) && beforeId === id) return;

    const nextPrimary = primaryIds.filter((item) => item !== id);
    const nextOverflow = overflowIds.filter((item) => item !== id);
    const targetList = target === 'primary' ? nextPrimary : nextOverflow;
    const insertAt = beforeId ? targetList.indexOf(beforeId) : -1;
    if (insertAt >= 0) targetList.splice(insertAt, 0, id);
    else targetList.push(id);
    saveVideoActionBarLayout({ primaryIds: nextPrimary, overflowIds: nextOverflow });
    setPrimaryIds(nextPrimary);
    setOverflowIds(nextOverflow);
  }

  function wrapDraggableItem(
    id: VideoToolbarItemId,
    group: 'primary' | 'overflow',
    content: ReactNode,
  ) {
    const itemLabel = toolbarItemLabel(id);
    return (
      <div
        key={id}
        draggable
        className={`relative shrink-0 cursor-grab active:cursor-grabbing ${draggedId === id ? 'opacity-40' : ''}`}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(VIDEO_TOOLBAR_DRAG_TYPE, id);
          event.dataTransfer.setData('text/plain', id);
          setActionBarDragPreview(event.dataTransfer, itemLabel);
          setDraggedId(id);
          setDragLabel(itemLabel);
          setDropTarget({ group, itemId: null, side: 'after' });
          setMoreOpen(true);
          setOpenMenu(null);
        }}
        onDragEnd={finishDrag}
        onDragOver={(event) => {
          event.stopPropagation();
          showDropTarget(event, group, id);
        }}
        onDrop={(event) => dropDraggedItem(event, group, id)}
      >
        {content}
        <ActionBarInsertionMarker target={dropTarget} group={group} itemId={id} />
      </div>
    );
  }

  function renderToolbarItem(id: VideoToolbarItemId, group: 'primary' | 'overflow') {
    const tool = toolById.get(id as VideoToolAction);
    if (tool) {
      if ((tool.id === 'enhance' || tool.id === 'extend') && !supportsOperation(tool.id)) {
        return null;
      }
      const Icon = tool.icon;
      const active = activeTool === tool.id;
      const label = t(`node.video.${tool.id}`, tool.label);
      return wrapDraggableItem(
        id,
        group,
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpenMenu(null);
            setMoreOpen(false);
            onTool(tool.id);
          }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-colors disabled:cursor-wait disabled:opacity-35 ${active ? 'bg-white text-black' : 'text-white/78 hover:bg-white/10 hover:text-white'}`}
          title={t('node.video.draggable', '{label} · 可拖动调整位置', { label })}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>,
      );
    }

    if (id === 'subtitles') {
      if (!supportsOperation('remove-subtitles')) return null;
      return wrapDraggableItem(
        id,
        group,
        <>
          <MenuButton
            open={openMenu === 'subtitles'}
            disabled={busy}
            label={t('node.video.subtitles', '智能去字幕')}
            icon={FileText}
            onClick={() => toggleMenu('subtitles')}
          />
          {openMenu === 'subtitles' && (
            <div className="absolute right-0 top-full z-20 mt-1.5">
              <div className="w-52 rounded-xl border border-white/10 bg-[#202024]/[0.98] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
                {SUBTITLE_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  const label = t(`node.video.subtitle.${option.region}.label`, option.label);
                  const description = t(
                    `node.video.subtitle.${option.region}.description`,
                    option.description,
                  );
                  return (
                    <button
                      key={option.region}
                      type="button"
                      onMouseEnter={() => setMenuHelp({ title: label, description })}
                      onMouseLeave={() => setMenuHelp(null)}
                      onFocus={() => setMenuHelp({ title: label, description })}
                      onBlur={() => setMenuHelp(null)}
                      onClick={() => {
                        setMenuHelp(null);
                        setOpenMenu(null);
                        setMoreOpen(false);
                        onRemoveSubtitles(option.region);
                      }}
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-white/88 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none"
                    >
                      <OptionIcon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                    </button>
                  );
                })}
              </div>
              {menuHelp && <MenuHelpCard help={menuHelp} />}
            </div>
          )}
        </>,
      );
    }

    if (id === 'audio') {
      return wrapDraggableItem(
        id,
        group,
        <>
          <MenuButton
            open={openMenu === 'audio'}
            disabled={busy}
            label={t('node.video.audio', '音频分离')}
            icon={Volume2}
            onClick={() => toggleMenu('audio')}
          />
          {openMenu === 'audio' && (
            <div className="absolute right-0 top-full z-20 mt-1.5">
              <div className="w-52 rounded-xl border border-white/10 bg-[#202024]/[0.98] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
                <button
                  type="button"
                  onMouseEnter={() => setMenuHelp(fullAudioHelp)}
                  onMouseLeave={() => setMenuHelp(null)}
                  onFocus={() => setMenuHelp(fullAudioHelp)}
                  onBlur={() => setMenuHelp(null)}
                  onClick={() => {
                    setMenuHelp(null);
                    setOpenMenu(null);
                    setMoreOpen(false);
                    onExtractAudio();
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-white/88 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none"
                >
                  <Music2 className="h-3.5 w-3.5 shrink-0" />
                  {t('node.video.fullAudio', '提取完整原声音轨')}
                </button>
                <div className="my-1 h-px bg-white/[0.07]" />
                <div
                  role="button"
                  tabIndex={0}
                  aria-disabled="true"
                  onMouseEnter={() => setMenuHelp(voiceSeparationHelp)}
                  onMouseLeave={() => setMenuHelp(null)}
                  onFocus={() => setMenuHelp(voiceSeparationHelp)}
                  onBlur={() => setMenuHelp(null)}
                  className="flex h-9 cursor-not-allowed items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-white/55 opacity-55 focus-visible:bg-white/[0.06] focus-visible:outline-none"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {t('node.video.voiceSeparation', '人声 / 伴奏分轨')}
                </div>
              </div>
              {menuHelp && <MenuHelpCard help={menuHelp} />}
            </div>
          )}
        </>,
      );
    }

    if (id === 'frames') {
      return wrapDraggableItem(
        id,
        group,
        <>
          <MenuButton
            open={openMenu === 'frames'}
            disabled={busy}
            label={
              supportsOperation('visual-edit')
                ? t('node.video.visualEdit', '画面编辑')
                : t('node.video.captureFrame', '截取帧')
            }
            icon={Pencil}
            onClick={() => toggleMenu('frames')}
          />
          {openMenu === 'frames' && (
            <div className="absolute right-0 top-full z-20 mt-1.5">
              <div className="w-48 rounded-xl border border-white/10 bg-[#202024]/[0.98] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
                {supportsOperation('visual-edit') && (
                  <>
                    <button
                      type="button"
                      onMouseEnter={() => setMenuHelp(visualEditHelp)}
                      onMouseLeave={() => setMenuHelp(null)}
                      onFocus={() => setMenuHelp(visualEditHelp)}
                      onBlur={() => setMenuHelp(null)}
                      onClick={() => {
                        setMenuHelp(null);
                        setOpenMenu(null);
                        setMoreOpen(false);
                        onVisualEdit();
                      }}
                      className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-white/88 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none"
                    >
                      <WandSparkles className="h-3.5 w-3.5 shrink-0" />
                      {t('node.video.aiVisualEdit', 'AI 画面编辑')}
                    </button>
                    <div className="my-1 h-px bg-white/[0.07]" />
                  </>
                )}
                {FRAME_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  return (
                    <button
                      key={option.point}
                      type="button"
                      onClick={() => {
                        setMenuHelp(null);
                        setOpenMenu(null);
                        setMoreOpen(false);
                        onCaptureFrame(option.point);
                      }}
                      className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/78 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <OptionIcon className="h-3.5 w-3.5 shrink-0" />
                      {t(`node.video.${option.point}Frame`, option.label)}
                    </button>
                  );
                })}
              </div>
              {menuHelp && <MenuHelpCard help={menuHelp} />}
            </div>
          )}
        </>,
      );
    }

    const action =
      id === 'download'
        ? {
            icon: Download,
            label: t('node.video.download', '下载视频'),
            run: onDownload,
          }
        : {
            icon: Maximize2,
            label: t('node.video.fullscreen', '放大预览'),
            run: onFullscreen,
          };
    const ActionIcon = action.icon;
    return wrapDraggableItem(
      id,
      group,
      <button
        type="button"
        onClick={() => {
          setMoreOpen(false);
          action.run();
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        title={t('node.video.draggable', '{label} · 可拖动调整位置', {
          label: action.label,
        })}
        aria-label={action.label}
      >
        <ActionIcon className="h-4 w-4" />
      </button>,
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
          {primaryBeforeMore.map((id) => renderToolbarItem(id, 'primary'))}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setMoreOpen((open) => !open);
              setOpenMenu(null);
              setMenuHelp(null);
            }}
            className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              moreOpen
                ? 'border-white/20 bg-white text-black'
                : 'border-white/[0.08] bg-[#25252a] text-white/75 hover:border-white/20 hover:bg-[#303038] hover:text-white'
            }`}
            aria-label={
              moreOpen
                ? t('node.video.collapseMore', '收起更多视频工具')
                : t('node.video.expandMore', '展开更多视频工具')
            }
            aria-expanded={moreOpen}
            title={t('node.video.moreTools', '更多视频工具')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {primaryAfterMore.map((id) => renderToolbarItem(id, 'primary'))}
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
            {overflowIds.length > 0 ? (
              overflowIds.map((id) => renderToolbarItem(id, 'overflow'))
            ) : (
              <span className="px-2 text-[10px] text-white/35">
                {t('node.video.dragToolsHere', '把视频工具拖到这里')}
              </span>
            )}
            <div
              className="ml-1 flex h-8 min-w-7 items-center justify-center rounded-lg border border-dashed border-white/15 px-1 text-[10px] text-white/30"
              onDragOver={(event) => {
                event.stopPropagation();
                showDropTarget(event, 'overflow', null);
              }}
              onDrop={(event) => dropDraggedItem(event, 'overflow')}
              title={t('node.video.storeToolsHere', '拖到这里收纳视频工具')}
            >
              ↓
            </div>
          </div>
        )}
      </div>
    </NodeToolbar>
  );
}
