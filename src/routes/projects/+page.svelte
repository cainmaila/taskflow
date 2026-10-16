<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import FormDialog from '#lib/components/FormDialog.svelte';
	import { plainText } from '#lib/plain-text.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '../tasks/Avatar.svelte';
	import PageHeader from '../tasks/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let creating = $state(false);
	let busy = $state(false);
	// 失敗訊息只在 dialog 內顯示；開啟時清掉上一次的
	let error = $state('');
	// 欄位層級錯誤（取代瀏覽器原生泡泡；required 保留作無 JS 後備）
	let nameError = $state('');
	let name = $state('');
	let desc = $state('');
	const openCreate = () => {
		error = '';
		creating = true;
	};
	// 關閉動畫結束後清掉輸入與錯誤，下次開啟不殘留
	const resetCreate = () => {
		error = '';
		nameError = '';
		name = '';
		desc = '';
	};

	const roleLabel = (r: 'owner' | 'member' | null) =>
		r === 'owner' ? '管理者' : r === 'member' ? '成員' : '系統管理員';
	const toggleArchived = () =>
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- 目前路由只換 query
		goto(`${resolve('/projects')}${data.includeArchived ? '' : '?archived=1'}`);
</script>

<svelte:head><title>專案 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
	<PageHeader title="專案">
		<div class="flex items-center gap-2">
			<button
				type="button"
				role="switch"
				aria-checked={data.includeArchived}
				onclick={toggleArchived}
				class="inline-flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring md:h-9"
			>
				<span
					class="relative h-5 w-9 rounded-full transition-colors {data.includeArchived
						? 'bg-primary'
						: 'bg-input'}"
					aria-hidden="true"
				>
					<span
						class="absolute top-0.5 left-0.5 size-4 rounded-full bg-foreground transition-transform duration-200 ease-[var(--ease-spring)] {data.includeArchived
							? 'translate-x-4 bg-primary-foreground'
							: ''}"
					></span>
				</span>
				顯示已封存
			</button>
			{#if data.canCreate}
				<Button onclick={openCreate}><PlusIcon aria-hidden="true" />新增專案</Button>
			{/if}
		</div>
	</PageHeader>

	{#if data.projects.length}
		<ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.projects as p, i (p.id)}
				{@const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0}
				{@const summary = plainText(p.description ?? '')}
				<li class="rise" style="--i: {i}">
					<a
						href={resolve('/projects/[id]', { id: p.id })}
						class="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out)] outline-none hover:-translate-y-0.5 hover:border-input hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring md:p-5 {p.archivedAt
							? 'opacity-70 saturate-50'
							: ''}"
					>
						<div class="flex items-start justify-between gap-3">
							<h2
								class="text-base leading-snug font-semibold tracking-tight [overflow-wrap:anywhere]"
							>
								{p.name}
							</h2>
							{#if p.archivedAt}<Badge variant="outline">已封存</Badge>{/if}
						</div>
						<p
							class="line-clamp-2 min-h-10 text-sm leading-5 {summary
								? 'text-muted-foreground'
								: 'text-muted-foreground/60 italic'}"
						>
							{summary || '尚無描述'}
						</p>
						<div>
							<div class="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
								<span>{p.taskCount ? `${p.doneCount} / ${p.taskCount} 完成` : '尚無任務'}</span>
								{#if p.taskCount}<span class="tabular-nums">{pct}%</span>{/if}
							</div>
							<div
								class="h-1.5 overflow-hidden rounded-full bg-muted"
								role="progressbar"
								aria-label="完成進度"
								aria-valuenow={pct}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								<div
									class="h-full rounded-full bg-status-done transition-[width] duration-500 ease-[var(--ease-out)]"
									style="width: {pct}%"
								></div>
							</div>
						</div>
						<div class="mt-auto flex items-center justify-between gap-2 pt-1">
							<div class="flex items-center" aria-label="共 {p.memberCount} 位成員">
								{#each p.memberPreview as n (n)}
									<Avatar name={n} class="-ml-1.5 size-7 ring-2 ring-card first:ml-0" />
								{/each}
								{#if p.memberCount > p.memberPreview.length}
									<span
										class="-ml-1.5 grid h-7 min-w-7 place-items-center rounded-full bg-secondary px-1.5 text-[0.7rem] font-semibold ring-2 ring-card"
										>+{p.memberCount - p.memberPreview.length}</span
									>
								{/if}
							</div>
							<Badge
								variant="secondary"
								title={p.myRole ? undefined : '非成員，以系統管理員身分檢視'}
								>{roleLabel(p.myRole)}</Badge
							>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div
			class="rise grid justify-items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center"
		>
			<svg viewBox="0 0 120 96" class="mb-2 w-32" fill="none" aria-hidden="true">
				<rect
					x="14"
					y="30"
					width="92"
					height="56"
					rx="10"
					class="fill-card stroke-border"
					stroke-width="2"
				/>
				<path
					d="M14 40a10 10 0 0 1 10-10h22l8 9h42a10 10 0 0 1 10 10"
					class="stroke-input"
					stroke-width="2"
				/>
				<rect x="28" y="52" width="40" height="6" rx="3" class="fill-muted" />
				<rect x="28" y="66" width="26" height="6" rx="3" class="fill-muted" />
				<circle cx="92" cy="24" r="14" class="fill-primary" />
				<path
					d="M92 18v12M86 24h12"
					class="stroke-primary-foreground"
					stroke-width="3"
					stroke-linecap="round"
				/>
			</svg>
			<h2 class="text-lg font-semibold">
				{data.includeArchived ? '沒有任何專案' : '還沒有專案'}
			</h2>
			<p class="max-w-xs text-sm text-muted-foreground">
				{data.canCreate
					? '建立第一個專案，把相關任務與成員集中在一起。'
					: '你還沒有加入任何專案。請專案管理者把你加進去。'}
			</p>
			{#if data.canCreate}
				<Button class="mt-2" onclick={openCreate}
					><FolderPlusIcon aria-hidden="true" />建立專案</Button
				>
			{/if}
		</div>
	{/if}
</main>

<FormDialog
	bind:open={creating}
	onclosed={resetCreate}
	title="新增專案"
	description="建立後可再邀請成員、掛入任務。"
>
	<form
		method="post"
		action="?/create"
		class="space-y-4"
		novalidate
		use:enhance={({ cancel, formElement }) => {
			const input = formElement.elements.namedItem('name') as HTMLInputElement;
			if (!input.value.trim()) {
				nameError = '請輸入專案名稱';
				input.focus();
				return cancel();
			}
			nameError = '';
			busy = true;
			error = '';
			return async ({ result, update }) => {
				try {
					if (result.type === 'failure') {
						error = (result.data?.message as string | undefined) ?? '建立失敗';
					} else {
						if (result.type === 'redirect') toast('已建立專案');
						creating = false;
						await update();
					}
				} finally {
					busy = false;
				}
			};
		}}
	>
		{#if error}
			<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
		{/if}
		<div class="space-y-2">
			<Label for="p-name">名稱</Label>
			<Input
				id="p-name"
				name="name"
				required
				maxlength={100}
				bind:value={name}
				aria-invalid={nameError ? true : undefined}
				aria-describedby={nameError ? 'p-name-err' : undefined}
				oninput={() => (nameError = '')}
			/>
			{#if nameError}<p id="p-name-err" class="text-sm text-destructive" role="alert">
					{nameError}
				</p>{/if}
		</div>
		<div class="space-y-2">
			<Label for="p-desc">描述（Markdown，選填）</Label>
			<Textarea id="p-desc" name="description" rows={4} maxlength={20000} bind:value={desc} />
		</div>
		<div class="flex justify-end gap-2 pt-1">
			<Button type="button" variant="ghost" onclick={() => (creating = false)}>取消</Button>
			<Button type="submit" disabled={busy}>
				{#if busy}<LoaderIcon class="animate-spin" aria-hidden="true" />建立中…{:else}建立{/if}
			</Button>
		</div>
	</form>
</FormDialog>
