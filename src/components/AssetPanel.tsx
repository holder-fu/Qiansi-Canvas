import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2,
  Image as ImageIcon,
  X,
  Plus,
  User,
  Mountain,
  LayoutTemplate,
  Box,
  Clapperboard,
  AudioLines,
  FolderCog,
} from 'lucide-react';
import {
  useCanvasStore,
  ASSET_CATEGORY_LABELS,
  DEFAULT_ASSET_CATEGORY,
  assetSessionMediaUnavailable,
  type AssetCategory,
  type AssetItem,
} from '../store/canvasStore';
import { KIND_DEFAULTS } from '../canvas/placeholders';
import { useReactFlow } from '@xyflow/react';
import { uploadAssetFile } from '../services/assetLibrary';
import { appendComposerReference, assetToComposerReference } from '../composer/assetReference';
import {
  mediaPreviewUrl,
  preferredImageSource,
  preferredVideoSource,
  resolveMediaSourceUrl,
  resolvedAudioSource,
} from '../lib/mediaPreview';
import { persistImageFile, persistVideoFile } from '../services/mediaPersistence';
import { useAppTranslation } from '../i18n/appI18n';
import type { FlowNode } from '../canvas/nodeTypes';
import {
  classifyAssetUploadFile,
  isDirectorModelUploadFile,
  withDetectedAssetUploadMime,
} from '../lib/assetUploadFile';

function offsetPos() {
  const w = window.innerWidth / 2 + (Math.random() - 0.5) * 200;
  const h = window.innerHeight / 2 + (Math.random() - 0.5) * 200;
  return { x: w, y: h };
}

const CATEGORY_ORDER: AssetCategory[] = [
  'character',
  'scene',
  'storyboard',
  'item',
  'video',
  'audio',
];

const CATEGORY_ICON: Record<AssetCategory, React.ReactNode> = {
  character: <User className="h-3.5 w-3.5" />,
  scene: <Mountain className="h-3.5 w-3.5" />,
  storyboard: <LayoutTemplate className="h-3.5 w-3.5" />,
  item: <Box className="h-3.5 w-3.5" />,
  video: <Clapperboard className="h-3.5 w-3.5" />,
  audio: <AudioLines className="h-3.5 w-3.5" />,
};

function assetCounts(assets: AssetItem[]) {
  const counts: Record<string, number> = {};
  for (const c of CATEGORY_ORDER) counts[c] = 0;
  for (const a of assets) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return counts;
}

function imagePersistenceKind(
  category: AssetCategory,
): 'character' | 'scene' | 'prop' | 'storyboard' {
  if (category === 'scene' || category === 'storyboard') return category;
  if (category === 'item') return 'prop';
  return 'character';
}

type SessionMediaKind = 'video' | 'audio';

function nodeReferencesSessionMedia(node: FlowNode, kind: SessionMediaKind, sessionUrl: string) {
  if (node.data.kind !== kind) return false;
  return kind === 'video'
    ? node.data.originalUrl === sessionUrl ||
        node.data.videoUrl === sessionUrl ||
        node.data.videos?.includes(sessionUrl) === true ||
        node.data.output === sessionUrl
    : node.data.audioUrl === sessionUrl ||
        node.data.audios?.includes(sessionUrl) === true ||
        node.data.output === sessionUrl;
}

function updateNodesSharingSessionMedia(
  kind: SessionMediaKind,
  sessionUrl: string,
  patch: Partial<FlowNode['data']>,
) {
  const store = useCanvasStore.getState();
  const targetIds = store.nodes
    .filter((node) => nodeReferencesSessionMedia(node, kind, sessionUrl))
    .map((node) => node.id);
  for (const nodeId of targetIds) store.updateNodeData(nodeId, patch);
  return targetIds;
}

function AssetImage({ asset }: { asset: AssetItem }) {
  const source = preferredImageSource(asset);
  const candidates = [asset.previewUrl, mediaPreviewUrl(source, 'image'), source]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(resolveMediaSourceUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
  }, [asset.id, asset.previewUrl, source]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={asset.title}
      loading="lazy"
      decoding="async"
      onError={() => setCandidateIndex((index) => index + 1)}
      className="h-full w-full object-cover"
    />
  );
}

function AssetVideoPreview({ asset }: { asset: AssetItem }) {
  const source = preferredVideoSource(asset);
  const candidates = [asset.previewUrl, mediaPreviewUrl(source, 'video')]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(resolveMediaSourceUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
  }, [asset.id, asset.previewUrl, source]);

  if (!src) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-white/20">
        <Clapperboard className="h-6 w-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={asset.title}
      loading="lazy"
      decoding="async"
      onError={() => setCandidateIndex((index) => index + 1)}
      className="h-full w-full bg-black object-cover"
    />
  );
}

function assetAudioPlaybackUrl(asset: AssetItem) {
  return asset.kind === 'audio' ? resolvedAudioSource(asset) : undefined;
}

function AssetAudioPreview({ asset }: { asset: AssetItem }) {
  const playbackUrl = assetAudioPlaybackUrl(asset);
  return (
    <div
      data-audio-source-state={playbackUrl ? 'available' : 'unavailable'}
      className="flex h-full flex-col items-center justify-center gap-2 bg-violet-500/[0.06] px-2 text-violet-200/60"
    >
      <AudioLines className={playbackUrl ? 'h-7 w-7' : 'h-6 w-6'} />
      {playbackUrl && (
        <audio
          src={playbackUrl}
          controls
          preload="metadata"
          className="h-8 w-full"
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}

export function AssetPanel() {
  const { t } = useAppTranslation();
  const assets = useCanvasStore((s) => s.assets);
  const removeAsset = useCanvasStore((s) => s.removeAsset);
  const updateAssetCategory = useCanvasStore((s) => s.updateAssetCategory);
  const addAssetToCanvas = useCanvasStore((s) => s.addAssetToCanvas);
  const setPanelOpen = useCanvasStore((s) => s.setPanelOpen);
  const referencePickerTargetId = useCanvasStore((s) => s.referencePickerTargetId);
  const setReferencePickerTargetId = useCanvasStore((s) => s.setReferencePickerTargetId);
  const addNodeWithImage = useCanvasStore((s) => s.addNodeWithImage);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const saveAsset = useCanvasStore((s) => s.saveAsset);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [activeCategory, setActiveCategory] = useState<AssetCategory>(DEFAULT_ASSET_CATEGORY);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<{
    id: string;
    left: number;
    top: number;
  } | null>(null);
  const videoUrls = Object.fromEntries(
    assets.flatMap((asset) => {
      const url = preferredVideoSource(asset);
      return url && !url.startsWith('blob:') ? [[asset.id, resolveMediaSourceUrl(url)]] : [];
    }),
  ) as Record<string, string>;

  useEffect(() => {
    if (!categoryMenu) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-asset-category-control="${categoryMenu.id}"]`)) {
        setCategoryMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCategoryMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [categoryMenu]);

  const filtered = assets.filter((a) => a.category === activeCategory);
  const counts = assetCounts(assets);
  const selectingForComposer = Boolean(referencePickerTargetId);
  const categoryLabel = (category: AssetCategory) =>
    t(`asset.category.${category}`, ASSET_CATEGORY_LABELS[category]);

  const closePanel = () => {
    setPanelOpen(null);
    if (referencePickerTargetId) setReferencePickerTargetId(null);
  };

  const addAssetReference = (asset: AssetItem) => {
    if (!referencePickerTargetId) return;
    if (assetSessionMediaUnavailable(asset)) return;
    const target = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === referencePickerTargetId);
    if (!target) {
      closePanel();
      return;
    }
    const reference = assetToComposerReference(asset, videoUrls[asset.id]);
    if (!reference) return;
    const next = appendComposerReference(target.data.composerReferences, reference);
    updateNodeData(referencePickerTargetId, { composerReferences: next });
    closePanel();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setUploadError(null);
    const rejectedFiles: string[] = [];
    for (const selectedFile of files) {
      const descriptor = classifyAssetUploadFile(selectedFile);
      if (!descriptor) {
        rejectedFiles.push(
          isDirectorModelUploadFile(selectedFile)
            ? t(
                'asset.uploadDirectorModelElsewhere',
                '「{name}」是 3D 模型，请在 3D 导演台中使用“导入 VRM / GLB / FBX”。',
                { name: selectedFile.name },
              )
            : t('asset.uploadUnsupportedFile', '「{name}」不是资产库支持的图片、视频或音频格式。', {
                name: selectedFile.name,
              }),
        );
        continue;
      }
      const file = withDetectedAssetUploadMime(selectedFile, descriptor);
      if (descriptor.kind === 'video' || descriptor.kind === 'audio') {
        const pos = screenToFlowPosition(offsetPos());
        const kind = descriptor.kind;
        const nodeId = addNode(kind, pos);
        const sessionUrl = URL.createObjectURL(file);
        updateNodeData(nodeId, {
          ...(kind === 'video'
            ? {
                originalUrl: sessionUrl,
                videoUrl: sessionUrl,
                videos: [sessionUrl],
                videoFileName: file.name,
                imageUrl: undefined,
                images: undefined,
              }
            : {
                audioUrl: sessionUrl,
                audios: [sessionUrl],
                audioFileName: file.name,
              }),
          output: sessionUrl,
          bridgeAssetId: undefined,
          mediaPersistenceState: undefined,
          mediaMimeType: file.type,
          audioSourceState: undefined,
          title: file.name.replace(/\.[^.]+$/, ''),
          result: t('asset.status.savingLocally', '正在把媒体保存到本机素材库…'),
        });
        void (async () => {
          if (kind === 'video') {
            const item = await persistVideoFile(file, activeProjectId);
            const updatedNodeIds = updateNodesSharingSessionMedia(kind, sessionUrl, {
              originalUrl: item.originalUrl,
              previewUrl: item.previewUrl,
              mediaWidth: item.width,
              mediaHeight: item.height,
              durationSeconds: item.durationSeconds,
              videoUrl: item.originalUrl,
              videos: [item.originalUrl],
              output: item.originalUrl,
              bridgeAssetId: item.bridgeAssetId,
              mediaPersistenceState: undefined,
              result: t('asset.status.savedLocally', '媒体已保存到本机素材库。'),
            });
            for (const updatedNodeId of updatedNodeIds) {
              useCanvasStore.getState().propagate(updatedNodeId);
            }
            const assetNodeId = updatedNodeIds.includes(nodeId) ? nodeId : updatedNodeIds[0];
            if (assetNodeId) saveAsset(assetNodeId, activeCategory);
          } else {
            const item = await uploadAssetFile(file, kind, { project: activeProjectId });
            const updatedNodeIds = updateNodesSharingSessionMedia(kind, sessionUrl, {
              audioUrl: item.url,
              audios: [item.url],
              output: item.url,
              bridgeAssetId: item.id,
              mediaPersistenceState: undefined,
              audioSourceState: undefined,
              result: t('asset.status.savedLocally', '媒体已保存到本机素材库。'),
            });
            for (const updatedNodeId of updatedNodeIds) {
              useCanvasStore.getState().propagate(updatedNodeId);
            }
            const assetNodeId = updatedNodeIds.includes(nodeId) ? nodeId : updatedNodeIds[0];
            if (assetNodeId) saveAsset(assetNodeId, activeCategory);
          }
        })().catch((error) => {
          const failureMessage =
            error instanceof Error
              ? t('asset.uploadFailedWithError', '「{name}」保存失败：{message}', {
                  name: file.name,
                  message: error.message,
                })
              : t('asset.uploadFailed', '「{name}」保存失败。', { name: file.name });
          setUploadError(failureMessage);
          const updatedNodeIds = updateNodesSharingSessionMedia(kind, sessionUrl, {
            bridgeAssetId: undefined,
            mediaPersistenceState: 'session-only',
            audioSourceState: undefined,
            result:
              error instanceof Error
                ? t('asset.status.sessionOnlyWithError', '媒体仅在当前会话可用：{message}', {
                    message: error.message,
                  })
                : t('asset.status.sessionOnly', '媒体仅在当前会话可用，本机素材保存失败。'),
          });
          for (const updatedNodeId of updatedNodeIds) {
            useCanvasStore.getState().propagate(updatedNodeId);
          }
          const assetNodeId = updatedNodeIds.includes(nodeId) ? nodeId : updatedNodeIds[0];
          if (assetNodeId) saveAsset(assetNodeId, activeCategory);
        });
        continue;
      }
      try {
        const item = await persistImageFile(
          file,
          imagePersistenceKind(activeCategory),
          activeProjectId,
        );
        const pos = screenToFlowPosition(offsetPos());
        const nodeId = addNodeWithImage(
          'image',
          pos,
          item.originalUrl,
          file.name.replace(/\.[^.]+$/, ''),
        );
        updateNodeData(nodeId, {
          originalUrl: item.originalUrl,
          previewUrl: item.previewUrl,
          mediaWidth: item.width,
          mediaHeight: item.height,
          bridgeAssetId: item.bridgeAssetId,
          imageFileName: file.name,
        });
        if (nodeId) saveAsset(nodeId, activeCategory);
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? t('asset.uploadImageSessionOnlyWithError', '「{name}」仅在当前会话可用：{message}', {
                name: file.name,
                message: error.message,
              })
            : t('asset.uploadImageSessionOnly', '「{name}」仅在当前会话可用。', {
                name: file.name,
              }),
        );
        const sessionUrl = URL.createObjectURL(file);
        const pos = screenToFlowPosition(offsetPos());
        const nodeId = addNodeWithImage(
          'image',
          pos,
          sessionUrl,
          file.name.replace(/\.[^.]+$/, ''),
        );
        if (nodeId) {
          updateNodeData(nodeId, {
            imageFileName: file.name,
            mediaMimeType: file.type,
            mediaPersistenceState: 'session-only',
            result: t(
              'asset.status.imageSessionOnly',
              '图片仅在当前会话可用，刷新页面后请重新上传原文件。',
            ),
          });
          saveAsset(nodeId, activeCategory);
        }
      }
    }
    if (rejectedFiles.length > 0) setUploadError(rejectedFiles.join('\n'));
  };

  return (
    <div
      data-theme-role="asset-panel"
      className="pointer-events-auto flex h-full w-[min(420px,100vw)] flex-col border-r border-edge bg-panel/95 shadow-2xl backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-edge px-4">
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-medium text-white/90"
            title={t('asset.globalLibraryTitle', '全局资产库')}
          >
            {t('asset.globalLibraryTitle', '全局资产库')}
          </h3>
          {selectingForComposer && (
            <p className="truncate text-[10px] text-cyan-300/65">
              {t('asset.selectAsReferenceHint', '选择素材作为当前视频的参考')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
            title={t('asset.uploadToCurrentCategory', '上传到当前分类')}
            aria-label={t('asset.uploadToCurrentCategory', '上传到当前分类')}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closePanel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
            title={t('common.close', '关闭')}
            aria-label={t('asset.closePanel', '关闭资产库')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {/* Category tabs */}
      <div
        data-theme-role="segmented-control"
        className="shrink-0 grid grid-cols-3 gap-1.5 border-b border-edge px-3 py-2"
      >
        {CATEGORY_ORDER.map((cat) => {
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              data-theme-role="segmented-item"
              data-active={active ? 'true' : 'false'}
              data-asset-category-tab={cat}
              onClick={() => {
                setActiveCategory(cat);
                setUploadError(null);
              }}
              className={`flex items-center justify-center rounded-lg px-2 py-1.5 text-xs transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
              title={categoryLabel(cat)}
            >
              <span className="inline-grid max-w-full grid-cols-[16px_auto_20px] items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center">
                  {CATEGORY_ICON[cat]}
                </span>
                <span className="truncate text-left">{categoryLabel(cat)}</span>
                {(counts[cat] ?? 0) > 0 && (
                  <span
                    className={`inline-flex h-4 min-w-5 items-center justify-center rounded-full px-1 text-[10px] leading-none ${active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'}`}
                  >
                    {counts[cat] ?? 0}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {uploadError && (
        <div
          role="alert"
          data-asset-upload-error
          className="mx-3 mt-2 flex shrink-0 items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100/90"
        >
          <p className="min-w-0 flex-1 whitespace-pre-wrap">{uploadError}</p>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-100/60 hover:bg-red-400/10 hover:text-red-50"
            aria-label={t('asset.dismissUploadError', '关闭上传错误')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-white/30">
            <ImageIcon className="h-8 w-8" />
            <p>
              {t('asset.emptyCategory', '暂无 {category} 资产', {
                category: categoryLabel(activeCategory),
              })}
            </p>
            <p>{t('asset.emptyHint', '点击 + 上传，或右键节点选择「保存为资产」')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => {
              const sessionMediaUnavailable = assetSessionMediaUnavailable(asset);
              return (
                <div
                  key={asset.id}
                  data-theme-role="library-card"
                  data-session-media-state={sessionMediaUnavailable ? 'unavailable' : 'available'}
                  draggable={!sessionMediaUnavailable}
                  onDragStart={(e) => {
                    if (sessionMediaUnavailable) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData('application/asset-id', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`group relative overflow-visible rounded-lg border border-edge bg-[#1a1a1c] ${sessionMediaUnavailable ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                >
                  <div
                    data-theme-role="library-preview"
                    className="relative h-24 w-full overflow-hidden rounded-t-lg"
                  >
                    {asset.kind === 'video' || asset.kind === 'video-comp' ? (
                      <AssetVideoPreview asset={asset} />
                    ) : asset.kind === 'audio' ? (
                      <AssetAudioPreview asset={asset} />
                    ) : preferredImageSource(asset) ? (
                      <AssetImage asset={asset} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/20">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={sessionMediaUnavailable}
                      onClick={() => {
                        if (sessionMediaUnavailable) return;
                        if (selectingForComposer) {
                          addAssetReference(asset);
                          return;
                        }
                        const pos = screenToFlowPosition(offsetPos());
                        addAssetToCanvas(asset.id, pos);
                        setPanelOpen(null);
                      }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-black/65 px-2.5 py-1.5 text-[11px] font-medium text-white/85 opacity-0 shadow-lg transition-all hover:bg-black/90 hover:text-white focus-visible:opacity-100 disabled:cursor-not-allowed disabled:text-amber-200/75 group-hover:opacity-100"
                      title={
                        sessionMediaUnavailable
                          ? t(
                              'asset.sessionMediaUnavailable',
                              '此素材只存在于上一次会话中，请重新上传原文件。',
                            )
                          : selectingForComposer
                            ? t('asset.addReferenceTitle', '将「{title}」加入当前视频指令框', {
                                title: asset.title,
                              })
                            : t('asset.addToCanvasTitle', '添加「{title}」到画布', {
                                title: asset.title,
                              })
                      }
                    >
                      {sessionMediaUnavailable
                        ? t('asset.reuploadRequired', '请重新上传')
                        : selectingForComposer
                          ? t('asset.selectAsset', '选择素材')
                          : t('asset.placeOnCanvas', '放到画布')}
                    </button>
                  </div>
                  <div className="px-2 py-1">
                    <p className="truncate text-[11px] text-white/60">{asset.title}</p>
                    <p className="text-[10px] text-white/30">
                      {sessionMediaUnavailable
                        ? t('asset.reuploadRequiredHint', '媒体已失效 · 需重新上传')
                        : t(
                            `node.kind.${asset.kind}`,
                            KIND_DEFAULTS[asset.kind]?.title ?? asset.kind,
                          )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAsset(asset.id)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white/60 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                    title={t('asset.delete', '删除资产')}
                    aria-label={t('asset.deleteNamed', '删除资产 {title}', { title: asset.title })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <div data-asset-category-control={asset.id} className="absolute bottom-1 right-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const menuHeight = 190;
                        const top =
                          rect.bottom + 4 + menuHeight <= window.innerHeight
                            ? rect.bottom + 4
                            : Math.max(8, rect.top - menuHeight - 4);
                        setCategoryMenu((current) =>
                          current?.id === asset.id
                            ? null
                            : { id: asset.id, left: Math.max(8, rect.right - 112), top },
                        );
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/65 text-white/65 transition-colors hover:bg-black/85 hover:text-white"
                      title={t('asset.reclassify', '重新分类')}
                      aria-label={t('asset.reclassifyNamed', '重新分类 {title}', {
                        title: asset.title,
                      })}
                    >
                      <FolderCog className="h-3.5 w-3.5" />
                    </button>
                    {categoryMenu?.id === asset.id &&
                      createPortal(
                        <div
                          data-asset-category-control={asset.id}
                          data-theme-role="asset-category-menu"
                          className="fixed z-[200] w-28 overflow-hidden rounded-lg border border-white/10 bg-[#242426] p-1 shadow-xl"
                          style={{ left: categoryMenu.left, top: categoryMenu.top }}
                        >
                          {CATEGORY_ORDER.map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => {
                                updateAssetCategory(asset.id, category);
                                setCategoryMenu(null);
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${asset.category === category ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.08] hover:text-white'}`}
                            >
                              {CATEGORY_ICON[category]}
                              {categoryLabel(category)}
                            </button>
                          ))}
                        </div>,
                        document.body,
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
