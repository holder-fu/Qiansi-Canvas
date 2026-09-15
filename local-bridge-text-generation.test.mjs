import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');

test('registers text generation before executing the provider request', () => {
  const routeStart = source.indexOf(
    "if (request.method === 'POST' && url.pathname === '/api/chat')",
  );
  const routeEnd = source.indexOf(
    "if (request.method === 'GET' && /^\\/output\\/.+/.test",
    routeStart,
  );
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = source.slice(routeStart, routeEnd);

  assert.match(route, /generationRequestRegistry\.run\(\{/);
  assert.match(route, /id: body\.requestId/);
  assert.match(route, /kind: 'text'/);
  assert.match(route, /requireRecoverableGenerationResult\(await bridgeChat\(body\), 'text'\)/);
  assert.match(route, /generationRequestHttpStatus\(error\)/);
});

test('validates stored text output without requiring a media file', () => {
  assert.match(
    source,
    /if \(kind === 'text'\) \{\s*return Boolean\(typeof result\?\.text === 'string' && result\.text\.trim\(\)\);/,
  );
});
