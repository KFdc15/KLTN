<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CameraIcon,
  CpuChipIcon,
  FireIcon,
  LightBulbIcon,
  SignalIcon,
} from "@heroicons/vue/24/outline";

import { useDeviceStore, type ControlConfig, type Device } from "../../store/deviceStore";
import { useGroupStore } from "../../store/groupStore";

const deviceStore = useDeviceStore();
const groupStore = useGroupStore();

const activeTab = ref<string>("new");
const draftName = ref("");
const saving = ref(false);
const deviceSelection = ref<Set<string>>(new Set());
const acTargetDraft = reactive<Record<string, number>>({});

const groupTabs = computed(() => [
  ...groupStore.groups.map((g) => ({ id: g.id, label: g.name })),
  { id: "new", label: "Add group" },
]);

const selectedGroup = computed(() => {
  if (!activeTab.value || activeTab.value === "new") return null;
  return groupStore.groups.find((g) => g.id === activeTab.value) ?? null;
});

const selectedDetail = computed(() => {
  if (!selectedGroup.value) return null;
  return groupStore.groupDetails[selectedGroup.value.id] ?? null;
});

const sortedDevices = computed(() => {
  return [...deviceStore.devices].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );
});

const groupDevices = computed(() => {
  const ids = new Set(selectedDetail.value?.deviceIds ?? []);
  return deviceStore.devices.filter((d) => ids.has(d.id));
});

function selectTab(id: string) {
  activeTab.value = id;
}

async function createGroup() {
  const name = draftName.value.trim();
  if (!name) return;
  saving.value = true;
  try {
    const group = await groupStore.createGroup(name);
    await groupStore.updateGroupDevices(
      group.id,
      Array.from(deviceSelection.value),
    );
    draftName.value = "";
    deviceSelection.value = new Set();
    activeTab.value = group.id;
  } finally {
    saving.value = false;
  }
}

async function renameGroup() {
  if (!selectedGroup.value) return;
  const nextName = window.prompt("Rename group", selectedGroup.value.name);
  if (!nextName) return;
  await groupStore.renameGroup(selectedGroup.value.id, nextName);
}

async function removeGroup() {
  if (!selectedGroup.value) return;
  const ok = window.confirm(`Delete group "${selectedGroup.value.name}"?`);
  if (!ok) return;
  const id = selectedGroup.value.id;
  await groupStore.deleteGroup(id);
  activeTab.value = groupStore.groups[0]?.id ?? "new";
}

function toggleDevice(deviceId: string, checked: boolean) {
  const next = new Set(deviceSelection.value);
  if (checked) next.add(deviceId);
  else next.delete(deviceId);
  deviceSelection.value = next;
}

watch(activeTab, async (id) => {
  if (!id) return;
  if (id === "new") {
    deviceSelection.value = new Set();
    return;
  }
  const detail = await groupStore.loadGroupDetail(id);
  deviceSelection.value = new Set(detail.deviceIds);
});

watch(
  () => groupStore.groups.length,
  (count) => {
    if (!count) {
      activeTab.value = "new";
      return;
    }
    const stillExists = groupStore.groups.some((g) => g.id === activeTab.value);
    if (!stillExists && activeTab.value !== "new") {
      activeTab.value = groupStore.groups[0]?.id ?? "new";
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await Promise.all([groupStore.loadGroups(), deviceStore.loadDevices()]);
  if (groupStore.groups.length) activeTab.value = groupStore.groups[0]?.id ?? "new";
});

function splitMetricValue(value: string) {
  const v = (value ?? "").trim();
  if (!v || v === "—") return { num: "—", unit: "" };
  const m = v.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { num: v, unit: "" };
  return { num: m[1] ?? v, unit: (m[2] ?? "").trim() };
}

function canonicalType(type: string) {
  const raw = (type ?? "").trim();
  const k = raw.toLowerCase();
  if (k === "temperature sensor" || k === "temp sensor") return "Temperature";
  if (k === "humidity sensor") return "Humidity";
  if (k === "signal monitor") return "Signal Monitor";
  if (k === "edge gateway") return "Edge Gateway";
  if (k === "multi-sensor node") return "Multi-Sensor Node";
  if (k === "temperature") return "Temperature";
  if (k === "humidity") return "Humidity";
  if (k === "light") return "Light";
  if (k === "camera") return "Camera";
  if (k === "air conditioner" || k === "ac") return "Air Conditioner";
  return raw;
}

function iconForDevice(deviceType: string) {
  switch (canonicalType(deviceType)) {
    case "Light":
      return LightBulbIcon;
    case "Camera":
      return CameraIcon;
    case "Humidity":
      return BeakerIcon;
    case "Temperature":
      return FireIcon;
    case "Air Conditioner":
      return AdjustmentsHorizontalIcon;
    case "Signal Monitor":
      return SignalIcon;
    case "Edge Gateway":
    case "Multi-Sensor Node":
      return CpuChipIcon;
    default:
      return CpuChipIcon;
  }
}

function defaultControlConfig(deviceType: string): ControlConfig {
  const base: ControlConfig = {
    lightToggle: false,
    acToggle: false,
    acTargetTemp: false,
  };
  const type = canonicalType(deviceType);
  if (type === "Light") return { ...base, lightToggle: true };
  if (type === "Air Conditioner") {
    return { ...base, acToggle: true, acTargetTemp: true };
  }
  return base;
}

function controlConfigFor(d: Device): ControlConfig {
  return d.controlConfig ?? defaultControlConfig(d.type);
}

function showLightControl(d: Device) {
  return controlConfigFor(d).lightToggle;
}

function showAcControl(d: Device) {
  const cfg = controlConfigFor(d);
  return cfg.acToggle || cfg.acTargetTemp;
}

function acDraftValue(d: Device) {
  return acTargetDraft[d.id] ?? d.acTargetTempC ?? 24;
}

function onAcDraftInput(deviceId: string, e: Event) {
  const el = e.target as HTMLInputElement | null;
  if (!el) return;
  const v = Number(el.value);
  if (!Number.isFinite(v)) return;
  acTargetDraft[deviceId] = v;
}

async function onAcTargetChange(d: Device, e: Event) {
  onAcDraftInput(d.id, e);
  const raw = acDraftValue(d);
  const clamped = Math.max(16, Math.min(30, Math.round(raw)));
  acTargetDraft[d.id] = clamped;
  await deviceStore.setAirConditioner({ id: d.id, targetTempC: clamped });
}

async function toggleLight(d: Device) {
  const nextOn = !(d.lightOn ?? false);
  await deviceStore.setLight({ id: d.id, on: nextOn });
}

async function toggleAirConditioner(d: Device) {
  const nextOn = !(d.acOn ?? false);
  await deviceStore.setAirConditioner({ id: d.id, on: nextOn });
}

function statusPill(on: boolean | undefined) {
  if (on === true) return "bg-green-100 text-green-700 ring-1 ring-inset ring-green-200";
  if (on === false) return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
  return "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200";
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case "ONLINE":
      return "bg-green-100 text-green-700 ring-1 ring-inset ring-green-200";
    case "OFFLINE":
      return "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200";
    case "WARNING":
      return "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-200";
    case "DISCONNECTED":
      return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
    default:
      return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "WARNING":
      return "Warning";
    case "DISCONNECTED":
      return "Disconnected";
    default:
      return status;
  }
}

function metricGridCols(count: number) {
  switch (count) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-2";
    default:
      return "grid-cols-3";
  }
}

function metricsForDevice(
  deviceType: string,
  telemetry: { temperatureC: number; humidityPct: number } | null,
) {
  const t = telemetry;
  const temperature = {
    key: "temperature",
    label: "Temp",
    value: t ? `${t.temperatureC.toFixed(1)}°C` : "—",
  };
  const humidity = {
    key: "humidity",
    label: "Humidity",
    value: t ? `${Math.round(t.humidityPct)}%` : "—",
  };

  switch (canonicalType(deviceType)) {
    case "Temperature":
      return [temperature];
    case "Humidity":
      return [humidity];
    case "Multi-Sensor Node":
      return [temperature, humidity];
    case "Signal Monitor":
    case "Edge Gateway":
    case "Light":
    case "Camera":
    case "Air Conditioner":
      return [];
    default:
      return [];
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-2xl bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="tab in groupTabs"
          :key="tab.id"
          type="button"
          class="rounded-2xl px-4 py-2 text-sm font-semibold transition"
          :class="
            activeTab === tab.id
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          "
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
      <p class="mt-2 text-sm text-gray-500">
        Create groups and monitor only the devices you select.
      </p>
    </div>

    <div v-if="activeTab === 'new'" class="rounded-2xl bg-white p-6 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-gray-900">Add group</h2>
          <p class="mt-1 text-sm text-gray-500">Pick devices to show in this group.</p>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <input
          v-model="draftName"
          type="text"
          placeholder="Group name"
          class="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-300"
        />
        <button
          type="button"
          class="rounded-2xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="saving || !draftName.trim()"
          @click="createGroup"
        >
          {{ saving ? "Saving…" : "Save changes" }}
        </button>
      </div>

      <p v-if="groupStore.error" class="mt-3 text-sm text-red-700">
        {{ groupStore.error }}
      </p>

      <div class="mt-4 space-y-2">
        <div
          v-for="d in sortedDevices"
          :key="d.id"
          class="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2"
        >
          <div>
            <p class="text-sm font-semibold text-gray-900">
              {{ d.name }}
            </p>
            <p class="text-xs text-gray-500">
              {{ d.type }} · {{ d.deviceUid ?? d.id }}
            </p>
          </div>
          <input
            type="checkbox"
            :checked="deviceSelection.has(d.id)"
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            @change="toggleDevice(d.id, ($event.target as HTMLInputElement).checked)"
          />
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="rounded-2xl bg-white p-5 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-gray-900">
              {{ selectedGroup?.name }}
            </h2>
            <p class="mt-1 text-sm text-gray-500">
              {{ selectedDetail?.deviceIds.length ?? 0 }} device(s)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              @click="renameGroup"
            >
              Rename
            </button>
            <button
              type="button"
              class="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              @click="removeGroup"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div v-if="!groupDevices.length" class="rounded-2xl bg-white p-6 shadow-sm">
        <p class="text-sm text-gray-500">No devices selected for this group yet.</p>
      </div>

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="d in groupDevices"
          :key="d.id"
          class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="rounded-xl bg-gray-100 p-2.5 text-gray-700">
                <component :is="iconForDevice(d.type)" class="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ d.name }}</p>
                <p class="mt-0.5 text-xs text-gray-500">{{ d.type }}</p>
              </div>
            </div>
            <span
              :class="statusBadgeClasses(d.status)"
              class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
            >
              {{ statusLabel(d.status) }}
            </span>
          </div>

          <div
            v-if="metricsForDevice(d.type, d.latestTelemetry).length"
            class="mt-4 grid gap-2"
            :class="metricGridCols(metricsForDevice(d.type, d.latestTelemetry).length)"
          >
            <div
              v-for="m in metricsForDevice(d.type, d.latestTelemetry)"
              :key="m.key"
              class="rounded-xl bg-gray-50 px-3 py-2"
            >
              <p class="text-[11px] font-medium text-gray-500">{{ m.label }}</p>
              <div v-if="m.key === 'temperature' || m.key === 'humidity'" class="mt-2 flex justify-center">
                <div
                  class="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white ring-1 ring-inset ring-gray-200"
                >
                  <p class="text-lg font-semibold text-gray-900">{{ splitMetricValue(m.value).num }}</p>
                  <p class="text-[11px] font-medium text-gray-500">{{ splitMetricValue(m.value).unit }}</p>
                </div>
              </div>
              <p v-else class="mt-0.5 text-sm font-semibold text-gray-900">{{ m.value }}</p>
            </div>
          </div>

          <div v-if="canonicalType(d.type) === 'Light' && showLightControl(d)" class="mt-4 rounded-xl bg-gray-50 px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium text-gray-600">Light</p>
              <span :class="statusPill(d.lightOn)" class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold">
                {{ d.lightOn === true ? 'ON' : d.lightOn === false ? 'OFF' : '—' }}
              </span>
            </div>
            <div class="mt-4 flex items-center justify-center">
              <button
                type="button"
                class="group grid h-28 w-28 place-items-center rounded-full bg-gray-900 text-white shadow-sm ring-8 ring-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                :class="d.lightOn ? 'ring-green-200' : 'ring-gray-200'"
                :disabled="d.status === 'OFFLINE' || deviceStore.isLightBusy(d.id)"
                @click="toggleLight(d)"
              >
                <span class="text-xl font-semibold tracking-wide">{{ d.lightOn ? 'ON' : 'OFF' }}</span>
              </button>
            </div>
            <p v-if="d.status === 'OFFLINE'" class="mt-2 text-[11px] text-gray-500">Device is offline.</p>
          </div>

          <div v-else-if="canonicalType(d.type) === 'Air Conditioner' && showAcControl(d)" class="mt-4 rounded-xl bg-gray-50 px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium text-gray-600">Air Conditioner</p>
              <span :class="statusPill(d.acOn)" class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold">
                {{ d.acOn === true ? 'ON' : d.acOn === false ? 'OFF' : '—' }}
              </span>
            </div>

            <div v-if="controlConfigFor(d).acToggle" class="mt-3">
              <button
                type="button"
                class="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="d.status === 'OFFLINE' || deviceStore.isAcBusy(d.id)"
                @click="toggleAirConditioner(d)"
              >
                {{ d.acOn ? 'Turn off' : 'Turn on' }}
              </button>
            </div>

            <div v-if="controlConfigFor(d).acTargetTemp" class="mt-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[11px] font-medium text-gray-500">Target temperature</p>
                <p class="text-xs font-semibold text-gray-900">{{ Math.round(acDraftValue(d)) }}°C</p>
              </div>
              <input
                type="range"
                min="16"
                max="30"
                step="1"
                class="mt-2 w-full"
                :value="acDraftValue(d)"
                :disabled="d.status === 'OFFLINE' || deviceStore.isAcTargetBusy(d.id)"
                @input="onAcDraftInput(d.id, $event)"
                @change="onAcTargetChange(d, $event)"
              />
            </div>

            <p v-if="d.status === 'OFFLINE'" class="mt-2 text-[11px] text-gray-500">Device is offline.</p>
          </div>

          <div v-else-if="canonicalType(d.type) === 'Camera'" class="mt-4 overflow-hidden rounded-xl bg-gray-50">
            <div class="flex items-center justify-between px-3 py-2">
              <p class="text-xs font-medium text-gray-600">Live view</p>
              <p class="text-[11px] text-gray-500">Realtime</p>
            </div>
            <div class="aspect-video w-full bg-gray-100">
              <img
                v-if="d.cameraFrameUrl"
                :src="d.cameraFrameUrl"
                alt="Camera live frame"
                class="h-full w-full object-cover"
              />
              <div v-else class="grid h-full place-items-center">
                <p class="text-sm text-gray-500">No frames yet.</p>
              </div>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-xs text-gray-500">Last update</p>
            <p class="text-xs font-semibold text-gray-900">{{ deviceStore.getLastUpdateLabel(d) }}</p>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
