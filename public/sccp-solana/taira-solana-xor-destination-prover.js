const ROUTE_ID = "taira_sol_xor";
const ASSET_KEY = "xor";
const SOLANA_NETWORK = "solana-testnet";
const SOLANA_GENESIS_HASH = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
const SOURCE_DOMAIN = 0;
const TARGET_DOMAIN = 3;
const PROOF_BACKEND = "solana-program-v1";
const DESTINATION_VERIFIER_PLAN = "SolanaProgramNativeRecursive";
const VERIFIER_TARGET = "SolanaProgram";
const FAIL_CLOSED_REASON =
  "Solana SCCP destination prover package is intentionally fail-closed until governed proof artifacts are published.";

const REQUIRED_ARTIFACTS = [
  {
    id: "governed-solana-source-proof-material",
    required: true,
    status: "missing",
    detail:
      "Publish reviewed Solana source verifier material with non-zero trust-anchor, consensus, message-inclusion, finality-policy, source-state, adapter-VK, and deployment-receipt hashes.",
    upstreamArtifactIds: [
      "governed-solana-source-adapter-engine-deployment",
      "governed-solana-source-verifier-material",
    ],
  },
  {
    id: "solana-native-recursive-verifier-linkage",
    required: true,
    status: "missing",
    detail:
      "Link the Solana verifier program to the native recursive verifier backend and remove the fail-closed admission sentinel before proof envelopes can mint.",
    upstreamArtifactIds: [
      "governed-solana-source-proof-material",
      "solana-verifier-immutable-programdata",
    ],
  },
  {
    id: "destination-proof-admission-material",
    required: true,
    status: "missing",
    detail:
      "Publish route-bound destination verifier/key hashes, canary proof evidence, and immutable ProgramData evidence for the deployed Solana verifier.",
    upstreamArtifactIds: [
      "finalized-solana-route-canary-transaction",
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
    ],
  },
  {
    id: "browser-destination-prover-package",
    required: true,
    status: "missing",
    detail:
      "Replace this placeholder module with a governed browser-safe destination prover package whose sidecar has productionProofsReady=true and a passing self-test.",
    upstreamArtifactIds: [
      "destination-proof-admission-material",
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
    ],
  },
];

const copyRequirements = () =>
  REQUIRED_ARTIFACTS.map((requirement) => ({
    ...requirement,
    ...(Array.isArray(requirement.upstreamArtifactIds)
      ? { upstreamArtifactIds: [...requirement.upstreamArtifactIds] }
      : {}),
  }));

export const solanaSccpDestinationProverMaterialRequirements = () => {
  const requiredArtifacts = copyRequirements();
  const missingArtifactIds = requiredArtifacts.map(({ id }) => id);
  return {
    schema: "iroha-demo-sccp-solana-prover-material-requirements/v1",
    routeId: ROUTE_ID,
    route_id: ROUTE_ID,
    assetKey: ASSET_KEY,
    asset_key: ASSET_KEY,
    solanaNetwork: SOLANA_NETWORK,
    solana_network: SOLANA_NETWORK,
    genesisHash: SOLANA_GENESIS_HASH,
    genesis_hash: SOLANA_GENESIS_HASH,
    direction: "destination",
    sourceDomain: SOURCE_DOMAIN,
    source_domain: SOURCE_DOMAIN,
    targetDomain: TARGET_DOMAIN,
    target_domain: TARGET_DOMAIN,
    proofBackend: PROOF_BACKEND,
    proof_backend: PROOF_BACKEND,
    requiredProofBackend: PROOF_BACKEND,
    required_proof_backend: PROOF_BACKEND,
    destinationVerifierPlan: DESTINATION_VERIFIER_PLAN,
    destination_verifier_plan: DESTINATION_VERIFIER_PLAN,
    verifierTarget: VERIFIER_TARGET,
    verifier_target: VERIFIER_TARGET,
    productionProofsReady: false,
    production_proofs_ready: false,
    linked: false,
    requiredArtifacts,
    required_artifacts: requiredArtifacts,
    missingArtifactIds,
    missing_artifact_ids: missingArtifactIds,
  };
};

export const proveSolanaSccpDestination = async () => {
  throw new Error(
    "Solana SCCP destination prover is not bundled in this build. Publish the governed Solana proof package before enabling taira_sol_xor.",
  );
};

export const solanaSccpDestinationProverSelfTest = async () => {
  const requirements = solanaSccpDestinationProverMaterialRequirements();
  return {
    ready: false,
    reason: FAIL_CLOSED_REASON,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
    solanaNetwork: SOLANA_NETWORK,
    genesisHash: SOLANA_GENESIS_HASH,
    direction: "destination",
    proofBackend: PROOF_BACKEND,
    requiredProofBackend: PROOF_BACKEND,
    destinationVerifierPlan: DESTINATION_VERIFIER_PLAN,
    verifierTarget: VERIFIER_TARGET,
    linked: false,
    productionProofsReady: false,
    requiredArtifacts: requirements.requiredArtifacts,
    missingArtifactIds: requirements.missingArtifactIds,
  };
};
