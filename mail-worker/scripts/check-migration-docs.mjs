#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Static documentation check for the shipped D1 migrations.
 *
 * This deliberately lives outside the runtime unit suite (`pnpm test`): a fork
 * that rewrites README.md for its own deployment must not fail the Worker tests
 * just because its prose differs. The canonical repository runs this check in
 * CI (see the `Verify migration documentation` step, gated on the upstream
 * repository), so Nova Mail's own README stays accurate without coupling the
 * migration regression coverage to documentation text.
 *
 * Contract:
 *   - every `migrations/*.sql` file that operators apply by hand must be
 *     referenced by README.md and README.zh-CN.md;
 *   - files that only the deployment workflow applies (see
 *     WORKFLOW_ONLY_MIGRATIONS) are exempt;
 *   - every `migrations/<file>.sql` a README points at must exist, so the docs
 *     cannot reference a removed migration.
 */

/** Migrations applied by .github/workflows/deploy-cloudflare.yml, not by hand. */
export const WORKFLOW_ONLY_MIGRATIONS = Object.freeze([
	'v3_16_send_lifecycle.sql',
	'v3_16_send_lifecycle_indexes.sql',
]);

export const README_FILES = Object.freeze(['README.md', 'README.zh-CN.md']);

const MIGRATION_REFERENCE = /migrations\/([A-Za-z0-9_.-]+\.sql)/g;

/**
 * @param {{ files: string[], readmes: Record<string, string> }} input
 * @returns {{ ok: boolean, required: string[], problems: string[] }}
 */
export function checkMigrationDocs({ files = [], readmes = {} } = {}) {
	const onDisk = new Set(files);
	const workflowOnly = new Set(WORKFLOW_ONLY_MIGRATIONS);
	const required = files.filter((name) => !workflowOnly.has(name)).sort();
	const problems = [];

	for (const [label, text] of Object.entries(readmes)) {
		const referenced = new Set([...String(text).matchAll(MIGRATION_REFERENCE)].map((match) => match[1]));

		for (const name of required) {
			if (!referenced.has(name)) {
				problems.push(`${label} does not reference migrations/${name}`);
			}
		}
		for (const name of referenced) {
			if (!onDisk.has(name)) {
				problems.push(`${label} references migrations/${name}, which does not exist`);
			}
		}
	}

	return { ok: problems.length === 0, required, problems };
}

function main() {
	const migrationsDir = new URL('../migrations/', import.meta.url);
	const repoRoot = new URL('../../', import.meta.url);

	const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
	const readmes = {};
	for (const name of README_FILES) {
		readmes[name] = readFileSync(new URL(name, repoRoot), 'utf8');
	}

	const { ok, required, problems } = checkMigrationDocs({ files, readmes });
	if (ok) {
		console.log(`✅ Migration documentation is current (${required.length} operator migrations referenced by ${README_FILES.join(', ')}).`);
		return;
	}

	console.error('❌ Migration documentation is out of date:');
	for (const problem of problems) console.error(`   - ${problem}`);
	process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
