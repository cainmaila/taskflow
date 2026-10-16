<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { statusLabel, statusTone, type Status } from './status';

	let {
		status,
		editable = true,
		onselect
	}: { status: Status; editable?: boolean; onselect: (s: Status) => void } = $props();

	// 手機觸控目標 ≥44px：用偽元素擴大命中區，不改視覺大小
	const pill =
		'relative after:absolute after:inset-x-0 after:-inset-y-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 text-xs font-medium whitespace-nowrap';
</script>

{#snippet dot(s: Status)}
	<span class="size-2 rounded-full bg-current {statusTone[s]}" aria-hidden="true"></span>
{/snippet}

{#if editable}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="{pill} transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring data-[state=open]:bg-muted"
			aria-label="狀態：{statusLabel[status]}，點擊變更"
		>
			{@render dot(status)}{statusLabel[status]}
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				align="start"
				sideOffset={6}
				class="z-[70] min-w-36 rounded-xl bg-popover p-1 text-sm text-popover-foreground shadow-pop data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
			>
				{#each Object.entries(statusLabel) as [value, label] (value)}
					<DropdownMenu.Item
						class="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 outline-none data-highlighted:bg-muted md:h-9"
						onSelect={() => onselect(value as Status)}
					>
						{@render dot(value as Status)}
						<span class="flex-1">{label}</span>
						{#if value === status}<CheckIcon class="size-4 text-muted-foreground" />{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
{:else}
	<span class={pill}>{@render dot(status)}{statusLabel[status]}</span>
{/if}
