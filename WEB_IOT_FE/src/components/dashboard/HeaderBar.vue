<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { Bars3Icon, BellIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

import { useAuthStore } from '../../store/authStore'

const emit = defineEmits<{
	(e: 'toggleSidebar'): void
}>()

const route = useRoute()
const router = useRouter()

const auth = useAuthStore()

const isUserMenuOpen = ref(false)

const resolvedTitle = computed(() => {
	const metaTitle = route.meta?.title as string | undefined
	return metaTitle ?? 'Dashboard'
})

function lastNameFromFullName(fullName: string | null | undefined): string | null {
	if (!fullName) return null
	const parts = fullName.trim().split(/\s+/).filter(Boolean)
	if (!parts.length) return null
	const last = parts[parts.length - 1]
	return last ? last : null
}

const userLabel = computed(() => {
	const ln = lastNameFromFullName(auth.user?.fullName)
	if (ln) return ln
	const email = auth.user?.email
	if (!email) return 'User'
	return email.split('@')[0] || 'User'
})

function toggleUserMenu() {
	isUserMenuOpen.value = !isUserMenuOpen.value
}

function goTo(path: string) {
	isUserMenuOpen.value = false
	router.push(path)
}

function logout() {
	isUserMenuOpen.value = false
	auth.logout()
	router.push('/login')
}
</script>

<template>
	<header class="sticky top-0 z-20 border-b border-gray-200 bg-gray-100/80 backdrop-blur">
		<div class="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
			<div class="flex items-center gap-3">
				<button
					type="button"
					class="inline-flex items-center rounded-xl p-2 text-gray-700 transition hover:bg-white hover:shadow-sm lg:hidden"
					@click="emit('toggleSidebar')"
					aria-label="Toggle sidebar"
				>
					<Bars3Icon class="h-6 w-6" />
				</button>
				<h1 class="text-lg font-semibold text-gray-900 lg:text-xl">{{ resolvedTitle }}</h1>
			</div>

			<div class="flex flex-1 items-center justify-end gap-3">
				<div class="hidden w-full max-w-md lg:block">
					<div class="relative">
						<MagnifyingGlassIcon
							class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
						/>
						<input
							type="search"
							placeholder="Search devices..."
							class="w-full rounded-2xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
						/>
					</div>
				</div>

				<button
					type="button"
					class="inline-flex items-center rounded-xl p-2 text-gray-700 transition hover:bg-white hover:shadow-sm"
					aria-label="Notifications"
				>
					<BellIcon class="h-6 w-6" />
				</button>

				<div class="relative">
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-2xl bg-white px-2 py-1.5 shadow-sm ring-1 ring-gray-200 transition hover:shadow"
						@click="toggleUserMenu"
						aria-label="User menu"
					>
						<div class="h-8 w-8 overflow-hidden rounded-full bg-gray-200">
							<img
								alt="User avatar"
								src="https://api.dicebear.com/9.x/initials/svg?seed=IoT"
								class="h-full w-full"
							/>
						</div>
						<span class="hidden text-sm font-semibold text-gray-900 sm:block">{{ userLabel }}</span>
						<ChevronDownIcon class="h-4 w-4 text-gray-500" />
					</button>

					<div
						v-if="isUserMenuOpen"
						class="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5"
					>
						<button
							type="button"
							class="w-full px-4 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
							@click="goTo('/app/settings')"
						>
							Account settings
						</button>
						<button
							type="button"
							class="w-full px-4 py-2.5 text-left text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
							@click="logout"
						>
							Logout
						</button>
					</div>
				</div>
			</div>
		</div>
	</header>
</template>
