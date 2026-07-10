import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_PROVER_KNOWN_ANSWER_VALIDATION_SCHEMA,
  SOLANA_PROVER_KNOWN_ANSWER_VECTOR_SCHEMA,
  buildSolanaProverKnownAnswerInvocation,
  buildSolanaProverKnownAnswerVectorCandidate,
  canonicalSolanaProverKnownAnswerJson,
  invokeSolanaProverKnownAnswer,
  solanaProverKnownAnswerVectorHash,
  validateSolanaProverKnownAnswerResult,
  validateSolanaProverKnownAnswerSummary,
  validateSolanaProverKnownAnswerVector,
} from "../scripts/sccp-solana-prover-known-answer.mjs";

const hash = (label) => `0x${createHash("sha256").update(label).digest("hex")}`;

const destinationResult = () => ({
  request: {
    routeId: "taira_sol_xor",
    publicInputs: { nonce: "13", amount: "1000000000" },
  },
  submission: {
    proofBytes: `0x${"aa".repeat(64)}`,
    publicInputs: { targetDomain: 3 },
  },
});

const sourceResult = () => ({
  messageBundle: {
    finality_proof: `0x${"bb".repeat(64)}`,
    routeId: "taira_sol_xor",
  },
  settlement: {
    routeId: "taira_sol_xor",
    amount: "1000000000",
  },
});

const resultFor = (direction) =>
  direction === "destination" ? destinationResult() : sourceResult();

const artifactEvidenceFor = (direction) => ({
  verifierKeyHash: hash(`${direction}:governed-verifier-key`),
  verifierArtifactHash: hash(`${direction}:governed-verifier-artifact`),
  verificationReceiptHash: hash(
    `${direction}:independent-verification-receipt`,
  ),
});

const materialFor = (direction, result = resultFor(direction)) => {
  const artifactEvidence = artifactEvidenceFor(direction);
  const vector = buildSolanaProverKnownAnswerVectorCandidate({
    direction,
    result,
    artifactEvidence,
  });
  const vectorHash = solanaProverKnownAnswerVectorHash(vector);
  const approvalHash = hash("independently-distributed-governance-approval");
  return {
    vector,
    artifactEvidence,
    governance: {
      approvalHash,
      expectedApprovalHash: approvalHash,
      vectorHashPin: vectorHash,
    },
  };
};

const invokeValid = (direction, result = resultFor(direction)) =>
  invokeSolanaProverKnownAnswer({
    direction,
    prove: async () => result,
    ...materialFor(direction),
  });

describe("Solana prover governance-pinned deterministic known-answer vectors", () => {
  it.each([
    [
      "destination",
      "0xdd0aea23db40b501d65f5f8a66f830fb6bebaff92a30a2f85ac3dcc8abf1c3ba",
    ],
    [
      "source",
      "0xfe60e2ff9b5ff8a0d540480b3f6a596beec26cccfbd82b02e4450a03ad288246",
    ],
  ])(
    "builds a canonical production-shaped %s fixture",
    (direction, inputHash) => {
      const invocation = buildSolanaProverKnownAnswerInvocation(direction);
      expect(invocation).toMatchObject({
        direction,
        challengeId: `taira-sol-xor-${direction}-known-answer-v1`,
        inputHash,
      });
      expect(invocation).not.toHaveProperty("expectedAnswerHash");
      expect(JSON.stringify(invocation.args)).not.toMatch(
        /knownAnswer|known_answer/u,
      );

      if (direction === "destination") {
        expect(invocation.args).toHaveLength(2);
        expect(invocation.args[1]).toMatchObject({
          routeId: "taira_sol_xor",
          solanaNetwork: "solana-testnet",
          proofBackend: "solana-program-v1",
          publicInputs: { targetDomain: 3 },
        });
      } else {
        expect(invocation.args).toHaveLength(1);
        expect(invocation.args[0]).toMatchObject({
          sourceProofBackend: "sccp-solana-recursive-testnet-v1",
          sourceBridgeAddress: "4ZKKGz983uec9Bcx6YA9nZ5tcAKCPi514tFyHuFGjcLq",
          nonce: "13",
          amountBaseUnits: "1000000000",
          transaction: {
            version: "legacy",
            transaction: {
              message: {
                accountKeys: expect.arrayContaining([
                  "4ZKKGz983uec9Bcx6YA9nZ5tcAKCPi514tFyHuFGjcLq",
                  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  "11111111111111111111111111111111",
                ]),
                instructions: [
                  expect.objectContaining({
                    programIdIndex: 7,
                    accounts: [0, 1, 2, 3, 5, 4, 6],
                  }),
                ],
              },
            },
          },
        });
      }
    },
  );

  it.each(["destination", "source"])(
    "accepts %s only against the independently pinned exact vector",
    async (direction) => {
      const result = resultFor(direction);
      const material = materialFor(direction, result);
      const prove = vi.fn(async () => structuredClone(result));
      const summary = await invokeSolanaProverKnownAnswer({
        direction,
        prove,
        ...material,
      });

      expect(summary).toMatchObject({
        schema: SOLANA_PROVER_KNOWN_ANSWER_VALIDATION_SCHEMA,
        ready: true,
        invoked: true,
        routeId: "taira_sol_xor",
        direction,
        packageHash: material.vector.packageHash,
        proofMaterialHash: material.vector.proofMaterialHash,
        vectorHash: material.governance.vectorHashPin,
        vector: material.vector,
        governance: material.governance,
        artifactEvidence: material.artifactEvidence,
        errors: [],
      });
      expect(summary.vector.schema).toBe(
        SOLANA_PROVER_KNOWN_ANSWER_VECTOR_SCHEMA,
      );
      expect(
        validateSolanaProverKnownAnswerSummary({ direction, summary }),
      ).toEqual([]);
      expect(prove).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "destination",
      "0x709f6e12d780aff3954d3481a863f6b9803a235914afb4811b830f19f1645ddb",
      "0x102545685f527cec9027dba47f174ccfb8baeee687a2b2de048d559f9a7394f4",
      "0xda1898d93c0dae7cc92cf99363c874359da1a34fa9eb0e3a67af919c885bf762",
    ],
    [
      "source",
      "0x1e02dca08f255363c061da98795423a07fbcae870a1ce6ff850713a18f033219",
      "0x89b7a79aaf4c4cf34725a4ffc60eca91976deebef5f140deea847a8a4d4a8c49",
      "0x4762c4335d8d1a997e7adb71e6c0b2e2291e59c4af377e2643621fe4441511bd",
    ],
  ])(
    "locks the reviewed %s fixture to stable vector/package/proof hashes",
    (direction, vectorHash, packageHash, proofMaterialHash) => {
      const material = materialFor(direction);
      expect(material.governance.vectorHashPin).toBe(vectorHash);
      expect(material.vector.packageHash).toBe(packageHash);
      expect(material.vector.proofMaterialHash).toBe(proofMaterialHash);
    },
  );

  it("uses canonical key ordering for vector and package hashes", () => {
    const left = materialFor("destination").vector;
    const right = Object.fromEntries(Object.entries(left).reverse());
    expect(canonicalSolanaProverKnownAnswerJson(left)).toBe(
      canonicalSolanaProverKnownAnswerJson(right),
    );
    expect(solanaProverKnownAnswerVectorHash(left)).toBe(
      solanaProverKnownAnswerVectorHash(right),
    );

    const result = destinationResult();
    const reorderedResult = {
      submission: Object.fromEntries(
        Object.entries(result.submission).reverse(),
      ),
      request: Object.fromEntries(Object.entries(result.request).reverse()),
    };
    const reordered = buildSolanaProverKnownAnswerVectorCandidate({
      direction: "destination",
      result: reorderedResult,
      artifactEvidence: artifactEvidenceFor("destination"),
    });
    expect(reordered).toEqual(left);
  });

  it.each(["destination", "source"])(
    "does not invoke a %s prover without a vector, governance pin, and artifacts",
    async (direction) => {
      const prove = vi.fn(async () => resultFor(direction));
      const summary = await invokeSolanaProverKnownAnswer({ direction, prove });
      expect(summary).toMatchObject({ ready: false, invoked: false });
      expect(summary.errors).toEqual(
        expect.arrayContaining([
          "Independently supplied Solana known-answer vector is missing.",
          "Known-answer governance binding is missing.",
          "Known-answer artifact evidence is missing.",
        ]),
      );
      expect(prove).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "approval hash mismatch",
      (material) => (material.governance.approvalHash = hash("other")),
    ],
    [
      "vector pin mismatch",
      (material) => (material.governance.vectorHashPin = hash("other")),
    ],
    [
      "missing vector pin",
      (material) => delete material.governance.vectorHashPin,
    ],
    [
      "zero approval hash",
      (material) => (material.governance.approvalHash = `0x${"00".repeat(32)}`),
    ],
    [
      "verifier key mismatch",
      (material) => (material.artifactEvidence.verifierKeyHash = hash("other")),
    ],
    [
      "verifier artifact mismatch",
      (material) =>
        (material.artifactEvidence.verifierArtifactHash = hash("other")),
    ],
    [
      "verification receipt mismatch",
      (material) =>
        (material.artifactEvidence.verificationReceiptHash = hash("other")),
    ],
    [
      "missing verification receipt",
      (material) => delete material.artifactEvidence.verificationReceiptHash,
    ],
  ])("fails closed before invocation for %s", async (_label, mutate) => {
    const material = materialFor("destination");
    mutate(material);
    const prove = vi.fn(async () => destinationResult());
    const summary = await invokeSolanaProverKnownAnswer({
      direction: "destination",
      prove,
      ...material,
    });
    expect(summary.ready).toBe(false);
    expect(summary.invoked).toBe(false);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(prove).not.toHaveBeenCalled();
  });

  it.each([
    ["schema", "untrusted-vector/v1"],
    ["challengeId", "attacker-selected-challenge"],
    ["routeId", "taira_other_xor"],
    ["assetKey", "not-xor"],
    ["direction", "source"],
    ["network", "solana-mainnet-beta"],
    ["genesisHash", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
    ["proofBackend", "placeholder-backend"],
    ["sourceDomain", 3],
    ["targetDomain", 0],
    ["inputHash", hash("attacker-input")],
  ])("rejects a vector with wrong %s", (field, value) => {
    const material = materialFor("destination");
    material.vector[field] = value;
    material.governance.vectorHashPin = solanaProverKnownAnswerVectorHash(
      material.vector,
    );
    const validation = validateSolanaProverKnownAnswerVector({
      direction: "destination",
      ...material,
    });
    expect(validation.ready).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`Known-answer vector ${field} must be`),
      ]),
    );
  });

  it("rejects unknown, missing, zero, or non-canonical vector hash fields", () => {
    const cases = [
      (vector) => (vector.attackerExtension = true),
      (vector) => delete vector.packageHash,
      (vector) => (vector.proofMaterialHash = `0x${"00".repeat(32)}`),
      (vector) => (vector.verifierKeyHash = hash("UPPER").toUpperCase()),
      (vector) => (vector.verifierArtifactHash = "not-a-hash"),
    ];
    for (const mutate of cases) {
      const material = materialFor("source");
      mutate(material.vector);
      material.governance.vectorHashPin = solanaProverKnownAnswerVectorHash(
        material.vector,
      );
      expect(
        validateSolanaProverKnownAnswerVector({
          direction: "source",
          ...material,
        }).ready,
      ).toBe(false);
    }
  });

  it.each(["destination", "source"])(
    "rejects an arbitrary changed %s proof even when the prover self-attests",
    async (direction) => {
      const original = resultFor(direction);
      const material = materialFor(direction, original);
      const changed = structuredClone(original);
      if (direction === "destination") {
        changed.submission.proofBytes = `0x${"cc".repeat(64)}`;
      } else {
        changed.messageBundle.finality_proof = `0x${"dd".repeat(64)}`;
      }
      changed.knownAnswerProbe = {
        ready: true,
        packageHash: hash("attacker-selected-package"),
      };

      const summary = await invokeSolanaProverKnownAnswer({
        direction,
        prove: async () => changed,
        ...material,
      });
      expect(summary.ready).toBe(false);
      expect(summary.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("unsupported top-level field"),
          expect.stringContaining(
            "Prover-returned known-answer attestations are forbidden",
          ),
          "Computed known-answer package hash does not match the governance-pinned vector.",
          "Computed known-answer proof-material hash does not match the governance-pinned vector.",
        ]),
      );
    },
  );

  it("rejects nested prover-returned KAT metadata", () => {
    const material = materialFor("destination");
    const result = destinationResult();
    result.submission.details = { known_answer_vector: material.vector };
    expect(
      validateSolanaProverKnownAnswerResult({
        direction: "destination",
        result,
        ...material,
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Prover-returned known-answer attestations are forbidden",
        ),
      ]),
    );
  });

  it("rejects proof material placed only outside the direction-specific proof package", () => {
    const result = destinationResult();
    result.request.proofBytes = result.submission.proofBytes;
    delete result.submission.proofBytes;
    expect(() =>
      buildSolanaProverKnownAnswerVectorCandidate({
        direction: "destination",
        result,
        artifactEvidence: artifactEvidenceFor("destination"),
      }),
    ).toThrow("submission contains no non-empty proof material");
  });

  it("rejects extra or missing package top-level fields", () => {
    const material = materialFor("source");
    const extra = {
      ...sourceResult(),
      debug: { proof: `0x${"ee".repeat(32)}` },
    };
    const missing = sourceResult();
    delete missing.settlement;
    for (const result of [extra, missing]) {
      expect(
        validateSolanaProverKnownAnswerResult({
          direction: "source",
          result,
          ...material,
        }).ready,
      ).toBe(false);
    }
  });

  it("rejects accessor, symbol, sparse-array, and cyclic proof outputs", () => {
    const cases = [];
    const accessor = destinationResult();
    const getter = vi.fn(() => `0x${"aa".repeat(64)}`);
    Object.defineProperty(accessor.submission, "proofBytes", {
      enumerable: true,
      get: getter,
    });
    cases.push(accessor);

    const symbol = destinationResult();
    symbol.submission[Symbol("hidden-proof-metadata")] = "attacker";
    cases.push(symbol);

    const sparse = destinationResult();
    sparse.submission.proof = Array(16);
    sparse.submission.proof[15] = 1;
    cases.push(sparse);

    const cyclic = destinationResult();
    cyclic.submission.cycle = cyclic;
    cases.push(cyclic);

    for (const result of cases) {
      expect(() =>
        buildSolanaProverKnownAnswerVectorCandidate({
          direction: "destination",
          result,
          artifactEvidence: artifactEvidenceFor("destination"),
        }),
      ).toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects cross-direction vector replay", async () => {
    const destinationMaterial = materialFor("destination");
    const prove = vi.fn(async () => sourceResult());
    const summary = await invokeSolanaProverKnownAnswer({
      direction: "source",
      prove,
      ...destinationMaterial,
    });
    expect(summary.ready).toBe(false);
    expect(summary.invoked).toBe(false);
    expect(summary.errors).toEqual(
      expect.arrayContaining([
        'Known-answer vector direction must be "source".',
        expect.stringContaining("proofBackend"),
      ]),
    );
    expect(prove).not.toHaveBeenCalled();
  });

  it("rejects a forged or internally inconsistent sidecar summary", async () => {
    const summary = await invokeValid("destination");
    const mutations = [
      (copy) => (copy.ready = false),
      (copy) => (copy.invoked = false),
      (copy) => (copy.packageHash = hash("forged-package")),
      (copy) => (copy.proofMaterialHash = hash("forged-proof")),
      (copy) => (copy.vectorHash = hash("forged-vector")),
      (copy) => (copy.governance.vectorHashPin = hash("forged-pin")),
      (copy) => (copy.vector.verificationReceiptHash = hash("forged-receipt")),
      (copy) => (copy.artifactEvidence.verifierKeyHash = hash("forged-key")),
      (copy) => (copy.attackerReady = true),
      (copy) => (copy.errors = ["hidden failure"]),
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(summary);
      mutate(copy);
      expect(
        validateSolanaProverKnownAnswerSummary({
          direction: "destination",
          summary: copy,
        }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("reports prove exceptions and timeouts without turning them into evidence", async () => {
    const material = materialFor("source");
    await expect(
      invokeSolanaProverKnownAnswer({
        direction: "source",
        prove: async () => {
          throw new Error("governed prover artifact unavailable");
        },
        ...material,
      }),
    ).resolves.toMatchObject({
      ready: false,
      invoked: true,
      errors: ["governed prover artifact unavailable"],
    });
    await expect(
      invokeSolanaProverKnownAnswer({
        direction: "source",
        prove: () => new Promise(() => {}),
        timeoutMs: 1,
        ...material,
      }),
    ).resolves.toMatchObject({
      ready: false,
      invoked: true,
      errors: ["known-answer prove timed out after 1ms"],
    });
  });
});
