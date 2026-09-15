import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_GENERATION_LIMITS,
  normalizeGenerationLimits,
} from './src/lib/generationLimitsContract.mjs';

export const DEFAULT_BRIDGE_HOST = '127.0.0.1';
export const BRIDGE_ACCESS_COOKIE = 'qiansi_canvas_access';
export const BRIDGE_PAIR_QUERY = 'qiansi_pair';

const MIN_ACCESS_TOKEN_BYTES = 32;

function normalizedAddress(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:/, '');
}

export function isLoopbackAddress(value) {
  const address = normalizedAddress(value);
  return address === 'localhost' || address === '127.0.0.1' || address === '::1';
}

export function createBridgeAccessToken() {
  return randomBytes(MIN_ACCESS_TOKEN_BYTES).toString('base64url');
}

export function normalizeBridgeAccessToken(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('QIANSI_CANVAS_ACCESS_TOKEN 不是有效的 Base64URL 令牌。');
  }
  let decoded;
  try {
    decoded = Buffer.from(token, 'base64url');
  } catch {
    throw new Error('QIANSI_CANVAS_ACCESS_TOKEN 不是有效的 Base64URL 令牌。');
  }
  if (
    decoded.length < MIN_ACCESS_TOKEN_BYTES ||
    token.length > 180 ||
    decoded.toString('base64url') !== token
  ) {
    throw new Error('QIANSI_CANVAS_ACCESS_TOKEN 必须至少包含 256 位随机熵。');
  }
  return token;
}

export function bridgeTokenMatches(expected, candidate) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(candidate || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

export function requestBridgeAccessToken(request) {
  const authorization = String(request?.headers?.authorization || '');
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1] || '';
  const explicit = String(request?.headers?.['x-qiansi-canvas-access-token'] || '').trim();
  return bearer || explicit || cookieValue(request?.headers?.cookie, BRIDGE_ACCESS_COOKIE);
}

export function bridgeAccessCookie(token) {
  return `${BRIDGE_ACCESS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

export function isLanCollaborationRequest(pathname, method = 'GET') {
  const path = String(pathname || '');
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET' && path === '/health') return true;
  if (verb === 'GET' && path === '/settings/profile') return true;
  if (verb === 'GET' && path === '/settings/text-modes') return true;
  if (verb === 'GET' && path === '/settings/prompt-library') return true;
  if (verb === 'GET' && path === '/settings/user-libraries') return true;
  if (path === '/projects') {
    return ['GET', 'POST'].includes(verb);
  }
  if (/^\/projects\/[A-Za-z0-9_-]{2,80}$/.test(path)) {
    return ['GET', 'PUT', 'PATCH'].includes(verb);
  }
  if (/^\/projects\/[A-Za-z0-9_-]{2,80}\/(?:duplicate|restore-latest)$/.test(path)) {
    return verb === 'POST';
  }
  if (path === '/project-folders') {
    return ['GET', 'POST'].includes(verb);
  }
  if (/^\/project-folders\/[A-Za-z0-9_-]{2,80}$/.test(path)) {
    return ['GET', 'PATCH'].includes(verb);
  }
  if (
    /^\/projects\/[A-Za-z0-9_-]{2,80}\/(?:trash|workspaces\/(?:script|views|video|audio))$/.test(
      path,
    )
  ) {
    return ['GET', 'PUT'].includes(verb);
  }
  if (path === '/asset-library' || path.startsWith('/asset-library/')) {
    if (path === '/asset-library/references') return false;
    return ['GET', 'POST', 'PATCH', 'DELETE'].includes(verb);
  }
  if (path === '/media-preview/upload' || path.startsWith('/media-preview/files/')) {
    return verb === 'GET' || (verb === 'POST' && path === '/media-preview/upload');
  }
  if (/^\/(?:output|exports)\/[A-Za-z0-9_.-]+$/.test(path)) return verb === 'GET';
  return false;
}

export function bridgeSecurityHeaders({ mime = '', svg = false } = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=()',
  };
  if (String(mime).startsWith('text/html')) {
    headers['Content-Security-Policy'] =
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";
  } else if (svg) {
    headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  }
  return headers;
}

export function managedAssetIdFromSource(value, { allowedHosts = [], port = 0 } = {}) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  let pathname = '';
  if (raw.startsWith('/')) {
    pathname = raw;
  } else {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const host = normalizedAddress(parsed.hostname);
    const allowed = new Set([...allowedHosts].map(normalizedAddress));
    if (!allowed.has(host)) return '';
    const actualPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (Number(port) > 0 && actualPort !== Number(port)) return '';
    pathname = parsed.pathname;
  }
  return /^\/asset-library\/files\/([A-Za-z0-9_-]{6,80})$/.exec(pathname)?.[1] || '';
}

const LIGHTX2V_CONFIG_KEYS = [
  'executablePath',
  'workingDirectory',
  'imageModelPath',
  'imageModelClass',
  'imageTask',
  'imageConfigPath',
  'videoModelPath',
  'videoModelClass',
  'videoTask',
  'videoConfigPath',
];

export function normalizePersistedLightX2VConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    LIGHTX2V_CONFIG_KEYS.map((key) => [
      key,
      String(source[key] || '')
        .trim()
        .slice(0, 2_000),
    ]),
  );
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

function webpDimensions(bytes) {
  const chunk = bytes.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  return { width: 0, height: 0 };
}

export function inspectDeclaredMediaSignature(value, declaredMime) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  const mime = String(declaredMime || '').toLowerCase();
  let valid = false;
  let dimensions = { width: 0, height: 0 };
  if (mime === 'image/png') {
    valid =
      bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    if (valid) dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (mime === 'image/jpeg') {
    valid = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (valid) dimensions = jpegDimensions(bytes);
  } else if (mime === 'image/gif') {
    valid = bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'));
    if (valid) dimensions = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (mime === 'image/webp') {
    valid =
      bytes.length >= 16 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (valid) dimensions = webpDimensions(bytes);
  } else if (mime === 'video/mp4' || mime === 'video/quicktime') {
    valid = bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  } else if (mime === 'video/webm') {
    valid = bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  } else {
    return { valid: true, width: 0, height: 0 };
  }
  if (!valid) throw new Error('素材文件签名与声明的媒体类型不一致。');
  const { width, height } = dimensions;
  if (width || height) {
    if (
      width < 1 ||
      height < 1 ||
      width > 32_768 ||
      height > 32_768 ||
      width * height > 200_000_000
    ) {
      throw new Error('图片尺寸超过安全处理上限。');
    }
  }
  return { valid: true, width, height };
}

export function inspectDirectorModelUpload({
  declaredMime,
  value,
  originalName = '',
  totalSize,
} = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  const mime = String(declaredMime || '')
    .trim()
    .toLowerCase();
  const extension = /(?:^|\.)(glb|vrm|gltf|fbx)$/iu.exec(String(originalName || '').trim())?.[1];
  const normalizedExtension = extension ? `.${extension.toLowerCase()}` : '';
  const glb =
    mime === 'model/gltf-binary' ||
    mime === 'model/vrm' ||
    ['.glb', '.vrm'].includes(normalizedExtension);
  if (glb) {
    if (
      bytes.length < 12 ||
      bytes.readUInt32LE(0) !== 0x46546c67 ||
      bytes.readUInt32LE(4) !== 2 ||
      (Number.isSafeInteger(totalSize) && bytes.readUInt32LE(8) !== totalSize)
    ) {
      throw new Error('3D 模型不是有效的 GLB/VRM 2.0 文件。');
    }
    const vrm = normalizedExtension === '.vrm' || mime === 'model/vrm';
    return {
      extension: vrm ? '.vrm' : '.glb',
      kind: 'director-model',
      mime: vrm ? 'model/vrm' : 'model/gltf-binary',
    };
  }
  if (mime === 'model/gltf+json' || normalizedExtension === '.gltf') {
    const prefix = bytes.subarray(0, Math.min(bytes.length, 4_096)).toString('utf8').trimStart();
    if (!prefix.startsWith('{') || !/"asset"\s*:/u.test(prefix)) {
      throw new Error('3D 模型不是有效的 glTF JSON 文件。');
    }
    return { extension: '.gltf', kind: 'director-model', mime: 'model/gltf+json' };
  }
  if (mime === 'application/octet-stream' && normalizedExtension === '.fbx') {
    const binaryHeader = Buffer.from('Kaydara FBX Binary  \u0000\u001a\u0000', 'binary');
    const asciiHeader = bytes.subarray(0, Math.min(bytes.length, 256)).toString('utf8');
    if (
      !bytes.subarray(0, binaryHeader.length).equals(binaryHeader) &&
      !/^\s*;\s*FBX\b/iu.test(asciiHeader)
    ) {
      throw new Error('3D 模型不是有效的 FBX 文件。');
    }
    return { extension: '.fbx', kind: 'director-model', mime: 'application/octet-stream' };
  }
  throw new Error('导演台模型仅支持经过签名校验的 GLB、VRM、glTF 或 FBX 文件。');
}

function requestCostClass(pathname) {
  const path = String(pathname || '');
  if (/^\/system-update\/(?:check|download|rollback)$/.test(path)) return 'update';
  if (/upload|\/plugins\/(?:import|restore|uninstall)/.test(path)) return 'upload';
  if (
    /^\/(?:api|v1)\/(?:generate|chat|images|videos)/.test(path) ||
    path === '/plugins/audio/generate'
  )
    return 'generation';
  return '';
}

export class BridgeRequestGate {
  constructor({ windowMs = 60_000, maxRequests, ...limits } = {}) {
    this.windowMs = windowMs;
    this.windows = new Map();
    this.active = { heavy: 0, generation: 0, upload: 0, update: 0 };
    this.maxRequests = DEFAULT_GENERATION_LIMITS.requestRateLimit;
    this.limits = { heavy: 8, generation: 5, upload: 2, update: 1 };
    this.configure(limits);
    if (Number.isSafeInteger(maxRequests) && maxRequests > 0) this.maxRequests = maxRequests;
  }

  configure(value = {}) {
    const normalized = normalizeGenerationLimits(value);
    this.maxRequests = normalized.requestRateLimit;
    this.limits = {
      heavy:
        normalized.generationConcurrency +
        normalized.uploadConcurrency +
        normalized.updateConcurrency,
      generation: normalized.generationConcurrency,
      upload: normalized.uploadConcurrency,
      update: normalized.updateConcurrency,
    };
    return normalized;
  }

  acquire({ address = '', pathname = '', now = Date.now() } = {}) {
    const key = normalizedAddress(address) || 'unknown';
    if (this.windows.size >= 2_048 && !this.windows.has(key)) {
      for (const [storedKey, stored] of this.windows) {
        if (now - stored.startedAt >= this.windowMs) this.windows.delete(storedKey);
      }
      if (this.windows.size >= 2_048) return { ok: false, reason: 'rate' };
    }
    const current = this.windows.get(key);
    const window =
      !current || now - current.startedAt >= this.windowMs ? { startedAt: now, count: 0 } : current;
    window.count += 1;
    this.windows.set(key, window);
    if (window.count > this.maxRequests) return { ok: false, reason: 'rate' };

    const cost = requestCostClass(pathname);
    if (!cost) return { ok: true, release() {} };
    if (this.active.heavy >= this.limits.heavy || this.active[cost] >= this.limits[cost]) {
      return { ok: false, reason: 'concurrency' };
    }
    this.active.heavy += 1;
    this.active[cost] += 1;
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.active.heavy = Math.max(0, this.active.heavy - 1);
        this.active[cost] = Math.max(0, this.active[cost] - 1);
      },
    };
  }
}
