import { reactive } from "vue";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import App from "@/App.vue";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

const route = reactive({
  path: "/account",
  meta: {
    titleKey: "Account Setup",
    subtitleKey: "Provision your TAIRA testnet account",
  },
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
}));

describe("App shell", () => {
  beforeEach(() => {
    route.path = "/account";
    route.meta = {
      titleKey: "Account Setup",
      subtitleKey: "Provision your TAIRA testnet account",
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

  it("shows onboarding as the only sidebar route before an account exists", () => {
    const wrapper = mountApp();
    const labels = wrapper.findAll(".nav-label").map((node) => node.text());

    expect(labels).toEqual(["Account Setup"]);
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
      "Wallet",
      "Send",
      "Receive",
      "Subscriptions",
      "Staking",
      "Parliament",
      "Offline",
      "Explore",
      "Session",
      "Account Setup",
    ]);
    expect(steps[0]).toBe("01");
    expect(steps.at(-1)).toBe("10");
  });
});
