import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectAntigravityModelProbe } from './antigravityCliContract.mjs';

test('rejects the official Antigravity not-signed-in response', () => {
  const status = inspectAntigravityModelProbe({
    code: 1,
    output:
      'error getting token source: You are not logged into Antigravity.\nError: Please sign in to view available models.',
  });
  assert.equal(status.authenticated, false);
  assert.equal(status.authenticationRequired, true);
  assert.match(status.decisiveMessage, /not logged into|please sign in/i);
});

test('accepts only a successful non-empty Antigravity model catalog', () => {
  assert.equal(
    inspectAntigravityModelProbe({ code: 0, output: 'gemini-3-pro\ngemini-3-flash' }).authenticated,
    true,
  );
  assert.equal(inspectAntigravityModelProbe({ code: 0, output: '' }).authenticated, false);
});
