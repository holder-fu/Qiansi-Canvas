import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { freshProviderRequest, selectPublicProviderAddress } from './provider-http-transport.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('freshProviderRequest sends JSON POSTs and returns a bounded Response', async () => {
  await withServer(
    (request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            method: request.method,
            auth: request.headers.authorization,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      });
    },
    async (baseUrl) => {
      const response = await freshProviderRequest({
        url: `${baseUrl}/chat`,
        method: 'POST',
        headers: {
          Authorization: 'Bearer harmless-test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'hello' }),
        timeoutMs: 2_000,
        maxResponseBytes: 4_096,
        allowLoopback: true,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        method: 'POST',
        auth: 'Bearer harmless-test-token',
        body: '{"prompt":"hello"}',
      });
    },
  );
});

test('freshProviderRequest rejects redirects and oversized responses', async () => {
  await withServer(
    (request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/elsewhere' });
        response.end();
        return;
      }
      response.end('x'.repeat(128));
    },
    async (baseUrl) => {
      await assert.rejects(
        freshProviderRequest({ url: `${baseUrl}/redirect`, allowLoopback: true }),
        /不允许的重定向/,
      );
      await assert.rejects(
        freshProviderRequest({
          url: `${baseUrl}/large`,
          maxResponseBytes: 16,
          allowLoopback: true,
        }),
        /超过大小限制/,
      );
    },
  );
});

test('freshProviderRequest rejects an untrusted loopback provider before connecting', async () => {
  await assert.rejects(
    freshProviderRequest({ url: 'http://127.0.0.1:65534/v1/models' }),
    /未经持久授权的本机服务/,
  );
});

test('DNS pinning accepts public and proxy Fake-IP answers while rejecting unsafe mixes', () => {
  assert.deepEqual(selectPublicProviderAddress([{ address: '8.8.8.8', family: 4 }]), {
    address: '8.8.8.8',
    family: 4,
  });
  assert.deepEqual(selectPublicProviderAddress([{ address: '198.18.0.84', family: 4 }]), {
    address: '198.18.0.84',
    family: 4,
  });
  assert.throws(
    () =>
      selectPublicProviderAddress([
        { address: '8.8.8.8', family: 4 },
        { address: '198.18.0.84', family: 4 },
      ]),
    /公网和代理 Fake-IP/,
  );
  assert.throws(
    () =>
      selectPublicProviderAddress([
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    /私网、回环或保留地址/,
  );
  assert.throws(
    () => selectPublicProviderAddress([{ address: '192.168.1.10', family: 4 }]),
    /私网、回环或保留地址/,
  );
});
