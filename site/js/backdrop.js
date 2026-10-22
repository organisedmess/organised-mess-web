/* organisedmess.studio — backdrop
 *
 * One liquid, many organisms. A small simulation runs on the GPU as a
 * ping-pong texture; the display pass looks at it through a slowly moving
 * domain-warped noise field (the "liquid"), softens it, and lays the paper
 * tooth and film grain on top. Every system shares that pass, so the site
 * reads as one thing with a different organism underneath each visit.
 *
 * Systems (data-backdrop="…", or ?bg=… / #… to override; "random" picks one):
 *   life        Conway's Game of Life with a fading trail
 *   lenia       continuous Life (ring kernel) — soft creatures that crawl
 *   smoothlife  Rafler's SmoothLife — worm-like gliders that split and merge
 *   mnca        multi-neighbourhood CA — membranes and soap-film structure
 *   rd          Gray–Scott reaction–diffusion — coral / labyrinth growth
 *   cyclic      cyclic CA — states chasing each other into spirals
 *   bz          Belousov–Zhabotinsky — concentric waves and rotating fronts
 *   physarum    slime-mould agents laying trails that form vein networks
 *   ink         ink carried by a curl-noise flow, slowly fading
 *   bugs        Larger-than-Life — blobs that crawl and divide
 *   waves       a wave field tapped at random; rings interfere
 *   crystal     seeds grow into grains until the sheet fills, then dissolve
 *   flow        particles riding a curl-noise flow field, leaving streaks (Nature of Code)
 *   dla         diffusion-limited aggregation — random walkers freezing into dendrites
 *
 * data-blend="invert": the organism flips the sheet instead of inking it.
 * When an organism fills the sheet (per-system `full` threshold), or freezes, the whole page
 * flips to its inverse and the organism reseeds on the other colour; an empty sheet reseeds quietly.
 * data-lens: radius of the pointer lens that inverts what is under it (0.22; 0 = off).
 *
 * Shared data-* settings: data-color-a, data-color-b, data-speed, data-grain,
 * data-paper, data-warp, data-mouse-interaction, data-scroll-interaction.
 * rd also reads data-feed, data-kill.
 */
(function () {
	'use strict';

	var VERT = 'attribute vec2 aPosition; varying vec2 vUv; void main(){ vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }';

	var HASH = 'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }';
	var NOISE = [HASH,
		'float noise(vec2 p){',
		'  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
		'  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
		'}',
		'float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);',
		'  for (int i = 0; i < 5; i++) { v += a * noise(p); p = rot * p * 2.03 + 11.7; a *= 0.5; } return v; }'
	].join('\n');

	// paper + grain, shared by every system. `lum` 0 = colour A (light), 1 = colour B (dark)
	var FINISH = [
		'uniform vec3 uColA; uniform vec3 uColB; uniform float uGrain; uniform float uPaper; uniform float uGrainTime;',
		'vec4 finish(float lum, float mottle){',
		'  vec2 fp = gl_FragCoord.xy;',
		'  float tooth = noise(fp * 0.21 + 3.0) * 0.6 + noise(fp * 0.07 + 9.0) * 0.4;',
		'  float paper = ((tooth - 0.5) * 0.06 + (mottle - 0.5) * 0.09) * uPaper;',
		'  vec2 gp = fp * mat2(0.76, 0.65, -0.65, 0.76) + vec2(uGrainTime * 17.3, uGrainTime * 31.7);',
		'  float grain = (hash(gp) - 0.5) * 0.07 * uGrain;',
		'  lum = clamp(lum + paper + grain, 0.0, 1.0);',
		'  return vec4(mix(uColA, uColB, lum), 1.0);',
		'}'
	].join('\n');


	/* ---- warp pre-pass (quarter res): every slow noise field is computed here once per frame ----
	   A = (r.x, r.y, q.x, q.y)   B = (pools, liquid, lensNoise, mottle)   all 0..1 */
	var FRAG_WARP_A = ['precision highp float; varying vec2 vUv; uniform vec2 uRes; uniform float uTime;', NOISE,
		'void main(){',
		'  vec2 uv = vUv; float aspect = uRes.x / uRes.y;',
		'  vec2 p = vec2(uv.x * aspect, uv.y) * 1.6; float t = uTime;',
		'  vec2 q = vec2(fbm(p + t * 0.05), fbm(p + vec2(5.2, 1.3) - t * 0.04));',
		'  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.06), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.05));',
		'  gl_FragColor = vec4(r, q);',
		'}'].join('\n');
	var FRAG_WARP_B = ['precision highp float; varying vec2 vUv; uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uLens; uniform sampler2D uWarpA;', NOISE,
		'void main(){',
		'  vec2 uv = vUv; float aspect = uRes.x / uRes.y;',
		'  vec2 p = vec2(uv.x * aspect, uv.y) * 1.6; float t = uTime;',
		'  vec4 a = texture2D(uWarpA, uv); vec2 r = a.xy, q = a.zw;',
		'  float liquid = fbm(p + 2.2 * r);',
		'  float pools = smoothstep(0.32, 0.68, fbm(p * 0.55 + r * 0.9 + vec2(t * 0.012, -t * 0.009) + 31.0));',
		'  vec2 lp = (uv - uMouse) * vec2(aspect, 1.0) + (r - 0.5) * 0.6 * uLens;',
		'  float lensN = fbm(lp * 6.0 + q * 3.0 + t * 0.2);',
		'  float mottle = fbm(uv * uRes * 0.0035 + 3.0);',
		'  gl_FragColor = vec4(pools, liquid, lensN, mottle);',
		'}'].join('\n');

	/* ---- display: the state texture seen through liquid ------------------ */
	// each system supplies PAT: a GLSL expression turning the softened sample `s`
	// (vec4) into ink density 0..1
	function showShader(pat, rawink) {
		return [
			'precision highp float; varying vec2 vUv; uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uEnergy;',
			'uniform sampler2D uState; uniform sampler2D uPrev; uniform float uMix; uniform float uWarp; uniform vec2 uSoft; uniform float uInk; uniform float uInvert; uniform float uLens; uniform float uLensOn; uniform float uFlip; uniform float uMinC; uniform vec2 uCell; uniform float uRing; uniform sampler2D uWarpA; uniform sampler2D uWarpB;',
			NOISE, FINISH,
			// current and previous generation, crossfaded so steps never pop
			rawink || 'vec4 ink(vec4 c){ return c; }',
			'vec4 sim(vec2 w){ return mix(ink(texture2D(uPrev, w)), ink(texture2D(uState, w)), uMix); }',
			'void main(){',
			'  vec2 uv = vUv; float aspect = uRes.x / uRes.y;',
			'  vec4 wa = texture2D(uWarpA, uv); vec4 wb = texture2D(uWarpB, uv);',
			'  vec2 r = wa.xy, q = wa.zw;',
			'  vec2 w = uv + (r - 0.5) * uWarp + (q - 0.5) * uWarp * 0.5 + (uMouse - 0.5) * 0.03;',
			// 9-tap soften in sim texels so cells read as ink, not pixels
			'  vec2 e = uSoft;',
			'  vec4 s = sim(w) * 0.2;',
			'  s += (sim(w + vec2(e.x, 0.0)) + sim(w - vec2(e.x, 0.0)) + sim(w + vec2(0.0, e.y)) + sim(w - vec2(0.0, e.y))) * 0.125;',
			'  s += (sim(w + e) + sim(w - e) + sim(w + vec2(e.x, -e.y)) + sim(w - vec2(e.x, -e.y))) * 0.075;',
			// pads draw as round rings: an annulus around the centre of any pad cell within one cell of here
			'  if (uRing > 0.5) { float ring = 0.0; vec2 cc = floor(w / uCell) + 0.5;',
			'    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); float c = sim(w + o * uCell).a; if (c < 0.01) continue;',
			'      float d = length(w / uCell - (cc + o)); ring = max(ring, c * smoothstep(1.6, 1.15, d) * smoothstep(0.5, 0.85, d)); }',
			'    s.r = max(s.r * (1.0 - ring), ring); }',
			'  float pat = clamp(' + pat + ', 0.0, 1.0);',
			'  float base = smoothstep(-0.1, 1.05, 1.0 - uv.y) * 0.75 + 0.05;',
			'  float liquid = (wb.y - 0.5) * 0.14;',
			// invert mode: the sheet is pools of light and dark that drift, not a top-to-bottom gradient
			'  float pools = wb.x;',
			'  float sheet = uInvert > 0.5 ? mix(0.12, 0.78, pools) + liquid * 0.5 : base + liquid;',
			// invert: where the organism sits, the sheet flips (dark on the light half, light on the dark half)
			// thin marks (traces) need a floor on contrast where the sheet is mid-grey, else they vanish in the pools
			'  float inv = 1.0 - sheet; float gap = abs(inv - sheet);',
			'  if (gap < uMinC) inv = clamp(sheet + (sheet < 0.5 ? 1.0 : -1.0) * uMinC, 0.0, 1.0);',
			'  float shade = uInvert > 0.5 ? mix(sheet, inv, pat) : sheet + pat * uInk;',
			// pointer lens: a soft blob that inverts what is under it, its edge pulled by the liquid
			'  vec2 lp = (uv - uMouse) * vec2(aspect, 1.0) + (r - 0.5) * 0.6 * uLens;',
			'  float rad = uLens * (0.75 + 0.5 * wb.z);',
			'  float lens = pow(smoothstep(rad, 0.0, length(lp)), 1.6) * 0.9 * uLensOn;',
			'  shade = mix(shade, 1.0 - shade, lens);',
			// a full sheet resets by flipping: the page inverts and the organism starts again on the other colour
			'  shade = mix(shade, 1.0 - shade, uFlip);',
			'  gl_FragColor = finish(shade, wb.w);',
			'}'
		].join('\n');
	}

	/* ---- step shaders ------------------------------------------------------ */
	// every step shader gets: uState (previous), uTexel,
	// uSeed (>0 on the first step after a reset), uTime, uAspect
	var STEP_HEAD = 'precision highp float; varying vec2 vUv; uniform sampler2D uState; uniform vec2 uTexel; uniform float uSeed; uniform float uTime; uniform float uAspect;\n' + NOISE +
		'\nvec4 S(vec2 o){ return texture2D(uState, fract(vUv + o * uTexel)); }\n' +
				// blobs(n, radius px, probability): random soft discs on a jittered grid, for seeding
		'float blobs(vec2 n, float rpx, float prob, float salt){ vec2 cell = floor(vUv * n); vec2 ctr = (cell + 0.5 + (vec2(hash(cell + salt), hash(cell + salt + 3.1)) - 0.5) * 0.5) / n; float on = step(1.0 - prob, hash(cell + 7.7 + salt)); vec2 px = (vUv - ctr) / uTexel; return on * smoothstep(1.0, 0.6, length(px) / rpx); }\n';

	// Life: R = alive, G = trail
	var STEP_LIFE = STEP_HEAD + [
		'float cell(vec2 o){ return step(0.5, S(o).r); }',
		'void main(){',
		'  vec4 c = S(vec2(0.0)); float a = step(0.5, c.r);',
		'  float n = cell(vec2(-1,-1)) + cell(vec2(0,-1)) + cell(vec2(1,-1)) + cell(vec2(-1,0)) + cell(vec2(1,0)) + cell(vec2(-1,1)) + cell(vec2(0,1)) + cell(vec2(1,1));',
		'  float na = (a > 0.5) ? ((n > 1.5 && n < 3.5) ? 1.0 : 0.0) : ((n > 2.5 && n < 3.5) ? 1.0 : 0.0);',
		'  if (uSeed > 0.0) na = step(0.88, hash(floor(vUv / uTexel) + uSeed));',
		'  gl_FragColor = vec4(na, max(na, c.g * 0.9), 0.0, 1.0);',
		'}'
	].join('\n');

	// Lenia: R = state. ring kernel R=9
	var STEP_LENIA = STEP_HEAD + [
		'uniform float uKsum; const int R = 9;',
		'void main(){',
		'  float u = 0.0;',
		'  for (int y = -R; y <= R; y++) for (int x = -R; x <= R; x++) {',
		'    float r = length(vec2(float(x), float(y))) / float(R); if (r > 1.0) continue;',
		'    u += exp(-pow((r - 0.5) / 0.15, 2.0) * 0.5) * S(vec2(float(x), float(y))).r;',
		'  }',
		'  u /= uKsum;',
		'  float a = S(vec2(0.0)).r;',
		'  float g = 2.0 * exp(-pow((u - 0.15) / 0.017, 2.0) * 0.5) - 1.0;',
		'  float na = clamp(a + 0.12 * g, 0.0, 1.0);',
		'  if (uSeed > 0.0) na = max(na, blobs(vec2(6.0, 4.0), 22.0, 0.7, uSeed) * (0.35 + 0.65 * hash(floor(vUv / uTexel / 3.0) + uSeed)));',
		'  gl_FragColor = vec4(na, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// SmoothLife (Rafler): inner disc ri=3 (m), outer ring 3..9 (n)
	var STEP_SMOOTHLIFE = STEP_HEAD + [
		'const int R = 9;',
		'float sig(float x, float a, float e){ return 1.0 / (1.0 + exp(-(x - a) * 4.0 / e)); }',
		'float sigN(float x, float a, float b){ return sig(x, a, 0.028) * (1.0 - sig(x, b, 0.028)); }',
		'float sigM(float x, float y, float m){ return mix(x, y, sig(m, 0.5, 0.147)); }',
		'void main(){',
		'  float m = 0.0, n = 0.0, mw = 0.0, nw = 0.0;',
		'  for (int y = -R; y <= R; y++) for (int x = -R; x <= R; x++) {',
		'    float r = length(vec2(float(x), float(y))); if (r > float(R) + 0.5) continue;',
		'    float v = S(vec2(float(x), float(y))).r;',
		'    float wi = clamp(3.5 - r, 0.0, 1.0);',           // inner disc, soft edge
		'    float wo = clamp(r - 2.5, 0.0, 1.0) * clamp(float(R) + 0.5 - r, 0.0, 1.0);',
		'    m += v * wi; mw += wi; n += v * wo; nw += wo;',
		'  }',
		'  m /= mw; n /= nw;',
		'  float a = S(vec2(0.0)).r;',
		'  float s = sigN(n, sigM(0.278, 0.267, m), sigM(0.365, 0.445, m));',
		'  float na = clamp(a + 0.25 * (2.0 * s - 1.0), 0.0, 1.0);',
		'  if (uSeed > 0.0) na = max(na, blobs(vec2(7.0, 5.0), 14.0, 0.75, uSeed) * (0.5 + 0.5 * hash(floor(vUv / uTexel / 4.0) + uSeed)));',
		'  gl_FragColor = vec4(na, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// Multi-neighbourhood CA: two rings vote on a continuous state
	var STEP_MNCA = STEP_HEAD + [
		'const int R = 7;',
		'void main(){',
		'  float n1 = 0.0, w1 = 0.0, n2 = 0.0, w2 = 0.0;',
		'  for (int y = -R; y <= R; y++) for (int x = -R; x <= R; x++) {',
		'    float r = length(vec2(float(x), float(y))); if (r > float(R) + 0.5) continue;',
		'    float v = S(vec2(float(x), float(y))).r;',
		'    float a1 = clamp(3.5 - r, 0.0, 1.0) * clamp(r - 0.5, 0.0, 1.0);',      // 1..3
		'    float a2 = clamp(r - 3.5, 0.0, 1.0);',                                    // 4..7
		'    n1 += v * a1; w1 += a1; n2 += v * a2; w2 += a2;',
		'  }',
		'  n1 /= w1; n2 /= w2;',
		'  float a = S(vec2(0.0)).r;',
		'  float d = 0.0;',
		'  if (n1 >= 0.210 && n1 <= 0.220) d += 1.0;',
		'  if (n1 >= 0.350 && n1 <= 0.500) d -= 1.0;',
		'  if (n1 >= 0.750 && n1 <= 0.850) d -= 1.0;',
		'  if (n2 >= 0.100 && n2 <= 0.280) d -= 1.0;',
		'  if (n2 >= 0.430 && n2 <= 0.550) d += 1.0;',
		'  if (n2 >= 0.120 && n2 <= 0.150) d += 1.0;',
		'  if (n2 >= 0.000 && n2 <= 0.020) d -= 1.0;',
		'  if (n1 >= 0.580 && n1 <= 0.640) d += 1.0;',
		'  float na = clamp(a + 0.08 * d, 0.0, 1.0);',
		'  if (uSeed > 0.0) na = hash(floor(vUv / uTexel) + uSeed) * step(0.52, noise(vUv * vec2(uAspect, 1.0) * 5.0 + uSeed));',
		'  gl_FragColor = vec4(na, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// Gray–Scott: R = A, G = B
	var STEP_RD = STEP_HEAD + [
		'uniform float uFeed; uniform float uKill;',
		'void main(){',
		'  vec2 c = S(vec2(0.0)).rg;',
		'  vec2 lap = (S(vec2(-1,0)).rg + S(vec2(1,0)).rg + S(vec2(0,-1)).rg + S(vec2(0,1)).rg) * 0.2',
		'           + (S(vec2(-1,-1)).rg + S(vec2(1,-1)).rg + S(vec2(-1,1)).rg + S(vec2(1,1)).rg) * 0.05 - c;',
		'  float a = c.r, b = c.g, abb = a * b * b;',
		'  float na = a + (0.21 * lap.r - abb + uFeed * (1.0 - a));',
		'  float nb = b + (0.105 * lap.g + abb - (uKill + uFeed) * b);',
		'  if (uSeed > 0.0) { na = 1.0; nb = blobs(vec2(22.0, 14.0), 5.0, 0.08, uSeed) * 0.9; }',
		'  gl_FragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);',
		'}'
	].join('\n');

	// Cyclic CA: R = state k/N, advances when a neighbour holds k+1
	var STEP_CYCLIC = STEP_HEAD + [
		'const float N = 12.0;',
		'float st(vec2 o){ return floor(S(o).r * N + 0.5); }',
		'void main(){',
		'  float k = st(vec2(0.0)); float nk = mod(k + 1.0, N);',
		'  float hit = 0.0;',
		'  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {',
		'    if (x == 0 && y == 0) continue; if (x * x + y * y > 5) continue;',
		'    hit += step(0.5, 1.0 - abs(st(vec2(float(x), float(y))) - nk));',
		'  }',
		'  float o = hit >= 3.0 ? nk : k;',
		'  if (uSeed > 0.0) o = floor(hash(floor(vUv / uTexel) + uSeed) * N);',
		'  gl_FragColor = vec4(o / N, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// Belousov–Zhabotinsky (Turner's 3-reagent CA): RGB = a, b, c
	var STEP_BZ = STEP_HEAD + [
		'void main(){',
		'  vec3 s = vec3(0.0);',
		'  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += S(vec2(float(x), float(y))).rgb;',
		'  s /= 9.0;',
		'  float a = s.r, b = s.g, c = s.b;',
		'  float na = clamp(a + a * (1.2 * b - 1.0 * c), 0.0, 1.0);',
		'  float nb = clamp(b + b * (1.0 * c - 1.2 * a), 0.0, 1.0);',
		'  float nc = clamp(c + c * (1.0 * a - 1.0 * b), 0.0, 1.0);',
		'  na = max(na, 0.002); nb = max(nb, 0.002); nc = max(nc, 0.002);',
		'  if (uSeed > 0.0) { vec2 id = floor(vUv / uTexel); vec2 q = vec2(vUv.x * uAspect, vUv.y) * 5.0 + uSeed; na = hash(id + uSeed) * noise(q); nb = hash(id + uSeed + 1.0) * noise(q + 7.0); nc = hash(id + uSeed + 2.0) * noise(q + 13.0); }',
		'  gl_FragColor = vec4(na, nb, nc, 1.0);',
		'}'
	].join('\n');

	// Ink advected by a curl-noise flow: R = density
	var STEP_INK = STEP_HEAD + [
		'vec2 curl(vec2 p){ float e = 0.02;',
		'  float n1 = fbm(p + vec2(0.0, e)), n2 = fbm(p - vec2(0.0, e)), n3 = fbm(p + vec2(e, 0.0)), n4 = fbm(p - vec2(e, 0.0));',
		'  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e); }',
		'void main(){',
		'  vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.2 + uTime * 0.03;',
		'  vec2 v = curl(p) * 0.0022;',
		'  float d = texture2D(uState, fract(vUv - v * vec2(1.0 / uAspect, 1.0))).r * 0.9985;',
		// a new drop lands now and then
		'  float slot = floor(uTime / 2.5); float drop = step(0.5, hash(vec2(slot, 3.0))) * step(fract(uTime / 2.5) * 75.0, 1.0);',
		'  d += drop * blobs(vec2(5.0, 3.0), 12.0, 0.1, slot) * 0.9;',
		'  if (uSeed > 0.0) d = blobs(vec2(5.0, 3.0), 16.0, 0.6, uSeed) * 0.9;',
		'  gl_FragColor = vec4(clamp(d, 0.0, 1.0), 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// Physarum trail map: diffuse + decay. Deposits are drawn as points by the agent pass.
	var STEP_PHYS_TRAIL = STEP_HEAD + [
		'void main(){',
		'  float s = 0.0;',
		'  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += S(vec2(float(x), float(y))).r;',
		'  float d = (s / 9.0) * 0.96;',
		'  if (uSeed > 0.0) d = 0.0;',
		'  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');
	// agents: RGBA float = x, y, heading, unused
	var PHYS_AGENT = [
		'precision highp float; varying vec2 vUv; uniform sampler2D uAgents; uniform sampler2D uTrail; uniform float uSeed; uniform float uAspect; uniform vec2 uTexel;',
		HASH,
		'float tr(vec2 p){ return texture2D(uTrail, fract(p)).r; }',
		'void main(){',
		'  vec4 a = texture2D(uAgents, vUv);',
		'  if (uSeed > 0.0) { a = vec4(hash(vUv + uSeed), hash(vUv + uSeed + 1.0), hash(vUv + uSeed + 2.0) * 6.2832, 0.0);',
		'    vec2 c = vec2(0.5) + (vec2(a.x, a.y) - 0.5) * vec2(0.7, 0.8); a.xy = c; }',
		'  float h = a.z; float sa = 0.5; float sd = 9.0 * uTexel.y; float step_ = 1.1 * uTexel.y;',
		'  vec2 pos = a.xy;',
		'  vec2 fw = vec2(cos(h) / uAspect, sin(h)); vec2 lf = vec2(cos(h + sa) / uAspect, sin(h + sa)); vec2 rt = vec2(cos(h - sa) / uAspect, sin(h - sa));',
		'  float f = tr(pos + fw * sd), l = tr(pos + lf * sd), r = tr(pos + rt * sd);',
		'  float rnd = hash(pos * 700.0 + h);',
		'  if (f > l && f > r) {} else if (f < l && f < r) h += (rnd < 0.5 ? 0.4 : -0.4); else if (l > r) h += 0.4; else if (r > l) h -= 0.4;',
		'  pos += vec2(cos(h) / uAspect, sin(h)) * step_;',
		'  pos = fract(pos);',
		'  gl_FragColor = vec4(pos, h, 1.0);',
		'}'
	].join('\n');
	var PHYS_DEPOSIT_VERT = 'attribute float aIndex; uniform sampler2D uAgents; uniform float uN; void main(){ float i = aIndex; vec2 uv = (vec2(mod(i, uN), floor(i / uN)) + 0.5) / uN; vec4 a = texture2D(uAgents, uv); gl_Position = a.w > 0.5 ? vec4(a.xy * 2.0 - 1.0, 0.0, 1.0) : vec4(3.0, 3.0, 0.0, 1.0); gl_PointSize = 1.0; }';
	var PHYS_DEPOSIT_FRAG = 'precision mediump float; uniform float uDep; void main(){ gl_FragColor = vec4(uDep, 0.0, 0.0, 0.0); }';

	// Flow field (Nature of Code ch. 6): particles ride a curl-noise field and leave streaks
	var FLOW_AGENT = [
		'precision highp float; varying vec2 vUv; uniform sampler2D uAgents; uniform sampler2D uTrail; uniform float uSeed; uniform float uAspect; uniform vec2 uTexel; uniform float uTime;',
		NOISE,
		'vec2 curl(vec2 p){ float e = 0.02; float n1 = fbm(p + vec2(0.0, e)), n2 = fbm(p - vec2(0.0, e)), n3 = fbm(p + vec2(e, 0.0)), n4 = fbm(p - vec2(e, 0.0)); return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e); }',
		'void main(){',
		'  vec4 a = texture2D(uAgents, vUv);',
		'  float life = a.z;',
		'  if (uSeed > 0.0 || life <= 0.0) { a = vec4(hash(vUv + uSeed + uTime), hash(vUv + uSeed + uTime + 1.0), 0.5 + hash(vUv + 2.0 + uTime), 1.0); life = a.z; }',
		'  vec2 p = vec2(a.x * uAspect, a.y) * 1.8 + uTime * 0.02;',
		'  vec2 v = curl(p);',
		'  vec2 pos = a.xy + v * vec2(1.0 / uAspect, 1.0) * 0.0016;',
		'  pos = fract(pos);',
		'  gl_FragColor = vec4(pos, life - 0.0015, 1.0);',
		'}'
	].join('\n');
	var STEP_FLOW_TRAIL = STEP_HEAD + [
		'void main(){',
		'  float d = S(vec2(0.0)).r * 0.982;',
		'  if (uSeed > 0.0) d = 0.0;',
		'  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);',
		'}'
	].join('\n');

	// Diffusion-limited aggregation (Nature of Code, random walkers): walkers drift until they touch the aggregate, then stick
	var DLA_AGENT = [
		'precision highp float; varying vec2 vUv; uniform sampler2D uAgents; uniform sampler2D uTrail; uniform float uSeed; uniform float uAspect; uniform vec2 uTexel; uniform float uTime;',
		HASH,
		'float tr(vec2 p){ return texture2D(uTrail, fract(p)).r; }',
		'void main(){',
		'  vec4 a = texture2D(uAgents, vUv);',
		'  if (uSeed > 0.0 || a.w > 0.5) { a = vec4(hash(vUv + uSeed + uTime), hash(vUv + uSeed + uTime + 1.0), 0.0, 0.0); }',
		'  vec2 pos = a.xy;',
		'  float r1 = hash(pos * 913.0 + uTime), r2 = hash(pos * 571.0 + uTime + 3.0);',
		'  pos += (vec2(r1, r2) - 0.5) * uTexel * 2.8;',
		'  pos = fract(pos);',
		'  float n = max(max(tr(pos + vec2(uTexel.x, 0.0)), tr(pos - vec2(uTexel.x, 0.0))), max(tr(pos + vec2(0.0, uTexel.y)), tr(pos - vec2(0.0, uTexel.y))));',
		'  float stuck = step(0.5, n);',
		'  gl_FragColor = vec4(pos, 0.0, stuck);',
		'}'
	].join('\n');
	var STEP_DLA_TRAIL = STEP_HEAD + [
		'void main(){',
		'  vec4 c = S(vec2(0.0));',
		'  float d = min(c.r, 1.0);',
		'  float age = 0.0;',
		'  if (uSeed > 0.0) { d = blobs(vec2(9.0, 5.0), 1.2, 0.5, uSeed); age = 0.0; }',
		'  gl_FragColor = vec4(d, age, 0.0, 1.0);',
		'}'
	].join('\n');


	// Larger-than-Life ("Bugs", Evans): range-5 outer-totalistic — blobs that crawl and divide
	var STEP_BUGS = STEP_HEAD + [
		'const int R = 5;',
		'void main(){',
		'  float n = 0.0;',
		'  for (int y = -R; y <= R; y++) for (int x = -R; x <= R; x++) n += step(0.5, S(vec2(float(x), float(y))).r);',
		'  float a = step(0.5, S(vec2(0.0)).r);',
		'  float na = a > 0.5 ? step(34.0, n) * step(n, 58.0) : step(34.0, n) * step(n, 45.0);',
		'  if (uSeed > 0.0) na = step(0.5, hash(floor(vUv / uTexel) + uSeed)) * step(0.5, blobs(vec2(6.0, 4.0), 14.0, 0.6, uSeed));',
		'  gl_FragColor = vec4(na, max(na, S(vec2(0.0)).g * 0.85), 0.0, 1.0);',
		'}'
	].join('\n');

	// Wave field: R = height, G = previous height. Random taps send rings that interfere.
	var STEP_WAVES = STEP_HEAD + [
		'void main(){',
		'  vec2 c = S(vec2(0.0)).rg;',
		'  float lap = S(vec2(-1,0)).r + S(vec2(1,0)).r + S(vec2(0,-1)).r + S(vec2(0,1)).r - 4.0 * c.r;',
		'  float h = (2.0 * c.r - c.g + 0.25 * lap) * 0.998;',
		'  float slot = floor(uTime / 1.2); float tap = step(0.25, hash(vec2(slot, 9.0))) * step(fract(uTime / 1.2) * 36.0, 1.0);',
		'  h += tap * blobs(vec2(7.0, 4.0), 5.0, 0.07, slot) * 3.0;',
		'  if (uSeed > 0.0) { h = blobs(vec2(7.0, 4.0), 5.0, 0.25, uSeed) * 3.0; c.r = h; }',
		'  gl_FragColor = vec4(h, c.r, 0.0, 1.0);',
		'}'
	].join('\n');

	// Crystal growth: seeds spread into empty cells; when the sheet fills it dissolves and reseeds
	// R = occupied (0/1 with grain id in G), B = age
	var STEP_CRYSTAL = STEP_HEAD + [
		'void main(){',
		'  vec4 c = S(vec2(0.0));',
		'  vec2 id = floor(vUv / uTexel);',
		'  float occ = c.r, grain = c.g, age = c.b;',
		'  if (occ < 0.5) {',
		'    float best = 0.0; float gid = 0.0;',
		'    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {',
		'      if (x == 0 && y == 0) continue;',
		'      vec4 nb = S(vec2(float(x), float(y)));',
		'      float w = nb.r * (x * x + y * y == 1 ? 1.0 : 0.55) * (0.6 + 0.4 * hash(id + vec2(float(x), float(y)) + uTime));',
		'      if (w > best) { best = w; gid = nb.g; }',
		'    }',
		'    if (best > 0.3 && hash(id + uTime * 7.0) < 0.3) { occ = 1.0; grain = gid; age = 0.0; }',
		'  } else { age = min(age + 0.0025, 1.0); }',
		'  if (uSeed > 0.0 || (occ < 0.5 && hash(id + uTime * 3.0 + 1.0) < 0.0000004)) { float sd = step(0.9995, hash(id + uSeed + uTime)); if (uSeed > 0.0 && sd > 0.5 || uSeed <= 0.0) { occ = 1.0; grain = hash(id + uSeed + 2.0); age = 0.0; } }',
		'  gl_FragColor = vec4(occ, grain, age, 1.0);',
		'}'
	].join('\n');

	function coverageShader(pat, rawink) {
		return ['precision highp float; varying vec2 vUv; uniform sampler2D uState; uniform vec2 uSoft;',
			rawink || 'vec4 ink(vec4 c){ return c; }',
			'vec4 sim(vec2 w){ return ink(texture2D(uState, w)); }',
			'void main(){ vec4 s = sim(vUv); float pat = clamp(' + pat + ', 0.0, 1.0); gl_FragColor = vec4(pat, 0.0, 0.0, 1.0); }'].join('\n');
	}


	/* ---- Router: our own system. An autorouter that never finishes. --------------
	   Float texture, per layer a pair of channels: (type + age, dir + travel)
	     type 0 empty · 1 trace · 2 pad · 3 via · 4 head · 5 keep-out (array gaps) · 7 array pad
	   age 0..1 (then the cell lifts off)
	     dir 0..7 (E, NE, N, NW, W, SW, S, SE)                    travel 0..1 (head length so far)
	   Layer 0 lives in RG; layer 1 (uLayers) in BA; the signal variant uses B for the pulse. */
	var STEP_ROUTER = STEP_HEAD + [
		'uniform float uGen; uniform float uOrtho; uniform float uSignal; uniform float uLayers; uniform float uSpawn; uniform float uAgeRate; uniform float uTurn; uniform float uMaxLen; uniform float uIc; uniform float uIcBlock;',
		// a hash for integer cell ids that stays uniform down to 1e-5 (every intermediate stays small, so fract() keeps its precision)
		'float hashi(vec2 id, float k){',
		'  float a = fract(id.x * 0.1031 + 0.17), b = fract(id.y * 0.1031 + 0.31), c = fract(k * 0.0137 + 0.59);',
		'  for (int i = 0; i < 4; i++) { a = fract((a + b) * (c + 1.3) * 1.7 + 0.5); b = fract((b + c) * (a + 1.1) * 2.3 + 0.2); c = fract((c + a) * (b + 1.9) * 1.3 + 0.7); }',
		'  return a; }',
		'vec2 OFF(int k){ if (k == 0) return vec2(1.0, 0.0); if (k == 1) return vec2(1.0, 1.0); if (k == 2) return vec2(0.0, 1.0); if (k == 3) return vec2(-1.0, 1.0); if (k == 4) return vec2(-1.0, 0.0); if (k == 5) return vec2(-1.0, -1.0); if (k == 6) return vec2(0.0, -1.0); return vec2(1.0, -1.0); }',
		'vec2 Lr(vec2 o, int L){ vec4 c = S(o); return L == 0 ? c.rg : c.ba; }',
		'float typ(vec2 v){ return floor(v.x + 0.001); }',
		'float ageOf(vec2 v){ return v.x - floor(v.x + 0.001); }',
		'int dirOf(vec2 v){ return int(floor(v.y + 0.001)); }',
		'float travOf(vec2 v){ return v.y - floor(v.y + 0.001); }',
		// every cell around `at` (relative to me) is empty on this layer, ignoring `except`
		'bool clear8(vec2 at, vec2 except, int L){',
		'  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {',
		'    if (x == 0 && y == 0) continue; vec2 o = at + vec2(float(x), float(y));',
		'    if (abs(o.x - except.x) < 0.5 && abs(o.y - except.y) < 0.5) continue;',
		'    if (typ(Lr(o, L)) > 0.5) return false;',
		'  } return true; }',
		'bool clear2(int L){ for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) { if (typ(Lr(vec2(float(x), float(y)), L)) > 0.5) return false; } return true; }',
		// room ahead and to the sides of `at` when travelling in direction `dv` (the trail behind is ours)
		'bool clearFwd(vec2 at, vec2 dv, int L){',
		'  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {',
		'    vec2 d = vec2(float(x), float(y)); if (x == 0 && y == 0) continue;',
		'    if (dot(d, dv) < -0.01) continue;',
		'    if (x * x <= 1 && y * y <= 1 && dot(d, dv) < 0.01) continue;',   // immediate sides are allowed only at radius 2
		'    if (typ(Lr(at + d, L)) > 0.5) return false;',
		'  } return true; }',
		// Pad arrays: each block of the board may hold one per epoch — a grid of rings that traces fan out from.
		// Geometry and timing are hashed from the block id, so every cell can tell on its own whether it is part of one.
		'vec3 icAt(vec2 id, int L){',
		'  if (uIc <= 0.0) return vec3(0.0);',
		'  float BS = uIcBlock; vec2 b = floor(id / BS); float salt = float(L) * 17.0;',
		'  float E = 0.9 / uAgeRate; float u = (uGen + hashi(b, 71.0 + salt) * E) / E; float e = floor(u); float age = fract(u);',
		'  if (age > 0.97 || hashi(b, 80.0 + salt + e * 0.37) > uIc) return vec3(0.0);',
		'  bool vert = hashi(b, 83.0 + salt + e * 0.41) < 0.5;',
		// a pad array: cols × rows of rings at a 4-cell pitch; the cells between them are keep-out
		'  float cols = 1.0 + floor(hashi(b, 85.0 + salt + e * 0.43) * 3.0), rows = 3.0 + floor(hashi(b, 87.0 + salt + e * 0.47) * 6.0);',
		'  vec2 n = vert ? vec2(cols, rows) : vec2(rows, cols); vec2 dim = (n - 1.0) * 4.0 + 1.0;',
		'  vec2 p0 = floor(vec2(4.0) + vec2(hashi(b, 89.0 + salt + e * 0.53), hashi(b, 91.0 + salt + e * 0.59)) * (BS - 8.0 - dim));',
		'  vec2 l = id - b * BS - p0;',
		'  if (l.x < 0.0 || l.y < 0.0 || l.x >= dim.x || l.y >= dim.y) return vec3(0.0);',
		'  if (mod(l.x, 4.0) > 0.5 || mod(l.y, 4.0) > 0.5) return vec3(5.0, age, 0.0);',
		// outer pads point away from the array (a single row alternates sides); inner pads just sit there
		'  float d = 8.0;',
		'  if (vert) { if (n.x < 1.5) d = mod(l.y / 4.0, 2.0) < 0.5 ? 4.0 : 0.0; else if (l.x < 0.5) d = 4.0; else if (l.x > dim.x - 1.5) d = 0.0; }',
		'  else { if (n.y < 1.5) d = mod(l.x / 4.0, 2.0) < 0.5 ? 6.0 : 2.0; else if (l.y < 0.5) d = 6.0; else if (l.y > dim.y - 1.5) d = 2.0; }',
		'  return vec3(7.0, age, d);',
		'  return vec3(0.0);',
		'}',
		'vec2 route(int L){',
		'  vec2 me = Lr(vec2(0.0), L); float t = typ(me);',
		'  vec2 id = floor(vUv / uTexel); float salt = float(L) * 17.0;',
		'  vec3 ic = icAt(id, L); if (ic.x > 0.5) return vec2(ic.x + ic.y, ic.z);',
		'  if (t > 3.5) {',                                   // head: advance or terminate
		'    int d = dirOf(me); vec2 o = OFF(d); float tr = travOf(me);',
		'    if (tr >= 0.95) return vec2(2.001, float(d));',
		'    if (typ(Lr(o, L)) < 0.5 && clearFwd(o, o, L)) return vec2(1.0, float(d));',
		// blocked: jog around it (try the two neighbouring directions, random order); give up only when both are blocked
		'    float stp = uOrtho > 0.5 ? 2.0 : 1.0; float sgn = hashi(id, salt + uGen * 0.53) < 0.5 ? 1.0 : -1.0;',
		'    for (int i = 0; i < 2; i++) {',
		'      int nd = int(mod(float(d) + sgn * stp + 8.0, 8.0)); vec2 no = OFF(nd);',
		'      if (typ(Lr(no, L)) < 0.5 && clearFwd(no, no, L)) return vec2(4.0, float(nd) + tr + 0.02);',
		'      sgn = -sgn;',
		'    }',
		'    return vec2(3.0, float(d));',
		'  }',
		'  if (t > 0.5) {',                                   // trace / pad / via: age, then lift off
		'    float a = ageOf(me) + uAgeRate * (0.6 + 0.8 * hashi(floor(id / 6.0), salt));',
		'    if (a > 0.97) return vec2(0.0);',
		'    return vec2(t + a, me.y);',
		'  }',
		// empty: a head arriving?
		'  for (int k = 0; k < 8; k++) {',
		'    vec2 o = OFF(k); vec2 n = Lr(o, L);',
		'    if (typ(n) > 3.5) { int nd = dirOf(n); vec2 no = OFF(nd);',
		'      if (abs(no.x + o.x) < 0.5 && abs(no.y + o.y) < 0.5 && travOf(n) < 0.95 && clearFwd(vec2(0.0), no, L)) {',
		'        float h = hashi(id, salt + uGen * 0.37); float stp = uOrtho > 0.5 ? 2.0 : 1.0; float d = float(nd);',
		'        if (h < uTurn) d = mod(d + stp, 8.0); else if (h < 2.0 * uTurn) d = mod(d - stp + 8.0, 8.0);',
		'        return vec2(4.0, d + min(0.94, travOf(n) + 1.0 / uMaxLen));',
		'      } }',
		'  }',
		// a pad that just appeared beside me sends a head out
		'  for (int j = 0; j < 4; j++) { int k = j * 2;',
		'    vec2 o = OFF(k); vec2 n = Lr(o, L);',
		'    if (typ(n) > 1.5 && typ(n) < 2.5 && ageOf(n) < 0.0001 && clear8(vec2(0.0), o, L) && hashi(id, salt + 9.0) < 0.6) return vec2(4.0, mod(float(k) + 4.0, 8.0));',
		// an array pad pointing at me sends a head out once, at its own moment early in the array's life
		'    if (typ(n) > 6.5 && dirOf(n) == int(mod(float(k) + 4.0, 8.0))) { float dl = hashi(id, salt + 11.0) * 0.45, ag = ageOf(n), st = uAgeRate / 0.9;',
		'      if (ag >= dl && ag < dl + st && hashi(id, salt + 12.0) < 0.45) return vec2(4.0, float(dirOf(n)) + 0.1 + hashi(id, salt + 13.0) * 0.6); }',
		'  }',
		// a new pad, in open space
		// pads cluster: a slow drifting field decides where the board is busy and where it is open copper
		'  float region = smoothstep(0.45, 0.72, fbm(id * 0.028 + salt + uGen * 0.00015));',
		'  float sp = (uSeed > 0.0 ? uSpawn * 150.0 : uSpawn) * (0.04 + 2.2 * region);',
		'  if (hashi(id, salt + 3.0 + uGen * 0.11) < sp && clear2(L)) return vec2(2.0, 0.0);',
		'  return vec2(0.0);',
		'}',
		'void main(){',
		'  vec2 r0 = route(0);',
		'  vec2 r1 = vec2(0.0);',
		'  if (uLayers > 0.5) r1 = route(1);',
		'  else if (uSignal > 0.5) {',
		// pulse: born at pads on a slow clock, runs forward along each trace, dies at the via
		'    vec4 me = S(vec2(0.0)); float t = typ(me.rg); float pulse = me.b * 0.86;',
		'    if (t > 0.5 && t < 1.5 || t > 2.5 && t < 3.5) { vec2 behind = -OFF(dirOf(me.rg)); vec4 b = S(behind); if (typ(b.rg) > 0.5 && b.b > 0.55) pulse = 1.0; }',
		'    if ((t > 1.5 && t < 2.5 || t > 6.5) && mod(uGen, 50.0) < 1.0 && hashi(floor(vUv / uTexel), floor(uGen / 50.0)) < 0.35) pulse = 1.0;',
		'    r1 = vec2(pulse, 0.0);',
		'  }',
		'  gl_FragColor = vec4(r0, r1);',
		'}'
	].join('\n');
	// raw texel → ink (layer 0, layer 1, pulse): pads and vias bold, traces lighter, everything fading with age
	function routerInk(layers, signal) {
		// weight by type: trace/head 0.7 · pad/via/array pad 1.0 · keep-out 0 (blocks routing, draws nothing)
		return 'float wt(float t){ return t < 0.5 ? 0.0 : (t > 4.5 && t < 5.5) ? 0.0 : (t > 1.5 && t < 3.5 || t > 5.5) ? 1.0 : 0.7; }'
			+ 'vec4 ink(vec4 c){ float t0 = floor(c.r + 0.001), a0 = c.r - t0; float f0 = 1.0 - a0 * a0; float i0 = wt(t0) * f0; float pd = (t0 > 1.5 && t0 < 2.5 || t0 > 6.5) ? f0 : 0.0;'
			+ (layers ? ' float t1 = floor(c.b + 0.001), a1 = c.b - t1; float f1 = 1.0 - a1 * a1; float i1 = wt(t1) * f1; pd = max(pd, (t1 > 1.5 && t1 < 2.5 || t1 > 6.5) ? f1 * 0.6 : 0.0);' : ' float i1 = 0.0;')
			+ (signal ? ' float pu = c.b;' : ' float pu = 0.0;')
			+ ' return vec4(i0, i1, pu, pd); }';
	}

	/* ---- registry ------------------------------------------------------------ */
	// res: sim width = stage width / res (rounded to a power of two, capped)
	// tick: seconds per generation; steps: generations per tick; warm: steps before first frame
	// soft: soften radius in sim texels; pat: GLSL from sample s → ink
	var ROUTER = function (o) {
		return Object.assign({ step: STEP_ROUTER, float: true, nearest: true, res: 5, cap: 384, tick: 1 / 30, steps: 1, warm: 30, soft: 0.45, ink: 0.72, full: 0.5, warp: 0.35, minc: 0.5, ring: true,
			pat: 'smoothstep(0.1, 0.95, max(s.r, s.g * 0.6)) - s.b * 0.75', rawink: routerInk(false, false),
			uniforms: { uOrtho: 0, uSignal: 0, uLayers: 0, uSpawn: 0.0000005, uAgeRate: 0.00055, uTurn: 0.015, uMaxLen: 60, uIc: 0.5, uIcBlock: 64 } }, o);
	};
	// variants kept for reference; only the layered one is registered (pad arrays off: uIc 0)
	var ROUTER_VARIANTS = {
		'router-45':     ROUTER({ }),
		'router-ortho':  ROUTER({ uniforms: { uOrtho: 1, uSignal: 0, uLayers: 0, uSpawn: 0.0000005, uAgeRate: 0.00055, uTurn: 0.012, uMaxLen: 60, uIc: 0.5, uIcBlock: 64 } }),
		'router-dense':  ROUTER({ uniforms: { uOrtho: 0, uSignal: 0, uLayers: 0, uSpawn: 0.0000015, uAgeRate: 0.0005, uTurn: 0.02, uMaxLen: 55, uIc: 0.6, uIcBlock: 56 } }),
		'router-sparse': ROUTER({ uniforms: { uOrtho: 0, uSignal: 0, uLayers: 0, uSpawn: 0.0000002, uAgeRate: 0.0005, uTurn: 0.01, uMaxLen: 90, uIc: 0.35, uIcBlock: 80 } }),
		'router-signal': ROUTER({ rawink: routerInk(false, true), uniforms: { uOrtho: 0, uSignal: 1, uLayers: 0, uSpawn: 0.0000005, uAgeRate: 0.0005, uTurn: 0.015, uMaxLen: 60, uIc: 0.5, uIcBlock: 64 } }),
		'router-layers': ROUTER({ rawink: routerInk(true, false), uniforms: { uOrtho: 0, uSignal: 0, uLayers: 1, uSpawn: 0.0000004, uAgeRate: 0.00055, uTurn: 0.015, uMaxLen: 60, uIc: 0.5, uIcBlock: 64 } })
	};
	var ROUTERS = { router: ROUTER({ rawink: routerInk(true, false), uniforms: { uOrtho: 0, uSignal: 0, uLayers: 1, uSpawn: 0.0000004, uAgeRate: 0.00055, uTurn: 0.015, uMaxLen: 60, uIc: 0, uIcBlock: 64 } }) };
	var LEGACY = {
		life:       { step: STEP_LIFE,       float: false, res: 7, cap: 256, tick: 0.3,    steps: 1, warm: 0,   soft: 0.8, pat: 'max(s.r, s.g * 0.8)' },
		lenia:      { heavy: true, step: STEP_LENIA,      float: true,  res: 3, cap: 512, tick: 1 / 10, steps: 1, warm: 30,  soft: 1.2, pat: 'smoothstep(0.06, 0.7, s.r)' },
		smoothlife: { heavy: true, step: STEP_SMOOTHLIFE, float: true,  res: 3, cap: 512, tick: 1 / 12, steps: 1, warm: 20,  soft: 1.2, ink: 0.8, pat: 'smoothstep(0.1, 0.8, s.r)' },
		mnca:       { heavy: true, step: STEP_MNCA,       float: true,  res: 3, cap: 512, tick: 1 / 14, steps: 1, warm: 40,  soft: 1.0, ink: 0.6, pat: 'smoothstep(0.3, 1.0, s.r)' },
		rd:         { step: STEP_RD,         float: true,  res: 3, cap: 512, tick: 1 / 30, steps: 3, warm: 520, soft: 1.0, pat: 'smoothstep(0.10, 0.40, s.g)' },
		cyclic:     { step: STEP_CYCLIC,     float: false, res: 4, cap: 512, tick: 1 / 10, steps: 1, warm: 300, soft: 1.4, ink: 0.45, pat: '0.5 - 0.5 * cos(s.r * 6.2832)' },
		bz:         { step: STEP_BZ,         float: true,  res: 3, cap: 512, tick: 1 / 12, steps: 1, warm: 120, soft: 1.0, pat: 'smoothstep(0.05, 0.6, s.r)' },
		physarum:   { step: STEP_PHYS_TRAIL, float: false, res: 2, cap: 512, tick: 1 / 30, steps: 1, warm: 120, soft: 1.3, pat: 'smoothstep(0.02, 0.5, s.r)', agents: 0.5, agent: PHYS_AGENT, dep: 0.12 },
		flow:       { step: STEP_FLOW_TRAIL, float: false, res: 2, cap: 512, tick: 1 / 30, steps: 1, warm: 90,  soft: 1.4, pat: 'smoothstep(0.03, 0.7, s.r)', agents: 0.018, agent: FLOW_AGENT, dep: 0.45 },
		dla:        { step: STEP_DLA_TRAIL,  float: false, res: 2, cap: 512, tick: 1 / 30, steps: 1, warm: 90,  soft: 1.3, pat: 's.r * 1.3', agents: 0.07, agent: DLA_AGENT, dep: 1.0, full: 0.26 },
		bugs:       { heavy: true, step: STEP_BUGS,       float: false, res: 5, cap: 512, tick: 1 / 6,  steps: 1, warm: 10,  soft: 1.0, pat: 'max(s.r, s.g * 0.7)' },
		waves:      { step: STEP_WAVES,      float: true,  res: 3, cap: 512, tick: 1 / 30, steps: 1, warm: 0,   soft: 1.0, ink: 1.0, pat: 'abs(s.r) * 2.5' },
		crystal:    { step: STEP_CRYSTAL,    float: true,  res: 3, cap: 512, tick: 1 / 20, steps: 1, warm: 0,   soft: 1.0, pat: 's.r * (0.35 + 0.65 * s.g)', full: 0.85 },
		ink:        { step: STEP_INK,        float: true,  res: 2, cap: 512, tick: 1 / 30, steps: 1, warm: 0,   soft: 1.5, pat: 'smoothstep(0.02, 0.8, s.r)', full: 0.6 }
	};
	// everything in the pool for now, routers first, so they can be compared side by side
	var SYSTEMS = Object.assign({}, ROUTERS, LEGACY);
	var MODES = Object.keys(SYSTEMS);
	var NAMES = { router: 'Router', life: 'Game of Life', lenia: 'Lenia', smoothlife: 'SmoothLife', mnca: 'Multi-neighbourhood CA', rd: 'Reaction–diffusion', cyclic: 'Cyclic automaton', bz: 'Belousov–Zhabotinsky', physarum: 'Physarum', ink: 'Ink flow', bugs: 'Larger than Life', waves: 'Wave field', crystal: 'Crystal growth', flow: 'Flow field', dla: 'Diffusion-limited aggregation' };

	// one line each, for the menu
	var DESCS = {
		router: 'Our own autorouter. Pads appear, traces route out from them on two layers, jog around each other and end in pads or vias; everything ages off the board and is re-routed.',
		life: "Conway's Game of Life. A cell lives with two or three neighbours, is born with three, and dies otherwise.",
		lenia: 'Lenia. A continuous Game of Life: smooth kernels and a growth curve instead of a cell count, so creatures glide rather than blink.',
		smoothlife: 'SmoothLife. Life on a continuous grid with ring-shaped neighbourhoods; blobs drift, split and merge.',
		mnca: 'Multi-neighbourhood cellular automaton. Several rings of neighbours vote at once, giving cells, membranes and textures.',
		rd: 'Gray–Scott reaction–diffusion. Two chemicals feed on and destroy each other while spreading, forming spots and stripes.',
		cyclic: 'Cyclic cellular automaton. Each state is eaten by the next in a loop, so spirals wind up out of noise.',
		bz: 'Belousov–Zhabotinsky. A model of the oscillating chemical reaction: target patterns and spiral waves.',
		physarum: 'Physarum. Thousands of agents sense and follow each other’s trails like slime mould, building networks.',
		ink: 'Ink flow. Pigment carried on a slowly stirred fluid, diffusing as it goes.',
		bugs: 'Larger than Life. Game of Life with a big neighbourhood and wide birth and survival bands; amoeba-like shapes.',
		waves: 'Wave field. The wave equation on a grid, driven by a few moving sources; ripples cross and interfere.',
		crystal: 'Crystal growth. A snowflake-style automaton: the edge freezes where vapour is dense enough, branching as it goes.',
		flow: 'Flow field. Particles ride a slowly turning noise field, leaving trails where they pass.',
		dla: 'Diffusion-limited aggregation. Random walkers stick when they touch the cluster, growing branching deposits.'
	};
	function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
	function hexToRgb(h) {
		h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		var n = parseInt(h, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	}
	function pot(n) { return Math.pow(2, Math.round(Math.log(n) / Math.LN2)); }

	function Backdrop(el, mode) {
		var d = el.dataset;
		this.el = el;
		this.mode = mode;
		this.sys = SYSTEMS[mode];
		this.settings = {
			colorA: d.colorA || '#f4f4f4',
			colorB: d.colorB || '#a6a6a6',
			speed: num(d.speed, 1),
			grain: num(d.grain, 0.7),
			paper: num(d.paper, 0.5),
			warp: num(d.warp, 0.14),
			ink: num(d.ink, 0.38),
			invert: d.blend === 'invert',
			lens: num(d.lens, 0.3),
			feed: num(d.feed, 0.037),
			kill: num(d.kill, 0.06),
			mouse_interaction: d.mouseInteraction !== 'false',
			scroll_interaction: d.scrollInteraction !== 'false'
		};
		this.speedScale = 1;
		this.time = 0; this.lastFrame = 0;
		this.mouse = { x: 0.5, y: 0.5 }; this.mouseTarget = { x: 0.5, y: 0.5 };
		this.energy = 0;
		this.inViewport = true;
		this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		this.stage = { w: 0, h: 0 };

		this.canvas = document.createElement('canvas');
		this.canvas.className = 'backdrop-canvas';
		el.appendChild(this.canvas);
		var gl = this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false })
			|| this.canvas.getContext('experimental-webgl');
		if (!gl) return;

		var _this = this;
		this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); _this.pause(); }, false);
		this.canvas.addEventListener('webglcontextrestored', function () { _this.quad(); _this.sim = null; _this.initSim(); _this.prog = _this.makeProgram(showShader(_this.sys.pat, _this.sys.rawink)); _this.initWarp(); _this.applySettings(); _this.resizeSim(true); _this.resume(); }, false);
		this.quad();
		if (!this.initSim()) { this.mode = mode = MODES[0]; this.sys = SYSTEMS[mode]; this.initSim(); }
		this.prog = this.makeProgram(showShader(this.sys.pat, this.sys.rawink));
		this.initWarp();
		this.applySettings();
		this.bind();
		this.ready = true;
		this.el.parentElement.classList.add('loaded');
		this.resume();
	}

	Backdrop.prototype.compile = function (type, src) {
		var gl = this.gl, sh = gl.createShader(type);
		gl.shaderSource(sh, src); gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
		return sh;
	};
	Backdrop.prototype.makeProgram = function (frag, vert) {
		var gl = this.gl, p = gl.createProgram();
		gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vert || VERT));
		gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, frag));
		gl.linkProgram(p);
		var u = {};
		var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
		return { p: p, u: u };
	};
	Backdrop.prototype.quad = function () {
		var gl = this.gl;
		this.buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	};
	Backdrop.prototype.use = function (prog) {
		var gl = this.gl;
		gl.useProgram(prog.p);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
		var loc = gl.getAttribLocation(prog.p, 'aPosition');
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	};
	Backdrop.prototype.applySettings = function () {
		var gl = this.gl, s = this.settings, u = this.prog.u;
		this.use(this.prog);
		var a = hexToRgb(s.colorA), b = hexToRgb(s.colorB);
		gl.uniform3f(u.uColA, a[0], a[1], a[2]);
		gl.uniform3f(u.uColB, b[0], b[1], b[2]);
		gl.uniform1f(u.uGrain, s.grain);
		gl.uniform1f(u.uPaper, s.paper);
		gl.uniform1f(u.uWarp, s.warp * (this.sys.warp || 1));
		gl.uniform1f(u.uInk, s.ink * (this.sys.ink || 1));
		gl.uniform1f(u.uInvert, s.invert ? 1 : 0);
		gl.uniform1f(u.uMinC, this.sys.minc || 0);
		gl.uniform1f(u.uRing, this.sys.ring ? 1 : 0);
		gl.uniform1f(u.uLens, s.lens);
	};
	Backdrop.prototype.update = function (k, v) { this.settings[k] = v; this.applySettings(); };
	Backdrop.prototype.stats = function () {
		var S = this.sim || {};
		return { mode: this.mode, generation: S.gen || 0, cover: this.cover || 0, flipped: !!this.flipState, alive: 0, fps: Math.round(this.fps || 0), cells: S.size ? S.size.w * S.size.h : 0 };
	};
	Backdrop.prototype.setSpeedScale = function (k) { this.speedScale = k; };

	/* ---- simulation plumbing ------------------------------------------------ */
	Backdrop.prototype.makeTex = function (type, linear, clamp) {
		var gl = this.gl, tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
		return tex;
	};
	Backdrop.prototype.initSim = function () {
		var gl = this.gl, sys = this.sys;
		var type = gl.UNSIGNED_BYTE, linear = true;
		if (sys.float) {
			type = null;
			if (gl.getExtension('OES_texture_float')) { type = gl.FLOAT; linear = !!gl.getExtension('OES_texture_float_linear'); }
			var half = gl.getExtension('OES_texture_half_float');
			if (!type && half) { type = half.HALF_FLOAT_OES; linear = !!gl.getExtension('OES_texture_half_float_linear'); }
			if (!type) return false;
		}
		if (sys.agents && gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) < 1) return false;
		var S = this.sim = { type: type, linear: linear, size: { w: 1, h: 1 }, ping: 0, seed: 0, acc: 0, gen: 0, tex: [], fbo: [] };
		try { S.step = this.makeProgram(sys.step); } catch (e) { console.warn('backdrop: shader failed for ' + this.mode, e); return false; }
		S.clear = this.makeProgram('precision mediump float; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }');
		// coverage probe: 32x32 byte target + readback, for the watchdog and the full-sheet flip
		S.cov = { prog: this.makeProgram(coverageShader(sys.pat, sys.rawink)), tex: this.makeTex(gl.UNSIGNED_BYTE, false, true), fbo: gl.createFramebuffer(), px: new Uint8Array(32 * 32 * 4), last: -1, same: 0, at: 0 };
		gl.bindTexture(gl.TEXTURE_2D, S.cov.tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, S.cov.fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.cov.tex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (sys.nearest) linear = false;
		for (var i = 0; i < 2; i++) { S.tex.push(this.makeTex(type, linear)); S.fbo.push(gl.createFramebuffer()); }
		if (this.mode === 'lenia') { var sum = 0, R = 9; for (var y = -R; y <= R; y++) for (var x = -R; x <= R; x++) { var r = Math.sqrt(x * x + y * y) / R; if (r > 1) continue; sum += Math.exp(-Math.pow((r - 0.5) / 0.15, 2) * 0.5); } S.ksum = sum; }
		if (sys.agents) {
			if (!gl.getExtension('OES_texture_float')) return false;
			S.agentProg = this.makeProgram(sys.agent);
			S.depositProg = this.makeProgram(PHYS_DEPOSIT_FRAG, PHYS_DEPOSIT_VERT);
			S.agentTex = [this.makeTex(gl.FLOAT, false, true), this.makeTex(gl.FLOAT, false, true)];
			S.agentFbo = [gl.createFramebuffer(), gl.createFramebuffer()];
			S.agentN = 0; S.agentPing = 0;
		}
		return true;
	};
	Backdrop.prototype.resizeSim = function (force) {
		var gl = this.gl, S = this.sim, sys = this.sys;
		var q = this.quality || 1;
		var w = pot(Math.max(64, Math.min(sys.cap * q, Math.round(this.stage.w * q / sys.res))));
		var h = pot(Math.max(32, Math.round(w * this.stage.h / this.stage.w)));
		if (!force && S.size.w === w && S.size.h === h) return;
		S.size = { w: w, h: h };
		for (var i = 0; i < 2; i++) {
			gl.bindTexture(gl.TEXTURE_2D, S.tex[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, S.type, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo[i]);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex[i], 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) S.broken = true;
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (S.broken) { this.fallback('framebuffer incomplete'); return; }
		this.use(S.clear);
		gl.viewport(0, 0, w, h);
		for (var k = 0; k < 2; k++) { gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo[k]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (S.agentProg) {
			// agents per cell (sys.agents is a density) → square agent texture
			var n = Math.max(16, Math.min(512, Math.round(Math.sqrt(w * h * sys.agents))));
			if (n !== S.agentN) {
				S.agentN = n;
				for (var a = 0; a < 2; a++) {
					gl.bindTexture(gl.TEXTURE_2D, S.agentTex[a]);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.FLOAT, null);
					gl.bindFramebuffer(gl.FRAMEBUFFER, S.agentFbo[a]);
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.agentTex[a], 0);
					if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) S.broken = true;
				}
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				if (S.broken) { this.fallback('float agent framebuffer'); return; }
				var idx = new Float32Array(n * n); for (var j = 0; j < idx.length; j++) idx[j] = j;
				if (!S.idxBuf) S.idxBuf = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, S.idxBuf); gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
			}
		}
		S.seed = Math.random() * 100 + 1; S.ping = 0; S.warm = sys.warm; S.gen = 0; S.acc = 0;
	};
	Backdrop.prototype.stepSim = function (n) {
		var gl = this.gl, S = this.sim, p = S.step, s = this.settings, sys = this.sys;
		var aspect = this.stage.w / this.stage.h;
		for (var i = 0; i < n; i++) {
			var seed = S.seed > 0 ? S.seed : 0;
			var src = S.ping, dst = 1 - src;
			if (S.agentProg) {
				// move agents (reading the trail), then deposit onto the current trail
				var ap = S.agentProg, asrc = S.agentPing, adst = 1 - asrc;
				this.use(ap);
				gl.viewport(0, 0, S.agentN, S.agentN);
				gl.bindFramebuffer(gl.FRAMEBUFFER, S.agentFbo[adst]);
				gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.agentTex[asrc]); gl.uniform1i(ap.u.uAgents, 0);
				gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.tex[src]); gl.uniform1i(ap.u.uTrail, 1);
				gl.uniform1f(ap.u.uSeed, seed); gl.uniform1f(ap.u.uAspect, aspect); gl.uniform2f(ap.u.uTexel, 1 / S.size.w, 1 / S.size.h); if (ap.u.uTime) gl.uniform1f(ap.u.uTime, this.time);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				S.agentPing = adst;
				var dp = S.depositProg;
				gl.useProgram(dp.p);
				gl.bindBuffer(gl.ARRAY_BUFFER, S.idxBuf);
				var loc = gl.getAttribLocation(dp.p, 'aIndex');
				gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
				gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.agentTex[adst]); gl.uniform1i(dp.u.uAgents, 0);
				gl.uniform1f(dp.u.uN, S.agentN); gl.uniform1f(dp.u.uDep, sys.dep || 0.12);
				gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo[src]);
				gl.viewport(0, 0, S.size.w, S.size.h);
				gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
				gl.drawArrays(gl.POINTS, 0, S.agentN * S.agentN);
				gl.disable(gl.BLEND);
				gl.activeTexture(gl.TEXTURE0);
			}
			this.use(p);
			gl.viewport(0, 0, S.size.w, S.size.h);
			gl.uniform2f(p.u.uTexel, 1 / S.size.w, 1 / S.size.h);
			gl.uniform1f(p.u.uTime, this.time);
			gl.uniform1f(p.u.uAspect, aspect);
			gl.uniform1f(p.u.uSeed, seed);
			if (p.u.uKsum) gl.uniform1f(p.u.uKsum, S.ksum);
			if (p.u.uFeed) { gl.uniform1f(p.u.uFeed, s.feed); gl.uniform1f(p.u.uKill, s.kill); }
			if (p.u.uGen) gl.uniform1f(p.u.uGen, S.gen);
			if (sys.uniforms) for (var k in sys.uniforms) if (p.u[k]) gl.uniform1f(p.u[k], sys.uniforms[k]);
			gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo[dst]);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, S.tex[src]);
			gl.uniform1i(p.u.uState, 0);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			S.ping = dst; S.gen++; S.seed = 0;
			if (sys.reset && S.gen % sys.reset === 0) S.seed = Math.random() * 100 + 1;
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};

	/* ---- warp pre-pass plumbing ------------------------------------------- */
	Backdrop.prototype.initWarp = function () {
		var gl = this.gl;
		this.warp = { a: this.makeProgram(FRAG_WARP_A), b: this.makeProgram(FRAG_WARP_B), tex: [this.makeTex(gl.UNSIGNED_BYTE, true, true), this.makeTex(gl.UNSIGNED_BYTE, true, true)], fbo: [gl.createFramebuffer(), gl.createFramebuffer()], w: 0, h: 0 };
	};
	Backdrop.prototype.resizeWarp = function () {
		var gl = this.gl, W = this.warp; if (!W) return;
		var w = Math.max(64, Math.round(this.canvas.width / 4)), h = Math.max(64, Math.round(this.canvas.height / 4));
		if (W.w === w && W.h === h) return;
		W.w = w; W.h = h;
		for (var i = 0; i < 2; i++) {
			gl.bindTexture(gl.TEXTURE_2D, W.tex[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, W.fbo[i]);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, W.tex[i], 0);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};
	Backdrop.prototype.drawWarp = function () {
		var gl = this.gl, W = this.warp;
		this.resizeWarp();
		gl.viewport(0, 0, W.w, W.h);
		this.use(W.a);
		gl.uniform2f(W.a.u.uRes, this.canvas.width, this.canvas.height); gl.uniform1f(W.a.u.uTime, this.time);
		gl.bindFramebuffer(gl.FRAMEBUFFER, W.fbo[0]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		this.use(W.b);
		gl.uniform2f(W.b.u.uRes, this.canvas.width, this.canvas.height); gl.uniform1f(W.b.u.uTime, this.time);
		gl.uniform2f(W.b.u.uMouse, this.mouse.x, 1 - this.mouse.y); gl.uniform1f(W.b.u.uLens, this.settings.lens);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, W.tex[0]); gl.uniform1i(W.b.u.uWarpA, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, W.fbo[1]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};

	Backdrop.prototype.coverage = function () {
		var gl = this.gl, S = this.sim, C = S.cov, p = C.prog;
		this.use(p);
		gl.viewport(0, 0, 32, 32);
		gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbo);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex[S.ping]); gl.uniform1i(p.u.uState, 0);
		if (p.u.uSoft) gl.uniform2f(p.u.uSoft, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, C.px);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		var sum = 0; for (var i = 0; i < C.px.length; i += 4) sum += C.px[i];
		return sum / (255 * 1024);
	};
	// watchdog: once a second, read how much of the sheet the organism covers.
	//   full  → flip the page and start again on the other colour
	//   empty → the organism died (or never seeded): reseed quietly
	//   frozen → nothing has changed for a while: reseed through a flip
	Backdrop.prototype.watch = function (now) {
		var S = this.sim, sys = this.sys, C = S.cov;
		if (!C || S.warm > 0 || now - C.at < 1000) return;
		C.at = now;
		var c = this.coverage();
		this.cover = c;
		var full = sys.full || 0.75;
		if (c > full) { C.fullN = (C.fullN || 0) + 1; if (C.fullN >= 2 && now - (this.lastFlip || 0) > 20000) { C.fullN = 0; this.flip(now); } return; }
		C.fullN = 0;
		if (c < 0.003) { C.empty = (C.empty || 0) + 1; if (C.empty >= 3) { C.empty = 0; this.reseed(); } } else C.empty = 0;
		// frozen: coverage has barely moved across the last 12 readings
		C.hist = C.hist || []; C.hist.push(c); if (C.hist.length > 12) C.hist.shift();
		if (C.hist.length === 12 && Math.max.apply(null, C.hist) - Math.min.apply(null, C.hist) < 0.002 && now - (this.lastFlip || 0) > 20000) { C.hist = []; this.flip(now); }
		C.last = c;
	};
	Backdrop.prototype.reseed = function () { var S = this.sim; S.seed = Math.random() * 100 + 1; S.warm = this.sys.warm; if (S.cov) { S.cov.hist = []; S.cov.fullN = 0; S.cov.empty = 0; } };
	Backdrop.prototype.flip = function (now) {
		if (this.flipping) return;
		this.lastFlip = now || performance.now();
		this.flipping = true;
		this.flipTarget = this.flipState ? 0 : 1;
		this.flipState = !this.flipState;
		this.flipReseedAt = 0.5;   // reseed when the sheet is halfway through turning
	};
	// switch organism in place (the pill in the header uses this)
	Backdrop.prototype.setMode = function (mode) {
		if (!SYSTEMS[mode] || mode === this.mode) return;
		var gl = this.gl, old = this.sim;
		this.mode = mode; this.sys = SYSTEMS[mode];
		this.el.setAttribute('data-backdrop', mode);
		this.sim = null;
		if (!this.initSim()) { this.mode = MODES[0]; this.sys = SYSTEMS[MODES[0]]; this.initSim(); }
		this.prog = this.makeProgram(showShader(this.sys.pat, this.sys.rawink)); this.applySettings();
		this.flipping = false; this.flipT = this.flipState ? 1 : 0;
		this.resizeSim(true);
		if (old) { (old.tex || []).concat(old.agentTex || [], old.cov ? [old.cov.tex] : []).forEach(function (t) { gl.deleteTexture(t); }); (old.fbo || []).concat(old.agentFbo || [], old.cov ? [old.cov.fbo] : []).forEach(function (f) { gl.deleteFramebuffer(f); }); }
		try { localStorage.setItem('om-bg', mode); } catch (e) {}
		this.el.dispatchEvent(new CustomEvent('backdropchange', { bubbles: true, detail: { mode: mode } }));
	};
	Backdrop.prototype.fallback = function (why) {
		console.warn('backdrop: ' + this.mode + ' — ' + why + '; falling back to ' + MODES[0]);
		if (this.mode === MODES[0]) return;
		this.mode = MODES[0]; this.sys = SYSTEMS[MODES[0]]; this.el.setAttribute('data-backdrop', MODES[0]);
		this.sim = null; this.initSim();
		this.prog = this.makeProgram(showShader(this.sys.pat, this.sys.rawink)); this.applySettings();
		this.resizeSim(true);
	};

	/* ---- sizing / events --------------------------------------------------- */
	Backdrop.prototype.setSize = function (width, height) {
		var res = window.devicePixelRatio || 1;
		var px = width * res * height * res, hd = 1600 * 900;
		if (px > hd) { var k = Math.sqrt(hd / px); width = Math.ceil(width * k); height = Math.ceil(height * k); }
		if (this.stage.w !== width || this.stage.h !== height) {
			this.stage = { w: width, h: height };
			this.canvas.width = Math.round(width * res);
			this.canvas.height = Math.round(height * res);
			this.resizeSim();
		}
	};
	Backdrop.prototype.pause = function () { cancelAnimationFrame(this.frame); this.paused = true; };
	Backdrop.prototype.resume = function () {
		cancelAnimationFrame(this.frame);
		if (this.inViewport && this.ready) { this.lastFrame = 0; this.draw(); this.paused = false; }
	};

	Backdrop.prototype.draw = function (now) {
		var _this = this;
		this.drawn = (this.drawn || 0) + 1;
		var still = this.reducedMotion && this.drawn > 3 && !(this.sim && this.sim.warm > 0);
		if (!still) this.frame = requestAnimationFrame(function (t) { _this.draw(t); });
		now = now || performance.now();
		var dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0.016;
		this.lastFrame = now;
		this._fa = (this._fa || 0) + dt; this._fn = (this._fn || 0) + 1;
		if (this._fa > 0.5) { this.fps = this._fn / this._fa; this._fa = 0; this._fn = 0; }
		if (this.reducedMotion) dt = 0;
		var rate = this.settings.speed * this.speedScale;
		this.time += dt * rate;
		this.mouse.x += (this.mouseTarget.x - this.mouse.x) * 0.06;
		this.mouse.y += (this.mouseTarget.y - this.mouse.y) * 0.06;
		this.energy *= 0.96;
		this.lensOn = (this.lensOn || 0) + ((this.pointerIn ? 1 : 0) - (this.lensOn || 0)) * 0.05;

		// sheet flip eases over ~1.6 s; the organism reseeds under cover of the turn
		this.flipT = this.flipT || 0;
		if (this.flipping) {
			var tgt = this.flipTarget, dirn = tgt > this.flipT ? 1 : -1;
			var prev = this.flipT;
			this.flipT += dirn * dt * 0.62;
			if ((dirn > 0 && this.flipT >= tgt) || (dirn < 0 && this.flipT <= tgt)) { this.flipT = tgt; this.flipping = false; }
			var mid = 0.5;
			if (this.flipReseedAt !== null && ((dirn > 0 && prev < mid && this.flipT >= mid) || (dirn < 0 && prev > mid && this.flipT <= mid))) { this.reseed(); this.flipReseedAt = null; }
		}
		var gl = this.gl, S = this.sim, sys = this.sys;
		// frame budget: heavy kernels (R≥7) get one step per frame; the rest at most two.
		// Warm-up runs in small batches so the first seconds don't hitch.
		var heavy = sys.heavy || false;
		if (S.warm > 0) { var w = Math.min(S.warm, heavy ? 3 : 10); this.stepSim(w); S.warm -= w; }
		else if (dt > 0) {
			this.watch(now);
			S.acc += dt * rate;
			var n = 0, cap = heavy ? 1 : 2;
			while (S.acc >= sys.tick && n < cap) { S.acc -= sys.tick; n++; }
			if (S.acc > sys.tick) S.acc = sys.tick;   // never bank more than one tick: drop time instead of stuttering
			if (n) this.stepSim(n * sys.steps);
		}
		// adaptive quality: if we can't hold ~45 fps for a few seconds, halve the sim resolution once
		if (!this.degraded && !this.qualityLocked && this.fps && this.fps < 45 && now - (this.firstFrame || (this.firstFrame = now)) > 4000) {
			this.lowFps = (this.lowFps || 0) + dt;
			if (this.lowFps > 2.5) { this.degraded = true; this.quality = 0.5; this.resizeSim(true); }
		} else this.lowFps = 0;
		this.drawWarp();
		this.use(this.prog);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		var u = this.prog.u;
		gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.warp.tex[0]); gl.uniform1i(u.uWarpA, 2);
		gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.warp.tex[1]); gl.uniform1i(u.uWarpB, 3);
		gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
		gl.uniform1f(u.uTime, this.time);
		gl.uniform2f(u.uMouse, this.mouse.x, 1 - this.mouse.y);
		if (u.uEnergy) gl.uniform1f(u.uEnergy, this.energy);
		gl.uniform1f(u.uLensOn, this.settings.mouse_interaction && !this.reducedMotion ? this.lensOn : 0);
		gl.uniform1f(u.uFlip, this.flipT || 0);
		gl.uniform1f(u.uGrainTime, this.reducedMotion ? 0 : Math.floor(now / 83));
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex[S.ping]); gl.uniform1i(u.uState, 0);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.tex[1 - S.ping]); gl.uniform1i(u.uPrev, 1);
		gl.activeTexture(gl.TEXTURE0);
		// with several steps per tick the previous buffer is only one step back; crossfade still smooths it
		gl.uniform1f(u.uMix, S.warm > 0 ? 1 : Math.min(1, S.acc / sys.tick));
		gl.uniform2f(u.uSoft, sys.soft / S.size.w, sys.soft / S.size.h);
		if (u.uCell) gl.uniform2f(u.uCell, 1 / S.size.w, 1 / S.size.h);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};

	Backdrop.prototype.bind = function () {
		var _this = this;
		var wrapper = this.el.closest('.backdrop') || this.el;
		var page = wrapper.parentElement;
		function resize() { _this.setSize(page.clientWidth, Math.min(page.clientHeight, window.innerHeight)); }
		resize();
		if (window.ResizeObserver) new ResizeObserver(resize).observe(page);
		window.addEventListener('resize', resize, { passive: true });
		if (this.settings.mouse_interaction) {
			window.addEventListener('pointermove', function (e) {
				var nx = e.clientX / window.innerWidth, ny = e.clientY / window.innerHeight;
				_this.energy = Math.min(1, _this.energy + Math.hypot(nx - _this.mouseTarget.x, ny - _this.mouseTarget.y) * 2.5);
				_this.mouseTarget.x = nx; _this.mouseTarget.y = ny;
				_this.pointerIn = e.pointerType !== 'touch';
			}, { passive: true });
			document.addEventListener('pointerleave', function () { _this.pointerIn = false; });
			document.documentElement.addEventListener('mouseleave', function () { _this.pointerIn = false; });
		}
		if (window.IntersectionObserver) {
			new IntersectionObserver(function (en) { _this.inViewport = en[0].isIntersecting; if (_this.inViewport) _this.resume(); else _this.pause(); }, { threshold: 0 }).observe(wrapper);
		}
		document.addEventListener('visibilitychange', function () { if (document.hidden) _this.pause(); else _this.resume(); });
	};

	/* ---- boot ---------------------------------------------------------------- */
	window.Backdrop = Backdrop;
	Backdrop.modes = MODES;
	Backdrop.names = NAMES;
	Backdrop.descriptions = DESCS;
	Backdrop.instances = [];
	// ?bg=… or #<mode>[+os] (the hash form works on the artifact preview)
	var hashParts = (location.hash || '').slice(1).split('+');
	var params = new URLSearchParams(location.search);
	var override = params.get('bg') || hashParts[0];
	var invert = params.get('blend') === 'invert' || hashParts.indexOf('inv') > -1;
	var qLock = parseFloat(params.get('q'));   // ?q=1 pins the sim resolution (no adaptive fallback)
	window.addEventListener('hashchange', function () { var m = (location.hash || '').slice(1).split('+')[0]; if (m === 'random' || MODES.indexOf(m) > -1) location.reload(); });
	function pick() {
		// a different organism each visit, never the same one twice running
		var last = ''; try { last = localStorage.getItem('om-bg') || ''; } catch (e) {}
		var pool = MODES.filter(function (m) { return m !== last; });
		var m = pool[Math.floor(Math.random() * pool.length)];
		try { localStorage.setItem('om-bg', m); } catch (e) {}
		return m;
	}
	var els = document.querySelectorAll('[data-backdrop]');
	for (var i = 0; i < els.length; i++) {
		var mode = override || els[i].getAttribute('data-backdrop');
		if (!mode || mode === 'random' || MODES.indexOf(mode) < 0) mode = pick();
		els[i].setAttribute('data-backdrop', mode);
		if (invert) els[i].setAttribute('data-blend', 'invert');
		try { var inst = new Backdrop(els[i], mode); if (!inst.ready) continue; if (!isNaN(qLock)) { inst.qualityLocked = true; inst.quality = qLock; inst.resizeSim(true); } Backdrop.instances.push(inst); } catch (e) { console.warn('backdrop failed', e); }
	}
})();
