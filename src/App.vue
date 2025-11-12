<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-accent">Iroha</span> Demo
      </div>
      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path.startsWith(item.to) }"
        >
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="session-meta">
        <p class="meta-label">Torii</p>
        <p class="meta-value">{{ session.connection.toriiUrl || 'Not configured' }}</p>
        <p class="meta-label">Account</p>
        <p class="meta-value">{{ session.user.accountId || 'None' }}</p>
      </div>
    </aside>
    <section class="workspace">
      <header class="workspace-header">
        <div>
          <p class="section-label">{{ route.meta.subtitle }}</p>
          <h1>{{ route.meta.title }}</h1>
        </div>
        <div class="chip" v-if="session.connection.chainId">
          Chain: {{ session.connection.chainId }}
        </div>
      </header>
      <main>
        <RouterView />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useSessionStore } from './stores/session'

const navItems = [
  { to: '/setup', label: 'Setup' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/send', label: 'Send' },
  { to: '/receive', label: 'Receive' },
  { to: '/explore', label: 'Explore' }
]

const route = useRoute()
const session = useSessionStore()

</script>
