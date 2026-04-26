<template>
  <SakuraScene />
  <div class="app-container">
    <div class="app-ambient app-ambient-left"></div>
    <div class="app-ambient app-ambient-right"></div>
    <header class="app-header">
      <div class="app-header-drag-region" aria-hidden="true"></div>
      <div class="logo-wrapper">
        <span class="logo-badge">
          <img :src="logo" :alt="t('Iroha logo')" class="logo" />
        </span>
        <div>
          <p class="app-eyebrow">{{ t("Iroha Points") }}</p>
          <p class="app-title">{{ t("Iroha Wallet") }}</p>
          <p class="app-subtitle">{{ t("Modern Torii-connected wallet") }}</p>
        </div>
      </div>
      <div class="header-rail">
        <div class="header-quick-actions" :aria-label="t('Quick actions')">
          <a
            v-if="session.hasAccount"
            class="header-action primary"
            href="#/wallet"
          >
            {{ t("Open wallet") }}
          </a>
          <a v-if="session.hasAccount" class="header-action" href="#/receive">
            {{ t("Receive") }}
          </a>
          <a v-if="session.hasAccount" class="header-action" href="#/send">
            {{ t("Send") }}
          </a>
          <a v-else class="header-action primary" href="#/account">
            {{ t("Start setup") }}
          </a>
        </div>
        <details class="status-panel network-details">
          <summary class="mobile-status-toggle">
            <span class="mobile-status-toggle-copy">
              <span class="mobile-status-toggle-label">{{
                t("Network details")
              }}</span>
              <span class="mobile-status-toggle-current">{{
                activeNetworkLabel
              }}</span>
            </span>
            <span class="mobile-status-toggle-meta">{{
              activeAssetLabel
            }}</span>
            <span class="mobile-status-toggle-caret" aria-hidden="true"
              >↗</span
            >
          </summary>
          <label class="network-profile-control">
            <span class="chip-label">{{ t("Network") }}</span>
            <select
              :value="activeNetworkProfileId"
              data-testid="network-profile-select"
              @change="handleNetworkProfileChange"
            >
              <option
                v-if="!activeNetworkPreset"
                :value="CUSTOM_NETWORK_PROFILE_ID"
              >
                {{ t("Custom endpoint") }}
              </option>
              <option
                v-for="preset in networkProfileOptions"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.label }}
              </option>
            </select>
          </label>
          <div class="status-chips">
            <div class="status-chip">
              <span class="chip-label">{{ t("Torii") }}</span>
              <span class="chip-value">{{ activeNetworkLabel }}</span>
              <span class="chip-sub">{{ session.connection.toriiUrl }}</span>
            </div>
            <div class="status-chip">
              <span class="chip-label">{{ t("Chain ID") }}</span>
              <span class="chip-value mono chain-value">{{
                session.connection.chainId
              }}</span>
              <span class="chip-sub">{{
                t("Managed by network profile")
              }}</span>
            </div>
            <div class="status-chip">
              <span class="chip-label">{{ t("Asset") }}</span>
              <span class="chip-value">{{ activeAssetLabel }}</span>
              <span class="chip-sub">{{
                t("Used for balances and payments")
              }}</span>
            </div>
            <div class="status-chip">
              <span class="chip-label">{{ t("Network prefix") }}</span>
              <span class="chip-value mono">{{
                session.connection.networkPrefix
              }}</span>
              <span class="chip-sub">{{ t("Advanced routing detail") }}</span>
            </div>
          </div>
        </details>
        <div class="header-controls">
          <details
            ref="localeMenu"
            class="locale-switcher locale-switcher-prominent"
          >
            <summary class="locale-switcher-summary">
              <span class="locale-switcher-glyph" aria-hidden="true">Aa</span>
              <span class="locale-switcher-copy">
                <span class="locale-switcher-label">{{ t("Language") }}</span>
                <span class="locale-switcher-current">{{
                  activeLocaleLabel
                }}</span>
              </span>
              <span class="locale-switcher-caret" aria-hidden="true">↗</span>
            </summary>
            <div class="locale-switcher-menu" :aria-label="t('Language')">
              <button
                v-for="option in localeOptions"
                :key="option.value"
                :data-locale="option.value"
                type="button"
                class="locale-option"
                :class="{ active: option.value === activeLocale }"
                :aria-pressed="option.value === activeLocale"
                @click="selectLocale(option.value)"
              >
                <span class="locale-option-copy">
                  <span class="locale-option-label">{{ option.label }}</span>
                </span>
                <span class="locale-option-check" aria-hidden="true">●</span>
              </button>
            </div>
          </details>
          <button class="theme-toggle" type="button" @click="theme.toggle()">
            <span class="theme-dot" :class="theme.current"></span>
            <span>{{
              theme.current === "dark"
                ? t("Switch to light")
                : t("Switch to dark")
            }}</span>
          </button>
        </div>
      </div>
    </header>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <p class="nav-title">{{ t("Navigate") }}</p>
          <span class="nav-pill" :class="{ positive: session.hasAccount }">
            {{ session.hasAccount ? t("Account ready") : t("Account Setup") }}
          </span>
        </div>
        <details
          ref="sidebarPanel"
          class="sidebar-panel"
          :open="!isCompactLayout || sidebarPanelOpen"
          @toggle="handleSidebarToggle"
        >
          <summary class="mobile-nav-toggle">
            <span class="mobile-nav-toggle-copy">
              <span class="mobile-nav-toggle-label">{{ t("Navigate") }}</span>
              <span class="mobile-nav-toggle-current">{{ routeTitle }}</span>
            </span>
            <span class="mobile-nav-toggle-caret" aria-hidden="true">↗</span>
          </summary>
          <nav class="nav-groups">
            <div
              v-for="group in sidebarNavGroups"
              :key="group.labelKey"
              class="nav-group"
            >
              <p v-if="group.labelKey" class="nav-group-label">
                {{ t(group.labelKey) }}
              </p>
              <RouterLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="nav-link"
                :class="{
                  active: route.path.startsWith(item.to),
                  locked: item.requiresAccount && !session.hasAccount,
                }"
                :title="
                  item.requiresAccount && !session.hasAccount
                    ? t('Complete account setup first')
                    : t(item.descriptionKey)
                "
                :aria-disabled="item.requiresAccount && !session.hasAccount"
                :tabindex="item.requiresAccount && !session.hasAccount ? -1 : 0"
              >
                <span class="nav-step" aria-hidden="true">{{ item.step }}</span>
                <span class="nav-icon-shell">
                  <img
                    :src="item.icon"
                    class="nav-icon"
                    :alt="t(item.labelKey)"
                  />
                </span>
                <span class="nav-copy">
                  <span class="nav-label">{{ t(item.labelKey) }}</span>
                  <span class="nav-description">{{
                    t(item.descriptionKey)
                  }}</span>
                </span>
                <span class="nav-caret" aria-hidden="true">↗</span>
              </RouterLink>
            </div>
          </nav>
          <div v-if="session.hasAccount" class="sidebar-meta">
            <AccountSwitcher v-if="session.accounts.length" />
            <div class="session-meta">
              <p class="meta-label">{{ t("Connection") }}</p>
              <p class="meta-value">{{ session.connection.chainId }}</p>
              <p class="helper meta-sub">{{ session.connection.toriiUrl }}</p>
            </div>
          </div>
        </details>
      </aside>
      <section class="workspace">
        <header class="workspace-header">
          <div class="workspace-heading">
            <p class="section-label">{{ routeSubtitle }}</p>
            <h1>{{ routeTitle }}</h1>
          </div>
          <div class="workspace-meta">
            <span
              class="pill"
              :class="{ positive: !!session.connection.toriiUrl }"
            >
              {{
                session.connection.toriiUrl
                  ? t("Network ready")
                  : t("Network unavailable")
              }}
            </span>
            <span class="pill" :class="{ positive: session.hasAccount }">
              {{ session.hasAccount ? t("Wallet saved") : t("No wallet yet") }}
            </span>
            <span v-if="activeAccountLabel" class="pill workspace-account">
              {{ activeAccountLabel }}
            </span>
          </div>
        </header>
        <main class="workspace-body">
          <RouterView />
        </main>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "./stores/session";
import { useThemeStore } from "./stores/theme";
import { useAppI18n } from "@/composables/useAppI18n";
import type { SupportedLocale } from "@/i18n/messages";
import IrohaLogo from "@/assets/iroha_logo.svg";
import WalletIcon from "@/assets/wallet.svg";
import SendIcon from "@/assets/send.svg";
import ReceiveIcon from "@/assets/receive.svg";
import UserIcon from "@/assets/user.svg";
import SakuraScene from "@/components/SakuraScene.vue";
import AccountSwitcher from "@/components/AccountSwitcher.vue";
import { CHAIN_PRESETS } from "@/constants/chains";
import { getAccountDisplayLabel } from "@/utils/accountId";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const CUSTOM_NETWORK_PROFILE_ID = "__custom_network_profile__";

const navItems = [
  {
    to: "/account",
    labelKey: "Account Setup",
    descriptionKey: "Create or restore a wallet",
    signedInLabelKey: "Saved Wallets",
    signedInDescriptionKey: "Switch wallets or create a new one.",
    icon: UserIcon,
    requiresAccount: false,
    utility: true,
    groupKey: "Advanced",
  },
  {
    to: "/settings",
    labelKey: "Settings",
    descriptionKey: "Endpoint and app preferences",
    icon: UserIcon,
    requiresAccount: false,
    utility: true,
    groupKey: "Tools",
  },
  {
    to: "/wallet",
    labelKey: "Wallet",
    descriptionKey: "Balance, funding, and activity",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Wallet",
  },
  {
    to: "/stats",
    labelKey: "Stats",
    descriptionKey:
      "XOR supply, holder concentration, and live chain telemetry",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Wallet",
  },
  {
    to: "/send",
    labelKey: "Send",
    descriptionKey: "Pay with a QR or account",
    icon: SendIcon,
    requiresAccount: true,
    groupKey: "Payments",
  },
  {
    to: "/receive",
    labelKey: "Receive",
    descriptionKey: "Show a payment QR",
    icon: ReceiveIcon,
    requiresAccount: true,
    groupKey: "Payments",
  },
  {
    to: "/staking",
    labelKey: "Staking",
    descriptionKey: "Stake XOR with a validator",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Earn & Vote",
  },
  {
    to: "/parliament",
    labelKey: "Parliament",
    descriptionKey: "Register and vote",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Earn & Vote",
  },
  {
    to: "/explore",
    labelKey: "Explore",
    descriptionKey: "Explorer QR and network status",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Tools",
  },
  {
    to: "/soracloud",
    labelKey: "SoraCloud",
    descriptionKey: "Launch live SoraCloud services",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Tools",
  },
  {
    to: "/subscriptions",
    labelKey: "Subscriptions",
    descriptionKey: "Manage recurring payments",
    icon: WalletIcon,
    requiresAccount: true,
    groupKey: "Payments",
  },
  {
    to: "/offline",
    labelKey: "Offline",
    descriptionKey: "Device payments and invoices",
    icon: SendIcon,
    requiresAccount: true,
    groupKey: "Tools",
  },
  {
    to: "/kaigi",
    labelKey: "Kaigi",
    descriptionKey: "Wallet-based meeting links",
    icon: ReceiveIcon,
    requiresAccount: true,
    groupKey: "Tools",
  },
  {
    to: "/vpn",
    labelKey: "VPN",
    descriptionKey: "Private network connection",
    icon: WalletIcon,
    requiresAccount: true,
    utility: true,
    groupKey: "Tools",
  },
  {
    to: "/setup",
    labelKey: "Session",
    descriptionKey: "Network and developer settings",
    icon: UserIcon,
    requiresAccount: true,
    utility: true,
    groupKey: "Advanced",
  },
];

const route = useRoute();
const session = useSessionStore();
const theme = useThemeStore();
const { localeStore, localeOptions, t } = useAppI18n();
const networkProfileOptions = CHAIN_PRESETS;
const activeAssetLabel = computed(() =>
  formatAssetDefinitionLabel(
    session.connection.assetDefinitionId,
    t("Asset not set"),
  ),
);
const activeNetworkPreset = computed(() =>
  CHAIN_PRESETS.find(
    (preset) =>
      preset.connection.toriiUrl === session.connection.toriiUrl &&
      preset.connection.chainId === session.connection.chainId &&
      preset.connection.networkPrefix === session.connection.networkPrefix,
  ),
);
const activeNetworkProfileId = computed(
  () => activeNetworkPreset.value?.id ?? CUSTOM_NETWORK_PROFILE_ID,
);
const activeNetworkLabel = computed(() => {
  if (activeNetworkPreset.value) {
    return activeNetworkPreset.value.label;
  }
  return session.connection.toriiUrl ? t("Custom endpoint") : t("Offline");
});
const activeAccountLabel = computed(() =>
  getAccountDisplayLabel(
    session.activeAccount,
    "",
    session.connection.networkPrefix,
  ),
);
const logo = IrohaLogo;
const localeMenu = ref<HTMLDetailsElement | null>(null);
const sidebarPanel = ref<HTMLDetailsElement | null>(null);
const isCompactLayout = ref(false);
const sidebarPanelOpen = ref(false);
let sidebarLayoutMediaQuery: MediaQueryList | null = null;

const activeLocale = computed({
  get: () => localeStore.current,
  set: (value: SupportedLocale) => localeStore.setLocale(value),
});
const activeLocaleLabel = computed(
  () =>
    localeOptions.value.find((option) => option.value === activeLocale.value)
      ?.label ?? activeLocale.value,
);
const selectLocale = (locale: SupportedLocale) => {
  activeLocale.value = locale;
  if (localeMenu.value) {
    localeMenu.value.open = false;
  }
};
const selectNetworkProfile = (profileId: string) => {
  const preset = CHAIN_PRESETS.find((item) => item.id === profileId);
  if (!preset) {
    return;
  }
  session.useChainProfile({ ...preset.connection });
  session.persistState();
};
const handleNetworkProfileChange = (event: Event) => {
  selectNetworkProfile((event.target as HTMLSelectElement).value);
};

const routeTitle = computed(() => {
  if (route.path === "/account" && session.hasAccount) {
    return t("Saved Wallets");
  }
  return t((route.meta.titleKey as string) || "Wallet Overview");
});
const routeSubtitle = computed(() => {
  if (route.path === "/account" && session.hasAccount) {
    return t("Switch between saved wallets or begin a fresh wallet setup.");
  }
  return t((route.meta.subtitleKey as string) || "Balances & activity");
});
const publicNavItems = navItems.filter((item) => !item.requiresAccount);
const signedInNavItems = navItems.filter((item) => item.requiresAccount);
const navGroupOrder = [
  "Wallet",
  "Payments",
  "Earn & Vote",
  "Tools",
  "Advanced",
];
const sidebarNavItems = computed(() => {
  if (!publicNavItems.length) {
    return [];
  }

  if (!session.hasAccount) {
    return publicNavItems.map((item, index) => ({
      ...item,
      step: String(index + 1).padStart(2, "0"),
    }));
  }

  const primaryItems = signedInNavItems.filter((item) => !item.utility);
  const publicUtilityItems = publicNavItems.filter(
    (item) => item.to !== "/account",
  );
  const utilityItems = [
    ...publicUtilityItems,
    ...signedInNavItems.filter((item) => item.utility),
    ...publicNavItems.filter((item) => item.to === "/account"),
  ];
  const orderedItems = [...primaryItems, ...utilityItems].map((item) => ({
    ...item,
    labelKey:
      !item.requiresAccount && item.signedInLabelKey
        ? item.signedInLabelKey
        : item.labelKey,
    descriptionKey:
      !item.requiresAccount && item.signedInDescriptionKey
        ? item.signedInDescriptionKey
        : item.descriptionKey,
  }));

  return orderedItems.map((item, index) => ({
    ...item,
    step: String(index + 1).padStart(2, "0"),
  }));
});
const sidebarNavGroups = computed(() => {
  const items = sidebarNavItems.value;
  if (!session.hasAccount) {
    return [{ labelKey: "", items }];
  }

  return navGroupOrder
    .map((labelKey) => ({
      labelKey,
      items: items.filter((item) => item.groupKey === labelKey),
    }))
    .filter((group) => group.items.length > 0);
});

const syncSidebarLayout = (compact: boolean) => {
  isCompactLayout.value = compact;
  sidebarPanelOpen.value = false;
};

const handleSidebarToggle = (event: Event) => {
  if (!isCompactLayout.value) {
    return;
  }
  sidebarPanelOpen.value = (event.currentTarget as HTMLDetailsElement).open;
};

const handleSidebarLayoutChange = (event: MediaQueryListEvent) => {
  syncSidebarLayout(event.matches);
};

const updateParallax = (event: PointerEvent) => {
  const x = (event.clientX / window.innerWidth - 0.5).toFixed(3);
  const y = (event.clientY / window.innerHeight - 0.5).toFixed(3);
  document.documentElement.style.setProperty("--parallax-x", x);
  document.documentElement.style.setProperty("--parallax-y", y);
};

onMounted(() => {
  window.addEventListener("pointermove", updateParallax, { passive: true });
  if (typeof window.matchMedia !== "function") {
    syncSidebarLayout(false);
    return;
  }
  sidebarLayoutMediaQuery = window.matchMedia("(max-width: 960px)");
  syncSidebarLayout(sidebarLayoutMediaQuery.matches);
  if (typeof sidebarLayoutMediaQuery.addEventListener === "function") {
    sidebarLayoutMediaQuery.addEventListener(
      "change",
      handleSidebarLayoutChange,
    );
    return;
  }
  sidebarLayoutMediaQuery.addListener(handleSidebarLayoutChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", updateParallax);
  if (!sidebarLayoutMediaQuery) {
    return;
  }
  if (typeof sidebarLayoutMediaQuery.removeEventListener === "function") {
    sidebarLayoutMediaQuery.removeEventListener(
      "change",
      handleSidebarLayoutChange,
    );
    return;
  }
  sidebarLayoutMediaQuery.removeListener(handleSidebarLayoutChange);
});
</script>
