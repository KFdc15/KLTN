import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { createPinia } from 'pinia'
import { router } from './router'
import { useAuthStore } from './store/authStore'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

useAuthStore(pinia).restoreSession()
app.use(router)
app.mount('#app')
