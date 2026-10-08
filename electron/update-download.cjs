const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const core = require('./update-core.cjs');
const { t } = require('./i18n.cjs');

async function downloadReleaseAsset({ asset, release, directory, onProgress = () => {}, signal, fetchImpl = fetch }) {
  if (!/^Scenelet-\d+\.\d+\.\d+-(?:macos|windows)-(?:x64|arm64)-(?:installer\.dmg|portable\.zip)$/.test(asset.name)
    || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3) throw new Error(t('update.badAsset'));
  const url = core.trustedReleaseUrl(asset.browser_download_url);
  const timeout = AbortSignal.timeout(15 * 60 * 1000);
  const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let checksum = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '')?.[1].toLowerCase();
  if (!checksum) {
    const manifest = release.assets.find(item => item.name === 'SHA256SUMS.txt');
    if (!manifest) throw new Error(t('update.noChecksum'));
    const response = await fetchImpl(core.trustedReleaseUrl(manifest.browser_download_url), { signal: downloadSignal });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const lines = (await response.text()).split(/\r?\n/);
    for (const line of lines) {
      const match = /^([a-f0-9]{64}) [ *](.+)$/i.exec(line);
      if (match?.[2] === asset.name) { checksum = match[1].toLowerCase(); break; }
    }
    if (!checksum) throw new Error(t('update.noChecksum'));
  }
  await fs.promises.mkdir(directory, { recursive: true });
  // Only one application instance downloads here. Recover files left by a terminated process.
  for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\.download-[a-z0-9]{6}$/i.test(entry.name)) await fs.promises.rm(path.join(directory, entry.name), { recursive: true, force: true });
  }
  const temporary = await fs.promises.mkdtemp(path.join(directory, '.download-'));
  const partial = path.join(temporary, asset.name);
  let received = 0, previousPercent = -1;
  const hash = createHash('sha256');
  try {
    const response = await fetchImpl(url, { signal: downloadSignal });
    if (!response.ok || !response.body) throw new Error(`GitHub HTTP ${response.status}`);
    const progress = new Transform({ transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > asset.size) { callback(new Error(t('update.badDownload'))); return; }
      hash.update(chunk);
      const percent = Math.min(99, Math.floor(received / asset.size * 100));
      if (percent !== previousPercent) { previousPercent = percent; onProgress(percent); }
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal: downloadSignal });
    if (received !== asset.size || hash.digest('hex') !== checksum) throw new Error(t('update.badDownload'));
    const file = path.join(directory, asset.name);
    await fs.promises.rename(partial, file);
    onProgress(100);
    return file;
  } finally { await fs.promises.rm(temporary, { recursive: true, force: true }); }
}

module.exports = { downloadReleaseAsset };
