import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arkCliSafeMessage,
  buildArkCliAuthStatusArgs,
  buildArkCliVersionArgs,
  inspectArkCliAuthStatus,
} from './arkCliContract.mjs';

test('builds only the official Ark CLI version and read-only login probes', () => {
  assert.deepEqual(buildArkCliVersionArgs(), ['--version']);
  assert.deepEqual(buildArkCliAuthStatusArgs(), ['auth', 'status', '--format', 'json']);
});

test('requires an explicit logged_in true status and fails closed otherwise', () => {
  assert.deepEqual(inspectArkCliAuthStatus({ code: 0, stdout: '{"logged_in":true}' }), {
    authenticated: true,
    authenticationRequired: false,
    message: '{"logged_in":true}',
  });
  assert.deepEqual(inspectArkCliAuthStatus({ code: 0, stdout: '{"logged_in":false}' }), {
    authenticated: false,
    authenticationRequired: true,
    message: '{"logged_in":false}',
  });
  assert.deepEqual(inspectArkCliAuthStatus({ code: 0, stdout: 'status unavailable' }), {
    authenticated: false,
    authenticationRequired: false,
    message: 'status unavailable',
  });
  assert.deepEqual(inspectArkCliAuthStatus({ code: 1, stderr: '请先登录火山方舟' }), {
    authenticated: false,
    authenticationRequired: true,
    message: '请先登录火山方舟',
  });
  assert.deepEqual(inspectArkCliAuthStatus({ code: 1, stderr: 'upstream timed out' }), {
    authenticated: false,
    authenticationRequired: false,
    message: 'upstream timed out',
  });
});

test('redacts Ark credentials from bounded diagnostic text', () => {
  assert.equal(
    arkCliSafeMessage('api_key: secret-value AKLT1234567890123456'),
    'api_key: [REDACTED] [REDACTED_ACCESS_KEY]',
  );
  assert.equal(arkCliSafeMessage('', '登录检测失败。'), '登录检测失败。');
});
