<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import FilterIcon from '@lucide/svelte/icons/list-filter';
	import XIcon from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { statusLabel } from './status';

	let {
		filters,
		showSource = true,
		board = false,
		projects = [],
		clearHref
	}: {
		filters: { statuses: string[]; source: string; due: string; projectId?: string };
		projects?: { id: string; name: string }[];
		showSource?: boolean;
		// 看板檢視：切換篩選時保留 ?view=board
		board?: boolean;
		clearHref: string;
	} = $props();

	const active = $derived(
		filters.statuses.length > 0 ||
			filters.source !== 'all' ||
			filters.due !== 'all' ||
			!!filters.projectId
	);

	// 手機：篩選收成單一按鈕 + bottom sheet；JS 載入前（或無 JS）仍顯示完整表單當後備
	let mounted = $state(false);
	onMount(() => (mounted = true));
	let sheet = $state(false);
	const count = $derived(
		filters.statuses.length +
			(filters.source !== 'all' ? 1 : 0) +
			(filters.due !== 'all' ? 1 : 0) +
			(filters.projectId ? 1 : 0)
	);
	const clearTo = $derived(board ? `${clearHref}?view=board` : clearHref);

	// 任何欄位改變就更新網址；沒有 JS 時仍可用下方的「篩選」按鈕送出 GET 表單
	const apply = (e: Event) => {
		const form = (e.currentTarget as HTMLElement).closest('form')!;
		const qs = new SvelteURLSearchParams();
		for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v) qs.append(k, v);
		const q = qs.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- clearHref 已經是 resolve 過的路徑
		goto(q ? `${clearHref}?${q}` : clearHref, { reset: false });
	};
</script>

{#snippet fields(inSheet: boolean)}
	{#if board}<input type="hidden" name="view" value="board" />{/if}
	<fieldset class="flex flex-wrap items-center gap-1.5">
		<legend class="sr-only">狀態</legend>
		{#each Object.entries(statusLabel) as [value, label] (value)}
			<label class="relative cursor-pointer">
				<input
					type="checkbox"
					name="status"
					{value}
					checked={filters.statuses.includes(value)}
					class="peer sr-only"
				/>
				<span
					class="inline-flex h-11 items-center rounded-full border border-control px-4 text-sm font-medium text-muted-foreground transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/15 peer-checked:text-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring hover:bg-muted md:h-9 md:border-border md:px-3 md:text-xs"
					>{label}</span
				>
			</label>
		{/each}
	</fieldset>
	<div class="flex flex-wrap items-center gap-2 {inSheet ? 'flex-col items-stretch' : ''}">
		{#if showSource}
			<NativeSelect.Root
				name="source"
				value={filters.source}
				size="sm"
				aria-label="來源"
				class={inSheet ? 'w-full' : 'w-36'}
			>
				<NativeSelect.Option value="all">來源：全部</NativeSelect.Option>
				<NativeSelect.Option value="own">自己建</NativeSelect.Option>
				<NativeSelect.Option value="assigned">被指派</NativeSelect.Option>
			</NativeSelect.Root>
		{/if}
		<NativeSelect.Root
			name="due"
			value={filters.due}
			size="sm"
			aria-label="到期"
			class={inSheet ? 'w-full' : 'w-36'}
		>
			<NativeSelect.Option value="all">到期：全部</NativeSelect.Option>
			<NativeSelect.Option value="overdue">已逾期</NativeSelect.Option>
			<NativeSelect.Option value="week">本週</NativeSelect.Option>
		</NativeSelect.Root>
		{#if projects.length}
			<NativeSelect.Root
				name="project"
				value={filters.projectId ?? ''}
				size="sm"
				aria-label="專案"
				class={inSheet ? 'w-full' : 'w-44'}
			>
				<NativeSelect.Option value="">專案：全部</NativeSelect.Option>
				{#each projects as pr (pr.id)}
					<NativeSelect.Option value={pr.id}>{pr.name}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		{/if}
		{#if !inSheet}
			<noscript><Button type="submit" variant="secondary" size="sm">篩選</Button></noscript>
			{#if active}
				<Button href={clearTo} variant="ghost" size="sm" class="text-muted-foreground">清除</Button>
			{/if}
		{/if}
	</div>
{/snippet}

<!-- 桌面：單列 toolbar（chips + 下拉同一列）；手機掛載後改由 sheet 取代 -->
<form
	method="get"
	onchange={apply}
	class="flex flex-wrap items-center gap-x-2 gap-y-2 md:flex-nowrap {mounted
		? 'max-md:hidden'
		: ''}"
>
	{@render fields(false)}
</form>

{#if mounted}
	<div class="md:hidden">
		<button
			type="button"
			onclick={() => (sheet = true)}
			class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-control bg-card text-sm font-medium transition-colors hover:bg-muted"
		>
			<FilterIcon class="size-4" aria-hidden="true" />篩選
			{#if count}<span
					class="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
					>{count}<span class="sr-only"> 項已套用</span></span
				>{/if}
		</button>
	</div>
	<Dialog.Root bind:open={sheet}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="fixed inset-0 z-50 bg-black/60 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
			/>
			<Dialog.Content
				class="strong-fields fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-popover p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop duration-300 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom md:hidden"
			>
				<div class="mb-4 flex items-center justify-between">
					<Dialog.Title class="text-lg font-semibold">篩選</Dialog.Title>
					<Dialog.Close
						class="-mr-2 grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
						aria-label="關閉"><XIcon class="size-5" /></Dialog.Close
					>
				</div>
				<Dialog.Description class="sr-only">選擇條件後會立即套用</Dialog.Description>
				<form method="get" onchange={apply} class="space-y-5">
					{@render fields(true)}
				</form>
				<div class="mt-6 flex gap-2">
					{#if active}
						<Button
							href={clearTo}
							variant="outline"
							size="lg"
							class="h-11 flex-1"
							onclick={() => (sheet = false)}>清除</Button
						>
					{/if}
					<Button size="lg" class="h-11 flex-1" onclick={() => (sheet = false)}>完成</Button>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
