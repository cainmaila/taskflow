<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import FilterBar from '../FilterBar.svelte';
	import TaskRow from '../TaskRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>我指派給別人的 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4">
	<h1 class="text-2xl font-semibold">我指派給別人的</h1>

	<FilterBar filters={data.filters} showSource={false} clearHref={resolve('/tasks/assigned')} />

	<Card.Root>
		<Card.Content class="divide-y">
			{#each data.active as t (t.id)}
				<TaskRow {t} today={data.today} />
			{:else}
				<p class="py-3 text-sm text-muted-foreground">沒有符合條件的任務。</p>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if data.done.length}
		<details open={data.filters.statuses.includes('done')} class="rounded-lg border">
			<summary class="cursor-pointer p-3 font-medium">已完成（{data.done.length}）</summary>
			<div class="divide-y px-6">
				{#each data.done as t (t.id)}
					<TaskRow {t} today={data.today} />
				{/each}
			</div>
		</details>
	{/if}
</main>
