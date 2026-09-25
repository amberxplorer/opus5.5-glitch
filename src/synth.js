/* ─────────────────────────────────────────────────────────────────────────
   synth.js — the soundtrack of Generation Loss. Everything is synthesized
   here, sample by sample, from the score below; nothing is recorded.

   120 bpm, 4/4, 60 bars. At its heart is a four-bar loop (E♭maj9, Gm7,
   Cm9, A♭maj7♯11) that plays fourteen times. Each time it is a copy of the
   copy before, made through the medium of the generation it plays in:
   a lossy codec, sorted samples, moshed grains, tape, radio, a bit-crusher,
   and at last a room that it is re-recorded in until only the room's own
   resonances are left (after Alvin Lucier, 1969). The copies are made at
   32 768 Hz so the loop is exactly 2^18 samples and every process can
   treat it as circular.
   ───────────────────────────────────────────────────────────────────────── */
var SYNTH = (function () {
'use strict';

/* ───────── time ───────── */
const STEP = 0.125, BEAT = 0.5, BAR = 2;
const BARS = 60, PIECE = BARS * BAR, TAIL = 2, DURATION = PIECE + TAIL;
const T = (bar, step) => (bar * 16 + (step || 0)) * STEP;
const GEN = [0, 4, 12, 20, 28, 36, 44, 52, 60];          // first bar of each generation
const genOf = (bar) => { let g = 0; while (g < 7 && bar >= GEN[g + 1]) g++; return g; };
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const STEMS = ['kick', 'snare', 'hat', 'click', 'bass', 'loop', 'tone', 'modem', 'flip', 'sort', 'noise', 'spectral', 'riser', 'crash', 'blip'];
const ST = {}; STEMS.forEach((s, i) => (ST[s] = i));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── FFT (radix-2, in place) ───────── */
const twiddles = {};
function fft(re, im, inverse) {
  const n = re.length;
  let tw = twiddles[n];
  if (!tw) {
    tw = twiddles[n] = { c: new Float64Array(n >> 1), s: new Float64Array(n >> 1) };
    for (let i = 0; i < n >> 1; i++) { tw.c[i] = Math.cos(TAU * i / n); tw.s[i] = Math.sin(TAU * i / n); }
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const sg = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.c[k * stride], wi = sg * tw.s[k * stride];
        const a = i + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/* ───────── the score ───────── */
// the loop, one chord per bar
const LOOP = {
  ep: [[55, 58, 62, 65], [53, 58, 62, 67], [51, 55, 58, 62], [51, 55, 60, 62]],
  pad: [[67, 70, 74], [65, 70, 74], [67, 70, 75], [67, 72, 74]],
  // music box: [step, note, length]; the long note on step 8 of each bar is the tune (G F E♭ D)
  box: [
    [[0, 63, 2], [2, 70, 2], [4, 74, 2], [6, 77, 2], [8, 79, 4], [12, 77, 2], [14, 74, 2]],
    [[0, 62, 2], [2, 67, 2], [4, 70, 2], [6, 74, 2], [8, 77, 4], [12, 74, 2], [14, 70, 2]],
    [[0, 60, 2], [2, 67, 2], [4, 70, 2], [6, 74, 2], [8, 75, 4], [12, 74, 2], [14, 70, 2]],
    [[0, 60, 2], [2, 63, 2], [4, 67, 2], [6, 72, 2], [8, 74, 6], [14, 70, 2]],
  ],
  bass: [39, 31, 36, 32],
};
const REPS = 14;                                    // loop copies heard, from bar 4
// what made each copy (rep r plays generation r of the loop)
const COPY = ['master', 'codec', 'sort', 'sort', 'mosh', 'mosh', 'tape', 'tape', 'radio', 'radio', 'crush', 'crush', 'room', 'room'];
const DIAL = '4363728466';                          // G E N E R A T I O N on a telephone keypad
const SPEC = { t0: T(37, 0), t1: T(42, 0), note: 27, k0: 10, k1: 180 };   // the Earth, as harmonics 10–180 of E♭1

function buildScore() {
  const R = rng(1972);
  const S = {
    kick: [], snare: [], rim: [], hat: [], ohat: [], click: [], bass: [], flips: [], sorts: [], stutters: [],
    crashes: [], impacts: [], subs: [], blips: [], packets: [], dial: [], rolls: [], marks: {},
  };
  const kick = (t, vel, extra) => S.kick.push(Object.assign({ t, vel }, extra || {}));
  const hitBar = (bar, steps, list, vel, extra) => steps.forEach((s) => list.push(Object.assign({ t: T(bar, s), vel: typeof vel === 'function' ? vel(s) : vel }, extra || {})));

  /* gen 0 · line-up, dial, handshake, download */
  S.tone = [0.04, T(1, 8)];
  for (let i = 0; i < DIAL.length; i++) S.dial.push({ t: T(1, 8 + i), d: DIAL[i] });
  S.answer = [T(2, 2), T(2, 6)];
  S.fsk = [T(2, 6), T(2, 10)];
  S.bongs = [T(2, 10), T(2, 12)];
  S.data = [T(2, 14), T(4, 0)];
  {
    // packets arrive unevenly; each carries a slice of the file
    const n = 30, t0 = S.data[0] + 0.05, t1 = S.data[1] - 0.04;
    let acc = 0; const w = [];
    for (let i = 0; i < n; i++) { const x = 0.4 + R() * 1.2; w.push(x); acc += x; }
    let t = t0, got = 0;
    for (let i = 0; i < n; i++) {
      t += (w[i] / acc) * (t1 - t0);
      got += 0.6 / n + 0.4 * (w[(i * 7) % n] / acc);
      S.packets.push({ t: Math.min(t, t1), got: i === n - 1 ? 1 : Math.min(0.999, got) });
    }
  }

  /* gen 1 · bit rot: one bit at a time, then more */
  {
    const per = [1, 2, 3, 4, 6, 8, 12, 16];
    for (let b = 4; b < 12; b++) {
      const n = per[b - 4];
      const pool = []; for (let s = 0; s < 16; s++) pool.push(s);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const steps = b < 6 ? [8, 0, 12].slice(0, n) : pool.slice(0, n).sort((x, y) => x - y);
      for (const s of steps) S.flips.push({ t: T(b, s), kind: 'scan', bit: Math.floor(R() * 8) });
    }
    // the quantisation table goes on the downbeats of bars 10 and 11; a restart marker in between
    S.flips = S.flips.filter((f) => !(Math.abs(f.t - T(10, 0)) < 1e-6 || Math.abs(f.t - T(11, 0)) < 1e-6 || Math.abs(f.t - T(10, 8)) < 1e-6));
    S.flips.push({ t: T(10, 0), kind: 'dqt', bit: 5 }, { t: T(10, 8), kind: 'rst', bit: 3 }, { t: T(11, 0), kind: 'dqt', bit: 6 });
    S.flips.sort((a, b) => a.t - b.t);
    S.flips.forEach((f, i) => (f.i = i));
  }

  /* drums, bass, clicks by generation */
  for (let bar = 4; bar < 52; bar++) {
    const g = genOf(bar), odd = bar & 1;
    const root = LOOP.bass[bar % 4];
    if (g === 1) {
      if (bar < 8) { kick(T(bar, 0), 0.62); kick(T(bar, 10), 0.45); }
      else {
        kick(T(bar, 0), 0.75); kick(T(bar, 7), 0.5); kick(T(bar, 10), 0.62);
        hitBar(bar, [4, 12], S.rim, 0.55);
        S.bass.push({ t: T(bar, 0), dur: 5.5 * STEP, note: root, vel: 0.8 }, { t: T(bar, 10), dur: 4 * STEP, note: root, vel: 0.65 });
      }
      for (let s = 0; s < 16; s++) {
        const p = bar < 8 ? [3, 7, 11, 13, 15].includes(s) ? 0.8 : 0.05 : 0.55;
        if (R() < p) S.click.push({ t: T(bar, s), vel: 0.25 + R() * 0.5, f: 2500 + R() * 7000 });
      }
    } else if (g === 2 || g === 3) {
      kick(T(bar, 0), 0.95); kick(T(bar, 6), 0.7); kick(T(bar, 10), 0.85);
      if (odd) kick(T(bar, 14), 0.45);
      hitBar(bar, [4, 12], S.snare, 0.9);
      hitBar(bar, [...Array(16).keys()], S.hat, (s) => [0.8, 0.3, 0.55, 0.3][s % 4] * (g === 3 ? 0.9 : 0.8));
      if (!odd) S.ohat.push({ t: T(bar, 14), vel: 0.5 });
      S.bass.push({ t: T(bar, 0), dur: 2.6 * STEP, note: root, vel: 0.95 }, { t: T(bar, 6), dur: 1.6 * STEP, note: root, vel: 0.7 },
        { t: T(bar, 10), dur: 2.6 * STEP, note: root, vel: 0.85 }, { t: T(bar, 14), dur: 1.6 * STEP, note: root + 12, vel: 0.6 });
      for (let s = 1; s < 16; s += 2) if (R() < 0.35) S.click.push({ t: T(bar, s) + STEP * 0.5, vel: 0.2 + R() * 0.35, f: 3000 + R() * 6000 });
      if (g === 2 && bar < 18) S.sorts.push({ t0: T(bar, 8), t1: T(bar, 12), amt: 0.45 + 0.09 * (bar - 12), dir: 'v' });
      if (g === 3 && odd) S.stutters.push({ t: T(bar, 12), len: bar === 27 ? STEP / 2 : STEP, count: bar === 27 ? 8 : 4 });
    } else if (g === 4) {
      hitBar(bar, [0, 4, 8, 12], S.kick, 0.92);
      hitBar(bar, [4, 12], S.snare, 0.8);
      hitBar(bar, [2, 6, 10, 14], S.ohat, 0.42);
      hitBar(bar, [...Array(16).keys()].filter((s) => s % 2 === 1), S.hat, 0.3);
      if (bar < 35) for (const s of [2, 6, 10, 14]) S.bass.push({ t: T(bar, s), dur: 1.5 * STEP, note: root, vel: 0.85 });
      if (bar % 2 === 1 && bar < 35) S.rolls.push({ t: T(bar, 12), dur: BEAT });
    } else if (g === 5) {
      if (bar < 42) S.subs.push({ t: T(bar, 0), note: root, vel: 0.7 }, { t: T(bar, 8), note: root, vel: 0.45 });
      if (bar === 36) S.bass.push({ t: T(bar, 0), dur: 4 * BAR, note: 27, vel: 0.5, soft: true });
    } else if (g === 6) {
      const crush = true;
      kick(T(bar, 0), 1, { crush }); kick(T(bar, 3), 0.7, { crush }); kick(T(bar, 10), 0.9, { crush });
      if (bar % 4 === 3) kick(T(bar, 13), 0.6, { crush });
      hitBar(bar, [4, 12], S.snare, 1, { crush });
      hitBar(bar, [7, 9, 15], S.snare, 0.32, { crush });
      hitBar(bar, [...Array(16).keys()], S.hat, (s) => [0.85, 0.35, 0.6, 0.4][s % 4], { crush });
      S.ohat.push({ t: T(bar, 14), vel: 0.55, crush });
      if (bar < 51) {
        S.bass.push({ t: T(bar, 0), dur: 1.8 * STEP, note: root, vel: 1, drive: 3 }, { t: T(bar, 3), dur: 1.6 * STEP, note: root, vel: 0.8, drive: 3 },
          { t: T(bar, 8), dur: 1 * STEP, note: root + 12, vel: 0.7, drive: 3 }, { t: T(bar, 10), dur: 2.6 * STEP, note: root, vel: 0.95, drive: 3 },
          { t: T(bar, 14), dur: 1.6 * STEP, note: root + 12, vel: 0.75, drive: 3 });
      }
      for (let s = 0; s < 16; s++) if (R() < 0.3) S.click.push({ t: T(bar, s) + (R() < 0.5 ? STEP / 2 : 0), vel: 0.3 + R() * 0.4, f: 2000 + R() * 8000 });
    }
  }
  // stutters of the climax
  S.stutters.push({ t: T(45, 12), len: STEP / 2, count: 8 }, { t: T(47, 8), len: STEP, count: 2 }, { t: T(47, 10), len: STEP / 2, count: 4 },
    { t: T(47, 14), len: STEP / 4, count: 8 }, { t: T(49, 14), len: STEP / 4, count: 8 }, { t: T(50, 12), len: STEP / 2, count: 8 });
  S.stutters.sort((a, b) => a.t - b.t);
  // the long horizontal sort that ends gen 2
  S.sorts.push({ t0: T(18, 0), t1: T(20, 0), amt: 1, dir: 'h' });

  S.crashes = [T(4, 0), T(12, 0), T(16, 0), T(20, 0), T(24, 0), T(28, 0), T(32, 0), T(44, 0), T(48, 0)].map((t) => ({ t, vel: t === T(44, 0) ? 1 : 0.7 }));
  S.impacts = [T(12, 0), T(20, 0), T(28, 0), T(44, 0)];
  S.static = [T(36, 0), T(37, 4)];
  S.tapeStop = [T(35, 8), T(36, 0)];
  S.wobble = [T(32, 0), T(35, 8)];
  S.riser = [T(42, 0), T(44, 0)];
  S.decimate = [T(51, 0), T(52, 0)];
  S.blips = [T(52, 0), T(52, 8), T(53, 0), T(53, 8), T(54, 0)].map((t, i) => ({ t, note: [75, 70, 63, 58, 51][i] }));
  S.eof = [T(59, 12), T(60, 0)];
  S.spectral = SPEC;
  S.marks = { gen: GEN.map((b) => T(b, 0)), dot: T(56, 0), average: T(54, 0) };
  return S;
}

/* ───────── rendering ───────── */
function* renderGen(opts) {
  opts = opts || {};
  const SR = Math.min(48000, opts.sampleRate || 44100);
  const N = Math.round(DURATION * SR);
  const S = buildScore();
  const RND = rng(1990);

  /* building blocks */
  const SIN_N = 4096, SIN = new Float32Array(SIN_N + 1);
  for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((i / SIN_N) * TAU);
  const fsin = (ph) => { ph -= Math.floor(ph); const x = ph * SIN_N, i = x | 0; return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i); };
  let nseed = 0x9E3779B9;
  const noise = () => { nseed ^= nseed << 13; nseed ^= nseed >>> 17; nseed ^= nseed << 5; return (nseed >>> 0) / 2147483648 - 1; };
  const svfCoef = (fc, q, sr) => {
    const g = Math.tan(Math.PI * Math.max(10, Math.min(fc, sr * 0.45)) / sr), k = 1 / q, a1 = 1 / (1 + g * (g + k));
    return [a1, g * a1, g * g * a1, k];
  };
  // state-variable filter; mode 0 low, 1 band, 2 high
  const svf = (fc, q, mode, sr) => {
    let [a1, a2, a3, k] = svfCoef(fc, q, sr || SR);
    let ic1 = 0, ic2 = 0;
    const f = (v0) => {
      const v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      return mode === 0 ? v2 : mode === 1 ? v1 : v0 - k * v1 - v2;
    };
    f.set = (fc2, q2) => { [a1, a2, a3, k] = svfCoef(fc2, q2 || q, sr || SR); };
    return f;
  };
  const panGains = (p) => { const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
  const mk = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
  const fadeEnds = (x, ms) => { const n = Math.min(x.length >> 1, Math.round(ms * SR / 1000)); for (let i = 0; i < n; i++) { const g = i / n; x[i] *= g; x[x.length - 1 - i] *= g; } return x; };
  const crushBuf = (x, bits, hold) => {
    const q = Math.pow(2, bits - 1), y = new Float32Array(x.length); let h = 0;
    for (let i = 0; i < x.length; i++) { if (i % hold === 0) h = Math.round(x[i] * q) / q; y[i] = h; }
    return y;
  };

  /* ═════════ the loop and its copies (at 32 768 Hz) ═════════ */
  const LSR = 32768, LN = 1 << 18, LM = LN - 1;
  const lsin = fsin;
  function renderLoopMaster() {
    const L = new Float32Array(LN), R = new Float32Array(LN);
    const at = (bar, step) => T(bar, step);
    // Rhodes-like FM electric piano: 1:1 body with a decaying index, plus the tine at ×14
    const ep = (t0, dur, m, vel, pan) => {
      const f = mtof(m), n0 = Math.round(t0 * LSR), n = Math.round((dur + 1.8) * LSR);
      const [gl, gr] = panGains(pan);
      const dec = 2.2 - Math.min(1, Math.max(0, (m - 50) / 25)) * 0.9;
      for (let i = 0; i < n; i++) {
        const t = i / LSR;
        let env = Math.exp(-t / dec) * Math.min(1, t / 0.002);
        if (t > dur) env *= Math.exp(-(t - dur) * 9);
        const ph = f * t;
        const I = 1.05 * Math.exp(-t / 0.32) + 0.22, tine = 1.4 * Math.exp(-t / 0.022);
        const y = lsin(ph + (I * lsin(ph) + tine * lsin(ph * 14.02)) / TAU) * env * vel;
        const trem = 0.5 + 0.5 * Math.sin(TAU * 4.2 * (t0 + t));
        L[(n0 + i) & LM] += y * gl * (0.72 + 0.28 * trem);
        R[(n0 + i) & LM] += y * gr * (0.72 + 0.28 * (1 - trem));
      }
    };
    // music box: inharmonic FM (×3.5) with an octave partial
    const box = (t0, dur, m, vel, pan) => {
      const f = mtof(m), n0 = Math.round(t0 * LSR), n = Math.round((dur + 1.2) * LSR);
      const [gl, gr] = panGains(pan);
      for (let i = 0; i < n; i++) {
        const t = i / LSR;
        let env = Math.exp(-t / 0.85) * Math.min(1, t / 0.0012);
        if (t > dur) env *= Math.exp(-(t - dur) * 5);
        const ph = f * t;
        const y = (lsin(ph + 0.8 * Math.exp(-t / 0.12) * lsin(ph * 3.5) / TAU) * 0.72 + 0.28 * lsin(ph * 2) * Math.exp(-t / 0.25)) * env * vel;
        L[(n0 + i) & LM] += y * gl; R[(n0 + i) & LM] += y * gr;
      }
    };
    // pad: three detuned saws (PolyBLEP) through a low-pass
    const pad = (t0, dur, m, vel) => {
      const n0 = Math.round(t0 * LSR), n = Math.round((dur + 1.4) * LSR);
      const det = [-0.07, 0, 0.07], pans = [-0.6, 0, 0.6];
      for (let v = 0; v < 3; v++) {
        const f = mtof(m + det[v]), dt = f / LSR;
        const lp = svf(1500, 0.6, 0, LSR);
        const [gl, gr] = panGains(pans[v]);
        let ph = v * 0.31;
        for (let i = 0; i < n; i++) {
          const t = i / LSR;
          let s = 2 * ph - 1;
          if (ph < dt) { const x = ph / dt; s -= x + x - x * x - 1; } else if (ph > 1 - dt) { const x = (ph - 1) / dt; s -= x * x + x + x + 1; }
          ph += dt; if (ph >= 1) ph -= 1;
          let env = Math.min(1, t / 0.5);
          if (t > dur) env *= Math.exp(-(t - dur) * 3);
          const y = lp(s) * env * vel;
          L[(n0 + i) & LM] += y * gl; R[(n0 + i) & LM] += y * gr;
        }
      }
    };
    for (let b = 0; b < 4; b++) {
      const ch = LOOP.ep[b];
      const hits = [[0, 5.5, 0.9, 4], [6, 5, 0.55, 3], [12, 3.6, 0.7, 4]];
      for (const [s, d, v, count] of hits) ch.slice(4 - count).forEach((m, j) => ep(at(b, s) + j * 0.004, d * STEP, m, v * 0.22, -0.3 + j * 0.2));
      for (const [s, m, d] of LOOP.box[b]) box(at(b, s), d * STEP, m, (s === 8 ? 0.2 : s === 0 ? 0.15 : 0.11), s === 8 ? 0.15 : ((s / 2) % 2 ? 0.45 : -0.2));
      LOOP.pad[b].forEach((m) => pad(at(b, 0), BAR, m, 0.028));
    }
    // a small room of its own, applied circularly (run twice, keep the second pass)
    const rv = makePlate({ predelay: 0.012, bandwidth: 0.7, inDiff1: 0.75, inDiff2: 0.625, decay: 0.62, damping: 0.4, decDiff1: 0.7, decDiff2: 0.5, excursion: 8 }, LSR);
    const blockN = 4096, inp = new Float32Array(blockN), oL = new Float32Array(blockN), oR = new Float32Array(blockN);
    const wL = new Float32Array(LN), wR = new Float32Array(LN);
    for (let pass = 0; pass < 2; pass++) {
      for (let p = 0; p < LN; p += blockN) {
        for (let i = 0; i < blockN; i++) inp[i] = (L[p + i] + R[p + i]) * 0.2;
        oL.fill(0); oR.fill(0);
        rv(inp, oL, oR, blockN);
        if (pass) for (let i = 0; i < blockN; i++) { wL[p + i] = oL[i]; wR[p + i] = oR[i]; }
      }
    }
    for (let i = 0; i < LN; i++) { L[i] = Math.tanh((L[i] + wL[i]) * 1.3) / 1.3; R[i] = Math.tanh((R[i] + wR[i]) * 1.3) / 1.3; }
    return { L, R };
  }

  // helpers for circular processing of a loop copy
  const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
  const matchLevel = (g, target) => { const r = Math.max(rms(g.L), rms(g.R), 1e-9), k = target / r; for (let i = 0; i < LN; i++) { g.L[i] *= k; g.R[i] *= k; } return g; };
  const circular = (x, proc) => { const y = new Float32Array(LN); for (let pass = 0; pass < 2; pass++) for (let i = 0; i < LN; i++) { const v = proc(x[i], i); if (pass) y[i] = v; } return y; };
  const herm = (buf, p) => {
    const i = Math.floor(p), f = p - i;
    const xm = buf[(i - 1) & LM], x0 = buf[i & LM], x1 = buf[(i + 1) & LM], x2 = buf[(i + 2) & LM];
    const c1 = 0.5 * (x1 - xm), c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1);
    return ((c3 * f + c2) * f + c1) * f + x0;
  };
  // spectrum of a whole copy, for circular filtering
  const spectrumOf = (x) => { const re = Float64Array.from(x), im = new Float64Array(LN); fft(re, im, false); return { re, im }; };
  const fromSpectrum = (s) => { const re = s.re.slice(), im = s.im.slice(); fft(re, im, true); return Float32Array.from(re); };

  // 1 · a perceptual codec at a low bit rate: bands quantised coarsely, quiet bins dropped, top cut
  function codec(x, quality, rnd) {
    const Nf = 1024, H = 512, win = new Float64Array(Nf);
    for (let i = 0; i < Nf; i++) win[i] = Math.sin(Math.PI * (i + 0.5) / Nf);
    const out = new Float32Array(LN), re = new Float64Array(Nf), im = new Float64Array(Nf);
    const cutoff = Math.round((quality > 0.6 ? 14500 : quality > 0.3 ? 10500 : 6500) / LSR * Nf);
    const edges = [0, 2, 4, 6, 8, 10, 12, 15, 18, 22, 27, 33, 40, 49, 60, 74, 92, 115, 145, 185, 240, 320, 420, 513];
    for (let f = 0; f < LN / H; f++) {
      const s0 = f * H;
      for (let i = 0; i < Nf; i++) { re[i] = x[(s0 + i) & LM] * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (let b = 0; b + 1 < edges.length; b++) {
        const lo = edges[b], hi = Math.min(edges[b + 1], Nf / 2 + 1);
        let mx = 0;
        for (let k = lo; k < hi; k++) mx = Math.max(mx, Math.hypot(re[k], im[k]));
        const bits = Math.max(1, Math.round((1.5 + quality * 4.5) - b * 0.06 + (rnd() - 0.5)));
        const step = mx / Math.pow(2, bits);
        for (let k = lo; k < hi; k++) {
          const m = Math.hypot(re[k], im[k]);
          let q = step > 0 ? Math.round(m / step) * step : 0;
          if (k >= cutoff) q = 0;
          const g = m > 1e-12 ? q / m : 0;
          re[k] *= g; im[k] *= g;
          if (k > 0 && k < Nf / 2) { re[Nf - k] = re[k]; im[Nf - k] = -im[k]; }
        }
      }
      fft(re, im, true);
      for (let i = 0; i < Nf; i++) out[(s0 + i) & LM] += re[i] * win[i];
    }
    return out;
  }
  // a handful of single-bit errors in the 16-bit samples
  function bitErrors(x, count, rnd) {
    for (let e = 0; e < count; e++) {
      const i = Math.floor(rnd() * LN), b = 7 + Math.floor(rnd() * 5);
      const v = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))) ^ (1 << b);
      x[i] = (v << 16 >> 16) / 32767;
    }
    return x;
  }
  // 2 · pixel sorting, for sound: sort the samples inside some short windows
  function sortGrains(g, frac, rnd) {
    const plan = [];
    for (let i = 0; i < LN;) { const w = 40 + Math.floor(rnd() * 260); plan.push([i, w, rnd() < frac, rnd() < 0.5]); i += w; }
    for (const x of [g.L, g.R]) {
      for (const [i, w, on, up] of plan) {
        if (!on) continue;
        const seg = new Float32Array(w);
        for (let k = 0; k < w; k++) seg[k] = x[(i + k) & LM];
        let e = 0; for (let k = 0; k < w; k++) e += seg[k] * seg[k];
        if (Math.sqrt(e / w) < 0.02) continue;
        seg.sort(); if (up) seg.reverse();
        const xf = Math.min(12, w >> 2);
        for (let k = 0; k < w; k++) {
          const a = k < xf ? k / xf : k > w - 1 - xf ? (w - 1 - k) / xf : 1;
          x[(i + k) & LM] = x[(i + k) & LM] * (1 - a) + seg[k] * a;
        }
      }
    }
    return g;
  }
  // 3 · datamosh, for sound: grains taken from the wrong place ("motion vectors"), some frozen
  function mosh(g, frac, rnd) {
    const G = 2048, n = LN / G, xf = 96;
    const plan = [];
    for (let k = 0; k < n; k++) {
      const r = rnd();
      plan.push(r < frac ? ((Math.floor(rnd() * 3) + 1) * (rnd() < 0.5 ? -1 : 1)) : r < frac * 1.35 ? -1 : 0);
    }
    for (const key of ['L', 'R']) {
      const x = g[key], src = x.slice();
      for (let k = 0; k < n; k++) {
        const v = plan[k];
        if (!v) continue;
        const from = ((k + v) * G) & LM, to = k * G;
        for (let i = -xf; i < G + xf; i++) {
          const a = i < 0 ? (i + xf) / xf : i >= G ? (G + xf - i) / xf : 1;
          const w = 0.5 - 0.5 * Math.cos(Math.PI * a);
          x[(to + i) & LM] = x[(to + i) & LM] * (1 - w) + src[(from + i) & LM] * w;
        }
      }
    }
    return g;
  }
  // 4 · tape: wow and flutter, saturation, a head bump, lost top, hiss and a dropout
  function tape(g, amt, rnd) {
    const p1 = rnd() * TAU, p2 = rnd() * TAU, drop = Math.floor(rnd() * LN), dropLen = Math.round((0.05 + rnd() * 0.08) * LSR);
    const out = {};
    for (const key of ['L', 'R']) {
      const x = g[key];
      const y = new Float32Array(LN);
      for (let i = 0; i < LN; i++) {
        const t = i / LSR;
        const d = 40 + amt * (16 * Math.sin(TAU * 0.5 * t + p1) + 3.2 * Math.sin(TAU * 6.8 * t + p2));
        y[i] = herm(x, i - d);
      }
      const lp1 = svf(9000 - amt * 1500, 0.6, 0, LSR), bump = svf(95, 1.2, 1, LSR), hp = svf(6000, 0.7, 2, LSR);
      const z = circular(y, (v) => lp1(v) + bump(v) * 0.25);
      for (let i = 0; i < LN; i++) {
        let v = Math.tanh(z[i] * (1.2 + amt * 0.6)) / (1.2 + amt * 0.6) * 1.08;
        v += hp(noise()) * 0.006 * amt;
        const dd = (i - drop) & LM;
        if (dd < dropLen) v *= 1 - 0.65 * Math.sin(Math.PI * dd / dropLen);
        z[i] = v;
      }
      out[key] = z;
    }
    return out;
  }
  // 5 · radio: a narrow band, slow fading, crackle
  function radio(g, amt, rnd) {
    const out = {};
    const ph = rnd() * TAU;
    for (const key of ['L', 'R']) {
      const s = spectrumOf(g[key]);
      for (let k = 0; k <= LN / 2; k++) {
        const f = k * LSR / LN;
        const hp = Math.pow(f / 280, 4) / (1 + Math.pow(f / 280, 4)), lp = 1 / (1 + Math.pow(f / (3300 - amt * 400), 6));
        const w = hp * lp;
        s.re[k] *= w; s.im[k] *= w;
        if (k > 0 && k < LN / 2) { s.re[LN - k] = s.re[k]; s.im[LN - k] = -s.im[k]; }
      }
      const y = fromSpectrum(s);
      for (let i = 0; i < LN; i++) {
        const t = i / LSR;
        const fade = 0.78 + 0.22 * Math.sin(TAU * 0.25 * t + ph) * Math.sin(TAU * 0.09 * t + ph * 2);
        let v = Math.tanh(y[i] * 2) / 2 * fade;
        if (rnd() < 0.0004 * amt) v += (rnd() - 0.5) * 0.3;
        y[i] = v + noise() * 0.004 * amt;
      }
      out[key] = y;
    }
    return out;
  }
  // 6 · bit-crusher: fewer bits, fewer samples, then the codec again at its worst
  function crush(g, bits, hold, rnd) {
    const q = Math.pow(2, bits - 1), out = {};
    for (const key of ['L', 'R']) {
      const x = g[key], y = new Float32Array(LN);
      let h = 0;
      for (let i = 0; i < LN; i++) { if (i % hold === 0) h = Math.round(x[i] * q * 1.4) / q; y[i] = h; }
      out[key] = codec(y, 0.15, rnd);
    }
    return out;
  }
  // 7 · the room: its impulse response, tuned to the loop's key; each copy is the last one played into it
  // Each mode is a decaying cosine, so at its own frequency it adds in phase with the direct
  // sound: every resonance lifts by the same 1 + P, and repeated copies converge on all of
  // them together (E♭, G, B♭, D, F in several octaves) instead of on the loudest one.
  function roomResponse() {
    const ir = new Float64Array(LN), R2 = rng(1969), P = 2;
    ir[0] = 1;
    const modes = [[155.56, 1.4], [196.0, 1.1], [233.08, 1.3], [293.66, 1.0], [311.13, 1.2], [392.0, 0.9],
      [466.16, 1.0], [587.33, 0.8], [698.46, 0.75], [932.33, 0.6], [1174.66, 0.5], [1396.9, 0.45]];
    for (const [f, t60] of modes) {
      const k = 6.9 / t60, A = 2 * P * k / LSR;
      for (let i = 0; i < 4 * LSR; i++) { const t = i / LSR; ir[i] += A * Math.exp(-k * t) * Math.cos(TAU * f * t); }
    }
    for (let i = 1; i < 0.5 * LSR; i++) ir[i] += (R2() * 2 - 1) * 0.004 * Math.exp(-i / (0.09 * LSR));
    const im = new Float64Array(LN); fft(ir, im, false);
    return { re: ir, im };
  }
  function room(g, H, times) {
    const out = {};
    for (const key of ['L', 'R']) {
      const s = spectrumOf(g[key]);
      for (let k = 0; k < LN; k++) {
        let r = s.re[k], i = s.im[k];
        for (let n = 0; n < times; n++) { const nr = r * H.re[k] - i * H.im[k]; i = r * H.im[k] + i * H.re[k]; r = nr; }
        s.re[k] = r; s.im[k] = i;
      }
      out[key] = fromSpectrum(s);
    }
    return out;
  }

  const master = renderLoopMaster();
  if (opts.debug) opts.debug.gens = null;
  yield 0.06;
  const LEVEL = 0.16;
  matchLevel(master, LEVEL);
  const gens = [master];
  {
    const R3 = rng(2026);
    const H = roomResponse();
    let g = master;
    for (let r = 1; r < REPS; r++) {
      const kind = COPY[r];
      let n;
      if (kind === 'codec') n = { L: bitErrors(codec(g.L, 0.8, R3), 6, R3), R: bitErrors(codec(g.R, 0.8, R3), 6, R3) };
      else if (kind === 'sort') n = sortGrains({ L: g.L.slice(), R: g.R.slice() }, r === 2 ? 0.05 : 0.1, R3);
      else if (kind === 'mosh') n = mosh({ L: g.L.slice(), R: g.R.slice() }, r === 4 ? 0.12 : 0.22, R3);
      else if (kind === 'tape') n = tape(g, r === 6 ? 0.8 : 1.2, R3);
      else if (kind === 'radio') n = radio(g, r === 8 ? 0.7 : 1, R3);
      else if (kind === 'crush') n = r === 10 ? crush(g, 7, 2, R3) : crush(g, 5, 4, R3);
      else n = room(r === 12 ? gens[11] : gens[11], H, r === 12 ? 4 : 16);
      matchLevel(n, kind === 'room' ? LEVEL * 0.9 : LEVEL);
      gens.push(n);
      if (kind !== 'room') g = n;
      if (opts.debug) (opts.debug.gens = opts.debug.gens || [master]).push(n);
      yield 0.06 + 0.12 * r / REPS;
    }
  }

  /* ═════════ one-shot samples ═════════ */
  function makeKick() {
    const x = mk(0.5); let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR, f = 45 + 105 * Math.exp(-t / 0.042) + 60 * Math.exp(-t / 0.005);
      ph += f / SR;
      const env = Math.exp(-t / 0.3) * Math.min(1, t / 0.0015);
      x[i] = Math.tanh((Math.sin(TAU * ph) * env + noise() * Math.exp(-t / 0.0012) * 0.35) * 1.5) / Math.tanh(1.5);
    }
    return fadeEnds(x, 2);
  }
  function makeSnare() {
    const x = mk(0.32), bp = svf(2200, 0.5, 1), hp = svf(900, 0.7, 2); let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR; ph += (175 + 40 * Math.exp(-t / 0.02)) / SR;
      const body = Math.sin(TAU * ph) * Math.exp(-t / 0.075) * 0.7;
      const n = hp(bp(noise()) * 1.6 + noise() * 0.25) * Math.exp(-t / 0.13) * 0.9;
      x[i] = Math.tanh((body + n) * 1.4) * Math.min(1, t / 0.0008);
    }
    return fadeEnds(x, 3);
  }
  function makeRim() {
    const x = mk(0.08), bp = svf(1750, 6, 1);
    for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (bp(i < 3 ? 1 : noise() * 0.2) * 2.5) * Math.exp(-t / 0.012); }
    return fadeEnds(x, 2);
  }
  function makeHat(open) {
    const x = mk(open ? 0.35 : 0.07), hp = svf(7200, 0.8, 2), bp = svf(10500, 1.5, 1);
    const fr = [3240, 4510, 5980, 7250, 8830]; const ph = fr.map(() => 0);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR; let m = 0;
      for (let k = 0; k < fr.length; k++) { ph[k] += fr[k] / SR; m += ph[k] % 1 < 0.5 ? 1 : -1; }
      x[i] = (hp(noise() * 0.8 + m * 0.08) + bp(noise()) * 0.3) * Math.exp(-t / (open ? 0.13 : 0.022));
    }
    return fadeEnds(x, 2);
  }
  function makeClick(f) {
    const x = mk(0.012), bp = svf(f, 9, 1);
    for (let i = 0; i < x.length; i++) x[i] = bp(i === 0 ? 1 : 0) * 3;
    return fadeEnds(x, 1);
  }
  function makeCrash() {
    const x = mk(2.2), hp = svf(2800, 0.7, 2), hp2 = svf(6000, 0.8, 2);
    for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (hp(noise()) * 0.7 + hp2(noise()) * 0.4) * Math.exp(-t / 0.7) * Math.min(1, t / 0.002); }
    return fadeEnds(x, 10);
  }
  function makeImpact() {
    const x = mk(1.6), lp = svf(400, 0.7, 0); let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR; ph += (32 + 40 * Math.exp(-t / 0.08)) / SR;
      x[i] = Math.tanh(Math.sin(TAU * ph) * Math.exp(-t / 0.55) * 1.4 + lp(noise()) * Math.exp(-t / 0.2) * 0.8);
    }
    return fadeEnds(x, 6);
  }
  const SMP = { kick: makeKick(), snare: makeSnare(), rim: makeRim(), hat: makeHat(false), ohat: makeHat(true), crash: makeCrash(), impact: makeImpact() };
  SMP.kickC = crushBuf(SMP.kick, 8, 3); SMP.snareC = crushBuf(SMP.snare, 6, 3); SMP.hatC = crushBuf(SMP.hat, 5, 2); SMP.ohatC = crushBuf(SMP.ohat, 5, 2);
  const clickBank = [2400, 3100, 3900, 4700, 5600, 6600, 7800, 9100].map(makeClick);
  yield 0.22;

  /* ═════════ voices ═════════ */
  const voices = [];
  const add = (v) => { voices.push(v); return v; };
  // a mono sample at time t
  const sample = (t, buf, o) => {
    const start = Math.round(t * SR);
    const [gl, gr] = panGains(o.pan || 0);
    return add({
      start, end: start + buf.length, stem: ST[o.stem], gain: o.gain, rev: o.rev || 0, dly: o.dly || 0, bus: !!o.bus,
      process(sL, sR, off, n, from) { for (let k = 0; k < n; k++) { const v = buf[from + k - start]; sL[off + k] = v * gl; sR[off + k] = v * gr; } },
    });
  };
  const stereo = (t, L, R, o) => {
    const start = Math.round(t * SR);
    return add({
      start, end: start + L.length, stem: ST[o.stem], gain: o.gain, rev: o.rev || 0, dly: o.dly || 0, bus: !!o.bus,
      process(sL, sR, off, n, from) { for (let k = 0; k < n; k++) { const j = from + k - start; sL[off + k] = L[j]; sR[off + k] = R[j]; } },
    });
  };
  // a generator voice: fn(i, t, O) writes left and right into O for its own sample i
  const O = new Float64Array(2);
  const gen = (t0, t1, o, fn) => {
    const start = Math.round(t0 * SR), end = Math.round(t1 * SR);
    return add({
      start, end, stem: ST[o.stem], gain: o.gain, rev: o.rev || 0, dly: o.dly || 0, bus: !!o.bus,
      process(sL, sR, off, n, from) { for (let k = 0; k < n; k++) { const i = from + k - start; fn(i, i / SR, O); sL[off + k] = O[0]; sR[off + k] = O[1]; } },
    });
  };

  /* the loop: copy r plays from bar 4 + 4r, cross-faded at its seams */
  const LOOP_GAIN = [0.95, 0.95, 0.8, 0.8, 0.78, 0.78, 0.8, 0.8, 0.78, 0.72, 0.62, 0.62, 1.1, 1.0];
  for (let r = 0; r < REPS; r++) {
    const t0 = T(4 + 4 * r, 0), xf = 0.03;
    const g = gens[r], L = g.L, R = g.R, gain = LOOP_GAIN[r];
    const ratio = LSR / SR;
    const endT = r === REPS - 1 ? PIECE : t0 + 8;
    add({
      start: Math.round((t0 - (r ? xf : 0)) * SR), end: Math.round((endT + xf) * SR), stem: ST.loop, gain, rev: r >= 12 ? 0.3 : 0.06, dly: 0, bus: true,
      process(sL, sR, off, n, from) {
        for (let k = 0; k < n; k++) {
          const t = (from + k) / SR, p = (t - t0) * LSR;
          let a = 1;
          if (r && t < t0 + xf) a = Math.sin(Math.PI / 2 * Math.max(0, (t - (t0 - xf)) / (2 * xf)));
          else if (!r) a = Math.min(1, (t - t0) / 0.005);
          if (t > endT - xf) a *= Math.cos(Math.PI / 2 * Math.min(1, (t - (endT - xf)) / (2 * xf)));
          sL[off + k] = herm(L, p) * a; sR[off + k] = herm(R, p) * a;
        }
      },
    });
    void ratio;
  }
  // the original, once more, under the last copy (the Pale Blue Dot)
  {
    const t0 = T(56, 0), g = gens[0];
    gen(t0, PIECE, { stem: 'loop', gain: 0.75, rev: 0.2 }, (i, t, O) => {
      const p = t * LSR, a = Math.min(1, t / 3);
      O[0] = herm(g.L, p) * a; O[1] = herm(g.R, p) * a;
    });
  }
  // a pad that rises while the picture downloads
  {
    const t0 = T(3, 0), t1 = T(4, 0) + 0.8;
    const notes = [51, 55, 58, 62, 65].map(mtof);
    const lps = notes.map(() => svf(500, 0.7, 0));
    const ph = notes.map((_, j) => j * 0.17);
    gen(t0, t1, { stem: 'loop', gain: 0.1, rev: 0.4 }, (i, t, O) => {
      const e = Math.min(1, t / 1.9) * (t > 2 ? Math.exp(-(t - 2) * 6) : 1);
      let l = 0, r = 0;
      for (let j = 0; j < notes.length; j++) {
        ph[j] += notes[j] * (1 + 0.003 * Math.sin(t * 3 + j)) / SR; ph[j] -= Math.floor(ph[j]);
        lps[j].set(400 + 2400 * Math.min(1, t / 2), 0.7);
        const v = lps[j](2 * ph[j] - 1);
        if (j & 1) l += v; else r += v;
      }
      O[0] = l * e; O[1] = r * e;
    });
  }

  /* drums */
  const drum = (list, key, o) => list.forEach((e) => sample(e.t, SMP[e.crush ? key + 'C' : key], Object.assign({ gain: e.vel * o.gain }, o, { gain: e.vel * o.gain })));
  drum(S.kick, 'kick', { stem: 'kick', gain: 0.95 });
  drum(S.snare, 'snare', { stem: 'snare', gain: 0.78, rev: 0.18 });
  drum(S.rim, 'rim', { stem: 'snare', gain: 0.35, rev: 0.25, pan: 0.2 });
  S.hat.forEach((e, i) => sample(e.t, e.crush ? SMP.hatC : SMP.hat, { stem: 'hat', gain: e.vel * 0.4, pan: (i % 2 ? 0.3 : -0.1) }));
  S.ohat.forEach((e) => sample(e.t, e.crush ? SMP.ohatC : SMP.ohat, { stem: 'hat', gain: e.vel * 0.38, pan: 0.25, rev: 0.1 }));
  S.click.forEach((e, i) => sample(e.t, clickBank[Math.floor((e.f - 2000) / 1000) & 7], { stem: 'click', gain: e.vel * 0.9, pan: ((i * 37) % 13) / 6.5 - 1 }));
  S.crashes.forEach((e) => sample(e.t, SMP.crash, { stem: 'crash', gain: e.vel * 0.2, pan: 0.15, rev: 0.2 }));
  S.impacts.forEach((t) => sample(t, SMP.impact, { stem: 'crash', gain: 0.55, rev: 0.25 }));

  /* bass: a sine with a little second harmonic; the climax drives it */
  for (const b of S.bass) {
    const f = mtof(b.note), drive = b.drive || 1.2, lp = svf(b.soft ? 160 : 900, 0.7, 0);
    let ph = 0;
    gen(b.t, b.t + b.dur + 0.08, { stem: 'bass', gain: b.vel * (b.soft ? 0.5 : 0.42), bus: false }, (i, t, O) => {
      ph += f / SR;
      let e = Math.min(1, t / 0.004) * (0.75 + 0.25 * Math.exp(-t / 0.12));
      if (t > b.dur) e *= Math.max(0, 1 - (t - b.dur) / 0.08);
      if (b.soft) e *= Math.min(1, t / 1.5);
      const s = Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * 2 * ph);
      const v = lp(Math.tanh(s * drive) / Math.tanh(drive)) * e;
      O[0] = v; O[1] = v;
    });
  }
  // sub thumps of the breakdown
  for (const s of S.subs) {
    const f = mtof(s.note + 12); let ph = 0;
    gen(s.t, s.t + 0.9, { stem: 'bass', gain: s.vel * 0.5 }, (i, t, O) => { ph += (f * (1 + 0.5 * Math.exp(-t / 0.03))) / SR; const v = Math.sin(TAU * ph) * Math.exp(-t / 0.3) * Math.min(1, t / 0.003); O[0] = v; O[1] = v; });
  }

  /* gen 0: line-up tone, the dial, the handshake, the download */
  {
    const [a, b] = S.tone;
    gen(a, b, { stem: 'tone', gain: 0.075 }, (i, t, O) => { const e = Math.min(1, t / 0.25, (b - a - t) / 0.004); const v = Math.sin(TAU * 1000 * t) * e; O[0] = v; O[1] = v; });
    const rows = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] };
    for (const d of S.dial) {
      const [f1, f2] = rows[d.d];
      gen(d.t, d.t + 0.07, { stem: 'modem', gain: 0.14 }, (i, t, O) => { const e = Math.min(1, t / 0.003, (0.07 - t) / 0.003); const v = (Math.sin(TAU * f1 * t) + Math.sin(TAU * f2 * t)) * e; O[0] = v; O[1] = v; });
    }
    {
      const [a2, b2] = S.answer;
      gen(a2, b2, { stem: 'modem', gain: 0.12 }, (i, t, O) => {
        const e = Math.min(1, t / 0.005, (b2 - a2 - t) / 0.005) * (0.8 + 0.2 * Math.sin(TAU * 15 * t));
        const v = Math.sin(TAU * 2100 * t + (t > (b2 - a2) / 2 ? Math.PI : 0)) * e; O[0] = v; O[1] = v;
      });
    }
    {
      const [a3, b3] = S.fsk, R4 = rng(34), bp = svf(1500, 0.5, 1);
      let ph = 0, bitv = -1, chan = 0, bitOn = 0;
      gen(a3, b3, { stem: 'modem', gain: 0.2 }, (i, t, O) => {
        const baud = Math.floor(t * 300);
        if (baud !== bitv) { bitv = baud; chan = Math.floor(t * 8) % 2; bitOn = R4() < 0.5 ? 1 : 0; }
        const f = chan ? (bitOn ? 1650 : 1850) : (bitOn ? 980 : 1180);
        ph += f / SR;
        const e = Math.min(1, t / 0.004, (b3 - a3 - t) / 0.004);
        const v = bp(Math.sin(TAU * ph)) * 1.6 * e; O[0] = v; O[1] = v;
      });
    }
    {
      const probe = []; for (let f = 150; f <= 3750; f += 150) if (![900, 1200, 1800, 2400].includes(f)) probe.push(f);
      S.bongs.forEach((t0, j) => gen(t0, t0 + 0.24, { stem: 'modem', gain: 0.035 }, (i, t, O) => {
        const e = Math.exp(-t / 0.09) * Math.min(1, t / 0.003) * Math.min(1, (0.24 - t) / 0.01);
        let v = 0; for (let k = 0; k < probe.length; k++) v += Math.sin(TAU * probe[k] * t + k * 1.7 + j * Math.PI * (k & 1));
        O[0] = v * e; O[1] = v * e;
      }));
    }
    {
      // the data: scrambled noise in the telephone band, arriving in packets
      const [a4, b4] = S.data, bp = svf(1800, 0.55, 1), hp = svf(320, 0.7, 2);
      const edges = [a4].concat(S.packets.map((p) => p.t));
      gen(a4, b4 + 0.02, { stem: 'modem', gain: 0.24 }, (i, t, O) => {
        const at = a4 + t;
        let k = 1; while (k < edges.length && edges[k] < at) k++;
        const p0 = edges[k - 1], p1 = edges[Math.min(k, edges.length - 1)];
        const u = (at - p0) / Math.max(1e-3, p1 - p0);
        const e = u < 0.08 ? u / 0.08 : u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1;
        const v = hp(bp(noise())) * (0.85 + 0.15 * Math.sin(TAU * 1800 * at)) * e * Math.min(1, t / 0.01);
        O[0] = v; O[1] = v;
      });
    }
  }

  /* gen 1: every flipped bit makes a sound */
  for (const f of S.flips) {
    if (f.kind === 'scan') {
      const fr = mtof(84 + f.bit * 2 + (f.i % 3) * 7), dur = 0.045;
      gen(f.t, f.t + dur, { stem: 'flip', gain: 0.1, pan: (f.bit - 3.5) / 5, dly: 0.2 }, (i, t, O) => {
        const q = Math.round(Math.sin(TAU * fr * t) * 3) / 3;
        const v = q * Math.exp(-t / 0.012) * Math.min(1, t / 0.0005); O[0] = v * (0.5 - f.bit / 16 + 0.5); O[1] = v * (0.5 + f.bit / 16);
      });
    } else {
      sample(f.t, SMP.impact, { stem: 'flip', gain: f.kind === 'dqt' ? 0.5 : 0.35, rev: 0.2 });
      const hp = svf(1200, 0.7, 2);
      gen(f.t, f.t + 0.5, { stem: 'flip', gain: 0.18, rev: 0.15 }, (i, t, O) => {
        const hold = 1 + Math.floor(t * 60);
        const v = (i % hold === 0 ? hp(noise()) : 0) * Math.exp(-t / 0.12) * 2; O[0] = v; O[1] = -v;
      });
    }
  }

  /* gen 2: sorting noise into tones */
  for (const s of S.sorts) {
    const d = s.t1 - s.t0, n = Math.round(d * SR);
    const L = new Float32Array(n), Rr = new Float32Array(n);
    for (const [buf, sd] of [[L, 3], [Rr, 7]]) {
      const R5 = rng(sd + Math.round(s.t0 * 10));
      let i = 0;
      while (i < n) {
        const u = i / n;
        const w = Math.max(8, Math.round((s.dir === 'h' ? 420 : 300) * Math.pow(s.dir === 'h' ? 0.04 : 0.12, u)));
        const seg = []; for (let k = 0; k < w && i + k < n; k++) seg.push(R5() * 2 - 1);
        seg.sort((a, b) => a - b);
        for (let k = 0; k < seg.length; k++) buf[i + k] = seg[k];
        i += w;
      }
      const lp = svf(5000, 0.7, 0);
      for (let k = 0; k < n; k++) { const u = k / n; buf[k] = lp(buf[k]) * Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.1) * (0.6 + 0.4 * u); }
    }
    stereo(s.t0, L, Rr, { stem: 'sort', gain: 0.1 * (0.6 + 0.4 * s.amt), rev: 0.15, dly: 0.12 });
  }

  /* gen 4: the television — mains hum, the line whistle, a hiss */
  {
    const a = T(28, 0), b = T(36, 0);
    const hp = svf(5000, 0.7, 2);
    gen(a, b, { stem: 'noise', gain: 0.05 }, (i, t, O) => {
      const e = Math.min(1, t / 0.5, (b - a - t) / 0.2);
      const hum = Math.sin(TAU * 60 * t) + 0.5 * Math.sin(TAU * 120 * t) + 0.3 * Math.sin(TAU * 180 * t);
      const v = (hum * 0.5 + Math.sin(TAU * 15734.26 * t) * 0.18 + hp(noise()) * 0.25) * e;
      O[0] = v; O[1] = v;
    });
  }
  /* gen 5: the snow of a lost channel, then the Earth as sound */
  {
    const [a, b] = S.static, hp = svf(400, 0.6, 2);
    gen(a, b, { stem: 'noise', gain: 0.22 }, (i, t, O) => { const e = Math.min(1, t / 0.01) * Math.pow(Math.max(0, 1 - t / (b - a)), 1.5); const v = hp(noise()) * e; O[0] = v; O[1] = hp(noise()) * e; });
  }
  {
    // the picture: 171 harmonics of E♭1, one per column; the rows play from the bottom up
    const img = typeof SPECTRAL !== 'undefined' ? SPECTRAL : (typeof require === 'function' ? require('./spectral.js') : null);
    const SPw = img ? img.w : 171, SPh = img ? img.h : 171;
    const grey = new Uint8Array(SPw * SPh);
    if (img) {
      const bin = typeof atob === 'function' ? atob(img.grey) : Buffer.from(img.grey, 'base64').toString('binary');
      for (let i = 0; i < grey.length; i++) grey[i] = bin.charCodeAt(i);
    }
    const amp = new Float32Array(SPw * SPh);
    for (let i = 0; i < amp.length; i++) amp[i] = Math.pow(grey[i] / 255, 1.7);
    const f0 = mtof(SPEC.note), K = SPw, dur = SPEC.t1 - SPEC.t0, n = Math.round(dur * SR), BL = 32;
    const L = new Float32Array(n), Rr = new Float32Array(n);
    const cs = new Float64Array(K), sn = new Float64Array(K), cw = new Float64Array(K), sw = new Float64Array(K);
    const R6 = rng(1999);
    for (let c = 0; c < K; c++) { const ph = R6() * TAU; cs[c] = Math.cos(ph); sn[c] = Math.sin(ph); const w = TAU * f0 * (SPEC.k0 + c) / SR; cw[c] = Math.cos(w); sw[c] = Math.sin(w); }
    const a0 = new Float32Array(K), a1 = new Float32Array(K);
    const ampAt = (u, out) => {
      const rp = Math.max(0, Math.min(SPh - 1.0001, u * (SPh - 1)));
      const r = Math.floor(rp), fr = rp - r, rowA = SPh - 1 - r, rowB = Math.max(0, rowA - 1);
      for (let c = 0; c < K; c++) out[c] = amp[rowA * SPw + c] * (1 - fr) + amp[rowB * SPw + c] * fr;
    };
    for (let p = 0; p < n; p += BL) {
      ampAt(p / n, a0); ampAt(Math.min(1, (p + BL) / n), a1);
      const m = Math.min(BL, n - p);
      for (let c = 0; c < K; c++) {
        let x = cs[c], y = sn[c];
        const c1 = cw[c], s1 = sw[c], da = (a1[c] - a0[c]) / BL;
        let a = a0[c];
        const toL = (c & 1) ? 0.62 : 0.38;
        for (let k = 0; k < m; k++) {
          const v = y * a;
          L[p + k] += v * toL; Rr[p + k] += v * (1 - toL);
          const nx = x * c1 - y * s1; y = x * s1 + y * c1; x = nx; a += da;
        }
        const mag = 1 / Math.hypot(x, y); cs[c] = x * mag; sn[c] = y * mag;
      }
    }
    const fe = Math.round(0.08 * SR);
    for (let i = 0; i < n; i++) { const e = Math.min(1, i / fe, (n - 1 - i) / fe) / Math.sqrt(K / 2); L[i] *= e; Rr[i] *= e; }
    stereo(SPEC.t0, L, Rr, { stem: 'spectral', gain: 0.55, rev: 0.12 });
  }
  /* the riser into the climax */
  {
    const [a, b] = S.riser, bp = svf(400, 1.2, 1);
    let ph = 0;
    gen(a, b, { stem: 'riser', gain: 0.16, rev: 0.2 }, (i, t, O) => {
      const u = t / (b - a);
      bp.set(300 + 6000 * u * u, 1.2);
      ph += (mtof(51) * Math.pow(2, 2 * u)) / SR;
      const v = bp(noise()) * u * 1.4 + Math.sin(TAU * ph) * u * u * 0.35;
      O[0] = v; O[1] = v;
    });
  }
  /* gen 7: the averaging blips */
  for (const bl of S.blips) {
    const f = mtof(bl.note);
    gen(bl.t, bl.t + 0.6, { stem: 'blip', gain: 0.2, rev: 0.35, dly: 0.25 }, (i, t, O) => {
      const v = (Math.sin(TAU * f * t) * 0.8 + (i < 2 ? 0.8 : 0)) * Math.exp(-t / 0.16) * Math.min(1, t / 0.001); O[0] = v; O[1] = v;
    });
  }

  voices.sort((a, b) => a.start - b.start);
  yield 0.3;

  /* ═════════ mix ═════════ */
  const plate = makePlate({ predelay: 0.02, bandwidth: 0.6, inDiff1: 0.75, inDiff2: 0.625, decay: 0.72, damping: 0.45, decDiff1: 0.7, decDiff2: 0.5, excursion: 12 }, SR);
  const delay = makeDelay(3 * STEP, 0.35, SR);
  const duckTimes = S.kick.filter((k) => k.vel > 0.55).map((k) => k.t).sort((a, b) => a - b);
  const BLOCK = 1024;
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const dL = new Float32Array(BLOCK), dR = new Float32Array(BLOCK), uL = new Float32Array(BLOCK), uR = new Float32Array(BLOCK);
  const rv = new Float32Array(BLOCK), dy = new Float32Array(BLOCK), wL = new Float32Array(BLOCK), wR = new Float32Array(BLOCK);
  const sL = new Float32Array(BLOCK), sR = new Float32Array(BLOCK);
  const ENV_RATE = 100, frames = Math.ceil(DURATION * ENV_RATE), frameLen = SR / ENV_RATE, invFrame = 1 / frameLen;
  const energy = new Float32Array(STEMS.length * frames);
  let active = [], vi = 0, di = 0;
  for (let pos = 0; pos < N; pos += BLOCK) {
    const len = Math.min(BLOCK, N - pos);
    dL.fill(0); dR.fill(0); uL.fill(0); uR.fill(0); rv.fill(0); dy.fill(0); wL.fill(0); wR.fill(0);
    while (vi < voices.length && voices[vi].start < pos + len) active.push(voices[vi++]);
    const still = [];
    for (const v of active) {
      const from = Math.max(pos, v.start), to = Math.min(pos + len, v.end);
      if (to > from) {
        const off = from - pos, n = to - from, end = off + n;
        v.process(sL, sR, off, n, from);
        const g = v.gain, oL = v.bus ? uL : dL, oR = v.bus ? uR : dR, eb = v.stem * frames;
        for (let k = off; k < end; k++) { oL[k] += sL[k] * g; oR[k] += sR[k] * g; }
        if (v.rev) { const q = v.rev * g * 0.5; for (let k = off; k < end; k++) rv[k] += (sL[k] + sR[k]) * q; }
        if (v.dly) { const q = v.dly * g * 0.5; for (let k = off; k < end; k++) dy[k] += (sL[k] + sR[k]) * q; }
        const g2 = g * g * 4;
        for (let k = off + ((4 - ((pos + off) & 3)) & 3); k < end; k += 4) energy[eb + (((pos + k) * invFrame) | 0)] += (sL[k] * sL[k] + sR[k] * sR[k]) * g2;
      }
      if (v.end > pos + len) still.push(v);
    }
    active = still;
    for (let k = 0; k < len; k++) {
      const t = (pos + k) / SR;
      while (di + 1 < duckTimes.length && duckTimes[di + 1] <= t) di++;
      let g = 1;
      if (duckTimes.length && duckTimes[di] <= t) { const dt = t - duckTimes[di]; g = 1 - 0.45 * (dt < 0.005 ? dt / 0.005 : Math.exp(-(dt - 0.005) / 0.11)); }
      dL[k] += uL[k] * g; dR[k] += uR[k] * g;
    }
    plate(rv, wL, wR, len);
    delay(dy, wL, wR, len);
    for (let k = 0; k < len; k++) { outL[pos + k] = dL[k] + wL[k] * 0.8; outR[pos + k] = dR[k] + wR[k] * 0.8; }
    if (((pos / BLOCK) & 63) === 0) yield 0.3 + 0.55 * pos / N;
  }

  /* ═════════ edits on the mix: stutters, the magnet, the tape stop, decimation, the end of the file ═════════ */
  const at = (t) => Math.round(t * SR);
  function repeatSeg(t, segLen, count) {
    const a = at(t), n = at(t + segLen) - a, fx = Math.min(64, n >> 3);
    const cl = outL.slice(a, a + n), cr = outR.slice(a, a + n);
    for (let c = 1; c < count; c++) {
      const b = a + c * n;
      for (let i = 0; i < n && b + i < N; i++) {
        const e = Math.min(1, i / fx, (n - 1 - i) / fx);
        outL[b + i] = cl[i] * e; outR[b + i] = cr[i] * e;
      }
    }
    for (let i = 0; i < fx; i++) { const e = i / fx; outL[a + n - 1 - i] *= e; outR[a + n - 1 - i] *= e; }
  }
  for (const s of S.stutters) repeatSeg(s.t, s.len, s.count);
  {
    // the magnet bends the pitch as it passes
    const [a, b] = S.wobble, A = at(a), B = at(b);
    const cl = outL.slice(A - SR, B + SR), cr = outR.slice(A - SR, B + SR);
    for (let i = A; i < B; i++) {
      const t = (i - A) / SR, u = t / (b - a);
      const d = SR * (0.004 + 0.0035 * u * Math.sin(TAU * (0.7 + 0.6 * u) * t) * Math.sin(TAU * 0.13 * t + 1));
      const p = i - d - (A - SR), j = Math.floor(p), f = p - j;
      outL[i] = cl[j] * (1 - f) + cl[j + 1] * f; outR[i] = cr[j] * (1 - f) + cr[j + 1] * f;
    }
  }
  {
    const [a, b] = S.tapeStop, A = at(a), B = at(b);
    const cl = outL.slice(A, B), cr = outR.slice(A, B);
    let p = 0;
    for (let i = A; i < B; i++) {
      const u = (i - A) / (B - A), sp = Math.pow(1 - u, 1.6);
      const j = Math.floor(p), f = p - j;
      const e = Math.min(1, (B - i) / (0.01 * SR));
      outL[i] = (cl[j] * (1 - f) + cl[j + 1] * f) * e; outR[i] = (cr[j] * (1 - f) + cr[j + 1] * f) * e;
      p += sp;
    }
  }
  {
    const [a, b] = S.decimate, A = at(a), B = at(b);
    let hl = 0, hr = 0;
    for (let i = A; i < B; i++) {
      const u = (i - A) / (B - A), hold = 1 + Math.floor(Math.pow(u, 2) * 80), bits = 12 - Math.floor(u * 10), q = Math.pow(2, bits - 1);
      if ((i - A) % hold === 0) { hl = Math.round(outL[i] * q) / q; hr = Math.round(outR[i] * q) / q; }
      const e = Math.min(1, (B - i) / (0.004 * SR));
      outL[i] = hl * e; outR[i] = hr * e;
    }
  }
  {
    // the end of the file: the last eighth skips, faster and faster, and stops
    const [a, b] = S.eof;
    let t = a, len = STEP, seg = 0;
    const src = [outL.slice(at(a), at(a + STEP)), outR.slice(at(a), at(a + STEP))];
    while (t < b - 1e-4) {
      const A = at(t), n = Math.min(at(t + len) - A, at(b) - A), fx = Math.min(32, n >> 2);
      for (let i = 0; i < n; i++) { const e = Math.min(1, i / fx, (n - 1 - i) / fx); outL[A + i] = src[0][i] * e; outR[A + i] = src[1][i] * e; }
      t += len;
      if (++seg % 2 === 0) len = Math.max(0.003, len / 2);
    }
    for (let i = at(b); i < N; i++) { outL[i] = 0; outR[i] = 0; }
  }
  yield 0.88;

  if (opts.debug) {
    opts.debug.energy = energy.slice(); opts.debug.frames = frames; opts.debug.frameLen = frameLen;
    let pk = 0, pat = 0;
    for (let i = 0; i < N; i++) { const v = Math.max(Math.abs(outL[i]), Math.abs(outR[i])); if (v > pk) { pk = v; pat = i; } }
    opts.debug.prePeak = pk; opts.debug.prePeakAt = pat / SR;
  }

  /* ═════════ master: high-pass, air, glue, limiter ═════════ */
  (function masterChain() {
    let pk = 1e-9;
    for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(outL[i]), Math.abs(outR[i]));
    const ng = 0.9 / pk;
    for (let i = 0; i < N; i++) { outL[i] *= ng; outR[i] *= ng; }
    const biquad = (x, b0, b1, b2, a0, a1, a2) => {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < N; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
    };
    {
      const w0 = TAU * 28 / SR, cs = Math.cos(w0), al = Math.sin(w0) / (2 * 0.707);
      for (const x of [outL, outR]) biquad(x, (1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al);
    }
    {
      const A = Math.pow(10, 1.5 / 40), w = TAU * 6000 / SR, c = Math.cos(w), al2 = Math.sin(w) / 2 * Math.SQRT2, sq = 2 * Math.sqrt(A) * al2;
      for (const x of [outL, outR]) biquad(x, A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq),
        (A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq);
    }
    const aA = Math.exp(-1 / (0.008 * SR)), aR = Math.exp(-1 / (0.18 * SR));
    const thr = -15, ratio = 2.2, makeup = Math.pow(10, 3 / 20);
    let env = 0, gPrev = makeup;
    const gainOf = (e) => { const over = 20 * Math.log10(e + 1e-9) - thr; return over > 0 ? Math.pow(10, -over * (1 - 1 / ratio) / 20) * makeup : makeup; };
    for (let i0 = 0; i0 < N; i0 += 16) {
      const i1 = Math.min(N, i0 + 16);
      for (let i = i0; i < i1; i++) { const x = Math.max(Math.abs(outL[i]), Math.abs(outR[i])); env = x > env ? x + (env - x) * aA : x + (env - x) * aR; }
      const gNext = gainOf(env), st = (gNext - gPrev) / (i1 - i0);
      let g = gPrev;
      for (let i = i0; i < i1; i++) { g += st; outL[i] *= g; outR[i] *= g; }
      gPrev = gNext;
    }
  })();
  yield 0.93;
  (function limiter() {
    const ceil = 0.93;
    let peak = 0;
    for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
    const pre = Math.min(4, (ceil / peak) * 1.3);
    const la = Math.round(0.004 * SR), tgt = new Float32Array(N);
    for (let i = 0; i < N; i++) { const p = Math.max(Math.abs(outL[i]), Math.abs(outR[i])) * pre; tgt[i] = p > ceil ? ceil / p : 1; }
    const mn = new Float32Array(N), dq = new Int32Array(N);
    let h = 0, tl = 0;
    for (let j = 0; j < N + la; j++) {
      if (j < N) { while (tl > h && tgt[dq[tl - 1]] >= tgt[j]) tl--; dq[tl++] = j; }
      const i = j - la;
      if (i >= 0) { while (dq[h] < i - la) h++; mn[i] = tgt[dq[h]]; }
    }
    const half = la >> 1, w = 2 * half + 1;
    let sum = 0;
    for (let j = 0; j < Math.min(N, half + 1); j++) sum += mn[j];
    sum += half;
    const aRel = Math.exp(-1 / (0.08 * SR));
    let g = 1;
    for (let i = 0; i < N; i++) {
      const avg = sum / w;
      g = avg < g ? avg : avg + (g - avg) * aRel;
      outL[i] *= g * pre; outR[i] *= g * pre;
      sum += (i + half + 1 < N ? mn[i + half + 1] : 1) - (i - half >= 0 ? mn[i - half] : 1);
    }
    const fin = Math.round(0.006 * SR), cut = at(PIECE), fcut = Math.round(0.003 * SR);
    for (let i = 0; i < N; i++) {
      let e = i < fin ? i / fin : 1;
      if (i >= cut) e = 0; else if (i > cut - fcut) e *= (cut - i) / fcut;
      let l = outL[i] * e, r = outR[i] * e;
      outL[i] = l > ceil ? ceil : l < -ceil ? -ceil : l;
      outR[i] = r > ceil ? ceil : r < -ceil ? -ceil : r;
    }
  })();
  yield 0.97;

  /* ═════════ envelopes for the picture ═════════ */
  const env = new Float32Array(STEMS.length * frames);
  for (let s = 0; s < STEMS.length; s++) {
    let mx = 1e-9;
    for (let f = 0; f < frames; f++) { const v = Math.sqrt(energy[s * frames + f] / frameLen); env[s * frames + f] = v; if (v > mx) mx = v; }
    let sm = 0;
    for (let f = 0; f < frames; f++) { const v = env[s * frames + f] / mx; sm = v > sm ? v : sm * 0.86 + v * 0.14; env[s * frames + f] = sm; }
  }
  const masterEnv = new Float32Array(frames);
  {
    let mx = 1e-9;
    for (let f = 0; f < frames; f++) {
      let e = 0; const a = Math.floor(f * frameLen), b = Math.min(N, Math.floor((f + 1) * frameLen));
      for (let i = a; i < b; i++) e += outL[i] * outL[i] + outR[i] * outR[i];
      masterEnv[f] = Math.sqrt(e / Math.max(1, b - a)); if (masterEnv[f] > mx) mx = masterEnv[f];
    }
    for (let f = 0; f < frames; f++) masterEnv[f] /= mx;
  }
  const score = {
    kick: S.kick.map((e) => [e.t, e.vel]), snare: S.snare.map((e) => [e.t, e.vel]), hat: S.hat.map((e) => [e.t, e.vel]),
    click: S.click.map((e) => [e.t, e.vel]), bass: S.bass.map((e) => [e.t, e.note, e.dur]),
    flips: S.flips.map((f) => [f.t, f.kind, f.bit]), sorts: S.sorts.map((s) => [s.t0, s.t1, s.amt, s.dir]),
    stutters: S.stutters.map((s) => [s.t, s.len, s.count]), crashes: S.crashes.map((c) => c.t), impacts: S.impacts,
    packets: S.packets.map((p) => [p.t, p.got]), dial: S.dial.map((d) => [d.t, d.d]), rolls: S.rolls.map((r) => [r.t, r.dur]),
    blips: S.blips.map((b) => b.t), subs: S.subs.map((s) => s.t),
    tone: S.tone, answer: S.answer, fsk: S.fsk, bongs: S.bongs, data: S.data, static: S.static, tapeStop: S.tapeStop, wobble: S.wobble,
    riser: S.riser, decimate: S.decimate, eof: S.eof, spectral: S.spectral, marks: S.marks,
  };
  yield 1;
  return { sampleRate: SR, L: outL, R: outR, env, master: masterEnv, envRate: ENV_RATE, frames, stems: STEMS, score };
}

/* ───────── effects shared by the mix and the loop ───────── */
function makePlate(p, SR) {
  const sc = SR / 29761;
  const Lx = (x) => Math.max(2, Math.round(x * sc));
  const ring = (n) => ({ b: new Float32Array(n), n, w: 0 });
  const pre = ring(Math.max(2, Math.round(p.predelay * SR)));
  const ins = [Lx(142), Lx(107), Lx(379), Lx(277)].map(ring);
  const inG = [p.inDiff1, p.inDiff1, p.inDiff2, p.inDiff2];
  const exc = p.excursion * sc;
  const mAn = Lx(672), mBn = Lx(908);
  const mA = ring(mAn + Math.ceil(exc) + 3), mB = ring(mBn + Math.ceil(exc) + 3);
  const dA1 = ring(Lx(4453)), aA2 = ring(Lx(1800)), dA2 = ring(Lx(3720));
  const dB1 = ring(Lx(4217)), aB2 = ring(Lx(2656)), dB2 = ring(Lx(3163));
  const tap = (r, d) => { let i = r.w - d; if (i < 0) i += r.n; return r.b[i]; };
  const tL = [[dB1, Lx(266), 1], [dB1, Lx(2974), 1], [aB2, Lx(1913), -1], [dB2, Lx(1996), 1], [dA1, Lx(1990), -1], [aA2, Lx(187), -1], [dA2, Lx(1066), -1]];
  const tR = [[dA1, Lx(353), 1], [dA1, Lx(3627), 1], [aA2, Lx(1228), -1], [dA2, Lx(2673), 1], [dB1, Lx(2111), -1], [aB2, Lx(335), -1], [dB2, Lx(121), -1]];
  let bw = 0, dampA = 0, dampB = 0, lfo = 0;
  const decay = p.decay, damp = p.damping, band = p.bandwidth, dd1 = p.decDiff1, dd2 = p.decDiff2;
  const push = (r, v) => { r.b[r.w] = v; r.w = r.w + 1 === r.n ? 0 : r.w + 1; };
  const ap = (r, x, g) => { const d = r.b[r.w]; const v = x + g * d; push(r, v); return d - g * v; };
  const modAp = (r, x, g, len, off) => {
    let fp = r.w - len - off; if (fp < 0) fp += r.n;
    const i0 = Math.floor(fp), fr = fp - i0, i1 = i0 + 1 >= r.n ? 0 : i0 + 1;
    const d = r.b[i0] + (r.b[i1] - r.b[i0]) * fr, v = x + g * d;
    push(r, v);
    return d - g * v;
  };
  return function (inp, outL, outR, n) {
    for (let i = 0; i < n; i++) {
      const x0 = pre.b[pre.w]; push(pre, inp[i]);
      bw += (x0 - bw) * band;
      let x = bw;
      for (let j = 0; j < 4; j++) x = ap(ins[j], x, -inG[j]);
      lfo += 0.9 / SR; if (lfo > 1) lfo -= 1;
      const m = Math.sin(lfo * Math.PI * 2) * exc;
      const lastA = tap(dA2, dA2.n), lastB = tap(dB2, dB2.n);
      const a = modAp(mA, x + decay * lastB, dd1, mAn, m);
      const a1o = tap(dA1, dA1.n); push(dA1, a);
      dampA += (a1o - dampA) * (1 - damp);
      push(dA2, ap(aA2, dampA * decay, -dd2));
      const b = modAp(mB, x + decay * lastA, dd1, mBn, -m);
      const b1o = tap(dB1, dB1.n); push(dB1, b);
      dampB += (b1o - dampB) * (1 - damp);
      push(dB2, ap(aB2, dampB * decay, -dd2));
      let yl = 0, yr = 0;
      for (let j = 0; j < 7; j++) { yl += tap(tL[j][0], tL[j][1]) * tL[j][2]; yr += tap(tR[j][0], tR[j][1]) * tR[j][2]; }
      outL[i] += yl * 0.6; outR[i] += yr * 0.6;
    }
  };
}
function makeDelay(time, fb, SR) {
  const n = Math.round(time * SR), bl = new Float32Array(n), br = new Float32Array(n);
  let w = 0, lpL = 0, lpR = 0, hpL = 0, hpR = 0;
  const cl = 1 - Math.exp(-TAU * 3200 / SR), ch = 1 - Math.exp(-TAU * 300 / SR);
  return function (inp, outL, outR, len) {
    for (let i = 0; i < len; i++) {
      const l = bl[w], r = br[w];
      lpL += (l - lpL) * cl; hpL += (lpL - hpL) * ch; lpR += (r - lpR) * cl; hpR += (lpR - hpR) * ch;
      const fl = lpL - hpL, fr = lpR - hpR;
      bl[w] = inp[i] + fr * fb; br[w] = fl;
      w++; if (w >= n) w = 0;
      outL[i] += fl; outR[i] += fr;
    }
  };
}

function render(opts) {
  const g = renderGen(opts);
  let r;
  while (!(r = g.next()).done) { /* spin */ }
  return r.value;
}

return { STEP, BEAT, BAR, BARS, PIECE, DURATION, GEN, STEMS, T, genOf, SPEC, DIAL, LOOP, COPY, fft, mtof, buildScore, renderGen, render };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SYNTH;
