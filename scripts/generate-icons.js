const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crcVal = crc32(typeAndData);
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

function generateIconPNG(size) {
  // RGBA pixels
  const width = size;
  const height = size;
  
  // Create raw scanlines (1 filter byte + 4 bytes per pixel)
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Distance from center
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Squircle background
      const u = Math.abs(x - cx) / (width * 0.44);
      const v = Math.abs(y - cy) / (height * 0.44);
      const inSquircle = Math.pow(u, 4) + Math.pow(v, 4) <= 1.0;

      if (inSquircle) {
        // Gradient from Instagram purple-pink to warm orange (#833AB4 -> #FD1D1D -> #FCAF45)
        const t = (x + y) / (width + height);
        let r, g, b;
        if (t < 0.5) {
          const factor = t * 2;
          r = Math.round(131 + (253 - 131) * factor);
          g = Math.round(58 + (29 - 58) * factor);
          b = Math.round(180 + (29 - 180) * factor);
        } else {
          const factor = (t - 0.5) * 2;
          r = Math.round(253 + (252 - 253) * factor);
          g = Math.round(29 + (175 - 29) * factor);
          b = Math.round(29 + (69 - 29) * factor);
        }

        // Add fullscreen / viewfinder frame icon in the middle (white)
        const fx = Math.abs(x - cx) / width;
        const fy = Math.abs(y - cy) / height;
        const borderDist = Math.max(fx, fy);
        const isCorner = (fx > 0.16 && fx < 0.28) && (fy > 0.16 && fy < 0.28);
        const isCenterLens = dist < width * 0.14 && dist > width * 0.08;
        const isCenterDot = dist < width * 0.04;

        if (isCenterLens || isCenterDot || (borderDist > 0.22 && borderDist < 0.28 && (fx > 0.18 || fy > 0.18))) {
          // White symbol
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 255;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        } else {
          rawData[pxOffset] = r;
          rawData[pxOffset + 1] = g;
          rawData[pxOffset + 2] = b;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression: Deflate
  ihdrData[11] = 0; // Filter: Adaptive
  ihdrData[12] = 0; // Interlace: None
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuffer = generateIconPNG(size);
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated: ${filePath} (${pngBuffer.length} bytes)`);
});
