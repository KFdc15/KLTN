import { DeviceStatus } from '@prisma/client'

import { prisma } from '../db/prisma'
import { env } from '../env'
import { getIO, userRoom } from '../realtime/io'

let interval: NodeJS.Timeout | null = null

export function startOfflineScheduler() {
	if (interval) return

	const tick = async () => {
		const offlineAfterMs = env.DEVICE_OFFLINE_MINUTES * 60 * 1000
		const cutoff = new Date(Date.now() - offlineAfterMs)

		const stale = await prisma.device.findMany({
			where: {
				status: { not: DeviceStatus.OFFLINE },
				lastSeenAt: { lt: cutoff },
			},
			select: { id: true, uid: true, userId: true, lastSeenAt: true },
		})

		if (!stale.length) return

		await prisma.device.updateMany({
			where: { id: { in: stale.map((d) => d.id) } },
			data: { status: DeviceStatus.OFFLINE },
		})

		const io = getIO()
		for (const d of stale) {
			io?.to(userRoom(d.userId)).emit('device:status', {
				deviceId: d.id,
				uid: d.uid,
				status: DeviceStatus.OFFLINE,
				lastSeenAt: d.lastSeenAt,
			})
		}
	}

	interval = setInterval(() => {
		void tick().catch((err) => {
			console.error('[offlineScheduler] tick failed', err)
		})
	}, 60_000)

	// Run once at startup (best-effort)
	void tick().catch(() => {})
}

export function stopOfflineScheduler() {
	if (!interval) return
	clearInterval(interval)
	interval = null
}
