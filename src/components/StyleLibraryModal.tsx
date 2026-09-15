import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Check,
  Heart,
  Plus,
  Pencil,
  Trash2,
  Palette,
  Sparkles,
  History,
  ArrowDownUp,
  Maximize2,
  X,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { Modal } from './Modal';
import { selectCanvasImagePickerNodes, useCanvasStore } from '../store/canvasStore';
import {
  STYLE_PRESETS,
  STYLE_CATEGORIES,
  STYLE_MODELS,
  type StylePreset,
} from '../data/stylePresets';
import {
  loadUserLibraryPresets,
  saveUserLibraryPreset,
  useUserLibrary,
  resolveUserLibraryThumbnail,
  type LibraryThumbnailCrop,
  type UserLibraryPreset,
} from '../lib/userLibrary';
import { LibraryPresetEditor } from './LibraryPresetEditor';
import { useAppTranslation } from '../i18n/appI18n';
import { persistImageFile, persistImagePreviewDataUrl } from '../services/mediaPersistence';
import { NODE_H, NODE_W } from '../canvas/constants';
import { PORTRAIT_LIBRARY_THUMBNAIL } from '../lib/libraryThumbnail';
import {
  DEFAULT_STYLE_PROMPT_GUIDE,
  loadStylePromptGuide,
  saveStylePromptGuide,
} from '../lib/styleLibraryPreferences';
import { LibraryTransferActions } from './LibraryTransferActions';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';
import { canvasNodeImageOptions } from '../lib/canvasNodeImageOptions';

type StyleLibraryItem = StylePreset & {
  user?: boolean;
  prompt?: string;
  originalImage?: string;
  thumbnailCrop?: LibraryThumbnailCrop;
};

const TABS = ['风格广场', '我的收藏', '最近使用'] as const;
const TAB_ICONS = {
  风格广场: Sparkles,
  我的收藏: Heart,
  最近使用: History,
} as const;

const SORT_OPTIONS = [
  { id: 'recommended', labelKey: 'library.style.sort.recommended', fallback: '推荐排序' },
  { id: 'recent', labelKey: 'library.style.sort.recent', fallback: '时间排序' },
  { id: 'title', labelKey: 'library.style.sort.title', fallback: '名称排序' },
] as const;

type StyleSort = (typeof SORT_OPTIONS)[number]['id'];

export function StyleLibraryModal() {
  const { t } = useAppTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const openModal = useCanvasStore((s) => s.openModal);
  const closeModal = useCanvasStore((s) => s.closeModal);
  const applyStylePreset = useCanvasStore((s) => s.applyStylePreset);
  const applyLibraryImageToNode = useCanvasStore((s) => s.applyLibraryImageToNode);
  const modalNodeId = useCanvasStore((s) => s.modalNodeId);
  const libraryImagePickerTargetId = useCanvasStore((s) => s.libraryImagePickerTargetId);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const nodes = useCanvasStore(selectCanvasImagePickerNodes);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('风格广场');
  const [category, setCategory] = useState('推荐');
  const [model, setModel] = useState('全部');
  const [query, setQuery] = useState('');
  const [commercialOnly, setCommercialOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<UserLibraryPreset | null | false>(false);
  const [sort, setSort] = useState<StyleSort>('recommended');
  const [sortOpen, setSortOpen] = useState(false);
  const [stylePromptGuide, setStylePromptGuide] = useState(loadStylePromptGuide);
  const [previewing, setPreviewing] = useState<{ title: string; url: string } | null>(null);
  const styleCategoryLabels = useMemo<Readonly<Record<string, string>>>(
    () => ({
      推荐: t('library.category.recommended', '推荐'),
      摄影写真: t('library.style.category.photography', '摄影写真'),
      电商营销: t('library.style.category.ecommerce', '电商营销'),
      动漫游戏: t('library.style.category.animeGames', '动漫游戏'),
      风格插画: t('library.style.category.illustration', '风格插画'),
      平面设计: t('library.style.category.graphicDesign', '平面设计'),
      建筑及室内设计: t('library.style.category.architecture', '建筑及室内设计'),
      创意玩法: t('library.style.category.creative', '创意玩法'),
      文创周边: t('library.style.category.merchandise', '文创周边'),
      小众推文: t('library.style.category.socialPosts', '小众推文'),
    }),
    [t],
  );
  const localizedStylePromptGuide =
    stylePromptGuide === DEFAULT_STYLE_PROMPT_GUIDE
      ? t('library.style.promptGuide', DEFAULT_STYLE_PROMPT_GUIDE)
      : stylePromptGuide;
  const userLibrary = useUserLibrary('style');
  const canvasImages = useMemo(() => canvasNodeImageOptions(nodes), [nodes]);
  const builtInIds = useMemo(() => new Set(STYLE_PRESETS.map((preset) => preset.id)), []);
  const allPresets = useMemo<StyleLibraryItem[]>(() => {
    const overrides = new Set(userLibrary.presets.map((preset) => preset.id));
    return [
      ...userLibrary.presets.map((preset) => {
        const source = STYLE_PRESETS.find((item) => item.id === preset.id);
        const hasRealUserContent = Boolean(
          preset.prompt.trim() ||
          (preset.originalImage && preset.originalImage !== source?.thumbnail) ||
          (preset.thumbnail && preset.thumbnail !== source?.thumbnail),
        );
        return {
          ...source,
          ...preset,
          author: preset.author ?? '我的预设',
          uses: preset.uses ?? source?.uses ?? 0,
          commercial: preset.commercial ?? source?.commercial ?? false,
          kind: preset.styleMediaKind ?? source?.kind ?? ('image' as const),
          thumbnail:
            source?.template === true
              ? preset.thumbnail === source.thumbnail
                ? undefined
                : preset.thumbnail
              : (preset.thumbnail ?? source?.thumbnail),
          originalImage:
            source?.template === true && preset.originalImage === source.thumbnail
              ? undefined
              : preset.originalImage,
          template: source?.template === true && !hasRealUserContent,
          user: true,
        };
      }),
      ...STYLE_PRESETS.filter(
        (preset) => !overrides.has(preset.id) && !userLibrary.deletedIds.has(preset.id),
      ).map((preset) => {
        const renamedCategory = userLibrary.renamedCategories.get(preset.category);
        const renamedModel = preset.model ? userLibrary.renamedModels.get(preset.model) : undefined;
        const categoryDeleted =
          !renamedCategory && userLibrary.deletedCategories.has(preset.category);
        const modelDeleted =
          !renamedModel && Boolean(preset.model && userLibrary.deletedModels.has(preset.model));
        if (!renamedCategory && !renamedModel && !categoryDeleted && !modelDeleted) return preset;
        return {
          ...preset,
          category: renamedCategory ?? (categoryDeleted ? '未分类' : preset.category),
          model: renamedModel ?? (modelDeleted ? '未分类' : preset.model),
          tags: preset.tags.map((tag) => {
            if (renamedCategory && tag === preset.category) return renamedCategory;
            if (renamedModel && tag === preset.model) return renamedModel;
            if (categoryDeleted && tag === preset.category) return '未分类';
            if (modelDeleted && tag === preset.model) return '未分类';
            return tag;
          }),
        };
      }),
    ];
  }, [
    userLibrary.deletedCategories,
    userLibrary.deletedIds,
    userLibrary.deletedModels,
    userLibrary.presets,
    userLibrary.renamedCategories,
    userLibrary.renamedModels,
  ]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...STYLE_CATEGORIES.filter((item) => !userLibrary.deletedCategories.has(item)),
          ...userLibrary.customCategories,
          '未分类',
          ...allPresets.map((preset) => preset.category),
        ]),
      ),
    [allPresets, userLibrary.customCategories, userLibrary.deletedCategories],
  );
  const models = useMemo(
    () =>
      Array.from(
        new Set([
          '全部',
          ...STYLE_MODELS.filter((item) => item !== '全部' && !userLibrary.deletedModels.has(item)),
          ...userLibrary.customModels,
          '未分类',
          ...allPresets.map((preset) => preset.model ?? '未分类'),
        ]),
      ),
    [allPresets, userLibrary.customModels, userLibrary.deletedModels],
  );

  const filtered = useMemo(() => {
    let list = allPresets;
    if (activeTab === '我的收藏') {
      list = list.filter((p) => favorites.has(p.id));
    }
    if (category !== '推荐' && category !== '全部') {
      list = list.filter((p) => p.category === category || p.tags.includes(category));
    }
    if (model !== '全部') {
      list = list.filter((p) => (p.model ?? '未分类') === model);
    }
    if (commercialOnly) {
      list = list.filter((p) => p.commercial);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
      );
    }
    return [...list].sort((left, right) => {
      if (sort === 'recent') {
        const leftCreatedAt =
          left.user && 'createdAt' in left && typeof left.createdAt === 'number'
            ? left.createdAt
            : 0;
        const rightCreatedAt =
          right.user && 'createdAt' in right && typeof right.createdAt === 'number'
            ? right.createdAt
            : 0;
        return rightCreatedAt - leftCreatedAt;
      }
      if (sort === 'title') return left.title.localeCompare(right.title, 'zh-Hans-CN');
      return 0;
    });
  }, [activeTab, allPresets, category, model, commercialOnly, query, favorites, sort]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!previewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewing(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewing]);

  const handleEdit = (preset: StyleLibraryItem) => {
    const editingTemplate = preset.template === true;
    setEditing({
      id: preset.id,
      kind: 'style',
      title: preset.title,
      category: preset.category,
      model: preset.model,
      prompt: editingTemplate ? '' : (preset.prompt ?? preset.title),
      thumbnail: editingTemplate ? undefined : preset.thumbnail,
      originalImage: editingTemplate ? undefined : preset.originalImage,
      thumbnailCrop: preset.thumbnailCrop,
      commercial: preset.commercial,
      tags: preset.tags,
      createdAt: Date.now(),
    });
  };

  const handleApply = (preset: StyleLibraryItem) => {
    if (preset.template) return;
    const thumbnail = resolveUserLibraryThumbnail(preset.thumbnail);
    const image = resolveUserLibraryThumbnail(preset.originalImage ?? preset.thumbnail);
    if (libraryImagePickerTargetId) {
      if (!image) return;
      applyLibraryImageToNode({
        url: image,
        previewUrl: thumbnail,
        title: preset.title,
      });
      return;
    }
    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    applyStylePreset({
      id: preset.id,
      title: preset.title,
      category: preset.category,
      tags: preset.tags,
      kind: preset.kind,
      prompt: preset.prompt,
      description: preset.tags.filter((tag) => tag !== preset.category).join('、'),
      thumbnail,
      image,
      position: { x: viewportCenter.x - NODE_W / 2, y: viewportCenter.y - NODE_H / 2 },
    });
  };

  return (
    <Modal
      open={openModal === 'style-library'}
      onClose={closeModal}
      title={
        <div className="flex items-center gap-3">
          <span
            data-theme-role="title-icon"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
          >
            <Palette className="h-4 w-4" />
          </span>
          <span>
            {t('library.style.title', '风格库')}
            {libraryImagePickerTargetId
              ? ` · ${t('imageNode.libraryPicker.chooseImage', '选择图片')}`
              : ''}
          </span>
          <div
            data-theme-role="segmented-control"
            className="flex items-center rounded-lg bg-white/5 p-0.5"
          >
            {TABS.map((tab) => {
              const TabIcon = TAB_ICONS[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  data-theme-role="segmented-item"
                  data-active={activeTab === tab ? 'true' : 'false'}
                  aria-pressed={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors ${
                    activeTab === tab
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <TabIcon className="h-3 w-3" />
                  {tab === '风格广场'
                    ? t('library.tab.market', '风格广场')
                    : tab === '我的收藏'
                      ? t('library.tab.favorites', '我的收藏')
                      : t('library.tab.recent', '最近使用')}
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
            kind="style"
            items={allPresets.map((preset) => ({
              id: preset.id,
              title: preset.title,
              data: { ...preset },
            }))}
            categories={categories.filter((item) => item !== '推荐' && item !== '全部')}
            modelCategories={models.filter((item) => item !== '全部')}
            projectId={activeProjectId}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((current) => !current)}
              aria-label={t('library.style.sort', '排序')}
              title={t('library.style.sort', '排序')}
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
              <div className="absolute right-0 top-full z-20 mt-2 w-36 rounded-xl border border-white/10 bg-[#242428] p-1 shadow-2xl">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSort(option.id);
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      sort === option.id
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t(option.labelKey, option.fallback)}
                    {sort === option.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div className="flex h-[min(750px,calc(100dvh-2rem))] flex-col">
        {/* Search + filters */}
        <div
          data-theme-role="library-filterbar"
          className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.style.search', '搜索风格名称、作者')}
              className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/5 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/5 px-2.5 text-xs text-white/70 hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('common.add', '新增')}
            </button>
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                commercialOnly
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/[0.06] bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              <input
                type="checkbox"
                checked={commercialOnly}
                onChange={(event) => setCommercialOnly(event.target.checked)}
                aria-label={t('library.commercialOnly', '仅看可商用')}
                className="h-3.5 w-3.5 rounded border-white/25 bg-transparent accent-emerald-400"
              />
              {t('library.commercialOnly', '仅看可商用')}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 rounded-lg border border-white/[0.06] bg-white/5 px-2 text-xs text-white/80 outline-none"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-[#1a1a1c] text-white/80">
                  {m === '全部'
                    ? t('common.all', '全部')
                    : m === '未分类'
                      ? t('library.category.uncategorized', '未分类')
                      : m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav
          data-theme-role="library-categories"
          aria-label={t('library.style.categoryNav', '风格分类')}
          className="shrink-0 overflow-x-auto border-b border-white/[0.06] px-5 py-2"
        >
          <div className="flex min-w-max items-center gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                data-theme-role="library-category"
                data-active={category === c ? 'true' : 'false'}
                onClick={() => setCategory(c)}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  category === c
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {c === '全部'
                  ? t('common.all', '全部')
                  : c === '未分类'
                    ? t('library.category.uncategorized', '未分类')
                    : (styleCategoryLabels[c] ?? c)}
              </button>
            ))}
          </div>
        </nav>

        {/* Material grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {filtered.map((preset) => (
              <div
                key={preset.id}
                data-theme-role="library-card"
                className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#1e1e21] transition-all hover:border-white/15"
              >
                <div
                  data-theme-role="library-preview"
                  className="group/preview relative overflow-hidden bg-[#131315]"
                  style={{ aspectRatio: PORTRAIT_LIBRARY_THUMBNAIL.aspectRatio }}
                >
                  <button
                    type="button"
                    onClick={() => handleEdit(preset)}
                    aria-label={`${t('common.edit', '编辑')} ${preset.title}`}
                    title={t('common.edit', '编辑')}
                    className="absolute inset-0 block h-full w-full cursor-pointer overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-300/70"
                  >
                    {preset.thumbnail ? (
                      <img
                        src={resolveUserLibraryThumbnail(preset.thumbnail)}
                        alt={preset.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <span className="block h-full w-full bg-gradient-to-br from-white/5 to-transparent" />
                    )}
                  </button>
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100 group-focus-within/preview:opacity-100">
                    <button
                      type="button"
                      data-theme-role="primary-action"
                      data-style-card-action="apply"
                      disabled={preset.template}
                      onClick={() => handleApply(preset)}
                      title={
                        preset.template
                          ? t(
                              'library.templateApplyHint',
                              '这是结构模板。请先编辑并上传真实图片、填写提示词后再应用。',
                            )
                          : undefined
                      }
                      className="pointer-events-none inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-300/20 bg-black/65 px-3 text-[11px] font-medium text-emerald-200 shadow-lg backdrop-blur-md transition-all group-hover/preview:pointer-events-auto group-focus-within/preview:pointer-events-auto hover:border-emerald-300/35 hover:bg-emerald-500/25 hover:text-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-300/70 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-black/55 disabled:text-white/35"
                    >
                      {preset.template ? (
                        <Pencil className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      {preset.template
                        ? t('library.completeTemplateFirst', '先完善模板')
                        : libraryImagePickerTargetId
                          ? t('imageNode.libraryPicker.chooseImage', '选择图片')
                          : modalNodeId
                            ? t('common.apply', '应用')
                            : t('library.addToCanvas', '添加到画布')}
                    </button>
                  </div>
                  {preset.template ? (
                    <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md border border-amber-300/20 bg-black/70 px-2 py-1 text-[11px] leading-none text-amber-200/85 shadow-sm backdrop-blur-sm">
                      {t('library.templateNeedsContent', '内置模板 · 需完善')}
                    </span>
                  ) : (
                    <div className="pointer-events-none absolute bottom-2 right-2 z-10 opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100 group-focus-within/preview:opacity-100">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          userLibrary.remove(preset.id, builtInIds.has(preset.id));
                        }}
                        data-style-card-action="delete"
                        aria-label={t('common.delete', '删除')}
                        title={t('common.delete', '删除')}
                        className="pointer-events-none flex h-6 w-6 items-center justify-center rounded-md bg-black/65 text-white/70 shadow-sm backdrop-blur-sm transition-colors group-hover/preview:pointer-events-auto group-focus-within/preview:pointer-events-auto hover:bg-black/80 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-emerald-300/70"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(preset.id)}
                      className="rounded-full bg-black/55 p-1.5 text-white/70 hover:text-rose-300"
                      title={t('common.favorite', '收藏')}
                    >
                      <Heart
                        className={`h-3 w-3 ${favorites.has(preset.id) ? 'fill-rose-400 text-rose-400' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(preset)}
                      className="rounded-full bg-black/55 p-1.5 text-white/70 hover:text-white"
                      title={t('common.edit', '编辑')}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {(preset.originalImage || preset.thumbnail) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const source = preset.originalImage ?? preset.thumbnail;
                          if (!source) return;
                          setPreviewing({
                            title: preset.title,
                            url: resolveMediaSourceUrl(source),
                          });
                        }}
                        data-style-card-action="preview"
                        aria-label={t('library.previewFullImage', '预览全图')}
                        title={t('library.previewFullImage', '预览全图')}
                        className="rounded-full bg-black/55 p-1.5 text-white/70 hover:text-white"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-2.5">
                  <p className="truncate text-xs font-medium text-white/90">{preset.title}</p>
                  <div className="mt-0.5 flex min-w-0 items-center justify-between gap-1">
                    <p className="truncate text-[11px] text-white/40">
                      {preset.author === '我的预设'
                        ? t('library.myPreset', '我的预设')
                        : preset.author === '内置模板'
                          ? t('library.builtInTemplateAuthor', '内置模板')
                          : preset.author}
                    </p>
                    {preset.user && (
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[11px] leading-none ${
                          preset.commercial
                            ? 'bg-white/8 text-white/35'
                            : 'bg-rose-500/18 text-rose-300'
                        }`}
                      >
                        {preset.commercial
                          ? t('library.commercial', '可商用')
                          : t('library.nonCommercial', '不可商用')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center text-xs text-white/30">
              {t('library.style.empty', '未找到匹配的风格预设')}
            </div>
          )}
        </div>
      </div>
      <LibraryPresetEditor
        open={editing !== false}
        libraryName={t('library.style.itemName', '风格')}
        categories={categories.filter((item) => item !== '全部')}
        categoryLabels={styleCategoryLabels}
        modelCategories={models.filter((item) => item !== '全部')}
        initial={editing || null}
        showCommercialOption
        cropThumbnail
        showFullImagePreview
        splitImagePreview
        showPrimaryCanvasImagePicker
        canvasImageOptions={canvasImages}
        promptPlaceholder={t('library.style.promptPlaceholder', '输入可复用的提示词')}
        promptAccent
        defaultCommercial
        promptHintBelowCommercial={localizedStylePromptGuide}
        onPromptHintBelowCommercialChange={(value) =>
          setStylePromptGuide(saveStylePromptGuide(value))
        }
        onClose={() => setEditing(false)}
        onAddCategory={userLibrary.addCategory}
        onRenameCategory={(value, nextValue) => {
          userLibrary.renameCategory(value, nextValue);
          if (category === value) setCategory(nextValue);
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
          if (category === value) setCategory(categories.find((item) => item !== value) ?? '全部');
          setEditing(
            (current) =>
              current && {
                ...current,
                category: current.category === value ? '未分类' : current.category,
                tags: current.tags.map((tag) => (tag === value ? '未分类' : tag)),
              },
          );
        }}
        onAddModelCategory={userLibrary.addModelCategory}
        onRenameModelCategory={(value, nextValue) => {
          userLibrary.renameModelCategory(value, nextValue);
          if (model === value) setModel(nextValue);
          setEditing(
            (current) =>
              current && {
                ...current,
                model: current.model === value ? nextValue : current.model,
                tags: current.tags.map((tag) => (tag === value ? nextValue : tag)),
              },
          );
        }}
        onDeleteModelCategory={(value) => {
          userLibrary.deleteModelCategory(value);
          if (model === value) setModel('全部');
          setEditing(
            (current) =>
              current && {
                ...current,
                model: current.model === value ? '未分类' : current.model,
                tags: current.tags.map((tag) => (tag === value ? '未分类' : tag)),
              },
          );
        }}
        onSave={(value) =>
          userLibrary.save({
            ...value,
            tags: [...new Set([value.category, ...(value.model ? [value.model] : [])])],
          })
        }
        onPrepareMediaForSave={async ({ value, mediaFile }) => {
          const [original, croppedPreview] = await Promise.all([
            mediaFile
              ? persistImageFile(mediaFile, 'prop', activeProjectId)
              : Promise.resolve(null),
            /^(?:data:|blob:)/iu.test(value.thumbnail?.trim() ?? '')
              ? persistImagePreviewDataUrl(value.thumbnail ?? '')
              : Promise.resolve(null),
          ]);
          return {
            thumbnail: croppedPreview?.previewUrl ?? original?.previewUrl ?? value.thumbnail,
            thumbnailAssetId:
              croppedPreview?.previewAssetId ?? original?.previewAssetId ?? value.thumbnailAssetId,
            originalImage: original?.originalUrl ?? value.originalImage,
            bridgeAssetId: original?.bridgeAssetId ?? value.bridgeAssetId,
          };
        }}
        onApplyThumbnailCrop={async (id, value) => {
          const existing = loadUserLibraryPresets('style').find((preset) => preset.id === id);
          const basePreset = existing ?? (editing && editing.id === id ? editing : undefined);
          if (!basePreset) return;
          const persistedThumbnail = await persistImagePreviewDataUrl(value.thumbnail);
          setEditing((current) =>
            current && current.id === id
              ? {
                  ...current,
                  thumbnail: persistedThumbnail.previewUrl,
                  thumbnailAssetId: persistedThumbnail.previewAssetId,
                  thumbnailCrop: value.thumbnailCrop,
                }
              : current,
          );
          saveUserLibraryPreset('style', {
            ...basePreset,
            thumbnail: persistedThumbnail.previewUrl,
            thumbnailAssetId: persistedThumbnail.previewAssetId,
            thumbnailCrop: value.thumbnailCrop,
          });
          return {
            thumbnail: persistedThumbnail.previewUrl,
            thumbnailAssetId: persistedThumbnail.previewAssetId,
          };
        }}
      />
      {previewing && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={previewing.title}
          onClick={() => setPreviewing(null)}
        >
          <img
            src={previewing.url}
            alt={previewing.title}
            className="h-full w-full rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            aria-label={t('common.close', '关闭')}
            title={t('common.close', '关闭')}
            onClick={() => setPreviewing(null)}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/75 hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </Modal>
  );
}
