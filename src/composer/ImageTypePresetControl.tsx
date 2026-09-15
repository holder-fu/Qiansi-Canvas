import {
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  Download,
  LayoutTemplate,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppTranslation } from '../i18n/appI18n';
import { toggleImageTypeSelection } from '../lib/imageGeneration';
import { useCanvasStore } from '../store/canvasStore';
import {
  addImageTypeCategory,
  createImageTypePresetId,
  deleteImageTypeCategory,
  imageTypeCategoryColumns,
  loadImageTypePresetCatalog,
  mergeImageTypePresetCatalog,
  parseImageTypePresetCatalogDocument,
  renameImageTypeCategory,
  restoreBuiltInImageTypePresetCatalog,
  saveImageTypePresetCatalog,
  serializeImageTypePresetCatalog,
  subscribeImageTypePresetCatalog,
  type ImageTypePreset,
  type ImageTypePresetCatalog,
} from '../lib/imageTypePresets';
import { useComposer } from './ComposerContext';

type Translate = ReturnType<typeof useAppTranslation>['t'];

const CATEGORY_COPY: Record<string, { key: string; fallback: string }> = {
  分镜叙事: { key: 'imageType.category.storyboard', fallback: '分镜叙事' },
  质感调节: { key: 'imageType.category.texture', fallback: '质感调节' },
  人物表情: { key: 'imageType.category.expressions', fallback: '人物表情' },
  空间与机位: { key: 'imageType.category.camera', fallback: '空间与机位' },
  设定图: { key: 'imageType.category.design', fallback: '设定图' },
};

const BUILT_IN_PRESET_COPY: Record<
  string,
  { nameKey: string; descriptionKey: string; name: string; description: string }
> = {
  '25宫格连贯分镜': {
    nameKey: 'imageType.preset.storyboard25.name',
    descriptionKey: 'imageType.preset.storyboard25.description',
    name: '25宫格连贯分镜',
    description: '按时间顺序生成连续动作分镜，保持人物与场景一致。',
  },
  剧情推演四宫格: {
    nameKey: 'imageType.preset.storyFour.name',
    descriptionKey: 'imageType.preset.storyFour.description',
    name: '剧情推演四宫格',
    description: '用建立、发展、转折、结果四个画面推演同一段剧情。',
  },
  '画面推演 - 3秒后': {
    nameKey: 'imageType.preset.forward3.name',
    descriptionKey: 'imageType.preset.forward3.description',
    name: '画面推演 - 3秒后',
    description: '保持角色与机位一致，推演当前画面约 3 秒后的状态。',
  },
  '画面推演 - 5秒前': {
    nameKey: 'imageType.preset.backward5.name',
    descriptionKey: 'imageType.preset.backward5.description',
    name: '画面推演 - 5秒前',
    description: '保持角色与机位一致，反推当前画面约 5 秒前的状态。',
  },
  人像质感调节: {
    nameKey: 'imageType.preset.portraitTexture.name',
    descriptionKey: 'imageType.preset.portraitTexture.description',
    name: '人像质感调节',
    description: '保留身份和构图，优化皮肤、光影与色彩层次。',
  },
  电影级光影校正: {
    nameKey: 'imageType.preset.cinematicLight.name',
    descriptionKey: 'imageType.preset.cinematicLight.description',
    name: '电影级光影校正',
    description: '不改变画面内容，重建电影级主辅光与统一色调。',
  },
  '9宫人物表情': {
    nameKey: 'imageType.preset.characterExpressions9.name',
    descriptionKey: 'imageType.preset.characterExpressions9.description',
    name: '9宫人物表情',
    description: '白底九宫格，展示同一人物的九种不同面部表情。',
  },
  '9宫格人物表情挤眼弄眉': {
    nameKey: 'imageType.preset.expressivePortraits9.name',
    descriptionKey: 'imageType.preset.expressivePortraits9.description',
    name: '9宫格人物表情挤眼弄眉',
    description: '白底写真九宫格，突出挤眼、挑眉等细腻小情绪。',
  },
  '720全景': {
    nameKey: 'imageType.preset.panorama720.name',
    descriptionKey: 'imageType.preset.panorama720.description',
    name: '720全景',
    description: '展示完整空间结构、前中后景关系与可用机位。',
  },
  多机位九宫格: {
    nameKey: 'imageType.preset.multiCamera9.name',
    descriptionKey: 'imageType.preset.multiCamera9.description',
    name: '多机位九宫格',
    description: '为同一主体和场景生成九个不同机位参考。',
  },
  角色脸部三视图: {
    nameKey: 'imageType.preset.faceViews.name',
    descriptionKey: 'imageType.preset.faceViews.description',
    name: '角色脸部三视图',
    description: '生成正面、左侧面、右侧面，统一五官与发型。',
  },
  角色设定图: {
    nameKey: 'imageType.preset.characterSheet.name',
    descriptionKey: 'imageType.preset.characterSheet.description',
    name: '角色设定图',
    description: '集中展示角色外形、服装、配饰和材质细节。',
  },
  角色三视图: {
    nameKey: 'imageType.preset.characterViews.name',
    descriptionKey: 'imageType.preset.characterViews.description',
    name: '角色三视图',
    description: '生成全身正面、侧面、背面，统一比例与服装结构。',
  },
  场景设定图: {
    nameKey: 'imageType.preset.sceneSheet.name',
    descriptionKey: 'imageType.preset.sceneSheet.description',
    name: '场景设定图',
    description: '展示空间布局、尺度、材质、光线和叙事区域。',
  },
  产品设定图: {
    nameKey: 'imageType.preset.productSheet.name',
    descriptionKey: 'imageType.preset.productSheet.description',
    name: '产品设定图',
    description: '展示产品造型、结构、材质、颜色和功能细节。',
  },
};

function localizeCategory(category: string, t: Translate): string {
  const copy = CATEGORY_COPY[category];
  return copy ? t(copy.key, copy.fallback) : category;
}

function localizePresetName(preset: ImageTypePreset, t: Translate): string {
  const copy = preset.builtIn ? BUILT_IN_PRESET_COPY[preset.name] : undefined;
  return copy ? t(copy.nameKey, copy.name) : preset.name;
}

function localizePresetDescription(preset: ImageTypePreset, t: Translate): string {
  const copy = preset.builtIn ? BUILT_IN_PRESET_COPY[preset.name] : undefined;
  return copy ? t(copy.descriptionKey, copy.description) : preset.description;
}

function emptyPreset(categories: string[]): ImageTypePreset {
  return {
    id: createImageTypePresetId(),
    name: '',
    category: categories[0] ?? '分镜叙事',
    description: '',
    prompt: '',
    builtIn: false,
  };
}

export function ImageTypePresetControl() {
  const { t } = useAppTranslation();
  const { state, setParam, runtime } = useComposer();
  const updateNodeData = useCanvasStore((store) => store.updateNodeData);
  const selectedNode = useCanvasStore((store) =>
    runtime.primaryNodeId
      ? store.nodes.find((node) => node.id === runtime.primaryNodeId)
      : undefined,
  );
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(loadImageTypePresetCatalog);
  const [editor, setEditor] = useState<ImageTypePreset | null>(null);
  const [editorError, setEditorError] = useState('');
  const [categoryEditor, setCategoryEditor] = useState<{
    mode: 'create' | 'rename';
    value: string;
  } | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [categoryDeleteArmed, setCategoryDeleteArmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [transferError, setTransferError] = useState('');
  const controlRef = useRef<HTMLDivElement>(null);
  const transferFileRef = useRef<HTMLInputElement>(null);
  const { categories, presets } = catalog;
  const selectedValue =
    typeof state.params.imageType === 'string' ? state.params.imageType : undefined;
  const selectedPreset = presets.find((preset) => preset.name === selectedValue);
  const value = selectedPreset
    ? localizePresetName(selectedPreset, t)
    : t('imageType.trigger', '生成类型');

  useEffect(() => subscribeImageTypePresetCatalog(setCatalog), []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setEditor(null);
        setCategoryEditor(null);
        setCategoryError('');
        setCategoryDeleteArmed(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editor) {
        setEditor(null);
        setEditorError('');
        setDeleteArmed(false);
        setCategoryEditor(null);
        setCategoryError('');
        setCategoryDeleteArmed(false);
      } else {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [editor, open]);

  if (runtime.spec.type !== 'image') return null;

  const persistSelection = (preset?: ImageTypePreset) => {
    setParam('imageType', preset?.name);
    setParam('imageTypePrompt', preset?.prompt);
    if (!runtime.primaryNodeId) return;
    const composerParams =
      selectedNode?.data.composerParams && typeof selectedNode.data.composerParams === 'object'
        ? (selectedNode.data.composerParams as Record<string, unknown>)
        : {};
    const nextParams = { ...composerParams };
    if (preset) {
      nextParams.imageType = preset.name;
      nextParams.imageTypePrompt = preset.prompt;
    } else {
      delete nextParams.imageType;
      delete nextParams.imageTypePrompt;
    }
    updateNodeData(runtime.primaryNodeId, { composerParams: nextParams });
  };

  const persistCatalog = (next: ImageTypePresetCatalog) => {
    setCatalog(next);
    const saved = saveImageTypePresetCatalog(next);
    setNotice(
      saved
        ? t('imageType.notice.saved', '预设已保存到本机。')
        : t('imageType.notice.notPersisted', '本次修改已生效，但浏览器无法持久保存。'),
    );
  };

  const persistPresets = (next: ImageTypePreset[]) => {
    persistCatalog({ ...catalog, presets: next });
  };

  const exportCatalog = () => {
    const url = URL.createObjectURL(
      new Blob([serializeImageTypePresetCatalog(catalog)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `qiansi-image-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    setTransferError('');
    setNotice(t('imageType.transfer.exported', '提示词配置已导出。'));
  };

  const importCatalog = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error(t('imageType.transfer.tooLarge', '导入文件不能超过 2 MB。'));
      }
      const incoming = parseImageTypePresetCatalogDocument(JSON.parse(await file.text()));
      if (!incoming) {
        throw new Error(t('imageType.transfer.invalid', '文件不是有效的生成类型提示词配置。'));
      }
      const merged = mergeImageTypePresetCatalog(catalog, incoming);
      persistCatalog(merged.catalog);
      setTransferError('');
      setNotice(
        t('imageType.transfer.imported', '已导入 {count} 条，跳过 {skipped} 条重复内容。', {
          count: merged.importedCount,
          skipped: merged.skippedCount,
        }),
      );
    } catch (error) {
      setTransferError(
        error instanceof Error
          ? error.message
          : t('imageType.transfer.invalid', '文件不是有效的生成类型提示词配置。'),
      );
    }
  };

  const commitCategoryEditor = () => {
    if (!editor || !categoryEditor) return;
    const name = categoryEditor.value.trim();
    if (!name) {
      setCategoryError(t('imageType.category.required', '分类名称不能为空。'));
      return;
    }
    const next =
      categoryEditor.mode === 'create'
        ? addImageTypeCategory(catalog, name)
        : renameImageTypeCategory(catalog, editor.category, name);
    if (!next) {
      setCategoryError(t('imageType.category.duplicate', '已存在同名分类，请换一个名称。'));
      return;
    }
    persistCatalog(next);
    setEditor({ ...editor, category: name });
    setCategoryEditor(null);
    setCategoryError('');
    setCategoryDeleteArmed(false);
  };

  const deleteEditorCategory = () => {
    if (!editor) return;
    if (categories.length <= 1) {
      setCategoryError(t('imageType.category.keepOne', '至少需要保留一个分类。'));
      return;
    }
    if (!categoryDeleteArmed) {
      setCategoryDeleteArmed(true);
      setCategoryEditor(null);
      setCategoryError('');
      return;
    }
    const next = deleteImageTypeCategory(catalog, editor.category);
    if (!next) return;
    const fallbackCategory = next.categories[0] ?? '';
    persistCatalog(next);
    setEditor({ ...editor, category: fallbackCategory });
    setCategoryDeleteArmed(false);
    setCategoryError('');
  };

  const selectPreset = (preset: ImageTypePreset) => {
    const nextValue = toggleImageTypeSelection(selectedValue, preset.name);
    persistSelection(nextValue ? preset : undefined);
    setOpen(false);
  };

  const saveEditor = () => {
    if (!editor) return;
    const nextPreset: ImageTypePreset = {
      ...editor,
      name: editor.name.trim(),
      description: editor.description.trim(),
      prompt: editor.prompt.trim(),
    };
    if (!nextPreset.name || !nextPreset.description || !nextPreset.prompt) {
      setEditorError(t('imageType.error.required', '名称、用途说明和内置提示词都不能为空。'));
      return;
    }
    if (presets.some((preset) => preset.id !== nextPreset.id && preset.name === nextPreset.name)) {
      setEditorError(t('imageType.error.duplicate', '已存在同名生成类型，请换一个名称。'));
      return;
    }
    const previous = presets.find((preset) => preset.id === nextPreset.id);
    const next = previous
      ? presets.map((preset) => (preset.id === nextPreset.id ? nextPreset : preset))
      : [...presets, nextPreset];
    persistPresets(next);
    if (!previous || selectedValue === previous.name) persistSelection(nextPreset);
    setEditor(null);
    setEditorError('');
    setDeleteArmed(false);
    setCategoryEditor(null);
    setCategoryError('');
    setCategoryDeleteArmed(false);
  };

  const deleteEditorPreset = () => {
    if (!editor) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    persistPresets(presets.filter((preset) => preset.id !== editor.id));
    if (selectedValue === editor.name) persistSelection();
    setEditor(null);
    setEditorError('');
    setDeleteArmed(false);
    setCategoryEditor(null);
    setCategoryError('');
    setCategoryDeleteArmed(false);
  };

  const openEditor = (preset: ImageTypePreset) => {
    setEditor({ ...preset });
    setEditorError('');
    setDeleteArmed(false);
    setCategoryEditor(null);
    setCategoryError('');
    setCategoryDeleteArmed(false);
  };

  return (
    <div ref={controlRef} className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setEditor(null);
          setCategoryEditor(null);
          setCategoryError('');
          setCategoryDeleteArmed(false);
          setNotice('');
        }}
        className="flex max-w-[180px] items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white/90 focus-visible:border-white/25 focus-visible:outline-none"
        title={value}
      >
        <LayoutTemplate className="h-3 w-3 shrink-0 text-white/50" />
        <span className="truncate">{value}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role={editor ? 'dialog' : 'listbox'}
          aria-label={
            editor
              ? t('imageType.editor.editAria', '编辑生成类型')
              : t('imageType.selectAria', '选择生成类型')
          }
          className="absolute bottom-full left-0 z-30 mb-2 max-h-[420px] w-[560px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.12] bg-[#242424] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
        >
          {editor ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditor(null);
                    setCategoryEditor(null);
                    setCategoryError('');
                    setCategoryDeleteArmed(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('imageType.back', '返回')}
                </button>
                <span className="text-xs font-medium text-white/80">
                  {presets.some((preset) => preset.id === editor.id)
                    ? t('imageType.editor.editTitle', '编辑生成类型')
                    : t('imageType.editor.createTitle', '新增生成类型')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] text-white/45">
                  {t('imageType.editor.name', '名称')}
                  <input
                    value={editor.name}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.1] bg-black/15 px-3 text-xs text-white/80 outline-none focus:border-white/30"
                    placeholder={t('imageType.editor.namePlaceholder', '例如：动作高潮分镜')}
                    maxLength={80}
                  />
                </label>
                <div className="text-[10px] text-white/45">
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('imageType.editor.category', '分类')}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryEditor({ mode: 'create', value: '' });
                          setCategoryError('');
                          setCategoryDeleteArmed(false);
                        }}
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/45 hover:bg-white/[0.08] hover:text-white/80"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {t('imageType.category.create', '新增')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryEditor({ mode: 'rename', value: editor.category });
                          setCategoryError('');
                          setCategoryDeleteArmed(false);
                        }}
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/45 hover:bg-white/[0.08] hover:text-white/80"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        {t('imageType.category.rename', '编辑')}
                      </button>
                      <button
                        type="button"
                        onClick={deleteEditorCategory}
                        className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors ${
                          categoryDeleteArmed
                            ? 'bg-rose-500/20 text-rose-200'
                            : 'text-rose-300/55 hover:bg-rose-500/10 hover:text-rose-200'
                        }`}
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        {categoryDeleteArmed
                          ? t('imageType.category.confirmDelete', '确认删除')
                          : t('imageType.category.delete', '删除')}
                      </button>
                    </div>
                  </div>
                  <select
                    value={editor.category}
                    onChange={(event) => {
                      setEditor({ ...editor, category: event.target.value });
                      setCategoryEditor(null);
                      setCategoryError('');
                      setCategoryDeleteArmed(false);
                    }}
                    className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.1] bg-[#242424] px-3 text-xs text-white/80 outline-none focus:border-white/30"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {localizeCategory(category, t)}
                      </option>
                    ))}
                  </select>
                  {categoryEditor && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={categoryEditor.value}
                        onChange={(event) =>
                          setCategoryEditor({ ...categoryEditor, value: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitCategoryEditor();
                          if (event.key === 'Escape') {
                            event.stopPropagation();
                            setCategoryEditor(null);
                            setCategoryError('');
                          }
                        }}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/15 px-2 text-xs text-white/80 outline-none focus:border-white/30"
                        placeholder={t('imageType.category.namePlaceholder', '输入分类名称')}
                        maxLength={40}
                      />
                      <button
                        type="button"
                        onClick={commitCategoryEditor}
                        className="h-8 rounded-lg bg-white px-2 text-[11px] font-medium text-black hover:bg-white/90"
                      >
                        {t('imageType.category.confirm', '确定')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryEditor(null);
                          setCategoryError('');
                        }}
                        className="h-8 rounded-lg px-2 text-[11px] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                      >
                        {t('common.cancel', '取消')}
                      </button>
                    </div>
                  )}
                  {categoryError && (
                    <p role="alert" className="mt-1.5 text-[11px] text-rose-300">
                      {categoryError}
                    </p>
                  )}
                </div>
              </div>

              <label className="mt-3 block text-[10px] text-white/45">
                {t('imageType.editor.description', '用途说明')}
                <input
                  value={editor.description}
                  onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.1] bg-black/15 px-3 text-xs text-white/80 outline-none focus:border-white/30"
                  placeholder={t(
                    'imageType.editor.descriptionPlaceholder',
                    '显示在菜单中的简短说明',
                  )}
                  maxLength={240}
                />
              </label>

              <label className="mt-3 block text-[10px] text-white/45">
                {t('imageType.editor.prompt', '内置提示词')}
                <textarea
                  value={editor.prompt}
                  onChange={(event) => setEditor({ ...editor, prompt: event.target.value })}
                  className="nowheel mt-1.5 h-32 w-full resize-none rounded-lg border border-white/[0.1] bg-black/15 px-3 py-2 text-xs leading-5 text-white/80 outline-none focus:border-white/30"
                  placeholder={t(
                    'imageType.editor.promptPlaceholder',
                    '生成时会自动与用户输入合并',
                  )}
                  maxLength={10_000}
                />
              </label>

              {editorError && (
                <p role="alert" className="mt-2 text-[11px] text-rose-300">
                  {editorError}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                {presets.some((preset) => preset.id === editor.id) ? (
                  <button
                    type="button"
                    onClick={deleteEditorPreset}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                      deleteArmed
                        ? 'bg-rose-500/20 text-rose-200'
                        : 'text-rose-300/70 hover:bg-rose-500/10 hover:text-rose-200'
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleteArmed
                      ? t('imageType.editor.confirmDelete', '确认删除')
                      : t('imageType.editor.delete', '删除')}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={saveEditor}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white/90"
                >
                  <Save className="h-3.5 w-3.5" />
                  {t('imageType.editor.save', '保存')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="group/help relative shrink-0">
                  <button
                    type="button"
                    aria-label={t('imageType.helpLabel', '查看生成类型说明')}
                    aria-describedby="image-type-preset-help"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/75 focus-visible:bg-white/[0.08] focus-visible:text-white/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                  <div
                    id="image-type-preset-help"
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-lg border border-white/[0.12] bg-[#111113]/98 px-3 py-2.5 text-left text-[11px] leading-4 text-white/75 opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.6)] transition-[opacity,transform,visibility] duration-150 group-hover/help:visible group-hover/help:translate-y-0 group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:translate-y-0 group-focus-within/help:opacity-100"
                  >
                    {t(
                      'imageType.help',
                      '预设提示词会自动与文字输入合并；再次点击已选类型可取消。',
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    ref={transferFileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => void importCatalog(event)}
                  />
                  <button
                    type="button"
                    onClick={() => transferFileRef.current?.click()}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/45 hover:bg-white/[0.08] hover:text-white/75"
                  >
                    <Upload className="h-3 w-3" />
                    {t('imageType.transfer.import', '导入')}
                  </button>
                  <button
                    type="button"
                    onClick={exportCatalog}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/45 hover:bg-white/[0.08] hover:text-white/75"
                  >
                    <Download className="h-3 w-3" />
                    {t('imageType.transfer.export', '导出')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persistCatalog(restoreBuiltInImageTypePresetCatalog(catalog));
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/45 hover:bg-white/[0.08] hover:text-white/75"
                    title={t(
                      'imageType.restoreTitle',
                      '恢复被删除或修改的内置类型，不影响新增类型',
                    )}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('imageType.restore', '恢复内置')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditor(emptyPreset(categories))}
                    className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-[11px] text-white/75 hover:bg-white/[0.14] hover:text-white"
                  >
                    <Plus className="h-3 w-3" />
                    {t('imageType.create', '新增')}
                  </button>
                </div>
              </div>

              {transferError && (
                <p className="mb-2 text-[11px] text-rose-300/80">{transferError}</p>
              )}
              {notice && !transferError && (
                <p className="mb-2 text-[11px] text-emerald-300/65">{notice}</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                {imageTypeCategoryColumns(categories).map((column) => (
                  <div key={column.join('|')} className="space-y-4">
                    {column.map((category) => {
                      const categoryPresets = presets.filter(
                        (preset) => preset.category === category,
                      );
                      return (
                        <section key={category}>
                          <p className="mb-2 text-xs text-white/55">
                            {localizeCategory(category, t)}
                          </p>
                          {categoryPresets.length ? (
                            <div className="space-y-2">
                              {categoryPresets.map((preset) => (
                                <div
                                  key={preset.id}
                                  className={`flex items-stretch overflow-hidden rounded-lg border transition-colors ${
                                    selectedValue === preset.name
                                      ? 'border-white bg-white/15'
                                      : 'border-white/15 hover:border-white/35'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selectedValue === preset.name}
                                    onClick={() => selectPreset(preset)}
                                    className="min-h-12 min-w-0 flex-1 px-3 py-2 text-left"
                                  >
                                    <span className="block truncate text-xs font-medium text-white/75">
                                      {localizePresetName(preset, t)}
                                    </span>
                                    <span className="mt-1 block text-[11px] leading-4 text-white/35">
                                      {localizePresetDescription(preset, t)}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditor(preset)}
                                    className="flex w-9 shrink-0 items-center justify-center border-l border-white/[0.08] text-white/35 hover:bg-white/[0.08] hover:text-white/75"
                                    title={t('imageType.editNamed', '编辑{name}', {
                                      name: localizePresetName(preset, t),
                                    })}
                                    aria-label={t('imageType.editNamed', '编辑{name}', {
                                      name: localizePresetName(preset, t),
                                    })}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-[11px] text-white/25">
                              {t('imageType.empty', '暂无内容')}
                            </p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
