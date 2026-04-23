import { DeviceStatus } from '@prisma/client'

import { prisma } from '../db/prisma'
import { env } from '../env'
import { getIO, userRoom } from '../realtime/io'

let interval: NodeJS.Timeout | null = null

export function startOfflineScheduler() {
	if (interval) return

	const tick = async () => {
		const offlineAfterMs = Math.max(1, env.DEVICE_OFFLINE_AFTER_SECONDS) * 1000
		const cutoff = new Date(Date.now() - offlineAfterMs)

		const stale = await prisma.device.findMany({
			where: {
				status: { not: DeviceStatus.OFFLINE },
				lastSeenAt: { lt: cutoff },
			},
			select: { id: true, userId: true, lastSeenAt: true },
		})

		if (!stale.length) return

		await prisma.device.updateMany({
			where: { id: { in: stale.map((d) => d.id) } },
			data: { status: DeviceStatus.OFFLINE },
		})

		const io = getIO()
		for (const d of stale) {
			if (!d.userId) continue
			io?.to(userRoom(d.userId)).emit('device:status', {
				deviceId: d.id,
				status: DeviceStatus.OFFLINE,
				lastSeenAt: d.lastSeenAt,
			})
		}
	}

	interval = setInterval(() => {
		void tick().catch((err) => {
			console.error('[offlineScheduler] tick failed', err)
		})
	}, Math.max(5, env.DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS) * 1000)

	// Run once at startup (best-effort)
	void tick().catch(() => {})
}

export function stopOfflineScheduler() {
	if (!interval) return
	clearInterval(interval)
	interval = null
}
