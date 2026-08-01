/* global BigInt */
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { canonicalSccpJson } from "./sccp-solana-exact-registry.mjs";

export const SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA =
  "iroha-demo-sccp-solana-live-capture-witness/v2";
export const SOLANA_LIVE_CAPTURE_REVIEW_POLICY_SCHEMA =
  "iroha-demo-sccp-solana-live-capture-review-policy/v1";
export const SOLANA_LIVE_CAPTURE_REVIEW_ATTESTATION_SCHEMA =
  "iroha-demo-sccp-solana-live-capture-review-attestation/v1";
export const SOLANA_LIVE_CAPTURE_REVIEW_SIGNED_PAYLOAD_SCHEMA =
  "iroha-demo-sccp-solana-live-capture-review-signed-payload/v1";
export const SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN =
  "iroha-demo:sccp-solana:live-capture-review:v1\0";
export const SOLANA_LIVE_CAPTURE_WITNESS_PAYLOAD_PREFIX =
  "sccp-solana-capture:v1";
export const SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH = 960;
export const SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT = 540;
export const SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS =
  Object.freeze([-250, 0, 250]);

export const SOLANA_LIVE_CAPTURE_WITNESS_IDS = Object.freeze([
  "public-registry",
  "taira-to-solana",
  "solana-to-taira",
  "completed-readback",
]);

export const buildUnreviewedSolanaLiveCaptureReview = () => ({
  captureBytesIndependentlyPinned: false,
  continuousBidirectionalUiFlowReviewed: false,
  publicRegistryRevisionVisible: false,
  tairaToSolanaReceiptsVisible: false,
  solanaToTairaReceiptsVisible: false,
  unrelatedMediaAbsent: false,
  qrOverlayOnly: true,
});

const HEX32 = /^0x[0-9a-f]{64}$/u;
const NON_ZERO_HEX32 = /^(?!0x0{64}$)0x[0-9a-f]{64}$/u;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
const DECIMAL_BASE_UNITS = /^(?:0|[1-9][0-9]*)$/u;
const REVIEWER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const MIN_MARKER_GAP_MILLISECONDS = 1_500;
const MIN_MARKER_OFFSET_MILLISECONDS = 500;
const END_MARKER_MARGIN_MILLISECONDS = 250;
const MAX_CAPTURE_REVIEWERS = 32;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireExactKeys = (record, keys, label) => {
  if (!isRecord(record)) {
    throw new Error(`${label} is missing.`);
  }
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
  return record;
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is missing.`);
  }
  return value;
};

const requiredHash = (value, label, { nonZero = false } = {}) => {
  const raw = requiredString(value, label);
  const normalized = raw.toLowerCase();
  if (raw !== normalized) {
    throw new Error(`${label} must use lowercase canonical hex.`);
  }
  if (!(nonZero ? NON_ZERO_HEX32 : HEX32).test(normalized)) {
    throw new Error(`${label} must be a lowercase canonical 0x SHA-256.`);
  }
  return normalized;
};

const requiredNonZeroHex32 = (value, label) => {
  const raw = requiredString(value, label);
  const normalized = raw.toLowerCase();
  if (raw !== normalized) {
    throw new Error(`${label} must use lowercase canonical hex.`);
  }
  if (!NON_ZERO_HEX32.test(normalized)) {
    throw new Error(
      `${label} must be a non-zero lowercase 0x 32-byte hex value.`,
    );
  }
  return normalized;
};

const requiredSolanaSignature = (value, label) => {
  const normalized = requiredString(value, label);
  if (!SOLANA_SIGNATURE.test(normalized)) {
    throw new Error(`${label} must be a canonical Solana signature.`);
  }
  return normalized;
};

const requiredBaseUnits = (value, label) => {
  const normalized = requiredString(value, label);
  if (!DECIMAL_BASE_UNITS.test(normalized) || BigInt(normalized) <= 0n) {
    throw new Error(`${label} must be positive decimal base units.`);
  }
  return normalized;
};

const hashCanonical = (value) =>
  `0x${createHash("sha256")
    .update(canonicalSccpJson(value), "utf8")
    .digest("hex")}`;

const sha256Bytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const exactLiveEvidenceBinding = ({
  liveEvidence,
  preLiveInputSnapshotSha256,
}) => {
  if (!isRecord(liveEvidence)) {
    throw new Error("Normalized Solana live transfer evidence is missing.");
  }
  const forward = requireExactKeys(
    liveEvidence.tairaToSolana,
    [
      "amount",
      "amountBaseUnits",
      "messageId",
      "solanaExplorerUrl",
      "solanaTxId",
      "tairaSourceTx",
    ],
    "TAIRA-to-Solana live evidence",
  );
  const reverse = requireExactKeys(
    liveEvidence.solanaToTaira,
    [
      "amount",
      "amountBaseUnits",
      "messageId",
      "solanaSourceTx",
      "tairaExplorerUrl",
      "tairaSettlementTx",
    ],
    "Solana-to-TAIRA live evidence",
  );
  if (
    liveEvidence.routeId !== "taira_sol_xor" ||
    liveEvidence.assetKey !== "xor"
  ) {
    throw new Error(
      "Live capture witness requires exact taira_sol_xor/xor evidence.",
    );
  }
  return {
    schema: "iroha-demo-sccp-solana-live-capture-evidence-binding/v1",
    routeId: "taira_sol_xor",
    assetKey: "xor",
    preLiveInputSnapshotSha256: requiredHash(
      preLiveInputSnapshotSha256,
      "pre-live input snapshot SHA-256",
      { nonZero: true },
    ),
    governance: {
      planSha256: requiredHash(
        liveEvidence.governancePlanSha256,
        "governance plan SHA-256",
        { nonZero: true },
      ),
      registrationSha256: requiredHash(
        liveEvidence.governanceRegistrationSha256,
        "governance registration SHA-256",
        { nonZero: true },
      ),
      activationSha256: requiredHash(
        liveEvidence.governanceActivationSha256,
        "governance activation SHA-256",
        { nonZero: true },
      ),
      publicRegistrySha256: requiredHash(
        liveEvidence.publicRegistrySha256,
        "public typed-registry SHA-256",
        { nonZero: true },
      ),
    },
    tairaToSolana: {
      amountBaseUnits: requiredBaseUnits(
        forward.amountBaseUnits,
        "TAIRA-to-Solana amount base units",
      ),
      messageId: requiredNonZeroHex32(
        `0x${String(forward.messageId).replace(/^0x/u, "")}`,
        "TAIRA-to-Solana message id",
      ),
      tairaSourceTx: requiredNonZeroHex32(
        `0x${String(forward.tairaSourceTx).replace(/^0x/u, "")}`,
        "TAIRA-to-Solana source transaction",
      ),
      solanaFinalizeTx: requiredSolanaSignature(
        forward.solanaTxId,
        "TAIRA-to-Solana finalize signature",
      ),
    },
    solanaToTaira: {
      amountBaseUnits: requiredBaseUnits(
        reverse.amountBaseUnits,
        "Solana-to-TAIRA amount base units",
      ),
      messageId: requiredNonZeroHex32(
        `0x${String(reverse.messageId).replace(/^0x/u, "")}`,
        "Solana-to-TAIRA message id",
      ),
      solanaSourceTx: requiredSolanaSignature(
        reverse.solanaSourceTx,
        "Solana-to-TAIRA source signature",
      ),
      tairaSettlementTx: requiredNonZeroHex32(
        `0x${String(reverse.tairaSettlementTx).replace(/^0x/u, "")}`,
        "Solana-to-TAIRA settlement transaction",
      ),
    },
  };
};

export const buildSolanaLiveCaptureWitnessPayloads = ({
  liveEvidence,
  preLiveInputSnapshotSha256,
}) => {
  const binding = exactLiveEvidenceBinding({
    liveEvidence,
    preLiveInputSnapshotSha256,
  });
  const evidenceBindingSha256 = hashCanonical(binding);
  const stageBodies = {
    "public-registry": {
      stage: "public-registry",
      routeId: binding.routeId,
      assetKey: binding.assetKey,
      preLiveInputSnapshotSha256: binding.preLiveInputSnapshotSha256,
      ...binding.governance,
    },
    "taira-to-solana": {
      stage: "taira-to-solana",
      routeId: binding.routeId,
      publicRegistrySha256: binding.governance.publicRegistrySha256,
      ...binding.tairaToSolana,
    },
    "solana-to-taira": {
      stage: "solana-to-taira",
      routeId: binding.routeId,
      publicRegistrySha256: binding.governance.publicRegistrySha256,
      ...binding.solanaToTaira,
    },
  };
  const stageHashes = Object.fromEntries(
    Object.entries(stageBodies).map(([id, body]) => [id, hashCanonical(body)]),
  );
  stageHashes["completed-readback"] = hashCanonical({
    stage: "completed-readback",
    routeId: binding.routeId,
    evidenceBindingSha256,
    publicRegistry: stageHashes["public-registry"],
    tairaToSolana: stageHashes["taira-to-solana"],
    solanaToTaira: stageHashes["solana-to-taira"],
  });
  const payloads = Object.fromEntries(
    SOLANA_LIVE_CAPTURE_WITNESS_IDS.map((id) => [
      id,
      `${SOLANA_LIVE_CAPTURE_WITNESS_PAYLOAD_PREFIX}:${id}:${stageHashes[id]}`,
    ]),
  );
  return { binding, evidenceBindingSha256, stageHashes, payloads };
};

const exactIndependentReview = (review) => {
  requireExactKeys(
    review,
    [
      "captureBytesIndependentlyPinned",
      "continuousBidirectionalUiFlowReviewed",
      "publicRegistryRevisionVisible",
      "tairaToSolanaReceiptsVisible",
      "solanaToTairaReceiptsVisible",
      "unrelatedMediaAbsent",
      "qrOverlayOnly",
    ],
    "live capture independent review",
  );
  const requiredTrue = [
    "captureBytesIndependentlyPinned",
    "continuousBidirectionalUiFlowReviewed",
    "publicRegistryRevisionVisible",
    "tairaToSolanaReceiptsVisible",
    "solanaToTairaReceiptsVisible",
    "unrelatedMediaAbsent",
  ];
  for (const field of requiredTrue) {
    if (review[field] !== true) {
      throw new Error(`live capture independent review ${field} must be true.`);
    }
  }
  if (review.qrOverlayOnly !== false) {
    throw new Error(
      "live capture independent review must reject QR-overlay-only media.",
    );
  }
  return { ...review };
};

const canonicalBase64Bytes = (value, label, expectedLength = null) => {
  const encoded = requiredString(value, label);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  ) {
    throw new Error(`${label} must use canonical padded base64.`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.toString("base64") !== encoded ||
    (expectedLength !== null && bytes.length !== expectedLength)
  ) {
    throw new Error(
      `${label} must decode to ${expectedLength ?? "canonical"} bytes.`,
    );
  }
  return bytes;
};

const normalizeEd25519Reviewer = (reviewer, index) => {
  const label = `live capture review policy reviewer ${index + 1}`;
  requireExactKeys(
    reviewer,
    ["reviewerId", "publicKeySpkiDerBase64", "publicKeySpkiSha256"],
    label,
  );
  const reviewerId = requiredString(reviewer.reviewerId, `${label} id`);
  if (!REVIEWER_ID.test(reviewerId)) {
    throw new Error(`${label} id is not canonical.`);
  }
  const publicKeyDer = canonicalBase64Bytes(
    reviewer.publicKeySpkiDerBase64,
    `${label} Ed25519 SPKI DER`,
    44,
  );
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki",
    });
  } catch (cause) {
    throw new Error(`${label} must contain valid Ed25519 SPKI DER.`, {
      cause,
    });
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`${label} public key must be Ed25519.`);
  }
  const reexported = publicKey.export({ format: "der", type: "spki" });
  if (!Buffer.isBuffer(reexported) || !reexported.equals(publicKeyDer)) {
    throw new Error(
      `${label} Ed25519 SPKI DER must re-export byte-identically.`,
    );
  }
  const publicKeySpkiSha256 = requiredHash(
    reviewer.publicKeySpkiSha256,
    `${label} SPKI SHA-256`,
    { nonZero: true },
  );
  if (publicKeySpkiSha256 !== sha256Bytes(publicKeyDer)) {
    throw new Error(`${label} SPKI SHA-256 does not match its exact DER.`);
  }
  return {
    reviewerId,
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySpkiSha256,
  };
};

export const canonicalSolanaLiveCaptureReviewPolicyJson = (policy) =>
  canonicalSccpJson(policy);

export const normalizeSolanaLiveCaptureReviewPolicy = (
  policy,
  { actualPolicySha256, expectedPolicySha256 } = {},
) => {
  requireExactKeys(
    policy,
    [
      "schema",
      "routeId",
      "assetKey",
      "routeRevision",
      "policyNonce",
      "algorithm",
      "threshold",
      "requiredClaims",
      "markerIds",
      "reviewers",
    ],
    "Solana live capture review policy",
  );
  if (policy.schema !== SOLANA_LIVE_CAPTURE_REVIEW_POLICY_SCHEMA) {
    throw new Error(
      `Solana live capture review policy schema must be ${SOLANA_LIVE_CAPTURE_REVIEW_POLICY_SCHEMA}.`,
    );
  }
  if (
    policy.routeId !== "taira_sol_xor" ||
    policy.assetKey !== "xor" ||
    policy.routeRevision !== 1
  ) {
    throw new Error(
      "Solana live capture review policy must target taira_sol_xor/xor revision 1.",
    );
  }
  if (policy.algorithm !== "ed25519") {
    throw new Error("Solana live capture review policy must use Ed25519.");
  }
  const policyNonce = requiredHash(
    policy.policyNonce,
    "Solana live capture review policy nonce",
    { nonZero: true },
  );
  const requiredClaims = exactIndependentReview(policy.requiredClaims);
  if (
    !Array.isArray(policy.markerIds) ||
    JSON.stringify(policy.markerIds) !==
      JSON.stringify(SOLANA_LIVE_CAPTURE_WITNESS_IDS)
  ) {
    throw new Error(
      "Solana live capture review policy marker IDs must use the exact first-release order.",
    );
  }
  if (
    !Array.isArray(policy.reviewers) ||
    policy.reviewers.length === 0 ||
    policy.reviewers.length > MAX_CAPTURE_REVIEWERS
  ) {
    throw new Error(
      `Solana live capture review policy must contain between 1 and ${MAX_CAPTURE_REVIEWERS} reviewers.`,
    );
  }
  const reviewers = policy.reviewers.map(normalizeEd25519Reviewer);
  const reviewerIds = reviewers.map((reviewer) => reviewer.reviewerId);
  if (JSON.stringify(reviewerIds) !== JSON.stringify([...reviewerIds].sort())) {
    throw new Error(
      "Solana live capture review policy reviewers must be sorted by reviewer ID.",
    );
  }
  if (new Set(reviewerIds).size !== reviewers.length) {
    throw new Error(
      "Solana live capture review policy reviewer IDs must be unique.",
    );
  }
  const fingerprints = reviewers.map(
    (reviewer) => reviewer.publicKeySpkiSha256,
  );
  if (new Set(fingerprints).size !== reviewers.length) {
    throw new Error(
      "Solana live capture review policy reviewer keys must be unique.",
    );
  }
  if (
    !Number.isSafeInteger(policy.threshold) ||
    policy.threshold < 1 ||
    policy.threshold > reviewers.length
  ) {
    throw new Error(
      "Solana live capture review policy threshold must be between one and the unique reviewer count.",
    );
  }
  const actualSha256 = requiredHash(
    actualPolicySha256,
    "actual Solana live capture review policy SHA-256",
    { nonZero: true },
  );
  const expectedSha256 = requiredHash(
    expectedPolicySha256,
    "approved Solana live capture review policy SHA-256",
    { nonZero: true },
  );
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      "Solana live capture review policy bytes do not match the prover-governance approval pin.",
    );
  }
  return {
    schema: SOLANA_LIVE_CAPTURE_REVIEW_POLICY_SCHEMA,
    routeId: "taira_sol_xor",
    assetKey: "xor",
    routeRevision: 1,
    policyNonce,
    algorithm: "ed25519",
    threshold: policy.threshold,
    requiredClaims,
    markerIds: [...SOLANA_LIVE_CAPTURE_WITNESS_IDS],
    reviewers,
    policySha256: actualSha256,
  };
};

export const normalizeSolanaLiveCaptureWitness = (
  witness,
  {
    liveEvidence,
    preLiveInputSnapshotSha256,
    expectedCaptureSha256,
    reviewPolicySha256,
    durationSeconds = null,
  } = {},
) => {
  requireExactKeys(
    witness,
    [
      "schema",
      "reviewPolicySha256",
      "preLiveInputSnapshotSha256",
      "captureSha256",
      "evidenceBindingSha256",
      "independentReview",
      "markers",
    ],
    "Solana live capture witness",
  );
  if (witness.schema !== SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA) {
    throw new Error(
      `Solana live capture witness schema must be ${SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA}.`,
    );
  }
  const expected = buildSolanaLiveCaptureWitnessPayloads({
    liveEvidence,
    preLiveInputSnapshotSha256,
  });
  const normalizedSnapshotSha256 = requiredHash(
    witness.preLiveInputSnapshotSha256,
    "live capture witness pre-live input snapshot SHA-256",
    { nonZero: true },
  );
  if (
    normalizedSnapshotSha256 !==
    requiredHash(
      preLiveInputSnapshotSha256,
      "expected pre-live input snapshot SHA-256",
      { nonZero: true },
    )
  ) {
    throw new Error(
      "Live capture witness is not bound to the exact pre-live input snapshot.",
    );
  }
  const normalizedReviewPolicySha256 = requiredHash(
    witness.reviewPolicySha256,
    "live capture witness review policy SHA-256",
    { nonZero: true },
  );
  if (
    normalizedReviewPolicySha256 !==
    requiredHash(
      reviewPolicySha256,
      "expected live capture review policy SHA-256",
      { nonZero: true },
    )
  ) {
    throw new Error(
      "Live capture witness is not bound to the approved review policy.",
    );
  }
  const captureSha256 = requiredHash(
    witness.captureSha256,
    "live capture witness capture SHA-256",
    { nonZero: true },
  );
  if (
    captureSha256 !==
    requiredHash(expectedCaptureSha256, "expected live capture SHA-256", {
      nonZero: true,
    })
  ) {
    throw new Error(
      "Live capture witness is not bound to the independently pinned capture bytes.",
    );
  }
  const evidenceBindingSha256 = requiredHash(
    witness.evidenceBindingSha256,
    "live capture witness evidence binding SHA-256",
    { nonZero: true },
  );
  if (evidenceBindingSha256 !== expected.evidenceBindingSha256) {
    throw new Error(
      "Live capture witness is not bound to the exact registry and bidirectional transaction evidence.",
    );
  }
  const independentReview = exactIndependentReview(witness.independentReview);
  if (!Array.isArray(witness.markers) || witness.markers.length !== 4) {
    throw new Error("Solana live capture witness must contain four markers.");
  }
  let previousAt = -Infinity;
  const durationMilliseconds = Number.isFinite(Number(durationSeconds))
    ? Math.floor(Number(durationSeconds) * 1000)
    : null;
  const markers = witness.markers.map((marker, index) => {
    requireExactKeys(
      marker,
      ["id", "atMilliseconds", "normalizedFrameSha256"],
      `Solana live capture witness marker ${index + 1}`,
    );
    const expectedId = SOLANA_LIVE_CAPTURE_WITNESS_IDS[index];
    if (marker.id !== expectedId) {
      throw new Error(
        `Solana live capture witness marker ${index + 1} must be ${expectedId}.`,
      );
    }
    if (
      !Number.isSafeInteger(marker.atMilliseconds) ||
      marker.atMilliseconds < MIN_MARKER_OFFSET_MILLISECONDS
    ) {
      throw new Error(
        `Solana live capture witness ${expectedId} timestamp is invalid.`,
      );
    }
    if (marker.atMilliseconds - previousAt < MIN_MARKER_GAP_MILLISECONDS) {
      throw new Error(
        "Solana live capture witness markers must be ordered and temporally distinct.",
      );
    }
    if (
      durationMilliseconds !== null &&
      marker.atMilliseconds >
        durationMilliseconds - END_MARKER_MARGIN_MILLISECONDS
    ) {
      throw new Error(
        `Solana live capture witness ${expectedId} occurs after the captured media ends.`,
      );
    }
    previousAt = marker.atMilliseconds;
    return {
      id: expectedId,
      atMilliseconds: marker.atMilliseconds,
      normalizedFrameSha256: requiredHash(
        marker.normalizedFrameSha256,
        `Solana live capture witness ${expectedId} normalized frame SHA-256`,
        { nonZero: true },
      ),
      expectedPayload: expected.payloads[expectedId],
      expectedPayloadSha256: expected.stageHashes[expectedId],
    };
  });
  if (
    new Set(markers.map((marker) => marker.normalizedFrameSha256)).size !== 4
  ) {
    throw new Error(
      "Solana live capture witness markers must pin four distinct normalized frames.",
    );
  }
  return {
    schema: SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA,
    reviewPolicySha256: normalizedReviewPolicySha256,
    preLiveInputSnapshotSha256: normalizedSnapshotSha256,
    captureSha256,
    evidenceBindingSha256,
    independentReview,
    frameNormalization: {
      pixelFormat: "gray8",
      width: SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH,
      height: SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
    },
    markers,
  };
};

const signedMarker = (marker) => ({
  id: marker.id,
  atMilliseconds: marker.atMilliseconds,
  normalizedFrameSha256: marker.normalizedFrameSha256,
});

export const buildSolanaLiveCaptureReviewSignedPayload = ({
  witness,
  witnessArtifactSha256,
} = {}) => {
  if (!isRecord(witness)) {
    throw new Error("Solana live capture review signing witness is missing.");
  }
  const rawWitnessKeys = [
    "schema",
    "reviewPolicySha256",
    "preLiveInputSnapshotSha256",
    "captureSha256",
    "evidenceBindingSha256",
    "independentReview",
    "markers",
  ].sort();
  const actualWitnessKeys = Object.keys(witness).sort();
  const normalizedWitnessKeys = [
    ...rawWitnessKeys,
    "frameNormalization",
  ].sort();
  if (
    JSON.stringify(actualWitnessKeys) !== JSON.stringify(rawWitnessKeys) &&
    JSON.stringify(actualWitnessKeys) !== JSON.stringify(normalizedWitnessKeys)
  ) {
    throw new Error(
      "Solana live capture review signing witness has missing or extra fields.",
    );
  }
  if (witness.schema !== SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA) {
    throw new Error(
      `Solana live capture review signing requires ${SOLANA_LIVE_CAPTURE_WITNESS_SCHEMA}.`,
    );
  }
  if (
    !Array.isArray(witness.markers) ||
    witness.markers.length !== SOLANA_LIVE_CAPTURE_WITNESS_IDS.length
  ) {
    throw new Error(
      "Solana live capture review signing requires four ordered witness markers.",
    );
  }
  const markers = witness.markers.map((marker, index) => {
    const expectedId = SOLANA_LIVE_CAPTURE_WITNESS_IDS[index];
    if (
      marker?.id !== expectedId ||
      !Number.isSafeInteger(marker?.atMilliseconds) ||
      marker.atMilliseconds < MIN_MARKER_OFFSET_MILLISECONDS
    ) {
      throw new Error(
        `Solana live capture review signing marker ${index + 1} must be ${expectedId} with a canonical time.`,
      );
    }
    return {
      id: expectedId,
      atMilliseconds: marker.atMilliseconds,
      normalizedFrameSha256: requiredHash(
        marker.normalizedFrameSha256,
        `Solana live capture review signing marker ${expectedId} frame SHA-256`,
        { nonZero: true },
      ),
    };
  });
  return {
    schema: SOLANA_LIVE_CAPTURE_REVIEW_SIGNED_PAYLOAD_SCHEMA,
    routeId: "taira_sol_xor",
    assetKey: "xor",
    routeRevision: 1,
    witnessArtifactSha256: requiredHash(
      witnessArtifactSha256,
      "live capture witness artifact SHA-256",
      { nonZero: true },
    ),
    reviewPolicySha256: requiredHash(
      witness.reviewPolicySha256,
      "live capture witness review policy SHA-256",
      { nonZero: true },
    ),
    preLiveInputSnapshotSha256: requiredHash(
      witness.preLiveInputSnapshotSha256,
      "live capture witness pre-live input snapshot SHA-256",
      { nonZero: true },
    ),
    captureSha256: requiredHash(
      witness.captureSha256,
      "live capture witness capture SHA-256",
      { nonZero: true },
    ),
    evidenceBindingSha256: requiredHash(
      witness.evidenceBindingSha256,
      "live capture witness evidence binding SHA-256",
      { nonZero: true },
    ),
    reviewClaims: exactIndependentReview(witness.independentReview),
    markers: markers.map(signedMarker),
  };
};

export const solanaLiveCaptureReviewSignaturePayloadBytes = (signedPayload) =>
  Buffer.concat([
    Buffer.from(SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN, "utf8"),
    Buffer.from(canonicalSccpJson(signedPayload), "utf8"),
  ]);

export const buildSolanaLiveCaptureReviewSigningPackage = ({
  witness,
  witnessArtifactSha256,
} = {}) => {
  const signedPayload = buildSolanaLiveCaptureReviewSignedPayload({
    witness,
    witnessArtifactSha256,
  });
  const canonicalSignedPayloadJson = canonicalSccpJson(signedPayload);
  const signaturePayloadBytes =
    solanaLiveCaptureReviewSignaturePayloadBytes(signedPayload);
  return {
    schema: "iroha-demo-sccp-solana-live-capture-review-signing-package/v1",
    signerFree: true,
    privateKeyInputsAccepted: false,
    witnessArtifactSha256: signedPayload.witnessArtifactSha256,
    signatureAlgorithm: "ed25519",
    signatureDomainUtf8: SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN,
    signatureDomainHex: Buffer.from(
      SOLANA_LIVE_CAPTURE_REVIEW_SIGNATURE_DOMAIN,
      "utf8",
    ).toString("hex"),
    signedPayload,
    canonicalSignedPayloadJson,
    signaturePayloadBase64: signaturePayloadBytes.toString("base64"),
    signedPayloadSha256: sha256Bytes(signaturePayloadBytes),
  };
};

export const verifySolanaLiveCaptureReviewAttestation = ({
  attestation,
  witness,
  witnessArtifactSha256,
  reviewPolicy,
} = {}) => {
  requireExactKeys(
    attestation,
    ["schema", "signedPayload", "signatures"],
    "Solana live capture review attestation",
  );
  if (attestation.schema !== SOLANA_LIVE_CAPTURE_REVIEW_ATTESTATION_SCHEMA) {
    throw new Error(
      `Solana live capture review attestation schema must be ${SOLANA_LIVE_CAPTURE_REVIEW_ATTESTATION_SCHEMA}.`,
    );
  }
  if (
    !isRecord(reviewPolicy) ||
    reviewPolicy.schema !== SOLANA_LIVE_CAPTURE_REVIEW_POLICY_SCHEMA ||
    !Array.isArray(reviewPolicy.reviewers)
  ) {
    throw new Error(
      "A validated Solana live capture review policy is required.",
    );
  }
  const expectedPayload = buildSolanaLiveCaptureReviewSignedPayload({
    witness,
    witnessArtifactSha256,
  });
  requireExactKeys(
    attestation.signedPayload,
    Object.keys(expectedPayload),
    "Solana live capture review signed payload",
  );
  if (
    canonicalSccpJson(attestation.signedPayload) !==
    canonicalSccpJson(expectedPayload)
  ) {
    throw new Error(
      "Solana live capture review signed payload does not match the exact witness, capture, evidence, policy, and snapshot.",
    );
  }
  if (
    expectedPayload.reviewPolicySha256 !== reviewPolicy.policySha256 ||
    canonicalSccpJson(expectedPayload.reviewClaims) !==
      canonicalSccpJson(reviewPolicy.requiredClaims) ||
    JSON.stringify(expectedPayload.markers.map((marker) => marker.id)) !==
      JSON.stringify(reviewPolicy.markerIds)
  ) {
    throw new Error(
      "Solana live capture review attestation does not satisfy the approved review policy.",
    );
  }
  if (!Array.isArray(attestation.signatures)) {
    throw new Error(
      "Solana live capture review attestation signatures are missing.",
    );
  }
  const payloadBytes =
    solanaLiveCaptureReviewSignaturePayloadBytes(expectedPayload);
  const signedPayloadSha256 = sha256Bytes(payloadBytes);
  const reviewers = new Map(
    reviewPolicy.reviewers.map((reviewer) => [reviewer.reviewerId, reviewer]),
  );
  const seenReviewerIds = new Set();
  const seenFingerprints = new Set();
  const seenSignatures = new Set();
  const validReviewerIds = [];
  let previousReviewerId = null;
  for (const [index, signature] of attestation.signatures.entries()) {
    const label = `Solana live capture review signature ${index + 1}`;
    requireExactKeys(
      signature,
      ["reviewerId", "algorithm", "signedPayloadSha256", "signatureBase64"],
      label,
    );
    const reviewerId = requiredString(signature.reviewerId, `${label} id`);
    if (previousReviewerId !== null && previousReviewerId >= reviewerId) {
      throw new Error(
        "Solana live capture review signatures must be uniquely sorted by reviewer ID.",
      );
    }
    previousReviewerId = reviewerId;
    if (seenReviewerIds.has(reviewerId)) {
      throw new Error(
        "Solana live capture review signatures contain a duplicate reviewer ID.",
      );
    }
    seenReviewerIds.add(reviewerId);
    const reviewer = reviewers.get(reviewerId);
    if (!reviewer) {
      throw new Error(
        `Solana live capture review signature ${reviewerId} is not authorized by the approved policy.`,
      );
    }
    if (signature.algorithm !== "ed25519") {
      throw new Error(`${label} must use Ed25519.`);
    }
    if (
      requiredHash(signature.signedPayloadSha256, `${label} payload SHA-256`, {
        nonZero: true,
      }) !== signedPayloadSha256
    ) {
      throw new Error(`${label} payload SHA-256 does not match.`);
    }
    const signatureBytes = canonicalBase64Bytes(
      signature.signatureBase64,
      `${label} detached signature`,
      64,
    );
    const signatureIdentity = signatureBytes.toString("base64");
    if (seenSignatures.has(signatureIdentity)) {
      throw new Error(
        "Solana live capture review signatures contain duplicate signature bytes.",
      );
    }
    seenSignatures.add(signatureIdentity);
    if (seenFingerprints.has(reviewer.publicKeySpkiSha256)) {
      throw new Error(
        "Solana live capture review signatures contain a duplicate reviewer key.",
      );
    }
    seenFingerprints.add(reviewer.publicKeySpkiSha256);
    const publicKey = createPublicKey({
      key: Buffer.from(reviewer.publicKeySpkiDerBase64, "base64"),
      format: "der",
      type: "spki",
    });
    if (!verify(null, payloadBytes, publicKey, signatureBytes)) {
      throw new Error(`${label} detached Ed25519 verification failed.`);
    }
    validReviewerIds.push(reviewerId);
  }
  if (seenFingerprints.size < reviewPolicy.threshold) {
    throw new Error(
      `Solana live capture review requires ${reviewPolicy.threshold} unique valid reviewer signature(s).`,
    );
  }
  return {
    schema: SOLANA_LIVE_CAPTURE_REVIEW_ATTESTATION_SCHEMA,
    ready: true,
    authenticated: true,
    reviewPolicySha256: reviewPolicy.policySha256,
    witnessArtifactSha256: expectedPayload.witnessArtifactSha256,
    signedPayloadSha256,
    threshold: reviewPolicy.threshold,
    validSignatureCount: seenFingerprints.size,
    validReviewerIds,
    validReviewerKeyFingerprints: [...seenFingerprints],
  };
};

export const decodeSolanaLiveCaptureWitnessQr = ({
  grayscaleBytes,
  width = SOLANA_LIVE_CAPTURE_WITNESS_FRAME_WIDTH,
  height = SOLANA_LIVE_CAPTURE_WITNESS_FRAME_HEIGHT,
} = {}) => {
  const expectedLength = width * height;
  if (
    !(grayscaleBytes instanceof Uint8Array) ||
    grayscaleBytes.byteLength !== expectedLength
  ) {
    throw new Error(
      `Normalized witness frame must contain exactly ${expectedLength} gray8 bytes.`,
    );
  }
  try {
    const luminance = new RGBLuminanceSource(
      new Uint8ClampedArray(
        grayscaleBytes.buffer,
        grayscaleBytes.byteOffset,
        grayscaleBytes.byteLength,
      ),
      width,
      height,
    );
    return new QRCodeReader()
      .decode(new BinaryBitmap(new HybridBinarizer(luminance)))
      .getText();
  } catch {
    return null;
  }
};

export const analyzeSolanaLiveCaptureWitnessFrames = ({
  witness,
  samples,
} = {}) => {
  const blockers = [];
  const expectedMarkers = Array.isArray(witness?.markers)
    ? witness.markers
    : [];
  const actualSamples = Array.isArray(samples) ? samples : [];
  if (expectedMarkers.length !== 4 || actualSamples.length !== 4) {
    blockers.push("capture-semantic-witness-frame-count");
  }
  const markerResults = SOLANA_LIVE_CAPTURE_WITNESS_IDS.map((id, index) => {
    const marker = expectedMarkers[index];
    const sample = actualSamples[index];
    const idMatches = marker?.id === id && sample?.id === id;
    const timeMatches =
      Number.isSafeInteger(marker?.atMilliseconds) &&
      sample?.atMilliseconds === marker.atMilliseconds;
    const dwellFrames = Array.isArray(sample?.dwellFrames)
      ? sample.dwellFrames
      : [];
    const dwellShapeMatches =
      dwellFrames.length ===
        SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS.length &&
      dwellFrames.every(
        (frame, frameIndex) =>
          frame?.offsetMilliseconds ===
          SOLANA_LIVE_CAPTURE_WITNESS_DWELL_OFFSETS_MILLISECONDS[frameIndex],
      );
    const centerFrame = dwellFrames.find(
      (frame) => frame?.offsetMilliseconds === 0,
    );
    const frameSha256 =
      typeof centerFrame?.normalizedFrameSha256 === "string"
        ? centerFrame.normalizedFrameSha256.toLowerCase()
        : null;
    const frameMatches =
      HEX32.test(frameSha256 ?? "") &&
      frameSha256 === marker?.normalizedFrameSha256;
    const payloadMatches =
      dwellShapeMatches &&
      dwellFrames.every(
        (frame) => frame?.decodedPayload === marker?.expectedPayload,
      );
    if (!idMatches) blockers.push(`capture-semantic-witness-${id}-identity`);
    if (!timeMatches) blockers.push(`capture-semantic-witness-${id}-time`);
    if (!frameMatches) blockers.push(`capture-semantic-witness-${id}-frame`);
    if (!payloadMatches)
      blockers.push(`capture-semantic-witness-${id}-payload`);
    if (!dwellShapeMatches || !payloadMatches) {
      blockers.push(`capture-semantic-witness-${id}-dwell`);
    }
    return {
      id,
      atMilliseconds: Number.isSafeInteger(marker?.atMilliseconds)
        ? marker.atMilliseconds
        : null,
      normalizedFrameSha256: frameSha256,
      expectedPayloadSha256: marker?.expectedPayloadSha256 ?? null,
      dwellOffsetsMilliseconds: dwellFrames.map(
        (frame) => frame?.offsetMilliseconds ?? null,
      ),
      decodedPayloadSha256s: dwellFrames.map((frame) =>
        typeof frame?.decodedPayload === "string"
          ? `0x${createHash("sha256")
              .update(frame.decodedPayload, "utf8")
              .digest("hex")}`
          : null,
      ),
      idMatches,
      timeMatches,
      frameMatches,
      payloadMatches,
      dwellShapeMatches,
      ready:
        idMatches &&
        timeMatches &&
        frameMatches &&
        payloadMatches &&
        dwellShapeMatches,
    };
  });
  const observedFrameHashes = markerResults
    .map((marker) => marker.normalizedFrameSha256)
    .filter(Boolean);
  if (
    observedFrameHashes.length !== 4 ||
    new Set(observedFrameHashes).size !== 4
  ) {
    blockers.push("capture-semantic-witness-distinct-frames");
  }
  return {
    schema: "iroha-demo-sccp-solana-live-capture-witness-analysis/v1",
    ready: blockers.length === 0,
    semanticallyBound: blockers.length === 0,
    captureSha256: witness?.captureSha256 ?? null,
    evidenceBindingSha256: witness?.evidenceBindingSha256 ?? null,
    independentReview: witness?.independentReview ?? null,
    frameNormalization: witness?.frameNormalization ?? null,
    markers: markerResults,
    blockers: [...new Set(blockers)],
  };
};
