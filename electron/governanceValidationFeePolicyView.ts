import {
  normalizeValidationFeePolicy,
  type ValidationFeePolicyPayload,
} from "../src/governance/model";

const LEDGER_PROJECTION_SCHEMA = "cbsi.validation-fee-ledger-projection.v1";
const AUTHORIZATION_MODEL = "SORA_PARLIAMENT_V1";
const LOWER_HASH_32 = /^[0-9a-f]{64}$/u;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

type PlainRecord = Record<string, unknown>;

export type GovernanceValidationFeePolicyView = Readonly<{
  observedHeight: string;
  effective: ValidationFeePolicyPayload;
  latestEnacted: ValidationFeePolicyPayload;
  scheduled: readonly [];
  registryHead: Readonly<{
    policyVersion: string;
    policyHash: string;
  }>;
  verifiedProof: Readonly<{
    schema: typeof LEDGER_PROJECTION_SCHEMA;
    authorizationModel: typeof AUTHORIZATION_MODEL;
    registrySnapshotHash: string;
    finalizedBlockHash: string;
    finalizedContextId: string;
    trustedCheckpointHeight: string;
    trustedCheckpointContextId: string;
  }>;
}>;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an exact object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, "value");
    })
  ) {
    throw new TypeError(`${label} must contain enumerable JSON data fields.`);
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
  return value as PlainRecord;
};

const canonicalU64 = (
  value: unknown,
  label: string,
  positive = false,
): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(`${label} must be a canonical u64 string.`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U64 || (positive && parsed === 0n)) {
    throw new TypeError(`${label} is outside the allowed u64 range.`);
  }
  return value;
};

const canonicalHash = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !LOWER_HASH_32.test(value) ||
    /^0{64}$/u.test(value)
  ) {
    throw new TypeError(`${label} must be a non-zero lowercase 32-byte hash.`);
  }
  return value;
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as PlainRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as PlainRecord)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

/**
 * Revalidate the main-process result before it crosses the isolated preload
 * bridge. Retired chain/genesis aliases and policy-proof extension fields are
 * deliberately outside this exact response contract.
 */
export const parseGovernanceValidationFeePolicyView = (
  value: unknown,
): GovernanceValidationFeePolicyView => {
  const source = exactRecord(
    value,
    [
      "effective",
      "latestEnacted",
      "observedHeight",
      "registryHead",
      "scheduled",
      "verifiedProof",
    ],
    "Governance validation-fee policy view",
  );
  const observedHeight = canonicalU64(
    source.observedHeight,
    "Governance validation-fee policy observedHeight",
    true,
  );
  const effective = normalizeValidationFeePolicy(source.effective);
  const latestEnacted = normalizeValidationFeePolicy(source.latestEnacted);
  if (canonicalJson(effective) !== canonicalJson(latestEnacted)) {
    throw new TypeError(
      "Governance validation-fee latest enacted policy differs from the effective policy.",
    );
  }
  if (!Array.isArray(source.scheduled) || source.scheduled.length !== 0) {
    throw new TypeError(
      "Governance validation-fee scheduled policies must be exactly empty.",
    );
  }
  const registryHead = exactRecord(
    source.registryHead,
    ["policyHash", "policyVersion"],
    "Governance validation-fee registry head",
  );
  const policyVersion = canonicalU64(
    registryHead.policyVersion,
    "Governance validation-fee registry policyVersion",
    true,
  );
  if (policyVersion !== effective.policy_version) {
    throw new TypeError(
      "Governance validation-fee registry head version differs from the effective policy.",
    );
  }
  const verifiedProof = exactRecord(
    source.verifiedProof,
    [
      "authorizationModel",
      "finalizedBlockHash",
      "finalizedContextId",
      "registrySnapshotHash",
      "schema",
      "trustedCheckpointContextId",
      "trustedCheckpointHeight",
    ],
    "Governance validation-fee verified proof",
  );
  if (
    verifiedProof.schema !== LEDGER_PROJECTION_SCHEMA ||
    verifiedProof.authorizationModel !== AUTHORIZATION_MODEL
  ) {
    throw new TypeError(
      "Governance validation-fee verified proof identifiers are unsupported.",
    );
  }
  return deepFreeze({
    observedHeight,
    effective,
    latestEnacted,
    scheduled: [] as const,
    registryHead: {
      policyVersion,
      policyHash: canonicalHash(
        registryHead.policyHash,
        "Governance validation-fee registry policyHash",
      ),
    },
    verifiedProof: {
      schema: LEDGER_PROJECTION_SCHEMA,
      authorizationModel: AUTHORIZATION_MODEL,
      registrySnapshotHash: canonicalHash(
        verifiedProof.registrySnapshotHash,
        "Governance validation-fee registry snapshot hash",
      ),
      finalizedBlockHash: canonicalHash(
        verifiedProof.finalizedBlockHash,
        "Governance validation-fee finalized block hash",
      ),
      finalizedContextId: canonicalHash(
        verifiedProof.finalizedContextId,
        "Governance validation-fee finalized context ID",
      ),
      trustedCheckpointHeight: canonicalU64(
        verifiedProof.trustedCheckpointHeight,
        "Governance validation-fee trusted checkpoint height",
        true,
      ),
      trustedCheckpointContextId: canonicalHash(
        verifiedProof.trustedCheckpointContextId,
        "Governance validation-fee trusted checkpoint context ID",
      ),
    },
  });
};
