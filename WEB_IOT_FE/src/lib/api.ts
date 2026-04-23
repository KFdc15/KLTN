type ApiErrorBody = { error?: string }

type RequestOptions = {
	method?: string
	body?: unknown
	token?: string | null
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`
	let res: Response
	try {
		res = await fetch(url, {
			method: options.method ?? 'GET',
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		})
	} catch {
		throw new Error(
			`Cannot reach API at ${url}. Check backend is running and VITE_API_URL is correct (default: http://localhost:3000).`
		)
	}

	if (res.ok) {
		// Some endpoints may be 204
		if (res.status === 204) return undefined as T
		return (await res.json()) as T
	}

	// If the backend rejects the token (common after db reset/seed),
	// clear persisted auth so the app doesn't get stuck in an "authed" state.
	if (res.status === 401) {
		localStorage.removeItem('accessToken')
		sessionStorage.removeItem('accessToken')
		// Router uses hash history; force redirect if we're in an app route.
		if (window.location.hash.startsWith('#/app')) {
			window.location.hash = '#/login'
		}
	}

	let message = `Request failed (${res.status})`
	try {
		const body = (await res.json()) as ApiErrorBody
		if (body?.error) message = body.error
	} catch {
		// ignore
	}

	throw new Error(message)
}
