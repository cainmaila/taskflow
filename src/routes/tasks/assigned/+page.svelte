<script lang="ts">
	import { resolve } from '$app/paths';
	import FilterBar from '../FilterBar.svelte';
	import PageHeader from '../PageHeader.svelte';
	import TaskList from '../TaskList.svelte';
	import TaskPanel from '../TaskPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>我指派給別人的 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
	<PageHeader title="我指派的" />

	<div class="mb-6">
		<FilterBar
			filters={data.filters}
			projects={data.projects}
			showSource={false}
			clearHref={resolve('/tasks/assigned')}
		/>
	</div>

	<TaskList
		active={data.active}
		done={data.done}
		today={data.today}
		meId={data.user?.id}
		doneOpen={data.filters.statuses.includes('done')}
		empty="沒有符合條件的任務。"
	/>
</main>

<TaskPanel />
