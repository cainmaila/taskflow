import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { project, projectMember, projectTask, task, taskParent, user } from './db/schema';
import {
	createTask,
	deleteTask,
	ensurePersonalRoot,
	getTask,
	listChildren,
	listMyTasks,
	moveTask,
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
	await t.db.delete(project);
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
			// D74：依 position（建立順序），不再依到期日
			[own, 'own'],
			[both, 'own'],
			[fromBob, 'assigned']
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

describe('moveTask (D73–D75)', () => {
	const order = async (u = 'u1') =>
		(await listMyTasks(t.db, u, all, today)).active.map((r) => r.title);
	const idOf = async (title: string) =>
		(await t.db.select().from(task).where(eq(task.title, title)).get())!.id;
	const posOf = async (title: string) =>
		(await t.db.select().from(task).where(eq(task.title, title)).get())!.position;
	const seed = async () => {
		for (const n of ['a', 'b', 'c']) await mk('u1', n);
	};

	it('new tasks go last; lists follow position, not due date', async () => {
		await mk('u1', 'late', '2026-12-01');
		await mk('u1', 'early', '2026-10-13');
		expect(await order()).toEqual(['late', 'early']);
	});

	it('places between neighbours (midpoint), at the head and at the tail', async () => {
		await seed();
		await moveTask(t.db, 'u1', await idOf('c'), {
			afterId: await idOf('a'),
			beforeId: await idOf('b')
		});
		expect(await order()).toEqual(['a', 'c', 'b']);
		expect(await posOf('c')).toBe(((await posOf('a')) + (await posOf('b'))) / 2);
		await moveTask(t.db, 'u1', await idOf('c'), { beforeId: await idOf('a') });
		expect(await order()).toEqual(['c', 'a', 'b']);
		await moveTask(t.db, 'u1', await idOf('c'), { afterId: await idOf('b') });
		expect(await order()).toEqual(['a', 'b', 'c']);
		await mk('u1', 'd');
		expect(await order()).toEqual(['a', 'b', 'c', 'd']);
	});

	it('renumbers when the gap between neighbours is too small', async () => {
		await seed();
		await t.db
			.update(task)
			.set({ position: 1 })
			.where(eq(task.id, await idOf('a')));
		await t.db
			.update(task)
			.set({ position: 1 + 1e-9 })
			.where(eq(task.id, await idOf('b')));
		await moveTask(t.db, 'u1', await idOf('c'), {
			afterId: await idOf('a'),
			beforeId: await idOf('b')
		});
		expect(await order()).toEqual(['a', 'c', 'b']);
		const pos = [await posOf('a'), await posOf('c'), await posOf('b')];
		expect(pos.every((p) => p % 1024 === 0 || (p * 2) % 1024 === 0)).toBe(true);
		expect(pos[1] - pos[0]).toBeGreaterThan(1);
		expect(pos[2] - pos[1]).toBeGreaterThan(1);
	});

	it('rejects stale or invalid neighbours', async () => {
		await seed();
		const [a, b, c] = [await idOf('a'), await idOf('b'), await idOf('c')];
		await expect(moveTask(t.db, 'u1', c, { afterId: c })).rejects.toThrow(TaskError);
		await expect(moveTask(t.db, 'u1', c, { afterId: 'ghost' })).rejects.toThrow(TaskError);
		// 順序顛倒（client 資料過期）
		await expect(moveTask(t.db, 'u1', c, { afterId: b, beforeId: a })).rejects.toThrow(TaskError);
		expect(await order()).toEqual(['a', 'b', 'c']);
		// 看不到的任務當鄰居也等同不存在
		const other = await mk('u2', 'x');
		await expect(moveTask(t.db, 'u1', c, { afterId: other })).rejects.toThrow(TaskError);
	});

	it('own editor and assignee may move; invisible user gets not-found', async () => {
		const id = await mk('u1', 'a');
		await mk('u1', 'b');
		await updateTask(t.db, 'u1', id, { assigneeId: 'u2' });
		await updateTask(t.db, 'u1', await idOf('b'), { assigneeId: 'u2' });
		const before = await posOf('a');
		await moveTask(t.db, 'u2', id, { afterId: await idOf('b') });
		expect(await posOf('a')).toBeGreaterThan(before);
		await expect(moveTask(t.db, 'u3', id, { afterId: await idOf('b') })).rejects.toThrow(
			TaskNotFoundError
		);
	});

	it('a parent editor may reorder a child but not change its status', async () => {
		const p = await mk('u1', 'P');
		await updateTask(t.db, 'u1', p, { assigneeId: 'u2' });
		const c1 = await createTask(t.db, 'u2', { title: 'c1', dueDate: '2026-10-20', parentId: p });
		const c2 = await createTask(t.db, 'u2', { title: 'c2', dueDate: '2026-10-20', parentId: p });
		await moveTask(t.db, 'u1', c2, { beforeId: c1 });
		expect((await listChildren(t.db, 'u1', p)).map((r) => r.title)).toEqual(['c2', 'c1']);
		await expect(moveTask(t.db, 'u1', c2, { status: 'in_progress' })).rejects.toThrow(
			TaskForbiddenError
		);
		expect((await getTask(t.db, 'u2', c2)).status).toBe('todo');
		// canMove 旗標與 moveTask 同一套規則
		expect((await listChildren(t.db, 'u1', p)).every((r) => r.canMove)).toBe(true);
		expect((await listChildren(t.db, 'u2', p)).every((r) => r.canMove)).toBe(true);
	});

	it('a project member alone may not move (D45)', async () => {
		const id = await mk('u1', 'a');
		const other = await mk('u1', 'b');
		await t.db.insert(project).values({ id: 'p1', name: 'P', createdBy: 'u1' });
		await t.db.insert(projectMember).values({ projectId: 'p1', userId: 'u3', role: 'member' });
		await t.db.insert(projectTask).values({ projectId: 'p1', taskId: id });
		const pos = await posOf('a');
		expect((await getTask(t.db, 'u3', id)).id).toBe(id);
		await expect(moveTask(t.db, 'u3', id, { afterId: other })).rejects.toThrow(TaskForbiddenError);
		expect(await posOf('a')).toBe(pos);
	});

	it('moves across columns; D66 blocks done and leaves status and position unchanged', async () => {
		const p = await mk('u1', 'P');
		await createTask(t.db, 'u1', { title: 'kid', dueDate: '2026-10-20', parentId: p });
		const other = await mk('u1', 'z');
		const pos = await posOf('P');
		await expect(moveTask(t.db, 'u1', p, { status: 'done', afterId: other })).rejects.toThrow(
			'還有 1 個子任務未完成'
		);
		expect(await getTask(t.db, 'u1', p)).toMatchObject({ status: 'todo', position: pos });
		await expect(moveTask(t.db, 'u1', p, { status: 'nope' })).rejects.toThrow(TaskError);
		await moveTask(t.db, 'u1', p, { status: 'in_progress', afterId: other });
		expect(await getTask(t.db, 'u1', p)).toMatchObject({ status: 'in_progress' });
		expect(await posOf('P')).toBeGreaterThan(await posOf('z'));
	});
});

describe('moveTask edge cases', () => {
	const posOf = async (id: string) => (await getTask(t.db, 'u1', id)).position;

	it('grandparent editor may reorder a grandchild but not change its status; flags match', async () => {
		const g = await mk('u1', 'G');
		await updateTask(t.db, 'u1', g, { assigneeId: 'u2' });
		const p = await createTask(t.db, 'u1', { title: 'P', dueDate: '2026-10-20', parentId: g });
		const c1 = await createTask(t.db, 'u1', { title: 'c1', dueDate: '2026-10-20', parentId: p });
		const c2 = await createTask(t.db, 'u1', { title: 'c2', dueDate: '2026-10-20', parentId: p });
		await t.db.update(task).set({ createdBy: 'u3' }).where(eq(task.id, p));
		await t.db.update(task).set({ createdBy: 'u3' }).where(eq(task.id, c1));
		await t.db.update(task).set({ createdBy: 'u3' }).where(eq(task.id, c2));
		await moveTask(t.db, 'u2', c2, { beforeId: c1 });
		expect((await listChildren(t.db, 'u2', p)).map((r) => r.title)).toEqual(['c2', 'c1']);
		await expect(moveTask(t.db, 'u2', c2, { status: 'in_progress' })).rejects.toThrow(
			TaskForbiddenError
		);
		expect((await t.db.select().from(task).where(eq(task.id, c2)).get())!.status).toBe('todo');
		const flags = (await listChildren(t.db, 'u2', p)).map((r) => [r.canMove, r.canChangeStatus]);
		expect(flags).toEqual([
			[true, false],
			[true, false]
		]);
		const owner = (await listChildren(t.db, 'u3', p)).map((r) => [r.canMove, r.canChangeStatus]);
		expect(owner).toEqual([
			[true, true],
			[true, true]
		]);
	});

	it('hidden ancestors: assignee of a child moves it but cannot use invisible neighbours', async () => {
		const p = await mk('u1', 'P');
		const c = await createTask(t.db, 'u1', { title: 'c', dueDate: '2026-10-20', parentId: p });
		await updateTask(t.db, 'u1', c, { assigneeId: 'u2' });
		await expect(moveTask(t.db, 'u3', c, { afterId: c })).rejects.toThrow(TaskNotFoundError);
		await expect(moveTask(t.db, 'u2', c, { afterId: p })).rejects.toThrow(TaskError);
		const pos = (await t.db.select().from(task).where(eq(task.id, c)).get())!.position;
		await moveTask(t.db, 'u2', c, { status: 'in_progress' });
		expect((await t.db.select().from(task).where(eq(task.id, c)).get())!.position).toBe(pos);
		// 父任務對 u2 不可見，其編輯權也與 u2 無關
		await expect(moveTask(t.db, 'u2', p, {})).rejects.toThrow(TaskNotFoundError);
	});

	it('creator can still move a task whose assignee is banned', async () => {
		const a = await mk('u1', 'a');
		const b = await mk('u1', 'b');
		await t.db.update(task).set({ assigneeId: 'ban' }).where(eq(task.id, a));
		await moveTask(t.db, 'u1', a, { afterId: b });
		expect(await posOf(a)).toBeGreaterThan(await posOf(b));
	});

	it('tasks in an archived project can still be reordered (D64)', async () => {
		const a = await mk('u1', 'a');
		const b = await mk('u1', 'b');
		await t.db
			.insert(project)
			.values({ id: 'pa', name: 'P', createdBy: 'u1', archivedAt: new Date() });
		await t.db.insert(projectMember).values({ projectId: 'pa', userId: 'u1', role: 'owner' });
		await t.db.insert(projectTask).values([
			{ projectId: 'pa', taskId: a },
			{ projectId: 'pa', taskId: b }
		]);
		await moveTask(t.db, 'u1', a, { afterId: b });
		expect(await posOf(a)).toBeGreaterThan(await posOf(b));
	});
});

describe('migration 0009 backfill', () => {
	it('keeps the old (due_date, created_at) order and skips personal roots', async () => {
		const file = readFileSync('drizzle/0009_task_position.sql', 'utf8');
		const backfill = file
			.split('--> statement-breakpoint')
			.pop()!
			.replace(/^-- .*$/gm, '');
		const rows = [
			['c', '2026-10-20', 3],
			['a', '2026-10-10', 9],
			['b', '2026-10-20', 1],
			['d', '2026-11-01', 0]
		] as const;
		for (const [id, dueDate, ts] of rows)
			await t.db
				.insert(task)
				.values({ id, title: id, dueDate, createdBy: 'u1', createdAt: new Date(ts) });
		const root = await ensurePersonalRoot(t.db, 'u1');
		await t.db.run(sql.raw(backfill.replaceAll('\n', ' ')));
		const ordered = await t.db.select().from(task).orderBy(task.position).all();
		expect(ordered.filter((r) => r.id !== root).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(ordered.find((r) => r.id === root)!.position).toBe(0);
	});
});
