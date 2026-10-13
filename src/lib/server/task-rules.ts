// 任務的純函式規則（不碰資料庫，方便單元測試）
import { TASK_STATUSES, type TaskStatus } from './db/schema';

export const TITLE_MAX = 200;

export class TaskError extends Error {}
export class TaskForbiddenError extends TaskError {}
export class TaskNotFoundError extends TaskError {}

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
 * D12：建立者或指派人可見。
 * 之後的步驟在此擴充：所掛專案的成員（D11）、祖先任務可見者（D14）。
 */
export const canView = (t: Owned, { userId }: Actor) =>
	t.createdBy === userId || t.assigneeId === userId;

/** D45：建立者與指派人可編輯內容欄位（專案成員的權限待第 5 步） */
export const canEdit = (t: Owned, actor: Actor) => canView(t, actor);

/** D45：只有建立者能改指派人、刪除 */
export const canAssign = (t: Owned, { userId }: Actor) => t.createdBy === userId;
export const canDelete = canAssign;

// ---- 「我的任務」篩選（D42/D43）----

export type TaskSource = 'own' | 'assigned';

export type TaskFilters = {
	statuses: TaskStatus[];
	source: 'all' | TaskSource;
	due: 'all' | 'overdue' | 'week';
	// 第 5 步：projectId
};

/** 由網址參數解析；未知或不合法的值一律忽略，不丟錯 */
export const parseFilters = (params: URLSearchParams): TaskFilters => {
	const source = params.get('source');
	const due = params.get('due');
	return {
		statuses: [...new Set(params.getAll('status').filter(isStatus))],
		source: source === 'own' || source === 'assigned' ? source : 'all',
		due: due === 'overdue' || due === 'week' ? due : 'all'
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
