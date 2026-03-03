<template>
  <SakuraScene />
  <div class="app-container">
    <div class="app-ambient app-ambient-left"></div>
    <div class="app-ambient app-ambient-right"></div>
    <header class="app-header">
      <div class="logo-wrapper">
        <span class="logo-badge">
          <img :src="logo" alt="Iroha logo" class="logo" />
        </span>
        <div>
          <p class="app-eyebrow">Iroha Points</p>
          <p class="app-title">Torii control deck</p>
          <p class="app-subtitle">Modern Torii-connected wallet</p>
        </div>
      </div>
      <div class="header-actions">
        <div class="status-chips">
          <div class="status-chip">
            <span class="chip-label">Torii</span>
            <span class="chip-value">{{
              session.connection.toriiUrl ? "Configured" : "Not configured"
            }}</span>
            <span class="chip-sub">{{
              session.connection.toriiUrl || "Add a Torii URL to begin"
            }}</span>
          </div>
          <div class="status-chip">
            <span class="chip-label">Chain</span>
            <span class="chip-value">{{
              session.connection.chainId || "Unknown"
            }}</span>
            <span class="chip-sub">{{
              session.connection.assetDefinitionId || "Asset not set"
            }}</span>
          </div>
        </div>
        <button class="theme-toggle" @click="theme.toggle()">
          <span class="theme-dot" :class="theme.current"></span>
          <span>{{
            theme.current === "dark" ? "Switch to light" : "Switch to dark"
          }}</span>
        </button>
      </div>
    </header>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <p class="nav-title">Navigate</p>
          <span class="nav-pill" :class="{ positive: session.hasAccount }">
            {{ session.hasAccount ? "Account ready" : "Complete onboarding" }}
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
                ? 'Complete account setup first'
                : item.description
            "
            :aria-disabled="item.requiresAccount && !session.hasAccount"
            :tabindex="item.requiresAccount && !session.hasAccount ? -1 : 0"
          >
            <span class="nav-step" aria-hidden="true">{{ item.step }}</span>
            <span class="nav-icon-shell">
              <img :src="item.icon" class="nav-icon" :alt="item.label" />
            </span>
            <span class="nav-copy">
              <span class="nav-label">{{ item.label }}</span>
              <span class="nav-description">{{ item.description }}</span>
            </span>
            <span class="nav-caret" aria-hidden="true">↗</span>
          </RouterLink>
        </nav>
        <p v-if="!session.hasAccount" class="nav-lock-hint">
          Complete account onboarding to unlock Setup, Wallet, Staking, Send,
          Receive, Offline, and Explorer.
        </p>
        <div class="sidebar-meta">
          <AccountSwitcher />
          <div v-if="session.hasAccount" class="session-meta">
            <p class="meta-label">Active account</p>
            <p class="meta-value">
              {{
                session.activeAccount?.displayName ||
                session.activeAccount?.accountId ||
                "Not created yet"
              }}
            </p>
            <p class="helper meta-sub">
              {{
                session.accounts.length
                  ? `${session.accounts.length} saved`
                  : "No accounts saved yet"
              }}
            </p>
          </div>
          <div
            v-if="session.connection.chainId || session.connection.toriiUrl"
            class="session-meta"
          >
            <p class="meta-label">Connection</p>
            <p class="meta-value">
              {{ session.connection.chainId || "Chain unknown" }}
            </p>
            <p class="helper meta-sub">
              {{ session.connection.toriiUrl || "Add a Torii URL to begin" }}
            </p>
          </div>
        </div>
      </aside>
      <section class="workspace">
        <header class="workspace-header">
          <div>
            <p class="section-label">{{ route.meta.subtitle }}</p>
            <h1>{{ route.meta.title }}</h1>
          </div>
          <div class="workspace-meta">
            <span
              class="pill"
              :class="{ positive: !!session.connection.toriiUrl }"
            >
              {{
                session.connection.toriiUrl
                  ? "Torii ready"
                  : "Add Torii endpoint"
              }}
            </span>
            <span class="pill" :class="{ positive: session.hasAccount }">
              {{ session.hasAccount ? "Account saved" : "Onboarding required" }}
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
import { useRoute } from "vue-router";
import { useSessionStore } from "./stores/session";
import { useThemeStore } from "./stores/theme";
import { onMounted, onBeforeUnmount } from "vue";
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
    label: "Account Setup",
    description: "Generate keys, recovery phrase, Connect pairing",
    icon: UserIcon,
    requiresAccount: false,
    step: "01",
  },
  {
    to: "/setup",
    label: "Session",
    description: "Configure Torii, chain, and authority keys",
    icon: UserIcon,
    requiresAccount: true,
    step: "02",
  },
  {
    to: "/wallet",
    label: "Wallet",
    description: "Balances, assets, and latest transactions",
    icon: WalletIcon,
    requiresAccount: true,
    step: "03",
  },
  {
    to: "/staking",
    label: "Staking",
    description: "Nominate validators and stake XOR for NPOS",
    icon: WalletIcon,
    requiresAccount: true,
    step: "04",
  },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    description: "Auto-deduct and manage recurring services",
    icon: WalletIcon,
    requiresAccount: true,
    step: "05",
  },
  {
    to: "/send",
    label: "Send",
    description: "Transfer assets with camera or QR upload",
    icon: SendIcon,
    requiresAccount: true,
    step: "06",
  },
  {
    to: "/receive",
    label: "Receive",
    description: "Share QR codes or IH58 to request funds",
    icon: ReceiveIcon,
    requiresAccount: true,
    step: "07",
  },
  {
    to: "/offline",
    label: "Offline",
    description: "Offline wallets, invoices, and QR exchanges",
    icon: SendIcon,
    requiresAccount: true,
    step: "08",
  },
  {
    to: "/explore",
    label: "Explore",
    description: "Network metrics and asset explorer",
    icon: WalletIcon,
    requiresAccount: true,
    step: "09",
  },
];

const route = useRoute();
const session = useSessionStore();
const theme = useThemeStore();
const logo = IrohaLogo;
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
