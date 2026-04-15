import jwt from 'jsonwebtoken'

import { env } from '../env'

export type AccessTokenPayload = {
	sub: string
	email: string
}

function parseExpiresIn(value: string): jwt.SignOptions['expiresIn'] {
	const trimmed = value.trim()

	// Allow plain number (seconds)
	if (/^\d+$/.test(trimmed)) return Number(trimmed)

	// Allow ms-style shorthand values like: 15m, 10s, 1h, 7d
	if (/^\d+(s|m|h|d|w|y)$/.test(trimmed)) {
		return trimmed as unknown as jwt.SignOptions['expiresIn']
	}

	throw new Error(
		`Invalid JWT_ACCESS_TTL: "${value}" (expected e.g. "900" for seconds or "15m"/"1h"/"7d")`
	)
}

export function signAccessToken(user: { id: string; email: string }) {
	const payload: AccessTokenPayload = { sub: user.id, email: user.email }
	return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
		expiresIn: parseExpiresIn(env.JWT_ACCESS_TTL),
	})
}

export function verifyAccessToken(token: string) {
	return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
}
