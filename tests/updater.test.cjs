const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');

const source = path.resolve(__dirname, '../electron/updater.cjs');
const localRequire = createRequire(source);
function harness(t, { platform = 'darwin', packaged = true, disabled = false, missingAsset = false, corrupt = false, beforeReleaseReply = () => {}, openPath = async () => '', beforeInstall = async () => {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scenelet-updater-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('Scenelet package');
  const name = `Scenelet-0.7.0-${platform === 'darwin' ? 'macos-arm64-installer.dmg' : 'windows-arm64-portable.zip'}`;
  const asset = { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, browser_download_url: `https://github.com/LeoonLiang/Scenelet/releases/download/v0.7.0/${name}` };
  const states = [], opened = [], revealed = [], requests = [], installedCalls = [], lifecycle = [];
  const automatic = new EventEmitter();
  automatic.setFeedURL = options => { automatic.feed = options; };
  automatic.checkForUpdates = async () => { automatic.emit('update-available', { version: '0.7.0' }); };
  automatic.quitAndInstall = () => installedCalls.push('install');
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module: mod, process: { platform, arch: 'arm64' }, AbortSignal, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    require: name => name === 'electron-updater' ? { autoUpdater: automatic } : localRequire(name),
    fetch: async (url, options) => {
      options?.signal?.throwIfAborted();
      requests.push(url);
      if (url.includes('api.github.com')) beforeReleaseReply();
      options?.signal?.throwIfAborted();
      return url.includes('api.github.com')
        ? Response.json({ tag_name: 'v0.7.0', draft: false, prerelease: false, assets: missingAsset ? [] : [asset] })
        : new Response(corrupt ? Buffer.alloc(bytes.length) : bytes);
    },
  }, { filename: source });
  const updater = mod.exports({
    app: { isPackaged: packaged, getVersion: () => '0.6.0', getPath: () => directory, quit: () => lifecycle.push('quit') }, disabled,
    shell: { openPath: async file => { opened.push(file); const error = await openPath(file); lifecycle.push('opened'); return error; }, showItemInFolder: file => revealed.push(file) },
    notify: status => states.push(status), beforeInstall: async () => { installedCalls.push('prepare'); await beforeInstall(); lifecycle.push('prepared'); },
  });
  return { updater, automatic, states, opened, revealed, requests, installedCalls, lifecycle, directory, name };
}

test('unsigned Mac opens the verified DMG on request, prepares to exit, then quits', async t => {
  const h = harness(t);
  assert.equal(h.updater.get().mode, 'manual');
  await assert.rejects(h.updater.openDownloaded());
  const status = await h.updater.check();
  assert.equal(status.state, 'downloaded');
  assert.equal(status.percent, 100);
  assert.ok(h.states.some(status => status.state === 'downloading'));
  assert.equal(h.opened.length, 0);
  assert.deepEqual(h.lifecycle, []);
  assert.equal(h.requests.length, 2);
  await h.updater.openDownloaded();
  assert.equal(path.basename(h.opened[0]), h.name);
  assert.equal(fs.existsSync(h.opened[0]), true);
  await assert.rejects(h.updater.install());
  assert.deepEqual(h.installedCalls, ['prepare']);
  assert.deepEqual(h.lifecycle, ['opened', 'prepared', 'quit']);
});

test('Mac stays open when the installer cannot be opened', async t => {
  for (const openPath of [async () => 'Cannot open installer', async () => { throw new Error('Cannot open installer'); }]) {
    const h = harness(t, { openPath });
    await h.updater.check();
    await assert.rejects(h.updater.openDownloaded(), /Cannot open installer/);
    assert.deepEqual(h.installedCalls, []);
    assert.equal(h.lifecycle.includes('quit'), false);
    assert.equal(h.updater.get().state, 'downloaded');
  }
});

test('Mac stays open when preparing to exit fails, and allows retry', async t => {
  let busy = true;
  const h = harness(t, { beforeInstall: async () => { if (busy) throw new Error('Wallpaper is busy'); } });
  await h.updater.check();
  await assert.rejects(h.updater.openDownloaded(), /Wallpaper is busy/);
  assert.equal(h.lifecycle.includes('quit'), false);
  busy = false;
  await h.updater.openDownloaded();
  assert.deepEqual(h.lifecycle, ['opened', 'opened', 'prepared', 'quit']);
});

test('portable Windows downloads a ZIP and reveals it for manual replacement', async t => {
  const h = harness(t, { platform: 'win32' });
  assert.equal((await h.updater.check()).state, 'downloaded');
  await h.updater.openDownloaded();
  assert.equal(path.basename(h.revealed[0]), h.name);
  assert.equal(h.opened.length, 0);
  assert.deepEqual(h.installedCalls, []);
  assert.deepEqual(h.lifecycle, []);
});

test('corrupt packages never become available to open', async t => {
  const h = harness(t, { corrupt: true });
  assert.equal((await h.updater.check()).state, 'error');
  await assert.rejects(h.updater.openDownloaded());
  assert.equal(h.opened.length, 0);
});

test('a downloaded file removed from disk can be downloaded again', async t => {
  const h = harness(t);
  await h.updater.check();
  const file = path.join(h.directory, 'updates', h.name);
  fs.unlinkSync(file);
  await assert.rejects(h.updater.openDownloaded());
  assert.deepEqual(h.lifecycle, []);
  assert.equal(h.updater.get().state, 'error');
  assert.equal((await h.updater.check()).state, 'downloaded');
  assert.equal(fs.existsSync(file), true);
});

test('stopping during the release check does not start a package download', async t => {
  const h = harness(t, { beforeReleaseReply: () => h.updater.stop() });
  await h.updater.check();
  assert.equal(h.requests.length, 1);
  assert.equal(h.states.some(status => status.state === 'downloaded'), false);
  assert.deepEqual(fs.readdirSync(h.directory), []);
});

test('missing platform packages retain the release fallback without trying to download', async t => {
  const h = harness(t, { missingAsset: true });
  assert.equal((await h.updater.check()).state, 'available');
  assert.equal(h.requests.length, 1);
  await assert.rejects(h.updater.openDownloaded());
});

test('development and smoke builds never access update servers', async t => {
  for (const options of [{ packaged: false }, { disabled: true }]) {
    const h = harness(t, options);
    assert.equal((await h.updater.check()).mode, 'disabled');
    assert.equal(h.requests.length, 0);
  }
});
