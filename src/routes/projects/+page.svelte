<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>專案 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4">
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold">專案</h1>
		<Button
			href={data.includeArchived ? resolve('/projects') : '/projects?archived=1'}
			variant="outline"
			size="sm">{data.includeArchived ? '隱藏已封存' : '顯示已封存'}</Button
		>
	</div>

	{#if form?.message}
		<Alert.Root variant="destructive"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{/if}

	{#if data.canCreate}
		<Card.Root>
			<form method="post" action="?/create" use:enhance>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label for="p-name">新增專案</Label>
						<Input id="p-name" name="name" required maxlength={100} value={form?.name ?? ''} />
					</div>
					<div class="space-y-2">
						<Label for="p-desc">描述（Markdown，選填）</Label>
						<Textarea
							id="p-desc"
							name="description"
							rows={3}
							maxlength={20000}
							value={form?.description ?? ''}
						/>
					</div>
					<Button type="submit">建立</Button>
				</Card.Content>
			</form>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content class="divide-y">
			{#each data.projects as p (p.id)}
				<a
					href={resolve('/projects/[id]', { id: p.id })}
					class="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/50"
				>
					<span class="min-w-40 flex-1 font-medium">{p.name}</span>
					{#if p.archivedAt}<Badge variant="outline">已封存</Badge>{/if}
					<Badge variant="secondary">
						{p.myRole === 'owner'
							? '管理者'
							: p.myRole === 'member'
								? '成員'
								: '非成員（系統管理員）'}
					</Badge>
				</a>
			{:else}
				<p class="py-3 text-sm text-muted-foreground">
					{data.canCreate ? '還沒有專案，用上方表單建立第一個。' : '你還沒有加入任何專案。'}
				</p>
			{/each}
		</Card.Content>
	</Card.Root>
</main>
