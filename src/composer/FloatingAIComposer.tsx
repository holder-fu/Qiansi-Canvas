import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNodes, useStore } from '@xyflow/react';
import { PanelBottomOpen } from 'lucide-react';
import { useCanvasStore, type GenParams } from '../store/canvasStore';
import type { NodeKind, FlowNode } from '../canvas/nodeTypes';
import { AICommandComposer } from './AICommandComposer';
import {
  getComposerSpec,
  mergeCapabilities,
  mergeComposerSpec,
  outputAssetType,
} from '../graph/nodeSpecs';
import type { ComposerRuntime, ComposerState } from './types';
import { NODE_W, NODE_H } from '../canvas/constants';
import { stripLegacyImageTypePrefix } from '../lib/imageGeneration';
import { mergePersistedModelSelection } from './modelSelection';
import { sanitizeTextComposerParams } from './textComposerParams';
import { mediaFrameSize } from '../canvas/mediaFrameSize';
import {
  buildComposerReferencePatch,
  filterExcludedComposerReferences,
  filterExcludedTextSources,
  orderComposerReferences,
} from './referenceSubmission';
import {
  calculateComposerPlacement,
  calculateComposerRestorePlacement,
  composerDimensions,
  selectedVisualBounds,
  type ComposerPlacement,
  type ScreenBounds,
} from './composerLayout';
import { VideoRemakeRangeStrip } from './VideoRemakeRangeStrip';
import type { VideoTrimRange } from '../lib/videoTrim';
import {
  connectedReferences,
  dedupeComposerReferences,
  manualReferences,
  visibleComposerReferences,
} from './referenceResolution';
import { collectNodeInputs } from '../graph/graph';
import {
  canShowFloatingComposer,
  multiSelectedNodesForComposer,
  singleSelectedNodeForComposer,
} from './composerVisibility';
import { buildVideoRemakePromptPreview } from './videoRemakePrompt';
import { useAppTranslation } from '../i18n/appI18n';
import { useVideoEditingUi } from '../store/videoEditingUi';
import {
  mergeCameraPrompts,
  resolveCameraPromptCues,
  stripCameraPrompt,
} from '../lib/cameraPrompt';
import { DEFAULT_TEXT_TASK_MODE, resolveTextTaskInput } from '../lib/textGeneration';
import { buildImagePromptWithTextContext } from './imageTextContext';
import { composerPromptPatch, composerPromptValue } from './promptPersistence';
import { normalizeVideoGenerationMode, requestedVideoAudio } from '../lib/videoGenerationMode';
import { useCanvasPreferences } from '../store/canvasPreferences';
import { composerVisibilityShortcutAction } from './composerVisibilityShortcut';

function referenceVersion(url?: string) {
  if (!url) return 'none';
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(url.length / 128));
  for (let index = 0; index < url.length; index += step) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${url.length}-${(hash >>> 0).toString(36)}`;
}

type ComposerLayout = {
  bounds: ScreenBounds;
  position: ComposerPlacement;
};

function useComposerLayout(
  nodes: FlowNode[],
  expanded: boolean,
  composerHeight: number,
): ComposerLayout | null {
  const transform = useStore((s) => s.transform);
  const nodeLookup = useStore((s) => s.nodeLookup);
  const [tx, ty, zoom] = transform;

  return useMemo(() => {
    if (nodes.length === 0) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of nodes) {
      const assetType = outputAssetType(n.data.kind);
      const isMediaNode = assetType === 'image' || assetType === 'video';
      const mediaSize = isMediaNode ? mediaFrameSize(n.data.aspectRatio) : null;
      // React Flow's measured box includes the visible frame border. Prefer it
      // over the media content size so the requested gap starts at the real edge.
      const w = n.measured?.width ?? n.width ?? mediaSize?.width ?? NODE_W;
      const h = n.measured?.height ?? n.height ?? mediaSize?.height ?? NODE_H;
      const absolutePosition = nodeLookup.get(n.id)?.internals.positionAbsolute ?? n.position;
      const sx = absolutePosition.x * zoom + tx;
      const sy = absolutePosition.y * zoom + ty;
      minX = Math.min(minX, sx);
      minY = Math.min(minY, sy);
      maxX = Math.max(maxX, sx + w * zoom);
      maxY = Math.max(maxY, sy + h * zoom);
    }

    const bounds = selectedVisualBounds({ minX, minY, maxX, maxY }, zoom, nodes.length);
    return {
      bounds,
      position: calculateComposerPlacement({
        bounds,
        composerHeight,
        expanded,
        viewportWidth: vw,
        viewportHeight: vh,
      }),
    };
  }, [nodes, tx, ty, zoom, expanded, composerHeight, nodeLookup]);
}

export function FloatingAIComposer() {
  const { t } = useAppTranslation();
  const nodes = useNodes<FlowNode>();
  const edges = useCanvasStore((state) => state.edges);
  const activeTrimNodeId = useVideoEditingUi((state) => state.activeTrimNodeId);
  const previewVideoRemakeFrame = useVideoEditingUi((state) => state.previewVideoRemakeFrame);
  const selectedCanvasNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const multiSelected = useMemo(() => {
    const candidates = multiSelectedNodesForComposer(nodes);
    return candidates.some((node) => node.id === activeTrimNodeId) ? [] : candidates;
  }, [activeTrimNodeId, nodes]);

  const [composerView, setComposerView] = useState({
    selectionKey: '',
    collapsed: false,
    expanded: false,
  });
  const selectionKey = useMemo(
    () =>
      selectedCanvasNodes
        .map((node) => node.id)
        .sort()
        .join(':'),
    [selectedCanvasNodes],
  );
  const viewMatchesSelection = composerView.selectionKey === selectionKey;
  const collapsed = viewMatchesSelection && composerView.collapsed;
  const expanded = viewMatchesSelection && composerView.expanded;
  const selected = useMemo(() => {
    const single = singleSelectedNodeForComposer(nodes);
    if (single) {
      return canShowFloatingComposer(
        single,
        edges.some((edge) => edge.target === single.id),
        single.id === activeTrimNodeId,
      )
        ? [single]
        : [];
    }
    return multiSelected.length > 1 && viewMatchesSelection && !collapsed ? multiSelected : [];
  }, [activeTrimNodeId, collapsed, edges, multiSelected, nodes, viewMatchesSelection]);

  const generateNode = useCanvasStore((s) => s.generateNode);
  const genParams = useCanvasStore((s) => s.genParams);
  const setGenParams = useCanvasStore((s) => s.setGenParams);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const openModal = useCanvasStore((s) => s.openModal);
  const editingShortcutsEnabled = useCanvasPreferences((state) => state.editingShortcutsEnabled);

  const generatingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of selected) {
      if (node.data.generating) ids.add(node.id);
    }
    return ids;
  }, [selected]);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    selectionKey: string;
    running: boolean;
    error: string | null;
  }>({ selectionKey: '', running: false, error: null });

  const feedbackMatchesSelection = submissionFeedback.selectionKey === selectionKey;

  const runtime = useMemo<ComposerRuntime | null>(() => {
    if (selected.length === 0) return null;
    const firstNode = selected[0];
    if (!firstNode) return null;
    const kinds = selected.map((n) => n.data.kind);
    const firstKind = kinds[0];
    if (!firstKind) return null;
    const spec = selected.length === 1 ? getComposerSpec(firstKind) : mergeComposerSpec(kinds);
    const capabilities = mergeCapabilities(kinds);
    const primaryNodeId = selected.length === 1 ? firstNode.id : null;
    const connected = filterExcludedComposerReferences(
      connectedReferences(selected, nodes, edges),
      selected.length === 1 ? firstNode.data.composerReferenceSubmission : undefined,
    );
    // Explicit references are merged after exclusion filtering. This lets a user deliberately
    // re-add an image that had previously been removed from automatic upstream context.
    const references = orderComposerReferences(
      visibleComposerReferences(
        spec.type,
        dedupeComposerReferences([
          ...connected,
          ...manualReferences(selected.length === 1 ? firstNode : undefined),
        ]),
      ),
      selected.length === 1 ? firstNode.data.composerReferenceSubmission : undefined,
    );
    const marks = Array.isArray(firstNode.data.composerMarks) ? firstNode.data.composerMarks : [];
    const composerParams =
      firstNode.data.composerParams && typeof firstNode.data.composerParams === 'object'
        ? firstNode.data.composerParams
        : {};
    const cameraPrompts =
      selected.length === 1
        ? resolveCameraPromptCues(firstNode.data.cameraPresets, {
            id: composerParams.cameraPresetId,
            title: firstNode.data.cameraPreset,
            prompt: firstNode.data.cameraPrompt,
          })
        : [];
    const remakeSegments =
      composerParams.videoTool === 'remake' && Array.isArray(firstNode.data.videoRemakeSegments)
        ? firstNode.data.videoRemakeSegments
        : [];
    const upstreamTextContext =
      selected.length === 1
        ? filterExcludedTextSources(
            collectNodeInputs(nodes, edges, firstNode.id).prompt,
            firstNode.data.composerReferenceSubmission,
          )
        : [];
    const textTask =
      selected.length === 1 && firstKind === 'text'
        ? resolveTextTaskInput({
            upstreamTexts: upstreamTextContext,
            prompt: firstNode.data.prompt,
            textInstruction: firstNode.data.textInstruction,
            contentRole: firstNode.data.textContentRole,
          })
        : undefined;

    return {
      spec,
      capabilities,
      primaryNodeId,
      selectedNodeIds: selected.map((n) => n.id),
      references,
      marks,
      textContext:
        firstKind === 'text'
          ? textTask?.sourceTexts
          : firstKind === 'image'
            ? upstreamTextContext
            : undefined,
      cameraPrompts,
      placeholder: '',
      submissionPromptPreview:
        composerParams.videoTool === 'remake'
          ? buildVideoRemakePromptPreview(remakeSegments)
          : undefined,
      allowEmptyPromptSubmit: composerParams.videoTool === 'remake' && remakeSegments.length > 0,
      videoTool:
        typeof composerParams.videoTool === 'string' ? composerParams.videoTool : undefined,
      videoAudioSelectionExplicit: composerParams.videoAudioSelectionExplicit === true,
    };
  }, [selected, nodes, edges]);

  const dimensions = composerDimensions(runtime?.spec.type ?? 'generic', expanded);
  const layout = useComposerLayout(selected, expanded, dimensions.height);
  const selectedPrimaryNodeId = selected.length === 1 ? selected[0]?.id : undefined;
  const visibilityShortcutAvailable = selected.length === 1 || multiSelected.length > 1;
  useEffect(() => {
    if (!visibilityShortcutAvailable || !editingShortcutsEnabled || openModal !== null) return;

    const handleVisibilityShortcut = (event: KeyboardEvent) => {
      const action = composerVisibilityShortcutAction(event);
      if (!action) return;

      event.preventDefault();
      setComposerView((current) => ({
        selectionKey,
        collapsed: action === 'collapse',
        expanded: current.selectionKey === selectionKey && current.expanded,
      }));
    };

    window.addEventListener('keydown', handleVisibilityShortcut);
    return () => window.removeEventListener('keydown', handleVisibilityShortcut);
  }, [editingShortcutsEnabled, openModal, selectionKey, visibilityShortcutAvailable]);

  const handleRemakeRangeChange = useCallback(
    (segments: VideoTrimRange[]) => {
      if (!selectedPrimaryNodeId) return;
      updateNodeData(selectedPrimaryNodeId, {
        videoRemakeSegments: segments,
      });
    },
    [selectedPrimaryNodeId, updateNodeData],
  );
  const handleRemakePreviewTimeChange = useCallback(
    (time: number) => {
      if (!selectedPrimaryNodeId) return;
      previewVideoRemakeFrame(selectedPrimaryNodeId, time);
    },
    [previewVideoRemakeFrame, selectedPrimaryNodeId],
  );
  const handlePromptChange = useCallback(
    (prompt: string) => {
      if (!selectedPrimaryNodeId) return;
      const node = useCanvasStore
        .getState()
        .nodes.find((candidate) => candidate.id === selectedPrimaryNodeId);
      if (!node || composerPromptValue(node) === prompt) return;
      updateNodeData(selectedPrimaryNodeId, composerPromptPatch(node.data.kind, prompt));
    },
    [selectedPrimaryNodeId, updateNodeData],
  );

  const handleReferenceStateChange = useCallback(
    (state: ComposerState) => {
      if (!selectedPrimaryNodeId || !runtime) return;
      const node = useCanvasStore
        .getState()
        .nodes.find((item) => item.id === selectedPrimaryNodeId);
      if (!node) return;
      updateNodeData(node.id, {
        ...buildComposerReferencePatch(
          runtime.references,
          state.references,
          node.data.composerReferenceSubmission,
        ),
        // Changing the reference key remounts the editor; retain its current draft parameters.
        composerParams: { ...node.data.composerParams, ...state.params },
        ...composerPromptPatch(node.data.kind, state.prompt),
      });
    },
    [runtime, selectedPrimaryNodeId, updateNodeData],
  );

  const handleDraftCommit = useCallback(
    (state: ComposerState) => {
      // Multi-selection drafts have no single persisted owner. Do not discard them
      // by claiming the page is safe to reload.
      if (!selectedPrimaryNodeId)
        throw new Error('Complete the multi-selection instruction before updating.');
      handleReferenceStateChange(state);
    },
    [handleReferenceStateChange, selectedPrimaryNodeId],
  );

  if (!layout || !runtime) return null;

  const restorePosition = calculateComposerRestorePlacement({
    bounds: layout.bounds,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  const isGenerating =
    generatingIds.size > 0 || (feedbackMatchesSelection && submissionFeedback.running);
  const primaryNode = selected.length === 1 ? selected[0] : undefined;

  const handleGenParamChange = <K extends keyof GenParams>(key: K, value: GenParams[K]) => {
    setGenParams({ [key]: value } as Partial<GenParams>);
    const frameAspectRatio =
      key === 'aspectRatio'
        ? (value as GenParams['aspectRatio'])
        : key === 'videoAspectRatio' && value !== 'Auto'
          ? (value as Exclude<NonNullable<GenParams['videoAspectRatio']>, 'Auto'>)
          : undefined;
    for (const node of selected) {
      const composerParams =
        node.data.composerParams && typeof node.data.composerParams === 'object'
          ? node.data.composerParams
          : {};
      updateNodeData(node.id, {
        ...(frameAspectRatio ? { aspectRatio: frameAspectRatio } : {}),
        ...(key === 'audio' && node.data.kind === 'video'
          ? {
              composerParams: {
                ...composerParams,
                videoAudioSelectionExplicit: true,
              },
            }
          : {}),
        genParams: {
          ...node.data.genParams,
          [key]: value,
        },
      });
    }
  };

  const handleSubmit = async (state: ComposerState) => {
    setSubmissionFeedback({ selectionKey, running: true, error: null });
    try {
      const submittedPrompt = mergeCameraPrompts(state.prompt.trim(), runtime.cameraPrompts ?? []);
      const providerId =
        typeof state.params.providerId === 'string' ? state.params.providerId.trim() : '';
      const model = typeof state.params.model === 'string' ? state.params.model.trim() : '';
      const providerSelection = providerId && model ? { providerId, model } : {};
      const currentVideoAudioSelectionExplicit =
        runtime.spec.type === 'video' &&
        (runtime.videoAudioSelectionExplicit === true ||
          runtime.selectedNodeIds.some((nodeId) => {
            const current = useCanvasStore
              .getState()
              .nodes.find((candidate) => candidate.id === nodeId);
            return current?.data.composerParams?.videoAudioSelectionExplicit === true;
          }));
      const submittedComposerParams = {
        ...state.params,
        ...(currentVideoAudioSelectionExplicit ? { videoAudioSelectionExplicit: true } : {}),
      };
      if (selected.length === 1 && primaryNode) {
        const referencePatch = buildComposerReferencePatch(
          runtime.references,
          state.references,
          primaryNode.data.composerReferenceSubmission,
        );
        if (primaryNode.data.kind === 'text') {
          updateNodeData(primaryNode.id, {
            textInstruction: state.prompt.trim() || undefined,
            composerParams: {
              mode: DEFAULT_TEXT_TASK_MODE,
              ...sanitizeTextComposerParams(state.params),
            },
            ...referencePatch,
            ...providerSelection,
          });
          await generateNode(primaryNode.id);
        } else {
          updateNodeData(primaryNode.id, {
            prompt: submittedPrompt,
            composerParams: submittedComposerParams,
            ...referencePatch,
            ...providerSelection,
          });
          await generateNode(
            primaryNode.id,
            primaryNode.data.kind === 'image'
              ? buildImagePromptWithTextContext(runtime.textContext ?? [], submittedPrompt)
              : submittedPrompt,
          );
        }
        return;
      }

      const targetKind = resolveMultiSelectTargetKind(selected);
      const bbox = selectedBoundingBox(selected);
      const newNodeId = addNode(targetKind, {
        x: bbox.centerX - NODE_W / 2,
        y: bbox.maxY + 80,
      });
      if (!newNodeId) {
        throw new Error(
          t(
            'canvasShell.composer.error.createNode',
            '未能创建用于执行该指令的新节点，请重新选择节点后再试。',
          ),
        );
      }

      updateNodeData(newNodeId, {
        prompt: submittedPrompt,
        composerParams: submittedComposerParams,
        ...buildComposerReferencePatch(runtime.references, state.references),
        genParams: { ...genParams },
        aspectRatio: genParams.aspectRatio,
        ...providerSelection,
      });

      for (const n of selected) {
        onConnect({ source: n.id, target: newNodeId, sourceHandle: null, targetHandle: null });
      }

      await generateNode(newNodeId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('canvasShell.composer.error.send', '发送失败，请稍后重试。');
      setSubmissionFeedback({ selectionKey, running: false, error: message });
      throw error;
    } finally {
      setSubmissionFeedback((current) =>
        current.selectionKey === selectionKey ? { ...current, running: false } : current,
      );
    }
  };

  const savedComposerParams =
    (primaryNode?.data.composerParams as Record<string, unknown> | undefined) ?? {};
  const nodeGenParams = (primaryNode?.data.genParams as Partial<GenParams> | undefined) ?? {};
  const effectiveGenParams = {
    ...genParams,
    ...nodeGenParams,
    ...(runtime.spec.type === 'video'
      ? {
          audio: requestedVideoAudio(
            savedComposerParams.videoAudioSelectionExplicit === true,
            nodeGenParams.audio,
          ),
        }
      : {}),
    ...(runtime.spec.type === 'audio' && nodeGenParams.duration == null ? { duration: 30 } : {}),
  };
  const savedInitialParams = mergePersistedModelSelection(savedComposerParams, primaryNode?.data);
  const initialParams =
    runtime.spec.type === 'video'
      ? { ...savedInitialParams, mode: normalizeVideoGenerationMode(savedInitialParams.mode) }
      : runtime.spec.type === 'text'
        ? {
            mode: DEFAULT_TEXT_TASK_MODE,
            ...sanitizeTextComposerParams(savedInitialParams),
          }
        : savedInitialParams;
  const initialImageType =
    typeof initialParams.imageType === 'string' ? initialParams.imageType : undefined;
  const connectedTextInputs = primaryNode
    ? filterExcludedTextSources(
        collectNodeInputs(nodes, edges, primaryNode.id).prompt,
        primaryNode.data.composerReferenceSubmission,
      )
    : [];
  const resolvedTextTask =
    primaryNode?.data.kind === 'text'
      ? resolveTextTaskInput({
          upstreamTexts: connectedTextInputs,
          prompt: primaryNode.data.prompt,
          textInstruction: primaryNode.data.textInstruction,
          contentRole: primaryNode.data.textContentRole,
        })
      : undefined;
  const savedPrompt = stripLegacyImageTypePrefix(
    stripCameraPrompt((primaryNode?.data.prompt as string | undefined) || ''),
    initialImageType,
  );
  const connectedPrompt = stripLegacyImageTypePrefix(
    connectedTextInputs.join('\n'),
    initialImageType,
  );
  const initialPrompt = resolvedTextTask
    ? resolvedTextTask.instruction
    : primaryNode?.data.kind === 'image'
      ? savedPrompt
      : connectedPrompt || savedPrompt;
  const remakeVideoUrl =
    primaryNode?.data.kind === 'video' && savedComposerParams.videoTool === 'remake'
      ? runtime.references.find((reference) => reference.type === 'video' && reference.url)?.url
      : undefined;

  return (
    <>
      <div
        className={`canvas-floating-composer nowheel nopan pointer-events-auto fixed z-50 flex flex-col gap-2 ${collapsed ? 'hidden' : ''}`}
        style={{
          left: layout.position.left,
          top: layout.position.top,
          transform: layout.position.transform,
        }}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        {!expanded && remakeVideoUrl && primaryNode && (
          <VideoRemakeRangeStrip
            videoUrl={remakeVideoUrl}
            initialSegments={primaryNode.data.videoRemakeSegments}
            onChange={handleRemakeRangeChange}
            onPreviewTimeChange={handleRemakePreviewTimeChange}
          />
        )}
        <AICommandComposer
          key={`${runtime.selectedNodeIds.join(':')}|${runtime.references
            .map((ref) => `${ref.id}@${referenceVersion(ref.url)}`)
            .join(':')}`}
          runtime={runtime}
          genParams={effectiveGenParams}
          initialPrompt={initialPrompt}
          initialReferences={runtime.references}
          initialParams={initialParams}
          isGenerating={isGenerating}
          externalSubmitError={feedbackMatchesSelection ? submissionFeedback.error : null}
          onClearExternalSubmitError={() =>
            setSubmissionFeedback((current) =>
              current.selectionKey === selectionKey ? { ...current, error: null } : current,
            )
          }
          expanded={expanded}
          onToggleExpand={() =>
            setComposerView((current) => ({
              selectionKey,
              collapsed: false,
              expanded: current.selectionKey === selectionKey ? !current.expanded : true,
            }))
          }
          onCollapse={() =>
            setComposerView((current) => ({
              selectionKey,
              collapsed: true,
              expanded: current.selectionKey === selectionKey && current.expanded,
            }))
          }
          onPromptChange={handlePromptChange}
          onDraftCommit={handleDraftCommit}
          onReferenceAdd={handleReferenceStateChange}
          onReferenceRemove={handleReferenceStateChange}
          onReferenceReorder={handleReferenceStateChange}
          onGenParamChange={handleGenParamChange}
          onSubmit={handleSubmit}
        />
      </div>

      {collapsed && (
        <button
          type="button"
          className="canvas-floating-composer nowheel nopan nodrag pointer-events-auto fixed z-[51] flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-[#242425] text-white/50 shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-colors hover:bg-[#303033] hover:text-white/80"
          style={restorePosition}
          title={t('canvasShell.composer.expand', '展开指令框')}
          aria-label={t('canvasShell.composer.expand', '展开指令框')}
          onClick={() =>
            setComposerView((current) => ({
              selectionKey,
              collapsed: false,
              expanded: current.selectionKey === selectionKey && current.expanded,
            }))
          }
        >
          <PanelBottomOpen className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}

function resolveMultiSelectTargetKind(nodes: FlowNode[]): NodeKind {
  const assetTypes = new Set(nodes.map((n) => outputAssetType(n.data.kind)));
  if (assetTypes.has('video')) return 'video';
  if (assetTypes.has('image')) return 'image';
  if (assetTypes.has('audio')) return 'audio';
  return 'text';
}

function selectedBoundingBox(nodes: FlowNode[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const w = n.width ?? NODE_W;
    const h = n.height ?? NODE_H;
    minX = Math.min(minX, n.position.x);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return { minX, maxX, maxY, centerX: (minX + maxX) / 2 };
}
