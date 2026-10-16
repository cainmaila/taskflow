<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	// 登入與邀請共用：桌面左品牌區 + 右表單；手機只留頂部字標 + 表單
	let { title, description, children }: { title: string; description: string; children: Snippet } =
		$props();
</script>

<main class="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
	<aside class="brand-bg hidden flex-col justify-between p-12 lg:flex" aria-hidden="true">
		<Logo class="relative z-10" />
		<div class="relative z-10 max-w-md space-y-4">
			<p class="text-4xl leading-tight font-semibold tracking-tight">
				把事情理清楚，<br />讓團隊一起往前。
			</p>
			<p class="text-base text-muted-foreground">任務、專案與協作，集中在一個安靜、專注的地方。</p>
		</div>
		<p class="relative z-10 text-sm text-muted-foreground">邀請制 · 無公開註冊</p>
	</aside>

	<div class="flex flex-col px-5 py-8 sm:px-10">
		<Logo class="mb-8 lg:hidden" />
		<div class="strong-fields rise m-auto w-full max-w-sm">
			<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
			<p class="mt-1.5 mb-7 text-sm text-muted-foreground">{description}</p>
			{@render children()}
		</div>
	</div>
</main>
