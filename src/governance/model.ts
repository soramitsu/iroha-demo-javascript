export const GOVERNANCE_PIPELINE_STAGES = [
  "Admit",
  "Rules",
  "Agenda",
  "Study",
  "Review",
  "Jury",
  "Enact",
] as const;

export type GovernancePipelineStageName =
  (typeof GOVERNANCE_PIPELINE_STAGES)[number];

export type GovernanceProposalStatus =
  | "Proposed"
  | "Approved"
  | "Rejected"
  | "Enacted"
  | "Superseded"
  | "Unknown";

export type GovernanceReferendumStatus =
  | "Proposed"
  | "Open"
  | "Closed"
  | "Unknown";

export type GovernanceVotingMode = "Plain" | "Zk" | "Unknown";

export type GovernanceProposalKindId =
  | "DeployContract"
  | "RuntimeUpgrade"
  | "SccpRouteGovernance"
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy"
  | "Unknown";

export type GovernanceWritableProposalKindId =
  | "ValidationFeePayoutLifecycle"
  | "ValidationFeePolicy";

export type GovernanceParliamentDecision = "approve" | "reject" | "abstain";

export const GOVERNANCE_PARLIAMENT_BODIES = [
  "rules-committee",
  "agenda-council",
  "interest-panel",
  "review-panel",
  "policy-jury",
  "oversight-committee",
  "fma-committee",
] as const;

export type GovernanceParliamentBody =
  (typeof GOVERNANCE_PARLIAMENT_BODIES)[number];

const normalizeParliamentBody = (
  value: string,
): GovernanceParliamentBody | null => {
  const compact = value
    .trim()
    .replace(/[_\s-]/gu, "")
    .toLowerCase();
  return (
    GOVERNANCE_PARLIAMENT_BODIES.find(
      (body) => body.replace(/-/gu, "") === compact,
    ) ?? null
  );
};

export interface GovernancePipelineStage {
  stage: GovernancePipelineStageName;
  startedAt: string;
  deadline: string | null;
  completedAt: string | null;
  failure: string | null;
}

export interface GovernanceParliamentRoster {
  body: GovernanceParliamentBody;
  members: string[];
  alternates: string[];
}

export interface GovernanceParliamentOutcome {
  body: GovernanceParliamentBody;
  approvals: string;
  rejections: string;
  abstentions: string;
  required: string;
  currentAccountDecision: GovernanceParliamentDecision | null;
}

export interface GovernanceReferendum {
  id: string;
  hStart: string;
  hEnd: string;
  status: GovernanceReferendumStatus;
  mode: GovernanceVotingMode;
}

export interface GovernanceTally {
  approve: string;
  reject: string;
  abstain: string;
  turnout: string;
  minTurnout: string;
  approvalThresholdNumerator: string;
  approvalThresholdDenominator: string;
  approved: boolean | null;
}

export interface GovernanceLock {
  owner: string;
  amount: string;
  expiryHeight: string;
  direction: string;
  durationBlocks: string;
}

interface GovernanceKindBase {
  type: GovernanceProposalKindId;
  raw: Record<string, unknown>;
}

export interface DeployContractGovernanceKind extends GovernanceKindBase {
  type: "DeployContract";
  contractAddress: string;
  codeHash: string;
  abiHash: string;
  abiVersion: string;
}

export interface RuntimeUpgradeGovernanceKind extends GovernanceKindBase {
  type: "RuntimeUpgrade";
  manifest: Record<string, unknown>;
}

export interface SccpRouteGovernanceKind extends GovernanceKindBase {
  type: "SccpRouteGovernance";
  action: Record<string, unknown>;
}

export interface ValidationFeeChargingModePayload {
  charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION";
  value: null;
}

export interface ValidationFeePolicyPayload {
  schema_version: number;
  chain_id: string;
  genesis_hash: string;
  policy_version: string;
  previous_policy_hash: string | null;
  ds_asset_id: string;
  ds_scale: number;
  fee: string;
  treasury_account_id: string;
  charging_mode: ValidationFeeChargingModePayload;
  effective_from_height: string;
  expires_after_height: string | null;
  exemption_classes: string[];
  treasury_payout_binding: Record<string, unknown> | null;
}

export interface ValidationFeeReferendumWindowPayload {
  lower: string;
  upper: string;
}

export interface ValidationFeePolicyGovernanceKind extends GovernanceKindBase {
  type: "ValidationFeePolicy";
  policy: ValidationFeePolicyPayload;
  policyHash: string | null;
}

export interface ValidationFeePayoutLifecycleGovernanceKind
  extends GovernanceKindBase {
  type: "ValidationFeePayoutLifecycle";
  payoutBinding: Record<string, unknown>;
}

export interface UnknownGovernanceKind extends GovernanceKindBase {
  type: "Unknown";
  variant: string;
}

export type GovernanceProposalKind =
  | DeployContractGovernanceKind
  | RuntimeUpgradeGovernanceKind
  | SccpRouteGovernanceKind
  | ValidationFeePayoutLifecycleGovernanceKind
  | ValidationFeePolicyGovernanceKind
  | UnknownGovernanceKind;

export interface GovernanceProposalSummary {
  proposalId: string;
  referendumId: string;
  proposer: string;
  createdHeight: string;
  status: GovernanceProposalStatus;
  referendumStatus: GovernanceReferendumStatus;
  votingMode: GovernanceVotingMode;
  kindType: GovernanceProposalKindId;
  kindLabelKey: string;
  currentStage: GovernancePipelineStageName;
}

export interface GovernanceProposalDetail {
  summary: GovernanceProposalSummary;
  kind: GovernanceProposalKind;
  referendum: GovernanceReferendum | null;
  tally: GovernanceTally | null;
  locks: GovernanceLock[];
  pipeline: GovernancePipelineStage[];
  parliamentRosters: GovernanceParliamentRoster[];
  parliamentOutcomes: GovernanceParliamentOutcome[];
  currentHeight: string | null;
  finalizationEvidence: Record<string, unknown> | null;
  enactedAtHeight: string | null;
  raw: Record<string, unknown>;
}

export interface GovernanceProposalList {
  items: GovernanceProposalSummary[];
  nextCursor: string | null;
}

export interface GovernanceProposalKindAdapter {
  id: GovernanceProposalKindId;
  labelKey: string;
  descriptionKey: string;
  composer:
    | "deploy"
    | "runtime"
    | "sccp"
    | "validation-fee-lifecycle"
    | "validation-fee"
    | null;
  readOnly: boolean;
}

export const GOVERNANCE_KIND_ADAPTERS: Readonly<
  Record<GovernanceProposalKindId, GovernanceProposalKindAdapter>
> = Object.freeze({
  DeployContract: {
    id: "DeployContract",
    labelKey: "Contract deployment",
    descriptionKey: "Deploy a reviewed IVM contract by immutable hashes.",
    composer: null,
    readOnly: true,
  },
  RuntimeUpgrade: {
    id: "RuntimeUpgrade",
    labelKey: "Runtime upgrade",
    descriptionKey: "Schedule a canonical runtime upgrade manifest.",
    composer: null,
    readOnly: true,
  },
  SccpRouteGovernance: {
    id: "SccpRouteGovernance",
    labelKey: "SCCP route",
    descriptionKey: "Apply one closed SCCP route-registry action.",
    composer: null,
    readOnly: true,
  },
  ValidationFeePayoutLifecycle: {
    id: "ValidationFeePayoutLifecycle",
    labelKey: "Validation fee payout lifecycle",
    descriptionKey:
      "Authorize the exact immutable treasury payout binding before proposing its fee policy.",
    composer: "validation-fee-lifecycle",
    readOnly: false,
  },
  ValidationFeePolicy: {
    id: "ValidationFeePolicy",
    labelKey: "Validation fee policy",
    descriptionKey:
      "Set the typed validation fee policy through citizen and Parliament approval.",
    composer: "validation-fee",
    readOnly: false,
  },
  Unknown: {
    id: "Unknown",
    labelKey: "Unknown proposal type",
    descriptionKey:
      "This wallet can inspect this proposal but cannot act on its payload.",
    composer: null,
    readOnly: true,
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const recordValue = (
  value: unknown,
  ...paths: readonly (readonly string[])[]
): Record<string, unknown> | null => {
  for (const path of paths) {
    let cursor: unknown = value;
    for (const part of path) {
      if (!isRecord(cursor)) {
        cursor = null;
        break;
      }
      cursor = cursor[part];
    }
    if (isRecord(cursor)) return cursor;
  }
  return null;
};

const firstValue = (
  value: Record<string, unknown> | null,
  ...keys: string[]
): unknown => {
  if (!value) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
};

const text = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return fallback;
};

const decimal = (value: unknown, fallback = "0"): string => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const normalized = String(value);
    if (/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(normalized)) {
      return normalized;
    }
  }
  throw new TypeError(
    "Governance decimal fields must be complete canonical decimals.",
  );
};

const integer = (value: unknown, fallback = "0"): string => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value)) {
    return value;
  }
  if (typeof value === "bigint" && value >= 0n) {
    return value.toString();
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new TypeError(
    "Governance integer fields must be complete canonical decimal integers.",
  );
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];

export const canonicalGovernanceProposalId = (
  value: unknown,
): string | null => {
  const literal = text(value).toLowerCase().replace(/^0x/u, "");
  return /^[0-9a-f]{64}$/u.test(literal) ? `0x${literal}` : null;
};

export const canonicalValidationFeeHash = (value: unknown): string | null =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) ? value : null;

const normalizeProposalStatus = (value: unknown): GovernanceProposalStatus => {
  const normalized = text(value).toLowerCase();
  if (normalized === "proposed") return "Proposed";
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "enacted") return "Enacted";
  if (normalized === "superseded") return "Superseded";
  return "Unknown";
};

const normalizeReferendumStatus = (
  value: unknown,
): GovernanceReferendumStatus => {
  const normalized = text(value);
  return normalized === "Proposed" ||
    normalized === "Open" ||
    normalized === "Closed"
    ? normalized
    : "Unknown";
};

const normalizeVotingMode = (value: unknown): GovernanceVotingMode => {
  const normalized = text(value).toLowerCase();
  if (normalized === "plain") return "Plain";
  if (normalized === "zk") return "Zk";
  return "Unknown";
};

const normalizeStageName = (
  value: unknown,
  fallback: GovernancePipelineStageName = "Admit",
): GovernancePipelineStageName => {
  const normalized = text(value);
  return (
    GOVERNANCE_PIPELINE_STAGES.find((stage) => stage === normalized) ?? fallback
  );
};

const kindEnvelope = (raw: unknown) => {
  const record = isRecord(raw) ? raw : {};
  const variantAliases: Record<string, string> = {
    DEPLOY_CONTRACT: "DeployContract",
    RUNTIME_UPGRADE: "RuntimeUpgrade",
    SCCP_ROUTE_GOVERNANCE: "SccpRouteGovernance",
    VALIDATION_FEE_POLICY: "ValidationFeePolicy",
    VALIDATION_FEE_PAYOUT_LIFECYCLE: "ValidationFeePayoutLifecycle",
  };
  const rawVariant = text(firstValue(record, "variant", "type", "kind"));
  const normalizedVariant = variantAliases[rawVariant] ?? rawVariant;
  if (normalizedVariant) {
    const payload =
      recordValue(record, ["payload"]) ??
      recordValue(record, ["raw"]) ??
      recordValue(record, ["deploy_contract"]) ??
      record;
    return { variant: normalizedVariant, payload, raw: record };
  }
  const entries = Object.entries(record);
  if (entries.length === 1) {
    const [variant, payloadValue] = entries[0];
    return {
      variant,
      payload: isRecord(payloadValue) ? payloadValue : {},
      raw: record,
    };
  }
  return { variant: "Unknown", payload: record, raw: record };
};

export const normalizeGovernanceProposalKind = (
  raw: unknown,
): GovernanceProposalKind => {
  const { variant, payload, raw: envelope } = kindEnvelope(raw);
  if (variant === "DeployContract") {
    const source =
      recordValue(envelope, ["deploy_contract"]) ??
      recordValue(payload, ["DeployContract"]) ??
      payload;
    return {
      type: "DeployContract",
      contractAddress: text(
        firstValue(source, "contract_address", "contractAddress"),
      ),
      codeHash: text(firstValue(source, "code_hash_hex", "codeHash")),
      abiHash: text(firstValue(source, "abi_hash_hex", "abiHash")),
      abiVersion: text(firstValue(source, "abi_version", "abiVersion"), "1"),
      raw: envelope,
    };
  }
  if (variant === "RuntimeUpgrade") {
    return {
      type: "RuntimeUpgrade",
      manifest:
        recordValue(payload, ["manifest"]) ??
        recordValue(envelope, ["raw", "manifest"]) ??
        payload,
      raw: envelope,
    };
  }
  if (variant === "SccpRouteGovernance" || variant === "SccpRouteManifest") {
    return {
      type: "SccpRouteGovernance",
      action:
        recordValue(envelope, ["sccp_route_governance"]) ??
        recordValue(payload, ["action"]) ??
        payload,
      raw: envelope,
    };
  }
  if (variant === "ValidationFeePolicy") {
    const policy = recordValue(payload, ["policy"]) ?? payload;
    return {
      type: "ValidationFeePolicy",
      policy: normalizeValidationFeePolicy(policy),
      policyHash:
        canonicalGovernanceProposalId(
          firstValue(payload, "policy_hash", "policyHash"),
        ) ?? null,
      raw: envelope,
    };
  }
  if (variant === "ValidationFeePayoutLifecycle") {
    return {
      type: "ValidationFeePayoutLifecycle",
      payoutBinding:
        recordValue(payload, ["payout_binding"]) ??
        recordValue(envelope, ["payout_binding"]) ??
        {},
      raw: envelope,
    };
  }
  return {
    type: "Unknown",
    variant,
    raw: envelope,
  };
};

export const normalizeValidationFeePolicy = (
  raw: unknown,
): ValidationFeePolicyPayload => {
  if (!isRecord(raw)) {
    throw new Error("Validation-fee policy must be an object.");
  }
  const policy = raw;
  const expectedKeys = [
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
  ];
  const actualKeys = Object.keys(policy).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `Validation-fee policy must contain exactly ${expectedKeys.join(", ")}.`,
    );
  }
  if (!isRecord(policy.charging_mode)) {
    throw new Error("Validation-fee charging mode must be an object.");
  }
  const chargingModeKeys = Object.keys(policy.charging_mode).sort();
  if (
    chargingModeKeys.length !== 2 ||
    chargingModeKeys[0] !== "charging_mode" ||
    chargingModeKeys[1] !== "value" ||
    policy.charging_mode.charging_mode !==
      "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
    policy.charging_mode.value !== null
  ) {
    throw new Error(
      "Validation-fee charging mode must be the exact enabled first-release mode.",
    );
  }
  const genesisHash = canonicalValidationFeeHash(policy.genesis_hash);
  const previousPolicyHash =
    policy.previous_policy_hash === null
      ? null
      : canonicalValidationFeeHash(policy.previous_policy_hash);
  if (
    !genesisHash ||
    (policy.previous_policy_hash !== null && !previousPolicyHash)
  ) {
    throw new Error(
      "Validation-fee policy hashes must be exact lowercase 32-byte hex.",
    );
  }
  if (
    policy.treasury_payout_binding !== null &&
    !isRecord(policy.treasury_payout_binding)
  ) {
    throw new Error(
      "Validation-fee treasury payout binding must be an object or null.",
    );
  }
  const exactNativeText = (value: unknown, label: string): string => {
    if (typeof value !== "string" || !value || value.trim() !== value) {
      throw new Error(`${label} must be canonical non-empty text.`);
    }
    return value;
  };
  const exactNativePositiveInteger = (
    value: unknown,
    label: string,
  ): string => {
    if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) {
      return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return String(value);
    }
    throw new Error(
      `${label} must be a complete canonical positive decimal integer.`,
    );
  };
  if (policy.schema_version !== 1) {
    throw new Error("Validation-fee policy schema version must be 1.");
  }
  if (
    typeof policy.ds_scale !== "number" ||
    !Number.isInteger(policy.ds_scale) ||
    policy.ds_scale < 0 ||
    policy.ds_scale > 0xff
  ) {
    throw new Error(
      "Validation-fee policy asset scale must be an exact uint8 JSON integer.",
    );
  }
  if (
    typeof policy.fee !== "string" ||
    !Array.isArray(policy.exemption_classes) ||
    policy.exemption_classes.some(
      (entry) => typeof entry !== "string" || entry.trim() !== entry,
    )
  ) {
    throw new Error(
      "Validation-fee policy must use the exact native V1 field types.",
    );
  }
  const chainId = exactNativeText(policy.chain_id, "Validation-fee chain ID");
  const policyVersion = exactNativePositiveInteger(
    policy.policy_version,
    "Validation-fee policy version",
  );
  const dsAssetId = exactNativeText(
    policy.ds_asset_id,
    "Validation-fee fee asset",
  );
  const treasuryAccountId = exactNativeText(
    policy.treasury_account_id,
    "Validation-fee treasury account",
  );
  const effectiveFromHeight = exactNativePositiveInteger(
    policy.effective_from_height,
    "Validation-fee effective height",
  );
  const expiresAfterHeight =
    policy.expires_after_height === null
      ? null
      : exactNativePositiveInteger(
          policy.expires_after_height,
          "Validation-fee expiry height",
        );
  return {
    schema_version: 1,
    chain_id: chainId,
    genesis_hash: genesisHash,
    policy_version: policyVersion,
    previous_policy_hash: previousPolicyHash,
    ds_asset_id: dsAssetId,
    ds_scale: policy.ds_scale,
    fee: policy.fee,
    treasury_account_id: treasuryAccountId,
    charging_mode: {
      charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
      value: null,
    },
    effective_from_height: effectiveFromHeight,
    expires_after_height: expiresAfterHeight,
    exemption_classes: [...policy.exemption_classes] as string[],
    treasury_payout_binding: policy.treasury_payout_binding,
  };
};

const normalizeReferendum = (
  raw: unknown,
  fallbackId: string,
): GovernanceReferendum | null => {
  if (!isRecord(raw)) return null;
  const window = recordValue(raw, ["window"]);
  const explicitStatus = firstValue(raw, "status");
  const inferredStatus =
    explicitStatus ??
    (raw.closed === true
      ? "Closed"
      : raw.opened === true
        ? "Open"
        : "Proposed");
  return {
    id: text(firstValue(raw, "referendum_id", "id"), fallbackId),
    hStart: integer(
      firstValue(raw, "h_start", "hStart") ?? firstValue(window, "lower"),
    ),
    hEnd: integer(
      firstValue(raw, "h_end", "hEnd") ?? firstValue(window, "upper"),
    ),
    status: normalizeReferendumStatus(inferredStatus),
    mode: normalizeVotingMode(firstValue(raw, "mode")),
  };
};

const normalizePipeline = (raw: unknown): GovernancePipelineStage[] => {
  const source = isRecord(raw) ? raw.stages : raw;
  const records = Array.isArray(source) ? source : [];
  const byStage = new Map<
    GovernancePipelineStageName,
    GovernancePipelineStage
  >();
  for (const item of records) {
    if (!isRecord(item)) continue;
    const stage = normalizeStageName(firstValue(item, "stage"));
    byStage.set(stage, {
      stage,
      startedAt: integer(firstValue(item, "started_at", "startedAt")),
      deadline:
        firstValue(item, "deadline") === undefined
          ? null
          : integer(firstValue(item, "deadline")),
      completedAt:
        firstValue(item, "completed_at", "completedAt") === undefined
          ? null
          : integer(firstValue(item, "completed_at", "completedAt")),
      failure:
        firstValue(item, "failure") === undefined
          ? null
          : text(firstValue(item, "failure")),
    });
  }
  return GOVERNANCE_PIPELINE_STAGES.map(
    (stage) =>
      byStage.get(stage) ?? {
        stage,
        startedAt: "0",
        deadline: null,
        completedAt: stage === "Admit" ? "0" : null,
        failure: null,
      },
  );
};

const currentPipelineStage = (
  pipeline: GovernancePipelineStage[],
): GovernancePipelineStageName => {
  const failed = pipeline.find((stage) => stage.failure);
  if (failed) return failed.stage;
  const pending = pipeline.find((stage) => !stage.completedAt);
  return pending?.stage ?? "Enact";
};

const normalizeRosters = (raw: unknown): GovernanceParliamentRoster[] => {
  const rosters =
    recordValue(raw, ["bodies", "rosters"]) ??
    recordValue(raw, ["bodies"]) ??
    recordValue(raw, ["rosters"]) ??
    {};
  return Object.entries(rosters)
    .flatMap(([body, value]) => {
      const normalizedBody = normalizeParliamentBody(body);
      if (!normalizedBody) return [];
      const roster = isRecord(value) ? value : {};
      return [
        {
          body: normalizedBody,
          members: stringList(firstValue(roster, "members")),
          alternates: stringList(firstValue(roster, "alternates")),
        },
      ];
    })
    .sort(
      (left, right) =>
        GOVERNANCE_PARLIAMENT_BODIES.indexOf(left.body) -
        GOVERNANCE_PARLIAMENT_BODIES.indexOf(right.body),
    );
};

const normalizeOutcomes = (raw: unknown): GovernanceParliamentOutcome[] => {
  const source = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
      ? raw.items
      : [];
  return source.flatMap((item) => {
    if (!isRecord(item)) return [];
    const body = normalizeParliamentBody(text(firstValue(item, "body")));
    if (!body) return [];
    const decision = text(
      firstValue(item, "current_account_decision", "currentAccountDecision"),
    ).toLowerCase();
    return [
      {
        body,
        approvals: integer(firstValue(item, "approve", "approvals")),
        rejections: integer(firstValue(item, "reject", "rejections")),
        abstentions: integer(firstValue(item, "abstain", "abstentions")),
        required: integer(firstValue(item, "required")),
        currentAccountDecision:
          decision === "approve" ||
          decision === "reject" ||
          decision === "abstain"
            ? decision
            : null,
      },
    ];
  });
};

const normalizeLocks = (raw: unknown): GovernanceLock[] => {
  const source = recordValue(raw, ["locks"]) ?? (isRecord(raw) ? raw : {});
  return Object.entries(source).flatMap(([key, value]) => {
    if (!isRecord(value)) return [];
    return [
      {
        owner: text(firstValue(value, "owner"), key),
        amount: decimal(firstValue(value, "amount")),
        expiryHeight: integer(
          firstValue(value, "expiry_height", "expiryHeight"),
        ),
        direction: text(firstValue(value, "direction")),
        durationBlocks: integer(
          firstValue(value, "duration_blocks", "durationBlocks"),
        ),
      },
    ];
  });
};

const normalizeTally = (raw: unknown): GovernanceTally | null => {
  const tally = recordValue(raw, ["tally"]) ?? (isRecord(raw) ? raw : null);
  if (!tally) return null;
  return {
    approve: integer(firstValue(tally, "approve")),
    reject: integer(firstValue(tally, "reject")),
    abstain: integer(firstValue(tally, "abstain")),
    turnout: integer(firstValue(tally, "turnout")),
    minTurnout: integer(firstValue(tally, "min_turnout", "minTurnout")),
    approvalThresholdNumerator: integer(
      firstValue(
        tally,
        "approval_threshold_numerator",
        "approvalThresholdNumerator",
      ),
    ),
    approvalThresholdDenominator: integer(
      firstValue(
        tally,
        "approval_threshold_denominator",
        "approvalThresholdDenominator",
      ),
    ),
    approved:
      typeof firstValue(tally, "approved") === "boolean"
        ? (firstValue(tally, "approved") as boolean)
        : null,
  };
};

const proposalRecordFrom = (raw: Record<string, unknown>) =>
  recordValue(raw, ["proposal", "proposal"]) ??
  recordValue(raw, ["proposal"]) ??
  raw;

const referendumRecordFrom = (raw: Record<string, unknown>) =>
  recordValue(raw, ["referendum", "referendum"]) ??
  recordValue(raw, ["referendum"]) ??
  recordValue(proposalRecordFrom(raw), ["referendum"]);

const normalizeSummaryFromRecord = (
  raw: Record<string, unknown>,
  proposalIdFallback = "",
): GovernanceProposalSummary => {
  const proposal = proposalRecordFrom(raw);
  const referendum = referendumRecordFrom(raw);
  const normalizedReferendum = normalizeReferendum(
    referendum,
    canonicalGovernanceProposalId(proposalIdFallback)?.replace(/^0x/u, "") ??
      "",
  );
  const proposalId =
    canonicalGovernanceProposalId(
      firstValue(raw, "proposal_id", "proposalId", "id"),
    ) ??
    canonicalGovernanceProposalId(proposalIdFallback) ??
    "";
  const referendumId = text(
    firstValue(raw, "referendum_id", "referendumId"),
    proposalId.replace(/^0x/u, ""),
  );
  const kind = normalizeGovernanceProposalKind(
    firstValue(proposal, "kind", "proposal_kind", "proposalKind"),
  );
  const pipeline = normalizePipeline(firstValue(proposal, "pipeline"));
  return {
    proposalId,
    referendumId,
    proposer: text(firstValue(proposal, "proposer")),
    createdHeight: integer(
      firstValue(proposal, "created_height", "createdHeight"),
    ),
    status: normalizeProposalStatus(firstValue(proposal, "status")),
    referendumStatus:
      normalizedReferendum?.status ??
      normalizeReferendumStatus(firstValue(referendum, "status")),
    votingMode:
      normalizedReferendum?.mode ??
      normalizeVotingMode(firstValue(referendum, "mode")),
    kindType: kind.type,
    kindLabelKey: GOVERNANCE_KIND_ADAPTERS[kind.type].labelKey,
    currentStage: currentPipelineStage(pipeline),
  };
};

export const normalizeGovernanceProposalList = (
  raw: unknown,
): GovernanceProposalList => {
  const record = isRecord(raw) ? raw : {};
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.proposals)
      ? record.proposals
      : [];
  return {
    items: items.flatMap((item) =>
      isRecord(item) ? [normalizeSummaryFromRecord(item)] : [],
    ),
    nextCursor: text(firstValue(record, "next_cursor", "nextCursor")) || null,
  };
};

export const normalizeGovernanceProposalDetail = (
  raw: unknown,
  proposalIdFallback = "",
): GovernanceProposalDetail => {
  const record = isRecord(raw) ? raw : {};
  const proposal = proposalRecordFrom(record);
  const referendumId = text(
    firstValue(record, "referendum_id", "referendumId"),
    canonicalGovernanceProposalId(proposalIdFallback)?.replace(/^0x/u, "") ??
      "",
  );
  const pipeline = normalizePipeline(firstValue(proposal, "pipeline"));
  const summary = normalizeSummaryFromRecord(record, proposalIdFallback);
  const referendum = normalizeReferendum(
    referendumRecordFrom(record),
    referendumId,
  );
  summary.referendumId = referendum?.id || referendumId;
  summary.referendumStatus = referendum?.status ?? summary.referendumStatus;
  summary.votingMode = referendum?.mode ?? summary.votingMode;
  summary.currentStage = currentPipelineStage(pipeline);
  return {
    summary,
    kind: normalizeGovernanceProposalKind(
      firstValue(proposal, "kind", "proposal_kind", "proposalKind"),
    ),
    referendum,
    tally: normalizeTally(firstValue(record, "tally")),
    locks: normalizeLocks(firstValue(record, "locks")),
    pipeline,
    parliamentRosters: normalizeRosters(
      firstValue(proposal, "parliament_snapshot", "parliamentSnapshot"),
    ),
    parliamentOutcomes: normalizeOutcomes(
      firstValue(
        record,
        "body_progress",
        "parliament_outcomes",
        "parliamentOutcomes",
        "stage_ballots",
      ),
    ),
    currentHeight:
      firstValue(record, "current_height", "currentHeight") === undefined
        ? null
        : integer(firstValue(record, "current_height", "currentHeight")),
    finalizationEvidence:
      recordValue(proposal, ["finalization_evidence"]) ??
      recordValue(record, ["finalization_evidence"]),
    enactedAtHeight:
      firstValue(proposal, "enacted_at_height", "enactedAtHeight") === undefined
        ? null
        : integer(firstValue(proposal, "enacted_at_height", "enactedAtHeight")),
    raw: record,
  };
};

export const isAccountInParliamentRoster = (
  detail: GovernanceProposalDetail,
  accountId: string,
  body: string,
): boolean => {
  const normalizedAccount = accountId.trim();
  const roster = detail.parliamentRosters.find((item) => item.body === body);
  return Boolean(
    normalizedAccount && roster && roster.members.includes(normalizedAccount),
  );
};

export const activeParliamentBody = (
  detail: GovernanceProposalDetail,
): string | null => {
  const stageBody: Partial<Record<GovernancePipelineStageName, string>> = {
    Rules: "rules-committee",
    Agenda: "agenda-council",
    Study: "interest-panel",
    Review: "review-panel",
    Jury: "policy-jury",
    Enact: "oversight-committee",
  };
  const body = stageBody[detail.summary.currentStage];
  return body && detail.parliamentRosters.some((item) => item.body === body)
    ? body
    : null;
};

export const isReferendumPlainVoteOpen = (
  detail: GovernanceProposalDetail,
): boolean => {
  const referendum = detail.referendum;
  if (!referendum || referendum.status !== "Open") return false;
  if (referendum.mode !== "Plain") return false;
  if (!detail.currentHeight) return false;
  const current = BigInt(detail.currentHeight);
  return (
    current >= BigInt(referendum.hStart) && current <= BigInt(referendum.hEnd)
  );
};

export const plainBallotLockCoversReferendum = (
  detail: GovernanceProposalDetail,
  durationBlocks: string,
): boolean => {
  const referendum = detail.referendum;
  if (
    !referendum ||
    !detail.currentHeight ||
    !/^[1-9]\d*$/u.test(durationBlocks)
  ) {
    return false;
  }
  try {
    return (
      BigInt(detail.currentHeight) + BigInt(durationBlocks) >=
      BigInt(referendum.hEnd)
    );
  } catch {
    return false;
  }
};

export const isEnactActionable = (detail: GovernanceProposalDetail): boolean =>
  detail.summary.status === "Approved" && detail.referendum?.mode === "Plain";

export const assertPlainGovernanceProposalWrite = (
  detail: GovernanceProposalDetail,
): void => {
  if (detail.referendum?.mode !== "Plain") {
    throw new Error(
      "This release refuses governance writes for proposals without a PLAIN referendum.",
    );
  }
};

export const isCanonicalUnsignedDecimal = (
  value: string,
  options: { allowZero?: boolean } = {},
): boolean => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return false;
  if (options.allowZero) return true;
  return !/^0(?:\.0+)?$/u.test(value);
};

export const VALIDATION_FEE_MINIMUM_ACTIVATION_DELAY_BLOCKS = 120_960n;
export const VALIDATION_FEE_POLICY_ENACTMENT_DELAY_BLOCKS = 3_600n;
export const VALIDATION_FEE_POLICY_EFFECTIVE_OFFSET_BLOCKS =
  VALIDATION_FEE_MINIMUM_ACTIVATION_DELAY_BLOCKS +
  VALIDATION_FEE_POLICY_ENACTMENT_DELAY_BLOCKS;
/**
 * A proposal review can remain open for two minutes and submission/finality
 * consumes additional blocks. Keep five minutes of one-second Taira blocks
 * above Core's 600-block staging minimum so an explicitly signed window
 * cannot become stale during review.
 */
export const GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS = 300n;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

const canonicalU64 = (
  value: string | number | bigint,
  label: string,
  options: { positive?: boolean } = {},
): bigint => {
  const literal =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === "string"
          ? value
          : "";
  if (
    !/^(?:0|[1-9]\d*)$/u.test(literal) ||
    (options.positive && literal === "0")
  ) {
    throw new Error(`${label} must be a canonical uint64 integer.`);
  }
  const parsed = BigInt(literal);
  if (parsed > MAX_U64) {
    throw new Error(`${label} exceeds the uint64 range.`);
  }
  return parsed;
};

export const rebaseGovernanceReferendumWindow = (input: {
  currentHeight: string | number | bigint;
  minStagingBlocks: string | number | bigint;
  windowSpan: string | number | bigint;
  safetyMarginBlocks?: string | number | bigint;
}): ValidationFeeReferendumWindowPayload => {
  const currentHeight = canonicalU64(input.currentHeight, "Current height");
  const minStagingBlocks = canonicalU64(
    input.minStagingBlocks,
    "Minimum staging blocks",
    { positive: true },
  );
  const windowSpan = canonicalU64(input.windowSpan, "Referendum window span", {
    positive: true,
  });
  const safetyMarginBlocks = canonicalU64(
    input.safetyMarginBlocks ?? GOVERNANCE_PROPOSAL_REVIEW_SAFETY_MARGIN_BLOCKS,
    "Proposal review safety margin",
    { positive: true },
  );
  const lower = currentHeight + minStagingBlocks + safetyMarginBlocks;
  const upper = lower + windowSpan - 1n;
  if (lower > MAX_U64 || upper > MAX_U64) {
    throw new Error("Rebased referendum window exceeds the uint64 range.");
  }
  return {
    lower: lower.toString(),
    upper: upper.toString(),
  };
};

export const validationFeePolicyEffectiveHeight = (
  referendumWindowUpper: string,
): string | null => {
  if (!/^(?:0|[1-9]\d*)$/u.test(referendumWindowUpper)) return null;
  const upper = BigInt(referendumWindowUpper);
  const effective = upper + VALIDATION_FEE_POLICY_EFFECTIVE_OFFSET_BLOCKS;
  return upper <= MAX_U64 && effective <= MAX_U64 ? effective.toString() : null;
};

export const validationFeeMinimumEffectiveHeight = (
  referendumWindowUpper: string,
): string | null => {
  if (!/^(?:0|[1-9]\d*)$/u.test(referendumWindowUpper)) return null;
  const upper = BigInt(referendumWindowUpper);
  const minimum = upper + VALIDATION_FEE_MINIMUM_ACTIVATION_DELAY_BLOCKS;
  return upper <= MAX_U64 && minimum <= MAX_U64 ? minimum.toString() : null;
};

export type ValidationFeePolicyEnactmentTimingStatus =
  | "not-policy"
  | "unavailable"
  | "not-yet"
  | "ready"
  | "missed";

export interface ValidationFeePolicyEnactmentTiming {
  status: ValidationFeePolicyEnactmentTimingStatus;
  targetHeight: string | null;
  nextHeight: string | null;
  blocksRemaining: string | null;
}

export const validationFeePolicyEnactmentTiming = (
  detail: GovernanceProposalDetail,
): ValidationFeePolicyEnactmentTiming => {
  if (detail.kind.type !== "ValidationFeePolicy") {
    return {
      status: "not-policy",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const effectiveLiteral = detail.kind.policy.effective_from_height;
  const currentLiteral = detail.currentHeight;
  const referendumEndLiteral = detail.referendum?.hEnd;
  if (
    !/^[1-9]\d*$/u.test(effectiveLiteral) ||
    !currentLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(currentLiteral) ||
    !referendumEndLiteral ||
    !/^(?:0|[1-9]\d*)$/u.test(referendumEndLiteral)
  ) {
    return {
      status: "unavailable",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const effective = BigInt(effectiveLiteral);
  const current = BigInt(currentLiteral);
  const referendumEnd = BigInt(referendumEndLiteral);
  const expectedEffective =
    referendumEnd + VALIDATION_FEE_POLICY_EFFECTIVE_OFFSET_BLOCKS;
  if (
    effective > MAX_U64 ||
    current > MAX_U64 ||
    referendumEnd > MAX_U64 ||
    expectedEffective > MAX_U64 ||
    effective !== expectedEffective ||
    effective < VALIDATION_FEE_MINIMUM_ACTIVATION_DELAY_BLOCKS
  ) {
    return {
      status: "unavailable",
      targetHeight: null,
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const target = effective - VALIDATION_FEE_MINIMUM_ACTIVATION_DELAY_BLOCKS;
  if (current === MAX_U64) {
    return {
      status: "missed",
      targetHeight: target.toString(),
      nextHeight: null,
      blocksRemaining: null,
    };
  }
  const next = current + 1n;
  if (next < target) {
    return {
      status: "not-yet",
      targetHeight: target.toString(),
      nextHeight: next.toString(),
      blocksRemaining: (target - next).toString(),
    };
  }
  return {
    status: next === target ? "ready" : "missed",
    targetHeight: target.toString(),
    nextHeight: next.toString(),
    blocksRemaining: next === target ? "0" : null,
  };
};

export const validateValidationFeePolicy = (
  policy: ValidationFeePolicyPayload,
  referendumWindow: ValidationFeeReferendumWindowPayload,
  payoutLifecycleProposalId: string,
): string[] => {
  const errors: string[] = [];
  if (policy.schema_version !== 1) errors.push("Unsupported schema version.");
  if (!policy.chain_id.trim()) errors.push("Chain ID is required.");
  if (
    !canonicalValidationFeeHash(policy.genesis_hash) ||
    /^0+$/u.test(policy.genesis_hash)
  ) {
    errors.push("Genesis hash must be non-zero lowercase 32-byte hex.");
  }
  const policyVersionIsCanonical = /^[1-9]\d*$/u.test(policy.policy_version);
  if (
    !policyVersionIsCanonical ||
    BigInt(policy.policy_version || "0") > MAX_U64
  ) {
    errors.push("Policy version must be a positive integer.");
  }
  if (
    policyVersionIsCanonical &&
    policy.policy_version === "1" &&
    policy.previous_policy_hash !== null
  ) {
    errors.push("The initial policy must not bind a previous policy hash.");
  } else if (
    policy.policy_version !== "1" &&
    (!canonicalValidationFeeHash(policy.previous_policy_hash) ||
      /^0+$/u.test(policy.previous_policy_hash ?? ""))
  ) {
    errors.push("A successor policy must bind the previous policy hash.");
  }
  if (!policy.ds_asset_id.trim()) errors.push("Fee asset is required.");
  if (policy.ds_scale !== 2) {
    errors.push("Fee asset scale must be exactly 2.");
  }
  if (policy.fee !== "0.10") {
    errors.push("Enabled validation fee must be exactly 0.10 SBD.");
  }
  if (!policy.treasury_account_id.trim()) {
    errors.push("Treasury account is required.");
  }
  if (
    policy.charging_mode.charging_mode !==
      "PER_QUALIFYING_TRANSFER_INSTRUCTION" ||
    policy.charging_mode.value !== null
  ) {
    errors.push("Charging mode must be the enabled first-release mode.");
  }
  const lowerIsCanonical = /^[1-9]\d*$/u.test(referendumWindow.lower);
  const upperIsCanonical = /^[1-9]\d*$/u.test(referendumWindow.upper);
  if (!lowerIsCanonical || !upperIsCanonical) {
    errors.push(
      "Referendum window start and end are required positive integers.",
    );
  }
  const lower = lowerIsCanonical ? BigInt(referendumWindow.lower) : null;
  const upper = upperIsCanonical ? BigInt(referendumWindow.upper) : null;
  if (
    lower !== null &&
    upper !== null &&
    (lower > MAX_U64 || upper > MAX_U64)
  ) {
    errors.push("Referendum window exceeds the uint64 range.");
  } else if (lower !== null && upper !== null && upper < lower) {
    errors.push("Referendum window end must not be before its start.");
  }
  const minimumEffectiveHeight = validationFeeMinimumEffectiveHeight(
    referendumWindow.upper,
  );
  const effectiveHeightIsCanonical = /^[1-9]\d*$/u.test(
    policy.effective_from_height,
  );
  const effectiveHeight = effectiveHeightIsCanonical
    ? BigInt(policy.effective_from_height)
    : null;
  if (effectiveHeight === null || effectiveHeight > MAX_U64) {
    errors.push("Effective height must be a positive integer.");
  } else if (
    minimumEffectiveHeight === null ||
    effectiveHeight < BigInt(minimumEffectiveHeight)
  ) {
    errors.push(
      "Effective height must be at least 120,960 blocks after the referendum window ends.",
    );
  }
  if (policy.expires_after_height !== null) {
    const expiryIsCanonical = /^[1-9]\d*$/u.test(policy.expires_after_height);
    const expiry = expiryIsCanonical
      ? BigInt(policy.expires_after_height)
      : null;
    if (
      expiry === null ||
      expiry > MAX_U64 ||
      effectiveHeight === null ||
      expiry <= effectiveHeight
    ) {
      errors.push("Expiry height must be after the effective height.");
    }
  }
  const payoutEnabled = policy.treasury_payout_binding !== null;
  if (
    policy.exemption_classes.length !== (payoutEnabled ? 1 : 0) ||
    (payoutEnabled && policy.exemption_classes[0] !== "TREASURY_PAYOUT")
  ) {
    errors.push(
      "Only the exact TREASURY_PAYOUT exemption is allowed with a payout binding.",
    );
  }
  const lifecycleId = canonicalValidationFeeHash(
    payoutLifecycleProposalId.trim(),
  );
  if (payoutEnabled && (!lifecycleId || /^0+$/u.test(lifecycleId))) {
    errors.push(
      "A payout-enabled policy requires a non-zero lifecycle proposal ID.",
    );
  } else if (!payoutEnabled && payoutLifecycleProposalId.trim()) {
    errors.push(
      "A policy without a payout binding cannot select a lifecycle proposal.",
    );
  }
  return errors;
};
