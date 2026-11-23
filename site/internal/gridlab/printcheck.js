// GRIDLAB — print check: what on a part, as it sits on the bed, would want support.
// Every downward face is judged by how far it leans past vertical: up to 50° prints clean, 50–65° prints a little
// rough, past 65° needs support unless it's tiny. Near-flat ceilings (past 80°) are bridges when they're held on two
// opposite sides within reach, and cantilevers otherwise. Faces lying on the bed don't count.
// Input: a welded or unwelded triangle mesh in print orientation (z up). Pure JS, no geometry kernel.

const S50 = Math.sin(50 * Math.PI / 180), S65 = Math.sin(65 * Math.PI / 180), S80 = Math.sin(80 * Math.PI / 180);

function weld(pos, idx, eps = 1e-4) {
  const map = new Map(), remap = new Uint32Array(pos.length / 3), P = [];
  const q = (v) => Math.round(v / eps);
  for (let i = 0; i < pos.length / 3; i++) {
    const k = `${q(pos[3 * i])},${q(pos[3 * i + 1])},${q(pos[3 * i + 2])}`;
    let j = map.get(k);
    if (j == null) { j = P.length / 3; map.set(k, j); P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); }
    remap[i] = j;
  }
  const I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) I[i] = remap[idx[i]];
  return { pos: Float64Array.from(P), idx: I };
}

// classes per triangle: 0 fine or on the bed, 1 rough (50–65°), 2 steep (65–80°), 3 ceiling (past 80°)
export function classify(pos, idx) {
  let zmin = Infinity;
  for (let i = 2; i < pos.length; i += 3) zmin = Math.min(zmin, pos[i]);
  const nt = idx.length / 3, cls = new Int8Array(nt), area = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz);
    area[t] = L / 2;
    if (L < 1e-12) continue;
    const z = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
    if (z - zmin < 0.05) continue; // on the bed
    const s = -nz / L;
    cls[t] = s > S80 ? 3 : s > S65 ? 2 : s > S50 ? 1 : 0;
  }
  return { cls, area, zmin };
}

export function printCheck(pos0, idx0, o = {}) {
  const bridgeMax = o.bridgeMax ?? 25, cantMax = o.cantMax ?? 1.5, res = o.res ?? 0.5, tinyZ = o.tinyZ ?? 0.6;
  const { pos, idx } = weld(pos0, idx0);
  const { cls, area, zmin } = classify(pos, idx);
  const nt = idx.length / 3;
  // edge → triangles
  const E = new Map();
  const ek = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const a = idx[3 * t + e], b = idx[3 * t + (e + 1) % 3], k = ek(a, b);
    const l = E.get(k); if (l) l.push(t); else E.set(k, [t]);
  }
  const nbr = (t) => { const out = []; for (let e = 0; e < 3; e++) { const a = idx[3 * t + e], b = idx[3 * t + (e + 1) % 3]; for (const u of E.get(ek(a, b))) if (u !== t) out.push({ u, a, b }); } return out; };
  const third = (t, a, b) => { for (let e = 0; e < 3; e++) { const v = idx[3 * t + e]; if (v !== a && v !== b) return v; } return a; };
  let rough = 0;
  for (let t = 0; t < nt; t++) if (cls[t] === 1) rough += area[t];
  const seen = new Uint8Array(nt), steep = [], bridges = [], cants = [];
  for (let t0 = 0; t0 < nt; t0++) {
    if (seen[t0] || cls[t0] < 2) continue;
    const kind = cls[t0];
    const reg = [], stack = [t0]; seen[t0] = 1;
    while (stack.length) { const t = stack.pop(); reg.push(t); for (const { u } of nbr(t)) if (!seen[u] && cls[u] === kind) { seen[u] = 1; stack.push(u); } }
    let A = 0, z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of reg) { A += area[t]; for (let e = 0; e < 3; e++) { const v = idx[3 * t + e] * 3; z0 = Math.min(z0, pos[v + 2]); z1 = Math.max(z1, pos[v + 2]); x0 = Math.min(x0, pos[v]); x1 = Math.max(x1, pos[v]); y0 = Math.min(y0, pos[v + 1]); y1 = Math.max(y1, pos[v + 1]); } }
    if (A < 0.5) continue;
    if (kind === 2) { if (z1 - z0 > tinyZ) steep.push({ area: +A.toFixed(1), dz: +(z1 - z0).toFixed(2), z: +(z0 - zmin).toFixed(1) }); continue; }
    // ceiling: rasterise, mark anchored boundary (where the neighbour face runs down from the edge), then test each cell
    const inReg = new Set(reg);
    const gx = Math.max(1, Math.ceil((x1 - x0) / res) + 3), gy = Math.max(1, Math.ceil((y1 - y0) / res) + 3);
    if (gx * gy > 4e6) { cants.push({ len: +Math.max(x1 - x0, y1 - y0).toFixed(1), area: +A.toFixed(1), z: +(z0 - zmin).toFixed(1), big: true }); continue; }
    const X = (x) => Math.floor((x - x0) / res) + 1, Y = (y) => Math.floor((y - y0) / res) + 1;
    const G = new Uint8Array(gx * gy); // 1 region, 2 anchor
    for (const t of reg) {
      const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
      const i0 = Math.max(0, X(Math.min(ax, bx, cx)) - 1), i1 = Math.min(gx - 1, X(Math.max(ax, bx, cx)) + 1);
      const j0 = Math.max(0, Y(Math.min(ay, by, cy)) - 1), j1 = Math.min(gy - 1, Y(Math.max(ay, by, cy)) + 1);
      const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(d) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + (i - 0.5) * res, py = y0 + (j - 0.5) * res;
        const w1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / d, w2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / d, w3 = 1 - w1 - w2;
        if (w1 >= -1e-6 && w2 >= -1e-6 && w3 >= -1e-6) G[j * gx + i] = 1;
      }
    }
    let anchored = 0, edges = 0;
    for (const t of reg) for (const { u, a, b } of nbr(t)) {
      if (inReg.has(u)) continue;
      edges++;
      const v = third(u, a, b), ze = (pos[3 * a + 2] + pos[3 * b + 2]) / 2;
      if (pos[3 * v + 2] < ze - 0.05) {
        anchored++;
        const ax = pos[3 * a], ay = pos[3 * a + 1], bx = pos[3 * b], by = pos[3 * b + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (res / 2)));
        for (let s = 0; s <= n; s++) { const i = X(ax + (bx - ax) * s / n), j = Y(ay + (by - ay) * s / n); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < gx && jj < gy) G[jj * gx + ii] |= 2; } }
      }
    }
    // distance (in cells, 8-connected) from anchors through the region
    const dist = new Float32Array(gx * gy).fill(Infinity), q = [];
    for (let k = 0; k < G.length; k++) if ((G[k] & 2) && (G[k] & 1)) { dist[k] = 0; q.push(k); }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % gx, j = (k - i) / gx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gx || jj >= gy) continue;
        const kk = jj * gx + ii; if (!(G[kk] & 1)) continue;
        const nd = dist[k] + (di && dj ? Math.SQRT2 : 1);
        if (nd < dist[kk]) { dist[kk] = nd; q.push(kk); }
      }
    }
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const walk = (i, j, di, dj) => { let n = 0; for (;;) { const ii = i + di * (n + 1), jj = j + dj * (n + 1); if (ii < 0 || jj < 0 || ii >= gx || jj >= gy) return { n, anchor: false }; const g = G[jj * gx + ii]; if (!(g & 1)) return { n, anchor: !!(g & 2) || neighbourAnchor(ii, jj) }; n++; } };
    const neighbourAnchor = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < gx && jj < gy && (G[jj * gx + ii] & 2)) return true; } return false; };
    let span = 0, bridgedA = 0, freeA = 0, cant = 0;
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const k = j * gx + i; if (!(G[k] & 1)) continue;
      const dd = dist[k] * res;
      if (dd <= cantMax) continue;
      let best = Infinity;
      for (const [di, dj] of dirs) {
        const f = walk(i, j, di, dj), b = walk(i, j, -di, -dj);
        if (f.anchor && b.anchor) best = Math.min(best, (f.n + b.n + 1) * res * (di && dj ? Math.SQRT2 : 1));
      }
      if (best <= bridgeMax) { span = Math.max(span, best); bridgedA += res * res; }
      else { freeA += res * res; cant = Math.max(cant, Number.isFinite(dd) ? dd : Math.max(x1 - x0, y1 - y0)); }
    }
    if (span > 0) bridges.push({ span: +span.toFixed(1), area: +A.toFixed(1), z: +(z0 - zmin).toFixed(1) });
    if (freeA > 1) cants.push({ len: +cant.toFixed(1), area: +freeA.toFixed(1), z: +(z0 - zmin).toFixed(1), anchored, edges });
  }
  bridges.sort((a, b) => b.span - a.span); cants.sort((a, b) => b.area - a.area); steep.sort((a, b) => b.area - a.area);
  const needs = cants.length > 0 || steep.length > 0;
  return { ok: !needs, rough: +rough.toFixed(1), steep, bridges, cants, cls, summary: summary({ rough, steep, bridges, cants }) };
}

export function summary(r) {
  const out = [];
  if (!r.steep.length && !r.cants.length) out.push('no supports');
  for (const c of r.cants.slice(0, 3)) out.push(`unsupported underside ${c.area.toFixed(0)} mm² at ${c.z} mm, reaching ${c.len} mm`);
  for (const s of r.steep.slice(0, 3)) out.push(`overhang past 65° — ${s.area.toFixed(0)} mm² at ${s.z} mm`);
  if (r.bridges.length) out.push(`${r.bridges.length === 1 ? 'one bridge' : `${r.bridges.length} bridges`}, longest ${r.bridges[0].span} mm`);
  if (r.rough > 20) out.push(`${r.rough.toFixed(0)} mm² of 50–65° overhang — prints, a little rough`);
  return out;
}
