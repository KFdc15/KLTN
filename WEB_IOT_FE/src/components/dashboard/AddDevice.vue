<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useDeviceStore } from '../../store/deviceStore'

const router = useRouter()
const store = useDeviceStore()

const uid = ref('')
const name = ref('')
const type = ref('Temperature Sensor')
const error = ref<string | null>(null)

async function submit() {
	error.value = null
	if (!uid.value.trim() || !name.value.trim()) return

	const ok = await store.addDevice({
		uid: uid.value.trim(),
		name: name.value.trim(),
		type: type.value,
	})

	if (ok) {
		router.push('/app/devices')
		return
	}

	error.value = store.error ?? 'Failed to add device'
}
</script>

<template>
	<div class="mx-auto w-full max-w-3xl">
		<div class="rounded-2xl bg-white p-6 shadow-sm">
			<h2 class="text-base font-semibold text-gray-900">Add Device</h2>
			<p class="mt-1 text-sm text-gray-500">Register a new IoT device.</p>

			<form class="mt-6 space-y-5" @submit.prevent="submit">
				<div>
					<label class="text-sm font-medium text-gray-700">Device UID</label>
					<input
						v-model="uid"
						required
						type="text"
						placeholder="e.g. dev-001"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
					/>
				</div>

				<div>
					<label class="text-sm font-medium text-gray-700">Device Name</label>
					<input
						v-model="name"
						required
						type="text"
						placeholder="e.g. LPWAN Sensor 01"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
					/>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label class="text-sm font-medium text-gray-700">Device Type</label>
						<select
							v-model="type"
							class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
						>
							<option>Temperature Sensor</option>
							<option>Humidity Sensor</option>
							<option>Signal Monitor</option>
							<option>Edge Gateway</option>
							<option>Multi-Sensor Node</option>
						</select>
					</div>
				</div>

				<p v-if="error" class="text-sm text-red-700">{{ error }}</p>

				<div class="flex items-center justify-end gap-3 pt-2">
					<button
						type="button"
						class="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
						@click="router.push('/app/devices')"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
					>
						Add Device
					</button>
				</div>
			</form>
		</div>
	</div>
</template>
