// GRIDLAB — fit parts to tools. One tool or many: stand-up holders, lie-flat trays, hooks (one or a row), bins.
// Everything here is plain numbers in, part parameters out; the geometry is built by parts.js as usual.
import * as G from './geom.js';
import { g as grp, PRESETS } from './parts.js';
import * as TR from './trace.js';
import { BOARDS } from './boards.js';
import { catchAt } from './model.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const r05 = (v) => Math.round(v * 2) / 2;
const clone = (o) => JSON.parse(JSON.stringify(o));

// sizes with sensible fallbacks for whatever the inventory didn't say
export function dims(t0) {
  const t = { ...t0 }, k = t.kind || 'flat', L = +t.L || 100;
  t.kind = k; t.L = L;
  if (k === 'rod') { t.D = +t.D || +t.W || 12; t.d = +t.d || t.D; t.W = t.D; t.T = t.D; }
  else if (k === 'plier') { t.W = +t.W || r1(L * 0.36); t.T = +t.T || 12; t.head = +t.head || r1(Math.max(12, t.W * 0.4)); }
  else if (k === 'box') { t.W = +t.W || r1(L * 0.6); t.T = +t.T || r1(Math.min(t.W, L) * 0.35); }
  else if (k === 'spool') { t.W = +t.W || 60; t.D = +t.D || 22; t.T = t.W; }
  else { t.W = +t.W || 12; t.T = +t.T || 5; }
  return t;
}

// ---------- a lying-flat silhouette when there's no traced outline (long axis along x, working end at +x) ----------
function rrect(x0, x1, w, r = 3, n = 4) {
  const pts = [], h = w / 2; r = Math.min(r, h, (x1 - x0) / 2);
  const arc = (cx, cy, a0) => { for (let s = 0; s <= n; s++) { const a = (a0 + (90 * s) / n) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x1 - r, h - r, 0); arc(x0 + r, h - r, 90); arc(x0 + r, -h + r, 180); arc(x1 - r, -h + r, 270);
  return pts;
}
export function silhouette(t0) {
  const t = dims(t0), L = t.L, h = L / 2;
  let pts;
  if (t.kind === 'plier') {
    const hw = t.head / 2, tip = Math.max(2.5, hw * 0.35), grip = Math.max(hw * 0.9, (t.W * 0.62) / 2), xp = h - 0.32 * L;
    pts = [[h, tip], [h - 0.12 * L, hw * 0.75], [xp + 5, hw], [xp - 8, hw], [-h + 10, grip], [-h + 2, grip - 1], [-h, grip - 5],
      [-h, -(grip - 5)], [-h + 2, -(grip - 1)], [-h + 10, -grip], [xp - 8, -hw], [xp + 5, -hw], [h - 0.12 * L, -hw * 0.75], [h, -tip]];
  } else if (t.kind === 'rod') {
    if (t.d < t.D * 0.85) {
      // handle Ø D at the back, shaft Ø d to the tip, a short taper between
      const hl = Math.min(0.48 * L, 115), R = t.D / 2, r = t.d / 2, xs = -h + hl, rr = Math.min(5, R * 0.8), arc = [];
      for (let k = 0; k <= 4; k++) { const a = (90 + 22.5 * k) * Math.PI / 180; arc.push([-h + rr + rr * Math.cos(a), R - rr + rr * Math.sin(a)]); }
      const low = []; for (let k = 0; k <= 4; k++) { const a = (180 + 22.5 * k) * Math.PI / 180; low.push([-h + rr + rr * Math.cos(a), -R + rr + rr * Math.sin(a)]); }
      pts = [[h, r], [xs + 4, r], [xs, R], ...arc, ...low, [xs, -R], [xs + 4, -r], [h, -r]];
    } else pts = rrect(-h, h, t.D, t.D / 2, 6);
  } else if (t.kind === 'box') pts = rrect(-h, h, t.W, Math.min(6, t.W / 4));
  else if (t.kind === 'spool') { pts = []; const R = t.W / 2; for (let s = 0; s < 36; s++) { const a = (s / 36) * 2 * Math.PI; pts.push([R * Math.cos(a), R * Math.sin(a)]); } }
  else if (/tweez|scraper|knife|spatula|pick/i.test(`${t.name} ${t.cat || ''}`)) pts = [[-h, t.W / 2], [-h + 3, t.W / 2], [h - 6, t.W * 0.22], [h, t.W * 0.1], [h, -t.W * 0.1], [h - 6, -t.W * 0.22], [-h + 3, -t.W / 2], [-h, -t.W / 2]];
  else pts = rrect(-h, h, t.W, Math.min(4, t.W / 3));
  return pts.map(([x, y]) => [r1(x * 100) / 100, r1(y * 100) / 100]);
}

// ---------- standing up in a holder: which cut-out, how deep, how much sticks up ----------
export function standShape(t0, clr = 0) {
  const t = dims(t0);
  let s;
  if (t.kind === 'rod') {
    const shaft = t.d < t.D * 0.85;
    const a = r05((shaft ? t.d : t.D) + 0.8 + clr);
    const depth = shaft ? clamp(t.L * 0.25, 10, 40) : clamp(t.L * 0.3, 10, 50);
    s = { shape: 'round', a, b: a, depth, why: shaft ? `shaft Ø${r1(t.d)} goes in, the Ø${r1(t.D)} handle rests on top` : `Ø${r1(t.D)} body sits ${r1(depth)} mm in` };
  } else if (t.kind === 'plier') {
    const depth = clamp(t.L * 0.28, 15, 45);
    s = { shape: 'slot', a: r05(t.T + 1.2 + clr), b: r05(t.head + 1.2 + clr), depth, why: `jaws down through a ${r1(t.T + 1.2)} × ${r1(t.head + 1.2)} slot, handles up` };
  } else if (t.kind === 'box') {
    const small = t.L < 60;
    const [a, b, up] = small ? [t.L, t.T, t.W] : [t.W, t.T, t.L];
    const depth = clamp(up * (small ? 0.5 : 0.2), 8, 35);
    s = { shape: 'rect', a: r05(a + 1.2 + clr), b: r05(b + 1.2 + clr), depth, why: `stands on edge, ${r1(depth)} mm in` };
  } else if (t.kind === 'spool') {
    const depth = clamp(t.L * 0.5, 8, 30);
    s = { shape: 'round', a: r05(t.W + 1 + clr), b: r05(t.W + 1 + clr), depth, why: 'spool sits flat in a round pocket' };
  } else {
    const depth = clamp(t.L * 0.25, 12, 35);
    s = { shape: 'slot', a: r05(t.T + 1 + clr), b: r05(t.W + 1 + clr), depth, why: `tips down in a ${r1(t.T + 1)} × ${r1(t.W + 1)} slot` };
  }
  s.depth = r05(s.depth);
  const height = t.kind === 'box' ? (t.L < 60 ? t.W : t.L) : t.kind === 'spool' ? t.L : t.L;
  s.up = Math.max(0, r1(height - s.depth));
  s.w = s.a; s.d = s.shape === 'round' ? s.a : s.b;
  return s;
}

// ---------- lying flat in a tray pocket ----------
export function layGroup(t0, o = {}, outline = null) {
  const t = dims(t0);
  const pts = outline && outline.pts && outline.pts.length > 2 ? outline.pts : silhouette(t);
  const thick = t.kind === 'rod' ? t.D : t.kind === 'spool' ? t.L : t.T;
  const depth = r05(clamp(thick * 0.6, 6, 30));
  return { ...grp('outline', 0, 0, 1, 0), pts, scale: 1, rot: 0, depth, clear: o.clear ?? 1, fingerMode: o.fingerMode ?? 'ends', fingerD: o.fingerD ?? 20, fingerLen: 0, fingerDepth: 0,
    toolT: r1(thick), name: t.name, tool: t.id, outline: outline && outline.pts ? outline.src || 'photo' : 'silhouette' };
}

const holderBase = () => ({ nx: 1, ny: 1, U: 3, lip: false, tilt: 0, chamfer: 0.6, magnets: 'off', magCorners: false, above: 0, below: 0, on: null, groups: [] });

// list: [{ t: tool, n: count }]. o.style 'stand' | 'lay'. Returns { p, fail, notes }
export function holderFor(list, o = {}) {
  const style = o.style || 'stand';
  const gap = o.gap ?? (style === 'lay' ? 4 : 3.5), margin = o.margin ?? (style === 'lay' ? 4 : 3), maxN = o.maxUnits ?? 7;
  const items = [], notes = [];
  for (const { t, n, m, grip } of list) {
    const cnt = Math.max(1, n | 0);
    if (style === 'stand' && m) {
      const s = standFromModel(t, m, grip, o.clear || 0);
      if (s) {
        const pitch = r05(s.w + Math.max(gap, 2.4));
        items.push({ t, s, n: cnt, pitch, w: s.w + (cnt - 1) * pitch, d: s.d });
        notes.push(`${t.name}${cnt > 1 ? ` ×${cnt}` : ''} — ${s.why}`);
        continue;
      }
    }
    if (style === 'stand') {
      const s = standShape(t, o.clear || 0);
      const pitch = r05(s.w + Math.max(gap, 2.4));
      items.push({ t, s, n: cnt, pitch, w: s.w + (cnt - 1) * pitch, d: s.d });
      notes.push(`${t.name}${cnt > 1 ? ` ×${cnt}` : ''} — ${s.why}`);
    } else {
      const outline = o.outlines && o.outlines[t.id];
      for (let k = 0; k < cnt; k++) {
        const gr = layGroup(t, o, outline);
        if (m && m.measured) { gr.toolT = r1(m.T); gr.depth = r05(clamp(m.T * 0.6, 6, 30)); }
        const ob = G.outline2D({ ...gr, x: 0, y: 0 });
        const [x0, y0, x1, y1] = ob.bounds;
        items.push({ t, gr, w: x1 - x0, d: y1 - y0, ox: (x0 + x1) / 2, oy: (y0 + y1) / 2 });
      }
      notes.push(`${t.name}${cnt > 1 ? ` ×${cnt}` : ''} — ${outline && outline.pts ? `${outline.src === 'catalogue' ? 'outline from the catalogue photo' : outline.src === 'scan' ? 'outline from the 3D scan' : 'traced outline'}` : 'drawn from its sizes, trace it for a snug pocket'}`);
    }
  }
  if (!items.length) return { p: null, fail: 'no tools', notes };
  const res = TR.autoTray(items.map((i) => ({ w: i.w, d: i.d })), { gap, margin, maxNx: maxN, maxNy: maxN, nx: o.nx || 0, ny: o.ny || 0 });
  if (!res) return { p: null, fail: `these don’t fit in ${o.nx ? `${o.nx} × ${o.ny}` : `${maxN} × ${maxN}`} units — split them over two parts`, notes };
  const p = { ...holderBase(), ...(o.keep || {}), nx: res.nx, ny: res.ny, groups: [] };
  let maxDepth = 0, above = 0;
  items.forEach((it, i) => {
    const [cx, cy] = res.pos[i];
    if (style === 'stand') {
      const s = it.s;
      if (s.shape === 'outline') p.groups.push({ ...grp('outline', 0, 0, it.n, it.pitch), pts: s.pts, scale: 1, rot: 0, depth: s.depth, clear: s.clear, fingerMode: 'none', toolT: 0, x: r1(cx), y: r1(cy), name: it.t.name, tool: it.t.id, stand: s.stand, toolL: s.up, outline: 'model' });
      else p.groups.push(grp(s.shape, s.a, s.b, it.n, it.pitch, { x: r1(cx), y: r1(cy), depth: s.depth, toolL: s.up, name: it.t.name, tool: it.t.id }));
      maxDepth = Math.max(maxDepth, s.depth); above = Math.max(above, s.up);
    } else {
      p.groups.push({ ...it.gr, x: r1(cx - it.ox), y: r1(cy - it.oy) });
      maxDepth = Math.max(maxDepth, it.gr.depth);
    }
  });
  if (style === 'stand') { p.U = Math.max(o.minU || 3, Math.ceil((maxDepth + 5.2) / 7)); p.above = Math.round(above); p.chamfer = 0.6; p.lip = false; }
  else { p.U = Math.max(2, Math.ceil((maxDepth + 6.5) / 7)); p.chamfer = 0; p.lip = o.lip !== false; p.above = 0; }
  return { p, notes };
}

// ---------- hooks ----------
const hookBase = () => clone(PRESETS.hook.find((x) => x.id === 'peg40').p);
export const boardFor = (t) => (/^(H\d|R)$/i.test(t.zone || '') ? 'B' : 'A');
const DEF_AT = { A: { x: 1000, y: 60 }, B: { x: 200, y: 280 } };
// what hangs well: returns { p, why }
export function hookFor(t0, o = {}) {
  const t = dims(t0), board = o.board || boardFor(t), b = BOARDS[board];
  const p = hookBase(); p.board = board; if (board === 'B') p.L = 50;
  let why = '';
  if (o.m) { const r = hookFromModel(t, o.m, o.grip, o.type, board); if (r) { const z = t.zone && b.zones.find((q) => q.id === t.zone && !q.item); r.p.at = o.at ? { ...o.at } : z ? { x: Math.round(z.x0 + 40), y: Math.round(z.y0 + 25) } : { ...DEF_AT[board] }; r.p.forTool = t.id; return r; } }
  if (t.kind === 'plier') {
    const heavy = (t.g || 0) > 250 || t.L >= 175;
    if (heavy) { Object.assign(p, { type: 'u', gap: clamp(Math.round(t.head * 0.6 + 4), 10, 30), L: clamp(Math.round(t.T * 2 + 10), 30, 60), tip: 5, rows: 3 }); why = 'heavy or long: hangs head-down between two prongs, pivot on the prongs'; }
    else { Object.assign(p, { type: 'peg', L: clamp(Math.round(t.T * 2 + 16), 30, 60), rise: 5, tip: 6 }); why = 'hangs over a peg by the crotch of the handles'; }
    p.tool = { show: true, kind: 'plier', L: t.L, W: t.W, T: t.T };
  } else if (t.kind === 'rod') {
    const ring = clamp(r05((t.d + t.D) / 2), t.d + 2, Math.max(t.d + 2, t.D - 2));
    Object.assign(p, { type: 'ring', ringD: ring, stem: 6 });
    p.tool = { show: true, kind: 'rod', L: t.L, W: t.D, T: t.D };
    why = t.d < t.D * 0.85 ? `drops through a Ø${r1(ring)} ring, the handle stops it` : `no step between shaft and handle — a ring won’t stop it; a holder or the quiver suits it better`;
  } else if (t.kind === 'box') {
    const upright = t.L > t.W;
    const across = upright ? t.W : t.L, deep = t.T, tall = upright ? t.L : t.W;
    Object.assign(p, { type: 'cradle', L: clamp(Math.round(deep + 4), 20, 120), H: clamp(Math.round(tall * 0.12), 10, 40), cradleW: clamp(Math.round(across * 0.67), 20, 200), rows: 3 });
    p.tool = { show: true, kind: 'box', L: across, W: deep, T: tall };
    why = 'stands on its edge between the arms, the front wall stops it tipping';
  } else if (t.kind === 'spool') {
    Object.assign(p, { type: 'spool', spoolD: clamp(r05((t.D || 22) - 2), 8, 40), L: clamp(Math.round(t.L + 15), 30, 200), rise: 3, rows: 3 });
    p.tool = { show: true, kind: 'spool', L: t.L, W: t.W, T: t.W };
    why = `rod Ø${r1(p.spoolD)} through the ${r1(t.D)} mm bore`;
  } else if (t.kind === 'coil') {
    Object.assign(p, { type: 'hanger', L: 40, R: 12, H: 20, width: 30 });
    p.tool = { show: true, kind: 'coil', L: t.L, W: t.W, T: t.T };
    why = 'wide saddle so the coil doesn’t kink';
  } else {
    Object.assign(p, { type: 'l', L: 20, H: 10 });
    p.tool = { show: true, kind: 'rod', L: t.L, W: Math.max(t.W, 6), T: t.T };
    why = 'hangs by a hole or loop — tweezers and brushes sit better in a holder';
  }
  const z = t.zone && b.zones.find((q) => q.id === t.zone && !q.item);
  p.at = o.at ? { ...o.at } : z ? { x: Math.round(z.x0 + 40), y: Math.round(z.y0 + 25) } : { ...DEF_AT[board] };
  p.forTool = t.id; p.load = t.g || 0;
  return { p, why };
}
const hookSpan = (p) => {
  const t = p.tool || {};
  if (p.type === 'cradle') return Math.max(p.cradleW + 20, t.L || 0);
  if (p.type === 'spool') return Math.max(t.W || 60, 40);
  if (p.type === 'u') return Math.max(t.W || 50, (p.gap || 12) + 20);
  if (p.type === 'ring') return Math.max((p.ringD || 22) + 16, t.W || 0);
  return Math.max(t.W || 30, 30);
};
// many tools along one row, spaced to their widths, starting at the first tool's zone (or o.at)
export function hookRow(list, o = {}) {
  const hooks = list.flatMap(({ t, n, m, grip, type }) => Array.from({ length: Math.max(1, n | 0) }, () => hookFor(t, { ...o, m, grip, type })));
  if (!hooks.length) return [];
  const board = o.board || hooks[0].p.board, b = BOARDS[board], pitch = board === 'B' ? b.pitch : 25;
  let x = (o.at || hooks[0].p.at).x, y = (o.at || hooks[0].p.at).y;
  hooks.forEach((h, i) => {
    h.p.board = board;
    if (i > 0) x += Math.ceil(((hookSpan(hooks[i - 1].p) + hookSpan(h.p)) / 2 + (o.gap ?? 10)) / pitch) * pitch;
    h.p.at = { x: Math.round(x), y: Math.round(y) };
  });
  return hooks;
}

// rough load rating: bending at 80 % of the reach, ABS-GF printed on its side, allowable 12 MPa (≈ 5× margin, creep included)
export function hookCapacity(p) {
  const wd = p.wire > 0 ? p.wire : p.board === 'B' ? 7.5 : 5;
  let d = wd, L = p.L || 40, arms = 1;
  if (p.type === 'u' || p.type === 'cradle') arms = 2;
  if (p.type === 'spool') d = Math.max(wd, p.spoolD || 18);
  if (p.type === 'ring') L = (p.stem ?? 6) + (p.ringD || 22);
  if (p.type === 'l') L = p.L || 20;
  const F = arms * 12 * Math.PI * d ** 3 / (32 * Math.max(8, L * 0.8));
  return Math.round(F / 9.81 * 1000);
}

// ---------- bins sized to tools that drop in upright ----------
export function binFor(list, o = {}) {
  const base = clone(PRESETS.box.find((x) => x.id === 'b111').p);
  const sizes = [];
  let tall = 0;
  for (const { t: t0, n } of list) {
    const t = dims(t0);
    const [w, d, h] = t.kind === 'box' ? (t.L > 60 ? [t.W, t.T, t.L] : [t.L, t.W, t.T]) : t.kind === 'rod' ? [t.D, t.D, t.L] : t.kind === 'spool' ? [t.W, t.W, t.L] : [t.W, t.T, t.L];
    for (let k = 0; k < Math.max(1, n | 0); k++) sizes.push({ w: w + 3, d: d + 3 });
    tall = Math.max(tall, h);
  }
  if (!sizes.length) return { p: null, fail: 'no tools' };
  const res = TR.autoTray(sizes, { gap: 2, margin: 2.5, maxNx: o.maxUnits ?? 7, maxNy: o.maxUnits ?? 7 });
  if (!res) return { p: null, fail: 'too big for one bin — split them' };
  const U = clamp(Math.ceil((tall * (o.share ?? 0.45)) / 7), 3, 14);
  return { p: { ...base, nx: res.nx, ny: res.ny, U, divX: sizes.length > 1 && res.ny === 1 ? Math.min(sizes.length, res.nx * 2) : 1, divY: 1, label: 'off', scoop: false, cutout: sizes.length === 1, cutoutW: 40, cutoutD: Math.min(7 * U - 10, 25) }, notes: [`${Math.round((o.share ?? 0.45) * 100)} % of the tallest tool sits inside`] };
}


// ---------- with a tool model: hold it by the part you pick ----------
// m: { L, W, T, profile [[d, w, t, y0, y1, z0, z1]], section(a, b) → {pts [[y, z]], w, t}, dTip (centre of gravity from the tip), g, measured }
// grip: [a, b] mm from the tip
const maxOver = (prof, a, b, k) => { const r = prof.filter((q) => q[0] >= a && q[0] <= b && q[1] > 0); return r.length ? Math.max(...r.map((q) => q[k])) : 0; };
// a step in size along the length: where a driver's shaft meets its handle
export function shoulder(prof) {
  const c = prof.map((q) => Math.max(q[1], q[2]));
  let best = -1, bd = 0;
  for (let i = 2; i < c.length - 2; i++) { const d = (c[i + 1] + c[i + 2]) / 2 - (c[i - 1] + c[i - 2]) / 2; if (d > bd) { bd = d; best = i; } }
  return best >= 0 ? { d: prof[best][0], jump: bd } : null;
}
// sensible place to hold each kind of tool, for each use
export function gripDefault(t0, m, use) {
  const t = dims(t0), L = m ? m.L : t.L, prof = m ? m.profile : null;
  const sp = (a, b) => [Math.max(0, Math.round(a)), Math.min(Math.round(L), Math.round(b))];
  if (use === 'stand') return t.kind === 'box' || t.kind === 'spool' ? sp(0, L * 0.2) : sp(0, L * (t.kind === 'rod' ? 0.25 : 0.28));
  if (use === 'balance' && m) return sp(m.dTip - 12, m.dTip + 12);
  if (t.kind === 'plier') {
    if (prof && use !== 'mount') {
      // pivot: the thickest point in the front half, if the model knows thickness
      const front = prof.filter((q) => q[0] < L * 0.5 && q[2] > 0);
      if (m.measured && front.length) { const pv = front.reduce((a, q) => (q[2] > a[2] ? q : a)); return use === 'peg' ? sp(pv[0] + 8, pv[0] + 20) : sp(pv[0] - 5, pv[0] + 7); }
    }
    return use === 'mount' ? sp(L * 0.6, L * 0.82) : use === 'peg' ? sp(L * 0.38, L * 0.46) : sp(L * 0.24, L * 0.34);
  }
  if (t.kind === 'rod') { const sh = prof && shoulder(prof); return sh && sh.jump > 2 ? sp(sh.d, sh.d + 15) : use === 'mount' ? sp(L * 0.55, L * 0.8) : sp(L * 0.5, L * 0.6); }
  if (t.kind === 'box') return use === 'mount' ? sp(L * 0.3, L * 0.7) : sp(0, L);
  return use === 'mount' ? sp(L * 0.35, L * 0.65) : sp(L * 0.4, L * 0.55);
}
export function standFromModel(t0, m, grip, clr = 0) {
  const t = dims(t0), L = m.L;
  const [a, b] = grip || gripDefault(t, m, 'stand');
  const fromTip = a <= L - b;
  const depth = r05(clamp(fromTip ? b : L - a, 8, 60));
  const sec = fromTip ? m.section(0, depth) : m.section(L - depth, L);
  if (!sec) return null;
  const cy = (sec.b.x0 + sec.b.x1) / 2, cz = (sec.b.y0 + sec.b.y1) / 2;
  // tip down: holder (x, y) = (y, −z); handle end down: (y, z) — keeps the tool un-mirrored when it's drawn standing in it
  const pts = sec.pts.map(([y, z]) => [+(y - cy).toFixed(2), +((fromTip ? -1 : 1) * (z - cz)).toFixed(2)]);
  const c = 0.8 + clr;
  return { shape: 'outline', pts, depth, clear: c, up: r1(L - depth), stand: { from: fromTip ? 'tip' : 'back', depth, cy, cz }, w: sec.w + 2 * c, d: sec.t + 2 * c,
    why: `${fromTip ? 'working end' : 'handle end'} down ${r1(depth)} mm into a pocket shaped like its cross-section (${r1(sec.w)} × ${r1(sec.t)})` };
}
function hookFromModel(t, m, grip, type, board) {
  const L = m.L, prof = m.profile;
  const p = hookBase(); p.board = board; if (board === 'B') p.L = 50;
  const ty = type || (t.kind === 'plier' ? ((t.g || 0) > 250 || L >= 175 ? 'u' : 'peg') : t.kind === 'rod' ? 'ring' : t.kind === 'box' ? 'cradle' : t.kind === 'spool' ? 'spool' : 'l');
  const use = ty === 'peg' || ty === 'j' || ty === 'l' || ty === 'hanger' ? 'peg' : 'catch';
  const [a, b] = grip || gripDefault(t, m, use);
  const Tg = maxOver(prof, a, b, 2) || m.T, Wg = maxOver(prof, a, b, 1) || m.W;
  let why = '', ok = true;
  p.type = ty;
  if (ty === 'u') {
    const c = catchAt(prof, a, b, { measure: 'width', clear: 1 });
    p.gap = clamp(r05(c.open), 6, 60); p.L = clamp(Math.round(Tg + 14), 25, 90); p.tip = 5; p.rows = (t.g || 0) > 250 ? 3 : 2;
    ok = c.catches; why = c.catches ? `drops in tip-first and stops ${r1(a)} mm from the tip — gap ${r1(p.gap)}, the tool is ${r1(c.hold)} wide there` : `won’t stop at ${r1(a)}–${r1(b)} mm: it’s no wider there (${r1(c.hold)}) than what passes before it (${r1(c.pass)}). Pick a wider part`;
    p.support = a;
  } else if (ty === 'ring') {
    const c = catchAt(prof, a, b, { measure: 'ring', clear: 1 });
    p.ringD = clamp(r05(c.open), 6, 80); p.stem = 6;
    ok = c.catches; why = c.catches ? `drops through a Ø${r1(p.ringD)} ring and rests ${r1(a)} mm from the tip` : `nothing at ${r1(a)}–${r1(b)} mm is bigger than what goes through first — pick the handle or a shoulder`;
    p.support = a;
  } else if (ty === 'cradle') {
    p.L = clamp(Math.round(Tg + 4), 20, 120); p.H = clamp(Math.round(L * 0.12), 10, 40); p.cradleW = clamp(Math.round(Wg * 0.67), 20, 200); p.rows = 3;
    why = `stands on its end between the arms, ${r1(Wg)} wide × ${r1(Tg)} deep`; p.support = L;
  } else if (ty === 'spool') {
    p.spoolD = clamp(r05((t.D || 22) - 2), 8, 40); p.L = clamp(Math.round(L + 15), 30, 200); p.rise = 3; p.rows = 3; why = `rod Ø${r1(p.spoolD)} through the bore`; p.support = L / 2;
  } else {
    p.L = clamp(Math.round(Tg + (ty === 'peg' ? 16 : 8)), 20, 90); if (ty === 'peg') { p.rise = 5; p.tip = 6; }
    why = `${ty === 'peg' ? 'a peg' : 'the hook'} reaches ${p.L} mm, past the ${r1(Tg)} mm-thick part ${r1(a)}–${r1(b)} mm from the tip`; p.support = (a + b) / 2;
  }
  p.grip = [a, b]; p.load = t.g || 0;
  const kindG = t.kind === 'box' ? 'box' : t.kind === 'spool' ? 'spool' : t.kind === 'rod' ? 'rod' : 'plier';
  p.tool = { show: true, kind: kindG, L: t.kind === 'box' ? Wg : L, W: t.kind === 'box' ? Tg : Wg, T: t.kind === 'box' ? L : Tg };
  return { p, why, ok };
}
// a saddle that cups the part you pick: its cross-section over the span, open at the top
export function mountFor(t0, m, grip, o = {}) {
  const t = dims(t0), L = m.L;
  const [a, b] = grip || gripDefault(t, m, 'mount');
  const sec = m.section(a, b);
  if (!sec) return { p: null, fail: 'nothing to hold there' };
  const orient = o.orient || (sec.w >= sec.t ? 'edge' : 'flat');
  const S = orient === 'edge' ? sec.pts.map(([y, z]) => [z, y]) : sec.pts.map(([y, z]) => [y, z]);
  const p = clone(PRESETS.mount[0].p);
  Object.assign(p, { board: o.board || boardFor(t), sec: S.map(([u, v]) => [+u.toFixed(2), +v.toFixed(2)]), width: clamp(r05(Math.abs(b - a)), 10, 60), orient, grip: [a, b], forTool: t.id, load: t.g || 0, rows: (t.g || 0) > 300 ? 3 : 2,
    tool: { show: true, kind: t.kind === 'rod' ? 'rod' : 'plier', L, W: m.W, T: m.T } });
  const z = t.zone && BOARDS[p.board].zones.find((q) => q.id === t.zone && !q.item);
  p.at = o.at ? { ...o.at } : z ? { x: Math.round(z.x0 + 40), y: Math.round(z.y0 + 25) } : { ...DEF_AT[p.board] };
  const notes = [`${t.name} — held ${r1(a)}–${r1(b)} mm from the tip, ${orient === 'edge' ? 'on its edge, flat face to the board' : 'lying flat'}; pocket ${r1(sec.w)} × ${r1(sec.t)}`];
  if (m.dTip && (m.dTip < Math.min(a, b) - 2 || m.dTip > Math.max(a, b) + 2)) notes.push(`balance point is ${r1(m.dTip)} mm from the tip, outside this saddle — it will tip. Add a second saddle (add the tool again) or hold it at the balance point`);
  return { p, notes, sec };
}
