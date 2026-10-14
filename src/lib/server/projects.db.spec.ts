import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { project, projectMember, projectTask, task, taskParent, user } from './db/schema';
import {
	addMember,
	archiveProject,
	attachTask,
	createProject,
	detachTask,
	getProject,
	listMyProjects,
	listProjectTasks,
	ProjectError,
	ProjectForbiddenError,
	ProjectNotFoundError,
	removeMember,
	setMemberRole,
	unarchiveProject,
	updateProject,
	type ProjectActor
} from './projects';
import {
	attachChild,
	createTask,
	deleteTask,
	getTask,
	listParents,
	shareScope,
	TaskNotFoundError,
	updateTask
} from './tasks';
import { createTestDb } from './test-db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

const as = (userId: string, systemRole = 'member'): ProjectActor => ({ userId, systemRole });
const admin = as('adm', 'system_admin');
const mgr = as('mgr', 'manager'); // 建專案、第一位 owner
const mem = as('mem'); // 一般成員
const out = as('out'); // 非成員

beforeEach(async () => {
	await t.db.delete(projectTask);
	await t.db.delete(projectMember);
	await t.db.delete(project);
	await t.db.delete(taskParent);
	await t.db.delete(task);
	await t.db.delete(user);
	await t.db.insert(user).values([
		{ id: 'adm', name: 'Admin', email: 'adm@x.io', role: 'system_admin' },
		{ id: 'mgr', name: 'Mgr', email: 'mgr@x.io', role: 'manager' },
		{ id: 'mem', name: 'Mem', email: 'mem@x.io' },
		{ id: 'out', name: 'Out', email: 'out@x.io' },
		{ id: 'ban', name: 'Banned', email: 'ban@x.io', banned: true }
	]);
});

const mkProject = async (name = 'P') => {
	const id = await createProject(t.db, mgr, { name });
	await addMember(t.db, mgr, id, 'mem');
	return id;
};
const mkTask = (u: string, title = 'T', parentId?: string) =>
	createTask(t.db, u, { title, dueDate: '2026-10-20', parentId });
const visible = (u: string, id: string) =>
	getTask(t.db, u, id).then(
		() => true,
		() => false
	);
const roleOf = async (pid: string, uid: string) =>
	(await t.db.select().from(projectMember).where(eq(projectMember.projectId, pid)).all()).find(
		(m) => m.userId === uid
	)?.role;

describe('createProject / read (D56, D63)', () => {
	it('manager and admin create; member cannot; creator becomes owner', async () => {
		await expect(createProject(t.db, mem, { name: 'x' })).rejects.toThrow(ProjectForbiddenError);
		await expect(createProject(t.db, mgr, { name: ' ' })).rejects.toThrow(ProjectError);
		const id = await createProject(t.db, mgr, { name: ' Alpha ', description: 'd' });
		expect(await roleOf(id, 'mgr')).toBe('owner');
		expect(await createProject(t.db, admin, { name: 'B' })).toBeTruthy();
		expect(await getProject(t.db, mgr, id)).toMatchObject({ name: 'Alpha', myRole: 'owner' });
	});

	it('non-members get NotFound; system_admin sees everything', async () => {
		const id = await mkProject();
		await expect(getProject(t.db, out, id)).rejects.toThrow(ProjectNotFoundError);
		await expect(getProject(t.db, out, 'nope')).rejects.toThrow(ProjectNotFoundError);
		expect(await getProject(t.db, admin, id)).toMatchObject({ myRole: null, canManage: true });
		expect(await getProject(t.db, mem, id)).toMatchObject({ canManage: false });
		expect((await listMyProjects(t.db, out)).length).toBe(0);
		expect((await listMyProjects(t.db, mem)).map((p) => p.name)).toEqual(['P']);
		expect((await listMyProjects(t.db, admin)).map((p) => p.name)).toEqual(['P']);
	});

	it('list hides archived unless asked (D60/D63)', async () => {
		const id = await mkProject();
		await archiveProject(t.db, mgr, id);
		expect(await listMyProjects(t.db, mgr)).toEqual([]);
		expect(await listMyProjects(t.db, mgr, { includeArchived: true })).toHaveLength(1);
		await unarchiveProject(t.db, mgr, id);
		expect(await listMyProjects(t.db, mgr)).toHaveLength(1);
	});
});

describe('members (D58, D62)', () => {
	it('permission matrix: owner/admin manage; member and stranger cannot', async () => {
		const id = await mkProject();
		await expect(addMember(t.db, mem, id, 'out')).rejects.toThrow(ProjectForbiddenError);
		await expect(setMemberRole(t.db, mem, id, 'mem', 'owner')).rejects.toThrow(
			ProjectForbiddenError
		);
		await expect(removeMember(t.db, mem, id, 'mgr')).rejects.toThrow(ProjectForbiddenError);
		await expect(updateProject(t.db, mem, id, { name: 'x' })).rejects.toThrow(
			ProjectForbiddenError
		);
		await expect(archiveProject(t.db, mem, id)).rejects.toThrow(ProjectForbiddenError);
		await expect(addMember(t.db, out, id, 'out')).rejects.toThrow(ProjectNotFoundError);
		await addMember(t.db, admin, id, 'out'); // system_admin 不必是成員
		expect(await roleOf(id, 'out')).toBe('member');
		await updateProject(t.db, mgr, id, { name: 'Renamed', description: 'x' });
		expect(await getProject(t.db, mgr, id)).toMatchObject({ name: 'Renamed' });
	});

	it('cannot add banned or unknown accounts, or duplicates', async () => {
		const id = await mkProject();
		await expect(addMember(t.db, mgr, id, 'ban')).rejects.toThrow('已停用');
		await expect(addMember(t.db, mgr, id, 'ghost')).rejects.toThrow(ProjectError);
		await expect(addMember(t.db, mgr, id, 'mem')).rejects.toThrow('已經是');
		await expect(addMember(t.db, mgr, id, 'out', 'boss' as never)).rejects.toThrow(ProjectError);
	});

	it('last owner cannot leave or be demoted; works once another owner exists', async () => {
		const id = await mkProject();
		await expect(removeMember(t.db, mgr, id, 'mgr')).rejects.toThrow('至少');
		await expect(setMemberRole(t.db, mgr, id, 'mgr', 'member')).rejects.toThrow('至少');
		expect(await roleOf(id, 'mgr')).toBe('owner');
		await setMemberRole(t.db, mgr, id, 'mem', 'owner');
		await setMemberRole(t.db, mgr, id, 'mgr', 'member');
		// mem 現在是唯一 owner
		await expect(removeMember(t.db, mem, id, 'mem')).rejects.toThrow('至少');
		await removeMember(t.db, mem, id, 'mgr');
		expect(await roleOf(id, 'mgr')).toBeUndefined();
		await expect(removeMember(t.db, mem, id, 'mgr')).rejects.toThrow('找不到');
	});

	it('two owners demoted concurrently: at least one owner remains', async () => {
		const id = await mkProject();
		await setMemberRole(t.db, mgr, id, 'mem', 'owner');
		const r = await Promise.allSettled([
			setMemberRole(t.db, mgr, id, 'mgr', 'member'),
			setMemberRole(t.db, mem, id, 'mem', 'member')
		]);
		expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
		const owners = (await t.db.select().from(projectMember).all()).filter(
			(m) => m.role === 'owner'
		);
		expect(owners).toHaveLength(1);
	});

	it('banning an owner does not remove them; system_admin can add another owner (D62)', async () => {
		const id = await mkProject();
		await t.db.update(user).set({ banned: true }).where(eq(user.id, 'mgr'));
		expect(await roleOf(id, 'mgr')).toBe('owner');
		await addMember(t.db, admin, id, 'out', 'owner');
		expect(await roleOf(id, 'out')).toBe('owner');
	});
});

describe('archive blocks writes (D64)', () => {
	it('blocks members, project data and attach/detach; unarchive restores', async () => {
		const id = await mkProject();
		const tk = await mkTask('mem');
		await attachTask(t.db, mem, id, tk);
		await archiveProject(t.db, mgr, id);
		await expect(addMember(t.db, mgr, id, 'out')).rejects.toThrow('封存');
		await expect(removeMember(t.db, mgr, id, 'mem')).rejects.toThrow('封存');
		await expect(setMemberRole(t.db, mgr, id, 'mem', 'owner')).rejects.toThrow('封存');
		await expect(updateProject(t.db, mgr, id, { name: 'x' })).rejects.toThrow('封存');
		await expect(attachTask(t.db, mem, id, await mkTask('mem', 'T2'))).rejects.toThrow('封存');
		await expect(detachTask(t.db, mem, id, tk)).rejects.toThrow('封存');
		// 任務本身的編輯權與可見性不受影響
		await updateTask(t.db, 'mem', tk, { title: 'still editable' });
		expect(await visible('mgr', tk)).toBe(true);
		await unarchiveProject(t.db, mgr, id);
		await detachTask(t.db, mem, id, tk);
	});
});

describe('attach / detach tasks (D59)', () => {
	it('needs creator-or-assignee AND membership; strangers get NotFound', async () => {
		const id = await mkProject();
		const own = await mkTask('mem');
		const others = await mkTask('out');
		await expect(attachTask(t.db, out, id, others)).rejects.toThrow(ProjectNotFoundError); // 非成員
		await expect(attachTask(t.db, mem, id, others)).rejects.toThrow(ProjectNotFoundError); // 看不到
		// 看得到但不是建立者／指派人（透過祖先）-> Forbidden
		const parent = await mkTask('out', 'Parent');
		await updateTask(t.db, 'out', parent, { assigneeId: 'mem' });
		const nested = await mkTask('out', 'Nested', parent);
		await expect(attachTask(t.db, mem, id, nested)).rejects.toThrow(ProjectForbiddenError);
		// 指派人也可以
		await updateTask(t.db, 'out', others, { assigneeId: 'mem' });
		await attachTask(t.db, mem, id, others);
		await attachTask(t.db, mem, id, own);
		await expect(attachTask(t.db, mem, id, own)).rejects.toThrow('已經在');
		expect((await listProjectTasks(t.db, mem, id)).map((x) => x.id).sort()).toEqual(
			[own, others].sort()
		);
		await detachTask(t.db, mem, id, own);
		await expect(detachTask(t.db, mem, id, own)).rejects.toThrow('不在');
	});

	it('members who are neither creator nor assignee get Forbidden on attach and detach', async () => {
		const id = await mkProject();
		const a = await mkTask('mem');
		await attachTask(t.db, mem, id, a);
		// mgr 是成員且因專案看得到 a，但不是建立者／指派人
		await expect(attachTask(t.db, mgr, id, a)).rejects.toThrow(ProjectForbiddenError);
		await expect(detachTask(t.db, mgr, id, a)).rejects.toThrow(ProjectForbiddenError);
		expect(await listProjectTasks(t.db, mgr, id)).toHaveLength(1);
	});

	it('personal roots cannot be attached', async () => {
		const id = await mkProject();
		const root = crypto.randomUUID();
		await t.db
			.insert(task)
			.values({ id: root, title: 'root', createdBy: 'mem', rootOwnerId: 'mem' });
		await expect(attachTask(t.db, mem, id, root)).rejects.toThrow(ProjectNotFoundError);
	});

	it('listProjectTasks: only explicit attachments (D6); hidden from non-members', async () => {
		const id = await mkProject();
		const a = await mkTask('mem', 'A');
		await mkTask('mem', 'child of A', a);
		await attachTask(t.db, mem, id, a);
		expect((await listProjectTasks(t.db, mgr, id)).map((x) => x.title)).toEqual(['A']);
		await expect(listProjectTasks(t.db, out, id)).rejects.toThrow(ProjectNotFoundError);
	});
});

describe('visibility through projects (D11/D14)', () => {
	it('members see attached task and all descendants; others and non-attached stay hidden', async () => {
		const id = await mkProject();
		const a = await mkTask('mem', 'A');
		const b = await mkTask('mem', 'B', a);
		const c = await mkTask('mem', 'C', b);
		const lone = await mkTask('mem', 'Lone');
		expect(await visible('mgr', c)).toBe(false);
		await attachTask(t.db, mem, id, a);
		for (const x of [a, b, c]) expect(await visible('mgr', x)).toBe(true);
		expect(await visible('mgr', lone)).toBe(false);
		expect(await visible('out', c)).toBe(false);
		// 向上不傳遞：掛在中間層，看不到祖先
		const id2 = await createProject(t.db, mgr, { name: 'Q' });
		const x = await mkTask('mem', 'X');
		const y = await mkTask('mem', 'Y', x);
		await addMember(t.db, mgr, id2, 'mem');
		await attachTask(t.db, mem, id2, y);
		expect(await visible('mgr', y)).toBe(true);
		expect(await visible('mgr', x)).toBe(false);
	});

	it('membership is dynamic: removal and detach revoke; archive does not (D64)', async () => {
		const id = await mkProject();
		const a = await mkTask('mem');
		await attachTask(t.db, mem, id, a);
		await archiveProject(t.db, mgr, id);
		expect(await visible('mgr', a)).toBe(true);
		await unarchiveProject(t.db, mgr, id);
		await removeMember(t.db, mgr, id, 'mem');
		expect(await visible('mem', a)).toBe(true); // 建立者仍可見
		await addMember(t.db, mgr, id, 'mem');
		await detachTask(t.db, mem, id, a);
		expect(await visible('mgr', a)).toBe(false);
	});

	it('project members can view but not edit/delete (D45)', async () => {
		const id = await mkProject();
		const a = await mkTask('mem');
		await attachTask(t.db, mem, id, a);
		await expect(updateTask(t.db, 'mgr', a, { title: 'x' })).rejects.toThrow('沒有權限');
		await expect(deleteTask(t.db, 'mgr', a)).rejects.toThrow('只有建立者');
	});

	it('listParents counts project-visible parents as visible; others stay hidden', async () => {
		const id = await mkProject();
		const p = await mkTask('mem', 'ProjParent');
		await attachTask(t.db, mem, id, p);
		const mine = await mkTask('mgr', 'MyParent');
		const child = await mkTask('mgr', 'Child', mine);
		await updateTask(t.db, 'mgr', child, { assigneeId: 'mem' });
		await attachChild(t.db, 'mgr', p, child); // mgr 看得到 p（專案成員）且是 child 建立者
		const parents = await listParents(t.db, 'mgr', child);
		expect(parents.visible.map((x) => x.title).sort()).toEqual(['MyParent', 'ProjParent']);
		await expect(getTask(t.db, 'out', child)).rejects.toThrow(TaskNotFoundError);
	});

	it('shareScope includes project members who would gain access', async () => {
		const id = await mkProject();
		const p = await mkTask('mem', 'P');
		await attachTask(t.db, mem, id, p);
		const c = await mkTask('mem', 'C');
		expect((await shareScope(t.db, p, c)).map((u) => u.name)).toEqual(['Mgr']);
	});

	it('shareScope omits banned users (creator, assignee and project members)', async () => {
		const id = await mkProject();
		const p = await mkTask('mem', 'P');
		await attachTask(t.db, mem, id, p);
		await updateTask(t.db, 'mem', p, { assigneeId: 'out' });
		const c = await mkTask('ban', 'C');
		await t.db.update(user).set({ banned: true }).where(eq(user.id, 'mgr'));
		await t.db.update(user).set({ banned: true }).where(eq(user.id, 'out'));
		expect((await shareScope(t.db, p, c)).map((u) => u.name)).toEqual(['Mem']);
	});

	it('deleting a task removes its project links (cascade)', async () => {
		const id = await mkProject();
		const a = await mkTask('mem');
		await attachTask(t.db, mem, id, a);
		await deleteTask(t.db, 'mem', a);
		expect(await t.db.select().from(projectTask).all()).toEqual([]);
		expect(await t.db.select().from(project).all()).toHaveLength(1);
	});
});
