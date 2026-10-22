// organisedmess.studio — tiny Worker in front of the static assets.
//  · serves the Capabilities deep link (the page, not a redirect)
//  · receives the contact form at POST /api/contact and emails it on
//  · marks the workers.dev staging host noindex
// Everything else passes straight through to the static assets.
//
// Contact form, all on Cloudflare:
//  · delivery: the `send_email` binding (CONTACT_MAIL in wrangler.jsonc). Needs Email Routing
//    enabled on organisedmess.studio and CONTACT_TO verified there as a destination address.
//    (Resend is kept as a fallback if RESEND_API_KEY is set and the binding is not.)
//  · spam: Turnstile (secret TURNSTILE_SECRET; site key in index.html), plus a honeypot field,
//    a minimum fill time and a per-IP rate limit.
import { EmailMessage } from 'cloudflare:email';

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

	const to = env.CONTACT_TO || 'hello@organisedmess.studio';
	const from = env.CONTACT_FROM || 'Organised Mess website <noreply@organisedmess.studio>';
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
		if (env.CONTACT_MAIL) {
			await env.CONTACT_MAIL.send(new EmailMessage(addr(from), to, mime({ from, to, replyTo: email, subject, text })));
		} else if (env.RESEND_API_KEY) {
			const r = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to: [to], reply_to: email, subject, text })
			});
			if (!r.ok) throw new Error('resend ' + r.status);
		} else {
			return reply({ error: 'The form isn’t connected yet — please write to hello@organisedmess.studio.' }, 503);
		}
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
