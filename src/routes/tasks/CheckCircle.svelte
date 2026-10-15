<script lang="ts">
	let {
		checked,
		label,
		disabled = false,
		onclick
	}: { checked: boolean; label: string; disabled?: boolean; onclick: () => void } = $props();
</script>

<!-- 外框 40px 為觸控目標，視覺圓圈 22px -->
<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	{onclick}
	class="group/check grid size-10 shrink-0 place-items-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-40"
>
	<span
		class="check-circle grid size-[22px] place-items-center rounded-full border-2 border-muted-foreground text-[#06140d] group-hover/check:border-status-done group-focus-visible/check:ring-3 group-focus-visible/check:ring-ring/60"
		data-checked={checked}
	>
		<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="3.5">
			<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</span>
</button>
