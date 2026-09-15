import type { ProviderModelKind } from './providerRegistry';

export type ModelFavorite = {
  providerId: string;
  model: string;
};

export type ModelFavorites = Partial<Record<ProviderModelKind, ModelFavorite>>;

const STORAGE_KEY = 'qiansi-canvas-model-favorites-v1';

function validFavorite(value: unknown): ModelFavorite | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const providerId = typeof candidate.providerId === 'string' ? candidate.providerId.trim() : '';
  const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
  return providerId && model ? { providerId, model } : undefined;
}

export function parseModelFavorites(value: unknown): ModelFavorites {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const favorites: ModelFavorites = {};
  for (const kind of ['chat', 'image', 'video', 'audio'] as const) {
    const favorite = validFavorite(source[kind]);
    if (favorite) favorites[kind] = favorite;
  }
  return favorites;
}

function loadModelFavorites(): ModelFavorites {
  if (typeof window === 'undefined') return {};
  try {
    return parseModelFavorites(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export function readModelFavorite(kind: ProviderModelKind): ModelFavorite | undefined {
  return loadModelFavorites()[kind];
}

export function matchModelFavorite<T extends ModelFavorite>(
  models: T[],
  favorite?: ModelFavorite,
): T | undefined {
  if (!favorite) return undefined;
  return models.find(
    (item) => item.providerId === favorite.providerId && item.model === favorite.model,
  );
}

export function writeModelFavorite(kind: ProviderModelKind, favorite?: ModelFavorite) {
  if (typeof window === 'undefined') return;
  const favorites = loadModelFavorites();
  if (favorite) favorites[kind] = favorite;
  else delete favorites[kind];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // A blocked or full localStorage must not prevent model selection.
  }
}
