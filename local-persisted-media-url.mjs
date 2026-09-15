const DEVELOPMENT_BRIDGE_PROXY_PREFIX = '/__qiansi_bridge';
const PERSISTED_MEDIA_PATHS = [
  /^\/asset-library\/files\/[A-Za-z0-9_-]{6,80}$/,
  /^\/media-preview\/files\/[A-Za-z0-9_-]{12,80}\.webp$/,
  /^\/output\/[A-Za-z0-9_.-]+$/,
];

function normalizedHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

function withoutDevelopmentProxyPrefix(pathname) {
  let result = `/${String(pathname || '').replace(/^\/+/, '')}`;
  while (
    result === DEVELOPMENT_BRIDGE_PROXY_PREFIX ||
    result.startsWith(`${DEVELOPMENT_BRIDGE_PROXY_PREFIX}/`)
  ) {
    result = result.slice(DEVELOPMENT_BRIDGE_PROXY_PREFIX.length) || '/';
  }
  return result;
}

/**
 * Resolve a browser-facing local media URL to the bridge-owned root path.
 * Development pages use a separate Vite port and `/__qiansi_bridge` proxy;
 * persisted snapshots may also retain an older bridge port. Host and path
 * ownership are therefore authoritative here, while the port is deliberately
 * ignored. The caller still validates the asset id against its local index.
 */
export function localPersistedMediaPathname(value, localHosts) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value || ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  const hosts =
    localHosts instanceof Set
      ? localHosts
      : new Set(Array.from(localHosts || [], normalizedHostname));
  if (!hosts.has(normalizedHostname(url.hostname))) return '';
  const pathname = withoutDevelopmentProxyPrefix(url.pathname);
  return PERSISTED_MEDIA_PATHS.some((pattern) => pattern.test(pathname)) ? pathname : '';
}
