<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';
	import { toast } from '#lib/toast.svelte.js';

	// 快速新增列：/tasks 與專案「任務」分頁共用。手機預設收合成一顆按鈕，點開才展開
	let {
		action,
		today,
		title = '',
		dueDate,
		message,
		successToast
	}: {
		action: string;
		today: string;
		title?: string;
		dueDate?: string;
		message?: string;
		// 給了才由這裡 toast（呼叫端若已自行 toast 就不要給）
		successToast?: string;
	} = $props();

	// 有錯誤或回填的標題時一律展開（無 JS 的 POST 失敗後才看得到錯誤）
	let open = $state(false);
	$effect(() => {
		if (message || title) open = true;
	});
	let titleEl = $state<HTMLInputElement>();
	export const focus = async () => {
		open = true;
		await tick();
		titleEl?.focus();
	};
</script>

<!-- 無 JS 時展開鈕無法運作：後備是直接顯示表單（見 <noscript> 樣式） -->
<noscript
	><style>
		.quick-add-form {
			display: flex !important;
		}
		.quick-add-toggle {
			display: none !important;
		}
	</style></noscript
>
<button
	type="button"
	class="quick-add-toggle mb-4 flex h-12 w-full items-center gap-2 rounded-xl border border-border bg-card px-4 text-left text-[0.95rem] text-muted-foreground transition-colors hover:bg-muted md:hidden {open
		? 'hidden'
		: ''}"
	onclick={focus}
>
	<PlusIcon class="size-[18px] text-primary" aria-hidden="true" />新增任務
</button>

<form
	method="post"
	{action}
	use:enhance={() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				if (successToast) toast(successToast);
				titleEl?.focus();
			}
		}}
	class="quick-add-form mb-4 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-2 py-1.5 transition-colors focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20 md:flex {open
		? 'flex'
		: 'hidden'}"
>
	<PlusIcon class="ml-2 size-[18px] shrink-0 text-primary" aria-hidden="true" />
	<label class="sr-only" for="new-title">新增任務</label>
	<input
		id="new-title"
		bind:this={titleEl}
		name="title"
		required
		maxlength={200}
		autocomplete="off"
		placeholder="新增任務，按 Enter 送出"
		value={title}
		class="h-11 min-w-40 flex-1 border-0 bg-transparent px-1 text-[0.95rem] outline-none placeholder:text-muted-foreground focus:ring-0 md:h-10"
	/>
	<label class="sr-only" for="new-due">到期日</label>
	<input
		id="new-due"
		name="dueDate"
		type="date"
		required
		value={dueDate ?? today}
		class="h-11 rounded-lg border-0 bg-transparent px-2 text-sm text-muted-foreground tabular-nums outline-none hover:bg-muted focus:bg-muted focus:ring-0 md:h-10"
	/>
	<Button type="submit" size="sm" class="h-11 px-4 md:h-8">新增</Button>
	{#if message}
		<p class="basis-full px-2 pb-1 text-sm text-destructive" role="alert">{message}</p>
	{/if}
</form>
