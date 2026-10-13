<script lang="ts">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	type Plan =
		| { childCount: 0 }
		| {
				childCount: number;
				single: { becomingTopLevel: number };
				tree: {
					willDelete: number;
					keptShared: number;
					keptNotMine: number;
					becomingTopLevel: number;
				} | null;
		  };

	let { plan }: { plan: Plan } = $props();
</script>

{#if !('single' in plan)}
	<form
		method="post"
		action="?/delete"
		use:enhance={({ cancel }) => {
			if (!confirm('確定要刪除這個任務嗎？此動作無法復原。')) cancel();
		}}
	>
		<Button type="submit" variant="destructive">刪除任務</Button>
	</form>
{:else}
	<AlertDialog.Root>
		<AlertDialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="destructive">刪除任務</Button>
			{/snippet}
		</AlertDialog.Trigger>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>這個任務有 {plan.childCount} 個子任務</AlertDialog.Title>
				<AlertDialog.Description>請選擇刪除方式，刪除後無法復原。</AlertDialog.Description>
			</AlertDialog.Header>
			<div class="space-y-4 text-sm">
				<form method="post" action="?/delete" use:enhance class="space-y-2">
					<input type="hidden" name="mode" value="single" />
					<p>
						只刪除這個任務，子任務保留；{plan.single.becomingTopLevel} 個子任務會失去 parent 並成為頂層任務。
					</p>
					<Button type="submit" variant="destructive">只刪這個</Button>
				</form>
				<form method="post" action="?/delete" use:enhance class="space-y-2">
					<input type="hidden" name="mode" value="tree" />
					{#if plan.tree}
						<p>
							連同子任務一起刪除，共 {plan.tree.willDelete} 個任務。共用的 {plan.tree.keptShared} 個子任務會保留，
							{plan.tree.keptNotMine} 個不是你建立的任務會保留；{plan.tree.becomingTopLevel} 個保留的任務會成為頂層任務。
						</p>
						<Button type="submit" variant="destructive">整棵刪除</Button>
					{:else}
						<p class="text-muted-foreground">子任務過多，無法整棵刪除。</p>
					{/if}
				</form>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>取消</AlertDialog.Cancel>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}
