<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>接受邀請 - Taskflow</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm items-center p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>接受邀請</Card.Title>
			<Card.Description>設定姓名與密碼，完成後以 {data.email} 登入。</Card.Description>
		</Card.Header>
		<form method="post" use:enhance>
			<Card.Content class="space-y-4">
				{#if form?.message}
					<Alert.Root variant="destructive"
						><Alert.Description>{form.message}</Alert.Description></Alert.Root
					>
				{/if}
				<div class="space-y-2">
					<Label for="name">姓名</Label>
					<Input id="name" name="name" value={form?.name ?? ''} required />
				</div>
				<div class="space-y-2">
					<Label for="password">密碼（至少 8 個字元）</Label>
					<Input id="password" name="password" type="password" minlength={8} required />
				</div>
			</Card.Content>
			<Card.Footer class="mt-4"><Button type="submit" class="w-full">建立帳號</Button></Card.Footer>
		</form>
	</Card.Root>
</main>
