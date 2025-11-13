<template>
  <SakuraScene />
  <div class="app-container">
    <header class="app-header">
      <div class="logo-wrapper">
        <img :src="logo" alt="Iroha logo" class="logo" />
        <div>
          <p class="app-title">Iroha Points</p>
          <p class="app-subtitle">Modern Torii-connected wallet</p>
        </div>
      </div>
      <div class="header-stats">
        <div>
          <p class="meta-label">Torii</p>
          <p class="meta-value">{{ session.connection.toriiUrl || 'Not configured' }}</p>
        </div>
        <div>
          <p class="meta-label">Account</p>
          <p class="meta-value">{{ session.user.accountId || 'None' }}</p>
        </div>
        <div>
          <p class="meta-label">UAID</p>
          <p class="meta-value">{{ session.user.uaid || 'Not set' }}</p>
        </div>
      </div>
      <button class="theme-toggle" @click="theme.toggle()">
        <span>{{ theme.current === 'dark' ? 'Light Mode' : 'Dark Mode' }}</span>
      </button>
    </header>
    <div class="app-shell">
      <aside class="sidebar">
        <nav>
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
          class="nav-link"
          :class="{ active: route.path.startsWith(item.to) }"
        >
          <img :src="item.icon" class="nav-icon" :alt="item.label" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
        <div class="session-meta" v-if="session.connection.chainId">
          <p class="meta-label">Chain</p>
          <p class="meta-value">{{ session.connection.chainId }}</p>
        </div>
      </aside>
      <section class="workspace">
        <header class="workspace-header">
          <div>
            <p class="section-label">{{ route.meta.subtitle }}</p>
            <h1>{{ route.meta.title }}</h1>
          </div>
        </header>
        <main>
          <RouterView />
        </main>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useSessionStore } from './stores/session'
import { useThemeStore } from './stores/theme'
import { onMounted, onBeforeUnmount } from 'vue'
import IrohaLogo from '@/assets/iroha_logo.svg'
import WalletIcon from '@/assets/wallet.svg'
import SendIcon from '@/assets/send.svg'
import ReceiveIcon from '@/assets/receive.svg'
import UserIcon from '@/assets/user.svg'
import SakuraScene from '@/components/SakuraScene.vue'

const navItems = [
  { to: '/uaid', label: 'UAID Setup', icon: UserIcon },
  { to: '/setup', label: 'Setup', icon: UserIcon },
  { to: '/wallet', label: 'Wallet', icon: WalletIcon },
  { to: '/send', label: 'Send', icon: SendIcon },
  { to: '/receive', label: 'Receive', icon: ReceiveIcon },
  { to: '/explore', label: 'Explore', icon: WalletIcon }
]

const route = useRoute()
const session = useSessionStore()
const theme = useThemeStore()
const logo = IrohaLogo
const updateParallax = (event: PointerEvent) => {
  const x = ((event.clientX / window.innerWidth) - 0.5).toFixed(3)
  const y = ((event.clientY / window.innerHeight) - 0.5).toFixed(3)
  document.documentElement.style.setProperty('--parallax-x', x)
  document.documentElement.style.setProperty('--parallax-y', y)
}

onMounted(() => {
  window.addEventListener('pointermove', updateParallax, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', updateParallax)
})
</script>
