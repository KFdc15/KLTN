<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import { useDeviceStore } from '../../store/deviceStore'

const store = useDeviceStore()

const activationCode = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)
const noticeVisible = ref(false)

let noticeTimer: number | null = null

function showNotice(ms = 3000) {
	noticeVisible.value = true
	if (noticeTimer) window.clearTimeout(noticeTimer)
	noticeTimer = window.setTimeout(() => {
		noticeVisible.value = false
	}, ms)
}

function showError(message: string, ms = 3000) {
	error.value = message
	showNotice(ms)
}

function showSuccess(ms = 3000) {
	error.value = null
	showNotice(ms)
}

onBeforeUnmount(() => {
	if (noticeTimer) window.clearTimeout(noticeTimer)
})

async function submit() {
	error.value = null
	if (!activationCode.value.trim()) return
	if (submitting.value) return
	submitting.value = true

	try {
		await store.claimDevice({ activationCode: activationCode.value.trim() })
		activationCode.value = ''
		showSuccess(3000)
	} catch (err) {
		showError(err instanceof Error ? err.message : 'Failed to connect device', 3000)
	} finally {
		submitting.value = false
	}
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-xl flex-col justify-center">
		<div class="rounded-2xl bg-white p-6 shadow-sm">
			<h2 class="text-base font-semibold text-gray-900">Connect a Device</h2>
			<p class="mt-1 text-sm text-gray-500">Enter the activation code printed on your device or packaging.</p>

			<div
				v-if="noticeVisible"
				class="mt-6 rounded-2xl border p-4"
				:class="error ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'"
			>
				<p class="text-sm font-semibold" :class="error ? 'text-red-800' : 'text-gray-900'">
					{{ error ? 'Could not connect device' : 'Waiting for device to come online...' }}
				</p>
				<p class="mt-1 text-sm" :class="error ? 'text-red-700' : 'text-gray-600'">
					{{
						error
							? error
							: 'Once the device starts sending MQTT telemetry, it will appear as ONLINE.'
					}}
				</p>
			</div>

			<form class="mt-6 space-y-5" @submit.prevent="submit">
				<div>
					<label class="text-sm font-medium text-gray-700">Activation Code</label>
					<input
						v-model="activationCode"
						required
						type="text"
						autocomplete="one-time-code"
						placeholder="e.g. ABC123"
						class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
					/>
				</div>

				<div class="flex items-center justify-end gap-3 pt-2">
					<button
						type="submit"
						:disabled="submitting"
						class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{{ submitting ? 'Connecting…' : 'Connect Device' }}
					</button>
				</div>
			</form>
		</div>
	</div>
</template>
