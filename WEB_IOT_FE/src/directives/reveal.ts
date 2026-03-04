type RevealBinding = {
	delay?: number
}

export const reveal = {
	mounted(el: HTMLElement, binding: { value?: RevealBinding }) {
		const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
		if (prefersReducedMotion) {
			return
		}

		el.classList.add('opacity-0', 'translate-y-4', 'will-change-transform')
		el.classList.add('transition', 'duration-700', 'ease-out')

		const delay = binding.value?.delay
		if (typeof delay === 'number' && delay >= 0) {
			el.style.transitionDelay = `${delay}ms`
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue
					const target = entry.target as HTMLElement
					target.classList.remove('opacity-0', 'translate-y-4')
					target.classList.add('opacity-100', 'translate-y-0')
					observer.unobserve(target)
				}
			},
			{ threshold: 0.12 },
		)

		observer.observe(el)
	},
} as const
