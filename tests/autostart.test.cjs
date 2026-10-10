const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');

// Run the real main-process startup and settings handlers with OS APIs isolated.
async function boot(t, { platform = 'win32', argv = [], login = {}, settings = {}, packaged = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-startup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'library.json'), JSON.stringify({ photos: [], favorites: [], settings }));
  const entry = path.resolve(__dirname, '../electron/main.cjs'), realRequire = createRequire(entry);
  const windows = [], trays = [], registrations = [], errors = [];
  const app = Object.assign(new EventEmitter(), {
    isPackaged: packaged, getPath: () => dir, setPath() {}, setAppUserModelId() {},
    requestSingleInstanceLock: () => true, getPreferredSystemLanguages: () => ['en'],
    getLoginItemSettings: () => ({ openAtLogin: false, wasOpenedAtLogin: false, executableWillLaunchAtLogin: false, ...login }),
    setLoginItemSettings: value => registrations.push(JSON.parse(JSON.stringify(value))),
    whenReady: () => ({ then(fn) { app.ready = Promise.resolve().then(fn); return app.ready; } }),
    dock: { visible: true, hide() { this.visible = false; }, async show() { this.visible = true; } },
    quit() {}, exit() {},
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.visible = options.show !== false;
      this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, send() {}, setWindowOpenHandler() {} });
      windows.push(this);
    }
    async loadFile() { app.emit('activate'); }
    async loadURL() { app.emit('activate'); }
    isDestroyed() { return false; } isVisible() { return this.visible; } isMinimized() { return false; }
    show() { this.visible = true; } hide() { this.visible = false; } focus() {}
  }
  class Tray extends EventEmitter {
    constructor() { super(); trays.push(this); this.destroyed = false; }
    setToolTip() {} setTitle() {} destroy() { this.destroyed = true; }
    popUpContextMenu(menu) { this.menu = menu; }
  }
  const electron = {
    app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: value => value },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    safeStorage: { isEncryptionAvailable: () => false }, powerMonitor: new EventEmitter(),
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => [] }),
    ipcMain: { handle() {} }, dialog: { showErrorBox: (...args) => errors.push(args) },
    nativeImage: { createEmpty: () => ({ addRepresentation() {}, setTemplateImage() {} }) },
  };
  const context = {
    require(name) {
      if (name === 'electron') return electron;
      if (name === './updater.cjs') return () => ({ start() {}, stop() {}, refresh() {} });
      return realRequire(name);
    },
    process: { ...process, platform, argv: ['Scenelet', ...argv] }, console, Buffer, URL,
    __dirname: path.dirname(entry), module: { exports: {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  };
  vm.runInNewContext(await fs.readFile(entry, 'utf8') + '\nmodule.exports = { snapshot, saveSettings };', context, { filename: entry });
  await app.ready;
  assert.deepEqual(errors, [], 'startup completes without an error dialog');
  return { app, windows, trays, registrations, ...context.module.exports };
}

for (const platform of ['win32', 'darwin']) {
  test(`${platform}: login launch stays hidden through initial activation and can be opened from the tray`, async t => {
    const h = await boot(t, { platform, argv: platform === 'win32' ? ['--autostart'] : [], login: { wasOpenedAtLogin: platform === 'darwin' } });
    assert.equal(h.windows[0].options.show, false, 'never flash the main window');
    assert.equal(h.windows[0].isVisible(), false);
    assert.equal(h.trays.length, 1);
    if (platform === 'darwin') assert.equal(h.app.dock.visible, false);
    h.trays[0].emit('right-click');
    h.trays[0].menu.find(item => item.label === 'Open Scenelet').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.windows[0].isVisible(), true);
    if (platform === 'darwin') assert.equal(h.app.dock.visible, true);
  });

  test(`${platform}: manual launch opens the main window even with autostart enabled`, async t => {
    const h = await boot(t, { platform, settings: { autostart: true } });
    assert.equal(h.windows[0].options.show, true);
    assert.equal(h.windows[0].isVisible(), true);
  });

  test(`${platform}: login launch retains a temporary tray entry when the saved icon setting is off`, async t => {
    const h = await boot(t, { platform, argv: ['--autostart'], settings: { showTrayIcon: false } });
    assert.equal(h.windows[0].isVisible(), false);
    assert.equal(h.trays.length, 1);
    assert.equal(h.snapshot().settings.showTrayIcon, false, 'do not overwrite the preference');
    h.app.emit('second-instance', {}, ['Scenelet']);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.windows[0].isVisible(), true);
    assert.equal(h.trays[0].destroyed, true, 'restore the saved icon preference after opening');
  });

  test(`${platform}: enabling and disabling autostart registers the correct launch mode`, async t => {
    const h = await boot(t, { platform });
    await h.saveSettings({ ...h.snapshot().settings, autostart: true });
    await h.saveSettings({ ...h.snapshot().settings, autostart: false });
    assert.deepEqual(h.registrations, platform === 'win32'
      ? [{ openAtLogin: true, args: ['--autostart'] }, { openAtLogin: false, args: ['--autostart'] }]
      : [{ openAtLogin: true }, { openAtLogin: false }]);
  });
}

test('a second login-start instance does not reveal an already running app', async t => {
  const h = await boot(t, { argv: ['--autostart'] });
  h.app.emit('second-instance', {}, ['Scenelet', '--autostart']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.windows[0].isVisible(), false);
  h.app.emit('second-instance', {}, ['Scenelet']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.windows[0].isVisible(), true);
});

test('Windows upgrades the existing enabled login entry without re-enabling an OS-disabled entry', async t => {
  const enabled = await boot(t, { settings: { autostart: true }, login: { openAtLogin: true, executableWillLaunchAtLogin: true } });
  assert.deepEqual(enabled.registrations, [{ openAtLogin: true, args: ['--autostart'] }]);
  const disabled = await boot(t, { settings: { autostart: true }, login: { openAtLogin: true, executableWillLaunchAtLogin: false } });
  assert.deepEqual(disabled.registrations, []);
  const dev = await boot(t, { packaged: false, settings: { autostart: true }, login: { openAtLogin: true, executableWillLaunchAtLogin: true } });
  assert.deepEqual(dev.registrations, []);
});
