import { PrismaClient, DeviceStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
	const adminEmail = 'admin@example.com'
	const adminPassword = 'admin123'
	const adminPasswordHash = await bcrypt.hash(adminPassword, 10)

	const user = await prisma.user.upsert({
		where: { email: adminEmail },
		update: {
			passwordHash: adminPasswordHash,
			fullName: 'Admin User',
		},
		create: {
			email: adminEmail,
			passwordHash: adminPasswordHash,
			fullName: 'Admin User',
		},
	})

	const devices = [
		{
			uid: 'LPWAN_SENSOR_01',
			name: 'LPWAN Sensor 01',
			type: 'Temperature Sensor',
			status: DeviceStatus.ONLINE,
			lastSeenAt: new Date(Date.now() - 2 * 60 * 1000),
		},
		{
			uid: 'LPWAN_SENSOR_02',
			name: 'LPWAN Sensor 02',
			type: 'Temperature Sensor',
			status: DeviceStatus.ONLINE,
			lastSeenAt: new Date(Date.now() - 3 * 60 * 1000),
		},
		{
			uid: 'LPWAN_SENSOR_03',
			name: 'LPWAN Sensor 03',
			type: 'Temperature Sensor',
			status: DeviceStatus.OFFLINE,
			lastSeenAt: new Date(Date.now() - 70 * 60 * 1000),
		},
		{
			uid: 'LPWAN_SENSOR_04',
			name: 'LPWAN Sensor 04',
			type: 'Temperature Sensor',
			status: DeviceStatus.WARNING,
			lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
		},
		{
			uid: 'LPWAN_SENSOR_05',
			name: 'LPWAN Sensor 05',
			type: 'Temperature Sensor',
			status: DeviceStatus.ONLINE,
			lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
		},
		{
			uid: 'FACTORY_NODE_A12',
			name: 'Factory Node A12',
			type: 'Multi-Sensor Node',
			status: DeviceStatus.WARNING,
			lastSeenAt: new Date(Date.now() - 8 * 60 * 1000),
		},
		{
			uid: 'COLD_ROOM_BEACON',
			name: 'Cold Room Beacon',
			type: 'Humidity Sensor',
			status: DeviceStatus.OFFLINE,
			lastSeenAt: new Date(Date.now() - 74 * 60 * 1000),
		},
		{
			uid: 'GATEWAY_NORTH',
			name: 'Gateway North',
			type: 'Edge Gateway',
			status: DeviceStatus.ONLINE,
			lastSeenAt: new Date(Date.now() - 60 * 1000),
		},
	]

	for (const d of devices) {
		await prisma.device.upsert({
			where: { uid: d.uid },
			update: {
				name: d.name,
				type: d.type,
				status: d.status,
				lastSeenAt: d.lastSeenAt,
				userId: user.id,
			},
			create: {
				...d,
				userId: user.id,
			},
		})
	}

	const firstDevice = await prisma.device.findFirst({
		where: { uid: 'LPWAN_SENSOR_01' },
	})

	if (firstDevice) {
		const now = Date.now()
		const points = Array.from({ length: 12 }).map((_, i) => {
			const minutesAgo = (11 - i) * 5
			return {
				deviceId: firstDevice.id,
				ts: new Date(now - minutesAgo * 60 * 1000),
				temperatureC: 26 + Math.random() * 4,
				humidityPct: 60 + Math.random() * 12,
				signalDbm: -65 - Math.random() * 15,
			}
		})

		await prisma.telemetry.createMany({ data: points })
		await prisma.deviceEvent.createMany({
			data: [
				{
					deviceId: firstDevice.id,
					type: 'telemetry_ingest',
					message: 'Seed telemetry ingested',
					level: 'INFO',
				},
			],
		})
	}

	console.log('Seed complete')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
