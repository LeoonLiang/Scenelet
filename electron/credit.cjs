// Draws the photographer credit onto a copy of the wallpaper.
// Decoding and drawing happen in a hidden, sandboxed renderer (same approach as photo-indexer.cjs),
// so the main process only computes the layout and writes the resulting JPEG.
const fs = require('node:fs/promises');
const path = require('node:path');
const { creditLayout, creditFileName } = require('./credit-layout.cjs');

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

async function readJpegSize(file) {
  const handle = await fs.open(file, 'r');
  try {
    // Frame headers sit after EXIF/ICC data, which is normally well under 256 KB.
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return jpegSize(buffer.subarray(0, bytesRead));
  } finally { await handle.close(); }
}

// Runs in the renderer, so it must not reference anything outside its own body. Returns base64 JPEG.
async function draw({ url, source, width, height, right, bottom, fontSize, text }) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  // A rotated (EXIF) image would not match the layout computed from the header; let the caller fall back.
  if (img.naturalWidth !== source.width || img.naturalHeight !== source.height) throw new Error('Unexpected image size');
  const bitmap = await createImageBitmap(img, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif`;
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
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('JPEG encoding failed')), 'image/jpeg', 0.92));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
async function createCredited({ BrowserWindow, file, url, displays, fit, text, directory, photoId }) {
  const [stat, size] = await Promise.all([fs.stat(file), readJpegSize(file)]);
  if (!size) throw new Error('Not a readable JPEG');
  const layout = creditLayout(size, displays, fit);
  const target = path.join(directory, creditFileName(photoId, [path.basename(file), stat.size, stat.mtimeMs], text, layout));
  try { await fs.access(target); return target; } catch {}
  const base64 = await render(BrowserWindow, { url, source: size, text, ...layout });
  if (!base64) throw new Error('Credit rendering returned no image');
  await fs.writeFile(target + '.part', Buffer.from(base64, 'base64'));
  await fs.rename(target + '.part', target);
  return target;
}

module.exports = { createCredited, jpegSize, draw };
