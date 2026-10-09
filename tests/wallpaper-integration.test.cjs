const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const core = require('../electron/core.cjs');

// Exercise the actual main-process pipeline and real persistence. Replace only
// Electron, timers and OS process execution so the test cannot change wallpaper.
async function harness(t, failures = [2], lockGate) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-wallpaper-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'photo.jpg');
  await fs.writeFile(file, 'fixture');
  const entry = path.resolve(__dirname, '../electron/main.cjs');
  const realRequire = createRequire(entry);
  const events = [], notifications = [], calls = [], activeTimers = new Set();
  let signalLockStarted;
  const lockStarted = new Promise(resolve => { signalLockStarted = resolve; });
  let tooltip = '';
  class Notification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; }
    on() {}
    show() { notifications.push(this.options); }
  }
  const electron = {
    app: { getPath: () => dir, setPath() {}, requestSingleInstanceLock: () => false, quit() {}, getPreferredSystemLanguages: () => ['zh'] },
    protocol: { registerSchemesAsPrivileged() {} },
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ id: 1 }) },
    Menu: { buildFromTemplate: value => value }, Notification,
  };
  const context = {
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:child_process') return { execFile(command, args, options, callback) {
        calls.push({ command, args, options });
        const failure = failures.includes(calls.length) ? Object.assign(new Error('Denied'), { stderr: 'Lock screen denied by policy' }) : null;
        if (calls.length === 2) {
          signalLockStarted();
          if (lockGate) { lockGate.then(() => callback(failure, '', '')); return; }
        }
        callback(failure, '', '');
      } };
      return realRequire(name);
    },
    process: { ...process, platform: 'win32', argv: ['electron', '.'] },
    console, Buffer, URL, __dirname: path.dirname(entry), module: { exports: {} },
    setTimeout: () => 1, clearTimeout() {},
    setInterval(callback) { activeTimers.add(callback); return callback; },
    clearInterval(callback) { activeTimers.delete(callback); },
    testWindow: { isDestroyed: () => false, isVisible: () => false, isFocused: () => false, show() {}, focus() {}, webContents: { send: (...event) => events.push(event) } },
    testTray: { setToolTip(value) { tooltip = value; }, setContextMenu() {} },
  };
  const source = await fs.readFile(entry, 'utf8');
  vm.runInNewContext(source + `
    module.exports = {
      async initialize(dir, file) {
        storePath = path.join(dir, 'library.json'); cachePath = path.join(dir, 'wallpapers');
        await fs.mkdir(cachePath);
        state = { photos: [{ id: 'local-a', source: 'local', localPath: file, width: 4000, height: 2000, title: 'Test photo', author: 'Me' }], favorites: [], playlists: [], history: [], current: null,
          settings: { ...core.defaults, rotationSource: 'library', rotation: true } };
        known.set('local-a', state.photos[0]); win = testWindow; tray = testTray;
        schedule();
      },
      manual: () => tracked('window', () => apply('local-a')),
      next, saveSettings, snapshot, rotationTick, previousWallpaper, removePhoto,
      menu: () => trayMenu,
      expire() { state.nextRotationAt = Date.now() - 1000; },
      add(photo) { state.photos.push(photo); known.set(photo.id, photo); },
      applyPhoto: id => tracked('window', () => apply(id)),
    };`, context, { filename: entry });
  const api = context.module.exports;
  await api.initialize(dir, file);
  return { ...api, dir, calls, events, notifications, activeTimers, lockStarted, getMenu: () => api.menu(), getTooltip: () => tooltip };
}

for (const origin of ['manual', 'tray', 'auto']) test(`${origin}: lock-screen failure still commits desktop/history and keeps rotation active`, async t => {
  const h = await harness(t);
  const result = origin === 'manual' ? await h.manual() : await h.next(origin === 'auto', origin);
  assert.equal(h.calls.length, 2);
  assert.equal(result.current.id, 'local-a');
  assert.equal(result.history.length, 1);
  assert.equal(result.settings.rotation, true);
  assert.ok(result.lockScreenWarning.includes('policy'));
  assert.equal(result.error, undefined);
  assert.equal(h.activeTimers.size, 1);
  const saved = JSON.parse(await fs.readFile(path.join(h.dir, 'library.json'), 'utf8'));
  assert.equal(saved.current.id, 'local-a');
  assert.equal(saved.history.length, 1);
  assert.ok(h.events.some(([name, data]) => name === 'framewall:update' && data.lockScreenWarning));
  assert.ok(h.getTooltip().includes('锁屏'));
  assert.ok(h.getMenu().some(item => item.label?.includes('锁屏')));
  if (origin === 'tray' || origin === 'auto') assert.ok(h.notifications.some(n => n.title.includes('锁屏')));
  const recovered = await h.next(true);
  assert.equal(recovered.lockScreenWarning, '');
  assert.equal(recovered.history.length, 2);
});

test('desktop failure leaves current/history unchanged and never syncs lock screen', async t => {
  const h = await harness(t, [1]);
  await assert.rejects(h.manual(), /Denied/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.snapshot().current, null);
  assert.equal(h.snapshot().history.length, 0);
});

test('disabling sync clears the warning and persists the choice without applying an image', async t => {
  const h = await harness(t);
  const applied = await h.manual();
  const saved = await h.saveSettings({ ...applied.settings, syncLockScreen: false, lockScreenPrompt: false });
  assert.equal(h.calls.length, 2);
  assert.equal(saved.lockScreenWarning, '');
  const disk = JSON.parse(await fs.readFile(path.join(h.dir, 'library.json'), 'utf8'));
  assert.equal(disk.settings.syncLockScreen, false);
  assert.equal(disk.settings.lockScreenPrompt, false);
  await h.next();
  assert.equal(h.calls.length, 3);
});

test('continuous automatic lock-screen failures notify once, then allow a new notice after recovery', async t => {
  const h = await harness(t, [2, 4, 8]);
  await h.next(true);
  await h.next(true);
  assert.equal(h.notifications.length, 1);
  await h.next(true);
  assert.equal(h.snapshot().lockScreenWarning, '');
  await h.next(true);
  assert.equal(h.notifications.length, 2);
  assert.equal(h.snapshot().settings.rotation, true);
});

test('desktop state is already on disk while optional lock-screen sync is still pending', async t => {
  let release;
  const lockGate = new Promise(resolve => { release = resolve; });
  const h = await harness(t, [], lockGate);
  let finished = false;
  const applying = h.manual().then(value => { finished = true; return value; });
  try {
    await h.lockStarted;
    assert.equal(finished, false);
    assert.equal(h.snapshot().current?.id, 'local-a');
    const saved = JSON.parse(await fs.readFile(path.join(h.dir, 'library.json'), 'utf8'));
    assert.equal(saved.current.id, 'local-a');
    assert.equal(saved.history.length, 1);
  } finally {
    release();
    await applying;
  }
});


test('unrelated saved settings preserve the existing next-rotation deadline', async t => {
  const h = await harness(t, []);
  const deadline = h.snapshot().nextRotationAt;
  await h.saveSettings({ ...h.snapshot().settings, language: 'en', quality: 'auto', fit: 'fit' });
  assert.equal(h.snapshot().nextRotationAt, deadline);
  await h.saveSettings({ ...h.snapshot().settings, interval: 15 });
  assert.ok(h.snapshot().nextRotationAt < deadline);
});

test('overdue wake and timer callbacks coalesce into a single wallpaper change', async t => {
  const h = await harness(t, []);
  h.expire();
  await Promise.all([h.rotationTick(), h.rotationTick()]);
  assert.equal(h.snapshot().history.length, 1);
  assert.ok(h.snapshot().nextRotationAt > Date.now());
  await h.rotationTick();
  assert.equal(h.snapshot().history.length, 1);
});

test('rotation skips missing local candidates and keeps the valid photo', async t => {
  const h = await harness(t, []);
  h.add({ id: 'missing', source: 'local', localPath: path.join(h.dir, 'missing.jpg'), width: 4000, height: 2000 });
  await h.next(true);
  assert.equal(h.snapshot().current.id, 'local-a');
  assert.equal(h.snapshot().photos.find(p => p.id === 'missing').missing, true);
});

test('previous walks backwards instead of toggling between two wallpapers', async t => {
  const h = await harness(t, []);
  for (const id of ['local-b', 'local-c']) h.add({ id, source: 'local', localPath: path.join(h.dir, 'photo.jpg'), width: 4000, height: 2000 });
  await h.applyPhoto('local-a'); await h.applyPhoto('local-b'); await h.applyPhoto('local-c');
  await h.previousWallpaper(); assert.equal(h.snapshot().current.id, 'local-b');
  await h.previousWallpaper(); assert.equal(h.snapshot().current.id, 'local-a');
});

test('removing a local entry preserves its original and pauses an empty rotation', async t => {
  const h = await harness(t, []);
  await h.manual();
  await h.removePhoto({ id: 'local-a' });
  await fs.access(path.join(h.dir, 'photo.jpg'));
  assert.equal(h.snapshot().photos.length, 0);
  assert.equal(h.snapshot().settings.rotation, false);
  assert.equal(h.snapshot().nextRotationAt, null);
});
