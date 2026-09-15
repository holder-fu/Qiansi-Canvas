const MODEL_ID_MAX_LENGTH = 200;
const MODEL_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:/@+-]{0,199}$/u;
const MODELSCOPE_AUTHENTICATION_URL = 'https://modelscope.cn/openapi/v1/users/me';

const IPV4_LITERAL_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const NON_GENERATION_MODEL_PATTERNS = [
  /(^|[-_.:/])(embedding|embeddings)($|[-_.:/])/,
  /(^|[-_.:/])(moderation)($|[-_.:/])/,
  /(^|[-_.:/])(stt|asr|speech-to-text)($|[-_.:/])/,
  /(^|[-_.:/])(whisper|transcribe|transcription)($|[-_.:/])/,
  /(^|[-_.:/])(rerank|reranker)($|[-_.:/])/,
  /(^|[-_.:/])(realtime)($|[-_.:/])/,
];

const AUDIO_MODEL_PATTERNS = [
  /(^|[-_.:/])(audio|music|song|speech|tts)($|[-_.:/\d])/,
  /(^|[-_.:/])(text-to-speech|speech-synthesis|voice-clone|voice-cloning)($|[-_.:/\d])/,
  /(^|[-_.:/])(seed-music|seed-audio)($|[-_.:/\d])/,
];

const VIDEO_MODEL_PATTERNS = [
  /(^|[-_.:/])(video|sora|veo|seedance|kling|hailuo)($|[-_.:/\d])/,
  /(^|[-_.:/])(wan2|wanx|t2v|i2v|s2v)($|[-_.:/\d])/,
  /(^|[-_.:/])(cogvideox|hunyuanvideo)($|[-_.:/\d])/,
];

const IMAGE_MODEL_PATTERNS = [
  /(^|[-_.:/])(image|images|imagen|dalle|dall-e)($|[-_.:/\d])/,
  /(^|[-_.:/])(flux|sdxl|ideogram|seedream|recraft)($|[-_.:/\d])/,
  /(^|[-_.:/])(stable-diffusion|z-image|qwen-image|kolors|hidream|omnigen)($|[-_.:/\d])/,
];

const CHAT_MODEL_PATTERNS = [
  /(^|[-_.:/])(gpt|chatgpt|o[134]|claude|gemini|grok)($|[-_.:/\d])/,
  /(^|[-_.:/])(deepseek|qwen|llama|mistral|mixtral|command)($|[-_.:/\d])/,
  /(^|[-_.:/])(kimi|moonshot|glm|doubao|hunyuan|minimax|abab)($|[-_.:/\d])/,
  /(^|[-_.:/])(baichuan|ernie|wenxin|internlm|spark|step|phi|yi)($|[-_.:/\d])/,
];

function normalizedBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') throw new TypeError('baseUrl must be a string.');
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new TypeError('baseUrl must not be empty.');
  return normalized;
}

function normalizedAddressHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function ipv4Octets(hostname) {
  const match = IPV4_LITERAL_PATTERN.exec(hostname);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : null;
}

function ipv6Words(hostname) {
  if (!hostname.includes(':') || hostname.includes('%')) return null;
  const halves = hostname.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const parseHalf = (items) => {
    const words = [];
    for (const item of items) {
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null;
      words.push(Number.parseInt(item, 16));
    }
    return words;
  };
  const leftWords = parseHalf(left);
  const rightWords = parseHalf(right);
  if (!leftWords || !rightWords) return null;
  if (halves.length === 1) return leftWords.length === 8 ? leftWords : null;
  const missing = 8 - leftWords.length - rightWords.length;
  if (missing < 1) return null;
  return [...leftWords, ...Array(missing).fill(0), ...rightWords];
}

function ipv4AddressKind(octets) {
  const [a, b, c] = octets;
  if (a === 127) return 'loopback';
  // Clash/Mihomo fake-ip mode conventionally maps public hostnames into the
  // RFC 2544 benchmarking range. Keep this distinct from ordinary blocked
  // addresses: literal URLs remain forbidden, while the pinned HTTPS DNS path
  // can permit it and still rely on hostname certificate verification.
  if (a === 198 && (b === 18 || b === 19)) return 'proxy-fake';
  if (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) {
    return 'blocked';
  }
  return 'public';
}

function isIpv6Prefix(words, prefixWords, prefixBits) {
  let remaining = prefixBits;
  for (let index = 0; remaining > 0; index += 1) {
    const bits = Math.min(16, remaining);
    const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
    if ((words[index] & mask) !== (prefixWords[index] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

function ipv6AddressKind(words) {
  const allZeroExceptLast = words.slice(0, 7).every((word) => word === 0);
  if (allZeroExceptLast && words[7] === 1) return 'loopback';
  if (words.every((word) => word === 0)) return 'blocked';

  // IPv4-mapped literals must inherit the embedded IPv4 policy. This also
  // prevents an encoded private address from bypassing the literal check.
  if (words.slice(0, 5).every((word) => word === 0) && (words[5] === 0 || words[5] === 0xffff)) {
    return ipv4AddressKind([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }

  const blockedPrefixes = [
    [[0x0064, 0xff9b, 0, 0, 0, 0, 0, 0], 96], // well-known IPv4 translation
    [[0x0064, 0xff9b, 0x0001, 0, 0, 0, 0, 0], 48], // local-use translation
    [[0x0100, 0, 0, 0, 0, 0, 0, 0], 64], // discard-only
    [[0x2001, 0, 0, 0, 0, 0, 0, 0], 23], // IETF protocol assignments
    [[0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32], // documentation
    [[0x2002, 0, 0, 0, 0, 0, 0, 0], 16], // 6to4 can encode private IPv4
    [[0x3fff, 0, 0, 0, 0, 0, 0, 0], 20], // documentation
    [[0xfc00, 0, 0, 0, 0, 0, 0, 0], 7], // unique-local
    [[0xfe80, 0, 0, 0, 0, 0, 0, 0], 10], // link-local
    [[0xfec0, 0, 0, 0, 0, 0, 0, 0], 10], // deprecated site-local
    [[0xff00, 0, 0, 0, 0, 0, 0, 0], 8], // multicast
  ];
  return blockedPrefixes.some(([prefix, bits]) => isIpv6Prefix(words, prefix, bits))
    ? 'blocked'
    : 'public';
}

/**
 * Classify an address literal before the bridge performs an upstream fetch.
 * Hostnames remain `hostname`: fetch does not expose a resolver-pinning hook,
 * so deployments that require DNS-rebinding resistance must additionally use
 * an egress proxy/firewall that rejects private answers after DNS resolution.
 */
export function classifyProviderAddressLiteral(hostname) {
  const normalized = normalizedAddressHostname(hostname);
  if (normalized === 'localhost') return 'loopback';
  const ipv4 = ipv4Octets(normalized);
  if (ipv4) return ipv4AddressKind(ipv4);
  const ipv6 = ipv6Words(normalized);
  if (ipv6) return ipv6AddressKind(ipv6);
  return 'hostname';
}

/** Validate an upstream URL while preserving explicit local provider support. */
export function safeProviderRemoteUrl(value, label = '上游地址') {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error(`${label}不是有效的 URL。`);
  }
  if (url.username || url.password) throw new Error(`${label}不能包含用户名或密码。`);
  const addressKind = classifyProviderAddressLiteral(url.hostname);
  if (addressKind === 'blocked' || addressKind === 'proxy-fake') {
    throw new Error(`${label}不能使用私网或保留地址。`);
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && addressKind === 'loopback') return url;
  throw new Error(`${label}必须使用 HTTPS；仅本机回环地址允许 HTTP。`);
}

/** Read and parse a JSON response without ever buffering beyond `maxBytes`. */
export async function readLimitedProviderJson(response, maxBytes, label = '上游响应') {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('maxBytes must be a positive safe integer.');
  }
  const declaredValue = String(response?.headers?.get?.('content-length') || '').trim();
  const declared = /^\d+$/.test(declaredValue) ? Number(declaredValue) : 0;
  if (declared > maxBytes) throw new Error(`${label}超过大小限制。`);
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error(`${label}没有返回内容。`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      received += chunk.byteLength;
      if (received > maxBytes) {
        await reader.cancel(`${label}超过大小限制。`).catch(() => undefined);
        throw new Error(`${label}超过大小限制。`);
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
  if (!bytes.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label}没有返回有效 JSON。`);
  }
}

/** Keep successful typed catalogs while recording failed optional catalogs. */
export function partitionProviderModelSettlements(targets, settlements) {
  const payloads = [];
  const failures = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const settlement = settlements[index];
    if (settlement?.status === 'fulfilled') {
      payloads.push(settlement.value);
      continue;
    }
    const reason = settlement?.reason;
    failures.push({
      kind: target?.kind || 'mixed',
      message: String(reason instanceof Error ? reason.message : reason || '请求失败').slice(
        0,
        240,
      ),
    });
  }
  return { payloads, failures };
}

/**
 * Node's fetch wraps socket/DNS/TLS failures in a TypeError and keeps the
 * actionable code on `cause`. Preserve that signal without exposing request
 * headers or other provider credentials.
 */
export function providerTransportErrorMessage(error) {
  const parts = [];
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 4 && !seen.has(current); depth += 1) {
    seen.add(current);
    const message = String(current instanceof Error ? current.message : current || '').trim();
    const code = String(current?.code || '').trim();
    const syscall = String(current?.syscall || '').trim();
    const address = String(current?.address || '').trim();
    const port = Number.isFinite(Number(current?.port)) ? String(current.port) : '';
    const detail = [code, syscall, address && port ? `${address}:${port}` : address]
      .filter(Boolean)
      .join(' ');
    const entry = [message, detail && `(${detail})`].filter(Boolean).join(' ');
    if (entry && !parts.includes(entry)) parts.push(entry);
    current = current?.cause;
  }
  return (parts.join(' → ') || '网络请求失败').slice(0, 320);
}

/** Retry only transport failures; HTTP/authentication and payload errors must
 * remain authoritative and must not issue a duplicate upstream request. */
export function shouldRetryProviderModelFetch(error) {
  return (
    error instanceof TypeError && /fetch failed|network|socket|terminated/i.test(error.message)
  );
}

/**
 * Return the upstream model-list targets for a provider protocol.
 *
 * `kind: "mixed"` means the payload must be classified by model ID. xAI's
 * typed endpoints are authoritative, so their models keep the endpoint kind.
 */
export function providerModelTargets(baseUrl, protocol) {
  const base = normalizedBaseUrl(baseUrl);

  if (protocol === 'xai') {
    const root = /\/v1$/i.test(base) ? base : `${base}/v1`;
    return [
      { kind: 'chat', url: `${root}/language-models` },
      { kind: 'image', url: `${root}/image-generation-models` },
      { kind: 'video', url: `${root}/video-generation-models` },
    ];
  }

  if (protocol === 'deepseek') {
    return [{ kind: 'mixed', url: `${base}/models` }];
  }

  if (protocol === 'volcengine') {
    const root = /\/api\/v3$/i.test(base) ? base : `${base}/api/v3`;
    return [{ kind: 'mixed', url: `${root}/models` }];
  }

  if (protocol !== 'openai' && protocol !== 'modelscope') {
    throw new Error('当前平台不支持远程模型目录检测。');
  }

  const root = /\/v1$/i.test(base) ? base : `${base}/v1`;
  return [{ kind: 'mixed', url: `${root}/models` }];
}

/**
 * ModelScope's model catalog is public, so a successful catalog response does
 * not prove that the supplied API key can authenticate. Run the official
 * identity probe first and only settle catalog requests after it succeeds.
 */
export async function settleProviderModelDiscovery(baseUrl, protocol, apiKey, fetchTarget) {
  if (typeof fetchTarget !== 'function') {
    throw new TypeError('fetchTarget must be a function.');
  }

  if (protocol === 'modelscope') {
    if (!String(apiKey || '').trim()) {
      throw new Error('ModelScope 模型目录检测需要 API Key。');
    }
    try {
      await fetchTarget({
        kind: 'authentication',
        url: MODELSCOPE_AUTHENTICATION_URL,
      });
    } catch (error) {
      const detail = String(error instanceof Error ? error.message : error || '请求失败')
        .trim()
        .slice(0, 240);
      throw new Error(`ModelScope API Key 鉴权失败：${detail || '请求失败'}`, { cause: error });
    }
  }

  const targets = providerModelTargets(baseUrl, protocol);
  const settlements = await Promise.allSettled(targets.map((target) => fetchTarget(target)));
  return { targets, settlements };
}

function modelCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.models)) return raw.models;
  if (Array.isArray(raw.list)) return raw.list;
  return [];
}

function safeModelId(item) {
  let candidate = '';
  if (typeof item === 'string') {
    candidate = item;
  } else if (item && typeof item === 'object' && !Array.isArray(item)) {
    if (typeof item.id === 'string') candidate = item.id;
    else if (typeof item.name === 'string') candidate = item.name;
    else if (typeof item.model === 'string') candidate = item.model;
  }

  const normalized = candidate.trim().replace(/^models\//, '');
  if (!normalized || normalized.length > MODEL_ID_MAX_LENGTH) return '';
  return MODEL_ID_PATTERN.test(normalized) ? normalized : '';
}

/** Parse the common OpenAI/DeepSeek/xAI model-list envelopes safely. */
export function providerModelIds(raw) {
  const seen = new Set();
  const ids = [];
  for (const item of modelCollection(raw)) {
    const id = safeModelId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Classify a model returned by an untyped `/models` endpoint.
 * Returns null for model families that this canvas cannot generate with.
 */
export function classifyDiscoveredProviderModel(modelId) {
  if (typeof modelId !== 'string') return null;
  const value = modelId.trim().toLowerCase();
  if (!value || NON_GENERATION_MODEL_PATTERNS.some((pattern) => pattern.test(value))) return null;
  if (VIDEO_MODEL_PATTERNS.some((pattern) => pattern.test(value))) return 'video';
  if (IMAGE_MODEL_PATTERNS.some((pattern) => pattern.test(value))) return 'image';
  if (AUDIO_MODEL_PATTERNS.some((pattern) => pattern.test(value))) return 'audio';
  if (CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(value))) return 'chat';
  return null;
}

function addUnique(target, seen, modelId) {
  if (seen.has(modelId)) return;
  seen.add(modelId);
  target.push(modelId);
}

/**
 * Aggregate fetched payloads. Each entry is `{ kind, payload }`, where kind is
 * `chat`, `image`, `video`, `audio`, or `mixed` for a generic `/models` response.
 */
export function groupProviderModelPayloads(entries) {
  const grouped = { chat: [], image: [], video: [], audio: [] };
  const seen = { chat: new Set(), image: new Set(), video: new Set(), audio: new Set() };
  if (!Array.isArray(entries)) return grouped;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const kind = entry.kind;
    const ids = providerModelIds(entry.payload);

    if (kind === 'chat' || kind === 'image' || kind === 'video' || kind === 'audio') {
      for (const id of ids) {
        const normalized = id.toLowerCase();
        if (NON_GENERATION_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))) continue;
        addUnique(grouped[kind], seen[kind], id);
      }
      continue;
    }

    if (kind !== 'mixed') continue;
    for (const id of ids) {
      const classified = classifyDiscoveredProviderModel(id);
      if (classified === null) continue;
      addUnique(grouped[classified], seen[classified], id);
    }
  }

  return grouped;
}
