import { Router } from 'express'
import { DeviceStatus, Prisma } from '@prisma/client'

import { prisma } from '../db/prisma'
import { requireAuth } from '../middleware/requireAuth'
import { publishDeviceCommand } from '../mqtt/client'
import { getIO, userRoom } from '../realtime/io'

type DiscoverMethod = 'wired' | 'wifi'

function discoverMethodFromQuery(value: unknown): DiscoverMethod | null {
	if (value === 'wired' || value === 'wifi') return value
	return null
}

function partitionIsWired(deviceUid: string, model: string | null | undefined) {
	const m = (model ?? '').toLowerCase()
	const uid = (deviceUid ?? '').toLowerCase()
	if (m.includes('eth') || m.includes('ethernet') || uid.includes('eth')) return true
	if (m.includes('wifi') || uid.includes('wifi')) return false
	// Deterministic fallback partition so demo always shows both groups.
	let hash = 0
	for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0
	return hash % 2 === 0
}

type LatestTelemetry = {
	ts: Date
	temperatureC: number
	humidityPct: number
	signalDbm: number | null
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
			deviceUid: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	// Avoid potential N+1 queries from nested `telemetry.take(1)` by fetching
	// latest telemetry for all devices in a single query.
	const deviceIds = devices.map((d) => d.id)
	const latestTelemetryRows = deviceIds.length
		? await prisma.telemetry.findMany({
			where: { deviceId: { in: deviceIds } },
			orderBy: [{ deviceId: 'asc' }, { ts: 'desc' }],
			distinct: ['deviceId'],
			select: {
				deviceId: true,
				ts: true,
				temperatureC: true,
				humidityPct: true,
				signalDbm: true,
			},
		})
		: []

	const latestByDeviceId = new Map<string, LatestTelemetry>()
	for (const row of latestTelemetryRows) {
		latestByDeviceId.set(row.deviceId, {
			ts: row.ts,
			temperatureC: row.temperatureC,
			humidityPct: row.humidityPct,
			signalDbm: row.signalDbm ?? null,
		})
	}

	return res.json({
		devices: devices.map((d) => {
			const latestTelemetry = latestByDeviceId.get(d.id) ?? null

			return {
				id: d.id,
				deviceUid: d.deviceUid,
				name: d.name,
				type: d.type,
				model: d.model,
				lightOn: d.lightOn,
				acOn: d.acOn,
				acTargetTempC: d.acTargetTempC,
				cameraFrameUrl: d.cameraFrameUrl,
				status: d.status,
				lastSeenAt: d.lastSeenAt ?? latestTelemetry?.ts ?? null,
				createdAt: d.createdAt,
				updatedAt: d.updatedAt,
				latestTelemetry: mapTelemetry(latestTelemetry),
			}
		}),
	})
})

devicesRouter.get('/discover', async (req, res) => {
	const method = discoverMethodFromQuery(req.query.method)
	if (!method) return res.status(400).json({ error: 'Invalid method (use wired|wifi)' })

	// Demo-friendly discovery: show unclaimed devices, partitioned into wired/wifi buckets.
	const candidates = await prisma.device.findMany({
		where: { userId: null },
		orderBy: { updatedAt: 'desc' },
		select: {
			id: true,
			deviceUid: true,
			type: true,
			model: true,
			name: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	const devices = candidates.filter((d) => {
		const isWired = partitionIsWired(d.deviceUid, d.model)
		return method === 'wired' ? isWired : !isWired
	})

	return res.json({ devices })
})

devicesRouter.post('/claim', async (req, res) => {
	const userId = req.user!.id
	const { activationCode, name } = (req.body ?? {}) as { activationCode?: unknown; name?: unknown }

	if (typeof activationCode !== 'string' || !activationCode.trim()) {
		return res.status(400).json({ error: 'Missing activationCode' })
	}

	const nextName = typeof name === 'string' ? name.trim() : ''

	const found = await prisma.device.findUnique({
		where: { activationCode: activationCode.trim() },
		select: {
			id: true,
			deviceUid: true,
			userId: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	if (!found) return res.status(404).json({ error: 'Device not found' })
	if (found.userId) return res.status(400).json({ error: 'Device already claimed' })

	const updated = await prisma.device.update({
		where: { id: found.id },
		data: {
			userId,
			...(nextName ? { name: nextName } : {}),
		},
		select: {
			id: true,
			deviceUid: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	return res.status(200).json({
		device: {
			...updated,
			latestTelemetry: null,
		},
		message: 'Waiting for device to come online...',
	})
})

devicesRouter.post('/claim-wifi', async (req, res) => {
	const userId = req.user!.id
	const { deviceUid, activationCode, name } = (req.body ?? {}) as {
		deviceUid?: unknown
		activationCode?: unknown
		name?: unknown
	}

	if (typeof deviceUid !== 'string' || !deviceUid.trim()) return res.status(400).json({ error: 'Missing deviceUid' })
	if (typeof activationCode !== 'string' || !activationCode.trim()) {
		return res.status(400).json({ error: 'Missing activationCode' })
	}
	const nextName = typeof name === 'string' ? name.trim() : ''
	if (!nextName) return res.status(400).json({ error: 'Missing name' })

	const found = await prisma.device.findUnique({
		where: { deviceUid: deviceUid.trim() },
		select: {
			id: true,
			deviceUid: true,
			activationCode: true,
			userId: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	if (!found) return res.status(404).json({ error: 'Device not found' })
	if (found.userId) return res.status(400).json({ error: 'Device already claimed' })
	if (found.activationCode !== activationCode.trim()) return res.status(400).json({ error: 'Invalid activation code' })

	const updated = await prisma.device.update({
		where: { id: found.id },
		data: { userId, name: nextName },
		select: {
			id: true,
			deviceUid: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	return res.status(200).json({
		device: {
			...updated,
			latestTelemetry: null,
		},
		message: 'Waiting for device to come online...',
	})
})

devicesRouter.post('/claim-wired', async (req, res) => {
	const userId = req.user!.id
	const { deviceUid } = (req.body ?? {}) as { deviceUid?: unknown }
	if (typeof deviceUid !== 'string' || !deviceUid.trim()) return res.status(400).json({ error: 'Missing deviceUid' })

	const found = await prisma.device.findUnique({
		where: { deviceUid: deviceUid.trim() },
		select: {
			id: true,
			deviceUid: true,
			userId: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	if (!found) return res.status(404).json({ error: 'Device not found' })
	if (found.userId) return res.status(400).json({ error: 'Device already claimed' })
	// Wired connection implies physical proximity; still require device to be online for realism.
	if (found.status === DeviceStatus.OFFLINE) return res.status(400).json({ error: 'Device is offline' })

	const updated = await prisma.device.update({
		where: { id: found.id },
		data: { userId },
		select: {
			id: true,
			deviceUid: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
			status: true,
			lastSeenAt: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	return res.status(200).json({
		device: {
			...updated,
			latestTelemetry: null,
		},
		message: 'Waiting for device to come online...',
	})
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
			deviceUid: true,
			name: true,
			type: true,
			model: true,
			lightOn: true,
			acOn: true,
			acTargetTempC: true,
			cameraFrameUrl: true,
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

	const latestTelemetry = device.telemetry[0] ?? null
	return res.json({
		device: {
			id: device.id,
			deviceUid: device.deviceUid,
			name: device.name,
			type: device.type,
			model: device.model,
			lightOn: device.lightOn,
			acOn: device.acOn,
			acTargetTempC: device.acTargetTempC,
			cameraFrameUrl: device.cameraFrameUrl,
			status: device.status,
			lastSeenAt: device.lastSeenAt ?? latestTelemetry?.ts ?? null,
			createdAt: device.createdAt,
			updatedAt: device.updatedAt,
			latestTelemetry: latestTelemetry
				? mapTelemetry({
					...latestTelemetry,
					signalDbm: latestTelemetry.signalDbm ?? null,
				})
				: null,
		},
	})
})

devicesRouter.post('/:id/control/light', async (req, res) => {
	const userId = req.user!.id
	const deviceId = req.params.id
	const { on } = (req.body ?? {}) as { on?: unknown }

	if (typeof on !== 'boolean') return res.status(400).json({ error: 'Invalid on' })

	const device = await prisma.device.findFirst({
		where: { id: deviceId, userId },
		select: { id: true, deviceUid: true, type: true },
	})
	if (!device) return res.status(404).json({ error: 'Device not found' })
	if ((device.type ?? '').trim() !== 'Light') return res.status(400).json({ error: 'Device is not Light' })

	try {
		await publishDeviceCommand(device.deviceUid, { type: 'light:set', on })
	} catch {
		return res.status(503).json({ error: 'MQTT unavailable' })
	}

	await prisma.device.update({
		where: { id: device.id },
		data: { lightOn: on },
		select: { id: true },
	})

	getIO()?.to(userRoom(userId)).emit('device:runtime', {
		deviceId: device.id,
		lightOn: on,
	})

	return res.status(202).json({ ok: true })
})

devicesRouter.post('/:id/control/ac', async (req, res) => {
	const userId = req.user!.id
	const deviceId = req.params.id
	const { on, targetTempC } = (req.body ?? {}) as { on?: unknown; targetTempC?: unknown }

	const hasOn = typeof on === 'boolean'
	const hasTarget = typeof targetTempC === 'number' && Number.isFinite(targetTempC)
	if (!hasOn && !hasTarget) return res.status(400).json({ error: 'Missing on or targetTempC' })
	if (hasTarget && (targetTempC < 16 || targetTempC > 30)) {
		return res.status(400).json({ error: 'targetTempC must be between 16 and 30' })
	}

	const device = await prisma.device.findFirst({
		where: { id: deviceId, userId },
		select: { id: true, deviceUid: true, type: true },
	})
	if (!device) return res.status(404).json({ error: 'Device not found' })
	if ((device.type ?? '').trim() !== 'Air Conditioner') {
		return res.status(400).json({ error: 'Device is not Air Conditioner' })
	}

	const command: Record<string, unknown> = { type: 'ac:set' }
	if (hasOn) command.on = on
	if (hasTarget) command.targetTempC = targetTempC

	try {
		await publishDeviceCommand(device.deviceUid, command)
	} catch {
		return res.status(503).json({ error: 'MQTT unavailable' })
	}

	await prisma.device.update({
		where: { id: device.id },
		data: {
			...(hasOn ? { acOn: on as boolean } : {}),
			...(hasTarget ? { acTargetTempC: Math.round(targetTempC as number) } : {}),
		},
		select: { id: true },
	})

	getIO()?.to(userRoom(userId)).emit('device:runtime', {
		deviceId: device.id,
		...(hasOn ? { acOn: on as boolean } : {}),
		...(hasTarget ? { acTargetTempC: targetTempC as number } : {}),
	})

	return res.status(202).json({ ok: true })
})

devicesRouter.delete('/:id', async (req, res) => {
	const userId = req.user!.id
	const id = req.params.id
	// Devices exist independently; deleting from a user's account should unclaim it.
	const updated = await prisma.device.updateMany({
		where: { id, userId },
		data: { userId: null },
	})
	if (updated.count === 0) return res.status(404).json({ error: 'Device not found' })
	return res.status(204).send()
})
