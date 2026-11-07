const fs = require('node:fs/promises');
const { createStallTimeout } = require('./stall-timeout.cjs');
const { withRetry } = require('./retry.cjs');

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
// Cross-border links often throttle a single connection; many ranges fill the pipe.
// Throughput scales with concurrency and saturates around sixteen connections in practice.
const DEFAULT_SEGMENT_BYTES = 128 * 1024;
const DEFAULT_MIN_CHUNK_BYTES = 64 * 1024;
const DEFAULT_SEGMENTS = 16;

function tooLarge() {
  return Object.assign(new Error('Image exceeds the size limit'), { code: 'too-large' });
}
// A truncated body is worth retrying; the connection may simply have dropped.
function incomplete() {
  return Object.assign(new Error('Download ended before the image was complete'), { code: 'incomplete', retryable: true });
}
function rangeUnsupported() {
  return Object.assign(new Error('Server ignored the byte range'), { rangeUnsupported: true });
}
function combine(signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return undefined;
  return active.length === 1 ? active[0] : AbortSignal.any(active);
}
function parseContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value || '').trim());
  if (!match) return null;
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)) return null;
  if (start > end || end >= total) return null;
  return { start, end, total };
}
function splitRanges(start, end, count) {
  const size = Math.ceil((end - start) / count), ranges = [];
  for (let offset = start; offset < end; offset += size) ranges.push({ start: offset, end: Math.min(end, offset + size) });
  return ranges;
}

async function open(url, headers, ctx) {
  const stall = createStallTimeout(ctx.stallMs, ctx.stallMessage);
  stall.touch();
  try {
    const response = await ctx.fetchImpl(url, { headers, signal: combine([ctx.signal, stall.signal]), redirect: 'error' });
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      const error = ctx.httpError(response.status);
      error.status = response.status;
      // A burst of parallel ranges can trip CDN rate limiting; retry only inside downloads.
      if (response.status === 429) error.retryable = true;
      throw error;
    }
    stall.touch();
    return { response, stall };
  } catch (error) {
    stall.clear();
    throw error;
  }
}
function openWithRetry(url, headers, ctx) {
  return withRetry(() => open(url, headers, ctx), {
    wait: ctx.retryWait,
    shouldContinue: () => !ctx.signal?.aborted,
    onRetry: ctx.onRetry,
  });
}

async function writeBody({ response, stall }, handle, chunk, ctx) {
  if (!response.body) throw incomplete();
  let offset = chunk.start;
  try {
    for await (const piece of response.body) {
      stall.touch();
      const length = piece.byteLength;
      if (offset + length > chunk.end) throw incomplete();
      await handle.write(piece, 0, length, offset);
      offset += length;
      chunk.done += length;
      if (ctx.maxBytes && ctx.received() > ctx.maxBytes) throw tooLarge();
      ctx.report();
    }
  } finally {
    stall.clear();
  }
  if (Number.isFinite(chunk.end) && offset !== chunk.end) throw incomplete();
}

async function fetchChunk(url, chunk, ctx) {
  let pending = chunk.initial;
  await withRetry(async () => {
    const attempt = pending || await open(url, { Range: `bytes=${chunk.start}-${chunk.end - 1}` }, ctx);
    pending = null;
    const { response, stall } = attempt;
    if (response.status === 200) { await response.body?.cancel(); stall.clear(); throw rangeUnsupported(); }
    if (response.status !== 206) {
      await response.body?.cancel();
      stall.clear();
      ctx.validate(response);
      throw rangeUnsupported();
    }
    const range = parseContentRange(response.headers.get('content-range'));
    if (!range || range.start !== chunk.start || range.end !== chunk.end - 1 || range.total !== ctx.total) {
      await response.body?.cancel();
      stall.clear();
      throw rangeUnsupported();
    }
    ctx.validate(response);
    chunk.done = 0;
    await writeBody(attempt, ctx.handle, chunk, ctx);
  }, {
    wait: ctx.retryWait,
    shouldContinue: () => !ctx.signal?.aborted,
    onRetry: ctx.onRetry,
  });
}

function streamChunks(chunks, ctx) {
  ctx.setChunks(chunks);
  ctx.report();
  return Promise.all(chunks.map(chunk => fetchChunk(ctx.url, chunk, ctx)));
}

async function streamSingle(attempt, target, ctx) {
  const total = Number(attempt.response.headers.get('content-length')) || 0;
  if (total > ctx.maxBytes) { await attempt.response.body?.cancel(); attempt.stall.clear(); throw tooLarge(); }
  ctx.validate(attempt.response);
  const chunk = { start: 0, end: total || Infinity, done: 0 };
  ctx.total = total;
  ctx.setChunks([chunk]);
  ctx.report();
  const handle = await fs.open(target, 'w');
  ctx.handle = handle;
  try {
    if (total) await handle.truncate(total);
    await writeBody(attempt, handle, chunk, ctx);
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(target, { force: true }).catch(() => {});
    throw error;
  }
  return { bytes: chunk.done, total: total || chunk.done, segmented: false };
}

async function downloadRanged(url, target, ctx) {
  // The first response doubles as the probe: headers reveal size and range support,
  // small files stream straight through, large ones cancel it and split into ranges.
  const first = await openWithRetry(url, {}, ctx);
  let handle;
  try {
    if (first.response.status !== 200) {
      await first.response.body?.cancel().catch(() => {});
      first.stall.clear();
      ctx.validate(first.response);
      throw rangeUnsupported();
    }
    ctx.validate(first.response);
    const length = Number(first.response.headers.get('content-length')) || 0;
    if (length > ctx.maxBytes) throw tooLarge();
    const supportsRanges = /bytes/i.test(first.response.headers.get('accept-ranges') || '');
    if (!length || !supportsRanges || length < ctx.minSegmentedBytes) return await streamSingle(first, target, ctx);
    await first.response.body?.cancel().catch(() => {});
    first.stall.clear();
    // Parallel requests cost a round trip each, so tiny images use fewer chunks.
    const chunks = splitRanges(0, length, Math.max(2, Math.min(ctx.segments, Math.floor(length / ctx.minChunkBytes)))).map(part => ({ ...part, done: 0 }));
    ctx.url = url;
    ctx.total = length;
    handle = await fs.open(target, 'w');
    ctx.handle = handle;
    await handle.truncate(length);
    await streamChunks(chunks, ctx);
    const received = ctx.received();
    if (received !== length) throw incomplete();
    await handle.close();
    return { bytes: length, total: length, segmented: true };
  } catch (error) {
    ctx.abort.abort(error);
    await first.response.body?.cancel().catch(() => {});
    first.stall.clear();
    if (handle) await handle.close().catch(() => {});
    await fs.rm(target, { force: true }).catch(() => {});
    throw error;
  }
}

async function downloadSingle(url, target, ctx) {
  const attempt = await openWithRetry(url, {}, ctx);
  try {
    return await streamSingle(attempt, target, ctx);
  } catch (error) {
    attempt.stall.clear();
    throw error;
  }
}

function createContext(settings) {
  const chunks = [];
  const abort = new AbortController();
  const ctx = {
    ...settings,
    abort,
    chunks,
    signal: combine([settings.signal, abort.signal]),
    handle: undefined,
    total: 0,
    setChunks: value => { chunks.length = 0; chunks.push(...value); },
    received: () => chunks.reduce((sum, chunk) => sum + chunk.done, 0),
    report: () => settings.onProgress({ received: ctx.received(), total: ctx.total || 0 }),
  };
  return ctx;
}

async function downloadFile(url, target, options = {}) {
  const settings = {
    signal: undefined,
    onProgress: () => {},
    onRetry: () => {},
    stallMs: 60000,
    stallMessage: 'Download stalled',
    fetchImpl: fetch,
    maxBytes: DEFAULT_MAX_BYTES,
    minSegmentedBytes: DEFAULT_SEGMENT_BYTES,
    minChunkBytes: DEFAULT_MIN_CHUNK_BYTES,
    segments: DEFAULT_SEGMENTS,
    validate: () => {},
    httpError: status => new Error(`HTTP ${status}`),
    retryWait: undefined,
    ...options,
  };
  try {
    return await downloadRanged(url, target, createContext(settings));
  } catch (error) {
    if (!error.rangeUnsupported) throw error;
    return downloadSingle(url, target, createContext(settings));
  }
}

module.exports = { downloadFile, parseContentRange, DEFAULT_MAX_BYTES, DEFAULT_SEGMENT_BYTES, DEFAULT_SEGMENTS };
