import { Router } from "express";
import { ConnectionType, DeviceStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { publishDeviceCommand } from "../mqtt/client";
import { getIO, userRoom } from "../realtime/io";

type DiscoverMethod = "wired" | "wifi";

type LatestTelemetry = {
  ts: Date;
  temperatureC: number;
  humidityPct: number;
  signalDbm: number | null;
};

const CONTROL_KEYS = ["lightToggle", "acToggle", "acTargetTemp"] as const;
type ControlKey = (typeof CONTROL_KEYS)[number];
type ControlConfig = Record<ControlKey, boolean>;

function deviceTypeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeControlConfig(raw: unknown): Partial<ControlConfig> {
  const out: Partial<ControlConfig> = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of CONTROL_KEYS) {
    if (typeof obj[key] === "boolean") out[key] = obj[key] as boolean;
  }
  return out;
}

function resolveControlConfig(
  template: unknown,
  override: unknown,
): ControlConfig {
  const base: ControlConfig = {
    lightToggle: false,
    acToggle: false,
    acTargetTemp: false,
  };
  return {
    ...base,
    ...normalizeControlConfig(template),
    ...normalizeControlConfig(override),
  };
}

function discoverMethodFromQuery(value: unknown): DiscoverMethod | null {
  if (value === "wired" || value === "wifi") {
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
  };
}

function getConnectionTypeFromMethod(method: DiscoverMethod) {
  if (method === "wired") return ConnectionType.WIRED;
  if (method === "wifi") return ConnectionType.WIFI;
}

const baseDeviceSelect = {
  id: true,
  deviceUid: true,
  name: true,
  type: true,
  model: true,

  connectionType: true,

  lightOn: true,
  acOn: true,
  acTargetTempC: true,
  cameraFrameUrl: true,

  status: true,
  telemetryBlocked: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const telemetrySelect = {
  ts: true,
  temperatureC: true,
  humidityPct: true,
  signalDbm: true,
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
  const typeKeys = Array.from(
    new Set(devices.map((d) => deviceTypeKey(d.type))),
  ).filter(Boolean);

  const templates = typeKeys.length
    ? await prisma.deviceControlTemplate.findMany({
        where: { deviceType: { in: typeKeys } },
        select: { deviceType: true, config: true },
      })
    : [];

  const overrides = deviceIds.length
    ? await prisma.deviceControlOverride.findMany({
        where: { deviceId: { in: deviceIds } },
        select: { deviceId: true, config: true },
      })
    : [];

  const templateByType = new Map<string, unknown>();
  for (const t of templates) templateByType.set(t.deviceType, t.config);

  const overrideByDeviceId = new Map<string, unknown>();
  for (const o of overrides) overrideByDeviceId.set(o.deviceId, o.config);

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
    });
  }

  return res.json({
    devices: devices.map((d) => {
      const latestTelemetry = latestByDeviceId.get(d.id) ?? null;
      const typeKey = deviceTypeKey(d.type);
      const controlConfig = resolveControlConfig(
        templateByType.get(typeKey),
        overrideByDeviceId.get(d.id),
      );

      return {
        ...d,
        lastSeenAt: d.lastSeenAt ?? latestTelemetry?.ts ?? null,
        latestTelemetry: mapTelemetry(latestTelemetry),
        controlConfig,
      };
    }),
  });
});

devicesRouter.get("/:id/control-config", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: { id: true, type: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const typeKey = deviceTypeKey(device.type);
  const template = await prisma.deviceControlTemplate.findUnique({
    where: { deviceType: typeKey },
    select: { config: true },
  });
  const override = await prisma.deviceControlOverride.findUnique({
    where: { deviceId: device.id },
    select: { config: true },
  });

  return res.json({
    template: normalizeControlConfig(template?.config),
    override: normalizeControlConfig(override?.config),
    resolved: resolveControlConfig(template?.config, override?.config),
  });
});

devicesRouter.put("/:id/control-config", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const controls = normalizeControlConfig(
    (req.body ?? {}) as Record<string, unknown>,
  );

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: { id: true, type: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const typeKey = deviceTypeKey(device.type);
  const template = await prisma.deviceControlTemplate.findUnique({
    where: { deviceType: typeKey },
    select: { config: true },
  });

  const hasAny = Object.keys(controls).length > 0;
  if (!hasAny) {
    await prisma.deviceControlOverride.deleteMany({
      where: { deviceId: device.id },
    });
  } else {
    await prisma.deviceControlOverride.upsert({
      where: { deviceId: device.id },
      update: { config: controls as unknown as object },
      create: {
        deviceId: device.id,
        config: controls as unknown as object,
      },
    });
  }

  const override = await prisma.deviceControlOverride.findUnique({
    where: { deviceId: device.id },
    select: { config: true },
  });

  return res.json({
    template: normalizeControlConfig(template?.config),
    override: normalizeControlConfig(override?.config),
    resolved: resolveControlConfig(template?.config, override?.config),
  });
});

devicesRouter.get("/discover", async (req, res) => {
  const method = discoverMethodFromQuery(req.query.method);

  if (!method) {
    return res
      .status(400)
      .json({ error: "Invalid method (use wired|wifi)" });
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

devicesRouter.post("/:id/disconnect", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: { id: true, status: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const updated = await prisma.device.update({
    where: { id },
    data: {
      status: DeviceStatus.OFFLINE,
      telemetryBlocked: true,
      lastSeenAt: null,
    },
    select: baseDeviceSelect,
  });

  getIO()?.to(userRoom(userId)).emit("device:status", {
    deviceId: updated.id,
    status: updated.status,
    lastSeenAt: updated.lastSeenAt,
  });

  return res.status(200).json({ device: updated });
});

devicesRouter.post("/:id/reconnect", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const updated = await prisma.device.update({
    where: { id },
    data: {
      telemetryBlocked: false,
    },
    select: baseDeviceSelect,
  });

  return res.status(200).json({ device: updated });
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
    },
    select: { id: true },
  });

  return res.status(204).send();
});
