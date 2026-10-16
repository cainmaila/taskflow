<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head><title>{page.status} - Taskflow</title></svelte:head>

<main class="brand-bg grid min-h-dvh place-items-center px-5 py-12">
	<div class="rise relative z-10 grid max-w-md justify-items-center gap-4 text-center">
		<p
			class="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-8xl font-semibold tracking-tighter text-transparent"
			aria-hidden="true"
		>
			{page.status}
		</p>
		<h1 class="text-2xl font-semibold tracking-tight">
			{page.status === 404 ? '找不到頁面' : '發生錯誤'}
		</h1>
		<p class="text-muted-foreground">
			{page.error?.message && page.error.message !== 'Not Found'
				? page.error.message
				: '這個頁面不存在，或你沒有權限查看。'}
		</p>
		<Button href={resolve('/tasks')} size="lg" class="mt-2 px-5">回到我的任務</Button>
	</div>
</main>
