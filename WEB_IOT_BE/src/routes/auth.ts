import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'

import { prisma } from '../db/prisma'
import { signAccessToken } from '../auth/jwt'
import { requireAuth } from '../middleware/requireAuth'

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export const authRouter = Router()

authRouter.post('/signup', async (req, res) => {
	const { email, password, fullName } = (req.body ?? {}) as {
		email?: string
		password?: string
		fullName?: string
	}
	if (!email || !password || !fullName) return res.status(400).json({ error: 'Missing email, password, or fullName' })
	if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' })
	if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
	if (!fullName.trim()) return res.status(400).json({ error: 'Invalid fullName' })

	try {
		const existing = await prisma.user.findUnique({ where: { email } })
		if (existing) return res.status(409).json({ error: 'Email already in use' })

		const passwordHash = await bcrypt.hash(password, 10)
		const user = await prisma.user.create({
			data: { email, passwordHash, fullName: fullName.trim() },
			select: { id: true, email: true, fullName: true, createdAt: true },
		})

		const accessToken = signAccessToken({ id: user.id, email: user.email })
		return res.status(201).json({ accessToken, user })
	} catch (err) {
		if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
			return res.status(409).json({ error: 'Email already in use' })
		}
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})

authRouter.post('/login', async (req, res) => {
	const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
	if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })
	if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' })

	try {
		const userWithHash = await prisma.user.findUnique({
			where: { email },
			select: { id: true, email: true, fullName: true, createdAt: true, passwordHash: true },
		})

		if (!userWithHash) return res.status(401).json({ error: 'Invalid credentials' })

		const ok = await bcrypt.compare(password, userWithHash.passwordHash)
		if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

		const accessToken = signAccessToken({ id: userWithHash.id, email: userWithHash.email })
		const { passwordHash: _passwordHash, ...user } = userWithHash
		return res.json({ accessToken, user })
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})

authRouter.get('/me', requireAuth, async (req, res) => {
	return res.json({ user: req.user })
})

authRouter.patch('/me', requireAuth, async (req, res) => {
	const { fullName } = (req.body ?? {}) as { fullName?: string }
	if (typeof fullName !== 'string') return res.status(400).json({ error: 'Missing fullName' })
	if (!fullName.trim()) return res.status(400).json({ error: 'Invalid fullName' })

	try {
		const user = await prisma.user.update({
			where: { id: req.user!.id },
			data: { fullName: fullName.trim() },
			select: { id: true, email: true, fullName: true, createdAt: true },
		})
		return res.json({ user })
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})

authRouter.patch('/me/password', requireAuth, async (req, res) => {
	const { currentPassword, newPassword } = (req.body ?? {}) as {
		currentPassword?: string
		newPassword?: string
	}
	if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing currentPassword or newPassword' })
	if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

	try {
		const userWithHash = await prisma.user.findUnique({
			where: { id: req.user!.id },
			select: { id: true, passwordHash: true },
		})
		if (!userWithHash) return res.status(401).json({ error: 'Unauthorized' })

		const ok = await bcrypt.compare(currentPassword, userWithHash.passwordHash)
		if (!ok) return res.status(400).json({ error: 'Current password is incorrect' })

		const passwordHash = await bcrypt.hash(newPassword, 10)
		await prisma.user.update({
			where: { id: userWithHash.id },
			data: { passwordHash },
		})

		return res.status(204).send()
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})

authRouter.delete('/me', requireAuth, async (req, res) => {
	try {
		await prisma.user.delete({ where: { id: req.user!.id } })
		return res.status(204).send()
	} catch (err) {
		if (err instanceof Prisma.PrismaClientInitializationError) {
			return res.status(503).json({ error: 'Database unavailable' })
		}
		return res.status(500).json({ error: 'Internal server error' })
	}
})
