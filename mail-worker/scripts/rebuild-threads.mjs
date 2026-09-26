#!/usr/bin/env node
/**
 * Rebuild every conversation key (`thread_id` / `parent_message_id`).
 *
 * Why this exists
 * ---------------
 * The v3.6 migration only fills rows whose `thread_id` is still empty, so an
 * earlier, buggy assignment cannot be repaired by rerunning one-time bootstrap.
 * This script recomputes *all* keys locally with the exact resolver the Worker
 * uses (`src/lib/thread-key.js`) and writes them back through wrangler — no
 * no signing secret or bootstrap route needed.
 *
 * Usage (run from mail-worker/)
 * -----------------------------
 *   node scripts/rebuild-threads.mjs                    # dry run: SQL files only
 *   node scripts/rebuild-threads.mjs --apply            # write to the remote D1
 *   node scripts/rebuild-threads.mjs --input rows.json  # offline, from a JSON dump
 *
 * Options
 * -------
 *   --apply             actually execute the generated SQL (default: dry run)
 *   --input <file>      read rows from a JSON array instead of D1
 *   --db <name>         D1 database name          (default: email)
 *   --config <file>     wrangler config file      (default: wrangler.toml)
 *   --out <dir>         where the .sql files go   (default: .thread-rebuild)
 *   --batch <n>         statements per .sql file  (default: 500)
 *   --page <n>          rows fetched per query    (default: 1000)
 *   --clean             delete the .sql files after a successful --apply
 *
 * Deploy the Worker with the fixed resolver first, otherwise newly received mail
 * keeps using the old logic until the next deploy.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runThreadBackfill } from '../src/lib/thread-key.js';

const USAGE = `Usage: node scripts/rebuild-threads.mjs [--apply] [--input rows.json]
       [--db email] [--config wrangler.toml] [--out .thread-rebuild]
       [--batch 500] [--page 1000] [--clean]`;

function parseArgs(argv) {
	const options = {
		apply: false,
		clean: false,
		help: false,
		input: '',
		db: 'email',
		config: existsSync('wrangler.toml') ? 'wrangler.toml' : '',
		out: '.thread-rebuild',
		batch: 500,
		page: 1000,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new Error(`${arg} needs a value`);
			return next;
		};

		switch (arg) {
			case '--apply': options.apply = true; break;
			case '--clean': options.clean = true; break;
			case '--help':
			case '-h': options.help = true; break;
			case '--input': options.input = value(); break;
			case '--db': options.db = value(); break;
			case '--config': options.config = value(); break;
			case '--out': options.out = value(); break;
			case '--batch': options.batch = Number(value()); break;
			case '--page': options.page = Number(value()); break;
			default: throw new Error(`unknown option: ${arg}`);
		}
	}

	return options;
}

/** Run the local wrangler binary (falls back to `npx wrangler`). */
function wrangler(options, args, { capture = false } = {}) {
	const binary = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
	const local = resolve('node_modules/.bin', binary);
	const useLocal = existsSync(local);
	const command = useLocal ? local : 'npx';
	const commandArgs = useLocal ? args : ['wrangler', ...args];

	const result = spawnSync(command, commandArgs, {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (capture) process.stderr.write(result.stderr || '');
		throw new Error(`wrangler ${args.join(' ')} exited with ${result.status}`);
	}

	return capture ? result.stdout : '';
}

/** wrangler prints banners around its JSON; take the outermost array. */
function parseWranglerJson(stdout) {
	const start = stdout.indexOf('[');
	const end = stdout.lastIndexOf(']');
	if (start === -1 || end === -1) {
		throw new Error(`could not find JSON in wrangler output:\n${stdout.slice(0, 400)}`);
	}
	return JSON.parse(stdout.slice(start, end + 1));
}

/** Rows straight from the remote D1, paged by email_id. */
function d1Source(options) {
	const baseArgs = ['d1', 'execute', options.db, '--remote', '--json'];
	if (options.config) baseArgs.push('--config', options.config);

	return {
		async readPage(cursor, limit) {
			const command = [
				'SELECT email_id AS emailId, user_id AS userId, account_id AS accountId,',
				'subject, message_id AS messageId, in_reply_to AS inReplyTo, relation,',
				'send_email AS sendEmail, to_email AS toEmail, recipient',
				'FROM email',
				`WHERE email_id > ${Number(cursor)}`,
				'ORDER BY email_id ASC',
				`LIMIT ${Number(limit)}`,
			].join(' ');

			const stdout = wrangler(options, [...baseArgs, '--command', command], { capture: true });
			const parsed = parseWranglerJson(stdout);
			const rows = parsed?.[0]?.results || [];
			return rows.map(row => ({ ...row, threadId: '' }));
		},
	};
}

/** Offline rows from a JSON file (a raw array or wrangler's `--json` output). */
function fileSource(file) {
	const parsed = JSON.parse(readFileSync(file, 'utf8'));
	const rows = (Array.isArray(parsed) ? parsed : parsed?.[0]?.results || [])
		.map(row => ({ ...row, threadId: '' }))
		.sort((a, b) => Number(a.emailId) - Number(b.emailId));

	return {
		async readPage(cursor, limit) {
			return rows.filter(row => Number(row.emailId) > cursor).slice(0, limit);
		},
	};
}

function escapeSql(value) {
	return String(value).replace(/'/g, "''");
}

/** Batches UPDATE statements into .sql files, optionally applying them. */
function createWriter(options) {
	mkdirSync(options.out, { recursive: true });

	const pending = [];
	const files = [];

	const flush = async (statements) => {
		if (!statements.length) return;

		const name = `threads-${String(files.length + 1).padStart(4, '0')}.sql`;
		const file = join(options.out, name);
		writeFileSync(file, `${statements.join('\n')}\n`);
		files.push(file);

		if (options.apply) {
			process.stdout.write(`  → ${name} (${statements.length} updates) … `);
			wrangler(options, ['d1', 'execute', options.db, '--remote', '--file', file,
				...(options.config ? ['--config', options.config] : [])]);
			process.stdout.write('ok\n');
		}
	};

	return {
		async write(updates) {
			for (const update of updates) {
				pending.push(
					`UPDATE email SET thread_id='${escapeSql(update.threadId)}', ` +
					`parent_message_id=${Number(update.parentMessageId) || 0} ` +
					`WHERE email_id=${Number(update.emailId)};`
				);
			}

			while (pending.length >= options.batch) {
				await flush(pending.splice(0, options.batch));
			}
		},
		async finish() {
			await flush(pending.splice(0, pending.length));
		},
		files,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(USAGE);
		return;
	}

	console.log('Nova Mail — rebuild conversation keys');
	console.log(`  source : ${options.input ? `file ${options.input}` : `D1 "${options.db}" (remote)`}`);
	console.log(`  mode   : ${options.apply ? 'APPLY (writes to the database)' : 'dry run (SQL files only)'}`);
	console.log('');

	const source = options.input ? fileSource(options.input) : d1Source(options);
	const writer = createWriter(options);

	// email_id -> subject, and thread_id -> { count, subject } for the summary.
	const subjectByEmailId = new Map();
	const threads = new Map();

	const total = await runThreadBackfill({
		readPage: async (cursor, limit) => {
			const rows = await source.readPage(cursor, limit);
			for (const row of rows) subjectByEmailId.set(Number(row.emailId), row.subject || '');
			return rows;
		},
		writeUpdates: async (updates) => {
			for (const update of updates) {
				const subject = subjectByEmailId.get(Number(update.emailId)) || '';
				const entry = threads.get(update.threadId) || { count: 0, subject };
				entry.count += 1;
				if (!entry.subject && subject) entry.subject = subject;
				threads.set(update.threadId, entry);
			}
			await writer.write(updates);
		},
		pageSize: options.page,
	});

	await writer.finish();

	const largest = [...threads.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, 5);

	console.log('');
	console.log(`messages scanned : ${total}`);
	console.log(`conversations    : ${threads.size}`);
	console.log(`sql files        : ${writer.files.length} in ${options.out}/`);

	if (largest.length) {
		console.log('largest conversations:');
		for (const entry of largest) {
			console.log(`  ${String(entry.count).padStart(4)}  ${entry.subject || '(no subject)'}`);
		}
	}

	if (!options.apply) {
		console.log('');
		console.log('Dry run — nothing was written. Re-run with --apply to update the database.');
		return;
	}

	if (options.clean) {
		for (const file of writer.files) rmSync(file, { force: true });
		console.log(`cleaned ${writer.files.length} sql file(s)`);
	}

	console.log('');
	console.log('Done. Re-open the Inbox (hard refresh if the PWA served a cached bundle).');
}

main().catch(error => {
	console.error(`\n✘ ${error.message}`);
	process.exitCode = 1;
});
