const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { assetName } = require('../electron/update-core.cjs');
async function page(assets, failed = false) {
  const elements = new Map();
  function element() { return { value: '', textContent: '', href: '', children: [], listeners: {}, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, replaceChildren() { this.children = []; }, append(child) { this.children.push(child); }, addEventListener(name, fn) { this.listeners[name] = fn; } }; }
  const document = { querySelector: selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); }, createElement: () => element() };
  vm.runInNewContext(fs.readFileSync(require.resolve('../site/download.js'), 'utf8'), { document, navigator: { userAgent: 'Windows NT 10.0; Win64; x64' }, URL, AbortSignal, fetch: async () => { if (failed) throw new Error('offline'); return { status: 200, ok: true, json: async () => ({ tag_name: 'v0.5.0', draft: false, prerelease: false, assets }) }; } });
  await new Promise(resolve => setImmediate(resolve));
  return selector => document.querySelector(selector);
}
test('website recommends installers by platform and architecture, retaining archive alternatives', async () => {
  const assets = ['win32', 'darwin'].flatMap(os => ['x64', 'arm64'].flatMap(arch => [false, true].map(portable => { const name = assetName('0.5.0', os, arch, portable); return { name, size: 1000000, browser_download_url: `https://github.com/LeoonLiang/Scenelet/releases/download/v0.5.0/${name}` }; })));
  const get = await page(assets);
  assert.match(get('#recommended').href, /windows-x64-setup\.exe$/);
  get('#platform').value = 'darwin'; get('#arch').value = 'arm64'; get('#arch').listeners.change();
  assert.match(get('#recommended').href, /macos-arm64-installer\.dmg$/); assert.equal(get('#all-downloads').children.length, 8);
});
test('website falls back to releases when network fails or assets point outside official repository', async () => {
  const offline = await page([], true); assert.equal(offline('#recommended').href, 'https://github.com/LeoonLiang/Scenelet/releases');
  const untrusted = await page([{ name: assetName('0.5.0', 'win32', 'x64'), size: 100, browser_download_url: 'https://evil.example/setup.exe' }]);
  assert.equal(untrusted('#recommended').href, 'https://github.com/LeoonLiang/Scenelet/releases');
});
