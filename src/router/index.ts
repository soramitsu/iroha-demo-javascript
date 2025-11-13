import { createRouter, createWebHashHistory } from 'vue-router'
import SetupView from '@/views/SetupView.vue'
import WalletView from '@/views/WalletView.vue'
import SendView from '@/views/SendView.vue'
import ReceiveView from '@/views/ReceiveView.vue'
import ExploreView from '@/views/ExploreView.vue'
import UaidSetupView from '@/views/UaidSetupView.vue'
import { useSessionStore } from '@/stores/session'

const routes = [
  {
    path: '/',
    redirect: '/uaid'
  },
  {
    path: '/uaid',
    component: UaidSetupView,
    meta: {
      title: 'UAID Setup',
      subtitle: 'Register with SORA Nexus'
    }
  },
  {
    path: '/setup',
    component: SetupView,
    meta: {
      title: 'Session Setup',
      subtitle: 'Configure Torii & keys'
    }
  },
  {
    path: '/wallet',
    component: WalletView,
    meta: {
      title: 'Wallet Overview',
      subtitle: 'Balances & activity'
    }
  },
  {
    path: '/send',
    component: SendView,
    meta: {
      title: 'Send Points',
      subtitle: 'Transfer assets via Torii'
    }
  },
  {
    path: '/receive',
    component: ReceiveView,
    meta: {
      title: 'Receive Points',
      subtitle: 'Share QR or IH58'
    }
  },
  {
    path: '/explore',
    component: ExploreView,
    meta: {
      title: 'Explorer',
      subtitle: 'Network & asset insights'
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (!session.hasUaid && to.path !== '/uaid') {
    return '/uaid'
  }
  if (session.hasUaid && to.path === '/uaid') {
    return '/setup'
  }
  return true
})

export default router
