<script lang="ts">
	import { enhance, type ActionResult } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	// version 變了（掛上、移除後頁面資料更新），已搜尋的候選就過期了
	let {
		taskId,
		version,
		onresult
	}: { taskId: string; version: string; onresult: (result: ActionResult) => Promise<void> } =
		$props();

	type Candidate = { id: string; title: string; dueDate: string | null };
	let q = $state('');
	let results = $state<Candidate[] | null>(null);
	let error = $state('');
	let chosen = $state<Candidate | null>(null);
	let scope = $state<{ id: string; name: string }[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let seq = 0;
	let submitting = $state(false);

	let lastVersion: string | null = null;
	$effect(() => {
		const first = lastVersion === null;
		const same = version === lastVersion;
		lastVersion = version;
		if (first || same) return;
		seq++;
		results = null;
		q = '';
	});

	const search = async () => {
		error = '';
		const mine = ++seq; // 只採用最後一次搜尋的結果
		try {
			const res = await fetch(`/tasks/${taskId}/attachable?q=${encodeURIComponent(q)}`);
			if (!res.ok) throw new Error();
			const data = (await res.json()) as Candidate[];
			if (mine === seq) results = data;
		} catch {
			if (mine === seq) error = '搜尋失敗，請再試一次';
		}
	};
	const onInput = () => {
		clearTimeout(timer);
		timer = setTimeout(search, 250);
	};
	const choose = async (c: Candidate) => {
		error = '';
		try {
			const res = await fetch(`/tasks/${taskId}/share-scope?child=${c.id}`);
			if (!res.ok) throw new Error();
			scope = await res.json();
			chosen = c;
			open = true;
		} catch {
			error = '無法取得分享範圍，請再試一次';
		}
	};
</script>

<div class="space-y-2">
	<Label for="attach-q" class="text-muted-foreground">掛上既有任務</Label>
	<Input
		id="attach-q"
		placeholder="輸入標題搜尋你負責或建立的任務"
		bind:value={q}
		oninput={onInput}
		onfocus={() => results ?? search()}
		autocomplete="off"
	/>
	{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
	{#if results}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
			{#each results as c (c.id)}
				<li class="flex items-center gap-2 p-2">
					<span class="flex-1">{c.title}</span>
					<span class="text-sm text-muted-foreground">{c.dueDate}</span>
					<Button type="button" size="sm" variant="outline" onclick={() => choose(c)}>掛上</Button>
				</li>
			{:else}
				<li class="p-2 text-sm text-muted-foreground">沒有可掛上的任務。</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>掛上「{chosen?.title}」？</AlertDialog.Title>
			<AlertDialog.Description>
				{#if scope.length}
					此任務將對 {scope.map((u) => u.name).join('、')} 可見。
				{:else}
					目前能看到這個任務的人都已能看到上層任務，不會有新的人看到。
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>取消</AlertDialog.Cancel>
			<form
				method="post"
				action="/tasks/{taskId}?/attach"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						open = false;
						results = null;
						q = '';
						seq++;
						try {
							await onresult(result);
						} finally {
							submitting = false;
						}
					};
				}}
			>
				<input type="hidden" name="childId" value={chosen?.id ?? ''} />
				<Button type="submit" disabled={submitting}>確認掛上</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
