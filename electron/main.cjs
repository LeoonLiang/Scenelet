const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, nativeImage, safeStorage, protocol, net, shell, screen, powerMonitor } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const core = require('./core.cjs');
const libraryStore = require('./library-store.cjs');
const rotationClock = require('./rotation-clock.cjs');
const wallpaper = require('./native-wallpaper.cjs').createWallpaperService({ run, platform: process.platform });
const diagnostics = require('./diagnostics.cjs');
const { withRetry, isTransient } = require('./retry.cjs');
const updateCore = require('./update-core.cjs');
const trayStatus = require('./tray-status.cjs');
const i18n = require('./i18n.cjs');
const credit = require('./credit.cjs');
const __ = i18n.t;
let updates;
// Keep the existing data location when changing the public application name.
if (!process.argv.includes('--smoke-test')) app.setPath('userData', path.join(app.getPath('appData'), 'framewall'));
const requestProgress = new Map();
function progress(id, message) {
  if (message) requestProgress.set(id, message); else requestProgress.delete(id);
  if (win && !win.isDestroyed()) win.webContents.send('framewall:progress', [...requestProgress.values()].at(-1) || '');
  if (change) { change.note = [...requestProgress.values()].at(-1) || ''; refreshChange(); }
}
function applyLanguage(pref = state.settings.language) {
  i18n.setLanguage(pref === 'zh' || pref === 'en' ? pref : i18n.resolve(app.getPreferredSystemLanguages()));
}
protocol.registerSchemesAsPrivileged([{ scheme: 'framewall', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let win, tray, timer, key = '', closing = false, applying = false, selecting = false;
// Wallpaper change in progress: { stage: 'select' | 'download' | 'apply', received, total, note, origin }.
let change = null, flash = null, flashTimer, spinTimer, spinTick = 0, lastError = '', lastMenuKey = null, lastChangeText = '';
let state = { photos: [], favorites: [], playlists: [], history: [], current: null, settings: { ...core.defaults } };
let storePath, cachePath, thumbnailPath;
let recovery = '', indexing = false, clockRunning = false, previousQueue = null;
const thumbnails = new Map();
let lockScreenWarning = '';
let lockScreenWarningNotified = false;
// A credit style picked while another change was running; redrawn once that change finishes.
let restylePending = false;
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
    await libraryStore.writeLibrary(storePath, snapshot);
  });
  return saveQueue;
}
function snapshot() {
  return { ...state, previousAvailable: previousQueue !== null ? previousQueue.some(id => known.has(id)) : state.history.some(h => h.id !== state.current?.id && known.has(h.id)), recovery, lockScreenWarning, connected: !!key, desktop: true, platform: process.platform, screens: screen.getAllDisplays().map(d => ({ id: d.id, width: Math.round(d.size.width * (d.scaleFactor || 1)), height: Math.round(d.size.height * (d.scaleFactor || 1)), primary: d.id === screen.getPrimaryDisplay().id })) };
}
function publish(error) {
  if (win && !win.isDestroyed()) win.webContents.send('framewall:update', { ...snapshot(), error });
  updateTray();
}
async function apiRequest(url, apiKey = key) {
  const id = Symbol(); const previousKey = key;
  try { return await withRetry(() => apiRequestOnce(url, apiKey), { shouldContinue: () => key === previousKey, onRetry: ({ retry, total, delay }) => progress(id, __('retry.connect', { seconds: delay / 1000, retry, total })) }); }
  finally { progress(id, ''); }
}
async function apiRequestOnce(url, apiKey = key) {
  if (!apiKey) throw new Error(__("err.noKey"));
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
  catch (error) { const failure = new Error(__('err.unreadable', { endpoint: target.pathname, reason: diagnostics.redact(error.message, apiKey) })); failure.retryable = isTransient(error); throw failure; }
}
async function connect(accessKey) {
  const candidate = String(accessKey || '').trim();
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(candidate)) throw new Error(__("err.invalidKey"));
  if (!safeStorage.isEncryptionAvailable()) throw new Error(__("err.noEncryption"));
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
  if (!p) throw new Error(__("err.photoNotLoaded"));
  return p;
}
function remember(p) {
  if (!state.photos.some(item => item.id === p.id)) state.photos.push(p);
}
async function importFiles() {
  const choice = await dialog.showMessageBox(win, { type: 'question', message: __('import.message'), detail: __('import.detail'), buttons: [__('import.files'), __('import.folder'), __('import.cancel')], defaultId: 0, cancelId: 2 });
  if (choice.response === 2) return snapshot();
  const result = await dialog.showOpenDialog(win, choice.response === 1 ? { properties: ['openDirectory'] } : { properties: ['openFile', 'multiSelections'], filters: [{ name: __('import.filter'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }] });
  if (result.canceled) return snapshot();
  const files = choice.response === 1 ? (await fs.readdir(result.filePaths[0], { withFileTypes: true })).filter(d => d.isFile()).map(d => path.join(result.filePaths[0], d.name)) : result.filePaths;
  state.ignoredPaths = (state.ignoredPaths || []).filter(file => !files.includes(file));
  if (choice.response === 1) state.folders = [...new Set([...(state.folders || []), result.filePaths[0]])];
  return indexFiles(files);
}
async function indexFiles(files) {
  if (indexing) throw new Error(__('err.busy'));
  indexing = true;
  let failed = 0, worker;
  const job = Symbol();
  const positions = new Map(state.photos.map((photo, index) => [photo.id, index]));
  const candidates = [...new Set(files.filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f)))];
  try {
    thumbnailPath ||= path.join(app.getPath('userData'), 'thumbnails');
    await fs.mkdir(thumbnailPath, { recursive: true });
    worker = await require('./photo-indexer.cjs').createIndexer();
    for (let i = 0; i < candidates.length; i++) {
      const file = candidates[i], id = core.fileId(file);
      progress(job, __('import.progress', { current: i + 1, total: candidates.length }));
      const oldPath = imported.get(id);
      imported.set(id, file);
      try {
        const stat = await fs.stat(file);
        const old = known.get(id);
        if (old && old.modifiedAt === stat.mtimeMs && !old.missing) continue;
        const { width, height, thumbnail } = await worker.read(`framewall://photo/${id}`);
        await fs.writeFile(path.join(thumbnailPath, id + '.jpg'), Buffer.from(thumbnail, 'base64'));
        const p = { id, source: 'local', title: path.basename(file), width, height, thumb: `framewall://thumb/${id}?v=${stat.mtimeMs}`, full: `framewall://photo/${id}?v=${stat.mtimeMs}`, localPath: file, author: __('photo.mine'), color: '#303a37', createdAt: stat.mtime.toISOString(), modifiedAt: stat.mtimeMs, missing: false };
        known.set(id, p);
        const index = positions.get(id);
        if (index === undefined) { positions.set(id, state.photos.length); state.photos.push(p); } else state.photos[index] = p;
      } catch {
        if (oldPath) imported.set(id, oldPath); else imported.delete(id);
        failed++;
      }
      if ((i + 1) % 25 === 0) { await save(); publish(); }
    }
    await save(); publish();
    return { ...snapshot(), importFailed: failed };
  } finally { worker?.close(); indexing = false; progress(job, ''); }
}
async function rescanLibrary() {
  if (indexing || applying || selecting) throw new Error(__('err.busy'));
  const folders = new Set(state.folders || []);
  const files = new Set();
  for (const photo of state.photos.filter(p => p.source === 'local')) {
    try { await fs.access(photo.localPath); files.add(photo.localPath); }
    catch { photo.missing = true; }
  }
  for (const folder of folders) {
    try { for (const entry of await fs.readdir(folder, { withFileTypes: true })) if (entry.isFile()) files.add(path.join(folder, entry.name)); }
    catch { /* Retain folder registration so a reconnected drive can be scanned again. */ }
  }
  return indexFiles([...files].filter(file => !(state.ignoredPaths || []).includes(file)));
}
async function removePhoto({ id }) {
  if (indexing || applying || selecting) throw new Error(__('err.busy'));
  const photo = getPhoto(id);
  if (photo.source !== 'local') throw new Error(__('err.photoNotLoaded'));
  state.ignoredPaths = [...new Set([...(state.ignoredPaths || []), photo.localPath])];
  state.photos = state.photos.filter(p => p.id !== id);
  state.favorites = state.favorites.filter(value => value !== id);
  state.playlists.forEach(list => { list.photoIds = list.photoIds.filter(value => value !== id); });
  state.history = state.history.filter(h => h.id !== id);
  // The original file and currently applied desktop wallpaper are never deleted.
  if (state.current?.id === id) state.current.photo = { ...photo };
  else { known.delete(id); imported.delete(id); }
  if (thumbnailPath) await fs.rm(path.join(thumbnailPath, id + '.jpg'), { force: true });
  if (state.settings.rotationSource !== 'online' && !rotationPool().length) state.settings.rotation = false;
  schedule(); await save(); publish(); return snapshot();
}
async function relinkPhoto({ id }) {
  if (indexing || applying || selecting) throw new Error(__('err.busy'));
  const photo = getPhoto(id);
  if (photo.source !== 'local') throw new Error(__('err.photoNotLoaded'));
  const chosen = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: __('import.filter'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }] });
  if (chosen.canceled) return snapshot();
  const newId = core.fileId(chosen.filePaths[0]);
  state.ignoredPaths = (state.ignoredPaths || []).filter(file => file !== chosen.filePaths[0]);
  const result = await indexFiles(chosen.filePaths);
  if (result.importFailed) return result;
  if (newId !== id) {
    state.favorites = [...new Set(state.favorites.map(value => value === id ? newId : value))];
    state.history = state.history.map(h => ({ ...h, id: h.id === id ? newId : h.id }));
    state.playlists.forEach(list => { list.photoIds = [...new Set(list.photoIds.map(value => value === id ? newId : value))]; });
    // Keep current.file pointing at what the OS actually uses until the next apply.
    if (state.current?.id === id) { state.current.id = newId; state.current.photo = { ...known.get(newId) }; }
    state.photos = state.photos.filter(p => p.id !== id); known.delete(id); imported.delete(id);
  }
  await save(); publish(); return snapshot();
}
async function previousWallpaper() {
  if (change || selecting || applying || indexing) throw new Error(__('err.busy'));
  previousQueue ||= [...new Set(state.history.map(h => h.id))].filter(id => id !== state.current?.id);
  while (previousQueue.length) {
    const id = previousQueue[0];
    const photo = known.get(id);
    if (!photo) { previousQueue.shift(); continue; }
    if (photo.source === 'local') { try { await fs.access(photo.localPath); } catch { photo.missing = true; previousQueue.shift(); continue; } }
    await tracked('window', () => apply(id, undefined, true));
    previousQueue.shift();
    publish(); return snapshot();
  }
  throw new Error(__('history.empty'));
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
    if (file === state.current?.file || file === state.current?.original) continue;
    await fs.unlink(file); total -= entry.size;
  }
}
async function photoFile(p) {
  if (p.source === 'local') { await fs.access(p.localPath); return p.localPath; }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(p.id)) throw new Error(__("err.photoId"));
  const quality = state.settings.quality === 'auto' ? rotationClock.screenQuality(screen.getAllDisplays()) : state.settings.quality;
  const file = path.join(cachePath, `${p.id}-${quality}.jpg`);
  try { await fs.access(file); return file; } catch {}
  // A wallpaper selection counts as a download; never download on gallery hover.
  setStage('download');
  await apiRequest(p.downloadLocation);
  const url = core.imageUrl(p.raw);
  url.searchParams.set('w', quality); url.searchParams.set('q', '90'); url.searchParams.set('fm', 'jpg'); url.searchParams.set('fit', 'max');
  let response;
  const requestId = Symbol();
  try { response = await withRetry(async () => { const result = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' }); if (result.status === 408 || result.status >= 500) { await result.body?.cancel(); const error = new Error(__('err.downloadHttp', { status: result.status, target: `images.unsplash.com${url.pathname}` })); error.status = result.status; throw error; } return result; }, { onRetry: ({ retry, total, delay }) => progress(requestId, __('retry.download', { seconds: delay / 1000, retry, total })) }); }
  catch (error) { if (error.status || error.cause?.status) throw error; throw new Error(diagnostics.networkError(error, 'images.unsplash.com' + url.pathname, key)); }
  finally { progress(requestId, ''); }
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(__('err.downloadBad', { status: response.status, target: `images.unsplash.com${url.pathname}`, type: response.headers.get('content-type') || __('err.notProvided') }));
  if (Number(response.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error(__("err.tooLarge"));
  const chunks = []; let size = 0;
  setStage('download', { received: 0, total: Number(response.headers.get('content-length')) || 0 });
  for await (const chunk of response.body) { size += chunk.length; if (size > 50 * 1024 * 1024) throw new Error(__("err.tooLarge")); chunks.push(chunk); setStage('download', { received: size }); }
  const bytes = Buffer.concat(chunks);
  if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error(__("err.badImage"));
  await fs.writeFile(file + '.part', bytes); await fs.rename(file + '.part', file);
  return file;
}
// Unsplash wallpapers get a credited copy; the downloaded original stays untouched for "download".
// Any failure falls back to the original so a credit never blocks a wallpaper change.
async function creditedFile(p, file) {
  if (state.settings.creditStyle === 'none' || p.source !== 'unsplash' || !p.author) return file;
  try {
    const primary = screen.getPrimaryDisplay().id;
    return await credit.createCredited({
      BrowserWindow, file, url: `framewall://cache/${encodeURIComponent(path.basename(file))}`,
      displays: screen.getAllDisplays().map(d => ({ ...d, primary: d.id === primary })),
      // macOS always fills the screen; the fit setting only applies on Windows.
      fit: process.platform === 'darwin' ? 'fill' : state.settings.fit,
      styleId: state.settings.creditStyle, author: p.author, directory: cachePath, photoId: p.id,
    });
  } catch (error) { console.warn('Credit skipped:', error.message); return file; }
}
// Keep the opt-in smoke check desktop-only so its existing restore remains complete.
const setNativeWallpaper = wallpaper.setDesktop;
async function apply(id, stillCurrent, navigatingHistory = false) {
  if (applying) throw new Error(__("err.applying"));
  applying = true;
  try {
    const p = getPhoto(id);
    const original = await photoFile(p);
    setStage('apply');
    const file = await creditedFile(p, original);
    if (stillCurrent && !stillCurrent()) throw Object.assign(new Error(__("err.applyCancelled")), { cancelled: true });
    const result = await wallpaper.apply(file, state.settings, async () => {
      // Commit desktop success before the optional lock-screen operation can stall.
      if (!navigatingHistory) previousQueue = null;
      remember(p);
      state.current = { id, file, original, photo: { ...p }, appliedAt: new Date().toISOString() };
      state.history = [{ id, appliedAt: state.current.appliedAt }, ...state.history].slice(0, 200);
      await save();
    });
    lockScreenWarning = result.lockScreen === 'failed' && state.settings.syncLockScreen
      ? diagnostics.redact(result.error, key) : '';
    if (!lockScreenWarning) lockScreenWarningNotified = false;
    await trimCache(); publish(); return snapshot();
  } finally { applying = false; }
}
// Redraws the current Unsplash wallpaper in the newly chosen credit style, without adding to history.
async function restyleCurrent() {
  const current = state.current;
  if (!current || current.photo?.source !== 'unsplash') return;
  if (applying) throw new Error(__("err.applying"));
  applying = true;
  try {
    setStage('apply');
    const p = known.get(current.id) || current.photo;
    // Reuse the undecorated original when it is still cached, so a style switch never re-downloads.
    const original = current.original && await fs.access(current.original).then(() => current.original, () => '') || await photoFile(p);
    setStage('apply');
    const file = await creditedFile(p, original);
    if (file === current.file || state.current !== current) return;
    const result = await wallpaper.apply(file, state.settings, async () => { state.current = { ...current, file, original }; await save(); });
    lockScreenWarning = result.lockScreen === 'failed' && state.settings.syncLockScreen ? diagnostics.redact(result.error, key) : '';
    if (!lockScreenWarning) lockScreenWarningNotified = false;
    await trimCache(); publish();
  } finally { applying = false; }
}
// No-op when the current wallpaper already uses the chosen style (e.g. the running change picked it up).
async function restyle() {
  if (change || selecting || applying) { restylePending = true; return; }
  await tracked('window', restyleCurrent).catch(() => {});
}
function rotationPool(settings = state.settings) {
  const selected = settings.rotationSource;
  const ids = selected.startsWith('playlist:') ? state.playlists.find(p => p.id === selected.slice(9))?.photoIds || [] : state.favorites;
  return (selected === 'library' ? state.photos.filter(p => p.source === 'local') : state.photos.filter(p => ids.includes(p.id))).filter(p => core.matchesPhoto(p, settings));
}
// Wraps a wallpaper change so the tray / menu bar and the window can show what is happening.
async function tracked(origin, work) {
  if (change || selecting || applying) throw new Error(__("err.busy"));
  clearTimeout(flashTimer); flash = null;
  change = { stage: 'select', received: 0, total: 0, note: '', origin };
  startSpinner(); refreshChange();
  try {
    const result = await work();
    lastError = ''; finishChange(lockScreenWarning ? 'warning' : 'ok', origin);
    return result;
  } catch (error) {
    // A change cancelled by the user (paused / source edited) is not a failure worth flagging.
    if (error.cancelled) finishChange(null, origin);
    else { lastError = diagnostics.redact(error.message || __('err.failed'), key); finishChange('error', origin); }
    throw error;
  } finally {
    if (restylePending) { restylePending = false; setImmediate(() => void restyle()); }
  }
}
function setStage(stage, patch = {}) {
  if (!change) return;
  const updated = { ...change, ...(stage !== change.stage ? { received: 0, total: 0 } : {}), stage, ...patch };
  const changed = trayStatus.statusText(updated) !== trayStatus.statusText(change);
  change = updated;
  if (changed) refreshChange();
}
function startSpinner() {
  clearInterval(spinTimer);
  if (process.platform !== 'darwin') return;
  spinTimer = setInterval(() => { spinTick++; if (tray && change) tray.setTitle(trayStatus.menuBarTitle(change, spinTick), { fontType: 'monospacedDigit' }); }, 100);
}
function finishChange(result, origin) {
  clearInterval(spinTimer); change = null; flash = result;
  refreshChange();
  if (!result) return;
  flashTimer = setTimeout(() => { flash = null; updateTray(); }, result === 'ok' ? 2500 : 6000);
  const hidden = !(win && !win.isDestroyed() && win.isVisible() && win.isFocused());
  if (hidden && (origin === 'tray' || (origin === 'auto' && result === 'warning' && !lockScreenWarningNotified))) {
    notifyResult(result);
    if (result === 'warning') lockScreenWarningNotified = true;
  }
}
function notifyResult(result) {
  if (!Notification.isSupported()) return;
  const p = state.current && known.get(state.current.id);
  const notice = result === 'warning'
    ? new Notification({ title: __('warn.lockScreen'), body: __('notify.lockScreenBody'), silent: true })
    : result === 'ok'
    ? new Notification({ title: __('notify.okTitle'), body: p ? `${p.title} · ${p.author}` : __('notify.okBody'), silent: true })
    : new Notification({ title: __('notify.errorTitle'), body: __('notify.errorBody', { reason: trayStatus.truncate(trayStatus.firstLine(lastError), 80) }), silent: true });
  if (result !== 'ok') notice.on('click', () => { win.show(); win.focus(); });
  notice.show();
}
function refreshChange() {
  const text = trayStatus.statusText(change);
  if (text !== lastChangeText && win && !win.isDestroyed()) win.webContents.send('framewall:changing', text);
  lastChangeText = text;
  updateTray({ force: false });
}
async function next(automatic = false, origin = automatic ? 'auto' : 'window') {
  return tracked(origin, () => pickAndApply(automatic));
}
async function pickAndApply(automatic) {
  selecting = true;
  try {
    if (state.settings.rotationSource === 'online') {
      if (!key) throw new Error(__("err.onlineNoKey"));
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
      if (!stillCurrent()) throw Object.assign(new Error(__("err.selectCancelled")), { cancelled: true });
      known.set(result.photo.id, result.photo);
      return await apply(result.photo.id, stillCurrent);
    }
    const pool = [];
    for (const p of rotationPool()) {
      if (p.source === 'local') { try { await fs.access(p.localPath); p.missing = false; } catch { p.missing = true; continue; } }
      pool.push(p);
    }
    if (!pool.length) { await save(); publish(); }
    return await apply(core.nextPhoto(pool, state.current?.id, state.settings.order).id);
  } finally { selecting = false; }
}
async function rotationTick() {
  if (clockRunning || indexing || !state.settings.rotation || !state.nextRotationAt || Date.now() < state.nextRotationAt || applying || selecting || change) return;
  clockRunning = true;
  try { await next(true); } catch (error) { publish(error.message); }
  finally {
    state.nextRotationAt = state.settings.rotation ? Date.now() + state.settings.interval * 60000 : null;
    try { await save(); publish(); } catch (error) { publish(error.message); }
    clockRunning = false;
  }
}
function schedule(reset = false) {
  state.nextRotationAt = rotationClock.deadline(state.settings, reset ? null : state.nextRotationAt);
  clearInterval(timer);
  if (state.settings.rotation) timer = setInterval(() => void rotationTick(), 1000);
  updateTray();
}
async function saveSettings(input) {
  const settings = core.normalizeSettings(input);
  let warning;
  if (settings.rotationSource === 'online') {
    if (settings.rotation) { if (!key) throw new Error(__("err.enableNoKey")); core.normalizeOnlineSource(settings.onlineSource); }
  } else if (settings.rotation && !rotationPool(settings).length) {
    if (!state.settings.rotation) throw new Error(__("err.emptyPool"));
    settings.rotation = false; warning = __('warn.poolPaused');
  }
  if (settings.autostart !== state.settings.autostart) {
    if (!app.isPackaged && settings.autostart) throw new Error(__("err.autostartDev"));
    app.setLoginItemSettings({ openAtLogin: settings.autostart });
  }
  if (settings.language !== state.settings.language) { lastMenuKey = null; applyLanguage(settings.language); updates?.refresh(); }
  if (!settings.syncLockScreen) { lockScreenWarning = ''; lockScreenWarningNotified = false; }
  const reset = rotationClock.rotationKey(state.settings) !== rotationClock.rotationKey(settings);
  const restyled = settings.creditStyle !== state.settings.creditStyle;
  state.settings = settings; schedule(reset); await save(); publish(warning);
  // A new credit style shows up on the current wallpaper right away (or right after a running change).
  // Failures are reported like a failed change; the setting itself stays saved.
  if (restyled) await restyle();
  return snapshot();
}
// macOS menu bar: black + alpha template image; the system tints it for light/dark menu bars and the highlighted state.
// Windows tray: full-color icon. Both load 1x and 2x explicitly so packaged (asar) builds stay sharp on HiDPI screens.
function trayIcon() {
  const name = process.platform === 'darwin' ? 'trayTemplate' : 'tray';
  const image = nativeImage.createEmpty();
  for (const [scaleFactor, suffix] of [[1, ''], [2, '@2x']]) image.addRepresentation({ scaleFactor, buffer: require('node:fs').readFileSync(path.join(__dirname, 'assets', `${name}${suffix}.png`)) });
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}
function updateTray({ force = true } = {}) {
  if (!tray) return;
  tray.setToolTip(trayStatus.tooltip(change, { rotation: state.settings.rotation, lastError, lockScreenWarning }));
  if (process.platform === 'darwin') tray.setTitle(trayStatus.menuBarTitle(change, spinTick, flash), { fontType: 'monospacedDigit' });
  // Rebuild the menu only when its content would visibly change, so download ticks don't thrash it.
  const menuKey = [trayStatus.menuKey(change), flash, lastError, lockScreenWarning, state.current?.id, state.settings.rotation].join('#');
  if (!force && menuKey === lastMenuKey) return;
  lastMenuKey = menuKey;
  const p = state.current && known.get(state.current.id);
  const status = change ? `⏳ ${trayStatus.statusText(change)}`
    : lastError ? __('tray.failedLine', { reason: trayStatus.truncate(trayStatus.firstLine(lastError), 26) })
    : lockScreenWarning ? __('tray.lockScreenWarning')
    : p ? (flash === 'ok' ? __('tray.applied', { title: trayStatus.truncate(p.title, 22) }) : __('tray.current', { title: trayStatus.truncate(p.title, 22) })) : '';
  tray.setContextMenu(Menu.buildFromTemplate([
    ...(status ? [{ label: status, enabled: !!(lastError || lockScreenWarning) && !change, click: () => { win.show(); win.focus(); } }, { type: 'separator' }] : []),
    { label: __('tray.open'), click: () => { win.show(); win.focus(); } },
    { label: change ? __('tray.changing') : __('tray.next'), enabled: !change, click: () => next(false, 'tray').catch(e => publish(e.message)) },
    { label: __('tray.rotation'), type: 'checkbox', checked: state.settings.rotation, click: item => { saveSettings({ ...state.settings, rotation: item.checked }).catch(e => publish(e.message)); } },
    { type: 'separator' },
    { label: __('tray.quit'), click: () => { closing = true; app.quit(); } },
  ]));
}
function registerIPC() {
  const handlers = {
    'update-status': () => updates.get(),
    'check-update': () => updates.check(),
    'install-update': () => updates.install(),
    'open-downloaded-update': () => updates.openDownloaded(),
    'open-update': async () => shell.openExternal(updateCore.trustedReleaseUrl(updates.get().url)),
    bootstrap: () => snapshot(), query, connect,
    credential: () => key,
    disconnect: async () => { await fs.rm(path.join(app.getPath('userData'), 'credential.bin'), { force: true }); key = ''; topicIds.clear(); if (state.settings.rotationSource === 'online') { state.settings.rotation = false; await save(); schedule(); } publish(); return snapshot(); },
    import: importFiles,
    'rescan-library': rescanLibrary, 'remove-photo': removePhoto, 'relink-photo': relinkPhoto, previous: previousWallpaper,
    'dismiss-recovery': async () => { recovery = ''; return snapshot(); },
    'restore-backup': async () => {
      if (indexing || applying || selecting) throw new Error(__('err.busy'));
      const answer = await dialog.showMessageBox(win, { type: 'warning', message: __('backup.confirm'), buttons: [__('backup.restore'), __('import.cancel')], defaultId: 1, cancelId: 1 });
      if (answer.response !== 0) return snapshot();
      if (indexing || applying || selecting) throw new Error(__('err.busy'));
      await saveQueue;
      const saved = libraryStore.parseLibrary(await fs.readFile(storePath + '.bak', 'utf8'));
      await fs.copyFile(storePath, storePath + `.before-restore-${Date.now()}`);
      const activeWallpaper = state.current;
      state = { photos: [], favorites: [], playlists: [], history: [], ...saved, current: activeWallpaper, settings: core.restoreSettings(saved.settings) };
      state.settings.rotation = false; state.nextRotationAt = null;
      known.clear(); imported.clear(); previousQueue = null;
      registerPhotos(); applyLanguage(); recovery = 'restored'; schedule(); await save(); publish(); return snapshot();
    },
    favorite: async ({ id }) => { const p = getPhoto(id); remember(p); state.favorites = state.favorites.includes(id) ? state.favorites.filter(f => f !== id) : [...state.favorites, id]; await save(); publish(); return snapshot(); },
    playlist: async ({ action, id, name, photoId }) => {
      if (action === 'create') { if (!String(name || '').trim()) throw new Error(__("err.playlistName")); state.playlists.push({ id: require('node:crypto').randomUUID(), name: String(name).trim().slice(0, 60), photoIds: [] }); }
      else { const list = state.playlists.find(p => p.id === id); if (!list) throw new Error(__("err.playlistMissing"));
        if (action === 'delete') { state.playlists = state.playlists.filter(p => p.id !== id); if (state.settings.rotationSource === `playlist:${id}`) { state.settings.rotation = false; state.settings.rotationSource = 'favorites'; schedule(); } }
        else if (action === 'toggle') { remember(getPhoto(photoId)); list.photoIds = list.photoIds.includes(photoId) ? list.photoIds.filter(p => p !== photoId) : [...list.photoIds, photoId]; }
        else throw new Error(__("err.playlistAction")); }
      await save(); publish(); return snapshot();
    },
    settings: saveSettings,
    wallpaper: ({ id }) => tracked('window', () => apply(id)), next: () => next(),
    download: async ({ id }) => { const p = getPhoto(id); const result = await dialog.showSaveDialog(win, { defaultPath: `${p.id}${p.source === 'local' ? path.extname(p.localPath) : '.jpg'}`, filters: [{ name: __('import.filter'), extensions: p.source === 'local' ? [path.extname(p.localPath).slice(1)] : ['jpg'] }] }); if (result.canceled) return { canceled: true }; const file = await photoFile(p); if (path.resolve(file) !== path.resolve(result.filePath)) await fs.copyFile(file, result.filePath); await trimCache(); return { canceled: false }; },
    cache: cacheInfo,
    'clear-cache': async () => { for (const file of await fs.readdir(cachePath)) { const target = path.join(cachePath, file); if (target !== state.current?.file && target !== state.current?.original) await fs.unlink(target); } return cacheInfo(); },
    'open-link': async ({ url }) => { const u = new URL(url); if (u.protocol !== 'https:' || !['unsplash.com', 'help.unsplash.com'].includes(u.hostname)) throw new Error(__("err.linkHost")); u.searchParams.set('utm_source', 'framewall'); u.searchParams.set('utm_medium', 'referral'); await shell.openExternal(u.toString()); },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`framewall:${name}`, async (event, input) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error(__("err.sender"));
    try { return await handler(input); } catch (error) { throw new Error(diagnostics.redact(error.message || __('err.failed'), key)); }
  });
}
function registerPhotos() {
  if (state.current?.photo) { const p = state.current.photo; known.set(p.id, p); if (p.source === 'local') imported.set(p.id, p.localPath); }
  state.photos.forEach(p => {
    if (p.source === 'local') { p.thumb = `framewall://thumb/${p.id}?v=${p.modifiedAt || 0}`; imported.set(p.id, p.localPath); }
    known.set(p.id, p);
  });
}
async function servePhoto(request) {
  const url = new URL(request.url), id = decodeURIComponent(url.pathname.slice(1));
  // Downloaded Unsplash originals, only for the credit renderer.
  const cached = url.hostname === 'cache' && /^[a-zA-Z0-9_-]{1,140}\.jpg$/.test(id) ? path.join(cachePath, id) : '';
  let file = cached || imported.get(id);
  if (!file || !['photo', 'thumb', 'cache'].includes(url.hostname)) return new Response('Not found', { status: 404 });
  try {
    if (url.hostname === 'thumb') {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return new Response('Not found', { status: 404 });
      const target = path.join(thumbnailPath, id + '.jpg');
      try { await fs.access(target); }
      catch {
        if (!thumbnails.has(id)) thumbnails.set(id, (async () => {
          const image = await nativeImage.createThumbnailFromPath(file, { width: 600, height: 600 });
          await fs.writeFile(target, image.toJPEG(80));
        })().finally(() => thumbnails.delete(id)));
        await thumbnails.get(id);
      }
      file = target;
    }
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers); headers.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, { status: response.status, headers });
  } catch { return new Response('Not found', { status: 404 }); }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    storePath = path.join(app.getPath('userData'), 'library.json'); cachePath = path.join(app.getPath('userData'), 'wallpapers');
    await fs.mkdir(cachePath, { recursive: true });
    if (process.platform === 'win32') app.setAppUserModelId('studio.framewall.desktop');
    if (!smoke) { const loaded = await libraryStore.loadLibrary(storePath); recovery = loaded.recovery; if (loaded.data) state = { ...state, ...loaded.data, settings: core.restoreSettings(loaded.data.settings) }; }
    thumbnailPath = path.join(app.getPath('userData'), 'thumbnails');
    await fs.mkdir(thumbnailPath, { recursive: true });
    applyLanguage();
    registerPhotos();
    try { if (safeStorage.isEncryptionAvailable()) key = safeStorage.decryptString(await fs.readFile(path.join(app.getPath('userData'), 'credential.bin'))); } catch {}
    protocol.handle('framewall', servePhoto);
    powerMonitor.on('resume', () => void rotationTick());
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 980, minHeight: 700, show: !smoke, backgroundColor: '#f5f5f0', title: i18n.t('app.title'), icon: path.join(__dirname, 'assets', 'icon.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
    win.on('close', event => { if (!closing && state.settings.minimizeToTray) { event.preventDefault(); win.hide(); } });
    if (process.platform === 'darwin' && dev) app.dock?.setIcon(path.join(__dirname, 'assets', 'dock.png'));
    tray = new Tray(trayIcon());
    tray.on('double-click', () => { win.show(); win.focus(); });
    updates = require('./updater.cjs')({ app, shell, disabled: smoke || dev, notify: value => { if (!win.isDestroyed()) win.webContents.send('framewall:updater', value); }, beforeInstall: async () => { if (applying || selecting) throw new Error(__("err.installBusy")); await saveQueue; closing = true; clearInterval(timer); } });
    registerIPC();
    const previousDeadline = state.nextRotationAt; schedule();
    if (recovery || (state.settings.rotation && previousDeadline !== state.nextRotationAt)) await save();
    updates.start();
    if (dev) await win.loadURL('http://127.0.0.1:5173'); else await win.loadFile(path.join(__dirname, '../dist/index.html'));
    if (smoke) {
      try {
        await require('./smoke.cjs')({ app, win, indexFiles, setNativeWallpaper, snapshot, run, connect });
        closing = true; app.quit();
      } catch (error) { console.error('SMOKE FAILED:', error); closing = true; app.exit(1); }
    }
  }).catch(error => { dialog.showErrorBox(i18n.t('app.startFailed'), error.message); closing = true; app.quit(); });
  app.on('before-quit', () => { closing = true; clearInterval(timer); updates?.stop(); });
  app.on('window-all-closed', () => app.quit());
}
