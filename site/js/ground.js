/* organisedmess.studio — ground.js
 *
 * The background: a grey sheet of paper and grain, and a few places where that texture collects.
 * At rest each one is dispersed — the grain spread thin and wide — and drifts very slowly.
 * When the pointer moves, the one nearest it gathers: the paper is drawn in, the grain
 * coarsens and packs into specks, and it is pulled after the pointer on a slow, damped
 * spring; when the pointer stops it lets go and the grain spreads out again where it is.
 * No shading and no simulation — one shader per frame.
 *
 * Exposes window.Backdrop = { instances: [ground] } with the small API site.js uses for
 * the after-hours state: setSpeedScale(s), settings.mouse_interaction, ready.
 */
(function () {
	'use strict';

	var VERT = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';

	var FRAG = [
		'precision highp float;',
		'varying vec2 vUv;',
		'uniform vec2 uRes;          // device px',
		'uniform float uScale;       // device px per css px',
		'uniform float uTime, uGrainTime;',
		'const int N = 5;',
		'uniform vec4 uM[N];         // css px x, y, strength 0..1, radius css px',
		'uniform vec3 uTop, uBottom;',
		'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
		'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
		'  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
		'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }',
		// a gathering point: how far the paper is drawn in towards it, and how much texture collects there
		'void well(vec2 p, vec4 m, float seed, inout vec2 pull, inout float depth, inout vec2 slope){',
		'  float R = m.w; vec2 d = p - m.xy; float r2 = dot(d, d), R2 = R * R, k = R2 / (r2 + R2);',
		'  pull += d * (m.z * 0.35 * k);',
		// the paper also twists as it is drawn in — the sense of the twist flips in bands, so it eddies both ways
		'  float band = sin(sqrt(r2) / R * 5.0 + seed * 2.3 + uTime * 0.25);',
		'  pull += vec2(-d.y, d.x) * (m.z * 0.45 * k * band);',                      // sample further out: the paper is drawn in towards the mass
		'  depth += m.z * k;',
		'  slope += m.z * d * (-2.0 * R2 * R / ((r2 + R2) * (r2 + R2)));',
		'}',
		'void main(){',
		'  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uScale;',   // css px, y down
		'  vec2 pull = vec2(0.0); float depth = 0.0; vec2 slope = vec2(0.0);',
		'  for (int i = 0; i < N; i++) well(px, uM[i], float(i), pull, depth, slope);',
		// and where texture collects it is churned by a curl field, so the grain runs every which way
		'  float e = 6.0; vec2 cp = px * 0.008 + uTime * 0.03;',
		'  vec2 curl = vec2(fbm(cp + vec2(0.0, 0.01)) - fbm(cp - vec2(0.0, 0.01)), fbm(cp - vec2(0.01, 0.0)) - fbm(cp + vec2(0.01, 0.0))) / 0.02;',
		'  pull += curl * smoothstep(0.3, 1.4, depth) * 26.0;',
		'  vec2 q = px + pull;',                                 // the sheet as it lies, warped by the masses
		'  float H = uRes.y / uScale;',
		'  float t = clamp(q.y / H, 0.0, 1.0);',
		'  vec3 col = mix(uTop, uBottom, smoothstep(-0.15, 1.1, t));',
		// D: how much texture has collected here. No shading — the tone comes only from grain and paper.
		'  float D = smoothstep(0.4, 1.15, depth);',   // the dispersed fields overlap to ~0.5: texture only starts to collect above that
		// paper: the tooth roughens where texture collects; a slow mottle underneath, both carried by the pull
		'  float tooth = noise(q * uScale * 0.21 + 3.0) * 0.6 + noise(q * uScale * 0.07 + 9.0) * 0.4;',
		'  float mottle = fbm(q * 0.006 + vec2(uTime * 0.004, -uTime * 0.003));',
		'  float lum = (tooth - 0.5) * 0.035 * (1.0 + D * 2.0) + (mottle - 0.5) * 0.09 + (depth - 0.5) * -0.03;',
		// grain on the device grid, drawn in with the paper; it coarsens and gets heavier where it collects
		'  vec2 dev = gl_FragCoord.xy + pull * uScale * vec2(1.0, -1.0);',
		// the grain cells are turned to a different angle patch by patch, so streaks don't all lie the same way
		'  float ang = fbm(q * 0.012 + 40.0) * 12.566;',
		'  vec2 rd = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * dev;',
		'  vec2 gc = floor(rd / (1.0 + D * 1.2));',
		'  vec2 gp = gc * mat2(0.76, 0.65, -0.65, 0.76) + vec2(uGrainTime * 17.3, uGrainTime * 31.7);',
		'  lum += (hash(gp) - 0.5) * 0.085 * (1.0 + D * 1.2);',
		// and it packs into specks — a stochastic screen whose coverage follows D, like ink on a riso drum
		'  float speck = step(hash(gp * 1.37 + 11.0), D * 0.36);',
		'  lum -= speck * (0.09 + 0.06 * hash(gp + 5.0));',
		'  gl_FragColor = vec4(clamp(col + lum, 0.0, 1.0), 1.0);',
		'}'
	].join('\n');

	function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255]; }

	function Ground(el) {
		this.el = el;
		this.ready = false;
		this.speed = 1;
		this.settings = { mouse_interaction: true };
		this.top = hex(el.getAttribute('data-color-a') || '#ececec');
		this.bottom = hex(el.getAttribute('data-color-b') || '#b4b4b4');
		this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		var c = document.createElement('canvas');
		c.className = 'backdrop-canvas';
		c.setAttribute('aria-hidden', 'true');
		el.appendChild(c);
		this.canvas = c;
		var gl = c.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
		if (!gl) { document.documentElement.classList.add('no-webgl'); el.parentElement.classList.add('loaded'); return; }
		this.gl = gl;
		if (!this.build()) { document.documentElement.classList.add('no-webgl'); el.parentElement.classList.add('loaded'); return; }
		// the masses: where they rest (fractions of the screen), where they are, how gathered they are
		var w = window.innerWidth, h = window.innerHeight;
		this.target = { x: w * 0.5, y: h * 0.5, on: false, last: 0, speed: 0, dist: 0 };
		this.active = -1;
		this.masses = [[0.22, 0.30], [0.72, 0.22], [0.48, 0.62], [0.86, 0.72], [0.14, 0.82]].map(function (f, i) {
			return { hx: f[0], hy: f[1], ax: f[0] * w, ay: f[1] * h, x: f[0] * w, y: f[1] * h, vx: 0, vy: 0, g: 0, s: 0, ph: i * 1.7 };
		});
		this.bind();
		this.resize();
		this.ready = true;
		this.t0 = performance.now(); this.last = this.t0; this.time = 0;
		el.parentElement.classList.add('loaded');
		var self = this;
		this.frame = function (now) { self.render(now); if (!self.reduced) self.raf = requestAnimationFrame(self.frame); };
		this.raf = requestAnimationFrame(this.frame);
	}

	Ground.prototype.build = function () {
		var gl = this.gl;
		function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
		var v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG);
		if (!v || !f) return false;
		var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return false; }
		this.prog = p;
		this.u = {};
		['uRes', 'uScale', 'uTime', 'uGrainTime', 'uTop', 'uBottom'].forEach(function (n) { this.u[n] = gl.getUniformLocation(p, n); }, this);
		this.u.uM = gl.getUniformLocation(p, 'uM[0]');
		this.mbuf = new Float32Array(20);
		var buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		var loc = gl.getAttribLocation(p, 'aPos');
		gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		gl.useProgram(p);
		return true;
	};

	Ground.prototype.bind = function () {
		var self = this, T = this.target;
		function at(e) {
			if (!self.settings.mouse_interaction) return;
			if (T.on) T.dist += Math.hypot(e.clientX - T.x, e.clientY - T.y);   // turned into a speed once per frame
			T.x = e.clientX; T.y = e.clientY; T.on = true; T.last = performance.now();
		}
		document.addEventListener('pointermove', at, { passive: true, capture: true });
		document.addEventListener('pointerdown', at, { passive: true, capture: true });
		document.documentElement.addEventListener('mouseleave', function () { T.on = false; });
		window.addEventListener('blur', function () { T.on = false; });
		window.addEventListener('resize', function () { self.resize(); }, { passive: true });
		document.addEventListener('visibilitychange', function () { self.last = performance.now(); });
		this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cancelAnimationFrame(self.raf); self.ready = false; });
		this.canvas.addEventListener('webglcontextrestored', function () { if (self.build()) { self.ready = true; self.resize(); self.raf = requestAnimationFrame(self.frame); } });
	};

	Ground.prototype.resize = function () {
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		var w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight;
		this.scale = dpr; this.w = w; this.h = h;
		this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
		if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		if (this.reduced && this.ready) this.render(performance.now());
	};

	Ground.prototype.setSpeedScale = function (s) { this.speed = s; };

	// a heavy body on a soft spring: slow to start, slow to stop, overshoots a little
	function spring(b, tx, ty, k, damp, dt) {
		var ax = (tx - b.x) * k - b.vx * damp, ay = (ty - b.y) * k - b.vy * damp;
		b.vx += ax * dt; b.vy += ay * dt; b.x += b.vx * dt; b.y += b.vy * dt;
	}

	Ground.prototype.render = function (now) {
		if (!this.ready) return;
		var gl = this.gl, u = this.u, T = this.target, ms = this.masses, w = this.w, h = this.h;
		var real = Math.max(0.001, (now - this.last) / 1000), dt = Math.min(0.05, real) * this.speed; this.last = now;
		this.time += dt;
		var base = Math.min(w, h) * 0.2 + 60;
		// pointer speed in px/s, measured per frame and smoothed over about a tenth of a second
		T.speed += (Math.min(T.dist / real, 4000) - T.speed) * Math.min(1, real * 10); T.dist = 0;
		var moving = this.settings.mouse_interaction && T.on && T.speed > 25 && !this.reduced;
		// the nearest mass takes the pointer; another only takes over when clearly closer (no flicker between two)
		if (moving) {
			var best = -1, bd = 1e9;
			for (var i = 0; i < ms.length; i++) { var d = Math.hypot(ms[i].x - T.x, ms[i].y - T.y); if (d < bd) { bd = d; best = i; } }
			if (this.active < 0) this.active = best;
			else if (best !== this.active && bd < 0.5 * Math.hypot(ms[this.active].x - T.x, ms[this.active].y - T.y)) this.active = best;
		}
		var gatherWant = moving ? Math.min(1, Math.max(0, (T.speed - 25) / 350)) : 0;
		for (var j = 0; j < ms.length; j++) {
			var m = ms[j], held = j === this.active && (moving || m.g > 0.05);
			if (held && moving) {
				spring(m, T.x, T.y, 3.2, 3.0, dt);
				m.ax = m.x; m.ay = m.y;                                  // it rests wherever it is let go
			} else {
				// drifting: a slow wander around its resting place, which itself eases back home over a minute
				m.ax += (m.hx * w - m.ax) * Math.min(1, dt / 60); m.ay += (m.hy * h - m.ay) * Math.min(1, dt / 60);
				var t = this.time * 0.06 + m.ph;
				spring(m, m.ax + Math.sin(t * 1.3) * w * 0.05, m.ay + Math.sin(t * 0.9 + 1.1) * h * 0.05, 0.5, 1.4, dt);
			}
			// gather quickly while moving, spread out slowly once still
			var want = j === this.active ? gatherWant : 0;
			m.g += (want - m.g) * Math.min(1, dt * (want > m.g ? 3.0 : (j === this.active ? 0.7 : 1.2)));   // a mass that has been handed over lets go a little faster
			if (!moving && m.g < 0.02 && j === this.active) this.active = -1;
		}
		// they keep their distance from each other, so the sheet never collects into one pit
		for (var a = 0; a < ms.length; a++) for (var b2 = a + 1; b2 < ms.length; b2++) {
			var A = ms[a], B = ms[b2], dx = B.x - A.x, dy = B.y - A.y, dd = Math.hypot(dx, dy) || 1, lim = base * 1.6;
			if (dd < lim) { var push = (lim - dd) / lim * 220 * dt; dx /= dd; dy /= dd;
				if (a !== this.active || !moving) { A.vx -= dx * push; A.vy -= dy * push; }
				if (b2 !== this.active || !moving) { B.vx += dx * push; B.vy += dy * push; } }
		}
		var on = this.settings.mouse_interaction ? 1 : 0.6;
		for (var k = 0; k < ms.length; k++) {
			var M = ms[k];
			M.s += (on - M.s) * Math.min(1, dt * 0.8);                  // they settle in as the page wakes
			var g = M.g * M.g * (3 - 2 * M.g);
			this.mbuf[k * 4] = M.x; this.mbuf[k * 4 + 1] = M.y;
			this.mbuf[k * 4 + 2] = M.s * (0.28 + 0.72 * g);             // dispersed: shallow · gathered: deep
			this.mbuf[k * 4 + 3] = base * (2.1 - 1.35 * g);             // dispersed: wide · gathered: tight
		}
		gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
		gl.uniform1f(u.uScale, this.scale);
		gl.uniform1f(u.uTime, this.time);
		gl.uniform1f(u.uGrainTime, this.reduced ? 0 : Math.floor(now / 83) % 97);   // grain changes ~12 times a second, like film
		gl.uniform4fv(u.uM, this.mbuf);
		gl.uniform3fv(u.uTop, this.top); gl.uniform3fv(u.uBottom, this.bottom);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};

	var instances = [];
	function init() {
		var els = document.querySelectorAll('[data-backdrop]');
		for (var i = 0; i < els.length; i++) instances.push(new Ground(els[i]));
	}
	window.Backdrop = { instances: instances };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
