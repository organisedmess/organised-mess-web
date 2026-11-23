// GRIDLAB — the page. Bench (room + maps), Tools (the library), Make (every part, fitted to tools), Trace, Print plan, Rules.
import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';
import Module from './lib/manifold.js';
import { WASM_B64 } from './lib/manifold-wasm.js';
import * as G from './geom.js';
import * as BD from './boards.js';
import { MODES, PRESETS, PRINTERS, MATERIALS, DEFAULT_SETTINGS, PROFILES, profileText as settingsText, build, freeParts, readme, drawerPlan, wallPlacement, g as mkGroup, TRACE_DEFAULT, traceHolder, traceGroup } from './parts.js';
import * as PC from './printcheck.js';
import * as TR from './trace.js';
import { stlBinary, zipStore } from './export.js';
import * as LIBM from './library.js';
import * as FIT from './fit.js';
import * as MD from './model.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US');
const f0 = (v) => Math.round(v).toLocaleString('en-US');
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }

// ---------- downloads (claude.ai capability, or a plain link outside it) ----------
let DL = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then((d) => { DL = d; }).catch(() => {}); } catch (e) { /* not in claude.ai */ }
async function download(filename, data, type = 'application/zip') {
  const blob = new Blob([data], { type });
  if (DL) {
    try { await DL.save({ filename, data: blob }); toast(`Saved ${filename}`); }
    catch (e) { toast(e && e.code === 'declined' ? 'Download cancelled' : `Couldn’t save here (${(e && (e.code || e.message)) || 'unavailable'})`); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ---------- state ----------
const KEY = 'gridlab.v2', OLD_KEY = 'gridlab.v1';
const presetP = (mode, id) => clone(PRESETS[mode].find((x) => x.id === id).p);
// which plan tools each starter part holds, so the library knows where everything lives ('id*count')
const STARTER_FOR = {
  e4t: ['goot-ts-10', 'goot-ts-11*2', 'goot-ts-12*2', 'goot-ts-15', 'goot-sa-10-chip', 'goot-sa-10-fork', 'goot-sa-10-knife', 'goot-sa-10-needle', 'goot-sa-10-reamer', 'goot-sa-10-brush'],
  e4b: ['muji-spot-brush*2', 'muji-scraper', 'toothbrush', 'iwiss-tl08'], qh: ['goot-gs-150', 'goot-gs-108', 'goot-gs-158', 'ok-wsu-30m'], e3h: ['iwiss-sn-58b-dies*8'],
  h3h: ['wera-vde-blade*24'], h9h: ['wera-micro-40*13', 'wera-micro-60*9', 'wera-micro-80*2', 'wera-lifting-fork'],
  pg1: ['hakko-chp-170'], pg2: ['knipex-78-61-125'], pg3: ['hakko-pn-2005'], pg4: ['hakko-106-08'], uh1: ['hakko-106-03'], uh2: ['hakko-csp-30-1'], uc1: ['engineer-pa-09'], uc2: ['engineer-pa-20'],
  sp1: ['wire-spool-22'], sp2: ['wire-spool-22'], cd1: ['sanwa-cd800a'],
};
const forOf = (arr) => (arr || []).map((e) => { if (typeof e === 'string') { const [id, n] = e.split('*'); return { id, n: +n || 1 }; } return { id: e.id, n: e.n || 1 }; });
function starterItems() {
  const it = (id, mode, pid, name, extra = {}) => ({ id, mode, name, p: Object.assign(presetP(mode, pid), extra), for: forOf(STARTER_FOR[id]) });
  return [
    it('e4s', 'shelf', 'e4', 'E4 shelf'),
    it('e4t', 'holder', 'e4tw', 'E4 · tweezers + SA-10', { on: { mount: 'e4s', a: 0, c: 0 } }),
    it('e4b', 'holder', 'e4br', 'E4 · brushes + TL08', { on: { mount: 'e4s', a: 2, c: 0 } }),
    it('s2a', 'shelf', 's2', 'S2 shelf, left'),
    it('s2b', 'shelf', 's2', 'S2 shelf, right', { at: { x: 1050, y: 377 } }),
    it('s2x', 'box', 'b211', 'Solder spool + flux', { U: 4, on: { mount: 's2a', a: 0, c: 0 } }),
    it('s2y', 'box', 'b111', 'Tip tins', { on: { mount: 's2a', a: 2, c: 0 } }),
    it('s3s', 'shelf', 's3', 'S3 shelf'),
    it('s3b', 'box', 's3', 'Terminals · ferrules · heat-shrink', { on: { mount: 's3s', a: 0, c: 0 } }),
    it('s3c', 'box', 'b111', 'Spare 1 × 1', { on: { mount: 's3s', a: 3, c: 0 } }),
    it('e3s', 'shelf', 'e3', 'E3 shelf'),
    it('e3h', 'holder', 'e3', 'E3 · SN-58B dies', { on: { mount: 'e3s', a: 0, c: 0 } }),
    it('qp', 'table', 'quiver', 'Quiver plate'),
    it('qh', 'holder', 'quiver', 'Quiver', { on: { mount: 'qp', a: 0, c: 0 } }),
    it('lp', 'table', 'low', 'Back-row plate'),
    it('lb1', 'box', 'div', 'Back-row parts tray', { on: { mount: 'lp', a: 0, c: 0 } }),
    it('lb2', 'box', 'b211', 'Back-row bin', { on: { mount: 'lp', a: 4, c: 0 } }),
    it('lb3', 'box', 'b211', 'Back-row bin', { on: { mount: 'lp', a: 4, c: 1 } }),
    it('h3s', 'shelf', 'h3', 'H3 shelf'),
    it('h3h', 'holder', 'h3', 'H3 · VDE blades', { on: { mount: 'h3s', a: 0, c: 0 } }),
    it('h9s', 'shelf', 'h9', 'H9 shelf'),
    it('h9h', 'holder', 'h9', 'H9 · Micro drivers', { on: { mount: 'h9s', a: 0, c: 0 } }),
    it('pg1', 'hook', 'peg40', 'E5 peg · CHP-170', { at: { x: 985, y: 60 } }),
    it('pg2', 'hook', 'peg40', 'E5 peg · Super Knips', { at: { x: 1035, y: 60 } }),
    it('pg3', 'hook', 'peg40', 'E5 peg · PN-2005', { at: { x: 1085, y: 60 } }),
    it('pg4', 'hook', 'peg40', 'E5 peg · 106-08', { at: { x: 1135, y: 60 } }),
    it('uh1', 'hook', 'u12', 'E5 U-hook · 106-03', { at: { x: 1185, y: 60 } }),
    it('uh2', 'hook', 'u12', 'E5 U-hook · CSP-30-1', { at: { x: 1245, y: 60 } }),
    it('uc1', 'hook', 'u20', 'E1 U-hook · PA-09', { at: { x: 1560, y: 60 } }),
    it('uc2', 'hook', 'u20', 'E1 U-hook · PA-20', { at: { x: 1635, y: 60 } }),
    it('sp1', 'hook', 'spool', 'W spool rod 1', { at: { x: 120, y: 80 } }),
    it('sp2', 'hook', 'spool', 'W spool rod 2', { at: { x: 220, y: 80 } }),
    it('cd1', 'hook', 'cradle', 'M1 cradle · CD800a', { at: { x: 1440, y: 430 } }),
    it('dw1', 'drawer', 'dw', 'Drawer · 400 × 300'),
    it('dwb', 'box', 'div', 'Drawer tray', { on: { mount: 'dw1', a: 0, c: 0 } }),
  ];
}
let S = null;
const TABIDS = ['workspace', 'tools', 'make', 'trace', 'scan', 'plan', 'rules'];
function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage blocked */ }
  if (!(s && Array.isArray(s.items) && s.settings)) {
    let old = null; try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { /* none */ }
    s = old && Array.isArray(old.items) && old.settings ? { settings: old.settings, items: old.items, tab: old.tab, make: MODES.some((m) => m.id === old.tab) ? old.tab : null } : null;
  }
  if (!s) s = { settings: clone(DEFAULT_SETTINGS), items: starterItems(), tab: 'workspace' };
  if (MODES.some((m) => m.id === s.tab)) { s.make = s.make || s.tab; s.tab = 'make'; }
  if (!TABIDS.includes(s.tab)) s.tab = 'workspace';
  s.make = s.make || 'holder'; s.drafts = s.drafts || {}; s.sel = s.sel || null;
  s.lib = { edits: {}, custom: [], outlines: {}, inv: null, views: {}, scans: {}, ...(s.lib || {}) };
  s.lib.views = s.lib.views || {}; s.lib.scans = s.lib.scans || {};
  s.pick = s.pick || []; s.traceFor = s.traceFor || [];
  s.tf = { q: '', cat: '', zone: '', status: '', bench: false, ...(s.tf || {}) };
  for (const it of s.items) if (!it.for && STARTER_FOR[it.id]) it.for = forOf(STARTER_FOR[it.id]);
  for (const d of Object.values(s.drafts)) if (d && d.row && d.row.length) d.p = d.row[Math.min(d.rowSel || 0, d.row.length - 1)].p;
  // wall parts adopt the dovetail: anything saved before it existed gets a tongue and an auto-sized base
  const adopt = (mode, p) => { if (!p || p.mount) return; if (mode === 'hook' || mode === 'mount' || mode === 'shelf') Object.assign(p, { mount: 'dovetail', dove: 'auto', load: p.load || 0 }); };
  for (const it of s.items) adopt(it.mode, it.p);
  for (const d of Object.values(s.drafts)) if (d) { adopt(d.mode, d.p); for (const r of d.row || []) adopt(d.mode, r.p); }
  if (s.settings.tol && s.settings.tol.dove == null) s.settings.tol.dove = 0.2;
  return s;
}
function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify({ settings: S.settings, items: S.items, tab: S.tab, make: S.make, drafts: S.drafts, sel: S.sel, trace: S.trace, lib: S.lib, pick: S.pick, traceFor: S.traceFor, tf: S.tf, backTo: S.backTo || null })); }
  catch (e) { /* storage blocked or full */ }
}
const itemById = (id) => S.items.find((i) => i.id === id);

// ---------- tool library: the live inventory on the site, the plan's list elsewhere; edits, extra tools and outlines on top ----------
const LIB = { base: LIBM.BUILTIN_TOOLS.map((t) => ({ ...t })), alias: {}, source: 'plan', invCount: 0, list: [], byId: new Map() };
function rebuildLib() {
  const list = [...LIB.base, ...S.lib.custom].map((t) => { const e = S.lib.edits[t.id]; return e ? { ...t, ...e, edited: true } : t; });
  LIB.list = list; LIB.byId = new Map(list.map((t) => [t.id, t]));
}
const toolId = (id) => LIB.alias[id] || id;
const tool = (id) => (id ? LIB.byId.get(toolId(id)) || null : null);
const outlineOf = (id) => (id ? S.lib.outlines[toolId(id)] || null : null);
function homes() {
  const m = new Map();
  for (const it of S.items) for (const f of forOf(it.for)) { const id = toolId(f.id); if (!m.has(id)) m.set(id, []); if (!m.get(id).includes(it)) m.get(id).push(it); }
  return m;
}
const f1s = (v) => (v ? f1(v) : '–');
function dimText(t) {
  if (!t) return '';
  const g = t.g ? ` · ${f0(t.g)} g` : '';
  if (t.kind === 'rod') return `Ø${f1s(t.D || t.W)}${t.d && t.d < (t.D || 0) * 0.85 ? ` / Ø${f1(t.d)}` : ''} × ${f1s(t.L)} mm${g}`;
  if (t.kind === 'spool') return `Ø${f1s(t.W)} × ${f1s(t.L)}, bore ${f1s(t.D)} mm${g}`;
  return `${f1s(t.L)} × ${f1s(t.W)}${t.T ? ` × ${f1(t.T)}` : ''} mm${g}`;
}
const KIND_LABEL = Object.fromEntries(LIBM.KINDS);
function matchTool(t, q) {
  const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = `${t.name} ${t.sub || ''} ${t.brand} ${t.model || ''} ${t.cat} ${t.zone} ${t.set || ''} ${t.sizeText || ''} ${KIND_LABEL[t.kind] || t.kind} ${t.uses || ''}`.toLowerCase();
  return toks.every((k) => hay.includes(k));
}
// a small picture of the tool: the catalogue photo if there is one, else its outline or sizes
function shapeOf(t) {
  const o = outlineOf(t.id); if (o) return { pts: o.pts, real: true };
  if (S.lib.scans[t.id] && MEM.scans.has(t.id)) { const mi = modelInfo(t.id); if (mi) { if (!mi.outline) mi.outline = MD.hfOutline(mi.hf); if (mi.outline) return { pts: mi.outline, real: true, scan: true }; } }
  return { pts: FIT.silhouette(t), real: false };
}
function silSVG(t, w = 34, h = 26) {
  const sh = shapeOf(t), o = sh.real, pts = sh.pts;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.05 + 0.5;
  return `<svg viewBox="${(x0 - pad).toFixed(1)} ${(-y1 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}" width="${w}" height="${h}" aria-hidden="true"><path d="M${pts.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L')}Z" fill="${o ? 'var(--ink)' : '#a3a5a2'}" fill-opacity="${o ? 0.86 : 0.5}" stroke="var(--ink)" stroke-opacity="${o ? 0 : 0.4}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
}
function thumbHTML(t, w = 34, h = 26) {
  if (!t.photo) return silSVG(t, w, h);
  return `<img src="${esc(t.photo)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span style="display:none">${silSVG(t, w, h)}</span>`;
}
// ---------- tool models: photo views (top · side · end) and scans → height field → weight, balance, profile, sections ----------
const MEM = { scans: new Map(), info: new Map(), geo: new Map() };
const viewsOf = (id) => S.lib.views[toolId(id)] || {};
function setViews(id, patch) { const k = toolId(id); S.lib.views[k] = { ...(S.lib.views[k] || {}), ...patch }; MEM.info.delete(k); }
function topOf(id) {
  const t = tool(id), o = outlineOf(id), v = viewsOf(id);
  if (o && o.pts) return v.flipTop ? MD.mirrorX(o.pts) : o.pts;
  return FIT.silhouette(t);
}
function sideOf(id) { const v = viewsOf(id); if (!v.side) return null; let P = v.side.pts; if (v.flipSide) P = MD.mirrorX(P); if (v.overSide) P = MD.mirrorY(P); return P; }
function endOf(id) { const v = viewsOf(id); return v.end ? v.end.pts : null; }
// which end is the tip: the narrower one
function tipIsLeft(P) {
  let x0 = 1e9, x1 = -1e9; for (const [x] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const w = (x) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length]; if ((ax - x) * (bx - x) <= 0 && ax !== bx) { const y = ay + ((x - ax) / (bx - ax)) * (by - ay); lo = Math.min(lo, y); hi = Math.max(hi, y); } } return hi > lo ? hi - lo : 0; };
  const L = x1 - x0, a = (w(x0 + L * 0.06) + w(x0 + L * 0.12)) / 2, b = (w(x1 - L * 0.06) + w(x1 - L * 0.12)) / 2;
  return a < b * 0.92;
}
function modelKey(t) {
  const o = outlineOf(t.id), v = viewsOf(t.id), sc = S.lib.scans[t.id];
  return JSON.stringify([t.kind, t.L, t.W, t.T, t.D, t.d, t.head, t.g, o ? [o.at, o.pts.length, o.L] : 0, v.side ? [v.side.at, v.side.pts.length] : 0, v.end ? [v.end.at, v.end.pts.length] : 0, v.flipTop, v.flipSide, v.overSide, v.split, sc ? [sc.at, sc.clip, sc.tris, sc.floor, sc.redo, MEM.scans.has(t.id)] : 0]);
}
// everything the fitters need about a tool's shape and weight; cached until its sources change
function modelInfo(id) {
  const t = tool(id); if (!t) return null;
  const key = modelKey(t), hit = MEM.info.get(t.id);
  if (hit && hit.key === key) return hit;
  const o = outlineOf(t.id), v = viewsOf(t.id), scan = S.lib.scans[t.id] && MEM.scans.get(t.id);
  let hf, src, fill = 0;
  try {
    if (scan) {
      const sc = S.lib.scans[t.id];
      hf = MD.hfFromMesh(scan.pos, scan.idx, { floor: sc.floor ? 0 : null, cover: o && o.pts && sc.clip !== false ? topOf(t.id) : null });
      src = 'scan';
      if (o && o.pts && sc.clip !== false) {
        const top = topOf(t.id); MD.clipHF(hf, { top });
        for (const [p, q] of sc.redo || []) MD.clearX(hf, p, q);
        const n = fillScan(hf, t, top);
        src = `scan, trimmed to the photo outline${n ? ' · gaps filled from the photos' : ''}`;
        fill = n;
      }
    }
    else { hf = MD.hfFromViews({ top: topOf(t.id), side: sideOf(t.id), end: endOf(t.id), T: FIT.dims(t).T }); src = v.side || v.end ? `photos: ${['top', v.side ? 'side' : '', v.end ? 'end' : ''].filter(Boolean).join(' + ')}` : o ? `${o.src === 'catalogue' ? 'catalogue outline' : 'top photo'} × listed thickness` : 'listed sizes'; }
  } catch (e) { return null; }
  const e = MD.hfExtent(hf), mp = MD.massProps(hf, { g: t.g || 0, split: v.split || null });
  const info = { key, id: t.id, hf, fill, L: e.L, W: e.W, T: e.T, ext: e, src, measured: !!(scan || v.side || v.end), photo: !!(o && o.src !== 'catalogue'), profile: MD.profileOf(hf, 72), mass: mp, dTip: mp.dTip, g: t.g || 0,
    section: (a, b) => MD.sectionOver(hf, a, b) };
  MEM.info.set(t.id, info);
  return info;
}
// three.js geometry of the model in the tool frame: the scan, the hull of the photo views, or the outline × thickness
function modelGeo(id) {
  const t = tool(id); if (!t) return null;
  const key = modelKey(t), hit = MEM.geo.get(t.id);
  if (hit && hit.key === key) return hit.geo;
  if (hit) hit.geo.dispose();
  let geo = null;
  const scan = S.lib.scans[t.id] && MEM.scans.get(t.id), v = viewsOf(t.id);
  try {
    const mi = scan ? modelInfo(t.id) : null;
    if (scan && mi && mi.fill > 40) { const m = MD.hfMesh(mi.hf, 2); geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); geo.setIndex(new THREE.BufferAttribute(m.idx, 1)); geo = geo.toNonIndexed(); }
    else if (scan) { geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(scan.pos, 3)); geo.setIndex(new THREE.BufferAttribute(scan.idx, 1)); geo = geo.toNonIndexed(); }
    else if (v.side || v.end) { const m = G.toolHull({ top: topOf(t.id), side: sideOf(t.id), end: endOf(t.id), T: FIT.dims(t).T }); geo = geoFrom(m); m.delete(); }
    else {
      const T = FIT.dims(t).T, bt = Math.min(0.8, T / 6);
      geo = new THREE.ExtrudeGeometry(new THREE.Shape(topOf(t.id).map(([x, y]) => new THREE.Vector2(x, y))), { depth: Math.max(0.2, T - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: 2, curveSegments: 4 });
      geo.translate(0, 0, bt);
    }
    geo.computeVertexNormals(); geo.computeBoundingBox();
  } catch (e) { return null; }
  MEM.geo.set(t.id, { key, geo });
  return geo;
}
// scans live in IndexedDB (too big for localStorage)
const IDB = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { try { const r = indexedDB.open('gridlab', 1); r.onupgradeneeded = () => r.result.createObjectStore('scans'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('scans', 'readwrite'); tx.objectStore('scans').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('scans').objectStore('scans').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res) => { const tx = db.transaction('scans', 'readwrite'); tx.objectStore('scans').delete(k); tx.oncomplete = res; tx.onerror = res; }); },
};
async function loadScans() {
  for (const id of Object.keys(S.lib.scans)) { try { const m = await IDB.get(id); if (m && m.pos) MEM.scans.set(id, { pos: new Float32Array(m.pos), idx: new Uint32Array(m.idx) }); } catch (e) { /* storage blocked */ } }
}
// labels that follow points in a 3D view
function labelLayer(v) {
  if (v.labels) return v.labels;
  const el = document.createElement('div'); el.className = 'rvlabels'; v.el.appendChild(el);
  const L = { el, list: [], clear() { el.innerHTML = ''; this.list = []; }, add(p, text, cls = '') { const d = document.createElement('div'); d.className = `dimlbl ${cls}`; d.textContent = text; el.appendChild(d); this.list.push({ p, el: d }); },
    place() { const cam = v.camera, w = v.el.clientWidth, h = v.el.clientHeight; for (const l of this.list) { const q = l.p.clone().project(cam); if (q.z > 1 || q.z < -1) { l.el.style.display = 'none'; continue; } l.el.style.display = ''; l.el.style.transform = `translate(${((q.x + 1) / 2 * w).toFixed(1)}px, ${((1 - q.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`; } } };
  const base = v.render.bind(v); v.render = () => { base(); L.place(); };
  v.labels = L; return L;
}
function cogMarker(c, T) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.6, T * 0.12), 20, 14), new THREE.MeshBasicMaterial({ color: 0xe8501c, depthTest: false, transparent: true }));
  ball.renderOrder = 5; ball.position.set(...c); g.add(ball);
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(c[0], c[1], -2)]), new THREE.LineDashedMaterial({ color: 0xe8501c, dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true }));
  ln.computeLineDistances(); ln.renderOrder = 5; g.add(ln);
  return g;
}
const shortName = (t) => { if (!(t.brand && t.name.toLowerCase().startsWith(t.brand.toLowerCase() + ' '))) return t.name; const r = t.name.slice(t.brand.length + 1); return /^\d/.test(r) ? t.name : r; };

// ---------- what you can make ----------
const TYPES = [
  { id: 'holder', mode: 'holder', label: 'Holder', hint: 'tools stand up', fit: 'stand' },
  { id: 'tray', mode: 'holder', label: 'Tray', hint: 'tools lie flat', fit: 'lay' },
  { id: 'hook', mode: 'hook', label: 'Hooks', hint: 'hang on a board', fit: 'hook' },
  { id: 'mount', mode: 'mount', label: 'Saddle', hint: 'cups one part', fit: 'saddle' },
  { id: 'box', mode: 'box', label: 'Bin', hint: 'drop-in, or parts', fit: 'bin' },
  { id: 'desk', mode: 'desk', label: 'Desk organiser', hint: 'trays, cups, slots, stands' },
  { id: 'shelf', mode: 'shelf', label: 'Shelf', hint: 'baseplate on a board' },
  { id: 'table', mode: 'table', label: 'Table plate', hint: 'baseplate in the table' },
  { id: 'drawer', mode: 'drawer', label: 'Drawer', hint: 'baseplate in a drawer' },
  { id: 'fit', mode: 'fit', label: 'Fit test', hint: 'tolerance coupons' },
  { id: 'base', mode: 'base', label: 'Dovetail base', hint: 'what wall parts slide into' },
  { id: 'pins', mode: 'pins', label: 'Pins', hint: 'studs for pinned shelves' },
];
const TYPE = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
const BLURB = {
  holder: 'Tools stand up in cut-outs sized to each one, on a Gridfinity foot. Add one tool or a whole set — the cut-outs are laid out for you, then sit it on any shelf, plate or drawer.',
  tray: 'Tools lie flat in pockets shaped like them, with finger scoops. Uses traced outlines where you have them, and the tool’s sizes where you don’t.',
  hook: 'Hooks sized to the part of the tool you pick: a U-hook or ring that stops it at the pivot or a shoulder, a peg through the handles, a cradle for meters. The tool hangs the way its weight makes it hang. Several tools make a row.',
  mount: 'A block with a pocket shaped to the part you pick — a handle, the pivot, the head — for tools no hook suits, like wire strippers. It stands on a dovetail back plate and prints standing up. Add the same tool twice for two saddles.',
  box: 'A bin sized so tools drop in upright, or a plain Gridfinity bin with compartments, labels and lids for parts.',
  shelf: MODES.find((m) => m.id === 'shelf').blurb, table: MODES.find((m) => m.id === 'table').blurb, drawer: MODES.find((m) => m.id === 'drawer').blurb,
  desk: MODES.find((m) => m.id === 'desk').blurb,
  fit: MODES.find((m) => m.id === 'fit').blurb, pins: MODES.find((m) => m.id === 'pins').blurb, base: MODES.find((m) => m.id === 'base').blurb,
};
const typePresets = (type) => (type === 'tray' ? PRESETS.holder.filter((x) => x.id === 'trace') : type === 'holder' ? PRESETS.holder.filter((x) => x.id !== 'trace') : PRESETS[TYPE(type).mode]);
const typeOfItem = (it) => (it.mode === 'holder' && it.p.groups && it.p.groups.length && it.p.groups.every((g) => g.shape === 'outline') ? 'tray' : it.mode);

// ---------- param schemas ----------
const num = (k, label, o = {}) => ({ k, label, t: 'num', ...o });
const int = (k, label, o = {}) => ({ k, label, t: 'int', step: 1, ...o });
const bool = (k, label, o = {}) => ({ k, label, t: 'bool', ...o });
const sel = (k, label, opts, o = {}) => ({ k, label, t: 'sel', opts, ...o });
const text = (k, label, o = {}) => ({ k, label, t: 'text', ...o });
const STACKED = ['drawers', 'caddy', 'stack'], NO_BASE = ['stand', ...STACKED];
const isGrid = (p) => p.base === 'grid' && !NO_BASE.includes(p.kind), kindIs = (...ks) => (p) => ks.includes(p.kind);
const MAG = [['off', 'None'], ['press', 'Press-fit Ø6.5'], ['ribs', 'Crush ribs']];
const SCHEMA = {
  shelf: [
    { t: 'Board and size', f: [sel('board', 'Board', [['A', 'Board A · wall'], ['B', 'Board B · hardware']]), int('nx', 'Width', { min: 1, max: 8, unit: 'units' }), int('ny', 'Depth', { min: 1, max: 3, unit: 'units' }),
      num('backH', 'Back plate height', { min: 21, max: 168, step: 7, unit: 'mm' }), num('backT', 'Back plate thickness', { adv: true, min: 4, max: 10, step: 0.5, unit: 'mm' }), num('rim', 'Rim', { adv: true, min: 1, max: 10, step: 0.5, unit: 'mm' }), bool('cheeks', 'Side cheeks', { adv: true })] },
    { t: 'Floor', f: [sel('floor', 'Floor', [['open', 'Open windows'], ['solid', 'Solid'], ['magnets', 'Magnet pockets']]), num('window', 'Window', { adv: true, min: 0, max: 36, step: 1, unit: 'mm', show: (p) => p.floor !== 'solid' }),
      sel('magStyle', 'Pocket style', MAG.slice(1), { adv: true, show: (p) => p.floor === 'magnets' })] },
    { t: 'Mount', f: [sel('mount', 'On the board', [['dovetail', 'Dovetail — tongues slide into bases'], ['pins', 'Pins through the back plate']]), sel('dove', 'Dovetail size', [['auto', 'Auto — by weight and reach'], ['S', 'S · 18 × 35 base, 2 studs'], ['M', 'M · 45 × 45 base, 4 studs'], ['L', 'L · 70 × 65 base, 6 studs']], { show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }),
      int('doveN', 'Tongues — 0 picks 1–3 by width', { adv: true, min: 0, max: 4, show: (p) => p.mount !== 'pins' }), num('load', 'Weight it carries — 0 = the tool’s, or a typical one', { adv: true, min: 0, max: 10000, step: 10, unit: 'g', show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }),
      num('pinD', 'Pin Ø — 0 uses the stud size', { adv: true, min: 0, max: 9, step: 0.01, unit: 'mm', show: (p) => p.mount === 'pins' }), num('pinLen', 'Reach into the board', { min: 8, max: 21, step: 0.5, unit: 'mm', show: (p) => p.mount === 'pins' }), num('maxGap', 'Longest gap between studs', { adv: true, min: 40, max: 250, step: 5, unit: 'mm', show: (p) => p.mount === 'pins' })] },
    { t: 'Placement', f: [{ t: 'at' }] },
  ],
  table: [
    { t: 'Size', f: [int('nx', 'Width', { min: 1, max: 7, unit: 'units' }), int('ny', 'Depth', { min: 1, max: 7, unit: 'units' }), num('rim', 'Rim', { adv: true, min: 1, max: 10, step: 0.5, unit: 'mm' }), num('funnel', 'Funnel depth', { adv: true, min: 1.5, max: 6, step: 0.5, unit: 'mm' })] },
    { t: 'Studs', f: [num('studLen', 'Stud length', { min: 8, max: 21, step: 0.5, unit: 'mm' }), int('maxStuds', 'Most studs', { adv: true, min: 3, max: 16 })] },
    { t: 'Placement', f: [{ t: 'at' }] },
  ],
  holder: [
    { t: 'Size', f: [int('nx', 'Width', { min: 1, max: 8, unit: 'units' }), int('ny', 'Depth', { min: 1, max: 8, unit: 'units' }), int('U', 'Height', { min: 2, max: 30, unit: '× 7 mm' }),
      num('tilt', 'Lean toward the board', { min: 0, max: 25, step: 1, unit: '°' }), num('chamfer', 'Lead-in chamfer', { adv: true, min: 0, max: 2, step: 0.1, unit: 'mm' }), bool('lip', 'Stacking lip on top', { adv: true })] },
    { t: 'Cut-outs', f: [{ t: 'groups' }] },
    { t: 'Feet', f: [sel('magnets', 'Magnets', MAG), bool('magCorners', 'Outer corners only', { adv: true, show: (p) => p.magnets !== 'off' })] },
    { t: 'Tool envelope', f: [num('above', 'Tools stand above the top', { min: 0, max: 400, step: 5, unit: 'mm' }), num('below', 'Tools hang below the shelf', { adv: true, min: 0, max: 400, step: 5, unit: 'mm' })] },
    { t: 'Place on', f: [{ t: 'on' }] },
  ],
  hook: [
    { t: 'Hook', f: [sel('type', 'Type', G.HOOK_TYPES), sel('board', 'Board', [['A', 'Board A · Ø4.7 studs'], ['B', 'Board B · Ø7.65 studs']]),
      num('L', 'Reach out from the board', { min: 8, max: 200, step: 1, unit: 'mm' }),
      num('rise', 'Rise', { min: 0, max: 30, step: 1, unit: '°', show: (p) => ['peg', 'spool'].includes(p.type) || (p.type === 'u' && p.mount === 'studs') }),
      num('tip', 'Up-tip', { min: 0, max: 30, step: 1, unit: 'mm', show: (p) => ['peg', 'u'].includes(p.type) }),
      num('H', 'Height of the up-turn', { min: 4, max: 80, step: 1, unit: 'mm', show: (p) => ['j', 'l', 'cradle', 'hanger'].includes(p.type) }),
      num('R', 'Bend radius', { adv: true, min: 4, max: 40, step: 1, unit: 'mm', show: (p) => ['j', 'hanger'].includes(p.type) }),
      num('gap', 'Gap between prongs', { min: 4, max: 60, step: 0.5, unit: 'mm', show: (p) => p.type === 'u' }),
      num('ringD', 'Ring inside Ø', { min: 6, max: 80, step: 0.5, unit: 'mm', show: (p) => p.type === 'ring' }),
      num('stem', 'Stem before the ring', { adv: true, min: 0, max: 40, step: 1, unit: 'mm', show: (p) => p.type === 'ring' }),
      num('spoolD', 'Rod Ø', { min: 8, max: 40, step: 0.5, unit: 'mm', show: (p) => p.type === 'spool' }),
      num('stop', 'End stop, beyond the rod', { adv: true, min: 1, max: 12, step: 0.5, unit: 'mm', show: (p) => p.type === 'spool' }),
      num('cradleW', 'Cradle width', { min: 20, max: 200, step: 1, unit: 'mm', show: (p) => p.type === 'cradle' }),
      num('width', 'Saddle width', { min: 8, max: 120, step: 1, unit: 'mm', show: (p) => p.type === 'hanger' })] },
    { t: 'Mount', f: [sel('mount', 'On the board', [['dovetail', 'Dovetail — slides into a base'], ['studs', 'Studs on the bar — one piece, older']]), sel('dove', 'Dovetail size', [['auto', 'Auto — by weight and reach'], ['S', 'S · 18 × 35 base, 2 studs'], ['M', 'M · 45 × 45 base, 4 studs'], ['L', 'L · 70 × 65 base, 6 studs']], { show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }), num('load', 'Weight it carries — 0 = the tool’s, or a typical one', { adv: true, min: 0, max: 10000, step: 10, unit: 'g', show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }),
      num('wire', 'Wire Ø — 0 = 5 mm on A, 7.5 on B', { adv: true, min: 0, max: 12, step: 0.5, unit: 'mm' }), int('rows', 'Stud rows', { min: 2, max: 5, show: (p) => p.mount === 'studs' }),
      num('drop', 'Arm lower by', { adv: true, min: 0, max: 60, step: 1, unit: 'mm' }), num('top', 'Bar above the top stud', { adv: true, min: 0, max: 30, step: 1, unit: 'mm', show: (p) => p.mount === 'studs' }),
      num('studLen', 'Stud length — 0 = board default', { adv: true, min: 0, max: 21, step: 0.5, unit: 'mm', show: (p) => p.mount === 'studs' })] },
    { t: 'Tool on it', f: [bool('tool.show', 'Show the tool'), sel('tool.kind', 'Tool shape', [['plier', 'Pliers / cutters'], ['rod', 'Screwdriver / rod'], ['spool', 'Spool'], ['box', 'Meter / box'], ['coil', 'Coil of cable']], { show: (p) => p.tool && p.tool.show }),
      num('tool.L', 'Tool length', { min: 10, max: 500, step: 1, unit: 'mm', show: (p) => p.tool && p.tool.show }), num('tool.W', 'Tool width', { min: 4, max: 300, step: 1, unit: 'mm', show: (p) => p.tool && p.tool.show }),
      num('tool.T', 'Tool thickness', { adv: true, min: 2, max: 300, step: 1, unit: 'mm', show: (p) => p.tool && p.tool.show })] },
    { t: 'Placement', f: [{ t: 'at' }] },
  ],
  mount: [
    { t: 'Saddle', f: [sel('orient', 'Tool sits', [['edge', 'on its edge, flat face to the board'], ['flat', 'lying flat']]), num('width', 'Width along the tool', { min: 6, max: 80, step: 1, unit: 'mm' }),
      num('hold', 'Walls rise to', { min: 0.3, max: 1, step: 0.05, unit: '× its height' }), num('clear', 'Clearance', { min: 0, max: 4, step: 0.1, unit: 'mm' }),
      num('lip', 'Front lip, higher by', { adv: true, min: 0, max: 20, step: 0.5, unit: 'mm' }), num('wallB', 'Back wall', { adv: true, min: 1.6, max: 10, step: 0.2, unit: 'mm' }), num('wallF', 'Front wall', { adv: true, min: 1.6, max: 10, step: 0.2, unit: 'mm' }), num('floor', 'Floor', { adv: true, min: 1.6, max: 10, step: 0.2, unit: 'mm' })] },
    { t: 'Mount', f: [sel('board', 'Board', [['A', 'Board A · Ø4.7 studs'], ['B', 'Board B · Ø7.65 studs']]), sel('mount', 'On the board', [['dovetail', 'Dovetail — slides into a base'], ['studs', 'Studs on a bar — one piece, older']]), sel('dove', 'Dovetail size', [['auto', 'Auto — by weight and reach'], ['S', 'S · 18 × 35 base, 2 studs'], ['M', 'M · 45 × 45 base, 4 studs'], ['L', 'L · 70 × 65 base, 6 studs']], { show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }), num('load', 'Weight it carries — 0 = the tool’s, or a typical one', { adv: true, min: 0, max: 10000, step: 10, unit: 'g', show: (p) => p.mount !== 'studs' && p.mount !== 'pins' }),
      int('rows', 'Stud rows', { min: 2, max: 5, show: (p) => p.mount === 'studs' }), num('wire', 'Wire Ø — 0 = 5 mm on A, 7.5 on B', { adv: true, min: 0, max: 12, step: 0.5, unit: 'mm', show: (p) => p.mount === 'studs' }),
      num('drop', 'Block lower by', { adv: true, min: 0, max: 60, step: 1, unit: 'mm' }), num('studLen', 'Stud length — 0 = board default', { adv: true, min: 0, max: 21, step: 0.5, unit: 'mm', show: (p) => p.mount === 'studs' })] },
    { t: 'Placement', f: [{ t: 'at' }] },
  ],
  box: [
    { t: 'Type', f: [sel('kind', 'Make', [['bin', 'Bin'], ['lidStack', 'Stackable lid (1U with lip)'], ['lidFlat', 'Flat lid']])] },
    { t: 'Size', f: [int('nx', 'Width', { min: 1, max: 8, unit: 'units' }), int('ny', 'Depth', { min: 1, max: 8, unit: 'units' }), int('U', 'Height', { min: 2, max: 30, unit: '× 7 mm', show: (p) => p.kind === 'bin' }),
      num('wall', 'Wall', { adv: true, min: 0.8, max: 2.4, step: 0.05, unit: 'mm', show: (p) => p.kind !== 'lidFlat' }), num('floorZ', 'Floor top', { adv: true, min: 5.2, max: 20, step: 0.1, unit: 'mm', show: (p) => p.kind === 'bin' }),
      num('deck', 'Deck', { adv: true, min: 0.8, max: 4, step: 0.1, unit: 'mm', show: (p) => p.kind === 'lidFlat' })] },
    { t: 'Lip and compartments', show: (p) => p.kind === 'bin', f: [sel('lip', 'Stacking lip', [['normal', 'Standard'], ['reduced', 'Reduced — no inner step'], ['none', 'None']]),
      int('divX', 'Compartments across', { min: 1, max: 16 }), int('divY', 'Compartments deep', { min: 1, max: 12 }), num('divH', 'Divider height', { adv: true, min: 20, max: 100, step: 5, unit: '%' })] },
    { t: 'Label and scoop', show: (p) => p.kind === 'bin', f: [sel('label', 'Label tab', [['off', 'None'], ['full', 'Full width'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
      num('labelW', 'Tab depth', { adv: true, min: 6, max: 20, step: 0.5, unit: 'mm', show: (p) => p.label !== 'off' }), num('labelLen', 'Tab length', { adv: true, min: 10, max: 160, step: 1, unit: 'mm', show: (p) => p.label !== 'off' && p.label !== 'full' }),
      bool('scoop', 'Scoop at the front'), num('scoopR', 'Scoop radius', { adv: true, min: 3, max: 30, step: 0.5, unit: 'mm', show: (p) => p.scoop })] },
    { t: 'Walls', show: (p) => p.kind === 'bin', f: [bool('cutout', 'Finger cut-out in the front'), num('cutoutW', 'Cut-out width', { adv: true, min: 10, max: 90, step: 5, unit: '%', show: (p) => p.cutout }), num('cutoutD', 'Cut-out depth', { adv: true, min: 3, max: 120, step: 1, unit: 'mm', show: (p) => p.cutout }),
      sel('pattern', 'See-through hex walls', [['off', 'Off'], ['all', 'All walls'], ['sides', 'Sides only'], ['front', 'Front only']]), num('patR', 'Hex size', { adv: true, min: 2.5, max: 10, step: 0.5, unit: 'mm', show: (p) => p.pattern !== 'off' }), num('patGap', 'Hex gap', { adv: true, min: 1, max: 5, step: 0.1, unit: 'mm', show: (p) => p.pattern !== 'off' })] },
    { t: 'Feet', f: [sel('magnets', 'Magnets', MAG), bool('magCorners', 'Outer corners only', { adv: true, show: (p) => p.magnets !== 'off' || p.screws }), bool('screws', 'M3 screw holes', { adv: true })] },
    { t: 'Place on', show: (p) => p.kind !== 'lidFlat', f: [{ t: 'on' }] },
  ],
  desk: [
    { t: 'Make', f: [sel('kind', 'Make', G.DESK_KINDS), sel('base', 'Bottom', [['flat', 'Flat — stands on the desk'], ['grid', 'Gridfinity feet — on a shelf, plate or drawer']], { show: (p) => !NO_BASE.includes(p.kind) })] },
    { t: 'Footprint', show: kindIs(...STACKED), f: [int('nx', 'Width', { min: 1, max: 7, unit: 'units' }), int('ny', 'Depth', { min: 1, max: 6, unit: 'units' }), { t: 'stackfoot' }] },
    { t: 'Layers', show: kindIs('stack'), f: [text('layers', 'Drawer units, bottom up — height × drawers, e.g. 60 x2, 40'), bool('caddy', 'Caddy on top')] },
    { t: 'Drawer unit', show: kindIs('drawers'), f: [num('H', 'Height', { min: 24, max: 300, step: 1, unit: 'mm' }), int('n', 'Drawers side by side', { min: 1, max: 6 }), bool('pocket', 'Pocket on top for the next layer', { adv: true })] },
    { t: 'Drawers', show: kindIs('drawers', 'stack'), f: [int('cx', 'Compartments across', { min: 1, max: 8 }), int('cy', 'Front to back', { min: 1, max: 6 }), num('scoop', 'Scoop at the front — radius, 0 = none', { min: 0, max: 30, step: 1, unit: 'mm' }), num('pull', 'Finger pull — width, 0 = none', { min: 0, max: 120, step: 1, unit: 'mm' }), bool('label', 'Label recess on the front'),
      text('cols', 'Widths across as ratios, e.g. 2 1 — replaces Across', { adv: true }), num('div', 'Divider', { adv: true, min: 0.8, max: 3, step: 0.1, unit: 'mm' })] },
    { t: 'Caddy', show: (p) => p.kind === 'caddy' || (p.kind === 'stack' && p.caddy !== false), f: [num('frontH', 'Front height', { min: 16, max: 300, step: 1, unit: 'mm' }), num('H', 'Back height', { min: 20, max: 300, step: 1, unit: 'mm' }),
      text('inserts', 'Inserts left to right — pens, markers, scissors, rulers, postits (2 wide), bin', { show: kindIs('stack') })] },
    { t: 'Finish', show: kindIs(...STACKED), f: [bool('flutes', 'Fluted outside')] },
    { t: 'Size', show: (p) => !NO_BASE.includes(p.kind), f: [num('W', 'Width', { min: 20, max: 320, step: 1, unit: 'mm', show: (p) => !isGrid(p) && p.kind !== 'cup' }), num('D', 'Depth', { min: 20, max: 320, step: 1, unit: 'mm', show: (p) => !isGrid(p) && !['cup', 'sorter'].includes(p.kind) }),
      num('H', 'Height', { min: 8, max: 300, step: 1, unit: 'mm', show: (p) => !isGrid(p) && p.kind !== 'sorter' }),
      int('nx', 'Width', { min: 1, max: 8, unit: 'units', show: isGrid }), int('ny', 'Depth', { min: 1, max: 8, unit: 'units', show: isGrid }), int('U', 'Height', { min: 2, max: 40, unit: '× 7 mm', show: (p) => isGrid(p) && p.kind !== 'sorter' }),
      num('r', 'Corner radius', { adv: true, min: 0.5, max: 40, step: 0.5, unit: 'mm', show: (p) => !isGrid(p) && !['cup', 'sorter'].includes(p.kind) }),
      num('wall', 'Wall', { adv: true, min: 0.8, max: 6, step: 0.1, unit: 'mm' }), num('floor', 'Floor', { adv: true, min: 0.8, max: 6, step: 0.1, unit: 'mm', show: (p) => p.kind !== 'slots' })] },
    { t: 'Compartments', show: kindIs('tray', 'bin'), f: [int('cx', 'Across', { min: 1, max: 12 }), int('cy', 'Front to back', { min: 1, max: 8 }), num('divDrop', 'Dividers lower than the rim by', { min: 0, max: 60, step: 1, unit: 'mm', show: (p) => p.cx > 1 || p.cy > 1 || !!String(p.cols || '').trim() }),
      text('cols', 'Widths across as ratios, e.g. 2 1 1 — replaces Across', { adv: true }), num('div', 'Divider', { adv: true, min: 0.8, max: 4, step: 0.1, unit: 'mm' })] },
    { t: 'Angles', show: kindIs('tray', 'bin'), f: [num('frontH', 'Front height — 0 keeps the top level', { min: 0, max: 300, step: 1, unit: 'mm' }), num('slopeTo', 'Top reaches full height at', { min: 0.15, max: 1, step: 0.05, unit: '× depth', show: (p) => p.frontH > 0 }),
      num('tilt', 'Floor tilts down to the front', { min: 0, max: 35, step: 1, unit: '°' })] },
    { t: 'Scoops and grips', show: kindIs('tray', 'bin'), f: [num('scoop', 'Scoop at the front — radius, 0 = none', { min: 0, max: 40, step: 1, unit: 'mm' }), num('notch', 'Grab notch in the front — width, 0 = none', { min: 0, max: 150, step: 1, unit: 'mm' }), bool('label', 'Label recess on the front'),
      num('notchD', 'Notch depth — 0 = half its width', { adv: true, min: 0, max: 100, step: 1, unit: 'mm', show: (p) => p.notch > 0 }), num('labelW', 'Label width — 0 = 60 % of the front', { adv: true, min: 0, max: 300, step: 1, unit: 'mm', show: (p) => p.label }), num('labelH', 'Label height', { adv: true, min: 6, max: 40, step: 1, unit: 'mm', show: (p) => p.label })] },
    { t: 'Cup', show: kindIs('cup'), f: [sel('shape', 'Shape', [['round', 'Round'], ['hex', 'Hex'], ['square', 'Rounded square']]), num('dia', 'Size — Ø, or across the flats', { min: 20, max: 300, step: 1, unit: 'mm' }), num('slant', 'Top drops to the front by', { min: 0, max: 100, step: 1, unit: 'mm' }),
      sel('dividers', 'Dividers', [['none', 'None'], ['half', 'One, across'], ['cross', 'Cross']]), num('divDrop', 'Dividers under the rim by', { adv: true, min: 0, max: 100, step: 1, unit: 'mm', show: (p) => p.dividers !== 'none' }), num('div', 'Divider', { adv: true, min: 0.8, max: 3, step: 0.1, unit: 'mm', show: (p) => p.dividers !== 'none' })] },
    { t: 'Slots', show: kindIs('slots'), f: [int('n', 'Slots', { min: 1, max: 60 }), num('gap', 'Slot width', { min: 0.6, max: 60, step: 0.1, unit: 'mm' }), num('pitch', 'Centre to centre — 0 = width + 2.4', { min: 0, max: 120, step: 0.1, unit: 'mm' }),
      num('depth', 'Slot depth — 0 = 70 % of the height', { min: 0, max: 300, step: 0.5, unit: 'mm' }), num('lean', 'Lean back', { min: 0, max: 30, step: 1, unit: '°' }), bool('round', 'Round bottoms'), num('rise', 'Top steps down to the front by', { min: 0, max: 100, step: 1, unit: 'mm' }),
      num('notch', 'Finger channel across them — width, 0 = none', { min: 0, max: 200, step: 1, unit: 'mm' }), num('notchD', 'Channel depth — 0 = half the slot depth', { adv: true, min: 0, max: 200, step: 0.5, unit: 'mm', show: (p) => p.notch > 0 }), num('endWall', 'End walls', { adv: true, min: 1.6, max: 20, step: 0.2, unit: 'mm' })] },
    { t: 'Sorter', show: kindIs('sorter'), f: [int('n', 'Slots', { min: 1, max: 12 }), num('gap', 'Slot width', { min: 5, max: 150, step: 1, unit: 'mm' }), num('frontH', 'Front divider height', { min: 15, max: 300, step: 1, unit: 'mm' }), num('step', 'Each divider taller by', { min: 0, max: 100, step: 1, unit: 'mm' }),
      num('lean', 'Lean back', { min: 0, max: 25, step: 1, unit: '°' }), num('notch', 'Finger notch in each divider — width, 0 = none', { min: 0, max: 200, step: 1, unit: 'mm' }), bool('sides', 'Side walls'),
      text('gaps', 'Each slot front to back, e.g. 20 30 40 — replaces Slots', { adv: true }), num('div', 'Divider thickness', { adv: true, min: 1.2, max: 6, step: 0.1, unit: 'mm' }), num('D', 'Depth at least', { adv: true, min: 0, max: 320, step: 1, unit: 'mm', show: (p) => !isGrid(p) })] },
    { t: 'Stand', show: kindIs('stand'), f: [num('W', 'Width', { min: 20, max: 300, step: 1, unit: 'mm' }), num('angle', 'Lean back', { min: 5, max: 40, step: 1, unit: '°' }), num('H', 'Back rest length', { min: 20, max: 300, step: 1, unit: 'mm' }),
      num('slot', 'Slot — the device’s thickness + 1', { min: 2, max: 40, step: 0.5, unit: 'mm' }), num('lip', 'Front lip height', { min: 2, max: 40, step: 0.5, unit: 'mm' }), num('cable', 'Cable funnel — width, 0 = none', { min: 0, max: 40, step: 1, unit: 'mm' }),
      num('thick', 'Thickness', { adv: true, min: 2.4, max: 10, step: 0.2, unit: 'mm' }), bool('brace', 'Strut behind the rest', { adv: true }), num('D', 'Base depth at least', { adv: true, min: 0, max: 300, step: 1, unit: 'mm' })] },
    { t: 'Bottom', show: (p) => !NO_BASE.includes(p.kind), f: [bool('pads', 'Recesses for stick-on bumpers', { show: (p) => !isGrid(p) }), sel('magnets', 'Magnets', MAG, { show: isGrid }), bool('magCorners', 'Outer corners only', { adv: true, show: (p) => isGrid(p) && p.magnets !== 'off' })] },
    { t: 'Place on', show: isGrid, f: [{ t: 'on' }] },
  ],
  drawer: [
    { t: 'Drawer', f: [sel('sizing', 'Size from', [['drawer', 'Drawer inside'], ['cells', 'Cell count']]),
      num('W', 'Inside width', { min: 42, max: 2000, step: 1, unit: 'mm', show: (p) => p.sizing === 'drawer' }), num('D', 'Inside depth', { min: 42, max: 2000, step: 1, unit: 'mm', show: (p) => p.sizing === 'drawer' }),
      num('H', 'Inside height', { min: 10, max: 400, step: 1, unit: 'mm', show: (p) => p.sizing === 'drawer' }), num('clear', 'Fit clearance, total', { adv: true, min: 0, max: 5, step: 0.1, unit: 'mm', show: (p) => p.sizing === 'drawer' }),
      sel('alignX', 'Grid sits', [['center', 'Centred'], ['left', 'Left'], ['right', 'Right']], { show: (p) => p.sizing === 'drawer' }), sel('alignY', 'Front to back', [['center', 'Centred'], ['front', 'Front'], ['back', 'Back']], { show: (p) => p.sizing === 'drawer' }),
      int('nx', 'Width', { min: 1, max: 40, unit: 'units', show: (p) => p.sizing === 'cells' }), int('ny', 'Depth', { min: 1, max: 40, unit: 'units', show: (p) => p.sizing === 'cells' }), num('rim', 'Rim', { adv: true, min: 0, max: 30, step: 0.5, unit: 'mm', show: (p) => p.sizing === 'cells' })] },
    { t: 'Plate', f: [sel('style', 'Style', [['frame', 'Open frame — lightest'], ['solid', 'Solid floor'], ['magnets', 'Magnet pockets']]), sel('magStyle', 'Pocket style', MAG.slice(1), { adv: true, show: (p) => p.style === 'magnets' }),
      bool('screws', 'Countersunk screw in each cell', { show: (p) => p.style !== 'frame' }), num('cornerR', 'Outer corner radius', { adv: true, min: 0, max: 20, step: 0.5, unit: 'mm', show: (p) => p.sizing === 'drawer' })] },
  ],
  fit: [
    { t: 'Coupons', f: [bool('socket', '1 × 1 socket'), bool('foot', '1 × 1 foot'), bool('ladderA', 'Stud ladder · Board A'), bool('ladderB', 'Stud ladder · Board B'), bool('dove', 'Dovetail · S base + 5 tongue stubs'), bool('holesA', 'Pin-hole strip · Board A'), bool('holesB', 'Pin-hole strip · Board B'),
      num('step', 'Step between sizes', { adv: true, min: 0.02, max: 0.2, step: 0.01, unit: 'mm' })] },
  ],
  base: [
    { t: 'Bases', f: [sel('board', 'Board', [['A', 'Board A · Ø4.7 studs'], ['B', 'Board B · Ø7.65 studs']]), sel('dove', 'Size', [['S', 'S · 18 × 35, 2 studs — hooks, light saddles'], ['M', 'M · 45 × 45, 4 studs — shelves, spool rods, cradles'], ['L', 'L · 70 × 65, 6 studs — heavy or tall parts']]), int('count', 'How many', { min: 1, max: 24 })] },
  ],
  pins: [
    { t: 'Pins', f: [sel('board', 'Board', [['A', 'Board A · Ø4.7'], ['B', 'Board B · Ø7.65']]), int('count', 'How many', { min: 1, max: 80 }), num('length', 'Length', { min: 8, max: 40, step: 0.5, unit: 'mm' }), num('pinD', 'Ø — 0 uses the stud size', { adv: true, min: 0, max: 9, step: 0.01, unit: 'mm' })] },
  ],
};

// Trace and Scan live inside Tools: you reach them from a tool (or Tools → Trace a sheet / Open a scan)
const TABS = [{ id: 'workspace', label: 'Bench' }, { id: 'tools', label: 'Tools' }, { id: 'make', label: 'Make' }, 'sep', { id: 'plan', label: 'Print' }, { id: 'rules', label: 'Rules' }];
const UNDER_TOOLS = ['tools', 'trace', 'scan'];

// dovetail bases on a board map: the plate, dashed, with its groove
function baseRects(pl) {
  if (!pl || !pl.bases) return '';
  return pl.bases.map((q) => { const D = q.D, x0 = q.cx - D.W / 2; return `<rect x="${x0}" y="${q.top}" width="${D.W}" height="${D.H}" rx="3" fill="var(--sheet)" stroke="var(--ink)" stroke-opacity=".55" stroke-dasharray="3 2" stroke-width=".8"/><rect x="${q.cx - D.rw}" y="${q.top}" width="${2 * D.rw}" height="${D.H - 4}" fill="var(--ink)" fill-opacity=".14"/>`; }).join('');
}

// ---------- derived placement (pure, no geometry) ----------
const dcache = new Map();
function derive(item) {
  const key = item.mode + JSON.stringify(item.p) + JSON.stringify(S.settings.bed);
  const hit = dcache.get(item.id);
  if (hit && hit.key === key) return hit.v;
  const p = item.p;
  let v = { type: 'other' };
  if (item.mode === 'shelf') {
    const d = G.shelfDims(p), pl = wallPlacement('shelf', p);
    v = { type: 'shelf', board: p.board, ...d, pl, off: pl.off, nx: p.nx, ny: p.ny };
  } else if (item.mode === 'table') {
    const d = G.tablePlateDims(p);
    v = { type: 'table', board: 'T', ...d, pl: BD.placeTablePlate(BD.BOARDS.T, { W: d.Wt, D: d.Dt, rim: d.rim, nx: p.nx, ny: p.ny, winBottom: d.winBottom }, p.at, p.maxStuds), nx: p.nx, ny: p.ny };
  } else if (hooky(item.mode)) {
    const b = BD.BOARDS[p.board], hd = G.hookDims(p, b), pl = wallPlacement(item.mode, p);
    // how far down the board the part reaches: last stud (+ drop) on studs; the tab's foot on a dovetail
    const bottom = pl.dove ? pl.ay + 1 + pl.D.L + (p.drop || 0) + hd.r : pl.studs[pl.studs.length - 1].y + (p.drop || 0);
    v = { type: 'hook', board: p.board, hd, pl, off: pl.off, bottom };
  } else if (item.mode === 'drawer') {
    const plan = drawerPlan(p, S.settings.bed);
    v = { type: 'drawer', plan, nx: plan.nx, ny: plan.ny };
  } else if (item.mode === 'desk') {
    if (STACKED.includes(p.kind)) { const ls = p.kind === 'stack' ? String(p.layers || '').split(',').map((t) => parseFloat(t)).filter((v) => v > 0) : []; const Ht = p.kind === 'drawers' ? p.H : p.kind === 'caddy' ? p.H : ls.reduce((a, b) => a + b - 1.9, 0) + (p.caddy !== false ? p.H - 1.9 : 1.9); dcache.set(item.id, { key, v: { type: 'desk', H: Ht } }); return { type: 'desk', H: Ht }; }
    const H = p.kind === 'sorter' ? (p.frontH || 60) + (((p.gaps && String(p.gaps).trim()) ? String(p.gaps).split(/[,\s]+/).filter(Boolean).length : p.n) * (p.step ?? 20)) : p.base === 'grid' ? 7 * p.U : p.kind === 'stand' ? (p.H || 90) : p.H;
    v = onable(item) ? { type: 'bin', nx: p.nx, ny: p.ny, H, above: p.above || 0, below: 0 } : { type: 'desk', H };
  } else if (item.mode === 'holder' || item.mode === 'box') {
    const H = item.mode === 'box' ? (p.kind === 'bin' ? 7 * p.U + (p.lip !== 'none' ? 3.8 : 0) : p.kind === 'lidStack' ? 10.8 : 4.75 + (p.deck || 1.6)) : 7 * p.U;
    v = { type: 'bin', nx: p.nx, ny: p.ny, H, above: p.above || 0, below: p.below || 0 };
  }
  dcache.set(item.id, { key, v });
  return v;
}
const isMount = (it) => ['shelf', 'table', 'drawer'].includes(it.mode);
// parts that sit in a mount's cells: bins, holders, and desk organisers on Gridfinity feet
const onable = (it) => it.mode === 'box' || it.mode === 'holder' || (it.mode === 'desk' && it.p && it.p.base === 'grid' && !['stand', 'drawers', 'caddy', 'stack'].includes(it.p.kind));
const hooky = (mode) => mode === 'hook' || mode === 'mount';
// where a bin sits on its mount; null if not placed
function binSpot(item) {
  const on = item.p.on;
  if (!on || !on.mount) return null;
  const m = itemById(on.mount);
  if (!m || !isMount(m)) return null;
  const dm = derive(m), nxb = item.p.nx, nyb = item.p.ny, a = on.a | 0, c = on.c | 0;
  const fits = a >= 0 && c >= 0 && a + nxb <= dm.nx && c + nyb <= dm.ny;
  if (dm.type === 'shelf') {
    const x0 = dm.pl.bx + dm.rim + 42 * a + 0.25;
    return { mount: m, dm, kind: 'wall', board: dm.board, x0, x1: x0 + 42 * nxb - 0.5, yBottom: dm.pl.by + dm.Hb - (dm.Tf - 4.9), yShelfBottom: dm.pl.by + dm.Hb, c, fits };
  }
  if (dm.type === 'table') {
    const x0 = dm.pl.bx + dm.rim + 42 * a + 0.25, y0 = dm.pl.by + dm.rim + 42 * c + 0.25;
    return { mount: m, dm, kind: 'table', x0, y0, x1: x0 + 42 * nxb - 0.5, y1: y0 + 42 * nyb - 0.5, fits };
  }
  if (dm.type === 'drawer') {
    const pl = dm.plan, x0 = pl.pad.L + 42 * a + 0.25, y0 = pl.pad.B + 42 * c + 0.25;
    return { mount: m, dm, kind: 'drawer', x0, y0, x1: x0 + 42 * nxb - 0.5, y1: y0 + 42 * nyb - 0.5, fits };
  }
  return null;
}
function mountLabel(m) {
  const dm = derive(m);
  const where = m.mode === 'shelf' ? `Board ${m.p.board}` : m.mode === 'table' ? 'Table' : 'Drawer';
  return `${where} · ${m.name} (${dm.nx} × ${dm.ny})`;
}

// workspace-level checks: placement, clearance lines, overlaps
function workspaceChecks() {
  const out = [];
  for (const it of S.items) {
    const d = derive(it);
    if (d.type === 'shelf' || d.type === 'table') for (const w of d.pl.warnings) out.push({ it, msg: w });
    if (d.type === 'drawer') for (const w of d.plan.warn) out.push({ it, msg: w });
    if (d.type === 'hook') {
      for (const w of d.pl.warnings) out.push({ it, msg: w });
      const b = BD.BOARDS[d.board];
      const bottom = d.bottom + 4 + (it.p.tool && it.p.tool.show ? (it.p.tool.kind === 'box' ? 0 : it.p.tool.L * 0.75) : 0);
      const bay = BD.bayAt(b, d.pl.ax);
      if (bay && bottom > bay.clear) out.push({ it, msg: `the tool hangs to y ${f0(bottom)}, below ${bay.label}’s clearance line at y ${bay.clear}` });
      for (const ln of b.lines) if (ln.y > 900 && bottom > ln.y) out.push({ it, msg: `the tool hangs to y ${f0(bottom)}, below the y ${ln.y} line` });
    }
    if (d.type === 'bin' && it.p.on && it.p.on.mount) {
      const sp = binSpot(it);
      if (!sp) { out.push({ it, msg: 'placed on a mount that no longer exists' }); continue; }
      if (!sp.fits) out.push({ it, msg: `doesn’t fit on ${sp.mount.name} at column ${it.p.on.a + 1}, row ${it.p.on.c + 1}` });
      if (sp.kind === 'wall') {
        const b = BD.BOARDS[sp.board];
        const top = sp.yBottom - d.H - d.above, bottom = d.below ? sp.yShelfBottom + d.below : sp.yShelfBottom;
        const bay = BD.bayAt(b, (sp.x0 + sp.x1) / 2);
        if (bay && bottom > bay.clear) out.push({ it, msg: `tools reach y ${f0(bottom)}, below ${bay.label}’s clearance line at y ${bay.clear}` });
        for (const ln of b.lines) if (ln.y > 900 && bottom > ln.y) out.push({ it, msg: `tools reach y ${f0(bottom)}, below the y ${ln.y} line` });
        if (top < 0) out.push({ it, msg: 'tools stand above the top of the board' });
      }
    }
  }
  // bins sharing cells on the same mount
  const byMount = new Map();
  for (const it of S.items) if (it.p.on && it.p.on.mount && onable(it)) {
    const k = it.p.on.mount; if (!byMount.has(k)) byMount.set(k, []); byMount.get(k).push(it);
  }
  for (const list of byMount.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i].p, B = list[j].p;
    if (A.on.a < B.on.a + B.nx && B.on.a < A.on.a + A.nx && A.on.c < B.on.c + B.ny && B.on.c < A.on.c + A.ny) out.push({ it: list[j], msg: `overlaps ${list[i].name} on the same mount` });
  }
  // shelves overlapping on a board
  const shelves = S.items.filter((i) => i.mode === 'shelf');
  for (let i = 0; i < shelves.length; i++) for (let j = i + 1; j < shelves.length; j++) {
    const a = derive(shelves[i]), b = derive(shelves[j]);
    if (a.board !== b.board) continue;
    if (a.pl.bx < b.pl.bx + b.Wt && b.pl.bx < a.pl.bx + a.Wt && a.pl.by < b.pl.by + b.Hb && b.pl.by < a.pl.by + a.Hb) out.push({ it: shelves[j], msg: `back plate overlaps ${shelves[i].name}` });
  }
  const hooks = S.items.filter((i) => hooky(i.mode) || i.mode === 'shelf');
  const rects = (d) => (d.pl.bases || []).map((q) => ({ x0: q.cx - q.D.W / 2, x1: q.cx + q.D.W / 2, y0: q.top, y1: q.top + q.D.H }));
  for (let i = 0; i < hooks.length; i++) for (let j = i + 1; j < hooks.length; j++) {
    const A = derive(hooks[i]), B = derive(hooks[j]);
    if (A.board !== B.board) continue;
    if (A.pl.studs.some((s) => B.pl.studs.some((t) => t.i === s.i && t.j === s.j))) { out.push({ it: hooks[j], msg: `shares a hole with ${hooks[i].name}` }); continue; }
    const ra = rects(A), rb = rects(B);
    if (ra.some((a) => rb.some((b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5))) out.push({ it: hooks[j], msg: `its base overlaps ${hooks[i].name}’s — move one a step` });
  }
  // weight: what each hook or saddle carries against what it holds, and the tools on each shelf, plate and drawer
  const toolG = (it) => forOf(it.for).reduce((a, f) => { const t = tool(f.id); return a + (t && t.g ? t.g * f.n : 0); }, 0);
  for (const it of S.items) if (hooky(it.mode)) { const g = toolG(it); if (g) { const c = capOf(it.p); if (g > c * 0.8) out.push({ it, msg: `carries ${f0(g)} g — near or over the ${f0(c)} g it’s good for; shorter reach, more stud rows or a U-hook` }); } }
  for (const m of S.items.filter(isMount)) {
    const g = S.items.filter((x) => x.p.on && x.p.on.mount === m.id).reduce((a, x) => a + toolG(x), 0); if (!g) continue;
    const lim = m.mode === 'shelf' ? (m.p.board === 'B' ? 3000 : 1500) : 8000;
    out.push({ it: m, note: g <= lim, msg: g <= lim ? `carries ${f0(g)} g of tools` : m.p.mount === 'pins' ? `carries ${f0(g)} g of tools — heavy for printed pins: glue them, or use 3/16″ steel rod` : `carries ${f0(g)} g of tools — set the weight under Mount so the bases are sized for it` });
  }
  const plates = S.items.filter((i) => i.mode === 'table');
  for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) {
    const a = derive(plates[i]), b = derive(plates[j]);
    if (a.pl.bx < b.pl.bx + b.Wt && b.pl.bx < a.pl.bx + a.Wt && a.pl.by < b.pl.by + b.Dt && b.pl.by < a.pl.by + a.Dt) out.push({ it: plates[j], msg: `overlaps ${plates[i].name} on the table` });
  }
  return out;
}

// ---------- geometry → three ----------
// print view: faces coloured by the print check's classes — 50–65° light orange, past 65° red, flat ceilings amber
const SHADE = [null, [0.94, 0.70, 0.48], [0.90, 0.33, 0.18], [0.95, 0.64, 0.23]];
function geoShaded(m) {
  const { pos, idx } = G.meshOf(m);
  const { cls } = PC.classify(pos, idx);
  const base = new THREE.Color(css('--part') || '#c9cbcc');
  const P = new Float32Array(idx.length * 3), C = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i] * 3, c = SHADE[cls[(i / 3) | 0]];
    P[3 * i] = pos[v]; P[3 * i + 1] = pos[v + 1]; P[3 * i + 2] = pos[v + 2];
    C[3 * i] = c ? c[0] : base.r; C[3 * i + 1] = c ? c[1] : base.g; C[3 * i + 2] = c ? c[2] : base.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeVertexNormals(); g.computeBoundingBox();
  return g;
}
function geoFrom(m) {
  const { pos, idx } = G.meshOf(m);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const ng = g.toNonIndexed(); g.dispose();
  ng.computeVertexNormals();
  ng.computeBoundingBox();
  return ng;
}

class Viewer {
  constructor(far = 12000) {
    this.el = document.createElement('div');
    this.el.className = 'viewer card';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, far);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(200, -400, 260);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 1.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.5); d1.position.set(-0.6, -1, 1.4); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.55); d2.position.set(1, 0.8, 0.6); this.scene.add(d2);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.render();
  }
  clear() {
    this.root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && !o.userData.sharedMat) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
  }
  frame(box, dir = [0.55, -1, 0.62], pad = 1.25) {
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const v = new THREE.Vector3(...dir).normalize();
    const vf = (this.camera.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    // project the box onto the view plane: horizontal extent across the view, vertical extent up the view
    const right = new THREE.Vector3().crossVectors(v, new THREE.Vector3(0, 0, 1)).normalize();
    const up = new THREE.Vector3().crossVectors(right, v).normalize();
    let hx = 0, hy = 0, hz = 0;
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
      const q = new THREE.Vector3(s.x * sx, s.y * sy, s.z * sz);
      hx = Math.max(hx, Math.abs(q.dot(right))); hy = Math.max(hy, Math.abs(q.dot(up))); hz = Math.max(hz, Math.abs(q.dot(v)));
    }
    const dist = (Math.max(hx / Math.tan(hf), hy / Math.tan(vf)) + hz) * pad + 10;
    this.camera.position.copy(c.clone().add(v.multiplyScalar(dist)));
    this.camera.near = Math.max(0.5, dist / 300); this.camera.far = dist * 20; this.camera.updateProjectionMatrix();
    this.controls.target.copy(c); this.controls.update(); this.render();
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
const MAT = {};
function mats() {
  const part = new THREE.Color(css('--part') || '#c9cbcc');
  MAT.part = new THREE.MeshStandardMaterial({ color: part, roughness: 0.82, metalness: 0 });
  MAT.mount = new THREE.MeshStandardMaterial({ color: part.clone().offsetHSL(0, 0, 0.06), roughness: 0.85 });
  MAT.sel = new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--signal') || '#ff5a1f'), roughness: 0.7 });
  MAT.shade = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82 });
  MAT.edge = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink') || '#14161a'), transparent: true, opacity: 0.28 });
  Object.values(MAT).forEach((m) => { m.userData = { shared: true }; });
}
function meshOf(geo, mat, edges = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); m.userData.sharedMat = true; g.add(m);
  if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), MAT.edge); e.userData.sharedMat = true; g.add(e); }
  return g;
}

// ---------- engine ----------
let ED = null, WS = null;
const wcache = new Map(); // item.id → {key, geos:[{geo, key}], parts:[{name, size, mass, bed}], warnings, info}
const settingsKey = () => JSON.stringify(S.settings.tol) + JSON.stringify(S.settings.bed);
function buildItem(item) {
  const key = item.mode + JSON.stringify(item.p) + settingsKey();
  const hit = wcache.get(item.id);
  if (hit && hit.key === key) return hit;
  if (hit) hit.geos.forEach((g) => g.geo.dispose());
  let res, out;
  try {
    res = build(item.mode, item.p, S.settings);
    out = { key, geos: res.parts.filter((p) => !p.secondary || p.assembled).map((p) => ({ geo: geoFrom(p.view), part: p.key, pos: p.pos || null, assembled: !!p.assembled })),
      parts: res.parts.map((p) => ({ name: p.name, key: p.key, size: p.stats.size, mass: p.mass, bed: p.bed, secondary: !!p.secondary, check: p.check ? { ok: p.check.ok, summary: p.check.summary } : null, orient: p.orient, count: p.count || 1 })), warnings: res.warnings, info: res.info,
      dims: res.dims && !res.dims.tiles ? JSON.parse(JSON.stringify(res.dims)) : null };
  } catch (e) {
    out = { key, geos: [], parts: [], warnings: [`couldn’t build: ${e.message || e}`], info: [] };
  } finally { if (res) freeParts(res); }
  wcache.set(item.id, out);
  return out;
}

// ---------- maps (SVG) ----------
const holeCache = new Map();
function holesD(b) {
  if (holeCache.has(b.id)) return holeCache.get(b.id);
  const r = b.id === 'B' ? 3.8 : 2.5;
  let ok = '', ng = '';
  for (const h of BD.allHoles(b)) {
    const s = `M${(h.x - r).toFixed(1)} ${h.y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    if (h.nogo) ng += s; else ok += s;
  }
  const v = { ok, ng }; holeCache.set(b.id, v); return v;
}
const SVGSTYLE = `<style>.lbl{font:500 12px var(--mono);fill:var(--mute)}.lbl.warn{fill:var(--warn)}.zid{font:600 13px var(--mono);fill:var(--ink);opacity:.7}.zt{font:400 10px var(--display);fill:var(--ink);opacity:.55}.nm{font:500 11px var(--display);fill:var(--ink)}.hit{cursor:pointer}</style>`;

// items to draw: saved items, with the editor's draft swapped in
function mapItems(draft) {
  const list = S.items.map((it) => (draft && draft.itemId === it.id ? { ...it, p: draft.p, name: draft.name, _draft: true } : it));
  if (draft && !draft.itemId && draft.row && draft.row.length > 1) draft.row.forEach((r, k) => { const t = tool(r.tool); list.push({ id: `__draft${k}`, mode: draft.mode, name: t ? shortName(t) : `Hook ${k + 1}`, p: r.p, _draft: k === draft.rowSel, _rowDraft: true }); });
  else if (draft && !draft.itemId) list.push({ id: '__draft', mode: draft.mode, name: draft.name || 'New', p: draft.p, _draft: true });
  return list;
}
function withItems(list, fn) { const keep = S.items; S.items = list; dcache.clear(); try { return fn(); } finally { S.items = keep; dcache.clear(); } }

function binRects(list, mountId, sel) {
  let s = '';
  for (const it of list) {
    if (!onable(it) || !it.p.on || it.p.on.mount !== mountId) continue;
    const sp = binSpot(it); if (!sp) continue;
    const d = derive(it), hl = it.id === sel || it._draft;
    const stroke = hl ? 'var(--signal)' : 'var(--ink)', sw = hl ? 2 : 0.8;
    if (sp.kind === 'wall') {
      const yT = sp.yBottom - d.H;
      s += `<g class="hit" data-id="${it.id}"><rect x="${sp.x0}" y="${yT}" width="${sp.x1 - sp.x0}" height="${d.H}" fill="var(--part)" fill-opacity="${sp.c > 0 ? 0.5 : 0.92}" stroke="${sp.fits ? stroke : 'var(--warn)'}" stroke-width="${sw}"/>`;
      if (d.above) s += `<rect x="${sp.x0 + 3}" y="${yT - d.above}" width="${sp.x1 - sp.x0 - 6}" height="${d.above}" fill="none" stroke="${stroke}" stroke-opacity=".5" stroke-dasharray="5 4"/>`;
      if (d.below) s += `<rect x="${sp.x0 + 3}" y="${sp.yShelfBottom}" width="${sp.x1 - sp.x0 - 6}" height="${d.below}" fill="none" stroke="${stroke}" stroke-opacity=".5" stroke-dasharray="5 4"/>`;
      s += `<title>${esc(it.name)} · ${it.p.nx} × ${it.p.ny}${it.mode === 'box' && it.p.kind === 'bin' ? ` × ${it.p.U}U` : ''}</title></g>`;
    } else {
      s += `<g class="hit" data-id="${it.id}"><rect x="${sp.x0}" y="${sp.y0}" width="${sp.x1 - sp.x0}" height="${sp.y1 - sp.y0}" rx="3.75" fill="var(--part)" fill-opacity=".92" stroke="${sp.fits ? stroke : 'var(--warn)'}" stroke-width="${sw}"/>`;
      s += `<text x="${(sp.x0 + sp.x1) / 2}" y="${(sp.y0 + sp.y1) / 2 + 4}" text-anchor="middle" class="nm">${esc(it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name)}</text><title>${esc(it.name)}</title></g>`;
    }
  }
  return s;
}

function boardSVG(boardId, { draft = null, sel = S.sel } = {}) {
  const b = BD.BOARDS[boardId];
  const list = mapItems(draft);
  return withItems(list, () => {
    const pad = 24;
    let s = `<svg viewBox="${-pad} ${-pad - 16} ${b.w + 2 * pad} ${b.h + 2 * pad + 16}" xmlns="http://www.w3.org/2000/svg" data-board="${boardId}" role="img" aria-label="${esc(b.name)} map">${SVGSTYLE}`;
    s += `<rect x="0" y="0" width="${b.w}" height="${b.h}" rx="3" fill="var(--wood)"/>`;
    for (const [a, c] of b.battens) s += `<rect x="${a}" y="0" width="${c - a}" height="${b.h}" fill="var(--wood-ink)" opacity=".13"/>`;
    const H = holesD(b);
    s += `<path d="${H.ok}" fill="var(--wood-ink)" opacity=".55"/><path d="${H.ng}" fill="var(--wood-ink)" opacity=".15"/>`;
    for (const k of b.bays) {
      s += `<text x="${k.x0 + 4}" y="-8" class="lbl">${k.label}</text>`;
      s += `<line x1="${k.x0}" x2="${k.x1}" y1="${k.clear}" y2="${k.clear}" stroke="var(--warn)" stroke-dasharray="9 6" stroke-width="1.4"/><text x="${k.x1 - 4}" y="${k.clear - 5}" text-anchor="end" class="lbl warn">clear below y ${k.clear}</text>`;
    }
    for (const ln of b.lines) s += `<line x1="0" x2="${b.w}" y1="${ln.y}" y2="${ln.y}" stroke="var(--warn)" stroke-dasharray="9 6" stroke-width="1.4"/><text x="${b.w - 4}" y="${ln.y - 5}" text-anchor="end" class="lbl warn">y ${ln.y} · ${esc(ln.t)}</text>`;
    for (const z of b.zones) {
      const dash = z.item ? '4 4' : z.clear ? '2 5' : 'none';
      s += `<g><rect x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0}" height="${z.y1 - z.y0}" fill="${z.item ? 'var(--ink)' : 'none'}" fill-opacity="${z.item ? 0.05 : 0}" stroke="var(--ink)" stroke-opacity="${z.item ? 0.3 : 0.45}" stroke-dasharray="${dash}"/>`;
      s += `<text x="${z.x0 + 5}" y="${z.y0 + 15}" class="zid">${esc(z.id)}</text>`;
      if (z.x1 - z.x0 > 120 && z.y1 - z.y0 > 40) s += `<text x="${z.x0 + 5}" y="${z.y0 + 29}" class="zt">${esc(z.t)}</text>`;
      s += `<title>${esc(z.id)} · ${esc(z.t)}</title></g>`;
    }
    for (const it of list) {
      const hl = it.id === sel || it._draft;
      if (it.mode === 'shelf' && it.p.board === boardId) {
        const d = derive(it), pl = d.pl;
        s += `<g class="hit" data-id="${it.id}">${baseRects(pl)}<rect x="${pl.bx}" y="${pl.by}" width="${d.Wt}" height="${d.Hb}" rx="2" fill="var(--part)" fill-opacity=".75" stroke="${hl ? 'var(--signal)' : 'var(--ink)'}" stroke-width="${hl ? 2.2 : 1}"/>`;
        s += `<rect x="${pl.bx}" y="${pl.by + d.Hb - d.Tf}" width="${d.Wt}" height="${d.Tf}" fill="var(--ink)" fill-opacity=".35"/>`;
        for (const st of pl.studs) s += `<circle cx="${st.x}" cy="${st.y}" r="${b.studD / 2 + 1.3}" fill="${st.ok ? 'var(--signal)' : 'var(--warn)'}" stroke="var(--sheet)" stroke-width=".8"/>`;
        s += `<text x="${pl.bx + 3}" y="${pl.by - 5}" class="nm">${esc(it.name)}</text><title>${esc(it.name)} · ${it.p.nx} × ${it.p.ny} · ${pl.studs.length} studs</title></g>`;
        s += binRects(list, it.id, sel);
      }
      if (hooky(it.mode) && it.p.board === boardId) {
        const d = derive(it), st = d.pl.studs, wd = d.hd.wd, top = { x: d.pl.ax, y: d.pl.dove ? d.pl.ay : st[0].y - wd };
        const yEnd = d.bottom + wd;
        s += `<g class="hit" data-id="${it.id}">${baseRects(d.pl)}<line x1="${top.x}" x2="${top.x}" y1="${top.y}" y2="${yEnd}" stroke="${hl ? 'var(--signal)' : 'var(--ink)'}" stroke-width="${wd}" stroke-linecap="round"/>`;
        for (const q of st) s += `<circle cx="${q.x}" cy="${q.y}" r="${b.studD / 2 + 1}" fill="${q.ok ? 'var(--signal)' : 'var(--warn)'}" stroke="var(--sheet)" stroke-width=".6"/>`;
        if (it.p.tool && it.p.tool.show) {
          const tw = it.p.tool.kind === 'box' ? it.p.tool.L : it.p.tool.W, tl = it.p.tool.kind === 'box' ? it.p.tool.T : it.p.tool.kind === 'spool' ? it.p.tool.W : it.p.tool.L;
          const yt = it.p.tool.kind === 'box' ? yEnd - tl : it.p.tool.kind === 'spool' ? yEnd - tl * 0.5 : yEnd - tl * 0.25;
          s += `<rect x="${top.x - tw / 2}" y="${yt}" width="${tw}" height="${tl}" rx="4" fill="none" stroke="${hl ? 'var(--signal)' : 'var(--ink)'}" stroke-opacity=".55" stroke-dasharray="5 4"/>`;
        }
        s += `<title>${esc(it.name)}</title></g>`;
      }
      if (it.mode === 'table' && boardId === 'T') {
        const d = derive(it), pl = d.pl;
        s += `<g class="hit" data-id="${it.id}"><rect x="${pl.bx}" y="${pl.by}" width="${d.Wt}" height="${d.Dt}" rx="${4 + d.rim}" fill="var(--part)" fill-opacity=".6" stroke="${hl ? 'var(--signal)' : 'var(--ink)'}" stroke-width="${hl ? 2.2 : 1}"/>`;
        for (let a = 1; a < it.p.nx; a++) s += `<line x1="${pl.bx + d.rim + 42 * a}" x2="${pl.bx + d.rim + 42 * a}" y1="${pl.by + d.rim}" y2="${pl.by + d.Dt - d.rim}" stroke="var(--ink)" stroke-opacity=".25"/>`;
        for (let c = 1; c < it.p.ny; c++) s += `<line x1="${pl.bx + d.rim}" x2="${pl.bx + d.Wt - d.rim}" y1="${pl.by + d.rim + 42 * c}" y2="${pl.by + d.rim + 42 * c}" stroke="var(--ink)" stroke-opacity=".25"/>`;
        for (const st of pl.studs) s += `<circle cx="${st.x}" cy="${st.y}" r="${b.studD / 2 + 1.3}" fill="var(--signal)" stroke="var(--sheet)" stroke-width=".8"/>`;
        s += `<text x="${pl.bx + 3}" y="${pl.by - 5}" class="nm">${esc(it.name)}</text><title>${esc(it.name)} · ${it.p.nx} × ${it.p.ny} · ${pl.studs.length} studs</title></g>`;
        s += binRects(list, it.id, sel);
      }
    }
    return s + '</svg>';
  });
}

function drawerSVG(item, { draft = null, sel = S.sel } = {}) {
  const list = mapItems(draft);
  return withItems(list, () => {
    const it = list.find((i) => i.id === item.id) || item;
    const d = derive(it), pl = d.plan;
    const W = it.p.sizing === 'drawer' ? it.p.W : pl.totalW, D = it.p.sizing === 'drawer' ? it.p.D : pl.totalD;
    const pad = 16;
    // y measured from the back wall of the drawer down to the front
    const fs = Math.max(W, D) / 700;
    let s = `<svg viewBox="${-pad} ${-pad - 14 * fs} ${W + 2 * pad} ${D + 2 * pad + 30 * fs}" xmlns="http://www.w3.org/2000/svg" data-drawer="${it.id}" role="img" aria-label="Drawer plan">${SVGSTYLE}<style>svg[data-drawer] .zid{font-size:${13 * fs}px}svg[data-drawer] .zt{font-size:${10 * fs}px}svg[data-drawer] .nm{font-size:${11 * fs}px}svg[data-drawer] .lbl{font-size:${11 * fs}px}</style>`;
    s += `<rect x="0" y="0" width="${W}" height="${D}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    const ox = it.p.sizing === 'drawer' ? (W - pl.totalW) / 2 : 0, oy = it.p.sizing === 'drawer' ? (D - pl.totalD) / 2 : 0;
    pl.tiles.forEach((t, k) => {
      const x = ox + t.x0 + pl.pad.L, yFromFront = t.y0 + pl.pad.F, y = oy + pl.totalD - yFromFront - t.d;
      s += `<rect x="${x}" y="${y}" width="${t.w}" height="${t.d}" fill="var(--part)" fill-opacity="${k % 2 ? 0.5 : 0.75}" stroke="var(--ink)" stroke-width=".8"/>`;
      s += `<text x="${x + 6 * fs}" y="${y + 16 * fs}" class="zid">${String.fromCharCode(65 + t.i)}${t.j + 1}</text><text x="${x + 6 * fs}" y="${y + 30 * fs}" class="zt">${f1(t.w)} × ${f1(t.d)}</text>`;
    });
    for (let a = 0; a <= pl.nx; a++) s += `<line x1="${ox + pl.pad.L + 42 * a}" x2="${ox + pl.pad.L + 42 * a}" y1="${oy + pl.pad.B}" y2="${oy + pl.pad.B + 42 * pl.ny}" stroke="var(--ink)" stroke-opacity=".18"/>`;
    for (let c = 0; c <= pl.ny; c++) s += `<line x1="${ox + pl.pad.L}" x2="${ox + pl.pad.L + 42 * pl.nx}" y1="${oy + pl.pad.B + 42 * c}" y2="${oy + pl.pad.B + 42 * c}" stroke="var(--ink)" stroke-opacity=".18"/>`;
    for (const b of list) {
      if (!onable(b) || !b.p.on || b.p.on.mount !== it.id) continue;
      const sp = binSpot(b); if (!sp) continue;
      const hl = b.id === sel || b._draft;
      s += `<g class="hit" data-id="${b.id}"><rect x="${ox + sp.x0}" y="${oy + sp.y0}" width="${sp.x1 - sp.x0}" height="${sp.y1 - sp.y0}" rx="3.75" fill="var(--sheet)" stroke="${sp.fits ? (hl ? 'var(--signal)' : 'var(--ink)') : 'var(--warn)'}" stroke-width="${hl ? 2 : 1}"/><text x="${ox + (sp.x0 + sp.x1) / 2}" y="${oy + (sp.y0 + sp.y1) / 2 + 4}" text-anchor="middle" class="nm">${esc(b.name)}</text></g>`;
    }
     s += `<text x="0" y="${D + 20 * fs}" class="lbl">front · ${f1(W)} × ${f1(D)} mm${it.p.sizing === 'drawer' ? ` inside, ${it.p.H} deep` : ''}</text><text x="0" y="-6" class="lbl">back</text>`;
    return s + '</svg>';
  });
}

function svgPoint(svg, ev) { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
function hoverText(boardId, x, y) {
  const b = BD.BOARDS[boardId];
  if (x < 0 || y < 0 || x > b.w || y > b.h) return '';
  let best = null, bd = 1e9;
  for (const h of BD.allHoles(b)) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h; } }
  const z = b.zones.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  return `x ${f0(x)} · y ${f0(y)}${best ? ` · nearest hole row ${best.i + 1}, hole ${best.j + 1}${best.nogo ? ' (no-go)' : ''}` : ''}${z ? ` · ${z.id}` : ''}`;
}

// ---------- 3D room ----------
const texCache = new Map();
function boardTexture(boardId) {
  if (texCache.has(boardId)) return texCache.get(boardId);
  const b = BD.BOARDS[boardId], k = boardId === 'B' ? 2 : 2;
  const cv = document.createElement('canvas'); cv.width = Math.round(b.w * k); cv.height = Math.round(b.h * k);
  const x = cv.getContext('2d');
  x.fillStyle = boardId === 'B' ? '#d6c29b' : '#e2cfac'; x.fillRect(0, 0, cv.width, cv.height);
  if (boardId === 'B') { for (let n = 0; n < 9000; n++) { x.fillStyle = `rgba(110,85,50,${Math.random() * 0.12})`; x.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2 + Math.random() * 5, 1 + Math.random() * 3); } }
  else { x.globalAlpha = 0.06; for (let n = 0; n < 140; n++) { x.strokeStyle = '#7a5a33'; x.lineWidth = 1 + Math.random() * 3; x.beginPath(); const yy = Math.random() * cv.height; x.moveTo(0, yy); x.bezierCurveTo(cv.width * 0.3, yy + 20 * Math.random(), cv.width * 0.6, yy - 20 * Math.random(), cv.width, yy + 10); x.stroke(); } x.globalAlpha = 1; }
  for (const [a, c] of b.battens) { x.fillStyle = 'rgba(90,70,40,.10)'; x.fillRect(a * k, 0, (c - a) * k, cv.height); }
  const r = (boardId === 'B' ? 3.8 : 2.5) * k;
  for (const h of BD.allHoles(b)) { x.fillStyle = h.nogo ? 'rgba(60,45,30,.25)' : 'rgba(40,30,20,.85)'; x.beginPath(); x.arc(h.x * k, h.y * k, r, 0, Math.PI * 2); x.fill(); }
  x.font = `500 ${13 * k}px "Helvetica Neue", Arial, sans-serif`;
  for (const z of b.zones) {
    x.strokeStyle = z.item ? 'rgba(20,22,26,.35)' : 'rgba(20,22,26,.5)'; x.lineWidth = 1.2 * k; x.setLineDash(z.item ? [5 * k, 4 * k] : z.clear ? [2 * k, 5 * k] : []);
    x.strokeRect(z.x0 * k, z.y0 * k, (z.x1 - z.x0) * k, (z.y1 - z.y0) * k);
    x.fillStyle = 'rgba(20,22,26,.6)'; x.fillText(z.id, z.x0 * k + 5 * k, z.y0 * k + 15 * k);
  }
  x.setLineDash([9 * k, 6 * k]); x.strokeStyle = 'rgba(168,98,10,.9)'; x.lineWidth = 1.6 * k;
  for (const bay of b.bays) { x.beginPath(); x.moveTo(bay.x0 * k, bay.clear * k); x.lineTo(bay.x1 * k, bay.clear * k); x.stroke(); }
  for (const ln of b.lines) { x.beginPath(); x.moveTo(0, ln.y * k); x.lineTo(cv.width, ln.y * k); x.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  texCache.set(boardId, tex);
  return tex;
}
const ROOM = { A: { x0: 0, h: 550 }, B: { x0: 2600, h: 1200 } };
function addBoardsToRoom(v) {
  const add = (o) => { v.root.add(o); return o; };
  const plane = (boardId) => {
    const b = BD.BOARDS[boardId];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshStandardMaterial({ map: boardTexture(boardId), roughness: 0.95 }));
    m.material.map.userData = { keep: true };
    return m;
  };
  const wallA = plane('A'); wallA.rotation.x = Math.PI / 2; wallA.position.set(1050, 0, 275); add(wallA);
  const slabA = new THREE.Mesh(new THREE.BoxGeometry(2100, 21, 550), new THREE.MeshStandardMaterial({ color: 0xcdb791, roughness: 0.95 })); slabA.position.set(1050, 10.6, 275); add(slabA);
  const table = plane('T'); table.position.set(1050, -275, 0); add(table);
  const slabT = new THREE.Mesh(new THREE.BoxGeometry(2100, 550, 21), new THREE.MeshStandardMaterial({ color: 0xcdb791, roughness: 0.95 })); slabT.position.set(1050, -275, -10.6); add(slabT);
  const wallB = plane('B'); wallB.rotation.x = Math.PI / 2; wallB.position.set(ROOM.B.x0 + 390.5, 0, 600); add(wallB);
  const slabB = new THREE.Mesh(new THREE.BoxGeometry(781, 19, 1200), new THREE.MeshStandardMaterial({ color: 0xc4ad85, roughness: 0.95 })); slabB.position.set(ROOM.B.x0 + 390.5, 9.6, 600); add(slabB);
  const floorB = new THREE.Mesh(new THREE.BoxGeometry(781, 400, 8), new THREE.MeshStandardMaterial({ color: 0xbdb9b2, roughness: 1 })); floorB.position.set(ROOM.B.x0 + 390.5, -200, -4); add(floorB);
  // stations on the table as low blocks so scale reads
  const H = { 'RX-711': 95, '936A': 100, Fume: 150, '968': 140, MHP50: 40, HOTO: 60, PCB: 70, Hands: 120, Scope: 160, Mat: 2 };
  for (const z of BD.BOARDS.T.zones) if (z.item) {
    const h = H[z.id] || 60, w = z.x1 - z.x0, d = z.y1 - z.y0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshStandardMaterial({ color: z.id === 'Mat' ? 0x5b6e7a : 0x3a3c40, roughness: 0.9, transparent: true, opacity: z.id === 'Mat' ? 0.85 : 0.35 }));
    m.position.set(z.x0 + w / 2, -(z.y0 + d / 2), h / 2); add(m);
  }
}
function placeInRoom(item, geoEntry) {
  const d = derive(item), p = item.p;
  if (hooky(item.mode)) {
    const c = wcache.get(item.id), an = c && c.dims && c.dims.anchor; if (!an) return null;
    const R = ROOM[p.board];
    return [R.x0 + d.pl.ax - an[0], -an[1], R.h - d.pl.ay - an[2]];
  }
  if (item.mode === 'shelf') {
    const R = ROOM[p.board];
    const c = wcache.get(item.id), sh = c && c.dims && c.dims.shift;
    // the shelf's view is centred; its back face (model y = 0) sits off the board by the base
    return [R.x0 + d.pl.bx + d.Wt / 2, sh ? -(d.off || 0) - sh[1] : -d.Dt / 2, R.h - (d.pl.by + d.Hb)];
  }
  if (item.mode === 'table') return [d.pl.bx + d.Wt / 2, -(d.pl.by + d.Dt / 2), -p.studLen];
  if (onable(item)) {
    const sp = binSpot(item); if (!sp) return null;
    if (sp.kind === 'wall') {
      const R = ROOM[sp.board], dm = sp.dm;
      return [R.x0 + (sp.x0 + sp.x1) / 2, -((dm.off || 0) + dm.backT + dm.gapB + 42 * sp.c + 21 * p.ny), R.h - sp.yBottom];
    }
    if (sp.kind === 'table') return [(sp.x0 + sp.x1) / 2, -(sp.y0 + sp.y1) / 2, sp.dm.T - 4.9];
    return null;
  }
  return null;
}

// ---------- tabs ----------
// the way back from Trace or Scan to the tool (or the library) you came from
function crumbHTML(what) {
  const t = tool(S.backTo);
  return `<div class="crumb"><button type="button" class="pill" data-crumb="back">← ${t ? esc(shortName(t)) : 'Tools'}</button><span>Tools${t ? ` / ${esc(shortName(t))}` : ''} / ${esc(what)}</span></div>`;
}
function goBackToTools() { const id = S.backTo; S.backTo = null; saveState(); if (id && tool(id)) UIT.focus = id; setTab('tools'); if (id) requestAnimationFrame(() => { const c = $(`.tcard[data-tool="${CSS.escape(id)}"]`); if (c) c.scrollIntoView({ block: 'nearest' }); }); }
function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) => (t === 'sep' ? '<span class="sep" aria-hidden="true"></span>' : `<button role="tab" type="button" data-tab="${t.id}" aria-selected="${S.tab === t.id || (t.id === 'tools' && UNDER_TOOLS.includes(S.tab))}">${t.label}</button>`)).join('');
}
function setTab(id) {
  S.tab = id; saveState(); renderTabs();
  $('#app').classList.toggle('wide', id === 'rules' || id === 'plan');
  if (id === 'workspace') renderWorkspace();
  else if (id === 'plan') renderPlan();
  else if (id === 'rules') renderRules();
  else if (id === 'trace') renderTrace();
  else if (id === 'tools') renderTools();
  else if (id === 'scan') renderScan();
  else renderEditor();
}
function profileText() {
  const pr = PRINTERS.find((p) => p.id === S.settings.printer), m = MATERIALS.find((q) => q.id === S.settings.material);
  $('#profileText').textContent = `${pr ? pr.label.split(' · ')[0] : 'Custom'} ${S.settings.bed.x} × ${S.settings.bed.y} · ${m ? m.label.replace('Bambu ', '') : 'custom'} · holes +${S.settings.tol.hole}`;
}

// ---------- editor ----------
function draftFor(type) {
  if (!S.drafts[type]) { const pr = typePresets(type)[0]; S.drafts[type] = { type, mode: TYPE(type).mode, p: clone(pr.p), itemId: null, name: pr.label.split(' · ')[0], presetId: pr.id, for: [], fit: { clear: 0, gap: 0 } }; }
  const d = S.drafts[type];
  d.type = type; d.mode = TYPE(type).mode; d.for = d.for || []; d.fit = d.fit || { clear: 0, gap: 0 };
  return d;
}
const D = () => draftFor(S.make);
function openItem(id) {
  const it = itemById(id); if (!it) return;
  const type = typeOfItem(it);
  S.drafts[type] = { type, mode: it.mode, p: clone(it.p), itemId: it.id, name: it.name, presetId: null, for: forOf(it.for), fit: { clear: 0, gap: 0 }, named: true };
  S.make = type; S.sel = id; if (ED) ED.framed = false; setTab('make');
}
// start a part for some tools (from the library, a selection, or Trace)
function makeFor(type, ids) {
  S.drafts[type] = null;
  const d = draftFor(type);
  d.for = ids.map((id) => { const t = tool(id); return { id: toolId(id), n: type === 'hook' || type === 'mount' ? 1 : Math.max(1, Math.min(t && t.qty ? t.qty : 1, 8)) }; });
  fitDraft(d);
  S.make = type; if (ED) ED.framed = false; setTab('make');
}
const forTools = (d) => (d.for || []).map((f, fi) => { const t = tool(f.id); if (!t || t.kind === 'bench') return null; const m = modelInfo(t.id);
  const useM = d.type === 'hook' || d.type === 'mount' || d.type === 'tray' || !!(f.grip || (m && (m.measured || m.photo)));
  return { t, n: f.n || 1, fi, grip: f.grip || null, type: f.type || null, orient: f.orient || null, m: useM ? m : null }; }).filter(Boolean);
function outlinesFor(list) { const o = {}; for (const { t } of list) { const x = outlineOf(t.id); if (x) o[t.id] = x; else { const sh = shapeOf(t); if (sh.real) o[t.id] = { pts: sh.pts, src: 'scan' }; } } return o; }
function autoName(d) {
  const ts = forTools(d); if (!ts.length) return null;
  const nm = ts.map((x) => shortName(x.t) + (x.n > 1 ? ` ×${x.n}` : '')).join(', ');
  return `${TYPE(d.type).label} · ${nm}`.slice(0, 72);
}
// size the part to its tools. Hand edits stay until the tool list or the fit settings change.
function fitDraft(d) {
  const list = forTools(d), ty = TYPE(d.type);
  d.fitNotes = []; d.fitFail = ''; d.fitWarns = [];
  if (!ty.fit) return;
  if (!list.length) { d.row = null; return; }
  const keep = { on: (d.p && d.p.on) || null, magnets: (d.p && d.p.magnets) || 'off', magCorners: !!(d.p && d.p.magCorners) };
  if (ty.fit === 'stand' || ty.fit === 'lay') {
    const r = FIT.holderFor(list, { style: ty.fit, clear: +d.fit.clear || 0, gap: +d.fit.gap || undefined, outlines: outlinesFor(list), maxUnits: maxUnits(), keep });
    d.fitNotes = r.notes || [];
    if (!r.p) { d.fitFail = r.fail; return; }
    d.p = r.p; d.row = null;
  } else if (ty.fit === 'hook' || ty.fit === 'saddle') {
    const slots = []; list.forEach((e) => { for (let k = 0; k < Math.max(1, e.n | 0); k++) slots.push(e); });
    let made;
    if (ty.fit === 'hook') made = list.length === 1 && list[0].n === 1 ? [FIT.hookFor(list[0].t, { m: list[0].m, grip: list[0].grip, type: list[0].type })] : FIT.hookRow(list, {});
    else {
      made = slots.map((e) => { const r = FIT.mountFor(e.t, e.m, e.grip, { orient: e.orient }); return r.p ? { p: r.p, why: r.notes[0], warn: [], ok: true, m: e.m } : null; }).filter(Boolean);
      const byTool = new Map(); for (const h of made) { if (!byTool.has(h.p.forTool)) byTool.set(h.p.forTool, []); byTool.get(h.p.forTool).push(h); }
      for (const [, hs] of byTool) {
        const m = hs[0].m; if (!m || !m.dTip) continue;
        const lo = Math.min(...hs.map((h) => Math.min(...h.p.grip))), hi = Math.max(...hs.map((h) => Math.max(...h.p.grip)));
        if (m.dTip < lo - 2 || m.dTip > hi + 2) hs[0].warn.push(hs.length > 1 ? `the balance point (${f1(m.dTip)} mm from the tip) is outside its saddles — it will tip; move one past it` : `the balance point is ${f1(m.dTip)} mm from the tip, outside this saddle — it will tip. Add the tool again for a second saddle, or hold it at the balance point`);
      }
      // one tool twice: saddles spaced by the distance between the two grips; different tools side by side
      const pitch = made.length && made[0].p.board === 'B' ? BD.BOARDS.B.pitch : 25;
      for (let k = 1; k < made.length; k++) {
        const a = made[k - 1].p, b = made[k].p, ca = (a.grip[0] + a.grip[1]) / 2, cb = (b.grip[0] + b.grip[1]) / 2;
        const dx = a.forTool === b.forTool ? (b.orient === 'flat' ? cb - ca : ca - cb) : Math.max(60, (tool(a.forTool) || {}).L || 60) + 30;
        b.at = { x: Math.round(a.at.x + Math.round(dx / pitch) * pitch), y: made[0].p.at.y }; b.board = made[0].p.board;
      }
    }
    d.fitNotes = made.map((h) => `${shortName(tool(h.p.forTool) || { name: 'Tool', brand: '' })} — ${ty.fit === 'hook' ? `${(G.HOOK_TYPES.find((x) => x[0] === h.p.type) || [0, h.p.type])[1].toLowerCase()}: ` : ''}${h.why}`);
    d.fitWarns = made.flatMap((h) => [...(h.ok === false ? [`${shortName(tool(h.p.forTool) || { name: 'Tool', brand: '' })}: ${h.why}`] : []), ...(h.warn || []).map((w) => `${shortName(tool(h.p.forTool) || { name: 'Tool', brand: '' })}: ${w}`)]);
    if (!made.length) { d.fitFail = 'nothing to hold'; return; }
    // keep how it goes on the board across a re-fit: dovetail or studs, and a size you picked by hand
    if (d.p && d.p.mount) for (const h of made) { h.p.mount = d.p.mount; if (d.p.dove && d.p.dove !== 'auto') h.p.dove = d.p.dove; }
    if (made.length > 1) { d.row = made.map((h, k) => ({ p: h.p, tool: h.p.forTool, fi: slots[k] ? slots[k].fi : 0 })); d.rowSel = Math.min(d.rowSel || 0, d.row.length - 1); d.p = d.row[d.rowSel].p; }
    else { d.row = null; d.p = made[0].p; }
  } else if (ty.fit === 'bin') {
    const r = FIT.binFor(list, { maxUnits: maxUnits() });
    d.fitNotes = r.notes || [];
    if (!r.p) { d.fitFail = r.fail; return; }
    d.p = { ...r.p, on: keep.on, magnets: keep.magnets }; d.row = null;
  }
  if (!d.named) d.name = autoName(d) || d.name;
  d.presetId = null;
}
const getPath = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o);
function setPath(o, k, v) { const ks = k.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks.at(-1)] = v; }

function fieldHTML(f, p) {
  if (f.show && !f.show(p)) return '';
  const v = getPath(p, f.k), id = `f_${f.k.replace('.', '_')}`;
  if (f.t === 'bool') return `<div class="row"><label for="${id}">${f.label}</label><input type="checkbox" id="${id}" data-k="${f.k}" data-t="bool" ${v ? 'checked' : ''}></div>`;
  if (f.t === 'text') return `<div class="row"><label for="${id}">${f.label}</label><input type="text" class="field" id="${id}" data-k="${f.k}" data-t="text" value="${esc(v ?? '')}" spellcheck="false"></div>`;
  if (f.t === 'sel') return `<div class="row"><label for="${id}">${f.label}</label><select id="${id}" data-k="${f.k}" data-t="sel">${f.opts.map(([o, l]) => `<option value="${o}" ${String(v) === String(o) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  return `<div class="row"><label for="${id}">${f.label}${f.unit ? ` <small>${f.unit}</small>` : ''}</label><input type="number" id="${id}" data-k="${f.k}" data-t="${f.t}" value="${v ?? 0}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step ?? 1}"></div>`;
}
const UI = { more: {}, ghosts: true };
function moreHTML(key, inner, label = 'More settings') {
  return `<details class="more" data-more="${esc(key)}" ${UI.more[key] ? 'open' : ''}><summary>${label}</summary>${inner}</details>`;
}
const SHAPES = [['round', 'Round'], ['hex', 'Hex'], ['slot', 'Slot'], ['rect', 'Rectangle'], ['outline', 'Traced outline']];
const FINGER = [['none', 'None'], ['ends', 'Both ends'], ['sides', 'Both sides'], ['end', 'One end'], ['side', 'One side'], ['centre', 'Centre']];
function groupsHTML(p) {
  const cards = p.groups.map((g, i) => {
    const n = (k, label, step = 0.1, extra = '') => `<label>${label}<input type="number" data-g="${i}" data-gk="${k}" value="${g[k] ?? 0}" step="${step}" ${extra}></label>`;
    const ck = (k, label) => `<label class="ck"><input type="checkbox" data-g="${i}" data-gk="${k}" ${g[k] ? 'checked' : ''}>${label}</label>`;
    let body;
    if (g.shape === 'outline') {
      const fm = g.fingerMode || (g.fingers === 2 ? 'ends' : g.fingers === 1 ? 'centre' : 'none');
      body = `<div class="grid4">${n('depth', 'depth', 0.5)}${n('clear', 'clearance', 0.1)}${n('x', 'x mm', 0.5)}${n('y', 'y mm', 0.5)}</div>
        <div class="inline" style="margin-top:6px"><span class="unit" style="flex:1">Finger scoops</span><select class="field" style="width:auto" data-g="${i}" data-gk="fingerMode">${FINGER.map(([v, l]) => `<option value="${v}" ${fm === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="inline" style="margin-top:6px"><button class="btn ghost small" type="button" data-act="trace" data-g="${i}">Trace from a photo…</button><span class="unit">${(g.pts || []).length} points</span></div>
        ${moreHTML(`grp:${i}`, `<div class="grid4">${n('rot', 'rotate °', 1)}${n('scale', 'scale', 0.01)}${n('fingerD', 'scoop width', 1)}${n('fingerLen', 'scoop length', 1)}${n('fingerDepth', 'scoop depth', 0.5)}${n('toolT', 'tool thickness', 0.5)}</div><div class="inline" style="margin-top:6px">${ck('through', 'through')}</div>`, 'More')}`;
    } else {
      const aL = g.shape === 'round' ? 'Ø' : g.shape === 'hex' ? 'across flats' : 'width';
      body = `<div class="grid4">${n('a', aL)}${g.shape === 'slot' || g.shape === 'rect' ? n('b', 'length') : n('depth', 'depth', 0.5)}${n('n', 'count', 1, 'min="1"')}${n('pitch', 'pitch (0 auto)', 0.5)}</div>
        ${g.shape === 'slot' || g.shape === 'rect' ? `<div class="grid4" style="margin-top:5px">${n('depth', 'depth', 0.5)}</div>` : ''}
        ${moreHTML(`grp:${i}`, `<div class="grid4">${n('rows', 'rows', 1, 'min="1"')}${n('rowPitch', 'row pitch', 0.5)}${n('x', 'x mm', 0.5)}${n('y', 'y mm', 0.5)}${n('toolL', 'tool sticks up', 1)}</div>
        <div class="inline" style="margin-top:6px;gap:12px">${ck('through', 'through')}${ck('cells', 'per cell')}${ck('stagger', 'stagger')}</div>`, 'More')}`;
    }
    const gt = g.tool ? tool(g.tool) : null;
    return `<div class="grpcard">${g.name ? `<div class="gname">${esc(g.name)}${gt ? ` · ${esc(dimText(gt))}` : ''}</div>` : ''}<div class="gh"><select data-g="${i}" data-gk="shape" aria-label="Shape">${SHAPES.map(([v, l]) => `<option value="${v}" ${g.shape === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="iconbtn" type="button" data-act="g-dup" data-g="${i}" title="Duplicate">⧉</button><button class="iconbtn" type="button" data-act="g-del" data-g="${i}" title="Remove">✕</button></div>${body}</div>`;
  }).join('');
  return `<div class="groups">${cards || '<p class="blurb">No cut-outs yet — a plain block.</p>'}</div><div class="actions"><button class="btn ghost small" type="button" data-act="g-add">Add cut-out</button><button class="btn ghost small" type="button" data-act="g-trace-new">Trace a tool…</button></div>`;
}
function atHTML(draft) {
  const p = draft.p, boardId = draft.mode === 'shelf' || hooky(draft.mode) ? p.board : 'T', b = BD.BOARDS[boardId];
  if (hooky(draft.mode)) {
    return `<div class="row"><label for="f_at_x">Top stud x <small>mm</small></label><input type="number" id="f_at_x" data-k="at.x" data-t="num" value="${p.at.x}" step="1"></div>
    <div class="row"><label for="f_at_y">Top stud y <small>mm</small></label><input type="number" id="f_at_y" data-k="at.y" data-t="num" value="${p.at.y}" step="1"></div>
    <div class="inline" style="margin:6px 0"><span class="unit" style="flex:1">Nudge one hole</span>${['←', '→', '↑', '↓'].map((d) => `<button class="iconbtn" type="button" data-act="nudge" data-dir="${d}" aria-label="Nudge ${d}">${d}</button>`).join('')}</div>
    <p class="unit" style="margin:4px 0 0">Or click the board map. The top stud snaps to the nearest hole.</p>`;
  }
  const zones = b.zones.filter((z) => !z.item);
  return `<div class="row"><label for="f_at_x">Left edge x <small>mm</small></label><input type="number" id="f_at_x" data-k="at.x" data-t="num" value="${p.at.x}" step="1"></div>
    <div class="row"><label for="f_at_y">${boardId === 'T' ? 'Back edge' : 'Top edge'} y <small>mm</small></label><input type="number" id="f_at_y" data-k="at.y" data-t="num" value="${p.at.y}" step="1"></div>
    <div class="row"><label for="f_zone">Fit to a zone</label><select id="f_zone" data-act="zone"><option value="">—</option>${zones.map((z) => `<option value="${z.id}">${z.id} · ${esc(z.t)}</option>`).join('')}</select></div>
    <div class="inline" style="margin:6px 0"><span class="unit" style="flex:1">Nudge one hole</span>${['←', '→', '↑', '↓'].map((a) => `<button class="iconbtn" type="button" data-act="nudge" data-dir="${a}" aria-label="Nudge ${a}">${a}</button>`).join('')}</div>
    <p class="unit" style="margin:4px 0 0">Or click the map below. The part snaps to the lattice so its studs land on real holes.</p>`;
}
function onHTML(draft) {
  const p = draft.p, on = p.on || { mount: '', a: 0, c: 0 };
  const mounts = S.items.filter(isMount);
  const m = on.mount ? itemById(on.mount) : null;
  return `<div class="row full"><select id="f_on" data-act="on-mount" aria-label="Mount"><option value="">Not placed</option>${mounts.map((q) => `<option value="${q.id}" ${on.mount === q.id ? 'selected' : ''}>${esc(mountLabel(q))}</option>`).join('')}</select></div>
    ${m ? `<div class="row"><label for="f_on_a">Column from the left</label><input type="number" id="f_on_a" data-k="on.a" data-t="int" value="${(on.a | 0) + 1}" data-plus1="1" min="1" step="1"></div>
    <div class="row"><label for="f_on_c">Row from the back</label><input type="number" id="f_on_c" data-k="on.c" data-t="int" value="${(on.c | 0) + 1}" data-plus1="1" min="1" step="1"></div><p class="unit" style="margin:4px 0 0">Or click a cell on the map below.</p>` : '<p class="unit">Placed parts show on the board, table and drawer maps and in the room view.</p>'}`;
}

function forHTML(d) {
  const ty = TYPE(d.type), list = d.for || [];
  const selTool = d.row && d.row[d.rowSel] ? d.row[d.rowSel].tool : null;
  let h = `<h3>For <span class="unit">${list.length ? `${list.length} tool${list.length > 1 ? 's' : ''}${d.row ? ` · ${d.row.length} ${d.mode === 'mount' ? 'saddles' : 'hooks'} — click one to edit it` : ''}` : 'pick one tool or several'}</span></h3><div class="forlist">`;
  list.forEach((f, i) => {
    const t = tool(f.id); if (!t) return;
    const isSel = selTool && toolId(selTool) === t.id;
    h += `<div class="forrow ${isSel ? 'sel' : ''}" ${d.row ? `data-act="hook-sel" data-tool="${esc(t.id)}"` : ''}><span class="thumb">${thumbHTML(t)}</span><div style="min-width:0"><div class="nm">${esc(t.name)}</div><div class="dm">${esc(dimText(t))}${outlineOf(t.id) ? (outlineOf(t.id).src === 'catalogue' ? ' · outline' : ' · traced') : ''}${t.kind === 'bench' ? ' · bench item' : ''}</div></div>
      <input type="number" min="1" max="40" step="1" value="${f.n || 1}" data-fn="${i}" aria-label="How many ${esc(t.name)}" title="How many"><button class="iconbtn" type="button" data-act="for-del" data-i="${i}" aria-label="Remove ${esc(t.name)}">✕</button></div>`;
  });
  h += `</div><div class="tsearch"><input type="search" id="mk_q" placeholder="${list.length ? 'Add another tool…' : 'Search your tools — name, brand, zone, size…'}" autocomplete="off" aria-label="Add a tool" aria-controls="mk_sugg"><div class="sugg" id="mk_sugg" role="listbox"></div></div>`;
  if (d.fitFail) h += `<div class="checks" style="margin-top:8px"><div class="check warn"><span class="tag">fit</span><span>${esc(d.fitFail)}</span></div></div>`;
  if (list.length) {
    if (d.fitNotes && d.fitNotes.length) h += moreHTML(`notes:${d.type}`, `<div class="fitnote">${d.fitNotes.slice(0, 14).map((n) => `<span>${esc(n)}</span>`).join('')}${d.fitNotes.length > 14 ? `<span>… and ${d.fitNotes.length - 14} more</span>` : ''}</div>`, `How each tool sits (${d.fitNotes.length})`);
    const opts = ty.fit === 'stand' || ty.fit === 'lay'
      ? `<div class="row"><label for="fit_clear">Extra clearance <small>mm</small></label><input type="number" id="fit_clear" data-fit="clear" value="${d.fit.clear || 0}" step="0.1" min="-1" max="5"></div><div class="row"><label for="fit_gap">Gap between tools — 0 auto <small>mm</small></label><input type="number" id="fit_gap" data-fit="gap" value="${d.fit.gap || 0}" step="0.5" min="0" max="30"></div>` : '';
    h += `<div class="actions"><button class="btn ghost small" type="button" data-act="refit" title="Size the part to these tools again — replaces hand edits">Fit again</button><button class="btn ghost small" type="button" data-act="for-clear">Clear</button>${ty.fit === 'lay' && list.some((x) => !outlineOf(x.id)) ? '<button class="btn ghost small" type="button" data-act="for-trace">Trace these…</button>' : ''}</div>${opts ? moreHTML(`fit:${d.type}`, opts, 'Fit settings') : ''}`;
  }
  return h;
}
function renderEditor() {
  const type = S.make, ty = TYPE(type), draft = draftFor(type), mode = draft.mode;
  const p = draft.p, presets = typePresets(type);
  const it = draft.itemId ? itemById(draft.itemId) : null;
  if (draft.itemId && !it) draft.itemId = null;
  const dirty = it ? JSON.stringify(it.p) !== JSON.stringify(p) || it.name !== draft.name : true;
  const nRow = draft.row && !it ? draft.row.length : 0;
  let h = `<h2>Make</h2><div class="types" role="group" aria-label="What to make">${TYPES.map((x) => `<button type="button" data-act="type" data-type="${x.id}" aria-pressed="${x.id === type}"><span>${x.label}</span><small>${x.hint}</small></button>`).join('')}</div>
    <p class="blurb">${BLURB[type]}</p>`;
  if (ty.fit) h += forHTML(draft);
  h += `<h3>Part</h3>
    <div class="row"><label for="f_preset">Start from</label><select id="f_preset" data-act="preset"><option value="">${it ? 'Saved part' : draft.for.length ? 'Fitted to the tools' : '—'}</option>${presets.map((x) => `<option value="${x.id}" ${draft.presetId === x.id && !it ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
    <div class="row full"><input type="text" id="f_name" data-act="name" class="field" value="${esc(draft.name)}" aria-label="Name"></div>
    <div class="actions">${it ? `<button class="btn" type="button" data-act="update" ${dirty ? '' : 'disabled'}>${dirty ? 'Update' : 'Saved'}</button><button class="btn ghost" type="button" data-act="saveas">Save a copy</button><button class="btn ghost" type="button" data-act="delete">Delete</button>` : `<button class="btn" type="button" data-act="add">${nRow ? `Save ${nRow} ${draft.mode === 'mount' ? 'saddles' : 'hooks'} to the bench` : 'Save to the bench'}</button>`}
      <button class="btn signal" type="button" data-act="zip">Download .zip</button></div>`;
  const preset = presets.find((x) => x.id === draft.presetId);
  if (preset && preset.note && !it) h += `<p class="unit" style="margin:0 0 6px">${esc(preset.note)}</p>`;
  if (draft.row && draft.row[draft.rowSel]) { const t = tool(draft.row[draft.rowSel].tool); h += `<p class="unit" style="margin:10px 0 0">Editing ${draft.mode === 'mount' ? 'saddle' : 'hook'} ${draft.rowSel + 1} of ${draft.row.length}${t ? ` — ${esc(t.name)}` : ''}.</p>`; }
  for (const sec of SCHEMA[mode]) {
    if (sec.show && !sec.show(p)) continue;
    if (type === 'tray' && sec.t === 'Tool envelope') continue;
    h += `<h3>${sec.t}</h3>`;
    for (const f of sec.f.filter((q) => !q.adv)) {
      if (type === 'tray' && f.k === 'tilt') continue;
      if (f.t === 'groups') h += groupsHTML(p);
      else if (f.t === 'at') h += atHTML(draft);
      else if (f.t === 'on') h += onHTML(draft);
      else if (f.t === 'stackfoot') { const sz = G.stackSize(p.nx, p.ny); h += `<p class="unit" style="margin:2px 0 6px">${f0(sz.W)} × ${f0(sz.D)} mm — every unit with this footprint stacks on every other</p>`; }
      else h += fieldHTML(f, p);
    }
    const adv = sec.f.filter((q) => q.adv && (!q.show || q.show(p)));
    if (adv.length) h += moreHTML(`${mode}:${sec.t}`, adv.map((f) => fieldHTML(f, p)).join(''));
  }
  $('#panel').innerHTML = h;
  if (!ED) { ED = new Viewer(8000); }
  const stage = $('#stage');
  stage.innerHTML = `<div id="edSlot"></div><div id="edGrip"></div><div class="stats" id="edStats"></div><div id="edLayout"></div><div class="checks" id="edChecks"></div><div id="edMap"></div>`;
  $('#edSlot').appendChild(ED.el);
  ED.resize();
  ensureEdHud();
  requestAnimationFrame(() => ED.resize());
  scheduleBuild(0, !ED.framed);
}
// tool search under "For": type to filter, click or Enter to add
function renderSugg() {
  const inp = $('#mk_q'), box = $('#mk_sugg'); if (!inp || !box) return;
  const q = inp.value.trim();
  let list;
  if (q) list = LIB.list.filter((t) => t.kind !== 'bench' && matchTool(t, q)).slice(0, 12);
  else {
    const picked = S.pick.map(tool).filter(Boolean), hm = homes();
    list = [...picked, ...LIB.list.filter((t) => t.kind !== 'bench' && !hm.has(t.id) && !picked.includes(t))].slice(0, 10);
  }
  box.innerHTML = list.length ? (q ? '' : `<div class="unit" style="padding:4px 6px">${S.pick.length ? 'Picked in Tools, then tools with no home yet' : 'Tools with no home yet'}</div>`) + list.map((t, k) => `<button type="button" role="option" data-add="${esc(t.id)}" class="${k === 0 && q ? 'hi' : ''}"><span class="thumb">${thumbHTML(t)}</span><span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span><span class="dm">${esc(dimText(t))}</span></span><span class="dm">${esc(t.zone || '')}</span></button>`).join('')
    : `<div class="unit" style="padding:6px">Nothing matches. Add it in Tools.</div>`;
  box.classList.add('on');
}
function addFor(id) {
  const d = D(), tid = toolId(id), f = d.type === 'mount' ? null : d.for.find((x) => toolId(x.id) === tid);
  if (f) f.n = (f.n || 1) + 1; else { const t = tool(id); d.for.push({ id: tid, n: d.type === 'hook' || d.type === 'mount' ? 1 : Math.max(1, Math.min(t && t.qty ? t.qty : 1, 8)) }); }
  fitDraft(d); ED.framed = false; saveState(); renderEditor();
  requestAnimationFrame(() => { const q = $('#mk_q'); if (q) q.focus(); });
}
function ensureEdHud() {
  if (!ED.hud) {
    ED.hud = document.createElement('div'); ED.hud.className = 'hud';
    ED.hud.innerHTML = `<button class="pill" type="button" data-view="use" aria-pressed="true">As used</button><button class="pill" type="button" data-view="print" aria-pressed="false">On the bed</button><button class="pill" type="button" data-view="tools" aria-pressed="${UI.ghosts}">Tools</button><button class="pill" type="button" data-view="fit">Fit view</button>`;
    ED.el.appendChild(ED.hud);
    ED.busy = document.createElement('div'); ED.busy.className = 'busy'; ED.el.appendChild(ED.busy);
    ED.legend = document.createElement('div'); ED.legend.className = 'legend'; ED.el.appendChild(ED.legend);
    ED.hud.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (!b) return; if (b.dataset.view === 'fit') { fitEditor(); return; } if (b.dataset.view === 'tools') { UI.ghosts = !UI.ghosts; b.setAttribute('aria-pressed', UI.ghosts); showEditorMeshes(false); return; } ED.mode = b.dataset.view; $$('[data-view="use"],[data-view="print"]', ED.hud).forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === ED.mode)); showEditorMeshes(true); });
    ED.mode = 'use';
  }
}

let edRes = null, buildTimer = null;
function currentDraft() { return S.tab === 'trace' ? { type: 'tray', mode: 'holder', p: traceHolder(TT()), name: 'Traced tray', itemId: null, for: [] } : D(); }
// what a hook or saddle carries, roughly; a saddle's solid block counts as a short, stiff arm
function capOf(p) {
  const saddle = p.type === 'mount' || (!p.type && p.sec);
  let c;
  if (saddle) { const sw = p.sec ? Math.max(...p.sec.map((q) => q[0])) - Math.min(...p.sec.map((q) => q[0])) : 20; c = FIT.hookCapacity({ ...p, type: 'l', L: Math.max(10, sw / 2 + 6) }) * 2; }
  else c = FIT.hookCapacity(p);
  if (p.mount !== 'studs') { const b = BD.BOARDS[p.board], pk = saddle ? G.pickDove('mount', p, b) : G.hookPaths(p, b).pick; c = Math.min(c, (pk.cap / pk.lever) * 1000); }
  return c;
}
// which tool entry the picker and per-tool settings act on
function curEntry(d) { if (d.row && d.row[d.rowSel] && d.row[d.rowSel].fi != null) return d.row[d.rowSel].fi; return Math.min(d.pickIdx || 0, Math.max(0, d.for.length - 1)); }
function freeEd() { if (!edRes) return; if (edRes._subs) edRes._subs.forEach((r) => freeParts(r.res)); else freeParts(edRes); edRes = null; }
// a row of hooks builds each hook and lines them up as they sit on the board
function buildDraft(draft) {
  if (!(draft.row && draft.row.length > 1)) return build(draft.mode, draft.p, S.settings);
  const subs = [], parts = [], warnings = [], info = [];
  let ref = null;
  draft.row.forEach((r, k) => {
    const res = build(draft.mode, r.p, S.settings);
    const an = res.dims.anchor;
    const pos = [res.placement.ax - an[0], -an[1], -res.placement.ay - an[2]];
    if (!ref) ref = pos.slice();
    const off = [pos[0] - ref[0], pos[1] - ref[1], pos[2] - ref[2]];
    const nm = shortName(tool(r.tool) || { name: `hook ${k + 1}`, brand: '' });
    res.parts.forEach((q) => { q.role = q.key; q.pos = off; q.hookIdx = k; q.key = `${k + 1} · ${nm}`.slice(0, 28); parts.push(q); });
    for (const w of res.warnings) warnings.push(`${nm}: ${w}`);
    subs.push({ res, p: r.p, off, tool: r.tool });
  });
  return { parts, warnings, info, placement: null, dims: null, _subs: subs };
}
function scheduleBuild(ms = 120, refit = false) { clearTimeout(buildTimer); if (ED && ED.busy) ED.busy.textContent = 'Building…'; buildTimer = setTimeout(() => rebuildEditor(refit), ms); }
function rebuildEditor(refit) {
  const draft = currentDraft(); if (!draft) return;
  freeEd();
  const t0 = performance.now();
  try { edRes = buildDraft(draft); }
  catch (e) { $('#edChecks').innerHTML = `<div class="check warn"><span class="tag">error</span><span>${esc(e.message || e)}</span></div>`; ED.busy.textContent = ''; return; }
  ED.busy.textContent = `${Math.round(performance.now() - t0)} ms`;
  // swap draft placement into the derive cache by id so maps match
  showEditorMeshes(refit);
  if (S.tab === 'trace') renderTraceChecks(); else { renderEditorStats(); renderGrip(); renderLayout(); renderEditorMap(); }
  saveState();
}
function showEditorMeshes(refit) {
  if (!edRes) return;
  ED.clear();
  const printView = ED.mode === 'print';
  const box = new THREE.Box3();
  let xCursor = 0;
  const dsel = currentDraft();
  edRes.parts.forEach((p, k) => {
    const g = printView ? geoShaded(p.print) : geoFrom(p.view);
    const hl = p.hookIdx != null && dsel.row && dsel.rowSel === p.hookIdx && edRes._subs.length > 1;
    const o = meshOf(g, printView ? MAT.shade : hl ? MAT.sel : k === 0 || !p.secondary ? MAT.part : MAT.mount, true);
    const s = p.stats.size;
    if (p.pos && !(printView && (p.hookIdx != null || p.assembled))) o.position.set(...p.pos);
    else if (k === 0) { o.position.set(0, 0, 0); xCursor = s[0] / 2 + 24; }
    else { o.position.set(xCursor + s[0] / 2, 0, 0); xCursor += s[0] + 24; }
    ED.root.add(o);
    box.expandByObject(o);
  });
  // the tools themselves, as translucent ghosts, so you can see how they sit
  if (UI.ghosts && !printView) {
    const d = currentDraft();
    if (edRes._subs) {
      let prev = null;
      for (const sb of edRes._subs) {
        let gg = null; try { gg = d.mode === 'mount' ? (prev === sb.p.forTool ? null : saddleGhost(sb.p, sb.res.dims)) : hookGhosts(sb.p, sb.res.dims); } catch (e) { gg = null; }
        prev = sb.p.forTool;
        if (gg) { gg.position.x += sb.off[0]; gg.position.y += sb.off[1]; gg.position.z += sb.off[2]; ED.root.add(gg); box.expandByObject(gg); }
      }
    } else {
      let gg = null;
      try { if (d.mode === 'holder') gg = holderGhosts(d.p); else if (d.mode === 'hook') gg = hookGhosts(d.p, edRes.dims); else if (d.mode === 'mount') gg = saddleGhost(d.p, edRes.dims); } catch (e) { gg = null; }
      if (gg) { ED.root.add(gg); box.expandByObject(gg); }
    }
  }
  // ground: 42 mm grid, or the bed outline
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  if (printView) {
    const bx = S.settings.bed.x, by = S.settings.bed.y;
    const pts = [[-bx / 2, -by / 2], [bx / 2, -by / 2], [bx / 2, by / 2], [-bx / 2, by / 2], [-bx / 2, -by / 2]].map(([x, y]) => new THREE.Vector3(x + c.x, y + c.y, -0.2));
    ED.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--signal')) })));
    const bad = edRes.parts.filter((p) => p.check && !p.check.ok).length;
    ED.legend.innerHTML = `Bed ${bx} × ${by} — ${bad ? `<b style="color:var(--warn)">${bad} part${bad > 1 ? 's need' : ' needs'} support</b>` : 'every part as it prints, no supports'} · <span style="color:#e9b27b">■</span> 50–65° <span style="color:#e5542e">■</span> past 65° <span style="color:#f2a33a">■</span> flat underside`;
  } else ED.legend.textContent = '42 mm grid';
  const n = Math.ceil(Math.max(size.x, size.y, 120) / 42 / 2) * 2 + 4;
  const grid = new THREE.GridHelper(42 * n, n, new THREE.Color(css('--line') ? '#b9b9b6' : '#bbb'), new THREE.Color('#d8d8d5'));
  grid.rotation.x = Math.PI / 2; grid.position.set(Math.round(c.x / 42) * 42, Math.round(c.y / 42) * 42, -0.3);
  grid.material.transparent = true; grid.material.opacity = 0.55;
  ED.root.add(grid);
  if (refit || !ED.framed) { ED.frame(box); ED.framed = true; } else ED.render();
}
function fitEditor() { const box = new THREE.Box3(); ED.root.children.forEach((o) => { if (o.isGroup) box.expandByObject(o); }); ED.frame(box); }
function renderEditorStats() {
  const r = edRes, draft = D();
  const cells = [];
  if (r._subs) cells.push(`<div><div class="k">${draft.mode === 'mount' ? 'Saddles' : 'Hooks'}</div><div class="v">${r._subs.length}</div></div>`);
  for (const p of r.parts.slice(0, r._subs ? 0 : 6)) {
    const s = p.stats.size;
    cells.push(`<div><div class="k">${esc(draft.mode === 'desk' && !STACKED.includes(draft.p.kind) ? draft.p.kind : p.key.replace('insert_', ''))} · ${p.key === 'stand' || p.key === 'housing' ? 'on its ' + (p.key === 'stand' ? 'side' : 'back') : 'size'}</div><div class="v">${f1(s[0])} × ${f1(s[1])} × ${f1(s[2])}</div></div>`);
  }
  const mass = r.parts.reduce((a, p) => a + p.mass, 0);
  cells.push(`<div><div class="k">Filament ≈ (settings per part)</div><div class="v">${f0(mass)} g</div></div>`);
  const bad = r.parts.filter((p) => !p.bed.ok).length;
  cells.push(`<div><div class="k">Bed ${S.settings.bed.x} × ${S.settings.bed.y}</div><div class="v ${bad ? 'bad' : ''}">${bad ? `${bad} too big` : r.parts.some((p) => p.bed.angle) ? 'fits, turned' : 'fits'}</div></div>`);
  if (r.placement) cells.push(`<div><div class="k">Studs on real holes</div><div class="v ${r.placement.studs.some((s) => !s.ok) ? 'bad' : ''}">${r.placement.studs.filter((s) => s.ok).length} / ${r.placement.studs.length}</div></div>`);
  if (r.placement) cells.push(`<div><div class="k">Snapped to</div><div class="v">x ${f1(r.placement.bx)} · y ${f1(r.placement.by)}</div></div>`);
  { const pl = (hooky(draft.mode) || draft.mode === 'shelf') && draft.p.mount !== 'studs' && draft.p.mount !== 'pins' ? wallPlacement(draft.mode, draft.p) : null;
    if (pl && pl.pick) cells.push(`<div><div class="k">Dovetail${pl.pick.auto ? ' · auto' : ''}${pl.bases.length > 1 ? ` · ${pl.bases.length} bases` : ''}</div><div class="v ${pl.pick.over ? 'bad' : ''}">${pl.D.id} · ${f0((pl.pick.need / pl.pick.cap) * 100)} % of its rating</div></div>`); }
  const ch = [];
  for (const w of draft.fitWarns || []) ch.push(`<div class="check warn"><span class="tag">fit</span><span>${esc(w)}</span></div>`);
  if (hooky(draft.mode)) {
    const hp = draft.p, cap = capOf(hp), t = tool(hp.forTool) || (draft.for.length === 1 ? tool(draft.for[0].id) : null);
    cells.push(`<div><div class="k">Holds about${r._subs ? ` (${draft.mode === 'mount' ? 'saddle' : 'hook'} ${draft.rowSel + 1})` : ''}</div><div class="v ${t && t.g && t.g > cap * 0.8 ? 'bad' : ''}">${cap > 5000 ? '5 kg +' : `${f0(cap)} g`}</div></div>`);
    if (t && t.g && t.g > cap * 0.8) ch.push(`<div class="check warn"><span class="tag">load</span><span>${esc(t.name)} weighs ${f0(t.g)} g — near or over what this ${draft.mode === 'mount' ? 'saddle' : 'hook'} carries. Shorter reach, ${hp.mount === 'studs' ? 'more stud rows' : 'a bigger dovetail size'}, a thicker wire or a U-hook.</span></div>`);
    if (r._subs) for (const sb of r._subs) { const tt = tool(sb.tool), c = capOf(sb.p); if (tt && tt.g && tt.g > c * 0.8 && sb.p !== hp) ch.push(`<div class="check warn"><span class="tag">load</span><span>${esc(tt.name)} (${f0(tt.g)} g) is near its hook’s ${f0(c)} g</span></div>`); }
  }
  $('#edStats').innerHTML = cells.join('');
  for (const w of r.warnings) ch.push(`<div class="check warn"><span class="tag">check</span><span>${esc(w)}</span></div>`);
  if (onable(draft)) {
    const pseudo = { id: draft.itemId || '__draft', mode: draft.mode, name: draft.name, p: draft.p };
    const list = mapItems(draft);
    withItems(list, () => { for (const c of workspaceChecks()) if (c.it.id === pseudo.id && !c.note) ch.push(`<div class="check warn"><span class="tag">place</span><span>${esc(c.msg)}</span></div>`); });
  }
  for (const w of r.info) ch.push(`<div class="check"><span class="tag">note</span><span>${esc(w)}</span></div>`);
  const shown = r._subs ? r.parts.filter((p) => p.hookIdx === 0) : r.parts;
  for (const p of shown) {
    const c = p.check, bad = c && !c.ok;
    ch.push(`<div class="check ${bad ? 'warn' : 'ok'}"><span class="tag">print</span><span>${r._subs ? `${r._subs.length} ${p.role === 'base' ? 'bases' : draft.mode === 'mount' ? 'saddles' : 'hooks'} — ` : `${esc(p.name)}${p.count > 1 ? ` (${p.count})` : ''} — `}${esc(p.orient)}${p.bed.angle ? `, turned ${p.bed.angle}°` : ''}${c ? ` · ${esc(c.summary.join('; '))}` : ''}${p.profile ? ` · <b>${esc(settingsText(p.profile))}</b>` : ''}</span></div>`);
  }
  if (hooky(draft.mode)) ch.push(`<div class="check"><span class="tag">load</span><span>Load ratings are rough: the wire’s bending at 80 % of the reach, and the dovetail base’s rating (S 0.6, M 1.5, L 3 kg at 60 mm out on Board A; double on B). Hang the tool and watch it for a day before trusting it.</span></div>`);
  $('#edChecks').innerHTML = ch.join('');
}
function renderEditorMap() {
  const draft = D(), el = $('#edMap');
  let boardId = null, drawer = null;
  if (draft.mode === 'shelf' || hooky(draft.mode)) boardId = draft.p.board;
  else if (draft.mode === 'table') boardId = 'T';
  else if (draft.mode === 'drawer') drawer = { id: draft.itemId || '__draft', mode: 'drawer', name: draft.name, p: draft.p };
  else if (onable(draft) && draft.p.on && draft.p.on.mount) {
    const m = itemById(draft.p.on.mount);
    if (m) { if (m.mode === 'shelf') boardId = m.p.board; else if (m.mode === 'table') boardId = 'T'; else if (m.mode === 'drawer') drawer = m; }
  }
  if (boardId) {
    const b = BD.BOARDS[boardId];
    el.innerHTML = `<div class="card mapwrap"><div class="maphead"><b>${esc(b.name)}</b><span class="mute">${esc(b.note)}</span></div><div class="mapscroll ${boardId === 'B' ? 'tall' : ''}">${boardSVG(boardId, { draft })}</div><div class="hover" id="edHover"></div></div>`;
    wireMap($('svg', el), boardId, 'editor');
  } else if (drawer) {
    el.innerHTML = `<div class="card mapwrap"><div class="maphead"><b>${esc(drawer.name)}</b><span class="mute">Plan view, back at the top. Tiles in alternating tones.</span></div><div class="mapscroll drawer">${drawerSVG(drawer, { draft })}</div></div>`;
    wireDrawerMap($('svg', el), drawer);
  } else el.innerHTML = onable(draft) ? '<div class="card mapwrap"><p class="blurb" style="margin:0">Not placed. Pick a shelf, table plate or drawer under Place on to see it in the room.</p></div>' : '';
}
function wireMap(svg, boardId, ctx) {
  if (!svg) return;
  const hover = ctx === 'editor' ? $('#edHover') : $(`#hov_${boardId}`);
  svg.addEventListener('mousemove', (e) => { const q = svgPoint(svg, e); if (hover) hover.textContent = hoverText(boardId, q.x, q.y); });
  svg.addEventListener('click', (e) => {
    const q = svgPoint(svg, e);
    const hit = e.target.closest('[data-id]');
    if (ctx === 'workspace') { if (hit) { selectItem(hit.dataset.id); } return; }
    const draft = D();
    if (hooky(draft.mode)) { draft.p.at = { x: Math.round(q.x), y: Math.round(q.y) }; renderEditorPanelValues(); scheduleBuild(30); return; }
    if (draft.mode === 'shelf' || draft.mode === 'table') {
      const d = draft.mode === 'shelf' ? G.shelfDims(draft.p) : G.tablePlateDims(draft.p);
      const H = draft.mode === 'shelf' ? draft.p.backH : d.Dt;
      draft.p.at = { x: Math.round(q.x - d.Wt / 2), y: Math.round(q.y - H / 2) };
      renderEditorPanelValues(); scheduleBuild(30);
    } else if (onable(draft) && draft.p.on && draft.p.on.mount) {
      const m = itemById(draft.p.on.mount), dm = derive(m);
      let a, c;
      if (m.mode === 'shelf') { a = Math.floor((q.x - dm.pl.bx - dm.rim) / 42); c = 0; }
      else { a = Math.floor((q.x - dm.pl.bx - dm.rim) / 42); c = Math.floor((q.y - dm.pl.by - dm.rim) / 42); }
      draft.p.on.a = Math.max(0, Math.min(dm.nx - draft.p.nx, a)); draft.p.on.c = Math.max(0, Math.min(dm.ny - draft.p.ny, c));
      renderEditor();
    }
  });
}
function wireDrawerMap(svg, drawer) {
  if (!svg) return;
  svg.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-id]');
    if (S.tab === 'workspace') { if (hit) selectItem(hit.dataset.id); return; }
    const draft = D();
    if (!onable(draft)) return;
    const q = svgPoint(svg, e), dm = derive(drawer), pl = dm.plan;
    const W = drawer.p.sizing === 'drawer' ? drawer.p.W : pl.totalW, D = drawer.p.sizing === 'drawer' ? drawer.p.D : pl.totalD;
    const ox = drawer.p.sizing === 'drawer' ? (W - pl.totalW) / 2 : 0, oy = drawer.p.sizing === 'drawer' ? (D - pl.totalD) / 2 : 0;
    draft.p.on.a = Math.max(0, Math.min(pl.nx - draft.p.nx, Math.floor((q.x - ox - pl.pad.L) / 42)));
    draft.p.on.c = Math.max(0, Math.min(pl.ny - draft.p.ny, Math.floor((q.y - oy - pl.pad.B) / 42)));
    renderEditor();
  });
}
function renderEditorPanelValues() {
  const draft = D();
  $$('[data-k]', $('#panel')).forEach((el) => {
    const v = getPath(draft.p, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = el.dataset.plus1 ? (v | 0) + 1 : v;
  });
}
function readVal(el) {
  if (el.dataset.t === 'bool') return el.checked;
  if (el.dataset.t === 'text') return el.value.trim();
  if (el.dataset.t === 'sel') { const v = el.value; return v === 'true' ? true : v === 'false' ? false : v; }
  let v = el.dataset.t === 'int' ? parseInt(el.value, 10) : parseFloat(el.value);
  if (!Number.isFinite(v)) v = 0;
  if (el.min !== '' && v < +el.min) v = +el.min;
  if (el.max !== '' && v > +el.max) v = +el.max;
  if (el.dataset.plus1) v -= 1;
  return v;
}

// desk organisers: a new kind starts from its first preset (on the same bottom if there is one);
// flat ↔ grid carries the size across in whole units
function deskSwitch(p, k, v) {
  if (k === 'kind') {
    const want = p.base || 'flat', on = p.on;
    const pr = PRESETS.desk.find((x) => x.p.kind === v && (x.p.base || 'flat') === want) || PRESETS.desk.find((x) => x.p.kind === v);
    for (const key of Object.keys(p)) delete p[key];
    Object.assign(p, structuredClone(pr.p));
    if (!NO_BASE.includes(v) && (p.base || 'flat') !== want) deskSwitch(p, 'base', want);
    if (isGrid(p)) p.on = on;
    return pr.id;
  }
  if (v === p.base) return;
  if (v === 'grid') {
    let w = p.kind === 'cup' ? p.dia + 4 : p.W, d = p.kind === 'cup' ? p.dia + 4 : p.D;
    if (p.kind === 'sorter') { const gs = String(p.gaps || '').split(/[,\s]+/).map(Number).filter((x) => x > 0), n = gs.length || p.n, sum = gs.length ? gs.reduce((a, b) => a + b, 0) : n * p.gap; d = sum + (n + 1) * (p.div || 2.4) + ((p.frontH || 60) + n * (p.step ?? 20)) * Math.tan(((p.lean || 0) * Math.PI) / 180); }
    p.nx = Math.max(1, Math.min(8, Math.round(w / 42) || 1)); p.ny = Math.max(1, Math.min(8, Math.ceil((d - 2) / 42) || 1)); p.U = Math.max(2, Math.round((p.H || 28) / 7));
    if (p.kind === 'cup') p.dia = Math.min(p.dia, 42 * Math.min(p.nx, p.ny) - 4);
  } else { p.W = 42 * p.nx - 0.5; if (p.kind !== 'sorter') p.D = 42 * p.ny - 0.5; p.H = 7 * p.U; p.on = null; }
  p.base = v;
}

// panel events (editor + workspace)
function onPanelChange(e) {
  const el = e.target;
  if (S.tab === 'trace') return onTraceChange(e);
  if (S.tab === 'tools') return onToolsChange(e);
  if (S.tab === 'scan') return onScanChange(e);
  if (S.tab !== 'make') return;
  const draft = D();
  if (el.id === 'mk_q') return;
  if (el.dataset.fn != null) { const f = draft.for[+el.dataset.fn]; if (f) { f.n = Math.max(1, Math.min(40, parseInt(el.value, 10) || 1)); fitDraft(draft); ED.framed = false; saveState(); renderEditor(); } return; }
  if (el.dataset.fit) { const v = parseFloat(el.value); draft.fit[el.dataset.fit] = Number.isFinite(v) ? v : 0; fitDraft(draft); saveState(); renderEditor(); return; }
  if (el.dataset.k && draft.for.length && ((draft.mode === 'hook' && el.dataset.k === 'type') || (draft.mode === 'mount' && el.dataset.k === 'orient'))) {
    const f = draft.for[curEntry(draft)]; if (f) { f[el.dataset.k] = el.value; fitDraft(draft); saveState(); renderEditor(); return; }
  }
  if (el.dataset.k && draft.mode === 'desk' && (el.dataset.k === 'kind' || el.dataset.k === 'base')) { const pid = deskSwitch(draft.p, el.dataset.k, el.value); if (pid) { draft.presetId = pid; const pr = PRESETS.desk.find((x) => x.id === pid); if (pr) draft.name = pr.label.split(' · ')[0]; } ED.framed = false; renderEditor(); return; }
  if (el.dataset.k) {
    setPath(draft.p, el.dataset.k, readVal(el));
    if (el.dataset.k === 'board' && draft.mode === 'shelf') { const b = BD.BOARDS[draft.p.board]; draft.p.pinLen = b.studLen; if (draft.p.backH < 49 && b.id === 'B') draft.p.backH = 49; }
    if (el.dataset.t === 'sel' || el.dataset.t === 'bool') renderEditor(); else { scheduleBuild(); refreshSaveButton(); }
    return;
  }
  if (el.dataset.g != null && el.dataset.gk) {
    const g = draft.p.groups[+el.dataset.g], k = el.dataset.gk;
    if (el.type === 'checkbox') g[k] = el.checked;
    else if (el.tagName === 'SELECT' && k !== 'shape') g[k] = el.value;
    else if (k === 'shape') { g.shape = el.value; if (g.shape === 'outline' && !g.pts) Object.assign(g, { pts: [[-30, -8], [30, -8], [30, 8], [-30, 8]], clear: 1, scale: 1, rot: 0, fingers: 2, fingerD: 20 }); renderEditor(); return; }
    else { const v = parseFloat(el.value); g[k] = Number.isFinite(v) ? v : 0; if (k === 'n' || k === 'rows' || k === 'fingers') g[k] = Math.max(k === 'fingers' ? 0 : 1, Math.round(g[k])); }
    scheduleBuild(); refreshSaveButton(); return;
  }
  const act = el.dataset.act;
  if (act === 'preset' && el.value) {
    const pr = typePresets(S.make).find((x) => x.id === el.value);
    S.drafts[S.make] = { type: S.make, mode: TYPE(S.make).mode, p: clone(pr.p), itemId: null, name: pr.label.split(' · ')[0], presetId: pr.id, for: [], fit: { clear: 0, gap: 0 } };
    ED.framed = false; renderEditor();
  } else if (act === 'name') { draft.name = el.value; draft.named = true; refreshSaveButton(); saveState(); }
  else if (act === 'zone' && el.value) {
    const boardId = draft.mode === 'shelf' ? draft.p.board : 'T';
    const z = BD.BOARDS[boardId].zones.find((q) => q.id === el.value);
    if (draft.mode === 'shelf') { const d = G.shelfDims(draft.p); draft.p.at = { x: Math.round(z.x0 + (z.x1 - z.x0 - d.Wt) / 2), y: Math.round(z.y1 - draft.p.backH - 1) }; }
    else { const d = G.tablePlateDims(draft.p); draft.p.at = { x: Math.round((z.x0 + z.x1 - d.Wt) / 2), y: Math.round((z.y0 + z.y1 - d.Dt) / 2) }; }
    renderEditorPanelValues(); scheduleBuild(30);
  } else if (act === 'on-mount') {
    draft.p.on = el.value ? { mount: el.value, a: 0, c: 0 } : null; renderEditor();
  }
}
function refreshSaveButton() {
  const draft = D(), it = draft && draft.itemId ? itemById(draft.itemId) : null, b = $('[data-act="update"]');
  if (!b || !it) return;
  const dirty = JSON.stringify(it.p) !== JSON.stringify(draft.p) || it.name !== draft.name;
  b.disabled = !dirty; b.textContent = dirty ? 'Update' : 'Saved';
}
function onPanelClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const act = b.dataset.act;
  if (S.tab === 'workspace') return workspaceAction(act, b);
  if (S.tab === 'trace') return traceAction(act, b);
  if (S.tab === 'plan') return planAction(act, b);
  if (S.tab === 'tools') return toolsAction(act, b);
  if (S.tab === 'scan') return scanAction(act, b);
  const draft = D();
  if (act === 'type') { S.make = b.dataset.type; ED.framed = false; saveState(); renderEditor(); return; }
  if (act === 'for-del') { draft.for.splice(+b.dataset.i, 1); fitDraft(draft); ED.framed = false; saveState(); renderEditor(); return; }
  if (act === 'for-clear') { draft.for = []; draft.row = null; draft.fitNotes = []; draft.fitFail = ''; saveState(); renderEditor(); return; }
  if (act === 'refit') { fitDraft(draft); ED.framed = false; saveState(); renderEditor(); toast('Fitted to the tools again'); return; }
  if (act === 'for-trace') { S.traceFor = draft.for.map((f) => toolId(f.id)); saveState(); setTab('trace'); return; }
  if (act === 'hook-sel') {
    if (!draft.row) return;
    const idx = draft.row.map((r, k) => (toolId(r.tool) === b.dataset.tool ? k : -1)).filter((k) => k >= 0);
    if (!idx.length) return;
    const at = idx.indexOf(draft.rowSel), k = at >= 0 ? idx[(at + 1) % idx.length] : idx[0];
    draft.rowSel = k; draft.p = draft.row[k].p; saveState(); renderEditor();
    return;
  }
  if (act === 'g-add') { draft.p.groups.push(mkGroup('round', 8, 8, 3, 0)); renderEditor(); }
  else if (act === 'g-del') { draft.p.groups.splice(+b.dataset.g, 1); renderEditor(); }
  else if (act === 'g-dup') { const g = clone(draft.p.groups[+b.dataset.g]); g.y = (g.y || 0) - 12; draft.p.groups.splice(+b.dataset.g + 1, 0, g); renderEditor(); }
  else if (act === 'trace') openTrace(+b.dataset.g);
  else if (act === 'g-trace-new') { draft.p.groups.push(mkGroup('outline', 0, 0, 1, 0, { depth: 0, clear: 1, fingers: 2, fingerD: 20, scale: 1, rot: 0, pts: null })); renderEditor(); openTrace(draft.p.groups.length - 1); }
  else if (act === 'nudge') {
    const boardId = draft.mode === 'shelf' || hooky(draft.mode) ? draft.p.board : 'T', st = BD.BOARDS[boardId].pitch;
    const dy = boardId === 'B' ? st : 25;
    const d = { '←': [-st, 0], '→': [st, 0], '↑': [0, -dy], '↓': [0, dy] }[b.dataset.dir];
    draft.p.at = { x: draft.p.at.x + d[0], y: draft.p.at.y + d[1] };
    renderEditorPanelValues(); scheduleBuild(30);
  } else if ((act === 'add') && draft.row && draft.row.length > 1) {
    for (const r of draft.row) { const t = tool(r.tool); S.items.push({ id: uid(), mode: draft.mode, name: `${t ? shortName(t) : 'Hook'} · ${draft.mode === 'mount' ? 'saddle' : (G.HOOK_TYPES.find((x) => x[0] === r.p.type) || [0, r.p.type])[1]}`.slice(0, 60), p: clone(r.p), for: [{ id: toolId(r.tool), n: 1 }] }); }
    toast(`Saved ${draft.row.length} hooks to the bench`); S.drafts[S.make] = null; saveState(); renderEditor();
  } else if (act === 'add' || act === 'saveas') {
    const id = uid();
    S.items.push({ id, mode: draft.mode, name: draft.name || TYPE(draft.type).label, p: clone(draft.p), for: forOf(draft.for).map((f) => ({ id: toolId(f.id), n: f.n })) });
    draft.itemId = id; draft.presetId = null; draft.row = null; S.sel = id; saveState(); renderEditor(); toast('Saved to the bench');
  } else if (act === 'update') {
    const it = itemById(draft.itemId); if (!it) return;
    it.p = clone(draft.p); it.name = draft.name; it.for = forOf(draft.for).map((f) => ({ id: toolId(f.id), n: f.n })); dcache.delete(it.id); saveState(); refreshSaveButton(); toast('Updated');
  } else if (act === 'delete') {
    deleteItem(draft.itemId); draft.itemId = null; renderEditor();
  } else if (act === 'zip') exportDraft();
}
function deleteItem(id) {
  const it = itemById(id); if (!it) return;
  S.items = S.items.filter((x) => x.id !== id);
  for (const x of S.items) if (x.p.on && x.p.on.mount === id) x.p.on = null;
  const c = wcache.get(id); if (c) c.geos.forEach((g) => g.geo.dispose()); wcache.delete(id); dcache.delete(id);
  if (S.sel === id) S.sel = null;
  saveState(); toast(`Deleted ${it.name}`);
}

// ---------- export ----------
function zipFor(mode, p, name, prefix = '') {
  const res = build(mode, p, S.settings);
  try {
    const files = res.parts.map((part) => { const m = G.meshOf(part.print); return { name: `${prefix}${part.name}.stl`, data: stlBinary(m.pos, m.idx, part.name) }; });
    files.push({ name: `${prefix}README.txt`, data: readme(mode, p, res, S.settings, name) });
    return files;
  } finally { freeParts(res); }
}
const slug = (s) => String(s || 'part').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'part';
function exportDraft() {
  const d = D();
  if (d.row && d.row.length > 1) {
    const files = [];
    d.row.forEach((r, k) => { const t = tool(r.tool); files.push(...zipFor(d.mode, r.p, t ? t.name : `hook ${k + 1}`, `${String(k + 1).padStart(2, '0')}_${slug(t ? shortName(t) : 'hook')}/`)); });
    return download(`gridlab_${slug(d.name)}.zip`, zipStore(files));
  }
  const files = zipFor(d.mode, d.p, d.name);
  download(`gridlab_${slug(d.name)}.zip`, zipStore(files));
}

// ---------- workspace ----------
function itemMeta(it) {
  const d = derive(it), p = it.p;
  if (it.mode === 'shelf') return `${p.nx} × ${p.ny} · Board ${p.board} · ${d.pl.dove ? `${d.pl.bases.length} × base ${d.pl.D.id} · ` : 'pins · '}x ${f0(d.pl.bx)} y ${f0(d.pl.by)}`;
  if (it.mode === 'table') return `${p.nx} × ${p.ny} · x ${f0(d.pl.bx)} y ${f0(d.pl.by)}`;
  if (it.mode === 'drawer') return `${d.nx} × ${d.ny} · ${d.plan.tiles.length} tile${d.plan.tiles.length > 1 ? 's' : ''}`;
  if (hooky(it.mode)) return `${it.mode === 'mount' ? `Saddle ${f0(p.width)} wide` : (G.HOOK_TYPES.find((t) => t[0] === p.type) || [0, p.type])[1]} · ${d.pl.dove ? `base ${d.pl.D.id} · ` : ''}row ${d.pl.studs[0].i + 1}, hole ${d.pl.studs[0].j + 1}`;
  const where = p.on && p.on.mount && itemById(p.on.mount) ? ` · on ${itemById(p.on.mount).name}` : '';
  if (it.mode === 'desk' && STACKED.includes(p.kind)) { const sz = G.stackSize(p.nx, p.ny); return `${p.kind === 'stack' ? `Desk stack · ${String(p.layers || '').split(',').filter((t) => t.trim()).length} drawer layers${p.caddy !== false ? ' + caddy' : ''}` : p.kind === 'caddy' ? 'Caddy' : `Drawer unit · ${p.n || 1} × ${f0(p.H)} mm`} · ${f0(sz.W)} × ${f0(sz.D)}`; }
  if (it.mode === 'desk') { const kl = (G.DESK_KINDS.find((k) => k[0] === p.kind) || [0, p.kind])[1].split(' — ')[0]; return `${kl} · ${onable(it) ? `${p.nx} × ${p.ny}${p.kind === 'sorter' ? '' : ` × ${p.U}U`}` : p.kind === 'stand' ? `${f0(p.W)} wide, ${p.angle}°` : p.kind === 'cup' ? `${p.shape} ${f0(p.dia)} × ${f0(p.H)}` : p.kind === 'sorter' ? `${f0(p.W)} wide` : `${f0(p.W)} × ${f0(p.D)} × ${f0(p.H)}`}${where}`; }
  return `${it.mode} ${p.nx} × ${p.ny}${it.mode === 'box' && p.kind === 'bin' ? ` × ${p.U}U` : it.mode === 'holder' ? ` × ${p.U}U` : ''}${where}`;
}
function holdsText(it) {
  const fs = forOf(it.for).map((f) => ({ t: tool(f.id), n: f.n })).filter((x) => x.t);
  if (!fs.length) return '';
  const names = fs.map((x) => shortName(x.t) + (x.n > 1 ? ` ×${x.n}` : ''));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} + ${names.length - 3} more` : names.join(', ');
}
function groupOf(it) {
  if (it.mode === 'shelf' || hooky(it.mode)) return `Board ${it.p.board}`;
  if (it.mode === 'table') return 'Table';
  if (it.mode === 'drawer') return 'Drawers';
  const m = it.p.on && it.p.on.mount ? itemById(it.p.on.mount) : null;
  if (!m) return 'Not placed';
  return groupOf(m);
}
function selectItem(id) {
  S.sel = id; saveState();
  $$('.item', $('#panel')).forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
  renderWorkspaceMaps(); highlightRoom();
}
function renderWorkspace() {
  const checks = workspaceChecks();
  const warnIds = new Set(checks.filter((c) => !c.note).map((c) => c.it.id));
  const groups = ['Board A', 'Table', 'Board B', 'Drawers', 'Not placed'];
  const hm = homes(), housed = LIB.list.filter((t) => t.kind !== 'bench' && hm.has(t.id)).length, total = LIB.list.filter((t) => t.kind !== 'bench').length;
  let h = `<h2>Bench</h2><p class="blurb">Everything saved, where it lives on Board A, the table, Board B and the drawers. Click to select, double-click to edit. ${housed} of ${total} tools have a home.</p>
    <div class="row"><label for="f_new">New part</label><select id="f_new" data-act="new"><option value="">Choose…</option>${TYPES.map((m) => `<option value="${m.id}">${m.label} — ${m.hint}</option>`).join('')}</select></div>
    <div class="actions"><button class="btn signal" type="button" data-act="export-all">Download everything .zip</button><button class="btn ghost" type="button" data-act="edit-sel" ${S.sel ? '' : 'disabled'}>Edit selected</button><button class="btn ghost" type="button" data-act="dup-sel" ${S.sel ? '' : 'disabled'}>Duplicate</button><button class="btn ghost" type="button" data-act="del-sel" ${S.sel ? '' : 'disabled'}>Delete</button></div>
    <div class="list">`;
  for (const gname of groups) {
    const list = S.items.filter((i) => groupOf(i) === gname);
    if (!list.length) continue;
    h += `<div class="grp">${gname}</div>`;
    for (const it of list) h += `<div class="item ${S.sel === it.id ? 'sel' : ''}" data-id="${it.id}" tabindex="0"><div style="min-width:0"><div class="nm">${esc(it.name)}</div><div class="meta">${esc(itemMeta(it))}</div>${holdsText(it) ? `<div class="holds">holds ${esc(holdsText(it))}</div>` : ''}</div><span class="flag ${warnIds.has(it.id) ? 'warn' : ''}" title="${warnIds.has(it.id) ? 'has checks' : 'clear'}"></span></div>`;
  }
  h += `</div><h3>Project</h3><div class="actions"><button class="btn ghost small" type="button" data-act="save-json">Save project .json</button><button class="btn ghost small" type="button" data-act="load-json">Load project</button><button class="btn ghost small" type="button" data-act="reset">Reset to the starter layout</button></div>
    <p class="unit">The bench is kept in this browser. The project file carries the parts, your tool edits and traced outlines to another machine.</p>`;
  $('#panel').innerHTML = h;
  if (!WS) {
    WS = new Viewer(40000);
    WS.hud = document.createElement('div'); WS.hud.className = 'hud';
    WS.hud.innerHTML = ['room:Whole bench', 'A:Board A', 'T:Table', 'B:Board B'].map((s) => { const [k, l] = s.split(':'); return `<button class="pill" type="button" data-cam="${k}">${l}</button>`; }).join('');
    WS.el.appendChild(WS.hud);
    WS.busy = document.createElement('div'); WS.busy.className = 'busy'; WS.el.appendChild(WS.busy);
    WS.legend = document.createElement('div'); WS.legend.className = 'legend'; WS.legend.textContent = 'Board A, the table and Board B to scale. Click a part to select it.'; WS.el.appendChild(WS.legend);
    WS.hud.addEventListener('click', (e) => { const b = e.target.closest('[data-cam]'); if (b) frameRoom(b.dataset.cam); });
    let down = null;
    WS.renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    WS.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const r = WS.renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), WS.camera);
      const hits = ray.intersectObjects(WS.parts || [], true);
      if (hits.length) { let o = hits[0].object; while (o && !o.userData.itemId) o = o.parent; if (o) selectItem(o.userData.itemId); }
    });
    WS.renderer.domElement.addEventListener('dblclick', () => { if (S.sel) openItem(S.sel); });
  }
  const tot = S.items.length;
  $('#stage').innerHTML = `<div id="wsSlot"></div><div class="stats" id="wsStats"></div><div class="checks" id="wsChecks"></div><div id="wsMaps"></div>`;
  $('#wsSlot').appendChild(WS.el);
  WS.resize();
  const warns = checks.filter((c) => !c.note), notes = checks.filter((c) => c.note);
  $('#wsChecks').innerHTML = (warns.length ? warns.map((c) => `<div class="check warn"><span class="tag">check</span><span><b>${esc(c.it.name)}</b> — ${esc(c.msg)}</span></div>`).join('') : `<div class="check ok"><span class="tag">clear</span><span>All ${tot} parts sit on real holes, inside their clearance lines, without overlaps.</span></div>`)
    + notes.map((c) => `<div class="check"><span class="tag">weight</span><span><b>${esc(c.it.name)}</b> ${esc(c.msg)}</span></div>`).join('');
  renderWorkspaceMaps();
  buildRoom();
}
function renderWorkspaceMaps() {
  const el = $('#wsMaps'); if (!el) return;
  const drawers = S.items.filter((i) => i.mode === 'drawer');
  el.innerHTML = ['A', 'T', 'B'].map((id) => { const b = BD.BOARDS[id]; return `<div class="card mapwrap" style="margin-bottom:14px"><div class="maphead"><b>${esc(b.name)}</b><span class="mute">${esc(b.note)}</span></div><div class="mapscroll ${id === 'B' ? 'tall' : ''}">${boardSVG(id)}</div><div class="hover" id="hov_${id}"></div></div>`; }).join('')
    + drawers.map((d) => `<div class="card mapwrap" style="margin-bottom:14px"><div class="maphead"><b>${esc(d.name)}</b><span class="mute">Drawer plan, back at the top.</span></div><div class="mapscroll drawer" data-dr="${d.id}">${drawerSVG(d)}</div></div>`).join('');
  for (const id of ['A', 'T', 'B']) wireMap($(`#hov_${id}`).previousElementSibling.querySelector('svg'), id, 'workspace');
  $$('[data-dr]', el).forEach((w) => wireDrawerMap($('svg', w), itemById(w.dataset.dr)));
  for (const svg of $$('svg', el)) svg.addEventListener('dblclick', (e) => { const hit = e.target.closest('[data-id]'); if (hit) openItem(hit.dataset.id); });
}
let roomJob = 0;
function buildRoom() {
  const job = ++roomJob;
  WS.clear(); addBoardsToRoom(WS); WS.parts = [];
  if (!WS.framedOnce) { frameRoom('room'); WS.framedOnce = true; } else WS.render();
  const queue = S.items.filter((i) => i.mode !== 'drawer');
  let k = 0, mass = 0, parts = 0;
  const step = () => {
    if (job !== roomJob) return;
    const t0 = performance.now();
    while (k < queue.length && performance.now() - t0 < 60) {
      const it = queue[k++];
      const c = buildItem(it);
      for (const pp of c.parts) { mass += pp.mass; parts++; }
      const pos = placeInRoom(it);
      if (!pos || !c.geos.length) continue;
      c.geos.forEach((ge, k) => {
        if (k > 0 && !ge.assembled) return;
        const g = meshOf(ge.geo, it.id === S.sel ? MAT.sel : ge.assembled || it.mode === 'shelf' || it.mode === 'table' ? MAT.mount : MAT.part);
        g.children[0].userData.shared = true;
        g.position.set(pos[0] + (ge.assembled && ge.pos ? ge.pos[0] : 0), pos[1] + (ge.assembled && ge.pos ? ge.pos[1] : 0), pos[2] + (ge.assembled && ge.pos ? ge.pos[2] : 0));
        g.userData.itemId = it.id; WS.root.add(g); WS.parts.push(g);
      });
    }
    WS.busy.textContent = k < queue.length ? `Building ${k} / ${queue.length}…` : '';
    WS.render();
    if (k < queue.length) setTimeout(step, 0);
    else {
      for (const it of S.items.filter((i) => i.mode === 'drawer')) { const c = buildItem(it); for (const pp of c.parts) { mass += pp.mass; parts++; } }
      const plates = packPlan().plates.length;
      $('#wsStats').innerHTML = `<div><div class="k">Parts saved</div><div class="v">${S.items.length}</div></div><div><div class="k">Files to print</div><div class="v">${parts}</div></div><div><div class="k">Filament ≈</div><div class="v">${f0(mass)} g</div></div><div><div class="k">Bed plates (${S.settings.bed.x} × ${S.settings.bed.y})</div><div class="v">${plates}</div></div>`;
    }
  };
  step();
}
function highlightRoom() { if (!WS || !WS.parts) return; for (const g of WS.parts) { const it = itemById(g.userData.itemId); g.children[0].material = g.userData.itemId === S.sel ? MAT.sel : it && (it.mode === 'shelf' || it.mode === 'table') ? MAT.mount : MAT.part; } WS.render(); }
function frameRoom(which) {
  const box = new THREE.Box3();
  if (which === 'A') box.set(new THREE.Vector3(0, -120, 0), new THREE.Vector3(2100, 0, 550));
  else if (which === 'T') box.set(new THREE.Vector3(0, -550, 0), new THREE.Vector3(2100, 0, 200));
  else if (which === 'B') box.set(new THREE.Vector3(ROOM.B.x0, -150, 0), new THREE.Vector3(ROOM.B.x0 + 781, 0, 1200));
  else box.set(new THREE.Vector3(0, -550, 0), new THREE.Vector3(ROOM.B.x0 + 781, 0, 1200));
  const dir = which === 'T' ? [0.15, -0.7, 1] : which === 'room' ? [0.25, -1, 0.55] : [0.12, -1, 0.3];
  WS.frame(box, dir, which === 'room' ? 0.95 : 1.05);
}
function workspaceAction(act, b) {
  if (act === 'export-all') return exportAll();
  if (act === 'edit-sel' && S.sel) return openItem(S.sel);
  if (act === 'dup-sel' && S.sel) { const it = itemById(S.sel); const c = clone(it); c.id = uid(); c.name = it.name + ' copy'; if (c.p.at) c.p.at.x += 50; if (c.p.on) c.p.on = null; S.items.push(c); S.sel = c.id; saveState(); renderWorkspace(); return; }
  if (act === 'del-sel' && S.sel) { deleteItem(S.sel); renderWorkspace(); return; }
  if (act === 'save-json') return download(`gridlab_project_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ gridlab: 2, settings: S.settings, items: S.items, lib: { edits: S.lib.edits, custom: S.lib.custom, outlines: S.lib.outlines } }, null, 1), 'application/json');
  if (act === 'load-json') return $('#projectFile').click();
  if (act === 'reset') { S.items = starterItems(); S.sel = null; wcache.forEach((c) => c.geos.forEach((g) => g.geo.dispose())); wcache.clear(); dcache.clear(); saveState(); renderWorkspace(); toast('Starter layout restored'); }
}
function exportAll() {
  const files = [];
  for (const it of S.items) files.push(...zipFor(it.mode, it.p, it.name, `${slug(groupOf(it))}/${slug(it.name)}/`));
  download(`gridlab_workspace_${new Date().toISOString().slice(0, 10)}.zip`, zipStore(files));
}

// ---------- print plan ----------
function packPlan(gap = 6) {
  const W = S.settings.bed.x - 10, H = S.settings.bed.y - 10;
  const rects = [];
  for (const it of S.items) { const c = buildItem(it); c.parts.forEach((p) => rects.push({ it, p, w: p.size[0], d: p.size[1] })); }
  for (const r of rects) if (r.w < r.d && r.d <= W) { const t = r.w; r.w = r.d; r.d = t; r.rot = true; }
  rects.sort((a, b) => b.d - a.d || b.w - a.w);
  const plates = [], over = [];
  for (const r of rects) {
    if (r.w > W || r.d > H) { if (r.d <= W && r.w <= H) { const t = r.w; r.w = r.d; r.d = t; r.rot = !r.rot; } else { over.push(r); continue; } }
    let placed = false;
    for (const pl of plates) {
      for (const row of pl.rows) if (row.x + r.w <= W && r.d <= row.h) { r.x = row.x; r.y = row.y; row.x += r.w + gap; pl.items.push(r); placed = true; break; }
      if (placed) break;
      if (pl.top + r.d <= H) { const row = { y: pl.top, h: r.d, x: r.w + gap }; r.x = 0; r.y = pl.top; pl.top += r.d + gap; pl.rows.push(row); pl.items.push(r); placed = true; break; }
    }
    if (!placed) { const pl = { rows: [{ y: 0, h: r.d, x: r.w + gap }], top: r.d + gap, items: [] }; r.x = 0; r.y = 0; pl.items.push(r); plates.push(pl); }
  }
  for (const r of over) plates.push({ rows: [], top: 0, items: [{ ...r, x: 0, y: 0 }], over: true });
  return { plates, W, H };
}
function renderPlan() {
  const { plates, W, H } = packPlan();
  const mass = plates.reduce((a, pl) => a + pl.items.reduce((b, r) => b + r.p.mass, 0), 0);
  let h = `<h2>Print plan</h2><p class="blurb">Every part in the workspace packed onto ${S.settings.bed.x} × ${S.settings.bed.y} plates with 5 mm margins, largest first. Download a plate as one folder of STLs, ready to drop on a Bambu Studio plate.</p>
    <div class="stats"><div><div class="k">Plates</div><div class="v">${plates.length}</div></div><div><div class="k">Files</div><div class="v">${plates.reduce((a, p) => a + p.items.length, 0)}</div></div><div><div class="k">Filament ≈</div><div class="v">${f0(mass)} g</div></div><div><div class="k">Material</div><div class="v">${esc((MATERIALS.find((m) => m.id === S.settings.material) || {}).label || 'custom')}</div></div></div>
    <div class="actions"><button class="btn signal" type="button" data-act="plan-all">Download all plates .zip</button></div><div class="plates">`;
  plates.forEach((pl, i) => {
    const m = pl.items.reduce((a, r) => a + r.p.mass, 0);
    h += `<div class="card plate"><div class="titlebar"><b>Plate ${i + 1}</b>${pl.over ? '<span style="color:var(--warn)">too big for the bed</span>' : ''}<span class="grow"></span><span class="num">${pl.items.length} file${pl.items.length > 1 ? 's' : ''} · ${f0(m)} g</span></div><svg viewBox="-5 -5 ${W + 10} ${H + 10}" role="img" aria-label="Plate ${i + 1} layout"><rect x="-5" y="-5" width="${W + 10}" height="${H + 10}" rx="6" fill="#fff" stroke="var(--line)"/>`;
    for (const r of pl.items) h += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.d}" rx="3" fill="var(--part)" stroke="${pl.over ? 'var(--warn)' : 'var(--ink)'}" stroke-width="1"/><text x="${r.x + 4}" y="${r.y + 13}" style="font:400 11px var(--sans);fill:var(--ink)">${esc((r.it.name + ' · ' + r.p.key).slice(0, Math.max(6, Math.floor(r.w / 6.5))))}</text><title>${esc(r.it.name)} — ${esc(r.p.name)}${r.rot ? ' (turned 90°)' : ''}</title>`;
    h += `</svg><div class="actions" style="margin:6px 0 0"><button class="btn ghost small" type="button" data-act="plan-one" data-i="${i}">Download plate ${i + 1}</button></div></div>`;
  });
  h += '</div>';
  $('#stage').innerHTML = `<div class="rules" style="max-width:none">${h}</div>`;
  $('#stage').onclick = (e) => { if (S.tab !== 'plan') return; const b = e.target.closest('[data-act]'); if (b && /^plan-/.test(b.dataset.act)) planAction(b.dataset.act, b); };
}
function planAction(act, b) {
  const { plates } = packPlan();
  const sel = act === 'plan-one' ? [+b.dataset.i] : plates.map((_, i) => i);
  const files = [];
  const done = new Map();
  for (const i of sel) {
    for (const r of plates[i].items) {
      const key = r.it.id;
      if (!done.has(key)) done.set(key, zipFor(r.it.mode, r.it.p, r.it.name, ''));
      const f = done.get(key).find((x) => x.name === `${r.p.name}.stl`);
      if (f) files.push({ name: `plate-${String(i + 1).padStart(2, '0')}/${slug(r.it.name)}__${f.name}`, data: f.data });
    }
  }
  files.push({ name: 'README.txt', data: `GRIDLAB print plan — ${sel.length} plate(s), bed ${S.settings.bed.x} × ${S.settings.bed.y}.\nEach folder is one plate. Import the folder into Bambu Studio, arrange, slice. No supports: every file is already lying the way it prints, and passed the print check (nothing past 65°, bridges under 25 mm).\nDovetail bases: 4 walls so the studs come out solid.\n` });
  download(act === 'plan-one' ? `gridlab_plate-${sel[0] + 1}.zip` : 'gridlab_print-plan.zip', zipStore(files));
}

// ---------- rules ----------
function profileDiagram() {
  const k = 34, X = (v) => 70 + v * k, Y = (z) => 250 - z * k;
  const pl = (pts) => pts.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ');
  // socket wall (left) — insets measured from the cell edge at x = 0; floor 0.35 under the profile
  const wall = [[-1.6, -1], [7.5, -1], [7.5, 0], [2.85, 0], [2.85, 0.35], [2.15, 1.05], [2.15, 2.85], [0, 5], [-1.6, 5]];
  // bin foot, 0.25 inside the cell edge, seated on the floor clearance
  const foot = [[0.25 + 2.95, 0.35], [0.25 + 2.15, 1.15], [0.25 + 2.15, 2.95], [0.25, 5.1], [0.25, 6.8], [7.5, 6.8], [7.5, 0.35]];
  const t = (x, z, s, c = 'var(--ink)') => `<text x="${X(x)}" y="${Y(z)}" style="font:500 12px var(--mono);fill:${c}">${s}</text>`;
  return `<svg viewBox="0 -12 420 342" style="width:100%;max-width:440px;height:auto;display:block" role="img" aria-label="Gridfinity socket and foot profiles">
    <polygon points="${pl(wall)}" fill="var(--wood)" stroke="var(--ink)" stroke-width="1.2"/>
    <polygon points="${pl(foot)}" fill="var(--part)" fill-opacity=".7" stroke="var(--signal)" stroke-width="1.8"/>
    <line x1="${X(0)}" x2="${X(0)}" y1="${Y(7.2)}" y2="${Y(-1.4)}" stroke="var(--mute)" stroke-dasharray="3 3"/>
    ${t(-1.5, 7.4, 'cell edge')}${t(4.1, 5.9, 'bin, 0.25 in from the edge', 'var(--signal)')}
    ${t(4.1, 2.2, 'foot 0.8 · 1.8 · 2.15', 'var(--signal)')}${t(4.1, 1.4, 'socket 0.7 · 1.8 · 2.15')}
    ${t(-1.5, -1.9, 'plate floor · 0.35 under the profile')}</svg>`;
}
// the dovetail in section: groove in the base (wood), tongue on the part (grey); and from the side, the 45° seat
function doveDiagram() {
  const D = G.doveDims('M', BD.BOARDS.A), c = S.settings.tol.dove ?? 0.2, k = 9;
  const um = D.rw + Math.SQRT2 * c, vc = D.d + c + 0.1, uc = um + vc, T = D.T, Wd = 30;
  const X = (u) => 160 + u * k, Y = (v) => 70 + v * k; // section: u across, v down the page = into the board
  const pl = (f, pts) => pts.map(([a, b]) => f(a, b)).join(' ');
  const xy = (u, v) => `${X(u).toFixed(1)},${Y(v).toFixed(1)}`;
  const base = [[-Wd / 2, 0], [-um, 0], [-uc, vc], [uc, vc], [um, 0], [Wd / 2, 0], [Wd / 2, T], [-Wd / 2, T]];
  const part = [[-Wd / 2, -4], [Wd / 2, -4], [Wd / 2, 0], [D.rw, 0], [D.ow, D.d], [-D.ow, D.d], [-D.rw, 0], [-Wd / 2, 0]];
  const txt = (x, y, s, col = 'var(--ink)', anc = 'start') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anc}" style="font:500 11px var(--mono);fill:${col}">${s}</text>`;
  // side section near the foot: v across (into the board), z down the board; z from zc to the base's bottom
  const zc = D.L - 12, H = D.H, q = 7, SX = (v) => 470 + v * q, SY = (z) => 34 + (z - zc) * q;
  const sxy = (v, z) => `${SX(v).toFixed(1)},${SY(z).toFixed(1)}`;
  const sBase = [[vc, zc], [T, zc], [T, H], [0, H], [0, 1 + D.L], [vc, 1 + D.L - vc]];
  const sTongue = [[-0.6, zc], [D.d, zc], [D.d, 1 + D.L - D.d], [0, 1 + D.L], [-0.6, 1 + D.L]];
  const sPart = [[-7, zc], [0, zc], [0, H + 2], [-7, H + 2]];
  return `<svg viewBox="0 0 640 190" style="width:100%;max-width:660px;height:auto;display:block;margin-top:12px" role="img" aria-label="Dovetail size M in section, and from the side at its foot">
    ${txt(X(-Wd / 2), 22, 'M in section — part on top, base below', 'var(--mute)')}
    <polygon points="${pl(xy, base)}" fill="var(--wood)" stroke="var(--ink)" stroke-width="1.2"/>
    <polygon points="${pl(xy, part)}" fill="var(--part)" fill-opacity=".85" stroke="var(--signal)" stroke-width="1.6"/>
    <line x1="${X(-Wd / 2 - 2)}" x2="${X(Wd / 2 + 2)}" y1="${Y(T)}" y2="${Y(T)}" stroke="var(--ink)" stroke-width="2.5"/>
    ${txt(X(-Wd / 2), Y(T) + 16, 'board face')}${txt(X(-Wd / 2) + 4, Y(-1.2), 'part', 'var(--signal)')}${txt(X(-Wd / 2) + 4, Y(T - 1.6), 'base')}
    ${txt(X(Wd / 2) + 10, Y(0.6), `${D.root} → ${D.outer} wide`)}${txt(X(Wd / 2) + 10, Y(2.4), `${D.d} deep, 45° flanks`)}${txt(X(Wd / 2) + 10, Y(4.2), `+${c} per flank`)}
    ${txt(SX(-7), 22, 'from the side, at its foot', 'var(--mute)')}
    <polygon points="${pl(sxy, sPart)}" fill="var(--part)" fill-opacity=".85" stroke="var(--signal)" stroke-width="1.4"/>
    <polygon points="${pl(sxy, sTongue)}" fill="var(--part)" fill-opacity=".85" stroke="var(--signal)" stroke-width="1.4"/>
    <polygon points="${pl(sxy, sBase)}" fill="var(--wood)" stroke="var(--ink)" stroke-width="1.2"/>
    <line x1="${SX(T)}" x2="${SX(T)}" y1="${SY(zc) - 4}" y2="${SY(H) + 6}" stroke="var(--ink)" stroke-width="2.5"/>
    ${txt(SX(T) + 10, SY(1 + D.L - 2), 'tongue’s 45° end')}${txt(SX(T) + 10, SY(1 + D.L - 0.2), 'on a 45° seat —')}${txt(SX(T) + 10, SY(1 + D.L + 1.6), 'nothing flat to sag')}</svg>`;
}
function renderRules() {
  const row = (n, lab, body) => `<section class="srow"><div class="lab"><span>${n}</span>${lab}</div><div>${body}</div></section>`;
  $('#stage').innerHTML = `<div class="rules">
  <div class="lead"><h2>The rules</h2><p class="note">Gridfinity sets the grid, the heights and the one interface everything shares. The pegboards stay as they are; only mounts know where the holes are. Every number below is what the generator uses.</p></div>
  ${row('01', 'From Gridfinity', `<ol>
      <li><b>42 mm grid.</b> Anything that holds things is n × 42 − 0.5 mm: 0.25 mm clearance a side, built into the part. Never scale a part to make it fit.</li>
      <li><b>7 mm height units.</b> A bin’s U counts to the top of its wall. The stacking lip rises 3.8 mm above, and a bin stacked on it lands back on the 7 mm grid.</li>
      <li><b>One interface.</b> Socket 0.7 · 1.8 · 2.15 (r 4 at 42) takes foot 0.8 · 1.8 · 2.15 (r 3.75 at 41.5). Anything with a foot fits any shelf, table plate or drawer.</li>
      <li><b>Magnets are optional.</b> 6 × 2 mm in Ø6.5 × 2.4 pockets, 26 mm apart, four a cell, press-fit or crush-rib. Gravity does the work on shelves and the table.</li>
      <li><b>Lip on boxes, not holders.</b> Standard 0.7 · 1.8 · 1.9, or reduced (no inner step) when the inside must stay clear.</li></ol>`)}
  ${row('02', 'For the bench', `<ol start="6">
      <li><b>The boards don’t change; mounts adapt.</b> Dovetail bases are the only wall parts that know the hole lattice; table plates know the table’s. Everything else just carries a tongue.</li>
      <li><b>Bases sit on the lattice.</b> S: two studs in a column, 25 apart. M: four on a 25 square. L: six, two columns 50 apart by three rows. Board B uses its 23.876 steps. Move a part one step and the same base fits.</li>
      <li><b>Studs print upright,</b> like the fit-test coupons: Ø4.7 × 15 on A, Ø7.65 × 18 on B — every base prints face down with its studs straight up. Never on a no-go hole.</li>
      <li><b>Wall parts slide into dovetails; table plates print face-down.</b> Push the base into the board, slide the part down until it seats. Pinned shelves are still there for parts already printed. Table plates print face-down with studs up and 45° funnels.</li>
      <li><b>Respect the lines.</b> Bay 2 nothing below y 425, Bays 1 and 3 below y 500, Board B below y 950. Tool envelopes count, not just the plastic.</li>
      <li><b>Fit the bed.</b> H2C single-nozzle left 325 × 320, right 305 × 320, both 300 × 320; H3C 330 × 320 on any tool. Seven units (300 mm) is the longest straight shelf. Drawer plates split into tiles that fit.</li>
      <li><b>One tolerance panel.</b> Hole, stud, socket, bin and pin allowances live in the printer and filament panel and apply to every part. Print the fit-test coupons before a batch, after a filament change, or when a part binds.</li></ol>`)}
  ${row('03', 'Fitting to tools', `<ol start="13">
      <li><b>Every part can be for a tool, or for many.</b> Pick tools in Tools or under For in Make. One tool gets one part; several get one holder or tray with a cut-out each, or a row of hooks spaced to their widths.</li>
      <li><b>Standing up:</b> pliers jaws-down in a slot (thickness + 1.2 × head + 1.2), drivers by the shaft (+0.8) with the handle resting on top, tweezers and brushes tips-down, meters and dies on edge. About a quarter of the tool goes in; the rest is the envelope above the shelf.</li>
      <li><b>Lying flat:</b> traced outline if there is one, otherwise a silhouette from the sizes. Pocket 60 % of the tool’s thickness, 1 mm clearance, finger scoops at the ends.</li>
      <li><b>Hooks:</b> pegs under 175 mm and 250 g, U-hooks above; rings between shaft and handle; cradles at two-thirds of a meter’s width; spool rods 2 mm under the bore. Load ratings are rough — bending at 80 % of the reach, ABS-GF on its side, about 5× margin.</li>
      <li><b>Measured beats listed.</b> A traced length replaces the listed one. Sizes marked est. come from the plan, not a caliper.</li>
      <li><b>Model a tool from its page in Tools:</b> a top photo (lying flat), a side photo (on its edge), an end photo (standing on its end) — camera straight down each time — or a 3D scan. A scan on a table loses the table; a scan in your hand loses the hand past the photo’s length, and the stretch your hand covered is filled from the scan beside it or a side photo.</li></ol>`)}
  ${row('04', 'Dovetail', `<ol start="18">
      <li><b>Groove in the base, tongue on the part.</b> 45° flanks, so a tongue prints whichever way its part does: standing, face down, or on its side with the tongue’s outer corner on the bed. The groove is open at the top and blind at the bottom.</li>
      <li><b>A 45° seat.</b> The tongue’s lower end is cut back 45° (shorter at the tip) and rests on a matching ramp, so a standing part has no flat underside to sag, and the weight wedges it snug instead of rattling.</li>
      <li><b>Sizes by load.</b> Auto picks the smallest whose rating covers the weight × how far out it hangs: ${['S', 'M', 'L'].map((c) => { const D = G.DOVE[c]; return `<b>${c}</b> ${D.root}→${D.root + 2 * D.d} wide, ${D.d} deep, ${D.L} long, base ${D.W} × ${D.L + 5} × ${D.T}, ${D.rate.A} kg at 60 mm on A (${D.rate.B} on B)`; }).join('; ')}. U-hooks and cradles wider than 50 mm start at M; shelves at M, with 1–3 tongues by width.</li>
      <li><b>Clearance is one number:</b> ${S.settings.tol.dove ?? 0.2} mm per flank, in the printer panel. The dovetail fit coupon has five stubs from two steps tight to two loose; the one that slides down on its own weight is right.</li></ol>${doveDiagram()}`)}
  ${row('05', 'Printable', `<ol start="22">
      <li><b>Nothing needs support.</b> Every part is checked as it lies on the bed: faces up to 50° past vertical print clean, 50–65° a little rough, past 65° is flagged. Flat undersides are fine only as bridges, held on two sides and under 25 mm.</li>
      <li><b>Round wire meets the bed at its 45° line</b> — flattened there, so the first layers don’t droop. Flat hooks (peg, J, L, hanger, spool rod) print on their side; U-hooks, rings and cradles print standing with prongs flat on the bed, no rise.</li>
      <li><b>Holes across a print</b> are teardrops, point up; see-through walls use hexagons point up; label tabs sit on 45° gussets; bases bridge one short groove ceiling.</li>
      <li><b>The Print view shows it:</b> orange past 50°, red past 65°, amber for flat undersides; each file’s check is listed under the part and in its README.</li>
      <li><b>Plastic where it carries load.</b> Hook prongs taper to 0.62 of the wire at the tip, with a filleted root — the stress stays highest at the root wherever the tool hangs. Wide standing hooks keep only a post up the tongue and a bar along the bed, joined by 45° gussets. Shelf back plates get diamond windows along their middle between the tongues. The tongue’s neck has a 0.8 mm fillet, the groove a matching 1 mm mouth chamfer.</li>
      <li><b>Print settings by job:</b> ${Object.values(PROFILES).map((pr) => `${esc(pr.label.toLowerCase())} ${pr.walls} walls, ${pr.infill} %`).join(' · ')}. Every file’s settings are under the part and in its README.</li></ol>`)}
  ${row('06', 'Desk organisers', `<ol start="28">
      <li><b>Flat or on the grid.</b> Flat bottoms get a 0.5 mm 45° chamfer at the bed edge, so the first layer doesn’t flare, and Ø10 × 1.2 recesses for stick-on bumpers. On Gridfinity feet they take the bin tolerance and sit in any shelf, table plate or drawer cell, like a bin.</li>
      <li><b>Angles that print.</b> A top that slopes down to the front and a floor that tilts down to it both face up. Scoops are quarter-rounds facing up and back. Slots lean back up to 30° and sorter dividers up to 25°, so their overhanging face stays inside the 50° limit.</li>
      <li><b>Stands print on their side.</b> Each layer is the whole side profile, so the back rest bends rather than snapping along a layer line. The cable funnel widens 45° toward the front, so the edge above it prints as a 45° roof. Stands use the shelf settings (3 walls, 12 %) because they carry a leaning load; everything else uses the bin settings.</li>
      <li><b>Desk stack: one footprint, any order.</b> Drawer units and the caddy share a footprint of 42 × units + 8 mm. Each stands on a 1.9 mm foot with 45° sides that drops into a 2 mm pocket on top of the unit below and rests on its 0.9 mm rim, walls flush. Drawers take Gridfinity bins; the caddy has a Gridfinity floor for bins, holders and the inserts (pens and markers, scissors and cutters, rulers, post-its).</li>
      <li><b>Drawers.</b> The housing prints on its back with the openings up, so there are no bridges and the flutes print with 45° roofs. Clearance is 0.4 mm a side and 0.6 above. A ridge under the ceiling just inside the front catches a tab on the drawer’s back wall, so it stops instead of falling out. The drawer’s sides sit 2.5 mm lower so only the tab meets the ridge; lift the front a little to take it out.</li>
      <li><b>Sizes:</b> trays and bins by width, depth and height (or units), compartments by count or ratios (2 1 1); cups by Ø or across the flats; slot blocks by slot width, spacing, depth and lean; sorters by slot widths, front height and step; stands by width, angle, rest length and the device’s thickness.</li></ol>`)}
  ${row('07', 'Profiles', profileDiagram())}
  ${row('08', 'ABS-GF on the H2C / H3C', `<ol>${MATERIALS[0].notes.map((n) => `<li>${esc(n)}</li>`).join('')}<li>The H3C ships with hardened steel nozzles; on the H2C use a hardened nozzle for glass-filled filament.</li></ol>`)}
  ${row('09', 'Borrowed from other generators', `<p class="note">Features adapted from the tools listed on <a href="https://gridfinity.xyz/">gridfinity.xyz</a>: lip styles, per-compartment label tabs, crush-rib magnets and corner-only magnets (Gridfinity Rebuilt); finger cut-outs, see-through wall patterns, lids and drawer padding (Gridfinity Extended, Perplexing Labs); printer-aware baseplate splitting (Extrabold); photo-traced tool pockets with finger notches (tooltrace, tracemate); layout planning on mounts and a packed print plan (Gridfinity Layout Tool, GridfinityStudio). Not built yet: half-grid feet, baseplate connector clips, embossed label text, STL import.</p>`)}
  </div>`;
}

// ---------- printer + filament dialog ----------
function renderProfile() {
  const st = S.settings, m = MATERIALS.find((q) => q.id === st.material);
  const n = (k, label, unit, step) => `<div class="row"><label for="pf_${k}">${label} <small>${unit}</small></label><input type="number" id="pf_${k}" data-pf="${k}" value="${getPath(st, k)}" step="${step}"></div>`;
  $('#profileBody').innerHTML = `
    <div class="row"><label for="pf_printer">Printer</label><select id="pf_printer" data-pf="printer">${PRINTERS.map((p) => `<option value="${p.id}" ${st.printer === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
    ${n('bed.x', 'Bed X', 'mm', 1)}${n('bed.y', 'Bed Y', 'mm', 1)}${n('bed.z', 'Height', 'mm', 1)}
    <div class="row"><label for="pf_material">Filament</label><select id="pf_material" data-pf="material">${MATERIALS.map((p) => `<option value="${p.id}" ${st.material === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
    <h3>Tolerances — apply to every part</h3>
    ${n('tol.hole', 'Hole allowance', 'mm on Ø', 0.01)}${n('tol.stud', 'Stud and pin Ø', 'mm', 0.01)}${n('tol.socket', 'Socket, extra per side', 'mm', 0.01)}${n('tol.bin', 'Bin, smaller per side', 'mm', 0.01)}${n('tol.pinFit', 'Pin-hole over pin', 'mm', 0.01)}${n('tol.dove', 'Dovetail clearance, per flank', 'mm', 0.01)}
    <h3>Print settings, by what the part does</h3>
    <ol class="unit" style="padding-left:18px;margin:0 0 6px;display:grid;gap:4px">${Object.values(PROFILES).map((pr) => `<li><b>${esc(pr.label)}</b> — ${esc(settingsText(pr))}. ${esc(pr.why)}.</li>`).join('')}</ol>
    ${n('density', 'Density, for the estimates', 'g/cm³', 0.01)}
    ${m ? `<h3>${esc(m.label)}</h3><ol class="unit" style="padding-left:18px;margin:0;display:grid;gap:4px">${m.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    <p class="unit">Choosing a filament resets the tolerances to its defaults. Tune them with the Fit test coupons.</p>`;
}
function onProfileChange(e) {
  const el = e.target, k = el.dataset.pf; if (!k) return;
  const st = S.settings;
  if (k === 'printer') { st.printer = el.value; const p = PRINTERS.find((q) => q.id === el.value); if (p && p.id !== 'custom') st.bed = { x: p.x, y: p.y, z: p.z }; }
  else if (k === 'material') { st.material = el.value; const m = MATERIALS.find((q) => q.id === el.value); st.tol = { hole: m.hole, stud: m.stud, socket: m.socket, bin: m.bin, pinFit: m.pinFit, dove: m.dove ?? 0.2 }; st.density = m.density; }
  else { const v = parseFloat(el.value); setPath(st, k, Number.isFinite(v) ? v : 0); if (k.startsWith('bed.')) st.printer = 'custom'; }
  saveState(); profileText(); renderProfile(); dcache.clear();
  if (S.tab === 'workspace') renderWorkspace(); else if (S.tab === 'plan') renderPlan(); else if (S.tab === 'make' || S.tab === 'trace') scheduleBuild(60);
}

// ---------- trace from a photo ----------
let traceGi = -1, tracePts = null, traceImg = null, traceTurn = false;
function openTrace(i) { traceGi = i; tracePts = null; $('#traceUse').disabled = true; $('#traceInfo').textContent = traceImg ? 'Adjust and use.' : 'No photo yet.'; if (traceImg) runTrace(); $('#traceDlg').showModal(); }
function runTrace() {
  if (!traceImg) return;
  const cv = $('#traceCanvas'), ctx = cv.getContext('2d');
  const sc = Math.min(600 / traceImg.width, 600 / traceImg.height, 1);
  const w = Math.round(traceImg.width * sc), h = Math.round(traceImg.height * sc);
  cv.width = w; cv.height = h; ctx.drawImage(traceImg, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
  let thr = +$('#traceThr').value;
  if (!thr) { // Otsu
    const hist = new Array(256).fill(0); for (const v of gray) hist[v]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * h - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
  }
  const inv = $('#traceInv').checked;
  const mask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mask[i] = inv ? gray[i] > thr : gray[i] < thr;
  // largest blob, preferring ones that don't touch the border
  const lab = new Int32Array(w * h).fill(-1); let best = null;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const q = [s]; lab[s] = s; let n = 0, edge = false, top = s;
    while (q.length) { const c = q.pop(); n++; const x = c % w, y = (c / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true; if (c < top) top = c;
      for (const d of [c - 1, c + 1, c - w, c + w]) if (d >= 0 && d < w * h && mask[d] && lab[d] < 0 && Math.abs((d % w) - x) <= 1) { lab[d] = s; q.push(d); } }
    const score = n * (edge ? 0.2 : 1);
    if (!best || score > best.score) best = { id: s, n, top, score };
  }
  if (!best || best.n < 50) { $('#traceInfo').textContent = 'No tool found — try another threshold or tick the light-on-dark box.'; return; }
  // Moore boundary trace from the top-left pixel of the blob
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === best.id;
  const sx = best.top % w, sy = (best.top / w) | 0;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts = [[sx, sy]]; let cx = sx, cy = sy, dir = 7, guard = 0;
  do {
    let found = false;
    for (let k = 0; k < 8; k++) { const nd = (dir + 6 + k) % 8, nx = cx + dirs[nd][0], ny = cy + dirs[nd][1]; if (inside(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; } }
    if (!found) break;
    pts.push([cx, cy]);
  } while (!(cx === sx && cy === sy) && ++guard < 200000);
  const paper = $('#tracePaper').value === 'custom' ? +$('#traceCustom').value : +$('#tracePaper').value;
  const mmpx = paper / w;
  let mm = pts.map(([x, y]) => [x * mmpx, -y * mmpx]);
  const eps = +$('#traceSimp').value || 0.6;
  const dp = (P) => { if (P.length < 3) return P; let dmax = 0, idx = 0; const [ax, ay] = P[0], [bx, by] = P.at(-1); const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((by - ay) * P[i][0] - (bx - ax) * P[i][1] + bx * ay - by * ax) / L; if (d > dmax) { dmax = d; idx = i; } }
    return dmax > eps ? [...dp(P.slice(0, idx + 1)).slice(0, -1), ...dp(P.slice(idx))] : [P[0], P.at(-1)]; };
  const half = Math.floor(mm.length / 2);
  mm = [...dp(mm.slice(0, half + 1)).slice(0, -1), ...dp(mm.slice(half))];
  if (mm.length > 3 && Math.hypot(mm[0][0] - mm.at(-1)[0], mm[0][1] - mm.at(-1)[1]) < 1e-6) mm.pop();
  const xs = mm.map((p) => p[0]), ys = mm.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  tracePts = mm.map(([x, y]) => [+(x - mx).toFixed(2), +(y - my).toFixed(2)]);
  traceTurn = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
  ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2; ctx.beginPath();
  tracePts.forEach(([x, y], i) => { const px = (x + mx) / mmpx, py = -(y + my) / mmpx; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath(); ctx.stroke();
  $('#traceInfo').textContent = `${tracePts.length} points · ${f1(Math.max(...xs) - Math.min(...xs))} × ${f1(Math.max(...ys) - Math.min(...ys))} mm · threshold ${thr}${traceTurn ? ' · will be turned to lie lengthwise' : ''}`;
  $('#traceUse').disabled = false;
}

// ---------- ghost tools ----------
function ghostMat() {
  if (!MAT.ghost) { MAT.ghost = new THREE.MeshStandardMaterial({ color: 0x4f6a86, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.5, depthWrite: false }); MAT.ghost.userData = { shared: true }; }
  return MAT.ghost;
}
function ghost(geo) { const m = new THREE.Mesh(geo, ghostMat()); m.userData.sharedMat = true; return m; }
function holderGhosts(p) {
  const grp = new THREE.Group(), lay = G.holderLayout(p), H = lay.H, tilt = (p.tilt || 0) * Math.PI / 180;
  for (const h of lay.holes) {
    const g = h.g, depth = g.through ? H + 2 : Math.min(g.depth > 0 ? g.depth : H - 6, H - 5.2);
    if (g.stand && g.tool) { const m = standGhost(g, h, H); if (m) { grp.add(m); continue; } }
    if (g.shape === 'outline') {
      if (!g.pts || g.pts.length < 3) continue;
      const sc = g.scale || 1, t = (g.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      const shape = new THREE.Shape(g.pts.map(([x, y]) => new THREE.Vector2((x * c - y * s) * sc, (x * s + y * c) * sc)));
      const th = g.toolT > 0 ? g.toolT : Math.min(depth + 4, 16);
      const m = ghost(new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 1 }));
      m.position.set(h.x, h.y, H - depth + 0.3); grp.add(m); continue;
    }
    const up = g.toolL > 0 ? g.toolL : p.above > 0 ? p.above : 25, len = depth + up - 0.3;
    let geo;
    if (g.shape === 'round') geo = new THREE.CylinderGeometry((g.a - 0.6) / 2, (g.a - 0.6) / 2, len, 28);
    else if (g.shape === 'hex') { geo = new THREE.CylinderGeometry((g.a - 0.4) / 2 / Math.cos(Math.PI / 6), (g.a - 0.4) / 2 / Math.cos(Math.PI / 6), len, 6); geo.rotateY(Math.PI / 6); }
    else geo = new THREE.BoxGeometry(g.a - 0.6, len, g.b - 0.6);
    geo.rotateX(Math.PI / 2);
    const pivot = new THREE.Group(); pivot.position.set(h.x, h.y, H); pivot.rotation.x = -tilt;
    const m = ghost(geo); m.position.set(0, 0, -depth + len / 2 + 0.3); pivot.add(m); grp.add(pivot);
  }
  return grp;
}
function hookGhosts(p, dims) {
  const t = p.tool; if (!t || !t.show || !dims || !dims.shift) return null;
  if (p.forTool && tool(p.forTool)) { const real = hangGhost(p, dims); if (real) return real; }
  const b = BD.BOARDS[p.board], hp = G.hookPaths(p, b), hd = G.hookDims(p, b);
  const grp = new THREE.Group(); grp.position.set(...dims.shift);
  const r = hd.r, xr = hp.xr, z0 = hp.z0, L = p.L || 40, a = hp.a ?? (p.rise || 0) * Math.PI / 180, y0 = hp.y0 ?? -r;
  const put = (geo, x, u, z) => { const m = ghost(geo); m.position.set(x, y0 - u, z); grp.add(m); return m; };
  const box = (X, Y, Z) => new THREE.BoxGeometry(X, Y, Z);
  if (t.kind === 'coil') {
    const R = Math.max(t.T, t.W / 2 - t.T / 2), geo = new THREE.TorusGeometry(R, t.T / 2, 12, 40); geo.rotateX(Math.PI / 2);
    put(geo, xr, p.type === 'j' || p.type === 'hanger' ? L : L * 0.6, z0 - R + r);
  } else if (t.kind === 'rod') {
    const geo = new THREE.CylinderGeometry(t.W / 2, t.W / 2, t.L, 24); geo.rotateX(Math.PI / 2);
    const Rg = (p.ringD || 22) / 2 + r, cu = (p.stem ?? 6) + Rg;
    if (p.type === 'ring') put(geo, hp.ring ? hp.ring.x : xr + Rg, hp.ring ? hp.ring.u : cu, z0 - t.L * 0.2); else put(geo, xr, L * 0.6, z0 - t.L * 0.2);
  } else if (t.kind === 'spool') {
    const geo = new THREE.CylinderGeometry(t.W / 2, t.W / 2, t.L, 40);
    const Rr = (p.spoolD || 18) / 2, cap = Rr + (p.stop || 4);
    put(geo, p.type === 'spool' ? (hp.dove ? hp.xc : 0.4 + Math.SQRT1_2 * Rr) : xr, Math.max(t.L / 2 + 4, L * 0.55), z0 + (p.type === 'spool' ? 0 : r) + L * 0.55 * Math.sin(a));
  } else if (t.kind === 'box') {
    const X = t.L, Y = t.W, Z = t.T;
    const cx = p.type === 'cradle' ? hp.xc : xr;
    put(box(X, Y, Z), cx, Math.min(L, Y) / 2 + 1, z0 + r + Z / 2);
  } else {
    // pliers and cutters: jaws, pivot and two splayed handles, in the plane of the board
    const plier = (x, u, zPivot, headDown) => {
      const g = new THREE.Group(); g.position.set(x, y0 - u, zPivot);
      const s = headDown ? -1 : 1, hl = t.L * 0.32, hw = Math.max(8, t.W * 0.28);
      const head = ghost(new THREE.BoxGeometry(hw, t.T * 0.8, hl)); head.position.set(0, 0, s * hl / 2); g.add(head);
      const piv = ghost(new THREE.CylinderGeometry(hw * 0.55, hw * 0.55, t.T, 20)); piv.rotation.x = Math.PI / 2; g.add(piv);
      for (const side of [-1, 1]) {
        const len = t.L * 0.7, arm = ghost(new THREE.BoxGeometry(Math.max(6, t.W * 0.16), t.T * 0.7, len));
        const spread = Math.atan2(t.W * 0.5 - 4, len) * side;
        const piv2 = new THREE.Group(); piv2.rotation.y = headDown ? spread : -spread; arm.position.set(0, 0, -s * len / 2); piv2.add(arm); g.add(piv2);
      }
      grp.add(g);
    };
    if (p.type === 'u') plier(hp.xc, L * 0.5, z0 + L * 0.5 * Math.sin(a) + r + 4, true);
    else { const u = p.type === 'l' ? L * 0.6 : p.type === 'j' || p.type === 'hanger' ? L * 0.8 : L * 0.55 * Math.cos(a), v = p.type === 'peg' ? L * 0.55 * Math.sin(a) : 0; plier(xr, u, z0 + v + r + 2, false); }
  }
  return grp;
}

// ---------- TRACE studio (photo → measured outlines → tray / laser insert) ----------
const TS = { src: null, corners: null, rect: null, k: 4, view: 'rect', sel: null, sheets: [], busy: false };
function TT() { if (!S.trace) S.trace = clone(TRACE_DEFAULT); return S.trace; }
const maxUnits = () => Math.max(1, Math.floor((Math.min(S.settings.bed.x, S.settings.bed.y) + 0.5) / 42));
const TOOLCOL = ['#ff5a1f', '#2f6fd6', '#2f7d4f', '#a8620a', '#8a3fd1', '#c2185b', '#00838f', '#5d4037'];
function paperDims() {
  const t = TT();
  let [w, h] = t.paper === 'custom' ? [t.pw, t.ph] : TR.PAPERS[t.paper];
  const c = TS.corners;
  if (c) { const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]); if (d(c[0], c[1]) + d(c[3], c[2]) > d(c[0], c[3]) + d(c[1], c[2])) [w, h] = [Math.max(w, h), Math.min(w, h)]; else [w, h] = [Math.min(w, h), Math.max(w, h)]; }
  return [w, h];
}
function loadSource(img) {
  const sc = Math.min(1, 2400 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
  const x = cv.getContext('2d'); x.drawImage(img, 0, 0, cv.width, cv.height);
  TS.src = x.getImageData(0, 0, cv.width, cv.height); TS.srcCanvas = cv;
  const ds = Math.min(1, 1000 / Math.max(cv.width, cv.height));
  const dc = document.createElement('canvas'); dc.width = Math.round(cv.width * ds); dc.height = Math.round(cv.height * ds);
  dc.getContext('2d').drawImage(cv, 0, 0, dc.width, dc.height);
  const q = TR.detectPaper(dc.getContext('2d').getImageData(0, 0, dc.width, dc.height));
  TS.corners = q ? q.map(([u, v]) => [u / ds, v / ds]) : [[0, 0], [cv.width, 0], [cv.width, cv.height], [0, cv.height]];
  TS.paperFound = !!q;
  rectify();
}
function rectify() {
  const [pw, ph] = paperDims();
  const k = TS.k = Math.min(4, 2400 / Math.max(pw, ph));
  const W = Math.round(pw * k), H = Math.round(ph * k);
  const Hinv = TR.homography([[0, 0], [W, 0], [W, H], [0, H]], TS.corners);
  TS.rect = TR.warp(TS.src, Hinv, W, H);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(TS.rect.data, W, H), 0, 0); TS.rectCanvas = cv;
  detectTools();
}
function detectTools() {
  const t = TT();
  const r = TR.detectTools(TS.rect, TS.k, t.det);
  const old = t.tools;
  t.tools = r.tools.map((q, i) => {
    const prev = old.find((o) => o.cx != null && Math.hypot(o.cx - q.cx, o.cy - q.cy) < 12);
    return { id: prev ? prev.id : uid(), name: prev ? prev.name : `Tool ${i + 1}`, pts: q.pts, L: q.L, W: q.W, area: q.area, cx: q.cx, cy: q.cy,
      include: prev ? prev.include : true, rot: prev ? prev.rot : 0, depth: prev ? prev.depth : 0, clear: prev ? prev.clear : '', fingerMode: prev ? prev.fingerMode : '', fingerD: prev ? prev.fingerD : 0,
      fingerLen: prev ? prev.fingerLen : 0, fingerDepth: prev ? prev.fingerDepth : 0, toolT: prev ? prev.toolT : 0, x: 0, y: 0, link: prev ? prev.link || '' : '', prof: prev ? prev.prof || '' : '', angle: q.angle };
  });
  autoLink(t.tools);
  TS.sheets = r.tools.map((q) => q.sheet); TS.thr = r.thr;
  arrange();
}
// match outlines to the tools you said are in the photo, by length
function autoLink(list) {
  const want = S.traceFor.map(tool).filter(Boolean); if (!want.length) return;
  const taken = new Set(list.filter((x) => x.link).map((x) => toolId(x.link)));
  for (const tl of list.filter((x) => !x.link).sort((a, b) => b.area - a.area)) {
    let best = null, bd = 1e9;
    for (const t of want) { if (taken.has(t.id)) continue; const dd = Math.abs(tl.L - (t.L || tl.L)) / Math.max(t.L || 1, 1); if (dd < bd) { bd = dd; best = t; } }
    if (best && (bd < 0.35 || want.length === 1)) { tl.link = best.id; tl.name = best.name; taken.add(best.id); }
  }
}
function linkOptions(tl) {
  const cur = tl.link ? toolId(tl.link) : '';
  const want = S.traceFor.map(tool).filter(Boolean);
  const pool = LIB.list.filter((t) => t.kind !== 'bench' && !want.includes(t));
  const near = pool.map((t) => [t, Math.abs((t.L || 0) - tl.L) / Math.max(tl.L, 1)]).sort((a, b) => a[1] - b[1]).slice(0, 14).map((x) => x[0]);
  const rest = pool.filter((t) => !near.includes(t)).sort((a, b) => a.name.localeCompare(b.name));
  const opt = (t) => `<option value="${esc(t.id)}" ${cur === t.id ? 'selected' : ''}>${esc(t.name)} · ${f0(t.L || 0)} mm</option>`;
  return `<option value="">Not linked to a tool</option>${want.length ? `<optgroup label="Tracing for">${want.map(opt).join('')}</optgroup>` : ''}<optgroup label="Closest in length">${near.map(opt).join('')}</optgroup><optgroup label="All tools">${rest.map(opt).join('')}</optgroup>`;
}
function saveOutlines() {
  const t = TT(), day = new Date().toISOString().slice(0, 10), view = t.view || 'top';
  let n = 0;
  for (const tl of t.tools) {
    if (tl.include === false || !tl.link) continue;
    const tt = tool(tl.link); if (!tt) continue;
    const pts = tl.pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
    if (view === 'side') {
      setViews(tt.id, { side: { pts, L: +tl.L.toFixed(1), T: +tl.W.toFixed(1), at: day }, flipSide: tipIsLeft(pts), overSide: false });
      if (tt.kind !== 'rod' && tt.kind !== 'spool' && Math.abs((tt.T || 0) - tl.W) > 0.4) editTool(tt.id, 'T', +tl.W.toFixed(1));
    } else if (view === 'end') {
      setViews(tt.id, { end: { pts, W: +tl.L.toFixed(1), T: +tl.W.toFixed(1), at: day } });
    } else {
      S.lib.outlines[tt.id] = { pts, L: +tl.L.toFixed(1), W: +tl.W.toFixed(1), area: Math.round(tl.area), src: 'photo', at: day };
      setViews(tt.id, { flipTop: tipIsLeft(pts) });
      // a measured length beats a listed or estimated one
      if (Math.abs((tt.L || 0) - tl.L) > 0.6) editTool(tt.id, 'L', +tl.L.toFixed(1));
      if (tt.kind !== 'plier' && tt.kind !== 'rod' && (tt.est || !tt.W)) editTool(tt.id, 'W', +tl.W.toFixed(1));
    }
    MEM.info.delete(tt.id);
    n++;
  }
  rebuildLib(); saveState();
  return n;
}
function toolBox(tl) {
  const o = G.outline2D({ ...traceGroup(tl, TT().tray), x: 0, y: 0 });
  const [x0, y0, x1, y1] = o.bounds;
  return { o, w: x1 - x0, d: y1 - y0, ox: (x0 + x1) / 2, oy: (y0 + y1) / 2 };
}
function arrange() {
  const t = TT(), inc = t.tools.filter((x) => x.include !== false);
  if (!inc.length) return true;
  const sizes = inc.map(toolBox);
  const res = TR.autoTray(sizes, { gap: t.tray.gap, margin: t.tray.margin, nx: t.tray.auto ? 0 : t.tray.nx, ny: t.tray.auto ? 0 : t.tray.ny, maxNx: maxUnits(), maxNy: maxUnits() });
  if (!res) { TS.arrangeFail = true; return false; }
  TS.arrangeFail = false;
  if (t.tray.auto) { t.tray.nx = res.nx; t.tray.ny = res.ny; }
  inc.forEach((x, i) => { x.x = +(res.pos[i][0] - sizes[i].ox).toFixed(1); x.y = +(res.pos[i][1] - sizes[i].oy).toFixed(1); });
  return true;
}
// a sample photo so the studio opens working: tools on a slightly skewed A4 sheet
function samplePhoto() {
  const cv = document.createElement('canvas'); cv.width = 1300; cv.height = 1500;
  const x = cv.getContext('2d');
  x.fillStyle = '#6e6358'; x.fillRect(0, 0, cv.width, cv.height);
  x.save(); x.translate(650, 760); x.rotate(-0.05); x.scale(1, 0.97);
  const k = 4.6; x.translate(-105 * k, -148.5 * k);
  x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, 210 * k, 297 * k);
  x.fillStyle = '#d9d6cf';
  const tool = (fn) => { x.save(); x.translate(4, 5); x.fillStyle = 'rgba(0,0,0,0.12)'; fn(); x.restore(); x.fillStyle = '#26282b'; fn(); };
  // pliers
  tool(() => { x.beginPath(); x.moveTo(60 * k, 30 * k); x.lineTo(74 * k, 30 * k); x.lineTo(78 * k, 95 * k); x.lineTo(98 * k, 160 * k); x.lineTo(108 * k, 230 * k); x.lineTo(96 * k, 232 * k); x.lineTo(82 * k, 168 * k); x.lineTo(67 * k, 120 * k); x.lineTo(52 * k, 168 * k); x.lineTo(38 * k, 232 * k); x.lineTo(26 * k, 230 * k); x.lineTo(36 * k, 160 * k); x.lineTo(56 * k, 95 * k); x.closePath(); x.fill(); x.beginPath(); x.arc(67 * k, 100 * k, 9 * k, 0, 7); x.fill(); });
  // screwdriver
  tool(() => { x.fillRect(150 * k, 40 * k, 6 * k, 120 * k); x.beginPath(); x.roundRect(144 * k, 160 * k, 18 * k, 95 * k, 6 * k); x.fill(); });
  x.fillStyle = '#c3352a'; x.beginPath(); x.roundRect(144 * k, 160 * k, 18 * k, 95 * k, 6 * k); x.fill();
  // tape roll
  tool(() => { x.beginPath(); x.arc(160 * k, 268 * k, 0.1, 0, 7); x.fill(); x.beginPath(); x.ellipse(165 * k, 275 * k, 0.1, 0.1, 0, 0, 7); x.fill(); });
  x.fillStyle = '#2f6fd6'; x.beginPath(); x.roundRect(120 * k, 262 * k, 70 * k, 22 * k, 11 * k); x.fill();
  x.restore();
  const img = new Image(); img.onload = () => { loadSource(img); TS.sample = true; renderTrace(); }; img.src = cv.toDataURL('image/jpeg', 0.9);
}
function renderTrace() {
  const t = TT();
  const papers = [['A4', 'A4 · 210 × 297'], ['A5', 'A5 · 148 × 210'], ['A3', 'A3 · 297 × 420'], ['Letter', 'Letter · 8.5 × 11 in'], ['Legal', 'Legal · 8.5 × 14 in'], ['custom', 'Custom']];
  const n = (k, label, v, step, unit = 'mm', extra = '') => `<div class="row"><label for="tr_${k.replace('.', '_')}">${label} <small>${unit}</small></label><input type="number" id="tr_${k.replace('.', '_')}" data-tk="${k}" value="${v}" step="${step}" ${extra}></div>`;
  const ck = (k, label, v) => `<div class="row"><label for="tr_${k.replace('.', '_')}">${label}</label><input type="checkbox" id="tr_${k.replace('.', '_')}" data-tk="${k}" ${v ? 'checked' : ''}></div>`;
  const sl = (k, label, v, opts) => `<div class="row"><label for="tr_${k.replace('.', '_')}">${label}</label><select id="tr_${k.replace('.', '_')}" data-tk="${k}">${opts.map(([o, l]) => `<option value="${o}" ${String(v) === String(o) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const tf = S.traceFor.map(tool).filter(Boolean), nLinked = t.tools.filter((x) => x.include !== false && x.link && tool(x.link)).length;
  let h = `${crumbHTML(`${{ top: 'top', side: 'side', end: 'end' }[t.view || 'top']} photo`)}<h2>Trace</h2><p class="blurb">Photo of tools on paper → measured outlines, linked to your tools → snug pockets in any tray you make, or a laser-cut insert.</p>
    ${(() => { const ft = tool(S.backTo) || (tf.length === 1 ? tf[0] : null); const k = t.view || 'top'; return ft ? `<div class="angles one"><div class="angle"><div class="ah"><b>${ANGLES[k].title} of ${esc(shortName(ft))}</b></div>${angleSVG(k, viewShapes(ft))}<p><b>${esc(ANGLES[k].pose)}</b> → ${esc(ANGLES[k].gives)}. ${esc(ANGLES[k].tip)}</p></div></div>` : ''; })()}
    ${tf.length ? `<div class="checks"><div class="check"><span class="tag">for</span><span>${tf.map((x) => esc(shortName(x))).join(', ')} — outlines link to these as they’re found. <button class="iconbtn" type="button" data-act="tr-for-clear">clear</button></span></div></div>` : '<p class="unit" style="margin:0 0 6px">Tip: pick tools in Tools and press Trace, so outlines link to them on their own.</p>'}
    <h3>1 · Photo</h3>
    <div class="row full"><input type="file" id="tr_file" accept="image/*" aria-label="Photo of tools on paper"></div>
    <p class="unit" style="margin:2px 0 8px">Tools on plain white paper, not touching. Shoot straight down in even light with the whole sheet in frame. ${TS.sample ? 'Showing a sample photo.' : ''}</p>
    ${sl('view', 'The tools are', t.view || 'top', [['top', 'lying flat — top view'], ['side', 'on their side — side view'], ['end', 'standing on end — end view']])}
    <p class="unit" style="margin:0 0 8px">${{ top: 'Lay each tool on its widest face. This gives the outline.', side: 'Turn each tool on its edge (Blu-Tack helps) so the camera sees its thickness along the length. Link each outline to its tool — the top and side views combine into a 3D model.', end: 'Stand each tool on its end and shoot straight down: this gives its cross-section. Optional — sharpens handles and round parts.' }[t.view || 'top']}</p>
    ${sl('paper', 'Paper', t.paper, papers)}
    ${t.paper === 'custom' ? n('pw', 'Paper width', t.pw, 0.5) + n('ph', 'Paper height', t.ph, 0.5) : ''}
    <div class="actions"><button class="btn ghost small" type="button" data-act="tr-refind">Find the paper again</button><button class="btn ghost small" type="button" data-act="tr-whole">Photo is already cropped to the paper</button></div>
    <h3>2 · Find the tools</h3>
    ${n('det.threshold', 'Sensitivity — 0 is automatic', t.det.threshold, 1, '', 'min="0" max="250"')}
    ${n('det.shadow', 'Ignore shadows', t.det.shadow, 0.1, '0–1', 'min="0" max="1"')}
    ${moreHTML('tr:det', n('det.smooth', 'Smoothing passes', t.det.smooth, 1, '0–3', 'min="0" max="3"') + n('det.simplify', 'Simplify', t.det.simplify, 0.1, 'mm', 'min="0.05" max="3"') + n('det.minArea', 'Ignore specks under', t.det.minArea, 10, 'mm²') + n('det.margin', 'Ignore the paper edge', t.det.margin, 0.5, 'mm') + n('det.close', 'Close gaps', t.det.close, 0.25, 'mm') + ck('det.fillHoles', 'Fill holes (plier handles, rings)', t.det.fillHoles))}
    <h3>3 · Tools <span class="unit">${t.tools.length} found</span></h3><div class="list">`;
  t.tools.forEach((tl, i) => {
    const pocket = toolBox(tl);
    h += `<div class="grpcard" style="margin-bottom:6px;${TS.sel === tl.id ? 'border-color:var(--ink)' : ''}" data-tool="${tl.id}">
      <div class="gh"><span style="width:10px;height:10px;border-radius:2px;background:${TOOLCOL[i % TOOLCOL.length]};flex:none"></span><input class="field" style="flex:1" data-tt="${i}" data-tf="name" value="${esc(tl.name)}" aria-label="Tool name">
      <label class="ck" title="Include in the tray"><input type="checkbox" data-tt="${i}" data-tf="include" ${tl.include !== false ? 'checked' : ''}>use</label>
      <button class="iconbtn" type="button" data-act="tr-rot" data-i="${i}" title="Turn 90°">⟳</button></div>
      <div class="row full" style="margin:2px 0 4px"><select data-tt="${i}" data-tf="link" aria-label="Which tool this is">${linkOptions(tl)}</select></div>
      <div class="grid4" style="grid-template-columns:1fr 1fr;margin:4px 0 6px"><label>thickness, mm<input type="number" data-tt="${i}" data-tf="toolT" value="${tl.toolT || ''}" placeholder="${f1(thickOf({ ...tl, toolT: 0 }).T)} ${thickOf({ ...tl, toolT: 0 }).src}" step="0.5" min="0"></label><label>3D shape<select data-tt="${i}" data-tf="prof">${[['', `auto — ${profOf({ ...tl, prof: '' }) === 'round' ? 'round' : 'flat'}`], ['flat', 'flat, outline × thickness'], ['round', 'round, turned on its long axis']].map(([v, l]) => `<option value="${v}" ${(tl.prof || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="mono unit">tool ${f1(tl.L)} × ${f1(tl.W)} mm · pocket ${f1(pocket.w)} × ${f1(pocket.d)} mm · ${f0(tl.area)} mm²${tl.link && tool(tl.link) ? ` · listed ${f0(tool(tl.link).L)} mm long` : ''}</div>
      ${moreHTML(`tr:tool:${tl.id}`, `<div class="grid4"><label>depth (0 = tray)<input type="number" data-tt="${i}" data-tf="depth" value="${tl.depth || 0}" step="0.5"></label><label>clearance (blank = tray)<input type="number" data-tt="${i}" data-tf="clear" value="${tl.clear ?? ''}" step="0.1"></label><label>rotate °<input type="number" data-tt="${i}" data-tf="rot" value="${tl.rot || 0}" step="1"></label>
        <label>x mm<input type="number" data-tt="${i}" data-tf="x" value="${tl.x}" step="0.5"></label><label>y mm<input type="number" data-tt="${i}" data-tf="y" value="${tl.y}" step="0.5"></label><label>scoop width<input type="number" data-tt="${i}" data-tf="fingerD" value="${tl.fingerD || 0}" step="1"></label><label>scoop length<input type="number" data-tt="${i}" data-tf="fingerLen" value="${tl.fingerLen || 0}" step="1"></label></div>
        <div class="inline" style="margin-top:6px"><span class="unit" style="flex:1">Finger scoops</span><select class="field" style="width:auto" data-tt="${i}" data-tf="fingerMode"><option value="">Tray default</option>${FINGER.map(([v, l]) => `<option value="${v}" ${tl.fingerMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`, 'Adjust this tool')}
    </div>`;
  });
  if (!t.tools.length) h += `<p class="blurb">${TS.src ? 'No tools found. Raise the sensitivity, lower “Ignore shadows”, or check the paper corners on the photo.' : 'Load a photo to start.'}</p>`;
  h += `</div><h3>4 · Tray</h3>
    ${sl('tray.auto', 'Footprint', t.tray.auto, [[true, 'Smallest that fits'], [false, 'Fixed size']])}
    ${!t.tray.auto ? n('tray.nx', 'Width', t.tray.nx, 1, 'units', `min="1" max="${maxUnits()}"`) + n('tray.ny', 'Depth', t.tray.ny, 1, 'units', `min="1" max="${maxUnits()}"`) : `<p class="unit" style="margin:0 0 6px">Now ${t.tray.nx} × ${t.tray.ny} units (${f1(42 * t.tray.nx - 0.5)} × ${f1(42 * t.tray.ny - 0.5)} mm).</p>`}
    ${n('tray.depth', 'Pocket depth', t.tray.depth, 0.5)}
    ${n('tray.clear', 'Clearance around each tool', t.tray.clear, 0.1)}
    ${sl('tray.fingerMode', 'Finger scoops', t.tray.fingerMode, FINGER)}
    ${moreHTML('tr:tray', sl('tray.autoU', 'Height', t.tray.autoU, [[true, 'From the deepest pocket'], [false, 'Fixed']]) + (!t.tray.autoU ? n('tray.U', 'Height', t.tray.U, 1, '× 7 mm', 'min="2" max="30"') : '')
      + n('tray.fingerD', 'Scoop width', t.tray.fingerD, 1) + n('tray.fingerLen', 'Scoop length — 0 = round', t.tray.fingerLen, 1) + n('tray.gap', 'Gap between tools', t.tray.gap, 0.5) + n('tray.margin', 'Margin to the edge', t.tray.margin, 0.5)
      + ck('tray.lip', 'Stacking lip', t.tray.lip) + sl('tray.magnets', 'Magnets', t.tray.magnets, MAG))}
    <div class="actions"><button class="btn ghost small" type="button" data-act="tr-arrange">Arrange again</button></div>
    <h3>5 · Use it</h3>
    <div class="actions"><button class="btn" type="button" data-act="tr-lib" ${nLinked ? '' : 'disabled'}>Save ${nLinked || ''} ${{ top: 'outline', side: 'side view', end: 'end view' }[t.view || 'top']}${nLinked === 1 ? '' : 's'} to the tools</button><button class="btn ghost" type="button" data-act="tr-make" ${nLinked ? '' : 'disabled'}>Make a tray from them</button></div>
    <div class="actions"><button class="btn ghost" type="button" data-act="tr-models" ${t.tools.length ? '' : 'disabled'}>Tool models .stl</button></div>
    <div class="actions"><button class="btn ghost" type="button" data-act="tr-save">Save this tray to the bench</button><button class="btn signal" type="button" data-act="tr-zip">Download .zip</button><button class="btn ghost" type="button" data-act="tr-copy">Copy dimensions</button></div>
    <p class="unit">Saved outlines stay with each tool: any tray you make for it in Make uses the traced shape. Link each outline with “This is” above.</p>
    <p class="unit">The zip holds the tray STL, the outlines as SVG and DXF for the R1 laser (foam, card or acrylic inserts), and a CSV of every tool’s size.</p>`;
  $('#panel').innerHTML = h;
  if (!ED) ED = new Viewer(8000);
  $('#stage').innerHTML = `<div class="card mapwrap"><div class="maphead"><b>Photo</b><span class="mute" id="trHead"></span><span style="flex:1"></span><button class="pill" type="button" data-trv="photo" aria-pressed="${TS.view === 'photo'}">Photo + paper corners</button><button class="pill" type="button" data-trv="rect" aria-pressed="${TS.view === 'rect'}">Straightened + outlines</button></div><canvas id="trCanvas" style="width:100%;max-height:560px;display:block;touch-action:none;cursor:crosshair"></canvas><div class="hover" id="trHover"></div></div>
    <div class="card mapwrap" id="rvCard"><div class="maphead"><b>Tools in 3D</b><span class="mute">rebuilt from the outlines, standing on the straightened photo — check each one</span><span class="grow"></span><button class="pill" type="button" data-rv="photo" aria-pressed="${RV.photo}">Photo</button><button class="pill" type="button" data-rv="dims" aria-pressed="${RV.dims}">Dimensions</button><select class="field" id="rvFocus" style="width:auto;min-width:150px" aria-label="Show one tool"></select></div><div id="rvSlot"></div><div id="rvTable"></div></div>
    <div class="card mapwrap"><div class="maphead"><b>Tray layout</b><span class="mute">Drag a tool to move it. Click a tool, then drag its points to edit the outline. Dark = the tool, light = the pocket with its clearance.</span></div><div id="trLayout"></div></div>
    <div id="edSlot"></div><div class="stats" id="edStats"></div><div class="checks" id="edChecks"></div>`;
  ensureEdHud();
  $('#edSlot').appendChild(ED.el); ED.resize();
  $$('[data-trv]').forEach((b) => b.addEventListener('click', () => { TS.view = b.dataset.trv; $$('[data-trv]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.trv === TS.view)); drawTraceCanvas(); }));
  wireTraceCanvas();
  drawTraceCanvas(); drawTraceLayout(); renderReview();
  ED.framed = false; scheduleBuild(0, true);
  if (!TS.src) samplePhoto();
}
function drawTraceCanvas() {
  const cv = $('#trCanvas'); if (!cv) return;
  const x = cv.getContext('2d');
  const src = TS.view === 'photo' ? TS.srcCanvas : TS.rectCanvas;
  if (!src) { cv.width = 600; cv.height = 300; x.fillStyle = css('--sheet'); x.fillRect(0, 0, 600, 300); x.fillStyle = css('--mute'); x.font = '14px "Helvetica Neue", Arial, sans-serif'; x.fillText('Loading the sample photo…', 20, 40); return; }
  const maxW = Math.min(900, cv.parentElement.clientWidth - 24), sc = Math.min(maxW / src.width, 560 / src.height);
  cv.width = Math.round(src.width * sc); cv.height = Math.round(src.height * sc); cv.style.width = cv.width + 'px';
  TS.canvasScale = sc;
  x.drawImage(src, 0, 0, cv.width, cv.height);
  const [pw, ph] = paperDims();
  if (TS.view === 'photo') {
    const c = TS.corners.map(([u, v]) => [u * sc, v * sc]);
    x.strokeStyle = '#ff5a1f'; x.lineWidth = 2; x.beginPath(); c.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.stroke();
    c.forEach(([u, v]) => { x.beginPath(); x.arc(u, v, 9, 0, 7); x.fillStyle = 'rgba(255,90,31,.25)'; x.fill(); x.stroke(); });
    $('#trHead').textContent = `${TS.paperFound === false ? 'Paper not found — drag the four corners onto the sheet. ' : ''}Drag the corners onto the paper’s corners.`;
  } else {
    const k = TS.k * sc;
    TT().tools.forEach((tl, i) => {
      const P = TS.sheets[i]; if (!P) return;
      x.strokeStyle = TOOLCOL[i % TOOLCOL.length]; x.lineWidth = TS.sel === tl.id ? 3 : 2; x.fillStyle = TOOLCOL[i % TOOLCOL.length] + '22';
      x.beginPath(); P.forEach(([u, v], j) => (j ? x.lineTo(u * k, v * k) : x.moveTo(u * k, v * k))); x.closePath(); x.fill(); x.stroke();
      const lab = `${i + 1} · ${f1(tl.L)} × ${f1(tl.W)}`;
      x.font = '500 12px "Helvetica Neue", Arial, sans-serif'; const tw = x.measureText(lab).width;
      x.fillStyle = 'rgba(20,22,26,.82)'; x.fillRect(tl.cx * k - tw / 2 - 5, tl.cy * k - 9, tw + 10, 18);
      x.fillStyle = '#fff'; x.fillText(lab, tl.cx * k - tw / 2, tl.cy * k + 4);
    });
    $('#trHead').textContent = `${pw} × ${ph} mm sheet · ${TT().tools.length} tool${TT().tools.length === 1 ? '' : 's'} · threshold ${TS.thr ?? '–'}`;
  }
}
function wireTraceCanvas() {
  const cv = $('#trCanvas'); let drag = -1;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width) / TS.canvasScale, (e.clientY - r.top) * (cv.height / r.height) / TS.canvasScale]; };
  cv.addEventListener('pointerdown', (e) => {
    if (!TS.src) return;
    const p = at(e);
    if (TS.view === 'photo') {
      let best = -1, bd = 1e9; TS.corners.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; best = i; } });
      if (bd * TS.canvasScale < 30) { drag = best; cv.setPointerCapture(e.pointerId); }
    } else {
      const i = TT().tools.findIndex((tl) => Math.hypot(tl.cx * TS.k - p[0], tl.cy * TS.k - p[1]) < Math.max(tl.L, tl.W) * TS.k / 2);
      if (i >= 0) { TS.sel = TT().tools[i].id; renderTrace(); }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (drag >= 0) { TS.corners[drag] = p; drawTraceCanvas(); return; }
    if (TS.view === 'rect' && TS.k) $('#trHover').textContent = `x ${f1(p[0] / TS.k)} · y ${f1(p[1] / TS.k)} mm on the sheet`;
  });
  cv.addEventListener('pointerup', () => { if (drag >= 0) { drag = -1; TS.corners = TR.orderCorners(TS.corners); rectify(); renderTrace(); } });
}
function drawTraceLayout() {
  const el = $('#trLayout'); if (!el) return;
  const t = TT(), Wo = 42 * t.tray.nx - 0.5, Do = 42 * t.tray.ny - 0.5, pad = 8;
  let s = `<svg viewBox="${-Wo / 2 - pad} ${-Do / 2 - pad} ${Wo + 2 * pad} ${Do + 2 * pad}" style="width:100%;max-height:420px;display:block;touch-action:none" xmlns="http://www.w3.org/2000/svg" id="trSvg">`;
  s += `<rect x="${-Wo / 2}" y="${-Do / 2}" width="${Wo}" height="${Do}" rx="3.75" fill="var(--part)" fill-opacity=".45" stroke="var(--ink)" stroke-width=".6"/>`;
  for (let i = 1; i < t.tray.nx; i++) s += `<line x1="${-Wo / 2 + 42 * i - 0.25}" x2="${-Wo / 2 + 42 * i - 0.25}" y1="${-Do / 2}" y2="${Do / 2}" stroke="var(--ink)" stroke-opacity=".18" stroke-dasharray="2 2" stroke-width=".4"/>`;
  for (let i = 1; i < t.tray.ny; i++) s += `<line y1="${-Do / 2 + 42 * i - 0.25}" y2="${-Do / 2 + 42 * i - 0.25}" x1="${-Wo / 2}" x2="${Wo / 2}" stroke="var(--ink)" stroke-opacity=".18" stroke-dasharray="2 2" stroke-width=".4"/>`;
  const m = t.tray.margin;
  s += `<rect x="${-Wo / 2 + m}" y="${-Do / 2 + m}" width="${Wo - 2 * m}" height="${Do - 2 * m}" fill="none" stroke="var(--ink)" stroke-opacity=".2" stroke-width=".3"/>`;
  const path = (P, dx, dy) => 'M' + P.map(([x, y]) => `${(x + dx).toFixed(2)},${(-(y + dy)).toFixed(2)}`).join('L') + 'Z';
  t.tools.forEach((tl, i) => {
    if (tl.include === false) return;
    const o = toolBox(tl).o, sel = TS.sel === tl.id, col = TOOLCOL[i % TOOLCOL.length];
    s += `<g class="hit" data-tool="${tl.id}" style="cursor:move">`;
    for (const P of o.pocket) s += `<path d="${path(P, tl.x, tl.y)}" fill="var(--sheet)" stroke="${sel ? 'var(--signal)' : 'var(--ink)'}" stroke-width="${sel ? 0.9 : 0.5}"/>`;
    for (const P of o.tool) s += `<path d="${path(P, tl.x, tl.y)}" fill="${col}" fill-opacity=".8"/>`;
    s += `<text x="${tl.x}" y="${-tl.y + 3}" text-anchor="middle" style="font:600 9px var(--mono);fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:2px">${i + 1}</text></g>`;
    if (sel) {
      const sc = 1, a = (tl.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      tl.pts.forEach(([u, v], j) => { const X = (u * c - v * sn) * sc + tl.x, Y = (u * sn + v * c) * sc + tl.y; s += `<circle cx="${X}" cy="${-Y}" r="1.4" fill="var(--sheet)" stroke="var(--signal)" stroke-width=".5" data-vtx="${j}" style="cursor:grab"/>`; });
    }
  });
  s += '</svg>';
  el.innerHTML = s;
  const svg = $('#trSvg');
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const q = svgPoint(svg, e);
    const vtx = e.target.closest('[data-vtx]');
    const tl = TT().tools.find((x) => x.id === TS.sel);
    if (vtx && tl) { drag = { kind: 'vtx', tl, j: +vtx.dataset.vtx }; svg.setPointerCapture(e.pointerId); return; }
    const g = e.target.closest('[data-tool]');
    if (g) { const tool = TT().tools.find((x) => x.id === g.dataset.tool); TS.sel = tool.id; drag = { kind: 'move', tl: tool, x0: q.x, y0: -q.y, tx: tool.x, ty: tool.y, moved: false }; svg.setPointerCapture(e.pointerId); }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const q = svgPoint(svg, e);
    if (drag.kind === 'move') { drag.tl.x = +(drag.tx + q.x - drag.x0).toFixed(1); drag.tl.y = +(drag.ty + (-q.y) - drag.y0).toFixed(1); drag.moved = true; }
    else { const a = -(drag.tl.rot || 0) * Math.PI / 180, dx = q.x - drag.tl.x, dy = -q.y - drag.tl.y; drag.tl.pts[drag.j] = [+(dx * Math.cos(a) - dy * Math.sin(a)).toFixed(2), +(dx * Math.sin(a) + dy * Math.cos(a)).toFixed(2)]; }
    drawTraceLayout();
  });
  svg.addEventListener('pointerup', () => { if (!drag) return; const wasClick = drag.kind === 'move' && !drag.moved, wasVtx = drag.kind === 'vtx'; drag = null; if (wasClick) renderTrace(); else { saveState(); scheduleBuild(60); renderTraceDims(); if (wasVtx) renderReview(); } });
}
// ---------- review: each traced tool rebuilt in 3D where it lay on the paper, with its dimensions ----------
const RV = { v: null, photo: true, dims: true, focus: 'all', labels: [], groups: [] };
// thickness: what you typed, else the linked tool's listed size, else a guess
function thickOf(tl) {
  if (tl.toolT > 0) return { T: tl.toolT, src: 'set' };
  const t = tl.link ? tool(tl.link) : null, view = TT().view || 'top';
  if (view === 'side') { const w = t ? (modelInfo(t.id) || {}).W || t.W : 0; return w > 0 ? { T: w, src: 'tool width' } : { T: 12, src: 'guess' }; }
  if (view === 'end') return t && t.L ? { T: t.L, src: 'tool length' } : { T: 100, src: 'guess' };
  if (t) { const T = t.kind === 'rod' ? t.D || t.W : t.kind === 'spool' ? t.L : t.T; if (T > 0) return { T, src: 'listed' }; }
  return { T: 10, src: 'guess' };
}
function profOf(tl) { if (tl.prof) return tl.prof; const t = tl.link ? tool(tl.link) : null; return t && t.kind === 'rod' ? 'round' : 'flat'; }
const ptsBox = (P) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };
// half-width of the outline at x: where a vertical line crosses it
function spanAt(P, x) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length]; if ((ax <= x && bx >= x) || (bx <= x && ax >= x)) { const y = ax === bx ? Math.max(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay); lo = Math.min(lo, ax === bx ? Math.min(ay, by) : y); hi = Math.max(hi, y); } }
  return hi > lo ? (hi - lo) / 2 : 0;
}
// the model in the tool's own frame: long axis along x, lying on z = 0
function modelOf(tl) {
  const P = tl.pts, b = ptsBox(P);
  const lt = tl.link ? tool(tl.link) : null, lv = lt ? viewsOf(lt.id) : {};
  if ((TT().view || 'top') === 'top' && lt && (lv.side || lv.end) && !tl.toolT && !tl.prof) {
    try {
      let side = sideOf(lt.id); if (side && tipIsLeft(P)) side = MD.mirrorX(side);
      const m = G.toolHull({ top: P, side, end: endOf(lt.id), T: FIT.dims(lt).T }), geo = geoFrom(m); m.delete();
      geo.computeBoundingBox();
      return { geo, T: geo.boundingBox.max.z, src: 'side photo', b };
    } catch (e) { /* fall back to outline × thickness */ }
  }
  if (profOf(tl) === 'round') {
    const n = 56, pts = [new THREE.Vector2(0, b.x0)];
    let R = 0;
    for (let k = 1; k < n; k++) { const x = b.x0 + ((b.x1 - b.x0) * k) / n, r = spanAt(P, x); R = Math.max(R, r); pts.push(new THREE.Vector2(Math.max(0.05, r), x)); }
    pts.push(new THREE.Vector2(0, b.x1));
    const geo = new THREE.LatheGeometry(pts, 40); geo.rotateZ(-Math.PI / 2); geo.translate(0, 0, R); geo.computeVertexNormals();
    return { geo, T: 2 * R, src: 'outline, turned', b, round: true };
  }
  const th = thickOf(tl), T = th.T, bt = Math.min(0.8, T / 6);
  const shape = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.2, T - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, bt); geo.computeVertexNormals();
  return { geo, T, src: th.src, b };
}
// thickness without building the model (tables, CSV)
function modelT(tl) {
  if (profOf(tl) !== 'round') return thickOf(tl);
  const b = ptsBox(tl.pts); let R = 0;
  for (let k = 1; k < 56; k++) R = Math.max(R, spanAt(tl.pts, b.x0 + ((b.x1 - b.x0) * k) / 56));
  return { T: 2 * R, src: 'outline, turned' };
}
function modelFiles(prefix) {
  return TT().tools.filter((x) => x.include !== false).map((tl, i) => {
    const m = modelOf(tl), g = m.geo.index ? m.geo.toNonIndexed() : m.geo;
    const pos = new Float32Array(g.attributes.position.array), idx = new Uint32Array(pos.length / 3).map((_, k) => k);
    const nm = `${String(i + 1).padStart(2, '0')}_${slug(tl.name)}_${f1(tl.L)}x${f1(tl.W)}x${f1(m.T)}`;
    const f = { name: `${prefix}${nm}.stl`, data: stlBinary(pos, idx, nm) };
    if (g !== m.geo) g.dispose(); m.geo.dispose();
    return f;
  });
}
function renderReview() {
  const slot = $('#rvSlot'); if (!slot) return;
  if (!RV.v) {
    RV.v = new Viewer(8000); RV.v.el.className = 'viewer rv';
    RV.lab = document.createElement('div'); RV.lab.className = 'rvlabels'; RV.v.el.appendChild(RV.lab);
    RV.busy = document.createElement('div'); RV.busy.className = 'legend'; RV.v.el.appendChild(RV.busy);
    const base = RV.v.render.bind(RV.v);
    RV.v.render = () => { base(); placeLabels(); };
  }
  slot.appendChild(RV.v.el); RV.v.resize();
  const t = TT(), sel = $('#rvFocus');
  if (sel) sel.innerHTML = `<option value="all">All tools</option>${t.tools.map((tl, i) => `<option value="${i}" ${String(RV.focus) === String(i) ? 'selected' : ''}>${i + 1} · ${esc(tl.name)}</option>`).join('')}`;
  if (RV.focus !== 'all' && !t.tools[+RV.focus]) RV.focus = 'all';
  buildReview();
  renderReviewTable();
}
function buildReview() {
  const v = RV.v, t = TT();
  v.clear(); RV.labels = []; RV.groups = []; RV.lab.innerHTML = '';
  const [pw, ph] = paperDims();
  if (RV.photo && TS.rectCanvas) {
    const tex = new THREE.CanvasTexture(TS.rectCanvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plane.position.set(pw / 2, -ph / 2, -0.05); v.root.add(plane);
  } else {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color: 0xf8f8f6 })); sheet.position.set(pw / 2, -ph / 2, -0.05); v.root.add(sheet);
  }
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(pw, ph)), new THREE.LineBasicMaterial({ color: 0x15150c, transparent: true, opacity: 0.35 }));
  edge.position.set(pw / 2, -ph / 2, 0); v.root.add(edge);
  const one = RV.focus === 'all' ? -1 : +RV.focus;
  t.tools.forEach((tl, i) => {
    if (tl.include === false && one !== i) return;
    const m = modelOf(tl), col = new THREE.Color(TOOLCOL[i % TOOLCOL.length]);
    const dim = one >= 0 && one !== i;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(m.geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.1, transparent: true, opacity: dim ? 0.18 : RV.photo ? 0.74 : 1, depthWrite: !dim }));
    g.add(mesh);
    if (!dim) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geo, 30), new THREE.LineBasicMaterial({ color: 0x15150c, transparent: true, opacity: 0.35 })); g.add(e); }
    // back to where it lay: sheet = centre + R(angle)·(x, −y); world y is −sheet y
    const ang = tl.angle != null ? tl.angle : 0;
    g.position.set(tl.cx, -tl.cy, 0); g.rotation.z = -ang;
    v.root.add(g); g.updateMatrixWorld(true);
    RV.groups[i] = g;
    if (RV.dims && !dim) dimsFor(g, m, tl, i);
  });
  if (!RV.framed || RV.refit) { frameReview(); RV.framed = true; RV.refit = false; } else v.render();
  RV.busy.textContent = `${t.tools.length} tool${t.tools.length === 1 ? '' : 's'} · ${f1(pw)} × ${f1(ph)} mm sheet · flat tools are outline × thickness, round ones turned on their long axis`;
}
// dimension lines in the tool's frame: length along one side, width across the working end, thickness standing at a corner
function dimsFor(g, m, tl, i) {
  const b = m.b, T = m.T, off = Math.max(6, (b.y1 - b.y0) * 0.12), tk = 2.2, z = 0.4, seg = [];
  const L = (a, c) => seg.push(new THREE.Vector3(...a), new THREE.Vector3(...c));
  const yL = b.y1 + off;
  L([b.x0, b.y1 + 1.5, z], [b.x0, yL + tk, z]); L([b.x1, b.y1 + 1.5, z], [b.x1, yL + tk, z]); L([b.x0, yL, z], [b.x1, yL, z]);
  for (const x of [b.x0, b.x1]) L([x - tk * 0.7, yL - tk * 0.7, z], [x + tk * 0.7, yL + tk * 0.7, z]);
  const xW = b.x1 + off;
  L([b.x1 + 1.5, b.y0, z], [xW + tk, b.y0, z]); L([b.x1 + 1.5, b.y1, z], [xW + tk, b.y1, z]); L([xW, b.y0, z], [xW, b.y1, z]);
  for (const y of [b.y0, b.y1]) L([xW - tk * 0.7, y - tk * 0.7, z], [xW + tk * 0.7, y + tk * 0.7, z]);
  const xt = b.x0 - off, yt = b.y0;
  L([b.x0 - 1, yt, 0.05], [xt - tk, yt, 0.05]); L([b.x0 - 1, yt, T], [xt - tk, yt, T]); L([xt, yt, 0.05], [xt, yt, T]);
  for (const zz of [0.05, T]) L([xt - tk * 0.7, yt, zz - tk * 0.7], [xt + tk * 0.7, yt, zz + tk * 0.7]);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0x15150c }));
  lines.renderOrder = 2; g.add(lines); g.updateMatrixWorld(true);
  const w = (x, y, zz) => g.localToWorld(new THREE.Vector3(x, y, zz));
  const add = (p, text, cls = '') => { const el = document.createElement('div'); el.className = `dimlbl ${cls}`; el.textContent = text; RV.lab.appendChild(el); RV.labels.push({ p, el }); };
  add(w((b.x0 + b.x1) / 2, yL, z), `${f1(tl.L)}`);
  add(w(xW, (b.y0 + b.y1) / 2, z), `${f1(tl.W)}`);
  add(w(xt, yt, T / 2), `${f1(T)}${m.src === 'guess' ? '?' : ''}`, m.src === 'guess' ? 'warn' : '');
  add(w((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, T + 3), `${i + 1}`, 'num');
}
function placeLabels() {
  if (!RV.v || !RV.labels.length) return;
  const cam = RV.v.camera, w = RV.v.el.clientWidth, h = RV.v.el.clientHeight;
  for (const l of RV.labels) {
    const q = l.p.clone().project(cam);
    if (q.z > 1 || q.z < -1) { l.el.style.display = 'none'; continue; }
    l.el.style.display = ''; l.el.style.transform = `translate(${((q.x + 1) / 2 * w).toFixed(1)}px, ${((1 - q.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
  }
}
function frameReview() {
  const v = RV.v, box = new THREE.Box3();
  const one = RV.focus === 'all' ? null : RV.groups[+RV.focus];
  if (one) { box.setFromObject(one); box.expandByScalar(14); v.frame(box, [0.25, -0.75, 0.9], 1.15); return; }
  const [pw, ph] = paperDims(); box.set(new THREE.Vector3(0, -ph, 0), new THREE.Vector3(pw, 0, 30));
  v.frame(box, [0.18, -0.7, 1.15], 1.0);
}
function showReview(refit) { RV.refit = !!refit; buildReview(); renderReviewTable(); }
function renderReviewTable() {
  const el = $('#rvTable'); if (!el) return;
  const t = TT(); if (!t.tools.length) { el.innerHTML = ''; return; }
  const [pw, ph] = paperDims();
  let area = 0, warn = 0;
  const rows = t.tools.map((tl, i) => {
    const m = modelT(tl), lt = tl.link ? tool(tl.link) : null; area += tl.include === false ? 0 : tl.area;
    let chk = '', cls = '';
    if (!lt) { chk = 'not linked to a tool'; cls = 'mute'; }
    else if (lt.L) {
      const d = (tl.L - lt.L) / lt.L;
      if (Math.abs(d) > 0.08) { chk = `${d > 0 ? '+' : ''}${f1(d * 100)} % on length — wrong tool linked, or check the paper size and corners`; cls = 'warn'; warn++; }
      else if (Math.abs(d) > 0.03) { chk = `${d > 0 ? '+' : ''}${f1(d * 100)} % on length — worth a caliper check`; cls = 'note'; }
      else chk = 'matches the listed length';
    }
    if (m.src === 'guess') { chk = (chk ? chk + ' · ' : '') + 'thickness is a guess — set it'; if (!cls) cls = 'note'; }
    const listed = lt ? (lt.kind === 'rod' ? `Ø${f1s(lt.D || lt.W)} × ${f1s(lt.L)}` : `${f1s(lt.L)} × ${f1s(lt.W)} × ${f1s(lt.T)}`) : '—';
    return `<tr class="${RV.focus !== 'all' && +RV.focus === i ? 'on' : ''} ${tl.include === false ? 'off' : ''}" data-rvf="${i}"><td><span class="sw" style="background:${TOOLCOL[i % TOOLCOL.length]}"></span>${i + 1}</td><td>${esc(tl.name)}</td><td class="n">${f1(tl.L)} × ${f1(tl.W)}</td><td class="n">${f1(m.T)} <span class="mute">${m.src}</span></td><td class="n">${f0(tl.area)}</td><td class="n">${listed}</td><td class="${cls}">${esc(chk)}</td></tr>`;
  }).join('');
  el.innerHTML = `<table class="dimtab"><thead><tr><th>#</th><th>Tool</th><th>Traced L × W, mm</th><th>Thickness, mm</th><th>Area, mm²</th><th>Listed</th><th>Check</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="7">${t.tools.length} tool${t.tools.length === 1 ? '' : 's'} · ${f0(area)} mm² of outline · traced on a ${f1(pw)} × ${f1(ph)} mm sheet${warn ? ` · <span class="warn">${warn} to check</span>` : ''} · click a row to look at that tool</td></tr></tfoot></table>`;
}
function reviewClick(e) {
  const b = e.target.closest('[data-rv]');
  if (b) { RV[b.dataset.rv] = !RV[b.dataset.rv]; b.setAttribute('aria-pressed', RV[b.dataset.rv]); showReview(false); return; }
  const r = e.target.closest('[data-rvf]');
  if (r) { const i = r.dataset.rvf; RV.focus = String(RV.focus) === i ? 'all' : i; const sel = $('#rvFocus'); if (sel) sel.value = RV.focus; showReview(true); }
}
function renderTraceDims() { /* the tool cards show sizes; keep the panel light while dragging */ }
function renderTraceChecks() {
  const t = TT(), r = edRes;
  const Wo = 42 * t.tray.nx - 0.5, Do = 42 * t.tray.ny - 0.5;
  const ch = [], inc = t.tools.filter((x) => x.include !== false);
  const boxes = inc.map((tl) => { const b = toolBox(tl); const [x0, y0, x1, y1] = b.o.bounds; return { tl, x0: x0 + tl.x, y0: y0 + tl.y, x1: x1 + tl.x, y1: y1 + tl.y }; });
  for (const b of boxes) if (b.x0 < -Wo / 2 + 1.2 || b.x1 > Wo / 2 - 1.2 || b.y0 < -Do / 2 + 1.2 || b.y1 > Do / 2 - 1.2) ch.push(`<div class="check warn"><span class="tag">check</span><span>${esc(b.tl.name)} runs into the tray wall — move it or make the tray bigger</span></div>`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const A = boxes[i], B = boxes[j]; if (A.x0 < B.x1 - 0.6 && B.x0 < A.x1 - 0.6 && A.y0 < B.y1 - 0.6 && B.y0 < A.y1 - 0.6) ch.push(`<div class="check warn"><span class="tag">check</span><span>${esc(A.tl.name)} and ${esc(B.tl.name)} may overlap — drag one aside or arrange again</span></div>`); }
  if (TS.arrangeFail) ch.push(`<div class="check warn"><span class="tag">check</span><span>The tools don’t fit ${t.tray.auto ? `within ${maxUnits()} × ${maxUnits()} units (the bed)` : 'this footprint'} — leave a tool out or split them over two trays</span></div>`);
  if (r) for (const w of r.warnings) if (!/cut-out/.test(w)) ch.push(`<div class="check warn"><span class="tag">check</span><span>${esc(w)}</span></div>`);
  inc.forEach((tl) => { const b = toolBox(tl); ch.push(`<div class="check"><span class="tag">size</span><span><b>${esc(tl.name)}</b> — tool ${f1(tl.L)} × ${f1(tl.W)} mm, pocket ${f1(b.w)} × ${f1(b.d)} mm, ${f1(tl.depth > 0 ? tl.depth : t.tray.depth)} deep</span></div>`); });
  $('#edChecks').innerHTML = ch.join('');
  if (r) {
    const p = r.parts[0], s = p.stats.size;
    $('#edStats').innerHTML = `<div><div class="k">Tray</div><div class="v">${t.tray.nx} × ${t.tray.ny} × ${traceHolder(t).U}U</div></div><div><div class="k">Size</div><div class="v">${f1(s[0])} × ${f1(s[1])} × ${f1(s[2])}</div></div><div><div class="k">Filament ≈</div><div class="v">${f0(p.mass)} g</div></div><div><div class="k">Bed ${S.settings.bed.x} × ${S.settings.bed.y}</div><div class="v ${p.bed.ok ? '' : 'bad'}">${p.bed.ok ? 'fits' : 'too big'}</div></div><div><div class="k">Tools</div><div class="v">${inc.length} / ${t.tools.length}</div></div>`;
  }
}
function onTraceChange(e) {
  const el = e.target, t = TT();
  if (el.id === 'tr_file') { const f = el.files[0]; if (!f) return; const img = new Image(); img.onload = () => { TS.sample = false; TS.sel = null; t.tools = []; loadSource(img); renderTrace(); }; img.src = URL.createObjectURL(f); return; }
  if (el.dataset.tk) {
    const k = el.dataset.tk;
    let v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? (el.value === 'true' ? true : el.value === 'false' ? false : el.value) : parseFloat(el.value);
    if (typeof v === 'number' && !Number.isFinite(v)) v = 0;
    setPath(t, k, v);
    if (k.startsWith('det.') && TS.rect) detectTools();
    else if (k === 'paper' || k === 'pw' || k === 'ph') { if (TS.src) rectify(); }
    else if (k.startsWith('tray.')) { if (['tray.auto', 'tray.nx', 'tray.ny', 'tray.clear', 'tray.fingerMode', 'tray.fingerD', 'tray.fingerLen', 'tray.gap', 'tray.margin'].includes(k)) arrange(); }
    saveState(); renderTrace(); return;
  }
  if (el.dataset.tt != null) {
    const tl = t.tools[+el.dataset.tt], f = el.dataset.tf;
    if (el.type === 'checkbox') tl[f] = el.checked;
    else if (f === 'name' || f === 'fingerMode' || f === 'prof') tl[f] = el.value;
    else if (f === 'toolT') { const v = parseFloat(el.value); tl.toolT = Number.isFinite(v) && v > 0 ? v : 0; }
    else if (f === 'link') { tl.link = el.value; const tt = tool(el.value); if (tt) tl.name = tt.name; saveState(); renderTrace(); return; }
    else if (f === 'clear') tl[f] = el.value === '' ? '' : parseFloat(el.value);
    else { const v = parseFloat(el.value); tl[f] = Number.isFinite(v) ? v : 0; }
    if (f === 'include' || f === 'rot' || f === 'clear' || f === 'fingerMode' || f === 'fingerD' || f === 'fingerLen') arrange();
    saveState();
    if (f === 'name') { scheduleBuild(200); return; }
    renderTrace(); return;
  }
}
function traceAction(act, b) {
  const t = TT();
  if (act === 'tr-models') { const files = modelFiles(''); if (files.length) download(`gridlab_tool-models_${files.length}.zip`, zipStore([...files, { name: 'tools.csv', data: traceCSV() }])); return; }
  if (act === 'tr-for-clear') { S.traceFor = []; saveState(); renderTrace(); return; }
  if (act === 'tr-lib') { const n = saveOutlines(), w = { top: 'outline', side: 'side view', end: 'end view' }[t.view || 'top']; toast(n ? `Saved ${n} ${w}${n > 1 ? 's' : ''} to the tools${t.view === 'side' ? ' — their 3D models now have real thickness' : ''}` : 'Link outlines to tools first'); if (n && S.backTo) return goBackToTools(); renderTrace(); return; }
  if (act === 'tr-make') { const ids = t.tools.filter((x) => x.include !== false && x.link && tool(x.link)).map((x) => toolId(x.link)); if (!ids.length) return; saveOutlines(); makeFor('tray', ids); return; }
  if (act === 'tr-rot') { const tl = t.tools[+b.dataset.i]; tl.rot = ((tl.rot || 0) + 90) % 360; arrange(); saveState(); renderTrace(); }
  else if (act === 'tr-arrange') { arrange(); saveState(); renderTrace(); }
  else if (act === 'tr-refind') { if (TS.srcCanvas) { const img = new Image(); img.onload = () => { loadSource(img); renderTrace(); }; img.src = TS.srcCanvas.toDataURL('image/jpeg', 0.92); } }
  else if (act === 'tr-whole') { if (TS.src) { TS.corners = [[0, 0], [TS.src.width, 0], [TS.src.width, TS.src.height], [0, TS.src.height]]; rectify(); renderTrace(); } }
  else if (act === 'tr-save') {
    const id = uid(); S.items.push({ id, mode: 'holder', name: `Traced tray · ${t.tools.filter((x) => x.include !== false).map((x) => x.name).join(', ').slice(0, 40)}`, p: traceHolder(t), for: t.tools.filter((x) => x.include !== false && x.link && tool(x.link)).map((x) => ({ id: toolId(x.link), n: 1 })) });
    S.sel = id; saveState(); toast('Saved to the bench — open it in Make to place it on a shelf or plate');
  } else if (act === 'tr-copy') {
    navigator.clipboard.writeText(traceCSV()).then(() => toast('Dimensions copied'), () => toast('Couldn’t copy here — they’re in the zip as tools.csv'));
  } else if (act === 'tr-zip') {
    const p = traceHolder(t), files = zipFor('holder', p, 'Traced tray');
    const Wo = 42 * t.tray.nx - 0.5, Do = 42 * t.tray.ny - 0.5, polys = [];
    for (const tl of t.tools.filter((x) => x.include !== false)) for (const P of toolBox(tl).o.pocket) polys.push(P.map(([x, y]) => [x + tl.x, y + tl.y]));
    files.push({ name: 'outlines.svg', data: TR.svgOf(polys, { W: Wo, D: Do, r: 3.75 }) }, { name: 'outlines.dxf', data: TR.dxfOf(polys, { W: Wo, D: Do, r: 3.75 }) }, { name: 'tools.csv', data: traceCSV() }, ...modelFiles('models/'));
    download(`gridlab_traced-tray_${t.tray.nx}x${t.tray.ny}.zip`, zipStore(files));
  }
}
function traceCSV() {
  const t = TT();
  const rows = [['tool', 'length_mm', 'width_mm', 'thickness_mm', 'thickness_from', 'area_mm2', 'linked_tool', 'listed_length_mm', 'pocket_length_mm', 'pocket_width_mm', 'depth_mm', 'clearance_mm', 'x_mm', 'y_mm']];
  const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  for (const tl of t.tools) { if (tl.include === false) continue; const b = toolBox(tl); const th = modelT(tl), lt = tl.link ? tool(tl.link) : null; rows.push([tl.name, n1(tl.L), n1(tl.W), n1(th.T), th.src, Math.round(tl.area), lt ? lt.name : '', lt && lt.L ? n1(lt.L) : '', n1(b.w), n1(b.d), n1(tl.depth > 0 ? tl.depth : t.tray.depth), tl.clear !== '' && tl.clear != null ? tl.clear : t.tray.clear, tl.x, tl.y]); }
  return rows.map((r) => r.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
}

// ---------- hold it by: pick the part of the tool a mount is built around ----------
function gripUse(d) {
  if (d.type === 'mount') return 'mount';
  if (d.type === 'holder') return 'stand';
  const ty = d.p && d.p.type; return ty === 'peg' || ty === 'j' || ty === 'l' || ty === 'hanger' ? 'peg' : 'catch';
}
function renderGrip() {
  const el = $('#edGrip'); if (!el) return;
  const d = D();
  if (!['hook', 'mount', 'holder'].includes(d.type) || !d.for.length) { el.innerHTML = ''; return; }
  const fi = curEntry(d), f = d.for[fi], t = f && tool(f.id), mi = t && modelInfo(t.id);
  if (!mi) { el.innerHTML = ''; return; }
  const use = gripUse(d), L = mi.L, e = mi.ext;
  const fitted = d.p && d.p.grip && d.p.forTool && toolId(d.p.forTool) === t.id ? d.p.grip : null;
  const grip = f.grip || fitted || FIT.gripDefault(t, mi, use);
  const W = 760, pad = 30, k = (W - 2 * pad) / L, top = topOf(t.id), midY = 50, sy = Math.min(k, 34 / Math.max(1, mi.W / 2));
  const X = (dd) => pad + dd * k;
  const outline = top.map(([x, y]) => `${X(e.x1 - x).toFixed(1)},${(midY - y * sy).toFixed(1)}`).join(' ');
  const pr = mi.profile, tmax = Math.max(1, ...pr.map((r) => r[2])), base = 150, hT = 44;
  const thick = `M${X(0)},${base} ` + pr.map((r) => `L${X(r[0]).toFixed(1)},${(base - (r[2] / tmax) * hT).toFixed(1)}`).join(' ') + ` L${X(L)},${base} Z`;
  const a = Math.min(grip[0], grip[1]), b = Math.max(grip[0], grip[1]);
  const quick = [['Tip', [0, L * 0.15]], [use === 'peg' ? 'Behind the pivot' : 'Pivot / head', FIT.gripDefault(t, mi, use === 'peg' ? 'peg' : 'catch')], ['Middle', [L * 0.42, L * 0.58]], ['Handle', [L * 0.6, L * 0.85]], ['Handle end', [L * 0.85, L]], ['Balance point', FIT.gripDefault(t, mi, 'balance')], ['Whole tool', [0, L]]];
  const hint = { mount: 'the saddle cups this part', stand: a < L - b ? 'this end goes into the holder, as deep as the band' : 'this end goes into the holder, as deep as the band', peg: 'the peg goes through here', catch: 'it drops in tip-first and stops here' }[use];
  const support = d.p && d.p.support != null && fitted ? d.p.support : null;
  const sel = d.for.length > 1 && !d.row ? `<select class="field" id="gripPick" style="width:auto;max-width:220px" aria-label="Which tool">${d.for.map((q, j) => { const tt = tool(q.id); return tt ? `<option value="${j}" ${j === fi ? 'selected' : ''}>${esc(shortName(tt))}</option>` : ''; }).join('')}</select>` : '';
  el.innerHTML = `<div class="card mapwrap grip"><div class="maphead"><b>Hold it by</b><span class="mute">${esc(shortName(t))} — ${hint}. Drag along the tool, or pick:</span><span class="grow"></span>${sel}</div>
    <div class="chips">${quick.map(([l, g]) => `<button type="button" class="pill" data-grip="${Math.round(Math.max(0, g[0]))},${Math.round(Math.min(L, g[1]))}" aria-pressed="${Math.abs(g[0] - a) < 1.5 && Math.abs(g[1] - b) < 1.5}">${l}</button>`).join('')}<span class="unit">${f0(a)}–${f0(b)} mm from the tip · ${esc(mi.src)}</span></div>
    <svg viewBox="0 0 ${W} 172" id="gripSvg" style="width:100%;height:auto;display:block;touch-action:none;cursor:ew-resize">
      <polygon points="${outline}" fill="#a3a5a2" fill-opacity=".55" stroke="var(--ink)" stroke-opacity=".5" stroke-width="1"/>
      <path d="${thick}" fill="var(--ink)" fill-opacity=".16" stroke="var(--ink)" stroke-opacity=".5"/>
      <line x1="${X(0)}" x2="${X(L)}" y1="${base}" y2="${base}" stroke="var(--rule-strong)"/>
      <text x="${X(0)}" y="${base + 14}" style="font:400 10px var(--sans);fill:var(--muted)">tip</text><text x="${X(L)}" y="${base + 14}" text-anchor="end" style="font:400 10px var(--sans);fill:var(--muted)">${f0(L)} mm</text>
      <text x="${X(L) + 4}" y="${base - hT + 4}" style="font:400 10px var(--sans);fill:var(--muted)">${f1(tmax)}</text><text x="${pad - 4}" y="${base - 6}" text-anchor="end" style="font:400 10px var(--sans);fill:var(--muted)">thick</text>
      <rect id="gripBand" x="${X(a)}" y="6" width="${Math.max(2, X(b) - X(a))}" height="${base - 6}" fill="var(--ink)" fill-opacity=".12" stroke="var(--ink)" stroke-width="1.4" rx="3"/>
      ${support != null ? `<line x1="${X(support)}" x2="${X(support)}" y1="4" y2="${base}" stroke="#2f6fd6" stroke-width="2"/><text x="${X(support) + 4}" y="14" style="font:400 10px var(--sans);fill:#2f6fd6">rests here</text>` : ''}
      <line x1="${X(mi.dTip)}" x2="${X(mi.dTip)}" y1="4" y2="${base}" stroke="#e8501c" stroke-dasharray="4 3"/><circle cx="${X(mi.dTip)}" cy="${midY}" r="4" fill="#e8501c"/><text x="${X(mi.dTip) + 5}" y="${base - 4}" style="font:400 10px var(--sans);fill:#e8501c">balance</text>
    </svg></div>`;
  const svg = $('#gripSvg'); let drag = null;
  const dAt = (ev) => Math.max(0, Math.min(L, (svgPoint(svg, ev).x - pad) / k));
  const band = $('#gripBand');
  const show = (x0, x1) => { const lo = Math.min(x0, x1), hi = Math.max(x0, x1); band.setAttribute('x', X(lo)); band.setAttribute('width', Math.max(2, X(hi) - X(lo))); };
  svg.addEventListener('pointerdown', (ev) => {
    const q = dAt(ev), tol = 6 / k;
    if (Math.abs(q - a) < tol) drag = { mode: 'a', a, b }; else if (Math.abs(q - b) < tol) drag = { mode: 'b', a, b };
    else if (q > a && q < b) drag = { mode: 'move', a, b, q0: q }; else drag = { mode: 'new', a: q, b: q };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return; const q = dAt(ev);
    if (drag.mode === 'a') drag.a = q; else if (drag.mode === 'b' || drag.mode === 'new') drag.b = q;
    else { const w = drag.b - drag.a, s0 = Math.max(0, Math.min(L - w, a + (q - drag.q0))); drag.a = s0; drag.b = s0 + w; }
    show(drag.a, drag.b);
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return; const g = [Math.round(Math.min(drag.a, drag.b)), Math.round(Math.max(drag.a, drag.b))]; drag = null;
    if (g[1] - g[0] < 3) { g[0] = Math.max(0, g[0] - 6); g[1] = Math.min(Math.round(L), g[1] + 6); }
    setGrip(g);
  });
  el.querySelectorAll('[data-grip]').forEach((btn) => btn.addEventListener('click', () => setGrip(btn.dataset.grip.split(',').map(Number))));
  const gp = $('#gripPick'); if (gp) gp.addEventListener('change', () => { d.pickIdx = +gp.value; saveState(); renderGrip(); });
}
function setGrip(g) {
  const d = D(), f = d.for[curEntry(d)]; if (!f) return;
  f.grip = g; fitDraft(d); saveState(); renderEditor();
}

// ---------- the real tool in the view: hanging under its centre of gravity, cupped in a saddle, standing in its pocket ----------
function realGhost(id, M) {
  const geo = modelGeo(id); if (!geo) return null;
  const m = new THREE.Mesh(geo, ghostMat()); m.userData.shared = true; m.userData.sharedMat = true;
  m.matrixAutoUpdate = false; m.matrix.copy(M); m.updateMatrixWorld(true);
  return m;
}
const basis = (r) => new THREE.Matrix4().set(...r[0], 0, ...r[1], 0, ...r[2], 0, 0, 0, 0, 1);
function hangGhost(p, dims) {
  const id = p.forTool, mi = id && modelInfo(id); if (!mi || !dims || !dims.shift) return null;
  const b = BD.BOARDS[p.board], hp = G.hookPaths(p, b), hd = G.hookDims(p, b), r = hd.r, xr = hp.xr, z0 = hp.z0, L = p.L || 40, a = hp.a ?? (p.rise || 0) * Math.PI / 180, y0 = hp.y0 ?? -r;
  const e = mi.ext, ds = p.support != null ? p.support : p.grip ? (p.grip[0] + p.grip[1]) / 2 : mi.L / 2;
  const row = mi.profile.reduce((q, rr) => (Math.abs(rr[0] - ds) < Math.abs(q[0] - ds) ? rr : q), mi.profile[0]);
  const xs = e.x1 - ds, ys = (row[3] + row[4]) / 2, zs = (row[5] + row[6]) / 2;
  let C, down = false, swing = false;
  if (p.type === 'u') { C = [hp.xc, y0 - L * 0.55 * Math.cos(a), z0 + L * 0.55 * Math.sin(a) + r]; down = true; }
  else if (p.type === 'ring') { C = [hp.ring.x, y0 - hp.ring.u, z0]; down = true; }
  else if (p.type === 'peg') { C = [xr, y0 - L * 0.6 * Math.cos(a), z0 + L * 0.6 * Math.sin(a) + r]; swing = true; }
  else if (p.type === 'j' || p.type === 'hanger') { C = [xr, y0 - L, z0 + r]; swing = true; }
  else if (p.type === 'l') { C = [xr, y0 - L * 0.8, z0 + r]; swing = true; }
  else if (p.type === 'cradle') {
    // stands on its end on the arms: back end down, centred between the arms
    const M = new THREE.Matrix4().multiplyMatrices(basis([[0, 1, 0], [0, 0, -1], [1, 0, 0]]), new THREE.Matrix4().makeTranslation(-e.x0, -(e.y0 + e.y1) / 2, -mi.T / 2));
    const g = new THREE.Group(); g.position.set(...dims.shift);
    const m = realGhost(id, new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(hp.xc, y0 - L / 2, z0 + r), M)); if (m) g.add(m);
    return g;
  } else return null;
  // tool plane parallel to the board; tip up on pegs, tip down through U-hooks and rings
  let M = new THREE.Matrix4().multiplyMatrices(basis(down ? [[0, 1, 0], [0, 0, -1], [-1, 0, 0]] : [[0, -1, 0], [0, 0, -1], [1, 0, 0]]), new THREE.Matrix4().makeTranslation(-xs, -ys, -zs));
  if (swing) {
    const c = new THREE.Vector3(...mi.mass.cog).applyMatrix4(M);
    const th = Math.PI / 2 + Math.atan2(c.z, c.x);
    M = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationY(th), M);
  }
  M = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(...C), M);
  const g = new THREE.Group(); g.position.set(...dims.shift);
  const m = realGhost(id, M); if (m) g.add(m);
  const cg = new THREE.Vector3(...mi.mass.cog).applyMatrix4(M);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8501c, depthTest: false, transparent: true })); dot.renderOrder = 6; dot.position.copy(cg); g.add(dot);
  return g;
}
function saddleGhost(p, dims) {
  const id = p.forTool, mi = id && modelInfo(id); if (!mi || !dims || !dims.origin || !p.grip) return null;
  const sec = mi.section(p.grip[0], p.grip[1]); if (!sec) return null;
  const O = dims.origin, w = dims.width || p.width || 20, xc = mi.ext.x1 - (p.grip[0] + p.grip[1]) / 2, sb = sec.b;
  let M;
  if (p.orient === 'flat') M = basis([[-1, 0, 0], [0, -1, 0], [0, 0, 1]]).setPosition(O[0] + w / 2 + xc, O[1] + sb.x0, O[2] - sb.y0);
  else M = basis([[1, 0, 0], [0, 0, -1], [0, 1, 0]]).setPosition(O[0] + w / 2 - xc, O[1] + sb.y0, O[2] - sb.x0);
  const g = new THREE.Group(); const m = realGhost(id, M); if (m) g.add(m);
  const cg = new THREE.Vector3(...mi.mass.cog).applyMatrix4(M);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8501c, depthTest: false, transparent: true })); dot.renderOrder = 6; dot.position.copy(cg); g.add(dot);
  return g;
}
function standGhost(g, h, H) {
  const mi = modelInfo(g.tool); if (!mi || !g.stand) return null;
  const e = mi.ext, st = g.stand, depth = Math.min(g.depth > 0 ? g.depth : H - 6, H - 5.2);
  const M = st.from === 'tip'
    ? basis([[0, 1, 0], [0, 0, -1], [-1, 0, 0]]).setPosition(h.x - st.cy, h.y + st.cz, H - depth + e.x1)
    : basis([[0, 1, 0], [0, 0, 1], [1, 0, 0]]).setPosition(h.x - st.cy, h.y - st.cz, H - depth - e.x0);
  return realGhost(g.tool, M);
}

// ---------- top view of a holder or tray: each cut-out with the tool it's for; drag one to move it ----------
function renderLayout() {
  const el = $('#edLayout'); if (!el) return;
  const d = currentDraft();
  if (!d || d.mode !== 'holder' || S.tab !== 'make' || !d.p.groups.length) { el.innerHTML = ''; return; }
  const leg = d.p.groups.map((g, i) => { const t = g.tool ? tool(g.tool) : null; const sz = g.shape === 'outline' ? `pocket ${f1(g.depth)} deep${g.outline === 'silhouette' ? ', drawn from sizes' : ''}` : `${g.shape === 'round' ? `Ø${f1(g.a)}` : `${f1(g.a)} × ${f1(g.b)} ${g.shape}`}, ${g.through ? 'through' : `${f1(g.depth || 0)} deep`}${(g.n || 1) * (g.rows || 1) > 1 ? ` · ${(g.n || 1) * (g.rows || 1)} of them` : ''}`; return `<li><span class="n">${i + 1}</span><span>${esc(g.name || (t ? t.name : `${g.shape} cut-out`))} <span class="unit">· ${esc(sz)}</span></span></li>`; }).join('');
  el.innerHTML = `<div class="card layout"><div class="titlebar"><b>Top view</b><span>${f1(42 * d.p.nx - 0.5)} × ${f1(42 * d.p.ny - 0.5)} mm · ${d.p.nx} × ${d.p.ny} units · ${d.p.U}U</span><span class="grow"></span><span>drag a cut-out to move it</span></div><div class="laybody"><div id="layWrap">${layoutSVG(d.p)}</div><ol class="legend-list">${leg}</ol></div></div>`;
  wireLayout();
}
function layoutSVG(p) {
  const Wo = 42 * p.nx - 0.5, Do = 42 * p.ny - 0.5, pad = 4;
  let lay; try { lay = G.holderLayout(p); } catch (e) { return ''; }
  let s = `<svg viewBox="${-Wo / 2 - pad} ${-Do / 2 - pad} ${Wo + 2 * pad} ${Do + 2 * pad}" id="laySvg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Top view of the cut-outs">`;
  s += `<rect x="${-Wo / 2}" y="${-Do / 2}" width="${Wo}" height="${Do}" rx="3.75" fill="var(--part)" fill-opacity=".55" stroke="var(--ink)" stroke-width=".5"/>`;
  for (let i = 1; i < p.nx; i++) s += `<line x1="${-Wo / 2 + 42 * i - 0.25}" x2="${-Wo / 2 + 42 * i - 0.25}" y1="${-Do / 2}" y2="${Do / 2}" stroke="var(--ink)" stroke-opacity=".2" stroke-dasharray="2 2" stroke-width=".35"/>`;
  for (let i = 1; i < p.ny; i++) s += `<line y1="${-Do / 2 + 42 * i - 0.25}" y2="${-Do / 2 + 42 * i - 0.25}" x1="${-Wo / 2}" x2="${Wo / 2}" stroke="var(--ink)" stroke-opacity=".2" stroke-dasharray="2 2" stroke-width=".35"/>`;
  const path = (P, dx, dy) => 'M' + P.map(([x, y]) => `${(x + dx).toFixed(2)},${(-(y + dy)).toFixed(2)}`).join('L') + 'Z';
  const fs = Math.max(2.6, Math.max(Wo, Do * 1.9) / 80);
  const labels = [];
  let num = 0;
  p.groups.forEach((g, gi) => {
    const hs = lay.holes.filter((h) => h.g === g); if (!hs.length) return;
    s += `<g data-lg="${gi}" style="cursor:move">`;
    if (g.shape === 'outline') {
      let o = null; try { o = G.outline2D({ ...g, x: 0, y: 0 }); } catch (e) { o = null; }
      if (o) for (const h of hs) { for (const P of o.pocket) s += `<path d="${path(P, h.x, h.y)}" fill="#fff" stroke="var(--ink)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; for (const P of o.tool) s += `<path d="${path(P, h.x, h.y)}" fill="var(--ink)" fill-opacity="${g.outline === 'silhouette' ? 0.35 : 0.75}"/>`; }
    } else {
      const P = G.shapePts(g.shape, g.a, g.b);
      for (const h of hs) s += `<path d="${path(P, h.x, h.y)}" fill="#fff" stroke="var(--ink)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    }
    s += '</g>';
    num++;
    const cx = hs.reduce((a, h) => a + h.x, 0) / hs.length, cy = hs.reduce((a, h) => a + h.y, 0) / hs.length, r = fs * 0.78;
    labels.push(`<g style="pointer-events:none"><circle cx="${cx.toFixed(1)}" cy="${(-cy).toFixed(1)}" r="${r.toFixed(2)}" fill="var(--ink)"/><text x="${cx.toFixed(1)}" y="${(-cy + fs * 0.36).toFixed(1)}" text-anchor="middle" style="font:400 ${fs.toFixed(2)}px var(--sans);fill:#fff">${num}</text></g>`);
  });
  return s + labels.join('') + '</svg>';
}
function wireLayout() {
  const svg = $('#laySvg'); if (!svg) return;
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const gEl = e.target.closest('[data-lg]'); if (!gEl) return;
    const q = svgPoint(svg, e), g = D().p.groups[+gEl.dataset.lg]; if (!g) return;
    drag = { el: gEl, g, x0: q.x, y0: q.y, gx: g.x || 0, gy: g.y || 0, moved: false }; svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const q = svgPoint(svg, e), dx = q.x - drag.x0, dy = q.y - drag.y0;
    drag.moved = drag.moved || Math.hypot(dx, dy) > 0.5;
    drag.el.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
    drag.dx = dx; drag.dy = dy;
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const dr = drag; drag = null;
    if (!dr.moved) return;
    dr.g.x = Math.round((dr.gx + dr.dx) * 2) / 2; dr.g.y = Math.round((dr.gy - dr.dy) * 2) / 2;
    saveState(); refreshSaveButton(); renderLayout(); scheduleBuild(40);
  });
}

// ---------- TOOLS: the library — search, pick several, see where each lives, edit sizes, trace ----------
const UIT = { focus: null, busy: false };
const TF_STATUS = [['', 'Everything'], ['unhoused', 'No home yet'], ['housed', 'Has a home'], ['traced', 'Traced or outlined'], ['untraced', 'No outline'], ['est', 'Sizes are estimates']];
function toolCats() { const seen = []; for (const t of LIB.list) { const c = t.cat || 'Other'; if (!seen.includes(c)) seen.push(c); } return seen; }
function toolZones() { return [...new Set(LIB.list.map((t) => t.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); }
function filteredTools() {
  const f = S.tf, hm = homes();
  return LIB.list.filter((t) => {
    if (!f.bench && t.kind === 'bench') return false;
    if (f.cat && (t.cat || 'Other') !== f.cat) return false;
    if (f.zone && t.zone !== f.zone) return false;
    if (f.status === 'unhoused' && hm.has(t.id)) return false;
    if (f.status === 'housed' && !hm.has(t.id)) return false;
    if (f.status === 'traced' && !outlineOf(t.id)) return false;
    if (f.status === 'untraced' && outlineOf(t.id)) return false;
    if (f.status === 'est' && !(t.est || (t.estFields || []).length)) return false;
    return matchTool(t, f.q);
  });
}
function sourceLine() {
  if (LIB.source === 'live') return `Live from your inventory — ${LIB.invCount} line items and their photos. Where the inventory gives only a length, widths and thicknesses come from the pegboard plan, marked est.`;
  if (LIB.source === 'imported') return `From an imported inventory file — ${LIB.invCount} line items.`;
  return `The ${LIBM.BUILTIN_TOOLS.length} tools from the pegboard plan. On organisedmess.studio/internal this reads the live inventory and its photos instead.`;
}
function renderTools() { renderToolsPanel(); $('#stage').innerHTML = `<div class="tools-stage ${tool(UIT.focus) ? '' : 'nodetail'}" id="tlStage"><div style="min-width:0"><div id="tlGrid"></div><div id="tlBar"></div></div><div id="tlDetail"></div></div>`; renderToolGrid(); renderToolDetail(); renderSelBar(); }
function renderToolsPanel() {
  const f = S.tf, cats = toolCats(), zones = toolZones(), sel = S.pick.map(tool).filter(Boolean);
  const sl = (k, label, opts) => `<div class="row"><label for="tl_${k}">${label}</label><select id="tl_${k}" data-tf="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  $('#panel').innerHTML = `<h2>Tools</h2><p class="blurb">${esc(sourceLine())}</p>
    <div class="tsearch"><input type="search" id="tl_q" data-tf="q" value="${esc(f.q)}" placeholder="Search — name, brand, zone, size" autocomplete="off" aria-label="Search tools"></div>
    ${sl('cat', 'Category', [['', 'All'], ...cats.map((c) => [c, c])])}${sl('zone', 'Zone', [['', 'All'], ...zones.map((z) => [z, z])])}${sl('status', 'Show', TF_STATUS)}
    <div class="row"><label for="tl_bench">Bench and floor gear</label><input type="checkbox" id="tl_bench" data-tf="bench" ${f.bench ? 'checked' : ''}></div>
    <h3>Picked <span class="unit">${sel.length ? `${sel.length} — one part for all of them` : 'tick tools to make one part for several'}</span></h3>
    ${sel.length ? `<div class="forlist">${sel.map((t) => `<div class="forrow" style="grid-template-columns:34px minmax(0,1fr) 22px"><span class="thumb">${thumbHTML(t)}</span><div style="min-width:0"><div class="nm">${esc(t.name)}</div><div class="dm">${esc(dimText(t))}</div></div><button class="iconbtn" type="button" data-act="unpick" data-id="${esc(t.id)}" aria-label="Unpick ${esc(t.name)}">✕</button></div>`).join('')}</div>
      <div class="actions">${['holder', 'tray', 'hook', 'mount', 'box'].map((ty, k) => `<button class="btn ${k ? 'ghost' : ''} small" type="button" data-act="make-picked" data-type="${ty}">${TYPE(ty).label}</button>`).join('')}<button class="btn ghost small" type="button" data-act="trace-picked">Trace…</button><button class="btn ghost small" type="button" data-act="unpick-all">Clear</button></div>` : ''}
    <h3>Model tools</h3>
    <p class="unit" style="margin:0 0 6px">Open a tool to add photos or a scan for it. For several at once:</p>
    <div class="actions"><button class="btn ghost small" type="button" data-act="trace-sheet">Trace a sheet of tools…</button><button class="btn ghost small" type="button" data-act="scan-open">Open a 3D scan…</button></div>
    <h3>Library</h3>
    <div class="actions"><button class="btn ghost small" type="button" data-act="tool-new">Add a tool</button><button class="btn ghost small" type="button" data-act="inv-import">Import inventory .json</button><button class="btn ghost small" type="button" data-act="lib-save">Save library .json</button>${LIB.list.some((t) => t.photo) ? '<button class="btn ghost small" type="button" data-act="cat-all">Outline all from catalogue photos</button>' : ''}</div>
    <p class="unit">Your edits, added tools and outlines stay in this browser with the bench. The library file carries them to another machine; the inventory import takes the site’s tools.json and kits.json.</p>`;
}
function cardHTML(t, hm) {
  const o = outlineOf(t.id), home = hm.get(t.id), picked = S.pick.includes(t.id);
  const sub = [t.brand && !t.name.toLowerCase().startsWith(t.brand.toLowerCase()) ? t.brand : '', t.sub, t.set ? `in ${t.set}` : ''].filter(Boolean).join(' · ') || KIND_LABEL[t.kind] || '';
  return `<div class="tcard ${UIT.focus === t.id ? 'focus' : ''} ${picked ? 'picked' : ''}" data-tool="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.name)}"><label class="pick" title="Pick for one part with others"><input type="checkbox" data-pick="${esc(t.id)}" ${picked ? 'checked' : ''} aria-label="Pick ${esc(t.name)}"></label>
    <div class="tth">${thumbHTML(t, 150, 70)}</div><div class="tn">${esc(t.name)}</div><div class="ts">${esc(sub)}</div><div class="td">${esc(dimText(t))}${t.qty > 1 ? ` · ×${t.qty}` : ''}</div>
    <div class="tags">${t.zone ? `<span>${esc(t.zone)}</span>` : ''}${o ? `<span class="on">${o.src === 'catalogue' ? 'outline' : 'traced'}</span>` : ''}${S.lib.scans[t.id] || viewsOf(t.id).side || viewsOf(t.id).end ? '<span class="on">3D</span>' : ''}${home ? `<span class="on" title="${esc(home.map((x) => x.name).join(', '))}">⌂ ${esc(home[0].name.slice(0, 20))}${home.length > 1 ? ` +${home.length - 1}` : ''}</span>` : t.kind === 'bench' ? '<span>bench</span>' : '<span>no home</span>'}${t.est || (t.estFields || []).length ? '<span class="est" title="some sizes are estimates">est.</span>' : ''}</div></div>`;
}
function renderToolGrid() {
  const el = $('#tlGrid'); if (!el) return;
  const list = filteredTools(), hm = homes(), cats = toolCats();
  if (!list.length) { el.innerHTML = `<p class="empty">No tools match${S.tf.q ? ` “${esc(S.tf.q)}”` : ''}.</p>`; return; }
  const by = new Map(); for (const t of list) { const c = t.cat || 'Other'; if (!by.has(c)) by.set(c, []); by.get(c).push(t); }
  const order = [...by.keys()].sort((a, b) => cats.indexOf(a) - cats.indexOf(b));
  el.innerHTML = order.map((c) => { const ts = by.get(c), n = cats.indexOf(c) + 1; return `<section class="tcat"><div class="lab"><span>${String(n).padStart(2, '0')}</span>${esc(c)}<small>${ts.length} · ${ts.filter((t) => hm.has(t.id)).length} with a home</small></div><div class="tgrid">${ts.map((t) => cardHTML(t, hm)).join('')}</div></section>`; }).join('');
}
function renderSelBar() {
  const el = $('#tlBar'); if (!el) return;
  const ts = S.pick.map(tool).filter(Boolean);
  el.innerHTML = ts.length ? `<div class="selbar"><span class="grow">${ts.length} picked — ${esc(ts.map(shortName).join(', '))}</span>${['holder', 'tray', 'hook', 'mount', 'box'].map((ty, k) => `<button class="btn small ${k === 0 ? 'prime' : ''}" type="button" data-tact="make" data-type="${ty}">${TYPE(ty).label}</button>`).join('')}<button class="btn small" type="button" data-tact="trace-picked">Trace</button><button class="btn small" type="button" data-tact="unpick-all">Clear</button></div>` : '';
}
function previewSVG(t) {
  const sh = shapeOf(t), o = sh.real, pts = sh.pts;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 8, W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad + 8, vx = x0 - pad, vy = -y1 - pad;
  let s = `<svg viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Outline at scale">`;
  for (let gx = Math.ceil(vx / 10) * 10; gx < vx + W; gx += 10) s += `<line x1="${gx}" x2="${gx}" y1="${vy}" y2="${vy + H - 8}" stroke="var(--ink)" stroke-opacity="${gx % 50 ? 0.06 : 0.14}" stroke-width=".3"/>`;
  for (let gy = Math.ceil(vy / 10) * 10; gy < vy + H - 8; gy += 10) s += `<line y1="${gy}" y2="${gy}" x1="${vx}" x2="${vx + W}" stroke="var(--ink)" stroke-opacity="${gy % 50 ? 0.06 : 0.14}" stroke-width=".3"/>`;
  s += `<path d="M${pts.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L')}Z" fill="${o ? 'var(--ink)' : '#a3a5a2'}" fill-opacity="${o ? 0.85 : 0.45}" stroke="var(--ink)" stroke-opacity="${o ? 0 : 0.5}" stroke-width=".5" ${o ? '' : 'stroke-dasharray="2 1.5"'}/>`;
  s += `<text x="${vx + 2}" y="${vy + H - 2}" style="font:400 ${Math.max(4, W / 34).toFixed(1)}px var(--sans);fill:var(--muted)">${f1(x1 - x0)} × ${f1(y1 - y0)} mm${o ? (sh.scan ? ' · from the scan' : '') : ' · drawn from the sizes'} · grid 10 mm</text>`;
  return s + '</svg>';
}
function renderToolDetail() {
  const el = $('#tlDetail'), st = $('#tlStage'); if (!el) return;
  const t = tool(UIT.focus);
  if (st) st.classList.toggle('nodetail', !t);
  if (!t) { el.innerHTML = ''; return; }
  const o = outlineOf(t.id), hm = homes().get(t.id) || [];
  const fld = (k, label, step = 0.5, unit = 'mm') => `<div class="row"><label for="te_${k}">${label} <small>${unit}</small></label><input type="number" id="te_${k}" data-te="${k}" value="${t[k] || 0}" step="${step}" min="0"></div>`;
  const sizeF = [fld('L', 'Length'),
    t.kind === 'rod' ? fld('D', 'Handle or body Ø') + fld('d', 'Shaft Ø — 0 if none') : t.kind === 'spool' ? fld('W', 'Outside Ø') + fld('D', 'Bore Ø') : fld('W', t.kind === 'plier' ? 'Width, handles open' : 'Width') + fld('T', 'Thickness'),
    t.kind === 'plier' ? fld('head', 'Head width at the pivot') : '', fld('g', 'Weight', 1, 'g'), fld('qty', 'How many', 1, '')].join('');
  el.innerHTML = `<div class="card tdetail"><div class="titlebar"><b>${esc(t.name)}</b><span class="grow"></span><button class="iconbtn" type="button" data-tact="close" aria-label="Close">✕</button></div><div class="body">
    ${t.photo ? `<div class="photo"><img src="${esc(t.photo)}" alt="${esc(t.name)}" onerror="this.parentNode.remove()"></div>` : ''}
    <div class="unit">${esc([t.brand, t.sub, t.cat, t.set ? `in ${t.set}` : '', t.zone ? `zone ${t.zone}` : ''].filter(Boolean).join(' · '))}</div>
    <div class="preview">${previewSVG(t)}</div>
    <div class="unit">${o ? (o.src === 'catalogue' ? `Outline from the catalogue photo, scaled to ${f1(t.L)} mm long. Product shots aren’t always flat-on — trace the tool itself for a snug pocket.` : `Traced from a photo${o.at ? ` on ${esc(o.at)}` : ''} — ${f1(o.L)} × ${f1(o.W)} mm.`) : S.lib.scans[t.id] ? 'Outline from the 3D scan. A top photo would fix its scale exactly.' : 'No outline yet. Trays draw the pocket from the sizes below.'}</div>
    ${t.photo || o ? `<div class="tbar">${t.photo ? '<button class="btn ghost small" type="button" data-tact="catalogue">Outline from the catalogue photo</button>' : ''}${o ? '<button class="btn ghost small" type="button" data-tact="unoutline">Remove outline</button>' : ''}</div>` : ''}
    ${modelPanelHTML(t)}
    <h3>Make for this tool</h3><div class="tbar">${['holder', 'tray', 'hook', 'mount', 'box'].map((ty, k) => `<button class="btn ${k ? 'ghost' : ''} small" type="button" data-tact="make1" data-type="${ty}">${TYPE(ty).label}</button>`).join('')}<label class="unit" style="display:inline-flex;gap:5px;align-items:center;margin-left:4px"><input type="checkbox" data-pick="${esc(t.id)}" ${S.pick.includes(t.id) ? 'checked' : ''} style="margin:0"> pick with others</label></div>
    <h3>Lives in</h3>${hm.length ? `<div class="homes">${hm.map((it) => `<button type="button" data-tact="open" data-id="${esc(it.id)}">${esc(it.name)} <span class="unit">· ${esc(groupOf(it))}</span></button>`).join('')}</div>` : '<p class="unit" style="margin:0">Nowhere yet.</p>'}
    <h3>Sizes ${t.est || (t.estFields || []).length ? '<span class="unit">some are estimates — measure</span>' : ''}</h3>
    ${t.src === 'custom' ? `<div class="row full"><input type="text" data-te="name" value="${esc(t.name)}" class="field" aria-label="Name"></div>` : ''}
    <div class="row"><label for="te_kind">Shape</label><select id="te_kind" data-te="kind">${LIBM.KINDS.map(([v, l]) => `<option value="${v}" ${t.kind === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    ${sizeF}
    <div class="row"><label for="te_zone">Zone on the plan</label><input type="text" id="te_zone" data-te="zone" value="${esc(t.zone || '')}" class="field" style="text-align:right"></div>
    <div class="tbar">${t.edited ? '<button class="btn ghost small" type="button" data-tact="reset">Undo my edits</button>' : ''}${t.src === 'custom' ? '<button class="btn ghost small" type="button" data-tact="delete">Delete this tool</button>' : ''}</div>
  </div></div>`;
  renderToolModel(t);
}
// ---------- how to shoot each view: a little scene and what the photo should look like, from this tool's own shape ----------
function viewShapes(t) {
  const mi = modelInfo(t.id), top = topOf(t.id);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of top) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const L = x1 - x0, W = y1 - y0, T = mi ? mi.T : FIT.dims(t).T || 10;
  let side = sideOf(t.id), end = endOf(t.id);
  if (!side && mi) { const pr = mi.profile.filter((r) => r[2] > 0); if (pr.length > 2) side = [...pr.map((r) => [mi.ext.x1 - r[0], r[6]]), ...pr.slice().reverse().map((r) => [mi.ext.x1 - r[0], r[5]])]; }
  if (!side) side = [[x0, 0], [x1, 0], [x1, T], [x0, T]];
  if (!end && mi) { const sc = mi.section(0, mi.L); if (sc && sc.pts && sc.pts.length > 2) end = sc.pts; }
  if (!end) end = [[-W / 2, 0], [W / 2, 0], [W / 2, T], [-W / 2, T]];
  const n0 = (P) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of P) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return P.map(([x, y]) => [x - (a + c) / 2, y - (b + d) / 2]); };
  return { top: n0(top), side: n0(side), end: n0(end), L, W, T };
}
const ANGLES = {
  top: { title: 'Top photo', pose: 'lying flat on its widest face', gives: 'the outline — length and width', tip: 'Camera straight above the paper, the whole sheet in frame, even light, no flash glare.' },
  side: { title: 'Side photo', pose: 'stood on its edge (Blu-Tack helps)', gives: 'its thickness all along the length', tip: 'Same camera, straight down. Turn the tool 90° about its length so the camera sees its thickness.' },
  end: { title: 'End photo', pose: 'stood up on its end', gives: 'the cross-section — how round or square it is', tip: 'Stand it on its handle end (or tip, if that’s flatter) in a lump of putty; shoot straight down at it.' },
  scan: { title: '3D scan', pose: 'on a table, or in your hand', gives: 'the real shape everywhere — thickness, bumps, balance', tip: 'Walk the phone around it at 30–40 cm, then flip it and scan the other side if your app merges passes. The table is removed and your hand cut away (needs a top photo); the bit your hand covered is filled from the scan beside it.' },
};
function angleSVG(view, sh) {
  const Wd = 250, H = 150, k = Math.min(118 / Math.max(sh.L, 1), 60 / Math.max(sh.W, 1), 1.6);
  const ox = 70, oy = 112, P = (x, y, z = 0) => [ox + x * k + y * k * 0.55, oy - y * k * 0.32 - z * k];
  const poly = (pts, z, fill, extra = '') => `<polygon points="${pts.map(([x, y]) => P(x, y, z).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
  const hx = sh.L * 0.62 + 6, hy = Math.max(sh.W, sh.T) * 1.4 + 10;
  const paper = poly([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], 0, view === 'scan' ? '#d9cfbd' : '#fff', 'stroke="var(--rule-strong)" stroke-width=".8"');
  let tool = '', cam = '';
  const dark = '#3b3d40', light = 'rgba(59,61,64,.28)';
  if (view === 'top' || view === 'scan') tool = poly(sh.top, 0, dark);
  else if (view === 'side') {
    // on its edge: thickness on the paper, width standing up
    const foot = sh.side.map(([x, z]) => [x, z]), hgt = Math.min(sh.W, 40);
    tool = poly(foot, hgt, light, 'stroke="#3b3d40" stroke-width=".6"') + poly(foot, 0, dark) + `<ellipse cx="${P(-sh.L * 0.3, sh.T * 0.9)[0]}" cy="${P(-sh.L * 0.3, sh.T * 0.9)[1]}" rx="5" ry="2.6" fill="#7aa0c8"/>`;
  } else if (view === 'end') {
    const hgt = Math.min(sh.L, 95 / k);
    const foot = sh.end.map(([y, z]) => [y, z]);
    let xa = foot[0], xb = foot[0]; for (const q of foot) { if (q[0] + q[1] * 0.55 < xa[0] + xa[1] * 0.55) xa = q; if (q[0] + q[1] * 0.55 > xb[0] + xb[1] * 0.55) xb = q; }
    tool = poly(foot, hgt, light, 'stroke="#3b3d40" stroke-width=".6"') + `<line x1="${P(xa[0], xa[1])[0]}" y1="${P(xa[0], xa[1])[1]}" x2="${P(xa[0], xa[1], hgt)[0]}" y2="${P(xa[0], xa[1], hgt)[1]}" stroke="#3b3d40" stroke-width=".6"/><line x1="${P(xb[0], xb[1])[0]}" y1="${P(xb[0], xb[1])[1]}" x2="${P(xb[0], xb[1], hgt)[0]}" y2="${P(xb[0], xb[1], hgt)[1]}" stroke="#3b3d40" stroke-width=".6"/>` + poly(foot, 0, dark);
  }
  if (view !== 'scan') {
    const [cx] = P(0, 0, 0);
    cam = `<g transform="translate(${cx - 9} 6)"><rect width="18" height="11" rx="2.5" fill="var(--ink)"/><rect x="5" y="-2.5" width="7" height="3" rx="1" fill="var(--ink)"/><circle cx="9" cy="5.5" r="3.2" fill="#fff"/><circle cx="9" cy="5.5" r="1.6" fill="var(--ink)"/></g>`
      + `<line x1="${cx}" y1="20" x2="${P(-hx, hy)[0]}" y2="${P(-hx, hy)[1]}" stroke="var(--signal)" stroke-dasharray="3 3" stroke-width=".8"/><line x1="${cx}" y1="20" x2="${P(hx, -hy)[0]}" y2="${P(hx, -hy)[1]}" stroke="var(--signal)" stroke-dasharray="3 3" stroke-width=".8"/>`;
  } else {
    const c = P(0, 0, sh.T), rx = sh.L * k * 0.7, ry = rx * 0.32;
    cam = `<ellipse cx="${c[0]}" cy="${c[1] - 14}" rx="${rx}" ry="${ry}" fill="none" stroke="var(--signal)" stroke-dasharray="4 3" stroke-width="1"/><path d="M${c[0] + rx - 6},${c[1] - 14 - 5} l6,5 l-7,3" fill="none" stroke="var(--signal)" stroke-width="1"/>`
      + `<g transform="translate(${c[0] + rx * 0.55} ${c[1] - 14 - ry - 18}) rotate(18)"><rect width="11" height="19" rx="2.5" fill="var(--ink)"/><circle cx="3.2" cy="3.4" r="1.6" fill="#fff"/></g>`
      + `<text x="${P(-hx, hy)[0] + 2}" y="${H - 4}" style="font:500 9.5px var(--sans);fill:var(--muted)">table → removed · hand → cut</text>`;
  }
  // the photo as the camera sees it
  const fx = 172, fy = 30, fw = 72, fh = 92, shape = view === 'side' ? sh.side : view === 'end' ? sh.end : sh.top;
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of shape) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  const rot = view !== 'end' && (c - a) < (d - b) ? false : view !== 'end';
  const pw = rot ? d - b : c - a, ph = rot ? c - a : d - b, kk = Math.min((fw - 14) / Math.max(pw, 1), (fh - 14) / Math.max(ph, 1));
  const pts = shape.map(([x, y]) => (rot ? [fx + fw / 2 + (y - (b + d) / 2) * kk, fy + fh / 2 - (x - (a + c) / 2) * kk] : [fx + fw / 2 + (x - (a + c) / 2) * kk, fy + fh / 2 - (y - (b + d) / 2) * kk]));
  const photo = view === 'scan' ? `<g transform="translate(${fx} ${fy})"><rect width="${fw}" height="${fh}" rx="5" fill="#fff" stroke="var(--rule-strong)"/><text x="${fw / 2}" y="${fh / 2 - 4}" text-anchor="middle" style="font:600 10px var(--sans);fill:var(--ink)">OBJ · STL</text><text x="${fw / 2}" y="${fh / 2 + 10}" text-anchor="middle" style="font:400 9px var(--sans);fill:var(--muted)">PLY · GLB · 3MF</text></g>`
    : `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="5" fill="#fff" stroke="var(--rule-strong)"/><polygon points="${pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${dark}"/><text x="${fx + fw / 2}" y="${fy + fh + 12}" text-anchor="middle" style="font:400 9.5px var(--sans);fill:var(--muted)">the photo</text>`;
  return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(ANGLES[view].title)}: the tool ${esc(ANGLES[view].pose)}">${paper}${tool}${cam}${photo}</svg>`;
}
function angleCards(t) {
  const sh = viewShapes(t), v = viewsOf(t.id), o = outlineOf(t.id), sc = S.lib.scans[t.id];
  const have = { top: !!(o && o.src !== 'catalogue'), side: !!v.side, end: !!v.end, scan: !!sc };
  const btn = { top: ['trace', have.top ? 'Retake…' : 'Add a top photo…'], side: ['add-view', have.side ? 'Retake…' : 'Add a side photo…'], end: ['add-view', have.end ? 'Retake…' : 'Add an end photo…'], scan: ['add-scan', have.scan ? 'Replace…' : 'Add a scan…'] };
  return `<div class="angles">${['top', 'side', 'end', 'scan'].map((k) => `<div class="angle ${have[k] ? 'have' : ''}"><div class="ah"><b>${ANGLES[k].title}</b><span class="${have[k] ? 'ok' : ''}">${have[k] ? '✓ added' : k === 'top' && o ? 'catalogue outline' : 'not yet'}</span></div>${angleSVG(k, sh)}<p><b>${esc(ANGLES[k].pose)}</b> → ${esc(ANGLES[k].gives)}. ${esc(ANGLES[k].tip)}</p><button class="btn ${have[k] ? 'ghost' : ''} small" type="button" data-tact="${btn[k][0]}" ${k === 'side' || k === 'end' ? `data-view="${k}"` : ''}>${btn[k][1]}</button></div>`).join('')}</div>`;
}
// ---------- a tool's 3D model, weight and balance ----------
const TMV = { v: null };
function balanceNote(mi) {
  const e = mi.mass.eff; if (!e) return 'Add its weight to find the density and check the model.';
  if (e > 8.6) return `${f1(e)} g/cm³ — heavier than solid steel: the model is too small, or the weight is off.`;
  if (e < 0.6) return `${f1(e)} g/cm³ — lighter than plastic: the model is too big (a scan with the table in it?).`;
  return `${f1(e)} g/cm³ on average — ${e > 5 ? 'mostly steel' : e > 2.2 ? 'steel with plastic handles' : 'mostly plastic, or hollow'}.`;
}
function modelPanelHTML(t) {
  const mi = modelInfo(t.id); if (!mi) return '';
  const v = viewsOf(t.id), o = outlineOf(t.id), sc = S.lib.scans[t.id];
  const chip = (on, label, title = '') => `<span class="${on ? 'on' : ''}" title="${esc(title)}">${on ? '✓ ' : ''}${label}</span>`;
  const sh = FIT.shoulder(mi.profile), splitD = v.split ? v.split.d : Math.round(sh && sh.jump > 2 ? sh.d : mi.L * 0.45);
  return `<h3>Model it <span class="unit">any one of these makes a model; each one you add makes it truer</span></h3>
    ${angleCards(t)}
    <h3>3D model <span class="unit">${esc(mi.src)}</span></h3>
    <div id="tmSlot"></div>
    <div class="mstats"><div><span>Size</span>${f1(mi.L)} × ${f1(mi.W)} × ${f1(mi.T)}</div><div><span>Volume</span>${f1(mi.mass.volume / 1000)} cm³</div><div><span>Weight</span>${t.g ? `${f0(t.g)} g` : '—'}</div><div><span>Balance point</span>${f1(mi.dTip)} mm from the tip</div></div>
    <p class="unit" style="margin:2px 0 4px">${esc(balanceNote(mi))} The orange dot is the centre of gravity: hooks hang the tool with it straight below where it rests.</p>
    <div class="tags" style="margin:4px 0 8px">${chip(!!(o && o.src !== 'catalogue'), 'top photo')}${chip(!!(o && o.src === 'catalogue'), 'catalogue outline')}${chip(!!v.side, 'side photo')}${chip(!!v.end, 'end photo')}${chip(!!sc, '3D scan', sc ? `${sc.name || 'scan'} · ${sc.tris} triangles${sc.table ? ' · table removed' : ''}${sc.redo && sc.redo.length ? ' · hand cut, filled from the photos' : ''}` : '')}</div>
    <div class="tbar" style="margin-top:6px">${o ? `<button class="btn ghost small" type="button" data-tact="flip" data-k="flipTop">Swap ends</button>` : ''}${v.side ? `<button class="btn ghost small" type="button" data-tact="flip" data-k="flipSide">Swap side view ends</button><button class="btn ghost small" type="button" data-tact="flip" data-k="overSide">Turn side view over</button><button class="btn ghost small" type="button" data-tact="drop-view" data-view="side">Remove side</button>` : ''}${v.end ? '<button class="btn ghost small" type="button" data-tact="drop-view" data-view="end">Remove end</button>' : ''}${sc ? '<button class="btn ghost small" type="button" data-tact="drop-scan">Remove scan</button>' : ''}<button class="btn ghost small" type="button" data-tact="model-stl">Model .stl</button></div>
    <div class="row" style="margin-top:8px"><label for="tv_split">Weight spread</label><select id="tv_split" data-tv="split"><option value="" ${v.split ? '' : 'selected'}>Even all through</option><option value="tip" ${v.split ? 'selected' : ''}>Steel end, light handle</option></select></div>
    ${v.split ? `<div class="row"><label for="tv_splitd">Handle starts <small>mm from the tip</small></label><input type="number" id="tv_splitd" data-tv="splitD" value="${splitD}" step="1" min="1" max="${Math.round(mi.L)}"></div>` : ''}`;
}
function renderToolModel(t) {
  const slot = $('#tmSlot'); if (!slot) return;
  if (!TMV.v) { TMV.v = new Viewer(4000); TMV.v.el.className = 'viewer tmv'; }
  slot.appendChild(TMV.v.el); TMV.v.resize();
  const v = TMV.v, lab = labelLayer(v); v.clear(); lab.clear();
  const mi = modelInfo(t.id), geo = modelGeo(t.id); if (!mi || !geo) return;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.45, metalness: 0.3 })); mesh.userData.shared = true; v.root.add(mesh);
  const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: 0x15150c, transparent: true, opacity: 0.25 })); v.root.add(ed);
  const e = mi.ext, box = new THREE.Box3(new THREE.Vector3(e.x0, e.y0, 0), new THREE.Vector3(e.x1, e.y1, e.T));
  const bh = new THREE.Box3Helper(box, 0x15150c); bh.material.transparent = true; bh.material.opacity = 0.3; v.root.add(bh);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(e.L + 30, e.W + 30), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); plate.position.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, -0.1); v.root.add(plate);
  v.root.add(cogMarker(mi.mass.cog, mi.T));
  lab.add(new THREE.Vector3((e.x0 + e.x1) / 2, e.y0, 0), f1(mi.L)); lab.add(new THREE.Vector3(e.x1, (e.y0 + e.y1) / 2, 0), f1(mi.W)); lab.add(new THREE.Vector3(e.x0, e.y1, e.T / 2), f1(mi.T));
  lab.add(new THREE.Vector3(e.x1 + 4, (e.y0 + e.y1) / 2, e.T + 2), 'tip', 'num');
  lab.add(new THREE.Vector3(...mi.mass.cog).add(new THREE.Vector3(0, 0, mi.T * 0.6 + 4)), `balance · ${f1(mi.dTip)} from tip`, 'warn');
  v.frame(new THREE.Box3(new THREE.Vector3(e.x0, e.y0, 0), new THREE.Vector3(e.x1, e.y1, e.T)), [0.45, -1, 0.75], 1.05);
}
function geoToSTL(geo, name) {
  const g = geo.index ? geo.toNonIndexed() : geo, pos = new Float32Array(g.attributes.position.array), idx = new Uint32Array(pos.length / 3).map((_, k) => k);
  const data = stlBinary(pos, idx, name); if (g !== geo) g.dispose(); return data;
}
function editTool(id, k, v) {
  const t = tool(id); if (!t) return;
  if (t.src === 'custom') { const c = S.lib.custom.find((x) => x.id === t.id); if (c) { c[k] = v; c.est = false; } }
  else { const e = S.lib.edits[t.id] || {}; e[k] = v; e.est = false; e.estFields = (t.estFields || []).filter((x) => x !== k); S.lib.edits[t.id] = e; }
  rebuildLib(); saveState();
}
function togglePick(id, on) {
  const tid = toolId(id);
  S.pick = S.pick.filter((x) => x !== tid); if (on) S.pick.push(tid);
  saveState();
  $$(`.tcard[data-tool="${CSS.escape(tid)}"]`).forEach((c) => { c.classList.toggle('picked', on); const cb = $('input[data-pick]', c); if (cb) cb.checked = on; });
  $$(`input[data-pick="${CSS.escape(tid)}"]`).forEach((cb) => { cb.checked = on; });
  renderSelBar(); renderToolsPanel();
}
function focusTool(id) {
  UIT.focus = id;
  $$('.tcard').forEach((c) => c.classList.toggle('focus', c.dataset.tool === id));
  renderToolDetail();
}
function onToolsChange(e) {
  const el = e.target;
  if (el.dataset.tf) { const v = el.type === 'checkbox' ? el.checked : el.value; if (S.tf[el.dataset.tf] === v) return; S.tf[el.dataset.tf] = v; saveState(); renderToolGrid(); }
}
function toolsAction(act, b) {
  if (act === 'unpick') togglePick(b.dataset.id, false);
  else if (act === 'unpick-all' || act === 'unpick') { S.pick = []; saveState(); renderTools(); }
  else if (act === 'make-picked') makeFor(b.dataset.type, S.pick.slice());
  else if (act === 'trace-picked') { S.traceFor = S.pick.slice(); S.backTo = null; saveState(); setTab('trace'); }
  else if (act === 'trace-sheet') { S.traceFor = S.pick.slice(); S.backTo = null; saveState(); setTab('trace'); }
  else if (act === 'scan-open') { S.backTo = null; setTab('scan'); }
  else if (act === 'tool-new') {
    const id = `my-${uid()}`;
    S.lib.custom.push({ id, name: 'New tool', brand: '', cat: 'My tools', kind: 'plier', L: 150, W: 50, T: 12, D: 0, d: 0, head: 18, g: 0, qty: 1, zone: '', est: true, src: 'custom' });
    rebuildLib(); UIT.focus = id; S.tf = { ...S.tf, q: '', cat: '', status: '' }; saveState(); renderTools();
    requestAnimationFrame(() => { const c = $(`.tcard[data-tool="${id}"]`); if (c) c.scrollIntoView({ block: 'center' }); });
  } else if (act === 'inv-import') $('#invFile').click();
  else if (act === 'lib-save') download(`gridlab_tools_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ gridlab_tools: 1, edits: S.lib.edits, custom: S.lib.custom, outlines: S.lib.outlines }, null, 1), 'application/json');
  else if (act === 'cat-all') outlineAllFromCatalogue();
}
function onStageClick(e) {
  if (S.tab === 'trace') return reviewClick(e);
  if (S.tab !== 'tools') return;
  if (e.target.closest('input[data-pick]') || e.target.closest('label.pick')) return;
  const b = e.target.closest('[data-tact]');
  if (b) return stageToolAction(b.dataset.tact, b);
  const c = e.target.closest('.tcard');
  if (c) { if (e.shiftKey || e.metaKey || e.ctrlKey) togglePick(c.dataset.tool, !S.pick.includes(c.dataset.tool)); else focusTool(c.dataset.tool); }
}
function onStageChange(e) {
  if (S.tab === 'trace') { if (e.target.id === 'rvFocus') { RV.focus = e.target.value; showReview(true); } return; }
  if (S.tab !== 'tools') return;
  const el = e.target;
  if (el.dataset.pick) return togglePick(el.dataset.pick, el.checked);
  if (el.dataset.tv) {
    const t = tool(UIT.focus); if (!t) return;
    if (el.dataset.tv === 'split') { const mi = modelInfo(t.id), sh = mi && FIT.shoulder(mi.profile); setViews(t.id, { split: el.value ? { d: Math.round(sh && sh.jump > 2 ? sh.d : (mi ? mi.L : t.L) * 0.45), ratio: 6 } : null }); }
    else if (el.dataset.tv === 'splitD') { const v = viewsOf(t.id); setViews(t.id, { split: { ...(v.split || { ratio: 6 }), d: Math.max(1, parseFloat(el.value) || 1) } }); }
    saveState(); return renderToolDetail();
  }
  if (el.dataset.te) {
    const k = el.dataset.te, t = tool(UIT.focus); if (!t) return;
    const v = k === 'kind' || k === 'zone' || k === 'name' ? el.value.trim() : Math.max(0, parseFloat(el.value) || 0);
    editTool(t.id, k, k === 'qty' ? Math.max(1, Math.round(v)) : v);
    renderToolDetail(); const c = $(`.tcard[data-tool="${CSS.escape(t.id)}"]`); if (c) c.outerHTML = cardHTML(tool(t.id), homes());
  }
}
async function stageToolAction(act, b) {
  const t = tool(UIT.focus);
  if (act === 'close') { focusTool(null); return; }
  if (act === 'make') return makeFor(b.dataset.type, S.pick.slice());
  if (act === 'trace-picked') { S.traceFor = S.pick.slice(); saveState(); return setTab('trace'); }
  if (act === 'unpick-all') { S.pick = []; saveState(); return renderTools(); }
  if (!t) return;
  if (act === 'make1') return makeFor(b.dataset.type, [t.id]);
  if (act === 'trace') { S.traceFor = [t.id]; TT().view = 'top'; S.backTo = t.id; saveState(); return setTab('trace'); }
  if (act === 'open') return openItem(b.dataset.id);
  if (act === 'unoutline') { delete S.lib.outlines[t.id]; saveState(); renderToolDetail(); renderToolGrid(); return; }
  if (act === 'reset') { delete S.lib.edits[t.id]; rebuildLib(); saveState(); renderToolDetail(); renderToolGrid(); return; }
  if (act === 'delete') { S.lib.custom = S.lib.custom.filter((x) => x.id !== t.id); delete S.lib.outlines[t.id]; S.pick = S.pick.filter((x) => x !== t.id); UIT.focus = null; rebuildLib(); saveState(); return renderTools(); }
  if (act === 'add-view') { S.traceFor = [t.id]; TT().view = b.dataset.view; S.backTo = t.id; saveState(); return setTab('trace'); }
  if (act === 'add-scan') { if (SC.link !== t.id) { SC.raw = null; SC.pos = null; SC.name = ''; SC.trimL = 0; SC.trimR = 0; SC.turns = []; SC.err = ''; } SC.link = t.id; SC.merge = !!outlineOf(t.id); S.backTo = t.id; saveState(); return setTab('scan'); }
  if (act === 'flip') { const v = viewsOf(t.id); setViews(t.id, { [b.dataset.k]: !v[b.dataset.k] }); saveState(); return renderToolDetail(); }
  if (act === 'drop-view') { setViews(t.id, { [b.dataset.view]: null }); saveState(); renderToolDetail(); return renderToolGrid(); }
  if (act === 'drop-scan') { delete S.lib.scans[t.id]; MEM.scans.delete(t.id); MEM.info.delete(t.id); IDB.del(t.id).catch(() => {}); saveState(); renderToolDetail(); return renderToolGrid(); }
  if (act === 'model-stl') { const geo = modelGeo(t.id); if (geo) { const mi = modelInfo(t.id); download(`${slug(t.name)}_${f1(mi.L)}x${f1(mi.W)}x${f1(mi.T)}.stl`, geoToSTL(geo, t.name), 'model/stl'); } return; }
  if (act === 'catalogue') {
    b.disabled = true; b.textContent = 'Outlining…';
    try { S.lib.outlines[t.id] = await catalogueOutline(t); saveState(); toast('Outline from the catalogue photo — check it against the tool'); }
    catch (err) { toast(`Couldn’t outline that photo (${err.message || err})`); }
    renderToolDetail(); renderToolGrid();
  }
}
// outline from the inventory's cut-out photo: transparent PNG/WebP on white, largest shape, scaled to the listed length
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('photo didn’t load')); im.src = src; }); }
async function catalogueOutline(t) {
  if (!t.photo || !t.L) throw new Error(t.L ? 'no photo' : 'no length to scale to');
  const im = await loadImg(t.photo);
  const sc = 900 / Math.max(im.width, im.height), iw = Math.round(im.width * sc), ih = Math.round(im.height * sc), w = iw + 80, h = ih + 80;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 40, 40, iw, ih);
  const r = TR.detectTools(x.getImageData(0, 0, w, h), 1, { threshold: 0, shadow: 0.2, smooth: 2, simplify: 1.2, minArea: 900, margin: 4, fillHoles: true, close: 3 });
  const best = r.tools.sort((a, b) => b.area - a.area)[0];
  if (!best) throw new Error('no shape found');
  const k = t.L / best.L;
  return { pts: best.pts.map(([u, v]) => [+(u * k).toFixed(2), +(v * k).toFixed(2)]), L: +t.L, W: +(best.W * k).toFixed(1), area: Math.round(best.area * k * k), src: 'catalogue', at: new Date().toISOString().slice(0, 10) };
}
async function outlineAllFromCatalogue() {
  if (UIT.busy) return;
  const list = LIB.list.filter((t) => t.photo && t.kind !== 'bench' && !(outlineOf(t.id) && outlineOf(t.id).src !== 'catalogue'));
  UIT.busy = true; let ok = 0;
  for (let i = 0; i < list.length; i++) {
    toast(`Outlining ${i + 1} / ${list.length}…`);
    try { S.lib.outlines[list[i].id] = await catalogueOutline(list[i]); ok++; } catch (e) { /* skip that one */ }
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }
  UIT.busy = false; saveState(); toast(`${ok} outlines from catalogue photos — traced ones kept`);
  if (S.tab === 'tools') { renderToolGrid(); renderToolDetail(); }
}
// inventory or library file, from the Tools panel
async function onInvFiles(files) {
  let tools = null, kits = [], libFile = null;
  for (const f of files) {
    try { const j = JSON.parse(await f.text()); if (j && j.gridlab_tools) libFile = j; else if (/kit/i.test(f.name)) kits = j; else tools = j; }
    catch (e) { toast(`${f.name} isn’t JSON`); return; }
  }
  if (libFile) { S.lib.edits = { ...S.lib.edits, ...(libFile.edits || {}) }; S.lib.outlines = { ...S.lib.outlines, ...(libFile.outlines || {}) }; const have = new Set(S.lib.custom.map((x) => x.id)); for (const c of libFile.custom || []) if (!have.has(c.id)) S.lib.custom.push(c); }
  if (tools) {
    const inv = LIBM.importInventory(tools, kits, { imgBase: '' });
    if (!inv.length) { toast('No tools found in that file'); return; }
    S.lib.inv = inv.map((t) => ({ ...t, photo: '' }));
    const m = LIBM.mergeLibrary(S.lib.inv); LIB.base = m.tools; LIB.alias = m.alias; LIB.source = 'imported'; LIB.invCount = inv.length;
  }
  rebuildLib(); saveState(); if (S.tab === 'tools') renderTools();
  toast(tools ? `Imported ${LIB.invCount} tools${libFile ? ' and your library edits' : ''}` : 'Library edits and outlines loaded');
}
async function loadInventory() {
  const onSite = /\/internal\//.test(location.pathname);
  const bl = $('#backlink'); if (bl) bl.hidden = !onSite;
  let inv = null;
  if (onSite) {
    try {
      const base = new URL('../tools/', location.href);
      const [a, b] = await Promise.all([fetch(new URL('data/tools.json', base), { credentials: 'same-origin', cache: 'no-cache' }), fetch(new URL('data/kits.json', base), { credentials: 'same-origin', cache: 'no-cache' }).catch(() => null)]);
      if (a.ok) { const tools = await a.json(); const kits = b && b.ok ? await b.json() : []; inv = LIBM.importInventory(tools, kits, { imgBase: new URL('img/', base).href }); if (inv.length) LIB.source = 'live'; }
    } catch (e) { inv = null; }
  }
  if ((!inv || !inv.length) && S.lib.inv && S.lib.inv.length) { inv = S.lib.inv; LIB.source = 'imported'; }
  if (inv && inv.length) { const m = LIBM.mergeLibrary(inv); LIB.base = m.tools; LIB.alias = m.alias; LIB.invCount = inv.length; }
  rebuildLib();
}

// ---------- SCAN: open a 3D scan or model, measure it, weigh it, merge it with the photo trace ----------
const SC = { link: '', name: '', ext: '', raw: null, units: 'auto', clean: true, merge: true, table: true, hand: true, trimL: 0, trimR: 0, g: 0, mat: 'steel', turns: [], busy: false, err: '', v: null };
const UNITS = { mm: [1, 'mm'], cm: [10, 'cm'], m: [1000, 'm'], in: [25.4, 'in'] };
const DENS = [['steel', 'steel', 7.85], ['stainless', 'stainless steel', 8.0], ['alu', 'aluminium', 2.7], ['brass', 'brass', 8.5], ['abs', 'ABS / nylon', 1.05], ['pla', 'PLA', 1.24], ['wood', 'wood', 0.6]];
async function readMesh(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'usdz' || ext === 'usdc' || ext === 'usd') throw new Error('USDZ from an iPhone is binary USD, which browsers can’t read — export OBJ, STL, PLY or GLB from the scanning app instead');
  const buf = await file.arrayBuffer();
  let obj;
  if (ext === 'stl') { const { STLLoader } = await import('./lib/loaders/STLLoader.js'); obj = new STLLoader().parse(buf); }
  else if (ext === 'ply') { const { PLYLoader } = await import('./lib/loaders/PLYLoader.js'); obj = new PLYLoader().parse(buf); if (!obj.index) throw new Error('that PLY is a point cloud — export a mesh'); }
  else if (ext === 'obj') { const { OBJLoader } = await import('./lib/loaders/OBJLoader.js'); obj = new OBJLoader().parse(new TextDecoder().decode(buf)); }
  else if (ext === 'glb' || ext === 'gltf') { const { GLTFLoader } = await import('./lib/loaders/GLTFLoader.js'); obj = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', (g) => res(g.scene), (e) => rej(new Error(/draco/i.test(String(e && e.message)) ? 'that GLB is Draco-compressed — export it uncompressed' : ext === 'gltf' ? 'that .gltf points at separate files — export a single .glb' : String((e && e.message) || e))))); }
  else if (ext === '3mf') { const { ThreeMFLoader } = await import('./lib/loaders/3MFLoader.js'); obj = new ThreeMFLoader().parse(buf); }
  else throw new Error(`.${ext} isn’t a 3D format GRIDLAB reads — STL, OBJ, PLY, GLB/glTF or 3MF`);
  const P = [], I = [], v = new THREE.Vector3();
  const add = (geo, mat) => {
    const pa = geo.attributes.position; if (!pa) return;
    const base = P.length / 3;
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); if (mat) v.applyMatrix4(mat); P.push(v.x, v.y, v.z); }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) I.push(base + geo.index.getX(i)); else for (let i = 0; i < pa.count - (pa.count % 3); i++) I.push(base + i);
  };
  if (obj.isBufferGeometry) add(obj, null);
  else { obj.updateMatrixWorld(true); obj.traverse((o) => { if (o.isMesh && o.geometry) add(o.geometry, o.matrixWorld); }); }
  if (I.length < 12) throw new Error('no triangles in that file — export a mesh');
  return { pos: new Float32Array(P), idx: new Uint32Array(I), ext };
}
// lie it on its flattest face, working end (the narrower one) toward +x
function orientScan(P, idx) {
  let zl = Infinity, zh = -Infinity, xl = Infinity, xh = -Infinity;
  for (let i = 0; i < P.length; i += 3) { zl = Math.min(zl, P[i + 2]); zh = Math.max(zh, P[i + 2]); xl = Math.min(xl, P[i]); xh = Math.max(xh, P[i]); }
  const T = zh - zl, L = xh - xl; let down = 0, up = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, n = Math.hypot(nx, ny, nz); if (!n) continue;
    if (Math.abs(nz) / n < 0.95) continue;
    const zc = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    if (zc < zl + 0.06 * T) down += n / 2; else if (zc > zh - 0.06 * T) up += n / 2;
  }
  if (up > down * 1.15) MD.turn(P, 'x');
  const wAt = (lo, hi) => { let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < P.length; i += 3) if (P[i] >= lo && P[i] <= hi) { y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); } return y1 > y0 ? y1 - y0 : 0; };
  if (wAt(xh - 0.1 * L, xh) > wAt(xl, xl + 0.1 * L) * 1.08) MD.turn(P, 'z');
  return MD.seat(P);
}
// the photo views of a tool as a height field (to fill what a scan missed or what was cut away)
function photoHF(t) { try { return MD.hfFromViews({ top: topOf(t.id), side: sideOf(t.id), end: endOf(t.id), T: FIT.dims(t).T }); } catch (e) { return null; } }
// what a scan missed inside the photo outline: from a side or end photo if there is one (real thickness), otherwise
// the nearest scanned section carried along; the listed thickness only for what's left
function fillScan(hf, t, top) {
  const v = viewsOf(t.id); let n = 0;
  if (v.side || v.end) { const ph = photoHF(t); if (ph) n += MD.fillFrom(hf, ph, top); }
  n += MD.fillNear(hf, top, 60);
  const ph = photoHF(t); if (ph) n += MD.fillFrom(hf, ph, top);
  return n;
}
function processScan() {
  const t = tool(SC.link), r = SC.raw; if (!r) return;
  let { pos, idx } = MD.weld(r.pos, r.idx);
  SC.rawStats = MD.meshStats(pos, idx);
  const [f, uname] = SC.units === 'auto' ? MD.guessScale(SC.rawStats.size, t ? t.L : 0) : UNITS[SC.units];
  SC.unitF = f; SC.unitName = uname;
  for (let i = 0; i < pos.length; i++) pos[i] *= f; // millimetres from here on
  // 1 · the table it sat on: the big flat patch that reaches past everything else
  SC.tableHit = null;
  if (SC.table) {
    const big = Math.max(...SC.rawStats.size) * f;
    const tb = MD.findTable(pos, idx, { eps: Math.max(0.8, big * 0.004) });
    if (tb) { idx = MD.cutTable(pos, idx, tb); SC.tableHit = tb; }
  }
  // 2 · loose bits
  SC.pieces = 1; SC.kept = 1;
  if (SC.clean) { const lp = MD.largestPiece(pos, idx); idx = lp.idx; SC.pieces = lp.pieces; SC.kept = lp.kept; }
  ({ pos, idx } = MD.compact(pos, idx));
  // 3 · lay it down: on the table if it had one (open underneath — solid down to the table), else its flattest face
  let P;
  if (SC.tableHit) {
    P = MD.onTable(pos, idx, SC.tableHit);
    const wAt = (lo, hi) => { let y0 = Infinity, y1 = -Infinity; for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3; if (P[v] >= lo && P[v] <= hi) { y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); } } return y1 > y0 ? y1 - y0 : 0; };
    const ex = MD.extentX(P, idx), L = ex.x1 - ex.x0;
    if (wAt(ex.x1 - 0.1 * L, ex.x1) > wAt(ex.x0, ex.x0 + 0.1 * L) * 1.08) MD.turn(P, 'z');
  } else { const fr = MD.principal(pos, idx); P = orientScan(MD.applyFrame(pos, fr.centre, fr.axes, 1), idx); }
  const open = !!SC.tableHit || !MD.meshStats(P, idx).closed;
  SC.floor = open ? 0 : null;
  // 4 · a hand or a stand on one end: past the photo's length it goes; a fat end is flagged
  const top = t && outlineOf(t.id) ? topOf(t.id) : null;
  const preIdx = idx; SC.preExt = MD.extentX(P, idx); SC.rawLen = SC.preExt.x1 - SC.preExt.x0;
  const hf0 = MD.hfFromMesh(P, idx, { floor: SC.floor });
  SC.blob = MD.endBlob(hf0); SC.auto = null; SC.redo = [];
  if (top && SC.hand) {
    const w = MD.slideMatch(hf0, top);
    if (w && w.iou > 0.3) {
      idx = MD.cutX(P, idx, w.a - 1, w.b + 1); SC.auto = w;
      // under a hand the scan saw the hand, not the tool: that stretch is rebuilt from the photos
      // kept as fractions of the length from the low-x end; turned with the scan below
      // (4 mm past where the fat end starts: a hand's edge is soft)
      if (SC.blob && SC.blob.x > w.a && SC.blob.x < w.b) { const L = w.b - w.a, fb = (SC.blob.x - w.a) / L, mg = 4 / L; SC.redo.push(SC.blob.end === 'tip' ? [fb - mg, 1.02] : [-0.02, fb + mg]); }
    }
  }
  // trims are given as you see the scan (left, right); it may have been turned end for end on the last pass
  const tL = SC.zOdd ? SC.trimR : SC.trimL, tR = SC.zOdd ? SC.trimL : SC.trimR;
  if (tL > 0 || tR > 0) { const ex = MD.extentX(P, idx); idx = MD.cutX(P, idx, ex.x0 + tL, ex.x1 - tR); }
  if (SC.auto || SC.trimL > 0 || SC.trimR > 0) {
    if (SC.clean && idx.length) { const lp = MD.largestPiece(P, idx); idx = lp.idx; }
    if (SC.tableHit) MD.seatXY(P, idx); else MD.seatIdx(P, idx);
  }
  if (!idx.length) { SC.err = 'nothing left after the clean-up — loosen the trims'; SC.pos = null; return; }
  // 5 · the photo knows the true length and the outline: scale to it and try each way round (on a table: never upside down)
  SC.iou = null; SC.scale = 1; SC.top = top; let zn = 0;
  const seatK = (Q) => (SC.tableHit ? MD.seatXY(Q, idx) : MD.seatIdx(Q, idx));
  if (top) {
    let x0 = Infinity, x1 = -Infinity; for (const [x] of top) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const ex = MD.extentX(P, idx);
    SC.scale = (x1 - x0) / (ex.x1 - ex.x0);
    for (let i = 0; i < P.length; i++) P[i] *= SC.scale;
    seatK(P);
    const test = idx.length > 240000 ? MD.decimate(P, idx, (x1 - x0) / 300) : { pos: P, idx };
    let best = { iou: -1, seq: [] };
    for (const seq of SC.tableHit ? [[], ['z']] : [[], ['z'], ['x'], ['z', 'x']]) {
      const Q = new Float32Array(test.pos); for (const a of seq) MD.turn(Q, a); (SC.tableHit ? MD.seatXY(Q, test.idx) : MD.seatIdx(Q, test.idx));
      const k = MD.iou(MD.hfFromMesh(Q, test.idx, { floor: SC.floor }), top); if (k > best.iou) best = { iou: k, seq };
    }
    for (const a of best.seq) { MD.turn(P, a); if (a === 'z') { SC.redo = SC.redo.map(([p, q]) => [1 - q, 1 - p]); zn++; } }
    seatK(P); SC.iou = best.iou;
  }
  for (const a of SC.turns) { MD.turn(P, a); if (a === 'z') { SC.redo = SC.redo.map(([p, q]) => [1 - q, 1 - p]); zn++; } }
  SC.zOdd = zn % 2 === 1;
  seatK(P);
  { const ex = MD.extentX(P, idx), L = ex.x1 - ex.x0; SC.redoX = SC.redo.map(([p, q]) => [ex.x0 + p * L, ex.x0 + q * L]); }
  // the stretch under the hand is the hand, not the tool: out of the mesh too (it's filled in below)
  for (const [p, q] of SC.redoX) { const keepA = MD.cutX(P, idx, -1e9, p), keepB = MD.cutX(P, idx, q, 1e9); idx = new Uint32Array([...keepA, ...keepB]); }
  SC.pos = P; SC.idx = idx; SC.cutIdx = idx.length < preIdx.length ? MD.minusTris(preIdx, idx) : null;
  SC.stats = MD.meshStats(MD.compact(P, idx).pos, MD.compact(P, idx).idx);
  const hf = MD.hfFromMesh(P, idx, { floor: SC.floor, cover: top && SC.merge ? top : null });
  SC.filled = 0;
  if (top && SC.merge) {
    MD.clipHF(hf, { top });
    for (const [p, q] of SC.redoX) MD.clearX(hf, p, q);
    SC.filled = fillScan(hf, t, top);
  }
  SC.hf = hf; SC.e = MD.hfExtent(hf);
  SC.mass = MD.massProps(hf, { g: SC.g || (t ? t.g : 0), split: t ? viewsOf(t.id).split : null });
  SC.profile = MD.profileOf(hf, 96);
  if (top && SC.merge) SC.iouAfter = MD.iou(hf, top);
  SC.outline = MD.hfOutline(MD.hfFromMesh(P, idx, { floor: SC.floor }));
}
function renderScan() {
  const t = tool(SC.link), o = t ? outlineOf(t.id) : null;
  const tools = LIB.list.filter((x) => x.kind !== 'bench').sort((a, b) => a.name.localeCompare(b.name));
  $('#panel').innerHTML = `${crumbHTML('3D scan')}<h2>Scan</h2><p class="blurb">Open a 3D scan, or any 3D model of a tool — STL, OBJ, PLY, GLB/glTF or 3MF. GRIDLAB measures it, lays it along its long axis, works out its weight and centre of gravity, and merges it with a photo trace of the same tool: the photo is true to scale, the scan knows the thickness.</p>
    <h3>1 · File</h3>
    <div class="row full"><input type="file" id="sc_file" accept=".stl,.obj,.ply,.glb,.gltf,.3mf,.usdz" aria-label="3D file"></div>
    ${SC.name ? `<p class="unit" style="margin:2px 0 6px">${esc(SC.name)}</p>` : '<p class="unit" style="margin:2px 0 6px">From the phone: export OBJ, STL, PLY or GLB (not USDZ), then AirDrop or Files it to this computer.</p>'}
    <div class="row"><label for="sc_units">File units</label><select id="sc_units" data-sc="units">${[['auto', `Work it out${SC.unitName ? ` — ${SC.unitName}` : ''}`], ['mm', 'millimetres'], ['cm', 'centimetres'], ['m', 'metres (phone scans)'], ['in', 'inches']].map(([v, l]) => `<option value="${v}" ${SC.units === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${t ? `<div class="angles one"><div class="angle"><div class="ah"><b>Scanning ${esc(shortName(t))}</b></div>${angleSVG('scan', viewShapes(t))}<p>${esc(ANGLES.scan.tip)}</p></div></div>` : `<p class="unit" style="margin:0 0 6px">${esc(ANGLES.scan.tip)}</p>`}
    <h3>2 · Clean up</h3>
    <div class="row"><label for="sc_table">Remove the table it sat on</label><input type="checkbox" id="sc_table" data-sc="table" ${SC.table ? 'checked' : ''}></div>
    ${SC.raw && SC.table ? `<p class="unit" style="margin:0 0 6px">${SC.tableHit ? `Found it — ${f0(SC.tableHit.frac * 100)} % of the surface was table. The tool is taken as solid down to it.` : 'No table found — the scan is just the tool, or it was cropped already.'}</p>` : ''}
    <div class="row"><label for="sc_clean">Keep only the biggest piece</label><input type="checkbox" id="sc_clean" data-sc="clean" ${SC.clean ? 'checked' : ''}></div>
    <div class="row"><label for="sc_hand">Cut away a hand or stand past the photo’s length</label><input type="checkbox" id="sc_hand" data-sc="hand" ${SC.hand ? 'checked' : ''} ${t && outlineOf(t.id) ? '' : 'disabled'}></div>
    ${SC.raw ? `<p class="unit" style="margin:0 0 6px">${SC.auto ? `Cut ${f0(Math.max(0, (SC.rawLen || 0) - (SC.auto.b - SC.auto.a)))} mm that wasn’t the tool — kept the ${f0(SC.auto.b - SC.auto.a)} mm stretch that matches the photo (${f0(SC.auto.iou * 100)} %).${SC.redoX && SC.redoX.length ? ' Under your hand the scan saw your hand, so that stretch is filled from the scan beside it (or a side photo, if there is one).' : ''}` : t && outlineOf(t.id) ? 'Nothing longer than the photo — no hand to cut.' : 'Needs a top photo of the tool: it knows the true length, so anything past it is cut.'}</p>` : ''}
    ${SC.blob && !SC.auto && !(SC.trimL || SC.trimR) ? `<div class="checks"><div class="check warn"><span class="tag">hand?</span><span>The ${(SC.blob.end === 'tip') !== !!SC.zOdd ? 'right' : 'left'} end is ${f1(SC.blob.ratio)}× fatter than the rest — a hand or a stand? <button class="btn ghost small" type="button" data-act="sc-blob">Cut it there</button> A screwdriver handle looks the same; leave it if that’s what it is.</span></div></div>` : ''}
    <div class="row"><label for="sc_trimL">Trim from the left end <small>mm</small></label><input type="number" id="sc_trimL" data-sc="trimL" value="${SC.trimL || 0}" min="0" step="1"></div>
    <div class="row"><label for="sc_trimR">Trim from the right end <small>mm</small></label><input type="number" id="sc_trimR" data-sc="trimR" value="${SC.trimR || 0}" min="0" step="1"></div>
    <h3>3 · Which tool</h3>
    <div class="row full"><select id="sc_link" data-sc="link"><option value="">Not linked — just measure it</option>${tools.map((x) => `<option value="${esc(x.id)}" ${t && t.id === x.id ? 'selected' : ''}>${esc(x.name)}${outlineOf(x.id) ? ' · traced' : ''}</option>`).join('')}</select></div>
    ${t ? (o ? `<div class="row"><label for="sc_merge">Trim the scan to the photo outline</label><input type="checkbox" id="sc_merge" data-sc="merge" ${SC.merge ? 'checked' : ''}></div><p class="unit" style="margin:0 0 6px">The scan is scaled to the photo’s ${f1(o.L)} mm length and turned to match it.</p>` : `<p class="unit" style="margin:0 0 6px">Trace a top photo of ${esc(shortName(t))} too: the photo fixes the scale and cleans up the outline.</p>`) : ''}
    <h3>4 · Weight</h3>
    <div class="row"><label for="sc_g">Weighs <small>g</small></label><input type="number" id="sc_g" data-sc="g" value="${SC.g || (t && t.g) || ''}" placeholder="—" min="0" step="1"></div>
    <div class="row"><label for="sc_mat">If it were all</label><select id="sc_mat" data-sc="mat">${DENS.map(([v, l, d]) => `<option value="${v}" ${SC.mat === v ? 'selected' : ''}>${l} · ${d} g/cm³</option>`).join('')}</select></div>
    <h3>5 · Use it</h3>
    <div class="actions"><button class="btn" type="button" data-act="sc-use" ${t && SC.pos ? '' : 'disabled'}>${t ? `Use as ${esc(shortName(t))}’s model` : 'Pick a tool to use it'}</button></div>
    <div class="actions"><button class="btn ghost small" type="button" data-act="sc-turn" data-axis="z" ${SC.pos ? '' : 'disabled'}>Swap ends</button><button class="btn ghost small" type="button" data-act="sc-turn" data-axis="x" ${SC.pos ? '' : 'disabled'}>Turn over</button><button class="btn ghost small" type="button" data-act="sc-stl" ${SC.pos ? '' : 'disabled'}>Cleaned .stl (mm)</button><button class="btn ghost small" type="button" data-act="sc-csv" ${SC.pos ? '' : 'disabled'}>Report .csv</button></div>
    <p class="unit">${t ? 'Saving keeps a lighter copy of the scan with the tool (in this browser) and sets its length, width and thickness from it. Hooks, saddles and holders for it then use its real shape and balance.' : ''}</p>`;
  $('#stage').innerHTML = `<div class="card mapwrap"><div class="maphead"><b>Scan</b><span class="mute" id="scHead">${SC.err ? esc(SC.err) : SC.busy ? 'Reading…' : SC.pos ? `${SC.tableHit ? 'on the table it sat on' : 'laid along its long axis'}, working end to the right · orange dot = centre of gravity${SC.cutIdx && SC.cutIdx.length ? ' · red = cut away' : ''}` : 'open a file to start'}</span></div><div id="scSlot"></div></div>
    <div class="stats" id="scStats"></div><div id="scProf"></div><div id="scCmp"></div><div class="checks" id="scChecks"></div>`;
  if (!SC.v) { SC.v = new Viewer(8000); SC.v.el.className = 'viewer rv'; }
  $('#scSlot').appendChild(SC.v.el); SC.v.resize();
  drawScan();
}
function drawScan() {
  const v = SC.v, lab = labelLayer(v); v.clear(); lab.clear();
  if (!SC.pos) { v.render(); return; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(SC.pos, 3)); geo.setIndex(new THREE.BufferAttribute(SC.idx, 1)); geo.computeVertexNormals();
  v.root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide })));
  if (SC.cutIdx && SC.cutIdx.length) {
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(SC.pos, 3)); cg.setIndex(new THREE.BufferAttribute(SC.cutIdx, 1)); cg.computeVertexNormals();
    v.root.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0xe5542e, transparent: true, opacity: 0.28, roughness: 0.8, side: THREE.DoubleSide, depthWrite: false })));
  }
  const e = SC.e, st = SC.stats;
  const bh = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(e.x0, e.y0, 0), new THREE.Vector3(e.x1, e.y1, e.T)), 0x15150c); bh.material.transparent = true; bh.material.opacity = 0.3; v.root.add(bh);
  if (SC.top) { const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(SC.top.map(([x, y]) => new THREE.Vector3(x, y, 0.2))), new THREE.LineBasicMaterial({ color: 0x2f6fd6 })); v.root.add(line); }
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(e.L + 40, e.W + 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); pl.position.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, -0.15); v.root.add(pl);
  v.root.add(cogMarker(SC.mass.cog, e.T));
  lab.add(new THREE.Vector3((e.x0 + e.x1) / 2, e.y0, 0), f1(e.L)); lab.add(new THREE.Vector3(e.x1, (e.y0 + e.y1) / 2, 0), f1(e.W)); lab.add(new THREE.Vector3(e.x0, e.y1, e.T / 2), f1(e.T));
  lab.add(new THREE.Vector3(...SC.mass.cog).add(new THREE.Vector3(0, 0, e.T * 0.6 + 4)), `balance · ${f1(SC.mass.dTip)} from the tip`, 'warn');
  v.frame(new THREE.Box3(new THREE.Vector3(e.x0, e.y0, 0), new THREE.Vector3(e.x1, e.y1, e.T)), [0.4, -1, 0.7], 1.05);
  const t = tool(SC.link), g = SC.g || (t && t.g) || 0, dens = DENS.find((d) => d[0] === SC.mat) || DENS[0];
  const volCm3 = SC.mass.volume / 1000;
  $('#scStats').innerHTML = [
    ['Size, laid flat', `${f1(e.L)} × ${f1(e.W)} × ${f1(e.T)} mm`], ['In the file', `${SC.rawStats.size.map((x) => f1(x * SC.unitF)).join(' × ')} mm · ${SC.unitName}`],
    ['Triangles', `${f0(st.tris)}${SC.pieces > 1 ? ` · ${SC.pieces - 1} loose bit${SC.pieces > 2 ? 's' : ''} dropped` : ''}`], ['Watertight', st.closed ? 'yes' : `no — ${f0(st.open)} open edges`],
    ['Volume', `${f1(volCm3)} cm³${st.closed ? ` · mesh ${f1(st.volume / 1000)}` : ''}`], ['Surface', `${f1(st.area / 100)} cm²`],
    ['Weight', g ? `${f0(g)} g · ${f1(g / volCm3)} g/cm³` : `≈ ${f0(volCm3 * dens[2])} g if all ${dens[1]}`], ['Balance point', `${f1(SC.mass.dTip)} mm from the tip, ${f1(SC.mass.height)} mm up`],
  ].map(([k, val]) => `<div><div class="k">${k}</div><div class="v" style="font-size:15px">${val}</div></div>`).join('');
  $('#scProf').innerHTML = profileChart(SC.profile, SC.e.L, SC.mass.dTip);
  const ch = [];
  const iouShow = SC.iouAfter != null && SC.merge ? Math.max(SC.iou || 0, SC.iouAfter) : SC.iou;
  if (SC.iou != null) ch.push(`<div class="check ${iouShow > 0.85 ? 'ok' : 'warn'}"><span class="tag">photo</span><span>Outline matches the photo ${f0(iouShow * 100)} %${SC.merge && SC.iouAfter != null && SC.iouAfter > SC.iou + 0.02 ? ` once trimmed (${f0(SC.iou * 100)} % as scanned)` : ''}. Scaled ×${(Math.round(SC.scale * 1000) / 1000)} to the photo’s length${Math.abs(SC.scale - 1) > 0.03 ? ` — the scan was ${f1(Math.abs(1 - 1 / SC.scale) * 100)} % ${SC.scale > 1 ? 'small' : 'big'}` : ''}.${iouShow < 0.85 ? ' Low: check it’s the right tool, or swap ends / turn it over.' : ''}</span></div>`);
  if (!st.closed) ch.push(`<div class="check"><span class="tag">mesh</span><span>Not watertight (normal for phone scans). Volume and balance come from the solid under the scanned surface, column by column.</span></div>`);
  if (g) { const e2 = g / volCm3; ch.push(`<div class="check ${e2 > 8.6 || e2 < 0.6 ? 'warn' : ''}"><span class="tag">density</span><span>${esc(balanceNote({ mass: { eff: e2 } }))}</span></div>`); }
  if (SC.kept && SC.kept < 0.9) ch.push(`<div class="check"><span class="tag">clean</span><span>Kept ${f0(SC.kept * 100)} % of the triangles — the rest were loose bits (table, stand). Untick “biggest piece” if that cut the tool.</span></div>`);
  if (SC.cutIdx && SC.cutIdx.length) ch.push(`<div class="check"><span class="tag">cut</span><span>The faint red is what was cut away (${f0(SC.cutIdx.length / 3)} triangles).${SC.filled ? ` ${f0(SC.filled * SC.hf.res * SC.hf.res)} mm² inside the outline that the scan didn’t cover is filled in.` : ''}</span></div>`);
  else if (SC.filled > 40) ch.push(`<div class="check"><span class="tag">fill</span><span>${f0(SC.filled * SC.hf.res * SC.hf.res)} mm² inside the photo outline had no scan (shiny steel scans badly) — filled from the scan beside it.</span></div>`);
  $('#scChecks').innerHTML = ch.join('');
  $('#scCmp').innerHTML = SC.top && SC.outline ? compareSVG(SC.top, SC.outline) : '';
}
function profileChart(prof, L, dTip) {
  const W = 760, H = 150, pad = 28, mx = Math.max(1, ...prof.map((r) => Math.max(r[1], r[2])));
  const X = (d) => pad + (d / L) * (W - 2 * pad), Y = (v) => H - 22 - (v / mx) * (H - 40);
  const line = (k, col) => `<polyline points="${prof.filter((r) => r[1] > 0).map((r) => `${X(r[0]).toFixed(1)},${Y(r[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  return `<div class="card mapwrap"><div class="maphead"><b>Along the length</b><span class="mute">width <span style="color:#2f6fd6">—</span> and thickness <span style="color:var(--ink)">—</span>, mm, from the tip</span></div><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <line x1="${pad}" x2="${W - pad}" y1="${H - 22}" y2="${H - 22}" stroke="var(--rule-strong)"/>
    ${[0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${X(L * f)}" y="${H - 6}" text-anchor="middle" style="font:400 10px var(--sans);fill:var(--muted)">${f0(L * f)}</text>`).join('')}
    ${line(1, '#2f6fd6')}${line(2, 'var(--ink)')}
    <line x1="${X(dTip)}" x2="${X(dTip)}" y1="10" y2="${H - 22}" stroke="#e8501c" stroke-dasharray="4 3"/><text x="${X(dTip) + 4}" y="20" style="font:400 10px var(--sans);fill:#e8501c">balance ${f1(dTip)}</text>
    <text x="${pad}" y="12" style="font:400 10px var(--sans);fill:var(--muted)">${f1(mx)} mm</text></svg></div>`;
}
function compareSVG(A, B) {
  const all = [...A, ...B]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 6, path = (P) => 'M' + P.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L') + 'Z';
  return `<div class="card mapwrap"><div class="maphead"><b>Scan against the photo</b><span class="mute"><span style="color:#2f6fd6">blue</span> photo outline · grey scan, seen from above</span></div><svg viewBox="${x0 - pad} ${-y1 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" style="width:100%;max-height:220px;display:block"><path d="${path(B)}" fill="#a3a5a2" fill-opacity=".55"/><path d="${path(A)}" fill="none" stroke="#2f6fd6" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg></div>`;
}
async function onScanChange(e) {
  const el = e.target;
  if (el.id === 'sc_file') {
    const f = el.files[0]; if (!f) return;
    SC.busy = true; SC.err = ''; SC.name = f.name; SC.turns = []; renderScan();
    SC.trimL = 0; SC.trimR = 0;
    try { SC.raw = await readMesh(f); processScan(); } catch (err) { SC.err = `Couldn’t read it: ${err.message || err}`; SC.raw = null; SC.pos = null; }
    SC.busy = false; renderScan(); return;
  }
  const k = el.dataset.sc; if (!k) return;
  SC[k] = el.type === 'checkbox' ? el.checked : k === 'g' || k === 'trimL' || k === 'trimR' ? Math.max(0, parseFloat(el.value) || 0) : el.value;
  if (k === 'link') { SC.turns = []; SC.trimL = 0; SC.trimR = 0; const t = tool(SC.link); SC.g = 0; if (t && !outlineOf(t.id)) SC.merge = false; else SC.merge = true; }
  if (SC.raw && k !== 'mat') processScan();
  renderScan();
}
async function scanAction(act, b) {
  if (act === 'sc-turn') { SC.turns.push(b.dataset.axis); processScan(); return renderScan(); }
  if (act === 'sc-blob' && SC.blob) {
    const ex = SC.preExt, cut = SC.blob.end === 'tip' ? Math.max(0, Math.round(ex.x1 - SC.blob.x)) : Math.max(0, Math.round(SC.blob.x - ex.x0));
    const right = (SC.blob.end === 'tip') !== !!SC.zOdd; if (right) SC.trimR = cut; else SC.trimL = cut;
    processScan(); return renderScan();
  }
  if (act === 'sc-stl') { const k = MD.compact(SC.pos, SC.idx); return download(`${slug(SC.name.replace(/\.\w+$/, ''))}_mm.stl`, stlBinary(k.pos, k.idx, SC.name), 'model/stl'); }
  if (act === 'sc-csv') {
    const rows = [['item', 'value'], ['file', SC.name], ['units', SC.unitName], ['triangles', SC.stats.tris], ['watertight', SC.stats.closed ? 'yes' : 'no'], ['length_mm', f1(SC.e.L)], ['width_mm', f1(SC.e.W)], ['thickness_mm', f1(SC.e.T)], ['volume_cm3', f1(SC.mass.volume / 1000)], ['surface_cm2', f1(SC.stats.area / 100)], ['balance_from_tip_mm', f1(SC.mass.dTip)], ['balance_height_mm', f1(SC.mass.height)], ['photo_match', SC.iou != null ? f1(SC.iou * 100) + ' %' : ''], ['scale_to_photo', SC.scale.toFixed(4)], [], ['from_tip_mm', 'width_mm', 'thickness_mm'], ...SC.profile.map((r) => [r[0], r[1], r[2]])];
    return download(`${slug(SC.name.replace(/\.\w+$/, ''))}_report.csv`, rows.map((r) => r.join(',')).join('\n') + '\n', 'text/csv');
  }
  if (act === 'sc-use') {
    const t = tool(SC.link); if (!t || !SC.pos) return;
    const kept = MD.compact(SC.pos, SC.idx), d = kept.idx.length > 90000 ? MD.decimate(kept.pos, kept.idx, Math.max(0.35, SC.e.L / 350)) : kept;
    const store = { pos: new Float32Array(d.pos), idx: new Uint32Array(d.idx) };
    try { await IDB.put(t.id, store); } catch (err) { toast(`Couldn’t store the scan in this browser (${err.message || err})`); return; }
    MEM.scans.set(t.id, store);
    S.lib.scans[t.id] = { name: SC.name, tris: d.idx.length / 3, units: SC.unitName, scale: +SC.scale.toFixed(4), iou: SC.iou != null ? +SC.iou.toFixed(3) : null, clip: SC.merge, floor: SC.floor === 0, redo: (SC.redoX || []).map(([p, q]) => [+p.toFixed(1), +q.toFixed(1)]), table: !!SC.tableHit, at: new Date().toISOString().slice(0, 10) };
    MEM.info.delete(t.id); MEM.geo.delete(t.id);
    const mi = modelInfo(t.id);
    if (mi) { editTool(t.id, 'L', +mi.L.toFixed(1)); if (t.kind === 'rod') editTool(t.id, 'D', +Math.max(mi.W, mi.T).toFixed(1)); else { editTool(t.id, 'W', +mi.W.toFixed(1)); editTool(t.id, 'T', +mi.T.toFixed(1)); } }
    if (SC.g) editTool(t.id, 'g', SC.g);
    saveState(); toast(`${shortName(t)} now uses the scan — ${f1(mi ? mi.L : 0)} × ${f1(mi ? mi.W : 0)} × ${f1(mi ? mi.T : 0)} mm`);
    if (S.backTo) return goBackToTools();
    renderScan();
  }
}

// ---------- boot ----------
async function boot() {
  S = loadState();
  try {
    const bin = Uint8Array.from(atob(WASM_B64), (c) => c.charCodeAt(0));
    const wasm = await Module({ wasmBinary: bin });
    wasm.setup(); G.init(wasm);
  } catch (e) {
    $('#panel').innerHTML = `<div class="loading">The geometry engine couldn’t start here (${esc(e.message || e)}). This page needs WebAssembly.</div>`;
    return;
  }
  mats();
  profileText();
  await loadInventory();
  await loadScans();
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { if (b.dataset.tab === 'tools') S.backTo = null; setTab(b.dataset.tab); } });
  $('#panel').addEventListener('click', (e) => { if (e.target.closest('[data-crumb="back"]')) goBackToTools(); });
  $('#panel').addEventListener('change', onPanelChange);
  $('#panel').addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.more) UI.more[d.dataset.more] = d.open; }, true);
  $('#panel').addEventListener('click', onPanelClick);
  $('#panel').addEventListener('click', (e) => { if (S.tab !== 'workspace') return; const it = e.target.closest('.item'); if (it) selectItem(it.dataset.id); });
  $('#panel').addEventListener('dblclick', (e) => { if (S.tab !== 'workspace') return; const it = e.target.closest('.item'); if (it) openItem(it.dataset.id); });
  $('#panel').addEventListener('keydown', (e) => { if (S.tab === 'workspace' && e.key === 'Enter') { const it = e.target.closest('.item'); if (it) openItem(it.dataset.id); } });
  $('#panel').addEventListener('change', (e) => { if (S.tab === 'workspace' && e.target.dataset.act === 'new' && e.target.value) { const m = e.target.value; S.drafts[m] = null; draftFor(m); S.make = m; if (ED) ED.framed = false; setTab('make'); } });
  $('#panel').addEventListener('input', (e) => {
    if (S.tab === 'tools' && e.target.dataset.tf === 'q') { S.tf.q = e.target.value; saveState(); renderToolGrid(); }
    else if (S.tab === 'make' && e.target.id === 'mk_q') renderSugg();
  });
  $('#panel').addEventListener('pointerdown', (e) => { if (e.target.id === 'mk_q') setTimeout(renderSugg, 0); });
  $('#panel').addEventListener('focusout', (e) => { if (e.target.id === 'mk_q') setTimeout(() => { const bx = $('#mk_sugg'); if (bx && document.activeElement !== $('#mk_q')) bx.classList.remove('on'); }, 160); });
  $('#panel').addEventListener('mousedown', (e) => { if (e.target.closest('[data-add]')) e.preventDefault(); });
  $('#panel').addEventListener('click', (e) => { const a = e.target.closest('[data-add]'); if (a) addFor(a.dataset.add); });
  $('#panel').addEventListener('keydown', (e) => {
    if (e.target.id !== 'mk_q') return;
    if (e.key === 'Enter') { e.preventDefault(); const f = $('#mk_sugg [data-add]'); if (f && e.target.value.trim()) addFor(f.dataset.add); }
    else if (e.key === 'Escape') { const bx = $('#mk_sugg'); if (bx) bx.classList.remove('on'); }
  });
  $('#stage').addEventListener('click', onStageClick);
  $('#stage').addEventListener('change', onStageChange);
  $('#stage').addEventListener('keydown', (e) => { if (S.tab === 'tools' && e.key === 'Enter' && e.target.classList && e.target.classList.contains('tcard')) focusTool(e.target.dataset.tool); });
  $('#invFile').addEventListener('change', async (e) => { await onInvFiles([...e.target.files]); e.target.value = ''; });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { const q = $('#tl_q') || $('#mk_q'); if (q) { e.preventDefault(); q.focus(); } } });
  $('#profileChip').addEventListener('click', () => { renderProfile(); $('#profileDlg').showModal(); });
  $('#profileBody').addEventListener('change', onProfileChange);
  for (const d of $$('dialog')) d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  $('#traceFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { traceImg = img; runTrace(); }; img.src = URL.createObjectURL(f); });
  for (const id of ['#tracePaper', '#traceCustom', '#traceThr', '#traceSimp', '#traceInv']) $(id).addEventListener('change', runTrace);
  $('#traceUse').addEventListener('click', () => {
    const draft = D(); const g = draft && draft.p.groups && draft.p.groups[traceGi];
    if (g && tracePts) {
      g.shape = 'outline'; g.pts = traceTurn ? tracePts.map(([x, y]) => [-y, x]) : tracePts; g.scale = 1; g.rot = 0; g.x = 0; g.y = 0; if (g.clear == null) g.clear = 1;
      // grow the holder to fit the tool plus a 6 mm margin
      const xs = g.pts.map((q) => q[0]), ys = g.pts.map((q) => q[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 2 * (g.clear || 1) + 12, d = Math.max(...ys) - Math.min(...ys) + 2 * (g.clear || 1) + 12;
      draft.p.nx = Math.max(draft.p.nx, Math.ceil((w + 0.5) / 42)); draft.p.ny = Math.max(draft.p.ny, Math.ceil((d + 0.5) / 42));
    }
    $('#traceDlg').close(); renderEditor();
  });
  $('#projectFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.items)) throw new Error('no items'); S.items = j.items; if (j.settings) S.settings = { ...clone(DEFAULT_SETTINGS), ...j.settings }; if (j.lib) { S.lib.edits = j.lib.edits || {}; S.lib.custom = j.lib.custom || []; S.lib.outlines = j.lib.outlines || {}; rebuildLib(); } wcache.clear(); dcache.clear(); saveState(); profileText(); setTab('workspace'); toast(`Loaded ${j.items.length} parts`); }
    catch (err) { toast(`That file isn’t a GRIDLAB project (${err.message})`); }
    e.target.value = '';
  });
  renderTabs();
  setTab(S.tab || 'workspace');
}
boot();
