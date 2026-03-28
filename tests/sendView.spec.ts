import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SendView from "@/views/SendView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";

const EXAMPLE_I105_ACCOUNT_ID = translate("en-US", "Example I105 Account ID");
const ALICE_I105_ACCOUNT_ID = EXAMPLE_I105_ACCOUNT_ID;
const BOB_I105_ACCOUNT_ID = "n42uBobRealI105AccountId";
const MALLORY_I105_ACCOUNT_ID = "n42uMalloryRealI105AccountId";
const EXAMPLE_I105_SELECTOR = `input[placeholder="${EXAMPLE_I105_ACCOUNT_ID}"]`;

const transferAssetMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();
type QrDecodeHandler = (payload: string) => void;
let qrDecodeHandler: QrDecodeHandler | null = null;

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
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
    qrDecodeHandler = null;
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    setActivePinia(createPinia());
  });

  const mountView = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "norito:abcdef0123456789",
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "alice@default",
          i105AccountId: ALICE_I105_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
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

    await wrapper.get(EXAMPLE_I105_SELECTOR).setValue(ALICE_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("10");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.text()).toContain(
      t("Shield policy mode: {mode}.", { mode: "Convertible" }),
    );

    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledTimes(1);
    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      assetDefinitionId: "norito:abcdef0123456789",
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: ALICE_I105_ACCOUNT_ID,
        quantity: "10",
        shielded: true,
      }),
    );
    expect(wrapper.text()).toContain(
      t("Shield transaction submitted: {hash}", { hash: "0xabc" }),
    );
  });

  it("shows transfer-specific success text for transparent sends", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0x123" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get(EXAMPLE_I105_SELECTOR).setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="number"]').setValue("2");
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      t("Transaction submitted: {hash}", { hash: "0x123" }),
    );
    expect(wrapper.text()).not.toContain(t("Shield transaction submitted:"));
  });

  it("trims transparent destination before submit", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0xdef" });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get(EXAMPLE_I105_SELECTOR)
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

  it("locks destination to active account when shield mode is enabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get(EXAMPLE_I105_SELECTOR).setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="checkbox"]').setValue(true);

    const destinationInput = wrapper.get(EXAMPLE_I105_SELECTOR);
    expect((destinationInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((destinationInput.element as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.find(".actions button").text()).toBe("Shield");
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

  it("ignores qr destination payload while shield mode is enabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(typeof qrDecodeHandler).toBe("function");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    qrDecodeHandler?.(
      JSON.stringify({
        accountId: MALLORY_I105_ACCOUNT_ID,
        amount: "7",
      }),
    );
    await flushPromises();

    const destinationInput = wrapper.get(EXAMPLE_I105_SELECTOR);
    const amountInput = wrapper.get('input[type="number"]');
    expect((destinationInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((amountInput.element as HTMLInputElement).value).toBe("7");
    expect(wrapper.text()).toContain(t("QR decoded successfully."));
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

    const destinationInput = wrapper.get(EXAMPLE_I105_SELECTOR);
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

  it("restores previous transparent destination after turning shield mode off", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get(EXAMPLE_I105_SELECTOR).setValue(BOB_I105_ACCOUNT_ID);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('input[type="checkbox"]').setValue(false);

    const destinationInput = wrapper.get(EXAMPLE_I105_SELECTOR);
    expect((destinationInput.element as HTMLInputElement).value).toBe(
      BOB_I105_ACCOUNT_ID,
    );
    expect((destinationInput.element as HTMLInputElement).disabled).toBe(false);
  });

  it("restores empty destination after turning shield mode off", async () => {
    const wrapper = mountView();
    await flushPromises();

    const destinationInput = wrapper.get(EXAMPLE_I105_SELECTOR);
    await destinationInput.setValue("");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('input[type="checkbox"]').setValue(false);

    expect((destinationInput.element as HTMLInputElement).value).toBe("");
    expect((destinationInput.element as HTMLInputElement).disabled).toBe(false);
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
      t("Shield mode unavailable: effective policy mode is {mode}.", {
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
        "Shield policy check failed: {message}. Submission may still fail if shield mode is unsupported.",
        { message: "network timeout" },
      ),
    );
  });

  it("disables submit for non-integer shield amounts", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('input[type="number"]').setValue("10.5");

    expect(wrapper.get(".actions button").attributes("disabled")).toBeDefined();
  });
});
