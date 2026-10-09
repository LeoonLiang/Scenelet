// "Preview desktop": move every window out of the way so the real desktop (wallpaper, icons, Dock / taskbar) shows,
// then put the other apps back when the user returns to Scenelet.
// macOS uses the public NSApplication actions behind the "Hide Others" / "Show All" menu items, so no extra permission is needed.
// Windows uses Shell.Application MinimizeAll / UndoMinimizeALL, which only restores the windows it minimized.
const path = require('node:path');

function createDesktopPeek({ platform = process.platform, env = process.env, app, Menu, run, getWindow }) {
  let active = false;
  const powershell = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const shell = method => run(powershell, ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject Shell.Application).${method}()`], { windowsHide: true, timeout: 10000 });

  async function show() {
    const win = getWindow();
    if (platform === 'darwin') {
      Menu.sendActionToFirstResponder('hideOtherApplications:');
      app.hide();
    } else if (platform === 'win32') {
      await shell('MinimizeAll');
      if (win && !win.isMinimized()) win.minimize();
    } else if (win) win.minimize();
    // Set last: a focus event that arrives while windows are still moving away must not undo the preview.
    active = true;
  }

  // Called whenever Scenelet comes back (window focus, Dock / taskbar / tray). Safe to call when no preview is running.
  async function restore() {
    if (!active) return false;
    active = false;
    if (platform === 'darwin') Menu.sendActionToFirstResponder('unhideAllApplications:');
    else if (platform === 'win32') await shell('UndoMinimizeALL').catch(() => {});
    return true;
  }

  return { show, restore, get active() { return active; } };
}

module.exports = { createDesktopPeek };
