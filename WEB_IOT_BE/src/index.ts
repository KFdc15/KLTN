import { createApp } from './app'
import { env } from './env'
import { initIO, closeIO } from './realtime/io'
import { startMqtt, stopMqtt } from './mqtt/client'
import { startOfflineScheduler, stopOfflineScheduler } from './devices/offlineScheduler'

import http from 'http'

const app = createApp()

const httpServer = http.createServer(app)
initIO(httpServer)

httpServer.listen(env.PORT, () => {
	console.log(`API listening on http://localhost:${env.PORT}`)
	startMqtt()
	startOfflineScheduler()
})

function shutdown(signal: string) {
	console.log(`${signal} received, shutting down...`)
	stopOfflineScheduler()
	Promise.allSettled([stopMqtt(), closeIO()])
		.finally(() => {
			httpServer.close(() => {
				process.exit(0)
			})
		})
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
