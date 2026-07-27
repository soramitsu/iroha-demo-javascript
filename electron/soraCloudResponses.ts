import type { TransactionFeeLike } from "../src/utils/transactionFee";
import {
  assertTransactionFinalityProof,
  type TransactionFinalityProof,
} from "./transactionFinality";

export const SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID =
  "iroha_data_model::isi::soracloud::DeploySoracloudService";
export const SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID =
  "iroha_data_model::isi::soracloud::DeploySoracloudAgentApartment";
export const SORACLOUD_HF_JOIN_WIRE_ID =
  "iroha_data_model::isi::soracloud::JoinSoracloudHfSharedLease";

export type SoraCloudHfStorageClass = "hot" | "warm" | "cold";

export interface SoraCloudHfDeployExpectation {
  accountId: string;
  signer: string;
  joinProvenance: SoraCloudManifestProvenance;
  generatedServiceProvenance: SoraCloudManifestProvenance;
  generatedApartmentProvenance?: SoraCloudManifestProvenance;
  repoId: string;
  resolvedRevision: string;
  modelName: string;
  serviceName: string;
  apartmentName?: string;
  storageClass: SoraCloudHfStorageClass;
  leaseTermMs: number;
  leaseAssetDefinitionId: string;
  baseFee: string;
}

export interface SoraCloudManifestProvenance {
  signer: string;
  signature: string;
}

export interface SoraCloudDraftInstruction {
  wireId: string;
  payloadHex: string;
}

export interface SoraCloudHfMutationDraft {
  authority: string;
  signedBy: string;
  instructions: SoraCloudDraftInstruction[];
  raw: Record<string, unknown>;
}

export interface SoraCloudHfResourceProfileReview {
  requiredModelBytes: number;
  backendFamily: "Transformers" | "Gguf";
  modelFormat: "Safetensors" | "PyTorch" | "Gguf";
  diskCacheBytesFloor: number;
  ramBytesFloor: number;
  vramBytesFloor: number;
}

export interface SoraCloudHfSettlementReview {
  leaseAssetDefinitionId: string;
  storageBaseFee: string;
  maxComputeReservationFee: string;
  resourceProfile: SoraCloudHfResourceProfileReview;
}

export interface SoraCloudHfDecodedDraft {
  instructions: Record<string, unknown>[];
  settlement: SoraCloudHfSettlementReview;
}

export interface MatchingSoraCloudHfStatus {
  action: "CreateWindow" | "Join";
  sequence: number;
  storageBaseFee: string;
  actualStorageCharge: string;
  actualComputeCharge: string;
  maxComputeReservationFee: string;
  raw: Record<string, unknown>;
}

export interface SoraCloudCommittedLaunchResponse {
  ok: true;
  settlement_status: "confirmed" | "indexing";
  finality: TransactionFinalityProof;
  action: "CreateWindow" | "Join" | null;
  service_name: string;
  sequence: number | null;
  tx_hash_hex: string;
  storage_base_fee: string;
  actual_storage_charge: string | null;
  max_compute_reservation_fee: string;
  actual_compute_charge: string | null;
  reconciliation_message?: string;
  fee?: TransactionFeeLike | string | number | null;
  raw: Record<string, unknown> | null;
}

type DecodeInstruction = (payload: Uint8Array) => unknown;

const TRANSACTION_HASH_RE = /^[0-9a-f]{64}$/u;
const CANONICAL_HEX_RE = /^(?:[0-9a-f]{2})+$/u;
const CANONICAL_QUANTITY_RE = /^(?:0|[1-9]\d*)(?:\.(?:\d{0,27}[1-9]))?$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter((key) => !hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${detail}).`);
  }
};

const requireAllowedKeys = (
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
) => {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const missing = requiredKeys.filter((key) => !hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    const detail = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`${label} has invalid fields (${detail}).`);
  }
};

const requireCanonicalText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a canonical non-empty string.`);
  }
  return value;
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value as number;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
};

const requireSchemaV1 = (value: Record<string, unknown>, label: string) => {
  if (value.schema_version !== 1) {
    throw new Error(`${label}.schema_version must be 1.`);
  }
};

const requireCanonicalQuantity = (value: unknown, label: string): string => {
  const quantity = requireCanonicalText(value, label);
  if (!CANONICAL_QUANTITY_RE.test(quantity)) {
    throw new Error(`${label} must be a canonical quantity string.`);
  }
  return quantity;
};

const quantityParts = (value: string): { mantissa: bigint; scale: number } => {
  const [whole, fraction = ""] = value.split(".");
  return {
    mantissa: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
};

const compareCanonicalQuantities = (left: string, right: string): number => {
  const leftParts = quantityParts(left);
  const rightParts = quantityParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftMantissa =
    leftParts.mantissa * 10n ** BigInt(scale - leftParts.scale);
  const rightMantissa =
    rightParts.mantissa * 10n ** BigInt(scale - rightParts.scale);
  return leftMantissa < rightMantissa
    ? -1
    : leftMantissa > rightMantissa
      ? 1
      : 0;
};

const addCanonicalQuantities = (left: string, right: string): string => {
  const leftParts = quantityParts(left);
  const rightParts = quantityParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const total =
    leftParts.mantissa * 10n ** BigInt(scale - leftParts.scale) +
    rightParts.mantissa * 10n ** BigInt(scale - rightParts.scale);
  if (scale === 0) return total.toString();
  const padded = total.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

const requireTaggedUnitVariant = (
  value: unknown,
  tag: "action" | "status" | "type" | "backend_family" | "model_format",
  allowed: readonly string[],
  label: string,
): string => {
  const record = requireRecord(value, label);
  requireExactKeys(record, [tag, "value"], label);
  const variant = requireCanonicalText(record[tag], `${label}.${tag}`);
  if (!allowed.includes(variant)) {
    throw new Error(`${label}.${tag} must be one of ${allowed.join(", ")}.`);
  }
  if (record.value !== null) {
    throw new Error(`${label}.value must be null.`);
  }
  return variant;
};

const requireStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) =>
    requireCanonicalText(entry, `${label}[${index}]`),
  );
};

const requireExpected = (
  actual: unknown,
  expected: string | number | null,
  label: string,
) => {
  if (actual !== expected) {
    throw new Error(`${label} does not match the reviewed launch.`);
  }
};

const requireMatchingProvenance = (
  value: unknown,
  expected: SoraCloudManifestProvenance,
  label: string,
) => {
  const provenance = requireRecord(value, label);
  requireExactKeys(provenance, ["signer", "signature"], label);
  requireExpected(provenance.signer, expected.signer, `${label}.signer`);
  requireExpected(
    provenance.signature,
    expected.signature,
    `${label}.signature`,
  );
};

const instructionVariant = (
  value: unknown,
  expectedVariant: string,
  label: string,
): Record<string, unknown> => {
  const record = requireRecord(value, label);
  const entries = Object.entries(record);
  if (
    entries.length !== 1 ||
    entries[0][0] !== expectedVariant ||
    !isRecord(entries[0][1])
  ) {
    throw new Error(`${label} must decode as exactly ${expectedVariant}.`);
  }
  return entries[0][1] as Record<string, unknown>;
};

const validateGeneratedServiceInstruction = (
  decoded: unknown,
  expected: SoraCloudHfDeployExpectation,
) => {
  const payload = instructionVariant(
    decoded,
    "DeploySoracloudService",
    "SoraCloud generated-service instruction",
  );
  requireExactKeys(
    payload,
    [
      "bundle",
      "initial_service_configs",
      "initial_service_secrets",
      "provenance",
    ],
    "SoraCloud generated-service instruction payload",
  );
  const bundle = requireRecord(
    payload.bundle,
    "SoraCloud generated-service bundle",
  );
  const service = requireRecord(
    bundle.service,
    "SoraCloud generated-service manifest",
  );
  requireExpected(
    service.service_name,
    expected.serviceName,
    "SoraCloud generated-service service_name",
  );
  requireExpected(
    service.service_version,
    "hf.generated.v1",
    "SoraCloud generated-service service_version",
  );
  const container = requireRecord(
    bundle.container,
    "SoraCloud generated-service container",
  );
  const env = requireRecord(
    container.env,
    "SoraCloud generated-service environment",
  );
  requireExpected(
    env.SORACLOUD_HF_GENERATED,
    "1",
    "SoraCloud generated-service marker",
  );
  requireExpected(
    env.SORACLOUD_HF_REPO_ID,
    expected.repoId,
    "SoraCloud generated-service repo",
  );
  requireExpected(
    env.SORACLOUD_HF_REVISION,
    expected.resolvedRevision,
    "SoraCloud generated-service revision",
  );
  requireExpected(
    env.SORACLOUD_HF_MODEL_NAME,
    expected.modelName,
    "SoraCloud generated-service model",
  );
  const configs = requireRecord(
    payload.initial_service_configs,
    "SoraCloud generated-service initial configs",
  );
  const secrets = requireRecord(
    payload.initial_service_secrets,
    "SoraCloud generated-service initial secrets",
  );
  if (Object.keys(configs).length !== 0 || Object.keys(secrets).length !== 0) {
    throw new Error(
      "SoraCloud generated-service draft must not inject configs or secrets.",
    );
  }
  requireMatchingProvenance(
    payload.provenance,
    expected.generatedServiceProvenance,
    "SoraCloud generated-service provenance",
  );
};

const validateGeneratedApartmentInstruction = (
  decoded: unknown,
  expected: SoraCloudHfDeployExpectation,
) => {
  const payload = instructionVariant(
    decoded,
    "DeploySoracloudAgentApartment",
    "SoraCloud generated-apartment instruction",
  );
  requireExactKeys(
    payload,
    ["manifest", "lease_ticks", "autonomy_budget_units", "provenance"],
    "SoraCloud generated-apartment instruction payload",
  );
  const manifest = requireRecord(
    payload.manifest,
    "SoraCloud generated-apartment manifest",
  );
  requireExpected(
    manifest.apartment_name,
    expected.apartmentName ?? null,
    "SoraCloud generated-apartment apartment_name",
  );
  requireExpected(
    payload.lease_ticks,
    86_400,
    "SoraCloud generated-apartment lease_ticks",
  );
  requireExpected(
    payload.autonomy_budget_units,
    1_000,
    "SoraCloud generated-apartment autonomy_budget_units",
  );
  if (!expected.generatedApartmentProvenance) {
    throw new Error(
      "SoraCloud generated-apartment provenance was not part of the reviewed launch.",
    );
  }
  requireMatchingProvenance(
    payload.provenance,
    expected.generatedApartmentProvenance,
    "SoraCloud generated-apartment provenance",
  );
};

const decodeResourceProfile = (
  value: unknown,
  label: string,
): SoraCloudHfResourceProfileReview => {
  const profile = requireRecord(value, label);
  requireExactKeys(
    profile,
    [
      "required_model_bytes",
      "backend_family",
      "model_format",
      "disk_cache_bytes_floor",
      "ram_bytes_floor",
      "vram_bytes_floor",
    ],
    label,
  );
  const requiredModelBytes = requirePositiveSafeInteger(
    profile.required_model_bytes,
    `${label}.required_model_bytes`,
  );
  const diskCacheBytesFloor = requirePositiveSafeInteger(
    profile.disk_cache_bytes_floor,
    `${label}.disk_cache_bytes_floor`,
  );
  const ramBytesFloor = requireNonNegativeSafeInteger(
    profile.ram_bytes_floor,
    `${label}.ram_bytes_floor`,
  );
  const vramBytesFloor = requireNonNegativeSafeInteger(
    profile.vram_bytes_floor,
    `${label}.vram_bytes_floor`,
  );
  if (diskCacheBytesFloor < requiredModelBytes) {
    throw new Error(
      `${label}.disk_cache_bytes_floor must cover required_model_bytes.`,
    );
  }
  if (ramBytesFloor === 0 && vramBytesFloor === 0) {
    throw new Error(`${label} must require RAM or VRAM.`);
  }
  const backendFamily = requireTaggedUnitVariant(
    profile.backend_family,
    "backend_family",
    ["Transformers", "Gguf"],
    `${label}.backend_family`,
  ) as SoraCloudHfResourceProfileReview["backendFamily"];
  const modelFormat = requireTaggedUnitVariant(
    profile.model_format,
    "model_format",
    ["Safetensors", "PyTorch", "Gguf"],
    `${label}.model_format`,
  ) as SoraCloudHfResourceProfileReview["modelFormat"];
  return {
    requiredModelBytes,
    backendFamily,
    modelFormat,
    diskCacheBytesFloor,
    ramBytesFloor,
    vramBytesFloor,
  };
};

const resourceProfilesEqual = (
  left: SoraCloudHfResourceProfileReview,
  right: SoraCloudHfResourceProfileReview,
): boolean =>
  left.requiredModelBytes === right.requiredModelBytes &&
  left.backendFamily === right.backendFamily &&
  left.modelFormat === right.modelFormat &&
  left.diskCacheBytesFloor === right.diskCacheBytesFloor &&
  left.ramBytesFloor === right.ramBytesFloor &&
  left.vramBytesFloor === right.vramBytesFloor;

const canonicalComputeReservationCap = (
  profile: SoraCloudHfResourceProfileReview,
  leaseTermMs: number,
): string => {
  requirePositiveSafeInteger(leaseTermMs, "SoraCloud HF lease_term_ms");
  const twoGib = 2 * 1024 * 1024 * 1024;
  const eightGib = 8 * 1024 * 1024 * 1024;
  if (profile.requiredModelBytes <= twoGib) return "0.0000075";
  if (profile.requiredModelBytes <= eightGib) return "0.000008";
  return "0.000012";
};

const validateJoinInstruction = (
  decoded: unknown,
  expected: SoraCloudHfDeployExpectation,
): SoraCloudHfSettlementReview => {
  const payload = instructionVariant(
    decoded,
    "JoinSoracloudHfSharedLease",
    "SoraCloud HF join instruction",
  );
  requireExactKeys(
    payload,
    [
      "repo_id",
      "resolved_revision",
      "model_name",
      "service_name",
      "apartment_name",
      "storage_class",
      "lease_term_ms",
      "lease_asset_definition_id",
      "base_fee",
      "resource_profile",
      "max_compute_reservation_fee",
      "provenance",
    ],
    "SoraCloud HF join instruction payload",
  );
  requireExpected(
    payload.repo_id,
    expected.repoId,
    "SoraCloud HF join repo_id",
  );
  requireExpected(
    payload.resolved_revision,
    expected.resolvedRevision,
    "SoraCloud HF join resolved_revision",
  );
  requireExpected(
    payload.model_name,
    expected.modelName,
    "SoraCloud HF join model_name",
  );
  requireExpected(
    payload.service_name,
    expected.serviceName,
    "SoraCloud HF join service_name",
  );
  requireExpected(
    payload.apartment_name,
    expected.apartmentName ?? null,
    "SoraCloud HF join apartment_name",
  );
  requireExpected(
    requireTaggedUnitVariant(
      payload.storage_class,
      "type",
      ["Hot", "Warm", "Cold"],
      "SoraCloud HF join storage_class",
    ).toLowerCase(),
    expected.storageClass,
    "SoraCloud HF join storage_class",
  );
  requireExpected(
    payload.lease_term_ms,
    expected.leaseTermMs,
    "SoraCloud HF join lease_term_ms",
  );
  requireExpected(
    payload.lease_asset_definition_id,
    expected.leaseAssetDefinitionId,
    "SoraCloud HF join lease_asset_definition_id",
  );
  requireExpected(
    requireCanonicalQuantity(payload.base_fee, "SoraCloud HF join base_fee"),
    expected.baseFee,
    "SoraCloud HF join base_fee",
  );
  const resourceProfile = decodeResourceProfile(
    payload.resource_profile,
    "SoraCloud HF join resource_profile",
  );
  const maxComputeReservationFee = requireCanonicalQuantity(
    payload.max_compute_reservation_fee,
    "SoraCloud HF join max_compute_reservation_fee",
  );
  requireExpected(
    maxComputeReservationFee,
    canonicalComputeReservationCap(resourceProfile, expected.leaseTermMs),
    "SoraCloud HF join max_compute_reservation_fee",
  );
  requireMatchingProvenance(
    payload.provenance,
    expected.joinProvenance,
    "SoraCloud HF join provenance",
  );
  return {
    leaseAssetDefinitionId: expected.leaseAssetDefinitionId,
    storageBaseFee: expected.baseFee,
    maxComputeReservationFee,
    resourceProfile,
  };
};

export const decodeSoraCloudHfMutationDraft = (
  value: unknown,
  expectedAuthority: string,
  expectedSigner: string,
): SoraCloudHfMutationDraft => {
  const label = "SoraCloud HF mutation draft";
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["ok", "authority", "signed_by", "tx_instructions"],
    label,
  );
  if (record.ok !== true) {
    throw new Error(`${label}.ok must be true.`);
  }
  requireExpected(record.authority, expectedAuthority, `${label}.authority`);
  requireExpected(record.signed_by, expectedSigner, `${label}.signed_by`);
  if (
    !Array.isArray(record.tx_instructions) ||
    record.tx_instructions.length < 1 ||
    record.tx_instructions.length > 3
  ) {
    throw new Error(
      `${label}.tx_instructions must contain between one and three instructions.`,
    );
  }
  const instructions = record.tx_instructions.map((entry, index) => {
    const instruction = requireRecord(
      entry,
      `${label}.tx_instructions[${index}]`,
    );
    requireExactKeys(
      instruction,
      ["wire_id", "payload_hex"],
      `${label}.tx_instructions[${index}]`,
    );
    const wireId = requireCanonicalText(
      instruction.wire_id,
      `${label}.tx_instructions[${index}].wire_id`,
    );
    const payloadHex = requireCanonicalText(
      instruction.payload_hex,
      `${label}.tx_instructions[${index}].payload_hex`,
    );
    if (!CANONICAL_HEX_RE.test(payloadHex)) {
      throw new Error(
        `${label}.tx_instructions[${index}].payload_hex must be canonical lowercase byte-aligned hex.`,
      );
    }
    return { wireId, payloadHex };
  });

  const wireIds = instructions.map((instruction) => instruction.wireId);
  const joinIndex = wireIds.indexOf(SORACLOUD_HF_JOIN_WIRE_ID);
  if (
    joinIndex !== wireIds.length - 1 ||
    wireIds.lastIndexOf(SORACLOUD_HF_JOIN_WIRE_ID) !== joinIndex
  ) {
    throw new Error(
      "SoraCloud HF mutation draft must end with exactly one HF join instruction.",
    );
  }
  const prefix = wireIds.slice(0, -1);
  if (
    prefix.some(
      (wireId) =>
        wireId !== SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID &&
        wireId !== SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID,
    ) ||
    new Set(prefix).size !== prefix.length ||
    (prefix.includes(SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID) &&
      prefix.includes(SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID) &&
      prefix.indexOf(SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID) >
        prefix.indexOf(SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID))
  ) {
    throw new Error(
      "SoraCloud HF mutation draft contains an unsupported instruction sequence.",
    );
  }

  return {
    authority: expectedAuthority,
    signedBy: expectedSigner,
    instructions,
    raw: record,
  };
};

export const decodeSoraCloudHfDraftInstructions = (
  draft: SoraCloudHfMutationDraft,
  expected: SoraCloudHfDeployExpectation,
  decodeInstruction: DecodeInstruction,
): SoraCloudHfDecodedDraft => {
  let settlement: SoraCloudHfSettlementReview | null = null;
  const instructions = draft.instructions.map((instruction) => {
    const decoded = decodeInstruction(
      Uint8Array.from(Buffer.from(instruction.payloadHex, "hex")),
    );
    if (instruction.wireId === SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID) {
      validateGeneratedServiceInstruction(decoded, expected);
    } else if (instruction.wireId === SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID) {
      if (!expected.apartmentName) {
        throw new Error(
          "SoraCloud HF draft added an apartment that was not reviewed.",
        );
      }
      validateGeneratedApartmentInstruction(decoded, expected);
    } else if (instruction.wireId === SORACLOUD_HF_JOIN_WIRE_ID) {
      settlement = validateJoinInstruction(decoded, expected);
    } else {
      throw new Error(
        `SoraCloud HF draft returned unsupported wire id ${instruction.wireId}.`,
      );
    }
    return requireRecord(decoded, "Decoded SoraCloud HF instruction");
  });
  if (!settlement) {
    throw new Error("SoraCloud HF draft did not contain a settlement review.");
  }
  return { instructions, settlement };
};

export const readSoraCloudHfLatestSequence = (value: unknown): number => {
  const status = requireRecord(value, "SoraCloud HF status");
  requireSchemaV1(status, "SoraCloud HF status");
  requireCanonicalQuantity(
    status.compute_reservation_fee,
    "SoraCloud HF status.compute_reservation_fee",
  );
  if (
    status.latest_audit_event === undefined ||
    status.latest_audit_event === null
  ) {
    return 0;
  }
  const event = requireRecord(
    status.latest_audit_event,
    "SoraCloud HF status.latest_audit_event",
  );
  requireSchemaV1(event, "SoraCloud HF status.latest_audit_event");
  return requirePositiveSafeInteger(
    event.sequence,
    "SoraCloud HF status.latest_audit_event.sequence",
  );
};

export const decodeMatchingSoraCloudHfStatus = (
  value: unknown,
  expected: SoraCloudHfDeployExpectation,
  settlement: SoraCloudHfSettlementReview,
  minimumSequenceExclusive = 0,
): MatchingSoraCloudHfStatus => {
  const label = "SoraCloud HF committed status";
  const status = requireRecord(value, label);
  requireAllowedKeys(
    status,
    [
      "schema_version",
      "source",
      "pool",
      "member",
      "latest_audit_event",
      "audit_event_count",
      "storage_base_fee",
      "compute_reservation_fee",
      "eligible_host_count",
      "warm_host_count",
      "importer_pending",
    ],
    ["runtime_projection", "placement"],
    label,
  );
  requireSchemaV1(status, label);
  requireNonNegativeSafeInteger(
    status.audit_event_count,
    `${label}.audit_event_count`,
  );
  const storageBaseFee = requireCanonicalQuantity(
    status.storage_base_fee,
    `${label}.storage_base_fee`,
  );
  requireExpected(
    storageBaseFee,
    settlement.storageBaseFee,
    `${label}.storage_base_fee`,
  );
  const placementComputeReservationFee = requireCanonicalQuantity(
    status.compute_reservation_fee,
    `${label}.compute_reservation_fee`,
  );
  if (
    compareCanonicalQuantities(
      placementComputeReservationFee,
      settlement.maxComputeReservationFee,
    ) > 0
  ) {
    throw new Error(
      `${label}.compute_reservation_fee exceeds the reviewed maximum.`,
    );
  }
  requireNonNegativeSafeInteger(
    status.eligible_host_count,
    `${label}.eligible_host_count`,
  );
  requireNonNegativeSafeInteger(
    status.warm_host_count,
    `${label}.warm_host_count`,
  );
  if (typeof status.importer_pending !== "boolean") {
    throw new Error(`${label}.importer_pending must be a boolean.`);
  }

  const source = requireRecord(status.source, `${label}.source`);
  requireAllowedKeys(
    source,
    [
      "schema_version",
      "source_id",
      "repo_id",
      "resolved_revision",
      "model_name",
      "adapter_id",
      "normalized_runtime_hash",
      "status",
      "created_at_ms",
      "updated_at_ms",
    ],
    ["resource_profile", "last_error"],
    `${label}.source`,
  );
  requireSchemaV1(source, `${label}.source`);
  const sourceId = requireCanonicalText(
    source.source_id,
    `${label}.source.source_id`,
  );
  requireExpected(source.repo_id, expected.repoId, `${label}.source.repo_id`);
  requireExpected(
    source.resolved_revision,
    expected.resolvedRevision,
    `${label}.source.resolved_revision`,
  );
  requireExpected(
    source.model_name,
    expected.modelName,
    `${label}.source.model_name`,
  );
  const committedResourceProfile = decodeResourceProfile(
    source.resource_profile,
    `${label}.source.resource_profile`,
  );
  if (
    !resourceProfilesEqual(committedResourceProfile, settlement.resourceProfile)
  ) {
    throw new Error(
      `${label}.source.resource_profile does not match the reviewed profile.`,
    );
  }
  requireTaggedUnitVariant(
    source.status,
    "status",
    ["PendingImport", "Ready"],
    `${label}.source.status`,
  );

  const pool = requireRecord(status.pool, `${label}.pool`);
  requireExactKeys(
    pool,
    [
      "schema_version",
      "pool_id",
      "source_id",
      "storage_class",
      "lease_asset_definition_id",
      "base_fee",
      "lease_term_ms",
      "window_started_at_ms",
      "window_expires_at_ms",
      "active_member_count",
      "status",
      "queued_next_window",
    ],
    `${label}.pool`,
  );
  requireSchemaV1(pool, `${label}.pool`);
  const poolId = requireCanonicalText(pool.pool_id, `${label}.pool.pool_id`);
  requireExpected(pool.source_id, sourceId, `${label}.pool.source_id`);
  requireExpected(
    requireTaggedUnitVariant(
      pool.storage_class,
      "type",
      ["Hot", "Warm", "Cold"],
      `${label}.pool.storage_class`,
    ).toLowerCase(),
    expected.storageClass,
    `${label}.pool.storage_class`,
  );
  requireExpected(
    pool.lease_asset_definition_id,
    expected.leaseAssetDefinitionId,
    `${label}.pool.lease_asset_definition_id`,
  );
  requireExpected(
    requireCanonicalQuantity(pool.base_fee, `${label}.pool.base_fee`),
    expected.baseFee,
    `${label}.pool.base_fee`,
  );
  requireExpected(
    pool.lease_term_ms,
    expected.leaseTermMs,
    `${label}.pool.lease_term_ms`,
  );
  requireTaggedUnitVariant(
    pool.status,
    "status",
    ["Active"],
    `${label}.pool.status`,
  );

  const member = requireRecord(status.member, `${label}.member`);
  requireExactKeys(
    member,
    [
      "schema_version",
      "pool_id",
      "source_id",
      "account_id",
      "status",
      "joined_at_ms",
      "updated_at_ms",
      "total_paid",
      "total_refunded",
      "last_charge",
      "total_compute_paid",
      "total_compute_refunded",
      "last_compute_charge",
      "service_bindings",
      "apartment_bindings",
    ],
    `${label}.member`,
  );
  requireSchemaV1(member, `${label}.member`);
  requireExpected(member.pool_id, poolId, `${label}.member.pool_id`);
  requireExpected(member.source_id, sourceId, `${label}.member.source_id`);
  requireExpected(
    member.account_id,
    expected.accountId,
    `${label}.member.account_id`,
  );
  requireTaggedUnitVariant(
    member.status,
    "status",
    ["Active"],
    `${label}.member.status`,
  );
  const serviceBindings = requireStringArray(
    member.service_bindings,
    `${label}.member.service_bindings`,
  );
  if (!serviceBindings.includes(expected.serviceName)) {
    throw new Error(
      `${label}.member.service_bindings does not contain the reviewed service.`,
    );
  }
  const apartmentBindings = requireStringArray(
    member.apartment_bindings,
    `${label}.member.apartment_bindings`,
  );
  if (
    expected.apartmentName &&
    !apartmentBindings.includes(expected.apartmentName)
  ) {
    throw new Error(
      `${label}.member.apartment_bindings does not contain the reviewed apartment.`,
    );
  }
  const memberStorageCharge = requireCanonicalQuantity(
    member.last_charge,
    `${label}.member.last_charge`,
  );
  const actualComputeCharge = requireCanonicalQuantity(
    member.last_compute_charge,
    `${label}.member.last_compute_charge`,
  );
  for (const [field, value] of [
    ["total_paid", member.total_paid],
    ["total_refunded", member.total_refunded],
    ["total_compute_paid", member.total_compute_paid],
    ["total_compute_refunded", member.total_compute_refunded],
  ] as const) {
    requireCanonicalQuantity(value, `${label}.member.${field}`);
  }
  if (
    compareCanonicalQuantities(memberStorageCharge, settlement.storageBaseFee) >
    0
  ) {
    throw new Error(
      `${label}.member.last_charge exceeds the storage base fee.`,
    );
  }
  if (
    compareCanonicalQuantities(
      actualComputeCharge,
      settlement.maxComputeReservationFee,
    ) > 0
  ) {
    throw new Error(
      `${label}.member.last_compute_charge exceeds the reviewed maximum.`,
    );
  }
  if (
    compareCanonicalQuantities(
      actualComputeCharge,
      placementComputeReservationFee,
    ) > 0
  ) {
    throw new Error(
      `${label}.member.last_compute_charge exceeds the committed placement reservation.`,
    );
  }

  if (status.placement !== undefined && status.placement !== null) {
    const placement = requireRecord(status.placement, `${label}.placement`);
    const placementProfile = decodeResourceProfile(
      placement.resource_profile,
      `${label}.placement.resource_profile`,
    );
    if (!resourceProfilesEqual(placementProfile, settlement.resourceProfile)) {
      throw new Error(
        `${label}.placement.resource_profile does not match the reviewed profile.`,
      );
    }
    requireExpected(
      requireCanonicalQuantity(
        placement.total_reservation_fee,
        `${label}.placement.total_reservation_fee`,
      ),
      placementComputeReservationFee,
      `${label}.placement.total_reservation_fee`,
    );
  }

  const event = requireRecord(
    status.latest_audit_event,
    `${label}.latest_audit_event`,
  );
  requireExactKeys(
    event,
    [
      "schema_version",
      "sequence",
      "action",
      "pool_id",
      "source_id",
      "account_id",
      "occurred_at_ms",
      "active_member_count",
      "charged",
      "refunded",
      "lease_expires_at_ms",
      "service_name",
      "apartment_name",
    ],
    `${label}.latest_audit_event`,
  );
  requireSchemaV1(event, `${label}.latest_audit_event`);
  const sequence = requirePositiveSafeInteger(
    event.sequence,
    `${label}.latest_audit_event.sequence`,
  );
  if (sequence <= minimumSequenceExclusive) {
    throw new Error(
      `${label} has not advanced beyond the pre-submit audit sequence.`,
    );
  }
  const action = requireTaggedUnitVariant(
    event.action,
    "action",
    ["CreateWindow", "Join"],
    `${label}.latest_audit_event.action`,
  ) as MatchingSoraCloudHfStatus["action"];
  requireExpected(event.pool_id, poolId, `${label}.latest_audit_event.pool_id`);
  requireExpected(
    event.source_id,
    sourceId,
    `${label}.latest_audit_event.source_id`,
  );
  requireExpected(
    event.account_id,
    expected.accountId,
    `${label}.latest_audit_event.account_id`,
  );
  requireExpected(
    event.service_name,
    expected.serviceName,
    `${label}.latest_audit_event.service_name`,
  );
  requireExpected(
    event.apartment_name,
    expected.apartmentName ?? null,
    `${label}.latest_audit_event.apartment_name`,
  );
  const eventCharge = requireCanonicalQuantity(
    event.charged,
    `${label}.latest_audit_event.charged`,
  );
  requireCanonicalQuantity(
    event.refunded,
    `${label}.latest_audit_event.refunded`,
  );
  requireExpected(
    eventCharge,
    addCanonicalQuantities(memberStorageCharge, actualComputeCharge),
    `${label}.latest_audit_event.charged`,
  );

  return {
    action,
    sequence,
    storageBaseFee: settlement.storageBaseFee,
    actualStorageCharge: memberStorageCharge,
    actualComputeCharge,
    maxComputeReservationFee: settlement.maxComputeReservationFee,
    raw: status,
  };
};

export const buildSoraCloudCommittedLaunchResponse = (input: {
  status: MatchingSoraCloudHfStatus;
  serviceName: string;
  transactionHash: string;
  finality: TransactionFinalityProof;
  fee?: TransactionFeeLike | string | number | null;
}): SoraCloudCommittedLaunchResponse => {
  if (!TRANSACTION_HASH_RE.test(input.transactionHash)) {
    throw new Error(
      "Committed SoraCloud transaction hash must be canonical lowercase 32-byte hex.",
    );
  }
  const finality = assertTransactionFinalityProof(
    input.finality,
    input.transactionHash,
  );
  return {
    ok: true,
    settlement_status: "confirmed",
    finality,
    action: input.status.action,
    service_name: input.serviceName,
    sequence: input.status.sequence,
    tx_hash_hex: input.transactionHash,
    storage_base_fee: input.status.storageBaseFee,
    actual_storage_charge: input.status.actualStorageCharge,
    max_compute_reservation_fee: input.status.maxComputeReservationFee,
    actual_compute_charge: input.status.actualComputeCharge,
    ...(input.fee !== undefined ? { fee: input.fee } : {}),
    raw: input.status.raw,
  };
};

export const buildSoraCloudIndexingLaunchResponse = (input: {
  settlement: SoraCloudHfSettlementReview;
  serviceName: string;
  transactionHash: string;
  finality: TransactionFinalityProof;
  fee?: TransactionFeeLike | string | number | null;
}): SoraCloudCommittedLaunchResponse => {
  if (!TRANSACTION_HASH_RE.test(input.transactionHash)) {
    throw new Error(
      "Committed SoraCloud transaction hash must be canonical lowercase 32-byte hex.",
    );
  }
  const finality = assertTransactionFinalityProof(
    input.finality,
    input.transactionHash,
  );
  return {
    ok: true,
    settlement_status: "indexing",
    finality,
    action: null,
    service_name: input.serviceName,
    sequence: null,
    tx_hash_hex: input.transactionHash,
    storage_base_fee: input.settlement.storageBaseFee,
    actual_storage_charge: null,
    max_compute_reservation_fee: input.settlement.maxComputeReservationFee,
    actual_compute_charge: null,
    reconciliation_message:
      "The transaction is proven in a finalized block, but authoritative SoraCloud settlement state is still indexing. Do not resubmit; refresh the live HF status to reconcile actual charges.",
    ...(input.fee !== undefined ? { fee: input.fee } : {}),
    raw: null,
  };
};
