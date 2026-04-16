import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import {
  useShieldCapability,
  type ConfidentialCapabilityOperation,
} from "@/composables/useShieldCapability";

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

const createPolicy = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const mountCapability = (
  operation: ConfidentialCapabilityOperation = "selfShield",
) => {
  const toriiUrl = ref("http://localhost:8080");
  const accountId = ref("testuAlice");
  const assetDefinitionId = ref("xor#universal");
  const shielded = ref(true);
  const capability = useShieldCapability({
    toriiUrl,
    accountId,
    assetDefinitionId,
    shielded,
    operation,
  });

  return {
    toriiUrl,
    accountId,
    assetDefinitionId,
    shielded,
    capability,
  };
};

describe("useShieldCapability", () => {
  beforeEach(() => {
    getConfidentialAssetPolicyMock.mockReset();
    getConfidentialAssetPolicyMock.mockResolvedValue(createPolicy());
  });

  it("keeps self-shield enabled when the policy mode and flags allow it", async () => {
    const { capability, shielded } = mountCapability();
    await flushReactiveEffects();

    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: "testuAlice",
      assetDefinitionId: "xor#universal",
    });
    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");
    expect(capability.shieldPolicyMode.value).toBe("Convertible");
    expect(capability.shieldCapabilityReady.value).toBe(true);
    expect(capability.shieldResolvedAssetId.value).toBe(
      "norito:abcdef0123456789",
    );
    expect(shielded.value).toBe(true);
  });

  it("disables self-shield when the effective mode does not allow shielding", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue(
      createPolicy({
        current_mode: "TransparentOnly",
        effective_mode: "TransparentOnly",
      }),
    );
    const { capability, shielded } = mountCapability();
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Self-shield is unavailable: effective policy mode is TransparentOnly.",
    );
    expect(shielded.value).toBe(false);
  });

  it("disables self-shield when the policy explicitly disables shielding", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue(
      createPolicy({
        allow_shield: false,
      }),
    );
    const { capability, shielded } = mountCapability();
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Self-shield is disabled by the asset policy.",
    );
    expect(shielded.value).toBe(false);
  });

  it("requires vk_transfer for shielded sends", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue(
      createPolicy({
        vk_transfer: null,
      }),
    );
    const { capability, shielded } = mountCapability("shieldedTransfer");
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Shielded send is unavailable because the asset policy is missing vk_transfer.",
    );
    expect(shielded.value).toBe(false);
  });

  it("requires unshield-capable mode for private exits", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue(
      createPolicy({
        current_mode: "ShieldedOnly",
        effective_mode: "ShieldedOnly",
      }),
    );
    const { capability, shielded } = mountCapability("unshield");
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Unshield is unavailable: effective policy mode is ShieldedOnly.",
    );
    expect(shielded.value).toBe(false);
  });

  it("requires allow_unshield and vk_unshield for private exits", async () => {
    getConfidentialAssetPolicyMock
      .mockResolvedValueOnce(
        createPolicy({
          allow_unshield: false,
        }),
      )
      .mockResolvedValueOnce(
        createPolicy({
          vk_unshield: null,
        }),
      );

    const first = mountCapability("unshield");
    await flushReactiveEffects();
    expect(first.capability.shieldSupported.value).toBe(false);
    expect(first.capability.shieldCapabilityMessage.value).toBe(
      "Unshield is disabled by the asset policy.",
    );
    expect(first.shielded.value).toBe(false);

    const second = mountCapability("unshield");
    await flushReactiveEffects();
    expect(second.capability.shieldSupported.value).toBe(false);
    expect(second.capability.shieldCapabilityMessage.value).toBe(
      "Unshield is unavailable because the asset policy is missing vk_unshield.",
    );
    expect(second.shielded.value).toBe(false);
  });

  it("reports the resolved asset id so callers can heal stale buckets", async () => {
    const onResolvedAssetDefinitionId = vi.fn();
    const toriiUrl = ref("http://localhost:8080");
    const accountId = ref("testuAlice");
    const assetDefinitionId = ref("xor#universal");
    const shielded = ref(false);

    useShieldCapability({
      toriiUrl,
      accountId,
      assetDefinitionId,
      shielded,
      operation: "unshield",
      onResolvedAssetDefinitionId,
    });
    await flushReactiveEffects();

    expect(onResolvedAssetDefinitionId).toHaveBeenCalledWith(
      "norito:abcdef0123456789",
    );
  });

  it("treats a 404 policy fetch as unavailable for the current asset definition", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "Confidential asset policy request failed with status 404 (Not Found)",
      ),
    );
    const { capability, shielded } = mountCapability("unshield");
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(false);
    expect(capability.shieldCapabilityMessage.value).toBe(
      "Unshield is unavailable for the current asset definition.",
    );
    expect(shielded.value).toBe(false);
  });

  it("keeps the operation available and sanitizes transient policy-check failures", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "ERR_UNEXPECTED_NETWORK_PREFIX — NRT0`\uFFFD6W\uFFFD5 invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
      ),
    );
    const { capability, shielded } = mountCapability("shieldedTransfer");
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toContain(
      "Shielded send policy check failed: ERR_UNEXPECTED_NETWORK_PREFIX — invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX.",
    );
    expect(capability.shieldCapabilityMessage.value).toContain(
      "Submission may still fail if the current asset policy does not allow it.",
    );
    expect(capability.shieldCapabilityMessage.value).not.toContain("NRT0`");
    expect(shielded.value).toBe(true);
  });

  it("ignores stale policy responses after a newer refresh succeeds", async () => {
    const first = deferred<ReturnType<typeof createPolicy>>();
    const second = deferred<ReturnType<typeof createPolicy>>();
    getConfidentialAssetPolicyMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { toriiUrl, capability, shielded } = mountCapability("unshield");
    await flushReactiveEffects();

    toriiUrl.value = "http://localhost:8081";
    await flushReactiveEffects();

    second.resolve(createPolicy({ block_height: 2 }));
    await flushReactiveEffects();

    first.resolve(
      createPolicy({
        current_mode: "TransparentOnly",
        effective_mode: "TransparentOnly",
      }),
    );
    await flushReactiveEffects();

    expect(capability.shieldSupported.value).toBe(true);
    expect(capability.shieldCapabilityMessage.value).toBe("");
    expect(capability.shieldPolicyMode.value).toBe("Convertible");
    expect(capability.shieldResolvedAssetId.value).toBe(
      "norito:abcdef0123456789",
    );
    expect(shielded.value).toBe(true);
  });
});
