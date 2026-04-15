import 'dotenv/config'
import mqtt from 'mqtt'

function parseCsv(value: string | undefined): string[] {
	if (!value) return []
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}

function num(value: string | undefined, fallback: number) {
	if (!value) return fallback
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

function parseIntervalMs(raw: string | undefined, fallbackMs: number): number {
	if (!raw) return fallbackMs
	const n = Number(raw)
	if (!Number.isFinite(n) || n <= 0) return fallbackMs
	// Part 7 bonus: allow seconds for small values, otherwise treat as milliseconds.
	// Example: INTERVAL=5 -> 5000ms, INTERVAL=5000 -> 5000ms
	return n < 1000 ? Math.round(n * 1000) : Math.round(n)
}

function chance(prob: number) {
	return Math.random() < prob
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n))
}

function randFloat(min: number, max: number) {
	return min + Math.random() * (max - min)
}

function topicForUid(uid: string) {
	// Must match backend default: iot/<uid>/telemetry
	return `iot/${uid}/telemetry`
}

type TelemetryPayload = {
	ts: string
	temperatureC: number
	humidityPct: number
	signalDbm: number
}

async function main() {
	const MQTT_URL = process.env.MQTT_URL ?? ''
	const MQTT_USERNAME = process.env.MQTT_USERNAME ?? ''
	const MQTT_PASSWORD = process.env.MQTT_PASSWORD ?? ''

	// Part 7 env names
	const DEVICE_COUNT = Math.trunc(num(process.env.DEVICE_COUNT, 3))
	const INTERVAL_MS = parseIntervalMs(process.env.INTERVAL, 5000)
	const DEVICE_UID = (process.env.DEVICE_UID ?? '').trim()
	const DEVICE_UIDS = parseCsv(process.env.DEVICE_UIDS)

	// Backward-compatible env names
	const SIM_DEVICE_UIDS = parseCsv(process.env.SIM_DEVICE_UIDS)
	const SIM_INTERVAL_MS = Math.max(250, Math.round(num(process.env.SIM_INTERVAL_MS, INTERVAL_MS)))
	const SIM_ANOMALY_RATE = clamp(num(process.env.SIM_ANOMALY_RATE, 0.05), 0, 1)

	if (!MQTT_URL) {
		console.error('Missing MQTT_URL. Set MQTT_URL to enable simulator.')
		process.exit(1)
	}

	const effectiveIntervalMs = Math.max(250, Math.round(SIM_INTERVAL_MS || INTERVAL_MS))
	const preferredUids =
		SIM_DEVICE_UIDS.length ? SIM_DEVICE_UIDS : DEVICE_UIDS.length ? DEVICE_UIDS : DEVICE_UID ? [DEVICE_UID] : []
	const maxDefaultDevices = 5
	const deviceCount = preferredUids.length
		? clamp(preferredUids.length, 1, 50)
		: clamp(DEVICE_COUNT, 1, maxDefaultDevices)
	const uids = preferredUids.length
		? preferredUids
		: Array.from({ length: deviceCount }, (_, i) => `LPWAN_SENSOR_${String(i + 1).padStart(2, '0')}`)

	const client = mqtt.connect(MQTT_URL, {
		username: MQTT_USERNAME || undefined,
		password: MQTT_PASSWORD || undefined,
		reconnectPeriod: 2000,
	})

	client.on('connect', () => {
		console.log(`Simulator connected: ${MQTT_URL}`)
		console.log(`Publishing ${uids.length} device(s) every ${effectiveIntervalMs}ms`)
		console.log(`UIDs: ${uids.join(', ')}`)
	})

	client.on('error', (err) => {
		console.error('Simulator MQTT error:', err.message)
	})

	const timer = setInterval(() => {
		for (const uid of uids) {
			const anomaly = chance(SIM_ANOMALY_RATE)

			const payload: TelemetryPayload = {
				ts: new Date().toISOString(),
				temperatureC: anomaly ? randFloat(40, 60) : randFloat(24, 31),
				humidityPct: anomaly ? randFloat(5, 15) : randFloat(45, 75),
				// LPWAN-style signal levels are usually weaker than WiFi
				signalDbm: anomaly ? randFloat(-115, -100) : randFloat(-105, -75),
			}

			client.publish(topicForUid(uid), JSON.stringify(payload), { qos: 0 })
		}
	}, effectiveIntervalMs)

	function shutdown(signal: string) {
		console.log(`${signal} received, shutting down simulator...`)
		clearInterval(timer)
		client.end(false, {}, () => process.exit(0))
	}

	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
