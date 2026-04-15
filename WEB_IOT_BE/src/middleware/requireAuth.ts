import type { NextFunction, Request, Response } from 'express'

import { Prisma } from '@prisma/client'

import { verifyAccessToken } from '../auth/jwt'
import { prisma } from '../db/prisma'

function extractBearerToken(req: Request): string | null {
	const header = req.headers.authorization
	if (!header) return null
	const [scheme, token] = header.split(' ')
	if (scheme !== 'Bearer' || !token) return null
	return token
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
	const token = extractBearerToken(req)
	if (!token) return res.status(401).json({ error: 'Unauthorized' })

	let payload: { sub: string }
	try {
		payload = verifyAccessToken(token)
	} catch {
		return res.status(401).json({ error: 'Unauthorized' })
	}

	try {
		const user = await prisma.user.findUnique({
			where: { id: payload.sub },
			select: { id: true, email: true, fullName: true, createdAt: true },
		})

		if (!user) return res.status(401).json({ error: 'Unauthorized' })
		req.user = user
		return next()
	} catch (err) {
		// DB connectivity/auth issues should not be reported as auth failures.
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(503).json({ error: 'Database unavailable' })
	}
}
