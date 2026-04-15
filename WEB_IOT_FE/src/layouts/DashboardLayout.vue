<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import Sidebar from '../components/Sidebar.vue'
import HeaderBar from '../components/dashboard/HeaderBar.vue'

import { useDeviceStore } from '../store/deviceStore'

const deviceStore = useDeviceStore()

const sidebarOpen = ref(false)

function toggleSidebar() {
	sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
	sidebarOpen.value = false
}

onMounted(() => {
	void deviceStore.bootstrap()
})

onBeforeUnmount(() => {
	deviceStore.disconnectSocket()
	deviceStore.stopRelativeTimeClock()
})
</script>

<template>
	<div class="min-h-screen bg-gray-100">
		<Sidebar :open="sidebarOpen" @close="closeSidebar" />

		<div class="lg:pl-65">
			<HeaderBar @toggleSidebar="toggleSidebar" />

			<main class="px-4 py-6 lg:px-8">
				<RouterView />
			</main>
		</div>
	</div>
</template>
