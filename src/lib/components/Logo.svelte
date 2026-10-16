<script lang="ts">
	let { class: cls = '' }: { class?: string } = $props();
</script>

<span class="inline-flex items-center gap-2.5 text-[1.05rem] font-semibold tracking-tight {cls}">
	<span
		class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
		aria-hidden="true"
	>
		<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3">
			<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</span>
	Taskflow
</span>
