const fs = require('node:fs');
const path = require('node:path');
const { t } = require('./i18n.cjs');

function createWallpaperService({ run, platform = process.platform, env = process.env, arch = process.arch }) {
  // WinRT lock-screen calls cannot run in an x86 process on an x64 OS.
  const systemDir = arch === 'ia32' && env.PROCESSOR_ARCHITEW6432 ? 'Sysnative' : 'System32';
  const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', systemDir, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const runWindows = (script, file) => run(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script], {
    windowsHide: true, env: { ...env, FRAMEWALL_IMAGE: file }, timeout: 30000,
  });

  async function setDesktop(file, fit) {
    if (platform === 'win32') {
      const styles = { fill: ['10', '0'], fit: ['6', '0'], stretch: ['2', '0'], center: ['0', '0'] };
      const [style, tile] = styles[fit] || styles.fill;
      // Only fixed source code is executed; image paths travel through the environment.
      const script = `$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class FrameWallNative { [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SystemParametersInfo(int action, int param, string value, int flags); }'; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '${style}'; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '${tile}'; if (-not [FrameWallNative]::SystemParametersInfo(20, 0, $env:FRAMEWALL_IMAGE, 3)) { throw 'Windows could not set the wallpaper' }`;
      await runWindows(script, file);
    } else if (platform === 'darwin') {
      const script = 'on run argv\n tell application "System Events"\n set picture of every desktop to item 1 of argv\n end tell\n end run';
      await run('/usr/bin/osascript', ['-e', script, file], { timeout: 30000 });
    } else throw new Error(t('err.platform'));
  }

  async function apply(file, settings, onDesktopApplied) {
    await setDesktop(file, settings.fit);
    await onDesktopApplied?.();
    if (platform !== 'win32' || settings.syncLockScreen !== true) return { lockScreen: 'disabled' };
    try {
      await runWindows(fs.readFileSync(path.join(__dirname, 'lock-screen.ps1'), 'utf8'), file);
      return { lockScreen: 'synced' };
    } catch (error) {
      // Do not expose execFile's command (the full script) in user-facing diagnostics.
      const detail = (String(error.stderr || '').trim() || (error.killed ? t('warn.lockScreenTimeout') : String(error.code || t('warn.lockScreenUnknown')))).slice(0, 2000);
      return { lockScreen: 'failed', error: detail };
    }
  }
  return { setDesktop, apply };
}

module.exports = { createWallpaperService };
