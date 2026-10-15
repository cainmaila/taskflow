import { goto, preloadData } from '$app/navigation';
import { page } from '$app/state';
import { resolve } from '$app/paths';

/** 點任務：以 shallow routing 開右側面板（URL 同步為 /tasks/[id]）；修飾鍵／預載失敗則走一般導覽 */
export const openTask = async (e: MouseEvent, id: string) => {
	if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
		return;
	e.preventDefault();
	const href = resolve('/tasks/[id]', { id });
	const result = await preloadData(href);
	if (result.type === 'loaded' && result.status === 200)
		await goto(href, {
			shallow: true,
			// 面板內再開別的任務：取代目前的歷史項，上一頁／關閉才只需退一步
			replace: !!page.state.selected,
			state: { selected: result.data as App.PageState['selected'] }
		});
	else await goto(href);
};
