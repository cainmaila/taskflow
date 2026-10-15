<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { goto, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import XIcon from '@lucide/svelte/icons/x';
	import TaskDetail from './[id]/TaskDetail.svelte';
	import { openTask } from './panel';

	// 面板內容來自 shallow routing 的 page.state.selected；關閉動畫期間保留最後一份資料
	let shown = $state(page.state.selected);
	let closing = $state(false);
	let wasOpen = !!page.state.selected;
	$effect(() => {
		const s = page.state.selected;
		if (s) shown = s;
		if (s && !wasOpen) closing = false; // 只在「重新開啟」時重置；面板內換任務／重抓不影響
		wasOpen = !!s;
	});
	const open = $derived(!!page.state.selected && !closing);

	// 儲存後重抓這個任務，讓面板內容與清單一致
	const refresh = async () => {
		const sel = page.state.selected;
		if (!sel) return;
		const href = resolve('/tasks/[id]', { id: sel.task.id });
		const r = await preloadData(href);
		if (r.type === 'loaded' && r.status === 200 && page.state.selected) {
			await goto(href, {
				shallow: true,
				replace: true,
				state: { selected: r.data as App.PageState['selected'] }
			});
		}
	};
</script>

<Dialog.Root
	{open}
	onOpenChange={(o) => {
		// 守門：只有面板真的開著才處理（開啟手勢中 bits-ui 可能誤發 false）
		if (o || !page.state.selected) return;
		// 先 blur 讓標題／描述的 onblur 存檔，元素被移除時才不會遺失輸入
		(document.activeElement as HTMLElement | null)?.blur();
		closing = true; // 先播關閉動畫，結束後再回上一頁
	}}
	onOpenChangeComplete={(o) => {
		if (o) return;
		// 已經被瀏覽器上一頁關掉時 selected 為空，不再重複 back
		if (page.state.selected) history.back();
		shown = undefined;
		closing = false;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			class="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-pop duration-300 ease-[var(--ease-out)] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right sm:max-w-[34rem]"
		>
			<div class="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
				<Dialog.Title class="truncate pr-4 text-sm font-medium text-muted-foreground"
					>任務詳情</Dialog.Title
				>
				<Dialog.Description class="sr-only">檢視與編輯任務，按 Esc 關閉</Dialog.Description>
				<Dialog.Close
					class="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label="關閉面板"><XIcon class="size-5" /></Dialog.Close
				>
			</div>
			<div class="flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-6">
				{#if shown}
					{#key shown.task.id}
						<TaskDetail data={shown} panel onopen={openTask} onrefresh={refresh} />
					{/key}
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
