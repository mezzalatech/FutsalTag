// Minimal ISO/IEC 18004 Byte-mode QR Code SVG encoder (Versions 1..6, ECC Level L)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGenerator(ecCount);
  const work = new Uint8Array(data.length + ecCount);
  work.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        work[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return work.slice(data.length);
}

// Level L tables for Versions 1..6 (byte capacity check, data codewords, ec per block, blocks)
const VERSIONS: Array<{
  ver: number;
  size: number;
  dataBytes: number;
  ecBytes: number;
  blocks: number;
  align: number[];
}> = [
  { ver: 1, size: 21, dataBytes: 19, ecBytes: 7, blocks: 1, align: [] },
  { ver: 2, size: 25, dataBytes: 34, ecBytes: 10, blocks: 1, align: [6, 18] },
  { ver: 3, size: 29, dataBytes: 55, ecBytes: 15, blocks: 1, align: [6, 22] },
  { ver: 4, size: 33, dataBytes: 80, ecBytes: 20, blocks: 1, align: [6, 26] },
  { ver: 5, size: 37, dataBytes: 108, ecBytes: 26, blocks: 1, align: [6, 30] },
  { ver: 6, size: 41, dataBytes: 136, ecBytes: 18, blocks: 2, align: [6, 34] },
];

function buildCodewords(textBytes: Uint8Array): {
  spec: (typeof VERSIONS)[number];
  codewords: Uint8Array;
} {
  const spec =
    VERSIONS.find((v) => textBytes.length + 2 <= v.dataBytes) ??
    VERSIONS[VERSIONS.length - 1];
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  const maxBytes = Math.min(textBytes.length, spec.dataBytes - 2);
  pushBits(maxBytes, 8);
  for (let i = 0; i < maxBytes; i++) pushBits(textBytes[i], 8);
  pushBits(0, Math.min(4, spec.dataBytes * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
    data[i] = b;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataBytes; i++, p++) {
    data[i] = pads[p % 2];
  }

  const perBlock = Math.floor(spec.dataBytes / spec.blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const slice = data.slice(b * perBlock, (b + 1) * perBlock);
    dataBlocks.push(slice);
    ecBlocks.push(rsEncode(slice, spec.ecBytes));
  }

  const out: number[] = [];
  for (let i = 0; i < perBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < spec.ecBytes; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(ecBlocks[b][i]);
  }
  return { spec, codewords: new Uint8Array(out) };
}

function computeFormatBits(maskId: number): number {
  const data = (0b01 << 3) | maskId; // ECC L = 01
  let rem = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >> bit) & 1) rem ^= 0b10100110111 << (bit - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const { spec, codewords } = buildCodewords(bytes);
  const n = spec.size;
  const grid: Array<Array<boolean | null>> = Array.from({ length: n }, () =>
    Array<boolean | null>(n).fill(null),
  );
  const isFunc = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  const setFunc = (r: number, c: number, val: boolean) => {
    grid[r][c] = val;
    isFunc[r][c] = true;
  };

  const placeFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const val =
          inOuter &&
          (dr === 0 ||
            dr === 6 ||
            dc === 0 ||
            dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, val);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if (isFunc[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunc(ar + dr, ac + dc, val);
        }
      }
    }
  }

  setFunc(n - 8, 8, true); // Dark module
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) isFunc[8][i] = true;
    if (!isFunc[i][8]) isFunc[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][n - 1 - i]) isFunc[8][n - 1 - i] = true;
    if (!isFunc[n - 1 - i][8]) isFunc[n - 1 - i][8] = true;
  }

  // Place data bits in zig-zag
  let bitIdx = 0;
  let dir = -1;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const r = dir === -1 ? n - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (!isFunc[r][c]) {
          const bytePos = bitIdx >> 3;
          const bit =
            bytePos < codewords.length
              ? ((codewords[bytePos] >> (7 - (bitIdx & 7))) & 1) === 1
              : false;
          grid[r][c] = bit;
          bitIdx++;
        }
      }
    }
    dir = -dir;
  }

  const applyMaskAndFormat = (maskId: number): boolean[][] => {
    const out = grid.map((row) => row.map((v) => Boolean(v)));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isFunc[r][c]) continue;
        let flip = false;
        if (maskId === 0) flip = (r + c) % 2 === 0;
        else if (maskId === 1) flip = r % 2 === 0;
        else if (maskId === 2) flip = c % 3 === 0;
        else if (maskId === 3) flip = (r + c) % 3 === 0;
        else if (maskId === 4) flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        else if (maskId === 5) flip = ((r * c) % 2) + ((r * c) % 3) === 0;
        else if (maskId === 6) flip = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        else flip = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
        if (flip) out[r][c] = !out[r][c];
      }
    }
    const fmt = computeFormatBits(maskId);
    for (let i = 0; i <= 5; i++) out[8][i] = ((fmt >> (14 - i)) & 1) === 1;
    out[8][7] = ((fmt >> 8) & 1) === 1;
    out[8][8] = ((fmt >> 7) & 1) === 1;
    out[7][8] = ((fmt >> 6) & 1) === 1;
    for (let i = 0; i <= 5; i++) out[5 - i][8] = ((fmt >> (5 - i)) & 1) === 1;

    for (let i = 0; i < 8; i++) out[8][n - 1 - i] = ((fmt >> i) & 1) === 1;
    for (let i = 0; i < 7; i++) out[n - 1 - i][8] = ((fmt >> (14 - i)) & 1) === 1;
    return out;
  };

  let best = applyMaskAndFormat(0);
  let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    const mat = applyMaskAndFormat(m);
    let pen = 0;
    for (let r = 0; r < n; r++) {
      let run = 1;
      for (let c = 1; c < n; c++) {
        if (mat[r][c] === mat[r][c - 1]) run++;
        else {
          if (run >= 5) pen += run - 2;
          run = 1;
        }
      }
      if (run >= 5) pen += run - 2;
    }
    for (let c = 0; c < n; c++) {
      let run = 1;
      for (let r = 1; r < n; r++) {
        if (mat[r][c] === mat[r - 1][c]) run++;
        else {
          if (run >= 5) pen += run - 2;
          run = 1;
        }
      }
      if (run >= 5) pen += run - 2;
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const b = mat[r][c];
        if (mat[r][c + 1] === b && mat[r + 1][c] === b && mat[r + 1][c + 1] === b) {
          pen += 3;
        }
      }
    }
    if (pen < bestPenalty) {
      bestPenalty = pen;
      best = mat;
    }
  }
  return best;
}

export function qrToSvgDataUrl(text: string): string {
  const mat = encodeQrMatrix(text);
  const quiet = 3;
  const total = mat.length + quiet * 2;
  let path = "";
  for (let r = 0; r < mat.length; r++) {
    for (let c = 0; c < mat.length; c++) {
      if (mat[r][c]) {
        path += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
