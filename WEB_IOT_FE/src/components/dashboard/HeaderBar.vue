<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { Bars3Icon, BellIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'

import { useAuthStore } from '../../store/authStore'
import { useDeviceStore } from '../../store/deviceStore'
import { formatRelativeTime } from '../../lib/time'

const emit = defineEmits<{
	(e: 'toggleSidebar'): void
}>()

const route = useRoute()
const router = useRouter()

const auth = useAuthStore()
const devices = useDeviceStore()

const isUserMenuOpen = ref(false)
const isNotificationsOpen = ref(false)

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
	isNotificationsOpen.value = false
	isUserMenuOpen.value = !isUserMenuOpen.value
}

function toggleNotifications() {
	isUserMenuOpen.value = false
	isNotificationsOpen.value = !isNotificationsOpen.value
}

const notifications = computed(() => {
	void devices.relativeTimeTick
	return devices.notifications.map((n) => ({
		...n,
		relative: formatRelativeTime(n.ts),
	}))
})

function onGlobalPointerDown(e: PointerEvent) {
	const target = e.target
	if (!(target instanceof HTMLElement)) return
	if (target.closest('[data-user-menu]') || target.closest('[data-notifications]')) return
	isUserMenuOpen.value = false
	isNotificationsOpen.value = false
}

onMounted(() => {
	window.addEventListener('pointerdown', onGlobalPointerDown)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', onGlobalPointerDown)
})

function goTo(path: string) {
	isUserMenuOpen.value = false
	isNotificationsOpen.value = false
	router.push(path)
}

function logout() {
	isUserMenuOpen.value = false
	isNotificationsOpen.value = false
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
				<div class="relative" data-notifications>
					<button
						type="button"
						class="inline-flex items-center rounded-xl p-2 text-gray-700 transition hover:bg-white hover:shadow-sm"
						aria-label="Notifications"
						@pointerdown.stop
						@click.stop="toggleNotifications"
					>
						<BellIcon class="h-6 w-6" />
					</button>

					<div
						v-if="isNotificationsOpen"
						class="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5"
						@pointerdown.stop
						@click.stop
					>
						<div class="px-4 py-3">
							<p class="text-sm font-semibold text-gray-900">Device notifications</p>
						</div>
						<div class="max-h-80 overflow-auto border-t border-gray-100">
							<div v-if="notifications.length === 0" class="px-4 py-4 text-sm text-gray-600">
								No notifications yet.
							</div>
							<div v-else>
								<div
									v-for="n in notifications.slice(0, 12)"
									:key="n.id"
									class="px-4 py-3 transition hover:bg-gray-50"
								>
									<p class="text-sm font-semibold text-gray-900">{{ n.title }}</p>
									<p v-if="n.message" class="mt-0.5 text-sm text-gray-600">{{ n.message }}</p>
									<p class="mt-1 text-xs text-gray-500">{{ n.relative }}</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="relative" data-user-menu>
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
