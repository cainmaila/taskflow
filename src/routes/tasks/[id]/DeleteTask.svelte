<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	type Plan =
		| { childCount: 0; commentCount: number }
		| {
				childCount: number;
				commentCount: number;
				single: { becomingTopLevel: number };
				tree: {
					willDelete: number;
					commentCount: number;
					keptShared: number;
					keptNotMine: number;
					becomingTopLevel: number;
				} | null;
		  };
	type Preview = { plan: Plan; keys: { single: string; tree: string } };

	let { taskId }: { taskId: string } = $props();

	let open = $state(false);
	let preview = $state<Preview | null>(null);
	let error = $state('');
	let ack = $state(false);

	// 表單都帶著使用者看到的預覽（expect）；伺服器重算不一致會回 409，這時重抓預覽請使用者再確認
	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure' && result.status === 409) {
				const message = (result.data as { message: string }).message;
				if (await load()) error = message;
				return;
			}
			await update();
		};

	const load = async () => {
		error = '';
		try {
			const res = await fetch(`/tasks/${taskId}/delete-plan`);
			if (!res.ok) throw new Error();
			preview = await res.json();
			ack = false;
			return true;
		} catch {
			error = '無法取得刪除預覽，請再試一次';
			return false;
		}
	};
	const show = async () => {
		if (await load()) open = true;
	};
</script>

<Button type="button" variant="destructive" onclick={show}>刪除任務</Button>
{#if error && !open}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		{#if preview}
			{@const plan = preview.plan}
			<AlertDialog.Header>
				<AlertDialog.Title>
					{'single' in plan ? `這個任務有 ${plan.childCount} 個子任務` : '刪除這個任務？'}
				</AlertDialog.Title>
				<AlertDialog.Description>
					刪除後無法復原。{#if plan.commentCount}將一併刪除 {plan.commentCount} 則留言。{/if}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			{#if !('single' in plan)}
				<form method="post" action="?/delete" use:enhance={submit}>
					<input type="hidden" name="mode" value="single" />
					<input type="hidden" name="expect" value={preview.keys.single} />
					<Button type="submit" variant="destructive">確定刪除</Button>
				</form>
			{:else}
				<div class="space-y-5 text-sm">
					<form method="post" action="?/delete" use:enhance={submit} class="space-y-2">
						<input type="hidden" name="mode" value="single" />
						<input type="hidden" name="expect" value={preview.keys.single} />
						<p>
							只刪除這個任務，子任務保留；將一併刪除 {plan.commentCount} 則留言；{plan.single
								.becomingTopLevel} 個子任務會失去上層任務並成為頂層任務。
						</p>
						<Button type="submit" variant="outline">只刪這個</Button>
					</form>
					<form
						method="post"
						action="?/delete"
						use:enhance={submit}
						class="space-y-2 border-t pt-4"
					>
						<input type="hidden" name="mode" value="tree" />
						<input type="hidden" name="expect" value={preview.keys.tree} />
						{#if plan.tree}
							<p>
								連同子任務一起刪除，共 {plan.tree.willDelete} 個任務，將一併刪除 {plan.tree
									.commentCount} 則留言。共用的 {plan.tree.keptShared} 個子任務會保留，
								{plan.tree.keptNotMine} 個不是你建立的任務會保留；{plan.tree.becomingTopLevel} 個保留的任務會成為頂層任務。
							</p>
							<Label class="flex items-center gap-2 font-normal">
								<Checkbox bind:checked={ack} />我了解整棵刪除無法復原
							</Label>
							<Button type="submit" variant="destructive" disabled={!ack}>整棵刪除</Button>
						{:else}
							<p class="text-muted-foreground">子任務過多，無法整棵刪除。</p>
						{/if}
					</form>
				</div>
			{/if}
		{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel>取消</AlertDialog.Cancel>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
