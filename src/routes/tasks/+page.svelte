<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import FilterBar from './FilterBar.svelte';
	import TaskRow from './TaskRow.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>我的任務 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4">
	<h1 class="text-2xl font-semibold">我的任務</h1>

	{#if form?.message}
		<Alert.Root variant="destructive"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{/if}

	<Card.Root>
		<form method="post" action="?/create" use:enhance>
			<Card.Content class="flex flex-wrap items-end gap-4">
				<div class="min-w-48 flex-1 space-y-2">
					<Label for="new-title">新增任務</Label>
					<Input id="new-title" name="title" required maxlength={200} value={form?.title ?? ''} />
				</div>
				<div class="space-y-2">
					<Label for="new-due">到期日</Label>
					<Input id="new-due" name="dueDate" type="date" required value={form?.dueDate ?? ''} />
				</div>
				<Button type="submit">新增</Button>
			</Card.Content>
		</form>
	</Card.Root>

	<FilterBar filters={data.filters} projects={data.projects} clearHref={resolve('/tasks')} />

	<Card.Root>
		<Card.Content class="divide-y">
			{#each data.active as t (t.id)}
				<TaskRow {t} today={data.today} meId={data.user?.id} />
			{:else}
				<p class="py-3 text-sm text-muted-foreground">
					{data.filters.statuses.length && data.filters.statuses.every((x) => x === 'done')
						? '沒有符合條件的任務。'
						: '沒有符合條件的未完成任務。用上方的列新增一個吧。'}
				</p>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if data.done.length}
		<details open={data.filters.statuses.includes('done')} class="rounded-lg border">
			<summary class="cursor-pointer p-3 font-medium">已完成（{data.done.length}）</summary>
			<div class="divide-y px-6">
				{#each data.done as t (t.id)}
					<TaskRow {t} today={data.today} meId={data.user?.id} />
				{/each}
			</div>
		</details>
	{/if}
</main>
