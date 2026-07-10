import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
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
import SccpView from "@/views/SccpView.vue";
import SettingsView from "@/views/SettingsView.vue";
import { useSessionStore } from "@/stores/session";
import type {
  AppNavGroupDefinition,
  AppNavItem,
  AppRouteMeta,
} from "@/types/navigation";

const appRouteMeta = (meta: AppRouteMeta) => meta;

export const APP_NAV_GROUPS: readonly AppNavGroupDefinition[] = [
  { id: "daily", labelKey: "Daily", order: 10 },
  { id: "grow", labelKey: "Grow", order: 20 },
  { id: "services", labelKey: "Services", order: 30 },
];

const appRoutes = [
  {
    path: "/account",
    component: AccountSetupView,
    meta: appRouteMeta({
      titleKey: "Saved Wallets",
      subtitleKey: "Create, restore, or switch wallets",
      navLabelKey: "Saved Wallets",
      navGroup: "system",
      navOrder: 30,
      icon: "account",
      requiresAccount: false,
      navPlacement: "footer",
    }),
  },
  {
    path: "/setup",
    component: SetupView,
    meta: appRouteMeta({
      titleKey: "Advanced settings",
      subtitleKey: "Network and developer settings",
      navLabelKey: "Advanced",
      navGroup: "system",
      navOrder: 20,
      icon: "advanced",
      requiresAccount: true,
      navPlacement: "footer",
    }),
  },
  {
    path: "/settings",
    component: SettingsView,
    meta: appRouteMeta({
      titleKey: "Settings",
      subtitleKey: "Endpoint and app preferences",
      navLabelKey: "Settings",
      navGroup: "system",
      navOrder: 10,
      icon: "settings",
      requiresAccount: false,
      navPlacement: "footer",
    }),
  },
  {
    path: "/wallet",
    component: WalletView,
    meta: appRouteMeta({
      titleKey: "Wallet",
      subtitleKey: "Balance, funding, and activity",
      navLabelKey: "Wallet",
      navGroup: "daily",
      navOrder: 10,
      icon: "wallet",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/stats",
    component: StatsView,
    meta: appRouteMeta({
      titleKey: "Network health",
      subtitleKey: "Supply, activity, and explorer signals",
      navLabelKey: "Stats",
      navGroup: "services",
      navOrder: 10,
      icon: "stats",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/vpn",
    component: VpnView,
    meta: appRouteMeta({
      titleKey: "Sora VPN",
      subtitleKey: "Private network connection",
      navLabelKey: "VPN",
      navGroup: "services",
      navOrder: 40,
      icon: "vpn",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/soracloud",
    component: SoraCloudView,
    meta: appRouteMeta({
      titleKey: "SoraCloud",
      subtitleKey: "Launch and monitor live services",
      navLabelKey: "SoraCloud",
      navGroup: "services",
      navOrder: 30,
      icon: "cloud",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/staking",
    component: StakingView,
    meta: appRouteMeta({
      titleKey: "Stake XOR",
      subtitleKey: "Choose a validator and manage stake",
      navLabelKey: "Staking",
      navGroup: "grow",
      navOrder: 10,
      icon: "staking",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/governance",
    component: ParliamentView,
    meta: appRouteMeta({
      titleKey: "Governance",
      subtitleKey: "Citizenship, referenda, ballots, and council status",
      navLabelKey: "Governance",
      navGroup: "grow",
      navOrder: 20,
      icon: "governance",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/subscriptions",
    component: SubscriptionHubView,
    meta: appRouteMeta({
      titleKey: "Subscriptions",
      subtitleKey: "Recurring payments",
      navLabelKey: "Subscriptions",
      navGroup: "grow",
      navOrder: 30,
      icon: "subscriptions",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/sccp",
    component: SccpView,
    meta: appRouteMeta({
      titleKey: "SCCP Bridge",
      subtitleKey: "TAIRA, TRON, and BSC XOR bridge",
      navLabelKey: "SCCP Bridge",
      navGroup: "services",
      navOrder: 70,
      icon: "bridge",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/send",
    component: SendView,
    meta: appRouteMeta({
      titleKey: "Send",
      subtitleKey: "Pay with a QR or account",
      navLabelKey: "Send",
      navGroup: "daily",
      navOrder: 20,
      icon: "send",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/receive",
    component: ReceiveView,
    meta: appRouteMeta({
      titleKey: "Receive",
      subtitleKey: "Show a payment QR",
      navLabelKey: "Receive",
      navGroup: "daily",
      navOrder: 30,
      icon: "receive",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/kaigi",
    component: KaigiView,
    meta: appRouteMeta({
      titleKey: "Kaigi",
      subtitleKey: "Wallet-based meeting links",
      navLabelKey: "Kaigi",
      navGroup: "services",
      navOrder: 50,
      icon: "kaigi",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/explore",
    component: ExploreView,
    meta: appRouteMeta({
      titleKey: "Explorer",
      subtitleKey: "Explorer QR and network status",
      navLabelKey: "Explore",
      navGroup: "services",
      navOrder: 20,
      icon: "explore",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
  {
    path: "/offline",
    component: OfflineView,
    meta: appRouteMeta({
      titleKey: "Offline",
      subtitleKey: "Device payments and invoices",
      navLabelKey: "Offline",
      navGroup: "services",
      navOrder: 60,
      icon: "offline",
      requiresAccount: true,
      navPlacement: "primary",
    }),
  },
] as const satisfies readonly RouteRecordRaw[];

export const APP_NAV_ITEMS: readonly AppNavItem[] = appRoutes.map(
  ({ path, meta }) => ({
    to: path,
    ...meta,
  }),
);

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/wallet",
  },
  ...appRoutes,
  {
    path: "/parliament",
    redirect: "/governance",
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
  if (to.meta.requiresAccount === true && !session.hasAccount) {
    return "/account";
  }
  return true;
});

export default router;
