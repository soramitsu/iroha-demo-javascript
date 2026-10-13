import {
  normalizeValidationFeePolicy,
  type ValidationFeePolicyPayload,
} from "../src/governance/model";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { normalizeFirstReleaseAssetDefinitionId } from "./assetDefinitionId";
import { requireFirstReleaseJsonObject } from "./firstReleaseResourceLimits";

export const VALIDATION_FEE_POLICY_DRAFT_PATH =
  "/v1/validation-fee/proposals/draft";
export const VALIDATION_FEE_POLICY_DRAFT_WIRE_ID =
  "iroha.instruction.v1::governance::ProposeValidationFeePolicy";
export const VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT =
  "ProposeValidationFeePolicy";

const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const NETWORK_ID = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const INSTRUCTION_PAYLOAD_MAX_HEX_CHARACTERS = 8 * 1024 * 1024;

type PlainRecord = Record<string, unknown>;

export type ValidationFeePolicyWire = ValidationFeePolicyPayload & PlainRecord;

export interface ValidationFeePolicyDraftRequest extends PlainRecord {
  version: 1;
  proposal_operator: string;
  proposal: {
    kind: "POLICY";
    payload: {
      policy: ValidationFeePolicyWire;
    };
  };
}

export interface ValidationFeePolicyInstructionDraft extends PlainRecord {
  wire_id: typeof VALIDATION_FEE_POLICY_DRAFT_WIRE_ID;
  payload_hex: string;
}

const record = (value: unknown, label: string): PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as PlainRecord;
};

const exactKeys = (
  value: PlainRecord,
  expected: readonly string[],
  label: string,
): void => {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !("value" in descriptor);
    })
  ) {
    throw new TypeError(`${label} must contain enumerable JSON data fields.`);
  }
  const actual = (ownKeys as string[]).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new TypeError(
      `${label} must contain exactly ${sortedExpected.join(", ")}.`,
    );
  }
};

const containsWhitespaceOrControl = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      /\s/u.test(character)
    ) {
      return true;
    }
  }
  return false;
};

const requiredText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > 512 ||
    containsWhitespaceOrControl(value)
  ) {
    throw new TypeError(`${label} must be bounded canonical non-empty text.`);
  }
  return value;
};

const canonicalNetworkId = (value: unknown, label: string): string => {
  const networkId = requiredText(value, label);
  if (!NETWORK_ID.test(networkId)) {
    throw new TypeError(
      `${label} must be one canonical checksummed uppercase NetworkId literal.`,
    );
  }
  return networkId;
};

const requireNetworkPrefix = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0x3fff
  ) {
    throw new TypeError(
      "validation-fee network prefix must be an integer between 0 and 16383.",
    );
  }
  return value;
};

/**
 * Every account literal must already be the SDK-canonical I105 rendering for
 * the active prefix; the native fingerprint parses all accounts with the
 * operator's discriminant and rejects any other prefix.
 */
const requireCanonicalAccount = (
  value: string,
  label: string,
  networkPrefix: number,
): void => {
  let canonical: string;
  try {
    canonical = normalizeCanonicalAccountIdLiteral(value, label, networkPrefix);
  } catch {
    throw new TypeError(
      `${label} must be one canonical I105 account for the active network.`,
    );
  }
  if (canonical !== value) {
    throw new TypeError(
      `${label} must be one canonical I105 account for the active network.`,
    );
  }
};

const requireCanonicalAsset = (value: string, label: string): void => {
  try {
    normalizeFirstReleaseAssetDefinitionId(value, label);
  } catch {
    throw new TypeError(
      `${label} must be one canonical Base58 asset definition ID.`,
    );
  }
};

const normalizePolicy = (
  value: unknown,
  expectedNetworkId: string,
  networkPrefix: number,
): ValidationFeePolicyWire => {
  const policy = normalizeValidationFeePolicy(value);
  const label = "validation-fee policy";
  if (policy.network_id !== expectedNetworkId) {
    throw new TypeError(
      `${label}.network_id differs from the active exact network.`,
    );
  }
  requireCanonicalAccount(
    policy.treasury_account_id,
    `${label}.treasury_account_id`,
    networkPrefix,
  );
  requireCanonicalAccount(
    policy.reward_custody.reward_pool_account_id,
    `${label}.reward_custody.reward_pool_account_id`,
    networkPrefix,
  );
  requireCanonicalAsset(
    policy.reward_custody.xor_asset_id,
    `${label}.reward_custody.xor_asset_id`,
  );
  return policy as ValidationFeePolicyWire;
};

const draftContext = (
  proposalOperatorValue: unknown,
  networkPrefixValue: unknown,
): { proposalOperator: string; networkPrefix: number } => {
  const networkPrefix = requireNetworkPrefix(networkPrefixValue);
  const proposalOperator = requiredText(
    proposalOperatorValue,
    "validation-fee proposal_operator",
  );
  requireCanonicalAccount(
    proposalOperator,
    "validation-fee proposal_operator",
    networkPrefix,
  );
  return { proposalOperator, networkPrefix };
};

/** Build the exact current native policy draft request (`POLICY { policy }`). */
export function buildValidationFeePolicyDraftRequest(
  value: unknown,
  proposalOperatorValue: unknown,
  expectedNetworkIdValue: unknown,
  networkPrefixValue: unknown,
): ValidationFeePolicyDraftRequest {
  const input = requireFirstReleaseJsonObject(
    value,
    "validation-fee proposal input",
  );
  exactKeys(input, ["policy"], "validation-fee proposal input");
  const { proposalOperator, networkPrefix } = draftContext(
    proposalOperatorValue,
    networkPrefixValue,
  );
  const expectedNetworkId = canonicalNetworkId(
    expectedNetworkIdValue,
    "validation-fee expected network_id",
  );
  return {
    version: 1,
    proposal_operator: proposalOperator,
    proposal: {
      kind: "POLICY",
      payload: {
        policy: normalizePolicy(input.policy, expectedNetworkId, networkPrefix),
      },
    },
  };
}

const exactJsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (
      Object.getPrototypeOf(left) !== Array.prototype ||
      Object.getPrototypeOf(right) !== Array.prototype ||
      left.length !== right.length
    ) {
      return false;
    }
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (
      leftKeys.length !== left.length + 1 ||
      rightKeys.length !== right.length + 1 ||
      !leftKeys.includes("length") ||
      !rightKeys.includes("length")
    ) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      const key = String(index);
      const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
      const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
      if (
        !leftDescriptor?.enumerable ||
        !("value" in leftDescriptor) ||
        !rightDescriptor?.enumerable ||
        !("value" in rightDescriptor) ||
        !exactJsonValuesEqual(leftDescriptor.value, rightDescriptor.value)
      ) {
        return false;
      }
    }
    return true;
  }
  const leftIsRecord =
    left !== null && typeof left === "object" && !Array.isArray(left);
  const rightIsRecord =
    right !== null && typeof right === "object" && !Array.isArray(right);
  if (leftIsRecord || rightIsRecord) {
    if (!leftIsRecord || !rightIsRecord) return false;
    const leftRecord = left as PlainRecord;
    const rightRecord = right as PlainRecord;
    if (
      ![Object.prototype, null].includes(Object.getPrototypeOf(leftRecord)) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(rightRecord))
    ) {
      return false;
    }
    const leftOwnKeys = Reflect.ownKeys(leftRecord);
    const rightOwnKeys = Reflect.ownKeys(rightRecord);
    if (
      leftOwnKeys.some((key) => typeof key !== "string") ||
      rightOwnKeys.some((key) => typeof key !== "string")
    ) {
      return false;
    }
    const leftKeys = (leftOwnKeys as string[]).sort();
    const rightKeys = (rightOwnKeys as string[]).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      if (key !== rightKeys[index]) return false;
      const leftDescriptor = Object.getOwnPropertyDescriptor(leftRecord, key);
      const rightDescriptor = Object.getOwnPropertyDescriptor(rightRecord, key);
      if (
        !leftDescriptor?.enumerable ||
        !("value" in leftDescriptor) ||
        !rightDescriptor?.enumerable ||
        !("value" in rightDescriptor) ||
        !exactJsonValuesEqual(leftDescriptor.value, rightDescriptor.value)
      ) {
        return false;
      }
    }
    return true;
  }
  return typeof left === typeof right && left === right;
};

const assertDecodedValue = (
  actual: unknown,
  expected: unknown,
  label: string,
): void => {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new TypeError(`${label} differs from the reviewed value.`);
    }
    expected.forEach((entry, index) => {
      assertDecodedValue(actual[index], entry, `${label}[${index}]`);
    });
    return;
  }
  if (
    expected !== null &&
    typeof expected === "object" &&
    !Array.isArray(expected)
  ) {
    const actualRecord = record(actual, label);
    const expectedRecord = expected as PlainRecord;
    exactKeys(actualRecord, Object.keys(expectedRecord), label);
    for (const [key, expectedValue] of Object.entries(expectedRecord)) {
      assertDecodedValue(actualRecord[key], expectedValue, `${label}.${key}`);
    }
    return;
  }
  if (actual !== expected) {
    throw new TypeError(`${label} differs from the reviewed value.`);
  }
};

const exactInstructionDraft = <TWireId extends string>(
  value: unknown,
  expectedWireId: TWireId,
  label: string,
): { wire_id: TWireId; payload_hex: string } => {
  const instruction = record(value, label);
  exactKeys(instruction, ["payload_hex", "wire_id"], label);
  if (instruction.wire_id !== expectedWireId) {
    throw new TypeError(`${label} must use exact wire id ${expectedWireId}.`);
  }
  if (
    typeof instruction.payload_hex !== "string" ||
    instruction.payload_hex.length > INSTRUCTION_PAYLOAD_MAX_HEX_CHARACTERS ||
    !/^(?:[0-9a-f]{2})+$/u.test(instruction.payload_hex)
  ) {
    throw new TypeError(
      `${label} payload must be bounded non-empty lowercase hexadecimal bytes.`,
    );
  }
  return {
    wire_id: expectedWireId,
    payload_hex: instruction.payload_hex,
  };
};

const draftResponse = (
  value: unknown,
  proposalOperator: string,
  expectedProposalId: string,
  expectedKind: PlainRecord,
): PlainRecord => {
  const response = record(value, "validation-fee proposal draft response");
  exactKeys(
    response,
    [
      "proposal_id",
      "proposal_kind",
      "proposal_operator",
      "tx_instructions",
      "version",
    ],
    "validation-fee proposal draft response",
  );
  if (
    response.version !== 1 ||
    response.proposal_operator !== proposalOperator
  ) {
    throw new TypeError(
      "validation-fee proposal draft response version or proposal_operator differs from the request.",
    );
  }
  if (
    typeof response.proposal_id !== "string" ||
    !LOWER_HEX_32.test(response.proposal_id) ||
    response.proposal_id !== expectedProposalId
  ) {
    throw new TypeError(
      "validation-fee proposal draft response.proposal_id differs from the native proposal fingerprint.",
    );
  }
  if (!exactJsonValuesEqual(response.proposal_kind, expectedKind)) {
    throw new TypeError(
      "validation-fee proposal draft response.proposal_kind differs from the exact requested proposal.",
    );
  }
  if (
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new TypeError(
      "validation-fee proposal draft response must contain exactly one instruction.",
    );
  }
  return response;
};

export function assertValidationFeePolicyDraftResponse(
  value: unknown,
  request: ValidationFeePolicyDraftRequest,
  expectedProposalId: string,
): ValidationFeePolicyInstructionDraft {
  const expected = {
    kind: "ValidationFeePolicy",
    payload: {
      proposal_operator: request.proposal_operator,
      policy: request.proposal.payload.policy,
    },
  };
  const response = draftResponse(
    value,
    request.proposal_operator,
    expectedProposalId,
    expected,
  );
  return exactInstructionDraft(
    (response.tx_instructions as unknown[])[0],
    VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
    "validation-fee policy draft instruction",
  );
}

/**
 * The exact native instruction the wallet reviews for one policy draft. The
 * Torii draft's concrete instruction frame must be byte-identical to this
 * instruction's native encoding.
 */
export function validationFeePolicyDraftInstruction(
  request: ValidationFeePolicyDraftRequest,
): { ProposeValidationFeePolicy: { policy: ValidationFeePolicyWire } } {
  return {
    ProposeValidationFeePolicy: {
      policy: request.proposal.payload.policy,
    },
  };
}

export function assertValidationFeePolicyDecodedInstruction(
  value: unknown,
  request: ValidationFeePolicyDraftRequest,
): void {
  assertDecodedValue(
    value,
    validationFeePolicyDraftInstruction(request),
    "decoded validation-fee policy instruction",
  );
}
