const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('Windows PowerShell waits for a real WinRT IAsyncAction without a COM cast', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenelet-winrt-'));
  const file = path.join(dir, "照片 O'Brien [test].txt");
  try {
    fs.writeFileSync(file, 'before');
    const source = fs.readFileSync(path.join(__dirname, '../electron/lock-screen.ps1'), 'utf8');
    // Exercise the production bridge with a harmless IAsyncAction; never change the user's lock screen.
    const script = source.replace(
      '[Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)',
      "[Windows.Storage.FileIO, Windows.Storage, ContentType = WindowsRuntime]::WriteTextAsync($file, 'completed')",
    );
    assert.notEqual(script, source);
    const systemDir = process.arch === 'ia32' && process.env.PROCESSOR_ARCHITEW6432 ? 'Sysnative' : 'System32';
    const powershell = path.join(process.env.SystemRoot, systemDir, 'WindowsPowerShell/v1.0/powershell.exe');
    execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: { ...process.env, FRAMEWALL_IMAGE: file }, windowsHide: true, timeout: 30000,
    });
    assert.equal(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), 'completed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
