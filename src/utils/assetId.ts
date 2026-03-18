export type ParsedAssetReference = {
  definitionId: string;
  accountId: string;
};

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
