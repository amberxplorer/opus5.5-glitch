/* ─────────────────────────────────────────────────────────────────────────
   card.js — the test card: generation 0, before anything is lost.
   Drawn once per layout at screen resolution, in the manner of broadcast
   line-up cards: a castellated border, a grid, 75% colour bars, a grey
   scale, a multiburst of finer and finer stripes, and the title.
   ───────────────────────────────────────────────────────────────────────── */
var CARD = (function () {
'use strict';
const TAU = Math.PI * 2;
const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

// the circle, in work pixels, for a layout
function geometry(L) {
  const r = Math.min(336, Math.min(L.WW, L.WH) / 2 - 20);
  return { cx: L.sq.x + 360, cy: L.sq.y + 360, r };
}

function draw(cv, L) {
  cv.width = L.W; cv.height = L.H;
  const g = cv.getContext('2d');
  const k = L.k, u = (v) => v * k;
  const G = geometry(L);
  const cx = u(G.cx), cy = u(G.cy), R = u(G.r), r = G.r;
  g.fillStyle = '#4b4b4b'; g.fillRect(0, 0, L.W, L.H);
  // grid
  const cell = u(60);
  g.strokeStyle = '#d6d6d6'; g.lineWidth = Math.max(1, u(2));
  g.beginPath();
  for (let x = cx % cell; x < L.W; x += cell) { g.moveTo(x, 0); g.lineTo(x, L.H); }
  for (let y = cy % cell; y < L.H; y += cell) { g.moveTo(0, y); g.lineTo(L.W, y); }
  g.stroke();
  // castellated border
  const bw = u(13), bl = u(36);
  for (let i = 0; i * bl < L.W; i++) { g.fillStyle = i % 2 ? '#efefef' : '#101010'; g.fillRect(i * bl, 0, bl, bw); g.fillRect(i * bl, L.H - bw, bl, bw); }
  for (let i = 0; i * bl < L.H; i++) { g.fillStyle = i % 2 ? '#101010' : '#efefef'; g.fillRect(0, i * bl, bw, bl); g.fillRect(L.W - bw, i * bl, bw, bl); }

  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  g.fillStyle = '#161616'; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // 75% bars, then the reversed row beneath them
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const yb = cy - u(r * 0.4);
  bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(cx - R + i * 2 * R / 7, cy - R, 2 * R / 7 + 1, yb - (cy - R)); });
  const rev = ['#0000c0', '#161616', '#c000c0', '#161616', '#00c0c0', '#161616', '#c0c0c0'];
  rev.forEach((c, i) => { g.fillStyle = c; g.fillRect(cx - R + i * 2 * R / 7, yb, 2 * R / 7 + 1, u(r * 0.07)); });
  // grey scale
  const ys = yb + u(r * 0.07), ye = cy - u(r * 0.26);
  for (let i = 0; i < 6; i++) { const v = Math.round(i * 255 / 5); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(cx - R + i * 2 * R / 6, ys, 2 * R / 6 + 1, ye - ys); }
  // title band
  const t0 = cy - u(r * 0.26), t1 = cy + u(r * 0.28);
  g.fillStyle = '#060606'; g.fillRect(cx - R, t0, 2 * R, t1 - t0);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f3f3f1';
  let size = u(r * 0.19);
  try { g.fontStretch = 'condensed'; } catch (e) { /* older canvas */ }
  g.font = `700 ${size}px ${SANS}`;
  while (size > 8 && g.measureText('GENERATION LOSS').width > 1.72 * R) { size *= 0.95; g.font = `700 ${size}px ${SANS}`; }
  g.fillText('GENERATION LOSS', cx, cy - u(r * 0.02));
  try { g.fontStretch = 'normal'; } catch (e) { /* */ }
  g.font = `500 ${u(r * 0.052)}px ${SANS}`;
  g.fillStyle = '#c9c9c6';
  g.fillText('an exhibition of glitch art in eight generations', cx, cy + u(r * 0.1));
  // multiburst: stripes, finer and finer
  const m0 = cy + u(r * 0.48), m1 = cy + u(r * 0.68);
  [14, 10, 7, 5, 3.5, 2.5].forEach((p, i) => {
    const x0 = cx - R + (i + 0.5) * 2 * R / 6.6, w = 2 * R / 7;
    g.fillStyle = '#ececec';
    for (let x = 0; x < w; x += u(p)) g.fillRect(x0 + x, m0, u(p) / 2, m1 - m0);
  });
  // checker foot
  const cf = cy + u(r * 0.72), cs = u(r * 0.09);
  for (let i = 0; i * cs < 2 * R; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#e8e8e8' : '#0c0c0c'; g.fillRect(cx - R + i * cs, cf + j * cs, cs, cs); }
  g.restore();

  g.strokeStyle = '#f0f0f0'; g.lineWidth = u(3);
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.lineWidth = u(2);
  g.beginPath();
  g.moveTo(cx - R - u(18), cy); g.lineTo(cx - R + u(18), cy);
  g.moveTo(cx + R - u(18), cy); g.lineTo(cx + R + u(18), cy);
  g.stroke();
  // captions on the grid
  g.font = `600 ${u(12)}px ${MONO}`; g.fillStyle = '#f0f0f0';
  g.textAlign = 'left'; g.fillText('TEST CARD GL', u(30), u(44));
  g.fillText('AS17-148-22727', u(30), L.H - u(32));
  g.textAlign = 'right'; g.fillText('1 kHz  −18 dBFS', L.W - u(30), L.H - u(32));
}

// where the play control sits (work px), under the subtitle inside the title band
function control(L) {
  const G = geometry(L);
  return { x: G.cx, y: G.cy + G.r * 0.19, w: 170, h: 40 };
}

return { draw, geometry, control };
})();
