import { readConfiguredUserName } from '../store/canvasPreferences';
import { bridgeResourcePathname } from '../lib/bridgeUrl';
import { resolveMediaSourceUrl } from '../lib/mediaPreview';
import {
  loadPromptLibraryStorage,
  PromptLibraryConflictError,
  savePromptLibraryStorage,
  type PromptLibrarySnapshot,
} from '../services/promptLibrary';

export interface PromptSource {
  kind: string;
  series: string;
  fileName: string;
  sourcePath: string;
  modifiedAt: number;
  capturedAt: number;
  frameSecond: number;
}

export interface PromptModules {
  render?: string;
  video?: string;
  character?: string;
  face?: string;
  hair?: string;
  costume?: string;
  accessory?: string;
  environment?: string;
  camera?: string;
  motion?: string;
  combat?: string;
  lighting?: string;
  color?: string;
  continuity?: string;
}

export interface CustomPromptModule {
  id: string;
  name: string;
  value: string;
  group?: ModuleGroup;
  target?: PromptTarget;
}

export type PromptTarget = 'image' | 'video' | 'both';

export interface PromptItem {
  id: string;
  name: string;
  enName: string;
  category: string;
  target: PromptTarget;
  description: string;
  enDescription: string;
  prompt: string;
  promptModules?: PromptModules;
  customPromptModules?: CustomPromptModule[];
  negative?: string;
  color?: string;
  tags: string[];
  /** Author retained for user-created and portable prompt records. */
  author?: string;
  custom?: boolean;
  source?: PromptSource;
  thumbnailFile?: string;
  /** Direct preview URL used by prompts saved from a canvas image node. */
  thumbnailUrl?: string;
  /** Stable Bridge preview id paired with thumbnailUrl. */
  thumbnailAssetId?: string;
}

export interface PromptLibrary {
  version: number;
  sourceRoot: string;
  ignoredSeries: string[];
  items: PromptItem[];
}

// ---- Categorization & module metadata (ported from the old Style Library) ----

export type StylePromptModuleKey =
  | 'render'
  | 'video'
  | 'character'
  | 'face'
  | 'hair'
  | 'costume'
  | 'accessory'
  | 'environment'
  | 'camera'
  | 'motion'
  | 'combat'
  | 'lighting'
  | 'color'
  | 'continuity';

export type PromptModuleKey = StylePromptModuleKey | `custom:${string}`;

export type StyleCategory =
  | 'image'
  | 'video'
  | 'character'
  | 'face'
  | 'hair'
  | 'costume'
  | 'environment'
  | 'camera'
  | 'action'
  | 'light'
  | 'color';

export type ModuleGroup = 'look' | 'character' | 'motion' | 'control';

export const STYLE_PROMPT_MODULES: Array<{
  key: StylePromptModuleKey;
  zh: string;
  en: string;
  group: ModuleGroup;
  target: 'image' | 'video' | 'both';
}> = [
  { key: 'render', zh: '画面渲染', en: 'Rendering', group: 'look', target: 'both' },
  {
    key: 'environment',
    zh: '场景材质',
    en: 'Environment & materials',
    group: 'look',
    target: 'both',
  },
  { key: 'lighting', zh: '光影设计', en: 'Lighting', group: 'look', target: 'both' },
  { key: 'color', zh: '色彩脚本', en: 'Color script', group: 'look', target: 'both' },
  { key: 'character', zh: '人物比例', en: 'Character design', group: 'character', target: 'both' },
  { key: 'face', zh: '脸型五官', en: 'Face design', group: 'character', target: 'both' },
  { key: 'hair', zh: '发型发束', en: 'Hair design', group: 'character', target: 'both' },
  { key: 'costume', zh: '服饰结构', en: 'Costume', group: 'character', target: 'both' },
  {
    key: 'accessory',
    zh: '配饰道具',
    en: 'Accessories & props',
    group: 'character',
    target: 'both',
  },
  { key: 'video', zh: '视频画风', en: 'Video look', group: 'motion', target: 'video' },
  { key: 'camera', zh: '运镜镜头', en: 'Camera language', group: 'motion', target: 'both' },
  { key: 'motion', zh: '动作节奏', en: 'Motion timing', group: 'motion', target: 'video' },
  { key: 'combat', zh: '打斗编排', en: 'Combat choreography', group: 'motion', target: 'video' },
  { key: 'continuity', zh: '连续性控制', en: 'Continuity', group: 'control', target: 'both' },
];

export const STYLE_CATEGORY_OPTIONS: Array<{ key: StyleCategory; zh: string; en: string }> = [
  { key: 'image', zh: '动漫画风', en: 'Image' },
  { key: 'video', zh: '视频画风', en: 'Video' },
  { key: 'character', zh: '人物设计', en: 'Character' },
  { key: 'face', zh: '脸型五官', en: 'Face' },
  { key: 'hair', zh: '发型', en: 'Hair' },
  { key: 'costume', zh: '服饰配饰', en: 'Costume' },
  { key: 'environment', zh: '场景材质', en: 'Environment' },
  { key: 'camera', zh: '运镜', en: 'Camera' },
  { key: 'action', zh: '打斗', en: 'Combat' },
  { key: 'light', zh: '光影', en: 'Lighting' },
  { key: 'color', zh: '色彩', en: 'Color' },
];

// Which modules a style contributes when filtered by a given top-level category.
export const STYLE_CATEGORY_MODULES: Record<StyleCategory, StylePromptModuleKey[]> = {
  image: ['render'],
  video: ['video', 'motion'],
  character: ['character'],
  face: ['face'],
  hair: ['hair'],
  costume: ['costume', 'accessory'],
  environment: ['environment'],
  camera: ['camera'],
  action: ['combat'],
  light: ['lighting'],
  color: ['color'],
};

export const MODULE_GROUP_LABELS: Record<ModuleGroup, { zh: string; en: string }> = {
  look: { zh: '画面', en: 'Look' },
  character: { zh: '人物', en: 'Character' },
  motion: { zh: '动作', en: 'Motion' },
  control: { zh: '控制', en: 'Control' },
};

/** Keep only supported, non-empty prompt modules at the persistence boundary. */
export function normalizePromptModules(modules?: PromptModules): PromptModules {
  const normalized: PromptModules = {};
  for (const { key } of STYLE_PROMPT_MODULES) {
    const value = modules?.[key]?.trim();
    if (value) normalized[key] = value;
  }
  return normalized;
}

/** Normalize user-authored modules while keeping their stable selection ids. */
export function normalizeCustomPromptModules(modules?: CustomPromptModule[]): CustomPromptModule[] {
  if (!Array.isArray(modules)) return [];
  const seen = new Set<string>();
  const normalized: CustomPromptModule[] = [];
  for (const module of modules) {
    const id = typeof module?.id === 'string' ? module.id.trim() : '';
    const name = typeof module?.name === 'string' ? module.name.trim() : '';
    const value = typeof module?.value === 'string' ? module.value.trim() : '';
    if (!id || !name || !value || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name,
      value,
      group:
        module.group === 'look' ||
        module.group === 'character' ||
        module.group === 'motion' ||
        module.group === 'control'
          ? module.group
          : 'control',
      target:
        module.target === 'image' || module.target === 'video' || module.target === 'both'
          ? module.target
          : 'both',
    });
  }
  return normalized;
}

export type TaskType = 'image' | 'video' | 'all' | 'script';
export type PromptLibrarySort = 'recommended' | 'recent' | 'name';

function customPromptCreatedAt(item: PromptItem): number {
  const match = /^custom_([0-9a-z]+)_/i.exec(item.id);
  if (!match?.[1]) return 0;
  const createdAt = Number.parseInt(match[1], 36);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

/** Sort a projected prompt list without mutating the library cache order. */
export function sortPromptItems(
  items: PromptItem[],
  sort: PromptLibrarySort,
  language: string,
): PromptItem[] {
  if (sort === 'recommended') return [...items];
  const locale = language === 'zh-CN' ? 'zh-Hans-CN' : 'en-US';
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (sort === 'recent') {
        const difference = customPromptCreatedAt(right.item) - customPromptCreatedAt(left.item);
        if (difference !== 0) return difference;
      } else {
        const leftName = language === 'zh-CN' ? left.item.name : left.item.enName || left.item.name;
        const rightName =
          language === 'zh-CN' ? right.item.name : right.item.enName || right.item.name;
        const difference = leftName.localeCompare(rightName, locale);
        if (difference !== 0) return difference;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

// ---- Custom user-editable prompts ("剧本" / prompt scripts) ----

export type CustomPrompt = PromptItem & { custom: true };

const CUSTOM_PROMPTS_KEY = 'libtv-prompt-library-custom';
const CUSTOM_PROMPT_CATEGORIES_KEY = 'kitty-canvas-prompt-library-custom-categories';
const RENAMED_PROMPT_CATEGORIES_KEY = 'kitty-canvas-prompt-library-renamed-categories';
const DELETED_PROMPT_CATEGORIES_KEY = 'kitty-canvas-prompt-library-deleted-categories';
export const PROMPT_UNCATEGORIZED = 'uncategorized';

let activePromptLibrarySnapshot: PromptLibrarySnapshot | undefined;
let promptLibrarySyncPromise: Promise<void> | undefined;

function readPromptLibraryUserData() {
  const rawCategories = localStorage.getItem(CUSTOM_PROMPT_CATEGORIES_KEY);
  const rawRenames = localStorage.getItem(RENAMED_PROMPT_CATEGORIES_KEY);
  const rawDeleted = localStorage.getItem(DELETED_PROMPT_CATEGORIES_KEY);
  let categories: string[] = [];
  let renames: [string, string][] = [];
  let deleted: string[] = [];
  try {
    const parsed = rawCategories ? JSON.parse(rawCategories) : [];
    categories = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    // The local fallback remains readable through the existing normalizers.
  }
  try {
    const parsed = rawRenames ? JSON.parse(rawRenames) : [];
    renames = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is [string, string] =>
            Array.isArray(item) &&
            item.length === 2 &&
            typeof item[0] === 'string' &&
            typeof item[1] === 'string',
        )
      : [];
  } catch {
    // The local fallback remains readable through the existing normalizers.
  }
  try {
    const parsed = rawDeleted ? JSON.parse(rawDeleted) : [];
    deleted = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    // The local fallback remains readable through the existing normalizers.
  }
  return {
    items: loadCustomPrompts(),
    categories,
    renames,
    deleted,
  };
}

function applyPromptLibraryUserData(data: PromptLibrarySnapshot['library']) {
  try {
    localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(data.items));
    localStorage.setItem(CUSTOM_PROMPT_CATEGORIES_KEY, JSON.stringify(data.categories));
    localStorage.setItem(RENAMED_PROMPT_CATEGORIES_KEY, JSON.stringify(data.renames));
    localStorage.setItem(DELETED_PROMPT_CATEGORIES_KEY, JSON.stringify(data.deleted));
  } catch {
    // Keep the current in-memory library usable when browser storage is unavailable.
  }
  refreshPromptLibrary();
}

async function persistPromptLibraryUserData() {
  try {
    activePromptLibrarySnapshot ??= await loadPromptLibraryStorage();
    if (!activePromptLibrarySnapshot.writable) return;
    const local = readPromptLibraryUserData();
    activePromptLibrarySnapshot = await savePromptLibraryStorage(
      local,
      activePromptLibrarySnapshot.library.revision,
    );
  } catch (error) {
    if (error instanceof PromptLibraryConflictError && error.library) {
      activePromptLibrarySnapshot = {
        library: error.library,
        writable: activePromptLibrarySnapshot?.writable === true,
      };
      // A startup sync or another window can legitimately advance the
      // revision between our read and PATCH. Retry once with the latest
      // revision so a freshly replaced thumbnail is not dropped silently.
      if (activePromptLibrarySnapshot.writable) {
        try {
          activePromptLibrarySnapshot = await savePromptLibraryStorage(
            readPromptLibraryUserData(),
            activePromptLibrarySnapshot.library.revision,
          );
        } catch {
          // Keep the browser-local copy as the offline fallback.
        }
      }
    }
  }
}

/** Queue a best-effort host persistence write while keeping localStorage as an offline fallback. */
export function queuePromptLibrarySync(): Promise<void> {
  return persistPromptLibraryUserData();
}

/** Hydrate custom prompts and categories from the host Bridge, migrating local-only data once. */
export function startPromptLibrarySync(): Promise<void> {
  if (promptLibrarySyncPromise) return promptLibrarySyncPromise;
  const local = readPromptLibraryUserData();
  const hasLocalData =
    local.items.length > 0 ||
    local.categories.length > 0 ||
    local.renames.length > 0 ||
    local.deleted.length > 0;
  promptLibrarySyncPromise = loadPromptLibraryStorage()
    .then(async (snapshot) => {
      activePromptLibrarySnapshot = snapshot;
      if (snapshot.library.revision === 0 && hasLocalData && snapshot.writable) {
        activePromptLibrarySnapshot = await savePromptLibraryStorage(local, 0);
        applyPromptLibraryUserData(activePromptLibrarySnapshot.library);
        return;
      }
      if (snapshot.library.revision > 0 || !hasLocalData) {
        applyPromptLibraryUserData(snapshot.library);
      }
    })
    .catch(() => {
      // The local browser copy remains available while the Bridge restarts or is offline.
    });
  return promptLibrarySyncPromise;
}

function normalizeCustomCategory(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

/** Load user-created Prompt Library categories, including categories that do
 * not have a saved prompt yet. */
export function loadPromptCustomCategories(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_PROMPT_CATEGORIES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const categories = parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(categories)];
  } catch {
    return [];
  }
}

/** Persist an empty or immediately selected Prompt Library category. */
export function addPromptCustomCategory(value: string): boolean {
  const category = normalizeCustomCategory(value);
  if (!category || category === '未分类' || category === PROMPT_UNCATEGORIZED) return false;
  const categories = loadPromptCustomCategories();
  if (categories.some((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase())) {
    return false;
  }
  try {
    localStorage.setItem(CUSTOM_PROMPT_CATEGORIES_KEY, JSON.stringify([...categories, category]));
    queuePromptLibrarySync();
    return true;
  } catch {
    return false;
  }
}

export function loadPromptDeletedCategories(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_PROMPT_CATEGORIES_KEY) || '[]');
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function persistPromptDeletedCategories(categories: Set<string>): boolean {
  try {
    localStorage.setItem(DELETED_PROMPT_CATEGORIES_KEY, JSON.stringify([...categories]));
    queuePromptLibrarySync();
    return true;
  } catch {
    return false;
  }
}

export function loadPromptCategoryRenames(): Map<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(RENAMED_PROMPT_CATEGORIES_KEY) || '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(
        (item): item is [string, string] =>
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === 'string' &&
          typeof item[1] === 'string',
      ),
    );
  } catch {
    return new Map();
  }
}

function persistPromptCategoryRenames(renames: Map<string, string>): boolean {
  try {
    localStorage.setItem(RENAMED_PROMPT_CATEGORIES_KEY, JSON.stringify([...renames]));
    queuePromptLibrarySync();
    return true;
  } catch {
    return false;
  }
}

export function resolvePromptCategory(value: string): string {
  const renames = loadPromptCategoryRenames();
  const deleted = loadPromptDeletedCategories();
  let category = value;
  const visited = new Set<string>();
  while (renames.has(category) && !visited.has(category)) {
    visited.add(category);
    category = renames.get(category) ?? category;
  }
  return deleted.has(value) || deleted.has(category) ? PROMPT_UNCATEGORIZED : category;
}

function replaceCategoryTag(tags: string[], from: string, to: string): string[] {
  return [...new Set(tags.map((tag) => (tag === from ? to : tag)))];
}

/** Rename a built-in or custom Prompt Library category and migrate saved
 * prompts that already use it. Built-in library items are projected through
 * the persisted rename map when the library is loaded. */
export function renamePromptCategory(from: string, value: string): boolean {
  const source = normalizeCustomCategory(from);
  const category = normalizeCustomCategory(value);
  if (!source || !category || source === category) return false;

  const renames = loadPromptCategoryRenames();
  const originalSource = [...renames].find(([, current]) => current === source)?.[0] ?? source;
  const builtInSource = STYLE_CATEGORY_OPTIONS.some((option) => option.key === originalSource);

  if (builtInSource) {
    renames.set(originalSource, category);
    if (!persistPromptCategoryRenames(renames)) return false;
  }

  const customCategories = loadPromptCustomCategories();
  const sourceIndex = customCategories.findIndex(
    (item) => item.toLocaleLowerCase() === source.toLocaleLowerCase(),
  );
  const nextCategories = [...customCategories];
  if (sourceIndex >= 0) nextCategories[sourceIndex] = category;
  else if (!builtInSource) nextCategories.push(category);
  try {
    localStorage.setItem(
      CUSTOM_PROMPT_CATEGORIES_KEY,
      JSON.stringify([...new Set(nextCategories)]),
    );
    queuePromptLibrarySync();
  } catch {
    return false;
  }

  saveCustomPrompts(
    loadCustomPrompts().map((item) =>
      item.category === source
        ? { ...item, category, tags: replaceCategoryTag(item.tags, source, category) }
        : item,
    ),
  );
  refreshPromptLibrary();
  return true;
}

/** Delete a Prompt Library category and move its saved/static contents into
 * the protected Uncategorized fallback. */
export function deletePromptCategory(value: string): boolean {
  const source = normalizeCustomCategory(value);
  if (!source || source === '未分类' || source === PROMPT_UNCATEGORIZED) return false;

  const renames = loadPromptCategoryRenames();
  const originalSource = [...renames].find(([, current]) => current === source)?.[0] ?? source;
  const builtInSource = STYLE_CATEGORY_OPTIONS.some((option) => option.key === originalSource);

  if (builtInSource) {
    const deleted = loadPromptDeletedCategories();
    deleted.add(originalSource);
    if (!persistPromptDeletedCategories(deleted)) return false;
    if (renames.delete(originalSource) && !persistPromptCategoryRenames(renames)) return false;
  }

  const customCategories = loadPromptCustomCategories().filter(
    (category) => category.toLocaleLowerCase() !== source.toLocaleLowerCase(),
  );
  try {
    localStorage.setItem(CUSTOM_PROMPT_CATEGORIES_KEY, JSON.stringify(customCategories));
    queuePromptLibrarySync();
  } catch {
    return false;
  }

  saveCustomPrompts(
    loadCustomPrompts().map((item) =>
      item.category === source
        ? {
            ...item,
            category: PROMPT_UNCATEGORIZED,
            tags: replaceCategoryTag(item.tags, source, '未分类'),
          }
        : item,
    ),
  );
  refreshPromptLibrary();
  return true;
}

function generateCustomId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadCustomPrompts(): CustomPrompt[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROMPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomPrompt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPrompts(items: CustomPrompt[]): void {
  // A previous session may have left a transient crop URL in localStorage.
  // Do not let that stale record block unrelated edits: the editor uploads
  // the active crop to Bridge before calling this function, while old
  // transient fields are safely discarded rather than persisted again.
  const persistedItems = items.map((item) => {
    const next = { ...item };
    if (/^(?:data:|blob:)/iu.test(next.thumbnailFile?.trim() ?? '')) {
      next.thumbnailFile = '';
    }
    if (/^(?:data:|blob:)/iu.test(next.thumbnailUrl?.trim() ?? '')) {
      delete next.thumbnailUrl;
      delete next.thumbnailAssetId;
    }
    return next;
  });
  try {
    localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(persistedItems));
    queuePromptLibrarySync();
  } catch {
    // ignore quota errors
  }
}

export function addCustomPrompt(
  partial: Omit<CustomPrompt, 'id' | 'custom' | 'enName' | 'enDescription' | 'sourceRoot'>,
): CustomPrompt {
  const item: CustomPrompt = {
    ...partial,
    author: partial.author ?? readConfiguredUserName(),
    id: generateCustomId(),
    custom: true,
    enName: partial.name,
    enDescription: partial.description,
  };
  const next = [item, ...loadCustomPrompts()];
  saveCustomPrompts(next);
  return item;
}

export function updateCustomPrompt(
  id: string,
  partial: Partial<Omit<CustomPrompt, 'id' | 'custom'>>,
): CustomPrompt | null {
  const items = loadCustomPrompts();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const prev = items[idx]!;
  const updated: CustomPrompt = {
    ...prev,
    name: partial.name ?? prev.name,
    enName: partial.enName ?? partial.name ?? prev.enName,
    category: partial.category ?? prev.category,
    target: partial.target ?? prev.target,
    description: partial.description ?? prev.description,
    enDescription: partial.enDescription ?? partial.description ?? prev.enDescription,
    prompt: partial.prompt ?? prev.prompt,
    promptModules: partial.promptModules ?? prev.promptModules,
    customPromptModules: partial.customPromptModules ?? prev.customPromptModules,
    negative: partial.negative !== undefined ? partial.negative : prev.negative,
    color: partial.color ?? prev.color,
    tags: partial.tags ?? prev.tags,
    author: partial.author ?? prev.author,
    source: partial.source ?? prev.source,
    thumbnailFile: partial.thumbnailFile !== undefined ? partial.thumbnailFile : prev.thumbnailFile,
    thumbnailUrl: partial.thumbnailUrl !== undefined ? partial.thumbnailUrl : prev.thumbnailUrl,
    thumbnailAssetId:
      partial.thumbnailAssetId !== undefined ? partial.thumbnailAssetId : prev.thumbnailAssetId,
    id,
    custom: true,
  };
  items[idx] = updated;
  saveCustomPrompts(items);
  return updated;
}

export function deleteCustomPrompt(id: string): boolean {
  const items = loadCustomPrompts();
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return false;
  saveCustomPrompts(next);
  return true;
}

/** Upsert a custom prompt by id. If it does not exist, append it. Used to let
 *  users edit built-in prompts and save a local override copy. */
export function saveCustomPrompt(item: CustomPrompt): void {
  const authoredItem = {
    ...item,
    author: item.author ?? readConfiguredUserName(),
  };
  const items = loadCustomPrompts();
  const idx = items.findIndex((i) => i.id === authoredItem.id);
  if (idx === -1) {
    items.unshift(authoredItem);
  } else {
    items[idx] = authoredItem;
  }
  saveCustomPrompts(items);
}

function moduleMatchesTask(target: 'image' | 'video' | 'both', task: TaskType): boolean {
  if (task === 'all') return true;
  return target === 'both' || target === task;
}

/** Modules of a style that have a value and are applicable to the task type. */
export function styleModuleEntries(
  style: PromptItem,
  task: TaskType = 'all',
): Array<{
  key: PromptModuleKey;
  zh: string;
  en: string;
  group: ModuleGroup;
  target: 'image' | 'video' | 'both';
  value: string;
}> {
  const builtInEntries = STYLE_PROMPT_MODULES.filter((module) => {
    const value = style.promptModules?.[module.key];
    return Boolean(value && value.trim()) && moduleMatchesTask(module.target, task);
  }).map((module) => ({
    ...module,
    value: style.promptModules?.[module.key]?.trim() || '',
  }));
  const customEntries = normalizeCustomPromptModules(style.customPromptModules)
    .filter((module) => moduleMatchesTask(module.target ?? 'both', task))
    .map((module) => ({
      key: `custom:${module.id}` as const,
      zh: module.name,
      en: module.name,
      group: module.group ?? 'control',
      target: module.target ?? 'both',
      value: module.value,
    }));
  return [...builtInEntries, ...customEntries];
}

/** Whether a style appears under a given top-level category. */
export function styleSupportsCategory(style: PromptItem, category: string | 'all'): boolean {
  if (category === 'all' || style.category === category) return true;
  const moduleKeys = STYLE_CATEGORY_MODULES[category as StyleCategory];
  if (!moduleKeys) return false;
  return moduleKeys.some((key) => Boolean(style.promptModules?.[key]?.trim()));
}

/** Compose a modular prompt from the selected modules of one style. */
export function composeStylePrompt(
  style: PromptItem,
  selectedKeys: PromptModuleKey[],
  task: TaskType = 'all',
): { prompt: string; negative: string } {
  const entries = styleModuleEntries(style, task).filter((e) => selectedKeys.includes(e.key));
  const sections = entries.map((e) => `- ${e.zh}: ${e.value}`).join('\n');
  const negative = style.negative?.trim() || '';
  const head = sections
    ? `【模块化风格 · ${style.name}】\n${sections}`
    : style.prompt?.trim()
      ? `【风格 · ${style.name}】\n${style.prompt.trim()}`
      : '';
  const negBlock = negative ? `\n【负面约束】\n${negative}` : '';
  return { prompt: `${head}${negBlock}`.trim(), negative };
}

let cached: PromptLibrary | null = null;

async function fetchPromptLibraryDocument(url: string): Promise<PromptLibrary | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  // Older bundled Bridges served static JSON as application/octet-stream.
  // Keep accepting that legacy response during upgrades, while still rejecting
  // HTML shell fallbacks before attempting to parse them as library data.
  if (
    !contentType.includes('application/json') &&
    !contentType.includes('application/octet-stream')
  ) {
    return null;
  }
  try {
    const value = (await response.json()) as Partial<PromptLibrary>;
    if (
      value.version !== 1 ||
      typeof value.sourceRoot !== 'string' ||
      !Array.isArray(value.ignoredSeries) ||
      !Array.isArray(value.items)
    ) {
      return null;
    }
    return value as PromptLibrary;
  } catch {
    return null;
  }
}

export async function loadPromptLibrary(): Promise<PromptLibrary> {
  if (cached) return cached;
  const data =
    (await fetchPromptLibraryDocument('/prompt-library/library.json')) ??
    (await fetchPromptLibraryDocument('/prompt-library/library.opensource.json'));
  if (!data) throw new Error('Failed to load a valid prompt library.');
  const customs = loadCustomPrompts();
  // Local custom overrides win over built-ins by id so edited built-in prompts
  // can be saved as a local copy.
  const overrideIds = new Set(customs.map((i) => i.id));
  data.items = [...data.items.filter((i) => !overrideIds.has(i.id)), ...customs].map((item) => {
    const category = resolvePromptCategory(item.category);
    return category === item.category
      ? item
      : { ...item, category, tags: replaceCategoryTag(item.tags, item.category, category) };
  });
  cached = data;
  return data;
}

export function refreshPromptLibrary(): void {
  cached = null;
}

export function getPromptThumbnailUrl(item: PromptItem): string {
  if (item.thumbnailUrl) {
    // Older snapshots may contain a relative Bridge path or a loopback URL.
    // Rebase persisted media to the Bridge serving the current page so the
    // thumbnail remains visible after restart and on LAN clients.
    const resourcePath = bridgeResourcePathname(item.thumbnailUrl);
    if (resourcePath?.startsWith('/media-preview/files/')) {
      return resolveMediaSourceUrl(item.thumbnailUrl);
    }
    return item.thumbnailUrl;
  }
  if (!item.thumbnailFile) return '';
  if (/^(?:data:|blob:|https?:\/\/)/u.test(item.thumbnailFile)) return item.thumbnailFile;
  return `/prompt-library/thumbnails/${item.thumbnailFile}`;
}

export function getPromptTags(library: PromptLibrary): string[] {
  const set = new Set<string>();
  for (const item of library.items) {
    for (const tag of item.tags) set.add(tag);
  }
  return Array.from(set);
}
