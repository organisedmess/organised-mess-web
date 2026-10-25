/*
 * organisedmess.studio — /internal/tools
 * Renders the workshop inventory from /internal/tools/data/tools.json + kits.json.
 *
 * Search matches brand, name, model, size, detail, uses, tags, location and
 * condition. A set shows collapsed when its own description matches, or open
 * on just the matching items when they do.
 *
 * Location and condition are editable per row (click the chip). They are
 * stored as overrides keyed by the row's `id`, through the Worker's
 * /internal/tools/api/state (Cloudflare KV); if that isn't wired up yet the
 * page falls back to this browser's localStorage and says so.
 */
(function () {
	'use strict';

	var CATEGORY_ORDER = [
		'Screwdrivers & bits', 'Ratchets & sockets', 'Hex keys', 'Power tools',
		'Crimpers', 'Strippers', 'Cutters & shears', 'Pliers', 'Tweezers',
		'Soldering', 'Desoldering', 'Soldering aids', 'Fume extraction',
		'Workholding', 'Wire wrap', 'Testing & measuring', '3D printing', 'Laser cutting',
		'Workstation', 'Cleaning'
	];
	var UPDATED = '25 Oct 2026';
	var IMG = '/internal/tools/img/';
	var API = '/internal/tools/api/state';

	var DEFAULT_LOCATION = 'Isles Institute - Not Found';
	var CONDITIONS = ['Not assessed', 'Good', 'Worn', 'Needs service', 'Broken', 'Missing'];
	var DEFAULT_CONDITION = CONDITIONS[0];

	var $list = document.getElementById('tools-list');
	var $stats = document.getElementById('tools-stats');
	var $chips = document.getElementById('tools-chips');
	var $q = document.getElementById('tools-q');
	var $clear = document.getElementById('tools-clear');
	var $result = document.getElementById('tools-result');
	var $note = document.getElementById('tools-note');

	var model = { cats: [], items: [], kits: {}, rows: [], byId: {} };
	var state = { q: '', cat: null };
	var store = { data: {}, mode: 'loading' }; // mode: 'kv' | 'local' | 'loading'

	Promise.all([
		fetch('/internal/tools/data/tools.json').then(function (r) { return r.json(); }),
		fetch('/internal/tools/data/kits.json').then(function (r) { return r.json(); }),
		loadState()
	]).then(function (res) {
		build(res[0], res[1]);
		readUrl();
		render();
		bind();
	}).catch(function (err) {
		$stats.textContent = 'Could not load the inventory (' + err.message + ').';
	});

	/* ---- state: location + condition overrides ------------------------ */
	function loadState() {
		return fetch(API, { credentials: 'same-origin' }).then(function (r) {
			if (!r.ok) throw new Error('no api');
			return r.json();
		}).then(function (j) {
			store.data = j && j.items || {};
			store.mode = 'kv';
		}).catch(function () {
			store.mode = 'local';
			try { store.data = JSON.parse(localStorage.getItem('om-tools-state') || '{}'); } catch (e) { store.data = {}; }
		});
	}
	function saveState(id, patch) {
		var cur = store.data[id] || {};
		var next = {};
		for (var k in cur) next[k] = cur[k];
		for (var p in patch) next[p] = patch[p];
		store.data[id] = next;
		if (store.mode === 'kv') {
			return fetch(API, {
				method: 'PUT', credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: id, location: next.location, condition: next.condition })
			}).then(function (r) { if (!r.ok) throw new Error('save failed (' + r.status + ')'); });
		}
		try { localStorage.setItem('om-tools-state', JSON.stringify(store.data)); } catch (e) {}
		return Promise.resolve();
	}
	function locOf(t) { var s = store.data[t.id]; return (s && s.location) || DEFAULT_LOCATION; }
	function condOf(t) { var s = store.data[t.id]; return (s && s.condition) || DEFAULT_CONDITION; }
	function allLocations() {
		var set = {};
		set[DEFAULT_LOCATION] = true;
		for (var id in store.data) if (store.data[id].location) set[store.data[id].location] = true;
		return Object.keys(set).sort();
	}

	/* ---- model ------------------------------------------------------------ */
	function build(items, kits) {
		model.items = items;
		model.kits = kits;

		var pieces = 0, catSet = {};
		items.forEach(function (t) {
			pieces += t.qty || 0;
			catSet[t.cat] = true;
			model.byId[t.id] = t;
		});
		var cats = CATEGORY_ORDER.filter(function (c) { return catSet[c]; });
		Object.keys(catSet).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
		model.cats = cats;

		var kitCount = Object.keys(kits).length;
		$stats.textContent = 'Workshop inventory \u00b7 ' + pieces + ' pieces \u00b7 ' + items.length +
			' line items \u00b7 ' + kitCount + ' sets \u00b7 ' + cats.length + ' categories \u00b7 Updated ' + UPDATED;

		cats.forEach(function (cat) {
			var catItems = items.filter(function (t) { return t.cat === cat; });
			var loose = catItems.filter(function (t) { return !t.kit; });
			var kitNames = [];
			catItems.forEach(function (t) {
				if (t.kit && kitNames.indexOf(t.kit) < 0) kitNames.push(t.kit);
			});
			var rows = [];
			loose.forEach(function (t) { rows.push({ type: 'item', cat: cat, item: t }); });
			kitNames.forEach(function (name) {
				var kit = kits[name] || {};
				kit.id = kit.id || kit.key || name;
				model.byId[kit.id] = kit;
				var sub = catItems.filter(function (t) { return t.kit === name; });
				rows.push({
					type: 'kit', cat: cat, name: name, kit: kit,
					subs: sub.map(function (t) { return { type: 'sub', item: t }; }),
					pieces: sub.reduce(function (n, t) { return n + (t.qty || 0); }, 0)
				});
			});
			model.rows.push({ cat: cat, rows: rows });
		});
	}

	// haystacks are built per render so location/condition edits are searchable at once
	function hayItem(t) {
		return norm([t.title, t.name, t.brand, t.model, t.size, t.detail, t.uses, (t.tags || []).join(' '), t.note, locOf(t), condOf(t)].join(' '));
	}
	function hayKit(row) {
		var kit = row.kit;
		return norm([row.name, kit.title, kit.uses, (kit.tags || []).join(' '), kit.size, locOf(kit), condOf(kit)].join(' '));
	}
	function norm(s) {
		return String(s || '').toLowerCase()
			.replace(/[×x]/g, 'x')
			.replace(/[–—]/g, '-')
			.replace(/\s+/g, ' ');
	}

	/* ---- search ----------------------------------------------------------- */
	function terms() {
		return norm(state.q).split(' ').filter(Boolean);
	}
	// short or purely numeric terms ("8", "m3", "tx") must match a whole
	// token, otherwise "8" would light up every "80 mm" and "800 mAh"
	function termRe(t) {
		var e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		var short = /^[a-z0-9.]{1,3}$/.test(t);
		return new RegExp((short ? '(^|[^a-z0-9.])' : '') + e + (short ? '($|[^a-z0-9.])' : ''));
	}
	var reCache = {};
	function matches(hay, ts) {
		for (var i = 0; i < ts.length; i++) {
			var re = reCache[ts[i]] || (reCache[ts[i]] = termRe(ts[i]));
			if (!re.test(hay)) return false;
		}
		return true;
	}

	/* ---- render ----------------------------------------------------------- */
	function render() {
		var ts = terms();
		var searching = ts.length > 0;
		var html = '';
		var counts = {};
		var shownRows = 0, shownPieces = 0;

		model.rows.forEach(function (sec) {
			var visible = [];
			sec.rows.forEach(function (row) {
				if (row.type === 'item') {
					if (!searching || matches(hayItem(row.item), ts)) visible.push({ row: row });
				} else {
					var kitHit = !searching || matches(hayKit(row), ts);
					var subHits = searching ? row.subs.filter(function (s) { return matches(hayItem(s.item), ts); }) : row.subs;
					// a set shows when its own description matches (collapsed, all
					// items) or when some of its items match (open, just those)
					if (kitHit || subHits.length) {
						visible.push({ row: row, subs: subHits.length ? subHits : row.subs, open: searching && subHits.length > 0 });
					}
				}
			});
			counts[sec.cat] = visible.length;
			if (state.cat && state.cat !== sec.cat) return;
			if (!visible.length) return;

			shownRows += visible.length;
			var secPieces = 0;
			visible.forEach(function (v) {
				secPieces += v.row.type === 'item' ? (v.row.item.qty || 0)
					: v.subs.reduce(function (n, s) { return n + (s.item.qty || 0); }, 0);
			});
			shownPieces += secPieces;

			var num = model.cats.indexOf(sec.cat) + 1;
			html += '<section class="row" data-cat="' + esc(sec.cat) + '">' +
				'<div class="row-head"><span class="num">' + (num < 10 ? '0' : '') + num + '</span>' +
				'<h2 class="row-label">' + esc(sec.cat) + '</h2>' +
				'<span class="cat-count">' + secPieces + (secPieces === 1 ? ' piece' : ' pieces') + '</span></div>' +
				'<div class="row-body"><div class="tool-rows">';
			visible.forEach(function (v) {
				html += v.row.type === 'item' ? rowHtml(v.row.item, false, ts) : kitHtml(v, ts);
			});
			html += '</div></div></section>';
		});

		if (!html) {
			html = '<div class="tools-empty">Nothing matches \u201c' + esc(state.q) + '\u201d' +
				(state.cat ? ' in ' + esc(state.cat) : '') + '.</div>';
		}
		$list.innerHTML = html;

		var chipHtml = '<button type="button" class="tools-chip" data-cat="" aria-pressed="' + (!state.cat) + '">All</button>';
		model.cats.forEach(function (c) {
			var n = counts[c] || 0;
			chipHtml += '<button type="button" class="tools-chip' + (searching && !n ? ' is-empty' : '') +
				'" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' +
				esc(c) + '<span class="n">' + n + '</span></button>';
		});
		$chips.innerHTML = chipHtml;

		$clear.hidden = !state.q;
		$result.textContent = searching || state.cat
			? (shownRows ? shownRows + (shownRows === 1 ? ' entry' : ' entries') + ' \u00b7 ' + shownPieces + (shownPieces === 1 ? ' piece' : ' pieces') : 'No matches')
			: '';
		if ($note) $note.hidden = store.mode !== 'local';
		writeUrl();
	}

	// "Brand | Product" heading: title minus the brand where the title starts with it
	function heading(brand, full, ts) {
		brand = (brand && brand !== '\u2014') ? brand : '';
		var rest = full;
		if (brand && full.toLowerCase().indexOf(brand.toLowerCase() + ' ') === 0) rest = full.slice(brand.length + 1);
		return (brand ? '<span class="tool-brand-name">' + hl(brand, ts) + '</span><span class="tool-sep" aria-hidden="true"></span>' : '') +
			'<span class="tool-product">' + hl(rest, ts) + '</span>';
	}

	function rowHtml(t, isSub, ts) {
		var key = t.key || t.pkey;
		var label = t.title || t.name;
		var head = isSub ? heading(t.brand, t.name, ts) : heading(t.brand, label, ts);
		var desc = (!isSub && t.title) ? '<p class="tool-desc">' + hl(t.name, ts) + '</p>' : '';
		var uses = t.uses ? '<p class="tool-uses">' + hl(t.uses, ts) + '</p>' : '';

		var metaBits = [];
		if (isSub && t.model && t.model !== '\u2014') metaBits.push(hl(t.model, ts));
		if (t.size) metaBits.push(hl(t.size, ts));
		if (t.detail) metaBits.push(hl(t.detail, ts));
		if (t.note) metaBits.push(hl(t.note, ts));
		var meta = metaBits.length ? '<p class="tool-meta">' + metaBits.join(' \u00b7 ') + '</p>' : '';
		var tags = (t.tags && t.tags.length) ? '<p class="tool-tags">' + t.tags.map(function (g) { return '<span>' + hl(g, ts) + '</span>'; }).join('') + '</p>' : '';

		var part = /\(([^)]+)\)/.exec(t.model || '');
		var link = t.url ? '<a class="tag tag-link" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
			(t.official === false ? 'Product page' : 'Official page') + (part ? ' \u00b7 ' + esc(part[1]) : '') + '&nbsp;<span class="arr arr-ext">\u2197</span></a>' : '';

		return '<div class="tool-row' + (isSub ? ' is-sub' : '') + '" data-id="' + esc(t.id) + '">' +
			thumb(key, label) +
			'<div class="tool-body">' +
				'<h3 class="tool-name">' + head + '</h3>' +
				desc + uses + meta + tags +
				'<div class="tool-tagline">' +
					condChip(t) + (isSub ? '' : locChip(t)) +
					'<span class="tag tag-qty">\u00d7 ' + (t.qty || 0) + '</span>' + link +
				'</div>' +
			'</div>' +
		'</div>';
	}

	function kitHtml(v, ts) {
		var row = v.row, kit = row.kit;
		var label = kit.title || row.name;
		var n = row.subs.length, shownN = v.subs.length;
		var badge = '<span class="tag tag-set"><span class="tri">\u25b8</span>Set \u00b7 ' + n + ' items' +
			(shownN !== n ? ' \u00b7 ' + shownN + ' matching' : '') + '</span>';
		var uses = kit.uses ? '<p class="tool-uses">' + hl(kit.uses, ts) + '</p>' : '';
		var meta = kit.size ? '<p class="tool-meta">' + hl(kit.size, ts) + '</p>' : '';
		var tags = (kit.tags && kit.tags.length) ? '<p class="tool-tags">' + kit.tags.map(function (g) { return '<span>' + hl(g, ts) + '</span>'; }).join('') + '</p>' : '';
		var part = /\((\d{6,})\)/.exec(row.name);
		var link = kit.url ? '<a class="tag tag-link" href="' + esc(kit.url) + '" target="_blank" rel="noopener">' +
			(kit.official === false ? 'Product page' : 'Official page') + (part ? ' \u00b7 ' + esc(part[1]) : '') + '&nbsp;<span class="arr arr-ext">\u2197</span></a>' : '';

		var html = '<details class="kit"' + (v.open ? ' open' : '') + '><summary>' +
			'<div class="tool-row is-set" data-id="' + esc(kit.id) + '">' + thumb(kit.key, label) +
			'<div class="tool-body">' +
				'<h3 class="tool-name">' + heading(brandOf(row), label, ts) + '</h3>' +
				uses + meta + tags +
				'<div class="tool-tagline">' + badge + condChip(kit) + locChip(kit) +
					'<span class="tag tag-qty">\u00d7 ' + row.pieces + '</span>' + link + '</div>' +
			'</div>' +
			'</div></summary><div class="kit-items">';
		v.subs.forEach(function (s) { html += rowHtml(s.item, true, ts); });
		html += '</div></details>';
		return html;
	}
	function brandOf(row) {
		var first = row.subs[0] && row.subs[0].item;
		return first && first.brand !== '\u2014' ? first.brand : '';
	}

	function condChip(t) {
		var c = condOf(t);
		var cls = 'tag tag-cond tag-edit' + (c === DEFAULT_CONDITION ? ' is-default' : '') + ' cond-' + slug(c);
		return '<button type="button" class="' + cls + '" data-edit="condition" data-id="' + esc(t.id) + '" title="Change condition">' + esc(c) + '</button>';
	}
	function locChip(t) {
		var l = locOf(t);
		var cls = 'tag tag-loc tag-edit' + (l === DEFAULT_LOCATION ? ' is-default' : '');
		return '<button type="button" class="' + cls + '" data-edit="location" data-id="' + esc(t.id) + '" title="Change location"><span class="tag-k">At</span>' + esc(l) + '</button>';
	}
	function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

	// a thumbnail that opens the full cut-out on click; hidden if the file is missing
	function thumb(key, label) {
		if (!key) return '<span class="tool-thumb-btn is-missing"></span>';
		var src = IMG + esc(key) + '.webp';
		return '<button type="button" class="tool-thumb-btn" data-src="' + src + '" data-label="' + esc(label) + '" aria-label="Enlarge: ' + esc(label) + '">' +
			'<img class="tool-thumb" src="' + src + '" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'is-missing\')"></button>';
	}

	/* ---- helpers ---------------------------------------------------------- */
	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	// escape, then wrap matched search terms in <mark>
	function hl(s, ts) {
		var out = esc(s);
		if (!ts || !ts.length || !out) return out;
		var pat = ts.map(function (t) {
			var e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/x/g, '[x×]').replace(/-/g, '[-–—]');
			return /^[a-z0-9.]{1,3}$/.test(t) ? '(?<![a-z0-9.])' + e + '(?![a-z0-9.])' : e;
		}).join('|');
		try {
			return out.replace(new RegExp('(' + pat + ')', 'gi'), '<mark>$1</mark>');
		} catch (e) { return out; }
	}

	/* ---- editing popover -------------------------------------------------- */
	var $pop = null, popFor = null;
	function openEditor(btn) {
		var id = btn.getAttribute('data-id'), field = btn.getAttribute('data-edit');
		var t = model.byId[id];
		if (!t) return;
		closeEditor();
		popFor = btn;
		$pop = document.createElement('div');
		$pop.className = 'tool-pop';
		$pop.setAttribute('role', 'dialog');
		var inner;
		if (field === 'condition') {
			inner = '<p class="tool-pop-title">Condition</p><div class="tool-pop-opts">' + CONDITIONS.map(function (c) {
				return '<button type="button" class="tool-pop-opt' + (c === condOf(t) ? ' is-on' : '') + '" data-value="' + esc(c) + '">' + esc(c) + '</button>';
			}).join('') + '</div>';
		} else {
			inner = '<p class="tool-pop-title">Location</p>' +
				'<input class="tool-pop-input" type="text" list="tools-locations" value="' + esc(locOf(t)) + '" autocomplete="off" spellcheck="false">' +
				'<datalist id="tools-locations">' + allLocations().map(function (l) { return '<option value="' + esc(l) + '">'; }).join('') + '</datalist>' +
				'<div class="tool-pop-actions"><button type="button" class="tool-pop-save tools-send">Save&nbsp;<span class="arr">\u2192</span></button>' +
				'<button type="button" class="tool-pop-cancel">Cancel</button></div>';
		}
		$pop.innerHTML = inner + '<p class="tool-pop-note">' + (store.mode === 'local' ? 'Saved in this browser only until the KV store is set up.' : 'Saved for everyone, straight away.') + '</p>';
		btn.parentNode.insertBefore($pop, btn.nextSibling);
		$pop.addEventListener('click', function (e) {
			e.stopPropagation();
			var o = e.target.closest('.tool-pop-opt');
			if (o) { commit(id, { condition: o.getAttribute('data-value') }); return; }
			if (e.target.closest('.tool-pop-save')) { commit(id, { location: $pop.querySelector('.tool-pop-input').value.trim() || DEFAULT_LOCATION }); return; }
			if (e.target.closest('.tool-pop-cancel')) { closeEditor(); }
		});
		$pop.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { e.stopPropagation(); closeEditor(); }
			if (e.key === 'Enter' && e.target.classList.contains('tool-pop-input')) { e.preventDefault(); commit(id, { location: e.target.value.trim() || DEFAULT_LOCATION }); }
		});
		var focus = $pop.querySelector('.tool-pop-input') || $pop.querySelector('.tool-pop-opt.is-on') || $pop.querySelector('.tool-pop-opt');
		if (focus) { focus.focus(); if (focus.select) focus.select(); }
	}
	function closeEditor() {
		if ($pop && $pop.parentNode) $pop.parentNode.removeChild($pop);
		$pop = null; popFor = null;
	}
	function commit(id, patch) {
		closeEditor();
		saveState(id, patch).then(function () {
			render();
		}).catch(function (err) {
			render();
			if ($result) $result.textContent = 'Could not save: ' + err.message;
		});
	}

	/* ---- events ----------------------------------------------------------- */
	var debounce;
	function bind() {
		$q.addEventListener('input', function () {
			clearTimeout(debounce);
			debounce = setTimeout(function () {
				state.q = $q.value.trim();
				render();
			}, 90);
		});
		$q.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { $q.value = ''; state.q = ''; render(); }
		});
		$clear.addEventListener('click', function () {
			$q.value = ''; state.q = ''; render(); $q.focus();
		});
		$chips.addEventListener('click', function (e) {
			var b = e.target.closest('.tools-chip');
			if (!b) return;
			var c = b.getAttribute('data-cat') || null;
			state.cat = (c === state.cat) ? null : c;
			render();
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === '/' && document.activeElement !== $q && !e.metaKey && !e.ctrlKey && !$pop) {
				e.preventDefault(); $q.focus(); $q.select();
			}
			if (e.key === 'Escape' && $pop) closeEditor();
		});
		window.addEventListener('popstate', function () { readUrl(); $q.value = state.q; render(); });

		// capture phase: chips, thumbs, links and the editor inside a <summary> must not toggle the set
		$list.addEventListener('click', function (e) {
			var hit = e.target.closest('.tool-pop, .tag-edit, .tool-thumb-btn, a');
			if (hit && e.target.closest('summary')) e.preventDefault();
		}, true);

		$list.addEventListener('click', function (e) {
			var th = e.target.closest('.tool-thumb-btn');
			if (th) {
				e.stopPropagation();
				openZoom(th.getAttribute('data-src'), th.getAttribute('data-label'), th);
				return;
			}
			var ed = e.target.closest('.tag-edit');
			if (ed) {
				e.stopPropagation();
				if (popFor === ed) closeEditor(); else openEditor(ed);
				return;
			}
		});
		document.addEventListener('click', function (e) {
			if ($pop && !$pop.contains(e.target) && !(popFor && popFor.contains(e.target))) closeEditor();
		});
	}

	/* ---- zoom ------------------------------------------------------------- */
	var $zoom = null, zoomFrom = null;
	function openZoom(src, label, from) {
		if (!$zoom) {
			$zoom = document.createElement('div');
			$zoom.className = 'tool-zoom';
			$zoom.innerHTML = '<div class="os-win tool-zoom-win" role="dialog" aria-modal="true" aria-labelledby="tool-zoom-title" tabindex="-1">' +
				'<div class="os-titlebar"><button type="button" class="os-dot" aria-label="Close"></button><span class="os-title" id="tool-zoom-title"></span><span class="os-meta">Photo</span></div>' +
				'<div class="tool-zoom-body"><img alt=""></div></div>';
			document.body.appendChild($zoom);
			$zoom.addEventListener('click', function (e) {
				if (e.target === $zoom || e.target.closest('.os-dot')) closeZoom();
			});
			document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$zoom.hidden) closeZoom(); });
		}
		zoomFrom = from;
		$zoom.querySelector('img').src = src;
		$zoom.querySelector('img').alt = label;
		$zoom.querySelector('#tool-zoom-title').textContent = label;
		$zoom.hidden = false;
		document.body.classList.add('no-scroll');
		$zoom.querySelector('.os-win').focus();
	}
	function closeZoom() {
		$zoom.hidden = true;
		document.body.classList.remove('no-scroll');
		if (zoomFrom) zoomFrom.focus();
	}

	/* ---- url -------------------------------------------------------------- */
	function readUrl() {
		var p = new URLSearchParams(location.search);
		state.q = p.get('q') || '';
		state.cat = p.get('cat') || null;
		if (state.cat && model.cats.indexOf(state.cat) < 0) state.cat = null;
		$q.value = state.q;
	}
	function writeUrl() {
		var p = new URLSearchParams();
		if (state.q) p.set('q', state.q);
		if (state.cat) p.set('cat', state.cat);
		var qs = p.toString();
		var next = location.pathname + (qs ? '?' + qs : '');
		if (next !== location.pathname + location.search) history.replaceState(null, '', next);
	}
})();
