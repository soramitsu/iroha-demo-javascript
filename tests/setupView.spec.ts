import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SetupView from "@/views/SetupView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import type { ConnectionConfig } from "@/stores/session";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const generateKeyPairMock = vi.fn();
const isSecureVaultAvailableMock = vi.fn();
const pingToriiMock = vi.fn();
const registerAccountMock = vi.fn();
const storeAccountSecretMock = vi.fn();

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

vi.mock("@/services/iroha", () => ({
  deriveAccountAddress: (input: unknown) => deriveAccountAddressMock(input),
  derivePublicKey: (privateKeyHex: string) =>
    derivePublicKeyMock(privateKeyHex),
  generateKeyPair: () => generateKeyPairMock(),
  isSecureVaultAvailable: () => isSecureVaultAvailableMock(),
  pingTorii: (toriiUrl: string) => pingToriiMock(toriiUrl),
  registerAccount: (input: unknown) => registerAccountMock(input),
  storeAccountSecret: (input: unknown) => storeAccountSecretMock(input),
}));

describe("SetupView", () => {
  beforeEach(() => {
    deriveAccountAddressMock.mockReset();
    derivePublicKeyMock.mockReset();
    generateKeyPairMock.mockReset();
    isSecureVaultAvailableMock.mockReset();
    pingToriiMock.mockReset();
    registerAccountMock.mockReset();
    storeAccountSecretMock.mockReset();

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
    isSecureVaultAvailableMock.mockResolvedValue(true);
    pingToriiMock.mockResolvedValue({ status: "ok" });
    registerAccountMock.mockResolvedValue({ hash: "0xabc" });
    storeAccountSecretMock.mockResolvedValue(undefined);

    setActivePinia(createPinia());
  });

  const mountView = (options?: {
    assetDefinitionId?: string;
    connection?: Partial<ConnectionConfig>;
    authority?: Record<string, unknown>;
    activeAccount?: Record<string, unknown>;
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        ...options?.connection,
        assetDefinitionId:
          options?.assetDefinitionId ??
          options?.connection?.assetDefinitionId ??
          TAIRA_CHAIN_PRESET.connection.assetDefinitionId,
      },
    });
    if (options?.authority) {
      session.$patch({
        authority: {
          accountId: "",
          privateKeyHex: "",
          hasStoredSecret: false,
          ...options.authority,
        },
      });
    }
    if (options?.activeAccount) {
      session.$patch({
        accounts: [
          {
            ...options.activeAccount,
            displayName: "Alice",
            domain: "default",
            accountId:
              "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
            i105AccountId:
              "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
            i105DefaultAccountId:
              "sorauロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
            publicKeyHex: "ab".repeat(32),
            privateKeyHex: "",
            hasStoredSecret: true,
            localOnly: true,
          },
        ],
        activeAccountId: String(options.activeAccount.accountId),
      });
    }
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
    ).not.toContain(
      t("Requires authority credentials to create the account on-chain."),
    );

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

  it("shows a humanized asset label without echoing the raw literal", async () => {
    const rawAssetDefinitionId = "norito:abcdefghijklmnopqrstuvwxyz012345";
    const wrapper = mountView({ assetDefinitionId: rawAssetDefinitionId });

    const inputs = wrapper.findAll("input");
    expect(
      inputs.some(
        (node) =>
          (node.element as HTMLInputElement).value ===
          formatAssetDefinitionLabel(rawAssetDefinitionId),
      ),
    ).toBe(true);
    expect(
      inputs.some(
        (node) =>
          (node.element as HTMLInputElement).value === rawAssetDefinitionId,
      ),
    ).toBe(false);

    await wrapper.get(".setup-asset-literal summary").trigger("click");
    await flushPromises();

    const rawInput = wrapper.get('input[data-testid="raw-asset-id-input"]');
    expect((rawInput.element as HTMLInputElement).value).toBe("");
  });

  it("stores generated identities in secure storage without persisting the private key", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await getButtonByText(wrapper, t("Generate pair")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId:
        "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
      privateKeyHex: "11".repeat(32),
    });
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.privateKeyHex).toBe("");
  });

  it("saves generated identities with the same network prefix used for derivation", async () => {
    deriveAccountAddressMock.mockImplementation(
      (input: { networkPrefix?: number }) => {
        const prefix = input.networkPrefix === 369 ? "testu" : "n42u";
        return {
          accountId: `${prefix}SetupStableAccount1234567890`,
          i105AccountId: `${prefix}SetupStableAccount1234567890`,
          i105DefaultAccountId: "sorauSetupStableAccount1234567890",
          publicKeyHex: "ab".repeat(32),
          accountIdWarning: "",
        };
      },
    );
    const wrapper = mountView({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        networkPrefix: 42,
      },
    });
    const session = useSessionStore();

    await getButtonByText(wrapper, t("Generate pair")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: "n42uSetupStableAccount1234567890",
      privateKeyHex: "11".repeat(32),
    });
    expect(session.connection.networkPrefix).toBe(42);
    expect(session.activeAccountId).toBe("n42uSetupStableAccount1234567890");
    expect(session.activeAccount?.i105AccountId).toBe(
      "n42uSetupStableAccount1234567890",
    );
  });

  it("does not mutate the saved session when secure storage rejects an adversarial form-prefix change", async () => {
    storeAccountSecretMock.mockRejectedValueOnce(
      new Error("DPAPI protect denied"),
    );
    deriveAccountAddressMock.mockImplementation(
      (input: { networkPrefix?: number }) => {
        const prefix = input.networkPrefix === 369 ? "testu" : "n42u";
        return {
          accountId: `${prefix}DeniedSetupAccount1234567890`,
          i105AccountId: `${prefix}DeniedSetupAccount1234567890`,
          i105DefaultAccountId: "sorauDeniedSetupAccount1234567890",
          publicKeyHex: "ab".repeat(32),
          accountIdWarning: "",
        };
      },
    );
    const wrapper = mountView();
    const session = useSessionStore();
    await wrapper.find('input[type="number"]').setValue(42);

    await getButtonByText(wrapper, t("Generate pair")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: "n42uDeniedSetupAccount1234567890",
      privateKeyHex: "11".repeat(32),
    });
    expect(session.connection.networkPrefix).toBe(
      TAIRA_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(session.activeAccount).toBeNull();
    expect(wrapper.text()).toContain("DPAPI protect denied");
  });

  it("does not persist authority state when secure storage rejects the authority key", async () => {
    storeAccountSecretMock.mockRejectedValueOnce(
      new Error("authority DPAPI denied"),
    );
    const wrapper = mountView();
    const session = useSessionStore();

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();
    const authorityAccountInput = wrapper.findAll("input").at(-1);
    const authorityPrivateKeyInput = wrapper.findAll("textarea").at(2);
    if (!authorityAccountInput || !authorityPrivateKeyInput) {
      throw new Error("Authority fields were not rendered");
    }
    await authorityAccountInput.setValue("testuAuthority");
    await authorityPrivateKeyInput.setValue("22".repeat(32));

    await getButtonByText(wrapper, t("Save authority")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: "testuAuthority",
      privateKeyHex: "22".repeat(32),
    });
    expect(session.authority.accountId).toBe("");
    expect(session.authority.hasStoredSecret).toBe(false);
    expect(wrapper.text()).toContain("authority DPAPI denied");
  });

  it("uses a saved authority secret when registering an on-chain account", async () => {
    const wrapper = mountView({
      authority: {
        accountId: "testuAuthority",
        privateKeyHex: "",
        hasStoredSecret: true,
      },
      activeAccount: {
        accountId:
          "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
        publicKeyHex: "ab".repeat(32),
        hasStoredSecret: true,
      },
    });

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Create on-chain account")).trigger(
      "click",
    );
    await flushPromises();

    expect(registerAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authorityAccountId: "testuAuthority",
        authorityPrivateKeyHex: undefined,
      }),
    );
  });

  it("does not sync adversarial form connection changes when on-chain registration fails", async () => {
    registerAccountMock.mockRejectedValueOnce(new Error("Torii rejected"));
    const wrapper = mountView({
      authority: {
        accountId: "testuAuthority",
        privateKeyHex: "",
        hasStoredSecret: true,
      },
      activeAccount: {
        accountId:
          "testuロ1PノウヌmEエWオebHム6ヤルイヰiwuCWErJ7uスoPGアヤnjムKヒTCW2PV",
        publicKeyHex: "ab".repeat(32),
        hasStoredSecret: true,
      },
    });
    const session = useSessionStore();
    const originalActiveAccountId = session.activeAccountId;
    await wrapper.find('input[type="number"]').setValue(42);

    await getButtonByText(wrapper, t("Advanced")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Create on-chain account")).trigger(
      "click",
    );
    await flushPromises();

    expect(registerAccountMock).toHaveBeenCalled();
    expect(session.connection.networkPrefix).toBe(
      TAIRA_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(session.activeAccountId).toBe(originalActiveAccountId);
    expect(wrapper.text()).toContain("Torii rejected");
  });
});
