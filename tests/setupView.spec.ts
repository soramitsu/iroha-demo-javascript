import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SetupView from "@/views/SetupView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const generateKeyPairMock = vi.fn();
const pingToriiMock = vi.fn();
const registerAccountMock = vi.fn();

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

vi.mock("@/services/iroha", () => ({
  deriveAccountAddress: (input: unknown) => deriveAccountAddressMock(input),
  derivePublicKey: (privateKeyHex: string) =>
    derivePublicKeyMock(privateKeyHex),
  generateKeyPair: () => generateKeyPairMock(),
  pingTorii: (toriiUrl: string) => pingToriiMock(toriiUrl),
  registerAccount: (input: unknown) => registerAccountMock(input),
}));

describe("SetupView", () => {
  beforeEach(() => {
    deriveAccountAddressMock.mockReset();
    derivePublicKeyMock.mockReset();
    generateKeyPairMock.mockReset();
    pingToriiMock.mockReset();
    registerAccountMock.mockReset();

    deriveAccountAddressMock.mockReturnValue({
      accountId:
        "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
      i105AccountId:
        "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
      i105DefaultAccountId:
        "sorauロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
      publicKeyHex: "ab".repeat(32),
      accountIdWarning: "",
    });
    derivePublicKeyMock.mockReturnValue({
      publicKeyHex: "ab".repeat(32),
    });
    generateKeyPairMock.mockResolvedValue({
      privateKeyHex: "11".repeat(32),
      publicKeyHex: "ab".repeat(32),
    });
    pingToriiMock.mockResolvedValue({ status: "ok" });
    registerAccountMock.mockResolvedValue({ hash: "0xabc" });

    setActivePinia(createPinia());
  });

  const mountView = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
    });
    return mount(SetupView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const getButtonByText = (
    wrapper: ReturnType<typeof mount>,
    label: string,
  ) => {
    const button = wrapper
      .findAll("button")
      .find((node) => node.text() === label);
    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }
    return button;
  };

  it("hides authority-only registration behind the advanced toggle", async () => {
    const wrapper = mountView();

    expect(wrapper.text()).not.toContain(t("Create on-chain account"));
    expect(
      wrapper.text(),
      "default screen should not show the authority-only explanation",
    ).not.toContain(t("Requires authority credentials to create the account on-chain."));

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(t("Create on-chain account"));
    expect(wrapper.text()).toContain(
      t("Requires authority credentials to create the account on-chain."),
    );

    await getButtonByText(wrapper, t("Hide advanced")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain(t("Create on-chain account"));
  });
});
