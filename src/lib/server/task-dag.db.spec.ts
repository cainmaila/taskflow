import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { task, taskParent, user } from './db/schema';
import {
	attachChild,
	createTask,
	deleteTask,
	detachChild,
	ensurePersonalRoot,
	getTask,
	insertLink,
	listAssignedByMe,
	listChildren,
	listMyTasks,
	listParents,
	planDelete,
	planKey,
	TaskConflictError,
	searchAttachable,
	shareScope,
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
		{ id: 'u3', name: 'Carol', email: 'c@x.io' }
	]);
});

const mk = (u: string, title = 'T', parentId?: string) =>
	createTask(t.db, u, { title, dueDate: '2026-10-20', parentId });
const visible = (u: string, id: string) =>
	getTask(t.db, u, id).then(
		() => true,
		() => false
	);
// u 需先看得到 parent 才能在底下建任務（D50）：把 parent 指派給 u
const give = (owner: string, id: string, to: string) =>
	updateTask(t.db, owner, id, { assigneeId: to });
const links = () => t.db.select().from(taskParent).all();

describe('visibility via ancestors (D14)', () => {
	it('flows down 3 levels and through diamonds; siblings and strangers stay out', async () => {
		const a = await mk('u1', 'A');
		await give('u1', a, 'u2');
		const b = await mk('u2', 'B', a);
		const c = await mk('u2', 'C', b);
		expect(await visible('u1', c)).toBe(true); // ancestor A's creator sees grandchild
		expect(await visible('u3', c)).toBe(false);
		// diamond: C also under X owned by u3
		const x = await mk('u3', 'X');
		await give('u3', x, 'u2');
		await attachChild(t.db, 'u2', x, c);
		expect(await visible('u3', c)).toBe(true);
		expect(await visible('u3', b)).toBe(false); // sideways/up is not shared
		expect(await visible('u3', a)).toBe(false);
	});

	it('assignee of an ancestor sees descendants; unassign revokes', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		await updateTask(t.db, 'u1', a, { assigneeId: 'u2' });
		expect(await visible('u2', b)).toBe(true);
		await updateTask(t.db, 'u1', a, { assigneeId: null });
		expect(await visible('u2', b)).toBe(false);
	});

	it('viewing via ancestor does not grant edit/delete', async () => {
		const a = await mk('u1', 'A');
		await give('u1', a, 'u2');
		const b = await mk('u2', 'B', a);
		await expect(updateTask(t.db, 'u1', b, { title: 'x' })).rejects.toThrow(TaskForbiddenError);
		await expect(deleteTask(t.db, 'u1', b)).rejects.toThrow(TaskForbiddenError);
	});
});

describe('attachChild / cycles / detach', () => {
	it('rejects self, 2-cycle, long cycle, duplicates; allows diamonds', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		const c = await mk('u1', 'C', b);
		await expect(attachChild(t.db, 'u1', a, a)).rejects.toThrow(TaskError);
		await expect(attachChild(t.db, 'u1', b, a)).rejects.toThrow('循環');
		await expect(attachChild(t.db, 'u1', c, a)).rejects.toThrow('循環');
		await expect(attachChild(t.db, 'u1', a, b)).rejects.toThrow('已經');
		await attachChild(t.db, 'u1', a, c); // diamond A->C and B->C
		expect((await listParents(t.db, 'u1', c)).visible).toHaveLength(2);
	});

	it('duplicate submit becomes a TaskError, not a raw DB error', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		await expect(insertLink(t.db, a, b)).rejects.toThrow('已經是子任務');
		await expect(insertLink(t.db, a, b)).rejects.toBeInstanceOf(TaskError);
		expect(await links()).toHaveLength(1);
	});

	it('DB guard also blocks UPDATEs on task_parent', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		const root = await ensurePersonalRoot(t.db, 'u1');
		await expect(
			t.db.update(taskParent).set({ parentId: root }).where(eq(taskParent.childId, b))
		).rejects.toThrow();
		await expect(
			t.db.update(taskParent).set({ childId: a }).where(eq(taskParent.childId, b))
		).rejects.toThrow();
	});

	it('insertLink post-check removes a link that closes a cycle', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		await expect(insertLink(t.db, b, a)).rejects.toThrow('循環'); // skips the pre-check on purpose
		expect(await links()).toHaveLength(1);
	});

	it('needs view on parent and operate right on child (D50); roots are never linkable', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u2', 'B');
		await expect(attachChild(t.db, 'u2', a, b)).rejects.toThrow(TaskNotFoundError); // cannot see parent
		await expect(attachChild(t.db, 'u1', a, b)).rejects.toThrow(TaskNotFoundError); // cannot see child
		await updateTask(t.db, 'u2', b, { assigneeId: 'u1' }); // creator u2 assigns to u1 -> u1 may operate
		await attachChild(t.db, 'u1', a, b);
		const root = await ensurePersonalRoot(t.db, 'u1');
		await expect(attachChild(t.db, 'u1', root, a)).rejects.toThrow(TaskNotFoundError);
		await expect(attachChild(t.db, 'u1', a, root)).rejects.toThrow(TaskNotFoundError);
	});

	it('view-only via ancestor cannot attach that task elsewhere', async () => {
		const a = await mk('u1', 'A');
		await give('u1', a, 'u2');
		const b = await mk('u2', 'B', a);
		const other = await mk('u1', 'O');
		await expect(attachChild(t.db, 'u1', other, b)).rejects.toThrow(TaskForbiddenError);
	});

	it('detach removes only the link and needs operate right', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		await give('u1', a, 'u2');
		const c = await mk('u2', 'C', a);
		await expect(detachChild(t.db, 'u1', a, c)).rejects.toThrow(TaskForbiddenError);
		await expect(detachChild(t.db, 'u1', c, b)).rejects.toThrow('找不到這個關聯');
		await detachChild(t.db, 'u1', a, b);
		expect(await getTask(t.db, 'u1', b)).toBeTruthy();
		expect(await links()).toHaveLength(1);
	});
});

describe('shareScope (D15) and searchAttachable', () => {
	it('lists people who gain access, not those who already see the child', async () => {
		const a = await mk('u2', 'A');
		await updateTask(t.db, 'u2', a, { assigneeId: 'u3' });
		const b = await mk('u1', 'B');
		await updateTask(t.db, 'u1', b, { assigneeId: 'u3' });
		expect((await shareScope(t.db, a, b)).map((u) => u.name)).toEqual(['Bob']);
	});

	it("excludes self, ancestors, already-linked, roots and others' tasks; escapes LIKE", async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		const anc = await mk('u1', 'Anc');
		await attachChild(t.db, 'u1', anc, a);
		const free = await mk('u1', '100% free');
		await mk('u1', '1000 other');
		await mk('u2', 'theirs 100%');
		await ensurePersonalRoot(t.db, 'u1');
		const names = async (q: string) =>
			(await searchAttachable(t.db, 'u1', a, q)).map((r) => r.title);
		expect(await names('')).toEqual(['100% free', '1000 other']);
		expect(await names('100%')).toEqual(['100% free']);
		expect(await names('Anc')).toEqual([]);
		expect(await names('B')).toEqual([]);
		expect(await names('Alice')).toEqual([]);
		expect(free).toBeTruthy();
		expect(b).toBeTruthy();
	});
});

describe('lists (D42/D49/D52)', () => {
	it('my list: top-level owned or assigned; children only when assigned; counts', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		await mk('u1', 'C', a);
		await updateTask(t.db, 'u1', b, { status: 'done' });
		const mine = await listMyTasks(t.db, 'u1', all, today);
		expect(mine.active.map((r) => r.id)).toEqual([a]);
		expect(mine.active[0]).toMatchObject({ childCount: 2, doneChildCount: 1, parentCount: 0 });
		// assigning a nested task to u2 surfaces it in u2's list as assigned
		await updateTask(t.db, 'u1', b, { assigneeId: 'u2' });
		const bobs = await listMyTasks(t.db, 'u2', all, today);
		expect(bobs.done.map((r) => [r.id, r.source, r.parentCount])).toEqual([[b, 'assigned', 1]]);
	});

	it('top-level task assigned away leaves my list and shows in assigned-by-me; detach resurfaces (D49)', async () => {
		const a = await mk('u1', 'A');
		await updateTask(t.db, 'u1', a, { assigneeId: 'u2' });
		expect((await listMyTasks(t.db, 'u1', all, today)).active).toEqual([]);
		expect((await listMyTasks(t.db, 'u2', all, today)).active.map((r) => r.id)).toEqual([a]);
		const out = await listAssignedByMe(t.db, 'u1', all, today);
		expect(out.active.map((r) => [r.id, r.assigneeName])).toEqual([[a, 'Bob']]);
		// nested assigned-away task also appears there; self-assigned does not
		const p = await mk('u1', 'P');
		const c = await mk('u1', 'C', p);
		await updateTask(t.db, 'u1', c, { assigneeId: 'u2' });
		const s = await mk('u1', 'S');
		await updateTask(t.db, 'u1', s, { assigneeId: 'u1' });
		expect((await listAssignedByMe(t.db, 'u1', all, today)).active.map((r) => r.id).sort()).toEqual(
			[a, c].sort()
		);
		// detaching the nested one from its only parent: still not in u1's list (owner is assignee u2)
		await detachChild(t.db, 'u1', p, c);
		expect((await listMyTasks(t.db, 'u2', all, today)).active.map((r) => r.id).sort()).toEqual(
			[a, c].sort()
		);
		expect((await listMyTasks(t.db, 'u1', all, today)).active.map((r) => r.id)).toContain(s);
	});

	it('listChildren: one level, 404 for non-viewers, same row data under any parent (D21)', async () => {
		const a = await mk('u1', 'A');
		const x = await mk('u1', 'X');
		const b = await mk('u1', 'B', a);
		await attachChild(t.db, 'u1', x, b);
		await mk('u1', 'C', b);
		const underA = await listChildren(t.db, 'u1', a);
		const underX = await listChildren(t.db, 'u1', x);
		expect(underA).toHaveLength(1);
		expect(underA[0]).toEqual(underX[0]);
		expect(underA[0]).toMatchObject({ childCount: 1, parentCount: 2 });
		await expect(listChildren(t.db, 'u2', a)).rejects.toThrow(TaskNotFoundError);
		// descendants are visible to the parent's viewers without per-child filtering
		await updateTask(t.db, 'u1', a, { assigneeId: 'u2' });
		expect(await listChildren(t.db, 'u2', b)).toHaveLength(1);
	});

	it('listParents hides unseen parents but counts them (D51)', async () => {
		const mine = await mk('u1', 'Mine');
		const theirs = await mk('u2', 'Theirs');
		const child = await mk('u1', 'Child', mine);
		await updateTask(t.db, 'u1', child, { assigneeId: 'u2' });
		await updateTask(t.db, 'u2', theirs, { assigneeId: 'u1' });
		await attachChild(t.db, 'u1', theirs, child);
		// u3 has no access to anything
		const p = await listParents(t.db, 'u1', child);
		expect(p.visible.map((x) => x.title).sort()).toEqual(['Mine', 'Theirs']);
		await updateTask(t.db, 'u2', theirs, { assigneeId: null });
		const q = await listParents(t.db, 'u1', child);
		expect(q.visible.map((x) => x.title)).toEqual(['Mine']);
		expect(q.hiddenCount).toBe(1);
		expect(JSON.stringify(q)).not.toContain('Theirs');
	});
});

describe('delete plan (D53-D55)', () => {
	it('no children -> childCount 0, plain delete', async () => {
		const a = await mk('u1', 'A');
		expect(await planDelete(t.db, 'u1', a)).toEqual({ childCount: 0 });
		await deleteTask(t.db, 'u1', a);
		expect(await t.db.select().from(task).where(eq(task.id, a)).get()).toBeUndefined();
	});

	// A -> B(mine, only A) -> D(mine, parents B + OUT); A -> N(not mine) ; A -> S(mine, parents A + OUT2)
	const build = async () => {
		const a = await mk('u1', 'A');
		const out = await mk('u1', 'OUT');
		const out2 = await mk('u1', 'OUT2');
		const b = await mk('u1', 'B', a);
		const d = await mk('u1', 'D', b);
		await attachChild(t.db, 'u1', out, d);
		await give('u1', a, 'u2');
		const n = await mk('u2', 'N', a);
		const s = await mk('u1', 'S', a);
		await attachChild(t.db, 'u1', out2, s);
		return { a, out, out2, b, d, n, s };
	};

	it('previews counts for both modes', async () => {
		const { a } = await build();
		expect(await planDelete(t.db, 'u1', a)).toEqual({
			childCount: 3,
			single: { becomingTopLevel: 2 }, // B and N have A as their only parent
			tree: { willDelete: 2, keptShared: 2, keptNotMine: 1, becomingTopLevel: 1 }
		});
	});

	it('tree mode deletes only mine-and-fully-inside; single keeps all children', async () => {
		const { a, b, d, n, s } = await build();
		await deleteTask(t.db, 'u1', a, 'tree');
		const left = (await t.db.select({ id: task.id }).from(task).all()).map((r) => r.id);
		expect(left).toContain(d); // shared with OUT
		expect(left).toContain(n); // not mine
		expect(left).toContain(s); // shared with OUT2
		expect(left).not.toContain(a);
		expect(left).not.toContain(b);
		expect((await listMyTasks(t.db, 'u2', all, today)).active.map((r) => r.id)).toContain(n);
	});

	it('single mode keeps children, which become top-level when orphaned', async () => {
		const { a, b, n } = await build();
		await deleteTask(t.db, 'u1', a);
		expect(await getTask(t.db, 'u1', b)).toBeTruthy();
		expect((await listParents(t.db, 'u1', b)).visible).toEqual([]);
		expect((await listMyTasks(t.db, 'u1', all, today)).active.map((r) => r.id)).toContain(b);
		expect((await listMyTasks(t.db, 'u2', all, today)).active.map((r) => r.id)).toContain(n);
	});

	it('only the creator can plan/delete; viewers via ancestor cannot; no status side effects', async () => {
		const a = await mk('u1', 'A');
		await give('u1', a, 'u2');
		const b = await mk('u2', 'B', a);
		await mk('u2', 'C', b);
		await expect(planDelete(t.db, 'u1', b)).rejects.toThrow(TaskForbiddenError);
		await expect(deleteTask(t.db, 'u1', b, 'tree')).rejects.toThrow(TaskForbiddenError);
		await expect(deleteTask(t.db, 'u3', b)).rejects.toThrow(TaskNotFoundError);
		await deleteTask(t.db, 'u2', b, 'tree');
		expect(
			await t.db
				.select()
				.from(task)
				.where(and(eq(task.title, 'C')))
				.get()
		).toBeUndefined();
		expect((await getTask(t.db, 'u1', a)).status).toBe('todo');
	});

	it('deletes more than 100 descendants in one tree delete', async () => {
		const a = await mk('u1', 'A');
		const rows = Array.from({ length: 150 }, (_, i) => ({
			id: `k${i}`,
			title: `k${i}`,
			dueDate: '2026-10-20',
			createdBy: 'u1'
		}));
		for (let i = 0; i < rows.length; i += 8) await t.db.insert(task).values(rows.slice(i, i + 8));
		for (let i = 0; i < rows.length; i += 40)
			await t.db
				.insert(taskParent)
				.values(rows.slice(i, i + 40).map((r) => ({ parentId: a, childId: r.id })));
		await deleteTask(t.db, 'u1', a, 'tree');
		expect(await t.db.select().from(task).where(eq(task.createdBy, 'u1')).all()).toEqual([]);
	});

	it('rejects (409-style) when the plan changed since the user confirmed; deletes when unchanged', async () => {
		const a = await mk('u1', 'A');
		await mk('u1', 'B', a);
		const key = planKey(await planDelete(t.db, 'u1', a), 'tree');
		// 預覽之後又多了一個子任務
		await mk('u1', 'C', a);
		const err = await deleteTask(t.db, 'u1', a, 'tree', key).catch((e) => e);
		expect(err).toBeInstanceOf(TaskConflictError);
		expect(err.plan).toMatchObject({ childCount: 2 });
		expect(await t.db.select().from(task).all()).toHaveLength(3);
		// single 模式也一樣檢查；沒帶確認內容視為不一致
		await expect(
			deleteTask(t.db, 'u1', a, 'single', planKey(await planDelete(t.db, 'u1', a), 'tree'))
		).rejects.toBeInstanceOf(TaskConflictError);
		await expect(deleteTask(t.db, 'u1', a, 'tree', '')).rejects.toBeInstanceOf(TaskConflictError);
		// 重新確認後才刪
		const fresh = planKey(await planDelete(t.db, 'u1', a), 'tree');
		await deleteTask(t.db, 'u1', a, 'tree', fresh);
		expect(await t.db.select().from(task).all()).toEqual([]);
	});

	it('childless task: key "none" deletes; a child appearing in between conflicts', async () => {
		const a = await mk('u1', 'A');
		const key = planKey(await planDelete(t.db, 'u1', a), 'single');
		expect(key).toBe('none');
		await mk('u1', 'B', a);
		await expect(deleteTask(t.db, 'u1', a, 'single', key)).rejects.toBeInstanceOf(
			TaskConflictError
		);
		expect(await t.db.select().from(task).all()).toHaveLength(2);
	});
});

describe('done gate (D66)', () => {
	it('rejects done while direct children are unfinished; allows once all done', async () => {
		const a = await mk('u1', 'A');
		const b = await mk('u1', 'B', a);
		const c = await mk('u1', 'C', a);
		const d = await mk('u1', 'D', b); // 孫任務不算
		await expect(updateTask(t.db, 'u1', a, { status: 'done' })).rejects.toThrow(
			'還有 2 個子任務未完成'
		);
		await updateTask(t.db, 'u1', c, { status: 'done' });
		await expect(updateTask(t.db, 'u1', a, { status: 'done' })).rejects.toThrow(
			'還有 1 個子任務未完成'
		);
		await updateTask(t.db, 'u1', d, { status: 'done' });
		await updateTask(t.db, 'u1', b, { status: 'done' });
		await updateTask(t.db, 'u1', a, { status: 'done' });
		expect((await getTask(t.db, 'u1', a)).status).toBe('done');
	});

	it('allows done without children; later children do not touch a done parent', async () => {
		const a = await mk('u1', 'A');
		await updateTask(t.db, 'u1', a, { status: 'done' });
		const b = await mk('u1', 'B', a);
		expect((await getTask(t.db, 'u1', b)).status).not.toBe('done');
		expect((await getTask(t.db, 'u1', a)).status).toBe('done');
		await updateTask(t.db, 'u1', a, { title: 'A2', status: 'done' }); // 已完成再存不重檢
		expect(await getTask(t.db, 'u1', a)).toMatchObject({ title: 'A2', status: 'done' });
	});
});
