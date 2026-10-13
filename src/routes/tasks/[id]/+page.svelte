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
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { statusLabel } from '../status';
	import TaskRow from '../TaskRow.svelte';
	import AttachPicker from './AttachPicker.svelte';
	import DeleteTask from './DeleteTask.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// 以編輯中的內容預覽，故獨立於 data
	let description = $derived(data.task.description);
	let startDate = $derived(data.task.startDate ?? '');
	let preview = $state(false);
</script>

<svelte:head><title>{data.task.title} - Taskflow</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4">
	<div class="flex items-center gap-3">
		<a href={resolve('/tasks')} class="text-sm text-muted-foreground hover:text-foreground"
			>← 我的任務</a
		>
		{#if !startDate}
			<Badge variant="outline" title="只有到期日、沒有開始日的任務會以里程碑顯示">里程碑</Badge>
			<span class="text-xs text-muted-foreground">只有到期日、沒有開始日的任務會以里程碑顯示</span>
		{/if}
	</div>

	{#if form?.message}
		<Alert.Root variant="destructive"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{:else if form?.saved}
		<Alert.Root><Alert.Description>已儲存</Alert.Description></Alert.Root>
	{:else if form?.added || form?.attached || form?.detached}
		<Alert.Root><Alert.Description>已更新</Alert.Description></Alert.Root>
	{/if}

	<Card.Root>
		<form
			method="post"
			action="?/save"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="title">標題</Label>
					<Input id="title" name="title" required maxlength={200} value={data.task.title} />
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="description">描述（Markdown）</Label>
						<Button type="button" variant="ghost" size="sm" onclick={() => (preview = !preview)}>
							{preview ? '編輯' : '預覽'}
						</Button>
					</div>
					<!-- 預覽時仍保留 textarea（隱藏），內容才會隨表單送出 -->
					<Textarea
						id="description"
						name="description"
						maxlength={20000}
						rows={8}
						bind:value={description}
						class={preview ? 'hidden' : ''}
					/>
					{#if preview}
						<div class="prose min-h-24 max-w-none rounded-md border p-3 dark:prose-invert">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown 已消毒 -->
							{@html renderMarkdown(description)}
						</div>
					{/if}
				</div>

				<div class="flex flex-wrap gap-4">
					<div class="space-y-2">
						<Label for="status">狀態</Label>
						<NativeSelect.Root id="status" name="status" value={data.task.status}>
							{#each Object.entries(statusLabel) as [value, label] (value)}
								<NativeSelect.Option {value}>{label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="space-y-2">
						<Label for="startDate">開始日（選填）</Label>
						<Input id="startDate" name="startDate" type="date" bind:value={startDate} />
					</div>
					<div class="space-y-2">
						<Label for="dueDate">到期日</Label>
						<Input
							id="dueDate"
							name="dueDate"
							type="date"
							required
							value={data.task.dueDate ?? ''}
						/>
					</div>
					{#if data.canChangeAssignee}
						<div class="space-y-2">
							<Label for="assigneeId">指派人</Label>
							<NativeSelect.Root
								id="assigneeId"
								name="assigneeId"
								value={data.task.assigneeId ?? ''}
							>
								<NativeSelect.Option value="">未指派</NativeSelect.Option>
								{#each data.members as m (m.id)}
									<NativeSelect.Option value={m.id}>{m.name}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
					{/if}
				</div>
			</Card.Content>
			<Card.Footer class="mt-4">
				<Button type="submit">儲存</Button>
			</Card.Footer>
		</form>
	</Card.Root>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Parent</h2>
		{#if data.parents.visible.length || data.parents.hiddenCount}
			<ul class="divide-y rounded-md border">
				{#each data.parents.visible as p (p.id)}
					<li class="flex items-center gap-2 p-2">
						<a href={resolve('/tasks/[id]', { id: p.id })} class="flex-1 font-medium">{p.title}</a>
						<form method="post" action="?/detach" use:enhance>
							<input type="hidden" name="parentId" value={p.id} />
							<Button type="submit" size="sm" variant="outline">移除</Button>
						</form>
					</li>
				{/each}
				{#if data.parents.hiddenCount}
					<li class="p-2 text-sm text-muted-foreground">
						另有 {data.parents.hiddenCount} 個你看不到的 parent
					</li>
				{/if}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">這是頂層任務，沒有 parent。</p>
		{/if}
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">
			子任務
			{#if data.children.length}
				<span class="text-sm font-normal text-muted-foreground">
					{data.children.filter((c) => c.status === 'done').length}/{data.children.length} 完成
				</span>
			{/if}
		</h2>
		<Card.Root>
			<Card.Content class="divide-y">
				{#each data.children as c (c.id)}
					<TaskRow t={c} today={data.today} nested parentId={data.task.id} meId={data.user?.id} />
				{:else}
					<p class="py-3 text-sm text-muted-foreground">還沒有子任務。</p>
				{/each}
			</Card.Content>
		</Card.Root>
		<form method="post" action="?/addChild" use:enhance class="flex flex-wrap items-end gap-4">
			<div class="min-w-48 flex-1 space-y-2">
				<Label for="child-title">新增子任務</Label>
				<Input id="child-title" name="title" required maxlength={200} />
			</div>
			<div class="space-y-2">
				<Label for="child-due">到期日</Label>
				<Input id="child-due" name="dueDate" type="date" required />
			</div>
			<Button type="submit">新增</Button>
		</form>
		<AttachPicker taskId={data.task.id} />
	</section>

	{#if data.canDelete}
		<DeleteTask taskId={data.task.id} />
	{/if}
</main>
