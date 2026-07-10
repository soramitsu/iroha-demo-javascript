import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  proveSolanaSccpDestination,
  solanaSccpDestinationProverMaterialRequirements,
  solanaSccpDestinationProverSelfTest,
} from "../public/sccp-solana/taira-solana-xor-destination-prover.js";
import {
  proveSolanaSccpSource,
  solanaSccpSourceProverMaterialRequirements,
  solanaSccpSourceProverSelfTest,
} from "../public/sccp-solana/taira-solana-xor-source-prover.js";
import {
  buildValidatedSolanaProverSidecarBody,
  validateSolanaProverSelfTestForSidecar,
} from "../scripts/build-sccp-solana-prover-sidecars.mjs";
import {
  buildSolanaProverKnownAnswerVectorCandidate,
  solanaProverKnownAnswerVectorHash,
  validateSolanaProverKnownAnswerResult,
} from "../scripts/sccp-solana-prover-known-answer.mjs";

const SOLANA_DESTINATION_PROOF_BACKEND = "solana-program-v1";
const SOLANA_SOURCE_PROOF_BACKEND = "sccp-solana-recursive-testnet-v1";
const SOLANA_GENESIS_HASH = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
const SOLANA_DESTINATION_VERIFIER_PLAN = "SolanaProgramNativeRecursive";
const SOLANA_VERIFIER_TARGET = "SolanaProgram";
const MODULE_HASH = `0x${"12".repeat(32)}`;
const hash = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;

const productionSelfTest = (direction) => {
  const destination = direction === "destination";
  const proofBackend = destination
    ? SOLANA_DESTINATION_PROOF_BACKEND
    : SOLANA_SOURCE_PROOF_BACKEND;
  return {
    ready: true,
    linked: true,
    productionProofsReady: true,
    production_proofs_ready: true,
    routeId: "taira_sol_xor",
    route_id: "taira_sol_xor",
    assetKey: "xor",
    asset_key: "xor",
    network: "solana-testnet",
    solanaNetwork: "solana-testnet",
    solana_network: "solana-testnet",
    genesisHash: SOLANA_GENESIS_HASH,
    genesis_hash: SOLANA_GENESIS_HASH,
    direction,
    sourceDomain: destination ? 0 : 3,
    source_domain: destination ? 0 : 3,
    targetDomain: destination ? 3 : 0,
    target_domain: destination ? 3 : 0,
    proofBackend,
    proof_backend: proofBackend,
    requiredProofBackend: proofBackend,
    required_proof_backend: proofBackend,
    ...(destination
      ? {
          destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
          destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
          verifierTarget: SOLANA_VERIFIER_TARGET,
          verifier_target: SOLANA_VERIFIER_TARGET,
        }
      : {}),
    missingArtifactIds: [],
    missing_artifact_ids: [],
  };
};

const productionProofProbe = (direction) => {
  const result =
    direction === "destination"
      ? {
          request: { routeId: "taira_sol_xor" },
          submission: { proofBytes: `0x${"aa".repeat(64)}` },
        }
      : {
          messageBundle: { finality_proof: `0x${"bb".repeat(64)}` },
          settlement: { routeId: "taira_sol_xor" },
        };
  const artifactEvidence = {
    verifierKeyHash: hash(`${direction}:verifier-key`),
    verifierArtifactHash: hash(`${direction}:verifier-artifact`),
    verificationReceiptHash: hash(`${direction}:verification-receipt`),
  };
  const vector = buildSolanaProverKnownAnswerVectorCandidate({
    direction,
    result,
    artifactEvidence,
  });
  const approvalHash = hash("independent-governance-approval");
  return validateSolanaProverKnownAnswerResult({
    direction,
    result,
    vector,
    artifactEvidence,
    governance: {
      approvalHash,
      expectedApprovalHash: approvalHash,
      vectorHashPin: solanaProverKnownAnswerVectorHash(vector),
    },
  });
};

const buildSidecar = (
  direction,
  selfTest,
  proofProbe = productionProofProbe(direction),
) => {
  const destination = direction === "destination";
  return buildValidatedSolanaProverSidecarBody({
    direction,
    moduleUrl: destination
      ? "/sccp-solana/taira-solana-xor-destination-prover.js"
      : "/sccp-solana/taira-solana-xor-source-prover.js",
    moduleHash: MODULE_HASH,
    proveExport: destination
      ? "proveSolanaSccpDestination"
      : "proveSolanaSccpSource",
    selfTestExport: destination
      ? "solanaSccpDestinationProverSelfTest"
      : "solanaSccpSourceProverSelfTest",
    selfTest,
    knownAnswer: proofProbe,
    checkedAt: "2026-07-09T00:00:00.000Z",
  });
};

const requiredArtifact = (requirements, id) => {
  const artifact = requirements.requiredArtifacts.find(
    (candidate) => candidate.id === id,
  );
  expect(artifact, `missing required artifact ${id}`).toBeTruthy();
  return artifact;
};

describe("public Solana SCCP prover modules", () => {
  it("keeps the bundled destination prover fail-closed with explicit material requirements", async () => {
    await expect(proveSolanaSccpDestination()).rejects.toThrow(
      "Solana SCCP destination prover is not bundled",
    );

    const selfTest = await solanaSccpDestinationProverSelfTest();
    const requirements = solanaSccpDestinationProverMaterialRequirements();

    expect(selfTest).toMatchObject({
      ready: false,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      solanaNetwork: "solana-testnet",
      direction: "destination",
      proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      requiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      genesisHash: SOLANA_GENESIS_HASH,
      destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
      verifierTarget: SOLANA_VERIFIER_TARGET,
      productionProofsReady: false,
      linked: false,
    });
    expect(requirements).toMatchObject({
      schema: "iroha-demo-sccp-solana-prover-material-requirements/v1",
      routeId: "taira_sol_xor",
      route_id: "taira_sol_xor",
      direction: "destination",
      sourceDomain: 0,
      targetDomain: 3,
      proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
      requiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      required_proof_backend: SOLANA_DESTINATION_PROOF_BACKEND,
      genesisHash: SOLANA_GENESIS_HASH,
      destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
      verifierTarget: SOLANA_VERIFIER_TARGET,
      productionProofsReady: false,
      production_proofs_ready: false,
    });
    expect(requirements.missingArtifactIds).toEqual([
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
      "destination-proof-admission-material",
      "browser-destination-prover-package",
    ]);
    expect(selfTest.missingArtifactIds).toEqual(
      requirements.missingArtifactIds,
    );
    expect(
      requiredArtifact(requirements, "governed-solana-source-proof-material")
        .upstreamArtifactIds,
    ).toEqual([
      "governed-solana-source-adapter-engine-deployment",
      "governed-solana-source-verifier-material",
    ]);
    expect(
      requiredArtifact(requirements, "solana-native-recursive-verifier-linkage")
        .upstreamArtifactIds,
    ).toEqual([
      "governed-solana-source-proof-material",
      "solana-verifier-immutable-programdata",
    ]);
    expect(
      requiredArtifact(requirements, "destination-proof-admission-material")
        .upstreamArtifactIds,
    ).toEqual([
      "finalized-solana-route-canary-transaction",
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
    ]);
    expect(
      requiredArtifact(requirements, "browser-destination-prover-package")
        .upstreamArtifactIds,
    ).toEqual([
      "destination-proof-admission-material",
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
    ]);

    requiredArtifact(
      requirements,
      "browser-destination-prover-package",
    ).upstreamArtifactIds.push("mutated");
    expect(
      requiredArtifact(
        solanaSccpDestinationProverMaterialRequirements(),
        "browser-destination-prover-package",
      ).upstreamArtifactIds,
    ).toEqual([
      "destination-proof-admission-material",
      "governed-solana-source-proof-material",
      "solana-native-recursive-verifier-linkage",
    ]);
  });

  it("keeps the bundled source prover fail-closed with explicit material requirements", async () => {
    await expect(proveSolanaSccpSource()).rejects.toThrow(
      "Solana SCCP source prover is not bundled",
    );

    const selfTest = await solanaSccpSourceProverSelfTest();
    const requirements = solanaSccpSourceProverMaterialRequirements();

    expect(selfTest).toMatchObject({
      ready: false,
      routeId: "taira_sol_xor",
      assetKey: "xor",
      solanaNetwork: "solana-testnet",
      direction: "source",
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      requiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      genesisHash: SOLANA_GENESIS_HASH,
      productionProofsReady: false,
      linked: false,
    });
    expect(requirements).toMatchObject({
      schema: "iroha-demo-sccp-solana-prover-material-requirements/v1",
      routeId: "taira_sol_xor",
      route_id: "taira_sol_xor",
      direction: "source",
      sourceDomain: 3,
      targetDomain: 0,
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      requiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      required_proof_backend: SOLANA_SOURCE_PROOF_BACKEND,
      genesisHash: SOLANA_GENESIS_HASH,
      productionProofsReady: false,
      production_proofs_ready: false,
    });
    expect(requirements.missingArtifactIds).toEqual([
      "governed-solana-source-proof-material",
      "solana-source-adapter-engine-deployment",
      "taira-finalize-inbound-binding-material",
      "browser-source-prover-package",
    ]);
    expect(selfTest.missingArtifactIds).toEqual(
      requirements.missingArtifactIds,
    );
    expect(
      requiredArtifact(requirements, "governed-solana-source-proof-material")
        .upstreamArtifactIds,
    ).toEqual([
      "governed-solana-source-adapter-engine-deployment",
      "governed-solana-source-verifier-material",
    ]);
    expect(
      requiredArtifact(requirements, "solana-source-adapter-engine-deployment")
        .upstreamArtifactIds,
    ).toEqual(["governed-solana-source-adapter-engine-deployment"]);
    expect(
      requiredArtifact(requirements, "taira-finalize-inbound-binding-material")
        .upstreamArtifactIds,
    ).toEqual([
      "finalized-solana-source-burn-transaction",
      "governed-solana-source-proof-material",
      "solana-source-state-burn-hash",
    ]);
    expect(
      requiredArtifact(requirements, "browser-source-prover-package")
        .upstreamArtifactIds,
    ).toEqual([
      "governed-solana-source-proof-material",
      "solana-source-adapter-engine-deployment",
      "taira-finalize-inbound-binding-material",
    ]);

    requiredArtifact(
      requirements,
      "browser-source-prover-package",
    ).upstreamArtifactIds.push("mutated");
    expect(
      requiredArtifact(
        solanaSccpSourceProverMaterialRequirements(),
        "browser-source-prover-package",
      ).upstreamArtifactIds,
    ).toEqual([
      "governed-solana-source-proof-material",
      "solana-source-adapter-engine-deployment",
      "taira-finalize-inbound-binding-material",
    ]);
  });
});

describe("Solana SCCP prover sidecar self-test hardening", () => {
  it.each(["destination", "source"])(
    "emits production readiness only for a fully route-bound %s self-test",
    (direction) => {
      const selfTest = productionSelfTest(direction);

      expect(
        validateSolanaProverSelfTestForSidecar({ direction, selfTest }),
      ).toEqual({ ready: true, errors: [] });
      expect(buildSidecar(direction, selfTest)).toMatchObject({
        routeId: "taira_sol_xor",
        network: "solana-testnet",
        genesisHash: SOLANA_GENESIS_HASH,
        direction,
        proofBackend:
          direction === "destination"
            ? SOLANA_DESTINATION_PROOF_BACKEND
            : SOLANA_SOURCE_PROOF_BACKEND,
        ...(direction === "destination"
          ? {
              destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
              verifierTarget: SOLANA_VERIFIER_TARGET,
            }
          : {}),
        productionProofsReady: true,
        production_proofs_ready: true,
        selfTest: {
          ready: true,
          linked: true,
          productionProofsReady: true,
          production_proofs_ready: true,
          missingArtifactIds: [],
          missing_artifact_ids: [],
        },
        knownAnswer: {
          ready: true,
          invoked: true,
          direction,
        },
      });
    },
  );

  it("fails closed for incomplete, unbound, or alias-conflicting production claims", () => {
    const invalidCases = [
      ["ready", (selfTest) => (selfTest.ready = false)],
      ["linkage", (selfTest) => (selfTest.linked = false)],
      [
        "readiness alias missing",
        (selfTest) => delete selfTest.production_proofs_ready,
      ],
      [
        "readiness alias conflict",
        (selfTest) => (selfTest.production_proofs_ready = false),
      ],
      ["route", (selfTest) => (selfTest.route_id = "taira_other_xor")],
      ["asset alias conflict", (selfTest) => (selfTest.asset_key = "not-xor")],
      ["network", (selfTest) => (selfTest.solana_network = "solana-mainnet")],
      ["direction", (selfTest) => (selfTest.direction = "source")],
      ["source domain", (selfTest) => (selfTest.source_domain = 3)],
      ["target domain", (selfTest) => (selfTest.target_domain = 0)],
      [
        "proof backend",
        (selfTest) => (selfTest.proof_backend = "placeholder-backend"),
      ],
      [
        "required proof backend",
        (selfTest) => (selfTest.required_proof_backend = "placeholder-backend"),
      ],
      [
        "missing material",
        (selfTest) => {
          selfTest.missingArtifactIds = ["governed-proof-material"];
          selfTest.missing_artifact_ids = ["governed-proof-material"];
        },
      ],
      [
        "missing material alias conflict",
        (selfTest) =>
          (selfTest.missing_artifact_ids = ["governed-proof-material"]),
      ],
      [
        "missing material metadata",
        (selfTest) => {
          delete selfTest.missingArtifactIds;
          delete selfTest.missing_artifact_ids;
        },
      ],
      [
        "required artifact marked missing",
        (selfTest) => {
          const requiredArtifacts = [
            {
              id: "governed-proof-material",
              required: true,
              status: "missing",
            },
          ];
          selfTest.requiredArtifacts = requiredArtifacts;
          selfTest.required_artifacts = requiredArtifacts;
        },
      ],
      [
        "required artifact alias conflict",
        (selfTest) => {
          selfTest.requiredArtifacts = [];
          selfTest.required_artifacts = [
            { id: "governed-proof-material", status: "present" },
          ];
        },
      ],
    ];

    for (const [label, mutate] of invalidCases) {
      const selfTest = productionSelfTest("destination");
      mutate(selfTest);
      const validation = validateSolanaProverSelfTestForSidecar({
        direction: "destination",
        selfTest,
      });
      const sidecar = buildSidecar("destination", selfTest);

      expect(validation.ready, label).toBe(false);
      expect(validation.errors.length, label).toBeGreaterThan(0);
      expect(sidecar.productionProofsReady, label).toBe(false);
      expect(sidecar.production_proofs_ready, label).toBe(false);
    }
  });

  it("rejects mixed destination and source proof profiles", () => {
    const destinationUsingSource = productionSelfTest("destination");
    destinationUsingSource.proofBackend = SOLANA_SOURCE_PROOF_BACKEND;
    destinationUsingSource.proof_backend = SOLANA_SOURCE_PROOF_BACKEND;
    destinationUsingSource.requiredProofBackend = SOLANA_SOURCE_PROOF_BACKEND;
    destinationUsingSource.required_proof_backend = SOLANA_SOURCE_PROOF_BACKEND;
    expect(
      validateSolanaProverSelfTestForSidecar({
        direction: "destination",
        selfTest: destinationUsingSource,
      }),
    ).toMatchObject({
      ready: false,
      errors: expect.arrayContaining([
        expect.stringContaining(SOLANA_DESTINATION_PROOF_BACKEND),
      ]),
    });

    const sourceUsingDestination = productionSelfTest("source");
    sourceUsingDestination.proofBackend = SOLANA_DESTINATION_PROOF_BACKEND;
    sourceUsingDestination.proof_backend = SOLANA_DESTINATION_PROOF_BACKEND;
    sourceUsingDestination.requiredProofBackend =
      SOLANA_DESTINATION_PROOF_BACKEND;
    sourceUsingDestination.required_proof_backend =
      SOLANA_DESTINATION_PROOF_BACKEND;
    expect(
      validateSolanaProverSelfTestForSidecar({
        direction: "source",
        selfTest: sourceUsingDestination,
      }),
    ).toMatchObject({
      ready: false,
      errors: expect.arrayContaining([
        expect.stringContaining(SOLANA_SOURCE_PROOF_BACKEND),
      ]),
    });
  });

  it("fails closed when a production self-test has no prove-export known answer", () => {
    const sidecar = buildSidecar(
      "destination",
      productionSelfTest("destination"),
      null,
    );

    expect(sidecar).toMatchObject({
      productionProofsReady: false,
      production_proofs_ready: false,
      knownAnswer: null,
      selfTest: {
        ready: false,
        reason: expect.stringContaining(
          "governance-pinned known-answer summary is missing",
        ),
      },
    });
  });

  it("keeps the currently bundled placeholder self-tests fail-closed", async () => {
    const destination = buildSidecar(
      "destination",
      await solanaSccpDestinationProverSelfTest(),
    );
    const source = buildSidecar(
      "source",
      await solanaSccpSourceProverSelfTest(),
    );

    expect(destination).toMatchObject({
      productionProofsReady: false,
      production_proofs_ready: false,
      selfTest: { ready: false, linked: false },
    });
    expect(source).toMatchObject({
      productionProofsReady: false,
      production_proofs_ready: false,
      selfTest: { ready: false, linked: false },
    });
  });
});
