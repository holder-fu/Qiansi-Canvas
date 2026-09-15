import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { lookup as lookupDns } from 'node:dns/promises';
import {
  classifyProviderAddressLiteral,
  providerTransportErrorMessage,
  safeProviderRemoteUrl,
} from './src/lib/providerModelContract.mjs';

const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const ALLOWED_HEADERS = new Set(['accept', 'authorization', 'content-type', 'api-key', 'x-key']);

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function normalizedHeaders(value) {
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(value || {})) {
    const name = String(rawName || '')
      .trim()
      .toLowerCase();
    const headerValue = String(rawValue || '').trim();
    if (!ALLOWED_HEADERS.has(name) || !headerValue || headerValue.length > 8 * 1024) {
      throw new Error('上游请求头无效。');
    }
    headers[name] = headerValue;
  }
  return headers;
}

async function encodedBody(body, headers, maxBytes) {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === 'string') {
    const buffer = Buffer.from(body, 'utf8');
    if (buffer.length > maxBytes) throw new Error('上游请求内容超过大小限制。');
    return buffer;
  }
  if (body instanceof Uint8Array) {
    const buffer = Buffer.from(body);
    if (buffer.length > maxBytes) throw new Error('上游请求内容超过大小限制。');
    return buffer;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const encoded = new Response(body);
    const contentType = encoded.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    const buffer = Buffer.from(await encoded.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('上游请求内容超过大小限制。');
    return buffer;
  }
  throw new Error('上游请求内容类型不受支持。');
}

export function selectPublicProviderAddress(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('上游域名没有可用地址。');
  const kinds = records.map((record) => classifyProviderAddressLiteral(record?.address));
  if (kinds.includes('proxy-fake')) {
    if (!kinds.every((kind) => kind === 'proxy-fake')) {
      throw new Error('上游域名同时解析到了公网和代理 Fake-IP，已拒绝请求。');
    }
    return records[0];
  }
  if (kinds.some((kind) => kind !== 'public')) {
    throw new Error('上游域名解析到了私网、回环或保留地址，已拒绝请求。');
  }
  return records[0];
}

async function providerLookup(url, allowLoopback) {
  const addressKind = classifyProviderAddressLiteral(url.hostname);
  if (addressKind === 'loopback') {
    if (!allowLoopback) throw new Error('上游地址不能访问未经持久授权的本机服务。');
    return undefined;
  }
  if (addressKind !== 'hostname') return undefined;
  let records;
  try {
    records = await lookupDns(url.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(providerTransportErrorMessage(error));
  }
  const selected = selectPublicProviderAddress(records);
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, [selected]);
    else callback(null, selected.address, selected.family);
  };
}

/**
 * Send one upstream request on a fresh socket. Generation calls use this as
 * their primary transport, so a transport error is never retried after an
 * ambiguous POST (which could otherwise duplicate a paid generation task).
 */
export async function freshProviderRequest(options) {
  const url = safeProviderRemoteUrl(options?.url, options?.label || '上游地址');
  const lookup = await providerLookup(url, options?.allowLoopback === true);
  const method = String(options?.method || 'GET')
    .trim()
    .toUpperCase();
  if (method !== 'GET' && method !== 'POST') throw new Error('上游请求方法不受支持。');
  const timeoutMs = boundedPositiveInteger(options?.timeoutMs, 30_000, 10 * 60 * 1000);
  const maxRequestBytes = boundedPositiveInteger(
    options?.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES,
    DEFAULT_MAX_REQUEST_BYTES,
  );
  const maxResponseBytes = boundedPositiveInteger(
    options?.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES,
  );
  const headers = normalizedHeaders(options?.headers);
  const body = await encodedBody(options?.body, headers, maxRequestBytes);
  if (body.length) headers['content-length'] = String(body.length);

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(new Error(providerTransportErrorMessage(error)));
    };
    const request = (url.protocol === 'https:' ? requestHttps : requestHttp)(
      url,
      { method, headers, agent: false, ...(lookup ? { lookup } : {}) },
      (response) => {
        const status = Number(response.statusCode || 0);
        if (status >= 300 && status < 400) {
          response.resume();
          fail(new Error('上游返回了不允许的重定向。'));
          return;
        }
        const declaredValue = String(response.headers['content-length'] || '').trim();
        const declared = /^\d+$/.test(declaredValue) ? Number(declaredValue) : 0;
        if (declared > maxResponseBytes) {
          response.destroy(new Error('上游响应超过大小限制。'));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxResponseBytes) {
            response.destroy(new Error('上游响应超过大小限制。'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', fail);
        response.once('end', () => {
          if (settled) return;
          settled = true;
          const responseBody = Buffer.concat(chunks, received);
          resolve(
            new Response(responseBody, {
              status,
              statusText: String(response.statusMessage || '').slice(0, 120),
              headers: {
                'content-type': String(response.headers['content-type'] || 'application/json'),
                'content-length': String(responseBody.length),
              },
            }),
          );
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('上游请求超时。')));
    request.once('error', fail);
    if (body.length) request.write(body);
    request.end();
  });
}
