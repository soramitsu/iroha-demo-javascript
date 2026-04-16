import { blake3 } from "@noble/hashes/blake3.js";

export type ParsedAssetReference = {
  definitionId: string;
  accountId: string;
};

const NORITO_PREFIX = "norito:";
const NORITO_HEX_BODY_PATTERN = /^[0-9a-f]+$/i;
const ACCOUNT_REFERENCE_PATTERN = /^(?:[^#@]+@[^#]+|testu.+|sorau.+|ｓｏｒａu.+|n\d{1,4}u.+)$/u;
const OPAQUE_PREVIEW_HEAD = 8;
const OPAQUE_PREVIEW_TAIL = 8;
const OPAQUE_ASSET_LITERAL_PATTERN = /\bnorito:[A-Za-z0-9._:@#-]+/gi;
const ASSET_DEFINITION_ADDRESS_VERSION = 1;
const ASSET_DEFINITION_ADDRESS_LEN = 21;
const BARE_ASSET_DEFINITION_LEN = 16;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const splitAssetReference = (
  value: string | null | undefined,
): ParsedAssetReference => {
  const literal = String(value ?? "").trim();
  if (!literal) {
    return { definitionId: "", accountId: "" };
  }

  if (literal.includes("##")) {
    const [definitionId, ...accountTail] = literal.split("##");
    return {
      definitionId: (definitionId ?? "").trim(),
      accountId: accountTail.join("##").trim(),
    };
  }

  const hashParts = literal.split("#");
  if (hashParts.length === 2) {
    const [definitionId, accountId] = hashParts;
    const normalizedAccountId = (accountId ?? "").trim();
    if (ACCOUNT_REFERENCE_PATTERN.test(normalizedAccountId)) {
      return {
        definitionId: (definitionId ?? "").trim(),
        accountId: normalizedAccountId,
      };
    }
  }

  if (hashParts.length >= 3) {
    return {
      definitionId: hashParts.slice(0, 2).join("#"),
      accountId: hashParts.slice(2).join("#"),
    };
  }

  return { definitionId: literal, accountId: "" };
};

export const extractAssetDefinitionId = (
  value: string | null | undefined,
): string => splitAssetReference(value).definitionId;

const parseHexBytes = (value: string) => {
  const literal = value.trim();
  if (
    !literal ||
    literal.length % 2 !== 0 ||
    !NORITO_HEX_BODY_PATTERN.test(literal)
  ) {
    return null;
  }

  const out = new Uint8Array(literal.length / 2);
  for (let index = 0; index < literal.length; index += 2) {
    const byte = Number.parseInt(literal.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    out[index / 2] = byte;
  }
  return out;
};

const encodeBase58 = (bytes: Uint8Array) => {
  if (!bytes.length) {
    return "";
  }

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index]! * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeroCount = 0;
  while (leadingZeroCount < bytes.length && bytes[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }

  let out = "1".repeat(leadingZeroCount);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    out += BASE58_ALPHABET[digits[index]!]!;
  }
  return out;
};

export const decodeNoritoAssetDefinitionId = (
  value: string | null | undefined,
) => {
  const definitionId = extractAssetDefinitionId(value);
  if (!isNoritoAssetDefinitionId(definitionId)) {
    return null;
  }

  const bodyHex = definitionId.slice(NORITO_PREFIX.length);
  const bareBytes = parseHexBytes(bodyHex);
  if (!bareBytes || bareBytes.length !== BARE_ASSET_DEFINITION_LEN) {
    return null;
  }

  const payload = new Uint8Array(ASSET_DEFINITION_ADDRESS_LEN);
  payload[0] = ASSET_DEFINITION_ADDRESS_VERSION;
  payload.set(bareBytes, 1);
  payload.set(blake3(payload.slice(0, 17)).slice(0, 4), 17);
  return encodeBase58(payload);
};

const normalizeComparableAssetDefinitionId = (
  value: string | null | undefined,
) => {
  const definitionId = extractAssetDefinitionId(value).trim();
  if (!definitionId) {
    return "";
  }
  return (
    decodeNoritoAssetDefinitionId(definitionId)?.trim().toLowerCase() ||
    definitionId.toLowerCase()
  );
};

export const areAssetDefinitionIdsEquivalent = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const normalizedLeft = extractAssetDefinitionId(left).trim();
  const normalizedRight = extractAssetDefinitionId(right).trim();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()) {
    return true;
  }
  return (
    normalizeComparableAssetDefinitionId(normalizedLeft) ===
    normalizeComparableAssetDefinitionId(normalizedRight)
  );
};

const shortenOpaqueAssetLiteral = (value: string) => {
  const literal = value.trim();
  if (!literal) {
    return "";
  }
  const body = literal.startsWith(NORITO_PREFIX)
    ? literal.slice(NORITO_PREFIX.length)
    : literal;
  if (body.length <= 12) {
    return body;
  }
  return `${body.slice(0, OPAQUE_PREVIEW_HEAD)}...${body.slice(
    -OPAQUE_PREVIEW_TAIL,
  )}`;
};

export const isNoritoAssetDefinitionId = (value: string | null | undefined) =>
  extractAssetDefinitionId(value)
    .trim()
    .toLowerCase()
    .startsWith(NORITO_PREFIX);

const SYMBOL_PATTERN = /^[a-z0-9._-]{1,16}$/i;

export const deriveAssetSymbol = (
  value: string | null | undefined,
  fallback = "ASSET",
) => {
  const definitionId = extractAssetDefinitionId(value);
  if (!definitionId) {
    return fallback;
  }

  const normalized = definitionId.toLowerCase();
  if (normalized.includes("xor")) {
    return "XOR";
  }
  if (normalized.startsWith("norito:")) {
    return fallback;
  }

  const legacySymbol = definitionId.split("#")[0]?.trim();
  if (legacySymbol && SYMBOL_PATTERN.test(legacySymbol)) {
    return legacySymbol.toUpperCase();
  }

  const namespaceSymbol = definitionId.split(":")[0]?.trim();
  if (namespaceSymbol && SYMBOL_PATTERN.test(namespaceSymbol)) {
    return namespaceSymbol.toUpperCase();
  }

  if (SYMBOL_PATTERN.test(definitionId)) {
    return definitionId.toUpperCase();
  }

  return fallback;
};

export const formatAssetDefinitionLabel = (
  value: string | null | undefined,
  fallback = "—",
) => {
  const definitionId = extractAssetDefinitionId(value);
  if (!definitionId) {
    return fallback;
  }
  if (!isNoritoAssetDefinitionId(definitionId)) {
    return definitionId;
  }
  return (
    decodeNoritoAssetDefinitionId(definitionId) ||
    shortenOpaqueAssetLiteral(definitionId) ||
    fallback
  );
};

export const formatAssetReferenceLabel = (
  value: string | null | undefined,
  fallback = "—",
) => {
  const literal = String(value ?? "").trim();
  if (!literal) {
    return fallback;
  }
  if (!isNoritoAssetDefinitionId(literal)) {
    return literal;
  }
  const { definitionId, accountId } = splitAssetReference(literal);
  const definitionLabel = formatAssetDefinitionLabel(definitionId, fallback);
  return accountId ? `${definitionLabel} | ${accountId}` : definitionLabel;
};

export const resolveToriiXorAsset = (
  assets: Array<{ asset_id: string; quantity: string }>,
  preferredAssetDefinitionIds: Array<string | null | undefined> = [],
) => {
  const normalizedPreferredDefinitionIds = new Set(
    preferredAssetDefinitionIds
      .map((value) => extractAssetDefinitionId(value).trim().toLowerCase())
      .filter(Boolean),
  );
  const rankedAssets = assets
    .map((asset, index) => {
      const assetId = String(asset.asset_id ?? "").trim();
      const definitionId = extractAssetDefinitionId(assetId).trim().toLowerCase();
      if (!assetId || !definitionId) {
        return null;
      }

      const quantity = Number(String(asset.quantity ?? "").trim());
      const quantityScore =
        Number.isFinite(quantity) && quantity > 0
          ? Math.min(quantity, 1_000_000)
          : 0;
      const isPreferred = normalizedPreferredDefinitionIds.has(definitionId);
      const isExplicitXor = definitionId.startsWith("xor#");
      const isXorLike = !isExplicitXor && definitionId.includes("xor");

      let score = quantityScore;
      if (isPreferred) {
        score += 1_000_000;
      } else if (isExplicitXor) {
        score += 100_000;
      } else if (isXorLike) {
        score += 50_000;
      }

      return {
        asset,
        index,
        score,
        isPositive: quantityScore > 0,
        isXorCandidate: isPreferred || isExplicitXor || isXorLike,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const liveXorAsset = rankedAssets
    .filter((entry) => entry.isXorCandidate)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.isPositive) - Number(left.isPositive) ||
        left.index - right.index,
    )[0];
  if (liveXorAsset) {
    return liveXorAsset.asset;
  }

  const positiveAsset = rankedAssets
    .filter((entry) => entry.isPositive)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return positiveAsset?.asset ?? rankedAssets[0]?.asset ?? null;
};

export const shouldReplaceConfiguredAssetDefinitionId = (input: {
  configuredAssetDefinitionId: string | null | undefined;
  detectedAssetDefinitionId: string | null | undefined;
  knownAssetIds?: Array<string | null | undefined>;
}) => {
  const configured = extractAssetDefinitionId(
    input.configuredAssetDefinitionId,
  ).trim();
  const detected = extractAssetDefinitionId(
    input.detectedAssetDefinitionId,
  ).trim();
  if (!detected) {
    return false;
  }

  if (areAssetDefinitionIdsEquivalent(configured, detected)) {
    return false;
  }
  if (!configured) {
    return true;
  }

  const configuredLooksLegacy = configured.includes("#");
  const comparableConfigured = normalizeComparableAssetDefinitionId(configured);
  const comparableDetected = normalizeComparableAssetDefinitionId(detected);
  const knownAssetDefinitionIds = new Set(
    (input.knownAssetIds ?? [])
      .map((value) => normalizeComparableAssetDefinitionId(value))
      .filter(Boolean),
  );
  if (knownAssetDefinitionIds.size > 0) {
    if (!knownAssetDefinitionIds.has(comparableDetected)) {
      return false;
    }
    if (configuredLooksLegacy) {
      return true;
    }
    return !knownAssetDefinitionIds.has(comparableConfigured);
  }

  return configuredLooksLegacy;
};

export const formatOpaqueAssetLiteralsInText = (
  value: string | null | undefined,
) =>
  String(value ?? "").replace(
    OPAQUE_ASSET_LITERAL_PATTERN,
    (literal) => formatAssetReferenceLabel(literal, literal) || literal,
  );
