import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SendView from "@/views/SendView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const BOB_I105_ACCOUNT_ID = "testuBobRealI105AccountId";
const BOB_OWNER_TAG_HEX = "11".repeat(32);
const MALLORY_OWNER_TAG_HEX = "22".repeat(32);
const BOB_DIVERSIFIER_HEX = "33".repeat(32);
const MALLORY_DIVERSIFIER_HEX = "44".repeat(32);
const BOB_RECEIVE_KEY_ID = "bob-receive-key";
const MALLORY_RECEIVE_KEY_ID = "mallory-receive-key";
const BOB_RECEIVE_PUBLIC_KEY_BASE64_URL = "bobReceivePublicKey";
const MALLORY_RECEIVE_PUBLIC_KEY_BASE64_URL = "malloryReceivePublicKey";
const DESTINATION_ACCOUNT_SELECTOR =
  'input[data-testid="destination-account-input"]';

const transferAssetMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();
const resolveAccountAliasMock = vi.fn();
type QrDecodeHandler = (payload: string) => void;
let qrDecodeHandler: QrDecodeHandler | null = null;

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
  resolveAccountAlias: (input: unknown) => resolveAccountAliasMock(input),
  transferAsset: (input: unknown) => transferAssetMock(input),
}));

vi.mock("@/composables/useQrScanner", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useQrScanner: (onDecode: QrDecodeHandler) => {
      qrDecodeHandler = onDecode;
      return {
        scanning: ref(false),
        message: ref(""),
        videoRef: ref<HTMLVideoElement | null>(null),
        fileInputRef: ref<HTMLInputElement | null>(null),
        start: vi.fn(),
        openFilePicker: vi.fn(),
        decodeFile: vi.fn(),
      };
    },
  };
});

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("SendView", () => {
  beforeEach(() => {
    localStorage.clear();
    transferAssetMock.mockReset();
    getConfidentialAssetPolicyMock.mockReset();
    resolveAccountAliasMock.mockReset();
    qrDecodeHandler = null;
    resolveAccountAliasMock.mockImplementation(
      async (input: { alias?: string }) => ({
        alias: "",
        accountId: String(input.alias ?? "").trim(),
        resolved: false,
      }),
    );
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    setActivePinia(createPinia());
  });

  const mountView = (assetDefinitionId = "norito:abcdef0123456789") => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "alice@default",
          i105AccountId: ALICE_I105_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          hasStoredSecret: true,
        },
      ],
      activeAccountId: "alice@default",
    });
    return mount(SendView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  it("forwards shielded send payloads when checkbox is enabled", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0xabc" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("10");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    qrDecodeHandler?.(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v3",
        amount: "10",
        receiveKeyId: BOB_RECEIVE_KEY_ID,
        receivePublicKeyBase64Url: BOB_RECEIVE_PUBLIC_KEY_BASE64_URL,
        shieldedOwnerTagHex: BOB_OWNER_TAG_HEX,
        shieldedDiversifierHex: BOB_DIVERSIFIER_HEX,
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain(t("Private transfer"));

    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledTimes(1);
    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ALICE_I105_ACCOUNT_ID,
      assetDefinitionId: "norito:abcdef0123456789",
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: undefined,
        quantity: "10",
        shielded: true,
        shieldedOwnerTagHex: BOB_OWNER_TAG_HEX,
        shieldedDiversifierHex: BOB_DIVERSIFIER_HEX,
        shieldedRecipient: {
          receiveKeyId: BOB_RECEIVE_KEY_ID,
          receivePublicKeyBase64Url: BOB_RECEIVE_PUBLIC_KEY_BASE64_URL,
          ownerTagHex: BOB_OWNER_TAG_HEX,
          diversifierHex: BOB_DIVERSIFIER_HEX,
        },
      }),
    );
    expect(wrapper.text()).toContain(
      t("Private shielded transfer committed: {hash}", { hash: "0xabc" }),
    );
  });

  it("shows transfer-specific success text for transparent sends", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0x123" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      t("Transaction submitted: {hash}", { hash: "0x123" }),
    );
    expect(wrapper.text()).not.toContain(
      t("Anonymous shielded transaction committed:"),
    );
  });

  it("keeps private mode optional without showing policy copy", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(t("Standard"));
    expect(wrapper.text()).toContain(t("Private"));
    expect(wrapper.text()).not.toContain(t("Shield policy mode: {mode}."));

    await wrapper.get('input[type="checkbox"]').setValue(true);

    expect(wrapper.text()).toContain(
      t(
        "Private transfers use the recipient Receive QR and do not include memos.",
      ),
    );
  });

  it("trims transparent destination before submit", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0xdef" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(` ${BOB_I105_ACCOUNT_ID} `);
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: BOB_I105_ACCOUNT_ID,
        shielded: false,
      }),
    );
  });

  it("resolves recipient aliases before transparent sends", async () => {
    resolveAccountAliasMock.mockResolvedValueOnce({
      alias: "bob@universal",
      accountId: BOB_I105_ACCOUNT_ID,
      resolved: true,
      source: "on_chain",
    });
    transferAssetMock.mockResolvedValue({ hash: "0xalias" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get(DESTINATION_ACCOUNT_SELECTOR).setValue("bob@universal");
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(resolveAccountAliasMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      alias: "bob@universal",
      networkPrefix: 369,
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: BOB_I105_ACCOUNT_ID,
        networkPrefix: 369,
        shielded: false,
      }),
    );
    expect(wrapper.text()).toContain(
      t("Alias {alias} resolves to {accountId}.", {
        alias: "bob@universal",
        accountId: BOB_I105_ACCOUNT_ID,
      }),
    );
  });

  it("blocks transparent sends when an alias cannot resolve", async () => {
    resolveAccountAliasMock.mockRejectedValueOnce(
      new Error('Account alias "missing@universal" was not found.'),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue("missing@universal");
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      'Account alias "missing@universal" was not found.',
    );
  });

  it("keeps destination editable when shield mode is enabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="checkbox"]').setValue(true);

    const destinationInput = wrapper.get(DESTINATION_ACCOUNT_SELECTOR);
    expect((destinationInput.element as HTMLInputElement).value).toBe(
      BOB_I105_ACCOUNT_ID,
    );
    expect((destinationInput.element as HTMLInputElement).disabled).toBe(false);
    expect(wrapper.find(".actions button").text()).toBe(t("Send privately"));
  });

  it("switches amount input step when shield mode changes", async () => {
    const wrapper = mountView();
    await flushPromises();

    const amountInput = wrapper.get('input[type="number"]');
    expect(amountInput.attributes("step")).toBe("0.01");

    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(amountInput.attributes("step")).toBe("1");

    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(amountInput.attributes("step")).toBe("0.01");
  });

  it("shows a humanized asset label instead of raw norito bytes", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(
      formatAssetDefinitionLabel("norito:abcdef0123456789"),
    );
    expect(wrapper.text()).not.toContain("norito:abcdef0123456789");
  });

  it("heals a stale configured asset bucket before the first shielded send", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    transferAssetMock.mockResolvedValue({ hash: "0xhealed" });
    const wrapper = mountView("5OldBucket1111111111111111111");
    const session = useSessionStore();
    await flushPromises();

    expect(session.connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );

    await wrapper
      .get(DESTINATION_ACCOUNT_SELECTOR)
      .setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("4");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    qrDecodeHandler?.(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v3",
        amount: "4",
        receiveKeyId: BOB_RECEIVE_KEY_ID,
        receivePublicKeyBase64Url: BOB_RECEIVE_PUBLIC_KEY_BASE64_URL,
        shieldedOwnerTagHex: BOB_OWNER_TAG_HEX,
        shieldedDiversifierHex: BOB_DIVERSIFIER_HEX,
      }),
    );
    await flushPromises();
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        destinationAccountId: undefined,
        shielded: true,
      }),
    );
  });

  it("applies qr destination payload while shield mode is enabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(typeof qrDecodeHandler).toBe("function");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    qrDecodeHandler?.(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v3",
        amount: "7",
        receiveKeyId: MALLORY_RECEIVE_KEY_ID,
        receivePublicKeyBase64Url: MALLORY_RECEIVE_PUBLIC_KEY_BASE64_URL,
        shieldedOwnerTagHex: MALLORY_OWNER_TAG_HEX,
        shieldedDiversifierHex: MALLORY_DIVERSIFIER_HEX,
      }),
    );
    await flushPromises();

    const destinationInput = wrapper.get(DESTINATION_ACCOUNT_SELECTOR);
    const amountInput = wrapper.get('input[type="number"]');
    expect((destinationInput.element as HTMLInputElement).value).toBe("");
    expect((amountInput.element as HTMLInputElement).value).toBe("7");
    expect(wrapper.text()).toContain(t("QR decoded successfully."));

    transferAssetMock.mockResolvedValue({ hash: "0xqrshield" });
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shieldedOwnerTagHex: MALLORY_OWNER_TAG_HEX,
        shieldedDiversifierHex: MALLORY_DIVERSIFIER_HEX,
        shieldedRecipient: {
          receiveKeyId: MALLORY_RECEIVE_KEY_ID,
          receivePublicKeyBase64Url: MALLORY_RECEIVE_PUBLIC_KEY_BASE64_URL,
          ownerTagHex: MALLORY_OWNER_TAG_HEX,
          diversifierHex: MALLORY_DIVERSIFIER_HEX,
        },
      }),
    );
  });

  it("rejects legacy private receive qr payloads", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    qrDecodeHandler?.(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v2",
        accountId: BOB_I105_ACCOUNT_ID,
        amount: "7",
        shieldedOwnerTagHex: BOB_OWNER_TAG_HEX,
        shieldedDiversifierHex: BOB_DIVERSIFIER_HEX,
      }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "Legacy private Receive QR codes are no longer supported. Ask the recipient to refresh their Receive QR.",
      ),
    );
    expect(
      (wrapper.get(DESTINATION_ACCOUNT_SELECTOR).element as HTMLInputElement)
        .value,
    ).toBe("");
    expect(wrapper.get(".actions button").attributes("disabled")).toBeDefined();
  });

  it("applies qr destination payload when shield mode is disabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(typeof qrDecodeHandler).toBe("function");
    qrDecodeHandler?.(
      JSON.stringify({
        accountId: BOB_I105_ACCOUNT_ID,
        amount: "3.5",
      }),
    );
    await flushPromises();

    const destinationInput = wrapper.get(DESTINATION_ACCOUNT_SELECTOR);
    const amountInput = wrapper.get('input[type="number"]');
    expect((destinationInput.element as HTMLInputElement).value).toBe(
      BOB_I105_ACCOUNT_ID,
    );
    expect((amountInput.element as HTMLInputElement).value).toBe("3.5");
    expect(wrapper.text()).toContain(t("QR decoded successfully."));
  });

  it("shows an error message for malformed qr payloads", async () => {
    const wrapper = mountView();
    await flushPromises();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(typeof qrDecodeHandler).toBe("function");
      qrDecodeHandler?.("{not-valid-json");
      await flushPromises();

      expect(wrapper.text()).toContain(t("QR payload is invalid."));
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("disables shield mode when policy does not support shielding", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    const wrapper = mountView();
    await flushPromises();

    const checkbox = wrapper.get('input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.text()).toContain(
      t("{operation} is unavailable: effective policy mode is {mode}.", {
        operation: "Shielded send",
        mode: "TransparentOnly",
      }),
    );
  });

  it("keeps shield enabled and shows warning when policy check fails", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error("network timeout"),
    );
    const wrapper = mountView();
    await flushPromises();

    const checkbox = wrapper.get('input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).disabled).toBe(false);
    expect(wrapper.text()).toContain(
      t(
        "{operation} policy check failed: {message}. Submission may still fail if the current asset policy does not allow it.",
        { operation: "Shielded send", message: "network timeout" },
      ),
    );
  });

  it("disables shield mode when the configured asset definition is missing", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "Confidential asset policy request failed with status 404 (Not Found)",
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    const checkbox = wrapper.get('input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.text()).toContain(
      t("{operation} is unavailable for the current asset definition.", {
        operation: "Shielded send",
      }),
    );
  });

  it("sanitizes unreadable shield policy errors on the send page", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "ERR_UNEXPECTED_NETWORK_PREFIX — NRT0`\uFFFD6W\uFFFD5 invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "ERR_UNEXPECTED_NETWORK_PREFIX — invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
    );
    expect(wrapper.text()).not.toContain("NRT0`");
  });

  it("disables submit for non-integer shield amounts", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('input[type="number"]').setValue("10.5");

    expect(wrapper.get(".actions button").attributes("disabled")).toBeDefined();
  });
});
