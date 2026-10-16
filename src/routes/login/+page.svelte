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

	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>登入 - Taskflow</title></svelte:head>

<AuthShell title="歡迎回來" description="登入 Taskflow。帳號由邀請建立，無法自行註冊。">
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
			<Label for="email">Email</Label>
			<Input
				id="email"
				name="email"
				type="email"
				autocomplete="username"
				value={form?.email ?? ''}
				required
			/>
		</div>
		<PasswordField id="password" label="密碼" autocomplete="current-password" />
		<Button type="submit" size="lg" class="w-full" disabled={busy}>
			{#if busy}<LoaderIcon class="animate-spin" aria-hidden="true" />登入中…{:else}登入{/if}
		</Button>
	</form>
</AuthShell>
