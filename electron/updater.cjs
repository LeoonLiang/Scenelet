const fs = require('node:fs');
const path = require('node:path');
const core = require('./update-core.cjs');
module.exports = function createUpdater({ app, notify, beforeInstall, disabled }) {
  const supported = ['x64', 'arm64'].includes(process.arch) && ['win32', 'darwin'].includes(process.platform);
  const installedWindows = app.isPackaged && process.platform === 'win32' && fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'Uninstall Scenelet.exe'));
  const mode = disabled || !app.isPackaged || !supported ? 'disabled' : installedWindows ? 'automatic' : 'manual';
  let status = { mode, state: 'idle', currentVersion: app.getVersion(), version: '', percent: 0, message: mode === 'disabled' ? '开发 / 预览模式不执行自动更新。' : mode === 'manual' ? process.platform === 'darwin' ? '当前 Mac 包未签名，请下载新版 DMG 更新。' : '便携版请下载新版 ZIP，退出应用后替换程序文件。' : '自动检查并下载更新，准备好后由你确认重启安装。', url: core.releasesUrl };
  let checking = false, timer, startup;
  const set = patch => { status = { ...status, ...patch }; notify(status); };
  let updater;
  if (mode === 'automatic') {
    updater = require('electron-updater').autoUpdater;
    updater.setFeedURL({ provider: 'github', owner: 'LeoonLiang', repo: 'Scenelet', channel: core.channel(process.arch) });
    updater.channel = core.channel(process.arch); updater.allowPrerelease = false; updater.allowDowngrade = false;
    updater.autoDownload = true; updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => set({ state: 'checking', message: '正在检查 GitHub Releases…' }));
    updater.on('update-available', info => set({ state: 'downloading', version: info.version, message: '发现新版，正在后台下载…', percent: 0 }));
    updater.on('download-progress', info => set({ state: 'downloading', percent: Math.round(info.percent), message: `正在下载更新 · ${Math.round(info.percent)}%` }));
    updater.on('update-not-available', () => set({ state: 'current', message: '当前已是最新版本。' }));
    updater.on('update-downloaded', info => set({ state: 'ready', version: info.version, percent: 100, message: '新版已下载。点击重启安装，收藏与 Key 会保留。' }));
    updater.on('error', error => set({ state: 'error', message: `更新失败：${String(error.message).slice(0, 700)}。可重试或到 Releases 下载。` }));
  }
  async function check() {
    if (mode === 'disabled' || checking || ['downloading', 'ready'].includes(status.state)) return status;
    checking = true;
    try {
      set({ state: 'checking', message: '正在检查 GitHub Releases…' });
      if (updater) await updater.checkForUpdates();
      else {
        const response = await fetch(`https://api.github.com/repos/${core.repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
        if (response.status === 404) { set({ state: 'idle', message: '暂时没有已发布的正式版本。' }); return status; }
        if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
        const release = await response.json();
        if (release.draft || release.prerelease || !core.version(release.tag_name)) throw new Error('版本信息格式不正确');
        if (!core.newer(release.tag_name, app.getVersion())) set({ state: 'current', message: '当前已是最新版本。' });
        else {
          const name = core.assetName(release.tag_name, process.platform, process.arch, process.platform === 'win32');
          const asset = release.assets.find(a => a.name === name);
          set({ state: 'available', version: release.tag_name.replace(/^v/, ''), url: asset ? core.trustedReleaseUrl(asset.browser_download_url) : core.releasesUrl, message: asset ? '发现新版，点击下载后替换 / 安装。' : '发现新版，此系统包尚不可用，请查看 Releases。' });
        }
      }
    } catch (error) { set({ state: 'error', message: `检查更新失败：${error.message}。请稍后重试。` }); }
    finally { checking = false; }
    return status;
  }
  async function install() { if (mode !== 'automatic' || status.state !== 'ready') throw new Error('更新尚未下载完成。'); await beforeInstall(); updater.quitAndInstall(false, true); }
  function start() { if (mode === 'disabled') return; startup = setTimeout(() => void check(), 30000); timer = setInterval(() => void check(), 6 * 60 * 60000); }
  return { get: () => status, check, install, start, stop: () => { clearTimeout(startup); clearInterval(timer); } };
};
