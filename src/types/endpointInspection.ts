export type EndpointIdentityStatus =
  | "matched"
  | "mismatched"
  | "blocked"
  | "conflicting"
  | "unverified"
  | "unreachable";

export type EndpointAccessMode = "read-write" | "read-only" | "offline";

export type EndpointFeature =
  | "accountRegistration"
  | "accountOnboarding"
  | "assetTransfers"
  | "faucetClaim"
  | "confidentialTransfers"
  | "kaigiMeetings"
  | "governanceWrites"
  | "stakingWrites"
  | "subscriptionWrites"
  | "soraCloudDeploy"
  | "vpnSessions"
  | "irohaConnectSessions"
  | "zkProofJobs";

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
  | "governance-capabilities-v1"
  | "chain-metadata"
  | "response-headers"
  | "blocked-deployment-fingerprint";

export interface EndpointNetworkContext {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}

export interface EndpointChainIdentity {
  chainId: string;
  networkPrefix: number;
  genesisHash?: string;
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
    | "endpoint_deployment_blocked"
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
  features: EndpointFeatureMap;
  diagnostic: EndpointDiagnostic;
}

export type EndpointInspectionState = "idle" | "checking" | "ready";
