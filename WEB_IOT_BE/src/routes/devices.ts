import { Router } from 'express'
import { DeviceStatus, Prisma } from '@prisma/client'

import { prisma } from '../db/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { env } from '../env'
import { saveTelemetryByDeviceId } from '../telemetry/service'

type LatestTelemetry = {
	ts: Date
	temperatureC: number
	humidityPct: number
	signalDbm: number
}

function computeDeviceStatus(input: {
	lastSeenAt: Date | null
	latestTelemetry: LatestTelemetry | null
	now: Date
}): DeviceStatus {
	const lastSeen = input.lastSeenAt ?? input.latestTelemetry?.ts ?? null
	if (!lastSeen) return DeviceStatus.OFFLINE

	const offlineAfterMs = env.DEVICE_OFFLINE_MINUTES * 60 * 1000
	if (input.now.getTime() - lastSeen.getTime() > offlineAfterMs) {
		return DeviceStatus.OFFLINE
	}

	const t = input.latestTelemetry
	if (!t) return DeviceStatus.ONLINE

	// Simple MVP anomaly rule
	if (t.temperatureC > 35) return DeviceStatus.WARNING

	return DeviceStatus.ONLINE
}

function mapTelemetry(t: LatestTelemetry | null) {
	if (!t) return null
	return {
		ts: t.ts,
		temperatureC: t.temperatureC,
		humidityPct: t.humidityPct,
		signalDbm: t.signalDbm,
	}
}

export const devicesRouter = Router()

devicesRouter.use(requireAuth)

devicesRouter.get('/', async (req, res) => {
	const userId = req.user!.id
	const devices = await prisma.device.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			uid: true,
			name: true,
			type: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
			telemetry: {
				orderBy: { ts: 'desc' },
				take: 1,
				select: { ts: true, temperatureC: true, humidityPct: true, signalDbm: true },
			},
		},
	})

	const now = new Date()
	return res.json({
		devices: devices.map((d) => {
			const latestTelemetry = d.telemetry[0] ?? null
			const computedStatus = computeDeviceStatus({
				lastSeenAt: d.lastSeenAt,
				latestTelemetry,
				now,
			})

			return {
				id: d.id,
				uid: d.uid,
				name: d.name,
				type: d.type,
				status: computedStatus,
				lastSeenAt: d.lastSeenAt ?? latestTelemetry?.ts ?? null,
				createdAt: d.createdAt,
				updatedAt: d.updatedAt,
				latestTelemetry: mapTelemetry(latestTelemetry),
			}
		}),
	})
})

devicesRouter.post('/', async (req, res) => {
	const userId = req.user!.id
	const { uid, name, type } = (req.body ?? {}) as {
		uid?: string
		name?: string
		type?: string
	}

	if (!uid || !name || !type) {
		return res.status(400).json({ error: 'Missing uid, name, or type' })
	}

	try {
		const device = await prisma.device.create({
			data: {
				uid,
				name,
				type,
				userId,
			},
			select: {
				id: true,
				uid: true,
				name: true,
				type: true,
				status: true,
				lastSeenAt: true,
				createdAt: true,
				updatedAt: true,
			},
		})

		return res.status(201).json({
			device: {
				...device,
				status: DeviceStatus.OFFLINE,
				latestTelemetry: null,
			},
		})
	} catch (err) {
		if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
			return res.status(409).json({ error: 'Device uid already exists' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})

devicesRouter.patch('/:id', async (req, res) => {
	const userId = req.user!.id
	const id = req.params.id
	const { name, type } = (req.body ?? {}) as { name?: string; type?: string }
	if (!name && !type) return res.status(400).json({ error: 'Nothing to update' })

	const updated = await prisma.device.updateMany({
		where: { id, userId },
		data: {
			...(name ? { name } : {}),
			...(type ? { type } : {}),
		},
	})

	if (updated.count === 0) return res.status(404).json({ error: 'Device not found' })

	const device = await prisma.device.findFirst({
		where: { id, userId },
		select: {
			id: true,
			uid: true,
			name: true,
			type: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
			telemetry: {
				orderBy: { ts: 'desc' },
				take: 1,
				select: { ts: true, temperatureC: true, humidityPct: true, signalDbm: true },
			},
		},
	})

	if (!device) return res.status(404).json({ error: 'Device not found' })

	const now = new Date()
	const latestTelemetry = device.telemetry[0] ?? null
	return res.json({
		device: {
			id: device.id,
			uid: device.uid,
			name: device.name,
			type: device.type,
			status: computeDeviceStatus({ lastSeenAt: device.lastSeenAt, latestTelemetry, now }),
			lastSeenAt: device.lastSeenAt ?? latestTelemetry?.ts ?? null,
			createdAt: device.createdAt,
			updatedAt: device.updatedAt,
			latestTelemetry: mapTelemetry(latestTelemetry),
		},
	})
})

devicesRouter.delete('/:id', async (req, res) => {
	const userId = req.user!.id
	const id = req.params.id
	const deleted = await prisma.device.deleteMany({
		where: { id, userId },
	})
	if (deleted.count === 0) return res.status(404).json({ error: 'Device not found' })
	return res.status(204).send()
})

devicesRouter.get('/:id/telemetry', async (req, res) => {
	const userId = req.user!.id
	const deviceId = req.params.id
	const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
	const limit = Math.max(1, Math.min(500, Number(limitRaw ?? 30) || 30))
	const fromRaw = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from
	const toRaw = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to
	const from = typeof fromRaw === 'string' && fromRaw.trim() ? new Date(fromRaw) : null
	const to = typeof toRaw === 'string' && toRaw.trim() ? new Date(toRaw) : null

	if (from && Number.isNaN(from.getTime())) return res.status(400).json({ error: 'Invalid from' })
	if (to && Number.isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid to' })

	const device = await prisma.device.findFirst({ where: { id: deviceId, userId }, select: { id: true } })
	if (!device) return res.status(404).json({ error: 'Device not found' })

	const points = await prisma.telemetry.findMany({
		where: {
			deviceId,
			...(from || to
				? {
					ts: {
						...(from ? { gte: from } : {}),
						...(to ? { lte: to } : {}),
					},
				}
				: {}),
		},
		orderBy: { ts: 'desc' },
		take: limit,
		select: { ts: true, temperatureC: true, humidityPct: true, signalDbm: true },
	})

	return res.json({
		telemetry: points.reverse(),
	})
})

devicesRouter.post('/:id/telemetry', async (req, res) => {
	const userId = req.user!.id
	const deviceId = req.params.id

	const device = await prisma.device.findFirst({
		where: { id: deviceId, userId },
		select: { id: true },
	})
	if (!device) return res.status(404).json({ error: 'Device not found' })

	try {
		const result = await saveTelemetryByDeviceId(deviceId, req.body)
		if (!result) return res.status(404).json({ error: 'Device not found' })
		return res.status(201).json({
			telemetry: result.telemetry,
			device: {
				id: deviceId,
				status: result.status,
				lastSeenAt: result.lastSeenAt,
			},
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal server error'
		if (message === 'Database unavailable') return res.status(503).json({ error: 'Database unavailable' })
		if (message.startsWith('Invalid ')) return res.status(400).json({ error: message })
		return res.status(500).json({ error: 'Internal server error' })
	}
})
