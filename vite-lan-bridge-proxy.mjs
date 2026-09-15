import {
  bridgeTokenMatches,
  isLanCollaborationRequest,
  isLoopbackAddress,
  requestBridgeAccessToken,
} from './bridge-security.mjs';
import { isAbsolute, relative, resolve } from 'node:path';

function pathIsInside(root, candidate) {
  const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const normalizedCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const relation = relative(normalizedRoot, normalizedCandidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

export function isBridgeRuntimeDataRequest(requestUrl, dataRoot, projectRoot = process.cwd()) {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(String(requestUrl || '/'), 'http://qiansi-canvas.local').pathname,
    );
  } catch {
    return true;
  }
  const lowerPathname = pathname.toLowerCase();
  if (lowerPathname === '/data' || lowerPathname.startsWith('/data/')) return true;
  const root = resolve(dataRoot);
  if (pathname.startsWith('/@fs/')) {
    return pathIsInside(root, resolve(pathname.slice('/@fs/'.length)));
  }
  return pathIsInside(root, resolve(projectRoot, `.${pathname}`));
}

export function createBridgeRuntimeDataGuard({ dataRoot, projectRoot }) {
  return {
    name: 'qiansi-bridge-runtime-data-guard',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!isBridgeRuntimeDataRequest(request.url, dataRoot, projectRoot)) {
          next();
          return;
        }
        response.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end('Not found');
      });
    },
  };
}

export function parseLanBridgeProxyRequest(url, prefix) {
  const raw = String(url || '/');
  const rawPathname = raw.split(/[?#]/u, 1)[0];
  if (!rawPathname.startsWith(prefix)) return { kind: 'outside' };
  if (rawPathname !== prefix && !rawPathname.startsWith(`${prefix}/`)) {
    return { kind: 'invalid' };
  }
  const parsed = new URL(raw, 'http://qiansi-canvas.local');
  if (parsed.pathname !== prefix && !parsed.pathname.startsWith(`${prefix}/`)) {
    return { kind: 'invalid' };
  }
  const pathname = parsed.pathname.slice(prefix.length) || '/';
  return { kind: 'target', pathname, searchParams: parsed.searchParams };
}

export function rewriteLanBridgeProxyPath(url, prefix) {
  const parsed = parseLanBridgeProxyRequest(url, prefix);
  if (parsed.kind !== 'target') throw new Error('Bridge 代理路径无效。');
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ''}`;
}

function sourceMatchesCanvasOrigin(headers, method, { allowMissingSource = false } = {}) {
  const host = String(headers?.host || '')
    .trim()
    .toLowerCase();
  const origin = String(headers?.origin || '').trim();
  const fetchSite = String(headers?.['sec-fetch-site'] || '')
    .trim()
    .toLowerCase();
  const referer = String(headers?.referer || '').trim();
  const verb = String(method || 'GET').toUpperCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;
  if (origin) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.host.toLowerCase() !== host)
        return false;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      if (new URL(referer).host.toLowerCase() !== host) return false;
    } catch {
      return false;
    }
  }
  if (
    !allowMissingSource &&
    !['GET', 'HEAD'].includes(verb) &&
    !origin &&
    fetchSite !== 'same-origin'
  )
    return false;
  return true;
}

export function authorizeLanBridgeProxyRequest({
  url,
  method,
  headers,
  remoteAddress,
  prefix,
  accessToken,
  trustedLan = false,
}) {
  const target = parseLanBridgeProxyRequest(url, prefix);
  if (target.kind === 'outside') return { ok: true };
  if (target.kind === 'invalid') {
    return { ok: false, status: 404, message: 'Bridge 代理路径无效。' };
  }
  if (isLoopbackAddress(remoteAddress)) return { ok: true };
  const candidate = requestBridgeAccessToken({ headers: headers || {} });
  const paired = bridgeTokenMatches(accessToken, candidate);
  const isPairingRequest =
    String(method || 'GET').toUpperCase() === 'GET' &&
    target.pathname === '/' &&
    bridgeTokenMatches(accessToken, target.searchParams.get('qiansi_pair'));
  if (isPairingRequest) return { ok: true };
  if (!trustedLan && !paired) {
    return {
      ok: false,
      status: 401,
      message: '局域网终端尚未配对或访问令牌已失效。请打开宿主终端最新的“一键配对并进入画布”地址。',
    };
  }
  if (!sourceMatchesCanvasOrigin(headers, method, { allowMissingSource: trustedLan })) {
    return {
      ok: false,
      status: 403,
      message: '已拒绝非同源创作台发起的桥接请求。',
    };
  }
  if (!isLanCollaborationRequest(target.pathname, method)) {
    return {
      ok: false,
      status: 403,
      message: '局域网终端仅允许访问画布协作与受管媒体。',
    };
  }
  return { ok: true };
}

export function createLanBridgeProxyGuard({ prefix, accessToken, enabled, trustedLan = false }) {
  return {
    name: 'qiansi-lan-bridge-proxy-guard',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((request, response, next) => {
        const authorization = authorizeLanBridgeProxyRequest({
          url: request.url,
          method: request.method,
          headers: request.headers,
          remoteAddress: request.socket?.remoteAddress,
          prefix,
          accessToken,
          trustedLan,
        });
        if (authorization.ok) {
          next();
          return;
        }
        response.writeHead(authorization.status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify({ error: { message: authorization.message } }));
      });
    },
  };
}

/**
 * The browser talks to Vite on the canvas origin while Vite talks to the
 * development Bridge on its loopback origin. Normalize the second hop so the
 * Bridge does not compare the public canvas Origin with its internal Host.
 * The guard above remains the security boundary for remote capabilities.
 */
export function normalizeLanBridgeProxyRequest(proxyRequest, targetOrigin, remoteAddress = '') {
  const target = new URL(targetOrigin);
  proxyRequest.setHeader('host', target.host);
  proxyRequest.setHeader('origin', target.origin);
  proxyRequest.setHeader('referer', `${target.origin}/`);
  proxyRequest.setHeader('sec-fetch-site', 'same-origin');
  proxyRequest.setHeader(
    'x-qiansi-canvas-proxy-scope',
    isLoopbackAddress(remoteAddress) ? 'host' : 'collaboration',
  );
}

export function normalizeLanBridgePairingProxyResponse(proxyResponse, requestUrl) {
  if (
    Number(proxyResponse?.statusCode) === 303 &&
    String(requestUrl || '').includes('qiansi_pair=') &&
    proxyResponse?.headers?.location
  ) {
    proxyResponse.headers.location = '/';
  }
}
