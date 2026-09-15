import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from './Modal';
import { selectCanvasImagePickerNodes, useCanvasStore } from '../store/canvasStore';
import { CHARACTER_PRESETS, type CharacterPreset } from '../data/characterPresets';
import {
  resolveUserLibraryThumbnail,
  useUserLibrary,
  type UserLibraryPreset,
} from '../lib/userLibrary';
import { LibraryPresetEditor } from './LibraryPresetEditor';
import { persistImageFile } from '../services/mediaPersistence';
import { useAppTranslation } from '../i18n/appI18n';
import {
  availableCharacterReferenceKinds,
  characterReferenceGroupSize,
  CHARACTER_REFERENCE_KINDS,
  pickCharacterReferenceImages,
  resolveCharacterCoverSource,
  type CharacterReferenceImages,
  type CharacterReferenceKind,
} from '../lib/characterCanvasLayout';
import { LibraryTransferActions } from './LibraryTransferActions';
import {
  CHARACTER_AGE_FILTERS,
  matchesCharacterDemographics,
  type CharacterAgeFilter,
  type CharacterGender,
} from '../lib/characterMetadata';
import { canvasNodeImageOptions } from '../lib/canvasNodeImageOptions';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';

const RECENT_CHARACTERS_KEY = 'qiansi-canvas-character-library-recent-v1';
const CHARACTER_GENDER_SEARCH_LABELS: Record<CharacterGender, string> = {
  male: '男 male',
  female: '女 female',
  other: '其他 other',
};

type CharacterLibraryItem = CharacterPreset & {
  user?: boolean;
  author?: string;
  prompt?: string;
  originalImage?: string;
};

function loadRecentCharacters() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_CHARACTERS_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function persistRecentCharacters(ids: string[]) {
  try {
    localStorage.setItem(RECENT_CHARACTERS_KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {
    // Keep the current session usable when local storage is unavailable.
  }
}

function CharacterImage({
  source,
  alt,
  className,
}: {
  source?: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveUserLibraryThumbnail(source);

  useEffect(() => setFailed(false), [resolved]);

  if (!resolved || failed) {
    return (
      <div className={`flex items-center justify-center bg-[#171719] text-white/18 ${className}`}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  return <img src={resolved} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function CharacterReferenceSelection({
  available,
  selected,
  single = false,
  label,
  unavailableLabel,
  onChange,
}: {
  available: boolean;
  selected: boolean;
  single?: boolean;
  label: string;
  unavailableLabel: string;
  onChange: () => void;
}) {
  if (!available) {
    return (
      <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white/45">
        {unavailableLabel}
      </span>
    );
  }
  return (
    <label className="absolute right-2 top-2 flex cursor-pointer items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-[10px] text-white/80">
      <input
        type={single ? 'radio' : 'checkbox'}
        name={single ? 'character-library-node-image' : undefined}
        checked={selected}
        onChange={onChange}
        aria-label={label}
        className="h-3.5 w-3.5 accent-emerald-500"
      />
      {label}
    </label>
  );
}

export function CharacterLibraryModal() {
  const { t } = useAppTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const openModal = useCanvasStore((s) => s.openModal);
  const closeModal = useCanvasStore((s) => s.closeModal);
  const applyCharacterPreset = useCanvasStore((s) => s.applyCharacterPreset);
  const applyLibraryImageToNode = useCanvasStore((s) => s.applyLibraryImageToNode);
  const modalNodeId = useCanvasStore((s) => s.modalNodeId);
  const libraryImagePickerTargetId = useCanvasStore((s) => s.libraryImagePickerTargetId);
  const setGenParams = useCanvasStore((s) => s.setGenParams);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const nodes = useCanvasStore(selectCanvasImagePickerNodes);

  const [query, setQuery] = useState('');
  const [style, setStyle] = useState('全部');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentCharacters);
  const [showRecent, setShowRecent] = useState(false);
  const [activePresetId, setActivePresetId] = useState('');
  const [showAllCharacters, setShowAllCharacters] = useState(false);
  const [genderFilter, setGenderFilter] = useState<CharacterGender | 'all' | 'unspecified'>('all');
  const [ageFilter, setAgeFilter] = useState<CharacterAgeFilter>('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [editing, setEditing] = useState<UserLibraryPreset | null | false>(false);
  const [selectedReferenceKinds, setSelectedReferenceKinds] = useState<Set<CharacterReferenceKind>>(
    new Set(),
  );
  const carouselRef = useRef<HTMLDivElement>(null);
  const userLibrary = useUserLibrary('character');
  const builtInIds = useMemo(() => new Set(CHARACTER_PRESETS.map((preset) => preset.id)), []);
  const canvasImages = useMemo(() => canvasNodeImageOptions(nodes), [nodes]);
  const allPresets = useMemo<CharacterLibraryItem[]>(() => {
    const overrides = new Set(userLibrary.presets.map((preset) => preset.id));
    return [
      ...userLibrary.presets.map((preset) => {
        const source = CHARACTER_PRESETS.find((item) => item.id === preset.id);
        return {
          ...source,
          ...preset,
          style: preset.category,
          viewCount: preset.viewCount ?? source?.viewCount ?? (3 as const),
          user: true,
        };
      }),
      ...CHARACTER_PRESETS.filter(
        (preset) => !overrides.has(preset.id) && !userLibrary.deletedIds.has(preset.id),
      ).map((preset) => {
        const renamedStyle = userLibrary.renamedCategories.get(preset.style);
        const styleDeleted = !renamedStyle && userLibrary.deletedCategories.has(preset.style);
        if (!renamedStyle && !styleDeleted) return preset;
        const nextStyle = renamedStyle ?? '未分类';
        const tags = preset.tags.map((tag) => (tag === preset.style ? nextStyle : tag));
        return {
          ...preset,
          style: nextStyle,
          tags: styleDeleted && !tags.includes('未分类') ? [...tags, '未分类'] : tags,
        };
      }),
    ];
  }, [
    userLibrary.deletedCategories,
    userLibrary.deletedIds,
    userLibrary.presets,
    userLibrary.renamedCategories,
  ]);

  const styles = useMemo(
    () => [
      '全部',
      ...Array.from(
        new Set([
          ...userLibrary.customCategories,
          '未分类',
          ...allPresets.map((preset) => preset.style),
        ]),
      ),
    ],
    [allPresets, userLibrary.customCategories],
  );

  const nationalities = useMemo(
    () =>
      Array.from(
        new Set(
          allPresets
            .map((preset) => preset.nationality?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [allPresets],
  );

  const filtered = useMemo(() => {
    let list = allPresets;
    if (style !== '全部') list = list.filter((preset) => preset.style === style);
    if (showRecent) {
      const recent = new Set(recentIds);
      list = list
        .filter((preset) => recent.has(preset.id))
        .sort((left, right) => recentIds.indexOf(left.id) - recentIds.indexOf(right.id));
    }
    if (query.trim()) {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      list = list.filter(
        (preset) =>
          preset.title.toLocaleLowerCase().includes(normalizedQuery) ||
          preset.author?.toLocaleLowerCase().includes(normalizedQuery) ||
          preset.style.toLocaleLowerCase().includes(normalizedQuery) ||
          preset.nationality?.toLocaleLowerCase().includes(normalizedQuery) ||
          (preset.age !== undefined && String(preset.age).includes(normalizedQuery)) ||
          (preset.gender &&
            CHARACTER_GENDER_SEARCH_LABELS[preset.gender].includes(normalizedQuery)) ||
          preset.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery)),
      );
    }
    list = list.filter((preset) =>
      matchesCharacterDemographics(preset, {
        gender: genderFilter,
        age: ageFilter,
        nationality: nationalityFilter,
      }),
    );
    return list;
  }, [ageFilter, allPresets, genderFilter, nationalityFilter, query, recentIds, showRecent, style]);

  useEffect(() => {
    if (openModal !== 'character-library') return;
    setActivePresetId((current) =>
      filtered.some((preset) => preset.id === current) ? current : (filtered[0]?.id ?? ''),
    );
  }, [filtered, openModal]);

  const activePreset = filtered.find((preset) => preset.id === activePresetId) ?? filtered[0];
  const availableReferenceKinds = availableCharacterReferenceKinds(
    activePreset?.characterReferences,
  );
  const availableReferenceSignature = availableReferenceKinds.join('|');
  const selectedReferenceImages = pickCharacterReferenceImages(
    activePreset?.characterReferences,
    selectedReferenceKinds,
  );
  const selectedReferenceCount = availableCharacterReferenceKinds(selectedReferenceImages).length;
  const activePresetIsTemplate = Boolean(
    activePreset &&
    builtInIds.has(activePreset.id) &&
    !activePreset.user &&
    availableReferenceKinds.length === 0,
  );
  const isLibraryImagePicker = Boolean(libraryImagePickerTargetId);

  useEffect(() => {
    const available = availableCharacterReferenceKinds(activePreset?.characterReferences);
    setSelectedReferenceKinds(new Set(isLibraryImagePicker ? available.slice(0, 1) : available));
  }, [
    activePreset?.characterReferences,
    activePreset?.id,
    availableReferenceSignature,
    isLibraryImagePicker,
  ]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEditor = (preset: CharacterLibraryItem) => {
    setEditing({
      id: preset.id,
      kind: 'character',
      title: preset.title,
      category: preset.style,
      prompt: preset.prompt ?? preset.title,
      thumbnail: preset.thumbnail,
      originalImage: preset.originalImage,
      characterReferences: preset.characterReferences,
      gender: preset.gender,
      age: preset.age,
      nationality: preset.nationality,
      tags: preset.tags,
      createdAt: Date.now(),
    });
  };

  const rememberRecent = (id: string) => {
    setRecentIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, 20);
      persistRecentCharacters(next);
      return next;
    });
  };

  const toggleReferenceSelection = (kind: CharacterReferenceKind) => {
    if (!activePreset?.characterReferences?.[kind]) return;
    if (isLibraryImagePicker) {
      setSelectedReferenceKinds(new Set([kind]));
      return;
    }
    setSelectedReferenceKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleApply = (preset: CharacterLibraryItem) => {
    const referenceImages =
      preset.id === activePreset?.id
        ? pickCharacterReferenceImages(preset.characterReferences, selectedReferenceKinds)
        : pickCharacterReferenceImages(preset.characterReferences, CHARACTER_REFERENCE_KINDS);
    const referenceCount = availableCharacterReferenceKinds(referenceImages).length;
    if (referenceCount === 0) return;
    rememberRecent(preset.id);
    if (isLibraryImagePicker) {
      const kind = availableCharacterReferenceKinds(referenceImages)[0];
      const image = kind ? referenceImages[kind]?.trim() : undefined;
      if (!kind || !image) return;
      const kindLabel = {
        standing: t('library.character.fullBody', '全身参考'),
        portrait: t('library.character.portrait', '面部特写'),
        expressions: t('library.character.expressionBoard', '表情参考'),
        turnaround: t('library.character.turnaroundBoard', '人物多视图'),
      }[kind];
      applyLibraryImageToNode({
        url: resolveMediaSourceUrl(image),
        title: `${preset.title} ${kindLabel}`,
        aspectRatio: kind === 'turnaround' ? '16:9' : '4:5',
      });
      return;
    }
    setGenParams({ viewCount: preset.viewCount });
    const groupSize = characterReferenceGroupSize(referenceImages);
    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    applyCharacterPreset({
      id: preset.id,
      title: preset.title,
      category: preset.style,
      tags: preset.tags,
      prompt: preset.prompt,
      description: preset.tags.filter((tag) => tag !== preset.style).join('、'),
      referenceImages,
      position: {
        x: viewportCenter.x - groupSize.width / 2,
        y: viewportCenter.y - groupSize.height / 2,
      },
    });
  };

  const scrollCarousel = (direction: -1 | 1) => {
    carouselRef.current?.scrollBy({ left: direction * 520, behavior: 'smooth' });
  };

  const description = activePreset
    ? activePreset.prompt?.trim() ||
      t('library.character.detailDescription', '{name}，{tags}角色设定参考。', {
        name: activePreset.title,
        tags: activePreset.tags.filter((tag) => tag !== activePreset.style).join('、'),
      })
    : '';

  return (
    <Modal
      open={openModal === 'character-library'}
      onClose={closeModal}
      title={`${t('library.character.title', '角色库')}${
        isLibraryImagePicker ? ` · ${t('imageNode.libraryPicker.chooseImage', '选择图片')}` : ''
      }`}
      width="w-[min(96vw,1760px)]"
      maxHeightClass="max-h-[92vh]"
      headerActions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowAllCharacters((current) => !current)}
            aria-pressed={showAllCharacters}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white/85"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {showAllCharacters
              ? t('library.character.returnToDetail', '返回详情')
              : t('library.character.allCharacters', '全部角色')}
          </button>
          <LibraryTransferActions
            kind="character"
            items={allPresets.map((preset) => ({
              id: preset.id,
              title: preset.title,
              data: { ...preset },
            }))}
            categories={styles.filter((item) => item !== '全部')}
            projectId={activeProjectId}
          />
        </div>
      }
    >
      <div
        data-theme-role="library-body"
        className="relative flex h-[min(82vh,735px)] min-h-[480px] flex-col bg-[#1d1d1f]"
      >
        {showAllCharacters && (
          <section
            data-character-all-grid="true"
            data-theme-role="library-content"
            className="absolute inset-0 z-10 flex flex-col bg-[#151517]"
          >
            <div
              data-theme-role="library-filterbar"
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#1d1d20] px-4 py-3"
            >
              <div className="relative w-[min(32vw,360px)] min-w-52">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('library.character.searchAll', '搜索角色、作者、性别、年龄或国籍')}
                  className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/20 pl-8 pr-3 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-white/25"
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  aria-label={t('library.character.styleFilter', '风格分类')}
                  className="h-9 rounded-lg border border-white/[0.09] bg-[#29292c] px-2.5 text-xs text-white/75 outline-none"
                >
                  {styles.map((item) => (
                    <option key={item} value={item}>
                      {item === '全部' ? t('library.character.allStyles', '全部风格') : item}
                    </option>
                  ))}
                </select>
                <select
                  value={genderFilter}
                  onChange={(event) =>
                    setGenderFilter(event.target.value as CharacterGender | 'all' | 'unspecified')
                  }
                  aria-label={t('library.character.gender', '性别')}
                  className="h-9 rounded-lg border border-white/[0.09] bg-[#29292c] px-2.5 text-xs text-white/75 outline-none"
                >
                  <option value="all">{t('library.character.allGenders', '全部性别')}</option>
                  <option value="male">{t('library.character.gender.male', '男')}</option>
                  <option value="female">{t('library.character.gender.female', '女')}</option>
                  <option value="other">{t('library.character.gender.other', '其他')}</option>
                  <option value="unspecified">
                    {t('library.character.unspecified', '未设置')}
                  </option>
                </select>
                <select
                  value={ageFilter}
                  onChange={(event) => setAgeFilter(event.target.value as CharacterAgeFilter)}
                  aria-label={t('library.character.age', '年龄')}
                  className="h-9 rounded-lg border border-white/[0.09] bg-[#29292c] px-2.5 text-xs text-white/75 outline-none"
                >
                  {CHARACTER_AGE_FILTERS.map((filter) => (
                    <option key={filter} value={filter}>
                      {filter === 'all'
                        ? t('library.character.age.all', '全部年龄')
                        : filter === 'child'
                          ? t('library.character.age.child', '儿童 · 0–12岁')
                          : filter === 'teen'
                            ? t('library.character.age.teen', '少年 · 13–17岁')
                            : filter === 'young-adult'
                              ? t('library.character.age.youngAdult', '青年 · 18–35岁')
                              : filter === 'adult'
                                ? t('library.character.age.adult', '中年 · 36–59岁')
                                : filter === 'senior'
                                  ? t('library.character.age.senior', '老年 · 60岁以上')
                                  : t('library.character.unspecified', '未设置')}
                    </option>
                  ))}
                </select>
                <select
                  value={nationalityFilter}
                  onChange={(event) => setNationalityFilter(event.target.value)}
                  aria-label={t('library.character.nationality', '国籍')}
                  className="h-9 max-w-36 rounded-lg border border-white/[0.09] bg-[#29292c] px-2.5 text-xs text-white/75 outline-none"
                >
                  <option value="all">{t('library.character.allNationalities', '全部国籍')}</option>
                  {nationalities.map((nationality) => (
                    <option key={nationality} value={nationality}>
                      {nationality}
                    </option>
                  ))}
                  <option value="unspecified">
                    {t('library.character.unspecified', '未设置')}
                  </option>
                </select>
                <button
                  data-theme-role="primary-action"
                  type="button"
                  onClick={() => setEditing(null)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500/15 px-3 text-xs text-emerald-200 hover:bg-emerald-500/25"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('library.character.addCharacter', '新增角色')}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <div className="grid grid-cols-[repeat(auto-fill,260px)] content-start gap-0.5">
                {filtered.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-theme-role="library-card"
                    onClick={() => {
                      setActivePresetId(preset.id);
                      setShowAllCharacters(false);
                    }}
                    onDoubleClick={() => {
                      if (!isLibraryImagePicker) handleApply(preset);
                    }}
                    className="group relative aspect-[2/3] w-[260px] overflow-hidden bg-[#202024] text-left"
                  >
                    <CharacterImage
                      source={resolveCharacterCoverSource(
                        preset.characterReferences,
                        preset.thumbnail,
                        preset.originalImage,
                      )}
                      alt={preset.title}
                      className="h-full w-full bg-[#ececeb] object-cover object-top transition-transform duration-300 group-hover:scale-[1.025]"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-2.5 pt-12">
                      <p className="truncate text-xs font-medium text-white">{preset.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-white/75">
                        {[
                          preset.nationality,
                          preset.age === undefined
                            ? undefined
                            : t('library.character.ageYears', '{age}岁', { age: preset.age }),
                          preset.gender === 'male'
                            ? t('library.character.gender.male', '男')
                            : preset.gender === 'female'
                              ? t('library.character.gender.female', '女')
                              : preset.gender === 'other'
                                ? t('library.character.gender.other', '其他')
                                : undefined,
                          preset.author,
                        ]
                          .filter(Boolean)
                          .join(' · ') || t('library.character.demographicsUnset', '资料待补充')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="flex h-full min-h-56 items-center justify-center text-xs text-white/35">
                  {t('library.character.empty', '当前筛选下没有角色')}
                </div>
              )}
            </div>
          </section>
        )}
        <div
          className={showAllCharacters ? 'contents invisible' : 'contents'}
          aria-hidden={showAllCharacters}
          inert={showAllCharacters}
        >
          <section className="min-h-0 flex-1 border-b border-white/[0.06] p-3">
            {activePreset ? (
              <div
                data-character-library-detail="true"
                data-theme-role="library-card"
                className="flex h-full min-h-0 flex-col rounded-xl bg-white/[0.055] p-3"
              >
                <div className="mb-3 flex min-h-7 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="shrink-0 text-sm font-semibold text-white/90">
                      {activePreset.title}
                    </h3>
                    {activePreset.author && (
                      <span className="shrink-0 text-[11px] text-white/40">
                        {activePreset.author}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {[
                        activePreset.gender === 'male'
                          ? t('library.character.gender.male', '男')
                          : activePreset.gender === 'female'
                            ? t('library.character.gender.female', '女')
                            : activePreset.gender === 'other'
                              ? t('library.character.gender.other', '其他')
                              : undefined,
                        activePreset.age === undefined
                          ? undefined
                          : t('library.character.ageYears', '{age}岁', { age: activePreset.age }),
                        activePreset.nationality,
                      ]
                        .filter((value): value is string => Boolean(value))
                        .map((value) => (
                          <span
                            key={`demographic-${value}`}
                            className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200/70"
                          >
                            {value}
                          </span>
                        ))}
                      {[activePreset.style, ...activePreset.tags]
                        .filter((tag, index, tags) => tag && tags.indexOf(tag) === index)
                        .slice(0, 5)
                        .map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] text-white/65"
                          >
                            {tag === '未分类' ? t('library.category.uncategorized', '未分类') : tag}
                          </span>
                        ))}
                      {activePresetIsTemplate && (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200/80">
                          {t('library.character.templateBadge', '角色模板 · 需上传资料图')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(activePreset.id)}
                      title={t('common.favorite', '收藏')}
                      aria-pressed={favorites.has(activePreset.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-rose-300"
                    >
                      <Heart
                        className={`h-3.5 w-3.5 ${
                          favorites.has(activePreset.id) ? 'fill-rose-400 text-rose-400' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(activePreset)}
                      title={t('common.edit', '编辑')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white/80"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        userLibrary.remove(activePreset.id, builtInIds.has(activePreset.id));
                        setActivePresetId('');
                      }}
                      title={t('common.delete', '删除')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-x-auto pb-1">
                  <div
                    data-character-library-gallery="true"
                    className="grid h-full min-w-[1080px] grid-cols-[0.92fr_0.92fr_0.92fr_2.18fr] gap-2"
                  >
                    <div
                      data-theme-role="library-preview"
                      className="relative overflow-hidden rounded-lg bg-[#f4f4f2]"
                    >
                      <CharacterImage
                        source={activePreset.characterReferences?.standing}
                        alt={t('library.character.fullBodyAlt', '{name}全身参考', {
                          name: activePreset.title,
                        })}
                        className="h-full w-full bg-[#f4f4f2] object-contain"
                      />
                      <CharacterReferenceSelection
                        available={Boolean(activePreset.characterReferences?.standing)}
                        selected={selectedReferenceKinds.has('standing')}
                        single={isLibraryImagePicker}
                        label={t('library.character.selectReference', '选择{name}', {
                          name: t('library.character.fullBody', '全身参考'),
                        })}
                        unavailableLabel={t('library.character.notUploaded', '未上传')}
                        onChange={() => toggleReferenceSelection('standing')}
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white/75">
                        {t('library.character.fullBody', '全身参考')}
                      </span>
                    </div>
                    <div
                      data-theme-role="library-preview"
                      className="relative overflow-hidden rounded-lg bg-[#f4f4f2]"
                    >
                      <CharacterImage
                        source={activePreset.characterReferences?.portrait}
                        alt={t('library.character.portraitAlt', '{name}面部特写', {
                          name: activePreset.title,
                        })}
                        className="h-full w-full bg-[#f4f4f2] object-cover object-top"
                      />
                      <CharacterReferenceSelection
                        available={Boolean(activePreset.characterReferences?.portrait)}
                        selected={selectedReferenceKinds.has('portrait')}
                        single={isLibraryImagePicker}
                        label={t('library.character.selectReference', '选择{name}', {
                          name: t('library.character.portrait', '面部特写'),
                        })}
                        unavailableLabel={t('library.character.notUploaded', '未上传')}
                        onChange={() => toggleReferenceSelection('portrait')}
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white/75">
                        {t('library.character.portrait', '面部特写')}
                      </span>
                    </div>
                    <div
                      data-theme-role="library-preview"
                      className="relative overflow-hidden rounded-lg"
                    >
                      <CharacterImage
                        source={activePreset.characterReferences?.expressions}
                        alt={t('library.character.expressionBoard', '表情参考')}
                        className="h-full w-full bg-[#f4f4f2] object-contain"
                      />
                      <CharacterReferenceSelection
                        available={Boolean(activePreset.characterReferences?.expressions)}
                        selected={selectedReferenceKinds.has('expressions')}
                        single={isLibraryImagePicker}
                        label={t('library.character.selectReference', '选择{name}', {
                          name: t('library.character.expressionBoard', '表情参考'),
                        })}
                        unavailableLabel={t('library.character.notUploaded', '未上传')}
                        onChange={() => toggleReferenceSelection('expressions')}
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white/75">
                        {t('library.character.expressionBoard', '表情参考')}
                      </span>
                    </div>
                    <div
                      data-theme-role="library-preview"
                      className="relative overflow-hidden rounded-lg"
                    >
                      <CharacterImage
                        source={activePreset.characterReferences?.turnaround}
                        alt={t('library.character.turnaroundBoard', '人物多视图')}
                        className="h-full w-full bg-[#f4f4f2] object-contain"
                      />
                      <CharacterReferenceSelection
                        available={Boolean(activePreset.characterReferences?.turnaround)}
                        selected={selectedReferenceKinds.has('turnaround')}
                        single={isLibraryImagePicker}
                        label={t('library.character.selectReference', '选择{name}', {
                          name: t('library.character.turnaroundBoard', '人物多视图'),
                        })}
                        unavailableLabel={t('library.character.notUploaded', '未上传')}
                        onChange={() => toggleReferenceSelection('turnaround')}
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white/75">
                        {t('library.character.turnaroundBoard', '人物多视图')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-white/40">{description}</p>
                    <p
                      className={`mt-1 text-[11px] ${
                        availableReferenceKinds.length ? 'text-white/45' : 'text-amber-300/75'
                      }`}
                    >
                      {availableReferenceKinds.length
                        ? isLibraryImagePicker
                          ? t(
                              'imageNode.libraryPicker.characterSelectionSummary',
                              '请选择 1 张作为节点图片，当前已选择 {selected} 张。',
                              { selected: selectedReferenceCount },
                            )
                          : t(
                              'library.character.referenceSelectionSummary',
                              '已有 {available}/4 张资料图，当前选择 {selected} 张。',
                              {
                                available: availableReferenceKinds.length,
                                selected: selectedReferenceCount,
                              },
                            )
                        : t(
                            'library.character.noReferenceImages',
                            '暂无真实资料图，请点击编辑上传；封面不会作为资料图使用。',
                          )}
                    </p>
                  </div>
                  <button
                    data-theme-role="primary-action"
                    type="button"
                    onClick={() => handleApply(activePreset)}
                    disabled={selectedReferenceCount === 0}
                    title={
                      selectedReferenceCount === 0
                        ? t(
                            'library.character.selectAtLeastOne',
                            '请至少上传并选择一张真实资料图。',
                          )
                        : undefined
                    }
                    className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-[#252528] transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                  >
                    {isLibraryImagePicker
                      ? t('imageNode.libraryPicker.chooseAsNodeImage', '选择为节点图片')
                      : modalNodeId
                        ? t('library.character.applySelected', '应用 {count} 张参考图', {
                            count: selectedReferenceCount,
                          })
                        : t('library.character.applySelectedToCanvas', '+ 应用 {count} 张到画布', {
                            count: selectedReferenceCount,
                          })}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.025] text-white/30">
                <ImageOff className="mb-2 h-8 w-8" />
                <p className="text-xs">{t('library.character.empty', '当前筛选下没有角色')}</p>
                <button
                  data-theme-role="primary-action"
                  type="button"
                  onClick={() => setEditing(null)}
                  className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25"
                >
                  {t('library.character.addCharacter', '+ 新增角色')}
                </button>
              </div>
            )}
          </section>

          <section className="h-[218px] shrink-0 px-3 py-3">
            <div
              data-theme-role="library-filterbar"
              className="mb-3 flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  aria-label={t('library.character.filter', '角色筛选')}
                  className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 text-xs text-white/75 outline-none focus:border-white/20"
                >
                  {styles.map((item) => (
                    <option key={item} value={item} className="bg-[#1a1a1c] text-white/80">
                      {item === '全部'
                        ? t('library.character.filter', '角色筛选')
                        : item === '未分类'
                          ? t('library.category.uncategorized', '未分类')
                          : item}
                    </option>
                  ))}
                </select>
                <div className="relative w-[min(28vw,300px)] min-w-40">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('library.character.search', '搜索角色、风格、标签')}
                    className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-white/20"
                  />
                </div>
                <button
                  data-theme-role="primary-action"
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs text-white/70 hover:bg-white/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('library.character.addCharacter', '新增角色')}
                </button>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={showRecent}
                  onChange={(event) => setShowRecent(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-emerald-500"
                />
                {t('library.character.recentlyUsed', '最近使用')}
              </label>
            </div>

            <div className="flex h-[148px] items-center gap-2">
              <button
                type="button"
                onClick={() => scrollCarousel(-1)}
                aria-label={t('library.character.scrollPrevious', '向前浏览角色')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/45 hover:bg-white/[0.06] hover:text-white/80"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={carouselRef}
                data-character-library-carousel="true"
                className="flex h-full min-w-0 flex-1 snap-x gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {filtered.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-theme-role="library-card"
                    onClick={() => setActivePresetId(preset.id)}
                    onDoubleClick={() => {
                      if (!isLibraryImagePicker) handleApply(preset);
                    }}
                    className="group relative flex h-full w-[104px] shrink-0 snap-start flex-col text-left"
                  >
                    <div
                      data-theme-role="library-preview"
                      className={`relative min-h-0 flex-1 overflow-hidden rounded-lg border-2 bg-[#121214] transition-colors ${
                        activePreset?.id === preset.id
                          ? 'border-white/90'
                          : 'border-transparent group-hover:border-white/25'
                      }`}
                    >
                      <CharacterImage
                        source={resolveCharacterCoverSource(
                          preset.characterReferences,
                          preset.thumbnail,
                          preset.originalImage,
                        )}
                        alt={preset.title}
                        className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.03]"
                      />
                      {favorites.has(preset.id) && (
                        <Heart className="absolute right-1.5 top-1.5 h-3 w-3 fill-rose-400 text-rose-400" />
                      )}
                      {builtInIds.has(preset.id) &&
                        !preset.user &&
                        availableCharacterReferenceKinds(preset.characterReferences).length ===
                          0 && (
                          <span className="absolute bottom-1.5 left-1.5 rounded bg-amber-950/80 px-1.5 py-0.5 text-[9px] text-amber-200/85">
                            {t('library.character.templateShort', '模板')}
                          </span>
                        )}
                    </div>
                    <span
                      className={`mt-1 truncate px-0.5 text-[11px] ${
                        activePreset?.id === preset.id ? 'text-white/95' : 'text-white/45'
                      }`}
                    >
                      {preset.title}
                    </span>
                    {preset.author && (
                      <span className="truncate px-0.5 text-[11px] text-white/30">
                        {preset.author}
                      </span>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="flex h-full flex-1 items-center justify-center text-xs text-white/30">
                    {showRecent && recentIds.length === 0
                      ? t('library.character.noRecent', '还没有最近使用的角色')
                      : t('library.character.empty', '当前筛选下没有角色')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => scrollCarousel(1)}
                aria-label={t('library.character.scrollNext', '向后浏览角色')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/45 hover:bg-white/[0.06] hover:text-white/80"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      </div>

      <LibraryPresetEditor
        open={editing !== false}
        libraryName={t('library.character.itemName', '角色')}
        categories={styles.filter((item) => item !== '全部')}
        initial={editing || null}
        showPrimaryMediaEditor={false}
        showCharacterReferenceEditor
        canvasImageOptions={canvasImages}
        onClose={() => setEditing(false)}
        onAddCategory={userLibrary.addCategory}
        onRenameCategory={(value, nextValue) => {
          userLibrary.renameCategory(value, nextValue);
          if (style === value) setStyle(nextValue);
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
          if (style === value) setStyle('全部');
          setEditing(
            (current) =>
              current && {
                ...current,
                category: current.category === value ? '未分类' : current.category,
                tags: current.tags.map((tag) => (tag === value ? '未分类' : tag)),
              },
          );
        }}
        onSave={userLibrary.save}
        onPrepareMediaForSave={async ({ value, characterReferenceFiles }) => {
          const referenceEntries = await Promise.all(
            (Object.entries(characterReferenceFiles) as Array<[CharacterReferenceKind, File]>).map(
              async ([kind, file]) => {
                const persisted = await persistImageFile(file, 'character', activeProjectId);
                return [kind, persisted.originalUrl] as const;
              },
            ),
          );
          return {
            characterReferences: {
              ...value.characterReferences,
              ...(Object.fromEntries(referenceEntries) as CharacterReferenceImages),
            },
          };
        }}
      />
    </Modal>
  );
}
