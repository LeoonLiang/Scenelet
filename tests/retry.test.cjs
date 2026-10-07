const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, isTransient } = require('../electron/retry.cjs');
test('connect timeout retries three times with bounded backoff and reports exhausted attempts', async () => {
  let calls = 0; const delays = [], progress = [];
  await assert.rejects(withRetry(async () => { calls++; throw Object.assign(new Error('connect timeout'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); }, { wait: async ms => delays.push(ms), onRetry: p => progress.push(p.retry) }), /已尝试 4 次/);
  assert.equal(calls, 4); assert.deepEqual(delays, [1000, 2000, 4000]); assert.deepEqual(progress, [1, 2, 3]);
});
test('transient server failure recovers and invalid key/quota/certificate do not retry', async () => {
  let calls = 0;
  assert.equal(await withRetry(async () => { if (++calls === 1) throw Object.assign(new Error('unavailable'), { status: 503 }); return 'ok'; }, { wait: async () => {} }), 'ok');
  for (const status of [401, 403, 404, 429]) { calls = 0; await assert.rejects(withRetry(async () => { calls++; throw Object.assign(new Error('fatal'), { status }); })); assert.equal(calls, 1); }
  assert.equal(isTransient({ cause: { code: 'CERT_HAS_EXPIRED' } }), false);
});
test('changing connection cancels a pending retry before another request', async () => {
  let active = true, calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }, { wait: async () => { active = false; }, shouldContinue: () => active }), /已取消/);
  assert.equal(calls, 1);
});
