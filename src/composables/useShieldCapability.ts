import { ref, watch, type Ref } from "vue";
import { getConfidentialAssetPolicy } from "@/services/iroha";
import { confidentialModeSupportsShield } from "@/utils/confidential";

interface UseShieldCapabilityInput {
  toriiUrl: Ref<string>;
  assetDefinitionId: Ref<string>;
  shielded: Ref<boolean>;
  translate?: (key: string, params?: Record<string, string | number>) => string;
}

const fallbackTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => {
  if (!params) return key;
  return key.replace(/\{([\w]+)\}/g, (_match, token) =>
    params[token] === undefined ? `{${token}}` : String(params[token]),
  );
};

export const useShieldCapability = ({
  toriiUrl,
  assetDefinitionId,
  shielded,
  translate = fallbackTranslate,
}: UseShieldCapabilityInput) => {
  const shieldSupported = ref(true);
  const shieldCapabilityMessage = ref("");
  const shieldPolicyMode = ref("");
  let refreshRevision = 0;

  const refreshShieldCapability = async () => {
    const revision = ++refreshRevision;
    shieldPolicyMode.value = "";
    shieldCapabilityMessage.value = "";
    shieldSupported.value = true;

    const normalizedToriiUrl = toriiUrl.value.trim();
    const normalizedAssetDefinitionId = assetDefinitionId.value.trim();
    if (!normalizedToriiUrl || !normalizedAssetDefinitionId) {
      return;
    }

    try {
      const policy = await getConfidentialAssetPolicy({
        toriiUrl: normalizedToriiUrl,
        assetDefinitionId: normalizedAssetDefinitionId,
      });
      if (revision !== refreshRevision) {
        return;
      }
      const effectiveMode = policy.effective_mode || policy.current_mode;
      shieldPolicyMode.value = effectiveMode;
      if (!confidentialModeSupportsShield(effectiveMode)) {
        shieldSupported.value = false;
        shielded.value = false;
        shieldCapabilityMessage.value = translate(
          "Shield mode unavailable: effective policy mode is {mode}.",
          { mode: effectiveMode },
        );
      }
    } catch (error) {
      if (revision !== refreshRevision) {
        return;
      }
      shieldSupported.value = true;
      shieldCapabilityMessage.value =
        error instanceof Error
          ? translate(
              "Shield policy check failed: {message}. Submission may still fail if shield mode is unsupported.",
              { message: error.message },
            )
          : translate(
              "Shield policy check failed. Submission may still fail if shield mode is unsupported.",
            );
    }
  };

  watch(
    () => [toriiUrl.value, assetDefinitionId.value],
    () => {
      void refreshShieldCapability();
    },
    { immediate: true },
  );

  return {
    shieldSupported,
    shieldCapabilityMessage,
    shieldPolicyMode,
    refreshShieldCapability,
  };
};
