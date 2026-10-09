const { test } = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../electron/i18n.cjs');
const { shareText, parseShared } = require('../electron/share.cjs');
const { normalizeSettings, restoreSettings } = require('../electron/core.cjs');

test('share text carries a link that parses back to the same photo', () => {
  i18n.setLanguage('zh');
  const text = shareText({ id: 'a-B_c1d2E3f', source: 'unsplash', title: '  雪山\n日出 ', author: 'Ann Lee' });
  assert.match(text, /雪山 日出（摄影 Ann Lee）/);
  assert.match(text, /https:\/\/unsplash\.com\/photos\/a-B_c1d2E3f/);
  assert.equal(parseShared(text), 'a-B_c1d2E3f');
  i18n.setLanguage('en');
  assert.match(shareText({ id: 'abc', source: 'unsplash', title: '', author: '' }), /Untitled, photo by Unsplash/);
  i18n.setLanguage('zh');
});

test('long titles are shortened in the share text', () => {
  const text = shareText({ id: 'abc', source: 'unsplash', title: 'x'.repeat(200), author: 'A' });
  assert.ok(text.includes(`${'x'.repeat(59)}…`));
  assert.ok(!text.includes('x'.repeat(61)));
});

test('local and demo photos cannot be shared', () => {
  assert.throws(() => shareText({ id: 'abc', source: 'local', title: 'Mine' }));
  assert.throws(() => shareText({ id: 'abc', source: 'demo', title: 'Sample' }));
  assert.throws(() => shareText({ id: '../x', source: 'unsplash', title: 'Bad' }));
});

test('pasted Unsplash photo links in the common forms are recognised', () => {
  assert.equal(parseShared('https://unsplash.com/photos/Xy9-abc_DEf'), 'Xy9-abc_DEf');
  assert.equal(parseShared('看这张 https://unsplash.com/photos/a-snowy-mountain-under-blue-sky-Xy9-abc_DEf?utm_source=x 好看'), 'Xy9-abc_DEf');
  assert.equal(parseShared('unsplash.com/photos/Xy9abcDEf12'), 'Xy9abcDEf12');
  assert.equal(parseShared('看这张unsplash.com/photos/Xy9abcDEf12'), 'Xy9abcDEf12');
  assert.equal(parseShared('https://www.unsplash.com/photos/Xy9abcDEf12/'), 'Xy9abcDEf12');
  assert.equal(parseShared('https://unsplash.com/collections/123/mountains'), null);
  assert.equal(parseShared('https://notunsplash.com/photos/Xy9abcDEf12'), null);
  assert.equal(parseShared(''), null);
  assert.equal(parseShared(undefined), null);
});

test('old installs on the former 2560 px default move to automatic quality once', () => {
  assert.equal(restoreSettings({ quality: '2560' }).quality, 'auto');
  assert.equal(restoreSettings({ quality: '3840' }).quality, '3840', 'a non-default choice is kept');
  const saved = normalizeSettings({ quality: '2560' });
  assert.equal(saved.settingsRevision, 1);
  assert.equal(restoreSettings(saved).quality, '2560', 'a choice made after the migration is kept');
  assert.equal(restoreSettings({}).quality, 'auto');
});
