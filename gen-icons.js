// Dev-only: generates extension icons (no dependencies — hand-rolled PNG).
// Usage: node gen-icons.js
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

// --- minimal PNG encoder (8-bit RGBA) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw.writeUInt32BE(((r << 24) | (g << 16) | (b << 8) | a) >>> 0, row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- icon art: cream rounded tile, red seal circle, white check ---
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function drawIcon(s) {
  const CREAM = [253, 246, 236], RED = [176, 65, 62], BORDER = [224, 207, 174];
  const cx = s / 2, cy = s / 2;
  const corner = s * 0.2;
  const sealR = s * 0.36;
  const strokeW = Math.max(1, s * 0.07);
  // check mark polyline (relative coords)
  const A = [0.36 * s, 0.52 * s], B = [0.46 * s, 0.63 * s], C = [0.67 * s, 0.38 * s];

  return encodePNG(s, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    // rounded-rect alpha
    const ex = Math.max(0, Math.max(corner - px, px - (s - corner)));
    const ey = Math.max(0, Math.max(corner - py, py - (s - corner)));
    if (ex > 0 && ey > 0 && Math.hypot(ex, ey) > corner) return [0, 0, 0, 0];

    const onBorder = px < 1 || py < 1 || px > s - 1 || py > s - 1
      || (ex > 0 && ey > 0 && Math.hypot(ex, ey) > corner - 1.2);
    const dSeal = Math.hypot(px - cx, py - cy);
    if (dSeal <= sealR) {
      const dCheck = Math.min(
        distToSegment(px, py, A[0], A[1], B[0], B[1]),
        distToSegment(px, py, B[0], B[1], C[0], C[1])
      );
      if (dCheck <= strokeW) return [255, 255, 255, 255];
      return [...RED, 255];
    }
    if (onBorder) return [...BORDER, 255];
    return [...CREAM, 255];
  });
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), drawIcon(size));
  console.log(`icons/icon${size}.png`);
}
