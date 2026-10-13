import { parseNetworkIdLiteral } from "../utils/networkIdentity";

export type GovernanceProposalStatus =
  | "Proposed"
  | "Rejected"
  | "Enacted"
  | "Superseded"
  | "ExecutionFailed";

export type GovernanceProposalKindId =
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy";

export type GovernanceWritableProposalKindId = GovernanceProposalKindId;

interface GovernanceKindBase {
  type: GovernanceProposalKindId;
  proposalOperator: string;
  raw: Record<string, unknown>;
}

export type ValidationFeeChargingModePayload =
  | { charging_mode: "DISABLED"; value: null }
  | {
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION";
      value: null;
    };

export interface ValidationFeePayoutRecipientPayload {
  account_id: string;
  share: "0.25";
}

export interface ValidationFeePayoutBindingPayload {
  contract_address: string;
  code_hash: string;
  entrypoint: "autonomous_validation_fee_tick";
  treasury_account_id: string;
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
  xor_asset_id: string;
  pool_vault_account_id: string;
  batch_ds: "10";
  min_xor_out: "4";
  max_xor_out: "100";
  recipients: ValidationFeePayoutRecipientPayload[];
}

export interface ValidationFeePolicyPayload {
  schema_version: 1;
  /** Canonical endpoint-derived NetworkId literal. */
  network_id: string;
  policy_version: string;
  previous_policy_hash: string | null;
  ds_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
  ds_scale: 2;
  fee: "0" | "0.1";
  treasury_account_id: string;
  charging_mode: ValidationFeeChargingModePayload;
  effective_from_height: string;
  expires_after_height: string | null;
  exemption_classes: [] | ["TREASURY_PAYOUT"];
  treasury_payout_binding: ValidationFeePayoutBindingPayload | null;
}

export interface ValidationFeePolicyGovernanceKind extends GovernanceKindBase {
  type: "ValidationFeePolicy";
  policy: ValidationFeePolicyPayload;
  payoutLifecycleProposalId: string | null;
}

export interface ValidationFeePayoutLifecycleGovernanceKind
  extends GovernanceKindBase {
  type: "ValidationFeePayoutLifecycle";
  payoutBinding: ValidationFeePayoutBindingPayload;
}

export type GovernanceProposalKind =
  | ValidationFeePayoutLifecycleGovernanceKind
  | ValidationFeePolicyGovernanceKind;

export interface GovernanceProposalSummary {
  proposalId: string;
  proposer: string;
  createdHeight: number;
  status: GovernanceProposalStatus;
  kindType: GovernanceProposalKindId;
  kindLabelKey: string;
}

export interface GovernanceCertificateView {
  proposalContentId: string;
  governanceAttemptId: string;
  governanceAttemptSequence: number;
  certifiedAtHeight: string;
  enactAtHeight: string;
  bodyBindingCount: number;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalDetail {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
  currentHeight: string;
  governanceCertificate: GovernanceCertificateView | null;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalList {
  items: GovernanceProposalSummary[];
  nextCursor: string | null;
  limit: number;
}

export interface GovernanceProposalKindAdapter {
  id: GovernanceProposalKindId;
  labelKey: string;
  descriptionKey: string;
  composer: "validation-fee-lifecycle" | "validation-fee";
}

export const GOVERNANCE_KIND_ADAPTERS: Readonly<
  Record<GovernanceProposalKindId, GovernanceProposalKindAdapter>
> = Object.freeze({
  ValidationFeePayoutLifecycle: {
    id: "ValidationFeePayoutLifecycle",
    labelKey: "Validation fee payout lifecycle",
    descriptionKey:
      "Authorize one exact treasury payout binding through the mandatory private Parliament protocol.",
    composer: "validation-fee-lifecycle",
  },
  ValidationFeePolicy: {
    id: "ValidationFeePolicy",
    labelKey: "Validation fee policy",
    descriptionKey:
      "Append one exact network-bound validation-fee policy through the mandatory private Parliament protocol.",
    composer: "validation-fee",
  },
});

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const NATIVE_SBD_ASSET_DEFINITION_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
const LOWER_HEX_32 = /^[0-9a-f]{64}$/u;
const LOWER_CURSOR_V1 = /^[0-9a-f]{96}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
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
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(
      `${label} must contain exactly ${expected.join(", ")}.`,
    );
  }
  return value;
};

const requiredText = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 512 ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new TypeError(`${label} must be bounded canonical non-empty text.`);
  }
  return value;
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

const exactJsonU64 = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be an exact non-negative JSON integer.`);
  }
  return value;
};

const exactJsonU32 = (value: unknown, label: string): number => {
  const parsed = exactJsonU64(value, label);
  if (parsed > 0xffff_ffff) {
    throw new TypeError(`${label} exceeds uint32.`);
  }
  return parsed;
};

const fixedBytes32 = (
  value: unknown,
  label: string,
  options: Readonly<{ allowZero?: boolean }> = {},
): string => {
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

export const canonicalGovernanceProposalId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  const literal = value.trim();
  const raw = literal.startsWith("0x") ? literal.slice(2) : literal;
  return LOWER_HEX_32.test(raw) ? `0x${raw}` : null;
};

export const canonicalValidationFeeHash = (value: unknown): string | null =>
  typeof value === "string" && LOWER_HEX_32.test(value) ? value : null;

const exactChargingMode = (
  value: unknown,
): ValidationFeeChargingModePayload => {
  const mode = exactRecord(
    value,
    ["charging_mode", "value"],
    "Validation-fee policy.charging_mode",
  );
  if (
    (mode.charging_mode !== "DISABLED" &&
      mode.charging_mode !== "PER_QUALIFYING_TRANSFER_INSTRUCTION") ||
    mode.value !== null
  ) {
    throw new TypeError(
      "Validation-fee policy.charging_mode is outside the closed native V1 enum.",
    );
  }
  return { charging_mode: mode.charging_mode, value: null };
};

export const normalizeValidationFeePayoutBinding = (
  raw: unknown,
): ValidationFeePayoutBindingPayload => {
  const binding = exactRecord(
    raw,
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
    "Validation-fee payout binding",
  );
  const treasuryAccountId = requiredText(
    binding.treasury_account_id,
    "Validation-fee payout binding.treasury_account_id",
  );
  const poolVaultAccountId = requiredText(
    binding.pool_vault_account_id,
    "Validation-fee payout binding.pool_vault_account_id",
  );
  const xorAssetId = requiredText(
    binding.xor_asset_id,
    "Validation-fee payout binding.xor_asset_id",
  );
  if (
    binding.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID ||
    binding.entrypoint !== "autonomous_validation_fee_tick" ||
    binding.batch_ds !== "10" ||
    binding.min_xor_out !== "4" ||
    binding.max_xor_out !== "100"
  ) {
    throw new TypeError(
      "Validation-fee payout binding differs from the exact first-release DS payout contract.",
    );
  }
  if (
    treasuryAccountId === poolVaultAccountId ||
    xorAssetId === NATIVE_SBD_ASSET_DEFINITION_ID
  ) {
    throw new TypeError(
      "Validation-fee payout treasury, pool vault, and asset definitions must be distinct.",
    );
  }
  if (!Array.isArray(binding.recipients) || binding.recipients.length !== 4) {
    throw new TypeError(
      "Validation-fee payout binding.recipients must contain exactly four entries.",
    );
  }
  const recipients = binding.recipients.map((entry, index) => {
    const recipient = exactRecord(
      entry,
      ["account_id", "share"],
      `Validation-fee payout binding.recipients[${index}]`,
    );
    const accountId = requiredText(
      recipient.account_id,
      `Validation-fee payout binding.recipients[${index}].account_id`,
    );
    if (recipient.share !== "0.25") {
      throw new TypeError(
        "Validation-fee payout recipients must each receive exactly 0.25.",
      );
    }
    return { account_id: accountId, share: "0.25" as const };
  });
  const recipientAccounts = recipients.map(({ account_id }) => account_id);
  if (
    new Set(recipientAccounts).size !== recipientAccounts.length ||
    recipientAccounts.includes(treasuryAccountId) ||
    recipientAccounts.includes(poolVaultAccountId)
  ) {
    throw new TypeError(
      "Validation-fee payout recipients must be unique and differ from treasury and pool vault.",
    );
  }
  return {
    contract_address: requiredText(
      binding.contract_address,
      "Validation-fee payout binding.contract_address",
    ),
    code_hash: fixedBytes32(
      binding.code_hash,
      "Validation-fee payout binding.code_hash",
    ),
    entrypoint: "autonomous_validation_fee_tick",
    treasury_account_id: treasuryAccountId,
    ds_asset_id: NATIVE_SBD_ASSET_DEFINITION_ID,
    xor_asset_id: xorAssetId,
    pool_vault_account_id: poolVaultAccountId,
    batch_ds: "10",
    min_xor_out: "4",
    max_xor_out: "100",
    recipients,
  };
};

export const normalizeValidationFeePolicy = (
  raw: unknown,
): ValidationFeePolicyPayload => {
  const policy = exactRecord(
    raw,
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
    "Validation-fee policy",
  );
  let networkId: string;
  try {
    networkId = parseNetworkIdLiteral(
      policy.network_id,
      "Validation-fee policy.network_id",
    );
  } catch {
    networkId = "";
  }
  if (
    policy.schema_version !== 1 ||
    !networkId ||
    networkId !== policy.network_id ||
    policy.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID ||
    policy.ds_scale !== 2
  ) {
    throw new TypeError(
      "Validation-fee policy must use a canonical NetworkId, the exact schema version, DS asset, and scale.",
    );
  }
  const policyVersion = canonicalU64(
    policy.policy_version,
    "Validation-fee policy.policy_version",
    { positive: true },
  );
  const previousPolicyHash =
    policy.previous_policy_hash === null
      ? null
      : fixedBytes32(
          policy.previous_policy_hash,
          "Validation-fee policy.previous_policy_hash",
        );
  if (
    (policyVersion === "1" && previousPolicyHash !== null) ||
    (policyVersion !== "1" && previousPolicyHash === null)
  ) {
    throw new TypeError(
      "Validation-fee policy.previous_policy_hash does not match policy_version.",
    );
  }
  const effectiveFromHeight = canonicalU64(
    policy.effective_from_height,
    "Validation-fee policy.effective_from_height",
  );
  const expiresAfterHeight =
    policy.expires_after_height === null
      ? null
      : canonicalU64(
          policy.expires_after_height,
          "Validation-fee policy.expires_after_height",
        );
  if (
    expiresAfterHeight !== null &&
    BigInt(expiresAfterHeight) <= BigInt(effectiveFromHeight)
  ) {
    throw new TypeError(
      "Validation-fee policy expiry must be after its effective height.",
    );
  }
  const chargingMode = exactChargingMode(policy.charging_mode);
  const payoutBinding =
    policy.treasury_payout_binding === null
      ? null
      : normalizeValidationFeePayoutBinding(policy.treasury_payout_binding);
  if (
    !Array.isArray(policy.exemption_classes) ||
    !(
      policy.exemption_classes.length === 0 ||
      (policy.exemption_classes.length === 1 &&
        policy.exemption_classes[0] === "TREASURY_PAYOUT")
    )
  ) {
    throw new TypeError(
      "Validation-fee policy.exemption_classes is outside the closed native V1 set.",
    );
  }
  const treasuryAccountId = requiredText(
    policy.treasury_account_id,
    "Validation-fee policy.treasury_account_id",
  );
  const enabled =
    chargingMode.charging_mode === "PER_QUALIFYING_TRANSFER_INSTRUCTION";
  const exemptions =
    policy.exemption_classes.length === 0
      ? ([] as [])
      : (["TREASURY_PAYOUT"] as ["TREASURY_PAYOUT"]);
  if (
    (enabled && policy.fee !== "0.1") ||
    (!enabled && policy.fee !== "0") ||
    (!enabled && (exemptions.length !== 0 || payoutBinding !== null)) ||
    (payoutBinding === null && exemptions.length !== 0) ||
    (payoutBinding !== null &&
      (exemptions.length !== 1 ||
        payoutBinding.treasury_account_id !== treasuryAccountId ||
        payoutBinding.ds_asset_id !== NATIVE_SBD_ASSET_DEFINITION_ID))
  ) {
    throw new TypeError(
      "Validation-fee policy mode, amount, exemptions, and payout binding are inconsistent.",
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
    exemption_classes: exemptions,
    treasury_payout_binding: payoutBinding,
  };
};

export const normalizeGovernanceProposalKind = (
  raw: unknown,
): GovernanceProposalKind => {
  const envelope = exactRecord(
    raw,
    ["kind", "payload"],
    "Governance proposal kind",
  );
  if (!isRecord(envelope.payload)) {
    throw new TypeError("Governance proposal kind.payload must be an object.");
  }
  const payload = envelope.payload;
  if (envelope.kind === "ValidationFeePolicy") {
    const source = exactRecord(
      payload,
      ["payout_lifecycle_proposal_id", "policy", "proposal_operator"],
      "ValidationFeePolicy proposal payload",
    );
    const payoutLifecycleProposalId =
      source.payout_lifecycle_proposal_id === null
        ? null
        : fixedBytes32(
            source.payout_lifecycle_proposal_id,
            "ValidationFeePolicy proposal payload.payout_lifecycle_proposal_id",
          );
    const policy = normalizeValidationFeePolicy(source.policy);
    if (
      (policy.treasury_payout_binding !== null) !==
      (payoutLifecycleProposalId !== null)
    ) {
      throw new TypeError(
        "ValidationFeePolicy must bind a payout lifecycle exactly when its payout binding is present.",
      );
    }
    return {
      type: "ValidationFeePolicy",
      proposalOperator: requiredText(
        source.proposal_operator,
        "ValidationFeePolicy proposal payload.proposal_operator",
      ),
      policy,
      payoutLifecycleProposalId,
      raw: envelope,
    };
  }
  if (envelope.kind === "ValidationFeePayoutLifecycle") {
    const source = exactRecord(
      payload,
      ["payout_binding", "proposal_operator"],
      "ValidationFeePayoutLifecycle proposal payload",
    );
    return {
      type: "ValidationFeePayoutLifecycle",
      proposalOperator: requiredText(
        source.proposal_operator,
        "ValidationFeePayoutLifecycle proposal payload.proposal_operator",
      ),
      payoutBinding: normalizeValidationFeePayoutBinding(source.payout_binding),
      raw: envelope,
    };
  }
  throw new TypeError(
    "The typed validation-fee proposal API returned a non-validation-fee ProposalKind.",
  );
};

export type GovernanceProposalIdResolver = (
  input: Readonly<{
    proposer: string;
    kind: GovernanceProposalKind;
  }>,
) => string;

interface NormalizedProposalRecord {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
}

const exactProposalStatus = (value: unknown): GovernanceProposalStatus => {
  switch (value) {
    case "Proposed":
    case "Rejected":
    case "Enacted":
    case "Superseded":
    case "ExecutionFailed":
      return value;
    default:
      throw new TypeError(
        "Governance proposal status is outside ValidationFeeProposalStatusV1.",
      );
  }
};

const normalizeProposalRecord = (
  raw: unknown,
  label: string,
  resolveProposalId: GovernanceProposalIdResolver,
): NormalizedProposalRecord => {
  const proposal = exactRecord(
    raw,
    ["created_height", "kind", "proposer", "status"],
    label,
  );
  const proposer = requiredText(proposal.proposer, `${label}.proposer`);
  const kind = normalizeGovernanceProposalKind(proposal.kind);
  if (kind.proposalOperator !== proposer) {
    throw new TypeError(
      `${label}.kind proposal_operator differs from the retained proposer.`,
    );
  }
  const rawProposalId = fixedBytes32(
    resolveProposalId({ proposer, kind }),
    `${label} native proposal fingerprint`,
  );
  return {
    summary: {
      proposalId: `0x${rawProposalId}`,
      proposer,
      createdHeight: exactJsonU64(
        proposal.created_height,
        `${label}.created_height`,
      ),
      status: exactProposalStatus(proposal.status),
      kindType: kind.type,
      kindLabelKey: GOVERNANCE_KIND_ADAPTERS[kind.type].labelKey,
    },
    kind,
  };
};

export const normalizeGovernanceProposalList = (
  raw: unknown,
  resolveProposalId: GovernanceProposalIdResolver,
): GovernanceProposalList => {
  const page = exactRecord(
    raw,
    ["limit", "next_cursor", "proposals", "version"],
    "Governance proposal list",
  );
  if (page.version !== 1) {
    throw new TypeError("Governance proposal list.version must be 1.");
  }
  const limit = exactJsonU32(page.limit, "Governance proposal list.limit");
  if (limit < 1 || limit > 100) {
    throw new TypeError(
      "Governance proposal list.limit must be between 1 and 100.",
    );
  }
  if (!Array.isArray(page.proposals) || page.proposals.length > limit) {
    throw new TypeError(
      "Governance proposal list.proposals must be bounded by limit.",
    );
  }
  const proposals = page.proposals.map((item, index) =>
    normalizeProposalRecord(
      item,
      `Governance proposal list.proposals[${index}]`,
      resolveProposalId,
    ),
  );
  const seen = new Set<string>();
  for (let index = 0; index < proposals.length; index += 1) {
    const current = proposals[index].summary;
    if (seen.has(current.proposalId)) {
      throw new TypeError("Governance proposal list contains a duplicate ID.");
    }
    seen.add(current.proposalId);
    if (index === 0) continue;
    const previous = proposals[index - 1].summary;
    if (
      previous.createdHeight > current.createdHeight ||
      (previous.createdHeight === current.createdHeight &&
        previous.proposalId >= current.proposalId)
    ) {
      throw new TypeError(
        "Governance proposal list must be ordered by created_height then native proposal fingerprint.",
      );
    }
  }
  const nextCursor =
    page.next_cursor === null
      ? null
      : typeof page.next_cursor === "string" &&
          LOWER_CURSOR_V1.test(page.next_cursor)
        ? page.next_cursor
        : (() => {
            throw new TypeError(
              "Governance proposal list.next_cursor must be null or the exact 96-character lowercase V1 cursor.",
            );
          })();
  if (nextCursor !== null && proposals.length === 0) {
    throw new TypeError(
      "Governance proposal list cannot advance from an empty page.",
    );
  }
  return {
    items: proposals.map(({ summary }) => summary),
    nextCursor,
    limit,
  };
};

const normalizeGovernanceCertificate = (
  raw: unknown,
  proposalId: string,
): GovernanceCertificateView | null => {
  if (raw === null) return null;
  throw new TypeError(
    `Governance certificate for proposal ${proposalId} is unavailable until the current public Iroha SDK exports its exact GovernanceCertificateV1 normalizer.`,
  );
};

export const normalizeGovernanceProposalDetail = (
  raw: unknown,
  proposalId: string,
  resolveProposalId: GovernanceProposalIdResolver,
): GovernanceProposalDetail => {
  const detail = exactRecord(
    raw,
    ["current_height", "governance_certificate", "proposal", "version"],
    "Governance proposal detail",
  );
  if (detail.version !== 1) {
    throw new TypeError("Governance proposal detail.version must be 1.");
  }
  const expectedId = canonicalGovernanceProposalId(proposalId);
  if (!expectedId) {
    throw new TypeError(
      "Requested governance proposal ID must be exact lowercase 32-byte hex.",
    );
  }
  const proposal = normalizeProposalRecord(
    detail.proposal,
    "Governance proposal detail.proposal",
    resolveProposalId,
  );
  if (proposal.summary.proposalId !== expectedId) {
    throw new TypeError(
      "Governance proposal detail does not match the requested native fingerprint.",
    );
  }
  const currentHeight = canonicalU64(
    detail.current_height,
    "Governance proposal detail.current_height",
  );
  if (BigInt(proposal.summary.createdHeight) > BigInt(currentHeight)) {
    throw new TypeError(
      "Governance proposal creation height exceeds current_height.",
    );
  }
  const governanceCertificate = normalizeGovernanceCertificate(
    detail.governance_certificate,
    expectedId,
  );
  if (
    governanceCertificate !== null &&
    BigInt(governanceCertificate.certifiedAtHeight) > BigInt(currentHeight)
  ) {
    throw new TypeError(
      "Governance certificate certification height exceeds current_height.",
    );
  }
  if (
    proposal.summary.status === "Enacted" &&
    (governanceCertificate === null ||
      BigInt(governanceCertificate.enactAtHeight) > BigInt(currentHeight))
  ) {
    throw new TypeError(
      "An enacted governance proposal requires a due certificate at or before current_height.",
    );
  }
  return {
    summary: proposal.summary,
    kind: proposal.kind,
    currentHeight,
    governanceCertificate,
    raw: detail,
  };
};

export const isCanonicalUnsignedDecimal = (
  value: string,
  options: { allowZero?: boolean } = {},
): boolean => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return false;
  return options.allowZero === true || !/^0(?:\.0+)?$/u.test(value);
};

export const VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS = 120_960n;

export const validationFeePolicyEnactmentTargetHeight = (
  effectiveHeight: string,
): string | null => {
  if (!/^(?:0|[1-9]\d*)$/u.test(effectiveHeight)) return null;
  const effective = BigInt(effectiveHeight);
  if (
    effective > MAX_U64 ||
    effective <= VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS
  ) {
    return null;
  }
  return (effective - VALIDATION_FEE_EXACT_ACTIVATION_DELAY_BLOCKS).toString();
};

export const validateValidationFeePolicy = (
  policy: ValidationFeePolicyPayload,
  payoutLifecycleProposalId: string,
): string[] => {
  try {
    const normalized = normalizeValidationFeePolicy(policy);
    const lifecycleId = payoutLifecycleProposalId.trim();
    const hasLifecycle = lifecycleId.length > 0;
    if (
      hasLifecycle &&
      (!canonicalValidationFeeHash(lifecycleId) || /^0{64}$/u.test(lifecycleId))
    ) {
      return [
        "Payout lifecycle proposal ID must be non-zero lowercase 32-byte hex.",
      ];
    }
    if ((normalized.treasury_payout_binding !== null) !== hasLifecycle) {
      return [
        "A payout lifecycle proposal ID is required exactly when the policy carries a payout binding.",
      ];
    }
    return [];
  } catch (error) {
    return [
      error instanceof Error
        ? error.message
        : "Validation-fee policy is outside the exact native V1 contract.",
    ];
  }
};
