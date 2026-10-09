const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPhotoBatch, fetchRandomBatch } = require('../electron/photo-batch.cjs');
const settings = { rotationSource: 'online', onlineSource: { kind: 'search', value: 'forest' }, orientation: 'all', minWidth: 0 };
const photos = (prefix, count = 12) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, width: 2000, height: 1000 }));

test('cached reads and random selection preserve candidates; explicit refresh requests a fresh random batch', async () => {
  const requests = [];
  const batch = createPhotoBatch({ randomPhotos: async (input, recent) => { requests.push({ input, recent }); return { photos: photos('batch' + requests.length + '-') }; }, localPhotos: () => [] });
  const first = await batch.get(settings);
  assert.equal(first.photos.length, 12);
  assert.deepEqual((await batch.get({ ...settings, interval: 15 })).photos, first.photos);
  const selected = await batch.select(settings);
  assert.notEqual(selected.selectedId, first.selectedId);
  assert.deepEqual(selected.photos, first.photos);
  assert.equal(requests.length, 1);
  const refreshed = await batch.get(settings, true);
  assert.equal(refreshed.photos[0].id, 'batch2-0');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].recent, first.photos.map(p => p.id));
  assert.equal(requests[1].input.page, undefined, 'refresh has no paging cursor');
  assert.equal((await batch.get(settings)).selectedId, 'batch2-0');
});

test('concurrent reads share a request; stale sources cannot overwrite the active batch', async () => {
  let resolveOld, calls = 0; const published = [];
  const batch = createPhotoBatch({ randomPhotos: input => { calls++; return input.value === 'forest' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ photos: photos('new'), hasMore: false, nextPage: 2 }); }, localPhotos: () => [], publish: result => published.push(result) });
  const old = batch.get(settings), duplicate = batch.get(settings);
  const changed = { ...settings, onlineSource: { kind: 'search', value: 'ocean' } };
  await batch.get(changed);
  resolveOld({ photos: photos('old'), hasMore: false, nextPage: 2 });
  assert.ok((await Promise.allSettled([old, duplicate])).every(r => r.status === 'rejected'));
  assert.equal(calls, 2);
  assert.equal((await batch.get(changed)).photos[0].id, 'new0');
  assert.deepEqual(published.map(p => p.photos[0].id), ['new0']);
});

test('refresh errors preserve the old batch and allow retry', async () => {
  let fail = false, count = 0;
  const batch = createPhotoBatch({ randomPhotos: async () => { if (fail) throw new Error('offline'); return { photos: photos(`batch${++count}-`) }; }, localPhotos: () => [] });
  const first = await batch.get(settings); fail = true;
  await assert.rejects(batch.get(settings, true), /offline/);
  assert.deepEqual(await batch.get(settings), first);
  fail = false;
  assert.equal((await batch.get(settings, true)).photos[0].id, 'batch2-0');
});

test('local refresh avoids the old batch where possible and excludes missing or mismatched photos', async () => {
  const pool = [...photos('local', 30), { id: 'missing', width: 2000, height: 1000, missing: true }, { id: 'small', width: 500, height: 1000 }];
  const batch = createPhotoBatch({ localPhotos: () => pool, randomPhotos: () => { throw new Error('must stay local'); } });
  const local = { ...settings, rotationSource: 'library', minWidth: 1920 };
  const first = await batch.get(local), second = await batch.get(local, true);
  assert.equal(new Set(second.photos.map(p => p.id)).size, 12);
  assert.ok(second.photos.every(p => !first.photos.some(old => old.id === p.id)));
  assert.ok(second.photos.every(p => p.id.startsWith('local')));
  await assert.rejects(batch.select(local, 'outside-batch'), /selection/i);
});

test('an old A request or selection cannot replace a newer A after switching A to B to A', async () => {
  let resolveOld, count = 0;
  const batch = createPhotoBatch({ localPhotos: () => [], randomPhotos: () => ++count === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ photos: photos('new' + count), hasMore: false, nextPage: 2 }) });
  const oldSelection = batch.select(settings);
  await batch.get({ ...settings, onlineSource: { kind: 'search', value: 'ocean' } });
  const latest = await batch.get(settings);
  resolveOld({ photos: photos('old'), hasMore: false, nextPage: 2 });
  await assert.rejects(oldSelection, /source changed/i);
  assert.deepEqual(await batch.get(settings), latest);
});

test('newly populated local sources load and removed entries are reconciled without replacing valid candidates', async () => {
  let pool = [];
  const local = { ...settings, rotationSource: 'favorites' };
  const batch = createPhotoBatch({ localPhotos: () => pool, randomPhotos: () => { throw new Error('local'); } });
  assert.equal((await batch.get(local)).photos.length, 0);
  pool = photos('local', 3);
  const first = await batch.get(local);
  assert.equal(first.photos.length, 3);
  const removed = first.selectedId;
  pool = pool.filter(p => p.id !== removed);
  const next = await batch.get(local);
  assert.equal(next.photos.length, 2);
  assert.ok(next.photos.every(p => p.id !== removed));
  assert.deepEqual(next.photos.map(p => p.id), first.photos.filter(p => p.id !== removed).map(p => p.id));
});

const apiPhoto = (id, overrides = {}) => ({ id, width: 4000, height: 2000, alt_description: id, urls: { small: 'https://images.unsplash.com/photo', regular: 'https://images.unsplash.com/photo', raw: 'https://images.unsplash.com/photo' }, user: { name: 'Author', username: 'author', links: { html: 'https://unsplash.com/@author' } }, links: { html: 'https://unsplash.com/photos/' + id, download_location: 'https://api.unsplash.com/photos/' + id + '/download' }, ...overrides });

test('online batches sample the whole selected source through the random endpoint, never ordered pages', async () => {
  assert.equal(typeof fetchRandomBatch, 'function');
  for (const [kind, value, parameter] of [['author', 'author', 'username'], ['collection', '123', 'collections'], ['topic', 'topicID', 'topics'], ['search', 'forest', 'query'], ['discover', '', null]]) {
    let calls = 0;
    const result = await fetchRandomBatch({ kind, value }, settings, async url => {
      calls++;
      assert.equal(url.pathname, '/photos/random');
      assert.equal(url.searchParams.has('page'), false);
      assert.equal(url.searchParams.has('order_by'), false);
      if (parameter) assert.equal(url.searchParams.get(parameter), value);
      assert.equal([...url.searchParams.keys()].filter(k => ['username', 'collections', 'topics', 'query'].includes(k)).length, parameter ? 1 : 0);
      return { data: Array.from({ length: 30 }, (_, i) => apiPhoto('random-' + i)) };
    }, [], () => 0);
    assert.equal(calls, 1);
    assert.equal(result.photos.length, 12);
    assert.equal(new Set(result.photos.map(p => p.id)).size, 12);
    assert.notDeepEqual(result.photos.map(p => p.id), Array.from({ length: 12 }, (_, i) => 'random-' + i));
  }
});

test('random batches seek unseen images, enforce author/dimensions and deduplicate responses', async () => {
  assert.equal(typeof fetchRandomBatch, 'function');
  let calls = 0;
  const result = await fetchRandomBatch({ kind: 'author', value: 'author' }, { orientation: 'landscape', minWidth: 3840 }, async () => {
    calls++;
    return { data: calls === 1 ? [apiPhoto('seen'), apiPhoto('fresh'), apiPhoto('fresh'), apiPhoto('wrong', { user: { username: 'other' } }), apiPhoto('portrait', { height: 6000 }), apiPhoto('small', { width: 1280 })] : Array.from({ length: 12 }, (_, i) => apiPhoto('new-' + i)) };
  }, ['seen']);
  assert.equal(calls, 2);
  assert.equal(result.photos.length, 12);
  assert.equal(new Set(result.photos.map(p => p.id)).size, 12);
  assert.ok(result.photos.every(p => p.id === 'fresh' || p.id.startsWith('new-')));
});

test('tiny sources stop after bounded attempts and fall back to valid older images', async () => {
  assert.equal(typeof fetchRandomBatch, 'function');
  let calls = 0;
  const result = await fetchRandomBatch({ kind: 'collection', value: '123' }, settings, async () => { calls++; return { data: [apiPhoto('seen'), apiPhoto('seen')] }; }, ['seen']);
  assert.equal(calls, 3);
  assert.deepEqual(result.photos.map(p => p.id), ['seen']);
  await assert.rejects(fetchRandomBatch({ kind: 'author', value: 'author' }, { minWidth: 6000 }, async () => ({ data: [apiPhoto('too-small')] })));
});

test('local batches prefer photos beyond the last several batches when the pool is large', async () => {
  const pool = photos('local', 72), local = { ...settings, rotationSource: 'library' };
  const batch = createPhotoBatch({ localPhotos: () => pool });
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const result = await batch.get(local, i > 0);
    assert.ok(result.photos.every(p => !seen.has(p.id)), 'avoid previously displayed photos while unseen photos remain');
    result.photos.forEach(p => seen.add(p.id));
  }
  assert.equal(seen.size, 72);
});
