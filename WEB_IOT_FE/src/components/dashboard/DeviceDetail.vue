<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Chart from 'chart.js/auto'

import { useDeviceStore, type AlertRuleConfig, type CameraFramePoint, type ControlConfig, type Device, type RuntimePoint, type TelemetryPoint } from '../../store/deviceStore'

const store = useDeviceStore()
const route = useRoute()
const router = useRouter()

const deviceId = computed(() => String(route.params.id ?? ''))

const loading = ref(false)
const busyAction = ref(false)
const busyControl = ref(false)

const device = computed<Device | null>(() => {
	return store.devices.find((d) => d.id === deviceId.value) ?? null
})

const isBlocked = computed(() => device.value?.telemetryBlocked ?? false)

function connectionLabel(deviceUid: string | undefined, model: string | undefined) {
	const uid = (deviceUid ?? '').toLowerCase()
	const m = (model ?? '').toLowerCase()
	if (m.includes('eth') || m.includes('ethernet') || uid.includes('eth')) return 'Wired'
	if (m.includes('wifi') || uid.includes('wifi')) return 'Wi-Fi'
	return '—'
}

const connection = computed(() => connectionLabel(device.value?.deviceUid, device.value?.model))

const lastActivityLabel = computed(() => {
	if (!device.value) return '—'
	return store.getLastUpdateLabel(device.value)
})

function defaultControlConfig(deviceType: string | undefined): ControlConfig {
	const base: ControlConfig = {
		lightToggle: false,
		acToggle: false,
		acTargetTemp: false,
	}
	const type = (deviceType ?? '').toLowerCase()
	if (type.includes('light')) return { ...base, lightToggle: true }
	if (type.includes('air') || type.includes('ac')) {
		return { ...base, acToggle: true, acTargetTemp: true }
	}
	return base
}

const controlConfig = computed<ControlConfig>(() => {
	if (!device.value) return defaultControlConfig('')
	return device.value.controlConfig ?? defaultControlConfig(device.value.type)
})

type AlertMetric = 'temperature' | 'humidity' | 'signal'

const alertRulesLoading = ref(false)
const alertRulesSaving = ref(false)
const alertRulesError = ref<string | null>(null)
const alertDefaults = ref<AlertRuleConfig>({})
const alertResolved = ref<AlertRuleConfig>({})
const alertCapabilities = ref<AlertMetric[]>([])
const alertInputs = reactive({
	temperature: '',
	humidity: '',
	signal: '',
})

function fmtAlertValue(value: number | null | undefined) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
	return `${value}`
}

function metricUnit(metric: AlertMetric) {
	if (metric === 'temperature') return '°C'
	if (metric === 'humidity') return '%'
	return 'dBm'
}

function setAlertInputs(config: AlertRuleConfig) {
	alertInputs.temperature = fmtAlertValue(config.temperature?.threshold)
	alertInputs.humidity = fmtAlertValue(config.humidity?.threshold)
	alertInputs.signal = fmtAlertValue(config.signal?.threshold)
}

function parseAlertInput(value: string) {
	const trimmed = value.trim()
	if (!trimmed || trimmed === '—') return undefined
	const n = Number(trimmed)
	return Number.isFinite(n) ? n : undefined
}

function buildAlertPayload(): AlertRuleConfig {
	const payload: AlertRuleConfig = {}
	const defaults = alertDefaults.value

	const metrics: AlertMetric[] = ['temperature', 'humidity', 'signal']
	for (const metric of metrics) {
		if (!alertCapabilities.value.includes(metric)) continue
		const threshold = parseAlertInput(alertInputs[metric])
		const defaultThreshold = defaults[metric]?.threshold
		if (typeof threshold === 'number' && threshold !== defaultThreshold) {
			payload[metric] = { threshold }
		}
	}

	return payload
}

async function loadAlertRules() {
	if (!device.value) return
	alertRulesLoading.value = true
	alertRulesError.value = null
	try {
		const data = await store.getDeviceAlertRules(device.value.id)
		alertDefaults.value = data.defaults
		alertResolved.value = data.resolved
		alertCapabilities.value = data.capabilities as AlertMetric[]
		setAlertInputs(data.resolved)
	} catch (err) {
		alertRulesError.value = err instanceof Error ? err.message : 'Failed to load alert rules'
	} finally {
		alertRulesLoading.value = false
	}
}

async function saveAlertRules() {
	if (!device.value || alertRulesSaving.value) return
	alertRulesSaving.value = true
	alertRulesError.value = null
	try {
		const data = await store.updateDeviceAlertRules({
			id: device.value.id,
			rules: buildAlertPayload(),
		})
		alertDefaults.value = data.defaults
		alertResolved.value = data.resolved
		alertCapabilities.value = data.capabilities as AlertMetric[]
		setAlertInputs(data.resolved)
	} catch (err) {
		alertRulesError.value = err instanceof Error ? err.message : 'Failed to update alert rules'
	} finally {
		alertRulesSaving.value = false
	}
}

function resetAlertRules() {
	setAlertInputs(alertDefaults.value)
}

async function updateControlConfig(patch: Partial<ControlConfig>) {
	if (!device.value) return
	if (busyControl.value) return
	busyControl.value = true
	try {
		await store.updateDeviceControlConfig({ id: device.value.id, patch })
	} finally {
		busyControl.value = false
	}
}

function onControlToggle(key: keyof ControlConfig, e: Event) {
	const el = e.target as HTMLInputElement | null
	if (!el) return
	void updateControlConfig({ [key]: el.checked } as Partial<ControlConfig>)
}

const powerW = computed(() => {
	const d = device.value
	if (!d) return null
	const uid = (d.deviceUid ?? '').trim().toUpperCase()
	const type = (d.type ?? '').toLowerCase()

	// Runtime-dependent devices
	if (type.includes('air') || type.includes('ac')) return d.acOn ? 1200 : 0
	if (type.includes('light')) return d.lightOn ? 9 : 0

	// Seeded/demo devices: provide stable estimated power per device
	if (uid === 'WIFI_001') return 0.8
	if (uid === 'CAMERA_ETH_001') return 6

	// Fallbacks by type
	if (type.includes('camera') || type.includes('cam')) return 6
	if (type.includes('humid')) return 0.8
	if (type.includes('temp') || type.includes('thermo')) return 0.2

	return null
})

const latestTelemetry = computed<TelemetryPoint | null>(() => device.value?.latestTelemetry ?? null)

type DeviceKind = 'temperature' | 'humidity' | 'light' | 'ac' | 'camera' | 'generic'

const deviceKind = computed<DeviceKind>(() => {
	const d = device.value
	if (!d) return 'generic'
	const t = (d.type ?? '').toLowerCase()
	const m = (d.model ?? '').toLowerCase()
	const s = `${t} ${m}`
	if (s.includes('camera') || s.includes('cam')) return 'camera'
	if (s.includes('light') || s.includes('lamp')) return 'light'
	if (s.includes('air') || s.includes('ac') || s.includes('condition')) return 'ac'
	if (s.includes('humid')) return 'humidity'
	if (s.includes('temp') || s.includes('thermo')) return 'temperature'
	return 'generic'
})

const isLightType = computed(() => deviceKind.value === 'light')
const isAcType = computed(() => deviceKind.value === 'ac')
const availableControlCount = computed(() => {
	if (isAcType.value) return 2
	if (isLightType.value) return 1
	return 0
})

const windowPoints = computed<TelemetryPoint[]>(() => {
	if (!device.value) return []
	return store.getTelemetryWindow(device.value.id)
})

const runtimePoints = computed<RuntimePoint[]>(() => {
	if (!device.value) return []
	return store.getRuntimeWindow(device.value.id)
})

const cameraFrames = computed<CameraFramePoint[]>(() => {
	if (!device.value) return []
	return store.getCameraFrameWindow(device.value.id)
})

const cameraFrameRows = computed(() => {
	return [...cameraFrames.value]
		.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
		.slice(0, 30)
})

const telemetryRows = computed(() => {
	return [...windowPoints.value]
		.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
		.slice(0, 30)
})

const normalizedRuntimeAsc = computed(() => {
	const d = device.value
	if (!d) return [] as Array<RuntimePoint & { lightOn?: boolean; acOn?: boolean; acTargetTempC?: number }>
	const points = [...runtimePoints.value].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
	let lightOn = d.lightOn
	let acOn = d.acOn
	let acTargetTempC = d.acTargetTempC
	return points.map((p) => {
		if (typeof p.lightOn === 'boolean') lightOn = p.lightOn
		if (typeof p.acOn === 'boolean') acOn = p.acOn
		if (typeof p.acTargetTempC === 'number') acTargetTempC = p.acTargetTempC
		return {
			...p,
			lightOn,
			acOn,
			acTargetTempC,
		}
	})
})

const runtimeRows = computed(() => {
	return [...normalizedRuntimeAsc.value]
		.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
		.slice(0, 30)
})

const latestActivityCards = computed(() => {
	const d = device.value
	if (!d) return [] as Array<{ label: string; value: string; unit?: string }>
	const kind = deviceKind.value
	if (kind === 'temperature') {
		return [
			{ label: 'Temperature', value: fmtNumber(latestTelemetry.value?.temperatureC, 2), unit: '°C' },
			{ label: 'Signal', value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0), unit: 'dBm' },
		]
	}
	if (kind === 'humidity') {
		return [
			{ label: 'Humidity', value: fmtNumber(latestTelemetry.value?.humidityPct, 2), unit: '%' },
			{ label: 'Signal', value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0), unit: 'dBm' },
		]
	}
	if (kind === 'light') {
		const status = typeof d.lightOn === 'boolean' ? (d.lightOn ? 'ON' : 'OFF') : '—'
		return [{ label: 'Light', value: status }]
	}
	if (kind === 'ac') {
		const status = typeof d.acOn === 'boolean' ? (d.acOn ? 'ON' : 'OFF') : '—'
		return [{ label: 'Air conditioner', value: status }]
	}
	if (kind === 'camera') {
		return [{ label: 'Frame', value: d.cameraFrameUrl ? 'RECEIVED' : '—' }]
	}
	return [
		{ label: 'Temperature', value: fmtNumber(latestTelemetry.value?.temperatureC, 2), unit: '°C' },
		{ label: 'Humidity', value: fmtNumber(latestTelemetry.value?.humidityPct, 2), unit: '%' },
		{ label: 'Signal', value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0), unit: 'dBm' },
	]
})

const latestActivityTs = computed(() => {
	const kind = deviceKind.value
	if (kind === 'light' || kind === 'ac') {
		const last = normalizedRuntimeAsc.value[normalizedRuntimeAsc.value.length - 1]
		return last?.ts ?? latestTelemetry.value?.ts ?? null
	}
	if (kind === 'camera') {
		return cameraFrameRows.value[0]?.ts ?? device.value?.lastSeenAt ?? null
	}
	return latestTelemetry.value?.ts ?? null
})

const activityCount = computed(() => {
	const kind = deviceKind.value
	if (kind === 'light' || kind === 'ac') return runtimeRows.value.length
	if (kind === 'camera') return cameraFrameRows.value.length
	return telemetryRows.value.length
})

function statusBadgeClasses(status: Device['status']) {
	switch (status) {
		case 'ONLINE':
			return 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200'
		case 'OFFLINE':
			return 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200'
		case 'WARNING':
			return 'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200'
		case 'DISCONNECTED':
			return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200'
		default:
			return 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200'
	}
}

function statusLabel(status: Device['status']) {
	switch (status) {
		case 'ONLINE':
			return 'ONLINE'
		case 'OFFLINE':
			return 'OFFLINE'
		case 'WARNING':
			return 'WARNING'
		case 'DISCONNECTED':
			return 'DISCONNECTED'
		default:
			return status
	}
}

function fmtNumber(v: number | null | undefined, digits = 2) {
	if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
	return v.toFixed(digits)
}

function backToDevices() {
	router.push('/app/devices')
}

async function onDisconnectDevice() {
	if (!device.value || busyAction.value) return
	const ok = window.confirm('Disconnect this device and block telemetry?')
	if (!ok) return
	busyAction.value = true
	try {
		await store.disconnectDevice({ id: device.value.id })
	} finally {
		busyAction.value = false
	}
}

async function onReconnectDevice() {
	if (!device.value || busyAction.value) return
	busyAction.value = true
	try {
		await store.reconnectDevice({ id: device.value.id })
	} finally {
		busyAction.value = false
	}
}

const chartEl = ref<HTMLCanvasElement | null>(null)
const colorRssiEl = ref<HTMLElement | null>(null)
const colorTempEl = ref<HTMLElement | null>(null)
const colorHumEl = ref<HTMLElement | null>(null)
let chart: Chart | null = null

function defaultTextColor() {
	return window.getComputedStyle(document.body).color || 'currentColor'
}

function colorFrom(el: HTMLElement | null) {
	if (!el) return defaultTextColor()
	return window.getComputedStyle(el).color || defaultTextColor()
}

function buildChart() {
	if (!chartEl.value) return
	if (!device.value) return
	if (chart) {
		chart.destroy()
		chart = null
	}

	const kind = deviceKind.value
	const cRssi = colorFrom(colorRssiEl.value)
	const cTemp = colorFrom(colorTempEl.value)
	const cHum = colorFrom(colorHumEl.value)

	if (kind === 'light' || kind === 'ac') {
		const points = [...normalizedRuntimeAsc.value]
		const labels = points.map((p) => new Date(p.ts).toLocaleTimeString())
		const data = points.map((p) => {
			if (kind === 'light') return typeof p.lightOn === 'boolean' ? (p.lightOn ? 1 : 0) : null
			return typeof p.acOn === 'boolean' ? (p.acOn ? 1 : 0) : null
		})
		chart = new Chart(chartEl.value, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: kind === 'light' ? 'Light state' : 'AC state',
						data,
						borderColor: cTemp,
						backgroundColor: cTemp,
						tension: 0.2,
						spanGaps: true,
						pointRadius: 0,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: { legend: { display: true } },
				scales: {
					y: {
					beginAtZero: true,
					suggestedMax: 1,
					ticks: { stepSize: 1 },
				},
				},
			},
		})
		return
	}

	if (kind === 'camera') {
		const points = [...cameraFrames.value].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
		const labels = points.map((p) => new Date(p.ts).toLocaleTimeString())
		const data = points.map(() => 1)
		chart = new Chart(chartEl.value, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'Frame received',
						data,
						borderColor: cTemp,
						backgroundColor: cTemp,
						tension: 0.2,
						spanGaps: true,
						pointRadius: 0,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: { legend: { display: true } },
				scales: {
					y: {
					beginAtZero: true,
					suggestedMax: 1,
					ticks: { stepSize: 1 },
				},
				},
			},
		})
		return
	}

	const points = [...windowPoints.value].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
	const labels = points.map((p) => new Date(p.ts).toLocaleTimeString())
	const hasSignal = points.some((p) => typeof p.signalDbm === 'number')

	const datasets: Array<Record<string, unknown>> = []
	if (kind === 'temperature') {
		datasets.push({
			label: 'Temperature (°C)',
			data: points.map((p) => p.temperatureC),
			borderColor: cTemp,
			backgroundColor: cTemp,
			tension: 0.35,
			pointRadius: 0,
		})
		if (hasSignal) {
			datasets.push({
				label: 'Signal (dBm)',
				data: points.map((p) => (typeof p.signalDbm === 'number' ? p.signalDbm : null)),
				borderColor: cRssi,
				backgroundColor: cRssi,
				tension: 0.35,
				spanGaps: true,
				pointRadius: 0,
				yAxisID: 'y1',
			})
		}
	} else if (kind === 'humidity') {
		datasets.push({
			label: 'Humidity (%)',
			data: points.map((p) => p.humidityPct),
			borderColor: cHum,
			backgroundColor: cHum,
			tension: 0.35,
			pointRadius: 0,
		})
		if (hasSignal) {
			datasets.push({
				label: 'Signal (dBm)',
				data: points.map((p) => (typeof p.signalDbm === 'number' ? p.signalDbm : null)),
				borderColor: cRssi,
				backgroundColor: cRssi,
				tension: 0.35,
				spanGaps: true,
				pointRadius: 0,
				yAxisID: 'y1',
			})
		}
	} else {
		datasets.push(
			{
				label: 'Temperature (°C)',
				data: points.map((p) => p.temperatureC),
				borderColor: cTemp,
				backgroundColor: cTemp,
				tension: 0.35,
				pointRadius: 0,
			},
			{
				label: 'Humidity (%)',
				data: points.map((p) => p.humidityPct),
				borderColor: cHum,
				backgroundColor: cHum,
				tension: 0.35,
				pointRadius: 0,
			},
		)
		if (hasSignal) {
			datasets.push({
				label: 'Signal (dBm)',
				data: points.map((p) => (typeof p.signalDbm === 'number' ? p.signalDbm : null)),
				borderColor: cRssi,
				backgroundColor: cRssi,
				tension: 0.35,
				spanGaps: true,
				pointRadius: 0,
				yAxisID: 'y1',
			})
		}
	}

	chart = new Chart(chartEl.value, {
		type: 'line',
		data: { labels, datasets: datasets as any },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			plugins: { legend: { display: true } },
			scales: {
				y: { beginAtZero: false },
				...(hasSignal
					? {
						y1: {
							position: 'right',
							grid: { drawOnChartArea: false },
							beginAtZero: false,
						},
					}
					: {}),
			},
		},
	})
}

watch([windowPoints, runtimePoints, cameraFrames, deviceKind], () => buildChart(), { deep: true })

watch(deviceId, () => {
	void loadAlertRules()
})

onMounted(async () => {
	loading.value = true
	try {
		if (!store.devices.length) await store.loadDevices()
		await loadAlertRules()
	} finally {
		loading.value = false
	}
	buildChart()
})

onBeforeUnmount(() => {
	if (chart) chart.destroy()
	chart = null
})
</script>

<template>
	<div class="space-y-6">
		<button type="button" class="text-sm font-semibold text-blue-700 hover:text-blue-900" @click="backToDevices">
			← Back to devices
		</button>

		<div v-if="loading" class="rounded-2xl bg-white p-6 shadow-sm">
			<p class="text-sm text-gray-600">Loading…</p>
		</div>

		<div v-else-if="!device" class="rounded-2xl bg-white p-6 shadow-sm">
			<p class="text-sm text-gray-700">Device not found.</p>
		</div>

		<div v-else class="space-y-6">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 class="text-xl font-semibold text-gray-900">{{ device.name || device.type }}</h2>
					<p class="mt-1 text-sm text-gray-500">{{ device.deviceUid ?? device.id }}</p>
				</div>
				<div class="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
					<span
						class="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold"
						:class="statusBadgeClasses(device.status)"
					>
						{{ statusLabel(device.status) }}
					</span>
					<button
						v-if="!isBlocked"
						type="button"
						:disabled="busyAction"
						class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition enabled:hover:border-red-300 enabled:hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
						@click="onDisconnectDevice"
					>
						Emergency disconnect
					</button>
					<button
						v-else
						type="button"
						:disabled="busyAction"
						class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition enabled:hover:border-emerald-300 enabled:hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
						@click="onReconnectDevice"
					>
						Enable device
					</button>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-6">
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Status</p>
					<p class="mt-2 text-xl font-semibold text-gray-900">{{ statusLabel(device.status) }}</p>
				</div>
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Power (estimated)</p>
					<p class="mt-2 text-xl font-semibold text-gray-900">
						{{ typeof powerW === 'number' ? powerW + ' W' : '—' }}
					</p>
				</div>
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Last update</p>
					<p class="mt-2 text-xl font-semibold text-gray-900">{{ lastActivityLabel }}</p>
				</div>
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Template</p>
					<p class="mt-2 text-base font-semibold text-gray-900">{{ device.type }}</p>
					<p class="mt-1 text-sm text-gray-500">{{ (device.type ?? '').toLowerCase().split(' ').join('-') }}</p>
				</div>
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Connection</p>
					<p class="mt-2 text-base font-semibold text-gray-900">{{ connection }}</p>
					<p class="mt-1 text-sm text-gray-500">UID: {{ device.deviceUid ?? '—' }}</p>
				</div>
				<div class="rounded-2xl bg-white p-5 shadow-sm">
					<p class="text-sm text-gray-500">Address</p>
					<p class="mt-2 text-base font-semibold text-gray-900">IP: {{ device.ipAddress ?? '—' }}</p>
					<p class="mt-1 text-sm text-gray-500">
						Lat: {{ typeof device.latitude === 'number' ? device.latitude : '—' }}
					</p>
					<p class="mt-1 text-sm text-gray-500">
						Lng: {{ typeof device.longitude === 'number' ? device.longitude : '—' }}
					</p>
				</div>
			</div>

			<div v-if="availableControlCount > 1" class="rounded-2xl bg-white p-6 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold text-gray-900">Control visibility</h3>
						<p class="mt-1 text-sm text-gray-500">Choose which controls are shown for this device.</p>
					</div>
					<p class="text-xs text-gray-400">Applies to dashboard controls</p>
				</div>

				<div class="mt-4 space-y-3">
					<div v-if="isLightType" class="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
						<div>
							<p class="text-sm font-semibold text-gray-900">Light toggle</p>
							<p class="mt-0.5 text-xs text-gray-500">Show the ON/OFF control.</p>
						</div>
						<input
							type="checkbox"
							:checked="controlConfig.lightToggle"
							:disabled="busyControl"
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
							@change="onControlToggle('lightToggle', $event)"
						/>
					</div>

					<div v-if="isAcType" class="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
						<div>
							<p class="text-sm font-semibold text-gray-900">Air conditioner power</p>
							<p class="mt-0.5 text-xs text-gray-500">Show the ON/OFF button.</p>
						</div>
						<input
							type="checkbox"
							:checked="controlConfig.acToggle"
							:disabled="busyControl"
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
							@change="onControlToggle('acToggle', $event)"
						/>
					</div>

					<div v-if="isAcType" class="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
						<div>
							<p class="text-sm font-semibold text-gray-900">Target temperature</p>
							<p class="mt-0.5 text-xs text-gray-500">Show the temperature slider.</p>
						</div>
						<input
							type="checkbox"
							:checked="controlConfig.acTargetTemp"
							:disabled="busyControl"
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
							@change="onControlToggle('acTargetTemp', $event)"
						/>
					</div>

					<p v-if="!isLightType && !isAcType" class="text-sm text-gray-500">
						No interactive controls for this device type.
					</p>
				</div>
			</div>

			<div class="rounded-2xl bg-white p-6 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold text-gray-900">Latest device activity</h3>
						<p class="mt-1 text-sm text-gray-500">Most recent update reported by the device.</p>
					</div>
					<p class="text-sm text-gray-500">
						{{ latestActivityTs ? new Date(latestActivityTs).toLocaleString() : '—' }}
					</p>
				</div>

				<div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div v-for="c in latestActivityCards" :key="c.label" class="rounded-2xl bg-gray-50 p-5">
						<p class="text-sm text-gray-500">{{ c.label }}</p>
						<p class="mt-2 text-2xl font-semibold text-gray-900">{{ c.value }}</p>
						<p v-if="c.unit" class="mt-1 text-sm text-gray-500">{{ c.unit }}</p>
					</div>
				</div>

				<div v-if="deviceKind === 'camera' && device.cameraFrameUrl" class="mt-5">
					<p class="text-sm font-semibold text-gray-900">Latest frame</p>
					<div class="mt-2 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-inset ring-gray-200">
						<img :src="device.cameraFrameUrl" alt="Camera frame" class="h-64 w-full object-cover" />
					</div>
				</div>
			</div>

			<div class="rounded-2xl bg-white p-6 shadow-sm">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 class="text-base font-semibold text-gray-900">Alert rules</h3>
						<p class="mt-1 text-sm text-gray-500">Thresholds are limited to this device type.</p>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							:disabled="alertRulesLoading || alertRulesSaving"
							class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
							@click="resetAlertRules"
						>
							Reset
						</button>
						<button
							type="button"
							:disabled="alertRulesLoading || alertRulesSaving"
							class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
							@click="saveAlertRules"
						>
							{{ alertRulesSaving ? 'Saving...' : 'Save' }}
						</button>
					</div>
				</div>

				<p v-if="alertRulesError" class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
					{{ alertRulesError }}
				</p>

				<p v-if="alertRulesLoading" class="mt-4 text-sm text-gray-500">Loading alert rules...</p>
				<p v-else-if="!alertCapabilities.length" class="mt-4 text-sm text-gray-500">
					This device type does not use telemetry threshold alerts.
				</p>

				<div v-else class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
					<div v-if="alertCapabilities.includes('temperature')" class="rounded-2xl bg-gray-50 p-4">
						<p class="text-sm font-semibold text-gray-900">Temperature</p>
						<p class="mt-1 text-xs text-gray-500">Device alert at or above {{ metricUnit('temperature') }}</p>
						<label class="mt-3 block text-xs font-medium text-gray-600">
							Threshold
							<input v-model="alertInputs.temperature" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900" />
						</label>
						<p class="mt-3 text-xs text-gray-500">Active: {{ alertResolved.temperature?.threshold ?? 'â€”' }} {{ metricUnit('temperature') }}</p>
					</div>

					<div v-if="alertCapabilities.includes('humidity')" class="rounded-2xl bg-gray-50 p-4">
						<p class="text-sm font-semibold text-gray-900">Humidity</p>
						<p class="mt-1 text-xs text-gray-500">Device alert at or above {{ metricUnit('humidity') }}</p>
						<label class="mt-3 block text-xs font-medium text-gray-600">
							Threshold
							<input v-model="alertInputs.humidity" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900" />
						</label>
						<p class="mt-3 text-xs text-gray-500">Active: {{ alertResolved.humidity?.threshold ?? 'â€”' }} {{ metricUnit('humidity') }}</p>
					</div>

					<div v-if="alertCapabilities.includes('signal')" class="rounded-2xl bg-gray-50 p-4">
						<p class="text-sm font-semibold text-gray-900">Signal</p>
						<p class="mt-1 text-xs text-gray-500">Device alert at or below {{ metricUnit('signal') }}</p>
						<label class="mt-3 block text-xs font-medium text-gray-600">
							Threshold
							<input v-model="alertInputs.signal" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900" />
						</label>
						<p class="mt-3 text-xs text-gray-500">Active: {{ alertResolved.signal?.threshold ?? 'â€”' }} {{ metricUnit('signal') }}</p>
					</div>
				</div>
			</div>

			<div class="rounded-2xl bg-white p-6 shadow-sm">
				<h3 class="text-base font-semibold text-gray-900">{{ deviceKind === 'camera' ? 'Camera activity chart' : 'Telemetry chart' }}</h3>
				<p class="mt-1 text-sm text-gray-500">
					{{ deviceKind === 'camera' ? 'Chart for camera frame updates.' : 'Chart for default numeric telemetry fields.' }}
				</p>
				<div class="sr-only">
					<span ref="colorRssiEl" class="text-red-500">rssi</span>
					<span ref="colorTempEl" class="text-blue-500">temp</span>
					<span ref="colorHumEl" class="text-amber-500">hum</span>
				</div>
				<div class="mt-4 h-72">
					<canvas ref="chartEl"></canvas>
				</div>
			</div>

			<div class="rounded-2xl bg-white p-6 shadow-sm">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold text-gray-900">Activity</h3>
						<p class="mt-1 text-sm text-gray-500">{{ activityCount }} records</p>
					</div>
				</div>

				<div class="mt-4 overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-100">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Time</th>
								<th
									v-if="deviceKind === 'camera'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Frame
								</th>
								<th
									v-if="deviceKind === 'temperature' || deviceKind === 'generic'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Temperature (°C)
								</th>
								<th
									v-if="deviceKind === 'humidity' || deviceKind === 'generic'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Humidity (%)
								</th>
								<th
									v-if="deviceKind !== 'light' && deviceKind !== 'ac' && deviceKind !== 'camera'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Signal (dBm)
								</th>
								<th
									v-if="deviceKind === 'light'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Light
								</th>
								<th
									v-if="deviceKind === 'ac'"
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
								>
									Air conditioner
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100 bg-white">
							<template v-if="deviceKind === 'camera'">
								<tr v-for="f in cameraFrameRows" :key="f.ts" class="hover:bg-gray-50/60">
									<td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{{ new Date(f.ts).toLocaleString() }}</td>
									<td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900">RECEIVED</td>
								</tr>
							</template>
							<template v-else-if="deviceKind === 'light'">
								<tr v-for="p in runtimeRows" :key="p.ts" class="hover:bg-gray-50/60">
									<td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{{ new Date(p.ts).toLocaleString() }}</td>
									<td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900">
										{{ typeof p.lightOn === 'boolean' ? (p.lightOn ? 'ON' : 'OFF') : '—' }}
									</td>
								</tr>
							</template>
							<template v-else-if="deviceKind === 'ac'">
								<tr v-for="p in runtimeRows" :key="p.ts" class="hover:bg-gray-50/60">
									<td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{{ new Date(p.ts).toLocaleString() }}</td>
									<td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900">
										{{ typeof p.acOn === 'boolean' ? (p.acOn ? 'ON' : 'OFF') : '—' }}
									</td>
								</tr>
							</template>
							<template v-else>
								<tr v-for="p in telemetryRows" :key="p.ts" class="hover:bg-gray-50/60">
									<td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{{ new Date(p.ts).toLocaleString() }}</td>
									<td
										v-if="deviceKind === 'temperature' || deviceKind === 'generic'"
										class="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
									>
										{{ fmtNumber(p.temperatureC, 2) }}
									</td>
									<td
										v-if="deviceKind === 'humidity' || deviceKind === 'generic'"
										class="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
									>
										{{ fmtNumber(p.humidityPct, 2) }}
									</td>
									<td class="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{{ fmtNumber(p.signalDbm, 0) }}</td>
								</tr>
							</template>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</template>
