// 最小 toast store：成功訊息用 toast，錯誤仍就近以 inline alert 顯示
export type ToastAction = { label: string; run: () => void | Promise<void> };
export type Toast = {
	id: number;
	message: string;
	kind: 'success' | 'error';
	action?: ToastAction;
};

export const toasts = $state<Toast[]>([]);
let seq = 0;

export const toast = (
	message: string,
	kind: Toast['kind'] = 'success',
	ms = 3200,
	action?: ToastAction
) => {
	const id = ++seq;
	toasts.push({ id, message, kind, action });
	setTimeout(() => dismiss(id), kind === 'error' ? ms + 2000 : ms);
};

export const dismiss = (id: number) => {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
};
