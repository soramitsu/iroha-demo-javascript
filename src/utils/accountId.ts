type AccountIdentity = {
  displayName?: string;
  accountId?: string;
  i105AccountId?: string;
  i105DefaultAccountId?: string;
};

const TAIRA_NETWORK_PREFIX = 369;
const SORA_NETWORK_PREFIX = 753;

const requireNetworkPrefix = (value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > 0x3fff) {
    throw new TypeError(
      "networkPrefix must be an integer between 0 and 16383.",
    );
  }
  return value;
};

const i105PrefixForNetwork = (networkPrefix: number): string => {
  if (networkPrefix === SORA_NETWORK_PREFIX) {
    return "sorau";
  }
  if (networkPrefix === TAIRA_NETWORK_PREFIX) {
    return "testu";
  }
  return `n${networkPrefix}u`;
};

/**
 * Accept an account literal only when it already targets the requested
 * network. An I105 address is checksummed; replacing its visible prefix does
 * not produce another valid address. Re-rendering belongs at the trusted SDK
 * boundary where canonical address bytes are available.
 */
export const normalizeAccountIdLiteralForNetwork = (
  value: unknown,
  networkPrefix: number,
): string => {
  requireNetworkPrefix(networkPrefix);
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 1_024 ||
    /\s/u.test(value)
  ) {
    return "";
  }
  return value.startsWith(i105PrefixForNetwork(networkPrefix)) ? value : "";
};

export const getPublicAccountId = (
  account: AccountIdentity | null | undefined,
  networkPrefix: number,
): string =>
  [account?.i105AccountId, account?.accountId, account?.i105DefaultAccountId]
    .map((candidate) =>
      normalizeAccountIdLiteralForNetwork(candidate, networkPrefix),
    )
    .find(Boolean) ?? "";

export const getAccountDisplayLabel = (
  account: AccountIdentity | null | undefined,
  fallback: string,
  networkPrefix: number,
): string => {
  const displayName =
    typeof account?.displayName === "string" ? account.displayName.trim() : "";
  return displayName || getPublicAccountId(account, networkPrefix) || fallback;
};
