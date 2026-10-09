const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');

function harness(fetchResponse) {
  const entry = path.resolve(__dirname, '../electron/main.cjs'), realRequire = createRequire(entry);
  const windows = [], trays = [], handlers = new Map();
  const area = { x: -1200, y: 0, width: 1200, height: 800 };
  class Window extends EventEmitter {
    constructor(options = {}) { super(); this.options = options; this.visible = false; this.destroyed = false; this.webContents = new EventEmitter(); this.webContents.mainFrame = {}; this.webContents.sent = []; this.webContents.send = (...args) => this.webContents.sent.push(args); this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; }; windows.push(this); }
    isVisible() { return this.visible; } isDestroyed() { return this.destroyed; }
    show() { this.visible = true; } hide() { this.visible = false; } focus() {}
    async loadFile(file, options) { this.file = file; this.hash = options.hash; }
    setBounds(bounds) { this.bounds = bounds; }
    destroy() { this.destroyed = true; this.visible = false; this.emit('closed'); }
  }
  class Tray extends EventEmitter {
    constructor() { super(); trays.push(this); }
    getBounds() { return { x: -20, y: 0, width: 20, height: 24 }; }
    setToolTip() {} setTitle() {} destroy() {}
    popUpContextMenu(menu) { this.menu = menu; }
  }
  const electron = {
    app: { getPath: () => '/tmp/scenelet-tray-test', setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
    protocol: { registerSchemesAsPrivileged() {} },
    BrowserWindow: Window, Tray, Menu: { buildFromTemplate: value => value },
    nativeImage: { createEmpty: () => ({ addRepresentation() {}, setTemplateImage() {} }) },
    screen: { getDisplayMatching: () => ({ workArea: area }), getAllDisplays: () => [] },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  };
  const context = { fetch: fetchResponse, AbortSignal, require: name => name === 'electron' ? electron : realRequire(name), process: { ...process, platform: 'darwin' }, console, Buffer, URL, __dirname: path.dirname(entry), module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(fs.readFileSync(entry, 'utf8') + `
    module.exports = {
      initialize() { win = new BrowserWindow(); registerIPC(); syncTray(); },
      seedOnline(source) { key = 'fixture-key'; state.settings = { ...core.defaults, rotationSource: 'online', onlineSource: source, orientation: 'landscape' }; },
      closeMain(event, minimize) { state.settings.minimizeToTray = minimize; handleMainClose(event); },
      toggleTrayWindow, getMain: () => win, getTray: () => trayWindow,
    };`, context);
  const api = context.module.exports; api.initialize();
  return { api, windows, tray: trays[0], area, invoke: (window, channel, input, frame = window.webContents.mainFrame) => handlers.get('framewall:' + channel)({ sender: window.webContents, senderFrame: frame }, input) };
}

test('left click opens a reusable picker within the work area; right click retains the command menu', async () => {
  const h = harness(); h.tray.emit('click'); await new Promise(resolve => setImmediate(resolve));
  const popup = h.api.getTray();
  assert.equal(popup.isVisible(), true);
  assert.equal(popup.hash, 'tray');
  assert.ok(popup.bounds.x >= h.area.x && popup.bounds.x + popup.bounds.width <= h.area.x + h.area.width);
  assert.ok(popup.bounds.y >= h.area.y && popup.bounds.y + popup.bounds.height <= h.area.height);
  popup.emit('blur'); assert.equal(popup.isVisible(), false);
  h.tray.emit('click'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.api.getTray(), popup);
  assert.equal(h.windows.length, 2);
  h.tray.emit('right-click');
  assert.equal(popup.isVisible(), false);
  assert.ok(h.tray.menu.some(item => item.type === 'checkbox'), 'rotation commands remain available');
  assert.equal(popup.openHandler().action, 'deny');
  let blocked = false; popup.webContents.emit('will-navigate', { preventDefault() { blocked = true; } });
  assert.equal(blocked, true);
});

test('IPC accepts the picker main frame and rejects unknown windows and subframes', async () => {
  const h = harness(); await h.api.toggleTrayWindow(); const popup = h.api.getTray();
  assert.equal((await h.invoke(popup, 'bootstrap')).desktop, true);
  const first = await h.invoke(popup, 'batch');
  assert.deepEqual(await h.invoke(h.api.getMain(), 'batch'), first);
  await assert.rejects(h.invoke(popup, 'bootstrap', undefined, {}));
  await assert.rejects(h.invoke({ webContents: { mainFrame: {} } }, 'bootstrap'));
});

test('closing the main window destroys the hidden picker when minimize-to-tray is off', async () => {
  const h = harness(); await h.api.toggleTrayWindow(); const popup = h.api.getTray(); popup.hide();
  let prevented = false;
  h.api.closeMain({ preventDefault() { prevented = true; } }, false);
  assert.equal(prevented, false);
  assert.equal(popup.isDestroyed(), true);
});

test('closing to tray preserves both windows for later reopening', async () => {
  const h = harness(); await h.api.toggleTrayWindow();
  let prevented = false;
  h.api.closeMain({ preventDefault() { prevented = true; } }, true);
  assert.equal(prevented, true);
  assert.equal(h.api.getTray().isDestroyed(), false);
  assert.equal(h.api.getMain().isVisible(), false);
});


test('Home and tray share scoped random batches, resolving topic slugs once and refreshing explicitly', async () => {
  const requests = []; let sample = 0;
  const h = harness(async url => {
    requests.push(new URL(url));
    if (url.pathname === '/topics/nature') return new Response(JSON.stringify({ id: 'resolved-topic' }));
    assert.equal(url.pathname, '/photos/random');
    assert.equal(url.searchParams.get('topics'), 'resolved-topic');
    assert.equal(url.searchParams.has('page'), false);
    sample++;
    return new Response(JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: `sample${sample}-${i}`, width: 4000, height: 2000, alt_description: 'Test', urls: { small: 'https://images.unsplash.com/p', regular: 'https://images.unsplash.com/p', raw: 'https://images.unsplash.com/p' }, user: { name: 'Author', username: 'author', links: { html: 'https://unsplash.com/@author' } }, links: { html: 'https://unsplash.com/photos/p', download_location: 'https://api.unsplash.com/photos/p/download' } }))));
  });
  h.api.seedOnline({ kind: 'topic', value: 'nature', name: '' });
  const home = await h.invoke(h.api.getMain(), 'batch');
  await h.api.toggleTrayWindow();
  const popup = h.api.getTray();
  assert.deepEqual(await h.invoke(popup, 'batch'), home);
  assert.equal(requests.length, 2, 'opening another surface reuses the batch');
  const refreshed = await h.invoke(popup, 'batch', { refresh: true });
  assert.equal(requests.length, 3, 'topic resolution is cached; refresh makes one new random sample');
  assert.ok(refreshed.photos.every(p => p.id.startsWith('sample2-')));
  assert.deepEqual(await h.invoke(h.api.getMain(), 'batch'), refreshed);
});
