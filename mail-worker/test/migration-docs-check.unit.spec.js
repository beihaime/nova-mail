import { describe, expect, it } from 'vitest';
import { README_FILES, WORKFLOW_ONLY_MIGRATIONS, checkMigrationDocs } from '../scripts/check-migration-docs.mjs';

/**
 * The migration-documentation check is a *static* check, not part of the
 * migration regression coverage. These tests drive it with synthetic inputs so
 * a fork that rewrites its README never fails the shared unit suite; the
 * canonical repository runs the real check in CI.
 */

const FILES = [
	'v3_8_body_type.sql',
	'v3_12_email_identity.sql',
	'v3_16_send_lifecycle.sql',
	'v3_16_send_lifecycle_indexes.sql',
];

const BOTH = 'Run migrations/v3_8_body_type.sql then migrations/v3_12_email_identity.sql.';

describe('migration documentation check', () => {
	it('passes when every operator migration is referenced and every reference exists', () => {
		const result = checkMigrationDocs({
			files: FILES,
			readmes: { 'README.md': BOTH, 'README.zh-CN.md': BOTH },
		});
		expect(result.ok).toBe(true);
		expect(result.problems).toEqual([]);
		expect(result.required).toEqual(['v3_12_email_identity.sql', 'v3_8_body_type.sql']);
	});

	it('exempts migrations that only the deployment workflow applies', () => {
		expect(WORKFLOW_ONLY_MIGRATIONS).toEqual([
			'v3_16_send_lifecycle.sql',
			'v3_16_send_lifecycle_indexes.sql',
		]);
		const result = checkMigrationDocs({
			files: FILES,
			readmes: { 'README.md': BOTH, 'README.zh-CN.md': BOTH },
		});
		for (const name of WORKFLOW_ONLY_MIGRATIONS) {
			expect(result.required).not.toContain(name);
			expect(result.problems.join('\n')).not.toContain(name);
		}
	});

	it('names the README and the migration that are not documented', () => {
		const result = checkMigrationDocs({
			files: FILES,
			readmes: { 'README.md': 'migrations/v3_12_email_identity.sql', 'README.zh-CN.md': BOTH },
		});
		expect(result.ok).toBe(false);
		expect(result.problems).toContain('README.md does not reference migrations/v3_8_body_type.sql');
	});

	it('requires each shipped README to document the migrations', () => {
		const result = checkMigrationDocs({
			files: FILES,
			readmes: { 'README.md': BOTH, 'README.zh-CN.md': 'nothing here' },
		});
		expect(result.ok).toBe(false);
		expect(result.problems).toContain('README.zh-CN.md does not reference migrations/v3_8_body_type.sql');
		expect(result.problems).toContain('README.zh-CN.md does not reference migrations/v3_12_email_identity.sql');
	});

	it('rejects a reference to a migration that no longer exists', () => {
		const result = checkMigrationDocs({
			files: ['v3_8_body_type.sql'],
			readmes: {
				'README.md': 'migrations/v3_8_body_type.sql and migrations/v3_99_removed.sql',
				'README.zh-CN.md': 'migrations/v3_8_body_type.sql and migrations/v3_99_removed.sql',
			},
		});
		expect(result.ok).toBe(false);
		expect(result.problems).toContain('README.md references migrations/v3_99_removed.sql, which does not exist');
		expect(result.problems).toContain('README.zh-CN.md references migrations/v3_99_removed.sql, which does not exist');
	});

	it('declares the README set it validates', () => {
		expect(README_FILES).toEqual(['README.md', 'README.zh-CN.md']);
	});
});
