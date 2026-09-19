import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const email = sqliteTable('email', {
	emailId: integer('email_id').primaryKey({ autoIncrement: true }),
	sendEmail: text('send_email'),
	name: text('name'),
	accountId: integer('account_id').notNull(),
	userId: integer('user_id').notNull(),
	subject: text('subject'),
	code: text('code').default('').notNull(),
	text: text('text'),
	content: text('content'),
	// How the reader must render this mail: text/html (sandboxed iframe),
	// text/markdown (markdown-it) or text/plain. See lib/mail-body.js.
	bodyType: text('body_type').default('').notNull(),
	cc: text('cc').default('[]'),
	bcc: text('bcc').default('[]'),
	recipient: text('recipient'),
	toEmail: text('to_email').default('').notNull(),
	toName: text('to_name').default('').notNull(),
	inReplyTo: text('in_reply_to').default(''),
	relation: text('relation').default(''),
	messageId: text('message_id').default(''),
	// Conversation key. Every message of one conversation (original + replies +
	// the user's own replies) shares it; the Inbox collapses rows by this value.
	threadId: text('thread_id').default('').notNull(),
	// Direct parent message id (RFC In-Reply-To / References hit), 0 when unknown.
	parentMessageId: integer('parent_message_id').default(0).notNull(),
	authResults: text('auth_results').default('').notNull(),
	type: integer('type').default(0).notNull(),
	status: integer('status').default(0).notNull(),
	resendEmailId: text('resend_email_id'),
	message: text('message'),
	unread: integer('unread').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	isDel: integer('is_del').default(0).notNull()
});
export default email
