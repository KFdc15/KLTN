<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CpuChipIcon } from '@heroicons/vue/24/outline'
import { SECTION_ROUTES, type SectionId } from '../router'

const isOpen = ref(false)

const route = useRoute()
const router = useRouter()

const activePath = ref<string>(route.path)

const suppressUrlSync = ref(false)
let suppressUrlSyncTimer: number | undefined

let observer: IntersectionObserver | undefined

const links = [
	{ label: 'Home', path: '/' },
	{ label: 'Features', path: '/features' },
	{ label: 'About', path: '/about' },
	{ label: 'Contact', path: '/contact' },
]

function onNavigate() {
	isOpen.value = false
}

async function navigateTo(path: string) {
	activePath.value = path
	isOpen.value = false
	suppressUrlSync.value = true
	if (suppressUrlSyncTimer) window.clearTimeout(suppressUrlSyncTimer)
	await router.push(path)

	// Allow router scrollBehavior to run (smooth scroll). During this window
	// we avoid replacing the URL based on the section currently visible (often "home").
	suppressUrlSyncTimer = window.setTimeout(() => {
		suppressUrlSync.value = false
	}, 650)
}

function navLinkClass(path: string) {
	return [
		'text-sm transition',
		'rounded-2xl px-3 py-2 -mx-3',
		activePath.value === path
			? 'text-slate-900 bg-white/70'
			: 'text-slate-700 hover:text-slate-900 hover:bg-white/40',
	]
}

onMounted(() => {
	activePath.value = route.path

	watch(
		() => route.path,
		(path) => {
			activePath.value = path
			suppressUrlSync.value = true
			if (suppressUrlSyncTimer) window.clearTimeout(suppressUrlSyncTimer)
			suppressUrlSyncTimer = window.setTimeout(() => {
				suppressUrlSync.value = false
			}, 650)
		},
		{ immediate: false },
	)

	const targets = SECTION_ROUTES
		.map((s) => document.getElementById(s.id))
		.filter((el): el is HTMLElement => Boolean(el))

	if (targets.length === 0) return

	observer = new IntersectionObserver(
		(entries) => {
			const visible = entries
				.filter((e) => e.isIntersecting)
				.sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))

			const [first] = visible
			if (!first) return
			const top = first.target as HTMLElement
			const id = top.id as SectionId
			const match = SECTION_ROUTES.find((s) => s.id === id)
			if (!match) return

			activePath.value = match.path
			if (!suppressUrlSync.value && router.currentRoute.value.path !== match.path) {
				// Keep URL in sync without polluting history.
				router.replace(match.path)
			}
		},
		{
			root: null,
			// Account for the fixed navbar: activate when section enters upper part of viewport
			rootMargin: '-10% 0px -70% 0px',
			threshold: [0.08, 0.12, 0.2, 0.35, 0.5, 0.7],
		},
	)

	for (const t of targets) observer.observe(t)
})

onBeforeUnmount(() => {
	if (suppressUrlSyncTimer) window.clearTimeout(suppressUrlSyncTimer)
	observer?.disconnect()
	observer = undefined
})
</script>

<template>
	<header class="fixed inset-x-0 top-0 z-50">
		<nav class="border-b border-white/30 bg-white/60 backdrop-blur-md">
			<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
				<RouterLink to="/" class="flex items-center gap-2" @click="onNavigate">
					<div
						class="h-9 w-9 rounded-2xl bg-linear-to-br from-sky-600/30 to-indigo-600/30 grid place-items-center"
					>
						<CpuChipIcon class="h-5 w-5 text-slate-900" />
					</div>
					<span class="text-sm font-semibold tracking-tight text-slate-900">IoT Platform</span>
				</RouterLink>

				<div class="hidden md:flex items-center gap-6">
					<RouterLink
						v-for="link in links"
						:key="link.path"
						:to="link.path"
						:class="navLinkClass(link.path)"
						@click.prevent="navigateTo(link.path)"
					>
						{{ link.label }}
					</RouterLink>
				</div>

				<div class="hidden md:flex items-center gap-3">
					<RouterLink
						to="/login"
						class="rounded-2xl px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-white/70 transition"
					>
						Login
					</RouterLink>
					<RouterLink
						to="/signup"
						class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
					>
						Sign Up
					</RouterLink>
				</div>

				<button
					type="button"
					class="md:hidden inline-flex items-center justify-center rounded-2xl p-2 text-slate-700 hover:bg-white/70 transition"
					:aria-expanded="isOpen"
					aria-label="Toggle menu"
					@click="isOpen = !isOpen"
				>
					<svg v-if="!isOpen" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M4 6h16M4 12h16M4 18h16" />
					</svg>
					<svg v-else class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>

			<div v-if="isOpen" class="md:hidden border-t border-white/30 bg-white/70 backdrop-blur-md">
				<div class="mx-auto max-w-6xl px-4 py-4 sm:px-6">
					<div class="flex flex-col gap-2">
						<RouterLink
							v-for="link in links"
							:key="link.path"
							:to="link.path"
							:class="[
								'rounded-2xl px-3 py-2 text-sm transition',
								activePath === link.path
									? 'bg-white/80 text-slate-900'
									: 'text-slate-700 hover:bg-white/70 hover:text-slate-900',
							]"
							@click.prevent="navigateTo(link.path)"
						>
							{{ link.label }}
						</RouterLink>
					</div>
					<div class="mt-4 flex items-center gap-3">
						<RouterLink
							to="/login"
							class="flex-1 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-white"
							@click="onNavigate"
						>
							Login
						</RouterLink>
						<RouterLink
							to="/signup"
							class="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
							@click="onNavigate"
						>
							Sign Up
						</RouterLink>
					</div>
				</div>
			</div>
		</nav>
	</header>
</template>
