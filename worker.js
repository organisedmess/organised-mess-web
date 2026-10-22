// organisedmess.studio — tiny Worker in front of the static assets.
// Serves the Capabilities deep link (the page, not a redirect) and marks the
// workers.dev staging host noindex. Everything else passes straight through.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let res;
		if (/^\/capabilities\/?$/.test(url.pathname)) {
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
