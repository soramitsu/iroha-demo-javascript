import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AccountSetupView from "@/views/AccountSetupView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { mnemonicToPrivateKeyHex } from "@/utils/mnemonic";
import { buildWalletBackupPayload } from "@/utils/walletBackup";

const EXAMPLE_REAL_I105_ACCOUNT_ID =
  "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const VALID_MNEMONIC_PRIVATE_KEY_HEX =
  "5EB00BBDDCF069084889A8AB9155568165F5C453CCB85E70811AAED6F6DA5FC1";
const VALID_24_WORD_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const createConnectPreviewMock = vi.fn();
const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const isSecureVaultAvailableMock = vi.fn();
const storeAccountSecretMock = vi.fn();
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
  isSecureVaultAvailable: () => isSecureVaultAvailableMock(),
  storeAccountSecret: (input: unknown) => storeAccountSecretMock(input),
  onboardAccount: (input: unknown) => onboardAccountMock(input),
}));

describe("AccountSetupView", () => {
  beforeEach(() => {
    createConnectPreviewMock.mockReset();
    deriveAccountAddressMock.mockReset();
    derivePublicKeyMock.mockReset();
    isSecureVaultAvailableMock.mockReset();
    storeAccountSecretMock.mockReset();
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
    isSecureVaultAvailableMock.mockResolvedValue(true);
    storeAccountSecretMock.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  const mountView = (options?: {
    withSavedAccount?: boolean;
    savedAccount?: {
      displayName?: string;
      domain?: string;
      accountId?: string;
      publicKeyHex?: string;
      privateKeyHex?: string;
      localOnly?: boolean;
    };
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
    });
    if (options?.withSavedAccount || options?.savedAccount) {
      const savedAccount = {
        displayName: "Alice",
        domain: "wonderland",
        accountId: "alice@wonderland",
        publicKeyHex: "ab".repeat(32),
        privateKeyHex: "cd".repeat(32),
        localOnly: false,
        ...options?.savedAccount,
      };
      session.$patch({
        accounts: [savedAccount],
        activeAccountId: savedAccount.accountId,
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

  const getTextInputs = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('input:not([type="checkbox"]):not([type="file"])');

  const setInputFiles = (input: HTMLInputElement, files: File[]) => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files,
    });
  };

  it("focuses first launch on the onboarding wizard", () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain(t("TAIRA Testnet Account"));
    expect(wrapper.text()).toContain("I105 Account ID");
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

  it("requests the irohaconnect launch URI for pairing QR generation", async () => {
    createConnectPreviewMock.mockResolvedValueOnce({
      walletUri: "irohaconnect://connect?sid=preview-1",
      walletCanonicalUri: "iroha://connect?sid=preview-1",
      sidBase64Url: "sid-1",
      tokenWallet: "wallet-token-1",
    });
    qrToDataUrlMock.mockResolvedValueOnce("data:image/png;base64,preview-1");

    const wrapper = mountView({ withSavedAccount: true });

    await getButtonByText(wrapper, t("Generate pairing QR")).trigger("click");
    await flushPromises();

    expect(createConnectPreviewMock).toHaveBeenCalledWith({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
      chainId: TAIRA_CHAIN_PRESET.connection.chainId,
      launchProtocol: "irohaconnect",
    });
    expect(qrToDataUrlMock).toHaveBeenCalledWith(
      "irohaconnect://connect?sid=preview-1",
    );
    expect(wrapper.text()).toContain("sid-1");
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

  it("saves the first generated account locally and routes to the wallet", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

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
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === t("Advanced")),
    ).toBe(false);
    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@flowers");
    expect(session.activeAccount?.displayName).toBe("Alice");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("saves the first account locally without UAID onboarding", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

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
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("restores a wallet from a recovery phrase without re-registering it", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    const textarea = wrapper.find("textarea");
    expect(textarea.exists()).toBe(true);
    await textarea.setValue(VALID_MNEMONIC);

    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(
      VALID_MNEMONIC_PRIVATE_KEY_HEX,
    );
    expect(wrapper.text()).not.toContain(t("Download backup"));

    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe("alice@default");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("restores local metadata from an imported backup JSON file", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const backupPayload = JSON.stringify(
      buildWalletBackupPayload({
        mnemonic: VALID_MNEMONIC,
        wordCount: 12,
        target: "manual",
        createdAt: "2026-03-29T00:00:00.000Z",
        displayName: "Backup Alice",
        domain: "backup-domain",
      }),
    );
    const backupFile = new File([backupPayload], "iroha-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(backupFile, "text", {
      configurable: true,
      value: () => Promise.resolve(backupPayload),
    });

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    setInputFiles(fileInput.element as HTMLInputElement, [backupFile]);
    await fileInput.trigger("change");
    await flushPromises();
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(
      VALID_MNEMONIC_PRIVATE_KEY_HEX,
    );
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(session.activeAccount?.displayName).toBe("Backup Alice");
    expect(session.activeAccount?.domain).toBe("backup-domain");
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("does not apply backup metadata when imported recovery data is invalid", async () => {
    const wrapper = mountView();
    const invalidBackupPayload = JSON.stringify({
      mnemonic:
        "invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid",
      displayName: "Backup Alice",
      domain: "backup-domain",
    });
    const backupFile = new File([invalidBackupPayload], "iroha-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(backupFile, "text", {
      configurable: true,
      value: () => Promise.resolve(invalidBackupPayload),
    });

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    setInputFiles(fileInput.element as HTMLInputElement, [backupFile]);
    await fileInput.trigger("change");
    await flushPromises();
    await flushPromises();

    const inputs = getTextInputs(wrapper);
    expect(wrapper.text()).toContain(t("Invalid recovery phrase"));
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
    expect((inputs[1].element as HTMLInputElement).value).toBe("default");
    expect(derivePublicKeyMock).not.toHaveBeenCalled();
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("validates restore phrases before deriving or saving", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(t("Enter a recovery phrase."));
    expect(derivePublicKeyMock).not.toHaveBeenCalled();

    const textarea = wrapper.find("textarea");
    await textarea.setValue("one two three");
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      t("Recovery phrase must contain 12 or 24 words."),
    );
    expect(derivePublicKeyMock).not.toHaveBeenCalled();

    await textarea.setValue(
      "invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid",
    );
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(t("Invalid recovery phrase"));
    expect(derivePublicKeyMock).not.toHaveBeenCalled();
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("restores a 24-word recovery phrase", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const expectedPrivateKeyHex = mnemonicToPrivateKeyHex(
      VALID_24_WORD_MNEMONIC,
    );

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find("textarea").setValue(VALID_24_WORD_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(expectedPrivateKeyHex);
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
  });

  it("surfaces bridge failures while deriving a restored wallet", async () => {
    derivePublicKeyMock.mockRejectedValueOnce(new Error("bridge down"));

    const wrapper = mountView();

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find("textarea").setValue(VALID_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("bridge down");
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === t("Restore wallet")),
    ).toBe(false);
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("does not expose advanced on-chain onboarding controls on first launch", async () => {
    const wrapper = mountView();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    expect(wrapper.text()).not.toContain(t("Advanced"));
    expect(wrapper.text()).not.toContain(t("Register on-chain alias"));
    expect(onboardAccountMock).not.toHaveBeenCalled();
  });

  it("ignores stale onboarding bridge mocks and still saves locally", async () => {
    onboardAccountMock.mockRejectedValueOnce(
      new Error("Onboarding bridge should not be called"),
    );

    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
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
    expect(session.activeAccount?.localOnly).toBe(true);
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
  });

  it("restores from the saved-wallet layout and updates an existing account entry", async () => {
    const wrapper = mountView({
      savedAccount: {
        displayName: "Existing Alice",
        domain: "default",
        accountId: "alice@default",
        publicKeyHex: "11".repeat(32),
        privateKeyHex: "22".repeat(32),
        localOnly: false,
      },
    });
    const session = useSessionStore();

    expect(session.accounts).toHaveLength(1);

    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    const textarea = wrapper.find("textarea");
    await textarea.setValue(VALID_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(session.accounts).toHaveLength(1);
    expect(session.activeAccountId).toBe("alice@default");
    expect(session.activeAccount?.displayName).toBe("");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });
});
