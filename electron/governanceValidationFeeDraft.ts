export const VALIDATION_FEE_POLICY_DRAFT_PATH =
  "/v1/validation-fee/proposals/draft";
export const VALIDATION_FEE_POLICY_DRAFT_WIRE_ID =
  "iroha_data_model::isi::governance::ProposeValidationFeePolicy";
export const VALIDATION_FEE_POLICY_DRAFT_DECODED_VARIANT =
  "ProposeValidationFeePolicy";
export const VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID =
  "iroha_data_model::isi::governance::ProposeValidationFeePayoutLifecycle";
export const VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_DECODED_VARIANT =
  "ProposeValidationFeePayoutLifecycle";

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const ACTIVATION_DELAY_BLOCKS = 120_960n;
const REQUIRED_SBD_FEE = "0.10";
const NATIVE_QUANTITY_SBD_FEE = "0.1";
const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const POLICY_KEYS = Object.freeze([
  "chain_id",
  "charging_mode",
  "ds_asset_id",
  "ds_scale",
  "effective_from_height",
  "exemption_classes",
  "expires_after_height",
  "fee",
  "genesis_hash",
  "policy_version",
  "previous_policy_hash",
  "schema_version",
  "treasury_account_id",
  "treasury_payout_binding",
]);
const PAYOUT_BINDING_KEYS = Object.freeze([
  "batch_sbd",
  "code_hash",
  "contract_address",
  "entrypoint",
  "max_xor_out",
  "min_xor_out",
  "pool_vault_account_id",
  "recipients",
  "sbd_asset_id",
  "treasury_account_id",
  "xor_asset_id",
]);

type PlainRecord = Record<string, unknown>;

export interface ValidationFeePolicyDraftRequest
  extends Record<string, unknown> {
  version: 1;
  proposal: {
    kind: "POLICY";
    payload: {
      policy: PlainRecord;
      payout_lifecycle_proposal_id: string | null;
    };
  };
  referendum_window: {
    lower: string;
    upper: string;
  };
  mode: "Plain";
}

export interface ValidationFeePolicyInstructionDraft {
  wire_id: typeof VALIDATION_FEE_POLICY_DRAFT_WIRE_ID;
  payload_hex: string;
}

export interface ValidationFeePayoutLifecycleInstructionDraft {
  wire_id: typeof VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID;
  payload_hex: string;
  proposalId: string;
}

export interface ValidationFeePayoutLifecycleDraftRequest
  extends Record<string, unknown> {
  version: 1;
  proposal: {
    kind: "PAYOUT_LIFECYCLE";
    payload: {
      payout_binding: PlainRecord;
    };
  };
  referendum_window: {
    lower: string;
    upper: string;
  };
  mode: "Plain";
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
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(
      `${label} must contain exactly ${expected.join(", ")}.`,
    );
  }
};

const requiredText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || codePoint === 0x7f;
    })
  ) {
    throw new TypeError(`${label} must be canonical non-empty text.`);
  }
  return value;
};

const lowerHex32 = (
  value: unknown,
  label: string,
  options: { allowZero?: boolean } = {},
): string => {
  if (typeof value !== "string" || !LOWER_HEX_32.test(value)) {
    throw new TypeError(
      `${label} must be exactly 64 lowercase hexadecimal digits.`,
    );
  }
  if (!options.allowZero && /^0+$/u.test(value)) {
    throw new TypeError(`${label} must be non-zero.`);
  }
  return value;
};

const safeUnsignedInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean } = {},
): string => {
  let parsed: bigint;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    parsed = BigInt(value);
  } else if (typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new TypeError(`${label} must be a complete unsigned integer.`);
  }
  if (parsed > MAX_U64 || (options.positive && parsed === 0n)) {
    throw new TypeError(`${label} is outside the unsigned 64-bit range.`);
  }
  return parsed.toString();
};

const exactChargingMode = (value: unknown): PlainRecord => {
  const mode = record(value, "validation-fee policy.charging_mode");
  exactKeys(
    mode,
    ["charging_mode", "value"],
    "validation-fee policy.charging_mode",
  );
  if (
    mode.charging_mode !== "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
    mode.value !== null
  ) {
    throw new TypeError(
      "validation-fee policy.charging_mode must be the exact enabled first-release mode.",
    );
  }
  return {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  };
};

const exactStringArray = (value: unknown, label: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length === 0 ||
        entry.trim() !== entry,
    )
  ) {
    throw new TypeError(`${label} must be an array of canonical strings.`);
  }
  return [...value];
};

const normalizePayoutBinding = (
  value: unknown,
  policy: { dsAssetId: string; treasuryAccountId: string },
): PlainRecord | null => {
  if (value === null) return null;
  const binding = record(
    value,
    "validation-fee policy.treasury_payout_binding",
  );
  exactKeys(
    binding,
    PAYOUT_BINDING_KEYS,
    "validation-fee policy.treasury_payout_binding",
  );
  const recipients = binding.recipients;
  if (!Array.isArray(recipients) || recipients.length !== 4) {
    throw new TypeError(
      "validation-fee payout binding must contain exactly four recipients.",
    );
  }
  const normalizedRecipients = recipients.map((entry, index) => {
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
    return { account_id: accountId, share: "0.25" };
  });
  const recipientAccounts = normalizedRecipients.map(
    (recipient) => recipient.account_id,
  );
  if (new Set(recipientAccounts).size !== recipientAccounts.length) {
    throw new TypeError(
      "validation-fee payout recipient accounts must be unique.",
    );
  }
  const treasuryAccountId = requiredText(
    binding.treasury_account_id,
    "validation-fee payout binding.treasury_account_id",
  );
  const poolVaultAccountId = requiredText(
    binding.pool_vault_account_id,
    "validation-fee payout binding.pool_vault_account_id",
  );
  const sbdAssetId = requiredText(
    binding.sbd_asset_id,
    "validation-fee payout binding.sbd_asset_id",
  );
  const xorAssetId = requiredText(
    binding.xor_asset_id,
    "validation-fee payout binding.xor_asset_id",
  );
  if (
    treasuryAccountId !== policy.treasuryAccountId ||
    sbdAssetId !== policy.dsAssetId
  ) {
    throw new TypeError(
      "validation-fee payout binding must use the policy treasury and fee asset.",
    );
  }
  if (
    treasuryAccountId === poolVaultAccountId ||
    sbdAssetId === xorAssetId ||
    recipientAccounts.includes(treasuryAccountId) ||
    recipientAccounts.includes(poolVaultAccountId)
  ) {
    throw new TypeError(
      "validation-fee payout treasury, vault, assets, and recipients must be distinct.",
    );
  }
  if (
    binding.entrypoint !== "autonomous_validation_fee_tick" ||
    binding.batch_sbd !== "10" ||
    binding.min_xor_out !== "4" ||
    binding.max_xor_out !== "100"
  ) {
    throw new TypeError(
      "validation-fee payout binding must use the exact first-release entrypoint and payout bounds.",
    );
  }
  return {
    contract_address: requiredText(
      binding.contract_address,
      "validation-fee payout binding.contract_address",
    ),
    code_hash: lowerHex32(
      binding.code_hash,
      "validation-fee payout binding.code_hash",
    ),
    entrypoint: "autonomous_validation_fee_tick",
    treasury_account_id: treasuryAccountId,
    sbd_asset_id: sbdAssetId,
    xor_asset_id: xorAssetId,
    pool_vault_account_id: poolVaultAccountId,
    batch_sbd: "10",
    min_xor_out: "4",
    max_xor_out: "100",
    recipients: normalizedRecipients,
  };
};

const normalizeStandalonePayoutBinding = (value: unknown): PlainRecord => {
  const binding = record(
    value,
    "validation-fee payout lifecycle.payout_binding",
  );
  exactKeys(
    binding,
    PAYOUT_BINDING_KEYS,
    "validation-fee payout lifecycle.payout_binding",
  );
  return normalizePayoutBinding(binding, {
    dsAssetId: requiredText(
      binding.sbd_asset_id,
      "validation-fee payout lifecycle.payout_binding.sbd_asset_id",
    ),
    treasuryAccountId: requiredText(
      binding.treasury_account_id,
      "validation-fee payout lifecycle.payout_binding.treasury_account_id",
    ),
  }) as PlainRecord;
};

const normalizeReferendumWindow = (
  value: unknown,
): { lower: string; upper: string } => {
  const window = record(value, "validation-fee referendum_window");
  exactKeys(window, ["lower", "upper"], "validation-fee referendum_window");
  const lower = safeUnsignedInteger(
    window.lower,
    "validation-fee referendum_window.lower",
    { positive: true },
  );
  const upper = safeUnsignedInteger(
    window.upper,
    "validation-fee referendum_window.upper",
    { positive: true },
  );
  if (BigInt(upper) < BigInt(lower)) {
    throw new TypeError("validation-fee referendum window is reversed.");
  }
  return { lower, upper };
};

const normalizePolicy = (value: unknown): PlainRecord => {
  const policy = record(value, "validation-fee policy");
  exactKeys(policy, POLICY_KEYS, "validation-fee policy");
  if (policy.schema_version !== 1) {
    throw new TypeError("validation-fee policy.schema_version must be 1.");
  }
  if (policy.ds_scale !== 2) {
    throw new TypeError("validation-fee policy.ds_scale must be exactly 2.");
  }
  if (policy.fee !== REQUIRED_SBD_FEE) {
    throw new TypeError("validation-fee policy.fee must be exactly 0.10 SBD.");
  }
  const chainId = requiredText(
    policy.chain_id,
    "validation-fee policy.chain_id",
  );
  const genesisHash = lowerHex32(
    policy.genesis_hash,
    "validation-fee policy.genesis_hash",
  );
  const policyVersion = safeUnsignedInteger(
    policy.policy_version,
    "validation-fee policy.policy_version",
    { positive: true },
  );
  let previousPolicyHash: string | null = null;
  if (policy.previous_policy_hash !== null) {
    previousPolicyHash = lowerHex32(
      policy.previous_policy_hash,
      "validation-fee policy.previous_policy_hash",
    );
  }
  if (
    (policyVersion === "1" && previousPolicyHash !== null) ||
    (BigInt(policyVersion) > 1n && previousPolicyHash === null)
  ) {
    throw new TypeError(
      "validation-fee policy previous hash does not match its version.",
    );
  }
  const dsAssetId = requiredText(
    policy.ds_asset_id,
    "validation-fee policy.ds_asset_id",
  );
  const treasuryAccountId = requiredText(
    policy.treasury_account_id,
    "validation-fee policy.treasury_account_id",
  );
  const effectiveFromHeight = safeUnsignedInteger(
    policy.effective_from_height,
    "validation-fee policy.effective_from_height",
    { positive: true },
  );
  const expiresAfterHeight =
    policy.expires_after_height === null
      ? null
      : safeUnsignedInteger(
          policy.expires_after_height,
          "validation-fee policy.expires_after_height",
          { positive: true },
        );
  if (
    expiresAfterHeight !== null &&
    BigInt(expiresAfterHeight) <= BigInt(effectiveFromHeight)
  ) {
    throw new TypeError(
      "validation-fee policy expiry must be after its effective height.",
    );
  }
  const exemptionClasses = exactStringArray(
    policy.exemption_classes,
    "validation-fee policy.exemption_classes",
  );
  const payoutBinding = normalizePayoutBinding(policy.treasury_payout_binding, {
    dsAssetId,
    treasuryAccountId,
  });
  if (
    exemptionClasses.length !== (payoutBinding ? 1 : 0) ||
    (payoutBinding && exemptionClasses[0] !== "TREASURY_PAYOUT")
  ) {
    throw new TypeError(
      "validation-fee policy must use only TREASURY_PAYOUT with an exact payout binding.",
    );
  }
  return {
    schema_version: 1,
    chain_id: chainId,
    genesis_hash: genesisHash,
    policy_version: policyVersion,
    previous_policy_hash: previousPolicyHash,
    ds_asset_id: dsAssetId,
    ds_scale: 2,
    // Quantity's strict native JSON form removes insignificant trailing zeroes;
    // ds_scale=2 and the input check above retain the exact 0.10 SBD policy.
    fee: NATIVE_QUANTITY_SBD_FEE,
    treasury_account_id: treasuryAccountId,
    charging_mode: exactChargingMode(policy.charging_mode),
    effective_from_height: effectiveFromHeight,
    expires_after_height: expiresAfterHeight,
    exemption_classes: exemptionClasses,
    treasury_payout_binding: payoutBinding,
  };
};

/**
 * Translate the renderer's exact native-name composer values into the strict
 * Torii V1 policy-draft DTO. No legacy names or unknown fields are accepted.
 */
export function buildValidationFeePolicyDraftRequest(
  value: unknown,
): ValidationFeePolicyDraftRequest {
  const input = record(value, "validation-fee proposal input");
  exactKeys(
    input,
    ["payout_lifecycle_proposal_id", "policy", "referendum_window"],
    "validation-fee proposal input",
  );
  const policy = normalizePolicy(input.policy);
  const { lower, upper } = normalizeReferendumWindow(input.referendum_window);
  const minimumEffectiveHeight = BigInt(upper) + ACTIVATION_DELAY_BLOCKS;
  if (
    minimumEffectiveHeight > MAX_U64 ||
    BigInt(policy.effective_from_height as string) < minimumEffectiveHeight
  ) {
    throw new TypeError(
      "validation-fee policy must activate at least 120,960 blocks after the referendum window ends.",
    );
  }
  const payoutBinding = policy.treasury_payout_binding !== null;
  const payoutLifecycleProposalId =
    input.payout_lifecycle_proposal_id === null
      ? null
      : lowerHex32(
          input.payout_lifecycle_proposal_id,
          "validation-fee payout lifecycle proposal id",
        );
  if (
    (payoutBinding && payoutLifecycleProposalId === null) ||
    (!payoutBinding && payoutLifecycleProposalId !== null)
  ) {
    throw new TypeError(
      payoutBinding
        ? "payout-enabled validation-fee policy requires a lifecycle proposal id."
        : "validation-fee policy without a payout binding cannot select a lifecycle proposal.",
    );
  }
  return {
    version: 1,
    proposal: {
      kind: "POLICY",
      payload: {
        policy,
        payout_lifecycle_proposal_id: payoutLifecycleProposalId,
      },
    },
    referendum_window: { lower, upper },
    mode: "Plain",
  };
}

/**
 * Build the lifecycle referendum which must be enacted before a payout-enabled
 * policy may reference the same immutable binding.
 */
export function buildValidationFeePayoutLifecycleDraftRequest(
  value: unknown,
): ValidationFeePayoutLifecycleDraftRequest {
  const input = record(value, "validation-fee payout lifecycle input");
  exactKeys(
    input,
    ["payout_binding", "referendum_window"],
    "validation-fee payout lifecycle input",
  );
  return {
    version: 1,
    proposal: {
      kind: "PAYOUT_LIFECYCLE",
      payload: {
        payout_binding: normalizeStandalonePayoutBinding(input.payout_binding),
      },
    },
    referendum_window: normalizeReferendumWindow(input.referendum_window),
    mode: "Plain",
  };
}

const byteArrayHex = (value: unknown): string | null => {
  if (
    value instanceof Uint8Array ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255,
      ))
  ) {
    return Array.from(value as Uint8Array | number[])
      .map((entry) => Number(entry).toString(16).padStart(2, "0"))
      .join("");
  }
  return null;
};

const assertExactValue = (
  actual: unknown,
  expected: unknown,
  label: string,
): void => {
  const bytes = byteArrayHex(actual);
  if (bytes !== null && typeof expected === "string" && bytes === expected) {
    return;
  }
  if (
    ((typeof actual === "number" &&
      Number.isSafeInteger(actual) &&
      actual >= 0) ||
      (typeof actual === "bigint" && actual >= 0n) ||
      (typeof actual === "string" && /^(?:0|[1-9]\d*)$/u.test(actual))) &&
    ((typeof expected === "number" &&
      Number.isSafeInteger(expected) &&
      expected >= 0) ||
      (typeof expected === "bigint" && expected >= 0n) ||
      (typeof expected === "string" && /^(?:0|[1-9]\d*)$/u.test(expected))) &&
    BigInt(actual) === BigInt(expected)
  ) {
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new TypeError(`${label} differs from the reviewed value.`);
    }
    expected.forEach((entry, index) => {
      assertExactValue(actual[index], entry, `${label}[${index}]`);
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
    exactKeys(actualRecord, Object.keys(expectedRecord).sort(), label);
    for (const [key, value] of Object.entries(expectedRecord)) {
      assertExactValue(actualRecord[key], value, `${label}.${key}`);
    }
    return;
  }
  if (actual !== expected) {
    throw new TypeError(`${label} differs from the reviewed value.`);
  }
};

/**
 * Verify the strict Torii response before any returned instruction can enter
 * the signing pipeline.
 */
export function assertValidationFeePolicyDraftResponse(
  value: unknown,
  request: ValidationFeePolicyDraftRequest,
  expectedProposalId: string,
): ValidationFeePolicyInstructionDraft {
  const response = record(value, "validation-fee proposal draft response");
  exactKeys(
    response,
    ["proposal_id", "proposal_kind", "tx_instructions", "version"],
    "validation-fee proposal draft response",
  );
  if (response.version !== 1) {
    throw new TypeError(
      "validation-fee proposal draft response.version must be 1.",
    );
  }
  const proposalId = lowerHex32(
    response.proposal_id,
    "validation-fee proposal draft response.proposal_id",
  );
  const expected = lowerHex32(
    expectedProposalId,
    "expected native validation-fee proposal id",
  );
  if (proposalId !== expected) {
    throw new TypeError(
      "validation-fee proposal draft response.proposal_id differs from the native proposal fingerprint.",
    );
  }
  assertExactValue(
    response.proposal_kind,
    {
      kind: "ValidationFeePolicy",
      payload: request.proposal.payload,
    },
    "validation-fee proposal draft response.proposal_kind",
  );
  if (
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new TypeError(
      "validation-fee proposal draft response must contain exactly one instruction.",
    );
  }
  const instruction = record(
    response.tx_instructions[0],
    "validation-fee proposal draft instruction",
  );
  exactKeys(
    instruction,
    ["payload_hex", "wire_id"],
    "validation-fee proposal draft instruction",
  );
  if (instruction.wire_id !== VALIDATION_FEE_POLICY_DRAFT_WIRE_ID) {
    throw new TypeError(
      `validation-fee proposal draft instruction must use ${VALIDATION_FEE_POLICY_DRAFT_WIRE_ID}.`,
    );
  }
  if (
    typeof instruction.payload_hex !== "string" ||
    !/^(?:[0-9a-f]{2})+$/u.test(instruction.payload_hex)
  ) {
    throw new TypeError(
      "validation-fee proposal draft instruction payload must be non-empty lowercase hexadecimal bytes.",
    );
  }
  return instruction as unknown as ValidationFeePolicyInstructionDraft;
}

/** Verify the locally decoded instruction against every reviewed field. */
export function assertValidationFeePolicyDecodedInstruction(
  value: unknown,
  request: ValidationFeePolicyDraftRequest,
): void {
  assertExactValue(
    value,
    {
      ProposeValidationFeePolicy: {
        policy: request.proposal.payload.policy,
        payout_lifecycle_proposal_id:
          request.proposal.payload.payout_lifecycle_proposal_id,
        referendum_window: request.referendum_window,
        mode: "Plain",
      },
    },
    "decoded validation-fee proposal instruction",
  );
}

export function assertValidationFeePayoutLifecycleDraftResponse(
  value: unknown,
  request: ValidationFeePayoutLifecycleDraftRequest,
): ValidationFeePayoutLifecycleInstructionDraft {
  const response = record(
    value,
    "validation-fee payout lifecycle draft response",
  );
  exactKeys(
    response,
    ["proposal_id", "proposal_kind", "tx_instructions", "version"],
    "validation-fee payout lifecycle draft response",
  );
  if (response.version !== 1) {
    throw new TypeError(
      "validation-fee payout lifecycle draft response.version must be 1.",
    );
  }
  const proposalId = lowerHex32(
    response.proposal_id,
    "validation-fee payout lifecycle draft response.proposal_id",
  );
  assertExactValue(
    response.proposal_kind,
    {
      kind: "ValidationFeePayoutLifecycle",
      payload: request.proposal.payload,
    },
    "validation-fee payout lifecycle draft response.proposal_kind",
  );
  if (
    !Array.isArray(response.tx_instructions) ||
    response.tx_instructions.length !== 1
  ) {
    throw new TypeError(
      "validation-fee payout lifecycle draft response must contain exactly one instruction.",
    );
  }
  const instruction = record(
    response.tx_instructions[0],
    "validation-fee payout lifecycle draft instruction",
  );
  exactKeys(
    instruction,
    ["payload_hex", "wire_id"],
    "validation-fee payout lifecycle draft instruction",
  );
  if (instruction.wire_id !== VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID) {
    throw new TypeError(
      `validation-fee payout lifecycle draft instruction must use ${VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID}.`,
    );
  }
  if (
    typeof instruction.payload_hex !== "string" ||
    !/^(?:[0-9a-f]{2})+$/u.test(instruction.payload_hex)
  ) {
    throw new TypeError(
      "validation-fee payout lifecycle draft instruction payload must be non-empty lowercase hexadecimal bytes.",
    );
  }
  return {
    wire_id: VALIDATION_FEE_PAYOUT_LIFECYCLE_DRAFT_WIRE_ID,
    payload_hex: instruction.payload_hex as string,
    proposalId,
  };
}

export function assertValidationFeePayoutLifecycleDecodedInstruction(
  value: unknown,
  request: ValidationFeePayoutLifecycleDraftRequest,
): void {
  assertExactValue(
    value,
    {
      ProposeValidationFeePayoutLifecycle: {
        payout_binding: request.proposal.payload.payout_binding,
        referendum_window: request.referendum_window,
        mode: "Plain",
      },
    },
    "decoded validation-fee payout lifecycle proposal instruction",
  );
}
