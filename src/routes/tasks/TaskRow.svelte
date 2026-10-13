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
	};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { statusLabel } from './status';
	import TaskRow from './TaskRow.svelte';

	// nested：在某個 parent 底下展開時，parentCount 要扣掉目前這個 parent（D21）
	let { t, today, nested = false }: { t: Row; today: string; nested?: boolean } = $props();

	let expanded = $state(false);
	let loading = $state(false);
	let error = $state('');
	let children = $state<Row[] | null>(null);

	const overdue = $derived(t.status !== 'done' && !!t.dueDate && t.dueDate < today);
	const otherParents = $derived(nested ? t.parentCount - 1 : t.parentCount);

	const toggle = async () => {
		expanded = !expanded;
		if (!expanded || children || loading) return;
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
	</div>
	{#if error}<p class="pl-8 text-sm text-destructive" role="alert">{error}</p>{/if}
	{#if expanded && children}
		<div class="ml-4 divide-y border-l pl-4">
			{#each children as c (c.id)}
				<TaskRow t={c} {today} nested />
			{/each}
		</div>
	{/if}
</div>
