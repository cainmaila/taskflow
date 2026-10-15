import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { task, taskParent, user } from './db/schema';
import {
	createTask,
	deleteTask,
	ensurePersonalRoot,
	getTask,
	listMyTasks,
	TaskError,
	TaskForbiddenError,
	TaskNotFoundError,
	updateTask
} from './tasks';
import type { TaskFilters } from './task-rules';
import { createTestDb } from './test-db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

const all: TaskFilters = { statuses: [], source: 'all', due: 'all' };
const today = '2026-10-12';

beforeEach(async () => {
	await t.db.delete(taskParent);
	await t.db.delete(task);
	await t.db.delete(user);
	await t.db.insert(user).values([
		{ id: 'u1', name: 'Alice', email: 'a@x.io' },
		{ id: 'u2', name: 'Bob', email: 'b@x.io' },
		{ id: 'u3', name: 'Carol', email: 'c@x.io' },
		{ id: 'ban', name: 'Banned', email: 'ban@x.io', banned: true }
	]);
});

const mk = (u: string, title = 'T', dueDate = '2026-10-20') =>
	createTask(t.db, u, { title, dueDate });

describe('schema', () => {
	it('has no priority column', async () => {
		const cols = await t.db.all<{ name: string }>(
			`select name from pragma_table_info('task')` as never
		);
		expect(cols.map((c) => c.name)).toContain('title');
		expect(cols.map((c) => c.name)).not.toContain('priority');
	});

	it('CHECK constraints reject bad rows', async () => {
		const base = { title: 'x', createdBy: 'u1' };
		await expect(t.db.insert(task).values({ ...base, dueDate: null })).rejects.toThrow();
		await expect(
			t.db.insert(task).values({ ...base, dueDate: '2026-01-01', startDate: '2026-01-02' })
		).rejects.toThrow();
		await expect(
			t.db.insert(task).values({ ...base, dueDate: '2026-01-01', status: 'bogus' as never })
		).rejects.toThrow();
		await t.db.insert(task).values({ ...base, rootOwnerId: 'u1' }); // root may lack due date
		await expect(t.db.insert(task).values({ ...base, rootOwnerId: 'u1' })).rejects.toThrow(); // unique
	});
});

describe('ensurePersonalRoot', () => {
	it('is idempotent and safe under concurrency', async () => {
		const ids = await Promise.all([1, 2, 3, 4].map(() => ensurePersonalRoot(t.db, 'u1')));
		expect(new Set(ids).size).toBe(1);
		expect(await ensurePersonalRoot(t.db, 'u1')).toBe(ids[0]);
		const root = await t.db.select().from(task).where(eq(task.id, ids[0])).get();
		expect(root).toMatchObject({
			title: 'Alice',
			status: 'todo',
			dueDate: null,
			rootOwnerId: 'u1'
		});
	});
	it('rejects unknown users', async () => {
		await expect(ensurePersonalRoot(t.db, 'nope')).rejects.toThrow(TaskError);
	});
});

describe('createTask', () => {
	it('top-level task has no task_parent row (D49) and validates input', async () => {
		const id = await mk('u1');
		expect(await t.db.select().from(taskParent).where(eq(taskParent.childId, id)).all()).toEqual(
			[]
		);
		await expect(createTask(t.db, 'u1', { title: ' ', dueDate: '2026-10-20' })).rejects.toThrow(
			TaskError
		);
		await expect(createTask(t.db, 'u1', { title: 'a', dueDate: '2026-02-30' })).rejects.toThrow(
			TaskError
		);
		await expect(createTask(t.db, 'u1', { title: 'a', dueDate: undefined })).rejects.toThrow(
			TaskError
		);
	});

	it('DB guard rejects links involving a personal root or self', async () => {
		const id = await mk('u1');
		const root = await ensurePersonalRoot(t.db, 'u1');
		await expect(t.db.insert(taskParent).values({ parentId: root, childId: id })).rejects.toThrow();
		await expect(t.db.insert(taskParent).values({ parentId: id, childId: root })).rejects.toThrow();
		await expect(t.db.insert(taskParent).values({ parentId: id, childId: id })).rejects.toThrow();
	});
});

describe('listMyTasks', () => {
	it('unions own + assigned, dedupes, never lists roots', async () => {
		const own = await mk('u1', 'own', '2026-10-21');
		const both = await mk('u1', 'both', '2026-10-19');
		const fromBob = await mk('u2', 'from bob', '2026-10-20');
		await mk('u2', 'bob private');
		await updateTask(t.db, 'u1', both, { assigneeId: 'u1' });
		await updateTask(t.db, 'u2', fromBob, { assigneeId: 'u1' });
		const { active, done } = await listMyTasks(t.db, 'u1', all, today);
		expect(active.map((r) => [r.id, r.source])).toEqual([
			[both, 'own'],
			[fromBob, 'assigned'],
			[own, 'own']
		]);
		expect(done).toEqual([]);
		expect(active.every((r) => r.rootOwnerId === null)).toBe(true);
	});

	it('filters and separates done', async () => {
		const a = await mk('u1', 'a', '2026-10-01');
		const b = await mk('u1', 'b', '2026-10-14');
		const c = await mk('u1', 'c', '2026-10-14');
		await updateTask(t.db, 'u1', c, { status: 'done' });
		const r = await listMyTasks(t.db, 'u1', { ...all, due: 'overdue' }, today);
		expect(r.active.map((x) => x.id)).toEqual([a]);
		const w = await listMyTasks(t.db, 'u1', { ...all, due: 'week' }, today);
		expect(w.active.map((x) => x.id)).toEqual([b]);
		expect(w.done.map((x) => x.id)).toEqual([c]);
	});
});

describe('permissions', () => {
	it('invisible tasks are not found; root is untouchable', async () => {
		const id = await mk('u1');
		const root = await ensurePersonalRoot(t.db, 'u1');
		await expect(getTask(t.db, 'u2', id)).rejects.toThrow(TaskNotFoundError);
		await expect(updateTask(t.db, 'u2', id, { title: 'x' })).rejects.toThrow(TaskNotFoundError);
		await expect(deleteTask(t.db, 'u2', id)).rejects.toThrow(TaskNotFoundError);
		await expect(getTask(t.db, 'u1', root)).rejects.toThrow(TaskNotFoundError);
		await expect(updateTask(t.db, 'u1', root, { title: 'x' })).rejects.toThrow(TaskNotFoundError);
		await expect(deleteTask(t.db, 'u1', root)).rejects.toThrow(TaskNotFoundError);
	});

	it('assignee edits content but cannot reassign or delete; creator can', async () => {
		const id = await mk('u1');
		await updateTask(t.db, 'u1', id, { assigneeId: 'u2' });
		await updateTask(t.db, 'u2', id, { title: 'new', status: 'in_progress', description: 'd' });
		expect(await getTask(t.db, 'u2', id)).toMatchObject({ title: 'new', status: 'in_progress' });
		await expect(updateTask(t.db, 'u2', id, { assigneeId: 'u3' })).rejects.toThrow(
			TaskForbiddenError
		);
		await expect(updateTask(t.db, 'u2', id, { assigneeId: null })).rejects.toThrow(
			TaskForbiddenError
		);
		await expect(deleteTask(t.db, 'u2', id)).rejects.toThrow(TaskForbiddenError);
		await updateTask(t.db, 'u1', id, { assigneeId: null });
		await expect(getTask(t.db, 'u2', id)).rejects.toThrow(TaskNotFoundError);
	});

	it('assignee must exist and not be banned; dates validated', async () => {
		const id = await mk('u1');
		await expect(updateTask(t.db, 'u1', id, { assigneeId: 'ban' })).rejects.toThrow(TaskError);
		await expect(updateTask(t.db, 'u1', id, { assigneeId: 'ghost' })).rejects.toThrow(TaskError);
		await expect(updateTask(t.db, 'u1', id, { startDate: '2026-11-01' })).rejects.toThrow('晚於');
		await expect(updateTask(t.db, 'u1', id, { dueDate: '' })).rejects.toThrow(TaskError);
		// startDate: '' 視為清除（null），不是無效日期
		await updateTask(t.db, 'u1', id, { startDate: '' });
		expect((await getTask(t.db, 'u1', id)).startDate).toBeNull();
		await expect(updateTask(t.db, 'u1', id, { status: 'nope' })).rejects.toThrow(TaskError);
		await expect(updateTask(t.db, 'u1', id, { description: 'x'.repeat(20001) })).rejects.toThrow(
			'20000'
		);
		await updateTask(t.db, 'u1', id, { startDate: '2026-10-01' });
		expect((await getTask(t.db, 'u1', id)).startDate).toBe('2026-10-01');
	});

	it('bumps updated_at and delete removes the row and its link', async () => {
		const id = await mk('u1');
		const before = (await getTask(t.db, 'u1', id)).updatedAt;
		await new Promise((r) => setTimeout(r, 5));
		await updateTask(t.db, 'u1', id, { title: 'z' });
		expect((await getTask(t.db, 'u1', id)).updatedAt.getTime()).toBeGreaterThan(before.getTime());
		await deleteTask(t.db, 'u1', id);
		expect(await t.db.select().from(task).where(eq(task.id, id)).get()).toBeUndefined();
		expect(await t.db.select().from(taskParent).where(eq(taskParent.childId, id)).all()).toEqual(
			[]
		);
	});
});
