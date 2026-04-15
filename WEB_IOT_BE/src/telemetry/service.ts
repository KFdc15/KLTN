import { DeviceStatus, Prisma } from '@prisma/client'

import { prisma } from '../db/prisma'
import { getIO, userRoom } from '../realtime/io'

export type TelemetryInput = {
	ts?: Date
	temperatureC: number
	humidityPct: number
	signalDbm: number
}

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n)
}

function parseTelemetryInput(raw: unknown): TelemetryInput {
	const body = (raw ?? {}) as Partial<TelemetryInput>
	const ts = body.ts ? new Date(body.ts) : undefined

	if (!isFiniteNumber(body.temperatureC)) throw new Error('Invalid temperatureC')
	if (!isFiniteNumber(body.humidityPct)) throw new Error('Invalid humidityPct')
	if (!isFiniteNumber(body.signalDbm)) throw new Error('Invalid signalDbm')
	if (ts && Number.isNaN(ts.getTime())) throw new Error('Invalid ts')

	return {
		ts,
		temperatureC: body.temperatureC,
		humidityPct: body.humidityPct,
		signalDbm: body.signalDbm,
	}
}

function computeOnlineOrWarning(t: { temperatureC: number; humidityPct: number; signalDbm: number }): DeviceStatus {
	return t.temperatureC > 35 ? DeviceStatus.WARNING : DeviceStatus.ONLINE
}

export async function saveTelemetryByDeviceId(deviceId: string, rawTelemetry: unknown) {
	const telemetry = parseTelemetryInput(rawTelemetry)
	const ts = telemetry.ts ?? new Date()
	const status = computeOnlineOrWarning(telemetry)

	try {
		const result = await prisma.$transaction(async (tx) => {
			const device = await tx.device.findUnique({
				where: { id: deviceId },
				select: { id: true, uid: true, userId: true },
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
					id: true,
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
				},
				select: { id: true },
			})

			return { device, telemetry: created, status, lastSeenAt: ts }
		})

		if (!result) return null

		const io = getIO()
		const room = userRoom(result.device.userId)
		io?.to(room).emit('telemetry:new', {
			deviceId: result.telemetry.deviceId,
			uid: result.device.uid,
			ts: result.telemetry.ts,
			temperatureC: result.telemetry.temperatureC,
			humidityPct: result.telemetry.humidityPct,
			signalDbm: result.telemetry.signalDbm,
		})
		io?.to(room).emit('device:status', {
			deviceId: result.telemetry.deviceId,
			uid: result.device.uid,
			status: result.status,
			lastSeenAt: result.lastSeenAt,
		})

		return result
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			throw new Error('Database unavailable')
		}
		throw err
	}
}

export async function saveTelemetryByUid(uid: string, rawTelemetry: unknown) {
	const device = await prisma.device.findUnique({ where: { uid }, select: { id: true } })
	if (!device) return null
	return saveTelemetryByDeviceId(device.id, rawTelemetry)
}
