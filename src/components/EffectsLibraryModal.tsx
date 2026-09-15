import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ArrowDownUp,
  BadgeCheck,
  Check,
  Clock3,
  Heart,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { Modal } from './Modal';
import { EffectWebpPreview } from './EffectVideoPreview';
import { useCanvasStore } from '../store/canvasStore';
import { EFFECT_PRESETS, EFFECT_MODELS } from '../data/effectPresets';
import {
  resolveUserLibraryThumbnail,
  useUserLibrary,
  type UserLibraryPreset,
} from '../lib/userLibrary';
import { LibraryPresetEditor } from './LibraryPresetEditor';
import { useAppTranslation } from '../i18n/appI18n';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';
import { persistImageFile } from '../services/mediaPersistence';
import { sortEffectLibraryItems, type EffectLibrarySort } from '../lib/effectLibrarySort';
import { LibraryTransferActions } from './LibraryTransferActions';
import { inspectAnimatedWebp } from '../lib/effectWebp';

type EffectLibraryTab = 'plaza' | 'favorites' | 'recent';

const EFFECT_SORT_OPTIONS: EffectLibrarySort[] = ['recommended', 'recent', 'uses', 'name'];

type EffectLibraryItem = {
  id: string;
  title: string;
  author: string;
  uses: number;
  tags: string[];
  model: string;
  thumbnail?: string;
  prompt?: string;
  commercial?: boolean;
  user?: boolean;
  createdAt?: number;
  originalImage?: string;
  /** Legacy video fields remain readable so existing presets can be converted in the editor. */
  videoUrl?: string;
  previewUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  bridgeAssetId?: string;
};

const EFFECT_FAVORITES_STORAGE_KEY = 'kitty-canvas-effect-favorites-v1';
const EFFECT_RECENTS_STORAGE_KEY = 'kitty-canvas-effect-recents-v1';
const EFFECT_USE_COUNTS_STORAGE_KEY = 'kitty-canvas-effect-use-counts-v1';

function readStoredIds(key: string) {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, values: readonly string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Session state remains usable when persistent storage is unavailable.
  }
}

function readUseCounts() {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(EFFECT_USE_COUNTS_STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, count]) => typeof count === 'number' && Number.isFinite(count) && count >= 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function writeUseCounts(values: Record<string, number>) {
  try {
    localStorage.setItem(EFFECT_USE_COUNTS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Session state remains usable when persistent storage is unavailable.
  }
}

function EffectCardMedia({ preset }: { preset: EffectLibraryItem }) {
  return (
    <div className="h-full w-full">
      <EffectWebpPreview
        src={preset.originalImage ? resolveMediaSourceUrl(preset.originalImage) : undefined}
        fallback={resolveUserLibraryThumbnail(preset.previewUrl ?? preset.thumbnail)}
        title={preset.title}
      />
    </div>
  );
}

export function EffectsLibraryModal() {
  const { language, t } = useAppTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const applyEffectPreset = useCanvasStore((state) => state.applyEffectPreset);
  const modalNodeId = useCanvasStore((state) => state.modalNodeId);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);

  const [activeTab, setActiveTab] = useState<EffectLibraryTab>('plaza');
  const [model, setModel] = useState('全部');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(readStoredIds(EFFECT_FAVORITES_STORAGE_KEY)),
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readStoredIds(EFFECT_RECENTS_STORAGE_KEY),
  );
  const [useCounts, setUseCounts] = useState<Record<string, number>>(readUseCounts);
  const [editing, setEditing] = useState<UserLibraryPreset | null | false>(false);
  const [sort, setSort] = useState<EffectLibrarySort>('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<string>();
  const [applyError, setApplyError] = useState<string>();
  const userLibrary = useUserLibrary('effect');
  const builtInIds = useMemo(() => new Set(EFFECT_PRESETS.map((preset) => preset.id)), []);

  useEffect(() => {
    if (openModal !== 'effects-library') {
      setSortOpen(false);
      setApplyError(undefined);
    }
  }, [openModal]);

  const allPresets = useMemo<EffectLibraryItem[]>(() => {
    const overrides = new Set(userLibrary.presets.map((preset) => preset.id));
    return [
      ...userLibrary.presets.map((preset) => {
        const source = EFFECT_PRESETS.find((item) => item.id === preset.id);
        return {
          ...source,
          ...preset,
          author: preset.author ?? source?.author ?? '我的特效',
          uses: preset.uses ?? source?.uses ?? 0,
          model: preset.category,
          thumbnail: preset.previewUrl ?? preset.thumbnail ?? source?.thumbnail,
          commercial: preset.commercial ?? true,
          user: true,
        };
      }),
      ...EFFECT_PRESETS.filter(
        (preset) => !overrides.has(preset.id) && !userLibrary.deletedIds.has(preset.id),
      ).map((preset) => {
        const renamedModel = userLibrary.renamedCategories.get(preset.model);
        const modelDeleted = !renamedModel && userLibrary.deletedCategories.has(preset.model);
        const nextModel = renamedModel ?? (modelDeleted ? '未分类' : preset.model);
        return {
          ...preset,
          model: nextModel,
          tags: preset.tags.map((tag) => (tag === preset.model ? nextModel : tag)),
          commercial: true,
        };
      }),
    ];
  }, [
    userLibrary.deletedCategories,
    userLibrary.deletedIds,
    userLibrary.presets,
    userLibrary.renamedCategories,
  ]);

  const models = useMemo(
    () =>
      Array.from(
        new Set([
          ...EFFECT_MODELS.filter((item) => !userLibrary.deletedCategories.has(item)),
          ...userLibrary.customCategories,
          '未分类',
          ...allPresets.map((preset) => preset.model),
        ]),
      ),
    [allPresets, userLibrary.customCategories, userLibrary.deletedCategories],
  );

  const filtered = useMemo(() => {
    let list = allPresets;
    if (activeTab === 'favorites') list = list.filter((preset) => favorites.has(preset.id));
    if (activeTab === 'recent') {
      const recent = new Set(recentIds);
      list = list
        .filter((preset) => recent.has(preset.id))
        .sort((left, right) => recentIds.indexOf(left.id) - recentIds.indexOf(right.id));
    }
    if (model !== '全部') list = list.filter((preset) => preset.model === model);
    if (query.trim()) {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      list = list.filter(
        (preset) =>
          preset.title.toLocaleLowerCase().includes(normalizedQuery) ||
          preset.author.toLocaleLowerCase().includes(normalizedQuery) ||
          preset.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery)),
      );
    }
    return sortEffectLibraryItems(list, sort, useCounts, language);
  }, [activeTab, allPresets, favorites, language, model, query, recentIds, sort, useCounts]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStoredIds(EFFECT_FAVORITES_STORAGE_KEY, [...next]);
      return next;
    });
  };

  const rememberUse = (preset: EffectLibraryItem) => {
    setRecentIds((current) => {
      const next = [preset.id, ...current.filter((id) => id !== preset.id)].slice(0, 50);
      writeStoredIds(EFFECT_RECENTS_STORAGE_KEY, next);
      return next;
    });
    setUseCounts((current) => {
      const next = { ...current, [preset.id]: (current[preset.id] ?? preset.uses) + 1 };
      writeUseCounts(next);
      return next;
    });
  };

  const openEditor = (preset: EffectLibraryItem) => {
    setEditing({
      id: preset.id,
      kind: 'effect',
      title: preset.title,
      category: preset.model,
      prompt: preset.prompt ?? preset.title,
      thumbnail: resolveUserLibraryThumbnail(
        preset.originalImage ?? preset.previewUrl ?? preset.thumbnail,
      ),
      originalImage: preset.originalImage,
      videoUrl: preset.videoUrl,
      previewUrl: preset.previewUrl,
      mediaWidth: preset.mediaWidth,
      mediaHeight: preset.mediaHeight,
      bridgeAssetId: preset.bridgeAssetId,
      commercial: preset.commercial,
      tags: preset.tags,
      createdAt: preset.createdAt ?? Date.now(),
    });
  };

  const handleApply = async (preset: EffectLibraryItem) => {
    if (applyingId) return;
    setApplyingId(preset.id);
    setApplyError(undefined);
    try {
      const imageUrl = preset.originalImage?.trim();
      if (!imageUrl) {
        throw new Error(
          preset.videoUrl
            ? '这是旧版视频特效，请先编辑并重新上传动态 WebP。'
            : '该特效还没有动态 WebP，请先编辑并上传。',
        );
      }

      const viewportCenter = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      applyEffectPreset({
        id: preset.id,
        title: preset.title,
        category: preset.model,
        tags: preset.tags,
        prompt: preset.prompt,
        description: preset.tags.filter((tag) => tag !== preset.model).join('、'),
        imageUrl: resolveMediaSourceUrl(imageUrl),
        previewUrl: preset.previewUrl ? resolveMediaSourceUrl(preset.previewUrl) : undefined,
        mediaWidth: preset.mediaWidth,
        mediaHeight: preset.mediaHeight,
        bridgeAssetId: preset.bridgeAssetId,
        position: modalNodeId
          ? undefined
          : { x: viewportCenter.x - 130, y: viewportCenter.y - 130 },
      });
      rememberUse(preset);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '动态 WebP 特效无法添加到画布。');
    } finally {
      setApplyingId(undefined);
    }
  };

  const tabs: Array<{
    id: EffectLibraryTab;
    label: string;
    icon: typeof Sparkles;
  }> = [
    { id: 'plaza', label: t('library.effects.plaza', '特效广场'), icon: Sparkles },
    { id: 'favorites', label: t('library.effects.favorites', '我的收藏'), icon: Heart },
    { id: 'recent', label: t('library.effects.recent', '最近使用'), icon: Clock3 },
  ];

  return (
    <Modal
      open={openModal === 'effects-library'}
      onClose={closeModal}
      title={
        <div className="flex items-center gap-4">
          <span>{t('library.effects.title', '特效库')}</span>
          <div
            data-theme-role="segmented-control"
            className="flex items-center rounded-lg bg-white/5 p-0.5"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-theme-role="segmented-item"
                  data-active={activeTab === tab.id ? 'true' : 'false'}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/45 hover:text-white/75'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      }
      width="w-[min(1600px,calc(100vw-2rem))]"
      maxHeightClass="max-h-[calc(100dvh-2rem)]"
      headerActions={
        <div className="flex items-center gap-1">
          <LibraryTransferActions
            kind="effect"
            items={allPresets.map((preset) => ({
              id: preset.id,
              title: preset.title,
              data: {
                ...preset,
                uses: useCounts[preset.id] ?? preset.uses,
              },
            }))}
            categories={models.filter((item) => item !== '全部')}
            projectId={activeProjectId}
          />
          <div className="relative">
            <button
              data-effects-sort-trigger="true"
              type="button"
              onClick={() => setSortOpen((current) => !current)}
              aria-label={t('library.effects.sort', '排序')}
              title={t('library.effects.sort', '排序')}
              aria-expanded={sortOpen}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                sortOpen || sort !== 'recommended'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:bg-white/10 hover:text-white'
              }`}
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
            {sortOpen && (
              <div
                data-theme-role="popover-surface"
                className="absolute right-0 top-full z-20 mt-2 w-36 rounded-xl border border-white/10 bg-[#242428] p-1 shadow-2xl"
              >
                {EFFECT_SORT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setSort(option);
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      sort === option
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t(
                      `library.effects.sort.${option}`,
                      option === 'recommended'
                        ? '推荐排序'
                        : option === 'recent'
                          ? '最新新增'
                          : option === 'uses'
                            ? '使用次数最多'
                            : '名称排序',
                    )}
                    {sort === option && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div className="flex h-[min(750px,calc(100dvh-110px))] flex-col">
        <div
          data-theme-role="library-filterbar"
          className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3"
        >
          <div className="relative w-full max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('library.effects.searchAuthor', '搜索特效名称、作者')}
              className="h-9 w-full rounded-lg border border-white/[0.06] bg-white/5 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            />
          </div>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            aria-label={t('library.effects.filter', '筛选特效分类')}
            className="h-9 rounded-lg border border-white/[0.06] bg-white/5 px-3 text-xs text-white/80 outline-none"
          >
            {models.map((item) => (
              <option key={item} value={item} className="bg-[#1a1a1c] text-white/80">
                {item === '全部'
                  ? t('common.all', '全部')
                  : item === '未分类'
                    ? t('library.category.uncategorized', '未分类')
                    : item}
              </option>
            ))}
          </select>
          <button
            data-theme-role="primary-action"
            type="button"
            onClick={() => setEditing(null)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('library.effects.upload', '上传特效')}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/80">
                {activeTab === 'plaza'
                  ? t('library.effects.recommended', '推荐')
                  : tabs.find((tab) => tab.id === activeTab)?.label}
              </span>
              <span className="text-[11px] text-white/35">
                {t('library.effects.resultCount', '{count} 个 WebP 特效', {
                  count: filtered.length,
                })}
              </span>
            </div>
            {applyError && <span className="text-xs text-rose-300">{applyError}</span>}
          </div>

          {filtered.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {filtered.map((preset) => {
                const hasWebp = Boolean(preset.originalImage);
                const applying = applyingId === preset.id;
                return (
                  <article key={preset.id} data-theme-role="library-card" className="group min-w-0">
                    <div
                      data-theme-role="library-preview"
                      className={`relative aspect-[4/3] overflow-hidden rounded-lg border bg-[#111113] transition-colors ${
                        hasWebp
                          ? 'cursor-pointer border-white/[0.07] hover:border-white/20'
                          : 'cursor-pointer border-white/[0.05] hover:border-amber-300/20'
                      }`}
                      onClick={() => {
                        if (hasWebp) void handleApply(preset);
                        else openEditor(preset);
                      }}
                    >
                      <EffectCardMedia preset={preset} />
                      <div className="absolute left-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditor(preset);
                          }}
                          className="rounded-md bg-black/65 p-1.5 text-white/70 hover:text-white"
                          title={t('common.edit', '编辑')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            userLibrary.remove(preset.id, builtInIds.has(preset.id));
                          }}
                          className="rounded-md bg-black/65 p-1.5 text-white/70 hover:text-rose-300"
                          title={t('common.delete', '删除')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(preset.id);
                        }}
                        className="absolute right-2 top-2 z-10 rounded-md bg-black/65 p-1.5 text-white/70 hover:text-rose-300"
                        aria-label={t('common.favorite', '收藏')}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${
                            favorites.has(preset.id) ? 'fill-rose-400 text-rose-400' : ''
                          }`}
                        />
                      </button>
                      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/75">
                        WEBP
                      </span>
                      {!hasWebp && (
                        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-amber-200/80">
                          {preset.videoUrl
                            ? t('library.effects.legacyVideo', '旧视频，需转换')
                            : t('library.effects.webpRequired', '需上传动态 WebP')}
                        </span>
                      )}
                      {applying && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
                          <LoaderCircle className="h-6 w-6 animate-spin text-emerald-300" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-xs font-medium text-white/90">
                          {preset.title}
                        </p>
                        {preset.commercial && (
                          <span className="flex shrink-0 items-center gap-0.5 text-[9px] text-white/40">
                            <BadgeCheck className="h-3 w-3" />
                            {t('library.effects.commercial', '商用')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/35">
                        <span className="truncate">{preset.author}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          {useCounts[preset.id] ?? preset.uses}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <ImageIcon className="h-9 w-9 text-white/20" />
              <p className="mt-3 text-sm text-white/55">
                {activeTab === 'favorites'
                  ? t('library.effects.noFavorites', '还没有收藏的 WebP 特效')
                  : activeTab === 'recent'
                    ? t('library.effects.noRecent', '还没有使用过 WebP 特效')
                    : t('library.effects.noResults', '没有找到匹配的 WebP 特效')}
              </p>
            </div>
          )}
        </div>
      </div>

      <LibraryPresetEditor
        open={editing !== false}
        libraryName={t('library.effects.itemName', '特效')}
        categories={models.filter((item) => item !== '全部')}
        initial={editing || null}
        mediaType="image"
        mediaAccept="image/webp,.webp"
        mediaRequired
        imageUploadLabel={t('library.effects.uploadAnimatedWebp', '上传动态 WebP')}
        showImageUploadBadge={false}
        validateMediaFile={async (file) => {
          await inspectAnimatedWebp(file);
        }}
        showCommercialOption
        defaultCommercial
        onClose={() => setEditing(false)}
        onAddCategory={userLibrary.addCategory}
        onRenameCategory={(value, nextValue) => {
          userLibrary.renameCategory(value, nextValue);
          if (model === value) setModel(nextValue);
          setEditing(
            (current) =>
              current && {
                ...current,
                category: current.category === value ? nextValue : current.category,
                tags: current.tags.map((tag) => (tag === value ? nextValue : tag)),
              },
          );
        }}
        onDeleteCategory={(value) => {
          userLibrary.deleteCategory(value);
          if (model === value) setModel('全部');
          setEditing(
            (current) =>
              current && {
                ...current,
                category: current.category === value ? '未分类' : current.category,
                tags: current.tags.map((tag) => (tag === value ? '未分类' : tag)),
              },
          );
        }}
        onPrepareMediaForSave={async ({ value, mediaFile }) => {
          const id = value.id ?? `user-effect-${Date.now().toString(36)}`;
          const existing = value.id
            ? userLibrary.presets.find((preset) => preset.id === value.id)
            : undefined;
          if (mediaFile) {
            await inspectAnimatedWebp(mediaFile);
            const persisted = await persistImageFile(mediaFile, 'storyboard', activeProjectId);
            return {
              id,
              // Use the original animated file in the card; generated previews are static.
              thumbnail: persisted.originalUrl,
              thumbnailAssetId: persisted.previewAssetId,
              originalImage: persisted.originalUrl,
              previewUrl: persisted.previewUrl,
              mediaWidth: persisted.width,
              mediaHeight: persisted.height,
              bridgeAssetId: persisted.bridgeAssetId,
            };
          }
          return {
            id,
            originalImage: existing?.originalImage,
            thumbnail: existing?.originalImage ?? value.thumbnail,
            thumbnailAssetId: existing?.thumbnailAssetId,
          };
        }}
        onSave={userLibrary.save}
      />
    </Modal>
  );
}
