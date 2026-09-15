import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  History,
  Settings,
  ChevronRight,
  Send,
  Dices,
  X,
  Sparkles,
  ChevronDown,
  Upload,
  Library,
  Boxes,
  ArrowLeft,
  AtSign,
  FileText,
  Trash2,
  FolderOpen,
  PackageOpen,
} from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { NODE_KIND_META, type FlowNode } from '../canvas/nodeTypes';
import {
  runCanvasAgent,
  type AgentCreativity,
  type AgentModelSelection,
  type AgentReplyLength,
  type CanvasAgentAction,
} from '../services/canvasAgent';
import { useModelCatalogStore } from '../lib/modelCatalog';
import { groupModelPickerOptions } from './modelPicker';
import { CHARACTER_PRESETS } from '../data/characterPresets';
import { getPromptThumbnailUrl, loadPromptLibrary, type PromptItem } from '../data/promptLibrary';
import { resolveUserLibraryThumbnail, useUserLibrary } from '../lib/userLibrary';
import { resolveCharacterTurnaroundCoverSource } from '../lib/characterCanvasLayout';
import { ProviderBrandIcon } from './ProviderBrandIcon';
import {
  normalizeStoredLocalCanvasSkills,
  parseLocalCanvasSkill,
  type LocalCanvasSkill,
} from '../lib/localCanvasSkills';
import {
  groupLocalCanvasSkills,
  mergeLocalCanvasSkills,
  parseLocalCanvasSkillArchive,
  parseLocalCanvasSkillFolder,
  scheduleLocalCanvasSkills,
} from '../lib/localCanvasSkillPackages';
import {
  AI_SKILL_IMAGE_MIME,
  AI_SKILL_NODE_MIME,
  AI_SKILL_NODE_DROP_EVENT,
  parseAiSkillImageDrag,
  parseAiSkillNodeDrag,
  sanitizeAiSkillPromptValue,
  serializeAiSkillImageDrag,
} from '../lib/aiSkillDragDrop';
import { referenceMentionOptions } from '../composer/referenceMention';
import type { ComposerReference } from '../composer/types';
import {
  insertAiSkillMention,
  resolveAiSkillMention,
  type AiSkillMentionRange,
} from '../lib/aiSkillMentions';
import { useAppTranslation, type TranslationParams } from '../i18n/appI18n';
import { getNodeDisplayTitle, getNodeKindDisplayLabel } from '../i18n/nodeI18n';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
}

interface ImageAttachment {
  id: string;
  name: string;
  url: string;
}

type AttachmentMenuView = 'main' | 'assets' | 'nodes';

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

type HistoryDeleteTarget = { kind: 'single'; conversation: Conversation } | { kind: 'all' };

const HISTORY_KEY = 'kitty-canvas-agent-history-v1';
const CONVERSATIONS_KEY = 'kitty-canvas-agent-conversations-v1';
const CURRENT_CONVERSATION_KEY = 'kitty-canvas-agent-current-conversation-v1';
const MODEL_KEY = 'kitty-canvas-agent-model-v1';
const PREFERENCES_KEY = 'kitty-canvas-agent-preferences-v1';
const LOCAL_SKILLS_KEY = 'qiansi-canvas-local-skills-v1';
const ACTIVE_LOCAL_SKILLS_KEY = 'qiansi-canvas-active-local-skills-v1';
const MAX_HISTORY = 30;
const MAX_CONVERSATIONS = 50;
const MAX_IMAGE_EDGE = 1600;
const MIN_COMPOSER_HEIGHT = 130;
const MAX_COMPOSER_HEIGHT = 360;
const MAX_TEXTAREA_HEIGHT = 250;
const COMPOSER_CHROME_HEIGHT = 52;
const ATTACHMENT_ROW_HEIGHT = 80;

const REPLY_LENGTH_OPTIONS: Array<{ value: AgentReplyLength; label: string }> = [
  { value: 'concise', label: '简洁' },
  { value: 'balanced', label: '适中' },
  { value: 'detailed', label: '详细' },
];

const CREATIVITY_OPTIONS: Array<{ value: AgentCreativity; label: string }> = [
  { value: 'precise', label: '严谨' },
  { value: 'balanced', label: '平衡' },
  { value: 'creative', label: '创意' },
];

type AppTranslator = (key: string, fallback?: string, params?: TranslationParams) => string;

function loadAgentPreferences(): {
  replyLength: AgentReplyLength;
  creativity: AgentCreativity;
} {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as {
      replyLength?: unknown;
      creativity?: unknown;
    };
    const replyLength = REPLY_LENGTH_OPTIONS.some((option) => option.value === value.replyLength)
      ? (value.replyLength as AgentReplyLength)
      : 'balanced';
    const creativity = CREATIVITY_OPTIONS.some((option) => option.value === value.creativity)
      ? (value.creativity as AgentCreativity)
      : 'balanced';
    return { replyLength, creativity };
  } catch {
    return { replyLength: 'balanced', creativity: 'balanced' };
  }
}

function loadLocalSkills(): LocalCanvasSkill[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_SKILLS_KEY) ?? '[]');
    return normalizeStoredLocalCanvasSkills(value);
  } catch {
    return [];
  }
}

function loadActiveLocalSkillIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_LOCAL_SKILLS_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function createConversationId() {
  return `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readableNodeValue(value: unknown) {
  if (typeof value === 'string') return sanitizeAiSkillPromptValue(value);
  if (value === null || value === undefined) return '';
  try {
    return sanitizeAiSkillPromptValue(JSON.stringify(value)).slice(0, 12_000);
  } catch {
    return sanitizeAiSkillPromptValue(String(value)).slice(0, 12_000);
  }
}

function nodeImageUrls(node: FlowNode) {
  return Array.from(
    new Set(
      [node.data.imageUrl, ...(Array.isArray(node.data.images) ? node.data.images : [])]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(resolveMediaSourceUrl),
    ),
  );
}

function nodeToPromptContext(node: FlowNode) {
  const fields = [
    ['提示词', node.data.prompt],
    ['描述', node.data.description],
    ['生成结果', node.data.outputText ?? node.data.result ?? node.data.output],
  ]
    .map(([label, value]) => [label, readableNodeValue(value)] as const)
    .filter(([, value]) => value);
  const heading = `【画布节点：${node.data.title || node.id}（${NODE_KIND_META[node.data.kind].label}）】`;
  return [heading, ...fields.map(([label, value]) => `${label}：${value}`)].join('\n');
}

function storedMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is Message =>
        Boolean(message) &&
        typeof message === 'object' &&
        typeof (message as Message).id === 'string' &&
        ((message as Message).role === 'user' || (message as Message).role === 'assistant') &&
        typeof (message as Message).content === 'string',
    )
    .slice(-MAX_HISTORY)
    .map(({ images: _images, ...message }) => message);
}

function conversationTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim();
  return (firstUserMessage || '新对话').replace(/\s+/g, ' ').slice(0, 32);
}

function loadConversationState(): {
  conversations: Conversation[];
  currentConversationId: string;
  messages: Message[];
} {
  try {
    const rawArchive = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) ?? '[]');
    const conversations: Conversation[] = Array.isArray(rawArchive)
      ? rawArchive
          .filter(
            (item): item is Conversation =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as Conversation).id === 'string',
          )
          .map((item) => ({
            id: item.id,
            title:
              typeof item.title === 'string'
                ? item.title
                : conversationTitle(storedMessages(item.messages)),
            createdAt: Number(item.createdAt) || Date.now(),
            updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
            messages: storedMessages(item.messages),
          }))
          .filter((item) => item.messages.length > 0)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_CONVERSATIONS)
      : [];

    if (conversations.length === 0) {
      const legacyMessages = storedMessages(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'));
      if (legacyMessages.length > 0) {
        const timestamp = Date.now();
        const migrated: Conversation = {
          id: 'legacy-conversation',
          title: conversationTitle(legacyMessages),
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: legacyMessages,
        };
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([migrated]));
        localStorage.setItem(CURRENT_CONVERSATION_KEY, migrated.id);
        return {
          conversations: [migrated],
          currentConversationId: migrated.id,
          messages: legacyMessages,
        };
      }
    }

    const savedCurrentId = localStorage.getItem(CURRENT_CONVERSATION_KEY);
    const current = conversations.find((item) => item.id === savedCurrentId) ?? conversations[0];
    const currentConversationId = current?.id ?? createConversationId();
    return {
      conversations,
      currentConversationId,
      messages: current?.messages ?? [],
    };
  } catch {
    return { conversations: [], currentConversationId: createConversationId(), messages: [] };
  }
}

function formatConversationTime(
  timestamp: number,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatDate(date, { hour: '2-digit', minute: '2-digit' });
  }
  return formatDate(date, { month: 'numeric', day: 'numeric' });
}

function prepareImage(file: File, t: AppTranslator): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t('agent.error.processImage', '无法处理图片'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          url: canvas.toDataURL('image/webp', 0.86),
        });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(t('agent.error.readImage', '无法读取图片：{fileName}', { fileName: file.name })),
      );
    };
    image.src = objectUrl;
  });
}

interface LibrarySuggestion {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  thumbnail?: string;
  kind: 'character' | 'prompt';
}

function characterPrompt(
  title: string,
  style: string,
  tags: string[],
  viewCount: number,
  prompt?: string,
) {
  return (
    prompt?.trim() ||
    `请以「${title}」作为角色设定。角色风格：${style}；特征：${tags.join('、')}；保持身份和服装一致，并生成 ${viewCount} 视图。`
  );
}

export function AiSkillPanel({ onClose }: { onClose: () => void }) {
  const { t, formatDate } = useAppTranslation();
  const initialConversationStateRef = useRef<ReturnType<typeof loadConversationState> | null>(null);
  if (!initialConversationStateRef.current) {
    initialConversationStateRef.current = loadConversationState();
  }
  const initialConversationState = initialConversationStateRef.current;
  const [messages, setMessages] = useState<Message[]>(initialConversationState.messages);
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversationState.conversations,
  );
  const [currentConversationId, setCurrentConversationId] = useState(
    initialConversationState.currentConversationId,
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<HistoryDeleteTarget | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [promptItems, setPromptItems] = useState<PromptItem[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSkillImportMenu, setShowSkillImportMenu] = useState(false);
  const [showSavedSkillPicker, setShowSavedSkillPicker] = useState(false);
  const [modelPickerProviderId, setModelPickerProviderId] = useState<string | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [attachmentMenuView, setAttachmentMenuView] = useState<AttachmentMenuView>('main');
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MODEL_KEY) ?? 'null');
      return saved && typeof saved.providerId === 'string' && typeof saved.model === 'string'
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [preferences, setPreferences] = useState(loadAgentPreferences);
  const [draftModelSelection, setDraftModelSelection] = useState<AgentModelSelection | null>(
    modelSelection,
  );
  const [draftPreferences, setDraftPreferences] = useState(preferences);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [isPromptDragOver, setIsPromptDragOver] = useState(false);
  const [imageMention, setImageMention] = useState<
    (AiSkillMentionRange & { activeIndex: number }) | null
  >(null);
  const [localSkills, setLocalSkills] = useState<LocalCanvasSkill[]>(loadLocalSkills);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>(loadActiveLocalSkillIds);
  const [composerHeight, setComposerHeight] = useState(MIN_COMPOSER_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skillFileRef = useRef<HTMLInputElement>(null);
  const skillFolderRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const skillImportMenuRef = useRef<HTMLDivElement>(null);
  const savedSkillPickerRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const characterLibrary = useUserLibrary('character');
  const replyLengthOptions = REPLY_LENGTH_OPTIONS.map((option) => ({
    ...option,
    label: t(`agent.settings.replyLength.${option.value}`, option.label),
  }));
  const creativityOptions = CREATIVITY_OPTIONS.map((option) => ({
    ...option,
    label: t(`agent.settings.creativity.${option.value}`, option.label),
  }));

  // Canvas store actions
  const createWorkflowTemplate = useCanvasStore((s) => s.createWorkflowTemplate);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateNode = useCanvasStore((s) => s.generateNode);
  const nodes = useCanvasStore((s) => s.nodes);
  const assets = useCanvasStore((s) => s.assets);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);

  const agentContext = useMemo(() => {
    const selected = nodes.find((node) => node.id === selectedNodeId);
    return {
      selectedNode: selected
        ? {
            id: selected.id,
            kind: selected.data.kind,
            title: selected.data.title,
            prompt: typeof selected.data.prompt === 'string' ? selected.data.prompt : undefined,
          }
        : undefined,
      nodes: nodes.slice(-20).map((node) => ({ kind: node.data.kind, title: node.data.title })),
    };
  }, [nodes, selectedNodeId]);
  const activeSkills = useMemo(() => {
    const active = new Set(activeSkillIds);
    return localSkills.filter((skill) => active.has(skill.id));
  }, [activeSkillIds, localSkills]);
  const localSkillGroups = useMemo(() => groupLocalCanvasSkills(localSkills), [localSkills]);
  const conversationDisplayTitle = (conversation: Conversation) =>
    conversation.title === '新对话'
      ? t('agent.history.newConversation', '新对话')
      : conversation.title;
  const imageMentionReferences = useMemo<ComposerReference[]>(
    () =>
      imageAttachments.map((image) => ({
        id: image.id,
        type: 'image',
        url: image.url,
        label: image.name,
      })),
    [imageAttachments],
  );
  const imageMentionOptions = useMemo(
    () => (imageMention ? referenceMentionOptions(imageMentionReferences, imageMention.query) : []),
    [imageMention, imageMentionReferences],
  );

  const librarySuggestions = useMemo<LibrarySuggestion[]>(() => {
    const characterOverrides = new Set(characterLibrary.presets.map((preset) => preset.id));
    const characters: LibrarySuggestion[] = [
      ...characterLibrary.presets.map((preset) => ({
        id: `character:${preset.id}`,
        title: preset.title,
        subtitle: t('agent.library.characterCategory', '角色库 · {category}', {
          category: preset.category,
        }),
        prompt: characterPrompt(preset.title, preset.category, preset.tags, 3, preset.prompt),
        thumbnail: resolveUserLibraryThumbnail(
          resolveCharacterTurnaroundCoverSource(
            preset.characterReferences,
            preset.thumbnail,
            preset.originalImage,
          ),
        ),
        kind: 'character' as const,
      })),
      ...CHARACTER_PRESETS.filter(
        (preset) =>
          !characterOverrides.has(preset.id) && !characterLibrary.deletedIds.has(preset.id),
      ).map((preset) => ({
        id: `character:${preset.id}`,
        title: preset.title,
        subtitle: t('agent.library.characterCategory', '角色库 · {category}', {
          category: preset.style,
        }),
        prompt: characterPrompt(preset.title, preset.style, preset.tags, preset.viewCount),
        thumbnail: resolveUserLibraryThumbnail(
          resolveCharacterTurnaroundCoverSource(preset.characterReferences, preset.thumbnail),
        ),
        kind: 'character' as const,
      })),
    ];

    const prompts: LibrarySuggestion[] = promptItems.map((item) => ({
      id: `prompt:${item.id}`,
      title: item.name,
      subtitle: t('agent.library.promptCategory', '提示词库 · {category}', {
        category: item.category,
      }),
      prompt: item.prompt,
      thumbnail: getPromptThumbnailUrl(item),
      kind: 'prompt',
    }));

    const mixed: LibrarySuggestion[] = [];
    const length = Math.max(characters.length, prompts.length);
    for (let index = 0; index < length; index += 1) {
      const character = characters[index];
      const prompt = prompts[index];
      if (character) mixed.push(character);
      if (prompt) mixed.push(prompt);
    }
    return mixed;
  }, [characterLibrary.deletedIds, characterLibrary.presets, promptItems, t]);

  const visibleSuggestions = useMemo(
    () =>
      Array.from(
        { length: Math.min(4, librarySuggestions.length) },
        (_, index) => librarySuggestions[(suggestionOffset + index) % librarySuggestions.length],
      ).filter((suggestion): suggestion is LibrarySuggestion => Boolean(suggestion)),
    [librarySuggestions, suggestionOffset],
  );

  useEffect(() => {
    let cancelled = false;
    loadPromptLibrary()
      .then((library) => {
        if (!cancelled) setPromptItems(library.items.filter((item) => item.prompt.trim()));
      })
      .catch(() => {
        if (!cancelled) setPromptItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableModels = useModelCatalogStore((catalog) => catalog.connectedModels.chat);
  const catalogModels = availableModels;
  const modelPickerCategories = groupModelPickerOptions(catalogModels);
  const selectedModelPickerCategory = modelPickerCategories.find(
    (category) => category.providerId === modelPickerProviderId,
  );
  const modelSettingOptions = [
    { value: '', label: t('agent.model.autoSelect', '自动选择首个可用模型') },
    ...catalogModels.map((option) => ({
      value: JSON.stringify([option.providerId, option.model]),
      label: `${option.model} · ${option.providerName}`,
    })),
  ];
  const modelSettingValue = draftModelSelection
    ? JSON.stringify([draftModelSelection.providerId, draftModelSelection.model])
    : '';

  useEffect(() => {
    if (messages.length === 0) return;
    const safeMessages = storedMessages(messages);
    setConversations((current) => {
      const existing = current.find((item) => item.id === currentConversationId);
      const now = Date.now();
      const updated: Conversation = {
        id: currentConversationId,
        title: conversationTitle(safeMessages),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: safeMessages,
      };
      return [updated, ...current.filter((item) => item.id !== currentConversationId)].slice(
        0,
        MAX_CONVERSATIONS,
      );
    });
  }, [currentConversationId, messages]);

  useEffect(() => {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
      localStorage.setItem(CURRENT_CONVERSATION_KEY, currentConversationId);
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // A full or blocked localStorage must not prevent the session from working.
    }
  }, [conversations, currentConversationId]);

  useEffect(() => {
    if (modelSelection) localStorage.setItem(MODEL_KEY, JSON.stringify(modelSelection));
    else localStorage.removeItem(MODEL_KEY);
  }, [modelSelection]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(LOCAL_SKILLS_KEY, JSON.stringify(localSkills));
  }, [localSkills]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_LOCAL_SKILLS_KEY, JSON.stringify(activeSkillIds));
  }, [activeSkillIds]);

  useEffect(() => {
    const onCanvasNodeDrop = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
      if (typeof nodeId !== 'string') return;
      const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const urls = nodeImageUrls(node);
      setImageAttachments((current) => {
        const knownUrls = new Set(current.map((item) => item.url));
        const next = [...current];
        for (const [index, url] of urls.entries()) {
          if (knownUrls.has(url) || next.length >= 4) continue;
          knownUrls.add(url);
          next.push({
            id: `node-${node.id}-${index}`,
            name: String(node.data.title || node.id),
            url,
          });
        }
        return next;
      });
      setInput((current) => {
        const context = nodeToPromptContext(node);
        return `${current}${current ? '\n\n' : ''}${context}`;
      });
      setToast(
        t('agent.toast.nodeDropped', '已拖入节点「{title}」', {
          title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
        }),
      );
    };
    window.addEventListener(AI_SKILL_NODE_DROP_EVENT, onCanvasNodeDrop);
    return () => window.removeEventListener(AI_SKILL_NODE_DROP_EVENT, onCanvasNodeDrop);
  }, [t]);

  useEffect(() => {
    if (!showModelPicker) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) setShowModelPicker(false);
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [showModelPicker]);

  useEffect(() => {
    if (!showSavedSkillPicker) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!savedSkillPickerRef.current?.contains(event.target as Node)) {
        setShowSavedSkillPicker(false);
      }
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [showSavedSkillPicker]);

  useEffect(() => {
    if (!showSkillImportMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!skillImportMenuRef.current?.contains(event.target as Node)) {
        setShowSkillImportMenu(false);
      }
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [showSkillImportMenu]);

  useEffect(() => {
    if (!showAttachmentMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!attachmentMenuRef.current?.contains(event.target as Node)) {
        setShowAttachmentMenu(false);
        setAttachmentMenuView('main');
      }
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [showAttachmentMenu]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const contentHeight = Math.min(MAX_TEXTAREA_HEIGHT, Math.max(24, textarea.scrollHeight));
    const attachmentHeight = imageAttachments.length > 0 ? ATTACHMENT_ROW_HEIGHT : 0;
    const nextComposerHeight = Math.min(
      MAX_COMPOSER_HEIGHT,
      Math.max(MIN_COMPOSER_HEIGHT, contentHeight + attachmentHeight + COMPOSER_CHROME_HEIGHT),
    );
    const availableTextareaHeight = nextComposerHeight - attachmentHeight - COMPOSER_CHROME_HEIGHT;
    textarea.style.height = `${availableTextareaHeight}px`;
    setComposerHeight(nextComposerHeight);
  }, [imageAttachments.length, input]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const toggleSettings = () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    setDraftModelSelection(modelSelection);
    setDraftPreferences(preferences);
    setShowSettings(true);
  };

  const addImagesToMessage = (items: ImageAttachment[]) => {
    if (items.length === 0) return;
    setImageAttachments((current) => {
      const knownUrls = new Set(current.map((item) => item.url));
      const next = [...current];
      for (const item of items) {
        if (knownUrls.has(item.url) || next.length >= 4) continue;
        knownUrls.add(item.url);
        next.push(item);
      }
      return next;
    });
  };

  const addPromptContext = (context: string) => {
    if (!context.trim()) return;
    setInput((current) => `${current}${current ? '\n\n' : ''}${context}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const attachAsset = (asset: (typeof assets)[number]) => {
    const urls = Array.from(
      new Set(
        [asset.originalUrl, asset.imageUrl, ...(Array.isArray(asset.images) ? asset.images : [])]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .map(resolveMediaSourceUrl),
      ),
    );
    addImagesToMessage(
      urls.map((url, index) => ({
        id: `asset-${asset.id}-${index}`,
        name: asset.title,
        url,
      })),
    );
    addPromptContext(
      `【资产库：${asset.title}】\n类型：${NODE_KIND_META[asset.kind].label} · ${asset.category}`,
    );
    setShowAttachmentMenu(false);
    setAttachmentMenuView('main');
    flashToast(
      urls.length > 0
        ? t('agent.toast.assetAdded', '已添加素材「{title}」', { title: asset.title })
        : t('agent.toast.assetInfoAdded', '已加入素材信息「{title}」', {
            title: asset.title,
          }),
    );
  };

  const attachCanvasNode = (node: FlowNode) => {
    const urls = nodeImageUrls(node);
    addImagesToMessage(
      urls.map((url, index) => ({
        id: `node-${node.id}-${index}`,
        name: String(node.data.title || NODE_KIND_META[node.data.kind].label),
        url,
      })),
    );
    addPromptContext(nodeToPromptContext(node));
    setShowAttachmentMenu(false);
    setAttachmentMenuView('main');
    flashToast(
      urls.length > 0
        ? t('agent.toast.nodeWithImagesAdded', '已添加节点「{title}」及图片', {
            title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
          })
        : t('agent.toast.nodeAdded', '已添加节点「{title}」', {
            title: getNodeDisplayTitle(node.data.kind, node.data.title, t),
          }),
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const selected = Array.from(files);
      const images = selected.filter((file) => file.type.startsWith('image/'));
      const textFiles = selected.filter(
        (file) => !file.type.startsWith('image/') && /\.(?:txt|md|json|csv)$/i.test(file.name),
      );
      if (images.length) {
        const uploaded = await Promise.all(images.slice(0, 4).map((file) => prepareImage(file, t)));
        setImageAttachments((current) => [...current, ...uploaded].slice(-4));
        uploaded.forEach((file, index) => {
          const nodeId = addNode('image', { x: 120 + index * 56, y: -96 + index * 36 });
          updateNodeData(nodeId, { imageUrl: file.url, images: [file.url], title: file.name });
        });
        flashToast(
          t('agent.toast.imagesAddedToCanvas', '已添加 {count} 张图片到画布', {
            count: uploaded.length,
          }),
        );
      }
      if (textFiles.length) {
        const contents = await Promise.all(
          textFiles.map(
            async (file) => `【${file.name}】\n${(await file.text()).slice(0, 12_000)}`,
          ),
        );
        setInput((prev) => `${prev}${prev ? '\n' : ''}${contents.join('\n\n')}`);
        flashToast(
          t('agent.toast.textAttachmentsAdded', '已加入 {count} 个文本附件', {
            count: textFiles.length,
          }),
        );
      }
      if (!images.length && !textFiles.length)
        flashToast(t('agent.toast.supportedFiles', '支持图片、TXT、Markdown、JSON 和 CSV 文件'));
    }
    e.target.value = '';
  };

  const commitImportedSkills = (imported: LocalCanvasSkill[]) => {
    if (!imported.length) return;
    const merged = mergeLocalCanvasSkills(localSkills, imported);
    const mergedIds = new Set(merged.map((skill) => skill.id));
    const retained = imported.filter((skill) => mergedIds.has(skill.id));
    if (!retained.length) {
      flashToast(t('agent.error.skillStorageFull', '本地 Skill 存储空间不足，请先移除旧包。'));
      return;
    }
    setLocalSkills(merged);
    setActiveSkillIds((current) =>
      Array.from(new Set([...retained.map((skill) => skill.id), ...current])).slice(0, 100),
    );
    flashToast(
      t('agent.toast.localSkillsImported', '已导入 {count} 个本地 Skill', {
        count: retained.length,
      }),
    );
  };

  const handleSkillFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const imported: LocalCanvasSkill[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.name.toLowerCase().endsWith('.zip')) {
          imported.push(
            ...(await parseLocalCanvasSkillArchive(
              file.name,
              new Uint8Array(await file.arrayBuffer()),
            )),
          );
        } else {
          imported.push(parseLocalCanvasSkill(file.name, await file.text()));
        }
      } catch (error) {
        errors.push(
          t('agent.error.skillParse', '{fileName}：{message}', {
            fileName: file.name,
            message:
              error instanceof Error ? error.message : t('agent.error.unableToParse', '无法解析'),
          }),
        );
      }
    }
    commitImportedSkills(imported);
    if (errors.length)
      flashToast(errors[0] ?? t('agent.error.someSkillsImportFailed', '部分 Skill 导入失败'));
  };

  const handleSkillFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    try {
      commitImportedSkills(await parseLocalCanvasSkillFolder(files));
    } catch (error) {
      flashToast(
        t('agent.error.skillPackageParse', 'Skill 包导入失败：{message}', {
          message:
            error instanceof Error ? error.message : t('agent.error.unableToParse', '无法解析'),
        }),
      );
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const applyAction = async (action: CanvasAgentAction) => {
    if (action.type === 'create_workflow') {
      const ids = createWorkflowTemplate(action.template, { x: 120, y: -96 });
      const targetId = action.template === 'script' ? ids[0] : ids.at(-1);
      if (targetId) updateNodeData(targetId, { prompt: action.prompt });
      return t('agent.action.workflowCreated', '已创建工作流');
    }
    if (action.type === 'update_selected') {
      if (!selectedNodeId)
        return t('agent.action.selectNodeToUpdate', '请先在画布中选中要修改的节点');
      updateNodeData(selectedNodeId, { prompt: action.prompt });
      return t('agent.action.selectedNodeUpdated', '已更新选中节点');
    }
    if (!selectedNodeId) return t('agent.action.selectNodeToRun', '请先在画布中选中要运行的节点');
    await generateNode(selectedNodeId);
    return t('agent.action.selectedNodeStarted', '已开始运行选中节点');
  };

  const handleSend = async (text: string) => {
    if ((!text.trim() && imageAttachments.length === 0) || isLoading) return;

    const sentImages = imageAttachments;
    const content = text.trim() || '请分析我上传的图片，并说明画面内容和可用于创作的方向。';
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      images: sentImages,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setImageAttachments([]);
    setImageMention(null);
    setComposerHeight(MIN_COMPOSER_HEIGHT);
    setIsLoading(true);

    try {
      const scheduledSkills = scheduleLocalCanvasSkills(localSkills, activeSkillIds, content);
      const result = await runCanvasAgent(
        [...messages, userMsg],
        agentContext,
        modelSelection,
        sentImages.map((image) => image.url),
        preferences,
        scheduledSkills,
      );
      const outcomes = await Promise.all(result.actions.map(applyAction));
      if (outcomes.length) flashToast(outcomes.join('；'));
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: result.reply,
          images: result.imageUrls.map((url, index) => ({
            id: `ai-image-${Date.now()}-${index}`,
            name: t('agent.attachment.aiSkillImage', 'AI Skill 图片'),
            url,
          })),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('agent.error.requestFailed', 'Agent 请求失败，请重试。');
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: message },
      ]);
      flashToast(t('agent.toast.noCanvasAction', 'Agent 未执行画布操作'));
    } finally {
      setIsLoading(false);
    }
  };

  const insertLibrarySuggestion = (suggestion: LibrarySuggestion) => {
    setInput(suggestion.prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length);
    });
    const library =
      suggestion.kind === 'character'
        ? t('library.target.character', '角色库')
        : t('library.target.prompt', '提示词库');
    flashToast(t('agent.toast.libraryContentInserted', '已填入{library}内容', { library }));
  };

  const refreshImageMention = (value: string, caret: number | null) => {
    const range = resolveAiSkillMention(value, caret ?? value.length);
    setImageMention(range ? { ...range, activeIndex: 0 } : null);
  };

  const insertImageMentionToken = (
    token: string,
    range: Pick<AiSkillMentionRange, 'start' | 'end'>,
  ) => {
    const next = insertAiSkillMention(input, range, token);
    setInput(next.value);
    setImageMention(null);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(next.caret, next.caret);
    });
  };

  const insertAttachedImageMention = (index: number) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? input.length;
    insertImageMentionToken(`@图片${index + 1}`, { start: caret, end: caret });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (imageMention) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setImageMention(null);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (imageMentionOptions.length > 0) {
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          setImageMention((current) =>
            current
              ? {
                  ...current,
                  activeIndex:
                    (current.activeIndex + direction + imageMentionOptions.length) %
                    imageMentionOptions.length,
                }
              : current,
          );
        }
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const option =
          imageMentionOptions[Math.min(imageMention.activeIndex, imageMentionOptions.length - 1)];
        if (option) insertImageMentionToken(option.token, imageMention);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const newConversation = () => {
    setCurrentConversationId(createConversationId());
    setMessages([]);
    setInput('');
    setImageAttachments([]);
    setImageMention(null);
    setActiveSkillIds([]);
    setShowHistory(false);
    setShowSettings(false);
  };

  const openConversation = (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput('');
    setImageAttachments([]);
    setImageMention(null);
    setShowHistory(false);
  };

  const deleteConversation = (conversationId: string) => {
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    setConversations(remaining);
    if (conversationId === currentConversationId) {
      const nextConversation = remaining[0];
      setCurrentConversationId(nextConversation?.id ?? createConversationId());
      setMessages(nextConversation?.messages ?? []);
      setInput('');
      setImageAttachments([]);
      setImageMention(null);
    }
    setHistoryDeleteTarget(null);
  };

  const clearConversationHistory = () => {
    setConversations([]);
    setCurrentConversationId(createConversationId());
    setMessages([]);
    setInput('');
    setImageAttachments([]);
    setImageMention(null);
    setHistoryDeleteTarget(null);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-[60] flex w-[360px] flex-col border-l border-white/[0.08] bg-[#1a1a1c] shadow-2xl sm:w-[400px]">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium text-white/90">AI SKILL</span>
          </div>
          <div className="flex items-center gap-1">
            <HeaderButton
              icon={<Plus className="h-4 w-4" />}
              label={t('agent.header.newTopic', '新话题')}
              onClick={newConversation}
            />
            <HeaderButton
              icon={<History className="h-4 w-4" />}
              label={t('agent.header.history', '历史')}
              onClick={() => setShowHistory((v) => !v)}
            />
            <HeaderButton
              icon={<Settings className="h-4 w-4" />}
              label={t('agent.header.settings', '设置')}
              onClick={toggleSettings}
            />
            <button
              type="button"
              onClick={onClose}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
              aria-label={t('common.close', '关闭')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg">
                <span className="text-lg font-bold text-white">L</span>
              </div>
              <h3 className="mb-1 text-base font-semibold text-white/90">Qiansi-Canvas AI SKILL</h3>
              <p className="max-w-[16rem] text-xs leading-relaxed text-white/40">
                {t(
                  'agent.empty.description',
                  '导入本地 SKILL.md 后，模型会在下一次请求中读取其指令，并通过画布工具执行。',
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-500/15 text-emerald-50'
                        : 'bg-white/[0.06] text-white/80'
                    }`}
                  >
                    {msg.images && msg.images.length > 0 && (
                      <div className="mb-2 grid grid-cols-2 gap-1.5">
                        {msg.images.map((image) => (
                          <img
                            key={image.id}
                            src={image.url}
                            alt={image.name}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'copy';
                              event.dataTransfer.setData(
                                AI_SKILL_IMAGE_MIME,
                                serializeAiSkillImageDrag({ url: image.url, name: image.name }),
                              );
                            }}
                            title={t('agent.message.dragImageToCanvas', '拖到画布以创建图片节点')}
                            className="h-20 w-full rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Library suggestions */}
        {!hasMessages && !isLoading && (
          <div className="shrink-0 border-t border-white/[0.08] px-4 py-3">
            {localSkills.length ? (
              <div className="mb-4 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {localSkills.map((skill) => {
                  const active = activeSkillIds.includes(skill.id);
                  return (
                    <div
                      key={skill.id}
                      className={`group relative min-h-[74px] rounded-xl border p-2.5 transition-colors ${
                        active
                          ? 'border-emerald-400/45 bg-emerald-400/[0.09]'
                          : 'border-white/[0.08] bg-white/[0.04] hover:border-white/[0.18] hover:bg-white/[0.08]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveSkillIds((current) =>
                            active
                              ? current.filter((id) => id !== skill.id)
                              : [...current, skill.id],
                          )
                        }
                        className="block w-full pr-5 text-left"
                        aria-pressed={active}
                        title={
                          skill.packageName
                            ? `${skill.packageName} · ${skill.relativePath ?? skill.sourceFileName}`
                            : skill.instructions
                        }
                      >
                        <span className="mb-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <span className="block truncate text-xs font-medium text-white/[0.9]">
                          {skill.name}
                        </span>
                        <span className="mt-0.5 block line-clamp-1 text-[10px] text-white/[0.5]">
                          {skill.description}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLocalSkills((current) =>
                            current.filter((item) => item.id !== skill.id),
                          );
                          setActiveSkillIds((current) => current.filter((id) => id !== skill.id));
                        }}
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-white/[0.36] opacity-0 transition-opacity hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={t('agent.skills.removeNamed', '移除 Skill：{name}', {
                          name: skill.name,
                        })}
                        title={t('agent.skills.remove', '移除本地 Skill')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                <Dices className="h-3.5 w-3.5" />
                {t('agent.library.heading', '角色库 · 提示词库')}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuggestionOffset((offset) =>
                    librarySuggestions.length ? (offset + 4) % librarySuggestions.length : 0,
                  );
                }}
                className="text-xs text-white/40 hover:text-white/70"
              >
                {t('agent.library.refresh', '换一批')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {visibleSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => insertLibrarySuggestion(suggestion)}
                  className="group relative flex min-h-[78px] flex-col items-start justify-end gap-1.5 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-colors hover:border-white/[0.18] hover:bg-white/[0.08]"
                >
                  {suggestion.thumbnail ? (
                    <>
                      <img
                        src={suggestion.thumbnail}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/20" />
                    </>
                  ) : (
                    <span className="relative z-[1] text-base">
                      {suggestion.kind === 'character' ? '👤' : '✍️'}
                    </span>
                  )}
                  <div className="relative z-[1] min-w-0 w-full">
                    <div className="line-clamp-1 text-xs font-medium text-white/90 drop-shadow-sm">
                      {suggestion.title}
                    </div>
                    <div
                      className={`line-clamp-1 text-[10px] ${suggestion.thumbnail ? 'text-white/60' : 'text-white/30'}`}
                    >
                      {suggestion.subtitle}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex shrink-0 flex-col items-center border-t border-white/[0.08] p-3">
          <div
            data-ai-skill-prompt-drop="true"
            style={{ height: composerHeight }}
            onDragEnter={(event) => {
              if (
                !event.dataTransfer.types.includes(AI_SKILL_IMAGE_MIME) &&
                !event.dataTransfer.types.includes(AI_SKILL_NODE_MIME)
              )
                return;
              event.preventDefault();
              setIsPromptDragOver(true);
            }}
            onDragOver={(event) => {
              if (
                !event.dataTransfer.types.includes(AI_SKILL_IMAGE_MIME) &&
                !event.dataTransfer.types.includes(AI_SKILL_NODE_MIME)
              )
                return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setIsPromptDragOver(true);
            }}
            onDragLeave={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              )
                return;
              setIsPromptDragOver(false);
            }}
            onDrop={(event) => {
              setIsPromptDragOver(false);
              const nodePayload = parseAiSkillNodeDrag(
                event.dataTransfer.getData(AI_SKILL_NODE_MIME),
              );
              if (nodePayload) {
                const node = nodes.find((item) => item.id === nodePayload.nodeId);
                if (!node) return;
                event.preventDefault();
                event.stopPropagation();
                attachCanvasNode(node);
                return;
              }
              const image = parseAiSkillImageDrag(event.dataTransfer.getData(AI_SKILL_IMAGE_MIME));
              if (!image) return;
              event.preventDefault();
              event.stopPropagation();
              addImagesToMessage([
                {
                  id: `dragged-image-${Date.now()}`,
                  name: image.name,
                  url: image.url,
                },
              ]);
              requestAnimationFrame(() => textareaRef.current?.focus());
              flashToast(t('agent.toast.imageAdded', '已添加图片「{name}」', { name: image.name }));
            }}
            className={`relative flex w-[380px] flex-col rounded-2xl border p-2 transition-[height,border-color,background-color,box-shadow] duration-200 focus-within:border-white/[0.16] focus-within:bg-white/[0.07] ${
              isPromptDragOver
                ? 'border-emerald-400/60 bg-emerald-400/[0.08] shadow-[0_0_0_1px_rgba(52,211,153,0.22)]'
                : 'border-white/[0.08] bg-white/[0.05]'
            }`}
          >
            {imageAttachments.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto px-1 pt-1">
                {imageAttachments.map((image, index) => (
                  <div key={image.id} className="group relative h-16 w-16 shrink-0">
                    <img
                      src={image.url}
                      alt={image.name}
                      title={image.name}
                      className="h-full w-full rounded-lg border border-white/[0.1] object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[9px] leading-4 text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setImageAttachments((current) =>
                          current.filter((item) => item.id !== image.id),
                        )
                      }
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white/70 opacity-0 shadow group-hover:opacity-100"
                      aria-label={t('agent.attachment.removeImage', '移除图片 {name}', {
                        name: image.name,
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertAttachedImageMention(index)}
                      className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/75 text-white/80 opacity-80 transition-colors hover:bg-black hover:text-white group-hover:opacity-100"
                      aria-label={t('agent.attachment.referenceImage', '在指令中引用图片 {index}', {
                        index: index + 1,
                      })}
                      title={t('agent.attachment.insertIntoPrompt', '插入到指令')}
                    >
                      <AtSign className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {activeSkills.length > 0 && (
              <div className="mb-1 flex items-center justify-between gap-2 rounded-md bg-emerald-400/[0.08] px-2 py-1 text-[10px] text-emerald-200">
                <span className="truncate">
                  {t('agent.skills.activeMany', '已启用 {count} 个 Skills，将按请求自动调度', {
                    count: activeSkills.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSkillIds([])}
                  className="shrink-0 text-emerald-200/70 hover:text-emerald-100"
                  aria-label={t('agent.skills.deactivateAll', '停用全部 Skills')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {imageMention && (
              <div
                className="absolute bottom-11 left-2 right-2 z-[70] max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#252527] p-1 shadow-2xl"
                role="listbox"
                aria-label={t('agent.attachment.selectReferenceImage', '选择参考图')}
              >
                {imageMentionOptions.length > 0 ? (
                  imageMentionOptions.map((option, optionIndex) => (
                    <button
                      key={option.reference.id}
                      type="button"
                      role="option"
                      aria-selected={optionIndex === imageMention.activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertImageMentionToken(option.token, imageMention)}
                      onMouseEnter={() =>
                        setImageMention((current) =>
                          current ? { ...current, activeIndex: optionIndex } : current,
                        )
                      }
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                        optionIndex === imageMention.activeIndex
                          ? 'bg-white/10 text-white'
                          : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      <img
                        src={option.reference.url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium">{option.token}</span>
                        <span className="block truncate text-[10px] text-white/40">
                          {option.reference.label}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-center text-[11px] text-white/40">
                    {t('agent.attachment.noMatchingReference', '没有匹配的参考图')}
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                refreshImageMention(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) =>
                refreshImageMention(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onBlur={() => setImageMention(null)}
              onKeyDown={handleKeyDown}
              placeholder={t('agent.composer.placeholder', '给 Qiansi-Canvas AI 发送消息...')}
              className="min-h-[24px] w-full shrink-0 resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm text-white/90 placeholder:text-white/30 outline-none"
            />
            <div className="mt-1 flex shrink-0 items-center justify-between px-1">
              <div className="flex items-center gap-0.5">
                <div ref={attachmentMenuRef} className="relative">
                  <ToolButton
                    icon={<Plus className="h-4 w-4" />}
                    label={t('agent.attachment.add', '添加')}
                    onClick={() => {
                      setShowAttachmentMenu((current) => !current);
                      setAttachmentMenuView('main');
                    }}
                  />
                  {showAttachmentMenu && (
                    <div className="absolute bottom-full left-0 z-[63] mb-2 w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1e1e21] p-1.5 shadow-2xl">
                      {attachmentMenuView === 'main' && (
                        <>
                          <AttachmentMenuItem
                            icon={<Upload className="h-4 w-4" />}
                            label={t('agent.attachment.addImageOrFile', '添加图片或文件')}
                            onClick={() => {
                              setShowAttachmentMenu(false);
                              fileRef.current?.click();
                            }}
                          />
                          <AttachmentMenuItem
                            icon={<Library className="h-4 w-4" />}
                            label={t('agent.attachment.addFromAssets', '资产库添加')}
                            onClick={() => setAttachmentMenuView('assets')}
                          />
                          <AttachmentMenuItem
                            icon={<Boxes className="h-4 w-4" />}
                            label={t('agent.attachment.canvasNodeContent', '画布节点内容')}
                            onClick={() => setAttachmentMenuView('nodes')}
                          />
                        </>
                      )}
                      {attachmentMenuView !== 'main' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setAttachmentMenuView('main')}
                            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-white/45 hover:bg-white/[0.06] hover:text-white/70"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            {attachmentMenuView === 'assets'
                              ? t('agent.attachment.selectAsset', '选择资产库内容')
                              : t('agent.attachment.selectCanvasNode', '选择画布节点')}
                          </button>
                          <div className="max-h-64 overflow-y-auto">
                            {attachmentMenuView === 'assets' &&
                              (assets.length > 0 ? (
                                [...assets].reverse().map((asset) => {
                                  const thumbnailSource =
                                    asset.previewUrl ||
                                    asset.imageUrl ||
                                    asset.images?.[0] ||
                                    asset.originalUrl;
                                  const thumbnail = thumbnailSource
                                    ? resolveMediaSourceUrl(thumbnailSource)
                                    : undefined;
                                  return (
                                    <AttachmentContentItem
                                      key={asset.id}
                                      title={asset.title}
                                      subtitle={`${getNodeKindDisplayLabel(asset.kind, t)} · ${asset.category}`}
                                      thumbnail={thumbnail}
                                      onClick={() => attachAsset(asset)}
                                    />
                                  );
                                })
                              ) : (
                                <AttachmentMenuEmpty
                                  text={t('agent.attachment.assetsEmpty', '资产库中还没有内容')}
                                />
                              ))}
                            {attachmentMenuView === 'nodes' &&
                              (nodes.length > 0 ? (
                                [...nodes]
                                  .reverse()
                                  .map((node) => (
                                    <AttachmentContentItem
                                      key={node.id}
                                      title={getNodeDisplayTitle(
                                        node.data.kind,
                                        node.data.title,
                                        t,
                                      )}
                                      subtitle={getNodeKindDisplayLabel(node.data.kind, t)}
                                      thumbnail={nodeImageUrls(node)[0]}
                                      selected={node.id === selectedNodeId}
                                      onClick={() => attachCanvasNode(node)}
                                    />
                                  ))
                              ) : (
                                <AttachmentMenuEmpty
                                  text={t('agent.attachment.nodesEmpty', '画布上还没有节点')}
                                />
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div ref={modelPickerRef} className="relative">
                  <ToolButton
                    icon={<Dices className="h-4 w-4" />}
                    label={t('agent.model.select', '选择 AI 模型')}
                    onClick={() => {
                      setShowModelPicker((isOpen) => {
                        if (!isOpen) setModelPickerProviderId(null);
                        return !isOpen;
                      });
                    }}
                  />
                  {showModelPicker && (
                    <div className="absolute bottom-full left-0 z-[63] mb-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1e1e21] p-1.5 shadow-2xl">
                      {modelPickerCategories.length ? (
                        selectedModelPickerCategory ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setModelPickerProviderId(null)}
                              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-white/65 hover:bg-white/[0.08] hover:text-white/90"
                            >
                              <ArrowLeft className="h-3.5 w-3.5" />
                              <ProviderBrandIcon
                                providerId={selectedModelPickerCategory.providerId}
                                providerName={selectedModelPickerCategory.providerName}
                                className="h-4 w-4"
                              />
                              {selectedModelPickerCategory.providerName}
                            </button>
                            <div className="max-h-64 overflow-y-auto">
                              {selectedModelPickerCategory.models.map((option) => {
                                const active =
                                  modelSelection?.providerId === option.providerId &&
                                  modelSelection.model === option.model;
                                return (
                                  <button
                                    key={`${option.providerId}:${option.model}`}
                                    type="button"
                                    onClick={() => {
                                      setModelSelection({
                                        providerId: option.providerId,
                                        model: option.model,
                                      });
                                      setShowModelPicker(false);
                                      flashToast(
                                        t('agent.model.selected', '已选择 {model}', {
                                          model: option.model,
                                        }),
                                      );
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.08] ${
                                      active ? 'bg-white/[0.08]' : ''
                                    }`}
                                  >
                                    <ProviderBrandIcon
                                      providerId={option.providerId}
                                      providerName={option.providerName}
                                      className="h-4 w-4"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs text-white/80">
                                        {option.model}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="px-2.5 py-1.5 text-[10px] font-medium tracking-wide text-white/35">
                              {t('agent.model.selectCategory', '选择模型分类')}
                            </p>
                            {modelPickerCategories.map((category) => {
                              const active = category.models.some(
                                (option) =>
                                  modelSelection?.providerId === option.providerId &&
                                  modelSelection.model === option.model,
                              );
                              return (
                                <button
                                  key={category.providerId}
                                  type="button"
                                  onClick={() => setModelPickerProviderId(category.providerId)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.08] ${
                                    active ? 'bg-white/[0.08]' : ''
                                  }`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ProviderBrandIcon
                                      providerId={category.providerId}
                                      providerName={category.providerName}
                                      className="h-4 w-4"
                                    />
                                    <span className="truncate text-xs text-white/80">
                                      {category.providerName}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/35">
                                    {t('agent.model.count', '{count} 个模型', {
                                      count: category.models.length,
                                    })}
                                    <ChevronRight className="h-3 w-3" />
                                  </span>
                                </button>
                              );
                            })}
                          </>
                        )
                      ) : (
                        <div className="px-2.5 py-2 text-xs text-white/40">
                          {t('agent.model.noneVerified', '暂无已验证的对话模型')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div ref={skillImportMenuRef} className="relative">
                  <ToolButton
                    icon={<PackageOpen className="h-4 w-4" />}
                    label={t('agent.skills.importLocal', '导入本地 Skill')}
                    onClick={() => {
                      setShowSavedSkillPicker(false);
                      setShowSkillImportMenu((current) => !current);
                    }}
                  />
                  {showSkillImportMenu && (
                    <div className="absolute bottom-full left-0 z-[63] mb-2 w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1e1e21] p-1.5 shadow-2xl">
                      <AttachmentMenuItem
                        icon={<PackageOpen className="h-4 w-4" />}
                        label={t('agent.skills.importFileOrZip', '导入 Skill 文件/ZIP')}
                        onClick={() => {
                          setShowSkillImportMenu(false);
                          skillFileRef.current?.click();
                        }}
                      />
                      <AttachmentMenuItem
                        icon={<FolderOpen className="h-4 w-4" />}
                        label={t('agent.skills.importFolder', '导入 Skill 文件夹')}
                        onClick={() => {
                          setShowSkillImportMenu(false);
                          skillFolderRef.current?.click();
                        }}
                      />
                    </div>
                  )}
                </div>
                <div ref={savedSkillPickerRef} className="relative">
                  <ToolButton
                    icon={<History className="h-4 w-4" />}
                    label={t('agent.skills.chooseSaved', '选择已导入 Skill')}
                    onClick={() => {
                      setShowSkillImportMenu(false);
                      setShowSavedSkillPicker((current) => !current);
                    }}
                  />
                  {showSavedSkillPicker && (
                    <div className="absolute bottom-full left-0 z-[63] mb-2 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1e1e21] p-1.5 shadow-2xl">
                      <p className="px-2.5 py-1.5 text-[10px] font-medium tracking-wide text-white/35">
                        {t('agent.skills.savedTitle', '已导入的 Skill 包与文件')}
                      </p>
                      <div className="max-h-64 overflow-y-auto">
                        {localSkillGroups.length ? (
                          localSkillGroups.map((group) => {
                            const activeCount = group.skillIds.filter((id) =>
                              activeSkillIds.includes(id),
                            ).length;
                            const allActive = activeCount === group.skillIds.length;
                            return (
                              <button
                                key={group.id}
                                type="button"
                                aria-pressed={allActive}
                                onClick={() =>
                                  setActiveSkillIds((current) => {
                                    const groupIds = new Set(group.skillIds);
                                    const enabled = group.skillIds.every((id) =>
                                      current.includes(id),
                                    );
                                    return enabled
                                      ? current.filter((id) => !groupIds.has(id))
                                      : Array.from(new Set([...current, ...group.skillIds])).slice(
                                          0,
                                          100,
                                        );
                                  })
                                }
                                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] ${
                                  allActive ? 'bg-emerald-400/[0.09]' : ''
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs text-white/80">
                                    {group.name}
                                  </span>
                                  <span className="mt-0.5 block text-[10px] text-white/35">
                                    {t('agent.skills.savedCount', '{count} 个 Skills', {
                                      count: group.skillIds.length,
                                    })}
                                  </span>
                                </span>
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
                                    allActive
                                      ? 'border-emerald-300 bg-emerald-300'
                                      : activeCount > 0
                                        ? 'border-emerald-300 bg-emerald-300/40'
                                        : 'border-white/25'
                                  }`}
                                />
                              </button>
                            );
                          })
                        ) : (
                          <AttachmentMenuEmpty
                            text={t('agent.skills.savedEmpty', '还没有已导入的 Skill')}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSend(input)}
                disabled={(!input.trim() && imageAttachments.length === 0) || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={t('agent.composer.send', '发送')}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-white/25">
            {t('agent.disclaimer', 'AI 生成内容仅供参考，请核对后使用')}
          </p>
        </div>

        {/* History popover */}
        {showHistory && (
          <div className="absolute inset-y-0 right-0 z-[61] w-full border-l border-white/[0.08] bg-[#1a1a1c]">
            <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
              <span className="text-sm font-medium text-white/90">
                {t('agent.history.title', '对话历史')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHistoryDeleteTarget({ kind: 'all' })}
                  disabled={conversations.length === 0}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-white/45 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t('agent.history.clearAllAria', '清空全部对话历史')}
                  title={t('agent.history.clearAllAria', '清空全部对话历史')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('agent.history.clear', '清空')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryDeleteTarget(null);
                    setShowHistory(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label={t('agent.history.close', '关闭对话历史')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[calc(100%-3.5rem)] space-y-2 overflow-y-auto p-4 text-xs text-white/55">
              {conversations.length ? (
                conversations.map((conversation) => (
                  <div key={conversation.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => openConversation(conversation)}
                      className={`w-full rounded-lg border px-3 py-2.5 pr-10 text-left transition-colors hover:bg-white/[0.08] ${
                        conversation.id === currentConversationId
                          ? 'border-white/[0.12] bg-white/[0.07]'
                          : 'border-transparent bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-white/80">
                          {conversationDisplayTitle(conversation)}
                        </span>
                        <span className="shrink-0 text-[10px] text-white/30">
                          {formatConversationTime(conversation.updatedAt, formatDate)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 leading-relaxed text-white/35">
                        {conversation.messages.at(-1)?.content}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryDeleteTarget({ kind: 'single', conversation })}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-[#242427] text-white/35 opacity-0 shadow-sm transition-all hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={t('agent.history.deleteNamed', '删除对话：{title}', {
                        title: conversationDisplayTitle(conversation),
                      })}
                      title={t('agent.history.deleteOne', '删除这条对话')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-white/40">
                  {t('agent.history.empty', '还没有历史对话。')}
                </p>
              )}
            </div>
            {historyDeleteTarget && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]">
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="agent-history-delete-title"
                  className="w-full max-w-xs rounded-xl border border-white/10 bg-[#232326] p-4 shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">
                      <Trash2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3
                        id="agent-history-delete-title"
                        className="text-sm font-medium text-white/90"
                      >
                        {historyDeleteTarget.kind === 'all'
                          ? t('agent.history.confirmClearTitle', '清空全部对话？')
                          : t('agent.history.confirmDeleteTitle', '删除这条对话？')}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">
                        {historyDeleteTarget.kind === 'all'
                          ? t(
                              'agent.history.confirmClearDescription',
                              '将永久删除 {count} 条历史对话，此操作无法撤销。',
                              { count: conversations.length },
                            )
                          : t(
                              'agent.history.confirmDeleteDescription',
                              '“{title}”删除后无法恢复。',
                              {
                                title: conversationDisplayTitle(historyDeleteTarget.conversation),
                              },
                            )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryDeleteTarget(null)}
                      className="rounded-md px-3 py-1.5 text-xs text-white/55 hover:bg-white/10 hover:text-white"
                    >
                      {t('common.cancel', '取消')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (historyDeleteTarget.kind === 'all') clearConversationHistory();
                        else deleteConversation(historyDeleteTarget.conversation.id);
                      }}
                      className="rounded-md bg-rose-500/15 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/25"
                    >
                      {historyDeleteTarget.kind === 'all'
                        ? t('agent.history.confirmClear', '确认清空')
                        : t('agent.history.confirmDelete', '确认删除')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings popover */}
        {showSettings && (
          <div className="absolute inset-y-0 right-0 z-[61] w-full border-l border-white/[0.08] bg-[#1a1a1c]">
            <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
              <span className="text-sm font-medium text-white/90">
                {t('agent.settings.title', '对话设置')}
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                aria-label={t('agent.settings.close', '关闭对话设置')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <SettingSelect
                label={t('agent.settings.model', 'AI 模型')}
                value={modelSettingValue}
                options={modelSettingOptions}
                onChange={(value) => {
                  if (!value) {
                    setDraftModelSelection(null);
                    return;
                  }
                  const option = catalogModels.find(
                    (item) => JSON.stringify([item.providerId, item.model]) === value,
                  );
                  if (!option) return;
                  setDraftModelSelection({ providerId: option.providerId, model: option.model });
                }}
              />
              <SettingSelect
                label={t('agent.settings.replyLength', '回复长度')}
                value={draftPreferences.replyLength}
                options={replyLengthOptions}
                onChange={(value) => {
                  const option = REPLY_LENGTH_OPTIONS.find((item) => item.value === value);
                  if (option) {
                    setDraftPreferences((current) => ({
                      ...current,
                      replyLength: option.value,
                    }));
                  }
                }}
              />
              <SettingSelect
                label={t('agent.settings.creativity', '创意程度')}
                value={draftPreferences.creativity}
                options={creativityOptions}
                onChange={(value) => {
                  const option = CREATIVITY_OPTIONS.find((item) => item.value === value);
                  if (option) {
                    setDraftPreferences((current) => ({
                      ...current,
                      creativity: option.value,
                    }));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setModelSelection(draftModelSelection);
                  setPreferences(draftPreferences);
                  setShowSettings(false);
                  flashToast(t('agent.settings.saved', '设置已保存'));
                }}
                className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-left text-sm text-emerald-300 hover:bg-emerald-500/15"
              >
                {t('agent.settings.save', '保存设置')}
              </button>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        <input
          ref={skillFileRef}
          type="file"
          accept=".md,.txt,.zip,text/markdown,text/plain,application/zip"
          multiple
          className="hidden"
          onChange={handleSkillFileChange}
        />
        <input
          ref={(node) => {
            skillFolderRef.current = node;
            node?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          multiple
          className="hidden"
          onChange={handleSkillFolderChange}
        />
        {/* Toast */}
        {toast && (
          <div className="absolute bottom-20 left-1/2 z-[62] -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-black shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

function HeaderButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function AttachmentMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-white/75 hover:bg-white/[0.07] hover:text-white"
    >
      <span className="text-white/55">{icon}</span>
      {label}
    </button>
  );
}

function AttachmentContentItem({
  title,
  subtitle,
  thumbnail,
  selected = false,
  onClick,
}: {
  title: string;
  subtitle: string;
  thumbnail?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.07] ${selected ? 'bg-white/[0.06]' : ''}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/25 text-white/35">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-white/80">{title}</span>
        <span className="block truncate text-[10px] text-white/35">{subtitle}</span>
      </span>
    </button>
  );
}

function AttachmentMenuEmpty({ text }: { text: string }) {
  return <div className="px-2.5 py-4 text-center text-xs text-white/35">{text}</div>;
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.07]"
        aria-expanded={open}
      >
        <span className="text-sm text-white/70">{label}</span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-white/40">
          <span className="max-w-[13rem] truncate">
            {selected?.label ?? t('agent.settings.selectPlaceholder', '请选择')}
          </span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className="relative z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#222225] p-1 shadow-xl">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.value || 'automatic'}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  option.value === value
                    ? 'bg-white/10 text-white/90'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/80'
                }`}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))
          ) : (
            <div className="px-2.5 py-2 text-xs text-white/35">
              {t('agent.settings.noOptions', '暂无可选项')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
