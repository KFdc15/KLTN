<script setup lang="ts">
import { ref } from 'vue'

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'WARNING'

export type DeviceRow = {
	id: string
	name: string
	type: string
	status: DeviceStatus
	lastUpdate: string
	spark: number[]
}

const props = defineProps<{
	devices: DeviceRow[]
}>()

const emit = defineEmits<{
	(e: 'rename', input: { id: string; name: string }): void
	(e: 'delete', device: DeviceRow): void
}>()

const editingId = ref<string | null>(null)
const draftName = ref('')

function startEdit(device: DeviceRow) {
	editingId.value = device.id
	draftName.value = device.name
}

function cancelEdit() {
	editingId.value = null
	draftName.value = ''
}

function saveEdit(device: DeviceRow) {
	const name = draftName.value.trim()
	if (!name) return
	emit('rename', { id: device.id, name })
	cancelEdit()
}

function removeDevice(device: DeviceRow) {
	emit('delete', device)
}

function statusBadgeClasses(status: DeviceStatus) {
	switch (status) {
		case 'ONLINE':
			return 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200'
		case 'OFFLINE':
			return 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200'
		case 'WARNING':
			return 'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200'
		default:
			return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200'
	}
}

function statusLabel(status: DeviceStatus) {
	switch (status) {
		case 'ONLINE':
			return 'Online'
		case 'OFFLINE':
			return 'Offline'
		case 'WARNING':
			return 'Warning'
		default:
			return status
	}
}

function sparkPolylinePoints(values: number[]) {
	if (!values.length) return ''
	const width = 120
	const height = 28
	const padding = 2

	const min = Math.min(...values)
	const max = Math.max(...values)
	const range = max - min || 1
	const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0

	return values
		.map((v, i) => {
			const x = padding + i * stepX
			const y = padding + (height - padding * 2) * (1 - (v - min) / range)
			return `${x.toFixed(1)},${y.toFixed(1)}`
		})
		.join(' ')
}

function lastValue(values: number[]) {
	if (!values.length) return null
	return values[values.length - 1]
}
</script>

<template>
	<div class="overflow-hidden rounded-2xl bg-white shadow-sm">
		<div class="border-b border-gray-100 px-5 py-4">
			<h3 class="text-base font-semibold text-gray-900">Recent Device Activity</h3>
			<p class="mt-1 text-sm text-gray-500">Latest status and updates across devices.</p>
		</div>

		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-100">
				<thead class="bg-gray-50">
					<tr>
						<th
							scope="col"
							class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Device Name
						</th>
						<th
							scope="col"
							class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Device Type
						</th>
						<th
							scope="col"
							class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Status
						</th>
						<th
							scope="col"
							class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Signal (30)
						</th>
						<th
							scope="col"
							class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Last Update
						</th>
						<th
							scope="col"
							class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600"
						>
							Action
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 bg-white">
					<tr v-for="d in props.devices" :key="d.id" class="hover:bg-gray-50/60">
						<td class="whitespace-nowrap px-5 py-4">
							<div class="font-medium text-gray-900">{{ d.name }}</div>
							<div class="text-sm text-gray-500">{{ d.id }}</div>
						</td>
						<td class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ d.type }}</td>
						<td class="whitespace-nowrap px-5 py-4">
							<span
								:class="statusBadgeClasses(d.status)"
								class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
							>
								{{ statusLabel(d.status) }}
							</span>
						</td>
						<td class="whitespace-nowrap px-5 py-4">
							<div class="flex items-center gap-3">
								<div class="h-7 w-32 rounded-lg bg-gray-50 ring-1 ring-inset ring-gray-100">
									<svg
										viewBox="0 0 120 28"
										class="h-7 w-32 text-gray-800"
										aria-hidden="true"
									>
										<polyline
											:points="sparkPolylinePoints(d.spark)"
											fill="none"
											stroke="currentColor"
											stroke-width="1.8"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</div>
								<div class="text-sm text-gray-700">
									<span v-if="lastValue(d.spark) !== null" class="font-semibold">
										{{ Math.round(lastValue(d.spark) ?? 0) }} dBm
									</span>
									<span v-else class="text-gray-500">—</span>
								</div>
							</div>
						</td>
						<td class="whitespace-nowrap px-5 py-4 text-sm text-gray-700">{{ d.lastUpdate }}</td>
						<td class="whitespace-nowrap px-5 py-4 text-right">
							<div v-if="editingId === d.id" class="flex items-center justify-end gap-2">
								<input
									v-model="draftName"
									type="text"
									class="w-44 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
								/>
								<button
									type="button"
									class="inline-flex items-center rounded-xl bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
									@click="saveEdit(d)"
								>
									Save
								</button>
								<button
									type="button"
									class="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
									@click="cancelEdit"
								>
									Cancel
								</button>
							</div>
							<div v-else class="flex items-center justify-end gap-2">
								<button
									type="button"
									class="inline-flex items-center rounded-xl bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
									@click="startEdit(d)"
								>
									Edit name
								</button>
								<button
									type="button"
									class="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
									@click="removeDevice(d)"
								>
									Delete
								</button>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
