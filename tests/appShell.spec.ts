import { reactive } from "vue";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import App from "@/App.vue";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/stores/session";
import { useLocaleStore } from "@/stores/locale";
import { MINAMOTO_CHAIN_PRESET, TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";

const route = reactive({
  path: "/account",
  meta: {
    titleKey: "Account Setup",
    subtitleKey: "Create and save your TAIRA wallet",
  },
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
}));

const t = (key: string) => translate("en-US", key);

describe("App shell", () => {
  beforeEach(() => {
    localStorage.clear();
    route.path = "/account";
    route.meta = {
      titleKey: "Account Setup",
      subtitleKey: "Create and save your TAIRA wallet",
    };
    setActivePinia(createPinia());
  });

  const mountApp = (options?: { withAccount?: boolean }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
    });
    if (options?.withAccount) {
      session.$patch({
        accounts: [
          {
            displayName: "Alice",
            domain: "wonderland",
            accountId: "alice@wonderland",
            publicKeyHex: "ab".repeat(32),
            privateKeyHex: "cd".repeat(32),
            hasStoredSecret: true,
          },
        ],
        activeAccountId: "alice@wonderland",
      });
    }
    return mount(App, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            props: ["to"],
            template: '<a class="router-link-stub"><slot /></a>',
          },
          RouterView: {
            template: '<div class="router-view-stub" />',
          },
          SakuraScene: true,
          AccountSwitcher: true,
        },
      },
    });
  };

  it("shows onboarding and settings before an account exists", () => {
    const wrapper = mountApp();
    const labels = wrapper.findAll(".nav-label").map((node) => node.text());

    expect(labels).toEqual([t("Account Setup"), t("Settings")]);
  });

  it("keeps the sidebar details open on desktop layouts", () => {
    const wrapper = mountApp({ withAccount: true });
    const sidebarPanel = wrapper.get(".sidebar-panel")
      .element as HTMLDetailsElement;

    expect(sidebarPanel.open).toBe(true);
  });

  it("prioritizes wallet actions in the sidebar once an account exists", () => {
    route.path = "/wallet";
    route.meta = {
      titleKey: "Wallet Overview",
      subtitleKey: "Balances & activity",
    };

    const wrapper = mountApp({ withAccount: true });
    const labels = wrapper.findAll(".nav-label").map((node) => node.text());
    const steps = wrapper.findAll(".nav-step").map((node) => node.text());

    expect(labels).toEqual([
      t("Wallet"),
      t("Stats"),
      t("Send"),
      t("Receive"),
      t("Subscriptions"),
      t("Staking"),
      t("Parliament"),
      t("Explore"),
      t("SoraCloud"),
      t("Offline"),
      t("Kaigi"),
      t("Settings"),
      t("VPN"),
      t("Session"),
      t("Saved Wallets"),
    ]);
    expect(steps[0]).toBe("01");
    expect(steps.at(-1)).toBe("15");
  });

  it("renames the account route to wallets once an account exists", () => {
    route.path = "/account";
    route.meta = {
      titleKey: "Account Setup",
      subtitleKey: "Create and save your TAIRA wallet",
    };

    const wrapper = mountApp({ withAccount: true });

    expect(wrapper.get(".workspace-heading h1").text()).toBe(
      t("Saved Wallets"),
    );
    expect(wrapper.get(".section-label").text()).toBe(
      t("Switch between saved wallets or begin a fresh wallet setup."),
    );
    expect(wrapper.findAll(".nav-label").at(-1)?.text()).toBe(
      t("Saved Wallets"),
    );
  });

  it("shows a visible header locale picker and updates the current language label", async () => {
    const wrapper = mountApp();
    const localeStore = useLocaleStore();
    localeStore.setLocale("en-US");
    await wrapper.vm.$nextTick();

    const localeMenu = wrapper.get(".locale-switcher")
      .element as HTMLDetailsElement;
    localeMenu.open = true;

    expect(wrapper.get(".header-controls").text()).toContain(t("Language"));
    expect(wrapper.get(".locale-switcher-current").text()).toBe("English");
    expect(wrapper.find(".locale-switcher-code").exists()).toBe(false);
    expect(
      wrapper.get('[data-locale="en-US"] .locale-option-label').text(),
    ).toBe("English");
    expect(
      wrapper.get('[data-locale="ja-JP"] .locale-option-label').text(),
    ).toBe("日本語");

    await wrapper.get('[data-locale="ja-JP"]').trigger("click");

    expect(localeStore.current).toBe("ja-JP");
    expect(localeMenu.open).toBe(false);
    expect(wrapper.get(".locale-switcher-current").text()).toBe("日本語");
    expect(wrapper.get(".header-controls").text()).toContain("日本語");
  });

  it("switches the active network profile from the header selector", async () => {
    const wrapper = mountApp();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="network-profile-select"]')
      .setValue(MINAMOTO_CHAIN_PRESET.id);

    expect(session.connection).toEqual(MINAMOTO_CHAIN_PRESET.connection);
    expect(wrapper.get(".mobile-status-toggle-current").text()).toBe(
      MINAMOTO_CHAIN_PRESET.label,
    );
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection,
    ).toEqual(MINAMOTO_CHAIN_PRESET.connection);
  });
});
