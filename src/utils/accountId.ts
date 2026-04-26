type AccountIdentity = {
  displayName?: string;
  accountId?: string;
  i105AccountId?: string;
  i105DefaultAccountId?: string;
};

const trimString = (value: unknown) => String(value ?? "").trim();
const TAIRA_NETWORK_PREFIX = 369;
const SORA_NETWORK_PREFIX = 753;
const DEFAULT_NETWORK_PREFIX = SORA_NETWORK_PREFIX;
const SORA_I105_PREFIX = "sorau";
const SORA_I105_FULLWIDTH_PREFIX = "ｓｏｒａu";
const TAIRA_I105_PREFIX = "testu";
const GENERIC_I105_PREFIX_RE = /^n\d{1,4}u/;

const renderI105PrefixForNetwork = (networkPrefix = DEFAULT_NETWORK_PREFIX) => {
  if (networkPrefix === SORA_NETWORK_PREFIX) {
    return SORA_I105_PREFIX;
  }
  if (networkPrefix === TAIRA_NETWORK_PREFIX) {
    return TAIRA_I105_PREFIX;
  }
  return `n${networkPrefix}u`;
};

export const normalizeAccountIdLiteralForNetwork = (
  value: unknown,
  networkPrefix = DEFAULT_NETWORK_PREFIX,
) => {
  const literal = trimString(value);
  if (!literal) {
    return "";
  }
  const replacementPrefix = renderI105PrefixForNetwork(networkPrefix);
  if (literal.startsWith(SORA_I105_PREFIX)) {
    return `${replacementPrefix}${literal.slice(SORA_I105_PREFIX.length)}`;
  }
  if (literal.startsWith(SORA_I105_FULLWIDTH_PREFIX)) {
    return `${replacementPrefix}${literal.slice(SORA_I105_FULLWIDTH_PREFIX.length)}`;
  }
  if (literal.startsWith(TAIRA_I105_PREFIX)) {
    return `${replacementPrefix}${literal.slice(TAIRA_I105_PREFIX.length)}`;
  }
  const genericMatch = literal.match(GENERIC_I105_PREFIX_RE);
  if (genericMatch) {
    return `${replacementPrefix}${literal.slice(genericMatch[0].length)}`;
  }
  return literal;
};

export const normalizeTairaAccountIdLiteral = (value: unknown) =>
  normalizeAccountIdLiteralForNetwork(value, TAIRA_NETWORK_PREFIX);

export const normalizeMainnetAccountIdLiteral = (value: unknown) =>
  normalizeAccountIdLiteralForNetwork(value, SORA_NETWORK_PREFIX);

export const getPublicAccountId = (
  account: AccountIdentity | null | undefined,
  networkPrefix = DEFAULT_NETWORK_PREFIX,
) => {
  return (
    [
      normalizeAccountIdLiteralForNetwork(
        account?.i105AccountId,
        networkPrefix,
      ),
      normalizeAccountIdLiteralForNetwork(
        account?.i105DefaultAccountId,
        networkPrefix,
      ),
      normalizeAccountIdLiteralForNetwork(account?.accountId, networkPrefix),
    ].find(Boolean) ?? ""
  );
};

export const getAccountDisplayLabel = (
  account: AccountIdentity | null | undefined,
  fallback = "",
  networkPrefix = DEFAULT_NETWORK_PREFIX,
) => {
  return (
    trimString(account?.displayName) ||
    getPublicAccountId(account, networkPrefix) ||
    fallback
  );
};
