/**
 * Keep the SPA Content-Security-Policy's inline-script hash in sync with the
 * first-paint theme script in `mail-vue/index.html`.
 *
 * The Worker serves the SPA with `script-src … 'sha256-<hash>'` and no
 * `'unsafe-inline'`, so the hash has to match the inline `<script>` byte for
 * byte. Editing that script (theme tokens, status-bar colours, …) changes the
 * hash, and a stale value makes the browser drop the script, so the first frame
 * loses its colours.
 *
 *   node scripts/sync-spa-csp.mjs          rewrite src/security/spa-csp.js
 *   node scripts/sync-spa-csp.mjs --check  exit 1 when the hash is stale
 *
 * `mail-vue`'s Vite build runs the sync automatically, and
 * `test/spa-csp.unit.spec.js` independently re-derives the hash from
 * index.html, so CI fails loudly on drift instead of shipping a CSP that
 * blocks the first paint.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const INDEX_HTML = resolve(REPO_ROOT, 'mail-vue', 'index.html');
export const CSP_MODULE = resolve(HERE, '..', 'src', 'security', 'spa-csp.js');

// The same shape the browser and the unit test use: the body of every inline
// <script>. External <script src> tags have an empty body and are ignored.
const INLINE_SCRIPT_RE = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const HASH_LITERAL_RE = /'sha256-[A-Za-z0-9+/]+={0,2}'/g;

/** Base64 sha256 of the single inline first-paint script in `html`. */
export function inlineScriptHash(html) {
	const inline = [...html.matchAll(INLINE_SCRIPT_RE)].map(match => match[1]).filter(Boolean);
	if (inline.length !== 1) {
		throw new Error(`expected exactly one inline <script> in index.html, found ${inline.length}`);
	}
	return createHash('sha256').update(inline[0]).digest('base64');
}

/**
 * Rewrite, or with `check` verify, the inline-script hash in the CSP module.
 * Returns a small summary so a build can log what it did.
 */
export function syncSpaCspHash({ html = readFileSync(INDEX_HTML, 'utf8'), modulePath = CSP_MODULE, check = false } = {}) {
	const expected = `sha256-${inlineScriptHash(html)}`;
	const source = readFileSync(modulePath, 'utf8');
	const found = [...source.matchAll(HASH_LITERAL_RE)].map(match => match[0].slice(1, -1));
	if (found.length !== 1) {
		throw new Error(`expected exactly one 'sha256-…' literal in ${relative(REPO_ROOT, modulePath)}, found ${found.length}`);
	}
	if (found[0] === expected) return { changed: false, hash: expected, previous: found[0] };
	if (check) return { changed: true, hash: expected, previous: found[0] };
	writeFileSync(modulePath, source.replace(HASH_LITERAL_RE, `'${expected}'`));
	return { changed: true, hash: expected, previous: found[0] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const check = process.argv.includes('--check');
	try {
		const result = syncSpaCspHash({ check });
		if (!result.changed) {
			console.log(`SPA CSP hash is in sync (${result.hash}).`);
		} else if (check) {
			console.error(
				`SPA CSP hash is stale: found ${result.previous}, expected ${result.hash}. ` +
					"Run 'node scripts/sync-spa-csp.mjs' (or any frontend build) to update it.",
			);
			process.exitCode = 1;
		} else {
			console.log(`SPA CSP hash updated: ${result.previous} -> ${result.hash}.`);
		}
	} catch (error) {
		console.error(`Could not sync the SPA CSP hash: ${error.message}`);
		process.exitCode = 1;
	}
}
