<script setup lang="ts">
import { reveal as vReveal } from '../directives/reveal'
</script>

<template>
	<section id="about" class="scroll-mt-24">
		<div class="grid gap-10 lg:grid-cols-2 lg:items-center">
			<div v-reveal>
				<h2 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Architecture Preview</h2>
				<p class="mt-3 text-sm leading-6 text-slate-600">
					A clean end-to-end flow from devices to dashboard. Built for LPWAN deployments where reliability and
					observability matter.
				</p>
				<ul class="mt-6 space-y-3 text-sm text-slate-700">
					<li class="flex gap-2">
						<span class="mt-1 h-2 w-2 rounded-full bg-sky-600/70" />
						<span>Device onboarding with secure credentials</span>
					</li>
					<li class="flex gap-2">
						<span class="mt-1 h-2 w-2 rounded-full bg-sky-600/70" />
						<span>Backend ingestion, storage, and rule engine</span>
					</li>
					<li class="flex gap-2">
						<span class="mt-1 h-2 w-2 rounded-full bg-sky-600/70" />
						<span>Web dashboard with realtime updates</span>
					</li>
				</ul>
			</div>

			<div v-reveal="{ delay: 120 }" class="rounded-2xl border border-white/40 bg-white/50 p-6 shadow-lg shadow-slate-900/5 backdrop-blur-md">
				<div class="text-sm font-semibold text-slate-900">Device → LPWAN → Backend → Web Dashboard</div>
				<div class="mt-5 grid gap-3 sm:grid-cols-7 sm:items-center">
					<div class="sm:col-span-2 rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3 text-center text-sm font-medium text-slate-800">
						Device
					</div>
					<div class="hidden sm:flex justify-center text-slate-400">→</div>
					<div class="sm:col-span-2 rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3 text-center text-sm font-medium text-slate-800">
						LPWAN
					</div>
					<div class="hidden sm:flex justify-center text-slate-400">→</div>
					<div class="sm:col-span-2 rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3 text-center text-sm font-medium text-slate-800">
						Backend
					</div>
					<div class="hidden sm:flex justify-center text-slate-400">→</div>
					<div class="sm:col-span-2 rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3 text-center text-sm font-medium text-slate-800">
						Web Dashboard
					</div>
				</div>

				<div class="mt-6 grid gap-3 sm:grid-cols-3">
					<div class="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
						<div class="text-xs text-slate-600">Protocol</div>
						<div class="mt-1 text-sm font-semibold text-slate-900">MQTT / HTTP</div>
					</div>
					<div class="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
						<div class="text-xs text-slate-600">Storage</div>
						<div class="mt-1 text-sm font-semibold text-slate-900">Time-series DB</div>
					</div>
					<div class="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
						<div class="text-xs text-slate-600">Realtime</div>
						<div class="mt-1 text-sm font-semibold text-slate-900">WebSocket / SSE</div>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>
