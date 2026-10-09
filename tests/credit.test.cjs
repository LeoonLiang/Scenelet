const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCredited, jpegSize } = require('../electron/credit.cjs');

const segment = (marker, body) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
const sof = (marker, width, height) => segment(marker, Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
const jpeg = (...parts) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...parts, Buffer.from([0xff, 0xd9])]);

test('jpegSize reads baseline and progressive frame headers after metadata', () => {
  const exif = segment(0xe1, Buffer.alloc(3000, 7));
  const table = segment(0xc4, Buffer.alloc(30, 1)); // DHT shares the C0-CF range but is not a frame
  assert.deepEqual(jpegSize(jpeg(exif, table, sof(0xc0, 6000, 4000))), { width: 6000, height: 4000 });
  assert.deepEqual(jpegSize(jpeg(sof(0xc2, 3840, 2560))), { width: 3840, height: 2560 });
  assert.equal(jpegSize(Buffer.from('not a jpeg')), null);
  assert.equal(jpegSize(jpeg(segment(0xe0, Buffer.alloc(10)))), null);
});

test('jpegSize matches a real encoder', async () => {
  const bytes = await fs.readFile(path.join(__dirname, '..', 'docs', 'images', 'preview.jpg'));
  assert.deepEqual(jpegSize(bytes), { width: 1265, height: 712 });
});

test('createCredited renders once, then reuses the copy without opening a window', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-'));
  const file = path.join(directory, 'abc-3840.jpg');
  await fs.copyFile(path.join(__dirname, '..', 'docs', 'images', 'preview.jpg'), file);
  const jobs = [];
  class FakeWindow {
    constructor() { this.webContents = { setWindowOpenHandler() {}, executeJavaScript: async code => { jobs.push(code); return Buffer.from('credited').toString('base64'); } }; }
    async loadURL() {}
    destroy() { this.destroyed = true; }
  }
  const options = { BrowserWindow: FakeWindow, file, url: 'framewall://cache/abc-3840.jpg', displays: [], fit: 'fill', styleId: 'classic', author: 'A', directory, photoId: 'abc' };
  const first = await createCredited(options);
  assert.match(path.basename(first), /^abc-credit-[0-9a-f]{16}\.jpg$/);
  assert.equal(await fs.readFile(first, 'utf8'), 'credited');
  assert.equal(jobs.length, 1);
  assert.ok(jobs[0].includes('"text":"Photo by A on Unsplash"') && jobs[0].includes('"source":{"width":1265,"height":712}'));
  assert.equal(await createCredited(options), first);
  assert.equal(jobs.length, 1);
  // Changing the author or the style produces a new copy.
  assert.notEqual(await createCredited({ ...options, author: 'B' }), first);
  assert.equal(jobs.length, 2);
  await createCredited({ ...options, styleId: 'minimal' });
  assert.equal(jobs.length, 3);
  assert.ok(jobs[2].includes('"text":"A / UNSPLASH"') && jobs[2].includes('"tracking":0.14'));
  await fs.rm(directory, { recursive: true, force: true });
});

test('createCredited surfaces renderer failures and leaves no partial file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-'));
  const file = path.join(directory, 'abc-1920.jpg');
  await fs.copyFile(path.join(__dirname, '..', 'docs', 'images', 'preview.jpg'), file);
  let destroyed = false;
  class BrokenWindow {
    constructor() { this.webContents = { setWindowOpenHandler() {}, executeJavaScript: async () => { throw new Error('Unexpected image size'); } }; }
    async loadURL() {}
    destroy() { destroyed = true; }
  }
  await assert.rejects(createCredited({ BrowserWindow: BrokenWindow, file, url: 'x', displays: [], fit: 'fill', styleId: 'classic', author: 'T', directory, photoId: 'abc' }), /Unexpected image size/);
  assert.ok(destroyed);
  assert.deepEqual(await fs.readdir(directory), ['abc-1920.jpg']);
  await fs.writeFile(file, 'not a jpeg');
  await assert.rejects(createCredited({ BrowserWindow: BrokenWindow, file, url: 'x', displays: [], fit: 'fill', styleId: 'classic', author: 'T', directory, photoId: 'abc' }), /Not a readable JPEG/);
  await fs.rm(directory, { recursive: true, force: true });
});
