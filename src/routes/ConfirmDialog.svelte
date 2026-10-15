<script lang="ts">
	import { enhance, type ActionResult } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	// 兩種用法：給 action（+ fields）就送出表單；給 onconfirm 就呼叫它
	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = '確定',
		action,
		fields = {},
		onconfirm,
		onresult
	}: {
		open?: boolean;
		title: string;
		description: string;
		confirmLabel?: string;
		action?: string;
		fields?: Record<string, string>;
		onconfirm?: () => void | Promise<void>;
		// 面板內表單的 action 路徑與目前頁不同，結果要自己處理（預設交給 enhance 的 update）
		onresult?: (result: ActionResult) => Promise<void>;
	} = $props();

	let busy = $state(false);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>取消</AlertDialog.Cancel>
			{#if action}
				<form
					method="post"
					{action}
					use:enhance={() => {
						busy = true;
						return async ({ update, result }) => {
							open = false;
							try {
								await (onresult ? onresult(result) : update());
							} finally {
								busy = false;
							}
						};
					}}
				>
					{#each Object.entries(fields) as [name, value] (name)}
						<input type="hidden" {name} {value} />
					{/each}
					<Button type="submit" variant="destructive" disabled={busy}>{confirmLabel}</Button>
				</form>
			{:else}
				<Button
					type="button"
					variant="destructive"
					disabled={busy}
					onclick={async () => {
						busy = true;
						open = false;
						try {
							await onconfirm?.();
						} finally {
							busy = false;
						}
					}}>{confirmLabel}</Button
				>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
