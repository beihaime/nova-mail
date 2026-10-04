#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
	REQUIRED_COLUMNS,
	REQUIRED_INDEXES,
	REQUIRED_INVARIANTS,
	REQUIRED_TABLES,
	checkSchema,
} from './schema-manifest.mjs';

/**
 * CLI for the deployment schema gate.
 *
 * Reads one JSON object on stdin:
 *
 *   {
 *     "tables":     ["user", ...],
 *     "indexes":    ["idx_user_email_nocase", ...],
 *     "columns":    ["email.body_type", ...],
 *     "invariants": { "noncanonical_user": 0, "noncanonical_account": 0 }
 *   }
 *
 * and exits non-zero, naming every missing object and violated invariant. The
 * required set itself lives in scripts/schema-manifest.mjs so the integration
 * harness can assert it against a freshly bootstrapped database.
 */
function main() {
	let raw = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (chunk) => { raw += chunk; });
	process.stdin.on('end', () => {
		let actual;
		try {
			actual = JSON.parse(raw);
		} catch {
			console.error('check-schema: expected the deployed schema JSON on stdin');
			process.exit(2);
		}

		const { ok, missing, violations } = checkSchema(actual);
		if (ok) {
			const columns = Object.values(REQUIRED_COLUMNS).reduce((n, list) => n + list.length, 0);
			console.log(`✅ Deployed schema satisfies ${REQUIRED_TABLES.length} tables, `
				+ `${columns} columns, ${REQUIRED_INDEXES.length} indexes and `
				+ `${Object.keys(REQUIRED_INVARIANTS).length} invariants.`);
			return;
		}

		console.error('❌ The deployed D1 is missing schema the current Worker requires:');
		for (const item of [...missing, ...violations]) console.error(`   - ${item}`);
		process.exit(1);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
