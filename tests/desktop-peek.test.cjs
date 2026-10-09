const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopPeek } = require('../electron/desktop-peek.cjs');

function fakes(platform) {
  const calls = [];
  const win = { minimized: false, isMinimized() { return this.minimized; }, minimize() { this.minimized = true; calls.push('minimize'); } };
  const peek = createDesktopPeek({
    platform, env: { SystemRoot: 'C:\\Windows' }, getWindow: () => win,
    app: { hide: () => calls.push('app.hide') },
    Menu: { sendActionToFirstResponder: action => calls.push(action) },
    run: async (file, args) => { calls.push(`${file.split('\\').pop()} ${args.at(-1)}`); },
  });
  return { calls, peek, win };
}

test('macOS hides the other apps and itself, then shows them all again once', async () => {
  const { calls, peek } = fakes('darwin');
  assert.equal(await peek.restore(), false, 'nothing to restore before a preview');
  await peek.show();
  assert.equal(peek.active, true);
  assert.deepEqual(calls, ['hideOtherApplications:', 'app.hide']);
  assert.equal(await peek.restore(), true);
  assert.equal(await peek.restore(), false, 'a second return does not unhide again');
  assert.deepEqual(calls.slice(2), ['unhideAllApplications:']);
});

test('Windows minimizes everything through the shell and undoes only that', async () => {
  const { calls, peek } = fakes('win32');
  await peek.show();
  assert.deepEqual(calls, ['powershell.exe (New-Object -ComObject Shell.Application).MinimizeAll()', 'minimize']);
  assert.equal(await peek.restore(), true);
  assert.deepEqual(calls.slice(2), ['powershell.exe (New-Object -ComObject Shell.Application).UndoMinimizeALL()']);
});

test('the preview only counts as active once the windows are out of the way', async () => {
  const { peek } = fakes('win32');
  const pending = peek.show();
  assert.equal(peek.active, false);
  await pending;
  assert.equal(peek.active, true);
});

test('a failed undo on Windows still ends the preview', async () => {
  let fail = false;
  const peek = createDesktopPeek({ platform: 'win32', env: {}, getWindow: () => null, app: {}, Menu: {}, run: async () => { if (fail) throw new Error('COM'); } });
  await peek.show(); fail = true;
  assert.equal(await peek.restore(), true);
  assert.equal(peek.active, false);
});

test('other platforms just minimize the window', async () => {
  const { calls, peek } = fakes('linux');
  await peek.show();
  assert.deepEqual(calls, ['minimize']);
  assert.equal(await peek.restore(), true);
  assert.deepEqual(calls, ['minimize']);
});
