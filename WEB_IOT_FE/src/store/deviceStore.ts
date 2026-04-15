import { defineStore } from 'pinia'

import { io, type Socket } from 'socket.io-client'

import { API_BASE_URL, apiRequest } from '../lib/api'
import { formatRelativeTime, formatTimeLabel } from '../lib/time'
import { useAuthStore } from './authStore'

const TELEMETRY_RANGE_MINUTES = 30
const TELEMETRY_MAX_POINTS = 500

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'WARNING'

export type TelemetryPoint = {
	ts: string
	temperatureC: number
	humidityPct: number
	signalDbm: number
}

export type Device = {
	id: string
	uid: string
	name: string
	type: string
	status: DeviceStatus
	lastSeenAt: string | null
	latestTelemetry: TelemetryPoint | null
}

type DeviceStatusEvent = {
	deviceId: string
	uid: string
	status: DeviceStatus
	lastSeenAt: string | null
}

type TelemetryNewEvent = {
	deviceId: string
	uid: string
	ts: string
	temperatureC: number
	humidityPct: number
	signalDbm: number
}

type TelemetrySeries = {
	labels: string[]
	temperature: number[]
	humidity: number[]
	signalStrength: number[]
}

let socket: Socket | null = null
let relativeTimeTimer: number | null = null

function pruneTelemetryWindow(window: TelemetryPoint[], nowIso: string) {
	const now = new Date(nowIso)
	if (Number.isNaN(now.getTime())) return
	const cutoff = now.getTime() - TELEMETRY_RANGE_MINUTES * 60 * 1000

	while (window.length && new Date(window[0]!.ts).getTime() < cutoff) {
		window.shift()
	}
	while (window.length > TELEMETRY_MAX_POINTS) {
		window.shift()
	}
}

export const useDeviceStore = defineStore('device', {
	state: () => {
		return {
			devices: [] as Device[],
			selectedDeviceId: null as string | null,
			telemetryWindow: [] as TelemetryPoint[],
			relativeTimeTick: 0,
			loading: false,
			error: null as string | null,
			socketConnected: false,
			socketError: null as string | null,
		}
	},
	getters: {
		totalDevices: (state) => state.devices.length,
		activeDevices: (state) => state.devices.filter((d) => d.status === 'ONLINE').length,
		offlineDevices: (state) => state.devices.filter((d) => d.status === 'OFFLINE').length,
		alerts: (state) => state.devices.filter((d) => d.status === 'WARNING').length,
		recentDevices: (state) => state.devices.slice(0, 5),
		telemetry: (state): TelemetrySeries => {
			return {
				labels: state.telemetryWindow.map((p) => formatTimeLabel(p.ts)),
				temperature: state.telemetryWindow.map((p) => p.temperatureC),
				humidity: state.telemetryWindow.map((p) => p.humidityPct),
				signalStrength: state.telemetryWindow.map((p) => p.signalDbm),
			}
		},
	},
	actions: {
		async bootstrap() {
			if (this.loading) return
			const auth = useAuthStore()
			if (!auth.accessToken) return
			this.startRelativeTimeClock()
			await this.loadDevices()
			this.connectSocket()
		},
		startRelativeTimeClock() {
			if (relativeTimeTimer) return
			relativeTimeTimer = window.setInterval(() => {
				this.relativeTimeTick = (this.relativeTimeTick + 1) % 1_000_000_000
			}, 60_000)
		},
		stopRelativeTimeClock() {
			if (!relativeTimeTimer) return
			window.clearInterval(relativeTimeTimer)
			relativeTimeTimer = null
		},
		async loadDevices() {
			const auth = useAuthStore()
			if (!auth.accessToken) return
			this.loading = true
			this.error = null
			try {
				const data = await apiRequest<{ devices: Device[] }>('/devices', { token: auth.accessToken })
				this.devices = data.devices
				if (!this.selectedDeviceId && this.devices.length) {
					this.selectedDeviceId = (this.devices.find((d) => d.latestTelemetry)?.id ?? this.devices[0]!.id)
				}
				await this.loadTelemetryWindow()
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to load devices'
			} finally {
				this.loading = false
			}
		},
		async loadTelemetryWindow() {
			const auth = useAuthStore()
			if (!auth.accessToken || !this.selectedDeviceId) return
			try {
				const to = new Date()
				const from = new Date(to.getTime() - TELEMETRY_RANGE_MINUTES * 60 * 1000)
				const params = new URLSearchParams({
					limit: String(TELEMETRY_MAX_POINTS),
					from: from.toISOString(),
					to: to.toISOString(),
				})
				const data = await apiRequest<{ telemetry?: TelemetryPoint[] }>(
					`/devices/${this.selectedDeviceId}/telemetry?${params.toString()}`,
					{ token: auth.accessToken }
				)
				this.telemetryWindow = data.telemetry ?? []
				pruneTelemetryWindow(this.telemetryWindow, to.toISOString())
			} catch {
				this.telemetryWindow = []
			}
		},
		getLastUpdateLabel(device: Device) {
			// Depend on a 60s tick so any UI showing relative time refreshes automatically.
			void this.relativeTimeTick
			return formatRelativeTime(device.lastSeenAt ?? device.latestTelemetry?.ts ?? null)
		},
		connectSocket() {
			const auth = useAuthStore()
			if (!auth.accessToken) return
			if (socket) return

			this.socketError = null
			socket = io(API_BASE_URL, {
				auth: { token: auth.accessToken },
				transports: ['websocket', 'polling'],
			})
			const s = socket

			s.on('connect', () => {
				this.socketConnected = true
			})
			s.on('disconnect', () => {
				this.socketConnected = false
			})
			s.on('connect_error', (err: unknown) => {
				this.socketConnected = false
				this.socketError = err instanceof Error ? err.message : 'Socket connection error'
			})

			s.on('telemetry:new', (payload: TelemetryNewEvent) => {
				this.applyTelemetry(payload)
			})
			s.on('device:status', (payload: DeviceStatusEvent) => {
				this.applyStatus(payload)
			})
		},
		disconnectSocket() {
			if (!socket) return
			socket.disconnect()
			socket = null
			this.socketConnected = false
		},
		applyTelemetry(payload: TelemetryNewEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (device) {
				device.latestTelemetry = {
					ts: payload.ts,
					temperatureC: payload.temperatureC,
					humidityPct: payload.humidityPct,
					signalDbm: payload.signalDbm,
				}
				device.lastSeenAt = payload.ts
			}

			if (this.selectedDeviceId === payload.deviceId) {
				this.telemetryWindow.push({
					ts: payload.ts,
					temperatureC: payload.temperatureC,
					humidityPct: payload.humidityPct,
					signalDbm: payload.signalDbm,
				})
				pruneTelemetryWindow(this.telemetryWindow, payload.ts)
			}
		},
		applyStatus(payload: DeviceStatusEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			device.status = payload.status
			device.lastSeenAt = payload.lastSeenAt
		},
		async addDevice(input: { uid: string; name: string; type: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			try {
				const data = await apiRequest<{ device: Device }>('/devices', {
					method: 'POST',
					token: auth.accessToken,
					body: { uid: input.uid, name: input.name, type: input.type },
				})
				this.devices.unshift(data.device)
				if (!this.selectedDeviceId) this.selectedDeviceId = data.device.id
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to add device'
				return false
			}
		},
		async updateDeviceName(input: { id: string; name: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			const name = (input?.name ?? '').trim()
			if (!input?.id || !name) return false
			this.error = null
			try {
				const data = await apiRequest<{ device?: Device }>(`/devices/${input.id}`, {
					method: 'PATCH',
					token: auth.accessToken,
					body: { name },
				})
				const updated = data?.device
				if (!updated) {
					await this.loadDevices()
					return true
				}

				const found = this.devices.some((d) => d.id === input.id)
				if (found) {
					this.devices = this.devices.map((d) => (d.id === input.id ? { ...d, ...updated } : d))
				} else {
					this.devices = [updated, ...this.devices]
				}
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to update device'
				return false
			}
		},
		async deleteDevice(input: { id: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			if (!input?.id) return false
			this.error = null
			try {
				await apiRequest(`/devices/${input.id}`, {
					method: 'DELETE',
					token: auth.accessToken,
				})
				this.devices = this.devices.filter((d) => d.id !== input.id)
				if (this.selectedDeviceId === input.id) {
					this.selectedDeviceId = this.devices[0]?.id ?? null
					await this.loadTelemetryWindow()
				}
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to delete device'
				return false
			}
		},
	},
})
