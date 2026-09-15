import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';

const workerPath = join(import.meta.dirname, 'provider-model-fetch-worker.mjs');

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: import.meta.dirname,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test('isolated provider fetch preserves the HTTP response without exposing authorization', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer test-only-secret');
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Authentication Fails' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const result = await runWorker({
      url: `http://127.0.0.1:${address.port}/models`,
      headers: { Authorization: 'Bearer test-only-secret', 'Content-Type': 'application/json' },
      timeoutMs: 5_000,
      maxBytes: 32 * 1024,
    });
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /test-only-secret/);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.status, 401);
    assert.deepEqual(JSON.parse(Buffer.from(envelope.bodyBase64, 'base64').toString('utf8')), {
      error: { message: 'Authentication Fails' },
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('isolated provider fetch rejects request headers outside the fixed allowlist', async () => {
  const result = await runWorker({
    url: 'https://api.deepseek.com/models',
    headers: { Cookie: 'secret=value' },
  });
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stdout).error, /请求头无效/);
  assert.doesNotMatch(result.stdout, /secret=value/);
});
