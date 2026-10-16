<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';
	import { toast } from '#lib/toast.svelte.js';
	import Board from './Board.svelte';
	import FilterBar from './FilterBar.svelte';
	import PageHeader from './PageHeader.svelte';
	import TaskList from './TaskList.svelte';
	import TaskPanel from './TaskPanel.svelte';
	import ViewToggle from './ViewToggle.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const board = $derived(page.url.searchParams.get('view') === 'board');
	let titleEl = $state<HTMLInputElement>();
</script>

<svelte:head><title>我的任務 - Taskflow</title></svelte:head>

<main class="mx-auto px-4 py-6 md:px-8 md:py-10 {board ? 'max-w-7xl' : 'max-w-4xl'}">
	<PageHeader title="我的任務"><ViewToggle /></PageHeader>

	<!-- 快速新增列 -->
	<form
		method="post"
		action="?/create"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					toast('已新增任務');
					titleEl?.focus();
				}
			}}
		class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-2 py-1.5 transition-colors focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20"
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
			value={form?.title ?? ''}
			class="h-10 min-w-40 flex-1 border-0 bg-transparent px-1 text-[0.95rem] outline-none placeholder:text-muted-foreground focus:ring-0"
		/>
		<label class="sr-only" for="new-due">到期日</label>
		<input
			id="new-due"
			name="dueDate"
			type="date"
			required
			value={form?.dueDate ?? data.today}
			class="h-10 rounded-lg border-0 bg-transparent px-2 text-sm text-muted-foreground tabular-nums outline-none hover:bg-muted focus:bg-muted focus:ring-0"
		/>
		<Button type="submit" size="sm">新增</Button>
		{#if form?.message}
			<p class="basis-full px-2 pb-1 text-sm text-destructive" role="alert">{form.message}</p>
		{/if}
	</form>

	<div class="mb-6">
		<FilterBar
			filters={data.filters}
			projects={data.projects}
			clearHref={resolve('/tasks')}
			{board}
		/>
	</div>

	{#if board}
		<Board rows={[...data.active, ...data.done]} today={data.today} />
	{:else}
		<TaskList
			active={data.active}
			done={data.done}
			today={data.today}
			meId={data.user?.id}
			doneOpen={data.filters.statuses.includes('done')}
			empty={data.filters.statuses.length && data.filters.statuses.every((x) => x === 'done')
				? '沒有符合條件的任務。'
				: '沒有未完成的任務。用上方的列新增一個吧。'}
		/>
	{/if}
</main>

<TaskPanel />
