// Real Electron rendering/IPC/decoding, with all OS wallpaper calls replaced.
// All test data stays under artifacts; no installed profile is read or modified.
const electron = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', `experience-${Date.now()}`);
electron.app.setPath('userData', output);
const entry = path.join(root, 'electron/main.cjs');
const realRequire = createRequire(entry);
let applied = 0;
const fakeApp = new Proxy(electron.app, { get(target, key) {
  if (key === 'requestSingleInstanceLock') return () => false;
  if (key === 'quit' || key === 'setPath') return () => {};
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
} });
let dialogFile;
let sharedClipboard = '';
let sharedPhoto;
const context = {
  require(name) {
    if (name === 'electron') return { ...electron, app: fakeApp, clipboard: { writeText: value => { sharedClipboard = value; }, readText: () => sharedClipboard }, dialog: { showMessageBox: async () => ({ response: 0 }), showOpenDialog: async () => ({ canceled: false, filePaths: [dialogFile] }) } };
    if (name === './native-wallpaper.cjs') return { createWallpaperService: () => ({ setDesktop: async () => {}, apply: async (_file, _settings, commit) => { applied++; await commit(); return { lockScreen: 'disabled' }; } }) };
    return realRequire(name);
  },
  process, console, Buffer, URL, Headers, Response, AbortSignal,
  fetch: async url => { assert.equal(String(url), 'https://api.unsplash.com/photos/Xy9-abc_DEf'); return new Response(JSON.stringify(sharedPhoto)); }, __dirname: path.dirname(entry), module: { exports: {} },
  setInterval, clearInterval, setTimeout, clearTimeout,
};
const timeout = setTimeout(() => { console.error('Experience test timed out'); electron.app.exit(1); }, 90000);

(async () => {
  vm.runInNewContext(require('node:fs').readFileSync(entry, 'utf8') + `
    module.exports = {
      async initialize(window, directory) {
        win = window; storePath = path.join(directory, 'library.json'); cachePath = path.join(directory, 'wallpapers'); thumbnailPath = path.join(directory, 'thumbnails');
        await fs.mkdir(cachePath); await fs.mkdir(thumbnailPath);
        state.settings = { ...core.defaults, language: 'zh', rotationSource: 'library', syncLockScreen: false };
        applyLanguage();
        updates = { get: () => ({ mode: 'disabled', state: 'idle', currentVersion: 'test', version: '', percent: 0, message: '', url: '' }), refresh() {} };
        protocol.handle('framewall', servePhoto); registerIPC();
      },
      seedShare(photo) { key = 'fixture-key'; known.set(photo.id, photo); },
      indexFiles, snapshot, saveSettings, rotationTick, previousWallpaper, removePhoto, relinkPhoto, rescanLibrary,
      apply: id => apply(id),
      expire() { state.nextRotationAt = Date.now() - 5000; },
      folder(value) { state.folders = [value]; },
      async bigLibrary(count) {
        const original = state.photos[0];
        for (let i = 0; i < count; i++) state.photos.push({ ...original, id: 'virtual-' + i, title: 'Photo ' + i });
        publish();
      },
      stop() { clearInterval(timer); }
    };`, context, { filename: entry });
  const api = context.module.exports;
  await fs.mkdir(output, { recursive: true });
  await electron.app.whenReady();
  const win = new electron.BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
  await api.initialize(win, output);
  const source = path.join(root, 'docs/images/home.jpg');
  const files = [];
  for (let i = 0; i < 3; i++) { const file = path.join(output, `photo-${i}.jpg`); await fs.copyFile(source, file); files.push(file); }
  const indexed = await api.indexFiles(files);
  assert.equal(indexed.importFailed, 0, 'isolated decoder imports real photos');
  assert.equal(indexed.photos.length, 3);
  const ids = indexed.photos.map(p => p.id);
  const thumb = electron.nativeImage.createFromPath(path.join(output, 'thumbnails', ids[0] + '.jpg')).getSize();
  assert.ok(thumb.width <= 600 && thumb.height <= 600);
  assert.ok(indexed.photos[0].width > 600, 'original dimensions preserved');
  await api.apply(ids[0]); await api.apply(ids[1]); await api.apply(ids[2]);
  await api.previousWallpaper(); assert.equal(api.snapshot().current.id, ids[1]);
  await api.previousWallpaper(); assert.equal(api.snapshot().current.id, ids[0]);
  await api.saveSettings({ ...api.snapshot().settings, rotation: true });
  const due = api.snapshot().nextRotationAt;
  await api.saveSettings({ ...api.snapshot().settings, fit: 'fit' });
  assert.equal(api.snapshot().nextRotationAt, due, 'unrelated settings preserve deadline');
  api.expire(); const before = applied;
  await Promise.all([api.rotationTick(), api.rotationTick()]);
  assert.equal(applied, before + 1, 'wake catches up once');
  assert.ok(api.snapshot().nextRotationAt > Date.now());
  await api.saveSettings({ ...api.snapshot().settings, rotation: false });
  await fs.rename(files[1], files[1] + '.moved');
  await api.rescanLibrary();
  assert.equal(api.snapshot().photos.find(p => p.id === ids[1]).missing, true);
  dialogFile = path.join(output, 'relinked.jpg'); await fs.copyFile(source, dialogFile);
  await api.relinkPhoto({ id: ids[1] });
  assert.equal(api.snapshot().photos.length, 3);
  assert.ok(!api.snapshot().photos.some(p => p.id === ids[1]));
  await api.removePhoto({ id: ids[2] });
  await fs.access(files[2]);
  api.folder(output); await api.rescanLibrary();
  assert.ok(!api.snapshot().photos.some(p => p.id === ids[2]), 'scan respects removed entries');
  await api.bigLibrary(1000);
  await win.loadFile(path.join(root, 'dist/index.html'));
  await win.webContents.insertCSS('* { animation: none !important; transition: none !important; }');
  const run = code => win.webContents.executeJavaScript(code);
  const until = async code => {
    for (let i = 0; i < 100; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('UI condition timed out: ' + code);
  };
  await until(`!!document.querySelector('.sidebar')`);
  await run(`[...document.querySelectorAll('.sidebar button')].find(b => b.textContent.includes('我的图库')).click()`);
  await until(`document.querySelectorAll('.photo-card').length > 0`);
  assert.ok(await run(`document.querySelectorAll('.photo-card').length < 60`), '1000 photos render only visible rows');
  await run(`window.scrollTo(0, document.body.scrollHeight / 2)`);
  await until(`document.querySelector('.photo-card h3')?.textContent.startsWith('Photo ')`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await fs.writeFile(path.join(output, 'gallery.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.photo-card .image-open').click()`);
  await until(`!!document.querySelector('[role=dialog]')`);
  assert.ok(await run(`document.querySelector('[role=dialog]').contains(document.activeElement)`));
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))`);
  assert.ok(await run(`document.querySelector('[role=dialog]').contains(document.activeElement)`));
  const title = await run(`document.querySelector('.preview-info h2').textContent`);
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  await until(`document.querySelector('.preview-info h2').textContent !== ${JSON.stringify(title)}`);
  await run(`[...document.querySelectorAll('.preview-info button')].find(b => b.textContent.includes('预览桌面裁剪')).click()`);
  await until(`!!document.querySelector('.desktop-crop')`);
  await until(`document.querySelector('.desktop-crop img')?.complete && document.querySelector('.desktop-crop img')?.naturalWidth > 0`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await fs.writeFile(path.join(output, 'preview.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await until(`!document.querySelector('[role=dialog]')`);
  assert.equal(await run(`document.querySelector('main').hasAttribute('inert')`), false);
  await run(`document.querySelector('.photo-card img').src = 'framewall://photo/not-found'`);
  await until(`!!document.querySelector('.photo-card .image-message')`);
  await run(`document.querySelector('.photo-card .image-message button').click()`);
  await until(`!document.querySelector('.photo-card .image-message') && document.querySelector('.photo-card img')?.naturalWidth > 0`);
  await run(`[...document.querySelectorAll('.sidebar button')].find(b => b.textContent.includes('偏好设置')).click()`);
  await until(`!!document.querySelector('.settings-page')`);
  await new Promise(resolve => setTimeout(resolve, 150));
  await fs.writeFile(path.join(output, 'settings.png'), (await win.webContents.capturePage()).toPNG());
  // Share in one session, then import through the real renderer and IPC boundary.
  const localThumb = api.snapshot().photos[0].thumb;
  const shared = { id: 'Xy9-abc_DEf', source: 'unsplash', title: '雪山日出', author: 'Ann', width: 4000, height: 2500, thumb: localThumb, full: localThumb };
  sharedPhoto = { id: shared.id, width: 4000, height: 2500, description: shared.title, urls: { small: localThumb, regular: localThumb, raw: localThumb }, links: { html: 'https://unsplash.com/photos/Xy9-abc_DEf' }, user: { name: 'Ann', username: 'ann', links: { html: 'https://unsplash.com/@ann' } } };
  api.seedShare(shared);
  await run(`window.framewall.share({ id: 'Xy9-abc_DEf' })`);
  assert.ok(sharedClipboard.includes('https://unsplash.com/photos/Xy9-abc_DEf'));
  await run(`[...document.querySelectorAll('.sidebar button')].find(b => b.textContent.includes('我的图库')).click()`);
  await until(`!!document.querySelector('.photo-grid')`);
  await run(`[...document.querySelectorAll('.page-header button')].find(b => b.textContent.includes('导入照片')).click()`);
  await until(`!!document.querySelector('.import-dialog[open]')`);
  assert.equal(await run(`document.querySelector('.import-dialog').contains(document.activeElement)`), true);
  const fillLink = async value => run(`(() => { const field = document.querySelector('#wallpaper-link'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(value)}); field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await fillLink('not a photo link');
  await run(`document.querySelector('.import-dialog form').requestSubmit()`);
  await until(`!!document.querySelector('.import-error')`);
  assert.ok(!api.snapshot().photos.some(p => p.id === shared.id));
  await fillLink(sharedClipboard);
  await run(`document.querySelector('.import-dialog form').requestSubmit()`);
  await until(`document.querySelector('.import-preview h3')?.textContent === '雪山日出'`);
  assert.ok(!api.snapshot().photos.some(p => p.id === shared.id), 'preview is not persisted');
  await until(`document.querySelector('.import-image img')?.naturalWidth > 0`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await fs.writeFile(path.join(output, 'import.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.import-preview button').click()`);
  await until(`document.querySelector('.preview-info h2')?.textContent === '雪山日出'`);
  assert.equal(api.snapshot().photos.find(p => p.id === shared.id).imported, true);
  await run(`[...document.querySelectorAll('.preview-actions button')].find(b => b.textContent.includes('分享')).click()`);
  await until(`!!document.querySelector('.toast')`);
  assert.ok(sharedClipboard.includes('https://unsplash.com/photos/Xy9-abc_DEf'));
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await until(`!document.querySelector('.preview-dialog')`);
  await win.reload();
  await until(`!!document.querySelector('.sidebar')`);
  await run(`[...document.querySelectorAll('.sidebar button')].find(b => b.textContent.includes('我的图库')).click()`);
  await until(`!!document.querySelector('.photo-grid')`);
  assert.ok((JSON.parse(await fs.readFile(path.join(output, 'library.json'), 'utf8'))).photos.some(p => p.id === shared.id && p.imported));
  await run(`[...document.querySelectorAll('.page-header button')].find(b => b.textContent.includes('导入照片')).click()`);
  await until(`!!document.querySelector('.import-dialog[open]')`);
  dialogFile = path.join(output, 'from-import-dialog.jpg'); await fs.copyFile(source, dialogFile);
  await run(`document.querySelector('.import-local').click()`);
  await until(`!document.querySelector('.import-dialog')`);
  await until(`!document.querySelector('.retry-progress') && !document.querySelector('.page-actions button:disabled')`);
  assert.ok(api.snapshot().photos.some(p => p.title === 'from-import-dialog.jpg'), 'local import completes through the unified dialog');
  assert.equal(errors.filter(message => !/Content Security Policy/.test(message)).length, 0, errors.join('\n'));
  api.stop(); win.destroy(); clearTimeout(timeout);
  console.log('PASS: real image decoding, thumbnails, history, rotation, missing files, relink, removal, 1000-photo virtualization, keyboard navigation, crop preview, image retry, share-link round trip, durable import, and local import.');
  console.log('Screenshots: ' + output);
  electron.app.exit(0);
})().catch(error => { console.error(error); clearTimeout(timeout); electron.app.exit(1); });
