/**
 * Release write profile for the public TAIRA testnet endpoint.
 *
 * TAIRA is reset periodically and every reset changes its genesis-derived
 * `NetworkId`, so no NetworkId is pinned here. The wallet derives it from the
 * endpoint at connection time and pins it per endpoint on first use; see
 * `src/utils/networkIdentity.ts`.
 */
export const TAIRA_TORII_URL = "https://taira.sora.org";
export const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_NETWORK_PREFIX = 369;
