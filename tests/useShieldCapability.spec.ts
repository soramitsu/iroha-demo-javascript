import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useShieldCapability } from "@/composables/useShieldCapability";

const getConfidentialAssetPolicyMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
}));

const flushReactiveEffects = async () => {
  await Promise.resolve();
  await nextTick();
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("useShieldCapability", () => {
  beforeEach(() => {
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
  });

  it("uses policy mode to keep shielding enabled when supported", async () => {
    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      assetDefinitionId: "rose#wonderland",
    });
    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");
    expect(capability.shieldPolicyMode.value).toBe("Convertible");
    expect(shielded.value).toBe(true);
  });

  it("disables shielding and unchecks toggle when policy mode is unsupported", async () => {
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
    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Shield mode unavailable: effective policy mode is TransparentOnly.",
    );
    expect(shielded.value).toBe(false);
  });

  it("supports custom translation callback for policy warnings", async () => {
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
    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
      translate: (key, params) =>
        `JP:${key.replace("{mode}", String(params?.mode ?? ""))}`,
    });
    await flushReactiveEffects();

    expect(capability.shieldCapabilityMessage.value).toBe(
      "JP:Shield mode unavailable: effective policy mode is TransparentOnly.",
    );
  });

  it("keeps shielding available and reports errors when policy check fails", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(new Error("timeout"));
    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldPolicyMode.value).toBe("");
    expect(capability.shieldCapabilityMessage.value).toContain(
      "Shield policy check failed: timeout.",
    );
    expect(shielded.value).toBe(true);
  });

  it("does not fetch policy when torii url or asset definition is missing", async () => {
    const toriiUrl = ref("");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(false);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    expect(getConfidentialAssetPolicyMock).not.toHaveBeenCalled();
    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");

    toriiUrl.value = "http://localhost:8080";
    await flushReactiveEffects();
    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledTimes(1);
  });

  it("ignores stale policy responses after connection changes", async () => {
    const first = deferred<{
      asset_id: string;
      block_height: number;
      current_mode: string;
      effective_mode: string;
      vk_set_hash: null;
      poseidon_params_id: null;
      pedersen_params_id: null;
      pending_transition: null;
    }>();
    const second = deferred<{
      asset_id: string;
      block_height: number;
      current_mode: string;
      effective_mode: string;
      vk_set_hash: null;
      poseidon_params_id: null;
      pedersen_params_id: null;
      pending_transition: null;
    }>();
    getConfidentialAssetPolicyMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    toriiUrl.value = "http://localhost:8081";
    await flushReactiveEffects();

    second.resolve({
      asset_id: "rose#wonderland",
      block_height: 2,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    await flushReactiveEffects();

    first.resolve({
      asset_id: "rose#wonderland",
      block_height: 1,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");
    expect(capability.shieldPolicyMode.value).toBe("Convertible");
    expect(shielded.value).toBe(true);
  });

  it("ignores stale policy errors after a newer successful refresh", async () => {
    const first = deferred<{
      asset_id: string;
      block_height: number;
      current_mode: string;
      effective_mode: string;
      vk_set_hash: null;
      poseidon_params_id: null;
      pedersen_params_id: null;
      pending_transition: null;
    }>();
    const second = deferred<{
      asset_id: string;
      block_height: number;
      current_mode: string;
      effective_mode: string;
      vk_set_hash: null;
      poseidon_params_id: null;
      pedersen_params_id: null;
      pending_transition: null;
    }>();
    getConfidentialAssetPolicyMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const toriiUrl = ref("http://localhost:8080");
    const assetDefinitionId = ref("rose#wonderland");
    const shielded = ref(true);

    const capability = useShieldCapability({
      toriiUrl,
      assetDefinitionId,
      shielded,
    });
    await flushReactiveEffects();

    assetDefinitionId.value = "xst#wonderland";
    await flushReactiveEffects();

    second.resolve({
      asset_id: "xst#wonderland",
      block_height: 3,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    await flushReactiveEffects();

    first.reject(new Error("stale timeout"));
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");
    expect(capability.shieldPolicyMode.value).toBe("Convertible");
    expect(shielded.value).toBe(true);
  });
});
