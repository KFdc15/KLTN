<script setup lang="ts">
const icons = [
	{ label: 'Camera', class: 'top-10 left-6 animate-float' },
	{ label: 'Thermostat', class: 'top-28 right-10 animate-float-slow' },
	{ label: 'Plug', class: 'bottom-12 left-10 animate-float' },
	{ label: 'Signal', class: 'bottom-20 right-16 animate-float-slow' },
]
</script>

<template>
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			v-for="icon in icons"
			:key="icon.label"
			:class="[
				'absolute hidden sm:block',
				'rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md',
				'shadow-sm',
				'p-3',
				icon.class,
			]"
		>
			<svg class="h-6 w-6 text-sky-700/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
				<path
					v-if="icon.label === 'Camera'"
					d="M4 7h3l2-2h6l2 2h3v12H4V7Zm8 3.5a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z"
				/>
				<path
					v-else-if="icon.label === 'Thermostat'"
					d="M12 3v10.5a3.5 3.5 0 1 0 3 3.46M12 3a2 2 0 0 0-2 2v8"
				/>
				<path
					v-else-if="icon.label === 'Plug'"
					d="M9 3v6m6-6v6m-8 2h10v2a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5v-2Z"
				/>
				<path
					v-else
					d="M6 14a6 6 0 0 1 12 0M9 14a3 3 0 0 1 6 0m-3 7h.01"
				/>
			</svg>
		</div>
	</div>
</template>
