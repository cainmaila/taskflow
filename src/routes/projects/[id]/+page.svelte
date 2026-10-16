<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { tick, untrack } from 'svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { plainText } from '#lib/plain-text.js';
	import { toast } from '#lib/toast.svelte.js';
	import ConfirmDialog from '../../ConfirmDialog.svelte';
	import Avatar from '../../tasks/Avatar.svelte';
	import Board from '../../tasks/Board.svelte';
	import TaskPanel from '../../tasks/TaskPanel.svelte';
	import TaskRow from '../../tasks/TaskRow.svelte';
	import ViewToggle from '../../tasks/ViewToggle.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const p = $derived(data.project);
	const archived = $derived(!!p.archivedAt);
	// 寫入控制只在有管理權限且未封存時出現（權限仍以 server 為準）
	const writable = $derived(p.canManage && !archived);
	const roleLabel = { owner: '管理者', member: '成員' } as const;

	// 分頁以 ?tab= 保存；設定分頁只給有管理權限者
	const tabs = $derived([
		{ id: 'tasks', label: '任務', count: data.tasks.length },
		{ id: 'members', label: '成員', count: p.members.length },
		...(p.canManage ? [{ id: 'settings', label: '設定', count: null }] : [])
	]);
	const tab = $derived.by(() => {
		const t = page.url.searchParams.get('tab');
		return tabs.some((x) => x.id === t) ? t! : 'tasks';
	});
	const board = $derived(tab === 'tasks' && page.url.searchParams.get('view') === 'board');
	const tabHref = (id: string) => {
		const qs = new SvelteURLSearchParams(page.url.search);
		if (id === 'tasks') qs.delete('tab');
		else qs.set('tab', id);
		if (id !== 'tasks') qs.delete('view');
		const q = qs.toString();
		return q ? `${page.url.pathname}?${q}` : page.url.pathname;
	};

	// action 網址帶著目前的 query（tab、view），否則送出後 URL 會丟掉分頁
	const act = (name: string) => `?/${name}${page.url.search ? '&' + page.url.search.slice(1) : ''}`;

	let removing = $state<(typeof p.members)[number] | null>(null);
	let detaching = $state<(typeof data.tasks)[number] | null>(null);
	let archiving = $state(false);
	let busy = $state('');

	// 成功訊息一律 toast；失敗訊息留在對應區塊的 inline alert
	$effect(() => {
		// toast() 會讀寫 toasts 狀態，需 untrack 以免 effect 自我觸發
		if (form?.ok) untrack(() => toast(form.ok!));
	});
	const failure = (section: 'info' | 'members' | 'tasks') =>
		form?.section === section && form.message ? form.message : '';

	// 標題行內編輯
	let editing = $state(false);
	let draft = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);
	let nameForm = $state<HTMLFormElement | null>(null);
	let cancelled = false;
	let saving = false;
	const startEdit = async () => {
		draft = p.name;
		cancelled = false;
		editing = true;
		await tick();
		nameInput?.select();
	};
	const commitName = () => {
		if (cancelled || !editing || saving) return;
		if (draft.trim() === p.name || !draft.trim()) editing = false;
		else nameForm?.requestSubmit();
	};

	let descOpen = $state(false);
	const longDesc = $derived(plainText(p.description ?? '').length > 140);
	const shown = $derived(p.members.slice(0, 5));

	// 自動儲存／送出共用：顯示 busy、完成後不重設表單
	const submit =
		(key: string, reset = false) =>
		() => {
			busy = key;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				try {
					await update({ reset });
				} finally {
					busy = '';
				}
			};
		};
</script>

<svelte:head><title>{p.name} - Taskflow</title></svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -- 分頁連結指向目前路由，只換 query -->

<main
	class="strong-fields mx-auto space-y-5 px-4 py-6 md:px-8 md:py-10 {board
		? 'max-w-7xl'
		: 'max-w-5xl'}"
>
	<a
		href={resolve('/projects')}
		class="inline-flex h-10 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:h-9"
		><ChevronLeftIcon class="size-4" aria-hidden="true" />專案</a
	>

	{#if archived}
		<Alert.Root>
			<Alert.Description
				>此專案已封存，唯讀：不能掛入或取消掛接任務、改成員或改專案資料。任務本身仍可編輯。</Alert.Description
			>
		</Alert.Root>
	{/if}
	{#if failure('info')}
		<Alert.Root variant="destructive"
			><Alert.Description>{failure('info')}</Alert.Description></Alert.Root
		>
	{/if}

	<header class="space-y-3">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			{#if editing}
				<form
					bind:this={nameForm}
					method="post"
					action={act('update')}
					class="min-w-0 flex-1"
					use:enhance={() => {
						saving = true; // Enter 送出後輸入框被移除會觸發 blur，避免重複送出
						return async ({ update }) => {
							editing = false;
							try {
								await update({ reset: false });
							} finally {
								saving = false;
							}
						};
					}}
				>
					<input type="hidden" name="description" value={p.description ?? ''} />
					<Input
						bind:ref={nameInput}
						bind:value={draft}
						name="name"
						required
						maxlength={100}
						aria-label="專案名稱"
						class="h-11 text-2xl font-semibold tracking-tight md:h-11 md:text-2xl"
						onblur={commitName}
						onkeydown={(e) => {
							if (e.key === 'Escape') {
								cancelled = true;
								editing = false;
							}
						}}
					/>
				</form>
			{:else if writable}
				<h1
					class="min-w-0 flex-1 basis-60 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] md:text-[1.75rem]"
				>
					<button
						type="button"
						onclick={startEdit}
						class="group -mx-2 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-0.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
						aria-label="{p.name}，點擊編輯名稱"
					>
						{p.name}
						<PencilIcon
							class="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
							aria-hidden="true"
						/>
					</button>
				</h1>
			{:else}
				<h1
					class="min-w-0 flex-1 basis-60 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] md:text-[1.75rem]"
				>
					{p.name}
				</h1>
			{/if}
			{#if archived}<Badge variant="outline">已封存</Badge>{/if}
			<div class="ml-auto flex items-center gap-3">
				<a
					href={tabHref('members')}
					class="flex items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label="共 {p.members.length} 位成員，前往成員分頁"
				>
					{#each shown as m (m.userId)}
						<Avatar name={m.name} class="-ml-1.5 size-8 ring-2 ring-background first:ml-0" />
					{/each}
					{#if p.members.length > shown.length}
						<span
							class="-ml-1.5 grid h-8 min-w-8 place-items-center rounded-full bg-secondary px-1.5 text-xs font-semibold ring-2 ring-background"
							>+{p.members.length - shown.length}</span
						>
					{/if}
				</a>
				{#if p.canManage}
					{#if archived}
						<form method="post" action={act('unarchive')} use:enhance={submit('unarchive')}>
							<Button type="submit" variant="outline" disabled={busy === 'unarchive'}
								><ArchiveRestoreIcon aria-hidden="true" />取消封存</Button
							>
						</form>
					{:else}
						<Button type="button" variant="outline" onclick={() => (archiving = true)}
							><ArchiveIcon aria-hidden="true" />封存</Button
						>
					{/if}
				{/if}
			</div>
		</div>

		{#if p.description}
			<div class="max-w-3xl">
				<div
					class="prose prose-sm max-w-none text-muted-foreground dark:prose-invert {longDesc &&
					!descOpen
						? 'max-h-16 overflow-hidden [mask-image:linear-gradient(#000_50%,transparent)]'
						: ''}"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown 已消毒 -->
					{@html renderMarkdown(p.description)}
				</div>
				{#if longDesc}
					<button
						type="button"
						aria-expanded={descOpen}
						onclick={() => (descOpen = !descOpen)}
						class="mt-1 h-10 rounded-lg text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
						>{descOpen ? '收合' : '展開全部'}</button
					>
				{/if}
			</div>
		{/if}

		<nav aria-label="專案分頁" class="flex gap-1 border-b border-border">
			{#each tabs as t (t.id)}
				<a
					href={tabHref(t.id)}
					aria-current={tab === t.id ? 'page' : undefined}
					data-sveltekit-reset="false"
					data-sveltekit-replacestate
					class="relative flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {tab ===
					t.id
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{t.label}
					{#if t.count !== null}<span
							class="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums"
							>{t.count}</span
						>{/if}
					{#if tab === t.id}<span
							class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
						></span>{/if}
				</a>
			{/each}
		</nav>
	</header>

	{#if tab === 'tasks'}
		<section class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="sr-only">任務</h2>
				<p class="text-sm text-muted-foreground">共 {data.tasks.length} 項任務</p>
				<ViewToggle />
			</div>
			{#if failure('tasks')}
				<Alert.Root variant="destructive"
					><Alert.Description>{failure('tasks')}</Alert.Description></Alert.Root
				>
			{/if}
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
							<p class="py-6 text-center text-sm text-muted-foreground">
								還沒有任務。到任務的詳情頁，把任務掛進這個專案。
							</p>
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}
		</section>
	{:else if tab === 'members'}
		<section class="space-y-3">
			<h2 class="sr-only">成員</h2>
			{#if failure('members')}
				<Alert.Root variant="destructive"
					><Alert.Description>{failure('members')}</Alert.Description></Alert.Root
				>
			{/if}
			<Card.Root>
				<Card.Content class="divide-y">
					{#each p.members as m, i (m.userId)}
						<div class="rise flex flex-wrap items-center gap-3 py-3" style="--i: {i}">
							<Avatar name={m.name} class="size-9 text-sm" />
							<div class="min-w-40 flex-1">
								<div class="font-medium">{m.name}</div>
								<div class="text-sm text-muted-foreground">{m.email}</div>
							</div>
							{#if m.banned}<Badge variant="destructive">已停用</Badge>{/if}
							{#if writable}
								<form
									method="post"
									action={act('setRole')}
									use:enhance={submit('role-' + m.userId, true)}
								>
									<input type="hidden" name="userId" value={m.userId} />
									<NativeSelect.Root
										name="role"
										value={m.role}
										aria-label="{m.name} 的角色"
										disabled={busy === 'role-' + m.userId}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										{#each Object.entries(roleLabel) as [value, label] (value)}
											<NativeSelect.Option {value}>{label}</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
									<noscript
										><Button type="submit" variant="outline" size="sm">變更</Button></noscript
									>
								</form>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="text-muted-foreground hover:text-destructive"
									aria-label="移除 {m.name}"
									title="移除"
									onclick={() => (removing = m)}><UserMinusIcon aria-hidden="true" /></Button
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
							action={act('addMember')}
							use:enhance={submit('add', true)}
							class="flex w-full flex-wrap items-end gap-3"
						>
							<div class="min-w-48 flex-1 space-y-2">
								<Label for="add-user">加入成員</Label>
								<NativeSelect.Root id="add-user" name="userId" required class="w-full">
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
							<Button type="submit" disabled={busy === 'add'}>
								{#if busy === 'add'}<LoaderIcon class="animate-spin" aria-hidden="true" />{/if}加入
							</Button>
						</form>
					</Card.Footer>
				{/if}
			</Card.Root>
		</section>
	{:else}
		<section class="space-y-4">
			<h2 class="sr-only">設定</h2>
			{#if writable}
				<Card.Root>
					<Card.Header><Card.Title>專案資料</Card.Title></Card.Header>
					<form method="post" action={act('update')} use:enhance={submit('update')}>
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
									rows={5}
									maxlength={20000}
									value={p.description ?? ''}
								/>
							</div>
							<Button type="submit" disabled={busy === 'update'}>
								{#if busy === 'update'}<LoaderIcon
										class="animate-spin"
										aria-hidden="true"
									/>{/if}儲存
							</Button>
						</Card.Content>
					</form>
				</Card.Root>
			{/if}
			<Card.Root>
				<Card.Header>
					<Card.Title>{archived ? '取消封存' : '封存專案'}</Card.Title>
					<Card.Description>
						{archived
							? '取消封存後，專案恢復可編輯並回到預設清單。'
							: '封存後專案唯讀、預設從清單隱藏；成員仍能看到專案內的任務。之後可以取消封存。'}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if archived}
						<form method="post" action={act('unarchive')} use:enhance={submit('unarchive')}>
							<Button type="submit" variant="outline" disabled={busy === 'unarchive'}
								><ArchiveRestoreIcon aria-hidden="true" />取消封存</Button
							>
						</form>
					{:else}
						<Button type="button" variant="destructive" onclick={() => (archiving = true)}
							><ArchiveIcon aria-hidden="true" />封存專案</Button
						>
					{/if}
				</Card.Content>
			</Card.Root>
		</section>
	{/if}

	<ConfirmDialog
		bind:open={() => archiving, (v) => (archiving = v)}
		title="封存「{p.name}」？"
		description="封存後專案唯讀、預設從清單隱藏；成員仍能看到專案內的任務。之後可以取消封存。"
		confirmLabel="封存"
		action={act('archive')}
	/>
	<ConfirmDialog
		bind:open={() => removing !== null, (v) => !v && (removing = null)}
		title="移除成員「{removing?.name ?? ''}」？"
		description="對方將無法再看到只因專案才能看到的任務。"
		confirmLabel="移除"
		action={act('removeMember')}
		fields={{ userId: removing?.userId ?? '' }}
	/>
	<ConfirmDialog
		bind:open={() => detaching !== null, (v) => !v && (detaching = null)}
		title="取消掛接「{detaching?.title ?? ''}」？"
		description="任務不會被刪除；專案成員可能因此看不到它。"
		confirmLabel="取消掛接"
		action={act('detachTask')}
		fields={{ taskId: detaching?.id ?? '' }}
	/>
</main>

{#if board}<TaskPanel />{/if}
