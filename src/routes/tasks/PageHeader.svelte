<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
	<h1 class="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
	{@render children?.()}
</header>
