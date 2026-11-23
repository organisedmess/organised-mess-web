// GRIDLAB — tool models. One representation for every source: a height field over the tool's top view.
// Tool frame: x along the length, working end (tip) at +x, x ∈ [-L/2, L/2]; y across, centred; z up from the
// face it lies on (z = 0). Each cell (x, y) holds the solid's z-range [lo, hi].
// Sources: photo views (top · side · end → a visual hull), a 3D scan (any mesh), or the tool's listed sizes.
// From the height field: volume, centre of gravity (with a heavy tip and a light handle if asked), width and
// thickness along the length, the cross-section of any span, and the top outline.
import { components, traceBoundary, simplifyClosed, chaikin, area as polyArea } from './trace.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 2D rasters ----------
// scanline fill of a polygon at cell centres; grid {x0, y0, res, nx, ny}
export function rasterPoly(P, g, out = null) {
  const m = out || new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.res, xs = [];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.res - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[k + 1] - g.x0) / g.res - 0.5));
      for (let i = i0; i <= i1; i++) m[j * g.nx + i] = 1;
    }
  }
  return m;
}
// largest blob of a mask → its outline in mm (holes ignored)
export function maskToPoly(mask, g, { simplify = 0, smooth = 1 } = {}) {
  const { lab, comps } = components(mask, g.nx, g.ny);
  if (!comps.length) return null;
  const c = comps.reduce((a, b) => (b.n > a.n ? b : a));
  const px = traceBoundary(lab, g.nx, g.ny, c.id, c.first);
  if (px.length < 3) return null;
  let P = px.map(([i, j]) => [g.x0 + (i + 0.5) * g.res, g.y0 + (j + 0.5) * g.res]);
  // the trace runs through cell centres: push it out half a cell so areas match
  P = simplifyClosed(P, simplify || g.res * 0.5);
  if (smooth) P = chaikin(P, smooth);
  if (polyArea(P) < 0) P.reverse();
  const cx = P.reduce((a, q) => a + q[0], 0) / P.length, cy = P.reduce((a, q) => a + q[1], 0) / P.length;
  return P.map(([x, y]) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x + (dx / d) * g.res * 0.5, y + (dy / d) * g.res * 0.5]; });
}
const bounds = (P) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, x1, y0, y1 }; };
// where a vertical line x crosses a polygon: [lo, hi] of y, or null
function crossAt(P, x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
    if ((ax <= x && bx >= x) || (bx <= x && ax >= x)) {
      if (ax === bx) { lo = Math.min(lo, ay, by); hi = Math.max(hi, ay, by); }
      else { const y = ay + ((x - ax) / (bx - ax)) * (by - ay); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
  }
  return hi >= lo ? [lo, hi] : null;
}
export const mirrorX = (P) => P.map(([x, y]) => [-x, y]).reverse();
export const mirrorY = (P) => P.map(([x, y]) => [x, -y]).reverse();

// ---------- the height field ----------
export function makeHF(b, res) {
  const pad = 2 * res, x0 = b.x0 - pad, y0 = b.y0 - pad;
  const nx = Math.max(2, Math.ceil((b.x1 - b.x0 + 2 * pad) / res)), ny = Math.max(2, Math.ceil((b.y1 - b.y0 + 2 * pad) / res));
  const lo = new Float32Array(nx * ny).fill(Infinity), hi = new Float32Array(nx * ny).fill(-Infinity);
  return { res, x0, y0, nx, ny, lo, hi };
}
const resFor = (L) => clamp(L / 380, 0.2, 0.8);
const filled = (hf, k) => hf.hi[k] > hf.lo[k];

// from photo views. top: [[x, y]] (tip at +x). side: [[x, z]] silhouette seen from the side (z up). end: [[y, z]].
// Without a side view the tool is T thick everywhere.
export function hfFromViews({ top, side = null, end = null, T = 10 }) {
  const b = bounds(top), L = b.x1 - b.x0, res = resFor(L), hf = makeHF(b, res);
  const mask = rasterPoly(top, hf);
  // side view, stretched to the top view's length, sitting on z = 0
  let zAt = null;
  if (side && side.length > 2) {
    const sb = bounds(side), sx = L / Math.max(1e-6, sb.x1 - sb.x0);
    const S = side.map(([x, z]) => [b.x0 + (x - sb.x0) * sx, z - sb.y0]);
    zAt = new Array(hf.nx);
    for (let i = 0; i < hf.nx; i++) zAt[i] = crossAt(S, hf.x0 + (i + 0.5) * res);
  }
  let eAt = null;
  if (end && end.length > 2) {
    const eb = bounds(end), W = b.y1 - b.y0, su = W / Math.max(1e-6, eb.x1 - eb.x0), yc = (b.y0 + b.y1) / 2, uc = (eb.x0 + eb.x1) / 2;
    const E = end.map(([u, v]) => [yc + (u - uc) * su, v - eb.y0]);
    eAt = new Array(hf.ny);
    for (let j = 0; j < hf.ny; j++) eAt[j] = crossAt(E, hf.y0 + (j + 0.5) * res);
  }
  for (let j = 0; j < hf.ny; j++) for (let i = 0; i < hf.nx; i++) {
    const k = j * hf.nx + i; if (!mask[k]) continue;
    let lo = 0, hi = T;
    if (zAt) { const z = zAt[i]; if (!z) continue; lo = z[0]; hi = z[1]; }
    if (eAt) { const e = eAt[j]; if (!e) continue; lo = Math.max(lo, e[0]); hi = Math.min(hi, e[1]); }
    if (hi > lo + 0.05) { hf.lo[k] = lo; hf.hi[k] = hi; }
  }
  return settle(hf);
}
// move the field so the lowest point is z = 0
function settle(hf) {
  let m = Infinity; for (let k = 0; k < hf.lo.length; k++) if (filled(hf, k)) m = Math.min(m, hf.lo[k]);
  if (Number.isFinite(m) && Math.abs(m) > 1e-6) for (let k = 0; k < hf.lo.length; k++) if (filled(hf, k)) { hf.lo[k] -= m; hf.hi[k] -= m; }
  return hf;
}
// from a mesh already in the tool frame: every triangle's projection writes its z-range into the cells it covers
// o.floor: an open scan (one surface, or the table cut away) is solid down to this z under every cell it covers
// o.cover: [[x, y]] an outline the grid must reach too (so gaps in the scan can be filled out to it)
export function hfFromMesh(pos, idx, o = {}) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]); }
  if (o.cover) for (const [x, y] of o.cover) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const res = resFor(x1 - x0), hf = makeHF({ x0, x1, y0, y1 }, res), { nx, ny, lo, hi } = hf;
  const put = (i, j, z) => { if (i < 0 || j < 0 || i >= nx || j >= ny) return; const k = j * nx + i; if (z < lo[k]) lo[k] = z; if (z > hi[k]) hi[k] = z; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    // vertices always count, so thin slivers and steep walls still mark their cells
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) put(Math.floor((x - hf.x0) / res), Math.floor((y - hf.y0) / res), z);
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - hf.x0) / res)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - hf.x0) / res));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - hf.y0) / res)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - hf.y0) / res));
    for (let j = j0; j <= j1; j++) {
      const y = hf.y0 + (j + 0.5) * res;
      for (let i = i0; i <= i1; i++) {
        const x = hf.x0 + (i + 0.5) * res;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        put(i, j, l1 * az + l2 * bz + l3 * cz);
      }
    }
  }
  if (o.floor != null && Number.isFinite(o.floor)) for (let k = 0; k < lo.length; k++) if (hi[k] > -Infinity) lo[k] = Math.min(lo[k], o.floor);
  return settle(hf);
}
// keep only what lies inside a top outline (photo beats scan for the outline); and inside a side silhouette
export function clipHF(hf, { top = null, side = null } = {}) {
  if (top) { const m = rasterPoly(top, hf); for (let k = 0; k < m.length; k++) if (!m[k]) { hf.lo[k] = Infinity; hf.hi[k] = -Infinity; } }
  if (side) {
    const sb = bounds(side);
    for (let i = 0; i < hf.nx; i++) {
      const z = crossAt(side.map(([x, v]) => [x, v - sb.y0]), hf.x0 + (i + 0.5) * hf.res);
      for (let j = 0; j < hf.ny; j++) { const k = j * hf.nx + i; if (!filled(hf, k)) continue; if (!z) { hf.lo[k] = Infinity; hf.hi[k] = -Infinity; continue; } hf.lo[k] = Math.max(hf.lo[k], z[0]); hf.hi[k] = Math.min(hf.hi[k], z[1]); if (hf.hi[k] <= hf.lo[k]) { hf.lo[k] = Infinity; hf.hi[k] = -Infinity; } }
    }
  }
  return settle(hf);
}
export function hfMask(hf) { const m = new Uint8Array(hf.nx * hf.ny); for (let k = 0; k < m.length; k++) m[k] = filled(hf, k) ? 1 : 0; return m; }
export function hfExtent(hf) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z1 = 0;
  for (let j = 0; j < hf.ny; j++) for (let i = 0; i < hf.nx; i++) { const k = j * hf.nx + i; if (!filled(hf, k)) continue; const x = hf.x0 + (i + 0.5) * hf.res, y = hf.y0 + (j + 0.5) * hf.res; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z1 = Math.max(z1, hf.hi[k]); }
  const r = hf.res / 2;
  return { x0: x0 - r, x1: x1 + r, y0: y0 - r, y1: y1 + r, L: x1 - x0 + hf.res, W: y1 - y0 + hf.res, T: z1 };
}
export const hfOutline = (hf) => maskToPoly(hfMask(hf), hf, { smooth: 1 });

// ---------- weight and balance ----------
// split: { d: mm from the tip, ratio: tip density ÷ handle density } — e.g. a steel blade in a plastic handle.
// g: what it weighs; densities are scaled so the total matches.
export function massProps(hf, { g = 0, split = null } = {}) {
  const e = hfExtent(hf), xs = e.x1 - (split ? split.d : 0), cell = hf.res * hf.res;
  let V = 0, M = 0, mx = 0, my = 0, mz = 0;
  for (let j = 0; j < hf.ny; j++) for (let i = 0; i < hf.nx; i++) {
    const k = j * hf.nx + i; if (!filled(hf, k)) continue;
    const x = hf.x0 + (i + 0.5) * hf.res, y = hf.y0 + (j + 0.5) * hf.res, v = (hf.hi[k] - hf.lo[k]) * cell;
    const w = split && split.ratio && x > xs ? split.ratio : 1;
    V += v; M += v * w; mx += v * w * x; my += v * w * y; mz += v * w * (hf.lo[k] + hf.hi[k]) / 2;
  }
  if (!M) return { volume: 0, cog: [0, 0, 0], dTip: 0, eff: 0 };
  const cog = [mx / M, my / M, mz / M];
  return { volume: V, cog, dTip: e.x1 - cog[0], eff: g && V ? g / (V / 1000) : 0, height: cog[2] };
}
// width and thickness along the length, from the tip: [d, width, thickness, y0, y1, z0, z1]
export function profileOf(hf, n = 72) {
  const e = hfExtent(hf), out = [];
  for (let s = 0; s < n; s++) {
    const xa = e.x1 - (e.L * s) / n, xb = e.x1 - (e.L * (s + 1)) / n;
    const i0 = Math.max(0, Math.floor((xb - hf.x0) / hf.res)), i1 = Math.min(hf.nx - 1, Math.floor((xa - hf.x0) / hf.res));
    let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = i0; i <= i1; i++) for (let j = 0; j < hf.ny; j++) { const k = j * hf.nx + i; if (!filled(hf, k)) continue; const y = hf.y0 + (j + 0.5) * hf.res; y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, hf.lo[k]); z1 = Math.max(z1, hf.hi[k]); }
    const ok = y1 >= y0, r = hf.res / 2;
    out.push(ok ? [+(e.L * (s + 0.5) / n).toFixed(1), +(y1 - y0 + hf.res).toFixed(2), +(z1 - z0).toFixed(2), +(y0 - r).toFixed(2), +(y1 + r).toFixed(2), +z0.toFixed(2), +z1.toFixed(2)] : [+(e.L * (s + 0.5) / n).toFixed(1), 0, 0, 0, 0, 0, 0]);
  }
  return out;
}
// the tool seen end-on over a span [a, b] mm from the tip: one polygon in (y, z)
export function sectionOver(hf, a, b) {
  const e = hfExtent(hf), xa = e.x1 - Math.min(a, b), xb = e.x1 - Math.max(a, b);
  const i0 = Math.max(0, Math.floor((xb - hf.x0) / hf.res)), i1 = Math.min(hf.nx - 1, Math.floor((xa - hf.x0) / hf.res));
  const r = Math.max(0.2, hf.res * 0.75), g = { x0: e.y0 - 2, y0: -2, res: r, nx: Math.ceil((e.W + 4) / r), ny: Math.ceil((e.T + 4) / r) };
  const m = new Uint8Array(g.nx * g.ny);
  let any = false;
  for (let i = i0; i <= i1; i++) for (let j = 0; j < hf.ny; j++) {
    const k = j * hf.nx + i; if (!filled(hf, k)) continue; any = true;
    const y = hf.y0 + (j + 0.5) * hf.res, u0 = Math.floor((y - hf.res / 2 - g.x0) / r), u1 = Math.floor((y + hf.res / 2 - g.x0) / r);
    const v0 = Math.max(0, Math.floor((hf.lo[k] - g.y0) / r)), v1 = Math.min(g.ny - 1, Math.floor((hf.hi[k] - g.y0) / r));
    for (let u = Math.max(0, u0); u <= Math.min(g.nx - 1, u1); u++) for (let v = v0; v <= v1; v++) m[v * g.nx + u] = 1;
  }
  if (!any) return null;
  const P = maskToPoly(m, g, { smooth: 1 });
  if (!P) return null;
  const bb = bounds(P);
  return { pts: P, w: bb.x1 - bb.x0, t: bb.y1 - bb.y0, b: bb };
}
// how well two top outlines agree: intersection over union, on the field's grid
export function iou(hf, P) {
  const a = hfMask(hf), b = rasterPoly(P, hf);
  let I = 0, U = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) I++; if (a[k] || b[k]) U++; }
  return U ? I / U : 0;
}
// a closed mesh from the field (when there's no nicer mesh to show): top and bottom surfaces and walls, cell by cell
export function hfMesh(hf, step = 1) {
  const pos = [], idx = [], { nx, ny, res } = hf;
  const F = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && filled(hf, j * nx + i);
  const quad = (a, b, c, d) => { const n = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  for (let j = 0; j < ny; j += step) for (let i = 0; i < nx; i += step) {
    const k = j * nx + i; if (!filled(hf, k)) continue;
    const x0 = hf.x0 + i * res, x1 = x0 + res * step, y0 = hf.y0 + j * res, y1 = y0 + res * step, lo = hf.lo[k], hi = hf.hi[k];
    quad([x0, y0, hi], [x1, y0, hi], [x1, y1, hi], [x0, y1, hi]); quad([x0, y0, lo], [x0, y1, lo], [x1, y1, lo], [x1, y0, lo]);
    if (!F(i - step, j)) quad([x0, y0, lo], [x0, y0, hi], [x0, y1, hi], [x0, y1, lo]);
    if (!F(i + step, j)) quad([x1, y0, lo], [x1, y1, lo], [x1, y1, hi], [x1, y0, hi]);
    if (!F(i, j - step)) quad([x0, y0, lo], [x1, y0, lo], [x1, y0, hi], [x0, y0, hi]);
    if (!F(i, j + step)) quad([x0, y1, lo], [x0, y1, hi], [x1, y1, hi], [x1, y1, lo]);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// ---------- meshes (scans) ----------
// weld coincident vertices, drop degenerate triangles
export function weld(pos, idx = null, tol = 1e-4) {
  const n = idx ? idx.length : pos.length / 3, map = new Map(), P = [], I = new Uint32Array(n);
  let bx = 0; for (let i = 0; i < pos.length; i++) bx = Math.max(bx, Math.abs(pos[i]));
  const q = 1 / Math.max(tol * Math.max(1, bx), 1e-9);
  for (let t = 0; t < n; t++) {
    const v = idx ? idx[t] : t, x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = map.get(key); if (id === undefined) { id = P.length / 3; map.set(key, id); P.push(x, y, z); }
    I[t] = id;
  }
  const keep = [];
  for (let t = 0; t < n; t += 3) if (I[t] !== I[t + 1] && I[t + 1] !== I[t + 2] && I[t] !== I[t + 2]) keep.push(I[t], I[t + 1], I[t + 2]);
  return { pos: new Float32Array(P), idx: new Uint32Array(keep) };
}
// everything an analyzer reports about a mesh
export function meshStats(pos, idx) {
  let A = 0, V = 0, cx = 0, cy = 0, cz = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const v6 = pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    V += v6 / 6; cx += v6 * (pos[a] + pos[b] + pos[c]); cy += v6 * (pos[a + 1] + pos[b + 1] + pos[c + 1]); cz += v6 * (pos[a + 2] + pos[b + 2] + pos[c + 2]);
    for (const [p, q] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; edges.set(k, (edges.get(k) || 0) + 1); }
  }
  let open = 0, nonManifold = 0; for (const n of edges.values()) { if (n === 1) open++; else if (n > 2) nonManifold++; }
  const closed = open === 0 && nonManifold === 0;
  const cog = Math.abs(V) > 1e-9 ? [cx / (24 * V), cy / (24 * V), cz / (24 * V)] : null;
  return { tris: idx.length / 3, verts: pos.length / 3, area: A, volume: Math.abs(V), closed, open, nonManifold, cog: closed ? cog : null, lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}
// keep the biggest connected piece (scans pick up bits of the table)
export function largestPiece(pos, idx) {
  const n = pos.length / 3, par = new Int32Array(n).map((_, i) => i);
  const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = f(idx[t]), b = f(idx[t + 1]), c = f(idx[t + 2]); par[b] = a; par[f(c)] = a; }
  const area = new Map();
  for (let t = 0; t < idx.length; t += 3) { const r = f(idx[t]); area.set(r, (area.get(r) || 0) + 1); }
  let best = -1, bn = -1; for (const [r, c] of area) if (c > bn) { bn = c; best = r; }
  const keep = []; for (let t = 0; t < idx.length; t += 3) if (f(idx[t]) === best) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  return { idx: new Uint32Array(keep), pieces: area.size, kept: bn / (idx.length / 3) };
}
// symmetric 3×3 eigen-decomposition (Jacobi): returns axes sorted by variance, biggest first
function eig3(A) {
  const a = A.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1; if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; } if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  return [0, 1, 2].map((i) => ({ val: a[i][i], vec: [V[0][i], V[1][i], V[2][i]] })).sort((u, v) => v.val - u.val);
}
// principal axes by surface area (robust for open scans)
export function principal(pos, idx) {
  let A = 0; const c = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const tri = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
    const w = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const m = [(pos[a] + pos[b] + pos[d]) / 3, (pos[a + 1] + pos[b + 1] + pos[d + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[d + 2]) / 3];
    tri.push(w, ...m); A += w; for (let k = 0; k < 3; k++) c[k] += w * m[k];
  }
  for (let k = 0; k < 3; k++) c[k] /= A || 1;
  // exact second moment of each triangle about the centroid: A/12 · (a aᵀ + b bᵀ + c cᵀ + s sᵀ), s = a + b + c
  for (let t = 0, k = 0; t < idx.length; t += 3, k += 4) {
    const w = tri[k]; if (!w) continue;
    const V = [idx[t], idx[t + 1], idx[t + 2]].map((v) => [pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]]);
    const sm = [V[0][0] + V[1][0] + V[2][0], V[0][1] + V[1][1] + V[2][1], V[0][2] + V[1][2] + V[2][2]];
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) C[p][q] += (w / 12) * (V[0][p] * V[0][q] + V[1][p] * V[1][q] + V[2][p] * V[2][q] + sm[p] * sm[q]);
  }
  const e = eig3(C);
  const ax = e.map((x) => x.vec);
  // right-handed frame
  const cr = [ax[0][1] * ax[1][2] - ax[0][2] * ax[1][1], ax[0][2] * ax[1][0] - ax[0][0] * ax[1][2], ax[0][0] * ax[1][1] - ax[0][1] * ax[1][0]];
  ax[2] = cr;
  return { centre: c, axes: ax };
}
export function applyFrame(pos, centre, axes, s = 1) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - centre[0], pos[i + 1] - centre[1], pos[i + 2] - centre[2]];
    for (let a = 0; a < 3; a++) out[i + a] = s * (d[0] * axes[a][0] + d[1] * axes[a][1] + d[2] * axes[a][2]);
  }
  return out;
}
// rotate 180° about one axis ('z' swaps the ends, 'x' turns it over), in place
export function turn(pos, axis) { for (let i = 0; i < pos.length; i += 3) { if (axis !== 'x') pos[i] = -pos[i]; if (axis !== 'y') pos[i + 1] = -pos[i + 1]; if (axis !== 'z') pos[i + 2] = -pos[i + 2]; } return pos; }
// centre on x and y, rest on z = 0
export function seat(pos) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  const o = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) pos[i + a] -= o[a];
  return pos;
}
// file units → mm. Phone scans are usually in metres; CAD STL in mm.
export function guessScale(size, listedL = 0) {
  const big = Math.max(...size);
  const opts = [[1000, 'm'], [10, 'cm'], [1, 'mm'], [25.4, 'in']];
  if (listedL > 0) return opts.reduce((a, b) => (Math.abs(Math.log((big * b[0]) / listedL)) < Math.abs(Math.log((big * a[0]) / listedL)) ? b : a));
  return opts.find(([f]) => big * f >= 8 && big * f <= 1500) || [1, 'mm'];
}
// fewer triangles: snap vertices to a grid, merge, drop what collapses
export function decimate(pos, idx, cell) {
  if (!(cell > 0)) return { pos, idx };
  const map = new Map(), P = [], cnt = [], I = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) {
    const v = idx[t] * 3, key = `${Math.floor(pos[v] / cell)},${Math.floor(pos[v + 1] / cell)},${Math.floor(pos[v + 2] / cell)}`;
    let id = map.get(key);
    if (id === undefined) { id = cnt.length; map.set(key, id); P.push(0, 0, 0); cnt.push(0); }
    P[id * 3] += pos[v]; P[id * 3 + 1] += pos[v + 1]; P[id * 3 + 2] += pos[v + 2]; cnt[id]++;
    I[t] = id;
  }
  for (let i = 0; i < cnt.length; i++) { P[i * 3] /= cnt[i]; P[i * 3 + 1] /= cnt[i]; P[i * 3 + 2] /= cnt[i]; }
  const keep = [], seen = new Set();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2]; if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join('_'); if (seen.has(k)) continue; seen.add(k); keep.push(a, b, c);
  }
  return { pos: new Float32Array(P), idx: new Uint32Array(keep) };
}

// ---------- where a tool catches ----------
// The tool drops tip-first through an opening and stops at the span [a, b] you picked. c(s) is the size that has to
// pass: width for a fork whose prongs sit side by side, the circle round the section for a ring.
export function catchAt(profile, a, b, { measure = 'width', clear = 1 } = {}) {
  const size = (r) => (measure === 'ring' ? Math.hypot(r[1], r[2]) * 0.92 : measure === 'thick' ? r[2] : r[1]);
  const before = profile.filter((r) => r[0] < a && r[1] > 0), at = profile.filter((r) => r[0] >= a && r[0] <= b && r[1] > 0);
  const pass = before.length ? Math.max(...before.map(size)) : 0, hold = at.length ? Math.max(...at.map(size)) : 0;
  const open = pass + 2 * clear;
  return { open, pass, hold, catches: hold > open + 1, margin: hold - open };
}

// ---------- scan clean-up: the table it sat on, the hand that held it ----------
// The table: the flat patch that holds a good share of the surface and reaches past everything else on at least two
// sides (a tool's own flat face never reaches past the tool). Positions in mm. Returns {n, d, frac, side} or null:
// points p with side·(n·p − d) > 0 are above the table.
export function findTable(pos, idx, o = {}) {
  const nt = idx.length / 3, eps = o.eps ?? 1.0;
  const N = new Float32Array(nt * 3), Cc = new Float32Array(nt * 3), A = new Float32Array(nt);
  let tot = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz);
    A[t] = L / 2; tot += A[t]; if (L) { nx /= L; ny /= L; nz /= L; }
    N[3 * t] = nx; N[3 * t + 1] = ny; N[3 * t + 2] = nz;
    Cc[3 * t] = (pos[a] + pos[b] + pos[c]) / 3; Cc[3 * t + 1] = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3; Cc[3 * t + 2] = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
  }
  if (!tot) return null;
  // area-weighted sampling, deterministic
  const cum = new Float64Array(nt); let s = 0; for (let t = 0; t < nt; t++) { s += A[t]; cum[t] = s; }
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = () => { const r = rnd() * s; let lo = 0, hi = nt - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return lo; };
  const step = Math.max(1, Math.floor(nt / 20000)); // score on a subsample for speed
  // keep the best few distinct planes; a slab's underside can outscore its top, so each is tried in turn
  const cands = [];
  for (let it = 0; it < 160; it++) {
    const t = pick(), n = [N[3 * t], N[3 * t + 1], N[3 * t + 2]]; if (!(n[0] || n[1] || n[2])) continue;
    const d = n[0] * Cc[3 * t] + n[1] * Cc[3 * t + 1] + n[2] * Cc[3 * t + 2];
    if (cands.some((c) => Math.abs(c.n[0] * n[0] + c.n[1] * n[1] + c.n[2] * n[2]) > 0.98 && Math.abs(Math.abs(c.d) - Math.abs(d)) < 2 * eps)) continue;
    let inl = 0;
    for (let u = 0; u < nt; u += step) { const dist = n[0] * Cc[3 * u] + n[1] * Cc[3 * u + 1] + n[2] * Cc[3 * u + 2] - d; if (Math.abs(dist) < eps && Math.abs(n[0] * N[3 * u] + n[1] * N[3 * u + 1] + n[2] * N[3 * u + 2]) > 0.95) inl += A[u]; }
    cands.push({ n, d, inl });
  }
  cands.sort((p, q) => q.inl - p.inl);
  for (const c of cands.slice(0, 4)) { const r = testPlane(c.n, c.d); if (r) return r; }
  return null;
  function testPlane(n, d) {
    const e1 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u1 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]], ul = Math.hypot(...u1); u1[0] /= ul; u1[1] /= ul; u1[2] /= ul;
    const u2 = [n[1] * u1[2] - n[2] * u1[1], n[2] * u1[0] - n[0] * u1[2], n[0] * u1[1] - n[1] * u1[0]];
    const box = () => [Infinity, -Infinity, Infinity, -Infinity];
    const bxIn = box(), bxPos = box(), bxNeg = box();
    let inA = 0, posA = 0, negA = 0;
    for (let t = 0; t < nt; t++) {
      const x = Cc[3 * t], y = Cc[3 * t + 1], z = Cc[3 * t + 2], dist = n[0] * x + n[1] * y + n[2] * z - d;
      const p = u1[0] * x + u1[1] * y + u1[2] * z, q = u2[0] * x + u2[1] * y + u2[2] * z;
      const on = Math.abs(dist) < eps && Math.abs(n[0] * N[3 * t] + n[1] * N[3 * t + 1] + n[2] * N[3 * t + 2]) > 0.95;
      const B = on ? bxIn : dist > 3 * eps ? bxPos : dist < -3 * eps ? bxNeg : null;
      if (on) inA += A[t]; else if (dist > 3 * eps) posA += A[t]; else if (dist < -3 * eps) negA += A[t];
      if (B) { B[0] = Math.min(B[0], p); B[1] = Math.max(B[1], p); B[2] = Math.min(B[2], q); B[3] = Math.max(B[3], q); }
    }
    const frac = inA / tot;
    if (frac < (o.minFrac ?? 0.08)) return null;
      const m = o.margin ?? 4;
    const beyond = (B) => (bxIn[0] < B[0] - m) + (bxIn[1] > B[1] + m) + (bxIn[2] < B[2] - m) + (bxIn[3] > B[3] + m);
    // the tool is the bigger side, and a table reaches past it on two sides or more. A face of the tool never does:
    // the tool's own body is behind it, at least as big.
    const side = posA >= negA ? 1 : -1, B = side > 0 ? bxPos : bxNeg;
    if (!(Math.max(posA, negA) > 0) || beyond(B) < 2) return null;
    return { n, d, frac, side, eps };
  }
}
// drop everything on the table or under it; returns a new index
export function cutTable(pos, idx, tb, keepAbove = 0) {
  const lim = keepAbove || tb.eps * 1.2, out = [];
  for (let t = 0; t < idx.length; t += 3) {
    let ok = false;
    for (let e = 0; e < 3; e++) { const v = idx[t + e] * 3; if (tb.side * (tb.n[0] * pos[v] + tb.n[1] * pos[v + 1] + tb.n[2] * pos[v + 2] - tb.d) > lim) { ok = true; break; } }
    if (ok) out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return new Uint32Array(out);
}
// keep triangles whose centre lies in x ∈ [a, b]
export function cutX(pos, idx, a, b) {
  const out = [];
  for (let t = 0; t < idx.length; t += 3) { const x = (pos[idx[t] * 3] + pos[idx[t + 1] * 3] + pos[idx[t + 2] * 3]) / 3; if (x >= a && x <= b) out.push(idx[t], idx[t + 1], idx[t + 2]); }
  return new Uint32Array(out);
}
// where along a scan the photo outline fits best when the scan is longer than the photo (a hand or a stand on one end).
// Slides the outline (and its three turned copies) along x over the scan's top view; returns {a, b, iou, flip} or null.
export function slideMatch(hf, top) {
  const tb = bounds(top), Lp = tb.x1 - tb.x0, e = hfExtent(hf);
  if (e.L < Lp * 1.06) return null;
  const mask = hfMask(hf), { nx, ny, res } = hf;
  const variants = [top, mirrorX(top), mirrorY(top), mirrorY(mirrorX(top))];
  let best = null;
  for (let vI = 0; vI < 4; vI++) {
    const P = variants[vI], pb = bounds(P), cy = (pb.y0 + pb.y1) / 2, ey = (e.y0 + e.y1) / 2;
    for (let a = e.x0; a + Lp <= e.x1 + res; a += Math.max(res, Lp / 120)) {
      const Q = P.map(([x, y]) => [x - pb.x0 + a, y - cy + ey]);
      const m = rasterPoly(Q, hf);
      const i0 = Math.max(0, Math.floor((a - hf.x0) / res) - 1), i1 = Math.min(nx - 1, Math.ceil((a + Lp - hf.x0) / res) + 1);
      let I = 0, U = 0;
      for (let j = 0; j < ny; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (mask[k] && m[k]) I++; if (mask[k] || m[k]) U++; }
      const iu = U ? I / U : 0;
      if (!best || iu > best.iou) best = { a, b: a + Lp, iou: iu, flip: vI };
    }
  }
  return best;
}
// a fat end that isn't the tool: width + thickness jump well past the rest at one end (a hand, a stand, a lump of
// putty). A suggestion only — a screwdriver's handle looks the same. Returns {end: 'tip'|'back', x (cut here), keep: [a, b]}.
export function endBlob(hf) {
  const prof = profileOf(hf, 60), g = prof.map((r) => r[1] + r[2]), n = g.length; // row 0 is at the tip (+x)
  const mid = g.slice(Math.floor(n * 0.25), Math.ceil(n * 0.75)).filter((v) => v > 0).sort((a, b) => a - b);
  const med = mid[Math.floor(mid.length / 2)] || 0; if (!med) return null;
  const e = hfExtent(hf), out = [];
  for (const [start, dir, end] of [[0, 1, 'tip'], [n - 1, -1, 'back']]) {
    let k = start, run = 0;
    while (k >= 0 && k < n && g[k] > 2.2 * med) { run++; k += dir; }
    if (run >= 3 && run <= n * 0.4 && k >= 0 && k < n) {
      const x = e.x1 - prof[k][0];
      out.push({ end, x, keep: end === 'tip' ? [e.x0 - 1, x] : [x, e.x1 + 1], ratio: g[start] / med });
    }
  }
  return out.length ? out.sort((a, b) => b.ratio - a.ratio)[0] : null;
}
// fill the cells a scan missed (shiny steel, a cut-away hand) from another height field, inside a mask
export function fillFrom(hf, src, top) {
  const m = rasterPoly(top, hf); let n = 0;
  for (let j = 0; j < hf.ny; j++) for (let i = 0; i < hf.nx; i++) {
    const k = j * hf.nx + i; if (!m[k] || filled(hf, k)) continue;
    const x = hf.x0 + (i + 0.5) * hf.res, y = hf.y0 + (j + 0.5) * hf.res;
    const si = Math.floor((x - src.x0) / src.res), sj = Math.floor((y - src.y0) / src.res);
    if (si < 0 || sj < 0 || si >= src.nx || sj >= src.ny) continue;
    const sk = sj * src.nx + si; if (!filled(src, sk)) continue;
    hf.lo[k] = src.lo[sk]; hf.hi[k] = src.hi[sk]; n++;
  }
  return n;
}

// lay a scan on the table it sat on: z up from the table, x along its length (principal axis in the table's plane),
// centred in x and y. tb from findTable; positions in mm.
export function onTable(pos, idx, tb) {
  const up = tb.n.map((v) => v * tb.side);
  const fr = principal(pos, idx);
  let ax = fr.axes[0]; const k = ax[0] * up[0] + ax[1] * up[1] + ax[2] * up[2];
  ax = [ax[0] - k * up[0], ax[1] - k * up[1], ax[2] - k * up[2]];
  let l = Math.hypot(...ax);
  if (l < 1e-6) { ax = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const kk = ax[0] * up[0] + ax[1] * up[1] + ax[2] * up[2]; ax = [ax[0] - kk * up[0], ax[1] - kk * up[1], ax[2] - kk * up[2]]; l = Math.hypot(...ax); }
  ax = ax.map((v) => v / l);
  const ay = [up[1] * ax[2] - up[2] * ax[1], up[2] * ax[0] - up[0] * ax[2], up[0] * ax[1] - up[1] * ax[0]];
  const P = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    P[i] = x * ax[0] + y * ax[1] + z * ax[2]; P[i + 1] = x * ay[0] + y * ay[1] + z * ay[2];
    P[i + 2] = tb.side * (x * tb.n[0] + y * tb.n[1] + z * tb.n[2] - tb.d);
  }
  return seatXY(P, idx);
}
// centre in x and y over the triangles in use, leave z alone
export function seatXY(P, idx) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let t = 0; t < idx.length; t++) { const v = idx[t] * 3; x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= cy; }
  return P;
}
// x-extent of the triangles in use
export function extentX(P, idx) { let x0 = Infinity, x1 = -Infinity; for (let t = 0; t < idx.length; t++) { const x = P[idx[t] * 3]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { x0, x1 }; }
// empty the cells over x ∈ [a, b] (to be filled again from the photos)
export function clearX(hf, a, b) {
  for (let i = 0; i < hf.nx; i++) { const x = hf.x0 + (i + 0.5) * hf.res; if (x < a || x > b) continue; for (let j = 0; j < hf.ny; j++) { const k = j * hf.nx + i; hf.lo[k] = Infinity; hf.hi[k] = -Infinity; } }
  return hf;
}
// only the vertices the index uses, renumbered (so a stored scan doesn't carry the table along)
export function compact(pos, idx) {
  const map = new Int32Array(pos.length / 3).fill(-1), P = [], I = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) { const v = idx[t]; if (map[v] < 0) { map[v] = P.length / 3; P.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); } I[t] = map[v]; }
  return { pos: new Float32Array(P), idx: I };
}
// centre x and y and put the lowest point at z = 0, over the triangles in use only
export function seatIdx(P, idx) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < idx.length; t++) { const v = idx[t] * 3; for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[v + a]); hi[a] = Math.max(hi[a], P[v + a]); } }
  const o = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) P[i + a] -= o[a];
  return P;
}
// the triangles of a that aren't in b (both index lists into the same positions)
export function minusTris(a, b) {
  const key = (I, t) => { const p = [I[t], I[t + 1], I[t + 2]].sort((x, y) => x - y); return `${p[0]}_${p[1]}_${p[2]}`; };
  const S = new Set(); for (let t = 0; t < b.length; t += 3) S.add(key(b, t));
  const out = []; for (let t = 0; t < a.length; t += 3) if (!S.has(key(a, t))) out.push(a[t], a[t + 1], a[t + 2]);
  return new Uint32Array(out);
}
// fill empty cells inside the outline by carrying the nearest scanned cell along the length (same row): a stretch
// under a hand gets the neighbouring cross-section, a shiny patch its surroundings. Returns cells filled.
export function fillNear(hf, top, maxGap = 1e9) {
  const m = rasterPoly(top, hf), { nx, ny, res } = hf, lo2 = Float32Array.from(hf.lo), hi2 = Float32Array.from(hf.hi);
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!m[k] || filled(hf, k)) continue;
    let src = -1;
    for (let d = 1; d < nx && d * res <= maxGap; d++) {
      const a = i - d, b = i + d;
      if (a >= 0 && filled(hf, j * nx + a)) { src = j * nx + a; break; }
      if (b < nx && filled(hf, j * nx + b)) { src = j * nx + b; break; }
    }
    if (src >= 0) { lo2[k] = hf.lo[src]; hi2[k] = hf.hi[src]; n++; }
  }
  hf.lo.set(lo2); hf.hi.set(hi2);
  // rows the scan never reached (the outline's very edge): the nearest cell across, in the same column
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const k = j * nx + i; if (!m[k] || filled(hf, k)) continue;
    let src = -1;
    for (let d = 1; d < ny && d * res <= 6; d++) { const a = j - d, b = j + d; if (a >= 0 && filled(hf, a * nx + i)) { src = a * nx + i; break; } if (b < ny && filled(hf, b * nx + i)) { src = b * nx + i; break; } }
    if (src >= 0) { hf.lo[k] = hf.lo[src]; hf.hi[k] = hf.hi[src]; n++; }
  }
  return n;
}
