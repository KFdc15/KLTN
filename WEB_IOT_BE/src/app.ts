import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { env } from './env'
import { authRouter } from './routes/auth'
import { devicesRouter } from './routes/devices'
import { requireAuth } from './middleware/requireAuth'

export function createApp() {
	const app = express()

	app.use(helmet())
	app.use(
		cors({
			origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : true,
			credentials: true,
		})
	)
	app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))
	app.use(express.json())

	app.get('/health', (_req, res) => {
		res.json({ ok: true, time: new Date().toISOString() })
	})

	app.use('/auth', authRouter)
	app.use('/devices', devicesRouter)
	app.get('/me', requireAuth, (req, res) => {
		res.json({ user: req.user })
	})

	return app
}
