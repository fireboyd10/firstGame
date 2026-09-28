// Native launcher icons and splash screens, from the same vector artwork as
// scripts/generate-icons.mjs (web/PWA icons). No image packages.
// Usage: node scripts/generate-native-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const project = resolve(import.meta.dirname, '..');
const androidRes = resolve(project, 'android/app/src/main/res');
const iosAssets = resolve(project, 'ios/App/App/Assets.xcassets');

// Same artwork as the web icons (keep in sync with scripts/generate-icons.mjs).
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
const palette = shapes.map((shape) => rgb(shape.color));

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

// Maps a device pixel to art space (512×512). Returns [r,g,b,a].
function painterFor(mode, width, height) {
  const artAt = (x, y) => {
    for (let i = shapes.length - 1; i >= 0; i--) if (contains(shapes[i], x, y)) return palette[i];
    return null;
  };
  const glowBg = (x, y) => {
    const glow = Math.max(0, 1 - Math.hypot(x - 200, y - 100) / 620);
    return [Math.round(19 + 21 * glow), Math.round(13 + 10 * glow), Math.round(24 + 19 * glow)];
  };
  if (mode === 'icon' || mode === 'round') {
    return (px, py) => {
      if (mode === 'round' && (px + 0.5 - width / 2) ** 2 + (py + 0.5 - height / 2) ** 2 > (width / 2) ** 2) return [0, 0, 0, 0];
      const x = (px + 0.5) * 512 / width;
      const y = (py + 0.5) * 512 / height;
      return [...(artAt(x, y) ?? glowBg(x, y)), 255];
    };
  }
  if (mode === 'foreground') {
    // Adaptive-icon foreground: transparent, art shrunk into the 62% safe zone.
    return (px, py) => {
      const x = ((px + 0.5) * 512 / width - 256) / 0.62 + 256;
      const y = ((py + 0.5) * 512 / height - 256) / 0.62 + 256;
      const art = artAt(x, y);
      return art ? [...art, 255] : [0, 0, 0, 0];
    };
  }
  // splash: app background with the artwork centred.
  return (px, py) => {
    const scale = (0.42 * Math.min(width, height)) / 512;
    const x = ((px + 0.5) - width / 2) / scale + 256;
    const y = ((py + 0.5) - height / 2) / scale + 256;
    return [...(artAt(x, y) ?? [24, 17, 29]), 255]; // #18111d background
  };
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

// alpha: RGBA output (Android foreground/round) or opaque RGB (App Store icons reject alpha).
function png(width, height, mode, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const paint = painterFor(mode, width, height);
  const pixels = Buffer.alloc(height * (width * channels + 1));
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const [r, g, b, a] = paint(px, py);
      const offset = py * (width * channels + 1) + 1 + px * channels;
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b;
      if (alpha) pixels[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function emit(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`${file.slice(project.length + 1)} (${data.length} bytes)`);
}

// Android launcher icons (density buckets: launcher 48-192dp, foreground 108-432dp).
const densities = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
for (const [bucket, size] of densities) {
  const dir = resolve(androidRes, `mipmap-${bucket}`);
  await emit(resolve(dir, 'ic_launcher.png'), png(size, size, 'icon', { alpha: false }));
  await emit(resolve(dir, 'ic_launcher_round.png'), png(size, size, 'round'));
  await emit(resolve(dir, 'ic_launcher_foreground.png'), png(Math.round(size * 2.25), Math.round(size * 2.25), 'foreground'));
}

// Android splash screens (portrait and landscape density buckets).
const splashes = [
  ['drawable', 480, 800],
  ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280],
];
for (const [dirName, w, h] of splashes) {
  await emit(resolve(androidRes, dirName, 'splash.png'), png(w, h, 'splash', { alpha: false }));
}

// iOS: App Store icon (1024, no alpha) and the universal splash image set.
await emit(resolve(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'), png(1024, 1024, 'icon', { alpha: false }));
await emit(resolve(iosAssets, 'Splash.imageset/splash-2732x2732.png'), png(1366, 1366, 'splash', { alpha: false }));
await emit(resolve(iosAssets, 'Splash.imageset/splash-2732x2732-1.png'), png(1366, 1366, 'splash', { alpha: false }));
await emit(resolve(iosAssets, 'Splash.imageset/splash-2732x2732-2.png'), png(1366, 1366, 'splash', { alpha: false }));
console.log('Native icons and splash screens generated.');
