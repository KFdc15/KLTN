import {
  ConnectionType,
  DeviceJoinStatus,
  DeviceStatus,
  NetworkType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { getIO, userRoom } from "../realtime/io";

type LpwanUplinkPayload = {
  devEui?: unknown;
  gatewayId?: unknown;
  networkType?: unknown;
  rssi?: unknown;
  snr?: unknown;
  spreadingFactor?: unknown;
  fCnt?: unknown;
  payload?: unknown;
  ts?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function normalizeNetworkType(value: unknown): NetworkType {
  if (typeof value !== "string") return NetworkType.LORAWAN;

  const normalized = value.trim().toUpperCase().replace("-", "_");
  if (normalized === "NB_IOT") return NetworkType.NB_IOT;
  if (normalized === "LTE_M") return NetworkType.LTE_M;
  return NetworkType.LORAWAN;
}

function parseLpwanUplink(raw: unknown, topicDevEui?: string) {
  const body = (raw ?? {}) as LpwanUplinkPayload;
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  const devEui =
    typeof body.devEui === "string" && body.devEui.trim()
      ? body.devEui.trim()
      : topicDevEui?.trim();

  if (!devEui) throw new Error("Missing devEui");

  const gatewayId =
    typeof body.gatewayId === "string" && body.gatewayId.trim()
      ? body.gatewayId.trim()
      : "GW-UNKNOWN";

  const tsRaw = body.ts;
  const ts = tsRaw ? new Date(tsRaw as string | number | Date) : new Date();
  if (Number.isNaN(ts.getTime())) throw new Error("Invalid ts");

  const temperatureC = isFiniteNumber(payload.temperatureC)
    ? payload.temperatureC
    : isFiniteNumber(payload.temperature)
      ? payload.temperature
      : undefined;

  const humidityPct = isFiniteNumber(payload.humidityPct)
    ? payload.humidityPct
    : isFiniteNumber(payload.humidity)
      ? payload.humidity
      : undefined;

  if (!isFiniteNumber(temperatureC))
    throw new Error("Invalid payload.temperatureC");
  if (!isFiniteNumber(humidityPct))
    throw new Error("Invalid payload.humidityPct");

  const rssi = isFiniteNumber(body.rssi) ? body.rssi : undefined;
  const snr = isFiniteNumber(body.snr) ? body.snr : undefined;
  const spreadingFactor = isInteger(body.spreadingFactor)
    ? body.spreadingFactor
    : undefined;
  const batteryPct = isFiniteNumber(payload.batteryPct)
    ? payload.batteryPct
    : undefined;
  const uplinkCounter = isInteger(body.fCnt) ? body.fCnt : undefined;

  return {
    devEui,
    gatewayId,
    networkType: normalizeNetworkType(body.networkType),
    ts,
    temperatureC,
    humidityPct,
    rssi,
    snr,
    spreadingFactor,
    batteryPct,
    uplinkCounter,
  };
}

function computeStatus(temperatureC: number): DeviceStatus {
  return temperatureC > 35 ? DeviceStatus.WARNING : DeviceStatus.ONLINE;
}

export async function handleLpwanUplink(
  topicDevEui: string | null,
  rawPayload: unknown,
) {
  const uplink = parseLpwanUplink(rawPayload, topicDevEui ?? undefined);
  const status = computeStatus(uplink.temperatureC);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { devEui: uplink.devEui },
        select: {
          id: true,
          userId: true,
          devEui: true,
          deviceUid: true,
          name: true,
        },
      });

      if (!device) {
        console.warn(`LPWAN uplink ignored. Unknown DevEUI: ${uplink.devEui}`);
        return null;
      }

      const telemetry = await tx.telemetry.create({
        data: {
          deviceId: device.id,
          ts: uplink.ts,
          temperatureC: uplink.temperatureC,
          humidityPct: uplink.humidityPct,
          signalDbm: uplink.rssi,
          rssi: uplink.rssi,
          snr: uplink.snr,
          spreadingFactor: uplink.spreadingFactor,
          batteryPct: uplink.batteryPct,
          uplinkCounter: uplink.uplinkCounter,
        },
        select: {
          deviceId: true,
          ts: true,
          temperatureC: true,
          humidityPct: true,
          signalDbm: true,
          rssi: true,
          snr: true,
          spreadingFactor: true,
          batteryPct: true,
          uplinkCounter: true,
        },
      });

      const updatedDevice = await tx.device.update({
        where: { id: device.id },
        data: {
          status,
          lastSeenAt: uplink.ts,
          lastJoinAt: uplink.ts,
          connectionType: ConnectionType.LPWAN,
          networkType: uplink.networkType,
          joinStatus: device.userId
            ? DeviceJoinStatus.CLAIMED
            : DeviceJoinStatus.UNCLAIMED,
          gatewayId: uplink.gatewayId,
          lastRssi: uplink.rssi,
          lastSnr: uplink.snr,
          lastSpreadingFactor: uplink.spreadingFactor,
          lastBatteryPct: uplink.batteryPct,
          lastUplinkCounter: uplink.uplinkCounter,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          lastSeenAt: true,
          gatewayId: true,
          lastRssi: true,
          lastSnr: true,
          lastSpreadingFactor: true,
          lastBatteryPct: true,
        },
      });

      return {
        device: updatedDevice,
        telemetry,
      };
    });

    if (!result) return null;

    if (result.device.userId) {
      const io = getIO();
      const room = userRoom(result.device.userId);

      io?.to(room).emit("telemetry:new", {
        deviceId: result.telemetry.deviceId,
        ts: result.telemetry.ts,
        temperatureC: result.telemetry.temperatureC,
        humidityPct: result.telemetry.humidityPct,
        signalDbm: result.telemetry.signalDbm,
        rssi: result.telemetry.rssi,
        snr: result.telemetry.snr,
        spreadingFactor: result.telemetry.spreadingFactor,
        batteryPct: result.telemetry.batteryPct,
        uplinkCounter: result.telemetry.uplinkCounter,
      });

      io?.to(room).emit("device:status", {
        deviceId: result.device.id,
        status: result.device.status,
        lastSeenAt: result.device.lastSeenAt,
      });

      io?.to(room).emit("device:lpwan", {
        deviceId: result.device.id,
        gatewayId: result.device.gatewayId,
        lastRssi: result.device.lastRssi,
        lastSnr: result.device.lastSnr,
        lastSpreadingFactor: result.device.lastSpreadingFactor,
        lastBatteryPct: result.device.lastBatteryPct,
      });
    }

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      throw new Error("Database unavailable");
    }
    throw err;
  }
}
