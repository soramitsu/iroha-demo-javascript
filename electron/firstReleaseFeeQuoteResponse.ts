import { blake3 } from "@noble/hashes/blake3.js";
import type { FeeQuoteResponse } from "@iroha/iroha-js";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { parseStrictJson } from "./secureBoundedJson";

export const FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES = 64 * 1024;

type FeeChargeKind = "nexus" | "pipeline_gas";

type FirstReleaseFeeCharge = Readonly<{
  kind: Readonly<{ kind: FeeChargeKind; value: null }>;
  asset_definition_id: string;
  max_amount: string;
}>;

/**
 * The only fee-quote response shape accepted by the first desktop release.
 *
 * Sponsor payment is deliberately absent: every app quote is requested for an
 * authority-funded transaction and the response must preserve that choice.
 */
export type FirstReleaseAuthorityFeeQuoteResponse = Readonly<{
  intent: Readonly<{
    payer: "authority";
    value: Readonly<{
      charge_limits: ReadonlyArray<FirstReleaseFeeCharge>;
      gas_limit: null;
    }>;
  }>;
  observation: Readonly<{
    ledger_time_ms: number;
    next_block_height: number;
    route_dataspace_id: number;
  }>;
  components: ReadonlyArray<FirstReleaseFeeCharge>;
  capacities: ReadonlyArray<never>;
  decision: Readonly<{
    status: "accepted";
    value: Readonly<{
      debit_source: Readonly<{ kind: "account"; value: string }>;
      program_revision: null;
    }>;
  }>;
}> &
  FeeQuoteResponse;

export type FirstReleaseAuthorityFeeQuoteExpectation = Readonly<{
  expectedAuthority: string;
  networkPrefix: number;
}>;

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  Array.from(BASE58_ALPHABET, (character, index) => [character, index]),
);
const BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/u;
const ASSET_DEFINITION_ADDRESS_VERSION = 1;
const ASSET_DEFINITION_ADDRESS_LENGTH = 21;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;
const CANONICAL_QUANTITY_PATTERN =
  /^(?:0|[1-9][0-9]*)(?:\.(?:[0-9]{0,27}[1-9]))?$/u;
const CANONICAL_UNSIGNED_JSON_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
): void => {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
};

const requireDenseArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${label} must be a dense array.`);
    }
  }
  return value;
};

const requireNonNegativeSafeInteger = (
  value: unknown,
  label: string,
  options: Readonly<{ allowZero: boolean }>,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (options.allowZero ? 0 : 1)
  ) {
    throw new Error(
      `${label} must be a ${options.allowZero ? "non-negative" : "positive"} safe JSON integer.`,
    );
  }
  return value;
};

const assertCanonicalUnsignedJsonIntegerTokens = (serialized: string): void => {
  let index = 0;
  while (index < serialized.length) {
    if (serialized[index] === '"') {
      index += 1;
      while (index < serialized.length && serialized[index] !== '"') {
        index += serialized[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    if (serialized[index] === "-" || /[0-9]/u.test(serialized[index]!)) {
      const start = index;
      while (
        index < serialized.length &&
        !/[\s,\]}]/u.test(serialized[index]!)
      ) {
        index += 1;
      }
      const token = serialized.slice(start, index);
      if (!CANONICAL_UNSIGNED_JSON_INTEGER_PATTERN.test(token)) {
        throw new Error(
          "Fee quote response numeric tokens must be canonical unsigned JSON integers.",
        );
      }
      continue;
    }
    index += 1;
  }
};

const decodeBase58 = (literal: string): Uint8Array | null => {
  if (!BASE58_PATTERN.test(literal)) return null;
  const digits = Array.from(literal, (character) =>
    BASE58_INDEX.get(character),
  );
  if (digits.some((digit) => digit === undefined)) return null;

  const scratch = digits as number[];
  let leadingZeroCount = 0;
  while (leadingZeroCount < scratch.length && scratch[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }
  const decoded: number[] = [];
  let start = leadingZeroCount;
  while (start < scratch.length) {
    let remainder = 0;
    for (let index = start; index < scratch.length; index += 1) {
      const accumulator = remainder * 58 + scratch[index]!;
      scratch[index] = Math.floor(accumulator / 256);
      remainder = accumulator % 256;
    }
    decoded.push(remainder);
    while (start < scratch.length && scratch[start] === 0) start += 1;
  }
  decoded.push(...Array.from({ length: leadingZeroCount }, () => 0));
  decoded.reverse();
  return Uint8Array.from(decoded);
};

const encodeBase58 = (bytes: Uint8Array): string => {
  let leadingZeroCount = 0;
  while (leadingZeroCount < bytes.length && bytes[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }
  const scratch = Array.from(bytes);
  const encoded: string[] = [];
  let start = leadingZeroCount;
  while (start < scratch.length) {
    let remainder = 0;
    for (let index = start; index < scratch.length; index += 1) {
      const accumulator = remainder * 256 + scratch[index]!;
      scratch[index] = Math.floor(accumulator / 58);
      remainder = accumulator % 58;
    }
    encoded.push(BASE58_ALPHABET[remainder]!);
    while (start < scratch.length && scratch[start] === 0) start += 1;
  }
  encoded.push(...Array.from({ length: leadingZeroCount }, () => "1"));
  return encoded.reverse().join("");
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

const requireCanonicalAssetDefinitionId = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }
  const decoded = decodeBase58(value);
  if (
    decoded === null ||
    decoded.length !== ASSET_DEFINITION_ADDRESS_LENGTH ||
    decoded[0] !== ASSET_DEFINITION_ADDRESS_VERSION ||
    encodeBase58(decoded) !== value
  ) {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }
  const uuid = decoded.subarray(1, 17);
  const checksum = blake3(decoded.subarray(0, 17)).subarray(0, 4);
  if (
    (uuid[6]! & 0xf0) !== 0x40 ||
    (uuid[8]! & 0xc0) !== 0x80 ||
    !bytesEqual(checksum, decoded.subarray(17))
  ) {
    throw new Error(`${label} must be a canonical Base58 asset definition ID.`);
  }
  return value;
};

const requireCanonicalPositiveQuantity = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string" || !CANONICAL_QUANTITY_PATTERN.test(value)) {
    throw new Error(`${label} must be a canonical positive Quantity string.`);
  }
  const mantissaText = value.replace(".", "").replace(/^0+/u, "") || "0";
  if (
    mantissaText === "0" ||
    mantissaText.length > 154 ||
    BigInt(mantissaText) > MAX_QUANTITY_MANTISSA
  ) {
    throw new Error(`${label} must be a canonical positive Quantity string.`);
  }
  return value;
};

const parseCharge = (value: unknown, label: string): FirstReleaseFeeCharge => {
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["kind", "asset_definition_id", "max_amount"],
    label,
  );
  const kindRecord = requireRecord(record.kind, `${label}.kind`);
  requireExactKeys(kindRecord, ["kind", "value"], `${label}.kind`);
  if (
    (kindRecord.kind !== "nexus" && kindRecord.kind !== "pipeline_gas") ||
    kindRecord.value !== null
  ) {
    throw new Error(
      `${label}.kind must be an exact nexus or pipeline_gas unit variant.`,
    );
  }
  return {
    kind: { kind: kindRecord.kind, value: null },
    asset_definition_id: requireCanonicalAssetDefinitionId(
      record.asset_definition_id,
      `${label}.asset_definition_id`,
    ),
    max_amount: requireCanonicalPositiveQuantity(
      record.max_amount,
      `${label}.max_amount`,
    ),
  };
};

const parseOrderedCharges = (
  value: unknown,
  label: string,
): FirstReleaseFeeCharge[] => {
  const charges = requireDenseArray(value, label).map((entry, index) =>
    parseCharge(entry, `${label}[${index}]`),
  );
  let previousKindIndex = -1;
  for (const charge of charges) {
    const kindIndex = charge.kind.kind === "nexus" ? 0 : 1;
    if (kindIndex <= previousKindIndex) {
      throw new Error(
        `${label} must be unique and ordered nexus before pipeline_gas.`,
      );
    }
    previousKindIndex = kindIndex;
  }
  return charges;
};

const chargesEqual = (
  left: readonly FirstReleaseFeeCharge[],
  right: readonly FirstReleaseFeeCharge[],
): boolean =>
  left.length === right.length &&
  left.every(
    (charge, index) =>
      charge.kind.kind === right[index]!.kind.kind &&
      charge.asset_definition_id === right[index]!.asset_definition_id &&
      charge.max_amount === right[index]!.max_amount,
  );

/**
 * Parse and bind an exact `/v1/fees/quote` JSON body to the app authority.
 *
 * The serialized boundary is intentional: it lets the strict scanner reject
 * duplicate object keys before JavaScript's JSON parser could erase them.
 */
export const parseFirstReleaseAuthorityFeeQuoteResponse = (
  serialized: string,
  expectation: FirstReleaseAuthorityFeeQuoteExpectation,
): FirstReleaseAuthorityFeeQuoteResponse => {
  if (
    typeof serialized !== "string" ||
    serialized.length === 0 ||
    Buffer.byteLength(serialized, "utf8") >
      FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES
  ) {
    throw new Error("Fee quote response must be non-empty bounded UTF-8 JSON.");
  }
  const expectedAuthority = normalizeCanonicalAccountIdLiteral(
    expectation.expectedAuthority,
    "Fee quote expected authority",
    expectation.networkPrefix,
  );
  assertCanonicalUnsignedJsonIntegerTokens(serialized);
  const body = requireRecord(
    parseStrictJson(serialized, "Fee quote response"),
    "Fee quote response",
  );
  requireExactKeys(
    body,
    ["intent", "observation", "components", "capacities", "decision"],
    "Fee quote response",
  );

  const intent = requireRecord(body.intent, "Fee quote response.intent");
  requireExactKeys(intent, ["payer", "value"], "Fee quote response.intent");
  if (intent.payer !== "authority") {
    throw new Error(
      "Fee quote response.intent.payer must preserve authority payment.",
    );
  }
  const intentValue = requireRecord(
    intent.value,
    "Fee quote response.intent.value",
  );
  requireExactKeys(
    intentValue,
    ["charge_limits", "gas_limit"],
    "Fee quote response.intent.value",
  );
  if (intentValue.gas_limit !== null) {
    throw new Error(
      "Fee quote response.intent.value.gas_limit must preserve the app's null gas bound.",
    );
  }
  const chargeLimits = parseOrderedCharges(
    intentValue.charge_limits,
    "Fee quote response.intent.value.charge_limits",
  );

  const observation = requireRecord(
    body.observation,
    "Fee quote response.observation",
  );
  requireExactKeys(
    observation,
    ["ledger_time_ms", "next_block_height", "route_dataspace_id"],
    "Fee quote response.observation",
  );
  const ledgerTimeMs = requireNonNegativeSafeInteger(
    observation.ledger_time_ms,
    "Fee quote response.observation.ledger_time_ms",
    { allowZero: true },
  );
  const nextBlockHeight = requireNonNegativeSafeInteger(
    observation.next_block_height,
    "Fee quote response.observation.next_block_height",
    { allowZero: false },
  );
  const routeDataspaceId = requireNonNegativeSafeInteger(
    observation.route_dataspace_id,
    "Fee quote response.observation.route_dataspace_id",
    { allowZero: true },
  );

  const components = parseOrderedCharges(
    body.components,
    "Fee quote response.components",
  );
  if (!chargesEqual(chargeLimits, components)) {
    throw new Error(
      "Fee quote response.components must exactly match the quoted intent charge limits.",
    );
  }

  const capacities = requireDenseArray(
    body.capacities,
    "Fee quote response.capacities",
  );
  if (capacities.length !== 0) {
    throw new Error(
      "Fee quote response.capacities must be empty for authority payment.",
    );
  }

  const decision = requireRecord(body.decision, "Fee quote response.decision");
  requireExactKeys(
    decision,
    ["status", "value"],
    "Fee quote response.decision",
  );
  if (decision.status !== "accepted") {
    throw new Error("Fee quote response.decision.status must be accepted.");
  }
  const decisionValue = requireRecord(
    decision.value,
    "Fee quote response.decision.value",
  );
  requireExactKeys(
    decisionValue,
    ["debit_source", "program_revision"],
    "Fee quote response.decision.value",
  );
  if (decisionValue.program_revision !== null) {
    throw new Error(
      "Fee quote response.decision.program_revision must be null for authority payment.",
    );
  }
  const debitSource = requireRecord(
    decisionValue.debit_source,
    "Fee quote response.decision.value.debit_source",
  );
  requireExactKeys(
    debitSource,
    ["kind", "value"],
    "Fee quote response.decision.value.debit_source",
  );
  if (
    debitSource.kind !== "account" ||
    debitSource.value !== expectedAuthority
  ) {
    throw new Error(
      "Fee quote response decision must debit the exact expected authority account.",
    );
  }

  return {
    intent: {
      payer: "authority",
      value: { charge_limits: chargeLimits, gas_limit: null },
    },
    observation: {
      ledger_time_ms: ledgerTimeMs,
      next_block_height: nextBlockHeight,
      route_dataspace_id: routeDataspaceId,
    },
    components,
    capacities: [],
    decision: {
      status: "accepted",
      value: {
        debit_source: { kind: "account", value: expectedAuthority },
        program_revision: null,
      },
    },
  };
};
