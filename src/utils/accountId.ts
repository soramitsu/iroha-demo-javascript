type AccountIdentity = {
  displayName?: string;
  accountId?: string;
  i105AccountId?: string;
  i105DefaultAccountId?: string;
};

const trimString = (value: unknown) => String(value ?? "").trim();

export const getPublicAccountId = (
  account: AccountIdentity | null | undefined,
) => {
  return (
    [
      trimString(account?.i105DefaultAccountId),
      trimString(account?.i105AccountId),
      trimString(account?.accountId),
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
