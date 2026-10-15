<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let revoking = $state<(typeof data.pendingInvitations)[number] | null>(null);

	const roleLabel: Record<string, string> = {
		system_admin: '系統管理員',
		manager: '管理人',
		member: '一般用戶'
	};
</script>

<svelte:head><title>成員 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">成員</h1>
	</div>

	{#if form?.message}
		<Alert.Root variant="destructive"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{/if}

	{#if data.canInvite}
		<Card.Root>
			<Card.Header>
				<Card.Title>建立邀請</Card.Title>
				<Card.Description>產生一次性連結（7 天有效），請自行轉交對方。</Card.Description>
			</Card.Header>
			<form method="post" action="?/invite" use:enhance>
				<Card.Content class="flex flex-wrap items-end gap-4">
					<div class="min-w-48 flex-1 space-y-2">
						<Label for="invite-email">Email</Label>
						<Input id="invite-email" name="email" type="email" required />
					</div>
					<div class="space-y-2">
						<Label for="invite-role">角色</Label>
						<NativeSelect.Root id="invite-role" name="role">
							<NativeSelect.Option value="member">一般用戶</NativeSelect.Option>
							<NativeSelect.Option value="manager">管理人</NativeSelect.Option>
						</NativeSelect.Root>
					</div>
					<Button type="submit">建立邀請</Button>
				</Card.Content>
			</form>
			{#if form?.inviteLink}
				<Card.Footer class="mt-4 flex-col items-stretch gap-2">
					<Label for="invite-link">邀請連結（僅顯示這一次）</Label>
					<div class="flex gap-2">
						<Input id="invite-link" readonly value={form.inviteLink} />
						<Button
							type="button"
							variant="secondary"
							onclick={() => navigator.clipboard.writeText(form.inviteLink)}>複製</Button
						>
					</div>
				</Card.Footer>
			{/if}
		</Card.Root>
	{/if}

	{#if data.canInvite}
		<Card.Root>
			<Card.Header><Card.Title>待使用的邀請</Card.Title></Card.Header>
			<Card.Content class="divide-y">
				{#each data.pendingInvitations as inv (inv.id)}
					<div class="flex flex-wrap items-center gap-3 py-3">
						<div class="min-w-48 flex-1">
							<div class="font-medium">{inv.email}</div>
							<div class="text-sm text-muted-foreground">
								邀請人 {inv.inviterName}・{new Date(inv.expiresAt).toLocaleDateString('zh-TW')} 到期
							</div>
						</div>
						<Badge variant="secondary">{roleLabel[inv.role] ?? inv.role}</Badge>
						{#if inv.invitedBy === data.me.id || data.canManage}
							<Button type="button" variant="outline" size="sm" onclick={() => (revoking = inv)}
								>撤銷</Button
							>
						{/if}
					</div>
				{:else}
					<p class="py-3 text-sm text-muted-foreground">目前沒有待使用的邀請。</p>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content class="divide-y">
			{#each data.members as m (m.id)}
				<div class="flex flex-wrap items-center gap-3 py-3">
					<div class="min-w-48 flex-1">
						<div class="font-medium">{m.name}</div>
						<div class="text-sm text-muted-foreground">{m.email}</div>
					</div>
					<Badge variant="secondary">{roleLabel[m.role ?? 'member'] ?? m.role}</Badge>
					{#if m.banned}<Badge variant="destructive">已停用</Badge>{/if}
					{#if data.canManage && m.id !== data.me.id}
						<form method="post" action="?/setRole" use:enhance class="flex gap-2">
							<input type="hidden" name="userId" value={m.id} />
							<NativeSelect.Root name="role" value={m.role ?? 'member'} aria-label="角色">
								{#each Object.entries(roleLabel) as [value, label] (value)}
									<NativeSelect.Option {value}>{label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
							<Button type="submit" variant="outline" size="sm">變更</Button>
						</form>
						<form method="post" action="?/setBanned" use:enhance>
							<input type="hidden" name="userId" value={m.id} />
							<input type="hidden" name="banned" value={m.banned ? 'false' : 'true'} />
							<Button type="submit" variant={m.banned ? 'secondary' : 'destructive'} size="sm">
								{m.banned ? '啟用' : '停用'}
							</Button>
						</form>
					{/if}
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
	<ConfirmDialog
		bind:open={() => revoking !== null, (v) => !v && (revoking = null)}
		title="撤銷邀請？"
		description="{revoking?.email ?? ''} 的邀請連結會立即失效。"
		confirmLabel="撤銷"
		action="?/revoke"
		fields={{ id: revoking?.id ?? '' }}
	/>
</main>
