import type { PluginAudioGenerationRequest } from './pluginRegistry';

const PLUGIN_AUDIO_HISTORY_STORAGE_KEY = 'qiansi-plugin-audio-history-v1';
const MAX_STORED_HISTORY = 80;
export const MAX_VISIBLE_PLUGIN_AUDIO_HISTORY = 30;
const LEGACY_AUDIO_HISTORY_PLUGIN_IDS: Readonly<Record<string, string>> = Object.freeze({
  'voxcpm2-local': 'voxcpm2-tts',
  'chattts-local': 'chattts-tts',
});

export type PluginAudioHistoryEntry = {
  id: string;
  pluginId: string;
  generatorId: string;
  projectId: string;
  createdAt: number;
  mode: 'design' | 'clone' | 'hifi';
  text: string;
  control: string;
  options: Record<string, unknown>;
  requiresReferenceAudio: boolean;
  assetId: string;
  audioUrl: string;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
};

type CreatePluginAudioHistoryEntry = {
  pluginId: string;
  generatorId: string;
  projectId: string;
  request: PluginAudioGenerationRequest;
  assetId: string;
  audioUrl: string;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  id?: string;
  createdAt?: number;
};

function browserStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function storedOptions(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const options: Record<string, unknown> = {};
  for (const key of [
    'promptText',
    'speakerPreset',
    'engineTask',
    'language',
    'speaker',
    'speechRate',
    'durationSeconds',
    'audioFormat',
    'qwenTemperature',
    'qwenTopP',
    'qwenTopK',
    'qwenRepetitionPenalty',
    'cfgValue',
    'inferenceTimesteps',
    'seed',
    'normalize',
    'denoise',
    'textSeed',
    'temperature',
    'topP',
    'topK',
    'refineText',
    'speed',
    'oral',
    'laugh',
    'breakLevel',
    'splitBatch',
    'homophoneReplacement',
    'xVectorOnly',
  ]) {
    const item = source[key];
    if (typeof item === 'string') options[key] = item.slice(0, 16_000);
    else if (typeof item === 'number' && Number.isFinite(item)) options[key] = item;
    else if (typeof item === 'boolean') options[key] = item;
  }
  return options;
}

function normalizeHistoryEntry(value: unknown): PluginAudioHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const mode = item.mode;
  if (mode !== 'design' && mode !== 'clone' && mode !== 'hifi') return null;
  const id = boundedString(item.id, 128);
  const pluginId = boundedString(item.pluginId, 64);
  const generatorId = boundedString(item.generatorId, 64);
  const projectId = boundedString(item.projectId, 128);
  const text = boundedString(item.text, 16_000);
  const assetId = boundedString(item.assetId, 256);
  const audioUrl = boundedString(item.audioUrl, 2_048);
  const mimeType = boundedString(item.mimeType, 80).toLowerCase();
  const fileName = boundedString(item.fileName, 180);
  const createdAt = Number(item.createdAt);
  if (
    !id ||
    !pluginId ||
    !generatorId ||
    !projectId ||
    !text ||
    !assetId ||
    !audioUrl ||
    !mimeType.startsWith('audio/') ||
    !fileName ||
    !Number.isFinite(createdAt) ||
    createdAt <= 0
  ) {
    return null;
  }
  const durationSeconds = Number(item.durationSeconds);
  return {
    id,
    pluginId,
    generatorId,
    projectId,
    createdAt,
    mode,
    text,
    control: boundedString(item.control, 1_000),
    options: storedOptions(item.options),
    requiresReferenceAudio: item.requiresReferenceAudio === true,
    assetId,
    audioUrl,
    mimeType,
    fileName,
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 86_400
      ? { durationSeconds }
      : {}),
  };
}

function readAll(storage: Storage | null) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(PLUGIN_AUDIO_HISTORY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeHistoryEntry)
      .filter((item): item is PluginAudioHistoryEntry => Boolean(item));
  } catch {
    return [];
  }
}

export function createPluginAudioHistoryEntry(
  input: CreatePluginAudioHistoryEntry,
): PluginAudioHistoryEntry {
  return {
    id: input.id ?? crypto.randomUUID(),
    pluginId: input.pluginId,
    generatorId: input.generatorId,
    projectId: input.projectId,
    createdAt: input.createdAt ?? Date.now(),
    mode: input.request.mode,
    text: input.request.text,
    control: input.request.control ?? '',
    options: storedOptions(input.request.options),
    requiresReferenceAudio: Boolean(
      input.request.referenceAudio || input.request.referenceAudios?.length,
    ),
    assetId: input.assetId,
    audioUrl: input.audioUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
    ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
  };
}

export function appendPluginAudioHistory(
  entry: PluginAudioHistoryEntry,
  storage: Storage | null = browserStorage(),
) {
  const normalized = normalizeHistoryEntry(entry);
  if (!normalized) return null;
  if (!storage) return { entry: normalized, persisted: false } as const;
  const next = [normalized, ...readAll(storage).filter((item) => item.id !== normalized.id)].slice(
    0,
    MAX_STORED_HISTORY,
  );
  try {
    storage.setItem(PLUGIN_AUDIO_HISTORY_STORAGE_KEY, JSON.stringify(next));
    return { entry: normalized, persisted: true } as const;
  } catch {
    // A blocked or full storage must not make a successful audio generation fail.
    return { entry: normalized, persisted: false } as const;
  }
}

export function listPluginAudioHistory(
  pluginId: string,
  generatorId: string,
  projectId: string,
  storage: Storage | null = browserStorage(),
) {
  const legacyPluginId =
    pluginId === 'qiansi-audio' ? LEGACY_AUDIO_HISTORY_PLUGIN_IDS[generatorId] : undefined;
  return readAll(storage)
    .filter(
      (item) =>
        (item.pluginId === pluginId || item.pluginId === legacyPluginId) &&
        item.generatorId === generatorId &&
        item.projectId === projectId,
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_VISIBLE_PLUGIN_AUDIO_HISTORY);
}

export function deletePluginAudioHistory(
  pluginId: string,
  generatorId: string,
  projectId: string,
  historyId: string,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return false;
  const legacyPluginId =
    pluginId === 'qiansi-audio' ? LEGACY_AUDIO_HISTORY_PLUGIN_IDS[generatorId] : undefined;
  const entries = readAll(storage);
  const next = entries.filter(
    (item) =>
      !(
        item.id === historyId &&
        (item.pluginId === pluginId || item.pluginId === legacyPluginId) &&
        item.generatorId === generatorId &&
        item.projectId === projectId
      ),
  );
  if (next.length === entries.length) return false;
  try {
    storage.setItem(PLUGIN_AUDIO_HISTORY_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function findPluginAudioHistory(
  pluginId: string,
  generatorId: string,
  projectId: string,
  historyId: string,
  storage: Storage | null = browserStorage(),
) {
  return listPluginAudioHistory(pluginId, generatorId, projectId, storage).find(
    (item) => item.id === historyId,
  );
}
