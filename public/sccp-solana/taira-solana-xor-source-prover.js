const ROUTE_ID = "taira_sol_xor";
const ASSET_KEY = "xor";
const SOLANA_NETWORK = "solana-testnet";
const SOLANA_GENESIS_HASH = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
const SOURCE_DOMAIN = 3;
const TARGET_DOMAIN = 0;
const PROOF_BACKEND = "sccp-solana-recursive-testnet-v1";
const FAIL_CLOSED_REASON =
  "Solana SCCP source prover package is intentionally fail-closed until governed proof artifacts are published.";

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
    id: "solana-source-adapter-engine-deployment",
    required: true,
    status: "missing",
    detail:
      "Deploy and publish the governed Solana source adapter engine that converts finalized burn events into TAIRA-bound SCCP source proof requests.",
    upstreamArtifactIds: ["governed-solana-source-adapter-engine-deployment"],
  },
  {
    id: "taira-finalize-inbound-binding-material",
    required: true,
    status: "missing",
    detail:
      "Publish the TAIRA-targeted finalize_inbound bundle binding the Solana sender, TAIRA recipient, amount, XOR asset key, route id, and Solana transaction id.",
    upstreamArtifactIds: [
      "finalized-solana-source-burn-transaction",
      "governed-solana-source-proof-material",
      "solana-source-state-burn-hash",
    ],
  },
  {
    id: "browser-source-prover-package",
    required: true,
    status: "missing",
    detail:
      "Replace this placeholder module with a governed browser-safe source prover package whose sidecar has productionProofsReady=true and a passing self-test.",
    upstreamArtifactIds: [
      "governed-solana-source-proof-material",
      "solana-source-adapter-engine-deployment",
      "taira-finalize-inbound-binding-material",
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

export const solanaSccpSourceProverMaterialRequirements = () => {
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
    direction: "source",
    sourceDomain: SOURCE_DOMAIN,
    source_domain: SOURCE_DOMAIN,
    targetDomain: TARGET_DOMAIN,
    target_domain: TARGET_DOMAIN,
    proofBackend: PROOF_BACKEND,
    proof_backend: PROOF_BACKEND,
    requiredProofBackend: PROOF_BACKEND,
    required_proof_backend: PROOF_BACKEND,
    productionProofsReady: false,
    production_proofs_ready: false,
    linked: false,
    requiredArtifacts,
    required_artifacts: requiredArtifacts,
    missingArtifactIds,
    missing_artifact_ids: missingArtifactIds,
  };
};

export const proveSolanaSccpSource = async () => {
  throw new Error(
    "Solana SCCP source prover is not bundled in this build. Publish the governed Solana source proof package before enabling Solana -> TAIRA settlement.",
  );
};

export const solanaSccpSourceProverSelfTest = async () => {
  const requirements = solanaSccpSourceProverMaterialRequirements();
  return {
    ready: false,
    reason: FAIL_CLOSED_REASON,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
    solanaNetwork: SOLANA_NETWORK,
    genesisHash: SOLANA_GENESIS_HASH,
    direction: "source",
    proofBackend: PROOF_BACKEND,
    requiredProofBackend: PROOF_BACKEND,
    linked: false,
    productionProofsReady: false,
    requiredArtifacts: requirements.requiredArtifacts,
    missingArtifactIds: requirements.missingArtifactIds,
  };
};
