// GRIDLAB — boards, zones and stud placement for the Organised Mess pegboards.
// Source: pegboard-plan.md (layout v21, 1 Nov 2026). Coordinates in mm.
// Wall boards: x across from the left edge, y down from the top edge.
// Table: x across, y from the back edge (wall side) toward you.

export const BOARDS = {
  A: {
    id: 'A', name: 'Board A · wall', short: 'Board A',
    w: 2100, h: 550, lattice: 'diamond', pitch: 25, rowPitch: 12.5,
    rows: 43, studD: 4.7, studLen: 15, studMax: 21, holeD: '4.8–5.0',
    note: '21 mm ply, Ø5 through holes, 45° diamond lattice.',
    battens: [[686, 711], [1385, 1410]],
    usable: { x0: 55, x1: 2045, y0: 48, y1: 510 },
    bays: [
      { id: 1, x0: 55, x1: 686, clear: 500, label: 'Bay 1' },
      { id: 2, x0: 711, x1: 1385, clear: 425, label: 'Bay 2' },
      { id: 3, x0: 1410, x1: 2045, clear: 500, label: 'Bay 3' },
    ],
    lines: [],
    zones: [
      { id: 'W', x0: 60, x1: 680, y0: 48, y1: 500, t: 'Open — wire spools, later' },
      { id: 'E4', x0: 720, x1: 960, y0: 48, y1: 238, t: 'Tweezers · solder assist · brushes · TL08' },
      { id: 'E5', x0: 970, x1: 1320, y0: 48, y1: 218, t: 'Micro cutters / pliers / strippers ×13' },
      { id: 'S2', x0: 720, x1: 1380, y0: 250, y1: 425, t: 'Spare — solder spool, flux, tip bins' },
      { id: 'E2', x0: 1420, x1: 1520, y0: 48, y1: 255, t: 'Auto strippers ×3' },
      { id: 'E1', x0: 1530, x1: 1985, y0: 48, y1: 310, t: 'Crimpers ×10 · cutters & shears ×3' },
      { id: 'M1', x0: 1420, x1: 1530, y0: 310, y1: 497, t: 'Sanwa CD800a' },
      { id: 'M3', x0: 1540, x1: 1630, y0: 320, y1: 400, t: 'Sanwa PM7a' },
      { id: 'M4', x0: 1640, x1: 1760, y0: 320, y1: 360, t: 'Test-lead adaptors' },
      { id: 'E3', x0: 1840, x1: 1940, y0: 320, y1: 372, t: 'SN-58B dies ×8' },
      { id: 'M5', x0: 1540, x1: 1700, y0: 410, y1: 462, t: 'Ruler · phase tester' },
      { id: 'M6', x0: 1710, x1: 1830, y0: 410, y1: 440, t: 'UV torch' },
      { id: 'S3', x0: 1840, x1: 2040, y0: 385, y1: 500, t: 'Spare — terminals, ferrules, heat-shrink' },
    ],
  },
  B: {
    id: 'B', name: 'Board B · hardware', short: 'Board B',
    w: 781, h: 1200, lattice: 'square', pitch: 23.876, rowPitch: 23.876,
    cols: 31, rows: 49, x0: 32.4, y0: 27.1, studD: 7.65, studLen: 18, studMax: 19, holeD: '7.6',
    note: '19 mm chipboard, Ø7.6 holes, 0.94 in square grid.',
    battens: [],
    usable: { x0: 0, x1: 781, y0: 0, y1: 1200 },
    bays: [],
    lines: [
      { y: 270, t: 'everyday zones start here' },
      { y: 950, t: 'nothing below — HOTO SnapBloq stack' },
    ],
    zones: [
      { id: 'R', x0: 40, x1: 240, y0: 40, y1: 170, t: 'Wera roll bags ×2' },
      { id: 'H1', x0: 40, x1: 540, y0: 270, y1: 510, t: 'Hex key sets ×3' },
      { id: 'H2', x0: 560, x1: 640, y0: 270, y1: 482, t: 'TwinGrip · pruning shear' },
      { id: 'H3', x0: 40, x1: 420, y0: 525, y1: 702, t: 'Wera VDE blades ×24 + handles' },
      { id: 'H4', x0: 440, x1: 530, y0: 525, y1: 692, t: 'Zyklop 8000 A · Kompakt 20' },
      { id: 'H6', x0: 550, x1: 630, y0: 525, y1: 687, t: 'Pliers Wrench · OLFA' },
      { id: 'H9', x0: 40, x1: 540, y0: 715, y1: 890, t: 'Wera Micro drivers ×25' },
      { id: 'H5', x0: 555, x1: 745, y0: 715, y1: 815, t: 'Tool-Check PLUS' },
      { id: 'H7', x0: 560, x1: 600, y0: 830, y1: 920, t: 'Bit-Check 7' },
      { id: 'H8', x0: 40, x1: 280, y0: 900, y1: 945, t: 'iGaging caliper' },
    ],
  },
  T: {
    id: 'T', name: 'Table · Board A lattice', short: 'Table',
    w: 2100, h: 550, lattice: 'diamond', pitch: 25, rowPitch: 12.5,
    rows: 43, studD: 4.7, studLen: 15, studMax: 21, holeD: '4.8–5.0',
    note: 'Second Board A fixed to the wall board’s bottom edge; y from the back edge. No-go holes assumed the same as the wall board.',
    battens: [[686, 711], [1385, 1410]],
    usable: { x0: 55, x1: 2045, y0: 48, y1: 510 },
    bays: [], lines: [],
    zones: [
      { id: 'RX-711', x0: 720, x1: 866, y0: 20, y1: 135, t: 'Goot RX-711AS', item: 1 },
      { id: '936A', x0: 880, x1: 1050, y0: 20, y1: 140, t: 'DEKO 936A', item: 1 },
      { id: 'Fume', x0: 1065, x1: 1215, y0: 20, y1: 170, t: 'Fume extractor', item: 1 },
      { id: '968', x0: 1240, x1: 1360, y0: 20, y1: 130, t: 'DEKO 968 hot air', item: 1 },
      { id: 'Mat', x0: 765, x1: 1311, y0: 170, y1: 519, t: 'Weller mat', item: 1 },
      { id: 'MHP50', x0: 1320, x1: 1392, y0: 180, y1: 236, t: 'MHP50', item: 1 },
      { id: 'Quiver', x0: 1330, x1: 1370, y0: 250, y1: 350, t: 'Sucker + wire-wrap quiver' },
      { id: 'HOTO', x0: 1225, x1: 1315, y0: 180, y1: 240, t: 'HOTO iron stand', item: 1 },
      { id: 'PCB', x0: 400, x1: 700, y0: 20, y1: 185, t: 'Pro’sKit PCB holder', item: 1 },
      { id: 'Hands', x0: 30, x1: 180, y0: 20, y1: 130, t: 'Helping hands', item: 1 },
      { id: 'Left', x0: 30, x1: 670, y0: 360, y1: 520, t: 'Clear assembly area — left', clear: 1 },
      { id: 'Low', x0: 1420, x1: 2060, y0: 20, y1: 140, t: 'Back row kept low (< 50 tall)' },
      { id: 'Right', x0: 1420, x1: 1680, y0: 360, y1: 520, t: 'Clear assembly area — right', clear: 1 },
      { id: 'Scope', x0: 1780, x1: 2040, y0: 380, y1: 510, t: 'Scope / PSU', item: 1 },
    ],
  },
};

// ---------- holes ----------
export function rowCount(b) { return b.rows; }
export function colCount(b, i) {
  if (b.lattice === 'square') return b.cols;
  return i % 2 === 0 ? 83 : 84;
}
export function holeXY(b, i, j) {
  if (b.lattice === 'square') return [b.x0 + b.pitch * j, b.y0 + b.pitch * i];
  return [25 * j + (i % 2 === 0 ? 22.5 : 10), 10.5 + 12.5 * i];
}
export function rowY(b, i) { return holeXY(b, i, 0)[1]; }
export function rowX0(b, i) { return holeXY(b, i, 0)[0]; }

export function isNoGo(b, i, j) {
  if (i < 0 || i >= b.rows) return true;
  const n = colCount(b, i);
  if (j < 0 || j >= n) return true;
  if (b.lattice === 'square') {
    // row 15 from the bottom: holes 3–5 from the left and 9–11 from the right
    if (i === b.rows - 15 && ([2, 3, 4].includes(j) || [n - 9, n - 10, n - 11].includes(j))) return true;
    return false;
  }
  if (i <= 2 || i >= 41) return true;               // rows 1–3 and 42–43
  if (j < 2 || j >= n - 2) return true;             // first 2 holes each side
  const [x] = holeXY(b, i, j);
  for (const [a, c] of b.battens) if (x >= a - 2.5 && x <= c + 2.5) return true;
  return false;
}

export function* allHoles(b) {
  for (let i = 0; i < b.rows; i++) {
    const n = colCount(b, i);
    for (let j = 0; j < n; j++) {
      const [x, y] = holeXY(b, i, j);
      yield { i, j, x, y, nogo: isNoGo(b, i, j) };
    }
  }
}

export function bayAt(b, x) {
  return b.bays.find(k => x >= k.x0 && x <= k.x1) || null;
}

// ---------- shelf studs (wall boards A, B) ----------
// The shelf's back face covers x ∈ [bx, bx+W], y ∈ [by, by+H] on the board.
// Local coords: lx from the plate's left edge, lz up from the floor's underside.
// Pattern is canonical for a given plate size: studs are centred left–right on the lattice
// and the two rows are centred in the usable band — so the same part fits at every lattice step.
export function shelfPattern(b, plate) {
  const { W, H, floorT } = plate;
  const r = b.studD / 2;
  const xmin = r + 2.5, xmax = W - r - 2.5;
  const zmin = floorT + r + 1.5, zmax = H - r - 2.0;
  const px = b.pitch, py = b.lattice === 'diamond' ? 25 : b.rowPitch;
  const k = Math.max(0, Math.floor((xmax - xmin) / px + 1e-6));
  const dx = (W - k * px) / 2;
  const gaps = Math.max(1, Math.ceil((k * px) / (plate.maxGap || 100) - 1e-6));
  const cols = [];
  for (let t = 0; t <= gaps; t++) {
    const m = Math.round((t * k) / gaps);
    if (!cols.includes(m)) cols.push(m);
  }
  const band = zmax - zmin;
  const n = band >= 0 ? Math.floor(band / py + 1e-6) : -1;
  let rowsZ;
  if (n >= 1) {
    const zt = zmax - (band - n * py) / 2;
    rowsZ = [{ z: zt, di: 0 }, { z: zt - n * py, di: b.lattice === 'diamond' ? 2 * n : n }];
  } else {
    rowsZ = [{ z: (zmin + Math.max(zmin, zmax)) / 2, di: 0 }];
  }
  const local = [];
  for (const row of rowsZ) for (const m of cols) local.push({ lx: dx + m * px, lz: row.z, dm: m, di: row.di });
  const minH = floorT + r + 1.5 + py + r + 2.0;
  return { local, dx, rowsZ, cols, k, twoRows: n >= 1, minH, r };
}

export function placeShelf(b, plate, want) {
  // want: {x, y} top-left of the back plate on the board
  const pat = shelfPattern(b, plate);
  const top = pat.rowsZ[0];
  const yTopWant = want.y + plate.H - top.z;
  let i = b.lattice === 'diamond' ? Math.round((yTopWant - 10.5) / 12.5) : Math.round((yTopWant - b.y0) / b.rowPitch);
  i = Math.max(0, Math.min(b.rows - 1, i));
  const by = rowY(b, i) - (plate.H - top.z);
  const xs = rowX0(b, i);
  let j = Math.round((want.x + pat.dx - xs) / b.pitch);
  const bx = xs + b.pitch * j - pat.dx;
  const studs = pat.local.map(s => {
    const ii = i + s.di, jj = j + s.dm;
    const [x, y] = holeXY(b, ii, jj);
    const ok = !isNoGo(b, ii, jj);
    return { i: ii, j: jj, x, y, lx: s.lx, lz: s.lz, ok };
  });
  const warnings = [];
  const bad = studs.filter(s => !s.ok);
  if (bad.length) warnings.push(`${bad.length} stud${bad.length > 1 ? 's' : ''} on a no-go hole — move along the board`);
  if (!pat.twoRows) warnings.push(`back plate too short for two stud rows — make it ≥ ${Math.ceil(pat.minH)} mm`);
  if (bx < 0 || bx + plate.W > b.w || by < 0 || by + plate.H > b.h) warnings.push('shelf runs off the board');
  const bottom = by + plate.H;
  const bay = bayAt(b, bx + plate.W / 2);
  const bayL = bayAt(b, bx), bayR = bayAt(b, bx + plate.W);
  if (b.bays.length && (!bayL || !bayR || bayL !== bayR)) warnings.push('shelf spans a batten strip');
  if (bay && bottom > bay.clear) warnings.push(`floor at y ${bottom.toFixed(0)} is below ${bay.label}’s clearance line (y ${bay.clear})`);
  for (const ln of b.lines) if (ln.y > 900 && bottom > ln.y) warnings.push(`floor at y ${bottom.toFixed(0)} is below the y ${ln.y} line — ${ln.t}`);
  return { bx, by, i, j, studs, pattern: pat, warnings, bay };
}

// ---------- table plate studs (integral, bottom face) ----------
// The plate covers x ∈ [px, px+W], y ∈ [py, py+D] on the table. Solid at the bottom face = outside
// every cell window (funnel ends) and inside the outline. Search nearby offsets for the best stud set.
export function placeTablePlate(b, plate, want, maxStuds = 6) {
  const r = b.studD / 2;
  const { W, D, rim, nx, ny, winBottom } = plate;
  const mEdge = r + 1.5, mWin = r + 0.9;
  const hw = winBottom / 2;
  const cellC = [];
  for (let a = 0; a < nx; a++) for (let c = 0; c < ny; c++) cellC.push([rim + 21 + 42 * a, rim + 21 + 42 * c]);
  const solid = (lx, ly) => {
    if (lx < mEdge || lx > W - mEdge || ly < mEdge || ly > D - mEdge) return false;
    for (const [cx, cy] of cellC) if (Math.abs(lx - cx) < hw + mWin && Math.abs(ly - cy) < hw + mWin) return false;
    return true;
  };
  const cand = (px, py) => {
    const out = [];
    const i0 = Math.max(0, Math.floor((py - 10.5) / 12.5)), i1 = Math.min(b.rows - 1, Math.ceil((py + D - 10.5) / 12.5));
    for (let i = i0; i <= i1; i++) {
      const y = rowY(b, i);
      if (y < py || y > py + D) continue;
      const x0 = rowX0(b, i);
      const j0 = Math.max(0, Math.floor((px - x0) / 25)), j1 = Math.min(colCount(b, i) - 1, Math.ceil((px + W - x0) / 25));
      for (let j = j0; j <= j1; j++) {
        const x = x0 + 25 * j;
        if (x < px || x > px + W) continue;
        if (isNoGo(b, i, j)) continue;
        if (solid(x - px, y - py)) out.push({ i, j, x, y, lx: x - px, ly: y - py });
      }
    }
    return out;
  };
  const pick = (list) => {
    if (list.length <= maxStuds) return list.slice();
    const cx = W / 2, cy = D / 2;
    let first = list.reduce((a, s) => ((s.lx - cx) ** 2 + (s.ly - cy) ** 2 > (a.lx - cx) ** 2 + (a.ly - cy) ** 2 ? s : a), list[0]);
    const chosen = [first];
    while (chosen.length < maxStuds) {
      let best = null, bd = -1;
      for (const s of list) {
        if (chosen.includes(s)) continue;
        const d = Math.min(...chosen.map(c => (c.lx - s.lx) ** 2 + (c.ly - s.ly) ** 2));
        if (d > bd) { bd = d; best = s; }
      }
      chosen.push(best);
    }
    return chosen;
  };
  const score = (sel) => {
    if (sel.length < 2) return sel.length;
    const xs = sel.map(s => s.lx), ys = sel.map(s => s.ly);
    const spread = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) / (W * D);
    return Math.min(sel.length, maxStuds) * 10 + spread * 8;
  };
  let best = null;
  for (let ox = -12.5; ox <= 12.5; ox += 0.5) {
    for (let oy = -12.5; oy <= 12.5; oy += 0.5) {
      const px = want.x + ox, py = want.y + oy;
      const sel = pick(cand(px, py));
      const sc = score(sel) - 0.002 * (ox * ox + oy * oy);
      if (!best || sc > best.sc) best = { sc, px, py, sel };
    }
  }
  const warnings = [];
  if (best.sel.length < 3) warnings.push(`only ${best.sel.length} stud${best.sel.length === 1 ? '' : 's'} land on solid plate here — move it or make it bigger`);
  if (best.px < 0 || best.px + W > b.w || best.py < 0 || best.py + D > b.h) warnings.push('plate runs off the table');
  return { bx: best.px, by: best.py, studs: best.sel.map(s => ({ ...s, ok: true })), warnings };
}

// ---------- hook studs: one column, rows below the top stud ----------
export function placeHook(b, P, hd) {
  const want = P.at;
  let i = b.lattice === 'diamond' ? Math.round((want.y - 10.5) / 12.5) : Math.round((want.y - b.y0) / b.rowPitch);
  i = Math.max(0, Math.min(b.rows - 1, i));
  const x0 = rowX0(b, i), j = Math.round((want.x - x0) / b.pitch);
  const di = b.lattice === 'diamond' ? 2 : 1;
  const studs = [];
  for (let k = 0; k < hd.rows; k++) { const ii = i + k * di, [x, y] = holeXY(b, ii, j); studs.push({ i: ii, j, x, y, ok: !isNoGo(b, ii, j) }); }
  const warnings = [];
  const bad = studs.filter((s) => !s.ok).length;
  if (bad) warnings.push(`${bad} stud${bad > 1 ? 's' : ''} on a no-go hole — move it`);
  return { bx: studs[0].x, by: studs[0].y, studs, warnings, i, j };
}

// ---------- dovetail bases ----------
// A base's studs sit on lattice holes: rows i, i+2 (… i+4) and columns j, j+1 (or j, j+2 for L) on Board A's
// diamond lattice; consecutive rows and columns on Board B. want = {x: groove centre, y: base top}.
// D from geom.doveDims. Returns the base's actual groove centre x and top y, its studs and any warnings.
export function placeBase(b, D, want) {
  const di = b.lattice === 'square' ? 1 : 2;
  const pat = [];
  for (let a = 0; a < D.cols; a++) for (let r = 0; r < D.rows; r++) pat.push([r * di, a * D.colStep]);
  const mi = (D.rows - 1) * di, mj = (D.cols - 1) * D.colStep;
  const span = (D.rows - 1) * D.pz;
  const yTop0 = want.y + D.H / 2 - span / 2;
  let i0 = b.lattice === 'square' ? Math.round((yTop0 - b.y0) / b.rowPitch) : Math.round((yTop0 - 10.5) / 12.5);
  let best = null;
  for (let i = i0 - 2; i <= i0 + 2; i++) {
    if (i < 0 || i + mi >= b.rows) continue;
    const x0 = rowX0(b, i), pitch = b.lattice === 'square' ? b.pitch : 25;
    const jc = Math.round((want.x - (mj * pitch) / 2 - x0) / pitch);
    for (let j = jc - 1; j <= jc + 1; j++) {
      if (j < 0 || j + mj >= colCount(b, i)) continue;
      const studs = pat.map(([a, c]) => { const [x, y] = holeXY(b, i + a, j + c); return { i: i + a, j: j + c, x, y, ok: !isNoGo(b, i + a, j + c) }; });
      const cx = studs.reduce((s, q) => s + q.x, 0) / studs.length, cy = studs.reduce((s, q) => s + q.y, 0) / studs.length;
      const top = cy - D.H / 2;
      const bad = studs.filter((q) => !q.ok).length;
      const sc = Math.abs(cx - want.x) + Math.abs(top - want.y) + bad * 1000;
      if (!best || sc < best.sc) best = { sc, cx, top, studs, i, j };
    }
  }
  if (!best) return { cx: want.x, top: want.y, studs: [], warnings: ['no room for a base here'], D };
  const warnings = [];
  const bad = best.studs.filter((q) => !q.ok).length;
  if (bad) warnings.push(`${bad} base stud${bad > 1 ? 's' : ''} on a no-go hole — move it`);
  if (best.cx - D.W / 2 < 0 || best.cx + D.W / 2 > b.w || best.top < 0 || best.top + D.H > b.h) warnings.push('base runs off the board');
  return { cx: best.cx, top: best.top, studs: best.studs, warnings, D, i: best.i, j: best.j, cls: D.id };
}

// a shelf on dovetail bases: lay = geom.shelfDove(p, board); want = top-left of the back plate. The first base snaps
// to the lattice and the shelf follows it; the others land on the lattice too, since tongues sit on lattice steps.
export function placeShelfDove(b, plate, lay, want) {
  const first = placeBase(b, lay.D, { x: want.x + lay.xs[0], y: want.y });
  const bx = first.cx - lay.xs[0], by = first.top;
  const bases = lay.xs.map((x, k) => (k === 0 ? first : placeBase(b, lay.D, { x: bx + x, y: by })));
  const warnings = [];
  for (const q of bases) for (const w of q.warnings) if (!warnings.includes(w)) warnings.push(w);
  if (bases.some((q) => Math.abs(q.top - by) > 0.5 || Math.abs(q.cx - bx - lay.xs[bases.indexOf(q)]) > 0.5)) warnings.push('bases don’t line up on the lattice here — move the shelf a step');
  if (bx < 0 || bx + plate.W > b.w || by < 0 || by + plate.H > b.h) warnings.push('shelf runs off the board');
  const bottom = by + plate.H;
  const bay = bayAt(b, bx + plate.W / 2), bayL = bayAt(b, bx), bayR = bayAt(b, bx + plate.W);
  if (b.bays.length && (!bayL || !bayR || bayL !== bayR)) warnings.push('shelf spans a batten strip');
  if (bay && bottom > bay.clear) warnings.push(`floor at y ${bottom.toFixed(0)} is below ${bay.label}’s clearance line (y ${bay.clear})`);
  for (const ln of b.lines) if (ln.y > 900 && bottom > ln.y) warnings.push(`floor at y ${bottom.toFixed(0)} is below the y ${ln.y} line — ${ln.t}`);
  const studs = bases.flatMap((q) => q.studs);
  return { bx, by, studs, bases, warnings, bay, dove: true };
}
