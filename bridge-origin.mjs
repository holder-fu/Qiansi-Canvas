const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isPrivateNetworkHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part < 0 || part > 255)) return false;
    const [a, b] = octets;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const ipv6 = normalized.replace(/^\[|\]$/g, '');
  const firstGroup = Number.parseInt(ipv6.split(':')[0] || '', 16);
  return (
    ipv6.includes(':') &&
    Number.isFinite(firstGroup) &&
    ((firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80)
  );
}

function normalizedRequestHost(value) {
  const candidate = String(value || '').trim();
  if (!candidate || /[\s/@\\]/.test(candidate)) return '';
  try {
    return new URL(`http://${candidate}`).host.toLowerCase();
  } catch {
    return '';
  }
}

function normalizedConfiguredOrigins(value) {
  const origins = new Set();
  for (const raw of String(value || '').split(',')) {
    const candidate = raw.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== 'null') {
        origins.add(url.origin);
      }
    } catch {
      // Ignore malformed configuration instead of weakening the origin policy.
    }
  }
  return origins;
}

function normalizedHttpOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== 'null') {
      return url.origin;
    }
  } catch {
    // Invalid request origins remain blocked.
  }
  return '';
}

function normalizedMachineHostname(value) {
  const hostname = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (
    !hostname ||
    hostname.length > 253 ||
    !hostname.split('.').every((label) => /^(?=.{1,63}$)[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
  ) {
    return '';
  }
  return hostname;
}

/** Add only this machine's exact LAN names to the configured browser-origin allowlist. */
export function withMachineCanvasOrigins(
  configuredOrigins = '',
  machineHostname = '',
  port = 2895,
) {
  const origins = normalizedConfiguredOrigins(configuredOrigins);
  const hostname = normalizedMachineHostname(machineHostname);
  const numericPort = Number(port);
  if (!hostname || !Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    return [...origins].join(',');
  }
  origins.add(`http://${hostname}:${numericPort}`);
  origins.add(`http://${hostname}.local:${numericPort}`);
  return [...origins].join(',');
}

export function isLoopbackCanvasOrigin(origin) {
  try {
    const url = new URL(String(origin || ''));
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isSameHostLoopbackCanvasOrigin(origin, requestHost) {
  try {
    const url = new URL(String(origin || ''));
    const host = normalizedRequestHost(requestHost);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(host) &&
      url.host.toLowerCase() === host &&
      LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isSameHostPrivateCanvasOrigin(origin, requestHost) {
  try {
    const url = new URL(String(origin || ''));
    const host = normalizedRequestHost(requestHost);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(host) &&
      url.host.toLowerCase() === host &&
      isPrivateNetworkHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export function createBridgeOriginPolicy(configuredOrigins = '') {
  const exactOrigins = normalizedConfiguredOrigins(configuredOrigins);
  return {
    allows(origin, method = 'GET', requestHost = '') {
      const value = String(origin || '').trim();
      if (value) {
        return (
          exactOrigins.has(normalizedHttpOrigin(value)) ||
          isSameHostLoopbackCanvasOrigin(value, requestHost) ||
          isSameHostPrivateCanvasOrigin(value, requestHost)
        );
      }
      return false;
    },
  };
}
