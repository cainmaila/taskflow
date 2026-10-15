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
	import { slide } from 'svelte/transition';
	import { prefersReducedMotion as reduced } from 'svelte/motion';
	import { refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from './Avatar.svelte';
	import CheckCircle from './CheckCircle.svelte';
	import StatusPill from './StatusPill.svelte';
	import TaskRow from './TaskRow.svelte';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import { dueLabel } from './group';
	import { patchTask } from './patch';
	import { lastStatus, type Status } from './status';

	// nested：在某個 parent 底下展開時，parentCount 要扣掉目前這個 parent（D21）
	// parentId：這一列是在哪個 parent 底下顯示（用於「移除」）；meId 用來判斷是否有操作權（建立者或指派人）
	// onopen：有給就攔截點擊（清單用來開側滑面板），沒給就是一般連結
	let {
		t,
		today,
		nested = false,
		parentId,
		meId,
		onchange,
		onopen
	}: {
		t: Row;
		today: string;
		nested?: boolean;
		parentId?: string;
		meId?: string;
		onchange?: () => void | Promise<void>;
		onopen?: (e: MouseEvent, id: string) => void;
	} = $props();

	let expanded = $state(false);
	let loading = $state(false);
	let error = $state('');
	let children = $state<Row[] | null>(null);

	// 樂觀更新：先顯示新狀態，失敗（如 D66）再回滾
	let override = $state<Status | null>(null);
	let collapsing = $state(false);
	const status = $derived(override ?? t.status);
	const editable = $derived(!!meId && (t.createdBy === meId || t.assigneeId === meId));
	const overdue = $derived(status !== 'done' && !!t.dueDate && t.dueDate < today);
	const otherParents = $derived(nested ? t.parentCount - 1 : t.parentCount);

	let busy = $state(false);
	const setStatus = async (next: Status) => {
		if (next === status || busy) return;
		busy = true;
		if (next === 'done') lastStatus.set(t.id, status);
		override = next;
		try {
			const err = await patchTask(t.id, { status: next });
			if (err) {
				override = null;
				toast(err, 'error');
				return;
			}
			if (next === 'done' && !nested) {
				collapsing = true;
				await new Promise((r) => setTimeout(r, reduced.current ? 0 : 240));
			}
			await Promise.all([onchange?.(), refreshAll()]);
			override = null;
			collapsing = false;
		} finally {
			busy = false;
		}
	};
	// 取消完成回到完成前的狀態（只在本次瀏覽器工作階段記得，否則回「待辦」）
	const toggleDone = () => setStatus(status === 'done' ? (lastStatus.get(t.id) ?? 'todo') : 'done');

	const load = async () => {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/tasks/${encodeURIComponent(t.id)}/children`);
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
	let confirmOpen = $state(false);
	const detach = async () => {
		if (!parentId) return;
		detachError = '';
		const body = new FormData();
		body.set('parentId', parentId);
		const res = await fetch(`/tasks/${encodeURIComponent(t.id)}?/detach`, {
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
		await refreshAll();
	};
</script>

<div class="row-collapse" data-collapsed={collapsing}>
	<div>
		<div
			class="group/row flex flex-wrap items-center gap-x-1 gap-y-0 border-b border-border/70 py-1 pr-2 pl-1 transition-colors hover:bg-muted/40 md:flex-nowrap md:pr-3"
		>
			{#if t.childCount > 0}
				<button
					type="button"
					class="grid h-10 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
					aria-expanded={expanded}
					aria-label={expanded ? '收合子任務' : '展開子任務'}
					onclick={toggle}
				>
					<ChevronRightIcon
						class="size-4 transition-transform duration-200 {expanded ? 'rotate-90' : ''} {loading
							? 'animate-pulse'
							: ''}"
					/>
				</button>
			{:else}
				<span class="w-7 shrink-0"></span>
			{/if}
			<CheckCircle
				checked={status === 'done'}
				label={t.title}
				disabled={!editable || busy}
				onclick={toggleDone}
			/>
			<a
				href={resolve('/tasks/[id]', { id: t.id })}
				onclick={onopen ? (e) => onopen(e, t.id) : undefined}
				class="min-w-0 flex-1 basis-40 rounded-md py-2 pl-1 text-[0.95rem] leading-snug font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50
					{status === 'done' ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}"
				>{t.title}</a
			>
			<div class="ml-auto flex items-center gap-2 pl-8 md:ml-0 md:pl-2">
				{#if t.source === 'assigned'}
					<span class="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] text-muted-foreground"
						>被指派</span
					>
				{/if}
				{#if t.childCount > 0}
					<span
						class="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums"
						title="子任務完成數"
					>
						<ListTreeIcon class="size-3.5" aria-hidden="true" />
						<span class="sr-only">子任務</span>{t.doneChildCount}/{t.childCount}
					</span>
				{/if}
				{#if otherParents > 0}
					<span class="hidden text-xs text-muted-foreground lg:inline"
						>{nested ? '另有' : '有'} {otherParents} 個上層任務</span
					>
				{/if}
				<StatusPill {status} {editable} onselect={setStatus} />
				{#if t.dueDate}
					<span
						class="inline-flex h-7 min-w-14 items-center justify-center rounded-full px-2.5 text-xs font-medium tabular-nums
						{overdue ? 'bg-overdue/15 text-overdue' : 'text-muted-foreground'}"
						title={t.dueDate}
					>
						{dueLabel(t.dueDate, today)}{#if overdue}<span class="sr-only">（逾期）</span>{/if}
					</span>
				{/if}
				{#if t.assigneeName}<Avatar name={t.assigneeName} />{/if}
				{#if canDetach}
					<button
						type="button"
						class="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="移除與上層任務的關聯：{t.title}"
						title="移除"
						onclick={() => (confirmOpen = true)}><XIcon class="size-4" /></button
					>
				{/if}
			</div>
		</div>
		{#if canDetach}
			<ConfirmDialog
				bind:open={confirmOpen}
				title="移除「{t.title}」？"
				description="只會移除與上層任務的關聯，任務本身不會被刪除。"
				confirmLabel="移除"
				onconfirm={detach}
			/>
		{/if}
		{#if detachError}<p class="py-1 pl-8 text-sm text-destructive" role="alert">
				{detachError}
			</p>{/if}
		{#if error}<p class="py-1 pl-8 text-sm text-destructive" role="alert">{error}</p>{/if}
		{#if expanded && children}
			<div
				class="ml-5 border-l border-border pl-2"
				transition:slide={{ duration: reduced.current ? 0 : 200 }}
			>
				{#each children as c (c.id)}
					<TaskRow t={c} {today} nested parentId={t.id} {meId} onchange={load} {onopen} />
				{/each}
			</div>
		{/if}
	</div>
</div>
