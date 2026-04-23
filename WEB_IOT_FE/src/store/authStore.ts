import { defineStore } from 'pinia'

import { apiRequest } from '../lib/api'

type User = {
	id: string
	email: string
	fullName?: string | null
	createdAt: string
}

type AuthResponse = {
	accessToken: string
	user: User
}

const TOKEN_KEY = 'accessToken'
const REMEMBER_EMAIL_KEY = 'rememberEmail'

function readTokenFromStorage(): string | null {
	// Session-only auth: keep logged in while the tab is open.
	// Do not persist tokens across browser restarts.
	localStorage.removeItem(TOKEN_KEY)
	const sessionToken = sessionStorage.getItem(TOKEN_KEY)
	if (sessionToken && sessionToken.trim().length) return sessionToken
	return null
}

function clearTokenFromStorage() {
	localStorage.removeItem(TOKEN_KEY)
	sessionStorage.removeItem(TOKEN_KEY)
}

export const useAuthStore = defineStore('auth', {
	state: () => ({
		accessToken: null as string | null,
		user: null as User | null,
		loading: false,
		error: null as string | null,
		errorTimeoutId: null as number | null,
	}),
	getters: {
		isAuthenticated: (s) => Boolean(s.accessToken),
	},
	actions: {
		clearError() {
			this.error = null
			if (this.errorTimeoutId) {
				window.clearTimeout(this.errorTimeoutId)
				this.errorTimeoutId = null
			}
		},
		setError(message: string, autoClearMs = 4000) {
			this.clearError()
			this.error = message
			this.errorTimeoutId = window.setTimeout(() => {
				this.error = null
				this.errorTimeoutId = null
			}, autoClearMs)
		},
		initFromStorage() {
			this.accessToken = readTokenFromStorage()
		},
		getRememberedEmail() {
			const email = localStorage.getItem(REMEMBER_EMAIL_KEY)
			return email && email.trim().length ? email : null
		},
		setRememberedEmail(email: string | null) {
			if (!email || !email.trim()) {
				localStorage.removeItem(REMEMBER_EMAIL_KEY)
				return
			}
			localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim())
		},
		async fetchMe() {
			if (!this.accessToken) return
			try {
				const data = await apiRequest<{ user: User }>('/auth/me', {
					token: this.accessToken,
				})
				this.user = data.user
			} catch {
				// Keep the session; backend might be restarting/unreachable.
				// The UI can still work with a token even if /me fails temporarily.
				this.user = null
			}
		},
		restoreSession() {
			this.initFromStorage()
			// Fire-and-forget: hydrate user for header/UI.
			void this.fetchMe()
		},
		setAuth(payload: AuthResponse, rememberMe = true) {
			this.accessToken = payload.accessToken
			this.user = payload.user
			// Ensure token lives in only one place.
			clearTokenFromStorage()
			// Always sessionStorage: closes with tab/browser.
			sessionStorage.setItem(TOKEN_KEY, payload.accessToken)
			void rememberMe
		},
		logout() {
			this.accessToken = null
			this.user = null
			this.clearError()
			clearTokenFromStorage()
		},
		async login(email: string, password: string, rememberMe = true) {
			this.loading = true
			this.clearError()
			try {
				const data = await apiRequest<AuthResponse>('/auth/login', {
					method: 'POST',
					body: { email, password },
				})
				this.setAuth(data, rememberMe)
				return true
			} catch (err) {
				this.setError(err instanceof Error ? err.message : 'Login failed')
				return false
			} finally {
				this.loading = false
			}
		},
		async signup(email: string, password: string, fullName: string) {
			this.loading = true
			this.clearError()
			try {
				const data = await apiRequest<AuthResponse>('/auth/signup', {
					method: 'POST',
					body: { email, password, fullName },
				})
				this.setAuth(data)
				return true
			} catch (err) {
				this.setError(err instanceof Error ? err.message : 'Signup failed')
				return false
			} finally {
				this.loading = false
			}
		},
		async updateFullName(fullName: string) {
			if (!this.accessToken) return false
			this.clearError()
			try {
				const data = await apiRequest<{ user: User }>('/auth/me', {
					method: 'PATCH',
					token: this.accessToken,
					body: { fullName },
				})
				this.user = data.user
				return true
			} catch (err) {
				this.setError(err instanceof Error ? err.message : 'Failed to update profile')
				return false
			}
		},
		async changePassword(currentPassword: string, newPassword: string) {
			if (!this.accessToken) return false
			this.clearError()
			try {
				await apiRequest('/auth/me/password', {
					method: 'PATCH',
					token: this.accessToken,
					body: { currentPassword, newPassword },
				})
				return true
			} catch (err) {
				this.setError(err instanceof Error ? err.message : 'Failed to change password')
				return false
			}
		},
		async deleteAccount() {
			if (!this.accessToken) return false
			this.clearError()
			try {
				await apiRequest('/auth/me', {
					method: 'DELETE',
					token: this.accessToken,
				})
				return true
			} catch (err) {
				this.setError(err instanceof Error ? err.message : 'Failed to delete account')
				return false
			}
		},
	},
})
