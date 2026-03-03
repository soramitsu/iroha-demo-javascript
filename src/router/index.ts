import { createRouter, createWebHashHistory } from "vue-router";
import SetupView from "@/views/SetupView.vue";
import WalletView from "@/views/WalletView.vue";
import StakingView from "@/views/StakingView.vue";
import SendView from "@/views/SendView.vue";
import ReceiveView from "@/views/ReceiveView.vue";
import ExploreView from "@/views/ExploreView.vue";
import AccountSetupView from "@/views/AccountSetupView.vue";
import OfflineView from "@/views/OfflineView.vue";
import SubscriptionHubView from "@/views/SubscriptionHubView.vue";
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
      title: "Account Setup",
      subtitle: "Provision your SORA Nexus account",
    },
  },
  {
    path: "/setup",
    component: SetupView,
    meta: {
      title: "Session Setup",
      subtitle: "Configure Torii & keys",
    },
  },
  {
    path: "/wallet",
    component: WalletView,
    meta: {
      title: "Wallet Overview",
      subtitle: "Balances & activity",
    },
  },
  {
    path: "/staking",
    component: StakingView,
    meta: {
      title: "NPOS Staking",
      subtitle: "Nominate validators and stake XOR",
    },
  },
  {
    path: "/subscriptions",
    component: SubscriptionHubView,
    meta: {
      title: "Subscription Hub",
      subtitle: "Auto-deduct and manage services",
    },
  },
  {
    path: "/send",
    component: SendView,
    meta: {
      title: "Send Points",
      subtitle: "Transfer assets via Torii",
    },
  },
  {
    path: "/receive",
    component: ReceiveView,
    meta: {
      title: "Receive Points",
      subtitle: "Share QR or IH58",
    },
  },
  {
    path: "/explore",
    component: ExploreView,
    meta: {
      title: "Explorer",
      subtitle: "Network & asset insights",
    },
  },
  {
    path: "/offline",
    component: OfflineView,
    meta: {
      title: "Offline",
      subtitle: "Offline wallets, invoices, and payments",
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!session.hasAccount && to.path !== "/account") {
    return "/account";
  }
  return true;
});

export default router;
