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

	// Factory devices exist independently from users.
	// Users can claim them via activation_code.
	const factoryDevices = [
		{
			deviceUid: 'LPWAN_001',
			activationCode: 'ABC123',
			name: 'Temp Sensor 01',
			type: 'Temperature',
			model: 'LPWAN-T1-WIFI',
		},
		{
			deviceUid: 'LPWAN_002',
			activationCode: 'XYZ789',
			name: 'Humidity Sensor 01',
			type: 'Humidity',
			model: 'LPWAN-H1-WIFI',
		},
		{
			deviceUid: 'LPWAN_003',
			activationCode: 'CAM123',
			name: 'Camera 01',
			type: 'Camera',
			model: 'CAM-X1-ETH',
		},
		{
			deviceUid: 'LPWAN_004',
			activationCode: 'LIT123',
			name: 'Light 01',
			type: 'Light',
			model: 'LIGHT-X1-ETH',
			lightOn: false,
		},
		{
			deviceUid: 'LPWAN_005',
			activationCode: 'AC1234',
			name: 'Air Conditioner 01',
			type: 'Air Conditioner',
			model: 'AC-X1-WIFI',
			acOn: false,
			acTargetTempC: 24,
		},
	] as const

	for (const d of factoryDevices) {
		await prisma.device.upsert({
			where: { deviceUid: d.deviceUid },
			update: {
				activationCode: d.activationCode,
				model: d.model,
				// NOTE: Do not reset ownership/status/name/type for existing devices.
				// Seed should be safe to re-run in a live demo DB.
			},
			create: {
				deviceUid: d.deviceUid,
				activationCode: d.activationCode,
				userId: null,
				status: DeviceStatus.OFFLINE,
				lastSeenAt: null,
				name: d.name,
				type: d.type,
				model: d.model,
				lightOn: 'lightOn' in d ? d.lightOn : null,
				acOn: 'acOn' in d ? d.acOn : null,
				acTargetTempC: 'acTargetTempC' in d ? d.acTargetTempC : null,
				cameraFrameUrl: null,
			},
		})
	}

	console.log('Seed complete')
 	console.log(`Admin user: ${user.email} / ${adminPassword}`)
 	console.log('Factory devices:')
 	for (const d of factoryDevices) {
 		console.log(`- ${d.deviceUid} (activation: ${d.activationCode})`)
 	}
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
