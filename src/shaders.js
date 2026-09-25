/* ─────────────────────────────────────────────────────────────────────────
   shaders.js — the GLSL for every pass. Work-canvas passes read and write
   in texel space with y = 0 at the top of the picture; the final pass
   (SHOW) maps the screen onto the work canvas.
   ───────────────────────────────────────────────────────────────────────── */
var SHADERS = {};

// an RGBA picture (720 px square) into the work canvas, black around it
SHADERS.place = `
uniform sampler2D uImg; uniform vec4 uSq;
void main() {
  vec2 q = (floor(gl_FragCoord.xy) - uSq.xy) / uSq.z;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  o = vec4(texelFetch(uImg, ivec2(q * uSq.z), 0).rgb, 1.0);
}`;

// Pixel sorting by odd–even transposition: each pass compares neighbours (c, c+1) and
// exchanges them when out of order. Only pixels brighter than the threshold take part.
SHADERS.sort = `
uniform sampler2D uS; uniform vec2 uSize; uniform int uParity; uniform int uDir; uniform float uThr;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int c = uDir == 0 ? p.y : p.x;
  bool lead = ((c + uParity) & 1) == 0;
  ivec2 q = p + (uDir == 0 ? ivec2(0, lead ? 1 : -1) : ivec2(lead ? 1 : -1, 0));
  vec4 a = texelFetch(uS, p, 0);
  if (q.x < 0 || q.y < 0 || q.x >= int(uSize.x) || q.y >= int(uSize.y)) { o = a; return; }
  vec4 b = texelFetch(uS, q, 0);
  float la = luma(a.rgb), lb = luma(b.rgb);
  if (la < uThr || lb < uThr) { o = a; return; }
  if (lead) o = la > lb ? b : a; else o = lb > la ? b : a;
}`;

// Datamosh, one predicted frame: each 16×16 block copies itself from where its motion
// vector points in the previous frame. A few blocks are intra-coded from the new clip
// (the untouched Earth, slowly zooming in).
SHADERS.mosh = `
uniform sampler2D uS; uniform sampler2D uSrc; uniform vec2 uSize; uniform vec2 uC;
uniform float uZoom, uRot, uJit, uRefresh, uStep; uniform vec4 uSq; uniform vec2 uSrcXf;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 rel = vec2(p) - uSq.xy;
  if (rel.x < 0.0 || rel.y < 0.0 || rel.x >= uSq.z || rel.y >= uSq.z) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 mb = floor(vec2(p) / 16.0);
  vec2 d = mb * 16.0 + 8.0 - uC;
  vec2 v = uZoom * d + uRot * vec2(-d.y, d.x);
  if (hash3(vec3(mb, uStep)) < uJit) v += (vec2(hash3(vec3(mb, uStep + 17.0)), hash3(vec3(mb, uStep + 31.0))) - 0.5) * 40.0;
  ivec2 s = clamp(p - ivec2(round(v)), ivec2(0), ivec2(uSize) - 1);
  vec4 col = texelFetch(uS, s, 0);
  if (hash3(vec3(mb, uStep + 71.0)) < uRefresh) {
    vec2 r = vec2(p) + 0.5 - uC;
    float cs = cos(-uSrcXf.y), sn = sin(-uSrcXf.y);
    vec2 q = vec2(cs * r.x - sn * r.y, sn * r.x + cs * r.y) / uSrcXf.x + uC - uSq.xy;
    col = vec4(0.0, 0.0, 0.0, 1.0);
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < uSq.z && q.y < uSq.z) col = vec4(texelFetch(uSrc, ivec2(q), 0).rgb, 1.0);
  }
  o = col;
}`;

// Composite video: luma rings, chroma arrives late and soft, a ghost, line jitter,
// a tracking band, head-switching at the foot, the odd dropout.
SHADERS.analog = `
uniform sampler2D uS; uniform vec2 uSize; uniform float uFrame, uAmt, uTrack, uSeed;
vec3 px(float x, float y) { return texelFetch(uS, ivec2(clamp(vec2(x, y), vec2(0.0), uSize - 1.0)), 0).rgb; }
vec3 toYIQ(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRGB(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  float line = p.y, f2 = floor(uFrame * 0.5);
  float off = (hash(vec2(line, f2)) - 0.5) * 1.8 * uAmt;
  float trk = exp(-pow((line - uTrack) / 16.0, 2.0)) * uAmt;
  off += trk * (hash(vec2(line, uFrame + 7.0)) - 0.5) * 90.0;
  off += smoothstep(uSize.y - 20.0, uSize.y - 4.0, line) * (14.0 + 12.0 * hash(vec2(line, uFrame + 11.0)));
  float x = p.x - off;
  float y0 = luma(px(x, line)), yl = luma(px(x - 2.0, line)), yr = luma(px(x + 2.0, line));
  float Y = y0 + 0.5 * (y0 - 0.5 * (yl + yr));
  vec2 iq = vec2(0.0);
  for (int k = 0; k < 8; k++) iq += toYIQ(px(x - 5.0 - float(k) * 1.7, line)).yz;
  iq /= 8.0;
  Y += 0.06 * length(iq) * cos(3.14159 * (p.x + line + f2));
  Y += 0.11 * luma(px(x - 18.0, line));
  Y += (hash(p + f2 * 13.0) - 0.5) * 0.09 * uAmt;
  Y += trk * (hash(p + f2 * 3.0) - 0.4) * 0.8;
  if (hash(vec2(floor(line / 2.0), floor(uFrame / 3.0) + uSeed)) > 0.9982) Y = mix(Y, 1.0, step(hash(vec2(floor(p.x / 40.0), line)), 0.6));
  o = vec4(toRGB(vec3(Y, iq * 1.2)), 1.0);
}`;

// JPEG, one save, in five passes: colour + chroma subsampling; rows; columns + quantise;
// inverse columns; inverse rows + colour. The work canvas is 8-bit, so each save rounds too.
// without float targets the DCT's signed values are packed into 8 bits (coarser, still JPEG-like)
SHADERS.pack = `
uniform int uEnc;
vec3 enc(vec3 v) { return uEnc == 1 ? v / 8.0 + 0.5 : v; }
vec3 dec(vec3 c) { return uEnc == 1 ? (c - 0.5) * 8.0 : c; }
`;
SHADERS.jpegIn = SHADERS.pack + `
uniform sampler2D uS; uniform vec2 uSize; uniform ivec2 uShift;
void main() {
  ivec2 lim = ivec2(uSize) - 1;
  ivec2 q = clamp(ivec2(gl_FragCoord.xy) + uShift, ivec2(0), lim);
  vec3 c = texelFetch(uS, q, 0).rgb;
  ivec2 b = (q / 2) * 2;
  vec3 s = texelFetch(uS, b, 0).rgb + texelFetch(uS, min(b + ivec2(1, 0), lim), 0).rgb + texelFetch(uS, min(b + ivec2(0, 1), lim), 0).rgb + texelFetch(uS, min(b + ivec2(1, 1), lim), 0).rgb;
  s *= 0.25;
  o = vec4(enc(vec3(luma(c) - 0.5, dot(s, vec3(-0.168736, -0.331264, 0.5)), dot(s, vec3(0.5, -0.418688, -0.081312)))), 1.0);
}`;
SHADERS.jpegRow = SHADERS.pack + `
uniform sampler2D uS; uniform vec2 uSize; uniform float uC[64]; uniform int uInv; uniform vec4 uSq;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 rel = vec2(p) - uSq.xy;
  if (uInv == 1 && (rel.x < 0.0 || rel.y < 0.0 || rel.x >= uSq.z || rel.y >= uSq.z)) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  int u = p.x & 7, bx = p.x - u, w = int(uSize.x) - 1;
  vec3 s = vec3(0.0);
  for (int k = 0; k < 8; k++) s += (uInv == 1 ? uC[k * 8 + u] : uC[u * 8 + k]) * dec(texelFetch(uS, ivec2(min(bx + k, w), p.y), 0).rgb);
  if (uInv == 1) {
    float Y = s.x + 0.5;
    o = vec4(clamp(vec3(Y + 1.402 * s.z, Y - 0.344136 * s.y - 0.714136 * s.z, Y + 1.772 * s.y), 0.0, 1.0), 1.0);
  } else o = vec4(enc(s), 1.0);
}`;
SHADERS.jpegCol = SHADERS.pack + `
uniform sampler2D uS; uniform vec2 uSize; uniform float uC[64]; uniform int uInv;
uniform float uQY[64]; uniform float uQC[64]; uniform float uScale; uniform vec4 uGl; uniform float uSeed;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int v = p.y & 7, by = p.y - v, u = p.x & 7, h = int(uSize.y) - 1;
  vec3 s = vec3(0.0);
  for (int k = 0; k < 8; k++) s += (uInv == 1 ? uC[k * 8 + v] : uC[v * 8 + k]) * dec(texelFetch(uS, ivec2(p.x, min(by + k, h)), 0).rgb);
  if (uInv == 0) {
    int i = v * 8 + u;
    float qy = clamp(floor(uQY[i] * uScale + 0.5), 1.0, 255.0) / 255.0;
    float qc = clamp(floor(uQC[i] * uScale + 0.5), 1.0, 255.0) / 255.0;
    s = vec3(floor(s.x / qy + 0.5) * qy, floor(s.y / qc + 0.5) * qc, floor(s.z / qc + 0.5) * qc);
    vec2 blk = floor(vec2(p) / 8.0);
    float r = hash(blk + uSeed);
    if (r < uGl.x && i > 0) s *= -1.0;
    if (r > 1.0 - uGl.y && i == int(hash(blk + uSeed + 5.0) * 20.0) + 1) s += vec3(0.35, 0.18, -0.18) * sign(hash(blk + uSeed + 9.0) - 0.5);
    if (i == 0 && hash(blk + uSeed + 2.0) < uGl.z) s.x = -0.5;
  }
  o = vec4(enc(s), 1.0);
}`;

// whole 16×16 blocks taken from somewhere else
SHADERS.blocks = `
uniform sampler2D uS; uniform vec2 uSize; uniform float uP, uSeed;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 b = floor(vec2(p) / 16.0);
  ivec2 q = p;
  if (hash(b + uSeed) < uP) q += ivec2(floor((vec2(hash(b + uSeed + 1.3), hash(b + uSeed + 2.9)) - 0.5) * 10.0)) * 16;
  o = texelFetch(uS, clamp(q, ivec2(0), ivec2(uSize) - 1), 0);
}`;

// block means, one level of a reduction (uN × uN texels each)
SHADERS.avg = `
uniform sampler2D uS; uniform vec2 uOrigin; uniform int uN;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 s = vec3(0.0);
  for (int j = 0; j < 16; j++) { if (j >= uN) break; for (int i = 0; i < 16; i++) { if (i >= uN) break; s += texelFetch(uS, ivec2(uOrigin) + p * uN + ivec2(i, j), 0).rgb; } }
  o = vec4(s / float(uN * uN), 1.0);
}`;
SHADERS.up = `
uniform sampler2D uS; uniform vec2 uLS; uniform vec4 uSq;
void main() {
  vec2 q = (floor(gl_FragCoord.xy) - uSq.xy) / uSq.z;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  o = vec4(texelFetch(uS, ivec2(q * uLS), 0).rgb, 1.0);
}`;

// the spectrogram: newest row at the top of the square, older rows below
SHADERS.waterfall = `
uniform sampler2D uRing; uniform vec2 uSize; uniform float uHead, uRows, uTop, uFirst, uLeft;
vec3 cmap(float m) {
  vec3 a = vec3(0.008, 0.012, 0.045), b = vec3(0.03, 0.13, 0.44), c = vec3(0.12, 0.58, 0.92), d = vec3(0.88, 0.97, 1.0);
  return m < 0.35 ? mix(a, b, m / 0.35) : m < 0.7 ? mix(b, c, (m - 0.35) / 0.35) : mix(c, d, (m - 0.7) / 0.3);
}
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  float dy = p.y - uTop;
  float g = uHead - dy;
  if (dy < 0.0 || dy >= 720.0 || p.x < uLeft || p.x >= uLeft + 720.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (g < uFirst) { o = vec4(cmap(0.0), 1.0); return; }
  o = vec4(cmap(texelFetch(uRing, ivec2(int(p.x), int(mod(g, uRows))), 0).r), 1.0);
}`;

// the final pass, at screen resolution; every display-side effect lives here
SHADERS.show = `
const float TAU = 6.2831853;
uniform sampler2D uWork; uniform vec2 uWS; uniform vec2 uScr; uniform float uK;
uniform sampler2D uCard; uniform float uCardMix;
uniform sampler2D uDot; uniform vec2 uDotSize; uniform vec2 uDotE; uniform vec4 uDotV;
uniform vec4 uRect; uniform vec4 uRectC;
uniform vec4 uSplit; uniform vec4 uTear; uniform vec3 uBlock; uniform vec4 uMag; uniform float uRoll;
uniform vec4 uCRT; uniform float uPower; uniform float uSnow, uFade, uGrain, uT, uInvert; uniform vec2 uDecim;
vec3 work(vec2 wp) { return texelFetch(uWork, ivec2(clamp(floor(wp), vec2(0.0), uWS - 1.0)), 0).rgb; }
void main() {
  vec2 sp = vec2(gl_FragCoord.x, uScr.y - gl_FragCoord.y);
  vec2 uv = sp / uScr;
  float vis = 1.0, boost = 1.0;
  if (uCRT.x > 0.0) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + uCRT.x * vec2(c.y * c.y, c.x * c.x) * 0.22;
    uv = c * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) vis = 0.0;
  }
  if (uPower > 0.0) {
    float a = clamp(uPower / 0.55, 0.0, 1.0), b = clamp((uPower - 0.55) / 0.45, 0.0, 1.0);
    vec2 s = vec2(mix(1.0, 0.003, pow(b, 0.6)), mix(1.0, 0.004, pow(a, 0.7)));
    vec2 c = (uv - 0.5) / s;
    if (abs(c.x) > 0.5 || abs(c.y) > 0.5) vis = 0.0;
    uv = c + 0.5;
    boost = 1.0 + 2.5 * a * (1.0 - b * b);
  }
  vec2 wp = uv * uWS;
  if (uRoll != 0.0) { wp.y = mod(wp.y + uRoll, uWS.y + 30.0); if (wp.y > uWS.y) vis = 0.0; }
  if (uTear.x > 0.0 && (uTear.w <= uTear.z || (wp.y >= uTear.z && wp.y < uTear.w))) {
    float on = step(0.5, hash(vec2(floor(wp.y / 18.0), uTear.y)));
    wp.x += (hash(vec2(floor(wp.y / 3.0), uTear.y + 1.0)) - 0.5) * 2.0 * uTear.x * on;
  }
  if (uBlock.x > 0.0) {
    vec2 b = floor(wp / uBlock.z);
    if (hash(b + uBlock.y) < uBlock.x) wp += floor((vec2(hash(b + uBlock.y + 3.1), hash(b + uBlock.y + 7.7)) - 0.5) * 6.0) * uBlock.z;
  }
  if (uMag.w > 0.0) {
    vec2 d = wp - uMag.xy; float r = length(d);
    float a = uMag.z * exp(-r * r / (uMag.w * uMag.w));
    float cs = cos(a), sn = sin(a);
    wp = uMag.xy + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y) * (1.0 + 0.12 * abs(a));
  }
  if (uDecim.x > 1.0) wp.x = floor(wp.x / uDecim.x) * uDecim.x;
  vec3 col = vec3(work(wp + vec2(uSplit.x, 0.0)).r, work(wp).g, work(wp + uSplit.yz).b);
  vec2 sd = wp / uWS * uScr;
  if (uCardMix > 0.0) {
    vec3 cc = vec3(texture(uCard, (sd + vec2(uSplit.x * uK, 0.0)) / uScr).r, texture(uCard, sd / uScr).g, texture(uCard, (sd + uSplit.yz * uK) / uScr).b);
    col = mix(col, cc, uCardMix);
  }
  if (uDotV.w > 0.0) {
    vec2 q = uDotE + (sd - uDotV.xy) / uDotV.z;
    vec3 dc = vec3(0.0);
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < uDotSize.x && q.y < uDotSize.y) dc = texelFetch(uDot, ivec2(q), 0).rgb;
    col = mix(col, dc, uDotV.w);
  }
  if (uRectC.w > 0.0 && sd.x >= uRect.x && sd.y >= uRect.y && sd.x < uRect.x + uRect.z && sd.y < uRect.y + uRect.w) col = mix(col, uRectC.rgb, uRectC.w);
  if (uDecim.y > 0.0) col = floor(col * uDecim.y + 0.5) / uDecim.y;
  if (uInvert > 0.0) col = mix(col, 1.0 - col, uInvert);
  if (uCRT.y > 0.0) {
    float per = max(2.0, uK * 2.0);
    col *= mix(1.0, 0.6 + 0.4 * (0.5 + 0.5 * cos(sp.y * TAU / per)), uCRT.y);
    float tri = mod(gl_FragCoord.x, 3.0);
    vec3 m = tri < 1.0 ? vec3(1.0, 0.74, 0.74) : tri < 2.0 ? vec3(0.74, 1.0, 0.74) : vec3(0.74, 0.74, 1.0);
    col *= mix(vec3(1.0), m, uCRT.z);
    col += col * col * uCRT.w;
    vec2 c = uv - 0.5; col *= 1.0 - dot(c, c) * 1.1 * uCRT.x;
  }
  col *= vis * boost;
  // noise holds for a few frames: it still reads as grain and snow, and video encoders can keep up
  if (uSnow > 0.0) col = mix(col, vec3(hash(floor(sp / max(1.0, uK)) + fract(floor(uT * 15.0) * 0.2137) * 431.0)), uSnow);
  col += (hash(sp + fract(floor(uT * 12.0) * 0.1373) * 311.0) - 0.5) * uGrain;
  col *= 1.0 - uFade;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
