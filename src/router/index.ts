import { createRouter, createWebHashHistory } from "vue-router";
import SetupView from "@/views/SetupView.vue";
import WalletView from "@/views/WalletView.vue";
import StatsView from "@/views/StatsView.vue";
import StakingView from "@/views/StakingView.vue";
import ParliamentView from "@/views/ParliamentView.vue";
import SendView from "@/views/SendView.vue";
import ReceiveView from "@/views/ReceiveView.vue";
import ExploreView from "@/views/ExploreView.vue";
import AccountSetupView from "@/views/AccountSetupView.vue";
import OfflineView from "@/views/OfflineView.vue";
import SubscriptionHubView from "@/views/SubscriptionHubView.vue";
import KaigiView from "@/views/KaigiView.vue";
import VpnView from "@/views/VpnView.vue";
import SoraCloudView from "@/views/SoraCloudView.vue";
import SettingsView from "@/views/SettingsView.vue";
import { useSessionStore } from "@/stores/session";

const routes = [
  {
    path: "/",
    redirect: "/wallet",
  },
  {
    path: "/account",
    component: AccountSetupView,
    meta: {
      titleKey: "Create wallet",
      subtitleKey: "Create or restore a wallet",
    },
  },
  {
    path: "/setup",
    component: SetupView,
    meta: {
      titleKey: "Advanced settings",
      subtitleKey: "Network and developer settings",
    },
  },
  {
    path: "/settings",
    component: SettingsView,
    meta: {
      titleKey: "Settings",
      subtitleKey: "Endpoint and app preferences",
    },
  },
  {
    path: "/wallet",
    component: WalletView,
    meta: {
      titleKey: "Wallet",
      subtitleKey: "Balance, funding, and activity",
    },
  },
  {
    path: "/stats",
    component: StatsView,
    meta: {
      titleKey: "Network health",
      subtitleKey: "Supply, activity, and explorer signals",
    },
  },
  {
    path: "/vpn",
    component: VpnView,
    meta: {
      titleKey: "Sora VPN",
      subtitleKey: "Private network connection",
    },
  },
  {
    path: "/soracloud",
    component: SoraCloudView,
    meta: {
      titleKey: "SoraCloud",
      subtitleKey: "Launch and monitor live services",
    },
  },
  {
    path: "/staking",
    component: StakingView,
    meta: {
      titleKey: "Stake XOR",
      subtitleKey: "Choose a validator and manage stake",
    },
  },
  {
    path: "/parliament",
    component: ParliamentView,
    meta: {
      titleKey: "SORA Parliament",
      subtitleKey: "Register and vote",
    },
  },
  {
    path: "/subscriptions",
    component: SubscriptionHubView,
    meta: {
      titleKey: "Subscriptions",
      subtitleKey: "Recurring payments",
    },
  },
  {
    path: "/send",
    component: SendView,
    meta: {
      titleKey: "Send",
      subtitleKey: "Pay with a QR or account",
    },
  },
  {
    path: "/receive",
    component: ReceiveView,
    meta: {
      titleKey: "Receive",
      subtitleKey: "Show a payment QR",
    },
  },
  {
    path: "/kaigi",
    component: KaigiView,
    meta: {
      titleKey: "Kaigi",
      subtitleKey: "Wallet-based meeting links",
    },
  },
  {
    path: "/explore",
    component: ExploreView,
    meta: {
      titleKey: "Explorer",
      subtitleKey: "Explorer QR and network status",
    },
  },
  {
    path: "/offline",
    component: OfflineView,
    meta: {
      titleKey: "Offline",
      subtitleKey: "Device payments and invoices",
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (!session.hydrated) {
    await session.hydrate();
  }
  const isPublicRoute = to.path === "/account" || to.path === "/settings";
  if (!session.hasAccount && !isPublicRoute) {
    return "/account";
  }
  return true;
});

export default router;
