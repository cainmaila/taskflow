<script lang="ts">
	import { enhance, type SubmitFunction, type ActionResult } from '$app/forms';
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

	let { taskId, onresult }: { taskId: string; onresult: (result: ActionResult) => Promise<void> } =
		$props();

	let open = $state(false);
	let preview = $state<Preview | null>(null);
	let error = $state('');
	let ack = $state(false);
	let mode = $state<'single' | 'tree'>('single');

	// 表單都帶著使用者看到的預覽（expect）；伺服器重算不一致會回 409，這時重抓預覽請使用者再確認
	const submit: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type === 'failure' && result.status === 409) {
				const message = (result.data as { message: string }).message;
				if (await load()) error = message;
				return;
			}
			open = false;
			await onresult(result);
		};

	const load = async () => {
		error = '';
		try {
			const res = await fetch(`/tasks/${taskId}/delete-plan`);
			if (!res.ok) throw new Error();
			preview = await res.json();
			ack = false;
			mode = 'single';
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
			{@const hasChildren = 'single' in plan}
			{@const effective = hasChildren ? mode : 'single'}
			<AlertDialog.Header>
				<AlertDialog.Title>
					{hasChildren ? `這個任務有 ${plan.childCount} 個子任務` : '刪除這個任務？'}
				</AlertDialog.Title>
				<AlertDialog.Description>
					刪除後無法復原。{#if plan.commentCount}將一併刪除 {plan.commentCount} 則留言。{/if}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			{#if 'single' in plan}
				<fieldset class="space-y-2 text-sm">
					<legend class="sr-only">刪除範圍</legend>
					<label
						class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10"
					>
						<input type="radio" bind:group={mode} value="single" class="mt-0.5" />
						<span
							><span class="font-medium">只刪除這個任務</span><br />
							<span class="text-muted-foreground"
								>子任務保留；{plan.single.becomingTopLevel} 個子任務會失去上層任務並成為頂層任務。</span
							></span
						>
					</label>
					<label
						class="flex min-h-11 items-start gap-2.5 rounded-lg border border-border p-3 has-[:checked]:border-destructive/60 has-[:checked]:bg-destructive/10 {plan.tree
							? 'cursor-pointer'
							: 'opacity-50'}"
					>
						<input
							type="radio"
							bind:group={mode}
							value="tree"
							disabled={!plan.tree}
							class="mt-0.5"
						/>
						<span>
							<span class="font-medium">連同子任務一起刪除</span><br />
							<span class="text-muted-foreground">
								{#if plan.tree}
									共 {plan.tree.willDelete} 個任務，將一併刪除 {plan.tree.commentCount} 則留言。共用的
									{plan.tree.keptShared} 個子任務會保留，{plan.tree.keptNotMine} 個不是你建立的任務會保留；{plan
										.tree.becomingTopLevel} 個保留的任務會成為頂層任務。
								{:else}
									子任務過多，無法整棵刪除。
								{/if}
							</span>
						</span>
					</label>
					{#if effective === 'tree'}
						<Label class="flex min-h-11 items-center gap-2 font-normal">
							<Checkbox bind:checked={ack} />我了解整棵刪除無法復原
						</Label>
					{/if}
				</fieldset>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>取消</AlertDialog.Cancel>
				<form method="post" action="/tasks/{taskId}?/delete" use:enhance={submit}>
					<input type="hidden" name="mode" value={effective} />
					<input type="hidden" name="expect" value={preview.keys[effective]} />
					<Button
						type="submit"
						variant="destructive"
						disabled={effective === 'tree' && !ack}
						class="w-full sm:w-auto">{effective === 'tree' ? '整棵刪除' : '確定刪除'}</Button
					>
				</form>
			</AlertDialog.Footer>
		{:else}
			<AlertDialog.Footer><AlertDialog.Cancel>取消</AlertDialog.Cancel></AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
