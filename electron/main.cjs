const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, safeStorage, protocol, net, shell, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const core = require('./core.cjs');
const diagnostics = require('./diagnostics.cjs');
const { withRetry, isTransient } = require('./retry.cjs');
const updateCore = require('./update-core.cjs');
let updates;
// Keep the existing data location when changing the public application name.
if (!process.argv.includes('--smoke-test')) app.setPath('userData', path.join(app.getPath('appData'), 'framewall'));
const requestProgress = new Map();
function progress(id, message) {
  if (message) requestProgress.set(id, message); else requestProgress.delete(id);
  if (win && !win.isDestroyed()) win.webContents.send('framewall:progress', [...requestProgress.values()].at(-1) || '');
}
protocol.registerSchemesAsPrivileged([{ scheme: 'framewall', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let win, tray, timer, key = '', closing = false, applying = false, selecting = false;
let state = { photos: [], favorites: [], playlists: [], history: [], current: null, settings: { ...core.defaults } };
let storePath, cachePath;
const known = new Map();
const imported = new Map();
const topicIds = new Map();
const dev = process.argv.includes('--dev');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.join(process.cwd(), '.smoke-data'));
let saveQueue = Promise.resolve();
async function save() {
  const snapshot = JSON.stringify(state, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fs.writeFile(storePath + '.tmp', snapshot, 'utf8');
    await fs.rename(storePath + '.tmp', storePath);
  });
  return saveQueue;
}
function snapshot() {
  return { ...state, connected: !!key, desktop: true, platform: process.platform, screens: screen.getAllDisplays().map(d => ({ id: d.id, width: d.size.width, height: d.size.height, primary: d.id === screen.getPrimaryDisplay().id })) };
}
function publish(error) {
  if (win && !win.isDestroyed()) win.webContents.send('framewall:update', { ...snapshot(), error });
  updateTray();
}
async function apiRequest(url, apiKey = key) {
  const id = Symbol(); const previousKey = key;
  try { return await withRetry(() => apiRequestOnce(url, apiKey), { shouldContinue: () => key === previousKey, onRetry: ({ retry, total, delay }) => progress(id, `连接暂时失败，${delay / 1000} 秒后自动重试（${retry}/${total}）…`) }); }
  finally { progress(id, ''); }
}
async function apiRequestOnce(url, apiKey = key) {
  if (!apiKey) throw new Error('请先在首页连接 Unsplash，或选择本地照片。');
  const target = core.apiUrl(String(url));
  let response;
  try { response = await fetch(target, { headers: { Authorization: `Client-ID ${apiKey}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(30000), redirect: 'error' }); }
  catch (error) { const failure = new Error(diagnostics.networkError(error, target.pathname, apiKey)); failure.retryable = isTransient(error); throw failure; }
  if (!response.ok) {
    let details = '';
    try { const body = await response.json(); details = Array.isArray(body.errors) ? body.errors.join('；') : String(body.error || body.message || ''); } catch {}
    const failure = new Error(diagnostics.serviceError(response.status, target.pathname + target.search, details, response.headers.get('x-ratelimit-remaining'), apiKey)); failure.status = response.status; throw failure;
  }
  try { return { data: await response.json(), remaining: response.headers.get('x-ratelimit-remaining') }; }
  catch (error) { const failure = new Error(`服务返回内容无法读取。\n请求：${target.pathname}\n${diagnostics.redact(error.message, apiKey)}`); failure.retryable = isTransient(error); throw failure; }
}
async function connect(accessKey) {
  const candidate = String(accessKey || '').trim();
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(candidate)) throw new Error('请输入完整的 Unsplash Access Key，无需 Secret Key。');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，未保存凭据。');
  await apiRequest('/photos?per_page=1', candidate);
  await fs.writeFile(path.join(app.getPath('userData'), 'credential.bin'), safeStorage.encryptString(candidate));
  key = candidate;
  publish();
  return snapshot();
}
async function query(input) {
  // Fetch bounded metadata pages, then verify actual dimensions.
  const result = await core.fetchMatching(input, apiRequest);
  result.photos.forEach(p => known.set(p.id, p));
  return result;
}
function getPhoto(id) {
  const p = known.get(id);
  if (!p) throw new Error('这张照片尚未载入，请重新打开图库。');
  return p;
}
function remember(p) {
  if (!state.photos.some(item => item.id === p.id)) state.photos.push(p);
}
async function importFiles() {
  const choice = await dialog.showMessageBox(win, { type: 'question', message: '从哪里导入照片？', detail: '导入只建立图片索引，不会移动或修改原文件。', buttons: ['选择照片', '选择文件夹', '取消'], defaultId: 0, cancelId: 2 });
  if (choice.response === 2) return snapshot();
  const result = await dialog.showOpenDialog(win, choice.response === 1 ? { properties: ['openDirectory'] } : { properties: ['openFile', 'multiSelections'], filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }] });
  if (result.canceled) return snapshot();
  const files = choice.response === 1 ? (await fs.readdir(result.filePaths[0], { withFileTypes: true })).filter(d => d.isFile()).map(d => path.join(result.filePaths[0], d.name)) : result.filePaths;
  return indexFiles(files);
}
async function indexFiles(files) {
  let failed = 0;
  for (const file of files.filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f))) {
    try {
      const image = nativeImage.createFromPath(file);
      if (image.isEmpty()) { failed++; continue; }
      const size = image.getSize();
      const id = core.fileId(file);
      const p = { id, source: 'local', title: path.basename(file), width: size.width, height: size.height, thumb: `framewall://photo/${id}`, full: `framewall://photo/${id}`, localPath: file, author: '我的照片', color: '#303a37', createdAt: (await fs.stat(file)).mtime.toISOString() };
      imported.set(id, file); known.set(id, p); remember(p);
    } catch { failed++; }
  }
  await save(); publish();
  return { ...snapshot(), importFailed: failed };
}
async function cacheInfo() {
  const files = await fs.readdir(cachePath);
  let bytes = 0;
  for (const file of files) bytes += (await fs.stat(path.join(cachePath, file))).size;
  return { bytes, files: files.length };
}
async function trimCache() {
  const entries = await Promise.all((await fs.readdir(cachePath)).filter(f => !f.endsWith('.part')).map(async file => ({ file, ...(await fs.stat(path.join(cachePath, file))) })));
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  for (const entry of entries.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= state.settings.cacheLimit * 1024 * 1024) break;
    const file = path.join(cachePath, entry.file);
    if (file === state.current?.file) continue;
    await fs.unlink(file); total -= entry.size;
  }
}
async function photoFile(p) {
  if (p.source === 'local') { await fs.access(p.localPath); return p.localPath; }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(p.id)) throw new Error('图片标识无效。');
  const file = path.join(cachePath, `${p.id}-${state.settings.quality}.jpg`);
  try { await fs.access(file); return file; } catch {}
  // A wallpaper selection counts as a download; never download on gallery hover.
  await apiRequest(p.downloadLocation);
  const url = core.imageUrl(p.raw);
  url.searchParams.set('w', state.settings.quality); url.searchParams.set('q', '90'); url.searchParams.set('fm', 'jpg'); url.searchParams.set('fit', 'max');
  let response;
  const requestId = Symbol();
  try { response = await withRetry(async () => { const result = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' }); if (result.status === 408 || result.status >= 500) { await result.body?.cancel(); const error = new Error(`图片下载失败。HTTP ${result.status} · images.unsplash.com${url.pathname}`); error.status = result.status; throw error; } return result; }, { onRetry: ({ retry, total, delay }) => progress(requestId, `图片下载暂时失败，${delay / 1000} 秒后重试（${retry}/${total}）…`) }); }
  catch (error) { if (error.status || error.cause?.status) throw error; throw new Error(diagnostics.networkError(error, 'images.unsplash.com' + url.pathname, key)); }
  finally { progress(requestId, ''); }
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`图片下载失败。\nHTTP ${response.status} · images.unsplash.com${url.pathname}\n内容类型：${response.headers.get('content-type') || '未提供'}`);
  if (Number(response.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error('图片超过 50 MB 大小限制。');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 50 * 1024 * 1024) throw new Error('图片超过大小限制。'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error('下载的图片无法读取。');
  await fs.writeFile(file + '.part', bytes); await fs.rename(file + '.part', file);
  return file;
}
async function setNativeWallpaper(file, fit) {
  if (process.platform === 'win32') {
    const styles = { fill: ['10', '0'], fit: ['6', '0'], stretch: ['2', '0'], center: ['0', '0'] };
    const [style, tile] = styles[fit];
    // Only fixed source code is executed; file paths travel through environment variables.
    const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class FrameWallNative { [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SystemParametersInfo(int action, int param, string value, int flags); }'; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '${style}'; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '${tile}'; if (-not [FrameWallNative]::SystemParametersInfo(20, 0, $env:FRAMEWALL_IMAGE, 3)) { throw 'Windows could not set the wallpaper' }`;
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, FRAMEWALL_IMAGE: file }, timeout: 30000 });
  } else if (process.platform === 'darwin') {
    const script = 'on run argv\n tell application "System Events"\n set picture of every desktop to item 1 of argv\n end tell\n end run';
    await run('/usr/bin/osascript', ['-e', script, file], { timeout: 30000 });
  } else throw new Error('当前版本仅实现 Windows / macOS 壁纸设置。');
}
async function apply(id, stillCurrent) {
  if (applying) throw new Error('正在设置壁纸，请稍等。');
  applying = true;
  try {
    const p = getPhoto(id); const file = await photoFile(p);
    if (stillCurrent && !stillCurrent()) throw new Error('轮换已暂停或来源已修改，本次设置已取消。');
    await setNativeWallpaper(file, state.settings.fit);
    remember(p);
    state.current = { id, file, appliedAt: new Date().toISOString() };
    state.history = [{ id, appliedAt: state.current.appliedAt }, ...state.history].slice(0, 200);
    await save(); await trimCache(); publish(); return snapshot();
  } finally { applying = false; }
}
function rotationPool(settings = state.settings) {
  const selected = settings.rotationSource;
  const ids = selected.startsWith('playlist:') ? state.playlists.find(p => p.id === selected.slice(9))?.photoIds || [] : state.favorites;
  return (selected === 'library' ? state.photos.filter(p => p.source === 'local') : state.photos.filter(p => ids.includes(p.id))).filter(p => core.matchesPhoto(p, settings));
}
async function next(automatic = false) {
  if (selecting || applying) throw new Error('正在选取并设置下一张壁纸，请稍等。');
  selecting = true;
  try {
    if (state.settings.rotationSource === 'online') {
      if (!key) throw new Error('在线随机轮换需要先连接 Unsplash。');
      const settings = { ...state.settings };
      const signature = JSON.stringify([settings.onlineSource, settings.orientation, settings.minWidth]);
      const stillCurrent = () => !!key && state.settings.rotationSource === 'online' && (!automatic || state.settings.rotation) && signature === JSON.stringify([state.settings.onlineSource, state.settings.orientation, state.settings.minWidth]);
      let source = core.normalizeOnlineSource(settings.onlineSource);
      if (source.kind === 'topic') {
        const cached = topicIds.get(source.value);
        let id = cached && Date.now() - cached.savedAt < 3600000 ? cached.id : null;
        if (!id) { const result = await apiRequest(`/topics/${encodeURIComponent(source.value)}`); id = result.data.id; topicIds.set(source.value, { id, savedAt: Date.now() }); }
        source = { ...source, value: id };
      }
      const result = await core.fetchRandomMatching(source, settings, apiRequest, state.current?.id, state.history.map(h => h.id));
      if (!stillCurrent()) throw new Error('轮换来源或筛选已修改，旧来源的选图已取消。');
      known.set(result.photo.id, result.photo);
      return await apply(result.photo.id, stillCurrent);
    }
    const pool = rotationPool();
    return await apply(core.nextPhoto(pool, state.current?.id, state.settings.order).id);
  } finally { selecting = false; }
}
function schedule() {
  clearInterval(timer);
  if (state.settings.rotation) timer = setInterval(() => next(true).catch(e => publish(e.message)), state.settings.interval * 60000);
  updateTray();
}
async function saveSettings(input) {
  const settings = core.normalizeSettings(input);
  let warning;
  if (settings.rotationSource === 'online') {
    if (settings.rotation) { if (!key) throw new Error('请先连接 Unsplash，再开启在线随机轮换。'); core.normalizeOnlineSource(settings.onlineSource); }
  } else if (settings.rotation && !rotationPool(settings).length) {
    if (!state.settings.rotation) throw new Error('当前照片池中没有符合方向与分辨率的照片，请先收藏或导入合适的照片。');
    settings.rotation = false; warning = '筛选后没有符合条件的照片，自动轮换已暂停。';
  }
  if (settings.autostart !== state.settings.autostart) {
    if (!app.isPackaged && settings.autostart) throw new Error('开机启动需要安装打包后的客户端，开发模式不注册系统启动项。');
    app.setLoginItemSettings({ openAtLogin: settings.autostart });
  }
  state.settings = settings; await save(); schedule(); publish(warning); return snapshot();
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(`拾景 Scenelet${state.settings.rotation ? ' · 自动轮换中' : ''}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开拾景', click: () => { win.show(); win.focus(); } },
    { label: '下一张壁纸', click: () => next().catch(e => publish(e.message)) },
    { label: '自动轮换', type: 'checkbox', checked: state.settings.rotation, click: item => { saveSettings({ ...state.settings, rotation: item.checked }).catch(e => publish(e.message)); } },
    { type: 'separator' },
    { label: '退出', click: () => { closing = true; app.quit(); } },
  ]));
}
function registerIPC() {
  const handlers = {
    'update-status': () => updates.get(),
    'check-update': () => updates.check(),
    'install-update': () => updates.install(),
    'open-update': async () => shell.openExternal(updateCore.trustedReleaseUrl(updates.get().url)),
    bootstrap: () => snapshot(), query, connect,
    credential: () => key,
    disconnect: async () => { await fs.rm(path.join(app.getPath('userData'), 'credential.bin'), { force: true }); key = ''; topicIds.clear(); if (state.settings.rotationSource === 'online') { state.settings.rotation = false; await save(); schedule(); } publish(); return snapshot(); },
    import: importFiles,
    favorite: async ({ id }) => { const p = getPhoto(id); remember(p); state.favorites = state.favorites.includes(id) ? state.favorites.filter(f => f !== id) : [...state.favorites, id]; await save(); publish(); return snapshot(); },
    playlist: async ({ action, id, name, photoId }) => {
      if (action === 'create') { if (!String(name || '').trim()) throw new Error('请输入播放列表名称。'); state.playlists.push({ id: require('node:crypto').randomUUID(), name: String(name).trim().slice(0, 60), photoIds: [] }); }
      else { const list = state.playlists.find(p => p.id === id); if (!list) throw new Error('播放列表不存在。');
        if (action === 'delete') { state.playlists = state.playlists.filter(p => p.id !== id); if (state.settings.rotationSource === `playlist:${id}`) { state.settings.rotation = false; state.settings.rotationSource = 'favorites'; schedule(); } }
        else if (action === 'toggle') { remember(getPhoto(photoId)); list.photoIds = list.photoIds.includes(photoId) ? list.photoIds.filter(p => p !== photoId) : [...list.photoIds, photoId]; }
        else throw new Error('播放列表操作无效。'); }
      await save(); publish(); return snapshot();
    },
    settings: saveSettings,
    wallpaper: ({ id }) => apply(id), next: () => next(),
    download: async ({ id }) => { const p = getPhoto(id); const result = await dialog.showSaveDialog(win, { defaultPath: `${p.id}${p.source === 'local' ? path.extname(p.localPath) : '.jpg'}`, filters: [{ name: '图片', extensions: p.source === 'local' ? [path.extname(p.localPath).slice(1)] : ['jpg'] }] }); if (result.canceled) return { canceled: true }; const file = await photoFile(p); if (path.resolve(file) !== path.resolve(result.filePath)) await fs.copyFile(file, result.filePath); await trimCache(); return { canceled: false }; },
    cache: cacheInfo,
    'clear-cache': async () => { for (const file of await fs.readdir(cachePath)) { const target = path.join(cachePath, file); if (target !== state.current?.file) await fs.unlink(target); } return cacheInfo(); },
    'open-link': async ({ url }) => { const u = new URL(url); if (u.protocol !== 'https:' || !['unsplash.com', 'help.unsplash.com'].includes(u.hostname)) throw new Error('只允许打开 Unsplash 来源链接。'); u.searchParams.set('utm_source', 'framewall'); u.searchParams.set('utm_medium', 'referral'); await shell.openExternal(u.toString()); },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`framewall:${name}`, async (event, input) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('请求来源无效。');
    try { return await handler(input); } catch (error) { throw new Error(diagnostics.redact(error.message || '操作失败。', key)); }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    storePath = path.join(app.getPath('userData'), 'library.json'); cachePath = path.join(app.getPath('userData'), 'wallpapers');
    await fs.mkdir(cachePath, { recursive: true });
    try { if (!smoke) { const saved = JSON.parse(await fs.readFile(storePath, 'utf8')); state = { ...state, ...saved, settings: core.normalizeSettings(saved.settings) }; } } catch (e) { if (e.code !== 'ENOENT') console.error('Unable to load saved library:', e.message); }
    state.photos.forEach(p => { known.set(p.id, p); if (p.source === 'local') imported.set(p.id, p.localPath); });
    try { if (safeStorage.isEncryptionAvailable()) key = safeStorage.decryptString(await fs.readFile(path.join(app.getPath('userData'), 'credential.bin'))); } catch {}
    protocol.handle('framewall', request => { const url = new URL(request.url); const file = url.hostname === 'photo' ? imported.get(url.pathname.slice(1)) : undefined; return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 }); });
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 980, minHeight: 700, show: !smoke, backgroundColor: '#f5f5f0', title: '拾景 · Scenelet', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
    win.on('close', event => { if (!closing && state.settings.minimizeToTray) { event.preventDefault(); win.hide(); } });
    tray = new Tray(nativeImage.createFromBuffer(require('./icon.cjs')()).resize({ width: 24, height: 24 }));
    tray.on('double-click', () => { win.show(); win.focus(); });
    updates = require('./updater.cjs')({ app, disabled: smoke || dev, notify: value => { if (!win.isDestroyed()) win.webContents.send('framewall:updater', value); }, beforeInstall: async () => { if (applying || selecting) throw new Error('正在设置壁纸，请完成后再安装更新。'); await saveQueue; closing = true; clearInterval(timer); } });
    registerIPC(); schedule(); updates.start();
    if (dev) await win.loadURL('http://127.0.0.1:5173'); else await win.loadFile(path.join(__dirname, '../dist/index.html'));
    if (smoke) {
      try {
        await require('./smoke.cjs')({ app, win, indexFiles, setNativeWallpaper, snapshot, run, connect });
        closing = true; app.quit();
      } catch (error) { console.error('SMOKE FAILED:', error); closing = true; app.exit(1); }
    }
  }).catch(error => { dialog.showErrorBox('拾景启动失败', error.message); closing = true; app.quit(); });
  app.on('before-quit', () => { closing = true; clearInterval(timer); updates?.stop(); });
  app.on('window-all-closed', () => app.quit());
}
