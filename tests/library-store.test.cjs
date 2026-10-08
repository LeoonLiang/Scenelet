const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadLibrary, writeLibrary, parseLibrary } = require('../electron/library-store.cjs');
const { deadline, rotationKey, screenQuality } = require('../electron/rotation-clock.cjs');
const { defaults, normalizeSettings } = require('../electron/core.cjs');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'library.json');
}
const data = name => ({ photos: [{ id: name, source: 'local', localPath: `/photos/${name}.jpg` }], favorites: [name], settings: { ...defaults } });

test('damaged primary recovers prior valid library without overwriting the backup', async t => {
  const file = await fixture(t);
  await writeLibrary(file, JSON.stringify(data('first')));
  await writeLibrary(file, JSON.stringify(data('second')));
  await fs.writeFile(file, '{broken');
  const restored = await loadLibrary(file);
  assert.equal(restored.recovery, 'backup');
  assert.equal(restored.data.photos[0].id, 'first');
  await writeLibrary(file, JSON.stringify(restored.data));
  assert.equal(parseLibrary(await fs.readFile(file + '.bak', 'utf8')).photos[0].id, 'first');
});

test('unrecoverable data is preserved rather than overwritten silently', async t => {
  const file = await fixture(t);
  await fs.writeFile(file, '{broken');
  const restored = await loadLibrary(file);
  assert.equal(restored.recovery, 'unavailable');
  const copy = (await fs.readdir(path.dirname(file))).find(name => name.includes('.corrupt-'));
  assert.equal(await fs.readFile(path.join(path.dirname(file), copy), 'utf8'), '{broken');
  assert.throws(() => parseLibrary('{"photos":{},"settings":{}}'));
});

test('rotation deadline survives unrelated settings, restart and elapsed sleep', () => {
  const settings = { ...defaults, rotation: true };
  assert.equal(rotationKey(settings), rotationKey({ ...settings, language: 'en', quality: 'auto', fit: 'center', cacheLimit: 512 }));
  assert.notEqual(rotationKey(settings), rotationKey({ ...settings, interval: 15 }));
  assert.notEqual(rotationKey(settings), rotationKey({ ...settings, minWidth: 1920 }));
  assert.equal(deadline(settings, 5000, 10000), 5000);
  assert.equal(deadline(settings, null, 10000), 3610000);
  assert.equal(deadline({ ...settings, rotation: false }, 5000), null);
});

test('automatic download size uses physical pixels including high-DPI displays', () => {
  assert.equal(normalizeSettings({ quality: 'auto' }).quality, 'auto');
  assert.equal(screenQuality([{ size: { width: 1920 }, scaleFactor: 2 }]), '3840');
  assert.equal(screenQuality([{ size: { width: 2560 }, scaleFactor: 2 }]), '5120');
  assert.equal(screenQuality([{ size: { width: 1920 }, scaleFactor: 1 }, { size: { width: 2560 }, scaleFactor: 1 }]), '2560');
});
