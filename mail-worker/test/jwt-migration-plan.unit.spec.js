import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	HISTORICAL_MANAGED_VARS,
	canonicalManagedVars,
	declaredVars,
	planJwtMigration,
} from '../scripts/plan-jwt-migration.mjs';

/**
 * The one-time legacy `jwt_secret` migration drops every plain-text binding the
 * generated config does not declare. These tests lock the classification that
 * makes that safe:
 *
 *   - a repository-managed `vapid_subject` is recognized and preserved;
 *   - a genuinely unknown variable still aborts the migration;
 *   - a normal deployment never enters the migration path;
 *   - a Worker Secret named `vapid_subject` is never shadowed by a [vars] entry;
 *   - binding names are compared exactly (Cloudflare names are case-sensitive).
 */

const configText = readFileSync(new URL('../wrangler-action.toml', import.meta.url), 'utf8');

const legacyJwt = { name: 'jwt_secret', type: 'plain_text' };
const managedVars = [
	{ name: 'domain', type: 'plain_text' },
	{ name: 'admin', type: 'plain_text' },
	{ name: 'ai_model', type: 'plain_text' },
	{ name: 'analysis_cache', type: 'json' },
	{ name: 'project_link', type: 'plain_text' },
	{ name: 'TURNSTILE_HOSTNAME', type: 'plain_text' },
];

describe('canonical managed binding set', () => {
	it('parses only the keys declared in the generated [vars] table', () => {
		const declared = declaredVars(configText);
		expect(declared).toEqual(expect.arrayContaining([
			'ai_model', 'analysis_cache', 'domain', 'admin', 'project_link',
			'TURNSTILE_HOSTNAME', 'vapid_subject',
		]));
		// Values are placeholders, not keys.
		expect(declared).not.toContain('AI_MODEL');
		// The `[build]` table must not leak into the set.
		expect(declared).not.toContain('command');
	});

	it('includes historical Web Push identifiers even when the config omits them', () => {
		expect(HISTORICAL_MANAGED_VARS).toEqual(expect.arrayContaining(['vapid_subject', 'vapid_public_key']));
		expect(canonicalManagedVars([])).toEqual(expect.arrayContaining(['vapid_subject', 'vapid_public_key']));
	});
});

describe('legacy jwt_secret migration planning', () => {
	it('allows the migration when the only extra binding is vapid_subject', () => {
		const plan = planJwtMigration({
			configText,
			bindings: [legacyJwt, ...managedVars, { name: 'vapid_subject', type: 'plain_text' }],
		});

		expect(plan.legacy_jwt_var).toBe(true);
		expect(plan.unexpected).toEqual([]);
		// The plain-text subject stays a [vars] entry, so nothing is dropped.
		expect(plan.vapid_subject_binding).toBe('plain_text');
		expect(plan.drop_vapid_subject_var).toBe(false);
	});

	it('aborts on a genuinely unknown plain-text variable', () => {
		const plan = planJwtMigration({
			configText,
			bindings: [legacyJwt, ...managedVars, { name: 'vapid_subject', type: 'plain_text' }, { name: 'some_unknown_custom_var', type: 'plain_text' }],
		});

		expect(plan.legacy_jwt_var).toBe(true);
		expect(plan.unexpected).toEqual(['some_unknown_custom_var']);
	});

	it('never treats jwt_secret itself as an unknown variable', () => {
		const plan = planJwtMigration({ configText, bindings: [legacyJwt] });
		expect(plan.unexpected).toEqual([]);
	});

	it('does not enter the migration path without a plain-text jwt_secret', () => {
		const plan = planJwtMigration({
			configText,
			bindings: [...managedVars, { name: 'vapid_subject', type: 'plain_text' }],
		});

		expect(plan.legacy_jwt_var).toBe(false);
		expect(plan.unexpected).toEqual([]);
	});

	it('ignores Worker Secrets, including vapid_private_key, when checking plain-text vars', () => {
		const plan = planJwtMigration({
			configText,
			bindings: [
				legacyJwt,
				...managedVars,
				{ name: 'vapid_subject', type: 'secret_text' },
				{ name: 'vapid_private_key', type: 'secret_text' },
				{ name: 'vapid_public_key', type: 'secret_text' },
				{ name: 'jwt_secret', type: 'secret_text' },
			],
		});

		expect(plan.unexpected).toEqual([]);
		// A secret with this name must not be shadowed by the [vars] entry.
		expect(plan.vapid_subject_binding).toBe('secret_text');
		expect(plan.drop_vapid_subject_var).toBe(true);
	});

	it('compares binding names exactly: an uppercase VAPID_SUBJECT is not managed', () => {
		const plan = planJwtMigration({
			configText,
			bindings: [legacyJwt, ...managedVars, { name: 'VAPID_SUBJECT', type: 'plain_text' }],
		});

		expect(plan.unexpected).toEqual(['VAPID_SUBJECT']);
	});
});
