<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check-big';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TaskRow, { type Row } from './TaskRow.svelte';
	import { groupByDue } from './group';
	import { openTask } from './panel';

	let {
		active,
		done,
		today,
		meId,
		doneOpen = false,
		empty
	}: {
		active: Row[];
		done: Row[];
		today: string;
		meId?: string;
		doneOpen?: boolean;
		empty: string;
	} = $props();

	const sections = $derived(groupByDue(active, today));
</script>

{#each sections as s (s.key)}
	<section class="mb-6" aria-labelledby="sec-{s.key}">
		<h2
			id="sec-{s.key}"
			class="flex items-center gap-2 border-b border-border px-1 pb-2 text-xs font-semibold tracking-wide uppercase
				{s.key === 'overdue' ? 'text-overdue' : 'text-muted-foreground'}"
		>
			{s.label}
			<span class="font-medium tabular-nums opacity-70">{s.rows.length}</span>
		</h2>
		{#each s.rows as t (t.id)}
			<TaskRow {t} {today} {meId} onopen={openTask} />
		{/each}
	</section>
{:else}
	<div class="grid place-items-center gap-2 py-16 text-center">
		<CircleCheckIcon class="size-10 text-muted-foreground/50" aria-hidden="true" />
		<p class="max-w-xs text-sm text-muted-foreground">{empty}</p>
	</div>
{/each}

{#if done.length}
	<details open={doneOpen} class="group/done mt-2">
		<summary
			class="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
		>
			<ChevronRightIcon
				class="size-4 transition-transform duration-200 group-open/done:rotate-90"
				aria-hidden="true"
			/>
			已完成
			<span class="font-medium tabular-nums opacity-70">{done.length}</span>
		</summary>
		<div class="border-t border-border">
			{#each done as t (t.id)}
				<TaskRow {t} {today} {meId} onopen={openTask} />
			{/each}
		</div>
	</details>
{/if}
