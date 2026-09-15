import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ArrowDownUp,
  Crop,
  Film,
  FolderCog,
  ImagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  resolveUserLibraryThumbnail,
  type LibraryThumbnailCrop,
  type UserLibraryPreset,
} from '../lib/userLibrary';
import { useAppTranslation } from '../i18n/appI18n';
import { PORTRAIT_CROP_VIEWPORT, PORTRAIT_LIBRARY_THUMBNAIL } from '../lib/libraryThumbnail';
import type {
  CharacterReferenceImages,
  CharacterReferenceKind,
} from '../lib/characterCanvasLayout';
import { blobToDataUrl, createVideoPosterBlob } from '../lib/mediaPreview';
import { CHARACTER_NATIONALITIES, type CharacterGender } from '../lib/characterMetadata';
import {
  canvasImageOptionToFile,
  sortCanvasNodeImageOptions,
  type CanvasNodeImageOption,
  type CanvasNodeImageSortOrder,
} from '../lib/canvasNodeImageOptions';

export type CharacterReferenceFiles = Partial<Record<CharacterReferenceKind, File>>;

const CHARACTER_REFERENCE_FIELDS: Array<{
  kind: CharacterReferenceKind;
  labelKey: string;
  labelFallback: string;
  hintKey: string;
  hintFallback: string;
  wide?: boolean;
}> = [
  {
    kind: 'standing',
    labelKey: 'library.character.referenceStanding',
    labelFallback: '角色立绘',
    hintKey: 'library.character.referenceStandingHint',
    hintFallback: '上传完整站姿或全身立绘',
  },
  {
    kind: 'portrait',
    labelKey: 'library.character.referencePortrait',
    labelFallback: '脸部近景',
    hintKey: 'library.character.referencePortraitHint',
    hintFallback: '上传清晰正脸近景',
  },
  {
    kind: 'expressions',
    labelKey: 'library.character.referenceExpressions',
    labelFallback: '表情参考',
    hintKey: 'library.character.referenceExpressionsHint',
    hintFallback: '上传真实表情合集',
  },
  {
    kind: 'turnaround',
    labelKey: 'library.character.referenceTurnaround',
    labelFallback: '三视图',
    hintKey: 'library.character.referenceTurnaroundHint',
    hintFallback: '上传正面、侧面和背面资料图',
    wide: true,
  },
];

function readPreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const original = String(reader.result);
      const image = new Image();
      image.onerror = () => resolve(original);
      image.onload = () => {
        const limit = 1024;
        const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return resolve(original);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.86));
      };
      image.src = original;
    };
    reader.readAsDataURL(file);
  });
}

function cropPreview(source: string, zoom: number, offsetX: number, offsetY: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith('data:') && !source.startsWith('blob:')) image.crossOrigin = 'anonymous';
    image.onerror = () => reject(new Error('Unable to decode image'));
    image.onload = () => {
      const { width: outputWidth, height: outputHeight } = PORTRAIT_LIBRARY_THUMBNAIL;
      const { width: viewportWidth, height: viewportHeight } = PORTRAIT_CROP_VIEWPORT;
      const scale =
        Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight) * zoom;
      const cropWidth = viewportWidth / scale;
      const cropHeight = viewportHeight / scale;
      const centerX = image.naturalWidth / 2 - offsetX / scale;
      const centerY = image.naturalHeight / 2 - offsetY / scale;
      const sx = Math.max(0, Math.min(image.naturalWidth - cropWidth, centerX - cropWidth / 2));
      const sy = Math.max(0, Math.min(image.naturalHeight - cropHeight, centerY - cropHeight / 2));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Unable to create canvas'));
      context.drawImage(image, sx, sy, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      resolve(canvas.toDataURL('image/webp', 0.86));
    };
    image.src = source;
  });
}

async function readVideoPreview(
  file: File,
): Promise<{ url: string; thumbnail?: string; durationSeconds?: number }> {
  const url = URL.createObjectURL(file);
  try {
    const poster = await createVideoPosterBlob(file);
    return {
      url,
      thumbnail: await blobToDataUrl(poster.blob),
      durationSeconds:
        typeof poster.durationSeconds === 'number' && Number.isFinite(poster.durationSeconds)
          ? Math.max(1, Math.round(poster.durationSeconds))
          : undefined,
    };
  } catch {
    return { url };
  }
}

export function CanvasImagePickerDialog({
  options,
  onClose,
  onSelect,
}: {
  options: CanvasNodeImageOption[];
  onClose: () => void;
  onSelect: (option: CanvasNodeImageOption) => void;
}) {
  const { t } = useAppTranslation();
  const [sortOrder, setSortOrder] = useState<CanvasNodeImageSortOrder>('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortedOptions = useMemo(
    () => sortCanvasNodeImageOptions(options, sortOrder),
    [options, sortOrder],
  );
  return (
    <div
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={t('library.editor.canvasPickerTitle', '从当前画布选择图片')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (sortMenuOpen) setSortMenuOpen(false);
        else onClose();
      }}
    >
      <div
        data-theme-role="modal-surface"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#1d1d20] p-4 shadow-2xl"
      >
        <div data-theme-role="modal-titlebar" className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium text-white/90">
            {t('library.editor.canvasPickerTitle', '从当前画布选择图片')}
          </h4>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                data-canvas-image-sort="true"
                onClick={() => setSortMenuOpen((current) => !current)}
                className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                title={t('library.editor.canvasSort', '节点图片排序')}
                aria-label={t('library.editor.canvasSort', '节点图片排序')}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
              {sortMenuOpen && (
                <div
                  role="menu"
                  data-theme-role="popover-surface"
                  className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-white/10 bg-[#262629] p-1 shadow-xl"
                >
                  {(
                    [
                      {
                        id: 'newest',
                        label: t('library.editor.canvasSortNewest', '最新节点优先'),
                      },
                      {
                        id: 'oldest',
                        label: t('library.editor.canvasSortOldest', '最早节点优先'),
                      },
                    ] as Array<{ id: CanvasNodeImageSortOrder; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortOrder === item.id}
                      onClick={() => {
                        setSortOrder(item.id);
                        setSortMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white/65 hover:bg-white/10 hover:text-white"
                    >
                      <Check
                        className={`h-3.5 w-3.5 ${sortOrder === item.id ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
              aria-label={t('common.close', '关闭')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {options.length ? (
          <div
            data-theme-role="modal-content"
            className="grid min-h-0 auto-rows-max grid-cols-1 items-start gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
          >
            {sortedOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                data-theme-role="library-card"
                onClick={() => onSelect(option)}
                className="group self-start overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left hover:border-emerald-400/40"
              >
                <img
                  src={option.url}
                  alt={option.title}
                  data-theme-role="library-preview"
                  className="block h-auto w-full bg-black/30 object-contain"
                />
                <span className="block truncate px-2 py-1.5 text-[11px] text-white/65 group-hover:text-white/90">
                  {option.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-white/35">
            {t('library.editor.canvasPickerEmpty', '当前画布还没有可用图片')}
          </div>
        )}
      </div>
    </div>
  );
}

interface CategoryManagerPanelProps {
  open: boolean;
  label: string;
  hint?: string;
  categories: string[];
  categoryLabels?: Readonly<Record<string, string>>;
  fallbackCategory?: string;
  selected: string;
  onSelect: (value: string) => void;
  onAdd: (value: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (value: string) => void;
}

export function CategoryManagerPanel({
  open,
  label,
  hint,
  categories,
  categoryLabels,
  fallbackCategory = '未分类',
  selected,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: CategoryManagerPanelProps) {
  const { t } = useAppTranslation();
  const [mode, setMode] = useState<{ type: 'add' | 'rename'; source?: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setMode(null);
    setDraft('');
    setPendingDelete(null);
  }, [open]);

  if (!open) return null;
  const categoryLabel = (value: string) => categoryLabels?.[value] ?? value;
  const normalizedDraft = draft.trim();
  const duplicate = categories.some(
    (item) =>
      item !== mode?.source &&
      categoryLabel(item).toLocaleLowerCase() === normalizedDraft.toLocaleLowerCase(),
  );
  const invalidDraft = !normalizedDraft || normalizedDraft === '未分类' || duplicate;
  const commitDraft = () => {
    if (!mode || invalidDraft) return;
    if (mode.type === 'add') onAdd(normalizedDraft);
    else if (mode.source) onRename(mode.source, normalizedDraft);
    onSelect(normalizedDraft);
    setMode(null);
    setDraft('');
  };

  return (
    <section
      className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2.5"
      aria-label={t('library.editor.manageNamedCategories', '管理{label}', { label })}
    >
      <div className="flex items-start justify-between gap-3 px-1 pb-2">
        <div>
          <div className="text-xs font-medium text-white/80">
            {t('library.editor.manageNamedCategories', '管理{label}', { label })}
          </div>
          <div className="mt-0.5 text-[10px] text-white/35">
            {hint ?? t('library.editor.categoryManagerHint', '新增、重命名或删除分类')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMode({ type: 'add' });
            setDraft('');
            setPendingDelete(null);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-[10px] text-emerald-200 hover:bg-emerald-500/25"
        >
          <Plus className="h-3 w-3" />
          {t('common.add', '新增')}
        </button>
      </div>
      {mode?.type === 'add' && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitDraft();
              if (event.key === 'Escape') setMode(null);
            }}
            placeholder={t('library.editor.newCategoryPlaceholder', '输入新分类名称')}
            className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
          />
          <button
            type="button"
            disabled={invalidDraft}
            onClick={commitDraft}
            className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-25"
            aria-label={t('common.save', '保存')}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/70"
            aria-label={t('common.cancel', '取消')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {mode && duplicate && (
        <p className="mb-2 px-1 text-[10px] text-rose-300">
          {t('library.editor.categoryNameExists', '分类名称已存在')}
        </p>
      )}
      <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
        {categories.map((item) => {
          const protectedCategory = item === fallbackCategory;
          const renaming = mode?.type === 'rename' && mode.source === item;
          const deleting = pendingDelete === item;
          return (
            <div
              key={item}
              className={`rounded-lg border px-2 py-1.5 ${
                selected === item
                  ? 'border-emerald-400/20 bg-emerald-500/[0.08]'
                  : 'border-transparent bg-white/[0.025]'
              }`}
            >
              {renaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitDraft();
                      if (event.key === 'Escape') setMode(null);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white outline-none focus:border-emerald-400/40"
                  />
                  <button
                    type="button"
                    disabled={invalidDraft}
                    onClick={commitDraft}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-25"
                    aria-label={t('common.save', '保存')}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/70"
                    aria-label={t('common.cancel', '取消')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : deleting ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[10px] leading-4 text-rose-100/75">
                    {t(
                      'library.editor.deleteNamedCategoryConfirm',
                      '删除“{name}”？内容会移到“未分类”。',
                      {
                        name: item,
                      },
                    )}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="rounded px-1.5 py-1 text-[10px] text-white/45 hover:bg-white/10"
                    >
                      {t('common.cancel', '取消')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(item);
                        if (selected === item) {
                          onSelect(
                            categories.includes(fallbackCategory)
                              ? fallbackCategory
                              : (categories.find((category) => category !== item) ?? ''),
                          );
                        }
                        setPendingDelete(null);
                      }}
                      className="rounded bg-rose-500/20 px-1.5 py-1 text-[10px] text-rose-200 hover:bg-rose-500/30"
                    >
                      {t('common.delete', '删除')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-6 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="min-w-0 flex-1 truncate text-left text-xs text-white/70 hover:text-white"
                  >
                    {protectedCategory
                      ? t('library.category.uncategorized', '未分类')
                      : categoryLabel(item)}
                  </button>
                  {!protectedCategory && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode({ type: 'rename', source: item });
                          setDraft(categoryLabel(item));
                          setPendingDelete(null);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-white/35 hover:bg-white/10 hover:text-white/75"
                        title={t('common.edit', '编辑')}
                        aria-label={t('library.editor.renameNamedCategory', '重命名{name}', {
                          name: item,
                        })}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDelete(item);
                          setMode(null);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-white/35 hover:bg-rose-500/15 hover:text-rose-300"
                        title={t('common.delete', '删除')}
                        aria-label={t('library.editor.deleteNamedCategory', '删除{name}', {
                          name: item,
                        })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export interface LibraryPresetSaveValue {
  id?: string;
  title: string;
  category: string;
  prompt: string;
  model?: string;
  thumbnail?: string;
  thumbnailAssetId?: string;
  originalImage?: string;
  videoUrl?: string;
  previewUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  bridgeAssetId?: string;
  thumbnailCrop?: LibraryThumbnailCrop;
  characterReferences?: UserLibraryPreset['characterReferences'];
  gender?: CharacterGender;
  age?: number;
  nationality?: string;
  durationSeconds?: number;
  commercial?: boolean;
  tags: string[];
}

interface Props {
  open: boolean;
  libraryName: string;
  categories: string[];
  /** Presentation-only labels for built-in categories; saved values remain unchanged. */
  categoryLabels?: Readonly<Record<string, string>>;
  initial?: UserLibraryPreset | null;
  mediaType?: 'image' | 'video';
  /** Narrow the native picker for libraries with a strict media contract. */
  mediaAccept?: string;
  /** Validate the selected source before it becomes visible or saveable. */
  validateMediaFile?: (file: File) => void | Promise<void>;
  /** Require a source for both new presets and legacy presets missing that source. */
  mediaRequired?: boolean;
  showCommercialOption?: boolean;
  cropThumbnail?: boolean;
  /** Show the uncropped source image immediately before the prompt editor. */
  showFullImagePreview?: boolean;
  imageUploadLabel?: string;
  /** Keep the upload instruction centered without repeating it as a corner badge. */
  showImageUploadBadge?: boolean;
  fullImageLabel?: string;
  /** Render the thumbnail and original image side by side in the upload surface. */
  splitImagePreview?: boolean;
  /** Hide the generic primary-media upload surface for libraries whose cover is derived. */
  showPrimaryMediaEditor?: boolean;
  /** Show four independent, real character-reference image slots. */
  showCharacterReferenceEditor?: boolean;
  /** Full-resolution images owned by nodes in the current canvas. */
  canvasImageOptions?: CanvasNodeImageOption[];
  /** Allow the primary image upload surface to choose from current canvas nodes. */
  showPrimaryCanvasImagePicker?: boolean;
  /** Optional copy that clarifies what the saved prompt controls in this library. */
  promptLabel?: string;
  promptHint?: string;
  promptHintBelowCommercial?: string;
  onPromptHintBelowCommercialChange?: (value: string) => void;
  promptPlaceholder?: string;
  promptAccent?: boolean;
  defaultCommercial?: boolean;
  /** Optional independent AI model classification, used by Style Library. */
  modelCategories?: string[];
  onAddModelCategory?: (model: string) => void;
  onRenameModelCategory?: (from: string, to: string) => void;
  onDeleteModelCategory?: (model: string) => void;
  initialMediaUrl?: string;
  onClose: () => void;
  onAddCategory?: (category: string) => void;
  onRenameCategory?: (from: string, to: string) => void;
  onDeleteCategory: (category: string) => void;
  onSaveMedia?: (id: string, file: File) => void | Promise<void>;
  /** Persist selected media before the preset is written, returning stable URLs for the draft. */
  onPrepareMediaForSave?: (input: {
    value: LibraryPresetSaveValue;
    mediaFile?: File;
    characterReferenceFiles: CharacterReferenceFiles;
  }) => Promise<Partial<LibraryPresetSaveValue>>;
  /** Persist an already confirmed crop immediately, without saving unrelated editor fields. */
  onApplyThumbnailCrop?: (
    id: string,
    value: { thumbnail: string; thumbnailCrop: LibraryThumbnailCrop },
  ) =>
    | void
    | Partial<Pick<LibraryPresetSaveValue, 'thumbnail' | 'thumbnailAssetId'>>
    | Promise<void | Partial<Pick<LibraryPresetSaveValue, 'thumbnail' | 'thumbnailAssetId'>>>;
  onSave: (value: LibraryPresetSaveValue) => string | void;
}

export function LibraryPresetEditor({
  open,
  libraryName,
  categories,
  categoryLabels,
  initial,
  mediaType = 'image',
  mediaAccept,
  validateMediaFile,
  mediaRequired = false,
  showCommercialOption = false,
  cropThumbnail = false,
  showFullImagePreview = false,
  imageUploadLabel,
  showImageUploadBadge = true,
  fullImageLabel,
  splitImagePreview = false,
  showPrimaryMediaEditor = true,
  showCharacterReferenceEditor = false,
  canvasImageOptions = [],
  showPrimaryCanvasImagePicker = false,
  promptLabel,
  promptHint,
  promptHintBelowCommercial,
  onPromptHintBelowCommercialChange,
  promptPlaceholder,
  promptAccent = false,
  defaultCommercial = false,
  modelCategories,
  onAddModelCategory,
  onRenameModelCategory,
  onDeleteModelCategory,
  initialMediaUrl,
  onClose,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onSaveMedia,
  onPrepareMediaForSave,
  onApplyThumbnailCrop,
  onSave,
}: Props) {
  const { t } = useAppTranslation();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0] ?? '未分类');
  const [model, setModel] = useState(modelCategories?.[0] ?? '未分类');
  const [prompt, setPrompt] = useState('');
  const [thumbnail, setThumbnail] = useState<string | undefined>();
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | undefined>();
  const [originalImage, setOriginalImage] = useState<string | undefined>();
  const [fullImagePreview, setFullImagePreview] = useState<string | undefined>();
  const [characterReferences, setCharacterReferences] = useState<CharacterReferenceImages>({});
  const [characterGender, setCharacterGender] = useState<CharacterGender | ''>('');
  const [characterAge, setCharacterAge] = useState<number | ''>('');
  const [characterNationality, setCharacterNationality] = useState('');
  const [customCharacterNationality, setCustomCharacterNationality] = useState(false);
  const [characterReferenceFiles, setCharacterReferenceFiles] = useState<CharacterReferenceFiles>(
    {},
  );
  const [canvasReferencePickerKind, setCanvasReferencePickerKind] =
    useState<CharacterReferenceKind | null>(null);
  const [primaryCanvasImagePickerOpen, setPrimaryCanvasImagePickerOpen] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [newModelCategory, setNewModelCategory] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [pendingDeleteModelCategory, setPendingDeleteModelCategory] = useState<string | null>(null);
  const [categoryManager, setCategoryManager] = useState<'category' | 'model' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | undefined>();
  const [mediaFile, setMediaFile] = useState<File | undefined>();
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>();
  const [commercial, setCommercial] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [thumbnailCrop, setThumbnailCrop] = useState<LibraryThumbnailCrop | undefined>();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingPromptHint, setEditingPromptHint] = useState(false);
  const [promptHintDraft, setPromptHintDraft] = useState(promptHintBelowCommercial ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const characterReferenceFileRef = useRef<HTMLInputElement>(null);
  const pendingCharacterReferenceKindRef = useRef<CharacterReferenceKind>('standing');
  const ownedVideoUrl = useRef<string | null>(null);
  const editorSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      editorSessionRef.current = null;
      return;
    }
    const sessionId = initial?.id ?? '__new__';
    if (editorSessionRef.current === sessionId) return;
    editorSessionRef.current = sessionId;
    setTitle(initial?.title ?? '');
    setCategory(initial?.category ?? categories[0] ?? '未分类');
    setModel(initial?.model ?? modelCategories?.[0] ?? '未分类');
    setNewCategory(Boolean(initial?.category && !categories.includes(initial.category)));
    setNewModelCategory(Boolean(initial?.model && !modelCategories?.includes(initial.model)));
    setPendingDeleteCategory(null);
    setPendingDeleteModelCategory(null);
    setCategoryManager(null);
    setPrompt(initial?.prompt ?? '');
    setThumbnail(initial?.thumbnail);
    setThumbnailAssetId(initial?.thumbnailAssetId);
    setOriginalImage(initial?.originalImage);
    setThumbnailCrop(initial?.thumbnailCrop);
    setFullImagePreview(initial?.originalImage);
    setCharacterReferences(initial?.characterReferences ?? {});
    setCharacterGender(initial?.gender ?? '');
    setCharacterAge(initial?.age ?? '');
    setCharacterNationality(initial?.nationality ?? '');
    setCustomCharacterNationality(
      Boolean(
        initial?.nationality &&
        !(CHARACTER_NATIONALITIES as readonly string[]).includes(initial.nationality),
      ),
    );
    setCharacterReferenceFiles({});
    setCanvasReferencePickerKind(null);
    setPrimaryCanvasImagePickerOpen(false);
    setVideoUrl(initialMediaUrl);
    setMediaFile(undefined);
    setDurationSeconds(initial?.durationSeconds);
    setCommercial(initial?.commercial ?? defaultCommercial);
    setCropSource(null);
    setPreviewImage(null);
    setCropError(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setCropImageSize(null);
    setSaving(false);
    setSaveError(null);
    setEditingPromptHint(false);
    setPromptHintDraft(promptHintBelowCommercial ?? '');
  }, [
    categories,
    defaultCommercial,
    initial,
    initialMediaUrl,
    modelCategories,
    open,
    promptHintBelowCommercial,
  ]);

  useEffect(() => {
    if (open) return;
    if (ownedVideoUrl.current) URL.revokeObjectURL(ownedVideoUrl.current);
    ownedVideoUrl.current = null;
    setVideoUrl(undefined);
    setMediaFile(undefined);
  }, [open]);

  useEffect(() => {
    if (!open || mediaFile) return;
    setVideoUrl(initialMediaUrl);
    if (initial?.thumbnail) setThumbnail(initial.thumbnail);
    if (initial?.durationSeconds) setDurationSeconds(initial.durationSeconds);
  }, [initial?.durationSeconds, initial?.thumbnail, initialMediaUrl, mediaFile, open]);

  const beginCrop = (
    source: string,
    savedCrop: LibraryThumbnailCrop | null = thumbnailCrop ?? null,
  ) => {
    setCropSource(resolveUserLibraryThumbnail(source) ?? source);
    setCropError(null);
    setCropZoom(savedCrop?.zoom ?? 1);
    setCropOffset({ x: savedCrop?.offsetX ?? 0, y: savedCrop?.offsetY ?? 0 });
    setCropImageSize(null);
  };

  const applyPrimaryImageFile = async (file: File) => {
    await validateMediaFile?.(file);
    const preview = await readPreview(file);
    setFullImagePreview(preview);
    setThumbnailCrop(undefined);
    setThumbnailAssetId(undefined);
    setPrimaryCanvasImagePickerOpen(false);
    if (cropThumbnail) beginCrop(preview, null);
    else setThumbnail(preview);
    setMediaFile(file);
    setSaveError(null);
  };

  const applyCrop = async () => {
    if (!cropSource) return;
    try {
      const nextThumbnail = await cropPreview(cropSource, cropZoom, cropOffset.x, cropOffset.y);
      const nextCrop = { zoom: cropZoom, offsetX: cropOffset.x, offsetY: cropOffset.y };
      let persistedCrop: void | Partial<
        Pick<LibraryPresetSaveValue, 'thumbnail' | 'thumbnailAssetId'>
      > | null = null;
      if (initial?.id) {
        persistedCrop = await onApplyThumbnailCrop?.(initial.id, {
          thumbnail: nextThumbnail,
          thumbnailCrop: nextCrop,
        });
      }
      setThumbnail(persistedCrop?.thumbnail ?? nextThumbnail);
      setThumbnailAssetId(persistedCrop?.thumbnailAssetId);
      setThumbnailCrop(nextCrop);
      setCropSource(null);
    } catch {
      setCropError(t('library.editor.cropFailed', '无法处理这张图片，请更改图片后重试。'));
    }
  };

  useEffect(() => {
    if (!cropImageSize) return;
    const { width: viewportWidth, height: viewportHeight } = PORTRAIT_CROP_VIEWPORT;
    const scale =
      Math.max(viewportWidth / cropImageSize.width, viewportHeight / cropImageSize.height) *
      cropZoom;
    const maxX = Math.max(0, (cropImageSize.width * scale - viewportWidth) / 2);
    const maxY = Math.max(0, (cropImageSize.height * scale - viewportHeight) / 2);
    setCropOffset((current) => {
      const x = Math.max(-maxX, Math.min(maxX, current.x));
      const y = Math.max(-maxY, Math.min(maxY, current.y));
      return x === current.x && y === current.y ? current : { x, y };
    });
  }, [cropImageSize, cropZoom]);

  const cropMetrics = cropImageSize
    ? (() => {
        const { width: viewportWidth, height: viewportHeight } = PORTRAIT_CROP_VIEWPORT;
        const scale =
          Math.max(viewportWidth / cropImageSize.width, viewportHeight / cropImageSize.height) *
          cropZoom;
        return {
          width: cropImageSize.width * scale,
          height: cropImageSize.height * scale,
          maxX: Math.max(0, (cropImageSize.width * scale - viewportWidth) / 2),
          maxY: Math.max(0, (cropImageSize.height * scale - viewportHeight) / 2),
        };
      })()
    : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (primaryCanvasImagePickerOpen) setPrimaryCanvasImagePickerOpen(false);
      else if (canvasReferencePickerKind) setCanvasReferencePickerKind(null);
      else if (editingPromptHint) {
        setEditingPromptHint(false);
        setPromptHintDraft(promptHintBelowCommercial ?? '');
      } else if (categoryManager) setCategoryManager(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    canvasReferencePickerKind,
    categoryManager,
    editingPromptHint,
    onClose,
    open,
    primaryCanvasImagePickerOpen,
    promptHintBelowCommercial,
  ]);

  const commitPromptHint = () => {
    if (!onPromptHintBelowCommercialChange) return;
    onPromptHintBelowCommercialChange(promptHintDraft);
    setEditingPromptHint(false);
  };

  const chooseCharacterReference = (kind: CharacterReferenceKind) => {
    pendingCharacterReferenceKindRef.current = kind;
    characterReferenceFileRef.current?.click();
  };

  const removeCharacterReference = (kind: CharacterReferenceKind) => {
    setCharacterReferences((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
    setCharacterReferenceFiles((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
  };

  const chooseCanvasCharacterReference = async (
    kind: CharacterReferenceKind,
    option: CanvasNodeImageOption,
  ) => {
    try {
      const file = await canvasImageOptionToFile(option, 'canvas-reference');
      const preview = await readPreview(file);
      setCharacterReferences((current) => ({ ...current, [kind]: preview }));
      setCharacterReferenceFiles((current) => ({ ...current, [kind]: file }));
      setCanvasReferencePickerKind(null);
      setSaveError(null);
    } catch {
      setSaveError(
        t('library.character.canvasImageReadFailed', '无法读取这张画布图片，请确认图片仍然可用。'),
      );
    }
  };

  const chooseCanvasPrimaryImage = async (option: CanvasNodeImageOption) => {
    try {
      const file = await canvasImageOptionToFile(option, 'canvas-style');
      await applyPrimaryImageFile(file);
    } catch {
      setSaveError(
        t('library.editor.canvasImageReadFailed', '无法读取这张画布图片，请确认图片仍然可用。'),
      );
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      data-theme-role="modal-backdrop"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-4"
      onMouseDown={onClose}
    >
      <div
        data-theme-role="modal-surface"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#1d1d20] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          data-theme-role="modal-titlebar"
          className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"
        >
          <h3 className="text-sm font-medium text-white/90">
            {initial
              ? t('library.editor.editItem', '编辑{item}', { item: libraryName })
              : t('library.editor.addItem', '新增{item}', { item: libraryName })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            title={t('common.close', '关闭')}
            aria-label={t('common.close', '关闭')}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          data-theme-role="modal-content"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        >
          {showPrimaryMediaEditor && (
            <>
              <div
                data-theme-role="library-preview"
                role={mediaType === 'video' && videoUrl ? undefined : 'button'}
                tabIndex={mediaType === 'video' && videoUrl ? undefined : 0}
                onClick={(event) => {
                  if (mediaType === 'video' && videoUrl) return;
                  if ((event.target as HTMLElement).closest('[data-full-image-preview]')) {
                    const source = fullImagePreview ?? thumbnail;
                    if (source) setPreviewImage(source);
                    return;
                  }
                  const cropImage = fullImagePreview ?? thumbnail;
                  if (cropThumbnail && mediaType === 'image' && cropImage) beginCrop(cropImage);
                  else fileRef.current?.click();
                }}
                onKeyDown={(event) => {
                  if (mediaType === 'video' && videoUrl) return;
                  if ((event.target as HTMLElement).closest('[data-primary-canvas-image-picker]')) {
                    return;
                  }
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  fileRef.current?.click();
                }}
                className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/20 text-white/45 hover:border-white/30 hover:text-white/75"
              >
                {showPrimaryCanvasImagePicker && mediaType === 'image' && (
                  <button
                    type="button"
                    data-primary-canvas-image-picker="true"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPrimaryCanvasImagePickerOpen(true);
                    }}
                    title={t('library.editor.selectFromCanvas', '从当前画布节点选择图片')}
                    aria-label={t('library.editor.selectFromCanvas', '从当前画布节点选择图片')}
                    className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white/60 hover:bg-emerald-500/75 hover:text-white"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                )}
                {showImageUploadBadge &&
                  imageUploadLabel &&
                  mediaType === 'image' &&
                  !splitImagePreview && (
                    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-[10px] text-white/75">
                      {imageUploadLabel}
                    </span>
                  )}
                {splitImagePreview && mediaType === 'image' && (thumbnail || fullImagePreview) ? (
                  <div className="flex h-full w-full gap-px bg-white/10">
                    <div className="relative w-[30%] shrink-0 bg-black/35 p-1">
                      <span className="absolute left-1 top-1 z-10 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white/75">
                        {t('library.editor.thumbnail', '缩略图')}
                      </span>
                      {thumbnail && (
                        <img
                          src={resolveUserLibraryThumbnail(thumbnail)}
                          alt={t('library.editor.preview', '预览')}
                          className="h-full w-full rounded-md object-cover"
                        />
                      )}
                    </div>
                    <div
                      data-full-image-preview
                      className="relative min-w-0 flex-1 bg-black/35 p-1"
                    >
                      <span className="absolute left-1 top-1 z-10 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white/75">
                        {t('library.editor.fullImage', '完整图片')}
                      </span>
                      {(fullImagePreview ?? thumbnail) && (
                        <img
                          src={resolveUserLibraryThumbnail(fullImagePreview ?? thumbnail)}
                          alt={t('library.editor.fullImage', '完整图片')}
                          className="h-full w-full rounded-md object-cover"
                        />
                      )}
                    </div>
                    {cropThumbnail && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-white/80">
                        <Crop className="h-3 w-3" />
                        {t('library.editor.cropHint', '点击上传区域可重新裁剪')}
                      </span>
                    )}
                  </div>
                ) : mediaType === 'video' && videoUrl ? (
                  <>
                    <video
                      src={resolveUserLibraryThumbnail(videoUrl)}
                      poster={thumbnail}
                      controls
                      muted
                      playsInline
                      className="h-full w-full bg-black object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-[10px] text-white/80 hover:bg-black hover:text-white"
                    >
                      {t('library.editor.replaceVideo', '更换视频')}
                    </button>
                  </>
                ) : thumbnail ? (
                  <>
                    <img
                      src={resolveUserLibraryThumbnail(thumbnail)}
                      alt={t('library.editor.preview', '预览')}
                      className="h-full w-full object-cover"
                    />
                    {cropThumbnail && mediaType === 'image' && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-white/80">
                        <Crop className="h-3 w-3" />
                        {t('library.editor.cropHint', '点击上传区域可重新裁剪')}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-xs">
                    {mediaType === 'video' ? (
                      <Film className="h-4 w-4" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {mediaType === 'video'
                      ? t('library.editor.uploadVideo', '上传视频文件')
                      : (imageUploadLabel ?? t('library.editor.uploadPreview', '上传图片'))}
                  </span>
                )}
                {mediaType === 'video' && durationSeconds ? (
                  <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white/75">
                    {t('library.common.seconds', '{count}秒', { count: durationSeconds })}
                  </span>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={mediaAccept ?? (mediaType === 'video' ? 'video/*' : 'image/*')}
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    if (mediaType === 'video') {
                      await validateMediaFile?.(file);
                      const preview = await readVideoPreview(file);
                      if (ownedVideoUrl.current) URL.revokeObjectURL(ownedVideoUrl.current);
                      ownedVideoUrl.current = preview.url;
                      setVideoUrl(preview.url);
                      setThumbnail(preview.thumbnail);
                      setThumbnailAssetId(undefined);
                      setDurationSeconds(preview.durationSeconds);
                      setMediaFile(file);
                    } else {
                      await applyPrimaryImageFile(file);
                    }
                    setSaveError(null);
                  } catch (error) {
                    setSaveError(
                      error instanceof Error
                        ? error.message
                        : t('library.editor.mediaInvalid', '所选媒体文件无效。'),
                    );
                    /* Keep the previous preview when the file cannot be decoded. */
                  }
                  event.target.value = '';
                }}
              />
            </>
          )}
          {showCharacterReferenceEditor && (
            <input
              ref={characterReferenceFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const kind = pendingCharacterReferenceKindRef.current;
                try {
                  const preview = await readPreview(file);
                  setCharacterReferences((current) => ({ ...current, [kind]: preview }));
                  setCharacterReferenceFiles((current) => ({ ...current, [kind]: file }));
                } catch {
                  setSaveError(
                    t('library.editor.referenceDecodeFailed', '无法读取这张资料图，请重新选择。'),
                  );
                }
                event.target.value = '';
              }}
            />
          )}
          <label className="block text-xs text-white/55">
            {t('library.editor.name', '名称')}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/25"
            />
          </label>
          <div className="block text-xs text-white/55">
            {t('library.editor.category', '分类')}
            <div className="mt-1 flex gap-2">
              <select
                value={
                  onAddCategory && onRenameCategory ? category : newCategory ? '__new__' : category
                }
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setNewCategory(true);
                    setCategory('');
                  } else {
                    setNewCategory(false);
                    setCategory(event.target.value);
                  }
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#29292c] px-3 text-sm text-white outline-none focus:border-white/25"
              >
                {categories.map((item) => (
                  <option key={item} value={item} className="bg-[#1a1a1c] text-white">
                    {item === '未分类'
                      ? t('library.category.uncategorized', '未分类')
                      : (categoryLabels?.[item] ?? item)}
                  </option>
                ))}
                {(!onAddCategory || !onRenameCategory) && (
                  <option value="__new__" className="bg-[#1a1a1c] text-emerald-300">
                    {t('library.editor.newCategory', '＋ 新建分类')}
                  </option>
                )}
              </select>
              {onAddCategory && onRenameCategory ? (
                <button
                  type="button"
                  onClick={() =>
                    setCategoryManager((current) => (current === 'category' ? null : 'category'))
                  }
                  aria-expanded={categoryManager === 'category'}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
                    categoryManager === 'category'
                      ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85'
                  }`}
                >
                  <FolderCog className="h-3.5 w-3.5" />
                  {t('common.manage', '管理')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={newCategory || !category || category === '未分类'}
                  onClick={() => setPendingDeleteCategory(category)}
                  title={t('library.editor.deleteCurrentCategory', '删除当前分类')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-400/15 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {onAddCategory && onRenameCategory && (
              <CategoryManagerPanel
                open={categoryManager === 'category'}
                label={t('library.editor.category', '分类')}
                categories={categories}
                categoryLabels={categoryLabels}
                selected={category}
                onSelect={(value) => {
                  setCategory(value);
                  setNewCategory(false);
                }}
                onAdd={onAddCategory}
                onRename={onRenameCategory}
                onDelete={onDeleteCategory}
              />
            )}
            {(!onAddCategory || !onRenameCategory) && pendingDeleteCategory && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-rose-400/15 bg-rose-500/[0.08] px-3 py-2">
                <span className="text-[10px] text-rose-100/75">
                  {t(
                    'library.editor.deleteCategoryConfirm',
                    '删除“{name}”？其中预设将移到“未分类”。',
                    { name: pendingDeleteCategory },
                  )}
                </span>
                <div className="ml-3 flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteCategory(null)}
                    className="rounded px-2 py-1 text-[10px] text-white/45 hover:bg-white/10 hover:text-white/75"
                  >
                    {t('common.cancel', '取消')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = pendingDeleteCategory;
                      onDeleteCategory(target);
                      setCategory(categories.find((item) => item !== target) ?? '未分类');
                      setPendingDeleteCategory(null);
                    }}
                    className="rounded bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/30"
                  >
                    {t('library.editor.confirmDelete', '确认删除')}
                  </button>
                </div>
              </div>
            )}
            {(!onAddCategory || !onRenameCategory) && newCategory && (
              <input
                autoFocus
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder={t('library.editor.newCategoryPlaceholder', '输入新分类名称')}
                className="mt-2 h-9 w-full rounded-lg border border-emerald-400/20 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
              />
            )}
          </div>
          {showCharacterReferenceEditor && (
            <section
              data-character-metadata-editor="true"
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              <label className="block text-xs text-white/55">
                {t('library.character.gender', '性别')}
                <select
                  value={characterGender}
                  onChange={(event) =>
                    setCharacterGender(event.target.value as CharacterGender | '')
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#29292c] px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="">{t('library.character.unspecified', '未设置')}</option>
                  <option value="male">{t('library.character.gender.male', '男')}</option>
                  <option value="female">{t('library.character.gender.female', '女')}</option>
                  <option value="other">{t('library.character.gender.other', '其他')}</option>
                </select>
              </label>
              <label className="block text-xs text-white/55">
                {t('library.character.age', '年龄')}
                <input
                  type="number"
                  min={0}
                  max={150}
                  step={1}
                  value={characterAge}
                  onChange={(event) =>
                    setCharacterAge(event.target.value === '' ? '' : Number(event.target.value))
                  }
                  placeholder={t('library.character.agePlaceholder', '例如：24')}
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
                />
              </label>
              <div className="block text-xs text-white/55">
                <span>{t('library.character.nationality', '国籍')}</span>
                <select
                  data-character-nationality-select="true"
                  value={customCharacterNationality ? '__custom__' : characterNationality}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === '__custom__') {
                      setCustomCharacterNationality(true);
                      setCharacterNationality('');
                      return;
                    }
                    setCustomCharacterNationality(false);
                    setCharacterNationality(value);
                  }}
                  aria-label={t('library.character.nationality', '国籍')}
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#29292c] px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="">{t('library.character.unspecified', '未设置')}</option>
                  {CHARACTER_NATIONALITIES.map((nationality) => (
                    <option key={nationality} value={nationality}>
                      {nationality}
                    </option>
                  ))}
                  <option value="__custom__">
                    {t('library.character.customNationality', '其它／自定义…')}
                  </option>
                </select>
                {customCharacterNationality && (
                  <input
                    data-character-nationality-custom-input="true"
                    autoFocus
                    maxLength={60}
                    value={characterNationality}
                    onChange={(event) => setCharacterNationality(event.target.value)}
                    aria-label={t('library.character.customNationalityPlaceholder', '输入国籍')}
                    placeholder={t('library.character.customNationalityPlaceholder', '输入国籍')}
                    className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
                  />
                )}
              </div>
            </section>
          )}
          {modelCategories && (
            <div className="block text-xs text-white/55">
              {t('library.editor.modelCategory', 'AI 模型分类')}
              <div className="mt-1 flex gap-2">
                <select
                  value={
                    onAddModelCategory && onRenameModelCategory
                      ? model
                      : newModelCategory
                        ? '__new__'
                        : model
                  }
                  onChange={(event) => {
                    if (event.target.value === '__new__') {
                      setNewModelCategory(true);
                      setModel('');
                    } else {
                      setNewModelCategory(false);
                      setModel(event.target.value);
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#29292c] px-3 text-sm text-white outline-none focus:border-white/25"
                >
                  {modelCategories.map((item) => (
                    <option key={item} value={item} className="bg-[#1a1a1c] text-white">
                      {item === '未分类' ? t('library.category.uncategorized', '未分类') : item}
                    </option>
                  ))}
                  {(!onAddModelCategory || !onRenameModelCategory) && (
                    <option value="__new__" className="bg-[#1a1a1c] text-emerald-300">
                      {t('library.editor.newModelCategory', '＋ 新建 AI 模型分类')}
                    </option>
                  )}
                </select>
                {onAddModelCategory && onRenameModelCategory && onDeleteModelCategory ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCategoryManager((current) => (current === 'model' ? null : 'model'))
                    }
                    aria-expanded={categoryManager === 'model'}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
                      categoryManager === 'model'
                        ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85'
                    }`}
                  >
                    <FolderCog className="h-3.5 w-3.5" />
                    {t('common.manage', '管理')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={newModelCategory || !model || model === '未分类'}
                    onClick={() => setPendingDeleteModelCategory(model)}
                    title={t('library.editor.deleteCurrentModelCategory', '删除当前 AI 模型分类')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-400/15 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {onAddModelCategory && onRenameModelCategory && onDeleteModelCategory && (
                <CategoryManagerPanel
                  open={categoryManager === 'model'}
                  label={t('library.editor.modelCategory', 'AI 模型分类')}
                  categories={modelCategories}
                  selected={model}
                  onSelect={(value) => {
                    setModel(value);
                    setNewModelCategory(false);
                  }}
                  onAdd={onAddModelCategory}
                  onRename={onRenameModelCategory}
                  onDelete={onDeleteModelCategory}
                />
              )}
              {(!onAddModelCategory || !onRenameModelCategory || !onDeleteModelCategory) &&
                pendingDeleteModelCategory && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-rose-400/15 bg-rose-500/[0.08] px-3 py-2">
                    <span className="text-[11px] text-rose-100/75">
                      {t(
                        'library.editor.deleteModelCategoryConfirm',
                        '删除“{name}”？使用它的风格将移到“未分类”。',
                        { name: pendingDeleteModelCategory },
                      )}
                    </span>
                    <div className="ml-3 flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteModelCategory(null)}
                        className="rounded px-2 py-1 text-[11px] text-white/45 hover:bg-white/10 hover:text-white/75"
                      >
                        {t('common.cancel', '取消')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteModelCategory?.(pendingDeleteModelCategory);
                          setModel('未分类');
                          setPendingDeleteModelCategory(null);
                        }}
                        className="rounded bg-rose-500/20 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/30"
                      >
                        {t('library.editor.confirmDelete', '确认删除')}
                      </button>
                    </div>
                  </div>
                )}
              {(!onAddModelCategory || !onRenameModelCategory || !onDeleteModelCategory) &&
                newModelCategory && (
                  <input
                    autoFocus
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={t(
                      'library.editor.newModelCategoryPlaceholder',
                      '输入 AI 模型分类名称',
                    )}
                    className="mt-2 h-9 w-full rounded-lg border border-emerald-400/20 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
                  />
                )}
            </div>
          )}
          {showFullImagePreview &&
            !splitImagePreview &&
            mediaType === 'image' &&
            fullImagePreview && (
              <section className="rounded-xl border border-white/10 bg-black/20 p-2">
                <span className="mb-1.5 block text-xs text-white/55">
                  {fullImageLabel ?? t('library.editor.fullImage', '完整图片')}
                </span>
                <img
                  src={resolveUserLibraryThumbnail(fullImagePreview)}
                  alt={fullImageLabel ?? t('library.editor.fullImage', '完整图片')}
                  className="h-52 w-full rounded-lg bg-black/30 object-contain"
                />
              </section>
            )}
          {showCharacterReferenceEditor && (
            <section
              data-character-reference-editor="true"
              className="rounded-xl border border-white/10 bg-black/20 p-3"
            >
              <div className="mb-2.5 flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-medium text-white/75">
                    {t('library.character.referenceImages', '角色资料图')}
                  </h4>
                  <p className="mt-1 text-[11px] leading-4 text-white/35">
                    {t(
                      'library.character.referenceImagesHint',
                      '每项都是独立真实图片；可以只上传现有资料，之后再继续补充。',
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/40">
                  {
                    CHARACTER_REFERENCE_FIELDS.filter(({ kind }) =>
                      characterReferences[kind]?.trim(),
                    ).length
                  }
                  /4
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CHARACTER_REFERENCE_FIELDS.map(
                  ({ kind, labelKey, labelFallback, hintKey, hintFallback, wide }) => {
                    const source = characterReferences[kind];
                    const label = t(labelKey, labelFallback);
                    const hint = t(hintKey, hintFallback);
                    return (
                      <div
                        key={kind}
                        className={`relative overflow-hidden rounded-lg border bg-[#141416] ${
                          source ? 'border-emerald-400/20' : 'border-dashed border-white/12'
                        } ${wide ? 'col-span-3 h-32' : 'h-32'}`}
                      >
                        <button
                          type="button"
                          onClick={() => chooseCharacterReference(kind)}
                          title={
                            source
                              ? t('library.character.replaceReference', '替换{name}', {
                                  name: label,
                                })
                              : hint
                          }
                          className="flex h-full w-full flex-col items-center justify-center overflow-hidden text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/65"
                        >
                          {source ? (
                            <img
                              src={resolveUserLibraryThumbnail(source)}
                              alt={label}
                              className="h-full w-full bg-[#f4f4f2] object-contain"
                            />
                          ) : (
                            <>
                              <ImagePlus className="mb-1.5 h-5 w-5" />
                              <span className="px-2 text-center text-[11px] leading-4">{hint}</span>
                            </>
                          )}
                        </button>
                        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white/75">
                          {label}
                        </span>
                        <div className="absolute right-1.5 top-1.5 flex gap-1">
                          <button
                            type="button"
                            onClick={() => setCanvasReferencePickerKind(kind)}
                            title={t(
                              'library.character.selectFromCanvas',
                              '从当前画布节点选择图片',
                            )}
                            aria-label={t(
                              'library.character.selectFromCanvasFor',
                              '从当前画布节点选择{name}',
                              { name: label },
                            )}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white/55 hover:bg-emerald-500/70 hover:text-white"
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                          </button>
                          {source && (
                            <button
                              type="button"
                              onClick={() => removeCharacterReference(kind)}
                              title={t('library.character.removeReference', '移除{name}', {
                                name: label,
                              })}
                              aria-label={t('library.character.removeReference', '移除{name}', {
                                name: label,
                              })}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white/55 hover:bg-rose-500/70 hover:text-white"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          )}
          <label className="block text-xs text-white/55">
            {promptLabel ?? t('library.editor.prompt', '提示词')}
            {promptHint && <span className="mt-1 block leading-5 text-white/40">{promptHint}</span>}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder={
                promptPlaceholder ??
                t('library.editor.promptPlaceholder', '应用预设时追加到节点指令中')
              }
              className={`mt-1 w-full resize-none rounded-lg border bg-white/5 px-3 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 ${
                promptAccent
                  ? 'border-emerald-400/70 focus:border-emerald-300'
                  : 'border-white/10 focus:border-white/25'
              }`}
            />
          </label>
          {showCommercialOption && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs text-white/70 hover:bg-white/[0.055]">
              <input
                type="checkbox"
                checked={commercial}
                onChange={(event) => setCommercial(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span>
                <span className="block font-medium text-white/85">
                  {t('library.editor.commercialAllowed', '允许商业使用')}
                </span>
                <span className="mt-1 block leading-5 text-white/40">
                  {t(
                    'library.editor.commercialNotice',
                    '仅在确认图片、提示词和相关素材授权允许商业用途时勾选。',
                  )}
                </span>
              </span>
            </label>
          )}
          {promptHintBelowCommercial &&
            (editingPromptHint && onPromptHintBelowCommercialChange ? (
              <div className="rounded-xl border border-emerald-400/45 bg-emerald-500/[0.08] p-2">
                <textarea
                  autoFocus
                  maxLength={400}
                  value={promptHintDraft}
                  onChange={(event) => setPromptHintDraft(event.target.value)}
                  onBlur={commitPromptHint}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setPromptHintDraft(promptHintBelowCommercial);
                      setEditingPromptHint(false);
                    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      commitPromptHint();
                    }
                  }}
                  placeholder={t('library.editor.promptGuidePlaceholder', '输入指令框使用参考')}
                  className="min-h-16 w-full resize-y bg-transparent px-1 text-xs leading-5 text-emerald-100/90 outline-none placeholder:text-emerald-100/30"
                />
                <div className="px-1 pt-1 text-[11px] text-emerald-100/40">
                  {t('library.editor.promptGuideEditHint', '失焦或 Ctrl+Enter 保存，Esc 取消')}
                </div>
              </div>
            ) : (
              <div
                role={onPromptHintBelowCommercialChange ? 'button' : undefined}
                tabIndex={onPromptHintBelowCommercialChange ? 0 : undefined}
                title={
                  onPromptHintBelowCommercialChange
                    ? t('library.editor.doubleClickToEdit', '双击修改')
                    : undefined
                }
                onDoubleClick={() => {
                  if (!onPromptHintBelowCommercialChange) return;
                  setPromptHintDraft(promptHintBelowCommercial);
                  setEditingPromptHint(true);
                }}
                onKeyDown={(event) => {
                  if (!onPromptHintBelowCommercialChange || event.key !== 'Enter') return;
                  setPromptHintDraft(promptHintBelowCommercial);
                  setEditingPromptHint(true);
                }}
                className={`group relative rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-2.5 text-xs leading-5 text-emerald-100/85 ${
                  onPromptHintBelowCommercialChange
                    ? 'cursor-text pr-20 outline-none focus:border-emerald-400/50'
                    : ''
                }`}
              >
                {promptHintBelowCommercial}
                {onPromptHintBelowCommercialChange && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] text-emerald-100/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                    <Pencil className="h-2.5 w-2.5" />
                    {t('library.editor.doubleClickToEdit', '双击修改')}
                  </span>
                )}
              </div>
            ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          {saveError && <span className="mr-auto text-xs text-rose-300">{saveError}</span>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            data-theme-role="primary-action"
            type="button"
            disabled={
              saving ||
              !title.trim() ||
              !category.trim() ||
              (modelCategories !== undefined && !model.trim()) ||
              (mediaType === 'video' && !initial && !videoUrl) ||
              (mediaRequired && !mediaFile && !initial?.originalImage)
            }
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              const value: LibraryPresetSaveValue = {
                id: initial?.id,
                title,
                category,
                prompt,
                model: modelCategories ? model : initial?.model,
                thumbnail,
                thumbnailAssetId,
                originalImage,
                thumbnailCrop,
                characterReferences: showCharacterReferenceEditor
                  ? characterReferences
                  : initial?.characterReferences,
                gender: showCharacterReferenceEditor
                  ? characterGender || undefined
                  : initial?.gender,
                age: showCharacterReferenceEditor
                  ? characterAge === ''
                    ? undefined
                    : characterAge
                  : initial?.age,
                nationality: showCharacterReferenceEditor
                  ? characterNationality.trim() || undefined
                  : initial?.nationality,
                durationSeconds,
                commercial: showCommercialOption ? commercial : initial?.commercial,
                tags: [category],
              };
              try {
                const mediaPatch = onPrepareMediaForSave
                  ? await onPrepareMediaForSave({
                      value,
                      mediaFile,
                      characterReferenceFiles,
                    })
                  : undefined;
                const savedId = onSave({ ...value, ...mediaPatch });
                if (!onPrepareMediaForSave && typeof savedId === 'string' && mediaFile) {
                  await onSaveMedia?.(savedId, mediaFile);
                }
                onClose();
              } catch {
                setSaveError(
                  t(
                    'library.editor.saveMediaFailed',
                    '媒体未能由本机 Bridge 持久保存；当前编辑仍在临时会话中，请检查 Bridge 和主机磁盘后重试。',
                  ),
                );
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-30"
          >
            {saving ? t('library.editor.saving', '保存中…') : t('common.save', '保存')}
          </button>
        </div>
      </div>
      {primaryCanvasImagePickerOpen && (
        <CanvasImagePickerDialog
          options={canvasImageOptions}
          onClose={() => setPrimaryCanvasImagePickerOpen(false)}
          onSelect={(option) => void chooseCanvasPrimaryImage(option)}
        />
      )}
      {canvasReferencePickerKind && (
        <CanvasImagePickerDialog
          options={canvasImageOptions}
          onClose={() => setCanvasReferencePickerKind(null)}
          onSelect={(option) =>
            void chooseCanvasCharacterReference(canvasReferencePickerKind, option)
          }
        />
      )}
      {cropSource && cropThumbnail && (
        <div
          data-theme-role="modal-backdrop"
          className="fixed inset-0 z-[310] flex items-center justify-center bg-black/75 p-4"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            data-theme-role="modal-surface"
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1d1d20] p-4 shadow-2xl"
          >
            <div
              data-theme-role="modal-titlebar"
              className="mb-3 flex items-center justify-between"
            >
              <h4 className="text-sm font-medium text-white/90">
                {t('library.editor.cropTitle', '裁剪缩略图')}
              </h4>
              <button
                type="button"
                onClick={() => setCropSource(null)}
                className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                aria-label={t('common.close', '关闭')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              data-theme-role="library-preview"
              className="relative mx-auto h-[min(60vh,640px)] max-w-full overflow-hidden rounded-xl border border-emerald-400/40 bg-black"
              style={{ aspectRatio: PORTRAIT_LIBRARY_THUMBNAIL.aspectRatio }}
            >
              <img
                src={resolveUserLibraryThumbnail(cropSource)}
                crossOrigin={
                  cropSource.startsWith('data:') || cropSource.startsWith('blob:')
                    ? undefined
                    : 'anonymous'
                }
                alt={t('library.editor.cropPreview', '裁剪预览')}
                onLoad={(event) =>
                  setCropImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: cropMetrics ? `${cropMetrics.width}px` : '100%',
                  height: cropMetrics ? `${cropMetrics.height}px` : '100%',
                  transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px)`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 border-2 border-white/70" />
            </div>
            {cropError && <p className="mt-2 text-xs text-rose-300">{cropError}</p>}
            <label className="mt-3 flex items-center gap-3 text-xs text-white/60">
              <span>{t('library.editor.cropZoom', '缩放')}</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="flex-1 accent-emerald-400"
              />
              <span className="w-10 text-right tabular-nums">{cropZoom.toFixed(1)}×</span>
            </label>
            <label className="mt-2 flex items-center gap-3 text-xs text-white/60">
              <span className="w-12 shrink-0">
                {t('library.editor.cropHorizontal', '横向位置')}
              </span>
              <input
                type="range"
                min={cropMetrics ? -cropMetrics.maxX : 0}
                max={cropMetrics?.maxX ?? 0}
                step="1"
                value={Math.max(
                  cropMetrics ? -cropMetrics.maxX : 0,
                  Math.min(cropMetrics?.maxX ?? 0, cropOffset.x),
                )}
                onChange={(event) =>
                  setCropOffset((current) => ({ ...current, x: Number(event.target.value) }))
                }
                className="flex-1 accent-emerald-400"
              />
            </label>
            <label className="mt-2 flex items-center gap-3 text-xs text-white/60">
              <span className="w-12 shrink-0">{t('library.editor.cropVertical', '纵向位置')}</span>
              <input
                type="range"
                min={cropMetrics ? -cropMetrics.maxY : 0}
                max={cropMetrics?.maxY ?? 0}
                step="1"
                value={Math.max(
                  cropMetrics ? -cropMetrics.maxY : 0,
                  Math.min(cropMetrics?.maxY ?? 0, cropOffset.y),
                )}
                onChange={(event) =>
                  setCropOffset((current) => ({ ...current, y: Number(event.target.value) }))
                }
                className="flex-1 accent-emerald-400"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
              >
                {t('library.editor.replaceThumbnail', '更改图片')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCropZoom(1);
                  setCropOffset({ x: 0, y: 0 });
                }}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('library.editor.cropReset', '居中')}
              </button>
              <button
                type="button"
                onClick={() => setCropSource(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/55 hover:bg-white/10"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                data-theme-role="primary-action"
                type="button"
                onClick={() => void applyCrop()}
                className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
              >
                {t('library.editor.useCrop', '使用此裁剪')}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImage && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 p-6"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('library.editor.fullImage', '完整图片')}
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <img
              src={resolveUserLibraryThumbnail(previewImage)}
              alt={t('library.editor.fullImage', '完整图片')}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-0 top-0 rounded-lg bg-black/65 p-2 text-white/75 hover:bg-black hover:text-white"
              aria-label={t('common.close', '关闭')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
