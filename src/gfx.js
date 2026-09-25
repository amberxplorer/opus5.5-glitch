/* ─────────────────────────────────────────────────────────────────────────
   gfx.js — a small multipass WebGL 2 layer (programs, render targets,
   full-screen passes) and the layout that ties the screen to the work canvas.

   All image processing happens on a "work canvas" in which the picture's
   square is always exactly 720 work pixels, whatever the screen: a pixel
   sort or a JPEG block is the same size on a phone as on a projector, and
   the 720 × 1280 video maps one work pixel to one screen pixel.
   ───────────────────────────────────────────────────────────────────────── */
var GFX = (function () {
'use strict';
let gl = null, canvas = null, hud = null, hctx = null, capture = false;
let floatOK = false;
const L = { W: 0, H: 0, cssW: 0, cssH: 0, dpr: 1, WW: 0, WH: 0, k: 1, sq: { x: 0, y: 0, s: 720 }, gen: 0 };
const SQ = 720;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 o;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error('shader: ' + log + '\n' + lines.slice(0, 4000));
  }
  return s;
}
function program(body) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + body));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
  }
  return { p, u };
}
function setU(P, name, v) {
  const u = P.u[name];
  if (!u) return;
  const l = u.loc;
  switch (u.type) {
    case gl.FLOAT: if (u.size > 1) gl.uniform1fv(l, v); else gl.uniform1f(l, v); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(l, v); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(l, v); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(l, v); break;
    case gl.INT: case gl.BOOL: if (u.size > 1) gl.uniform1iv(l, v); else gl.uniform1i(l, v); break;
    case gl.INT_VEC2: gl.uniform2iv(l, v); break;
    case gl.FLOAT_MAT3: gl.uniformMatrix3fv(l, false, v); break;
    default: break;
  }
}

function texture(w, h, opts) {
  opts = opts || {};
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const fl = opts.linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fl);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fl);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (opts.format === 'r8') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  else if (opts.float && floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return { tex, w, h, float: !!(opts.float && floatOK), format: opts.format || 'rgba' };
}
function target(w, h, opts) {
  const t = texture(w, h, opts);
  t.fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return t;
}
function free(t) {
  if (!t) return;
  if (t.fbo) gl.deleteFramebuffer(t.fbo);
  if (t.tex) gl.deleteTexture(t.tex);
}
// upload RGBA (or R8) rows into a texture
function upload(t, data, x, y, w, h) {
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (t.format === 'r8') gl.texSubImage2D(gl.TEXTURE_2D, 0, x || 0, y || 0, w || t.w, h || t.h, gl.RED, gl.UNSIGNED_BYTE, data);
  else gl.texSubImage2D(gl.TEXTURE_2D, 0, x || 0, y || 0, w || t.w, h || t.h, gl.RGBA, gl.UNSIGNED_BYTE, data);
}
function uploadCanvas(t, cv) {
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  t.w = cv.width; t.h = cv.height;
}

let tri = null;
// run a full-screen pass: P program, U uniforms, T {sampler name: texture}, out target (null = screen)
function pass(P, U, T, out, vp) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
  if (vp) gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  else if (out) gl.viewport(0, 0, out.w, out.h);
  else gl.viewport(0, 0, L.W, L.H);
  gl.useProgram(P.p);
  let unit = 0;
  for (const name in T) {
    const t = T[name];
    if (!t || !P.u[name]) continue;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(P.u[name].loc, unit);
    unit++;
  }
  for (const k in U) setU(P, k, U[k]);
  gl.bindVertexArray(tri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function clear(out, c) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
  gl.viewport(0, 0, out ? out.w : L.W, out ? out.h : L.H);
  gl.clearColor(c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
function read(t, x, y, w, h) {
  const px = new Uint8Array((w || 1) * (h || 1) * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  gl.readPixels(x, y, w || 1, h || 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return px;
}

function init(opts) {
  canvas = opts.canvas; hud = opts.hud; capture = !!opts.capture;
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: capture, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL 2 unavailable');
  floatOK = !!gl.getExtension('EXT_color_buffer_float') && !/[?&]nofloat\b/.test(location.search);   // ?nofloat tests the 8-bit path
  hctx = hud.getContext('2d');
  tri = gl.createVertexArray();
  gl.bindVertexArray(tri);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  layout();
}

// screen size, device pixels (bounded), and the work canvas
function layout() {
  const cssW = Math.max(1, window.innerWidth), cssH = Math.max(1, window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (!capture) { const budget = 3.2e6; if (cssW * cssH * dpr * dpr > budget) dpr = Math.sqrt(budget / (cssW * cssH)); }
  const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
  const sCss = Math.min(cssW, cssH);
  const WW = Math.round(cssW * SQ / sCss), WH = Math.round(cssH * SQ / sCss);
  const changed = W !== L.W || H !== L.H || WW !== L.WW || WH !== L.WH;
  Object.assign(L, { W, H, cssW, cssH, dpr, WW, WH, k: W / WW });
  L.sq = { x: Math.round((WW - SQ) / 2), y: Math.round((WH - SQ) / 2), s: SQ };
  for (const c of [canvas, hud]) {
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
  }
  if (changed) L.gen++;
  return changed;
}

return {
  init, layout, program, texture, target, free, upload, uploadCanvas, pass, clear, read,
  get gl() { return gl; }, get hud() { return hctx; }, get floatOK() { return floatOK; }, L, SQ,
};
})();
