import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SendView from "@/views/SendView.vue";
import { useSessionStore } from "@/stores/session";

const transferAssetMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
  transferAsset: (input: unknown) => transferAssetMock(input),
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

describe("SendView", () => {
  beforeEach(() => {
    localStorage.clear();
    transferAssetMock.mockReset();
    getConfidentialAssetPolicyMock.mockReset();
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "rose#wonderland",
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
        assetDefinitionId: "rose#wonderland",
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
          ih58: "ih58alice",
          compressed: "",
          compressedWarning: "",
        },
      ],
      activeAccountId: "alice@wonderland",
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
      .get('input[placeholder="34m... or 0x...@wonderland"]')
      .setValue("alice@wonderland");
    await wrapper.get('input[type="number"]').setValue("10");
    await wrapper.get('input[type="checkbox"]').setValue(true);

    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledTimes(1);
    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      assetDefinitionId: "rose#wonderland",
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: "alice@wonderland",
        quantity: "10",
        shielded: true,
      }),
    );
    expect(wrapper.text()).toContain("Transaction submitted: 0xabc");
  });

  it("rejects shield mode when destination differs from active account", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .get('input[placeholder="34m... or 0x...@wonderland"]')
      .setValue("bob@wonderland");
    await wrapper.get('input[type="number"]').setValue("10");
    await wrapper.get('input[type="checkbox"]').setValue(true);

    await wrapper.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Shield mode requires destination to be your active account.",
    );
  });

  it("disables shield mode when policy does not support shielding", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "rose#wonderland",
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
      "Shield mode unavailable: effective policy mode is TransparentOnly.",
    );
  });
});
