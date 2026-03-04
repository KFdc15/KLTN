<script setup lang="ts">
import { reveal as vReveal } from '../directives/reveal'
</script>

<template>
	<section class="scroll-mt-24" id="contact">
		<div
			v-reveal
			class="relative overflow-hidden rounded-2xl border border-white/40 bg-linear-to-br from-sky-600/15 via-white/50 to-indigo-600/15 p-8 shadow-lg shadow-slate-900/5 backdrop-blur-md sm:p-10"
		>
			<div class="relative">
				<h2 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Start managing your IoT devices today</h2>
				<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
					Create an account to track your fleet, monitor telemetry, and send control commands securely.
				</p>
				<div class="mt-7 flex flex-wrap items-center gap-3">
					<a
						href="#home"
						class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
					>
						Create Account
					</a>
					<a
						href="#features"
						class="inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white"
					>
						View Features
					</a>
				</div>
			</div>

			<div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-linear-to-br from-sky-500/20 to-indigo-500/20" />
		</div>
	</section>
</template>
