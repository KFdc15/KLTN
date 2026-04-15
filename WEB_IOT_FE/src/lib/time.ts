export function formatRelativeTime(input: Date | string | null | undefined): string {
	if (!input) return 'Never'
	const ts = typeof input === 'string' ? new Date(input) : input
	if (Number.isNaN(ts.getTime())) return 'Never'

	const diffMs = Date.now() - ts.getTime()
	if (diffMs < 10_000) return 'Just now'
	const minutes = Math.floor(diffMs / 60_000)
	if (minutes <= 0) return 'Just now'
	if (minutes === 1) return '1 minute ago'
	if (minutes < 60) return `${minutes} minutes ago`
	const hours = Math.floor(minutes / 60)
	if (hours === 1) return '1 hour ago'
	return `${hours} hours ago`
}

export function formatTimeLabel(input: Date | string): string {
	const d = typeof input === 'string' ? new Date(input) : input
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
