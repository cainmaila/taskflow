<script lang="ts">
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion as reduced } from 'svelte/motion';
	import {
		dndzone,
		setAriaStrings,
		setKeyboardDragTrigger,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		TRIGGERS,
		type DndEvent
	} from 'svelte-dnd-action';
	import { refreshAll } from '$app/navigation';
	import { toast } from '#lib/toast.svelte.js';
	import BoardCard, { type CardRow } from './BoardCard.svelte';
	import { moveRequest } from './move';
	import { openTask } from './panel';
	import { statusLabel, statusTone, type Status } from './status';

	let {
		rows,
		today,
		ondetach
	}: { rows: CardRow[]; today: string; ondetach?: (t: CardRow) => void } = $props();

	const STATUSES = Object.keys(statusLabel) as Status[];
	const build = (rs: CardRow[]) =>
		Object.fromEntries(STATUSES.map((s) => [s, rs.filter((r) => r.status === s)])) as Record<
			Status,
			CardRow[]
		>;

	// 樂觀更新直接覆寫 cols。拖曳或請求進行中（active）先不套用新的 rows，免得打斷拖曳；
	// 結束後 active 變 false，effect 重跑，cols 就回到 server 最新的樣子（失敗回彈也走這裡）
	let cols = $state.raw(untrack(() => build(rows)));
	let active = $state(false);
	let busy = $state(false);
	$effect(() => {
		const next = build(rows);
		if (!active) cols = next;
	});
	// 祖先編輯者把卡片拖進別欄：目標欄 finalize 先擋下，等來源欄的 finalize 到了再一起還原
	let rejected = false;

	// 空白鍵起拖，Enter 留給卡片本身（標題連結）；提示改成中文
	setKeyboardDragTrigger('space');
	setAriaStrings({
		dragStarted: ({ itemLabel, zoneLabel }) =>
			`開始移動「${itemLabel}」。目前在「${zoneLabel}」，上下鍵調整順序，Tab 切換到別的欄位，空白鍵放下`,
		movedToPosition: ({ itemLabel, zoneLabel, position, count }) =>
			`「${itemLabel}」移到「${zoneLabel}」第 ${position} 個，共 ${count} 個`,
		movedToZoneStart: ({ itemLabel, zoneLabel }) => `「${itemLabel}」移到「${zoneLabel}」最前面`,
		movedToZoneEnd: ({ itemLabel, zoneLabel }) => `「${itemLabel}」移到「${zoneLabel}」最後面`,
		dropped: ({ itemLabel, zoneLabel, position }) =>
			`已放下「${itemLabel}」，位於「${zoneLabel}」第 ${position} 個`,
		zoneActiveInstruction: '按 Tab 選取卡片，按空白鍵開始移動，Enter 開啟任務',
		zoneDragDisabledInstruction: '目前無法移動卡片'
	});

	const commit = async (id: string, status: Status, afterId?: string, beforeId?: string) => {
		busy = true;
		active = true;
		try {
			const err = await moveRequest(id, { status, afterId, beforeId });
			if (err) toast(err, 'error');
			else await refreshAll();
		} finally {
			busy = false;
			active = false;
		}
	};

	const consider = (s: Status) => (e: CustomEvent<DndEvent<CardRow>>) => {
		active = true;
		cols = { ...cols, [s]: e.detail.items };
	};
	const finalize = (s: Status) => (e: CustomEvent<DndEvent<CardRow>>) => {
		const { items, info } = e.detail;
		if (rejected) {
			if (info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
				rejected = false;
				active = false;
				cols = build(rows);
			}
			return;
		}
		const moved = rows.find((r) => r.id === info.id);
		if (
			info.trigger === TRIGGERS.DROPPED_INTO_ZONE &&
			moved &&
			moved.status !== s &&
			!moved.canChangeStatus
		) {
			toast('你只能調整順序，不能改這張卡片的狀態', 'error');
			rejected = true;
			return;
		}
		cols = { ...cols, [s]: items.map((r) => (r.status === s ? r : { ...r, status: s })) };
		// 只有「放進欄位」的那一側要送出；來源欄與放到欄外只需更新畫面
		if (info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) {
			// 放到欄外：回到 server 的樣子；來源欄的通知（DROPPED_INTO_ANOTHER）不需另外處理
			if (info.trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY) active = false;
			return;
		}
		const i = items.findIndex((r) => r.id === info.id);
		const before = build(rows)
			[s].map((r) => r.id)
			.join();
		if (before === items.map((r) => r.id).join()) {
			active = false;
			return;
		}
		commit(info.id, s, items[i - 1]?.id, items[i + 1]?.id);
	};

	// 鍵盤／觸控替代：從狀態選單改狀態，卡片排到目標欄最後。目標欄是空的時沒有鄰居，只改狀態、position 不變（可接受：欄內只有它自己）
	const setStatus = (id: string, next: Status) => {
		const from = STATUSES.find((s) => cols[s].some((r) => r.id === id))!;
		if (from === next || busy) return;
		const card = cols[from].find((r) => r.id === id)!;
		const last = cols[next].at(-1);
		cols = {
			...cols,
			[from]: cols[from].filter((r) => r.id !== id),
			[next]: [...cols[next], { ...card, status: next }]
		};
		commit(id, next, last?.id);
	};

	// 沒有權限的卡片：在 capture 階段攔下起拖事件。鍵盤只攔卡片本身（target 就是外框），
	// 卡片內的按鈕、連結要保留 Space／Enter；它們由 BoardCard 的 keepKeys 擋下起拖
	const guard = (e: Event) => {
		const el = e.target as Element;
		if (e.type === 'keydown' ? el.hasAttribute('data-nomove') : el.closest('[data-nomove]'))
			e.stopPropagation();
	};

	const lift = (el?: HTMLElement) => el?.classList.add('board-lifted');
	const ms = $derived(reduced.current ? 0 : 200);
</script>

<div
	class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:snap-none md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0"
>
	{#each STATUSES as s (s)}
		<section
			class="flex w-[82vw] max-w-80 shrink-0 snap-center flex-col rounded-2xl bg-muted/40 md:w-auto md:max-w-none md:min-w-0"
			aria-labelledby="col-{s}"
		>
			<h2
				id="col-{s}"
				class="flex items-center gap-2 px-3.5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
			>
				<span class="size-2 rounded-full bg-current {statusTone[s]}" aria-hidden="true"></span>
				{statusLabel[s]}
				<span class="font-medium tabular-nums opacity-70">{cols[s].length}</span>
			</h2>
			<div class="relative flex-1">
				{#if cols[s].length === 0}
					<p
						class="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-muted-foreground/80"
					>
						沒有任務
					</p>
				{/if}
				<div
					use:dndzone={{
						items: cols[s],
						type: 'task',
						flipDurationMs: ms,
						dragDisabled: busy,
						delayTouchStart: true,
						dropAnimationDisabled: reduced.current,
						dropTargetStyle: {},
						dropTargetClasses: ['board-drop'],
						transformDraggedElement: lift
					}}
					onconsider={consider(s)}
					onfinalize={finalize(s)}
					onmousedowncapture={guard}
					ontouchstartcapture={guard}
					onkeydowncapture={guard}
					aria-label={statusLabel[s]}
					class="board-zone flex min-h-44 flex-col gap-2 rounded-2xl p-2 transition-colors"
				>
					{#each cols[s] as t (t.id)}
						<div
							animate:flip={{ duration: ms }}
							data-nomove={t.canMove ? undefined : ''}
							aria-label={t.title}
							class="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
						>
							{#if (t as Record<string, unknown>)[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
								<div
									class="h-24 rounded-xl border-2 border-dashed border-primary/60 bg-primary/10"
								></div>
							{:else}
								<BoardCard {t} {today} onopen={openTask} onstatus={setStatus} {ondetach} />
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/each}
</div>

<style>
	/* 影子位置要看得見（dnd-action 預設把它設成 hidden），當作放置預覽 */
	:global(.board-zone [data-is-dnd-shadow-item-internal]) {
		visibility: visible !important;
	}
	:global(.board-drop) {
		background: color-mix(in oklch, var(--primary) 7%, transparent);
	}
	:global(.board-lifted) {
		box-shadow:
			0 18px 40px -10px rgb(0 0 0 / 0.7),
			0 0 0 1px color-mix(in oklch, var(--primary) 55%, transparent);
		rotate: 1.5deg;
		cursor: grabbing;
		opacity: 0.97;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.board-lifted) {
			rotate: none;
		}
	}
</style>
