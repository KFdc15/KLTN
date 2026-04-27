<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { useDeviceStore, type DiscoverableDevice } from '../../store/deviceStore'

const store = useDeviceStore()

type SearchMode = 'wired' | 'wifi'

const mode = ref<SearchMode | null>(null)
const error = ref<string | null>(null)
const noticeVisible = ref(false)

const loadingWired = ref(false)
const wiredDevices = ref<DiscoverableDevice[]>([])

const loadingWifi = ref(false)
const wifiDevices = ref<DiscoverableDevice[]>([])
const selectedWifiDevice = ref<DiscoverableDevice | null>(null)
const wifiDeviceName = ref('')
const wifiActivationCode = ref('')

const busyConnectWiredUid = ref<string | null>(null)
const busyConnectWifiUid = ref<string | null>(null)

let noticeTimer: number | null = null

const noticeTitle = computed(() => {
	if (error.value) return 'Could not connect device'
	return 'Waiting for device to come online...'
})

const noticeBody = computed(() => {
	if (error.value) return error.value
	return 'Once the device starts sending MQTT telemetry, it will appear as ONLINE.'
})

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

async function loadWired() {
	if (loadingWired.value) return
	loadingWired.value = true
	error.value = null
	try {
		wiredDevices.value = await store.discoverDevices({ method: 'wired' })
	} catch (err) {
		showError(err instanceof Error ? err.message : 'Failed to discover wired devices', 3000)
	} finally {
		loadingWired.value = false
	}
}

async function loadWifi() {
	if (loadingWifi.value) return
	loadingWifi.value = true
	error.value = null
	try {
		wifiDevices.value = await store.discoverDevices({ method: 'wifi' })
	} catch (err) {
		showError(err instanceof Error ? err.message : 'Failed to discover Wi‑Fi devices', 3000)
	} finally {
		loadingWifi.value = false
	}
}

async function chooseWired() {
	mode.value = 'wired'
	await loadWired()
}

async function chooseWifi() {
	mode.value = 'wifi'
	selectedWifiDevice.value = null
	wifiDeviceName.value = ''
	wifiActivationCode.value = ''
	await loadWifi()
}

function startWifiConnect(d: DiscoverableDevice) {
	selectedWifiDevice.value = d
	wifiDeviceName.value = (d.name ?? '').trim() || ''
	wifiActivationCode.value = ''
}

async function connectWired(d: DiscoverableDevice) {
	if (!d?.deviceUid) return
	if (busyConnectWiredUid.value) return
	busyConnectWiredUid.value = d.deviceUid
	error.value = null
	try {
		await store.claimWiredDevice({ deviceUid: d.deviceUid })
		showSuccess(3000)
		await loadWired()
	} catch (err) {
		showError(err instanceof Error ? err.message : 'Failed to connect device', 3000)
	} finally {
		busyConnectWiredUid.value = null
	}
}

async function connectWifi() {
	const d = selectedWifiDevice.value
	if (!d?.deviceUid) return
	if (busyConnectWifiUid.value) return
	busyConnectWifiUid.value = d.deviceUid
	error.value = null
	try {
		await store.claimWifiDevice({
			deviceUid: d.deviceUid,
			name: wifiDeviceName.value,
			activationCode: wifiActivationCode.value,
		})
		showSuccess(3000)
		selectedWifiDevice.value = null
		wifiDeviceName.value = ''
		wifiActivationCode.value = ''
		await loadWifi()
	} catch (err) {
		showError(err instanceof Error ? err.message : 'Failed to connect device', 3000)
	} finally {
		busyConnectWifiUid.value = null
	}
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-3xl flex-col justify-center">
		<div class="rounded-2xl bg-white p-6 shadow-sm">
			<h2 class="text-base font-semibold text-gray-900">Add Device</h2>
			<p class="mt-1 text-sm text-gray-500">Choose how you want to find and connect your device.</p>

			<div
				v-if="noticeVisible"
				class="mt-6 rounded-2xl border p-4"
				:class="error ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'"
			>
				<p class="text-sm font-semibold" :class="error ? 'text-red-800' : 'text-gray-900'">
					{{ noticeTitle }}
				</p>
				<p class="mt-1 text-sm" :class="error ? 'text-red-700' : 'text-gray-600'">{{ noticeBody }}</p>
			</div>

			<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<button
					type="button"
					class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-gray-300"
					@click="chooseWired"
				>
					<p class="text-sm font-semibold text-gray-900">Find via cable</p>
					<p class="mt-1 text-sm text-gray-500">Show devices connected directly (wired).</p>
				</button>
				<button
					type="button"
					class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-gray-300"
					@click="chooseWifi"
				>
					<p class="text-sm font-semibold text-gray-900">Find on Wi‑Fi</p>
					<p class="mt-1 text-sm text-gray-500">Show devices on the same Wi‑Fi network.</p>
				</button>
			</div>

			<div v-if="mode === 'wired'" class="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-semibold text-gray-900">Wired devices</p>
					<button
						type="button"
						class="text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
						:disabled="loadingWired"
						@click="loadWired"
					>
						{{ loadingWired ? 'Refreshing…' : 'Refresh' }}
					</button>
				</div>

				<p v-if="loadingWired" class="mt-3 text-sm text-gray-500">Scanning…</p>
				<p v-else-if="wiredDevices.length === 0" class="mt-3 text-sm text-gray-600">No wired devices found.</p>

				<ul v-else class="mt-4 space-y-3">
					<li
						v-for="d in wiredDevices"
						:key="d.id"
						class="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
					>
						<div>
							<p class="text-sm font-semibold text-gray-900">{{ d.type }}</p>
							<p class="mt-0.5 text-xs text-gray-500">{{ d.deviceUid }} · {{ d.model }}</p>
						</div>
						<button
							type="button"
							class="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
							:disabled="d.status === 'OFFLINE' || busyConnectWiredUid === d.deviceUid"
							@click="connectWired(d)"
						>
							{{ busyConnectWiredUid === d.deviceUid ? 'Connecting…' : 'Connect' }}
						</button>
					</li>
				</ul>
			</div>

			<div v-else-if="mode === 'wifi'" class="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-semibold text-gray-900">Wi‑Fi devices</p>
					<button
						type="button"
						class="text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
						:disabled="loadingWifi"
						@click="loadWifi"
					>
						{{ loadingWifi ? 'Refreshing…' : 'Refresh' }}
					</button>
				</div>

				<p v-if="loadingWifi" class="mt-3 text-sm text-gray-500">Scanning…</p>
				<p v-else-if="wifiDevices.length === 0" class="mt-3 text-sm text-gray-600">No Wi‑Fi devices found.</p>

				<ul v-else class="mt-4 space-y-3">
					<li
						v-for="d in wifiDevices"
						:key="d.id"
						class="rounded-2xl bg-white px-4 py-3 shadow-sm"
					>
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-sm font-semibold text-gray-900">{{ d.type }}</p>
								<p class="mt-0.5 text-xs text-gray-500">{{ d.deviceUid }} · {{ d.model }}</p>
							</div>
							<button
								type="button"
								class="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
								:disabled="d.status === 'OFFLINE'"
								@click="startWifiConnect(d)"
							>
								Connect
							</button>
						</div>

						<div v-if="selectedWifiDevice?.deviceUid === d.deviceUid" class="mt-4 rounded-2xl bg-gray-50 p-4">
							<p class="text-sm font-semibold text-gray-900">Enter device info</p>
							<form class="mt-4 space-y-4" @submit.prevent="connectWifi">
								<div>
									<label class="text-sm font-medium text-gray-700">Device name</label>
									<input
										v-model="wifiDeviceName"
										required
										type="text"
										placeholder="e.g. Living Room Sensor"
										class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
									/>
								</div>
								<div>
									<label class="text-sm font-medium text-gray-700">Activation code</label>
									<input
										v-model="wifiActivationCode"
										required
										type="text"
										autocomplete="one-time-code"
										placeholder="e.g. ABC123"
										class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
									/>
								</div>
								<div class="flex items-center justify-end gap-3 pt-1">
									<button
										type="button"
										class="text-sm font-semibold text-gray-700 hover:text-gray-900"
										@click="selectedWifiDevice = null"
									>
										Cancel
									</button>
									<button
										type="submit"
										:disabled="busyConnectWifiUid === d.deviceUid"
										class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{{ busyConnectWifiUid === d.deviceUid ? 'Connecting…' : 'Connect' }}
									</button>
								</div>
							</form>
						</div>
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>
