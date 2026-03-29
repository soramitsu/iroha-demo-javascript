import { normalizeAccountId } from "@iroha/iroha-js";

export function parseNetworkPrefix(rawValue) {
  if (!rawValue) return 369;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x3fff) {
    throw new Error("E2E_NETWORK_PREFIX must be an integer from 0 to 16383.");
  }
  return parsed;
}

export function isSupportedAccountIdLiteral(value) {
  const accountId = String(value ?? "").trim();
  if (!accountId) return false;
  try {
    normalizeAccountId(accountId, "accountId");
    return true;
  } catch {
    return false;
  }
}

export function isOnboardingDisabledError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+403\b/i.test(String(detail ?? ""));
}

export function isOnboardingConflictError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+409\b/i.test(String(detail ?? ""));
}

export function resolveOptionalAliasRegistrationOutcome(status, detail) {
  const normalizedStatus = String(status ?? "")
    .trim()
    .toLowerCase();
  const normalizedDetail = String(detail ?? "");
  if (normalizedStatus !== "error") {
    return "executed";
  }
  if (isOnboardingDisabledError(normalizedDetail)) {
    return "skipped";
  }
  if (isOnboardingConflictError(normalizedDetail)) {
    return "executed";
  }
  throw new Error(
    `Optional alias registration probe failed: ${normalizedDetail || "unknown error"}`,
  );
}

const defaultOnboardingAlias = "E2E Onboarding Shared";
const defaultOnboardingPrivateKeyHex =
  "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7";
const defaultOnboardingOfflineBalance = "100";
const deprecatedOnboardingEnvVarMap = {
  E2E_STATEFUL_ALIAS: "E2E_ONBOARDING_ALIAS",
  E2E_STATEFUL_PRIVATE_KEY_HEX: "E2E_ONBOARDING_PRIVATE_KEY_HEX",
  E2E_STATEFUL_OFFLINE_BALANCE: "E2E_ONBOARDING_OFFLINE_BALANCE",
};
const deprecatedOnboardingEnvVarNames = Object.keys(
  deprecatedOnboardingEnvVarMap,
);

export function parseOnboardingEnvConfig(env = process.env) {
  const deprecated = deprecatedOnboardingEnvVarNames.filter((name) =>
    String(env?.[name] ?? "").trim(),
  );
  if (deprecated.length) {
    const renameGuide = deprecated
      .map((name) => `${name} -> ${deprecatedOnboardingEnvVarMap[name]}`)
      .join(", ");
    throw new Error(
      `Deprecated onboarding env vars are no longer supported: ${deprecated.join(
        ", ",
      )}. Rename to: ${renameGuide}.`,
    );
  }

  const alias =
    String(env?.E2E_ONBOARDING_ALIAS ?? "").trim() || defaultOnboardingAlias;
  const privateKeyHex = (
    String(env?.E2E_ONBOARDING_PRIVATE_KEY_HEX ?? "").trim() ||
    defaultOnboardingPrivateKeyHex
  ).toLowerCase();
  const offlineBalance =
    String(env?.E2E_ONBOARDING_OFFLINE_BALANCE ?? "").trim() ||
    defaultOnboardingOfflineBalance;

  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error(
      "E2E_ONBOARDING_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
    );
  }
  if (!Number.isFinite(Number(offlineBalance)) || Number(offlineBalance) <= 0) {
    throw new Error(
      "E2E_ONBOARDING_OFFLINE_BALANCE must be a positive numeric string.",
    );
  }

  return {
    alias,
    privateKeyHex,
    offlineBalance,
  };
}
