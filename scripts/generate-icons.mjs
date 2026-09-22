// Original vector artwork + a tiny reproducible PNG encoder. No image packages.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const output = resolve(import.meta.dirname, '../public/icons');
await mkdir(output, { recursive: true });
const shapes = [
  { type: 'circle', x: 256, y: 256, r: 210, color: '#291a30' },
  { type: 'circle', x: 256, y: 256, r: 207, color: '#160f1c' },
  { type: 'polygon', points: [[123, 109], [130, 126], [147, 133], [130, 140], [123, 157], [116, 140], [99, 133]], color: '#ff7eae' },
  { type: 'line', x1: 184, y1: 139, x2: 184, y2: 372, width: 18, color: '#fff0d7' },
  { type: 'polygon', points: [[193, 140], [284, 119], [368, 145], [334, 204], [356, 258], [278, 231], [193, 250]], color: '#ff4869' },
  { type: 'polygon', points: [[284, 119], [368, 145], [334, 204], [313, 192]], color: '#e32d56' },
  { type: 'line', x1: 227, y1: 173, x2: 261, y2: 165, width: 10, color: '#fff0d7' },
  { type: 'polygon', points: [[320, 294], [363, 334], [320, 374], [277, 334]], color: '#49dfa4' },
  { type: 'line', x1: 303, y1: 334, x2: 315, y2: 346, width: 9, color: '#130d18' },
  { type: 'line', x1: 315, y1: 346, x2: 338, y2: 322, width: 9, color: '#130d18' },
  { type: 'line', x1: 155, y1: 395, x2: 223, y2: 395, width: 6, color: '#68445e' },
];
const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));

function contains(shape, x, y) {
  if (shape.type === 'circle') return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.r ** 2;
  if (shape.type === 'line') {
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / (dx * dx + dy * dy)));
    return (x - shape.x1 - t * dx) ** 2 + (y - shape.y1 - t * dy) ** 2 <= (shape.width / 2) ** 2;
  }
  let inside = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const [xi, yi] = shape.points[i];
    const [xj, yj] = shape.points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const value of Buffer.concat([name, data])) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function png(size, maskable = false) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  const palette = shapes.map((shape) => rgb(shape.color));
  const samples = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const color = [0, 0, 0];
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        let x = (px + (sx + 0.5) / samples) * 512 / size;
        let y = (py + (sy + 0.5) / samples) * 512 / size;
        if (maskable) { x = (x - 256) / 0.88 + 256; y = (y - 256) / 0.88 + 256; }
        const glow = Math.max(0, 1 - Math.hypot(x - 200, y - 100) / 620);
        let sample = [19 + 21 * glow, 13 + 10 * glow, 24 + 19 * glow];
        for (let i = 0; i < shapes.length; i++) if (contains(shapes[i], x, y)) sample = palette[i];
        for (let channel = 0; channel < 3; channel++) color[channel] += sample[channel] / (samples * samples);
      }
      const offset = py * (size * 3 + 1) + 1 + px * 3;
      color.forEach((value, channel) => { pixels[offset + channel] = Math.round(value); });
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2; // 8-bit RGB, full-bleed opaque background suitable for masking.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const artwork = shapes.map((shape) => {
  if (shape.type === 'circle') return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${shape.color}"/>`;
  if (shape.type === 'line') return `<path d="M${shape.x1} ${shape.y1}L${shape.x2} ${shape.y2}" stroke="${shape.color}" stroke-width="${shape.width}" stroke-linecap="round"/>`;
  return `<polygon points="${shape.points.map((point) => point.join(',')).join(' ')}" fill="${shape.color}"/>`;
}).join('\n  ');
await writeFile(resolve(output, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">
  <title id="title">Red Flag Rush: a red signal flag and a green check</title>
  <defs><radialGradient id="bg" cx="39%" cy="20%" r="121%"><stop stop-color="#28172b"/><stop offset="1" stop-color="#130d18"/></radialGradient></defs>
  <path fill="url(#bg)" d="M0 0H512V512H0z"/>
  ${artwork}
</svg>\n`);
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
  ['icon-maskable-512.png', 512, true],
]) {
  const data = png(size, maskable);
  await writeFile(resolve(output, name), data);
  console.log(`${name}: ${size} × ${size}, ${data.length} bytes`);
}
