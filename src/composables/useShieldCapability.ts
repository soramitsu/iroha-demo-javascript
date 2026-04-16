import { ref, watch, type Ref } from "vue";
import { getConfidentialAssetPolicy } from "@/services/iroha";
import { confidentialModeSupportsShield } from "@/utils/confidential";
import { sanitizeErrorMessage } from "@/utils/errorMessage";

export type ConfidentialCapabilityOperation =
  | "selfShield"
  | "shieldedTransfer"
  | "unshield";

interface UseShieldCapabilityInput {
  toriiUrl: Ref<string>;
  accountId: Ref<string>;
  assetDefinitionId: Ref<string>;
  shielded: Ref<boolean>;
  operation?: ConfidentialCapabilityOperation;
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

const normalizeMode = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const confidentialModeSupportsUnshield = (
  mode: string | null | undefined,
): boolean => {
  const normalized = normalizeMode(mode);
  return (
    normalized === "convertible" ||
    normalized === "hybrid" ||
    normalized === "zknative"
  );
};

const hasVerifierBinding = (value: string | null | undefined) =>
  /^[^:]+::.+$/.test(String(value ?? "").trim());

const operationLabelByKey: Record<ConfidentialCapabilityOperation, string> = {
  selfShield: "Self-shield",
  shieldedTransfer: "Shielded send",
  unshield: "Unshield",
};

export const useShieldCapability = ({
  toriiUrl,
  accountId,
  assetDefinitionId,
  shielded,
  operation = "selfShield",
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
      const operationLabel = operationLabelByKey[operation];
      let supported = true;
      let unsupportedMessage = "";

      if (operation === "selfShield") {
        if (!confidentialModeSupportsShield(effectiveMode)) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is unavailable: effective policy mode is {mode}.",
            {
              operation: operationLabel,
              mode: effectiveMode,
            },
          );
        } else if (policy.allow_shield === false) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is disabled by the asset policy.",
            { operation: operationLabel },
          );
        }
      } else if (operation === "shieldedTransfer") {
        if (!confidentialModeSupportsShield(effectiveMode)) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is unavailable: effective policy mode is {mode}.",
            {
              operation: operationLabel,
              mode: effectiveMode,
            },
          );
        } else if (!hasVerifierBinding(policy.vk_transfer)) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is unavailable because the asset policy is missing vk_transfer.",
            { operation: operationLabel },
          );
        }
      } else if (operation === "unshield") {
        if (!confidentialModeSupportsUnshield(effectiveMode)) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is unavailable: effective policy mode is {mode}.",
            {
              operation: operationLabel,
              mode: effectiveMode,
            },
          );
        } else if (policy.allow_unshield === false) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is disabled by the asset policy.",
            { operation: operationLabel },
          );
        } else if (!hasVerifierBinding(policy.vk_unshield)) {
          supported = false;
          unsupportedMessage = translate(
            "{operation} is unavailable because the asset policy is missing vk_unshield.",
            { operation: operationLabel },
          );
        }
      }

      if (!supported) {
        shieldSupported.value = false;
        shielded.value = false;
        shieldCapabilityMessage.value = unsupportedMessage;
      }
    } catch (error) {
      if (revision !== refreshRevision) {
        return;
      }
      shieldCapabilityReady.value = true;
      const operationLabel = operationLabelByKey[operation];
      const message =
        error instanceof Error ? sanitizeErrorMessage(error.message) : "";
      const policyMissingForAsset =
        /\bstatus 404\b/i.test(message) ||
        /\b404\b[^(]*\(\s*not found\s*\)/i.test(message);
      if (policyMissingForAsset) {
        shieldSupported.value = false;
        shielded.value = false;
        shieldCapabilityMessage.value = translate(
          "{operation} is unavailable for the current asset definition.",
          { operation: operationLabel },
        );
        return;
      }
      shieldSupported.value = true;
      shieldCapabilityMessage.value = message
        ? translate(
            "{operation} policy check failed: {message}. Submission may still fail if the current asset policy does not allow it.",
            { operation: operationLabel, message },
          )
        : translate(
            "{operation} policy check failed. Submission may still fail if the current asset policy does not allow it.",
            { operation: operationLabel },
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
