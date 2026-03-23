import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AccountSetupView from "@/views/AccountSetupView.vue";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

const createConnectPreviewMock = vi.fn();
const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const onboardAccountMock = vi.fn();
const routerPushMock = vi.fn();
const qrToDataUrlMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (payload: string) => qrToDataUrlMock(payload),
  },
}));

vi.mock("@/services/iroha", () => ({
  createConnectPreview: (input: unknown) => createConnectPreviewMock(input),
  deriveAccountAddress: (input: unknown) => deriveAccountAddressMock(input),
  derivePublicKey: (privateKeyHex: string) =>
    derivePublicKeyMock(privateKeyHex),
  onboardAccount: (input: unknown) => onboardAccountMock(input),
}));

describe("AccountSetupView", () => {
  beforeEach(() => {
    createConnectPreviewMock.mockReset();
    deriveAccountAddressMock.mockReset();
    derivePublicKeyMock.mockReset();
    onboardAccountMock.mockReset();
    routerPushMock.mockReset();
    qrToDataUrlMock.mockReset();
    deriveAccountAddressMock.mockImplementation(
      (input: { domain?: string }) => ({
        accountId: `alice@${input.domain || "wonderland"}`,
      }),
    );
    derivePublicKeyMock.mockResolvedValue({
      publicKeyHex: "ab".repeat(32),
    });
    setActivePinia(createPinia());
  });

  const mountView = (options?: { withSavedAccount?: boolean }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
    });
    if (options?.withSavedAccount) {
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
    return mount(AccountSetupView, {
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

  it("focuses first launch on the onboarding wizard", () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain("TAIRA Testnet Account");
    expect(wrapper.text()).not.toContain("IrohaConnect Pairing");
    expect(wrapper.text()).not.toContain("Saved Accounts");
    expect(wrapper.findAll(".account-step")).toHaveLength(3);
  });

  it("ignores stale pairing preview success after reset", async () => {
    createConnectPreviewMock.mockResolvedValueOnce({
      walletUri: "wc:preview-1",
      sidBase64Url: "sid-1",
      tokenWallet: "wallet-token-1",
    });
    qrToDataUrlMock.mockResolvedValueOnce("data:image/png;base64,preview-1");

    let resolveSecondPreview: (value: unknown) => void = () => {};
    const secondPreviewDeferred = new Promise((resolve) => {
      resolveSecondPreview = resolve;
    });
    createConnectPreviewMock.mockReturnValueOnce(secondPreviewDeferred);
    qrToDataUrlMock.mockResolvedValueOnce("data:image/png;base64,preview-2");

    const wrapper = mountView({ withSavedAccount: true });

    await getButtonByText(wrapper, "Generate pairing QR").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("sid-1");

    await getButtonByText(wrapper, "Generate pairing QR").trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, "Reset").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("sid-1");
    expect(
      getButtonByText(wrapper, "Generate pairing QR").attributes("disabled"),
    ).toBeUndefined();

    resolveSecondPreview({
      walletUri: "wc:preview-2",
      sidBase64Url: "sid-2",
      tokenWallet: "wallet-token-2",
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).not.toContain("sid-2");
    expect(wrapper.text()).not.toContain("wallet-token-2");
  });

  it("ignores stale pairing preview error after reset", async () => {
    createConnectPreviewMock.mockResolvedValueOnce({
      walletUri: "wc:preview-1",
      sidBase64Url: "sid-1",
      tokenWallet: "wallet-token-1",
    });
    qrToDataUrlMock.mockResolvedValueOnce("data:image/png;base64,preview-1");

    let rejectSecondPreview: (reason?: unknown) => void = () => {};
    const secondPreviewDeferred = new Promise((_, reject) => {
      rejectSecondPreview = reject;
    });
    createConnectPreviewMock.mockReturnValueOnce(secondPreviewDeferred);

    const wrapper = mountView({ withSavedAccount: true });

    await getButtonByText(wrapper, "Generate pairing QR").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("sid-1");

    await getButtonByText(wrapper, "Generate pairing QR").trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, "Reset").trigger("click");
    await flushPromises();

    rejectSecondPreview(new Error("preview down"));
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).not.toContain("preview down");
    expect(wrapper.text()).not.toContain("sid-1");
    expect(
      getButtonByText(wrapper, "Generate pairing QR").attributes("disabled"),
    ).toBeUndefined();
  });

  it("registers the first account and routes to the wallet", async () => {
    onboardAccountMock.mockResolvedValueOnce({
      account_id: "alice@flowers",
      tx_hash_hex: "a".repeat(64),
    });

    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = wrapper.findAll('input:not([type="checkbox"])');

    expect(inputs).toHaveLength(2);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, "Generate recovery phrase").trigger("click");
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, "Register account").trigger("click");
    await flushPromises();

    expect(onboardAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: "Alice",
        accountId: "alice@flowers",
        toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
      }),
    );
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@flowers");
  });
});
