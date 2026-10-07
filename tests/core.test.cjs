const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchesPhoto, buildQuery, nextPhoto, imageUrl, apiUrl, normalizeSettings, fetchMatching, normalizeOnlineSource, buildRandomQuery, fetchRandomMatching } = require('../electron/core.cjs');

test('mixed author photos respect orientation and minimum resolution', () => {
  const photos = [{ id: 'wide', width: 4000, height: 2000 }, { id: 'portrait', width: 2000, height: 4000 }, { id: 'square', width: 3000, height: 3000 }, { id: 'small', width: 1280, height: 720 }];
  assert.deepEqual(photos.filter(p => matchesPhoto(p, { orientation: 'landscape', minWidth: 1920 })).map(p => p.id), ['wide']);
  assert.deepEqual(photos.filter(p => matchesPhoto(p, { orientation: 'portrait' })).map(p => p.id), ['portrait']);
  assert.deepEqual(photos.filter(p => matchesPhoto(p, { orientation: 'squarish' })).map(p => p.id), ['square']);
  assert.equal(matchesPhoto({ width: 8000, height: 12000 }, { orientation: 'landscape' }), false);
});
test('author and collection requests are paginated, not full-library requests', () => {
  const author = buildQuery({ kind: 'author', value: 'anniespratt', page: 3 });
  assert.equal(author.pathname, '/users/anniespratt/photos');
  assert.equal(author.searchParams.get('per_page'), '24');
  assert.equal(author.searchParams.get('page'), '3');
  assert.equal(buildQuery({ kind: 'collection', value: '1234' }).pathname, '/collections/1234/photos');
  const search = buildQuery({ kind: 'search', value: '森林 & ocean', orientation: 'portrait' });
  assert.equal(search.searchParams.get('query'), '森林 & ocean');
  assert.equal(search.searchParams.get('orientation'), 'portrait');
  assert.throws(() => buildQuery({ kind: 'author', value: '../me' }));
});
test('rotation does not repeat the current photo and handles empty lists', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextPhoto(pool, 'a', 'shuffle', () => 0).id, 'b');
  assert.equal(nextPhoto(pool, 'c', 'sequential').id, 'a');
  assert.equal(nextPhoto([{ id: 'a' }], 'a', 'shuffle').id, 'a');
  assert.throws(() => nextPhoto([], null, 'shuffle'), /轮换列表为空/);
});
test('credential-bearing requests and image downloads stay on official hosts', () => {
  assert.throws(() => apiUrl('https://api.unsplash.com.evil.example/photos'));
  assert.throws(() => apiUrl('http://api.unsplash.com/photos'));
  assert.throws(() => imageUrl('https://127.0.0.1/private'));
  assert.equal(imageUrl('https://images.unsplash.com/photo-example').hostname, 'images.unsplash.com');
});
test('settings reject arbitrary timers and keep explicit playlist scopes', () => {
  const s = normalizeSettings({ interval: -10, fit: 'bad', cacheLimit: -1, rotationSource: 'playlist:abc-123' });
  assert.equal(s.interval, 60); assert.equal(s.fit, 'fill'); assert.equal(s.cacheLimit, 1024); assert.equal(s.rotationSource, 'playlist:abc-123');
});
test('custom interval accepts integer minutes from one minute to seven days', () => {
  for (const value of [1, 7, 45, 65, 10080]) assert.equal(normalizeSettings({ interval: value }).interval, value);
  for (const value of [0, -1, 1.5, 10081, Infinity, 'invalid']) assert.equal(normalizeSettings({ interval: value }).interval, 60);
});
const apiPhoto = (id, width, height) => ({ id, width, height, alt_description: 'photo', urls: { small: 'https://images.unsplash.com/photo', regular: 'https://images.unsplash.com/photo', raw: 'https://images.unsplash.com/photo' }, user: { name: 'Author', username: 'author', links: { html: 'https://unsplash.com/@author' } }, links: { html: 'https://unsplash.com/photos/photo', download_location: 'https://api.unsplash.com/photos/photo/download' } });
test('sparse matching author pages stop after three requests and expose the next cursor', async () => {
  const pages = [];
  const result = await fetchMatching({ kind: 'author', value: 'author', page: 2, orientation: 'landscape' }, async url => {
    pages.push(Number(url.searchParams.get('page')));
    return { data: Array.from({ length: 24 }, (_, i) => apiPhoto(`p${i}`, 2000, 4000)), remaining: '47' };
  });
  assert.deepEqual(pages, [2, 3, 4]); assert.deepEqual(result.photos, []); assert.equal(result.nextPage, 5); assert.equal(result.hasMore, true);
});
test('end of a collection stops scans and preserves real dimensions', async () => {
  let calls = 0;
  const result = await fetchMatching({ kind: 'collection', value: '123', orientation: 'landscape', minWidth: 3840 }, async () => { calls++; return { data: [apiPhoto('portrait', 6000, 8000), apiPhoto('wide', 4000, 2000), apiPhoto('small', 1920, 1080)] }; });
  assert.equal(calls, 1); assert.deepEqual(result.photos.map(p => p.id), ['wide']); assert.equal(result.hasMore, false); assert.equal(result.photos[0].width, 4000);
});
test('online source accepts author and collection links but refuses mismatched and external links', () => {
  assert.equal(normalizeOnlineSource({ kind: 'author', value: 'https://unsplash.com/@author/photos' }).value, 'author');
  assert.equal(normalizeOnlineSource({ kind: 'collection', value: 'https://unsplash.com/collections/123/nature' }).value, '123');
  assert.equal(normalizeOnlineSource({ kind: 'topic', value: 'https://unsplash.com/t/nature' }).value, 'nature');
  assert.throws(() => normalizeOnlineSource({ kind: 'author', value: 'https://evil.example/@author' }));
  assert.throws(() => normalizeOnlineSource({ kind: 'author', value: 'https://unsplash.com/collections/123' }));
  assert.throws(() => normalizeOnlineSource({ kind: 'author', value: '' }));
});
test('random selection uses entire-source random endpoint with exactly the chosen scope', () => {
  for (const [kind, value, parameter] of [['author', 'author', 'username'], ['collection', '123', 'collections'], ['topic', 'topicID', 'topics'], ['search', 'forest & ocean', 'query']]) {
    const url = buildRandomQuery({ kind, value }, { orientation: 'landscape' });
    assert.equal(url.pathname, '/photos/random'); assert.equal(url.searchParams.get(parameter), value);
    assert.equal(url.searchParams.get('orientation'), 'landscape'); assert.equal(url.searchParams.has('page'), false);
    assert.equal([...url.searchParams.keys()].filter(k => ['username', 'collections', 'topics', 'query'].includes(k)).length, 1);
  }
  const settings = normalizeSettings({ rotationSource: 'online', order: 'sequential', onlineSource: { kind: 'author', value: '@author' } });
  assert.equal(settings.rotationSource, 'online'); assert.equal(settings.onlineSource.value, 'author'); assert.equal(settings.order, 'shuffle');
});
test('online random filters dimensions, author identity and recent repeats before choosing one photo', async () => {
  const otherAuthor = apiPhoto('wrong-author', 6000, 4000); otherAuthor.user.username = 'someone_else';
  const result = await fetchRandomMatching({ kind: 'author', value: 'author' }, { orientation: 'landscape', minWidth: 3840 }, async url => {
    assert.equal(url.pathname, '/photos/random');
    return { data: [apiPhoto('current', 6000, 4000), apiPhoto('recent', 6000, 4000), apiPhoto('small', 1920, 1080), apiPhoto('portrait', 6000, 8000), otherAuthor, apiPhoto('old-portfolio-photo', 6000, 4000)], remaining: '48' };
  }, 'current', ['recent'], () => 0);
  assert.equal(result.photo.id, 'old-portfolio-photo'); assert.equal(result.attempts, 1);
});
test('online random retries stay bounded and never fall back to unrelated photos', async () => {
  let calls = 0;
  await assert.rejects(() => fetchRandomMatching({ kind: 'author', value: 'author' }, { orientation: 'landscape' }, async () => { calls++; return { data: [apiPhoto('portrait', 2000, 4000)] }; }, null), /已保留原壁纸/);
  assert.equal(calls, 3);
});
test('small sources may reuse older history but never repeat the current photo', async () => {
  const result = await fetchRandomMatching({ kind: 'collection', value: '123' }, { orientation: 'landscape' }, async () => ({ data: [apiPhoto('current', 4000, 2000), apiPhoto('recent', 4000, 2000)] }), 'current', ['recent'], () => 0);
  assert.equal(result.photo.id, 'recent'); assert.equal(result.attempts, 3);
});
