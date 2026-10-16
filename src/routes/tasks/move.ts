import { deserialize } from '$app/forms';
import type { Status } from './status';

/** 對 /tasks/[id]?/move：排到 afterId 之後、beforeId 之前（欄內相鄰卡片），可同時改狀態。回傳 null 表示成功，否則為 server 的錯誤訊息 */
export const moveRequest = async (
	id: string,
	to: { status?: Status; afterId?: string; beforeId?: string }
) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(to)) if (v) body.set(k, v);
	try {
		const res = await fetch(`/tasks/${encodeURIComponent(id)}?/move`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		const out = deserialize(await res.text());
		if (out.type === 'success') return null;
		if (out.type === 'failure') return (out.data as { message?: string })?.message ?? '移動失敗';
	} catch {
		// 網路錯誤走下方預設訊息
	}
	return '移動失敗，請稍後再試';
};
