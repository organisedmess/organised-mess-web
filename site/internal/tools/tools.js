/*
 * organisedmess.studio — /internal/tools
 * Renders the workshop inventory from /internal/tools/data/tools.json + kits.json.
 * Search matches name, brand, model, size, detail, uses and tags. A set shows
 * collapsed when its own description matches, or open on just the matching
 * items when they do — so a connector name finds the kit, a screw size the bit.
 */
(function () {
	'use strict';

	var CATEGORY_ORDER = [
		'Screwdrivers & bits', 'Ratchets & sockets', 'Hex keys', 'Power tools',
		'Crimpers', 'Strippers', 'Cutters & shears', 'Pliers', 'Tweezers',
		'Soldering', 'Desoldering', 'Soldering aids', 'Fume extraction',
		'Workholding', 'Wire wrap', 'Testing & measuring', '3D printing', 'Laser cutting', 'Cleaning'
	];
	var UPDATED = '25 Oct 2026';
	var IMG = '/internal/tools/img/';

	var $list = document.getElementById('tools-list');
	var $stats = document.getElementById('tools-stats');
	var $chips = document.getElementById('tools-chips');
	var $q = document.getElementById('tools-q');
	var $clear = document.getElementById('tools-clear');
	var $result = document.getElementById('tools-result');

	var model = { cats: [], items: [], kits: {}, rows: [] };
	var state = { q: '', cat: null };

	Promise.all([
		fetch('/internal/tools/data/tools.json').then(function (r) { return r.json(); }),
		fetch('/internal/tools/data/kits.json').then(function (r) { return r.json(); })
	]).then(function (res) {
		build(res[0], res[1]);
		readUrl();
		render();
		bind();
	}).catch(function (err) {
		$stats.textContent = 'Could not load the inventory (' + err.message + ').';
	});

	/* ------------------------------------------------------------------ */
	function build(items, kits) {
		model.items = items;
		model.kits = kits;

		var pieces = 0, catSet = {};
		items.forEach(function (t) {
			pieces += t.qty || 0;
			catSet[t.cat] = true;
		});
		var cats = CATEGORY_ORDER.filter(function (c) { return catSet[c]; });
		Object.keys(catSet).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
		model.cats = cats;

		var kitCount = Object.keys(kits).length;
		$stats.textContent = 'Workshop inventory · ' + pieces + ' pieces · ' + items.length +
			' line items · ' + kitCount + ' sets · ' + cats.length + ' categories · Updated ' + UPDATED;

		// one "row" per loose item or per set, grouped under its category
		cats.forEach(function (cat) {
			var catItems = items.filter(function (t) { return t.cat === cat; });
			var loose = catItems.filter(function (t) { return !t.kit; });
			var kitNames = [];
			catItems.forEach(function (t) {
				if (t.kit && kitNames.indexOf(t.kit) < 0) kitNames.push(t.kit);
			});
			var rows = [];
			loose.forEach(function (t) {
				rows.push({ type: 'item', cat: cat, item: t, hay: haystack(t) });
			});
			kitNames.forEach(function (name) {
				var kit = kits[name] || {};
				var sub = catItems.filter(function (t) { return t.kit === name; });
				var subRows = sub.map(function (t) {
					return { type: 'sub', item: t, hay: haystack(t) };
				});
				rows.push({
					type: 'kit', cat: cat, name: name, kit: kit, subs: subRows,
					hay: norm([name, kit.title, kit.uses, (kit.tags || []).join(' '), kit.size].join(' ')),
					pieces: sub.reduce(function (n, t) { return n + (t.qty || 0); }, 0)
				});
			});
			model.rows.push({ cat: cat, rows: rows, pieces: catItems.reduce(function (n, t) { return n + (t.qty || 0); }, 0) });
		});
	}

	function haystack(t) {
		return norm([t.title, t.name, t.brand, t.model, t.size, t.detail, t.uses, (t.tags || []).join(' '), t.note].join(' '));
	}
	function norm(s) {
		return String(s || '').toLowerCase()
			.replace(/[×x]/g, 'x')
			.replace(/[–—]/g, '-')
			.replace(/\s+/g, ' ');
	}

	/* ------------------------------------------------------------------ */
	function terms() {
		return norm(state.q).split(' ').filter(Boolean);
	}
	// short or purely numeric terms ("8", "m3", "tx") must match a whole
	// token, otherwise "8" would light up every "80 mm" and "800 mAh"
	function termRe(t) {
		var e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp((/^[a-z0-9.]{1,3}$/.test(t) ? '(^|[^a-z0-9.])' : '') + e + (/^[a-z0-9.]{1,3}$/.test(t) ? '($|[^a-z0-9.])' : ''));
	}
	var reCache = {};
	function matches(hay, ts) {
		for (var i = 0; i < ts.length; i++) {
			var re = reCache[ts[i]] || (reCache[ts[i]] = termRe(ts[i]));
			if (!re.test(hay)) return false;
		}
		return true;
	}

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
					if (!searching || matches(row.hay, ts)) visible.push({ row: row });
				} else {
					var kitHit = !searching || matches(row.hay, ts);
					var subHits = searching ? row.subs.filter(function (s) { return matches(s.hay, ts); }) : row.subs;
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
				html += v.row.type === 'item' ? rowHtml(v.row.item, null, ts) : kitHtml(v, ts);
			});
			html += '</div></div></section>';
		});

		if (!html) {
			html = '<div class="tools-empty">Nothing matches “' + esc(state.q) + '”' +
				(state.cat ? ' in ' + esc(state.cat) : '') + '.</div>';
		}
		$list.innerHTML = html;

		// chips
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
			? (shownRows ? shownRows + (shownRows === 1 ? ' entry' : ' entries') + ' · ' + shownPieces + (shownPieces === 1 ? ' piece' : ' pieces') : 'No matches')
			: '';
		writeUrl();
	}

	function rowHtml(t, parentKit, ts) {
		var key = t.key || t.pkey;
		var label = t.title || t.name;
		var img = thumb(key, label);
		var brand = [t.brand, t.model].filter(function (s) { return s && s !== '—'; }).join(' ');
		// titled (loose) items: the title already names the product, so this line is the page link and,
		// where the model carries a part number the title dropped, that number
		var text = brand;
		if (t.title) {
			var extra = /\(([^)]+)\)/.exec(t.model || '');
			text = extra ? extra[1] : '';
		}
		var linkText = t.title ? (t.official === false ? 'Product page' : 'Official page') : hl(brand, ts);
		var link = t.url ? (text ? hl(text, ts) + ' \u00b7 ' : '') + '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + linkText + '&nbsp;<span class="arr arr-ext">\u2197</span></a>' : hl(text, ts);
		var size = t.size ? hl(t.size, ts) : '';
		var detail = t.detail ? '<span class="tool-detail">' + hl(t.detail, ts) + '</span>' : '';
		var uses = t.uses ? hl(t.uses, ts) : '';
		var tags = (t.tags && t.tags.length) ? '<span class="tool-tags">' + t.tags.map(function (g) { return '<span>' + hl(g, ts) + '</span>'; }).join('') + '</span>' : '';
		var note = t.note ? '<span class="tool-detail">' + hl(t.note, ts) + '</span>' : '';

		var desc = t.title ? '<span class="tool-desc">' + hl(t.name, ts) + '</span>' : '';
		return '<div class="tool-row">' + img +
			'<div class="tool-main"><p class="tool-name">' + hl(label, ts) + '</p>' + desc + '<span class="tool-brand">' + link + '</span></div>' +
			'<div class="tool-sizecol"><span class="tool-size">' + size + '</span>' + detail + note + '</div>' +
			'<div class="tool-usescol"><span class="tool-uses">' + uses + '</span>' + tags + '</div>' +
			'<span class="tool-qty">' + (t.qty || 0) + '</span>' +
			'</div>';
	}

	function kitHtml(v, ts) {
		var row = v.row, kit = row.kit;
		var label = kit.title || row.name;
		var img = thumb(kit.key, label);
		var link = kit.url ? '<a href="' + esc(kit.url) + '" target="_blank" rel="noopener">' + (kit.official === false ? 'Product page' : 'Official page') + '&nbsp;<span class="arr arr-ext">↗</span></a>' : '';
		var tags = (kit.tags && kit.tags.length) ? '<span class="tool-tags">' + kit.tags.map(function (g) { return '<span>' + hl(g, ts) + '</span>'; }).join('') + '</span>' : '';
		var n = row.subs.length;
		var shownN = v.subs.length;
		var badge = '<span class="kit-badge"><span class="tri">▸</span>Set · ' + n + ' items' +
			(shownN !== n ? ' · ' + shownN + ' matching' : '') + '</span>';

		var html = '<details class="kit"' + (v.open ? ' open' : '') + '><summary>' +
			'<div class="tool-row">' + img +
			'<div class="tool-main"><p class="tool-name">' + hl(label, ts) + '</p>' + badge + (link ? '<span class="tool-brand">' + link + '</span>' : '') + '</div>' +
			'<div class="tool-sizecol"><span class="tool-size">' + hl(kit.size || '', ts) + '</span></div>' +
			'<div class="tool-usescol"><span class="tool-uses">' + hl(kit.uses || '', ts) + '</span>' + tags + '</div>' +
			'<span class="tool-qty">' + row.pieces + '</span>' +
			'</div></summary><div class="kit-items">';
		v.subs.forEach(function (s) { html += rowHtml(s.item, kit, ts); });
		html += '</div></details>';
		return html;
	}

	// a thumbnail that opens the full cut-out on click; hidden if the file is missing
	function thumb(key, label) {
		if (!key) return '<span class="tool-thumb is-missing"></span>';
		var src = IMG + esc(key) + '.webp';
		return '<button type="button" class="tool-thumb-btn" data-src="' + src + '" data-label="' + esc(label) + '" aria-label="Enlarge: ' + esc(label) + '">' +
			'<img class="tool-thumb" src="' + src + '" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'is-missing\')"></button>';
	}

	/* ------------------------------------------------------------------ */
	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	// escape, then wrap matched search terms in <mark>
	function hl(s, ts) {
		var out = esc(s);
		if (!ts.length || !out) return out;
		var pat = ts.map(function (t) {
			// a term typed as "x" should also light up "×"
			var e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/x/g, '[x×]').replace(/-/g, '[-–—]');
			return /^[a-z0-9.]{1,3}$/.test(t) ? '(?<![a-z0-9.])' + e + '(?![a-z0-9.])' : e;
		}).join('|');
		try {
			return out.replace(new RegExp('(' + pat + ')', 'gi'), '<mark>$1</mark>');
		} catch (e) { return out; }
	}

	/* ------------------------------------------------------------------ */
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
		// "/" focuses search from anywhere, like a proper tool
		document.addEventListener('keydown', function (e) {
			if (e.key === '/' && document.activeElement !== $q && !e.metaKey && !e.ctrlKey) {
				e.preventDefault(); $q.focus(); $q.select();
			}
		});
		window.addEventListener('popstate', function () { readUrl(); $q.value = state.q; render(); });

		// enlarge a photo in a small window; Escape, the dot or a click outside closes it
		$list.addEventListener('click', function (e) {
			var b = e.target.closest('.tool-thumb-btn');
			if (!b) return;
			e.preventDefault(); e.stopPropagation();
			openZoom(b.getAttribute('data-src'), b.getAttribute('data-label'), b);
		});
	}

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
