import {
  PROVIDER_CONNECTIONS_CHANGED_EVENT,
  isProviderConnectionUsable,
  isProviderConnectionVerified,
  type ProviderConnection,
} from './providerRegistry';

type ProviderRuntimeState = Pick<
  ProviderConnection,
  | 'verifiedAt'
  | 'lastVerifiedAt'
  | 'configValidatedAt'
  | 'cliStatus'
  | 'models'
  | 'modelCapabilities'
>;

function providerRuntimeState(provider: ProviderConnection): ProviderRuntimeState {
  return {
    verifiedAt: provider.verifiedAt,
    lastVerifiedAt: provider.lastVerifiedAt,
    configValidatedAt: provider.configValidatedAt,
    cliStatus: provider.cliStatus ? { ...provider.cliStatus } : undefined,
    models: {
      chat: [...provider.models.chat],
      image: [...provider.models.image],
      video: [...provider.models.video],
      audio: [...(provider.models.audio ?? [])],
    },
    modelCapabilities: provider.modelCapabilities ? { ...provider.modelCapabilities } : undefined,
  };
}

function sameProviderRuntimeState(left: ProviderConnection, right: ProviderConnection): boolean {
  return JSON.stringify(providerRuntimeState(left)) === JSON.stringify(providerRuntimeState(right));
}

/**
 * Adopts only runtime-owned fields from the registry. Editable settings stay
 * owned by the open panel, and providers with a pending local edit are left
 * untouched until that edit has been persisted.
 */
export function mergeApiSettingsRuntimeState(
  current: ProviderConnection[],
  latest: ProviderConnection[],
  pendingLocalProviderIds: ReadonlySet<string> = new Set(),
): ProviderConnection[] {
  const latestById = new Map(latest.map((provider) => [provider.id, provider]));
  let changed = false;
  const merged = current.map((provider) => {
    const observed = latestById.get(provider.id);
    if (
      !observed ||
      pendingLocalProviderIds.has(provider.id) ||
      provider.protocol !== observed.protocol ||
      provider.baseUrl !== observed.baseUrl ||
      sameProviderRuntimeState(provider, observed)
    ) {
      return provider;
    }
    changed = true;
    return { ...provider, ...providerRuntimeState(observed) };
  });
  return changed ? merged : current;
}

export function subscribeApiSettingsProviderChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PROVIDER_CONNECTIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PROVIDER_CONNECTIONS_CHANGED_EVENT, listener);
}

export type ApiSettingsCliConnectionState = 'current' | 'historical' | 'unavailable';

export function apiSettingsCliConnectionState(
  provider: ProviderConnection,
  statusReady: boolean,
): ApiSettingsCliConnectionState {
  if (!statusReady || !isProviderConnectionUsable(provider)) return 'unavailable';
  return isProviderConnectionVerified(provider) ? 'current' : 'historical';
}
