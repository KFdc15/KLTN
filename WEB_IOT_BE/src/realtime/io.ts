import type { Server as HttpServer } from 'http'

import { Server as SocketIOServer } from 'socket.io'

import { env } from '../env'
import { verifyAccessToken } from '../auth/jwt'

let io: SocketIOServer | null = null

export function userRoom(userId: string) {
	return `user:${userId}`
}

export function initIO(server: HttpServer) {
	io = new SocketIOServer(server, {
		cors: {
			origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : true,
			credentials: true,
		},
	})

	io.use((socket, next) => {
		const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token
		if (typeof token !== 'string' || !token.trim()) return next(new Error('Unauthorized'))

		try {
			const payload = verifyAccessToken(token)
			socket.data.userId = payload.sub
			socket.data.email = payload.email
			socket.join(userRoom(payload.sub))
			return next()
		} catch {
			return next(new Error('Unauthorized'))
		}
	})

	io.on('connection', (socket) => {
		socket.emit('hello', { ok: true, userId: socket.data.userId })
	})

	return io
}

export function getIO() {
	return io
}

export async function closeIO() {
	if (!io) return
	await io.close()
	io = null
}
