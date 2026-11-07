const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createCredited, jpegSize, jpegIccProfile, embedIccProfile } = require('../electron/credit.cjs');

const segment = (marker, body) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
const sof = (marker, width, height) => segment(marker, Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
const jpeg = (...parts) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...parts, Buffer.from([0xff, 0xd9])]);
const iccSegment = (sequence, count, data) => segment(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.from([sequence, count]), data]));
const iccProfile = (bytes = 200) => { const profile = Buffer.alloc(bytes, 1); profile.write('acsp', 36, 'latin1'); return profile; };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngChunk = (type, data) => {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); chunk.write(type, 4, 'latin1'); data.copy(chunk, 8);
  return chunk;
};
const ihdr = Buffer.from([0, 0, 0, 10, 0, 0, 0, 10, 8, 2, 0, 0, 0]);
const png = (...chunks) => Buffer.concat([PNG_SIGNATURE, ...chunks]);

test('jpegSize reads baseline and progressive frame headers after metadata', () => {
  const exif = segment(0xe1, Buffer.alloc(3000, 7));
  const table = segment(0xc4, Buffer.alloc(30, 1)); // DHT shares the C0-CF range but is not a frame
  assert.deepEqual(jpegSize(jpeg(exif, table, sof(0xc0, 6000, 4000))), { width: 6000, height: 4000 });
  assert.deepEqual(jpegSize(jpeg(sof(0xc2, 3840, 2560))), { width: 3840, height: 2560 });
  assert.equal(jpegSize(Buffer.from('not a jpeg')), null);
  assert.equal(jpegSize(jpeg(segment(0xe0, Buffer.alloc(10)))), null);
});

test('jpegSize matches a real encoder', async () => {
  const bytes = await fs.readFile(path.join(__dirname, 'fixtures', 'credit-source.jpg'));
  assert.deepEqual(jpegSize(bytes), { width: 1265, height: 712 });
});

test('createCredited renders once, then reuses the copy without opening a window', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-'));
  const file = path.join(directory, 'abc-3840.jpg');
  await fs.copyFile(path.join(__dirname, 'fixtures', 'credit-source.jpg'), file);
  const jobs = [];
  class FakeWindow {
    constructor() { this.webContents = { setWindowOpenHandler() {}, executeJavaScript: async code => { jobs.push(code); return Buffer.from('credited').toString('base64'); } }; }
    async loadURL() {}
    destroy() { this.destroyed = true; }
  }
  const options = { BrowserWindow: FakeWindow, file, url: 'framewall://cache/abc-3840.jpg', displays: [], fit: 'fill', styleId: 'classic', author: 'A', directory, photoId: 'abc' };
  const first = await createCredited(options);
  assert.match(path.basename(first), /^abc-credit-[0-9a-f]{16}\.png$/);
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
  await fs.copyFile(path.join(__dirname, 'fixtures', 'credit-source.jpg'), file);
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

const pngChunks = (bytes) => {
  const chunks = [];
  for (let i = 8; i + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(i);
    chunks.push({ type: bytes.toString('latin1', i + 4, i + 8), data: bytes.subarray(i + 8, i + 8 + length) });
    i += 12 + length;
  }
  return chunks;
};
const inflatedProfile = (chunk) => { const nul = chunk.data.indexOf(0); return zlib.inflateSync(chunk.data.subarray(nul + 2)); };

test('jpegIccProfile joins split APP2 segments and ignores junk', () => {
  const profile = iccProfile(300);
  const bytes = jpeg(
    iccSegment(2, 2, profile.subarray(150)),
    iccSegment(1, 2, profile.subarray(0, 150)),
    sof(0xc0, 800, 600),
  );
  assert.deepEqual(jpegIccProfile(bytes), profile);
  assert.equal(jpegIccProfile(jpeg(sof(0xc0, 800, 600))), null);
  const notIcc = iccProfile(); notIcc.write('nope', 36, 'latin1');
  assert.equal(jpegIccProfile(jpeg(iccSegment(1, 1, notIcc))), null);
});

test('embedIccProfile tags the PNG and drops conflicting color chunks', () => {
  const profile = iccProfile();
  const source = png(
    pngChunk('IHDR', ihdr),
    pngChunk('sRGB', Buffer.from([0])),
    pngChunk('gAMA', Buffer.alloc(4)),
    pngChunk('IDAT', Buffer.from([1, 2, 3])),
    pngChunk('IEND', Buffer.alloc(0)),
  );
  const tagged = pngChunks(embedIccProfile(source, profile));
  assert.deepEqual(tagged.map(chunk => chunk.type), ['IHDR', 'iCCP', 'IDAT', 'IEND']);
  assert.deepEqual(inflatedProfile(tagged[1]), profile);
  assert.deepEqual(tagged[2].data, Buffer.from([1, 2, 3]));
  assert.deepEqual(embedIccProfile(source, null), source);
  assert.equal(embedIccProfile(Buffer.from('credited'), profile).toString(), 'credited');
});

test('createCredited writes a PNG tagged with the original color profile', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-'));
  const file = path.join(directory, 'icc-800.jpg');
  const profile = iccProfile();
  await fs.writeFile(file, jpeg(iccSegment(1, 1, profile), sof(0xc0, 800, 600)));
  const rendered = png(pngChunk('IHDR', ihdr), pngChunk('IDAT', Buffer.from([9])), pngChunk('IEND', Buffer.alloc(0))).toString('base64');
  class FakeWindow {
    constructor() { this.webContents = { setWindowOpenHandler() {}, executeJavaScript: async () => rendered }; }
    async loadURL() {}
    destroy() {}
  }
  const target = await createCredited({ BrowserWindow: FakeWindow, file, url: 'x', displays: [], fit: 'fill', styleId: 'classic', author: 'A', directory, photoId: 'icc' });
  assert.match(path.basename(target), /^icc-credit-[0-9a-f]{16}\.png$/);
  const chunks = pngChunks(await fs.readFile(target));
  assert.deepEqual(chunks.map(chunk => chunk.type), ['IHDR', 'iCCP', 'IDAT', 'IEND']);
  assert.deepEqual(inflatedProfile(chunks[1]), profile);
  await fs.rm(directory, { recursive: true, force: true });
});
