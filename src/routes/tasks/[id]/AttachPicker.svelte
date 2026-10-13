<script lang="ts">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { taskId }: { taskId: string } = $props();

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
	<Label for="attach-q">掛上既有任務</Label>
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
		<ul class="divide-y rounded-md border">
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
					不會有新的人看到這個任務。
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>取消</AlertDialog.Cancel>
			<form
				method="post"
				action="?/attach"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						open = false;
						results = null;
						q = '';
						seq++;
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="childId" value={chosen?.id ?? ''} />
				<Button type="submit" disabled={submitting}>確認掛上</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
