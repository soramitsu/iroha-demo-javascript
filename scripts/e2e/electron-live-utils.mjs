export function parseNetworkPrefix(rawValue) {
  if (!rawValue) return 42;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error("E2E_NETWORK_PREFIX must be an integer from 0 to 255.");
  }
  return parsed;
}

export function isSupportedAccountIdLiteral(value) {
  const accountId = String(value ?? "").trim();
  if (!accountId) return false;
  if (/^(ih58|sora|uaid|opaque):/i.test(accountId)) return true;
  if (/^0x[0-9a-f]+@[^@\s]+$/i.test(accountId)) return true;
  return /^[^@\s]+@[^@\s]+$/.test(accountId);
}

export function isOnboardingDisabledError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+403\b/i.test(String(detail ?? ""));
}

export function isOnboardingConflictError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+409\b/i.test(String(detail ?? ""));
}
