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
	import ConfirmDialog from '../../ConfirmDialog.svelte';
	import AttachPicker from './AttachPicker.svelte';
	import Comments from './Comments.svelte';
	import DeleteTask from './DeleteTask.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// 以編輯中的內容預覽，故獨立於 data
	let description = $derived(data.task.description);
	let startDate = $derived(data.task.startDate ?? '');
	let preview = $state(false);
	let leavingProject = $state<(typeof data.projects.attached)[number] | null>(null);
	let removing = $state<(typeof data.parents.visible)[number] | null>(null);
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

	{#if form?.message && !('commentError' in form)}
		<Alert.Root variant="destructive"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{:else if form?.saved}
		<Alert.Root><Alert.Description>已儲存</Alert.Description></Alert.Root>
	{:else if form?.added}
		<Alert.Root><Alert.Description>已新增子任務</Alert.Description></Alert.Root>
	{:else if form?.attached}
		<Alert.Root><Alert.Description>已掛上</Alert.Description></Alert.Root>
	{:else if form?.detached}
		<Alert.Root><Alert.Description>已移除</Alert.Description></Alert.Root>
	{:else if form?.projectAttached}
		<Alert.Root><Alert.Description>已掛入專案</Alert.Description></Alert.Root>
	{:else if form?.projectDetached}
		<Alert.Root><Alert.Description>已取消掛接專案</Alert.Description></Alert.Root>
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
		<h2 class="text-lg font-semibold">上層任務</h2>
		{#if data.parents.visible.length || data.parents.hiddenCount}
			<ul class="divide-y rounded-md border">
				{#each data.parents.visible as p (p.id)}
					<li class="flex items-center gap-2 p-2">
						<a href={resolve('/tasks/[id]', { id: p.id })} class="flex-1 font-medium">{p.title}</a>
						<Button type="button" size="sm" variant="outline" onclick={() => (removing = p)}
							>移除</Button
						>
					</li>
				{/each}
				{#if data.parents.hiddenCount}
					<li class="p-2 text-sm text-muted-foreground">
						另有 {data.parents.hiddenCount} 個你看不到的上層任務
					</li>
				{/if}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">這是頂層任務，沒有上層任務。</p>
		{/if}
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">所屬專案</h2>
		{#if data.projects.attached.length}
			<ul class="divide-y rounded-md border">
				{#each data.projects.attached as pr (pr.id)}
					<li class="flex items-center gap-2 p-2">
						<a href={resolve('/projects/[id]', { id: pr.id })} class="flex-1 font-medium"
							>{pr.name}</a
						>
						{#if pr.archived}<Badge variant="outline">已封存</Badge>{/if}
						{#if pr.canDetach}
							<Button
								type="button"
								size="sm"
								variant="outline"
								onclick={() => (leavingProject = pr)}>取消掛接</Button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.projects.inherited.length}
			<p class="text-sm text-muted-foreground">
				經由上層任務屬於：{data.projects.inherited.map((x) => x.name).join('、')}
			</p>
		{:else if !data.projects.attached.length}
			<p class="text-sm text-muted-foreground">沒有掛在你所屬的專案。</p>
		{/if}
		{#if data.projects.attachable.length}
			<form
				method="post"
				action="?/attachProject"
				use:enhance
				class="flex flex-wrap items-end gap-3"
			>
				<div class="space-y-2">
					<Label for="attach-project">掛入專案</Label>
					<NativeSelect.Root id="attach-project" name="projectId" required>
						<NativeSelect.Option value="">選擇專案</NativeSelect.Option>
						{#each data.projects.attachable as pr (pr.id)}
							<NativeSelect.Option value={pr.id}>{pr.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</div>
				<Button type="submit">掛入</Button>
			</form>
			<p class="text-xs text-muted-foreground">掛入後，專案成員都能看到這個任務與它的子任務。</p>
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
		<AttachPicker
			taskId={data.task.id}
			version={`${data.parents.visible.length}/${data.children.length}`}
		/>
	</section>

	<Comments comments={data.comments} {form} />

	{#if data.canDelete}
		<DeleteTask taskId={data.task.id} />
	{/if}
	<ConfirmDialog
		bind:open={() => leavingProject !== null, (v) => !v && (leavingProject = null)}
		title="取消掛接專案「{leavingProject?.name ?? ''}」？"
		description="任務不會被刪除；該專案的其他成員可能因此看不到它。"
		confirmLabel="取消掛接"
		action="?/detachProject"
		fields={{ projectId: leavingProject?.id ?? '' }}
	/>
	<ConfirmDialog
		bind:open={() => removing !== null, (v) => !v && (removing = null)}
		title="移除上層任務「{removing?.title ?? ''}」？"
		description="只會移除這個關聯，任務本身不會被刪除。"
		confirmLabel="移除"
		action="?/detach"
		fields={{ parentId: removing?.id ?? '' }}
	/>
</main>
