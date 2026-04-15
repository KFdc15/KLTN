<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
	icon: Component
	title: string
	value: string | number
	description: string
}>()
</script>

<template>
	<div class="rounded-2xl bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
		<div class="flex items-start justify-between">
			<div>
				<p class="text-sm font-medium text-gray-500">{{ title }}</p>
				<p class="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{{ value }}</p>
				<p class="mt-1 text-sm text-gray-500">{{ description }}</p>
			</div>

			<div class="rounded-xl bg-gray-100 p-2.5 text-gray-700">
				<component :is="icon" class="h-6 w-6" aria-hidden="true" />
			</div>
		</div>
	</div>
</template>
