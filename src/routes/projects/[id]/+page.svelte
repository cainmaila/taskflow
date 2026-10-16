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
	import ConfirmDialog from '../../ConfirmDialog.svelte';
	import Board from '../../tasks/Board.svelte';
	import TaskPanel from '../../tasks/TaskPanel.svelte';
	import TaskRow from '../../tasks/TaskRow.svelte';
	import ViewToggle from '../../tasks/ViewToggle.svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const board = $derived(page.url.searchParams.get('view') === 'board');
	const p = $derived(data.project);
	const archived = $derived(!!p.archivedAt);
	// 寫入控制只在有管理權限且未封存時出現（權限仍以 server 為準）
	const writable = $derived(p.canManage && !archived);
	const roleLabel = { owner: '管理者', member: '成員' } as const;

	let archiving = $state(false);
	let removing = $state<(typeof p.members)[number] | null>(null);
	let detaching = $state<(typeof data.tasks)[number] | null>(null);
</script>

{#snippet notice(section: 'info' | 'members' | 'tasks')}
	{#if form?.section === section}
		{#if form.message}
			<Alert.Root variant="destructive"
				><Alert.Description>{form.message}</Alert.Description></Alert.Root
			>
		{:else if form.ok}
			<Alert.Root><Alert.Description>{form.ok}</Alert.Description></Alert.Root>
		{/if}
	{/if}
{/snippet}

<svelte:head><title>{p.name} - Taskflow</title></svelte:head>

<main class="mx-auto space-y-6 px-4 py-6 md:px-8 md:py-10 {board ? 'max-w-7xl' : 'max-w-4xl'}">
	<a href={resolve('/projects')} class="text-sm text-muted-foreground hover:text-foreground"
		>← 專案</a
	>

	{@render notice('info')}

	{#if archived}
		<Alert.Root>
			<Alert.Description
				>此專案已封存，唯讀：不能掛入或取消掛接任務、改成員或改專案資料。任務本身仍可編輯。</Alert.Description
			>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold">{p.name}</h1>
		{#if archived}<Badge variant="outline">已封存</Badge>{/if}
		<span class="ml-auto"></span>
		{#if p.canManage}
			{#if archived}
				<form method="post" action="?/unarchive" use:enhance>
					<Button type="submit" variant="outline" size="sm">取消封存</Button>
				</form>
			{:else}
				<Button type="button" variant="outline" size="sm" onclick={() => (archiving = true)}
					>封存</Button
				>
			{/if}
		{/if}
	</div>

	{#if p.description}
		<div class="prose max-w-none rounded-md border p-3 dark:prose-invert">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown 已消毒 -->
			{@html renderMarkdown(p.description)}
		</div>
	{/if}

	{#if writable}
		<Card.Root>
			<Card.Header><Card.Title>編輯專案</Card.Title></Card.Header>
			<form
				method="post"
				action="?/update"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="name">名稱</Label>
						<Input id="name" name="name" required maxlength={100} value={p.name} />
					</div>
					<div class="space-y-2">
						<Label for="description">描述（Markdown）</Label>
						<Textarea
							id="description"
							name="description"
							rows={4}
							maxlength={20000}
							value={p.description ?? ''}
						/>
					</div>
					<Button type="submit">儲存</Button>
				</Card.Content>
			</form>
		</Card.Root>
	{/if}

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">成員</h2>
		{@render notice('members')}
		<Card.Root>
			<Card.Content class="divide-y">
				{#each p.members as m (m.userId)}
					<div class="flex flex-wrap items-center gap-3 py-3">
						<div class="min-w-40 flex-1">
							<div class="font-medium">{m.name}</div>
							<div class="text-sm text-muted-foreground">{m.email}</div>
						</div>
						{#if m.banned}<Badge variant="destructive">已停用</Badge>{/if}
						{#if writable}
							<form method="post" action="?/setRole" use:enhance class="flex gap-2">
								<input type="hidden" name="userId" value={m.userId} />
								<NativeSelect.Root name="role" value={m.role} aria-label="角色">
									{#each Object.entries(roleLabel) as [value, label] (value)}
										<NativeSelect.Option {value}>{label}</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
								<Button type="submit" variant="outline" size="sm">變更</Button>
							</form>
							<Button type="button" variant="outline" size="sm" onclick={() => (removing = m)}
								>移除</Button
							>
						{:else}
							<Badge variant="secondary">{roleLabel[m.role]}</Badge>
						{/if}
					</div>
				{/each}
			</Card.Content>
			{#if writable}
				<Card.Footer class="mt-2">
					<form
						method="post"
						action="?/addMember"
						use:enhance
						class="flex flex-wrap items-end gap-3"
					>
						<div class="space-y-2">
							<Label for="add-user">加入成員</Label>
							<NativeSelect.Root id="add-user" name="userId" required>
								<NativeSelect.Option value="">選擇使用者</NativeSelect.Option>
								{#each data.addable as u (u.id)}
									<NativeSelect.Option value={u.id}>{u.name}（{u.email}）</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="space-y-2">
							<Label for="add-role">角色</Label>
							<NativeSelect.Root id="add-role" name="role">
								<NativeSelect.Option value="member">成員</NativeSelect.Option>
								<NativeSelect.Option value="owner">管理者</NativeSelect.Option>
							</NativeSelect.Root>
						</div>
						<Button type="submit">加入</Button>
					</form>
				</Card.Footer>
			{/if}
		</Card.Root>
	</section>

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">任務</h2>
			<ViewToggle />
		</div>
		{@render notice('tasks')}
		{#if board}
			<Board
				rows={data.tasks}
				today={data.today}
				ondetach={(t) => (detaching = data.tasks.find((x) => x.id === t.id) ?? null)}
			/>
		{:else}
			<Card.Root>
				<Card.Content class="divide-y">
					{#each data.tasks as t (t.id)}
						<div class="flex items-center gap-2">
							<div class="min-w-0 flex-1">
								<TaskRow {t} today={data.today} />
							</div>
							{#if t.canDetach}
								<Button type="button" size="sm" variant="outline" onclick={() => (detaching = t)}
									>取消掛接</Button
								>
							{/if}
						</div>
					{:else}
						<p class="py-3 text-sm text-muted-foreground">
							還沒有任務。到任務的詳情頁，把任務掛進這個專案。
						</p>
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}
	</section>

	<ConfirmDialog
		bind:open={() => archiving, (v) => (archiving = v)}
		title="封存「{p.name}」？"
		description="封存後專案唯讀、預設從清單隱藏；成員仍能看到專案內的任務。之後可以取消封存。"
		confirmLabel="封存"
		action="?/archive"
	/>
	<ConfirmDialog
		bind:open={() => removing !== null, (v) => !v && (removing = null)}
		title="移除成員「{removing?.name ?? ''}」？"
		description="對方將無法再看到只因專案才能看到的任務。"
		confirmLabel="移除"
		action="?/removeMember"
		fields={{ userId: removing?.userId ?? '' }}
	/>
	<ConfirmDialog
		bind:open={() => detaching !== null, (v) => !v && (detaching = null)}
		title="取消掛接「{detaching?.title ?? ''}」？"
		description="任務不會被刪除；專案成員可能因此看不到它。"
		confirmLabel="取消掛接"
		action="?/detachTask"
		fields={{ taskId: detaching?.id ?? '' }}
	/>
</main>

{#if board}<TaskPanel />{/if}
