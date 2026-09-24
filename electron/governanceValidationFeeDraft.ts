import { Buffer } from "node:buffer";

import { requireFirstReleaseJsonObject } from "./firstReleaseResourceLimits";

export const VALIDATION_FEE_POLICY_DRAFT_PATH =
  "/v1/validation-fee/proposals/draft";
export const VALIDATION_FEE_POLICY_DRAFT_WIRE_ID =
  "iroha.instruction.v1::governance::ProposeValidationFeePolicy";
export const VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT =
  "ProposeValidationFeePolicy";
export const VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID =
  "iroha.instruction.v1::governance::ProposeValidationFeePayoutLifecycle";
export const VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_DECODED_VARIANT =
  "ProposeValidationFeePayoutLifecycle";

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const NATIVE_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const NETWORK_ID = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const INSTRUCTION_PAYLOAD_MAX_HEX_CHARACTERS = 8 * 1024 * 1024;

type PlainRecord = Record<string, unknown>;

export type ValidationFeeFixedBytes32 = string;

export interface ValidationFeePayoutRecipientWire extends PlainRecord {
  account_id: string;
  share: "0.25";
}

export interface ValidationFeePayoutBindingWire extends PlainRecord {
  contract_address: string;
  code_hash: ValidationFeeFixedBytes32;
  entrypoint: "autonomous_validation_fee_tick";
  treasury_account_id: string;
  ds_asset_id: typeof NATIVE_SBD_ASSET_DEFINITION_ID;
  xor_asset_id: string;
  pool_vault_account_id: string;
  batch_ds: "10";
  min_xor_out: "4";
  max_xor_out: "100";
  recipients: ValidationFeePayoutRecipientWire[];
}

export type ValidationFeeChargingModeWire =
  | {
      charging_mode: "DISABLED";
      value: null;
    }
  | {
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION";
      value: null;
    };

export interface ValidationFeePolicyWire extends PlainRecord {
  schema_version: 1;
  network_id: string;
  policy_version: string;
  previous_policy_hash: ValidationFeeFixedBytes32 | null;
  ds_asset_id: typeof NATIVE_SBD_ASSET_DEFINITION_ID;
  ds_scale: 2;
  fee: "0" | "0.1";
  treasury_account_id: string;
  charging_mode: ValidationFeeChargingModeWire;
  effective_from_height: string;
  expires_after_height: string | null;
  exemption_classes: [] | ["TREASURY_PAYOUT"];
  treasury_payout_binding: ValidationFeePayoutBindingWire | null;
}

export interface ValidationFeePolicyDraftRequest extends PlainRecord {
  version: 1;
  proposal_operator: string;
  proposal: {
    kind: "POLICY";
    payload: {
      policy: ValidationFeePolicyWire;
      payout_lifecycle_proposal_id: ValidationFeeFixedBytes32 | null;
    };
  };
}

export interface ValidationFeePayoutLifecycleDraftRequest extends PlainRecord {
  version: 1;
  proposal_operator: string;
  proposal: {
    kind: "PAYOUT_LIFECYCLE";
    payload: {
      payout_binding: ValidationFeePayoutBindingWire;
    };
  };
}

export interface ValidationFeePolicyInstructionDraft extends PlainRecord {
  wire_id: typeof VALIDATION_FEE_POLICY_DRAFT_WIRE_ID;
  payload_hex: string;
}

export interface ValidationFeePayoutLifecycleInstructionDraft
  extends PlainRecord {
  wire_id: typeof VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID;
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
    Buffer.byteLength(value, "utf8") > 512 ||
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

const canonicalU64 = (
  value: unknown,
  label: string,
  options: Readonly<{ positive?: boolean }> = {},
): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError(
      `${label} must be a canonical unsigned decimal string.`,
    );
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U64 || (options.positive === true && parsed === 0n)) {
    throw new TypeError(`${label} is outside the unsigned 64-bit range.`);
  }
  return value;
};

const fixedBytes32 = (
  value: unknown,
  label: string,
  options: Readonly<{ allowZero?: boolean }> = {},
): ValidationFeeFixedBytes32 => {
  if (typeof value !== "string" || !LOWER_HEX_32.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 lowercase hexadecimal digits.`,
    );
  }
  if (options.allowZero !== true && /^0{64}$/u.test(value)) {
    throw new TypeError(`${label} must be non-zero.`);
  }
  return value;
};

const exactChargingMode = (value: unknown): ValidationFeeChargingModeWire => {
  const mode = record(value, "validation-fee policy.charging_mode");
  exactKeys(
    mode,
    ["charging_mode", "value"],
    "validation-fee policy.charging_mode",
  );
  if (
    (mode.charging_mode !== "DISABLED" &&
      mode.charging_mode !== "PER_QUALIFYING_TRANSFER_INSTRUCTION") ||
    mode.value !== null
  ) {
    throw new TypeError(
      "validation-fee policy.charging_mode is outside the closed native V1 enum.",
    );
  }
  return {
    charging_mode: mode.charging_mode,
    value: null,
  };
};

const normalizeRecipients = (
  value: unknown,
  treasuryAccountId: string,
  poolVaultAccountId: string,
): ValidationFeePayoutRecipientWire[] => {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError(
      "validation-fee payout binding.recipients must contain exactly four entries.",
    );
  }
  const recipients = value.map((entry, index) => {
    const recipient = record(
      entry,
      `validation-fee payout binding.recipients[${index}]`,
    );
    exactKeys(
      recipient,
      ["account_id", "share"],
      `validation-fee payout binding.recipients[${index}]`,
    );
    const accountId = requiredText(
      recipient.account_id,
      `validation-fee payout binding.recipients[${index}].account_id`,
    );
    if (recipient.share !== "0.25") {
      throw new TypeError(
        "validation-fee payout recipients must each receive exactly 0.25.",
      );
    }
    return { account_id: accountId, share: "0.25" as const };
  });
  const accounts = recipients.map(({ account_id }) => account_id);
  if (
    new Set(accounts).size !== accounts.length ||
    accounts.includes(treasuryAccountId) ||
    accounts.includes(poolVaultAccountId)
  ) {
    throw new TypeError(
      "validation-fee payout recipients must be unique and differ from treasury and pool vault.",
    );
  }
  return recipients;
};

const normalizePayoutBinding = (
  value: unknown,
): ValidationFeePayoutBindingWire => {
  const binding = record(value, "validation-fee payout binding");
  exactKeys(
    binding,
    [
      "batch_ds",
      "code_hash",
      "contract_address",
      "ds_asset_id",
      "entrypoint",
      "max_xor_out",
      "min_xor_out",
      "pool_vault_account_id",
      "recipients",
      "treasury_account_id",
      "xor_asset_id",
    ],
    "validation-fee payout binding",
  );
  const treasuryAccountId = requiredText(
    binding.treasury_account_id,
    "validation-fee payout binding.treasury_account_id",
  );
  const poolVaultAccountId = requiredText(
    binding.pool_vault_account_id,
    "validation-fee payout binding.pool_vault_account_id",
  );
  const xorAssetId = requiredText(
    binding.xor_asset_id,
    "validation-fee payout binding.xor_asset_id",
  );
  if (
    binding.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID ||
    binding.entrypoint !== "autonomous_validation_fee_tick" ||
    binding.batch_ds !== "10" ||
    binding.min_xor_out !== "4" ||
    binding.max_xor_out !== "100"
  ) {
    throw new TypeError(
      "validation-fee payout binding differs from the exact first-release DS payout contract.",
    );
  }
  if (
    treasuryAccountId === poolVaultAccountId ||
    NATIVE_SBD_ASSET_DEFINITION_ID === xorAssetId
  ) {
    throw new TypeError(
      "validation-fee payout treasury, pool vault, and asset definitions must be distinct.",
    );
  }
  return {
    contract_address: requiredText(
      binding.contract_address,
      "validation-fee payout binding.contract_address",
    ),
    code_hash: fixedBytes32(
      binding.code_hash,
      "validation-fee payout binding.code_hash",
    ),
    entrypoint: "autonomous_validation_fee_tick",
    treasury_account_id: treasuryAccountId,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: xorAssetId,
    pool_vault_account_id: poolVaultAccountId,
    batch_ds: "10",
    min_xor_out: "4",
    max_xor_out: "100",
    recipients: normalizeRecipients(
      binding.recipients,
      treasuryAccountId,
      poolVaultAccountId,
    ),
  };
};

const normalizePolicy = (
  value: unknown,
  expectedNetworkId: string,
): ValidationFeePolicyWire => {
  const policy = record(value, "validation-fee policy");
  exactKeys(
    policy,
    [
      "charging_mode",
      "ds_asset_id",
      "ds_scale",
      "effective_from_height",
      "exemption_classes",
      "expires_after_height",
      "fee",
      "network_id",
      "policy_version",
      "previous_policy_hash",
      "schema_version",
      "treasury_account_id",
      "treasury_payout_binding",
    ],
    "validation-fee policy",
  );
  if (policy.schema_version !== 1 || policy.ds_scale !== 2) {
    throw new TypeError(
      "validation-fee policy must use schema_version 1 and ds_scale 2.",
    );
  }
  const networkId = canonicalNetworkId(
    policy.network_id,
    "validation-fee policy.network_id",
  );
  if (networkId !== expectedNetworkId) {
    throw new TypeError(
      "validation-fee policy.network_id differs from the active exact network.",
    );
  }
  if (policy.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID) {
    throw new TypeError(
      `validation-fee policy.ds_asset_id must be ${NATIVE_SBD_ASSET_DEFINITION_ID}.`,
    );
  }
  const policyVersion = canonicalU64(
    policy.policy_version,
    "validation-fee policy.policy_version",
    { positive: true },
  );
  const previousPolicyHash =
    policy.previous_policy_hash === null
      ? null
      : fixedBytes32(
          policy.previous_policy_hash,
          "validation-fee policy.previous_policy_hash",
        );
  if (
    (policyVersion === "1" && previousPolicyHash !== null) ||
    (policyVersion !== "1" && previousPolicyHash === null)
  ) {
    throw new TypeError(
      "validation-fee policy previous_policy_hash does not match policy_version.",
    );
  }
  const effectiveFromHeight = canonicalU64(
    policy.effective_from_height,
    "validation-fee policy.effective_from_height",
  );
  const expiresAfterHeight =
    policy.expires_after_height === null
      ? null
      : canonicalU64(
          policy.expires_after_height,
          "validation-fee policy.expires_after_height",
        );
  if (
    expiresAfterHeight !== null &&
    BigInt(expiresAfterHeight) <= BigInt(effectiveFromHeight)
  ) {
    throw new TypeError(
      "validation-fee policy expiry must be after its effective height.",
    );
  }
  const chargingMode = exactChargingMode(policy.charging_mode);
  const payoutBinding =
    policy.treasury_payout_binding === null
      ? null
      : normalizePayoutBinding(policy.treasury_payout_binding);
  const exemptions = policy.exemption_classes;
  if (
    !Array.isArray(exemptions) ||
    !(
      exemptions.length === 0 ||
      (exemptions.length === 1 && exemptions[0] === "TREASURY_PAYOUT")
    )
  ) {
    throw new TypeError(
      "validation-fee policy.exemption_classes is outside the closed native V1 set.",
    );
  }
  const treasuryAccountId = requiredText(
    policy.treasury_account_id,
    "validation-fee policy.treasury_account_id",
  );
  const enabled =
    chargingMode.charging_mode === "PER_QUALIFYING_TRANSFER_INSTRUCTION";
  if (
    (enabled && policy.fee !== "0.1") ||
    (!enabled && policy.fee !== "0") ||
    (!enabled && (exemptions.length !== 0 || payoutBinding !== null)) ||
    (payoutBinding === null && exemptions.length !== 0) ||
    (payoutBinding !== null &&
      (exemptions.length !== 1 ||
        payoutBinding.treasury_account_id !== treasuryAccountId))
  ) {
    throw new TypeError(
      "validation-fee policy mode, amount, exemptions, and payout binding are inconsistent.",
    );
  }
  return {
    schema_version: 1,
    network_id: networkId,
    policy_version: policyVersion,
    previous_policy_hash: previousPolicyHash,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    ds_scale: 2,
    fee: policy.fee as "0" | "0.1",
    treasury_account_id: treasuryAccountId,
    charging_mode: chargingMode,
    effective_from_height: effectiveFromHeight,
    expires_after_height: expiresAfterHeight,
    exemption_classes: exemptions.length === 0 ? [] : ["TREASURY_PAYOUT"],
    treasury_payout_binding: payoutBinding,
  };
};

const draftContext = (
  proposalOperatorValue: unknown,
  expectedNetworkIdValue?: unknown,
): { proposalOperator: string; expectedNetworkId: string | null } => ({
  proposalOperator: requiredText(
    proposalOperatorValue,
    "validation-fee proposal_operator",
  ),
  expectedNetworkId:
    expectedNetworkIdValue === undefined
      ? null
      : canonicalNetworkId(
          expectedNetworkIdValue,
          "validation-fee expected network_id",
        ),
});

/** Build the exact current native policy draft request. */
export function buildValidationFeePolicyDraftRequest(
  value: unknown,
  proposalOperatorValue: unknown,
  expectedNetworkIdValue: unknown,
): ValidationFeePolicyDraftRequest {
  const input = requireFirstReleaseJsonObject(
    value,
    "validation-fee proposal input",
  );
  exactKeys(
    input,
    ["payout_lifecycle_proposal_id", "policy"],
    "validation-fee proposal input",
  );
  const { proposalOperator, expectedNetworkId } = draftContext(
    proposalOperatorValue,
    expectedNetworkIdValue,
  );
  if (expectedNetworkId === null) {
    throw new TypeError("validation-fee expected network_id is required.");
  }
  const policy = normalizePolicy(input.policy, expectedNetworkId);
  const lifecycleId =
    input.payout_lifecycle_proposal_id === null
      ? null
      : fixedBytes32(
          input.payout_lifecycle_proposal_id,
          "validation-fee payout lifecycle proposal id",
        );
  const payoutEnabled = policy.treasury_payout_binding !== null;
  if (
    (payoutEnabled && lifecycleId === null) ||
    (!payoutEnabled && lifecycleId !== null)
  ) {
    throw new TypeError(
      payoutEnabled
        ? "payout-enabled validation-fee policy requires a lifecycle proposal id."
        : "validation-fee policy without a payout binding cannot select a lifecycle proposal.",
    );
  }
  return {
    version: 1,
    proposal_operator: proposalOperator,
    proposal: {
      kind: "POLICY",
      payload: {
        policy,
        payout_lifecycle_proposal_id: lifecycleId,
      },
    },
  };
}

/** Build the exact current native payout-lifecycle draft request. */
export function buildValidationFeePayoutLifecycleDraftRequest(
  value: unknown,
  proposalOperatorValue: unknown,
): ValidationFeePayoutLifecycleDraftRequest {
  const input = requireFirstReleaseJsonObject(
    value,
    "validation-fee payout lifecycle input",
  );
  exactKeys(input, ["payout_binding"], "validation-fee payout lifecycle input");
  const { proposalOperator } = draftContext(proposalOperatorValue);
  return {
    version: 1,
    proposal_operator: proposalOperator,
    proposal: {
      kind: "PAYOUT_LIFECYCLE",
      payload: {
        payout_binding: normalizePayoutBinding(input.payout_binding),
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
      payout_lifecycle_proposal_id:
        request.proposal.payload.payout_lifecycle_proposal_id,
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

export function assertValidationFeePayoutLifecycleDraftResponse(
  value: unknown,
  request: ValidationFeePayoutLifecycleDraftRequest,
  expectedProposalId: string,
): ValidationFeePayoutLifecycleInstructionDraft {
  const expected = {
    kind: "ValidationFeePayoutLifecycle",
    payload: {
      proposal_operator: request.proposal_operator,
      payout_binding: request.proposal.payload.payout_binding,
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
    VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
    "validation-fee payout lifecycle draft instruction",
  );
}

export function assertValidationFeePolicyDecodedInstruction(
  value: unknown,
  request: ValidationFeePolicyDraftRequest,
): void {
  assertDecodedValue(
    value,
    {
      ProposeValidationFeePolicy: {
        policy: request.proposal.payload.policy,
        payout_lifecycle_proposal_id:
          request.proposal.payload.payout_lifecycle_proposal_id,
      },
    },
    "decoded validation-fee policy instruction",
  );
}

export function assertValidationFeePayoutLifecycleDecodedInstruction(
  value: unknown,
  request: ValidationFeePayoutLifecycleDraftRequest,
): void {
  assertDecodedValue(
    value,
    {
      ProposeValidationFeePayoutLifecycle: {
        payout_binding: request.proposal.payload.payout_binding,
      },
    },
    "decoded validation-fee payout lifecycle instruction",
  );
}
