<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { DropdownMenu } from 'bits-ui';
	import { tick } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import MailPlusIcon from '@lucide/svelte/icons/mail-plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import FormDialog from '#lib/components/FormDialog.svelte';
	import { toast } from '#lib/toast.svelte.js';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import Avatar from '../tasks/Avatar.svelte';
	import PageHeader from '../tasks/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// onconfirm 執行時 banning 已被關閉動作清空，另存一份
	let banTarget: (typeof data.members)[number] | null = null;
	let banning = $state<(typeof data.members)[number] | null>(null);
	let revoking = $state<(typeof data.pendingInvitations)[number] | null>(null);

	const roleLabel: Record<string, string> = {
		system_admin: '系統管理員',
		manager: '管理人',
		member: '一般用戶'
	};

	// 邀請 dialog：建立成功後在同一個 dialog 內顯示一次性連結
	let inviting = $state(false);
	let inviteBusy = $state(false);
	let inviteError = $state('');
	let inviteLink = $state('');
	let copied = $state(false);
	let linkInput = $state<HTMLInputElement | null>(null);
	const openInvite = () => {
		inviteError = '';
		inviteLink = '';
		copied = false;
		inviting = true;
	};
	// 連結只顯示一次：dialog 關閉動畫結束後清掉
	const clearInvite = () => {
		inviteLink = '';
		copied = false;
	};
	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(inviteLink);
		} catch {
			// clipboard API 不可用（非 https、權限被拒）時退回 execCommand
			linkInput?.select();
			if (!document.execCommand('copy')) {
				toast('無法自動複製，請手動選取連結複製', 'error');
				return;
			}
		}
		copied = true;
		toast('已複製邀請連結');
		setTimeout(() => (copied = false), 2000);
	};

	// 列內操作（角色、停用）：每次呼叫自帶參數，不共用狀態
	const act = async (action: string, fields: Record<string, string>, msg: string) => {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		const res = await fetch(action, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text());
		if (result.type === 'success') {
			await invalidateAll();
			toast(msg);
		} else await applyAction(result);
	};

	const expiry = (at: Date | string | number) => {
		const ms = new Date(at).getTime() - Date.now();
		if (ms <= 0) return { text: '已過期', warn: true };
		const d = Math.ceil(ms / 86_400_000);
		if (ms < 86_400_000) return { text: '今天到期', warn: true };
		return { text: `${d} 天後到期`, warn: d <= 2 };
	};
</script>

<svelte:head><title>成員 - Taskflow</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
	<PageHeader title="成員">
		{#if data.canInvite}
			<Button onclick={openInvite}><MailPlusIcon aria-hidden="true" />邀請成員</Button>
		{/if}
	</PageHeader>

	{#if form?.message}
		<Alert.Root variant="destructive" class="mb-4"
			><Alert.Description>{form.message}</Alert.Description></Alert.Root
		>
	{/if}

	{#if data.canInvite}
		<section class="mb-8 space-y-3" aria-labelledby="pending-h">
			<h2 id="pending-h" class="flex items-center gap-2 text-sm font-semibold">
				待使用的邀請
				{#if data.pendingInvitations.length}<span
						class="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums"
						>{data.pendingInvitations.length}</span
					>{/if}
			</h2>
			{#if data.pendingInvitations.length}
				<ul class="divide-y divide-border rounded-2xl border border-border bg-card">
					{#each data.pendingInvitations as inv, i (inv.id)}
						{@const ex = expiry(inv.expiresAt)}
						<li class="rise flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" style="--i: {i}">
							<div class="min-w-48 flex-1">
								<div class="font-medium [overflow-wrap:anywhere]">{inv.email}</div>
								<div class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
									<span>邀請人 {inv.inviterName}</span>
									<span
										class="inline-flex items-center gap-1 {ex.warn ? 'text-status-pending' : ''}"
										><ClockIcon class="size-3.5" aria-hidden="true" />{ex.text}</span
									>
								</div>
							</div>
							<Badge variant="secondary">{roleLabel[inv.role] ?? inv.role}</Badge>
							{#if inv.invitedBy === data.me.id || data.canManage}
								<Button type="button" variant="outline" size="sm" onclick={() => (revoking = inv)}
									>撤銷</Button
								>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p
					class="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
				>
					目前沒有待使用的邀請。
				</p>
			{/if}
		</section>
	{/if}

	<section class="space-y-3" aria-labelledby="members-h">
		<h2 id="members-h" class="text-sm font-semibold">
			所有成員 <span class="font-normal text-muted-foreground">· {data.members.length}</span>
		</h2>
		<div class="overflow-hidden rounded-2xl border border-border bg-card">
			<table class="w-full text-left max-md:block">
				<thead class="max-md:sr-only">
					<tr class="border-b border-border text-xs font-medium text-muted-foreground">
						<th scope="col" class="px-4 py-2.5 font-medium">成員</th>
						<th scope="col" class="w-40 px-4 py-2.5 font-medium">角色</th>
						<th scope="col" class="w-28 px-4 py-2.5 font-medium">狀態</th>
						<th scope="col" class="w-14 px-4 py-2.5"><span class="sr-only">操作</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border max-md:block">
					{#each data.members as m, i (m.id)}
						{@const self = m.id === data.me.id}
						{@const role = m.role ?? 'member'}
						<tr
							class="rise transition-colors hover:bg-muted/40 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-y-1 max-md:px-4 max-md:py-3"
							style="--i: {i}"
						>
							<td class="px-4 py-3 max-md:p-0">
								<div class="flex min-w-0 items-center gap-3">
									<Avatar name={m.name} class="size-9 text-sm" />
									<div class="min-w-0">
										<div class="truncate font-medium">
											{m.name}{#if self}<span
													class="ml-1.5 text-xs font-normal text-muted-foreground">（你）</span
												>{/if}
										</div>
										<div class="truncate text-sm text-muted-foreground">{m.email}</div>
									</div>
								</div>
							</td>
							<td class="px-4 py-3 max-md:order-last max-md:col-span-2 max-md:p-0 max-md:pl-12">
								<div class="flex gap-2">
									<Badge variant="secondary">{roleLabel[role] ?? m.role}</Badge>
									{#if m.banned}<Badge variant="destructive" class="md:hidden">已停用</Badge>{/if}
								</div>
							</td>
							<td class="px-4 py-3 max-md:hidden">
								{#if m.banned}<Badge variant="destructive">已停用</Badge>{:else}<span
										class="text-sm text-muted-foreground">使用中</span
									>{/if}
							</td>
							<td class="px-4 py-3 text-right max-md:p-0">
								{#if data.canManage && !self}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class="inline-grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted md:size-9"
											aria-label="{m.name} 的操作"
											><EllipsisIcon class="size-5" /></DropdownMenu.Trigger
										>
										<DropdownMenu.Portal>
											<DropdownMenu.Content
												align="end"
												sideOffset={6}
												class="z-[70] min-w-44 rounded-xl bg-popover p-1 text-sm text-popover-foreground shadow-pop data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
											>
												<DropdownMenu.Group>
													<DropdownMenu.GroupHeading
														class="px-2.5 py-1.5 text-xs text-muted-foreground"
														>變更角色</DropdownMenu.GroupHeading
													>
													{#each Object.entries(roleLabel) as [value, label] (value)}
														<DropdownMenu.Item
															class="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 outline-none data-highlighted:bg-muted md:h-9"
															onSelect={() =>
																value !== role &&
																act(
																	'?/setRole',
																	{ userId: m.id, role: value },
																	`已將 ${m.name} 設為${label}`
																)}
														>
															<span class="flex-1">{label}</span>
															{#if value === role}<CheckIcon
																	class="size-4 text-muted-foreground"
																/>{/if}
														</DropdownMenu.Item>
													{/each}
												</DropdownMenu.Group>
												<DropdownMenu.Separator class="my-1 h-px bg-border" />
												<DropdownMenu.Item
													class="flex h-10 cursor-pointer items-center rounded-lg px-2.5 outline-none data-highlighted:bg-muted md:h-9 {m.banned
														? ''
														: 'text-destructive'}"
													onSelect={() =>
														m.banned
															? act(
																	'?/setBanned',
																	{ userId: m.id, banned: 'false' },
																	`已啟用 ${m.name}`
																)
															: ((banning = m), (banTarget = m))}
													>{m.banned ? '啟用帳號' : '停用帳號'}</DropdownMenu.Item
												>
											</DropdownMenu.Content>
										</DropdownMenu.Portal>
									</DropdownMenu.Root>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<ConfirmDialog
		bind:open={() => banning !== null, (v) => !v && (banning = null)}
		title="停用「{banning?.name ?? ''}」？"
		description="對方將無法登入，目前的登入也會被登出。之後可以重新啟用。"
		confirmLabel="停用"
		onconfirm={async () => {
			if (banTarget)
				await act(
					'?/setBanned',
					{ userId: banTarget.id, banned: 'true' },
					`已停用 ${banTarget.name}`
				);
		}}
	/>
	<ConfirmDialog
		bind:open={() => revoking !== null, (v) => !v && (revoking = null)}
		title="撤銷邀請？"
		description="{revoking?.email ?? ''} 的邀請連結會立即失效。"
		confirmLabel="撤銷"
		action="?/revoke"
		fields={{ id: revoking?.id ?? '' }}
		onresult={async (r) => {
			if (r.type === 'success') {
				await invalidateAll();
				toast('已撤銷邀請');
			} else await applyAction(r);
		}}
	/>
</main>

<FormDialog
	bind:open={inviting}
	onclosed={clearInvite}
	title={inviteLink ? '邀請連結已建立' : '邀請成員'}
	description={inviteLink ? undefined : '產生一次性連結（7 天有效），請自行轉交對方。'}
>
	{#if inviteLink}
		<div class="space-y-4">
			<Alert.Root class="border-status-pending/40 bg-status-pending/10">
				<TriangleAlertIcon class="text-status-pending" aria-hidden="true" />
				<Alert.Description class="text-foreground"
					>此連結僅顯示這一次，關閉後無法再取得。請現在複製並轉交對方。</Alert.Description
				>
			</Alert.Root>
			<div class="space-y-2">
				<Label for="invite-link">邀請連結</Label>
				<div class="flex gap-2">
					<Input
						id="invite-link"
						bind:ref={linkInput}
						readonly
						value={inviteLink}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<Button type="button" onclick={copyLink} class="shrink-0">
						{#if copied}<CheckIcon aria-hidden="true" />已複製{:else}<CopyIcon
								aria-hidden="true"
							/>複製{/if}
					</Button>
				</div>
			</div>
			<div class="flex justify-end">
				<Button type="button" variant="ghost" onclick={() => (inviting = false)}>完成</Button>
			</div>
		</div>
	{:else}
		<form
			method="post"
			action="?/invite"
			class="space-y-4"
			use:enhance={() => {
				inviteBusy = true;
				inviteError = '';
				return async ({ result }) => {
					if (result.type === 'success') {
						inviteLink = (result.data?.inviteLink as string) ?? '';
						await invalidateAll();
						await tick();
						linkInput?.focus();
					} else if (result.type === 'failure') {
						inviteError = (result.data?.message as string | undefined) ?? '建立失敗';
					} else await applyAction(result);
					inviteBusy = false;
				};
			}}
		>
			{#if inviteError}
				<Alert.Root variant="destructive"
					><Alert.Description>{inviteError}</Alert.Description></Alert.Root
				>
			{/if}
			<div class="space-y-2">
				<Label for="invite-email">Email</Label>
				<Input id="invite-email" name="email" type="email" required autocomplete="off" />
			</div>
			<div class="space-y-2">
				<Label for="invite-role">角色</Label>
				<NativeSelect.Root id="invite-role" name="role" class="w-full">
					<NativeSelect.Option value="member">一般用戶</NativeSelect.Option>
					<NativeSelect.Option value="manager">管理人</NativeSelect.Option>
				</NativeSelect.Root>
			</div>
			<div class="flex justify-end gap-2 pt-1">
				<Button type="button" variant="ghost" onclick={() => (inviting = false)}>取消</Button>
				<Button type="submit" disabled={inviteBusy}>
					{#if inviteBusy}<LoaderIcon
							class="animate-spin"
							aria-hidden="true"
						/>建立中…{:else}建立邀請{/if}
				</Button>
			</div>
		</form>
	{/if}
</FormDialog>
