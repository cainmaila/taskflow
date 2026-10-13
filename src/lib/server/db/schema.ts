import { sql } from 'drizzle-orm';
import {
	check,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

export const TASK_STATUSES = ['todo', 'in_progress', 'pending', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const task = sqliteTable(
	'task',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
		assigneeId: text('assignee_id').references(() => user.id),
		// ISO 日期 YYYY-MM-DD
		startDate: text('start_date'),
		dueDate: text('due_date'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		// 僅個人根有值（D8、D41）
		rootOwnerId: text('root_owner_id').references(() => user.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('task_root_owner_id_unique').on(t.rootOwnerId),
		check('task_status_check', sql`${t.status} in ('todo','in_progress','pending','done')`),
		// D34
		check('task_due_date_check', sql`${t.rootOwnerId} is not null or ${t.dueDate} is not null`),
		check(
			'task_date_order_check',
			sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`
		)
	]
);

// 包含關係（D2/D3）；循環檢查與 UI 在第 4 步
export const taskParent = sqliteTable(
	'task_parent',
	{
		parentId: text('parent_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		childId: text('child_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.parentId, t.childId] })]
);

export const invitation = sqliteTable('invitation', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull(),
	// sha256 of the raw token; the raw token is shown once and never stored
	tokenHash: text('token_hash').notNull().unique(),
	role: text('role', { enum: ['member', 'manager'] })
		.notNull()
		.default('member'),
	invitedBy: text('invited_by')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp_ms' }),
	revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export * from './auth.schema';
