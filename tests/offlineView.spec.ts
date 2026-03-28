import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import OfflineView from "@/views/OfflineView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { useOfflineStore } from "@/stores/offline";

const EXAMPLE_I105_ACCOUNT_ID = translate("en-US", "Example I105 Account ID");
const ALICE_I105_ACCOUNT_ID = EXAMPLE_I105_ACCOUNT_ID;
const TREASURY_I105_ACCOUNT_ID = "testuTreasuryRealI105AccountId";
const EXAMPLE_I105_SELECTOR = `input[placeholder="${EXAMPLE_I105_ACCOUNT_ID}"]`;

const transferAssetMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
  transferAsset: (input: unknown) => transferAssetMock(input),
}));

vi.mock("@/services/offline", () => ({
  fetchOfflineAllowances: vi.fn(),
}));

vi.mock("@/composables/useQrScanner", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useQrScanner: () => ({
      scanning: ref(false),
      message: ref(""),
      videoRef: ref<HTMLVideoElement | null>(null),
      fileInputRef: ref<HTMLInputElement | null>(null),
      start: vi.fn(),
      openFilePicker: vi.fn(),
      decodeFile: vi.fn(),
    }),
  };
});

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("OfflineView move-to-online shield mode", () => {
  beforeEach(() => {
    localStorage.clear();
    transferAssetMock.mockReset();
    getConfidentialAssetPolicyMock.mockReset();
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
    const offline = useOfflineStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "norito:abcdef0123456789",
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
        },
      ],
      activeAccountId: "alice@default",
    });
    offline.$patch({
      wallet: {
        balance: "25",
        nextCounter: 0,
        replayLog: [],
        history: [],
        syncedAtMs: null,
        nextPolicyExpiryMs: null,
        nextRefreshMs: null,
      },
    });
    return mount(OfflineView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const getMoveSection = (wrapper: ReturnType<typeof mount>) => {
    const section = wrapper
      .findAll("section.card")
      .find((node) => node.text().includes(t("Move funds to online wallet")));
    if (!section) {
      throw new Error("Move-to-online section not found");
    }
    return section;
  };

  const getSection = (wrapper: ReturnType<typeof mount>, title: string) => {
    const section = wrapper
      .findAll("section.card")
      .find((node) => node.text().includes(title));
    if (!section) {
      throw new Error(`Section not found: ${title}`);
    }
    return section;
  };

  it("forwards shielded move payloads and locks destination to active account", async () => {
    transferAssetMock.mockResolvedValue({ hash: "0xabc" });
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(EXAMPLE_I105_SELECTOR);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    const submitButton = moveSection.get(".actions button");

    await receiverInput.setValue(TREASURY_I105_ACCOUNT_ID);
    await amountInput.setValue("10");
    await shieldCheckbox.setValue(true);

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(true);
    expect(submitButton.text()).toBe(t("Shield to online wallet"));

    await submitButton.trigger("click");
    await flushPromises();

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
    expect(moveSection.text()).toContain(
      t("Shield transfer submitted and offline balance updated."),
    );
  });

  it("disables shield option when policy mode is unsupported", async () => {
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

    const moveSection = getMoveSection(wrapper);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    expect((shieldCheckbox.element as HTMLInputElement).disabled).toBe(true);
    expect(moveSection.text()).toContain(
      t("Shield mode unavailable: effective policy mode is {mode}.", {
        mode: "TransparentOnly",
      }),
    );
  });

  it("keeps offline shield enabled and shows warning when policy check fails", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error("service unavailable"),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    expect((shieldCheckbox.element as HTMLInputElement).disabled).toBe(false);
    expect(moveSection.text()).toContain(
      t(
        "Shield policy check failed: {message}. Submission may still fail if shield mode is unsupported.",
        { message: "service unavailable" },
      ),
    );
  });

  it("disables online move submit for non-integer shield amount", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    const submitButton = moveSection.get(".actions button");

    await shieldCheckbox.setValue(true);
    await amountInput.setValue("10.5");

    expect(submitButton.attributes("disabled")).toBeDefined();
  });

  it("restores previous transparent receiver after turning shield mode off", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(EXAMPLE_I105_SELECTOR);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');

    await receiverInput.setValue(TREASURY_I105_ACCOUNT_ID);
    await shieldCheckbox.setValue(true);
    await shieldCheckbox.setValue(false);

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      TREASURY_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(false);
  });

  it("restores empty receiver after turning shield mode off", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(EXAMPLE_I105_SELECTOR);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');

    await receiverInput.setValue("");
    await shieldCheckbox.setValue(true);
    await shieldCheckbox.setValue(false);

    expect((receiverInput.element as HTMLInputElement).value).toBe("");
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(false);
  });

  it("rejects offline invoices for a different asset", async () => {
    const wrapper = mountView();
    await flushPromises();

    const paymentSection = getSection(wrapper, t("Send offline payment"));
    await paymentSection.get("textarea").setValue(
      JSON.stringify({
        invoice_id: "inv-1",
        receiver: "merchant@wonderland",
        asset: "xor#wonderland",
        amount: "5",
        created_at_ms: Date.now(),
        expires_at_ms: Date.now() + 60_000,
      }),
    );

    await paymentSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(paymentSection.text()).toContain(
      t("Invoice asset does not match the active offline asset."),
    );
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("rejects offline payments for a different asset", async () => {
    const wrapper = mountView();
    await flushPromises();

    const acceptSection = getSection(wrapper, t("Accept offline payment"));
    await acceptSection.get("textarea").setValue(
      JSON.stringify({
        tx_id: "tx-1",
        from: "merchant@wonderland",
        to: "alice@wonderland",
        asset: "xor#wonderland",
        amount: "5",
        invoice_id: "inv-1",
        counter: 0,
        timestamp_ms: Date.now(),
        channel: "qr",
      }),
    );

    await acceptSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(acceptSection.text()).toContain(
      t("Payment asset does not match the active offline asset."),
    );
  });
});
