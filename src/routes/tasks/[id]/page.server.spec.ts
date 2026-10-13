import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { task, taskParent, user } from '#lib/server/db/schema.ts';
import { createTask } from '#lib/server/tasks.ts';
import { createTestDb } from '#lib/server/test-db.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('#lib/server/db/index.ts', async (orig) => {
	const actual = await orig<typeof import('#lib/server/db/index.ts')>();
	// 建立 t 之前（createTestDb 自己用）走原本的實作
	return { getDb: (d1: D1Database) => (t ? t.db : actual.getDb(d1)) };
});

const { actions, load } = await import('./+page.server');

beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

let id: string;
beforeEach(async () => {
	await t.db.delete(taskParent);
	await t.db.delete(task);
	await t.db.delete(user);
	await t.db.insert(user).values([
		{ id: 'u1', name: 'A', email: 'a@x.io' },
		{ id: 'u2', name: 'B', email: 'b@x.io' }
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
});
