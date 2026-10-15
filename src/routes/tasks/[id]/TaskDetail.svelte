<script lang="ts">
	import { applyAction, enhance, type ActionResult, type SubmitFunction } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { toast } from '#lib/toast.svelte.js';
	import { lastStatus, statusLabel, type Status } from '../status';
	import TaskRow from '../TaskRow.svelte';
	import { patchTask } from '../patch';
	import ConfirmDialog from '../../ConfirmDialog.svelte';
	import AttachPicker from './AttachPicker.svelte';
	import Comments from './Comments.svelte';
	import DeleteTask from './DeleteTask.svelte';
	import type { PageData } from './$types';

	// panel：在清單頁的側滑面板裡（action 路徑與目前頁不同，結果要自己處理）；onrefresh：面板重抓自己的資料
	let {
		data,
		form = null,
		panel = false,
		onopen,
		onrefresh
	}: {
		data: PageData;
		form?: {
			message?: string;
			commentError?: { kind: 'add' | 'edit' | 'delete'; commentId: string };
		} | null;
		panel?: boolean;
		onopen?: (e: MouseEvent, id: string) => void;
		onrefresh?: () => Promise<void>;
	} = $props();

	const id = $derived(data.task.id);
	// 欄位以使用者編輯中的值為準；伺服器資料更新時只同步「沒有未完成儲存、也沒在輸入」的欄位
	const server = () => ({
		title: data.task.title,
		description: data.task.description,
		status: data.task.status as Status,
		startDate: data.task.startDate ?? '',
		dueDate: data.task.dueDate ?? '',
		assigneeId: data.task.assigneeId ?? ''
	});
	type Key = keyof ReturnType<typeof server>;
	const init = untrack(server);
	let title = $state(init.title);
	let description = $state(init.description);
	let status = $state(init.status);
	let startDate = $state(init.startDate);
	let dueDate = $state(init.dueDate);
	let assigneeId = $state(init.assigneeId);
	const pending = new SvelteMap<string, number>(); // 儲存中（含排隊）的欄位
	const typing = new SvelteSet<Key>(); // 標題／描述輸入中、尚未 blur
	const busy = (k: Key) => (pending.get(k) ?? 0) > 0 || typing.has(k);
	const revert = (k: Key) => {
		const v = server();
		if (k === 'title') title = v.title;
		else if (k === 'description') description = v.description;
		else if (k === 'status') status = v.status;
		else if (k === 'startDate') startDate = v.startDate;
		else if (k === 'dueDate') dueDate = v.dueDate;
		else assigneeId = v.assigneeId;
	};
	$effect(() => {
		void data.task;
		untrack(() => {
			for (const k of Object.keys(server()) as Key[]) if (!busy(k)) revert(k);
		});
	});
	let preview = $state(false);
	let leavingProject = $state<(typeof data.projects.attached)[number] | null>(null);
	let removing = $state<(typeof data.parents.visible)[number] | null>(null);

	let local = $state<{
		message?: string;
		commentError?: { kind: 'add' | 'edit' | 'delete'; commentId: string };
	} | null>(null);
	const f = $derived(local ?? form);

	const doneMsg: Record<string, string> = {
		saved: '已儲存',
		added: '已新增子任務',
		attached: '已掛上',
		detached: '已移除',
		projectAttached: '已掛入專案',
		projectDetached: '已取消掛接專案',
		commented: '已送出留言',
		edited: '已更新留言',
		deleted: '已刪除留言'
	};

	const refresh = async () => {
		await refreshAll();
		await onrefresh?.();
	};

	// 所有表單／對話框結果的共同出口
	const onresult = async (result: ActionResult, formEl?: HTMLFormElement) => {
		if (result.type === 'redirect' || result.type === 'error') return applyAction(result);
		local = (result.data as typeof local) ?? null;
		if (result.type !== 'success') return;
		formEl?.reset();
		const key = Object.keys(result.data ?? {}).find((k) => k in doneMsg);
		if (key) toast(doneMsg[key]);
		await refresh();
	};
	const submit: SubmitFunction =
		() =>
		async ({ result, formElement }) =>
			onresult(result, formElement);

	// 屬性逐欄自動儲存：只送被改的欄位；請求串成一條鏈依序送出，失敗只還原該次被改的欄位
	let chain: Promise<void> = Promise.resolve();
	const save = (fields: Partial<Record<Key, string>>) => {
		const keys = Object.keys(fields) as Key[];
		for (const k of keys) pending.set(k, (pending.get(k) ?? 0) + 1);
		chain = chain.then(async () => {
			const err = await patchTask(id, fields as Record<string, string>);
			for (const k of keys) {
				pending.set(k, pending.get(k)! - 1);
				typing.delete(k);
			}
			if (err) {
				local = { message: err };
				toast(err, 'error');
				for (const k of keys) if (!busy(k)) revert(k);
				return;
			}
			local = null;
			toast('已儲存');
			await refresh();
		});
		return chain;
	};
	const saveTitle = () => {
		const v = title.trim();
		typing.delete('title');
		if (!v) return revert('title'); // 標題不可為空
		if (v !== data.task.title) save({ title: v });
	};
	const saveDue = (v: string) => {
		if (!v) return revert('dueDate'); // 到期日必填
		if (v !== data.task.dueDate) save({ dueDate: v });
	};
	const toggleDone = () => {
		if (status === 'done') status = lastStatus.get(id) ?? 'todo';
		else {
			lastStatus.set(id, status);
			status = 'done';
		}
		save({ status });
	};

	const childrenDone = $derived(data.children.filter((c) => c.status === 'done').length);
	const prop = 'grid grid-cols-[5.5rem_1fr] items-center gap-3 min-h-11 md:min-h-10';
	const ghost =
		'border-transparent bg-transparent dark:bg-transparent hover:border-muted-foreground hover:bg-muted/40 dark:hover:bg-muted/40';
</script>

<div class="space-y-8">
	{#if !panel}
		<a
			href={resolve('/tasks')}
			class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
			><ArrowLeftIcon class="size-4" aria-hidden="true" />我的任務</a
		>
	{/if}

	{#if f?.message && !f.commentError}
		<Alert.Root variant="destructive"><Alert.Description>{f.message}</Alert.Description></Alert.Root
		>
	{/if}

	<div class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<Button
				type="button"
				variant="outline"
				class="rounded-full {status === 'done'
					? 'border-status-done/60 bg-status-done/10 text-status-done hover:bg-status-done/20 hover:text-status-done'
					: ''}"
				aria-pressed={status === 'done'}
				onclick={toggleDone}
			>
				<CheckIcon aria-hidden="true" />
				{status === 'done' ? '已完成' : '標示完成'}
			</Button>
			{#if !startDate}
				<Badge variant="outline" title="只有到期日、沒有開始日的任務會以里程碑顯示">里程碑</Badge>
			{/if}
		</div>

		<div>
			<Label for="d-title" class="sr-only">標題</Label>
			<input
				id="d-title"
				bind:value={title}
				maxlength={200}
				oninput={() => typing.add('title')}
				onblur={saveTitle}
				onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
				class="-mx-2 w-[calc(100%+1rem)] rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl leading-tight font-semibold tracking-tight transition-colors outline-none hover:border-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
			/>
		</div>
	</div>

	<section aria-label="屬性" class="-mt-2 space-y-0.5">
		<div class={prop}>
			<Label for="d-status" class="text-muted-foreground">狀態</Label>
			<NativeSelect.Root
				id="d-status"
				bind:value={status}
				onchange={(e) => save({ status: e.currentTarget.value })}
				class="w-full max-w-56"
			>
				{#each Object.entries(statusLabel) as [value, label] (value)}
					<NativeSelect.Option {value}>{label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>
		{#if data.canChangeAssignee}
			<div class={prop}>
				<Label for="d-assignee" class="text-muted-foreground">指派人</Label>
				<NativeSelect.Root
					id="d-assignee"
					bind:value={assigneeId}
					onchange={(e) => save({ assigneeId: e.currentTarget.value })}
					class="w-full max-w-56"
				>
					<NativeSelect.Option value="">未指派</NativeSelect.Option>
					{#each data.members as m (m.id)}
						<NativeSelect.Option value={m.id}>{m.name}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
		{/if}
		<div class={prop}>
			<Label for="d-start" class="text-muted-foreground">開始日</Label>
			<Input
				id="d-start"
				type="date"
				bind:value={startDate}
				onchange={(e) => save({ startDate: e.currentTarget.value })}
				class="max-w-56 {ghost}"
			/>
		</div>
		<div class={prop}>
			<Label for="d-due" class="text-muted-foreground">到期日</Label>
			<Input
				id="d-due"
				type="date"
				required
				bind:value={dueDate}
				onchange={(e) => saveDue(e.currentTarget.value)}
				class="max-w-56 {ghost}"
			/>
		</div>
	</section>

	<section class="space-y-2">
		<div class="flex items-center justify-between">
			<Label for="d-desc" class="text-sm font-semibold">描述</Label>
			<Button type="button" variant="ghost" size="sm" onclick={() => (preview = !preview)}>
				{preview ? '編輯' : '預覽 Markdown'}
			</Button>
		</div>
		{#if preview}
			<div class="prose prose-sm min-h-24 max-w-none rounded-lg bg-card p-3 dark:prose-invert">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown 已消毒 -->
				{@html renderMarkdown(description) || '<p class="text-muted-foreground">（沒有描述）</p>'}
			</div>
		{:else}
			<Textarea
				id="d-desc"
				bind:value={description}
				maxlength={20000}
				rows={5}
				placeholder="新增描述（支援 Markdown）"
				class="{ghost} min-h-28"
				oninput={() => typing.add('description')}
				onblur={() => {
					typing.delete('description');
					if (description !== data.task.description) save({ description });
				}}
			/>
		{/if}
	</section>

	<section class="space-y-3" aria-labelledby="d-sub">
		<h2 id="d-sub" class="text-base font-semibold">
			子任務
			{#if data.children.length}
				<span class="ml-1 text-sm font-normal text-muted-foreground tabular-nums"
					>{childrenDone}/{data.children.length}</span
				>
			{/if}
		</h2>
		<div class="-mx-1 border-t border-border">
			{#each data.children as c (c.id)}
				<TaskRow t={c} today={data.today} nested parentId={id} meId={data.user?.id} {onopen} />
			{:else}
				<p class="py-3 text-sm text-muted-foreground">還沒有子任務。</p>
			{/each}
		</div>
		<form
			method="post"
			action="/tasks/{id}?/addChild"
			use:enhance={submit}
			class="flex flex-wrap items-center gap-2"
		>
			<Label for="child-title" class="sr-only">新增子任務</Label>
			<Input
				id="child-title"
				name="title"
				required
				maxlength={200}
				placeholder="新增子任務"
				class="min-w-40 flex-1"
			/>
			<Label for="child-due" class="sr-only">子任務到期日</Label>
			<Input
				id="child-due"
				name="dueDate"
				type="date"
				required
				value={data.task.dueDate ?? data.today}
				class="w-auto"
			/>
			<Button type="submit" variant="secondary">新增</Button>
		</form>
		<AttachPicker
			taskId={id}
			version={`${data.parents.visible.length}/${data.children.length}`}
			{onresult}
		/>
	</section>

	<section class="space-y-3" aria-labelledby="d-parents">
		<h2 id="d-parents" class="text-base font-semibold">上層任務</h2>
		{#if data.parents.visible.length || data.parents.hiddenCount}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
				{#each data.parents.visible as p (p.id)}
					<li class="flex items-center gap-2 py-1 pr-1 pl-3">
						<a
							href={resolve('/tasks/[id]', { id: p.id })}
							onclick={onopen ? (e) => onopen(e, p.id) : undefined}
							class="flex-1 py-2 font-medium hover:underline">{p.title}</a
						>
						<Button type="button" size="sm" variant="ghost" onclick={() => (removing = p)}
							>移除</Button
						>
					</li>
				{/each}
				{#if data.parents.hiddenCount}
					<li class="p-3 text-sm text-muted-foreground">
						另有 {data.parents.hiddenCount} 個你看不到的上層任務
					</li>
				{/if}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">這是頂層任務，沒有上層任務。</p>
		{/if}
	</section>

	<section class="space-y-3" aria-labelledby="d-projects">
		<h2 id="d-projects" class="text-base font-semibold">所屬專案</h2>
		{#if data.projects.attached.length}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
				{#each data.projects.attached as pr (pr.id)}
					<li class="flex items-center gap-2 py-1 pr-1 pl-3">
						<a
							href={resolve('/projects/[id]', { id: pr.id })}
							class="flex-1 py-2 font-medium hover:underline">{pr.name}</a
						>
						{#if pr.archived}<Badge variant="outline">已封存</Badge>{/if}
						{#if pr.canDetach}
							<Button type="button" size="sm" variant="ghost" onclick={() => (leavingProject = pr)}
								>取消掛接</Button
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
				action="/tasks/{id}?/attachProject"
				use:enhance={submit}
				class="flex flex-wrap items-center gap-2"
			>
				<Label for="attach-project" class="sr-only">掛入專案</Label>
				<NativeSelect.Root
					id="attach-project"
					name="projectId"
					required
					class="min-w-48"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					<NativeSelect.Option value="">掛入專案…</NativeSelect.Option>
					{#each data.projects.attachable as pr (pr.id)}
						<NativeSelect.Option value={pr.id}>{pr.name}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<noscript><Button type="submit">掛入</Button></noscript>
			</form>
			<p class="text-xs text-muted-foreground">掛入後，專案成員都能看到這個任務與它的子任務。</p>
		{/if}
	</section>

	<Comments taskId={id} comments={data.comments} form={f} {onresult} />

	{#if data.canDelete}
		<div class="border-t border-border pt-6">
			<DeleteTask taskId={id} {onresult} />
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={() => leavingProject !== null, (v) => !v && (leavingProject = null)}
	title="取消掛接專案「{leavingProject?.name ?? ''}」？"
	description="任務不會被刪除；該專案的其他成員可能因此看不到它。"
	confirmLabel="取消掛接"
	action="/tasks/{id}?/detachProject"
	fields={{ projectId: leavingProject?.id ?? '' }}
	{onresult}
/>
<ConfirmDialog
	bind:open={() => removing !== null, (v) => !v && (removing = null)}
	title="移除上層任務「{removing?.title ?? ''}」？"
	description="只會移除這個關聯，任務本身不會被刪除。"
	confirmLabel="移除"
	action="/tasks/{id}?/detach"
	fields={{ parentId: removing?.id ?? '' }}
	{onresult}
/>
