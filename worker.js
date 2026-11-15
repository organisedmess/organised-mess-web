// organisedmess.studio — tiny Worker in front of the static assets.
//  · serves the Capabilities deep link (the page, not a redirect)
//  · receives the contact form at POST /api/contact and emails it on
//  · gates /internal/* (tools inventory and whatever else goes behind the wall) behind a login
//  · marks the workers.dev staging host noindex
// Everything else passes straight through to the static assets.
//
// Internal login:
//  · secrets INTERNAL_USER and INTERNAL_PASSWORD (optional INTERNAL_SECRET adds entropy to the cookie key).
//  · a good login sets an HttpOnly, HMAC-signed cookie for 30 days, scoped to /internal; nothing about
//    the credentials is stored client-side. Changing either secret logs every session out.
//  · wrangler.jsonc lists /internal* in run_worker_first — otherwise the static files under /internal
//    would be served straight from the asset cache without ever reaching this check.
//  · anything added under site/internal/ is covered; add a row to site/internal/index.html to list it.
//  · optional secret AGENT_TOKEN (32+ characters): lets an agent call the admin API with a bearer token; see internal().
//  · /internal/admin/* is handed, after the same login, to the private admin Worker (service binding ADMIN,
//    see wrangler.jsonc). That Worker has no public address; its code and data live in a separate private repo.
//  · /internal/tools/api/state keeps each tool's location + condition in KV (binding TOOLS_KV,
//    see wrangler.jsonc). Without the binding the page falls back to the browser's localStorage.
//
// Contact form:
//  · delivery: SMTP straight to Google Workspace from the Worker (cloudflare:sockets), logged in as
//    GMAIL_USER with an app password (secret GMAIL_APP_PASSWORD). No third-party mail service.
//    (Cloudflare's own send_email binding is not an option: it needs Email Routing on the zone,
//    which would replace the Google Workspace MX records.)
//  · spam: Turnstile (secret TURNSTILE_SECRET; site key in index.html), plus a honeypot field,
//    a minimum fill time and a per-IP rate limit.
import { connect } from 'cloudflare:sockets';

const MAX = { name: 120, email: 200, org: 120, message: 4000 };

const INTERNAL = '/internal';
const INTERNAL_HOME = INTERNAL + '/';      // assets serve /internal/index.html at /internal/
const INTERNAL_COOKIE = 'om_internal';
const LOGIN_MAX_FAILS = 8;
// Login details live in TOOLS_KV under AUTH_KEY once they have been set on the Account page (/internal/account):
// { user, salt, hash (PBKDF2-SHA256), secret (signs the session cookie; replaced on every change, which signs out
// every device), updated }. Before that, the INTERNAL_USER / INTERNAL_PASSWORD secrets are used.
// BOOTSTRAP is a one-off temporary login (name "setup") that only opens the Account page, so the first details can be
// set there. It stops working as soon as details are saved, or after its date. Only its salted hash is here.
const AUTH_KEY = 'internal-auth-v1';
const PBKDF2_ITERATIONS = 100000;
const BOOTSTRAP = { user: 'setup', salt: 'b1494ba6a85679a7fbb598a81e3fcab2', hash: 'f589cd41abc797d556e363407f324253ca06749805398a9ab4ee2d1c64bca3f7', until: Date.parse('2026-11-23T00:00:00+08:00') };
const INTERNAL_SESSION_DAYS = 30;
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

/* ---- /internal: login gate ---------------------------------------------- */

async function internal(request, env, url) {
	const rec = await authRecord(env);
	if (!rec && !(env.INTERNAL_USER && env.INTERNAL_PASSWORD) && Date.now() > BOOTSTRAP.until) {
		return new Response('Internal login is not configured (set INTERNAL_USER and INTERNAL_PASSWORD).', { status: 503 });
	}

	if (url.pathname === INTERNAL + '/logout') {
		return bounce('/', internalCookie('', 0, url));
	}

	if (url.pathname === INTERNAL + '/login' && request.method === 'POST') {
		let f = {};
		try { (await request.formData()).forEach((v, k) => { f[k] = v; }); } catch (e) {}
		const next = internalNext(f.next);
		// lockout: 8 wrong tries from one address → that address is refused for 30 minutes (counted in TOOLS_KV)
		const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
		const failKey = 'login-fail:' + ip;
		const fails = env.TOOLS_KV ? Number(await env.TOOLS_KV.get(failKey)) || 0 : 0;
		if (fails >= LOGIN_MAX_FAILS) {
			await new Promise(r => setTimeout(r, 700));
			return internalLogin(next, 'Too many tries. Wait half an hour and try again.', 429);
		}
		const ok = await checkLogin(String(f.user || ''), String(f.pass || ''), env, rec);
		if (!ok) {
			if (env.TOOLS_KV) await env.TOOLS_KV.put(failKey, String(fails + 1), { expirationTtl: 1800 });
			await new Promise(r => setTimeout(r, 700)); // blunt the obvious brute force
			return internalLogin(next, 'Those details did not match.', 401);
		}
		if (fails && env.TOOLS_KV) await env.TOOLS_KV.delete(failKey);
		const { token, exp } = await newSession(ok, env, rec);
		return bounce(ok === 'temp' ? INTERNAL + '/account' : next, internalCookie(token, exp, url));
	}

	// An agent (Claude) may use the admin API with a token instead of the login: secret AGENT_TOKEN, sent as
	// "Authorization: Bearer …". Only /internal/admin/api/*, never the pages; it can read and write but not delete,
	// and what it writes is marked in the activity log. No secret set = no token access.
	if (url.pathname.startsWith(INTERNAL + '/admin/api/')) {
		const auth = request.headers.get('Authorization') || '';
		if (auth.startsWith('Bearer ')) {
			const ok = env.AGENT_TOKEN && String(env.AGENT_TOKEN).length >= 32 && (await sameString(auth.slice(7).trim(), env.AGENT_TOKEN));
			if (!ok) { await new Promise(r => setTimeout(r, 700)); return json({ error: 'bad token' }, 401); }
			if (request.method === 'DELETE') return json({ error: 'the agent token cannot delete' }, 403);
			const h = new Headers(request.headers);
			h.delete('Authorization'); h.set('X-OM-Note', 'agent');
			return adminPass(new Request(request, { headers: h }), env);
		}
	}

	const session = await internalSession(request, env, rec);
	if (session) {
		if (url.pathname === INTERNAL + '/account') return request.method === 'POST' ? accountPost(request, env, url, session, rec) : accountPage(session, rec, env, url.searchParams.get('done'), '');
		// the temporary login opens the Account page and nothing else
		if (session.mode === 'temp') return url.pathname.includes('/api/') ? json({ error: 'set your login details first' }, 403) : bounce(INTERNAL + '/account');
		if (url.pathname === INTERNAL + '/login') return bounce(INTERNAL_HOME);
		if (url.pathname === INTERNAL + '/tools/api/state') return toolsState(request, env);
		if (url.pathname === INTERNAL + '/admin' || url.pathname.startsWith(INTERNAL + '/admin/')) return adminPass(request, env);
		const res = await env.ASSETS.fetch(request);
		const out = new Response(res.body, res);
		out.headers.set('Cache-Control', 'private, no-store');
		out.headers.set('X-Robots-Tag', 'noindex, nofollow');
		return out;
	}
	return internalLogin(internalNext(url.pathname + url.search), '', 401);
}

// → { mode: 'full' | 'temp' } or null. Cookie: <expiry>.<mode>.<signature> (older <expiry>.<signature> = full)
async function internalSession(request, env, rec) {
	const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + INTERNAL_COOKIE + '=([^;]+)'));
	if (!m) return null;
	const parts = m[1].split('.');
	const exp = parts[0], mode = parts.length === 3 ? parts[1] : 'full', sig = parts[parts.length - 1];
	if (!exp || !sig || Number(exp) < Date.now() || (mode !== 'full' && mode !== 'temp')) return null;
	if (mode === 'temp' && (rec || Date.now() > BOOTSTRAP.until)) return null;
	const msg = parts.length === 3 ? exp + '.' + mode : exp;
	return (await sameString(sig, await internalSign(msg, env, rec))) ? { mode } : null;
}
async function newSession(mode, env, rec) {
	const exp = Date.now() + (mode === 'temp' ? 3600e3 : INTERNAL_SESSION_DAYS * 86400 * 1000);
	return { exp, token: exp + '.' + mode + '.' + (await internalSign(exp + '.' + mode, env, rec)) };
}
async function internalKey(env, rec) {
	const material = rec ? ['v2', rec.secret, env.INTERNAL_SECRET || ''].join('\u0000') : [env.INTERNAL_USER, env.INTERNAL_PASSWORD, env.INTERNAL_SECRET || ''].join('\u0000');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
	return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function internalSign(msg, env, rec) {
	const sig = await crypto.subtle.sign('HMAC', await internalKey(env, rec), new TextEncoder().encode(msg));
	return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// constant-time compare of two strings via their digests (length leaks nothing)
async function sameString(a, b) {
	const enc = new TextEncoder();
	const [x, y] = (await Promise.all([
		crypto.subtle.digest('SHA-256', enc.encode(String(a))),
		crypto.subtle.digest('SHA-256', enc.encode(String(b)))
	])).map(d => new Uint8Array(d));
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}
function internalCookie(token, exp, url) {
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	if (!exp) return INTERNAL_COOKIE + '=; Path=' + INTERNAL + '; Max-Age=0; HttpOnly; SameSite=Lax' + secure;
	return INTERNAL_COOKIE + '=' + token + '; Path=' + INTERNAL + '; Expires=' + new Date(exp).toUTCString() + '; HttpOnly; SameSite=Lax' + secure;
}
function bounce(to, cookie) {
	const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
	if (cookie) h.set('Set-Cookie', cookie);
	return new Response(null, { status: 303, headers: h });
}
// only ever bounce back inside /tools, never to another origin
function internalNext(v) {
	v = String(v || '');
	if (!v.startsWith(INTERNAL) || v.startsWith('//') || v.startsWith(INTERNAL + '/login') || v.startsWith(INTERNAL + '/logout')) return INTERNAL_HOME;
	return v;
}
const escHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- login details: stored hash, checks, the Account page --------------- */
async function authRecord(env) {
	if (!env.TOOLS_KV) return null;
	try { const r = await env.TOOLS_KV.get(AUTH_KEY, 'json'); return r && r.user && r.hash && r.salt && r.secret ? r : null; } catch (e) { return null; }
}
const toHex = (u8) => [...new Uint8Array(u8)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(String(h).match(/../g).map(x => parseInt(x, 16)));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(pass, salt) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
	return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: PBKDF2_ITERATIONS }, key, 256));
}
// → 'full' | 'temp' | false
async function checkLogin(user, pass, env, rec) {
	if (rec) return (await sameString(user, rec.user)) & (await sameString(await pbkdf2(pass, rec.salt), rec.hash)) ? 'full' : false;
	if (env.INTERNAL_USER && env.INTERNAL_PASSWORD && (await sameString(user, env.INTERNAL_USER)) & (await sameString(pass, env.INTERNAL_PASSWORD))) return 'full';
	if (Date.now() < BOOTSTRAP.until && (await sameString(user, BOOTSTRAP.user)) & (await sameString(await pbkdf2(pass, BOOTSTRAP.salt), BOOTSTRAP.hash))) return 'temp';
	return false;
}
async function checkPassword(pass, env, rec, session) {
	if (session.mode === 'temp') return Date.now() < BOOTSTRAP.until && sameString(await pbkdf2(pass, BOOTSTRAP.salt), BOOTSTRAP.hash);
	if (rec) return sameString(await pbkdf2(pass, rec.salt), rec.hash);
	return !!env.INTERNAL_PASSWORD && sameString(pass, env.INTERNAL_PASSWORD);
}
async function accountPost(request, env, url, session, rec) {
	let f = {};
	try { (await request.formData()).forEach((v, k) => { f[k] = String(v); }); } catch (e) {}
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown', failKey = 'login-fail:' + ip;
	const fails = env.TOOLS_KV ? Number(await env.TOOLS_KV.get(failKey)) || 0 : 0;
	const again = (msg, status) => accountPage(session, rec, env, '', msg, status || 400);
	if (fails >= LOGIN_MAX_FAILS) return again('Too many tries. Wait half an hour and try again.', 429);
	if (!env.TOOLS_KV) return again('Storage is not connected (TOOLS_KV), so details cannot be saved here.', 503);
	if (!(await checkPassword(f.current || '', env, rec, session))) {
		await env.TOOLS_KV.put(failKey, String(fails + 1), { expirationTtl: 1800 });
		await new Promise(r => setTimeout(r, 700));
		return again('Your current password did not match.', 401);
	}
	let next;
	if (f.action === 'signout') {
		if (!rec) return again('Set your own details first.');
		next = Object.assign({}, rec, { secret: randomHex(32), updated: new Date().toISOString() });
	} else {
		const user = (f.user || '').trim(), pass = f.pass || '';
		if (!/^[A-Za-z0-9._@-]{3,64}$/.test(user)) return again('The name must be 3–64 letters, numbers or . _ @ -');
		if (user.toLowerCase() === BOOTSTRAP.user) return again('Choose a name other than “setup”.');
		if (pass.length < 12) return again('Use a password of at least 12 characters.');
		if (pass.length > 200) return again('That password is too long.');
		if (pass !== (f.pass2 || '')) return again('The two new passwords are not the same.');
		if (pass === f.current) return again('Choose a password different from the current one.');
		const salt = randomHex(16);
		next = { user, salt, hash: await pbkdf2(pass, salt), secret: randomHex(32), updated: new Date().toISOString() };
	}
	await env.TOOLS_KV.put(AUTH_KEY, JSON.stringify(next));
	if (fails) await env.TOOLS_KV.delete(failKey);
	const { token, exp } = await newSession('full', env, next);
	return bounce(INTERNAL + '/account?done=' + (f.action === 'signout' ? 'signout' : 'saved'), internalCookie(token, exp, url));
}
function accountPage(session, rec, env, done, error, status) {
	const temp = session.mode === 'temp';
	const note = done === 'saved' ? 'Saved. Use your new name and password from now on — every other device has been signed out.'
		: done === 'signout' ? 'Every other device has been signed out.' : '';
	const field = (name, label, type, ac, extra, id) => `<div class="field"><label for="a-${id || name}">${label}</label><input id="a-${id || name}" name="${name}" type="${type}" autocomplete="${ac}" autocapitalize="off" spellcheck="false" required ${extra || ''}></div>`;
	const body = `
			<form class="tools-login-form" method="post" action="${INTERNAL}/account">
				<input type="hidden" name="action" value="change">
				<p class="tools-login-intro">${temp ? 'You are signed in with the temporary login. Choose your own name and password to continue — the temporary one stops working once you save.' : 'Change the name and password for the internal pages. Saving signs out every other device.'}${rec && !temp ? ' Last changed ' + escHtml(String(rec.updated).slice(0, 10)) + '.' : ''}</p>
				${field('current', temp ? 'Temporary password' : 'Current password', 'password', 'current-password', 'autofocus')}
				${field('user', 'New name', 'text', 'username', 'minlength="3" maxlength="64" value="' + escHtml(rec && !temp ? rec.user : '') + '"')}
				${field('pass', 'New password (12+ characters)', 'password', 'new-password', 'minlength="12"')}
				${field('pass2', 'New password again', 'password', 'new-password', 'minlength="12"')}
				<div class="tools-login-actions">
					<button class="tools-send" type="submit">Save&nbsp;<span class="arr">→</span></button>
					${error ? `<p class="tools-login-error" role="alert">${escHtml(error)}</p>` : note ? `<p class="tools-login-intro" role="status">${escHtml(note)}</p>` : ''}
				</div>
			</form>${rec && !temp ? `
			<form class="tools-login-form" method="post" action="${INTERNAL}/account">
				<input type="hidden" name="action" value="signout">
				<p class="tools-login-intro">Lost a device? Sign out everywhere except here.</p>
				${field('current', 'Current password', 'password', 'current-password', '', 'current2')}
				<div class="tools-login-actions"><button class="tools-send" type="submit">Sign out other devices&nbsp;<span class="arr">→</span></button></div>
			</form>` : ''}`;
	const back = temp ? `<a class="pill" href="${INTERNAL}/logout">Log out</a>` : `<a class="pill" href="${INTERNAL_HOME}"><span class="arr arr-back">←</span>&nbsp;Back</a>`;
	return internalPage('Account', body, back, status || 200);
}

function internalLogin(next, error, status) {
	const body = `
			<form class="tools-login-form" method="post" action="${INTERNAL}/login" autocomplete="on">
				<input type="hidden" name="next" value="${escHtml(next)}">
				<p class="tools-login-intro">Studio-only pages. Sign in to continue.</p>
				<div class="field">
					<label for="t-user">Name</label>
					<input id="t-user" name="user" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus>
				</div>
				<div class="field">
					<label for="t-pass">Password</label>
					<input id="t-pass" name="pass" type="password" autocomplete="current-password" required>
				</div>
				<div class="tools-login-actions">
					<button class="tools-send" type="submit">Enter&nbsp;<span class="arr">→</span></button>
					${error ? `<p class="tools-login-error" role="alert">${escHtml(error)}</p>` : ''}
				</div>
			</form>`;
	return internalPage('Internal', body, '<a class="pill" href="https://organisedmess.studio/"><span class="arr arr-back">←</span>&nbsp;Back to the studio</a>', status);
}
function internalPage(title, body, back, status) {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Internal — Organised Mess</title>
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
</head>
<body class="tools tools-login-page">
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
