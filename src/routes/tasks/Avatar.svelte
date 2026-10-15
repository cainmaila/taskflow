<script lang="ts">
	let { name, class: cls = '' }: { name: string; class?: string } = $props();
	// 以名字穩定決定色相，同一個人在各處顏色一致
	const hue = $derived([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<span
	class="grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold text-[#0d0e12] {cls}"
	style="background: hsl({hue} 70% 72%)"
	title={name}
	role="img"
	aria-label={name}>{name.trim().slice(0, 1).toUpperCase()}</span
>
