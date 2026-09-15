import { useCallback, useEffect, useState } from 'react';
import { BRIDGE_BASE_URL, resolveBridgeUrl } from './bridgeUrl';
import type { CharacterReferenceImages } from './characterCanvasLayout';
import {
  normalizeCharacterAge,
  normalizeCharacterGender,
  normalizeCharacterNationality,
  type CharacterGender,
} from './characterMetadata';
import { readConfiguredUserName } from '../store/canvasPreferences';
import {
  loadUserLibraries as loadBridgeUserLibraries,
  saveUserLibraries as saveBridgeUserLibraries,
  UserLibrariesConflictError,
  type UserLibrariesResponse,
} from '../services/userLibraries';

export type UserLibraryKind = 'style' | 'effect' | 'character' | 'camera';

export interface LibraryThumbnailCrop {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface UserLibraryPreset {
  id: string;
  kind: UserLibraryKind;
  title: string;
  category: string;
  /** Optional author retained by portable library imports. */
  author?: string;
  /** Library-card use count retained by portable library imports. */
  uses?: number;
  /** Original Style Library media presentation. */
  styleMediaKind?: 'image' | 'views' | 'video';
  /** Character reference view count retained independently from the category. */
  viewCount?: 3 | 4 | 6;
  /** Optional searchable Character Library demographic metadata. */
  gender?: CharacterGender;
  age?: number;
  nationality?: string;
  /** Optional secondary AI model category used by Style Library. */
  model?: string;
  prompt: string;
  thumbnail?: string;
  /** Stable Bridge preview id paired with the card thumbnail URL. */
  thumbnailAssetId?: string;
  /** Full source image retained separately from the card thumbnail. */
  originalImage?: string;
  /** Legacy stable URL retained only so pre-WebP Effects Library records can be converted. */
  videoUrl?: string;
  /** Stable lightweight poster used by cards and canvas nodes. */
  previewUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  /** Bridge asset id retained so project cleanup can protect referenced media. */
  bridgeAssetId?: string;
  /** Crop settings retained so the thumbnail can be reopened without losing its framing. */
  thumbnailCrop?: LibraryThumbnailCrop;
  /** Optional independent character-sheet images used by the Character Library canvas layout. */
  characterReferences?: CharacterReferenceImages;
  durationSeconds?: number;
  commercial?: boolean;
  tags: string[];
  createdAt: number;
}

export type UserLibraryPresetDraft = Omit<UserLibraryPreset, 'id' | 'kind' | 'createdAt'> & {
  id?: string;
  createdAt?: number;
};

const STORAGE_PREFIX = 'kitty-canvas-user-library-v1';
const listeners = new Map<UserLibraryKind, Set<() => void>>();
let activeUserLibrariesSnapshot: UserLibrariesResponse | undefined;
let userLibrariesSyncPromise: Promise<void> | undefined;
let userLibrariesWriteChain: Promise<void> = Promise.resolve();

function emitLibraryChange(kind: UserLibraryKind) {
  listeners.get(kind)?.forEach((listener) => listener());
}

function subscribeToLibrary(kind: UserLibraryKind, listener: () => void) {
  const kindListeners = listeners.get(kind) ?? new Set<() => void>();
  kindListeners.add(listener);
  listeners.set(kind, kindListeners);
  return () => {
    kindListeners.delete(listener);
    if (kindListeners.size === 0) listeners.delete(kind);
  };
}

function storageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}`;
}

function localUserLibrariesSnapshot() {
  return Object.fromEntries(
    (['style', 'effect', 'character', 'camera'] as UserLibraryKind[]).map((kind) => [
      kind,
      {
        presets: load(kind),
        deletedIds: [...loadDeleted(kind)],
        deletedCategories: [...loadDeletedCategories(kind)],
        deletedModels: [...loadDeletedModels(kind)],
        customCategories: [...loadStringSet(customCategoriesStorageKey(kind))],
        customModels: [...loadStringSet(customModelsStorageKey(kind))],
        renamedCategories: [...loadRenameMap(renamedCategoriesStorageKey(kind))],
        renamedModels: [...loadRenameMap(renamedModelsStorageKey(kind))],
      },
    ]),
  );
}

function writeLocalUserLibrariesSnapshot(libraries: Record<string, unknown>) {
  for (const kind of ['style', 'effect', 'character', 'camera'] as UserLibraryKind[]) {
    const raw = libraries[kind];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const data = raw as Record<string, unknown>;
    try {
      if (Array.isArray(data.presets))
        localStorage.setItem(storageKey(kind), JSON.stringify(data.presets));
      if (Array.isArray(data.deletedIds))
        localStorage.setItem(deletedStorageKey(kind), JSON.stringify(data.deletedIds));
      if (Array.isArray(data.deletedCategories))
        localStorage.setItem(
          deletedCategoriesStorageKey(kind),
          JSON.stringify(data.deletedCategories),
        );
      if (Array.isArray(data.deletedModels))
        localStorage.setItem(deletedModelsStorageKey(kind), JSON.stringify(data.deletedModels));
      if (Array.isArray(data.customCategories))
        localStorage.setItem(
          customCategoriesStorageKey(kind),
          JSON.stringify(data.customCategories),
        );
      if (Array.isArray(data.customModels))
        localStorage.setItem(customModelsStorageKey(kind), JSON.stringify(data.customModels));
      if (Array.isArray(data.renamedCategories))
        localStorage.setItem(
          renamedCategoriesStorageKey(kind),
          JSON.stringify(data.renamedCategories),
        );
      if (Array.isArray(data.renamedModels))
        localStorage.setItem(renamedModelsStorageKey(kind), JSON.stringify(data.renamedModels));
    } catch {
      // Keep the in-memory/browser copy usable when the local quota is unavailable.
    }
  }
  for (const kind of ['style', 'effect', 'character', 'camera'] as UserLibraryKind[])
    emitLibraryChange(kind);
}

async function persistUserLibrariesSnapshot() {
  try {
    activeUserLibrariesSnapshot ??= await loadBridgeUserLibraries();
    if (!activeUserLibrariesSnapshot.writable) return;
    activeUserLibrariesSnapshot = await saveBridgeUserLibraries(
      localUserLibrariesSnapshot(),
      activeUserLibrariesSnapshot.libraries.revision,
    );
  } catch (error) {
    if (error instanceof UserLibrariesConflictError && error.libraries) {
      activeUserLibrariesSnapshot = {
        libraries: error.libraries,
        writable: activeUserLibrariesSnapshot?.writable === true,
      };
      if (activeUserLibrariesSnapshot.writable) {
        try {
          activeUserLibrariesSnapshot = await saveBridgeUserLibraries(
            localUserLibrariesSnapshot(),
            activeUserLibrariesSnapshot.libraries.revision,
          );
        } catch {
          // Keep the complete browser-local copy as the offline fallback.
        }
      }
    }
  }
}

/**
 * Serialize best-effort metadata writes. Import/delete sequences can otherwise race on the same
 * Bridge revision and leave the host with an incomplete earlier snapshot.
 */
export function queueUserLibrariesSync(): Promise<void> {
  userLibrariesWriteChain = userLibrariesWriteChain.then(
    persistUserLibrariesSnapshot,
    persistUserLibrariesSnapshot,
  );
  return userLibrariesWriteChain;
}

/** Restore all user-library metadata from Bridge, migrating old browser-only records once. */
export function startUserLibrariesSync(): Promise<void> {
  if (userLibrariesSyncPromise) return userLibrariesSyncPromise;
  const local = localUserLibrariesSnapshot();
  const hasLocalData = Object.values(local).some((library) => {
    const data = library as Record<string, unknown>;
    return Object.values(data).some((value) => Array.isArray(value) && value.length > 0);
  });
  userLibrariesSyncPromise = loadBridgeUserLibraries()
    .then(async (snapshot) => {
      activeUserLibrariesSnapshot = snapshot;
      if (snapshot.libraries.revision === 0 && hasLocalData && snapshot.writable) {
        activeUserLibrariesSnapshot = await saveBridgeUserLibraries(local, 0);
        return;
      }
      if (snapshot.libraries.revision > 0 || !hasLocalData) {
        writeLocalUserLibrariesSnapshot(snapshot.libraries.libraries);
      }
    })
    .catch(() => {
      // Browser localStorage remains the offline fallback.
    });
  return userLibrariesSyncPromise;
}

export function resolveUserLibraryThumbnail(
  thumbnail: string | undefined,
  bridgeBase = BRIDGE_BASE_URL,
) {
  if (!thumbnail || thumbnail.startsWith('data:') || thumbnail.startsWith('blob:')) {
    return thumbnail;
  }
  try {
    return resolveBridgeUrl(thumbnail, bridgeBase);
  } catch {
    return thumbnail;
  }
}

function deletedStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:deleted`;
}

function deletedCategoriesStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:deleted-categories`;
}

function deletedModelsStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:deleted-models`;
}

function customCategoriesStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:custom-categories`;
}

function customModelsStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:custom-models`;
}

function renamedCategoriesStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:renamed-categories`;
}

function renamedModelsStorageKey(kind: UserLibraryKind) {
  return `${STORAGE_PREFIX}:${kind}:renamed-models`;
}

function load(kind: UserLibraryKind): UserLibraryPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(kind)) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is UserLibraryPreset =>
        Boolean(
          item && typeof item === 'object' && item.kind === kind && typeof item.id === 'string',
        ),
      )
      .map((item) =>
        kind === 'character'
          ? {
              ...item,
              gender: normalizeCharacterGender(item.gender),
              age: normalizeCharacterAge(item.age),
              nationality: normalizeCharacterNationality(item.nationality),
            }
          : item,
      );
  } catch {
    return [];
  }
}

function persist(kind: UserLibraryKind, presets: UserLibraryPreset[]) {
  const transient = presets.find((preset) =>
    [
      preset.thumbnail,
      preset.originalImage,
      preset.videoUrl,
      preset.previewUrl,
      ...Object.values(preset.characterReferences ?? {}),
    ].some((value) => /^(?:data:|blob:)/iu.test(value?.trim() ?? '')),
  );
  if (transient) {
    throw new Error(
      `“${transient.title}”仍包含仅当前会话可用的媒体，已阻止写入浏览器存储。请先由本机 Bridge 保存素材。`,
    );
  }
  try {
    // Do not silently truncate imported libraries. Bridge storage is authoritative when
    // available; localStorage remains a complete metadata fallback until its own quota is hit.
    localStorage.setItem(storageKey(kind), JSON.stringify(presets));
  } catch {
    // A large uploaded preview can exceed the browser quota. Keep the current
    // in-memory list usable without crashing the editor.
  }
  queueUserLibrariesSync();
}

function loadDeleted(kind: UserLibraryKind): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(deletedStorageKey(kind)) || '[]');
    return new Set(
      Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function persistDeleted(kind: UserLibraryKind, ids: Set<string>) {
  try {
    localStorage.setItem(deletedStorageKey(kind), JSON.stringify([...ids]));
  } catch {
    // Keep the current in-memory state usable when local storage is unavailable.
  }
}

function loadDeletedCategories(kind: UserLibraryKind): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(deletedCategoriesStorageKey(kind)) || '[]');
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function persistDeletedCategories(kind: UserLibraryKind, categories: Set<string>) {
  try {
    localStorage.setItem(deletedCategoriesStorageKey(kind), JSON.stringify([...categories]));
  } catch {
    // Keep the current in-memory state usable when local storage is unavailable.
  }
}

function loadDeletedModels(kind: UserLibraryKind): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(deletedModelsStorageKey(kind)) || '[]');
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function persistDeletedModels(kind: UserLibraryKind, models: Set<string>) {
  try {
    localStorage.setItem(deletedModelsStorageKey(kind), JSON.stringify([...models]));
  } catch {
    // Keep the current in-memory state usable when local storage is unavailable.
  }
}

function loadStringSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function persistStringSet(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Keep the current in-memory state usable when local storage is unavailable.
  }
}

function loadRenameMap(key: string): Map<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) return new Map();
    return new Map(
      value.filter(
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

function persistRenameMap(key: string, values: Map<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Keep the current in-memory state usable when local storage is unavailable.
  }
}

function replaceTag(tags: string[], from: string, to: string) {
  return [...new Set(tags.map((tag) => (tag === from ? to : tag)))];
}

function normalizeManagedName(value: string) {
  const normalized = value.trim();
  return normalized && normalized !== '未分类' ? normalized : null;
}

export interface UserLibraryCategoryManagement {
  customCategories: Set<string>;
  customModels: Set<string>;
  renamedCategories: Map<string, string>;
  renamedModels: Map<string, string>;
}

export function loadUserLibraryCategoryManagement(
  kind: UserLibraryKind,
): UserLibraryCategoryManagement {
  return {
    customCategories: loadStringSet(customCategoriesStorageKey(kind)),
    customModels: loadStringSet(customModelsStorageKey(kind)),
    renamedCategories: loadRenameMap(renamedCategoriesStorageKey(kind)),
    renamedModels: loadRenameMap(renamedModelsStorageKey(kind)),
  };
}

export function addUserLibraryCategory(kind: UserLibraryKind, value: string) {
  const category = normalizeManagedName(value);
  if (!category) return false;
  const customCategories = loadStringSet(customCategoriesStorageKey(kind));
  customCategories.add(category);
  persistStringSet(customCategoriesStorageKey(kind), customCategories);
  const deletedCategories = loadDeletedCategories(kind);
  if (deletedCategories.delete(category)) persistDeletedCategories(kind, deletedCategories);
  const renames = loadRenameMap(renamedCategoriesStorageKey(kind));
  if (renames.delete(category)) persistRenameMap(renamedCategoriesStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function addUserLibraryModelCategory(kind: UserLibraryKind, value: string) {
  const model = normalizeManagedName(value);
  if (!model) return false;
  const customModels = loadStringSet(customModelsStorageKey(kind));
  customModels.add(model);
  persistStringSet(customModelsStorageKey(kind), customModels);
  const deletedModels = loadDeletedModels(kind);
  if (deletedModels.delete(model)) persistDeletedModels(kind, deletedModels);
  const renames = loadRenameMap(renamedModelsStorageKey(kind));
  if (renames.delete(model)) persistRenameMap(renamedModelsStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function renameUserLibraryCategory(kind: UserLibraryKind, from: string, value: string) {
  const source = normalizeManagedName(from);
  const category = normalizeManagedName(value);
  if (!source || !category || source === category) return false;

  persist(
    kind,
    load(kind).map((preset) =>
      preset.category === source
        ? { ...preset, category, tags: replaceTag(preset.tags, source, category) }
        : preset,
    ),
  );

  const customCategories = loadStringSet(customCategoriesStorageKey(kind));
  customCategories.delete(source);
  customCategories.add(category);
  persistStringSet(customCategoriesStorageKey(kind), customCategories);

  const deletedCategories = loadDeletedCategories(kind);
  deletedCategories.add(source);
  deletedCategories.delete(category);
  persistDeletedCategories(kind, deletedCategories);

  const renames = loadRenameMap(renamedCategoriesStorageKey(kind));
  for (const [original, current] of renames) {
    if (current === source) renames.set(original, category);
  }
  renames.delete(category);
  renames.set(source, category);
  persistRenameMap(renamedCategoriesStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function renameUserLibraryModelCategory(kind: UserLibraryKind, from: string, value: string) {
  const source = normalizeManagedName(from);
  const model = normalizeManagedName(value);
  if (!source || !model || source === model) return false;

  persist(
    kind,
    load(kind).map((preset) =>
      preset.model === source
        ? { ...preset, model, tags: replaceTag(preset.tags, source, model) }
        : preset,
    ),
  );

  const customModels = loadStringSet(customModelsStorageKey(kind));
  customModels.delete(source);
  customModels.add(model);
  persistStringSet(customModelsStorageKey(kind), customModels);

  const deletedModels = loadDeletedModels(kind);
  deletedModels.add(source);
  deletedModels.delete(model);
  persistDeletedModels(kind, deletedModels);

  const renames = loadRenameMap(renamedModelsStorageKey(kind));
  for (const [original, current] of renames) {
    if (current === source) renames.set(original, model);
  }
  renames.delete(model);
  renames.set(source, model);
  persistRenameMap(renamedModelsStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function deleteUserLibraryCategory(kind: UserLibraryKind, value: string) {
  const category = normalizeManagedName(value);
  if (!category) return false;
  persist(
    kind,
    load(kind).map((preset) =>
      preset.category === category
        ? { ...preset, category: '未分类', tags: replaceTag(preset.tags, category, '未分类') }
        : preset,
    ),
  );

  const customCategories = loadStringSet(customCategoriesStorageKey(kind));
  customCategories.delete(category);
  persistStringSet(customCategoriesStorageKey(kind), customCategories);

  const deletedCategories = loadDeletedCategories(kind);
  deletedCategories.add(category);
  const renames = loadRenameMap(renamedCategoriesStorageKey(kind));
  for (const [original, current] of renames) {
    if (original === category || current === category) {
      deletedCategories.add(original);
      renames.delete(original);
    }
  }
  persistDeletedCategories(kind, deletedCategories);
  persistRenameMap(renamedCategoriesStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function deleteUserLibraryModelCategory(kind: UserLibraryKind, value: string) {
  const model = normalizeManagedName(value);
  if (!model) return false;
  persist(
    kind,
    load(kind).map((preset) =>
      preset.model === model
        ? { ...preset, model: '未分类', tags: replaceTag(preset.tags, model, '未分类') }
        : preset,
    ),
  );

  const customModels = loadStringSet(customModelsStorageKey(kind));
  customModels.delete(model);
  persistStringSet(customModelsStorageKey(kind), customModels);

  const deletedModels = loadDeletedModels(kind);
  deletedModels.add(model);
  const renames = loadRenameMap(renamedModelsStorageKey(kind));
  for (const [original, current] of renames) {
    if (original === model || current === model) {
      deletedModels.add(original);
      renames.delete(original);
    }
  }
  persistDeletedModels(kind, deletedModels);
  persistRenameMap(renamedModelsStorageKey(kind), renames);
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return true;
}

export function loadUserLibraryPresets(kind: UserLibraryKind): UserLibraryPreset[] {
  return load(kind);
}

export function saveUserLibraryPreset(kind: UserLibraryKind, draft: UserLibraryPresetDraft) {
  const presetId = draft.id ?? `user-${kind}-${Date.now().toString(36)}`;
  const category = draft.category.trim() || '未分类';
  const model = draft.model?.trim() || undefined;
  const existing = load(kind).find((item) => item.id === presetId);
  const replacesLegacyEffectVideo = kind === 'effect' && Boolean(draft.originalImage);
  const usesCharacterPortraitCover =
    kind === 'character' && Boolean(draft.characterReferences?.portrait?.trim());
  const preset: UserLibraryPreset = {
    id: presetId,
    kind,
    title: draft.title.trim(),
    category,
    author: draft.author ?? existing?.author ?? readConfiguredUserName(),
    uses: draft.uses ?? existing?.uses,
    styleMediaKind: draft.styleMediaKind ?? existing?.styleMediaKind,
    viewCount: draft.viewCount ?? existing?.viewCount,
    gender:
      kind === 'character' ? normalizeCharacterGender(draft.gender ?? existing?.gender) : undefined,
    age: kind === 'character' ? normalizeCharacterAge(draft.age ?? existing?.age) : undefined,
    nationality:
      kind === 'character'
        ? normalizeCharacterNationality(draft.nationality ?? existing?.nationality)
        : undefined,
    model,
    prompt: draft.prompt.trim(),
    thumbnail: usesCharacterPortraitCover ? undefined : draft.thumbnail,
    thumbnailAssetId: usesCharacterPortraitCover
      ? undefined
      : (draft.thumbnailAssetId ?? existing?.thumbnailAssetId),
    originalImage: usesCharacterPortraitCover
      ? undefined
      : (draft.originalImage ?? existing?.originalImage),
    videoUrl: replacesLegacyEffectVideo ? undefined : (draft.videoUrl ?? existing?.videoUrl),
    previewUrl: draft.previewUrl ?? existing?.previewUrl,
    mediaWidth: draft.mediaWidth ?? existing?.mediaWidth,
    mediaHeight: draft.mediaHeight ?? existing?.mediaHeight,
    bridgeAssetId: usesCharacterPortraitCover
      ? undefined
      : (draft.bridgeAssetId ?? existing?.bridgeAssetId),
    thumbnailCrop: usesCharacterPortraitCover
      ? undefined
      : (draft.thumbnailCrop ?? existing?.thumbnailCrop),
    characterReferences: draft.characterReferences ?? existing?.characterReferences,
    durationSeconds: replacesLegacyEffectVideo ? undefined : draft.durationSeconds,
    commercial: draft.commercial,
    tags: draft.tags,
    createdAt: existing?.createdAt ?? draft.createdAt ?? Date.now(),
  };
  const current = load(kind);
  const next = existing
    ? current.map((item) => (item.id === presetId ? preset : item))
    : [preset, ...current];
  persist(kind, next);

  const deletedCategories = loadDeletedCategories(kind);
  if (deletedCategories.delete(category)) persistDeletedCategories(kind, deletedCategories);
  if (model) {
    const deletedModels = loadDeletedModels(kind);
    if (deletedModels.delete(model)) persistDeletedModels(kind, deletedModels);
  }
  if (draft.id) {
    const deletedIds = loadDeleted(kind);
    if (deletedIds.delete(draft.id)) persistDeleted(kind, deletedIds);
  }
  queueUserLibrariesSync();
  emitLibraryChange(kind);
  return presetId;
}

export function useUserLibrary(kind: UserLibraryKind) {
  const [presets, setPresets] = useState<UserLibraryPreset[]>(() => load(kind));
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => loadDeleted(kind));
  const [deletedCategories, setDeletedCategories] = useState<Set<string>>(() =>
    loadDeletedCategories(kind),
  );
  const [deletedModels, setDeletedModels] = useState<Set<string>>(() => loadDeletedModels(kind));
  const [categoryManagement, setCategoryManagement] = useState<UserLibraryCategoryManagement>(() =>
    loadUserLibraryCategoryManagement(kind),
  );

  useEffect(
    () =>
      subscribeToLibrary(kind, () => {
        setPresets(load(kind));
        setDeletedIds(loadDeleted(kind));
        setDeletedCategories(loadDeletedCategories(kind));
        setDeletedModels(loadDeletedModels(kind));
        setCategoryManagement(loadUserLibraryCategoryManagement(kind));
      }),
    [kind],
  );

  const save = useCallback(
    (draft: UserLibraryPresetDraft) => saveUserLibraryPreset(kind, draft),
    [kind],
  );

  const remove = useCallback(
    (id: string, builtIn = false) => {
      setPresets((current) => {
        const next = current.filter((item) => item.id !== id);
        persist(kind, next);
        return next;
      });
      if (builtIn) {
        setDeletedIds((current) => {
          const next = new Set(current).add(id);
          persistDeleted(kind, next);
          return next;
        });
      }
      queueUserLibrariesSync();
    },
    [kind],
  );

  const deleteCategory = useCallback(
    (category: string) => deleteUserLibraryCategory(kind, category),
    [kind],
  );

  const deleteModelCategory = useCallback(
    (model: string) => deleteUserLibraryModelCategory(kind, model),
    [kind],
  );

  const addCategory = useCallback(
    (category: string) => addUserLibraryCategory(kind, category),
    [kind],
  );
  const renameCategory = useCallback(
    (category: string, nextCategory: string) =>
      renameUserLibraryCategory(kind, category, nextCategory),
    [kind],
  );
  const addModelCategory = useCallback(
    (model: string) => addUserLibraryModelCategory(kind, model),
    [kind],
  );
  const renameModelCategory = useCallback(
    (model: string, nextModel: string) => renameUserLibraryModelCategory(kind, model, nextModel),
    [kind],
  );

  return {
    presets,
    deletedIds,
    deletedCategories,
    deletedModels,
    ...categoryManagement,
    save,
    remove,
    addCategory,
    renameCategory,
    deleteCategory,
    addModelCategory,
    renameModelCategory,
    deleteModelCategory,
  };
}
