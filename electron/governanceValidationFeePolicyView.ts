import {
  normalizeValidationFeePolicy,
  type GovernanceValidationFeePolicyView,
} from "../src/governance/model";

export type { GovernanceValidationFeePolicyView };

const LEDGER_PROJECTION_SCHEMA = "cbsi.validation-fee-ledger-projection.v1";
const AUTHORIZATION_MODEL = "SORA_PARLIAMENT_V1";
const LOWER_HASH_32 = /^[0-9a-f]{64}$/u;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

type PlainRecord = Record<string, unknown>;

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

const positiveSafeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
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
 * bridge. The effective policy must be the exact native
 * `ValidationFeePolicyV1`; the registry head carries a version only while it is
 * the effective policy (a scheduled revision has no projected version).
 */
export const parseGovernanceValidationFeePolicyView = (
  value: unknown,
): GovernanceValidationFeePolicyView => {
  const source = exactRecord(
    value,
    [
      "effective",
      "effectivePolicyHash",
      "observedAtMs",
      "observedHeight",
      "registryHead",
      "verifiedProof",
    ],
    "Governance validation-fee policy view",
  );
  const observedHeight = canonicalU64(
    source.observedHeight,
    "Governance validation-fee policy observedHeight",
    true,
  );
  const observedAtMs = positiveSafeInteger(
    source.observedAtMs,
    "Governance validation-fee policy observedAtMs",
  );
  const effective = normalizeValidationFeePolicy(source.effective);
  const effectivePolicyHash = canonicalHash(
    source.effectivePolicyHash,
    "Governance validation-fee effective policy hash",
  );
  if (observedAtMs < effective.effective_from_ms) {
    throw new TypeError(
      "Governance validation-fee effective policy is not active at the observed block.",
    );
  }
  const registryHead = exactRecord(
    source.registryHead,
    ["policyHash", "policyVersion"],
    "Governance validation-fee registry head",
  );
  const headHash = canonicalHash(
    registryHead.policyHash,
    "Governance validation-fee registry policyHash",
  );
  const headVersion =
    registryHead.policyVersion === null
      ? null
      : canonicalU64(
          registryHead.policyVersion,
          "Governance validation-fee registry policyVersion",
          true,
        );
  if (
    (headHash === effectivePolicyHash) !== (headVersion !== null) ||
    (headVersion !== null && headVersion !== effective.policy_version)
  ) {
    throw new TypeError(
      "Governance validation-fee registry head differs from the effective policy.",
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
    observedAtMs,
    effective,
    effectivePolicyHash,
    registryHead: {
      policyHash: headHash,
      policyVersion: headVersion,
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
