<script lang="ts">
	import { enhance, type ActionResult } from '$app/forms';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import ConfirmDialog from '../../ConfirmDialog.svelte';

	type Item = {
		id: string;
		body: string;
		createdAt: Date;
		editedAt: Date | null;
		authorName: string;
		canEdit: boolean;
		canDelete: boolean;
	};
	type CommentError = { kind: 'add' | 'edit' | 'delete'; commentId: string };
	let {
		taskId,
		comments,
		form,
		onresult
	}: {
		taskId: string;
		onresult: (result: ActionResult, form?: HTMLFormElement) => Promise<void>;
		comments: Item[];
		form?: { message?: string; commentError?: CommentError } | null;
	} = $props();
	const err = (kind: CommentError['kind'], commentId = '') =>
		form?.commentError?.kind === kind && form.commentError.commentId === commentId
			? form.message
			: undefined;

	let editingId = $state<string | null>(null);
	let deleting = $state<Item | null>(null);

	// 固定時區，避免伺服器與瀏覽器渲染結果不同
	const fmt = (d: Date) =>
		new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
</script>

<section class="space-y-3">
	<h2 class="text-base font-semibold">
		留言
		{#if comments.length}<span class="text-sm font-normal text-muted-foreground"
				>{comments.length} 則</span
			>{/if}
	</h2>
	{#if err('delete', form?.commentError?.commentId)}
		<Alert.Root variant="destructive"
			><Alert.Description>{form?.message}</Alert.Description></Alert.Root
		>
	{/if}
	<ul class="space-y-3">
		{#each comments as c (c.id)}
			<li class="space-y-2 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class="font-medium">{c.authorName}</span>
					<span class="text-muted-foreground">{fmt(c.createdAt)}</span>
					{#if c.editedAt}<span class="text-xs text-muted-foreground">（已編輯）</span>{/if}
					<span class="flex-1"></span>
					{#if c.canEdit && editingId !== c.id}
						<Button type="button" size="sm" variant="ghost" onclick={() => (editingId = c.id)}
							>編輯</Button
						>
					{/if}
					{#if c.canDelete}
						<Button type="button" size="sm" variant="ghost" onclick={() => (deleting = c)}
							>刪除</Button
						>
					{/if}
				</div>
				{#if editingId === c.id}
					<form
						method="post"
						action="/tasks/{taskId}?/editComment"
						use:enhance={() =>
							async ({ result }) => {
								if (result.type === 'success') editingId = null;
								await onresult(result);
							}}
						class="space-y-2"
					>
						<input type="hidden" name="commentId" value={c.id} />
						<Textarea name="body" required maxlength={5000} rows={4} value={c.body} />
						{#if err('edit', c.id)}
							<Alert.Root variant="destructive"
								><Alert.Description>{form?.message}</Alert.Description></Alert.Root
							>
						{/if}
						<div class="flex gap-2">
							<Button type="submit" size="sm">儲存</Button>
							<Button type="button" size="sm" variant="outline" onclick={() => (editingId = null)}
								>取消</Button
							>
						</div>
					</form>
				{:else}
					<div class="prose prose-sm max-w-none dark:prose-invert">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown 已消毒 -->
						{@html renderMarkdown(c.body)}
					</div>
				{/if}
			</li>
		{:else}
			<li class="text-sm text-muted-foreground">還沒有留言。</li>
		{/each}
	</ul>
	<form
		method="post"
		action="/tasks/{taskId}?/addComment"
		use:enhance={() =>
			async ({ result, formElement }) =>
				onresult(result, formElement)}
		class="space-y-2"
	>
		<Label for="comment-body">新增留言（Markdown）</Label>
		<Textarea id="comment-body" name="body" required maxlength={5000} rows={3} />
		{#if err('add')}
			<Alert.Root variant="destructive"
				><Alert.Description>{form?.message}</Alert.Description></Alert.Root
			>
		{/if}
		<Button type="submit">送出</Button>
	</form>
</section>

<ConfirmDialog
	bind:open={() => deleting !== null, (v) => !v && (deleting = null)}
	title="刪除這則留言？"
	description="刪除後無法復原。"
	confirmLabel="刪除"
	action="/tasks/{taskId}?/deleteComment"
	fields={{ commentId: deleting?.id ?? '' }}
	{onresult}
/>
