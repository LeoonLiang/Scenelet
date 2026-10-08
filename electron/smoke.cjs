// Runs only with --smoke-test, using an isolated workspace data directory.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async function smoke({ app, win, indexFiles, setNativeWallpaper, snapshot, run, connect }) {
  const artifacts = path.join(process.cwd(), 'artifacts'); await fs.mkdir(artifacts, { recursive: true });
  const fixture = path.join(artifacts, 'native-fixture.png');
  const image = require('electron').nativeImage.createFromBuffer(require('./icon.cjs')()).resize({ width: 1920, height: 1080 });
  await fs.writeFile(fixture, image.toPNG());
  await indexFiles([fixture]);
  const photo = snapshot().photos.find(p => p.title === 'native-fixture.png');
  assert.ok(photo); assert.equal(photo.width, 1920); assert.equal(photo.height, 1080);
  // Fake credentials and a stubbed network response verify storage without contacting Unsplash.
  const fakeKey = 'framewall-smoke-fake-key-never-sent';
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ errors: ['Invalid test credential'] }), { status: 401, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0' } });
    await assert.rejects(connect(fakeKey), error => error.message.includes('HTTP 401') && error.message.includes('Invalid test credential') && !error.message.includes(fakeKey));
    let attempts = 0;
    global.fetch = async () => { if (++attempts === 1) throw Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Simulated connection timeout' } }); return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }); };
    await connect(fakeKey);
    assert.equal(attempts, 2);
    const encrypted = await fs.readFile(path.join(app.getPath('userData'), 'credential.bin'));
    assert.equal(encrypted.includes(Buffer.from(fakeKey)), false);
    assert.equal(require('electron').safeStorage.decryptString(encrypted), fakeKey);
    assert.equal(await win.webContents.executeJavaScript('window.framewall.credential()'), fakeKey);
    await win.webContents.executeJavaScript('window.framewall.disconnect()');
    assert.equal(await win.webContents.executeJavaScript('window.framewall.credential()'), '');
  } finally { global.fetch = originalFetch; }
  const rendered = await win.webContents.executeJavaScript(`(async () => {
    const s = await window.framewall.bootstrap();
    if (!s.favorites.includes(${JSON.stringify(photo.id)})) await window.framewall.favorite({id: ${JSON.stringify(photo.id)}});
    const updated = await window.framewall.playlist({action: 'create', name: 'Smoke playlist'});
    const list = updated.playlists.at(-1);
    const result = await window.framewall.playlist({action: 'toggle', id: list.id, photoId: ${JSON.stringify(photo.id)}});
    const imageOK = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => reject(new Error('Local image failed to render')); image.src = ${JSON.stringify(photo.thumb)}; setTimeout(() => reject(new Error('Local image timed out')), 10000); });
    const online = await window.framewall.settings({ ...result.settings, interval: 7, rotationSource: 'online', rotation: false, onlineSource: {kind: 'author', value: 'https://unsplash.com/@author/photos', name: 'My author'} });
    const reloaded = await window.framewall.bootstrap();
    let missingKeyBlocked = false;
    if (!s.connected) { try { await window.framewall.next(); } catch { missingKeyBlocked = true; } }
    await window.framewall.settings(result.settings);
    return { desktop: s.desktop, heading: document.querySelector('h1')?.textContent, favorite: result.favorites.includes(${JSON.stringify(photo.id)}), list: result.playlists.at(-1).photoIds.length, imageOK, nodeExposed: typeof window.require !== 'undefined', onlineSourceSaved: online.settings.rotationSource === 'online' && reloaded.settings.onlineSource.value === 'author', customIntervalSaved: reloaded.settings.interval === 7, missingKeyBlocked };
  })()`);
  assert.equal(rendered.desktop, true); assert.equal(rendered.nodeExposed, false); assert.equal(rendered.favorite, true); assert.equal(rendered.list, 1); assert.equal(rendered.imageOK, true); assert.ok(rendered.heading);
  assert.equal(rendered.onlineSourceSaved, true); if (!snapshot().connected) assert.equal(rendered.missingKeyBlocked, true);
  assert.equal(rendered.customIntervalSaved, true);
  let nativeVerified = false;
  if (process.argv.includes('--wallpaper-test') && process.platform === 'win32') {
    const readScript = "$p = Get-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop'; [PSCustomObject]@{ Wallpaper=$p.Wallpaper; WallpaperStyle=$p.WallpaperStyle; TileWallpaper=$p.TileWallpaper } | ConvertTo-Json -Compress";
    const original = JSON.parse((await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readScript], { windowsHide: true })).stdout);
    try {
      await setNativeWallpaper(fixture, 'fill');
      const actual = JSON.parse((await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readScript], { windowsHide: true })).stdout);
      assert.equal(path.resolve(actual.Wallpaper).toLowerCase(), path.resolve(fixture).toLowerCase()); nativeVerified = true;
    } finally {
      const restore = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class FrameWallRestore { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SystemParametersInfo(int action, int param, string value, int flags); }'; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value $env:FRAMEWALL_OLD_STYLE; Set-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value $env:FRAMEWALL_OLD_TILE; if (-not [FrameWallRestore]::SystemParametersInfo(20, 0, $env:FRAMEWALL_OLD_IMAGE, 3)) { throw 'Failed to restore wallpaper' }`;
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', restore], { windowsHide: true, env: { ...process.env, FRAMEWALL_OLD_IMAGE: original.Wallpaper || '', FRAMEWALL_OLD_STYLE: String(original.WallpaperStyle ?? '10'), FRAMEWALL_OLD_TILE: String(original.TileWallpaper ?? '0') }, timeout: 30000 });
      const restored = JSON.parse((await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readScript], { windowsHide: true })).stdout);
      assert.equal(restored.Wallpaper || '', original.Wallpaper || '');
    }
  }
  await fs.writeFile(path.join(artifacts, nativeVerified ? 'desktop-smoke-native.json' : 'desktop-smoke.json'), JSON.stringify({ ...rendered, retryRecovered: true, credentialRoundTrip: true, detailedApiError: true, nativeVerified, wallpaperRestored: nativeVerified, electron: process.versions.electron, checkedAt: new Date().toISOString() }, null, 2));
  console.log('SMOKE PASSED', JSON.stringify({ ...rendered, nativeVerified }));
};
