import { Suspense, useState, useRef, useEffect, type ChangeEvent, type ReactNode } from 'react';
import { lazyFeature as lazy } from './LazyFeature';
import { blockPageUpdate } from '../lib/pageUpdateDrafts';
import {
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  Sparkles,
  Download,
  Upload,
  Group,
  Home,
  FolderKanban,
  LayoutTemplate,
  Settings,
  Archive,
  FileImage,
  Film,
  FileText,
  TriangleAlert,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  exportCanvasPersistenceConflictCopy,
  flushCanvasPersistence,
  reloadCanvasFromBridgeAfterConflict,
  useCanvasStore,
} from '../store/canvasStore';
import {
  exportLanCollaborationConflictCopy,
  getLanCollaborationConflictCopy,
} from '../services/lanCollaboration';
import { parseWorkflowFileString, workflowFileToString } from '../serialization/workflow';
import {
  MAX_CANVAS_MATERIAL_BYTES,
  MAX_CANVAS_MATERIAL_ENTRIES,
  type ImportedMaterial,
  type MaterialExportOptions,
  type MaterialKind,
} from '../serialization/materialBundle';
import { persistImageFile, persistVideoFile } from '../services/mediaPersistence';
import { WORKSPACES } from '../canvas/workspaces';
import {
  useCanvasPreferences,
  type ToolbarControlId,
  type ToolbarMode,
} from '../store/canvasPreferences';
import { useHomeNavigationStore } from '../store/homeNavigationStore';
import { useAppTranslation } from '../i18n/appI18n';
import {
  detectSmartImport,
  materialKindForSmartImport,
  type SmartImportDetection,
  type SmartImportLibraryKind,
} from '../lib/smartImport';
import { PLUGIN_OPEN_API_SETTINGS_EVENT } from '../lib/pluginApiSettingsNavigation';

const AiSkillPanel = lazy(() =>
  import('./AgentChatPanel').then((module) => ({ default: module.AiSkillPanel })),
);
const SettingsPanel = lazy(() =>
  import('./SettingsPanel').then((module) => ({ default: module.SettingsPanel })),
);

const SMART_IMPORT_LIBRARY_LABELS: Record<SmartImportLibraryKind, string> = {
  style: '风格库',
  effect: '特效库',
  character: '角色库',
  prompt: '提示词库',
};

interface PendingSmartImport {
  files: File[];
  detection: SmartImportDetection;
}

function smartImportTypeLabel(detection: SmartImportDetection) {
  if (detection.kind === 'canvas-workflow') return '画布 JSON';
  if (detection.kind === 'canvas-material-bundle') return '节点素材 ZIP';
  if (detection.kind === 'library-package') {
    return `${SMART_IMPORT_LIBRARY_LABELS[detection.libraryKind]}资料包`;
  }
  return '图片 / 视频 / 文字文件';
}

function materialCountLabel(counts: Record<MaterialKind, number>) {
  return `图片 ${counts.image} · 视频 ${counts.video} · 文字 ${counts.text}`;
}

function smartImportContentLabel(detection: SmartImportDetection) {
  if (detection.kind === 'canvas-workflow') {
    return `${detection.itemCount} 个节点 · ${detection.edgeCount} 条连线`;
  }
  if (detection.kind === 'library-package') return `${detection.itemCount} 项资料`;
  return materialCountLabel(detection.materialCounts);
}

function smartImportDestinationLabel(detection: SmartImportDetection) {
  if (detection.kind === 'canvas-workflow') return '当前画布（替换节点与连线，可撤销）';
  if (detection.kind === 'library-package') {
    return SMART_IMPORT_LIBRARY_LABELS[detection.libraryKind];
  }
  return '当前画布右侧（新增素材节点）';
}

function smartImportEffectLabel(detection: SmartImportDetection) {
  if (detection.kind === 'canvas-workflow') {
    return '确认后会替换当前画布的节点与连线；操作会进入撤销历史。';
  }
  if (detection.kind === 'library-package') {
    return `确认后只写入${SMART_IMPORT_LIBRARY_LABELS[detection.libraryKind]}，不会修改当前画布。`;
  }
  return '确认后只在当前画布新增节点；媒体会保存为项目数据，不会自动加入“我的素材库”。';
}

function TopCanvasToolbarRegion({
  mode,
  label,
  children,
}: {
  mode: ToolbarMode;
  label: string;
  children: ReactNode;
}) {
  if (mode === 'hidden') return null;
  return (
    <div
      className="group pointer-events-auto -mt-3 pt-3"
      data-canvas-toolbar="top"
      data-toolbar-region={label}
      data-toolbar-mode={mode}
    >
      <div
        className={`transition-transform duration-200 ease-out ${
          mode === 'auto-hide'
            ? '-translate-y-16 group-hover:translate-y-0 group-focus-within:translate-y-0'
            : 'translate-y-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Header() {
  const { t } = useAppTranslation();
  const workspace = useCanvasStore((s) => s.workspace);
  const setWorkspace = useCanvasStore((s) => s.setWorkspace);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);
  const createGroupFromSelection = useCanvasStore((s) => s.createGroupFromSelection);
  const importWorkflow = useCanvasStore((s) => s.importWorkflow);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeWithImage = useCanvasStore((s) => s.addNodeWithImage);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const projectName = useCanvasStore((s) => s.projectName);
  const tabs = useCanvasStore((s) => s.tabs);
  const activeTabId = useCanvasStore((s) => s.activeTabId);
  const aiSkillOpen = useCanvasStore((s) => s.aiSkillOpen);
  const setAiSkillOpen = useCanvasStore((s) => s.setAiSkillOpen);
  const persistenceStatus = useCanvasStore((s) => s.persistenceStatus);
  const toolbarModes = useCanvasPreferences((state) => state.toolbarModes);
  const setHomeSection = useHomeNavigationStore((state) => state.setSection);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialProviderId, setSettingsInitialProviderId] = useState<string>();
  useEffect(() => {
    if (showSettings || aiSkillOpen) return blockPageUpdate();
  }, [showSettings, aiSkillOpen]);
  useEffect(() => {
    const openPluginApiSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ providerId?: string }>).detail;
      if (detail?.providerId !== 'volcengine') return;
      setSettingsInitialProviderId(detail.providerId);
      setShowSettings(true);
    };
    window.addEventListener(PLUGIN_OPEN_API_SETTINGS_EVENT, openPluginApiSettings);
    return () => window.removeEventListener(PLUGIN_OPEN_API_SETTINGS_EVENT, openPluginApiSettings);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferMenu, setTransferMenu] = useState<'import' | 'export' | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [pendingSmartImport, setPendingSmartImport] = useState<PendingSmartImport | null>(null);
  const [importNotice, setImportNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [dismissedPersistenceNoticeKey, setDismissedPersistenceNoticeKey] = useState<string | null>(
    null,
  );
  const [persistenceRetryBusy, setPersistenceRetryBusy] = useState(false);
  const [persistenceRecoveryBusy, setPersistenceRecoveryBusy] = useState(false);
  const [lanConflictProjectId, setLanConflictProjectId] = useState<string | null>(null);
  const dismissedLanConflictCopies = useRef(new WeakSet<object>());
  const menuRef = useRef<HTMLDivElement>(null);
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const materialBundleInputRef = useRef<HTMLInputElement>(null);
  const materialFilesInputRef = useRef<HTMLInputElement>(null);
  const smartImportInputRef = useRef<HTMLInputElement>(null);

  const downloadPersistenceConflictCopy = () => {
    const content = exportCanvasPersistenceConflictCopy(activeProjectId);
    if (!content) return false;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${canvasName.replace(/[\\/:*?"<>|]/g, '-') || 'qiansi-canvas'}-冲突副本.json`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  };

  const downloadLanConflictCopy = () => {
    const content = exportLanCollaborationConflictCopy(activeProjectId);
    if (!content) return;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${canvasName.replace(/[\\/:*?"<>|]/g, '-') || 'qiansi-canvas'}-局域网冲突副本.json`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  useEffect(() => {
    const onClick = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setTransferMenu(null);
      }
    };
    if (menuOpen) window.addEventListener('pointerdown', onClick, true);
    return () => window.removeEventListener('pointerdown', onClick, true);
  }, [menuOpen]);

  useEffect(() => {
    const currentConflict = getLanCollaborationConflictCopy(activeProjectId);
    setLanConflictProjectId(
      currentConflict && !dismissedLanConflictCopies.current.has(currentConflict)
        ? activeProjectId
        : null,
    );
    const onLanConflict = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === activeProjectId) {
        const conflict = getLanCollaborationConflictCopy(activeProjectId);
        setLanConflictProjectId(
          conflict && !dismissedLanConflictCopies.current.has(conflict) ? activeProjectId : null,
        );
      }
    };
    window.addEventListener('qiansi:lan-collaboration-conflict', onLanConflict);
    return () => window.removeEventListener('qiansi:lan-collaboration-conflict', onLanConflict);
  }, [activeProjectId]);

  const dismissLanConflict = () => {
    const conflict = getLanCollaborationConflictCopy(activeProjectId);
    if (conflict) dismissedLanConflictCopies.current.add(conflict);
    setLanConflictProjectId(null);
  };

  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(() => setImportNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  const selectedCount = nodes.filter((n) => n.selected && n.data.kind !== 'group').length;
  const isHome = workspace === 'home';
  const persistenceNoticeKey = [
    persistenceStatus.projectId,
    persistenceStatus.state,
    persistenceStatus.lastAttemptAt ?? 0,
  ].join(':');
  const persistenceNoticeVisible =
    !isHome &&
    persistenceStatus.projectId === activeProjectId &&
    (persistenceStatus.state === 'error' || persistenceStatus.state === 'conflict') &&
    dismissedPersistenceNoticeKey !== persistenceNoticeKey;
  const activeLanConflict =
    lanConflictProjectId === activeProjectId
      ? getLanCollaborationConflictCopy(activeProjectId)
      : undefined;
  const lanConflictNoticeVisible =
    Boolean(activeLanConflict) &&
    persistenceStatus.projectId === activeProjectId &&
    persistenceStatus.state !== 'error' &&
    persistenceStatus.state !== 'conflict';
  const title = isHome
    ? t('header.homeTitle', 'Qiansi-Canvas AI 创作工作台')
    : t(`workspace.${workspace}.title`, WORKSPACES[workspace].title);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canvasName = activeTab?.name ?? '画布 1';
  const toolbarMode = (id: ToolbarControlId): ToolbarMode =>
    isHome ? 'visible' : toolbarModes[id];

  const retryCanvasPersistence = async () => {
    if (persistenceRetryBusy || persistenceStatus.state !== 'error') return;
    setPersistenceRetryBusy(true);
    try {
      await flushCanvasPersistence();
    } finally {
      setPersistenceRetryBusy(false);
    }
  };

  const reloadHostCanvasAfterConflict = async () => {
    if (
      persistenceRecoveryBusy ||
      persistenceStatus.state !== 'conflict' ||
      !['bridge-remote', 'bridge-local-read'].includes(persistenceStatus.conflictingWriterId ?? '')
    ) {
      return;
    }
    if (!downloadPersistenceConflictCopy()) return;
    setPersistenceRecoveryBusy(true);
    try {
      await reloadCanvasFromBridgeAfterConflict();
    } finally {
      setPersistenceRecoveryBusy(false);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportWorkflow = () => {
    const json = workflowFileToString(nodes, edges);
    downloadBlob(
      new Blob([json], { type: 'application/json' }),
      `workflow-${workspace}-${Date.now()}.json`,
    );
  };

  const handleSmartImportSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    setTransferBusy(true);
    setImportNotice({ kind: 'success', message: '正在识别导入内容…' });
    try {
      const detection = await detectSmartImport(files);
      setPendingSmartImport({ files, detection });
      setImportNotice(null);
    } catch (error) {
      setImportNotice({
        kind: 'error',
        message: `智能识别失败：${error instanceof Error ? error.message : '无法读取所选文件'}`,
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const materialImportOrigin = () => {
    const rootNodes = useCanvasStore.getState().nodes.filter((node) => !node.parentId);
    const baseX = rootNodes.length
      ? Math.max(...rootNodes.map((node) => node.position.x + (node.width ?? 620))) + 100
      : 120;
    const baseY = rootNodes.length ? Math.min(...rootNodes.map((node) => node.position.y)) : -96;
    return { x: baseX, y: baseY };
  };

  const importMaterialItems = async (
    items: Array<{ kind: MaterialKind; title: string; file: File }>,
  ) => {
    if (!items.length) throw new Error('没有可导入的图片、视频或文字文件。');
    if (items.length > MAX_CANVAS_MATERIAL_ENTRIES) {
      throw new Error(`一次最多导入 ${MAX_CANVAS_MATERIAL_ENTRIES} 个素材，请分批导入。`);
    }
    const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
    if (totalBytes > MAX_CANVAS_MATERIAL_BYTES) throw new Error('素材总大小不能超过 512 MB。');
    const failed: string[] = [];
    let imported = 0;
    const origin = materialImportOrigin();

    for (const [index, item] of items.entries()) {
      if (index > 0 && index % 24 === 0) {
        setImportNotice({
          kind: 'success',
          message: `正在导入节点素材（${index}/${items.length}）…`,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      try {
        const position = {
          x: origin.x + (index % 2) * 700,
          y: origin.y + Math.floor(index / 2) * 520,
        };
        if (item.kind === 'image') {
          if (item.file.size > 32 * 1024 * 1024) throw new Error('图片超过 32 MB');
          const persistedImage = await persistImageFile(
            item.file,
            'storyboard',
            useCanvasStore.getState().activeProjectId,
          );
          const id = addNodeWithImage('image', position, persistedImage.originalUrl, item.title);
          updateNodeData(id, {
            originalUrl: persistedImage.originalUrl,
            previewUrl: persistedImage.previewUrl,
            mediaWidth: persistedImage.width,
            mediaHeight: persistedImage.height,
            bridgeAssetId: persistedImage.bridgeAssetId,
            imageFileName: item.file.name,
            referenceOnly: true,
            composerReferences: [],
          });
        } else if (item.kind === 'video') {
          const id = addNode('video', position);
          let videoUrl: string;
          let bridgeAssetId: string | undefined;
          try {
            const persistedVideo = await persistVideoFile(
              item.file,
              useCanvasStore.getState().activeProjectId,
            );
            videoUrl = persistedVideo.originalUrl;
            bridgeAssetId = persistedVideo.bridgeAssetId;
            updateNodeData(id, {
              previewUrl: persistedVideo.previewUrl,
              mediaWidth: persistedVideo.width,
              mediaHeight: persistedVideo.height,
              durationSeconds: persistedVideo.durationSeconds,
            });
          } catch {
            videoUrl = URL.createObjectURL(item.file);
          }
          updateNodeData(id, {
            title: item.title,
            originalUrl: videoUrl,
            previewUrl: useCanvasStore.getState().nodes.find((node) => node.id === id)?.data
              .previewUrl,
            videoUrl,
            videos: [videoUrl],
            videoFileName: item.file.name,
            assetVideoId: undefined,
            bridgeAssetId,
            output: videoUrl,
            result: bridgeAssetId
              ? '视频素材已保存到当前项目数据。'
              : '本机 Bridge 不可用，视频仅在当前会话可用，刷新页面后会丢失。',
          });
        } else {
          if (item.file.size > 5 * 1024 * 1024) throw new Error('文字文件超过 5 MB');
          const content = await item.file.text();
          const id = addNode('text', position);
          updateNodeData(id, {
            title: item.title,
            prompt: content,
            outputText: content,
            description: '导入的文字素材',
          });
        }
        imported += 1;
      } catch (error) {
        failed.push(`${item.file.name}（${error instanceof Error ? error.message : '无法导入'}）`);
      }
    }

    if (!imported) throw new Error(failed.join('、') || '素材导入失败。');
    return { imported, failed };
  };

  const materialTitle = (fileName: string) => fileName.replace(/\.[^.]+$/, '').slice(0, 120);

  const confirmSmartImport = async () => {
    const pending = pendingSmartImport;
    if (!pending || transferBusy) return;
    setTransferBusy(true);
    setImportNotice({ kind: 'success', message: '正在导入已确认的内容…' });
    try {
      if (pending.detection.kind === 'canvas-workflow') {
        const file = pending.files[0];
        if (!file) throw new Error('画布文件已不可用。');
        const imported = parseWorkflowFileString(await file.text());
        importWorkflow(imported.nodes, imported.edges);
        setImportNotice({
          kind: 'success',
          message: `${imported.version === 1 ? '已兼容导入旧版工作流：' : '已导入：'}${imported.nodes.length} 个节点、${imported.edges.length} 条连线。`,
        });
      } else if (pending.detection.kind === 'canvas-material-bundle') {
        const file = pending.files[0];
        if (!file) throw new Error('节点素材包已不可用。');
        const { parseCanvasMaterialBundle } = await import('../serialization/materialBundle');
        const materials = await parseCanvasMaterialBundle(file);
        const items = materials.map((material: ImportedMaterial) => ({
          kind: material.kind,
          title: material.title,
          file: new File([material.bytes.slice().buffer], material.fileName, {
            type: material.mime,
          }),
        }));
        const result = await importMaterialItems(items);
        setImportNotice({
          kind: result.failed.length ? 'error' : 'success',
          message: result.failed.length
            ? `已从素材包导入 ${result.imported} 个，${result.failed.length} 个失败。`
            : `已从素材包导入 ${result.imported} 个画布节点。`,
        });
      } else if (pending.detection.kind === 'library-package') {
        const file = pending.files[0];
        if (!file) throw new Error('资料库包已不可用。');
        const { importLibraryTransferFile } = await import('../lib/libraryTransfer');
        const count = await importLibraryTransferFile(
          file,
          pending.detection.libraryKind,
          activeProjectId,
        );
        setImportNotice({
          kind: 'success',
          message: `已向${SMART_IMPORT_LIBRARY_LABELS[pending.detection.libraryKind]}导入 ${count} 项资料；当前画布未修改。`,
        });
      } else {
        const items = pending.files.map((file) => {
          const kind = materialKindForSmartImport(file);
          if (!kind) throw new Error(`无法识别“${file.name}”的文件类型。`);
          return { kind, title: materialTitle(file.name), file };
        });
        const result = await importMaterialItems(items);
        setImportNotice({
          kind: result.failed.length ? 'error' : 'success',
          message: result.failed.length
            ? `已导入 ${result.imported} 个素材，${result.failed.length} 个失败：${result.failed.join('、')}`
            : `已导入 ${result.imported} 个画布素材节点；未加入“我的素材库”。`,
        });
      }
      setPendingSmartImport(null);
    } catch (error) {
      setImportNotice({
        kind: 'error',
        message: `导入失败：${error instanceof Error ? error.message : '无法读取所选内容'}`,
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const exportMaterials = async (options: MaterialExportOptions, label: string) => {
    const selected = nodes.filter((node) => node.selected && node.data.kind !== 'group');
    const scope = selected.length ? selected : nodes.filter((node) => node.data.kind !== 'group');
    setTransferBusy(true);
    setImportNotice({
      kind: 'success',
      message: `正在导出${selected.length ? `${selected.length} 个选中节点的` : '当前画布的'}${label}…`,
    });
    try {
      const { createCanvasMaterialBundle } = await import('../serialization/materialBundle');
      const exported = await createCanvasMaterialBundle(scope, options);
      const safeCanvasName = canvasName.replace(/[\\/:*?"<>|]/g, '-') || 'qiansi-canvas';
      downloadBlob(
        exported.blob,
        `${safeCanvasName}-${label.replace(/\s+/g, '-')}-${Date.now()}.zip`,
      );
      const total = exported.counts.image + exported.counts.video + exported.counts.text;
      setImportNotice({
        kind: exported.skipped ? 'error' : 'success',
        message: exported.skipped
          ? `已导出 ${total} 个素材，另有 ${exported.skipped} 个远程素材无法下载，详情见 ZIP 内说明。`
          : `已导出 ${total} 个素材：图片 ${exported.counts.image}、视频 ${exported.counts.video}、文字 ${exported.counts.text}。`,
      });
    } catch (error) {
      setImportNotice({
        kind: 'error',
        message: `导出失败：${error instanceof Error ? error.message : '无法生成素材包'}`,
      });
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <>
      <header
        data-theme-role="canvas-header"
        className="fixed top-0 left-0 right-0 z-50 flex items-start justify-between p-3 pointer-events-none"
      >
        <div className="flex items-start gap-2">
          <TopCanvasToolbarRegion mode="visible" label="workspace">
            <div className="flex items-center gap-2">
              {!isHome ? (
                <div ref={menuRef} className="relative">
                  <input
                    ref={smartImportInputRef}
                    type="file"
                    multiple
                    accept=".json,.qiansi-library.json,.zip,application/json,application/zip,image/*,video/*,text/plain,text/markdown,.txt,.md,.csv,.srt,.vtt"
                    className="hidden"
                    onChange={(event) => void handleSmartImportSelection(event)}
                    data-smart-import-input="true"
                  />
                  <input
                    ref={workflowInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(event) => void handleSmartImportSelection(event)}
                  />
                  <input
                    ref={materialBundleInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(event) => void handleSmartImportSelection(event)}
                  />
                  <input
                    ref={materialFilesInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,text/plain,text/markdown,.txt,.md,.csv,.srt,.vtt"
                    className="hidden"
                    onChange={(event) => void handleSmartImportSelection(event)}
                  />
                  <button
                    data-theme-role="workspace-switcher"
                    type="button"
                    onClick={() => {
                      if (menuOpen) setTransferMenu(null);
                      setMenuOpen((value) => !value);
                    }}
                    className="flex h-9 items-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm text-white/90 hover:bg-white/10"
                  >
                    <span className="flex h-full items-center gap-1.5 px-2.5">
                      <LayoutTemplate className="h-3.5 w-3.5 text-white/[0.76]" />
                      <span className="max-w-[10rem] truncate text-white/[0.86]">{canvasName}</span>
                      <ChevronDown
                        className={`h-3 w-3 text-white/[0.68] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {menuOpen && (
                    <div
                      data-theme-role="workspace-menu"
                      className="absolute top-full left-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1E1E21] p-1.5 shadow-2xl backdrop-blur-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setHomeSection('home');
                          setWorkspace('home');
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                      >
                        <Home className="h-3.5 w-3.5 text-white/50" />
                        {t('header.home')}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHomeSection('projects');
                          setWorkspace('home');
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                      >
                        <FolderKanban className="h-3.5 w-3.5 text-white/50" />
                        {t('header.allProjects', '所有项目')}
                      </button>

                      <div
                        data-current-project-name="true"
                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                        title={projectName}
                      >
                        <span className="shrink-0 text-white/40">
                          {t('header.currentProject', '当前项目')}
                        </span>
                        <span className="min-w-0 truncate text-right font-medium text-white/75">
                          {projectName.trim() || t('header.unnamedProject', '未命名项目')}
                        </span>
                      </div>

                      <div className="my-1 h-px bg-white/[0.08]" />
                      <button
                        type="button"
                        onClick={() =>
                          setTransferMenu((current) => (current === 'import' ? null : 'import'))
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                      >
                        <span className="flex items-center gap-2">
                          <Upload className="h-3.5 w-3.5 text-white/50" />
                          {t('header.import')}
                        </span>
                        <ChevronRight
                          className={`h-3 w-3 text-white/50 transition-transform ${transferMenu === 'import' ? 'rotate-90' : ''}`}
                        />
                      </button>
                      {transferMenu === 'import' && (
                        <div className="mb-1 space-y-0.5 rounded-lg bg-white/[0.035] p-1">
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              setMenuOpen(false);
                              setTransferMenu(null);
                              smartImportInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.08] px-2.5 py-2 text-left text-xs text-emerald-100/90 hover:bg-emerald-400/[0.14] disabled:opacity-40"
                            data-smart-import-trigger="true"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-emerald-300/80" />
                            <span>
                              <span className="block font-medium">智能导入</span>
                              <span className="mt-0.5 block text-[10px] text-white/45">
                                自动识别画布、素材与资料库包
                              </span>
                            </span>
                          </button>
                          <div className="px-2.5 pb-0.5 pt-1 text-[10px] text-white/30">
                            或按类型选择
                          </div>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              setMenuOpen(false);
                              setTransferMenu(null);
                              workflowInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <LayoutTemplate className="h-3.5 w-3.5 text-white/45" />
                            画布 JSON
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              setMenuOpen(false);
                              setTransferMenu(null);
                              materialBundleInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <Archive className="h-3.5 w-3.5 text-white/45" />
                            节点素材 ZIP
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              setMenuOpen(false);
                              setTransferMenu(null);
                              materialFilesInputRef.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <FileImage className="h-3.5 w-3.5 text-white/45" />
                            图片 / 视频 / 文字文件
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setTransferMenu((current) => (current === 'export' ? null : 'export'))
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                      >
                        <span className="flex items-center gap-2">
                          <Download className="h-3.5 w-3.5 text-white/50" />
                          {t('header.export')}
                        </span>
                        <ChevronRight
                          className={`h-3 w-3 text-white/50 transition-transform ${transferMenu === 'export' ? 'rotate-90' : ''}`}
                        />
                      </button>
                      {transferMenu === 'export' && (
                        <div className="mb-1 space-y-0.5 rounded-lg bg-white/[0.035] p-1">
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              exportWorkflow();
                              setMenuOpen(false);
                              setTransferMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <LayoutTemplate className="h-3.5 w-3.5 text-white/45" />
                            画布 JSON
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              void exportMaterials(
                                { image: true, video: true, text: true },
                                '全部节点素材',
                              );
                              setMenuOpen(false);
                              setTransferMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <Archive className="h-3.5 w-3.5 text-white/45" />
                            全部节点素材 ZIP
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              void exportMaterials(
                                { image: true, video: false, text: false },
                                '图片素材',
                              );
                              setMenuOpen(false);
                              setTransferMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <FileImage className="h-3.5 w-3.5 text-white/45" />
                            仅图片 ZIP
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              void exportMaterials(
                                { image: false, video: true, text: false },
                                '视频素材',
                              );
                              setMenuOpen(false);
                              setTransferMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <Film className="h-3.5 w-3.5 text-white/45" />
                            仅视频 ZIP
                          </button>
                          <button
                            type="button"
                            disabled={transferBusy}
                            onClick={() => {
                              void exportMaterials(
                                { image: false, video: false, text: true },
                                '文字素材',
                              );
                              setMenuOpen(false);
                              setTransferMenu(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            <FileText className="h-3.5 w-3.5 text-white/45" />
                            仅文字 ZIP
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center">
                    <img
                      src="/favicon.svg"
                      alt=""
                      aria-hidden="true"
                      className="h-7 w-7 object-contain"
                    />
                  </div>
                  <span className="text-sm font-medium text-white/90">{title}</span>
                </div>
              )}
            </div>
          </TopCanvasToolbarRegion>

          {!isHome && (
            <div className="ml-1 hidden items-center gap-0.5 sm:flex">
              <TopCanvasToolbarRegion mode={toolbarMode('top-undo')} label="undo">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t('header.undo')}
                  title={`${t('header.undo')} (Ctrl+Z)`}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </TopCanvasToolbarRegion>
              <TopCanvasToolbarRegion mode={toolbarMode('top-redo')} label="redo">
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t('header.redo')}
                  title={`${t('header.redo')} (Ctrl+Y)`}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TopCanvasToolbarRegion>
              <TopCanvasToolbarRegion mode={toolbarMode('top-group')} label="group">
                <button
                  type="button"
                  onClick={createGroupFromSelection}
                  disabled={selectedCount < 1}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t('header.group')}
                  title={`${t('header.groupSelected')} (Ctrl+G)`}
                >
                  <Group className="h-4 w-4" />
                </button>
              </TopCanvasToolbarRegion>
            </div>
          )}
        </div>

        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSettingsInitialProviderId(undefined);
              setShowSettings(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            aria-label={t('settings.title')}
            title={t('settings.title')}
            data-system-settings-control="true"
          >
            <Settings className="h-4 w-4" />
          </button>
          <TopCanvasToolbarRegion mode={toolbarMode('top-ai-skill')} label="ai-skill">
            <button
              data-theme-role="ai-skill-launcher"
              type="button"
              onClick={() => setAiSkillOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-sm font-medium text-white hover:bg-white/15"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI SKILL
            </button>
          </TopCanvasToolbarRegion>
        </div>
      </header>

      {pendingSmartImport && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-import-title"
          data-smart-import-confirmation="true"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !transferBusy) setPendingSmartImport(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !transferBusy) setPendingSmartImport(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1D1D20] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium tracking-[0.16em] text-emerald-300/75 uppercase">
                  智能识别完成
                </p>
                <h2 id="smart-import-title" className="mt-1 text-base font-semibold text-white/95">
                  确认导入{smartImportTypeLabel(pendingSmartImport.detection)}
                </h2>
              </div>
              <button
                type="button"
                disabled={transferBusy}
                onClick={() => setPendingSmartImport(null)}
                aria-label="关闭智能导入确认"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 text-sm">
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-white/[0.07] px-3 py-2.5">
                <span className="text-white/40">所选文件</span>
                <span
                  className="truncate text-white/80"
                  title={pendingSmartImport.files.map((file) => file.name).join('、')}
                >
                  {pendingSmartImport.files.length === 1
                    ? pendingSmartImport.files[0]?.name
                    : `${pendingSmartImport.files.length} 个文件`}
                </span>
              </div>
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-white/[0.07] px-3 py-2.5">
                <span className="text-white/40">检测结果</span>
                <span className="font-medium text-emerald-200">
                  {smartImportTypeLabel(pendingSmartImport.detection)}
                </span>
              </div>
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-white/[0.07] px-3 py-2.5">
                <span className="text-white/40">包含内容</span>
                <span className="text-white/75">
                  {smartImportContentLabel(pendingSmartImport.detection)}
                </span>
              </div>
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
                <span className="text-white/40">导入位置</span>
                <span className="text-white/75">
                  {smartImportDestinationLabel(pendingSmartImport.detection)}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/80">
              {smartImportEffectLabel(pendingSmartImport.detection)}
              <span className="mt-1 block text-white/45">
                当前仍处于只读检测阶段；点击“确认导入”后才会写入数据。
              </span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                disabled={transferBusy}
                onClick={() => setPendingSmartImport(null)}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                disabled={transferBusy}
                aria-busy={transferBusy}
                onClick={() => void confirmSmartImport()}
                className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50"
                data-smart-import-confirm="true"
              >
                {transferBusy ? '正在导入…' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importNotice && (
        <div
          role={importNotice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`pointer-events-none fixed top-14 left-3 z-[60] max-w-sm rounded-lg border bg-[#1E1E21]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl ${
            importNotice.kind === 'error'
              ? 'border-rose-400/30 text-rose-200'
              : 'border-emerald-400/30 text-emerald-200'
          }`}
        >
          {importNotice.message}
        </div>
      )}

      {persistenceNoticeVisible && (
        <div
          role="alert"
          aria-live="assertive"
          data-canvas-persistence-error="true"
          className={`pointer-events-auto fixed left-3 z-[60] flex max-w-md items-start gap-2 rounded-lg border border-amber-400/30 bg-[#1E1E21]/95 px-3 py-2 text-xs text-amber-100 shadow-2xl backdrop-blur-xl ${
            importNotice ? 'top-24' : 'top-14'
          }`}
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p>
              {persistenceStatus.message ||
                t(
                  'header.persistenceError',
                  '画布自动保存失败；请立即导出画布或检查本机 Bridge 与磁盘空间。',
                )}
            </p>
            {(persistenceStatus.conflictCopyAvailable || persistenceStatus.state === 'error') && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {persistenceStatus.conflictCopyAvailable && (
                  <button
                    type="button"
                    onClick={downloadPersistenceConflictCopy}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 text-[11px] font-medium text-amber-100 hover:bg-amber-300/15 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none"
                  >
                    <Download aria-hidden="true" className="h-3 w-3" />
                    {t('header.exportConflictCopy', '导出冲突副本')}
                  </button>
                )}
                {persistenceStatus.state === 'conflict' &&
                  ['bridge-remote', 'bridge-local-read'].includes(
                    persistenceStatus.conflictingWriterId ?? '',
                  ) &&
                  persistenceStatus.conflictCopyAvailable && (
                    <button
                      type="button"
                      onClick={() => void reloadHostCanvasAfterConflict()}
                      disabled={persistenceRecoveryBusy}
                      aria-busy={persistenceRecoveryBusy}
                      data-canvas-conflict-reload-host="true"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 text-[11px] font-medium text-amber-100 hover:bg-amber-300/15 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                    >
                      <RefreshCw
                        aria-hidden="true"
                        className={`h-3 w-3 ${persistenceRecoveryBusy ? 'animate-spin' : ''}`}
                      />
                      {persistenceRecoveryBusy
                        ? t('header.reloadingHost', '正在载入…')
                        : t('header.backupAndReloadHost', '备份并载入主机版本')}
                    </button>
                  )}
                {persistenceStatus.state === 'error' && (
                  <button
                    type="button"
                    onClick={() => void retryCanvasPersistence()}
                    disabled={persistenceRetryBusy}
                    aria-busy={persistenceRetryBusy}
                    data-canvas-persistence-retry="true"
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 text-[11px] font-medium text-amber-100 hover:bg-amber-300/15 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`h-3 w-3 ${persistenceRetryBusy ? 'animate-spin' : ''}`}
                    />
                    {persistenceRetryBusy
                      ? t('header.retryingPersistence', '正在重试…')
                      : t('header.retryPersistence', '重试保存')}
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDismissedPersistenceNoticeKey(persistenceNoticeKey)}
            data-canvas-persistence-dismiss="true"
            aria-label={t('header.dismissPersistence', '关闭画布保存提示')}
            title={t('header.dismissPersistence', '关闭画布保存提示')}
            className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-100/70 hover:bg-amber-200/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!isHome && lanConflictNoticeVisible && (
        <div
          role="alert"
          aria-live="assertive"
          data-lan-collaboration-conflict="true"
          className={`pointer-events-auto fixed left-3 z-[60] flex max-w-md items-start gap-2 rounded-lg border border-amber-400/30 bg-[#1E1E21]/95 px-3 py-2 text-xs text-amber-100 shadow-2xl backdrop-blur-xl ${
            importNotice || persistenceNoticeVisible ? 'top-36' : 'top-14'
          }`}
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p>
              {activeLanConflict?.reason === 'remote-updated-while-local-dirty'
                ? t(
                    'header.lanRemoteConflict',
                    '主画布已由其他窗口或局域网终端更新；当前未保存修改没有覆盖主机数据。请重新载入或先导出双方副本。',
                  )
                : t(
                    'header.lanConflict',
                    '检测到本地未保存修改与主机画布内容不同；已停止自动覆盖，请重新载入或先导出双方副本。',
                  )}
            </p>
            <button
              type="button"
              onClick={downloadLanConflictCopy}
              className="mt-1.5 inline-flex h-6 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 text-[11px] font-medium text-amber-100 hover:bg-amber-300/15"
            >
              <Download className="h-3 w-3" />
              {t('header.exportLanConflictCopy', '导出双方副本')}
            </button>
          </div>
          <button
            type="button"
            onClick={dismissLanConflict}
            data-lan-collaboration-conflict-dismiss="true"
            aria-label={t('header.dismissLanConflict', '关闭局域网冲突提示')}
            title={t('header.dismissLanConflict', '关闭局域网冲突提示')}
            className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-100/70 hover:bg-amber-200/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <Suspense fallback={null}>
        {/* Agent chat panel */}
        {aiSkillOpen && <AiSkillPanel onClose={() => setAiSkillOpen(false)} />}

        {/* Unified settings panel */}
        {showSettings && (
          <SettingsPanel
            initialSection={settingsInitialProviderId ? 'ai-api' : 'general'}
            initialProviderId={settingsInitialProviderId}
            onClose={() => {
              setShowSettings(false);
              setSettingsInitialProviderId(undefined);
            }}
          />
        )}
      </Suspense>
    </>
  );
}
