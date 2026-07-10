<template>
  <SakuraScene />
  <div class="app-container">
    <a class="skip-link" href="#workspace-main" @click.prevent="focusWorkspace">
      {{ t("Skip to content") }}
    </a>
    <header class="app-header">
      <div class="app-header-drag-region" aria-hidden="true"></div>

      <RouterLink
        :to="brandDestination"
        class="brand-link"
        :aria-label="t('Open wallet')"
      >
        <span class="brand-mark">
          <img :src="IrohaLogo" alt="" class="logo" />
        </span>
        <span class="brand-copy">
          <span class="brand-name">{{ t("Iroha Wallet") }}</span>
          <span class="brand-network">{{ activeNetworkLabel }}</span>
        </span>
      </RouterLink>

      <AppIconButton
        class="mobile-nav-trigger"
        :label="mobileNavOpen ? t('Close navigation') : t('Navigate')"
        aria-controls="app-navigation-drawer"
        :aria-expanded="mobileNavOpen"
        @click="openNavigation"
      >
        <AppIcon :name="mobileNavOpen ? 'close' : 'menu'" />
      </AppIconButton>

      <div class="header-rail">
        <HeaderIrohaConnectButton />

        <label class="network-control">
          <AppIcon name="network" />
          <span class="network-control-label">{{ t("Network") }}</span>
          <select
            class="network-profile-select"
            :value="activeNetworkProfileId"
            :aria-label="t('Network')"
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

        <HeaderPreferences />

        <details ref="utilityMenu" class="utility-menu">
          <summary class="utility-menu-trigger" :aria-label="t('Account')">
            <AppIcon name="account" />
            <span class="utility-menu-account">
              {{ activeAccountLabel || t("Navigate") }}
            </span>
            <AppIcon name="chevron" />
          </summary>
          <div class="utility-menu-panel">
            <AccountSwitcher />
          </div>
        </details>
      </div>
    </header>

    <div class="app-shell">
      <aside
        id="app-navigation"
        class="sidebar desktop-sidebar"
        :aria-hidden="isMobileViewport || undefined"
      >
        <AppNavigation
          :groups="primaryNavGroups"
          :footer-items="footerNavItems"
          :active-path="route.path"
          :active-semantics="!isMobileViewport"
        />
      </aside>

      <section
        class="workspace"
        :class="{ 'kaigi-workspace': route.path.startsWith('/kaigi') }"
      >
        <header class="workspace-header">
          <div class="workspace-heading">
            <p class="section-label">{{ routeSubtitle }}</p>
            <h1 ref="routeHeading" tabindex="-1">{{ routeTitle }}</h1>
          </div>
          <div
            id="route-header-actions"
            class="workspace-actions"
            aria-live="polite"
          ></div>
        </header>
        <main
          id="workspace-main"
          ref="workspaceMain"
          class="workspace-body"
          tabindex="-1"
        >
          <RouterView />
        </main>
      </section>
    </div>
  </div>

  <AppDialog
    :open="mobileNavOpen"
    class="mobile-navigation-dialog"
    variant="drawer"
    :title="t('Navigate')"
    :description="t('Choose a destination')"
    :close-label="t('Close navigation')"
    initial-focus-selector=".nav-link.active, .nav-link"
    @close="closeNavigation"
  >
    <AppNavigation
      id="app-navigation-drawer"
      class="sidebar drawer-navigation"
      :groups="primaryNavGroups"
      :footer-items="footerNavItems"
      :active-path="route.path"
      :active-semantics="isMobileViewport && mobileNavOpen"
      @navigate="closeNavigation"
    />
  </AppDialog>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "./stores/session";
import { useAppI18n } from "@/composables/useAppI18n";
import IrohaLogo from "@/assets/iroha_logo.svg";
import SakuraScene from "@/components/SakuraScene.vue";
import AccountSwitcher from "@/components/AccountSwitcher.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppNavigation from "@/components/AppNavigation.vue";
import HeaderPreferences from "@/components/HeaderPreferences.vue";
import HeaderIrohaConnectButton from "@/components/HeaderIrohaConnectButton.vue";
import { AppDialog, AppIconButton } from "@/components/ui";
import { CHAIN_PRESETS } from "@/constants/chains";
import { APP_NAV_GROUPS, APP_NAV_ITEMS } from "@/router";
import type { AppNavItem } from "@/types/navigation";
import { getAccountDisplayLabel } from "@/utils/accountId";

const CUSTOM_NETWORK_PROFILE_ID = "__custom_network_profile__";

const route = useRoute();
const session = useSessionStore();
const { t } = useAppI18n();
const networkProfileOptions = CHAIN_PRESETS;
const utilityMenu = ref<HTMLDetailsElement | null>(null);
const routeHeading = ref<HTMLHeadingElement | null>(null);
const workspaceMain = ref<HTMLElement | null>(null);
const mobileNavOpen = ref(false);
const isMobileViewport = ref(false);
let mobileViewportQuery: MediaQueryList | null = null;

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
const brandDestination = computed(() =>
  session.hasAccount ? "/wallet" : "/account",
);

const routeTitle = computed(() => t(route.meta.titleKey || "Wallet"));
const routeSubtitle = computed(() =>
  t(route.meta.subtitleKey || "Balance, funding, and activity"),
);

const canShowNavItem = (item: AppNavItem) =>
  !item.requiresAccount || session.hasAccount;

const primaryNavGroups = computed(() =>
  [...APP_NAV_GROUPS]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      items: APP_NAV_ITEMS.filter(
        (item) =>
          item.navPlacement === "primary" &&
          item.navGroup === group.id &&
          canShowNavItem(item),
      ).sort((left, right) => left.navOrder - right.navOrder),
    }))
    .filter((group) => group.items.length > 0),
);

const footerNavItems = computed(() =>
  APP_NAV_ITEMS.filter(
    (item) => item.navPlacement === "footer" && canShowNavItem(item),
  ).sort((left, right) => left.navOrder - right.navOrder),
);

const closeNavigation = () => {
  mobileNavOpen.value = false;
};

const openNavigation = () => {
  mobileNavOpen.value = true;
};

const syncMobileViewport = (event?: MediaQueryListEvent) => {
  const matches = event?.matches ?? mobileViewportQuery?.matches ?? false;
  isMobileViewport.value = matches;
  if (!matches) {
    closeNavigation();
  }
};

const focusWorkspace = () => {
  workspaceMain.value?.focus({ preventScroll: false });
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

onMounted(() => {
  mobileViewportQuery = window.matchMedia("(max-width: 760px)");
  syncMobileViewport();
  mobileViewportQuery.addEventListener("change", syncMobileViewport);
});

onBeforeUnmount(() => {
  mobileViewportQuery?.removeEventListener("change", syncMobileViewport);
});

let previousRoutePath: string | null = null;
watch(
  [() => route.path, routeTitle],
  async ([path, title]) => {
    document.title = `${title} · ${t("Iroha Wallet")}`;
    if (path === previousRoutePath) {
      return;
    }
    previousRoutePath = path;
    closeNavigation();
    if (utilityMenu.value) {
      utilityMenu.value.open = false;
    }
    await nextTick();
    routeHeading.value?.focus({ preventScroll: true });
  },
  { immediate: true, flush: "post" },
);
</script>
