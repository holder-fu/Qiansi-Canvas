import { create } from 'zustand';
import {
  availableProviderModels,
  CLI_RUNTIME_VERIFICATION_TTL_MS,
  connectedProviderModels,
  isCliProtocol,
  isProviderConnectionVerified,
  isProviderConnectionUsable,
  loadProviderConnections,
  PROVIDER_CONNECTIONS_CHANGED_EVENT,
  PROVIDER_STORAGE_KEY,
  refreshLocalCliConnections,
  saveProviderConnections,
  type AvailableProviderModel,
  type ProviderConnection,
  type ProviderInputModality,
  type ProviderModelKind,
  type ProviderProtocol,
  type ProviderVideoOperation,
} from './providerRegistry';

export const MODEL_CATALOG_STORAGE_KEY = 'kitty-canvas-model-catalog-v1';
export const MODEL_CATALOG_ENDPOINT = '/model-catalog';
const MODEL_CATALOG_VERSION = 1 as const;
const MODEL_CATALOG_REFRESH_MS = 60_000;
const MODEL_CATALOG_PERSIST_DEBOUNCE_MS = 200;
const MODEL_KINDS: ProviderModelKind[] = ['chat', 'image', 'video', 'audio', '3d'];

export type ModelCatalogModel = {
  id: string;
  displayName: string;
  recommended: boolean;
  inputModalities?: ProviderInputModality[];
  videoReferenceInput?: boolean;
  videoModes?: AvailableProviderModel['videoModes'];
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  maxOutputCount?: AvailableProviderModel['maxOutputCount'];
  videoOperations?: ProviderVideoOperation[];
};

export type ModelCatalogProvider = {
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  state: 'ready' | 'stale';
  discoveredAt: number;
  models: Record<ProviderModelKind, ModelCatalogModel[]>;
};

export type ModelCatalogDocument = {
  version: typeof MODEL_CATALOG_VERSION;
  updatedAt: number;
  providers: ModelCatalogProvider[];
};

export type CachedProviderModel = AvailableProviderModel & {
  protocol: ProviderProtocol;
  catalogState: ModelCatalogProvider['state'];
  discoveredAt: number;
};

type ModelsByKind<T> = Record<ProviderModelKind, T[]>;
type ModelCatalogPhase = 'idle' | 'refreshing' | 'ready' | 'stale';

type ModelCatalogState = {
  connections: ProviderConnection[];
  connectedModels: ModelsByKind<AvailableProviderModel>;
  readyModels: ModelsByKind<AvailableProviderModel>;
  cachedModels: ModelsByKind<CachedProviderModel>;
  catalog: ModelCatalogDocument;
  phase: ModelCatalogPhase;
  lastRefreshAt?: number;
};

function emptyModelsByKind<T>(): ModelsByKind<T> {
  return { chat: [], image: [], video: [], audio: [], '3d': [] };
}

function emptyCatalog(): ModelCatalogDocument {
  return { version: MODEL_CATALOG_VERSION, updatedAt: 0, providers: [] };
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? [...value.normalize('NFKC')]
        .filter((character) => {
          const code = character.codePointAt(0) ?? 0;
          return (
            code >= 32 &&
            code !== 127 &&
            !(code >= 0x200b && code <= 0x200f) &&
            !(code >= 0x202a && code <= 0x202e) &&
            !(code >= 0x2066 && code <= 0x2069)
          );
        })
        .join('')
        .trim()
        .slice(0, maxLength)
    : '';
}

function safeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeCatalogUpdatedAt(value: unknown): number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Date.now() + 5 * 60_000
    ? value
    : 0;
}

function parseCatalogModels(value: unknown): ModelCatalogModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const models: ModelCatalogModel[] = [];
  for (const raw of value.slice(0, 512)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = safeText(item.id, 240);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const inputModalities = Array.isArray(item.inputModalities)
      ? Array.from(
          new Set(
            item.inputModalities.filter(
              (modality): modality is ProviderInputModality =>
                modality === 'text' || modality === 'image',
            ),
          ),
        )
      : [];
    const videoModes = Array.isArray(item.videoModes)
      ? item.videoModes.filter(
          (mode): mode is NonNullable<ModelCatalogModel['videoModes']>[number] =>
            mode === '文生视频' ||
            mode === '全能参考' ||
            mode === '图生视频' ||
            mode === '首尾帧' ||
            mode === '图片参考' ||
            mode === '视频换人物',
        )
      : [];
    const videoOperations = Array.isArray(item.videoOperations)
      ? item.videoOperations.filter(
          (operation): operation is ProviderVideoOperation =>
            operation === 'remake' ||
            operation === 'enhance' ||
            operation === 'extend' ||
            operation === 'remove-subtitles' ||
            operation === 'visual-edit' ||
            operation === 'masked-repair' ||
            operation === 'character-replace',
        )
      : [];
    const boundedInteger = (candidate: unknown, maximum: number) =>
      typeof candidate === 'number' &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0 &&
      candidate <= maximum
        ? candidate
        : undefined;
    const maxOutputCount =
      item.maxOutputCount === 1 || item.maxOutputCount === 2 || item.maxOutputCount === 4
        ? item.maxOutputCount
        : undefined;
    models.push({
      id,
      displayName: safeText(item.displayName, 160) || id,
      recommended: item.recommended === true,
      ...(inputModalities.length ? { inputModalities } : {}),
      ...(typeof item.videoReferenceInput === 'boolean'
        ? { videoReferenceInput: item.videoReferenceInput }
        : {}),
      ...(videoModes.length ? { videoModes: Array.from(new Set(videoModes)) } : {}),
      ...(boundedInteger(item.maxReferenceImages, 50) !== undefined
        ? { maxReferenceImages: boundedInteger(item.maxReferenceImages, 50) }
        : {}),
      ...(boundedInteger(item.maxReferenceVideos, 10) !== undefined
        ? { maxReferenceVideos: boundedInteger(item.maxReferenceVideos, 10) }
        : {}),
      ...(boundedInteger(item.maxReferenceAudios, 20) !== undefined
        ? { maxReferenceAudios: boundedInteger(item.maxReferenceAudios, 20) }
        : {}),
      ...(maxOutputCount ? { maxOutputCount } : {}),
      ...(Array.isArray(item.videoOperations)
        ? { videoOperations: Array.from(new Set(videoOperations)) }
        : {}),
    });
  }
  return models;
}

/** Strictly validates the non-secret catalog received from disk or another tab. */
export function parseModelCatalogDocument(value: unknown): ModelCatalogDocument {
  if (!value || typeof value !== 'object') return emptyCatalog();
  const item = value as Record<string, unknown>;
  if (item.version !== MODEL_CATALOG_VERSION || !Array.isArray(item.providers)) {
    return emptyCatalog();
  }
  const seen = new Set<string>();
  const providers: ModelCatalogProvider[] = [];
  for (const raw of item.providers.slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const provider = raw as Record<string, unknown>;
    const providerId = safeText(provider.providerId, 80);
    const providerName = safeText(provider.providerName, 120);
    const protocol = safeText(provider.protocol, 40) as ProviderProtocol;
    const rawModels =
      provider.models && typeof provider.models === 'object'
        ? (provider.models as Record<string, unknown>)
        : {};
    const models = {
      chat: parseCatalogModels(rawModels.chat),
      image: parseCatalogModels(rawModels.image),
      video: parseCatalogModels(rawModels.video),
      audio: parseCatalogModels(rawModels.audio),
      '3d': parseCatalogModels(rawModels['3d']),
    };
    if (
      !providerId ||
      !providerName ||
      !protocol ||
      seen.has(providerId) ||
      MODEL_KINDS.every((kind) => models[kind].length === 0)
    ) {
      continue;
    }
    seen.add(providerId);
    providers.push({
      providerId,
      providerName,
      protocol,
      // A disk snapshot is never execution authorization. `ready` only records
      // how it was written; runtime selectors still require a fresh probe.
      state: provider.state === 'ready' ? 'ready' : 'stale',
      discoveredAt: safeTimestamp(provider.discoveredAt),
      models,
    });
  }
  return {
    version: MODEL_CATALOG_VERSION,
    updatedAt: safeCatalogUpdatedAt(item.updatedAt),
    providers,
  };
}

function providerModelsEqual(
  left: Record<ProviderModelKind, ModelCatalogModel[]>,
  right: Record<ProviderModelKind, ModelCatalogModel[]>,
) {
  return MODEL_KINDS.every((kind) => JSON.stringify(left[kind]) === JSON.stringify(right[kind]));
}

/**
 * Builds the persisted catalog from usable choices. Remote APIs remain ready
 * after reload while their verified configuration is unchanged; transient CLI
 * failures retain the last successful model list as `stale`.
 */
export function createModelCatalogDocument(
  connections: ProviderConnection[],
  previous: ModelCatalogDocument = emptyCatalog(),
  now = Date.now(),
): ModelCatalogDocument {
  const previousById = new Map(
    previous.providers.map((provider) => [provider.providerId, provider]),
  );
  const liveByProvider = new Map<
    string,
    { providerName: string; models: Record<ProviderModelKind, ModelCatalogModel[]> }
  >();

  for (const kind of MODEL_KINDS) {
    for (const option of availableProviderModels(connections, kind)) {
      const current = liveByProvider.get(option.providerId) ?? {
        providerName: option.providerName,
        models: emptyModelsByKind<ModelCatalogModel>(),
      };
      current.models[kind].push({
        id: option.model,
        displayName: option.displayName,
        recommended: option.recommended,
        ...(option.inputModalities?.length ? { inputModalities: [...option.inputModalities] } : {}),
        ...(typeof option.videoReferenceInput === 'boolean'
          ? { videoReferenceInput: option.videoReferenceInput }
          : {}),
        ...(option.videoModes?.length ? { videoModes: [...option.videoModes] } : {}),
        ...(typeof option.maxReferenceImages === 'number'
          ? { maxReferenceImages: option.maxReferenceImages }
          : {}),
        ...(typeof option.maxReferenceVideos === 'number'
          ? { maxReferenceVideos: option.maxReferenceVideos }
          : {}),
        ...(typeof option.maxReferenceAudios === 'number'
          ? { maxReferenceAudios: option.maxReferenceAudios }
          : {}),
        ...(option.maxOutputCount ? { maxOutputCount: option.maxOutputCount } : {}),
        ...(option.videoOperations ? { videoOperations: [...option.videoOperations] } : {}),
      });
      liveByProvider.set(option.providerId, current);
    }
  }

  const providers: ModelCatalogProvider[] = [];
  for (const connection of connections) {
    const live = liveByProvider.get(connection.id);
    const previousProvider = previousById.get(connection.id);
    if (live && isProviderConnectionUsable(connection)) {
      const sameCatalog =
        previousProvider &&
        previousProvider.providerName === connection.name &&
        previousProvider.protocol === connection.protocol &&
        providerModelsEqual(previousProvider.models, live.models);
      providers.push({
        providerId: connection.id,
        providerName: connection.name,
        protocol: connection.protocol,
        state: 'ready',
        discoveredAt: sameCatalog ? previousProvider.discoveredAt : now,
        models: live.models,
      });
      continue;
    }
    // WorkBuddy and Antigravity require a current local probe. Do not retain
    // their stale model catalogs after the runtime is no longer verified.
    if (
      (connection.protocol === 'codebuddy' || connection.protocol === 'gemini-cli') &&
      !isProviderConnectionVerified(connection)
    ) {
      continue;
    }
    if (connection.lastVerifiedAt && previousProvider) {
      providers.push({ ...previousProvider, state: 'stale' });
    }
  }

  const stableProviders = JSON.stringify(previous.providers) === JSON.stringify(providers);
  if (stableProviders) return previous;
  return {
    version: MODEL_CATALOG_VERSION,
    updatedAt: Math.max(now, previous.updatedAt + 1),
    providers,
  };
}

function readyModels(connections: ProviderConnection[]): ModelsByKind<AvailableProviderModel> {
  return {
    chat: availableProviderModels(connections, 'chat'),
    image: availableProviderModels(connections, 'image'),
    video: availableProviderModels(connections, 'video'),
    audio: availableProviderModels(connections, 'audio'),
    '3d': availableProviderModels(connections, '3d'),
  };
}

function connectedModels(connections: ProviderConnection[]): ModelsByKind<AvailableProviderModel> {
  return {
    chat: connectedProviderModels(connections, 'chat'),
    image: connectedProviderModels(connections, 'image'),
    video: connectedProviderModels(connections, 'video'),
    audio: connectedProviderModels(connections, 'audio'),
    '3d': connectedProviderModels(connections, '3d'),
  };
}

function cachedModels(catalog: ModelCatalogDocument): ModelsByKind<CachedProviderModel> {
  const result = emptyModelsByKind<CachedProviderModel>();
  for (const provider of catalog.providers) {
    for (const kind of MODEL_KINDS) {
      for (const model of provider.models[kind]) {
        result[kind].push({
          key: `${provider.providerId}\u0000${model.id}`,
          providerId: provider.providerId,
          providerName: provider.providerName,
          model: model.id,
          displayName: model.displayName,
          label: `${provider.providerName} · ${model.displayName}`,
          recommended: model.recommended,
          ...(model.inputModalities?.length ? { inputModalities: [...model.inputModalities] } : {}),
          ...(typeof model.videoReferenceInput === 'boolean'
            ? { videoReferenceInput: model.videoReferenceInput }
            : {}),
          ...(model.videoModes?.length ? { videoModes: [...model.videoModes] } : {}),
          ...(typeof model.maxReferenceImages === 'number'
            ? { maxReferenceImages: model.maxReferenceImages }
            : {}),
          ...(typeof model.maxReferenceVideos === 'number'
            ? { maxReferenceVideos: model.maxReferenceVideos }
            : {}),
          ...(typeof model.maxReferenceAudios === 'number'
            ? { maxReferenceAudios: model.maxReferenceAudios }
            : {}),
          ...(model.maxOutputCount ? { maxOutputCount: model.maxOutputCount } : {}),
          ...(model.videoOperations ? { videoOperations: [...model.videoOperations] } : {}),
          protocol: provider.protocol,
          catalogState: provider.state,
          discoveredAt: provider.discoveredAt,
        });
      }
    }
  }
  return result;
}

function stableModelsByKind<T>(current: ModelsByKind<T>, next: ModelsByKind<T>): ModelsByKind<T> {
  return {
    chat: JSON.stringify(current.chat) === JSON.stringify(next.chat) ? current.chat : next.chat,
    image:
      JSON.stringify(current.image) === JSON.stringify(next.image) ? current.image : next.image,
    video:
      JSON.stringify(current.video) === JSON.stringify(next.video) ? current.video : next.video,
    audio:
      JSON.stringify(current.audio) === JSON.stringify(next.audio) ? current.audio : next.audio,
    '3d': JSON.stringify(current['3d']) === JSON.stringify(next['3d']) ? current['3d'] : next['3d'],
  };
}

function readLocalCatalog(): ModelCatalogDocument {
  try {
    const raw = localStorage.getItem(MODEL_CATALOG_STORAGE_KEY);
    return raw ? parseModelCatalogDocument(JSON.parse(raw)) : emptyCatalog();
  } catch {
    return emptyCatalog();
  }
}

const initialConnections = loadProviderConnections();
const initialCatalog = createModelCatalogDocument(initialConnections, readLocalCatalog());

export const useModelCatalogStore = create<ModelCatalogState>(() => ({
  connections: initialConnections,
  connectedModels: connectedModels(initialConnections),
  readyModels: readyModels(initialConnections),
  cachedModels: cachedModels(initialCatalog),
  catalog: initialCatalog,
  phase: 'idle',
}));

let refreshPromise: Promise<void> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let startCount = 0;
let lastLocalPersistedUpdatedAt = initialCatalog.updatedAt;
let lastBridgePersistedUpdatedAt = 0;
let activeSyncCleanup: (() => void) | undefined;

function scheduleRuntimeExpiry(connections: ProviderConnection[]) {
  if (expiryTimer) clearTimeout(expiryTimer);
  const now = Date.now();
  const expiries = connections
    .filter(
      (provider) =>
        isCliProtocol(provider.protocol) &&
        provider.verifiedAt &&
        isProviderConnectionVerified(provider),
    )
    .map((provider) => (provider.verifiedAt as number) + CLI_RUNTIME_VERIFICATION_TTL_MS + 20)
    .filter((expiresAt) => expiresAt > now);
  if (!expiries.length || startCount === 0) return;
  expiryTimer = setTimeout(
    () => {
      applyConnections(loadProviderConnections());
    },
    Math.max(0, Math.min(...expiries) - now),
  );
}

function scheduleCatalogPersistence(catalog: ModelCatalogDocument) {
  if (
    catalog.updatedAt === lastLocalPersistedUpdatedAt &&
    catalog.updatedAt === lastBridgePersistedUpdatedAt
  ) {
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    if (catalog.updatedAt !== lastLocalPersistedUpdatedAt) {
      try {
        localStorage.setItem(MODEL_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
        lastLocalPersistedUpdatedAt = catalog.updatedAt;
      } catch {
        /* The bridge file remains the durable fallback when browser storage is unavailable. */
      }
    }
    if (catalog.updatedAt !== lastBridgePersistedUpdatedAt) {
      void fetch(MODEL_CATALOG_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catalog),
      })
        .then(async (response) => {
          if (!response.ok) return;
          const persisted = parseModelCatalogDocument(await response.json());
          if (JSON.stringify(persisted.providers) !== JSON.stringify(catalog.providers)) return;
          lastBridgePersistedUpdatedAt = persisted.updatedAt;
          const current = useModelCatalogStore.getState();
          if (JSON.stringify(current.catalog.providers) === JSON.stringify(persisted.providers)) {
            const synchronized =
              current.catalog.updatedAt === persisted.updatedAt
                ? current.catalog
                : { ...current.catalog, updatedAt: persisted.updatedAt };
            if (synchronized !== current.catalog) {
              useModelCatalogStore.setState({ catalog: synchronized });
            }
            try {
              localStorage.setItem(MODEL_CATALOG_STORAGE_KEY, JSON.stringify(synchronized));
              lastLocalPersistedUpdatedAt = synchronized.updatedAt;
            } catch {
              /* The bridge file is already durable. */
            }
            return;
          }
          // The local catalog changed while this request was in flight. The
          // response only acknowledges the older snapshot, so persist the
          // latest one in a new atomic write.
          scheduleCatalogPersistence(current.catalog);
        })
        .catch(() => {});
    }
  }, MODEL_CATALOG_PERSIST_DEBOUNCE_MS);
}

function applyConnections(
  connections: ProviderConnection[],
  patch: Partial<Pick<ModelCatalogState, 'phase' | 'lastRefreshAt'>> = {},
) {
  const current = useModelCatalogStore.getState();
  const catalog = createModelCatalogDocument(connections, current.catalog);
  const connected = stableModelsByKind(current.connectedModels, connectedModels(connections));
  const ready = stableModelsByKind(current.readyModels, readyModels(connections));
  const cached = stableModelsByKind(current.cachedModels, cachedModels(catalog));
  const hasReady = MODEL_KINDS.some((kind) => ready[kind].length > 0);
  const hasCached = catalog.providers.length > 0;
  useModelCatalogStore.setState({
    connections,
    connectedModels: connected,
    readyModels: ready,
    cachedModels: cached,
    catalog,
    phase: patch.phase ?? (hasReady ? 'ready' : hasCached ? 'stale' : 'idle'),
    ...(patch.lastRefreshAt !== undefined ? { lastRefreshAt: patch.lastRefreshAt } : {}),
  });
  scheduleRuntimeExpiry(connections);
  scheduleCatalogPersistence(catalog);
}

async function loadCatalogFile() {
  try {
    const response = await fetch(MODEL_CATALOG_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return;
    const disk = parseModelCatalogDocument(await response.json());
    lastBridgePersistedUpdatedAt = disk.updatedAt;
    const current = useModelCatalogStore.getState();
    if (disk.updatedAt <= current.catalog.updatedAt) return;
    const catalog = createModelCatalogDocument(current.connections, disk);
    const cached = stableModelsByKind(current.cachedModels, cachedModels(catalog));
    useModelCatalogStore.setState({
      catalog,
      cachedModels: cached,
      phase:
        current.readyModels.chat.length ||
        current.readyModels.image.length ||
        current.readyModels.video.length ||
        current.readyModels.audio.length ||
        current.readyModels['3d'].length
          ? 'ready'
          : catalog.providers.length
            ? 'stale'
            : current.phase,
    });
    try {
      localStorage.setItem(MODEL_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    } catch {
      /* ignore */
    }
  } catch {
    /* Vite-only development mode has no local bridge file endpoint. */
  }
}

/** One shared CLI refresh for the whole app. Concurrent callers reuse it. */
export function refreshModelCatalog(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  const current = useModelCatalogStore.getState();
  useModelCatalogStore.setState({ phase: 'refreshing' });
  refreshPromise = refreshLocalCliConnections(loadProviderConnections())
    .then(() => {
      const refreshedAt = Date.now();
      // The probe may finish after the user changed provider settings. Runtime
      // observations are already remembered by providerRegistry; re-load the
      // latest configuration instead of writing the request's old snapshot.
      // Persist that latest runtime view as well. Without this write the
      // successful background probe only lived in memory, so a page reload
      // discarded the green CLI state and newly discovered image models.
      // Loading after rememberRuntimeProviders() also preserves any editable
      // setting changed while the probe was in flight.
      saveProviderConnections(loadProviderConnections());
      applyConnections(loadProviderConnections(), { lastRefreshAt: refreshedAt });
    })
    .catch(() => {
      applyConnections(loadProviderConnections(), {
        phase: current.catalog.providers.length ? 'stale' : 'idle',
        lastRefreshAt: Date.now(),
      });
    })
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}

function reloadFromRegistry() {
  applyConnections(loadProviderConnections());
}

/**
 * Starts one app-level synchronizer. Components only subscribe to the Zustand
 * snapshot and never read the file or probe providers themselves.
 */
export function startModelCatalogSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  startCount += 1;
  if (startCount === 1) {
    const onProviderChange = () => reloadFromRegistry();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PROVIDER_STORAGE_KEY) reloadFromRegistry();
      if (event.key === MODEL_CATALOG_STORAGE_KEY && event.newValue) {
        try {
          const incoming = parseModelCatalogDocument(JSON.parse(event.newValue));
          const current = useModelCatalogStore.getState();
          if (incoming.updatedAt <= current.catalog.updatedAt) return;
          const catalog = createModelCatalogDocument(current.connections, incoming);
          const cached = stableModelsByKind(current.cachedModels, cachedModels(catalog));
          useModelCatalogStore.setState({ catalog, cachedModels: cached });
        } catch {
          /* ignore malformed cross-tab data */
        }
      }
    };
    const onFocus = () => {
      const lastRefreshAt = useModelCatalogStore.getState().lastRefreshAt ?? 0;
      if (Date.now() - lastRefreshAt >= MODEL_CATALOG_REFRESH_MS) void refreshModelCatalog();
    };

    window.addEventListener(PROVIDER_CONNECTIONS_CHANGED_EVENT, onProviderChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    void loadCatalogFile();
    void refreshModelCatalog();
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshModelCatalog();
    }, MODEL_CATALOG_REFRESH_MS);
    scheduleRuntimeExpiry(useModelCatalogStore.getState().connections);

    activeSyncCleanup = () => {
      window.removeEventListener(PROVIDER_CONNECTIONS_CHANGED_EVENT, onProviderChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      if (refreshTimer) clearInterval(refreshTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      refreshTimer = undefined;
      expiryTimer = undefined;
    };
  }

  return () => {
    startCount = Math.max(0, startCount - 1);
    if (startCount > 0) return;
    activeSyncCleanup?.();
    activeSyncCleanup = undefined;
  };
}
