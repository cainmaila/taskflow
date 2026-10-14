import { and, asc, eq, getTableColumns, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from './db/index';
import { task, taskParent, user, type TaskStatus } from './db/schema';
import {
	applyFilters,
	computeTreeDelete,
	TREE_DELETE_CAP,
	type DescendantEdge,
	canAssign,
	canDelete,
	canEdit,
	canView,
	DESC_MAX,
	isStatus,
	TaskConflictError,
	TaskError,
	TaskForbiddenError,
	TaskNotFoundError,
	validateDates,
	validateTitle,
	type TaskFilters,
	type TaskSource
} from './task-rules';

export { TaskConflictError, TaskError, TaskForbiddenError, TaskNotFoundError };

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

type Owned = { id: string; createdBy: string; assigneeId: string | null };

/** 任務本身加上所有祖先（D14）；個人根不在 task_parent，所以不會出現 */
const ancestorChain = (db: Db, id: string) =>
	db.all<Owned>(sql`
		with recursive anc(id) as (
			select ${id} union select tp.parent_id from task_parent tp join anc on tp.child_id = anc.id
		)
		select t.id as id, t.created_by as createdBy, t.assignee_id as assigneeId
		from task t where t.id in (select id from anc)`);

/** `descendant` 是否為 `ancestor` 本身或其子孫 */
const isSelfOrDescendant = async (db: Db, ancestor: string, descendant: string) =>
	(
		await db.all(sql`
		with recursive d(id) as (
			select ${ancestor} union select tp.child_id from task_parent tp join d on tp.parent_id = d.id
		)
		select 1 as x from d where id = ${descendant} limit 1`)
	).length > 0;

/** 掛上關聯後的事後檢查：從 childId 往下走，是否又走回自己 */
const reachesItself = async (db: Db, childId: string) =>
	(
		await db.all(sql`
		with recursive d(id) as (
			select child_id from task_parent where parent_id = ${childId}
			union select tp.child_id from task_parent tp join d on tp.parent_id = d.id
		)
		select 1 as x from d where id = ${childId} limit 1`)
	).length > 0;

/** 取得任務並檢查可見性；個人根與不可見的任務一律視為不存在，不洩漏存在與否 */
const loadVisible = async (db: Db, userId: string, id: string) => {
	const t = await db.select().from(task).where(eq(task.id, id)).get();
	if (!t || t.rootOwnerId !== null || !canView(await ancestorChain(db, id), { userId }))
		throw new TaskNotFoundError('找不到任務');
	return t;
};

export const getTask = (db: Db, userId: string, id: string) => loadVisible(db, userId, id);

export const createTask = async (
	db: Db,
	userId: string,
	input: { title: unknown; dueDate: unknown; parentId?: string }
) => {
	const title = validateTitle(input.title);
	const dueDate = typeof input.dueDate === 'string' ? input.dueDate : null;
	validateDates(null, dueDate);
	const id = crypto.randomUUID();
	if (input.parentId === undefined) {
		// D49：頂層任務沒有 task_parent 列
		await db.insert(task).values({ id, title, dueDate, createdBy: userId });
		return id;
	}
	await loadVisible(db, userId, input.parentId);
	// batch 在 D1 為單一交易：任務與其 parent 關聯同生同滅
	await db.batch([
		db.insert(task).values({ id, title, dueDate, createdBy: userId }),
		db.insert(taskParent).values({ parentId: input.parentId, childId: id })
	]);
	return id;
};

// ---- 清單（D42/D49/D52）----

// 子查詢要寫死 task.id：單表查詢時 drizzle 會把 ${task.id} 輸出成沒有表名的 "id"，被內層的 id 蓋掉
const counts = {
	childCount: sql<number>`(select count(*) from task_parent tp where tp.parent_id = task.id)`,
	doneChildCount: sql<number>`(select count(*) from task_parent tp join task c on c.id = tp.child_id where tp.parent_id = task.id and c.status = 'done')`,
	// 含看不到的 parent（D51 只洩漏數量）
	parentCount: sql<number>`(select count(*) from task_parent tp where tp.child_id = task.id)`
};
const listColumns = { ...getTableColumns(task), ...counts };

/** D49：頂層（沒有 parent）且歸屬者是我，或指派給我的任務 */
export const listMyTasks = async (db: Db, userId: string, filters: TaskFilters, today: string) => {
	const rows = await db
		.select(listColumns)
		.from(task)
		.where(
			and(
				isNull(task.rootOwnerId),
				or(
					eq(task.assigneeId, userId),
					sql`(not exists (select 1 from task_parent tp where tp.child_id = task.id) and coalesce(${task.assigneeId}, ${task.createdBy}) = ${userId})`
				)
			)
		)
		.orderBy(asc(task.dueDate), asc(task.createdAt))
		.all();
	// shortcut: 在記憶體篩選（約 15 人的規模），資料量變大時把條件下推到 SQL
	return applyFilters(
		rows.map((r) => ({
			...r,
			source: (r.assigneeId === userId && r.createdBy !== userId ? 'assigned' : 'own') as TaskSource
		})),
		filters,
		today
	);
};

/** D49：我建立、指派給別人的任務（不論有沒有 parent）；來源篩選在此無意義，固定 'own' */
export const listAssignedByMe = async (
	db: Db,
	userId: string,
	filters: TaskFilters,
	today: string
) => {
	const rows = await db
		.select({ ...listColumns, assigneeName: user.name })
		.from(task)
		.innerJoin(user, eq(user.id, task.assigneeId))
		.where(
			and(
				isNull(task.rootOwnerId),
				eq(task.createdBy, userId),
				sql`${task.assigneeId} != ${userId}`
			)
		)
		.orderBy(asc(task.dueDate), asc(task.createdAt))
		.all();
	return applyFilters(
		rows.map((r) => ({ ...r, source: 'own' as TaskSource })),
		{ ...filters, source: 'all' },
		today
	);
};

/** D52：一層子任務；子孫繼承 parent 的可見性（D14），所以只需檢查 parent */
export const listChildren = async (db: Db, userId: string, taskId: string) => {
	await loadVisible(db, userId, taskId);
	return db
		.select(listColumns)
		.from(taskParent)
		.innerJoin(task, eq(task.id, taskParent.childId))
		.where(eq(taskParent.parentId, taskId))
		.orderBy(asc(task.dueDate), asc(task.createdAt))
		.all();
};

/** D51：看得到的 parent 列出，看不到的只給數量 */
export const listParents = async (db: Db, userId: string, taskId: string) => {
	await loadVisible(db, userId, taskId);
	const parents = await db
		.select({ id: task.id, title: task.title })
		.from(taskParent)
		.innerJoin(task, eq(task.id, taskParent.parentId))
		.where(eq(taskParent.childId, taskId))
		.all();
	const visible: typeof parents = [];
	for (const p of parents) if (canView(await ancestorChain(db, p.id), { userId })) visible.push(p);
	return { visible, hiddenCount: parents.length - visible.length };
};

// ---- 關聯（D3/D15/D47/D50）----

const viewerIds = async (db: Db, id: string) => {
	const ids = new Set<string>();
	for (const t of await ancestorChain(db, id)) {
		ids.add(t.createdBy);
		if (t.assigneeId) ids.add(t.assigneeId);
	}
	return ids;
};

/** D15：掛到 parent 底下後，新增得以看到 child 的人（parent 的可見者減去 child 現有的可見者） */
export const shareScope = async (db: Db, parentId: string, childId: string) => {
	const [atParent, atChild] = await Promise.all([viewerIds(db, parentId), viewerIds(db, childId)]);
	const ids = [...atParent].filter((u) => !atChild.has(u));
	if (!ids.length) return [];
	// 可見者最多是少數幾人（團隊約 15 人），遠低於 D1 的綁定參數上限
	return db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, ids))
		.orderBy(user.name)
		.all();
};

/** 寫入關聯後再檢查一次循環（D1 沒有互動式交易，併發時可能同時各插一條）；有循環就撤回 */
export const insertLink = async (db: Db, parentId: string, childId: string) => {
	try {
		await db.insert(taskParent).values({ parentId, childId });
	} catch (e) {
		// 重複送出：複合主鍵衝突。drizzle 把底層錯誤包在 cause 裡
		const msg = `${(e as Error).message} ${((e as Error).cause as Error | undefined)?.message ?? ''}`;
		if (/UNIQUE constraint|PRIMARY KEY/i.test(msg)) throw new TaskError('已經是子任務');
		throw e;
	}
	if (await reachesItself(db, childId)) {
		await db
			.delete(taskParent)
			.where(and(eq(taskParent.parentId, parentId), eq(taskParent.childId, childId)));
		throw new TaskError('不能建立循環的關聯');
	}
};

/** D50：看得到 parent，且是 child 的建立者或指派人 */
export const attachChild = async (db: Db, userId: string, parentId: string, childId: string) => {
	if (parentId === childId) throw new TaskError('不能把任務掛在自己底下');
	await loadVisible(db, userId, parentId);
	const child = await loadVisible(db, userId, childId);
	if (!canEdit(child, { userId })) throw new TaskForbiddenError('沒有權限');
	const existing = await db
		.select()
		.from(taskParent)
		.where(and(eq(taskParent.parentId, parentId), eq(taskParent.childId, childId)))
		.get();
	if (existing) throw new TaskError('已經是子任務');
	if (await isSelfOrDescendant(db, childId, parentId)) throw new TaskError('不能建立循環的關聯');
	await insertLink(db, parentId, childId);
};

/** D50：移除關聯同樣需要對 child 的操作權；只移除關聯，不動任務，也不碰個人根（D49） */
export const detachChild = async (db: Db, userId: string, parentId: string, childId: string) => {
	const child = await loadVisible(db, userId, childId);
	if (!canEdit(child, { userId })) throw new TaskForbiddenError('沒有權限');
	const link = await db
		.select()
		.from(taskParent)
		.where(and(eq(taskParent.parentId, parentId), eq(taskParent.childId, childId)))
		.get();
	if (!link) throw new TaskError('找不到這個關聯');
	await db
		.delete(taskParent)
		.where(and(eq(taskParent.parentId, parentId), eq(taskParent.childId, childId)));
};

const escapeLike = (q: string) => q.replace(/[\\%_]/g, '\\$&');

/** 「掛上既有任務」的候選：我能操作、標題符合，排除自己、祖先（會成環）與已是子任務者，最多 20 筆 */
export const searchAttachable = async (db: Db, userId: string, parentId: string, q: string) => {
	await loadVisible(db, userId, parentId);
	return db
		.select({ id: task.id, title: task.title, dueDate: task.dueDate })
		.from(task)
		.where(
			and(
				isNull(task.rootOwnerId),
				or(eq(task.createdBy, userId), eq(task.assigneeId, userId)),
				sql`${task.title} like ${'%' + escapeLike(q.trim()) + '%'} escape '\\'`,
				sql`task.id not in (
					with recursive anc(id) as (
						select ${parentId} union select tp.parent_id from task_parent tp join anc on tp.child_id = anc.id
					) select id from anc)`,
				sql`not exists (select 1 from task_parent tp where tp.parent_id = ${parentId} and tp.child_id = task.id)`
			)
		)
		.orderBy(asc(task.title))
		.limit(20)
		.all();
};

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
		if (patch.description.length > DESC_MAX) throw new TaskError(`描述最多 ${DESC_MAX} 字`);
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

// ---- 刪除（D46/D53–D55）----

const descendantEdges = (db: Db, id: string) =>
	db.all<DescendantEdge>(sql`
		with recursive d(id) as (
			select child_id from task_parent where parent_id = ${id}
			union select tp.child_id from task_parent tp join d on tp.parent_id = d.id
			limit ${TREE_DELETE_CAP + 1}
		)
		select tp.child_id as childId, tp.parent_id as parentId, t.created_by as createdBy
		from task_parent tp join task t on t.id = tp.child_id
		where tp.child_id in (select id from d)`);

/** 刪除預覽：直接子任務數，以及兩種模式各自的影響數量 */
export const planDelete = async (db: Db, userId: string, id: string) => {
	const t = await loadVisible(db, userId, id);
	if (!canDelete(t, { userId })) throw new TaskForbiddenError('只有建立者能刪除');
	const direct = await db.all<{ n: number; sole: number }>(sql`
		select count(*) as n,
			coalesce(sum((select count(*) from task_parent x where x.child_id = tp.child_id) = 1), 0) as sole
		from task_parent tp where tp.parent_id = ${id}`);
	const childCount = Number(direct[0]?.n ?? 0);
	if (!childCount) return { childCount: 0 as const };
	const edges = await descendantEdges(db, id);
	const tooLarge = new Set(edges.map((e) => e.childId)).size > TREE_DELETE_CAP;
	const tree = tooLarge ? null : computeTreeDelete(id, userId, edges);
	return {
		childCount,
		// 只刪這個：只有這個任務是唯一 parent 的子任務會變成頂層
		single: { becomingTopLevel: Number(direct[0].sole) },
		tree: tree && {
			willDelete: tree.deleteIds.length,
			keptShared: tree.keptShared,
			keptNotMine: tree.keptNotMine,
			becomingTopLevel: tree.becomingTopLevel
		}
	};
};

/** 使用者確認的內容：刪除方式 + 當時預覽的數字。實際執行前重算，不同就拒絕（TOCTOU） */
export const planKey = (plan: Awaited<ReturnType<typeof planDelete>>, mode: 'single' | 'tree') => {
	if (!('single' in plan) || !plan.single) return 'none';
	if (mode === 'single') return `single:${plan.childCount}:${plan.single.becomingTopLevel}`;
	const t = plan.tree;
	return t
		? `tree:${t.willDelete}:${t.keptShared}:${t.keptNotMine}:${t.becomingTopLevel}`
		: 'tree:-';
};

/**
 * D46/D53：真刪除，只有建立者。mode 'single' 只刪這個（子任務的關聯隨 cascade 移除，沒有 parent 者依 D49 成為頂層）；
 * 'tree' 另刪「我建立且所有 parent 都在刪除範圍內」的子孫。D1 的 batch 是單一交易。
 */
export const deleteTask = async (
	db: Db,
	userId: string,
	id: string,
	mode: 'single' | 'tree' = 'single',
	// 使用者確認時的 planKey；有給就必須與現在的計畫一致，沒給（內部呼叫、測試）則不檢查
	expect?: string
) => {
	const t = await loadVisible(db, userId, id);
	if (!canDelete(t, { userId })) throw new TaskForbiddenError('只有建立者能刪除');
	if (expect !== undefined) {
		const plan = await planDelete(db, userId, id);
		if (planKey(plan, mode) !== expect)
			throw new TaskConflictError('任務的子任務已有變動，請重新確認要刪除的範圍', plan);
	}
	let ids = [id];
	if (mode === 'tree') {
		const edges = await descendantEdges(db, id);
		if (new Set(edges.map((e) => e.childId)).size > TREE_DELETE_CAP)
			throw new TaskError(`子任務超過 ${TREE_DELETE_CAP} 個，無法整棵刪除`);
		ids = computeTreeDelete(id, userId, edges).deleteIds;
	}
	// D1 單次查詢最多 100 個綁定參數，分批
	const batches = [];
	for (let i = 0; i < ids.length; i += 90)
		batches.push(db.delete(task).where(inArray(task.id, ids.slice(i, i + 90))));
	await db.batch(batches as [(typeof batches)[number], ...typeof batches]);
};
