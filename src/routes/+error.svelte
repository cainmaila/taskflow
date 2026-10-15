<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head><title>{page.status} - Taskflow</title></svelte:head>

<main class="mx-auto grid min-h-[70vh] max-w-md content-center justify-items-start gap-4 p-6">
	<h1 class="text-2xl font-semibold">{page.status === 404 ? '找不到頁面' : '發生錯誤'}</h1>
	<p class="text-muted-foreground">
		{page.status === 404 ? '這個頁面不存在，或你沒有權限查看。' : page.error?.message}
	</p>
	<Button href={resolve('/tasks')}>回到我的任務</Button>
</main>
