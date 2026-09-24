export const TAIRA_TORII_URL = "https://taira.sora.org";
export const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_NETWORK_PREFIX = 369;
// Release-reviewed sibling deployment identity. Endpoint inspection must also
// observe this exact block-one hash; a public reset is read-only until the
// sibling deployment artifacts and this pin are reviewed together.
export const TAIRA_GENESIS_HASH =
  "82531ce8eae8bff6beeca4698bfd13a3bc8bec5f0ee0d23d428c97fc17ab0f3b";
export const TAIRA_NETWORK_ID =
  "hash:82531CE8EAE8BFF6BEECA4698BFD13A3BC8BEC5F0EE0D23D428C97FC17AB0F3B#3E94";

/**
 * Resolve a human-facing configured profile to its independently pinned
 * genesis-derived identity. Profiles without a reviewed NetworkId remain
 * unable to participate in signed first-release protocols.
 */
export const resolveFirstReleaseNetworkIdLiteral = (input: {
  chainId: string;
  networkPrefix: number;
}): string => {
  if (
    input.chainId === TAIRA_CHAIN_ID &&
    input.networkPrefix === TAIRA_NETWORK_PREFIX
  ) {
    return TAIRA_NETWORK_ID;
  }
  throw new Error(
    "This release has no exact genesis-derived NetworkId pinned for the selected network identity.",
  );
};
