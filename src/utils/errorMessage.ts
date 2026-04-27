import { formatOpaqueAssetLiteralsInText } from "./assetId";

const READABLE_ERROR_ANCHOR =
  /\b(invalid|missing|unsupported|expected|forbidden|bad request|internal server error|too many requests|not found|already|failed|failure|timed out|timeout|unavailable|disabled|denied|required|must|rejected|malformed|unknown)\b/i;
const ERROR_CODE_PREFIX = /^(ERR_[A-Z0-9_]+)\s*[—\-:]\s*(.+)$/i;
const REPLACEMENT_CHARACTER = "\uFFFD";
const CHAIN_ID_MISMATCH =
  /Chain id doesn't correspond to the id of current blockchain:\s*Expected ChainId\("([^"]+)"\),\s*actual ChainId\("([^"]+)"\)/i;

const formatChainIdMismatch = (value: string) => {
  const match = CHAIN_ID_MISMATCH.exec(value);
  if (!match) {
    return "";
  }
  const [, expected, actual] = match;
  return `Torii endpoint chain id mismatch: endpoint expects "${expected}", but the app signed for "${actual}". Open Settings and use Check & Save for this endpoint before sending.`;
};

const containsControlChars = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 8) || (code >= 14 && code <= 31);
  });

const stripControlChars = (value: string) =>
  Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !((code >= 0 && code <= 8) || (code >= 14 && code <= 31));
    })
    .join("");

const hasUnreadablePrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed.includes(REPLACEMENT_CHARACTER) || containsControlChars(trimmed)
  );
};

export const sanitizeErrorMessage = (value: unknown) => {
  let text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  text = stripControlChars(text).replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  const chainIdMismatch = formatChainIdMismatch(text);
  if (chainIdMismatch) {
    return chainIdMismatch;
  }

  const prefixedMatch = ERROR_CODE_PREFIX.exec(text);
  if (prefixedMatch) {
    const [, code, remainderRaw] = prefixedMatch;
    const remainder = remainderRaw.trim();
    const anchorMatch = READABLE_ERROR_ANCHOR.exec(remainder);
    if (
      anchorMatch &&
      typeof anchorMatch.index === "number" &&
      anchorMatch.index > 0 &&
      hasUnreadablePrefix(remainder.slice(0, anchorMatch.index))
    ) {
      return formatOpaqueAssetLiteralsInText(
        `${code} — ${remainder.slice(anchorMatch.index).trim()}`,
      );
    }
    return formatOpaqueAssetLiteralsInText(`${code} — ${remainder}`);
  }

  const anchorMatch = READABLE_ERROR_ANCHOR.exec(text);
  if (
    anchorMatch &&
    typeof anchorMatch.index === "number" &&
    anchorMatch.index > 0 &&
    hasUnreadablePrefix(text.slice(0, anchorMatch.index))
  ) {
    return formatOpaqueAssetLiteralsInText(
      text.slice(anchorMatch.index).trim(),
    );
  }

  return formatOpaqueAssetLiteralsInText(text);
};

export const toUserFacingErrorMessage = (error: unknown, fallback = "") => {
  const message =
    error instanceof Error ? error.message : String(error ?? "").trim();
  return sanitizeErrorMessage(message) || fallback;
};
