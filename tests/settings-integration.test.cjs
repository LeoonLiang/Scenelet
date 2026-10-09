const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const core = require('../electron/core.cjs');

async function harness(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-settings-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const entry = path.resolve(__dirname, '../electron/main.cjs'), realRequire = createRequire(entry);
  const handlers = new Map(), trays = [];
  const dialogs = { open: { canceled: true, filePaths: [] }, save: { canceled: true } };
  const window = { isDestroyed: () => false, webContents: { mainFrame: {}, send() {} } };
  const electron = {
    app: { getPath: name => name === 'downloads' ? path.join(dir, 'Downloads') : dir, setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
    protocol: { registerSchemesAsPrivileged() {} },
    screen: { getAllDisplays: () => [] },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: {
      showOpenDialog: async (_win, options) => { dialogs.openOptions = options; return dialogs.open; },
      showSaveDialog: async (_win, options) => { dialogs.saveOptions = options; return dialogs.save; },
    },
    nativeImage: { createEmpty: () => ({ addRepresentation() {}, setTemplateImage() {} }) },
    Menu: { buildFromTemplate: value => value },
    Tray: class {
      constructor() { this.destroyed = false; trays.push(this); }
      on() {} setToolTip() {} setTitle() {}
      setContextMenu(menu) { this.menu = menu; }
      destroy() { this.destroyed = true; }
    },
  };
  const context = { require: name => name === 'electron' ? electron : realRequire(name), process, console, Buffer, URL,
    __dirname: path.dirname(entry), module: { exports: {} }, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(await fs.readFile(entry, 'utf8') + `
    module.exports = {
      async initialize(directory, window) {
        win = window; storePath = path.join(directory, 'library.json'); cachePath = path.join(directory, 'cache');
        await fs.mkdir(cachePath);
        const file = path.join(directory, 'photo.png'); await fs.writeFile(file, 'original photo');
        known.set('local-test', { id: 'local-test', source: 'local', localPath: file }); registerIPC();
      },
      snapshot, saveSettings, sync: () => syncTray(),
      async reload() { state.settings = core.restoreSettings(JSON.parse(await fs.readFile(storePath, 'utf8')).settings); }
    };`, context, { filename: entry });
  const api = context.module.exports;
  await api.initialize(dir, window);
  return { ...api, dir, dialogs, trays, async invoke(name, input) {
    const handler = handlers.get('framewall:' + name);
    assert.ok(handler, `IPC handler ${name} is registered`);
    return handler({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, input);
  } };
}

test('downloads expose the system directory, persist a chosen directory and copy the original there', async t => {
  const h = await harness(t), downloads = path.join(h.dir, 'Downloads');
  assert.equal(h.snapshot().downloadDirectory, downloads);
  await h.invoke('download', { id: 'local-test' });
  assert.equal(h.dialogs.saveOptions.defaultPath, path.join(downloads, 'local-test.png'));
  const target = path.join(h.dir, '我的照片'); await fs.mkdir(target);
  h.dialogs.open = { canceled: false, filePaths: [target] };
  const result = await h.invoke('choose-download-directory');
  assert.equal(h.dialogs.openOptions.defaultPath, downloads);
  assert.equal(result.downloadDirectory, target);
  await h.saveSettings({ ...result.settings, fit: 'fit' }); await h.reload();
  assert.equal(h.snapshot().downloadDirectory, target);
  h.dialogs.save = { canceled: false, filePath: path.join(target, 'local-test.png') };
  await h.invoke('download', { id: 'local-test' });
  assert.equal(h.dialogs.saveOptions.defaultPath, path.join(target, 'local-test.png'));
  assert.equal(await fs.readFile(h.dialogs.save.filePath, 'utf8'), 'original photo');
  h.dialogs.open = { canceled: true, filePaths: [] };
  assert.equal((await h.invoke('choose-download-directory')).downloadDirectory, target);
});

test('tray visibility is immediate, idempotent, and restored from saved settings', async t => {
  const h = await harness(t);
  await h.saveSettings({ ...h.snapshot().settings, showTrayIcon: false });
  await h.reload(); h.sync();
  assert.equal(h.snapshot().settings.showTrayIcon, false);
  assert.equal(h.trays.length, 0, 'hidden on restart');
  await h.saveSettings({ ...h.snapshot().settings, showTrayIcon: true });
  assert.equal(h.trays.length, 1);
  // The menu is presented explicitly on right click so left click can open the picker.
  h.sync(); assert.equal(h.trays.length, 1);
  await h.saveSettings({ ...h.snapshot().settings, showTrayIcon: false });
  assert.equal(h.trays[0].destroyed, true);
  await h.saveSettings({ ...h.snapshot().settings, showTrayIcon: true });
  assert.equal(h.trays.length, 2);
});

test('old settings keep the tray visible and invalid download paths fall back to the system directory', () => {
  assert.equal(core.restoreSettings({}).showTrayIcon, true);
  for (const downloadDirectory of [null, 3, '../relative', 'bad\0path']) {
    assert.equal(core.normalizeSettings({ downloadDirectory }).downloadDirectory, '');
  }
});
