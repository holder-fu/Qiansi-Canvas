import type { AvailableProviderModel } from '../lib/providerRegistry';
import { matchModelFavorite } from '../lib/modelFavorites';

type ModelSelectionSource = { providerId?: unknown; model?: unknown } | undefined;

export type ComposerModelSelection = {
  providerId?: string;
  model?: string;
  selected?: AvailableProviderModel;
  automaticSelection?: AvailableProviderModel;
  unavailable: boolean;
};

/** Visual input is selectable only when the exact model explicitly advertises image input. */
export function modelSupportsComposerInput(
  model: Pick<AvailableProviderModel, 'inputModalities'>,
  requiresImageInput: boolean,
): boolean {
  return !requiresImageInput || model.inputModalities?.includes('image') === true;
}

/** A composer may submit only through a currently verified, compatible model. */
export function hasReadyComposerModel(
  models: AvailableProviderModel[],
  selection: ModelSelectionSource,
  requiresImageInput: boolean,
): boolean {
  const pair = selectionPair(selection);
  if (!pair?.providerId || !pair.model) return false;
  return models.some(
    (candidate) =>
      candidate.providerId === pair.providerId &&
      candidate.model === pair.model &&
      modelSupportsComposerInput(candidate, requiresImageInput),
  );
}

function selectionPair(source: ModelSelectionSource) {
  const providerId =
    typeof source?.providerId === 'string' && source.providerId.trim()
      ? source.providerId.trim()
      : undefined;
  const model =
    typeof source?.model === 'string' && source.model.trim() ? source.model.trim() : undefined;
  return providerId || model ? { providerId, model } : undefined;
}

/**
 * Pick a model automatically only when there is no saved choice and either the
 * node type has exactly one compatible model or one provider exposes a single
 * explicit recommended model (for example Codex automatic routing).
 *
 * An unavailable or partial saved choice is deliberately left alone: silently
 * switching providers can change cost and output behaviour.
 */
export function resolveComposerModelSelection(
  models: AvailableProviderModel[],
  composerParams: ModelSelectionSource,
  nodeData: ModelSelectionSource,
  favoriteSelection?: ModelSelectionSource,
): ComposerModelSelection {
  // Treat each source as a pair. Per-field fallback could combine the provider
  // from one source with the model from another and create a selection that was
  // never made by the user.
  const current = selectionPair(composerParams) ?? selectionPair(nodeData);
  if (current) {
    if (current.providerId && !current.model) {
      const providerDefaults = models.filter(
        (item) => item.providerId === current.providerId && item.recommended,
      );
      if (providerDefaults.length === 1) {
        const automaticSelection = providerDefaults[0];
        return {
          providerId: automaticSelection?.providerId,
          model: automaticSelection?.model,
          selected: automaticSelection,
          automaticSelection,
          unavailable: false,
        };
      }
    }
    const selected =
      current.providerId && current.model
        ? models.find(
            (item) => item.providerId === current.providerId && item.model === current.model,
          )
        : undefined;
    return {
      ...current,
      selected,
      automaticSelection: undefined,
      unavailable: !selected,
    };
  }

  const favorite = selectionPair(favoriteSelection);
  const preferred =
    favorite?.providerId && favorite.model
      ? matchModelFavorite(models, {
          providerId: favorite.providerId,
          model: favorite.model,
        })
      : undefined;
  if (preferred) {
    return {
      providerId: preferred.providerId,
      model: preferred.model,
      selected: preferred,
      automaticSelection: preferred,
      unavailable: false,
    };
  }

  const providerIds = new Set(models.map((item) => item.providerId));
  const recommended = models.filter((item) => item.recommended);
  const automaticSelection =
    models.length === 1
      ? models[0]
      : providerIds.size === 1 && recommended.length === 1
        ? recommended[0]
        : undefined;
  return {
    providerId: automaticSelection?.providerId,
    model: automaticSelection?.model,
    selected: automaticSelection,
    automaticSelection,
    unavailable: false,
  };
}

/** Keep the node-level provider/model pair authoritative over legacy composerParams. */
export function mergePersistedModelSelection(
  params: Record<string, unknown>,
  nodeData: { providerId?: unknown; model?: unknown } | undefined,
): Record<string, unknown> {
  const nodeSelection = selectionPair(nodeData);
  if (!nodeSelection?.providerId || !nodeSelection.model) return { ...params };
  return {
    ...params,
    providerId: nodeSelection.providerId,
    model: nodeSelection.model,
  };
}
