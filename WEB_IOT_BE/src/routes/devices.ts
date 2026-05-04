import { Router } from "express";
import { ConnectionType, DeviceJoinStatus, DeviceStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { publishDeviceCommand } from "../mqtt/client";
import { getIO, userRoom } from "../realtime/io";

type DiscoverMethod = "wired" | "wifi" | "lpwan";

type LatestTelemetry = {
  ts: Date;
  temperatureC: number;
  humidityPct: number;
  signalDbm: number | null;
  rssi?: number | null;
  snr?: number | null;
  spreadingFactor?: number | null;
  batteryPct?: number | null;
  uplinkCounter?: number | null;
};

function discoverMethodFromQuery(value: unknown): DiscoverMethod | null {
  if (value === "wired" || value === "wifi" || value === "lpwan") {
    return value;
  }

  return null;
}

function mapTelemetry(t: LatestTelemetry | null) {
  if (!t) return null;

  return {
    ts: t.ts,
    temperatureC: t.temperatureC,
    humidityPct: t.humidityPct,
    signalDbm: t.signalDbm,
    rssi: t.rssi ?? null,
    snr: t.snr ?? null,
    spreadingFactor: t.spreadingFactor ?? null,
    batteryPct: t.batteryPct ?? null,
    uplinkCounter: t.uplinkCounter ?? null,
  };
}

function getConnectionTypeFromMethod(method: DiscoverMethod) {
  if (method === "wired") return ConnectionType.WIRED;
  if (method === "wifi") return ConnectionType.WIFI;
  return ConnectionType.LPWAN;
}

const baseDeviceSelect = {
  id: true,
  deviceUid: true,
  devEui: true,
  name: true,
  type: true,
  model: true,

  connectionType: true,
  networkType: true,
  joinStatus: true,
  gatewayId: true,
  lastJoinAt: true,
  lastRssi: true,
  lastSnr: true,
  lastSpreadingFactor: true,
  lastBatteryPct: true,
  lastUplinkCounter: true,

  lightOn: true,
  acOn: true,
  acTargetTempC: true,
  cameraFrameUrl: true,

  status: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const telemetrySelect = {
  ts: true,
  temperatureC: true,
  humidityPct: true,
  signalDbm: true,
  rssi: true,
  snr: true,
  spreadingFactor: true,
  batteryPct: true,
  uplinkCounter: true,
} as const;

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

devicesRouter.get("/", async (req, res) => {
  const userId = req.user!.id;

  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: baseDeviceSelect,
  });

  const deviceIds = devices.map((d) => d.id);

  const latestTelemetryRows = deviceIds.length
    ? await prisma.telemetry.findMany({
        where: { deviceId: { in: deviceIds } },
        orderBy: [{ deviceId: "asc" }, { ts: "desc" }],
        distinct: ["deviceId"],
        select: {
          deviceId: true,
          ...telemetrySelect,
        },
      })
    : [];

  const latestByDeviceId = new Map<string, LatestTelemetry>();

  for (const row of latestTelemetryRows) {
    latestByDeviceId.set(row.deviceId, {
      ts: row.ts,
      temperatureC: row.temperatureC,
      humidityPct: row.humidityPct,
      signalDbm: row.signalDbm ?? null,
      rssi: row.rssi ?? null,
      snr: row.snr ?? null,
      spreadingFactor: row.spreadingFactor ?? null,
      batteryPct: row.batteryPct ?? null,
      uplinkCounter: row.uplinkCounter ?? null,
    });
  }

  return res.json({
    devices: devices.map((d) => {
      const latestTelemetry = latestByDeviceId.get(d.id) ?? null;

      return {
        ...d,
        lastSeenAt: d.lastSeenAt ?? latestTelemetry?.ts ?? null,
        latestTelemetry: mapTelemetry(latestTelemetry),
      };
    }),
  });
});

devicesRouter.get("/discover", async (req, res) => {
  const method = discoverMethodFromQuery(req.query.method);

  if (!method) {
    return res
      .status(400)
      .json({ error: "Invalid method (use wired|wifi|lpwan)" });
  }

  const connectionType = getConnectionTypeFromMethod(method);

  const devices = await prisma.device.findMany({
    where: {
      userId: null,
      connectionType,
      status: { not: DeviceStatus.OFFLINE },
    },
    orderBy: { updatedAt: "desc" },
    select: baseDeviceSelect,
  });

  return res.json({ devices });
});

devicesRouter.post("/claim", async (req, res) => {
  const userId = req.user!.id;
  const { activationCode, name } = (req.body ?? {}) as {
    activationCode?: unknown;
    name?: unknown;
  };

  if (typeof activationCode !== "string" || !activationCode.trim()) {
    return res.status(400).json({ error: "Missing activationCode" });
  }

  const nextName = typeof name === "string" ? name.trim() : "";

  const found = await prisma.device.findUnique({
    where: { activationCode: activationCode.trim() },
    select: {
      id: true,
      userId: true,
      connectionType: true,
    },
  });

  if (!found) return res.status(404).json({ error: "Device not found" });
  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      ...(nextName ? { name: nextName } : {}),
      joinStatus:
        found.connectionType === ConnectionType.LPWAN
          ? DeviceJoinStatus.CLAIMED
          : DeviceJoinStatus.UNCLAIMED,
    },
    select: baseDeviceSelect,
  });

  return res.status(200).json({
    device: {
      ...updated,
      latestTelemetry: null,
    },
    message: "Waiting for device to come online...",
  });
});

devicesRouter.post("/claim-wifi", async (req, res) => {
  const userId = req.user!.id;
  const { deviceUid, activationCode, name } = (req.body ?? {}) as {
    deviceUid?: unknown;
    activationCode?: unknown;
    name?: unknown;
  };

  if (typeof deviceUid !== "string" || !deviceUid.trim()) {
    return res.status(400).json({ error: "Missing deviceUid" });
  }

  if (typeof activationCode !== "string" || !activationCode.trim()) {
    return res.status(400).json({ error: "Missing activationCode" });
  }

  const nextName = typeof name === "string" ? name.trim() : "";
  if (!nextName) return res.status(400).json({ error: "Missing name" });

  const found = await prisma.device.findUnique({
    where: { deviceUid: deviceUid.trim() },
    select: {
      id: true,
      activationCode: true,
      userId: true,
      connectionType: true,
    },
  });

  if (!found) return res.status(404).json({ error: "Device not found" });

  if (found.connectionType !== ConnectionType.WIFI) {
    return res.status(400).json({ error: "Device is not a Wi-Fi device" });
  }

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  if (found.activationCode !== activationCode.trim()) {
    return res.status(400).json({ error: "Invalid activation code" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      name: nextName,
    },
    select: baseDeviceSelect,
  });

  return res.status(200).json({
    device: {
      ...updated,
      latestTelemetry: null,
    },
    message: "Waiting for device to come online...",
  });
});

devicesRouter.post("/claim-lpwan", async (req, res) => {
  const userId = req.user!.id;
  const { devEui, activationCode, name } = (req.body ?? {}) as {
    devEui?: unknown;
    activationCode?: unknown;
    name?: unknown;
  };

  if (typeof devEui !== "string" || !devEui.trim()) {
    return res.status(400).json({ error: "Missing devEui" });
  }

  if (typeof activationCode !== "string" || !activationCode.trim()) {
    return res.status(400).json({ error: "Missing activationCode" });
  }

  const nextName = typeof name === "string" ? name.trim() : "";
  if (!nextName) return res.status(400).json({ error: "Missing name" });

  const found = await prisma.device.findUnique({
    where: { devEui: devEui.trim() },
    select: {
      id: true,
      activationCode: true,
      userId: true,
      connectionType: true,
    },
  });

  if (!found) return res.status(404).json({ error: "LPWAN device not found" });

  if (found.connectionType !== ConnectionType.LPWAN) {
    return res.status(400).json({ error: "Device is not an LPWAN device" });
  }

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  if (found.activationCode !== activationCode.trim()) {
    return res.status(400).json({ error: "Invalid activation code" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      name: nextName,
      joinStatus: DeviceJoinStatus.CLAIMED,
    },
    select: baseDeviceSelect,
  });

  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { deviceId: updated.id },
    orderBy: { ts: "desc" },
    select: telemetrySelect,
  });

  return res.status(200).json({
    device: {
      ...updated,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
    message: "LPWAN device claimed successfully.",
  });
});

devicesRouter.post("/claim-wired", async (req, res) => {
  const userId = req.user!.id;
  const { deviceUid } = (req.body ?? {}) as { deviceUid?: unknown };

  if (typeof deviceUid !== "string" || !deviceUid.trim()) {
    return res.status(400).json({ error: "Missing deviceUid" });
  }

  const found = await prisma.device.findUnique({
    where: { deviceUid: deviceUid.trim() },
    select: {
      id: true,
      userId: true,
      connectionType: true,
      status: true,
    },
  });

  if (!found) return res.status(404).json({ error: "Device not found" });

  if (found.connectionType !== ConnectionType.WIRED) {
    return res.status(400).json({ error: "Device is not a wired device" });
  }

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  if (found.status === DeviceStatus.OFFLINE) {
    return res.status(400).json({ error: "Device is offline" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: { userId },
    select: baseDeviceSelect,
  });

  return res.status(200).json({
    device: {
      ...updated,
      latestTelemetry: null,
    },
    message: "Waiting for device to come online...",
  });
});

devicesRouter.patch("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const { name, type } = (req.body ?? {}) as { name?: string; type?: string };

  if (!name && !type) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const updated = await prisma.device.updateMany({
    where: { id, userId },
    data: {
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
    },
  });

  if (updated.count === 0) {
    return res.status(404).json({ error: "Device not found" });
  }

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: {
      ...baseDeviceSelect,
      telemetry: {
        orderBy: { ts: "desc" },
        take: 1,
        select: telemetrySelect,
      },
    },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const latestTelemetry = device.telemetry[0] ?? null;
  const { telemetry, ...deviceWithoutTelemetry } = device;

  return res.json({
    device: {
      ...deviceWithoutTelemetry,
      lastSeenAt: device.lastSeenAt ?? latestTelemetry?.ts ?? null,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
  });
});

devicesRouter.post("/:id/control/light", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { on } = (req.body ?? {}) as { on?: unknown };

  if (typeof on !== "boolean") {
    return res.status(400).json({ error: "Invalid on" });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true, deviceUid: true, type: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  if ((device.type ?? "").trim() !== "Light") {
    return res.status(400).json({ error: "Device is not Light" });
  }

  try {
    await publishDeviceCommand(device.deviceUid, { type: "light:set", on });
  } catch {
    return res.status(503).json({ error: "MQTT unavailable" });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lightOn: on },
    select: { id: true },
  });

  getIO()?.to(userRoom(userId)).emit("device:runtime", {
    deviceId: device.id,
    lightOn: on,
  });

  return res.status(202).json({ ok: true });
});

devicesRouter.post("/:id/control/ac", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { on, targetTempC } = (req.body ?? {}) as {
    on?: unknown;
    targetTempC?: unknown;
  };

  const hasOn = typeof on === "boolean";
  const hasTarget =
    typeof targetTempC === "number" && Number.isFinite(targetTempC);

  if (!hasOn && !hasTarget) {
    return res.status(400).json({ error: "Missing on or targetTempC" });
  }

  if (hasTarget && (targetTempC < 16 || targetTempC > 30)) {
    return res
      .status(400)
      .json({ error: "targetTempC must be between 16 and 30" });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true, deviceUid: true, type: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  if ((device.type ?? "").trim() !== "Air Conditioner") {
    return res.status(400).json({ error: "Device is not Air Conditioner" });
  }

  const command: Record<string, unknown> = { type: "ac:set" };
  if (hasOn) command.on = on;
  if (hasTarget) command.targetTempC = targetTempC;

  try {
    await publishDeviceCommand(device.deviceUid, command);
  } catch {
    return res.status(503).json({ error: "MQTT unavailable" });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: {
      ...(hasOn ? { acOn: on as boolean } : {}),
      ...(hasTarget
        ? { acTargetTempC: Math.round(targetTempC as number) }
        : {}),
    },
    select: { id: true },
  });

  getIO()
    ?.to(userRoom(userId))
    .emit("device:runtime", {
      deviceId: device.id,
      ...(hasOn ? { acOn: on as boolean } : {}),
      ...(hasTarget ? { acTargetTempC: targetTempC as number } : {}),
    });

  return res.status(202).json({ ok: true });
});

devicesRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const existing = await prisma.device.findFirst({
    where: { id, userId },
    select: {
      id: true,
      connectionType: true,
    },
  });

  if (!existing) return res.status(404).json({ error: "Device not found" });

  await prisma.device.update({
    where: { id: existing.id },
    data: {
      userId: null,
      joinStatus:
        existing.connectionType === ConnectionType.LPWAN
          ? DeviceJoinStatus.UNCLAIMED
          : DeviceJoinStatus.UNCLAIMED,
    },
    select: { id: true },
  });

  return res.status(204).send();
});
