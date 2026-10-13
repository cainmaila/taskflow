import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from './db/index';
import { task, taskParent, user, type TaskStatus } from './db/schema';
import {
	applyFilters,
	canAssign,
	canDelete,
	canEdit,
	canView,
	isStatus,
	TaskError,
	TaskForbiddenError,
	TaskNotFoundError,
	validateDates,
	validateTitle,
	type TaskFilters,
	type TaskSource
} from './task-rules';

export { TaskError, TaskForbiddenError, TaskNotFoundError };

type Db = ReturnType<typeof getDb>;

/** D41：懶建立、冪等；併發時靠 root_owner_id 唯一索引擋下，輸家重讀 */
export const ensurePersonalRoot = async (db: Db, userId: string) => {
	const find = () =>
		db.select({ id: task.id }).from(task).where(eq(task.rootOwnerId, userId)).get();
	const existing = await find();
	if (existing) return existing.id;

	const owner = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
	if (!owner) throw new TaskError('找不到使用者');
	await db
		.insert(task)
		.values({ title: owner.name, createdBy: userId, rootOwnerId: userId })
		.onConflictDoNothing();
	return (await find())!.id;
};

export const createTask = async (
	db: Db,
	userId: string,
	input: { title: unknown; dueDate: unknown }
) => {
	const title = validateTitle(input.title);
	const dueDate = typeof input.dueDate === 'string' ? input.dueDate : null;
	validateDates(null, dueDate);
	const rootId = await ensurePersonalRoot(db, userId);
	const id = crypto.randomUUID();
	// batch 在 D1 為單一交易：任務與其 parent 關聯同生同滅
	await db.batch([
		db.insert(task).values({ id, title, dueDate, createdBy: userId }),
		db.insert(taskParent).values({ parentId: rootId, childId: id })
	]);
	return id;
};

export const listMyTasks = async (db: Db, userId: string, filters: TaskFilters, today: string) => {
	const root = await db
		.select({ id: task.id })
		.from(task)
		.where(eq(task.rootOwnerId, userId))
		.get();
	const own = root
		? sql<number>`exists (select 1 from ${taskParent} where ${taskParent.parentId} = ${root.id} and ${taskParent.childId} = ${task.id})`
		: sql<number>`0`;
	const rows = await db
		.select({ task, own })
		.from(task)
		.where(and(isNull(task.rootOwnerId), or(eq(task.assigneeId, userId), sql`${own}`)))
		.orderBy(asc(task.dueDate), asc(task.createdAt))
		.all();
	// shortcut: 在記憶體篩選（約 15 人的規模），資料量變大時把條件下推到 SQL
	return applyFilters(
		rows.map((r) => ({ ...r.task, source: (r.own ? 'own' : 'assigned') as TaskSource })),
		filters,
		today
	);
};

/** 取得任務並檢查可見性；個人根與不可見的任務一律視為不存在，不洩漏存在與否 */
const loadVisible = async (db: Db, userId: string, id: string) => {
	const t = await db.select().from(task).where(eq(task.id, id)).get();
	if (!t || t.rootOwnerId !== null || !canView(t, { userId }))
		throw new TaskNotFoundError('找不到任務');
	return t;
};

export const getTask = (db: Db, userId: string, id: string) => loadVisible(db, userId, id);

export type TaskPatch = {
	title?: unknown;
	description?: unknown;
	status?: unknown;
	startDate?: unknown;
	dueDate?: unknown;
	assigneeId?: unknown;
};

export const updateTask = async (db: Db, userId: string, id: string, patch: TaskPatch) => {
	const t = await loadVisible(db, userId, id);
	const actor = { userId };
	if (!canEdit(t, actor)) throw new TaskForbiddenError('沒有權限');

	const set: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
	if (patch.title !== undefined) set.title = validateTitle(patch.title);
	if (patch.description !== undefined) {
		if (typeof patch.description !== 'string') throw new TaskError('描述格式不正確');
		set.description = patch.description;
	}
	if (patch.status !== undefined) {
		if (!isStatus(patch.status)) throw new TaskError('狀態不正確');
		set.status = patch.status as TaskStatus;
	}
	const startDate =
		patch.startDate === undefined ? t.startDate : (patch.startDate as string | null) || null;
	const dueDate =
		patch.dueDate === undefined ? t.dueDate : (patch.dueDate as string | null) || null;
	validateDates(startDate, dueDate);
	set.startDate = startDate;
	set.dueDate = dueDate;

	if (patch.assigneeId !== undefined) {
		const assigneeId = patch.assigneeId || null;
		if (assigneeId !== t.assigneeId) {
			if (!canAssign(t, actor)) throw new TaskForbiddenError('只有建立者能改指派人');
			if (assigneeId !== null) {
				const u = await db
					.select({ banned: user.banned })
					.from(user)
					.where(eq(user.id, String(assigneeId)))
					.get();
				if (!u || u.banned) throw new TaskError('指派對象不存在或已停用');
			}
			set.assigneeId = assigneeId as string | null;
		}
	}
	await db.update(task).set(set).where(eq(task.id, id));
};

/** D46：真刪除。第 3 步尚無子任務與留言；有子孫或留言時的處理待第 4、7 步 */
export const deleteTask = async (db: Db, userId: string, id: string) => {
	const t = await loadVisible(db, userId, id);
	if (!canDelete(t, { userId })) throw new TaskForbiddenError('只有建立者能刪除');
	await db.delete(task).where(eq(task.id, id));
};
