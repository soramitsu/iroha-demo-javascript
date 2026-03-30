export type ParsedAssetReference = {
  definitionId: string;
  accountId: string;
};

const NORITO_PREFIX = "norito:";
const OPAQUE_PREVIEW_HEAD = 8;
const OPAQUE_PREVIEW_TAIL = 8;
const OPAQUE_ASSET_LITERAL_PATTERN = /\bnorito:[A-Za-z0-9._:@#-]+/gi;

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
  return shortenOpaqueAssetLiteral(definitionId) || fallback;
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

export const formatOpaqueAssetLiteralsInText = (
  value: string | null | undefined,
) =>
  String(value ?? "").replace(
    OPAQUE_ASSET_LITERAL_PATTERN,
    (literal) => formatAssetReferenceLabel(literal, literal) || literal,
  );
