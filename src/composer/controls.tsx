import {
  ChevronDown,
  ChevronRight,
  Wand2,
  Maximize2,
  Clock,
  Film,
  Volume2,
  VolumeX,
  CircleHelp,
  Hash,
  Type,
  SlidersHorizontal,
  Image as ImageIcon,
  Bookmark,
  Palette,
  LayoutTemplate,
  AlignLeft,
  Zap,
  User,
  AudioLines,
  Check,
  FolderOpen,
  Heart,
  RefreshCw,
  LockKeyhole,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ComposerControlType } from '../graph/types';
import { useCanvasStore, type GenParams } from '../store/canvasStore';
import { useComposer } from './ComposerContext';
import type { ComposerReference } from './types';
import { isCliProtocol, type ProviderModelKind } from '../lib/providerRegistry';
import { refreshModelCatalog, useModelCatalogStore } from '../lib/modelCatalog';
import { modelSupportsComposerInput, resolveComposerModelSelection } from './modelSelection';
import { groupModelPickerOptions } from '../components/modelPicker';
import { ProviderBrandIcon } from '../components/ProviderBrandIcon';
import { readModelFavorite, writeModelFavorite, type ModelFavorite } from '../lib/modelFavorites';
import { ImageTypePresetControl } from './ImageTypePresetControl';
import {
  applyTextModePrompt,
  DEFAULT_TEXT_TASK_MODE,
  type TextTaskMode,
} from '../lib/textGeneration';
import { textModeLabel } from '../lib/textModeCatalog';
import { useTextModeCatalogStore } from '../store/textModeCatalog';
import { TextModeEditor } from './TextModeEditor';
import { useAppTranslation } from '../i18n/appI18n';
import { hasDirectorAspectRatioLock } from './directorTask';
import {
  findReadyGenerationModel,
  GENERATION_CAPABILITY_ISSUE_FALLBACKS,
  generationCapabilityIssue,
  requestedVideoAudio,
} from './modelCapability';
import {
  normalizeVideoGenerationMode,
  VIDEO_GENERATION_DURATION_OPTIONS,
  VIDEO_GENERATION_MAX_DURATION_SECONDS,
} from '../lib/videoGenerationMode';

function ControlButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
        active
          ? 'bg-white/[0.10] text-white'
          : 'bg-white/[0.05] text-white/70 hover:bg-white/[0.08] hover:text-white/90'
      }`}
    >
      {children}
    </button>
  );
}

function SelectButton<T extends string>({
  value,
  options,
  onChange,
  icon: Icon,
  label,
  menuLabel,
  wide = false,
  disabledOptions,
  disabledOptionReason,
  getOptionLabel,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  menuLabel: string;
  wide?: boolean;
  disabledOptions?: ReadonlySet<T>;
  disabledOptionReason?: (option: T) => string | undefined;
  getOptionLabel?: (option: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
          open
            ? 'border-white/[0.08] bg-white/[0.12] text-white'
            : 'border-white/[0.06] bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0 text-white/65" />}
        <span className={wide ? 'max-w-[220px] truncate' : ''}>{label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={menuLabel}
          className={`absolute bottom-full left-0 z-40 mb-2 rounded-2xl border border-white/[0.1] bg-[#242424] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.55)] ${wide ? 'w-[280px]' : 'w-[162px]'}`}
        >
          <p className="px-1.5 pb-2 pt-1 text-[10px] text-white/35">{menuLabel}</p>
          <div className="flex max-h-[240px] flex-col gap-1 overflow-y-auto">
            {options.map((option) => {
              const selected = value === option;
              const disabled = disabledOptions?.has(option) ?? false;
              const disabledReason = disabled ? disabledOptionReason?.(option) : undefined;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={disabledReason}
                  onClick={() => {
                    if (disabled) return;
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors ${
                    disabled
                      ? 'cursor-not-allowed text-white/25'
                      : selected
                        ? 'bg-white/[0.16] font-medium text-white'
                        : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />}
                  <span className="min-w-0 flex-1 truncate">
                    {getOptionLabel?.(option) ?? option}
                  </span>
                  {disabledReason && (
                    <span className="shrink-0 text-[11px] text-white/25">{disabledReason}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type ModelMenuChoice = {
  key: string;
  providerId: string;
  providerName: string;
  providerMark?: string;
  providerAccent?: string;
  model: string;
  displayName: string;
  optionLabel: string;
  ready: boolean;
  compatible: boolean;
  incompatibilityReason?: string;
  protocol?: unknown;
};

function ModelSelectButton({
  label,
  menuLabel,
  choices,
  selectedProviderId,
  selectedModel,
  favoriteProviderId,
  favoriteModel,
  onChange,
  onToggleFavorite,
}: {
  label: string;
  menuLabel: string;
  choices: ModelMenuChoice[];
  selectedProviderId?: string;
  selectedModel?: string;
  favoriteProviderId?: string;
  favoriteModel?: string;
  onChange: (choice: ModelMenuChoice) => void;
  onToggleFavorite: (choice: ModelMenuChoice) => void;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [menuLayout, setMenuLayout] = useState<{ side: 'left' | 'right'; offset: number }>({
    side: 'right',
    offset: 0,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const providerCloseTimerRef = useRef<number | null>(null);
  const categories = groupModelPickerOptions(choices);
  const selectedCategory = categories.find((category) => category.providerId === providerId);
  const selectedChoice = choices.find(
    (choice) => choice.providerId === selectedProviderId && choice.model === selectedModel,
  );
  const fullLabel = label.trim();
  const prepareMenuLayout = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 8;
    const menuWidth = 580;
    const availableRight = window.innerWidth - Math.max(rect.left, viewportPadding);
    const availableLeft = Math.min(rect.right, window.innerWidth - viewportPadding);
    const side = availableRight >= menuWidth || availableRight >= availableLeft ? 'right' : 'left';
    const offset =
      side === 'right'
        ? Math.max(viewportPadding - rect.left, 0)
        : Math.max(rect.right - (window.innerWidth - viewportPadding), 0);
    setMenuLayout({ side, offset });
  };

  const cancelProviderClose = () => {
    if (providerCloseTimerRef.current === null) return;
    window.clearTimeout(providerCloseTimerRef.current);
    providerCloseTimerRef.current = null;
  };

  const scheduleProviderClose = () => {
    cancelProviderClose();
    providerCloseTimerRef.current = window.setTimeout(() => {
      setProviderId(null);
      providerCloseTimerRef.current = null;
    }, 320);
  };

  useEffect(() => {
    if (!open) {
      if (providerCloseTimerRef.current !== null) {
        window.clearTimeout(providerCloseTimerRef.current);
        providerCloseTimerRef.current = null;
      }
      return;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setProviderId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setProviderId(null);
      }
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
      if (providerCloseTimerRef.current !== null) {
        window.clearTimeout(providerCloseTimerRef.current);
        providerCloseTimerRef.current = null;
      }
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => {
            if (!current) {
              setProviderId(null);
              prepareMenuLayout();
            }
            return !current;
          });
        }}
        title={fullLabel}
        className={`flex min-w-0 max-w-[190px] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
          open
            ? 'border-white/[0.08] bg-white/[0.12] text-white'
            : 'border-white/[0.06] bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        {selectedChoice ? (
          <ProviderBrandIcon
            providerId={selectedChoice.providerId}
            providerName={selectedChoice.providerName}
            mark={selectedChoice.providerMark}
            accent={selectedChoice.providerAccent}
            className="h-3.5 w-3.5"
          />
        ) : (
          <Wand2 className="h-3 w-3 shrink-0 text-white/65" />
        )}
        <span className="min-w-0 max-w-[150px] truncate">{label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`model-menu-enter absolute bottom-full z-40 mb-2 ${
            menuLayout.side === 'right' ? 'left-0' : 'right-0'
          }`}
          style={
            menuLayout.side === 'right'
              ? { marginLeft: menuLayout.offset }
              : { marginRight: menuLayout.offset }
          }
          onPointerEnter={cancelProviderClose}
          onPointerLeave={scheduleProviderClose}
        >
          <div
            role="menu"
            aria-label={menuLabel}
            className="w-[280px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#242424] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
          >
            <p className="px-2.5 pb-2 pt-1 text-[10px] text-white/35">
              {t('composer.model.selectCategory', '选择模型分类')}
            </p>
            <div className="flex max-h-[260px] flex-col gap-1 overflow-x-hidden overflow-y-auto">
              {categories.map((category) => {
                const active = category.models.some(
                  (choice) =>
                    selectedProviderId === choice.providerId && selectedModel === choice.model,
                );
                const brand = category.models[0];
                const expanded = category.providerId === providerId;
                return (
                  <button
                    key={category.providerId}
                    type="button"
                    role="menuitem"
                    aria-haspopup="listbox"
                    aria-expanded={expanded}
                    onPointerEnter={() => {
                      cancelProviderClose();
                      setProviderId(category.providerId);
                    }}
                    onFocus={() => setProviderId(category.providerId)}
                    onClick={() => setProviderId(category.providerId)}
                    className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none ${
                      active || expanded ? 'bg-white/[0.08]' : ''
                    }`}
                  >
                    <ProviderBrandIcon
                      providerId={category.providerId}
                      providerName={category.providerName}
                      mark={brand?.providerMark}
                      accent={brand?.providerAccent}
                      className="h-4 w-4 transition-transform duration-150 ease-out group-hover:scale-110"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/80">
                      {category.providerName}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/35">
                      {t('composer.model.count', '{count} 个模型', {
                        count: category.models.length,
                      })}
                      <ChevronRight
                        className={`h-3 w-3 transition-transform duration-150 ${expanded ? 'translate-x-0.5 text-white/60' : ''}`}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCategory && (
            <div
              key={selectedCategory.providerId}
              role="listbox"
              aria-label={t('composer.model.providerModels', '{provider} 模型', {
                provider: selectedCategory.providerName,
              })}
              onPointerEnter={cancelProviderClose}
              className={`model-submenu-enter absolute bottom-0 w-[292px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#242424] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.58)] ${
                menuLayout.side === 'right' ? 'left-full ml-2' : 'right-full mr-2'
              }`}
            >
              <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
                <ProviderBrandIcon
                  providerId={selectedCategory.providerId}
                  providerName={selectedCategory.providerName}
                  mark={selectedCategory.models[0]?.providerMark}
                  accent={selectedCategory.models[0]?.providerAccent}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">
                  {selectedCategory.providerName}
                </span>
                <span className="text-[10px] text-white/30">
                  {t('composer.model.count', '{count} 个模型', {
                    count: selectedCategory.models.length,
                  })}
                </span>
              </div>
              <div className="flex max-h-[280px] flex-col gap-1 overflow-x-hidden overflow-y-auto">
                {selectedCategory.models.map((choice) => {
                  const selected =
                    selectedProviderId === choice.providerId && selectedModel === choice.model;
                  const favorite =
                    favoriteProviderId === choice.providerId && favoriteModel === choice.model;
                  const disabledReason = !choice.compatible
                    ? (choice.incompatibilityReason ??
                      t('composer.model.noReferenceSupport', '不支持当前输入'))
                    : !choice.ready
                      ? t('composer.model.pendingReview', '待复核')
                      : undefined;
                  return (
                    <div
                      key={choice.key}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={!choice.compatible}
                      className={`group flex items-center rounded-lg transition-colors duration-150 ease-out ${
                        !choice.compatible
                          ? 'text-white/25'
                          : selected
                            ? 'bg-white/[0.16] font-medium text-white'
                            : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!choice.compatible}
                        title={disabledReason}
                        onClick={() => {
                          if (!choice.compatible) return;
                          onChange(choice);
                          setOpen(false);
                          setProviderId(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs disabled:cursor-not-allowed"
                      >
                        <ProviderBrandIcon
                          providerId={choice.providerId}
                          providerName={choice.providerName}
                          mark={choice.providerMark}
                          accent={choice.providerAccent}
                          className="h-4 w-4 transition-transform duration-150 ease-out group-hover:scale-110"
                        />
                        <span className="min-w-0 flex-1 truncate">{choice.displayName}</span>
                        {disabledReason && (
                          <span
                            className="shrink-0 text-white/25"
                            title={disabledReason}
                            aria-label={disabledReason}
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                        {selected && !disabledReason && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-white/70" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!choice.compatible}
                        aria-label={
                          favorite
                            ? t('composer.model.unfavoriteNamed', '取消收藏 {name}', {
                                name: choice.displayName,
                              })
                            : t('composer.model.favoriteNamed', '收藏 {name}', {
                                name: choice.displayName,
                              })
                        }
                        aria-pressed={favorite}
                        title={
                          favorite
                            ? t('composer.model.unfavoriteDefault', '取消默认收藏')
                            : t('composer.model.favoriteAsDefault', '收藏并设为该功能默认模型')
                        }
                        onClick={() => onToggleFavorite(choice)}
                        className={`mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] duration-150 ease-out hover:scale-110 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25 ${
                          favorite
                            ? 'bg-rose-400/12 text-rose-300'
                            : 'text-white/30 hover:bg-white/[0.08] hover:text-white/70'
                        }`}
                      >
                        <Heart className="h-3.5 w-3.5" fill={favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelControl() {
  const { state, genParams, setParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  const updateNodeData = useCanvasStore((store) => store.updateNodeData);
  const selectedNode = useCanvasStore((store) =>
    runtime.primaryNodeId
      ? store.nodes.find((node) => node.id === runtime.primaryNodeId)
      : undefined,
  );
  const modelKind: ProviderModelKind | null =
    runtime.spec.type === 'image'
      ? 'image'
      : runtime.spec.type === 'video'
        ? 'video'
        : runtime.spec.type === 'text'
          ? 'chat'
          : runtime.spec.type === 'audio'
            ? 'audio'
            : runtime.spec.type === '3d'
              ? '3d'
              : null;
  const [favorite, setFavorite] = useState<ModelFavorite | undefined>(() =>
    modelKind ? readModelFavorite(modelKind) : undefined,
  );
  useEffect(() => {
    setFavorite(modelKind ? readModelFavorite(modelKind) : undefined);
  }, [modelKind]);
  const models = useModelCatalogStore((catalog) =>
    modelKind ? catalog.readyModels[modelKind] : catalog.readyModels.chat,
  );
  const cachedModels = useModelCatalogStore((catalog) =>
    modelKind ? catalog.cachedModels[modelKind] : catalog.cachedModels.chat,
  );
  const requiresImageInput =
    (runtime.spec.type === 'text' || runtime.spec.type === 'image' || runtime.spec.type === '3d') &&
    (state.references.some(
      (reference) => reference.type === 'image' || reference.type === 'video',
    ) ||
      runtime.marks.some((mark) => typeof mark.sourceUrl === 'string' && mark.sourceUrl.trim()));
  const compatibilityIssue = (model: (typeof models)[number]) => {
    if (runtime.spec.type === 'image' || runtime.spec.type === 'video') {
      return generationCapabilityIssue(model, {
        kind: runtime.spec.type,
        references: state.references,
        additionalImageReferenceUrls: runtime.marks.flatMap((mark) =>
          typeof mark.sourceUrl === 'string' && mark.sourceUrl.trim() ? [mark.sourceUrl] : [],
        ),
        count: genParams.count,
        mode: state.params.mode,
        videoTool: runtime.videoTool,
      });
    }
    return modelSupportsComposerInput(model, requiresImageInput)
      ? null
      : ('image-input-unverified' as const);
  };
  const compatibleModels = models.filter((model) => compatibilityIssue(model) === null);
  const selection = resolveComposerModelSelection(
    compatibleModels,
    state.params,
    selectedNode?.data,
    favorite,
  );
  const automaticChoice = selection.automaticSelection;
  const readyKeys = new Set(models.map((option) => option.key));
  const catalogChoices = [
    ...models.map((option) => {
      const issue = compatibilityIssue(option);
      return {
        ...option,
        ready: true,
        optionLabel: option.label,
        compatible: issue === null,
        incompatibilityReason: issue
          ? t(`composer.model.capability.${issue}`, GENERATION_CAPABILITY_ISSUE_FALLBACKS[issue])
          : undefined,
      };
    }),
    ...cachedModels
      .filter((option) => !readyKeys.has(option.key))
      .map((option) => {
        const issue = compatibilityIssue(option);
        return {
          ...option,
          ready: false,
          optionLabel: t('composer.model.pendingReviewNamed', '待复核 · {name}', {
            name: option.label,
          }),
          compatible: issue === null,
          incompatibilityReason: issue
            ? t(`composer.model.capability.${issue}`, GENERATION_CAPABILITY_ISSUE_FALLBACKS[issue])
            : undefined,
        };
      }),
  ];

  useEffect(() => {
    if (!automaticChoice) return;
    setParam('providerId', automaticChoice.providerId);
    setParam('model', automaticChoice.model);
    if (!runtime.primaryNodeId) return;
    const composerParams =
      selectedNode?.data.composerParams && typeof selectedNode.data.composerParams === 'object'
        ? (selectedNode.data.composerParams as Record<string, unknown>)
        : {};
    updateNodeData(runtime.primaryNodeId, {
      providerId: automaticChoice.providerId,
      model: automaticChoice.model,
      composerParams: {
        ...composerParams,
        providerId: automaticChoice.providerId,
        model: automaticChoice.model,
      },
    });
  }, [automaticChoice, runtime.primaryNodeId, selectedNode, setParam, updateNodeData]);

  if (!modelKind) return null;

  const selectChoice = (choice: ModelMenuChoice) => {
    setParam('providerId', choice.providerId);
    setParam('model', choice.model);
    if (!choice.ready && isCliProtocol(choice.protocol)) {
      void refreshModelCatalog();
    }
    if (runtime.primaryNodeId) {
      const composerParams =
        selectedNode?.data.composerParams && typeof selectedNode.data.composerParams === 'object'
          ? (selectedNode.data.composerParams as Record<string, unknown>)
          : {};
      updateNodeData(runtime.primaryNodeId, {
        providerId: choice.providerId,
        model: choice.model,
        composerParams: {
          ...composerParams,
          providerId: choice.providerId,
          model: choice.model,
        },
      });
    }
  };

  const kindLabel =
    runtime.spec.type === 'audio'
      ? t('composer.media.audio', '音频')
      : runtime.spec.type === '3d'
        ? t('composer.media.3d', '3D')
        : modelKind === 'chat'
          ? t('composer.media.text', '文本')
          : modelKind === 'image'
            ? t('composer.media.image', '图片')
            : t('composer.media.video', '视频');
  const compatibleChoices = catalogChoices.filter((choice) => choice.compatible);
  const fallback = catalogChoices.length
    ? compatibleChoices.length
      ? t('composer.model.selectKind', '选择{kind}模型', { kind: kindLabel })
      : t('composer.model.noCompatibleModel', '没有模型支持当前输入与参数')
    : t('composer.model.notConnected', '未连接{kind}模型', { kind: kindLabel });
  const configuredChoice = catalogChoices.find(
    (option) => option.providerId === selection.providerId && option.model === selection.model,
  );
  const cachedSelection = cachedModels.find(
    (option) => option.providerId === selection.providerId && option.model === selection.model,
  );
  const label =
    (configuredChoice && !configuredChoice.compatible
      ? `${configuredChoice.incompatibilityReason ?? t('composer.model.noReferenceSupport', '不支持当前输入')} · ${configuredChoice.label}`
      : undefined) ??
    selection.selected?.label ??
    (cachedSelection
      ? t('composer.model.pendingReviewNamed', '待复核 · {name}', {
          name: cachedSelection.label,
        })
      : selection.unavailable
        ? t('composer.model.unavailableNamed', '不可用 · {name}', {
            name:
              selection.model ??
              selection.providerId ??
              t('composer.model.incompleteConfiguration', '模型配置不完整'),
          })
        : fallback);

  if (!catalogChoices.length) {
    return (
      <button
        type="button"
        disabled
        title={t('composer.model.connectHint', '请先在 API 设置中连接支持{kind}生成的 API 或 CLI', {
          kind: kindLabel,
        })}
        className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-white/35"
      >
        <Wand2 className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <ModelSelectButton
      label={label}
      menuLabel={t('composer.model.selectKind', '选择{kind}模型', { kind: kindLabel })}
      choices={catalogChoices}
      selectedProviderId={selection.providerId}
      selectedModel={selection.model}
      favoriteProviderId={favorite?.providerId}
      favoriteModel={favorite?.model}
      onChange={selectChoice}
      onToggleFavorite={(choice) => {
        const alreadyFavorite =
          favorite?.providerId === choice.providerId && favorite.model === choice.model;
        const nextFavorite = alreadyFavorite
          ? undefined
          : { providerId: choice.providerId, model: choice.model };
        writeModelFavorite(modelKind, nextFavorite);
        setFavorite(nextFavorite);
        if (nextFavorite) selectChoice(choice);
      }}
    />
  );
}

function AspectRatioControl() {
  const { genParams, setGenParam } = useComposer();
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  if (runtime.spec.type === 'image') return <ImageSizeControl />;
  return (
    <SelectButton
      value={genParams.aspectRatio}
      options={['16:9', '9:16', '1:1']}
      onChange={(v) => setGenParam('aspectRatio', v)}
      icon={Maximize2}
      label={genParams.aspectRatio}
      menuLabel={t('composer.aspectRatio', '画面比例')}
    />
  );
}

type ImageSizeMenuProps = {
  genParams: GenParams;
  aspectRatioLocked: boolean;
  maxCount?: GenParams['count'];
  onQualityChange: (value: GenParams['quality']) => void;
  onAspectRatioChange: (value: GenParams['aspectRatio']) => void;
  onCountChange: (value: GenParams['count']) => void;
};

export function ImageSizeMenu({
  genParams,
  aspectRatioLocked,
  maxCount = 1,
  onQualityChange,
  onAspectRatioChange,
  onCountChange,
}: ImageSizeMenuProps) {
  const { t } = useAppTranslation();
  const quality = genParams.quality ?? 'standard';
  const aspectRatios: Array<{ value: GenParams['aspectRatio']; label: string }> = [
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '1:1', label: '1:1' },
    { value: '3:4', label: '3:4' },
    { value: '4:3', label: '4:3' },
    { value: '2:3', label: '2:3' },
    { value: '3:2', label: '3:2' },
    { value: '4:5', label: '4:5' },
    { value: '5:4', label: '5:4' },
    { value: '21:9', label: '21:9' },
  ];

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-[330px] rounded-2xl border border-white/[0.12] bg-[#242424] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
      <p className="mb-2 text-xs text-white/55">{t('composer.resolution', '分辨率')}</p>
      <div className="grid grid-cols-3 gap-2">
        {(['standard', '2K', '4K'] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-image-setting="quality"
            onClick={() => onQualityChange(value)}
            className={`rounded-lg border py-2 text-xs transition-colors ${quality === value ? 'border-white bg-white/15 font-medium text-white' : 'border-white/15 text-white/55 hover:border-white/35 hover:text-white/85'}`}
          >
            {value === 'standard' ? '1K' : value}
          </button>
        ))}
      </div>
      <div className="mb-2 mt-3 flex items-center justify-between gap-2 text-xs text-white/55">
        <span>{t('composer.ratio', '比例')}</span>
        {aspectRatioLocked && (
          <span
            data-director-ratio-lock="true"
            title={t('composer.reference.locked', '导演参考顺序已锁定')}
            className="flex items-center gap-1 rounded-md border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[11px] text-amber-100/80"
          >
            <LockKeyhole className="h-2.5 w-2.5" />
            {t('director2d.stage.aspectRatio', '成图比例')} · {genParams.aspectRatio}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {aspectRatios.map((item) => (
          <button
            key={item.value}
            type="button"
            data-image-setting="ratio"
            disabled={aspectRatioLocked}
            title={
              aspectRatioLocked ? t('composer.reference.locked', '导演参考顺序已锁定') : undefined
            }
            onClick={() => onAspectRatioChange(item.value)}
            className={`h-12 rounded-lg border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${genParams.aspectRatio === item.value ? 'border-white bg-white/15 font-medium text-white' : 'border-white/15 text-white/55 hover:border-white/35 hover:text-white/85'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mb-2 mt-3 text-xs text-white/55">{t('composer.generateCount', '生成数量')}</p>
      <div className="grid grid-cols-3 gap-2">
        {([1, 2, 4] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-image-setting="count"
            disabled={value > maxCount}
            title={
              value > maxCount
                ? t('composer.count.modelLimit', '当前模型最多生成 {count} 个', {
                    count: maxCount,
                  })
                : undefined
            }
            onClick={() => onCountChange(value)}
            className={`rounded-lg border py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${genParams.count === value ? 'border-white bg-white/15 font-medium text-white' : 'border-white/15 text-white/55 hover:border-white/35 hover:text-white/85'}`}
          >
            {t('composer.count.images', '{count}张', { count: value })}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageSizeControl() {
  const { state, genParams, setGenParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  const primaryNode = useCanvasStore((store) =>
    runtime.primaryNodeId
      ? store.nodes.find((node) => node.id === runtime.primaryNodeId)
      : undefined,
  );
  const aspectRatioLocked = hasDirectorAspectRatioLock(primaryNode?.data.composerParams);
  const imageModels = useModelCatalogStore((catalog) => catalog.readyModels.image);
  const selectedModel = findReadyGenerationModel(imageModels, state.params);
  const maxCount = selectedModel?.maxOutputCount ?? 1;
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const quality = genParams.quality ?? 'standard';
  const qualityLabel = quality === 'standard' ? '1K' : quality;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={controlRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        title={t('composer.imageSettings', '图片尺寸与生成数量')}
      >
        <Maximize2 className="h-3 w-3 text-white/50" />
        <span>
          {genParams.aspectRatio} · {qualityLabel} ·{' '}
          {t('composer.count.images', '{count}张', { count: genParams.count })}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ImageSizeMenu
          genParams={genParams}
          aspectRatioLocked={aspectRatioLocked}
          maxCount={maxCount}
          onQualityChange={(value) => setGenParam('quality', value)}
          onAspectRatioChange={(value) => setGenParam('aspectRatio', value)}
          onCountChange={(value) => setGenParam('count', value)}
        />
      )}
    </div>
  );
}

function ImageTypeControl() {
  return <ImageTypePresetControl />;
}

function ResolutionControl() {
  const { genParams, setGenParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  if (runtime.spec.type === 'image') return null;
  const options: Array<{ value: string; label: string }> =
    runtime.spec.type === 'video'
      ? [
          { value: '720P', label: '720P' },
          { value: '1080P', label: '1080P' },
        ]
      : [
          { value: 'standard', label: t('composer.quality.standard', '标准画质') },
          { value: '2K', label: '2K' },
          { value: '4K', label: '4K' },
        ];
  const current =
    runtime.spec.type === 'video'
      ? (genParams.resolution ?? '720P')
      : (genParams.quality ?? 'standard');
  const currentLabel = options.find((option) => option.value === current)?.label ?? current;
  return (
    <SelectButton
      value={currentLabel}
      options={options.map((option) => option.label)}
      onChange={(nextLabel) => {
        const next = options.find((option) => option.label === nextLabel);
        if (!next) return;
        if (runtime.spec.type === 'video') {
          setGenParam('resolution', next.value as '720P' | '1080P');
        } else {
          setGenParam('quality', next.value as GenParams['quality']);
        }
      }}
      icon={Maximize2}
      label={currentLabel}
      menuLabel={t('composer.resolution', '分辨率')}
    />
  );
}

function CountControl() {
  const { state, genParams, setGenParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  const primaryNode = useCanvasStore((store) =>
    runtime.primaryNodeId
      ? store.nodes.find((node) => node.id === runtime.primaryNodeId)
      : undefined,
  );
  const primaryKind = primaryNode?.data.kind;
  const videoModels = useModelCatalogStore((catalog) => catalog.readyModels.video);
  const selectedVideoModel = findReadyGenerationModel(videoModels, state.params);
  const maximumCount =
    runtime.spec.type === 'video' ? (selectedVideoModel?.maxOutputCount ?? 1) : 4;
  if (runtime.spec.type === 'image') return null;
  const countUnit =
    primaryKind === 'loop'
      ? t('composer.unit.iteration', '次')
      : runtime.spec.type === 'video'
        ? t('composer.unit.video', '个')
        : runtime.spec.type === 'audio'
          ? t('composer.unit.track', '首')
          : t('composer.unit.image', '张');
  return (
    <SelectButton
      value={String(genParams.count)}
      options={['1', '2', '4']}
      onChange={(v) => setGenParam('count', Number(v) as 1 | 2 | 4)}
      icon={Hash}
      label={t('composer.count.withUnit', '{count}{unit}', {
        count: genParams.count,
        unit: countUnit,
      })}
      menuLabel={t('composer.generateCount', '生成数量')}
      disabledOptions={
        runtime.spec.type === 'video'
          ? new Set((['1', '2', '4'] as const).filter((option) => Number(option) > maximumCount))
          : undefined
      }
      disabledOptionReason={(option) =>
        runtime.spec.type === 'video' && Number(option) > maximumCount
          ? t('composer.count.modelLimit', '当前模型最多生成 {count} 个', {
              count: maximumCount,
            })
          : undefined
      }
    />
  );
}

function DurationControl() {
  const { genParams, setGenParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  const isAudio = runtime.spec.type === 'audio';
  const duration = genParams.duration ?? (isAudio ? 30 : 5);
  const options = isAudio ? ['30', '60', '120'] : VIDEO_GENERATION_DURATION_OPTIONS.map(String);
  return (
    <SelectButton
      value={String(duration)}
      options={options}
      onChange={(v) => setGenParam('duration', Number(v))}
      icon={Clock}
      label={t('composer.duration.seconds', '{seconds}s', { seconds: duration })}
      menuLabel={
        isAudio
          ? t('composer.duration.music', '音乐时长')
          : t('composer.duration.video', '视频时长')
      }
    />
  );
}

function FpsControl() {
  const { genParams, setGenParam } = useComposer();
  const { t } = useAppTranslation();
  const fps = genParams.fps ?? 24;
  return (
    <SelectButton
      value={String(fps)}
      options={['24', '30', '60']}
      onChange={(v) => setGenParam('fps', Number(v) as 24 | 30 | 60)}
      icon={Film}
      label={`${fps}fps`}
      menuLabel={t('composer.fps', '视频帧率')}
    />
  );
}

function AudioControl() {
  const { genParams, setGenParam } = useComposer();
  const { t } = useAppTranslation();
  const audio = genParams.audio ?? true;
  return (
    <ControlButton
      active={audio}
      onClick={() => setGenParam('audio', !audio)}
      title={
        audio
          ? t('composer.audio.enabled', '生成音频：开')
          : t('composer.audio.disabled', '生成音频：关')
      }
    >
      <Volume2 className="h-3 w-3" />
    </ControlButton>
  );
}

function VideoSettingsControl() {
  const { state, genParams, setGenParam, runtime } = useComposer();
  const { t } = useAppTranslation();
  const videoModels = useModelCatalogStore((catalog) => catalog.readyModels.video);
  const selectedModel = findReadyGenerationModel(videoModels, state.params);
  const maximumCount = selectedModel?.maxOutputCount ?? 1;
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (runtime.spec.type !== 'video') return null;

  const aspectRatio = genParams.videoAspectRatio ?? genParams.aspectRatio;
  const resolution = genParams.resolution ?? '720P';
  const isVideoRemake = runtime.videoTool === 'remake';
  const minimumDuration = isVideoRemake ? 1 : 5;
  const maximumDuration = isVideoRemake
    ? Math.max(60, Math.ceil(genParams.duration ?? 60))
    : VIDEO_GENERATION_MAX_DURATION_SECONDS;
  const duration = Math.max(
    minimumDuration,
    Math.min(maximumDuration, genParams.duration ?? minimumDuration),
  );
  const audio = requestedVideoAudio(runtime.videoAudioSelectionExplicit, genParams.audio);
  const aspectOptions: Array<NonNullable<GenParams['videoAspectRatio']>> = [
    'Auto',
    '16:9',
    '4:3',
    '1:1',
    '3:4',
    '9:16',
    '21:9',
  ];
  const resolutions: Array<NonNullable<GenParams['resolution']>> = ['480P', '720P', '1080P', '4K'];

  const ratioIconClass = (ratio: NonNullable<GenParams['videoAspectRatio']>) => {
    if (ratio === '9:16' || ratio === '3:4') return 'h-3 w-2';
    if (ratio === '1:1') return 'h-2.5 w-2.5';
    if (ratio === '21:9') return 'h-1.5 w-4';
    if (ratio === 'Auto') return 'h-2 w-3';
    return 'h-2 w-4';
  };

  return (
    <div ref={controlRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] transition-colors ${open ? 'border-white/[0.1] bg-white/[0.12] text-white' : 'border-white/[0.06] bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white'}`}
        title={t('composer.videoSettings', '视频参数设置')}
      >
        <span>{aspectRatio === 'Auto' ? t('composer.ratio.auto', '自动') : aspectRatio}</span>
        <span className="text-white/25">·</span>
        <span>{resolution}</span>
        <span className="text-white/25">·</span>
        <span>{duration}s</span>
        <span className="text-white/25">·</span>
        <span>{genParams.count}×</span>
        <span className="text-white/25">·</span>
        {audio ? (
          <Volume2 className="h-3 w-3 text-white/65" />
        ) : (
          <VolumeX className="h-3 w-3 text-white/40" />
        )}
        <ChevronDown
          className={`h-3 w-3 text-white/35 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('composer.videoSettings', '视频参数设置')}
          className="absolute bottom-full left-0 z-40 mb-2 w-[342px] rounded-2xl border border-white/[0.1] bg-[#242424] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.58)]"
        >
          <p className="mb-2 text-xs text-white/55">{t('composer.ratio', '比例')}</p>
          <div className="grid grid-cols-5 gap-2">
            {aspectOptions.map((option) => {
              const selected = aspectRatio === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGenParam('videoAspectRatio', option)}
                  className={`flex h-16 flex-col items-center justify-center gap-2 rounded-lg border text-[11px] transition-colors ${selected ? 'border-white bg-white/[0.14] font-medium text-white' : 'border-white/[0.14] text-white/50 hover:border-white/35 hover:text-white/80'}`}
                >
                  <span
                    className={`block rounded-[2px] border border-current ${ratioIconClass(option)}`}
                  />
                  <span>{option === 'Auto' ? t('composer.ratio.auto', '自动') : option}</span>
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-3 text-xs text-white/55">{t('composer.quality', '清晰度')}</p>
          <div className="grid grid-cols-4 gap-2">
            {resolutions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGenParam('resolution', option)}
                className={`h-8 rounded-lg border text-xs transition-colors ${resolution === option ? 'border-white bg-white/[0.14] font-medium text-white' : 'border-white/[0.14] text-white/45 hover:border-white/35 hover:text-white/80'}`}
              >
                {option}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-3 text-xs text-white/55">
            {t('composer.duration.video', '视频时长')}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minimumDuration}
              max={maximumDuration}
              step={1}
              value={duration}
              onChange={(event) => setGenParam('duration', Number(event.target.value))}
              className="h-1 flex-1 cursor-pointer accent-white"
              aria-label={t('composer.duration.video', '视频时长')}
            />
            <span className="flex h-6 min-w-12 items-center justify-center rounded-md bg-white/[0.06] px-2 text-xs text-white/80">
              {duration}
            </span>
            <span className="text-xs text-white/45">s</span>
          </div>

          <p className="mb-2 mt-3 flex items-center gap-1 text-xs text-white/55">
            {t('composer.generateAudio', '生成音频')}
            <CircleHelp className="h-3 w-3 text-white/40" />
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: true, label: t('common.enabled', '开启') },
              { value: false, label: t('common.disabled', '关闭') },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setGenParam('audio', option.value)}
                className={`h-8 rounded-lg border text-xs transition-colors ${audio === option.value ? 'border-white bg-white/[0.14] font-medium text-white' : 'border-white/[0.14] text-white/45 hover:border-white/35 hover:text-white/80'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-3 text-xs text-white/55">
            {t('composer.generateCount', '生成数量')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 4] as const).map((count) => (
              <button
                key={count}
                type="button"
                disabled={count > maximumCount}
                title={
                  count > maximumCount
                    ? t('composer.count.modelLimit', '当前模型最多生成 {count} 个', {
                        count: maximumCount,
                      })
                    : undefined
                }
                onClick={() => setGenParam('count', count)}
                className={`h-8 rounded-lg border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${genParams.count === count ? 'border-white bg-white/[0.14] font-medium text-white' : 'border-white/[0.14] text-white/45 hover:border-white/35 hover:text-white/80'}`}
              >
                {t('composer.count.videos', '{count}个', { count })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeControl() {
  const { state, setParam, setPrompt, runtime } = useComposer();
  const { t } = useAppTranslation();
  const updateNodeData = useCanvasStore((store) => store.updateNodeData);
  const selectedNode = useCanvasStore((store) =>
    runtime.primaryNodeId
      ? store.nodes.find((node) => node.id === runtime.primaryNodeId)
      : undefined,
  );
  const [open, setOpen] = useState(false);
  const [editModesOpen, setEditModesOpen] = useState(false);
  const [hoveredTextMode, setHoveredTextMode] = useState<string | null>(null);
  const [hoveredVideoMode, setHoveredVideoMode] = useState<string | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const textModeIcons: Partial<Record<string, typeof AlignLeft>> = {
    自由指令: AlignLeft,
    续写: AlignLeft,
    改写: Wand2,
    总结: Type,
    拆分镜: Film,
    提取人物: User,
    生成提示词: Zap,
  };
  const textModeKeys: Partial<Record<string, string>> = {
    自由指令: 'instruct',
    续写: 'continue',
    改写: 'rewrite',
    总结: 'summarize',
    拆分镜: 'storyboard',
    提取人物: 'extractCharacters',
    生成提示词: 'generatePrompt',
  };
  const configuredTextModes = useTextModeCatalogStore((store) => store.definitions);
  const textModes = configuredTextModes.map((mode) => ({
    ...mode,
    icon: textModeIcons[mode.value] ?? AlignLeft,
    displayLabel: textModeKeys[mode.value]
      ? t(`composer.mode.text.${textModeKeys[mode.value]}`, textModeLabel(mode))
      : textModeLabel(mode),
    displayDetails: textModeKeys[mode.value]
      ? t(`composer.mode.text.${textModeKeys[mode.value]}.description`, mode.details)
      : mode.details,
  }));
  const isVideo = runtime.spec.type === 'video';
  const isAudio = runtime.spec.type === 'audio';
  const videoModes = [
    {
      value: '文生视频',
      label: t('composer.mode.video.textToVideo', '文生视频'),
      icon: LayoutTemplate,
      description: t(
        'composer.mode.video.textToVideo.description',
        '只根据提示词生成全新视频，不使用参考图。适合从零创作场景、人物动作和镜头运动。',
      ),
    },
    {
      value: '全能参考',
      label: t('composer.mode.video.omniReference', '全能参考'),
      icon: Wand2,
      description: t(
        'composer.mode.video.omniReference.description',
        '综合使用人物、场景、道具和风格等多张参考素材，尽量保持主体身份、构图关系与视觉风格。',
      ),
    },
    {
      value: '图生视频',
      label: t('composer.mode.video.imageToVideo', '图生视频'),
      icon: ImageIcon,
      description: t(
        'composer.mode.video.imageToVideo.description',
        '使用一张图片作为主要视觉起点，让模型在保持主体和画面风格的基础上生成连续动作。',
      ),
    },
    {
      value: '首尾帧',
      label: t('composer.mode.video.firstLastFrame', '首尾帧'),
      icon: Film,
      description: t(
        'composer.mode.video.firstLastFrame.description',
        '使用两张图片分别约束视频开始和结束画面，适合控制人物、场景或镜头从起点到终点的变化。',
      ),
    },
    {
      value: '图片参考',
      label: t('composer.mode.video.imageReference', '图片参考'),
      icon: Bookmark,
      description: t(
        'composer.mode.video.imageReference.description',
        '把图片作为构图、角色、色彩或风格参考，不强制将它作为首帧或尾帧。',
      ),
    },
    {
      value: '视频换人物',
      label: t('composer.mode.video.replaceCharacter', '视频换人物'),
      icon: RefreshCw,
      description: t(
        'composer.mode.video.replaceCharacter.description',
        '保留原视频的动作、镜头和节奏，只替换人物身份。需要原视频、目标人物图片，并由专用工作流支持。',
      ),
    },
  ];
  const requestedValue = normalizeVideoGenerationMode(state.params.mode);
  const value = videoModes.some((mode) => mode.value === requestedValue)
    ? requestedValue
    : '文生视频';
  const SelectedIcon = videoModes.find((mode) => mode.value === value)?.icon ?? LayoutTemplate;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (isAudio) {
    const audioModes = ['描述生音乐', '纯音乐', '歌词生音乐'] as const;
    const audioModeLabels: Record<(typeof audioModes)[number], string> = {
      描述生音乐: t('composer.mode.audio.description', '描述生音乐'),
      纯音乐: t('composer.mode.audio.instrumental', '纯音乐'),
      歌词生音乐: t('composer.mode.audio.lyrics', '歌词生音乐'),
    };
    const requestedAudioMode = (state.params.mode as string) ?? '描述生音乐';
    const audioMode = audioModes.some((mode) => mode === requestedAudioMode)
      ? (requestedAudioMode as (typeof audioModes)[number])
      : '描述生音乐';
    return (
      <SelectButton
        value={audioMode}
        options={[...audioModes]}
        onChange={(nextMode) => setParam('mode', nextMode)}
        icon={AudioLines}
        label={audioModeLabels[audioMode]}
        menuLabel={t('composer.mode.audio', '音乐生成模式')}
        getOptionLabel={(option) => audioModeLabels[option]}
      />
    );
  }

  if (!isVideo) {
    const requestedTextValue = (state.params.mode as string) ?? DEFAULT_TEXT_TASK_MODE;
    const selectedTextMode =
      textModes.find((mode) => mode.value === requestedTextValue) ?? textModes[0];
    const textValue = selectedTextMode?.value ?? DEFAULT_TEXT_TASK_MODE;
    const SelectedTextIcon = selectedTextMode?.icon ?? AlignLeft;
    const selectTextMode = (mode: TextTaskMode) => {
      const nextPrompt = applyTextModePrompt(state.prompt, requestedTextValue, mode);
      setParam('mode', mode);
      if (nextPrompt !== state.prompt) setPrompt(nextPrompt);
      if (runtime.primaryNodeId) {
        const composerParams =
          selectedNode?.data.composerParams && typeof selectedNode.data.composerParams === 'object'
            ? (selectedNode.data.composerParams as Record<string, unknown>)
            : {};
        updateNodeData(runtime.primaryNodeId, {
          composerParams: { ...composerParams, mode },
        });
      }
      setOpen(false);
    };
    return (
      <>
        <div ref={controlRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              open
                ? 'border-white/[0.08] bg-white/[0.12] text-white'
                : 'border-white/[0.06] bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <SelectedTextIcon className="h-3 w-3 text-white/65" />
            <span>{selectedTextMode?.displayLabel ?? textValue}</span>
            <ChevronDown
              className={`h-3 w-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {open && (
            <div
              role="listbox"
              aria-label={t('composer.mode.text', '文本处理模式')}
              className="absolute bottom-full left-0 z-40 mb-2 w-[162px] rounded-2xl border border-white/[0.1] bg-[#242424] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
            >
              <div className="px-1.5 pb-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-white/55">
                    {t('composer.mode.text', '文本处理模式')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setEditModesOpen(true);
                    }}
                    title={t('composer.mode.editor.open', '编辑文本处理模式')}
                    aria-label={t('composer.mode.editor.open', '编辑文本处理模式')}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {textModes.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = textValue === mode.value;
                  return (
                    <div
                      key={mode.value}
                      className="relative"
                      onMouseEnter={() => setHoveredTextMode(mode.value)}
                      onMouseLeave={() => setHoveredTextMode(null)}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onFocus={() => setHoveredTextMode(mode.value)}
                        onBlur={() => setHoveredTextMode(null)}
                        onClick={() => selectTextMode(mode.value)}
                        className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-white/[0.16] font-medium text-white'
                            : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                        <span className="min-w-0 flex-1 truncate">{mode.displayLabel}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                      </button>
                      {hoveredTextMode === mode.value && (
                        <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 w-[280px] rounded-lg border border-cyan-200/40 bg-[#12353b] px-3 py-2.5 text-[13px] font-medium leading-6 text-cyan-100 shadow-[0_10px_24px_rgba(0,0,0,0.55)]">
                          <span className="mr-1 font-semibold text-cyan-200">
                            {t('composer.mode.description', '功能说明：')}
                          </span>
                          {mode.displayDetails}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <TextModeEditor open={editModesOpen} onClose={() => setEditModesOpen(false)} />
      </>
    );
  }

  return (
    <div ref={controlRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${open ? 'border-white/[0.08] bg-white/[0.12] text-white' : 'border-white/[0.06] bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white'}`}
      >
        <SelectedIcon className="h-3 w-3 text-white/65" />
        <span>{videoModes.find((mode) => mode.value === value)?.label ?? value}</span>
        <ChevronDown
          className={`h-3 w-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('composer.mode.video', '视频生成模式')}
          className="absolute bottom-full left-0 z-40 mb-2 w-[162px] rounded-2xl border border-white/[0.1] bg-[#242424] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
        >
          <p className="px-1.5 pb-2 pt-1 text-[10px] text-white/35">
            {t('composer.mode.video', '视频生成模式')}
          </p>
          <div className="flex flex-col gap-1">
            {videoModes.map((mode) => {
              const Icon = mode.icon;
              const selected = value === mode.value;
              return (
                <div key={mode.value} className="relative">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHoveredVideoMode(mode.value)}
                    onMouseLeave={() => setHoveredVideoMode(null)}
                    onFocus={() => setHoveredVideoMode(mode.value)}
                    onBlur={() => setHoveredVideoMode(null)}
                    onClick={() => {
                      setParam('mode', mode.value);
                      setOpen(false);
                    }}
                    className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors ${selected ? 'bg-white/[0.16] font-medium text-white' : 'text-white/75 hover:bg-white/[0.08] hover:text-white'}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                    <span>{mode.label}</span>
                  </button>
                  {hoveredVideoMode === mode.value && (
                    <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 w-[280px] rounded-lg border border-cyan-200/40 bg-[#12353b] px-3 py-2.5 text-[13px] font-medium leading-6 text-cyan-100 shadow-[0_10px_24px_rgba(0,0,0,0.55)]">
                      <span className="mr-1 font-semibold text-cyan-200">
                        {t('composer.mode.description', '功能说明：')}
                      </span>
                      {mode.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AdvancedControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const setOpenModal = useCanvasStore((store) => store.setOpenModal);
  const nodeId = runtime.primaryNodeId;
  return (
    <button
      type="button"
      disabled={!nodeId}
      onClick={() => {
        if (nodeId) setOpenModal('node-params', nodeId);
      }}
      className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
      title={
        nodeId
          ? t('composer.advanced.open', '打开高级参数')
          : t('composer.advanced.selectSingle', '多选时请先选定一个节点')
      }
      aria-label={t('composer.advanced.open', '打开高级参数')}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
    </button>
  );
}

function StyleControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const setOpenModal = useCanvasStore((store) => store.setOpenModal);
  const active = runtime.capabilities.includes('style');
  if (!active || !runtime.primaryNodeId) return null;
  return (
    <ControlButton
      onClick={() => setOpenModal('style-library', runtime.primaryNodeId)}
      title={t('composer.style.openHint', '打开风格库并应用到当前图片节点')}
    >
      <Palette className="h-3 w-3" />
      {t('composer.style', '风格')}
    </ControlButton>
  );
}

function EffectsControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const setOpenModal = useCanvasStore((store) => store.setOpenModal);
  if (!runtime.capabilities.includes('effect') || !runtime.primaryNodeId) return null;
  return (
    <ControlButton
      onClick={() => setOpenModal('effects-library', runtime.primaryNodeId)}
      title={t('composer.effects.openHint', '打开特效库并应用到当前视频节点')}
    >
      <Zap className="h-3 w-3" />
      {t('composer.effects', '特效')}
    </ControlButton>
  );
}

function CharacterControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const panelOpen = useCanvasStore((store) => store.panelOpen);
  const setPanelOpen = useCanvasStore((store) => store.setPanelOpen);
  const referencePickerTargetId = useCanvasStore((store) => store.referencePickerTargetId);
  const setReferencePickerTargetId = useCanvasStore((store) => store.setReferencePickerTargetId);
  if (!runtime.capabilities.includes('character') || !runtime.primaryNodeId) return null;
  const picking = panelOpen === 'assets' && referencePickerTargetId === runtime.primaryNodeId;
  return (
    <ControlButton
      active={picking}
      onClick={() => {
        if (picking) {
          setPanelOpen(null);
          setReferencePickerTargetId(null);
          return;
        }
        setReferencePickerTargetId(runtime.primaryNodeId);
        setPanelOpen('assets');
      }}
      title={
        picking
          ? t('composer.assets.close', '关闭资产库')
          : t('composer.assets.selectHint', '从当前画布资产库选择参考素材')
      }
    >
      <FolderOpen className="h-3 w-3" />
      {t('composer.assets', '资产库')}
    </ControlButton>
  );
}

function MarksControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const markPickerTargetId = useCanvasStore((store) => store.markPickerTargetId);
  const setMarkPickerTargetId = useCanvasStore((store) => store.setMarkPickerTargetId);
  const active = runtime.capabilities.includes('mark');
  const picking = markPickerTargetId === runtime.primaryNodeId;
  if (!active || !runtime.primaryNodeId) return null;
  return (
    <ControlButton
      active={picking}
      onClick={() => setMarkPickerTargetId(picking ? null : runtime.primaryNodeId)}
      title={
        picking
          ? t('composer.mark.cancelSelect', '取消选择标记图片')
          : t('composer.mark.selectHint', '从画布选择标记图片')
      }
    >
      <Bookmark className="h-3 w-3" />
      {picking
        ? t('composer.cancelMark', '取消标记')
        : runtime.marks.length
          ? t('composer.mark.count', '标记 {count}', { count: runtime.marks.length })
          : t('composer.mark', '标记')}
    </ControlButton>
  );
}

function FrameControl({ labelKey, fallback }: { labelKey: string; fallback: string }) {
  const { t } = useAppTranslation();
  return (
    <ControlButton>
      <ImageIcon className="h-3 w-3" />
      {t(labelKey, fallback)}
    </ControlButton>
  );
}

function CameraControl() {
  const { runtime } = useComposer();
  const { t } = useAppTranslation();
  const setOpenModal = useCanvasStore((store) => store.setOpenModal);
  if (!runtime.capabilities.includes('camera') || !runtime.primaryNodeId) return null;
  return (
    <ControlButton
      onClick={() => setOpenModal('camera-library', runtime.primaryNodeId)}
      title={t('composer.camera.openHint', '打开运镜库并应用到当前视频节点')}
    >
      <Film className="h-3 w-3" />
      {t('composer.camera', '运镜')}
    </ControlButton>
  );
}

function ContextControl() {
  const { runtime, state } = useComposer();
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const counts = state.references.reduce<Record<ComposerReference['type'], number>>(
    (result, reference) => {
      result[reference.type] += 1;
      return result;
    },
    { image: 0, video: 0, audio: 0, text: 0 },
  );
  const textContext = runtime.textContext ?? [];
  const contextCount =
    state.references.filter((reference) => reference.type !== 'text').length +
    Math.max(counts.text, textContext.length);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={controlRef} className="relative">
      <ControlButton
        active={open}
        onClick={() => setOpen((value) => !value)}
        title={t('composer.context.viewHint', '查看本次会自动提交的上下文')}
      >
        <AlignLeft className="h-3 w-3" />
        {contextCount
          ? t('composer.context.count', '上下文 {count}', { count: contextCount })
          : t('composer.context', '上下文')}
      </ControlButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-xl border border-white/[0.1] bg-[#242424] p-3 text-[11px] leading-relaxed text-white/60 shadow-[0_14px_36px_rgba(0,0,0,0.55)]">
          <p className="font-medium text-white/85">{t('composer.context.auto', '自动上下文')}</p>
          <p className="mt-1">
            {t(
              'composer.context.description',
              '提交时会合并当前指令、直接上游文本，以及下方保留的参考素材。在参考条中删除后，该素材不会进入本次提交。',
            )}
          </p>
          <div className="mt-2 rounded-lg bg-black/20 px-2.5 py-2 text-white/50">
            <div>
              {t('composer.context.selectedNodes', '已选节点：{count}', {
                count: runtime.selectedNodeIds.length,
              })}
            </div>
            <div>
              {t('composer.context.textSources', '只读文本来源：{count}', {
                count: textContext.length,
              })}
            </div>
            <div>
              {t(
                'composer.context.referenceSummary',
                '参考素材：{images} 图片 · {videos} 视频 · {audio} 音频 · {text} 文本',
                {
                  images: counts.image,
                  videos: counts.video,
                  audio: counts.audio,
                  text: counts.text,
                },
              )}
            </div>
          </div>
          {textContext.length > 0 && (
            <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-white/45">
              {textContext.map((content, index) => (
                <p key={content} className="line-clamp-2">
                  {t('composer.context.textSourceIndexed', '来源 {index}：{content}', {
                    index: index + 1,
                    content,
                  })}
                </p>
              ))}
            </div>
          )}
          {contextCount === 0 && (
            <p className="mt-2 text-white/35">
              {t('composer.context.empty', '当前没有上游文本或可见参考素材。')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReferencesControl() {
  const { state, runtime } = useComposer();
  const { t } = useAppTranslation();
  const panelOpen = useCanvasStore((store) => store.panelOpen);
  const setPanelOpen = useCanvasStore((store) => store.setPanelOpen);
  const referencePickerTargetId = useCanvasStore((store) => store.referencePickerTargetId);
  const setReferencePickerTargetId = useCanvasStore((store) => store.setReferencePickerTargetId);
  const count = state.references.length;
  const active = runtime.capabilities.includes('reference');
  const picking = panelOpen !== 'assets' && referencePickerTargetId === runtime.primaryNodeId;
  if (!active || !runtime.primaryNodeId) return null;
  return (
    <ControlButton
      active={picking}
      onClick={() => {
        if (panelOpen === 'assets') setPanelOpen(null);
        setReferencePickerTargetId(picking ? null : runtime.primaryNodeId);
      }}
      title={
        picking
          ? t('composer.reference.cancelSelect', '取消选择参考素材')
          : t('composer.reference.selectHint', '从画布选择图片、视频或音频参考')
      }
    >
      <span className="flex h-3 w-3 items-center justify-center text-[7px]">+</span>
      {picking
        ? t('composer.cancelReference', '取消参考')
        : count > 0
          ? t('composer.reference.count', '参考 {count}', { count })
          : t('composer.reference', '参考')}
    </ControlButton>
  );
}

export const CONTROL_REGISTRY: Record<ComposerControlType, React.ComponentType> = {
  references: ReferencesControl,
  marks: MarksControl,
  style: StyleControl,
  effects: EffectsControl,
  character: CharacterControl,
  startFrame: () => <FrameControl labelKey="composer.frame.start" fallback="首帧" />,
  endFrame: () => <FrameControl labelKey="composer.frame.end" fallback="尾帧" />,
  motion: () => <FrameControl labelKey="composer.frame.motion" fallback="动作" />,
  camera: CameraControl,
  audio: AudioControl,
  context: ContextControl,
  mode: ModeControl,
  videoSettings: VideoSettingsControl,
  prompt: () => null,
  model: ModelControl,
  aspectRatio: AspectRatioControl,
  imageType: ImageTypeControl,
  resolution: ResolutionControl,
  duration: DurationControl,
  fps: FpsControl,
  count: CountControl,
  advanced: AdvancedControl,
};

export function ComposerControl({ type }: { type: ComposerControlType }) {
  const Component = CONTROL_REGISTRY[type];
  if (!Component) return null;
  return <Component />;
}
