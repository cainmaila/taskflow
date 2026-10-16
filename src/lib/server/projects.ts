import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from './db/index';
import { project, projectMember, projectTask, task, user, type ProjectRole } from './db/schema';
import {
	canAttachTask,
	canCreateProject,
	canManageProject,
	canViewProject,
	isProjectRole,
	ProjectError,
	ProjectForbiddenError,
	ProjectNotFoundError,
	validateDescription,
	validateName
} from './project-rules';
import { moveFlags, getTask, listColumns, TaskNotFoundError } from './tasks';

export { ProjectError, ProjectForbiddenError, ProjectNotFoundError };

type Db = ReturnType<typeof getDb>;
/** systemRole 是帳號層級角色（system_admin／manager／member） */
export type ProjectActor = { userId: string; systemRole: string | null | undefined };

const isUnique = (e: unknown) =>
	/UNIQUE constraint|PRIMARY KEY/i.test(
		`${(e as Error).message} ${((e as Error).cause as Error | undefined)?.message ?? ''}`
	);

const memberRole = async (db: Db, projectId: string, userId: string) =>
	(
		await db
			.select({ role: projectMember.role })
			.from(projectMember)
			.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
			.get()
	)?.role ?? null;

/** 載入專案並檢查可見性（D63）；非成員且非 system_admin 一律當作不存在 */
const loadViewable = async (db: Db, a: ProjectActor, projectId: string) => {
	const p = await db.select().from(project).where(eq(project.id, projectId)).get();
	const role = p ? await memberRole(db, projectId, a.userId) : null;
	if (!p || !canViewProject(role, a)) throw new ProjectNotFoundError('找不到專案');
	return { p, role };
};

/** 載入並要求管理權限（D58） */
const loadManageable = async (db: Db, a: ProjectActor, projectId: string) => {
	const r = await loadViewable(db, a, projectId);
	if (!canManageProject(r.role, a)) throw new ProjectForbiddenError('沒有權限');
	return r.p;
};

// shortcut: 封存檢查與後續寫入是 read-then-write，封存瞬間的並行寫入可能漏網；約 15 人且封存低頻，接受，要嚴格時把條件併進寫入的 SQL
const assertWritable = (p: { archivedAt: Date | null }) => {
	if (p.archivedAt) throw new ProjectError('專案已封存，無法修改');
};

export const createProject = async (
	db: Db,
	a: ProjectActor,
	input: { name: unknown; description?: unknown }
) => {
	if (!canCreateProject(a.systemRole)) throw new ProjectForbiddenError('沒有權限建立專案');
	const name = validateName(input.name);
	const description = validateDescription(input.description);
	const id = crypto.randomUUID();
	// batch 在 D1 為單一交易：專案與其第一位 owner 同生同滅
	await db.batch([
		db.insert(project).values({ id, name, description, createdBy: a.userId }),
		db.insert(projectMember).values({ projectId: id, userId: a.userId, role: 'owner' })
	]);
	return id;
};

/** 卡片用的成員預覽人數上限 */
const PREVIEW_MEMBERS = 4;

/**
 * D63：成員看自己的專案，system_admin 看全部；預設不含封存（D60）。
 * 附帶卡片用的唯讀資料：描述、任務數／完成數（專案內任務對所有可見專案的人一致，D64）、成員預覽。
 */
export const listMyProjects = async (
	db: Db,
	a: ProjectActor,
	opts: { includeArchived?: boolean } = {}
) => {
	const rows = await db
		.select({
			id: project.id,
			name: project.name,
			description: project.description,
			archivedAt: project.archivedAt,
			myRole: sql<ProjectRole | null>`(select pm.role from project_member pm where pm.project_id = project.id and pm.user_id = ${a.userId})`,
			taskCount: sql<number>`(select count(*) from project_task pt where pt.project_id = project.id)`,
			doneCount: sql<number>`(select count(*) from project_task pt join task t on t.id = pt.task_id where pt.project_id = project.id and t.status = 'done')`,
			memberCount: sql<number>`(select count(*) from project_member pm where pm.project_id = project.id)`
		})
		.from(project)
		.where(
			and(
				opts.includeArchived ? undefined : isNull(project.archivedAt),
				a.systemRole === 'system_admin'
					? undefined
					: sql`exists (select 1 from project_member pm where pm.project_id = project.id and pm.user_id = ${a.userId})`
			)
		)
		.orderBy(asc(project.name), desc(project.createdAt))
		.all();
	if (!rows.length) return [];
	// 只查結果裡這些專案（已過可見性篩選）的成員；D1 單一查詢最多 100 個綁定參數，故分批
	const ms: { projectId: string; name: string }[] = [];
	for (let i = 0; i < rows.length; i += 90) {
		ms.push(
			...(await db
				.select({ projectId: projectMember.projectId, name: user.name })
				.from(projectMember)
				.innerJoin(user, eq(user.id, projectMember.userId))
				.where(
					inArray(
						projectMember.projectId,
						rows.slice(i, i + 90).map((r) => r.id)
					)
				)
				.orderBy(asc(user.name))
				.all())
		);
	}
	return rows.map((r) => ({
		...r,
		memberPreview: ms
			.filter((m) => m.projectId === r.id)
			.slice(0, PREVIEW_MEMBERS)
			.map((m) => m.name)
	}));
};

export const getProject = async (db: Db, a: ProjectActor, projectId: string) => {
	const { p, role } = await loadViewable(db, a, projectId);
	const members = await db
		.select({
			userId: projectMember.userId,
			name: user.name,
			email: user.email,
			role: projectMember.role,
			banned: user.banned
		})
		.from(projectMember)
		.innerJoin(user, eq(user.id, projectMember.userId))
		.where(eq(projectMember.projectId, projectId))
		.orderBy(asc(user.name))
		.all();
	return { ...p, myRole: role, canManage: canManageProject(role, a), members };
};

export const updateProject = async (
	db: Db,
	a: ProjectActor,
	projectId: string,
	patch: { name?: unknown; description?: unknown }
) => {
	const p = await loadManageable(db, a, projectId);
	assertWritable(p);
	const set: Partial<typeof project.$inferInsert> = {};
	if (patch.name !== undefined) set.name = validateName(patch.name);
	if (patch.description !== undefined) set.description = validateDescription(patch.description);
	if (Object.keys(set).length) await db.update(project).set(set).where(eq(project.id, projectId));
};

/** D60：封存／取消封存不受「已封存禁止修改」限制 */
export const setArchived = async (
	db: Db,
	a: ProjectActor,
	projectId: string,
	archived: boolean
) => {
	await loadManageable(db, a, projectId);
	await db
		.update(project)
		.set({ archivedAt: archived ? new Date() : null })
		.where(eq(project.id, projectId));
};
export const archiveProject = (db: Db, a: ProjectActor, id: string) => setArchived(db, a, id, true);
export const unarchiveProject = (db: Db, a: ProjectActor, id: string) =>
	setArchived(db, a, id, false);

// ---- 成員（D58/D62）----

export const addMember = async (
	db: Db,
	a: ProjectActor,
	projectId: string,
	userId: string,
	role: unknown = 'member'
) => {
	const p = await loadManageable(db, a, projectId);
	assertWritable(p);
	if (!isProjectRole(role)) throw new ProjectError('角色不正確');
	const u = await db.select({ banned: user.banned }).from(user).where(eq(user.id, userId)).get();
	if (!u || u.banned) throw new ProjectError('帳號不存在或已停用');
	try {
		await db.insert(projectMember).values({ projectId, userId, role });
	} catch (e) {
		if (isUnique(e)) throw new ProjectError('已經是專案成員');
		throw e;
	}
};

const LAST_OWNER = '專案至少要保留一位管理者，請先指定另一位管理者';

/**
 * D62：單一 SQL 陳述式同時檢查「是否為最後一個 owner」並套用變更。
 * D1 沒有跨呼叫的交易，但單一陳述式是原子的，兩個人同時降級／移除不同 owner 時，後者會看到前者的結果。
 */
export const removeMember = async (db: Db, a: ProjectActor, projectId: string, userId: string) => {
	const p = await loadManageable(db, a, projectId);
	assertWritable(p);
	if ((await memberRole(db, projectId, userId)) === null) throw new ProjectError('找不到這位成員');
	const res = await db.run(sql`
		delete from project_member where project_id = ${projectId} and user_id = ${userId}
		and (role != 'owner' or (select count(*) from project_member where project_id = ${projectId} and role = 'owner') > 1)`);
	if (!res.meta.changes) throw new ProjectError(LAST_OWNER);
};

export const setMemberRole = async (
	db: Db,
	a: ProjectActor,
	projectId: string,
	userId: string,
	role: unknown
) => {
	const p = await loadManageable(db, a, projectId);
	assertWritable(p);
	if (!isProjectRole(role)) throw new ProjectError('角色不正確');
	const current = await memberRole(db, projectId, userId);
	if (current === null) throw new ProjectError('找不到這位成員');
	if (current === role) return;
	const res = await db.run(sql`
		update project_member set role = ${role} where project_id = ${projectId} and user_id = ${userId}
		and (role != 'owner' or ${role} = 'owner' or (select count(*) from project_member where project_id = ${projectId} and role = 'owner') > 1)`);
	if (!res.meta.changes) throw new ProjectError(LAST_OWNER);
};

// ---- 任務掛接（D59/D64）----

const loadAttachTarget = async (db: Db, a: ProjectActor, projectId: string, taskId: string) => {
	const { p, role } = await loadViewable(db, a, projectId);
	// 看不到的任務（含個人根）當作不存在，不洩漏
	const t = await getTask(db, a.userId, taskId).catch((e) => {
		if (e instanceof TaskNotFoundError) throw new ProjectNotFoundError('找不到任務');
		throw e;
	});
	if (!canAttachTask(t, role, a.userId))
		throw new ProjectForbiddenError('只有任務的建立者或指派人，且是專案成員，才能掛接');
	assertWritable(p);
};

export const attachTask = async (db: Db, a: ProjectActor, projectId: string, taskId: string) => {
	await loadAttachTarget(db, a, projectId, taskId);
	try {
		await db.insert(projectTask).values({ projectId, taskId });
	} catch (e) {
		if (isUnique(e)) throw new ProjectError('任務已經在這個專案裡');
		throw e;
	}
};

export const detachTask = async (db: Db, a: ProjectActor, projectId: string, taskId: string) => {
	await loadAttachTarget(db, a, projectId, taskId);
	const res = await db
		.delete(projectTask)
		.where(and(eq(projectTask.projectId, projectId), eq(projectTask.taskId, taskId)));
	if (!res.meta.changes) throw new ProjectError('任務不在這個專案裡');
};

/** D6：只列明確掛在該專案的任務；專案成員因此能看到它們（D11）。canDetach 依 D59/D64 由 server 算好 */
export const listProjectTasks = async (db: Db, a: ProjectActor, projectId: string) => {
	const { p, role } = await loadViewable(db, a, projectId);
	const rows = await db
		.select({ ...listColumns, ...moveFlags(a.userId) })
		.from(projectTask)
		.innerJoin(task, eq(task.id, projectTask.taskId))
		.where(eq(projectTask.projectId, projectId))
		.orderBy(asc(task.position), asc(task.id))
		.all();
	return rows.map((t) => ({
		...t,
		canDetach: !p.archivedAt && canAttachTask(t, role, a.userId)
	}));
};

/** 任務詳情的「所屬專案」：只列我是成員的專案（其餘不洩漏，D63），並算好我能不能掛／取消 */
export const listTaskProjects = async (db: Db, userId: string, taskId: string) => {
	const t = await getTask(db, userId, taskId).catch((e) => {
		if (e instanceof TaskNotFoundError) throw new ProjectNotFoundError('找不到任務');
		throw e;
	});
	const mine = await db
		.select({
			id: project.id,
			name: project.name,
			archivedAt: project.archivedAt,
			role: projectMember.role,
			attached: sql<number>`exists (select 1 from project_task pt where pt.project_id = project.id and pt.task_id = ${taskId})`
		})
		.from(projectMember)
		.innerJoin(project, eq(project.id, projectMember.projectId))
		.where(eq(projectMember.userId, userId))
		.orderBy(asc(project.name))
		.all();
	const mayAttach = t.createdBy === userId || t.assigneeId === userId;
	// 經由上層任務而屬於的專案（我是成員、且不是直接掛在這個任務上）
	const inherited = await db.all<{ id: string; name: string }>(sql`
		with recursive anc(id) as (
			select tp.parent_id from task_parent tp where tp.child_id = ${taskId}
			union select tp.parent_id from task_parent tp join anc on tp.child_id = anc.id
		)
		select distinct p.id as id, p.name as name from project_task pt
		join project p on p.id = pt.project_id
		join project_member pm on pm.project_id = p.id and pm.user_id = ${userId}
		where pt.task_id in (select id from anc)
		and not exists (select 1 from project_task d where d.project_id = p.id and d.task_id = ${taskId})
		order by p.name`);
	return {
		inherited,
		attached: mine
			.filter((p) => p.attached)
			.map((p) => ({
				id: p.id,
				name: p.name,
				archived: !!p.archivedAt,
				canDetach: mayAttach && !p.archivedAt
			})),
		attachable: mayAttach
			? mine.filter((p) => !p.attached && !p.archivedAt).map((p) => ({ id: p.id, name: p.name }))
			: []
	};
};

/** 篩選選單用：我是成員的專案（含封存，因為封存專案的任務仍可篩選） */
export const listMemberProjects = (db: Db, userId: string) =>
	db
		.select({
			id: project.id,
			name: project.name,
			archived: sql<number>`project.archived_at is not null`
		})
		.from(projectMember)
		.innerJoin(project, eq(project.id, projectMember.projectId))
		.where(eq(projectMember.userId, userId))
		.orderBy(asc(project.name))
		.all();

/** 可加入專案的人：未停用、尚不是成員；需管理權限 */
export const listAddableUsers = async (db: Db, a: ProjectActor, projectId: string) => {
	await loadManageable(db, a, projectId);
	return db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(
			and(
				or(isNull(user.banned), eq(user.banned, false)),
				sql`not exists (select 1 from project_member pm where pm.project_id = ${projectId} and pm.user_id = user.id)`
			)
		)
		.orderBy(asc(user.name))
		.all();
};
