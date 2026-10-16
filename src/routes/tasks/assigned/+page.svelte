<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Board from '../Board.svelte';
	import FilterBar from '../FilterBar.svelte';
	import PageHeader from '../PageHeader.svelte';
	import TaskList from '../TaskList.svelte';
	import TaskPanel from '../TaskPanel.svelte';
	import ViewToggle from '../ViewToggle.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const board = $derived(page.url.searchParams.get('view') === 'board');
</script>

<svelte:head><title>我指派給別人的 - Taskflow</title></svelte:head>

<main class="mx-auto px-4 py-6 md:px-8 md:py-10 {board ? 'max-w-7xl' : 'max-w-4xl'}">
	<PageHeader title="我指派的"><ViewToggle /></PageHeader>

	<div class="mb-6">
		<FilterBar
			filters={data.filters}
			projects={data.projects}
			showSource={false}
			{board}
			clearHref={resolve('/tasks/assigned')}
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
			empty="沒有符合條件的任務。"
		/>
	{/if}
</main>

<TaskPanel />
