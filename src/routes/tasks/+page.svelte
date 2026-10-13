<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { statusLabel } from './status';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>我的任務 - Taskflow</title></svelte:head>

{#snippet taskRow(t: (typeof data.active)[number])}
	<a
		href={resolve('/tasks/[id]', { id: t.id })}
		class="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/50"
	>
		<span class="min-w-48 flex-1 font-medium">{t.title}</span>
		<Badge variant="outline">{t.source === 'own' ? '自己建' : '被指派'}</Badge>
		<Badge variant="secondary">{statusLabel[t.status]}</Badge>
		<span
			class="text-sm {t.status !== 'done' && t.dueDate && t.dueDate < data.today
				? 'font-medium text-destructive'
				: 'text-muted-foreground'}"
		>
			{t.dueDate}{t.status !== 'done' && t.dueDate && t.dueDate < data.today ? '（逾期）' : ''}
		</span>
	</a>
{/snippet}

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

	<form method="get" class="flex flex-wrap items-end gap-4">
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">狀態</legend>
			<div class="flex flex-wrap gap-3">
				{#each Object.entries(statusLabel) as [value, label] (value)}
					<Label class="flex items-center gap-1.5 font-normal">
						<Checkbox
							name="status"
							{value}
							checked={data.filters.statuses.includes(value as keyof typeof statusLabel)}
						/>{label}
					</Label>
				{/each}
			</div>
		</fieldset>
		<div class="space-y-2">
			<Label for="f-source">來源</Label>
			<NativeSelect.Root id="f-source" name="source" value={data.filters.source}>
				<NativeSelect.Option value="all">全部</NativeSelect.Option>
				<NativeSelect.Option value="own">自己建</NativeSelect.Option>
				<NativeSelect.Option value="assigned">被指派</NativeSelect.Option>
			</NativeSelect.Root>
		</div>
		<div class="space-y-2">
			<Label for="f-due">到期</Label>
			<NativeSelect.Root id="f-due" name="due" value={data.filters.due}>
				<NativeSelect.Option value="all">全部</NativeSelect.Option>
				<NativeSelect.Option value="overdue">已逾期</NativeSelect.Option>
				<NativeSelect.Option value="week">本週</NativeSelect.Option>
			</NativeSelect.Root>
		</div>
		<Button type="submit" variant="secondary">篩選</Button>
		<Button href="/tasks" variant="ghost">清除</Button>
	</form>

	<Card.Root>
		<Card.Content class="divide-y">
			{#each data.active as t (t.id)}
				{@render taskRow(t)}
			{:else}
				<p class="py-3 text-sm text-muted-foreground">
					沒有符合條件的未完成任務。用上方的列新增一個吧。
				</p>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if data.done.length}
		<details class="rounded-lg border">
			<summary class="cursor-pointer p-3 font-medium">已完成（{data.done.length}）</summary>
			<div class="divide-y px-6">
				{#each data.done as t (t.id)}
					{@render taskRow(t)}
				{/each}
			</div>
		</details>
	{/if}
</main>
