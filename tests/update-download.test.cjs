const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { downloadReleaseAsset } = require('../electron/update-download.cjs');

const body = Buffer.from('Scenelet installer fixture');
const digest = createHash('sha256').update(body).digest('hex');
const name = 'Scenelet-0.7.0-macos-arm64-installer.dmg';
const base = 'https://github.com/LeoonLiang/Scenelet/releases/download/v0.7.0/';
const asset = { name, size: body.length, digest: `sha256:${digest}`, browser_download_url: base + name };
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenelet-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('downloads inside the app and exposes the file only after checksum verification', async t => {
  const dir = await directory(t), progress = [];
  const file = await downloadReleaseAsset({ asset, release: { assets: [asset] }, directory: dir,
    fetchImpl: async url => { assert.equal(url, base + name); return new Response(body); },
    onProgress: percent => progress.push(percent),
  });
  assert.equal(file, path.join(dir, name));
  assert.deepEqual(await fs.readFile(file), body);
  assert.equal(progress.at(-1), 100);
  assert.deepEqual(await fs.readdir(dir), [name]);
});

test('older releases use their SHA256SUMS file when GitHub has no asset digest', async t => {
  const dir = await directory(t);
  const checksum = { name: 'SHA256SUMS.txt', browser_download_url: base + 'SHA256SUMS.txt' };
  const file = await downloadReleaseAsset({ asset: { ...asset, digest: null }, release: { assets: [checksum] }, directory: dir,
    fetchImpl: async url => new Response(url.endsWith('SHA256SUMS.txt') ? `${digest}  ${name}\n` : body),
  });
  assert.deepEqual(await fs.readFile(file), body);
});

test('corrupt or incomplete downloads leave no installable file or temporary data', async t => {
  for (const downloaded of [Buffer.alloc(body.length), body.subarray(0, 4)]) {
    const dir = await directory(t);
    await assert.rejects(downloadReleaseAsset({ asset, release: { assets: [asset] }, directory: dir, fetchImpl: async () => new Response(downloaded) }));
    assert.deepEqual(await fs.readdir(dir), []);
  }
});

test('missing checksums, foreign URLs and unsafe filenames fail before downloading a package', async t => {
  const dir = await directory(t);
  for (const invalid of [{ ...asset, digest: null }, { ...asset, browser_download_url: 'https://example.com/update.dmg' }, { ...asset, name: '../update.dmg' }]) {
    await assert.rejects(downloadReleaseAsset({ asset: invalid, release: { assets: [] }, directory: dir,
      fetchImpl: async () => { assert.fail('Unverified package should not be fetched'); },
    }));
  }
  assert.deepEqual(await fs.readdir(dir), []);
});

test('interrupted downloads are cleaned up and can be retried', async t => {
  const dir = await directory(t), controller = new AbortController();
  await assert.rejects(downloadReleaseAsset({ asset, release: { assets: [asset] }, directory: dir, signal: controller.signal,
    fetchImpl: async () => { controller.abort(); return new Response(body); },
  }));
  assert.deepEqual(await fs.readdir(dir), []);
  const file = await downloadReleaseAsset({ asset, release: { assets: [asset] }, directory: dir, fetchImpl: async () => new Response(body) });
  assert.deepEqual(await fs.readFile(file), body);
});

test('a new download removes abandoned partials after app termination and preserves other files', async t => {
  const dir = await directory(t);
  const abandoned = path.join(dir, '.download-abc123');
  await fs.mkdir(abandoned);
  await fs.writeFile(path.join(abandoned, name), body.subarray(0, 4));
  await fs.writeFile(path.join(dir, 'keep.txt'), 'keep');
  await downloadReleaseAsset({ asset, release: { assets: [asset] }, directory: dir, fetchImpl: async () => new Response(body) });
  assert.deepEqual((await fs.readdir(dir)).sort(), [name, 'keep.txt'].sort());
});
