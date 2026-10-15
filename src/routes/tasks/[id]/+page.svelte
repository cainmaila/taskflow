<script lang="ts">
	import TaskDetail from './TaskDetail.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{data.task.title} - Taskflow</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
	<TaskDetail {data} {form} />
</main>
