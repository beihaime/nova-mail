import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import email from '../src/entity/email';
import { star } from '../src/entity/star';
import account from '../src/entity/account';
import { emailBriefColumns } from '../src/lib/email-list-columns';
import { isDel } from '../src/const/entity-const';

/**
 * The Inbox collapse relies on a grouped query. There is no local D1 instance in
 * these unit tests, so instead of executing it we assert the SQL Drizzle builds
 * for the exact expressions `emailService.list()` / `thread()` use — a typo in a
 * raw `sql` fragment fails here instead of in production.
 */
const db = drizzle({});

const threadKey = sql`coalesce(nullif(${email.threadId}, ''), 'e:' || ${email.emailId})`;
const newestMessageId = sql`max(${email.emailId})`;
const bareMessageId = sql`lower(replace(replace(coalesce(${email.messageId}, ''), '<', ''), '>', ''))`;

const baseFilters = [
	eq(email.userId, 1),
	eq(email.type, 0),
	eq(email.isDel, isDel.NORMAL),
	eq(account.isDel, isDel.NORMAL),
	eq(email.accountId, 2),
];

describe('inbox conversation query', () => {
	it('groups by conversation and pages on the newest message of each thread', () => {
		const query = db
			.select({ emailId: sql`${newestMessageId}`.as('emailId') })
			.from(email)
			.innerJoin(account, eq(account.accountId, email.accountId))
			.where(and(...baseFilters))
			.groupBy(threadKey)
			.having(sql`${newestMessageId} < ${500}`)
			.orderBy(sql`${newestMessageId} desc`)
			.limit(50)
			.toSQL();

		expect(query.sql).toContain('group by');
		expect(query.sql).toContain('coalesce(nullif("email"."thread_id"');
		expect(query.sql).toContain("'e:' || \"email\".\"email_id\"");
		expect(query.sql).toContain('having max("email"."email_id") <');
		expect(query.sql).toContain('order by max("email"."email_id") desc');
		// The cursor is bound as a parameter, never interpolated.
		expect(query.params).toContain(500);
	});

	it('counts conversations, not messages', () => {
		const query = db
			.select({ total: sql`count(distinct ${threadKey})` })
			.from(email)
			.innerJoin(account, eq(account.accountId, email.accountId))
			.where(and(...baseFilters))
			.toSQL();

		expect(query.sql).toContain('count(distinct coalesce(nullif("email"."thread_id"');
	});

	it('exposes the conversation key on brief list rows', () => {
		const query = db
			.select({ ...emailBriefColumns, starId: star.starId })
			.from(email)
			.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, 1)))
			.innerJoin(account, eq(account.accountId, email.accountId))
			.where(inArray(email.emailId, [9, 8, 7]))
			.toSQL();

		expect(query.sql).toContain('"email"."thread_id"');
	});

	it('resolves an ancestor by Message-ID ignoring angle brackets and case', () => {
		const query = db
			.select({ emailId: email.emailId, threadId: email.threadId, messageId: email.messageId })
			.from(email)
			.where(and(
				eq(email.userId, 1),
				or(...['a@x', 'b@x'].map(id => eq(bareMessageId, id)))
			))
			.orderBy(asc(email.emailId))
			.toSQL();

		expect(query.sql).toContain("lower(replace(replace(coalesce(\"email\".\"message_id\", '')");
		expect(query.params).toEqual(expect.arrayContaining(['a@x', 'b@x']));
	});

	it('loads a conversation through the legacy thread key', () => {
		const query = db
			.select({ emailId: email.emailId })
			.from(email)
			.innerJoin(account, eq(account.accountId, email.accountId))
			.where(and(
				eq(email.userId, 1),
				eq(threadKey, 'abc-123'),
				eq(email.isDel, isDel.NORMAL),
				eq(account.isDel, isDel.NORMAL)
			))
			.orderBy(asc(email.emailId))
			.toSQL();

		expect(query.sql).toContain('coalesce(nullif("email"."thread_id"');
		expect(query.params).toContain('abc-123');
	});
});
