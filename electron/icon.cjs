const zlib = require('node:zlib');
function crc32(buf) { let crc = 0xffffffff; for (const byte of buf) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([len, name, data, crc]); }
module.exports = function icon() {
  const width = 32, raw = Buffer.alloc((width * 4 + 1) * width);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const i = y * (width * 4 + 1) + 1 + x * 4;
    const sun = (x - 23) ** 2 + (y - 8) ** 2 < 10;
    const mountain = y >= 24 - Math.max(0, 12 - Math.abs(x - 12) * 1.4, 9 - Math.abs(x - 23) * 1.5) && y < 26 && x > 4 && x < 29;
    const color = sun ? [238, 194, 126] : mountain ? [234, 241, 228] : [45, 79, 61];
    raw[i] = color[0]; raw[i + 1] = color[1]; raw[i + 2] = color[2]; raw[i + 3] = x < 2 && y < 2 || x > 29 && y > 29 ? 0 : 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(width, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
