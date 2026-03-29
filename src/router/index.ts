import { createRouter, createWebHashHistory } from "vue-router";
import SetupView from "@/views/SetupView.vue";
import WalletView from "@/views/WalletView.vue";
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
import { useSessionStore } from "@/stores/session";

const routes = [
  {
    path: "/",
    redirect: "/account",
  },
  {
    path: "/account",
    component: AccountSetupView,
    meta: {
      titleKey: "Account Setup",
      subtitleKey: "Create and save your TAIRA wallet",
    },
  },
  {
    path: "/setup",
    component: SetupView,
    meta: {
      titleKey: "Session Setup",
      subtitleKey: "TAIRA connection & keys",
    },
  },
  {
    path: "/wallet",
    component: WalletView,
    meta: {
      titleKey: "Wallet Overview",
      subtitleKey: "Balances & activity",
    },
  },
  {
    path: "/vpn",
    component: VpnView,
    meta: {
      titleKey: "Sora VPN",
      subtitleKey: "Connect through the TAIRA privacy lane",
    },
  },
  {
    path: "/staking",
    component: StakingView,
    meta: {
      titleKey: "NPOS Staking",
      subtitleKey: "Nominate validators and stake XOR",
    },
  },
  {
    path: "/parliament",
    component: ParliamentView,
    meta: {
      titleKey: "SORA Parliament",
      subtitleKey: "Citizenship bond and governance voting",
    },
  },
  {
    path: "/subscriptions",
    component: SubscriptionHubView,
    meta: {
      titleKey: "Subscription Hub",
      subtitleKey: "Auto-deduct and manage services",
    },
  },
  {
    path: "/send",
    component: SendView,
    meta: {
      titleKey: "Send Points",
      subtitleKey: "Transfer assets via Torii",
    },
  },
  {
    path: "/receive",
    component: ReceiveView,
    meta: {
      titleKey: "Receive Points",
      subtitleKey: "Share QR or Account ID",
    },
  },
  {
    path: "/kaigi",
    component: KaigiView,
    meta: {
      titleKey: "Kaigi Calls",
      subtitleKey: "Direct audio/video room with manual signaling",
    },
  },
  {
    path: "/explore",
    component: ExploreView,
    meta: {
      titleKey: "Explorer",
      subtitleKey: "Network & asset insights",
    },
  },
  {
    path: "/offline",
    component: OfflineView,
    meta: {
      titleKey: "Offline",
      subtitleKey: "Offline wallets, invoices, and payments",
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!session.hydrated) {
    session.hydrate();
  }
  if (!session.hasAccount && to.path !== "/account") {
    return "/account";
  }
  return true;
});

export default router;
