import { join } from 'node:path';
import { atomicWriteJson, readJsonIfExists } from './bridge-project-storage.mjs';

export const BRIDGE_PROMPT_LIBRARY_VERSION = 1;
export const MAX_PROMPT_LIBRARY_BYTES = 8 * 1024 * 1024;
export const BRIDGE_IMAGE_TYPE_PRESET_CATALOG_VERSION = 1;
export const MAX_IMAGE_TYPE_PRESET_CATALOG_BYTES = 2 * 1024 * 1024;

const MAX_IMAGE_TYPE_CATEGORY_COUNT = 40;
const MAX_IMAGE_TYPE_PRESET_COUNT = 100;

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeBridgeImageTypePresetCatalog(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  const categories = [];
  const categoryNames = new Set();
  for (const valueCategory of Array.isArray(value?.categories)
    ? value.categories.slice(0, MAX_IMAGE_TYPE_CATEGORY_COUNT)
    : []) {
    const category = boundedString(valueCategory, 40);
    if (!category || categoryNames.has(category)) continue;
    categoryNames.add(category);
    categories.push(category);
  }
  const presets = [];
  const presetIds = new Set();
  const presetNames = new Set();
  for (const rawPreset of Array.isArray(value?.presets)
    ? value.presets.slice(0, MAX_IMAGE_TYPE_PRESET_COUNT)
    : []) {
    if (!rawPreset || typeof rawPreset !== 'object' || Array.isArray(rawPreset)) continue;
    const id = boundedString(rawPreset.id, 160);
    const name = boundedString(rawPreset.name, 80);
    const category = boundedString(rawPreset.category, 40);
    const description = boundedString(rawPreset.description, 240);
    const prompt = boundedString(rawPreset.prompt, 10_000);
    if (
      !id ||
      !name ||
      !categoryNames.has(category) ||
      !description ||
      !prompt ||
      presetIds.has(id) ||
      presetNames.has(name)
    ) {
      continue;
    }
    presetIds.add(id);
    presetNames.add(name);
    presets.push({
      id,
      name,
      category,
      description,
      prompt,
      builtIn: rawPreset.builtIn === true,
    });
  }
  return {
    version: BRIDGE_IMAGE_TYPE_PRESET_CATALOG_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    categories,
    presets,
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export function normalizeBridgePromptLibrary(value) {
  const revision = Number(value?.revision);
  const updatedAt = Number(value?.updatedAt);
  return {
    version: BRIDGE_PROMPT_LIBRARY_VERSION,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    items: Array.isArray(value?.items) ? value.items.slice(0, 500) : [],
    categories: Array.isArray(value?.categories) ? value.categories.slice(0, 100) : [],
    renames: Array.isArray(value?.renames) ? value.renames.slice(0, 100) : [],
    deleted: Array.isArray(value?.deleted) ? value.deleted.slice(0, 100) : [],
    updatedAt: Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? updatedAt : 0,
  };
}

export class BridgePromptLibraryConflictError extends Error {
  constructor(current) {
    super('提示词库已在其它窗口更新，请刷新后重试。');
    this.name = 'BridgePromptLibraryConflictError';
    this.current = current;
  }
}

export class BridgePromptLibraryStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('提示词库存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'prompt-library.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    return normalizeBridgePromptLibrary(await readJsonIfExists(this.file, '提示词库设置'));
  }

  update({ items, categories, renames, deleted, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeBridgePromptLibrary(
          await readJsonIfExists(this.file, '提示词库设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('提示词库设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgePromptLibraryConflictError(current);
        }
        const next = {
          version: BRIDGE_PROMPT_LIBRARY_VERSION,
          revision: current.revision + 1,
          items: Array.isArray(items) ? items.slice(0, 500) : [],
          categories: Array.isArray(categories) ? categories.slice(0, 100) : [],
          renames: Array.isArray(renames) ? renames.slice(0, 100) : [],
          deleted: Array.isArray(deleted) ? deleted.slice(0, 100) : [],
          updatedAt: this.now(),
        };
        await atomicWriteJson(this.file, next, { maxBytes: MAX_PROMPT_LIBRARY_BYTES });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}

export class BridgeImageTypePresetCatalogConflictError extends Error {
  constructor(current) {
    super('图片生成类型已在其它窗口更新，请重新打开后重试。');
    this.name = 'BridgeImageTypePresetCatalogConflictError';
    this.current = current;
  }
}

export class BridgeImageTypePresetCatalogStorage {
  constructor({ dataRoot, now = () => Date.now() }) {
    if (!dataRoot) throw new Error('图片生成类型存储缺少数据目录。');
    this.file = join(dataRoot, 'settings', 'image-type-presets.json');
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.writeQueue.catch(() => {});
    return normalizeBridgeImageTypePresetCatalog(
      await readJsonIfExists(this.file, '图片生成类型设置'),
    );
  }

  update({ categories, presets, expectedRevision }) {
    const operation = this.writeQueue
      .catch(() => {})
      .then(async () => {
        const current = normalizeBridgeImageTypePresetCatalog(
          await readJsonIfExists(this.file, '图片生成类型设置'),
        );
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('图片生成类型设置缺少有效的 expectedRevision。');
        }
        if (expectedRevision !== current.revision) {
          throw new BridgeImageTypePresetCatalogConflictError(current);
        }
        const next = normalizeBridgeImageTypePresetCatalog({
          revision: current.revision + 1,
          categories,
          presets,
          updatedAt: this.now(),
        });
        if (
          !Array.isArray(categories) ||
          !Array.isArray(presets) ||
          categories.length === 0 ||
          next.categories.length !== categories.length ||
          next.presets.length !== presets.length
        ) {
          throw new Error('图片生成类型设置包含无效、重复或超出限制的内容。');
        }
        await atomicWriteJson(this.file, next, {
          maxBytes: MAX_IMAGE_TYPE_PRESET_CATALOG_BYTES,
        });
        return next;
      });
    this.writeQueue = operation;
    return operation;
  }
}
