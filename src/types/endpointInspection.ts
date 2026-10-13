export type EndpointIdentityStatus =
  | "matched"
  | "mismatched"
  | "changed"
  | "conflicting"
  | "unverified"
  | "unreachable";

export type EndpointAccessMode = "read-write" | "read-only" | "offline";

export type EndpointFeature =
  | "accountRegistration"
  | "accountOnboarding"
  | "assetTransfers"
  | "faucetClaim"
  | "kaigiMeetings"
  | "governanceWrites"
  | "stakingWrites"
  | "subscriptionWrites"
  | "soraCloudHfSharedLease"
  | "vpnSessions"
  | "irohaConnectSessions";

export interface EndpointFeatureAvailability {
  supported: boolean;
  source: "openapi" | "unavailable";
  requiredOperations: string[];
  missingOperations: string[];
}

export type EndpointFeatureMap = Record<
  EndpointFeature,
  EndpointFeatureAvailability
>;

export type EndpointIdentityEvidenceSource =
  | "account-capabilities"
  | "genesis-block";

export interface EndpointNetworkContext {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}

export interface EndpointChainIdentity {
  /**
   * Wallet profile label. Current Torii does not publish a chain ID, so an
   * observed identity carries the configured label unchanged.
   */
  chainId: string;
  networkPrefix: number;
  /** Canonical checksummed `NetworkId` literal (the genesis block hash). */
  networkId?: string;
  /** Lowercase hex of the genesis hash bytes committed by `networkId`. */
  genesisHash?: string;
}

export type EndpointNetworkIdentityState =
  | "pinned-now"
  | "matches-pin"
  | "changed"
  | "unpinned";

export interface EndpointNetworkIdentityPinView {
  networkId: string;
  networkPrefix: number;
  confirmedAtMs: number;
  confirmation: "first-use" | "user-confirmed";
}

export interface EndpointNetworkIdentity {
  state: EndpointNetworkIdentityState;
  /** Identity persisted for this endpoint (after any first-use pin). */
  pinned: EndpointNetworkIdentityPinView | null;
  /** Identity both public sources currently agree on. */
  observedNetworkId: string | null;
}

export interface EndpointIdentityEvidence {
  source: EndpointIdentityEvidenceSource;
  identity: EndpointChainIdentity;
  observedAtMs: number;
}

export interface EndpointDiagnostic {
  code:
    | "endpoint_identity_matched"
    | "endpoint_identity_mismatch"
    | "endpoint_identity_changed"
    | "endpoint_identity_conflict"
    | "endpoint_identity_unverified"
    | "endpoint_unreachable";
  message: string;
}

export interface EndpointInspection {
  schema: "iroha.wallet.endpoint-inspection.v1";
  toriiUrl: string;
  expected: EndpointChainIdentity;
  observed: EndpointChainIdentity | null;
  identityStatus: EndpointIdentityStatus;
  accessMode: EndpointAccessMode;
  checkedAtMs: number;
  evidence: EndpointIdentityEvidence[];
  networkIdentity: EndpointNetworkIdentity;
  features: EndpointFeatureMap;
  diagnostic: EndpointDiagnostic;
}

export type EndpointInspectionState = "idle" | "checking" | "ready";
