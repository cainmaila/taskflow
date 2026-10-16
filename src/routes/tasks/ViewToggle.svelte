<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { page } from '$app/state';
	import KanbanIcon from '@lucide/svelte/icons/columns-3';
	import ListIcon from '@lucide/svelte/icons/list';

	// 切換 List／Board，保留其他篩選參數（?view=board 才是 Board，List 為預設不帶參數）
	const hrefFor = (view: 'list' | 'board') => {
		const qs = new SvelteURLSearchParams(page.url.search);
		if (view === 'board') qs.set('view', 'board');
		else qs.delete('view');
		const q = qs.toString();
		return q ? `${page.url.pathname}?${q}` : page.url.pathname;
	};
	const board = $derived(page.url.searchParams.get('view') === 'board');
	const item =
		'inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors md:h-9';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- 連結指向目前路由（pathname），只換 query -->
<nav
	aria-label="檢視方式"
	class="inline-flex gap-0.5 rounded-xl border border-border bg-card p-0.5"
>
	{#each [{ v: 'list', label: '清單', Icon: ListIcon }, { v: 'board', label: '看板', Icon: KanbanIcon }] as const as o (o.v)}
		{@const current = (o.v === 'board') === board}
		<a
			href={hrefFor(o.v)}
			aria-current={current ? 'page' : undefined}
			data-sveltekit-noscroll
			data-sveltekit-replacestate
			class="{item} outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {current
				? 'bg-secondary text-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<o.Icon class="size-4" aria-hidden="true" />{o.label}
		</a>
	{/each}
</nav>
