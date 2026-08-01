import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV,
  SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV,
  bindSolanaProverModuleToApproval,
  buildValidatedSolanaProverSidecarBody,
  loadSolanaProverKnownAnswerMaterial,
} from "../scripts/build-sccp-solana-prover-sidecars.mjs";
import {
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
} from "../scripts/e2e/sccp-solana-exact-prover-governance.mjs";
import {
  SOLANA_PROVER_KNOWN_ANSWER_VERIFICATION_RECEIPT_SCHEMA,
  buildSolanaProverKnownAnswerVectorCandidate,
  canonicalSolanaProverKnownAnswerJson,
  invokeSolanaProverKnownAnswer,
  solanaProverKnownAnswerVectorHash,
} from "../scripts/sccp-solana-prover-known-answer.mjs";

const hashBytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;
const hash = (label) => hashBytes(Buffer.from(label));

const destinationResult = () => ({
  request: { routeId: "taira_sol_xor" },
  submission: { proofBytes: `0x${"ab".repeat(64)}` },
});
const sourceResult = () => ({
  messageBundle: {
    finality_proof: `0x${"bc".repeat(64)}`,
    routeId: "taira_sol_xor",
  },
  settlement: { routeId: "taira_sol_xor", amount: "1000000000" },
});
const resultFor = (direction) =>
  direction === "destination" ? destinationResult() : sourceResult();

const approvalRecord = ({
  destinationVectorHash = hash("destination-known-answer-vector"),
  sourceVectorHash = hash("source-known-answer-vector"),
  overrides = {},
}) => ({
  schema: "iroha-sccp-solana-production-prover-approval/v2",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  approved: true,
  approvalId: "test-independent-approval",
  pins: {
    captureReviewPolicySha256: hash("capture-review-policy"),
    governancePlanCanonicalSha256: hash("exact-governance-plan"),
    orderedInitializationEvidenceSha256: hash(
      "ordered-initialization-evidence",
    ),
    destinationProverModuleHash: hash("destination-module"),
    destinationProverKnownAnswerVectorHash: destinationVectorHash,
    sourceProverModuleHash: hash("source-module"),
    sourceProverKnownAnswerVectorHash: sourceVectorHash,
  },
  ...overrides,
});

const buildFixture = ({
  direction = "destination",
  canonicalVector = true,
  approvalOverrides = {},
  vectorMutation = null,
} = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), "solana-kat-governance-"));
  const verifierKeyFile = path.join(root, "verifier-public.bin");
  const verifierArtifactFile = path.join(root, "verifier-artifact.so");
  const verificationReceiptFile = path.join(root, "verification-receipt.json");
  const vectorFile = path.join(root, "known-answer-vector.json");
  const approvalFile = path.join(root, "governance-approval.json");
  const verifierKeyBytes = Buffer.from("reviewed verifier key bytes");
  const verifierArtifactBytes = Buffer.from("reviewed verifier artifact bytes");
  writeFileSync(verifierKeyFile, verifierKeyBytes);
  writeFileSync(verifierArtifactFile, verifierArtifactBytes);
  const provisionalArtifactEvidence = {
    verifierKeyHash: hashBytes(verifierKeyBytes),
    verifierArtifactHash: hashBytes(verifierArtifactBytes),
    verificationReceiptHash: hash("provisional-verification-receipt"),
  };
  const provisionalVector = buildSolanaProverKnownAnswerVectorCandidate({
    direction,
    result: resultFor(direction),
    artifactEvidence: provisionalArtifactEvidence,
  });
  const verificationReceipt = {
    schema: SOLANA_PROVER_KNOWN_ANSWER_VERIFICATION_RECEIPT_SCHEMA,
    challengeId: provisionalVector.challengeId,
    routeId: provisionalVector.routeId,
    assetKey: provisionalVector.assetKey,
    direction: provisionalVector.direction,
    network: provisionalVector.network,
    genesisHash: provisionalVector.genesisHash,
    proofBackend: provisionalVector.proofBackend,
    inputHash: provisionalVector.inputHash,
    packageHash: provisionalVector.packageHash,
    proofMaterialHash: provisionalVector.proofMaterialHash,
    verifierKeyHash: provisionalVector.verifierKeyHash,
    verifierArtifactHash: provisionalVector.verifierArtifactHash,
    verified: true,
  };
  const verificationReceiptBytes = Buffer.from(
    `${canonicalSolanaProverKnownAnswerJson(verificationReceipt)}\n`,
  );
  writeFileSync(verificationReceiptFile, verificationReceiptBytes);
  const artifactEvidence = {
    ...provisionalArtifactEvidence,
    verificationReceiptHash: hashBytes(verificationReceiptBytes),
  };
  const vector = buildSolanaProverKnownAnswerVectorCandidate({
    direction,
    result: resultFor(direction),
    artifactEvidence,
  });
  vectorMutation?.(vector);
  writeFileSync(
    vectorFile,
    canonicalVector
      ? `${canonicalSolanaProverKnownAnswerJson(vector)}\n`
      : `${JSON.stringify(vector, null, 2)}\n`,
  );
  const approval = approvalRecord({
    ...(direction === "destination"
      ? { destinationVectorHash: solanaProverKnownAnswerVectorHash(vector) }
      : { sourceVectorHash: solanaProverKnownAnswerVectorHash(vector) }),
    overrides: approvalOverrides,
  });
  const approvalBytes = Buffer.from(
    `${canonicalSolanaExactProverApprovalJson(approval)}\n`,
  );
  writeFileSync(approvalFile, approvalBytes);
  const prefix = `SCCP_SOLANA_${direction.toUpperCase()}_KNOWN_ANSWER`;
  const env = {
    [SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV]: approvalFile,
    [SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV]:
      hashBytes(approvalBytes),
    [`${prefix}_VECTOR_FILE`]: vectorFile,
    [`${prefix}_VERIFIER_KEY_FILE`]: verifierKeyFile,
    [`${prefix}_VERIFIER_ARTIFACT_FILE`]: verifierArtifactFile,
    [`${prefix}_VERIFICATION_RECEIPT_FILE`]: verificationReceiptFile,
  };
  return {
    root,
    env,
    approval,
    vector,
    artifactEvidence,
    files: {
      vectorFile,
      approvalFile,
      verifierKeyFile,
      verifierArtifactFile,
      verificationReceiptFile,
    },
  };
};

const rewriteApproval = (
  fixture,
  mutate,
  { canonical = true, updateIndependentPin = true } = {},
) => {
  const approval = JSON.parse(readFileSync(fixture.files.approvalFile, "utf8"));
  mutate(approval);
  const bytes = Buffer.from(
    canonical
      ? `${canonicalSolanaExactProverApprovalJson(approval)}\n`
      : `${JSON.stringify(approval, null, 2)}\n`,
  );
  writeFileSync(fixture.files.approvalFile, bytes);
  if (updateIndependentPin) {
    fixture.env[SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV] =
      hashBytes(bytes);
  }
};

describe("Solana prover sidecar governance material loading", () => {
  it("production-rejects a freshly re-pinned v1 prover approval", () => {
    const approval = approvalRecord({});
    approval.schema = "iroha-sccp-solana-production-prover-approval/v1";
    const approvalBytes = Buffer.from(
      `${canonicalSolanaExactProverApprovalJson(approval)}\n`,
    );
    const approvalSha256 = hashBytes(approvalBytes);
    const validation = buildExactSolanaProductionProverApprovalValidation({
      approvalRecord: approval,
      approvalPath: "/tmp/legacy-v1-prover-approval.json",
      approvalSha256,
      expectedApprovalSha256: approvalSha256,
    });

    expect(validation.ready).toBe(false);
    expect(validation.blockerIds).toContain(
      "solana-exact-prover-approval-schema",
    );
  });

  it("never echoes malformed approval values or unknown field names in validation evidence", () => {
    const secret = "audit-secret-must-not-serialize";
    const malformed = approvalRecord({});
    malformed.schema = secret;
    malformed.approvalId = secret;
    malformed.pins.destinationProverModuleHash = secret;
    malformed[secret] = { password: secret };
    const validation = buildExactSolanaProductionProverApprovalValidation({
      approvalRecord: malformed,
      approvalPath: `/tmp/${secret}.json`,
      approvalSha256: hash("malformed-approval"),
      expectedApprovalSha256: hash("malformed-approval"),
    });
    expect(validation.ready).toBe(false);
    expect(JSON.stringify(validation)).not.toContain(secret);
    expect(validation.approvalPath).toBe("[public-path-supplied]");
  });

  it("loads only canonical vectors covered by an independently hash-pinned approval", async () => {
    const fixture = buildFixture();
    try {
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      expect(material).toMatchObject({
        vector: fixture.vector,
        artifactEvidence: fixture.artifactEvidence,
        governance: {
          approvalHash:
            fixture.env[
              SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV
            ],
          expectedApprovalHash:
            fixture.env[
              SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV
            ],
          vectorHashPin: solanaProverKnownAnswerVectorHash(fixture.vector),
        },
        approvalValidation: { ready: true, blockerIds: [] },
        errors: [],
      });

      const summary = await invokeSolanaProverKnownAnswer({
        direction: "destination",
        prove: async () => destinationResult(),
        ...material,
        preflightErrors: material.errors,
      });
      expect(summary).toMatchObject({ ready: true, invoked: true, errors: [] });

      const moduleHash = hash("destination-module");
      const moduleBinding = bindSolanaProverModuleToApproval({
        direction: "destination",
        moduleHash,
        knownAnswerMaterial: material,
      }).moduleBinding;
      const sidecarInput = {
        direction: "destination",
        moduleUrl: "/sccp-solana/test-prover.js",
        moduleHash,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        selfTest: {
          ready: true,
          linked: true,
          productionProofsReady: true,
          production_proofs_ready: true,
          routeId: "taira_sol_xor",
          assetKey: "xor",
          solanaNetwork: "solana-testnet",
          genesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
          direction: "destination",
          sourceDomain: 0,
          targetDomain: 3,
          proofBackend: "solana-groth16-bn254-v1",
          requiredProofBackend: "solana-groth16-bn254-v1",
          destinationVerifierPlan: "SolanaProgramNativeRecursive",
          verifierTarget: "SolanaProgram",
          missingArtifactIds: [],
        },
        knownAnswer: summary,
      };
      const unboundSidecar =
        buildValidatedSolanaProverSidecarBody(sidecarInput);
      expect(unboundSidecar.productionProofsReady).toBe(false);
      const sidecar = buildValidatedSolanaProverSidecarBody({
        ...sidecarInput,
        approvalValidation: material.approvalValidation,
        moduleBinding,
      });
      expect(sidecar).toMatchObject({
        productionProofsReady: true,
        knownAnswer: { ready: true, vector: fixture.vector },
        governanceApprovalBinding: {
          ready: true,
          governancePlanCanonicalSha256: hash("exact-governance-plan"),
          orderedInitializationEvidenceSha256: hash(
            "ordered-initialization-evidence",
          ),
          approvedModuleHash: moduleHash,
        },
      });
      expect(sidecar).not.toHaveProperty("knownAnswerProbe");
      expect(sidecar).not.toHaveProperty("known_answer_probe");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("binds executed prover module bytes to the exact governance approval", async () => {
    const fixture = buildFixture();
    try {
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      expect(
        bindSolanaProverModuleToApproval({
          direction: "destination",
          moduleHash: hash("destination-module"),
          knownAnswerMaterial: material,
        }),
      ).toMatchObject({
        errors: [],
        moduleBinding: { ready: true },
      });
      expect(
        bindSolanaProverModuleToApproval({
          direction: "destination",
          moduleHash: hash("attacker-module"),
          knownAnswerMaterial: material,
        }),
      ).toMatchObject({
        moduleBinding: { ready: false },
        errors: [
          "Solana destination prover module bytes do not match the exact governance approval pin.",
        ],
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("applies the same approval, artifact, and module binding to the source prover", async () => {
    const fixture = buildFixture({ direction: "source" });
    try {
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "source",
        env: fixture.env,
      });
      const moduleBinding = bindSolanaProverModuleToApproval({
        direction: "source",
        moduleHash: hash("source-module"),
        knownAnswerMaterial: material,
      });
      expect(moduleBinding).toMatchObject({
        errors: [],
        moduleBinding: { ready: true },
      });
      const summary = await invokeSolanaProverKnownAnswer({
        direction: "source",
        prove: async () => sourceResult(),
        ...moduleBinding,
        preflightErrors: moduleBinding.errors,
      });
      expect(summary).toMatchObject({
        ready: true,
        invoked: true,
        direction: "source",
        errors: [],
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects pretty-printed, whitespace-mutated, and duplicate-key vectors", async () => {
    const fixtures = [
      buildFixture({ canonicalVector: false }),
      buildFixture(),
      buildFixture(),
    ];
    writeFileSync(
      fixtures[1].files.vectorFile,
      ` ${readFileSync(fixtures[1].files.vectorFile, "utf8")}`,
    );
    const canonical = readFileSync(fixtures[2].files.vectorFile, "utf8");
    writeFileSync(
      fixtures[2].files.vectorFile,
      canonical.replace(
        '{"assetKey":"xor",',
        '{"assetKey":"attacker","assetKey":"xor",',
      ),
    );
    try {
      for (const fixture of fixtures) {
        const material = await loadSolanaProverKnownAnswerMaterial({
          direction: "destination",
          env: fixture.env,
        });
        expect(material.vector).toBeNull();
        expect(material.errors).toContain(
          "Solana known-answer vector file must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
        );
      }
    } finally {
      fixtures.forEach((fixture) =>
        rmSync(fixture.root, { recursive: true, force: true }),
      );
    }
  });

  it.each([
    [
      "approval expected hash missing",
      (fixture) =>
        delete fixture.env[
          SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV
        ],
    ],
    [
      "approval expected hash mismatch",
      (fixture) =>
        (fixture.env[SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV] =
          hash("attacker-approval")),
    ],
    [
      "verifier key absent",
      (fixture) =>
        delete fixture.env
          .SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFIER_KEY_FILE,
    ],
    [
      "verification receipt empty",
      (fixture) => writeFileSync(fixture.files.verificationReceiptFile, ""),
    ],
    [
      "secret-like vector path",
      (fixture) => {
        const secretPath = path.join(fixture.root, "wallet-backup-vector.json");
        writeFileSync(secretPath, readFileSync(fixture.files.vectorFile));
        fixture.env.SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VECTOR_FILE =
          secretPath;
      },
    ],
  ])("fails closed when %s", async (_label, mutate) => {
    const fixture = buildFixture();
    try {
      mutate(fixture);
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      expect(material.errors.length).toBeGreaterThan(0);
      const prove = vi.fn(async () => destinationResult());
      const summary = await invokeSolanaProverKnownAnswer({
        direction: "destination",
        prove,
        ...material,
        preflightErrors: material.errors,
      });
      expect(summary.ready).toBe(false);
      expect(summary.invoked).toBe(false);
      expect(prove).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "a retired outer-verifier pin is present",
      (approval) =>
        (approval.pins.outerVerifierProgramId =
          "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf"),
    ],
    [
      "destination and source prover modules alias the same bytes",
      (approval) =>
        (approval.pins.sourceProverModuleHash =
          approval.pins.destinationProverModuleHash),
    ],
    [
      "the exact governance-plan binding is absent",
      (approval) => delete approval.pins.governancePlanCanonicalSha256,
    ],
    [
      "a retired program-role pin is present",
      (approval) =>
        (approval.pins.destinationProgramId =
          "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD"),
    ],
    [
      "an unconsumed legacy material pin is present",
      (approval) =>
        (approval.pins.offlineFullTomlSha256 = hash("syntax-only-claim")),
    ],
  ])("rejects exact three-program approval when %s", async (_label, mutate) => {
    const fixture = buildFixture();
    try {
      rewriteApproval(fixture, mutate);
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      expect(material.approvalValidation.ready).toBe(false);
      expect(material.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("never serializes unknown or secret-bearing self-test output", async () => {
    const fixture = buildFixture();
    try {
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      const summary = await invokeSolanaProverKnownAnswer({
        direction: "destination",
        prove: async () => destinationResult(),
        ...material,
        preflightErrors: material.errors,
      });
      const moduleHash = hash("destination-module");
      const sidecar = buildValidatedSolanaProverSidecarBody({
        direction: "destination",
        moduleUrl: "/sccp-solana/test-prover.js",
        moduleHash,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
        selfTest: {
          ready: true,
          linked: true,
          productionProofsReady: true,
          production_proofs_ready: true,
          routeId: "taira_sol_xor",
          assetKey: "xor",
          solanaNetwork: "solana-testnet",
          genesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
          direction: "destination",
          sourceDomain: 0,
          targetDomain: 3,
          proofBackend: "solana-groth16-bn254-v1",
          requiredProofBackend: "solana-groth16-bn254-v1",
          destinationVerifierPlan: "SolanaProgramNativeRecursive",
          verifierTarget: "SolanaProgram",
          missingArtifactIds: [],
          privateKey: "must-never-be-serialized",
          selfAttested: true,
        },
        knownAnswer: summary,
        approvalValidation: material.approvalValidation,
        moduleBinding: bindSolanaProverModuleToApproval({
          direction: "destination",
          moduleHash,
          knownAnswerMaterial: material,
        }).moduleBinding,
      });
      expect(sidecar.productionProofsReady).toBe(false);
      expect(JSON.stringify(sidecar)).not.toContain("must-never-be-serialized");
      expect(sidecar.selfTest).not.toHaveProperty("privateKey");
      expect(sidecar.selfTest).not.toHaveProperty("selfAttested");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical approval bytes even when their independent hash matches", async () => {
    const fixture = buildFixture();
    try {
      rewriteApproval(fixture, () => {}, { canonical: false });
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      expect(material.approvalValidation.ready).toBe(false);
      expect(material.errors).toContain(
        "Solana exact prover governance approval must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("detects artifact mutation after vector governance approval", async () => {
    const fixture = buildFixture();
    try {
      writeFileSync(
        fixture.files.verifierArtifactFile,
        "attacker-replaced-verifier-artifact",
      );
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      const prove = vi.fn(async () => destinationResult());
      const summary = await invokeSolanaProverKnownAnswer({
        direction: "destination",
        prove,
        ...material,
        preflightErrors: material.errors,
      });
      expect(summary).toMatchObject({ ready: false, invoked: false });
      expect(summary.errors).toContain(
        "Known-answer artifact evidence verifierArtifactHash does not match the governance-pinned vector.",
      );
      expect(prove).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["verified flag", (receipt) => (receipt.verified = false)],
    [
      "proof hash",
      (receipt) => (receipt.proofMaterialHash = hash("stale-proof")),
    ],
    [
      "verifier key",
      (receipt) => (receipt.verifierKeyHash = hash("stale-key")),
    ],
    ["unknown field", (receipt) => (receipt.selfAttested = true)],
  ])(
    "rejects an independent receipt with changed %s",
    async (_label, mutate) => {
      const fixture = buildFixture();
      try {
        const receipt = JSON.parse(
          readFileSync(fixture.files.verificationReceiptFile, "utf8"),
        );
        mutate(receipt);
        writeFileSync(
          fixture.files.verificationReceiptFile,
          `${canonicalSolanaProverKnownAnswerJson(receipt)}\n`,
        );
        const material = await loadSolanaProverKnownAnswerMaterial({
          direction: "destination",
          env: fixture.env,
        });
        expect(material.errors).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /Independent verification receipt|artifact evidence/u,
            ),
          ]),
        );
        const prove = vi.fn(async () => destinationResult());
        const summary = await invokeSolanaProverKnownAnswer({
          direction: "destination",
          prove,
          ...material,
          preflightErrors: material.errors,
        });
        expect(summary).toMatchObject({ ready: false, invoked: false });
        expect(prove).not.toHaveBeenCalled();
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("detects vector mutation even if the attacker preserves valid JSON and proof shape", async () => {
    const fixture = buildFixture();
    try {
      const mutated = {
        ...fixture.vector,
        packageHash: hash("attacker-selected-proof-package"),
      };
      writeFileSync(
        fixture.files.vectorFile,
        `${canonicalSolanaProverKnownAnswerJson(mutated)}\n`,
      );
      const material = await loadSolanaProverKnownAnswerMaterial({
        direction: "destination",
        env: fixture.env,
      });
      const prove = vi.fn(async () => destinationResult());
      const summary = await invokeSolanaProverKnownAnswer({
        direction: "destination",
        prove,
        ...material,
        preflightErrors: material.errors,
      });
      expect(summary).toMatchObject({ ready: false, invoked: false });
      expect(summary.errors).toContain(
        "Known-answer vector does not match the governance-approved vector hash pin.",
      );
      expect(prove).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
