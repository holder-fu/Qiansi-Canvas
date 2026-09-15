import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { lazyFeature as lazy } from './components/LazyFeature';
import { WebBuildUpdateNotice } from './components/WebBuildUpdateNotice';
import { ReactFlowProvider, useStore, useReactFlow } from '@xyflow/react';
import { Header } from './components/Header';
import { PluginWidgetLayer } from './components/PluginWidgetLayer';
import { PluginLanguageRuntime } from './i18n/PluginLanguageRuntime';
import { Home } from './components/Home';
import { FlowCanvas } from './canvas/FlowCanvas';
import { Toolbar } from './components/Toolbar';
import { useCanvasStore, type ModalKind } from './store/canvasStore';
import {
  FolderOpen,
  Layers,
  Search,
  Maximize,
  Minimize,
  Magnet,
  Slash,
  Compass,
  Keyboard,
  Trash2,
  ZoomOut,
  ZoomIn,
  RotateCcw,
  Spline,
} from 'lucide-react';
import { NODE_W, NODE_H } from './canvas/constants';
import { registerCanvasScreenToFlowPosition } from './canvas/canvasViewportRuntime';
import {
  isSelectAllCanvasNodesShortcut,
  isTextEditingShortcutTarget,
} from './canvas/canvasEditingShortcuts';
import {
  useCanvasPreferences,
  type ToolbarControlId,
  type ToolbarMode,
} from './store/canvasPreferences';
import { CanvasThemeRuntime } from './theme/CanvasThemeRuntime';
import { AppLanguageRuntime, useAppTranslation } from './i18n/appI18n';
import { startDeferredAppRuntimes } from './lib/deferredAppRuntimes';

const AssetPanel = lazy(() =>
  import('./components/AssetPanel').then((module) => ({ default: module.AssetPanel })),
);
const SearchPanel = lazy(() =>
  import('./components/SearchPanel').then((module) => ({ default: module.SearchPanel })),
);
const LayerPanel = lazy(() =>
  import('./components/LayerPanel').then((module) => ({ default: module.LayerPanel })),
);
const StyleLibraryModal = lazy(
  () =>
    import('./components/StyleLibraryModal').then((module) => ({
      default: module.StyleLibraryModal,
    })),
  'style-library',
);
const EffectsLibraryModal = lazy(
  () =>
    import('./components/EffectsLibraryModal').then((module) => ({
      default: module.EffectsLibraryModal,
    })),
  'effects-library',
);
const CharacterLibraryModal = lazy(
  () =>
    import('./components/CharacterLibraryModal').then((module) => ({
      default: module.CharacterLibraryModal,
    })),
  'character-library',
);
const PromptLibraryModal = lazy(
  () =>
    import('./components/PromptLibraryModal').then((module) => ({
      default: module.PromptLibraryModal,
    })),
  'prompt-library',
);
const CameraLibraryModal = lazy(
  () =>
    import('./components/CameraLibraryModal').then((module) => ({
      default: module.CameraLibraryModal,
    })),
  'camera-library',
);
const MediaPreviewModal = lazy(
  () =>
    import('./components/MediaPreviewModal').then((module) => ({
      default: module.MediaPreviewModal,
    })),
  'media-preview',
);
const PanoramaViewerModal = lazy(
  () =>
    import('./components/PanoramaViewerModal').then((module) => ({
      default: module.PanoramaViewerModal,
    })),
  'panorama-viewer',
);
const ColorGradingModal = lazy(
  () =>
    import('./components/ColorGradingModal').then((module) => ({
      default: module.ColorGradingModal,
    })),
  'color-grading',
);
const ImageEditorModal = lazy(
  () =>
    import('./components/ImageEditorModal').then((module) => ({
      default: module.ImageEditorModal,
    })),
  'image-editor',
);
const FaceControlModal = lazy(
  () =>
    import('./components/FaceControlModal').then((module) => ({
      default: module.FaceControlModal,
    })),
  'face-control',
);
const PoseControlModal = lazy(
  () =>
    import('./components/PoseControlModal').then((module) => ({
      default: module.PoseControlModal,
    })),
  'pose-control',
);
const DirectorThreeStudioModal = lazy(
  () =>
    import('./components/DirectorThreeStudioModal').then((module) => ({
      default: module.DirectorThreeStudioModal,
    })),
  'director-studio',
);
const FlatDirectorStudioModal = lazy(
  () =>
    import('./components/FlatDirectorStudioModal').then((module) => ({
      default: module.FlatDirectorStudioModal,
    })),
  'director-studio-2d',
);
const NodeParamsPanel = lazy(
  () =>
    import('./components/NodeParamsPanel').then((module) => ({ default: module.NodeParamsPanel })),
  'node-params',
);
const DeleteConfirmDialog = lazy(() =>
  import('./components/DeleteConfirmDialog').then((module) => ({
    default: module.DeleteConfirmDialog,
  })),
);
const TrashModal = lazy(
  () => import('./components/TrashModal').then((module) => ({ default: module.TrashModal })),
  'trash',
);
const ShortcutsModal = lazy(
  () =>
    import('./components/ShortcutsModal').then((module) => ({ default: module.ShortcutsModal })),
  'shortcuts',
);

function ZoomMenu({
  miniMapVisible,
  onToggleMiniMap,
}: {
  miniMapVisible: boolean;
  onToggleMiniMap: () => void;
}) {
  const { t } = useAppTranslation();
  const zoom = useStore((s) => s.transform[2]);
  const { zoomIn, zoomOut, setViewport } = useReactFlow();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(String(Math.round(zoom * 100)));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(String(Math.round(zoom * 100)));
  }, [zoom]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) window.addEventListener('mousedown', onClick, true);
    return () => window.removeEventListener('mousedown', onClick, true);
  }, [open]);

  const [vx, vy] = useStore((s) => s.transform);

  const setZoom = (value: number) => {
    setViewport({ x: vx, y: vy, zoom: value / 100 }, { duration: 200 });
    setOpen(false);
  };

  const applyZoomInput = () => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || input.trim() === '') {
      setInput(String(Math.round(zoom * 100)));
      return;
    }
    const value = Math.min(500, Math.max(10, Math.round(parsed)));
    setInput(String(value));
    setViewport({ x: vx, y: vy, zoom: value / 100 }, { duration: 200 });
  };

  const kbd = (label: string) => <span className="text-[11px] text-white/[0.46]">{label}</span>;

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto rounded-lg border border-edge bg-panel/90 px-2.5 py-1 text-xs font-medium text-white/[0.9] shadow-lg backdrop-blur-xl hover:bg-white/10"
        aria-label={t('canvas.zoomMenu', '画布缩放菜单')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {Math.round(zoom * 100)}%
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1E1E21] p-1.5 shadow-2xl backdrop-blur-xl"
          role="dialog"
          aria-label={t('canvas.zoomMenu', '画布缩放菜单')}
        >
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-white/[0.08] px-2.5 py-2">
            <input
              type="range"
              min={10}
              max={500}
              step={1}
              value={Math.min(500, Math.max(10, Number(input) || Math.round(zoom * 100)))}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                setInput(String(value));
                setViewport({ x: vx, y: vy, zoom: value / 100 });
              }}
              aria-label={t('canvas.zoomRatio', '画布缩放比例')}
              className="h-5 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/20 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/20 [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <label className="flex w-12 shrink-0 items-center justify-end text-xs font-medium tabular-nums text-white/80 focus-within:text-white">
              <input
                type="text"
                inputMode="numeric"
                value={input}
                onChange={(event) =>
                  setInput(event.currentTarget.value.replace(/\D/g, '').slice(0, 3))
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  applyZoomInput();
                }}
                onBlur={() => {
                  if (input.trim() === '') setInput(String(Math.round(zoom * 100)));
                }}
                onFocus={(event) => event.currentTarget.select()}
                aria-label={t('canvas.zoomPercentInput', '输入缩放百分比')}
                className="min-w-0 flex-1 bg-transparent text-right outline-none"
              />
              <span aria-hidden="true">%</span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => {
              zoomIn();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            <span>{t('canvas.zoomIn', '放大')}</span>
            {kbd('⌘ +')}
          </button>
          <button
            type="button"
            onClick={() => {
              zoomOut();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            <span>{t('canvas.zoomOut', '缩小')}</span>
            {kbd('⌘ -')}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewport({ x: vx, y: vy, zoom: 1 }, { duration: 200 });
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            <span>{t('canvas.fitView', '适合屏幕')}</span>
            {kbd('⌘ 0')}
          </button>

          <button
            type="button"
            onClick={onToggleMiniMap}
            aria-pressed={miniMapVisible}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            <span>
              {miniMapVisible
                ? t('canvas.miniMap.close', '关闭小地图')
                : t('canvas.miniMap.open', '开启小地图')}
            </span>
            <span className="flex items-center gap-2">
              {kbd('Ctrl/⌘ M')}
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  miniMapVisible ? 'bg-emerald-400' : 'bg-white/25'
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          <div className="my-1 h-px bg-white/[0.08]" />

          <button
            type="button"
            onClick={() => setZoom(50)}
            className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            {t('canvas.zoomTo', '缩放至 {percent}%', { percent: 50 })}
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            {t('canvas.zoomTo', '缩放至 {percent}%', { percent: 100 })}
          </button>
          <button
            type="button"
            onClick={() => setZoom(500)}
            className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-white/[0.9] hover:bg-white/10"
          >
            {t('canvas.zoomTo', '缩放至 {percent}%', { percent: 500 })}
          </button>
        </div>
      )}
    </div>
  );
}

function BottomCanvasToolbarRegion({
  positionClass,
  label,
  children,
}: {
  positionClass: string;
  label: string;
  children: ReactNode;
}) {
  const narrowViewportClass =
    label === 'left'
      ? 'max-sm:!bottom-14 max-sm:!left-2 max-sm:max-w-[calc(100vw-1rem)] max-sm:overflow-x-auto max-sm:pb-0'
      : label === 'center'
        ? 'max-sm:!bottom-28 max-sm:pb-0'
        : 'max-sm:!right-2 max-sm:!bottom-2 max-sm:max-w-[calc(100vw-1rem)] max-sm:overflow-x-auto max-sm:pb-0';
  return (
    <div
      className={`group/bottom-toolbar pointer-events-auto absolute bottom-0 z-40 pb-4 ${narrowViewportClass} ${positionClass}`}
      data-canvas-toolbar="bottom"
      data-theme-role="canvas-toolbar"
      data-toolbar-region={label}
      data-toolbar-mode="mixed"
    >
      {children}
    </div>
  );
}

function BottomCanvasToolbarItem({
  id,
  mode,
  children,
}: {
  id: ToolbarControlId;
  mode: ToolbarMode;
  children: ReactNode;
}) {
  if (mode === 'hidden') return null;
  return (
    <div
      className={`transition-transform duration-200 ease-out ${
        mode === 'auto-hide'
          ? 'translate-y-16 group-hover/bottom-toolbar:translate-y-0 group-focus-within/bottom-toolbar:translate-y-0 max-sm:translate-y-0'
          : 'translate-y-0'
      }`}
      data-toolbar-control={id}
      data-toolbar-mode={mode}
    >
      {children}
    </div>
  );
}

/** Inner component that lives inside ReactFlowProvider — can safely use useReactFlow */
function CanvasInner() {
  const { t } = useAppTranslation();
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const createGroupFromSelection = useCanvasStore((s) => s.createGroupFromSelection);
  const copyNode = useCanvasStore((s) => s.copyNode);
  const pasteNode = useCanvasStore((s) => s.pasteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const selectAllNodes = useCanvasStore((s) => s.selectAllNodes);
  const nodes = useCanvasStore((s) => s.nodes);
  const openModal = useCanvasStore((s) => s.openModal);
  const deleteConfirmOpen = useCanvasStore((s) => s.deleteConfirm !== null);
  const panelOpen = useCanvasStore((s) => s.panelOpen);
  const setPanelOpen = useCanvasStore((s) => s.setPanelOpen);
  const snapEnabled = useCanvasStore((s) => s.snapEnabled);
  const toggleSnapEnabled = useCanvasStore((s) => s.toggleSnapEnabled);
  const setOpenModal = useCanvasStore((s) => s.setOpenModal);
  const assets = useCanvasStore((s) => s.assets);
  const trash = useCanvasStore((s) => s.trash);
  const edgesVisible = useCanvasPreferences((state) => state.edgesVisible);
  const editingShortcutsEnabled = useCanvasPreferences((state) => state.editingShortcutsEnabled);
  const setPreference = useCanvasPreferences((state) => state.setPreference);
  const toolbarModes = useCanvasPreferences((state) => state.toolbarModes);

  const { screenToFlowPosition, fitView, zoomIn, zoomOut, setViewport } = useReactFlow();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [miniMapVisible, setMiniMapVisible] = useState(false);

  useEffect(() => registerCanvasScreenToFlowPosition(screenToFlowPosition), [screenToFlowPosition]);

  // Keep browser zoom separate from the infinite-canvas zoom. React Flow still
  // receives a normal wheel event on the canvas; Ctrl/⌘ zoom gestures do not
  // resize the entire application page.
  useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const preventBrowserZoomShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', preventBrowserZoom, { capture: true, passive: false });
    window.addEventListener('keydown', preventBrowserZoomShortcut, { capture: true });
    return () => {
      window.removeEventListener('wheel', preventBrowserZoom, { capture: true });
      window.removeEventListener('keydown', preventBrowserZoomShortcut, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextEditingShortcutTarget(e.target)) return;
      if (!editingShortcutsEnabled) return;
      if (openModal !== null || deleteConfirmOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      if (isSelectAllCanvasNodesShortcut(e)) {
        e.preventDefault();
        selectAllNodes();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        createGroupFromSelection();
      } else if (mod && e.key.toLowerCase() === 'c') {
        const sel = nodes.find((n) => n.selected);
        if (sel) {
          e.preventDefault();
          copyNode(sel.id);
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (useCanvasStore.getState().clipboard) {
          e.preventDefault();
          const flow = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
          pasteNode({ x: flow.x - NODE_W / 2, y: flow.y - NODE_H / 2 });
        }
      } else if (mod && e.key.toLowerCase() === 'd') {
        const sel = nodes.find((n) => n.selected);
        if (sel) {
          e.preventDefault();
          duplicateNode(sel.id);
        }
      } else if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMiniMapVisible((visible) => !visible);
      } else if (e.key === '?') {
        setOpenModal('shortcuts');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    undo,
    redo,
    createGroupFromSelection,
    copyNode,
    pasteNode,
    duplicateNode,
    selectAllNodes,
    nodes,
    openModal,
    deleteConfirmOpen,
    screenToFlowPosition,
    setOpenModal,
    editingShortcutsEnabled,
  ]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  return (
    <>
      <FlowCanvas edgesVisible={edgesVisible} miniMapVisible={miniMapVisible} />

      {/* Bottom-left controls */}
      <BottomCanvasToolbarRegion positionClass="left-[88px]" label="left">
        <div className="pointer-events-none flex items-center gap-2">
          <BottomCanvasToolbarItem id="bottom-assets" mode={toolbarModes['bottom-assets']}>
            <button
              type="button"
              onClick={() => setPanelOpen(panelOpen === 'assets' ? null : 'assets')}
              className={`pointer-events-auto flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs shadow-lg backdrop-blur-xl transition-colors ${
                panelOpen === 'assets'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-edge bg-panel/90 text-white/[0.86] hover:bg-white/10 hover:text-white'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('canvas.assets')}
              {assets.length > 0 && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                  {assets.length}
                </span>
              )}
            </button>
          </BottomCanvasToolbarItem>

          <div
            data-toolbar-cluster="canvas-actions"
            className="pointer-events-none flex items-center gap-1"
          >
            <BottomCanvasToolbarItem id="bottom-snap" mode={toolbarModes['bottom-snap']}>
              <button
                type="button"
                onClick={toggleSnapEnabled}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
                aria-label={snapEnabled ? t('canvas.snapOn') : t('canvas.snapOff')}
                aria-pressed={snapEnabled}
                data-neutral-pressed="true"
                title={snapEnabled ? t('canvas.snapOn') : t('canvas.snapOff')}
              >
                <span
                  className="relative flex h-4 w-4 items-center justify-center"
                  data-snap-icon={snapEnabled ? 'enabled' : 'disabled'}
                  aria-hidden="true"
                >
                  <Magnet className="h-3.5 w-3.5" />
                  {!snapEnabled && (
                    <Slash className="absolute h-4 w-4 text-rose-300" strokeWidth={2.25} />
                  )}
                </span>
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem id="bottom-edges" mode={toolbarModes['bottom-edges']}>
              <button
                type="button"
                onClick={() => setPreference('edgesVisible', !edgesVisible)}
                className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 shadow-lg backdrop-blur-xl transition-colors ${
                  edgesVisible
                    ? 'text-white/[0.78] hover:bg-white/10 hover:text-white'
                    : 'text-white'
                }`}
                aria-label={edgesVisible ? t('canvas.hideEdges') : t('canvas.showEdges')}
                aria-pressed={!edgesVisible}
                title={edgesVisible ? t('canvas.hideEdges') : t('canvas.showEdges')}
              >
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <Spline className="h-3.5 w-3.5" />
                  {!edgesVisible && (
                    <span className="absolute h-[1px] w-[17px] -rotate-45 bg-current shadow-[0_0_0_1px_rgba(20,20,22,0.75)]" />
                  )}
                </span>
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem id="bottom-search" mode={toolbarModes['bottom-search']}>
              <button
                type="button"
                onClick={() => setPanelOpen(panelOpen === 'search' ? null : 'search')}
                className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 shadow-lg backdrop-blur-xl transition-colors ${
                  panelOpen === 'search'
                    ? 'bg-white/15 text-white'
                    : 'text-white/[0.78] hover:bg-white/10 hover:text-white'
                }`}
                aria-label={t('canvas.search')}
                title={t('canvas.searchNodes')}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem id="bottom-layers" mode={toolbarModes['bottom-layers']}>
              <button
                type="button"
                onClick={() => setPanelOpen(panelOpen === 'layers' ? null : 'layers')}
                className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 shadow-lg backdrop-blur-xl transition-colors ${
                  panelOpen === 'layers'
                    ? 'bg-white/15 text-white'
                    : 'text-white/[0.78] hover:bg-white/10 hover:text-white'
                }`}
                aria-label={t('canvas.layers')}
                title={t('canvas.layerManagement')}
              >
                <Layers className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem
              id="bottom-fullscreen"
              mode={toolbarModes['bottom-fullscreen']}
            >
              <button
                type="button"
                onClick={toggleFullscreen}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl hover:bg-white/10 hover:text-white"
                aria-label={isFullscreen ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
                aria-pressed={isFullscreen}
                title={isFullscreen ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
              >
                {isFullscreen ? (
                  <Minimize className="h-3.5 w-3.5" />
                ) : (
                  <Maximize className="h-3.5 w-3.5" />
                )}
              </button>
            </BottomCanvasToolbarItem>
          </div>

          <BottomCanvasToolbarItem id="bottom-zoom-menu" mode={toolbarModes['bottom-zoom-menu']}>
            <ZoomMenu
              miniMapVisible={miniMapVisible}
              onToggleMiniMap={() => setMiniMapVisible((visible) => !visible)}
            />
          </BottomCanvasToolbarItem>
        </div>
      </BottomCanvasToolbarRegion>

      {/* Floating panels */}
      <Suspense fallback={null}>
        {panelOpen === 'assets' && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-40 pt-14">
            <AssetPanel />
          </div>
        )}
        {panelOpen === 'search' && (
          <div className="absolute bottom-[60px] left-[180px] z-40 max-sm:right-2 max-sm:bottom-[164px] max-sm:left-2">
            <SearchPanel />
          </div>
        )}
        {panelOpen === 'layers' && (
          <div className="absolute bottom-[60px] left-[180px] z-40 max-sm:right-2 max-sm:bottom-[164px] max-sm:left-2">
            <LayerPanel />
          </div>
        )}
      </Suspense>

      {/* Bottom toolbar — aligned with the left/right global helper bars */}
      <BottomCanvasToolbarRegion positionClass="left-1/2 -translate-x-1/2" label="center">
        <Toolbar toolbarModes={toolbarModes} />
      </BottomCanvasToolbarRegion>

      {/* Bottom-right global helper toolbar */}
      <BottomCanvasToolbarRegion positionClass="right-4" label="right">
        <div className="pointer-events-none flex items-center gap-2">
          <div
            data-toolbar-cluster="view-actions"
            className="pointer-events-none flex items-center gap-1"
          >
            <BottomCanvasToolbarItem id="bottom-zoom-out" mode={toolbarModes['bottom-zoom-out']}>
              <button
                type="button"
                onClick={() => zoomOut()}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl hover:bg-white/10 hover:text-white"
                title={t('canvas.zoomOut')}
                aria-label={t('canvas.zoomOut')}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem id="bottom-zoom-in" mode={toolbarModes['bottom-zoom-in']}>
              <button
                type="button"
                onClick={() => zoomIn()}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl hover:bg-white/10 hover:text-white"
                title={t('canvas.zoomIn')}
                aria-label={t('canvas.zoomIn')}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem id="bottom-fit-view" mode={toolbarModes['bottom-fit-view']}>
              <button
                type="button"
                onClick={() => fitView({ padding: 0.3, duration: 400 })}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl hover:bg-white/10 hover:text-white"
                title={t('canvas.fitView')}
                aria-label={t('canvas.fitView')}
              >
                <Compass className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
            <BottomCanvasToolbarItem
              id="bottom-reset-view"
              mode={toolbarModes['bottom-reset-view']}
            >
              <button
                type="button"
                onClick={() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 400 })}
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel/90 text-white/[0.78] shadow-lg backdrop-blur-xl hover:bg-white/10 hover:text-white"
                title={t('canvas.resetView')}
                aria-label={t('canvas.resetView')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </BottomCanvasToolbarItem>
          </div>
          <BottomCanvasToolbarItem id="bottom-shortcuts" mode={toolbarModes['bottom-shortcuts']}>
            <button
              type="button"
              onClick={() => setOpenModal('shortcuts')}
              className="pointer-events-auto flex h-7 items-center gap-1 rounded-lg border border-edge bg-panel/90 px-2 text-xs text-white/[0.82] shadow-lg backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
              title={t('canvas.shortcuts')}
              aria-label={t('canvas.shortcuts')}
            >
              <Keyboard className="h-3.5 w-3.5" />
              {t('canvas.shortcuts')}
            </button>
          </BottomCanvasToolbarItem>
          <BottomCanvasToolbarItem id="bottom-trash" mode={toolbarModes['bottom-trash']}>
            <button
              type="button"
              onClick={() => setOpenModal('trash')}
              className="pointer-events-auto flex h-7 items-center gap-1 rounded-lg border border-edge bg-panel/90 px-2 text-xs text-white/[0.82] shadow-lg backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
              title={t('canvas.trash')}
              aria-label={t('canvas.trash')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('canvas.trash')}
              {trash.length > 0 && (
                <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px] text-white/55">
                  {trash.length > 99 ? '99+' : trash.length}
                </span>
              )}
            </button>
          </BottomCanvasToolbarItem>
        </div>
      </BottomCanvasToolbarRegion>
    </>
  );
}

type DeferredModalKind = Exclude<ModalKind, null>;

const RESOURCE_MODAL_KINDS = new Set<DeferredModalKind>([
  'style-library',
  'effects-library',
  'character-library',
  'prompt-library',
]);

const CANVAS_MODAL_KINDS = new Set<DeferredModalKind>([
  'camera-library',
  'director-studio',
  'director-studio-2d',
  'media-preview',
  'panorama-viewer',
  'color-grading',
  'image-editor',
  'face-control',
  'pose-control',
  'node-params',
  'trash',
  'shortcuts',
]);

function useDeferredModalMounts(supportedKinds: ReadonlySet<DeferredModalKind>) {
  const openModal = useCanvasStore((state) => state.openModal);
  const [mountedKinds, setMountedKinds] = useState<ReadonlySet<DeferredModalKind>>(() => new Set());

  useEffect(() => {
    if (!openModal || !supportedKinds.has(openModal)) return;
    setMountedKinds((current) => {
      if (current.has(openModal)) return current;
      const next = new Set(current);
      next.add(openModal);
      return next;
    });
  }, [openModal, supportedKinds]);

  return (kind: DeferredModalKind) => openModal === kind || mountedKinds.has(kind);
}

function ResourceLibraryModalLayer() {
  const shouldMount = useDeferredModalMounts(RESOURCE_MODAL_KINDS);

  return (
    <Suspense fallback={null}>
      {shouldMount('style-library') && <StyleLibraryModal />}
      {shouldMount('effects-library') && <EffectsLibraryModal />}
      {shouldMount('character-library') && <CharacterLibraryModal />}
      {shouldMount('prompt-library') && <PromptLibraryModal />}
    </Suspense>
  );
}

function CanvasModalLayer() {
  const shouldMount = useDeferredModalMounts(CANVAS_MODAL_KINDS);
  const deleteConfirmOpen = useCanvasStore((state) => state.deleteConfirm !== null);

  return (
    <Suspense fallback={null}>
      {shouldMount('camera-library') && <CameraLibraryModal />}
      {shouldMount('director-studio') && <DirectorThreeStudioModal />}
      {shouldMount('director-studio-2d') && <FlatDirectorStudioModal />}
      {shouldMount('media-preview') && <MediaPreviewModal />}
      {shouldMount('panorama-viewer') && <PanoramaViewerModal />}
      {shouldMount('color-grading') && <ColorGradingModal />}
      {shouldMount('image-editor') && <ImageEditorModal />}
      {shouldMount('face-control') && <FaceControlModal />}
      {shouldMount('pose-control') && <PoseControlModal />}
      {shouldMount('node-params') && <NodeParamsPanel />}
      {shouldMount('trash') && <TrashModal />}
      {shouldMount('shortcuts') && <ShortcutsModal />}
      {deleteConfirmOpen && <DeleteConfirmDialog />}
    </Suspense>
  );
}

function CanvasView() {
  const workspace = useCanvasStore((s) => s.workspace);

  if (workspace === 'home') {
    return <Home />;
  }

  return (
    <main className="absolute inset-0">
      <ReactFlowProvider>
        <CanvasInner />
        <ResourceLibraryModalLayer />
      </ReactFlowProvider>

      {/* Canvas-only modals and dialogs */}
      <CanvasModalLayer />
    </main>
  );
}

function App() {
  const workspace = useCanvasStore((s) => s.workspace);
  useEffect(() => startDeferredAppRuntimes(), []);

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-canvas ${workspace === 'home' ? '' : 'canvas-readable-typography'}`}
    >
      <AppLanguageRuntime />
      <PluginLanguageRuntime />
      <CanvasThemeRuntime />
      <Header />
      <WebBuildUpdateNotice />
      <CanvasView />
      {/* Resource libraries retain a React Flow context on Home, where no canvas viewport is mounted. */}
      {workspace === 'home' && (
        <ReactFlowProvider>
          <ResourceLibraryModalLayer />
        </ReactFlowProvider>
      )}
      <PluginWidgetLayer />
    </div>
  );
}

export default App;
