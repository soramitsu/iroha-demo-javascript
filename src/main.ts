import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'
import { useThemeStore } from './stores/theme'
import { useOfflineStore } from './stores/offline'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const session = useSessionStore()
const theme = useThemeStore()
const offline = useOfflineStore()
session.hydrate()
theme.hydrate()
offline.hydrate()

watch(
  () => session.$state,
  (state) => {
    session.persistState(state)
  },
  { deep: true }
)

app.mount('#app')
