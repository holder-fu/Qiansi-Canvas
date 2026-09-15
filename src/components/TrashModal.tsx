import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArchiveRestore,
  AudioLines,
  Boxes,
  File,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react';
import { Modal } from './Modal';
import { flushCanvasPersistence, useCanvasStore, type TrashItem } from '../store/canvasStore';
import { WORKSPACES } from '../canvas/workspaces';
import {
  TRASH_CATEGORY_LABELS,
  trashItemCategories,
  trashItemKindLabel,
  trashItemMatchesCategory,
  type TrashCategory,
} from './trashCategories';
import { useAppTranslation } from '../i18n/appI18n';
import { itemMedia, itemText } from './trashPreview';
import {
  applyStorageGarbageCleanup,
  collectBridgeMediaReferences,
  collectLiveStorageMediaReferences,
  listStorageGarbageFiles,
  scanStorageGarbage,
  type StorageCleanupFileItem,
  type StorageCleanupScan,
  type StorageCleanupScope,
} from '../services/storageCleanup';
import { placeCleanupFilePreview } from './cleanupFilePreview';

const CATEGORY_TABS = [
  { id: 'all', icon: LayoutGrid },
  { id: 'node', icon: Boxes },
  { id: 'image', icon: ImageIcon },
  { id: 'video', icon: Video },
  { id: 'audio', icon: AudioLines },
] as const;

type CleanupScopeFilter = StorageCleanupScope | 'all';
const CLEANUP_SCOPE_ORDER: CleanupScopeFilter[] = [
  'all',
  'preview',
  'output',
  'assetOrphan',
  'temporary',
];

function mediaCount(item: TrashItem) {
  return item.nodes.filter((node) =>
    Boolean(
      node.data.imageUrl ||
      node.data.images?.length ||
      node.data.videoUrl ||
      node.data.videos?.length ||
      node.data.audioUrl ||
      node.data.audios?.length ||
      node.data.assetVideoId ||
      node.data.bridgeAssetId,
    ),
  ).length;
}

function formatStorageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function CleanupFileThumbnail({
  item,
  previewLabel,
  onShowPreview,
  onHidePreview,
}: {
  item: StorageCleanupFileItem;
  previewLabel: string;
  onShowPreview: (item: StorageCleanupFileItem, anchor: HTMLElement) => void;
  onHidePreview: () => void;
}) {
  const previewable = item.kind === 'image' && Boolean(item.previewUrl);
  const content = (
    <>
      {item.kind === 'image' ? (
        <ImageIcon className="h-4 w-4 text-white/20" />
      ) : item.kind === 'video' ? (
        <Video className="h-4 w-4 text-violet-300/40" />
      ) : item.kind === 'audio' ? (
        <AudioLines className="h-4 w-4 text-sky-300/40" />
      ) : (
        <File className="h-4 w-4 text-white/25" />
      )}
      {item.previewUrl && (
        <img
          src={item.previewUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </>
  );
  const baseClassName =
    'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.035]';

  if (!previewable) return <div className={baseClassName}>{content}</div>;

  return (
    <button
      type="button"
      className={`${baseClassName} outline-none transition-colors hover:border-white/25 focus-visible:border-white/35 focus-visible:ring-1 focus-visible:ring-white/25`}
      aria-label={previewLabel}
      onMouseEnter={(event) => onShowPreview(item, event.currentTarget)}
      onMouseLeave={onHidePreview}
      onFocus={(event) => onShowPreview(item, event.currentTarget)}
      onBlur={onHidePreview}
    >
      {content}
    </button>
  );
}

function CleanupFileExplorer({
  scan,
  files,
  selectedScope,
  loading,
  hasMore,
  visibleTotal,
  onSelectScope,
  onLoadMore,
}: {
  scan: StorageCleanupScan;
  files: StorageCleanupFileItem[];
  selectedScope: CleanupScopeFilter;
  loading: boolean;
  hasMore: boolean;
  visibleTotal: number;
  onSelectScope: (scope: CleanupScopeFilter) => void;
  onLoadMore: () => void;
}) {
  const { t, formatNumber } = useAppTranslation();
  const [imagePreview, setImagePreview] = useState<{
    item: StorageCleanupFileItem;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => setImagePreview(null), [files, selectedScope]);

  const showImagePreview = (item: StorageCleanupFileItem, anchor: HTMLElement) => {
    if (item.kind !== 'image' || !item.previewUrl) return;
    const rect = anchor.getBoundingClientRect();
    const position = placeCleanupFilePreview(rect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setImagePreview({ item, ...position });
  };

  const typeLabel = (item: StorageCleanupFileItem) => {
    if (item.kind === 'image') return t('trash.cleanup.fileType.image', '图片');
    if (item.kind === 'video') return t('trash.cleanup.fileType.video', '视频');
    if (item.kind === 'audio') return t('trash.cleanup.fileType.audio', '音频');
    if (item.kind === 'temporary') return t('trash.cleanup.fileType.temporary', '临时文件');
    return item.extension ? item.extension.toUpperCase() : t('trash.cleanup.fileType.file', '文件');
  };

  return (
    <div className="mt-3 flex h-[224px] min-h-0 overflow-hidden rounded-xl border border-white/[0.07] bg-black/15">
      <aside className="w-44 shrink-0 border-r border-white/[0.06] p-2">
        <p className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.16em] text-white/25">
          {t('trash.cleanup.structure', '清理结构')}
        </p>
        <div className="space-y-0.5">
          {CLEANUP_SCOPE_ORDER.map((scopeId) => {
            const summary =
              scopeId === 'all'
                ? { label: t('trash.cleanup.scope.all', '全部文件'), files: scan.summary.files }
                : scan.summary.scopes[scopeId];
            if (scopeId !== 'all' && summary.files === 0) return null;
            const active = selectedScope === scopeId;
            return (
              <button
                key={scopeId}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectScope(scopeId)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-100/80'
                    : 'text-white/45 hover:bg-white/[0.05] hover:text-white/65'
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{summary.label}</span>
                <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/35">
                  {formatNumber(summary.files)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_150px] gap-3 border-b border-white/[0.06] px-3 py-2 text-[10px] text-white/30">
          <span>{t('trash.cleanup.column.name', '名称')}</span>
          <span>{t('trash.cleanup.column.type', '类型')}</span>
          <span>{t('trash.cleanup.column.size', '大小')}</span>
          <span>{t('trash.cleanup.column.location', '位置')}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={() => setImagePreview(null)}>
          {files.map((item) => (
            <div
              key={item.id}
              title={`data/${item.relativePath}`}
              className="grid grid-cols-[minmax(0,1fr)_70px_70px_150px] items-center gap-3 border-b border-white/[0.04] px-3 py-1.5 text-[10px] hover:bg-white/[0.025]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <CleanupFileThumbnail
                  item={item}
                  previewLabel={t('trash.cleanup.previewImage', '预览图片：{name}', {
                    name: item.name,
                  })}
                  onShowPreview={showImagePreview}
                  onHidePreview={() => setImagePreview(null)}
                />
                <span className="min-w-0 truncate text-white/65">{item.name}</span>
              </div>
              <span className="truncate text-white/35">{typeLabel(item)}</span>
              <span className="text-white/35">{formatStorageBytes(item.size)}</span>
              <span className="truncate font-mono text-[10px] text-white/25">
                data/{item.folder}
              </span>
            </div>
          ))}
          {!loading && files.length === 0 && (
            <div className="flex h-full min-h-24 items-center justify-center text-xs text-white/30">
              {t('trash.cleanup.noFilesInScope', '此分类没有可清理文件。')}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-white/35">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('trash.cleanup.loadingFiles', '正在读取文件清单…')}
            </div>
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center justify-between border-t border-white/[0.06] px-3 text-[10px] text-white/30">
          <span>
            {t('trash.cleanup.visibleFiles', '已显示 {visible} / {total} 个文件', {
              visible: formatNumber(files.length),
              total: formatNumber(visibleTotal),
            })}
          </span>
          {hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={onLoadMore}
              className="text-emerald-200/55 hover:text-emerald-100 disabled:opacity-40"
            >
              {t('trash.cleanup.loadMore', '加载更多')}
            </button>
          )}
        </div>
      </div>
      {imagePreview && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[120] w-80 overflow-hidden rounded-xl border border-white/20 bg-[#111214]/98 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.72)] backdrop-blur-xl"
              style={{ left: imagePreview.left, top: imagePreview.top }}
            >
              <div className="flex h-60 items-center justify-center overflow-hidden rounded-lg bg-black/45">
                <img
                  src={imagePreview.item.previewUrl}
                  alt={imagePreview.item.name}
                  className="max-h-full max-w-full object-contain"
                  onError={() => setImagePreview(null)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-1 pt-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-white/75">
                  {imagePreview.item.name}
                </span>
                <span className="shrink-0 text-white/35">
                  {formatStorageBytes(imagePreview.item.size)}
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function EmptyTrash({ category }: { category: TrashCategory }) {
  const { t } = useAppTranslation();
  const isAll = category === 'all';
  const categoryLabel = t(`trash.category.${category}`, TRASH_CATEGORY_LABELS[category]);
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
        <Trash2 className="h-6 w-6 text-white/25" />
      </div>
      <p className="text-sm font-medium text-white/70">
        {isAll
          ? t('trash.empty.title', '回收站是空的')
          : t('trash.empty.categoryTitle', '{category}分类暂无内容', {
              category: categoryLabel,
            })}
      </p>
      <p className="mt-2 max-w-sm text-xs leading-5 text-white/35">
        {isAll
          ? t(
              'trash.empty.description',
              '删除的节点、分组以及关联文件会先保存在当前画布的回收站中。',
            )
          : t('trash.empty.categoryDescription', '删除的{category}内容会显示在这里。', {
              category: categoryLabel,
            })}
      </p>
    </div>
  );
}

export function TrashModal() {
  const { t, formatDate, formatNumber } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const trash = useCanvasStore((state) => state.trash);
  const restoreTrashItem = useCanvasStore((state) => state.restoreTrashItem);
  const permanentlyDeleteTrashItem = useCanvasStore((state) => state.permanentlyDeleteTrashItem);
  const emptyTrash = useCanvasStore((state) => state.emptyTrash);
  const nodes = useCanvasStore((state) => state.nodes);
  const assets = useCanvasStore((state) => state.assets);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState<TrashCategory>('all');
  const [cleanupScan, setCleanupScan] = useState<StorageCleanupScan | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState<'scan' | 'apply' | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);
  const [cleanupScope, setCleanupScope] = useState<CleanupScopeFilter>('all');
  const [cleanupFiles, setCleanupFiles] = useState<StorageCleanupFileItem[]>([]);
  const [cleanupFilesLoading, setCleanupFilesLoading] = useState(false);
  const [cleanupFilesTotal, setCleanupFilesTotal] = useState(0);
  const [cleanupFilesHasMore, setCleanupFilesHasMore] = useState(false);
  const cleanupFilesRequest = useRef(0);
  const sortedTrash = useMemo(
    () => [...trash].sort((left, right) => right.deletedAt - left.deletedAt),
    [trash],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<TrashCategory, number> = {
      all: trash.length,
      node: 0,
      image: 0,
      video: 0,
      audio: 0,
    };
    for (const item of trash) {
      for (const itemCategory of trashItemCategories(item)) counts[itemCategory] += 1;
    }
    return counts;
  }, [trash]);
  const filteredTrash = useMemo(
    () => sortedTrash.filter((item) => trashItemMatchesCategory(item, category)),
    [category, sortedTrash],
  );

  const permanentlyDelete = async (id: string) => {
    setBusyId(id);
    try {
      await permanentlyDeleteTrashItem(id);
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    if (!confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    setBusyId('all');
    try {
      await emptyTrash();
      setConfirmEmpty(false);
    } finally {
      setBusyId(null);
    }
  };

  const currentMediaReferences = async () => {
    await flushCanvasPersistence();
    const activeReferences = collectBridgeMediaReferences([
      JSON.stringify({ nodes, assets, trash }),
    ]);
    return [...new Set([...collectLiveStorageMediaReferences(), ...activeReferences])];
  };

  const loadCleanupFiles = async (scanId: string, scope: CleanupScopeFilter, append = false) => {
    const requestId = ++cleanupFilesRequest.current;
    const offset = append ? cleanupFiles.length : 0;
    setCleanupFilesLoading(true);
    if (!append) {
      setCleanupFiles([]);
      setCleanupFilesTotal(0);
      setCleanupFilesHasMore(false);
    }
    try {
      const page = await listStorageGarbageFiles(scanId, { scope, offset, limit: 100 });
      if (requestId !== cleanupFilesRequest.current) return;
      setCleanupFiles((current) => (append ? [...current, ...page.items] : page.items));
      setCleanupFilesTotal(page.total);
      setCleanupFilesHasMore(page.hasMore);
    } catch (error) {
      if (requestId !== cleanupFilesRequest.current) return;
      setCleanupNotice(
        error instanceof Error
          ? error.message
          : t('trash.cleanup.fileListError', '文件清单读取失败。'),
      );
    } finally {
      if (requestId === cleanupFilesRequest.current) setCleanupFilesLoading(false);
    }
  };

  const scanGarbage = async () => {
    setCleanupBusy('scan');
    setCleanupNotice(null);
    setConfirmCleanup(false);
    setCleanupScan(null);
    cleanupFilesRequest.current += 1;
    setCleanupScope('all');
    setCleanupFiles([]);
    setCleanupFilesTotal(0);
    setCleanupFilesHasMore(false);
    setCleanupFilesLoading(false);
    try {
      const scan = await scanStorageGarbage(await currentMediaReferences());
      setCleanupScan(scan);
      if (scan.summary.files === 0) {
        setCleanupNotice(t('trash.cleanup.empty', '没有发现可安全清理的垃圾文件。'));
      } else {
        await loadCleanupFiles(scan.scanId, 'all');
      }
    } catch (error) {
      setCleanupNotice(
        error instanceof Error ? error.message : t('trash.cleanup.scanError', '垃圾文件扫描失败。'),
      );
    } finally {
      setCleanupBusy(null);
    }
  };

  const cleanGarbage = async () => {
    if (!cleanupScan || cleanupScan.summary.files === 0) return;
    if (!confirmCleanup) {
      setConfirmCleanup(true);
      return;
    }
    setCleanupBusy('apply');
    setCleanupNotice(null);
    try {
      const result = await applyStorageGarbageCleanup(
        cleanupScan.scanId,
        await currentMediaReferences(),
      );
      setCleanupNotice(
        t('trash.cleanup.finished', '已清理 {files} 个文件，释放 {size}。', {
          files: formatNumber(result.deletedFiles),
          size: formatStorageBytes(result.deletedBytes),
        }) +
          (result.skippedFiles > 0
            ? t('trash.cleanup.skipped', ' {count} 个已变化或重新被引用的文件已跳过。', {
                count: formatNumber(result.skippedFiles),
              })
            : ''),
      );
      setCleanupScan(null);
      cleanupFilesRequest.current += 1;
      setCleanupFiles([]);
      setCleanupFilesTotal(0);
      setCleanupFilesHasMore(false);
      setCleanupFilesLoading(false);
      setConfirmCleanup(false);
    } catch (error) {
      setCleanupNotice(
        error instanceof Error
          ? error.message
          : t('trash.cleanup.applyError', '垃圾文件清理失败。'),
      );
    } finally {
      setCleanupBusy(null);
    }
  };

  return (
    <Modal
      open={openModal === 'trash'}
      onClose={closeModal}
      width="w-[920px]"
      title={
        <span className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-white/55" />
          {t('trash.title', '回收站')}
          <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-normal text-white/45">
            {formatNumber(trash.length)}
          </span>
        </span>
      }
    >
      <div className="flex h-[620px] min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div>
            <p className="text-xs text-white/60">{t('trash.canvasTitle', '当前画布回收站')}</p>
            <p className="mt-1 text-[10px] text-white/30">
              {t(
                'trash.description',
                '恢复会返回原画布；永久删除会清理没有被其他节点引用的本机媒体。',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cleanupBusy !== null || busyId !== null}
              onClick={() => void scanGarbage()}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs text-emerald-200/75 transition-colors hover:bg-emerald-500/[0.12] hover:text-emerald-100 disabled:opacity-40"
            >
              {cleanupBusy === 'scan' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <HardDrive className="h-3.5 w-3.5" />
              )}
              {cleanupBusy === 'scan'
                ? t('trash.cleanup.scanning', '正在扫描…')
                : t('trash.cleanup.scanAction', '垃圾清理')}
            </button>
            {trash.length > 0 && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void clearAll()}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                  confirmEmpty
                    ? 'border-red-400/25 bg-red-500/12 text-red-300 hover:bg-red-500/20'
                    : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/75'
                }`}
              >
                {busyId === 'all'
                  ? t('trash.clearing', '正在清理…')
                  : confirmEmpty
                    ? t('trash.confirmEmpty', '再次点击确认清空')
                    : t('trash.emptyAction', '清空回收站')}
              </button>
            )}
          </div>
        </div>

        {(cleanupScan || cleanupNotice) && (
          <div className="border-b border-emerald-400/10 bg-emerald-500/[0.035] px-5 py-3">
            {cleanupScan && cleanupScan.summary.files > 0 && (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-white/75">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300/70" />
                      <span>
                        {t('trash.cleanup.found', '发现 {files} 个可清理文件，共 {size}', {
                          files: formatNumber(cleanupScan.summary.files),
                          size: formatStorageBytes(cleanupScan.summary.bytes),
                        })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(cleanupScan.summary.scopes)
                        .filter(([, scope]) => scope.files > 0)
                        .map(([scopeId, scope]) => (
                          <span
                            key={scopeId}
                            className="rounded-md border border-white/[0.06] bg-black/15 px-2 py-1 text-[10px] text-white/45"
                          >
                            {scope.label} · {formatNumber(scope.files)} ·{' '}
                            {formatStorageBytes(scope.bytes)}
                          </span>
                        ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-white/30">
                      {t(
                        'trash.cleanup.protection',
                        '画布数据、快照、回收站和当前画布引用均受保护；节点使用资产副本时，对应原始生成文件也不会清理。最近 {minutes} 分钟生成的文件同样受保护。',
                        { minutes: formatNumber(cleanupScan.protectedRecentMinutes) },
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={cleanupBusy !== null}
                    onClick={() => void cleanGarbage()}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                      confirmCleanup
                        ? 'border-red-400/25 bg-red-500/12 text-red-200 hover:bg-red-500/20'
                        : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/16'
                    }`}
                  >
                    {cleanupBusy === 'apply'
                      ? t('trash.cleanup.cleaning', '正在清理…')
                      : confirmCleanup
                        ? t('trash.cleanup.confirm', '确认清理全部 {count} 个', {
                            count: formatNumber(cleanupScan.summary.files),
                          })
                        : t('trash.cleanup.applyAction', '清理全部 {count} 个', {
                            count: formatNumber(cleanupScan.summary.files),
                          })}
                  </button>
                </div>
                <CleanupFileExplorer
                  scan={cleanupScan}
                  files={cleanupFiles}
                  selectedScope={cleanupScope}
                  loading={cleanupFilesLoading}
                  hasMore={cleanupFilesHasMore}
                  visibleTotal={cleanupFilesTotal}
                  onSelectScope={(scope) => {
                    setCleanupScope(scope);
                    setConfirmCleanup(false);
                    void loadCleanupFiles(cleanupScan.scanId, scope);
                  }}
                  onLoadMore={() => void loadCleanupFiles(cleanupScan.scanId, cleanupScope, true)}
                />
              </>
            )}
            {cleanupNotice && (
              <p className="mt-2 text-xs leading-5 text-white/55">{cleanupNotice}</p>
            )}
          </div>
        )}

        <div
          className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-2"
          aria-label={t('trash.categoriesAria', '回收站分类')}
        >
          {CATEGORY_TABS.map(({ id, icon: Icon }) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategory(id);
                  setConfirmId(null);
                  setConfirmEmpty(false);
                }}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors ${
                  active
                    ? 'bg-white/[0.09] text-white/85'
                    : 'text-white/40 hover:bg-white/[0.05] hover:text-white/65'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`trash.category.${id}`, TRASH_CATEGORY_LABELS[id])}
                <span
                  className={`min-w-4 rounded-full px-1 text-center text-[10px] ${
                    active ? 'bg-white/[0.09] text-white/60' : 'bg-white/[0.04] text-white/30'
                  }`}
                >
                  {formatNumber(categoryCounts[id])}
                </span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filteredTrash.length === 0 ? (
            <EmptyTrash category={category} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredTrash.map((item) => {
                const media = itemMedia(item);
                const text = itemText(item);
                const rawKind = trashItemKindLabel(item);
                const nodeKind = item.nodes[0]?.data.kind;
                const kind =
                  item.nodes.length > 1
                    ? t('trash.kind.nodeGroup', rawKind)
                    : nodeKind
                      ? t(`node.kind.${nodeKind}`, rawKind)
                      : t('trash.kind.node', rawKind);
                const categories = trashItemCategories(item);
                const files = mediaCount(item);
                const workspaceTitle = t(
                  `workspace.${item.workspace}.title`,
                  WORKSPACES[item.workspace]?.title ?? item.workspace,
                );
                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] transition-colors hover:border-white/[0.12]"
                  >
                    <div className="flex min-h-32">
                      <div className="flex w-36 shrink-0 items-center justify-center overflow-hidden border-r border-white/[0.06] bg-black/20">
                        {media?.type === 'image' ? (
                          <img src={media.url} alt="" className="h-32 w-full object-cover" />
                        ) : media?.type === 'video' ? (
                          <video
                            src={media.url}
                            poster={media.posterUrl}
                            muted
                            preload="auto"
                            className="h-32 w-full object-cover"
                          />
                        ) : media?.type === 'audio' ? (
                          <div className="flex h-32 w-full flex-col items-center justify-center gap-2 px-3">
                            <AudioLines className="h-8 w-8 text-white/20" />
                            <audio
                              controls
                              preload="metadata"
                              src={media.url}
                              className="h-8 w-full"
                            />
                          </div>
                        ) : text ? (
                          <div className="flex h-32 w-full items-start gap-2 overflow-hidden p-3 text-left">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                            <p className="line-clamp-5 text-[11px] leading-5 text-white/55">
                              {text}
                            </p>
                          </div>
                        ) : categories.has('audio') ? (
                          <AudioLines className="h-8 w-8 text-white/20" />
                        ) : rawKind === '节点组' || rawKind === '分组' ? (
                          <Boxes className="h-8 w-8 text-white/20" />
                        ) : categories.has('node') ? (
                          <FileText className="h-8 w-8 text-white/20" />
                        ) : categories.has('video') ? (
                          <Video className="h-8 w-8 text-white/20" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-white/20" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3
                              className="truncate text-sm font-medium text-white/80"
                              title={item.title}
                            >
                              {item.title}
                            </h3>
                            <p className="mt-1 text-[11px] text-white/35">
                              {t('trash.item.nodeCount', '{kind} · {count}个节点', {
                                kind,
                                count: formatNumber(item.nodes.length),
                              })}
                              {files > 0
                                ? t('trash.item.fileCount', ' · {count}个关联文件', {
                                    count: formatNumber(files),
                                  })
                                : ''}
                            </p>
                          </div>
                          <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/35">
                            {workspaceTitle}
                          </span>
                        </div>
                        <p className="mt-3 text-[11px] text-white/30">
                          {t('trash.deletedAt', '删除于 {date}', {
                            date: formatDate(item.deletedAt, {
                              dateStyle: 'medium',
                              timeStyle: 'medium',
                              hour12: false,
                            }),
                          })}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => restoreTrashItem(item.id)}
                            className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.11] hover:text-white disabled:opacity-40"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            {t('trash.restore', '恢复')}
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => {
                              if (confirmId === item.id) void permanentlyDelete(item.id);
                              else setConfirmId(item.id);
                            }}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                              confirmId === item.id
                                ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
                                : 'text-white/35 hover:bg-white/[0.07] hover:text-red-300'
                            }`}
                          >
                            {busyId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {confirmId === item.id
                              ? t('trash.confirmPermanentDelete', '确认永久删除')
                              : t('trash.permanentDelete', '永久删除')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
