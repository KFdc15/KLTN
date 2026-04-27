<script setup lang="ts">
import { computed } from 'vue'

import DeviceTable, { type DeviceRow } from './DeviceTable.vue'
import { useDeviceStore } from '../../store/deviceStore'

const store = useDeviceStore()

function connectionLabel(deviceUid: string | undefined, model: string | undefined) {
	const uid = (deviceUid ?? '').toLowerCase()
	const m = (model ?? '').toLowerCase()
	if (m.includes('eth') || m.includes('ethernet') || uid.includes('eth')) return 'Wired'
	if (m.includes('wifi') || uid.includes('wifi')) return 'Wi‑Fi'
	return '—'
}

const rows = computed<DeviceRow[]>(() => {
	return store.devices.map((d) => ({
		id: d.id,
		name: d.name,
		type: d.type,
		connection: connectionLabel(d.deviceUid, d.model),
		status: d.status,
		lastUpdate: store.getLastUpdateLabel(d),
		spark: store
			.getTelemetryWindow(d.id)
			.map((p) => p.signalDbm)
			.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
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
		<p v-if="store.error" class="text-sm text-red-700">{{ store.error }}</p>
		<DeviceTable :devices="rows" @rename="onRenameDevice" @delete="onDeleteDevice" />
	</div>
</template>
