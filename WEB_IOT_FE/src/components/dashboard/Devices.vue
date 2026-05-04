<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import DeviceTable, { type DeviceRow } from "./DeviceTable.vue";
import { useDeviceStore } from "../../store/deviceStore";

const store = useDeviceStore();
const router = useRouter();

function connectionLabel(connectionType: string | undefined) {
  if (connectionType === "LPWAN") return "LPWAN";
  if (connectionType === "WIRED") return "Wired";
  if (connectionType === "WIFI") return "Wi-Fi";
  return "—";
}

function lpwanMeta(d: ReturnType<typeof useDeviceStore>["devices"][number]) {
  if (d.connectionType !== "LPWAN") return "";

  const parts = [
    d.networkType || "LORAWAN",
    d.gatewayId ? `Gateway ${d.gatewayId}` : "",
    typeof d.lastRssi === "number" ? `RSSI ${Math.round(d.lastRssi)} dBm` : "",
    typeof d.lastSnr === "number" ? `SNR ${d.lastSnr} dB` : "",
    typeof d.lastSpreadingFactor === "number"
      ? `SF${d.lastSpreadingFactor}`
      : "",
    typeof d.lastBatteryPct === "number"
      ? `Battery ${Math.round(d.lastBatteryPct)}%`
      : "",
  ];

  return parts.filter(Boolean).join(" · ");
}

const rows = computed<DeviceRow[]>(() => {
  return store.devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    connection: connectionLabel(d.connectionType),
    connectionDetail: lpwanMeta(d),
    status: d.status,
    lastUpdate: store.getLastUpdateLabel(d),
    spark: store
      .getTelemetryWindow(d.id)
      .map((p) => p.rssi ?? p.signalDbm)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
  }));
});

async function onRenameDevice(input: { id: string; name: string }) {
  await store.updateDeviceName(input);
}

async function onDeleteDevice(device: DeviceRow) {
  const ok = window.confirm(`Delete device "${device.name}"?`);
  if (!ok) return;
  await store.deleteDevice({ id: device.id });
}

function onViewDevice(device: DeviceRow) {
  router.push(`/app/devices/${device.id}`);
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="store.error" class="text-sm text-red-700">{{ store.error }}</p>
    <DeviceTable
      :devices="rows"
      @view="onViewDevice"
      @rename="onRenameDevice"
      @delete="onDeleteDevice"
    />
  </div>
</template>
