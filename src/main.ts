import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'
import { useThemeStore } from './stores/theme'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const session = useSessionStore()
const theme = useThemeStore()
session.hydrate()
theme.hydrate()

watch(
  () => session.$state,
  (state) => {
    session.persistState(state)
  },
  { deep: true }
)

app.mount('#app')
