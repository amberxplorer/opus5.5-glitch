/* ─────────────────────────────────────────────────────────────────────────
   jpeg.js — a small baseline JPEG codec, written to be broken.

   The encoder makes ordinary baseline JFIF files (4:2:0 or 4:4:4, the
   standard tables of ITU T.81 Annex K, optional restart markers).
   The decoder reads them back and fails the way libjpeg fails: a damaged
   bit decodes as garbage until the next restart marker, a stray marker or
   missing data decodes as flat grey, and damaged tables are used as found.
   Writing our own means every browser breaks the picture identically.
   ───────────────────────────────────────────────────────────────────────── */
var JPEG = (function () {
'use strict';

// zigzag position → natural (row-major) position in the 8×8 block
const ZZ = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63]);

// Annex K.1 quantisation tables, natural order
const Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const Q_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];

// Annex K.3 Huffman tables: code counts per length 1..16, then symbols
const H_DC_L = { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const H_DC_C = { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const H_AC_L = { bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], vals: [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa] };
const H_AC_C = { bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], vals: [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa] };

// IJG quality scaling (1..100)
function qtable(base, quality) {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const s = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
}

// orthonormal 8-point DCT-II basis: DCTC[u*8+x] = c(u)/2 · cos((2x+1)uπ/16)
const DCTC = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) DCTC[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2;
const TMP = new Float32Array(64);
function fdct(inp, out) {
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let s = 0; const r = y * 8, c = u * 8;
    for (let x = 0; x < 8; x++) s += DCTC[c + x] * inp[r + x];
    TMP[r + u] = s;
  }
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0; const c = v * 8;
    for (let y = 0; y < 8; y++) s += DCTC[c + y] * TMP[y * 8 + u];
    out[v * 8 + u] = s;
  }
}
// inverse: coefficients (natural order) → 64 samples; returns true if the block was flat
function idct(inp, out) {
  let ac = false;
  for (let i = 1; i < 64; i++) if (inp[i] !== 0) { ac = true; break; }
  if (!ac) { const v = inp[0] / 8; for (let i = 0; i < 64; i++) out[i] = v; return; }
  for (let v = 0; v < 8; v++) {
    const r = v * 8;
    let any = false;
    for (let u = 0; u < 8; u++) if (inp[r + u] !== 0) { any = true; break; }
    if (!any) { for (let x = 0; x < 8; x++) TMP[r + x] = 0; continue; }
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += DCTC[u * 8 + x] * inp[r + u];
      TMP[r + x] = s;
    }
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let s = 0;
    for (let v = 0; v < 8; v++) s += DCTC[v * 8 + y] * TMP[v * 8 + x];
    out[y * 8 + x] = s;
  }
}

/* ───────── encoder ───────── */
function encTable(h) {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < h.bits[l - 1]; i++) { code[h.vals[k]] = c; size[h.vals[k]] = l; c++; k++; }
    c <<= 1;
  }
  return { code, size };
}
const bitsize = (v) => { v = v < 0 ? -v : v; let s = 0; while (v) { s++; v >>= 1; } return s; };

// rgb: Uint8Array/Uint8ClampedArray with 3 or 4 channels per pixel
function encode(rgb, W, H, opts) {
  opts = opts || {};
  const ch = opts.channels || (rgb.length === W * H * 4 ? 4 : 3);
  const sub = opts.subsample === '444' ? 1 : 2;
  const quality = opts.quality || 85;
  const ri = opts.restart || 0;
  const qY = qtable(Q_LUMA, quality), qC = qtable(Q_CHROMA, quality);
  const mw = 8 * sub, mcx = Math.ceil(W / mw), mcy = Math.ceil(H / mw);
  const PW = mcx * mw, PH = mcy * mw;
  // colour planes, edge-replicated to whole MCUs
  const Yp = new Float32Array(PW * PH), Cbp = new Float32Array(PW * PH), Crp = new Float32Array(PW * PH);
  for (let y = 0; y < PH; y++) {
    const sy = Math.min(H - 1, y);
    for (let x = 0; x < PW; x++) {
      const sx = Math.min(W - 1, x), i = (sy * W + sx) * ch;
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2], o = y * PW + x;
      Yp[o] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      Cbp[o] = -0.168736 * r - 0.331264 * g + 0.5 * b;
      Crp[o] = 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
  }
  const out = []; let obuf = new Uint8Array(1 << 16), on = 0;
  const byte = (b) => { if (on === obuf.length) { const nb = new Uint8Array(obuf.length * 2); nb.set(obuf); obuf = nb; } obuf[on++] = b; };
  const word = (w) => { byte(w >> 8); byte(w & 255); };
  let acc = 0, cnt = 0;
  const put = (code, size) => {
    acc = (acc << size) | (code & ((1 << size) - 1)); cnt += size;
    while (cnt >= 8) { const b = (acc >>> (cnt - 8)) & 255; byte(b); if (b === 0xff) byte(0); cnt -= 8; }
    acc &= (1 << cnt) - 1;
  };
  const flush = () => { if (cnt > 0) put((1 << (8 - cnt)) - 1, 8 - cnt); };

  // headers
  word(0xffd8);
  word(0xffe0); word(16); [0x4a, 0x46, 0x49, 0x46, 0].forEach(byte); word(0x0101); byte(0); word(1); word(1); byte(0); byte(0);
  if (opts.comment) { const c = Array.from(opts.comment).map((s) => s.charCodeAt(0) & 255); word(0xfffe); word(c.length + 2); c.forEach(byte); }
  word(0xffdb); word(2 + 65 * 2);
  byte(0); for (let k = 0; k < 64; k++) byte(qY[ZZ[k]]);
  byte(1); for (let k = 0; k < 64; k++) byte(qC[ZZ[k]]);
  word(0xffc0); word(17); byte(8); word(H); word(W); byte(3);
  byte(1); byte((sub << 4) | sub); byte(0);
  byte(2); byte(0x11); byte(1);
  byte(3); byte(0x11); byte(1);
  const tabs = [[0x00, H_DC_L], [0x10, H_AC_L], [0x01, H_DC_C], [0x11, H_AC_C]];
  word(0xffc4); word(2 + tabs.reduce((s, [, h]) => s + 17 + h.vals.length, 0));
  for (const [id, h] of tabs) { byte(id); h.bits.forEach(byte); h.vals.forEach(byte); }
  if (ri) { word(0xffdd); word(4); word(ri); }
  word(0xffda); word(12); byte(3); byte(1); byte(0x00); byte(2); byte(0x11); byte(3); byte(0x11); byte(0); byte(63); byte(0);
  const scanStart = on;

  const eDCL = encTable(H_DC_L), eACL = encTable(H_AC_L), eDCC = encTable(H_DC_C), eACC = encTable(H_AC_C);
  const blk = new Float32Array(64), co = new Float32Array(64), qz = new Int32Array(64);
  const pred = [0, 0, 0];
  const rstAt = [];
  const code = (plane, px, py, step, q, dcT, acT, ci) => {
    // gather an 8×8 block, averaging step×step pixels (chroma subsampling)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) s += plane[(py + y * step + dy) * PW + px + x * step + dx];
      blk[y * 8 + x] = s / (step * step);
    }
    fdct(blk, co);
    for (let i = 0; i < 64; i++) qz[i] = Math.round(co[i] / q[i]);
    const diff = qz[0] - pred[ci]; pred[ci] = qz[0];
    let s = bitsize(diff);
    put(dcT.code[s], dcT.size[s]); if (s) put(diff < 0 ? diff + (1 << s) - 1 : diff, s);
    let run = 0;
    for (let k = 1; k < 64; k++) {
      const v = qz[ZZ[k]];
      if (v === 0) { run++; continue; }
      while (run > 15) { put(acT.code[0xf0], acT.size[0xf0]); run -= 16; }
      s = bitsize(v);
      const sym = (run << 4) | s;
      put(acT.code[sym], acT.size[sym]); put(v < 0 ? v + (1 << s) - 1 : v, s);
      run = 0;
    }
    if (run > 0) put(acT.code[0], acT.size[0]);
  };
  let mcu = 0, rst = 0;
  for (let my = 0; my < mcy; my++) for (let mx = 0; mx < mcx; mx++) {
    if (ri && mcu > 0 && mcu % ri === 0) {
      flush(); rstAt.push(on); byte(0xff); byte(0xd0 + (rst & 7)); rst++;
      pred[0] = pred[1] = pred[2] = 0;
    }
    const px = mx * mw, py = my * mw;
    for (let by = 0; by < sub; by++) for (let bx = 0; bx < sub; bx++) code(Yp, px + bx * 8, py + by * 8, 1, qY, eDCL, eACL, 0);
    code(Cbp, px, py, sub, qC, eDCC, eACC, 1);
    code(Crp, px, py, sub, qC, eDCC, eACC, 2);
    mcu++;
  }
  flush();
  const scanEnd = on;
  word(0xffd9);
  const bytes = obuf.slice(0, on);
  return { bytes, scanStart, scanEnd, restarts: rstAt, qY, qC };
}

/* ───────── decoder ───────── */
function decTable(bits, vals) {
  const maxcode = new Int32Array(18), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    valptr[l] = k; mincode[l] = c;
    c += bits[l - 1]; k += bits[l - 1];
    maxcode[l] = bits[l - 1] ? c - 1 : -1;
    c <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  return { maxcode, valptr, mincode, vals: Uint8Array.from(vals), n: k };
}

// Parse the headers. Returns null if the file cannot be read at all.
function parse(bytes, limit) {
  const len = Math.min(bytes.length, limit === undefined ? bytes.length : limit);
  if (len < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const info = { qt: [], dc: [], ac: [], ri: 0, frame: null, scan: null, dqtAt: [] };
  let p = 2;
  while (p + 3 < len) {
    if (bytes[p] !== 0xff) { p++; continue; }
    const m = bytes[p + 1];
    if (m === 0xff) { p++; continue; }
    p += 2;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xd9) break;
    const L = (bytes[p] << 8) | bytes[p + 1];
    const seg = p + 2, end = Math.min(len, p + L);
    if (m === 0xdb) {
      let q = seg;
      while (q < end) {
        const pq = bytes[q] >> 4, tq = bytes[q] & 3; q++;
        const t = new Uint16Array(64);
        info.dqtAt[tq] = q;
        for (let k = 0; k < 64 && q < end; k++) { t[ZZ[k]] = pq ? (bytes[q] << 8) | bytes[q + 1] : bytes[q]; q += pq ? 2 : 1; }
        info.qt[tq] = t;
      }
    } else if (m === 0xc4) {
      let q = seg;
      while (q + 17 <= end) {
        const tc = bytes[q] >> 4, th = bytes[q] & 3; q++;
        const bits = []; let n = 0;
        for (let i = 0; i < 16; i++) { bits.push(bytes[q + i]); n += bytes[q + i]; }
        q += 16;
        n = Math.min(n, 256, end - q);
        const vals = Array.from(bytes.subarray(q, q + n)); q += n;
        (tc ? info.ac : info.dc)[th] = decTable(bits, vals);
      }
    } else if (m === 0xc0 || m === 0xc1) {
      const nc = bytes[seg + 5];
      const comps = [];
      for (let i = 0; i < nc; i++) {
        const o = seg + 6 + i * 3;
        comps.push({ id: bytes[o], h: Math.max(1, bytes[o + 1] >> 4), v: Math.max(1, bytes[o + 1] & 15), tq: bytes[o + 2] & 3 });
      }
      info.frame = { H: (bytes[seg + 1] << 8) | bytes[seg + 2], W: (bytes[seg + 3] << 8) | bytes[seg + 4], comps };
    } else if (m === 0xdd) {
      info.ri = (bytes[seg] << 8) | bytes[seg + 1];
    } else if (m === 0xda) {
      const ns = bytes[seg];
      const sc = [];
      for (let i = 0; i < ns; i++) sc.push({ id: bytes[seg + 1 + i * 2], td: bytes[seg + 2 + i * 2] >> 4, ta: bytes[seg + 2 + i * 2] & 15 });
      info.scan = { comps: sc, start: end };
      break;
    }
    p = end;
  }
  if (!info.frame || !info.scan || !info.frame.W || !info.frame.H) return null;
  return info;
}

// decoder(bytes) → a stateful decoder over one (mutable) byte array.
// With restart markers every interval decodes independently, so a flipped
// bit only costs re-decoding its own band — and a slow download is just
// the intervals that have arrived so far.
function decoder(bytes) {
  let info = parse(bytes);
  if (!info) return null;
  const { W, H, comps } = info.frame;
  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const mcx = Math.ceil(W / (8 * hmax)), mcy = Math.ceil(H / (8 * vmax));
  const total = mcx * mcy;
  const planes = comps.map((c) => ({ w: mcx * c.h * 8, h: mcy * c.v * 8, d: null }));
  planes.forEach((pl) => { pl.d = new Float32Array(pl.w * pl.h).fill(128); });
  let sc = null, qts = null;
  const tables = () => {
    sc = info.scan.comps.map((s) => {
      const ci = Math.max(0, comps.findIndex((c) => c.id === s.id));
      return { ci, dc: info.dc[s.td] || info.dc[0], ac: info.ac[s.ta] || info.ac[0] };
    });
    qts = comps.map((c) => info.qt[c.tq] || info.qt[0] || new Uint16Array(64).fill(1));
  };
  tables();
  // interval byte ranges, from the restart markers of the file as written
  let scanEnd = bytes.length - 2;
  while (scanEnd > info.scan.start && !(bytes[scanEnd] === 0xff && bytes[scanEnd + 1] === 0xd9)) scanEnd--;
  const ri = info.ri || total;
  const nInt = Math.ceil(total / ri);
  const starts = [info.scan.start];
  for (let p = info.scan.start; p < scanEnd - 1 && starts.length < nInt; p++) {
    if (bytes[p] === 0xff && bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7) { starts.push(p + 2); p++; }
  }
  while (starts.length < nInt) starts.push(scanEnd);
  const ends = starts.map((s, k) => (k + 1 < nInt ? starts[k + 1] - 2 : scanEnd));

  // bit reader. Past a marker (or past what has arrived) it pads with zeros;
  // only *using* padding marks the interval as short, as libjpeg does.
  let pos = 0, lim = 0, acc = 0, cnt = 0, pad = 0, hit = false, insufficient = false;
  const fill = () => {
    while (cnt <= 24) {
      let b = 0;
      if (!hit && pos < lim) {
        b = bytes[pos];
        if (b === 0xff) {
          const nb = pos + 1 < lim ? bytes[pos + 1] : -1;
          if (nb === 0) pos += 2;
          else { hit = true; b = 0; pad += 8; }
        } else pos++;
      } else pad += 8;
      acc = ((acc << 8) | b) >>> 0; cnt += 8;
    }
  };
  const bit = () => { if (cnt === 0) fill(); cnt--; if (cnt < pad) insufficient = true; return (acc >>> cnt) & 1; };
  const bitsN = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const huff = (T) => {
    if (!T) return 0;
    let code = bit(), l = 1;
    while (code > T.maxcode[l]) { if (l >= 16) return 0; code = (code << 1) | bit(); l++; }
    const i = T.valptr[l] + code - T.mincode[l];
    return i < T.n ? T.vals[i] : 0;
  };
  const extend = (v, s) => (v < (1 << (s - 1)) ? v - (1 << s) + 1 : v);
  const blk = new Float32Array(64), smp = new Float32Array(64);
  const pred = new Float64Array(comps.length);
  const block = (s, zero) => {
    blk.fill(0);
    if (!zero) {
      let t = huff(s.dc); if (t > 16) t = 16;
      if (t) pred[s.ci] += extend(bitsN(t), t);
      blk[0] = pred[s.ci];
      for (let k = 1; k < 64;) {
        const rs = huff(s.ac), r = rs >> 4, z = rs & 15;
        if (z) { k += r; if (k > 63) break; blk[ZZ[k]] = extend(bitsN(z), z); k++; }
        else if (r === 15) k += 16;
        else break;
      }
      const q = qts[s.ci];
      for (let i = 0; i < 64; i++) blk[i] *= q[i];
      idct(blk, smp);
    } else smp.fill(0);
  };
  const put = (ci, bx, by) => {
    const pl = planes[ci], d = pl.d, w = pl.w;
    for (let y = 0; y < 8; y++) { const o = (by + y) * w + bx; for (let x = 0; x < 8; x++) d[o + x] = smp[y * 8 + x] + 128; }
  };
  // decode interval k with the bytes that have arrived (limit); returns the pixel rows it covers
  function interval(k, limit) {
    lim = Math.min(bytes.length, limit === undefined ? bytes.length : limit);
    pos = starts[k]; acc = 0; cnt = 0; pad = 0; hit = false; pred.fill(0);
    insufficient = pos >= lim;
    const m0 = k * ri, m1 = Math.min(total, m0 + ri);
    for (let m = m0; m < m1; m++) {
      const zero = insufficient;
      const mx = m % mcx, my = (m / mcx) | 0;
      for (const s of sc) {
        const c = comps[s.ci];
        for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) {
          block(s, zero);
          put(s.ci, (mx * c.h + h) * 8, (my * c.v + v) * 8);
        }
      }
    }
    const rowH = 8 * vmax;
    return [Math.floor(m0 / mcx) * rowH, Math.min(H, (Math.floor((m1 - 1) / mcx) + 1) * rowH)];
  }
  // planes → RGBA rows [y0, y1)
  function color(out, y0, y1) {
    const P0 = planes[0], c0 = comps[0];
    y0 = Math.max(0, y0 || 0); y1 = Math.min(H, y1 === undefined ? H : y1);
    if (comps.length >= 3) {
      const P1 = planes[1], P2 = planes[2], c1 = comps[1], c2 = comps[2];
      const sx0 = c0.h / hmax, sy0 = c0.v / vmax, sx1 = c1.h / hmax, sy1 = c1.v / vmax, sx2 = c2.h / hmax, sy2 = c2.v / vmax;
      for (let y = y0; y < y1; y++) {
        const r0 = ((y * sy0) | 0) * P0.w, r1 = ((y * sy1) | 0) * P1.w, r2 = ((y * sy2) | 0) * P2.w;
        for (let x = 0; x < W; x++) {
          const Y = P0.d[r0 + ((x * sx0) | 0)], cb = P1.d[r1 + ((x * sx1) | 0)] - 128, cr = P2.d[r2 + ((x * sx2) | 0)] - 128;
          const o = (y * W + x) * 4;
          out[o] = Y + 1.402 * cr;
          out[o + 1] = Y - 0.344136 * cb - 0.714136 * cr;
          out[o + 2] = Y + 1.772 * cb;
          out[o + 3] = 255;
        }
      }
    } else {
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const v = P0.d[y * P0.w + x], o = (y * W + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
      }
    }
    return out;
  }
  function all(out, limit) {
    for (let k = 0; k < nInt; k++) interval(k, limit);
    return color(out || new Uint8ClampedArray(W * H * 4));
  }
  // after damaging a table (DQT/DHT), read the headers again
  function reparse() { const i2 = parse(bytes); if (i2) { i2.scan.start = info.scan.start; info = i2; tables(); } }
  // after damaging a restart marker: find the markers that are left, as a decoder
  // resynchronising would; everything below a lost marker slides up one interval
  function resync() {
    starts.length = 1;
    for (let p = info.scan.start; p < scanEnd - 1 && starts.length < nInt; p++) {
      if (bytes[p] === 0xff && bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7) { starts.push(p + 2); p++; }
    }
    while (starts.length < nInt) starts.push(scanEnd);
    for (let k = 0; k < nInt; k++) ends[k] = k + 1 < nInt ? Math.max(starts[k], starts[k + 1] - 2) : scanEnd;
  }
  const intervalAt = (offset) => { let lo = 0, hi = nInt - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
  return { W, H, mcx, mcy, total, ri, count: nInt, starts, ends, scanEnd, bytes, get info() { return info; }, interval, color, all, reparse, resync, intervalAt };
}

// one-shot convenience: decode(bytes, {limit}) → { W, H, data }
function decode(bytes, opts) {
  const d = decoder(bytes);
  if (!d) return null;
  const data = d.all(null, opts && opts.limit);
  return { W: d.W, H: d.H, data, decoder: d };
}

// where the entropy-coded data lives, and which bytes are safe to flip
function layout(bytes) {
  const info = parse(bytes);
  if (!info) return null;
  let end = bytes.length - 2;
  while (end > info.scan.start && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) end--;
  const rst = [];
  for (let p = info.scan.start; p < end - 1; p++) if (bytes[p] === 0xff && bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7) rst.push(p);
  return { info, scanStart: info.scan.start, scanEnd: end, restarts: rst };
}

return { encode, decode, decoder, parse, layout, qtable, fdct, idct, ZZ, Q_LUMA, Q_CHROMA };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JPEG;
