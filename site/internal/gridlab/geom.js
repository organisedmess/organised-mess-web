// GRIDLAB — geometry. Manifold (WASM) CSG; every builder returns a guaranteed-manifold solid.
// Model axes: X right (seen from the front), Y back toward the board/wall, Z up. Units mm.
// Gridfinity numbers from the spec as implemented in Gridfinity Rebuilt (kennetek).

export const GF = {
  grid: 42,            // XY unit
  hu: 7,               // height unit
  bin: 41.5,           // 1-unit bin = grid − 0.5 (0.25 per side)
  rBin: 3.75,          // bin outer corner radius
  rPlate: 4,           // baseplate cell corner radius
  // bin foot, z up from the foot's underside: [z, inset from the 41.5 outline]
  foot: [[0, 2.95], [0.8, 2.15], [2.6, 2.15], [4.75, 0]],
  // baseplate socket, depth below the plate top: [depth, inset from the 42 cell edge]
  socket: [[0, 0], [2.15, 2.15], [3.95, 2.15], [4.65, 2.85]],
  socketClear: 0.35,   // floor sits 0.35 below the socket profile
  lip: { inner: 0.7, wall: 1.8, outer: 1.9 }, // stacking lip, 4.4 tall
  magnet: { d: 6.5, depth: 2.4, off: 13 },     // 6 × 2 magnets, 26 apart
  screw: { d: 3, depth: 6 },
};

// print tolerances (set from the printer/material panel): mm
// hole: added to every hole and cut-out width · stud: added to stud and pin Ø
// socket: widens every baseplate socket per side · bin: shrinks every bin and holder outline per side
// dove: dovetail groove clearance, normal to each flank
export const TOL = { hole: 0.1, stud: 0, socket: 0, bin: 0, dove: 0.2 };
export function setTolerances(t) { Object.assign(TOL, t); }

let W = null;
export function init(wasm) { W = wasm; }
export function ready() { return !!W; }

// ---------- memory bag ----------
class Bag {
  constructor() { this.a = []; }
  k(m) { this.a.push(m); return m; }
  free(...keep) { for (const m of this.a) if (!keep.includes(m)) { try { m.delete(); } catch (e) { /* already freed */ } } this.a = []; }
}

// ---------- 2D helpers ----------
const segFor = (r) => Math.max(4, Math.min(16, Math.round(r * 2.5) + 3));

function ccw(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
  return s >= 0 ? pts : pts.slice().reverse();
}

// rounded rectangle centred on (cx, cy); radii per corner [TR, TL, BL, BR] or one number
export function rrPts(w, h, r, cx = 0, cy = 0) {
  const rs = Array.isArray(r) ? r : [r, r, r, r];
  const lim = Math.min(w, h) / 2 - 1e-3;
  const c = [[w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]];
  const sx = [-1, 1, 1, -1], sy = [-1, -1, 1, 1];
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const rr = Math.max(0, Math.min(rs[k], lim));
    if (rr < 0.02) { pts.push([cx + c[k][0], cy + c[k][1]]); continue; }
    const ox = c[k][0] + sx[k] * rr, oy = c[k][1] + sy[k] * rr, n = segFor(rr);
    for (let s = 0; s <= n; s++) {
      const t = ((k * 90) + (s * 90) / n) * Math.PI / 180;
      pts.push([cx + ox + rr * Math.cos(t), cy + oy + rr * Math.sin(t)]);
    }
  }
  return pts;
}
function circlePts(r, cx = 0, cy = 0, n = 0) {
  n = n || Math.max(16, Math.min(64, Math.round(r * 6) + 12));
  const pts = [];
  for (let s = 0; s < n; s++) { const t = (s / n) * Math.PI * 2; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return pts;
}
function teardropPts(r, cx = 0, cy = 0) {
  const n = 36, pts = [[cx, cy + r * Math.SQRT2]];
  for (let s = 0; s <= n; s++) { const t = (135 + (s * 270) / n) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return pts;
}
// convex cut-out shapes, grown by g on every side
export function shapePts(shape, a, b, g = 0) {
  if (shape === 'round') return circlePts(a / 2 + g);
  if (shape === 'hex') { const R = (a / 2) / Math.cos(Math.PI / 6) + g / Math.cos(Math.PI / 6); const p = []; for (let s = 0; s < 6; s++) { const t = (s * 60 + 30) * Math.PI / 180; p.push([R * Math.cos(t), R * Math.sin(t)]); } return p; }
  if (shape === 'slot') {
    const w = a + 2 * g, h = b + 2 * g, r = Math.min(w, h) / 2, n = 16, pts = [];
    if (Math.abs(w - h) < 1e-6) return circlePts(r);
    const off = (Math.max(w, h) - Math.min(w, h)) / 2, along = w > h ? [1, 0] : [0, 1];
    for (const side of [1, -1]) {
      const cx = along[0] * off * side, cy = along[1] * off * side;
      const a0 = (w > h ? (side > 0 ? -90 : 90) : (side > 0 ? 0 : 180));
      for (let s = 0; s <= n; s++) { const t = (a0 + (180 * s) / n) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    }
    return pts;
  }
  return rrPts(a + 2 * g, b + 2 * g, 1 + g);
}

const lift = (pts, z, dx = 0, dy = 0) => pts.map(([x, y]) => [x + dx, y + dy, z]);

// ---------- 3D helpers ----------
function hull(bag, rings) { return bag.k(W.Manifold.hull(rings.flat())); }
function prism(bag, pts, z0, z1) {
  const cs = bag.k(new W.CrossSection([ccw(pts)]));
  return bag.k(bag.k(cs.extrude(z1 - z0)).translate([0, 0, z0]));
}
function union(bag, list) { return list.length === 1 ? list[0] : bag.k(W.Manifold.union(list)); }
function cylinder(bag, r, z0, z1, cx = 0, cy = 0, n = 0) { return prism(bag, circlePts(r, cx, cy, n), z0, z1); }
// extrude a profile drawn in the XZ plane (u = x, v = z) through y ∈ [−t, 0]
function prismXZ(bag, pts, t) {
  const cs = bag.k(new W.CrossSection([ccw(pts)]));
  return bag.k(bag.k(cs.extrude(t)).rotate([90, 0, 0])); // (u,v,w) → (u, −w, v)
}
// extrude a profile drawn in the YZ plane (u = y, v = z) through x ∈ [x0, x1]
function prismYZ(bag, pts, x0, x1) {
  const cs = bag.k(new W.CrossSection([ccw(pts)]));
  const m = bag.k(cs.extrude(x1 - x0));
  return bag.k(bag.k(m.warp(v => { const u = v[0], vv = v[1], w = v[2]; v[0] = w + x0; v[1] = u; v[2] = vv; })));
}

// ---------- Gridfinity primitives ----------
let footCache = null;
function footCell(bag) {
  const e = TOL.bin;
  const r = (i) => GF.rBin - i - e, s = (i) => GF.bin - 2 * (i + e);
  const ring = (i, z) => lift(rrPts(s(i), s(i), Math.max(0.3, r(i))), z);
  const a = hull(bag, [ring(2.95, 0), ring(2.15, 0.8), ring(2.15, 2.6)]);
  const b = hull(bag, [ring(2.15, 2.6), ring(0.01, 4.76), ring(0.01, 5.0)]); // 0.01 inside the body wall: no coincident surfaces
  return union(bag, [a, b]);
}
function feet(bag, nx, ny) {
  const f = footCell(bag), list = [];
  for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) list.push(bag.k(f.translate([(a - (nx - 1) / 2) * 42, (c - (ny - 1) / 2) * 42, 0])));
  return union(bag, list);
}
// socket cutter for one cell, top of plate at T, floor at zb
function socketCutter(bag, T, zb, cx, cy) {
  const e = TOL.socket;
  const s = (i) => 42 - 2 * (i - e), r = (i) => Math.max(0.3, GF.rPlate - i + e);
  const ring = (i, z) => lift(rrPts(s(i), s(i), r(i)), z, cx, cy);
  const parts = [];
  if (T - 4.65 - zb > 1e-3) parts.push(hull(bag, [ring(2.85, zb), ring(2.85, T - 4.65)]));
  parts.push(hull(bag, [ring(2.85, T - 4.65), ring(2.15, T - 3.95), ring(2.15, T - 2.15)]));
  parts.push(hull(bag, [ring(2.15, T - 2.15), ring(0, T), ring(-0.2, T + 0.2)]));
  return union(bag, parts);
}
// magnet pocket: 'press' = Ø6.5 round; 'ribs' = 8 crush ribs (5.9 inside the ribs) that grip without glue
function magnetPts(style, cx, cy) {
  const R = (GF.magnet.d + TOL.hole) / 2;
  if (style !== 'ribs') return circlePts(R, cx, cy, 40);
  const r = (5.9 + TOL.hole) / 2, pts = [], n = 96;
  for (let s = 0; s < n; s++) {
    const t = (s / n) * Math.PI * 2, k = ((t / (Math.PI * 2)) * 8) % 1;
    const rr = Math.abs(k - 0.5) < 0.07 ? r : R;
    pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return pts;
}
function magnetPockets(bag, cx, cy, z0, z1, style = 'press', which = null) {
  const o = GF.magnet.off, list = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    if (which && !which(sx, sy)) continue;
    list.push(prism(bag, magnetPts(style, cx + sx * o, cy + sy * o), z0, z1));
  }
  return list;
}
// for multi-cell bins: keep only the pockets at the outer corners when cornersOnly
function cellMagnets(bag, nx, ny, a, c, cx, cy, z0, z1, style, cornersOnly) {
  const which = cornersOnly ? (sx, sy) => (sx < 0 ? a === 0 : a === nx - 1) && (sy < 0 ? c === 0 : c === ny - 1) : null;
  return magnetPockets(bag, cx, cy, z0, z1, style, which);
}

// ---------- BOX ----------
// kind: 'bin' | 'lidFlat' (feet + deck, sits in the lip below) | 'lidStack' (1U bin with lip — stacks both ways)
export function box(p) {
  const bag = new Bag();
  const nx = p.nx, ny = p.ny;
  const Wo = 42 * nx - 0.5 - 2 * TOL.bin, Do = 42 * ny - 0.5 - 2 * TOL.bin;
  const ringO = (i, z) => lift(rrPts(Wo - 2 * i, Do - 2 * i, Math.max(0.3, GF.rBin - i)), z);
  const holesIn = (body) => {
    const holes = [];
    for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) {
      const cx = (a - (nx - 1) / 2) * 42, cy = (c - (ny - 1) / 2) * 42;
      if (p.magnets && p.magnets !== 'off') holes.push(...cellMagnets(bag, nx, ny, a, c, cx, cy, -1, GF.magnet.depth, p.magnets === true ? 'press' : p.magnets, p.magCorners));
      if (p.screws) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        if (p.magCorners && !((sx < 0 ? a === 0 : a === nx - 1) && (sy < 0 ? c === 0 : c === ny - 1))) continue;
        holes.push(cylinder(bag, (GF.screw.d + TOL.hole) / 2, -1, GF.screw.depth, cx + sx * 13, cy + sy * 13));
      }
    }
    return holes.length ? bag.k(W.Manifold.difference([body, ...holes])) : body;
  };
  if (p.kind === 'lidFlat') {
    const deck = prism(bag, rrPts(Wo, Do, GF.rBin), 4.75, 4.75 + (p.deck || 1.6));
    let body = holesIn(union(bag, [deck, feet(bag, nx, ny)]));
    bag.free(body);
    return body;
  }
  const U = p.kind === 'lidStack' ? 1 : p.U;
  const H = GF.hu * U;
  const lip = p.kind === 'lidStack' ? 'normal' : (p.lip === true ? 'normal' : p.lip === false ? 'none' : p.lip);
  const wall = Math.min(2.4, Math.max(0.8, p.wall));
  const zf = Math.max(5.2, p.kind === 'lidStack' ? 6 : p.floorZ);
  const top = lip !== 'none' ? H + 3.8 : H;
  const outer = prism(bag, rrPts(Wo, Do, GF.rBin), 4.75, top);
  let body = union(bag, [outer, feet(bag, nx, ny)]);
  const cut = [];
  if (lip === 'normal') {
    cut.push(hull(bag, [ringO(wall, zf), ringO(wall, H - (2.6 - wall)), ringO(2.6, H)]));
    cut.push(hull(bag, [ringO(2.6, H), ringO(1.9, H + 0.7), ringO(1.9, H + 2.5)]));
    cut.push(hull(bag, [ringO(1.9, H + 2.5), ringO(0.6, H + 3.8), ringO(-0.4, H + 4.8)]));
  } else if (lip === 'reduced') {
    // keeps the top slope that locates the bin above; no inward step, so nothing overhangs the inside
    cut.push(hull(bag, [ringO(wall, zf), ringO(wall, H + 2.5 - (1.9 - wall))]));
    cut.push(hull(bag, [ringO(wall, H + 2.5 - (1.9 - wall)), ringO(1.9, H + 2.5), ringO(1.9, H + 2.5)]));
    cut.push(hull(bag, [ringO(1.9, H + 2.5), ringO(0.6, H + 3.8), ringO(-0.4, H + 4.8)]));
  } else {
    cut.push(prism(bag, rrPts(Wo - 2 * wall, Do - 2 * wall, Math.max(0.3, GF.rBin - wall)), zf, H + 1));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  if (p.kind === 'lidStack') { body = holesIn(body); bag.free(body); return body; }
  // interior furniture
  const add = [];
  const ix0 = -Wo / 2 + wall, ix1 = Wo / 2 - wall, iy0 = -Do / 2 + wall, iy1 = Do / 2 - wall;
  const zt = lip !== 'none' ? H - 0.5 : H;
  const zd = zf + (zt - zf) * Math.min(1, Math.max(0.2, (p.divH ?? 100) / 100));
  const dT = 1.2;
  const xs = [], ys = [];
  for (let k = 1; k < p.divX; k++) xs.push(ix0 + ((ix1 - ix0) * k) / p.divX);
  for (let k = 1; k < p.divY; k++) ys.push(iy0 + ((iy1 - iy0) * k) / p.divY);
  for (const x of xs) add.push(prism(bag, rrPts(dT, iy1 - iy0 + 1, 0, x, (iy0 + iy1) / 2), zf - 0.2, zd));
  for (const y of ys) add.push(prism(bag, rrPts(ix1 - ix0 + 1, dT, 0, (ix0 + ix1) / 2, y), zf - 0.2, zd));
  const rowB = [iy0, ...ys, iy1], colB = [ix0, ...xs, ix1];
  const label = p.label === true ? 'full' : p.label === false ? 'off' : p.label;
  if (label && label !== 'off') {
    const L = Math.min(p.labelW, (iy1 - iy0) / p.divY - 2);
    for (let r = 0; r < p.divY; r++) {
      const yb = rowB[r + 1] - (r < p.divY - 1 ? dT / 2 - 0.2 : -0.4);
      for (let k = 0; k < p.divX; k++) {
        let x0 = colB[k] + (k > 0 ? dT / 2 - 0.2 : -0.4), x1 = colB[k + 1] - (k < p.divX - 1 ? dT / 2 - 0.2 : -0.4);
        const span = x1 - x0, len = Math.min(span, p.labelLen || 30);
        if (label === 'left') x1 = x0 + len; else if (label === 'right') x0 = x1 - len; else if (label === 'center') { x0 = (x0 + x1) / 2 - len / 2; x1 = x0 + len; }
        add.push(prismYZ(bag, [[yb, zt], [yb - L, zt], [yb, zt - L]], x0, x1));
      }
    }
  }
  if (p.scoop) {
    const R = Math.min(p.scoopR, zt - zf - 1, (iy1 - iy0) / p.divY - 4);
    if (R > 2) {
      for (let r = 0; r < p.divY; r++) {
        const yf = rowB[r] + (r > 0 ? dT / 2 - 0.2 : -0.4);
        const pts = [[yf, zf - 0.2], [yf + R, zf - 0.2]];
        const n = 16;
        for (let s = 1; s < n; s++) { const t = Math.PI / 2 * (s / n); pts.push([yf + R - R * Math.sin(t), zf + R - R * Math.cos(t)]); }
        pts.push([yf, zf + R]);
        add.push(prismYZ(bag, pts, ix0 - 0.4, ix1 + 0.4));
      }
    }
  }
  if (add.length) body = bag.k(W.Manifold.union([body, ...add]));
  const sub = [];
  // finger cut-out in the front wall (−Y), U-shaped, through lip and wall
  if (p.cutout && p.cutoutW > 0) {
    const w = Math.min(Wo - 2 * GF.rBin - 2, Wo * p.cutoutW / 100), d = Math.min(top - zf - 1, p.cutoutD);
    const r = Math.min(w / 2, d) - 0.01;
    sub.push(bag.k(prismXZ(bag, rrPts(w, d + 10, [0, 0, r, r], 0, top - d + (d + 10) / 2), wall + 4).translate([0, -Do / 2 + wall + 2, 0])));
  }
  // see-through hex pattern in the walls (points up, so the holes print without support)
  if (p.pattern && p.pattern !== 'off') {
    const rH = p.patR || 4, gap = p.patGap || 1.6;
    const zlo = 4.75 + 3 + (p.scoop ? 0 : 0), zhi = (lip !== 'none' ? H - 1.5 : H - 3);
    const hexPts = (cx, cz) => { const pts = []; for (let s = 0; s < 6; s++) { const t = (90 + s * 60) * Math.PI / 180; pts.push([cx + rH * Math.cos(t), cz + rH * Math.sin(t)]); } return pts; };
    const pitchX = Math.sqrt(3) * rH + gap, pitchZ = 1.5 * rH + gap * 0.866;
    const lay = (len, zlo2, zhi2) => {
      const out = [], half = len / 2 - GF.rBin - 1.5 - rH * 0.866;
      for (let row = 0, z = zlo2 + rH; z + rH <= zhi2 + 1e-6; row++, z += pitchZ) {
        const off = row % 2 ? pitchX / 2 : 0;
        for (let x = -half + ((2 * half) % pitchX) / 2 + off; x <= half + 1e-6; x += pitchX) out.push([x, z]);
      }
      return out;
    };
    const walls = p.pattern === 'sides' ? ['L', 'R'] : p.pattern === 'front' ? ['F'] : ['F', 'B', 'L', 'R'];
    const scoopTop = p.scoop ? zf + Math.min(p.scoopR, zt - zf - 1) : 0;
    const labelBot = label && label !== 'off' ? zt - p.labelW : 1e9;
    for (const wname of walls) {
      const along = wname === 'F' || wname === 'B' ? Wo : Do;
      const zl = wname === 'F' ? Math.max(zlo, scoopTop + 1) : zlo, zh = wname === 'B' ? Math.min(zhi, labelBot - 1) : zhi;
      for (const [u, z] of lay(along, zl, zh)) {
        if (wname === 'F' || wname === 'B') {
          if (wname === 'F' && p.cutout && Math.abs(u) < Wo * p.cutoutW / 200 + rH + 1) continue;
          const y0 = wname === 'F' ? -Do / 2 + wall + 0.6 : Do / 2 + 1;
          sub.push(bag.k(prismXZ(bag, hexPts(u, z), wall + 1.6).translate([0, y0, 0])));
        } else {
          const x0 = wname === 'L' ? -Wo / 2 - 1 : Wo / 2 - wall - 0.6;
          sub.push(prismYZ(bag, hexPts(u, z), x0, x0 + wall + 1.6));
        }
      }
    }
  }
  if (sub.length) body = bag.k(W.Manifold.difference([body, ...sub]));
  body = holesIn(body);
  bag.free(body);
  return body;
}

// ---------- outline cut-outs (2D) ----------
// finger modes: none · ends · sides · end · side · centre. Notch = stadium fingerD wide, fingerLen long, centred on the pocket edge.
export function fingerMode(g) { return g.fingerMode || (g.fingers === 2 ? 'ends' : g.fingers === 1 ? 'centre' : 'none'); }
function outlineCS(bag, g) {
  const sc = g.scale || 1;
  const cs0 = bag.k(new W.CrossSection([ccw(g.pts.map(([x, y]) => [x * sc, y * sc]))]));
  let cs = (g.rot || 0) ? bag.k(cs0.rotate(g.rot)) : cs0;
  const tool = cs;
  if ((g.clear || 0) + TOL.hole / 2 > 0) cs = bag.k(cs.offset((g.clear || 0) + TOL.hole / 2, 'Round', 2, 24));
  const mode = fingerMode(g);
  let notch = null;
  if (mode !== 'none') {
    const bb = cs.bounds(), fd = g.fingerD || 20, fl = Math.max(fd, g.fingerLen || fd);
    const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
    // scoops sit on the pocket's own extreme points, so they always open into the pocket
    const P = cs.toPolygons().flat();
    const ext = (f) => P.reduce((a, q) => (f(q) > f(a) ? q : a), P[0]);
    const L0 = ext((q) => -q[0]), R0 = ext((q) => q[0]), B0 = ext((q) => -q[1]), T0 = ext((q) => q[1]);
    const spots = mode === 'ends' ? [[L0[0], L0[1], 'y'], [R0[0], R0[1], 'y']] : mode === 'end' ? [[R0[0], R0[1], 'y']]
      : mode === 'sides' ? [[B0[0], B0[1], 'x'], [T0[0], T0[1], 'x']] : mode === 'side' ? [[B0[0], B0[1], 'x']] : [[cx, cy, 'x']];
    const parts = spots.map(([x, y, along]) => bag.k(new W.CrossSection([ccw(shapePts('slot', along === 'x' ? fl : fd, along === 'x' ? fd : fl, 0).map(([u, v]) => [u + x, v + y]))])));
    notch = parts.length > 1 ? bag.k(W.CrossSection.union(parts)) : parts[0];
  }
  return { tool, pocket: cs, notch };
}
// polygons for drawing and laser files: {tool, pocket (pocket ∪ notches)} as arrays of [x, y]
export function outline2D(g) {
  const bag = new Bag();
  try {
    const o = outlineCS(bag, g);
    const all = o.notch ? bag.k(W.CrossSection.union([o.pocket, o.notch])) : o.pocket;
    const b = all.bounds();
    return { tool: o.tool.toPolygons(), pocket: all.toPolygons(), bounds: [b.min[0], b.min[1], b.max[0], b.max[1]] };
  } finally { bag.free(); }
}

// ---------- HOLDER ----------
function outlineBox(g) {
  if (!g.pts || !g.pts.length) return [0, 0];
  const sc = g.scale || 1, t = (g.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  let mx = 0, my = 0;
  for (const [x0, y0] of g.pts) { const x = (x0 * c - y0 * s) * sc, y = (x0 * s + y0 * c) * sc; mx = Math.max(mx, Math.abs(x)); my = Math.max(my, Math.abs(y)); }
  return [mx + (g.clear || 0), my + (g.clear || 0)];
}
const halfX = (g) => g.shape === 'outline' ? outlineBox(g)[0] : g.a / 2;
const halfY = (g) => g.shape === 'outline' ? outlineBox(g)[1] : (g.shape === 'slot' || g.shape === 'rect') ? g.b / 2 : g.a / 2;
// groups: [{shape, a, b, n, pitch, rows, rowPitch, x, y, depth, through, cells, stagger}]
export function holderLayout(p) {
  const nx = p.nx, ny = p.ny, H = GF.hu * p.U;
  const Wo = 42 * nx - 0.5 - 2 * TOL.bin, Do = 42 * ny - 0.5 - 2 * TOL.bin;
  const holes = [], warn = [];
  for (const g of p.groups) {
    const n = Math.max(1, g.n | 0), rows = Math.max(1, g.rows | 0);
    const origins = [];
    if (g.cells) { for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) origins.push([(a - (nx - 1) / 2) * 42, (c - (ny - 1) / 2) * 42]); }
    else origins.push([0, 0]);
    const autoP = g.shape === 'round' || g.shape === 'hex' ? g.a + 3 : g.a + 3;
    const px = g.pitch > 0 ? g.pitch : autoP;
    const py = g.rowPitch > 0 ? g.rowPitch : (g.shape === 'round' || g.shape === 'hex' ? g.a + 3 : g.b + 3);
    for (const [ox, oy] of origins) {
      for (let r = 0; r < rows; r++) {
        const st = g.stagger && r % 2 === 1 ? px / 2 : 0;
        const cnt = g.stagger && r % 2 === 1 ? n - 1 : n;
        for (let k = 0; k < cnt; k++) {
          const x = ox + g.x + (k - (n - 1) / 2) * px + st;
          const y = oy + g.y + ((rows - 1) / 2 - r) * py;
          holes.push({ x, y, g });
        }
      }
    }
  }
  // wall check (top outline)
  const tilt = (p.tilt || 0) * Math.PI / 180;
  let breach = 0;
  for (const h of holes) {
    const hx = halfX(h.g), hy = halfY(h.g);
    const d = h.g.through ? H : (h.g.depth > 0 ? h.g.depth : H - 6);
    const dy = Math.sin(tilt) * d;
    if (Math.abs(h.x) + hx > Wo / 2 - 1.2 || h.y + hy > Do / 2 - 1.2 || h.y - hy - Math.max(0, dy) < -Do / 2 + 1.2 || h.y + hy - Math.min(0, dy) > Do / 2 - 1.2) breach++;
  }
  if (breach) warn.push(`${breach} cut-out${breach > 1 ? 's' : ''} break${breach > 1 ? '' : 's'} through an outer wall — reduce count, pitch or tilt`);
  for (const g of p.groups) if (!g.through && g.depth > H - 5.2) warn.push(`${g.shape} ${g.a} depth ${g.depth} is deeper than the ${H} mm body allows (max ${(H - 5.2).toFixed(1)}) — capped`);
  // overlap check
  let ov = 0;
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const A = holes[i], B = holes[j];
    const ax = halfX(A.g), ay = halfY(A.g), bx = halfX(B.g), by = halfY(B.g);
    if (Math.abs(A.x - B.x) < ax + bx + 0.8 && Math.abs(A.y - B.y) < ay + by + 0.8) ov++;
  }
  if (ov) warn.push(`${ov} pair${ov > 1 ? 's' : ''} of cut-outs closer than 0.8 mm — they’ll merge`);
  // through-holes vs the 42 mm frame lines of the plate or shelf below
  if (p.groups.some(g => g.through)) {
    let fr = 0;
    for (const h of holes) if (h.g.through) {
      const lx = ((h.x + 21 * nx) % 42 + 42) % 42 - 21, ly = ((h.y + 21 * ny) % 42 + 42) % 42 - 21;
      const hx = halfX(h.g), hy = halfY(h.g);
      if (Math.abs(lx) + hx > 17.0 || Math.abs(ly) + hy > 17.0) fr++;
    }
    if (fr) warn.push(`${fr} through-hole${fr > 1 ? 's' : ''} sit over the grid frame — tools won’t pass the shelf below; use “per cell”`);
  }
  return { holes, warn, H, Wo, Do };
}

export function holder(p) {
  const bag = new Bag();
  const { holes, H, Wo, Do } = holderLayout(p);
  const outer = prism(bag, rrPts(Wo, Do, GF.rBin), 4.75, p.lip ? H + 3.8 : H);
  let body = union(bag, [outer, feet(bag, p.nx, p.ny)]);
  if (p.lip) {
    const ringO = (i, z) => lift(rrPts(Wo - 2 * i, Do - 2 * i, Math.max(0.3, GF.rBin - i)), z);
    body = bag.k(W.Manifold.difference([body, hull(bag, [ringO(2.6, H), ringO(1.9, H + 0.7), ringO(1.9, H + 2.5)]), hull(bag, [ringO(1.9, H + 2.5), ringO(0.6, H + 3.8), ringO(-0.4, H + 4.8)])]));
  }
  const tilt = p.tilt || 0, ch = p.chamfer ?? 0.6;
  const cutters = [];
  const cache = new Map();
  for (const h of holes) {
    const g = h.g;
    if (g.shape === 'outline') {
      // traced / custom outline: arbitrary polygon, offset by the clearance, straight walls, finger scoops
      if (!g.pts || g.pts.length < 3) continue;
      const d = g.through ? H + 4 : Math.min(g.depth > 0 ? g.depth : H - 6, H - 5.2);
      const o2 = outlineCS(bag, g);
      cutters.push(bag.k(bag.k(o2.pocket.extrude(d + 2)).translate([h.x, h.y, H - d])));
      if (o2.notch) {
        const fd = Math.min(d, g.fingerDepth > 0 ? g.fingerDepth : d);
        cutters.push(bag.k(bag.k(o2.notch.extrude(fd + 2)).translate([h.x, h.y, H - fd])));
      }
      continue;
    }
    const key = [g.shape, g.a, g.b, g.depth, g.through ? 1 : 0].join('|');
    let c = cache.get(key);
    if (!c) {
      const d = g.through ? (H + 2) / Math.cos(tilt * Math.PI / 180) + 2 : Math.min(g.depth > 0 ? g.depth : H - 6, H - 5.2);
      const A = g.a + TOL.hole, B = (g.b ?? g.a) + TOL.hole;
      const base = shapePts(g.shape, A, B, 0);
      if (ch > 0) {
        // two hulls sharing one identical ring (same pattern as the foot) — clean manifold union
        const parts = [hull(bag, [lift(base, -d), lift(base, -ch)]), hull(bag, [lift(base, -ch), lift(shapePts(g.shape, A, B, ch), 0), lift(shapePts(g.shape, A, B, ch + 2), 2)])];
        c = union(bag, parts);
      } else c = hull(bag, [lift(base, -d), lift(base, 2)]);
      cache.set(key, c);
    }
    let m = c;
    if (tilt) m = bag.k(m.rotate([-tilt, 0, 0]));
    cutters.push(bag.k(m.translate([h.x, h.y, H])));
  }
  if (cutters.length) body = bag.k(W.Manifold.difference([body, ...cutters]));
  if (p.magnets && p.magnets !== 'off') {
    const mh = [];
    for (let a = 0; a < p.nx; a++) for (let c = 0; c < p.ny; c++) mh.push(...cellMagnets(bag, p.nx, p.ny, a, c, (a - (p.nx - 1) / 2) * 42, (c - (p.ny - 1) / 2) * 42, -1, GF.magnet.depth, p.magnets === true ? 'press' : p.magnets, p.magCorners));
    body = bag.k(W.Manifold.difference([body, ...mh]));
  }
  bag.free(body);
  return body;
}

// ---------- DRAWER PLATE (plain baseplate) ----------
export function drawerPlate(p) {
  const bag = new Bag();
  const nx = p.nx, ny = p.ny, rim = p.rim || 0;
  const Wt = 42 * nx + 2 * rim, Dt = 42 * ny + 2 * rim;
  const T = p.style === 'frame' ? 5.0 : p.style === 'magnets' ? 8.0 : 7.0;
  let body = prism(bag, rrPts(Wt, Dt, GF.rPlate + rim), 0, T - 0.1);
  const cut = [];
  for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) {
    const cx = (a - (nx - 1) / 2) * 42, cy = (c - (ny - 1) / 2) * 42;
    cut.push(socketCutter(bag, T, p.style === 'frame' ? -1 : T - 5.0, cx, cy));
    if (p.style === 'magnets') cut.push(...magnetPockets(bag, cx, cy, T - 5.0 - GF.magnet.depth, T - 5.0 + 0.05));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  bag.free(body);
  return { solid: body, T, Wt, Dt };
}

// ---------- TABLE PLATE (integral studs below, prints face-down) ----------
export function tablePlateDims(p) {
  const rim = p.rim, T = 5.0 + p.funnel;
  const Wt = 42 * p.nx + 2 * rim, Dt = 42 * p.ny + 2 * rim;
  const winBottom = 42 - 2 * (2.85 + p.funnel);
  return { rim, T, Wt, Dt, winBottom, nx: p.nx, ny: p.ny };
}
export function tablePlate(p, studs, board) {
  const bag = new Bag();
  const d = tablePlateDims(p);
  const { T, Wt, Dt, rim } = d;
  const trunc = 0.6; // flat on the inter-cell walls so the face-down first layer has something to stand on
  let body = prism(bag, rrPts(Wt, Dt, GF.rPlate + rim), 0, T - trunc);
  const cut = [];
  for (let a = 0; a < p.nx; a++) for (let c = 0; c < p.ny; c++) {
    const cx = -Wt / 2 + rim + 21 + 42 * a, cy = Dt / 2 - rim - 21 - 42 * c;
    cut.push(socketCutter(bag, T, T - 5.0, cx, cy));
    const s = (i) => 42 - 2 * i, r = (i) => Math.max(0.6, GF.rPlate - i);
    const ring = (i, z) => lift(rrPts(s(i), s(i), r(i)), z, cx, cy);
    cut.push(hull(bag, [ring(2.85, T - 5.0 + 0.01), ring(2.85 + (T - 5.0), 0), ring(2.85 + (T - 5.0) + 1, -1)]));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  const rs = (board.studD + TOL.stud) / 2, L = p.studLen;
  const st = [];
  for (const s of studs) {
    const x = -Wt / 2 + s.lx, y = Dt / 2 - s.ly;
    st.push(hull(bag, [lift(circlePts(rs - 0.5, x, y, 32), -L), lift(circlePts(rs, x, y, 32), -L + 0.5), lift(circlePts(rs, x, y, 32), 0.4)]));
  }
  if (st.length) body = bag.k(W.Manifold.union([body, ...st]));
  bag.free(body);
  return { solid: body, ...d };
}

// ---------- SHELF (wall boards: dovetail tongues on the back, or pins pushed through it) ----------
export function shelfDims(p) {
  const rim = p.rim, backT = p.backT, gapB = 1.0;
  const Tf = p.floor === 'magnets' ? 8.0 : 7.0;
  const Wt = 42 * p.nx + 2 * rim, Dt = backT + gapB + 42 * p.ny + rim;
  return { rim, backT, gapB, Tf, Wt, Dt, Hb: p.backH };
}
export function shelf(p, studs, board) {
  const bag = new Bag();
  const d = shelfDims(p);
  const { rim, backT, gapB, Tf, Wt, Dt, Hb } = d;
  const rf = GF.rPlate + rim;
  // floor: back corners square, front corners rounded. CrossSection y: back edge at y = 0.
  const floor = prism(bag, rrPts(Wt, Dt - 0.5, [0, 0, rf, rf], Wt / 2, -(Dt + 0.5) / 2), 0, Tf - 0.1); // back edge tucked inside the back plate
  const back = prismXZ(bag, rrPts(Wt, Hb, [6, 6, 0, 0], Wt / 2, Hb / 2), backT);
  const parts = [floor, back];
  if (p.cheeks && rim >= 2) {
    const zc = Math.min(Hb - 2, Tf + (Dt - backT) * 0.85);
    const prof = [[-backT + 0.3, Tf - 0.5], [-(Dt - 2.5), Tf - 0.5], [-(Dt - 2.5), Tf + 1.5], [-backT + 0.3, zc]];
    parts.push(prismYZ(bag, prof, 0, rim));
    parts.push(prismYZ(bag, prof, Wt - rim, Wt));
  }
  let body = bag.k(W.Manifold.union(parts));
  const cut = [];
  for (let a = 0; a < p.nx; a++) for (let c = 0; c < p.ny; c++) {
    const cx = rim + 21 + 42 * a, cy = -(backT + gapB + 21 + 42 * c);
    cut.push(socketCutter(bag, Tf, Tf - 5.0, cx, cy));
    if (p.floor === 'open') cut.push(prism(bag, rrPts(p.window, p.window, 3, cx, cy), -1, Tf - 4.9));
    if (p.floor === 'magnets') {
      cut.push(...magnetPockets(bag, cx, cy, Tf - 5.0 - GF.magnet.depth, Tf - 5.0 + 0.05, p.magStyle || 'press'));
      if (p.window > 0) cut.push(prism(bag, rrPts(Math.min(p.window, 16), Math.min(p.window, 16), 3, cx, cy), -1, Tf - 4.9));
    }
  }
  if (p.mount === 'pins') {
    // pin holes: teardrop, point up, straight through the back plate
    const rh = ((p.pinD || board.studD) + p.pinFit + TOL.hole) / 2;
    for (const s of studs) {
      const t = prismXZ(bag, teardropPts(rh, s.lx, s.lz), backT + 2);
      cut.push(bag.k(t.translate([0, 1, 0])));
    }
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  const cut2 = [];
  if (p.mount !== 'pins' && p.windows !== false) {
    // diamond windows along the back plate's middle, between the tongues: the plate is a deep beam spanning from
    // tongue to tongue, and its middle (the neutral axis) carries the least. 45° sides, so they print as they stand.
    const lay = shelfDove(p, board), m = 5, h = Math.min(14, (Hb - Tf - 2 * m) / 2);
    if (h >= 6) {
      const zc = Tf + m + h, pitch = 2 * h + 5, keep = lay.xs.map((x) => [x - lay.D.ow - 4 - h, x + lay.D.ow + 4 + h]);
      const lo = rim + 8 + h, hi = Wt - rim - 8 - h, win = [];
      for (let x = lo; x <= hi + 1e-6; x += pitch) if (!keep.some(([a, b]) => x > a && x < b)) win.push(x);
      for (const x of win) cut2.push(bag.k(prismXZ(bag, [[x, zc - h], [x + h, zc], [x, zc + h], [x - h, zc]], backT + 2).translate([0, 1, 0])));
    }
  }
  if (cut2.length) body = bag.k(W.Manifold.difference([body, ...cut2]));
  if (p.mount !== 'pins') {
    // dovetail tongues on the back face, tops 1 mm under the back plate's top; the shelf prints floor down, so
    // they stand straight up and their 45° foot needs nothing under it
    const lay = shelfDove(p, board);
    body = bag.k(W.Manifold.union([body, ...lay.xs.map((x) => tongueIn(bag, lay.D, x, 0, Hb - 1))]));
  }
  bag.free(body);
  return { solid: body, ...d };
}
// where a shelf's tongues go: 1–3 of them, centred, on lattice steps, each base hidden behind the back plate
export function shelfDove(p, board) {
  const d = shelfDims(p), Wt = d.Wt;
  const pitch = board.lattice === 'square' ? board.pitch : 25;
  const min = p.backH >= DOVE.M.L + 1 ? 'M' : 'S';
  const fitN = (n, D) => n === 1 || Math.floor((Wt - D.W - 4) / ((n - 1) * pitch)) * pitch >= D.W + 3;
  let n = p.doveN > 0 ? p.doveN : Wt < 100 ? 1 : Wt < 260 ? 2 : 3;
  let pick = pickDove('shelf', p, board, { n, min, maxL: p.backH }), D = doveDims(pick.cls, board);
  while (n > 1 && !fitN(n, D)) { n--; pick = pickDove('shelf', p, board, { n, min, maxL: p.backH }); D = doveDims(pick.cls, board); }
  const k = n > 1 ? Math.floor((Wt - D.W - 4) / ((n - 1) * pitch)) : 0, sp = k * pitch;
  const xs = []; for (let i = 0; i < n; i++) xs.push(Wt / 2 + (i - (n - 1) / 2) * sp);
  return { pick, D, n, xs, spacing: sp };
}

// ---------- PINS ----------
export function pins(board, count, length, d = 0) {
  const bag = new Bag();
  const r = ((d || board.studD) + TOL.stud) / 2, c = 0.4, pitch = board.studD + 6;
  const per = Math.max(1, Math.ceil(Math.sqrt(count)));
  const list = [];
  for (let k = 0; k < count; k++) {
    const x = (k % per) * pitch, y = Math.floor(k / per) * pitch;
    list.push(hull(bag, [lift(circlePts(r - c, x, y, 32), 0), lift(circlePts(r, x, y, 32), c), lift(circlePts(r, x, y, 32), length - c), lift(circlePts(r - c, x, y, 32), length)]));
  }
  const m = union(bag, list);
  bag.free(m);
  return m;
}

// ---------- orientation + mesh out ----------
export function transformed(m, op) {
  // op: 'center' (XY centre, z ≥ 0) or 'flipX' (rotate 180° about X, then centre)
  const bag = new Bag();
  let t = m;
  if (op === 'flipX') t = bag.k(m.rotate([180, 0, 0]));
  const bb = t.boundingBox();
  const out = t.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]);
  bag.free();
  return out;
}

// union a list (consumed) · lay a list (consumed) out in a row along X, each centred, gap between
export function assemble(list) { if (list.length === 1) return list[0]; const m = W.Manifold.union(list); for (const q of list) q.delete(); return m; }
export function row(list, gap = 6) {
  let x = 0; const out = [];
  for (const q of list) { const bb = q.boundingBox(), w = bb.max[0] - bb.min[0]; out.push(q.translate([x - bb.min[0], -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]])); x += w + gap; q.delete(); }
  const m = assemble(out), bb = m.boundingBox(), c = m.translate([-(bb.min[0] + bb.max[0]) / 2, 0, 0]); m.delete(); return c;
}
// triangle mesh for export and checks: vertices that land on the same spot are merged and the zero-area
// triangles that leaves are dropped — CSG can pinch two vertices together where edges cross exactly, and
// slicers would weld them anyway and report the slivers as errors
export function meshOf(m) {
  const mesh = m.getMesh();
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const nv = vp.length / np, map = new Map(), id = new Uint32Array(nv), xyz = [];
  for (let i = 0; i < nv; i++) {
    const x = Math.fround(vp[i * np]), y = Math.fround(vp[i * np + 1]), z = Math.fround(vp[i * np + 2]), k = x + ',' + y + ',' + z;
    let j = map.get(k); if (j === undefined) { j = map.size; map.set(k, j); xyz.push(x, y, z); } id[i] = j;
  }
  const out = [];
  for (let t = 0; t < tv.length; t += 3) { const a = id[tv[t]], b = id[tv[t + 1]], c = id[tv[t + 2]]; if (a !== b && b !== c && a !== c) out.push(a, b, c); }
  return { pos: new Float32Array(xyz), idx: new Uint32Array(out) };
}

export function stats(m) {
  const bb = m.boundingBox();
  return {
    size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
    min: bb.min, max: bb.max,
    volume: m.volume(), area: m.surfaceArea(), tris: m.numTri(), genus: m.genus(),
  };
}

// mass at a given infill and shell: shell ≈ area × shell thickness (capped at the volume)
export function massEstimate(st, infill = 0.15, shell = 1.1, density = 1.04) {
  const shellV = Math.min(st.volume, st.area * shell);
  return ((shellV + (st.volume - shellV) * infill) / 1000) * density;
}

// ---------- DRAWER TILE (fit-to-drawer baseplates) ----------
// t: {nx, ny, pad:{L,R,F,B}, outer:{L,R,F,B}}; front = −Y. Origin = centre of the tile's cell grid.
export function drawerTile(t, style, cornerR = 2, opt = {}) {
  const bag = new Bag();
  const T = style === 'frame' ? 5.0 : style === 'magnets' ? 8.0 : 7.0;
  const { nx, ny, pad, outer } = t;
  const Wd = 42 * nx + pad.L + pad.R, D = 42 * ny + pad.F + pad.B;
  const cx0 = (pad.R - pad.L) / 2, cy0 = (pad.B - pad.F) / 2;
  const rad = [outer.R && outer.B ? cornerR : 0, outer.L && outer.B ? cornerR : 0, outer.L && outer.F ? cornerR : 0, outer.R && outer.F ? cornerR : 0];
  let body = prism(bag, rrPts(Wd, D, rad, cx0, cy0), 0, T - 0.1);
  const cut = [];
  for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) {
    const cx = (a - (nx - 1) / 2) * 42, cy = (c - (ny - 1) / 2) * 42;
    cut.push(socketCutter(bag, T, style === 'frame' ? -1 : T - 5.0, cx, cy));
    if (style === 'magnets') cut.push(...magnetPockets(bag, cx, cy, T - 5.0 - GF.magnet.depth, T - 5.0 + 0.05, opt.magStyle || 'press'));
    if (opt.screws && style !== 'frame') {
      // countersunk wood screw through the floor centre: Ø3.5 shank, Ø7 head at 90°, head below the socket floor
      const zf = T - 5.0;
      cut.push(cylinder(bag, (3.5 + TOL.hole) / 2, -1, zf + 0.1, cx, cy, 24));
      cut.push(hull(bag, [lift(circlePts(1.75 + TOL.hole / 2, cx, cy, 24), zf - 1.75 - 0.2), lift(circlePts(3.5 + TOL.hole / 2, cx, cy, 24), zf - 0.2 + 0.01), lift(circlePts(3.5 + TOL.hole / 2, cx, cy, 24), zf + 0.1)]));
    }
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  bag.free(body);
  return { solid: body, W: Wd, D, T, cx0, cy0 };
}

// ---------- FIT TEST ----------
// 1 × 1 socket coupon (current socket tolerance) and a 1 × 1 foot puck (current bin tolerance)
export function socketCoupon() {
  const bag = new Bag();
  const rim = 4, T = 5.0 + 1.2;
  let body = prism(bag, rrPts(42 + 2 * rim, 42 + 2 * rim, GF.rPlate + rim), 0, T - 0.1);
  body = bag.k(W.Manifold.difference([body, socketCutter(bag, T, T - 5.0, 0, 0), prism(bag, rrPts(24, 24, 3), -1, T)]));
  bag.free(body);
  return body;
}
export function footCoupon() {
  const bag = new Bag();
  const e = TOL.bin;
  const outer = prism(bag, rrPts(GF.bin - 2 * e, GF.bin - 2 * e, GF.rBin - e), 4.75, 9);
  let body = union(bag, [outer, feet(bag, 1, 1)]);
  body = bag.k(W.Manifold.difference([body, prism(bag, circlePts(8), -1, 10)]));
  bag.free(body);
  return body;
}
// pins at d + steps; step k carries k+1 grooves near its top end
export function studLadder(board, steps, length) {
  const bag = new Bag();
  const list = [];
  const base = board.studD + TOL.stud;
  steps.forEach((s, k) => {
    const r = (base + s) / 2, x = k * (board.studD + 7);
    let pin = hull(bag, [lift(circlePts(r - 0.4, x, 0, 32), 0), lift(circlePts(r, x, 0, 32), 0.4), lift(circlePts(r, x, 0, 32), length - 0.4), lift(circlePts(r - 0.4, x, 0, 32), length)]);
    const grooves = [];
    for (let gi = 0; gi <= k; gi++) {
      const z = length - 2.2 - gi * 1.6;
      const ring = bag.k(W.Manifold.difference([cylinder(bag, r + 1, z, z + 0.6, x, 0, 32), cylinder(bag, r - 0.35, z - 0.1, z + 0.7, x, 0, 32)]));
      grooves.push(ring);
    }
    pin = bag.k(W.Manifold.difference([pin, ...grooves]));
    list.push(pin);
  });
  const m = union(bag, list);
  bag.free(m);
  return m;
}
// a strip like a shelf back plate with teardrop pin holes at each fit; k notches on top over hole k
export function pinHoleCoupon(board, fits, thick = 6) {
  const bag = new Bag();
  const d = board.studD, pitch = d + 9, H = d + 14;
  const Wd = pitch * fits.length + 6;
  let body = prismXZ(bag, rrPts(Wd, H, 2, Wd / 2, H / 2), thick);
  const cut = [];
  fits.forEach((f, k) => {
    const x = 3 + pitch * (k + 0.5), rh = (d + f + TOL.hole) / 2;
    cut.push(bag.k(prismXZ(bag, teardropPts(rh, x, H / 2 - 1.5), thick + 2).translate([0, 1, 0])));
    for (let n = 0; n <= k; n++) cut.push(bag.k(prismXZ(bag, rrPts(0.8, 3, 0, x + (n - k / 2) * 1.8, H), thick + 2).translate([0, 1, 0])));
  });
  body = bag.k(W.Manifold.difference([body, ...cut]));
  bag.free(body);
  return body;
}

// does a w × d footprint fit the bed, straight or turned? returns {ok, angle}
export function bedFit(w, d, bx, by) {
  if ((w <= bx && d <= by) || (w <= by && d <= bx)) return { ok: true, angle: 0 };
  for (let a = 1; a < 90; a++) {
    const t = a * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    if (w * c + d * s <= bx && w * s + d * c <= by) return { ok: true, angle: a };
  }
  return { ok: false, angle: 0 };
}


// ---------- HOOKS & HANGERS (wire-style) ----------
// Round wire: capsules between path points. Two ways onto the board:
//  · mount 'dovetail' (the default): a tab carrying a tongue that slides down into a base (DOVETAIL, below).
//    Flat hooks — peg, J, L, wide hanger, spool rod — print lying on their side: everything tangent to the plane
//    x = 0, the tongue's outer corner on the bed. U-hooks, rings and cradles print standing, prongs flat on the bed
//    (no rise). Where round wire meets the bed it is flattened at its 45° line, so no surface overhangs past 45°.
//  · mount 'studs' (legacy): studs straight off the bar in one column; prints on its side, and anything off that
//    plane (U-hook, ring, cradle) stands on breakaway props: 2 mm pillars with a 0.6 mm neck.
// Model axes: X along the board, Y into the board (board face at y = 0), Z up. Top stud at z = 0.
function sphereAt(bag, r, p, seg = 20) { return bag.k(bag.k(W.Manifold.sphere(r, seg)).translate(p)); }
function capsule(bag, r, a, b) { return bag.k(W.Manifold.hull([sphereAt(bag, r, a), sphereAt(bag, r, b)])); }
function wire(bag, r, pts) { const list = []; for (let i = 0; i < pts.length - 1; i++) list.push(capsule(bag, r, pts[i], pts[i + 1])); return list; }
export const HOOK_TYPES = [['peg', 'Peg'], ['j', 'J-hook'], ['l', 'L-hook'], ['u', 'U-hook (double prong)'], ['ring', 'Ring'], ['spool', 'Spool rod'], ['cradle', 'Cradle (two arms + front stop)'], ['hanger', 'Wide hanger (cables, cords)']];
export function hookDims(p, board) {
  const wd = p.wire > 0 ? p.wire : board.id === 'B' ? 7.5 : 5;
  const pitch = board.id === 'B' ? board.rowPitch : 25;
  const rows = Math.max(2, p.rows | 0 || 2);
  return { wd, r: wd / 2, pitch, rows, rs: (board.studD + TOL.stud) / 2 };
}
export const UPRIGHT = ['u', 'ring', 'cradle'];
const C45 = Math.SQRT1_2;
// what a wall part asks of its dovetail: grams and the lever from the board face to where the weight hangs
const DEF_LOAD = { peg: 150, j: 300, l: 100, u: 250, ring: 150, spool: 1000, cradle: 450, hanger: 500, mount: 250, shelf: 0 };
export function doveDemand(kind, p, board) {
  const { r } = kind === 'shelf' ? { r: 0 } : hookDims(p, board);
  const T = 8, L = p.L || 40, g = p.load > 0 ? p.load : kind === 'shelf' ? 300 * (p.nx || 1) * (p.ny || 1) : (DEF_LOAD[kind] ?? 250);
  let lever;
  if (kind === 'peg') lever = T + 2 * r + L * 0.6;
  else if (kind === 'j' || kind === 'hanger') lever = T + 2 * r + L + (p.R || 10) / 2;
  else if (kind === 'l') lever = T + 2 * r + L * 0.8;
  else if (kind === 'u') lever = T + 2 * r + L * 0.55;
  else if (kind === 'ring') lever = T + 2 * r + (p.stem ?? 6) + (p.ringD || 22) / 2 + r;
  else if (kind === 'spool' || kind === 'cradle') lever = T + 2 * r + L / 2;
  else if (kind === 'mount') { const sw = p.sec && p.sec.length > 2 ? Math.max(...p.sec.map((q) => q[0])) - Math.min(...p.sec.map((q) => q[0])) : 12; lever = T + (p.wallB ?? 3) + sw / 2; }
  else lever = T + (p.backT || 6) + 21 * (p.ny || 1);
  return { g, lever };
}
// size by load: the smallest whose rating (kg at 60 mm) covers g × lever, shared over n tongues.
// opts: min (smallest allowed), n (tongues), maxL (longest tongue the part can carry)
export function pickDove(kind, p, board, o = {}) {
  const { g, lever } = doveDemand(kind, p, board);
  const n = Math.max(1, o.n || 1), need = (g / 1000) * lever / n, order = ['S', 'M', 'L'];
  const fits = (c) => DOVE[c].L + 1 <= (o.maxL ?? 1e9);
  const cap = (c) => DOVE[c].rate[board.id === 'B' ? 'B' : 'A'] * DOVE_LEVER;
  let cls = p.dove && DOVE[p.dove] ? p.dove : null, auto = !cls;
  if (auto) {
    const from = Math.max(0, order.indexOf(o.min || 'S'));
    // 20 % headroom: auto never runs a size past 80 % of its rating
    cls = order.slice(from).find((c) => fits(c) && cap(c) * 0.8 >= need) || order.slice(from).filter(fits).pop() || 'S';
  }
  const over = need > cap(cls);
  const why = `${(g / 1000).toFixed(2)} kg about ${Math.round(lever)} mm out${n > 1 ? ` over ${n} tongues` : ''} → ${need.toFixed(0)} of the ${cap(cls).toFixed(0)} kg·mm size ${cls} is good for`;
  return { cls, auto, need, cap: cap(cls), over, g, lever, n, why };
}
// layout of a dovetail hook: where the wire, the tab, the tongue and the bed are
export function hookPaths(p, board) {
  if (p.mount === 'studs') return legacyPaths(p, board);
  const { r } = hookDims(p, board);
  const upright = UPRIGHT.includes(p.type);
  const L = p.L || 40, a = upright ? 0 : (p.rise || 0) * Math.PI / 180;
  // a wide U or cradle wants at least an M to stop it rocking
  const span = p.type === 'cradle' ? (p.cradleW || 60) + 2 * r : p.type === 'u' ? (p.gap || 12) + 4 * r : 0;
  const pick = pickDove(p.type, p, board, { min: span >= 50 ? 'M' : 'S' });
  const D = doveDims(pick.cls, board);
  const yb = -D.T, y0 = yb - r, z0 = -(1 + D.L) - (p.drop || 0);
  const xr = upright ? 0 : C45 * r;
  const out = (u, v, x = xr) => [x, y0 - u, z0 + v];
  const arc = (cu, cv, R, a0, a1, n = 10, x = xr) => { const q = []; for (let i = 0; i <= n; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; q.push(out(cu + R * Math.cos(t), cv + R * Math.sin(t), x)); } return q; };
  const paths = [], taper = [], TIP = p.taper === false ? 1 : 0.62;
  // a cantilever's bending moment falls to nothing at its tip: taper the prong from the full wire at the root to
  // 0.62 of it at the end. The stress stays highest at the root wherever the tool hangs, and a third of the prong's
  // plastic goes. taper[i] = [factor at start, factor at end] for paths[i].
  const P = (path, f0 = 1, f1 = 1) => { paths.push(path); taper.push([f0, f1]); };
  let xc = xr, support, ring = null, tabX = [-0.5, Math.max(D.outer, xr + r)], tabBot = z0 - r;
  if (p.type === 'peg') {
    const ex = L * Math.cos(a), ev = L * Math.sin(a);
    P([out(0, 0), out(ex, ev)], 1, TIP);
    if (p.tip > 0) P([out(ex, ev), out(ex + 1, ev + p.tip)], TIP, TIP);
    support = out(L * 0.6 * Math.cos(a), L * 0.6 * Math.sin(a) + r);
  } else if (p.type === 'j' || p.type === 'hanger') {
    const R = Math.max(r * 1.6, p.R || 10);
    P([out(0, 0), out(L, 0), ...arc(L, R, R, -90, 0), out(L + R, R + Math.max(0, (p.H || 16) - R))], 1, p.type === 'hanger' ? 1 : TIP);
    if (p.type === 'hanger') tabX[1] = Math.max(tabX[1], Math.max(2 * r, p.width || 30));
    support = out(L, r);
  } else if (p.type === 'l') {
    P([out(0, 0), out(L, 0), out(L, p.H || 12)], 1, TIP);
    support = out(L * 0.8, r);
  } else if (p.type === 'spool') {
    const Rr = (p.spoolD || 18) / 2;
    xc = C45 * Rr; tabX[1] = Math.max(D.outer, xc + Rr); tabBot = z0 - Rr;
    support = [xc, yb - Rr - L * 0.55 * Math.cos(a), z0 + L * 0.55 * Math.sin(a) + Rr];
  } else if (p.type === 'u') {
    const xb = (p.gap || 12) / 2 + r;
    P([out(0, 0, -xb), out(0, 0, xb)]);
    for (const x of [-xb, xb]) { P([out(0, 0, x), out(L, 0, x)], 1, TIP); if (p.tip > 0) P([out(L, 0, x), out(L + 1, p.tip, x)], TIP, TIP); }
    xc = 0; tabX = [-Math.max(xb + r + 2, D.ow + 2), Math.max(xb + r + 2, D.ow + 2)];
    support = out(L * 0.55, r, 0);
  } else if (p.type === 'ring') {
    const R = (p.ringD || 22) / 2 + r, s0 = p.stem ?? 6, q = [];
    P([out(0, 0, 0), out(s0, 0, 0)]);
    for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; q.push(out(s0 + R - R * Math.cos(t), 0, R * Math.sin(t))); }
    P(q);
    xc = 0; ring = { x: 0, u: s0 + R }; tabX = [-(D.ow + 2), D.ow + 2];
    support = out(s0 + R, 0, 0);
  } else if (p.type === 'cradle') {
    const xb = (p.cradleW || 60) / 2, f = p.taper === false ? 1 : 0.8;
    for (const x of [-xb, xb]) P([out(0, 0, x), out(L, 0, x)], 1, f);
    P([out(L, 0, -xb), out(L, 0, xb)], f, f); P([out(0, 0, -xb), out(0, 0, xb)]);
    xc = 0; tabX = [-(xb + r + 2), xb + r + 2];
    support = out(L / 2, r, 0);
  }
  const bed = upright ? z0 - C45 * r : 0;
  const tab = { x0: tabX[0], x1: tabX[1], z0: upright ? bed - 0.5 : tabBot, z1: 0 };
  return { paths, taper, extra: [], studs: [], xr, xc, y0, yb, z0, out, a, upright, dove: true, D, pick, tab, xt: upright ? (tab.x0 + tab.x1) / 2 : D.ow - 0.1, bed, support, ring };
}
export function hook(p, board) {
  if (p.mount === 'studs') return hookStuds(p, board);
  const bag = new Bag();
  const { r } = hookDims(p, board);
  const hp = hookPaths(p, board), D = hp.D, t = hp.tab;
  const parts = [];
  // every sphere sits on the bed at its own 45° line, so a thinner one sits lower: x (on its side) or z (standing)
  const seatR = (q, rr) => (hp.upright ? [q[0], q[1], q[2] - C45 * (r - rr)] : [C45 * rr, q[1], q[2]]);
  hp.paths.forEach((path, i) => {
    const [f0, f1] = hp.taper[i] || [1, 1];
    if (f0 === 1 && f1 === 1) { parts.push(...wire(bag, r, path)); return; }
    let S = 0; const cum = [0]; for (let k = 1; k < path.length; k++) { S += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1], path[k][2] - path[k - 1][2]); cum.push(S); }
    const sph = path.map((q, k) => { const rr = r * (f0 + (f1 - f0) * (S ? cum[k] / S : 0)); return sphereAt(bag, rr, seatR(q, rr)); });
    for (let k = 0; k < sph.length - 1; k++) parts.push(bag.k(W.Manifold.hull([sph[k], sph[k + 1]])));
  });
  // a filleted root where each tapered prong leaves the tab: the joint is where it would crack
  hp.paths.forEach((path, i) => {
    const [f0, f1] = hp.taper[i] || [1, 1]; if (f0 !== 1 || f1 === 1 || path.length < 2) return;
    const q0 = path[0], q1 = path[1], d = Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]) || 1, u = Math.min(1, (3 * r) / d);
    const qm = [q0[0] + (q1[0] - q0[0]) * u, q0[1] + (q1[1] - q0[1]) * u, q0[2] + (q1[2] - q0[2]) * u], rb = r * 1.55, rm = r * (1 + (f1 - 1) * Math.min(1, 3 * r / d));
    const root = hp.upright ? [q0[0], q0[1], q0[2] + C45 * (rb - r)] : [C45 * rb, q0[1], q0[2]];
    parts.push(bag.k(W.Manifold.hull([sphereAt(bag, rb, [root[0], Math.min(root[1], hp.yb - rb * 0.2), root[2]]), sphereAt(bag, rm, seatR(qm, rm))])));
  });
  // the tab: as thick as the wire, its back on the base. A wide standing hook (U, cradle) only needs a post up the
  // tongue and a bar along the bed joining the prongs, with 45° gussets between them — an upside-down T, no
  // overhang anywhere, and none of the plate that carried nothing
  const pe = D.ow + 2, bh = t.z0 + 0.5 + 2 * r + 1.5;
  if (hp.upright && (t.x1 - t.x0) > 2 * pe + 12) {
    const G = Math.min(12, (t.x1 - pe) - 2, t.z1 - bh - 4), zt = t.z1;
    const tee = [[t.x0, t.z0], [t.x1, t.z0], [t.x1, bh], [pe + G, bh], [pe, bh + G], [pe, zt - 2], [pe - 2, zt], [-pe + 2, zt], [-pe, zt - 2], [-pe, bh + G], [-pe - G, bh], [t.x0, bh]];
    parts.push(bag.k(prismXZ(bag, tee, 2 * r).translate([0, hp.yb, 0])));
  } else parts.push(bag.k(prismXZ(bag, rrPts(t.x1 - t.x0, t.z1 - t.z0, hp.upright ? [2, 2, 0, 0] : [2, 0, 0, 2], (t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2), 2 * r).translate([0, hp.yb, 0])));
  const tongue = tongueIn(bag, D, hp.xt, hp.yb, -1);
  if (p.type === 'spool') {
    // fat rod, flattened on the bed at its 45° line, rounded stop at the end; its back end sits on the tab
    const a = hp.a, L = p.L || 80, Rr = (p.spoolD || 18) / 2, cap = Rr + (p.stop || 4), xs = hp.xc;
    const dir = [0, -Math.cos(a), Math.sin(a)], s0 = [xs, hp.yb - Rr, hp.z0], e0 = [xs, s0[1] + dir[1] * L, s0[2] + dir[2] * L];
    parts.push(capsule(bag, Rr, s0, e0));
    parts.push(bag.k(W.Manifold.hull([sphereAt(bag, cap, [xs, e0[1] - dir[1], e0[2] - dir[2]], 28), sphereAt(bag, cap, [xs, e0[1] + 2 * dir[1], e0[2] + 2 * dir[2]], 28)])));
  }
  if (p.type === 'hanger') {
    // wide saddle: the J's profile, thickened and run the full width along the bed plane
    const R = Math.max(r * 1.6, p.R || 10), L = p.L || 40, wdt = Math.max(2 * r, p.width || 30), th = Math.max(r, 3);
    const prof = [[0, 0], [L, 0]];
    for (let i = 0; i <= 10; i++) { const q = (-90 + 9 * i) * Math.PI / 180; prof.push([L + R * Math.cos(q), R + R * Math.sin(q)]); }
    prof.push([L + R, R + Math.max(0, (p.H || 16) - R)]);
    const caps = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [u1, v1] = prof[i], [u2, v2] = prof[i + 1];
      caps.push(bag.k(W.CrossSection.hull([bag.k(new W.CrossSection([circlePts(th / 2, hp.y0 - u1, hp.z0 + v1, 16)])), bag.k(new W.CrossSection([circlePts(th / 2, hp.y0 - u2, hp.z0 + v2, 16)]))])));
    }
    const cs = bag.k(W.CrossSection.union(caps));
    const m = bag.k(cs.extrude(wdt + 0.5));
    parts.push(bag.k(m.warp((v) => { const u = v[0], vv = v[1], w = v[2]; v[0] = w - 0.5; v[1] = u; v[2] = vv; })));
  }
  if (p.type === 'cradle') {
    // front wall standing on the front bar: holds the meter in, prints as a plain wall
    const xb = (p.cradleW || 60) / 2, L = p.L || 50, Hh = p.H || 15, yf = hp.y0 - L;
    parts.push(bag.k(bag.k(W.Manifold.cube([2 * xb + 2 * r, 2 * r, hp.z0 + Hh - (hp.bed - 0.5)], false)).translate([-xb - r, yf - r, hp.bed - 0.5])));
  }
  // nothing but the tongue goes behind the part's back face (the base is there)
  let m = bag.k(bag.k(W.Manifold.union(parts)).trimByPlane([0, -1, 0], -hp.yb));
  m = bag.k(W.Manifold.union([m, tongue]));
  m = bag.k(hp.upright ? m.trimByPlane([0, 0, 1], hp.bed) : m.trimByPlane([1, 0, 0], 0));
  bag.free(m);
  return m;
}
function legacyPaths(p, board) {
  const { r, pitch, rows } = hookDims(p, board);
  const xr = r; // bar, studs and the main arm sit on the bed plane (wire tangent to x = 0)
  const zLow = -(rows - 1) * pitch, z0 = zLow - (p.drop || 0);
  const out = (u, v, x = xr) => [x, -r - u, z0 + v];
  const a = (p.rise || 0) * Math.PI / 180, L = p.L || 40;
  const paths = [[[xr, -r, r + (p.top || 2)], [xr, -r, z0]]], extra = [];
  const arc = (cu, cv, R, a0, a1, n = 10, x = xr) => { const q = []; for (let i = 0; i <= n; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; q.push(out(cu + R * Math.cos(t), cv + R * Math.sin(t), x)); } return q; };
  if (p.type === 'peg') {
    const ex = L * Math.cos(a), ev = L * Math.sin(a);
    paths.push([out(0, 0), out(ex, ev)]);
    if (p.tip > 0) paths.push([out(ex, ev), out(ex + 1, ev + p.tip)]);
  } else if (p.type === 'j' || p.type === 'hanger') {
    const R = Math.max(r * 1.6, p.R || 10);
    paths.push([out(0, 0), out(L, 0), ...arc(L, R, R, -90, 0), out(L + R, R + Math.max(0, (p.H || 16) - R))]);
  } else if (p.type === 'l') {
    paths.push([out(0, 0), out(L, 0), out(L, p.H || 12)]);
  } else if (p.type === 'u') {
    const x2 = xr + (p.gap || 12) + 2 * r, ex = L * Math.cos(a), ev = L * Math.sin(a);
    paths.push([out(0, 0), out(0, 0, x2)]);
    for (const x of [xr, x2]) { paths.push([out(0, 0, x), out(ex, ev, x)]); if (p.tip > 0) paths.push([out(ex, ev, x), out(ex + 1, ev + p.tip, x)]); }
    extra.push({ from: out(0, 0, x2), to: out(ex, ev, x2) });
    if (p.tip > 0) extra.push({ point: out(ex + 1, ev + p.tip, x2) });
  } else if (p.type === 'ring') {
    const R = (p.ringD || 22) / 2 + r, s0 = p.stem ?? 6, cu = s0 + R;
    paths.push([out(0, 0), out(cu, 0)]);
    const ring = [];
    for (let i = 0; i <= 36; i++) { const t = Math.PI + (i / 36) * Math.PI * 2; ring.push(out(cu + R * Math.sin(t), 0, xr + R + R * Math.cos(t))); }
    paths.push(ring);
    for (const q of ring) extra.push({ point: q });
  } else if (p.type === 'cradle') {
    const Wd = p.cradleW || 60, Hh = p.H || 15, x2 = xr + Wd;
    paths.push([out(0, 0), out(0, 0, x2)]);
    for (const x of [xr, x2]) paths.push([out(0, 0, x), out(L, 0, x), out(L, Hh, x)]);
    paths.push([out(L, Hh), out(L, Hh, x2)]);
    extra.push({ from: out(0, 0, x2), to: out(L, 0, x2) }, { from: out(L, 0, x2), to: out(L, Hh, x2) });
    for (let i = 1; i < 6; i++) extra.push({ point: out(L, Hh, xr + (Wd * i) / 6) });
  } else if (p.type === 'spool') {
    paths.push([out(0, 0), out(8, 0)]);
  }
  const studs = []; for (let i = 0; i < rows; i++) studs.push(-i * pitch);
  return { paths, extra, studs, xr, xc: p.type === 'u' ? xr + (p.gap || 12) / 2 + r : p.type === 'cradle' ? xr + (p.cradleW || 60) / 2 : xr, y0: -r, z0, out, a, upright: false, dove: false, ring: p.type === 'ring' ? { x: xr + (p.ringD || 22) / 2 + r, u: (p.stem ?? 6) + (p.ringD || 22) / 2 + r } : null };
}
function hookStuds(p, board) {
  const bag = new Bag();
  const { r, rs } = hookDims(p, board);
  const hp = legacyPaths(p, board);
  const parts = [];
  for (const path of hp.paths) parts.push(...wire(bag, r, path));
  if (p.type === 'spool') {
    // fat rod, flattened on the bed at its 45° line, with a rounded stop at the end
    const a = (p.rise || 0) * Math.PI / 180, L = p.L || 80, Rr = (p.spoolD || 18) / 2, cap = Rr + (p.stop || 4), xs = 0.4 + C45 * Rr;
    const s0 = [xs, -Rr * 0.5, hp.z0], e0 = [xs, -r - L * Math.cos(a), hp.z0 + L * Math.sin(a)];
    parts.push(capsule(bag, Rr, s0, e0));
    parts.push(bag.k(W.Manifold.hull([sphereAt(bag, cap, [xs, e0[1] + 1, e0[2]], 28), sphereAt(bag, cap, [xs, e0[1] - 2, e0[2]], 28)])));
    parts.push(capsule(bag, Math.min(Rr, 6), [r, -r, hp.z0], s0));
  }
  if (p.type === 'hanger') {
    // wide saddle: the J's profile, thickened and run the full width along the bed plane
    const R = Math.max(r * 1.6, p.R || 10), L = p.L || 40, wdt = Math.max(2 * r, p.width || 30), t = Math.max(r, 3);
    const prof = [[0, 0], [L, 0]];
    for (let i = 0; i <= 10; i++) { const q = (-90 + 9 * i) * Math.PI / 180; prof.push([L + R * Math.cos(q), R + R * Math.sin(q)]); }
    prof.push([L + R, R + Math.max(0, (p.H || 16) - R)]);
    const caps = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [u1, v1] = prof[i], [u2, v2] = prof[i + 1];
      caps.push(bag.k(W.CrossSection.hull([new W.CrossSection([circlePts(t / 2, -r - u1, hp.z0 + v1, 16)]), new W.CrossSection([circlePts(t / 2, -r - u2, hp.z0 + v2, 16)])])));
    }
    const cs = bag.k(W.CrossSection.union(caps));
    const m = bag.k(cs.extrude(wdt));
    parts.push(bag.k(m.warp((v) => { const u = v[0], vv = v[1], w = v[2]; v[0] = w; v[1] = u; v[2] = vv; })));
  }
  // studs: along +Y from inside the bar, chamfered tip, tangent to the bed plane
  const sx = rs;
  for (const z of hp.studs) {
    const L = p.studLen || board.studLen;
    const ring = (rad, y) => circlePts(rad, 0, 0, 32).map(([u, v]) => [sx + u, y, z + v]);
    parts.push(hull(bag, [ring(rs, -r), ring(rs, L - 0.5), ring(rs - 0.5, L)]));
  }
// breakaway props for anything off the bed plane (print Z = model X)
  const props = [];
  const prop = (pt, top) => {
    const [px, py, pz] = pt;
    const base = prismYZ(bag, rrPts(2, 2, 0.3, py, pz), -0.0, Math.max(0.2, top - 0.6));
    const neck = prismYZ(bag, rrPts(0.8, 0.8, 0.1, py, pz), Math.max(0.1, top - 0.7), top + 0.4);
    props.push(base, neck);
  };
  for (const e of hp.extra) {
    if (e.point) { if (e.point[0] - r > 1) prop(e.point, e.point[0] - r); continue; }
    if (!e.from) continue;
    const n = Math.max(2, Math.ceil(Math.hypot(e.to[1] - e.from[1], e.to[2] - e.from[2]) / 12));
    for (let i = 1; i <= n; i++) { const t = i / n, q = [e.from[0], e.from[1] + (e.to[1] - e.from[1]) * t, e.from[2] + (e.to[2] - e.from[2]) * t]; if (q[0] - r > 1) prop(q, q[0] - r); }
  }
  // flat on the bed plane: trim a 0.4 mm sliver so the round wire and studs get a printable first layer
  let m = bag.k(W.Manifold.union([...parts, ...props]));
  m = bag.k(m.trimByPlane([1, 0, 0], 0.4));
  bag.free(m);
  return m;
}

// ---------- TOOL MODELS: the visual hull of up to three photo views ----------
// v.top [[x, y]] (tip at +x) · v.side [[x, z]] seen from the side · v.end [[y, z]] seen end-on · v.T thickness if no side.
// The solid is everything that looks right from all of them. Returns a manifold the caller frees, resting on z = 0.
const bnds = (P) => P.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
export function toolHull(v) {
  const bag = new Bag();
  const tb = bnds(v.top), L = tb.x1 - tb.x0, Wd = tb.y1 - tb.y0, big = 4 * (L + Wd + 60);
  let s = bag.k(bag.k(bag.k(new W.CrossSection([ccw(v.top)])).extrude(big)).translate([0, 0, -big / 2]));
  if (v.side && v.side.length > 2) {
    const sb = bnds(v.side), sx = L / Math.max(1e-6, sb.x1 - sb.x0);
    const S = v.side.map(([x, z]) => [tb.x0 + (x - sb.x0) * sx, z - sb.y0]);
    const p = bag.k(bag.k(bag.k(bag.k(new W.CrossSection([ccw(S)])).extrude(big)).rotate([90, 0, 0])).translate([0, big / 2, 0]));
    s = bag.k(W.Manifold.intersection([s, p]));
  } else {
    const slab = bag.k(bag.k(W.Manifold.cube([L + 20, Wd + 20, Math.max(0.5, v.T || 10)], false)).translate([tb.x0 - 10, tb.y0 - 10, 0]));
    s = bag.k(W.Manifold.intersection([s, slab]));
  }
  if (v.end && v.end.length > 2) {
    const eb = bnds(v.end), su = Wd / Math.max(1e-6, eb.x1 - eb.x0), yc = (tb.y0 + tb.y1) / 2, uc = (eb.x0 + eb.x1) / 2;
    let zs = 1;
    if (v.side && v.side.length > 2) { const sb = bnds(v.side); zs = (sb.y1 - sb.y0) / Math.max(1e-6, eb.y1 - eb.y0); }
    const E = v.end.map(([u, w]) => [-(w - eb.y0) * zs, yc + (u - uc) * su]);
    const p = bag.k(bag.k(bag.k(bag.k(new W.CrossSection([ccw(E)])).extrude(big)).rotate([0, 90, 0])).translate([-big / 2, 0, 0]));
    s = bag.k(W.Manifold.intersection([s, p]));
  }
  const bb = s.boundingBox();
  const out = s.translate([0, 0, -bb.min[2]]);
  bag.free();
  return out;
}

// ---------- SADDLE MOUNT: a block with a pocket shaped to one part of the tool ----------
// p: board, at, sec [[s, t]] the tool's cross-section over the chosen span (s out from the board, t up), width (along
//   the board), clear, wallB, wallF, floor, hold (fraction of the section the walls rise to), lip (front lip rises this
//   much more), drop. Dovetail (default): the block sits at the foot of a back plate that carries the tongue, and the
//   whole part prints standing — pocket open to the top, walls straight up, nothing overhangs. Studs (legacy): the
//   block hangs on a hook bar and prints on its side.
function saddleBlock(bag, p) {
  const sec = p.sec && p.sec.length > 2 ? p.sec : rrPts(12, 12, 3, 6, 6);
  const sb = bnds(sec), sw = sb.x1 - sb.x0, sh = sb.y1 - sb.y0;
  const clr = (p.clear ?? 1) + TOL.hole / 2, wallB = p.wallB ?? 3, wallF = p.wallF ?? 3, floor = p.floor ?? 3;
  const S0 = sec.map(([s, t]) => [s - sb.x0, t - sb.y0]);
  let cs = bag.k(new W.CrossSection([ccw(S0)]));
  cs = bag.k(cs.offset(clr, 'Round', 2, 24));
  // open to the top: the pocket swept straight up, so the tool drops in and nothing overhangs
  const P = cs.toPolygons()[0], up = sh * 3 + 40, quads = [cs];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; quads.push(bag.k(new W.CrossSection([ccw([a, b, [b[0], b[1] + up], [a[0], a[1] + up]])]))); }
  const pocket = bag.k(W.CrossSection.union(quads));
  const hold = Math.max(0.3, Math.min(1, p.hold ?? 0.6)), wallTop = sh * hold, lipTop = wallTop + (p.lip ?? 3);
  const s0 = -clr - wallB, s1 = sw + clr + wallF, t0 = -clr - floor;
  const outer = [[s0, t0], [s1, t0], [s1, lipTop], [s1 - wallF, lipTop], [s1 - wallF, wallTop], [s0 + wallB, wallTop], [s0, wallTop]];
  let blk = bag.k(new W.CrossSection([ccw(outer)]));
  blk = bag.k(bag.k(blk.offset(-1, 'Round', 2, 16)).offset(1, 'Round', 2, 16));
  const prof = bag.k(bag.k(blk.subtract(pocket)).translate([-s0, -t0]));
  return { prof, sb, s0, t0, s1, hb: lipTop - t0 };
}
export function saddle(p, board) {
  if (p.mount === 'studs') return saddleStuds(p, board);
  const bag = new Bag();
  const pick = pickDove('mount', p, board), D = doveDims(pick.cls, board);
  const yb = -D.T;
  const B = saddleBlock(bag, p);
  const wdt = Math.max(6, p.width || 20), zb = -(1 + D.L) - (p.drop || 0);
  // (s, t) from the block's back-bottom corner → board (y, z) = (yb − s, zb + t), run along X over the width
  const ext = bag.k(bag.k(new W.CrossSection(B.prof.toPolygons().map((poly) => poly.map(([s, t]) => [yb - s, zb + t])), 'EvenOdd')).extrude(wdt));
  const blockM = bag.k(ext.warp((v) => { const a = v[0], b = v[1], c = v[2]; v[0] = c; v[1] = a; v[2] = b; }));
  // back plate from the bed up past the tongue, at least as wide as the tongue needs, its top corners rounded
  const xc = wdt / 2, tw = Math.max(wdt, D.outer + 4), zt = Math.max(0, zb + B.hb);
  const plate = bag.k(prismXZ(bag, rrPts(tw, zt - zb, [2, 2, 0, 0], xc, (zb + zt) / 2), 3).translate([0, yb, 0]));
  const m = bag.k(W.Manifold.union([blockM, plate, tongueIn(bag, D, xc, yb, -1)]));
  bag.free(m);
  return { solid: m, origin: [0, yb + B.s0, zb - B.t0], sb: B.sb, width: wdt, pick, D, upright: true };
}
// ---------- SADDLE MOUNT: a block on a hook bar, with a pocket shaped to one part of the tool ----------
// p: hook fields (board, rows, wire, drop, top, studLen, at) plus
//   sec [[s, t]] the tool's cross-section over the chosen span (s out from the board, t up), width (along the board),
//   clear, wallB, wallF, floor, hold (fraction of the section the walls rise to), lip (front lip rises this much more)
function saddleStuds(p, board) {
  const bag = new Bag();
  const { r } = hookDims(p, board);
  const hp = hookPaths({ ...p, type: 'peg', L: 2, rise: 0, tip: 0 }, board);
  const base = hook({ ...p, type: 'peg', L: 2, rise: 0, tip: 0 }, board); bag.k(base);
  const sec = p.sec && p.sec.length > 2 ? p.sec : rrPts(12, 12, 3, 6, 6);
  const sb = bnds(sec), sw = sb.x1 - sb.x0, sh = sb.y1 - sb.y0;
  const clr = (p.clear ?? 1) + TOL.hole / 2, wallB = p.wallB ?? 3, wallF = p.wallF ?? 3, floor = p.floor ?? 3;
  const S0 = sec.map(([s, t]) => [s - sb.x0, t - sb.y0]);
  let cs = bag.k(new W.CrossSection([ccw(S0)]));
  cs = bag.k(cs.offset(clr, 'Round', 2, 24));
  // open to the top: the pocket swept straight up, so the tool drops in
  const P = cs.toPolygons()[0], up = sh * 3 + 40, quads = [cs];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; quads.push(bag.k(new W.CrossSection([ccw([a, b, [b[0], b[1] + up], [a[0], a[1] + up]])]))); }
  const pocket = bag.k(W.CrossSection.union(quads));
  const hold = Math.max(0.3, Math.min(1, p.hold ?? 0.6)), wallTop = sh * hold, lipTop = wallTop + (p.lip ?? 3);
  const s0 = -clr - wallB, s1 = sw + clr + wallF, t0 = -clr - floor;
  // block outline: back wall to the wall height, front wall a lip higher
  const outer = [[s0, t0], [s1, t0], [s1, lipTop], [s1 - wallF, lipTop], [s1 - wallF, wallTop], [s0 + wallB, wallTop], [s0, wallTop]];
  let blk = bag.k(new W.CrossSection([ccw(outer)]));
  blk = bag.k(bag.k(blk.offset(-1, 'Round', 2, 16)).offset(1, 'Round', 2, 16));
  const prof = bag.k(blk.subtract(pocket));
  // (s, t) → board coords: Y = −r − (s − s0), Z = z0 + (t − t0); extruded along X over the block width
  const toYZ = bag.k(prof.translate([-s0, -t0]));
  const wdt = Math.max(6, p.width || 20);
  const ext = bag.k(bag.k(new W.CrossSection(toYZ.toPolygons().map((poly) => poly.map(([s, t]) => [-r - s, hp.z0 + t])), 'EvenOdd')).extrude(wdt - 0.4));
  const blockM = bag.k(bag.k(ext.warp((v) => { const a = v[0], b = v[1], c = v[2]; v[0] = c + 0.4; v[1] = a; v[2] = b; })));
  // a web from the bar into the block so the joint isn't just the wire
  const web = bag.k(W.Manifold.hull([sphereAt(bag, r, [r, -r, hp.z0 + 6]), sphereAt(bag, r, [r, -r - Math.min(8, s1 - s0), hp.z0 + 2]), sphereAt(bag, r, [r, -r, hp.z0 + 18])]));
  let m = bag.k(W.Manifold.union([base, blockM, web]));
  m = m.trimByPlane([1, 0, 0], 0.4);
  bag.free();
  // where the section's own origin (s = sb.x0, t = sb.y0) ended up, for placing the tool
  return { solid: m, origin: [0.4, -r - (-s0) , hp.z0 + (-t0)], sb, width: wdt };
}


// ---------- DOVETAIL: the wall interface ----------
// A studded base plate on the board carries the groove; every wall part carries the tongue and slides down into it.
// Flanks are 45°, so a tongue prints in every orientation a part might need — standing, face down, or on its side
// (side-lying parts put the tongue's outer corner on the bed). The base prints face down with its studs straight up,
// the way the stud coupons were fit-tested. The tongue's lower end is cut back 45° (shorter at the tip): a standing
// part has no flat underside, and it seats on a matching ramp at the bottom of the groove.
// Model axes as the hooks: X along the board, Y into the board (board face y = 0), Z up. Base top at z = 0.
const SQ2 = Math.SQRT2;
export const DOVE = {
  S: { id: 'S', label: 'S · small', root: 6, d: 3, L: 30, W: 18, T: 7, cols: 1, colStep: 1, rows: 2, rate: { A: 0.6, B: 1.2 }, notches: 1 },
  M: { id: 'M', label: 'M · medium', root: 8, d: 4, L: 40, W: 45, T: 8, cols: 2, colStep: 1, rows: 2, rate: { A: 1.5, B: 3 }, notches: 2 },
  L: { id: 'L', label: 'L · large', root: 12, d: 5, L: 60, W: 70, T: 9, cols: 2, colStep: 2, rows: 3, rate: { A: 3, B: 6 }, notches: 3 },
};
export const DOVE_FLOOR = 4, DOVE_LEVER = 60; // floor under the groove; ratings are kg at a 60 mm lever
// everything about one size on one board: tongue widths, plate size, stud offsets from the plate centre (x, z)
export function doveDims(cls, board) {
  const c = DOVE[cls] || DOVE.M;
  const px = board.lattice === 'square' ? board.pitch : 25, pz = board.lattice === 'square' ? board.rowPitch : 25;
  const H = c.L + 1 + DOVE_FLOOR;
  const studs = [];
  for (let a = 0; a < c.cols; a++) for (let r = 0; r < c.rows; r++) studs.push([(a - (c.cols - 1) / 2) * c.colStep * px, (r - (c.rows - 1) / 2) * pz]);
  const rw = c.root / 2, ow = rw + c.d;
  return { ...c, H, rw, ow, outer: 2 * ow, px, pz, studs, studD: board.studD, studLen: board.studLen, board: board.id };
}
// the tongue profile in (u across, v toward the board), v = 0 on the part's back; shrink = extra clearance on the tongue
// the neck is the narrowest section, and its corners were sharp: a 0.8 mm 45° fillet at the root, met by a 1 mm chamfer
// on the groove's mouth (which also takes the knife-edge off the base's lips)
const DOVE_FILLET = 0.8, DOVE_MOUTH = 1.0;
function tonguePoly(D, shrink = 0) {
  const a = D.rw - SQ2 * shrink, v1 = D.d - shrink, b = a + v1, f = DOVE_FILLET;
  return [[-(a + f), -0.6], [a + f, -0.6], [a + f, 0], [a + f / 2, f / 2], [b, v1], [-b, v1], [-(a + f / 2), f / 2], [-(a + f), 0]];
}
function tongueIn(bag, D, x, yb, ztop, shrink = 0) {
  const P = tonguePoly(D, shrink).map(([u, v]) => [x + u, yb + v]);
  const z0 = ztop - D.L - D.d - 2;
  let m = bag.k(bag.k(bag.k(new W.CrossSection([ccw(P)])).extrude(ztop - z0)).translate([0, 0, z0]));
  // keep z ≥ (ztop − L) + (y − yb): the 45° cut-back at the bottom end
  m = bag.k(m.trimByPlane([0, -1 / SQ2, 1 / SQ2], (ztop - D.L - yb) / SQ2));
  m = bag.k(m.trimByPlane([0, 0, 1], ztop - D.L)); // the part of it buried in the part stops at the root line too
  return m;
}
// a tongue on a part whose back face is the plane y = yb, centred on x, top at ztop. The caller owns the result.
export function tongueSolid(D, x, yb, ztop, shrink = 0) { const bag = new Bag(); const m = tongueIn(bag, D, x, yb, ztop, shrink); bag.free(m); return m; }
// groove cutter in base coordinates (plate y ∈ [−T, 0], top z = 0)
function grooveIn(bag, D) {
  const c = TOL.dove, um = D.rw + SQ2 * c, vc = D.d + c + 0.1, uc = um + vc, T = D.T;
  const gm = DOVE_MOUTH;
  const poly = (k) => [[-(um + gm + k), -1.5], [um + gm + k, -1.5], [um + gm + k, 0], [um + gm / 2 + k, gm / 2], [uc + k, vc], [-(uc + k), vc], [-(um + gm / 2 + k), gm / 2], [-(um + gm + k), 0]].map(([u, v]) => [u, -T + v]);
  const zb = -D.H - 1;
  let g = bag.k(bag.k(bag.k(new W.CrossSection([ccw(poly(0))])).extrude(1 - zb)).translate([0, 0, zb]));
  // the seat: z ≥ −(1 + L) + (y + T), the same 45° as the tongue's end
  g = bag.k(g.trimByPlane([0, -1 / SQ2, 1 / SQ2], (T - 1 - D.L) / SQ2));
  // lead-in at the top edge so the tongue finds the groove
  const lead = hull(bag, [poly(0).map(([x, y]) => [x, y, -2.5]), poly(1.2).map(([x, y]) => [x, y, 0.6])]);
  return { cut: union(bag, [g, lead]), um, uc, vc };
}
// the base plate: groove in the front face, open at the top, blind at the bottom; studs out of the back into the board
export function doveBase(cls, board, o = {}) {
  const bag = new Bag();
  const D = doveDims(cls, board);
  const { W: Wd, H, T } = D;
  const ring = (w, h, r, y) => rrPts(w, h, r, 0, -H / 2).map(([x, z]) => [x, y, z]);
  let body = hull(bag, [ring(Wd - 0.8, H - 0.8, 2.6, -T), ring(Wd, H, 3, -T + 0.4), ring(Wd, H, 3, -0.4), ring(Wd - 0.8, H - 0.8, 2.6, 0)]);
  const rs = (D.studD + TOL.stud) / 2, Ls = o.studLen || D.studLen;
  const st = [];
  for (const [sx, sz] of D.studs) {
    const r = (rad, y) => circlePts(rad, 0, 0, 32).map(([u, v]) => [sx + u, y, -H / 2 + sz + v]);
    st.push(hull(bag, [r(rs, -0.5), r(rs, Ls - 0.5), r(rs - 0.5, Ls)]));
  }
  body = bag.k(W.Manifold.union([body, ...st]));
  const gr = grooveIn(bag, D);
  const cut = [gr.cut];
  // size marks: 1, 2 or 3 notches in the top edge beside the groove
  for (let k = 0; k < D.notches; k++) { const x = gr.uc + 1.6 + k * 1.8; if (x + 0.5 < Wd / 2 - 1) cut.push(bag.k(bag.k(W.Manifold.cube([0.9, T + 2, 2.2], false)).translate([x - 0.45, -T - 1, -1.2]))); }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  bag.free(body);
  return { solid: body, D, groove: { um: gr.um, uc: gr.uc, vc: gr.vc } };
}
// print orientation for a base: front face on the bed, studs straight up
export function basePrint(m) { const bag = new Bag(); const r = bag.k(m.rotate([90, 0, 0])); const out = transformed(r, 'center'); bag.free(); return out; }
// fit ladder: one S base (with studs, so the stud fit gets tested too) and five short tongue stubs, the k-th
// 1 + k notches on top, shrunk by (k − 2) × step on every flank. The stub that slides in snug is your clearance.
export function doveCoupon(board, step = 0.05) {
  const bag = new Bag();
  const D = doveDims('S', board);
  const list = [];
  for (let k = 0; k < 5; k++) {
    const x0 = k * 24, h = 20, tw = D.outer + 4;
    // stub: a 4 mm plate (y ∈ [−4, 0]) carrying a 20 mm tongue; built in hook axes, printed standing
    const plate = prismXZ(bag, rrPts(tw, h + 2, [2, 2, 0, 0], x0, -(h + 2) / 2), 4);
    const Dk = { ...D, L: h };
    const t = tongueIn(bag, Dk, x0, 0, -1, (k - 2) * step);
    const marks = [];
    for (let n = 0; n <= k; n++) marks.push(bag.k(bag.k(W.Manifold.cube([0.8, 6, 1.2], false)).translate([x0 + (n - k / 2) * 1.8 - 0.4, -5, -1.1])));
    list.push(bag.k(W.Manifold.difference([union(bag, [plate, t]), ...marks])));
  }
  const stubs = union(bag, list);
  bag.free(stubs);
  return { stubs, D };
}

// ---------- DESK ORGANISERS ----------
// Trays (compartments, angled floor or top), open-front bins, pen cups, slot blocks, file sorters and stands.
// Freestanding with a flat bottom, or on Gridfinity feet (base 'grid', sized in units) so they drop into a shelf,
// table plate or drawer. Axes: X across, Y front (−) to back (+), Z up; heights are from the desk, feet included.
// All print the way they stand except stands, which lie on their side so the profile is the layer. Every face
// that leans out leans ≤ 45° from vertical, so none of them needs support.
export const DESK_KINDS = [
  ['stack', 'Desk stack — drawer units and a caddy, assembled'],
  ['drawers', 'Drawer unit — stackable'],
  ['caddy', 'Caddy — angled frame with a Gridfinity floor'],
  ['tray', 'Tray — compartments, angled floor or top'],
  ['bin', 'Open-front bin — low scooped front, label'],
  ['cup', 'Pen cup — round, hex or square'],
  ['slots', 'Slot block — cards, SD cards, phones, rulers'],
  ['sorter', 'File sorter — stepped, leaning dividers'],
  ['stand', 'Stand — phone, tablet, book'],
];
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const listOf = (s) => { const v = String(s ?? '').split(/[,\s]+/).map(Number).filter((x) => x > 0); return v.length ? v : null; };
export function deskDims(p) {
  const grid = p.base === 'grid' && !['stand', 'drawers', 'caddy', 'stack'].includes(p.kind);
  const W = grid ? 42 * p.nx - 0.5 - 2 * TOL.bin : p.W, D = grid ? 42 * p.ny - 0.5 - 2 * TOL.bin : p.D;
  const z0 = grid ? 4.75 : 0, top = grid ? GF.hu * p.U : p.H;
  const R = grid ? GF.rBin : clampN(p.r ?? 6, 0.5, Math.min(W, D) / 2 - 0.5);
  return { grid, W, D, z0, top, R };
}
// keep what lies below / above the plane through (y = ya, z = za) and (y = yb, z = zb)
function keepBelow(bag, m, ya, za, yb, zb) { const dy = yb - ya, dz = zb - za, L = Math.hypot(dy, dz) || 1, n = [0, dz / L, -dy / L]; return bag.k(m.trimByPlane(n, n[1] * ya + n[2] * za)); }
function keepAbove(bag, m, ya, za, yb, zb) { const dy = yb - ya, dz = zb - za, L = Math.hypot(dy, dz) || 1, n = [0, -dz / L, dy / L]; return bag.k(m.trimByPlane(n, n[1] * ya + n[2] * za)); }
// U-shaped notch cutter in the XZ plane: nw wide, bottom (rounded) at zb, running through y ∈ [y0, y1]
function uNotch(bag, nw, zb, y0, y1, cx = 0) {
  const hh = Math.max(nw, 40);
  return bag.k(prismXZ(bag, rrPts(nw, hh, [0, 0, nw / 2, nw / 2], cx, zb + hh / 2), y1 - y0).translate([0, y1, 0]));
}
// finish the bottom: Gridfinity magnets, or a 0.5 mm 45° chamfer at the bed edge (no elephant foot) and
// Ø10.4 × 1.2 recesses for stick-on bumpers. ol(i) = the (convex) outline grown by −i.
function deskFinish(bag, p, d, body, ol, padsAt) {
  if (d.grid) {
    const holes = [];
    if (p.magnets && p.magnets !== 'off') for (let a = 0; a < p.nx; a++) for (let c = 0; c < p.ny; c++) holes.push(...cellMagnets(bag, p.nx, p.ny, a, c, (a - (p.nx - 1) / 2) * 42, (c - (p.ny - 1) / 2) * 42, -1, GF.magnet.depth, p.magnets, p.magCorners));
    return holes.length ? bag.k(W.Manifold.difference([body, ...holes])) : body;
  }
  const e = 0.5, o = -0.05, keep = hull(bag, [lift(ol(e), -0.01), lift(ol(o), e - o), lift(ol(o), d.top + 20)]); // grown 0.05 past the wall: no coincident faces
  body = bag.k(W.Manifold.intersection([body, keep]));
  if (p.pads && padsAt && padsAt.length) body = bag.k(W.Manifold.difference([body, ...padsAt.map(([x, y]) => cylinder(bag, 5.2, -1, 1.2, x, y, 32))]));
  return body;
}
const rectPads = (W, D, R) => { const m = Math.max(R, 6.4) + 1.6; return W > 2 * m + 12 && D > 2 * m + 12 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * (W / 2 - m), sy * (D / 2 - m)]) : []; };

export function desk(p) {
  const k = p.kind || 'tray';
  if (k === 'cup') return deskCup(p);
  if (k === 'slots') return deskSlots(p);
  if (k === 'sorter') return deskSorter(p);
  if (k === 'stand') return deskStand(p);
  return deskTray(p);
}

// TRAY / BIN: compartments by count or by relative widths, top sloping down to a lower front (over the whole
// depth or just the front part), floor tilted down to the front, a quarter-round scoop at the front of each
// compartment, dividers dropped below the rim, a grab notch in the front wall, a label recess on the front face.
function deskTray(p) {
  const bag = new Bag(), d = deskDims(p), { W: Wx, D, z0, top, R } = d, warn = [];
  const wall = clampN(p.wall ?? 1.6, 0.8, 4), div = clampN(p.div ?? 1.2, 0.8, 4), fl = clampN(p.floor ?? 1.6, 0.8, 6);
  const yf = -D / 2, yb = D / 2, yIn = yf + wall, yOut = yb - wall;
  const zFront = p.frontH > 0 ? clampN(p.frontH, z0 + fl + 4, top) : top;
  const ySl = yf + D * clampN(p.slopeTo ?? 1, 0.15, 1);
  const zTop = (y) => (zFront >= top - 0.01 || y >= ySl ? top : zFront + ((top - zFront) * (y - yf)) / (ySl - yf));
  let outer = prism(bag, rrPts(Wx, D, R), z0, top);
  if (zFront < top - 0.01) outer = keepBelow(bag, outer, yf, zFront, ySl, top);
  let body = d.grid ? union(bag, [outer, feet(bag, p.nx, p.ny)]) : outer;
  // compartments
  const iw = Wx - 2 * wall, id = D - 2 * wall;
  const ws = listOf(p.cols) || Array(Math.max(1, p.cx | 0)).fill(1), nr = Math.max(1, p.cy | 0);
  const freeW = iw - div * (ws.length - 1), sumW = ws.reduce((a, b) => a + b, 0), rowD = (id - div * (nr - 1)) / nr;
  if ((freeW * Math.min(...ws)) / sumW < 6 || rowD < 6) throw new Error('compartments come out under 6 mm — fewer of them, or a bigger tray');
  // floor tilt: rises toward the back; keep the floor ≥ 4 mm under the rim everywhere
  let ta = Math.tan((clampN(p.tilt || 0, 0, 35) * Math.PI) / 180);
  for (const y of [yOut, Math.min(yOut, ySl)]) if (y > yIn + 1) { const lim = (zTop(y) - 4 - z0 - fl) / (y - yIn); if (ta > lim) { ta = Math.max(0, lim); warn.push(`floor tilt cut to ${((Math.atan(ta) * 180) / Math.PI).toFixed(1)}° so the back of the floor stays under the rim`); } }
  const zF = (y) => z0 + fl + Math.max(0, y - yIn) * ta;
  const rIn = Math.max(0.5, R - wall), cut = [], adds = [];
  let x = -iw / 2;
  for (const wv of ws) {
    const cw = (freeW * wv) / sumW;
    for (let r = 0; r < nr; r++) {
      const y0 = yIn + r * (rowD + div), y1 = y0 + rowD, cr = Math.max(0.3, Math.min(rIn, cw / 2 - 0.3, rowD / 2 - 0.3));
      let pk = prism(bag, rrPts(cw, rowD, cr, x + cw / 2, (y0 + y1) / 2), zF(y0), top + 2);
      if (ta > 0) pk = keepAbove(bag, pk, y0, zF(y0), y1, zF(y1));
      cut.push(pk);
      // scoop: quarter-round fillet between the floor and the compartment's front wall — faces up and back
      const rs = Math.min(p.scoop || 0, rowD * 0.5, zTop(y0) - zF(y0) - 2);
      if (rs >= 2) {
        const zf0 = zF(y0), prof = [[y0 - 0.5, zf0 - 0.5], [y0 + rs, zf0 - 0.5]];
        for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 - (i / 16) * (Math.PI / 2); prof.push([y0 + rs + rs * Math.cos(t), zf0 + rs + rs * Math.sin(t)]); }
        prof.push([y0 - 0.5, zf0 + rs]);
        adds.push(prismYZ(bag, prof, x, x + cw));
      }
    }
    x += cw + div;
  }
  // dividers dropped below the rim (following the sloped top)
  let dd = p.divDrop || 0;
  if (dd > 0 && (ws.length > 1 || nr > 1)) {
    dd = Math.min(dd, zFront - zF(yIn) - 3, top - zF(yOut) - 3);
    if (dd >= 1) {
      const inner = prism(bag, rrPts(iw, id, rIn), z0, top + 2), list = [prism(bag, rrPts(iw, id, rIn), top - dd, top + 2)];
      if (zFront < top - 0.01) list.push(keepAbove(bag, inner, yf, zFront - dd, ySl, top - dd));
      cut.push(union(bag, list));
    }
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  if (adds.length) body = bag.k(W.Manifold.union([body, ...adds]));
  // grab notch in the front wall
  if (p.notch > 0) {
    const nw = Math.min(p.notch, Wx - 2 * R - 6), nd = Math.min(p.notchD || nw * 0.5, zFront - zF(yIn) - 3);
    if (nw >= 8 && nd >= 3) body = bag.k(W.Manifold.difference([body, uNotch(bag, nw, zFront - nd, yf - 1, yIn + 0.4)]));
  }
  // label recess on the front face, 0.6 deep
  if (p.label) {
    const lw = Math.min(p.labelW || Wx * 0.6, Wx - 2 * R - 6), lh = Math.min(p.labelH || 12, zFront - z0 - 5);
    const zc = z0 + (zFront - z0) / 2 + (p.notch > 0 ? -Math.min(p.notchD || p.notch * 0.5, zFront - z0) / 2 : 0);
    if (lw > 10 && lh > 5) body = bag.k(W.Manifold.difference([body, prismYZ(bag, [[yf - 1, zc - lh / 2], [yf + 0.6, zc - lh / 2], [yf + 0.6, zc + lh / 2], [yf - 1, zc + lh / 2]], -lw / 2, lw / 2)]));
  }
  body = deskFinish(bag, p, d, body, (i) => rrPts(Wx - 2 * i, D - 2 * i, Math.max(0.3, R - i)), rectPads(Wx, D, R));
  bag.free(body);
  return { solid: body, print: 'upright', d: { ...d, cells: ws.length * nr, zFront, tilt: (Math.atan(ta) * 180) / Math.PI }, warn };
}

// PEN CUP: round, hex (size across the flats, flats front and back) or rounded square; top slanted down to the
// front; dividers across, stopping under the rim so pens lean over them.
function deskCup(p) {
  const bag = new Bag(), d = deskDims(p), { W: Wx, D, z0, top } = d, warn = [];
  const shape = p.shape || 'round', wall = clampN(p.wall ?? 1.6, 0.8, 4), fl = clampN(p.floor ?? 2, 0.8, 6);
  let S = p.dia || 70;
  if (d.grid) { const lim = shape === 'hex' ? Math.min(D, (Wx * Math.sqrt(3)) / 2) : Math.min(Wx, D); if (S > lim) { S = lim; } }
  const rq = Math.min(8, S / 4);
  const shp = (s) => (shape === 'hex' ? Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return [(s / Math.sqrt(3)) * Math.cos(a), (s / Math.sqrt(3)) * Math.sin(a)]; })
    : shape === 'square' ? rrPts(s, s, Math.max(0.5, rq - (S - s) / 2)) : circlePts(s / 2, 0, 0, 96));
  const yF = shape === 'hex' ? -S / 2 : -S / 2, yB = -yF;
  let outer = prism(bag, shp(S), z0, top);
  if (p.slant > 0) outer = keepBelow(bag, outer, yF, top - Math.min(p.slant, top - z0 - fl - 10), yB, top);
  const parts = [outer];
  if (d.grid) parts.push(feet(bag, p.nx, p.ny), prism(bag, rrPts(Wx, D, GF.rBin), z0, z0 + fl));
  let body = union(bag, parts);
  body = bag.k(W.Manifold.difference([body, prism(bag, shp(S - 2 * wall), z0 + fl, top + 2)]));
  const dv = p.dividers || 'none', t = clampN(p.div ?? 1.2, 0.8, 3), dh = Math.max(z0 + fl + 10, top - (p.slant > 0 ? Math.min(p.slant, top - z0 - fl - 10) : 0) - Math.max(0, p.divDrop ?? 15)), ins = [];
  if (dv === 'half' || dv === 'cross') ins.push(prism(bag, rrPts(S, t, 0.2), z0 + fl - 0.01, dh));
  if (dv === 'cross') ins.push(prism(bag, rrPts(t, S, 0.2), z0 + fl - 0.01, dh));
  if (ins.length) body = bag.k(W.Manifold.union([body, bag.k(W.Manifold.intersection([union(bag, ins), prism(bag, shp(S - 2 * wall + 0.2), z0, top)]))]));
  const pr = shape === 'hex' ? S / 2 - 7.5 : S / 2 - 7.8, pads = S >= 50 ? [90, 210, 330].map((a) => [pr * Math.cos((a * Math.PI) / 180), pr * Math.sin((a * Math.PI) / 180)]) : [];
  body = deskFinish(bag, p, d.grid ? d : { ...d, top }, body, (i) => shp(S - 2 * i), pads);
  bag.free(body);
  return { solid: body, print: 'upright', d: { ...d, S, W: d.grid ? Wx : shape === 'hex' ? (2 * S) / Math.sqrt(3) : S, D: d.grid ? D : S }, warn };
}

// SLOT BLOCK: n slots across the block (along X), one behind another, `gap` wide, `depth` deep, leaning back by
// `lean`° (≤ 30, so the overhanging face stays printable), square or round bottoms, the top stepping down toward
// the front by `rise` mm so the back rows show, and a finger channel across them all.
function deskSlots(p) {
  const bag = new Bag(), d = deskDims(p), { W: Wx, D, z0, top, R } = d, warn = [];
  const n = Math.max(1, p.n | 0), gap = clampN(p.gap || 3, 0.6, 60), wall = clampN(p.wall ?? 2.4, 1.2, 8), endW = clampN(p.endWall ?? 3, 1.6, 20);
  const ta = Math.tan((clampN(p.lean || 0, 0, 30) * Math.PI) / 180), rise = Math.max(0, p.rise || 0);
  const pitch = Math.max(gap + 1.2, p.pitch > 0 ? p.pitch : gap + 2.4);
  const zt = (y) => (rise > 0 ? top - rise + (rise * (y + D / 2)) / D : top);
  const sdMax = Math.min(...[0, 1].map((k) => zt(-D / 2 + k * D))) - z0 - 2;
  const sd = clampN(p.depth || (top - z0) * 0.7, 2, top - z0 - 2), span = (n - 1) * pitch + gap, sh = sd * ta;
  if (span + sh > D - 2 * wall) throw new Error(`${n} slots need ${(span + sh + 2 * wall).toFixed(0)} mm of depth — make the block deeper, or use fewer or thinner slots`);
  if (sd > sdMax + 2) warn.push('slots are nearly as deep as the block — the floor under them is thin');
  let body = prism(bag, rrPts(Wx, D, R), z0, top);
  if (rise > 0) body = keepBelow(bag, body, -D / 2, top - rise, D / 2, top);
  if (d.grid) body = union(bag, [body, feet(bag, p.nx, p.ny)]);
  const L = Wx - 2 * endW, y0 = -(span + sh) / 2, cut = [], Z = top + 2;
  for (let i = 0; i < n; i++) {
    const ya = y0 + i * pitch, zb = zt(ya + gap / 2) - sd;
    const prof = [];
    if (p.round && gap >= 2) {
      const r = gap / 2, zc = zb + r;
      for (let s = 0; s <= 16; s++) { const t = Math.PI + (s / 16) * Math.PI; prof.push([ya + r + r * Math.cos(t), zc + r * Math.sin(t)]); }
      prof.push([ya + gap + (Z - zc) * ta, Z], [ya + (Z - zc) * ta, Z]);
    } else prof.push([ya, zb], [ya + gap, zb], [ya + gap + (Z - zb) * ta, Z], [ya + (Z - zb) * ta, Z]);
    cut.push(prismYZ(bag, prof, -L / 2, L / 2));
  }
  if (p.notch > 0) {
    const nw = Math.min(p.notch, L - 6), nd = Math.min(p.notchD || sd * 0.5, sd - 1);
    if (nw >= 6 && nd >= 2) cut.push(uNotch(bag, nw, zt(-D / 2) - nd, -D / 2 - 1, D / 2 + 1));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  body = deskFinish(bag, p, d, body, (i) => rrPts(Wx - 2 * i, D - 2 * i, Math.max(0.3, R - i)), rectPads(Wx, D, R));
  bag.free(body);
  return { solid: body, print: 'upright', d: { ...d, n, span, sd }, warn };
}

// FILE SORTER: dividers across the width, the front one lowest and each one behind `step` taller, all leaning
// back by `lean`° (≤ 25), on a floor, with side walls that follow the tops. n slots, `gap` each or a list.
function deskSorter(p) {
  const bag = new Bag(), d = deskDims(p), { W: Wx, z0 } = d, warn = [];
  const n = Math.max(1, p.n | 0), tk = clampN(p.div ?? 2.4, 1.2, 6), fl = clampN(p.floor ?? 2.4, 1.2, 6), wall = clampN(p.wall ?? 2.4, 1.6, 6);
  const gaps = listOf(p.gaps) || Array(n).fill(p.gap || 30);
  const ta = Math.tan((clampN(p.lean || 0, 0, 25) * Math.PI) / 180);
  const h0 = Math.max(z0 + fl + 10, p.frontH || 60), step = Math.max(0, p.step ?? 20);
  const ys = [0]; for (const gv of gaps) ys.push(ys[ys.length - 1] + tk + gv);
  const nd = ys.length, hs = ys.map((_, i) => h0 + i * step);
  const lean = (h) => (h - z0) * ta, yEnd0 = ys[nd - 1] + tk + lean(hs[nd - 1]);
  let D = yEnd0;
  if (d.grid) { D = d.D; if (yEnd0 > D + 0.01) throw new Error(`the dividers need ${yEnd0.toFixed(0)} mm of depth and ${p.ny} unit${p.ny > 1 ? 's give' : ' gives'} ${D.toFixed(0)} — more units, fewer or narrower slots, or less lean`); }
  else D = Math.max(yEnd0, p.D || 0);
  const Y = (y) => y - D / 2, yEnd = Y(Math.max(yEnd0, D));
  const parts = [prism(bag, rrPts(Wx, D, d.grid ? GF.rBin : 3), z0, z0 + fl + 0.01)];
  for (let i = 0; i < nd; i++) { const y = Y(ys[i]), h = hs[i]; parts.push(prismYZ(bag, [[y, z0], [y + tk, z0], [y + tk + lean(h), h], [y + lean(h), h]], -Wx / 2, Wx / 2)); }
  if (p.sides !== false) {
    const prof = [[Y(0), z0], [yEnd, z0], [Math.max(yEnd, Y(ys[nd - 1]) + tk + lean(hs[nd - 1])), hs[nd - 1]]];
    for (let i = nd - 1; i >= 0; i--) prof.push([Y(ys[i]) + lean(hs[i]), hs[i]]);
    for (const sx of [-1, 1]) parts.push(prismYZ(bag, prof, sx < 0 ? -Wx / 2 : Wx / 2 - wall, sx < 0 ? -Wx / 2 + wall : Wx / 2));
  }
  if (d.grid) parts.push(feet(bag, p.nx, p.ny));
  let body = union(bag, parts);
  if (p.notch > 0) {
    const nw = Math.min(p.notch, Wx - 2 * wall - 10), cuts = [];
    if (nw >= 10) for (let i = 0; i < nd; i++) {
      const h = hs[i], ndp = Math.min((h - z0 - fl) * 0.4, p.notchD || nw * 0.6);
      if (ndp < 4) continue;
      const u = uNotch(bag, nw, h - ndp, Y(ys[i]) - 1, Y(ys[i]) + tk + 1);
      cuts.push(bag.k(u.warp((v) => { v[1] += lean(Math.max(z0, v[2])); })));
    }
    if (cuts.length) body = bag.k(W.Manifold.difference([body, ...cuts]));
  }
  const R = d.grid ? GF.rBin : 3;
  body = deskFinish(bag, p, { ...d, top: hs[nd - 1] }, body, (i) => rrPts(Wx - 2 * i, D - 2 * i, Math.max(0.3, R - i)), rectPads(Wx, D, R));
  bag.free(body);
  return { solid: body, print: 'upright', d: { ...d, D, top: hs[nd - 1], slots: gaps.length }, warn };
}

// STAND: one side profile run across the width — base, front lip, a slot for the device's bottom edge, a back
// rest leaning `angle`° back from vertical, a 45° strut behind it, and an optional cable funnel through the lip.
// Prints on its side: every layer is the whole profile, so the rest can't snap along a layer line.
function deskStand(p) {
  const bag = new Bag(), warn = [];
  const Wd = clampN(p.W || 80, 20, 300), t = clampN(p.thick ?? 4, 2.4, 10), a = (clampN(p.angle ?? 20, 5, 40) * Math.PI) / 180;
  const Hr = clampN(p.H || 90, 20, 300), slot = clampN(p.slot ?? 12, 2, 40), lip = clampN(p.lip ?? 10, 2, 40);
  const sa = Math.sin(a), ca = Math.cos(a), yr = t + slot;
  const P0 = [yr, t], u = [sa, ca], v = [ca, -sa];
  const at = (s, k) => [P0[0] + s * u[0] + k * v[0], P0[1] + s * u[1] + k * v[1]];
  const rest = [at(0, 0), at(Hr, 0), at(Hr, t), at(0, t)];
  let Lb = Math.max(p.D || 0, at(Hr, t)[0] + 4);
  const shapes = [rest, [[0, 0], [t, 0], [t, t + lip], [0, t + lip]]];
  if (p.brace !== false) {
    const A = at(Hr * 0.55, t), B = [A[0] + (A[1] - t), t], dir = [Math.SQRT1_2, -Math.SQRT1_2], nr = [Math.SQRT1_2, Math.SQRT1_2];
    const A1 = [A[0] - dir[0] * t, A[1] - dir[1] * t], B1 = [B[0] + dir[0] * t * 0.7, B[1] + dir[1] * t * 0.7], h = t * 0.5;
    shapes.push([[A1[0] + nr[0] * h, A1[1] + nr[1] * h], [A1[0] - nr[0] * h, A1[1] - nr[1] * h], [B1[0] - nr[0] * h, B1[1] - nr[1] * h], [B1[0] + nr[0] * h, B1[1] + nr[1] * h]]);
    Lb = Math.max(Lb, B[0] + t * 1.5);
  }
  shapes.push([[0, 0], [Lb, 0], [Lb, t], [0, t]]);
  const off = -Lb / 2;
  let body = union(bag, shapes.map((s) => prismYZ(bag, s.map(([y, z]) => [y + off, z]), -Wd / 2, Wd / 2)));
  // cable funnel: through the lip and the floor of the slot, widening 45° to the front so the edge that ends up
  // on top when it prints on its side is a 45° roof, not a flat ceiling
  if (p.cable > 0) {
    const cw = Math.min(p.cable, Wd - 12), ye = yr + off, yf = off - 1, wf = cw / 2 + (ye - yf);
    if (wf * 2 < Wd - 4) body = bag.k(W.Manifold.difference([body, prism(bag, [[-cw / 2, ye], [cw / 2, ye], [wf, yf], [-wf, yf]], -1, t + lip + 1)]));
    else warn.push('cable funnel left out — it would split the stand; make it wider or the funnel narrower');
  }
  bag.free(body);
  const topY = at(Hr, 0);
  return { solid: body, print: 'side', d: { W: Wd, D: Lb, top: topY[1], grid: false }, warn };
}

// ---------- DESK STACK: drawer units and caddies on one footprint, stacking on each other ----------
// Footprint nx × ny grid units, 42n + 8 (so Gridfinity bins fit in the drawers and the caddy's baseplate).
// Every layer stands on a 1.9 mm foot (inset 1.2 at its top, 45° sides); a unit that takes a layer on top has a
// matching 2 mm pocket with a 0.9 mm rim. The layer above rests on the rim, walls flush.
export const STACK = { pad: 4, R: 4, g: 1.2, foot: 1.9, pocket: 2.0, clr: 0.3 };
export const stackSize = (nx, ny) => ({ W: 42 * nx + 2 * STACK.pad, D: 42 * ny + 2 * STACK.pad });
const stackRing = (Wf, Df, i, z) => lift(rrPts(Wf - 2 * i, Df - 2 * i, Math.max(0.3, STACK.R - i)), z);
function stackBody(bag, Wf, Df, top) {
  const { g, foot } = STACK;
  return union(bag, [prism(bag, rrPts(Wf, Df, STACK.R), foot, top), hull(bag, [stackRing(Wf, Df, g + foot, 0), stackRing(Wf, Df, g, foot), stackRing(Wf, Df, g, foot + 0.3)])]);
}
function stackPocket(bag, Wf, Df, top) {
  const { g, clr, pocket: P } = STACK, i0 = g - clr;
  return hull(bag, [stackRing(Wf, Df, i0 + P, top - P), stackRing(Wf, Df, i0 - 1, top + 1)]);
}
// 90° V-grooves down the outside: vertical on the caddy, and 45°-roofed when a housing prints on its back
function flutes(bag, Wf, Df, z0, z1, sides = 'all', pitch = 4.5, d = 0.9) {
  const out = [], R = STACK.R;
  const run = (len) => { const n = Math.max(0, Math.floor((len - 2 * R - 6) / pitch)); return Array.from({ length: n + 1 }, (_, k) => (k - n / 2) * pitch); };
  const v = (x, y) => prism(bag, [[x, y - d], [x + d, y], [x, y + d], [x - d, y]], z0, z1);
  if (sides === 'all') for (const x of run(Wf)) out.push(v(x, -Df / 2));
  for (const x of run(Wf)) out.push(v(x, Df / 2));
  for (const y of run(Df)) out.push(v(-Wf / 2, y), v(Wf / 2, y));
  return out;
}
// compartments (by count or ratios), with a quarter-round scoop at the front of each — shared by drawers
function cellPockets(bag, x0, x1, y0, y1, z0, ztop, p, cut, adds) {
  const div = clampN(p.div ?? 1.0, 0.8, 3), iw = x1 - x0, id = y1 - y0;
  const ws = listOf(p.cols) || Array(Math.max(1, p.cx | 0)).fill(1), nr = Math.max(1, p.cy | 0);
  const freeW = iw - div * (ws.length - 1), sumW = ws.reduce((a, b) => a + b, 0), rowD = (id - div * (nr - 1)) / nr;
  if ((freeW * Math.min(...ws)) / sumW < 6 || rowD < 6) throw new Error('compartments come out under 6 mm — fewer of them');
  let x = x0;
  for (const wv of ws) {
    const cw = (freeW * wv) / sumW;
    for (let r = 0; r < nr; r++) {
      const ya = y0 + r * (rowD + div), cr = Math.max(0.3, Math.min(1.5, cw / 2 - 0.3, rowD / 2 - 0.3));
      cut.push(prism(bag, rrPts(cw, rowD, cr, x + cw / 2, ya + rowD / 2), z0, ztop));
      const rs = Math.min(p.scoop || 0, rowD * 0.5, ztop - z0 - 4);
      if (rs >= 2) {
        const prof = [[ya - 0.5, z0 - 0.5], [ya + rs, z0 - 0.5]];
        for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 - (i / 16) * (Math.PI / 2); prof.push([ya + rs + rs * Math.cos(t), z0 + rs + rs * Math.sin(t)]); }
        prof.push([ya - 0.5, z0 + rs]);
        adds.push(prismYZ(bag, prof, x, x + cw));
      }
    }
    x += cw + div;
  }
  return { cols: ws.length, rows: nr };
}
// DRAWER UNIT: a housing open at the front with n bays side by side, one drawer in each.
// The housing prints on its back (openings up: no bridges, the V-flutes get 45° roofs). A small ridge under the
// ceiling just inside the front catches a tab on the drawer's back wall, so a drawer stops instead of falling
// out; its sides sit 2.5 mm lower so only the tab meets the ridge. Lift the front a little to take it out.
export function drawerUnit(p) {
  const bag = new Bag(), { W: Wf, D: Df } = stackSize(p.nx, p.ny), warn = [];
  const H = clampN(p.H || 50, 24, 300), w = p.flutes ? 2.6 : 2.0, n = Math.max(1, p.n | 0), pocketOn = p.pocket !== false;
  const zb = STACK.foot + 2.0, zt = H - (pocketOn ? STACK.pocket + 1.6 : 2.0);
  const bw = (Wf - 2 * w - (n - 1) * 2.0) / n;
  if (bw < 30) throw new Error(`${n} drawers side by side come out ${bw.toFixed(0)} mm wide — fewer drawers or a wider footprint`);
  if (zt - zb < 12) throw new Error('too low for a drawer — 24 mm or more');
  let body = stackBody(bag, Wf, Df, H);
  const cut = [], adds = [], bays = [];
  if (pocketOn) cut.push(stackPocket(bag, Wf, Df, H));
  if (p.flutes) cut.push(...flutes(bag, Wf, Df, STACK.foot + 1.5, H - 3, 'noFront'));
  const yr = -Df / 2 + 2.4 + 1.0;
  for (let i = 0; i < n; i++) {
    const x0 = -Wf / 2 + w + i * (bw + 2.0);
    bays.push(x0 + bw / 2);
    cut.push(prism(bag, [[x0, -Df / 2 - 1], [x0 + bw, -Df / 2 - 1], [x0 + bw, Df / 2 - w], [x0, Df / 2 - w]], zb, zt));
    adds.push(prismYZ(bag, [[yr, zt + 0.01], [yr, zt - 1.5], [yr + 1.5, zt + 0.01]], x0 - 0.01, x0 + bw + 0.01));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  body = bag.k(W.Manifold.union([body, ...adds]));
  bag.free(body);
  const c = 0.4, dw = bw - 2 * c, dd = Df - w - 0.5, dh = zt - zb - 0.6;
  const dr = drawerBox(dw, dd, dh, p);
  const drawers = [dr.solid]; for (let i = 1; i < n; i++) drawers.push(dr.solid.translate([0, 0, 0]));
  return { housing: body, drawers, bays, zb, zt, dw, dd, dh, inner: dr.inner, W: Wf, D: Df, H, warn };
}
function drawerBox(dw, dd, dh, p) {
  const bag = new Bag(), ft = 2.4, wl = 1.2, fl = 1.2, low = 2.5;
  let body = prism(bag, rrPts(dw, dd, 1.2), 0, dh);
  const cut = [], adds = [];
  const y0 = -dd / 2 + ft, y1 = dd / 2 - wl;
  const lay = cellPockets(bag, -dw / 2 + wl, dw / 2 - wl, y0, y1, fl, dh + 2, p, cut, adds);
  // behind the front panel everything sits 2.5 lower, except the stop tab in the middle of the back wall
  cut.push(prism(bag, [[-dw / 2 - 1, y0], [dw / 2 + 1, y0], [dw / 2 + 1, dd / 2 + 1], [-dw / 2 - 1, dd / 2 + 1]], dh - low, dh + 1));
  if (p.pull > 0) {
    const nw = Math.min(p.pull, dw - 14), nd = Math.min(14, (dh - fl) * 0.45);
    if (nw >= 12) cut.push(uNotch(bag, nw, dh - nd, -dd / 2 - 1, y0 + 0.5));
  }
  if (p.label) {
    const nd = p.pull > 0 ? Math.min(14, (dh - fl) * 0.45) : 0, lw = Math.min(p.labelW || dw * 0.5, dw - 12), lh = Math.min(12, dh - nd - 6);
    if (lw > 10 && lh > 5) cut.push(prismYZ(bag, [[-dd / 2 - 1, (dh - nd) / 2 - lh / 2], [-dd / 2 + 0.6, (dh - nd) / 2 - lh / 2], [-dd / 2 + 0.6, (dh - nd) / 2 + lh / 2], [-dd / 2 - 1, (dh - nd) / 2 + lh / 2]], -lw / 2, lw / 2));
  }
  body = bag.k(W.Manifold.difference([body, ...cut]));
  const tabW = Math.min(30, dw / 3);
  adds.push(prism(bag, [[-tabW / 2, dd / 2 - wl], [tabW / 2, dd / 2 - wl], [tabW / 2, dd / 2 - 0.01], [-tabW / 2, dd / 2 - 0.01]], dh - low - 0.01, dh));
  body = bag.k(W.Manifold.union([body, ...adds]));
  bag.free(body);
  return { solid: body, inner: { W: dw - 2 * wl, D: y1 - y0, H: dh - low - fl }, lay };
}
// CADDY: an open frame on the stacking foot with a Gridfinity baseplate floor, its top sloping from the front
// height up to the back height, optional V-flutes. Holds bins, holders and the desk inserts.
export function caddy(p) {
  const bag = new Bag(), { W: Wf, D: Df } = stackSize(p.nx, p.ny);
  const Hb = clampN(p.H || 70, 20, 300), Hf = clampN(p.frontH > 0 ? p.frontH : Hb, 16, Hb);
  const zb = STACK.foot + 1.0, T = zb + 5.0; // 0.35 under the socket profile, like the baseplates: bins seat on their chamfers
  let body = stackBody(bag, Wf, Df, Hb);
  if (Hf < Hb - 0.01) body = keepBelow(bag, body, -Df / 2, Hf, Df / 2, Hb);
  const cut = [prism(bag, rrPts(42 * p.nx + 0.5, 42 * p.ny + 0.5, 4.25), T, Hb + 2)];
  for (let a = 0; a < p.nx; a++) for (let c = 0; c < p.ny; c++) cut.push(socketCutter(bag, T, zb, (a - (p.nx - 1) / 2) * 42, (c - (p.ny - 1) / 2) * 42));
  if (p.flutes) cut.push(...flutes(bag, Wf, Df, STACK.foot + 1.5, Hb + 1));
  body = bag.k(W.Manifold.difference([body, ...cut]));
  bag.free(body);
  return { solid: body, T, zBin: T - 4.75, W: Wf, D: Df, H: Hb, Hf };
}
