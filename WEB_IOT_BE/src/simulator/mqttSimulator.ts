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
	// Must match backend default: iot/devices/<device_uid>/telemetry
	return `iot/devices/${uid}/telemetry`
}

function cmdTopicForUid(uid: string) {
	return `iot/devices/${uid}/cmd`
}

function parseUidFromCmdTopic(topic: string): string | null {
	// Expected: iot/devices/<device_uid>/cmd
	const parts = topic.split('/')
	if (parts.length < 4) return null
	if (parts[0] !== 'iot') return null
	if (parts[1] !== 'devices') return null
	if (parts[3] !== 'cmd') return null
	return parts[2] || null
}

type TelemetryPayload = {
	ts: string
	temperature: number
	humidity: number
	signalDbm?: number
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
	cameraFrame?: string
}

type DeviceState = {
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
}

function defaultStateFor(uid: string): DeviceState {
	// Seed defaults: Light off, AC off with 24°C.
	if (uid === 'LPWAN_004') return { lightOn: false }
	if (uid === 'LPWAN_005') return { acOn: false, acTargetTempC: 24 }
	return {}
}

function clampInt(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, Math.round(n)))
}

async function main() {
	const MQTT_URL = process.env.MQTT_URL ?? ''
	const MQTT_USERNAME = process.env.MQTT_USERNAME ?? ''
	const MQTT_PASSWORD = process.env.MQTT_PASSWORD ?? ''

	// Part 7 env names
	const DEVICE_COUNT = Math.trunc(num(process.env.DEVICE_COUNT, 2))
	const INTERVAL_MS = parseIntervalMs(process.env.INTERVAL, 5000)
	const DEVICE_UID_RAW = (process.env.DEVICE_UID ?? '').trim()
	const DEVICE_UIDS = parseCsv(process.env.DEVICE_UIDS)
	const DEVICE_UID_LIST = parseCsv(DEVICE_UID_RAW)

	// Backward-compatible env names
	const SIM_DEVICE_UIDS = parseCsv(process.env.SIM_DEVICE_UIDS)
	const SIM_INTERVAL_MS = Math.max(250, Math.round(num(process.env.SIM_INTERVAL_MS, INTERVAL_MS)))
	const SIM_ANOMALY_RATE = clamp(num(process.env.SIM_ANOMALY_RATE, 0.05), 0, 1)
	void SIM_ANOMALY_RATE

	if (!MQTT_URL) {
		console.error('Missing MQTT_URL. Set MQTT_URL to enable simulator.')
		process.exit(1)
	}

	const effectiveIntervalMs = Math.max(250, Math.round(SIM_INTERVAL_MS || INTERVAL_MS))
	const preferredUids = SIM_DEVICE_UIDS.length
		? SIM_DEVICE_UIDS
		: DEVICE_UIDS.length
			? DEVICE_UIDS
			: DEVICE_UID_LIST.length
				? DEVICE_UID_LIST
				: []
	const maxDefaultDevices = 5
	const deviceCount = preferredUids.length
		? clamp(preferredUids.length, 1, 50)
		: clamp(DEVICE_COUNT, 1, maxDefaultDevices)
	const uids = preferredUids.length
		? preferredUids
		: Array.from({ length: deviceCount }, (_, i) => `LPWAN_${String(i + 1).padStart(3, '0')}`)

	const client = mqtt.connect(MQTT_URL, {
		username: MQTT_USERNAME || undefined,
		password: MQTT_PASSWORD || undefined,
		reconnectPeriod: 2000,
	})

	const stateByUid = new Map<string, DeviceState>()
	for (const uid of uids) stateByUid.set(uid, defaultStateFor(uid))

	client.on('reconnect', () => {
		console.log('Simulator reconnecting...')
	})
	client.on('offline', () => {
		console.log('Simulator offline')
	})
	client.on('close', () => {
		console.log('Simulator connection closed')
	})

	client.on('connect', () => {
		console.log(`Simulator connected: ${MQTT_URL}`)
		console.log(`Publishing ${uids.length} device(s) every ${effectiveIntervalMs}ms`)
		console.log(`UIDs: ${uids.join(', ')}`)

		client.subscribe('iot/devices/+/cmd', (err) => {
			if (err) console.error('Simulator subscribe error:', err.message)
			else console.log(`Simulator subscribed: iot/devices/+/cmd`)
		})
	})

	client.on('error', (err) => {
		console.error('Simulator MQTT error:', err.message)
	})

	client.on('message', (topic, payload) => {
		const uid = parseUidFromCmdTopic(topic)
		if (!uid) return
		if (!uids.includes(uid)) return
		let cmd: Record<string, unknown> | null = null
		try {
			cmd = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
		} catch {
			console.warn(`Simulator: invalid JSON command for ${uid}`)
			return
		}
		const type = typeof cmd.type === 'string' ? cmd.type : ''
		const prev = stateByUid.get(uid) ?? {}
		const next: DeviceState = { ...prev }

		if (type === 'light:set') {
			if (typeof cmd.on === 'boolean') next.lightOn = cmd.on
		}
		if (type === 'ac:set') {
			if (typeof cmd.on === 'boolean') next.acOn = cmd.on
			if (typeof cmd.targetTempC === 'number' && Number.isFinite(cmd.targetTempC)) {
				next.acTargetTempC = clampInt(cmd.targetTempC, 16, 30)
			}
		}

		stateByUid.set(uid, next)
		console.log(
			`Simulator cmd for ${uid} (${type || 'unknown'}): ${JSON.stringify({
				lightOn: next.lightOn,
				acOn: next.acOn,
				acTargetTempC: next.acTargetTempC,
			})}`,
		)
	})

	const timer = setInterval(() => {
		const ts = new Date().toISOString()
		let published = 0

		for (const uid of uids) {
			void chance
			const state = stateByUid.get(uid) ?? {}
			const payload: TelemetryPayload = {
				ts,
				temperature: randFloat(25, 35),
				humidity: randFloat(50, 80),
				signalDbm: randFloat(-85, -55),
			}

			// Demo extras by UID (keeps the new backend logic intact)
			if (uid === 'LPWAN_004') {
				payload.lightOn = state.lightOn ?? false
			}
			if (uid === 'LPWAN_005') {
				payload.acOn = state.acOn ?? false
				payload.acTargetTempC = state.acTargetTempC ?? 24
			}
			if (uid === 'LPWAN_003') {
				const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#111827"/><text x="24" y="56" fill="#e5e7eb" font-family="Arial" font-size="28">Camera 01</text><text x="24" y="92" fill="#9ca3af" font-family="Arial" font-size="16">${ts}</text></svg>`
				payload.cameraFrame = Buffer.from(svg).toString('base64')
			}

			client.publish(topicForUid(uid), JSON.stringify(payload), { qos: 0 })
			published++
		}

		console.log(`Published telemetry: ${published} device(s) @ ${ts}`)
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
