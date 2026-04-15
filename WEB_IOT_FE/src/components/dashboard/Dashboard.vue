<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Chart from 'chart.js/auto'

import { CpuChipIcon, ExclamationTriangleIcon, SignalIcon, WifiIcon } from '@heroicons/vue/24/outline'

import DeviceCard from './DeviceCard.vue'
import DeviceTable, { type DeviceRow } from './DeviceTable.vue'
import { useDeviceStore } from '../../store/deviceStore'

const store = useDeviceStore()

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

const recentRows = computed<DeviceRow[]>(() =>
	store.recentDevices.map((d) => ({
		id: d.id,
		name: d.name,
		type: d.type,
		status: d.status,
		lastUpdate: store.getLastUpdateLabel(d),
	}))
)

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

onMounted(() => {
	if (!chartCanvas.value) return

	chartInstance = new Chart(chartCanvas.value, {
		type: 'line',
		data: {
			labels: store.telemetry.labels,
			datasets: [
				{
					label: 'Temperature (°C)',
					data: store.telemetry.temperature,
					borderColor: 'rgb(17, 24, 39)',
					backgroundColor: 'rgba(17, 24, 39, 0.08)',
					tension: 0.35,
					fill: true,
				},
				{
					label: 'Humidity (%)',
					data: store.telemetry.humidity,
					borderColor: 'rgb(75, 85, 99)',
					backgroundColor: 'rgba(75, 85, 99, 0.06)',
					tension: 0.35,
					fill: true,
				},
				{
					label: 'Signal Strength (dBm)',
					data: store.telemetry.signalStrength,
					borderColor: 'rgb(156, 163, 175)',
					backgroundColor: 'rgba(156, 163, 175, 0.08)',
					tension: 0.35,
					fill: true,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			plugins: {
				legend: {
					position: 'bottom',
					labels: { boxWidth: 10, boxHeight: 10 },
				},
			},
			scales: {
				x: { grid: { display: false } },
				y: { grid: { color: 'rgba(17, 24, 39, 0.06)' } },
			},
		},
	})
})

watch(
	() => store.telemetry,
	(next) => {
		if (!chartInstance) return
		if (chartInstance.data.datasets.length < 3) return
		chartInstance.data.labels = next.labels
		chartInstance.data.datasets[0]!.data = next.temperature
		chartInstance.data.datasets[1]!.data = next.humidity
		chartInstance.data.datasets[2]!.data = next.signalStrength
		chartInstance.update('none')
	},
	{ deep: true }
)

onBeforeUnmount(() => {
	chartInstance?.destroy()
	chartInstance = null
})
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
			<div>
				<h2 class="text-base font-semibold text-gray-900">Device Data Monitoring</h2>
				<p class="mt-1 text-sm text-gray-500">Temperature, humidity, and signal strength trends.</p>
			</div>

			<div class="mt-4 h-80">
				<canvas ref="chartCanvas" />
			</div>
		</section>

		<section>
			<DeviceTable :devices="recentRows" />
		</section>
	</div>
</template>
