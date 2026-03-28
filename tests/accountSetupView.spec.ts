import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AccountSetupView from "@/views/AccountSetupView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

const EXAMPLE_REAL_I105_ACCOUNT_ID =
  "n42uﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const createConnectPreviewMock = vi.fn();
const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const onboardAccountMock = vi.fn();
const routerPushMock = vi.fn();
const qrToDataUrlMock = vi.fn();
const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

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
        i105AccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        i105DefaultAccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        i105DefaultFullwidthAccountId: "",
        publicKeyHex: "ab".repeat(32),
        accountIdWarning: "",
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

    expect(wrapper.text()).toContain(t("TAIRA Testnet Account"));
    expect(wrapper.text()).toContain("I105 Account ID");
    expect(wrapper.text()).toContain(
      t(
        "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.",
        {
          example: t("Example I105 Account ID"),
        },
      ),
    );
    expect(wrapper.text()).toContain(
      t(
        "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.",
        {
          domain: t("default"),
        },
      ),
    );
    expect(wrapper.text()).not.toContain(t("IrohaConnect Pairing"));
    expect(wrapper.text()).not.toContain(t("Saved Wallets"));
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

    await getButtonByText(wrapper, t("Generate pairing QR")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("sid-1");

    await getButtonByText(wrapper, t("Generate pairing QR")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, "Reset").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("sid-1");
    expect(
      getButtonByText(wrapper, t("Generate pairing QR")).attributes("disabled"),
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

    await getButtonByText(wrapper, t("Generate pairing QR")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("sid-1");

    await getButtonByText(wrapper, t("Generate pairing QR")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, "Reset").trigger("click");
    await flushPromises();

    rejectSecondPreview(new Error("preview down"));
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).not.toContain("preview down");
    expect(wrapper.text()).not.toContain("sid-1");
    expect(
      getButtonByText(wrapper, t("Generate pairing QR")).attributes("disabled"),
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
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    expect(wrapper.text()).not.toContain(t("Register on-chain alias"));
    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();

    await getButtonByText(wrapper, t("Register on-chain alias")).trigger(
      "click",
    );
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
    expect(session.activeAccount?.localOnly).toBe(false);
  });

  it("saves the first account locally without UAID onboarding", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = wrapper.findAll('input:not([type="checkbox"])');

    expect(inputs).toHaveLength(2);

    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@flowers");
    expect(session.activeAccount?.displayName).toBe("");
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("falls back to a local wallet when UAID onboarding is disabled", async () => {
    onboardAccountMock.mockRejectedValueOnce(
      new Error(
        "Onboarding failed with status 403 (Forbidden): UAID onboarding is disabled on this Torii endpoint.",
      ),
    );

    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = wrapper.findAll('input:not([type="checkbox"])');

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();

    await getButtonByText(wrapper, t("Register on-chain alias")).trigger(
      "click",
    );
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@flowers");
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("treats onboarding conflicts as an already-registered account", async () => {
    onboardAccountMock.mockRejectedValueOnce(
      new Error("Onboarding failed with status 409 (Conflict)"),
    );

    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = wrapper.findAll('input:not([type="checkbox"])');

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();

    await getButtonByText(wrapper, t("Register on-chain alias")).trigger(
      "click",
    );
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@flowers");
    expect(session.activeAccount?.localOnly).toBe(false);
  });
});
