import { formatOpaqueAssetLiteralsInText } from "./assetId";

const READABLE_ERROR_ANCHOR =
  /\b(invalid|missing|unsupported|expected|forbidden|bad request|internal server error|too many requests|not found|no authoritative peer binding|already|failed|failure|timed out|timeout|unavailable|disabled|denied|required|must|rejected|malformed|unknown)\b/i;
const ERROR_CODE_PREFIX = /^(ERR_[A-Z0-9_]+)\s*[—\-:]\s*(.+)$/i;
const GENERIC_ERROR_CODE_PREFIX =
  /^([a-z][a-z0-9]*_[a-z0-9_]*[a-z0-9])\s*[—\-:]\s*(.+)$/i;
const REPLACEMENT_CHARACTER = "\uFFFD";
const HTML_ERROR_MARKUP =
  /<!doctype\s+html\b|<html\b|<head\b|<body\b|<title\b|<h[1-6]\b/i;
const HTML_ENTITY_PATTERN =
  /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi;
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

const decodeBasicHtmlEntities = (value: string) =>
  value.replace(HTML_ENTITY_PATTERN, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    if (normalized.startsWith("#")) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    switch (normalized) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      case "nbsp":
        return " ";
      default:
        return match;
    }
  });

const stripHtmlTags = (value: string) =>
  decodeBasicHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

const readHtmlElementText = (html: string, tagName: string) => {
  const match = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  ).exec(html);
  return match ? stripHtmlTags(match[1] ?? "") : "";
};

const extractHtmlErrorMessage = (value: string) => {
  if (!HTML_ERROR_MARKUP.test(value)) {
    return "";
  }
  return (
    readHtmlElementText(value, "title") ||
    readHtmlElementText(value, "h1") ||
    stripHtmlTags(value)
  );
};

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

  const htmlErrorMessage = extractHtmlErrorMessage(text);
  if (htmlErrorMessage) {
    text = htmlErrorMessage;
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

  const genericPrefixedMatch = GENERIC_ERROR_CODE_PREFIX.exec(text);
  if (genericPrefixedMatch) {
    const [, code, remainderRaw] = genericPrefixedMatch;
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
