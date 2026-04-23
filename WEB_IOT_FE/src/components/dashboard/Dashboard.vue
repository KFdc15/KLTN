<script setup lang="ts">
import { computed, reactive } from 'vue'

import {
	AdjustmentsHorizontalIcon,
	BeakerIcon,
	CameraIcon,
	CpuChipIcon,
	ExclamationTriangleIcon,
	FireIcon,
	LightBulbIcon,
	SignalIcon,
	WifiIcon,
} from '@heroicons/vue/24/outline'

import DeviceCard from './DeviceCard.vue'
import { useDeviceStore, type Device } from '../../store/deviceStore'

const store = useDeviceStore()

type MetricItem = {
	key: 'temperature' | 'humidity'
	label: string
	value: string
}

function splitMetricValue(value: string) {
	const v = (value ?? '').trim()
	if (!v || v === '—') return { num: '—', unit: '' }
	const m = v.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/)
	if (!m) return { num: v, unit: '' }
	return { num: m[1] ?? v, unit: (m[2] ?? '').trim() }
}

const summaryCards = computed(() => [
	{
		icon: CpuChipIcon,
		title: 'Total Devices',
		value: store.totalDevices,
		description: 'All registered devices',
	},
	{
		icon: WifiIcon,
		title: 'Active Devices',
		value: store.activeDevices,
		description: 'Currently online',
	},
	{
		icon: SignalIcon,
		title: 'Offline Devices',
		value: store.offlineDevices,
		description: 'Require attention',
	},
	{
		icon: ExclamationTriangleIcon,
		title: 'Alerts',
		value: store.alerts,
		description: 'Warnings detected',
	},
])

const acTargetDraft = reactive<Record<string, number>>({})

function canonicalType(type: string) {
	const raw = (type ?? '').trim()
	const k = raw.toLowerCase()

	// Backward-compatible aliases (older device types in DB)
	if (k === 'temperature sensor' || k === 'temp sensor') return 'Temperature'
	if (k === 'humidity sensor') return 'Humidity'
	if (k === 'signal monitor') return 'Signal Monitor'
	if (k === 'edge gateway') return 'Edge Gateway'
	if (k === 'multi-sensor node') return 'Multi-Sensor Node'

	// Canonical types
	if (k === 'temperature') return 'Temperature'
	if (k === 'humidity') return 'Humidity'
	if (k === 'light') return 'Light'
	if (k === 'camera') return 'Camera'
	if (k === 'air conditioner' || k === 'ac') return 'Air Conditioner'

	return raw
}

function iconForDevice(deviceType: string) {
	switch (canonicalType(deviceType)) {
		case 'Light':
			return LightBulbIcon
		case 'Camera':
			return CameraIcon
		case 'Humidity':
			// Closest available outline icon in Heroicons.
			return BeakerIcon
		case 'Temperature':
			// Heroicons outline set doesn't include a thermometer icon.
			return FireIcon
		case 'Air Conditioner':
			return AdjustmentsHorizontalIcon
		case 'Signal Monitor':
			return SignalIcon
		case 'Edge Gateway':
			return CpuChipIcon
		case 'Multi-Sensor Node':
			return CpuChipIcon
		default:
			return CpuChipIcon
	}
}

function acDraftValue(d: Device) {
	return acTargetDraft[d.id] ?? d.acTargetTempC ?? 24
}

function onAcDraftInput(deviceId: string, e: Event) {
	const el = e.target as HTMLInputElement | null
	if (!el) return
	const v = Number(el.value)
	if (!Number.isFinite(v)) return
	acTargetDraft[deviceId] = v
}

async function onAcTargetChange(d: Device, e: Event) {
	onAcDraftInput(d.id, e)
	const raw = acDraftValue(d)
	const clamped = Math.max(16, Math.min(30, Math.round(raw)))
	acTargetDraft[d.id] = clamped
	await store.setAirConditioner({ id: d.id, targetTempC: clamped })
}

async function toggleLight(d: Device) {
	const nextOn = !(d.lightOn ?? false)
	await store.setLight({ id: d.id, on: nextOn })
}

async function toggleAirConditioner(d: Device) {
	const nextOn = !(d.acOn ?? false)
	await store.setAirConditioner({ id: d.id, on: nextOn })
}

function statusPill(on: boolean | undefined) {
	if (on === true) return 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200'
	if (on === false) return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200'
	return 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200'
}

function statusBadgeClasses(status: string) {
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

function statusLabel(status: string) {
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

function metricGridCols(count: number) {
	switch (count) {
		case 1:
			return 'grid-cols-1'
		case 2:
			return 'grid-cols-2'
		default:
			return 'grid-cols-3'
	}
}

function metricsForDevice(deviceType: string, telemetry: { temperatureC: number; humidityPct: number } | null) {
	const t = telemetry
	const temperature: MetricItem = {
		key: 'temperature',
		label: 'Temp',
		value: t ? `${t.temperatureC.toFixed(1)}°C` : '—',
	}
	const humidity: MetricItem = {
		key: 'humidity',
		label: 'Humidity',
		value: t ? `${Math.round(t.humidityPct)}%` : '—',
	}

	switch (canonicalType(deviceType)) {
		case 'Temperature':
			return [temperature]
		case 'Humidity':
			return [humidity]
		case 'Multi-Sensor Node':
			return [temperature, humidity]
			case 'Signal Monitor':
				return []
			case 'Edge Gateway':
				return []
		case 'Light':
			// Light card should focus on control only (no metric tile).
			return []
		case 'Camera':
			// Camera card already has live view; don't show signal metric.
			return []
		case 'Air Conditioner':
			// AC card should focus on control only.
			return []
		default:
				return []
	}
}

</script>

<template>
	<div class="space-y-6">
		<section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<DeviceCard
				v-for="card in summaryCards"
				:key="card.title"
				:icon="card.icon"
				:title="card.title"
				:value="card.value"
				:description="card.description"
			/>
		</section>

		<section class="rounded-2xl bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 class="text-base font-semibold text-gray-900">Devices</h2>
					<p class="mt-1 text-sm text-gray-500">Quick status and latest telemetry for each device.</p>
				</div>
				<p v-if="store.loading" class="text-sm text-gray-500">Loading…</p>
			</div>

			<p v-if="store.error" class="mt-3 text-sm text-red-700">{{ store.error }}</p>
			<p v-else-if="store.devices.length === 0" class="mt-3 text-sm text-gray-600">
				No devices yet. Add your first device to start monitoring.
			</p>

			<div v-else class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<article
					v-for="d in store.devices"
					:key="d.id"
					class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-center gap-3">
							<div class="rounded-xl bg-gray-100 p-2.5 text-gray-700">
									<component :is="iconForDevice(d.type)" class="h-6 w-6" aria-hidden="true" />
							</div>
							<div>
								<p class="text-sm font-semibold text-gray-900">{{ d.name }}</p>
									<p class="mt-0.5 text-xs text-gray-500">{{ d.type }}</p>
							</div>
						</div>
						<span
							:class="statusBadgeClasses(d.status)"
							class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
						>
							{{ statusLabel(d.status) }}
						</span>
					</div>

					<div
						v-if="metricsForDevice(d.type, d.latestTelemetry).length"
						class="mt-4 grid gap-2"
						:class="metricGridCols(metricsForDevice(d.type, d.latestTelemetry).length)"
					>
						<div
							v-for="m in metricsForDevice(d.type, d.latestTelemetry)"
							:key="m.key"
							class="rounded-xl bg-gray-50 px-3 py-2"
						>
							<p class="text-[11px] font-medium text-gray-500">{{ m.label }}</p>
							<div v-if="m.key === 'temperature' || m.key === 'humidity'" class="mt-2 flex justify-center">
								<div
									class="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white ring-1 ring-inset ring-gray-200"
								>
									<p class="text-lg font-semibold text-gray-900">{{ splitMetricValue(m.value).num }}</p>
									<p class="text-[11px] font-medium text-gray-500">{{ splitMetricValue(m.value).unit }}</p>
								</div>
							</div>
							<p v-else class="mt-0.5 text-sm font-semibold text-gray-900">{{ m.value }}</p>
						</div>
					</div>

					<div v-if="canonicalType(d.type) === 'Light'" class="mt-4 rounded-xl bg-gray-50 px-3 py-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-xs font-medium text-gray-600">Light</p>
							<span
								:class="statusPill(d.lightOn)"
								class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
							>
								{{ d.lightOn === true ? 'ON' : d.lightOn === false ? 'OFF' : '—' }}
							</span>
						</div>
						<div class="mt-4 flex items-center justify-center">
							<button
								type="button"
								class="group grid h-28 w-28 place-items-center rounded-full bg-gray-900 text-white shadow-sm ring-8 ring-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
								:class="d.lightOn ? 'ring-green-200' : 'ring-gray-200'"
								:disabled="d.status === 'OFFLINE' || store.isLightBusy(d.id)"
								@click="toggleLight(d)"
							>
								<span class="text-xl font-semibold tracking-wide">{{ d.lightOn ? 'ON' : 'OFF' }}</span>
							</button>
						</div>
						<p v-if="d.status === 'OFFLINE'" class="mt-2 text-[11px] text-gray-500">Device is offline.</p>
					</div>

					<div v-else-if="canonicalType(d.type) === 'Air Conditioner'" class="mt-4 rounded-xl bg-gray-50 px-3 py-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-xs font-medium text-gray-600">Air Conditioner</p>
							<span
								:class="statusPill(d.acOn)"
								class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
							>
								{{ d.acOn === true ? 'ON' : d.acOn === false ? 'OFF' : '—' }}
							</span>
						</div>

						<div class="mt-3">
							<button
								type="button"
								class="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
								:disabled="d.status === 'OFFLINE' || store.isAcBusy(d.id)"
								@click="toggleAirConditioner(d)"
							>
								{{ d.acOn ? 'Turn off' : 'Turn on' }}
							</button>
						</div>

						<div class="mt-3">
							<div class="flex items-center justify-between gap-3">
								<p class="text-[11px] font-medium text-gray-500">Target temperature</p>
								<p class="text-xs font-semibold text-gray-900">{{ Math.round(acDraftValue(d)) }}°C</p>
							</div>
							<input
								type="range"
								min="16"
								max="30"
								step="1"
								class="mt-2 w-full"
								:value="acDraftValue(d)"
								:disabled="d.status === 'OFFLINE' || store.isAcTargetBusy(d.id)"
								@input="onAcDraftInput(d.id, $event)"
								@change="onAcTargetChange(d, $event)"
							/>
						</div>

						<p v-if="d.status === 'OFFLINE'" class="mt-2 text-[11px] text-gray-500">Device is offline.</p>
					</div>

					<div v-else-if="canonicalType(d.type) === 'Camera'" class="mt-4 overflow-hidden rounded-xl bg-gray-50">
						<div class="flex items-center justify-between px-3 py-2">
							<p class="text-xs font-medium text-gray-600">Live view</p>
							<p class="text-[11px] text-gray-500">Realtime</p>
						</div>
						<div class="aspect-video w-full bg-gray-100">
							<img
								v-if="d.cameraFrameUrl"
								:src="d.cameraFrameUrl"
								alt="Camera live frame"
								class="h-full w-full object-cover"
							/>
							<div v-else class="grid h-full place-items-center">
								<p class="text-sm text-gray-500">No frames yet.</p>
							</div>
						</div>
					</div>

					<div class="mt-4 flex items-center justify-between gap-3">
						<p class="text-xs text-gray-500">Last update</p>
						<p class="text-xs font-semibold text-gray-900">{{ store.getLastUpdateLabel(d) }}</p>
					</div>
				</article>
			</div>
		</section>

	</div>
</template>
