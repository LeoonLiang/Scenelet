const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { setTimeout: sleep } = require('node:timers/promises');
const { createStallTimeout } = require('../electron/stall-timeout.cjs');

test('aborts after the interval without activity', async () => {
  const stall = createStallTimeout(30, 'Connection stalled');
  stall.touch();
  await once(stall.signal, 'abort');
  assert.equal(stall.aborted(), true);
  assert.equal(stall.signal.reason.name, 'TimeoutError');
  assert.equal(stall.signal.reason.message, 'Connection stalled');
});

test('each touch restarts the interval so ongoing traffic never times out', async () => {
  const stall = createStallTimeout(100, 'Connection stalled');
  stall.touch();
  for (let index = 0; index < 5; index++) { await sleep(25); stall.touch(); }
  assert.equal(stall.aborted(), false);
  await once(stall.signal, 'abort');
  assert.equal(stall.aborted(), true);
});

test('clearing prevents a pending timeout', async () => {
  const stall = createStallTimeout(30, 'Connection stalled');
  stall.touch();
  stall.clear();
  await sleep(80);
  assert.equal(stall.aborted(), false);
});
