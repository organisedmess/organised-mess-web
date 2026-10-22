// organisedmess.studio — tiny Worker in front of the static assets.
//  · serves the Capabilities deep link (the page, not a redirect)
//  · receives the contact form at POST /api/contact and emails it on (Resend)
//  · marks the workers.dev staging host noindex
// Everything else passes straight through to the static assets.
//
// Contact form setup (once): a Resend account with organisedmess.studio verified,
// then `wrangler secret put RESEND_API_KEY` (or Settings → Variables in the dashboard).
// CONTACT_TO / CONTACT_FROM are plain vars in wrangler.jsonc.

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

	// bots: filled the hidden field, or submitted within three seconds of the page loading
	if (String(f.website || '').trim()) return reply({ ok: true }, 200);
	const t = Number(f.t || 0);
	if (t && Date.now() - t < 3000) return reply({ ok: true }, 200);

	if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return reply({ error: 'Please fill in your name, email and a message.' }, 400);
	}
	if (!env.RESEND_API_KEY) return reply({ error: 'The form isn’t connected yet — please write to hello@organisedmess.studio.' }, 503);

	const to = env.CONTACT_TO || 'hello@organisedmess.studio';
	const from = env.CONTACT_FROM || 'Organised Mess website <noreply@organisedmess.studio>';
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

	const r = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Website enquiry — ${name}${org ? ', ' + org : ''}`, text })
	});
	if (!r.ok) return reply({ error: 'That didn’t send. Please try again, or write to hello@organisedmess.studio.' }, 502);
	return reply({ ok: true }, 200);
}

function json(body, status) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
