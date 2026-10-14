// 任務的純函式規則（不碰資料庫，方便單元測試）
import { TASK_STATUSES, type TaskStatus } from './db/schema';

export const TITLE_MAX = 200;
export const DESC_MAX = 20000;

export class TaskError extends Error {}
export class TaskForbiddenError extends TaskError {}
export class TaskNotFoundError extends TaskError {}
/** 預覽與實際不一致；plan 為最新的預覽，呼叫端應請使用者重新確認 */
export class TaskConflictError extends TaskError {
	constructor(
		message: string,
		readonly plan: unknown
	) {
		super(message);
	}
}

// ---- 日期（皆為 YYYY-MM-DD 字串，比較時直接用字串序）----

/** 必須是真實存在的日曆日（2026-02-30 無效） */
export const isValidDate = (value: unknown): value is string => {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// shortcut: 時區寫死台北（團隊在台灣），要支援多時區時改為每人設定
export const todayISO = (now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);

const addDays = (iso: string, days: number) => {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** 含 today 的週一到週日 */
export const weekRange = (today: string) => {
	const [y, m, d] = today.split('-').map(Number);
	const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
	const start = addDays(today, -sinceMonday);
	return { start, end: addDays(start, 6) };
};

export const isOverdue = (t: { dueDate: string | null; status: string }, today: string) =>
	t.status !== 'done' && t.dueDate !== null && t.dueDate < today;

// ---- 欄位驗證 ----

export const validateTitle = (value: unknown) => {
	const title = typeof value === 'string' ? value.trim() : '';
	if (!title) throw new TaskError('請輸入標題');
	if (title.length > TITLE_MAX) throw new TaskError(`標題最多 ${TITLE_MAX} 字`);
	return title;
};

export const validateDates = (startDate: string | null, dueDate: string | null) => {
	if (!isValidDate(dueDate)) throw new TaskError('請輸入有效的到期日');
	if (startDate !== null && !isValidDate(startDate)) throw new TaskError('開始日不是有效的日期');
	if (startDate !== null && startDate > dueDate) throw new TaskError('開始日不能晚於到期日');
};

export const isStatus = (value: unknown): value is TaskStatus =>
	(TASK_STATUSES as readonly unknown[]).includes(value);

// ---- 權限 ----

type Actor = { userId: string };
type Owned = { createdBy: string; assigneeId: string | null };

/**
 * D12/D14/D11：任務本身或任一祖先的建立者／指派人，或「被掛在我所屬專案」者可見。
 * `chain` = 該任務加上它所有祖先（由 DB 的遞迴查詢取得）；`viaProject` 表示該節點掛在
 * 查詢者為成員的專案（封存不影響，D64）。
 */
export const canView = (chain: (Owned & { viaProject?: boolean })[], { userId }: Actor) =>
	chain.some((t) => t.createdBy === userId || t.assigneeId === userId || !!t.viaProject);

/** D45：只有建立者與指派人可編輯內容欄位；專案成員只能看，不因成員身分取得編輯權 */
export const canEdit = (t: Owned, { userId }: Actor) =>
	t.createdBy === userId || t.assigneeId === userId;

/** D45：只有建立者能改指派人、刪除 */
export const canAssign = (t: Owned, { userId }: Actor) => t.createdBy === userId;
export const canDelete = canAssign;

// ---- 「我的任務」篩選（D42/D43）----

export type TaskSource = 'own' | 'assigned';

export type TaskFilters = {
	statuses: TaskStatus[];
	source: 'all' | TaskSource;
	due: 'all' | 'overdue' | 'week';
	/** D43：所屬專案；在 SQL 層套用（只對我是成員的專案有效），applyFilters 不處理 */
	projectId?: string;
};

/** 由網址參數解析；未知或不合法的值一律忽略，不丟錯 */
export const parseFilters = (params: URLSearchParams): TaskFilters => {
	const source = params.get('source');
	const due = params.get('due');
	return {
		statuses: [...new Set(params.getAll('status').filter(isStatus))],
		source: source === 'own' || source === 'assigned' ? source : 'all',
		due: due === 'overdue' || due === 'week' ? due : 'all',
		projectId: params.get('project')?.slice(0, 64) || undefined
	};
};

type Row = { dueDate: string | null; status: string; source: TaskSource };

/** 篩選並分成「未完成」與「已完成」；statuses 為空代表不限狀態 */
export const applyFilters = <T extends Row>(rows: T[], f: TaskFilters, today: string) => {
	const { start, end } = weekRange(today);
	const kept = rows.filter((r) => {
		if (f.statuses.length && !f.statuses.includes(r.status as TaskStatus)) return false;
		if (f.source !== 'all' && r.source !== f.source) return false;
		if (f.due === 'overdue') return isOverdue(r, today);
		if (f.due === 'week') return r.dueDate !== null && r.dueDate >= start && r.dueDate <= end;
		return true;
	});
	return {
		active: kept.filter((r) => r.status !== 'done'),
		done: kept.filter((r) => r.status === 'done')
	};
};

// ---- 刪除計畫（D53–D55）----

export const TREE_DELETE_CAP = 1000;

export type DescendantEdge = { childId: string; parentId: string; createdBy: string };

/**
 * 整棵子樹刪除的範圍：被刪任務 + 「我建立」且「所有 parent 都在刪除範圍內」的子孫（D54/D55）。
 * 以不動點迭代處理多 parent（菱形）；不遞迴。edges 為被刪任務所有子孫的所有 parent 邊。
 */
export const computeTreeDelete = (rootId: string, userId: string, edges: DescendantEdge[]) => {
	const parents = new Map<string, string[]>();
	const creator = new Map<string, string>();
	for (const e of edges) {
		parents.set(e.childId, [...(parents.get(e.childId) ?? []), e.parentId]);
		creator.set(e.childId, e.createdBy);
	}
	const deleted = new Set([rootId]);
	for (let changed = true; changed;) {
		changed = false;
		for (const [id, ps] of parents)
			if (!deleted.has(id) && creator.get(id) === userId && ps.every((p) => deleted.has(p))) {
				deleted.add(id);
				changed = true;
			}
	}
	let keptNotMine = 0;
	let keptShared = 0;
	let becomingTopLevel = 0;
	for (const [id, ps] of parents) {
		if (deleted.has(id)) continue;
		if (creator.get(id) !== userId) keptNotMine++;
		else keptShared++;
		if (ps.every((p) => deleted.has(p))) becomingTopLevel++;
	}
	return { deleteIds: [...deleted], keptNotMine, keptShared, becomingTopLevel };
};
