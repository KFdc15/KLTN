<script setup lang="ts">
import { computed } from 'vue'

import DeviceTable, { type DeviceRow } from './DeviceTable.vue'
import { useDeviceStore } from '../../store/deviceStore'

const store = useDeviceStore()

const rows = computed<DeviceRow[]>(() => {
	return store.devices.map((d) => ({
		id: d.id,
		name: d.name,
		type: d.type,
		status: d.status,
		lastUpdate: store.getLastUpdateLabel(d),
	}))
})

async function onRenameDevice(input: { id: string; name: string }) {
	await store.updateDeviceName(input)
}

async function onDeleteDevice(device: DeviceRow) {
	const ok = window.confirm(`Delete device "${device.name}"?`)
	if (!ok) return
	await store.deleteDevice({ id: device.id })
}
</script>

<template>
	<div class="space-y-6">
		<div class="rounded-2xl bg-white p-5 shadow-sm">
			<h2 class="text-base font-semibold text-gray-900">My Devices</h2>
			<p class="mt-1 text-sm text-gray-500">Manage and monitor your connected devices.</p>
		</div>

		<p v-if="store.error" class="text-sm text-red-700">{{ store.error }}</p>
		<DeviceTable :devices="rows" @rename="onRenameDevice" @delete="onDeleteDevice" />
	</div>
</template>
