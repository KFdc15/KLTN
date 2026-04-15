<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '../store/authStore'

import {
	HomeIcon,
	CpuChipIcon,
	PlusCircleIcon,
	ChartBarSquareIcon,
	BoltIcon,
	BellAlertIcon,
	Cog6ToothIcon,
	ArrowRightOnRectangleIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
	open: boolean
}>()

const emit = defineEmits<{
	(e: 'close'): void
}>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const primaryNav = [
	{ label: 'Dashboard', to: '/app/dashboard', icon: HomeIcon },
	{ label: 'My Devices', to: '/app/devices', icon: CpuChipIcon },
	{ label: 'Add Device', to: '/app/add-device', icon: PlusCircleIcon },
]

const secondaryNav = [
	{ label: 'Device Monitoring', disabled: true, icon: ChartBarSquareIcon },
	{ label: 'Automation', disabled: true, icon: BoltIcon },
	{ label: 'Notifications', disabled: true, icon: BellAlertIcon },
	{ label: 'Settings', disabled: true, icon: Cog6ToothIcon },
]

const logoutItem = { label: 'Logout', icon: ArrowRightOnRectangleIcon }

function isActive(to: string) {
	return route.path === to
}

function logout() {
	auth.logout()
	emit('close')
	router.push('/login')
}
</script>

<template>
	<!-- Mobile overlay -->
	<div
		v-show="props.open"
		class="fixed inset-0 z-40 bg-black/40 lg:hidden"
		@click="emit('close')"
		aria-hidden="true"
	/>

	<aside
		:class="[
			'fixed left-0 top-0 z-50 h-full w-65 transform bg-gray-900 text-gray-200 transition duration-200 lg:translate-x-0',
			props.open ? 'translate-x-0' : '-translate-x-full',
		]"
	>
		<div class="flex h-full flex-col">
			<div class="flex items-center gap-3 px-6 py-6">
				<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-800 text-white">
					<CpuChipIcon class="h-6 w-6" />
				</div>
				<div class="leading-tight">
					<div class="text-sm font-semibold text-white">IoT Manager</div>
					<div class="text-xs text-gray-400">Device Dashboard</div>
				</div>
			</div>

			<nav class="flex-1 space-y-6 px-3">
				<div class="space-y-1">
					<RouterLink
						v-for="item in primaryNav"
						:key="item.label"
						:to="item.to"
						class="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition"
						:class="
							isActive(item.to)
								? 'bg-gray-800 text-white'
								: 'text-gray-200 hover:bg-gray-800/60 hover:text-white'
						"
						@click="emit('close')"
					>
						<component :is="item.icon" class="h-5 w-5 text-gray-300 group-hover:text-white" />
						<span>{{ item.label }}</span>
					</RouterLink>
				</div>

				<div class="space-y-1">
					<div class="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Management</div>
					<button
						v-for="item in secondaryNav"
						:key="item.label"
						type="button"
						disabled
						class="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-gray-400 opacity-70"
					>
						<component :is="item.icon" class="h-5 w-5" />
						<span>{{ item.label }}</span>
					</button>
				</div>
			</nav>

			<div class="px-3 pb-4">
				<button
					type="button"
					class="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-gray-200 transition hover:bg-gray-800/60 hover:text-white"
					@click="logout"
				>
					<component :is="logoutItem.icon" class="h-5 w-5 text-gray-300 group-hover:text-white" />
					<span>{{ logoutItem.label }}</span>
				</button>
			</div>
		</div>
	</aside>
</template>
