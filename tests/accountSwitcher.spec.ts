import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { AccountAddress } from "@iroha/iroha-js/address";
import AccountSwitcher from "@/components/AccountSwitcher.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";

const ALICE_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const BOB_PUBLIC_KEY_HEX =
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0";
const accountIdFor = (publicKeyHex: string) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from(
      publicKeyHex.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)),
    ),
  }).toI105(369);
const ALICE_ACCOUNT_ID = accountIdFor(ALICE_PUBLIC_KEY_HEX);
const BOB_ACCOUNT_ID = accountIdFor(BOB_PUBLIC_KEY_HEX);

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
          domain: "default",
          accountId: ALICE_ACCOUNT_ID,
          publicKeyHex: ALICE_PUBLIC_KEY_HEX,
          signingAlgorithm: "ed25519",
          hasStoredSecret: true,
          localOnly: false,
        },
        {
          displayName: "Bob",
          domain: "default",
          accountId: BOB_ACCOUNT_ID,
          publicKeyHex: BOB_PUBLIC_KEY_HEX,
          signingAlgorithm: "ed25519",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: ALICE_ACCOUNT_ID,
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
    await selector.setValue(BOB_ACCOUNT_ID);

    expect(setSpy).toHaveBeenCalledWith(BOB_ACCOUNT_ID);
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
