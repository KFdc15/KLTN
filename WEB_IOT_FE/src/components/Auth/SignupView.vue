<script setup lang="ts">
import LandingNavbar from '../LandingNavbar.vue'
</script>

<template>
	<div class="min-h-screen text-slate-900">
		<div class="fixed inset-0 -z-10 bg-linear-to-br from-sky-200/40 via-white to-indigo-200/30" />
		<div
			class="fixed inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(56,189,248,0.18),transparent_60%)]"
		/>

		<LandingNavbar />

		<main class="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
			<div class="mx-auto w-full max-w-md">
				<div class="rounded-3xl border border-white/40 bg-white/60 p-6 backdrop-blur-md sm:p-8">
					<div class="space-y-2">
						<h1 class="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
						<p class="text-sm text-slate-600">Sign up to start using the platform.</p>
					</div>

					<form class="mt-6 space-y-4" @submit.prevent>
						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Full name</label>
							<input
								type="text"
								autocomplete="name"
								required
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="Your name"
							/>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Email</label>
							<input
								type="email"
								autocomplete="email"
								required
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="you@example.com"
							/>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Password</label>
							<input
								type="password"
								autocomplete="new-password"
								required
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="Create a password"
							/>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Confirm password</label>
							<input
								type="password"
								autocomplete="new-password"
								required
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="Repeat password"
							/>
						</div>

						<button
							type="submit"
							class="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
						>
							Sign Up
						</button>
					</form>

					<p class="mt-6 text-center text-sm text-slate-600">
						Already have an account?
						<RouterLink to="/login" class="ml-1 font-semibold text-slate-900 hover:underline">
							Login
						</RouterLink>
					</p>
				</div>
			</div>
		</main>
	</div>
</template>
