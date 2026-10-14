import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	project,
	projectMember,
	projectTask,
	task,
	taskParent,
	user
} from '#lib/server/db/schema.ts';
import { addMember, createProject } from '#lib/server/projects.ts';
import { createTestDb } from '#lib/server/test-db.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('#lib/server/db/index.ts', async (orig) => {
	const actual = await orig<typeof import('#lib/server/db/index.ts')>();
	return { getDb: (d1: D1Database) => (t ? t.db : actual.getDb(d1)) };
});

const { actions, load } = await import('./+page.server');

beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

let id: string;
beforeEach(async () => {
	for (const table of [projectTask, projectMember, project, taskParent, task, user])
		await t.db.delete(table);
	await t.db.insert(user).values([
		{ id: 'mgr', name: 'Mgr', email: 'mgr@x.io', role: 'manager' },
		{ id: 'mem', name: 'Mem', email: 'mem@x.io' },
		{ id: 'out', name: 'Out', email: 'out@x.io' }
	]);
	id = await createProject(t.db, { userId: 'mgr', systemRole: 'manager' }, { name: 'P' });
	await addMember(t.db, { userId: 'mgr', systemRole: 'manager' }, id, 'mem');
});

const ev = (userId: string | null, role: string, fields: Record<string, string> = {}, pid = id) =>
	({
		locals: { user: userId ? { id: userId, role } : undefined },
		params: { id: pid },
		request: { formData: async () => new URLSearchParams(fields) }
	}) as never;
const run = (p: unknown) => Promise.resolve(p).catch((x) => x);

describe('project detail routes', () => {
	it('logged-out redirects to /login', async () => {
		expect(await run(load!(ev(null, '')))).toMatchObject({ location: '/login' });
		expect(await run(actions.addMember!(ev(null, '')))).toMatchObject({ location: '/login' });
	});

	it('load: 404 for non-members, data for members, addable list only for managers', async () => {
		expect(await run(load!(ev('out', 'member')))).toMatchObject({ status: 404 });
		const m = (await load!(ev('mem', 'member'))) as { addable: unknown[] };
		expect(m.addable).toEqual([]);
		const o = (await load!(ev('mgr', 'manager'))) as { addable: { id: string }[] };
		expect(o.addable.map((u) => u.id)).toEqual(['out']);
	});

	it('actions map to 400 / 403 / 404', async () => {
		expect(await actions.addMember!(ev('mem', 'member', { userId: 'out' }))).toMatchObject({
			status: 403
		});
		expect(await run(actions.addMember!(ev('out', 'member', { userId: 'out' })))).toMatchObject({
			status: 404
		});
		expect(await actions.update!(ev('mgr', 'manager', { name: ' ' }))).toMatchObject({
			status: 400
		});
		expect(await actions.removeMember!(ev('mgr', 'manager', { userId: 'mgr' }))).toMatchObject({
			status: 400,
			data: { message: expect.stringContaining('至少') }
		});
		expect(
			await actions.addMember!(ev('mgr', 'manager', { userId: 'out', role: 'owner' }))
		).toEqual({
			ok: '已加入成員',
			section: 'members'
		});
		await actions.archive!(ev('mgr', 'manager'));
		expect(await actions.update!(ev('mgr', 'manager', { name: 'x' }))).toMatchObject({
			status: 400
		});
		expect(await actions.unarchive!(ev('mgr', 'manager'))).toEqual({ ok: '', section: 'info' });
	});
});
