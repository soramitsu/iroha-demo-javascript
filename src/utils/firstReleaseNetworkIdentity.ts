/**
 * Release write profile for the public TAIRA testnet endpoint.
 *
 * TAIRA is reset periodically and every reset changes its genesis-derived
 * `NetworkId`, so no NetworkId is pinned here. The wallet derives it from the
 * endpoint at connection time and automatically accepts a new identity when
 * both public sources agree after a reset; see `src/utils/networkIdentity.ts`.
 */
export const TAIRA_TORII_URL = "https://taira.sora.org";
export const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_NETWORK_PREFIX = 369;

/** Only the official testnet origin and prefix permit automatic hash refresh. */
export const isTairaTestnetEndpoint = (
  toriiUrl: string,
  networkPrefix: number,
): boolean =>
  toriiUrl === TAIRA_TORII_URL && networkPrefix === TAIRA_NETWORK_PREFIX;
