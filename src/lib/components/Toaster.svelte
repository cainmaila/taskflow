<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/circle-check';
	import AlertIcon from '@lucide/svelte/icons/circle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { dismiss, toasts } from '#lib/toast.svelte.js';
</script>

<!-- aria-live 區域必須常駐，訊息才會被朗讀 -->
<div
	class="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:bottom-6 md:items-end"
	role="status"
	aria-live="polite"
	aria-atomic="false"
>
	{#each toasts as t (t.id)}
		<div
			class="pointer-events-auto flex max-w-sm min-w-60 [animation:toast-in_var(--dur-base)_var(--ease-spring)] items-center gap-2.5 rounded-xl bg-popover py-2.5 pr-2 pl-3.5 text-sm text-popover-foreground shadow-pop"
		>
			{#if t.kind === 'error'}
				<AlertIcon class="size-4 shrink-0 text-overdue" aria-hidden="true" />
			{:else}
				<CheckIcon class="size-4 shrink-0 text-status-done" aria-hidden="true" />
			{/if}
			<span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{t.message}</span>
			{#if t.action}
				{@const act = t.action}
				<button
					type="button"
					class="h-10 shrink-0 rounded-md px-3 text-sm font-semibold text-primary transition-colors hover:bg-muted md:h-8"
					onclick={() => {
						dismiss(t.id);
						act.run();
					}}>{act.label}</button
				>
			{/if}
			<button
				type="button"
				class="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-8"
				aria-label="關閉通知"
				onclick={() => dismiss(t.id)}><XIcon class="size-4" /></button
			>
		</div>
	{/each}
</div>
