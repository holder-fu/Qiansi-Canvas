import { useEffect, useState } from 'react';
import {
  AlignLeft,
  AlertTriangle,
  ArrowUp,
  Camera,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  X,
} from 'lucide-react';
import { ComposerProvider, useComposer } from './ComposerContext';
import { ComposerControl } from './controls';
import type { ComposerControlType } from '../graph/types';
import { PromptEditor } from './PromptEditor';
import { ReferencesStrip } from './ReferencesStrip';
import { useCanvasStore, type GenParams } from '../store/canvasStore';
import type { ComposerReference, ComposerRuntime, ComposerState } from './types';
import { isConfiguredImageType } from '../lib/imageGeneration';
import {
  composerDimensions,
  composerPromptRegionSpacing,
  isCompactComposer,
} from './composerLayout';
import { useAppTranslation } from '../i18n/appI18n';
import type { CameraPromptCue } from '../lib/cameraPrompt';
import { canSubmitTextTask, DEFAULT_TEXT_TASK_MODE } from '../lib/textGeneration';
import { useModelCatalogStore } from '../lib/modelCatalog';
import { hasReadyComposerModel } from './modelSelection';
import { isComposerFooterControl, isComposerHeaderControl } from './controlLayout';
import { excludeTextSourcesFromSubmission } from './referenceSubmission';
import { hasImageTextContext } from './imageTextContext';
import {
  findReadyGenerationModel,
  GENERATION_CAPABILITY_ISSUE_FALLBACKS,
  generationCapabilityIssue,
} from './modelCapability';

interface AICommandComposerProps {
  runtime: ComposerRuntime;
  genParams: GenParams;
  initialPrompt?: string;
  initialReferences?: ComposerReference[];
  initialParams?: Record<string, unknown>;
  isGenerating: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCollapse?: () => void;
  externalSubmitError?: string | null;
  onClearExternalSubmitError?: () => void;
  onPromptChange?: (prompt: string) => void;
  onDraftCommit?: (state: ComposerState) => void;
  onReferenceAdd?: (state: ComposerState) => void;
  onReferenceRemove?: (state: ComposerState) => void;
  onReferenceReorder?: (state: ComposerState) => void;
  onGenParamChange: <K extends keyof GenParams>(key: K, value: GenParams[K]) => void;
  onSubmit: (state: ComposerState) => void | Promise<void>;
}

export function AICommandComposer({
  runtime,
  genParams,
  initialPrompt,
  initialReferences,
  initialParams,
  isGenerating,
  expanded,
  onToggleExpand,
  onCollapse,
  externalSubmitError,
  onClearExternalSubmitError,
  onPromptChange,
  onDraftCommit,
  onReferenceAdd,
  onReferenceRemove,
  onReferenceReorder,
  onGenParamChange,
  onSubmit,
}: AICommandComposerProps) {
  return (
    <ComposerProvider
      runtime={runtime}
      genParams={genParams}
      initialState={{
        prompt: initialPrompt ?? '',
        references: initialReferences ?? [],
        params: initialParams ?? {},
      }}
      onPromptChange={onPromptChange}
      onDraftCommit={onDraftCommit}
      onReferenceAdd={onReferenceAdd}
      onReferenceRemove={onReferenceRemove}
      onReferenceReorder={onReferenceReorder}
      onGenParamChange={onGenParamChange}
      onSubmit={onSubmit}
      isGenerating={isGenerating}
    >
      <ComposerShell
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        onCollapse={onCollapse}
        externalSubmitError={externalSubmitError}
        onClearExternalSubmitError={onClearExternalSubmitError}
      />
    </ComposerProvider>
  );
}

export function CameraPromptChips({ prompts }: { prompts: readonly CameraPromptCue[] }) {
  const { t } = useAppTranslation();
  if (prompts.length === 0) return null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1"
      aria-label={t('composer.camera.selectedPrompts', '已选择的运镜提示词')}
    >
      {prompts.map((cameraPrompt) => (
        <span
          key={cameraPrompt.id}
          data-camera-prompt-chip={cameraPrompt.id}
          title={cameraPrompt.prompt}
          className="inline-flex h-6 select-none items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.055] py-0.5 pl-1 pr-1.5 text-[11px] font-medium leading-none text-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-violet-600 text-white shadow-[0_0_0_1px_rgba(167,139,250,0.28)]">
            <Camera className="h-2.5 w-2.5" strokeWidth={2.2} />
          </span>
          <span>{cameraPrompt.title}</span>
        </span>
      ))}
    </div>
  );
}

export function TextContextReferenceCard({
  sources,
  onRemove,
}: {
  sources: readonly string[];
  onRemove?: () => void;
}) {
  const { t } = useAppTranslation();
  const occurrences = new Map<string, number>();
  const visibleSources = sources
    .map((source) => source.trim())
    .filter(Boolean)
    .map((content) => {
      const occurrence = (occurrences.get(content) ?? 0) + 1;
      occurrences.set(content, occurrence);
      return { content, key: `${content}\u0000${occurrence}` };
    });
  if (visibleSources.length === 0) return null;

  return (
    <div
      data-text-context-reference
      role="note"
      tabIndex={0}
      aria-label={t('composer.context.upstreamCount', '参考文本 {count} 条', {
        count: visibleSources.length,
      })}
      className="group relative mb-2 w-fit outline-none"
    >
      <div className="relative flex h-12 w-12 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.09] text-white/65 shadow-[0_4px_12px_rgba(0,0,0,0.24)] transition-colors group-hover:border-white/20 group-hover:bg-white/[0.13] group-focus-visible:border-cyan-300/55 group-focus-visible:ring-1 group-focus-visible:ring-cyan-300/35">
        <AlignLeft className="h-5 w-5" strokeWidth={2.1} />
        <span
          data-text-context-count
          className="pointer-events-none invisible absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-[#242425] bg-[#555558] px-1 text-[9px] font-medium tabular-nums leading-none text-white/90 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          {visibleSources.length}
        </span>
        {onRemove && (
          <button
            type="button"
            data-text-context-remove
            title={t('composer.context.removeUpstream', '关闭并移除参考文本')}
            aria-label={t('composer.context.removeUpstream', '关闭并移除参考文本')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="invisible absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#242425] bg-[#555558] text-white/75 opacity-0 transition-[background-color,color,opacity,visibility] duration-150 hover:bg-[#6a6a6e] hover:text-white group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            <X className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
        )}
      </div>

      <div
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-2 w-72 translate-y-1 rounded-lg border border-white/[0.12] bg-[#111113]/98 px-3 py-2.5 text-left text-[11px] leading-[1.45] text-white/82 opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.6)] transition-[opacity,transform,visibility] duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <p className="mb-1.5 font-medium text-white/50">
          {t('composer.context.upstreamPrompt', '参考文本')}
        </p>
        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {visibleSources.map((source, index) => (
            <p key={source.key} className="whitespace-pre-wrap break-words">
              {visibleSources.length > 1 && (
                <span className="mr-1 text-cyan-200/70">
                  {t('composer.context.sourceNumber', '来源 {index}', { index: index + 1 })}
                </span>
              )}
              {source.content}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ComposerErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div
      role="alert"
      className="absolute bottom-12 left-2 right-2 z-20 flex items-start gap-2 rounded-md border border-rose-400/25 bg-[#351f23]/95 py-1.5 pl-2.5 pr-1.5 text-[11px] leading-4 text-rose-200 shadow-lg backdrop-blur"
    >
      <span className="min-w-0 flex-1">
        {t('composer.error.sendFailed', '发送失败：{message}', { message })}
      </span>
      <button
        type="button"
        title={t('composer.error.dismiss', '关闭错误提示')}
        aria-label={t('composer.error.dismiss', '关闭错误提示')}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-rose-100/55 transition-colors hover:bg-white/10 hover:text-rose-100"
        onClick={onDismiss}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ComposerSubmitIndicator({
  isGenerating,
  hasReferences,
  promptLength,
  contextLength = 0,
  textComposer = false,
  compactAudio,
  requestOwnerLabel,
}: {
  isGenerating: boolean;
  hasReferences: boolean;
  promptLength: number;
  contextLength?: number;
  textComposer?: boolean;
  compactAudio: boolean;
  requestOwnerLabel?: string;
}) {
  const { t } = useAppTranslation();
  if (!isGenerating) {
    return (
      <span className="whitespace-nowrap text-[11px] tabular-nums text-white/30">
        {compactAudio
          ? `${promptLength}/1024`
          : textComposer
            ? contextLength > 0
              ? t('composer.textCount.withContext', '指令 {instruction} 字 · 上下文 {context} 字', {
                  instruction: promptLength,
                  context: contextLength,
                })
              : t('composer.textCount.instruction', '指令 {count} 字', {
                  count: promptLength,
                })
            : t('composer.wordCount', '字数 {count}', { count: promptLength })}
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1 text-[11px] text-cyan-200/75"
    >
      <LoaderCircle className="h-3 w-3 animate-spin" />
      <span data-generation-request-lock>
        {hasReferences
          ? t('composer.status.analyzingReferences', '正在分析参考图…')
          : t('composer.status.executing', '正在执行指令…')}
        {requestOwnerLabel ? ` · ${requestOwnerLabel}` : ''}
      </span>
    </span>
  );
}

function ComposerShell({
  expanded: propsExpanded,
  onToggleExpand: propsOnToggleExpand,
  onCollapse,
  externalSubmitError,
  onClearExternalSubmitError,
}: {
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCollapse?: () => void;
  externalSubmitError?: string | null;
  onClearExternalSubmitError?: () => void;
}) {
  const { runtime, state, genParams, submit, submitError, clearSubmitError, isGenerating } =
    useComposer();
  const { t } = useAppTranslation();
  const updateNodeData = useCanvasStore((store) => store.updateNodeData);
  const readyTextModels = useModelCatalogStore((catalog) => catalog.readyModels.chat);
  const readyImageModels = useModelCatalogStore((catalog) => catalog.readyModels.image);
  const readyVideoModels = useModelCatalogStore((catalog) => catalog.readyModels.video);
  const readyAudioModels = useModelCatalogStore((catalog) => catalog.readyModels.audio);
  const ready3dModels = useModelCatalogStore((catalog) => catalog.readyModels['3d']);
  const nodeGenerationError = useCanvasStore((store) => {
    if (!runtime.primaryNodeId) return null;
    const value = store.nodes.find((node) => node.id === runtime.primaryNodeId)?.data
      .generationError;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  });
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = propsExpanded ?? internalExpanded;
  const onToggleExpand = propsOnToggleExpand ?? (() => setInternalExpanded((v) => !v));
  const compactAudioComposer = runtime.spec.type === 'audio' && !expanded;
  const compactComposer = isCompactComposer(runtime.spec.type, expanded);
  const dimensions = composerDimensions(runtime.spec.type, expanded);
  const textContextLength = (runtime.textContext ?? []).reduce(
    (total, content) => total + content.length,
    0,
  );
  const textRequestNeedsVision =
    runtime.spec.type === 'text' &&
    (state.references.some(
      (reference) => reference.type === 'image' || reference.type === 'video',
    ) ||
      runtime.marks.some((mark) => typeof mark.sourceUrl === 'string' && mark.sourceUrl.trim()));
  const textModelReady =
    runtime.spec.type !== 'text' ||
    hasReadyComposerModel(readyTextModels, state.params, textRequestNeedsVision);
  const readyVisualModels =
    runtime.spec.type === 'image'
      ? readyImageModels
      : runtime.spec.type === 'video'
        ? readyVideoModels
        : runtime.spec.type === 'audio'
          ? readyAudioModels
          : runtime.spec.type === '3d'
            ? ready3dModels
            : [];
  const selectedVisualModel = findReadyGenerationModel(readyVisualModels, state.params);
  const visualCapabilityIssue =
    runtime.spec.type === 'image' || runtime.spec.type === 'video'
      ? generationCapabilityIssue(selectedVisualModel, {
          kind: runtime.spec.type,
          references: state.references,
          additionalImageReferenceUrls: runtime.marks.flatMap((mark) =>
            typeof mark.sourceUrl === 'string' && mark.sourceUrl.trim() ? [mark.sourceUrl] : [],
          ),
          count: genParams.count,
          mode: state.params.mode,
          videoTool: runtime.videoTool,
        })
      : null;
  const selectedTextModel = findReadyGenerationModel(readyTextModels, state.params);
  const selectedMediaModel = findReadyGenerationModel(readyVisualModels, state.params);
  const maskedRepairBlocked =
    runtime.spec.type === 'video' &&
    runtime.videoTool === 'masked-repair' &&
    visualCapabilityIssue !== null;
  const currentRequestOwner =
    selectedMediaModel?.label ??
    selectedTextModel?.label ??
    (typeof state.params.model === 'string' ? state.params.model : undefined);
  const [requestOwnerSnapshot, setRequestOwnerSnapshot] = useState(currentRequestOwner);
  useEffect(() => {
    if (isGenerating) return;
    setRequestOwnerSnapshot((current) =>
      current === currentRequestOwner ? current : currentRequestOwner,
    );
  }, [currentRequestOwner, isGenerating]);
  const removeTextContext = () => {
    const nodeId = runtime.primaryNodeId;
    if (!nodeId) return;
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    if (!node) return;
    updateNodeData(nodeId, {
      composerReferenceSubmission: excludeTextSourcesFromSubmission(
        node.data.composerReferenceSubmission,
        runtime.textContext ?? [],
      ),
    });
  };

  const ExpandIcon = expanded ? Minimize2 : Maximize2;
  const expandTitle = expanded
    ? t('composer.resize.restore', '缩回原来大小')
    : t('composer.resize.expand', '放大指令框');
  const hasSubmittableContent =
    runtime.spec.type === 'text'
      ? canSubmitTextTask(
          state.prompt,
          state.params.mode ?? DEFAULT_TEXT_TASK_MODE,
          runtime.textContext?.length ?? 0,
        ) && textModelReady
      : Boolean(state.prompt.trim()) ||
        (runtime.spec.type === 'image' && hasImageTextContext(runtime.textContext ?? [])) ||
        Boolean(runtime.cameraPrompts?.length) ||
        runtime.allowEmptyPromptSubmit === true ||
        (runtime.spec.type === 'image' &&
          isConfiguredImageType(state.params.imageType, state.params.imageTypePrompt));
  const canSubmit =
    hasSubmittableContent &&
    (runtime.spec.type === 'image' || runtime.spec.type === 'video'
      ? visualCapabilityIssue === null
      : runtime.spec.type === 'audio' || runtime.spec.type === '3d'
        ? Boolean(selectedMediaModel)
        : true);
  const visibleSubmitError = externalSubmitError || submitError || nodeGenerationError;
  const footerControls = runtime.spec.controls.filter(isComposerFooterControl);
  const submitTitle = isGenerating
    ? state.references.length
      ? t('composer.status.analyzingReferencesShort', '正在分析参考图')
      : t('composer.status.executingShort', '正在执行指令')
    : runtime.spec.type === 'text' && !textModelReady
      ? t('composer.model.selectBeforeSubmit', '请先选择一个可用的文本模型')
      : (runtime.spec.type === 'audio' || runtime.spec.type === '3d') && !selectedMediaModel
        ? t('composer.model.selectBeforeSubmit', '请先选择一个可用的{kind}模型', {
            kind: runtime.spec.type === 'audio' ? '音频' : '3D',
          })
        : visualCapabilityIssue
          ? t(
              `composer.model.capability.${visualCapabilityIssue}`,
              GENERATION_CAPABILITY_ISSUE_FALLBACKS[visualCapabilityIssue],
            )
          : t('composer.submit', '发送（Ctrl+Enter）');

  return (
    <div
      data-theme-role="node-composer"
      aria-busy={isGenerating}
      style={dimensions}
      className={`relative flex flex-col overflow-visible rounded-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)] ${
        compactComposer ? 'bg-[#242425]' : 'bg-[#1E1E21]'
      }`}
    >
      {/* Header context tools */}
      <div
        inert={isGenerating ? true : undefined}
        className={`items-center justify-between px-2 pt-2 ${compactComposer ? 'hidden' : 'flex'} ${isGenerating ? 'pointer-events-none opacity-55' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1">
          {runtime.spec.controls.filter(isComposerHeaderControl).map((c: ComposerControlType) => (
            <ComposerControl key={c} type={c} />
          ))}
        </div>
      </div>

      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="absolute right-9 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          title={t('composer.collapse', '收起指令框')}
          aria-label={t('composer.collapse', '收起指令框')}
        >
          <PanelBottomClose className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Expand / size toggle */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
        title={expandTitle}
        aria-label={expandTitle}
      >
        <ExpandIcon className="h-3.5 w-3.5" />
      </button>

      {/* Reference strip */}
      {runtime.capabilities.includes('reference') && runtime.primaryNodeId && (
        <div
          inert={isGenerating ? true : undefined}
          className={isGenerating ? 'pointer-events-none opacity-55' : undefined}
        >
          <ReferencesStrip />
        </div>
      )}
      {runtime.marks.length > 0 && (
        <div
          inert={isGenerating ? true : undefined}
          className={`flex flex-wrap gap-1.5 px-2 pb-2 ${isGenerating ? 'pointer-events-none opacity-55' : ''}`}
        >
          {runtime.marks.map((mark) => (
            <span
              key={mark.id}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300/20 bg-amber-300/10 py-1 pl-2 pr-1 text-[11px] text-amber-100"
            >
              {mark.label} · {mark.category}
              <button
                type="button"
                className="rounded p-0.5 text-amber-100/50 hover:bg-white/10 hover:text-amber-100"
                title={t('composer.mark.remove', '删除标记')}
                aria-label={t('composer.mark.removeNamed', '删除标记 {name}', {
                  name: mark.label,
                })}
                onClick={() => {
                  if (!runtime.primaryNodeId) return;
                  updateNodeData(runtime.primaryNodeId, {
                    composerMarks: runtime.marks.filter((item) => item.id !== mark.id),
                  });
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {maskedRepairBlocked && (
        <div
          role="alert"
          className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-400/[0.08] px-3 py-2 text-[12px] leading-5 text-amber-100/85"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t(
              'videoMaskRepair.model.sendBlocked',
              '当前所选模型不支持真实的时序蒙版修复，发送已禁用；不会退化为普通视频重生成。',
            )}
          </span>
        </div>
      )}

      {/* Prompt editor */}
      <div
        data-composer-prompt-region={runtime.spec.type}
        className={`flex min-h-0 flex-1 flex-col pb-2 ${composerPromptRegionSpacing(
          runtime.spec.type,
          expanded,
          runtime.capabilities.includes('reference') && Boolean(runtime.primaryNodeId),
        )}`}
      >
        {runtime.spec.type === 'text' && (
          <TextContextReferenceCard
            sources={runtime.textContext ?? []}
            onRemove={runtime.primaryNodeId && !isGenerating ? removeTextContext : undefined}
          />
        )}
        <CameraPromptChips prompts={runtime.cameraPrompts ?? []} />
        {runtime.submissionPromptPreview && (
          <div
            className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] leading-6 text-white/78"
            aria-label={t('composer.remake.submitPreview', '片段重拍提交提示')}
          >
            <span>{runtime.submissionPromptPreview.prefix}</span>
            {runtime.submissionPromptPreview.ranges.length > 0 ? (
              runtime.submissionPromptPreview.ranges.map((range) => (
                <span
                  key={range}
                  className="inline-flex h-6 items-center rounded-md border border-white/10 bg-white/[0.08] px-2 text-[12px] tabular-nums text-white/90"
                >
                  {range}
                </span>
              ))
            ) : (
              <span className="text-white/35">
                {t('composer.remake.selectSegments', '请先在上方时间轴选择重拍片段')}
              </span>
            )}
            {runtime.submissionPromptPreview.ranges.length > 0 && (
              <span>{runtime.submissionPromptPreview.suffix}</span>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <PromptEditor compact={compactComposer} expanded={expanded} />
        </div>
      </div>

      {visibleSubmitError && (
        <ComposerErrorBanner
          message={visibleSubmitError}
          onDismiss={() => {
            clearSubmitError();
            onClearExternalSubmitError?.();
            if (runtime.primaryNodeId) {
              updateNodeData(runtime.primaryNodeId, { generationError: undefined });
            }
          }}
        />
      )}

      {/* Keep the controls above the compact editor's minimum-height overflow so clicks reach them. */}
      <div
        data-composer-footer
        className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] bg-inherit px-2 py-2"
      >
        <div
          inert={isGenerating ? true : undefined}
          className={`min-w-0 flex-1 ${runtime.spec.type === 'video' ? 'flex flex-nowrap items-center gap-1.5' : 'flex flex-wrap items-center gap-1.5'} ${isGenerating ? 'pointer-events-none opacity-55' : ''}`}
        >
          {footerControls.map((control: ComposerControlType) => (
            <ComposerControl key={control} type={control} />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isGenerating && (
            <ComposerSubmitIndicator
              isGenerating={false}
              hasReferences={state.references.length > 0}
              promptLength={state.prompt.length}
              contextLength={textContextLength}
              textComposer={runtime.spec.type === 'text'}
              compactAudio={compactAudioComposer}
              requestOwnerLabel={requestOwnerSnapshot}
            />
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || isGenerating}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 disabled:scale-100 disabled:bg-white/30 disabled:text-white/50"
            title={submitTitle}
            aria-label={submitTitle}
          >
            {isGenerating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
