/* ─────────────────────────────────────────────────────────────────────────
   scenes.js — the timeline. One photograph, the Blue Marble (Apollo 17,
   1972), through eight generations; each starts from what the last left.

     0  0:00  download     test card, a dial, a handshake, the JPEG arrives
     1  0:08  bit rot      single bits of the file flipped
     2  0:24  pixel sort   the bright spans melt
     3  0:40  datamosh     blocks moved by vectors, no key frames
     4  0:56  broadcast    composite video on a tube, with a magnet
     5  1:12  spectrum     the picture as sound, read back from the audio
     6  1:28  compression  saved as JPEG again and again
     7  1:44  one pixel    the mean of it all, then the Pale Blue Dot

   Every frame is a function of the music clock (see stages.js).
   ───────────────────────────────────────────────────────────────────────── */
var SCENES = (function () {
'use strict';
const { T, STEP, PIECE, GEN, SPEC } = SYNTH;
const GT = GEN.map((b) => T(b, 0));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i); return a; };

let L = null, music = null, S = null, show = null;
const card = { cv: null, tex: null, gen: -1 };
const dot = { tex: null, W: 0, H: 0, e: [0, 0], bytes: null };

function init() {
  L = GFX.L;
  STAGES.init();
  show = GFX.program(SHADERS.show);
  card.cv = document.createElement('canvas');
  card.tex = GFX.texture(4, 4, { linear: true });
  dot.bytes = b64(MEDIA.dot.jpeg);
  const d = JPEG.decode(dot.bytes);
  dot.W = d.W; dot.H = d.H;
  dot.e = [MEDIA.dot.earth[0] + 0.5, MEDIA.dot.earth[1] + 0.5];
  dot.tex = GFX.texture(d.W, d.H);
  GFX.upload(dot.tex, new Uint8Array(d.data.buffer));
}
function setMusic(m) { music = m; S = m.score; STAGES.setMusic(m); }
function ensureCard() {
  if (card.gen === L.gen) return;
  CARD.draw(card.cv, L);
  GFX.uploadCanvas(card.tex, card.cv);
  card.gen = L.gen;
}

const env = (stem, t) => {
  const i = music.stems.indexOf(stem), f = clamp(Math.floor(t * music.envRate), 0, music.frames - 1);
  return music.env[i * music.frames + f];
};
const genAt = (t) => { let g = 0; while (g < 7 && t >= GT[g + 1]) g++; return g; };
// during a stutter the audio repeats a slice; the pictures that carry state hold still with it
function stutterAt(t) {
  for (const [st, len, count] of S.stutters) if (t >= st && t < st + len * count) return { start: st, len, i: Math.floor((t - st) / len) };
  return null;
}
function base(t) {
  return {
    uWS: [L.WW, L.WH], uScr: [L.W, L.H], uK: L.k,
    uCardMix: 0, uDotSize: [dot.W, dot.H], uDotE: dot.e, uDotV: [0, 0, 1, 0],
    uRect: [0, 0, 0, 0], uRectC: [0, 0, 0, 0],
    uSplit: [0, 0, 0, 0], uTear: [0, 0, 0, 0], uBlock: [0, 0, 32], uMag: [0, 0, 0, 0], uRoll: 0,
    uCRT: [0, 0, 0, 0], uPower: 0, uSnow: 0, uFade: 0, uGrain: 0.016, uT: t, uInvert: 0, uDecim: [0, 0],
  };
}

/* ───────── the generations ───────── */
function g0(t, U, st) {
  const R = STAGES.R, dial = S.dial[0][0];
  if (t < dial) {
    U.uCardMix = 1; U.uGrain = 0.03;
    GFX.clear(R.work, [0, 0, 0, 1]);
    return R.work;
  }
  if (t < dial + 0.3) {
    // the card loses its signal
    const p = (t - dial) / 0.3;
    U.uCardMix = 1 - ease(p);
    U.uTear = [70 * p, Math.floor(t * 30), 0, 0];
    U.uBlock = [0.35 * p, Math.floor(t * 20), 32];
    U.uSplit = [10 * p, -10 * p, 0, 0];
  }
  if (t >= S.data[0]) {
    st.got = STAGES.downloadTo(t);
    STAGES.place();
  } else GFX.clear(R.work, [0, 0, 0, 1]);
  return R.work;
}
function g1(t, U, st) {
  st.flips = STAGES.rotTo(t);
  st.bits = STAGES.earth.scanBits;
  STAGES.place();
  const band = STAGES.rot.band, flip = STAGES.flips[Math.max(0, st.flips - 1)];
  if (band && t - band[2] < 0.1) {
    const full = band[1] - band[0] > 700 && flip && flip.kind === 'dqt';
    U.uTear = [full ? 40 : 26, Math.floor(band[2] * 97), full ? 0 : L.sq.y + band[0], full ? 0 : L.sq.y + band[1]];
    if (full) { U.uSplit = [14, -14, 4, 0]; if (t - band[2] < 0.04) U.uInvert = 1; }
  }
  return STAGES.R.work;
}
function g2(t, U, st, tS) {
  const n = STAGES.sortAt(tS);
  STAGES.want('sort', n);
  st.passes = n;
  for (const [a, b] of S.sorts) if (t >= a && t < b) { const p = (t - a) / (b - a); U.uSplit = [3 + 5 * p, -2 - 4 * p, 0, 0]; }
  return STAGES.R.work;
}
function g3(t, U, st, tS) {
  const n = STAGES.moshAt(tS);
  STAGES.want('mosh', n);
  st.frame = n;
  const k = env('kick', t);
  U.uSplit = [6 * k, -6 * k, 0, 0];
  return STAGES.R.work;
}
function g4(t, U) {
  STAGES.want('mosh', STAGES.MOSH_TOTAL);
  const roll = S.rolls.find(([rt, d]) => t >= rt && t < rt + d);
  const recv = STAGES.analog(t, roll ? 1.6 : 0.7, roll ? lerp(0, L.WH, (t - roll[0]) / roll[1]) : -200);
  U.uCRT = [0.35, 0.75, 0.3, 0.35];
  if (roll) U.uRoll = (L.WH + 30) * ease((t - roll[0]) / roll[1]);
  // the magnet wanders; while it bends the sound it bends the picture hard
  const [w0, w1] = S.wobble;
  const pull = t < w0 ? 0.35 + 0.5 * env('bass', t) : lerp(1.2, 3.4, clamp((t - w0) / (w1 - w0), 0, 1)) * (0.8 + 0.4 * env('bass', t));
  U.uMag = [L.sq.x + 360 + 190 * Math.sin(t * 0.63), L.sq.y + 360 + 230 * Math.sin(t * 0.41 + 1), pull, 250];
  // the tape stops and the tube goes off: down to a line, then a dot
  const [s0, s1] = S.tapeStop;
  if (t >= s0) U.uPower = clamp((t - s0) / (s1 - s0), 0, 1);
  U.uGrain = 0.03;
  return recv;
}
function g5(t, U) {
  const [a, b] = S.static;
  if (t < b) U.uSnow = 1 - ease((t - a) / (b - a)) * 0.9 - (t > b - 0.3 ? 0.1 : 0);
  const head = Math.min(t, SPEC.t1);
  STAGES.waterfallTo(head);
  const src = STAGES.drawWaterfall(head);
  // after the picture has played, the display holds it: a capture
  if (t >= SPEC.t1) { const p = (t - SPEC.t1); if (p < 0.1) U.uInvert = 0.8 * (1 - p / 0.1); }
  return src;
}
function g6(t, U, st, tS) {
  const n = STAGES.jpegAt(tS);
  STAGES.want('jpeg', n);
  st.saves = n; st.q = n ? STAGES.JPG.q[n - 1] : 40;
  const k = env('kick', t);
  U.uSplit = [5 * k, -5 * k, 0, 0];
  const [d0, d1] = S.decimate;
  if (t >= d0) { const u = clamp((t - d0) / (d1 - d0), 0, 1); U.uDecim = [1 + 46 * u * u, Math.pow(2, 8 - 7 * u) - 1]; }
  return STAGES.R.work;
}
function g7(t, U, st) {
  const R = STAGES.R;
  STAGES.want('jpeg', STAGES.JPG.total);
  const rgb = STAGES.averages();
  const mean = rgb.map((v) => v / 255);
  const tAvg = T(54, 0), tDot = T(56, 0);
  st.rgb = t >= tAvg ? rgb : null;
  if (t < tAvg) {
    let lv = 0;
    for (let i = 0; i < S.blips.length; i++) if (t >= S.blips[i]) lv = i;
    return STAGES.blocks(lv);
  }
  // the colour shrinks to a pixel, and the pixel is the Earth in Voyager's picture
  const sFit = Math.max(L.W / dot.W, L.H / dot.H);
  const fit = [L.W / 2 + (dot.e[0] - dot.W / 2) * sFit, L.H / 2 + (dot.e[1] - dot.H / 2) * sFit];
  const z0 = (720 * L.k) / sFit;
  const u = t < tDot ? clamp((t - tAvg) / (tDot - tAvg), 0, 1) : 1;
  const z = Math.pow(z0, 1 - ease(u) * 0.35 - u * 0.65);
  const mid = [L.W / 2, L.H / 2];
  const c = [fit[0] + (mid[0] - fit[0]) * (z - 1) / (z0 - 1), fit[1] + (mid[1] - fit[1]) * (z - 1) / (z0 - 1)];
  const size = sFit * z;
  const photo = clamp((t - (tAvg + 1.2)) / 1.8, 0, 1);
  U.uDotV = [c[0], c[1], sFit * z, photo];
  U.uRect = [c[0] - size / 2, c[1] - size / 2, size, size];
  U.uRectC = [mean[0], mean[1], mean[2], 1 - photo * photo];
  // the last bytes, and the end of the file
  const [e0, e1] = S.eof;
  if (t >= e0) {
    const p = (t - e0) / (e1 - e0);
    U.uTear = [30 + 120 * p, Math.floor(t * 60), 0, 0];
    U.uBlock = [0.1 + 0.5 * p, Math.floor(t * 40), 24];
    U.uSplit = [12 * p, -12 * p, 3, 0];
  }
  GFX.clear(R.disp, [0, 0, 0, 1]);
  return R.disp;
}
const GENS = [g0, g1, g2, g3, g4, g5, g6, g7];

function frame(t) {
  STAGES.ensure(); ensureCard();
  const U = base(t), st = {};
  const gi = genAt(t);
  let src;
  if (t >= PIECE) { GFX.clear(STAGES.R.disp, [0, 0, 0, 1]); src = STAGES.R.disp; U.uFade = 1; }
  else {
    const stt = stutterAt(t);
    const tS = stt ? stt.start : t;
    src = GENS[gi](t, U, st, tS);
    if (stt) { U.uBlock = [0.12, stt.i * 3.1 + 1, 16]; U.uTear[0] = Math.max(U.uTear[0], 18); U.uTear[1] = stt.i % 2; }
    // every generation arrives with a burst
    const p = (t - GT[gi]) / 0.35;
    if (gi > 0 && gi !== 5 && p < 1) {
      const q = 1 - p;
      U.uSplit[0] += 12 * q; U.uSplit[1] -= 12 * q;
      U.uTear = [Math.max(U.uTear[0], 50 * q), Math.floor(t * 30), 0, 0];
      U.uBlock = [Math.max(U.uBlock[0], 0.28 * q), Math.floor(t * 24), 32];
    }
  }
  GFX.pass(show, U, { uWork: src, uCard: card.tex, uDot: dot.tex }, null);
  hud(t, gi, st);
}

function hud(t, gi, st) {
  const g = GFX.hud;
  HUD.begin(g, L);
  if (t >= PIECE) return;
  const lay = HUD.layout();
  if (t < S.dial[0][0]) { HUD.header(t, 0, true); return; }
  HUD.header(t, gi);
  if (gi === 0) {
    HUD.terminal(t, S, lay, { got: STAGES.dl.got || 0, total: STAGES.earth.bytes });
    if (t < S.data[0]) HUD.scope(t, music);
    else HUD.label(t, 0, st, lay, S.data[0]);
    return;
  }
  HUD.label(t, gi, st, lay);
  if (gi === 1) HUD.hexdump(t, lay, STAGES.rot, STAGES.flips, STAGES.earth.orig);
  else if (gi === 4 && t < S.tapeStop[0]) HUD.osd(t, S);
  else if (gi === 5 && t >= S.static[0] + 0.6) HUD.axis(t, lay, STAGES.WF.row, STAGES.FLO, STAGES.FHI);
  else if (gi === 7) {
    const tDot = T(56, 0);
    if (t >= tDot + 0.8 && t < S.eof[0]) {
      // a ring around the Earth, so it can be found
      const sFit = Math.max(L.W / dot.W, L.H / dot.H);
      const x = L.W / 2 + (dot.e[0] - dot.W / 2) * sFit, y = L.H / 2 + (dot.e[1] - dot.H / 2) * sFit;
      const a = clamp((t - tDot - 0.8) / 1, 0, 1) * clamp((S.eof[0] - t) / 1.5, 0, 1);
      g.strokeStyle = `rgba(255,255,255,${0.75 * a})`; g.lineWidth = Math.max(1, L.k * 1.2);
      g.beginPath(); g.arc(x, y, L.k * 16, 0, Math.PI * 2); g.stroke();
    }
    if (t >= S.eof[0]) HUD.eof(t, dot.bytes, S);
  }
}

function idle(tw, st) {
  STAGES.ensure(); ensureCard();
  const U = base(tw);
  U.uCardMix = 1; U.uGrain = 0.025;
  // every few seconds the card's signal slips, briefly
  const ph = tw % 5.3;
  if (ph > 4.9 && ph < 5.05) { U.uTear = [16, Math.floor(tw * 30), 0, 0]; U.uSplit = [3, -3, 0, 0]; }
  GFX.pass(show, U, { uWork: STAGES.R.work, uCard: card.tex, uDot: dot.tex }, null);
  HUD.begin(GFX.hud, L);
  HUD.header(0, 0, true);
  HUD.control(tw, st);
}
// the play control, in CSS pixels, for hover
function button() {
  if (!L) return null;
  const c = CARD.control(L), s = L.cssW / L.WW;
  return [c.x * s, c.y * s, (c.w / 2) * s];
}

return { init, setMusic, frame, idle, button };
})();
