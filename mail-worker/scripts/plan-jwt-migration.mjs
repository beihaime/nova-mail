#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Plan the one-time legacy `jwt_secret` migration for a deployment.
 *
 * A Worker cannot hold a plain-text binding and a Worker Secret with the same
 * name. Installations deployed before the JWT hardening still hold
 * `jwt_secret` as a plain-text binding, so exactly one deployment must run with
 * `keep_vars = false` to drop it while the signing key is uploaded as a Secret.
 *
 * Dropping undeclared plain-text vars is only safe when every other live
 * plain-text binding is one this repository manages. The managed set therefore
 * has to be complete and exact, because Cloudflare binding names are
 * case-sensitive (`TURNSTILE_HOSTNAME` and `vapid_subject` are spelled exactly
 * as the Worker reads them).
 *
 * This module is deliberately pure: it receives the live bindings and the
 * generated Wrangler config and returns the plan. `scripts/plan-jwt-migration`
 * (the CLI wrapper) and the unit tests share it, so the tested logic is the
 * logic the pipeline runs.
 */

/**
 * Ordinary (plain-text / json) Worker bindings this repository manages,
 * including names supported by earlier releases that may still exist as
 * plain-text bindings on an older Worker.
 *
 * Secrets are deliberately absent: `jwt_secret` is the binding being migrated
 * and `vapid_private_key` / `vapid_public_key` are uploaded as Worker Secrets
 * by the push-key step, so they never appear as plain-text bindings. The
 * migration guard only inspects plain-text/json bindings anyway; listing secret
 * names here would change nothing and would blur the classification.
 *
 * `vapid_subject` is a public `mailto:`/`https:` contact identifier. It is
 * declared as an ordinary `[vars]` entry (see wrangler-action.toml) and is also
 * listed here so a historical plain-text binding is recognized even if the
 * generated config ever stops declaring it.
 */
export const HISTORICAL_MANAGED_VARS = Object.freeze([
	'ai_model',
	'analysis_cache',
	'domain',
	'admin',
	'project_link',
	'TURNSTILE_HOSTNAME',
	'vapid_subject',
	'vapid_public_key',
]);

const PLAIN_BINDING_TYPES = new Set(['plain_text', 'json']);

/** Keys declared in the generated `[vars]` table, in file order. */
export function declaredVars(configText) {
	const vars = [];
	let inVars = false;
	for (const line of String(configText).split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			inVars = /^\s*\[vars\]\s*$/.test(line);
			continue;
		}
		if (!inVars) continue;
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (match) vars.push(match[1]);
	}
	return vars;
}

/**
 * The complete set of ordinary binding names this repository manages:
 * everything the generated config declares, plus the historical names.
 * Order is stable and deduplicated so the workflow can print it for review.
 */
export function canonicalManagedVars(declared = [], historical = HISTORICAL_MANAGED_VARS) {
	return [...new Set([...historical, ...declared])];
}

function plainBindings(bindings) {
	return (Array.isArray(bindings) ? bindings : []).filter(
		(binding) => binding && PLAIN_BINDING_TYPES.has(binding.type),
	);
}

/**
 * @param {{ bindings?: Array<{name?: string, type?: string}>, configText?: string }} input
 * @returns {{
 *   legacy_jwt_var: boolean,
 *   managed: string[],
 *   unexpected: string[],
 *   vapid_subject_binding: 'plain_text'|'json'|'secret_text'|'absent',
 *   drop_vapid_subject_var: boolean,
 * }}
 */
export function planJwtMigration({ bindings = [], configText = '' } = {}) {
	const managed = canonicalManagedVars(declaredVars(configText));
	const managedSet = new Set(managed);
	const plain = plainBindings(bindings);

	const legacyJwt = plain.some((binding) => binding.name === 'jwt_secret');

	// `jwt_secret` is the binding being migrated; every other plain-text binding
	// must be repository-managed or the migration would silently drop it.
	const unexpected = plain
		.map((binding) => binding.name)
		.filter((name) => name && name !== 'jwt_secret' && !managedSet.has(name));

	const vapidSubject = bindings.find((binding) => binding?.name === 'vapid_subject');
	const vapidSubjectBinding = vapidSubject?.type || 'absent';

	return {
		legacy_jwt_var: legacyJwt,
		managed,
		unexpected: [...new Set(unexpected)],
		vapid_subject_binding: vapidSubjectBinding,
		// A Worker Secret with this name must not be shadowed by a plain-text
		// [vars] entry, so the generated var has to be removed in that case.
		drop_vapid_subject_var: vapidSubjectBinding === 'secret_text',
	};
}

function main() {
	const args = process.argv.slice(2);
	const configIndex = args.indexOf('--config');
	const configText = configIndex > -1 && args[configIndex + 1]
		? readFileSync(args[configIndex + 1], 'utf8')
		: '';

	let raw = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (chunk) => { raw += chunk; });
	process.stdin.on('end', () => {
		let settings;
		try {
			settings = JSON.parse(raw);
		} catch {
			console.error('plan-jwt-migration: expected the Cloudflare bindings JSON on stdin');
			process.exit(2);
		}
		const bindings = settings?.result?.bindings || [];
		process.stdout.write(`${JSON.stringify(planJwtMigration({ bindings, configText }), null, 2)}\n`);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
