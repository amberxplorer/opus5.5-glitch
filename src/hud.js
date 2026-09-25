/* ─────────────────────────────────────────────────────────────────────────
   hud.js — the words: museum labels for each generation, the timecode, a
   map of the eight rooms, and what each room shows beside its picture
   (the modem's terminal and scope, the file's bytes, the spectrum's axis,
   a VCR's on-screen display, the last bytes of the last file).
   Drawn on a 2D canvas over the picture, so text stays sharp whatever
   happens to the image.
   ───────────────────────────────────────────────────────────────────────── */
var HUD = (function () {
'use strict';
const { T, GEN, SPEC } = SYNTH;
const GT = GEN.map((b) => T(b, 0));
const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const hex2 = (b) => (b < 16 ? '0' : '') + b.toString(16);
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const GLYPHS = '#%&*+=<>/\\|01░▒▓█▌▐■□◆◇';

const LABELS = [
  { title: 'Download', lines: ['as17-148-22727.jpg · 142,293 bytes', 'Apollo 17 crew, 7 December 1972 · NASA'], sound: 'a line-up tone, a dial, a handshake' },
  { title: 'Bit Rot', lines: [(s) => `${s.flips} flipped ${s.flips === 1 ? 'bit' : 'bits'} of ${fmt(s.bits)}`, 'each flip re-decodes one restart interval'], sound: 'the loop, and a copy through a lossy codec' },
  { title: 'Pixel Sort', lines: ['after Kim Asendorf, 2010', (s) => `odd–even transposition · ${fmt(s.passes)} passes`], sound: 'the loop with its samples sorted' },
  { title: 'Datamosh', lines: ['after Takeshi Murata, Monster Movie, 2005', (s) => `16 × 16 blocks, no key frames · frame ${s.frame}`], sound: 'the loop in misplaced grains' },
  { title: 'Broadcast', lines: ['after Nam June Paik, Magnet TV, 1965', '525 lines · one magnet'], sound: 'the loop on tape, copied twice' },
  { title: 'Spectrum', lines: ['after Aphex Twin, 1999', 'the picture as sound: harmonics 10–180 of E♭1'], sound: 'the loop on the radio, and the Earth' },
  { title: 'Compression', lines: [(s) => `JPEG, saved ${s.saves} ${s.saves === 1 ? 'time' : 'times'}`, (s) => `quality ${s.q} of 100`], sound: 'the loop at five bits and 8 kHz' },
  { title: 'One Pixel', lines: [(s) => s.rgb ? `the mean of 518,400 pixels: rgb(${s.rgb.join(', ')})` : 'block means: 8, 16, 48, 144, 720', 'averaged down to a single colour'], sound: 'the loop played into a room until only the room is left, after Alvin Lucier, 1969' },
];
const DOT_LABEL = { title: 'Pale Blue Dot', lines: ['Voyager 1, 14 February 1990 · NASA/JPL', 'the Earth: 0.12 of a pixel, from six billion kilometres'], sound: 'the loop as it was' };

let g = null, L = null, k = 1;
const u = (v) => v * k;
const font = (w, size, fam) => `${w} ${u(size)}px ${fam}`;

// a text decoding into place: glyphs settle over `dur` seconds after `t0`
function settle(text, t, t0, dur, seed) {
  if (t - t0 >= dur) return text;
  const p = clamp((t - t0) / dur, 0, 1), f = Math.floor(t * 30);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ' || hash(i + seed * 97, 0) < p * 1.15) out += c;
    else out += GLYPHS[Math.floor(hash(i + seed, f) * GLYPHS.length)];
  }
  return out;
}
// text losing characters to U+FFFD, the replacement character
function rot(text, amount, seed) {
  if (amount <= 0) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) out += text[i] !== ' ' && hash(i, seed) < amount ? '�' : text[i];
  return out;
}

function layout() {
  const { WW, WH, sq } = L;
  const top = sq.y, side = sq.x;
  if (top >= 170) return { mode: 'tall', lx: 28, lw: WW - 56, ly: sq.y + 720 + 38, extra: { x: 28, y: 104, w: WW - 56, h: top - 124 } };
  if (side >= 200) return { mode: 'wide', lx: 28, lw: side - 52, ly: null, extra: { x: sq.x + 720 + 24, y: 104, w: side - 48, h: WH - 140 } };
  return { mode: 'over', lx: sq.x + 24, lw: 672, ly: null, extra: { x: sq.x + 24, y: sq.y + 90, w: 672, h: 200 } };
}

function wrap(text, width) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > width && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function label(t, gi, st, lay, from) {
  const lab = gi === 7 && t >= T(56, 0) ? DOT_LABEL : LABELS[gi];
  const t0 = from !== undefined ? from : gi === 7 && t >= T(56, 0) ? T(56, 0) : GT[gi];
  const decay = gi === 6 ? clamp((t - GT[6]) / 16, 0, 1) * 0.35 : 0;
  const seed = gi * 13 + (lab === DOT_LABEL ? 7 : 0);
  // measure the block to place it
  const rows = [];
  g.font = font(600, 12, MONO);
  rows.push({ kind: 'gen', text: `GEN ${gi} / 7` });
  g.font = font(600, 34, SANS);
  for (const s of wrap(lab.title, u(lay.lw))) rows.push({ kind: 'title', text: s });
  g.font = font(500, 15, SANS);
  for (const ln of lab.lines) for (const s of wrap(typeof ln === 'function' ? ln(st) : ln, u(lay.lw))) rows.push({ kind: 'line', text: s });
  g.font = font(400, 12.5, MONO);
  for (const s of wrap('sound  ' + lab.sound, u(lay.lw))) rows.push({ kind: 'sound', text: s });
  const lh = { gen: 22, title: 40, line: 22, sound: 19 };
  const H = rows.reduce((a, r) => a + lh[r.kind], 0) + 8;
  let y = lay.ly !== null ? lay.ly : L.WH - 34 - H;
  if (lay.mode === 'over') {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(u(lay.lx - 14), u(y - 26), u(lay.lw + 28), u(H + 26));
  }
  // a thin rule, then the rows
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(u(lay.lx), u(y - 22), u(Math.min(lay.lw, 300)), Math.max(1, u(1)));
  let i = 0;
  for (const r of rows) {
    y += lh[r.kind];
    const txt = rot(settle(r.text, t, t0, 0.35 + i * 0.05, seed + i), decay, i + Math.floor(t * 4));
    if (r.kind === 'gen') { g.font = font(600, 12, MONO); g.fillStyle = 'rgba(255,255,255,0.62)'; }
    else if (r.kind === 'title') { g.font = font(600, 34, SANS); g.fillStyle = '#f4f4f2'; }
    else if (r.kind === 'line') { g.font = font(500, 15, SANS); g.fillStyle = 'rgba(244,244,242,0.86)'; }
    else { g.font = font(400, 12.5, MONO); g.fillStyle = 'rgba(244,244,242,0.55)'; }
    g.textAlign = 'left';
    g.fillText(txt, u(lay.lx), u(y - (r.kind === 'title' ? 6 : 5)));
    i++;
  }
}

// top left: the title and the map of rooms; top right: timecode
function header(t, gi, clockOnly) {
  g.textAlign = 'left';
  if (!clockOnly) {
  g.font = font(600, 13, MONO);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText('GENERATION LOSS', u(28), u(40));
  for (let i = 0; i < 8; i++) {
    const x = u(28 + i * 17), y = u(52), s = u(11);
    if (i === gi) { g.fillStyle = '#f4f4f2'; g.fillRect(x, y, s, s); }
    else { g.strokeStyle = i < gi ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(1, u(1)); g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); }
  }
  }
  const f = Math.floor(t * 30) % 30, s = Math.floor(t) % 60, m = Math.floor(t / 60);
  const pad = (n) => (n < 10 ? '0' : '') + n;
  g.textAlign = 'right';
  g.font = font(500, 13, MONO);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`00:${pad(m)}:${pad(s)}:${pad(f)}`, u(L.WW - 28), u(40));
}

// generation 0: the modem's side of the conversation
function terminal(t, S, lay, dl) {
  const lines = [];
  if (t >= S.dial[0][0] - 0.15) {
    let s = 'ATDT';
    for (const [dt, d] of S.dial) if (t >= dt) s += d;
    lines.push(s);
  }
  if (t >= S.answer[0]) lines.push('ANSWER TONE 2100 Hz');
  if (t >= S.fsk[0]) lines.push('V.8  CM / JM');
  if (t >= S.bongs[0]) lines.push('LINE PROBE 150–3750 Hz');
  if (t >= S.data[0]) lines.push('CONNECT 28800/V34/LAPM');
  if (t >= S.data[0] + 0.12) lines.push('GET /as17-148-22727.jpg');
  if (t >= S.data[0] + 0.25) {
    const total = dl.total, got = Math.min(total, dl.got);
    const n = Math.round(24 * got / total);
    lines.push(`${'█'.repeat(n)}${'░'.repeat(24 - n)} ${fmt(got).padStart(7)} / ${fmt(total)}`);
  }
  g.font = font(500, 14, MONO); g.textAlign = 'left';
  const x = lay.extra.x, lhh = 21;
  lines.forEach((s, i) => {
    g.fillStyle = i === lines.length - 1 && Math.floor(t * 4) % 2 ? '#ffffff' : 'rgba(235,255,240,0.86)';
    g.fillText(s, u(x), u(lay.extra.y + 16 + i * lhh));
  });
}
// the scope: the soundtrack itself, 30 ms of it, across the square
function scope(t, music) {
  const { sq } = L, SR = music.sampleRate, A = music.L, B = music.R;
  const n = Math.round(0.03 * SR), c = Math.round(t * SR - n / 2);
  g.strokeStyle = 'rgba(210,255,225,0.9)'; g.lineWidth = Math.max(1, u(1.6));
  g.beginPath();
  for (let i = 0; i < n; i += 2) {
    const j = c + i, v = j >= 0 && j < A.length ? (A[j] + B[j]) * 0.5 : 0;
    const x = u(sq.x + 40 + (640 * i) / n), y = u(sq.y + 360 - v * 520);
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.fillStyle = 'rgba(210,255,225,0.35)';
  g.fillRect(u(sq.x + 40), u(sq.y + 360), u(640), Math.max(1, u(1)));
}

// generation 1: the bytes around the last flip
function hexdump(t, lay, rot, flips, fileBytes) {
  let i = -1;
  for (let j = 0; j < flips.length; j++) if (flips[j].t <= t) i = j;
  const bytes = rot.bytes || fileBytes;
  const f = i >= 0 ? flips[i] : null;
  const at = f ? f.off : 0;
  const rows = lay.mode === 'tall' ? 6 : 12;
  const base = Math.max(0, (at & ~15) - 16 * Math.floor(rows / 2));
  const x = lay.extra.x, y0 = lay.extra.y + 14, lhh = 18.5;
  g.font = font(500, 11.5, MONO); g.textAlign = 'left';
  const cw = g.measureText('0').width;
  const hot = new Set(flips.slice(0, i + 1).map((q) => q.off));
  for (let r = 0; r < rows; r++) {
    const off = base + r * 16;
    let s = off.toString(16).padStart(8, '0') + '  ';
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillText(s, u(x), u(y0 + r * lhh));
    for (let c = 0; c < 16; c++) {
      const p = off + c;
      if (p >= bytes.length) break;
      const xx = u(x) + cw * (10 + c * 3 + (c >= 8 ? 1 : 0));
      const isHot = f && p === f.off && t - f.t < 1.2;
      if (isHot) { g.fillStyle = f.kind === 'scan' ? '#ff3b3b' : '#ffd23b'; g.fillRect(xx - cw * 0.25, u(y0 + r * lhh - 12.5), cw * 2.5, u(16)); g.fillStyle = '#000'; }
      else g.fillStyle = hot.has(p) ? 'rgba(255,110,110,0.95)' : 'rgba(255,255,255,0.8)';
      g.fillText(hex2(bytes[p]), xx, u(y0 + r * lhh));
    }
  }
  if (f) {
    const was = bytes[f.off] ^ (1 << f.bit);
    const what = f.kind === 'scan' ? 'scan data' : f.kind === 'dqt' ? 'quantisation table' : 'restart marker';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`0x${f.off.toString(16)}  bit ${f.bit}  ${hex2(was)} → ${hex2(bytes[f.off])}  (${what})`, u(x), u(y0 + rows * lhh + 6));
  }
}

// generation 5: the frequency axis over the square, and the spectrum right now
function axis(t, lay, row, flo, fhi) {
  const { sq } = L;
  const y = sq.y - 10;
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = Math.max(1, u(1));
  g.font = font(500, 11, MONO); g.fillStyle = 'rgba(255,255,255,0.72)'; g.textAlign = 'center';
  for (const f of [500, 1000, 2000, 3000, 4000, 5000, 6000, 7000]) {
    const x = sq.x + (f - flo) / (fhi - flo) * 720;
    if (x < 0 || x > L.WW) continue;
    g.beginPath(); g.moveTo(u(x), u(y)); g.lineTo(u(x), u(y + 8)); g.stroke();
    g.fillText(f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, u(x), u(y - 5));
  }
  if (row && lay.mode === 'tall') {
    const h = Math.min(120, sq.y - 150), base = sq.y - 36;
    g.strokeStyle = 'rgba(160,220,255,0.85)'; g.lineWidth = Math.max(1, u(1.2));
    g.beginPath();
    for (let x = 0; x < row.length; x += 2) { const v = row[x] / 255; const px = u(x), py = u(base - v * h); if (x) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  }
}

// generation 4: a VCR's on-screen display
function osd(t, S) {
  const { sq } = L;
  g.font = font(700, 30, MONO); g.textAlign = 'left';
  const show = (s, x, y) => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(s, u(x + 2), u(y + 2)); g.fillStyle = '#f2f2f2'; g.fillText(s, u(x), u(y)); };
  if (t < GT[4] + 4 && Math.floor(t * 2) % 2 === 0) show('PLAY ▶', sq.x + 34, sq.y + 62);
  show('SP', sq.x + 720 - 84, sq.y + 62);
  const roll = S.rolls.find(([rt, d]) => t >= rt - 0.3 && t < rt + d + 0.4);
  if (roll) {
    show('TRACKING', sq.x + 34, sq.y + 690);
    const n = 1 + Math.floor(((t - roll[0] + 0.3) / (roll[1] + 0.7)) * 8);
    g.font = font(700, 22, MONO);
    show('■'.repeat(clamp(n, 1, 8)) + '□'.repeat(8 - clamp(n, 1, 8)), sq.x + 250, sq.y + 690);
  }
}

// the end of the file: its last bytes, and the marker that ends it
function eof(t, bytes, S) {
  const { sq } = L;
  const p = clamp((t - S.eof[0]) / (S.eof[1] - S.eof[0]), 0, 1);
  const n = bytes.length, rows = 4, base = n - rows * 16;
  g.font = font(500, 13, MONO); g.textAlign = 'left';
  const cw = g.measureText('0').width, x = u(sq.x + 60), y0 = u(sq.y + 540);
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - u(14), y0 - u(24), cw * 60 + u(28), u(rows * 21 + 20));
  for (let r = 0; r < rows; r++) {
    const off = base + r * 16;
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillText(off.toString(16).padStart(8, '0'), x, y0 + u(r * 21));
    for (let c = 0; c < 16; c++) {
      const q = off + c, last = q >= n - 2;
      if (q >= n || (q - base) / (rows * 16) > p * 1.3 + 0.2) continue;
      g.fillStyle = last ? '#ffffff' : 'rgba(255,255,255,0.85)';
      if (last) { g.fillStyle = '#6fb8ff'; g.fillRect(x + cw * (10 + c * 3) - cw * 0.2, y0 + u(r * 21) - u(14), cw * 2.4, u(18)); g.fillStyle = '#000'; }
      g.fillText(hex2(bytes[q]), x + cw * (10 + c * 3), y0 + u(r * 21));
    }
  }
  if (p > 0.5) { g.fillStyle = '#ffffff'; g.fillText('ff d9 · end of image', x, y0 + u(rows * 21 + 8)); }
}

// before the start: the play control (or how far the soundtrack has got) on the card
function control(tw, st) {
  const c = CARD.control(L);
  const x = u(c.x - c.w / 2), y = u(c.y - c.h / 2), w = u(c.w), h = u(c.h);
  g.textAlign = 'center';
  if (!st.ready) {
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, u(c.y - 2), w, u(4));
    g.fillStyle = '#f2f2f2'; g.fillRect(x, u(c.y - 2), w * clamp(st.progress, 0, 1), u(4));
    g.font = font(600, 11, MONO); g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`TUNING ${Math.round(st.progress * 100)}%`, u(c.x), u(c.y + 20));
    return;
  }
  const on = st.hover || Math.floor(tw * 1.2) % 2 === 0;
  g.fillStyle = on ? '#f2f2f2' : 'rgba(0,0,0,0)';
  g.strokeStyle = '#f2f2f2'; g.lineWidth = Math.max(1, u(2));
  g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
  g.font = font(700, 16, MONO); g.fillStyle = on ? '#060606' : '#f2f2f2';
  g.fillText(st.ended ? '▶  AGAIN' : '▶  PLAY', u(c.x), u(c.y + 6));
}

function begin(ctx, layoutL) { g = ctx; L = layoutL; k = L.k; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.W, L.H); g.textBaseline = 'alphabetic'; }

return { begin, layout, label, header, terminal, scope, hexdump, axis, osd, eof, control, LABELS };
})();
