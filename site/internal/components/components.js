/*
 * organisedmess.studio — /internal/components
 * Electronics components and the drawer cabinets they live in.
 *
 *  · Six KTK drawer cabinets (2 × 30D, 2 × 17D, 2 × 9D (L)), drawn in 3D (three.js) and as
 *    front elevations to scale. Drawer address = cabinet letter + drawer number, read left to
 *    right, top to bottom (A07).
 *  · Parts: name, category, value, package, part number, qty, size class, tags, notes, link,
 *    drawer. Search matches values by meaning (10k = 10kΩ, 0.1uF = 100nF).
 *  · Planning: a drawer can carry a planned category + label before anything is in it;
 *    "Suggest places" fills unplaced parts into planned or empty drawers of the right size.
 *  · The whole list is one document, saved through the Worker at /internal/components/api/state
 *    (Cloudflare KV, TOOLS_KV). Without it (or in a preview) it is kept in this browser only.
 */

/* ---- cabinets ---------------------------------------------------------------
   Outside sizes from KTK's listing (W × D × H mm). Drawer sizes are derived from them
   with a 6 mm frame and 2 mm between drawers — estimates until measured. */
var WALL = 6, GAP = 2, DEPTH_IN = 138;
var MODELS = {
	'30D': { title: '30-drawer', w: 364, d: 152, h: 222, rows: [[6, 1], [6, 1], [6, 1], [6, 1], [6, 1]] },
	'17D': { title: '17-drawer', w: 364, d: 152, h: 270, rows: [[6, 40.4], [6, 40.4], [3, 56.4], [1, 56.4], [1, 56.4]] },
	'9D':  { title: '9-drawer (L)', w: 364, d: 152, h: 206, rows: [[3, 1], [3, 1], [3, 1]] }
};
var CAB_DEFAULT = [
	{ id: 'A', model: '30D', name: '30-drawer', col: 0, level: 1 },
	{ id: 'B', model: '30D', name: '30-drawer', col: 1, level: 1 },
	{ id: 'C', model: '17D', name: '17-drawer', col: 0, level: 0 },
	{ id: 'D', model: '17D', name: '17-drawer', col: 1, level: 0 },
	{ id: 'E', model: '9D', name: '9-drawer', col: 2, level: 0 },
	{ id: 'F', model: '9D', name: '9-drawer', col: 2, level: 1 }
];
var PRESETS = {
	'Three stacks': { A: [0, 1], C: [0, 0], B: [1, 1], D: [1, 0], E: [2, 0], F: [2, 1] },
	'Two towers': { E: [0, 0], C: [0, 1], A: [0, 2], F: [1, 0], D: [1, 1], B: [1, 2] },
	'Row of six': { A: [0, 0], B: [1, 0], C: [2, 0], D: [3, 0], E: [4, 0], F: [5, 0] },
	'Two rows of three': { C: [0, 0], D: [1, 0], E: [2, 0], A: [0, 1], B: [1, 1], F: [2, 1] }
};

var CATS = [
	'Resistors', 'Capacitors', 'Inductors & ferrites', 'Diodes', 'LEDs', 'Transistors & MOSFETs',
	'Voltage regulators', 'ICs', 'Microcontrollers & boards', 'Sensors & modules', 'Displays',
	'Connectors', 'Headers & sockets', 'Switches & buttons', 'Crystals & oscillators',
	'Fuses & protection', 'Wire & heatshrink', 'Hardware', 'Misc'
];
var PALETTE = ['#b5523d', '#c98a3b', '#b9a03a', '#86a04a', '#4f9a6b', '#3f8f8f', '#4a7fb0', '#6a6bb8', '#8c5fae',
	'#b05f8f', '#9b7b5c', '#7d8c3e', '#5e7486', '#a06a52', '#3d6f99', '#a8833f', '#6f6f6f', '#8a6a8a', '#5a5a52'];
var UNITS = ['pcs', 'reel', 'strip', 'bag', 'm', 'kit', 'board'];
var SIZES = { S: 'Small drawer', M: 'Medium drawer', L: 'Large drawer' };

var API = '/internal/components/api/state';
var LOCAL_KEY = 'om-components-doc';
var PREVIEW = !!window.OM_PREVIEW;

/* ---- elements ---------------------------------------------------------------- */
var $ = function (id) { return document.getElementById(id); };
var $stats = $('comp-stats'), $q = $('comp-q'), $clear = $('comp-clear'), $chips = $('comp-chips'),
	$result = $('comp-result'), $note = $('comp-note'), $list = $('comp-list'), $maps = $('comp-maps'),
	$mapsCount = $('maps-count'), $legend = $('comp-legend'), $stage = $('comp-stage'), $stageMsg = $('comp-stage-msg'),
	$modal = $('comp-modal'), $mTitle = $('comp-modal-title'), $mMeta = $('comp-modal-meta'), $mBody = $('comp-modal-body'),
	$undo = $('comp-undo'), $selbar = $('comp-selbar'), $selcount = $('comp-selcount');

/* ---- state ------------------------------------------------------------------- */
var doc = null;                 // { v, cabinets, drawers: {addr: {cat, label, note}}, parts: [...] }
var store = { mode: 'loading', rev: 0, saving: false, dirty: false, timer: 0, error: '' };
var ui = { q: '', cat: null, unplaced: false, drawer: null, sel: null, selecting: false, picked: {} };
var undoStack = [];
var geo = { cabs: {}, drawers: {}, order: [] }; // derived layout
var three = null;               // the 3D view once loaded

boot();

function boot() {
	load().then(function () {
		readUrl();
		buildGeometry();
		renderAll();
		bind();
		init3D();
	});
}

/* ---- load / save ------------------------------------------------------------- */
function emptyDoc() {
	return { v: 1, created: new Date().toISOString(), cabinets: CAB_DEFAULT.map(clone), drawers: {}, parts: [] };
}
function normalise(d) {
	if (!d || typeof d !== 'object') d = emptyDoc();
	if (!Array.isArray(d.cabinets) || !d.cabinets.length) d.cabinets = CAB_DEFAULT.map(clone);
	if (!d.drawers || typeof d.drawers !== 'object') d.drawers = {};
	if (!Array.isArray(d.parts)) d.parts = [];
	d.parts.forEach(function (p) { if (!p.id) p.id = uid(); if (!Array.isArray(p.tags)) p.tags = splitTags(p.tags); });
	d.v = 1;
	return d;
}
function load() {
	if (PREVIEW) return Promise.resolve(loadLocal('preview'));
	return fetch(API, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
		if (!r.ok) throw new Error('no api');
		return r.json();
	}).then(function (j) {
		doc = normalise(j.doc);
		store.rev = j.rev || 0;
		store.mode = 'kv';
	}).catch(function () { loadLocal('local'); });
}
function loadLocal(mode) {
	store.mode = mode;
	var d = null;
	try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) {}
	doc = normalise(d);
	$note.hidden = false;
	$note.textContent = mode === 'preview'
		? 'Preview: changes are kept in this browser only. On the internal site the list is saved for every device.'
		: 'Saved in this browser only — the shared store isn’t connected (see README: components).';
}
function scheduleSave() {
	store.dirty = true;
	clearTimeout(store.timer);
	store.timer = setTimeout(save, 500);
	status();
}
function save() {
	if (!store.dirty) return;
	if (store.mode !== 'kv') {
		try { localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); } catch (e) {}
		store.dirty = false; status(); return;
	}
	if (store.saving) { store.timer = setTimeout(save, 400); return; }
	store.saving = true; store.dirty = false; status();
	var body = JSON.stringify({ rev: store.rev, doc: doc });
	fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body })
		.then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
		.then(function (x) {
			store.saving = false;
			if (x.r.status === 409) {
				// changed on another device: take theirs, say so
				doc = normalise(x.j.doc); store.rev = x.j.rev || 0; undoStack = [];
				store.error = 'This list was changed on another device. The latest version is loaded; redo your last change.';
				buildGeometry(); renderAll(); if (three) three.rebuild();
				return;
			}
			if (!x.r.ok) throw new Error(x.j && x.j.error || ('save failed ' + x.r.status));
			store.rev = x.j.rev; store.error = ''; status();
		})
		.catch(function (e) { store.saving = false; store.dirty = true; store.error = 'Not saved: ' + e.message + '. Retrying…'; status(); store.timer = setTimeout(save, 4000); });
}
window.addEventListener('beforeunload', function (e) { if (store.dirty || store.saving) { save(); e.preventDefault(); e.returnValue = ''; } });

// every change goes through here: snapshot for undo, apply, re-render, save
function change(fn, keepView) {
	undoStack.push(JSON.stringify(doc));
	if (undoStack.length > 60) undoStack.shift();
	fn();
	buildGeometry();
	renderAll();
	if (three) three.rebuild(keepView !== false);
	scheduleSave();
}
function undo() {
	if (!undoStack.length) return;
	doc = normalise(JSON.parse(undoStack.pop()));
	buildGeometry(); renderAll(); if (three) three.rebuild(true);
	scheduleSave();
}

/* ---- geometry ------------------------------------------------------------------ */
function buildGeometry() {
	geo = { cabs: {}, drawers: {}, order: [] };
	doc.cabinets.forEach(function (c) {
		var m = MODELS[c.model];
		var usable = m.h - 2 * WALL - (m.rows.length - 1) * GAP;
		var wsum = m.rows.reduce(function (s, r) { return s + r[1]; }, 0);
		var y = WALL, n = 0, list = [];
		m.rows.forEach(function (r, ri) {
			var h = usable * r[1] / wsum;
			var w = (m.w - 2 * WALL - (r[0] - 1) * GAP) / r[0];
			for (var ci = 0; ci < r[0]; ci++) {
				n++;
				var addr = c.id + (n < 10 ? '0' : '') + n;
				var d = { addr: addr, cab: c.id, n: n, row: ri + 1, col: ci + 1, x: WALL + ci * (w + GAP), y: y, w: w, h: h,
					size: w < 70 ? 'S' : (w < 200 ? 'M' : 'L') };
				d.inner = [Math.round(w - 5), Math.round(h - 5), DEPTH_IN - 6];
				geo.drawers[addr] = d; list.push(d); geo.order.push(addr);
			}
			y += h + GAP;
		});
		geo.cabs[c.id] = { cab: c, model: m, drawers: list };
	});
}
function drawerParts(addr) { return doc.parts.filter(function (p) { return p.loc === addr; }); }
function drawerCat(addr) {
	var plan = doc.drawers[addr] || {};
	if (plan.cat) return plan.cat;
	var ps = drawerParts(addr); if (!ps.length) return '';
	var tally = {}; ps.forEach(function (p) { tally[p.cat] = (tally[p.cat] || 0) + 1; });
	return Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
}
function catColor(cat) {
	if (!cat) return '';
	var i = CATS.indexOf(cat);
	if (i < 0) { i = 0; for (var k = 0; k < cat.length; k++) i = (i * 31 + cat.charCodeAt(k)) >>> 0; }
	return PALETTE[i % PALETTE.length];
}
function allCats() {
	var set = {}; CATS.forEach(function (c) { set[c] = 1; });
	doc.parts.forEach(function (p) { if (p.cat) set[p.cat] = 1; });
	for (var a in doc.drawers) if (doc.drawers[a].cat) set[doc.drawers[a].cat] = 1;
	return Object.keys(set).sort(function (a, b) {
		var ia = CATS.indexOf(a), ib = CATS.indexOf(b);
		return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
	});
}

/* ---- search -------------------------------------------------------------------- */
var PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
// "10k", "10kΩ", "4k7", "4R7", "0.1uF", "100 nF", "25V" → { v, u }
function parseVal(s) {
	s = String(s).replace(/\s+/g, '').replace(/ohms?$/i, 'Ω');
	var m = /^(\d+)([pnuµμmkKMGR])(\d+)([ΩFH])?$/.exec(s);
	if (m) return { v: parseFloat(m[1] + '.' + m[3]) * (m[2] === 'R' ? 1 : PREFIX[m[2]]), u: m[4] || (m[2] === 'R' ? 'Ω' : '') };
	m = /^(\d+(?:\.\d+)?|\.\d+)([pnuµμmkKMG]?)(Ω|R|F|H|V|A|W|Hz)?$/.exec(s);
	if (!m) return null;
	if (!m[2] && !m[3]) return null; // bare numbers are matched as text
	return { v: parseFloat(m[1]) * (m[2] ? PREFIX[m[2]] : 1), u: m[3] === 'R' ? 'Ω' : (m[3] || '') };
}
function sameVal(a, b) { return a && b && Math.abs(a.v - b.v) <= Math.abs(a.v) * 1e-9 && (!a.u || !b.u || a.u === b.u); }
function norm(s) { return String(s || '').toLowerCase().replace(/µ|μ/g, 'u').replace(/ω/g, 'ω'); }
function partText(p) {
	var plan = doc.drawers[p.loc] || {};
	return [p.name, p.value, p.pkg, p.mpn, p.cat, (p.tags || []).join(' '), p.notes, p.loc, p.slot, plan.label].join(' · ');
}
function tokensOf(s) { return String(s || '').split(/[\s,·/()\[\]]+/).filter(Boolean); }
function matcher(q) {
	var terms = tokensOf(q).map(function (t) { return { raw: t, n: norm(t), val: parseVal(t) }; });
	if (!terms.length) return null;
	return function (text) {
		var hay = norm(text), toks = tokensOf(text), vals = null;
		return terms.every(function (t) {
			if (t.val) {
				vals = vals || toks.map(parseVal);
				if (vals.some(function (v) { return sameVal(v, t.val); })) return true;
			}
			if (t.val || /^\d+(\.\d+)?$/.test(t.n) || t.n.length <= 2) {
				// short or numeric: whole token, or a number followed by its unit (2.54 → 2.54mm)
				var re = new RegExp('(^|[^a-z0-9.])' + escRe(t.n) + '($|[^0-9.])');
				return re.test(hay);
			}
			return hay.indexOf(t.n) >= 0;
		});
	};
}
function filtered() {
	var m = matcher(ui.q);
	return doc.parts.filter(function (p) {
		if (ui.cat && p.cat !== ui.cat) return false;
		if (ui.unplaced && p.loc) return false;
		if (ui.drawer && p.loc !== ui.drawer) return false;
		return !m || m(partText(p));
	});
}
// drawers to highlight: those holding a matching part, or whose own address/label/plan matches
function hitDrawers() {
	var active = ui.q || ui.cat || ui.unplaced;
	if (!active) return null;
	var hits = {}, m = matcher(ui.q);
	filtered().forEach(function (p) { if (p.loc) hits[p.loc] = 1; });
	if (m && !ui.unplaced) geo.order.forEach(function (a) {
		var plan = doc.drawers[a] || {};
		if ((!ui.cat || plan.cat === ui.cat) && m([a, plan.label, plan.cat, plan.note].join(' · '))) hits[a] = 1;
	});
	if (!m && ui.cat) geo.order.forEach(function (a) { if ((doc.drawers[a] || {}).cat === ui.cat) hits[a] = 1; });
	// "Unplaced" on its own: light up the drawers that are still free
	if (!m && ui.unplaced && !ui.cat) geo.order.forEach(function (a) { if (!drawerParts(a).length && !(doc.drawers[a] || {}).cat && !(doc.drawers[a] || {}).label) hits[a] = 1; });
	return hits;
}

/* ---- render -------------------------------------------------------------------- */
function renderAll() {
	renderStats(); renderChips(); renderMaps(); renderList(); renderLegend(); status();
	if (three) three.paint();
	writeUrl();
}
function renderStats() {
	var nd = geo.order.length, used = {}, planned = 0, pieces = 0;
	doc.parts.forEach(function (p) { if (p.loc) used[p.loc] = 1; pieces += +p.qty || 0; });
	geo.order.forEach(function (a) { if ((doc.drawers[a] || {}).cat || (doc.drawers[a] || {}).label) planned++; });
	var placed = doc.parts.filter(function (p) { return p.loc; }).length;
	$stats.dataset.base = doc.cabinets.length + ' cabinets · ' + nd + ' drawers (' + Object.keys(used).length + ' in use, ' + planned + ' planned) · ' +
		doc.parts.length + ' parts, ' + placed + ' placed';
	$mapsCount.textContent = nd + ' drawers · tap one to plan it or see what’s in it';
}
function status() {
	var s = $stats.dataset.base || '';
	var tail = store.error ? store.error
		: store.mode === 'kv' ? (store.saving || store.dirty ? 'Saving…' : 'Saved')
		: store.mode === 'preview' ? 'Preview' : 'This browser only';
	$stats.textContent = s + (s ? ' · ' : '') + tail;
	$undo.hidden = !undoStack.length;
}
function renderChips() {
	var counts = {}, unplaced = 0;
	doc.parts.forEach(function (p) { counts[p.cat] = (counts[p.cat] || 0) + 1; if (!p.loc) unplaced++; });
	var html = chip('All', doc.parts.length, !ui.cat && !ui.unplaced && !ui.drawer, 'data-all');
	html += chip('Unplaced', unplaced, ui.unplaced, 'data-unplaced');
	if (ui.drawer) html += chip('In ' + ui.drawer + ' ×', drawerParts(ui.drawer).length, true, 'data-undrawer');
	allCats().forEach(function (c) {
		if (!counts[c]) return;
		html += chip('<span class="sw" style="--c:' + catColor(c) + '"></span>' + esc(c), counts[c], ui.cat === c, 'data-cat="' + esc(c) + '"', true);
	});
	$chips.innerHTML = html;
}
function chip(label, n, on, attr, raw) {
	return '<button type="button" class="tools-chip' + (n ? '' : ' is-empty') + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attr + '>' +
		(raw ? label : esc(label)) + ' <span class="n">' + n + '</span></button>';
}
function renderLegend() {
	var used = {};
	geo.order.forEach(function (a) { var c = drawerCat(a); if (c) used[c] = 1; });
	var cats = allCats().filter(function (c) { return used[c]; });
	$legend.innerHTML = cats.length
		? cats.map(function (c) { return '<span><span class="sw" style="--c:' + catColor(c) + '"></span>' + esc(c) + '</span>'; }).join('')
		: '<span>Nothing placed or planned yet — drawer colours follow their category once you do.</span>';
}

function mapHTML(cabId, opts) {
	opts = opts || {};
	var g = geo.cabs[cabId], m = g.model, hits = opts.hits;
	var html = '<div class="cab-front' + (opts.mini ? ' is-mini' : '') + '" style="aspect-ratio:' + m.w + '/' + m.h + '">';
	g.drawers.forEach(function (d) {
		var plan = doc.drawers[d.addr] || {}, n = drawerParts(d.addr).length, cat = drawerCat(d.addr);
		var cls = 'drw sz-' + d.size + (cat ? (n ? '' : ' is-plan') : '') + (ui.sel === d.addr && !opts.mini ? ' is-sel' : '') +
			(hits ? (hits[d.addr] ? ' is-hit' : ' is-dim') : '') + (opts.target ? ' is-target' : '') + (opts.current === d.addr ? ' is-sel' : '');
		html += '<button type="button" class="' + cls + '" data-drw="' + d.addr + '" title="' + esc(d.addr + (plan.label ? ' · ' + plan.label : '') + (cat ? ' · ' + cat : '') + ' · ' + n + ' part' + (n === 1 ? '' : 's')) + '"' +
			' style="left:' + pct(d.x, m.w) + ';top:' + pct(d.y, m.h) + ';width:' + pct(d.w, m.w) + ';height:' + pct(d.h, m.h) + (cat ? ';--c:' + catColor(cat) : '') + '">' +
			'<span class="a">' + (opts.mini ? d.n : d.addr) + '</span>' +
			(n && !opts.mini ? '<span class="n">' + n + '</span>' : '') +
			(d.size !== 'S' && (plan.label || cat) ? '<span class="l">' + esc(plan.label || cat) + '</span>' : '') +
			'</button>';
	});
	return html + '</div>';
}
function renderMaps() {
	var hits = hitDrawers();
	$maps.innerHTML = sortedCabs().map(function (c) {
		var g = geo.cabs[c.id], used = g.drawers.filter(function (d) { return drawerParts(d.addr).length; }).length;
		return '<div class="cab-card"><div class="cab-head"><span class="cab-letter">' + c.id + '</span><span class="cab-name">' + esc(cabTitle(c)) + '</span></div>' +
			mapHTML(c.id, { hits: hits }) +
			'<p class="cab-meta">' + g.drawers.length + ' drawers · ' + used + ' in use · ' + g.model.w + ' × ' + g.model.d + ' × ' + g.model.h + ' mm</p></div>';
	}).join('');
}
function sortedCabs() { return doc.cabinets.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }); }

function renderList() {
	var parts = filtered();
	var hasFilter = ui.q || ui.cat || ui.unplaced || ui.drawer;
	$result.textContent = hasFilter ? parts.length + ' of ' + doc.parts.length + ' parts' + (ui.drawer ? ' in ' + ui.drawer : '') : '';
	if (!doc.parts.length) {
		$list.innerHTML = '<div class="comp-empty"><p>No components yet. Add them one by one, import a list, or try the page with sample parts.</p>' +
			'<div class="tools-chips"><button type="button" class="tools-chip" data-act="add">+ Add a part</button>' +
			'<button type="button" class="tools-chip" data-act="import">Import a list</button>' +
			'<button type="button" class="tools-chip" data-act="sample">Load sample parts</button></div></div>';
		return;
	}
	if (!parts.length) { $list.innerHTML = '<p class="tools-empty">Nothing matches.</p>'; return; }
	var by = {};
	parts.forEach(function (p) { (by[p.cat || 'Misc'] = by[p.cat || 'Misc'] || []).push(p); });
	var num = 2, m = matcher(ui.q), html = '';
	allCats().forEach(function (cat) {
		if (!by[cat]) return;
		num++;
		var list = by[cat].sort(function (a, b) {
			var va = parseVal(a.value), vb = parseVal(b.value);
			if (va && vb && va.u === vb.u && va.v !== vb.v) return va.v - vb.v;
			return String(a.value || a.name).localeCompare(String(b.value || b.name), undefined, { numeric: true });
		});
		html += '<section class="row"><div class="row-head"><span class="num">' + (num < 10 ? '0' : '') + num + '</span>' +
			'<h2 class="row-label"><span class="sw" style="--c:' + catColor(cat) + '"></span>' + esc(cat) + '</h2>' +
			'<span class="cat-count">' + list.length + ' part' + (list.length === 1 ? '' : 's') + '</span></div>' +
			'<div class="row-body"><div class="part-rows">' + list.map(function (p) { return partRow(p, m); }).join('') + '</div></div></section>';
	});
	$list.innerHTML = html;
	$list.classList.toggle('is-selecting', ui.selecting);
}
function partRow(p, m) {
	var hl = function (s) { return highlight(s, ui.q); };
	var meta = [p.pkg, p.mpn, SIZES[p.size] ? p.size + ' drawer' : ''].filter(Boolean).map(hl).join(' · ');
	var plan = p.loc ? (doc.drawers[p.loc] || {}) : null;
	return '<div class="part-row" data-id="' + p.id + '">' +
		'<input type="checkbox" class="part-check" data-pick="' + p.id + '"' + (ui.picked[p.id] ? ' checked' : '') + ' aria-label="Select ' + esc(p.name) + '">' +
		'<div class="part-body">' +
		'<h3 class="part-name"><button type="button" class="part-open" data-open="' + p.id + '">' +
		(p.value ? '<span class="v">' + hl(p.value) + '</span><span class="tool-sep" aria-hidden="true"></span>' : '') +
		'<span class="pn">' + hl(p.name || '(unnamed)') + '</span></button></h3>' +
		(meta ? '<p class="part-meta">' + meta + '</p>' : '') +
		(p.tags && p.tags.length ? '<p class="tool-tags">' + p.tags.map(function (t) { return '<span>' + hl(t) + '</span>'; }).join('') + '</p>' : '') +
		'<div class="tool-tagline">' +
		'<button type="button" class="tag tag-edit tag-loc' + (p.loc ? '' : ' is-default') + '" data-move="' + p.id + '"><span class="tag-k">Drawer</span> ' +
		(p.loc ? esc(p.loc) + (plan && plan.label ? ' · ' + esc(plan.label) : '') + (p.slot ? ' · ' + esc(p.slot) : '') : 'Unplaced') + '</button>' +
		(p.qty !== '' && p.qty != null ? '<span class="tag tag-qty">' + esc(p.qty) + ' ' + esc(p.unit || 'pcs') + '</span>' : '') +
		(p.url ? '<a class="tag tag-link" href="' + esc(safeUrl(p.url)) + '" target="_blank" rel="noopener">Datasheet <span class="arr arr-ext">↗</span></a>' : '') +
		(p.sample ? '<span class="tag tag-sample">Sample</span>' : '') +
		'</div></div></div>';
}

/* ---- events ------------------------------------------------------------------ */
function bind() {
	var qt;
	$q.value = ui.q; $clear.hidden = !ui.q;
	$q.addEventListener('input', function () {
		clearTimeout(qt);
		qt = setTimeout(function () { ui.q = $q.value.trim(); $clear.hidden = !ui.q; renderAll(); }, 90);
	});
	$q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $q.value = ''; ui.q = ''; $clear.hidden = true; renderAll(); } });
	$clear.addEventListener('click', function () { $q.value = ''; ui.q = ''; $clear.hidden = true; renderAll(); $q.focus(); });
	$undo.addEventListener('click', undo);

	document.addEventListener('keydown', function (e) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isField(e.target) && $modal.hidden) { e.preventDefault(); undo(); }
		if (e.key === '/' && !isField(e.target) && $modal.hidden) { e.preventDefault(); $q.focus(); }
		if (e.key === 'Escape' && !$modal.hidden) closeModal();
	});

	$chips.addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		if (b.hasAttribute('data-all')) { ui.cat = null; ui.unplaced = false; ui.drawer = null; }
		else if (b.hasAttribute('data-unplaced')) { ui.unplaced = !ui.unplaced; ui.drawer = null; }
		else if (b.hasAttribute('data-undrawer')) ui.drawer = null;
		else { var c = b.getAttribute('data-cat'); ui.cat = ui.cat === c ? null : c; }
		renderAll();
	});

	document.addEventListener('click', function (e) {
		var t = e.target.closest('[data-act],[data-drw],[data-open],[data-move],[data-sel],[data-view]');
		if (!t || $modal.contains(t)) return;
		if (t.hasAttribute('data-drw') && t.closest('#comp-maps')) return openDrawer(t.getAttribute('data-drw'));
		if (t.hasAttribute('data-open')) return openPart(t.getAttribute('data-open'));
		if (t.hasAttribute('data-move')) return openMove([t.getAttribute('data-move')]);
		if (t.hasAttribute('data-view')) { if (three) three.view(t.getAttribute('data-view')); return; }
		if (t.hasAttribute('data-sel')) return selAction(t.getAttribute('data-sel'));
		var a = t.getAttribute('data-act');
		if (a === 'add') openPart(null);
		else if (a === 'import') openImport();
		else if (a === 'export') openExport();
		else if (a === 'suggest') openSuggest();
		else if (a === 'arrange') openArrange();
		else if (a === 'sample') loadSample();
		else if (a === 'select') setSelecting(!ui.selecting);
	});
	$list.addEventListener('change', function (e) {
		var id = e.target.getAttribute && e.target.getAttribute('data-pick'); if (!id) return;
		if (e.target.checked) ui.picked[id] = 1; else delete ui.picked[id];
		selCount();
	});
	$modal.addEventListener('click', function (e) { if (e.target === $modal || e.target.closest('[data-close]')) closeModal(); });
	window.addEventListener('popstate', function () { readUrl(); $q.value = ui.q; renderAll(); });
}
function isField(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); }

function setSelecting(on) {
	ui.selecting = on; if (!on) ui.picked = {};
	document.querySelector('[data-act="select"]').setAttribute('aria-pressed', on ? 'true' : 'false');
	$selbar.hidden = !on; document.body.classList.toggle('is-selecting', on);
	renderList(); selCount();
}
function selCount() { var n = Object.keys(ui.picked).length; $selcount.textContent = n + ' selected'; }
function selAction(a) {
	var ids = Object.keys(ui.picked);
	if (a === 'done') return setSelecting(false);
	if (!ids.length) { $selcount.textContent = 'Tick some parts first'; return; }
	if (a === 'move') openMove(ids);
	else if (a === 'unplace') change(function () { doc.parts.forEach(function (p) { if (ui.picked[p.id]) { p.loc = ''; p.slot = ''; } }); });
	else if (a === 'cat') openCatPick(ids);
}

/* ---- URL ------------------------------------------------------------------- */
function readUrl() {
	try {
		var sp = new URLSearchParams(location.search);
		ui.q = sp.get('q') || ''; ui.cat = sp.get('cat') || null; ui.drawer = sp.get('d') || null;
	} catch (e) {}
}
function writeUrl() {
	if (PREVIEW) return;
	try {
		var sp = new URLSearchParams();
		if (ui.q) sp.set('q', ui.q); if (ui.cat) sp.set('cat', ui.cat); if (ui.drawer) sp.set('d', ui.drawer);
		var s = sp.toString(), url = location.pathname + (s ? '?' + s : '');
		if (url !== location.pathname + location.search) history.replaceState(null, '', url);
	} catch (e) {}
}

/* ---- modal ------------------------------------------------------------------ */
function openModal(title, meta, html, onBind) {
	$mTitle.innerHTML = title; $mMeta.textContent = meta || ''; $mBody.innerHTML = html;
	$modal.hidden = false; document.documentElement.style.overflow = 'hidden';
	if (onBind) onBind($mBody);
	var f = $mBody.querySelector('[autofocus]'); if (f && !document.documentElement.classList.contains('mobile')) f.focus();
}
function closeModal() {
	$modal.hidden = true; $mBody.innerHTML = ''; document.documentElement.style.overflow = '';
	if (ui.sel) { ui.sel = null; renderMaps(); if (three) three.paint(); }
}

/* drawer: what's in it, its plan, add parts to it */
function openDrawer(addr) {
	var d = geo.drawers[addr]; if (!d) return;
	ui.sel = addr; renderMaps(); if (three) { three.paint(); three.focus(addr); }
	var g = geo.cabs[d.cab], plan = doc.drawers[addr] || {}, parts = drawerParts(addr);
	var unplaced = doc.parts.filter(function (p) { return !p.loc; });
	var html = '<div class="comp-two"><div>' +
		'<h4>Drawer</h4><dl class="comp-facts">' +
		'<dt>Cabinet</dt><dd>' + d.cab + ' · ' + esc(cabTitle(g.cab)) + '</dd>' +
		'<dt>Position</dt><dd>row ' + d.row + ', column ' + d.col + '</dd>' +
		'<dt>Size</dt><dd>' + SIZES[d.size] + ' · inside ≈ ' + d.inner.join(' × ') + ' mm <em>(est.)</em></dd></dl>' +
		'<h4>Plan</h4><div class="comp-form">' +
		'<div class="field f-6"><label for="dp-cat">Category</label><select id="dp-cat"><option value="">—</option>' + catOptions(plan.cat) + '</select></div>' +
		'<div class="field f-6"><label for="dp-label">Label <span class="opt">what the drawer front says</span></label><input id="dp-label" class="comp-in" value="' + esc(plan.label || '') + '" placeholder="0805 resistors 1k–9k1"></div>' +
		'<div class="field f-6"><label for="dp-note">Note</label><input id="dp-note" class="comp-in" value="' + esc(plan.note || '') + '" placeholder="dividers, bags, overflow in…"></div>' +
		'</div><div class="comp-btns"><button type="button" class="tools-send" id="dp-save">Save plan</button>' +
		'<button type="button" class="comp-link" id="dp-show">Show these parts in the list</button></div>' +
		'</div><div>' +
		'<h4>In this drawer <span class="count">' + parts.length + '</span></h4>' +
		(parts.length ? '<ul class="comp-plist">' + parts.map(function (p) {
			return '<li><span class="grow">' + esc((p.value ? p.value + ' · ' : '') + p.name) + (p.slot ? ' <span class="q">' + esc(p.slot) + '</span>' : '') + '</span>' +
				'<span class="q">' + esc(p.qty != null && p.qty !== '' ? p.qty + ' ' + (p.unit || 'pcs') : '') + '</span>' +
				'<button type="button" class="comp-link" data-edit="' + p.id + '">Edit</button>' +
				'<button type="button" class="comp-link" data-out="' + p.id + '">Take out</button></li>';
		}).join('') + '</ul>' : '<p class="hint">Empty.</p>') +
		'<h4>Put parts here</h4>' +
		(unplaced.length ? '<input class="comp-in" id="dp-find" placeholder="Filter unplaced parts…">' +
			'<div class="comp-scroll"><ul class="comp-plist" id="dp-un">' + unplaced.map(function (p) {
				return '<li data-t="' + esc(norm(partText(p))) + '"><label><input type="checkbox" value="' + p.id + '"><span class="grow">' + esc((p.value ? p.value + ' · ' : '') + p.name) + '</span><span class="q">' + esc(p.cat || '') + '</span></label></li>';
			}).join('') + '</ul></div><div class="comp-btns"><button type="button" class="tools-send" id="dp-put">Put ticked parts in ' + addr + '</button></div>'
			: '<p class="hint">Every part already has a drawer. Move one here from its row in the list.</p>') +
		'<div class="comp-btns"><button type="button" class="comp-link" data-new>+ New part in this drawer</button></div>' +
		'</div></div>';
	openModal(esc(addr), g.model.title + ' · ' + d.cab, html, function (b) {
		var applyPlan = function () {
			var cat = b.querySelector('#dp-cat').value, label = b.querySelector('#dp-label').value.trim(), note = b.querySelector('#dp-note').value.trim();
			if (cat || label || note) doc.drawers[addr] = { cat: cat, label: label, note: note }; else delete doc.drawers[addr];
		};
		b.querySelector('#dp-save').onclick = function () { change(applyPlan); closeModal(); };
		b.querySelector('#dp-show').onclick = function () { ui.drawer = addr; ui.cat = null; ui.unplaced = false; closeModal(); renderAll(); $list.scrollIntoView({ behavior: 'smooth' }); };
		var find = b.querySelector('#dp-find');
		if (find) find.oninput = function () {
			var m = matcher(find.value);
			b.querySelectorAll('#dp-un li').forEach(function (li) { li.hidden = m ? !m(li.getAttribute('data-t')) : false; });
		};
		var put = b.querySelector('#dp-put');
		if (put) put.onclick = function () {
			var ids = Array.prototype.map.call(b.querySelectorAll('#dp-un input:checked'), function (i) { return i.value; });
			if (!ids.length) return;
			change(function () { applyPlan(); doc.parts.forEach(function (p) { if (ids.indexOf(p.id) >= 0) p.loc = addr; }); });
			openDrawer(addr);
		};
		b.querySelectorAll('[data-out]').forEach(function (x) { x.onclick = function () { var id = x.getAttribute('data-out'); change(function () { var p = byId(id); p.loc = ''; p.slot = ''; }); openDrawer(addr); }; });
		b.querySelectorAll('[data-edit]').forEach(function (x) { x.onclick = function () { openPart(x.getAttribute('data-edit')); }; });
		b.querySelector('[data-new]').onclick = function () { openPart(null, { loc: addr, cat: plan.cat || '' }); };
	});
}

/* part: add or edit */
function openPart(id, preset) {
	var p = id ? byId(id) : Object.assign({ name: '', cat: (ui.cat || ''), value: '', pkg: '', mpn: '', qty: '', unit: 'pcs', size: '', tags: [], notes: '', url: '', loc: ui.drawer || '', slot: '' }, preset || {});
	if (!p) return;
	var f = function (k, label, attrs, cls) { return '<div class="field ' + (cls || '') + '"><label for="pf-' + k + '">' + label + '</label><input id="pf-' + k + '" class="comp-in" value="' + esc(p[k] == null ? '' : p[k]) + '" ' + (attrs || '') + '></div>'; };
	var html = '<div class="comp-form">' +
		f('name', 'Name', 'autofocus placeholder="Thick-film resistor"', 'f-6') +
		'<div class="field"><label for="pf-cat">Category</label><select id="pf-cat">' + catOptions(p.cat || 'Misc') + '<option value="__new">New category…</option></select><input id="pf-newcat" class="comp-in" placeholder="New category name" hidden style="margin-top:.4rem"></div>' +
		f('value', 'Value <span class="opt">10kΩ, 100nF, 3.3V</span>', '') +
		f('pkg', 'Package / footprint', 'placeholder="0805, SOT-23, TO-92, 2.54 mm"') +
		f('mpn', 'Part number', 'placeholder="RC0805FR-0710KL"') +
		f('qty', 'Quantity', 'inputmode="decimal"', 'f-2') +
		'<div class="field f-2"><label for="pf-unit">Unit</label><select id="pf-unit">' + UNITS.map(function (u) { return '<option' + (u === (p.unit || 'pcs') ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div>' +
		'<div class="field f-2"><label for="pf-size">Needs</label><select id="pf-size"><option value="">Any drawer</option>' + Object.keys(SIZES).map(function (s) { return '<option value="' + s + '"' + (p.size === s ? ' selected' : '') + '>' + SIZES[s] + '</option>'; }).join('') + '</select></div>' +
		f('tags', 'Tags <span class="opt">comma-separated</span>', 'placeholder="smd, e24, 1%"', 'f-6') +
		f('url', 'Datasheet or shop link', 'type="url" placeholder="https://…"', 'f-6') +
		'<div class="field f-6"><label for="pf-notes">Notes</label><textarea id="pf-notes" rows="3">' + esc(p.notes || '') + '</textarea></div>' +
		'<div class="field"><label>Drawer</label><div><button type="button" class="tag tag-edit tag-loc' + (p.loc ? '' : ' is-default') + '" id="pf-loc">' + (p.loc ? esc(p.loc) : 'Unplaced') + '</button></div></div>' +
		f('slot', 'Where in the drawer <span class="opt">optional</span>', 'placeholder="front left, bag 3"') +
		'</div><div class="comp-btns"><button type="button" class="tools-send" id="pf-save">' + (id ? 'Save' : 'Add part') + '</button>' +
		(id ? '' : '<button type="button" class="comp-link" id="pf-again">Add and start another</button>') +
		'<span class="grow"></span>' + (id ? '<button type="button" class="comp-link" id="pf-dup">Duplicate</button><button type="button" class="comp-link danger" id="pf-del">Delete</button>' : '') + '</div>';
	var loc = p.loc || '';
	openModal(id ? esc(p.name || 'Part') : 'New part', id ? (p.cat || '') : '', html, function (b) {
		// the tags field was rendered from an array: fix its value
		b.querySelector('#pf-tags').value = (p.tags || []).join(', ');
		var catSel = b.querySelector('#pf-cat');
		var newCat = b.querySelector('#pf-newcat');
		catSel.onchange = function () { newCat.hidden = catSel.value !== '__new'; if (!newCat.hidden) newCat.focus(); };
		b.querySelector('#pf-loc').onclick = function () {
			pickDrawer(loc, function (a) { loc = a; var t = b.querySelector('#pf-loc'); t.textContent = a || 'Unplaced'; t.classList.toggle('is-default', !a); });
		};
		var read = function () {
			var v = function (k) { return b.querySelector('#pf-' + k).value.trim(); };
			var q = v('qty');
			return { name: v('name'), cat: catSel.value === '__new' ? (newCat.value.trim() || 'Misc') : catSel.value, value: v('value'), pkg: v('pkg'), mpn: v('mpn'),
				qty: q === '' ? '' : (isNaN(+q) ? q : +q), unit: v('unit'), size: v('size'), tags: splitTags(v('tags')), url: v('url'),
				notes: b.querySelector('#pf-notes').value.trim(), loc: loc, slot: v('slot') };
		};
		var commit = function (again) {
			var data = read();
			if (!data.name && !data.value) { b.querySelector('#pf-name').focus(); return; }
			change(function () {
				if (id) { var cur = byId(id); Object.assign(cur, data); delete cur.sample; }
				else { data.id = uid(); data.added = new Date().toISOString(); doc.parts.push(data); }
			});
			if (again) openPart(null, { cat: data.cat, pkg: data.pkg, unit: data.unit, loc: data.loc, size: data.size });
			else closeModal();
		};
		b.querySelector('#pf-save').onclick = function () { commit(false); };
		var ag = b.querySelector('#pf-again'); if (ag) ag.onclick = function () { commit(true); };
		var dup = b.querySelector('#pf-dup'); if (dup) dup.onclick = function () { var d = read(); delete d.id; openPart(null, d); };
		var del = b.querySelector('#pf-del');
		if (del) del.onclick = function () {
			if (del.dataset.arm) { change(function () { doc.parts = doc.parts.filter(function (x) { return x.id !== id; }); }); closeModal(); }
			else { del.dataset.arm = 1; del.textContent = 'Really delete?'; }
		};
	});
}

/* move one or more parts: pick a drawer on the maps */
function openMove(ids) {
	var first = byId(ids[0]);
	pickDrawer(ids.length === 1 && first ? first.loc : '', function (a) {
		change(function () { doc.parts.forEach(function (p) { if (ids.indexOf(p.id) >= 0) { p.loc = a; if (!a) p.slot = ''; } }); });
		if (ui.selecting) { ui.picked = {}; renderList(); selCount(); }
	}, ids.length === 1 && first ? ((first.value ? first.value + ' · ' : '') + first.name) : ids.length + ' parts');
}
function pickDrawer(current, done, what) {
	var prev = { title: $mTitle.innerHTML, meta: $mMeta.textContent, body: $mBody.innerHTML, open: !$modal.hidden };
	var nested = prev.open;
	var saved = nested ? Array.prototype.slice.call($mBody.childNodes) : null;
	var html = '<p class="hint" style="margin:0 0 1rem">Tap a drawer' + (what ? ' for <strong>' + esc(what) + '</strong>' : '') + '. Planned drawers show their category colour; numbers are part counts.</p>' +
		'<input class="comp-in" id="pk-find" placeholder="Find a drawer by label or category…" style="margin-bottom:1rem">' +
		'<div class="comp-pick">' + sortedCabs().map(function (c) {
			return '<div class="cab-card"><div class="cab-head"><span class="cab-letter">' + c.id + '</span><span class="cab-name">' + esc(cabTitle(c)) + '</span></div>' + mapHTML(c.id, { target: true, current: current }) + '</div>';
		}).join('') + '</div><div class="comp-btns"><button type="button" class="tools-chip" id="pk-none">Unplaced</button><span class="grow"></span>' +
		(nested ? '<button type="button" class="comp-link" id="pk-back">Back</button>' : '') + '</div>';
	var finish = function (a) {
		if (nested) { $mTitle.innerHTML = prev.title; $mMeta.textContent = prev.meta; $mBody.innerHTML = ''; saved.forEach(function (n) { $mBody.appendChild(n); }); done(a); }
		else { closeModal(); done(a); }
	};
	var paint = function (b) {
		b.querySelectorAll('.comp-pick [data-drw]').forEach(function (x) { x.onclick = function () { finish(x.getAttribute('data-drw')); }; });
		b.querySelector('#pk-none').onclick = function () { finish(''); };
		var bk = b.querySelector('#pk-back'); if (bk) bk.onclick = function () { $mTitle.innerHTML = prev.title; $mMeta.textContent = prev.meta; $mBody.innerHTML = ''; saved.forEach(function (n) { $mBody.appendChild(n); }); };
		var find = b.querySelector('#pk-find');
		find.oninput = function () {
			var m = matcher(find.value);
			b.querySelectorAll('.comp-pick [data-drw]').forEach(function (x) {
				var a = x.getAttribute('data-drw'), plan = doc.drawers[a] || {};
				x.classList.toggle('is-hit', !!m && m([a, plan.label, plan.cat, drawerCat(a)].join(' · ')));
				x.classList.toggle('is-dim', !!m && !x.classList.contains('is-hit'));
			});
		};
	};
	if (nested) {
		$mTitle.textContent = 'Choose a drawer'; $mMeta.textContent = '';
		$mBody.innerHTML = html; paint($mBody);
	} else openModal('Choose a drawer', '', html, paint);
}
function openCatPick(ids) {
	var html = '<div class="tools-chips">' + allCats().map(function (c) { return '<button type="button" class="tools-chip" data-c="' + esc(c) + '"><span class="sw" style="--c:' + catColor(c) + '"></span>' + esc(c) + '</button>'; }).join('') + '</div>';
	openModal('Set category', ids.length + ' parts', html, function (b) {
		b.querySelectorAll('[data-c]').forEach(function (x) { x.onclick = function () { var c = x.getAttribute('data-c'); change(function () { doc.parts.forEach(function (p) { if (ids.indexOf(p.id) >= 0) p.cat = c; }); }); closeModal(); ui.picked = {}; renderList(); selCount(); }; });
	});
}

/* arrangement of the six cabinets */
function openArrange() {
	var html = '<h4>Presets</h4><div class="tools-chips">' + Object.keys(PRESETS).map(function (k) { return '<button type="button" class="tools-chip" data-pre="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' +
		'<h4>Cabinets</h4><ul class="comp-arr">' + sortedCabs().map(function (c) {
			return '<li><span class="cab-letter">' + c.id + '</span><input class="comp-in" data-name="' + c.id + '" value="' + esc(c.name || '') + '" aria-label="Name of cabinet ' + c.id + '">' +
				'<span class="ctl"><span class="q" style="font-size:var(--t-xs);color:var(--muted)">' + MODELS[c.model].title + ' · stack ' + (c.col + 1) + ', ' + (c.level + 1) + '</span>' +
				'<button type="button" class="comp-mini" data-mv="' + c.id + ':-1:0" aria-label="Left">←</button><button type="button" class="comp-mini" data-mv="' + c.id + ':1:0" aria-label="Right">→</button>' +
				'<button type="button" class="comp-mini" data-mv="' + c.id + ':0:1" aria-label="Up">↑</button><button type="button" class="comp-mini" data-mv="' + c.id + ':0:-1" aria-label="Down">↓</button></span></li>';
		}).join('') + '</ul><p class="hint">← → moves a cabinet to the next stack; ↑ ↓ swaps it within its stack. All six share the same 364 × 152 mm footprint, so any of them stack.</p>' +
		'<div class="comp-btns"><button type="button" class="tools-send" data-close>Done</button></div>';
	openModal('Arrange cabinets', '', html, function (b) {
		b.querySelectorAll('[data-pre]').forEach(function (x) { x.onclick = function () {
			var p = PRESETS[x.getAttribute('data-pre')];
			change(function () { doc.cabinets.forEach(function (c) { if (p[c.id]) { c.col = p[c.id][0]; c.level = p[c.id][1]; } }); }, false);
			openArrange();
		}; });
		b.querySelectorAll('[data-name]').forEach(function (x) { x.onchange = function () { var id = x.getAttribute('data-name'); change(function () { cabById(id).name = x.value.trim(); }); }; });
		b.querySelectorAll('[data-mv]').forEach(function (x) { x.onclick = function () {
			var a = x.getAttribute('data-mv').split(':'), c = cabById(a[0]), dx = +a[1], dy = +a[2];
			change(function () {
				if (dx) { c.col = Math.max(0, c.col + dx); c.level = 99; }
				if (dy) {
					var stack = doc.cabinets.filter(function (o) { return o.col === c.col; }).sort(function (p, q) { return p.level - q.level; });
					var i = stack.indexOf(c), j = i + dy;
					if (j >= 0 && j < stack.length) { var t = stack[j].level; stack[j].level = c.level; c.level = t; }
				}
				compactStacks();
			}, false);
			openArrange();
		}; });
	});
}
function compactStacks() {
	var cols = {};
	doc.cabinets.forEach(function (c) { (cols[c.col] = cols[c.col] || []).push(c); });
	Object.keys(cols).map(Number).sort(function (a, b) { return a - b; }).forEach(function (col, i) {
		cols[col].sort(function (a, b) { return a.level - b.level; }).forEach(function (c, l) { c.col = i; c.level = l; });
	});
}

/* suggest: fill unplaced parts into planned drawers of their category, then into empty drawers */
function suggestPlan(perDrawer) {
	var plan = [], load = {}, claimed = {};
	geo.order.forEach(function (a) { load[a] = drawerParts(a).length; });
	var unplaced = doc.parts.filter(function (p) { return !p.loc; });
	var byCat = {};
	unplaced.forEach(function (p) { (byCat[p.cat || 'Misc'] = byCat[p.cat || 'Misc'] || []).push(p); });
	var fits = function (a, size) { var d = geo.drawers[a]; return !size || d.size === size || (size === 'S') || (size === 'M' && d.size === 'L'); };
	var catOf = function (a) { return claimed[a] || drawerCat(a); };
	allCats().forEach(function (cat) {
		(byCat[cat] || []).forEach(function (p) {
			// 1. a drawer already of this category with room
			var a = geo.order.filter(function (x) { return catOf(x) === cat && load[x] < perDrawer && fits(x, p.size); })
				.sort(function (x, y) { return load[x] - load[y]; })[0];
			// 2. an empty, unplanned drawer of the right size — next to this category's other drawers if possible
			if (!a) {
				var empty = geo.order.filter(function (x) { return !catOf(x) && !load[x] && !(doc.drawers[x] || {}).label && fits(x, p.size); });
				var want = p.size || 'S';
				empty.sort(function (x, y) { return (geo.drawers[x].size === want ? 0 : 1) - (geo.drawers[y].size === want ? 0 : 1); });
				var mine = geo.order.filter(function (x) { return catOf(x) === cat; }).map(function (x) { return geo.order.indexOf(x); });
				if (mine.length) {
					var last = Math.max.apply(null, mine);
					var after = empty.filter(function (x) { return geo.order.indexOf(x) > last && geo.drawers[x].size === geo.drawers[empty[0]].size; });
					if (after.length) a = after[0];
				}
				a = a || empty[0];
				if (a) claimed[a] = cat;
			}
			if (!a) { plan.push({ p: p, a: '' }); return; }
			load[a]++;
			plan.push({ p: p, a: a, newPlan: claimed[a] && !(doc.drawers[a] || {}).cat ? cat : '' });
		});
	});
	return plan;
}
function openSuggest() {
	var unplaced = doc.parts.filter(function (p) { return !p.loc; });
	if (!unplaced.length) {
		openModal('Suggest places', '', '<p class="hint" style="margin:0">Every part already has a drawer. Unplace some (Select → Unplace) to have them re-suggested.</p>');
		return;
	}
	var per = 4;
	var draw = function () {
		var plan = suggestPlan(per), ok = plan.filter(function (x) { return x.a; });
		var html = '<p class="hint" style="margin:0 0 1rem">Fills ' + unplaced.length + ' unplaced parts into drawers already planned or used for their category, then into empty drawers of the right size, keeping a category together. Nothing changes until you apply it.</p>' +
			'<div class="comp-seg" style="margin-bottom:1rem"><span class="hint" style="margin:0 .5rem 0 0;align-self:center">Parts per drawer</span>' +
			[1, 2, 4, 6, 10].map(function (n) { return '<button type="button" class="comp-mini" data-per="' + n + '" aria-pressed="' + (n === per) + '">' + n + '</button>'; }).join('') + '</div>' +
			'<div class="comp-scroll" style="max-height:24rem"><table class="comp-sugg"><thead><tr><th>Part</th><th>Category</th><th>Drawer</th></tr></thead><tbody>' +
			plan.map(function (x) {
				return '<tr><td>' + esc((x.p.value ? x.p.value + ' · ' : '') + x.p.name) + '</td><td><span class="sw" style="--c:' + catColor(x.p.cat) + '"></span> ' + esc(x.p.cat || '') + '</td><td>' +
					(x.a ? esc(x.a) + (x.newPlan ? ' <span style="color:var(--muted)">(new)</span>' : '') : '<span style="color:#a1322b">no room</span>') + '</td></tr>';
			}).join('') + '</tbody></table></div>' +
			'<div class="comp-btns"><button type="button" class="tools-send" id="sg-apply"' + (ok.length ? '' : ' disabled') + '>Place ' + ok.length + ' parts</button>' +
			'<span class="hint" style="margin:0">Drawers marked (new) also get the category as their plan. Undo reverses it.</span></div>';
		openModal('Suggest places', ok.length + ' of ' + plan.length, html, function (b) {
			b.querySelectorAll('[data-per]').forEach(function (x) { x.onclick = function () { per = +x.getAttribute('data-per'); draw(); }; });
			b.querySelector('#sg-apply').onclick = function () {
				change(function () {
					ok.forEach(function (x) {
						byId(x.p.id).loc = x.a;
						if (x.newPlan) doc.drawers[x.a] = Object.assign({}, doc.drawers[x.a] || {}, { cat: x.newPlan });
					});
				});
				closeModal();
			};
		});
	};
	draw();
}

/* ---- import / export -------------------------------------------------------- */
var FIELD_ALIASES = {
	name: ['name', 'part', 'description', 'item', 'component'], cat: ['category', 'cat', 'type', 'group'], value: ['value', 'val', 'rating'],
	pkg: ['package', 'pkg', 'footprint', 'case'], mpn: ['mpn', 'part number', 'partnumber', 'pn', 'model', 'sku', 'lcsc', 'manufacturer part'],
	qty: ['qty', 'quantity', 'count', 'stock', 'amount'], unit: ['unit', 'units'], size: ['size', 'drawer size'], tags: ['tags', 'keywords'],
	notes: ['notes', 'note', 'comment', 'comments'], url: ['url', 'link', 'datasheet'], loc: ['drawer', 'location', 'loc', 'bin'], slot: ['slot', 'position']
};
function parseCSV(text) {
	var rows = [], row = [], cell = '', q = false, sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
	for (var i = 0; i < text.length; i++) {
		var ch = text[i];
		if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
		else if (ch === '"') q = true;
		else if (ch === sep) { row.push(cell); cell = ''; }
		else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
		else cell += ch;
	}
	if (cell || row.length) { row.push(cell); rows.push(row); }
	return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
}
function partsFromText(text) {
	text = text.trim();
	if (!text) return { parts: [] };
	if (text[0] === '{' || text[0] === '[') {
		var j = JSON.parse(text);
		if (Array.isArray(j)) return { parts: j.map(cleanPart) };
		if (j.doc) j = j.doc;
		return { parts: (j.parts || []).map(cleanPart), doc: j.parts ? j : null };
	}
	var rows = parseCSV(text), head = rows.shift().map(function (h) { return norm(h).trim(); }), map = {};
	Object.keys(FIELD_ALIASES).forEach(function (f) {
		var i = head.findIndex(function (h) { return FIELD_ALIASES[f].indexOf(h) >= 0; });
		if (i >= 0) map[f] = i;
	});
	if (map.name == null && map.value == null) throw new Error('No “name” or “value” column found. First row should be headings.');
	return { parts: rows.map(function (r) { var o = {}; for (var f in map) o[f] = (r[map[f]] || '').trim(); return cleanPart(o); }), map: map };
}
function cleanPart(o) {
	var catMatch = function (c) { if (!c) return 'Misc'; var n = norm(c); return CATS.find(function (k) { return norm(k) === n || norm(k).indexOf(n) === 0; }) || c; };
	var qty = o.qty === '' || o.qty == null ? '' : (isNaN(+o.qty) ? String(o.qty) : +o.qty);
	var loc = String(o.loc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (/^[A-Z]\d$/.test(loc)) loc = loc[0] + '0' + loc[1];
	return { id: o.id || uid(), name: String(o.name || '').trim(), cat: catMatch(o.cat), value: String(o.value || '').trim(), pkg: String(o.pkg || '').trim(),
		mpn: String(o.mpn || '').trim(), qty: qty, unit: UNITS.indexOf(o.unit) >= 0 ? o.unit : 'pcs', size: SIZES[String(o.size || '').toUpperCase()] ? String(o.size).toUpperCase() : '',
		tags: splitTags(o.tags), notes: String(o.notes || '').trim(), url: String(o.url || '').trim(), loc: geo.drawers[loc] ? loc : '', slot: String(o.slot || '').trim(), added: o.added || new Date().toISOString() };
}
function openImport() {
	var html = '<p class="hint" style="margin:0 0 1rem">Paste rows from a spreadsheet (first row = headings) or a CSV/JSON export. Columns it understands: name, category, value, package, part number, qty, unit, size (S/M/L), tags, notes, link, drawer (A07), slot. Anything missing is left blank.</p>' +
		'<label class="comp-drop" id="im-drop"><input type="file" id="im-file" accept=".csv,.tsv,.txt,.json" hidden>Drop a .csv / .json here, or tap to choose one</label>' +
		'<textarea class="comp-in" id="im-text" rows="8" style="margin-top:1rem;font-family:ui-monospace,Menlo,monospace;font-size:max(0.85rem,12px)" placeholder="name,category,value,package,qty,drawer&#10;Resistor,Resistors,10k,0805,500,A01"></textarea>' +
		'<p class="hint" id="im-read"></p>' +
		'<div class="comp-btns"><button type="button" class="tools-send" id="im-add" disabled>Add to the list</button><button type="button" class="comp-link" id="im-replace" disabled>Replace the whole list</button></div>';
	openModal('Import a list', '', html, function (b) {
		var txt = b.querySelector('#im-text'), out = b.querySelector('#im-read'), add = b.querySelector('#im-add'), rep = b.querySelector('#im-replace'), parsed = null;
		var check = function () {
			parsed = null; add.disabled = rep.disabled = true;
			if (!txt.value.trim()) { out.textContent = ''; return; }
			try {
				parsed = partsFromText(txt.value);
				var n = parsed.parts.length, placed = parsed.parts.filter(function (p) { return p.loc; }).length;
				out.textContent = n + ' part' + (n === 1 ? '' : 's') + ' read' + (placed ? ', ' + placed + ' with a drawer' : '') + (parsed.map ? ' · columns: ' + Object.keys(parsed.map).join(', ') : '') + (parsed.doc ? ' · full export (drawer plans and cabinet layout included)' : '') + '.';
				add.disabled = rep.disabled = !n && !parsed.doc;
			} catch (e) { out.textContent = 'Couldn’t read that: ' + e.message; }
		};
		txt.oninput = check;
		var file = b.querySelector('#im-file'), drop = b.querySelector('#im-drop');
		var readFile = function (f) { if (!f) return; var r = new FileReader(); r.onload = function () { txt.value = r.result; check(); }; r.readAsText(f); };
		file.onchange = function () { readFile(file.files[0]); };
		drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('is-over'); };
		drop.ondragleave = function () { drop.classList.remove('is-over'); };
		drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('is-over'); readFile(e.dataTransfer.files[0]); };
		add.onclick = function () { if (!parsed) return; change(function () { doc.parts = doc.parts.concat(parsed.parts.map(function (p) { p.id = uid(); return p; })); }); closeModal(); };
		rep.onclick = function () {
			if (!parsed) return;
			if (!rep.dataset.arm) { rep.dataset.arm = 1; rep.textContent = 'Replace ' + doc.parts.length + ' parts? Tap again'; return; }
			change(function () {
				if (parsed.doc) doc = normalise(JSON.parse(JSON.stringify(parsed.doc)));
				else doc.parts = parsed.parts;
			}, false);
			closeModal();
		};
	});
}
function toCSV() {
	var cols = ['name', 'category', 'value', 'package', 'part number', 'qty', 'unit', 'size', 'tags', 'notes', 'link', 'drawer', 'drawer label', 'slot'];
	var q = function (s) { s = String(s == null ? '' : s); return /[",\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
	return [cols.join(',')].concat(doc.parts.map(function (p) {
		return [p.name, p.cat, p.value, p.pkg, p.mpn, p.qty, p.unit, p.size, (p.tags || []).join(', '), p.notes, p.url, p.loc, (doc.drawers[p.loc] || {}).label, p.slot].map(q).join(',');
	})).join('\n');
}
function openExport() {
	var stamp = new Date().toISOString().slice(0, 10);
	var html = '<p class="hint" style="margin:0 0 1rem">The JSON keeps everything (parts, drawer plans, cabinet layout) and imports back in. The CSV opens in a spreadsheet.</p>' +
		'<div class="comp-btns" style="margin-top:0"><button type="button" class="tools-send" id="ex-json">Download JSON</button><button type="button" class="tools-chip" id="ex-csv">Download CSV</button>' +
		'<button type="button" class="tools-chip" id="ex-copy">Copy CSV</button></div><textarea class="comp-in" id="ex-text" rows="6" readonly style="margin-top:1rem;font-family:ui-monospace,Menlo,monospace;font-size:max(0.8rem,11px)"></textarea>';
	openModal('Export', doc.parts.length + ' parts', html, function (b) {
		var t = b.querySelector('#ex-text'); t.value = toCSV();
		var dl = function (name, type, data) {
			try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) {}
		};
		b.querySelector('#ex-json').onclick = function () { dl('om-components-' + stamp + '.json', 'application/json', JSON.stringify({ exported: new Date().toISOString(), doc: doc }, null, 1)); };
		b.querySelector('#ex-csv').onclick = function () { dl('om-components-' + stamp + '.csv', 'text/csv', toCSV()); };
		b.querySelector('#ex-copy').onclick = function () {
			var btn = this;
			(navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { btn.textContent = 'Copied'; }, function () { t.select(); btn.textContent = 'Selected — copy it'; });
		};
	});
}

/* ---- sample parts (marked "Sample"; delete or overwrite them freely) --------------- */
function loadSample() {
	var S = [
		['Resistor kit 0805, E24 1Ω–1MΩ', 'Resistors', '', '0805', '', 1, 'kit', 'M', 'smd, e24, 1%', ''],
		['Thick-film resistor', 'Resistors', '10kΩ', '0805', 'RC0805FR-0710KL', 500, 'pcs', 'S', 'smd, 1%', 'A01'],
		['Thick-film resistor', 'Resistors', '4k7', '0805', 'RC0805FR-074K7L', 200, 'pcs', 'S', 'smd, i2c pull-up', 'A01'],
		['Thick-film resistor', 'Resistors', '330Ω', '0805', '', 200, 'pcs', 'S', 'smd, led', 'A02'],
		['Metal-film resistor 1/4 W', 'Resistors', '1kΩ', 'THT axial', '', 100, 'pcs', 'S', 'tht', ''],
		['MLCC X7R 50V', 'Capacitors', '100nF', '0805', 'CL21B104KBCNNNC', 500, 'pcs', 'S', 'smd, decoupling', 'A07'],
		['MLCC X5R 25V', 'Capacitors', '10µF', '0805', '', 100, 'pcs', 'S', 'smd', 'A07'],
		['Electrolytic 25V', 'Capacitors', '100uF', '6.3 × 7 mm radial', '', 30, 'pcs', 'S', 'tht', ''],
		['Schottky diode', 'Diodes', '', 'SOD-123', '1N5819W', 100, 'pcs', 'S', 'smd', ''],
		['Rectifier diode', 'Diodes', '', 'DO-41', '1N4007', 50, 'pcs', 'S', 'tht', ''],
		['Addressable RGB LED', 'LEDs', '', '5050', 'WS2812B', 200, 'pcs', 'S', 'neopixel, 5V', 'B01'],
		['LED strip 60/m', 'LEDs', '', '10 mm strip', 'SK6812', 5, 'm', 'L', 'addressable', ''],
		['N-MOSFET logic level', 'Transistors & MOSFETs', '30V', 'SOT-23', 'AO3400A', 100, 'pcs', 'S', 'smd, switching', ''],
		['NPN transistor', 'Transistors & MOSFETs', '', 'TO-92', '2N2222A', 30, 'pcs', 'S', 'tht', ''],
		['LDO regulator', 'Voltage regulators', '3.3V', 'SOT-223', 'AMS1117-3.3', 40, 'pcs', 'S', '1A', ''],
		['Buck converter', 'Voltage regulators', '3.3V', 'TSOT-23-6', 'AP63203WU', 20, 'pcs', 'S', '2A, 3.8–32V in', ''],
		['ESP32-S3 dev board', 'Microcontrollers & boards', '', 'DevKitC-1', 'ESP32-S3-DevKitC-1-N8R8', 3, 'board', 'M', 'wifi, ble, usb', 'E01'],
		['Raspberry Pi Pico 2', 'Microcontrollers & boards', '', 'module', 'RP2350', 4, 'board', 'M', 'rp2350', 'E01'],
		['Arduino Nano ESP32', 'Microcontrollers & boards', '', 'Nano', 'ABX00083', 2, 'board', 'M', 'esp32-s3', ''],
		['BME280 breakout', 'Sensors & modules', '', 'module', 'BME280', 3, 'pcs', 'M', 'i2c, temperature, humidity, pressure', ''],
		['JST XH connector kit', 'Connectors', '', '2.50 mm', 'XH', 1, 'kit', 'M', 'jst xh, 2-6 pin, crimp', 'C13'],
		['JST PH housings', 'Connectors', '', '2.00 mm', 'PHR-2', 100, 'pcs', 'S', 'jst ph, battery', ''],
		['USB-C receptacle 16P', 'Connectors', '', 'SMD', 'TYPE-C-31-M-12', 20, 'pcs', 'S', 'usb c', ''],
		['Pin header 1×40', 'Headers & sockets', '', '2.54 mm', '', 30, 'strip', 'S', 'male, breakaway', ''],
		['Female header 1×40', 'Headers & sockets', '', '2.54 mm', '', 20, 'strip', 'S', 'female', ''],
		['Tactile switch', 'Switches & buttons', '', '6 × 6 × 5 mm THT', '', 100, 'pcs', 'S', 'momentary', ''],
		['Crystal', 'Crystals & oscillators', '16MHz', 'HC-49S', '', 20, 'pcs', 'S', '', ''],
		['PTC resettable fuse', 'Fuses & protection', '500mA', '1206', '', 50, 'pcs', 'S', 'smd, usb', ''],
		['Silicone wire set 22 AWG', 'Wire & heatshrink', '', '6 colours × 10 m', '', 1, 'kit', 'L', '22 awg, stranded', 'C16'],
		['Heat-shrink assortment', 'Wire & heatshrink', '', '2:1', '', 1, 'kit', 'L', 'heatshrink', ''],
		['M3 brass standoff kit', 'Hardware', '', 'M3', '', 1, 'kit', 'M', 'standoff, spacer, m3', ''],
		['M2.5 screws', 'Hardware', '', 'M2.5 × 6', '', 100, 'pcs', 'S', 'pan head, pi mounting', '']
	];
	change(function () {
		S.forEach(function (r) {
			doc.parts.push({ id: uid(), name: r[0], cat: r[1], value: r[2], pkg: r[3], mpn: r[4], qty: r[5], unit: r[6], size: r[7], tags: splitTags(r[8]), notes: '', url: '', loc: r[9], slot: '', sample: true, added: new Date().toISOString() });
		});
		doc.drawers.A01 = doc.drawers.A01 || { cat: 'Resistors', label: '0805 resistors' };
		doc.drawers.A07 = doc.drawers.A07 || { cat: 'Capacitors', label: '0805 MLCC' };
		doc.drawers.E01 = doc.drawers.E01 || { cat: 'Microcontrollers & boards', label: 'Dev boards' };
	});
}

/* ---- 3D --------------------------------------------------------------------- */
function init3D() {
	Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function (mods) {
		three = makeThree(mods[0], mods[1].OrbitControls);
		$stageMsg.remove();
	}).catch(function (e) {
		$stageMsg.textContent = 'The 3D view didn’t load (' + e.message + '). The drawer maps below work the same.';
	});
}
function makeThree(THREE, OrbitControls) {
	var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	$stage.appendChild(renderer.domElement);
	var scene = new THREE.Scene();
	var camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);
	var controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 200; controls.maxDistance = 6000;
	controls.screenSpacePanning = true;

	scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 1.6));
	var sun = new THREE.DirectionalLight(0xffffff, 1.6);
	sun.position.set(-600, 1400, 1200); sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6;
	var sc = sun.shadow.camera; sc.left = -1500; sc.right = 1500; sc.top = 1500; sc.bottom = -1500; sc.near = 100; sc.far = 5000;
	scene.add(sun); scene.add(sun.target);
	var fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(800, 300, 900); scene.add(fill);
	var ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.16 }));
	ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

	var shellMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.55, metalness: 0.05 });
	var pullMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.3, transparent: true, opacity: 0.85 });
	var root = new THREE.Group(); scene.add(root);
	var drawers = {}; // addr → { group, tray, front, fill, tex, canvas, open, target }
	var anim = { t: 0 };

	function box(w, h, d, mat) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; }

	function rebuild(keepView) {
		// clear
		root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== shellMat && o.material !== pullMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
		root.clear(); drawers = {};
		// stacks → positions (x across, y up, z towards the viewer; cabinet front at z = d/2)
		var cols = {};
		doc.cabinets.forEach(function (c) { (cols[c.col] = cols[c.col] || []).push(c); });
		var colKeys = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
		var GAPX = 14, totalW = colKeys.length * 364 + (colKeys.length - 1) * GAPX;
		colKeys.forEach(function (k, ci) {
			var y = 0, x0 = -totalW / 2 + ci * (364 + GAPX);
			cols[k].sort(function (a, b) { return a.level - b.level; }).forEach(function (c) {
				var g = geo.cabs[c.id], m = g.model, grp = new THREE.Group();
				grp.position.set(x0, y, -m.d / 2);
				buildCabinet(grp, c, g);
				root.add(grp);
				y += m.h + 1;
			});
		});
		paint();
		if (!keepView) view(curView, true);
		kick();
	}

	function buildCabinet(grp, c, g) {
		var m = g.model, W = m.w, H = m.h, D = m.d;
		// shell: sides, top, bottom, back (cabinet-local: x 0..W, y 0..H, z 0..D, front at z = D)
		var add = function (mesh, x, y, z) { mesh.position.set(x, y, z); grp.add(mesh); };
		add(box(WALL, H, D, shellMat), WALL / 2, H / 2, D / 2);
		add(box(WALL, H, D, shellMat), W - WALL / 2, H / 2, D / 2);
		add(box(W, WALL, D, shellMat), W / 2, H - WALL / 2, D / 2);
		add(box(W, WALL, D, shellMat), W / 2, WALL / 2, D / 2);
		add(box(W, H, 3, shellMat), W / 2, H / 2, 1.5);
		// shelves between rows and dividers between drawers
		var rows = {};
		g.drawers.forEach(function (d) { (rows[d.row] = rows[d.row] || []).push(d); });
		Object.keys(rows).forEach(function (r) {
			var list = rows[r], d0 = list[0];
			if (+r > 1) add(box(W - 2 * WALL, GAP, D - 4, shellMat), W / 2, H - (d0.y - GAP / 2), D / 2 - 1);
			list.slice(1).forEach(function (d) { add(box(GAP, d.h, D - 4, shellMat), d.x - GAP / 2, H - d.y - d.h / 2, D / 2 - 1); });
		});
		// label on the cabinet top
		var lc = document.createElement('canvas'); lc.width = 256; lc.height = 256;
		var lx = lc.getContext('2d'); lx.fillStyle = '#efefef'; lx.font = '300 200px Gaisyr, Georgia, serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText(c.id, 128, 140);
		var lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
		var lbl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
		lbl.rotation.x = -Math.PI / 2; lbl.position.set(W / 2, H + 0.6, D - 40); grp.add(lbl);
		// drawers
		g.drawers.forEach(function (d) {
			var dg = new THREE.Group(), w = d.w - 1, h = d.h - 1, dd = D - 10;
			var base = D - dd - 1.5;
			dg.position.set(d.x + d.w / 2, H - d.y - d.h / 2, base);
			var trayMat = new THREE.MeshPhysicalMaterial({ color: 0xeef2f4, roughness: 0.15, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
			var tray = new THREE.Mesh(new THREE.BoxGeometry(w - 2, h - 2, dd - 2), trayMat);
			tray.position.set(0, 0, dd / 2); tray.renderOrder = 2; dg.add(tray);
			var fillMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, transparent: true, opacity: 0.9 });
			var fillH = Math.max(6, h * 0.42);
			var fil = new THREE.Mesh(new THREE.BoxGeometry(w - 7, fillH, dd - 14), fillMat);
			fil.position.set(0, -h / 2 + fillH / 2 + 2, dd / 2); fil.castShadow = false; dg.add(fil);
			// front with a printed label
			var cv = document.createElement('canvas'), ar = h / w;
			cv.width = 256; cv.height = Math.max(64, Math.round(256 * ar));
			var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
			var frontMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.25 });
			var front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
			front.position.set(0, 0, dd + 0.5); front.renderOrder = 3; dg.add(front);
			var pull = box(Math.min(w * 0.4, 30), 3, 7, pullMat); pull.position.set(0, -h / 2 + 5, dd + 3.5); dg.add(pull);
			front.userData.addr = tray.userData.addr = fil.userData.addr = pull.userData.addr = d.addr;
			grp.add(dg);
			drawers[d.addr] = { group: dg, tray: tray, fill: fil, front: front, tex: tex, canvas: cv, open: 0, target: 0, d: d, base: base };
		});
	}

	function paintFront(o, cat, label, n, hit, dim, sel) {
		var cv = o.canvas, x = cv.getContext('2d'), W = cv.width, H = cv.height;
		x.clearRect(0, 0, W, H);
		x.fillStyle = hit ? 'rgba(255,228,138,0.92)' : 'rgba(246,248,249,' + (dim ? 0.35 : 0.62) + ')';
		x.fillRect(0, 0, W, H);
		if (cat) { x.fillStyle = catColor(cat); x.globalAlpha = n ? 0.95 : 0.4; x.fillRect(0, H - Math.max(8, H * 0.16), W, Math.max(8, H * 0.16)); x.globalAlpha = 1; }
		if (sel) { x.strokeStyle = '#15150c'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, H - 8); }
		x.fillStyle = dim ? 'rgba(21,21,12,0.35)' : '#15150c';
		var fs = Math.min(H * 0.34, 64);
		x.font = '300 ' + fs + 'px Diatype, "Helvetica Neue", Arial, sans-serif';
		x.textBaseline = 'top'; x.fillText(o.d.addr, 12, 10);
		if (n) { x.textAlign = 'right'; x.fillStyle = 'rgba(21,21,12,0.55)'; x.fillText(String(n), W - 12, 10); x.textAlign = 'left'; }
		if (label && H > 90) {
			x.fillStyle = dim ? 'rgba(21,21,12,0.3)' : 'rgba(21,21,12,0.75)';
			x.font = '300 ' + Math.min(H * 0.2, 34) + 'px Diatype, "Helvetica Neue", Arial, sans-serif';
			var t = label; while (x.measureText(t).width > W - 24 && t.length > 2) t = t.slice(0, -2) + '…';
			x.fillText(t, 12, 12 + fs + 4);
		}
		o.tex.needsUpdate = true;
	}
	function paint() {
		var hits = hitDrawers();
		Object.keys(drawers).forEach(function (a) {
			var o = drawers[a], plan = doc.drawers[a] || {}, n = drawerParts(a).length, cat = drawerCat(a);
			var hit = hits && hits[a], dim = hits && !hit, sel = ui.sel === a;
			paintFront(o, cat, plan.label || (cat && o.d.size !== 'S' ? cat : ''), n, hit, dim, sel);
			o.fill.visible = !!n;
			if (n) { o.fill.material.color.set(catColor(cat) || '#9a9a9a'); o.fill.material.opacity = dim ? 0.25 : 0.9; }
			o.tray.material.opacity = dim ? 0.12 : 0.32;
			o.front.material.opacity = dim ? 0.75 : 1;
			o.target = sel ? 105 : (hit && hitCount(hits) <= 6 ? 45 : 0);
		});
		kick();
	}
	function hitCount(h) { var n = 0; for (var k in h) n++; return n; }

	// views
	var curView = 'three';
	function bounds() { var b = new THREE.Box3().setFromObject(root); return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-500, 0, -100), new THREE.Vector3(500, 500, 100)) : b; }
	function view(name, instant) {
		curView = name || curView;
		document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === curView ? 'true' : 'false'); });
		var b = bounds(), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
		var aspect = camera.aspect || 1.5, fov = camera.fov * Math.PI / 180;
		var fitH = s.y / (2 * Math.tan(fov / 2)), fitW = s.x / (2 * Math.tan(fov / 2) * aspect);
		var dist = Math.max(fitH, fitW) * 1.25 + s.z;
		var dir = curView === 'front' ? new THREE.Vector3(0, 0.04, 1) : curView === 'top' ? new THREE.Vector3(0, 1, 0.55) : new THREE.Vector3(-0.55, 0.32, 1);
		if (curView === 'top') dist = Math.max(s.x / (2 * Math.tan(fov / 2) * aspect), s.z * 3) * 1.25 + s.y;
		dir.normalize();
		tween(c, c.clone().add(dir.multiplyScalar(dist)), instant);
	}
	var tw = null;
	function tween(target, pos, instant) {
		if (instant) { controls.target.copy(target); camera.position.copy(pos); controls.update(); kick(); return; }
		tw = { t0: performance.now(), ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos };
		kick();
	}
	function focus(addr) {
		var o = drawers[addr]; if (!o) return;
		var p = new THREE.Vector3(); o.front.getWorldPosition(p);
		var dir = camera.position.clone().sub(controls.target).normalize();
		if (dir.z < 0.3) dir.set(-0.35, 0.3, 1).normalize();
		tween(p.clone().add(new THREE.Vector3(0, 0, 40)), p.clone().add(dir.multiplyScalar(900)));
	}

	// picking
	var ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), down = null;
	renderer.domElement.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; });
	renderer.domElement.addEventListener('pointerup', function (e) {
		if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
		down = null;
		var a = pick(e);
		if (a) openDrawer(a);
	});
	renderer.domElement.addEventListener('pointermove', function (e) { if (e.buttons) return; renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; });
	function pick(e) {
		var r = renderer.domElement.getBoundingClientRect();
		ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ptr, camera);
		var hit = ray.intersectObjects(root.children, true).find(function (h) { return h.object.userData.addr; });
		return hit ? hit.object.userData.addr : null;
	}

	// loop: runs while something moves, then sleeps
	var running = false, idle = 0;
	function kick() { idle = 0; if (!running) { running = true; requestAnimationFrame(loop); } }
	controls.addEventListener('change', kick);
	function loop(t) {
		var moving = false;
		if (tw) {
			var k = Math.min(1, (t - tw.t0) / 700), e = 1 - Math.pow(1 - k, 3);
			controls.target.lerpVectors(tw.ft, tw.tt, e); camera.position.lerpVectors(tw.fp, tw.tp, e);
			if (k >= 1) tw = null; moving = true;
		}
		Object.keys(drawers).forEach(function (a) {
			var o = drawers[a];
			if (Math.abs(o.open - o.target) > 0.3) { o.open += (o.target - o.open) * 0.16; o.group.position.z = o.base + o.open; moving = true; }
		});
		var ch = controls.update();
		renderer.render(scene, camera);
		idle = moving || ch ? 0 : idle + 1;
		if (idle < 30) requestAnimationFrame(loop); else running = false;
	}
	function resize() {
		var w = $stage.clientWidth, h = $stage.clientHeight; if (!w || !h) return;
		renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); kick();
	}
	new ResizeObserver(resize).observe($stage);
	resize();
	rebuild(false);
	view('three', true);
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { paint(); });

	return {
		rebuild: function (keep) { rebuild(keep !== false); },
		paint: paint, view: function (v) { view(v); }, focus: focus
	};
}

/* ---- helpers ---------------------------------------------------------------- */
function byId(id) { for (var i = 0; i < doc.parts.length; i++) if (doc.parts[i].id === id) return doc.parts[i]; return null; }
function cabTitle(c) { var t = MODELS[c.model].title; return c.name && c.name !== t && c.name !== t.replace(' (L)', '') ? c.name + ' · ' + t : t; }
function cabById(id) { return doc.cabinets.find(function (c) { return c.id === id; }); }
function catOptions(sel) { return allCats().map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); }
function splitTags(t) { return Array.isArray(t) ? t : String(t || '').split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean); }
function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function pct(a, b) { return (a / b * 100).toFixed(3) + '%'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^[a-z]+:/i, ''); }
function highlight(s, q) {
	s = String(s == null ? '' : s);
	var terms = tokensOf(q).filter(function (t) { return t.length > 1 && !parseVal(t); });
	if (!terms.length) return esc(s);
	var re = new RegExp('(' + terms.map(escRe).join('|') + ')', 'ig');
	return s.split(re).map(function (part, i) { return i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part); }).join('');
}
