<script lang="ts" module>
	import type { Row } from './TaskRow.svelte';
	// canMove（D75）由 server 算好，決定這張卡片能不能拖
	export type CardRow = Row & { canMove?: boolean; canChangeStatus?: boolean; canDetach?: boolean };
</script>

<script lang="ts">
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import XIcon from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import Avatar from './Avatar.svelte';
	import StatusPill from './StatusPill.svelte';
	import { dueLabel } from './group';
	import type { Status } from './status';

	let {
		t,
		today,
		onopen,
		onstatus,
		ondetach
	}: {
		t: CardRow;
		today: string;
		onopen: (e: MouseEvent, id: string) => void;
		onstatus: (id: string, s: Status) => void;
		ondetach?: (t: CardRow) => void;
	} = $props();

	// 狀態只有自身編輯者能改；祖先編輯者只能調整順序（server 算好）
	const editable = $derived(!!t.canChangeStatus);
	// dnd-action 的 keydown 掛在整張卡片：卡片內的按鈕、連結要照常用 Space／Enter，不能被當成起拖
	const keepKeys = (node: HTMLElement) => {
		const stop = (e: KeyboardEvent) => {
			if ((e.target as Element).closest('button,a,[role=menuitem]')) e.stopPropagation();
		};
		node.addEventListener('keydown', stop);
		return () => node.removeEventListener('keydown', stop);
	};
	const overdue = $derived(t.status !== 'done' && !!t.dueDate && t.dueDate < today);
</script>

<div
	{@attach keepKeys}
	class="board-card rounded-xl border border-border bg-card p-3 transition-colors hover:border-input
		{t.canMove ? 'cursor-grab' : ''}"
>
	<a
		href={resolve('/tasks/[id]', { id: t.id })}
		onclick={(e) => onopen(e, t.id)}
		draggable="false"
		class="block rounded-md text-[0.9rem] leading-snug font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50
			{t.status === 'done' ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}"
		>{t.title}</a
	>
	<div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
		<!-- 狀態選單是拖曳的鍵盤／觸控替代；點擊範圍用偽元素擴到 44px -->
		<span class="[&_button]:relative [&_button]:after:absolute [&_button]:after:-inset-2">
			<StatusPill status={t.status} {editable} onselect={(s) => onstatus(t.id, s)} />
		</span>
		{#if t.dueDate}
			<span
				class="inline-flex h-6 items-center rounded-full px-2 text-xs font-medium tabular-nums
					{overdue ? 'bg-overdue/15 text-overdue' : 'bg-secondary text-muted-foreground'}"
				title={t.dueDate}
			>
				{dueLabel(t.dueDate, today)}{#if overdue}<span class="sr-only">（逾期）</span>{/if}
			</span>
		{/if}
		{#if t.childCount > 0}
			<span
				class="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
				title="子任務完成數"
			>
				<ListTreeIcon class="size-3.5" aria-hidden="true" />
				<span class="sr-only">子任務</span>{t.doneChildCount}/{t.childCount}
				<span class="h-1 w-8 overflow-hidden rounded-full bg-muted" aria-hidden="true"
					><span
						class="block h-full rounded-full bg-status-done"
						style="width: {(t.doneChildCount / t.childCount) * 100}%"
					></span></span
				>
			</span>
		{/if}
		{#if t.source === 'assigned'}
			<span class="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] text-muted-foreground"
				>被指派</span
			>
		{/if}
		{#if t.canDetach && ondetach}
			<button
				type="button"
				class="relative grid size-7 place-items-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-1.5 hover:bg-muted hover:text-foreground"
				aria-label="取消掛接：{t.title}"
				title="取消掛接"
				onclick={() => ondetach(t)}><XIcon class="size-4" /></button
			>
		{/if}
		{#if t.assigneeName}<Avatar name={t.assigneeName} class="ml-auto" />{/if}
	</div>
</div>
