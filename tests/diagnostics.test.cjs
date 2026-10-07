const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serviceError, networkError, redact } = require('../electron/diagnostics.cjs');
test('API errors include endpoint, status, reason and quota without exposing a key', () => {
  const error = serviceError(401, '/photos?client_id=private', 'Invalid key: test-secret', '0', 'test-secret');
  assert.match(error, /HTTP 401/); assert.match(error, /Invalid key/); assert.match(error, /剩余请求：0/);
  assert.ok(!error.includes('test-secret')); assert.ok(!error.includes('private'));
});
test('network diagnostics distinguish timeout and connection failure', () => {
  assert.match(networkError({ name: 'TimeoutError', message: 'Timed out' }, '/photos'), /请求超时/);
  assert.match(networkError({ message: 'fetch failed', cause: { code: 'ENOTFOUND', message: 'DNS lookup failed' } }, '/photos'), /ENOTFOUND/);
  assert.ok(!redact('Client-ID secret').includes('secret'));
});
