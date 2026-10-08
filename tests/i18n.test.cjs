const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../electron/i18n.cjs');
const { normalizeSettings } = require('../electron/core.cjs');

const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

// The renderer dictionaries are TypeScript; key parity is enforced by the compiler, placeholders are checked here.
function readDictionary(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', file), 'utf8');
  const entries = {};
  for (const m of source.matchAll(/^\s*'([\w.]+)':\s*(['"`])((?:\\.|(?!\2).)*)\2,?\s*$/gm)) entries[m[1]] = m[3];
  return entries;
}

test('main-process dictionaries have the same keys and placeholders', () => {
  const { zh, en } = i18n.messages;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of Object.keys(zh)) assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), key);
});

test('renderer dictionaries have the same keys and placeholders', () => {
  const zh = readDictionary('zh.ts'), en = readDictionary('en.ts');
  assert.ok(Object.keys(zh).length > 100);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of Object.keys(zh)) assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), key);
});

test('system languages resolve to Chinese or English', () => {
  assert.equal(i18n.resolve(['zh-Hans-CN', 'en-US']), 'zh');
  assert.equal(i18n.resolve(['zh-TW']), 'zh');
  assert.equal(i18n.resolve(['en-GB', 'zh-CN']), 'en');
  assert.equal(i18n.resolve(['fr-FR', 'ja-JP']), 'en');
  assert.equal(i18n.resolve(['fr-FR', 'zh-CN']), 'zh');
  assert.equal(i18n.resolve([]), 'en');
});

test('t interpolates, switches language and falls back safely', () => {
  try {
    i18n.setLanguage('en');
    assert.equal(i18n.t('retry.connect', { seconds: 2, retry: 1, total: 3 }), 'Connection failed, retrying in 2s (1/3)…');
    assert.equal(i18n.t('no.such.key'), 'no.such.key');
    assert.equal(i18n.setLanguage('fr'), 'en');
    i18n.setLanguage('zh');
    assert.equal(i18n.t('tray.current', { title: 'A' }), '当前：A');
  } finally { i18n.setLanguage('zh'); }
});

test('language setting is normalized', () => {
  assert.equal(normalizeSettings({}).language, 'system');
  assert.equal(normalizeSettings({ language: 'en' }).language, 'en');
  assert.equal(normalizeSettings({ language: 'zh' }).language, 'zh');
  assert.equal(normalizeSettings({ language: 'fr' }).language, 'system');
});
