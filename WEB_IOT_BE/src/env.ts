import 'dotenv/config'

export type AppEnv = {
	PORT: number
	NODE_ENV: 'development' | 'test' | 'production'
	CORS_ORIGIN: string[]
	JWT_ACCESS_SECRET: string
	JWT_ACCESS_TTL: string
	DEVICE_OFFLINE_AFTER_SECONDS: number
	DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS: number
	MQTT_URL: string
	MQTT_USERNAME: string
	MQTT_PASSWORD: string
	MQTT_TELEMETRY_TOPIC: string
}

function parseOrigins(value: string | undefined): string[] {
	if (!value) return []
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

export const env: AppEnv = {
	PORT: Number(process.env.PORT ?? 3000),
	NODE_ENV: (process.env.NODE_ENV as AppEnv['NODE_ENV']) ?? 'development',
	CORS_ORIGIN: parseOrigins(process.env.CORS_ORIGIN),
	JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? '',
	JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '7d',
	DEVICE_OFFLINE_AFTER_SECONDS: parseNumber(process.env.DEVICE_OFFLINE_AFTER_SECONDS, 60),
	DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS: parseNumber(process.env.DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS, 30),
	MQTT_URL: process.env.MQTT_URL ?? '',
	MQTT_USERNAME: process.env.MQTT_USERNAME ?? '',
	MQTT_PASSWORD: process.env.MQTT_PASSWORD ?? '',
	MQTT_TELEMETRY_TOPIC: process.env.MQTT_TELEMETRY_TOPIC ?? 'iot/devices/+/telemetry',
}

if (!env.JWT_ACCESS_SECRET) {
	throw new Error('Missing env: JWT_ACCESS_SECRET')
}
