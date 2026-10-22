/* organisedmess.studio — site runtime
 *
 * Re-implements the two bits of Cargo's frontend the design depends on:
 *   1. The viewport-relative base unit (--base-size) and the "mobile"
 *      layout class, so rem-based type scales exactly as it did on Cargo.
 *   2. The Capabilities overlay: opened by rel="history" links, closed by
 *      rel="close-overlay" links, Escape, clicking outside the panel, or the
 *      browser back button. URL is kept in sync (/capabilities).
 */
(function () {
	'use strict';

	var html = document.documentElement;
	var body = document.body;

	/* ------------------------------------------------------------------
	   1. Base unit + mobile class (ported from Cargo's window-info logic)
	   ------------------------------------------------------------------ */
	var portraitMQ = window.matchMedia('(max-aspect-ratio: 4/5)');
	var landscapeMQ = window.matchMedia('(min-aspect-ratio: 2/3) and (max-height: 500px)');
	var lastBase = null;

	function isMobile() {
		return portraitMQ.matches || landscapeMQ.matches;
	}

	function getBaseUnit(width, height, weight, min) {
		var i = width < height ? width : height;
		i = i / (100 / weight);
		if (i < min) i = min;
		return i;
	}

	function applyWindowInfo() {
		var w = html.clientWidth;
		var h = window.innerHeight;
		var mobile = isMobile();
		var portrait = portraitMQ.matches;

		// Cargo measures the largest viewport height (100lvh); innerHeight is
		// close enough on desktop and matches once mobile chrome collapses.
		var maxH = h;

		var l = 0;
		var c = 5;
		var f = 9;
		if (maxH > w) l = maxH / w - 1;
		l = l / 0.777777778;
		if (l > 1) l = 1;
		if (mobile && !portrait) f = 18;

		var base = getBaseUnit(w, maxH, f + c * l, 20);

		if (base !== lastBase) {
			html.style.setProperty('--base-size', (base * 0.16) + 'px');
			lastBase = base;
		}
		html.style.setProperty('--viewport-height', h + 'px');
		html.style.setProperty('--min-viewport-height', h + 'px');

		html.classList.toggle('mobile', mobile);
		body.classList.toggle('mobile', mobile);

		// backdrop width tracks the page box (used by .clip > .backdrop-contents)
		var backdrops = document.querySelectorAll('.backdrop');
		for (var i = 0; i < backdrops.length; i++) {
			var page = backdrops[i].parentElement;
			backdrops[i].parentElement.querySelector('.backdrop-contents')
				.style.setProperty('--backdrop-width', page.clientWidth + 'px');
		}

		// pinned footer height → home page bottom padding, so text never sits under it
		var footer = document.querySelector('.page-footer');
		if (footer) {
			html.style.setProperty('--footer-height', footer.offsetHeight + 'px');
		}

		fitIntro();
	}

	/* Shrink the home intro (down to a floor) until it clears the fixed footer
	   in the first viewport, so no breakpoint leaves the text under the button. */
	var introScale = 1;
	function fitIntro() {
		var intro = document.querySelector('.hero') || document.querySelector('.intro');
		var content = document.querySelector('.page-home .page-content');
		var footer = document.querySelector('.page-footer');
		if (!intro || !content) return;
		var FLOOR = 0.6;
		var footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;
		var heroTop = intro.getBoundingClientRect().top + window.scrollY;
		var available = footerTop - heroTop - parseFloat(getComputedStyle(content).paddingLeft); // breathing room above the footer
		var scale = 1;
		html.style.setProperty('--intro-scale', '1');
		var h = intro.getBoundingClientRect().height;
		if (h > available) {
			scale = Math.max(FLOOR, available / h);
			html.style.setProperty('--intro-scale', scale.toFixed(3));
			// line wrapping changes with size; one more pass tightens the estimate
			h = intro.getBoundingClientRect().height;
			if (h > available) {
				scale = Math.max(FLOOR, scale * (available / h));
				html.style.setProperty('--intro-scale', scale.toFixed(3));
			}
		}
		introScale = scale;
	}

	applyWindowInfo();
	window.addEventListener('resize', applyWindowInfo, { passive: true });
	portraitMQ.addEventListener('change', applyWindowInfo);
	landscapeMQ.addEventListener('change', applyWindowInfo);
	if (document.fonts && document.fonts.ready) {
		document.fonts.ready.then(applyWindowInfo);
	}

	/* ------------------------------------------------------------------
	   1b. Widows / orphans
	   CSS `text-wrap: pretty` handles this natively where supported. For
	   other browsers, glue the last two words of each text block with a
	   non-breaking space ("widont"), and keep short bracketed/em-dash
	   fragments from stranding on their own line.
	   ------------------------------------------------------------------ */
	function fixWidows() {
		var supportsPretty = window.CSS && CSS.supports && CSS.supports('text-wrap', 'pretty');
		var blocks = document.querySelectorAll('p, h1 .para, h2, h3, .hero-cta, .footer-note, .copyright');
		for (var i = 0; i < blocks.length; i++) {
			var el = blocks[i];
			if (el.dataset.widont) continue;
			el.dataset.widont = '1';
			if (supportsPretty) continue;

			// walk text nodes from the end; glue the last space in the block
			var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
			var nodes = [];
			while (walker.nextNode()) nodes.push(walker.currentNode);
			var words = el.textContent.trim().split(/\s+/);
			if (words.length < 4) continue;
			for (var n = nodes.length - 1; n >= 0; n--) {
				var t = nodes[n].nodeValue;
				var idx = t.replace(/\s+$/, '').lastIndexOf(' ');
				if (idx > 0) {
					nodes[n].nodeValue = t.slice(0, idx) + ' ' + t.slice(idx + 1);
					break;
				}
			}
		}
		// em dashes: keep "word — word" from breaking before the dash
		if (!supportsPretty) {
			var dashNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
			while (dashNodes.nextNode()) {
				var tn = dashNodes.currentNode;
				if (tn.nodeValue.indexOf(' — ') > -1) {
					tn.nodeValue = tn.nodeValue.replace(/ — /g, ' — ');
				}
			}
		}
	}
	fixWidows();

	/* ------------------------------------------------------------------
	   2. Capabilities navigation
	   Two modes, chosen by <body data-nav="page|overlay"> (or ?nav=... to
	   try the other one):
	     page    — Capabilities is a full-width section below the hero;
	               links scroll to it, the URL updates to /capabilities.
	     overlay — Capabilities slides in as a panel over the blurred home.
	   ------------------------------------------------------------------ */
	var overlay = document.getElementById('overlay-capabilities');
	var overlayUrl = overlay ? overlay.getAttribute('data-url') : '/capabilities';
	var params = new URLSearchParams(location.search);
	var navMode = params.get('nav') || body.getAttribute('data-nav') || 'page';
	body.setAttribute('data-nav', navMode);
	var pushedState = false;
	// <body data-routing="off"> keeps the overlay working without touching the URL (previews, artifacts)
	var routing = body.getAttribute('data-routing') !== 'off';

	function normalisePath(p) {
		p = p.replace(/\/+$/, '');
		return p === '' ? '/' : p;
	}
	function keepQuery(path) {
		return path + (location.search || '');
	}

	/* ---- overlay mode ---- */
	function endAnimation(cb) {
		var done = false;
		function finish() {
			if (done) return;
			done = true;
			overlay.classList.remove('overlay-animating', 'overlay-open', 'overlay-close');
			if (cb) cb();
		}
		overlay.querySelector('.page').addEventListener('animationend', finish, { once: true });
		setTimeout(finish, 400);
	}
	function openOverlay(animate, pushHistory) {
		if (!overlay || overlay.classList.contains('is-open')) return;
		overlay.hidden = false;
		overlay.classList.add('is-open');
		body.classList.add('no-scroll', 'overlay-is-open');
		overlay.scrollTop = 0;
		overlay.classList.remove('rows-in');
		void overlay.offsetWidth; // flush the removal so the transition restarts
		setTimeout(function () { overlay.classList.add('rows-in'); }, 40);
		if (routing && pushHistory && normalisePath(location.pathname) !== overlayUrl) {
			history.pushState({ overlay: overlayUrl }, '', keepQuery(overlayUrl));
			pushedState = true;
		}
		if (animate) {
			overlay.classList.add('overlay-animating', 'overlay-open');
			endAnimation();
		}
	}
	function closeOverlay(animate, popHistory) {
		if (!overlay || !overlay.classList.contains('is-open')) return;
		overlay.classList.remove('is-open');
		var finish = function () {
			overlay.hidden = true;
			body.classList.remove('no-scroll');
		};
		body.classList.remove('overlay-is-open');
		if (animate) {
			overlay.classList.add('overlay-animating', 'overlay-close');
			endAnimation(finish);
		} else {
			finish();
		}
		if (popHistory) {
			if (pushedState) { pushedState = false; history.back(); }
			else if (normalisePath(location.pathname) === overlayUrl) history.replaceState({}, '', keepQuery('/'));
		}
	}

	/* ---- page mode ---- */
	var section = document.getElementById('capabilities');
	var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	function scrollToSection(smooth) {
		section.scrollIntoView({ behavior: smooth && !reduced ? 'smooth' : 'auto', block: 'start' });
	}
	function scrollToTop(smooth) {
		window.scrollTo({ top: 0, behavior: smooth && !reduced ? 'smooth' : 'auto' });
	}
	function openPage(smooth, pushHistory) {
		scrollToSection(smooth);
		if (pushHistory && normalisePath(location.pathname) !== overlayUrl) {
			history.pushState({ section: overlayUrl }, '', keepQuery(overlayUrl));
			pushedState = true;
		}
	}
	function closePage(smooth, popHistory) {
		scrollToTop(smooth);
		if (popHistory) {
			if (pushedState) { pushedState = false; history.back(); }
			else if (normalisePath(location.pathname) === overlayUrl) history.replaceState({}, '', keepQuery('/'));
		}
	}
	// in page mode, keep the URL honest as the user scrolls
	function watchSection() {
		if (!('IntersectionObserver' in window)) return;
		var io = new IntersectionObserver(function (entries) {
			var inView = entries[0].isIntersecting;
			var at = normalisePath(location.pathname) === overlayUrl;
			if (inView && !at) history.replaceState({ section: overlayUrl }, '', keepQuery(overlayUrl));
			if (!inView && at) history.replaceState({}, '', keepQuery('/'));
		}, { rootMargin: '-45% 0px -45% 0px' });
		io.observe(section);
	}

	var open  = navMode === 'overlay' ? openOverlay  : openPage;
	var close = navMode === 'overlay' ? closeOverlay : closePage;

	if (navMode === 'page' && overlay) {
		overlay.hidden = false;
		watchSection();
		var footerEl = document.querySelector('.page-footer');
		var onScroll = function () {
			var top = section.getBoundingClientRect().top;
			var fh = footerEl ? footerEl.offsetHeight : 0;
			body.classList.toggle('over-capabilities', top < window.innerHeight - fh);
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		onScroll();
	}

	document.addEventListener('click', function (e) {
		var a = e.target.closest ? e.target.closest('a') : null;
		if (!a) return;
		var rel = a.getAttribute('rel');
		var href = a.getAttribute('href') || '';
		if (rel === 'history' && normalisePath(href) === overlayUrl) {
			e.preventDefault();
			open(true, true);
		} else if (rel === 'close-overlay') {
			e.preventDefault();
			close(true, true);
		}
	});

	if (navMode === 'overlay' && overlay) {
		overlay.addEventListener('click', function (e) {
			if (!e.target.closest('.page-content') && !e.target.closest('.os-win')) closeOverlay(true, true);
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') closeOverlay(true, true);
		});
	}

	window.addEventListener('popstate', function () {
		var at = normalisePath(location.pathname) === overlayUrl;
		pushedState = false;
		if (at) open(true, false); else close(true, false);
	});

	// initial route (served by _redirects: /capabilities -> /index.html)
	if (history.scrollRestoration) history.scrollRestoration = 'manual';
	if (routing && normalisePath(location.pathname) === overlayUrl) {
		open(false, false);
	}


	/* ------------------------------------------------------------------
	   4. Windows — a title bar + close dot + drag, shared with OS mode.
	   <body data-caps="window"> (default) opens Capabilities as a window.
	   ------------------------------------------------------------------ */
	var zTop = 10;
	function raise(win) { win.style.zIndex = ++zTop; }
	function makeDraggable(win, handle) {
		var sx, sy, ox, oy, dragging = false;
		handle.addEventListener('pointerdown', function (e) {
			if (e.target.closest('.os-dot')) return;
			dragging = true; sx = e.clientX; sy = e.clientY;
			var m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(win.style.transform || '');
			ox = m ? parseFloat(m[1]) : 0; oy = m ? parseFloat(m[2]) : 0;
			win.classList.add('is-dragging'); raise(win);
			handle.setPointerCapture(e.pointerId);
		});
		handle.addEventListener('pointermove', function (e) {
			if (!dragging) return;
			win.style.transform = 'translate(' + (ox + e.clientX - sx) + 'px, ' + (oy + e.clientY - sy) + 'px)';
		});
		function up() { dragging = false; win.classList.remove('is-dragging'); }
		handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
		win.addEventListener('pointerdown', function () { raise(win); });
	}
	function windowify(el, title, opts) {
		opts = opts || {};
		var win = document.createElement('div');
		win.className = 'os-win ' + (opts.cls || '');
		var tb = document.createElement('div');
		tb.className = 'os-titlebar';
		tb.innerHTML = '<span class="os-dot" role="button" tabindex="0" aria-label="Close"></span><span class="os-title">' + title + '</span><span class="os-meta">' + (opts.meta || '') + '</span>';
		el.parentNode.insertBefore(win, el);
		win.appendChild(tb);
		win.appendChild(el);
		makeDraggable(win, tb);
		if (opts.onClose) {
			var dot = tb.querySelector('.os-dot');
			dot.addEventListener('click', opts.onClose);
			dot.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClose(); } });
		}
		return win;
	}
	window.OM = window.OM || {};
	window.OM.windowify = windowify; window.OM.makeDraggable = makeDraggable;

	var capsMode = params.get('caps') || body.getAttribute('data-caps') || 'window';
	if (capsMode === 'window' && navMode === 'overlay' && overlay) {
		body.classList.add('caps-window');
		var capsPanel = overlay.querySelector('.page-capabilities .page-content');
		if (capsPanel) {
			var capsWin = windowify(capsPanel, 'Capabilities', { cls: 'os-win-caps', meta: 'Index (3)', onClose: function () { closeOverlay(true, true); } });
			// reset drag offset each time it opens
			overlay.addEventListener('transitionend', function () {}, { once: true });
			capsWin.setAttribute('tabindex', '-1');
			capsWin.setAttribute('role', 'dialog'); capsWin.setAttribute('aria-modal', 'true');
			var ttl = capsWin.querySelector('.os-title'); if (ttl) { ttl.id = 'caps-title'; capsWin.setAttribute('aria-labelledby', 'caps-title'); }
			var meta = capsWin.querySelector('.os-meta'); if (meta) meta.setAttribute('aria-hidden', 'true');
			var behind = [document.querySelector('main'), document.getElementById('header'), document.getElementById('footer')];
			var origOpen = openOverlay, origClose = closeOverlay, opener = null;
			openOverlay = function (a, b) {
				capsWin.style.transform = '';
				opener = document.activeElement;
				origOpen(a, b);
				behind.forEach(function (el) { if (el) el.inert = true; });
				// keyboard: focus lands in the window so Tab moves through its links; Escape still closes
				setTimeout(function () { if (!overlay.hidden) capsWin.focus({ preventScroll: true }); }, 60);
			};
			closeOverlay = function (a, b) {
				origClose(a, b);
				behind.forEach(function (el) { if (el) el.inert = false; });
				if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
				opener = null;
			};
			// focus trap: Tab cycles within the window
			capsWin.addEventListener('keydown', function (e) {
				if (e.key !== 'Tab') return;
				var f = Array.prototype.filter.call(capsWin.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])'), function (el) { return el.offsetParent !== null; });
				if (!f.length) return;
				var first = f[0], last = f[f.length - 1];
				if (e.shiftKey && (document.activeElement === first || document.activeElement === capsWin)) { e.preventDefault(); last.focus(); }
				else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
			});
			open = openOverlay; close = closeOverlay;
		}
	}

	/* ------------------------------------------------------------------
	   3. Studio clock — local time in Singapore and whether the studio
	   is open. Hours are per weekday (0 = Sunday), 24h, in STUDIO_TZ.
	   ------------------------------------------------------------------ */
	var STUDIO_TZ = 'Asia/Singapore';
	var STUDIO_HOURS = {
		1: [9, 19], 2: [9, 19], 3: [9, 19], 4: [9, 19], 5: [9, 19]
		// 0 (Sun) and 6 (Sat): closed
	};
	var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	function studioNow() {
		var parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: STUDIO_TZ, hour12: false, weekday: 'short',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		}).formatToParts(new Date());
		var get = function (t) { var p = parts.find(function (x) { return x.type === t; }); return p ? p.value : ''; };
		var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
		var hh = parseInt(get('hour'), 10) % 24, mm = parseInt(get('minute'), 10), ss = parseInt(get('second'), 10);
		return { day: wd, h: hh, m: mm, s: ss, t: hh + mm / 60 };
	}
	function nextOpening(now) {
		for (var i = 0; i < 8; i++) {
			var d = (now.day + i) % 7;
			var hrs = STUDIO_HOURS[d];
			if (!hrs) continue;
			if (i === 0 && now.t >= hrs[0]) continue;
			var when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : 'on ' + DAY_NAMES[d];
			return when + ' at ' + pad(hrs[0]) + ':00';
		}
		return '';
	}
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	// Singapore is UTC+8 with no daylight saving, so the next opening instant can be built directly
	var STUDIO_UTC_OFFSET = 8;
	function nextOpeningInstant() {
		var now = studioNow(), base = new Date();
		for (var i = 0; i < 8; i++) {
			var d = (now.day + i) % 7, hrs = STUDIO_HOURS[d];
			if (!hrs) continue;
			if (i === 0 && now.t >= hrs[0]) continue;
			// the Singapore calendar date i days from now
			var parts = new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
				.formatToParts(new Date(base.getTime() + i * 86400000));
			var g = function (t) { return parseInt(parts.find(function (x) { return x.type === t; }).value, 10); };
			return new Date(Date.UTC(g('year'), g('month') - 1, g('day'), hrs[0] - STUDIO_UTC_OFFSET, 0, 0));
		}
		return null;
	}
	// "09:00 tomorrow" in the visitor's clock; adds "your time" when that differs from Singapore's
	function nextOpeningLocal() {
		var at = nextOpeningInstant();
		if (!at) return '';
		var time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at).replace(/^24/, '00');
		var dayKey = function (d) { return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate(); };
		var today = new Date(), tomorrow = new Date(today.getTime() + 86400000);
		var when = dayKey(at) === dayKey(today) ? 'today' : dayKey(at) === dayKey(tomorrow) ? 'tomorrow' : 'on ' + DAY_NAMES[at.getDay()];
		var sameClock = -new Date().getTimezoneOffset() === STUDIO_UTC_OFFSET * 60;
		return time + ' ' + when + (sameClock ? '' : ', your time');
	}

	function tickClock() {
		var el = document.querySelector('.studio-status');
		if (!el) return;
		var now = studioNow();
		var hrs = STUDIO_HOURS[now.day];
		var isOpen = !!hrs && now.t >= hrs[0] && now.t < hrs[1];
		var compact = html.classList.contains('mobile');
		var status = isOpen
			? (compact ? 'Open · Singapore' : 'Studio open · Singapore')
			: compact ? 'Closed · ' + nextOpeningLocal() : 'Studio closed · opens ' + nextOpeningLocal();   // visitor's clock, like the notice
		el.querySelector('.studio-state').textContent = status;
		el.classList.toggle('is-open', isOpen);

		// filled arc = progress through today's studio hours (empty when closed)
		var frac = isOpen ? (now.t - hrs[0]) / (hrs[1] - hrs[0]) : 0;
		el.querySelector('.dot-day').setAttribute('d', arcPath(12, 12, 11, frac));
	}
	function arcPath(cx, cy, r, frac) {
		if (frac <= 0) return '';
		if (frac >= 0.9999) return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 1 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 1 ' + (-2 * r) + ' 0Z';
		var a = frac * Math.PI * 2 - Math.PI / 2;
		var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
		return 'M' + cx + ' ' + cy + 'L' + cx + ' ' + (cy - r) + 'A' + r + ' ' + r + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + 'Z';
	}
	tickClock();
	setInterval(tickClock, 1000);

	/* ------------------------------------------------------------------
	   3b. Lights off — outside studio hours the site loads dimmed (dark
	   palette, backdrop slowed and darkened). The first click, key press,
	   scroll or tap turns the lights on for the rest of the session.
	   ?lights=off forces it for testing; ?lights=on disables it.
	   ------------------------------------------------------------------ */
	(function lights() {
		var force = params.get('lights');
		var now = studioNow();
		var hrs = STUDIO_HOURS[now.day];
		var isOpen = !!hrs && now.t >= hrs[0] && now.t < hrs[1];
		var woken = false;
		try { woken = sessionStorage.getItem('om-lights') === 'on'; } catch (e) {}
		var off = force === 'off' || (force !== 'on' && !isOpen && !woken);
		if (!off) return;

		html.classList.add('lights-off');
		var inst = window.Backdrop && window.Backdrop.instances[0];
		if (inst) { inst.setSpeedScale(0.35); inst.settings.mouse_interaction = false; }   // no lens while closed
		// say so in the middle of the dark sheet, immediately — otherwise it reads as a broken page
		var notice = document.querySelector('.lights-notice');
		if (notice) {
			// visitors on another clock get told why the lights are off; locals just get the hours
			var overseas = -new Date().getTimezoneOffset() !== STUDIO_UTC_OFFSET * 60;
			if (overseas) {
				notice.querySelector('.lights-l1').textContent = 'We noticed you\u2019re visiting from overseas.';
				notice.querySelector('.lights-l2').innerHTML = 'The studio keeps Singapore hours \u2014 come back at <span class="lights-when"></span>,';
				notice.querySelector('.lights-action').textContent = 'come in now';
			}
			notice.querySelector('.lights-when').textContent = nextOpeningLocal();
			notice.hidden = false;
		}

		var events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
		var travel = 0, lastX = null, lastY = null;
		function onMove(e) {
			if (e.pointerType === 'touch') return;
			if (lastX !== null) travel += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
			lastX = e.clientX; lastY = e.clientY;
			if (travel > 12) wake();
		}
		function wake() {
			events.forEach(function (ev) { window.removeEventListener(ev, wake); });
			window.removeEventListener('pointermove', onMove);
			html.classList.add('lights-waking');
			html.classList.remove('lights-off');
			if (notice) setTimeout(function () { notice.hidden = true; }, 1000);
			if (inst) { inst.setSpeedScale(1); inst.settings.mouse_interaction = true; }
			try { sessionStorage.setItem('om-lights', 'on'); } catch (e) {}
			setTimeout(function () { html.classList.remove('lights-waking'); }, 1600);
		}
		// let the page settle before listening, so a scroll restore doesn't count
		setTimeout(function () {
			events.forEach(function (ev) { window.addEventListener(ev, wake, { passive: true }); });
			window.addEventListener('pointermove', onMove, { passive: true });   // a mouse moving is enough
		}, 300);
	})();

	/* ------------------------------------------------------------------
	   4b. Contact form — posts to /api/contact (worker.js) without leaving
	   the window; falls back to a plain POST without JS.
	   ------------------------------------------------------------------ */
	(function contact() {
		var form = document.querySelector('.contact-form');
		if (!form) return;
		var status = form.querySelector('.contact-status'), send = form.querySelector('.contact-send'), done = document.querySelector('.contact-done');
		var stamp = form.querySelector('input[name="t"]');
		if (stamp) stamp.value = String(Date.now());
		function say(msg, err) { status.textContent = msg; status.classList.toggle('is-error', !!err); }
		// Turnstile loads only once the form is in view; invisible unless Cloudflare needs a challenge
		var tsEl = form.querySelector('.turnstile'), tsLoaded = false, widget = null;
		function loadTurnstile() {
			if (tsLoaded || !tsEl) return; tsLoaded = true;
			window.omTurnstile = function () {
				try { widget = window.turnstile.render(tsEl, { sitekey: tsEl.dataset.sitekey, appearance: 'interaction-only', theme: 'light', size: 'flexible' }); } catch (e) {}
			};
			var s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=omTurnstile&render=explicit'; s.async = true; s.defer = true;
			s.onerror = function () { tsLoaded = false; };   // blocked: don't hold the send up for a token that will never come
			document.head.appendChild(s);
		}
		if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es.some(function (x) { return x.isIntersecting; })) { loadTurnstile(); io.disconnect(); } }); io.observe(form); }
		form.addEventListener('focusin', loadTurnstile, { once: true });
		function token() { try { return widget !== null ? window.turnstile.getResponse(widget) : ''; } catch (e) { return ''; } }
		// the token can take a moment after the widget renders; wait up to five seconds for it
		function withToken(cb) {
			if (!tsLoaded || token()) return cb();
			var waited = 0, iv = setInterval(function () { waited += 250; if (token() || waited >= 5000) { clearInterval(iv); cb(); } }, 250);
		}
		function finish() { form.hidden = true; done.hidden = false; done.focus(); }
		if (params.get('sent') === '1') finish();   // the no-JS path lands back here
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			if (!form.checkValidity()) { say('Please fill in your name, email and a message.', true); var bad = form.querySelector(':invalid'); if (bad) bad.focus(); return; }
			say('Sending…'); send.disabled = true;
			withToken(function () {
			var body = {};
			new FormData(form).forEach(function (v, k) { body[k] = v; });
			fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
				.then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
				.then(function (res) {
					if (res.ok) { finish(); return; }
					say((res.j && res.j.error) || 'That didn’t send. Please try again, or write to hello@organisedmess.studio.', true); send.disabled = false;
				})
				.catch(function () { say('That didn’t send. Please try again, or write to hello@organisedmess.studio.', true); send.disabled = false; });
			});
		});
	})();

	// links are not draggable: a native drag shows the OS cursor and strands the custom one
	document.addEventListener('dragstart', function (e) { if (e.target.closest && e.target.closest('a, img')) e.preventDefault(); });

	/* ------------------------------------------------------------------
	   5. Load reveal — hero lines rise in, strips fade in, once.
	   ------------------------------------------------------------------ */
	(function reveal() {
		var hero = document.querySelector('.reveal');
		function go() {
			requestAnimationFrame(function () {
				if (hero) hero.classList.add('is-in');
				body.classList.add('strips-in');
			});
		}
		if (document.fonts && document.fonts.ready) {
			document.fonts.ready.then(go);
			setTimeout(go, 1200); // never hold the page hostage to a font
		} else {
			go();
		}
	})();

	/* ---- cursor ------------------------------------------------------------ */
	(function cursor() {
		var el = document.querySelector('.cursor');
		if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
		var x = -100, y = -100, tx = x, ty = y, raf = null, shown = false;
		// no smoothing: the ring sits exactly where the pointer is, independent of the render frame rate
		function tick() {
			x = tx; y = ty;
			el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
			raf = null;
		}
		function show(cx, cy) { if (!shown) { x = cx; y = cy; shown = true; document.documentElement.classList.add('has-cursor'); } }
		function hide() { document.documentElement.classList.remove('has-cursor'); shown = false; }
		function move(e) {
			if (e.pointerType === 'touch') { hide(); return; }
			tx = e.clientX; ty = e.clientY;
			show(tx, ty);
			var t = e.target && e.target.closest && e.target.closest('a, button, [role="button"], .os-titlebar, .os-dot');
			el.classList.toggle('is-link', !!t);
			tick();
		}
		// capture phase + document, so elements that stop propagation (menus, drag handles) can't lose the cursor
		document.addEventListener('pointermove', move, { capture: true, passive: true });
		document.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'touch') { el.classList.add('is-down'); move(e); } }, { capture: true, passive: true });
		document.addEventListener('pointerup', function () { el.classList.remove('is-down'); }, { capture: true, passive: true });
		document.addEventListener('pointercancel', function () { el.classList.remove('is-down'); }, { capture: true, passive: true });
		// leaving the window hides it; coming back shows it on the first move
		document.addEventListener('mouseleave', hide);
		document.documentElement.addEventListener('mouseleave', hide);
		window.addEventListener('blur', hide);
		window.addEventListener('mouseout', function (e) { if (!e.relatedTarget && !e.toElement) hide(); });
	})();

	/* ---- system pill ------------------------------------------------------- */
	(function systemPill() {
		var pill = document.getElementById('system-pill');
		if (!pill || !window.Backdrop) return;
		var btn = pill.querySelector('.system-btn'), menu = pill.querySelector('.system-menu'), nameEl = pill.querySelector('.system-name');
		var inst = function () { var b = window.Backdrop.instances[0]; return b && b.ready ? b : null; };
		function render() {
			if (!inst()) { nameEl.textContent = 'Static'; btn.disabled = true; document.documentElement.classList.add('no-webgl'); return; }
			document.documentElement.classList.remove('no-webgl'); btn.disabled = false;
			var cur = inst().mode;
			nameEl.textContent = window.Backdrop.names[cur] || cur;
			menu.innerHTML = '';
			window.Backdrop.modes.forEach(function (m) {
				var li = document.createElement('li');
				var b = document.createElement('button');
				li.setAttribute('role', 'none');
				b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', m === cur ? 'true' : 'false'); b.dataset.mode = m;
				b.setAttribute('aria-describedby', 'system-desc');
				b.innerHTML = '<span>' + window.Backdrop.names[m] + '</span><span class="system-key" aria-hidden="true">' + m + '</span>';
				li.appendChild(b); menu.appendChild(li);
			});
			var d = document.createElement('li'); d.className = 'system-desc'; d.setAttribute('role', 'none'); d.id = 'system-desc';
			menu.appendChild(d); describe(cur);
		}
		var descEl = function () { return menu.querySelector('.system-desc'); };
		function describe(m) { var d = descEl(); if (d) d.textContent = (window.Backdrop.descriptions || {})[m] || ''; }
		menu.addEventListener('mouseover', function (e) { var b = e.target.closest('button[data-mode]'); if (b) describe(b.dataset.mode); });
		menu.addEventListener('focusin', function (e) { var b = e.target.closest('button[data-mode]'); if (b) describe(b.dataset.mode); });
		menu.addEventListener('mouseleave', function () { if (inst()) describe(inst().mode); });
		function toggle(force) {
			var open = typeof force === 'boolean' ? force : menu.hidden;
			menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			if (open) { var sel = menu.querySelector('[aria-checked="true"]'); if (sel) sel.focus(); }
		}
		render();
		document.addEventListener('backdropchange', render);
		btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
		menu.addEventListener('click', function (e) {
			var b = e.target.closest('button[data-mode]'); if (!b) return;
			e.stopPropagation();
			if (inst()) inst().setMode(b.dataset.mode);
			toggle(false); btn.focus();
		});
		document.addEventListener('click', function () { toggle(false); });
		document.addEventListener('keydown', function (e) {
			if (menu.hidden) return;
			if (e.key === 'Escape') { toggle(false); btn.focus(); }
			var items = Array.prototype.slice.call(menu.querySelectorAll('button'));
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				var i = items.indexOf(document.activeElement);
				items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
			}
			if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
			if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
		});
		// the backdrop may only be ready after this script; retry once it is
		if (!inst()) setTimeout(render, 300);
		if (!inst()) setTimeout(render, 1500);
	})();
})();
