import { env, SELF } from 'cloudflare:test';
import loginService from '../../src/service/login-service';
import { isDel, emailConst, settingConst } from '../../src/const/entity-const';
import KvConst from '../../src/const/kv-const';

export const ADMIN_EMAIL = 'admin@example.com';

/**
 * A context stand-in for the service layer.
 *
 * The Worker's Hono context carries `env`, a request, and a small request-scoped
 * cache; the services under test touch only those. Building it explicitly keeps
 * the suite independent from routing/middleware when a service is called
 * directly (e.g. the inbound-pipeline `receive()`).
 */
export function context(headers = {}) {
	const store = new Map();
	const lower = Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);

	return {
		env,
		req: {
			header: (name) => lower[String(name).toLowerCase()],
			raw: { headers: new Headers(lower) },
		},
		set: (key, value) => store.set(key, value),
		get: (key) => store.get(key),
	};
}

let sequence = 0;

/** A fresh address on the configured test domain, unique per call. */
export function uniqueEmail(prefix = 'user') {
	sequence += 1;
	return `${prefix}.${Date.now().toString(36)}.${sequence}@example.com`;
}

/**
 * Insert a user + its primary account directly.
 *
 * Registration is deliberately bypassed: it is rate-limited per IP (5/min) and
 * pulls in Turnstile, registration keys and roles, none of which this suite is
 * about. The rows produced here are the same ones `register` would create, so
 * every downstream permission check still sees a realistic account.
 */
export async function createAccount(email = uniqueEmail(), { roleId = 1 } = {}) {
	const userRow = await env.db
		.prepare(
			'INSERT INTO user (email, type, password, salt, status, is_del) VALUES (?, ?, ?, ?, 0, 0) RETURNING user_id, email, type, status, is_del',
		)
		.bind(email, roleId, 'test-hash', 'test-salt')
		.first();

	const accountRow = await env.db
		.prepare('INSERT INTO account (email, name, user_id, is_del, all_receive) VALUES (?, ?, ?, 0, 0) RETURNING account_id, email, user_id, all_receive')
		.bind(email, email.split('@')[0], userRow.user_id)
		.first();

	return {
		userId: userRow.user_id,
		accountId: accountRow.account_id,
		email,
		user: { userId: userRow.user_id, email, type: roleId, status: 0, isDel: 0 },
		account: accountRow,
	};
}

/** The instance administrator, created once and reused across suites. */
export async function createAdmin() {
	const existing = await env.db
		.prepare('SELECT user_id, email, type, status, is_del FROM user WHERE email = ? LIMIT 1')
		.bind(ADMIN_EMAIL)
		.first();
	if (!existing) return createAccount(ADMIN_EMAIL);

	const accountRow = await env.db
		.prepare('SELECT account_id, email, user_id, all_receive FROM account WHERE user_id = ? LIMIT 1')
		.bind(existing.user_id)
		.first();

	return {
		userId: existing.user_id,
		accountId: accountRow.account_id,
		email: ADMIN_EMAIL,
		user: { userId: existing.user_id, email: ADMIN_EMAIL, type: existing.type, status: 0, isDel: 0 },
		account: accountRow,
	};
}

/** Mint a real session: JWT + the KV auth record the middleware checks. */
export async function sessionFor(principal) {
	const c = context();
	const token = await loginService.createSession(c, principal.user);
	return { token, ...principal };
}

/** `fetch` against the Worker with an optional bearer token. */
export function api(path, { token, method = 'GET', body, headers = {} } = {}) {
	const requestHeaders = { ...headers };
	if (token) requestHeaders.Authorization = token;
	let payload = body;
	if (body !== undefined && typeof body !== 'string') {
		requestHeaders['Content-Type'] = 'application/json';
		payload = JSON.stringify(body);
	}
	return SELF.fetch(`https://mail.example${path}`, { method, headers: requestHeaders, body: payload });
}

export async function json(response) {
	return response.json();
}

/**
 * Seed one stored message owned by `principal`.
 *
 * D1 column names are spelled out rather than taken from the Drizzle table
 * definition: drizzle property names are camelCase while the schema is
 * snake_case, so keying the insert off the entity silently targets columns that
 * do not exist.
 */
export async function seedEmail(principal, overrides = {}) {
	const row = {
		account_id: principal.accountId,
		user_id: principal.userId,
		send_email: overrides.sendEmail ?? 'sender@outside.example',
		name: overrides.name ?? 'Sender',
		subject: overrides.subject ?? 'Hello',
		text: overrides.text ?? 'body',
		content: overrides.content ?? '',
		body_type: overrides.bodyType ?? 'text/plain',
		to_email: overrides.toEmail ?? principal.email,
		to_name: overrides.toName ?? '',
		recipient: overrides.recipient ?? JSON.stringify([{ address: principal.email, name: '' }]),
		type: overrides.type ?? emailConst.type.RECEIVE,
		status: overrides.status ?? emailConst.status.RECEIVE,
		unread: overrides.unread ?? emailConst.unread.UNREAD,
		thread_id: overrides.threadId ?? '',
		message_id: overrides.messageId ?? '',
		in_reply_to: overrides.inReplyTo ?? '',
		relation: overrides.relation ?? '',
		parent_message_id: overrides.parentMessageId ?? 0,
		code: '',
		cc: '[]',
		bcc: '[]',
		auth_results: '',
		is_del: overrides.isDel ?? isDel.NORMAL,
	};

	const columns = Object.keys(row);
	return env.db
		.prepare(
			`INSERT INTO email (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) RETURNING email_id`,
		)
		.bind(...columns.map((column) => row[column]))
		.first();
}

/**
 * Patch a settings row.
 *
 * The service layer reads settings from the KV mirror, not straight from D1
 * (`settingService.query` prefers `c.get('setting')`, then `kv:setting:`), so a
 * test that only ran `UPDATE setting …` would keep exercising the old value.
 * Both copies are updated here.
 *
 * The two copies disagree on naming: D1 columns are snake_case, while the KV
 * mirror is the Drizzle entity (`settingService.refresh` stores the mapped row)
 * and therefore camelCase. Patching only `sync_delete` in KV would leave
 * `syncDelete` untouched and silently test the old value.
 */
function toCamelCase(column) {
	return column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export async function updateSetting(patch) {
	const columns = Object.keys(patch);
	await env.db
		.prepare(`UPDATE setting SET ${columns.map((column) => `${column} = ?`).join(', ')}`)
		.bind(...columns.map((column) => patch[column]))
		.run();

	const cached = await env.kv.get(KvConst.SETTING, { type: 'json' });
	if (cached) {
		for (const [column, value] of Object.entries(patch)) {
			cached[toCamelCase(column)] = value;
		}
		await env.kv.put(KvConst.SETTING, JSON.stringify(cached));
	}
}

/** Open outbound mail; the shipped default is `send = CLOSE`. */
export async function openSend() {
	await updateSetting({ send: settingConst.send.OPEN });
}
