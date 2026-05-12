import {
  PrismaClient,
  DeviceStatus,
  ConnectionType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      fullName: "Admin User",
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      fullName: "Admin User",
    },
  });

  const factoryDevices = [
    {
      deviceUid: "WIFI_001",
      activationCode: "XYZ789",
      name: "Humidity Sensor 01",
      type: "Humidity",
      model: "WIFI-H1",
      connectionType: ConnectionType.WIFI,
    },
    {
      deviceUid: "TEMP_WIFI_001",
      activationCode: "TEMP123",
      name: "Temperature Sensor 01",
      type: "Temperature",
      model: "WIFI-T1",
      connectionType: ConnectionType.WIFI,
    },
    {
      deviceUid: "CAMERA_ETH_001",
      activationCode: "CAM123",
      name: "Camera 01",
      type: "Camera",
      model: "CAM-X1",
      connectionType: ConnectionType.WIRED,
    },
    {
      deviceUid: "LIGHT_ETH_001",
      activationCode: "LIT123",
      name: "Light 01",
      type: "Light",
      model: "LIGHT-X1",
      connectionType: ConnectionType.WIRED,
      lightOn: false,
    },
    {
      deviceUid: "WIFI_AC_001",
      activationCode: "AC1234",
      name: "Air Conditioner 01",
      type: "Air Conditioner",
      model: "AC-X1",
      connectionType: ConnectionType.WIFI,
      acOn: false,
      acTargetTempC: 24,
    },
  ] as const;

  const controlTemplates = [
    {
      deviceType: "light",
      config: { lightToggle: true, acToggle: false, acTargetTemp: false },
    },
    {
      deviceType: "air conditioner",
      config: { lightToggle: false, acToggle: true, acTargetTemp: true },
    },
    {
      deviceType: "camera",
      config: { lightToggle: false, acToggle: false, acTargetTemp: false },
    },
    {
      deviceType: "temperature",
      config: { lightToggle: false, acToggle: false, acTargetTemp: false },
    },
    {
      deviceType: "humidity",
      config: { lightToggle: false, acToggle: false, acTargetTemp: false },
    },
  ] as const;

  for (const d of factoryDevices) {
    await prisma.device.upsert({
      where: { activationCode: d.activationCode },
      update: {
        deviceUid: d.deviceUid,
        model: d.model,
        connectionType: d.connectionType,
        type: d.type,
        // Không reset userId/name/status để seed an toàn khi demo.
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
        connectionType: d.connectionType,
        lightOn: "lightOn" in d ? d.lightOn : null,
        acOn: "acOn" in d ? d.acOn : null,
        acTargetTempC: "acTargetTempC" in d ? d.acTargetTempC : null,
        cameraFrameUrl: null,
      },
    });
  }

  for (const t of controlTemplates) {
    await prisma.deviceControlTemplate.upsert({
      where: { deviceType: t.deviceType },
      update: { config: t.config as unknown as object },
      create: { deviceType: t.deviceType, config: t.config as unknown as object },
    });
  }

  console.log("Seed complete");
  console.log(`Admin user: ${user.email} / ${adminPassword}`);
  console.log("Factory devices:");
  for (const d of factoryDevices) {
    console.log(
      `- ${d.deviceUid} (${d.connectionType}, activation: ${d.activationCode})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
