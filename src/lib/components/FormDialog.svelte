<script lang="ts">
	import { Dialog } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	// 一般表單用的置中 Dialog；焦點陷阱、Esc、點遮罩關閉由 bits-ui 處理
	let {
		open = $bindable(false),
		title,
		description,
		onclosed,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		// 關閉動畫結束後呼叫（清除一次性內容、重置表單）
		onclosed?: () => void;
		children: Snippet;
	} = $props();
	let content = $state<HTMLElement | null>(null);
</script>

<Dialog.Root bind:open onOpenChangeComplete={(o) => !o && onclosed?.()}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			bind:ref={content}
			onOpenAutoFocus={(e) => {
				// 預設聚焦在關閉鈕；改聚焦第一個欄位
				const f = content?.querySelector<HTMLElement>('input,textarea,select');
				if (f) {
					e.preventDefault();
					f.focus();
				}
			}}
			class="strong-fields fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-y-auto rounded-2xl bg-popover p-5 text-popover-foreground shadow-pop duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-sm:top-4 max-sm:translate-y-0 sm:-translate-y-1/2 md:p-6"
		>
			<div class="mb-4 flex items-start justify-between gap-3">
				<div class="space-y-1">
					<Dialog.Title class="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="text-sm text-muted-foreground"
							>{description}</Dialog.Description
						>
					{/if}
				</div>
				<Dialog.Close
					class="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-label="關閉"><XIcon class="size-5" /></Dialog.Close
				>
			</div>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
