// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  sign as signDetached,
} from "node:crypto";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS,
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
  SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH,
  SOLANA_LIVE_CAPTURE_WITNESS_IDS,
  analyzeSolanaLiveCaptureWitnessFrames,
  buildSolanaLiveCaptureReviewSigningPackage,
  buildSolanaLiveCaptureReviewSignedPayload,
  buildSolanaLiveCaptureWitnessPayloads,
  buildUnreviewedSolanaLiveCaptureReview,
  canonicalSolanaLiveCaptureReviewPolicyJson,
  decodeSolanaLiveCaptureWitnessQr,
  normalizeSolanaLiveCaptureReviewPolicy,
  normalizeSolanaLiveCaptureWitness,
  solanaLiveCaptureReviewSignaturePayloadBytes,
  verifySolanaLiveCaptureReviewAttestation,
} from "../scripts/e2e/sccp-solana-live-capture-witness.mjs";
import {
  assertSolanaLiveCaptureOutputsDisjoint,
  parseSolanaLiveCaptureCanonicalArtifactBytes,
  parseSolanaLiveVideoPinnedJsonBytes,
  writeSolanaLiveCaptureWitnessKit,
  writeSolanaLiveCaptureWitnessReviewRequest,
} from "../scripts/e2e/sccp-solana-live-video.mjs";
import { canonicalSccpJson } from "../scripts/e2e/sccp-solana-exact-registry.mjs";

const hash = (byte) => `0x${byte.repeat(64)}`;
const CAPTURE_SHA256 = hash("a");
const SNAPSHOT_SHA256 = hash("b");
const REVIEW_POLICY_SHA256 = hash("c");
const SOLANA_FINALIZE_SIGNATURE =
  "6pc4LiB8KHAPvbUbkozrTcPL5zXspYBdATv5raNDyVbhiKjrKokLb9o111kxTD5KkPVd7UBSCcFcnWFkrJ82Hu6";
const SOLANA_SOURCE_SIGNATURE =
  "7z8GcFcMNwCGuiNX7AzpkXrzhnqenSpYoA6hdHqfmbKSezHczNJCuakboR7M9FVPVsC9XxpKe8W99CuWRMYdMH7";

const liveEvidence = () => ({
  schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
  routeId: "taira_sol_xor",
  assetKey: "xor",
  governancePlanSha256: hash("1"),
  governanceRegistrationSha256: hash("2"),
  governanceActivationSha256: hash("3"),
  publicRegistrySha256: hash("4"),
  evidencePath: "/tmp/live-evidence.json",
  checkedAt: "2026-07-19T00:00:00.000Z",
  tairaToSolana: {
    amount: "1.25",
    amountBaseUnits: "1250000000",
    messageId: "11".repeat(32),
    tairaSourceTx: "22".repeat(32),
    solanaTxId: SOLANA_FINALIZE_SIGNATURE,
    solanaExplorerUrl: `https://explorer.solana.com/tx/${SOLANA_FINALIZE_SIGNATURE}?cluster=testnet`,
  },
  solanaToTaira: {
    amount: "0.5",
    amountBaseUnits: "500000000",
    messageId: "33".repeat(32),
    solanaSourceTx: SOLANA_SOURCE_SIGNATURE,
    tairaSettlementTx: "44".repeat(32),
    tairaExplorerUrl: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
  },
});

const reviewedWitness = (evidence = liveEvidence()) => {
  const built = buildSolanaLiveCaptureWitnessPayloads({
    liveEvidence: evidence,
    preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
  });
  return {
    schema: "iroha-demo-sccp-solana-live-capture-witness/v2",
    reviewPolicySha256: REVIEW_POLICY_SHA256,
    preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
    captureSha256: CAPTURE_SHA256,
    evidenceBindingSha256: built.evidenceBindingSha256,
    independentReview: {
      captureBytesIndependentlyPinned: true,
      continuousBidirectionalUiFlowReviewed: true,
      publicRegistryRevisionVisible: true,
      tairaToSolanaReceiptsVisible: true,
      solanaToTairaReceiptsVisible: true,
      unrelatedMediaAbsent: true,
      qrOverlayOnly: false,
    },
    markers: SOLANA_LIVE_CAPTURE_WITNESS_IDS.map((id, index) => ({
      id,
      atMilliseconds: 5_000 + index * 5_000,
      normalizedFrameSha256: hash(String(index + 5)),
    })),
  };
};

const normalize = (witness, evidence = liveEvidence()) =>
  normalizeSolanaLiveCaptureWitness(witness, {
    liveEvidence: evidence,
    preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
    expectedCaptureSha256: CAPTURE_SHA256,
    reviewPolicySha256: REVIEW_POLICY_SHA256,
    durationSeconds: 30,
  });

const policyReviewer = (reviewerId) => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return {
    reviewer: {
      reviewerId,
      publicKeySpkiDerBase64: der.toString("base64"),
      publicKeySpkiSha256: `0x${createHash("sha256")
        .update(der)
        .digest("hex")}`,
    },
    privateKey,
  };
};

const reviewedClaims = () => reviewedWitness().independentReview;

const normalizedReviewPolicy = ({ reviewerCount = 1, threshold = 1 } = {}) => {
  const keys = Array.from({ length: reviewerCount }, (_, index) =>
    policyReviewer(`reviewer-${String(index + 1).padStart(2, "0")}`),
  );
  const policy = {
    schema: "iroha-demo-sccp-solana-live-capture-review-policy/v1",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    routeRevision: 1,
    policyNonce: hash("d"),
    algorithm: "ed25519",
    threshold,
    requiredClaims: reviewedClaims(),
    markerIds: [
      "public-registry",
      "taira-to-solana",
      "solana-to-taira",
      "completed-readback",
    ],
    reviewers: keys.map((entry) => entry.reviewer),
  };
  const bytes = Buffer.from(
    `${canonicalSolanaLiveCaptureReviewPolicyJson(policy)}\n`,
  );
  const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  return {
    keys,
    policy,
    sha256,
    normalized: normalizeSolanaLiveCaptureReviewPolicy(policy, {
      actualPolicySha256: sha256,
      expectedPolicySha256: sha256,
    }),
  };
};

const authenticatedReview = ({ reviewerCount = 1, threshold = 1 } = {}) => {
  const review = normalizedReviewPolicy({ reviewerCount, threshold });
  const witnessInput = reviewedWitness();
  witnessInput.reviewPolicySha256 = review.sha256;
  const witness = normalizeSolanaLiveCaptureWitness(witnessInput, {
    liveEvidence: liveEvidence(),
    preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
    expectedCaptureSha256: CAPTURE_SHA256,
    reviewPolicySha256: review.sha256,
    durationSeconds: 30,
  });
  const witnessArtifactSha256 = hash("e");
  const signedPayload = buildSolanaLiveCaptureReviewSignedPayload({
    witness,
    witnessArtifactSha256,
  });
  const payloadBytes =
    solanaLiveCaptureReviewSignaturePayloadBytes(signedPayload);
  const signedPayloadSha256 = `0x${createHash("sha256")
    .update(payloadBytes)
    .digest("hex")}`;
  const signatures = review.keys.slice(0, threshold).map((entry) => ({
    reviewerId: entry.reviewer.reviewerId,
    algorithm: "ed25519",
    signedPayloadSha256,
    signatureBase64: signDetached(
      null,
      payloadBytes,
      entry.privateKey,
    ).toString("base64"),
  }));
  return {
    ...review,
    witness,
    witnessArtifactSha256,
    signedPayload,
    payloadBytes,
    attestation: {
      schema: "iroha-demo-sccp-solana-live-capture-review-attestation/v1",
      signedPayload,
      signatures,
    },
  };
};

const passingSamples = (witness) =>
  witness.markers.map((marker, index) => ({
    id: marker.id,
    atMilliseconds: marker.atMilliseconds,
    dwellFrames: SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS.map(
      (offsetMilliseconds) => ({
        offsetMilliseconds,
        normalizedFrameSha256:
          offsetMilliseconds === 0
            ? marker.normalizedFrameSha256
            : hash(String(index + (offsetMilliseconds < 0 ? 9 : 13))),
        decodedPayload: marker.expectedPayload,
      }),
    ),
  }));

const ffmpegAvailable =
  process.platform !== "win32" &&
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const itWithFfmpeg = ffmpegAvailable ? it : it.skip;

describe("Solana live capture semantic witness", () => {
  it("accepts only compact canonical artifact JSON plus one LF", () => {
    const value = { alpha: 1, beta: { ready: true } };
    const canonical = Buffer.from(`${canonicalSccpJson(value)}\n`, "utf8");
    expect(
      parseSolanaLiveCaptureCanonicalArtifactBytes(
        canonical,
        "review artifact",
      ),
    ).toEqual(value);
    expect(() =>
      parseSolanaLiveCaptureCanonicalArtifactBytes(
        Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
        "review artifact",
      ),
    ).toThrow(/compact canonical/u);
    expect(() =>
      parseSolanaLiveCaptureCanonicalArtifactBytes(
        Buffer.from('{"beta":{"ready":true},"alpha":1}\n', "utf8"),
        "review artifact",
      ),
    ).toThrow(/compact canonical/u);
    expect(() =>
      parseSolanaLiveCaptureCanonicalArtifactBytes(
        Buffer.from('{"alpha":1,"alpha":1}\n', "utf8"),
        "review artifact",
      ),
    ).toThrow(/duplicate/u);
  });
  it("emits deterministic signer-free domain-separated review bytes", () => {
    const witness = reviewedWitness();
    const witnessArtifactSha256 = hash("d");
    const signingPackage = buildSolanaLiveCaptureReviewSigningPackage({
      witness,
      witnessArtifactSha256,
    });
    const expectedPayload = buildSolanaLiveCaptureReviewSignedPayload({
      witness,
      witnessArtifactSha256,
    });
    const expectedBytes =
      solanaLiveCaptureReviewSignaturePayloadBytes(expectedPayload);

    expect(signingPackage).toMatchObject({
      signerFree: true,
      privateKeyInputsAccepted: false,
      signatureAlgorithm: "ed25519",
      witnessArtifactSha256,
      signedPayload: expectedPayload,
      signedPayloadSha256: `0x${createHash("sha256")
        .update(expectedBytes)
        .digest("hex")}`,
      signaturePayloadBase64: expectedBytes.toString("base64"),
    });
    expect(signingPackage).not.toHaveProperty("privateKey");
    expect(signingPackage).not.toHaveProperty("signature");
  });
  it("binds four ordered, independently reviewed frames to registry and both transfer directions", () => {
    const witness = normalize(reviewedWitness());
    const analysis = analyzeSolanaLiveCaptureWitnessFrames({
      witness,
      samples: passingSamples(witness),
    });

    expect(analysis).toMatchObject({
      ready: true,
      semanticallyBound: true,
      captureSha256: CAPTURE_SHA256,
      evidenceBindingSha256: witness.evidenceBindingSha256,
      blockers: [],
    });
    expect(analysis.markers).toHaveLength(4);
    expect(analysis.markers.every((marker) => marker.ready)).toBe(true);
  });

  it("rejects structurally valid unrelated footage without exact QR payloads", () => {
    const witness = normalize(reviewedWitness());
    const samples = passingSamples(witness);
    samples[1].dwellFrames.forEach((frame) => {
      frame.decodedPayload = "unrelated-moving-audible-media";
    });
    const analysis = analyzeSolanaLiveCaptureWitnessFrames({
      witness,
      samples,
    });

    expect(analysis.ready).toBe(false);
    expect(analysis.blockers).toEqual(
      expect.arrayContaining([
        "capture-semantic-witness-taira-to-solana-payload",
      ]),
    );
  });

  it("rejects a one-frame QR flash when either dwell neighbor is missing", () => {
    const witness = normalize(reviewedWitness());
    const samples = passingSamples(witness);
    samples[2].dwellFrames[0].decodedPayload = null;
    const analysis = analyzeSolanaLiveCaptureWitnessFrames({
      witness,
      samples,
    });

    expect(analysis.ready).toBe(false);
    expect(analysis.blockers).toEqual(
      expect.arrayContaining([
        "capture-semantic-witness-solana-to-taira-dwell",
      ]),
    );
  });

  it("rejects overlay-only review claims and repeated static center frames", () => {
    const overlayOnly = reviewedWitness();
    overlayOnly.independentReview.qrOverlayOnly = true;
    expect(() => normalize(overlayOnly)).toThrow(/overlay-only/u);

    const staticFrames = reviewedWitness();
    staticFrames.markers.forEach((marker) => {
      marker.normalizedFrameSha256 = hash("5");
    });
    expect(() => normalize(staticFrames)).toThrow(/four distinct/u);
  });

  it("never pre-approves procedural independent review assertions", () => {
    expect(buildUnreviewedSolanaLiveCaptureReview()).toEqual({
      captureBytesIndependentlyPinned: false,
      continuousBidirectionalUiFlowReviewed: false,
      publicRegistryRevisionVisible: false,
      tairaToSolanaReceiptsVisible: false,
      solanaToTairaReceiptsVisible: false,
      unrelatedMediaAbsent: false,
      qrOverlayOnly: true,
    });
  });

  it("authenticates a detached 1-of-1 Ed25519 review over every signed witness field", () => {
    const fixture = authenticatedReview();
    expect(
      verifySolanaLiveCaptureReviewAttestation({
        attestation: fixture.attestation,
        witness: fixture.witness,
        witnessArtifactSha256: fixture.witnessArtifactSha256,
        reviewPolicy: fixture.normalized,
      }),
    ).toMatchObject({
      ready: true,
      authenticated: true,
      threshold: 1,
      validSignatureCount: 1,
      validReviewerIds: ["reviewer-01"],
    });
  });

  it("enforces a 2-of-3 threshold by unique approved key fingerprint", () => {
    const fixture = authenticatedReview({ reviewerCount: 3, threshold: 2 });
    const verified = verifySolanaLiveCaptureReviewAttestation({
      attestation: fixture.attestation,
      witness: fixture.witness,
      witnessArtifactSha256: fixture.witnessArtifactSha256,
      reviewPolicy: fixture.normalized,
    });
    expect(verified).toMatchObject({
      threshold: 2,
      validSignatureCount: 2,
      validReviewerIds: ["reviewer-01", "reviewer-02"],
    });

    const belowThreshold = structuredClone(fixture.attestation);
    belowThreshold.signatures.pop();
    expect(() =>
      verifySolanaLiveCaptureReviewAttestation({
        attestation: belowThreshold,
        witness: fixture.witness,
        witnessArtifactSha256: fixture.witnessArtifactSha256,
        reviewPolicy: fixture.normalized,
      }),
    ).toThrow(/requires 2 unique valid reviewer/u);
  });

  it("rejects claim, capture, evidence, snapshot, policy, witness-hash, and marker tampering after signature", () => {
    const fixture = authenticatedReview();
    for (const mutate of [
      (payload) => (payload.reviewClaims.unrelatedMediaAbsent = false),
      (payload) => (payload.captureSha256 = hash("1")),
      (payload) => (payload.evidenceBindingSha256 = hash("2")),
      (payload) => (payload.preLiveInputSnapshotSha256 = hash("3")),
      (payload) => (payload.reviewPolicySha256 = hash("4")),
      (payload) => (payload.witnessArtifactSha256 = hash("5")),
      (payload) => payload.markers.reverse(),
      (payload) => (payload.markers[0].atMilliseconds += 1),
      (payload) => (payload.markers[0].normalizedFrameSha256 = hash("6")),
    ]) {
      const tampered = structuredClone(fixture.attestation);
      mutate(tampered.signedPayload);
      expect(() =>
        verifySolanaLiveCaptureReviewAttestation({
          attestation: tampered,
          witness: fixture.witness,
          witnessArtifactSha256: fixture.witnessArtifactSha256,
          reviewPolicy: fixture.normalized,
        }),
      ).toThrow(/signed payload does not match/u);
    }
  });

  it("rejects unknown, duplicate, unsorted, invalid, and malformed detached signatures", () => {
    const fixture = authenticatedReview({ reviewerCount: 3, threshold: 2 });
    const cases = [
      (attestation) => (attestation.signatures[0].reviewerId = "unknown"),
      (attestation) =>
        attestation.signatures.push(structuredClone(attestation.signatures[1])),
      (attestation) => attestation.signatures.reverse(),
      (attestation) =>
        (attestation.signatures[0].signatureBase64 =
          Buffer.alloc(64).toString("base64")),
      (attestation) => (attestation.signatures[0].algorithm = "ecdsa"),
      (attestation) =>
        (attestation.signatures[0].signedPayloadSha256 = hash("9")),
      (attestation) =>
        (attestation.signatures[0].signatureBase64 = "not-base64"),
    ];
    for (const mutate of cases) {
      const tampered = structuredClone(fixture.attestation);
      mutate(tampered);
      expect(() =>
        verifySolanaLiveCaptureReviewAttestation({
          attestation: tampered,
          witness: fixture.witness,
          witnessArtifactSha256: fixture.witnessArtifactSha256,
          reviewPolicy: fixture.normalized,
        }),
      ).toThrow();
    }
  });

  it("rejects approval-policy substitution, duplicate reviewer keys, invalid thresholds, and non-Ed25519 SPKI", () => {
    const fixture = normalizedReviewPolicy({ reviewerCount: 2 });
    expect(() =>
      normalizeSolanaLiveCaptureReviewPolicy(fixture.policy, {
        actualPolicySha256: fixture.sha256,
        expectedPolicySha256: hash("f"),
      }),
    ).toThrow(/approval pin/u);

    const duplicateKey = structuredClone(fixture.policy);
    duplicateKey.reviewers[1].publicKeySpkiDerBase64 =
      duplicateKey.reviewers[0].publicKeySpkiDerBase64;
    duplicateKey.reviewers[1].publicKeySpkiSha256 =
      duplicateKey.reviewers[0].publicKeySpkiSha256;
    expect(() =>
      normalizeSolanaLiveCaptureReviewPolicy(duplicateKey, {
        actualPolicySha256: fixture.sha256,
        expectedPolicySha256: fixture.sha256,
      }),
    ).toThrow(/reviewer keys must be unique/u);

    for (const threshold of [0, 3]) {
      const invalid = structuredClone(fixture.policy);
      invalid.threshold = threshold;
      expect(() =>
        normalizeSolanaLiveCaptureReviewPolicy(invalid, {
          actualPolicySha256: fixture.sha256,
          expectedPolicySha256: fixture.sha256,
        }),
      ).toThrow(/threshold/u);
    }

    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const der = publicKey.export({ format: "der", type: "spki" });
    const wrongKey = structuredClone(fixture.policy);
    wrongKey.reviewers[0].publicKeySpkiDerBase64 = der.toString("base64");
    wrongKey.reviewers[0].publicKeySpkiSha256 = `0x${createHash("sha256")
      .update(der)
      .digest("hex")}`;
    expect(() =>
      normalizeSolanaLiveCaptureReviewPolicy(wrongKey, {
        actualPolicySha256: fixture.sha256,
        expectedPolicySha256: fixture.sha256,
      }),
    ).toThrow(/44 bytes|Ed25519/u);
  });

  it("production-rejects the unsigned v1 witness schema", () => {
    const v1 = reviewedWitness();
    v1.schema = "iroha-demo-sccp-solana-live-capture-witness/v1";
    expect(() => normalize(v1)).toThrow(/witness schema/u);
  });

  it("rejects transaction, registry, capture-pin, and canonical-case tampering", () => {
    const witness = reviewedWitness();
    const changedEvidence = liveEvidence();
    changedEvidence.tairaToSolana.tairaSourceTx = "55".repeat(32);
    expect(() => normalize(witness, changedEvidence)).toThrow(
      /exact registry and bidirectional transaction evidence/u,
    );

    const wrongCapture = reviewedWitness();
    wrongCapture.captureSha256 = hash("c");
    expect(() => normalize(wrongCapture)).toThrow(/pinned capture bytes/u);

    const uppercase = reviewedWitness();
    uppercase.captureSha256 = uppercase.captureSha256.toUpperCase();
    expect(() => normalize(uppercase)).toThrow(/lowercase canonical hex/u);
  });

  it("decodes an exact witness QR from the normalized capture frame", async () => {
    const witness = normalize(reviewedWitness());
    const payload = witness.markers[0].expectedPayload;
    const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
    const quietModules = 4;
    const scale = Math.floor(420 / (qr.modules.size + quietModules * 2));
    const renderedSize = (qr.modules.size + quietModules * 2) * scale;
    const gray = new Uint8Array(
      SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH *
        SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
    ).fill(255);
    const left = Math.floor(
      (SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH - renderedSize) / 2,
    );
    const top = Math.floor(
      (SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT - renderedSize) / 2,
    );
    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let column = 0; column < qr.modules.size; column += 1) {
        if (!qr.modules.get(row, column)) continue;
        const moduleTop = top + (quietModules + row) * scale;
        const moduleLeft = left + (quietModules + column) * scale;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            gray[
              (moduleTop + y) * SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH +
                moduleLeft +
                x
            ] = 0;
          }
        }
      }
    }

    expect(decodeSolanaLiveCaptureWitnessQr({ grayscaleBytes: gray })).toBe(
      payload,
    );
  });

  it("writes a signer-free QR kit without opening or modifying a capture", async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-witness-kit-"),
    );
    try {
      const kit = await writeSolanaLiveCaptureWitnessKit({
        outputDir,
        liveEvidence: liveEvidence(),
        preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
      });

      expect(kit.report).toMatchObject({
        productionReady: false,
        diagnosticOnly: true,
        modifiesCapture: false,
        routeId: "taira_sol_xor",
      });
      expect(kit.report.cards).toHaveLength(4);
      await expect(
        readFile(path.join(outputDir, "index.html"), "utf8"),
      ).resolves.toContain("taira_sol_xor");
      for (const card of kit.report.cards) {
        const bytes = await readFile(path.join(outputDir, card.filename));
        expect(bytes.length).toBeGreaterThan(0);
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  itWithFfmpeg(
    "decodes all 12 dwell samples through one reused seekable ffmpeg descriptor",
    async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "sccp-solana-witness-multiseek-"),
      );
      try {
        const kit = await writeSolanaLiveCaptureWitnessKit({
          outputDir: path.join(directory, "kit"),
          liveEvidence: liveEvidence(),
          preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
          reviewPolicySha256: REVIEW_POLICY_SHA256,
          reviewPolicy: {
            threshold: 1,
            reviewers: [{ reviewerId: "reviewer-a" }],
          },
        });
        const capturePath = path.join(directory, "diagnostic-qr-sequence.mp4");
        const args = ["-y"];
        for (const card of kit.report.cards) {
          args.push(
            "-loop",
            "1",
            "-framerate",
            "30",
            "-t",
            "2",
            "-i",
            path.join(kit.outputDir, card.filename),
          );
        }
        args.push(
          "-f",
          "lavfi",
          "-t",
          "8",
          "-i",
          "sine=frequency=880:sample_rate=48000",
          "-filter_complex",
          [0, 1, 2, 3]
            .map(
              (index) =>
                `[${index}:v]scale=512:512,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[v${index}]`,
            )
            .concat("[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]")
            .join(";"),
          "-map",
          "[v]",
          "-map",
          "4:a:0",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          capturePath,
        );
        const encoded = spawnSync("ffmpeg", args, {
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
        });
        expect(encoded.status, encoded.stderr).toBe(0);
        const captureBytes = await readFile(capturePath);
        const captureSha256 = `0x${createHash("sha256")
          .update(captureBytes)
          .digest("hex")}`;

        const reviewRequest = await writeSolanaLiveCaptureWitnessReviewRequest({
          outputPath: path.join(directory, "review-request.json"),
          captureVideoPath: capturePath,
          expectedCaptureSha256: captureSha256,
          markerTimesMilliseconds: [1_000, 3_000, 5_000, 7_000],
          liveEvidence: liveEvidence(),
          preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
          reviewPolicySha256: REVIEW_POLICY_SHA256,
          reviewPolicy: {
            threshold: 1,
            reviewers: [{ reviewerId: "reviewer-a" }],
          },
        });

        expect(reviewRequest.report).toMatchObject({
          productionReady: false,
          captureSha256Verified: true,
          captureSha256,
          candidateWitness: {
            schema: "iroha-demo-sccp-solana-live-capture-witness/v2",
            reviewPolicySha256: REVIEW_POLICY_SHA256,
            preLiveInputSnapshotSha256: SNAPSHOT_SHA256,
            independentReview: buildUnreviewedSolanaLiveCaptureReview(),
          },
          detachedReviewAttestation: {
            required: true,
            threshold: 1,
            authorizedReviewerIds: ["reviewer-a"],
            privateKeyInputsAccepted: false,
          },
        });
        expect(reviewRequest.report.decodedDwellWindows).toHaveLength(4);
        expect(
          reviewRequest.report.decodedDwellWindows.every(
            (window) =>
              window.offsetsMilliseconds.length === 3 &&
              window.offsetsMilliseconds.join(",") === "-250,0,250",
          ),
        ).toBe(true);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it("rejects output paths and hardlinks that alias pinned inputs", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "sccp-solana-witness-disjoint-"),
    );
    try {
      const input = path.join(directory, "pinned-capture.mp4");
      const hardlink = path.join(directory, "review-request.json");
      await writeFile(input, "pinned capture bytes");
      await link(input, hardlink);

      await expect(
        assertSolanaLiveCaptureOutputsDisjoint({
          outputPaths: [input],
          protectedInputPaths: [input],
        }),
      ).rejects.toThrow(/disjoint/u);
      await expect(
        assertSolanaLiveCaptureOutputsDisjoint({
          outputPaths: [hardlink],
          protectedInputPaths: [input],
        }),
      ).rejects.toThrow(/aliases a pinned input inode/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects duplicate-key and invalid UTF-8 pinned snapshot JSON", () => {
    expect(() =>
      parseSolanaLiveVideoPinnedJsonBytes(
        Buffer.from('{"ready":true,"ready":false}\n', "utf8"),
        "pinned snapshot",
      ),
    ).toThrow(/duplicate-free/u);
    expect(() =>
      parseSolanaLiveVideoPinnedJsonBytes(
        Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]),
        "pinned snapshot",
      ),
    ).toThrow(/valid UTF-8/u);
  });
});
