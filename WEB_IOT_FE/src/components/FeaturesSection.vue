<script setup lang="ts">
import { reveal as vReveal } from '../directives/reveal'

type Feature = {
	title: string
	description: string
	icon: 'monitor' | 'control' | 'users'
}

const features: Feature[] = [
	{
		title: 'Real-time Monitoring',
		description: 'Live device status, telemetry charts, and alert timelines designed for fast operations.',
		icon: 'monitor',
	},
	{
		title: 'Device Control',
		description: 'Send commands, schedule automations, and track acknowledgements with clear audit trails.',
		icon: 'control',
	},
	{
		title: 'Secure Multi-user Management',
		description: 'Role-based access, project-based isolation, and secure onboarding for every device.',
		icon: 'users',
	},
]

function iconPath(icon: Feature['icon']) {
	switch (icon) {
		case 'monitor':
			return 'M4 5h16v10H4V5Zm0 12h16v2H4v-2Z'
		case 'control':
			return 'M12 3v18m7-11H5m11 0a2 2 0 1 0-4 0a2 2 0 0 0 4 0Z'
		case 'users':
			return 'M16 11a4 4 0 1 0-8 0a4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0'
	}
}
</script>

<template>
	<section id="features" class="scroll-mt-24">
		<div class="text-center" v-reveal>
			<h2 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Features</h2>
			<p class="mt-3 text-sm leading-6 text-slate-600">
				Everything you need for a production-ready IoT management workflow.
			</p>
		</div>

		<div class="mt-10 grid gap-6 md:grid-cols-3">
			<article
				v-for="(feature, index) in features"
				:key="feature.title"
				v-reveal="{ delay: 120 + index * 90 }"
				class="group rounded-2xl border border-white/40 bg-white/50 p-6 shadow-lg shadow-slate-900/5 backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/60"
			>
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-sky-600/15 to-indigo-600/15">
					<svg class="h-6 w-6 text-sky-700/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
						<path :d="iconPath(feature.icon)" />
					</svg>
				</div>
				<h3 class="mt-5 text-base font-semibold text-slate-900">{{ feature.title }}</h3>
				<p class="mt-2 text-sm leading-6 text-slate-600">{{ feature.description }}</p>
			</article>
		</div>
	</section>
</template>
