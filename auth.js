// The internal area's login: people, sessions, the sign-in log, and the Account and People pages.
//
// Stored in TOOLS_KV:
//   internal-users-v1   { secret, users: { <name>: { role: owner|member, access: all|tools, salt, hash, created,
//                         updated, lastLogin, disabled, mustChange } } }      passwords: PBKDF2-SHA256, salted
//   sess:<name>:<id>    one key per signed-in device; its metadata holds when, where from and which browser.
//                       Deleting the key signs that device out. Expires with the session (30 days).
//   internal-authlog-v1 the last 300 sign-ins, failed tries and changes, newest first
//   login-fail:<ip>     wrong-password counter for the lockout (8 tries → 30 minutes)
// Before anyone exists, the INTERNAL_USER / INTERNAL_PASSWORD secrets (or the older single login, internal-auth-v1)
// sign in once and become the first owner.
//
// access "all" opens everything; "tools" opens the internal index, the workshop tools and the person's own account —
// not the admin (and so not Claude or its API credits). Owners also manage people at /internal/account/people.

const INTERNAL = '/internal', HOME = INTERNAL + '/', COOKIE = 'om_internal';
const STORE = 'internal-users-v1', LEGACY = 'internal-auth-v1', LOG = 'internal-authlog-v1', SESS = 'sess:';
const DAYS = 30, MAX_FAILS = 8, ITER = 100000, TOUCH_MS = 10 * 60e3, LOG_MAX = 300;
const NAME_RE = /^[A-Za-z0-9._@-]{3,64}$/;
const ACCESS = { all: 'Everything', tools: 'Workshop tools only' };

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const toHex = (u8) => [...new Uint8Array(u8)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(String(h).match(/../g).map(x => parseInt(x, 16)));
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
export const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
export async function sameString(a, b) {
	const [x, y] = (await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))])).map(d => new Uint8Array(d));
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}
async function pbkdf2(pass, salt) {
	const key = await crypto.subtle.importKey('raw', enc.encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
	return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: ITER }, key, 256));
}
async function hashNew(pass) { const salt = randomHex(16); return { salt, hash: await pbkdf2(pass, salt) }; }
async function hmac(store, env, msg) {
	const raw = await crypto.subtle.digest('SHA-256', enc.encode(['v3', store.secret, env.INTERNAL_SECRET || ''].join('\u0000')));
	const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function tempPassword() {
	const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(64));
	let p = '';
	for (let i = 0; i < b.length && p.length < 20; i++) if (b[i] < A.length * 4) p += A[b[i] % A.length];
	return p.match(/.{1,5}/g).join('-');
}
function where(request) {
	return { ip: request.headers.get('CF-Connecting-IP') || '', co: (request.cf && request.cf.country) || '', ci: (request.cf && request.cf.city) || '', ua: String(request.headers.get('User-Agent') || '').slice(0, 300) };
}
export function device(ua) {
	ua = String(ua || '');
	const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|python|node|wget/i.test(ua) ? 'Script' : '';
	return [br, os].filter(Boolean).join(' on ') || 'Unknown device';
}
function when(ms) {
	if (!ms) return '—';
	return new Date(ms).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
function ago(ms) {
	if (!ms) return '—';
	const s = Math.max(0, (Date.now() - ms) / 1000);
	if (s < 90) return 'just now';
	if (s < 5400) return Math.round(s / 60) + ' min ago';
	if (s < 129600) return Math.round(s / 3600) + ' h ago';
	return Math.round(s / 86400) + ' days ago';
}
export function bounce(to, cookie) {
	const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
	if (cookie) h.append('Set-Cookie', cookie);
	return new Response(null, { status: 303, headers: h });
}
function cookieFor(value, exp, url) {
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	if (!exp) return COOKIE + '=; Path=' + INTERNAL + '; Max-Age=0; HttpOnly; SameSite=Lax' + secure;
	return COOKIE + '=' + value + '; Path=' + INTERNAL + '; Expires=' + new Date(exp).toUTCString() + '; HttpOnly; SameSite=Lax' + secure;
}
function nextPath(v) {
	v = String(v || '');
	if (!v.startsWith(INTERNAL) || v.startsWith('//') || v.startsWith(INTERNAL + '/login') || v.startsWith(INTERNAL + '/logout')) return HOME;
	return v;
}
async function form(request) { const f = {}; try { (await request.formData()).forEach((v, k) => { f[k] = String(v); }); } catch (e) {} return f; }

/* ---------- people ---------- */
async function loadStore(env) {
	if (!env.TOOLS_KV) return null;
	const s = await env.TOOLS_KV.get(STORE, 'json').catch(() => null);
	if (s && s.secret && s.users) return s;
	// the single login set on the earlier Account page becomes the first owner
	const old = await env.TOOLS_KV.get(LEGACY, 'json').catch(() => null);
	if (old && old.user && old.hash && old.salt) {
		const t = Date.parse(old.updated) || Date.now();
		const store = { secret: randomHex(32), users: { [old.user]: { role: 'owner', access: 'all', salt: old.salt, hash: old.hash, created: t, updated: t } } };
		await env.TOOLS_KV.put(STORE, JSON.stringify(store));
		return store;
	}
	return null;
}
const saveStore = (env, store) => env.TOOLS_KV.put(STORE, JSON.stringify(store));
const owners = (store) => Object.keys(store.users).filter(n => store.users[n].role === 'owner' && !store.users[n].disabled);

async function log(env, request, entry) {
	if (!env.TOOLS_KV) return;
	try {
		const w = where(request);
		const list = (await env.TOOLS_KV.get(LOG, 'json')) || [];
		list.unshift(Object.assign({ t: Date.now(), ip: w.ip, co: w.co, ci: w.ci, ua: w.ua.slice(0, 160) }, entry));
		await env.TOOLS_KV.put(LOG, JSON.stringify(list.slice(0, LOG_MAX)));
	} catch (e) {}
}

/* ---------- sessions ---------- */
async function startSession(env, request, url, store, name) {
	const id = randomHex(16), now = Date.now(), exp = now + DAYS * 86400e3, w = where(request);
	await env.TOOLS_KV.put(SESS + name + ':' + id, '1', { expirationTtl: DAYS * 86400, metadata: { c: now, l: now, e: exp, ip: w.ip, co: w.co, ci: w.ci, ua: w.ua.slice(0, 200) } });
	const v = encodeURIComponent(name) + '.' + id;
	return cookieFor(v + '.' + (await hmac(store, env, v)), exp, url);
}
async function readSession(request, env, store) {
	const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
	if (!m || !store) return null;
	const parts = m[1].split('.');
	if (parts.length !== 3) return null;
	const v = parts[0] + '.' + parts[1];
	if (!(await sameString(parts[2], await hmac(store, env, v)))) return null;
	let name; try { name = decodeURIComponent(parts[0]); } catch (e) { return null; }
	const user = store.users[name];
	if (!user || user.disabled) return null;
	const key = SESS + name + ':' + parts[1];
	const got = await env.TOOLS_KV.getWithMetadata(key);
	if (!got || got.value === null || !got.metadata) return null;
	const meta = got.metadata, now = Date.now();
	if (meta.e < now) return null;
	if (now - meta.l > TOUCH_MS) {   // note when it was last used, at most every 10 minutes
		const w = where(request);
		Object.assign(meta, { l: now, ip: w.ip || meta.ip, co: w.co || meta.co, ci: w.ci || meta.ci });
		await env.TOOLS_KV.put(key, '1', { expirationTtl: Math.max(60, Math.floor((meta.e - now) / 1000)), metadata: meta }).catch(() => {});
	}
	return { name, user, id: parts[1], key, meta, csrf: (await hmac(store, env, 'csrf.' + parts[1])).slice(0, 32) };
}
async function sessions(env, name) {
	const out = []; let cursor;
	for (let i = 0; i < 10; i++) {
		const r = await env.TOOLS_KV.list({ prefix: SESS + (name ? name + ':' : ''), cursor });
		r.keys.forEach(k => { const p = k.name.slice(SESS.length), j = p.lastIndexOf(':'); if (k.metadata) out.push({ key: k.name, name: p.slice(0, j), id: p.slice(j + 1), meta: k.metadata }); });
		if (r.list_complete) break;
		cursor = r.cursor;
	}
	return out.filter(s => s.meta.e > Date.now()).sort((a, b) => b.meta.l - a.meta.l);
}
async function endSessions(env, name, keepId) {
	const list = await sessions(env, name);
	await Promise.all(list.filter(s => s.id !== keepId).map(s => env.TOOLS_KV.delete(s.key)));
	return list.filter(s => s.id !== keepId).length;
}

/* ---------- the gate ---------- */
// deps: { adminPass, toolsState, json, page }   page(title, bodyHtml, backHtml, status, wide) draws the window
export async function internal(request, env, url, deps) {
	const { json } = deps;
	if (!env.TOOLS_KV) return new Response('Internal login is not configured (TOOLS_KV is missing).', { status: 503 });
	const store = await loadStore(env);
	if (!store && !(env.INTERNAL_USER && env.INTERNAL_PASSWORD)) return new Response('Internal login is not configured (set INTERNAL_USER and INTERNAL_PASSWORD).', { status: 503 });
	const p = url.pathname;

	if (p === INTERNAL + '/logout') {
		const s = await readSession(request, env, store);
		if (s) { await env.TOOLS_KV.delete(s.key); await log(env, request, { ev: 'logout', u: s.name }); }
		return bounce('/', cookieFor('', 0, url));
	}
	if (p === INTERNAL + '/login' && request.method === 'POST') return login(request, env, url, store, deps);

	// An agent (Claude) may use the admin API with a token instead of the login: secret AGENT_TOKEN, sent as
	// "Authorization: Bearer …". Only /internal/admin/api/*, never the pages; it can read and write but not delete,
	// and what it writes is marked in the activity log. No secret set = no token access.
	if (p.startsWith(INTERNAL + '/admin/api/')) {
		const auth = request.headers.get('Authorization') || '';
		if (auth.startsWith('Bearer ')) {
			const ok = env.AGENT_TOKEN && String(env.AGENT_TOKEN).length >= 32 && (await sameString(auth.slice(7).trim(), env.AGENT_TOKEN));
			if (!ok) { await wait(700); return json({ error: 'bad token' }, 401); }
			if (request.method === 'DELETE') return json({ error: 'the agent token cannot delete' }, 403);
			const h = new Headers(request.headers);
			h.delete('Authorization'); h.set('X-OM-Note', 'agent');
			return deps.adminPass(new Request(request, { headers: h }), env);
		}
	}

	const s = await readSession(request, env, store);
	if (!s) return loginPage(deps, nextPath(p + url.search), '', 401);

	if (p === INTERNAL + '/account' || p === INTERNAL + '/account/') return request.method === 'POST' ? accountPost(request, env, url, store, s, deps) : accountPage(env, store, s, deps, url.searchParams.get('done'), '');
	if (p === INTERNAL + '/account/people' || p === INTERNAL + '/account/people/') {
		if (s.user.role !== 'owner') return deps.page('People', '<p class="tools-login-intro">Only an owner can manage people.</p>', back(), 403);
		return request.method === 'POST' ? peoplePost(request, env, url, store, s, deps) : peoplePage(env, store, s, deps, '', '');
	}
	// a new password must be chosen before anything else opens
	if (s.user.mustChange) return p.includes('/api/') ? json({ error: 'choose your own password first' }, 403) : bounce(INTERNAL + '/account');
	if (p === INTERNAL + '/login') return bounce(HOME);

	const tools = p === INTERNAL || p === HOME || p === INTERNAL + '/index.html' || p === INTERNAL + '/tools' || p.startsWith(INTERNAL + '/tools/');
	if (s.user.access !== 'all' && !tools) return p.includes('/api/') ? json({ error: 'not allowed for this login' }, 403) : deps.page('Not available', '<p class="tools-login-intro">Your login opens the workshop tools only.</p>', back(), 403);

	if (p === INTERNAL + '/tools/api/state') return deps.toolsState(request, env);
	if (p === INTERNAL + '/admin' || p.startsWith(INTERNAL + '/admin/')) return deps.adminPass(request, env);
	const res = await env.ASSETS.fetch(request);
	const out = new Response(res.body, res);
	out.headers.set('Cache-Control', 'private, no-store');
	out.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return out;
}

async function login(request, env, url, store, deps) {
	const f = await form(request), next = nextPath(f.next);
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown', failKey = 'login-fail:' + ip;
	const fails = Number(await env.TOOLS_KV.get(failKey)) || 0;
	const name = String(f.user || '').trim().slice(0, 64), pass = String(f.pass || '');
	if (fails >= MAX_FAILS) { await wait(700); return loginPage(deps, next, 'Too many tries. Wait half an hour and try again.', 429); }

	let ok = false;
	if (store) {
		const u = store.users[name];
		const hash = await pbkdf2(pass, u ? u.salt : '00000000000000000000000000000000');   // same work whether or not the name exists
		ok = !!u && !u.disabled && (await sameString(hash, u.hash));
	} else if ((await sameString(name, env.INTERNAL_USER)) & (await sameString(pass, env.INTERNAL_PASSWORD))) {
		// first sign-in with the secrets: they become the first owner
		store = { secret: randomHex(32), users: { [name]: Object.assign({ role: 'owner', access: 'all', created: Date.now(), updated: Date.now() }, await hashNew(pass)) } };
		ok = true;
	}
	if (!ok) {
		await env.TOOLS_KV.put(failKey, String(fails + 1), { expirationTtl: 1800 });
		await log(env, request, { ev: 'failed', u: name.replace(/[^\w.@-]/g, '').slice(0, 40) });
		await wait(700);
		return loginPage(deps, next, 'Those details did not match.', 401);
	}
	if (fails) await env.TOOLS_KV.delete(failKey);
	store.users[name].lastLogin = Date.now();
	await saveStore(env, store);
	await log(env, request, { ev: 'login', u: name });
	const cookie = await startSession(env, request, url, store, name);
	return bounce(store.users[name].mustChange ? INTERNAL + '/account' : next, cookie);
}

/* ---------- pages ---------- */
const back = () => `<a class="pill" href="${HOME}"><span class="arr arr-back">←</span>&nbsp;Back</a>`;
function loginPage(deps, next, error, status) {
	return deps.page('Internal', `
			<form class="tools-login-form" method="post" action="${INTERNAL}/login" autocomplete="on">
				<input type="hidden" name="next" value="${escHtml(next)}">
				<p class="tools-login-intro">Studio-only pages. Sign in to continue.</p>
				<div class="field"><label for="t-user">Name</label><input id="t-user" name="user" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus></div>
				<div class="field"><label for="t-pass">Password</label><input id="t-pass" name="pass" type="password" autocomplete="current-password" required></div>
				<div class="tools-login-actions">
					<button class="tools-send" type="submit">Enter&nbsp;<span class="arr">→</span></button>
					${error ? `<p class="tools-login-error" role="alert">${escHtml(error)}</p>` : ''}
				</div>
			</form>`, '<a class="pill" href="https://organisedmess.studio/"><span class="arr arr-back">←</span>&nbsp;Back to the studio</a>', status);
}
const field = (name, label, type, ac, extra, id) => `<div class="field"><label for="a-${id || name}">${label}</label><input id="a-${id || name}" name="${name}" type="${type}" autocomplete="${ac}" autocapitalize="off" spellcheck="false" ${extra || ''}></div>`;
const hidden = (o) => Object.keys(o).map(k => `<input type="hidden" name="${k}" value="${escHtml(o[k])}">`).join('');
const btn = (label, cls) => `<button class="acct-btn${cls ? ' ' + cls : ''}" type="submit">${label}</button>`;
const msgHtml = (error, note) => error ? `<p class="tools-login-error" role="alert">${escHtml(error)}</p>` : note ? `<p class="acct-note" role="status">${note}</p>` : '';
const place = (m) => [m.ci, m.co].filter(Boolean).join(', ') + (m.ip ? `<br><small>${escHtml(m.ip)}</small>` : '');

function sessionRows(list, s, action, csrf, showName) {
	if (!list.length) return '<p class="acct-empty">No one is signed in.</p>';
	return `<div class="acct-scroll"><table class="acct-table"><thead><tr>${showName ? '<th>Person</th>' : ''}<th>Device</th><th>Where</th><th>Signed in</th><th>Last active</th><th></th></tr></thead><tbody>${list.map(x => `<tr>
		${showName ? `<td>${escHtml(x.name)}</td>` : ''}<td>${escHtml(device(x.meta.ua))}${x.id === s.id ? ' <span class="acct-tag">this device</span>' : ''}</td>
		<td>${place(x.meta)}</td><td>${when(x.meta.c)}</td><td>${ago(x.meta.l)}</td>
		<td>${x.id === s.id ? '' : `<form method="post" action="${action}">${hidden({ csrf, action: 'revoke', name: x.name, id: x.id })}${btn('Sign out')}</form>`}</td></tr>`).join('')}</tbody></table></div>`;
}

async function accountPage(env, store, s, deps, done, error, status) {
	const u = s.user, mine = await sessions(env, s.name);
	const notes = { saved: 'Password changed. Every other device has been signed out.', others: 'Every other device has been signed out.', revoked: 'That device has been signed out.' };
	const body = `
		<section class="acct-sec">
			<h2>${escHtml(s.name)}</h2>
			<p class="tools-login-intro">${u.mustChange ? 'Choose your own password to continue. The temporary one stops working once you save.' : escHtml(ACCESS[u.access] || u.access) + (u.role === 'owner' ? ' · owner' : '') + (u.updated ? ' · password last changed ' + when(u.updated) : '')}</p>
			${msgHtml(error, notes[done])}
		</section>
		<form class="tools-login-form acct-sec" method="post" action="${INTERNAL}/account">
			<h3>${u.mustChange ? 'Choose a password' : 'Change password'}</h3>
			${hidden({ csrf: s.csrf, action: 'password' })}
			${field('current', u.mustChange ? 'Temporary password' : 'Current password', 'password', 'current-password', 'required' + (u.mustChange ? ' autofocus' : ''))}
			${field('pass', 'New password (12+ characters)', 'password', 'new-password', 'required minlength="12"')}
			${field('pass2', 'New password again', 'password', 'new-password', 'required minlength="12"')}
			<div class="tools-login-actions"><button class="tools-send" type="submit">Save&nbsp;<span class="arr">→</span></button></div>
		</form>
		${u.mustChange ? '' : `
		<section class="acct-sec">
			<h3>Your devices</h3>
			${sessionRows(mine, s, INTERNAL + '/account', s.csrf, false)}
			${mine.length > 1 ? `<form method="post" action="${INTERNAL}/account">${hidden({ csrf: s.csrf, action: 'others' })}${btn('Sign out all other devices')}</form>` : ''}
		</section>
		${u.role === 'owner' ? `<section class="acct-sec"><h3>People</h3><p class="tools-login-intro">Who can sign in, when they did, and what they can open.</p><a class="pill" href="${INTERNAL}/account/people">Manage people&nbsp;<span class="arr">→</span></a></section>` : ''}`}`;
	return deps.page('Account', body, u.mustChange ? `<a class="pill" href="${INTERNAL}/logout">Log out</a>` : back(), status || 200, true);
}

async function accountPost(request, env, url, store, s, deps) {
	const f = await form(request);
	const again = (msg, st) => accountPage(env, store, s, deps, '', msg, st || 400);
	if (!(await sameString(f.csrf || '', s.csrf))) return again('That form had expired. Try again.', 403);
	if (f.action === 'revoke') {
		if (f.name !== s.name || !/^[0-9a-f]{32}$/.test(f.id || '')) return again('Not found.', 404);
		await env.TOOLS_KV.delete(SESS + s.name + ':' + f.id);
		await log(env, request, { ev: 'signed out a device', u: s.name, by: s.name });
		return bounce(INTERNAL + '/account?done=revoked');
	}
	if (f.action === 'others') {
		const n = await endSessions(env, s.name, s.id);
		await log(env, request, { ev: 'signed out ' + n + ' other device(s)', u: s.name, by: s.name });
		return bounce(INTERNAL + '/account?done=others');
	}
	if (f.action !== 'password') return again('Unknown action.');
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown', failKey = 'login-fail:' + ip;
	const fails = Number(await env.TOOLS_KV.get(failKey)) || 0;
	if (fails >= MAX_FAILS) return again('Too many tries. Wait half an hour and try again.', 429);
	if (!(await sameString(await pbkdf2(f.current || '', s.user.salt), s.user.hash))) {
		await env.TOOLS_KV.put(failKey, String(fails + 1), { expirationTtl: 1800 });
		await wait(700);
		return again('Your current password did not match.', 401);
	}
	const pass = f.pass || '';
	if (pass.length < 12) return again('Use a password of at least 12 characters.');
	if (pass.length > 200) return again('That password is too long.');
	if (pass !== (f.pass2 || '')) return again('The two new passwords are not the same.');
	if (pass === f.current) return again('Choose a password different from the current one.');
	Object.assign(store.users[s.name], await hashNew(pass), { updated: Date.now(), mustChange: false });
	await saveStore(env, store);
	if (fails) await env.TOOLS_KV.delete(failKey);
	await endSessions(env, s.name, s.id);
	await log(env, request, { ev: 'changed password', u: s.name, by: s.name });
	return bounce(INTERNAL + '/account?done=saved');
}

async function peoplePage(env, store, s, deps, error, note, status) {
	const all = await sessions(env, '');
	const logList = ((await env.TOOLS_KV.get(LOG, 'json')) || []).slice(0, 120);
	const action = INTERNAL + '/account/people', csrf = s.csrf;
	const names = Object.keys(store.users).sort((a, b) => (store.users[b].lastLogin || 0) - (store.users[a].lastLogin || 0));
	const count = (n) => all.filter(x => x.name === n).length;
	const row = (n) => {
		const u = store.users[n], me = n === s.name, h = hidden({ csrf, name: n });
		const sel = (key, opts) => `<select name="${key}"${me ? ' disabled' : ''} onchange="this.form.submit()">${Object.keys(opts).map(k => `<option value="${k}"${(u[key] || '') === k ? ' selected' : ''}>${opts[k]}</option>`).join('')}</select>`;
		return `<tr${u.disabled ? ' class="acct-off"' : ''}>
			<td><strong>${escHtml(n)}</strong>${me ? ' <span class="acct-tag">you</span>' : ''}${u.mustChange ? ' <span class="acct-tag">temporary password</span>' : ''}${u.disabled ? ' <span class="acct-tag">blocked</span>' : ''}<br><small>added ${when(u.created)}</small></td>
			<td><form method="post" action="${action}">${h}${hidden({ action: 'set' })}${sel('access', ACCESS)} ${sel('role', { member: 'Member', owner: 'Owner' })}</form></td>
			<td>${when(u.lastLogin)}<br><small>${ago(u.lastLogin)}</small></td>
			<td>${count(n)}</td>
			<td class="acct-actions">${me ? '<small>Manage yourself on <a href="' + INTERNAL + '/account">your account</a></small>' : `
				${count(n) ? `<form method="post" action="${action}">${h}${hidden({ action: 'signout' })}${btn('Sign out everywhere')}</form>` : ''}
				<form method="post" action="${action}">${h}${hidden({ action: u.disabled ? 'unblock' : 'block' })}${btn(u.disabled ? 'Unblock' : 'Block')}</form>
				<form method="post" action="${action}">${h}${hidden({ action: 'reset' })}${btn('New temporary password')}</form>
				<form method="post" action="${action}" onsubmit="return confirm('Remove ${escHtml(n)}? They will be signed out and cannot sign in again.')">${h}${hidden({ action: 'remove' })}${btn('Remove', 'acct-danger')}</form>`}</td></tr>`;
	};
	const logRows = logList.map(e => `<tr${e.ev === 'failed' ? ' class="acct-bad"' : ''}><td>${when(e.t)}</td><td>${escHtml(e.u || '')}</td><td>${escHtml(e.ev === 'failed' ? 'wrong password' : e.ev)}${e.by && e.by !== e.u ? ' <small>by ' + escHtml(e.by) + '</small>' : ''}</td><td>${escHtml(device(e.ua))}</td><td>${place(e)}</td></tr>`).join('');
	const failed24 = logList.filter(e => e.ev === 'failed' && e.t > Date.now() - 86400e3).length;
	const body = `
		<section class="acct-sec">
			<h2>People</h2>
			<p class="tools-login-intro">${names.length} ${names.length === 1 ? 'person' : 'people'} · ${all.length} signed-in device${all.length === 1 ? '' : 's'} · ${failed24} wrong password${failed24 === 1 ? '' : 's'} in the last 24 hours</p>
			${msgHtml(error, note)}
		</section>
		<section class="acct-sec">
			<div class="acct-scroll"><table class="acct-table"><thead><tr><th>Name</th><th>Can open</th><th>Last sign-in</th><th>Devices</th><th></th></tr></thead><tbody>${names.map(row).join('')}</tbody></table></div>
		</section>
		<form class="tools-login-form acct-sec acct-add" method="post" action="${action}">
			<h3>Add someone</h3>
			${hidden({ csrf, action: 'add' })}
			${field('name', 'Name they sign in with', 'text', 'off', 'required minlength="3" maxlength="64" pattern="[A-Za-z0-9._@\\-]{3,64}"', 'new-name')}
			<div class="field"><label for="a-new-access">Can open</label><select id="a-new-access" name="access">${Object.keys(ACCESS).map(k => `<option value="${k}"${k === 'tools' ? ' selected' : ''}>${ACCESS[k]}</option>`).join('')}</select></div>
			<div class="tools-login-actions"><button class="tools-send" type="submit">Add&nbsp;<span class="arr">→</span></button></div>
			<p class="acct-hint">They get a temporary password (shown once, here) and choose their own when they first sign in.</p>
		</form>
		<section class="acct-sec">
			<h3>Signed-in devices</h3>
			${sessionRows(all, s, action, csrf, true)}
		</section>
		<section class="acct-sec">
			<h3>Sign-in activity</h3>
			${logRows ? `<div class="acct-scroll acct-log"><table class="acct-table"><thead><tr><th>When</th><th>Name</th><th>What</th><th>Device</th><th>Where</th></tr></thead><tbody>${logRows}</tbody></table></div>` : '<p class="acct-empty">Nothing yet.</p>'}
		</section>`;
	return deps.page('People', body, `<a class="pill" href="${INTERNAL}/account"><span class="arr arr-back">←</span>&nbsp;Your account</a>`, status || 200, true);
}

async function peoplePost(request, env, url, store, s, deps) {
	const f = await form(request);
	const again = (msg, st) => peoplePage(env, store, s, deps, msg, '', st || 400);
	if (!(await sameString(f.csrf || '', s.csrf))) return again('That form had expired. Try again.', 403);
	const n = String(f.name || '').trim(), u = store.users[n], by = s.name;
	const done = async (ev, note) => { await log(env, request, { ev, u: n, by }); return peoplePage(env, store, s, deps, '', note); };

	if (f.action === 'add') {
		if (!NAME_RE.test(n)) return again('A name is 3–64 letters, numbers or . _ @ -');
		if (store.users[n]) return again('Someone already has that name.');
		const temp = tempPassword(), access = ACCESS[f.access] ? f.access : 'tools';
		store.users[n] = Object.assign({ role: 'member', access, created: Date.now(), updated: Date.now(), mustChange: true }, await hashNew(temp));
		await saveStore(env, store);
		return done('added (' + ACCESS[access].toLowerCase() + ')', `Added <strong>${escHtml(n)}</strong>. Their temporary password is <code class="acct-code">${escHtml(temp)}</code> — send it to them privately. It is shown only once; they choose their own when they first sign in.`);
	}
	if (f.action === 'revoke') {
		if (!/^[0-9a-f]{32}$/.test(f.id || '') || f.id === s.id) return again('Not found.', 404);
		await env.TOOLS_KV.delete(SESS + n + ':' + f.id);
		return done('signed out a device', 'Signed out one of ' + escHtml(n) + '’s devices.');
	}
	if (!u) return again('No one by that name.', 404);
	if (n === s.name) return again('Manage your own login on your account page.');

	if (f.action === 'signout') { const c = await endSessions(env, n, ''); return done('signed out everywhere', `Signed ${escHtml(n)} out of ${c} device${c === 1 ? '' : 's'}.`); }
	if (f.action === 'block') { u.disabled = true; await saveStore(env, store); await endSessions(env, n, ''); return done('blocked', `${escHtml(n)} is blocked and signed out everywhere.`); }
	if (f.action === 'unblock') { u.disabled = false; await saveStore(env, store); return done('unblocked', `${escHtml(n)} can sign in again.`); }
	if (f.action === 'reset') {
		const temp = tempPassword();
		Object.assign(u, await hashNew(temp), { mustChange: true, updated: Date.now() });
		await saveStore(env, store); await endSessions(env, n, '');
		return done('given a new temporary password', `${escHtml(n)} is signed out everywhere. Their new temporary password is <code class="acct-code">${escHtml(temp)}</code> — shown only once.`);
	}
	if (f.action === 'remove') {
		if (u.role === 'owner' && owners(store).length <= 1) return again('Keep at least one owner.');
		delete store.users[n]; await saveStore(env, store); await endSessions(env, n, '');
		return done('removed', `${escHtml(n)} has been removed.`);
	}
	if (f.action === 'set') {
		if (f.access && ACCESS[f.access]) u.access = f.access;
		if (f.role === 'owner' || f.role === 'member') {
			if (u.role === 'owner' && f.role === 'member' && owners(store).length <= 1) return again('Keep at least one owner.');
			u.role = f.role;
		}
		if (u.role === 'owner') u.access = 'all';   // owners open everything
		await saveStore(env, store);
		return done('now ' + ACCESS[u.access].toLowerCase() + (u.role === 'owner' ? ', owner' : ''), `Updated ${escHtml(n)}.`);
	}
	return again('Unknown action.');
}
