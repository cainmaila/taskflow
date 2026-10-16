<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion as reduced } from 'svelte/motion';

	let {
		checked,
		label,
		disabled = false,
		onclick
	}: { checked: boolean; label: string; disabled?: boolean; onclick: () => void } = $props();

	// 只在「未完成 → 完成」的轉換播放爆開；初次渲染已完成的不播。reduced-motion 直接切換
	let burst = $state(false);
	let prev = untrack(() => checked);
	$effect(() => {
		const now = checked;
		const was = prev;
		prev = now;
		// 回滾（勾選又被取消）要立刻清掉，否則 burst 卡住，下次勾選不會重播
		if (!now) {
			burst = false;
			return;
		}
		if (was || reduced.current) return;
		burst = true;
		const id = setTimeout(() => (burst = false), 700);
		return () => clearTimeout(id);
	});
</script>

<!-- 外框 44px 為觸控目標，視覺圓圈 22px -->
<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	{onclick}
	class="group/check relative grid size-11 shrink-0 place-items-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-40 md:size-10"
>
	<span
		class="check-circle grid size-[22px] place-items-center rounded-full border-2 border-muted-foreground text-[#06140d] group-hover/check:border-status-done group-focus-visible/check:ring-3 group-focus-visible/check:ring-ring group-focus-visible/check:ring-offset-2 group-focus-visible/check:ring-offset-background"
		data-checked={checked}
	>
		<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="3.5">
			<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</span>
	{#if burst}
		<span class="check-burst" aria-hidden="true">
			{#each [0, 1, 2, 3, 4, 5] as i (i)}<i style="--a: {i * 60}deg"></i>{/each}
		</span>
	{/if}
</button>
