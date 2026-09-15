const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);
const AUDIO_GENERATOR_PROTOCOL = 'qiansi-audio-v1';
const HOST_MANAGED_AUDIO_ADAPTERS = new Set([
  'voxcpm2',
  'chattts',
  'qwen3tts',
  'cosyvoice3',
  'woosh',
  'acestepXl',
]);
const AUDIO_MODES = new Set(['design', 'clone', 'hifi']);
const AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/flac',
  'audio/x-flac',
]);
export const PLUGIN_AUDIO_DEFAULT_TIMEOUT_MS = 120_000;
export const PLUGIN_AUDIO_MIN_TIMEOUT_MS = 1_000;
export const PLUGIN_AUDIO_MAX_TIMEOUT_MS = 10 * 60_000;
export const PLUGIN_AUDIO_DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
export const PLUGIN_AUDIO_MIN_MAX_BYTES = 64 * 1024;
export const PLUGIN_AUDIO_MAX_MAX_BYTES = 256 * 1024 * 1024;
export const PLUGIN_AUDIO_MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const PLUGIN_AUDIO_MAX_TOTAL_REFERENCE_BYTES = 30 * 1024 * 1024;

export class PluginAudioProxyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PluginAudioProxyError';
    this.statusCode = statusCode;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function shortText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) {
    throw new PluginAudioProxyError(`${label}不能为空且不能超过 ${maxLength} 个字符。`);
  }
  return text;
}

function generatorId(value, label = '音频生成器 ID') {
  const id = String(value || '').trim();
  if (!PLUGIN_ID_RE.test(id)) {
    throw new PluginAudioProxyError(`${label}必须是小写字母开头的字母、数字或连字符。`);
  }
  return id;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new PluginAudioProxyError(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return number;
}

function loopbackEndpoint(value, label) {
  const source = String(value || '').trim();
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new PluginAudioProxyError(`${label}不是有效 URL。`);
  }
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new PluginAudioProxyError(
      `${label}必须是无凭据、查询参数和片段的 http://127.0.0.1 或 http://[::1] 地址。`,
    );
  }
  return url;
}

export function parsePluginAudioGeneratorContribution(value) {
  if (!isPlainObject(value)) throw new PluginAudioProxyError('音频生成器定义无效。');
  const id = generatorId(value.id);
  if (value.protocol !== AUDIO_GENERATOR_PROTOCOL) {
    throw new PluginAudioProxyError(`${id} 的音频生成协议不受支持。`);
  }
  const canvasOutput = value.canvasOutput == null ? undefined : String(value.canvasOutput).trim();
  if (canvasOutput !== undefined && canvasOutput !== 'audio-node') {
    throw new PluginAudioProxyError(`${id} 的画布输出类型不受支持。`);
  }
  const hostAdapter = String(value.hostAdapter || '').trim();
  let transport;
  if (hostAdapter) {
    if (!HOST_MANAGED_AUDIO_ADAPTERS.has(hostAdapter)) {
      throw new PluginAudioProxyError(`${id} 的宿主管理音频适配器不受支持。`);
    }
    if (value.endpoint != null || value.healthEndpoint != null) {
      throw new PluginAudioProxyError(`${id} 不能同时声明宿主管理适配器和 HTTP 地址。`);
    }
    transport = { hostAdapter };
  } else {
    const endpoint = loopbackEndpoint(value.endpoint, `${id} 的生成地址`);
    const healthEndpoint = loopbackEndpoint(value.healthEndpoint, `${id} 的健康检查地址`);
    if (endpoint.origin !== healthEndpoint.origin) {
      throw new PluginAudioProxyError(`${id} 的生成地址与健康检查地址必须同源。`);
    }
    transport = { endpoint: endpoint.toString(), healthEndpoint: healthEndpoint.toString() };
  }
  return {
    id,
    label: shortText(value.label, `${id} 生成器名称`, 60),
    protocol: AUDIO_GENERATOR_PROTOCOL,
    ...transport,
    ...(canvasOutput ? { canvasOutput } : {}),
    timeoutMs: boundedInteger(
      value.timeoutMs,
      PLUGIN_AUDIO_DEFAULT_TIMEOUT_MS,
      PLUGIN_AUDIO_MIN_TIMEOUT_MS,
      PLUGIN_AUDIO_MAX_TIMEOUT_MS,
      `${id} 的超时时间`,
    ),
    maxBytes: boundedInteger(
      value.maxBytes,
      PLUGIN_AUDIO_DEFAULT_MAX_BYTES,
      PLUGIN_AUDIO_MIN_MAX_BYTES,
      PLUGIN_AUDIO_MAX_MAX_BYTES,
      `${id} 的最大音频字节数`,
    ),
  };
}

function cleanJsonValue(value, depth = 0) {
  if (depth > 5) throw new PluginAudioProxyError('音频生成 options 嵌套过深。');
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 4_000);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PluginAudioProxyError('音频生成 options 包含无效数字。');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new PluginAudioProxyError('音频生成 options 数组过长。');
    return value.map((item) => cleanJsonValue(item, depth + 1));
  }
  if (!isPlainObject(value)) throw new PluginAudioProxyError('音频生成 options 必须是 JSON 对象。');
  const entries = Object.entries(value);
  if (entries.length > 80) throw new PluginAudioProxyError('音频生成 options 字段过多。');
  return Object.fromEntries(
    entries.map(([key, item]) => [String(key).slice(0, 80), cleanJsonValue(item, depth + 1)]),
  );
}

function decodedBase64Bytes(value) {
  const source = String(value || '');
  if (!source || source.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(source)) {
    throw new PluginAudioProxyError('参考音频不是有效 Base64。');
  }
  const padding = source.endsWith('==') ? 2 : source.endsWith('=') ? 1 : 0;
  return (source.length / 4) * 3 - padding;
}

function safeFileName(value) {
  const name = String(value || '').trim();
  if (!name) return;
  if (name.length > 120 || hasUnsafeFileNameChars(name)) {
    throw new PluginAudioProxyError('参考音频文件名无效。');
  }
  return name;
}

function parseReferenceAudio(value) {
  if (!isPlainObject(value)) {
    throw new PluginAudioProxyError('参考音频参数无效。');
  }
  const base64 = String(value.base64 || '');
  const byteLength = decodedBase64Bytes(base64);
  if (byteLength <= 0 || byteLength > PLUGIN_AUDIO_MAX_REFERENCE_BYTES) {
    throw new PluginAudioProxyError('单段参考音频不能超过 10 MB。');
  }
  const mimeType = String(value.mimeType || '')
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw new PluginAudioProxyError(`参考音频类型不受支持：${mimeType || '空'}。`);
  }
  const fileName = safeFileName(value.fileName);
  return {
    reference: { base64, mimeType, ...(fileName ? { fileName } : {}) },
    byteLength,
  };
}

function parseReferenceAudios(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new PluginAudioProxyError('参考音频数组必须包含 1 到 3 段音频。');
  }
  const parsed = value.map(parseReferenceAudio);
  if (
    parsed.reduce((total, item) => total + item.byteLength, 0) >
    PLUGIN_AUDIO_MAX_TOTAL_REFERENCE_BYTES
  ) {
    throw new PluginAudioProxyError('全部参考音频合计不能超过 30 MB。');
  }
  return parsed.map((item) => item.reference);
}

function hasUnsafeFileNameChars(value) {
  return (
    /[\\/:*?"<>|]/.test(value) || [...value].some((character) => character.codePointAt(0) < 32)
  );
}

export function parsePluginAudioGenerationRequest(value) {
  if (!isPlainObject(value)) throw new PluginAudioProxyError('音频生成参数无效。');
  const mode = String(value.mode || '').trim();
  if (!AUDIO_MODES.has(mode)) throw new PluginAudioProxyError('音频生成模式不受支持。');
  const text = shortText(value.text, '合成文本', 20_000);
  const control = String(value.control || '').trim();
  if (control.length > 8_000) throw new PluginAudioProxyError('声音控制描述不能超过 8000 个字符。');

  const referenceAudio =
    value.referenceAudio == null ? undefined : parseReferenceAudio(value.referenceAudio).reference;
  const referenceAudios =
    value.referenceAudios == null ? undefined : parseReferenceAudios(value.referenceAudios);
  if (referenceAudio && referenceAudios) {
    throw new PluginAudioProxyError('单段参考音频与多段参考音频不能同时提交。');
  }
  if ((mode === 'clone' || mode === 'hifi') && !referenceAudio && !referenceAudios?.length) {
    throw new PluginAudioProxyError(`${mode} 模式必须提供参考音频。`);
  }

  const options = value.options == null ? {} : cleanJsonValue(value.options);
  if (!isPlainObject(options)) throw new PluginAudioProxyError('音频生成 options 必须是对象。');
  if (mode === 'hifi' && !String(options.promptText || '').trim()) {
    throw new PluginAudioProxyError('hifi 模式必须在 options.promptText 中提供参考音频转写。');
  }
  const normalized = {
    mode,
    text,
    ...(control ? { control } : {}),
    ...(referenceAudio ? { referenceAudio } : {}),
    ...(referenceAudios ? { referenceAudios } : {}),
    options,
  };
  if (JSON.stringify(normalized).length > 24 * 1024 * 1024) {
    throw new PluginAudioProxyError('音频生成请求过大。');
  }
  return normalized;
}

function combinedAbortSignal(timeoutMs, signal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, signal]);
  if (signal.aborted) return signal;
  const controller = new AbortController();
  const abort = () => controller.abort();
  timeout.addEventListener('abort', abort, { once: true });
  signal.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function proxyFailure(error, fallback) {
  if (error instanceof PluginAudioProxyError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new PluginAudioProxyError('音频服务请求已取消或超时。', 504);
  }
  return new PluginAudioProxyError(fallback, 502);
}

async function shortErrorMessage(response) {
  try {
    const bytes = await readBoundedBytes(response, 8 * 1024);
    const text = new TextDecoder().decode(bytes).trim().slice(0, 500);
    if (!text) return '';
    try {
      const value = JSON.parse(text);
      return String(value?.error?.message || value?.message || '')
        .trim()
        .slice(0, 300);
    } catch {
      return '';
    }
  } catch {
    return '';
  }
}

async function readBoundedBytes(response, maximum) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new PluginAudioProxyError('音频服务返回内容超过清单限制。', 502);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => {});
        throw new PluginAudioProxyError('音频服务返回内容超过清单限制。', 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function canonicalAudioMimeType(value) {
  const mimeType = String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw new PluginAudioProxyError(`音频服务返回了不受支持的媒体类型：${mimeType || '空'}。`, 502);
  }
  return mimeType === 'audio/x-wav'
    ? 'audio/wav'
    : mimeType === 'audio/mp3'
      ? 'audio/mpeg'
      : mimeType === 'audio/x-flac'
        ? 'audio/flac'
        : mimeType;
}

function audioSignatureMatches(bytes, mimeType) {
  if (bytes.byteLength < 4) return false;
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (mimeType === 'audio/wav') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
  if (mimeType === 'audio/ogg') return ascii(0, 4) === 'OggS';
  if (mimeType === 'audio/flac') return ascii(0, 4) === 'fLaC';
  if (mimeType === 'audio/webm') {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (mimeType === 'audio/mp4') return bytes.byteLength >= 8 && ascii(4, 4) === 'ftyp';
  if (mimeType === 'audio/mpeg') {
    return ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  return false;
}

function responseFileName(response, mimeType) {
  const explicit = String(response.headers.get('x-qiansi-audio-file-name') || '').trim();
  const disposition = String(response.headers.get('content-disposition') || '');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  let candidate = explicit;
  if (!candidate && encoded) {
    try {
      candidate = decodeURIComponent(encoded);
    } catch {
      candidate = '';
    }
  }
  if (!candidate && plain) candidate = plain.trim();
  if (candidate && candidate.length <= 120 && !hasUnsafeFileNameChars(candidate)) {
    return candidate;
  }
  const extension =
    mimeType === 'audio/wav'
      ? 'wav'
      : mimeType === 'audio/mpeg'
        ? 'mp3'
        : mimeType === 'audio/ogg'
          ? 'ogg'
          : mimeType === 'audio/webm'
            ? 'webm'
            : mimeType === 'audio/mp4'
              ? 'm4a'
              : 'flac';
  return `plugin-audio.${extension}`;
}

export async function probePluginAudioGeneratorEndpoint(generator, options = {}) {
  const normalized = parsePluginAudioGeneratorContribution(generator);
  if (normalized.hostAdapter) {
    throw new PluginAudioProxyError('宿主管理音频适配器不能通过 HTTP 代理检查。', 500);
  }
  const startedAt = Date.now();
  try {
    const response = await (options.fetchImpl ?? fetch)(normalized.healthEndpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      credentials: 'omit',
      signal: combinedAbortSignal(normalized.timeoutMs, options.signal),
    });
    let advertisedReady;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (response.body && contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(
          new TextDecoder().decode(await readBoundedBytes(response, 8192)),
        );
        if (typeof payload?.ready === 'boolean') advertisedReady = payload.ready;
      } catch {
        advertisedReady = undefined;
      }
    } else {
      response.body?.cancel().catch(() => {});
    }
    const ok = response.ok && advertisedReady !== false;
    return {
      ok,
      status: response.status,
      latencyMs: Math.max(0, Date.now() - startedAt),
      ...(ok
        ? {}
        : {
            message: response.ok
              ? '本机音频服务已响应，但尚未就绪。'
              : `音频服务健康检查返回 HTTP ${response.status}。`,
          }),
    };
  } catch (error) {
    const failure = proxyFailure(error, '无法连接本机音频服务。');
    return {
      ok: false,
      status: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      message: failure.message,
    };
  }
}

export async function generatePluginAudioThroughProxy(generator, request, options = {}) {
  const normalizedGenerator = parsePluginAudioGeneratorContribution(generator);
  if (normalizedGenerator.hostAdapter) {
    throw new PluginAudioProxyError('宿主管理音频适配器不能通过 HTTP 代理生成。', 500);
  }
  const normalizedRequest = parsePluginAudioGenerationRequest(request);
  let response;
  try {
    response = await (options.fetchImpl ?? fetch)(normalizedGenerator.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
      body: JSON.stringify(normalizedRequest),
      redirect: 'error',
      credentials: 'omit',
      signal: combinedAbortSignal(normalizedGenerator.timeoutMs, options.signal),
    });
  } catch (error) {
    throw proxyFailure(error, '无法连接本机音频生成服务。');
  }
  if (!response.ok) {
    const message = await shortErrorMessage(response);
    throw new PluginAudioProxyError(
      message || `音频生成服务返回 HTTP ${response.status}。`,
      response.status >= 400 && response.status < 500 ? 400 : 502,
    );
  }
  const mimeType = canonicalAudioMimeType(response.headers.get('content-type'));
  const bytes = await readBoundedBytes(response, normalizedGenerator.maxBytes);
  if (!audioSignatureMatches(bytes, mimeType)) {
    throw new PluginAudioProxyError('音频服务返回内容与声明的媒体类型不匹配。', 502);
  }
  const duration = Number(response.headers.get('x-qiansi-audio-duration-seconds'));
  return {
    bytes,
    mimeType,
    fileName: responseFileName(response, mimeType),
    ...(Number.isFinite(duration) && duration > 0 ? { durationSeconds: duration } : {}),
  };
}
