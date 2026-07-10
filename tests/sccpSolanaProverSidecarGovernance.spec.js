import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV,
  SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV,
  buildValidatedSolanaProverSidecarBody,
  loadSolanaProverKnownAnswerMaterial,
} from "../scripts/build-sccp-solana-prover-sidecars.mjs";
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

const approvalRecord = ({ destinationVectorHash, overrides = {} }) => ({
  schema: "iroha-demo-sccp-solana-production-governance-approval/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  solanaNetwork: "solana-testnet",
  solanaGenesisHash: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  approved: true,
  approvalId: "test-independent-approval",
  pins: {
    sourceVerifierMaterialHash: hash("source-verifier-material"),
    sourceAdapterEngineDeploymentHash: hash("source-adapter-deployment"),
    offlineFullTomlSha256: hash("offline-full-toml"),
    destinationProverModuleHash: hash("destination-module"),
    destinationProverSidecarHash: hash("destination-sidecar"),
    destinationProverKnownAnswerVectorHash: destinationVectorHash,
    sourceProverModuleHash: hash("source-module"),
    sourceProverSidecarHash: hash("source-sidecar"),
    sourceProverKnownAnswerVectorHash: hash("source-known-answer-vector"),
    destinationProofAdmissionHash: hash("destination-proof-admission"),
    outerVerifierProgramId: "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf",
    outerVerifierProgramdataAddress:
      "ER83Raefo1T5oVZfB1j5krDzc6TmwA3tMEP5U79VJWWW",
    outerVerifierProgramdataSlot: "420442735",
    outerVerifierArtifactSha256: hash("outer-verifier-artifact"),
    outerVerifierCodeHash: hash("outer-verifier-code"),
    destinationBridgeProgramId: "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD",
    destinationBridgeProgramdataAddress:
      "9ey7piM5hZap475XPFyMvfybLjZvA5QydwF6MAvDCRQp",
    destinationBridgeProgramdataSlot: "420442737",
    destinationBridgeArtifactSha256: hash("destination-bridge-artifact"),
    destinationBridgeCodeHash: hash("destination-bridge-code"),
    sourceBridgeProgramId: "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
    sourceBridgeProgramdataAddress:
      "2ALmgF4o71uEXBXeQ56h2jeUb1VJrw5zvEo1QKjeZzP2",
    sourceBridgeProgramdataSlot: "420442738",
    sourceBridgeArtifactSha256: hash("source-bridge-artifact"),
    sourceBridgeCodeHash: hash("source-bridge-code"),
    nativeVerifierProgramId: "ComputeBudget111111111111111111111111111111",
    nativeVerifierProgramdataAddress:
      "H81ZEb7C5TXLJeKoqytidAMVeNuvBAA6cB6QQ1WjQLRA",
    nativeVerifierProgramdataSlot: "420442736",
    nativeVerifierArtifactSha256: hash("native-verifier-artifact"),
    nativeVerifierCodeHash: hash("native-verifier-code"),
    nativeVerifierKeyHash: hash("native-verifier-key"),
  },
  ...overrides,
});

const buildFixture = ({
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
    direction: "destination",
    result: destinationResult(),
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
    direction: "destination",
    result: destinationResult(),
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
    destinationVectorHash: solanaProverKnownAnswerVectorHash(vector),
    overrides: approvalOverrides,
  });
  const approvalBytes = Buffer.from(`${JSON.stringify(approval, null, 2)}\n`);
  writeFileSync(approvalFile, approvalBytes);
  const env = {
    [SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE_ENV]: approvalFile,
    [SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256_ENV]:
      hashBytes(approvalBytes),
    SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VECTOR_FILE: vectorFile,
    SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFIER_KEY_FILE: verifierKeyFile,
    SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFIER_ARTIFACT_FILE:
      verifierArtifactFile,
    SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFICATION_RECEIPT_FILE:
      verificationReceiptFile,
  };
  return {
    root,
    env,
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

describe("Solana prover sidecar governance material loading", () => {
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

      const sidecar = buildValidatedSolanaProverSidecarBody({
        direction: "destination",
        moduleUrl: "/sccp-solana/test-prover.js",
        moduleHash: hash("module"),
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
          proofBackend: "solana-program-v1",
          requiredProofBackend: "solana-program-v1",
          destinationVerifierPlan: "SolanaProgramNativeRecursive",
          verifierTarget: "SolanaProgram",
          missingArtifactIds: [],
        },
        knownAnswer: summary,
      });
      expect(sidecar).toMatchObject({
        productionProofsReady: true,
        knownAnswer: { ready: true, vector: fixture.vector },
      });
      expect(sidecar).not.toHaveProperty("knownAnswerProbe");
      expect(sidecar).not.toHaveProperty("known_answer_probe");
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
