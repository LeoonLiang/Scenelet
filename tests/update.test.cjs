const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../electron/update-core.cjs');
test('stable releases compare numerically and reject prereleases or downgrades', () => {
  assert.equal(core.newer('v0.10.0', '0.9.0'), true); assert.equal(core.newer('v0.5.0', '0.5.0'), false); assert.equal(core.newer('v0.4.0', '0.5.0'), false); assert.equal(core.newer('v0.6.0-beta', '0.5.0'), false);
});
test('architecture-specific release names and update channels cannot cross architectures', () => {
  assert.equal(core.assetName('v0.5.0', 'win32', 'arm64'), 'Scenelet-0.5.0-windows-arm64-setup.exe');
  assert.equal(core.assetName('0.5.0', 'darwin', 'x64'), 'Scenelet-0.5.0-macos-x64-installer.dmg'); assert.equal(core.channel('x64'), 'latest-x64'); assert.throws(() => core.channel('ia32'));
});
test('update links stay on the exact public repository', () => {
  assert.equal(core.trustedReleaseUrl('https://github.com/LeoonLiang/Scenelet/releases/latest'), 'https://github.com/LeoonLiang/Scenelet/releases/latest');
  for (const url of ['https://github.com/other/repo/releases', 'https://github.com/LeoonLiang/Scenelet/releases-evil', 'http://github.com/LeoonLiang/Scenelet/releases']) assert.throws(() => core.trustedReleaseUrl(url));
});

test('feedback opens a new issue in this repository with versions filled in', () => {
  const url = new URL(core.issueUrl({ version: '0.9.0', platform: 'darwin', system: '15.6', arch: 'arm64' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/LeoonLiang/Scenelet/issues/new');
  assert.equal(url.searchParams.get('body'), '\n\n---\nScenelet 0.9.0 · macOS 15.6 · arm64');
  assert.match(core.issueUrl({ version: '0.9.0', platform: 'win32', system: '10.0.26100', arch: 'x64' }), /Windows%2010\.0\.26100/);
});
