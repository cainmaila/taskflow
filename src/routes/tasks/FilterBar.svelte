<script lang="ts">
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

<form method="get" onchange={apply} class="flex flex-wrap items-center gap-x-2 gap-y-2">
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
					class="inline-flex h-9 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/15 peer-checked:text-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:bg-muted"
					>{label}</span
				>
			</label>
		{/each}
	</fieldset>
	<div class="flex flex-wrap items-center gap-2">
		{#if showSource}
			<NativeSelect.Root name="source" value={filters.source} size="sm" aria-label="來源">
				<NativeSelect.Option value="all">來源：全部</NativeSelect.Option>
				<NativeSelect.Option value="own">自己建</NativeSelect.Option>
				<NativeSelect.Option value="assigned">被指派</NativeSelect.Option>
			</NativeSelect.Root>
		{/if}
		<NativeSelect.Root name="due" value={filters.due} size="sm" aria-label="到期">
			<NativeSelect.Option value="all">到期：全部</NativeSelect.Option>
			<NativeSelect.Option value="overdue">已逾期</NativeSelect.Option>
			<NativeSelect.Option value="week">本週</NativeSelect.Option>
		</NativeSelect.Root>
		{#if projects.length}
			<NativeSelect.Root name="project" value={filters.projectId ?? ''} size="sm" aria-label="專案">
				<NativeSelect.Option value="">專案：全部</NativeSelect.Option>
				{#each projects as pr (pr.id)}
					<NativeSelect.Option value={pr.id}>{pr.name}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		{/if}
		<noscript><Button type="submit" variant="secondary" size="sm">篩選</Button></noscript>
		{#if active}
			<Button
				href={board ? `${clearHref}?view=board` : clearHref}
				variant="ghost"
				size="sm"
				class="text-muted-foreground">清除</Button
			>
		{/if}
	</div>
</form>
