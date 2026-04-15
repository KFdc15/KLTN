<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import LandingNavbar from '../LandingNavbar.vue'

import { useAuthStore } from '../../store/authStore'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)

onMounted(() => {
	const remembered = auth.getRememberedEmail()
	if (remembered) {
		email.value = remembered
		rememberMe.value = true
	}
})

async function submit() {
	const ok = await auth.login(email.value, password.value, rememberMe.value)
	auth.setRememberedEmail(rememberMe.value ? email.value : null)
	if (ok) router.push('/app/dashboard')
}
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
						<h1 class="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
						<p class="text-sm text-slate-600">Login to continue to your dashboard.</p>
					</div>

					<form class="mt-6 space-y-4" @submit.prevent="submit">
						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Email</label>
							<input
								name="email"
								type="email"
								autocomplete="email"
								required
								v-model="email"
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="you@example.com"
							/>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-slate-700">Password</label>
							<input
								name="password"
								type="password"
								autocomplete="current-password"
								required
								v-model="password"
								class="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-slate-300"
								placeholder="••••••••"
							/>
						</div>

						<div class="flex items-center justify-between">
							<label class="inline-flex items-center gap-2 text-sm text-slate-600">
								<input v-model="rememberMe" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
								Remember me
							</label>
							<a href="#" class="text-sm font-medium text-slate-700 hover:text-slate-900">
								Forgot password?
							</a>
						</div>

						<button
							type="submit"
							:disabled="auth.loading"
							class="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
						>
							Login
						</button>

						<p v-if="auth.error" class="text-sm text-red-700">{{ auth.error }}</p>
					</form>

					<p class="mt-6 text-center text-sm text-slate-600">
						Don't have an account?
						<RouterLink to="/signup" class="ml-1 font-semibold text-slate-900 hover:underline">
							Sign up
						</RouterLink>
					</p>
				</div>
			</div>
		</main>
	</div>
</template>
