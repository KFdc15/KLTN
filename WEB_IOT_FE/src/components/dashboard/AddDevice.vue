<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import {
  useDeviceStore,
  type DiscoverableDevice,
} from "../../store/deviceStore";

const store = useDeviceStore();

type SearchMode = "wired" | "wifi" | "lpwan";

const mode = ref<SearchMode | null>(null);
const error = ref<string | null>(null);
const noticeVisible = ref(false);

const loadingWired = ref(false);
const wiredDevices = ref<DiscoverableDevice[]>([]);

const loadingWifi = ref(false);
const wifiDevices = ref<DiscoverableDevice[]>([]);
const selectedWifiDevice = ref<DiscoverableDevice | null>(null);
const wifiDeviceName = ref("");
const wifiActivationCode = ref("");

const loadingLpwan = ref(false);
const lpwanDevices = ref<DiscoverableDevice[]>([]);
const selectedLpwanDevice = ref<DiscoverableDevice | null>(null);
const lpwanDeviceName = ref("");
const lpwanActivationCode = ref("");
const busyConnectLpwanDevEui = ref<string | null>(null);

const busyConnectWiredUid = ref<string | null>(null);
const busyConnectWifiUid = ref<string | null>(null);

let noticeTimer: number | null = null;

const noticeTitle = computed(() => {
  if (error.value) return "Could not connect device";
  if (mode.value === "lpwan") return "LPWAN device claimed";
  return "Device connected";
});

const noticeBody = computed(() => {
  if (error.value) return error.value;

  if (mode.value === "lpwan") {
    return "LPWAN device has been claimed. Uplink telemetry will continue through the simulated LoRaWAN gateway.";
  }

  return "Once the device starts sending MQTT telemetry, it will appear as ONLINE.";
});

function showNotice(ms = 3000) {
  noticeVisible.value = true;

  if (noticeTimer) window.clearTimeout(noticeTimer);

  noticeTimer = window.setTimeout(() => {
    noticeVisible.value = false;
  }, ms);
}

function showError(message: string, ms = 3000) {
  error.value = message;
  showNotice(ms);
}

function showSuccess(ms = 3000) {
  error.value = null;
  showNotice(ms);
}

onBeforeUnmount(() => {
  if (noticeTimer) window.clearTimeout(noticeTimer);
});

async function loadWired() {
  if (loadingWired.value) return;

  loadingWired.value = true;
  error.value = null;

  try {
    wiredDevices.value = await store.discoverDevices({ method: "wired" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover wired devices",
      3000,
    );
  } finally {
    loadingWired.value = false;
  }
}

async function loadWifi() {
  if (loadingWifi.value) return;

  loadingWifi.value = true;
  error.value = null;

  try {
    wifiDevices.value = await store.discoverDevices({ method: "wifi" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover Wi-Fi devices",
      3000,
    );
  } finally {
    loadingWifi.value = false;
  }
}

async function loadLpwan() {
  if (loadingLpwan.value) return;

  loadingLpwan.value = true;
  error.value = null;

  try {
    lpwanDevices.value = await store.discoverDevices({ method: "lpwan" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover LPWAN devices",
      3000,
    );
  } finally {
    loadingLpwan.value = false;
  }
}

async function chooseWired() {
  mode.value = "wired";
  selectedWifiDevice.value = null;
  selectedLpwanDevice.value = null;
  await loadWired();
}

async function chooseWifi() {
  mode.value = "wifi";
  selectedWifiDevice.value = null;
  selectedLpwanDevice.value = null;
  wifiDeviceName.value = "";
  wifiActivationCode.value = "";
  await loadWifi();
}

async function chooseLpwan() {
  mode.value = "lpwan";
  selectedWifiDevice.value = null;
  selectedLpwanDevice.value = null;
  lpwanDeviceName.value = "";
  lpwanActivationCode.value = "";
  await loadLpwan();
}

function startWifiConnect(d: DiscoverableDevice) {
  selectedWifiDevice.value = d;
  wifiDeviceName.value = (d.name ?? "").trim() || "";
  wifiActivationCode.value = "";
}

function startLpwanConnect(d: DiscoverableDevice) {
  selectedLpwanDevice.value = d;
  lpwanDeviceName.value = (d.name ?? "").trim() || "";
  lpwanActivationCode.value = "";
}

async function connectWired(d: DiscoverableDevice) {
  if (!d?.deviceUid) return;
  if (busyConnectWiredUid.value) return;

  busyConnectWiredUid.value = d.deviceUid;
  error.value = null;

  try {
    await store.claimWiredDevice({ deviceUid: d.deviceUid });
    showSuccess(3000);
    await loadWired();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to connect device",
      3000,
    );
  } finally {
    busyConnectWiredUid.value = null;
  }
}

async function connectWifi() {
  const d = selectedWifiDevice.value;
  if (!d?.deviceUid) return;
  if (busyConnectWifiUid.value) return;

  busyConnectWifiUid.value = d.deviceUid;
  error.value = null;

  try {
    await store.claimWifiDevice({
      deviceUid: d.deviceUid,
      name: wifiDeviceName.value,
      activationCode: wifiActivationCode.value,
    });

    showSuccess(3000);

    selectedWifiDevice.value = null;
    wifiDeviceName.value = "";
    wifiActivationCode.value = "";

    await loadWifi();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to connect device",
      3000,
    );
  } finally {
    busyConnectWifiUid.value = null;
  }
}

async function connectLpwan() {
  const d = selectedLpwanDevice.value;
  if (!d?.devEui) return;
  if (busyConnectLpwanDevEui.value) return;

  busyConnectLpwanDevEui.value = d.devEui;
  error.value = null;

  try {
    await store.claimLpwanDevice({
      devEui: d.devEui,
      name: lpwanDeviceName.value,
      activationCode: lpwanActivationCode.value,
    });

    showSuccess(3500);

    selectedLpwanDevice.value = null;
    lpwanDeviceName.value = "";
    lpwanActivationCode.value = "";

    await loadLpwan();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to claim LPWAN device",
      3500,
    );
  } finally {
    busyConnectLpwanDevEui.value = null;
  }
}

function statusClass(status: string) {
  if (status === "ONLINE") {
    return "bg-green-50 text-green-700 ring-green-100";
  }

  if (status === "WARNING") {
    return "bg-yellow-50 text-yellow-800 ring-yellow-100";
  }

  return "bg-red-50 text-red-700 ring-red-100";
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col justify-center">
    <div class="rounded-2xl bg-white p-6 shadow-sm">
      <h2 class="text-base font-semibold text-gray-900">Add Device</h2>
      <p class="mt-1 text-sm text-gray-500">
        Choose how you want to find and connect your device.
      </p>

      <div
        v-if="noticeVisible"
        class="mt-6 rounded-2xl border p-4"
        :class="
          error
            ? 'border-red-200 bg-red-50'
            : mode === 'lpwan'
              ? 'border-blue-100 bg-blue-50'
              : 'border-gray-100 bg-gray-50'
        "
      >
        <p
          class="text-sm font-semibold"
          :class="
            error
              ? 'text-red-800'
              : mode === 'lpwan'
                ? 'text-blue-900'
                : 'text-gray-900'
          "
        >
          {{ noticeTitle }}
        </p>
        <p
          class="mt-1 text-sm"
          :class="
            error
              ? 'text-red-700'
              : mode === 'lpwan'
                ? 'text-blue-700'
                : 'text-gray-600'
          "
        >
          {{ noticeBody }}
        </p>
      </div>

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <button
          type="button"
          class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-gray-300"
          :class="
            mode === 'wired'
              ? 'border-gray-900 ring-2 ring-gray-100'
              : 'border-gray-200'
          "
          @click="chooseWired"
        >
          <p class="text-sm font-semibold text-gray-900">Find via cable</p>
          <p class="mt-1 text-sm text-gray-500">
            Show devices connected directly by Ethernet/cable.
          </p>
        </button>

        <button
          type="button"
          class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-gray-300"
          :class="
            mode === 'wifi'
              ? 'border-gray-900 ring-2 ring-gray-100'
              : 'border-gray-200'
          "
          @click="chooseWifi"
        >
          <p class="text-sm font-semibold text-gray-900">Find on Wi-Fi</p>
          <p class="mt-1 text-sm text-gray-500">
            Show devices on the same Wi-Fi network.
          </p>
        </button>

        <button
          type="button"
          class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-gray-300"
          :class="
            mode === 'lpwan'
              ? 'border-blue-700 ring-2 ring-blue-100'
              : 'border-gray-200'
          "
          @click="chooseLpwan"
        >
          <p class="text-sm font-semibold text-gray-900">Add LPWAN device</p>
          <p class="mt-1 text-sm text-gray-500">
            Claim LoRaWAN-like device by DevEUI and activation code.
          </p>
        </button>
      </div>

      <div
        v-if="mode === 'wired'"
        class="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-900">Wired devices</p>
            <p class="mt-1 text-xs text-gray-500">
              Device must be online before it can be connected.
            </p>
          </div>

          <button
            type="button"
            class="text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingWired"
            @click="loadWired"
          >
            {{ loadingWired ? "Refreshing…" : "Refresh" }}
          </button>
        </div>

        <p v-if="loadingWired" class="mt-3 text-sm text-gray-500">Scanning…</p>
        <p
          v-else-if="wiredDevices.length === 0"
          class="mt-3 text-sm text-gray-600"
        >
          No wired devices found.
        </p>

        <ul v-else class="mt-4 space-y-3">
          <li
            v-for="d in wiredDevices"
            :key="d.id"
            class="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">
                  {{ d.name || d.type }}
                </p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset"
                  :class="statusClass(d.status)"
                >
                  {{ d.status }}
                </span>
              </div>

              <p class="mt-0.5 text-xs text-gray-500">
                {{ d.deviceUid }} · {{ d.model }}
              </p>

              <p v-if="d.status === 'OFFLINE'" class="mt-1 text-xs text-gray-400">
                Start MQTT simulator first to make this device online.
              </p>
            </div>

            <button
              type="button"
              class="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="
                d.status === 'OFFLINE' || busyConnectWiredUid === d.deviceUid
              "
              @click="connectWired(d)"
            >
              {{
                busyConnectWiredUid === d.deviceUid ? "Connecting…" : "Connect"
              }}
            </button>
          </li>
        </ul>
      </div>

      <div
        v-else-if="mode === 'wifi'"
        class="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-900">Wi-Fi devices</p>
            <p class="mt-1 text-xs text-gray-500">
              Select a discovered Wi-Fi device and enter its activation code.
            </p>
          </div>

          <button
            type="button"
            class="text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingWifi"
            @click="loadWifi"
          >
            {{ loadingWifi ? "Refreshing…" : "Refresh" }}
          </button>
        </div>

        <p v-if="loadingWifi" class="mt-3 text-sm text-gray-500">Scanning…</p>
        <p
          v-else-if="wifiDevices.length === 0"
          class="mt-3 text-sm text-gray-600"
        >
          No Wi-Fi devices found.
        </p>

        <ul v-else class="mt-4 space-y-3">
          <li
            v-for="d in wifiDevices"
            :key="d.id"
            class="rounded-2xl bg-white px-4 py-3 shadow-sm"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-gray-900">
                    {{ d.name || d.type }}
                  </p>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset"
                    :class="statusClass(d.status)"
                  >
                    {{ d.status }}
                  </span>
                </div>

                <p class="mt-0.5 text-xs text-gray-500">
                  {{ d.deviceUid }} · {{ d.model }}
                </p>
              </div>

              <button
                type="button"
                class="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="d.status === 'OFFLINE'"
                @click="startWifiConnect(d)"
              >
                Connect
              </button>
            </div>

            <div
              v-if="selectedWifiDevice?.deviceUid === d.deviceUid"
              class="mt-4 rounded-2xl bg-gray-50 p-4"
            >
              <p class="text-sm font-semibold text-gray-900">
                Enter device info
              </p>

              <form class="mt-4 space-y-4" @submit.prevent="connectWifi">
                <div>
                  <label class="text-sm font-medium text-gray-700">
                    Device name
                  </label>
                  <input
                    v-model="wifiDeviceName"
                    required
                    type="text"
                    placeholder="e.g. Living Room Sensor"
                    class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
                  />
                </div>

                <div>
                  <label class="text-sm font-medium text-gray-700">
                    Activation code
                  </label>
                  <input
                    v-model="wifiActivationCode"
                    required
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="e.g. XYZ789"
                    class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
                  />
                </div>

                <div class="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    class="text-sm font-semibold text-gray-700 hover:text-gray-900"
                    @click="selectedWifiDevice = null"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    :disabled="busyConnectWifiUid === d.deviceUid"
                    class="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{
                      busyConnectWifiUid === d.deviceUid
                        ? "Connecting…"
                        : "Connect"
                    }}
                  </button>
                </div>
              </form>
            </div>
          </li>
        </ul>
      </div>

      <div
        v-else-if="mode === 'lpwan'"
        class="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-900">
              LoRaWAN-like devices
            </p>
            <p class="mt-1 text-xs text-gray-500">
              Devices first join the simulated LPWAN network, then users claim
              ownership with activation code.
            </p>
          </div>

          <button
            type="button"
            class="text-sm font-semibold text-gray-700 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingLpwan"
            @click="loadLpwan"
          >
            {{ loadingLpwan ? "Refreshing…" : "Refresh" }}
          </button>
        </div>

        <p v-if="loadingLpwan" class="mt-3 text-sm text-gray-500">
          Scanning LoRaWAN uplinks…
        </p>

        <p
          v-else-if="lpwanDevices.length === 0"
          class="mt-3 text-sm text-gray-600"
        >
          No unclaimed LPWAN devices found. Run
          <span class="font-mono">npm run sim:lpwan</span>
          first, then click Refresh.
        </p>

        <ul v-else class="mt-4 space-y-3">
          <li
            v-for="d in lpwanDevices"
            :key="d.id"
            class="rounded-2xl bg-white px-4 py-3 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-gray-900">
                    {{ d.name || d.type }}
                  </p>

                  <span
                    class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100"
                  >
                    {{ d.networkType || "LORAWAN" }}
                  </span>

                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset"
                    :class="statusClass(d.status)"
                  >
                    {{ d.status }}
                  </span>
                </div>

                <p class="mt-1 text-xs text-gray-500">
                  DevEUI: {{ d.devEui || "—" }}
                </p>

                <p class="mt-1 text-xs text-gray-500">
                  Gateway: {{ d.gatewayId || "—" }}
                  <span v-if="d.lastRssi !== null && d.lastRssi !== undefined">
                    · RSSI {{ Math.round(d.lastRssi) }} dBm
                  </span>
                  <span v-if="d.lastSnr !== null && d.lastSnr !== undefined">
                    · SNR {{ d.lastSnr }} dB
                  </span>
                  <span v-if="d.lastSpreadingFactor">
                    · SF{{ d.lastSpreadingFactor }}
                  </span>
                  <span
                    v-if="
                      d.lastBatteryPct !== null &&
                      d.lastBatteryPct !== undefined
                    "
                  >
                    · Battery {{ Math.round(d.lastBatteryPct) }}%
                  </span>
                </p>

                <p class="mt-1 text-xs text-gray-400">
                  Join status: {{ d.joinStatus || "UNCLAIMED" }}
                </p>
              </div>

              <button
                type="button"
                class="rounded-2xl bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!d.devEui"
                @click="startLpwanConnect(d)"
              >
                Claim
              </button>
            </div>

            <div
              v-if="selectedLpwanDevice?.id === d.id"
              class="mt-4 rounded-2xl bg-gray-50 p-4"
            >
              <p class="text-sm font-semibold text-gray-900">
                Claim LPWAN device
              </p>

              <form class="mt-4 space-y-4" @submit.prevent="connectLpwan">
                <div>
                  <label class="text-sm font-medium text-gray-700">
                    Device name
                  </label>
                  <input
                    v-model="lpwanDeviceName"
                    required
                    type="text"
                    placeholder="e.g. LoRa Temp Sensor 01"
                    class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
                  />
                </div>

                <div>
                  <label class="text-sm font-medium text-gray-700">
                    Activation code
                  </label>
                  <input
                    v-model="lpwanActivationCode"
                    required
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="e.g. ABC123"
                    class="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-300"
                  />
                </div>

                <div class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p class="text-sm font-semibold text-blue-900">
                    LoRaWAN-like flow
                  </p>
                  <p class="mt-1 text-sm text-blue-700">
                    This device has already joined the simulated LPWAN network
                    through gateway uplinks. Claiming only associates it with
                    your account.
                  </p>
                </div>

                <div class="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    class="text-sm font-semibold text-gray-700 hover:text-gray-900"
                    @click="selectedLpwanDevice = null"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    :disabled="busyConnectLpwanDevEui === d.devEui"
                    class="rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{
                      busyConnectLpwanDevEui === d.devEui
                        ? "Claiming…"
                        : "Claim LPWAN device"
                    }}
                  </button>
                </div>
              </form>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>