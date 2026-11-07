// Draws the photographer credit onto a copy of the wallpaper.
// Decoding and drawing happen in a hidden, sandboxed renderer (same approach as photo-indexer.cjs),
// so the main process only computes the layout and writes the resulting PNG.
// The copy keeps the original pixels and ICC profile instead of being color-converted and
// re-encoded as JPEG, which would soften detail and shift colors of wide-gamut photos.
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { creditLayout, creditFileName, creditStyle, creditText } = require('./credit-layout.cjs');

const TIMEOUT = 30000;

// Pixel size from the JPEG frame header, so an existing credited copy can be reused without decoding.
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = bytes.readUInt16BE(i + 2);
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = bytes.readUInt16BE(i + 5), width = bytes.readUInt16BE(i + 7);
      return width && height ? { width, height } : null;
    }
    if (marker === 0xda || marker === 0xd9 || length < 2) return null;
    i += 2 + length;
  }
  return null;
}

// ICC profile carried by APP2 segments (it may be split across several of them).
function jpegIccProfile(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts = [];
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = bytes.readUInt16BE(i + 2);
    if (marker === 0xe2 && length >= 16 && bytes.toString('latin1', i + 4, i + 16) === 'ICC_PROFILE\0') {
      parts.push({ sequence: bytes[i + 16], data: bytes.subarray(i + 18, i + 2 + length) });
    }
    if (marker === 0xda || marker === 0xd9 || length < 2) break;
    i += 2 + length;
  }
  if (!parts.length) return null;
  parts.sort((a, b) => a.sequence - b.sequence);
  const profile = Buffer.concat(parts.map(part => part.data));
  // ICC header: byte 36 starts the "acsp" signature.
  return profile.length > 128 && profile.toString('latin1', 36, 40) === 'acsp' ? profile : null;
}

async function readJpegInfo(file) {
  const handle = await fs.open(file, 'r');
  try {
    // Frame headers and ICC data sit before the image scan, normally well under 256 KB.
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    return { size: jpegSize(bytes), icc: jpegIccProfile(bytes) };
  } finally { await handle.close(); }
}

// Runs in the renderer, so it must not reference anything outside its own body. Returns base64 PNG.
async function draw({ url, source, width, height, right, bottom, fontSize, text, italic, weight, family, tracking }) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  // A rotated (EXIF) image would not match the layout computed from the header; let the caller fall back.
  if (img.naturalWidth !== source.width || img.naturalHeight !== source.height) throw new Error('Unexpected image size');
  // Keep the original samples so the copy keeps the photo's colors; the caller re-attaches its ICC profile.
  const bitmap = await createImageBitmap(img, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${family}`;
  ctx.letterSpacing = `${Math.round(tracking * fontSize * 10) / 10}px`;
  // Letter spacing is also added after the last glyph; shift so the text still ends at the anchor.
  right += Math.round(tracking * fontSize);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  // Light text on dark areas, dark text on bright areas, judged from the pixels behind the text.
  const textWidth = Math.ceil(ctx.measureText(text).width), pad = Math.round(fontSize * 0.6), lineHeight = Math.round(fontSize * 1.3);
  const x = Math.max(0, right - textWidth - pad), y = Math.max(0, bottom - lineHeight - pad);
  const w = Math.max(1, Math.min(width - x, textWidth + pad * 2)), h = Math.max(1, Math.min(height - y, lineHeight + pad * 2));
  const pixels = ctx.getImageData(x, y, w, h).data;
  let sum = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 16) { sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]; count++; }
  const light = sum / count / 255 < 0.62;
  ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.86)' : 'rgba(24, 24, 24, 0.78)';
  ctx.shadowColor = light ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.35)';
  ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.3));
  ctx.shadowOffsetY = light ? Math.max(1, Math.round(fontSize * 0.06)) : 0;
  ctx.fillText(text, right, bottom);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); chunk.write(type, 4, 'latin1'); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

// The canvas encodes plain sRGB; tag the copy with the photo's own profile so it looks like the original.
function embedIccProfile(png, profile) {
  if (!profile || png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return png;
  if (png.toString('latin1', 12, 16) !== 'IHDR') return png;
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8);
  const iccp = pngChunk('iCCP', Buffer.concat([Buffer.from('ICC profile\0', 'latin1'), Buffer.from([0]), zlib.deflateSync(profile)]));
  const kept = [];
  for (let i = ihdrEnd; i + 12 <= png.length;) {
    const end = i + 12 + png.readUInt32BE(i);
    if (end > png.length) return png;
    if (!['iCCP', 'sRGB', 'gAMA', 'cHRM'].includes(png.toString('latin1', i + 4, i + 8))) kept.push(png.subarray(i, end));
    i = end;
  }
  return Buffer.concat([png.subarray(0, ihdrEnd), iccp, ...kept]);
}

async function render(BrowserWindow, job) {
  const worker = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let timer;
  try {
    await worker.loadURL('data:text/html,' + encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src framewall: data:; script-src \'none\'">'));
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Credit rendering timed out')), TIMEOUT); });
    return await Promise.race([worker.webContents.executeJavaScript(`(${draw.toString()})(${JSON.stringify(job)})`), timeout]);
  } finally { clearTimeout(timer); worker.destroy(); }
}

/**
 * Returns the path of a credited copy of `file` (a JPEG), creating it in `directory` when needed.
 * Throws on failure; callers should fall back to the original file.
 */
async function createCredited({ BrowserWindow, file, url, displays, fit, styleId, author, directory, photoId }) {
  const [stat, info] = await Promise.all([fs.stat(file), readJpegInfo(file)]);
  if (!info.size) throw new Error('Not a readable JPEG');
  const style = creditStyle(styleId), text = creditText(style, author);
  const layout = creditLayout(info.size, displays, fit);
  const look = { italic: style.italic, weight: style.weight, family: style.family, tracking: style.tracking };
  const job = { ...layout, fontSize: Math.max(10, Math.round(layout.fontSize * style.scale)), ...look };
  const target = path.join(directory, creditFileName(photoId, [path.basename(file), stat.size, stat.mtimeMs], text, job));
  try { await fs.access(target); return target; } catch {}
  const base64 = await render(BrowserWindow, { url, source: info.size, text, ...job });
  if (!base64) throw new Error('Credit rendering returned no image');
  await fs.writeFile(target + '.part', embedIccProfile(Buffer.from(base64, 'base64'), info.icc));
  await fs.rename(target + '.part', target);
  return target;
}

module.exports = { createCredited, jpegSize, jpegIccProfile, embedIccProfile, draw };
