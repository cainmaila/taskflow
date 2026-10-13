<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>登入 - Taskflow</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm items-center p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>登入 Taskflow</Card.Title>
			<Card.Description>帳號由邀請建立，無法自行註冊。</Card.Description>
		</Card.Header>
		<form method="post" use:enhance>
			<Card.Content class="space-y-4">
				{#if form?.message}
					<Alert.Root variant="destructive"
						><Alert.Description>{form.message}</Alert.Description></Alert.Root
					>
				{/if}
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" value={form?.email ?? ''} required />
				</div>
				<div class="space-y-2">
					<Label for="password">密碼</Label>
					<Input id="password" name="password" type="password" required />
				</div>
			</Card.Content>
			<Card.Footer class="mt-4"><Button type="submit" class="w-full">登入</Button></Card.Footer>
		</form>
	</Card.Root>
</main>
