import type {
  EndpointInspection,
  EndpointNetworkIdentity,
} from "../../src/types/endpointInspection";
import type { NetworkIdentityPin } from "../../src/utils/networkIdentity";

/**
 * TAIRA identity observed after the 2026-10-11 reset. Tests use it only as a
 * realistic canonical literal; the wallet itself pins nothing at build time.
 */
export const TEST_TAIRA_NETWORK_ID =
  "hash:5C3E66C94E079079FF4FC46F59810B9C4EC7B2646DD45CE937831C0FDCE20C9B#44D9";
export const TEST_TAIRA_GENESIS_HASH =
  "5c3e66c94e079079ff4fc46f59810b9c4ec7b2646dd45ce937831c0fdce20c9b";
/** Identity observed before the reset (the former release pin). */
export const TEST_PREVIOUS_TAIRA_NETWORK_ID =
  "hash:82531CE8EAE8BFF6BEECA4698BFD13A3BC8BEC5F0EE0D23D428C97FC17AB0F3B#3E94";

export const testNetworkIdentityPin = (
  overrides: Partial<NetworkIdentityPin> = {},
): NetworkIdentityPin => ({
  schema: "iroha.wallet.network-identity-pin.v1",
  toriiUrl: "https://taira.sora.org",
  networkId: TEST_TAIRA_NETWORK_ID,
  networkPrefix: 369,
  confirmedAtMs: 1_700_000_000_000,
  confirmation: "first-use",
  ...overrides,
});

/** Pinned network identity block for a write-authorized TAIRA inspection. */
export const matchedNetworkIdentity = (
  networkId = TEST_TAIRA_NETWORK_ID,
): EndpointNetworkIdentity => ({
  state: "matches-pin",
  pinned: {
    networkId,
    networkPrefix: 369,
    confirmedAtMs: 1_700_000_000_000,
    confirmation: "first-use",
  },
  observedNetworkId: networkId,
});

export const unpinnedNetworkIdentity = (): EndpointNetworkIdentity => ({
  state: "unpinned",
  pinned: null,
  observedNetworkId: null,
});

/** Evidence entries for both public identity sources agreeing. */
export const agreeingIdentityEvidence = (
  input: {
    chainId?: string;
    networkPrefix?: number;
    networkId?: string;
    observedAtMs?: number;
  } = {},
): EndpointInspection["evidence"] => {
  const identity = {
    chainId: input.chainId ?? "fc56984b-2be7-431d-840e-21514d1883f0",
    networkPrefix: input.networkPrefix ?? 369,
    networkId: input.networkId ?? TEST_TAIRA_NETWORK_ID,
  };
  const observedAtMs = input.observedAtMs ?? 1_700_000_000_000;
  return [
    { source: "account-capabilities", identity, observedAtMs },
    { source: "genesis-block", identity: { ...identity }, observedAtMs },
  ];
};
