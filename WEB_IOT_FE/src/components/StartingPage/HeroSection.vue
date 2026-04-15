<script setup lang="ts">
import DashboardPreview from './DashboardPreview.vue'
import FloatingIcons from './FloatingIcons.vue'
import { reveal as vReveal } from '../../directives/reveal'
</script>

<template>
	<section id="home" class="scroll-mt-24 relative">
		<div class="relative overflow-hidden rounded-2xl border border-white/30 bg-white/40 shadow-xl shadow-slate-900/5 backdrop-blur-md">
			<FloatingIcons />

			<div class="px-6 py-14 sm:px-10 lg:px-12 lg:py-16">
				<div class="grid items-center gap-12 lg:grid-cols-2">
					<div v-reveal class="relative">
						<p class="inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/60 px-3 py-1 text-xs font-medium text-slate-700">
							<span class="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
							Realtime LPWAN Fleet
						</p>
						<h1 class="mt-5 text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
							Smart IoT Device Management Platform
						</h1>
						<p class="mt-4 max-w-xl text-pretty text-base leading-7 text-slate-600">
							Monitor, control, and automate your LPWAN devices in real-time.
						</p>

						<div class="mt-8 flex flex-wrap items-center gap-3">
							<RouterLink
								to="/contact"
								class="group inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
							>
								Get Started
								<span class="ml-2 inline-block transition group-hover:translate-x-0.5">→</span>
							</RouterLink>
							<RouterLink
								to="/features"
								class="inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white"
							>
								Learn More
							</RouterLink>
						</div>

						<div class="mt-10 grid grid-cols-2 gap-4 max-w-md">
							<div class="rounded-2xl border border-white/40 bg-white/50 p-4">
								<div class="text-xs text-slate-600">Devices</div>
								<div class="mt-1 text-xl font-semibold text-slate-900">120+</div>
							</div>
							<div class="rounded-2xl border border-white/40 bg-white/50 p-4">
								<div class="text-xs text-slate-600">Uptime</div>
								<div class="mt-1 text-xl font-semibold text-slate-900">99.9%</div>
							</div>
						</div>
					</div>

					<div v-reveal class="relative" :style="{ transitionDelay: '120ms' }">
						<DashboardPreview />
					</div>
				</div>
			</div>

			<div class="pointer-events-none absolute inset-x-0 -top-20 h-56 bg-linear-to-b from-sky-300/25 to-transparent" />
			<div class="pointer-events-none absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-linear-to-br from-sky-400/15 to-indigo-400/15 blur-0" />
		</div>
	</section>
</template>
