<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<nav class="border-b">
		<div class="mx-auto flex max-w-3xl items-center gap-4 p-3">
			<a href={resolve('/tasks')} class="font-semibold">我的任務</a>
			<a href={resolve('/tasks/assigned')} class="text-muted-foreground hover:text-foreground"
				>我指派的</a
			>
			<a href={resolve('/members')} class="text-muted-foreground hover:text-foreground">成員</a>
			<span class="ml-auto text-sm text-muted-foreground">{data.user.name}</span>
			<form method="post" action="/members?/signOut" use:enhance>
				<Button type="submit" variant="outline" size="sm">登出</Button>
			</form>
		</div>
	</nav>
{/if}

{@render children()}
