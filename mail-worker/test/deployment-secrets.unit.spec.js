import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../wrangler-action.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/deploy-cloudflare.yml', import.meta.url), 'utf8');

describe('deployment secret configuration', () => {
	it('never places the JWT signing key in Worker [vars]', () => {
		expect(config).not.toMatch(/^jwt_secret\s*=/m);
		// The generated action config must not splice the value in with sed.
		expect(workflow).not.toContain('s|${JWT_SECRET}|${JWT_SECRET}|g');
		expect(workflow).toContain('JWT_SECRET repository secret is required.');
	});

	it('uploads the secret with the deployment instead of a separate secrets call', () => {
		// The dedicated `/secrets` endpoint refuses a name that a plain-text var
		// already holds and cannot remove that var; a deployment replaces both in
		// one atomic version, so the Worker is never live without a signing key.
		expect(workflow).toContain('wrangler deploy -c wrangler-action.toml --secrets-file "$SECRETS_FILE"');
		expect(workflow).not.toContain('wrangler secret put jwt_secret');
	});

	it('keeps the secret out of logs, arguments, the checkout and artifacts', () => {
		expect(workflow).toContain('SECRETS_FILE="$(mktemp "${RUNNER_TEMP:-/tmp}/nova-jwt.XXXXXX")"');
		expect(workflow).toContain('chmod 600 "$SECRETS_FILE"');
		expect(workflow).toContain('rm -f "$SECRETS_FILE"');
		// Read through stdin (jq -Rs), never through argv.
		expect(workflow).toContain("printf '%s' \"$JWT_SECRET\" | jq -Rs '{jwt_secret: .}' > \"$SECRETS_FILE\"");
		expect(workflow).not.toMatch(/echo[^\n]*\$JWT_SECRET/);
		expect(workflow).not.toMatch(/--arg[^\n]*\$JWT_SECRET/);
	});

	it('migrates a legacy plain-text jwt_secret binding deterministically', () => {
		// Detect the legacy binding through the bindings API...
		expect(workflow).toContain('workers/scripts/$NAME/settings');
		expect(workflow).toContain('legacy_jwt_var');
		// ...and let exactly one deployment drop it, then restore keep_vars.
		expect(workflow).toContain("sed -i 's/^keep_vars *= *true/keep_vars = false/' \"$CONFIG_FILE\"");
		expect(config).toMatch(/^keep_vars = true$/m);
		// An unmanaged plain-text var must never be dropped silently.
		expect(workflow).toContain('this repository does not manage');
	});

	it('classifies live bindings with the tested planner instead of an ad-hoc allowlist', () => {
		expect(workflow).toContain('node scripts/plan-jwt-migration.mjs --config "$CONFIG_FILE"');
		expect(workflow).toContain('.drop_vapid_subject_var');
		// The generated [vars] entry is removed when a Secret already owns the name.
		expect(workflow).toContain("sed -i '/^vapid_subject = /d' \"$CONFIG_FILE\"");
	});

	it('treats vapid_subject as an ordinary binding and keeps the private key a secret', () => {
		expect(config).toMatch(/^vapid_subject\s*=\s*"\$\{VAPID_SUBJECT\}"$/m);
		// Secrets must never be declared as [vars].
		expect(config).not.toMatch(/^vapid_private_key\s*=/m);
		expect(config).not.toMatch(/^vapid_public_key\s*=/m);
		expect(config).not.toMatch(/^jwt_secret\s*=/m);
		// The subject is only secret-uploaded when an install already stores it
		// that way; the normal path is the ordinary [vars] binding.
		expect(workflow).toContain('no secret upload needed.');
	});
});
