<script lang="ts">
	import { enhance } from '$app/forms';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>接受邀請 - Taskflow</title></svelte:head>

<AuthShell title="接受邀請" description="設定姓名與密碼，完成後以 {data.email} 登入。">
	<form
		method="post"
		class="space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				try {
					await update({ reset: false });
				} finally {
					busy = false;
				}
			};
		}}
	>
		{#if form?.message}
			<Alert.Root variant="destructive"
				><Alert.Description>{form.message}</Alert.Description></Alert.Root
			>
		{/if}
		<div class="space-y-2">
			<Label for="name">姓名</Label>
			<Input id="name" name="name" autocomplete="name" value={form?.name ?? ''} required />
		</div>
		<PasswordField
			id="password"
			label="密碼（至少 8 個字元）"
			autocomplete="new-password"
			minlength={8}
		/>
		<Button type="submit" size="lg" class="w-full" disabled={busy}>
			{#if busy}<LoaderIcon class="animate-spin" aria-hidden="true" />建立中…{:else}建立帳號{/if}
		</Button>
	</form>
</AuthShell>
