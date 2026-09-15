import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Search,
  Heart,
  Quote,
  X,
  Check,
  Plus,
  Pencil,
  Trash2,
  Save,
  ChevronDown,
  ImagePlus,
  FolderCog,
  ArrowDownUp,
  Maximize2,
} from 'lucide-react';
import { Modal } from './Modal';
import { selectCanvasImagePickerNodes, useCanvasStore } from '../store/canvasStore';
import {
  loadPromptLibrary,
  getPromptThumbnailUrl,
  styleModuleEntries,
  styleSupportsCategory,
  composeStylePrompt,
  addCustomPrompt,
  addPromptCustomCategory,
  deletePromptCategory,
  deleteCustomPrompt,
  loadPromptCustomCategories,
  loadPromptDeletedCategories,
  PROMPT_UNCATEGORIZED,
  renamePromptCategory,
  resolvePromptCategory,
  saveCustomPrompt,
  refreshPromptLibrary,
  normalizePromptModules,
  normalizeCustomPromptModules,
  sortPromptItems,
  queuePromptLibrarySync,
  STYLE_CATEGORY_OPTIONS,
  STYLE_PROMPT_MODULES,
  MODULE_GROUP_LABELS,
  type PromptItem,
  type PromptLibrary,
  type StyleCategory,
  type StylePromptModuleKey,
  type PromptModuleKey,
  type TaskType,
  type ModuleGroup,
  type CustomPrompt,
  type PromptTarget,
  type PromptLibrarySort,
  type CustomPromptModule,
} from '../data/promptLibrary';
import { useAppTranslation } from '../i18n/appI18n';
import { ThumbnailCropDialog } from './ThumbnailCropDialog';
import { CanvasImagePickerDialog, CategoryManagerPanel } from './LibraryPresetEditor';
import { LibraryTransferActions } from './LibraryTransferActions';
import { NODE_H, NODE_W } from '../canvas/constants';
import { persistImagePreviewDataUrl } from '../services/mediaPersistence';
import {
  canvasImageOptionToFile,
  canvasNodeImageOptions,
  type CanvasNodeImageOption,
} from '../lib/canvasNodeImageOptions';

const ALL_CAT = 'all';

const TASK_TABS: { key: TaskType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'script', label: '我的提示词' },
];

const PROMPT_SORT_OPTIONS: PromptLibrarySort[] = ['recommended', 'recent', 'name'];

const EMPTY_CUSTOM: Omit<CustomPrompt, 'id' | 'custom' | 'enName' | 'enDescription'> = {
  name: '',
  category: 'image',
  target: 'both',
  description: '',
  prompt: '',
  promptModules: {},
  negative: '',
  color: '#10b981',
  tags: [],
  thumbnailFile: '',
};

function createEmptyCustom(): CustomPrompt {
  return { ...EMPTY_CUSTOM, custom: true, id: '', enName: '', enDescription: '' };
}

function readImageFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Dark-theme select replacement (native <select> popups are white on Win Chromium). */
function SimpleSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/5 px-2 text-xs text-white/85 hover:bg-white/[0.08] focus:border-white/20 focus:outline-none"
      >
        <span className="truncate">
          {current?.label ?? t('library.prompt.selectPlaceholder', '请选择')}
        </span>
        <ChevronDown
          className={`ml-1 h-3 w-3 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          data-theme-role="popover-surface"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-2xl"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                  o.value === value ? 'bg-emerald-500/20 text-emerald-200' : 'text-white/85'
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PromptLibraryModal() {
  const { language, t } = useAppTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const openModal = useCanvasStore((s) => s.openModal);
  const closeModal = useCanvasStore((s) => s.closeModal);
  const applyPromptPreset = useCanvasStore((s) => s.applyPromptPreset);
  const modalNodeId = useCanvasStore((s) => s.modalNodeId);
  const activeProjectId = useCanvasStore((s) => s.activeProjectId);
  const nodes = useCanvasStore(selectCanvasImagePickerNodes);

  const [library, setLibrary] = useState<PromptLibrary | null>(null);
  const [customVersion, setCustomVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('all');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CAT);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Per-style selected module keys. Persisted so selections survive close/reopen.
  const [selectedModules, setSelectedModules] = useState<Record<string, PromptModuleKey[]>>(() => {
    try {
      const storageKey = 'kitty-canvas-prompt-selected-modules';
      const raw =
        localStorage.getItem(storageKey) ?? localStorage.getItem('libtv-prompt-selected-modules');
      if (localStorage.getItem(storageKey) === null && raw !== null)
        localStorage.setItem(storageKey, raw);
      return raw ? (JSON.parse(raw) as Record<string, PromptModuleKey[]>) : {};
    } catch {
      return {};
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const storageKey = 'kitty-canvas-prompt-selected-id';
    const selectedId =
      localStorage.getItem(storageKey) ?? localStorage.getItem('libtv-prompt-selected-id');
    if (localStorage.getItem(storageKey) === null && selectedId !== null) {
      localStorage.setItem(storageKey, selectedId);
    }
    return selectedId;
  });

  // Custom prompt editor state (used in 剧本 tab and for editing any prompt).
  const [editingCustom, setEditingCustom] = useState<CustomPrompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(() =>
    loadPromptCustomCategories(),
  );
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [sort, setSort] = useState<PromptLibrarySort>('recommended');
  const [sortOpen, setSortOpen] = useState(false);

  // Inline delete confirmation to avoid browser `confirm()` (blocked by lint).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [thumbnailCropSource, setThumbnailCropSource] = useState<string | null>(null);
  const [thumbnailCanvasPickerOpen, setThumbnailCanvasPickerOpen] = useState(false);
  const [promptImagePreview, setPromptImagePreview] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customSaveError, setCustomSaveError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const editingCustomRef = useRef<CustomPrompt | null>(null);

  // Ref to the right-side detail drawer so we can scroll it to top on selection change.
  const detailRef = useRef<HTMLDivElement>(null);
  // Ref to the left grid scroll container so we can bring the drawer into view.
  const gridRef = useRef<HTMLDivElement>(null);

  const isScriptMode = taskType === 'script';
  const moduleTaskType: TaskType = isScriptMode ? 'all' : taskType;

  const reload = useCallback(() => {
    refreshPromptLibrary();
    setLoading(true);
    setError(null);
    loadPromptLibrary()
      .then((data) => {
        setLibrary(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (openModal !== 'prompt-library') return;
    setCustomCategories(loadPromptCustomCategories());
    reload();
  }, [openModal, reload, customVersion]);

  // Keep a synchronous copy for the save button. Crop completion updates the
  // React state asynchronously; a fast click must still save the new crop.
  useEffect(() => {
    editingCustomRef.current = editingCustom;
  }, [editingCustom]);

  useEffect(() => {
    if (openModal !== 'prompt-library') {
      setSortOpen(false);
      setThumbnailCanvasPickerOpen(false);
    }
  }, [openModal]);

  // Persist module selections & last-opened style so they survive close/reopen.
  useEffect(() => {
    localStorage.setItem('kitty-canvas-prompt-selected-modules', JSON.stringify(selectedModules));
  }, [selectedModules]);
  useEffect(() => {
    if (selectedId) {
      localStorage.setItem('kitty-canvas-prompt-selected-id', selectedId);
    } else {
      localStorage.removeItem('kitty-canvas-prompt-selected-id');
    }
  }, [selectedId]);

  const scrollDetailToTop = useCallback(() => {
    const el = detailRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollTo({ top: 0, behavior: 'auto' });
    // Paint-frame + timeout guards for stubborn timing races.
    const raf = requestAnimationFrame(() => {
      el.scrollTop = 0;
      el.scrollTo({ top: 0, behavior: 'auto' });
    });
    const t = setTimeout(() => {
      el.scrollTop = 0;
      el.scrollTo({ top: 0, behavior: 'auto' });
    }, 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  // Scroll detail drawer to top synchronously before paint when selection changes.
  useLayoutEffect(() => {
    if (!selectedId) return;
    return scrollDetailToTop();
  }, [selectedId, scrollDetailToTop]);

  // Also scroll when the modal is reopened (initial state from localStorage
  // does not trigger the above effect).
  useEffect(() => {
    if (openModal === 'prompt-library') {
      scrollDetailToTop();
    }
  }, [openModal, scrollDetailToTop]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    const items = library.items.filter((item) => {
      if (isScriptMode) return item.custom;
      if (activeCategory !== ALL_CAT && !styleSupportsCategory(item, activeCategory)) return false;
      if (taskType !== 'all' && item.target !== 'both' && item.target !== taskType) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.enName && item.enName.toLowerCase().includes(q)) ||
        item.author?.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return sortPromptItems(items, sort, language);
  }, [library, activeCategory, taskType, query, isScriptMode, customVersion, sort, language]);

  const categoryOptions = useMemo(() => {
    const deletedCategories = loadPromptDeletedCategories();
    const builtIn = STYLE_CATEGORY_OPTIONS.filter(
      (category) => !deletedCategories.has(category.key),
    ).map((category) => {
      const value = resolvePromptCategory(category.key);
      return {
        value,
        label:
          value === category.key
            ? t(
                `library.prompt.category.${category.key}`,
                language === 'zh-CN' ? category.zh : category.en,
              )
            : value,
      };
    });
    const builtInValues = new Set<string>(builtIn.map((category) => category.value));
    const discovered = (library?.items ?? [])
      .map((item) => item.category.trim())
      .filter((category) => category && !builtInValues.has(category));
    const current = editingCustom?.category.trim();
    const custom = [...customCategories, ...discovered, ...(current ? [current] : [])].filter(
      (category, index, categories) =>
        !builtInValues.has(category) &&
        categories.findIndex(
          (candidate) => candidate.toLocaleLowerCase() === category.toLocaleLowerCase(),
        ) === index,
    );
    return [
      ...builtIn,
      ...custom.map((category) => ({ value: category, label: category })),
      {
        value: PROMPT_UNCATEGORIZED,
        label: t('library.category.uncategorized', '未分类'),
      },
    ].filter(
      (option, index, options) =>
        options.findIndex(
          (candidate) => candidate.value.toLocaleLowerCase() === option.value.toLocaleLowerCase(),
        ) === index,
    );
  }, [customCategories, editingCustom?.category, language, library, t]);

  const selectedStyle = useMemo(
    () => (selectedId && library ? library.items.find((i) => i.id === selectedId) || null : null),
    [selectedId, library],
  );
  const selectedThumbnailUrl = selectedStyle ? getPromptThumbnailUrl(selectedStyle) : '';
  const editingThumbnailUrl = editingCustom ? getPromptThumbnailUrl(editingCustom) : '';
  const canvasImages = useMemo(() => canvasNodeImageOptions(nodes), [nodes]);

  const selectedEntries = useMemo(
    () => (selectedStyle ? styleModuleEntries(selectedStyle, moduleTaskType) : []),
    [selectedStyle, moduleTaskType],
  );

  const selectedEntryKeys = useMemo(
    () => new Set(selectedEntries.map((entry) => entry.key)),
    [selectedEntries],
  );
  const checkedForSelected = useMemo(
    () =>
      selectedId
        ? (selectedModules[selectedId] || []).filter((key) => selectedEntryKeys.has(key))
        : [],
    [selectedEntryKeys, selectedId, selectedModules],
  );

  const groupedEntries = useMemo(() => {
    const groups: Record<ModuleGroup, typeof selectedEntries> = {
      look: [],
      character: [],
      motion: [],
      control: [],
    };
    for (const e of selectedEntries) groups[e.group].push(e);
    return groups;
  }, [selectedEntries]);

  const composed = useMemo(() => {
    if (!selectedStyle) return { prompt: '', negative: '' };
    return composeStylePrompt(selectedStyle, checkedForSelected, moduleTaskType);
  }, [selectedStyle, checkedForSelected, moduleTaskType]);

  const openStyle = (item: PromptItem) => {
    setSelectedId(item.id);
    setSelectedModules((prev) => {
      if (prev[item.id]) return prev;
      return { ...prev, [item.id]: [] }; // default: nothing selected
    });
    // Bring the drawer (which is positioned over the grid) into full view by
    // scrolling the left grid container to top, and also reset the drawer
    // content scroll to top.
    gridRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    scrollDetailToTop();
    requestAnimationFrame(() => {
      gridRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      detailRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const toggleModule = (key: PromptModuleKey) => {
    if (!selectedId) return;
    setSelectedModules((prev) => {
      const current = (prev[selectedId] || []).filter((candidate) =>
        selectedEntryKeys.has(candidate),
      );
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, [selectedId]: next };
    });
  };

  const toggleAllModules = () => {
    if (!selectedId) return;
    const allKeys = selectedEntries.map((e) => e.key);
    const allSelected = allKeys.every((k) => (selectedModules[selectedId] || []).includes(k));
    setSelectedModules((prev) => ({ ...prev, [selectedId]: allSelected ? [] : allKeys }));
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentCanvasNodePosition = useCallback(() => {
    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    return { x: viewportCenter.x - NODE_W / 2, y: viewportCenter.y - NODE_H / 2 };
  }, [screenToFlowPosition]);

  const handleApply = () => {
    if (!selectedStyle) return;
    const target =
      taskType === 'video'
        ? 'video'
        : taskType === 'script'
          ? 'script'
          : selectedStyle.target === 'video'
            ? 'video'
            : 'image';
    applyPromptPreset({
      id: selectedStyle.id,
      title: selectedStyle.name,
      prompt: composed.prompt,
      tags: selectedStyle.tags,
      moduleCount: checkedForSelected.length,
      target,
      position: currentCanvasNodePosition(),
    });
  };

  // ---- Custom prompt CRUD ----

  const startCreate = () => {
    const empty = createEmptyCustom();
    empty.category =
      categoryOptions.find((option) => option.value !== PROMPT_UNCATEGORIZED)?.value ??
      PROMPT_UNCATEGORIZED;
    editingCustomRef.current = empty;
    setEditingCustom(empty);
    setIsCreating(true);
    setCategoryManagerOpen(false);
  };

  const startEdit = (item: PromptItem) => {
    // Editing a built-in prompt saves a local override copy with the same id.
    setSelectedId(null);
    const next = { ...item, custom: true } as CustomPrompt;
    editingCustomRef.current = next;
    setEditingCustom(next);
    setIsCreating(false);
    setCategoryManagerOpen(false);
  };

  const closeEditor = () => {
    editingCustomRef.current = null;
    setEditingCustom(null);
    setIsCreating(false);
    setThumbnailCropSource(null);
    setThumbnailCanvasPickerOpen(false);
    setCategoryManagerOpen(false);
    setSavingCustom(false);
    setCustomSaveError(null);
  };

  const chooseCanvasThumbnail = async (option: CanvasNodeImageOption) => {
    try {
      const file = await canvasImageOptionToFile(option, 'canvas-prompt');
      setThumbnailCropSource(await readImageFile(file));
      setThumbnailCanvasPickerOpen(false);
      setCustomSaveError(null);
    } catch {
      setCustomSaveError(
        t('library.editor.canvasImageReadFailed', '无法读取这张画布图片，请确认图片仍然可用。'),
      );
    }
  };

  const saveCustom = async () => {
    const currentEditingCustom = editingCustomRef.current ?? editingCustom;
    if (!currentEditingCustom) return;
    const name = currentEditingCustom.name.trim();
    const prompt = currentEditingCustom.prompt.trim();
    const promptModules = normalizePromptModules(currentEditingCustom.promptModules);
    const customPromptModules = normalizeCustomPromptModules(
      currentEditingCustom.customPromptModules,
    );
    if (!name || !prompt) return;

    setSavingCustom(true);
    setCustomSaveError(null);
    try {
      let thumbnailFile = currentEditingCustom.thumbnailFile;
      let thumbnailUrl = currentEditingCustom.thumbnailUrl;
      let thumbnailAssetId = currentEditingCustom.thumbnailAssetId;
      const transientThumbnail = [thumbnailUrl, thumbnailFile].find((value) =>
        /^(?:data:|blob:)/iu.test(value?.trim() ?? ''),
      );
      if (transientThumbnail) {
        const persisted = await persistImagePreviewDataUrl(transientThumbnail);
        thumbnailFile = '';
        thumbnailUrl = persisted.previewUrl;
        thumbnailAssetId = persisted.previewAssetId;
      }

      if (isCreating) {
        addCustomPrompt({
          name,
          category: currentEditingCustom.category as StyleCategory,
          target: currentEditingCustom.target as 'image' | 'video' | 'both',
          description: currentEditingCustom.description.trim(),
          prompt,
          promptModules,
          customPromptModules,
          negative: currentEditingCustom.negative?.trim() || '',
          color: currentEditingCustom.color || '#10b981',
          tags: currentEditingCustom.tags,
          thumbnailFile,
          thumbnailUrl,
          thumbnailAssetId,
        });
      } else {
        // Save as a local override copy. For built-in prompts this creates a
        // custom item with the same id that shadows the static library entry.
        const description = currentEditingCustom.description.trim();
        const saved: CustomPrompt = {
          ...currentEditingCustom,
          name,
          enName: name,
          description,
          enDescription: description,
          prompt,
          promptModules,
          customPromptModules,
          negative: currentEditingCustom.negative?.trim() || '',
          color: currentEditingCustom.color || '#10b981',
          thumbnailFile,
          thumbnailUrl,
          thumbnailAssetId,
          custom: true,
        };
        saveCustomPrompt(saved);
      }
      // Do not close the editor until the queued Bridge write has completed.
      // This prevents a fast refresh/restart from racing the thumbnail
      // replacement metadata out of the host JSON file.
      await queuePromptLibrarySync();
      setCustomVersion((v) => v + 1);
      closeEditor();
    } catch (saveFailure) {
      setCustomSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : t('library.editor.saveMediaFailed', '媒体未保存，请检查本机 Bridge 和主机磁盘后重试。'),
      );
    } finally {
      setSavingCustom(false);
    }
  };

  const removeCustom = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    deleteCustomPrompt(pendingDeleteId);
    if (selectedId === pendingDeleteId) setSelectedId(null);
    setCustomVersion((v) => v + 1);
    setPendingDeleteId(null);
  };

  const pendingDeleteName = useMemo(
    () => library?.items.find((i) => i.id === pendingDeleteId)?.name || '',
    [library, pendingDeleteId],
  );

  const updateEditingField = <K extends keyof CustomPrompt>(key: K, value: CustomPrompt[K]) => {
    setEditingCustom((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const toggleEditingModule = (key: StylePromptModuleKey) => {
    setEditingCustom((current) => {
      if (!current) return current;
      const promptModules = { ...current.promptModules };
      if (Object.prototype.hasOwnProperty.call(promptModules, key)) {
        delete promptModules[key];
      } else {
        promptModules[key] = '';
      }
      return { ...current, promptModules };
    });
  };

  const updateEditingModule = (key: StylePromptModuleKey, value: string) => {
    setEditingCustom((current) =>
      current
        ? {
            ...current,
            promptModules: { ...current.promptModules, [key]: value },
          }
        : current,
    );
  };

  const addEditingCustomModule = () => {
    const module: CustomPromptModule = {
      id: `module_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: '',
      value: '',
      group: 'control',
      target: 'both',
    };
    setEditingCustom((current) =>
      current
        ? {
            ...current,
            customPromptModules: [...(current.customPromptModules ?? []), module],
          }
        : current,
    );
  };

  const updateEditingCustomModule = (id: string, field: 'name' | 'value', value: string) => {
    setEditingCustom((current) =>
      current
        ? {
            ...current,
            customPromptModules: (current.customPromptModules ?? []).map((module) =>
              module.id === id ? { ...module, [field]: value } : module,
            ),
          }
        : current,
    );
  };

  const removeEditingCustomModule = (id: string) => {
    setEditingCustom((current) =>
      current
        ? {
            ...current,
            customPromptModules: (current.customPromptModules ?? []).filter(
              (module) => module.id !== id,
            ),
          }
        : current,
    );
  };

  const applyCustomItem = (item: CustomPrompt) => {
    const applicableModuleKeys = styleModuleEntries(item, moduleTaskType).map((entry) => entry.key);
    const customComposed = composeStylePrompt(item, applicableModuleKeys, moduleTaskType);
    const target =
      taskType === 'video'
        ? 'video'
        : taskType === 'script'
          ? 'script'
          : item.target === 'video'
            ? 'video'
            : 'image';
    applyPromptPreset({
      id: item.id,
      title: item.name,
      prompt: customComposed.prompt,
      tags: item.tags,
      moduleCount: applicableModuleKeys.length,
      target,
      position: currentCanvasNodePosition(),
    });
  };

  const editingModuleKeys = editingCustom
    ? STYLE_PROMPT_MODULES.map((module) => module.key).filter((key) =>
        Object.prototype.hasOwnProperty.call(editingCustom.promptModules ?? {}, key),
      )
    : [];

  return (
    <Modal
      open={openModal === 'prompt-library'}
      onClose={closeModal}
      title={t('library.prompt.title', '提示词库')}
      width="w-[min(1600px,calc(100vw-2rem))]"
      maxHeightClass="max-h-[calc(100dvh-2rem)]"
      headerActions={
        <div className="flex items-center gap-1">
          <LibraryTransferActions
            kind="prompt"
            items={(library?.items ?? []).map((item) => ({
              id: item.id,
              title: language === 'en' ? item.enName || item.name : item.name,
              data: { ...item, thumbnailUrl: getPromptThumbnailUrl(item) || undefined },
            }))}
            categories={[
              ...customCategories,
              ...new Set((library?.items ?? []).map((item) => item.category)),
            ]}
            projectId={activeProjectId}
            onImported={() => setCustomVersion((current) => current + 1)}
          />
          <div className="relative">
            <button
              data-prompt-sort-trigger="true"
              type="button"
              onClick={() => setSortOpen((current) => !current)}
              aria-label={t('library.prompt.sort', '排序')}
              title={t('library.prompt.sort', '排序')}
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
                {PROMPT_SORT_OPTIONS.map((option) => (
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
                      `library.prompt.sort.${option}`,
                      option === 'recommended'
                        ? '推荐排序'
                        : option === 'recent'
                          ? '最新新增'
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
      <div className="relative flex h-[min(750px,calc(100dvh-2rem))] flex-col">
        {/* Delete confirmation overlay */}
        {pendingDeleteId && (
          <div
            data-theme-role="modal-backdrop"
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div
              data-theme-role="modal-surface"
              className="w-80 rounded-xl border border-white/[0.06] bg-[#1e1e21] p-4 shadow-2xl"
            >
              <p className="text-sm font-medium text-white/90">
                {t('library.prompt.deleteTitle', '删除提示词')}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {t(
                  'library.prompt.deleteConfirm',
                  '确定删除「{name}」？此操作只影响本机提示词库。',
                  { name: pendingDeleteName },
                )}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(null)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30"
                >
                  {t('common.delete', '删除')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar: search + task/script tabs + 新增 */}
        <div
          data-theme-role="library-filterbar"
          className="flex flex-nowrap items-center gap-2 border-b border-white/[0.06] px-5 py-3"
        >
          <div className="relative min-w-[140px] flex-1 shrink">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isScriptMode
                  ? t('library.prompt.searchMine', '搜索我的提示词')
                  : t('library.prompt.search', '搜索提示词名称、描述或标签')
              }
              className="h-8 min-w-0 w-full rounded-lg border border-white/[0.06] bg-white/5 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div
              data-theme-role="segmented-control"
              className="flex shrink-0 overflow-hidden rounded-lg border border-white/[0.06] text-[12px]"
            >
              {TASK_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  data-theme-role="segmented-item"
                  data-active={taskType === tab.key ? 'true' : 'false'}
                  onClick={() => {
                    setTaskType(tab.key);
                    setSelectedId(null);
                    setActiveCategory(ALL_CAT);
                    closeEditor();
                  }}
                  className={`px-2 py-1.5 transition-colors ${
                    taskType === tab.key
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  {t(
                    `library.prompt.task.${tab.key}`,
                    tab.key === 'all'
                      ? '全部'
                      : tab.key === 'image'
                        ? '图片'
                        : tab.key === 'video'
                          ? '视频'
                          : '我的提示词',
                  )}
                </button>
              ))}
            </div>
            <button
              data-theme-role="primary-action"
              type="button"
              onClick={startCreate}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1.5 text-[12px] font-medium text-emerald-200 hover:bg-emerald-500/30"
              title={t(
                'library.prompt.createHint',
                '新建自定义提示词（脚本 tab 可在全部/图片/视频 tab 看到）',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('common.create', '新建')}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Category sidebar (hidden in 剧本 mode) */}
          {!isScriptMode && (
            <div
              data-theme-role="library-sidebar"
              className="w-36 shrink-0 overflow-y-auto border-r border-white/[0.06] p-2"
            >
              <button
                type="button"
                data-theme-role="library-category"
                data-active={activeCategory === ALL_CAT ? 'true' : 'false'}
                onClick={() => setActiveCategory(ALL_CAT)}
                className={`mb-0.5 block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                  activeCategory === ALL_CAT
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {t('common.all', '全部')}
              </button>
              {categoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-theme-role="library-category"
                  data-active={activeCategory === option.value ? 'true' : 'false'}
                  onClick={() => setActiveCategory(option.value)}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                    activeCategory === option.value
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          <div ref={gridRef} className="relative flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex h-40 flex-col items-center justify-center text-xs text-white/30">
                {t('library.prompt.loading', '加载提示词库中…')}
              </div>
            )}
            {error && (
              <div className="flex h-40 flex-col items-center justify-center text-xs text-rose-300">
                {t('library.prompt.loadFailed', '加载失败：{error}', { error })}
              </div>
            )}
            {!loading && !error && (
              <>
                {isScriptMode && filtered.length === 0 && !editingCustom && (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-white/30">
                    <p>{t('library.prompt.emptyCustom', '还没有自定义提示词')}</p>
                    <button
                      type="button"
                      onClick={startCreate}
                      className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-emerald-200 hover:bg-emerald-500/30"
                    >
                      {t('library.prompt.addOne', '新增一条')}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {filtered.map((item) => {
                    const availableModuleKeys = new Set(
                      styleModuleEntries(item, moduleTaskType).map((entry) => entry.key),
                    );
                    const hasSelected = (selectedModules[item.id] || []).some((key) =>
                      availableModuleKeys.has(key),
                    );
                    const cardThumbnailUrl = getPromptThumbnailUrl(item);
                    return (
                      <div
                        key={item.id}
                        data-theme-role="library-card"
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-[#1e1e21] text-left transition-all hover:border-white/20 ${
                          hasSelected ? 'border-emerald-400/60' : 'border-white/[0.06]'
                        }`}
                      >
                        <div
                          data-theme-role="library-preview"
                          className="relative aspect-[4/3] overflow-hidden bg-[#131315]"
                        >
                          <div
                            data-prompt-card-preview-trigger="true"
                            role="button"
                            tabIndex={0}
                            aria-label={
                              item.custom || language === 'zh-CN'
                                ? item.name
                                : item.enName || item.name
                            }
                            onClick={() => openStyle(item)}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return;
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              openStyle(item);
                            }}
                            className="absolute inset-0 overflow-hidden bg-[#131315]"
                          >
                            {cardThumbnailUrl ? (
                              <img
                                src={cardThumbnailUrl}
                                alt={item.name}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                                <Quote className="h-8 w-8 text-white/10" />
                              </div>
                            )}
                            <span
                              className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white/70"
                              style={{ boxShadow: `inset 0 0 0 1px ${item.color || '#ffffff20'}` }}
                            >
                              {item.target === 'both'
                                ? t('library.prompt.target.bothShort', '图/视频')
                                : item.target === 'image'
                                  ? t('library.prompt.target.image', '图片')
                                  : t('library.prompt.target.video', '视频')}
                            </span>
                            {hasSelected && (
                              <span className="absolute bottom-2 right-2 rounded bg-emerald-500/85 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm">
                                {t('library.prompt.selected', '已选')}
                              </span>
                            )}
                            {!isScriptMode && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(item.id);
                                }}
                                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/60 opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 ${favorites.has(item.id) ? 'fill-rose-400 text-rose-400' : ''}`}
                                />
                              </button>
                            )}
                          </div>
                          {cardThumbnailUrl && (
                            <button
                              type="button"
                              aria-label={t('library.prompt.fullscreenPreview', '全屏预览')}
                              title={t('library.prompt.fullscreenPreview', '全屏预览')}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPromptImagePreview({ url: cardThumbnailUrl, title: item.name });
                              }}
                              className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white/75 opacity-0 shadow-lg transition-opacity hover:bg-black/75 hover:text-white group-hover:opacity-100"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-2.5">
                          <div className="flex items-start justify-between gap-1">
                            <p className="min-w-0 flex-1 truncate text-xs font-medium text-white/90">
                              {item.custom || language === 'zh-CN'
                                ? item.name
                                : item.enName || item.name}
                            </p>
                            {isScriptMode && item.custom && (
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => startEdit(item as CustomPrompt)}
                                  className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white"
                                  title={t('common.edit', '编辑')}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeCustom(item.id)}
                                  className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                                  title={t('common.delete', '删除')}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-white/40">
                            {item.custom || language === 'zh-CN'
                              ? item.description
                              : item.enDescription || item.description}
                          </p>
                          {item.author && (
                            <p className="mt-1 truncate text-[12px] text-white/35">{item.author}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-white/50"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {hasSelected && (
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-emerald-300/90">
                              {t('library.prompt.selectedModules', '已选：')}
                              {(selectedModules[item.id] || [])
                                .map((key) => {
                                  const entry = styleModuleEntries(item, moduleTaskType).find(
                                    (candidate) => candidate.key === key,
                                  );
                                  return language === 'zh-CN' ? entry?.zh : entry?.en;
                                })
                                .filter(Boolean)
                                .join('、')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Centered detail / module editor */}
            {selectedStyle && (
              <div
                data-theme-role="modal-backdrop"
                className="fixed inset-0 z-[290] flex items-center justify-center p-4"
              >
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                  onClick={() => setSelectedId(null)}
                />
                <section
                  data-theme-role="modal-surface"
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    selectedStyle.custom || language === 'zh-CN'
                      ? selectedStyle.name
                      : selectedStyle.enName || selectedStyle.name
                  }
                  className="relative flex h-[min(800px,calc(100dvh-2rem))] w-[min(620px,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] shadow-2xl"
                >
                  <header
                    data-theme-role="modal-titlebar"
                    className="flex items-start gap-3 border-b border-white/[0.06] p-3"
                  >
                    <div
                      data-theme-role="library-preview"
                      className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#131315]"
                    >
                      {selectedThumbnailUrl ? (
                        <img
                          src={selectedThumbnailUrl}
                          alt={selectedStyle.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Quote className="h-5 w-5 text-white/10" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-[12px] text-white/35">
                        {t('library.prompt.detailTitle', '提示词详情')}
                      </p>
                      <p className="truncate text-sm font-medium text-white/90">
                        {selectedStyle.custom || language === 'zh-CN'
                          ? selectedStyle.name
                          : selectedStyle.enName || selectedStyle.name}
                      </p>
                      <p className="truncate text-[12px] text-white/40">
                        {selectedStyle.custom
                          ? ''
                          : language === 'zh-CN'
                            ? selectedStyle.enName
                            : selectedStyle.name}
                      </p>
                      {selectedStyle.author && (
                        <p className="truncate text-[12px] text-white/40">{selectedStyle.author}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEdit(selectedStyle)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
                        title={t('common.edit', '编辑')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {selectedStyle.custom && (
                        <button
                          type="button"
                          onClick={() => removeCustom(selectedStyle.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                          title={t('common.delete', '删除')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </header>

                  <div
                    ref={detailRef}
                    data-theme-role="modal-content"
                    className="flex-1 overflow-y-auto p-3"
                  >
                    <p className="text-[12px] leading-relaxed text-white/50">
                      {selectedStyle.custom || language === 'zh-CN'
                        ? selectedStyle.description
                        : selectedStyle.enDescription || selectedStyle.description}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-white/70">
                        {t('library.prompt.selectModules', '选择提示词模块')}
                      </span>
                      <button
                        type="button"
                        onClick={toggleAllModules}
                        className="rounded bg-white/5 px-2 py-0.5 text-[12px] text-white/60 hover:bg-white/10"
                      >
                        {t('common.all', '全部')}
                      </button>
                    </div>

                    <div className="mt-2 space-y-3">
                      {(Object.keys(groupedEntries) as ModuleGroup[]).map((group) => {
                        const entries = groupedEntries[group];
                        if (!entries.length) return null;
                        return (
                          <div key={group}>
                            <p className="mb-1 text-[12px] uppercase tracking-wide text-white/30">
                              {t(
                                `library.prompt.moduleGroup.${group}`,
                                language === 'zh-CN'
                                  ? MODULE_GROUP_LABELS[group].zh
                                  : MODULE_GROUP_LABELS[group].en,
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {entries.map((e) => {
                                const checked = checkedForSelected.includes(e.key);
                                return (
                                  <button
                                    key={e.key}
                                    type="button"
                                    onClick={() => toggleModule(e.key)}
                                    title={e.value}
                                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] transition-colors ${
                                      checked
                                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                                        : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/20'
                                    }`}
                                  >
                                    {checked ? <Check className="h-3 w-3" /> : null}
                                    {t(
                                      `library.prompt.module.${e.key}`,
                                      language === 'zh-CN' ? e.zh : e.en,
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {selectedStyle.negative?.trim() && (
                      <div className="mt-3">
                        <p className="mb-1 text-[12px] uppercase tracking-wide text-white/30">
                          {t('library.prompt.negative', '负面约束')}
                        </p>
                        <p className="rounded-lg bg-rose-500/[0.06] px-2.5 py-1.5 text-[12px] leading-relaxed text-rose-200/70">
                          {selectedStyle.negative}
                        </p>
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="mb-1 text-[12px] uppercase tracking-wide text-white/30">
                        {t('library.prompt.composedPreview', '组合结果预览')}
                      </p>
                      <textarea
                        readOnly
                        value={composed.prompt}
                        className="h-40 w-full resize-none rounded-lg border border-white/[0.06] bg-black/30 p-2.5 text-[12px] leading-relaxed text-white/60 focus:outline-none"
                      />
                    </div>
                  </div>

                  <footer className="border-t border-white/[0.06] p-3">
                    <button
                      data-theme-role="primary-action"
                      type="button"
                      onClick={handleApply}
                      disabled={!composed.prompt.trim()}
                      className="w-full rounded-lg bg-emerald-500/20 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      {modalNodeId
                        ? t('common.apply', '应用')
                        : t('library.addToCanvas', '添加到画布')}
                    </button>
                  </footer>
                </section>
              </div>
            )}

            {/* Centered custom prompt editor (shows on any tab when editing) */}
            {editingCustom && (
              <div
                data-theme-role="modal-backdrop"
                className="fixed inset-0 z-[300] flex items-center justify-center p-4"
              >
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
                  onClick={closeEditor}
                />
                <section
                  data-theme-role="modal-surface"
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    isCreating
                      ? t('library.prompt.addTitle', '新增提示词')
                      : t('library.prompt.editTitle', '编辑提示词')
                  }
                  className="relative flex h-[min(800px,calc(100dvh-2rem))] w-[min(620px,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] shadow-2xl"
                >
                  <header
                    data-theme-role="modal-titlebar"
                    className="flex items-center justify-between border-b border-white/[0.06] p-3"
                  >
                    <p className="text-sm font-medium text-white/90">
                      {isCreating
                        ? t('library.prompt.addTitle', '新增提示词')
                        : t('library.prompt.editTitle', '编辑提示词')}
                    </p>
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </header>

                  <div
                    data-theme-role="modal-content"
                    className="flex-1 space-y-3 overflow-y-auto p-4"
                  >
                    <div className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.editor.thumbnail', '缩略图')}
                      </span>
                      <div
                        data-prompt-thumbnail-upload="true"
                        data-theme-role="library-preview"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              '[data-prompt-thumbnail-canvas-picker]',
                            )
                          ) {
                            return;
                          }
                          if (editingThumbnailUrl) {
                            setThumbnailCropSource(editingThumbnailUrl);
                          } else {
                            thumbnailInputRef.current?.click();
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              '[data-prompt-thumbnail-canvas-picker]',
                            )
                          ) {
                            return;
                          }
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          if (editingThumbnailUrl) {
                            setThumbnailCropSource(editingThumbnailUrl);
                          } else {
                            thumbnailInputRef.current?.click();
                          }
                        }}
                        className="relative flex aspect-[4/3] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-white/45 hover:border-white/30 hover:text-white/75"
                      >
                        <button
                          type="button"
                          data-prompt-thumbnail-canvas-picker="true"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setThumbnailCanvasPickerOpen(true);
                          }}
                          title={t('library.editor.selectFromCanvas', '从当前画布节点选择图片')}
                          aria-label={t(
                            'library.editor.selectFromCanvas',
                            '从当前画布节点选择图片',
                          )}
                          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white/60 hover:bg-emerald-500/75 hover:text-white"
                        >
                          <ImagePlus className="h-4 w-4" />
                        </button>
                        {editingThumbnailUrl ? (
                          <img
                            src={editingThumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex items-center gap-2 text-xs">
                            <ImagePlus className="h-4 w-4" />
                            {t('library.editor.uploadPreview', '上传图片')}
                          </span>
                        )}
                        {editingThumbnailUrl && (
                          <span className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 text-[11px] text-white/80">
                            {t('library.editor.cropHint', '点击重新裁剪')}
                          </span>
                        )}
                      </div>
                      <input
                        ref={thumbnailInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          try {
                            setThumbnailCropSource(await readImageFile(file));
                          } catch {
                            // Keep the existing thumbnail when the image cannot be decoded.
                          }
                          event.target.value = '';
                        }}
                      />
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.editor.requiredName', '名称 *')}
                      </span>
                      <input
                        type="text"
                        value={editingCustom.name}
                        onChange={(e) => updateEditingField('name', e.target.value)}
                        placeholder={t('library.prompt.namePlaceholder', '提示词名称')}
                        className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/5 px-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="block">
                        <span className="mb-1 block text-[11px] text-white/60">
                          {t('library.editor.category', '分类')}
                        </span>
                        <div className="flex gap-1.5">
                          <SimpleSelect
                            value={editingCustom.category}
                            onChange={(v) => updateEditingField('category', v)}
                            options={categoryOptions}
                            className="min-w-0 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => setCategoryManagerOpen((current) => !current)}
                            aria-expanded={categoryManagerOpen}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition-colors ${
                              categoryManagerOpen
                                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                                : 'border-white/[0.06] bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                            }`}
                          >
                            <FolderCog className="h-3.5 w-3.5" />
                            {t('common.manage', '管理')}
                          </button>
                        </div>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-white/60">
                          {t('library.prompt.targetType', '适用类型')}
                        </span>
                        <SimpleSelect
                          value={editingCustom.target}
                          onChange={(v) => updateEditingField('target', v as PromptTarget)}
                          options={[
                            {
                              value: 'image',
                              label: t('library.prompt.target.image', '图片'),
                            },
                            {
                              value: 'video',
                              label: t('library.prompt.target.video', '视频'),
                            },
                            {
                              value: 'both',
                              label: t('library.prompt.target.both', '通用'),
                            },
                          ]}
                        />
                      </label>
                      <div className="col-span-2">
                        <CategoryManagerPanel
                          open={categoryManagerOpen}
                          label={t('library.editor.category', '分类')}
                          hint={t(
                            'library.prompt.categoryManagerHint',
                            '分类调整会同步影响使用该分类的其他提示词',
                          )}
                          categories={categoryOptions.map((option) => option.value)}
                          categoryLabels={Object.fromEntries(
                            categoryOptions.map((option) => [option.value, option.label]),
                          )}
                          fallbackCategory={PROMPT_UNCATEGORIZED}
                          selected={editingCustom.category}
                          onSelect={(value) => updateEditingField('category', value)}
                          onAdd={(value) => {
                            if (!addPromptCustomCategory(value)) return;
                            setCustomCategories(loadPromptCustomCategories());
                            setCustomVersion((version) => version + 1);
                          }}
                          onRename={(from, value) => {
                            if (!renamePromptCategory(from, value)) return;
                            if (activeCategory === from) setActiveCategory(value);
                            setEditingCustom((current) =>
                              current
                                ? {
                                    ...current,
                                    category: current.category === from ? value : current.category,
                                    tags: current.tags.map((tag) => (tag === from ? value : tag)),
                                  }
                                : current,
                            );
                            setCustomCategories(loadPromptCustomCategories());
                            setCustomVersion((version) => version + 1);
                          }}
                          onDelete={(value) => {
                            if (!deletePromptCategory(value)) return;
                            if (activeCategory === value) {
                              setActiveCategory(PROMPT_UNCATEGORIZED);
                            }
                            setEditingCustom((current) =>
                              current && current.category === value
                                ? {
                                    ...current,
                                    category: PROMPT_UNCATEGORIZED,
                                    tags: current.tags.map((tag) =>
                                      tag === value ? '未分类' : tag,
                                    ),
                                  }
                                : current,
                            );
                            setCustomCategories(loadPromptCustomCategories());
                            setCustomVersion((version) => version + 1);
                          }}
                        />
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.prompt.tags', '标签（逗号分隔）')}
                      </span>
                      <input
                        type="text"
                        value={editingCustom.tags.join(', ')}
                        onChange={(e) =>
                          updateEditingField(
                            'tags',
                            e.target.value
                              .split(/[,，]/)
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder={t('library.prompt.tagsPlaceholder', '例如：水墨, 古风, 战斗')}
                        className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/5 px-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.prompt.description', '描述')}
                      </span>
                      <input
                        type="text"
                        value={editingCustom.description}
                        onChange={(e) => updateEditingField('description', e.target.value)}
                        placeholder={t(
                          'library.prompt.descriptionPlaceholder',
                          '简短描述这条提示词的用途',
                        )}
                        className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/5 px-3 text-xs text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                      />
                    </label>

                    <div
                      data-prompt-module-editor="true"
                      className="rounded-xl border border-white/[0.06] bg-black/10 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="block text-[11px] font-medium text-white/70">
                          {t('library.prompt.modulesEditor', '提示词模块（可选）')}
                        </span>
                        <button
                          type="button"
                          data-add-custom-prompt-module="true"
                          onClick={addEditingCustomModule}
                          className="flex h-7 items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 text-[11px] text-emerald-300 transition-colors hover:border-emerald-300/40 hover:bg-emerald-500/15"
                        >
                          <Plus className="h-3 w-3" />
                          {t('library.prompt.addCustomModule', '新增模块')}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                        {t(
                          'library.prompt.modulesEditorHint',
                          '选择模块并分别填写内容，保存后可像内置提示词一样自由组合。',
                        )}
                      </p>

                      <div className="mt-3 space-y-3">
                        {(Object.keys(MODULE_GROUP_LABELS) as ModuleGroup[]).map((group) => {
                          const modules = STYLE_PROMPT_MODULES.filter(
                            (module) => module.group === group,
                          );
                          return (
                            <div key={group}>
                              <p className="mb-1 text-[11px] uppercase tracking-wide text-white/30">
                                {t(
                                  `library.prompt.moduleGroup.${group}`,
                                  language === 'zh-CN'
                                    ? MODULE_GROUP_LABELS[group].zh
                                    : MODULE_GROUP_LABELS[group].en,
                                )}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {modules.map((module) => {
                                  const active = editingModuleKeys.includes(module.key);
                                  return (
                                    <button
                                      key={module.key}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() => toggleEditingModule(module.key)}
                                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                                        active
                                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                                          : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/20'
                                      }`}
                                    >
                                      {active ? <Check className="h-3 w-3" /> : null}
                                      {t(
                                        `library.prompt.module.${module.key}`,
                                        language === 'zh-CN' ? module.zh : module.en,
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {(editingCustom.customPromptModules ?? []).length > 0 && (
                        <div
                          data-custom-prompt-modules="true"
                          className="mt-3 space-y-2 border-t border-white/[0.06] pt-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-white/30">
                            {t('library.prompt.customModules', '自定义模块')}
                          </p>
                          {(editingCustom.customPromptModules ?? []).map((module) => (
                            <div
                              key={module.id}
                              className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={module.name}
                                  onChange={(event) =>
                                    updateEditingCustomModule(module.id, 'name', event.target.value)
                                  }
                                  placeholder={t(
                                    'library.prompt.customModuleNamePlaceholder',
                                    '模块名称，例如：构图设计',
                                  )}
                                  aria-label={t(
                                    'library.prompt.customModuleName',
                                    '自定义模块名称',
                                  )}
                                  className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-white/5 px-2.5 text-[11px] text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeEditingCustomModule(module.id)}
                                  aria-label={t(
                                    'library.prompt.removeCustomModule',
                                    '删除自定义模块',
                                  )}
                                  title={t('library.prompt.removeCustomModule', '删除自定义模块')}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <textarea
                                value={module.value}
                                onChange={(event) =>
                                  updateEditingCustomModule(module.id, 'value', event.target.value)
                                }
                                placeholder={t(
                                  'library.prompt.customModuleValuePlaceholder',
                                  '输入这个模块的提示词内容',
                                )}
                                aria-label={t(
                                  'library.prompt.customModuleValue',
                                  '自定义模块提示词内容',
                                )}
                                className="mt-2 h-20 w-full resize-y rounded-lg border border-white/[0.06] bg-white/5 p-2.5 text-[11px] leading-relaxed text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {editingModuleKeys.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                          {editingModuleKeys.map((key) => {
                            const module = STYLE_PROMPT_MODULES.find(
                              (candidate) => candidate.key === key,
                            );
                            if (!module) return null;
                            return (
                              <label key={key} className="block">
                                <span className="mb-1 block text-[11px] text-white/55">
                                  {t(
                                    `library.prompt.module.${module.key}`,
                                    language === 'zh-CN' ? module.zh : module.en,
                                  )}
                                </span>
                                <textarea
                                  value={editingCustom.promptModules?.[key] ?? ''}
                                  onChange={(event) => updateEditingModule(key, event.target.value)}
                                  placeholder={t(
                                    'library.prompt.moduleValuePlaceholder',
                                    '输入该模块的提示词内容',
                                  )}
                                  className="h-20 w-full resize-y rounded-lg border border-white/[0.06] bg-white/5 p-2.5 text-[11px] leading-relaxed text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.prompt.fullPrompt', '完整提示词 *')}
                      </span>
                      <textarea
                        value={editingCustom.prompt}
                        onChange={(e) => updateEditingField('prompt', e.target.value)}
                        placeholder={t('library.prompt.promptPlaceholder', '输入完整提示词内容')}
                        className="h-32 w-full resize-none rounded-lg border border-white/[0.06] bg-white/5 p-2.5 text-[11px] leading-relaxed text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                      />
                      <span className="mt-1 block text-[11px] text-white/30">
                        {t(
                          'library.prompt.contentRequirement',
                          '完整提示词用于未选择模块及其他入口；模块内容可在详情中自由组合。',
                        )}
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.prompt.negative', '负面约束')}
                      </span>
                      <textarea
                        value={editingCustom.negative || ''}
                        onChange={(e) => updateEditingField('negative', e.target.value)}
                        placeholder={t(
                          'library.prompt.negativePlaceholder',
                          '可选：不想出现的内容',
                        )}
                        className="h-20 w-full resize-none rounded-lg border border-white/[0.06] bg-white/5 p-2.5 text-[11px] leading-relaxed text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] text-white/60">
                        {t('library.prompt.themeColor', '主题色')}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editingCustom.color || '#10b981'}
                          onChange={(e) => updateEditingField('color', e.target.value)}
                          className="h-8 w-8 rounded border-0 bg-transparent p-0"
                        />
                        <span className="text-[11px] text-white/40">
                          {editingCustom.color || '#10b981'}
                        </span>
                      </div>
                    </label>
                  </div>

                  <footer className="flex items-center gap-2 border-t border-white/[0.06] p-3">
                    {customSaveError && (
                      <span className="max-w-64 text-xs leading-4 text-rose-300">
                        {customSaveError}
                      </span>
                    )}
                    {!isCreating && editingCustom && (
                      <button
                        type="button"
                        onClick={() => applyCustomItem(editingCustom)}
                        className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                      >
                        {t('common.apply', '应用')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                    >
                      {t('common.cancel', '取消')}
                    </button>
                    <button
                      data-theme-role="primary-action"
                      type="button"
                      onClick={() => void saveCustom()}
                      disabled={
                        savingCustom || !editingCustom.name.trim() || !editingCustom.prompt.trim()
                      }
                      className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingCustom
                        ? t('library.editor.saving', '保存中…')
                        : t('common.save', '保存')}
                    </button>
                  </footer>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
      {thumbnailCanvasPickerOpen && editingCustom && (
        <CanvasImagePickerDialog
          options={canvasImages}
          onClose={() => setThumbnailCanvasPickerOpen(false)}
          onSelect={(option) => void chooseCanvasThumbnail(option)}
        />
      )}
      {thumbnailCropSource && editingCustom && (
        <ThumbnailCropDialog
          source={thumbnailCropSource}
          aspect="4/3"
          onCancel={() => setThumbnailCropSource(null)}
          onReplace={() => thumbnailInputRef.current?.click()}
          onComplete={(thumbnail) => {
            setEditingCustom((current) => {
              const next = current
                ? { ...current, thumbnailFile: thumbnail, thumbnailUrl: undefined }
                : current;
              editingCustomRef.current = next;
              return next;
            });
            setThumbnailCropSource(null);
          }}
        />
      )}
      {promptImagePreview && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={promptImagePreview.title}
          onClick={() => setPromptImagePreview(null)}
        >
          <img
            src={promptImagePreview.url}
            alt={promptImagePreview.title}
            className="h-full w-full rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            aria-label={t('common.close', '关闭')}
            title={t('common.close', '关闭')}
            onClick={() => setPromptImagePreview(null)}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/75 hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </Modal>
  );
}
