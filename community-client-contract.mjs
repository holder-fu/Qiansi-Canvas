const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function normalizeCommunityServerUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('素材后台地址不是有效 URL。');
  }
  if (url.username || url.password) throw new Error('素材后台地址不能包含用户名或密码。');
  if (url.search || url.hash) throw new Error('素材后台地址不能包含查询参数或片段。');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('素材后台地址只填写站点 Origin，不要附加 API 路径。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error('素材后台必须使用 HTTPS；仅本机测试允许 HTTP。');
  }
  return url.origin;
}

export function normalizeCommunityConnectivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('素材后台返回了无效的连通信息。');
  }
  const service = String(value.service || '');
  const apiVersion = Number(value.apiVersion);
  const connection = value.connection && typeof value.connection === 'object' ? value.connection : {};
  const authentication = value.authentication && typeof value.authentication === 'object' ? value.authentication : {};
  const providers = authentication.providers && typeof authentication.providers === 'object' ? authentication.providers : {};
  const library = value.library && typeof value.library === 'object' ? value.library : {};
  const kinds = Array.isArray(library.kinds) ? library.kinds.filter((kind) => ['style', 'effect', 'character', 'prompt'].includes(kind)) : [];
  if (service !== 'holder-community' || apiVersion !== 1 || authentication.scheme !== 'bearer') {
    throw new Error('目标服务不是兼容的 Qiansi-Canvas 素材后台。');
  }
  return {
    service,
    apiVersion,
    serverVersion: String(value.serverVersion || 'unknown').slice(0, 40),
    connection: {
      mode: String(connection.mode || 'native-service').slice(0, 40),
      dynamicLoopbackOrigins: Boolean(connection.dynamicLoopbackOrigins),
    },
    authentication: {
      scheme: 'bearer',
      loginMode: authentication.loginMode === 'browser-poll' ? 'browser-poll' : 'unsupported',
      providers: { google: Boolean(providers.google), wechat: Boolean(providers.wechat) },
    },
    library: {
      kinds,
      maxImageBytes: Number.isSafeInteger(Number(library.maxImageBytes)) ? Number(library.maxImageBytes) : 0,
    },
  };
}

export async function probeCommunityServer(value, fetchImpl = fetch) {
  const serverUrl = normalizeCommunityServerUrl(value);
  const response = await fetchImpl(`${serverUrl}/api/client/connectivity`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 64 * 1024) throw new Error('素材后台连通响应过大。');
  if (!response.body) throw new Error('素材后台没有返回连通响应。');
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      received += chunk.byteLength;
      if (received > 64 * 1024) {
        await reader.cancel('素材后台连通响应过大。').catch(() => undefined);
        throw new Error('素材后台连通响应过大。');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let payload = {};
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    /* Preserve the existing compatibility error below for invalid JSON. */
  }
  if (!response.ok) throw new Error(payload?.error?.message || `素材后台返回 HTTP ${response.status}。`);
  return { serverUrl, connectivity: normalizeCommunityConnectivity(payload?.data) };
}
