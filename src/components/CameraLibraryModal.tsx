import { useEffect, useMemo, useState } from 'react';
import { Heart, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { LibraryPresetEditor } from './LibraryPresetEditor';
import { useCanvasStore } from '../store/canvasStore';
import { CAMERA_CATEGORIES, CAMERA_PRESETS, type CameraPreset } from '../data/cameraPresets';
import { useUserLibrary, type UserLibraryPreset } from '../lib/userLibrary';
import { useAppTranslation } from '../i18n/appI18n';
import { resolveCameraPromptCues } from '../lib/cameraPrompt';
import { persistImageFile, persistImagePreviewDataUrl } from '../services/mediaPersistence';

type CameraLibraryItem = CameraPreset & { user?: boolean };
const TABS = ['运镜场', '我的收藏', '我的运镜'] as const;
const FAVORITES_KEY = 'kitty-canvas-camera-favorites-v1';

const CAMERA_MOTION_CLASSES: Record<string, string> = {
  'camera-push-in': 'camera-motion-push-in',
  'camera-pull-out': 'camera-motion-pull-out',
  'camera-zoom-in': 'camera-motion-zoom-in',
  'camera-zoom-out': 'camera-motion-zoom-out',
  'camera-dolly-zoom': 'camera-motion-dolly-zoom',
  'camera-orbit': 'camera-motion-orbit',
  'camera-roll': 'camera-motion-roll',
  'camera-pov': 'camera-motion-pov',
  'camera-drone': 'camera-motion-drone',
  'camera-aerial': 'camera-motion-aerial',
  'camera-handheld': 'camera-motion-handheld',
  'camera-pan-horizontal': 'camera-motion-pan-horizontal',
  'camera-crane': 'camera-motion-crane',
  'camera-tracking': 'camera-motion-tracking',
  'camera-fly-through': 'camera-motion-fly-through',
  'camera-expression-close': 'camera-motion-expression-close',
  'camera-emotion-push': 'camera-motion-emotion-push',
  'camera-eye-focus': 'camera-motion-eye-focus',
  'camera-reaction-snap': 'camera-motion-reaction-snap',
  'camera-fight-follow': 'camera-motion-fight-follow',
  'camera-impact-shake': 'camera-motion-impact-shake',
  'camera-whip-chase': 'camera-motion-whip-chase',
  'camera-duel-orbit': 'camera-motion-duel-orbit',
  'camera-dodge-track': 'camera-motion-dodge-track',
  'camera-low-rush': 'camera-motion-low-rush',
};

function cameraMotionClass(preset: CameraLibraryItem): string {
  return CAMERA_MOTION_CLASSES[preset.id] ?? 'camera-motion-push-in';
}

function loadFavorites(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function CameraLibraryModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const applyCameraPreset = useCanvasStore((state) => state.applyCameraPreset);
  const activeProjectId = useCanvasStore((state) => state.activeProjectId);
  const activeCameraData = useCanvasStore(
    (state) => state.nodes.find((node) => node.id === state.modalNodeId)?.data,
  );
  const activeCameraPresetIds = useMemo(() => {
    if (!activeCameraData) return [];
    const legacyId = activeCameraData.composerParams?.cameraPresetId;
    return resolveCameraPromptCues(activeCameraData.cameraPresets, {
      id: legacyId,
      title: activeCameraData.cameraPreset,
      prompt: activeCameraData.cameraPrompt,
    }).map((preset) => preset.id);
  }, [activeCameraData]);
  const userLibrary = useUserLibrary('camera');
  const builtInIds = useMemo(() => new Set(CAMERA_PRESETS.map((preset) => preset.id)), []);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('运镜场');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [editing, setEditing] = useState<UserLibraryPreset | null | false>(false);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch {
      // Keep favorites usable for the current session if storage is unavailable.
    }
  }, [favorites]);

  const allPresets = useMemo<CameraLibraryItem[]>(() => {
    const overrides = new Set(userLibrary.presets.map((preset) => preset.id));
    return [
      ...userLibrary.presets.map((preset) => {
        const source = CAMERA_PRESETS.find((item) => item.id === preset.id);
        return {
          id: preset.id,
          title: preset.title,
          category: preset.category,
          prompt: preset.prompt,
          tags: preset.tags,
          thumbnail: preset.thumbnail ?? source?.thumbnail ?? '',
          user: true,
        };
      }),
      ...CAMERA_PRESETS.filter(
        (preset) => !overrides.has(preset.id) && !userLibrary.deletedIds.has(preset.id),
      ).map((preset) => {
        const renamedCategory = userLibrary.renamedCategories.get(preset.category);
        const categoryDeleted =
          !renamedCategory && userLibrary.deletedCategories.has(preset.category);
        if (!renamedCategory && !categoryDeleted) return preset;
        const nextCategory = renamedCategory ?? '未分类';
        return {
          ...preset,
          category: nextCategory,
          tags: categoryDeleted
            ? ['未分类', preset.title]
            : preset.tags.map((tag) => (tag === preset.category ? nextCategory : tag)),
        };
      }),
    ];
  }, [
    userLibrary.deletedCategories,
    userLibrary.deletedIds,
    userLibrary.presets,
    userLibrary.renamedCategories,
  ]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...CAMERA_CATEGORIES.filter((category) => !userLibrary.deletedCategories.has(category)),
          ...userLibrary.customCategories,
          ...allPresets.map((preset) => preset.category),
          '未分类',
        ]),
      ),
    [allPresets, userLibrary.customCategories, userLibrary.deletedCategories],
  );

  const filtered = useMemo(() => {
    let list = allPresets;
    if (activeTab === '我的收藏') list = list.filter((preset) => favorites.has(preset.id));
    if (activeTab === '我的运镜') list = list.filter((preset) => preset.user);
    const keyword = query.trim().toLowerCase();
    if (keyword) {
      list = list.filter(
        (preset) =>
          preset.title.toLowerCase().includes(keyword) ||
          preset.category.toLowerCase().includes(keyword) ||
          preset.tags.some((tag) => tag.toLowerCase().includes(keyword)),
      );
    }
    return list;
  }, [activeTab, allPresets, favorites, query]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = (preset: CameraLibraryItem) => {
    applyCameraPreset({
      id: preset.id,
      title: preset.title,
      category: preset.category,
      tags: preset.tags,
      prompt: preset.prompt,
    });
  };

  return (
    <Modal
      open={openModal === 'camera-library'}
      onClose={closeModal}
      title={
        <div data-theme-role="segmented-control" className="flex items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              data-theme-role="segmented-item"
              data-active={activeTab === tab ? 'true' : 'false'}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white'
                  : 'text-white/45 hover:bg-white/5 hover:text-white/75'
              }`}
            >
              {tab === '运镜场'
                ? t('library.camera.tab.market', '运镜场')
                : tab === '我的收藏'
                  ? t('library.tab.favorites', '我的收藏')
                  : t('library.camera.tab.mine', '我的运镜')}
            </button>
          ))}
        </div>
      }
      headerActions={
        <>
          <div className="relative mr-2 w-[336px] max-w-[36vw]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('library.camera.search', '搜索运镜名称')}
              aria-label={t('library.camera.search', '搜索运镜名称')}
              className="h-8 w-full rounded-lg border border-transparent bg-white/[0.09] px-3 pr-9 text-[13px] font-normal text-white/85 outline-none placeholder:text-white/35 transition-colors focus:border-white/15 focus:bg-white/[0.11]"
            />
          </div>
          <button
            data-theme-role="primary-action"
            type="button"
            onClick={() => setEditing(null)}
            className="mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-normal text-white/60 hover:bg-white/[0.08] hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('library.camera.add', '新增运镜')}
          </button>
        </>
      }
      width="w-[800px] max-w-[calc(100vw-32px)]"
    >
      <div
        data-camera-library
        className="flex h-[544px] max-h-[calc(100vh-112px)] flex-col bg-[#1a1a1c]"
      >
        <div className="camera-library-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {filtered.length ? (
            <div data-camera-grid className="grid grid-cols-2 gap-x-5 gap-y-3.5 md:grid-cols-4">
              {filtered.map((preset) => {
                const selected = activeCameraPresetIds.includes(preset.id);
                return (
                  <div
                    key={preset.id}
                    data-camera-card={preset.id}
                    data-theme-role="library-card"
                    className="group relative min-w-0"
                  >
                    <button
                      type="button"
                      data-theme-role="library-preview"
                      onClick={() => handleApply(preset)}
                      aria-pressed={selected}
                      className={`block aspect-square w-full overflow-hidden rounded-[5px] bg-[#111315] text-left transition-[box-shadow,transform] duration-150 ${
                        selected
                          ? 'shadow-[0_0_0_2px_rgba(125,211,252,0.82)]'
                          : 'shadow-[0_0_0_1px_rgba(255,255,255,0.04)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.24)]'
                      }`}
                      title={t('library.applyNamed', '应用{name}', { name: preset.title })}
                    >
                      <div className="camera-preview-frame h-full w-full overflow-hidden">
                        {preset.thumbnail ? (
                          <img
                            src={preset.thumbnail}
                            alt={preset.title}
                            loading="lazy"
                            className={`camera-preview-media h-full w-full object-cover ${cameraMotionClass(preset)}`}
                          />
                        ) : (
                          <div
                            className={`camera-preview-media h-full w-full bg-gradient-to-br from-slate-700 to-slate-950 ${cameraMotionClass(preset)}`}
                          />
                        )}
                      </div>
                    </button>
                    <p className="mt-1 truncate text-center text-[12px] font-medium leading-4 text-white/90">
                      {preset.title}
                    </p>
                    <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(preset.id)}
                        className="rounded-md bg-black/65 p-1.5 text-white/75 backdrop-blur hover:text-rose-300"
                        title={t('common.favorite', '收藏')}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${favorites.has(preset.id) ? 'fill-rose-400 text-rose-400' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            id: preset.id,
                            kind: 'camera',
                            title: preset.title,
                            category: preset.category,
                            prompt: preset.prompt,
                            thumbnail: preset.thumbnail,
                            tags: preset.tags,
                            createdAt: Date.now(),
                          })
                        }
                        className="rounded-md bg-black/65 p-1.5 text-white/75 backdrop-blur hover:text-white"
                        title={t('common.edit', '编辑')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => userLibrary.remove(preset.id, builtInIds.has(preset.id))}
                        className="rounded-md bg-black/65 p-1.5 text-white/75 backdrop-blur hover:text-rose-300"
                        title={t('common.delete', '删除')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-white/35">
              <p className="text-sm">{t('library.camera.empty', '这里还没有运镜预设')}</p>
              <button
                data-theme-role="primary-action"
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65 hover:bg-white/10"
              >
                {t('library.camera.addOne', '新增一个运镜')}
              </button>
            </div>
          )}
        </div>
      </div>

      <LibraryPresetEditor
        open={editing !== false}
        libraryName={t('library.camera.itemName', '运镜')}
        categories={categories}
        initial={editing || null}
        onClose={() => setEditing(false)}
        onAddCategory={userLibrary.addCategory}
        onRenameCategory={(value, nextValue) => {
          userLibrary.renameCategory(value, nextValue);
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
          const original = mediaFile
            ? await persistImageFile(mediaFile, 'storyboard', activeProjectId)
            : null;
          const preview =
            !mediaFile && /^(?:data:|blob:)/iu.test(value.thumbnail?.trim() ?? '')
              ? await persistImagePreviewDataUrl(value.thumbnail ?? '')
              : null;
          return {
            thumbnail: preview?.previewUrl ?? original?.previewUrl ?? value.thumbnail,
            thumbnailAssetId:
              preview?.previewAssetId ?? original?.previewAssetId ?? value.thumbnailAssetId,
            originalImage: original?.originalUrl ?? value.originalImage,
            bridgeAssetId: original?.bridgeAssetId ?? value.bridgeAssetId,
          };
        }}
        onSave={userLibrary.save}
      />
    </Modal>
  );
}
