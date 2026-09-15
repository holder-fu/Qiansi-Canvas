const RETIRED_PROVIDER_IDS = new Set(['img-dalle', 'img-generic', 'ark-cli']);
const RETIRED_PROVIDER_PROTOCOLS = new Set(['runninghub', 'ark-cli']);

/** Reject persisted or forged requests for provider interfaces removed from the product. */
export function assertActiveProviderProtocol(protocol) {
  const normalized = String(protocol || '')
    .trim()
    .toLowerCase();
  if (RETIRED_PROVIDER_PROTOCOLS.has(normalized)) {
    throw new Error('该服务商接口已移除，请在设置中选择其它可用服务商。');
  }
  return normalized;
}

/** Reject retired provider identities before they can fall through to a generic adapter. */
export function assertActiveProvider(provider) {
  const providerId = String(provider?.providerId || provider?.id || '')
    .trim()
    .toLowerCase();
  if (RETIRED_PROVIDER_IDS.has(providerId)) {
    throw new Error('该服务商接口已移除，请在设置中选择其它可用服务商。');
  }
  return assertActiveProviderProtocol(provider?.protocol);
}
