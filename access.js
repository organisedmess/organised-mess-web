// Cloudflare Access as the internal login.
//
// When the vars ACCESS_TEAM (e.g. "organisedmess" for organisedmess.cloudflareaccess.com) and ACCESS_AUD (the
// application's Audience tag) are both set, the internal area trusts Cloudflare Access alone: every request must carry
// a valid Access token (header Cf-Access-Jwt-Assertion), checked here against the team's signing keys. The site's own
// password form is then not used. Requests that did not come through Access (e.g. the workers.dev address) have no
// token and are refused.
//
// ACCESS_EMAILS (optional, comma-separated) narrows who may in, on top of the Access policy.
// A service token (for the Claude Code agent) is accepted only where the caller also sends the AGENT_TOKEN — see worker.js.

let certCache = { team: '', at: 0, keys: [] };

export function accessOn(env) {
	return !!(env.ACCESS_TEAM && env.ACCESS_AUD);
}
export function accessOrigin(env) {
	const t = String(env.ACCESS_TEAM).trim().replace(/^https?:\/\//, '').replace(/\.cloudflareaccess\.com\/?$/, '');
	return 'https://' + t + '.cloudflareaccess.com';
}

function b64url(s) {
	s = s.replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4) s += '=';
	const bin = atob(s), out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
const dec = (u8) => JSON.parse(new TextDecoder().decode(u8));

async function keys(env, fresh) {
	const origin = accessOrigin(env);
	if (!fresh && certCache.team === origin && Date.now() - certCache.at < 3600e3 && certCache.keys.length) return certCache.keys;
	const r = await fetch(origin + '/cdn-cgi/access/certs', { cf: { cacheTtl: 300 } });
	if (!r.ok) throw new Error('Access keys unavailable (' + r.status + ')');
	const j = await r.json();
	certCache = { team: origin, at: Date.now(), keys: j.keys || [] };
	return certCache.keys;
}

// → { email, serviceToken } or null
export async function accessIdentity(request, env) {
	const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
	const parts = jwt.split('.');
	if (parts.length !== 3) return null;
	let head, body;
	try { head = dec(b64url(parts[0])); body = dec(b64url(parts[1])); } catch (e) { return null; }
	if (head.alg !== 'RS256' || !head.kid) return null;

	let list = await keys(env, false).catch(() => []);
	let jwk = list.find(k => k.kid === head.kid);
	if (!jwk) { list = await keys(env, true).catch(() => []); jwk = list.find(k => k.kid === head.kid); }   // keys rotate
	if (!jwk) return null;
	let ok = false;
	try {
		const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
		ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
	} catch (e) { return null; }
	if (!ok) return null;

	const now = Math.floor(Date.now() / 1000);
	const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
	if (body.iss !== accessOrigin(env)) return null;
	if (!aud.includes(String(env.ACCESS_AUD).trim())) return null;
	if (!body.exp || body.exp < now - 30) return null;
	if (body.nbf && body.nbf > now + 30) return null;

	if (body.email) {
		const allow = String(env.ACCESS_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
		if (allow.length && !allow.includes(String(body.email).toLowerCase())) return null;
		return { email: body.email, serviceToken: false };
	}
	if (body.common_name) return { email: '', serviceToken: true };   // a service token: only good with the agent token
	return null;
}
