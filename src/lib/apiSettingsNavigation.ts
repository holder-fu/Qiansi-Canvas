import {
  sortProvidersForSettings,
  type ProviderCategory,
  type ProviderConnection,
} from './providerRegistry';

export type ApiSettingsSelection = {
  category: ProviderCategory;
  providerId: string;
};

export function resolveApiSettingsSelection(
  connections: ProviderConnection[],
  initialProviderId?: string,
): ApiSettingsSelection {
  const requested = initialProviderId
    ? connections.find((provider) => provider.id === initialProviderId)
    : undefined;
  const fallback =
    sortProvidersForSettings(connections.filter((provider) => provider.category === 'text'))[0] ??
    sortProvidersForSettings(connections)[0];
  return {
    category: requested?.category ?? fallback?.category ?? 'text',
    providerId: requested?.id ?? fallback?.id ?? '',
  };
}
