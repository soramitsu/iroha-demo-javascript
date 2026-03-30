type AccountIdentity = {
  displayName?: string;
  accountId?: string;
  i105AccountId?: string;
  i105DefaultAccountId?: string;
};

const trimString = (value: unknown) => String(value ?? "").trim();
const SORA_I105_PREFIX = "sorau";
const SORA_I105_FULLWIDTH_PREFIX = "ｓｏｒａu";
const TAIRA_I105_PREFIX = "testu";

export const normalizeTairaAccountIdLiteral = (value: unknown) => {
  const literal = trimString(value);
  if (!literal) {
    return "";
  }
  if (literal.startsWith(SORA_I105_PREFIX)) {
    return `${TAIRA_I105_PREFIX}${literal.slice(SORA_I105_PREFIX.length)}`;
  }
  if (literal.startsWith(SORA_I105_FULLWIDTH_PREFIX)) {
    return `${TAIRA_I105_PREFIX}${literal.slice(SORA_I105_FULLWIDTH_PREFIX.length)}`;
  }
  return literal;
};

export const getPublicAccountId = (
  account: AccountIdentity | null | undefined,
) => {
  return (
    [
      normalizeTairaAccountIdLiteral(account?.i105AccountId),
      normalizeTairaAccountIdLiteral(account?.i105DefaultAccountId),
      normalizeTairaAccountIdLiteral(account?.accountId),
    ].find(Boolean) ?? ""
  );
};

export const getAccountDisplayLabel = (
  account: AccountIdentity | null | undefined,
  fallback = "",
) => {
  return (
    trimString(account?.displayName) || getPublicAccountId(account) || fallback
  );
};
