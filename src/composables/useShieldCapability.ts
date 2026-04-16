import { ref, watch, type Ref } from "vue";
import { getConfidentialAssetPolicy } from "@/services/iroha";
import { confidentialModeSupportsShield } from "@/utils/confidential";
import { sanitizeErrorMessage } from "@/utils/errorMessage";

interface UseShieldCapabilityInput {
  toriiUrl: Ref<string>;
  accountId: Ref<string>;
  assetDefinitionId: Ref<string>;
  shielded: Ref<boolean>;
  translate?: (key: string, params?: Record<string, string | number>) => string;
  onResolvedAssetDefinitionId?: (assetDefinitionId: string) => void;
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
  accountId,
  assetDefinitionId,
  shielded,
  translate = fallbackTranslate,
  onResolvedAssetDefinitionId,
}: UseShieldCapabilityInput) => {
  const shieldCapabilityReady = ref(false);
  const shieldSupported = ref(true);
  const shieldCapabilityMessage = ref("");
  const shieldPolicyMode = ref("");
  const shieldResolvedAssetId = ref("");
  let refreshRevision = 0;

  const refreshShieldCapability = async () => {
    const revision = ++refreshRevision;
    shieldCapabilityReady.value = false;
    shieldPolicyMode.value = "";
    shieldCapabilityMessage.value = "";
    shieldResolvedAssetId.value = "";
    shieldSupported.value = true;

    const normalizedToriiUrl = toriiUrl.value.trim();
    const normalizedAccountId = accountId.value.trim();
    const normalizedAssetDefinitionId = assetDefinitionId.value.trim();
    if (
      !normalizedToriiUrl ||
      !normalizedAccountId ||
      !normalizedAssetDefinitionId
    ) {
      shieldCapabilityReady.value = true;
      return;
    }

    try {
      const policy = await getConfidentialAssetPolicy({
        toriiUrl: normalizedToriiUrl,
        accountId: normalizedAccountId,
        assetDefinitionId: normalizedAssetDefinitionId,
      });
      if (revision !== refreshRevision) {
        return;
      }
      const resolvedAssetDefinitionId =
        String(policy.asset_id ?? "").trim() || normalizedAssetDefinitionId;
      shieldResolvedAssetId.value = resolvedAssetDefinitionId;
      if (resolvedAssetDefinitionId) {
        onResolvedAssetDefinitionId?.(resolvedAssetDefinitionId);
      }
      const effectiveMode = policy.effective_mode || policy.current_mode;
      shieldPolicyMode.value = effectiveMode;
      shieldCapabilityReady.value = true;
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
      shieldCapabilityReady.value = true;
      const message =
        error instanceof Error ? sanitizeErrorMessage(error.message) : "";
      const policyMissingForAsset =
        /\bstatus 404\b/i.test(message) ||
        /\b404\b[^(]*\(\s*not found\s*\)/i.test(message);
      if (policyMissingForAsset) {
        shieldSupported.value = false;
        shielded.value = false;
        shieldCapabilityMessage.value = translate(
          "Shield mode is unavailable for the current asset definition.",
        );
        return;
      }
      shieldSupported.value = true;
      shieldCapabilityMessage.value = message
        ? translate(
            "Shield policy check failed: {message}. Submission may still fail if shield mode is unsupported.",
            { message },
          )
        : translate(
            "Shield policy check failed. Submission may still fail if shield mode is unsupported.",
          );
    }
  };

  watch(
    () => [toriiUrl.value, accountId.value, assetDefinitionId.value],
    () => {
      void refreshShieldCapability();
    },
    { immediate: true },
  );

  return {
    shieldCapabilityReady,
    shieldSupported,
    shieldCapabilityMessage,
    shieldPolicyMode,
    shieldResolvedAssetId,
    refreshShieldCapability,
  };
};
