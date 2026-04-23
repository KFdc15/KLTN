import { DeviceStatus, Prisma } from '@prisma/client'

import { prisma } from '../db/prisma'
import { getIO, userRoom } from '../realtime/io'

export type TelemetryInput = {
	ts?: Date
	temperatureC: number
	humidityPct: number
	signalDbm?: number
}

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n)
}

function parseTelemetryInput(raw: unknown): TelemetryInput {
	const body = (raw ?? {}) as Record<string, unknown>
	const tsRaw = body.ts
	const ts = tsRaw ? new Date(tsRaw as string | number | Date) : undefined

	// Backward/forward compatible payloads
	// - Legacy: { temperatureC, humidityPct }
	// - New simulator: { temperature, humidity }
	const temperatureC =
		isFiniteNumber(body.temperatureC) ? body.temperatureC : isFiniteNumber(body.temperature) ? body.temperature : undefined
	const humidityPct =
		isFiniteNumber(body.humidityPct) ? body.humidityPct : isFiniteNumber(body.humidity) ? body.humidity : undefined
	const signalDbm =
		isFiniteNumber(body.signalDbm) ? body.signalDbm : isFiniteNumber(body.signal) ? body.signal : undefined

	if (!isFiniteNumber(temperatureC)) throw new Error('Invalid temperatureC')
	if (!isFiniteNumber(humidityPct)) throw new Error('Invalid humidityPct')
	if (ts && Number.isNaN(ts.getTime())) throw new Error('Invalid ts')

	return {
		ts,
		temperatureC,
		humidityPct,
		...(signalDbm !== undefined ? { signalDbm } : {}),
	}
}

function computeOnlineOrWarning(t: { temperatureC: number; humidityPct: number }): DeviceStatus {
	return t.temperatureC > 35 ? DeviceStatus.WARNING : DeviceStatus.ONLINE
}

export async function saveTelemetryByDeviceId(deviceId: string, rawTelemetry: unknown) {
	const telemetry = parseTelemetryInput(rawTelemetry)
	const ts = telemetry.ts ?? new Date()
	const status = computeOnlineOrWarning(telemetry)
	const body = (rawTelemetry ?? {}) as Record<string, unknown>
	const lightOn = typeof body.lightOn === 'boolean' ? body.lightOn : undefined
	const acOn = typeof body.acOn === 'boolean' ? body.acOn : undefined
	const acTargetTempC = isFiniteNumber(body.acTargetTempC) ? body.acTargetTempC : undefined
	const cameraFrame = typeof body.cameraFrame === 'string' ? body.cameraFrame : undefined
	const cameraFrameUrl =
		cameraFrame && cameraFrame.length <= 250_000
			? cameraFrame.startsWith('data:')
				? cameraFrame
				: `data:image/svg+xml;base64,${cameraFrame}`
			: undefined

	try {
		const result = await prisma.$transaction(async (tx) => {
			const device = await tx.device.findUnique({
				where: { id: deviceId },
				select: { id: true, userId: true },
			})
			if (!device) return null

			const created = await tx.telemetry.create({
				data: {
					deviceId,
					ts,
					temperatureC: telemetry.temperatureC,
					humidityPct: telemetry.humidityPct,
					signalDbm: telemetry.signalDbm,
				},
				select: {
					deviceId: true,
					ts: true,
					temperatureC: true,
					humidityPct: true,
					signalDbm: true,
				},
			})

			await tx.device.update({
				where: { id: deviceId },
				data: {
					lastSeenAt: ts,
					status,
					...(lightOn !== undefined ? { lightOn } : {}),
					...(acOn !== undefined ? { acOn } : {}),
					...(acTargetTempC !== undefined ? { acTargetTempC: Math.round(acTargetTempC) } : {}),
					...(cameraFrameUrl !== undefined ? { cameraFrameUrl } : {}),
				},
				select: { id: true },
			})

			return { device, telemetry: created, status, lastSeenAt: ts }
		})

		if (!result) return null

		// Only emit realtime events to a user once the device is claimed.
		if (result.device.userId) {
			const io = getIO()
			const room = userRoom(result.device.userId)
			io?.to(room).emit('telemetry:new', {
				deviceId: result.telemetry.deviceId,
				ts: result.telemetry.ts,
				temperatureC: result.telemetry.temperatureC,
				humidityPct: result.telemetry.humidityPct,
				signalDbm: result.telemetry.signalDbm,
			})
			io?.to(room).emit('device:status', {
				deviceId: result.telemetry.deviceId,
				status: result.status,
				lastSeenAt: result.lastSeenAt,
			})

			if (lightOn !== undefined || acOn !== undefined || acTargetTempC !== undefined) {
				io?.to(room).emit('device:runtime', {
					deviceId: result.telemetry.deviceId,
					...(lightOn !== undefined ? { lightOn } : {}),
					...(acOn !== undefined ? { acOn } : {}),
					...(acTargetTempC !== undefined ? { acTargetTempC } : {}),
				})
			}

			if (cameraFrameUrl !== undefined) {
				io?.to(room).emit('camera:frame', {
					deviceId: result.telemetry.deviceId,
					ts: result.telemetry.ts,
					dataUrl: cameraFrameUrl,
				})
			}
		}

		return result
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			throw new Error('Database unavailable')
		}
		throw err
	}
}

export async function saveTelemetryByDeviceUid(deviceUid: string, rawTelemetry: unknown) {
	const safeUid = (deviceUid ?? '').trim()
	if (!safeUid) return null
	const device = await prisma.device.findUnique({ where: { deviceUid: safeUid }, select: { id: true } })
	if (!device) return null
	return saveTelemetryByDeviceId(device.id, rawTelemetry)
}
