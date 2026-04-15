import mqtt, { type MqttClient } from 'mqtt'

import { env } from '../env'
import { saveTelemetryByUid } from '../telemetry/service'

let client: MqttClient | null = null

function parseUidFromTopic(topic: string): string | null {
	// Expected: iot/<uid>/telemetry
	const parts = topic.split('/')
	if (parts.length < 3) return null
	if (parts[0] !== 'iot') return null
	if (parts[2] !== 'telemetry') return null
	return parts[1] || null
}

export function startMqtt() {
	if (!env.MQTT_URL) return null
	if (client) return client

	console.log(`MQTT enabled. Connecting to ${env.MQTT_URL}`)

	client = mqtt.connect(env.MQTT_URL, {
		username: env.MQTT_USERNAME || undefined,
		password: env.MQTT_PASSWORD || undefined,
		reconnectPeriod: 2000,
	})

	client.on('connect', () => {
		console.log('MQTT connected')
		client?.subscribe(env.MQTT_TELEMETRY_TOPIC, (err) => {
			if (err) console.error('MQTT subscribe error:', err.message)
			else console.log(`MQTT subscribed: ${env.MQTT_TELEMETRY_TOPIC}`)
		})
	})

	client.on('message', async (topic, payload) => {
		try {
			console.log(`MQTT message: ${topic}`)
			const uid = parseUidFromTopic(topic)
			if (!uid) return
			const text = payload.toString('utf8')
			const body = JSON.parse(text)
			await saveTelemetryByUid(uid, body)
		} catch (err) {
			console.error('MQTT message error:', err instanceof Error ? err.message : err)
		}
	})

	client.on('error', (err) => {
		console.error('MQTT error:', err.message)
	})

	return client
}

export async function stopMqtt() {
	if (!client) return
	await new Promise<void>((resolve) => {
		client?.end(false, {}, () => resolve())
	})
	client = null
}
