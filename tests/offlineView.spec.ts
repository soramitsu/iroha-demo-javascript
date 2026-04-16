import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import OfflineView from "@/views/OfflineView.vue";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { useOfflineStore } from "@/stores/offline";
import { formatAssetDefinitionLabel } from "@/utils/assetId";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const TREASURY_I105_ACCOUNT_ID = "testuTreasuryRealI105AccountId";
const ONLINE_DESTINATION_SELECTOR =
  'input[data-testid="offline-online-destination-input"]';

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
    const offline = useOfflineStore();
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
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);
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
    expect(submitButton.text()).toBe(t("Unshield to wallet"));

    await submitButton.trigger("click");
    await flushPromises();

    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ALICE_I105_ACCOUNT_ID,
      assetDefinitionId: "norito:abcdef0123456789",
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: ALICE_I105_ACCOUNT_ID,
        quantity: "10",
        unshield: true,
      }),
    );
    expect(moveSection.text()).toContain(
      t("Unshield submitted and offline balance updated."),
    );
  });

  it("heals a stale configured asset bucket before the first offline shield move", async () => {
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

    const moveSection = getMoveSection(wrapper);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    const submitButton = moveSection.get(".actions button");

    await amountInput.setValue("4");
    await shieldCheckbox.setValue(true);
    await submitButton.trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
        destinationAccountId: ALICE_I105_ACCOUNT_ID,
        unshield: true,
      }),
    );
  });

  it("disables shield option when policy mode is unsupported", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
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
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    expect((shieldCheckbox.element as HTMLInputElement).disabled).toBe(true);
    expect(moveSection.text()).toContain(
      t("Unshield is unavailable: effective policy mode is {mode}.", {
        mode: "TransparentOnly",
      }),
    );
  });

  it("shows a private-exit note while unshield stays optional", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(moveSection.text()).toContain(
      t(
        "Private exit is optional. Leave it off to avoid unshielding, but the transfer will stay transparent.",
      ),
    );

    await moveSection.get('input[type="checkbox"]').setValue(true);

    expect(moveSection.text()).not.toContain(
      t(
        "Private exit is optional. Leave it off to avoid unshielding, but the transfer will stay transparent.",
      ),
    );
  });

  it("keeps private exit enabled and shows warning when policy check fails", async () => {
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
        "Unshield policy check failed: {message}. Submission may still fail if the current asset policy does not allow it.",
        { message: "service unavailable" },
      ),
    );
  });

  it("disables private exit when the configured asset definition is missing", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "Confidential asset policy request failed with status 404 (Not Found)",
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');
    expect((shieldCheckbox.element as HTMLInputElement).disabled).toBe(true);
    expect(moveSection.text()).toContain(
      t("Unshield is unavailable for the current asset definition."),
    );
  });

  it("disables online move submit for non-integer unshield amount", async () => {
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

  it("restores previous transparent receiver after turning private exit off", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);
    const shieldCheckbox = moveSection.get('input[type="checkbox"]');

    await receiverInput.setValue(TREASURY_I105_ACCOUNT_ID);
    await shieldCheckbox.setValue(true);
    await shieldCheckbox.setValue(false);

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      TREASURY_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(false);
  });

  it("restores empty receiver after turning private exit off", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);
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

  it("shows humanized norito labels in offline payload previews", async () => {
    const wrapper = mountView();
    await flushPromises();

    const requestSection = getSection(wrapper, t("Request offline payment"));
    await requestSection.get('input[type="text"]').setValue("5");
    await requestSection.get(".icon-cta").trigger("click");
    await flushPromises();

    expect(requestSection.text()).toContain(
      formatAssetDefinitionLabel("norito:abcdef0123456789"),
    );
    expect(requestSection.text()).not.toContain("norito:abcdef0123456789");
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
