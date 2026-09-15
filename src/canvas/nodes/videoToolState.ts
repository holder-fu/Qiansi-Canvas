import type { VideoToolAction } from './VideoNodeActionBar';
import type { AvailableProviderModel, ProviderVideoOperation } from '../../lib/providerRegistry';

/** Unknown model capabilities do not authorize AI video tools. */
export function hasReadyVideoOperation(
  models: readonly Pick<AvailableProviderModel, 'videoOperations'>[],
  operation: ProviderVideoOperation,
): boolean {
  return models.some((model) => model.videoOperations?.includes(operation) === true);
}

export function resolveVideoToolAction(value: unknown): VideoToolAction | null {
  return value === 'edit' ||
    value === 'remake' ||
    value === 'crop' ||
    value === 'enhance' ||
    value === 'extend'
    ? value
    : null;
}

export function shouldShowVideoNodeActionBar(options: {
  selected: boolean;
  isVideoNode: boolean;
  hasVideoSource: boolean;
  isEffectAsset: boolean;
}): boolean {
  return (
    options.selected && options.isVideoNode && options.hasVideoSource && !options.isEffectAsset
  );
}
