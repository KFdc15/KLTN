<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const isOpen = ref(false)

const activeHref = ref<string>('#home')

let observer: IntersectionObserver | undefined

const links = [
	{ label: 'Home', href: '#home' },
	{ label: 'Features', href: '#features' },
	{ label: 'About', href: '#about' },
	{ label: 'Contact', href: '#contact' },
]

function onNavigate() {
	isOpen.value = false
}

function setActiveHref(href: string) {
	activeHref.value = href
	isOpen.value = false
}

function navLinkClass(href: string) {
	return [
		'text-sm transition',
		'rounded-2xl px-3 py-2 -mx-3',
		activeHref.value === href
			? 'text-slate-900 bg-white/70'
			: 'text-slate-700 hover:text-slate-900 hover:bg-white/40',
	]
}

function syncFromHash() {
	const hash = window.location.hash
	if (!hash) return
	if (links.some((l) => l.href === hash)) {
		activeHref.value = hash
	}
}

onMounted(() => {
	syncFromHash()
	window.addEventListener('hashchange', syncFromHash)

	const targets = links
		.map((l) => l.href.replace('#', ''))
		.map((id) => document.getElementById(id))
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
			activeHref.value = `#${top.id}`
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
	window.removeEventListener('hashchange', syncFromHash)
	observer?.disconnect()
	observer = undefined
})
</script>

<template>
	<header class="fixed inset-x-0 top-0 z-50">
		<nav class="border-b border-white/30 bg-white/60 backdrop-blur-md">
			<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
				<a href="#home" class="flex items-center gap-2" @click="onNavigate">
					<div class="h-9 w-9 rounded-2xl bg-linear-to-br from-sky-600/30 to-indigo-600/30" />
					<span class="text-sm font-semibold tracking-tight text-slate-900">IoT Platform</span>
				</a>

				<div class="hidden md:flex items-center gap-6">
					<a
						v-for="link in links"
						:key="link.href"
						:href="link.href"
						:class="navLinkClass(link.href)"
						@click="setActiveHref(link.href)"
					>
						{{ link.label }}
					</a>
				</div>

				<div class="hidden md:flex items-center gap-3">
					<a
						href="#contact"
						class="rounded-2xl px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-white/70 transition"
					>
						Login
					</a>
					<a
						href="#contact"
						class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
					>
						Sign Up
					</a>
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
						<a
							v-for="link in links"
							:key="link.href"
							:href="link.href"
							:class="[
								'rounded-2xl px-3 py-2 text-sm transition',
								activeHref === link.href
									? 'bg-white/80 text-slate-900'
									: 'text-slate-700 hover:bg-white/70 hover:text-slate-900',
							]"
							@click="setActiveHref(link.href)"
						>
							{{ link.label }}
						</a>
					</div>
					<div class="mt-4 flex items-center gap-3">
						<a
							href="#contact"
							class="flex-1 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-white"
							@click="onNavigate"
						>
							Login
						</a>
						<a
							href="#contact"
							class="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
							@click="onNavigate"
						>
							Sign Up
						</a>
					</div>
				</div>
			</div>
		</nav>
	</header>
</template>
