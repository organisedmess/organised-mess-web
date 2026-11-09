/* organisedmess.studio — ground.js
 *
 * The background: a grainy grey sheet with a heavy mass on it.
 * The mass follows the pointer on a slow, heavily damped spring and sinks into the sheet,
 * pulling the paper and its grain in around it; a second, slower mass trails behind as the
 * sheet's memory of where it was. No simulation, no state — one shader per frame.
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
		'uniform vec3 uMass;         // css px x, y, strength 0..1',
		'uniform vec3 uWake;',
		'uniform float uRadius;      // css px',
		'uniform vec3 uTop, uBottom;',
		'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
		'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
		'  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
		'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }',
		// a well: f is how far the sheet is pulled in (0 at a distance, S at the centre), g its slope
		'void well(vec2 p, vec3 m, float R, inout vec2 pull, inout float depth, inout vec2 slope){',
		'  vec2 d = p - m.xy; float r2 = dot(d, d), R2 = R * R, k = R2 / (r2 + R2);',
		'  float f = m.z * 0.9 * k;',
		'  pull += d * f;',                                    // sample further out: the paper is drawn in towards the mass
		'  depth += m.z * k;',
		'  slope += m.z * d * (-2.0 * R2 / ((r2 + R2) * (r2 + R2)));',
		'}',
		'void main(){',
		'  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uScale;',   // css px, y down
		'  vec2 pull = vec2(0.0); float depth = 0.0; vec2 slope = vec2(0.0);',
		'  well(px, uMass, uRadius, pull, depth, slope);',
		'  well(px, uWake, uRadius * 1.6, pull, depth, slope);',
		'  vec2 q = px + pull;',                                 // the sheet as it lies, warped by the masses
		'  float H = uRes.y / uScale;',
		'  float t = clamp(q.y / H, 0.0, 1.0);',
		'  vec3 col = mix(uTop, uBottom, smoothstep(-0.15, 1.1, t));',
		// paper: tooth and a slow mottle, both carried by the warp so they are visibly pulled in
		'  float tooth = noise(q * uScale * 0.21 + 3.0) * 0.6 + noise(q * uScale * 0.07 + 9.0) * 0.4;',
		'  float mottle = fbm(q * 0.006 + vec2(uTime * 0.004, -uTime * 0.003));',
		'  float lum = (tooth - 0.5) * 0.035 + (mottle - 0.5) * 0.11;',
		// the dent: a little darker at the bottom, lit from the top left along its slope
		'  lum -= depth * depth * 0.16;',
		'  lum += dot(slope * uRadius, normalize(vec2(-0.55, -0.85))) * 0.16;',
		// grain on the device grid, pulled in with the sheet near the mass
		'  vec2 gp = (gl_FragCoord.xy + pull * uScale * vec2(1.0, -1.0)) * mat2(0.76, 0.65, -0.65, 0.76) + vec2(uGrainTime * 17.3, uGrainTime * 31.7);',
		'  lum += (hash(gp) - 0.5) * 0.085 * (1.0 + depth * 0.9);',   // the paper is packed tighter in the well, so the grain is heavier there
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
		// the heavy mass and its wake: position, velocity, strength
		var w = window.innerWidth, h = window.innerHeight;
		this.target = { x: w * 0.62, y: h * 0.58, on: false, last: 0 };
		this.mass = { x: w * 0.62, y: h * 0.58, vx: 0, vy: 0, s: 0 };
		this.wake = { x: w * 0.62, y: h * 0.58, vx: 0, vy: 0, s: 0 };
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
		['uRes', 'uScale', 'uTime', 'uGrainTime', 'uMass', 'uWake', 'uRadius', 'uTop', 'uBottom'].forEach(function (n) { this.u[n] = gl.getUniformLocation(p, n); }, this);
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
		function at(e) { if (!self.settings.mouse_interaction) return; T.x = e.clientX; T.y = e.clientY; T.on = true; T.last = performance.now(); }
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
		var gl = this.gl, u = this.u, T = this.target, M = this.mass, W = this.wake;
		var dt = Math.min(0.05, (now - this.last) / 1000) * this.speed; this.last = now;
		this.time += dt;
		var idle = now - T.last > 6000;
		// no pointer (touch screens, or it has left): the mass wanders on its own, very slowly
		var tx = T.x, ty = T.y;
		if (!T.on || idle) {
			var a = this.time * 0.05;
			tx = this.w * (0.5 + 0.28 * Math.sin(a * 1.3)); ty = this.h * (0.55 + 0.22 * Math.sin(a * 0.9 + 1.1));
		}
		if (!this.reduced) {
			spring(M, tx, ty, 3.2, 3.0, dt);
			spring(W, M.x, M.y, 0.9, 1.6, dt);
		} else { M.x = tx; M.y = ty; W.x = tx; W.y = ty; }
		// it sinks in when the page wakes, and lightens a touch while it moves fast
		var sp = Math.min(1, Math.hypot(M.vx, M.vy) / 1600);
		var want = this.settings.mouse_interaction ? (T.on && !idle ? 1 : 0.7) * (1 - sp * 0.25) : 0.35;
		M.s += (want - M.s) * Math.min(1, dt * 1.2);
		W.s += (want * 0.45 - W.s) * Math.min(1, dt * 0.6);
		var R = Math.min(this.w, this.h) * 0.2 + 60;
		gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
		gl.uniform1f(u.uScale, this.scale);
		gl.uniform1f(u.uTime, this.time);
		gl.uniform1f(u.uGrainTime, this.reduced ? 0 : Math.floor(now / 83) % 97);   // grain changes ~12 times a second, like film
		gl.uniform3f(u.uMass, M.x, M.y, M.s);
		gl.uniform3f(u.uWake, W.x, W.y, W.s);
		gl.uniform1f(u.uRadius, R);
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
