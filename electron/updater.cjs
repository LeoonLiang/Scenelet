const fs = require('node:fs');
const path = require('node:path');
const core = require('./update-core.cjs');
const { t } = require('./i18n.cjs');
const { downloadReleaseAsset } = require('./update-download.cjs');
module.exports = function createUpdater({ app, shell, notify, beforeInstall, disabled }) {
  const supported = ['x64', 'arm64'].includes(process.arch) && ['win32', 'darwin'].includes(process.platform);
  const installedWindows = app.isPackaged && process.platform === 'win32' && fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'Uninstall Scenelet.exe'));
  const mode = disabled || !app.isPackaged || !supported ? 'disabled' : installedWindows ? 'automatic' : 'manual';
  let status = { mode, state: 'idle', currentVersion: app.getVersion(), version: '', percent: 0, url: core.releasesUrl, packageType: process.platform === 'darwin' ? 'dmg' : 'zip' };
  // Keep the message key, not the text, so a language switch can re-render the current status.
  let text = [mode === 'disabled' ? 'update.disabled' : mode === 'manual' ? process.platform === 'darwin' ? 'update.manualMac' : 'update.manualPortable' : 'update.automatic', {}];
  const view = () => ({ ...status, message: t(...text) });
  status = view();
  let checking = false, timer, startup, downloadedFile;
  const lifetime = new AbortController();
  const set = (patch, key, vars = {}) => { if (key) text = [key, vars]; status = { ...status, ...patch }; status = view(); notify(status); };
  let updater;
  if (mode === 'automatic') {
    updater = require('electron-updater').autoUpdater;
    updater.setFeedURL({ provider: 'github', owner: 'LeoonLiang', repo: 'Scenelet', channel: core.channel(process.arch) });
    updater.channel = core.channel(process.arch); updater.allowPrerelease = false; updater.allowDowngrade = false;
    updater.autoDownload = true; updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => set({ state: 'checking' }, 'update.checking'));
    updater.on('update-available', info => set({ state: 'downloading', version: info.version, percent: 0 }, 'update.downloading'));
    updater.on('download-progress', info => set({ state: 'downloading', percent: Math.round(info.percent) }, 'update.progress', { percent: Math.round(info.percent) }));
    updater.on('update-not-available', () => set({ state: 'current' }, 'update.current'));
    updater.on('update-downloaded', info => set({ state: 'ready', version: info.version, percent: 100 }, 'update.ready'));
    updater.on('error', error => set({ state: 'error' }, 'update.failed', { reason: String(error.message).slice(0, 700) }));
  }
  async function check() {
    if (mode === 'disabled' || lifetime.signal.aborted || checking || ['downloading', 'ready', 'downloaded'].includes(status.state)) return status;
    checking = true;
    try {
      set({ state: 'checking' }, 'update.checking');
      if (updater) await updater.checkForUpdates();
      else {
        const response = await fetch(`https://api.github.com/repos/${core.repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(30000)]) });
        if (response.status === 404) { set({ state: 'idle' }, 'update.noRelease'); return status; }
        if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
        const release = await response.json();
        if (release.draft || release.prerelease || !core.version(release.tag_name)) throw new Error(t('update.badVersion'));
        if (!core.newer(release.tag_name, app.getVersion())) set({ state: 'current' }, 'update.current');
        else {
          const name = core.assetName(release.tag_name, process.platform, process.arch, process.platform === 'win32');
          const asset = release.assets.find(a => a.name === name);
          set({ state: 'available', version: release.tag_name.replace(/^v/, ''), url: asset ? core.trustedReleaseUrl(asset.browser_download_url) : core.releasesUrl }, asset ? 'update.available' : 'update.noAsset');
          if (asset) {
            set({ state: 'downloading', percent: 0 }, 'update.downloading');
            try {
              downloadedFile = await downloadReleaseAsset({ asset, release, directory: path.join(app.getPath('userData'), 'updates'), signal: lifetime.signal, fetchImpl: fetch,
                onProgress: percent => set({ percent }, 'update.progress', { percent }),
              });
              set({ state: 'downloaded', percent: 100 }, process.platform === 'darwin' ? 'update.downloadedMac' : 'update.downloadedPortable');
            } catch (error) { if (!lifetime.signal.aborted) set({ state: 'error', percent: 0 }, 'update.failed', { reason: error.message }); }
          }
        }
      }
    } catch (error) { if (!lifetime.signal.aborted) set({ state: 'error' }, 'update.checkFailed', { reason: error.message }); }
    finally { checking = false; }
    return status;
  }
  async function install() { if (mode !== 'automatic' || status.state !== 'ready') throw new Error(t('update.notReady')); await beforeInstall(); updater.quitAndInstall(false, true); }
  async function openDownloaded() {
    if (status.state !== 'downloaded' || !downloadedFile) throw new Error(t('update.notReady'));
    if (!fs.existsSync(downloadedFile)) {
      downloadedFile = undefined;
      set({ state: 'error', percent: 0 }, 'update.downloadMissing');
      throw new Error(t('update.downloadMissing'));
    }
    if (process.platform === 'darwin') {
      const error = await shell.openPath(downloadedFile);
      if (error) throw new Error(error);
      await beforeInstall();
      app.quit();
    } else shell.showItemInFolder(downloadedFile);
  }
  function start() { if (mode === 'disabled') return; startup = setTimeout(() => void check(), 30000); timer = setInterval(() => void check(), 6 * 60 * 60000); }
  return { get: () => status, refresh: () => { status = view(); notify(status); }, check, install, openDownloaded, start, stop: () => { clearTimeout(startup); clearInterval(timer); lifetime.abort(); } };
};
