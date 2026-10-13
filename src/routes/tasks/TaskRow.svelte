<script lang="ts" module>
	export type Row = {
		id: string;
		title: string;
		status: 'todo' | 'in_progress' | 'pending' | 'done';
		dueDate: string | null;
		childCount: number;
		doneChildCount: number;
		parentCount: number;
		source?: 'own' | 'assigned';
		assigneeName?: string;
		createdBy?: string;
		assigneeId?: string | null;
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { statusLabel } from './status';
	import TaskRow from './TaskRow.svelte';

	// nested：在某個 parent 底下展開時，parentCount 要扣掉目前這個 parent（D21）
	// parentId：這一列是在哪個 parent 底下顯示（用於「移除」）；meId 用來判斷是否有操作權（建立者或指派人）
	let {
		t,
		today,
		nested = false,
		parentId,
		meId,
		onchange
	}: {
		t: Row;
		today: string;
		nested?: boolean;
		parentId?: string;
		meId?: string;
		onchange?: () => void;
	} = $props();

	let expanded = $state(false);
	let loading = $state(false);
	let error = $state('');
	let children = $state<Row[] | null>(null);

	const overdue = $derived(t.status !== 'done' && !!t.dueDate && t.dueDate < today);
	const otherParents = $derived(nested ? t.parentCount - 1 : t.parentCount);

	const load = async () => {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/tasks/${t.id}/children`);
			if (!res.ok) throw new Error(String(res.status));
			children = await res.json();
		} catch {
			error = '載入子任務失敗，請再試一次';
			expanded = false;
		} finally {
			loading = false;
		}
	};
	const toggle = async () => {
		expanded = !expanded;
		if (expanded && !children && !loading) await load();
	};

	// 子任務數字變了（掛上、移除、刪除後頁面重新載入），快取的子任務就過期了
	$effect(() => {
		void `${t.childCount}/${t.doneChildCount}`;
		untrack(() => {
			if (!children) return;
			children = null;
			if (expanded) load();
		});
	});

	const canDetach = $derived(
		!!parentId && !!meId && (t.createdBy === meId || t.assigneeId === meId)
	);
	let detachError = $state('');
	const detach = async () => {
		if (!parentId || !confirm(`確定要把「${t.title}」從上層任務移除嗎？任務本身不會被刪除。`))
			return;
		detachError = '';
		const body = new FormData();
		body.set('parentId', parentId);
		const res = await fetch(`/tasks/${t.id}?/detach`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		const out = (await res.json().catch(() => null)) as { type?: string } | null;
		if (out?.type !== 'success') {
			detachError = '移除失敗，請重新整理後再試';
			return;
		}
		onchange?.();
		await invalidateAll();
	};
</script>

<div>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-muted/50">
		{#if t.childCount > 0}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="w-8 px-0"
				aria-expanded={expanded}
				aria-label={expanded ? '收合子任務' : '展開子任務'}
				onclick={toggle}>{loading ? '…' : expanded ? '▾' : '▸'}</Button
			>
		{:else}
			<span class="w-8"></span>
		{/if}
		<a href={resolve('/tasks/[id]', { id: t.id })} class="min-w-40 flex-1 font-medium">{t.title}</a>
		<span class="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
			{#if t.source}<Badge variant="outline">{t.source === 'own' ? '自己建' : '被指派'}</Badge>{/if}
			{#if t.assigneeName}<Badge variant="outline">指派給 {t.assigneeName}</Badge>{/if}
			<Badge variant="secondary">{statusLabel[t.status]}</Badge>
			{#if t.childCount > 0}
				<span class="text-sm text-muted-foreground">子任務 {t.doneChildCount}/{t.childCount}</span>
			{/if}
			{#if otherParents > 0}
				<span class="text-sm text-muted-foreground"
					>{nested ? '另有' : '有'} {otherParents} 個 parent</span
				>
			{/if}
			<span class="text-sm {overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}">
				{t.dueDate}{overdue ? '（逾期）' : ''}
			</span>
		</span>
		{#if canDetach}
			<Button type="button" size="sm" variant="outline" onclick={detach}>移除</Button>
		{/if}
	</div>
	{#if detachError}<p class="pl-8 text-sm text-destructive" role="alert">{detachError}</p>{/if}
	{#if error}<p class="pl-8 text-sm text-destructive" role="alert">{error}</p>{/if}
	{#if expanded && children}
		<div class="ml-4 divide-y border-l pl-4">
			{#each children as c (c.id)}
				<TaskRow t={c} {today} nested parentId={t.id} {meId} onchange={load} />
			{/each}
		</div>
	{/if}
</div>
