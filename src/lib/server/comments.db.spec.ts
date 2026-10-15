import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { comment, project, projectMember, projectTask, task, taskParent, user } from './db/schema';
import { addComment, deleteComment, editComment, listComments } from './comments';
import { createProject, addMember, archiveProject } from './projects';
import {
	createTask,
	deleteTask,
	planDelete,
	TaskError,
	TaskForbiddenError,
	TaskNotFoundError
} from './tasks';
import { COMMENT_MAX } from './task-rules';
import { createTestDb } from './test-db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

let id: string;
const u = (userId: string, systemRole = 'member') => ({ userId, systemRole });
beforeEach(async () => {
	for (const table of [comment, projectTask, projectMember, project, taskParent, task, user])
		await t.db.delete(table);
	await t.db.insert(user).values([
		{ id: 'u1', name: 'Alice', email: 'a@x.io' },
		{ id: 'u2', name: 'Bob', email: 'b@x.io' },
		{ id: 'u3', name: 'Carol', email: 'c@x.io' },
		{ id: 'adm', name: 'Admin', email: 'adm@x.io', role: 'system_admin' }
	]);
	id = await createTask(t.db, 'u1', { title: 'T', dueDate: '2026-10-20' });
});

const setAssignee = (taskId: string, a: string) =>
	t.db.update(task).set({ assigneeId: a }).where(eqId(taskId));
import { eq } from 'drizzle-orm';
const eqId = (x: string) => eq(task.id, x);

describe('comments', () => {
	it('visible users can add and list in time order; others get NotFound', async () => {
		await setAssignee(id, 'u2');
		const a = await addComment(t.db, 'u1', id, ' first ');
		await new Promise((r) => setTimeout(r, 2));
		await addComment(t.db, 'u2', id, 'second');
		const rows = await listComments(t.db, 'u2', id);
		expect(rows.map((r) => [r.body, r.authorName])).toEqual([
			['first', 'Alice'],
			['second', 'Bob']
		]);
		expect(rows[0].id).toBe(a);
		await expect(addComment(t.db, 'u3', id, 'x')).rejects.toBeInstanceOf(TaskNotFoundError);
		await expect(listComments(t.db, 'u3', id)).rejects.toBeInstanceOf(TaskNotFoundError);
	});

	it('validates body', async () => {
		for (const bad of ['', '   ', 5, undefined, 'x'.repeat(COMMENT_MAX + 1)])
			await expect(addComment(t.db, 'u1', id, bad)).rejects.toBeInstanceOf(TaskError);
		await addComment(t.db, 'u1', id, 'x'.repeat(COMMENT_MAX));
	});

	it('author edits (marks edited); others and admin cannot', async () => {
		await setAssignee(id, 'u2');
		const c = await addComment(t.db, 'u1', id, 'old');
		expect((await listComments(t.db, 'u1', id))[0].editedAt).toBeNull();
		await expect(editComment(t.db, 'u2', id, c, 'hijack')).rejects.toBeInstanceOf(
			TaskForbiddenError
		);
		// system_admin 看得到任務（是 creator）仍不能改別人的留言（D68）
		const own = await createTask(t.db, 'adm', { title: 'A', dueDate: '2026-10-20' });
		await setAssignee(own, 'u2');
		const c0 = await addComment(t.db, 'u2', own, 'bob says');
		await expect(editComment(t.db, 'adm', own, c0, 'hijack')).rejects.toBeInstanceOf(
			TaskForbiddenError
		);
		await expect(editComment(t.db, 'u1', id, c, ' ')).rejects.toBeInstanceOf(TaskError);
		await editComment(t.db, 'u1', id, c, 'new');
		const [row] = await listComments(t.db, 'u1', id);
		expect(row.body).toBe('new');
		expect(row.editedAt).toBeInstanceOf(Date);
		await expect(editComment(t.db, 'u3', id, c, 'x')).rejects.toBeInstanceOf(TaskNotFoundError);
		await expect(editComment(t.db, 'u1', id, 'nope', 'x')).rejects.toBeInstanceOf(
			TaskNotFoundError
		);
	});

	it('author and system_admin delete; others forbidden; even admin who cannot see the task', async () => {
		await setAssignee(id, 'u2');
		const c1 = await addComment(t.db, 'u1', id, 'a');
		const c2 = await addComment(t.db, 'u2', id, 'b');
		const c3 = await addComment(t.db, 'u1', id, 'c');
		await expect(deleteComment(t.db, u('u2'), id, c1)).rejects.toBeInstanceOf(TaskForbiddenError);
		await expect(deleteComment(t.db, u('u3'), id, c1)).rejects.toBeInstanceOf(TaskNotFoundError);
		await deleteComment(t.db, u('u1'), id, c1);
		await deleteComment(t.db, u('u2'), id, c2);
		await deleteComment(t.db, u('adm', 'system_admin'), id, c3);
		expect(await listComments(t.db, 'u1', id)).toEqual([]);
		await expect(deleteComment(t.db, u('u1'), id, c1)).rejects.toBeInstanceOf(TaskNotFoundError);
	});

	it('commentId must belong to the given task (no cross-task access)', async () => {
		const y = await createTask(t.db, 'u1', { title: 'Y', dueDate: '2026-10-20' });
		await setAssignee(id, 'u2');
		const c = await addComment(t.db, 'u2', id, 'on X');
		await expect(editComment(t.db, 'u1', y, c, 'x')).rejects.toBeInstanceOf(TaskNotFoundError);
		await expect(deleteComment(t.db, u('u1'), y, c)).rejects.toBeInstanceOf(TaskNotFoundError);
		await expect(deleteComment(t.db, u('adm', 'system_admin'), y, c)).rejects.toBeInstanceOf(
			TaskNotFoundError
		);
		expect(await listComments(t.db, 'u1', id)).toHaveLength(1);
	});

	it('counts comments in batches (>90 comments; tree >90 tasks)', async () => {
		// 每列 5 個綁定參數，D1 上限 100
		const seed = async (rows: (typeof comment.$inferInsert)[]) => {
			for (let i = 0; i < rows.length; i += 15)
				await t.db.insert(comment).values(rows.slice(i, i + 15));
		};
		const mkRows = (taskId: string, n: number) =>
			Array.from({ length: n }, (_, i) => ({ taskId, authorId: 'u1', body: `c${i}` }));
		await seed(mkRows(id, 95));
		expect(await planDelete(t.db, 'u1', id)).toMatchObject({ commentCount: 95 });

		const kids: string[] = [];
		for (let i = 0; i < 100; i++)
			kids.push(
				await createTask(t.db, 'u1', { title: `k${i}`, dueDate: '2026-10-20', parentId: id })
			);
		await seed(kids.map((k) => ({ taskId: k, authorId: 'u1', body: 'k' })));
		const plan = await planDelete(t.db, 'u1', id);
		expect(plan).toMatchObject({ childCount: 100, commentCount: 95 });
		expect((plan as { tree: { willDelete: number; commentCount: number } }).tree).toMatchObject({
			willDelete: 101,
			commentCount: 195
		});
	}, 60000);

	it('project owner has no extra power; archived project does not lock comments (D70)', async () => {
		const mgr = u('u1', 'manager');
		const pid = await createProject(t.db, mgr, { name: 'P' });
		await addMember(t.db, mgr, pid, 'u2');
		await t.db.insert(projectTask).values({ projectId: pid, taskId: id });
		const c = await addComment(t.db, 'u2', id, 'hi'); // u2 sees via project
		await expect(deleteComment(t.db, u('u1', 'manager'), id, c)).rejects.toBeInstanceOf(
			TaskForbiddenError
		);
		await archiveProject(t.db, mgr, pid);
		await editComment(t.db, 'u2', id, c, 'still ok');
		await addComment(t.db, 'u1', id, 'more');
	});

	it('banned author comments still listed (D71)', async () => {
		const c = await addComment(t.db, 'u1', id, 'x');
		await t.db.update(user).set({ banned: true }).where(eq(user.id, 'u1'));
		const [row] = await listComments(t.db, 'u1', id);
		expect([row.id, row.authorName]).toEqual([c, 'Alice']);
	});

	it('deleting a task cascades comments; plan reports commentCount without changing key', async () => {
		const child = await createTask(t.db, 'u1', { title: 'K', dueDate: '2026-10-20', parentId: id });
		await addComment(t.db, 'u1', id, 'a');
		await addComment(t.db, 'u1', id, 'b');
		await addComment(t.db, 'u1', child, 'c');
		const plan = await planDelete(t.db, 'u1', id);
		expect(plan).toMatchObject({ childCount: 1, commentCount: 2 });
		expect((plan as { tree: { commentCount: number } }).tree.commentCount).toBe(3);
		await deleteTask(t.db, 'u1', id, 'tree');
		expect(await t.db.select().from(comment).all()).toHaveLength(0);

		const solo = await createTask(t.db, 'u1', { title: 'S', dueDate: '2026-10-20' });
		await addComment(t.db, 'u1', solo, 'z');
		expect(await planDelete(t.db, 'u1', solo)).toEqual({ childCount: 0, commentCount: 1 });
		await deleteTask(t.db, 'u1', solo, 'single', 'none');
		expect(await t.db.select().from(comment).all()).toHaveLength(0);
	});

	it('single-mode delete removes only that task comments', async () => {
		const child = await createTask(t.db, 'u1', { title: 'K', dueDate: '2026-10-20', parentId: id });
		await addComment(t.db, 'u1', id, 'a');
		await addComment(t.db, 'u1', child, 'c');
		await deleteTask(t.db, 'u1', id, 'single');
		expect((await t.db.select().from(comment).all()).map((r) => r.body)).toEqual(['c']);
	});
});
