import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { FileText, Image as ImageIcon, Loader2, PlaySquare, Video, X } from 'lucide-react';
import type { FlowNode } from '../nodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { NodePorts } from './NodePorts';
import { AiSkillNodeDragHandle } from './AiSkillNodeDragHandle';
import { SELECTED_NODE_FRAME_CLASS } from './nodeSelectionStyles';
import { useAppTranslation } from '../../i18n/appI18n';
import { IMAGE_REFERENCE_PROMPT, VIDEO_REFERENCE_PROMPT } from '../../lib/textReferencePrompt';
import { shouldHideTextNodeInputControl } from './textNodePortVisibility';
import { shouldEnterTextNodeEdit } from './textNodeInteraction';
import { useSingleNodeControls } from './nodeSelectionState';
import { bindEditorWindowSelection } from '../../composer/editorWindowSelection';
import { registerPageUpdateDraft } from '../../lib/pageUpdateDrafts';
import { GenerationRecoveryButton } from './GenerationRecoveryButton';

const STARTERS = [
  {
    action: 'write',
    label: '自己编写内容',
    icon: FileText,
    prompt: '',
  },
  {
    action: 'text-to-video',
    label: '文生视频',
    icon: PlaySquare,
    prompt: '请根据下面的主题，撰写一段包含场景、人物动作和镜头运动的文生视频提示词：\n',
  },
  {
    action: 'image-to-prompt',
    label: '图片反推提示词',
    icon: ImageIcon,
    prompt: IMAGE_REFERENCE_PROMPT,
  },
  {
    action: 'video-to-prompt',
    label: '视频反推提示词',
    icon: Video,
    prompt: VIDEO_REFERENCE_PROMPT,
  },
] as const;

function TextNodeBase({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useAppTranslation();
  const showControls = useSingleNodeControls(selected);
  const zoom = useStore((state) => state.transform[2]);
  const requestDeleteNode = useCanvasStore((state) => state.requestDeleteNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const createTextStarterNode = useCanvasStore((state) => state.createTextStarterNode);
  const recoverNodeGenerationResult = useCanvasStore((state) => state.recoverNodeGenerationResult);
  const hideInputControl = useCanvasStore((state) =>
    shouldHideTextNodeInputControl(state.nodes, id),
  );
  const hasIncomingConnection = useCanvasStore((state) =>
    state.edges.some((edge) => edge.target === id),
  );
  const nodeNumber = useCanvasStore((state) => {
    let number = 0;
    for (const node of state.nodes) {
      if (node.data.kind !== 'text') continue;
      number += 1;
      if (node.id === id) return number;
    }
    return 1;
  });

  const generatedContent = String(
    data.outputText || (!data.generationError && data.result) || '',
  ).trim();
  const ownContent =
    hasIncomingConnection && data.textContentRole !== 'source'
      ? ''
      : String(data.prompt || '').trim();
  const content = generatedContent || ownContent;
  const hasPendingTask = Boolean(hasIncomingConnection || data.textInstruction);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [checkingGenerationResult, setCheckingGenerationResult] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const cancelEditRef = useRef(false);
  const cancelTitleRenameRef = useRef(false);
  const interruptedGenerationRequestId =
    typeof data.generationRequestId === 'string' && data.generationRequestId.trim()
      ? data.generationRequestId
      : undefined;

  useEffect(() => {
    if (!editing || !editorRef.current) return;
    editorRef.current.focus();
    return bindEditorWindowSelection(editorRef.current);
  }, [editing]);

  const storedTitle = String(data.title || '').trim();
  const displayTitle =
    !storedTitle || storedTitle === '文本节点' || storedTitle === '提示词'
      ? t('node.defaultNumberedTitle', '{kind}{number}', {
          kind: t('node.kind.text.label', '文本'),
          number: nodeNumber,
        })
      : storedTitle;

  const startEdit = useCallback(
    (initialValue = content) => {
      cancelEditRef.current = false;
      setDraft(initialValue);
      setEditing(true);
    },
    [content],
  );

  const beginTitleRename = useCallback(() => {
    cancelTitleRenameRef.current = false;
    setTitleDraft(displayTitle);
    setRenamingTitle(true);
  }, [displayTitle]);

  const commitTitleRename = useCallback(() => {
    const nextTitle = titleDraft.trim();
    if (!cancelTitleRenameRef.current && nextTitle !== storedTitle) {
      updateNodeData(id, { title: nextTitle || undefined });
    }
    cancelTitleRenameRef.current = false;
    setRenamingTitle(false);
  }, [id, storedTitle, titleDraft, updateNodeData]);

  const saveEdit = useCallback(
    (finishEditing = true) => {
      if (finishEditing) setEditing(false);
      if (cancelEditRef.current) {
        cancelEditRef.current = false;
        return;
      }
      if (draft !== content) {
        updateNodeData(id, {
          prompt: draft.trim() || undefined,
          textContentRole: 'source',
          textInstruction: undefined,
          result: undefined,
          outputText: undefined,
          output: undefined,
          generationError: undefined,
          connectionPromptPreset: undefined,
        });
      }
    },
    [content, draft, id, updateNodeData],
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      requestDeleteNode(id);
    },
    [id, requestDeleteNode],
  );

  const handleRecoverGenerationResult = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (checkingGenerationResult || !interruptedGenerationRequestId) return;
      setCheckingGenerationResult(true);
      try {
        await recoverNodeGenerationResult(id);
      } finally {
        setCheckingGenerationResult(false);
      }
    },
    [checkingGenerationResult, id, interruptedGenerationRequestId, recoverNodeGenerationResult],
  );

  useEffect(() => {
    if (editing) return registerPageUpdateDraft(() => saveEdit(false));
  }, [editing, saveEdit]);

  if (zoom < 0.3) {
    return (
      <div
        ref={nodeRef}
        data-theme-role="node-surface"
        className={`relative h-[350px] w-[350px] rounded-xl border bg-[#242425] transition-[border-color,box-shadow] ${
          selected ? SELECTED_NODE_FRAME_CLASS : 'border-white/[0.12]'
        }`}
      >
        <NodePorts
          kind={data.kind}
          nodeRef={nodeRef}
          selected={showControls}
          zoom={zoom}
          hideInputControl={hideInputControl}
        />
      </div>
    );
  }

  return (
    <div ref={nodeRef} className="group relative h-[350px] w-[350px]">
      {showControls && (
        <div className="pointer-events-auto absolute -top-8 left-0 right-0 flex h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-white/50">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            {renamingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitleRename}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleRenameRef.current = true;
                    event.currentTarget.blur();
                  }
                }}
                className="nodrag nopan min-w-0 max-w-48 rounded border border-white/20 bg-[#18181a] px-1.5 py-0.5 text-[12px] text-white/85 outline-none focus:border-sky-300/60"
                aria-label={t('textNode.name', '文本节点名称')}
              />
            ) : (
              <button
                type="button"
                data-node-double-click="true"
                onClick={(event) => {
                  event.stopPropagation();
                  beginTitleRename();
                }}
                className="nodrag nopan min-w-0 truncate text-left text-white/50 hover:text-white/80"
                title={t('textNode.renameTitle', '点击修改文本节点名称')}
              >
                {displayTitle}
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AiSkillNodeDragHandle nodeId={id} label={displayTitle} />
            <button
              type="button"
              onClick={handleDelete}
              className="nodrag nopan flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
              title={t('common.moveToTrash', '移到回收站')}
              aria-label={t('common.moveToTrash', '移到回收站')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div
        data-theme-role="node-surface"
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-[#242425] transition-[border-color,box-shadow] ${
          selected
            ? SELECTED_NODE_FRAME_CLASS
            : 'border-white/25 shadow-[0_3px_14px_rgba(0,0,0,0.28)] hover:border-white/35'
        }`}
      >
        {editing ? (
          <div className="relative h-full w-full">
            <textarea
              ref={editorRef}
              value={draft}
              aria-label={t('textNode.content', '文本节点内容')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={(event) => {
                // Switching to another application is not a request to close the
                // editor. Persist the draft but retain its DOM, caret and scroll.
                saveEdit(Boolean(event.relatedTarget) || document.hasFocus());
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelEditRef.current = true;
                  setDraft(content);
                  event.currentTarget.blur();
                }
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="nodrag nopan nowheel h-full w-full cursor-text select-text resize-none overflow-y-auto bg-transparent px-6 pb-12 pt-7 text-sm leading-7 text-white/80 outline-none placeholder:text-white/25"
              placeholder={t('textNode.placeholder', '写下你想创作的故事、场景或角色设定…')}
            />
            <span
              data-text-node-character-count="true"
              className="pointer-events-none absolute bottom-3 right-4 text-[10px] tabular-nums text-white/25"
            >
              {t('textNode.characterCount', '{count} 字', {
                count: draft.length,
              })}
            </span>
          </div>
        ) : content ? (
          <div className="relative h-full w-full">
            <div
              data-text-node-scroll-region="true"
              className="nowheel h-full w-full cursor-grab select-none overflow-y-auto px-6 pb-12 pt-7 text-sm leading-7 text-white/80 active:cursor-grabbing"
              data-node-drag-handle="text-content"
              title={t('textNode.doubleClickToEdit', '双击编辑，拖动可移动节点')}
              aria-label={t('textNode.content', '文本节点内容')}
              onMouseDownCapture={(event) => {
                if (!shouldEnterTextNodeEdit(event)) return;
                event.preventDefault();
                event.stopPropagation();
                startEdit();
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startEdit();
              }}
            >
              <div className="whitespace-pre-wrap break-words">{content}</div>
            </div>
            <span
              data-text-node-character-count="true"
              className="pointer-events-none absolute bottom-3 right-4 text-[10px] tabular-nums text-white/25"
            >
              {t('textNode.characterCount', '{count} 字', { count: content.length })}
            </span>
          </div>
        ) : hasPendingTask ? (
          <div
            className="flex h-full items-center justify-center"
            aria-label={t('textNode.pendingResult', '已连接上游内容，等待生成结果')}
          >
            <div className="flex flex-col items-center gap-1 opacity-25" aria-hidden="true">
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="mr-6 h-1.5 w-8 rounded-full bg-white" />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col px-6 py-10">
            <div className="mb-8 flex flex-col items-center gap-1 opacity-25" aria-hidden="true">
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="h-1.5 w-14 rounded-full bg-white" />
              <span className="mr-6 h-1.5 w-8 rounded-full bg-white" />
            </div>
            <p className="mb-3 text-xs text-white/45">{t('textNode.try', '尝试：')}</p>
            <div className="space-y-1.5">
              {STARTERS.map((starter) => {
                const Icon = starter.icon;
                return (
                  <button
                    key={starter.action}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (starter.action === 'write') {
                        startEdit(starter.prompt);
                        return;
                      }
                      createTextStarterNode(id, starter.action, starter.prompt);
                    }}
                    className="nodrag flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-white/85 transition-colors hover:bg-white/[0.07] hover:text-white"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t(`textNode.starter.${starter.action}`, starter.label)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {data.generationError && !data.generating && (
          <div className="nodrag nopan absolute inset-x-3 bottom-3 z-30 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-950/85 px-3 py-2 text-[10px] leading-relaxed text-rose-200">
            <span className="min-w-0 flex-1">{data.generationError}</span>
            {interruptedGenerationRequestId && (
              <GenerationRecoveryButton
                busy={checkingGenerationResult}
                onCheck={handleRecoverGenerationResult}
                label={t('imageNode.recovery.check', '检查生成结果')}
                checkingLabel={t('imageNode.recovery.checking', '检查中…')}
                className="border-rose-100/20 bg-white/10 text-rose-50 hover:bg-white/15"
              />
            )}
          </div>
        )}

        {data.generating && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
              <span className="text-sm text-white/70">{data.progress ?? 0}%</span>
            </div>
          </div>
        )}
      </div>

      <NodePorts
        kind={data.kind}
        nodeRef={nodeRef}
        selected={showControls}
        zoom={zoom}
        hideInputControl={hideInputControl}
      />
    </div>
  );
}

export const TextNode = memo(TextNodeBase);
