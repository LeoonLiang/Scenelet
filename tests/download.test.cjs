const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { downloadFile, parseContentRange } = require('../electron/download.cjs');

const noWait = async () => {};
const payload = Buffer.alloc(256 * 1024);
for (let i = 0; i < payload.length; i++) payload[i] = i % 251;

async function target(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-download-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'photo.jpg.part');
}
function rangeResponse(body, start, end, total) {
  return new Response(body, { status: 206, headers: {
    'content-type': 'image/jpeg',
    'content-length': String(body.length),
    'content-range': `bytes ${start}-${end}/${total}`,
    'accept-ranges': 'bytes',
  } });
}
function imageResponse(body) {
  return new Response(body, { status: 200, headers: {
    'content-type': 'image/jpeg',
    'content-length': String(body.length),
    'accept-ranges': 'bytes',
  } });
}
function rangeFetch(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const header = init.headers?.Range || init.headers?.range || '';
    calls.push(header);
    if (options.delay) await sleep(options.delay);
    if (options.fail?.(header, calls)) throw Object.assign(new Error('socket hang up'), { cause: { code: 'ECONNRESET' } });
    if (!header || options.ignoreRange) return imageResponse(options.body || payload);
    const match = /^bytes=(\d+)-(\d+)$/.exec(header);
    const body = options.body || payload;
    const start = Number(match[1]), end = Math.min(Number(match[2]), body.length - 1);
    return rangeResponse(body.subarray(start, end + 1), start, end, body.length);
  };
  return { fetchImpl, calls };
}
async function download(t, fetchImpl, overrides = {}) {
  const file = await target(t);
  const progress = [];
  const result = await downloadFile('https://images.unsplash.com/photo', file, {
    fetchImpl,
    retryWait: noWait,
    minSegmentedBytes: 32 * 1024,
    segments: 4,
    onProgress: value => progress.push(value),
    ...overrides,
  });
  return { file, result, progress };
}

test('large images are split into parallel byte ranges and reassembled exactly', async t => {
  let active = 0, peak = 0;
  const ranged = rangeFetch({ delay: 10 });
  const fetchImpl = async (url, init) => {
    active++; peak = Math.max(peak, active);
    try { return await ranged.fetchImpl(url, init); } finally { active--; }
  };
  const { file, result, progress } = await download(t, fetchImpl);
  assert.deepEqual(await fs.readFile(file), payload);
  assert.equal(result.segmented, true);
  assert.equal(result.bytes, payload.length);
  assert.ok(peak > 1, `expected parallel ranges, saw ${peak}`);
  assert.ok(ranged.calls.length > 1);
  assert.equal(progress.at(-1).received, payload.length);
  assert.equal(progress.at(-1).total, payload.length);
});

test('small images skip segmentation and download in one stream', async t => {
  const body = payload.subarray(0, 16 * 1024);
  const ranged = rangeFetch({ body });
  const { file, result } = await download(t, ranged.fetchImpl, { body });
  assert.deepEqual(await fs.readFile(file), body);
  assert.equal(result.segmented, false);
  assert.deepEqual(ranged.calls, ['']);
});

test('servers that ignore Range fall back to one stream without failing', async t => {
  const ranged = rangeFetch({ ignoreRange: true });
  const { file, result } = await download(t, ranged.fetchImpl);
  assert.deepEqual(await fs.readFile(file), payload);
  assert.equal(result.segmented, false);
  assert.equal(ranged.calls.filter(header => !header).length, 2);
});

test('a transient range failure retries only that range', async t => {
  const failed = new Set();
  const ranged = rangeFetch({ fail: header => header.startsWith('bytes=65536-') && !failed.has(header) && failed.add(header) });
  const { file, result } = await download(t, ranged.fetchImpl);
  assert.deepEqual(await fs.readFile(file), payload);
  assert.equal(result.bytes, payload.length);
  const retried = [...failed][0];
  assert.equal(ranged.calls.filter(header => header === retried).length, 2);
});

test('a rate-limited range is retried instead of failing the image', async t => {
  const limited = new Set();
  const ranged = rangeFetch();
  const fetchImpl = async (url, init = {}) => {
    const header = init.headers?.Range || '';
    if (header && !limited.has(header)) {
      limited.add(header);
      ranged.calls.push(header);
      return new Response(null, { status: 429 });
    }
    return ranged.fetchImpl(url, init);
  };
  const { file, result } = await download(t, fetchImpl, { segments: 4 });
  assert.deepEqual(await fs.readFile(file), payload);
  assert.equal(result.segmented, true);
  const retried = [...limited][0];
  assert.equal(ranged.calls.filter(header => header === retried).length, 2);
});

test('medium images open one chunk per 64 KiB rather than every allowed connection', async t => {
  const ranged = rangeFetch();
  const { result } = await download(t, ranged.fetchImpl, { segments: 16 });
  assert.equal(result.segmented, true);
  assert.equal(ranged.calls.filter(Boolean).length, 4);
});

test('oversized images are rejected before writing', async t => {
  const file = await target(t);
  const ranged = rangeFetch();
  await assert.rejects(downloadFile('https://images.unsplash.com/photo', file, {
    fetchImpl: ranged.fetchImpl, retryWait: noWait, maxBytes: 1024, minSegmentedBytes: 512,
  }), error => error.code === 'too-large');
  await assert.rejects(fs.access(file));
});

test('a truncated range body fails instead of committing a partial image', async t => {
  const file = await target(t);
  const truncated = async (url, init = {}) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(init.headers?.Range || '');
    if (!match) return imageResponse(payload);
    const start = Number(match[1]), end = Math.min(Number(match[2]), payload.length - 1);
    const body = payload.subarray(start, start + Math.floor((end - start) / 2));
    return rangeResponse(body, start, end, payload.length);
  };
  await assert.rejects(downloadFile('https://images.unsplash.com/photo', file, {
    fetchImpl: truncated, retryWait: noWait, minSegmentedBytes: 32 * 1024, segments: 4,
  }));
  await assert.rejects(fs.access(file));
});

test('cancelling a change aborts open ranges and removes the partial file', async t => {
  const file = await target(t), controller = new AbortController();
  let calls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (calls++ === 0) return imageResponse(payload);
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  };
  setTimeout(() => controller.abort(new Error('cancelled')), 20);
  await assert.rejects(downloadFile('https://images.unsplash.com/photo', file, {
    fetchImpl, signal: controller.signal, retryWait: noWait, minSegmentedBytes: 32 * 1024, segments: 4,
  }));
  await assert.rejects(fs.access(file));
});

test('images without a content-length still finish as a single stream', async t => {
  const fetchImpl = async () => new Response(payload, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const { file, result } = await download(t, fetchImpl);
  assert.deepEqual(await fs.readFile(file), payload);
  assert.equal(result.segmented, false);
  assert.equal(result.bytes, payload.length);
});

test('content-range headers are parsed strictly', () => {
  assert.deepEqual(parseContentRange('bytes 0-99/1000'), { start: 0, end: 99, total: 1000 });
  for (const value of ['', 'bytes 0-99/*', 'bytes 99-0/1000', 'bytes 0-1000/1000', 'bytes 0-99']) assert.equal(parseContentRange(value), null);
});
