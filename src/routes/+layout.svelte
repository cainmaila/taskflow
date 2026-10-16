<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/inter';
	import { enhance } from '$app/forms';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import UsersIcon from '@lucide/svelte/icons/users';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import Toaster from '#lib/components/Toaster.svelte';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// 支援 View Transitions 才用；同一頁只改查詢字串（篩選）時不做，以免整頁閃爍
	onNavigate((nav) => {
		// 開關側滑面板是 shallow routing，不做整頁轉場（快照會吞掉指標事件）
		const panel = (p?: string) => p?.startsWith('/tasks/') && !p.startsWith('/tasks/assigned');
		if (
			!document.startViewTransition ||
			!nav.to ||
			nav.from?.url.pathname === nav.to.url.pathname ||
			(panel(nav.to.url.pathname) && !panel(nav.from?.url.pathname)) ||
			(panel(nav.from?.url.pathname) && !panel(nav.to.url.pathname) && nav.type === 'popstate')
		)
			return;
		return new Promise((done) => {
			document.startViewTransition(async () => {
				done();
				await nav.complete;
			});
		});
	});

	const path = $derived(page.url.pathname);
	const items = $derived([
		{
			href: resolve('/tasks'),
			label: '我的任務',
			icon: ListChecksIcon,
			active:
				path === '/tasks' || (path.startsWith('/tasks/') && !path.startsWith('/tasks/assigned'))
		},
		{
			href: resolve('/tasks/assigned'),
			label: '我指派的',
			icon: UserCheckIcon,
			active: path.startsWith('/tasks/assigned')
		},
		{
			href: resolve('/projects'),
			label: '專案',
			icon: FolderKanbanIcon,
			active: path.startsWith('/projects')
		},
		{
			href: resolve('/members'),
			label: '成員',
			icon: UsersIcon,
			active: path.startsWith('/members')
		}
	]);
	const initial = $derived(data.user?.name.trim().slice(0, 1).toUpperCase() ?? '');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#snippet signOut(cls: string)}
	<form method="post" action="/members?/signOut" use:enhance>
		<button type="submit" class={cls} aria-label="登出" title="登出">
			<LogOutIcon class="size-4" aria-hidden="true" />
		</button>
	</form>
{/snippet}

{#if data.user}
	<a
		href="#main"
		class="sr-only z-[200] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
		>跳到主要內容</a
	>

	<!-- 桌面側欄 -->
	<aside
		class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar px-3 py-4 md:flex"
	>
		<a
			href={resolve('/tasks')}
			class="mb-5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[1.05rem] font-semibold tracking-tight"
		>
			<span
				class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
				aria-hidden="true"
			>
				<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3">
					<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</span>
			Taskflow
		</a>
		<nav aria-label="主要導覽" class="flex flex-col gap-0.5">
			{#each items as it (it.href)}
				<a
					href={it.href}
					aria-current={it.active ? 'page' : undefined}
					class="group relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors
						{it.active
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
				>
					{#if it.active}
						<span class="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-primary"></span>
					{/if}
					<it.icon class="size-[18px] {it.active ? 'text-primary' : ''}" aria-hidden="true" />
					{it.label}
				</a>
			{/each}
		</nav>
		<div class="mt-auto flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
			<span
				class="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold"
				aria-hidden="true">{initial}</span
			>
			<span class="min-w-0 flex-1 truncate text-sm">{data.user.name}</span>
			{@render signOut(
				'grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
			)}
		</div>
	</aside>

	<!-- 手機頂欄 -->
	<header
		class="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-border bg-sidebar/90 px-4 backdrop-blur md:hidden"
	>
		<span
			class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
			aria-hidden="true"
		>
			<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3">
				<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</span>
		<span class="font-semibold tracking-tight">Taskflow</span>
		<span class="ml-auto max-w-32 truncate text-sm text-muted-foreground">{data.user.name}</span>
		{@render signOut(
			'grid size-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
		)}
	</header>

	<!-- 手機底部導航 -->
	<nav
		aria-label="主要導覽"
		class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
	>
		{#each items as it (it.href)}
			<a
				href={it.href}
				aria-current={it.active ? 'page' : undefined}
				class="flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition-colors
					{it.active ? 'text-primary' : 'text-muted-foreground active:text-foreground'}"
			>
				<it.icon class="size-5" aria-hidden="true" />
				{it.label}
			</a>
		{/each}
	</nav>

	<div id="main" class="pb-24 md:pb-0 md:pl-60">
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}

<Toaster />
