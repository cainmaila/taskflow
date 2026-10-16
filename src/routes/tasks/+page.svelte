<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Board from './Board.svelte';
	import FilterBar from './FilterBar.svelte';
	import QuickAdd from './QuickAdd.svelte';
	import PageHeader from './PageHeader.svelte';
	import TaskList from './TaskList.svelte';
	import TaskPanel from './TaskPanel.svelte';
	import ViewToggle from './ViewToggle.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const board = $derived(page.url.searchParams.get('view') === 'board');
</script>

<svelte:head><title>我的任務 - Taskflow</title></svelte:head>

<main class="mx-auto px-4 py-6 md:px-8 md:py-10 {board ? 'max-w-7xl' : 'max-w-4xl'}">
	<PageHeader title="我的任務"><ViewToggle /></PageHeader>

	<QuickAdd
		action="?/create"
		today={data.today}
		title={form?.title ?? ''}
		dueDate={form?.dueDate}
		message={form?.message}
		successToast="已新增任務"
	/>

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
