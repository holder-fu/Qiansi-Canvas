import { recoverPersistedAudioSource } from '../lib/mediaPreview';

const STORAGE_ENVELOPE_FORMAT = 'kitty-canvas-storage';
const STORAGE_ENVELOPE_VERSION = 1;
const MEDIA_REFERENCE_KEY = '__kittyCanvasMediaRef';
const EMBEDDED_MEDIA_RE = /^data:(?:image|video|audio)\//i;

type StorageEnvelope = {
  format: typeof STORAGE_ENVELOPE_FORMAT;
  version: typeof STORAGE_ENVELOPE_VERSION;
  payload: unknown;
  embeddedMedia: string[];
};

function collectEmbeddedMedia(value: unknown, indexes: Map<string, number>, media: string[]) {
  if (typeof value === 'string') {
    if (EMBEDDED_MEDIA_RE.test(value) && !indexes.has(value)) {
      indexes.set(value, media.length);
      media.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectEmbeddedMedia(item, indexes, media));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach((item) => collectEmbeddedMedia(item, indexes, media));
}

function restoreEmbeddedMedia(value: unknown, media: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreEmbeddedMedia(item, media));
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const mediaIndex = record[MEDIA_REFERENCE_KEY];
  if (
    keys.length === 1 &&
    Number.isSafeInteger(mediaIndex) &&
    (mediaIndex as number) >= 0 &&
    (mediaIndex as number) < media.length
  ) {
    return media[mediaIndex as number];
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, restoreEmbeddedMedia(item, media)]),
  );
}

function recoverPersistedAudioNodes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(recoverPersistedAudioNodes);
  if (!value || typeof value !== 'object') return value;

  const record = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      recoverPersistedAudioNodes(item),
    ]),
  );
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return record;
  const data = record.data as Record<string, unknown>;
  return data.kind === 'audio' ? { ...record, data: recoverPersistedAudioSource(data) } : record;
}

/**
 * Stores repeated inline media once instead of duplicating the same Data URL
 * across node fields, workspace compatibility fields and project snapshots.
 */
export function stringifyCanvasPersistence(value: unknown): string {
  const embeddedMedia: string[] = [];
  const mediaIndexes = new Map<string, number>();
  collectEmbeddedMedia(value, mediaIndexes, embeddedMedia);

  const envelope: StorageEnvelope = {
    format: STORAGE_ENVELOPE_FORMAT,
    version: STORAGE_ENVELOPE_VERSION,
    payload: value,
    embeddedMedia,
  };

  return JSON.stringify(envelope, function (_key, item: unknown) {
    // The media table owns the only full copy of each Data URL.
    if (this === embeddedMedia) return item;
    if (typeof item === 'string') {
      const index = mediaIndexes.get(item);
      if (index !== undefined) return { [MEDIA_REFERENCE_KEY]: index };
    }
    return item;
  });
}

/** Reads both the compact envelope and every legacy plain-JSON canvas save. */
export function parseCanvasPersistence<T>(raw: string): T {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return parsed as T;
  const envelope = parsed as Partial<StorageEnvelope>;
  if (
    envelope.format !== STORAGE_ENVELOPE_FORMAT ||
    envelope.version !== STORAGE_ENVELOPE_VERSION ||
    !Array.isArray(envelope.embeddedMedia) ||
    !envelope.embeddedMedia.every((item): item is string => typeof item === 'string') ||
    !('payload' in envelope)
  ) {
    return recoverPersistedAudioNodes(parsed) as T;
  }
  return recoverPersistedAudioNodes(
    restoreEmbeddedMedia(envelope.payload, envelope.embeddedMedia),
  ) as T;
}
