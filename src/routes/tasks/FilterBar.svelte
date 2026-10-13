<script lang="ts">
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { statusLabel } from './status';

	let {
		filters,
		showSource = true,
		clearHref
	}: {
		filters: { statuses: string[]; source: string; due: string };
		showSource?: boolean;
		clearHref: string;
	} = $props();
</script>

<form method="get" class="flex flex-wrap items-end gap-4">
	<fieldset class="space-y-2">
		<legend class="text-sm font-medium">狀態</legend>
		<div class="flex flex-wrap gap-3">
			{#each Object.entries(statusLabel) as [value, label] (value)}
				<Label class="flex items-center gap-1.5 font-normal">
					<Checkbox name="status" {value} checked={filters.statuses.includes(value)} />{label}
				</Label>
			{/each}
		</div>
	</fieldset>
	{#if showSource}
		<div class="space-y-2">
			<Label for="f-source">來源</Label>
			<NativeSelect.Root id="f-source" name="source" value={filters.source}>
				<NativeSelect.Option value="all">全部</NativeSelect.Option>
				<NativeSelect.Option value="own">自己建</NativeSelect.Option>
				<NativeSelect.Option value="assigned">被指派</NativeSelect.Option>
			</NativeSelect.Root>
		</div>
	{/if}
	<div class="space-y-2">
		<Label for="f-due">到期</Label>
		<NativeSelect.Root id="f-due" name="due" value={filters.due}>
			<NativeSelect.Option value="all">全部</NativeSelect.Option>
			<NativeSelect.Option value="overdue">已逾期</NativeSelect.Option>
			<NativeSelect.Option value="week">本週</NativeSelect.Option>
		</NativeSelect.Root>
	</div>
	<Button type="submit" variant="secondary">篩選</Button>
	<Button href={clearHref} variant="ghost">清除</Button>
</form>
