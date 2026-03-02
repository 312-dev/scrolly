<script lang="ts">
	const {
		size = 24,
		weight = 'bold',
		color = 'currentColor'
	}: {
		size?: number | string;
		weight?: string;
		color?: string;
	} = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	role="img"
	width={size}
	height={size}
	fill={color}
	viewBox="0 0 256 256"
>
	<rect width="256" height="256" fill="none" />
	{#if weight === 'bold'}
		<rect x="80" y="40" width="24" height="120" rx="12" />
		<circle cx="92" cy="204" r="20" />
		<rect x="152" y="40" width="24" height="120" rx="12" />
		<circle cx="164" cy="204" r="20" />
	{:else if weight === 'fill'}
		<rect x="80" y="40" width="24" height="120" rx="12" />
		<circle cx="92" cy="204" r="20" />
		<rect x="152" y="40" width="24" height="120" rx="12" />
		<circle cx="164" cy="204" r="20" />
	{:else}
		<rect x="84" y="40" width="16" height="120" rx="8" />
		<circle cx="92" cy="200" r="16" />
		<rect x="156" y="40" width="16" height="120" rx="8" />
		<circle cx="164" cy="200" r="16" />
	{/if}
</svg>
