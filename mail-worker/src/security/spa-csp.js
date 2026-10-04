// The hash permits only index.html's fixed first-paint theme script. It is
// generated from that script by scripts/sync-spa-csp.mjs, which the frontend
// build runs automatically; test/spa-csp.unit.spec.js re-derives it, so a stale
// value fails CI instead of silently blocking the first paint.
export const SPA_CSP = [
	"default-src 'self'",
	"script-src 'self' https://challenges.cloudflare.com 'sha256-kAp+KGQWePKoI/YKEoGlNJt7QL9Lq8B0Q/le7tXiQf0='",
	"style-src 'self' 'unsafe-inline'",
	'img-src \'self\' data: blob: https: http:',
	"font-src 'self' data:",
	"connect-src 'self' https://challenges.cloudflare.com",
	"frame-src 'self' blob: data: https://challenges.cloudflare.com",
	"worker-src 'self' blob:",
	"media-src 'self' data: blob:",
	"manifest-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join('; ');

export function withSpaCsp(response) {
	if (!response.headers.get('Content-Type')?.toLowerCase().includes('text/html')) return response;
	const headers = new Headers(response.headers);
	headers.set('Content-Security-Policy', SPA_CSP);
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
