// GRIDLAB — photo → paper → tools → outlines in mm. Pure JS on ImageData-like {data, width, height}.
// Workflow (tooltrace / tracemate style): find the sheet of paper, straighten it with a homography so the
// paper sets the scale, find every tool on it, trace each outline, measure it.

export const PAPERS = { A4: [210, 297], A5: [148, 210], A3: [297, 420], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };

// ---------- helpers ----------
export function gray(img) {
  const { data, width: w, height: h } = img, g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
  return g;
}
export function otsu(values, lo = 0, hi = 255) {
  const hist = new Array(256).fill(0); let n = 0;
  for (const v of values) { const q = Math.max(0, Math.min(255, v | 0)); hist[q]++; n++; }
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return Math.max(lo, Math.min(hi, thr));
}
// connected components on a 0/1 mask; returns labels and component stats
export function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), comps = [], stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = comps.length; let sp = 0; stack[sp++] = s; lab[s] = id;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, first = s;
    while (sp) {
      const c = stack[--sp]; n++; const x = c % w, y = (c / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (c < first) first = c;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const d = ny * w + nx; if (mask[d] && lab[d] < 0) { lab[d] = id; stack[sp++] = d; }
      }
    }
    comps.push({ id, n, x0, y0, x1, y1, first });
  }
  return { lab, comps };
}
// binary dilate / erode with a square of radius r (separable running sums)
export function morph(mask, w, h, r, dilate) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let cnt = 0; const row = y * w;
    for (let x = -r; x < w; x++) {
      const add = x + r < w ? mask[row + x + r] : 0, rem = x - r - 1 >= 0 ? mask[row + x - r - 1] : 0;
      cnt += add - rem; if (x >= 0) tmp[row + x] = dilate ? (cnt > 0 ? 1 : 0) : (cnt === Math.min(w, x + r + 1) - Math.max(0, x - r) ? 1 : 0);
    }
  }
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = -r; y < h; y++) {
      const add = y + r < h ? tmp[(y + r) * w + x] : 0, rem = y - r - 1 >= 0 ? tmp[(y - r - 1) * w + x] : 0;
      cnt += add - rem; if (y >= 0) out[y * w + x] = dilate ? (cnt > 0 ? 1 : 0) : (cnt === Math.min(h, y + r + 1) - Math.max(0, y - r) ? 1 : 0);
    }
  }
  return out;
}
// Moore-neighbour boundary trace (Jacob's stopping) of the component with label id, starting at its first pixel
export function traceBoundary(lab, w, h, id, start) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id;
  const N = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]; // clockwise from west
  const sx = start % w, sy = (start / w) | 0;
  let cx = sx, cy = sy, bx = sx - 1, by = sy; // backtrack = west (outside)
  const pts = [[sx, sy]];
  const sbx = bx, sby = by;
  for (let guard = 0; guard < 4 * w * h; guard++) {
    let k0 = N.findIndex(([dx, dy]) => cx + dx === bx && cy + dy === by);
    if (k0 < 0) k0 = 0;
    let found = false;
    for (let s = 1; s <= 8; s++) {
      const k = (k0 + s) % 8, nx = cx + N[k][0], ny = cy + N[k][1];
      if (inside(nx, ny)) {
        const pk = (k + 7) % 8; bx = cx + N[pk][0]; by = cy + N[pk][1];
        cx = nx; cy = ny; found = true; break;
      }
    }
    if (!found) break;
    if (cx === sx && cy === sy && bx === sbx && by === sby) break;
    if (cx === sx && cy === sy && pts.length > 2) { /* keep going until Jacob's criterion */ }
    pts.push([cx, cy]);
  }
  if (pts.length > 1 && pts[pts.length - 1][0] === sx && pts[pts.length - 1][1] === sy) pts.pop();
  return pts;
}

// ---------- geometry ----------
export function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function dpOpen(P, eps) {
  if (P.length < 3) return P;
  const [ax, ay] = P[0], [bx, by] = P[P.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1e-9;
  let dmax = 0, idx = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = L > 1e-6 ? Math.abs((by - ay) * P[i][0] - (bx - ax) * P[i][1] + bx * ay - by * ax) / L : Math.hypot(P[i][0] - ax, P[i][1] - ay);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [P[0], P[P.length - 1]];
  return [...dpOpen(P.slice(0, idx + 1), eps).slice(0, -1), ...dpOpen(P.slice(idx), eps)];
}
export function simplifyClosed(P, eps) {
  if (P.length < 4) return P;
  let far = 0, fd = -1;
  for (let i = 1; i < P.length; i++) { const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = dpOpen(P.slice(0, far + 1), eps), b = dpOpen([...P.slice(far), P[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
export function chaikin(P, iters) {
  let Q = P;
  for (let k = 0; k < iters; k++) {
    const R = [];
    for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length];
      R.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    Q = R;
  }
  return Q;
}
export function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; s += x1 * y2 - x2 * y1; } return s / 2; }
// minimum-area bounding rectangle (rotating calipers over hull edges)
export function obb(P) {
  const H = hull(P);
  let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const t = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(-t), s = Math.sin(-t);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of H) { const u = x * c - y * s, v = x * s + y * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
    const A = (x1 - x0) * (y1 - y0);
    if (!best || A < best.A) best = { A, t, x0, x1, y0, y1 };
  }
  if (!best) return { angle: 0, L: 0, W: 0, cx: 0, cy: 0 };
  let { t, x0, x1, y0, y1 } = best;
  let L = x1 - x0, Wd = y1 - y0;
  const ucx = (x0 + x1) / 2, ucy = (y0 + y1) / 2;
  const c = Math.cos(t), s = Math.sin(t);
  const cx = ucx * c - ucy * s, cy = ucx * s + ucy * c;
  if (Wd > L) { [L, Wd] = [Wd, L]; t += Math.PI / 2; }
  return { angle: t, L, W: Wd, cx, cy };
}

// ---------- paper ----------
// returns corners [TL, TR, BR, BL] in the image's pixel coords
export function detectPaper(img) {
  const { width: w, height: h } = img, g = gray(img);
  const thr = otsu(g);
  const mask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mask[i] = g[i] > thr ? 1 : 0;
  const { lab, comps } = components(morph(morph(mask, w, h, 2, false), w, h, 2, true), w, h);
  if (!comps.length) return null;
  const big = comps.reduce((a, b) => (b.n > a.n ? b : a));
  if (big.n < w * h * 0.08) return null;
  // edge pixels of the sheet: leftmost and rightmost per row
  const pts = [];
  for (let y = big.y0; y <= big.y1; y++) {
    let l = -1, r = -1;
    for (let x = big.x0; x <= big.x1; x++) if (lab[y * w + x] === big.id) { if (l < 0) l = x; r = x; }
    if (l >= 0) pts.push([l, y], [r, y]);
  }
  const H = hull(pts);
  // simplify the hull to four corners
  let quad = null;
  const per = H.reduce((s, p, i) => s + Math.hypot(p[0] - H[(i + 1) % H.length][0], p[1] - H[(i + 1) % H.length][1]), 0);
  for (let eps = per * 0.005; eps < per * 0.2; eps *= 1.25) { const q = simplifyClosed(H, eps); if (q.length === 4) { quad = q; break; } if (q.length < 4) break; }
  if (!quad) {
    const by = (f) => H.reduce((a, b) => (f(b) > f(a) ? b : a));
    quad = [by((p) => -(p[0] + p[1])), by((p) => p[0] - p[1]), by((p) => p[0] + p[1]), by((p) => -(p[0] - p[1]))];
  }
  return orderCorners(quad);
}
export function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cy = q.reduce((s, p) => s + p[1], 0) / q.length;
  const sorted = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 order from −π: TL, TR, BR, BL for y-down images (start at the one with smallest x + y)
  let k = 0, best = Infinity;
  sorted.forEach((p, i) => { if (p[0] + p[1] < best) { best = p[0] + p[1]; k = i; } });
  return [0, 1, 2, 3].map((i) => sorted[(k + i) % 4]);
}
// homography mapping src[i] → dst[i] (4 point pairs); returns 3×3 row-major
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
// straighten: output W × H pixels; Hinv maps output px → source px
export function warp(src, Hinv, W, H) {
  const out = new Uint8ClampedArray(W * H * 4), sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Hinv[6] * x + Hinv[7] * y + Hinv[8];
    const u = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / d, v = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / d;
    const o = (y * W + x) * 4;
    if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
    for (let c = 0; c < 3; c++) {
      const i00 = (y0 * sw + x0) * 4 + c;
      const a = sd[i00] * (1 - fx) + sd[i00 + 4] * fx, b2 = sd[i00 + sw * 4] * (1 - fx) + sd[i00 + sw * 4 + 4] * fx;
      out[o + c] = a * (1 - fy) + b2 * fy;
    }
    out[o + 3] = 255;
  }
  return { data: out, width: W, height: H };
}

// ---------- tools on the straightened sheet ----------
// rect: straightened image at k px per mm. Returns tools with outlines in mm (sheet coords, y down) and canonical form.
export function detectTools(rect, k, o = {}) {
  const { width: w, height: h, data } = rect;
  const margin = Math.round((o.margin ?? 4) * k);
  // paper colour = median of a sparse sample
  const sr = [], sg = [], sb = [];
  for (let i = 0; i < w * h; i += 37) { sr.push(data[i * 4]); sg.push(data[i * 4 + 1]); sb.push(data[i * 4 + 2]); }
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const pr = med(sr), pg = med(sg), pb = med(sb), pl = pr * 0.299 + pg * 0.587 + pb * 0.114;
  // score: brightness drop, plus colour distance (catches coloured handles); shadows are grey, so chroma helps separate them
  const score = new Uint8Array(w * h);
  const shadow = o.shadow ?? 0.5;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    const chroma = Math.max(Math.abs(r - pr - (l - pl)), Math.abs(g - pg - (l - pl)), Math.abs(b - pb - (l - pl)));
    const drop = Math.max(0, pl - l);
    score[i] = Math.min(255, drop * (1 - shadow * 0.5) + chroma * 1.6);
  }
  const inner = [];
  for (let y = margin; y < h - margin; y += 2) for (let x = margin; x < w - margin; x += 2) inner.push(score[y * w + x]);
  const thr = o.threshold > 0 ? o.threshold : otsu(inner, 28, 200);
  let mask = new Uint8Array(w * h);
  for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) mask[y * w + x] = score[y * w + x] > thr ? 1 : 0;
  const rc = Math.max(0, Math.round((o.close ?? 1) * k)), ro = Math.max(0, Math.round((o.open ?? 0.5) * k));
  if (rc) mask = morph(morph(mask, w, h, rc, true), w, h, rc, false);
  if (ro) mask = morph(morph(mask, w, h, ro, false), w, h, ro, true);
  if (o.fillHoles !== false) {
    // background reachable from the border stays background; enclosed holes become part of the tool
    const bg = new Uint8Array(w * h), st = [];
    for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
    while (st.length) { const c = st.pop(); if (bg[c] || mask[c]) continue; bg[c] = 1; const x = c % w, y = (c / w) | 0; if (x > 0) st.push(c - 1); if (x < w - 1) st.push(c + 1); if (y > 0) st.push(c - w); if (y < h - 1) st.push(c + w); }
    for (let i = 0; i < w * h; i++) mask[i] = bg[i] ? 0 : 1;
  }
  const { lab, comps } = components(mask, w, h);
  const minPx = (o.minArea ?? 150) * k * k;
  const tools = [];
  for (const c of comps) {
    if (c.n < minPx) continue;
    const px = traceBoundary(lab, w, h, c.id, c.first);
    if (px.length < 8) continue;
    let mm = px.map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
    mm = simplifyClosed(mm, o.simplify ?? 0.4);
    if (o.smooth) mm = chaikin(mm, o.smooth);
    if (area(mm) < 0) mm.reverse();
    const box = obb(mm);
    // canonical: centred on the OBB, long axis along X, y up
    const c0 = Math.cos(-box.angle), s0 = Math.sin(-box.angle);
    let canon = mm.map(([x, y]) => { const dx = x - box.cx, dy = y - box.cy; return [dx * c0 - dy * s0, -(dx * s0 + dy * c0)]; });
    if (area(canon) < 0) canon.reverse();
    tools.push({ sheet: mm, pts: canon.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), L: box.L, W: box.W, area: Math.abs(area(mm)), angle: box.angle, cx: box.cx, cy: box.cy, px: c.n });
  }
  tools.sort((a, b) => b.area - a.area);
  return { tools, thr, paper: [pr, pg, pb], mask };
}

// ---------- layout ----------
// rectangles {w, d} (already rotated) → positions in a tray; returns null if they don't fit
// shelf packing: rows of items, tallest first (falls back to widest first); items sit centred in their row
function shelfPackBy(rects, W, D, gap, cmp) {
  const order = rects.map((r, i) => ({ ...r, i })).sort(cmp);
  const rows = []; let top = 0;
  const pos = new Array(rects.length);
  for (const r of order) {
    let placed = false;
    for (const row of rows) if (row.x + r.w <= W + 1e-6 && r.d <= row.h + 1e-6) { pos[r.i] = [row.x + r.w / 2, row]; row.x += r.w + gap; placed = true; break; }
    if (placed) continue;
    if (top + r.d > D + 1e-6 || r.w > W + 1e-6) return null;
    const row = { y: top, h: r.d, x: r.w + gap }; rows.push(row); pos[r.i] = [r.w / 2, row]; top += r.d + gap;
  }
  // spread the rows over the depth and centre each row's items across the width
  const used = top - gap, extra = Math.max(0, (D - used) / (rows.length + 1));
  rows.forEach((row, k) => { row.cy = row.y + row.h / 2 + extra * (k + 1); row.dx = (W - (row.x - gap)) / 2; });
  return pos.map(([x, row]) => [x + row.dx, row.cy]);
}
function shelfPack(rects, W, D, gap) {
  return shelfPackBy(rects, W, D, gap, (a, b) => b.d - a.d || b.w - a.w) || shelfPackBy(rects, W, D, gap, (a, b) => b.w - a.w || b.d - a.d);
}
// sizes: [{w, d}] in mm including clearance and finger notches. margin = wall to the outer edge.
export function autoTray(sizes, { gap = 4, margin = 4, maxNx = 7, maxNy = 7, nx = 0, ny = 0 } = {}) {
  const cands = [];
  if (nx && ny) cands.push([nx, ny]);
  else for (let a = 1; a <= maxNx; a++) for (let b = 1; b <= maxNy; b++) cands.push([a, b]);
  cands.sort((p, q) => p[0] * p[1] - q[0] * q[1] || Math.abs(p[0] - p[1] * 2) - Math.abs(q[0] - q[1] * 2));
  for (const [a, b] of cands) {
    const W = 42 * a - 0.5 - 2 * margin, D = 42 * b - 0.5 - 2 * margin;
    const pos = shelfPack(sizes, W, D, gap);
    if (pos) return { nx: a, ny: b, pos: pos.map(([x, y]) => [x - W / 2, D / 2 - y]) };
  }
  return null;
}

// ---------- 2D export ----------
// polys: arrays of [x, y] mm (y up), tray: {W, D, r}; origin at the tray centre
export function svgOf(polys, tray, title = 'GRIDLAB cut-outs') {
  const pad = 2, W = tray.W + 2 * pad, D = tray.D + 2 * pad;
  const tx = (x) => (x + tray.W / 2 + pad).toFixed(3), ty = (y) => (tray.D / 2 - y + pad).toFixed(3);
  const path = (P) => 'M' + P.map(([x, y]) => `${tx(x)},${ty(y)}`).join('L') + 'Z';
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${D}mm" viewBox="0 0 ${W} ${D}">\n<title>${title}</title>\n`;
  s += `<rect x="${pad}" y="${pad}" width="${tray.W}" height="${tray.D}" rx="${tray.r}" fill="none" stroke="#000" stroke-width="0.1"/>\n`;
  for (const P of polys) s += `<path d="${path(P)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n`;
  return s + '</svg>\n';
}
export function dxfOf(polys, tray) {
  const L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const poly = (P, layer) => {
    L.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1');
    for (const [x, y] of P) L.push('0', 'VERTEX', '8', layer, '10', (x + tray.W / 2).toFixed(4), '20', (y + tray.D / 2).toFixed(4));
    L.push('0', 'SEQEND', '8', layer);
  };
  const r = tray.r, n = 8, edge = [];
  const cs = [[tray.W / 2 - r, tray.D / 2 - r, 0], [-tray.W / 2 + r, tray.D / 2 - r, 90], [-tray.W / 2 + r, -tray.D / 2 + r, 180], [tray.W / 2 - r, -tray.D / 2 + r, 270]];
  for (const [cx, cy, a0] of cs) for (let s = 0; s <= n; s++) { const t = (a0 + (90 * s) / n) * Math.PI / 180; edge.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  poly(edge, 'OUTLINE');
  for (const P of polys) poly(P, 'CUT');
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n') + '\n';
}
