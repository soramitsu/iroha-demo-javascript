<template>
  <SakuraScene />
  <div class="app-container">
    <div class="app-ambient app-ambient-left"></div>
    <div class="app-ambient app-ambient-right"></div>
    <header class="app-header">
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
        <details class="status-panel">
          <summary class="mobile-status-toggle">
            <span class="mobile-status-toggle-copy">
              <span class="mobile-status-toggle-label">{{ t("Torii") }}</span>
              <span class="mobile-status-toggle-current">{{
                session.connection.toriiUrl
              }}</span>
            </span>
            <span class="mobile-status-toggle-meta">{{
              session.connection.assetDefinitionId || t("Asset not set")
            }}</span>
            <span class="mobile-status-toggle-caret" aria-hidden="true"
              >↗</span
            >
          </summary>
          <div class="status-chips">
            <div class="status-chip">
              <span class="chip-label">{{ t("Torii") }}</span>
              <span class="chip-value">{{ t("TAIRA locked") }}</span>
              <span class="chip-sub">{{ session.connection.toriiUrl }}</span>
            </div>
            <div class="status-chip">
              <span class="chip-label">{{ t("Chain") }}</span>
              <span class="chip-value mono chain-value">{{
                session.connection.chainId
              }}</span>
              <span class="chip-sub">{{
                session.connection.assetDefinitionId || t("Asset not set")
              }}</span>
            </div>
          </div>
        </details>
        <details class="settings-panel">
          <summary class="settings-toggle">
            <span class="theme-dot" :class="theme.current"></span>
            <span class="settings-toggle-copy">
              <span class="settings-toggle-label">{{ t("Language") }}</span>
              <span class="settings-toggle-current">
                {{ activeLocale }} ·
                {{
                  theme.current === "dark"
                    ? t("Switch to light")
                    : t("Switch to dark")
                }}
              </span>
            </span>
            <span class="settings-toggle-caret" aria-hidden="true">↗</span>
          </summary>
          <div class="header-controls">
            <details ref="localeMenu" class="locale-switcher">
              <summary class="locale-switcher-summary">
                <span class="locale-switcher-glyph" aria-hidden="true">Aa</span>
                <span class="locale-switcher-copy">
                  <span class="locale-switcher-label">{{ t("Language") }}</span>
                  <span class="locale-switcher-current">{{
                    activeLocaleLabel
                  }}</span>
                </span>
                <span class="locale-switcher-code mono">{{
                  activeLocale
                }}</span>
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
                    <span class="locale-option-meta mono">{{
                      option.value
                    }}</span>
                  </span>
                  <span class="locale-option-check" aria-hidden="true">●</span>
                </button>
              </div>
            </details>
            <button class="theme-toggle" @click="theme.toggle()">
              <span class="theme-dot" :class="theme.current"></span>
              <span>{{
                theme.current === "dark"
                  ? t("Switch to light")
                  : t("Switch to dark")
              }}</span>
            </button>
          </div>
        </details>
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
          <nav>
            <RouterLink
              v-for="item in sidebarNavItems"
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
                  ? t("TAIRA Torii ready")
                  : t("Torii unavailable")
              }}
            </span>
            <span class="pill" :class="{ positive: session.hasAccount }">
              {{ session.hasAccount ? t("Account saved") : t("Account Setup") }}
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
import { getAccountDisplayLabel } from "@/utils/accountId";

const navItems = [
  {
    to: "/account",
    labelKey: "Account Setup",
    descriptionKey: "Generate keys, recovery phrase, Connect pairing",
    icon: UserIcon,
    requiresAccount: false,
  },
  {
    to: "/wallet",
    labelKey: "Wallet",
    descriptionKey: "Balances, assets, and latest transactions",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/vpn",
    labelKey: "VPN",
    descriptionKey: "Connect, disconnect, and inspect Sora VPN sessions",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/send",
    labelKey: "Send",
    descriptionKey: "Transfer assets with camera or QR upload",
    icon: SendIcon,
    requiresAccount: true,
  },
  {
    to: "/receive",
    labelKey: "Receive",
    descriptionKey: "Share QR codes or account IDs to request funds",
    icon: ReceiveIcon,
    requiresAccount: true,
  },
  {
    to: "/kaigi",
    labelKey: "Kaigi",
    descriptionKey: "Manual audio/video calls with another wallet user",
    icon: ReceiveIcon,
    requiresAccount: true,
  },
  {
    to: "/subscriptions",
    labelKey: "Subscriptions",
    descriptionKey: "Auto-deduct and manage recurring services",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/staking",
    labelKey: "Staking",
    descriptionKey: "Nominate validators and stake XOR for NPOS",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/parliament",
    labelKey: "Parliament",
    descriptionKey: "Bond citizenship and vote in governance referenda",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/offline",
    labelKey: "Offline",
    descriptionKey: "Offline wallets, invoices, and QR exchanges",
    icon: SendIcon,
    requiresAccount: true,
  },
  {
    to: "/explore",
    labelKey: "Explore",
    descriptionKey: "Network metrics and asset explorer",
    icon: WalletIcon,
    requiresAccount: true,
  },
  {
    to: "/setup",
    labelKey: "Session",
    descriptionKey: "TAIRA connection, asset, and authority keys",
    icon: UserIcon,
    requiresAccount: true,
  },
];

const route = useRoute();
const session = useSessionStore();
const theme = useThemeStore();
const { localeStore, localeOptions, t } = useAppI18n();
const activeAccountLabel = computed(() =>
  getAccountDisplayLabel(session.activeAccount),
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

const routeTitle = computed(() =>
  t((route.meta.titleKey as string) || "Wallet Overview"),
);
const routeSubtitle = computed(() =>
  t((route.meta.subtitleKey as string) || "Balances & activity"),
);
const onboardingNavItem =
  navItems.find((item) => !item.requiresAccount) ?? null;
const signedInNavItems = navItems.filter((item) => item.requiresAccount);
const sidebarNavItems = computed(() => {
  const orderedItems =
    session.hasAccount && onboardingNavItem
      ? [...signedInNavItems, onboardingNavItem]
      : onboardingNavItem
        ? [onboardingNavItem]
        : [];
  return orderedItems.map((item, index) => ({
    ...item,
    step: String(index + 1).padStart(2, "0"),
  }));
});

const syncSidebarLayout = (compact: boolean) => {
  isCompactLayout.value = compact;
  if (!compact) {
    sidebarPanelOpen.value = false;
    return;
  }
  sidebarPanelOpen.value = sidebarPanel.value?.open ?? false;
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
