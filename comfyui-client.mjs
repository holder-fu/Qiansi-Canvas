import { safeProviderRemoteUrl } from './src/lib/providerModelContract.mjs';

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_JOB_TIMEOUT_MS = 45 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const MAX_COMFY_JSON_BYTES = 8 * 1024 * 1024;
const MAX_COMFY_OBJECT_INFO_BYTES = 32 * 1024 * 1024;
const MAX_COMFY_ERROR_BYTES = 64 * 1024;

function isLoopbackHostname(hostname) {
  const value = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

/** Local ComfyUI is deliberately loopback-only; the Qiansi bridge is the LAN gateway. */
export function normalizeLocalComfyBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim() || 'http://127.0.0.1:8188');
  } catch {
    throw new Error('ComfyUI 地址格式无效。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ComfyUI 地址必须使用 HTTP 或 HTTPS。');
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error('本地 ComfyUI 仅允许 localhost、127.0.0.1 或 ::1。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('ComfyUI 地址不能包含凭据、查询参数或片段。');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function normalizeRemoteComfyBaseUrl(value) {
  const url = safeProviderRemoteUrl(value, '远程 ComfyUI 地址');
  if (url.search || url.hash) {
    throw new Error('远程 ComfyUI 地址不能包含查询参数或片段。');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function normalizeComfyBaseUrl(baseUrl, allowRemote) {
  return allowRemote ? normalizeRemoteComfyBaseUrl(baseUrl) : normalizeLocalComfyBaseUrl(baseUrl);
}

export function comfyUrl(baseUrl, pathname, query, options = {}) {
  const base = `${normalizeComfyBaseUrl(baseUrl, options.allowRemote === true)}/`;
  const url = new URL(String(pathname || '').replace(/^\/+/, ''), base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function errorDetail(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const value = payload;
  const messages = [];
  if (typeof value.error === 'string' && value.error.trim()) messages.push(value.error.trim());
  if (value.error && typeof value.error === 'object') {
    const message = value.error.message || value.error.type || value.error.exception_message;
    if (typeof message === 'string' && message.trim()) messages.push(message.trim());
  }
  if (typeof value.message === 'string' && value.message.trim())
    messages.push(value.message.trim());
  const nodeErrors = value.node_errors;
  if (nodeErrors && typeof nodeErrors === 'object') {
    for (const [nodeId, item] of Object.entries(nodeErrors)) {
      if (!item || typeof item !== 'object') continue;
      const errors = Array.isArray(item.errors) ? item.errors : [];
      for (const issue of errors) {
        if (!issue || typeof issue !== 'object') continue;
        const message = issue.message || issue.details;
        if (typeof message === 'string' && message.trim()) {
          messages.push(`节点 ${nodeId}：${message.trim()}`);
        }
      }
    }
  }
  return [...new Set(messages)].slice(0, 5).join('；').slice(0, 2000);
}

async function responsePayload(response, successMaximum = MAX_COMFY_JSON_BYTES) {
  const maximum = response.ok ? successMaximum : MAX_COMFY_ERROR_BYTES;
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maximum) throw new Error('ComfyUI 返回的数据过大。');
  if (!response.body) return {};
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel().catch(() => null);
      throw new Error('ComfyUI 返回的数据过大。');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

async function comfyJson(baseUrl, pathname, init = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const fetchImpl = init.fetchImpl || fetch;
  const request = { ...init };
  delete request.fetchImpl;
  const allowRemote = request.allowRemote === true;
  delete request.allowRemote;
  const maximumBytes = Number.isSafeInteger(request.maximumBytes)
    ? request.maximumBytes
    : MAX_COMFY_JSON_BYTES;
  delete request.maximumBytes;
  const response = await fetchImpl(comfyUrl(baseUrl, pathname, undefined, { allowRemote }), {
    ...request,
    redirect: 'error',
    signal: request.signal || AbortSignal.timeout(timeoutMs),
  });
  const payload = await responsePayload(response, maximumBytes);
  if (!response.ok) {
    throw new Error(errorDetail(payload) || `ComfyUI 返回 HTTP ${response.status}。`);
  }
  return payload;
}

export async function inspectLocalComfy(baseUrl, options = {}) {
  const payload = await comfyJson(
    baseUrl,
    '/system_stats',
    {
      fetchImpl: options.fetchImpl,
      headers: options.headers,
      allowRemote: options.allowRemote,
    },
    options.timeoutMs,
  );
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !payload.system ||
    typeof payload.system !== 'object' ||
    Array.isArray(payload.system)
  ) {
    throw new Error('8188 端口返回的不是有效 ComfyUI system_stats。');
  }
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  const optionalRequest = (pathname, maximumBytes = MAX_COMFY_JSON_BYTES) =>
    comfyJson(
      baseUrl,
      pathname,
      {
        fetchImpl: options.fetchImpl,
        headers: options.headers,
        allowRemote: options.allowRemote,
        maximumBytes,
      },
      options.timeoutMs,
    );
  const [featuresResult, objectInfoResult] = await Promise.allSettled([
    optionalRequest('/features'),
    optionalRequest('/object_info', MAX_COMFY_OBJECT_INFO_BYTES),
  ]);
  const featurePayload = featuresResult.status === 'fulfilled' ? featuresResult.value : null;
  const objectInfoPayload = objectInfoResult.status === 'fulfilled' ? objectInfoResult.value : null;
  const features =
    featurePayload && typeof featurePayload === 'object' && !Array.isArray(featurePayload)
      ? featurePayload
      : null;
  const objectInfo =
    objectInfoPayload && typeof objectInfoPayload === 'object' && !Array.isArray(objectInfoPayload)
      ? objectInfoPayload
      : null;
  const capabilityWarnings = [];
  if (!features) capabilityWarnings.push('无法读取 ComfyUI /features，功能标志未验证。');
  if (!objectInfo)
    capabilityWarnings.push('无法读取 ComfyUI /object_info，工作流兼容性暂未验证。');
  return {
    ready: true,
    baseUrl: normalizeComfyBaseUrl(baseUrl, options.allowRemote === true),
    system: payload?.system && typeof payload.system === 'object' ? payload.system : {},
    features,
    objectInfo,
    capabilityWarnings,
    devices: devices.map((device) => ({
      name: String(device?.name || device?.type || 'GPU'),
      type: String(device?.type || ''),
      vramTotal: Number(device?.vram_total || 0),
      vramFree: Number(device?.vram_free || 0),
    })),
  };
}

export async function uploadComfyFile(baseUrl, blob, fileName, options = {}) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('ComfyUI 上传素材为空。');
  const form = new FormData();
  form.append('image', blob, fileName || `qiansi-${Date.now()}.png`);
  form.append('type', 'input');
  form.append('overwrite', 'false');
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    comfyUrl(baseUrl, '/upload/image', undefined, { allowRemote: options.allowRemote === true }),
    {
      method: 'POST',
      headers: options.headers,
      body: form,
      redirect: 'error',
      signal: options.signal || AbortSignal.timeout(options.timeoutMs || 60_000),
    },
  );
  const payload = await responsePayload(response);
  if (!response.ok) {
    throw new Error(errorDetail(payload) || `ComfyUI 上传素材失败（HTTP ${response.status}）。`);
  }
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const subfolder = typeof payload?.subfolder === 'string' ? payload.subfolder.trim() : '';
  if (!name) throw new Error('ComfyUI 上传成功，但没有返回文件名。');
  return subfolder ? `${subfolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${name}` : name;
}

export async function uploadComfyImage(baseUrl, blob, fileName, options = {}) {
  return uploadComfyFile(baseUrl, blob, fileName, options);
}

export async function queueComfyWorkflow(baseUrl, workflow, options = {}) {
  const payload = await comfyJson(
    baseUrl,
    '/prompt',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify({
        prompt: workflow,
        client_id: options.clientId,
        ...(options.cloud && options.apiKey
          ? { extra_data: { api_key_comfy_org: options.apiKey } }
          : {}),
      }),
      fetchImpl: options.fetchImpl,
      allowRemote: options.allowRemote,
    },
    options.timeoutMs,
  );
  const promptId = typeof payload?.prompt_id === 'string' ? payload.prompt_id.trim() : '';
  if (!promptId) throw new Error(errorDetail(payload) || 'ComfyUI 没有返回任务 ID。');
  return { promptId, queueNumber: Number(payload?.number || 0) };
}

function historyFailure(entry) {
  const messages = Array.isArray(entry?.status?.messages) ? entry.status.messages : [];
  for (const message of messages) {
    const type = Array.isArray(message) ? message[0] : '';
    const detail = Array.isArray(message) ? message[1] : undefined;
    if (type !== 'execution_error') continue;
    const text =
      errorDetail(detail) || String(detail?.exception_message || detail?.exception_type || '');
    return text || 'ComfyUI 工作流执行失败。';
  }
  if (entry?.status?.status_str === 'error') return 'ComfyUI 工作流执行失败。';
  return '';
}

async function fetchComfyHistoryEntry(baseUrl, promptId, options = {}) {
  const payload = await comfyJson(
    baseUrl,
    `/history/${encodeURIComponent(promptId)}`,
    {
      fetchImpl: options.fetchImpl,
      headers: options.headers,
      allowRemote: options.allowRemote,
      signal: options.signal,
    },
    options.requestTimeoutMs,
  );
  const entry = payload?.[promptId];
  if (!entry || typeof entry !== 'object') return null;
  const failure = historyFailure(entry);
  if (failure) throw new Error(failure);
  if (entry.outputs && typeof entry.outputs === 'object') return entry;
  if (entry.status?.completed === true) return entry;
  return null;
}

export async function waitForComfyHistory(baseUrl, promptId, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_JOB_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const entry = await fetchComfyHistoryEntry(baseUrl, promptId, options);
    if (entry) return entry;
    await (options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
      pollIntervalMs,
    );
  }
  throw new Error(`ComfyUI 任务等待超过 ${Math.ceil(timeoutMs / 60_000)} 分钟。`);
}

function comfyWebSocketUrl(baseUrl, clientId, allowRemote) {
  const options =
    typeof allowRemote === 'object' && allowRemote !== null
      ? allowRemote
      : { allowRemote: allowRemote === true };
  const url = options.cloud
    ? new URL('/ws', normalizeComfyBaseUrl(baseUrl, true))
    : comfyUrl(baseUrl, '/ws', undefined, { allowRemote: options.allowRemote === true });
  url.searchParams.set('clientId', String(clientId || ''));
  if (options.cloud && options.apiKey) url.searchParams.set('token', String(options.apiKey));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
}

function normalizedComfySocketEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const type = typeof payload.type === 'string' ? payload.type.trim() : '';
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  if (!type) return null;
  const value = Number(data.value);
  const maximum = Number(data.max);
  return {
    type,
    promptId: typeof data.prompt_id === 'string' ? data.prompt_id : '',
    nodeId: data.node === null ? null : String(data.node ?? ''),
    ...(Number.isFinite(value) ? { value } : {}),
    ...(Number.isFinite(maximum) ? { max: maximum } : {}),
    ...(Number.isFinite(value) && Number.isFinite(maximum) && maximum > 0
      ? { progress: Math.max(0, Math.min(100, Math.round((value / maximum) * 100))) }
      : {}),
    queueRemaining: Number.isSafeInteger(data?.status?.exec_info?.queue_remaining)
      ? Math.max(0, data.status.exec_info.queue_remaining)
      : undefined,
    cachedNodes: Array.isArray(data.nodes) ? data.nodes.map(String).slice(0, 2048) : undefined,
    message:
      type === 'execution_error'
        ? errorDetail(data) || String(data.exception_message || 'ComfyUI 工作流执行失败。')
        : '',
  };
}

function observeComfySocket(baseUrl, promptId, options, reconnecting) {
  return new Promise((resolve, reject) => {
    const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    if (!WebSocketImpl) {
      resolve({ completed: false, reason: 'unavailable' });
      return;
    }
    let socket;
    try {
      const url = comfyWebSocketUrl(
        baseUrl,
        options.clientId,
        options,
      );
      socket = options.webSocketFactory
        ? options.webSocketFactory(url.toString())
        : new WebSocketImpl(url.toString());
    } catch {
      resolve({ completed: false, reason: 'unavailable' });
      return;
    }
    let settled = false;
    let timer;
    const silenceTimeoutMs = Math.max(250, Number(options.silenceTimeoutMs) || 15_000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener?.('open', onOpen);
      socket.removeEventListener?.('message', onMessage);
      socket.removeEventListener?.('close', onClose);
      socket.removeEventListener?.('error', onError);
      options.signal?.removeEventListener?.('abort', onAbort);
      try {
        socket.close();
      } catch {
        // A socket that failed during construction may not be closable.
      }
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const armSilenceTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish({ completed: false, reason: 'silent' }), silenceTimeoutMs);
    };
    const onOpen = async () => {
      armSilenceTimer();
      options.onEvent?.({ type: reconnecting ? 'reconnected' : 'connected', promptId });
      try {
        const history = await options.historyProbe();
        if (history) finish({ completed: true, history });
      } catch (error) {
        fail(error);
      }
    };
    const onMessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }
      const normalized = normalizedComfySocketEvent(payload);
      if (!normalized) return;
      if (normalized.promptId && normalized.promptId !== promptId) return;
      armSilenceTimer();
      options.onEvent?.(normalized);
      if (normalized.type === 'execution_error' && normalized.promptId === promptId) {
        fail(new Error(normalized.message));
        return;
      }
      if (
        normalized.promptId === promptId &&
        (normalized.type === 'execution_success' ||
          (normalized.type === 'executing' && normalized.nodeId === null))
      ) {
        finish({ completed: true });
      }
    };
    const onClose = () => finish({ completed: false, reason: 'disconnected' });
    const onError = () => finish({ completed: false, reason: 'socket-error' });
    const onAbort = () =>
      fail(options.signal?.reason instanceof Error ? options.signal.reason : new Error('任务已取消。'));
    socket.addEventListener?.('open', onOpen);
    socket.addEventListener?.('message', onMessage);
    socket.addEventListener?.('close', onClose);
    socket.addEventListener?.('error', onError);
    options.signal?.addEventListener?.('abort', onAbort, { once: true });
    armSilenceTimer();
  });
}

async function waitForComfySocketCompletion(baseUrl, promptId, options) {
  const maxReconnects = Math.max(0, Math.min(3, Number(options.maxReconnects ?? 1)));
  for (let attempt = 0; attempt <= maxReconnects; attempt += 1) {
    const result = await observeComfySocket(baseUrl, promptId, options, attempt > 0);
    if (result.completed) return result;
    if (attempt >= maxReconnects || !['disconnected', 'socket-error'].includes(result.reason)) {
      return result;
    }
    await (options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
      Math.max(0, Number(options.reconnectDelayMs) || 250),
    );
  }
  return { completed: false, reason: 'unavailable' };
}

/** WebSocket is primary; history confirms final outputs and polling remains the fallback. */
export async function waitForComfyJob(baseUrl, promptId, options = {}) {
  const startedAt = Date.now();
  const socketResult = await waitForComfySocketCompletion(baseUrl, promptId, {
    ...options,
    historyProbe: () => fetchComfyHistoryEntry(baseUrl, promptId, options),
  });
  if (socketResult.history) return socketResult.history;
  const elapsed = Date.now() - startedAt;
  const timeoutMs = Math.max(1, (options.timeoutMs || DEFAULT_JOB_TIMEOUT_MS) - elapsed);
  return waitForComfyHistory(baseUrl, promptId, { ...options, timeoutMs });
}

export function comfyViewUrl(baseUrl, descriptor, options = {}) {
  return comfyUrl(
    baseUrl,
    '/view',
    {
      filename: descriptor?.filename,
      subfolder: descriptor?.subfolder,
      type: descriptor?.type || 'output',
    },
    options,
  );
}

/**
 * Fetch one ComfyUI output. Cloud downloads deliberately use a two-hop request:
 * the API key is sent only to cloud.comfy.org, never to the temporary signed URL.
 */
export async function fetchComfyOutputResponse(baseUrl, descriptor, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const requestUrl = comfyViewUrl(baseUrl, descriptor, options);
  const signal = options.signal || AbortSignal.timeout(options.timeoutMs || DEFAULT_JOB_TIMEOUT_MS);
  const response = await fetchImpl(requestUrl, {
    headers: options.headers,
    redirect: options.cloud ? 'manual' : 'error',
    signal,
  });
  if (!options.cloud || ![301, 302, 303, 307, 308].includes(response.status)) {
    return response;
  }
  const location = response.headers.get('location');
  if (!location) throw new Error('Comfy Cloud 输出重定向缺少签名下载地址。');
  const signedUrl = safeProviderRemoteUrl(
    new URL(location, requestUrl).toString(),
    'Comfy Cloud 签名下载地址',
  );
  return fetchImpl(signedUrl, {
    redirect: 'follow',
    signal,
  });
}
