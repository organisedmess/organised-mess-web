// organisedmess.studio — tiny Worker in front of the static assets.
//  · serves the Capabilities deep link (the page, not a redirect)
//  · receives the contact form at POST /api/contact and emails it on
//  · marks the workers.dev staging host noindex
// Everything else passes straight through to the static assets.
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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let res;
		if (url.pathname === '/api/contact') {
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
