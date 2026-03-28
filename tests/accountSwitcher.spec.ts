import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AccountSwitcher from "@/components/AccountSwitcher.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const t = (key: string) => translate("en-US", key);

describe("AccountSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("renders accounts and switches the active account", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useSessionStore();
    store.$patch({
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "pub1",
          privateKeyHex: "priv1",
        },
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "pub2",
          privateKeyHex: "priv2",
        },
      ],
      activeAccountId: "alice@wonderland",
    });
    const setSpy = vi.spyOn(store, "setActiveAccount");
    const persistSpy = vi.spyOn(store, "persistState");

    const wrapper = mount(AccountSwitcher, {
      global: {
        plugins: [pinia],
      },
    });

    expect(wrapper.text()).toContain(t("Active account"));
    const selector = wrapper.get("select");
    await selector.setValue("bob@wonderland");

    expect(setSpy).toHaveBeenCalledWith("bob@wonderland");
    expect(persistSpy).toHaveBeenCalled();
  });

  it("shows empty state when no accounts exist", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(AccountSwitcher, {
      global: {
        plugins: [pinia],
      },
    });

    expect(wrapper.text()).toContain(
      t("No saved accounts yet. Start the registration flow to add one."),
    );
    expect(wrapper.text()).toContain(t("Start registration"));
  });
});
