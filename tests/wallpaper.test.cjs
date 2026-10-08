const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../electron/core.cjs');

const image = String.raw`C:\照片\O'Brien $wall; [mountain].jpg`;
const settings = { ...core.defaults, syncLockScreen: true };
function service(run, platform = 'win32', extra = {}) {
  return require('../electron/native-wallpaper.cjs').createWallpaperService({ run, platform, env: { SystemRoot: 'C:\\Windows' }, arch: 'x64', ...extra });
}

test('fresh installs sync but legacy Windows settings require an explicit choice', () => {
  assert.equal(core.defaults.syncLockScreen, true);
  const migrated = core.restoreSettings({ interval: 7, rotation: true }, 'win32');
  assert.equal(migrated.syncLockScreen, false);
  assert.equal(migrated.lockScreenPrompt, true);
  assert.equal(migrated.rotation, true);
  assert.equal(migrated.interval, 7);
  assert.deepEqual(core.restoreSettings(JSON.parse(JSON.stringify(migrated)), 'win32'), migrated);
});

test('saved lock-screen choice survives reload and unrelated setting changes', () => {
  for (const enabled of [true, false]) {
    const saved = core.normalizeSettings({ syncLockScreen: enabled, lockScreenPrompt: false });
    const reloaded = core.restoreSettings(saved, 'win32');
    assert.equal(reloaded.syncLockScreen, enabled);
    assert.equal(reloaded.lockScreenPrompt, false);
    assert.equal(core.normalizeSettings({ ...reloaded, interval: 7 }).syncLockScreen, enabled);
  }
  assert.equal(core.normalizeSettings({ syncLockScreen: 'true' }).syncLockScreen, false);
  assert.equal(core.normalizeSettings({ syncLockScreen: true, lockScreenPrompt: true }).lockScreenPrompt, false);
  assert.equal(core.restoreSettings({}, 'darwin').lockScreenPrompt, false);
});

test('enabled sync sends the same literal path to desktop and lock screen, waiting for completion', async () => {
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const native = service(async (command, args, options) => {
    calls.push({ command, args, options });
    if (calls.length === 2) await gate;
    return { stdout: '', stderr: '' };
  });
  let finished = false;
  const task = native.apply(image, settings).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(finished, false);
  for (const call of calls) {
    assert.equal(call.options.env.FRAMEWALL_IMAGE, image);
    assert.equal(call.options.windowsHide, true);
    assert.ok(call.options.timeout > 0 && call.options.timeout <= 30000);
    assert.ok(!call.args.join(' ').includes(image));
    assert.equal(call.command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  }
  release();
  assert.deepEqual(await task, { lockScreen: 'synced' });
});

test('disabled synchronization and desktop-only smoke do not touch lock screen', async () => {
  let calls = 0;
  const native = service(async () => { calls++; });
  assert.deepEqual(await native.apply(image, { ...settings, syncLockScreen: false }), { lockScreen: 'disabled' });
  assert.equal(calls, 1);
  await native.setDesktop(image, 'fill');
  assert.equal(calls, 2);
});

test('lock-screen denial is partial success and a later change can recover', async () => {
  let calls = 0;
  const native = service(async () => {
    if (++calls === 2) throw Object.assign(new Error('Command failed: large script'), { stderr: 'Access is denied.\n' });
  });
  assert.deepEqual(await native.apply(image, settings), { lockScreen: 'failed', error: 'Access is denied.' });
  assert.deepEqual(await native.apply(image, settings), { lockScreen: 'synced' });
});

test('desktop failures reject and never attempt lock screen', async () => {
  let calls = 0;
  const native = service(async () => { calls++; throw new Error('Desktop denied'); });
  await assert.rejects(native.apply(image, settings), /Desktop denied/);
  assert.equal(calls, 1);
});

test('lock-screen failures always carry a nonempty warning, including timeout and empty stderr', async () => {
  for (const failure of [Object.assign(new Error('Command failed: script'), { stderr: ' \n' }), Object.assign(new Error('Command failed: script'), { killed: true })]) {
    let calls = 0;
    const native = service(async () => { if (++calls === 2) throw failure; });
    const result = await native.apply(image, settings);
    assert.equal(result.lockScreen, 'failed');
    assert.ok(result.error.trim());
    assert.ok(!result.error.includes('script'));
  }
});

test('macOS retains argv-based desktop setting and never runs Windows synchronization', async () => {
  const calls = [];
  const native = service(async (...args) => { calls.push(args); }, 'darwin');
  assert.deepEqual(await native.apply('/照片/O\'Brien.jpg', settings), { lockScreen: 'disabled' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/usr/bin/osascript');
  assert.equal(calls[0][1].at(-1), '/照片/O\'Brien.jpg');
});

test('unsupported platforms reject instead of reporting success', async () => {
  const native = service(async () => { assert.fail('No OS command expected'); }, 'linux');
  await assert.rejects(native.apply(image, settings));
});

test('a 32-bit host on 64-bit Windows selects native PowerShell for the lock-screen API', async () => {
  const calls = [];
  const native = service(async command => { calls.push(command); }, 'win32', { arch: 'ia32', env: { SystemRoot: 'C:\\Windows', PROCESSOR_ARCHITEW6432: 'AMD64' } });
  await native.apply(image, settings);
  assert.equal(calls[1], 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
});
