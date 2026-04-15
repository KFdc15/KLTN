import {
	createRouter,
	createWebHashHistory,
	type RouteLocationNormalized,
	type RouteRecordRaw,
} from 'vue-router'

const routes: RouteRecordRaw[] = [
	{
		path: '/',
		name: 'home',
		component: () => import('../views/LandingView.vue'),
		meta: { scrollTo: 'home' },
	},
	{
		path: '/app',
		component: () => import('../layouts/DashboardLayout.vue'),
		children: [
			{ path: '', redirect: '/app/dashboard' },
			{
				path: 'dashboard',
				name: 'app-dashboard',
				component: () => import('../components/dashboard/Dashboard.vue'),
				meta: { title: 'Dashboard' },
			},
			{
				path: 'settings',
				name: 'app-settings',
				component: () => import('../components/dashboard/AccountSettings.vue'),
				meta: { title: 'Account settings' },
			},
			{
				path: 'devices',
				name: 'app-devices',
				component: () => import('../components/dashboard/Devices.vue'),
				meta: { title: 'My Devices' },
			},
			{
				path: 'add-device',
				name: 'app-add-device',
				component: () => import('../components/dashboard/AddDevice.vue'),
				meta: { title: 'Add Device' },
			},
		],
	},
	{
		path: '/login',
		name: 'login',
		component: () => import('../components/Auth/LoginView.vue'),
	},
	{
		path: '/signup',
		name: 'signup',
		component: () => import('../components/Auth/SignupView.vue'),
	},
	{
		path: '/features',
		name: 'features',
		component: () => import('../views/LandingView.vue'),
		meta: { scrollTo: 'features' },
	},
	{
		path: '/about',
		name: 'about',
		component: () => import('../views/LandingView.vue'),
		meta: { scrollTo: 'about' },
	},
	{
		path: '/contact',
		name: 'contact',
		component: () => import('../views/LandingView.vue'),
		meta: { scrollTo: 'contact' },
	},
	{ path: '/:pathMatch(.*)*', redirect: '/' },
]

function scrollToSection(id: string, behavior: ScrollBehavior = 'smooth') {
	const element = document.getElementById(id)
	if (!element) return
	element.scrollIntoView({ behavior, block: 'start' })
}

export const router = createRouter({
	history: createWebHashHistory(),
	routes,
	scrollBehavior(to: RouteLocationNormalized) {
		const id = to.meta?.scrollTo as string | undefined
		if (!id) return { top: 0 }

		// Wait for the view to render before attempting to scroll.
		return new Promise((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					scrollToSection(id)
					resolve(false)
				})
			})
		})
	},
})

router.beforeEach((to) => {
	const token = localStorage.getItem('accessToken') ?? sessionStorage.getItem('accessToken')
	const authed = Boolean(token && token.trim().length)

	if (to.path.startsWith('/app') && !authed) return { path: '/login' }
	if ((to.path === '/login' || to.path === '/signup') && authed) return { path: '/app/dashboard' }
	return true
})

export const SECTION_ROUTES = [
	{ id: 'home', path: '/' },
	{ id: 'features', path: '/features' },
	{ id: 'about', path: '/about' },
	{ id: 'contact', path: '/contact' },
] as const

export type SectionId = (typeof SECTION_ROUTES)[number]['id']
