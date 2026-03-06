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
          <p class="app-title">{{ t("Torii control deck") }}</p>
          <p class="app-subtitle">{{ t("Modern Torii-connected wallet") }}</p>
        </div>
      </div>
      <div class="header-actions">
        <div class="status-chips">
          <div class="status-chip">
            <span class="chip-label">{{ t("Torii") }}</span>
            <span class="chip-value">{{ t("TAIRA locked") }}</span>
            <span class="chip-sub">{{ session.connection.toriiUrl }}</span>
          </div>
          <div class="status-chip">
            <span class="chip-label">{{ t("Chain") }}</span>
            <span class="chip-value">{{ session.connection.chainId }}</span>
            <span class="chip-sub">{{
              session.connection.assetDefinitionId || t("Asset not set")
            }}</span>
          </div>
        </div>
        <label class="locale-switcher">
          <span>{{ t("Language") }}</span>
          <select v-model="activeLocale">
            <option
              v-for="option in localeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <button class="theme-toggle" @click="theme.toggle()">
          <span class="theme-dot" :class="theme.current"></span>
          <span>{{
            theme.current === "dark"
              ? t("Switch to light")
              : t("Switch to dark")
          }}</span>
        </button>
      </div>
    </header>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <p class="nav-title">{{ t("Navigate") }}</p>
          <span class="nav-pill" :class="{ positive: session.hasAccount }">
            {{
              session.hasAccount ? t("Account ready") : t("Complete onboarding")
            }}
          </span>
        </div>
        <nav>
          <RouterLink
            v-for="item in navItems"
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
              <img :src="item.icon" class="nav-icon" :alt="t(item.labelKey)" />
            </span>
            <span class="nav-copy">
              <span class="nav-label">{{ t(item.labelKey) }}</span>
              <span class="nav-description">{{ t(item.descriptionKey) }}</span>
            </span>
            <span class="nav-caret" aria-hidden="true">↗</span>
          </RouterLink>
        </nav>
        <p v-if="!session.hasAccount" class="nav-lock-hint">
          {{
            t(
              "Complete account onboarding to unlock Setup, Wallet, Staking, Parliament, Send, Receive, Offline, and Explorer.",
            )
          }}
        </p>
        <div class="sidebar-meta">
          <AccountSwitcher />
          <div v-if="session.hasAccount" class="session-meta">
            <p class="meta-label">{{ t("Active account") }}</p>
            <p class="meta-value">
              {{
                session.activeAccount?.displayName ||
                session.activeAccount?.accountId ||
                t("Not created yet")
              }}
            </p>
            <p class="helper meta-sub">
              {{
                session.accounts.length
                  ? t("{count} saved", { count: session.accounts.length })
                  : t("No accounts saved yet")
              }}
            </p>
          </div>
          <div class="session-meta">
            <p class="meta-label">{{ t("Connection") }}</p>
            <p class="meta-value">{{ session.connection.chainId }}</p>
            <p class="helper meta-sub">{{ session.connection.toriiUrl }}</p>
          </div>
        </div>
      </aside>
      <section class="workspace">
        <header class="workspace-header">
          <div>
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
              {{
                session.hasAccount
                  ? t("Account saved")
                  : t("Onboarding required")
              }}
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
import { computed, onMounted, onBeforeUnmount } from "vue";
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

const navItems = [
  {
    to: "/account",
    labelKey: "Account Setup",
    descriptionKey: "Generate keys, recovery phrase, Connect pairing",
    icon: UserIcon,
    requiresAccount: false,
    step: "01",
  },
  {
    to: "/setup",
    labelKey: "Session",
    descriptionKey: "TAIRA connection, asset, and authority keys",
    icon: UserIcon,
    requiresAccount: true,
    step: "02",
  },
  {
    to: "/wallet",
    labelKey: "Wallet",
    descriptionKey: "Balances, assets, and latest transactions",
    icon: WalletIcon,
    requiresAccount: true,
    step: "03",
  },
  {
    to: "/staking",
    labelKey: "Staking",
    descriptionKey: "Nominate validators and stake XOR for NPOS",
    icon: WalletIcon,
    requiresAccount: true,
    step: "04",
  },
  {
    to: "/parliament",
    labelKey: "Parliament",
    descriptionKey: "Bond citizenship and vote in governance referenda",
    icon: WalletIcon,
    requiresAccount: true,
    step: "05",
  },
  {
    to: "/subscriptions",
    labelKey: "Subscriptions",
    descriptionKey: "Auto-deduct and manage recurring services",
    icon: WalletIcon,
    requiresAccount: true,
    step: "06",
  },
  {
    to: "/send",
    labelKey: "Send",
    descriptionKey: "Transfer assets with camera or QR upload",
    icon: SendIcon,
    requiresAccount: true,
    step: "07",
  },
  {
    to: "/receive",
    labelKey: "Receive",
    descriptionKey: "Share QR codes or IH58 to request funds",
    icon: ReceiveIcon,
    requiresAccount: true,
    step: "08",
  },
  {
    to: "/offline",
    labelKey: "Offline",
    descriptionKey: "Offline wallets, invoices, and QR exchanges",
    icon: SendIcon,
    requiresAccount: true,
    step: "09",
  },
  {
    to: "/explore",
    labelKey: "Explore",
    descriptionKey: "Network metrics and asset explorer",
    icon: WalletIcon,
    requiresAccount: true,
    step: "10",
  },
];

const route = useRoute();
const session = useSessionStore();
const theme = useThemeStore();
const { localeStore, localeOptions, t } = useAppI18n();
const logo = IrohaLogo;

const activeLocale = computed({
  get: () => localeStore.current,
  set: (value: SupportedLocale) => localeStore.setLocale(value),
});

const routeTitle = computed(() =>
  t((route.meta.titleKey as string) || "Wallet Overview"),
);
const routeSubtitle = computed(() =>
  t((route.meta.subtitleKey as string) || "Balances & activity"),
);

const updateParallax = (event: PointerEvent) => {
  const x = (event.clientX / window.innerWidth - 0.5).toFixed(3);
  const y = (event.clientY / window.innerHeight - 0.5).toFixed(3);
  document.documentElement.style.setProperty("--parallax-x", x);
  document.documentElement.style.setProperty("--parallax-y", y);
};

onMounted(() => {
  window.addEventListener("pointermove", updateParallax, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", updateParallax);
});
</script>
