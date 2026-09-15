import { stdin, stdout } from 'node:process';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import {
  providerTransportErrorMessage,
  safeProviderRemoteUrl,
} from './src/lib/providerModelContract.mjs';

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_HEADERS = new Set(['accept', 'authorization', 'content-type', 'api-key', 'x-key']);

async function readRequest() {
  const chunks = [];
  let total = 0;
  for await (const chunk of stdin) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) throw new Error('独立网络请求参数过大。');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizedHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('独立网络请求头无效。');
  }
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName || '')
      .trim()
      .toLowerCase();
    const headerValue = String(rawValue || '').trim();
    if (!ALLOWED_HEADERS.has(name) || !headerValue || headerValue.length > 8 * 1024) {
      throw new Error('独立网络请求头无效。');
    }
    headers[name] = headerValue;
  }
  return headers;
}

function requestWithFreshSocket(url, headers, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? requestHttps : requestHttp)(
      url,
      { method: 'GET', headers, agent: false },
      (response) => {
        const status = Number(response.statusCode || 0);
        if (status >= 300 && status < 400) {
          response.resume();
          reject(new Error('上游模型目录返回了不允许的重定向。'));
          return;
        }
        const declaredValue = String(response.headers['content-length'] || '').trim();
        const declared = /^\d+$/.test(declaredValue) ? Number(declaredValue) : 0;
        if (declared > maxBytes) {
          response.destroy(new Error('上游模型目录超过大小限制。'));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            response.destroy(new Error('上游模型目录超过大小限制。'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () =>
          resolve({
            status,
            statusText: String(response.statusMessage || ''),
            contentType: String(response.headers['content-type'] || 'application/json'),
            body: Buffer.concat(chunks, received),
          }),
        );
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('独立网络请求超时。')));
    request.once('error', reject);
    request.end();
  });
}

function writeResult(value) {
  stdout.write(JSON.stringify(value));
}

try {
  const request = await readRequest();
  const url = safeProviderRemoteUrl(request?.url, '模型目录地址');
  const timeoutMs = Math.max(1_000, Math.min(30_000, Number(request?.timeoutMs) || 15_000));
  const maxBytes = Math.max(
    1,
    Math.min(MAX_RESPONSE_BYTES, Number(request?.maxBytes) || MAX_RESPONSE_BYTES),
  );
  const response = await requestWithFreshSocket(
    url,
    normalizedHeaders(request?.headers),
    timeoutMs,
    maxBytes,
  );
  writeResult({
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: {
      'content-type': response.contentType,
      'content-length': String(response.body.length),
    },
    bodyBase64: response.body.toString('base64'),
  });
} catch (error) {
  writeResult({ ok: false, error: providerTransportErrorMessage(error) });
  process.exitCode = 1;
}
