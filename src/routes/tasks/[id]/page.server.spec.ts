import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	project,
	projectMember,
	projectTask,
	task,
	taskParent,
	user
} from '#lib/server/db/schema.ts';
import { addMember, archiveProject, createProject } from '#lib/server/projects.ts';
import { createTask } from '#lib/server/tasks.ts';
import { createTestDb } from '#lib/server/test-db.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('#lib/server/db/index.ts', async (orig) => {
	const actual = await orig<typeof import('#lib/server/db/index.ts')>();
	// 建立 t 之前（createTestDb 自己用）走原本的實作
	return { getDb: (d1: D1Database) => (t ? t.db : actual.getDb(d1)) };
});

const { actions, load } = await import('./+page.server');
const children = await import('./children/+server');

beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

let id: string;
beforeEach(async () => {
	for (const table of [projectTask, projectMember, project, taskParent, task, user])
		await t.db.delete(table);
	await t.db.insert(user).values([
		{ id: 'u1', name: 'A', email: 'a@x.io' },
		{ id: 'u2', name: 'B', email: 'b@x.io' },
		{ id: 'u3', name: 'C', email: 'c@x.io' }
	]);
	id = await createTask(t.db, 'u1', { title: 'T', dueDate: '2026-10-20' });
});

const ev = (userId: string | null, fields: Record<string, string> = {}, taskId = id) =>
	({
		locals: { user: userId ? { id: userId } : undefined },
		params: { id: taskId },
		request: { formData: async () => new URLSearchParams(fields) }
	}) as never;

describe('task detail routes', () => {
	it('logged-out redirects to /login', async () => {
		const e = await Promise.resolve(actions.save!(ev(null))).catch((x) => x);
		expect(e).toMatchObject({ status: 302, location: '/login' });
		await expect(Promise.resolve(load!(ev(null))).catch((x) => x)).resolves.toMatchObject({
			location: '/login'
		});
	});

	it('maps errors to 400 / 403 / 404', async () => {
		const bad = await actions.save!(ev('u1', { title: '', dueDate: '2026-10-20' }));
		expect(bad).toMatchObject({ status: 400 });
		await actions.save!(ev('u1', { title: 'T', dueDate: '2026-10-20', assigneeId: 'u2' }));
		const forbidden = await actions.save!(
			ev('u2', { title: 'T', dueDate: '2026-10-20', assigneeId: '' })
		);
		expect(forbidden).toMatchObject({ status: 403 });
		expect(await actions.delete!(ev('u2'))).toMatchObject({ status: 403 });
		await expect(
			Promise.resolve(actions.save!(ev('u2', { title: 'x', dueDate: '2026-10-20' }, 'nope'))).catch(
				(x) => x
			)
		).resolves.toMatchObject({ status: 404 });
		await expect(
			Promise.resolve(load!(ev('u2', {}, 'nope'))).catch((x) => x)
		).resolves.toMatchObject({
			status: 404
		});
	});

	it('DAG actions map to 400 / 403 / 404 and logged-out redirects', async () => {
		const other = await createTask(t.db, 'u1', { title: 'O', dueDate: '2026-10-20' });
		const run = (p: unknown) => Promise.resolve(p).catch((x) => x);
		expect(await run(actions.attach!(ev(null)))).toMatchObject({ location: '/login' });
		expect(await run(actions.detach!(ev(null)))).toMatchObject({ location: '/login' });
		expect(await run(actions.addChild!(ev(null)))).toMatchObject({ location: '/login' });
		// self / cycle -> 400
		expect(await actions.attach!(ev('u1', { childId: id }))).toMatchObject({ status: 400 });
		await actions.attach!(ev('u1', { childId: other }));
		expect(await actions.attach!(ev('u1', { childId: other }))).toMatchObject({ status: 400 });
		expect(await run(actions.attach!(ev('u1', { childId: id }, other)))).toMatchObject({
			status: 400
		});
		// stranger -> 404; assignee of the parent only views children -> 403 on a task they cannot operate
		expect(await run(actions.attach!(ev('u2', { childId: other })))).toMatchObject({ status: 404 });
		await actions.save!(ev('u1', { title: 'T', dueDate: '2026-10-20', assigneeId: 'u2' }));
		expect(await actions.attach!(ev('u2', { childId: other }))).toMatchObject({ status: 403 });
		expect(await actions.addChild!(ev('u2', { title: '', dueDate: '2026-10-20' }))).toMatchObject({
			status: 400
		});
		expect(await actions.detach!(ev('u1', { parentId: 'nope' }, other))).toMatchObject({
			status: 400
		});
		// delete: assignee 403; missing/stale confirmation -> 409 with fresh plan and nothing deleted
		expect(await actions.delete!(ev('u2', { mode: 'tree' }))).toMatchObject({ status: 403 });
		const stale = await actions.delete!(ev('u1', { mode: 'tree', expect: 'tree:1:0:0:0' }));
		expect(stale).toMatchObject({ status: 409, data: { plan: { childCount: 1 } } });
		expect(await t.db.select().from(task).all()).toHaveLength(2);
		expect(
			await run(actions.delete!(ev('u1', { mode: 'tree', expect: 'tree:2:0:0:0' })))
		).toMatchObject({
			status: 303,
			location: '/tasks'
		});
	});

	it('children endpoint: 401 logged out, 404 for non-viewers, rows for viewers', async () => {
		const get = (u: string | null, taskId = id) =>
			Promise.resolve(children.GET(ev(u, {}, taskId))).catch((x) => x);
		expect(await get(null)).toMatchObject({ status: 401 });
		expect(await get('u2')).toMatchObject({ status: 404 });
		await createTask(t.db, 'u1', { title: 'kid', dueDate: '2026-10-20', parentId: id });
		const res = (await get('u1')) as Response;
		expect(((await res.json()) as { title: string }[]).map((r) => r.title)).toEqual(['kid']);
	});
});

describe('task project actions', () => {
	const run = (p: unknown) => Promise.resolve(p).catch((x) => x);
	const mgr = { userId: 'u1', systemRole: 'manager' };
	const mkTask = (title: string, parentId?: string) =>
		createTask(t.db, 'u1', { title, dueDate: '2026-10-20', parentId });

	it('attachProject / detachProject map to 404 / 403 / 400', async () => {
		const pid = await createProject(t.db, mgr, { name: 'P' });
		await addMember(t.db, mgr, pid, 'u2');
		const body = { projectId: pid };

		// 404：u3 不是專案成員；u2 是成員但看不到這個任務
		expect(await run(actions.attachProject!(ev('u3', body)))).toMatchObject({ status: 404 });
		expect(await run(actions.attachProject!(ev('u2', body)))).toMatchObject({ status: 404 });

		// 403：u2 因上層任務而看得到 child，但不是 child 的建立者／指派人
		const parent = await mkTask('Parent');
		await actions.save!(
			ev('u1', { title: 'Parent', dueDate: '2026-10-20', assigneeId: 'u2' }, parent)
		);
		const child = await mkTask('Child', parent);
		expect(await actions.attachProject!(ev('u2', body, child))).toMatchObject({ status: 403 });
		expect(await actions.detachProject!(ev('u2', body, child))).toMatchObject({ status: 403 });

		// 建立者成功；重複掛接 400；取消後再取消 400
		expect(await actions.attachProject!(ev('u1', body))).toEqual({ projectAttached: true });
		expect(await actions.attachProject!(ev('u1', body))).toMatchObject({ status: 400 });
		expect(await actions.detachProject!(ev('u1', body))).toEqual({ projectDetached: true });
		expect(await actions.detachProject!(ev('u1', body))).toMatchObject({ status: 400 });

		// 400：封存後不能再掛
		await archiveProject(t.db, mgr, pid);
		expect(await actions.attachProject!(ev('u1', body))).toMatchObject({ status: 400 });

		// 未登入
		expect(await run(actions.attachProject!(ev(null, body)))).toMatchObject({ location: '/login' });
		expect(await run(actions.detachProject!(ev(null, body)))).toMatchObject({ location: '/login' });
	});
});
