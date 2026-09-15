import {
  IMAGE_TYPE_DESCRIPTIONS,
  IMAGE_TYPE_GROUPS,
  imageTypeBuiltInPrompt,
} from './imageGeneration';
import {
  ImageTypePresetCatalogConflictError,
  loadImageTypePresetCatalogStorage,
  saveImageTypePresetCatalogStorage,
  type ImageTypePresetCatalogSnapshot,
} from '../services/imageTypePresetCatalog';

const STORAGE_KEY = 'kitty-canvas-image-type-presets-v1';
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;
const MAX_CATEGORY_COUNT = 40;
const MAX_CATEGORY_LENGTH = 40;
const TRANSFER_KIND = 'qiansi-image-type-presets';

export const IMAGE_TYPE_CATEGORY_COLUMNS = IMAGE_TYPE_GROUPS.map((column) =>
  column.groups.map((group) => group.title),
);

export const IMAGE_TYPE_CATEGORIES = IMAGE_TYPE_CATEGORY_COLUMNS.flat();

export type ImageTypePreset = {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  builtIn: boolean;
};

export type ImageTypePresetCatalog = {
  categories: string[];
  presets: ImageTypePreset[];
};

export type ImageTypePresetImportResult = {
  catalog: ImageTypePresetCatalog;
  importedCount: number;
  skippedCount: number;
};

type LocalImageTypePresetCatalog = {
  catalog: ImageTypePresetCatalog;
  bridgeRevision: number;
};

const catalogListeners = new Set<(catalog: ImageTypePresetCatalog) => void>();
let cachedCatalog: ImageTypePresetCatalog | undefined;
let activeBridgeSnapshot: ImageTypePresetCatalogSnapshot | undefined;
let startupSyncPromise: Promise<void> | undefined;
let catalogWriteChain: Promise<void> = Promise.resolve();
let localMutationVersion = 0;

function sanitizeCategory(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_CATEGORY_LENGTH) : '';
}

function sanitizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const categories: string[] = [];
  const seen = new Set<string>();
  for (const rawCategory of value.slice(0, MAX_CATEGORY_COUNT)) {
    const category = sanitizeCategory(rawCategory);
    if (!category || seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return categories;
}

export function defaultImageTypePresets(): ImageTypePreset[] {
  return IMAGE_TYPE_GROUPS.flatMap((column) =>
    column.groups.flatMap((group) =>
      group.options.map((name) => ({
        id: `builtin:${name}`,
        name,
        category: group.title,
        description: IMAGE_TYPE_DESCRIPTIONS[name] ?? '',
        prompt: imageTypeBuiltInPrompt(name) ?? '',
        builtIn: true,
      })),
    ),
  );
}

function sanitizePreset(value: unknown, categories: Set<string>): ImageTypePreset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim().slice(0, 160) : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 80) : '';
  const category = sanitizeCategory(candidate.category);
  const description =
    typeof candidate.description === 'string' ? candidate.description.trim().slice(0, 240) : '';
  const prompt =
    typeof candidate.prompt === 'string' ? candidate.prompt.trim().slice(0, 10_000) : '';
  if (!id || !name || !category || !categories.has(category) || !description || !prompt)
    return null;
  return { id, name, category, description, prompt, builtIn: candidate.builtIn === true };
}

export function defaultImageTypePresetCatalog(): ImageTypePresetCatalog {
  return {
    categories: [...IMAGE_TYPE_CATEGORIES],
    presets: defaultImageTypePresets(),
  };
}

export function parseImageTypePresetCatalogDocument(value: unknown): ImageTypePresetCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const document = value as Record<string, unknown>;
  if (!Array.isArray(document.presets)) return null;
  const categories =
    document.version === LEGACY_STORAGE_VERSION
      ? [...IMAGE_TYPE_CATEGORIES]
      : document.version === STORAGE_VERSION
        ? sanitizeCategories(document.categories)
        : [];
  if (!categories.length) return null;
  const allowedCategories = new Set(categories);
  const result: ImageTypePreset[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const rawPreset of document.presets.slice(0, 100)) {
    const preset = sanitizePreset(rawPreset, allowedCategories);
    if (!preset || ids.has(preset.id) || names.has(preset.name)) continue;
    ids.add(preset.id);
    names.add(preset.name);
    result.push(preset);
  }
  return { categories, presets: result };
}

export function parseImageTypePresetDocument(value: unknown): ImageTypePreset[] | null {
  return parseImageTypePresetCatalogDocument(value)?.presets ?? null;
}

export function serializeImageTypePresetCatalog(catalog: ImageTypePresetCatalog): string {
  return JSON.stringify(
    {
      kind: TRANSFER_KIND,
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      categories: catalog.categories.slice(0, MAX_CATEGORY_COUNT),
      presets: catalog.presets.slice(0, 100),
    },
    null,
    2,
  );
}

export function mergeImageTypePresetCatalog(
  current: ImageTypePresetCatalog,
  incoming: ImageTypePresetCatalog,
): ImageTypePresetImportResult {
  const categories = sanitizeCategories([...current.categories, ...incoming.categories]);
  const allowedCategories = new Set(categories);
  const presets = current.presets.slice(0, 100);
  const ids = new Set(presets.map((preset) => preset.id));
  const names = new Set(presets.map((preset) => preset.name));
  let importedCount = 0;
  let skippedCount = 0;
  for (const preset of incoming.presets) {
    if (
      presets.length >= 100 ||
      !allowedCategories.has(preset.category) ||
      ids.has(preset.id) ||
      names.has(preset.name)
    ) {
      skippedCount += 1;
      continue;
    }
    presets.push(preset);
    ids.add(preset.id);
    names.add(preset.name);
    importedCount += 1;
  }
  return { catalog: { categories, presets }, importedCount, skippedCount };
}

function readLocalImageTypePresetCatalog(): LocalImageTypePresetCatalog | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    const document = JSON.parse(raw) as Record<string, unknown>;
    const catalog = parseImageTypePresetCatalogDocument(document);
    if (!catalog) return undefined;
    const bridgeRevision = Number(document.bridgeRevision);
    return {
      catalog,
      bridgeRevision:
        Number.isSafeInteger(bridgeRevision) && bridgeRevision >= 0 ? bridgeRevision : 0,
    };
  } catch {
    return undefined;
  }
}

function writeLocalImageTypePresetCatalog(
  catalog: ImageTypePresetCatalog,
  bridgeRevision: number,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        bridgeRevision,
        categories: catalog.categories.slice(0, MAX_CATEGORY_COUNT),
        presets: catalog.presets.slice(0, 100),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function catalogFromBridgeSnapshot(snapshot: ImageTypePresetCatalogSnapshot) {
  const catalog = parseImageTypePresetCatalogDocument({
    version: STORAGE_VERSION,
    categories: snapshot.catalog.categories,
    presets: snapshot.catalog.presets,
  });
  if (catalog) return catalog;
  if (snapshot.catalog.revision === 0) return defaultImageTypePresetCatalog();
  throw new Error('Bridge 返回的图片生成类型目录无效。');
}

function emitCatalog(catalog: ImageTypePresetCatalog) {
  catalogListeners.forEach((listener) => listener(catalog));
}

function applyBridgeSnapshot(snapshot: ImageTypePresetCatalogSnapshot) {
  const catalog = catalogFromBridgeSnapshot(snapshot);
  activeBridgeSnapshot = snapshot;
  cachedCatalog = catalog;
  writeLocalImageTypePresetCatalog(catalog, snapshot.catalog.revision);
  emitCatalog(catalog);
}

async function persistCatalogToBridge(
  desiredCatalog: ImageTypePresetCatalog,
  mutationVersion: number,
) {
  try {
    activeBridgeSnapshot ??= await loadImageTypePresetCatalogStorage();
    if (!activeBridgeSnapshot.writable) return;
    const saved = await saveImageTypePresetCatalogStorage(
      desiredCatalog,
      activeBridgeSnapshot.catalog.revision,
    );
    activeBridgeSnapshot = saved;
    if (mutationVersion === localMutationVersion) applyBridgeSnapshot(saved);
  } catch (error) {
    if (!(error instanceof ImageTypePresetCatalogConflictError) || !error.catalog) return;
    const current: ImageTypePresetCatalogSnapshot = {
      catalog: error.catalog,
      writable: activeBridgeSnapshot?.writable === true,
    };
    activeBridgeSnapshot = current;
    if (!current.writable) return;
    try {
      const merged = mergeImageTypePresetCatalog(
        desiredCatalog,
        catalogFromBridgeSnapshot(current),
      );
      const saved = await saveImageTypePresetCatalogStorage(
        merged.catalog,
        current.catalog.revision,
      );
      activeBridgeSnapshot = saved;
      if (mutationVersion === localMutationVersion) applyBridgeSnapshot(saved);
    } catch {
      // Keep the complete browser-local copy as the offline fallback.
    }
  }
}

/** Serialize host writes so rapid additions cannot overwrite a newer local catalog. */
export function queueImageTypePresetCatalogSync(
  catalog = cachedCatalog ?? loadImageTypePresetCatalog(),
  mutationVersion = localMutationVersion,
): Promise<void> {
  catalogWriteChain = catalogWriteChain.then(
    () => persistCatalogToBridge(catalog, mutationVersion),
    () => persistCatalogToBridge(catalog, mutationVersion),
  );
  return catalogWriteChain;
}

/** Migrate the browser-only catalog once, then restore the host-authoritative snapshot. */
export function startImageTypePresetCatalogSync(): Promise<void> {
  if (startupSyncPromise) return startupSyncPromise;
  const local = readLocalImageTypePresetCatalog();
  if (local) cachedCatalog = local.catalog;
  const startupMutationVersion = localMutationVersion;
  startupSyncPromise = loadImageTypePresetCatalogStorage()
    .then(async (snapshot) => {
      activeBridgeSnapshot = snapshot;
      if (startupMutationVersion !== localMutationVersion) {
        await queueImageTypePresetCatalogSync();
        return;
      }
      if (snapshot.catalog.revision === 0 && local && snapshot.writable) {
        await persistCatalogToBridge(local.catalog, localMutationVersion);
        return;
      }
      if (snapshot.catalog.revision > 0) {
        applyBridgeSnapshot(snapshot);
      }
    })
    .catch(() => {
      // The browser-local catalog remains usable while the Bridge is offline.
    });
  return startupSyncPromise;
}

export function subscribeImageTypePresetCatalog(
  listener: (catalog: ImageTypePresetCatalog) => void,
) {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

export function loadImageTypePresetCatalog(): ImageTypePresetCatalog {
  cachedCatalog ??= readLocalImageTypePresetCatalog()?.catalog ?? defaultImageTypePresetCatalog();
  return cachedCatalog;
}

export function loadImageTypePresets(): ImageTypePreset[] {
  return loadImageTypePresetCatalog().presets;
}

export function saveImageTypePresetCatalog(catalog: ImageTypePresetCatalog): boolean {
  const normalized = parseImageTypePresetCatalogDocument({
    version: STORAGE_VERSION,
    categories: catalog.categories,
    presets: catalog.presets,
  });
  if (!normalized) return false;
  cachedCatalog = normalized;
  localMutationVersion += 1;
  const localSaved = writeLocalImageTypePresetCatalog(
    normalized,
    activeBridgeSnapshot?.catalog.revision ??
      readLocalImageTypePresetCatalog()?.bridgeRevision ??
      0,
  );
  emitCatalog(normalized);
  void queueImageTypePresetCatalogSync(normalized, localMutationVersion);
  return localSaved || activeBridgeSnapshot?.writable === true;
}

export function saveImageTypePresets(presets: ImageTypePreset[]): boolean {
  const current = loadImageTypePresetCatalog();
  const referencedCategories = presets.map((preset) => preset.category);
  const categories = sanitizeCategories([...current.categories, ...referencedCategories]);
  return saveImageTypePresetCatalog({ categories, presets });
}

export function restoreBuiltInImageTypePresets(presets: ImageTypePreset[]): ImageTypePreset[] {
  const custom = presets.filter((preset) => !preset.builtIn);
  const customNames = new Set(custom.map((preset) => preset.name));
  return [
    ...defaultImageTypePresets().filter((preset) => !customNames.has(preset.name)),
    ...custom,
  ];
}

export function restoreBuiltInImageTypePresetCatalog(
  catalog: ImageTypePresetCatalog,
): ImageTypePresetCatalog {
  const presets = restoreBuiltInImageTypePresets(catalog.presets);
  return {
    categories: sanitizeCategories([
      ...IMAGE_TYPE_CATEGORIES,
      ...catalog.categories,
      ...presets.map((preset) => preset.category),
    ]),
    presets,
  };
}

export function addImageTypeCategory(
  catalog: ImageTypePresetCatalog,
  rawCategory: string,
): ImageTypePresetCatalog | null {
  const category = sanitizeCategory(rawCategory);
  if (
    !category ||
    catalog.categories.includes(category) ||
    catalog.categories.length >= MAX_CATEGORY_COUNT
  ) {
    return null;
  }
  return { ...catalog, categories: [...catalog.categories, category] };
}

export function renameImageTypeCategory(
  catalog: ImageTypePresetCatalog,
  currentCategory: string,
  rawNextCategory: string,
): ImageTypePresetCatalog | null {
  const nextCategory = sanitizeCategory(rawNextCategory);
  if (
    !nextCategory ||
    !catalog.categories.includes(currentCategory) ||
    (nextCategory !== currentCategory && catalog.categories.includes(nextCategory))
  ) {
    return null;
  }
  if (nextCategory === currentCategory) return catalog;
  return {
    categories: catalog.categories.map((category) =>
      category === currentCategory ? nextCategory : category,
    ),
    presets: catalog.presets.map((preset) =>
      preset.category === currentCategory ? { ...preset, category: nextCategory } : preset,
    ),
  };
}

export function deleteImageTypeCategory(
  catalog: ImageTypePresetCatalog,
  categoryToDelete: string,
): ImageTypePresetCatalog | null {
  if (catalog.categories.length <= 1 || !catalog.categories.includes(categoryToDelete)) return null;
  const categories = catalog.categories.filter((category) => category !== categoryToDelete);
  const fallbackCategory = categories[0];
  if (!fallbackCategory) return null;
  return {
    categories,
    presets: catalog.presets.map((preset) =>
      preset.category === categoryToDelete ? { ...preset, category: fallbackCategory } : preset,
    ),
  };
}

export function imageTypeCategoryColumns(categories: string[]): string[][] {
  const builtInColumns = IMAGE_TYPE_CATEGORY_COLUMNS.map((column) => new Set<string>(column));
  const columns: string[][] = [[], []];
  for (const category of categories) {
    const builtInColumnIndex = builtInColumns.findIndex((column) => column.has(category));
    const targetIndex =
      builtInColumnIndex >= 0
        ? builtInColumnIndex
        : (columns[0]?.length ?? 0) <= (columns[1]?.length ?? 0)
          ? 0
          : 1;
    columns[targetIndex]?.push(category);
  }
  return columns;
}

export function createImageTypePresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom:${crypto.randomUUID()}`;
  }
  return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
