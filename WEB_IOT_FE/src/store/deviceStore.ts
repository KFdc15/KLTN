import { defineStore } from 'pinia'

import { io, type Socket } from 'socket.io-client'

import { API_BASE_URL, apiRequest } from '../lib/api'
import { formatRelativeTime } from '../lib/time'
import { useAuthStore } from './authStore'

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'WARNING'

export type TelemetryPoint = {
	ts: string
	temperatureC: number
	humidityPct: number
	signalDbm?: number | null
}

export type Device = {
	id: string
	deviceUid?: string
	name: string
	type: string
	model?: string
	status: DeviceStatus
	lastSeenAt: string | null
	latestTelemetry: TelemetryPoint | null
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
	cameraFrameUrl?: string
}

type DeviceStatusEvent = {
	deviceId: string
	status: DeviceStatus
	lastSeenAt: string | null
}

type TelemetryNewEvent = {
	deviceId: string
	ts: string
	temperatureC: number
	humidityPct: number
	signalDbm?: number | null
}

type DeviceRuntimeEvent = {
	deviceId: string
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
}

type CameraFrameEvent = {
	deviceId: string
	ts: string
	dataUrl: string
}

let socket: Socket | null = null
let relativeTimeTimer: number | null = null

export const useDeviceStore = defineStore('device', {
	state: () => {
		return {
			devices: [] as Device[],
			telemetryWindowByDeviceId: {} as Record<string, TelemetryPoint[]>,
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
				for (const d of this.devices) {
					if (!this.telemetryWindowByDeviceId[d.id]) {
						this.telemetryWindowByDeviceId[d.id] = d.latestTelemetry ? [d.latestTelemetry] : []
					}
				}
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to load devices'
			} finally {
				this.loading = false
			}
		},
		getTelemetryWindow(deviceId: string) {
			return this.telemetryWindowByDeviceId[deviceId] ?? []
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
			s.on('device:runtime', (payload: DeviceRuntimeEvent) => {
				this.applyRuntime(payload)
			})
			s.on('camera:frame', (payload: CameraFrameEvent) => {
				this.applyCameraFrame(payload)
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
				const point: TelemetryPoint = {
					ts: payload.ts,
					temperatureC: payload.temperatureC,
					humidityPct: payload.humidityPct,
					signalDbm: payload.signalDbm ?? null,
				}
				device.latestTelemetry = point
				device.lastSeenAt = payload.ts

				const window = this.telemetryWindowByDeviceId[payload.deviceId] ?? []
				window.push(point)
				while (window.length > 30) window.shift()
				this.telemetryWindowByDeviceId[payload.deviceId] = window
			}
		},
		applyStatus(payload: DeviceStatusEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			device.status = payload.status
			device.lastSeenAt = payload.lastSeenAt
		},
		applyRuntime(payload: DeviceRuntimeEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			if (typeof payload.lightOn === 'boolean') device.lightOn = payload.lightOn
			if (typeof payload.acOn === 'boolean') device.acOn = payload.acOn
			if (typeof payload.acTargetTempC === 'number' && Number.isFinite(payload.acTargetTempC)) {
				device.acTargetTempC = payload.acTargetTempC
			}
		},
		applyCameraFrame(payload: CameraFrameEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			device.cameraFrameUrl = payload.dataUrl
		},
		async claimDevice(input: { activationCode: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) throw new Error('Not authenticated')
			const activationCode = (input?.activationCode ?? '').trim()
			if (!activationCode) throw new Error('Activation code is required')
			try {
				const data = await apiRequest<{ device: Device; message?: string }>('/devices/claim', {
					method: 'POST',
					token: auth.accessToken,
					body: { activationCode },
				})
				this.devices = [data.device, ...this.devices.filter((d) => d.id !== data.device.id)]
				this.telemetryWindowByDeviceId[data.device.id] = data.device.latestTelemetry ? [data.device.latestTelemetry] : []
				return true
			} catch (err) {
				throw err instanceof Error ? err : new Error('Failed to connect device')
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
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to delete device'
				return false
			}
		},
		async setLight(input: { id: string; on: boolean }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			if (!input?.id) return false
			this.error = null
			try {
				await apiRequest(`/devices/${input.id}/control/light`, {
					method: 'POST',
					token: auth.accessToken,
					body: { on: input.on },
				})
				const device = this.devices.find((d) => d.id === input.id)
				if (device) device.lightOn = input.on
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to control light'
				return false
			}
		},
		async setAirConditioner(input: { id: string; on?: boolean; targetTempC?: number }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			if (!input?.id) return false
			this.error = null
			try {
				await apiRequest(`/devices/${input.id}/control/ac`, {
					method: 'POST',
					token: auth.accessToken,
					body: {
						...(typeof input.on === 'boolean' ? { on: input.on } : {}),
						...(typeof input.targetTempC === 'number' ? { targetTempC: input.targetTempC } : {}),
					},
				})
				const device = this.devices.find((d) => d.id === input.id)
				if (device) {
					if (typeof input.on === 'boolean') device.acOn = input.on
					if (typeof input.targetTempC === 'number') device.acTargetTempC = input.targetTempC
				}
				return true
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Failed to control air conditioner'
				return false
			}
		},
	},
})
