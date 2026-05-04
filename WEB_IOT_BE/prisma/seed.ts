import {
  PrismaClient,
  DeviceStatus,
  ConnectionType,
  NetworkType,
  DeviceJoinStatus,
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
      deviceUid: "LPWAN_001",
      devEui: "70B3D57ED005A001",
      activationCode: "ABC123",
      name: "LoRa Temp Sensor 01",
      type: "Temperature",
      model: "LORA-T1",
      connectionType: ConnectionType.LPWAN,
      networkType: NetworkType.LORAWAN,
      gatewayId: "GW-HANOI-01",
    },
    {
      deviceUid: "WIFI_001",
      devEui: null,
      activationCode: "XYZ789",
      name: "Humidity Sensor 01",
      type: "Humidity",
      model: "WIFI-H1",
      connectionType: ConnectionType.WIFI,
      networkType: null,
      gatewayId: null,
    },
    {
      deviceUid: "CAMERA_ETH_001",
      devEui: null,
      activationCode: "CAM123",
      name: "Camera 01",
      type: "Camera",
      model: "CAM-X1",
      connectionType: ConnectionType.WIRED,
      networkType: null,
      gatewayId: null,
    },
    {
      deviceUid: "LIGHT_ETH_001",
      devEui: null,
      activationCode: "LIT123",
      name: "Light 01",
      type: "Light",
      model: "LIGHT-X1",
      connectionType: ConnectionType.WIRED,
      networkType: null,
      gatewayId: null,
      lightOn: false,
    },
    {
      deviceUid: "WIFI_AC_001",
      devEui: null,
      activationCode: "AC1234",
      name: "Air Conditioner 01",
      type: "Air Conditioner",
      model: "AC-X1",
      connectionType: ConnectionType.WIFI,
      networkType: null,
      gatewayId: null,
      acOn: false,
      acTargetTempC: 24,
    },
  ] as const;

  for (const d of factoryDevices) {
    await prisma.device.upsert({
      where: { activationCode: d.activationCode },
      update: {
        deviceUid: d.deviceUid,
        devEui: d.devEui,
        model: d.model,
        connectionType: d.connectionType,
        networkType: d.networkType,
        gatewayId: d.gatewayId,
        type: d.type,
        // Không reset userId/name/status để seed an toàn khi demo.
      },
      create: {
        deviceUid: d.deviceUid,
        devEui: d.devEui,
        activationCode: d.activationCode,
        userId: null,
        status: DeviceStatus.OFFLINE,
        joinStatus: DeviceJoinStatus.UNCLAIMED,
        lastSeenAt: null,
        lastJoinAt: null,
        name: d.name,
        type: d.type,
        model: d.model,
        connectionType: d.connectionType,
        networkType: d.networkType,
        gatewayId: d.gatewayId,
        lightOn: "lightOn" in d ? d.lightOn : null,
        acOn: "acOn" in d ? d.acOn : null,
        acTargetTempC: "acTargetTempC" in d ? d.acTargetTempC : null,
        cameraFrameUrl: null,
      },
    });
  }

  console.log("Seed complete");
  console.log(`Admin user: ${user.email} / ${adminPassword}`);
  console.log("Factory devices:");
  for (const d of factoryDevices) {
    console.log(
      `- ${d.deviceUid}${d.devEui ? ` / DevEUI: ${d.devEui}` : ""} (${d.connectionType}, activation: ${d.activationCode})`,
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
