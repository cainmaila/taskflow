import { deserialize } from '$app/forms';

/** 對 /tasks/[id]?/save 只送被改的欄位（updateTask 支援部分欄位）。回傳 null 表示成功，否則為錯誤訊息 */
export const patchTask = async (id: string, fields: Record<string, string>) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	try {
		const res = await fetch(`/tasks/${encodeURIComponent(id)}?/save`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		const out = deserialize(await res.text());
		if (out.type === 'success') return null;
		if (out.type === 'failure') return (out.data as { message?: string })?.message ?? '儲存失敗';
	} catch {
		// 網路錯誤走下方預設訊息
	}
	return '儲存失敗，請稍後再試';
};
