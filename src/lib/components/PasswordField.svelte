<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let {
		id,
		label,
		autocomplete,
		minlength
	}: {
		id: string;
		label: string;
		autocomplete: 'current-password' | 'new-password';
		minlength?: number;
	} = $props();
	let shown = $state(false);
</script>

<div class="space-y-2">
	<Label for={id}>{label}</Label>
	<div class="relative">
		<Input
			{id}
			name="password"
			type={shown ? 'text' : 'password'}
			{autocomplete}
			{minlength}
			required
			class="pr-11"
		/>
		<button
			type="button"
			aria-pressed={shown}
			aria-label="顯示密碼"
			onclick={() => (shown = !shown)}
			class="absolute top-0 right-0 grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none md:size-9"
		>
			{#if shown}<EyeOffIcon class="size-4" aria-hidden="true" />{:else}<EyeIcon
					class="size-4"
					aria-hidden="true"
				/>{/if}
		</button>
	</div>
</div>
