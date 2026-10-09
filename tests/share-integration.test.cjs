const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { parseLibrary } = require('../electron/library-store.cjs');

async function harness(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-share-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const entry = path.resolve(__dirname, '../electron/main.cjs');
  const realRequire = createRequire(entry), handlers = new Map(), requests = [];
  let clipboard = '';
  const webContents = { mainFrame: {}, send() {} };
  const context = {
    require(name) {
      if (name === 'electron') return {
        app: { getPath: () => dir, setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
        protocol: { registerSchemesAsPrivileged() {} },
        screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ id: 1 }) },
        clipboard: { readText: () => clipboard, writeText: text => { clipboard = text; } },
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      };
      return realRequire(name);
    },
    process, console, Buffer, URL, Headers, Response, AbortSignal, __dirname: path.dirname(entry), module: { exports: {} },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    fetch: async url => {
      requests.push(String(url));
      return new Response(JSON.stringify({ id: 'Xy9-abc_DEf', width: 4000, height: 2500, description: 'Snow', urls: { small: 'https://images.unsplash.com/thumb', regular: 'https://images.unsplash.com/regular', raw: 'https://images.unsplash.com/raw' }, links: { html: 'https://unsplash.com/photos/Xy9-abc_DEf' }, user: { name: 'Ann', username: 'ann', links: { html: 'https://unsplash.com/@ann' } } }));
    },
    testWindow: { isDestroyed: () => false, webContents },
  };
  vm.runInNewContext(await fs.readFile(entry, 'utf8') + `
    module.exports = {
      initialize(dir) { win = testWindow; storePath = path.join(dir, 'library.json'); key = 'fixture-key'; state.settings = { ...core.defaults, rotationSource: 'library', orientation: 'all', minWidth: 0 }; registerIPC(); },
      snapshot, rotationPool, disconnectKey() { key = ''; },
    };`, context, { filename: entry });
  context.module.exports.initialize(dir);
  return { ...context.module.exports, dir, requests, clipboard: () => clipboard,
    call(name, data) { const handler = handlers.get('framewall:' + name); assert.ok(handler, `IPC ${name} must exist`); return handler({ sender: webContents, senderFrame: webContents.mainFrame }, data); } };
}

test('shared photo resolves exactly, imports durably without applying, and supports repeat import and removal', async t => {
  const h = await harness(t);
  const photo = await h.call('open-shared', { text: 'https://unsplash.com/photos/a-snowy-mountain-Xy9-abc_DEf' });
  assert.equal(photo.id, 'Xy9-abc_DEf');
  assert.equal(h.requests[0], 'https://api.unsplash.com/photos/Xy9-abc_DEf');
  assert.equal(h.snapshot().photos.length, 0, 'preview must not import');
  await h.call('share', { id: photo.id });
  const received = await h.call('open-shared', { text: h.clipboard() });
  assert.equal(received.id, photo.id);
  const saved = await h.call('import-shared', { id: received.id });
  assert.equal(saved.photos.length, 1);
  assert.equal(saved.photos[0].source, 'unsplash');
  assert.equal(saved.photos[0].imported, true);
  assert.equal(saved.current, null, 'import must not change wallpaper');
  assert.equal(h.rotationPool()[0].id, 'Xy9-abc_DEf');
  await h.call('import-shared', { id: received.id });
  const disk = parseLibrary(await fs.readFile(path.join(h.dir, 'library.json'), 'utf8'));
  assert.equal(disk.photos.length, 1);
  assert.equal(disk.photos[0].imported, true);
  await h.call('open-shared', { text: h.clipboard() });
  await h.call('remove-photo', { id: received.id });
  assert.equal(h.snapshot().photos.length, 0);
});

test('invalid links and missing credentials leave the library unchanged', async t => {
  const h = await harness(t);
  await assert.rejects(h.call('open-shared', { text: 'https://notunsplash.com/photos/Xy9-abc_DEf' }));
  assert.equal(h.requests.length, 0);
  h.disconnectKey();
  await assert.rejects(h.call('open-shared', { text: 'https://unsplash.com/photos/Xy9-abc_DEf' }));
  assert.equal(h.requests.length, 0);
  assert.equal(h.snapshot().photos.length, 0);
});
