// organisedmess.studio — tiny Worker in front of the static assets.
//  · serves the Capabilities deep link (the page, not a redirect)
//  · receives the contact form at POST /api/contact and emails it on
//  · gates /internal/* (tools inventory and whatever else goes behind the wall) behind a login
//  · marks the workers.dev staging host noindex
// Everything else passes straight through to the static assets.
//
// Internal login (auth.js):
//  · people with their own name and password (salted PBKDF2 in TOOLS_KV), each signed-in device a revocable
//    session, a log of sign-ins; owners manage people at /internal/account/people. INTERNAL_USER / INTERNAL_PASSWORD
//    only sign in the very first owner. Optional INTERNAL_SECRET adds entropy to the cookie key.
//  · wrangler.jsonc lists /internal* in run_worker_first — otherwise the static files under /internal
//    would be served straight from the asset cache without ever reaching this check.
//  · anything added under site/internal/ is covered; add a row to site/internal/index.html to list it.
//  · optional secret AGENT_TOKEN (32+ characters): lets an agent call the admin API with a bearer token; see internal().
//  · /internal/admin/* is handed, after the same login, to the private admin Worker (service binding ADMIN,
//    see wrangler.jsonc). That Worker has no public address; its code and data live in a separate private repo.
//  · /internal/tools/api/state keeps each tool's location + condition in KV (binding TOOLS_KV,
//    see wrangler.jsonc). Without the binding the page falls back to the browser's localStorage.
//  · /internal/components/api/state keeps the whole components list (parts, drawer plans, cabinet
//    layout) as one document in the same KV, with a revision number so two devices can't overwrite
//    each other silently, and the previous version kept under a second key.
//
// Contact form:
//  · delivery: SMTP straight to Google Workspace from the Worker (cloudflare:sockets), logged in as
//    GMAIL_USER with an app password (secret GMAIL_APP_PASSWORD). No third-party mail service.
//    (Cloudflare's own send_email binding is not an option: it needs Email Routing on the zone,
//    which would replace the Google Workspace MX records.)
//  · spam: Turnstile (secret TURNSTILE_SECRET; site key in index.html), plus a honeypot field,
//    a minimum fill time and a per-IP rate limit.
import { connect } from 'cloudflare:sockets';
import { internal as internalGate, escHtml } from './auth.js';

const MAX = { name: 120, email: 200, org: 120, message: 4000 };

const INTERNAL = '/internal';
const INTERNAL_HOME = INTERNAL + '/';      // assets serve /internal/index.html at /internal/
// The internal area lives on its own host. There its pages are served from the root
// (internal.organisedmess.studio/tools/ is site/internal/tools/); on the main site, /internal/* redirects to it.
const INTERNAL_HOST = 'internal.organisedmess.studio';
const MAIN_HOSTS = ['organisedmess.studio', 'www.organisedmess.studio'];

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.hostname === INTERNAL_HOST) return internalHost(request, env, url);
		let res;
		if (MAIN_HOSTS.includes(url.hostname) && (url.pathname === INTERNAL || url.pathname.startsWith(INTERNAL + '/'))) {
			res = Response.redirect('https://' + INTERNAL_HOST + (url.pathname.slice(INTERNAL.length) || '/') + url.search, 301);
		} else if (url.pathname === INTERNAL || url.pathname.startsWith(INTERNAL + '/')) {
			res = await internal(request, env, url);
		} else if (url.pathname === '/tools' || url.pathname.startsWith('/tools/')) {
			// the inventory used to live at /tools
			res = Response.redirect(url.origin + INTERNAL + url.pathname + url.search, 301);
		} else if (url.pathname === '/api/contact') {
			res = request.method === 'POST' ? await contact(request, env, url) : json({ error: 'POST only' }, 405);
		} else if (/^\/capabilities\/?$/.test(url.pathname)) {
			url.pathname = '/';
			res = await env.ASSETS.fetch(new Request(url.toString(), request));
		} else {
			res = await env.ASSETS.fetch(request);
		}
		if (url.hostname.endsWith('.workers.dev')) {
			res = new Response(res.body, res);
			res.headers.set('X-Robots-Tag', 'noindex, nofollow');
		}
		return res;
	}
};

async function contact(request, env, url) {
	const wantsJson = /application\/json/.test(request.headers.get('accept') || '');
	const reply = (body, status) => {
		if (wantsJson) return json(body, status);
		// a plain form post (no JS) is sent back to the window with a flag
		return Response.redirect(url.origin + '/capabilities?' + (status === 200 ? 'sent=1' : 'error=1'), 303);
	};
	let f;
	try {
		const ct = request.headers.get('content-type') || '';
		if (ct.includes('application/json')) f = await request.json();
		else { f = {}; (await request.formData()).forEach((v, k) => { f[k] = v; }); }
	} catch (e) { return reply({ error: 'Could not read the form.' }, 400); }

	const clean = (k) => String(f[k] || '').trim().slice(0, MAX[k] || 200);
	const name = clean('name'), email = clean('email'), org = clean('org'), message = clean('message');

	const ip = request.headers.get('cf-connecting-ip') || '';

	// bots: filled the hidden field, or submitted within three seconds of the page loading (pretend it worked)
	if (String(f.website || '').trim()) return reply({ ok: true }, 200);
	const t = Number(f.t || 0);
	if (t && Date.now() - t < 3000) return reply({ ok: true }, 200);

	if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return reply({ error: 'Please fill in your name, email and a message.' }, 400);
	}
	// rate limit: five messages per IP per hour (best effort, per data centre)
	if (ip && !(await allow(ip))) return reply({ error: 'Too many messages from this connection — please try again later.' }, 429);
	// Turnstile
	if (env.TURNSTILE_SECRET) {
		const token = String(f['cf-turnstile-response'] || '');
		const ok = token && await verifyTurnstile(env.TURNSTILE_SECRET, token, ip);
		if (!ok) return reply({ error: 'We couldn’t confirm you’re not a bot. Please try again, or write to hello@organisedmess.studio.' }, 400);
	}

	if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return reply({ error: 'The form isn’t connected yet — please write to hello@organisedmess.studio.' }, 503);
	const to = env.CONTACT_TO || env.GMAIL_USER;
	const from = `Organised Mess website <${env.GMAIL_USER}>`;   // Google only sends as the signed-in account
	const subject = `Website enquiry — ${name}${org ? ', ' + org : ''}`;
	const text = [
		`From: ${name}${org ? ' — ' + org : ''}`,
		`Email: ${email}`,
		'',
		message,
		'',
		'—',
		`Sent from the contact form on organisedmess.studio · ${new Date().toISOString()}`,
		`IP: ${request.headers.get('cf-connecting-ip') || '?'} · ${request.headers.get('cf-ipcountry') || '?'}`
	].join('\n');

	try {
		await withTimeout(smtpSend(env, { from, to, replyTo: email, subject, text }), 20000);
	} catch (e) {
		console.error('contact: send failed', e && e.message);
		return reply({ error: 'That didn’t send. Please try again, or write to hello@organisedmess.studio.' }, 502);
	}
	return reply({ ok: true }, 200);
}

async function verifyTurnstile(secret, token, ip) {
	try {
		const body = new FormData();
		body.set('secret', secret); body.set('response', token); if (ip) body.set('remoteip', ip);
		const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
		const j = await r.json();
		return !!j.success;
	} catch (e) { return false; }
}

// per-IP counter in the edge cache: 5 an hour. Not global, but it blunts a loop.
async function allow(ip) {
	try {
		const cache = caches.default;
		const key = new Request('https://organisedmess.studio/__rate/' + encodeURIComponent(ip));
		const hit = await cache.match(key);
		const n = hit ? Number(await hit.text()) || 0 : 0;
		if (n >= 5) return false;
		await cache.put(key, new Response(String(n + 1), { headers: { 'Cache-Control': 'max-age=3600' } }));
		return true;
	} catch (e) { return true; }
}

/* ---- SMTP (implicit TLS on 465) — just enough of RFC 5321 to hand Google one message ---- */
async function smtpSend(env, msg) {
	const host = env.SMTP_HOST || 'smtp.gmail.com', port = Number(env.SMTP_PORT || 465);
	const sock = connect({ hostname: host, port }, { secureTransport: env.SMTP_TLS === 'off' ? 'off' : 'on', allowHalfOpen: false });
	const reader = sock.readable.getReader(), writer = sock.writable.getWriter();
	const dec = new TextDecoder(), enc = new TextEncoder();
	let buf = '';
	// a reply is one or more "NNN-text" lines ending with "NNN text"
	async function expect(code) {
		for (;;) {
			const m = /^(\d{3}) .*\r?\n/m.exec(buf);   // the last line of a reply has a space after the code
			if (m) {
				const end = m.index + m[0].length; const line = buf.slice(0, end); buf = buf.slice(end);
				if (m[1] !== String(code)) throw new Error('smtp ' + m[0].trim().slice(0, 120));
				return line;
			}
			const { value, done } = await reader.read();
			if (done) throw new Error('smtp: connection closed');
			buf += dec.decode(value, { stream: true });
		}
	}
	const send = (s) => writer.write(enc.encode(s + '\r\n'));
	try {
		await expect(220);
		await send('EHLO organisedmess.studio'); await expect(250);
		await send('AUTH PLAIN ' + btoa('\0' + env.GMAIL_USER + '\0' + env.GMAIL_APP_PASSWORD)); await expect(235);
		await send('MAIL FROM:<' + env.GMAIL_USER + '>'); await expect(250);
		await send('RCPT TO:<' + addr(msg.to) + '>'); await expect(250);
		await send('DATA'); await expect(354);
		await send(mime(msg).replace(/\r\n\./g, '\r\n..') + '\r\n.'); await expect(250);
		await send('QUIT'); await expect(221).catch(() => {});
	} finally {
		try { writer.releaseLock(); reader.releaseLock(); sock.close(); } catch (e) {}
	}
}
function withTimeout(p, ms) {
	return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('smtp: timed out')), ms))]);
}
// a plain-text MIME message; headers are encoded so nothing typed into the form can inject one
function mime({ from, to, replyTo, subject, text }) {
	const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
	const word = (s) => '=?utf-8?B?' + b64(s) + '?=';
	const body = b64(text).replace(/(.{76})/g, '$1\r\n');
	return [
		'From: ' + from,
		'To: ' + to,
		'Reply-To: ' + replyTo,
		'Subject: ' + word(subject),
		'Date: ' + new Date().toUTCString(),
		'Message-ID: <' + crypto.randomUUID() + '@organisedmess.studio>',
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: base64',
		'',
		body
	].join('\r\n');
}
function addr(s) { const m = /<([^>]+)>/.exec(s); return m ? m[1] : s.trim(); }
function json(body, status) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/* ---- internal.organisedmess.studio: the internal area on its own host ------ */
// Everything is still written and stored as /internal/… (the files in site/internal, the links in those pages,
// the login form). This maps the short address onto it and back:
//  · /tools/ is handled as /internal/tools/; shared static files (/css, /js, /fonts, /assets) are served as they are
//  · a GET for an old-style /internal/… link is redirected to the short address; a POST is handled in place
//  · redirects and the session cookie that come back are rewritten for the root of this host
async function internalHost(request, env, url) {
	const p = url.pathname;
	if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	if (/^\/(css|js|fonts|assets|snippets)\//.test(p) || /^\/(favicon\.ico|apple-touch-icon\.png)$/.test(p)) return env.ASSETS.fetch(request);
	let inner = p;
	if (p === INTERNAL || p.startsWith(INTERNAL + '/')) {
		if (request.method === 'GET' || request.method === 'HEAD') {
			return new Response(null, { status: 301, headers: { Location: (p.slice(INTERNAL.length) || '/') + url.search } });
		}
	} else {
		inner = INTERNAL + p;
	}
	const iu = new URL(url);
	iu.pathname = inner;
	const res = await internal(new Request(iu.toString(), request), env, iu);
	const out = new Response(res.body, res);
	const loc = out.headers.get('Location');
	if (loc && (loc === INTERNAL || loc.startsWith(INTERNAL + '/'))) out.headers.set('Location', loc.slice(INTERNAL.length) || '/');
	const ck = out.headers.get('Set-Cookie');
	if (ck) out.headers.set('Set-Cookie', ck.replace('Path=' + INTERNAL + ';', 'Path=/;'));
	out.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return out;
}

function internalPage(title, body, back, status, wide) {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escHtml(title)} — Organised Mess</title>
	<meta name="robots" content="noindex, nofollow">
	<meta name="theme-color" content="#f2f2f2">
	<link rel="icon" href="/assets/favicon.ico" sizes="16x16 32x32">
	<link rel="preload" href="/fonts/ABCGaisyrEdu-Light.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="preload" href="/fonts/ABCDiatypeEdu-Thin.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="stylesheet" href="/css/site.css">
	<link rel="stylesheet" href="/css/internal.css">
	<script>
	(function () {
		var html = document.documentElement; html.classList.add('js');
		var portrait = window.matchMedia('(max-aspect-ratio: 4/5)'), landscape = window.matchMedia('(min-aspect-ratio: 2/3) and (max-height: 500px)');
		function apply() {
			var w = html.clientWidth, h = window.innerHeight, mobile = portrait.matches || landscape.matches;
			var l = h > w ? Math.min(1, (h / w - 1) / 0.777777778) : 0, f = (mobile && !portrait.matches) ? 18 : 9;
			var unit = Math.max(20, Math.min(w, h) / (100 / (f + 5 * l)));
			html.style.setProperty('--base-size', (unit * 0.16) + 'px'); html.style.setProperty('--viewport-height', h + 'px');
			html.classList.toggle('mobile', mobile); if (document.body) document.body.classList.toggle('mobile', mobile);
		}
		apply(); window.addEventListener('resize', apply, { passive: true }); document.addEventListener('DOMContentLoaded', apply);
	})();
	</script>
	<style>
	.acct-wide .tools-login-win { width: min(1080px, 94vw); max-width: none; }
	.acct-wide .tools-login-form { max-width: 460px; }
	.acct-sec { margin: 0 0 2.2em; }
	.acct-sec h2, .acct-sec h3 { font-family: "Gaisyr", Georgia, serif; font-weight: 400; margin: 0 0 .5em; letter-spacing: normal; text-transform: none; }
	.acct-sec h2 { font-size: 1.6em; } .acct-sec h3 { font-size: 1.2em; }
	.acct-scroll { overflow-x: auto; }
	.acct-log { max-height: 420px; overflow-y: auto; }
	.acct-table { width: 100%; border-collapse: collapse; font-size: .9em; }
	.acct-table th { text-align: left; font-weight: 400; opacity: .55; padding: 6px 8px; border-bottom: 1px solid currentColor; white-space: nowrap; position: sticky; top: 0; background: #f2f2f2; }
	.acct-table td { padding: 8px; border-bottom: 1px solid rgba(0,0,0,.12); vertical-align: top; }
	.acct-table small { opacity: .55; }
	.acct-table form { display: inline-block; margin: 0 4px 4px 0; }
	.acct-table select { font: inherit; padding: 3px 6px; border-radius: 999px; border: 1px solid rgba(0,0,0,.2); background: #fff; }
	.acct-off td { opacity: .5; } .acct-bad td { color: #b3261e; }
	.acct-btn { font: inherit; font-size: .9em; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.25); background: rgba(255,255,255,.7); cursor: pointer; color: inherit; }
	.acct-btn:hover { background: #fff; } .acct-danger { color: #b3261e; border-color: rgba(179,38,30,.4); }
	.acct-tag { display: inline-block; font-size: .78em; padding: 1px 7px; border-radius: 999px; border: 1px solid rgba(0,0,0,.25); opacity: .8; vertical-align: 1px; }
	.acct-note { background: #fff; border: 1px solid rgba(0,0,0,.15); border-radius: 10px; padding: 10px 12px; }
	.acct-code { font-family: ui-monospace, Menlo, monospace; font-size: 1.05em; background: #f2f2f2; padding: 2px 6px; border-radius: 6px; user-select: all; }
	.acct-empty, .acct-hint { opacity: .6; font-size: .9em; }
	.acct-actions { white-space: normal; min-width: 220px; }
	.acct-add select { width: 100%; font: inherit; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.2); background: #fff; color: inherit; }
	</style>
</head>
<body class="tools tools-login-page${wide ? ' acct-wide' : ''}">
	<main class="page page-tools-login">
		<div class="os-win tools-login-win" role="dialog" aria-labelledby="tools-login-title">
			<div class="os-titlebar"><span class="os-dot" aria-hidden="true"></span><span class="os-title" id="tools-login-title">${escHtml(title)}</span><span class="os-meta">Organised Mess</span></div>
${body}
		</div>
		<p class="tools-login-back">${back}</p>
	</main>
</body>
</html>`;
	return new Response(html, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
	});
}

/* ---- /internal: the login gate, people and sessions live in auth.js ---- */
function internal(request, env, url) {
	return internalGate(request, env, url, { adminPass, toolsState, componentsState, json, page: internalPage });
}

/* ---- /internal/admin/*: the private admin Worker, behind this login ---------- */
async function adminPass(request, env) {
	if (!env.ADMIN) return new Response('Admin is not connected (service binding ADMIN).', { status: 503 });
	const res = await env.ADMIN.fetch(request);
	const out = new Response(res.body, res);
	out.headers.set('Cache-Control', 'private, no-store');
	out.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return out;
}

/* ---- /internal/tools/api/state: per-tool location + condition in KV --------- */
// GET  → { items: { [id]: { location, condition, notes: [{t, text}], updated } } }
// PUT  { id, location?, condition?, note? } → merges that one entry; a note is appended with a timestamp

const STATE_KEY = 'tools-state-v1';
const CONDITIONS = ['Good', 'Worn', 'Needs service', 'Broken', 'Missing', 'Not assessed'];

async function toolsState(request, env) {
	if (!env.TOOLS_KV) return json({ error: 'TOOLS_KV binding not configured' }, 503);
	if (request.method === 'GET') {
		const items = (await env.TOOLS_KV.get(STATE_KEY, 'json')) || {};
		return json({ items }, 200);
	}
	if (request.method === 'PUT') {
		let body;
		try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
		const id = String(body.id || '').slice(0, 160);
		if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) return json({ error: 'bad id' }, 400);
		const items = (await env.TOOLS_KV.get(STATE_KEY, 'json')) || {};
		const cur = items[id] || {};
		if (body.location !== undefined) cur.location = String(body.location).trim().slice(0, 120);
		if (body.condition !== undefined) {
			if (!CONDITIONS.includes(body.condition)) return json({ error: 'bad condition' }, 400);
			cur.condition = body.condition;
		}
		if (body.note !== undefined) {
			const text = String(body.note).trim().slice(0, 2000);
			if (!text) return json({ error: 'empty note' }, 400);
			cur.notes = (cur.notes || []).concat([{ t: new Date().toISOString(), text }]).slice(-200);
		}
		cur.updated = new Date().toISOString();
		items[id] = cur;
		await env.TOOLS_KV.put(STATE_KEY, JSON.stringify(items));
		return json({ ok: true, item: cur }, 200);
	}
	return json({ error: 'GET or PUT' }, 405);
}

/* ---- /internal/components/api/state: the components list as one document ------ */
// GET → { rev, doc, updated }   (rev 0 and doc null before the first save)
// PUT { rev, doc } → saved as rev + 1 when rev matches what's stored; otherwise 409 with the stored
// { rev, doc } so the page can load it. The version it replaces is kept under COMP_PREV (one step back).
const COMP_KEY = 'components-state-v1';
const COMP_PREV = 'components-state-v1-prev';
const COMP_MAX = 4 * 1024 * 1024;

async function componentsState(request, env) {
	if (!env.TOOLS_KV) return json({ error: 'TOOLS_KV binding not configured' }, 503);
	if (request.method === 'GET') {
		const cur = (await env.TOOLS_KV.get(COMP_KEY, 'json')) || { rev: 0, doc: null };
		return json(cur, 200);
	}
	if (request.method === 'PUT') {
		const text = await request.text();
		if (text.length > COMP_MAX) return json({ error: 'too large' }, 413);
		let body;
		try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
		const doc = body && body.doc;
		if (!doc || typeof doc !== 'object' || !Array.isArray(doc.parts) || !Array.isArray(doc.cabinets) || typeof doc.drawers !== 'object') {
			return json({ error: 'bad document' }, 400);
		}
		const cur = (await env.TOOLS_KV.get(COMP_KEY, 'json')) || { rev: 0, doc: null };
		if ((cur.rev || 0) !== (body.rev || 0)) return json({ error: 'conflict', rev: cur.rev, doc: cur.doc }, 409);
		if (cur.doc) await env.TOOLS_KV.put(COMP_PREV, JSON.stringify(cur));
		const next = { rev: (cur.rev || 0) + 1, updated: new Date().toISOString(), doc };
		await env.TOOLS_KV.put(COMP_KEY, JSON.stringify(next));
		return json({ ok: true, rev: next.rev, updated: next.updated }, 200);
	}
	return json({ error: 'GET or PUT' }, 405);
}
