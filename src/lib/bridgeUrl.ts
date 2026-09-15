const LOOPBACK_BRIDGE_BASE_URL = 'http://127.0.0.1:2895';
const DEVELOPMENT_BRIDGE_PROXY_PREFIX = '/__qiansi_bridge';
const LEGACY_BRIDGE_LOOPBACK_PORTS = new Set(['2895', '2896']);

function normalizeHttpBaseUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label}格式无效。`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label}只支持 HTTP 或 HTTPS。`);
  }
  if (url.username || url.password) {
    throw new Error(`${label}不能包含用户名或密码。`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label}不能包含查询参数或片段。`);
  }
  return url.toString().replace(/\/+$/, '');
}

function isLegacyLoopbackBridgeUrl(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    url.port === '2895' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  );
}

function isKnownLegacyBridgeLoopbackUrl(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    LEGACY_BRIDGE_LOOPBACK_PORTS.has(url.port)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isPrivateNetworkHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part > 255)) return false;
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const firstGroup = Number.parseInt(normalized.split(':')[0] || '', 16);
  return (
    normalized.includes(':') &&
    Number.isFinite(firstGroup) &&
    ((firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80)
  );
}

function isLanBrowserHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    isPrivateNetworkHostname(normalized) ||
    (!normalized.includes('.') && !normalized.includes(':')) ||
    normalized.endsWith('.local')
  );
}

function normalizedPathPrefix(pathname: string) {
  const normalized = `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '' : normalized;
}

/**
 * Convert a URL pathname served through the current Bridge base back to the
 * Bridge's root-relative resource path. Old development snapshots may already
 * contain `/__qiansi_bridge`; stripping it before joining prevents LAN clients
 * from requesting `/__qiansi_bridge/__qiansi_bridge/...`.
 */
export function canonicalBridgeResourcePathname(pathname: string, bridgeBasePathname = '/') {
  let resourcePath = `/${pathname.replace(/^\/+/, '')}`;
  const prefixes = [
    normalizedPathPrefix(bridgeBasePathname),
    DEVELOPMENT_BRIDGE_PROXY_PREFIX,
  ].filter(
    (prefix, index, all): prefix is string => Boolean(prefix) && all.indexOf(prefix) === index,
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      if (resourcePath === prefix || resourcePath.startsWith(`${prefix}/`)) {
        resourcePath = resourcePath.slice(prefix.length) || '/';
        changed = true;
      }
    }
  }
  return resourcePath;
}

function isPersistedBridgeMediaPath(pathname: string, bridgeBasePathname = '/'): boolean {
  const resourcePath = canonicalBridgeResourcePathname(pathname, bridgeBasePathname);
  return (
    resourcePath.startsWith('/asset-library/files/') ||
    resourcePath.startsWith('/media-preview/files/') ||
    resourcePath.startsWith('/output/')
  );
}

function rebaseBridgeResourceUrl(url: URL, normalizedBase: string, currentBridge: URL) {
  const resourcePath = canonicalBridgeResourcePathname(url.pathname, currentBridge.pathname);
  return `${normalizedBase}${resourcePath}${url.search}${url.hash}`;
}

/** Resolve the bridge host without depending on browser globals, so the policy is unit-testable. */
export function resolveBridgeBaseUrl(
  configured?: string | null,
  pageOrigin?: string | null,
): string {
  if (configured?.trim()) {
    const normalized = normalizeHttpBaseUrl(configured, '画布桥地址');
    const configuredUrl = new URL(normalized);
    const configuredHostname = configuredUrl.hostname.replace(/^\[|\]$/g, '');
    if (
      (configuredHostname === '0.0.0.0' ||
        configuredHostname === '::' ||
        isLoopbackHostname(configuredHostname)) &&
      pageOrigin?.trim()
    ) {
      try {
        const pageUrl = new URL(normalizeHttpBaseUrl(pageOrigin, '页面地址'));
        if (
          configuredHostname === '0.0.0.0' ||
          configuredHostname === '::' ||
          (!isLoopbackHostname(pageUrl.hostname) && isLanBrowserHostname(pageUrl.hostname))
        ) {
          configuredUrl.hostname = pageUrl.hostname;
          return configuredUrl.toString().replace(/\/+$/, '');
        }
      } catch {
        // A non-HTTP page cannot provide the runtime host for a wildcard listener.
      }
    }
    return normalized;
  }
  if (pageOrigin?.trim()) {
    try {
      return normalizeHttpBaseUrl(pageOrigin, '页面地址');
    } catch {
      // file://, browser extensions and incomplete test globals have no usable HTTP origin.
    }
  }
  return LOOPBACK_BRIDGE_BASE_URL;
}

const configuredBridgeUrl =
  import.meta.env.VITE_QIANSI_CANVAS_BRIDGE_URL ?? import.meta.env.VITE_KITTY_CANVAS_BRIDGE_URL;
const browserPageOrigin =
  typeof window !== 'undefined' && typeof window.location?.origin === 'string'
    ? window.location.origin
    : undefined;

/** Current bridge root: same-origin in browsers, with a loopback fallback for Node and tests. */
export const BRIDGE_BASE_URL = resolveBridgeBaseUrl(configuredBridgeUrl, browserPageOrigin);
export const BRIDGE_V1_BASE_URL = `${BRIDGE_BASE_URL}/v1`;

/** Resolve a bridge-relative endpoint or validate an already absolute HTTP(S) URL. */
export function resolveBridgeUrl(
  relativeOrAbsolute: string,
  base: string = BRIDGE_BASE_URL,
): string {
  const value = relativeOrAbsolute.trim();
  if (!value) throw new Error('画布桥资源地址不能为空。');
  if (value.startsWith('//')) throw new Error('画布桥资源地址不能使用协议相对形式。');
  const normalizedBase = resolveBridgeBaseUrl(base);
  let url: URL;
  try {
    url = /^[a-z][a-z\d+.-]*:/i.test(value)
      ? new URL(value)
      : new URL(`${normalizedBase}/${value.replace(/^\/+/, '')}`);
  } catch {
    throw new Error('画布桥资源地址格式无效。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('画布桥资源地址只支持 HTTP 或 HTTPS。');
  }
  if (url.username || url.password) {
    throw new Error('画布桥资源地址不能包含用户名或密码。');
  }
  const currentBridge = new URL(normalizedBase);
  if (isLegacyLoopbackBridgeUrl(url) && !isLegacyLoopbackBridgeUrl(currentBridge)) {
    return rebaseBridgeResourceUrl(url, normalizedBase, currentBridge);
  }
  const currentBridgeMedia =
    url.origin === currentBridge.origin &&
    isPersistedBridgeMediaPath(url.pathname, currentBridge.pathname);
  if (currentBridgeMedia) {
    return rebaseBridgeResourceUrl(url, normalizedBase, currentBridge);
  }
  const stalePersistedLoopbackMedia =
    isKnownLegacyBridgeLoopbackUrl(url) &&
    isPersistedBridgeMediaPath(url.pathname, currentBridge.pathname) &&
    url.origin !== currentBridge.origin;
  if (stalePersistedLoopbackMedia) {
    return rebaseBridgeResourceUrl(url, normalizedBase, currentBridge);
  }
  const stalePrivateBridgeMedia =
    LEGACY_BRIDGE_LOOPBACK_PORTS.has(url.port) &&
    isPrivateNetworkHostname(url.hostname) &&
    isPersistedBridgeMediaPath(url.pathname, currentBridge.pathname) &&
    url.origin !== currentBridge.origin;
  if (stalePrivateBridgeMedia) {
    return rebaseBridgeResourceUrl(url, normalizedBase, currentBridge);
  }
  return url.toString();
}

/** Return a current-Bridge URL's root-relative resource pathname. */
export function bridgeResourcePathname(
  relativeOrAbsolute: string,
  base: string = BRIDGE_BASE_URL,
): string | undefined {
  try {
    const normalizedBase = resolveBridgeBaseUrl(base);
    const currentBridge = new URL(normalizedBase);
    const resolved = new URL(resolveBridgeUrl(relativeOrAbsolute, normalizedBase));
    if (resolved.origin !== currentBridge.origin) return;
    return canonicalBridgeResourcePathname(resolved.pathname, currentBridge.pathname);
  } catch {
    return;
  }
}

/** Whether a URL is served by the bridge selected for this page. */
export function isCurrentBridgeUrl(value: string, base: string = BRIDGE_BASE_URL): boolean {
  try {
    return new URL(resolveBridgeUrl(value, base)).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
