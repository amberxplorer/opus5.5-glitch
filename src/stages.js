/* ─────────────────────────────────────────────────────────────────────────
   stages.js — the processes that carry state from frame to frame, all on a
   work canvas whose picture square is 720 px:

     download     the JPEG arriving in packets, decoded as it comes
     bit rot      planned single-bit changes, each re-decoding one interval
     sort         odd–even transposition passes, paced by the sorting sounds
     mosh         predicted frames at 30 a second, pushed by the kicks
     analog       composite video (stateless, per frame)
     waterfall    rows of the soundtrack's spectrum, 72 a second
     jpeg         re-saves, every eighth then every sixteenth note
     averages     the square reduced to block means, down to one colour

   Everything is a function of the music time: a stage asked for an earlier
   moment than it holds starts again from its beginning.
   ───────────────────────────────────────────────────────────────────────── */
var STAGES = (function () {
'use strict';
const { T, STEP, GEN, SPEC } = SYNTH;
const GT = GEN.map((b) => T(b, 0));
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i); return a; };

const P = {};
let L = null, R = null, lg = -1, music = null, S = null;
const earth = { orig: null, tex: null, pristine: null, disk: null };
const DCT = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) DCT[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2;
const QY = Float32Array.from(JPEG.Q_LUMA), QC = Float32Array.from(JPEG.Q_CHROMA);

function init() {
  L = GFX.L;
  for (const k of ['place', 'sort', 'mosh', 'analog', 'jpegIn', 'jpegRow', 'jpegCol', 'blocks', 'avg', 'up', 'waterfall']) P[k] = GFX.program(SHADERS[k]);
  earth.orig = b64(MEDIA.earth.jpeg);
  earth.disk = MEDIA.earth.disk;
  earth.tex = GFX.texture(720, 720);
  // the untouched picture, for the new clip of the datamosh
  const d = JPEG.decode(earth.orig);
  earth.pristine = GFX.texture(720, 720);
  GFX.upload(earth.pristine, new Uint8Array(d.data.buffer));
  earth.bytes = earth.orig.length;
  const lay = JPEG.layout(earth.orig);
  earth.scanBits = (lay.scanEnd - lay.scanStart) * 8;
}
function setMusic(m) {
  music = m; S = m.score;
  planFlips(); planSort(); planJpeg();
}

/* targets follow the layout */
const RING = 2048, ROWS = 72;
function ensure() {
  if (R && lg === L.gen) return R;
  if (R) {
    for (const k of ['a', 'b', 'recv', 'disp', 'f1', 'f2', 'ring']) GFX.free(R[k]);
    R.levels.forEach(GFX.free);
  }
  const { WW, WH } = L;
  R = {
    a: GFX.target(WW, WH), b: GFX.target(WW, WH), recv: GFX.target(WW, WH), disp: GFX.target(WW, WH),
    f1: GFX.target(WW, WH, { float: true }), f2: GFX.target(WW, WH, { float: true }),
    ring: GFX.texture(WW, RING, { format: 'r8' }), levels: [90, 45, 15, 5, 1].map((n) => GFX.target(n, n)),
  };
  R.work = R.a; R.other = R.b;
  lg = L.gen;
  WS.stage = null; WF.lg = -1; AV.key = '';
  return R;
}
const swap = () => { const t = R.work; R.work = R.other; R.other = t; };
// drawing straight into the work canvas means it no longer holds any stage's state
function place() { GFX.pass(P.place, { uSq: [L.sq.x, L.sq.y, 720, 0] }, { uImg: earth.tex }, R.work); WS.stage = null; }

/* ───────── download ───────── */
const DL = { dec: null, img: null, bytes: null, done: -1, limit: -1, got: 0 };
function downloadTo(t) {
  let got = 0;
  for (const [pt, g] of S.packets) if (pt <= t) got = g;
  const limit = got >= 1 ? earth.orig.length : Math.floor(got * earth.orig.length);
  if (!DL.dec || limit < DL.limit) {
    DL.bytes = earth.orig.slice();
    DL.dec = JPEG.decoder(DL.bytes);
    DL.img = new Uint8ClampedArray(720 * 720 * 4);
    for (let i = 0; i < DL.img.length; i += 4) { DL.img[i] = DL.img[i + 1] = DL.img[i + 2] = 128; DL.img[i + 3] = 255; }
    DL.done = -1; DL.limit = 0;
    GFX.upload(earth.tex, new Uint8Array(DL.img.buffer));
    ROT.dec = null;
  }
  DL.got = limit;
  if (limit === DL.limit) return limit;
  const d = DL.dec;
  let y0 = 1e9, y1 = -1;
  for (let k = DL.done + 1; k < d.count; k++) {
    if (d.starts[k] >= limit) break;
    const [a, b] = d.interval(k, limit);
    d.color(DL.img, a, b);
    y0 = Math.min(y0, a); y1 = Math.max(y1, b);
    if (d.ends[k] <= limit) DL.done = k; else break;
  }
  DL.limit = limit;
  if (y1 > y0) GFX.upload(earth.tex, new Uint8Array(DL.img.buffer, y0 * 720 * 4, (y1 - y0) * 720 * 4), 0, y0, 720, y1 - y0);
  return limit;
}

/* ───────── bit rot ───────── */
const ROT = { bytes: null, dec: null, img: null, applied: 0, band: null };
let FLIPS = [];
function planFlips() {
  const d = JPEG.decoder(earth.orig.slice());
  const info = JPEG.parse(earth.orig);
  const R2 = rng(1972), used = new Set();
  FLIPS = [];
  let dq = 0;
  for (const [t, kind, bit] of S.flips) {
    if (kind === 'scan') {
      let off = 0;
      for (let tries = 0; tries < 200; tries++) {
        const k = 4 + Math.floor(R2() * 37), a = d.starts[k], b = d.ends[k];
        off = a + Math.floor(Math.pow(R2(), 1.6) * (b - a));
        if (earth.orig[off] !== 0xff && earth.orig[off - 1] !== 0xff && earth.orig[off + 1] !== 0xff && !used.has(off)) break;
      }
      used.add(off);
      FLIPS.push({ t, kind, off, bit });
    } else if (kind === 'dqt') {
      // first the chroma table's DC step, then the luma table's first AC step
      FLIPS.push({ t, kind, off: dq === 0 ? info.dqtAt[1] : info.dqtAt[0] + 1, bit: 5 });
      dq++;
    } else {
      FLIPS.push({ t, kind, off: d.starts[23] - 1, bit: 3 });
    }
  }
}
function rotTo(t) {
  let n = 0;
  while (n < FLIPS.length && FLIPS[n].t <= t) n++;
  if (!ROT.dec || n < ROT.applied) {
    ROT.bytes = earth.orig.slice();
    ROT.dec = JPEG.decoder(ROT.bytes);
    ROT.img = ROT.dec.all();
    ROT.applied = 0; ROT.band = null;
    GFX.upload(earth.tex, new Uint8Array(ROT.img.buffer));
    DL.dec = null;
  }
  const d = ROT.dec;
  let y0 = 1e9, y1 = -1;
  while (ROT.applied < n) {
    const f = FLIPS[ROT.applied++];
    ROT.bytes[f.off] ^= 1 << f.bit;
    if (f.kind === 'scan') {
      const [a, b] = d.interval(d.intervalAt(f.off));
      d.color(ROT.img, a, b);
      y0 = Math.min(y0, a); y1 = Math.max(y1, b);
      ROT.band = [a, b, f.t];
    } else {
      if (f.kind === 'dqt') d.reparse(); else d.resync();
      d.all(ROT.img);
      y0 = 0; y1 = 720;
      ROT.band = [0, 720, f.t];
    }
  }
  if (y1 > y0) GFX.upload(earth.tex, new Uint8Array(ROT.img.buffer, y0 * 720 * 4, (y1 - y0) * 720 * 4), 0, y0, 720, y1 - y0);
  return n;
}

/* ───────── the chains: sort → mosh, and waterfall → jpeg ───────── */
const WS = { stage: null, n: 0 };
function want(stage, n) {
  if (WS.stage !== stage || n < WS.n) { begin(stage); WS.stage = stage; WS.n = 0; }
  if (n > WS.n) { advance(stage, WS.n, n); WS.n = n; }
}
function begin(stage) {
  if (stage === 'sort') { rotTo(GT[2] - 1e-4); place(); }
  else if (stage === 'mosh') want('sort', SORT.total);
  else if (stage === 'jpeg') { waterfallTo(SPEC.t1); drawWaterfall(SPEC.t1); }
}
function advance(stage, a, b) {
  if (stage === 'sort') {
    for (let j = a; j < b; j++) {
      const v = j < SORT.nv;
      const thr = v ? lerp(0.34, 0.16, j / Math.max(1, SORT.nv)) : 0.12;
      GFX.pass(P.sort, { uSize: [L.WW, L.WH], uParity: j & 1, uDir: v ? 0 : 1, uThr: thr }, { uS: R.work }, R.other);
      swap();
    }
  } else if (stage === 'mosh') {
    for (let s = a; s < b; s++) {
      const m = moshParams(GT[3] + s / MOSH_RATE);
      GFX.pass(P.mosh, {
        uSize: [L.WW, L.WH], uC: [L.sq.x + earth.disk.cx, L.sq.y + earth.disk.cy], uZoom: m.zoom, uRot: m.rot, uJit: m.jit,
        uRefresh: m.refresh, uStep: s, uSq: [L.sq.x, L.sq.y, 720, 0], uSrcXf: [m.srcZoom, m.srcRot],
      }, { uS: R.work, uSrc: earth.pristine }, R.other);
      swap();
    }
  } else if (stage === 'jpeg') {
    for (let e = a; e < b; e++) resave(e);
  }
}

// sorting: passes per second follow the sorting sounds; the last two bars sort sideways
const SORT = { cum: null, total: 0, nv: 0 };
function planSort() {
  const t0 = GT[2], n = Math.round((GT[3] - t0) * 60), hStart = T(18, 0);
  SORT.cum = new Int32Array(n + 1);
  let acc = 0, nv = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / 60;
    let rate = 16;
    for (const [a, b, amt, dir] of S.sorts) if (t >= a && t < b) rate = dir === 'h' ? 150 : 540 * amt;
    acc += rate / 60;
    SORT.cum[i + 1] = Math.floor(acc);
    if (t < hStart) nv = SORT.cum[i + 1];
  }
  SORT.total = SORT.cum[n]; SORT.nv = nv;
}
const sortAt = (t) => SORT.cum[clamp(Math.floor((t - GT[2]) * 60), 0, SORT.cum.length - 1)];

// moshing: kicks push the blocks outward, snares let blocks of the new clip in
const MOSH_RATE = 30;
const MOSH_TOTAL = Math.round((GT[4] - GT[3]) * MOSH_RATE);
function lastBefore(list, t) {
  let lo = 0, hi = list.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function moshParams(t) {
  const u = clamp((t - GT[3]) / (GT[4] - GT[3]), 0, 1);
  const ki = lastBefore(S.kick, t), si = lastBefore(S.snare, t);
  const kick = ki >= 0 ? Math.exp(-(t - S.kick[ki][0]) / 0.12) * S.kick[ki][1] : 0;
  const snare = si >= 0 && t - S.snare[si][0] < 0.07 ? 1 : 0;
  // gentle at first, so the sorted Earth is still there to be dragged; wilder toward the end
  return {
    zoom: 0.0012 + 0.005 * u * u + 0.022 * kick * (0.4 + 0.6 * u), rot: 0.0025 * Math.sin(t * 0.9) + 0.004 * u,
    jit: 0.0005 + 0.012 * snare * u + 0.02 * u * u * u, refresh: 0.0008 + 0.03 * snare * (0.3 + 0.7 * u),
    srcZoom: 1.05 + 0.9 * u, srcRot: 0.35 * u,
  };
}
const moshAt = (t) => clamp(Math.floor((t - GT[3]) * MOSH_RATE), 0, MOSH_TOTAL);

// analog: the moshed picture through a composite signal (display only)
function analog(t, amt, track) {
  GFX.pass(P.analog, { uSize: [L.WW, L.WH], uFrame: Math.floor(t * 30), uAmt: amt, uTrack: track, uSeed: 3 }, { uS: R.work }, R.recv);
  return R.recv;
}

// re-saving: every eighth, then every sixteenth, each at a lower quality
const JPG = { events: [], q: [], total: 0 };
function planJpeg() {
  JPG.events = [];
  for (let bar = 44; bar < 48; bar++) for (let s = 0; s < 16; s += 2) JPG.events.push(T(bar, s));
  for (let bar = 48; bar < 51; bar++) for (let s = 0; s < 16; s++) JPG.events.push(T(bar, s));
  JPG.total = JPG.events.length;
  JPG.q = JPG.events.map((_, i) => Math.max(2, Math.round(40 * Math.pow(3 / 40, i / (JPG.total - 1)))));
}
const jpegAt = (t) => { let n = 0; while (n < JPG.total && JPG.events[n] <= t) n++; return n; };
function resave(e) {
  const q = JPG.q[e], scale = (q < 50 ? 5000 / q : 200 - q * 2) / 100;
  const shifts = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const t = JPG.events[e];
  const loud = Math.round((t - GT[6]) / STEP) % 8 === 4 && t > T(46, 0);
  const size = [L.WW, L.WH], enc = GFX.floatOK ? 0 : 1;
  GFX.pass(P.jpegIn, { uSize: size, uShift: shifts[e % 4], uEnc: enc }, { uS: R.work }, R.f1);
  GFX.pass(P.jpegRow, { uSize: size, uC: DCT, uInv: 0, uEnc: enc }, { uS: R.f1 }, R.f2);
  GFX.pass(P.jpegCol, { uSize: size, uC: DCT, uInv: 0, uQY: QY, uQC: QC, uScale: scale, uGl: loud ? [0.04, 0.05, 0.03, 0] : [0.004, 0.006, 0.002, 0], uSeed: e * 7.31, uEnc: enc }, { uS: R.f2 }, R.f1);
  GFX.pass(P.jpegCol, { uSize: size, uC: DCT, uInv: 1, uQY: QY, uQC: QC, uScale: 1, uGl: [0, 0, 0, 0], uSeed: 0, uEnc: enc }, { uS: R.f1 }, R.f2);
  GFX.pass(P.jpegRow, { uSize: size, uC: DCT, uInv: 1, uSq: [L.sq.x, L.sq.y, 720, 0], uEnc: enc }, { uS: R.f2 }, R.other);
  swap();
  const st = S.stutters.some((s) => Math.abs(s[0] - t) < STEP * 0.5);
  if (st || (loud && e % 3 === 0)) {
    GFX.pass(P.blocks, { uSize: size, uP: st ? 0.08 : 0.03, uSeed: e * 1.7 }, { uS: R.work }, R.other);
    swap();
  }
}

/* ───────── the waterfall ───────── */
const WF = { lg: -1, head: -1, first: 0, fx: null, row: null, re: null, im: null, win: null };
const F0 = SYNTH.mtof(SPEC.note), FLO = F0 * (SPEC.k0 - 0.5), FHI = F0 * (SPEC.k1 + 0.5);
function waterfallTo(tHead) {
  const first = Math.ceil(GT[5] * ROWS), head = Math.floor(tHead * ROWS);
  if (WF.lg !== L.gen || head < WF.head || !WF.fx) {
    WF.lg = L.gen; WF.head = first - 1; WF.first = first;
    WF.fx = new Float32Array(L.WW);
    for (let x = 0; x < L.WW; x++) WF.fx[x] = FLO + (x - L.sq.x + 0.5) * (FHI - FLO) / 720;
    WF.row = new Uint8Array(L.WW);
    WF.re = new Float64Array(4096); WF.im = new Float64Array(4096); WF.win = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) WF.win[i] = 0.5 - 0.5 * Math.cos(TAU * i / 4096);
  }
  const visible = L.WH - L.sq.y + 4;
  for (let j = Math.max(WF.head + 1, head - visible, first); j <= head; j++) {
    spectrumRow(j);
    GFX.upload(R.ring, WF.row, 0, j % RING, L.WW, 1);
  }
  WF.head = Math.max(WF.head, head);
}
function spectrumRow(j) {
  const N = 4096, re = WF.re, im = WF.im, SR = music.sampleRate, A = music.L, B = music.R;
  const c = Math.round(j / ROWS * SR) - N / 2;
  for (let i = 0; i < N; i++) { const k = c + i; re[i] = k >= 0 && k < A.length ? (A[k] + B[k]) * 0.5 * WF.win[i] : 0; im[i] = 0; }
  SYNTH.fft(re, im, false);
  for (let x = 0; x < L.WW; x++) {
    const f = WF.fx[x];
    if (f <= 0) { WF.row[x] = 0; continue; }
    const bp = f / SR * N, b0 = Math.floor(bp), fr = bp - b0;
    const m = (Math.hypot(re[b0], im[b0]) * (1 - fr) + Math.hypot(re[b0 + 1], im[b0 + 1]) * fr) * 4 / N;
    WF.row[x] = Math.round(255 * clamp((20 * Math.log10(m + 1e-9) + 88) / 68, 0, 1));
  }
}
function drawWaterfall(tHead) {
  GFX.pass(P.waterfall, { uSize: [L.WW, L.WH], uHead: Math.floor(tHead * ROWS), uRows: RING, uTop: L.sq.y, uFirst: WF.first, uLeft: L.sq.x }, { uRing: R.ring }, R.work);
  WS.stage = null;
  return R.work;
}

/* ───────── averages ───────── */
const AV = { key: '', rgb: [0, 0, 0] };
function averages() {
  const key = L.gen + ':' + WS.stage + ':' + WS.n;
  if (AV.key !== key) {
    const lv = R.levels;
    GFX.pass(P.avg, { uOrigin: [L.sq.x, L.sq.y], uN: 8 }, { uS: R.work }, lv[0]);
    GFX.pass(P.avg, { uOrigin: [0, 0], uN: 2 }, { uS: lv[0] }, lv[1]);
    GFX.pass(P.avg, { uOrigin: [0, 0], uN: 3 }, { uS: lv[1] }, lv[2]);
    GFX.pass(P.avg, { uOrigin: [0, 0], uN: 3 }, { uS: lv[2] }, lv[3]);
    GFX.pass(P.avg, { uOrigin: [0, 0], uN: 5 }, { uS: lv[3] }, lv[4]);
    const px = GFX.read(lv[4], 0, 0);
    AV.rgb = [px[0], px[1], px[2]];
    AV.key = key;
  }
  return AV.rgb;
}
// the square drawn from one level of the reduction (block size 8, 16, 48, 144 or 720)
function blocks(level) {
  const n = [90, 45, 15, 5, 1][level];
  GFX.pass(P.up, { uLS: [n, n], uSq: [L.sq.x, L.sq.y, 720, 0] }, { uS: R.levels[level] }, R.disp);
  return R.disp;
}

return {
  init, setMusic, ensure, place, downloadTo, rotTo, want, sortAt, moshAt, jpegAt, analog, waterfallTo, drawWaterfall, averages, blocks,
  get R() { return R; }, get flips() { return FLIPS; }, get rot() { return ROT; }, get dl() { return DL; }, earth,
  SORT, JPG, MOSH_TOTAL, WF, RING, ROWS, FLO, FHI, F0,
};
})();
