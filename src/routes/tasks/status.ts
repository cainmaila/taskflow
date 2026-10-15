export const statusLabel = {
	todo: '待辦',
	in_progress: '進行中',
	pending: '擱置',
	done: '完成'
} as const;

export type Status = keyof typeof statusLabel;

/** 完成前的狀態（僅本次瀏覽器工作階段），取消完成時回到它；沒有就回「待辦」 */
export const lastStatus = new Map<string, Status>();

/** 狀態點／文字色（token 見 layout.css） */
export const statusTone = {
	todo: 'text-status-todo',
	in_progress: 'text-status-progress',
	pending: 'text-status-pending',
	done: 'text-status-done'
} as const satisfies Record<Status, string>;
