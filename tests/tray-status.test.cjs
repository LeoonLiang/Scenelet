const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statusText, menuBarTitle, tooltip, percent, truncate, menuKey, spinner } = require('../electron/tray-status.cjs');

test('each change stage has a readable status line', () => {
  assert.equal(statusText(null), '');
  assert.equal(statusText({ stage: 'select' }), '正在选取照片…');
  assert.equal(statusText({ stage: 'download', received: 0, total: 0 }), '正在下载图片…');
  assert.equal(statusText({ stage: 'download', received: 450, total: 1000 }), '正在下载图片 45%…');
  assert.equal(statusText({ stage: 'download', received: 3 * 1048576, total: 0 }), '正在下载图片 3.0 MB…');
  assert.equal(statusText({ stage: 'apply' }), '正在设置壁纸…');
  assert.equal(statusText({ stage: 'download', note: '图片下载暂时失败，2 秒后重试（2/3）…' }), '图片下载暂时失败，2 秒后重试（2/3）…');
});
test('menu-bar title animates while changing and flashes the result', () => {
  assert.equal(menuBarTitle({ stage: 'select' }, 0), `${spinner[0]} 选图`);
  assert.equal(menuBarTitle({ stage: 'select' }, spinner.length + 1), `${spinner[1]} 选图`);
  assert.equal(menuBarTitle({ stage: 'download', received: 1, total: 4 }, 0), `${spinner[0]} 下载 25%`);
  assert.equal(menuBarTitle({ stage: 'download', note: '重试…', received: 1, total: 4 }, 0), `${spinner[0]} 重试中`);
  assert.equal(menuBarTitle(null, 0, 'ok'), '✓');
  assert.equal(menuBarTitle(null, 0, 'error'), '换图失败');
  assert.equal(menuBarTitle(null, 0, null), '');
});
test('tooltip carries progress or the last failure', () => {
  assert.equal(tooltip(null, { rotation: true }), '拾景 Scenelet · 自动轮换中');
  assert.equal(tooltip({ stage: 'apply' }), '拾景 Scenelet\n正在设置壁纸…');
  assert.equal(tooltip(null, { lastError: '图片下载失败。\nHTTP 503' }), '拾景 Scenelet\n上次换图失败：图片下载失败。');
});
test('percent, truncation and menu throttling', () => {
  assert.equal(percent({ received: 5, total: 0 }), null);
  assert.equal(percent({ received: 2000, total: 1000 }), 100);
  assert.equal(truncate('一二三四五', 4), '一二三…');
  assert.equal(truncate('short', 24), 'short');
  assert.equal(menuKey({ stage: 'download', received: 41, total: 100 }), menuKey({ stage: 'download', received: 49, total: 100 }));
  assert.notEqual(menuKey({ stage: 'download', received: 49, total: 100 }), menuKey({ stage: 'download', received: 50, total: 100 }));
  assert.notEqual(menuKey({ stage: 'select' }), menuKey({ stage: 'apply' }));
});
