import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Music } from 'lucide-react';
import { useComposer } from './ComposerContext';
import { isConfiguredImageType } from '../lib/imageGeneration';
import {
  canSubmitTextTask,
  DEFAULT_TEXT_TASK_MODE,
  resolveTextModeDefinition,
} from '../lib/textGeneration';
import type { ComposerReference } from './types';
import {
  REFERENCE_TOKEN_PATTERN,
  referenceMentionOptions,
  referenceMentionQuery,
  referenceMentionTone,
  referenceMentionVideoMode,
  type ReferenceMentionOption,
} from './referenceMention';
import { useAppTranslation } from '../i18n/appI18n';
import { bindEditorWindowSelection } from './editorWindowSelection';
import {
  normalizeLegacyReferenceMentionSpacing,
  promptTextFromEditorDom,
} from './promptEditorText';

function createMentionElement(token: string, reference: ComposerReference): HTMLSpanElement {
  const mention = document.createElement('span');
  mention.contentEditable = 'false';
  mention.dataset.referenceToken = token;
  mention.dataset.referenceType = reference.type;
  mention.className = `mx-0.5 inline-flex h-5 select-none items-center gap-1 rounded border px-1 align-middle text-[11px] ${referenceMentionTone(reference.type).chip}`;

  if (reference.url && reference.type === 'video') {
    const video = document.createElement('video');
    video.src = reference.url;
    video.poster = reference.previewUrl ?? '';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.className = 'h-4 w-4 rounded-sm object-cover';
    mention.appendChild(video);
  } else if (reference.url && reference.type === 'image') {
    const image = document.createElement('img');
    image.src = reference.url;
    image.alt = '';
    image.className = 'h-4 w-4 rounded-sm object-cover';
    mention.appendChild(image);
  } else if (reference.type === 'audio') {
    const audioIcon = document.createElement('span');
    audioIcon.ariaHidden = 'true';
    audioIcon.textContent = '♪';
    audioIcon.className = 'flex h-4 w-4 items-center justify-center text-[12px] leading-none';
    mention.appendChild(audioIcon);
  }

  const label = document.createElement('span');
  label.textContent = token;
  mention.appendChild(label);
  return mention;
}

function renderPrompt(editor: HTMLDivElement, prompt: string, references: ComposerReference[]) {
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of prompt.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) fragment.appendChild(document.createTextNode(prompt.slice(cursor, start)));

    const token = match[0];
    const expectedType = match[1] === '视频' ? 'video' : match[1] === '音频' ? 'audio' : 'image';
    const referenceIndex = Number(match[2]) - 1;
    const reference = references[referenceIndex];
    fragment.appendChild(
      reference?.type === expectedType
        ? createMentionElement(token, reference)
        : document.createTextNode(token),
    );
    cursor = start + token.length;
  }

  if (cursor < prompt.length) fragment.appendChild(document.createTextNode(prompt.slice(cursor)));
  editor.replaceChildren(fragment);
}

function promptFromEditor(editor: HTMLDivElement): string {
  return promptTextFromEditorDom(editor);
}

function rangeBelongsToEditor(range: Range, editor: HTMLDivElement): boolean {
  const container =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode;
  return Boolean(container && (container === editor || editor.contains(container)));
}

export function PromptEditor({
  compact = false,
  expanded = false,
}: {
  compact?: boolean;
  expanded?: boolean;
}) {
  const fontSizeClass = expanded ? 'text-[14px]' : 'text-[13px]';
  const { state, setPrompt, setParam, runtime, submit, isGenerating, mentionRequest } =
    useComposer();
  const { t } = useAppTranslation();
  const inputRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const localPromptRef = useRef(state.prompt);
  const renderedReferencesRef = useRef('');
  const [mentionMenu, setMentionMenu] = useState<{
    left: number;
    top: number;
    query: string;
    range: Range;
    activeIndex: number;
  } | null>(null);
  const mentionOptions = mentionMenu
    ? referenceMentionOptions(state.references, mentionMenu.query)
    : [];
  const canSubmit =
    runtime.spec.type === 'text'
      ? canSubmitTextTask(
          state.prompt,
          state.params.mode ?? DEFAULT_TEXT_TASK_MODE,
          runtime.textContext?.length ?? 0,
        )
      : Boolean(state.prompt.trim()) ||
        Boolean(runtime.cameraPrompts?.length) ||
        runtime.allowEmptyPromptSubmit === true ||
        (runtime.spec.type === 'image' &&
          isConfiguredImageType(state.params.imageType, state.params.imageTypePrompt));

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const unbindSelection = bindEditorWindowSelection(input);
    const blockWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    input.addEventListener('wheel', blockWheel, { capture: true, passive: false });
    return () => {
      unbindSelection();
      input.removeEventListener('wheel', blockWheel, true);
    };
  }, []);

  useLayoutEffect(() => {
    const editor = inputRef.current;
    if (!editor) return;
    const normalizedPrompt = normalizeLegacyReferenceMentionSpacing(state.prompt);
    const referencesKey = state.references
      .map((reference) => `${reference.id}:${reference.type}:${reference.url ?? ''}`)
      .join('|');
    if (
      editor.hasChildNodes() &&
      normalizedPrompt === localPromptRef.current &&
      referencesKey === renderedReferencesRef.current
    )
      return;
    renderPrompt(editor, normalizedPrompt, state.references);
    localPromptRef.current = normalizedPrompt;
    renderedReferencesRef.current = referencesKey;
    if (normalizedPrompt !== state.prompt) setPrompt(normalizedPrompt);
  }, [setPrompt, state.prompt, state.references]);

  useEffect(() => {
    const editor = inputRef.current;
    if (!editor || !mentionRequest || isGenerating) return;

    editor.focus();
    const selection = window.getSelection();
    const range = savedRangeRef.current?.cloneRange() ?? document.createRange();
    if (!savedRangeRef.current || !rangeBelongsToEditor(range, editor)) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();
    const mention = createMentionElement(mentionRequest.token, mentionRequest.reference);
    const spacer = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();
    fragment.append(mention, spacer);
    range.insertNode(fragment);
    range.setStartAfter(spacer);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();

    const prompt = promptFromEditor(editor);
    localPromptRef.current = prompt;
    setPrompt(prompt);
  }, [isGenerating, mentionRequest, setPrompt]);

  const rememberSelection = () => {
    const editor = inputRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (rangeBelongsToEditor(range, editor)) savedRangeRef.current = range.cloneRange();
  };

  const refreshMentionMenu = (editor: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      setMentionMenu(null);
      return;
    }
    const caret = selection.getRangeAt(0);
    if (!caret.collapsed || !rangeBelongsToEditor(caret, editor)) {
      setMentionMenu(null);
      return;
    }
    const container = caret.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) {
      setMentionMenu(null);
      return;
    }
    const textBeforeCaret = (container.textContent ?? '').slice(0, caret.startOffset);
    const query = referenceMentionQuery(textBeforeCaret);
    if (query == null) {
      setMentionMenu(null);
      return;
    }
    const triggerRange = document.createRange();
    triggerRange.setStart(container, caret.startOffset - query.length - 1);
    triggerRange.setEnd(container, caret.startOffset);
    const caretRect = caret.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    setMentionMenu({
      left: Math.max(0, Math.min(caretRect.left - editorRect.left, editorRect.width - 240)),
      top: Math.max(22, caretRect.bottom - editorRect.top + 6),
      query,
      range: triggerRange,
      activeIndex: 0,
    });
  };

  const insertMentionOption = (option: ReferenceMentionOption) => {
    const editor = inputRef.current;
    if (!editor || !mentionMenu || !rangeBelongsToEditor(mentionMenu.range, editor)) return;
    editor.focus();
    const range = mentionMenu.range.cloneRange();
    range.deleteContents();
    const mention = createMentionElement(option.token, option.reference);
    const spacer = document.createTextNode(' ');
    range.insertNode(spacer);
    range.insertNode(mention);
    range.setStartAfter(spacer);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    const prompt = promptFromEditor(editor);
    localPromptRef.current = prompt;
    setPrompt(prompt);
    const nextVideoMode = referenceMentionVideoMode(
      option.reference,
      runtime.spec.type,
      runtime.videoTool,
    );
    if (nextVideoMode) setParam('mode', nextVideoMode);
    setMentionMenu(null);
  };

  const placeholders: Record<string, string> = {
    image: t(
      'composer.prompt.image',
      '可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜',
    ),
    video: t(
      'composer.prompt.video',
      '描述人物动作、镜头运动和画面变化，如：人物转身拔剑，摄影机缓慢推近',
    ),
    text: t(
      `composer.prompt.text.${resolveTextModeDefinition(state.params.mode)?.key ?? 'instruct'}`,
      resolveTextModeDefinition(state.params.mode)?.placeholder ??
        '描述要对输入内容执行的操作，例如：生成一个同类风格图片提示词。',
    ),
    audio: t('composer.prompt.audio', '描述你想要的音乐'),
    generic: t('composer.prompt.generic', '输入指令…'),
  };

  return (
    <div className={`relative h-full w-full ${compact ? 'min-h-[72px]' : 'min-h-[100px]'}`}>
      {!state.prompt && !runtime.cameraPrompts?.length && (
        <span
          className={`pointer-events-none absolute left-0 top-0 ${fontSizeClass} leading-relaxed text-white/25`}
        >
          {placeholders[runtime.spec.type] ?? placeholders.generic}
        </span>
      )}
      <div
        ref={inputRef}
        contentEditable={!isGenerating}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-readonly={isGenerating}
        aria-label={t('composer.prompt.editor', '指令文字框')}
        onInput={(event) => {
          const rawPrompt = promptFromEditor(event.currentTarget);
          const prompt = runtime.spec.type === 'audio' ? rawPrompt.slice(0, 1024) : rawPrompt;
          if (prompt !== rawPrompt) renderPrompt(event.currentTarget, prompt, state.references);
          localPromptRef.current = prompt;
          setPrompt(prompt);
          rememberSelection();
          refreshMentionMenu(event.currentTarget);
        }}
        onMouseUp={(event) => {
          rememberSelection();
          refreshMentionMenu(event.currentTarget);
        }}
        onKeyUp={rememberSelection}
        onFocus={rememberSelection}
        onBlur={() => setMentionMenu(null)}
        onKeyDown={(e) => {
          if (mentionMenu) {
            if (e.key === 'Escape') {
              e.preventDefault();
              setMentionMenu(null);
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (mentionOptions.length > 0) {
                const direction = e.key === 'ArrowDown' ? 1 : -1;
                setMentionMenu((current) =>
                  current
                    ? {
                        ...current,
                        activeIndex:
                          (current.activeIndex + direction + mentionOptions.length) %
                          mentionOptions.length,
                      }
                    : current,
                );
              }
              return;
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && mentionOptions.length > 0) {
              e.preventDefault();
              const option =
                mentionOptions[Math.min(mentionMenu.activeIndex, mentionOptions.length - 1)];
              if (option) insertMentionOption(option);
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && ['+', '-', '=', '0'].includes(e.key)) {
            e.preventDefault();
            return;
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isGenerating && canSubmit) {
            e.preventDefault();
            submit();
          }
        }}
        className={`h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent ${fontSizeClass} leading-relaxed text-white/85 outline-none ${compact ? 'min-h-[72px]' : 'min-h-[100px]'}`}
      />
      {mentionMenu && (
        <div
          data-reference-mention-menu="true"
          className="absolute z-50 w-60 overflow-hidden rounded-lg border border-white/10 bg-[#252527] p-1 shadow-2xl"
          style={{ left: mentionMenu.left, top: mentionMenu.top }}
          role="listbox"
          aria-label={t('composer.reference.selectImage', '选择参考素材')}
        >
          {mentionOptions.length > 0 ? (
            mentionOptions.map((option, optionIndex) => (
              <button
                key={option.reference.id}
                type="button"
                role="option"
                aria-selected={optionIndex === mentionMenu.activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMentionOption(option)}
                onMouseEnter={() =>
                  setMentionMenu((current) =>
                    current ? { ...current, activeIndex: optionIndex } : current,
                  )
                }
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  optionIndex === mentionMenu.activeIndex
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {option.reference.url && option.reference.type === 'video' ? (
                  <video
                    src={option.reference.url}
                    poster={option.reference.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : option.reference.type === 'audio' ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                    <Music className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : option.reference.url ? (
                  <img
                    src={option.reference.url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.06]" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[10px] font-medium ${referenceMentionTone(option.reference.type).text}`}
                  >
                    {option.token}
                  </span>
                  <span className="block truncate text-[10px] text-white/40">
                    {option.reference.label}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-center text-[10px] text-white/40">
              {state.references.some(
                (reference) =>
                  reference.type === 'image' ||
                  reference.type === 'video' ||
                  reference.type === 'audio',
              )
                ? t('composer.reference.noMatch', '没有匹配的参考素材')
                : t('composer.reference.emptyHint', '暂无图片、视频或音频参考，请先点击“参考”添加')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
