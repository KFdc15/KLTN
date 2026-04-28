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

export type RuntimePoint = {
	ts: string
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
}

export type CameraFramePoint = {
	ts: string
	dataUrl: string
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

export type DeviceNotificationKind = 'device-added' | 'device-deleted' | 'device-warning'

export type DeviceNotification = {
	id: string
	ts: string
	kind: DeviceNotificationKind
	title: string
	message?: string
	deviceId?: string
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

export type DiscoverableDevice = {
	id: string
	deviceUid: string
	name: string
	type: string
	model: string
	status: string
	lastSeenAt: string | null
	createdAt: string
	updatedAt: string
}

type PendingRuntime = {
	lightOn?: boolean
	acOn?: boolean
	acTargetTempC?: number
}

const PENDING_RUNTIME_MS = 8000
const pendingTimers = new Map<string, number>()

function pendingKey(deviceId: string, field: keyof PendingRuntime) {
	return `${deviceId}:${field}`
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
			runtimeWindowByDeviceId: {} as Record<string, RuntimePoint[]>,
			cameraFrameWindowByDeviceId: {} as Record<string, CameraFramePoint[]>,
			pendingRuntimeByDeviceId: {} as Record<string, PendingRuntime>,
			notifications: [] as DeviceNotification[],
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
		isLightBusy: (state) => (deviceId: string) => state.pendingRuntimeByDeviceId[deviceId]?.lightOn !== undefined,
		isAcBusy: (state) => (deviceId: string) => state.pendingRuntimeByDeviceId[deviceId]?.acOn !== undefined,
		isAcTargetBusy: (state) => (deviceId: string) => state.pendingRuntimeByDeviceId[deviceId]?.acTargetTempC !== undefined,
	},
	actions: {
		pushNotification(input: Omit<DeviceNotification, 'id' | 'ts'> & { ts?: string }) {
			const id = (globalThis.crypto && 'randomUUID' in globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
				? globalThis.crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(16).slice(2)}`
			const ts = input.ts ?? new Date().toISOString()
			const next: DeviceNotification = { id, ts, ...input }
			this.notifications = [next, ...this.notifications].slice(0, 20)
		},
		setPendingRuntime(deviceId: string, patch: Partial<PendingRuntime>) {
			const prev = this.pendingRuntimeByDeviceId[deviceId] ?? {}
			this.pendingRuntimeByDeviceId[deviceId] = { ...prev, ...patch }

			for (const [field, value] of Object.entries(patch) as Array<[keyof PendingRuntime, PendingRuntime[keyof PendingRuntime]]>) {
				if (value === undefined) continue
				const key = pendingKey(deviceId, field)
				const existing = pendingTimers.get(key)
				if (existing) window.clearTimeout(existing)
				pendingTimers.set(
					key,
					window.setTimeout(() => {
						const cur = this.pendingRuntimeByDeviceId[deviceId]
						if (!cur) return
						// Only clear if it still matches the pending value we set.
						if (cur[field] === value) {
							const next = { ...cur }
							delete next[field]
							if (!Object.keys(next).length) delete this.pendingRuntimeByDeviceId[deviceId]
							else this.pendingRuntimeByDeviceId[deviceId] = next
						}
						pendingTimers.delete(key)
					}, PENDING_RUNTIME_MS)
				)
			}
		},
		clearPendingRuntimeField(deviceId: string, field: keyof PendingRuntime) {
			const cur = this.pendingRuntimeByDeviceId[deviceId]
			if (!cur) return
			const next = { ...cur }
			delete next[field]
			if (!Object.keys(next).length) delete this.pendingRuntimeByDeviceId[deviceId]
			else this.pendingRuntimeByDeviceId[deviceId] = next

			const key = pendingKey(deviceId, field)
			const existing = pendingTimers.get(key)
			if (existing) window.clearTimeout(existing)
			pendingTimers.delete(key)
		},
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
					if (!this.runtimeWindowByDeviceId[d.id]) {
						this.runtimeWindowByDeviceId[d.id] = []
					}
					if (!this.cameraFrameWindowByDeviceId[d.id]) {
						this.cameraFrameWindowByDeviceId[d.id] = []
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
		getRuntimeWindow(deviceId: string) {
			return this.runtimeWindowByDeviceId[deviceId] ?? []
		},
		getCameraFrameWindow(deviceId: string) {
			return this.cameraFrameWindowByDeviceId[deviceId] ?? []
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
			const prevStatus = device.status
			device.status = payload.status
			device.lastSeenAt = payload.lastSeenAt
			if (payload.status === 'WARNING' && prevStatus !== 'WARNING') {
				const label = (device.name ?? '').trim() || device.type
				this.pushNotification({
					kind: 'device-warning',
					deviceId: device.id,
					title: 'Device warning',
					message: `${label} entered WARNING state.`,
					ts: payload.lastSeenAt ?? new Date().toISOString(),
				})
			}
		},
		applyRuntime(payload: DeviceRuntimeEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			const pending = this.pendingRuntimeByDeviceId[payload.deviceId]
			const ts = new Date().toISOString()
			let recorded = false
			const runtimePoint: RuntimePoint = { ts }

			if (typeof payload.lightOn === 'boolean') {
				if (pending?.lightOn !== undefined) {
					if (payload.lightOn === pending.lightOn) {
						device.lightOn = payload.lightOn
						this.clearPendingRuntimeField(payload.deviceId, 'lightOn')
						runtimePoint.lightOn = payload.lightOn
						recorded = true
					}
					// Ignore mismatched updates while pending to avoid flicker.
				} else {
					device.lightOn = payload.lightOn
					runtimePoint.lightOn = payload.lightOn
					recorded = true
				}
			}

			if (typeof payload.acOn === 'boolean') {
				if (pending?.acOn !== undefined) {
					if (payload.acOn === pending.acOn) {
						device.acOn = payload.acOn
						this.clearPendingRuntimeField(payload.deviceId, 'acOn')
						runtimePoint.acOn = payload.acOn
						recorded = true
					}
				} else {
					device.acOn = payload.acOn
					runtimePoint.acOn = payload.acOn
					recorded = true
				}
			}

			if (typeof payload.acTargetTempC === 'number' && Number.isFinite(payload.acTargetTempC)) {
				const next = payload.acTargetTempC
				if (pending?.acTargetTempC !== undefined) {
					if (next === pending.acTargetTempC) {
						device.acTargetTempC = next
						this.clearPendingRuntimeField(payload.deviceId, 'acTargetTempC')
						runtimePoint.acTargetTempC = next
						recorded = true
					}
				} else {
					device.acTargetTempC = next
					runtimePoint.acTargetTempC = next
					recorded = true
				}
			}

			if (recorded) {
				const window = this.runtimeWindowByDeviceId[payload.deviceId] ?? []
				window.push(runtimePoint)
				while (window.length > 30) window.shift()
				this.runtimeWindowByDeviceId[payload.deviceId] = window
			}
		},
		applyCameraFrame(payload: CameraFrameEvent) {
			const device = this.devices.find((d) => d.id === payload.deviceId)
			if (!device) return
			device.cameraFrameUrl = payload.dataUrl
			device.lastSeenAt = payload.ts

			const window = this.cameraFrameWindowByDeviceId[payload.deviceId] ?? []
			window.push({ ts: payload.ts, dataUrl: payload.dataUrl })
			while (window.length > 30) window.shift()
			this.cameraFrameWindowByDeviceId[payload.deviceId] = window
		},
		async discoverDevices(input: { method: 'wired' | 'wifi' }) {
			const auth = useAuthStore()
			if (!auth.accessToken) throw new Error('Not authenticated')
			const method = input?.method
			if (method !== 'wired' && method !== 'wifi') throw new Error('Invalid discovery method')
			const data = await apiRequest<{ devices: DiscoverableDevice[] }>('/devices/discover?method=' + method, {
				method: 'GET',
				token: auth.accessToken,
			})
			return data.devices ?? []
		},
		async claimDevice(input: { activationCode: string; name?: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) throw new Error('Not authenticated')
			const activationCode = (input?.activationCode ?? '').trim()
			if (!activationCode) throw new Error('Activation code is required')
			const name = (input?.name ?? '').trim()
			try {
				const data = await apiRequest<{ device: Device; message?: string }>('/devices/claim', {
					method: 'POST',
					token: auth.accessToken,
					body: { activationCode, ...(name ? { name } : {}) },
				})
				this.devices = [data.device, ...this.devices.filter((d) => d.id !== data.device.id)]
				this.telemetryWindowByDeviceId[data.device.id] = data.device.latestTelemetry ? [data.device.latestTelemetry] : []
				const label = (data.device.name ?? '').trim() || data.device.type
				this.pushNotification({
					kind: 'device-added',
					deviceId: data.device.id,
					title: 'Device added',
					message: label,
				})
				return true
			} catch (err) {
				throw err instanceof Error ? err : new Error('Failed to connect device')
			}
		},
		async claimWifiDevice(input: { deviceUid: string; activationCode: string; name: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) throw new Error('Not authenticated')
			const deviceUid = (input?.deviceUid ?? '').trim()
			const activationCode = (input?.activationCode ?? '').trim()
			const name = (input?.name ?? '').trim()
			if (!deviceUid) throw new Error('Device is required')
			if (!name) throw new Error('Device name is required')
			if (!activationCode) throw new Error('Activation code is required')
			try {
				const data = await apiRequest<{ device: Device; message?: string }>('/devices/claim-wifi', {
					method: 'POST',
					token: auth.accessToken,
					body: { deviceUid, activationCode, name },
				})
				this.devices = [data.device, ...this.devices.filter((d) => d.id !== data.device.id)]
				this.telemetryWindowByDeviceId[data.device.id] = data.device.latestTelemetry ? [data.device.latestTelemetry] : []
				const label = (data.device.name ?? '').trim() || data.device.type
				this.pushNotification({
					kind: 'device-added',
					deviceId: data.device.id,
					title: 'Device added',
					message: label,
				})
				return true
			} catch (err) {
				throw err instanceof Error ? err : new Error('Failed to connect device')
			}
		},
		async claimWiredDevice(input: { deviceUid: string }) {
			const auth = useAuthStore()
			if (!auth.accessToken) throw new Error('Not authenticated')
			const deviceUid = (input?.deviceUid ?? '').trim()
			if (!deviceUid) throw new Error('Device is required')
			try {
				const data = await apiRequest<{ device: Device; message?: string }>('/devices/claim-wired', {
					method: 'POST',
					token: auth.accessToken,
					body: { deviceUid },
				})
				this.devices = [data.device, ...this.devices.filter((d) => d.id !== data.device.id)]
				this.telemetryWindowByDeviceId[data.device.id] = data.device.latestTelemetry ? [data.device.latestTelemetry] : []
				const label = (data.device.name ?? '').trim() || data.device.type
				this.pushNotification({
					kind: 'device-added',
					deviceId: data.device.id,
					title: 'Device added',
					message: label,
				})
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
			const existing = this.devices.find((d) => d.id === input.id)
			try {
				await apiRequest(`/devices/${input.id}`, {
					method: 'DELETE',
					token: auth.accessToken,
				})
				this.devices = this.devices.filter((d) => d.id !== input.id)
				const label = (existing?.name ?? '').trim() || existing?.type || 'Device'
				this.pushNotification({
					kind: 'device-deleted',
					deviceId: input.id,
					title: 'Device deleted',
					message: label,
				})
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
			const device = this.devices.find((d) => d.id === input.id)
			const prev = device?.lightOn
			if (device) device.lightOn = input.on
			this.setPendingRuntime(input.id, { lightOn: input.on })
			try {
				await apiRequest(`/devices/${input.id}/control/light`, {
					method: 'POST',
					token: auth.accessToken,
					body: { on: input.on },
				})
				return true
			} catch (err) {
				this.clearPendingRuntimeField(input.id, 'lightOn')
				if (device) device.lightOn = prev
				this.error = err instanceof Error ? err.message : 'Failed to control light'
				return false
			}
		},
		async setAirConditioner(input: { id: string; on?: boolean; targetTempC?: number }) {
			const auth = useAuthStore()
			if (!auth.accessToken) return false
			if (!input?.id) return false
			this.error = null
			const device = this.devices.find((d) => d.id === input.id)
			const prevOn = device?.acOn
			const prevTarget = device?.acTargetTempC
			if (device) {
				if (typeof input.on === 'boolean') device.acOn = input.on
				if (typeof input.targetTempC === 'number') device.acTargetTempC = input.targetTempC
			}
			this.setPendingRuntime(input.id, {
				...(typeof input.on === 'boolean' ? { acOn: input.on } : {}),
				...(typeof input.targetTempC === 'number' ? { acTargetTempC: input.targetTempC } : {}),
			})
			try {
				await apiRequest(`/devices/${input.id}/control/ac`, {
					method: 'POST',
					token: auth.accessToken,
					body: {
						...(typeof input.on === 'boolean' ? { on: input.on } : {}),
						...(typeof input.targetTempC === 'number' ? { targetTempC: input.targetTempC } : {}),
					},
				})
				return true
			} catch (err) {
				if (typeof input.on === 'boolean') this.clearPendingRuntimeField(input.id, 'acOn')
				if (typeof input.targetTempC === 'number') this.clearPendingRuntimeField(input.id, 'acTargetTempC')
				if (device) {
					if (typeof input.on === 'boolean') device.acOn = prevOn
					if (typeof input.targetTempC === 'number') device.acTargetTempC = prevTarget
				}
				this.error = err instanceof Error ? err.message : 'Failed to control air conditioner'
				return false
			}
		},
	},
})
